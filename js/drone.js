/* ============================================================================
 * drone.js — ARIA : the drone (ARIA's body; voice lives in aria.js/dialogue.js).
 *
 * OWNS:    drone mesh (dark body, red eye, eye-beam light), per-floor patrol
 *          routes, A* navigation over the World collision data (so locked
 *          doors really block it), vision cone + line of sight + hearing,
 *          the state machine
 *            PATROL -> INVESTIGATE -> CHASE -> SEARCH -> (CHECK hiding spots)
 *          and following the player across floors.
 * IMPORTS: THREE (CDN), CONFIG, World (scene.js), Aria (aria.js),
 *          GameState + Main (main.js), Player state via GameState.player.
 * EXPORTS: Drone { init, update, spawn, placeFar, reset, sees, invalidateNav,
 *                  investigate, state (getter), data }
 *
 * The drone does not enter the basement tunnels (ARIA doesn't fully control
 * them yet): when the player goes down it despawns and reappears upstairs
 * after a delay once they come back up.
 * ========================================================================== */

const Drone = (function () {
  'use strict';

  const C = CONFIG;
  const D = C.DRONE;
  const H = C.BUILDING.FLOOR_H;
  const SH = C.STAIRS;

  const d = {
    x: 0, z: 0, floor: 2, yaw: 0, state: 'OFF',
    path: [], pi: 0, repathT: 0,
    patrolIdx: 0, pauseT: 0, scanT: 0,
    target: null, lastSeen: null,
    detectT: 0, loseT: 0, lookT: 0,
    searchT: 0, searchPhase: 0, spots: [], spotTarget: null, checkT: 0,
    stairT: 0, relocT: 0, offT: 0, pingT: 0,
    sweep: 0
  };

  let group = null, eyeMat = null, spot = null, spotTarget = null, eyeLight = null;
  let initialised = false;

  // ------------------------------------------------------------------ navigation
  const navCache = {};

  function invalidateNav() { Object.keys(navCache).forEach(k => { navCache[k] = new Map(); }); }

  function cellBlocked(f, i, j) {
    let m = navCache[f];
    if (!m) m = navCache[f] = new Map();
    const key = i * 1000 + j;
    let v = m.get(key);
    if (v !== undefined) return v;
    const x = i * D.NAV_CELL, z = j * D.NAV_CELL;
    const F = C.BUILDING.FOOTPRINT;
    v = x < F.x1 + 0.3 || x > F.x2 - 0.3 || z < F.z1 + 0.3 || z > F.z2 - 0.3 ||
      (x > -SH.X - 0.2 && x < SH.X + 0.2 && z > -SH.Z - 0.2 && z < SH.Z + 0.2) ||
      World.blocked(f, x, z, D.RADIUS);
    m.set(key, v);
    return v;
  }

  function freeNear(f, i, j) {
    if (!cellBlocked(f, i, j)) return [i, j];
    for (let r = 1; r <= 8; r++) {
      for (let a = -r; a <= r; a++) {
        const ring = [[a, -r], [a, r], [-r, a], [r, a]];
        for (let k = 0; k < 4; k++) if (!cellBlocked(f, i + ring[k][0], j + ring[k][1])) return [i + ring[k][0], j + ring[k][1]];
      }
    }
    return null;
  }

  function segClear(f, x1, z1, x2, z2, r) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.ceil(len / 0.2));
    for (let i = 1; i < n; i++) {
      const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      if (World.blocked(f, x, z, r)) return false;
      if (x > -SH.X - 0.1 && x < SH.X + 0.1 && z > -SH.Z - 0.1 && z < SH.Z + 0.1) return false;
    }
    return true;
  }

  // sight line (props and closed doors block it)
  function hasLOS(f, x1, z1, x2, z2) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.ceil(len / 0.3));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (World.blocked(f, x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0.02)) return false;
    }
    return true;
  }

  function findPath(f, sx, sz, tx, tz) {
    const cell = D.NAV_CELL;
    const s = freeNear(f, Math.round(sx / cell), Math.round(sz / cell));
    const g = freeNear(f, Math.round(tx / cell), Math.round(tz / cell));
    if (!s || !g) return null;
    const K = (i, j) => (i + 200) * 1000 + (j + 200);
    const gScore = new Map(), came = new Map(), closed = new Set();
    const heap = [];
    const push = (n) => {
      heap.push(n);
      let c = heap.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (heap[p].f <= heap[c].f) break; const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          let l = c * 2 + 1, r = l + 1, m = c;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === c) break;
          const t = heap[m]; heap[m] = heap[c]; heap[c] = t; c = m;
        }
      }
      return top;
    };
    const hf = (i, j) => { const dx = Math.abs(i - g[0]), dy = Math.abs(j - g[1]); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); };
    gScore.set(K(s[0], s[1]), 0);
    push({ i: s[0], j: s[1], f: hf(s[0], s[1]) });
    let found = false, exp = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (heap.length && exp++ < D.NAV_MAX_EXPANSIONS) {
      const n = pop();
      const nk = K(n.i, n.j);
      if (closed.has(nk)) continue;
      closed.add(nk);
      if (n.i === g[0] && n.j === g[1]) { found = true; break; }
      const gn = gScore.get(nk);
      for (let k = 0; k < 8; k++) {
        const ni = n.i + dirs[k][0], nj = n.j + dirs[k][1];
        if (cellBlocked(f, ni, nj)) continue;
        if (k >= 4 && (cellBlocked(f, n.i + dirs[k][0], n.j) || cellBlocked(f, n.i, n.j + dirs[k][1]))) continue;
        const kk = K(ni, nj);
        if (closed.has(kk)) continue;
        const ng = gn + (k >= 4 ? 1.414 : 1);
        if (gScore.has(kk) && gScore.get(kk) <= ng) continue;
        gScore.set(kk, ng); came.set(kk, nk);
        push({ i: ni, j: nj, f: ng + hf(ni, nj) });
      }
    }
    if (!found) return null;
    const cells = [];
    let k = K(g[0], g[1]);
    while (k !== undefined) { cells.push([Math.floor(k / 1000) - 200, (k % 1000) - 200]); k = came.get(k); }
    cells.reverse();
    const pts = cells.map(c => [c[0] * cell, c[1] * cell]);
    // string-pulling
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !segClear(f, pts[a][0], pts[a][1], pts[b][0], pts[b][1], D.RADIUS * 0.95)) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }

  function goTo(x, z) {
    const p = findPath(d.floor, d.x, d.z, x, z);
    d.path = p || [];
    d.pi = d.path.length > 1 ? 1 : d.path.length;
    d.target = { x: x, z: z };
    return !!p;
  }

  // ------------------------------------------------------------------ movement
  function angDiff(a, b) {
    let x = b - a;
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x;
  }

  function turnTo(yaw, rate, dt) {
    const diff = angDiff(d.yaw, yaw);
    const step = rate * dt;
    d.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    return diff;
  }

  // returns true when the path is finished
  function follow(dt, speed, turnRate) {
    if (d.pi >= d.path.length) return true;
    const p = d.path[d.pi];
    const dx = p[0] - d.x, dz = p[1] - d.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.12) { d.pi++; return d.pi >= d.path.length; }
    const diff = turnTo(Math.atan2(-dx, -dz), turnRate, dt);
    const align = Math.max(0, 1 - Math.abs(diff) / 1.1);
    const step = Math.min(dist, speed * align * dt);
    d.x += (dx / dist) * step;
    d.z += (dz / dist) * step;
    return false;
  }

  // ------------------------------------------------------------------ perception
  function eyeYaw() { return d.yaw + d.sweep; }

  function sees(P) {
    P = P || GameState.player;
    if (d.state === 'OFF' || d.state === 'STAIRS' || d.state === 'HOLD' || P.floor !== d.floor || P.hiding) return false;
    const dx = P.x - d.x, dz = P.z - d.z;
    const dist = Math.hypot(dx, dz);
    const range = D.DETECT_RANGE * (P.crouching ? D.CROUCH_RANGE_MULT : 1);
    if (dist > range) return false;
    const near = dist < D.PROXIMITY_SENSE;
    if (!near) {
      const dir = Math.atan2(-dx, -dz);
      if (Math.abs(angDiff(eyeYaw(), dir)) > D.DETECT_HALF_ANGLE) return false;
    }
    return hasLOS(d.floor, d.x, d.z, P.x, P.z);
  }

  function emit(name, data) { if (GameState.emit) GameState.emit(name, data); }

  // ------------------------------------------------------------------ state changes
  function setState(s) { d.state = s; d.repathT = 0; }

  function startPatrol() {
    const route = D.PATROLS[String(d.floor)];
    if (!route) { setState('OFF'); return; }
    // head for the nearest waypoint
    let best = 0, bd = 1e9;
    route.points.forEach((p, i) => { const dd = Math.hypot(p[0] - d.x, p[1] - d.z); if (dd < bd) { bd = dd; best = i; } });
    d.patrolIdx = best;
    d.pauseT = 0;
    setState('PATROL');
    goTo(route.points[best][0], route.points[best][1]);
  }

  function startChase(P) {
    setState('CHASE');
    d.loseT = 0;
    d.lastSeen = { x: P.x, z: P.z };
    Aria.say('spot');
    emit('drone_spot', { floor: d.floor });
  }

  function startSearch() {
    setState('SEARCH');
    d.searchT = 0; d.searchPhase = 0; d.lookT = 0; d.spotTarget = null;
    d.spots = Aria.suspectSpots(d.floor, d.lastSeen);
    d.spots.sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z));
    emit('drone_lost', {});
    Aria.say('lose');
    goTo(d.lastSeen.x, d.lastSeen.z);
  }

  function investigate(x, z, floor) {
    if (d.state === 'CHASE' || d.state === 'OFF' || d.state === 'STAIRS' || d.state === 'CATCH') return;
    if (floor !== undefined && floor !== d.floor) return;
    if (d.state === 'INVESTIGATE' && d.target && Math.hypot(d.target.x - x, d.target.z - z) < 2.5) return;
    setState('INVESTIGATE');
    d.lookT = 0;
    goTo(x, z);
  }

  function place(floor, x, z, yaw) {
    d.floor = floor; d.x = x; d.z = z;
    if (yaw !== undefined) d.yaw = yaw;
    d.path = []; d.pi = 0;
  }

  // pick the patrol point on `floor` that is furthest from the player
  function placeFar(floor) {
    const P = GameState.player;
    const route = D.PATROLS[String(floor)];
    if (!route) return;
    let best = route.points[0], bd = -1;
    route.points.forEach(p => {
      const dd = P.floor === floor ? Math.hypot(p[0] - P.x, p[1] - P.z) : 99;
      if (dd > bd) { bd = dd; best = p; }
    });
    place(floor, best[0], best[1], d.yaw);
    startPatrol();
  }

  function spawn(floor, x, z, yaw) {
    place(floor, x, z, yaw);
    startPatrol();
  }

  function reset() {
    d.detectT = 0; d.loseT = 0;
    const P = GameState.player;
    if (P.floor === -1) { setState('OFF'); d.offT = 0; return; }
    placeFar(P.floor);
  }

  function despawn() { setState('OFF'); d.offT = 0; }

  // Cutscene helpers: park the drone motionless, then send it rolling toward a point.
  function hold(floor, x, z, yaw) {
    place(floor, x, z, yaw);
    d.sweep = 0;
    setState('HOLD');
  }

  function hide() { setState('OFF'); d.offT = -9999; }  // stays away until reset()/hold()

  function release(x, z) {
    setState('INVESTIGATE');
    d.lookT = 0;
    goTo(x, z);
  }

  // ------------------------------------------------------------------ main update
  function updateBrain(dt, t, P) {
    // player left the drone's floor
    if (P.floor === -1 && d.state !== 'OFF') { despawn(); return; }

    if (d.state === 'OFF') {
      if (P.floor !== -1) { d.offT += dt; if (d.offT > 6) placeFar(P.floor); }
      return;
    }

    if (d.state === 'STAIRS') {
      d.stairT += dt;
      if (P.floor === d.floor) { // player came back before the drone left
        setState('SEARCH'); d.searchT = 0; d.searchPhase = 0;
        goTo(d.lastSeen.x, d.lastSeen.z);
      } else if (d.stairT > D.STAIR_FOLLOW_DELAY) {
        const sp = C.LAYOUT[String(P.floor)].spawn;
        const alt = [sp.x - 8, sp.x + 8].sort((a, b) => Math.abs(b - P.x) - Math.abs(a - P.x))[0];
        const far = Math.hypot(sp.x - P.x, sp.z - P.z) > 6 ? sp.x : alt;
        place(P.floor, far, sp.z);
        d.lastSeen = { x: P.x, z: P.z };
        setState('SEARCH'); d.searchT = 0; d.searchPhase = 0; d.spots = [];
        goTo(d.lastSeen.x, d.lastSeen.z);
      }
      return;
    }

    if (d.state === 'CATCH' || d.state === 'HOLD') return;

    if (P.floor !== d.floor) {
      if (d.state === 'CHASE' || d.state === 'SEARCH' || d.state === 'INVESTIGATE') {
        d.lastSeen = d.lastSeen || { x: P.x, z: P.z };
        setState('STAIRS'); d.stairT = 0; return;
      }
      d.relocT += dt;
      if (d.relocT > D.RELOCATE_INTERVAL) { d.relocT = 0; placeFar(P.floor); }
    } else d.relocT = 0;

    const sawNow = sees(P);
    if (sawNow) d.detectT += dt; else d.detectT = Math.max(0, d.detectT - dt * 2);

    // hearing (patrol / investigate only)
    if ((d.state === 'PATROL' || d.state === 'INVESTIGATE') && P.floor === d.floor && !P.hiding && P.noiseRadius > 0) {
      const dist = Math.hypot(P.x - d.x, P.z - d.z);
      const los = hasLOS(d.floor, d.x, d.z, P.x, P.z);
      if (dist < P.noiseRadius * (los ? 1 : D.HEARING_THROUGH_WALLS)) investigate(P.x, P.z, P.floor);
    }

    if (d.state !== 'CHASE' && d.detectT >= D.DETECT_TIME) startChase(P);

    switch (d.state) {
      case 'PATROL': {
        const route = D.PATROLS[String(d.floor)];
        const speed = D.PATROL_SPEED * route.speedMult;
        if (d.pauseT > 0) {
          d.pauseT -= dt;
          d.sweep = Math.sin((D.PATROL_PAUSE - d.pauseT) * 3.2) * D.SCAN_SWEEP;
          if (d.pauseT <= 0) {
            d.sweep = 0;
            d.patrolIdx = (d.patrolIdx + 1) % route.points.length;
            const p = route.points[d.patrolIdx];
            goTo(p[0], p[1]);
          }
        } else if (follow(dt, speed, D.TURN_RATE)) d.pauseT = D.PATROL_PAUSE;
        break;
      }
      case 'INVESTIGATE': {
        if (d.lookT > 0) {
          d.lookT -= dt;
          d.sweep = Math.sin((D.SEARCH_LOOK_TIME - d.lookT) * 3.0) * 1.1;
          if (d.lookT <= 0) { d.sweep = 0; startPatrol(); }
        } else if (follow(dt, D.INVESTIGATE_SPEED, D.TURN_RATE * 1.4)) d.lookT = D.SEARCH_LOOK_TIME;
        break;
      }
      case 'CHASE': {
        d.sweep = 0;
        if (sawNow) { d.lastSeen = { x: P.x, z: P.z }; d.loseT = 0; } else d.loseT += dt;
        const dist = Math.hypot(P.x - d.x, P.z - d.z);
        if (P.floor === d.floor && !P.hiding && dist < D.CATCH_DISTANCE && (sawNow || dist < 0.7)) { caught(); return; }
        d.repathT -= dt;
        if (d.repathT <= 0) {
          d.repathT = D.REPATH_INTERVAL;
          goTo(d.lastSeen.x, d.lastSeen.z);
        }
        follow(dt, D.CHASE_SPEED, D.CHASE_TURN_RATE);
        if (d.loseT > D.LOSE_TIME) startSearch();
        break;
      }
      case 'SEARCH': {
        d.searchT += dt;
        if (d.searchT > D.SEARCH_MAX_TIME) { d.sweep = 0; startPatrol(); break; }
        if (d.searchPhase === 0) {
          if (follow(dt, D.SEARCH_SPEED, D.TURN_RATE * 1.5)) { d.searchPhase = 1; d.lookT = D.SEARCH_LOOK_TIME; }
        } else if (d.searchPhase === 1) {
          d.lookT -= dt;
          d.sweep = Math.sin((D.SEARCH_LOOK_TIME - d.lookT) * 3.0) * 1.2;
          if (d.lookT <= 0) { d.sweep = 0; d.searchPhase = 2; }
        } else if (d.searchPhase === 2) {
          if (!d.spotTarget) {
            if (!d.spots.length) { startPatrol(); break; }
            d.spotTarget = d.spots.shift();
            const ap = approachPoint(d.spotTarget);
            goTo(ap.x, ap.z);
            if (P.hiding && P.hiding.id === d.spotTarget.id) Aria.say('repeatHide');
            d.checkT = 0;
          } else if (d.checkT > 0) {
            d.checkT -= dt;
            if (d.checkT <= 0) {
              if (P.hiding && P.hiding.id === d.spotTarget.id) { caught(); return; }
              d.spotTarget = null;
            }
          } else if (follow(dt, D.SEARCH_SPEED * 1.2, D.TURN_RATE * 1.5)) d.checkT = D.CHECK_SPOT_TIME;
        }
        break;
      }
    }

    // ambient sonar ping (sound hook for Stage 5)
    d.pingT -= dt;
    if (d.pingT <= 0 && P.floor === d.floor) { d.pingT = d.state === 'CHASE' ? 0.9 : 2.6; emit('drone_ping', { dist: Math.hypot(P.x - d.x, P.z - d.z), state: d.state }); }
  }

  // point in front of a hiding spot, on the side the player would step out
  function approachPoint(s) {
    const off = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[s.exitFace] || [0, 1];
    const ext = s.type === 'desk' ? s.d / 2 : (off[0] ? s.w / 2 : s.d / 2);
    const m = ext + 0.9;
    return { x: s.x + off[0] * m, z: s.z + off[1] * m };
  }

  function caught() {
    setState('CATCH');
    d.path = [];
    if (typeof Main !== 'undefined' && Main.caught) Main.caught(d);
  }

  // ------------------------------------------------------------------ visuals
  function build() {
    group = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: D.BODY_COLOR });
    const dark = new THREE.MeshLambertMaterial({ color: 0x111214 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.3, 18), body);
    base.position.y = 0.3; group.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), body);
    dome.position.y = 0.45; group.add(dome);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 20), dark);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.46; group.add(ring);
    [-0.26, 0.26].forEach(x => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12), dark);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.15, 0.05); group.add(w);
    });
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 5), dark);
    ant.position.set(0.12, 1.0, 0.1); group.add(ant);
    eyeMat = new THREE.MeshBasicMaterial({ color: D.EYE_COLOR });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), eyeMat);
    eye.position.set(0, 0.68, -0.27); group.add(eye);

    spot = new THREE.SpotLight(D.EYE_COLOR, 0, D.EYE_LIGHT_DISTANCE, D.BEAM_ANGLE, 0.6, 1.5);
    spot.position.set(0, 0.68, -0.3);
    spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.3, -6);
    group.add(spot); group.add(spotTarget);
    spot.target = spotTarget;
    eyeLight = new THREE.PointLight(D.EYE_COLOR, 0, 4, 2);
    eyeLight.position.set(0, 0.7, -0.4);
    group.add(eyeLight);

    GameState.scene.add(group);
  }

  function updateVisuals(dt, t, P) {
    const show = d.state !== 'OFF' && d.state !== 'STAIRS' && Math.abs(d.floor - P.floor) <= 1;
    group.visible = show;
    const lit = show && d.floor === P.floor;
    const chase = d.state === 'CHASE';
    const pulse = chase ? 1 : 0.65 + 0.35 * Math.sin(t * 4);
    eyeMat.color.setHex(D.EYE_COLOR).multiplyScalar(lit || show ? (chase ? 1.25 : 0.55 + 0.45 * pulse) : 0);
    spot.intensity = lit ? D.EYE_LIGHT_INTENSITY * (chase ? 1.8 : 1) : 0;
    eyeLight.intensity = lit ? 0.8 * pulse : 0;
    spotTarget.position.set(Math.sin(d.sweep) * -6, 0.3, -6 * Math.cos(d.sweep));
    group.position.set(d.x, d.floor * H, d.z);
    group.rotation.y = d.yaw;
  }

  function init() {
    build();
    initialised = true;
    const s = D.START;
    spawn(s.floor, s.x, s.z, s.yaw);
  }

  function update(dt, t) {
    if (!initialised) return;
    const P = GameState.player;
    if (dt > 0 && GameState.state === 'PLAYING') updateBrain(dt, t, P);
    updateVisuals(dt, t, P);
  }

  return {
    init: init,
    update: update,
    spawn: spawn,
    hold: hold,
    hide: hide,
    release: release,
    placeFar: placeFar,
    reset: reset,
    sees: sees,
    invalidateNav: invalidateNav,
    investigate: investigate,
    hasLOS: hasLOS,
    findPath: findPath,
    data: d,
    get state() { return d.state; }
  };
})();
