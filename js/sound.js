/* ============================================================================
 * sound.js — ARIA : the whole soundscape, built live with the Web Audio API.
 *
 * OWNS:    the AudioContext and its buses (ambient, sfx, reverb send), the
 *          menu pad, the ambient layers (server hum, buzz, vents, tunnel
 *          drips / pipes / skitters / breathing, flashlight buzz), the
 *          spatial drone voice (wheel + sonar ping), footsteps, heartbeat,
 *          and every one-shot that Dialogue.fx / Cutscenes / Aria / Drone
 *          announce through GameState events.
 * IMPORTS: CONFIG, GameState (main.js), Player, Drone (read-only).
 * EXPORTS: Sound { init, update, unlock, stopOneShots, setMuted, isMuted, play }
 *
 * Browsers only start audio after a user gesture, so the context is created on
 * the first click / key press (the menu pad starts then; BEGIN is a gesture too).
 * Press M to mute everything. When Sound exists, dialogue.js's tiny fallback
 * stays silent and every fx name is handled here.
 * ========================================================================== */

const Sound = (function () {
  'use strict';

  const C = CONFIG;
  const H = C.BUILDING ? C.BUILDING.FLOOR_H : 4;
  const SERVER = { x: -22, z: 0, y: 3 * 4 + 1.2 };      // ARIA's core, Floor 3 west

  let a = null;                // AudioContext
  let master, amb, sfx, verb;  // buses
  let padGain, humGain, buzzGain, flashGain, wheelGain, wheelFilter, breathBus;
  let wheelPan = null;
  let muted = false;
  let level = 0;               // current ambient level (0..1), eased toward its target
  let timers = { vent: 3, buzz: 5, drip: 2, pipe: 12, skitter: 20, breath: 2, clang: 8, creak: 6 };
  let lastDrone = { x: 0, z: 0, floor: -9 }, droneSpeed = 0;
  let noiseBuf = null;

  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  const clamp01 = v => Math.max(0, Math.min(1, v));

  // ------------------------------------------------------------------ context + helpers
  function unlock() {
    if (!a) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { a = new AC(); } catch (e) { a = null; return; }
      build();
    }
    if (a.state === 'suspended') a.resume();
  }

  function mkNoise(secs) {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * secs), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function filt(type, f, q) { const b = a.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function gain(v, dest) { const g = a.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function osc(type, f, dest) { const o = a.createOscillator(); o.type = type; o.frequency.value = f; if (dest) o.connect(dest); o.start(); return o; }
  function loopNoise(dest) { const n = a.createBufferSource(); n.buffer = noiseBuf; n.loop = true; if (dest) n.connect(dest); n.start(); return n; }

  // A synthetic room: decaying noise as an impulse response.
  function reverbIR(secs, decay) {
    const len = Math.floor(a.sampleRate * secs);
    const buf = a.createBuffer(2, len, a.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function build() {
    noiseBuf = mkNoise(4);
    master = gain(muted ? 0 : 0.9, a.destination);
    amb = gain(1, master);
    sfx = gain(1, master);
    const conv = a.createConvolver(); conv.buffer = reverbIR(2.2, 2.6);
    verb = gain(0.5, conv); conv.connect(gain(0.55, master));

    // --- menu / opening pad: two detuned saws, very low, slowly breathing
    padGain = gain(0, amb);
    const padLp = filt('lowpass', 180, 1.2); padLp.connect(padGain);
    osc('sawtooth', 55, padLp); osc('sawtooth', 55.6, padLp); osc('sine', 41.2, padLp);
    const lfo = osc('sine', 0.07, gain(60, padLp.frequency));
    const shimmer = filt('bandpass', 1400, 8); shimmer.connect(gain(0.012, padGain));
    loopNoise(shimmer);

    // --- server hum (grows near the server room): 50 Hz mains + harmonics
    humGain = gain(0, amb);
    const humLp = filt('lowpass', 420); humLp.connect(humGain);
    osc('sine', 50, humLp); osc('sawtooth', 100.4, gain(0.25, humLp)); osc('sine', 150, gain(0.12, humLp));

    // --- distant electrical buzz (always faint)
    buzzGain = gain(0.0, amb);
    const bz = filt('bandpass', 3100, 14); bz.connect(buzzGain); loopNoise(bz);

    // --- flashlight buzz (low battery, tunnels)
    flashGain = gain(0, sfx);
    const fl = filt('lowpass', 900); fl.connect(flashGain);
    osc('square', 118, gain(0.5, fl)); osc('sawtooth', 237, gain(0.3, fl));

    // --- drone wheel: filtered noise + a faint motor tone, panned in 3D
    wheelPan = a.createPanner();
    wheelPan.panningModel = 'HRTF'; wheelPan.distanceModel = 'inverse';
    wheelPan.refDistance = 2.5; wheelPan.maxDistance = 60; wheelPan.rolloffFactor = 1.6;
    wheelFilter = filt('lowpass', 500, 0.8);
    wheelGain = gain(0, wheelFilter);
    wheelFilter.connect(wheelPan); wheelPan.connect(sfx); wheelPan.connect(verb);
    loopNoise(wheelGain);
    osc('sine', 220, gain(0.05, wheelGain));
  }

  function out(spatial) { return spatial || sfx; }

  // 3D panner for a one-shot at world (x, y, z).
  function panAt(x, y, z, ref) {
    const p = a.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref || 2; p.maxDistance = 80; p.rolloffFactor = 1.5;
    setPos(p, x, y, z);
    p.connect(sfx); p.connect(verb);
    return p;
  }
  function setPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
  }

  function updateListener() {
    const L = a.listener, P = GameState.player, cam = GameState.camera;
    if (!cam) return;
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    const y = (P.y || 0) + 1.6;
    if (L.positionX) {
      L.positionX.value = P.x; L.positionY.value = y; L.positionZ.value = P.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(P.x, y, P.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }

  // Envelope helper: points are [time offset, gain].
  function env(g, t0, pts) {
    g.gain.setValueAtTime(0.0001, t0);
    pts.forEach(p => g.gain.linearRampToValueAtTime(Math.max(0.0001, p[1]), t0 + p[0]));
  }

  // ------------------------------------------------------------------ one-shots
  // dest: a node to feed (defaults to the sfx bus). send: also feed the reverb.
  function noiseShot(dest, t0, secs, ftype, f, q, pts, send) {
    const n = a.createBufferSource(); n.buffer = noiseBuf;
    const fl = filt(ftype, f, q), g = a.createGain();
    env(g, t0, pts);
    n.connect(fl); fl.connect(g); g.connect(dest);
    if (send) g.connect(verb);
    n.start(t0, Math.random() * 2); n.stop(t0 + secs);
    return fl;
  }
  function toneShot(dest, t0, type, f0, f1, secs, pts, send) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + secs);
    env(g, t0, pts);
    o.connect(g); g.connect(dest);
    if (send) g.connect(verb);
    o.start(t0); o.stop(t0 + secs + 0.05);
    return o;
  }

  const SHOTS = {
    intercom_static: t => noiseShot(sfx, t, 0.5, 'bandpass', 2200, 0.7, [[0.04, 0.1], [0.25, 0.06], [0.45, 0]]),
    door_slam: t => {
      toneShot(sfx, t, 'sine', 95, 28, 0.4, [[0.01, 0.55], [0.55, 0.001]], true);
      noiseShot(sfx, t, 0.3, 'lowpass', 500, 0, [[0.005, 0.35], [0.28, 0.001]], true);
    },
    scream_distant: t => {
      const o = toneShot(sfx, t, 'sawtooth', 520, 520, 1.6, [[0.12, 0.07], [0.9, 0.07], [1.5, 0.0005]], true);
      o.frequency.linearRampToValueAtTime(930, t + 0.5); o.frequency.linearRampToValueAtTime(610, t + 1.3);
      const lfo = a.createOscillator(); lfo.frequency.value = 7;
      const lg = a.createGain(); lg.gain.value = 28; lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + 1.6);
    },
    gas_hiss: t => noiseShot(sfx, t, 13, 'highpass', 2600, 0, [[1.5, 0.09], [8, 0.13], [12.5, 0.09], [13, 0]]),
    breath: t => noiseShot(sfx, t, 1.2, 'bandpass', 500 + Math.random() * 500, 1.1, [[0.3, 0.18 + Math.random() * 0.06], [0.42, 0.05], [0.7, 0.14], [1.1, 0]]),
    choke: t => {
      const o = toneShot(sfx, t, 'sawtooth', 120 + Math.random() * 40, 120 + Math.random() * 40, 0.6, [[0.05, 0.1], [0.4, 0.08], [0.6, 0]]);
      const lfo = a.createOscillator(); lfo.frequency.value = 19;
      const lg = a.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.6);
      noiseShot(sfx, t, 0.5, 'bandpass', 900, 3, [[0.01, 0.1], [0.45, 0.001]]);
    },
    monitor_beep: t => toneShot(sfx, t, 'sine', 880, 880, 0.12, [[0.005, 0.13], [0.11, 0.0001]]),
    monitor_flat: t => toneShot(sfx, t, 'sine', 880, 880, 1.6, [[0.02, 0.12], [1.5, 0.12], [1.6, 0]]),
    gasp: t => {
      const fl = noiseShot(sfx, t, 0.7, 'bandpass', 400, 1.4, [[0.4, 0.26], [0.55, 0.0001]]);
      fl.frequency.setValueAtTime(400, t); fl.frequency.linearRampToValueAtTime(1300, t + 0.45);
    },
    alarm: t => {
      const o = toneShot(sfx, t, 'square', 760, 760, 4, [[0.05, 0.05], [3.8, 0.05], [4, 0]], true);
      for (let i = 0; i < 10; i++) o.frequency.setValueAtTime(i % 2 ? 560 : 760, t + i * 0.4);
    },
    plug_pull: t => {
      noiseShot(sfx, t, 0.4, 'highpass', 1800, 0, [[0.01, 0.3], [0.35, 0]]);
      toneShot(sfx, t, 'sine', 220, 40, 0.5, [[0.01, 0.35], [0.6, 0.001]], true);
    },
    power_down: t => {
      const o = toneShot(sfx, t, 'sawtooth', 180, 22, 2.2, [[0.05, 0.25], [2.0, 0.15], [2.3, 0]]);
      o.disconnect(); // re-route through a lowpass
      const lp = filt('lowpass', 400), g = a.createGain();
      env(g, t, [[0.05, 0.25], [2.0, 0.15], [2.3, 0]]); o.connect(lp); lp.connect(g); g.connect(sfx);
    },

    // ----- gameplay
    footstep: (t, d) => {
      const tunnel = d.floor === -1;
      const v = d.crouch ? 0.05 : d.sprint ? 0.34 : 0.17;
      noiseShot(sfx, t, 0.16, 'lowpass', tunnel ? 700 : 1100, 0.7, [[0.004, v], [0.12, 0.0005]], true);
      toneShot(sfx, t, 'sine', d.sprint ? 90 : 70, 40, 0.1, [[0.004, v * 1.1], [0.1, 0.0005]]);
      if (tunnel) noiseShot(sfx, t + 0.01, 0.1, 'bandpass', 3200, 2, [[0.004, v * 0.35], [0.08, 0.0005]], true);   // wet slap
    },
    door_lock: (t, d) => {
      const o = d && d.door ? panAt(d.door.x, d.door.floor * H + 1.2, d.door.z, 4) : sfx;
      toneShot(o, t, 'square', 140, 55, 0.22, [[0.004, 0.5], [0.22, 0.001]], true);
      noiseShot(o, t, 0.2, 'lowpass', 900, 0, [[0.004, 0.45], [0.18, 0.001]], true);
      toneShot(o, t + 0.12, 'sine', 62, 38, 0.3, [[0.004, 0.5], [0.3, 0.001]], true);
    },
    door_unlock: (t, d) => {
      const o = d && d.door ? panAt(d.door.x, d.door.floor * H + 1.2, d.door.z, 4) : sfx;
      toneShot(o, t, 'square', 300, 220, 0.07, [[0.003, 0.14], [0.07, 0.001]], true);
    },
    camera_click: (t, d) => {
      const P = GameState.player;
      const o = panAt(d.x, (P.floor || 0) * H + 3, d.z, 2);
      toneShot(o, t, 'square', 2400, 1800, 0.025, [[0.002, 0.22], [0.025, 0.001]]);
      noiseShot(o, t, 0.05, 'bandpass', 4200, 3, [[0.002, 0.18], [0.04, 0.001]]);
    },
    camera_alert: t => toneShot(sfx, t, 'sine', 1320, 1320, 0.35, [[0.01, 0.12], [0.34, 0.001]]),
    flashlight: (t, on) => {
      toneShot(sfx, t, 'square', on ? 1800 : 1300, on ? 1300 : 900, 0.03, [[0.002, 0.2], [0.03, 0.001]]);
      noiseShot(sfx, t, 0.05, 'highpass', 3000, 0, [[0.002, 0.1], [0.05, 0.001]]);
    },
    heartbeat: (t, d) => {
      const v = 0.06 + 0.5 * d.threat * d.threat + (d.hiding ? 0.12 : 0);
      toneShot(sfx, t, 'sine', 62, 38, 0.16, [[0.01, v], [0.15, 0.001]]);
      toneShot(sfx, t + 0.17, 'sine', 54, 34, 0.14, [[0.01, v * 0.7], [0.13, 0.001]]);
    },
    drone_ping: (t, d) => {
      const Dd = Drone.data;
      const chase = d.state === 'CHASE';
      const o = panAt(Dd.x, Dd.floor * H + 0.9, Dd.z, 3);
      const f = chase ? 3300 : 2600;
      const v = chase ? 0.2 : 0.12;
      toneShot(o, t, 'sine', f, f * 0.985, 0.55, [[0.004, v], [0.5, 0.0008]], true);
      toneShot(o, t + 0.02, 'sine', f * 2, f * 1.99, 0.3, [[0.004, v * 0.25], [0.28, 0.0008]]);
    },
    drone_spot: t => {      // the tone rises when it spots you
      toneShot(sfx, t, 'sawtooth', 380, 1500, 0.9, [[0.05, 0.1], [0.7, 0.13], [0.9, 0.001]], true);
      toneShot(sfx, t, 'sine', 1900, 3300, 0.9, [[0.05, 0.08], [0.8, 0.1], [0.9, 0.001]]);
    },
    drone_lost: t => toneShot(sfx, t, 'sine', 1600, 600, 0.8, [[0.03, 0.08], [0.8, 0.001]], true),
    locker: (t, d) => {
      const dn = d === 'in';
      noiseShot(sfx, t, 0.45, 'bandpass', 380, 5, [[0.1, 0.12], [0.3, 0.07], [0.45, 0.001]], true);
      toneShot(sfx, t + 0.3, 'square', dn ? 110 : 140, 60, 0.14, [[0.004, 0.2], [0.14, 0.001]], true);
    },
    paper: t => noiseShot(sfx, t, 0.35, 'bandpass', 5200, 0.6, [[0.04, 0.09], [0.15, 0.03], [0.3, 0.07], [0.35, 0.001]]),
    checkpoint: t => {
      toneShot(sfx, t, 'sine', 330, 330, 0.9, [[0.04, 0.07], [0.9, 0.001]], true);
      toneShot(sfx, t + 0.18, 'sine', 247, 247, 1.1, [[0.04, 0.06], [1.1, 0.001]], true);
    },
    ladder: t => {
      for (let i = 0; i < 5; i++) toneShot(sfx, t + i * 0.28, 'square', 420 + i * 12, 260, 0.1, [[0.003, 0.14], [0.1, 0.001]], true);
    },

    // ----- ambience
    vent: t => {
      for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++)
        noiseShot(sfx, t + i * 0.09, 0.03, 'bandpass', 2500 + Math.random() * 800, 4, [[0.001, 0.06], [0.03, 0.0005]]);
    },
    drip: t => {
      const f = rnd(900, 1500);
      toneShot(sfx, t, 'sine', f, f * 0.55, 0.12, [[0.003, 0.11], [0.12, 0.0005]], true);
      toneShot(sfx, t + 0.2, 'sine', f * 0.8, f * 0.5, 0.09, [[0.003, 0.03], [0.09, 0.0005]], true);
    },
    pipe: t => {
      const f = rnd(60, 110), o = toneShot(sfx, t, 'sawtooth', f, f * rnd(0.7, 1.15), 2.8, [[0.9, 0.09], [1.8, 0.07], [2.8, 0.001]], true);
      o.disconnect();
      const lp = filt('bandpass', f * 3, 3), g = a.createGain();
      env(g, t, [[0.9, 0.09], [1.8, 0.07], [2.8, 0.001]]); o.connect(lp); lp.connect(g); g.connect(sfx); g.connect(verb);
    },
    clang: t => {         // far-off metal, used on the menu
      const f = rnd(180, 330);
      [1, 2.76, 5.4].forEach((m, i) => toneShot(sfx, t, 'sine', f * m, f * m, 3.2, [[0.004, 0.06 / (i + 1)], [3.2, 0.0004]], true));
    }
  };

  function play(name, data) {
    if (!a || a.state !== 'running') return;
    const fn = SHOTS[name];
    if (!fn) return;
    try { fn(a.currentTime + 0.005, data); } catch (e) { if (C.DEBUG && C.DEBUG.ENABLED) console.error('Sound.' + name, e); }   // never let audio break the game
  }

  // Skipped a scene: cut every ringing one-shot.
  function stopOneShots() {
    if (!a) return;
    sfx.disconnect();
    sfx = gain(1, master);
    wheelPan.disconnect(); wheelPan.connect(sfx); wheelPan.connect(verb);
    flashGain.disconnect(); flashGain.connect(sfx);
  }

  function skitterOnce(P) {
    const ang = rnd(0, Math.PI * 2), r = rnd(5, 11);
    const x = P.x + Math.cos(ang) * r, z = P.z + Math.sin(ang) * r;
    const o = panAt(x, (P.y || 0) + 0.2, z, 2), t0 = a.currentTime;
    for (let i = 0; i < 9; i++) noiseShot(o, t0 + i * 0.045 + Math.random() * 0.02, 0.03, 'bandpass', rnd(3000, 5500), 4, [[0.002, 0.07], [0.03, 0.0005]]);
  }

  // ------------------------------------------------------------------ per-frame
  function ramp(param, v, tc) { param.setTargetAtTime(v, a.currentTime, tc || 0.3); }

  function update(dt) {
    if (!a || a.state !== 'running') return;
    const S = GameState.state, P = GameState.player;
    const inGame = S === 'PLAYING' || S === 'CUTSCENE';
    const quiet = S === 'DEAD' || S === 'ENDING';        // death scene and credits are silent apart from their own cues
    const tunnels = P.floor === -1 && inGame;

    updateListener();

    // master / pause duck
    ramp(master.gain, muted ? 0 : (GameState.paused ? 0.25 : 0.9), 0.15);

    // menu pad: loud on the menu, thin during the opening, gone in play
    const padT = S === 'MENU' ? 0.2 : (S === 'CUTSCENE' ? 0.04 : 0);
    ramp(padGain.gain, padT, 0.8);

    // ambient layers
    const target = quiet ? 0 : (S === 'MENU' ? 0.0 : 1);
    level += (target - level) * Math.min(1, dt * (quiet ? 3 : 0.8));
    // server hum grows toward ARIA's core
    const dx = P.x - SERVER.x, dz = P.z - SERVER.z, dy = (P.y || 0) - SERVER.y;
    const near = clamp01(1 - Math.hypot(dx, dz, dy) / 42);
    ramp(humGain.gain, level * (0.035 + 0.3 * near * near), 0.4);
    ramp(buzzGain.gain, level * 0.012, 0.5);

    // flashlight buzz on a low battery in the tunnels
    const F = C.FLASHLIGHT;
    const low = P.flashlightOn && P.floor === -1 && P.battery < F.BATTERY_LOW;
    ramp(flashGain.gain, low ? 0.02 + 0.05 * (1 - P.battery / F.BATTERY_LOW) : 0, 0.15);

    // drone wheel (spatial, loudest on the same floor)
    const Dd = Drone.data;
    if (Dd && lastDrone.floor === Dd.floor) droneSpeed = Math.hypot(Dd.x - lastDrone.x, Dd.z - lastDrone.z) / Math.max(dt, 1e-3);
    else droneSpeed = 0;
    lastDrone.x = Dd.x; lastDrone.z = Dd.z; lastDrone.floor = Dd.floor;
    const active = Dd.state !== 'OFF' && Dd.state !== 'HOLD' && inGame && !quiet;
    setPos(wheelPan, Dd.x, Dd.floor * H + 0.3, Dd.z);
    const rolling = clamp01(droneSpeed / 4.4);
    ramp(wheelGain.gain, active ? 0.015 + 0.35 * rolling : 0, 0.12);
    ramp(wheelFilter.frequency, (Dd.floor === P.floor ? 380 : 140) + 700 * rolling, 0.2);

    // timed random events
    if (!inGame || quiet) {
      if (S === 'MENU') {
        timers.clang -= dt;
        if (timers.clang <= 0) { timers.clang = rnd(9, 20); play('clang'); }
      }
      return;
    }
    const tick = k => { timers[k] -= dt; return timers[k] <= 0; };
    if (tick('vent')) { timers.vent = rnd(2.5, 8); if (!tunnels) play('vent'); }
    if (tunnels) {
      if (tick('drip')) { timers.drip = rnd(0.8, 4.5); play('drip'); }
      if (tick('pipe')) { timers.pipe = rnd(14, 34); play('pipe'); }
      if (tick('skitter')) { timers.skitter = rnd(18, 45); skitterOnce(P); }
      if (tick('breath')) {                       // the player's own breathing, loud down here
        timers.breath = P.sprinting ? 0.85 : 2.8;
        play('breath');
      }
    }
  }

  // ------------------------------------------------------------------ wiring
  function setMuted(v) { muted = !!v; }

  function init() {
    const first = () => { unlock(); };
    ['pointerdown', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, first, { passive: true }));
    window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) muted = !muted; });

    const on = (name, fn) => GameState.on(name, fn);
    Object.keys(SHOTS).forEach(name => {
      // events that carry their own arguments are wired explicitly below
      if (['footstep', 'heartbeat', 'flashlight', 'locker', 'paper', 'checkpoint', 'ladder', 'vent', 'drip', 'pipe', 'clang', 'drone_lost'].indexOf(name) >= 0) return;
      on(name, d => play(name, d));
    });
    on('beat', d => {
      if (GameState.state !== 'PLAYING') return;
      play('heartbeat', { threat: d.threat, hiding: !!GameState.player.hiding });
    });
    on('hide_enter', () => play('locker', 'in'));
    on('hide_exit', () => play('locker', 'out'));
    on('inspect', () => play('paper'));
    on('checkpoint', () => play('checkpoint'));
    on('flashlight', d => play('flashlight', d));
    on('ladder', () => play('ladder'));
    on('drone_lost', () => play('drone_lost'));
    Player.onStep = function (S) { play('footstep', { floor: S.floor, sprint: S.sprinting, crouch: S.crouching }); };
  }

  return { init: init, update: update, unlock: unlock, stopOneShots: stopOneShots, setMuted: setMuted, isMuted: () => muted, play: play };
})();
