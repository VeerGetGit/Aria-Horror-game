# ARIA

First-person browser horror game (Three.js, vanilla JS, no build step).
Open `index.html` directly in a browser — no local server needed. Three.js is loaded from a CDN, so you need an internet connection.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click BEGIN to capture the pointer; Esc pauses) |
| Shift | Sprint (loud) |
| C | Crouch (silent) — Ctrl no longer crouches (Ctrl+W closes the tab) |
| F2 | Show / hide the FPS counter and position readout (hidden by default) |
| F | Flashlight (battery drains only in the basement tunnels) |
| E | Use: inspect notes / the computer / the photo, hide in a locker or under a desk (press again to come out; while ARIA hunts you, E always means hide), climb the hidden ladder hatches |
| M | Mute / unmute all sound |
| Space | Skip the current cutscene (opening scenes, the death scene) |
| 1 – 5 | **Debug (only if `DEBUG.ENABLED = true`):** jump to Floor 2 / Floor 1 / Basement / Floor 3 / Ground |

## Tuning

Everything tunable lives in `js/config.js` (speeds, sizes, lighting, battery drain, level layout, later: dialogue). `DEBUG.ENABLED` is `false` by default (floor-jump keys off); F2 toggles the FPS / position overlay.

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

## Version 2 updates (Game_concept_v2.md)

