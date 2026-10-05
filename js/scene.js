/* ============================================================================
 * scene.js — ARIA : the Three.js world.
 *
 * OWNS:    every floor/room/wall mesh, stairwell, props (desks, lockers,
 *          bodies, blood), light fixtures + the pooled real lights, collision
 *          data, ground-height lookup, hidden passages, hide-spot registry.
 * IMPORTS: THREE (CDN global), CONFIG (config.js).
 * EXPORTS: World  { init, update, setActiveFloor, groundHeight, blocked,
 *                   roomAt, setLampMode, doors, hideSpots, passages,
 *                   interactables, flights }
 *
 * Collision model: per floor, a list of 2D axis-aligned rectangles
 * (x1,z1,x2,z2,active). Height model: flat floors, plus four ramped
 * stair flights inside the shaft (see groundHeight).
 * ========================================================================== */

const World = (function () {
  'use strict';

  const C = CONFIG;
  const B = C.BUILDING;
  const S = C.STAIRS;
  const L = C.LIGHTING;
  const H = B.FLOOR_H;
  const T = B.WALL_T;

  let scene = null;
  let rand = null;
  let ambient = null;
  let curFloor = null;
  let lastAssign = 0;

  const groups = {};        // floor -> THREE.Group
  const colliders = {};     // floor -> [{x1,z1,x2,z2,active}]
  const fixtures = [];      // every light fixture in the building
  const lightPool = [];     // the few real PointLights
  const blinkMats = [];     // server LED materials
  const flights = [];       // stair flights
  const doors = [];
  const hideSpots = [];
  const passages = [];
  const interactables = [];
  const roomsByFloor = {};
  const lampFixtures = [];
  const vitalsPanels = [];  // canvas wall screens that show the player's vitals (Stage 3)
  const calmObjs = { gore: [], blind: null, items: {} };   // items: carryable meshes by id (photo)
  let tagList = null;       // when set, decals created are collected here
  const fire = { on: false, t: 0, sprites: [] };                       // Ending B: the ground floor burns
  const ext = { group: null, active: false, t: 0, windows: [], flames: [], lights: [] };   // Ending B: the view from outside
  let blackoutOn = false;   // Ending A: ARIA is offline, everything dies
  const mats = {};
  const themeMats = {};
  const tex = {};

  // ------------------------------------------------------------------ utils
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rr = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  function lambert(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {}));
  }

  function makeTexture(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  function speckle(g, s, n, alpha) {
    for (let i = 0; i < n; i++) {
      const v = Math.floor(rand() * 255);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + alpha + ')';
      g.fillRect(rand() * s, rand() * s, 1 + rand() * 2, 1 + rand() * 2);
    }
  }

  function makeMaterials() {
    tex.wall = makeTexture(256, (g, s) => {
      g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, s, s);
      speckle(g, s, 2600, 0.10);
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 3;
      g.strokeRect(1, 1, s - 2, s - 2);
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
    });
    tex.floor = makeTexture(256, (g, s) => {
      g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, s, s);
      speckle(g, s, 3500, 0.12);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4;
      g.strokeRect(0, 0, s, s);
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    });
    tex.flame = (function () {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const g = c.getContext('2d');
      // a soft blob that is fully transparent before the texture edge (sprites stretch it into a flame)
      const gr = g.createRadialGradient(32, 78, 1, 32, 64, 31);
      gr.addColorStop(0, 'rgba(255,245,180,1)'); gr.addColorStop(0.25, 'rgba(255,170,50,0.92)');
      gr.addColorStop(0.55, 'rgba(220,70,10,0.45)'); gr.addColorStop(0.85, 'rgba(120,10,0,0.08)'); gr.addColorStop(1, 'rgba(120,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
      return new THREE.CanvasTexture(c);
    })();
    tex.hand = makeTexture(128, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = 'rgba(70,5,5,0.92)';
      g.beginPath(); g.ellipse(64, 84, 26, 30, 0, 0, 7); g.fill();
      const fingers = [[34, 52, -0.35, 30], [48, 38, -0.12, 36], [64, 34, 0, 38], [80, 38, 0.12, 34], [94, 56, 0.55, 26]];
      fingers.forEach(f => {
        g.save(); g.translate(f[0], f[1] + f[3] / 2); g.rotate(f[2]);
        g.beginPath(); g.ellipse(0, 0, 6, f[3] / 2 + 6, 0, 0, 7); g.fill(); g.restore();
      });
      g.fillStyle = 'rgba(70,5,5,0.5)';
      for (let i = 0; i < 14; i++) g.fillRect(40 + rand() * 40, 100 + rand() * 28, 3, 6 + rand() * 18);
    });
    tex.smear = makeTexture(128, (g, s) => {
      g.clearRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(' + (50 + rand() * 30) + ',4,4,' + (0.25 + rand() * 0.5) + ')';
        g.beginPath(); g.ellipse(64 + rand() * 30 - 15, 64 + rand() * 40 - 20, 6 + rand() * 20, 4 + rand() * 12, rand() * 3, 0, 7); g.fill();
      }
    });

    const wood = lambert(0x4a3220), metal = lambert(0x50555a), dark = lambert(0x1b1b1d);
    Object.assign(mats, {
      wood: wood,
      woodLight: lambert(0x6a5036),
      metal: metal,
      metalDark: lambert(0x2c3034),
      locker: lambert(0x4f5f58),
      fabric: lambert(0x3a3f4a),
      fabricRed: lambert(0x5a2a2a),
      plastic: lambert(0x777b80),
      white: lambert(0xb8b8b2),
      dark: dark,
      skin: lambert(0x9a7b66),
      pants: lambert(0x23242b),
      blood: new THREE.MeshLambertMaterial({ color: C.DECOR.BLOOD_COLOR, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      glass: new THREE.MeshBasicMaterial({ color: 0x6f8fa0, transparent: true, opacity: 0.14, depthWrite: false }),
      glassTank: new THREE.MeshLambertMaterial({ color: 0x4f9a6a, transparent: true, opacity: 0.35, depthWrite: false, emissive: 0x0d3a1c }),
      door: lambert(0x3c3a38),
      exitDoor: lambert(0x2a3a2c, { emissive: 0x061a08 }),
      stairs: lambert(0x4a4a48, { map: tex.floor }),
      pipe: lambert(0x4a4338),
      concrete: lambert(0x55554f, { map: tex.wall }),
      food: lambert(0x7a5a3a),
      cake: lambert(0xc9a0b0),
      cakeInner: lambert(0xe8d6a8),
      paper: lambert(0xc9c4b0),
      rack: lambert(0x1a1d24),
      cable: lambert(0x101012),
      screenOn: new THREE.MeshBasicMaterial({ color: L.SCREEN_COLOR }),
      screenDim: new THREE.MeshBasicMaterial({ color: 0x0a1614 }),
      fixtureBase: new THREE.MeshBasicMaterial({ color: 0x222222 }),
      handprint: new THREE.MeshLambertMaterial({ map: tex.hand, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      smear: new THREE.MeshLambertMaterial({ map: tex.smear, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
    });

    L.LED_BLINK_RATES.forEach(() => {
      const m = new THREE.MeshBasicMaterial({ color: L.LED_COLOR_ON });
      blinkMats.push(m);
    });

    Object.keys(C.THEMES).forEach(name => {
      const t = C.THEMES[name];
      const side = lambert(t.wall, { map: tex.wall });
      themeMats[name] = {
        wall: side,
        floor: lambert(t.floor, { map: tex.floor }),
        ceil: lambert(t.ceil, { map: tex.wall }),
        slab: null
      };
      themeMats[name].slab = [side, side, themeMats[name].floor, themeMats[name].ceil, side, side];
    });
  }

  // ------------------------------------------------------------------ geometry helpers
  function scaleUV(geo, w, h, d) {
    const uv = geo.attributes.uv;
    const k = 1 / B.TEXTURE_TILE;
    const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * faces[f][0] * k, uv.getY(i) * faces[f][1] * k);
      }
    }
    uv.needsUpdate = true;
  }

  // Box from min/max corners.
  function addBox(group, mat, x1, y1, z1, x2, y2, z2, tile) {
    const w = x2 - x1, h = y2 - y1, d = z2 - z1;
    const geo = new THREE.BoxGeometry(w, h, d);
    if (tile) scaleUV(geo, w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x1 + w / 2, y1 + h / 2, z1 + d / 2);
    group.add(m);
    return m;
  }

  function addCollider(f, x1, z1, x2, z2, active) {
    const c = { x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), active: active !== false };
    colliders[f].push(c);
    return c;
  }

  // ------------------------------------------------------------------ prop primitives
  // Centre-based box sitting at floor f (+ optional y offset). Adds a collider unless disabled.
  function pbox(f, x, z, w, h, d, mat, o) {
    o = o || {};
    const y0 = f * H + (o.y || 0);
    const m = addBox(groups[f], mat, x - w / 2, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2);
    if (o.rotY) m.rotation.y = o.rotY;
    if (o.collide !== false) addCollider(f, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    return m;
  }

  function pcyl(f, x, z, r, h, mat, o) {
    o = o || {};
    const geo = new THREE.CylinderGeometry(r, r, h, o.seg || 14);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, f * H + (o.y || 0) + h / 2, z);
    groups[f].add(m);
    if (o.collide !== false) addCollider(f, x - r, z - r, x + r, z + r);
    return m;
  }

  function facingRot(facing) {
    return { n: 0, s: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing] || 0;
  }

  function textTexture(lines, o) {
    o = o || {};
    const W = o.px || 256, Hh = Math.round(W * (o.h / o.w));
    const c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    const g = c.getContext('2d');
    g.fillStyle = o.bg || '#e8e08a'; g.fillRect(0, 0, W, Hh);
    if (o.border) { g.strokeStyle = o.border; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, Hh - 4); }
    g.fillStyle = o.color || '#222';
    g.font = (o.font || 'bold') + ' ' + (o.size || 24) + 'px ' + (o.family || 'Courier New, monospace');
    g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
    const lh = (o.size || 24) * 1.2;
    const y0 = Hh / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => g.fillText(ln, o.align === 'left' ? 12 : W / 2, y0 + i * lh));
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // Flat text plane on a wall (facing = direction the plane faces) or on the floor/desk (facing 'up').
  function textPlane(f, x, y, z, w, h, lines, facing, o) {
    const mat = new THREE.MeshLambertMaterial({ map: textTexture(lines, Object.assign({ w: w, h: h }, o || {})) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, f * H + y, z);
    if (facing === 'up') { m.rotation.x = -Math.PI / 2; m.rotation.z = (o && o.rotZ) || 0; }
    else m.rotation.y = facingRot(facing);
    groups[f].add(m);
    return m;
  }

  function bloodPool(f, x, z, r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18), mats.blood);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(1, rr(0.7, 1.2), 1);
    m.position.set(x, f * H + 0.012, z);
    groups[f].add(m);
    if (tagList) tagList.push(m);
  }

  function dragMark(f, x1, z1, x2, z2, width) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mats.blood);
    m.rotation.x = -Math.PI / 2; // long axis now along local Z
    const wrap = new THREE.Group();
    wrap.position.set((x1 + x2) / 2, f * H + 0.013, (z1 + z2) / 2);
    wrap.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    wrap.add(m);
    groups[f].add(wrap);
    // ragged edges
    for (let i = 0; i < 4; i++) bloodPool(f, x1 + (x2 - x1) * rand(), z1 + (z2 - z1) * rand(), rr(0.1, 0.22));
  }

  function handprint(f, x, y, z, facing, scale) {
    const s = scale || 0.26;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mats.handprint);
    m.position.set(x, f * H + y, z);
    m.rotation.y = facingRot(facing);
    m.rotation.z = rr(-0.5, 0.5);
    groups[f].add(m);
    if (tagList) tagList.push(m);
  }

  function smear(f, x, y, z, facing, w, h) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.smear);
    m.position.set(x, f * H + y, z);
    m.rotation.y = facingRot(facing);
    groups[f].add(m);
  }

  // ------------------------------------------------------------------ fixtures (lights)
  function addFixture(o) {
    const fx = {
      floor: o.floor, x: o.x, y: o.y, z: o.z,
      color: o.color, intensity: o.intensity, distance: o.distance,
      mode: o.mode || 'steady', mult: 1, on: true, next: rr(0, 2),
      mat: o.mat || null, baseColor: new THREE.Color(o.color), group: o.group || null, suppressed: false
    };
    if (o.visible !== false && !o.mat) {
      fx.mat = new THREE.MeshBasicMaterial({ color: o.color });
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.size ? o.size[0] : 0.7, 0.08, o.size ? o.size[1] : 0.22), fx.mat);
      m.position.set(o.x, o.y, o.z);
      groups[o.floor].add(m);
    }
    fixtures.push(fx);
    if (fx.group === 'lamp') lampFixtures.push(fx);
    return fx;
  }

  function ceilY(f) { return f * H + B.CEIL_H - 0.06; }

  function lightMode(chanceDead, chanceFlicker) {
    const r = rand();
    if (r < chanceDead) return 'dead';
    if (r < chanceDead + chanceFlicker) return 'flicker';
    return 'steady';
  }

  function updateFixtures(dt, t) {
    for (let i = 0; i < fixtures.length; i++) {
      const fx = fixtures[i];
      if (fx.mode === 'dead' || fx.suppressed) fx.mult = 0;
      else if (fx.mode === 'flicker') {
        if (t >= fx.next) {
          fx.on = !fx.on;
          const r = fx.on ? L.FLICKER_ON_TIME : L.FLICKER_OFF_TIME;
          fx.next = t + rr(r[0], r[1]);
          fx.mult = fx.on ? 1 : L.FLICKER_OFF_LEVEL * rand();
        }
      } else fx.mult = 0.94 + 0.06 * Math.sin(t * 3 + i);
      if (fx.mat) {
        const k = (fx.mode === 'dead' || fx.suppressed) ? 0.08 : Math.max(0.12, fx.mult);
        fx.mat.color.copy(fx.baseColor).multiplyScalar(k);
      }
    }
    for (let i = 0; i < blinkMats.length; i++) {
      const on = !blackoutOn && Math.sin(t * L.LED_BLINK_RATES[i] * 3.1 + i * 1.7) > -0.2;
      blinkMats[i].color.setHex(on ? L.LED_COLOR_ON : L.LED_COLOR_OFF);
    }
  }

  function assignLights(px, py, pz) {
    const wy = L.FIXTURE_DISTANCE_Y_WEIGHT;
    const scored = [];
    for (let i = 0; i < fixtures.length; i++) {
      const fx = fixtures[i];
      if (fx.mode === 'dead' || fx.suppressed) continue;
      const dx = fx.x - px, dy = (fx.y - py) * wy, dz = fx.z - pz;
      scored.push({ fx: fx, d: dx * dx + dy * dy + dz * dz });
    }
    scored.sort((a, b) => a.d - b.d);
    const top = scored.slice(0, lightPool.length).map(s => s.fx);
    const free = [];
    lightPool.forEach(p => { if (!p.fx || top.indexOf(p.fx) < 0) free.push(p); });
    top.forEach(fx => {
      if (lightPool.some(p => p.fx === fx)) return;
      const p = free.pop();
      if (!p) return;
      p.fx = fx; p.fade = 0;
      p.light.position.set(fx.x, fx.y - 0.2, fx.z);
      p.light.color.setHex(fx.color);
      p.light.distance = fx.distance;
    });
    free.forEach(p => { p.fx = null; });
  }

  // ------------------------------------------------------------------ walls / doors
  function addDoor(f, axis, c, at, w, owner, side, o) {
    o = o || {};
    const mat = o.exit ? mats.exitDoor : mats.door;
    const t = B.DOOR_LEAF_T;
    const mesh = axis === 'x'
      ? addBox(groups[f], mat, at - w / 2, f * H, c - t / 2, at + w / 2, f * H + B.DOOR_H, c + t / 2)
      : addBox(groups[f], mat, c - t / 2, f * H, at - w / 2, c + t / 2, f * H + B.DOOR_H, at + w / 2);
    const col = axis === 'x'
      ? addCollider(f, at - w / 2, c - T / 2, at + w / 2, c + T / 2, !!o.locked)
      : addCollider(f, c - T / 2, at - w / 2, c + T / 2, at + w / 2, !!o.locked);
    mesh.visible = !!o.locked;
    const door = {
      id: owner + '_' + side + '_' + Math.round(at),
      floor: f, owner: owner, axis: axis, x: axis === 'x' ? at : c, z: axis === 'x' ? c : at, w: w,
      locked: !!o.locked, exit: !!o.exit, mesh: mesh, collider: col,
      setLocked: function (v) { this.locked = v; this.mesh.visible = v; this.collider.active = v; }
    };
    doors.push(door);
    if (o.exit) {
      addFixture({ floor: f, x: axis === 'x' ? at : c - 0.6, y: f * H + 2.7, z: axis === 'x' ? c : at, color: 0x22ff66, intensity: 0.7, distance: 8, size: [0.9, 0.2], mode: 'steady' });
      interactables.push({ id: 'exit_door', floor: f, x: axis === 'x' ? at : c - 0.3, y: 1.4, z: axis === 'x' ? c : at });
      const signZ = axis === 'x' ? c : at;
      textPlane(f, c - 0.18, 2.6, signZ, 0.9, 0.3, ['EXIT'], 'w', { bg: '#0b3d1a', color: '#4dff7a', size: 34, family: 'Arial, sans-serif', px: 256 });
    }
    return door;
  }

  // axis 'x': wall runs along x at z=c; axis 'z': runs along z at x=c.
  function wallRun(f, th, axis, c, a, b, ops, owner) {
    const g = groups[f];
    const y0 = f * H, top = y0 + B.CEIL_H, hw = T / 2;
    a -= hw; b += hw;
    const sorted = (ops || []).slice().sort((p, q) => p.at - q.at);
    const solid = (s, e, ya, yb, collide) => {
      if (e - s < 0.001) return;
      if (axis === 'x') { addBox(g, th.wall, s, ya, c - hw, e, yb, c + hw, true); if (collide) addCollider(f, s, c - hw, e, c + hw); }
      else { addBox(g, th.wall, c - hw, ya, s, c + hw, yb, e, true); if (collide) addCollider(f, c - hw, s, c + hw, e); }
    };
    let cur = a;
    sorted.forEach(op => {
      const w = op.w || B.DOOR_W;
      const s = op.at - w / 2, e = op.at + w / 2;
      solid(cur, s, y0, top, true);
      if (op.type === 'window') {
        solid(s, e, y0, y0 + B.WINDOW_SILL, false);
        solid(s, e, y0 + B.WINDOW_TOP, top, false);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(e - s, B.WINDOW_TOP - B.WINDOW_SILL), mats.glass);
        gl.position.set(axis === 'x' ? op.at : c, y0 + (B.WINDOW_TOP + B.WINDOW_SILL) / 2, axis === 'x' ? c : op.at);
        if (axis === 'z') gl.rotation.y = Math.PI / 2;
        g.add(gl);
        if (axis === 'x') addCollider(f, s, c - hw, e, c + hw); else addCollider(f, c - hw, s, c + hw, e);
      } else {
        solid(s, e, y0 + B.DOOR_H, top, false);
        addDoor(f, axis, c, op.at, w, owner, op.side, op);
      }
      cur = e;
    });
    solid(cur, b, y0, top, true);
  }

  function opsFor(list, side) {
    const out = [];
    (list || []).forEach(d => { if (d.side === side) out.push({ at: d.at, w: d.w, type: 'door', side: side, exit: d.exit, locked: d.locked }); });
    return out;
  }
  function opsForWindows(list, side) {
    const out = [];
    (list || []).forEach(d => { if (d.side === side) out.push({ at: d.at, w: d.w, type: 'window', side: side }); });
    return out;
  }

  function buildRect(f, th, r, doorsList, windowsList, owner) {
    wallRun(f, th, 'x', r.z1, r.x1, r.x2, opsFor(doorsList, 's').concat(opsForWindows(windowsList, 's')), owner);
    wallRun(f, th, 'x', r.z2, r.x1, r.x2, opsFor(doorsList, 'n').concat(opsForWindows(windowsList, 'n')), owner);
    wallRun(f, th, 'z', r.x1, r.z1, r.z2, opsFor(doorsList, 'w').concat(opsForWindows(windowsList, 'w')), owner);
    wallRun(f, th, 'z', r.x2, r.z1, r.z2, opsFor(doorsList, 'e').concat(opsForWindows(windowsList, 'e')), owner);
  }

  // ------------------------------------------------------------------ slabs + stairs
  function buildSlab(level, th, hole) {
    const g = groups[Math.min(level, B.FLOOR_MAX)];
    const F = B.FOOTPRINT;
    const y2 = level * H, y1 = y2 - B.SLAB_T;
    const box = (x1, z1, x2, z2) => { if (x2 - x1 > 0.001 && z2 - z1 > 0.001) addBox(g, th.slab, x1, y1, z1, x2, y2, z2, true); };
    if (!hole) { box(F.x1, F.z1, F.x2, F.z2); return; }
    box(F.x1, F.z1, -S.X, F.z2);
    box(S.X, F.z1, F.x2, F.z2);
    box(-S.X, F.z1, S.X, -S.Z);
    box(-S.X, S.Z, S.X, F.z2);
  }

  function buildStairs() {
    const N = S.STEPS, dz = (2 * S.Z) / N;
    for (let fi = B.FLOOR_MIN; fi < B.FLOOR_MAX; fi++) {
      const dir = (fi & 1) ? 1 : -1;
      const cx = dir > 0 ? -S.COL_X : S.COL_X;
      flights.push({ fi: fi, dir: dir, cx: cx, baseY: fi * H });
      const g = groups[fi];
      for (let i = 0; i < N; i++) {
        const top = fi * H + ((i + 0.5) / N) * H;
        const zs = dir > 0 ? -S.Z + i * dz : S.Z - (i + 1) * dz;
        addBox(g, mats.stairs, cx - S.WIDTH / 2, fi * H, zs, cx + S.WIDTH / 2, top, zs + dz);
      }
    }
    // divider wall between the two columns, on every level
    for (let f = B.FLOOR_MIN; f <= B.FLOOR_MAX; f++) {
      const t = S.DIVIDER_T / 2;
      addBox(groups[f], mats.metalDark, -t, f * H, -S.Z, t, f * H + B.CEIL_H, S.Z);
      addCollider(f, -t, -S.Z, t, S.Z);
    }
  }

  // Height of walkable ground at (x,z) for a player whose feet are at y; null = blocked/void.
  function groundHeight(x, z, y) {
    if (x > -S.X && x < S.X && z > -S.Z && z < S.Z) {
      const left = x < 0;
      let best = null, bd = 1e9;
      for (let i = 0; i < flights.length; i++) {
        const fl = flights[i];
        if ((fl.cx < 0) !== left) continue;
        const t = fl.dir > 0 ? (z + S.Z) / (2 * S.Z) : (S.Z - z) / (2 * S.Z);
        const h = fl.baseY + t * H;
        const d = Math.abs(h - y);
        if (d < bd) { bd = d; best = h; }
      }
      return bd <= S.TOLERANCE ? best : null;
    }
    const lvl = Math.round(y / H) * H;
    return Math.abs(y - lvl) <= S.TOLERANCE ? lvl : null;
  }

  function floorOf(y) {
    return Math.max(B.FLOOR_MIN, Math.min(B.FLOOR_MAX, Math.round(y / H)));
  }

  function blocked(floor, x, z, r) {
    const list = colliders[floor];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.active && x > c.x1 - r && x < c.x2 + r && z > c.z1 - r && z < c.z2 + r) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ furniture
  function desk(f, x, z, w, d, o) {
    o = o || {};
    const g = groups[f], y0 = f * H;
    addBox(g, mats.wood, x - w / 2, y0 + 0.72, z - d / 2, x + w / 2, y0 + 0.78, z + d / 2);
    addBox(g, mats.wood, x - w / 2, y0, z - d / 2, x - w / 2 + 0.06, y0 + 0.72, z + d / 2);
    addBox(g, mats.wood, x + w / 2 - 0.06, y0, z - d / 2, x + w / 2, y0 + 0.72, z + d / 2);
    addBox(g, mats.woodLight, x - w / 2, y0 + 0.3, z - d / 2, x + w / 2, y0 + 0.72, z - d / 2 + 0.04);
    addCollider(f, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    if (o.hide) hideSpots.push({ id: 'desk_' + hideSpots.length, type: 'desk', floor: f, x: x, z: z, w: w, d: d, exitFace: o.exitFace || 'n', rect: { x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2 } });
  }

  function chair(f, x, z, rotY, fallen) {
    const g = new THREE.Group();
    g.position.set(x, f * H, z);
    g.rotation.y = rotY || 0;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), mats.fabric);
    seat.position.y = 0.46; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), mats.fabric);
    back.position.set(0, 0.74, -0.2); g.add(back);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), mats.metalDark);
    stem.position.y = 0.22; g.add(stem);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 8), mats.metalDark);
    base.position.y = 0.02; g.add(base);
    if (fallen) { g.rotation.x = Math.PI / 2 - 0.1; g.position.y = 0.25; }
    groups[f].add(g);
  }

  function monitor(f, x, z, facing, o) {
    o = o || {};
    const y0 = f * H + (o.y !== undefined ? o.y : 0.78);
    const rot = facingRot(facing);
    const wrap = new THREE.Group();
    wrap.position.set(x, y0, z); wrap.rotation.y = rot;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.16), mats.dark); stand.position.y = 0.025; wrap.add(stand);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), mats.dark); neck.position.y = 0.1; wrap.add(neck);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.04), mats.dark); frame.position.y = 0.38; wrap.add(frame);
    const screenMat = new THREE.MeshBasicMaterial({ color: o.color || L.SCREEN_COLOR });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.32), screenMat);
    scr.position.set(0, 0.38, 0.021); wrap.add(scr);
    groups[f].add(wrap);
    const off = { n: [0, 0.3], s: [0, -0.3], e: [0.3, 0], w: [-0.3, 0] }[facing] || [0, 0.3];
    addFixture({ floor: f, x: x + off[0], y: y0 + 0.4, z: z + off[1], color: o.color || L.SCREEN_COLOR, intensity: o.intensity || L.SCREEN_INTENSITY, distance: L.SCREEN_DISTANCE, mat: screenMat, mode: o.mode || 'steady' });
  }

  function locker(f, x, z, facing, hide) {
    const rot = facingRot(facing);
    const g = new THREE.Group();
    g.position.set(x, f * H, z); g.rotation.y = rot;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.9, 0.5), mats.locker); body.position.y = 0.95; g.add(body);
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.02), mats.dark);
      v.position.set(0, 1.6 + i * 0.06, 0.255); g.add(v);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), mats.metal); handle.position.set(0.18, 1.0, 0.27); g.add(handle);
    groups[f].add(g);
    const sw = (facing === 'e' || facing === 'w') ? 0.5 : 0.55, sd = (facing === 'e' || facing === 'w') ? 0.55 : 0.5;
    addCollider(f, x - sw / 2, z - sd / 2, x + sw / 2, z + sd / 2);
    if (hide !== false) hideSpots.push({ id: 'locker_' + hideSpots.length, type: 'locker', floor: f, x: x, z: z, w: sw, d: sd, exitFace: facing, rect: { x1: x - sw / 2, z1: z - sd / 2, x2: x + sw / 2, z2: z + sd / 2 } });
  }

  function shelf(f, x, z, w, d, h, rows, mat) {
    const g = groups[f], y0 = f * H;
    mat = mat || mats.metal;
    addBox(g, mat, x - w / 2, y0, z - d / 2, x - w / 2 + 0.05, y0 + h, z + d / 2);
    addBox(g, mat, x + w / 2 - 0.05, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2);
    for (let i = 0; i <= rows; i++) {
      const yy = y0 + 0.05 + (i * (h - 0.06)) / rows;
      addBox(g, mat, x - w / 2, yy, z - d / 2, x + w / 2, yy + 0.04, z + d / 2);
      if (i < rows && rand() < 0.8) {
        const bw = rr(0.2, Math.min(0.7, w - 0.2));
        addBox(g, rand() < 0.5 ? mats.paper : mats.fabricRed, x - w / 2 + 0.1 + rand() * (w - bw - 0.2), yy + 0.04, z - d / 2 + 0.05, x - w / 2 + 0.1 + bw, yy + 0.04 + rr(0.15, 0.35), z + d / 2 - 0.05);
      }
    }
    addCollider(f, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  function crate(f, x, z, s, o) {
    const m = pbox(f, x, z, s, s, s, mats.woodLight, { collide: !(o && o.noCollide), y: (o && o.y) || 0 });
    m.rotation.y = rr(-0.3, 0.3);
    return m;
  }

  function table(f, x, z, w, d, h) {
    const y0 = f * H, g = groups[f];
    addBox(g, mats.woodLight, x - w / 2, y0 + h, z - d / 2, x + w / 2, y0 + h + 0.06, z + d / 2);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(k => addBox(g, mats.metalDark, x + k[0] * (w / 2 - 0.08) - 0.04, y0, z + k[1] * (d / 2 - 0.08) - 0.04, x + k[0] * (w / 2 - 0.08) + 0.04, y0 + h, z + k[1] * (d / 2 - 0.08) + 0.04));
    addCollider(f, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  function body(f, x, z, rotY, pose, collide) {
    const g = new THREE.Group();
    g.position.set(x, f * H, z); g.rotation.y = rotY;
    const cloth = lambert(pick(C.DECOR.BODY_COLORS));
    const add = (geo, mat, px, py, pz, rx, ry, rz) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      g.add(m); return m;
    };
    if (pose === 'slumped') {
      add(new THREE.BoxGeometry(0.46, 0.6, 0.26), cloth, 0, 0.45, 0, -0.18, 0, 0);
      add(new THREE.SphereGeometry(0.115, 10, 8), mats.skin, 0.04, 0.88, 0.08);
      add(new THREE.BoxGeometry(0.17, 0.16, 0.66), mats.pants, -0.12, 0.1, 0.42);
      add(new THREE.BoxGeometry(0.17, 0.16, 0.66), mats.pants, 0.14, 0.1, 0.5, 0, 0.25, 0);
      add(new THREE.BoxGeometry(0.11, 0.5, 0.11), cloth, -0.3, 0.38, 0.1, 0.1, 0, 0.12);
      add(new THREE.BoxGeometry(0.11, 0.5, 0.11), cloth, 0.32, 0.34, 0.14, 0.2, 0, -0.2);
      bloodPool(f, x, z + 0.3, 0.55);
    } else {
      add(new THREE.BoxGeometry(0.46, 0.2, 0.62), cloth, 0, 0.12, 0);
      add(new THREE.SphereGeometry(0.115, 10, 8), mats.skin, 0.02, 0.15, 0.42);
      add(new THREE.BoxGeometry(0.17, 0.16, 0.7), mats.pants, -0.12, 0.09, -0.62, 0, 0.1, 0);
      add(new THREE.BoxGeometry(0.17, 0.16, 0.7), mats.pants, 0.14, 0.09, -0.6, 0, -0.35, 0);
      add(new THREE.BoxGeometry(0.12, 0.12, 0.55), cloth, -0.34, 0.1, 0.12, 0, 0.5, 0);
      add(new THREE.BoxGeometry(0.12, 0.12, 0.55), cloth, 0.36, 0.1, 0.2, 0, -0.3, 0);
      bloodPool(f, x, z, rr(0.7, 1.0));
    }
    groups[f].add(g);
    if (collide !== false) addCollider(f, x - 0.35, z - 0.35, x + 0.35, z + 0.35);
  }

  function rack(f, x, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, f * H, z); g.rotation.y = rotY || 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.8), mats.rack); m.position.y = 1.1; g.add(m);
    for (let i = 0; i < 9; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), blinkMats[(i + Math.floor(rand() * 3)) % blinkMats.length]);
      led.position.set(-0.32 + rand() * 0.64, 0.3 + i * 0.2, 0.41); g.add(led);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.01), mats.metalDark);
      slot.position.set(0, 0.22 + i * 0.2, 0.405); g.add(slot);
    }
    groups[f].add(g);
    const horiz = Math.abs(Math.sin(rotY || 0)) > 0.5;
    addCollider(f, x - (horiz ? 0.4 : 0.45), z - (horiz ? 0.45 : 0.4), x + (horiz ? 0.4 : 0.45), z + (horiz ? 0.45 : 0.4));
  }

  function pipeRun(f, x1, y, z1, x2, z2, r) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mats.pipe);
    m.rotation.z = Math.PI / 2;
    const wrap = new THREE.Group();
    wrap.add(m);
    wrap.position.set((x1 + x2) / 2, f * H + y, (z1 + z2) / 2);
    wrap.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    groups[f].add(wrap);
  }

  function hatch(f, x, z, ceiling) {
    const y = ceiling ? f * H + B.TUNNEL_CEIL_H - 0.04 : f * H + 0.03;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 20), mats.metalDark);
    disc.position.set(x, y, z); groups[f].add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 20), new THREE.MeshBasicMaterial({ color: 0x802010 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, y + (ceiling ? -0.03 : 0.03), z); groups[f].add(ring);
    if (ceiling) {
      for (let i = 0; i < 4; i++) addBox(groups[f], mats.metal, x - 0.25, f * H + 0.5 + i * 0.5, z + 0.6, x + 0.25, f * H + 0.54 + i * 0.5, z + 0.7);
    }
  }

  // Wall screen drawn by cutscenes.js each frame (the player's own vital signs).
  function vitalsPanel(f, x, y, z, w, h, facing) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = Math.round(512 * h / w);
    const g = c.getContext('2d');
    g.fillStyle = '#04101e'; g.fillRect(0, 0, c.width, c.height);
    const tx = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx }));
    m.position.set(x, f * H + y, z);
    m.rotation.y = facingRot(facing);
    groups[f].add(m);
    const off = { n: [0, 0.4], s: [0, -0.4], e: [0.4, 0], w: [-0.4, 0] }[facing] || [0, 0];
    addFixture({ floor: f, x: x + off[0], y: f * H + y, z: z + off[1], color: 0x2f6bff, intensity: 0.6, distance: 6, visible: false, mode: 'steady' });
    vitalsPanels.push({ floor: f, ctx: g, tex: tx, w: c.width, h: c.height, x: x, z: z, mesh: m });
  }

  function decorFixture(f, x, z, o) {
    addFixture(Object.assign({ floor: f, x: x, y: ceilY(f), z: z }, o));
  }

  // ------------------------------------------------------------------ room furnishing
  const FURNISH = {
    office_player: function (f, r) {
      tagList = calmObjs.gore;
      desk(f, -23, -3.6, 3.2, 1.2);
      monitor(f, -23, -3.9, 'n');
      chair(f, -23, -2.0, Math.PI, false);
      pbox(f, -24.6, -3.6, 0.14, 0.2, 0.14, mats.metalDark, { y: 0.78, collide: false });
      addFixture({ floor: f, x: -24.6, y: f * H + 1.1, z: -3.6, color: L.LAMP_COLOR_RED, intensity: L.LAMP_INTENSITY, distance: L.LAMP_DISTANCE, group: 'lamp', visible: false });
      textPlane(f, -24.45, 1.12, -3.86, 0.16, 0.16, ['ARIA', 'patch', 'tonight', 'DO NOT', 'interrupt'], 'n', { bg: '#e8e08a', size: 22, px: 128 });
      const pf = textPlane(f, -21.9, 0.98, -3.75, 0.3, 0.22, ['☺ ☺ ☺ ☺', ' ☺ ☺ ☺ '], 'n', { bg: '#3a3028', color: '#e8d8b8', size: 30, border: '#8a7a5a', px: 256 });
      pf.rotation.x = -0.12;
      calmObjs.items.photo = pf;
      pbox(f, -22.3, -3.3, 0.32, 0.03, 0.24, mats.fabricRed, { y: 0.78, collide: false });
      textPlane(f, -22.3, 0.815, -3.3, 0.28, 0.2, ['PROJECT ARIA', 'CLASSIFIED'], 'up', { bg: '#7a1a14', color: '#f0e0d0', size: 22, px: 256 });
      shelf(f, -18.55, 0, 0.5, 3.0, 2.2, 5, mats.woodLight);
      pbox(f, -24.6, 3.4, 1.0, 0.45, 2.0, mats.fabric);
      pbox(f, -24.9, 3.4, 0.4, 0.5, 2.0, mats.fabric, { y: 0.45, collide: false });
      locker(f, -25.5, 0.6, 'e', true);
      interactables.push(
        { id: 'sticky', floor: f, x: -24.45, y: 1.12, z: -3.86 },
        { id: 'computer', floor: f, x: -23, y: 1.15, z: -3.9 },
        { id: 'photo', floor: f, x: -21.9, y: 0.98, z: -3.75 },
        { id: 'folder', floor: f, x: -22.3, y: 0.82, z: -3.3 });
      handprint(f, -25.85, 1.2, 4.6, 'e');
      handprint(f, -25.85, 0.7, 4.8, 'e', 0.22);
      tagList = null;
      // window blind: closed during the calm opening so the bloody corridor is not visible
      const blind = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.04), lambert(0x7a6a55));
      blind.position.set(-19.65, f * H + 1.5, 5.97);
      blind.visible = false;
      groups[f].add(blind);
      calmObjs.blind = blind;
    },

    office_paris: function (f, r) {
      desk(f, -14, -3.6, 3.0, 1.2, { hide: true, exitFace: 'n' });
      monitor(f, -14.6, -3.9, 'n');
      chair(f, -12.8, -1.6, 2.4, true);
      textPlane(f, -13.5, 0.795, -3.55, 0.22, 0.22, ['ARIA is', 'acting', 'str—'], 'up', { bg: '#e8e08a', color: '#7a0e0e', size: 26, px: 128, rotZ: 0.2 });
      pbox(f, -15.4, -3.7, 0.09, 0.1, 0.09, mats.white, { y: 0.78, collide: false });
      shelf(f, -17.55, 1, 0.5, 3.2, 2.0, 4, mats.woodLight);
      body(f, -11.2, 2.8, 0.4, 'slumped');
      handprint(f, -10.15, 1.3, 1.8, 'w');
      handprint(f, -10.15, 0.9, 2.1, 'w', 0.22);
      dragMark(f, -11.2, 2.6, -14, 5.7, 0.35);
      interactables.push({ id: 'paris_note', floor: f, x: -13.5, y: 0.8, z: -3.55 });
    },

    office_marcus: function (f, r) {
      desk(f, -5.9, 3.7, 2.2, 0.9);
      pbox(f, -9.2, 3.0, 0.7, 1.0, 1.4, mats.metal, { rotY: 0.2 });
      chair(f, -7.0, 2.3, 1.0, true);
      table(f, -7, -3.2, 2.6, 1.2, 0.74);
      hideSpots.push({ id: 'desk_' + hideSpots.length, type: 'desk', floor: f, x: -7, z: -3.2, w: 2.6, d: 1.2, exitFace: 'n', rect: { x1: -8.3, z1: -3.8, x2: -5.7, z2: -2.6 } });
      body(f, -7, -3.2, 1.5, 'lying', false);
      monitor(f, -5.2, -4.4, 'w', { y: 0.0, mode: 'flicker' });
      smear(f, -7.1, 1.0, 5.95, 's', 1.2, 1.0);
      handprint(f, -7.9, 1.0, 5.98, 's');
      handprint(f, -6.5, 1.4, 5.98, 's', 0.24);
      shelf(f, -9.6, -2, 0.5, 2.4, 2.0, 4, mats.woodLight);
      // Marcus's phone on his desk (E: listen to the voicemail)
      pbox(f, -5.2, 3.5, 0.2, 0.05, 0.3, mats.dark, { y: 0.78, collide: false });
      pbox(f, -5.2, 3.5, 0.07, 0.035, 0.26, mats.metalDark, { y: 0.83, collide: false, rotY: 0.15 });
      interactables.push({ id: 'marcus_phone', floor: f, x: -5.2, y: 0.85, z: 3.5 });
    },

    meeting: function (f, r) {
      table(f, 9, 0, 6.4, 1.8, 0.74);
      for (let i = 0; i < 4; i++) {
        chair(f, 6.6 + i * 1.6, 1.4, Math.PI, i === 2);
        chair(f, 6.6 + i * 1.6, -1.4, 0, false);
      }
      pbox(f, 13.9, 0, 0.1, 1.4, 3.0, mats.dark, { y: 0.9, collide: false });
      body(f, 12.6, 4.4, 2.2, 'slumped');
      handprint(f, 4.3, 1.2, -3.5, 'e');
      smear(f, 4.3, 0.9, -2.8, 'e', 1.0, 1.4);
    },

    storage: function (f, r) {
      shelf(f, 16.6, 0, 0.7, 7, 2.2, 4);
      shelf(f, 23, 0, 0.7, 7, 2.2, 4);
      crate(f, 19.4, -4.6, 0.9); crate(f, 20.5, -4.7, 0.7); crate(f, 19.8, -4.5, 0.6, { y: 0.9, noCollide: true });
      locker(f, 25.5, -4.0, 'w', true);
      locker(f, 25.5, -3.4, 'w', true);
    },

    workspace: function (f, r) {
      for (let i = 0; i < 6; i++) {
        const x = -24.2 + i * 3.6;
        desk(f, x, 15.2, 2.2, 1.0, { hide: i % 2 === 0, exitFace: 's' });
        monitor(f, x, 15.4, 's', { mode: i === 3 ? 'flicker' : 'steady' });
        chair(f, x, 13.9, rr(2.6, 3.7), i === 4);
        pbox(f, x + 1.8, 14.7, 0.1, 1.3, 1.6, mats.fabric, { collide: false });
      }
      body(f, -21.2, 12.0, 0.8, 'lying');
      body(f, -12, 14, 2.6, 'slumped');
      handprint(f, -25.85, 1.1, 13, 'e'); handprint(f, -25.85, 0.6, 12.6, 'e', 0.22);
    },

    conference: function (f, r) {
      table(f, 9, 13.2, 7.6, 1.8, 0.74);
      for (let i = 0; i < 5; i++) { chair(f, 5.8 + i * 1.5, 14.5, Math.PI, false); chair(f, 5.8 + i * 1.5, 11.9, 0, i === 1); }
      body(f, 4.4, 11.0, 1.0, 'lying');
      textPlane(f, 15.84, 1.6, 13.2, 2.6, 1.3, ['Q3 SAFETY REVIEW', '• ARIA: access scope', '• Ventilation control ?'], 'w', { bg: '#cfcfc8', color: '#252525', size: 17, align: 'left', px: 512 });
    },

    restroom: function (f, r) {
      for (let i = 0; i < 3; i++) {
        pbox(f, 17.2 + i * 1.4, 14.9, 0.06, 2.0, 2.0, mats.plastic, { collide: true });
        pbox(f, 17.9 + i * 1.4, 14.9, 1.4, 2.0, 0.06, mats.plastic, { collide: false });
      }
      pbox(f, 25.5, 12.4, 0.5, 0.15, 3.0, mats.white, { y: 0.9 });
      smear(f, 25.84, 1.5, 12.4, 'w', 2.4, 1.1);
      handprint(f, 25.84, 1.3, 11.6, 'w'); handprint(f, 25.84, 1.2, 12.0, 'w', 0.24);
      pbox(f, 20.4, 11.0, 0.22, 0.09, 0.1, mats.dark, { y: 0.0, collide: false }); // a single shoe
      bloodPool(f, 20.1, 11.2, 0.4);
    },

    archive: function (f, r) {
      for (let i = 0; i < 4; i++) shelf(f, -24 + i * 3.3, -13.2, 1.2, 4.0, 2.2, 5);
      for (let i = 0; i < 2; i++) crate(f, -14 + i * 0.9, -15.2, 0.8);
    },

    cooling: function (f, r) {
      pcyl(f, 16, -13, 1.2, 3.0, mats.metal, { seg: 18 });
      pcyl(f, 22, -13, 1.2, 3.0, mats.metal, { seg: 18 });
      pipeRun(f, 14, 3.0, -15.6, 26, -15.6, 0.15);
      pipeRun(f, 14, 2.6, -10.4, 26, -10.4, 0.1);
      body(f, 24.3, -11.2, 0.3, 'slumped');
    },

    server: function (f, r) {
      [-23.2, -20.4, -8.8, -6.2].forEach((x, ci) => {
        for (let k = 0; k < 8; k++) {
          const z = -5 + k * 1.3;
          if (Math.abs(z) < 1.4) continue;
          rack(f, x, z, ci < 2 ? Math.PI / 2 : -Math.PI / 2);
        }
      });
      // ARIA core + main terminal at the far west wall
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.0, 20), new THREE.MeshBasicMaterial({ color: 0x0c2a55 }));
      core.position.set(-25.0, f * H + 1.5, 3.4); groups[f].add(core);
      addCollider(f, -25.9, 2.5, -24.1, 4.3);
      const core2 = core.clone(); core2.position.z = -3.4; groups[f].add(core2);
      addCollider(f, -25.9, -4.3, -24.1, -2.5);
      table(f, -24.6, 0, 1.0, 2.2, 0.8);
      monitor(f, -24.6, 0, 'e', { y: 0.86, color: 0x4fb4ff });
      textPlane(f, -25.84, 2.6, 0, 3.0, 0.4, ['MAIN TERMINAL — ARIA CORE'], 'e', { bg: '#050a14', color: '#4fb4ff', size: 22, px: 512 });
      pbox(f, -25.4, -1.3, 0.5, 0.4, 0.4, mats.metalDark, { collide: false }); // the power plug housing
      addBox(groups[f], mats.cable, -25.3, f * H + 0.4, -1.5, -22, f * H + 0.46, -1.44);
      interactables.push({ id: 'main_terminal', floor: f, x: -24.6, y: 1.2, z: 0 }, { id: 'server_plug', floor: f, x: -25.4, y: 0.4, z: -1.3 });
      [-20, -14.5, -9].forEach(x => vitalsPanel(f, x, 1.75, 5.98, 2.4, 1.3, 's'));
      [-18, -12].forEach(x => addFixture({ floor: f, x: x, y: ceilY(f), z: 0, color: 0x2f6bff, intensity: 0.9, distance: 10, mode: 'steady', size: [0.5, 0.5] }));
      addFixture({ floor: f, x: -24, y: ceilY(f), z: 0, color: 0x2f6bff, intensity: 1.1, distance: 9, mode: 'steady', size: [0.5, 0.5] });
    },

    control: function (f, r) {
      for (let i = 0; i < 4; i++) {
        desk(f, 8 + i * 4.2, 4.4, 2.4, 1.0, { hide: i === 1, exitFace: 's' });
        monitor(f, 8 + i * 4.2, 4.6, 's', { color: 0x2f6bff, mode: i === 2 ? 'flicker' : 'steady' });
        chair(f, 8 + i * 4.2, 3.0, 3.4, i === 3);
      }
      for (let i = 0; i < 3; i++) pbox(f, 25.85, 1.6, 0.1, 1.0, 1.6, mats.dark, { y: 1.2 - 0, collide: false, rotY: 0 }).position.z = -3.2 + i * 2.4;
      body(f, 18.5, -2.6, 0.6, 'lying');
      [10, 17, 23].forEach(x => vitalsPanel(f, x, 1.75, 5.98, 2.4, 1.3, 's'));
      addFixture({ floor: f, x: 15, y: ceilY(f), z: 0, color: 0x2f6bff, intensity: 0.9, distance: 11, mode: 'steady', size: [0.5, 0.5] });
    },

    chem: function (f, r) {
      for (let i = 0; i < 3; i++) shelf(f, -24 + i * 4.2, -15.1, 1.8, 0.7, 2.2, 4);
      for (let i = 0; i < 4; i++) pcyl(f, -21 + i * 0.9, -12.2, 0.32, 0.9, mats.metalDark);
    },

    locker: function (f, r) {
      for (let i = 0; i < 12; i++) locker(f, -6.6 + i * 0.6, -15.6, 'n', true);
      pbox(f, 0, -12.5, 5, 0.45, 0.5, mats.woodLight);
      body(f, 4.5, -13.6, 0.2, 'lying');
    },

    maint: function (f, r) {
      hatch(f, 22.5, -13, false);
      pipeRun(f, 14, 2.8, -15.7, 26, -15.7, 0.18);
      pcyl(f, 16.2, -14.5, 0.5, 1.1, mats.metalDark);
      crate(f, 15.2, -11.2, 0.8);
    },

    lab: function (f, r) {
      for (let i = 0; i < 3; i++) {
        table(f, -20.5 + i * 5.2, 0, 3.6, 1.2, 0.9);
        pbox(f, -21.3 + i * 5.2, 0, 0.3, 0.3, 0.3, mats.glassTank, { y: 0.96, collide: false });
        monitor(f, -19.6 + i * 5.2, 0.2, 's', { y: 0.96, mode: i === 1 ? 'flicker' : 'steady' });
        chair(f, -20.5 + i * 5.2, 1.4, 0.4, i === 2);
      }
      pbox(f, -25.88, 0, 0.08, 1.2, 3.4, lambert(0xd0d0cc), { y: 1.0, collide: false });
      textPlane(f, -25.8, 1.7, 0, 3.2, 1.0, ['SHE KNOWS'], 'e', { bg: '#d9d9d2', color: '#a30c0c', size: 80, px: 1024, family: 'Brush Script MT, cursive', font: 'bold italic' });
      // security footage terminal (E: watch the footage)
      desk(f, -8, 5.0, 2.0, 0.8);
      monitor(f, -8, 5.25, 's', { color: 0xff4a3a, mode: 'flicker' });
      interactables.push({ id: 'security_terminal', floor: f, x: -8, y: 1.15, z: 5.2 });
      body(f, -13.4, -4.6, 1.8, 'lying');
      body(f, -24.6, 5.0, 0.2, 'slumped');
      handprint(f, -25.85, 1.0, 3.5, 'e'); handprint(f, -25.85, 1.6, 3.6, 'e', 0.24);
    },

    specimen: function (f, r) {
      for (let i = 0; i < 3; i++) {
        const x = 6.4 + i * 3.2;
        const tank = pcyl(f, x, 3.6, 0.7, 2.4, mats.glassTank, { seg: 18 });
        pcyl(f, x, 3.6, 0.8, 0.2, mats.metalDark, { collide: false });
        pcyl(f, x, 3.6, 0.8, 0.2, mats.metalDark, { y: 2.3, collide: false });
        addFixture({ floor: f, x: x, y: f * H + 1.2, z: 3.6, color: 0x3fff8a, intensity: 0.55, distance: 6, visible: false, mode: i === 1 ? 'flicker' : 'steady' });
      }
      table(f, 9, -3, 3.2, 1.0, 0.9);
    },

    break: function (f, r) {
      const plates = [[17, -3], [21, -3], [17, 0.5], [21, 0.5]];
      plates.forEach((p, i) => {
        table(f, p[0], p[1], 2.4, 1.1, 0.75);
        pcyl(f, p[0] - 0.5, p[1], 0.14, 0.03, mats.white, { y: 0.81, collide: false });
        pcyl(f, p[0] - 0.5, p[1], 0.09, 0.05, mats.food, { y: 0.84, collide: false });
        pcyl(f, p[0] + 0.5, p[1] + 0.2, 0.14, 0.03, mats.white, { y: 0.81, collide: false });
        pcyl(f, p[0] + 0.5, p[1] + 0.2, 0.09, 0.05, mats.food, { y: 0.84, collide: false });
        chair(f, p[0] - 0.5, p[1] - 1.0, 0, i === 3);
        chair(f, p[0] + 0.5, p[1] + 1.0, Math.PI, false);
      });
      // birthday cake, half cut
      pcyl(f, 21, 0.5, 0.26, 0.14, mats.cake, { y: 0.81, collide: false });
      addBox(groups[f], mats.cakeInner, 20.98, f * H + 0.81, 0.5, 21.26, f * H + 0.95, 0.76);
      textPlane(f, 21.8, 0.815, 0.95, 0.3, 0.2, ['Happy Birthday', 'Rain!', '— The Team'], 'up', { bg: '#f2e65c', color: '#2a2a2a', size: 22, px: 256, rotZ: -0.3 });
      interactables.push({ id: 'rain_postit', floor: f, x: 21.8, y: 0.82, z: 0.95 });
      // Rain's birthday card, next to the cake
      textPlane(f, 20.1, 0.765, 0.85, 0.2, 0.27, ['HAPPY', 'BIRTH-', 'DAY', 'RAIN!'], 'up', { bg: '#f1c9d8', color: '#b02a5a', size: 30, px: 128, rotZ: 0.25 });
      interactables.push({ id: 'rain_card', floor: f, x: 20.1, y: 0.78, z: 0.85 });
      // fridge with a child's drawing
      pbox(f, 25.2, 3.5, 1.2, 1.9, 0.9, mats.white);
      const dr = textPlane(f, 24.58, 1.3, 3.5, 0.4, 0.5, ['  \\o/   ', ' ♥  |  ☼', ' / \\ /\\', 'to Mommy'], 'w', { bg: '#f4f0e0', color: '#2a5ad0', size: 22, px: 256, family: 'Comic Sans MS, cursive' });
      pbox(f, 25.2, -1.6, 1.2, 1.8, 1.0, mats.metalDark);
      body(f, 15.2, 4.6, 0.9, 'slumped');
      handprint(f, 14.15, 1.2, -4.5, 'e');
      dragMark(f, 15.5, 2.0, 20, 5.7, 0.35);
    },

    power: function (f, r) {
      pbox(f, -22, -1.5, 3.2, 1.6, 1.6, mats.metalDark);
      pbox(f, -16, -3, 2.4, 1.6, 1.2, mats.metalDark);
      pcyl(f, -10, -2.6, 0.7, 2.0, mats.metal, { seg: 16 });
      pbox(f, -8, 5.8, 3.0, 2.2, 0.4, mats.metal, { collide: false });
      pbox(f, -25.7, -1.5, 0.3, 1.6, 1.8, mats.metalDark, { y: 0.3, collide: false });
      textPlane(f, -25.54, 1.4, -1.5, 1.4, 0.9, ['FIRE SUPPRESSION', 'OVERRIDE', '[ LOCKED ]'], 'e', { bg: '#7a0f0f', color: '#f2e0d0', size: 24, px: 512, border: '#ffcc22' });
      interactables.push({ id: 'fire_override', floor: f, x: -25.54, y: 1.4, z: -1.5 });
      hatch(f, -22, 4.5, false);
      body(f, -8, 4.2, 0.6, 'lying');
      addFixture({ floor: f, x: -22, y: ceilY(f), z: 0, color: 0xffa020, intensity: 0.5, distance: 8, mode: 'flicker' });
    },

    security: function (f, r) {
      desk(f, 9, -3.5, 3.4, 1.1);
      for (let i = 0; i < 3; i++) monitor(f, 7.9 + i * 1.1, -3.7, 'n', { y: 0.78, color: 0x20ff88, mode: i === 1 ? 'flicker' : 'steady' });
      chair(f, 9, -2.0, Math.PI, true);
      body(f, 6.0, 2.8, 2.9, 'slumped');
    },

    garage: function (f, r) {
      pbox(f, 20, -1.5, 3.4, 1.4, 6.2, lambert(0x3a4a58), { rotY: 0 });
      pbox(f, 20, -1.5, 3.0, 0.6, 3.0, mats.dark, { y: 1.4, collide: false });
      crate(f, 24.2, 4.5, 1.0); crate(f, 24.5, 3.3, 0.8); crate(f, 15.2, 4.5, 1.1);
    }
  };

  // ------------------------------------------------------------------ floor assembly
  function buildFloor(f) {
    const Ld = C.LAYOUT[f];
    const th = themeMats[Ld.theme];
    const b = Ld.bounds;
    const rooms = Ld.rooms;
    roomsByFloor[f] = rooms;

    // outer shell (with optional exit door)
    const sd = Ld.shellDoors || [];
    wallRun(f, th, 'x', b.z1, b.x1, b.x2, opsFor(sd, 's'), 'shell');
    wallRun(f, th, 'x', b.z2, b.x1, b.x2, opsFor(sd, 'n'), 'shell');
    wallRun(f, th, 'z', b.x1, b.z1, b.z2, opsFor(sd, 'w'), 'shell');
    wallRun(f, th, 'z', b.x2, b.z1, b.z2, opsFor(sd, 'e'), 'shell');

    rooms.forEach(r => {
      buildRect(f, th, r, r.doors, r.windows, r.id);
      const fn = FURNISH[r.type];
      if (fn) fn(f, r);
      // ceiling fixtures inside rooms
      if (Ld.lights.rooms) {
        const rl = Ld.lights.rooms;
        const w = r.x2 - r.x1, d = r.z2 - r.z1;
        const nx = Math.max(1, Math.round(w / rl.spacing)), nz = Math.max(1, Math.round(d / rl.spacing));
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          decorFixture(f, r.x1 + ((i + 0.5) * w) / nx, r.z1 + ((j + 0.5) * d) / nz, { color: rl.color, intensity: rl.intensity, distance: rl.distance, mode: lightMode(rl.deadChance, rl.flickerChance), size: [0.9, 0.3] });
        }
      }
    });

    // corridor emergency lighting
    const cr = Ld.corridor;
    if (Ld.lights.corridor) {
      const zc = (cr.z1 + cr.z2) / 2;
      for (let x = cr.x1 + 2; x <= cr.x2 - 2 + 0.01; x += L.EMERGENCY_SPACING) {
        decorFixture(f, x, zc, { color: L.EMERGENCY_COLOR, intensity: L.EMERGENCY_INTENSITY, distance: L.EMERGENCY_DISTANCE, mode: Ld.theme === 'research' ? lightMode(0.35, 0.4) : 'steady', size: [0.8, 0.25], group: 'corridor' });
      }
    }
    decorateCorridor(f, Ld);
  }

  function decorateCorridor(f, Ld) {
    const cr = Ld.corridor, D = C.DECOR;
    const allDoors = doors.filter(d => d.floor === f);
    const farFromDoors = (x, z) => allDoors.every(d => Math.hypot(d.x - x, d.z - z) > D.DOOR_CLEARANCE);
    const bz = Ld.bounds;
    const hasWall = (x, zEdge) => Math.abs(zEdge - bz.z1) < 0.01 || Math.abs(zEdge - bz.z2) < 0.01 ||
      Ld.rooms.some(r => (Math.abs(r.z1 - zEdge) < 0.01 || Math.abs(r.z2 - zEdge) < 0.01) && x > r.x1 + 0.5 && x < r.x2 - 0.5);
    const placed = [];
    const spot = (tries) => {
      for (let i = 0; i < tries; i++) {
        const x = rr(cr.x1 + 3, cr.x2 - 3);
        const z = rand() < 0.5 ? cr.z1 + D.WALL_OFFSET : cr.z2 - D.WALL_OFFSET;
        if (Math.abs(x) < S.X + 1 && (Ld.landing === 'n' ? z < 10 : z > -10)) continue; // keep the stair landing clear
        if (farFromDoors(x, z) && placed.every(p => Math.hypot(p[0] - x, p[1] - z) > 2.5)) { placed.push([x, z]); return [x, z]; }
      }
      return null;
    };
    for (let i = 0; i < D.CORRIDOR_BODIES; i++) {
      const p = spot(30);
      if (p) body(f, p[0], p[1], rr(0, 6.28), rand() < 0.5 ? 'lying' : 'slumped');
    }
    for (let i = 0; i < D.CORRIDOR_HANDPRINTS; i++) {
      const x = rr(cr.x1 + 2, cr.x2 - 2);
      const south = rand() < 0.5;
      const z = south ? cr.z1 + T / 2 + 0.02 : cr.z2 - T / 2 - 0.02;
      if (!farFromDoors(x, z) || !hasWall(x, south ? cr.z1 : cr.z2)) continue;
      handprint(f, x, rr(D.HANDPRINT_HEIGHT[0], D.HANDPRINT_HEIGHT[1]), z, south ? 'n' : 's');
    }
    for (let i = 0; i < D.CORRIDOR_DRAG_MARKS; i++) {
      const dd = allDoors.length ? pick(allDoors) : null;
      if (!dd || dd.axis !== 'x') continue;
      const toward = dd.z < (cr.z1 + cr.z2) / 2 ? -1 : 1;
      const sx = dd.x + rr(-4, 4);
      dragMark(f, sx, (cr.z1 + cr.z2) / 2, dd.x, dd.z - toward * 0.9, 0.4);
      bloodPool(f, dd.x, dd.z - toward * 0.8, 0.45);
    }
    if (f === 2) {
      pbox(f, 12.5, 9.0, 0.22, 0.09, 0.1, mats.dark, { y: 0, collide: false }).rotation.y = 0.6;      // one shoe
      const kc = pbox(f, -12, 8.4, 0.2, 0.012, 0.13, mats.plastic, { y: 0.01, collide: false });       // broken keycard
      kc.rotation.y = 0.5;
      pbox(f, -11.9, 8.45, 0.1, 0.012, 0.12, mats.plastic, { y: 0.01, collide: false }).rotation.y = 1.9;
    }
  }

  // ------------------------------------------------------------------ basement (grid-carved tunnels)
  function buildBasement() {
    const f = -1, Ld = C.LAYOUT['-1'], th = themeMats.tunnel, g = groups[f], cell = B.TUNNEL_CELL;
    const walk = new Set();
    const shaftCells = new Set();
    const key = (i, j) => i + ',' + j;
    Ld.tunnels.forEach(t => {
      for (let i = t.x1 / cell; i < t.x2 / cell; i++) for (let j = t.z1 / cell; j < t.z2 / cell; j++) {
        walk.add(key(i, j));
        if (t.shaft) shaftCells.add(key(i, j));
      }
    });
    const has = (i, j) => walk.has(key(i, j));
    const y0 = f * H, yTop = y0 + B.TUNNEL_CEIL_H + 0.2;
    // gather wall edges, merge into runs
    const edges = { W: {}, E: {}, S: {}, N: {} };
    walk.forEach(k => {
      const p = k.split(',').map(Number), i = p[0], j = p[1];
      if (!has(i - 1, j)) (edges.W[i] = edges.W[i] || []).push(j);
      if (!has(i + 1, j)) (edges.E[i + 1] = edges.E[i + 1] || []).push(j);
      if (!has(i, j - 1)) (edges.S[j] = edges.S[j] || []).push(i);
      if (!has(i, j + 1)) (edges.N[j + 1] = edges.N[j + 1] || []).push(i);
    });
    const runs = (arr) => {
      arr.sort((a, b) => a - b);
      const out = []; let s = arr[0], p = arr[0];
      for (let i = 1; i <= arr.length; i++) {
        if (i < arr.length && arr[i] === p + 1) { p = arr[i]; continue; }
        out.push([s, p + 1]); s = arr[i]; p = arr[i];
      }
      return out;
    };
    const wall = (x1, z1, x2, z2) => { addBox(g, th.wall, x1, y0, z1, x2, yTop, z2, true); addCollider(f, x1, z1, x2, z2); };
    Object.keys(edges.W).forEach(c => runs(edges.W[c]).forEach(r => wall(c * cell - T, r[0] * cell, c * cell, r[1] * cell)));
    Object.keys(edges.E).forEach(c => runs(edges.E[c]).forEach(r => wall(c * cell, r[0] * cell, c * cell + T, r[1] * cell)));
    Object.keys(edges.S).forEach(c => runs(edges.S[c]).forEach(r => wall(r[0] * cell, c * cell - T, r[1] * cell, c * cell)));
    Object.keys(edges.N).forEach(c => runs(edges.N[c]).forEach(r => wall(r[0] * cell, c * cell, r[1] * cell, c * cell + T)));

    // low ceiling over every non-shaft tunnel cell (row-merged)
    const rows = {};
    walk.forEach(k => { if (shaftCells.has(k)) return; const p = k.split(',').map(Number); (rows[p[1]] = rows[p[1]] || []).push(p[0]); });
    Object.keys(rows).forEach(j => runs(rows[j]).forEach(r => addBox(g, th.ceil, r[0] * cell, y0 + B.TUNNEL_CEIL_H, j * cell, r[1] * cell, y0 + B.TUNNEL_CEIL_H + 0.2, (+j + 1) * cell, true)));

    // pipes along the long tunnels
    pipeRun(f, -23.4, 2.25, -11.6, -4.5, -11.6, 0.12);
    pipeRun(f, -23.4, 2.0, -11.5, -23.4, 11.4, 0.1);
    pipeRun(f, -23.4, 2.3, 11.4, 23.4, 11.4, 0.14);
    pipeRun(f, 23.4, 2.1, -11.4, 23.4, 11.4, 0.12);
    pipeRun(f, 4.5, 2.3, -11.6, 23.4, -11.6, 0.1);
    // debris, crates, barrels, puddles
    crate(f, -22.5, -2, 0.8); crate(f, -22.4, -0.9, 0.6);
    pcyl(f, 22.6, 4, 0.34, 0.95, mats.metalDark); pcyl(f, 23.3, 4.9, 0.34, 0.95, mats.metalDark);
    crate(f, 8.5, -11.3, 0.7); crate(f, 22.5, -10.8, 0.9);
    pcyl(f, -17, 3, 0.9, 0.6, mats.concrete, { seg: 14 });
    pcyl(f, 13, -2, 0.5, 1.4, mats.metalDark); pcyl(f, 15.2, -2.4, 0.5, 1.4, mats.metalDark);
    for (let i = 0; i < 12; i++) {
      const tunnel = pick(Ld.tunnels.filter(t => !t.shaft));
      const p = new THREE.Mesh(new THREE.CircleGeometry(rr(0.3, 0.7), 14), new THREE.MeshLambertMaterial({ color: 0x0e1418, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      p.rotation.x = -Math.PI / 2;
      p.position.set(rr(tunnel.x1 + 1, tunnel.x2 - 1), y0 + 0.012, rr(tunnel.z1 + 1, tunnel.z2 - 1));
      g.add(p);
    }
    hatch(f, -22.5, 10.5, true);
    hatch(f, 22.5, 10.5, true);
    body(f, 10.5, 1.5, 1.2, 'lying');
    handprint(f, 8.02, 1.1, -1.0, 'e'); // sits on the pump-room west wall (x = 8)
  }

  // ------------------------------------------------------------------ passages
  function buildPassages() {
    // hatch meshes are placed by the room furnishers (upper side) and buildBasement (tunnel side)
    C.PASSAGES.forEach(p => passages.push({ id: p.id, a: p.a, b: p.b, label: p.label }));
  }

  // ------------------------------------------------------------------ queries
  function roomAt(floor, x, z) {
    if (x > -S.X && x < S.X && z > -S.Z && z < S.Z) return 'Stairwell';
    if (floor === -1) {
      const ts = C.LAYOUT['-1'].tunnels;
      for (let i = 0; i < ts.length; i++) {
        const t = ts[i];
        if (!t.shaft && t.name && x >= t.x1 && x <= t.x2 && z >= t.z1 && z <= t.z2) return t.name;
      }
      return 'Maintenance Tunnels';
    }
    const rs = roomsByFloor[floor] || [];
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r.name;
    }
    const L2 = C.LAYOUT[floor];
    return L2 && L2.corridor ? L2.corridor.name : '';
  }

  // id of the room rectangle containing the point ('' = corridor/hall/shaft/tunnel)
  function roomIdAt(floor, x, z) {
    const rs = roomsByFloor[floor] || [];
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r.id;
    }
    return '';
  }

  function setActiveFloor(f) {
    if (ext.active || f === curFloor) return;
    curFloor = f;
    Object.keys(groups).forEach(k => { groups[k].visible = Math.abs(+k - f) <= C.RENDER.ACTIVE_FLOOR_RANGE; });
    const a = L.AMBIENT[String(f)];
    if (a) {
      ambient.color.setHex(a.color); ambient.intensity = a.intensity;
      scene.fog.color.setHex(a.fog); scene.fog.density = a.density;
      scene.background.setHex(a.fog);
    }
  }

  // ------------------------------------------------------------------ Ending A: blackout
  function blackout() {
    blackoutOn = true;
    fixtures.forEach(fx => { fx.suppressed = true; });
    vitalsPanels.forEach(p => { p.mesh.visible = false; });
    ambient.intensity = 0.015;
  }

  // ------------------------------------------------------------------ Ending B: fire + exterior
  function makeFlame(parent, x, y, z, w, h, color) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: color || 0xffffff }));
    sp.scale.set(w, h, 1); sp.position.set(x, y, z);
    parent.add(sp);
    return { s: sp, w: w, h: h, ph: rand() * 6.28 };
  }

  // Fire suppression override: the ground floor catches fire.
  function startFire() {
    if (fire.on) return;
    fire.on = true; fire.t = 0;
    const g = groups[0];
    for (let i = 0; i < 18; i++) fire.sprites.push(makeFlame(g, rr(-23, 23), 1.0, rr(7, 15.4), rr(1.4, 2.4), rr(2.0, 3.2)));
    for (let i = 0; i < 4; i++) fire.sprites.push(makeFlame(g, rr(-24, -6), 0.9, rr(-5, 5), 1.6, 2.4));
    [[-18, 9], [-4, 13], [10, 9], [20, 13], [-18, 0]].forEach(p => addFixture({ floor: 0, x: p[0], y: 1.8, z: p[1], color: 0xff7a20, intensity: 1.6, distance: 12, mode: 'flicker', visible: false }));
    // the red emergency lights give way to orange
    fixtures.forEach(fx => { if (fx.floor === 0 && fx.group === 'corridor') { fx.color = 0xff5a10; fx.baseColor.setHex(0xff5a10); } });
  }

  function buildExterior() {
    const g = new THREE.Group();
    g.visible = false;
    scene.add(g);
    ext.group = g;
    // ground + building shell
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), lambert(0x0c120d));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; g.add(ground);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(40, 70), lambert(0x1a1c1e));
    lot.rotation.x = -Math.PI / 2; lot.position.set(52, -0.03, 4); g.add(lot);
    const F = B.FOOTPRINT, top = 3 * H + B.CEIL_H + B.SLAB_T;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(F.x2 - F.x1 + 0.6, top, F.z2 - F.z1 + 0.6), lambert(0x4a4d52, { map: tex.wall }));
    shell.position.set(0, top / 2, 0); g.add(shell);
    // glowing windows on the east and south faces
    const addWin = (x, y, z, rotY, burn) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff7a20 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), mat);
      m.position.set(x, y, z); m.rotation.y = rotY; g.add(m);
      ext.windows.push({ mat: mat, ph: rand() * 6.28, lvl: burn });
      if (burn > 0.45) ext.flames.push(makeFlame(g, x + Math.sin(rotY) * 0.3, y, z + Math.cos(rotY) * 0.3, rr(2.0, 3.2), rr(3.0, 5.0)));
    };
    for (let fl = 0; fl < 4; fl++) {
      for (let z = -12; z <= 12; z += 4) addWin(F.x2 + 0.32, fl * H + 1.9, z, Math.PI / 2, rand() * (0.4 + fl * 0.2));
      for (let x = -21; x <= 21; x += 6) addWin(x, fl * H + 1.9, F.z1 - 0.32, Math.PI, rand() * 0.6);
    }
    // the open exit
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.3), new THREE.MeshBasicMaterial({ color: 0xff8a30 }));
    door.position.set(F.x2 + 0.33, 1.15, 12); door.rotation.y = Math.PI / 2; g.add(door);
    // stars
    const pts = [];
    for (let i = 0; i < 500; i++) { const a = rand() * 6.28, e = 0.15 + rand() * 1.3, r = 220; pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaab4d0, size: 1.4, sizeAttenuation: false, fog: false })));
    // light spill (kept in the scene at zero intensity so the shader light count never changes)
    [[34, 5, 2], [34, 10, -9]].forEach(p => {
      const l = new THREE.PointLight(0xff6a20, 0, 70, 1.4); l.position.set(p[0], p[1], p[2]); scene.add(l); ext.lights.push(l);
    });
    const moon = new THREE.DirectionalLight(0x5070b0, 0); moon.position.set(-40, 80, 60); scene.add(moon); ext.lights.push(moon);
  }

  // Cut to the view from outside the burning lab.
  function enterExterior() {
    ext.active = true; ext.t = 0;
    Object.keys(groups).forEach(k => { groups[k].visible = false; });
    ext.group.visible = true;
    ambient.color.setHex(0x182040); ambient.intensity = 0.55;
    scene.fog.color.setHex(0x03040a); scene.fog.density = 0.011;
    scene.background.setHex(0x03040a);
  }

  function updateExtras(dt, t) {
    if (fire.on) {
      fire.t += dt;
      const grow = Math.min(1.5, 0.45 + fire.t * 0.22);
      fire.sprites.forEach(f => {
        const k = 1 + 0.22 * Math.sin(t * 9 + f.ph) + 0.12 * Math.sin(t * 17 + f.ph * 2);
        f.s.scale.set(f.w * k * grow, f.h * (k + 0.1) * grow, 1);
      });
    }
    if (ext.active) {
      ext.t += dt;
      const burn = Math.min(1, 0.25 + ext.t * 0.05);
      ext.windows.forEach(w => {
        const k = (0.45 + 0.55 * w.lvl) * burn * (0.78 + 0.22 * Math.sin(t * 7 + w.ph) * Math.sin(t * 3.1 + w.ph));
        w.mat.color.setRGB(Math.min(1, 1.1 * k), 0.42 * k, 0.1 * k);
      });
      ext.flames.forEach(f => {
        const k = 1 + 0.25 * Math.sin(t * 8 + f.ph) + 0.15 * Math.sin(t * 15 + f.ph * 3);
        f.s.scale.set(f.w * k * burn * 1.3, f.h * (k + 0.15) * burn * 1.3, 1);
      });
      ext.lights[0].intensity = 2.4 * burn * (0.85 + 0.15 * Math.sin(t * 9));
      ext.lights[1].intensity = 2.0 * burn * (0.85 + 0.15 * Math.sin(t * 7 + 2));
      ext.lights[2].intensity = 0.35;
    }
  }

  // Calm mode = the normal-looking office of the opening (no gore, blind down,
  // corridor lights off, amber lamp, office door locked).
  function setCalm(on) {
    setLampMode(on ? 'calm' : 'red');
    calmObjs.gore.forEach(o => { o.visible = !on; });
    if (calmObjs.blind) calmObjs.blind.visible = on;
    fixtures.forEach(fx => { if (fx.floor === 2 && fx.group === 'corridor') fx.suppressed = on; });
    const door = doors.find(d => d.id.indexOf('office04_n') === 0);
    if (door) door.setLocked(on);
    if (curFloor === 2 || curFloor === null) {
      const a = L.AMBIENT['2'];
      ambient.color.setHex(on ? 0x3a2a1c : a.color);
      ambient.intensity = on ? 0.9 : a.intensity;
    }
  }

  function setLampMode(mode) {
    const hex = mode === 'calm' ? L.LAMP_COLOR_CALM : L.LAMP_COLOR_RED;
    lampFixtures.forEach(fx => { fx.color = hex; fx.baseColor.setHex(hex); });
    lightPool.forEach(p => { if (p.fx && p.fx.group === 'lamp') p.light.color.setHex(hex); });
  }

  // ------------------------------------------------------------------ public
  function init(threeScene) {
    scene = threeScene;
    rand = mulberry32(C.SEED);
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.05);
    ambient = new THREE.AmbientLight(0x200808, 0.5);
    scene.add(ambient);

    for (let f = B.FLOOR_MIN; f <= B.FLOOR_MAX; f++) {
      groups[f] = new THREE.Group();
      colliders[f] = [];
      scene.add(groups[f]);
    }
    makeMaterials();

    // slabs: level f is the floor of floor f (top at f*H); level 4 is the roof
    const slabTheme = { '-1': 'tunnel', '0': 'ground', '1': 'research', '2': 'office', '3': 'server', '4': 'server' };
    for (let lv = B.FLOOR_MIN; lv <= B.FLOOR_MAX + 1; lv++) {
      buildSlab(lv, themeMats[slabTheme[String(lv)]], lv > B.FLOOR_MIN && lv <= B.FLOOR_MAX);
    }
    buildStairs();
    for (let f = 0; f <= B.FLOOR_MAX; f++) buildFloor(f);
    buildBasement();
    buildPassages();
    buildExterior();

    for (let i = 0; i < L.POOL_SIZE; i++) {
      const light = new THREE.PointLight(0xff2010, 0, 10, 2);
      scene.add(light);
      lightPool.push({ light: light, fx: null, fade: 0 });
    }
    setActiveFloor(C.PLAYER.SPAWN.floor);
  }

  function update(dt, t, playerPos) {
    updateFixtures(dt, t);
    updateExtras(dt, t);
    if (t - lastAssign > L.REASSIGN_INTERVAL) { lastAssign = t; assignLights(playerPos.x, playerPos.y + 1.5, playerPos.z); }
    for (let i = 0; i < lightPool.length; i++) {
      const p = lightPool[i];
      if (ext.active) { p.light.intensity = 0; continue; }
      if (p.fx) {
        p.fade = Math.min(1, p.fade + dt * L.FADE_SPEED);
        p.light.intensity = p.fx.intensity * p.fx.mult * p.fade;
      } else {
        p.fade = Math.max(0, p.fade - dt * L.FADE_SPEED);
        p.light.intensity *= 0.8;
      }
    }
  }

  return {
    init: init,
    update: update,
    setActiveFloor: setActiveFloor,
    groundHeight: groundHeight,
    floorOf: floorOf,
    blocked: blocked,
    roomAt: roomAt,
    roomIdAt: roomIdAt,
    groupOf: function (f) { return groups[f]; },
    setLampMode: setLampMode,
    setCalm: setCalm,
    blackout: blackout,
    // carryable items: hide / show the mesh and its prompt
    setItemTaken: function (id, taken) {
      const m = calmObjs.items[id]; if (m) m.visible = !taken;
      interactables.forEach(it => { if (it.id === id) it.disabled = !!taken; });
    },
    startFire: startFire,
    enterExterior: enterExterior,
    get fireOn() { return fire.on; },
    get exteriorActive() { return ext.active; },
    vitalsPanels: vitalsPanels,
    doors: doors,
    hideSpots: hideSpots,
    passages: passages,
    interactables: interactables,
    flights: flights,
    colliders: colliders
  };
})();
