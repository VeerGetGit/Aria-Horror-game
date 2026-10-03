/* ============================================================================
 * hud.js — ARIA : heads-up display.
 *
 * OWNS:    heartbeat indicator (scrolling ECG + BPM that rises with threat),
 *          flashlight battery bar, proximity pulse (red screen-edge throb),
 *          hiding-spot overlay (locker slit / under-desk darkness), and a
 *          basic subtitle line (Stage 3's dialogue.js takes this over).
 * IMPORTS: CONFIG, GameState (main.js). Reads GameState.threat (aria.js) and
 *          GameState.player (player.js).
 * EXPORTS: Hud { init, update, subtitle, bpm }
 * Emits:   'beat' on every heartbeat (Stage 5 plays the thump from it).
 * ========================================================================== */

const Hud = (function () {
  'use strict';

  const C = CONFIG;
  const HC = C.HUD;
  const F = C.FLASHLIGHT;

  let root, ecg, ecgCtx, bpmEl, batFill, batPct, batBox, pulseEl, hideEl, subEl;
  let bpm = HC.BPM_MIN, phase = 0, flash = 0, subT = 0;
  let samples = [];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function el(tag, id, cls, parent) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    (parent || document.body).appendChild(e);
    return e;
  }

  function init() {
    root = el('div', 'hud', 'hidden');
    pulseEl = el('div', 'pulse', null);
    hideEl = el('div', 'hide-overlay', 'hidden');
    subEl = el('div', 'subtitle', 'hidden');

    const heart = el('div', 'heart', null, root);
    el('div', null, 'hud-label', heart).textContent = 'HEART RATE';
    ecg = el('canvas', 'ecg', null, heart);
    ecg.width = HC.ECG_W; ecg.height = HC.ECG_H;
    ecgCtx = ecg.getContext('2d');
    bpmEl = el('div', 'bpm', null, heart);

    batBox = el('div', 'battery', null, root);
    el('div', null, 'hud-label', batBox).textContent = 'FLASHLIGHT';
    const bar = el('div', null, 'bat-bar', batBox);
    batFill = el('div', null, 'bat-fill', bar);
    batPct = el('div', null, 'bat-pct', batBox);

    for (let i = 0; i < HC.ECG_W; i++) samples.push(0.5);
  }

  // one beat of an ECG trace for phase 0..1 -> 0..1 (0.5 = baseline)
  function wave(p) {
    if (p < 0.08) return 0.5 + Math.sin((p / 0.08) * Math.PI) * 0.08;      // P wave
    if (p < 0.14) return 0.5;
    if (p < 0.17) return 0.5 - ((p - 0.14) / 0.03) * 0.12;                 // Q
    if (p < 0.2) return 0.38 + ((p - 0.17) / 0.03) * 0.57;                 // R
    if (p < 0.24) return 0.95 - ((p - 0.2) / 0.04) * 1.05;                 // S
    if (p < 0.3) return -0.1 + ((p - 0.24) / 0.06) * 0.6;
    if (p < 0.5) return 0.5 + Math.sin(((p - 0.3) / 0.2) * Math.PI) * 0.12; // T wave
    return 0.5;
  }

  function drawEcg() {
    const w = HC.ECG_W, h = HC.ECG_H;
    ecgCtx.clearRect(0, 0, w, h);
    ecgCtx.lineWidth = 1.6;
    ecgCtx.strokeStyle = GameState.threat > 0.6 ? '#ff3030' : '#c24040';
    ecgCtx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const y = h - 4 - clamp(samples[i], -0.1, 1) * (h - 8);
      if (i === 0) ecgCtx.moveTo(i, y); else ecgCtx.lineTo(i, y);
    }
    ecgCtx.stroke();
  }

  function subtitle(text, seconds) {
    if (!subEl) return;
    subEl.textContent = text;
    subEl.classList.remove('hidden');
    subT = seconds || Math.max(HC.SUBTITLE_MIN, text.length * HC.SUBTITLE_PER_CHAR + 1.5);
  }

  function update(dt, t) {
    if (!root) return;
    const playing = GameState.state === 'PLAYING';
    root.classList.toggle('hidden', !playing);
    if (!playing) { pulseEl.style.opacity = 0; hideEl.classList.add('hidden'); }

    const P = GameState.player;
    const threat = GameState.threat || 0;

    // heartbeat
    const target = HC.BPM_MIN + (HC.BPM_MAX - HC.BPM_MIN) * threat + (P.sprinting ? 12 : 0);
    bpm += (target - bpm) * Math.min(1, dt * HC.BPM_SMOOTH);
    phase += dt * bpm / 60;
    if (phase >= 1) {
      phase -= 1; flash = 1;
      if (GameState.emit) GameState.emit('beat', { bpm: bpm, threat: threat });
    }
    flash = Math.max(0, flash - dt * 4);
    const advance = Math.max(1, Math.round(dt * 60));
    for (let i = 0; i < advance; i++) { samples.shift(); samples.push(wave(phase)); }
    drawEcg();
    bpmEl.textContent = Math.round(bpm) + ' BPM';
    bpmEl.style.color = threat > 0.6 ? '#ff4040' : '#b08080';

    // proximity pulse
    const k = clamp((threat - HC.PULSE_START_THREAT) / (1 - HC.PULSE_START_THREAT), 0, 1);
    pulseEl.style.opacity = playing ? (Math.pow(k, 1.4) * (0.35 + 0.65 * flash) * 0.9).toFixed(3) : 0;

    // battery
    const pct = clamp(P.battery / F.BATTERY_MAX, 0, 1);
    batFill.style.width = (pct * 100).toFixed(0) + '%';
    batPct.textContent = Math.round(pct * 100) + '%';
    const low = P.battery < F.BATTERY_LOW;
    batFill.style.background = low ? '#d03030' : '#d8c070';
    batBox.classList.toggle('dim', P.floor !== -1 && !P.flashlightOn);
    batBox.classList.toggle('low', low && P.floor === -1 && P.flashlightOn);

    // hiding overlay
    if (playing && P.hiding) {
      hideEl.className = P.hiding.type;
    } else hideEl.className = 'hidden';

    // subtitle timer
    if (subT > 0) { subT -= dt; if (subT <= 0) subEl.classList.add('hidden'); }
  }

  window.addEventListener('DOMContentLoaded', init);

  return { init: init, update: update, subtitle: subtitle, get bpm() { return bpm; } };
})();
