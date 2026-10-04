/* ============================================================================
 * main.js — ARIA : entry point, game loop, state machine.
 *
 * OWNS:    GameState (the shared object every module talks through), renderer,
 *          camera, main loop, state machine
 *          MENU → CUTSCENE → PLAYING → DEAD → ENDING, pause-on-unlock,
 *          menu overlay, Stage-1 debug readout.
 * IMPORTS: THREE (CDN), CONFIG, World (scene.js), Player (player.js),
 *          Drone (drone.js), Aria (aria.js), Hud (hud.js),
 *          Dialogue (dialogue.js), Cutscenes (cutscenes.js).
 *          Later stages add: Sound — optional here (`typeof X !== 'undefined'`).
 * ========================================================================== */

const GameState = {
  state: 'MENU',            // MENU | CUTSCENE | PLAYING | DEAD | ENDING
  config: CONFIG,
  time: 0,
  paused: false,
  deaths: 0,
  checkpoint: null,         // set in Stage 4
  renderer: null,
  scene: null,
  camera: null,
  player: {},               // mirrored from Player.state every frame
  world: null,
  modules: {},              // later stages register themselves here
  threat: 0,                // 0..1, written by Aria, read by Hud / Sound
  cutsceneControl: false,   // true during the playable opening scenes (2 and 6)
  noteOpen: false,          // an inspect note is on screen
  noteClosedAt: -1e9,
  shake: 0, shakeHold: false,
  _listeners: {},
  on: function (name, fn) { (this._listeners[name] = this._listeners[name] || []).push(fn); },
  emit: function (name, data) { (this._listeners[name] || []).forEach(function (fn) { fn(data); }); }
};

