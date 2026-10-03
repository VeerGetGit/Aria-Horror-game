/* ============================================================================
 * aria.js — ARIA : the AI brain (she directs the drone and the building).
 *
 * OWNS:    - learning:  hiding spot used before  -> she checks it first;
 *                       same door/route taken twice -> she locks that door
 *          - door locking (and timed unlocking)
 *          - security cameras: rotating meshes with a visible red beam;
 *            being caught in a beam sends the drone to investigate
 *          - threat tracking (GameState.threat 0..1) used by the HUD
 *          - when she speaks (cooldowns); text goes to Dialogue (Stage 3) if
 *            it exists, otherwise to the basic Hud.subtitle fallback
 * IMPORTS: THREE (CDN), CONFIG, World (scene.js), Drone (drone.js),
 *          GameState (main.js), optional Dialogue / Hud.
 * EXPORTS: Aria { init, update, say, suspectSpots, onRespawn, debug }
 *
 * Events consumed (GameState.on): 'hide_enter', 'hide_exit'.
 * Events emitted  (GameState.emit): 'door_lock', 'door_unlock',
 *          'camera_alert', 'camera_click', 'aria_say'.
 * ========================================================================== */

const Aria = (function () {
  'use strict';

  const C = CONFIG;
  const A = C.ARIA;
  const CAM = C.CAMERAS;
  const B = C.BUILDING;
  const H = B.FLOOR_H;

  const PRIORITY = { spot: true, lose: true, repeatHide: true };

  const hideCounts = {};      // spot id -> completed uses
  const forced = {};          // spot id -> true (she watched you step in)
  const doorCounts = {};      // door id -> crossings
  const doorCool = {};
  const locks = [];           // {door, until}
  const cams = [];
  const zoneSeen = {};
  const lineLast = {};
  let lastSay = -999;
  let hideStart = 0;
  let prev = null;
  let threat = 0;
  let camAlertT = 0;
  let lockTimer = 0;

  function emit(name, data) { if (GameState.emit) GameState.emit(name, data); }

  // ------------------------------------------------------------------ speech
  function say(key, force) {
    const t = GameState.time;
    const prio = !!PRIORITY[key];
    if (!force && !prio && t - lastSay < A.SAY_COOLDOWN) return false;
    if (!force && lineLast[key] !== undefined && t - lineLast[key] < (prio ? 6 : A.LINE_COOLDOWN)) return false;
    let text = C.DIALOGUE[key];
    if (Array.isArray(text)) text = text[Math.floor(Math.random() * text.length)];
    if (!text) return false;
    lastSay = t; lineLast[key] = t;
    if (typeof Dialogue !== 'undefined' && Dialogue.say) Dialogue.say(text, key);
    else if (typeof Hud !== 'undefined' && Hud.subtitle) Hud.subtitle(text);
    emit('aria_say', { key: key, text: text });
    return true;
  }

  // ------------------------------------------------------------------ learning: hiding
  function onHideEnter(spot) {
    hideStart = GameState.time;
    // if the drone watched you climb in, she knows exactly where you are
    if (Drone.sees(GameState.player)) forced[spot.id] = true;
  }

  function onHideExit(spot) {
    if (GameState.time - hideStart > 1) hideCounts[spot.id] = (hideCounts[spot.id] || 0) + 1;
    delete forced[spot.id];
  }

  function suspectSpots(floor) {
    return World.hideSpots.filter(s => s.floor === floor && ((hideCounts[s.id] || 0) >= A.HIDE_REPEAT_COUNT || forced[s.id]));
  }

  // ------------------------------------------------------------------ learning: routes / doors
  function trackDoors(P, t) {
    if (!prev || prev.floor !== P.floor) { prev = { x: P.x, z: P.z, floor: P.floor }; return; }
    World.doors.forEach(dr => {
      if (dr.floor !== P.floor || dr.exit) return;
      let crossed = false;
      if (dr.axis === 'x') crossed = Math.abs(P.x - dr.x) < dr.w / 2 && (prev.z - dr.z) * (P.z - dr.z) < 0;
      else crossed = Math.abs(P.z - dr.z) < dr.w / 2 && (prev.x - dr.x) * (P.x - dr.x) < 0;
      if (crossed && t - (doorCool[dr.id] === undefined ? -999 : doorCool[dr.id]) > A.DOOR_COUNT_COOLDOWN) {
        doorCool[dr.id] = t;
        doorCounts[dr.id] = (doorCounts[dr.id] || 0) + 1;
      }
    });
    prev.x = P.x; prev.z = P.z;
  }

  function lockDoor(dr, t) {
    dr.setLocked(true);
    locks.push({ door: dr, until: t + A.DOOR_LOCK_DURATION });
    doorCounts[dr.id] = 0;
    Drone.invalidateNav();
    emit('door_lock', { door: dr });
  }

  function updateLocks(P, t) {
    for (let i = locks.length - 1; i >= 0; i--) {
      if (t >= locks[i].until) {
        locks[i].door.setLocked(false);
        emit('door_unlock', { door: locks[i].door });
        locks.splice(i, 1);
        Drone.invalidateNav();
      }
    }
    if (locks.length >= A.DOOR_LOCK_MAX_ACTIVE) return;
    const myRoom = World.roomIdAt(P.floor, P.x, P.z);
    for (let i = 0; i < World.doors.length; i++) {
      const dr = World.doors[i];
      if (dr.locked || dr.exit || dr.floor !== P.floor) continue;
      if ((doorCounts[dr.id] || 0) < A.ROUTE_REPEAT_COUNT) continue;
      if (Math.hypot(dr.x - P.x, dr.z - P.z) < A.DOOR_LOCK_MIN_DIST) continue;
      if (dr.owner === myRoom) continue; // never trap the player inside a room
      lockDoor(dr, t);
      break;
    }
  }

  function unlockAll() {
    locks.splice(0).forEach(l => l.door.setLocked(false));
    Drone.invalidateNav();
  }

  // ------------------------------------------------------------------ cameras
  function buildCameras() {
    const gm = new THREE.MeshLambertMaterial({ color: 0x25272b });
    const len = CAM.RANGE, rad = CAM.RANGE * Math.tan(CAM.HALF_ANGLE);
    CAM.LIST.forEach((c, i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), gm); g.add(body);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      lens.rotation.x = Math.PI / 2; lens.position.z = -0.25; g.add(lens);
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), gm); mount.position.set(0, 0.2, 0.1); g.add(mount);
      const geo = new THREE.ConeGeometry(rad, len, 20, 1, true);
      geo.translate(0, -len / 2, 0);
      geo.rotateX(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({ color: CAM.BEAM_COLOR, transparent: true, opacity: CAM.BEAM_OPACITY, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(geo, beamMat);
      beam.position.z = -0.3; g.add(beam);
      g.position.set(c.x, c.floor * H + B.CEIL_H - CAM.HEIGHT_BELOW_CEILING, c.z);
      World.groupOf(c.floor).add(g);
      cams.push({ cfg: c, group: g, beamMat: beamMat, phase: i * 1.7, cool: 0, alert: 0, yaw: c.yaw, lastDir: 0 });
    });
  }

  function updateCameras(dt, t, P) {
    cams.forEach(cm => {
      const sweep = Math.sin(t * CAM.SPEED + cm.phase);
      cm.yaw = cm.cfg.yaw + sweep * CAM.SWEEP;
      cm.group.rotation.y = cm.yaw;
      const dir = Math.sign(Math.cos(t * CAM.SPEED + cm.phase));
      if (dir !== cm.lastDir) { cm.lastDir = dir; if (P.floor === cm.cfg.floor) emit('camera_click', { x: cm.cfg.x, z: cm.cfg.z }); }
      cm.cool -= dt; cm.alert = Math.max(0, cm.alert - dt);
      cm.beamMat.opacity = CAM.BEAM_OPACITY * (1 + cm.alert * 2.5);
      if (P.floor !== cm.cfg.floor || P.hiding || cm.cool > 0) return;
      const dx = P.x - cm.cfg.x, dz = P.z - cm.cfg.z;
      const dist = Math.hypot(dx, dz);
      if (dist > CAM.RANGE) return;
      const dirTo = Math.atan2(-dx, -dz);
      let diff = dirTo - cm.yaw;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) > CAM.HALF_ANGLE) return;
      if (!Drone.hasLOS(P.floor, cm.cfg.x, cm.cfg.z, P.x, P.z)) return;
      cm.cool = A.CAMERA_ALERT_COOLDOWN; cm.alert = 1.2; camAlertT = 3;
      say('camera');
      Drone.investigate(P.x, P.z, P.floor);
      emit('camera_alert', { cam: cm.cfg });
    });
  }

  // ------------------------------------------------------------------ threat + zone lines
  function updateThreat(dt, P) {
    const dd = Drone.data;
    let target = 0;
    if (dd.state !== 'OFF') {
      if (dd.state === 'STAIRS') target = 0.4;
      else if (dd.floor === P.floor) {
        const dist = Math.hypot(dd.x - P.x, dd.z - P.z);
        const prox = Math.max(0, 1 - dist / 22);
        const base = { PATROL: 0.1, INVESTIGATE: 0.38, SEARCH: 0.5, CHASE: 0.82, CATCH: 1 }[dd.state] || 0;
        target = Math.min(1, base * (0.55 + 0.45 * prox) + prox * 0.4);
        if (dd.state === 'CHASE') target = Math.max(target, 0.8 + 0.2 * prox);
      }
    }
    if (camAlertT > 0) { camAlertT -= dt; target = Math.max(target, 0.5); }
    threat += (target - threat) * Math.min(1, dt * (target > threat ? 4 : A.THREAT_SMOOTH * 0.5));
    GameState.threat = threat;
  }

  function updateZones(P, t) {
    if (P.hiding) return;
    const quiet = (k, secs) => { if (zoneSeen[k] !== undefined && t - zoneSeen[k] < secs) return false; zoneSeen[k] = t; return true; };
    if (P.floor === 3 && World.roomIdAt(3, P.x, P.z) === 'server' && quiet('server', 90)) say('nearServer', true);
    if (P.floor === 0) {
      const ex = World.doors.find(d => d.exit);
      if (ex && Math.hypot(ex.x - P.x, ex.z - P.z) < A.NEAR_EXIT_RADIUS && quiet('exit', 90)) say('nearExit', true);
    }
  }

  // ------------------------------------------------------------------ public
  function init() {
    buildCameras();
    if (GameState.on) {
      GameState.on('hide_enter', onHideEnter);
      GameState.on('hide_exit', onHideExit);
    }
  }

  function update(dt, t) {
    const P = GameState.player;
    if (GameState.state !== 'PLAYING' || dt <= 0) { updateCameras(0, t, P); return; }
    trackDoors(P, t);
    lockTimer -= dt;
    if (lockTimer <= 0) { lockTimer = 0.5; updateLocks(P, t); }
    updateCameras(dt, t, P);
    updateThreat(dt, P);
    updateZones(P, t);
  }

  function onRespawn() {
    unlockAll();
    Object.keys(forced).forEach(k => delete forced[k]);
    threat = 0; camAlertT = 0; prev = null;
  }

  return {
    init: init,
    update: update,
    say: say,
    suspectSpots: suspectSpots,
    onRespawn: onRespawn,
    debug: { hideCounts: hideCounts, doorCounts: doorCounts, locks: locks, forced: forced }
  };
})();
