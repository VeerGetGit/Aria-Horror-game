/* ============================================================================
 * atmos.js — ARIA : the lights that react, and the quiet details around them.
 *
 * OWNS:    reactive lights: (1) when the drone enters a corridor the lights
 *          near it flicker once and settle; (2) stand near a body and the
 *          nearest light buzzes and dies for the rest of the run; (3) three or
 *          four random lights die per run, in different places every time.
 * IMPORTS: CONFIG (ENV), GameState (main.js), World (scene.js), Drone.
 * EXPORTS: Atmos { init, update, resetRun }
 *
 * The props (clocks stopped at 03:31, the spinning chair, the steaming mug,
 * bodies arranged neatly, blood stories, drifting wall shadows, the red
 * emergency pulse) live in scene.js; the dimming before she speaks is driven
 * by dialogue.js through World.setDim. Everything resets with each run.
 * ========================================================================== */

const Atmos = (function () {
  'use strict';

  const C = CONFIG;
  const E = C.ENV;
  let dwell = 0, usedBodies = {}, pending = [], playT = 0;
  let lastCorridor = false;

  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

  function resetRun() {
    dwell = 0; usedBodies = {}; playT = 0; lastCorridor = false;
    pending = [];
    // 3-4 lights, chosen anew every run (never the lamps, never the basement)
    const cand = World.fixtures.filter(fx => fx.floor >= 0 && fx.group !== 'lamp' && fx.baseMode !== 'dead');
    const n = Math.round(rnd(E.RANDOM_DEATHS[0], E.RANDOM_DEATHS[1]));
    for (let i = 0; i < n && cand.length; i++) {
      const fx = cand.splice(Math.floor(Math.random() * cand.length), 1)[0];
      pending.push({ fx: fx, at: rnd(E.RANDOM_DEATH_TIME[0], E.RANDOM_DEATH_TIME[1]) });
    }
  }

  function buzz(fx) {
    World.killFixture(fx, E.LIGHT_BUZZ);
    GameState.emit('light_buzz', { x: fx.x, y: fx.y, z: fx.z, floor: fx.floor });
  }

  function update(dt) {
    const P = GameState.player;
    if (GameState.state !== 'PLAYING' || P.floor < 0) { lastCorridor = false; dwell = 0; return; }
    playT += dt;

    // (1) the drone steps into a corridor: the lights near it flicker once, then stabilise
    const Dd = Drone.data;
    if (Dd && Dd.state !== 'OFF' && Dd.state !== 'HOLD' && Dd.floor === P.floor) {
      const inCor = /corridor|lobby|hall/i.test(World.roomAt(Dd.floor, Dd.x, Dd.z) || '');
      if (inCor && !lastCorridor) World.flickerNear(Dd.floor, Dd.x, Dd.z, E.DRONE_FLICKER_R, E.DRONE_FLICKER);
      lastCorridor = inCor;
    } else lastCorridor = false;

    // (2) stand near a body for a while: the nearest light buzzes and dies for this run
    let near = null;
    World.bodies.forEach((b, i) => { if (b.floor === P.floor && !usedBodies[i] && Math.hypot(b.x - P.x, b.z - P.z) < E.BODY_NEAR) near = i; });
    if (near !== null) {
      dwell += dt;
      if (dwell >= E.BODY_DWELL) {
        usedBodies[near] = true; dwell = 0;
        const fx = World.nearestFixture(P.floor, P.x, P.z, 9);
        if (fx) buzz(fx);
      }
    } else dwell = 0;

    // (3) the random ones go when you are close enough to notice
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (playT < p.at || p.fx.floor !== P.floor || Math.hypot(p.fx.x - P.x, p.fx.z - P.z) > E.RANDOM_DEATH_NEAR) continue;
      buzz(p.fx); pending.splice(i, 1);
    }
  }

  function init() { resetRun(); }

  return { init: init, update: update, resetRun: resetRun };
})();