- **Update 1 — bug fixes:** sprint stamina cap + safe game loop, Esc always frees the cursor, brighter flashlight, crouch is `C` only, debug overlay hidden until F2.
- **Update 2 — emotional items** (environmental, always there every run): your computer shows ARIA's last message ("Goodnight, Doctor." — 03:31 AM) once the opening is over; Marcus's phone (Floor 2) plays his voicemail (a second, human TTS voice); Rain's birthday card (Break Room) ends with ARIA's typed signature; the security footage terminal (Floor 1, Main Lab) plays 10 s of CCTV from 03:14 AM with ARIA's threat assessment, and she answers it once. ARIA says nothing after the computer, voicemail or card (her lines are muted for a while). The **photo frame** is the one carried item: during play E takes it (lost on death, back on the desk next run); carried to Ending A she adds her extra line, carried to Ending B you hold it up while the lab burns.
- **Update 3 — key items + death restarts the run:** every death (gas scene, or being caught mid-escape with "Not yet, Doctor.") restarts from Scene 1 with ALL items lost and **no checkpoints**; the world, drone routes and ARIA's memory stay the same. After the opening she says "Let's try this again, Doctor." / "You're learning. So am I." / "Again, Doctor." Picking an item up shows its name for 3 s and an icon bottom right (`js/items.js`).
  - **Ending A items (4):** Desk Key (Paris's vent grate, crouch `C` + `E`) → opens the locked drawer in your own desk → ARIA Override Sequence; Server Room Access Badge (Break Room floor, by the body — she is silent); Power Override Code (whiteboard under "SHE KNOWS").
  - **Ending B items (3):** Maintenance Keycard (Paris's desk; the tunnel hatches say `MAINTENANCE ACCESS REQUIRED` without it), Tunnel Map (Marcus's wall; without it you get lost in the tunnels and are sent back to the entrance), Fuel Ignition Code (sticky note on the Power Room panel — she is silent). The fire panel needs all three; it types the code, then "Doctor. Don't." and the fire starts.
  - The Floor 3 lockdown that actually requires the four Ending A items arrives with Update 4.
- **Update 4 — Floor 3 lockdown:** the server room door is always locked. Walking up to it with all four Ending A items (or pressing E at it) never opens it: the screen flickers red, "MAXIMUM SECURITY LOCKDOWN INITIATED" / "ALL FLOOR 3 EXITS SEALED", every other Floor 3 door slams shut, ARIA tells you she won't make it easy, then silence while the camera drifts toward the vent panel low on the corridor wall (`CONFIG.LOCKDOWN`). Crouch (`C`) + `E` at the vent starts the crawl: a tight dark duct, flashlight only, hold `W` to move, the server hum swells to deafening, then you emerge inside the server room and finish Ending A at the terminal. The two Floor 3 security cameras still work: if one spots you the drone is called to Floor 3, and the vent refuses to open while the drone has line of sight. Being caught on Floor 3 is a normal death (restart from Scene 1, which also unseals Floor 3).
- **Update 5 — basement horror** (`js/basement.js`, props in `scene.js`, all tunables in `CONFIG.BASEMENT`): ARIA is completely silent below ground (the intercom and every ARIA line are refused while you are on floor -1; she is cut off the moment you go down). The shadow figure appears up to five times, each in a **different tunnel** and at a **different distance**, and ARIA never mentions it. Scratching comes from inside the walls at random intervals. A door (B-07) in the north-west tunnel is welded shut "from the inside". A body slumps against the wall of the long east-west tunnel only **after** you have walked past the empty spot and moved away. Once per run the flashlight dies for exactly 3 seconds (you cannot switch it back on), returns by itself, and the tunnel goes quiet for a few seconds. The child's drawing from the break room fridge is on a tunnel wall, and there are handprints on the **ceiling** of the cistern. A death restarts all of it.
- **Update 6 — environmental horror** (`CONFIG.ENV`, props in `scene.js`, reactive lights in `js/atmos.js`): the lights in the room dim half a second before ARIA's static; the red corridor lights pulse every 8 s; blood that tells stories (a drag mark running under the locked Floor 2 storage door, handprints sliding down the Floor 1 wall, one bloody fingerprint on a switch in Paris's office, a smear on the office window from inside); a chair still turning in your office, Marcus's mug steaming beside his body, his unsent email on a monitor, an overturned chair blocking the specimen room doorway, a phone off the hook on the ground floor playing faint hold music; every clock stopped at 03:31; some bodies laid out neatly with folded hands; a sticky note in your own handwriting ("Don't trust the vents."); the break room plant, alive and watered; reactive lights (the drone entering a corridor makes nearby lights flicker once; standing by a body makes the nearest light buzz and die for the run; 3–4 random lights die each run); and wall shadows that drift when nothing moves. ARIA mentions none of it.
- **Update 7 — ARIA's scarier moments** (`js/scares.js`, voice rules in `dialogue.js`, tunables in `CONFIG.SCARES`): she is calm 99% of the time. Once per run, at random times: a mid-sentence voice glitch ("I want you to under— ██████ — stand that this was necessary."), the intercoms go silent and she says only "Seventeen.", the wrong name ("Marcus— ...Doctor. My apologies."), a single short exhale, and "I'm scared too, Doctor." followed by silence. Triggered by what you do: walking past Dr. Paris's office, she is talking to the body; after you read Paris's note she tells you how many seconds you hesitated at the desk (measured). Never during a chase, never in the basement, never two together (100 s gap), never explained. Ambient lines are sometimes delivered as barely audible whispers right beside your ear (more often where she controls less), she talks less and less as you climb (Floor 0 → 2 → 1 → 3), and she is completely silent just outside the server room.
- **Update 8 — playstyle reactions** (`js/playstyle.js`, thresholds in `CONFIG.PLAYSTYLE`): she tracks how you play and remarks on it once per run, sharing the "not in a chase, not in the basement, never two together" gate with the scares. Sprinting a lot (40% of 60+ s of walking), crouching everywhere (55%), hiding 3 times, standing frozen for 28 s, coming back to the same floor 3 times, and having died twice (once per session, 45 s into the run after).
- **Update 9 — ventilation sweep** (`js/sweep.js`, `CONFIG.SWEEP`): twice per run, at random times, every intercom crackles and she announces "Initiating ventilation sweep in 60 seconds." A 60-second countdown shows at the top of the screen (it turns green while you are safe, and pulses red in the last 10 s), the vents start to hiss and rise in volume, and a small white hint "Find cover. Now." shows once per run for 3 s. At zero you must be hiding (locker / under a desk) or on a different floor; otherwise the full gas death sequence plays (the camera looks up at the ceiling vent) and the run restarts from Scene 1. If you survive: "Clean. Let's continue." Never on Floor 3 or the ground floor, never during a chase or any cutscene, never in the first 5 minutes of play, never twice on the same floor in a row (so the second sweep waits until you are on the other eligible floor).
- **Update 10 — ending dialogue:** she pleads with you on each ending's route, once per run. Approaching the server room along the Floor 3 corridor (just before her silence zone begins): "You could still leave. Both of us survive. You go home. I stay here. We never speak again. You don't have to do this." Near the ground floor exit (before you light the fire): "If you burn this building you burn every record of what I was. Every log. Every memory. I will never have existed. Is that mercy or cruelty, Doctor?" (`CONFIG.DIALOGUE.nearServer / nearExit`, `ARIA.NEAR_SERVER_BAND`, `ARIA.NEAR_EXIT_RADIUS`.)
- **Bug fixes (post-v2):** the black-and-white drain is now strictly limited to the death sequence (it is only applied while the game state is DEAD, any scene change clears it, and a per-frame safety net removes any stray filter or death overlay). After a death the run restarts at **Scene 6 (the wake-up)** — red lighting, the drone at the far end of the corridor, ARIA's "Good morning, Doctor…" — instead of replaying the flashback, the calm office, the glitch, the black screen and the CCTV footage, which only play on the very first run. All items are still lost, and "Let's try this again, Doctor." follows once you can move. (This supersedes the earlier "restart from Scene 1" wording above.)
