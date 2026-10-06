/* ============================================================================
 * basement.js — ARIA : the horror that lives in the maintenance tunnels.
 *
 * OWNS:    the scratching inside the walls (random intervals, never explained),
 *          the body that was not there before (appears after you have passed
 *          its spot and left), the one-time flashlight death (exactly 3 s,
 *          total darkness, then the light returns on its own and the tunnel
 *          goes quiet), and cutting ARIA off the moment you go down there.
 * IMPORTS: CONFIG (BASEMENT), GameState (main.js), Player, World, Dialogue.
 * EXPORTS: Basement { init, update, resetRun }
 *
 * Static props (the welded door, the child's drawing, the ceiling handprints,
 * the hidden body) are built in scene.js; the shadow figure's "different tunnel,
 * different distance" rule lives in cutscenes.js. dialogue.js refuses every ARIA
 * line while the player is on floor -1: the silence is the horror.
 * Everything here resets with each run (a death restarts the whole game).
 * ========================================================================== */

const Basement = (function () {
  'use strict';

  const C = CONFIG;
  const K = C.BASEMENT;
  let bodyPhase = 0;                 // 0 not passed yet, 1 passed, 2 body is there
  let scratchT = 0, tunnelT = 0, lastFloor = null;
  let blackoutDone = false, blackoutAt = 0;

  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

  function resetRun() {
    bodyPhase = 0;
    World.setBasementBody(false);
    scratchT = rnd(K.SCRATCH.MIN, K.SCRATCH.MAX);
    tunnelT = 0;
    blackoutDone = false;
    blackoutAt = rnd(K.BLACKOUT.MIN_TUNNEL_TIME, K.BLACKOUT.MAX_TUNNEL_TIME);
    GameState.tunnelHush = 0;
    lastFloor = null;
  }

  // a point inside the wall of the nearest tunnel in a random direction: where the scratching comes from
  function wallPoint(P) {
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let L = 0;
      while (L < K.SCRATCH.DIST[1] && !World.blocked(-1, P.x + dx * L, P.z + dz * L, 0.2)) L += 0.5;
      if (L >= K.SCRATCH.DIST[0] * 0.5 && L < K.SCRATCH.DIST[1]) return { x: P.x + dx * (L + 0.4), z: P.z + dz * (L + 0.4) };
    }
    return null;
  }

  function update(dt) {
    const P = GameState.player;
    if (GameState.state !== 'PLAYING') { lastFloor = null; return; }
    const inT = P.floor === -1;

    // the moment you go down, she is cut off mid-word and never speaks again until you come up
    if (inT && lastFloor !== -1 && typeof Dialogue !== 'undefined' && Dialogue.speaking()) Dialogue.clear();

    // the body: first you walk past an empty spot ...
    const b = K.BODY, d = Math.hypot(P.x - b.x, P.z - b.z);
    if (inT) {
      if (bodyPhase === 0 && d < b.r) bodyPhase = 1;
      else if (bodyPhase === 1 && d > b.REVEAL_DIST) { bodyPhase = 2; World.setBasementBody(true); }       // ... and later it is there
    } else if (bodyPhase === 1 && lastFloor === -1) { bodyPhase = 2; World.setBasementBody(true); }          // (or you went upstairs and came back)

    if (inT) {
      // scratching inside the walls
      scratchT -= dt;
      if (scratchT <= 0) {
        scratchT = rnd(K.SCRATCH.MIN, K.SCRATCH.MAX);
        const p = wallPoint(P);
        if (p) GameState.emit('wall_scratch', p);
      }
      // the flashlight dies for exactly three seconds, once
      if (P.flashlightOn && !P.hiding) tunnelT += dt;
      if (!blackoutDone && tunnelT >= blackoutAt && P.flashlightOn && !P.hiding) {
        blackoutDone = true;
        Player.killLight(K.BLACKOUT.SECONDS);
        GameState.tunnelHush = GameState.time + K.BLACKOUT.SECONDS + K.BLACKOUT.HUSH;
      }
    }
    lastFloor = P.floor;
  }

  function init() { resetRun(); }

  return { init: init, update: update, resetRun: resetRun };
})();
