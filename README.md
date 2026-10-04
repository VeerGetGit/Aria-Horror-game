# ARIA

First-person browser horror game (Three.js, vanilla JS, no build step).
Open `index.html` directly in a browser — no local server needed. Three.js is loaded from a CDN, so you need an internet connection.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click BEGIN to capture the pointer; Esc pauses) |
| Shift | Sprint (loud) |
| Ctrl or C | Crouch (silent) — `C` exists because Ctrl+W closes the browser tab |
| F | Flashlight (battery drains only in the basement tunnels) |
| E | Use: inspect notes / the computer / the photo, hide in a locker or under a desk (press again to come out; while ARIA hunts you, E always means hide), climb the hidden ladder hatches |
| M | Mute / unmute all sound |
| Space | Skip the current cutscene (opening scenes, the death scene) |
| 1 – 5 | **Debug:** jump to Floor 2 / Floor 1 / Basement / Floor 3 / Ground |

## Tuning

Everything tunable lives in `js/config.js` (speeds, sizes, lighting, battery drain, level layout, later: dialogue). Set `DEBUG.ENABLED` / `DEBUG.SHOW_INFO` to `false` before shipping.

## File map

```
index.html        loads Three.js (CDN) + all scripts, minimal HTML
css/style.css     canvas, menu, pause, debug readout, prompts
js/config.js      ALL constants + level layout data
js/main.js        GameState, renderer, loop, state machine
js/scene.js       World: floors, rooms, stairs, props, lights, collision
js/player.js      movement, look, sprint/crouch, flashlight, hiding, passages
js/drone.js       drone mesh, patrols, A* navigation, vision/hearing, chase
js/aria.js        ARIA's brain: learning, door locks, cameras, threat
js/sound.js       Web Audio soundscape: menu pad, ambience, spatial drone, footsteps, heartbeat, all one-shots
js/hud.js         heartbeat ECG, battery bar, proximity pulse, hide overlay
js/dialogue.js    subtitles, intercom static, line queue, silence, ambient lines
js/cutscenes.js   opening scenes 1-6, death scene, both endings, credits, inspect notes, scripted ambient moments
```

Stage 5 added `sound.js` and the menu polish. Remaining: a by-ear tuning pass (see Sound notes).

Scripts are plain `<script>` tags (no ES modules) so the game runs from `file://`. Modules share the global `GameState` object defined in `main.js`.

## Build notes

