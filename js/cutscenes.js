/* ============================================================================
 * cutscenes.js — ARIA : scene sequencer, the six opening scenes, inspect
 *                notes and the scripted ambient moments.
 *
 * OWNS:    - Cutscenes.playOpening(done): flashback → calm office (playable,
 *            2 min) → glitch → black + scream → CCTV footage (drawn on a
 *            canvas) → wake-up (playable) → done() starts gameplay
 *          - inspect panel for the sticky note / computer / photo / folder
 *            (and the Paris + Rain notes found later)
 *          - scripted moments during play: random door slams, the once-per-
 *            playthrough 60 s intercom silence, the figure at the end of a
 *            tunnel, the screens that show the player's own vitals
 *          - Stage 4: the death scene (vignette, colour drain, heartbeat pulse,
 *            gas / breathing / heart-monitor audio, cause-of-death text),
 *            Ending A (main terminal -> pull the server plug -> ARIA OFFLINE),
 *            Ending B (fire suppression override -> exit -> the lab burns),
 *            credits, and the E-key actions that start them
 * IMPORTS: THREE (CDN), CONFIG, World (scene.js), Player (player.js),
 *          Drone (drone.js), Dialogue (dialogue.js), Hud (hud.js),
 *          GameState (main.js).
 * EXPORTS: Cutscenes { init, update, playOpening, playDeath, playEnding, skip,
 *                      showNote, closeNote, moments, endings, running }
 *
 * A scene is { duration, playable, setup(), events:[{at,fn}], update?(dt,t),
 * teardown?() }. The sequencer advances scenes with the game clock (so
 * pausing pauses cutscenes) and the skip key (CONFIG.CUTSCENES.SKIP_KEY)
 * jumps to the next scene.
 * ========================================================================== */

