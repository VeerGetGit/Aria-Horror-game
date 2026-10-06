/* ============================================================================
 * sweep.js — ARIA : the ventilation sweep.
 *
 * OWNS:    the two surprise sweeps per run: every intercom crackles, she
 *          announces a sweep in 60 seconds, a countdown shows on the HUD with
 *          a one-time hint ("Find cover. Now."), and the vents begin to hiss.
 *          When it reaches zero you must be hiding (locker / under a desk) or
 *          on another floor. Otherwise: the full death sequence and a restart
 *          from Scene 1. Survive and she says "Clean. Let's continue."
 * IMPORTS: CONFIG (SWEEP, DIALOGUE), GameState (main.js), Dialogue, Scares
 *          (free / hold), Main (sweepDeath), Sound (setSweep).
 * EXPORTS: Sweep { init, update, resetRun, state }
 *
 * Rules: never on Floor 3 or the ground floor, never during a chase or any
 * cutscene, never in the first 5 minutes, never twice on the same floor in a row.
 * ========================================================================== */

const Sweep = (function () {
  'use strict';

  const C = CONFIG;
  const K = C.SWEEP;
  const D = C.DIALOGUE;

  let hudEl, labelEl, timeEl, hintEl;
  let playT = 0, done = 0, at = [], lastFloor = null, active = null;
  let hintShown = false, pendingClean = 0;

  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  const state = { get active() { return !!active; } };

  function mk(tag, id, cls, parent) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    (parent || document.body).appendChild(e);
    return e;
  }

  function resetRun() {
    playT = 0; done = 0; lastFloor = null; active = null; pendingClean = 0; hintShown = false;
    at = K.WINDOWS.map(w => rnd(w[0], w[1]));
    GameState.sweep = { active: false };
    if (hudEl) hudEl.classList.add('hidden');
    if (typeof Sound !== 'undefined') Sound.setSweep(0);
  }

  function showHint() {
    if (hintShown) return;
    hintShown = true;                                   // does not appear again this run
    hintEl.textContent = D.sweepHint;
    hintEl.classList.add('on');
    setTimeout(function () { hintEl.classList.remove('on'); }, K.HINT_TIME * 1000);
  }

  function start(P) {
    active = { floor: P.floor, t: K.DURATION };
    GameState.sweep.active = true;
    Scares.hold(K.DURATION + K.QUIET_AFTER);
    // every intercom in the building crackles ...
    for (let i = 0; i < K.STATIC_BURSTS; i++) setTimeout(function () { GameState.emit('intercom_static', {}); }, i * 380);
    // ... then she speaks, and the countdown begins
    setTimeout(function () { Dialogue.say(D.sweepStart, 'sweep', { force: true, interrupt: true }); }, K.STATIC_BURSTS * 380);
    showHint();
    hudEl.classList.remove('hidden');
  }

  function finish(P) {
    const safe = P.hiding || P.floor !== active.floor;
    lastFloor = active.floor;
    done++;
    active = null; GameState.sweep.active = false;
    hudEl.classList.add('hidden');
    if (typeof Sound !== 'undefined') Sound.setSweep(0);
    if (safe) {
      Scares.hold(K.QUIET_AFTER);
      if (P.floor >= 0) Dialogue.say(D.sweepClean, 'sweep', { force: true, interrupt: true });
      else pendingClean = 90;                           // she is silent underground; she says it when you come up
    } else {
      Main.sweepDeath();                                // the full death sequence, then Scene 1 again
    }
  }

  function allowed(P) {
    return K.FLOORS.indexOf(P.floor) >= 0 && P.floor !== lastFloor;
  }

  function update(dt) {
    if (GameState.state !== 'PLAYING' || dt <= 0) return;
    const P = GameState.player;
    playT += dt;

    if (pendingClean > 0 && P.floor >= 0) {
      pendingClean = 0;
      Dialogue.say(D.sweepClean, 'sweep', { force: true, interrupt: true });
    } else if (pendingClean > 0) pendingClean -= dt;

    if (!active) {
      if (done < K.COUNT && playT >= K.MIN_PLAY && playT >= at[done] && allowed(P) && !P.hiding && Scares.free()) start(P);
      return;
    }

    active.t -= dt;
    const left = Math.max(0, active.t);
    const safeNow = P.hiding || P.floor !== active.floor;
    const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
    timeEl.textContent = '0' + mm + ':' + (ss < 10 ? '0' : '') + ss;
    labelEl.textContent = safeNow ? 'VENTILATION SWEEP — COVER SECURED' : 'VENTILATION SWEEP';
    hudEl.classList.toggle('safe', !!safeNow);
    hudEl.classList.toggle('urgent', !safeNow && left <= 10);
    if (typeof Sound !== 'undefined') Sound.setSweep(1 - left / K.DURATION);
    if (active.t <= 0) finish(P);
  }

  function init() {
    hudEl = mk('div', 'sweep-hud', 'hidden');
    labelEl = mk('div', null, 'sw-label', hudEl);
    timeEl = mk('div', null, 'sw-time', hudEl);
    hintEl = mk('div', 'sweep-hint');
    resetRun();
  }

  return { init: init, update: update, resetRun: resetRun, state: state, debug: { get at() { return at; }, get done() { return done; } } };
})();