- Units are metres; +Z = north, camera yaw 0 faces -Z.
- Floors are stacked 4 m apart; a switchback stairwell at the centre connects Basement → Ground → 1 → 2 → 3. Stairs are smooth ramps (visual steps on top).
- Collision is 2D axis-aligned rectangles per floor + a ground-height function for the stairs.
- Only 8 real point lights exist; they are re-assigned every 0.2 s to the nearest of ~300 "fixtures" (emissive meshes), which keeps the renderer cheap while the lab still flickers and glows.
- Doors are static open doorways with a lockable leaf (`World.doors[i].setLocked(true)`) ready for ARIA in Stage 2.
- **Drone:** patrols a per-floor route (`CONFIG.DRONE.PATROLS`), hears noise (sprinting is loud, crouching is quiet), and sees you inside a vision cone with line of sight. Spotted → chase (4.4 m/s; you sprint at 5.4 but loudly). Lose it for 2.2 s → it searches your last known position. It paths with A* over the real collision data, so doors ARIA locks truly block it. It follows you across floors after a short delay and never enters the tunnels.
- **Hiding:** E at a locker or desk. If the drone watches you step in, it knows. Otherwise it searches and gives up.
- **ARIA learns:** a hiding spot you have used before is checked first (and she tells you so); a door you have walked through twice gets locked for 40 s while you are away from it. Security cameras sweep a red beam; being caught in it sends the drone to investigate.
- **Basic caught → respawn** (at the current floor's landing) is in place until Stage 4's full death scene.
- **Opening (Stage 3):** flashback → calm office (2 min, playable: inspect the sticky note, computer, photo, folder) → the glitch → black + distant scream → CCTV footage (drawn procedurally on a canvas) → wake-up (playable, hands shaking, the drone waits motionless at the far end of the corridor, then rolls toward you and the game begins). Set `CONFIG.DEBUG.SKIP_OPENING = true` to skip it while developing.
- **Dialogue:** every ARIA line is preceded by intercom static (screen noise + audio) and shown as a subtitle. All strings live in `CONFIG.DIALOGUE`. Until Stage 5, `dialogue.js` has a tiny Web Audio fallback for the static, door slam and scream.
- **Scripted moments:** random door slams (never explained); once per playthrough the intercoms go silent for 60 s and ARIA then says one quiet line; in the tunnels a figure can appear at the far end of the flashlight beam and is gone when you look back (ARIA never mentions it); the server and control room screens show your own heart rate, oxygen and stress live.
- **Death (Stage 4):** when the drone reaches you (or opens your hiding spot) the camera locks on its red eye for 2 s of silence, then ARIA speaks while the vignette closes in, the colour drains to red and then black-and-white, and the screen pulses like a slowing heartbeat; gas hiss, ragged breathing, choking, a slowing heart monitor, one final gasp, silence. Then 3 s of black and the cause-of-death text. You respawn at the last **checkpoint** (`CONFIG.CHECKPOINTS`, set by walking near them; a toast shows the name) with ARIA's "Let's try this again, Doctor." (second death: "You're learning. So am I."). Space skips the scene.
- **Ending A — shut her down:** Floor 3, server room. `[E]` at the main terminal → ARIA's last words; then `[E]` at the plug → everything goes dark → "ARIA OFFLINE — 03:58 AM" → silent credits.
- **Ending B — burn it down:** Ground floor power room, `[E]` at the fire suppression override panel → alarm, the lobby catches fire, the exit door unlocks. Walk out: the camera cuts outside to the burning lab, ARIA's voice cuts off mid-sentence, then the closing text and silent credits.
- Both endings finish on an end card with PLAY AGAIN (reloads the page).
- The dialogue/death/ending sounds currently come from a small Web Audio fallback inside `dialogue.js`; Stage 5's `sound.js` replaces it (it listens to the same `GameState` events).
- `World.hideSpots` (lockers / desks) and `World.interactables` (notes, terminal, plug, fire override) are registered now and used in later stages.

## Version log

- **0.4.0 — Stage 4:** full death scene, checkpoint system, Ending A (server room shutdown), Ending B (fire override + escape), credits and end card.
- **0.3.0 — Stage 3:** the six opening scenes, ARIA dialogue with intercom static and subtitles, inspectable notes, scripted ambient moments (door slams, 60 s silence, tunnel figure, vitals screens).
- **0.2.0 — Stage 2:** drone + chase, hiding, ARIA learning (repeat hiding spot / repeat door), security cameras, HUD (heartbeat, battery, proximity pulse).
- **0.1.0 — Stage 1:** environment + movement. All five levels modelled (office wing, research wing + break room, basement tunnels, server room, ground floor + exit), red emergency lighting with flicker, blood/bodies/props, WASD + mouse look + sprint + crouch, collision, stairs, hidden hatches, flashlight with tunnel battery.
- **Sound (Stage 5):** everything is synthesised live (no audio files). The context starts on the first click/key (browser rule), so the menu's ominous pad and distant clangs begin then. Layers: server hum that swells toward Floor 3's core, electrical buzz, vent clicks, and in the tunnels drips, pipe groans, skittering you never see, loud breathing and a flashlight buzz on low battery. The drone is a 3D-positioned source (wheel noise + sonar ping, higher and faster in a chase, a rising sweep when it spots you), with a muffled version through floors. Footsteps (wet in the tunnels, near-silent crouched), heartbeat that follows threat, door-lock clunk, camera clicks, locker creaks. The death scene and credits fade ambience to silence. `Sound` listens to `GameState` events, so `dialogue.js`'s old fallback stays silent.
- **ARIA's voice:** every ARIA line in `CONFIG.DIALOGUE` is read aloud with the browser's text-to-speech (`CONFIG.VOICE`: pitch 0.55, rate 0.8, preferred voices Zira / Hazel / Samantha / Google UK English Female). Each line starts with the intercom static, then she speaks over a faint intercom hiss with crackle and a short reverb tail when she stops. The subtitle follows her word by word and stays until she finishes (+1.1 s). Her cut-off line in Ending B is broken off inside its last word. Pausing pauses her voice; skipping a scene silences her. Browsers do not let page code route TTS through Web Audio, so true reverb/filtering on the voice itself is impossible — the radio colour is layered underneath instead. Set `VOICE.ENABLED = false` for subtitles only. Voice quality depends on the voices installed on the player's system.
