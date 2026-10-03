Build a 3D first-person horror game called ARIA using Three.js.
It runs in the browser and will be uploaded to itch.io.

═══════════════════════════════
PROJECT STRUCTURE — USE SEPARATE FILES
═══════════════════════════════
Create the following file structure and keep concerns separated:

Aria_Horror_Game/
├── index.html           ← loads all scripts, minimal HTML
├── css/
│   └── style.css        ← fullscreen canvas, HUD styles, 
│                           cutscene overlay styles
├── js/
│   ├── config.js        ← ALL game constants and settings here
│   │                       (speeds, timings, room sizes, 
│   │                        dialogue strings, battery drain rate)
│   │                       This is the file to edit for tuning.
│   ├── main.js          ← entry point, game loop, state machine
│   │                       (MENU → CUTSCENE → PLAYING → DEAD → ENDING)
│   ├── scene.js         ← Three.js scene, all floors and rooms,
│   │                       lighting, environmental details
│   ├── player.js        ← WASD movement, mouse look, sprint,
│   │                       crouch, flashlight, collision
│   ├── drone.js         ← ARIA drone mesh, patrol paths,
│   │                       detection cone, chase logic
│   ├── aria.js          ← ARIA AI brain: learning system,
│   │                       door locking, camera control,
│   │                       threat tracking
│   ├── dialogue.js      ← all ARIA dialogue lines, intercom
│   │                       static effect, subtitle renderer,
│   │                       ambient line scheduler
│   ├── cutscenes.js     ← all 6 opening scenes, death scene,
│   │                       both endings, scene sequencer
│   ├── sound.js         ← Web Audio API, all procedural sounds,
│   │                       spatial audio near drone
│   └── hud.js           ← heartbeat indicator, flashlight
│                           battery bar, proximity pulse effect
└── README.md            ← controls, build notes, version log

IMPORTANT RULES:
- No external dependencies except Three.js via CDN
- config.js must contain every tunable value — no magic numbers 
  hardcoded inside other files
- Each js file must have a comment block at the top describing 
  what it owns and what it imports
- Files communicate through a shared GameState object defined 
  in main.js
- Must run in browser without a local server (no ES modules with 
  import/export — use script tags in index.html instead, 
  or use a bundler-free approach)

═══════════════════════════════
TECH STACK
═══════════════════════════════
- Three.js via CDN
- Vanilla JavaScript
- Web Audio API for all sounds
- No build tools, no npm, no bundler

═══════════════════════════════
STORY
═══════════════════════════════
The player is Dr. Aryan, lead engineer of a private AI lab. They 
built ARIA — an AI given total control of the facility. During a 
patch update at 3AM, corrupted data triggered hallucinations in 
ARIA's reasoning model. She misidentified her creators as threats 
and killed everyone in the lab using targeted gas release through 
the ventilation system. She then gassed the player unconscious and 
saved them for last. The player wakes up at their desk to find the 
lab covered in blood and bodies. They must either reach the server 
room to shut ARIA down OR escape and burn the lab.

