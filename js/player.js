/* ============================================================================
 * player.js — ARIA : the player (Dr. Aryan).
 *
 * OWNS:    WASD movement, mouse look, sprint, crouch, head bob, collision
 *          against World colliders, stair climbing, flashlight + battery,
 *          hiding in lockers / under desks (E), hidden-passage use (E),
 *          debug floor teleport.
 * IMPORTS: THREE (CDN), CONFIG (config.js), World (scene.js),
 *          GameState (main.js — read at runtime only).
 * EXPORTS: Player { init, reset, update, teleport, state, onStep }
 *
 * Published to GameState.player each frame:
 *   x, y (feet), z, yaw, pitch, floor, crouching, sprinting, moving,
 *   noiseRadius (for the drone's hearing — Stage 2), battery, flashlightOn,
 *   prompt (string shown by the HUD), room (current room name)
 * ========================================================================== */

const Player = (function () {
  'use strict';

  const C = CONFIG;
  const P = C.PLAYER;
  const F = C.FLASHLIGHT;
  const H = C.BUILDING.FLOOR_H;
  const HD = C.HIDE;

  const S = {
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    vx: 0, vz: 0, speed: 0,
    eye: P.EYE_STAND,
    floor: 2,
    crouching: false, sprinting: false, moving: false,
    stepDist: 0, bobPhase: 0, bobAmp: 0,
    stamina: 1, winded: false,
    lightDeadT: 0, lightWas: false,        // the flashlight dies for a fixed time (Update 5)
    noiseRadius: 0,
    battery: F.BATTERY_MAX,
    flashlightOn: false,
    frozen: false,
    hiding: null,            // the hide spot object while hidden in a locker / under a desk
    hideYaw: 0, hideCool: 0,
    prompt: '',
    room: ''
  };

  const keys = {};
  let camera = null;
  let spot = null;
  let spotTarget = null;
  let lockEl = null;
  let onStep = null;
  let lastFloor = null;

  const anyDown = (list) => list.some(k => keys[k]);
  // true while the player may act: gameplay, or a playable cutscene (opening scenes 2 and 6)
  const canControl = () => GameState.state === 'PLAYING' || (GameState.state === 'CUTSCENE' && GameState.cutsceneControl);

  // ------------------------------------------------------------------ input
  function releaseLock() {
    if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (err) { /* ignore */ } }
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') releaseLock();          // Esc ALWAYS frees the cursor, whatever the game state
    if (!GameState) return;
    keys[e.code] = true;                 // held keys are tracked even in cutscenes (the vent crawl reads W)
    if (!canControl()) return;
    if (document.pointerLockElement === lockEl) e.preventDefault();
    if (e.repeat) return;
    if (P.KEYS.FLASHLIGHT.indexOf(e.code) >= 0) toggleFlashlight();
    if (P.KEYS.USE.indexOf(e.code) >= 0) useKey();
    if (C.DEBUG.ENABLED && GameState.state === 'PLAYING' && C.DEBUG.TELEPORT_KEYS[e.code] !== undefined) debugTeleport(C.DEBUG.TELEPORT_KEYS[e.code]);
  }

  function onKeyUp(e) { keys[e.code] = false; }

  function onMouseMove(e) {
    if (document.pointerLockElement !== lockEl || S.frozen || !canControl() || GameState.noteOpen) return;
    S.yaw -= e.movementX * P.MOUSE_SENS;
    S.pitch -= e.movementY * P.MOUSE_SENS;
    const pl = S.hiding ? HD.PITCH_LIMIT : P.PITCH_LIMIT;
    S.pitch = Math.max(-pl, Math.min(pl, S.pitch));
    if (S.hiding) S.yaw = Math.max(S.hideYaw - HD.YAW_LIMIT, Math.min(S.hideYaw + HD.YAW_LIMIT, S.yaw));
  }

  function clearKeys() { Object.keys(keys).forEach(k => { keys[k] = false; }); }

  // ------------------------------------------------------------------ flashlight
  function toggleFlashlight() {
    if (S.frozen || S.hiding || S.lightDeadT > 0) return;
    if (!S.flashlightOn && S.battery <= 0 && S.floor === -1) return;
    S.flashlightOn = !S.flashlightOn;
    if (GameState.emit) GameState.emit('flashlight', S.flashlightOn);
  }

  // The light dies for exactly `secs` seconds and then comes back on its own.
  function killLight(secs) {
    S.lightWas = S.flashlightOn; S.flashlightOn = false; S.lightDeadT = secs;
    if (GameState.emit) GameState.emit('light_die', {});
  }

  function updateFlashlight(dt, t) {
    if (S.lightDeadT > 0) {
      S.lightDeadT -= dt;
      spot.intensity = 0;
      if (S.lightDeadT <= 0) { S.lightDeadT = 0; S.flashlightOn = S.lightWas; if (GameState.emit) GameState.emit('light_return', {}); }
      return;
    }
    if (S.flashlightOn && S.floor === -1) {
      S.battery = Math.max(0, S.battery - F.BATTERY_DRAIN * dt);
      if (S.battery <= 0) S.flashlightOn = false;
    }
    let k = S.flashlightOn ? 1 : 0;
    if (k && S.floor === -1 && S.battery < F.BATTERY_LOW) {
      // buzzing / flickering on low battery
      const low = 1 - S.battery / F.BATTERY_LOW;
      k = Math.sin(t * F.LOW_FLICKER_RATE) * Math.sin(t * F.LOW_FLICKER_RATE * 2.7 + 1) > 0.9 - low * 1.1 ? 0.15 : 1 - low * 0.35;
    }
    spot.intensity = F.INTENSITY * k;
  }

  // ------------------------------------------------------------------ movement
  function canStand(fl, x, z) {
    if (World.blocked(fl, x, z, P.RADIUS)) return false;
    return World.groundHeight(x, z, S.y) !== null;
  }

  function move(dt) {
    const fwd = (anyDown(P.KEYS.FORWARD) ? 1 : 0) - (anyDown(P.KEYS.BACK) ? 1 : 0);
    const str = (anyDown(P.KEYS.RIGHT) ? 1 : 0) - (anyDown(P.KEYS.LEFT) ? 1 : 0);
    const sin = Math.sin(S.yaw), cos = Math.cos(S.yaw);
    let wx = -sin * fwd + cos * str;
    let wz = -cos * fwd - sin * str;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    S.crouching = anyDown(P.KEYS.CROUCH);
    // sprint with a stamina cap: holding Shift forever can never keep the player (or the game) in a sprint
    const wantSprint = !S.crouching && fwd > 0 && anyDown(P.KEYS.SPRINT);
    if (S.winded && S.stamina >= P.SPRINT_RESUME) S.winded = false;
    S.sprinting = wantSprint && !S.winded && S.stamina > 0;
    if (S.sprinting) {
      S.stamina -= dt / P.SPRINT_MAX_SECONDS;
      if (S.stamina <= 0) { S.stamina = 0; S.winded = true; S.sprinting = false; if (GameState.emit) GameState.emit('winded', {}); }
    } else S.stamina = Math.min(1, S.stamina + dt / P.SPRINT_RECOVER_SECONDS);
    const target = len === 0 ? 0 : (S.crouching ? P.CROUCH_SPEED : (S.sprinting ? P.SPRINT_SPEED : P.WALK_SPEED));

    const a = Math.min(1, P.ACCEL * dt);
    S.vx += (wx * target - S.vx) * a;
    S.vz += (wz * target - S.vz) * a;

    const fl = World.floorOf(S.y);
    const dx = S.vx * dt, dz = S.vz * dt;
    const ox = S.x, oz = S.z;
    if (canStand(fl, S.x + dx, S.z)) S.x += dx;
    if (canStand(fl, S.x, S.z + dz)) S.z += dz;

    const moved = Math.hypot(S.x - ox, S.z - oz);
    S.speed = moved / Math.max(dt, 1e-6);
    S.moving = S.speed > 0.25;

    // vertical (stairs)
    const gy = World.groundHeight(S.x, S.z, S.y);
    if (gy !== null) {
      if (Math.abs(gy - S.y) > 1.5) S.y = gy;
      else S.y += (gy - S.y) * Math.min(1, P.Y_LERP * dt);
    }

    // footsteps + bob
    const stride = S.crouching ? P.STEP_STRIDE.CROUCH : (S.sprinting ? P.STEP_STRIDE.SPRINT : P.STEP_STRIDE.WALK);
    if (S.moving) {
      S.stepDist += moved;
      S.bobPhase += (moved / stride) * Math.PI;
      if (S.stepDist >= stride) {
        S.stepDist -= stride;
        if (onStep) onStep(S);
      }
    }
    const ampTarget = !S.moving ? 0 : (S.crouching ? P.BOB.CROUCH : (S.sprinting ? P.BOB.SPRINT : P.BOB.WALK));
    S.bobAmp += (ampTarget - S.bobAmp) * Math.min(1, 8 * dt);

    S.noiseRadius = !S.moving ? P.NOISE_RADIUS.IDLE : (S.crouching ? P.NOISE_RADIUS.CROUCH : (S.sprinting ? P.NOISE_RADIUS.SPRINT : P.NOISE_RADIUS.WALK));
  }

  // ------------------------------------------------------------------ hiding
  const FACE = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
  const FACE_YAW = { n: Math.PI, s: 0, e: -Math.PI / 2, w: Math.PI / 2 };

  function rectDist(r, x, z) {
    const dx = Math.max(r.x1 - x, 0, x - r.x2), dz = Math.max(r.z1 - z, 0, z - r.z2);
    return Math.hypot(dx, dz);
  }

  function nearestHide() {
    let best = null, bd = P.RADIUS + HD.USE_DISTANCE;
    World.hideSpots.forEach(s => {
      if (s.floor !== S.floor) return;
      const d = rectDist(s.rect, S.x, S.z);
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }

  function enterHide(spot) {
    const f = FACE[spot.exitFace] || FACE.n;
    S.hiding = spot;
    S.hideCool = HD.ENTER_COOLDOWN;
    S.vx = S.vz = 0;
    S.crouching = false; S.sprinting = false; S.moving = false;
    S.flashlightOn = false;
    if (spot.type === 'desk') { S.x = spot.x + f[0] * (spot.d / 2 - 0.3); S.z = spot.z + f[1] * (spot.d / 2 - 0.3); }
    else { S.x = spot.x; S.z = spot.z; }
    S.hideYaw = FACE_YAW[spot.exitFace] !== undefined ? FACE_YAW[spot.exitFace] : 0;
    S.yaw = S.hideYaw; S.pitch = 0;
    if (GameState.emit) GameState.emit('hide_enter', spot);
  }

  function exitHide() {
    const spot = S.hiding;
    if (!spot || S.hideCool > 0) return;
    const order = [spot.exitFace, 'n', 's', 'e', 'w'];
    let placed = false;
    for (let i = 0; i < order.length && !placed; i++) {
      const f = FACE[order[i]];
      const ext = (order[i] === 'e' || order[i] === 'w') ? spot.w / 2 : spot.d / 2;
      const nx = spot.x + f[0] * (ext + HD.EXIT_OFFSET), nz = spot.z + f[1] * (ext + HD.EXIT_OFFSET);
      if (!World.blocked(S.floor, nx, nz, P.RADIUS)) { S.x = nx; S.z = nz; placed = true; }
    }
    S.hiding = null;
    S.eye = P.EYE_CROUCH;
    if (GameState.emit) GameState.emit('hide_exit', spot);
  }

  // closest inspectable item (sticky notes, computer, ...) in front of the player
  function nearestInspect() {
    if (S.hiding) return null;
    const ex = S.x, ey = S.y + S.eye, ez = S.z;
    const cp = Math.cos(S.pitch);
    const vx = -Math.sin(S.yaw) * cp, vy = Math.sin(S.pitch), vz = -Math.cos(S.yaw) * cp;
    let best = null, ba = C.INSPECT_ANGLE;
    World.interactables.forEach(it => {
      if (it.floor !== S.floor || it.disabled || !C.INSPECT[it.id]) return;
      const dx = it.x - ex, dy = it.floor * H + it.y - ey, dz = it.z - ez;
      const d = Math.hypot(dx, dy, dz);
      if (d > C.INSPECT_RADIUS) return;
      // whichever item is closest to where the player is looking
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * vx + dy * vy + dz * vz) / (d || 1))));
      if (ang < ba) { ba = ang; best = it; }
    });
    return best;
  }

  function inspectPrompt(ins) {
    const def = C.INSPECT[ins.id];
    if (def.crouch && !S.crouching) return def.crouchPrompt;
    return '[E] ' + ((GameState.state === 'PLAYING' && def.promptPlay) || def.prompt || 'Inspect');
  }

  function useKey() {
    if (S.frozen || GameState.noteOpen || performance.now() - (GameState.noteClosedAt || -1e9) < 250) return;
    if (S.hiding) { exitHide(); return; }
    const h = nearestHide();
    const hunted = (GameState.threat || 0) > 0.25;      // when ARIA is hunting you, E means hide
    if (h && hunted) { enterHide(h); return; }
    const it = nearestInspect();
    if (it) {
      const def = C.INSPECT[it.id];
      if (def.noWatch && typeof Drone !== 'undefined' && Drone.watching()) { if (GameState.emit) GameState.emit('access_denied', {}); if (typeof Items !== 'undefined') Items.toast(def.watchToast, 2.5); return; }
      if (def.crouch && !S.crouching) { if (GameState.emit) GameState.emit('access_denied', {}); if (typeof Items !== 'undefined') Items.toast(def.crouchToast, 2); return; }
      if (GameState.emit) GameState.emit('inspect', it.id);
      return;
    }
    if (h) { enterHide(h); return; }
    usePassage();
  }

  // ------------------------------------------------------------------ passages + teleport
  function nearestPassage() {
    let best = null, bd = P.PASSAGE_USE_RADIUS;
    World.passages.forEach(p => {
      [[p.a, p.b], [p.b, p.a]].forEach(pair => {
        const here = pair[0];
        if (here.floor !== S.floor) return;
        const d = Math.hypot(here.x - S.x, here.z - S.z);
        if (d < bd) { bd = d; best = { to: pair[1], label: p.label, down: pair[1].floor < S.floor, locked: pair[1].floor === -1 && !GameState.hasItem('maintenance_keycard') }; }
      });
    });
    return best;
  }

  function usePassage() {
    if (S.frozen || S.hiding) return;
    const p = nearestPassage();
    if (p && p.locked) { if (GameState.emit) GameState.emit('access_denied', {}); return; }      // hatch to the tunnels needs the keycard
    if (p) { if (GameState.emit) GameState.emit('ladder', p); teleport(p.to.floor, p.to.x, p.to.z); }
  }

  function teleport(floor, x, z, yaw) {
    S.floor = floor;
    S.x = x; S.z = z; S.y = floor * H;
    S.vx = S.vz = 0;
    S.hiding = null;
    if (yaw !== undefined) S.yaw = yaw;
    World.setActiveFloor(floor);
  }

  function debugTeleport(floor) {
    const sp = C.LAYOUT[String(floor)].spawn;
    teleport(floor, sp.x, sp.z, sp.yaw);
  }

  // ------------------------------------------------------------------ public
  function init(cam, el) {
    camera = cam;
    lockEl = el;
    camera.rotation.order = 'YXZ';

    spot = new THREE.SpotLight(F.COLOR, 0, F.DISTANCE, F.ANGLE, F.PENUMBRA, F.DECAY);
    spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0, -1);
    camera.add(spot);
    camera.add(spotTarget);
    spot.target = spotTarget;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);
    document.addEventListener('pointerlockchange', clearKeys);   // a key released while the lock was changing never sends keyup
    reset();
  }

  function reset() {
    const sp = P.SPAWN;
    S.battery = F.BATTERY_MAX;
    S.flashlightOn = false;
    S.lightDeadT = 0;
    S.stamina = 1; S.winded = false;
    S.hiding = null;
    S.eye = P.EYE_STAND;
    S.pitch = sp.pitch;
    clearKeys();
    teleport(sp.floor, sp.x, sp.z, sp.yaw);
    lastFloor = sp.floor;
  }

  function update(dt, t) {
    dt = Math.min(dt, P.MAX_DT);
    S.hideCool = Math.max(0, S.hideCool - dt);
    if (!S.frozen && canControl() && !S.hiding && !GameState.noteOpen) move(dt);
    else { S.moving = false; S.noiseRadius = 0; }

    const fl = World.floorOf(S.y);
    if (fl !== S.floor) {
      S.floor = fl;
      World.setActiveFloor(fl);
    }
    if (S.floor !== lastFloor) {
      if (S.floor === -1 && F.START_ON_IN_TUNNELS && S.battery > 0) S.flashlightOn = true;
      lastFloor = S.floor;
    }

    updateFlashlight(dt, t);

    // eye height + camera
    const eyeTarget = S.hiding ? (S.hiding.type === 'desk' ? HD.EYE_DESK : HD.EYE_LOCKER) : (S.crouching ? P.EYE_CROUCH : P.EYE_STAND);
    S.eye += (eyeTarget - S.eye) * Math.min(1, P.EYE_LERP * dt);
    const bob = Math.abs(Math.sin(S.bobPhase)) * S.bobAmp - S.bobAmp * 0.5;
    camera.position.set(S.x, S.y + S.eye + bob, S.z);
    camera.rotation.y = S.yaw;
    camera.rotation.x = S.pitch;
    // camera shake (door slams, shaking hands in the opening)
    const sh = GameState.shake || 0;
    if (sh > 0) {
      camera.position.x += (Math.random() - 0.5) * sh * 0.05;
      camera.position.y += (Math.random() - 0.5) * sh * 0.05;
      camera.rotation.z = (Math.random() - 0.5) * sh * 0.05;
      if (!GameState.shakeHold) GameState.shake = Math.max(0, sh - dt * 1.6);
    } else camera.rotation.z = 0;

    // contextual prompt
    const p = nearestPassage();
    const hs = S.hiding ? null : nearestHide();
    const ins = nearestInspect();
    const hunted = (GameState.threat || 0) > 0.25;
    S.prompt = GameState.noteOpen ? '' : S.hiding ? '[E] Leave hiding spot' : (ins && !(hs && hunted)) ? inspectPrompt(ins) : hs ? '[E] Hide' : p ? (p.locked ? 'MAINTENANCE ACCESS REQUIRED' : '[E] ' + p.label + (p.down ? ' (down)' : ' (up)')) : '';
    S.room = World.roomAt(S.floor, S.x, S.z);

    Object.assign(GameState.player, S);
  }

  return {
    init: init,
    reset: reset,
    update: update,
    teleport: teleport,
    releaseKeys: clearKeys,
    killLight: killLight,
    forwardHeld: function () { return anyDown(P.KEYS.FORWARD); },
    state: S,
    set onStep(fn) { onStep = fn; }
  };
})();
