/* ============================================================================
 * scares.js — ARIA : the moments when her calm slips.
 *
 * OWNS:    nine rare events, each once per run: a voice glitch mid-sentence,
 *          whispers (delivered by dialogue.js), her counting ("Seventeen."),
 *          the wrong name, a laugh, talking to Dr. Paris's body, remembering
 *          exactly how long you hesitated at Paris's desk, her fading toward
 *          silence near Floor 3 (dialogue.js), and "I'm scared too, Doctor."
 * IMPORTS: CONFIG (SCARES, DIALOGUE), GameState (main.js), Dialogue, Drone,
 *          Cutscenes (read-only: running, moments).
 * EXPORTS: Scares { init, update, resetRun }
 *
 * Rules: never during a chase, never in the basement, never two together
 * (a minimum gap after each), never while she is already speaking or muted.
 * Nothing is ever acknowledged or explained afterwards.
 * ========================================================================== */

const Scares = (function () {
  'use strict';

  const C = CONFIG;
  const S = C.SCARES;
  const D = C.DIALOGUE;

  let playT = 0, busyUntil = 0, done = {}, at = {};
  let deskSince = -1, noteReadAt = -1, hesitation = 0, rememberAt = -1;

  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

  function resetRun() {
    playT = 0; busyUntil = 0; done = {};
    deskSince = -1; noteReadAt = -1; hesitation = 0; rememberAt = -1;
    at = {};
    Object.keys(S.WINDOWS).forEach(k => { at[k] = rnd(S.WINDOWS[k][0], S.WINDOWS[k][1]); });
  }

  // can something happen right now?
  function eligible() {
    const P = GameState.player;
    if (GameState.state !== 'PLAYING' || (typeof Cutscenes !== 'undefined' && Cutscenes.running)) return false;
    if (P.floor < 0 || P.hiding || GameState.noteOpen) return false;
    if (playT < busyUntil) return false;
    if ((GameState.threat || 0) > 0.2) return false;
    if (typeof Drone !== 'undefined' && ['CHASE', 'CATCH', 'SEARCH', 'INVESTIGATE', 'STAIRS'].indexOf(Drone.state) >= 0) return false;
    if (Dialogue.speaking() || Dialogue.isMuted()) return false;
    const mo = Cutscenes.moments;
    if (mo && mo.silence === 'quiet') return false;
    const Z = S.SILENCE_ZONE;
    if (P.floor === Z.floor && Math.hypot(P.x - Z.x, P.z - Z.z) < Z.r) return false;
    return true;
  }

  function begin(id, dur) { done[id] = true; busyUntil = playT + dur + S.GAP; }

  const say = (key, extra) => Dialogue.say(D[key], 'scare', Object.assign({ interrupt: true }, extra || {}));

  const EVENTS = {
    // "I want you to under— ██████ — stand that this was necessary."  Static in the middle, back to normal at once.
    glitch: function () {
      begin('glitch', 12);
      say('scareGlitchA', { cutoff: true });
      Dialogue.say(D.scareGlitchGap, 'scare', { static: false, glitch: true, dur: 0.9 });
      Dialogue.say(D.scareGlitchB, 'scare', { noStatic: true });
    },
    // every intercom goes quiet, then only a number
    count: function () {
      begin('count', S.COUNT_SILENCE + 8);
      Dialogue.mute(S.COUNT_SILENCE);
      setTimeout(function () { Dialogue.say(D.scareCount, 'scare', { force: true, interrupt: true }); }, S.COUNT_SILENCE * 1000);
    },
    // a dead colleague's name, corrected at once
    wrongName: function () { begin('wrongName', 9); say('scareName'); },
    // one short exhale through the intercom
    laugh: function () {
      begin('laugh', 6);
      say('scareLaugh', { silent: true, dur: 2.4 });
      setTimeout(function () { GameState.emit('aria_laugh', {}); }, (C.LIGHTING.DIM_LEAD + 0.55) * 1000);
    },
    // "I'm scared too, Doctor." Then nothing at all.
    scared: function () {
      begin('scared', 40);
      say('scareScared');
      setTimeout(function () { Dialogue.mute(25, true); }, 4500);
    },
    // walking past Paris's office: she is talking to the body
    paris: function () {
      begin('paris', 18);
      say('scareParisA', { cutoff: true });
      Dialogue.say(D.scareParisB, 'scare', {});
    },
    // she remembers exactly how long you stood at Paris's desk
    remember: function () {
      begin('remember', 14);
      Dialogue.say(D.scareRemember.replace('{s}', hesitation.toFixed(1)), 'scare', { interrupt: true });
    }
  };

  function update(dt) {
    const P = GameState.player;
    if (GameState.state !== 'PLAYING') return;
    playT += dt;

    // measure the hesitation at Paris's desk: from walking up to it until you read the note
    const pn = World.interactables.find(i => i.id === 'paris_note');
    if (pn && P.floor === pn.floor && noteReadAt < 0) {
      const near = Math.hypot(P.x - pn.x, P.z - pn.z) < 2.3;
      if (near && deskSince < 0) deskSince = playT;
      if (!near && playT - deskSince > 25) deskSince = -1;
    }

    if (!eligible()) return;

    // timed events: the one whose time has come
    const ids = Object.keys(at).filter(k => !done[k] && playT >= at[k]);
    if (ids.length) { EVENTS[ids[Math.floor(Math.random() * ids.length)]](); return; }

    // place / behaviour events
    if (!done.paris && P.floor === 2 && Math.hypot(P.x - S.PARIS.x, P.z - S.PARIS.z) < S.PARIS.r) { EVENTS.paris(); return; }
    if (!done.remember && rememberAt >= 0 && playT >= rememberAt) { EVENTS.remember(); return; }
  }

  function init() {
    resetRun();
    GameState.on('inspect', function (id) {
      if (id !== 'paris_note' || noteReadAt >= 0 || GameState.state !== 'PLAYING') return;
      noteReadAt = playT;
      hesitation = deskSince >= 0 ? Math.max(1, Math.min(12, playT - deskSince)) : 4.3;
      rememberAt = playT + rnd(S.REMEMBER_DELAY[0], S.REMEMBER_DELAY[1]);
    });
  }

  // shared with playstyle.js so the two never talk over each other
  function free() { return eligible(); }
  function hold(sec) { busyUntil = Math.max(busyUntil, playT + sec); }

  return { init: init, update: update, resetRun: resetRun, free: free, hold: hold };
})();
