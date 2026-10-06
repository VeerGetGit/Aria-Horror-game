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
  renderer: null,
  scene: null,
  camera: null,
  player: {},               // mirrored from Player.state every frame
  world: null,
  modules: {},              // later stages register themselves here
  threat: 0,                // 0..1, written by Aria, read by Hud / Sound
  cutsceneControl: false,   // true during the playable opening scenes (2 and 6)
  items: {},                // carried key items by id (lost on death): photo, ...
  hasItem: function (id) { return !!this.items[id]; },
  giveItem: function (id) { this.items[id] = true; this.emit('item_pickup', id); },
  clearItems: function () { Object.keys(this.items).forEach(k => { delete this.items[k]; }); this.emit('items_cleared', {}); },
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
  let endEl;
  let showFps = !!C.DEBUG.SHOW_FPS, showPos = !!C.DEBUG.SHOW_POSITION;   // F2 flips both
  let frameErrors = 0;

  const STATES = {
    MENU: { enter: function () { show(menuEl, true); show(pauseEl, false); } },
    CUTSCENE: {
      enter: function () {
        show(menuEl, false);
        lock();
        Cutscenes.playOpening(function () {
          setState('PLAYING');
          if (GameState.deaths > 0) retryLine();      // ARIA acknowledges the restart
        });
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
      // The gas death scene (cutscenes.js), then the whole run restarts from Scene 1.
      enter: function () {
        Player.state.frozen = true;
        // caught while the building burns: the fire stops, "Not yet, Doctor."; otherwise the full gas death scene
        if (World.fireOn) Cutscenes.playFireCaught(restartRun); else Cutscenes.playDeath(restartRun);
      }
    },
    ENDING: { enter: function () { Player.state.frozen = true; } }
  };

  // Core rule: ANY death restarts the whole run from Scene 1. No checkpoints, every item is lost.
  // The world, the drone's patrol routes and ARIA's memory of how you play stay exactly as they were.
  function restartRun() {
    GameState.clearItems();
    World.resetRun();
    Cutscenes.resetRun();
    Basement.resetRun();
    Atmos.resetRun();
    Scares.resetRun();
    Playstyle.resetRun();
    Sweep.resetRun();
    Aria.onRespawn();
    Drone.reset();
    Player.state.pitch = 0;
    GameState.paused = false; Player.state.frozen = false;
    setState('CUTSCENE');                      // the flashback, the calm office ... the whole opening again
  }

  function retryLine() {
    const n = GameState.deaths;
    const key = n <= 1 ? 'deathRetry1' : (n === 2 ? 'deathRetry2' : 'deathRetry3');
    Dialogue.say(C.DIALOGUE[key], 'retry', { force: true, interrupt: true });
  }

  // Called by the drone when it reaches the player (or opens their hiding spot).
  // The ventilation sweep finished and you were out in the open.
  function sweepDeath() {
    if (GameState.state !== 'PLAYING') return;
    GameState.deaths++;
    GameState.deathKind = 'sweep';
    GameState.emit('caught', { deaths: GameState.deaths });
    setState('DEAD');
  }

  function caught() {
    if (GameState.state !== 'PLAYING') return;
    GameState.deathKind = 'drone';
    GameState.deaths++;
    GameState.emit('caught', { deaths: GameState.deaths });
    setState('DEAD');
  }

  // After the credits: the end card.
  function endCard(kind) {
    if (document.exitPointerLock) document.exitPointerLock();
    document.getElementById('endcard-title').textContent = C.ENDINGS[kind].FINAL_TITLE;
    show(endEl, true);
  }

  function show(el, on) { if (el) el.classList.toggle('hidden', !on); }

  // Frees the cursor. Called on Esc, on any error, on pause and when leaving gameplay.
  function releaseLock() {
    if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
  }

  function setState(next) {
    GameState.state = next;
    if (next === 'MENU' || next === 'ENDING') releaseLock();
    if (STATES[next] && STATES[next].enter) STATES[next].enter();
  }

  function lock() {
    if (canvas.requestPointerLock) {
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(function () { releaseLock(); onLockChange(); });   // refused (no gesture): never leave a half-locked cursor
      } catch (e) { releaseLock(); }
    }
  }

  function onLockChange() {
    const locked = document.pointerLockElement === canvas;
    const active = GameState.state === 'PLAYING' || (GameState.state === 'CUTSCENE' && GameState.cutsceneControl);
    if (!locked) Player.releaseKeys();
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
    // Hidden by default. F2 reveals the FPS counter and the position / state readout.
    if (infoEl && (showFps || showPos) && GameState.state === 'PLAYING') {
      const lines = [];
      if (showPos) {
        lines.push('FLOOR ' + p.floor + '  |  ' + (p.room || ''));
        lines.push('x ' + p.x.toFixed(1) + '  y ' + p.y.toFixed(1) + '  z ' + p.z.toFixed(1));
        lines.push((p.crouching ? 'CROUCH' : p.sprinting ? 'SPRINT' : p.moving ? 'WALK' : 'IDLE') + '  noise ' + p.noiseRadius + 'm  stamina ' + Math.round(p.stamina * 100) + '%');
        lines.push('Flashlight ' + (p.flashlightOn ? 'ON' : 'off') + '  battery ' + Math.round(p.battery) + '%');
        lines.push('Drone ' + Drone.state + ' (floor ' + Drone.data.floor + ')  threat ' + (GameState.threat || 0).toFixed(2) + '  deaths ' + GameState.deaths);
        if (C.DEBUG.ENABLED) lines.push('[1] F2  [2] F1  [3] Basement  [4] F3  [5] Ground');
      }
      if (showFps) lines.push(fps + ' fps');
      infoEl.textContent = lines.join('\n');
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
    Aria.update(sdt, t);
    Cutscenes.update(sdt, t);
    Dialogue.update(sdt, t);
    Drone.update(sdt, t);
    World.update(sdt, t, GameState.player);
    Hud.update(dt, t);
    Items.update(sdt);
    Basement.update(sdt);
    Atmos.update(sdt);
    Scares.update(sdt);
    Playstyle.update(sdt);
    Sweep.update(sdt);
    Sound.update(dt);
  }

  function loop() {
    requestAnimationFrame(loop);               // scheduled first: nothing below can stop the loop
    try {
      let dt = clock.getDelta();
      if (!(dt > 0) || !isFinite(dt)) dt = 0.016;
      dt = Math.min(dt, 0.1);
      step(dt);
      updateInfo(dt);
      GameState.renderer.render(GameState.scene, GameState.camera);
      frameErrors = 0;
    } catch (e) {
      // a frame failed: free the cursor so the player is never trapped, and keep the loop alive
      if (frameErrors++ === 0) { releaseLock(); if (window.console) console.error(e); }
    }
  }

  function init() {
    canvas = document.getElementById('game');
    infoEl = document.getElementById('debug-info');
    promptEl = document.getElementById('prompt');
    menuEl = document.getElementById('menu');
    pauseEl = document.getElementById('pause');
    beginBtn = document.getElementById('begin');
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
    Sound.init();
    Items.init();
    Basement.init();
    Atmos.init();
    Scares.init();
    Playstyle.init();
    Sweep.init();

    window.addEventListener('resize', onResize);
    document.addEventListener('pointerlockerror', function () { releaseLock(); onLockChange(); });
    window.addEventListener('error', releaseLock);                      // any uncaught error frees the cursor
    window.addEventListener('unhandledrejection', releaseLock);
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Escape') releaseLock();                           // Esc always frees the cursor
      if (e.code === 'F2' && !e.repeat) { e.preventDefault(); const on = !(showFps || showPos); showFps = showPos = on; }
    });
    document.addEventListener('pointerlockchange', onLockChange);
    beginBtn.addEventListener('click', function () { Sound.unlock(); setState('CUTSCENE'); });
    pauseEl.addEventListener('click', function () { lock(); });
    document.getElementById('version').textContent = 'v' + C.VERSION;

    clock = new THREE.Clock();
    setState('MENU');
    loop();
  }

  window.addEventListener('DOMContentLoaded', init);

  return { releaseLock: releaseLock, setState: setState, caught: caught, sweepDeath: sweepDeath, restartRun: restartRun, endCard: endCard, step: step };
})();
