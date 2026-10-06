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

  // ------------------------------------------------------------------ voice (browser text-to-speech)
  const V = C.VOICE;
  const synth = (typeof window !== 'undefined' && window.speechSynthesis && window.SpeechSynthesisUtterance) ? window.speechSynthesis : null;
  let voice = null, voiceMarcus = null, speechPaused = false, bedActive = false;

  function pickFrom(pool, prefer, avoid) {
    let best = null;
    for (let i = 0; i < prefer.length && !best; i++) {
      const key = prefer[i].toLowerCase();
      best = pool.filter(v => v !== avoid && v.name.toLowerCase().indexOf(key) >= 0).sort((x, y) => (y.localService ? 1 : 0) - (x.localService ? 1 : 0))[0];
    }
    return best || pool.filter(v => v !== avoid && v.localService)[0] || pool.filter(v => v !== avoid)[0] || pool[0];
  }

  function pickVoice() {
    if (!synth) return;
    const list = synth.getVoices();
    if (!list.length) return;
    const en = list.filter(v => /^en([-_]|$)/i.test(v.lang));
    const pool = en.length ? en : list;
    voice = pickFrom(pool, V.PREFER, null);
    voiceMarcus = pickFrom(pool, C.VOICE_MARCUS.PREFER, voice);     // a different voice from ARIA's
  }

  const voiceOn = () => !!(V && V.ENABLED && synth);
  function bed(on) {
    if (typeof Sound === 'undefined' || bedActive === on) return;
    bedActive = on; Sound.voiceBed(on);
  }
  function cancelSpeech() {
    if (!synth) return;
    speechPaused = false;
    try { synth.cancel(); } catch (e) { /* ignore */ }
    bed(false);
  }

  // Speak `item.text`; item gets sp: 'idle' | 'live' | 'done' and word-progress fields.
  function startSpeech(item) {
    const text = item.text.replace(/\s*[—–-]+\s*$/, '');     // a trailing dash is a cut-off, not a pause
    item.sp = 'live'; item.sT = 0; item.lastWord = text.lastIndexOf(' ') + 1;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    const VC = item.vcfg || V;
    if (item.vname === 'marcus' && voiceMarcus) { u.voice = voiceMarcus; u.lang = voiceMarcus.lang; }
    u.pitch = VC.PITCH; u.rate = VC.RATE;
    u.volume = (typeof Sound !== 'undefined' && Sound.isMuted()) ? 0 : VC.VOLUME;
    u.onstart = function () { item.live = true; if (item.aria) bed(true); };
    u.onboundary = function (e) {
      if (e.name && e.name !== 'word') return;
      item.bSeen = true;
      const end = item.text.indexOf(' ', e.charIndex);
      item.bIdx = end < 0 ? item.text.length : end;
      if (item.cutoff && e.charIndex >= item.lastWord && item.cutT === undefined) item.cutT = 0.25;   // break off inside her last word
    };
    u.onend = u.onerror = function () { if (item.sp !== 'done') { item.sp = 'done'; item.doneT = 0; bed(false); } };
    item.utt = u;                                              // keep a reference (some browsers GC it mid-speech)
    try { synth.speak(u); } catch (e) { item.sp = 'done'; item.doneT = 0; }   // no voice available: subtitle only
  }

  // Speak a line that has no subtitle of its own (the flashback caption).
  function speak(text, delay) {
    if (!voiceOn()) return;
    setTimeout(function () {
      const item = { text: text, cutoff: false, sp: 'idle' };
      startSpeech(item);
    }, (delay === undefined ? V.START_DELAY : delay) * 1000);
  }

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

  // One-shot procedural sounds. `name` is also emitted as a GameState event so
  // Stage 5's sound engine can take over (then this fallback stays silent).
  function fx(name) {
    if (GameState.emit) GameState.emit(name, {});
    if (typeof Sound !== 'undefined') return;       // the real sound engine handles it
    const a = ctx();
    if (!a) return;
    const t0 = a.currentTime;
    const out = a.createGain();
    out.connect(a.destination);
    const env = (g, pts) => { g.gain.setValueAtTime(0.0001, t0); pts.forEach(p => g.gain.linearRampToValueAtTime(Math.max(0.0001, p[1]), t0 + p[0])); };
    const noise = (secs) => { const n = a.createBufferSource(); n.buffer = noiseBuffer(a, secs); return n; };
    const filt = (type, f, q) => { const b = a.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    const tone = (type, f, dur) => { const o = a.createOscillator(); o.type = type; o.frequency.value = f; o.start(t0); o.stop(t0 + dur); return o; };

    switch (name) {
      case 'intercom_static': {
        const n = noise(0.5), bp = filt('bandpass', 2200, 0.7);
        env(out, [[0.04, 0.1], [0.25, 0.06], [0.45, 0]]);
        n.connect(bp); bp.connect(out); n.start(t0); n.stop(t0 + 0.5);
        break;
      }
      case 'door_slam': {
        const o = a.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(28, t0 + 0.4);
        env(out, [[0.01, 0.55], [0.55, 0.001]]);
        o.connect(out); o.start(t0); o.stop(t0 + 0.6);
        const n = noise(0.3), lp = filt('lowpass', 500), g = a.createGain();
        g.gain.setValueAtTime(0.35, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
        n.connect(lp); lp.connect(g); g.connect(a.destination); n.start(t0);
        break;
      }
      case 'scream_distant': {
        const o = a.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, t0); o.frequency.linearRampToValueAtTime(930, t0 + 0.5); o.frequency.linearRampToValueAtTime(610, t0 + 1.3);
        const lfo = a.createOscillator(); lfo.frequency.value = 7;
        const lg = a.createGain(); lg.gain.value = 28; lfo.connect(lg); lg.connect(o.frequency);
        const lp = filt('lowpass', 650, 1.5);
        env(out, [[0.12, 0.07], [0.9, 0.07], [1.5, 0.0005]]);
        o.connect(lp); lp.connect(out); o.start(t0); lfo.start(t0); o.stop(t0 + 1.6); lfo.stop(t0 + 1.6);
        break;
      }
      case 'gas_hiss': {                       // long, thin hiss that builds
        const n = noise(13), hp = filt('highpass', 2600), lp = filt('lowpass', 9000);
        env(out, [[1.5, 0.09], [8, 0.13], [12.5, 0.09], [13, 0]]);
        n.connect(hp); hp.connect(lp); lp.connect(out); n.start(t0); n.stop(t0 + 13);
        break;
      }
      case 'breath': {                         // one ragged breath (in, then out)
        const n = noise(1.2), bp = filt('bandpass', 500 + Math.random() * 500, 1.1);
        env(out, [[0.3, 0.18 + Math.random() * 0.06], [0.42, 0.05], [0.7, 0.14], [1.1, 0]]);
        n.connect(bp); bp.connect(out); n.start(t0); n.stop(t0 + 1.2);
        break;
      }
      case 'choke': {
        const o = tone('sawtooth', 120 + Math.random() * 40, 0.6), lp = filt('lowpass', 520, 2);
        const lfo = a.createOscillator(); lfo.frequency.value = 19; const lg = a.createGain(); lg.gain.value = 0.07; lfo.connect(lg); lg.connect(out.gain); lfo.start(t0); lfo.stop(t0 + 0.6);
        env(out, [[0.05, 0.1], [0.4, 0.08], [0.6, 0]]);
        o.connect(lp); lp.connect(out);
        const n = noise(0.5), bp = filt('bandpass', 900, 3), g = a.createGain();
        g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
        n.connect(bp); bp.connect(g); g.connect(a.destination); n.start(t0);
        break;
      }
      case 'monitor_beep': {
        const o = tone('sine', 880, 0.12);
        env(out, [[0.005, 0.13], [0.11, 0.0001]]);
        o.connect(out);
        break;
      }
      case 'monitor_flat': {
        const o = tone('sine', 880, 1.6);
        env(out, [[0.02, 0.12], [1.5, 0.12], [1.6, 0]]);
        o.connect(out);
        break;
      }
      case 'gasp': {
        const n = noise(0.7), bp = a.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 1.4;
        bp.frequency.setValueAtTime(400, t0); bp.frequency.linearRampToValueAtTime(1300, t0 + 0.45);
        env(out, [[0.4, 0.26], [0.55, 0.0001]]);
        n.connect(bp); bp.connect(out); n.start(t0); n.stop(t0 + 0.7);
        break;
      }
      case 'alarm': {
        const o = a.createOscillator(); o.type = 'square';
        for (let i = 0; i < 10; i++) o.frequency.setValueAtTime(i % 2 ? 560 : 760, t0 + i * 0.4);
        const lp = filt('lowpass', 1500);
        env(out, [[0.05, 0.05], [3.8, 0.05], [4, 0]]);
        o.connect(lp); lp.connect(out); o.start(t0); o.stop(t0 + 4);
        break;
      }
      case 'plug_pull': {
        const n = noise(0.4), hp = filt('highpass', 1800);
        env(out, [[0.01, 0.3], [0.35, 0]]);
        n.connect(hp); hp.connect(out); n.start(t0); n.stop(t0 + 0.4);
        const o = a.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(220, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.5);
        const g = a.createGain(); g.gain.setValueAtTime(0.35, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
        o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + 0.65);
        break;
      }
      case 'power_down': {
        const o = a.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(22, t0 + 2.2);
        const lp = filt('lowpass', 400);
        env(out, [[0.05, 0.25], [2.0, 0.15], [2.3, 0]]);
        o.connect(lp); lp.connect(out); o.start(t0); o.stop(t0 + 2.4);
        break;
      }
    }
  }

  // cut every sound that is still playing (used when the player skips a scene)
  function stopAudio() { cancelSpeech(); if (typeof Sound !== 'undefined') Sound.stopOneShots(); if (audio) { try { audio.close(); } catch (e) { /* ignore */ } audio = null; } }

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
    cancelSpeech();
    if (box) box.classList.remove('show');
  }

  function speaking() { return !!cur || queue.length > 0; }

  // Add a line. opts: { speaker, dur, static, force }
  function say(text, key, opts) {
    opts = opts || {};
    if (isMuted() && !opts.force) return false;
    const speaker = opts.speaker || 'ARIA';
    if (speaker === 'ARIA' && GameState.player && GameState.player.floor === -1) return false;   // the basement: no intercom, no dialogue, ever
    const item = {
      text: text,
      speaker: speaker,
      aria: speaker === 'ARIA' && opts.static !== false,
      cutoff: !!opts.cutoff,       // the line breaks off mid-sentence: static, then gone
      dur: opts.dur || (opts.cutoff ? text.length / 70 + 0.45 : Math.max(2.6, text.length * 0.055 + 1.4)),
      t: 0, shown: 0
    };
    item.vname = opts.voice || null;
    item.vcfg = opts.voice === 'marcus' ? C.VOICE_MARCUS : V;
    item.voiced = voiceOn() && (item.aria || !!opts.voice);
    item.sp = 'idle'; item.sT = 0; item.bIdx = 0;
    if (PRIORITY[key] || opts.interrupt) { queue = []; if (cur) cancelSpeech(); cur = null; }
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

  function endLine() {
    if (cur && cur.cutoff) { staticT = 0.9; fx('intercom_static'); }
    cur = null; if (queue.length) startNext(); else box.classList.remove('show');
  }

  // A spoken line: the subtitle follows her voice, and the line lasts as long as she speaks.
  function updateVoiced(dt) {
    cur.t += dt;
    if (cur.t > 0.35) box.classList.remove('crackle');
    const VC = cur.vcfg || V;
    if (cur.sp === 'idle' && cur.t >= VC.START_DELAY) startSpeech(cur);
    const len = cur.text.length;
    let want = 0;
    if (cur.sp === 'live') {
      cur.sT += dt;
      if (cur.bSeen) want = cur.bIdx;
      else want = Math.floor(cur.sT * V.CHARS_PER_SEC * VC.RATE);            // no word timings: estimate her pace
      if (cur.cutoff && !cur.bSeen && cur.cutT === undefined && cur.sT >= len / (V.CHARS_PER_SEC * VC.RATE) * 0.9) cur.cutT = 0;   // no word timings: cut by estimate
      if (cur.cutT !== undefined) { cur.cutT -= dt; if (cur.cutT <= 0) { cancelSpeech(); cur.sp = 'done'; cur.doneT = 0; } }
      // speech never started or never ended (blocked / broken voice): fall back to the subtitle alone
      if ((!cur.live && cur.sT > 4) || cur.sT > len / (V.CHARS_PER_SEC * VC.RATE) * 2 + 12) { cancelSpeech(); cur.sp = 'done'; cur.doneT = 0; }
    } else if (cur.sp === 'done') {
      cur.doneT += dt;
      want = cur.cutoff ? (cur.bIdx || len) : len;
      if (cur.doneT >= (cur.cutoff ? 0.05 : V.HOLD)) { endLine(); return; }
    }
    want = Math.min(len, want);
    if (want !== cur.shown) { cur.shown = want; lineEl.textContent = cur.text.slice(0, want); }
  }

  function update(dt) {
    if (!box) return;
    // pausing the game pauses her voice too
    if (synth && cur && cur.voiced && cur.sp === 'live') {
      if (dt === 0 && !speechPaused) { speechPaused = true; try { synth.pause(); } catch (e) { /* ignore */ } }
      else if (dt > 0 && speechPaused) { speechPaused = false; try { synth.resume(); } catch (e) { /* ignore */ } }
    }
    if (dt > 0) {
      if (staticT > 0) { staticT = Math.max(0, staticT - dt); drawStatic(); }
      if (!cur && queue.length) startNext();
      if (cur && cur.voiced) updateVoiced(dt);
      else if (cur) {
        cur.t += dt;
        // typewriter: each line reveals quickly, then holds
        const want = Math.min(cur.text.length, Math.floor(cur.t * 70));
        if (want !== cur.shown) { cur.shown = want; lineEl.textContent = cur.text.slice(0, want); }
        if (cur.t > 0.35) box.classList.remove('crackle');
        if (cur.t >= cur.dur) endLine();
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
    if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }
  }

  window.addEventListener('DOMContentLoaded', init);

  return { init: init, update: update, say: say, mute: mute, clear: clear, fx: fx, speak: speak, stopAudio: stopAudio, isMuted: isMuted, speaking: speaking };
})();
