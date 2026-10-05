/* ============================================================================
 * items.js — ARIA : key items, pickup toast, HUD icons, tunnel "lost" loop.
 *
 * OWNS:    the white item-name toast at the bottom of the screen (3 s),
 *          the icon strip (bottom right) of every item currently carried,
 *          ARIA's reaction to a pickup (a line, or deliberate silence),
 *          the missing-tunnel-map rule: without the map you get lost in the
 *          tunnels and are returned to the entrance.
 * IMPORTS: CONFIG (ITEMS, TOAST_TIME, TUNNEL_LOST_RADIUS), GameState (main.js),
 *          Player, Dialogue (read / call only).
 * EXPORTS: Items { init, update, toast, renderStrip, missing }
 *
 * Inventory itself lives on GameState (items, hasItem, giveItem, clearItems).
 * Every item is lost on death: main.js restartRun() calls clearItems().
 * ========================================================================== */

const Items = (function () {
  'use strict';

  const C = CONFIG;
  let toastEl, stripEl, fadeEl, toastT = 0;
  let entry = null, lastFloor = null, lostBusy = 0;

  function mk(tag, id, cls) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    document.body.appendChild(e);
    return e;
  }

  function toast(text, secs) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    void toastEl.offsetWidth;                 // restart the fade
    toastEl.classList.add('on');
    toastT = secs || C.TOAST_TIME;
  }

  function renderStrip() {
    stripEl.innerHTML = '';
    Object.keys(GameState.items).forEach(function (id) {
      const d = C.ITEMS[id];
      if (!d) return;
      const s = document.createElement('span');
      s.className = 'item-ico';
      s.textContent = d.icon;
      s.title = d.name;
      stripEl.appendChild(s);
    });
  }

  // ARIA's reaction to picking something up
  function onPickup(id) {
    const d = C.ITEMS[id];
    if (!d) return;
    toast(d.name);
    renderStrip();
    if (d.silent) Dialogue.mute(d.silent);                                  // her silence feels deliberate
    else if (d.line) setTimeout(function () { Dialogue.say(d.line, 'item', { force: true, interrupt: true }); }, 900);
  }

  // names of the items in `ids` that the player does not hold
  function missing(ids) {
    return ids.filter(function (id) { return !GameState.hasItem(id); });
  }

  // Lost in the tunnels without the map: black out, return to where you came in.
  function lostInTunnels(P) {
    lostBusy = 2.4;
    toast('You are lost. Every passage looks the same.', 3);
    GameState.emit('lost', {});
    fadeEl.classList.add('on');
    Player.state.frozen = true;
    setTimeout(function () {
      Player.teleport(-1, entry.x, entry.z, Player.state.yaw + Math.PI);
      Player.state.pitch = 0;
    }, 700);
    setTimeout(function () {
      fadeEl.classList.remove('on');
      Player.state.frozen = !(document.pointerLockElement === GameState.renderer.domElement);
    }, 1500);
  }

  function update(dt) {
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) { toastEl.classList.remove('on'); }
    }
    const P = GameState.player;
    const playing = GameState.state === 'PLAYING';
    stripEl.classList.toggle('hidden', !playing || !Object.keys(GameState.items).length);
    if (!playing) { lastFloor = null; return; }

    // tunnel map rule
    if (lostBusy > 0) lostBusy -= dt;
    if (P.floor === -1) {
      if (lastFloor !== -1) entry = { x: P.x, z: P.z };
      else if (entry && lostBusy <= 0 && !GameState.hasItem('tunnel_map') &&
               Math.hypot(P.x - entry.x, P.z - entry.z) > C.TUNNEL_LOST_RADIUS) lostInTunnels(P);
    }
    lastFloor = P.floor;
  }

  function init() {
    toastEl = mk('div', 'toast', 'hidden');
    stripEl = mk('div', 'items-hud', 'hidden');
    fadeEl = mk('div', 'lost-fade');
    GameState.on('item_pickup', onPickup);
    GameState.on('items_cleared', function () { renderStrip(); entry = null; lastFloor = null; });
  }

  return { init: init, update: update, toast: toast, renderStrip: renderStrip, missing: missing };
})();