const Main = (function () {
  'use strict';

  const C = CONFIG;
  let canvas, clock, infoEl, promptEl, menuEl, pauseEl, beginBtn;
  let fpsAcc = 0, fpsFrames = 0, fps = 0;
  let cpEl, endEl, cpTextT = 0;

  const STATES = {
    MENU: { enter: function () { show(menuEl, true); show(pauseEl, false); } },
    CUTSCENE: {
      enter: function () {
        show(menuEl, false);
        lock();
        Cutscenes.playOpening(function () { setState('PLAYING'); });
      }
    },
    PLAYING: {
      enter: function () {
        show(menuEl, false);
        lock();
        if (document.pointerLockElement !== canvas) {   // lock lost during the opening: wait for a click
          GameState.paused = true; Player.state.frozen = true; show(pauseEl, true);
        }
      }
    },
    DEAD: {
      // The full death scene (cutscenes.js), then back to the last checkpoint.
      enter: function () {
        Player.state.frozen = true;
        Cutscenes.playDeath(respawn);
      }
    },
    ENDING: { enter: function () { Player.state.frozen = true; } }
  };

  function respawn() {
    const cp = GameState.checkpoint || C.PLAYER.SPAWN;
    Player.teleport(cp.floor, cp.x, cp.z, cp.yaw);
    Player.state.pitch = 0;
    Player.state.battery = Math.max(Player.state.battery, C.FLASHLIGHT.BATTERY_MAX * 0.35);   // a little charge back
    Player.state.frozen = !(document.pointerLockElement === canvas);
    Aria.onRespawn();
    Drone.reset();
    GameState.state = 'PLAYING';
    show(pauseEl, Player.state.frozen);
    GameState.paused = Player.state.frozen;
    // her first words after you come back
    Dialogue.say(C.DIALOGUE[GameState.deaths === 2 ? 'deathRetry2' : 'deathRetry1'], 'retry', { force: true, interrupt: true });
  }

  // Called by the drone when it reaches the player (or opens their hiding spot).
  function caught() {
    if (GameState.state !== 'PLAYING') return;
    GameState.deaths++;
    GameState.emit('caught', { deaths: GameState.deaths });
    setState('DEAD');
  }

  // Walking near a checkpoint makes it the respawn point.
  function updateCheckpoint(dt) {
    if (cpTextT > 0) { cpTextT -= dt; if (cpTextT <= 0) show(cpEl, false); }
    if (GameState.state !== 'PLAYING') return;
    const P = GameState.player;
    for (let i = 0; i < C.CHECKPOINTS.length; i++) {
      const c = C.CHECKPOINTS[i];
      if (c.floor !== P.floor || Math.hypot(c.x - P.x, c.z - P.z) > c.r) continue;
      if (GameState.checkpoint && GameState.checkpoint.id === c.id) return;
      GameState.checkpoint = { id: c.id, floor: c.floor, x: c.x, z: c.z, yaw: c.yaw };
      cpEl.textContent = 'CHECKPOINT — ' + c.name.toUpperCase();
      show(cpEl, true); cpTextT = C.CHECKPOINT_TEXT_TIME;
      GameState.emit('checkpoint', c);
      return;
    }
  }

  // After the credits: the end card.
  function endCard(kind) {
    if (document.exitPointerLock) document.exitPointerLock();
    document.getElementById('endcard-title').textContent = C.ENDINGS[kind].FINAL_TITLE;
    show(endEl, true);
  }

  function show(el, on) { if (el) el.classList.toggle('hidden', !on); }

  function setState(next) {
    GameState.state = next;
    if (STATES[next] && STATES[next].enter) STATES[next].enter();
  }

  function lock() {
    if (canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch (e) { /* ignored */ }
    }
  }

  function onLockChange() {
    const locked = document.pointerLockElement === canvas;
    const active = GameState.state === 'PLAYING' || (GameState.state === 'CUTSCENE' && GameState.cutsceneControl);
    if (active) {
      GameState.paused = !locked;
      Player.state.frozen = !locked;
      show(pauseEl, !locked);
    }
  }

  function onResize() {
    GameState.renderer.setSize(window.innerWidth, window.innerHeight);
    GameState.camera.aspect = window.innerWidth / window.innerHeight;
    GameState.camera.updateProjectionMatrix();
  }

  function updateInfo(dt) {
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    const p = GameState.player;
    if (infoEl && C.DEBUG.SHOW_INFO && GameState.state === 'PLAYING') {
      infoEl.textContent =
        'FLOOR ' + p.floor + '  |  ' + (p.room || '') + '\n' +
        'x ' + p.x.toFixed(1) + '  y ' + p.y.toFixed(1) + '  z ' + p.z.toFixed(1) + '\n' +
        (p.crouching ? 'CROUCH' : p.sprinting ? 'SPRINT' : p.moving ? 'WALK' : 'IDLE') +
        '  noise ' + p.noiseRadius + 'm  |  ' + fps + ' fps\n' +
        'Flashlight ' + (p.flashlightOn ? 'ON' : 'off') + '  battery ' + Math.round(p.battery) + '%\n' +
        'Drone ' + Drone.state + ' (floor ' + Drone.data.floor + ')  threat ' + (GameState.threat || 0).toFixed(2) + '  deaths ' + GameState.deaths + '\n' +
        (C.DEBUG.ENABLED ? '[1] F2  [2] F1  [3] Basement  [4] F3  [5] Ground' : '');
      infoEl.classList.remove('hidden');
    } else if (infoEl) infoEl.classList.add('hidden');
    if (promptEl) {
      promptEl.textContent = p.prompt || '';
      promptEl.classList.toggle('hidden', !p.prompt || GameState.noteOpen || !(GameState.state === 'PLAYING' || GameState.cutsceneControl));
    }
  }

  // One simulation step (everything except drawing). Exported so tests can drive the real game logic.
  function step(dt) {
    if (!GameState.paused) GameState.time += dt;
    const t = GameState.time;
    const sdt = GameState.paused ? 0 : dt;
    Player.update(sdt, t);
    updateCheckpoint(sdt);
    Aria.update(sdt, t);
    Cutscenes.update(sdt, t);
    Dialogue.update(sdt, t);
    Drone.update(sdt, t);
    World.update(sdt, t, GameState.player);
    Hud.update(dt, t);
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    step(dt);
    updateInfo(dt);
    GameState.renderer.render(GameState.scene, GameState.camera);
  }

  function init() {
    canvas = document.getElementById('game');
    infoEl = document.getElementById('debug-info');
    promptEl = document.getElementById('prompt');
    menuEl = document.getElementById('menu');
    pauseEl = document.getElementById('pause');
    beginBtn = document.getElementById('begin');
    cpEl = document.getElementById('checkpoint');
    endEl = document.getElementById('endcard');
    document.getElementById('again').addEventListener('click', function () { location.reload(); });

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, C.RENDER.MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(C.RENDER.CLEAR_COLOR);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(C.RENDER.FOV, window.innerWidth / window.innerHeight, C.RENDER.NEAR, C.RENDER.FAR);
    scene.add(camera);

    GameState.renderer = renderer;
    GameState.scene = scene;
    GameState.camera = camera;
    GameState.world = World;

    World.init(scene);
    Player.init(camera, canvas);
    Aria.init();
    Drone.init();

    window.addEventListener('resize', onResize);
    document.addEventListener('pointerlockchange', onLockChange);
    beginBtn.addEventListener('click', function () { setState('CUTSCENE'); });
    pauseEl.addEventListener('click', function () { lock(); });
    document.getElementById('version').textContent = 'v' + C.VERSION;

    clock = new THREE.Clock();
    setState('MENU');
    loop();
  }

  window.addEventListener('DOMContentLoaded', init);

  return { setState: setState, caught: caught, respawn: respawn, endCard: endCard, step: step };
})();