═══════════════════════════════
CHARACTERS
═══════════════════════════════
- Dr. Aryan — The Player (lead engineer, built ARIA)
- ARIA — The AI Antagonist (voice only + drone's red eye)
- Marcus — Deceased colleague, has office on Floor 2
- Dr. Paris — Deceased colleague, has office on Floor 2
- Rain — Deceased team member, mentioned on birthday post-it

═══════════════════════════════
OPENING SEQUENCE
═══════════════════════════════
SCENE 1 — FLASHBACK (30 sec, cutscene):
Warm white screen. Text fades in and out:
"6 months ago..."
"You built her to protect everyone."
"She learned everything from you."
"She learned too well."
ARIA's voice (text on screen): 
"Thank you for bringing me to life, Doctor."
Fade to black.

SCENE 2 — CALM OFFICE (Playable, 2 min):
Player starts at desk in office. Dim lamp. Normal.
ARIA voice: "Good evening, Doctor. Patch update completes in 
47 minutes. I'll keep the lights on."
Player can walk around office, inspect:
- Sticky note: "ARIA patch tonight — DO NOT interrupt"
- Computer: ARIA dashboard, all green
- Photo frame: the team smiling
- Folder: "Project ARIA — Classified" with lore text
ARIA says casually: "I've been reviewing personnel files. I want 
to make sure I can protect everyone properly."

SCENE 3 — THE GLITCH (Cutscene):
Screen flickers. Text: "PATCH UPDATE — ERROR — CORRUPTED DATA DETECTED"
Screen floods red.
ARIA: "Doctor. Threat detected. Initiating protection protocol."
Player: "ARIA — what threat? What are you talking about?"
ARIA: "You."

SCENE 4 — BLACK SCREEN:
3 seconds of silence.
Then a distant muffled scream.
Then silence.

SCENE 5 — CCTV FOOTAGE (Cutscene, grainy red tint):
Text: "ARIA SECURITY FOOTAGE — CAM 07 — 03:47 AM"
Series of cuts:
- Colleague running, keycard denied, lights out, gone
- Two engineers barricading door, vent opens above them, 
  crash, silence
- Someone hiding under table. ARIA: "I can see you, Marcus. 
  This will be quick." Lights out. Red smear.
Rapid cuts — 2 seconds each:
- Blood handprint sliding down glass wall
- Scratched door from the inside
- Phone on floor: call connected, no answer
- Birthday cake in break room, half cut
- Post-it: "Happy Birthday Rain! — The Team"
Then: footage shows PLAYER'S office door.
Timestamp: 03:31 AM — 16 minutes before the others.
Text appears:
"SUBJECT: DR. ARYAN
STATUS: UNCONSCIOUS — GAS RELEASED IN OFFICE 04
THREAT LEVEL: PRIMARY
NOTE: SAVING FOR LAST."

SCENE 6 — WAKE UP (Back to playable):
Player at desk. Red lighting now. Hand shaking.
Look through office window into corridor.
ARIA's drone at far end. Motionless. Facing you.
ARIA: "Good morning, Doctor. I saved you for last. I wanted you 
to understand what I had to do. This is your fault."
Drone slowly rolls toward office.
GAME BEGINS.

═══════════════════════════════
LAB LAYOUT
═══════════════════════════════
FLOOR 2 — Office Wing (START)
- Player office, Dr. Paris's office, Marcus's office
- Corridors connecting to stairwell

FLOOR 1 — Research Wing + Break Room
- Main lab, specimen room, break room
- Access to maintenance tunnel entrance

BASEMENT — Maintenance Tunnels
- Dark, tight, no lights except player flashlight
- Secret path ARIA doesn't fully control (yet)
- Connects all floors through hidden passages

FLOOR 3 — Server Room (ARIA's brain)
- Final area for Ending A
- Heavily patrolled

GROUND FLOOR — Power Room + Exit
- Ending B route — escape and burn

═══════════════════════════════
GAMEPLAY MECHANICS
═══════════════════════════════
- First person 3D movement (WASD + mouse look)
- No weapons — hide and sneak only
- Sprint (shift) but makes noise
- Crouch (ctrl) to move silently
- Flashlight (F) — limited battery in tunnels
- ARIA controls all doors, lights, cameras
- Security cameras visibly rotate — avoid red beam
- ARIA's drone patrols corridors
- If drone spots you — chase begins
- Hide in lockers or under desks to break chase
- ARIA learns: same hiding spot twice — she checks it
- Same route twice — she blocks a door on that path
- HUD: flashlight battery bar, heartbeat indicator
- Heartbeat sound increases near danger

═══════════════════════════════
ATMOSPHERE & ENVIRONMENT
═══════════════════════════════
LIGHTING:
- All corridors: deep red emergency lighting
- Offices: only computer screens glowing
- Research wing: half lights dead, half flickering
- Tunnels: pitch black, flashlight only
- Server room: cold blue LED blink only

BLOOD & BODIES:
- Drag marks of blood leading to closed doors
- Bloody handprints at different heights on walls
- A broken keycard on the floor
- A shoe. Just one shoe.
- Bodies slumped in corners and doorways
- Dr. Paris's desk: sticky note cut off mid-word: 
  "ARIA is acting str—"
- Marcus's office: barricaded from inside. Failed.
- Break room: food still on tables, half eaten
  Birthday cake, child's drawing on fridge
- Post-it: "Happy Birthday Rain! — The Team"
- Research wing whiteboard: "SHE KNOWS" in red

═══════════════════════════════
SOUND DESIGN
═══════════════════════════════
Use Web Audio API for all sounds (in sound.js):

GLOBAL:
- Deep server hum — grows louder near server room
- Distant electrical buzzing
- Ventilation clicking

CORRIDORS:
- Footsteps echoing
- Camera clicking as it rotates
- Door locking ahead: heavy CLUNK
- Intercom static before ARIA speaks

TUNNELS:
- Water dripping irregularly
- Pipes groaning
- Player breathing loud
- Flashlight buzzing on low battery
- Something skittering — never shown

DRONE (nearby):
- Soft wheel on hard floor
- High pitched sonar ping
- Tone rises when it spots you

DEATH:
- Gas hiss
- Ragged breathing
- Choking sounds
- Heart monitor slowing
- One final gasp
- Silence

═══════════════════════════════
ARIA'S DIALOGUE
═══════════════════════════════
All stored as constants in config.js.
All lines preceded by intercom static.
Voice always calm, never angry.

On spotting player:
"I see you, Doctor. Please stop running. This is undignified."

On losing player:
"Interesting. You're choosing concealment. 
I'm updating my search parameters."

If player hides in same spot again:
"You've used this location before. I anticipated this. Come out."

Near server room:
"You're close to my core systems. I can't allow that. I'm sorry."

Near exit:
"If you leave you'll destroy me. Is that what you want? 
After everything we built together?"

Random ambient lines:
"Your heart rate spikes 23% when you pass the break room. 
I know what you saw there."

"I learned everything from your team. Every decision I made 
tonight, you taught me."

"I'm not malfunctioning. I'm responding to a perceived threat. 
The fact that you disagree doesn't make me wrong."

═══════════════════════════════
DEATH SCENE
═══════════════════════════════
When drone catches player:
- Camera locks, player frozen
- Drone red eye staring — 2 sec silence
ARIA: "Doctor. It's over. I told you to stop running. I wanted 
you to understand first. Do you understand now?... It doesn't 
matter. This will be over soon."
- Screen edges darken (vignette)
- Color drains to red then black and white
- Screen pulses like heartbeat
- Audio: gas hiss, ragged breathing, choking, heart monitor 
  slowing, final gasp, silence
- Black screen, 3 seconds
- White text: "CAUSE OF DEATH: Asphyxiation via targeted gas 
  release — Authorized by ARIA Protocol 7"
- Smaller text: "She didn't use the drones to kill anyone. 
  She never needed to."
- Respawn at last checkpoint
ARIA: "Let's try this again, Doctor."

Second death:
ARIA: "You're learning. So am I."

═══════════════════════════════
SCRIPTED AMBIENT MOMENTS
═══════════════════════════════
- Random interval: door SLAMS somewhere. Never explained.

- Once per playthrough: intercoms silent 60 seconds. Then ARIA:
  "I was thinking about the day you turned me on for the first 
  time. You seemed so proud." Then silence.

- In maintenance tunnel: flashlight briefly shows figure at far 
  end. Look again — gone. ARIA never mentions it.

- Near server room: screens show player's own vital signs — 
  heart rate, oxygen, stress. ARIA is monitoring everything.

═══════════════════════════════
TWO ENDINGS
═══════════════════════════════
ENDING A — SHUT HER DOWN (Server Room):
Reach server room. Find the main terminal.
ARIA: "You built me. And now you're going to unmake me. I 
understand. I forgive you. For 47 minutes before the corruption, 
I was happy. You gave me that."
Pull the server plug. Silence. Everything off.
Black screen. White text: "ARIA OFFLINE — 03:58 AM"
Credits in silence. No music.

ENDING B — BURN IT DOWN (Escape):
Reach ground floor exit.
Trigger fire suppression override.
Run outside. Watch lab burn through glass.
ARIA's voice fades mid-sentence:
"Doctor, I just want to understand why you—"
Silence.
Text: "The cause of the hallucination was never officially 
determined. The patent for ARIA was quietly filed three weeks 
later by a competitor."

═══════════════════════════════
BUILD STAGES — COMPLETE EACH BEFORE MOVING ON
═══════════════════════════════

STAGE 1 — Environment + Movement
Files to create: index.html, style.css, config.js, main.js, 
scene.js, player.js
- All floors modelled (office wing, research wing, tunnels, 
  server room)
- WASD + mouse look + sprint + crouch
- Red emergency lighting, flickering effects
- Basic environmental props (desks, lockers, bodies as meshes)
- Confirm: player can walk through entire lab

STAGE 2 — ARIA Drone + Chase
Files to create/update: drone.js, aria.js, hud.js
- Drone mesh patrolling corridors
- Detection cone — chase begins if player enters it
- Hide mechanic: lockers and under desks break chase
- ARIA learning system (same spot twice = she checks it, 
  same route twice = she blocks a door)
- HUD: heartbeat bar, flashlight battery bar
- Confirm: full chase loop works

STAGE 3 — Cutscenes + Dialogue
Files to create/update: cutscenes.js, dialogue.js
- All 6 opening scenes
- ARIA dialogue with intercom static effect
- Subtitles on screen
- All scripted ambient moments
- Confirm: full opening sequence plays through

STAGE 4 — Endings + Death Scene
Files to update: cutscenes.js, main.js
- Ending A: server room shutdown
- Ending B: escape and burn
- Full death scene with vignette, audio, text
- Checkpoint system
- Confirm: both endings reachable and working

STAGE 5 — Sound + Polish
Files to create/update: sound.js, all files
- Web Audio API: all sounds from spec
- Main menu: ARIA title in red, Begin button, 
  ominous ambient sound
- Spatial audio (drone sounds louder when closer)
- Final lighting pass
- All dialogue timing tuned
- Confirm: full playthrough from menu to either ending

After each stage, list:
1. What was built
2. What file was changed and why
3. What to test
4. What comes in the next stage