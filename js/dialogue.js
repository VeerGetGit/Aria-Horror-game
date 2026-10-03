/* ============================================================================
 * dialogue.js — ARIA : her voice on screen.
 *
 * OWNS:    subtitle renderer (speaker tag + typewriter text), the line queue,
 *          the intercom static effect that precedes every ARIA line
 *          (screen noise + audio), the mute switch used by the once-per-
 *          playthrough "intercoms silent" moment, and the ambient line
 *          scheduler (ARIA muses every so often when you are not hunted).
 * IMPORTS: CONFIG (all dialogue strings live in CONFIG.DIALOGUE),
 *          GameState (main.js), optional Aria (aria.js) and Sound (Stage 5).
 * EXPORTS: Dialogue { init, update, say, mute, clear, fx, isMuted, speaking }
 *
 * Events emitted (Stage 5's sound.js listens): 'intercom_static',
 * 'door_slam', 'scream_distant'. Until Sound exists, a tiny built-in Web
 * Audio fallback in `fx()` makes those sounds so the opening is not silent.
 * ========================================================================== */

const Dialogue = (function () {
  'use strict';

  const C = CONFIG;
  const A = C.AMBIENT;
  const PRIORITY = { spot: true, lose: true, repeatHide: true, camera: true };

  let box, speakerEl, lineEl, staticEl, staticCtx;
  let queue = [];
  let cur = null;           // { text, speaker, dur, t, shown, aria }
  let muteUntil = -1;
  let staticT = 0;
  let nextAmbient = 0;
  let started = false;
  let audio = null;

  const now = () => GameState.time;

  function el(tag, id, parent) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    (parent || document.body).appendChild(e);
    return e;
  }

  // ------------------------------------------------------------------ audio fallback
  function ctx() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { audio = new AC(); } catch (e) { return null; }
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  function noiseBuffer(a, secs) {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * secs), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function fx(name) {
    if (GameState.emit) GameState.emit(name, {});
    if (typeof Sound !== 'undefined') return;       // the real sound engine handles it
    const a = ctx();
    if (!a) return;
    const t0 = a.currentTime;
    const out = a.createGain();
    out.connect(a.destination);
    if (name === 'intercom_static') {
      const n = a.createBufferSource(); n.buffer = noiseBuffer(a, 0.5);
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
      out.gain.setValueAtTime(0.0, t0);
      out.gain.linearRampToValueAtTime(0.1, t0 + 0.04);
      out.gain.setValueAtTime(0.06, t0 + 0.25);
      out.gain.linearRampToValueAtTime(0, t0 + 0.45);
      n.connect(bp); bp.connect(out); n.start(t0); n.stop(t0 + 0.5);
    } else if (name === 'door_slam') {
      const o = a.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(28, t0 + 0.4);
      out.gain.setValueAtTime(0.55, t0); out.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
      o.connect(out); o.start(t0); o.stop(t0 + 0.6);
      const n = a.createBufferSource(); n.buffer = noiseBuffer(a, 0.3);
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = a.createGain(); g.gain.setValueAtTime(0.35, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      n.connect(lp); lp.connect(g); g.connect(a.destination); n.start(t0);
    } else if (name === 'scream_distant') {
      const o = a.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t0); o.frequency.linearRampToValueAtTime(930, t0 + 0.5); o.frequency.linearRampToValueAtTime(610, t0 + 1.3);
      const lfo = a.createOscillator(); lfo.frequency.value = 7;
      const lg = a.createGain(); lg.gain.value = 28; lfo.connect(lg); lg.connect(o.frequency);
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 1.5;
      out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(0.07, t0 + 0.12);
      out.gain.setValueAtTime(0.07, t0 + 0.9); out.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.5);
      o.connect(lp); lp.connect(out); o.start(t0); lfo.start(t0); o.stop(t0 + 1.6); lfo.stop(t0 + 1.6);
    }
  }

  // ------------------------------------------------------------------ static overlay
  function drawStatic() {
    if (staticT <= 0) { staticEl.style.opacity = 0; return; }
    const w = staticEl.width, h = staticEl.height;
    const img = staticCtx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v * 0.8; img.data[i + 2] = v * 0.8; img.data[i + 3] = 255;
    }
    staticCtx.putImageData(img, 0, 0);
    staticEl.style.opacity = Math.min(0.28, staticT * 0.7).toFixed(3);
  }

  // ------------------------------------------------------------------ public API
  function isMuted() { return now() < muteUntil; }

  // keep = true leaves the line that is currently showing (used right after her silence line)
  function mute(seconds, keep) {
    muteUntil = now() + seconds;
    if (!keep) clear();
  }

  function clear() {
    queue = [];
    cur = null;
    if (box) box.classList.remove('show');
  }

  function speaking() { return !!cur || queue.length > 0; }

  // Add a line. opts: { speaker, dur, static, force }
  function say(text, key, opts) {
    opts = opts || {};
    if (isMuted() && !opts.force) return false;
    const speaker = opts.speaker || 'ARIA';
    const item = {
      text: text,
      speaker: speaker,
      aria: speaker === 'ARIA' && opts.static !== false,
      dur: opts.dur || Math.max(2.6, text.length * 0.055 + 1.4),
      t: 0, shown: 0
    };
    if (PRIORITY[key] || opts.interrupt) { queue = []; cur = null; }
    else if (queue.length >= 3) return false;
    queue.push(item);
    return true;
  }

  function startNext() {
    cur = queue.shift();
    if (!cur) { box.classList.remove('show'); return; }
    speakerEl.textContent = cur.speaker === 'ARIA' ? 'ARIA' : cur.speaker;
    box.className = 'show ' + (cur.speaker === 'ARIA' ? 'aria' : 'you');
    lineEl.textContent = '';
    if (cur.aria) {
      staticT = 0.55;
      fx('intercom_static');
      box.classList.add('crackle');
    }
  }

  function scheduleAmbient(first) {
    nextAmbient = now() + (first ? A.LINE_FIRST_MIN + Math.random() * (A.LINE_FIRST_MAX - A.LINE_FIRST_MIN)
      : A.LINE_MIN + Math.random() * (A.LINE_MAX - A.LINE_MIN));
  }

  function update(dt) {
    if (!box) return;
    if (dt > 0) {
      if (staticT > 0) { staticT = Math.max(0, staticT - dt); drawStatic(); }
      if (!cur && queue.length) startNext();
      if (cur) {
        cur.t += dt;
        // typewriter: each line reveals quickly, then holds
        const want = Math.min(cur.text.length, Math.floor(cur.t * 70));
        if (want !== cur.shown) { cur.shown = want; lineEl.textContent = cur.text.slice(0, want); }
        if (cur.t > 0.35) box.classList.remove('crackle');
        if (cur.t >= cur.dur) { cur = null; if (queue.length) startNext(); else box.classList.remove('show'); }
      }
    }

    // ambient musings (gameplay only)
    if (GameState.state === 'PLAYING' && dt > 0) {
      if (!started) { started = true; scheduleAmbient(true); }
      if (now() >= nextAmbient) {
        const P = GameState.player;
        const calm = (GameState.threat || 0) < A.LINE_MAX_THREAT && !P.hiding;
        if (calm && !isMuted() && !speaking() && typeof Aria !== 'undefined' && Aria.say('ambient', true)) scheduleAmbient(false);
        else nextAmbient = now() + 10;
      }
    }
  }

  function init() {
    box = el('div', 'dlg');
    speakerEl = el('div', null, box); speakerEl.className = 'dlg-speaker';
    lineEl = el('div', null, box); lineEl.className = 'dlg-line';
    staticEl = el('canvas', 'static');
    staticEl.width = 160; staticEl.height = 90;
    staticCtx = staticEl.getContext('2d');
    scheduleAmbient(true);
  }

  window.addEventListener('DOMContentLoaded', init);

  return { init: init, update: update, say: say, mute: mute, clear: clear, fx: fx, isMuted: isMuted, speaking: speaking };
})();