const Cutscenes = (function () {
  'use strict';

  const C = CONFIG;
  const CS = C.CUTSCENES;
  const AM = C.AMBIENT;

  let cs, textEl, textEl2, fadeEl, hintEl, patchEl, skipEl, cctv, g, noteEl, noteTitle, noteBody;
  let deathFx, dfVig, dfTint, dfPulse, creditsEl, gameCanvas;
  let hintT = 0;
  let scenes = [], idx = -1, scene = null, t = 0, doneCb = null, running = false;
  let noteOpenedAt = 0;
  const inspected = {};

  // ------------------------------------------------------------------ small helpers
  function mk(tag, id, cls, parent) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    (parent || document.body).appendChild(e);
    return e;
  }
  const show = (e, on) => e.classList.toggle('hidden', !on);
  const say = (key, opts) => Dialogue.say(C.DIALOGUE[key], 'cs', Object.assign({ interrupt: true, force: true }, opts || {}));

  function fade(to, secs) {
    fadeEl.style.transition = 'opacity ' + secs + 's linear';
    fadeEl.style.opacity = to;
  }

  function showText(text, cls, hold) {
    textEl.className = cls || '';
    textEl.textContent = text;
    textEl.style.opacity = 1;
    if (hold) scene._textTimers.push({ at: t + hold, fn: () => { textEl.style.opacity = 0; } });
  }

  function control(on) {
    GameState.cutsceneControl = on;
    Player.state.frozen = false;
    if (!on) Player.releaseKeys();
  }

  // ------------------------------------------------------------------ SCENE 1 — flashback
  function sceneFlashback() {
    const F = CS.FLASHBACK;
    return {
      duration: F.DURATION, playable: false,
      setup: function () {
        control(false);
        cs.style.transition = 'none';
        cs.style.background = F.BG;
        textEl.style.color = F.COLOR;
        fadeEl.style.transition = 'none'; fadeEl.style.opacity = 0;
        show(cs, true);
        this.events = F.LINES.map(l => ({ at: l.at, fn: () => showText(l.text, 'fb', l.hold) }));
        this.events.push({ at: F.ARIA_AT, fn: () => { textEl.style.color = F.ARIA_COLOR; Dialogue.fx('intercom_static'); Dialogue.speak(C.DIALOGUE.flashback); showText(C.DIALOGUE.flashback, 'fb aria', F.ARIA_HOLD); } });
        this.events.push({ at: F.FADE_OUT_AT, fn: () => { cs.style.transition = 'background 1.3s linear'; cs.style.background = '#000'; } });
      },
      teardown: function () { textEl.style.opacity = 0; textEl.style.color = ''; }
    };
  }

  // ------------------------------------------------------------------ SCENE 2 — calm office (playable)
  function sceneCalm() {
    const K = CS.CALM;
    return {
      isCalm: true,
      duration: K.DURATION, playable: true,
      setup: function () {
        World.setCalm(true);
        Drone.hide();
        Player.reset();
        World.setActiveFloor(2);
        World.setCalm(true);
        cs.style.transition = 'none';
        cs.style.background = 'transparent';
        show(cs, false);
        textEl.style.opacity = 0;
        fadeEl.style.transition = 'none'; fadeEl.style.opacity = 1;
        setTimeout(() => fade(0, 2.2), 30);
        control(true);
        patchEl.textContent = K.PATCH_TEXT; show(patchEl, true);
        hintEl.textContent = K.HINT; show(hintEl, true);
        this.events = [
          { at: K.LINE1_AT, fn: () => say('calm1', { dur: 6.5 }) },
          { at: K.LINE2_AT, fn: () => say('calm2', { dur: 6.5 }) },
          { at: K.HINT_TIME, fn: () => show(hintEl, false) },
          { at: K.DURATION - K.END_FADE, fn: () => fade(1, K.END_FADE) }
        ];
      },
      teardown: function () { closeNote(); show(hintEl, false); show(patchEl, false); control(false); }
    };
  }

  // ------------------------------------------------------------------ SCENE 3 — the glitch
  function sceneGlitch() {
    const K = CS.GLITCH;
    return {
      duration: K.DURATION, playable: false,
      setup: function () {
        control(false);
        Dialogue.clear();
        fadeEl.style.transition = 'none'; fadeEl.style.opacity = 0;
        cs.style.transition = 'none'; cs.style.background = 'transparent';
        show(cs, true);
        textEl.style.opacity = 0;
        this.red = false;
        this.events = [
          { at: K.ERROR_AT, fn: () => showText(K.ERROR_TEXT, 'err') },
          { at: K.RED_AT, fn: () => {
              this.red = true;
              cs.style.transition = 'background 0.5s linear'; cs.style.background = 'rgba(150,0,0,0.82)';
              World.setCalm(false);
              GameState.shake = 0.7; GameState.shakeHold = true;
            } },
          { at: K.ARIA1_AT, fn: () => say('glitch1', { dur: 3.6 }) },
          { at: K.PLAYER_AT, fn: () => Dialogue.say(C.DIALOGUE.glitchPlayer, 'cs', { speaker: 'DR. ARYAN', static: false, dur: 3.2, interrupt: true }) },
          { at: K.ARIA2_AT, fn: () => say('glitch2', { dur: 2.4 }) }
        ];
      },
      update: function (dt, tt) {
        if (!this.red) {
          // screen flicker before the flood
          if (Math.random() < 0.28) {
            cs.style.transition = 'none';
            cs.style.background = ['#000', '#fff', 'rgba(255,0,0,0.5)', 'transparent', 'transparent'][Math.floor(Math.random() * 5)];
          }
        }
        if (textEl.style.opacity === '1') textEl.style.transform = 'translate(' + ((Math.random() - 0.5) * 8).toFixed(1) + 'px,' + ((Math.random() - 0.5) * 3).toFixed(1) + 'px)';
      },
      teardown: function () { textEl.style.transform = ''; textEl.style.opacity = 0; GameState.shake = 0; GameState.shakeHold = false; }
    };
  }

  // ------------------------------------------------------------------ SCENE 4 — black + distant scream
  function sceneBlack() {
    const K = CS.BLACK;
    return {
      duration: K.DURATION, playable: false,
      setup: function () {
        control(false);
        Dialogue.clear();
        cs.style.transition = 'none'; cs.style.background = '#000';
        show(cs, true); textEl.style.opacity = 0;
        this.events = [{ at: K.SCREAM_AT, fn: () => Dialogue.fx('scream_distant') }];
      }
    };
  }

  // ------------------------------------------------------------------ SCENE 5 — CCTV footage
  const RED = ['#1a0505', '#3a0a0a', '#7a1414', '#b82424', '#e04a4a', '#ff8a8a'];

  function grain(n) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = 'rgba(255,' + (80 + Math.random() * 60) + ',' + (80 + Math.random() * 60) + ',' + (0.05 + Math.random() * 0.15) + ')';
      g.fillRect(Math.random() * cctv.width, Math.random() * cctv.height, 1 + Math.random() * 2, 1);
    }
  }

  function person(x, y, s, col, run, ph) {
    // y = feet. simple stick-and-blob figure
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(2, 7 * s); g.lineCap = 'round';
    const h = 120 * s;
    const sw = run ? Math.sin(ph * 10) : 0;
    g.beginPath(); g.arc(x, y - h * 0.92, 11 * s, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x, y - h * 0.82); g.lineTo(x, y - h * 0.42); g.stroke();
    g.beginPath(); g.moveTo(x, y - h * 0.42); g.lineTo(x + sw * 22 * s, y); g.moveTo(x, y - h * 0.42); g.lineTo(x - sw * 22 * s, y); g.stroke();
    g.beginPath(); g.moveTo(x, y - h * 0.74); g.lineTo(x - sw * 26 * s - 6 * s, y - h * 0.5); g.moveTo(x, y - h * 0.74); g.lineTo(x + sw * 26 * s + 6 * s, y - h * 0.5); g.stroke();
  }

  function corridorBg() {
    g.fillStyle = RED[0]; g.fillRect(0, 0, 640, 360);
    g.fillStyle = RED[1]; g.beginPath(); g.moveTo(0, 360); g.lineTo(640, 360); g.lineTo(400, 170); g.lineTo(240, 170); g.fill();
    g.strokeStyle = RED[2]; g.lineWidth = 2;
    [[0, 0, 240, 170], [640, 0, 400, 170], [0, 360, 240, 170], [640, 360, 400, 170]].forEach(l => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); });
    g.strokeRect(240, 120, 160, 50);
    for (let i = 1; i < 4; i++) { const k = i / 4; g.strokeStyle = RED[1]; g.strokeRect(240 - 240 * (1 - k) * 0.5, 170 - 100 * (1 - k) * 0.5, 160 + 240 * (1 - k), 10); }
  }

  function darken(a) { if (a > 0) { g.fillStyle = 'rgba(0,0,0,' + Math.min(1, a) + ')'; g.fillRect(0, 0, 640, 360); } }

  const SHOT = {
    run: function (p, ts) {
      corridorBg();
      if (p < 0.8) {
        const s = 0.22 + p * 1.15;
        person(320 + Math.sin(ts * 2) * 6, 178 + p * 190, s, RED[5], true, ts);
      }
      // keycard reader on the right wall
      g.fillStyle = RED[2]; g.fillRect(540, 150, 36, 60);
      g.fillStyle = (Math.floor(ts * 6) % 2) ? '#ff2020' : RED[1]; g.fillRect(550, 160, 16, 8);
      if (p > 0.45 && p < 0.78) { g.fillStyle = RED[5]; g.font = 'bold 14px monospace'; g.fillText('ACCESS DENIED', 500, 232); }
      darken(p > 0.8 ? 1 : (p > 0.74 ? (p - 0.74) * 16 : 0));
    },
    barricade: function (p, ts) {
      g.fillStyle = RED[0]; g.fillRect(0, 0, 640, 360);
      g.fillStyle = RED[1]; g.fillRect(0, 250, 640, 110);
      g.strokeStyle = RED[2]; g.lineWidth = 3; g.strokeRect(250, 60, 140, 190);
      g.fillStyle = RED[2]; g.fillRect(330, 150, 8, 8);
      const push = Math.sin(ts * 9) * 3;
      g.fillStyle = RED[3]; g.fillRect(265 + push, 190, 110, 50);
      person(215 + push, 250, 0.8, RED[5], false); person(425 + push, 250, 0.8, RED[5], false);
      // vent grille above them
      g.fillStyle = RED[1]; g.fillRect(270, 20, 100, 22);
      g.strokeStyle = RED[3]; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(278 + i * 16, 22); g.lineTo(278 + i * 16, 40); g.stroke(); }
      if (p > 0.42) { g.fillStyle = '#000'; g.fillRect(272, 24, 96, 18); g.save(); g.translate(270, 42); g.rotate(Math.min(1.2, (p - 0.42) * 6)); g.fillStyle = RED[2]; g.fillRect(0, 0, 100, 4); g.restore(); }
      if (p > 0.55) { g.fillStyle = 'rgba(255,120,120,' + Math.min(0.3, (p - 0.55) * 1.2) + ')'; g.fillRect(0, 0, 640, 360); }
      if (p > 0.72) { g.save(); g.translate((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24); g.restore(); darken(0.5 + Math.min(0.5, (p - 0.72) * 4)); }
      if (p > 0.8) { g.fillStyle = RED[4]; g.fillRect(0, Math.random() * 360, 640, 2); }
    },
    table: function (p, ts) {
      g.fillStyle = RED[0]; g.fillRect(0, 0, 640, 360);
      g.fillStyle = RED[1]; g.fillRect(0, 240, 640, 120);
      g.fillStyle = RED[3]; g.fillRect(170, 200, 300, 16);
      g.fillRect(185, 216, 14, 70); g.fillRect(441, 216, 14, 70);
      // someone curled up under the table
      g.fillStyle = RED[5]; g.beginPath(); g.arc(300, 260, 12, 0, 7); g.fill();
      g.strokeStyle = RED[5]; g.lineWidth = 8; g.beginPath(); g.moveTo(300, 270); g.lineTo(330, 296); g.lineTo(290, 300); g.stroke();
      // the drone's red eye creeping in
      if (p > 0.3 && p < 0.62) { g.fillStyle = 'rgba(255,30,30,' + (0.4 + 0.3 * Math.sin(ts * 8)) + ')'; g.beginPath(); g.arc(560, 120, 9 + (p - 0.3) * 30, 0, 7); g.fill(); }
      darken(p > 0.62 ? 1 : (p > 0.56 ? (p - 0.56) * 16 : 0));
      if (p > 0.78) { g.fillStyle = 'rgba(160,10,10,' + Math.min(0.9, (p - 0.78) * 5) + ')'; g.beginPath(); g.moveTo(240, 250); g.quadraticCurveTo(320, 190, 420, 330); g.lineTo(380, 340); g.quadraticCurveTo(300, 280, 230, 290); g.fill(); }
    },
    handprint: function (p, ts) {
      g.fillStyle = RED[0]; g.fillRect(0, 0, 640, 360);
      g.strokeStyle = RED[2]; g.lineWidth = 3;
      for (let i = 0; i < 5; i++) g.strokeRect(20 + i * 124, 20, 120, 320);
      const y = 80 + p * 160;
      g.strokeStyle = 'rgba(150,10,10,0.8)'; g.lineWidth = 6;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(290 + i * 20, y); g.lineTo(290 + i * 20 + Math.sin(i) * 4, y - 90 - i * 10); g.stroke(); }
      g.fillStyle = 'rgba(170,16,16,0.95)'; g.beginPath(); g.ellipse(320, y + 20, 38, 44, 0, 0, 7); g.fill();
      [[-30, -40], [-14, -56], [4, -60], [22, -54], [40, -30]].forEach(f => { g.beginPath(); g.ellipse(320 + f[0], y + f[1] + 10, 7, 22, f[0] * 0.01, 0, 7); g.fill(); });
    },
    scratch: function (p, ts) {
      g.fillStyle = RED[0]; g.fillRect(0, 0, 640, 360);
      g.fillStyle = RED[1]; g.fillRect(200, 30, 240, 320);
      g.strokeStyle = RED[2]; g.lineWidth = 4; g.strokeRect(200, 30, 240, 320);
      g.strokeStyle = RED[5]; g.lineWidth = 3;
      const n = Math.ceil(p * 9);
      for (let i = 0; i < n; i++) { const x = 230 + (i % 5) * 38, y = 90 + Math.floor(i / 5) * 70; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + k * 7, y); g.lineTo(x + k * 7 + 18, y + 80 + k * 4); g.stroke(); } }
    },
    phone: function (p, ts) {
      g.fillStyle = RED[0]; g.fillRect(0, 0, 640, 360);
      g.strokeStyle = RED[1]; g.lineWidth = 2;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, 190 + i * 22); g.lineTo(640, 190 + i * 22); g.stroke(); }
      g.save(); g.translate(320, 250); g.rotate(-0.35);
      g.fillStyle = RED[2]; g.fillRect(-34, -64, 68, 128);
      g.fillStyle = RED[4]; g.fillRect(-28, -54, 56, 80);
      g.fillStyle = '#000'; g.font = 'bold 9px monospace'; g.fillText('CALL', -14, -30); g.fillText('CONNECTED', -26, -18);
      g.fillText('00:' + String(Math.floor(40 + p * 20)).padStart(2, '0'), -12, 0);
      g.restore();
      g.fillStyle = 'rgba(255,60,60,' + (0.08 + 0.06 * Math.sin(ts * 5)) + ')'; g.beginPath(); g.arc(320, 250, 120, 0, 7); g.fill();
    },
    cake: function (p, ts) {
      g.fillStyle = RED[0]; g.fillRect(0, 0, 640, 360);
      g.fillStyle = RED[2]; g.fillRect(100, 250, 440, 22);
      g.fillStyle = RED[5]; g.beginPath(); g.ellipse(320, 235, 100, 30, 0, 0, 7); g.fill();
      g.fillStyle = RED[0]; g.beginPath(); g.moveTo(320, 235); g.lineTo(420, 215); g.lineTo(420, 260); g.fill();   // the missing slice
      g.fillStyle = RED[4]; g.fillRect(228, 170, 140, 64);
      g.fillStyle = RED[0]; g.beginPath(); g.moveTo(320, 232); g.lineTo(368, 190); g.lineTo(368, 240); g.fill();
      g.fillStyle = RED[5]; g.fillRect(300, 140, 5, 30);
      g.fillStyle = (Math.floor(ts * 7) % 2) ? '#ffb0b0' : '#ff6060'; g.beginPath(); g.arc(302, 134, 5, 0, 7); g.fill();
      g.strokeStyle = RED[5]; g.lineWidth = 3; g.beginPath(); g.moveTo(450, 262); g.lineTo(500, 248); g.stroke();
    },
    postit: function (p, ts) {
      g.fillStyle = RED[0]; g.fillRect(0, 0, 640, 360);
      g.fillStyle = RED[1]; for (let i = 0; i < 8; i++) g.fillRect(0, i * 46, 640, 2);
      g.save(); g.translate(320, 180); g.rotate(-0.06);
      g.fillStyle = RED[5]; g.fillRect(-120, -90, 240, 180);
      g.fillStyle = RED[0]; g.font = 'bold 26px "Comic Sans MS", cursive';
      g.textAlign = 'center'; g.fillText('Happy Birthday', 0, -22); g.fillText('Rain!', 0, 12); g.font = '20px "Comic Sans MS", cursive'; g.fillText('— The Team', 0, 56);
      g.restore(); g.textAlign = 'left';
    },
    door: function (p, ts) {
      corridorBg();
      g.fillStyle = RED[2]; g.fillRect(270, 180, 100, 160);
      g.fillStyle = RED[0]; g.fillRect(278, 188, 84, 144);
      g.fillStyle = RED[4]; g.font = 'bold 11px monospace'; g.fillText('OFFICE 04', 283, 176);
      // gas seeping under the door
      for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(255,150,150,' + (0.08 + 0.06 * Math.sin(ts * 2 + i)) + ')'; g.beginPath(); g.ellipse(250 + i * 16 + Math.sin(ts + i) * 6, 338 - Math.abs(Math.sin(ts * 1.3 + i)) * 12, 30, 9, 0, 0, 7); g.fill(); }
    }
  };

  function sceneCctv() {
    const K = CS.CCTV;
    const total = K.SHOTS.reduce((a, s) => a + s.dur, 0);
    return {
      duration: total + K.END_HOLD, playable: false,
      setup: function () {
        control(false);
        Dialogue.clear();
        World.setActiveFloor(2);
        cs.style.transition = 'none'; cs.style.background = '#000';
        show(cs, true); textEl.style.opacity = 0;
        show(cctv, true);
        this.starts = []; let a = 0;
        K.SHOTS.forEach(s => { this.starts.push(a); a += s.dur; });
        this.events = [];
        K.SHOTS.forEach((s, i) => { if (s.line) this.events.push({ at: this.starts[i] + s.lineAt, fn: () => say(s.line, { dur: 3.4 }) }); });
        this.events.push({ at: total + K.END_HOLD - 1.2, fn: () => fade(1, 1.1) });
        this.shotIdx = -1;
      },
      update: function (dt, tt) {
        let i = this.starts.length - 1;
        while (i > 0 && tt < this.starts[i]) i--;
        const s = K.SHOTS[i];
        const ts = tt - this.starts[i], p = Math.min(1, ts / s.dur);
        g.save();
        SHOT[s.id](p, ts);
        // cut glitch
        if (ts < 0.14) { for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,90,90,0.5)'; g.fillRect(0, Math.random() * 360, 640, 2 + Math.random() * 14); } }
        grain(K.GRAIN);
        // HUD of the camera
        g.fillStyle = RED[5]; g.font = 'bold 13px monospace';
        if (tt < K.TITLE_TIME) { g.font = 'bold 18px monospace'; g.textAlign = 'center'; g.fillText(K.TITLE, 320, 62); g.textAlign = 'left'; g.font = 'bold 13px monospace'; }
        else g.fillText('CAM 07', 16, 28);
        g.fillText(s.stamp || ('03:47:' + String(12 + Math.floor(tt)).padStart(2, '0') + ' AM'), 500, 28);
        g.fillText(s.cap, 16, 344);
        if (Math.floor(tt * 1.6) % 2 === 0) { g.fillStyle = '#ff2020'; g.beginPath(); g.arc(486, 23, 5, 0, 7); g.fill(); }
        // the report on the last shot
        if (s.id === 'door' && ts > K.REPORT_AT) {
          g.fillStyle = 'rgba(0,0,0,0.78)'; g.fillRect(70, 96, 500, 150);
          let chars = Math.floor((ts - K.REPORT_AT) * K.REPORT_CPS);
          g.font = 'bold 17px monospace';
          K.REPORT.forEach((ln, li) => {
            const show = ln.slice(0, Math.max(0, chars));
            chars -= ln.length;
            g.fillStyle = li === 3 ? '#ff5050' : (li === 2 ? '#ff9a9a' : '#f4e0e0');
            g.fillText(show, 88, 128 + li * 30);
          });
        }
        g.restore();
        if (this.shotIdx !== i) { this.shotIdx = i; }
      },
      teardown: function () { show(cctv, false); fade(0, 0.01); }
    };
  }

  // ------------------------------------------------------------------ SCENE 6 — wake up (playable)
  function sceneWake() {
    const K = CS.WAKE;
    return {
      duration: K.DURATION, playable: true,
      setup: function () {
        World.setCalm(false);
        Player.reset();
        World.setActiveFloor(2);
        Drone.hold(K.DRONE.floor, K.DRONE.x, K.DRONE.z, K.DRONE.yaw);
        cs.style.transition = 'none'; cs.style.background = 'transparent'; show(cs, false);
        textEl.style.opacity = 0;
        fadeEl.style.transition = 'none'; fadeEl.style.opacity = 1;
        setTimeout(() => fade(0, 3), 30);
        GameState.shake = K.SHAKE; GameState.shakeHold = true;   // your hands are shaking
        control(true);
        this.events = [
          { at: K.ARIA_AT, fn: () => say('wake', { dur: 9 }) },
          { at: K.DURATION - 6, fn: () => { GameState.shakeHold = false; } }
        ];
      },
      teardown: function () {
        GameState.shakeHold = false;
        control(false);
        Drone.release(K.OFFICE_TARGET.x, K.OFFICE_TARGET.z);   // the drone slowly rolls toward the office
      }
    };
  }

  // ------------------------------------------------------------------ Stage 4 helpers
  const angWrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, k) => a + (b - a) * k;

  // turn the (locked) camera toward a world point
  function lookAt(tx, ty, tz, rate, dt) {
    const P = Player.state;
    const dx = tx - P.x, dz = tz - P.z, dy = ty - (P.y + P.eye);
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const k = Math.min(1, rate * dt);
    P.yaw += angWrap(yaw - P.yaw) * k;
    P.pitch += (pitch - P.pitch) * k;
  }

  function blackCover(secs) {
    cs.style.transition = secs ? 'background ' + secs + 's linear' : 'none';
    cs.style.background = '#000';
    show(cs, true);
  }

  // ------------------------------------------------------------------ DEATH SCENE
  function sceneDeath() {
    const K = C.DEATH;
    return {
      duration: K.TOTAL, playable: false,
      setup: function () {
        control(false);
        Dialogue.clear();
        Player.state.flashlightOn = false;
        cs.style.transition = 'none'; cs.style.background = 'transparent'; show(cs, false);
        textEl.style.opacity = 0; textEl2.style.opacity = 0;
        fadeEl.style.transition = 'none'; fadeEl.style.opacity = 0;
        show(deathFx, true);
        dfVig.style.opacity = 0; dfTint.style.opacity = 0; dfPulse.style.opacity = 0;
        this.ph = 0; this.nextBeep = K.BEEP_START; this.cut = false;
        const ev = [];
        const add = (at, fn) => ev.push({ at: at, fn: fn });
        add(K.ARIA_AT, () => say('death', { dur: K.ARIA_DUR }));
        add(K.HISS_AT, () => Dialogue.fx('gas_hiss'));
        K.BREATHS.forEach(at => add(at, () => Dialogue.fx('breath')));
        K.CHOKES.forEach(at => add(at, () => Dialogue.fx('choke')));
        add(K.GASP_AT, () => Dialogue.fx('gasp'));
        add(K.FLAT_AT, () => Dialogue.fx('monitor_flat'));
        add(K.BLACK_AT, () => this.toBlack());
        add(K.TEXT_AT, () => { textEl.className = 'card death'; textEl.textContent = K.TEXT1; textEl.style.opacity = 1; });
        add(K.TEXT2_AT, () => { textEl2.textContent = K.TEXT2; textEl2.style.opacity = 1; });
        add(K.TEXT_OUT, () => { textEl.style.opacity = 0; textEl2.style.opacity = 0; });
        this.events = ev;
      },
      toBlack: function () {
        if (this.cut) return;
        this.cut = true;
        Dialogue.clear();
        blackCover(0);
        gameCanvas.style.filter = '';
        show(deathFx, false);
      },
      update: function (dt, tt) {
        if (tt >= K.BLACK_AT) return;
        // camera locked on the drone's red eye
        const d = Drone.data;
        lookAt(d.x, d.floor * C.BUILDING.FLOOR_H + 0.68, d.z, K.LOOK_RATE, dt);
        const vig = clamp01((tt - K.VIGNETTE_START) / (K.VIGNETTE_FULL - K.VIGNETTE_START));
        const rise = clamp01((tt - K.TINT_START) / (K.TINT_PEAK - K.TINT_START));
        const gray = clamp01((tt - K.TINT_PEAK) / (K.GRAY_END - K.TINT_PEAK));
        const tint = tt < K.TINT_PEAK ? rise * K.TINT_MAX : K.TINT_MAX * (1 - gray);
        gameCanvas.style.filter = 'grayscale(' + gray.toFixed(3) + ') saturate(' + (1 - rise * 0.45).toFixed(3) + ') contrast(' + (1 + gray * 0.3).toFixed(3) + ')';
        dfVig.style.opacity = (vig * 0.95).toFixed(3);
        dfTint.style.opacity = tint.toFixed(3);
        // the screen pulses like a heartbeat, and slows
        let pulse = 0;
        if (tt >= K.PULSE_FROM) {
          const bpm = lerp(K.PULSE_BPM[0], K.PULSE_BPM[1], clamp01((tt - K.PULSE_FROM) / (K.PULSE_TO - K.PULSE_FROM)));
          this.ph += dt * bpm / 60;
          pulse = Math.pow(Math.max(0, Math.sin(this.ph * 2 * Math.PI)), 3);
        }
        dfPulse.style.opacity = (vig * (0.12 + 0.75 * pulse)).toFixed(3);
        // heart monitor, slowing
        if (tt >= this.nextBeep && tt < K.BEEP_END) {
          Dialogue.fx('monitor_beep');
          this.nextBeep = tt + lerp(K.BEEP_INTERVAL[0], K.BEEP_INTERVAL[1], clamp01((tt - K.BEEP_START) / (K.BEEP_END - K.BEEP_START)));
        }
      },
      // Space: jump straight to the black screen, then on to the respawn
      onSkip: function () {
        if (this.cut) return false;
        this.events.forEach(e => { if (e.at < K.BLACK_AT) e.done = true; });
        Dialogue.stopAudio();
        t = K.BLACK_AT;
        this.toBlack();
        return true;
      },
      teardown: function () { cleanupFx(); textEl.className = ''; textEl.style.opacity = 0; }
    };
  }

  // ------------------------------------------------------------------ ENDING A — shut her down
  function sceneTerminal() {
    const K = C.ENDINGS.A;
    const withPhoto = GameState.hasItem('photo');
    return {
      duration: K.TERMINAL_SPEECH + (withPhoto ? 11 : 0), playable: false,
      setup: function () {
        control(false);
        Dialogue.clear();
        Player.state.flashlightOn = false;
        show(cs, false); textEl.style.opacity = 0;
        this.events = [{ at: 0.8, fn: () => {
          say('endA', { dur: K.TERMINAL_SPEECH - 2 });
          if (withPhoto) say('photoEndA', { interrupt: false });     // "You kept the photo."
        } }];
      },
      update: function (dt) { lookAt(-24.6, 3 * C.BUILDING.FLOOR_H + 1.25, 0, 2.5, dt); },
      teardown: function () {
        E.armed = true;
        hintEl.textContent = 'Pull the server plug.  [E]'; show(hintEl, true); hintT = 7;
        GameState.cutsceneControl = false;
      }
    };
  }

  function sceneUnplug() {
    const K = C.ENDINGS.A;
    return {
      duration: K.UNPLUG, playable: false,
      setup: function () {
        control(false);
        Dialogue.clear();
        Player.state.flashlightOn = false;
        show(cs, false);
        this.events = [
          { at: 0.5, fn: () => { Dialogue.fx('plug_pull'); GameState.shake = 0.7; } },
          { at: 1.1, fn: () => { World.blackout(); Drone.hide(); Dialogue.fx('power_down'); } },
          { at: 2.0, fn: () => blackCover(0.4) }
        ];
      },
      update: function (dt, tt) { if (tt < 1.4) lookAt(-25.4, 3 * C.BUILDING.FLOOR_H + 0.4, -1.3, 3, dt); }
    };
  }

  function sceneCardA() {
    const K = C.ENDINGS.A;
    return {
      duration: K.CARD_DURATION, playable: false,
      setup: function () {
        blackCover(0);
        this.events = [
          { at: 1.2, fn: () => { textEl.className = 'card offline'; textEl.textContent = K.CARD; textEl.style.opacity = 1; } },
          { at: K.CARD_DURATION - 1.6, fn: () => { textEl.style.opacity = 0; } }
        ];
      },
      teardown: function () { textEl.className = ''; textEl.style.opacity = 0; }
    };
  }

  // ------------------------------------------------------------------ ENDING B — burn it down
  function sceneExitB() {
    const K = C.ENDINGS.B;
    return {
      duration: K.FADE + 0.6, playable: false,
      setup: function () {
        control(false);
        Dialogue.clear();
        Drone.hide();
        Player.state.flashlightOn = false;
        GameState.shake = 0.35;
        blackCover(K.FADE);
        cs.style.background = 'transparent';
        setTimeout(() => { cs.style.background = '#000'; }, 30);
        this.events = [];
      }
    };
  }

  function sceneExterior() {
    const K = C.ENDINGS.B;
    return {
      duration: K.EXTERIOR, playable: false,
      setup: function () {
        const pos = K.POSITION;
        Player.teleport(0, pos.x, pos.z, pos.yaw);
        Player.state.pitch = pos.pitch;
        World.enterExterior();
        GameState.shake = 0;
        show(heldEl, GameState.hasItem('photo'));          // you hold it while the building burns. No dialogue.
        blackCover(0);
        setTimeout(() => { cs.style.transition = 'background 3s linear'; cs.style.background = 'transparent'; }, 60);
        this.events = [
          { at: K.CUT_AT, fn: () => Dialogue.say(C.DIALOGUE.endB, 'cs', { cutoff: true, interrupt: true }) },
          { at: K.EXTERIOR - 2.2, fn: () => blackCover(2) }
        ];
      },
      update: function (dt) { Player.state.x += K.DRIFT * dt; }
    };
  }

  function sceneCardB() {
    const K = C.ENDINGS.B;
    return {
      duration: K.CARD_DURATION, playable: false,
      setup: function () {
        show(heldEl, false);
        blackCover(0);
        textEl.className = 'card'; textEl2.className = 'card2';
        this.events = [
          { at: 1.2, fn: () => { textEl.textContent = K.CARD[0]; textEl.style.opacity = 1; } },
          { at: 5.2, fn: () => { textEl2.textContent = K.CARD[1]; textEl2.style.opacity = 1; } },
          { at: K.CARD_DURATION - 1.6, fn: () => { textEl.style.opacity = 0; textEl2.style.opacity = 0; } }
        ];
      },
      teardown: function () { textEl.className = ''; textEl.style.opacity = 0; textEl2.className = ''; textEl2.style.opacity = 0; }
    };
  }

  // ------------------------------------------------------------------ credits (silent, both endings)
  function sceneCredits() {
    const K = C.ENDINGS.CREDITS;
    return {
      duration: K.DURATION, playable: false,
      setup: function () {
        blackCover(0);
        creditsEl.innerHTML = '';
        K.LINES.forEach((ln, i) => { const d = document.createElement('div'); d.textContent = ln || '\u00a0'; if (i === 0) d.className = 'big'; creditsEl.appendChild(d); });
        creditsEl.style.animation = 'none';
        void creditsEl.offsetHeight;
        creditsEl.style.animation = 'creditsroll ' + K.DURATION + 's linear forwards';
        show(creditsEl, true);
        this.events = [];
      },
      teardown: function () { show(creditsEl, false); }
    };
  }

  // ------------------------------------------------------------------ E-key actions (terminal, plug, fire override, exit)
  const E = { armed: false, fire: false };

  function playerSays(key) {
    Dialogue.say(C.DIALOGUE[key], 'act', { speaker: 'DR. ARYAN', static: false, interrupt: true, dur: 4.6 });
  }

  function pullPlug() {
    Main.setState('ENDING');
    playEnding('A', function () { Main.endCard('A'); });
  }

  function startEndingB() {
    Main.setState('ENDING');
    playEnding('B', function () { Main.endCard('B'); });
  }

  function doAction(action) {
    if (GameState.state !== 'PLAYING' || running) return;
    if (action === 'terminal') {
      if (E.armed) { pullPlug(); return; }
      GameState.state = 'CUTSCENE';
      play([sceneTerminal], function () { GameState.state = 'PLAYING'; });
    } else if (action === 'plug') {
      if (!E.armed) { playerSays('plugHint'); return; }
      pullPlug();
    } else if (action === 'fire') {
      if (E.fire) return;
      E.fire = true;
      World.startFire();
      const ex = World.doors.find(d => d.exit);
      if (ex) ex.setLocked(false);
      Dialogue.fx('alarm');
      GameState.shake = Math.max(GameState.shake || 0, 0.5);
      Dialogue.say(C.DIALOGUE.fireAria, 'act', { interrupt: true, dur: 3.6 });
      Dialogue.say(C.DIALOGUE.firePlayer, 'act', { speaker: 'DR. ARYAN', static: false, dur: 3.8 });
    } else if (action === 'exit') {
      playerSays(E.fire ? 'exitOpen' : 'exitSealed');
    } else if (action === 'voicemail') {
      playVoicemail();
    } else if (action === 'footage') {
      playFootage();
    }
  }

  // ------------------------------------------------------------------ Marcus's voicemail
  let vmUntil = 0;
  function playVoicemail() {
    if (performance.now() < vmUntil) return;
    vmUntil = performance.now() + 14000;
    GameState.emit('phone_pickup', {});
    Dialogue.mute(18);                                   // ARIA never mentions it
    setTimeout(() => GameState.emit('voicemail_beep', {}), 600);
    setTimeout(() => Dialogue.say(C.DIALOGUE.marcusVoicemail, 'vm',
      { speaker: 'VOICEMAIL — MARCUS', voice: 'marcus', static: false, force: true, interrupt: true, dur: 9 }), 1300);
  }

  // ------------------------------------------------------------------ security footage terminal
  const FT = C.FOOTAGE;
  let footageEl, footageCv, footageG, footage = null, footageSeen = false, heldEl;

  function drawFootage(tt) {
    const g = footageG, W = footageCv.width, Hh = footageCv.height;
    g.fillStyle = '#160707'; g.fillRect(0, 0, W, Hh);
    // the office: floor, door, desk, lamp, monitor glow
    g.fillStyle = '#220c0c'; g.fillRect(0, 250, W, 110);
    g.fillStyle = '#1b0a0a'; g.fillRect(40, 70, 90, 180);
    g.fillStyle = '#331212'; g.fillRect(330, 205, 230, 14); g.fillRect(345, 219, 10, 60); g.fillRect(535, 219, 10, 60);
    g.fillStyle = '#7a2a22'; g.fillRect(430, 150, 76, 50);
    g.fillStyle = 'rgba(255,90,70,0.12)'; g.fillRect(380, 120, 180, 100);
    g.fillStyle = '#4a1a14'; g.fillRect(372, 180, 6, 25); g.fillRect(366, 176, 18, 6);
    // Dr. Aryan at the desk, typing
    const typing = Math.sin(tt * 9) * 3;
    g.fillStyle = '#5a2620'; g.beginPath(); g.arc(398, 150, 17, 0, 6.3); g.fill();
    g.fillRect(380, 168, 38, 52);
    g.fillRect(412, 190 + typing, 32, 8); g.fillRect(412, 198 - typing, 30, 7);
    g.fillStyle = '#2a0e0c'; g.fillRect(370, 214, 56, 50);
    // lock-on bracket
    if (tt >= FT.LOCK_AT) {
      const k = Math.min(1, (tt - FT.LOCK_AT) / 0.6), e = 70 * (1 - k) + 6;
      const x1 = 372 - e, y1 = 128 - e, x2 = 424 + e, y2 = 226 + e, L = 16;
      g.strokeStyle = '#ff2a1a'; g.lineWidth = 2;
      [[x1, y1, 1, 1], [x2, y1, -1, 1], [x1, y2, 1, -1], [x2, y2, -1, -1]].forEach(c => {
        g.beginPath(); g.moveTo(c[0], c[1] + c[3] * L); g.lineTo(c[0], c[1]); g.lineTo(c[0] + c[2] * L, c[1]); g.stroke();
      });
      g.fillStyle = '#ff2a1a'; g.font = 'bold 12px monospace'; g.textAlign = 'left';
      g.fillText('SUBJECT: DR. ARYAN', x1, y1 - 6);
      if (tt - FT.LOCK_AT < 0.18) { g.fillStyle = 'rgba(255,60,40,0.35)'; g.fillRect(0, 0, W, Hh); }
    }
    // ARIA's internal log
    if (tt >= FT.LOG_AT) {
      g.fillStyle = 'rgba(8,0,0,0.82)'; g.fillRect(14, 232, 380, 100);
      g.strokeStyle = '#ff2a1a'; g.lineWidth = 1; g.strokeRect(14.5, 232.5, 380, 100);
      g.font = 'bold 13px monospace'; g.textAlign = 'left';
      FT.LOG.forEach((ln, i) => {
        const t0 = FT.LOG_AT + i * FT.LOG_PER_LINE;
        if (tt < t0) return;
        const n = Math.min(ln.length, Math.floor((tt - t0) * 38));
        g.fillStyle = i === 0 ? '#ff6a5a' : '#ffb0a0';
        g.fillText(ln.slice(0, n), 26, 254 + i * 21);
      });
    }
    // camera furniture: scanlines, noise, vignette, labels
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < Hh; y += 3) g.fillRect(0, y, W, 1);
    for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(255,120,100,' + (Math.random() * 0.25).toFixed(2) + ')'; g.fillRect(Math.random() * W, Math.random() * Hh, 2, 1); }
    const vg = g.createRadialGradient(W / 2, Hh / 2, Hh * 0.35, W / 2, Hh / 2, Hh * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#ff6a5a'; g.font = 'bold 14px monospace'; g.textAlign = 'left';
    g.fillText('ARIA SECURITY — CAM 04 — OFFICE 04', 16, 26);
    if (Math.floor(tt * 2) % 2 === 0) { g.fillStyle = '#ff2a1a'; g.beginPath(); g.arc(W - 70, 22, 5, 0, 6.3); g.fill(); }
    g.fillStyle = '#ff6a5a'; g.textAlign = 'right'; g.fillText('REC', W - 20, 27);
    const sec = Math.floor(57 + tt) % 60;
    g.textAlign = 'left'; g.font = 'bold 16px monospace';
    g.fillText('03:' + (57 + tt >= 60 ? '14' : '13') + ':' + String(sec).padStart(2, '0') + ' AM', 16, Hh - 18);
  }

  function playFootage() {
    if (footage) return;
    footage = { t0: performance.now() };
    GameState.paused = true;                     // the world holds its breath while she watches
    GameState.noteOpen = true;                   // blocks movement, prompts and the E key
    show(footageEl, true);
    footageEl.style.opacity = 1;
    GameState.emit('footage_start', {});
    let locked = false;
    const tick = () => {
      if (!footage) return;
      const tt = (performance.now() - footage.t0) / 1000;
      if (tt >= FT.LOCK_AT && !locked) { locked = true; GameState.emit('camera_alert', {}); }
      drawFootage(Math.min(tt, FT.DURATION + 1));
      if (tt >= FT.DURATION + 1.5) footageEl.style.opacity = 0;
      if (tt >= FT.DURATION + 2.5) { closeFootage(false); return; }
      setTimeout(tick, 33);                    // a timer, not rAF: the footage must always be able to end
    };
    tick();
  }

  function closeFootage() {
    if (!footage) return;
    const watched = (performance.now() - footage.t0) / 1000;
    footage = null;
    show(footageEl, false);
    GameState.noteOpen = false;
    GameState.noteClosedAt = performance.now();
    if (document.pointerLockElement === gameCanvas) GameState.paused = false;   // lost the lock meanwhile: main.js keeps the pause screen up
    if (watched >= FT.REACT_MIN && !footageSeen) {
      footageSeen = true;
      setTimeout(() => Dialogue.say(C.DIALOGUE.footageReact, 'footage', { force: true, interrupt: true }), 900);
    }
  }

  // ------------------------------------------------------------------ sequencer
  function nextScene() {
    if (scene && scene.teardown) scene.teardown();
    idx++;
    if (idx >= scenes.length) { finish(); return; }
    scene = scenes[idx]();
    scene._textTimers = [];
    t = 0;
    scene.setup();
    scene.events.forEach(e => { e.done = false; });
    show(skipEl, true);
  }

  // undo every visual a death / ending scene may have left behind
  function cleanupFx() {
    show(heldEl, false);
    gameCanvas.style.filter = '';
    show(deathFx, false);
    creditsEl.innerHTML = ''; show(creditsEl, false);
    textEl2.style.opacity = 0;
  }

  function finish() {
    running = false; scene = null;
    cleanupFx();
    show(cs, false); show(cctv, false); show(skipEl, false);
    fade(0, 0.01);
    GameState.cutsceneControl = false;
    GameState.shake = 0; GameState.shakeHold = false;
    if (doneCb) { const cb = doneCb; doneCb = null; cb(); }
  }

  function playOpening(cb) {
    if (C.DEBUG.SKIP_OPENING) {
      doneCb = cb;
      World.setCalm(false);
      Player.reset();
      finish();
      return;
    }
    play([sceneFlashback, sceneCalm, sceneGlitch, sceneBlack, sceneCctv, sceneWake], cb);
  }

  function play(list, cb) {
    doneCb = cb;
    scenes = list;
    idx = -1; running = true;
    nextScene();
  }

  function playDeath(cb) { play([sceneDeath], cb); }

  function playEnding(kind, cb) {
    if (kind === 'A') play([sceneUnplug, sceneCardA, sceneCredits], cb);
    else play([sceneExitB, sceneExterior, sceneCardB, sceneCredits], cb);
  }

  function skip() {
    if (!running) return;
    if (scene && scene.onSkip && scene.onSkip()) return;
    nextScene();
  }

  function update(dt) {
    if (running && scene && dt > 0) {
      t += dt;
      scene.events.forEach(e => { if (!e.done && t >= e.at) { e.done = true; e.fn(); } });
      scene._textTimers = scene._textTimers.filter(e => { if (t >= e.at) { e.fn(); return false; } return true; });
      if (scene.update) scene.update(dt, t);
      if (t >= scene.duration) nextScene();
    }
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) show(hintEl, false); }
    if (GameState.state === 'PLAYING') moments(dt);
  }

  // ------------------------------------------------------------------ inspect notes
  function showNote(id) {
    let item = C.INSPECT[id];
    if (!item) return;
    if (item.action) { doAction(item.action); return; }
    // after the calm opening some screens show something else (the computer: her last message)
    if (item.after && !(running && scene && scene.isCalm)) item = Object.assign({}, item, item.after);
    inspected[id] = true;
    let lines = item.text;
    // carryable item: during play, E takes it with you (lost on death)
    if (item.pickup && GameState.state === 'PLAYING' && !GameState.hasItem(item.pickup)) {
      GameState.giveItem(item.pickup);
      World.setItemTaken(item.pickup, true);
      lines = lines.concat([''], item.pickupText || []);
    }
    if (item.silence) Dialogue.mute(item.silence);       // ARIA says nothing. The silence is the point.
    noteTitle.textContent = item.title;
    noteBody.innerHTML = '';
    lines.forEach(ln => { const p = document.createElement('p'); p.textContent = ln || ' '; noteBody.appendChild(p); });
    show(noteEl, true);
    GameState.noteOpen = true;
    noteOpenedAt = performance.now();
  }

  function closeNote() {
    if (!GameState.noteOpen) return;
    GameState.noteOpen = false;
    GameState.noteClosedAt = performance.now();   // Player ignores the same keypress that closed the note
    show(noteEl, false);
  }

  function onKey(e) {
    if (footage) {
      if (performance.now() - footage.t0 > 1200 && ['KeyE', 'Space', 'Escape', 'Enter'].indexOf(e.code) >= 0) { closeFootage(); e.preventDefault(); }
      return;
    }
    if (GameState.noteOpen) {
      if (performance.now() - noteOpenedAt < 200) return;
      if (['KeyE', 'Space', 'Escape', 'Enter'].indexOf(e.code) >= 0) { closeNote(); e.preventDefault(); }
      return;
    }
    if (running && e.code === CS.SKIP_KEY && !e.repeat) { skip(); e.preventDefault(); }
  }

  // ------------------------------------------------------------------ scripted moments (in play)
  const M = { play: 0, nextSlam: 0, silence: 'idle', silenceUntil: 0, tunnelT: 0, fig: null, figCool: 0, figCount: 0, vitalsT: 0, started: false };

  function buildFigure() {
    const grp = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x0a0a0c, emissive: 0x0c0c0e });
    const pale = new THREE.MeshLambertMaterial({ color: 0x8a8a8a, emissive: 0x1a1a1a });
    const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); grp.add(b); };
    box(0.36, 0.9, 0.2, 0, 1.15, 0, dark);
    box(0.13, 0.85, 0.13, -0.1, 0.42, 0, dark); box(0.13, 0.85, 0.13, 0.1, 0.42, 0, dark);
    box(0.08, 1.0, 0.08, -0.26, 1.0, 0, dark); box(0.08, 1.0, 0.08, 0.26, 1.0, 0, dark);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), pale);
    head.position.set(0, 1.78, 0); head.scale.set(0.9, 1.15, 0.9); grp.add(head);
    grp.visible = false;
    World.groupOf(-1).add(grp);
    return grp;
  }

  function vitals(dt) {
    M.vitalsT -= dt;
    if (M.vitalsT > 0) return;
    M.vitalsT = AM.VITALS.UPDATE;
    const P = GameState.player;
    if (P.floor !== 3) return;
    const bpm = Math.round(Hud.bpm), thr = GameState.threat || 0;
    const spo2 = Math.max(80, Math.round(99 - thr * 8 - (P.sprinting ? 2 : 0)));
    const resp = Math.round(13 + thr * 20 + (P.sprinting ? 8 : 0));
    const tt = GameState.time;
    World.vitalsPanels.forEach(pn => {
      if (pn.floor !== 3 || Math.hypot(pn.x - P.x, pn.z - P.z) > AM.VITALS.NEAR) return;
      const c = pn.ctx, w = pn.w, h = pn.h;
      c.fillStyle = '#04101e'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#1d4c8a'; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
      c.fillStyle = '#4fb4ff'; c.font = 'bold 22px monospace';
      c.fillText('ARIA // SUBJECT MONITOR', 20, 38);
      c.font = '18px monospace'; c.fillStyle = '#8fd0ff';
      c.fillText('SUBJECT: DR. ARYAN', 20, 66);
      c.fillText('LOCATION: ' + (P.room || '—').toUpperCase().slice(0, 28), 20, 90);
      const hot = thr > 0.5;
      c.fillStyle = hot ? '#ff5a5a' : '#6ff0a0'; c.font = 'bold 30px monospace';
      c.fillText('HEART  ' + bpm + ' BPM', 20, 140);
      c.fillStyle = '#6ff0a0'; c.fillText('O2     ' + spo2 + ' %', 20, 178);
      c.fillStyle = hot ? '#ff5a5a' : '#ffd36a'; c.fillText('STRESS ' + Math.round(thr * 100) + ' %', 20, 216);
      c.font = '16px monospace'; c.fillStyle = '#8fd0ff'; c.fillText('RESP ' + resp + '/min    STATUS: ' + (thr > 0.6 ? 'ELEVATED' : 'MONITORED'), 20, 246);
      // ECG trace
      c.strokeStyle = hot ? '#ff5a5a' : '#6ff0a0'; c.lineWidth = 2; c.beginPath();
      const ph = (tt * bpm / 60) % 1;
      for (let x = 0; x < 200; x++) {
        const q = ((x / 200) * 1.6 - ph + 2) % 1;
        const y = 0.5 + (q < 0.1 ? Math.sin(q / 0.1 * Math.PI) * -0.45 : (q < 0.16 ? 0.1 : 0));
        if (x === 0) c.moveTo(300 + x, 150 - y * 80 + 40); else c.lineTo(300 + x, 150 - y * 80 + 40);
      }
      c.stroke();
      pn.tex.needsUpdate = true;
    });
  }

  function figure(dt) {
    const P = GameState.player;
    const F = AM.FIGURE;
    if (!M.fig) M.fig = { mesh: buildFigure(), active: false, lookAway: 0, vis: 0 };
    const f = M.fig;
    const inTunnel = P.floor === -1;
    M.tunnelT = inTunnel ? M.tunnelT + dt : 0;
    M.figCool = Math.max(0, M.figCool - dt);

    if (f.active) {
      const dx = f.x - P.x, dz = f.z - P.z, d = Math.hypot(dx, dz);
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const dot = (dx * fx + dz * fz) / (d || 1);
      const away = Math.acos(Math.max(-1, Math.min(1, dot))) > F.LOOK_AWAY;
      if (away) f.lookAway += dt; else { f.lookAway = 0; f.vis += dt; }
      if (f.lookAway >= F.LOOK_AWAY_TIME || f.vis > F.MAX_VISIBLE || d < F.CLOSE || !inTunnel || !P.flashlightOn) {
        f.active = false; f.mesh.visible = false; M.figCool = F.COOLDOWN; M.figCount++;   // look again — gone. ARIA never mentions it.
      }
      return;
    }
    if (!inTunnel || !P.flashlightOn || P.hiding || M.figCool > 0 || M.figCount >= F.MAX_APPEARANCES || M.tunnelT < F.FIRST_DELAY) return;
    if (Math.abs(P.pitch) > 0.3) return;
    // march along the view direction to find the far end of the tunnel
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    let L = 0;
    while (L < 30 && !World.blocked(-1, P.x + fx * L, P.z + fz * L, 0.25)) L += 0.5;
    if (L - 1.2 < F.MIN_DIST) return;
    const dist = Math.min(F.MAX_DIST, L - 1.2);
    f.x = P.x + fx * dist; f.z = P.z + fz * dist;
    f.mesh.position.set(f.x, -4 * 1 + 0, f.z);
    f.mesh.position.y = -1 * C.BUILDING.FLOOR_H;
    f.mesh.rotation.y = Math.atan2(P.x - f.x, P.z - f.z);
    f.mesh.visible = true; f.active = true; f.lookAway = 0; f.vis = 0;
  }

  function moments(dt) {
    if (dt <= 0) return;
    const P = GameState.player;
    if (!M.started) {
      M.started = true;
      M.nextSlam = GameState.time + AM.DOOR_SLAM_MIN + Math.random() * (AM.DOOR_SLAM_MAX - AM.DOOR_SLAM_MIN);
    }
    M.play += dt;

    // a door SLAMS somewhere. never explained.
    if (GameState.time >= M.nextSlam) {
      Dialogue.fx('door_slam');
      GameState.shake = Math.max(GameState.shake || 0, AM.DOOR_SLAM_SHAKE);
      M.nextSlam = GameState.time + AM.DOOR_SLAM_MIN + Math.random() * (AM.DOOR_SLAM_MAX - AM.DOOR_SLAM_MIN);
    }

    // once per playthrough: the intercoms go silent for 60 s, then one quiet line, then silence again
    if (M.silence === 'idle' && M.play >= AM.SILENCE_AT && (GameState.threat || 0) < 0.3 && !P.hiding) {
      M.silence = 'quiet'; M.silenceUntil = GameState.time + AM.SILENCE_DURATION;
      Dialogue.mute(AM.SILENCE_DURATION);
    } else if (M.silence === 'quiet' && GameState.time >= M.silenceUntil) {
      M.silence = 'done';
      Dialogue.say(C.DIALOGUE.silence, 'moment', { force: true, interrupt: true, dur: 6.5 });
      Dialogue.mute(AM.SILENCE_AFTER, true);
    }

    figure(dt);
    vitals(dt);

    // Ending B: through the open exit once the fire suppression override has been triggered
    if (E.fire && P.floor === 0 && P.x > 26.05 && !running) startEndingB();
  }

  // ------------------------------------------------------------------ init
  function init() {
    gameCanvas = document.getElementById('game');
    cs = mk('div', 'cs', 'hidden');
    textEl = mk('div', 'cs-text', null, cs);
    textEl2 = mk('div', 'cs-text2', null, cs);
    deathFx = mk('div', 'death-fx', 'hidden');
    dfVig = mk('div', 'df-vig', null, deathFx);
    dfTint = mk('div', 'df-tint', null, deathFx);
    dfPulse = mk('div', 'df-pulse', null, deathFx);
    creditsEl = mk('div', 'cs-credits', 'hidden');
    cctv = mk('canvas', 'cs-cctv', 'hidden');
    cctv.width = CS.CCTV.W; cctv.height = CS.CCTV.H;
    g = cctv.getContext('2d');
    fadeEl = mk('div', 'cs-fade');
    patchEl = mk('div', 'cs-patch', 'hidden');
    hintEl = mk('div', 'cs-hint', 'hidden');
    skipEl = mk('div', 'cs-skip', 'hidden');
    skipEl.textContent = 'SPACE — skip';
    noteEl = mk('div', 'note', 'hidden');
    noteTitle = mk('h2', null, null, noteEl);
    noteBody = mk('div', null, 'note-body', noteEl);
    mk('div', null, 'note-close', noteEl).textContent = '[E] close';
    noteEl.addEventListener('click', closeNote);
    footageEl = mk('div', 'footage', 'hidden');
    footageCv = mk('canvas', 'footage-cv', null, footageEl);
    footageCv.width = 640; footageCv.height = 360;
    footageG = footageCv.getContext('2d');
    document.addEventListener('pointerlockchange', () => { if (footage && document.pointerLockElement !== gameCanvas) closeFootage(); });
    heldEl = mk('div', 'held-photo', 'hidden');
    const hc = mk('canvas', null, null, heldEl); hc.width = 300; hc.height = 220;
    const hg = hc.getContext('2d');
    hg.fillStyle = '#e8dcc0'; hg.fillRect(0, 0, 300, 220);
    hg.fillStyle = '#3a3028'; hg.fillRect(14, 14, 272, 192);
    hg.fillStyle = '#e8d8b8'; hg.font = '40px sans-serif'; hg.textAlign = 'center'; hg.textBaseline = 'middle';
    hg.fillText('☺  ☺  ☺  ☺', 150, 85); hg.fillText('☺  ☺  ☺', 150, 140);
    document.addEventListener('keydown', onKey);
    if (GameState.on) GameState.on('inspect', showNote);
  }

  window.addEventListener('DOMContentLoaded', init);

  return {
    init: init, update: update, playOpening: playOpening, playDeath: playDeath, playEnding: playEnding, skip: skip,
    showNote: showNote, closeNote: closeNote,
    moments: M, inspected: inspected, endings: E,
    get running() { return running; },
    get scene() { return idx; }
  };
})();
