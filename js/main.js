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
  let deadEl, deadT = 0, lastFloor = null;

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
      // Basic caught -> respawn flow. Stage 4 replaces this with the full death scene.
      enter: function () {
        deadT = C.DEATH.BASIC_FADE_TIME;
        Player.state.frozen = true;
        show(deadEl, true);
      }
    },
    ENDING: { enter: function () { /* Stage 4 */ } }
  };

  function respawn() {
    const cp = GameState.checkpoint || C.PLAYER.SPAWN;
    show(deadEl, false);
    Player.teleport(cp.floor, cp.x, cp.z, cp.yaw);
    Player.state.frozen = !(document.pointerLockElement === canvas);
    Aria.onRespawn();
    Drone.reset();
    GameState.state = 'PLAYING';
    show(pauseEl, Player.state.frozen);
  }

  // Called by the drone when it reaches the player (or opens their hiding spot).
  function caught() {
    if (GameState.state !== 'PLAYING') return;
    GameState.deaths++;
    GameState.emit('caught', { deaths: GameState.deaths });
    setState('DEAD');
  }

  // A new floor's landing becomes the respawn point.
  function updateCheckpoint() {
    const f = GameState.player.floor;
    if (f === lastFloor || GameState.state !== 'PLAYING') return;
    lastFloor = f;
    const sp = C.LAYOUT[String(f)].spawn;
    GameState.checkpoint = { floor: f, x: sp.x, z: sp.z, yaw: sp.yaw };
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

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!GameState.paused) GameState.time += dt;
    const t = GameState.time;

    const sdt = GameState.paused ? 0 : dt;
    Player.update(sdt, t);
    updateCheckpoint();
    Aria.update(sdt, t);
    Cutscenes.update(sdt, t);
    Dialogue.update(sdt, t);
    Drone.update(sdt, t);
    World.update(sdt, t, GameState.player);
    if (GameState.state === 'DEAD') { deadT -= dt; if (deadT <= 0) respawn(); }

    Hud.update(dt, t);
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
    deadEl = document.getElementById('dead');

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

  return { setState: setState, caught: caught, respawn: respawn };
})();
