/* ============================================================================
 * playstyle.js — ARIA : she watches how you play.
 *
 * OWNS:    the counters behind her six remarks: you sprint a lot, you crouch
 *          everywhere, you hide often, you stand frozen, you keep returning to
 *          the same floor, you have died twice. Each remark is made once.
 * IMPORTS: CONFIG (PLAYSTYLE, DIALOGUE), GameState (main.js), Dialogue, Scares
 *          (free / hold: shares its "not during a chase, not in the basement,
 *          never two together" gate).
 * EXPORTS: Playstyle { init, update, resetRun, stats }
 *
 * Counters and "already said" flags reset with each run; the deaths remark is
 * made once per session (deaths are counted across runs).
 * ========================================================================== */

const Playstyle = (function () {
  'use strict';

  const C = CONFIG;
  const K = C.PLAYSTYLE;
  const D = C.DIALOGUE;

  const st = { move: 0, sprint: 0, crouch: 0, hides: 0, still: 0, playT: 0, entries: {}, lastFloor: null };
  let done = {}, deathsDone = false;

  function resetRun() {
    st.move = st.sprint = st.crouch = st.hides = st.still = st.playT = 0;
    st.entries = {}; st.lastFloor = null;
    done = {};
  }

  const floorName = f => (f === 0 ? 'the ground floor' : 'Floor ' + f);

  function speak(id, text) {
    if (Dialogue.say(text, 'style', { interrupt: false })) {
      done[id] = true;
      Scares.hold(K.HOLD);
      return true;
    }
    return false;
  }

  function update(dt) {
    if (GameState.state !== 'PLAYING' || dt <= 0) return;
    const P = GameState.player;
    st.playT += dt;

    // floor transitions: how many times have you come back to each floor?
    if (P.floor !== st.lastFloor) {
      st.entries[P.floor] = (st.entries[P.floor] || 0) + 1;
      st.lastFloor = P.floor;
    }

    // movement habits
    if (P.moving && !P.hiding) {
      st.move += dt;
      if (P.sprinting) st.sprint += dt;
      if (P.crouching) st.crouch += dt;
      st.still = 0;
    } else if (!P.hiding && !GameState.noteOpen && !P.frozen) st.still += dt;
    else st.still = 0;

    if (!Scares.free()) return;

    if (!done.sprint && st.move >= K.MIN_MOVE_TIME && st.sprint / st.move >= K.SPRINT_SHARE) { speak('sprint', D.styleSprint); return; }
    if (!done.crouch && st.move >= K.MIN_MOVE_TIME && st.crouch / st.move >= K.CROUCH_SHARE) { speak('crouch', D.styleCrouch); return; }
    if (!done.hide && st.hides >= K.HIDES) { speak('hide', D.styleHide); return; }
    if (!done.still && st.still >= K.STILL_SECONDS) { speak('still', D.styleStill); return; }
    if (!done.ret) {
      for (let f = 0; f <= 3; f++) {
        if ((st.entries[f] || 0) - 1 >= K.RETURNS && f === P.floor) { speak('ret', D.styleReturn.replace('{floor}', floorName(f))); return; }
      }
    }
    if (!deathsDone && GameState.deaths >= 2 && st.playT >= K.DEATHS_AFTER) {
      if (Dialogue.say(D.styleDeaths, 'style', { interrupt: false })) { deathsDone = true; Scares.hold(K.HOLD); }
    }
  }

  function init() {
    resetRun();
    GameState.on('hide_enter', function () { st.hides++; });
  }

  return { init: init, update: update, resetRun: resetRun, stats: st };
})();
