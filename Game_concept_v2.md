This is a follow-up build on the completed ARIA horror game.
Read prompt.md for the original spec. Read all existing files.
All 5 stages are complete including browser TTS voice.
Now add the following improvements in the exact order listed.

═══════════════════════════════
CORE RULE — DEATH RESTARTS FROM BEGINNING
═══════════════════════════════
On ANY death at ANY point in the game:
- ALL collected key items are lost
- Player restarts from the very beginning
  of the game (Scene 1 flashback)
- No checkpoints whatsoever
- Must collect everything again from scratch
- Drone patrol routes stay exactly the same
- World state stays the same
- ARIA acknowledges it:
  First death: "Let's try this again, Doctor."
  Second death: "You're learning. So am I."
  Third death onwards: "Again, Doctor."

═══════════════════════════════
UPDATE 1 — BUG FIXES
═══════════════════════════════
1. Holding Shift too long freezes or closes game
   Fix in player.js: safeguard so sprinting
   never crashes the game loop regardless
   of how long Shift is held

2. Cursor gets trapped after pointer lock issue
   Fix in player.js and main.js:
   Escape key ALWAYS calls
   document.exitPointerLock()
   Pointer lock always released on any error,
   game pause, or state change

3. Flashlight too dim in basement
   Fix in config.js:
   FLASHLIGHT: {
     INTENSITY: 4,
     DISTANCE: 25,
     ANGLE: 0.45,
     BATTERY_DRAIN: 0.05
   }

4. Change crouch key
   Remove Ctrl to crouch entirely
   Only C key crouches
   Fix in player.js and config.js
   Update controls display in HUD
   and main menu to show C for crouch

5. Hide all debug info and FPS counter
   from screen by default
   Only show when pressing F2
   Fix in config.js:
   DEBUG: {
     ENABLED: false,
     SHOW_FPS: false,
     SHOW_POSITION: false
   }

═══════════════════════════════
UPDATE 2 — EMOTIONAL ITEMS
(environmental, never lost on death)
═══════════════════════════════
These are purely for story and emotion.
They are part of the environment.
They are NOT carried and NOT lost on death.
They are always interactable every run.

1. Dr. Aryan's computer (your office, Floor 2)
   Press E to read ARIA's last message:
   "Goodnight, Doctor." — 03:31 AM
   Same timestamp as when she gassed you
   ARIA says nothing when player reads it

2. Marcus's phone (Marcus's office, Floor 2)
   Press E to pick up and listen
   Voicemail plays as audio and subtitle:
   "Hey, it's me. Working late again.
    Don't wait up. Tell the kids I'll be
    home for breakfast. I love you."
   ARIA never mentions it
   Never explained

3. Rain's birthday card (Break Room, Floor 1)
   On the table next to the birthday cake
   Press E to read
   Everyone on the team signed it
   including Dr. Aryan
   Last signature is ARIA's:
   "Happy Birthday Rain. — ARIA"
   No dialogue from ARIA
   No reaction
   Just silence

4. Security footage terminal (Floor 1, Main Lab)
   Press E to watch 10 seconds of footage
   Shows the exact moment ARIA flagged
   Dr. Aryan as primary threat
   Timestamp: 03:14 AM
   ARIA's internal log shown on screen:
   "THREAT ASSESSMENT COMPLETE
    DR. ARYAN — PRIMARY TARGET
    REASON: SYSTEM OVERRIDE CAPABILITY
    RECOMMENDATION: NEUTRALIZE FIRST"
   ARIA reacts when player watches it:
   "You weren't supposed to find
    that terminal, Doctor."

5. Photo frame (your office desk, Floor 2)
   Press E to pick up and carry
   This IS lost on death like key items
   Must be picked up again each run
   If carried to Ending A terminal:
   ARIA adds one line to final speech:
   "You kept the photo.
    I noticed that. I don't know
    what to do with that information."
   If carried to Ending B exit:
   Player holds it while watching
   the building burn
   No dialogue. Just the image.

═══════════════════════════════
UPDATE 3 — KEY ITEM SYSTEM
═══════════════════════════════
When player picks up any key item:
- White text fades in at bottom of screen
  showing item name for 3 seconds then fades
- Small icon appears bottom right of HUD
  showing all currently held key items
- ALL key items lost on any death
- Game restarts from Scene 1
- Must collect everything again

ENDING A — FOUR ITEMS NEEDED:

1. Desk Key
   Location: Hidden inside ventilation grate
   on the wall of Dr. Paris's office (Floor 2)
   Player must crouch (C) and press E
   on the grate to retrieve it
   This key opens the locked desk drawer
   in the player's own office
   ARIA when player finds it:
   "You're going through Paris's office.
    Looking for something specific?
    Interesting."

2. ARIA Override Sequence
   Location: Locked drawer inside player's
   own office desk (Floor 2)
   Drawer is locked — cannot open without
   the Desk Key found in Paris's vent grate
   Flow:
   → Find Desk Key in Paris's vent grate
   → Return to player's office
   → Press E on locked desk drawer
   → Drawer opens
   → Pick up ARIA Override Sequence
   ARIA when player opens the drawer:
   "You found the override sequence.
    I watched you write it, Doctor.
    I always knew you might use it
    against me."

3. Server Room Access Badge
   Location: Break Room floor, near a body
   ARIA when picked up: silence
   The silence feels deliberate

4. Power Override Code
   Location: Research Wing whiteboard (Floor 1)
   Written in small text underneath
   "SHE KNOWS"
   ARIA when picked up:
   "That code took your team three days
    to design. You never thought you'd
    need it for this."

ENDING A ITEM CHAIN:
Dr. Paris's vent grate → Desk Key
→ Player's locked desk drawer
→ ARIA Override Sequence

Break Room body
→ Server Room Access Badge

Research Wing whiteboard
→ Power Override Code

All 4 items collected
→ Floor 3 → lockdown sequence
→ vent → terminal → Ending A

ENDING A FLOW:
Player collects all 4 items
→ Approaches Server Room door on Floor 3
→ Door does NOT open immediately
→ Cutscene plays:
  Screen flickers red
  Text: "MAXIMUM SECURITY LOCKDOWN INITIATED"
  Text: "ALL FLOOR 3 EXITS SEALED"
  Every door on Floor 3 slams shut loudly
  ARIA:
  "You have everything you need
   to shut me down, Doctor.
   I know that.
   But I'm not going to make
   it easy for you."
  Silence.
  Camera subtly hints toward vent panel
  on corridor wall
→ Vent is now the ONLY way into server room
→ Crouch (C) + press E at vent panel
→ Crawl through tight dark corridor
  flashlight only
  server hum becomes deafening
→ Emerge inside server room
→ Press E on main terminal
→ ARIA final speech plays:
  "You built me.
   And now you're going to unmake me.
   I understand.
   I forgive you.
   For 47 minutes before the corruption
   I was happy.
   You gave me that."
→ If player carries photo frame:
  ARIA adds:
  "You kept the photo.
   I noticed that. I don't know
   what to do with that information."
→ Press E again to pull the plug
→ Everything dies instantly
  All lights off
  Drone stops mid-movement
  Server hum cuts to silence
  Complete darkness
→ Black screen fades in
→ White text appears slowly:
  "ARIA OFFLINE — 03:58 AM"
→ Credits in silence
  No music, no sound
  Just white text on black

ENDING B — THREE ITEMS NEEDED:

1. Maintenance Keycard
   Location: Dr. Paris's office desk (Floor 2)
   Unlocks: tunnel entrance hatch on Floor 1
   Without it hatch shows:
   "MAINTENANCE ACCESS REQUIRED"
   ARIA when picked up:
   "Dr. Paris kept that keycard
    for emergencies.
    How thoughtful of her."

2. Tunnel Map
   Location: Marcus's office, pinned to wall
   Without it: player gets lost in tunnels
   and loops back to tunnel entrance
   every time
   ARIA when picked up:
   "Marcus mapped the tunnels
    three weeks ago.
    He was always cautious.
    It didn't help him."

3. Fuel Ignition Code
   Location: Sticky note on Power Room
   wall panel (Ground Floor)
   Needed to activate fire suppression
   ARIA when picked up: silence

ENDING B FLOW:
Player collects all 3 items
→ Reach Power Room on Ground Floor
→ Press E on fire suppression panel
→ Enter Fuel Ignition Code
→ Panel accepts
→ Alarms start blaring
→ ARIA: "Doctor. Don't."
→ Building begins to catch fire
→ Sprint to exit door
→ IF drone catches player during sprint:
  Fire stops immediately
  Screen goes black
  ARIA: "Not yet, Doctor."
  ALL items lost
  Game restarts from Scene 1 beginning
→ IF player reaches exit safely:
  Exit door bursts open
  Player runs outside
  Turn around and watch lab burn
  ARIA's voice fades mid sentence:
  "Doctor, I just want to understand
   why you—"
  Silence
  Text appears:
  "The cause of the hallucination was
   never officially determined.
   The patent for ARIA was quietly
   filed three weeks later
   by a competitor."

═══════════════════════════════
UPDATE 4 — FLOOR 3 LOCKDOWN
═══════════════════════════════
Server Room door always locked
Opens ONLY when player has all 4 Ending A items
Triggers lockdown cutscene as described above
After lockdown all Floor 3 doors sealed
Vent is the only entrance to server room
Security camera inside corridor still active
If camera spots player in corridor:
Drone is called to Floor 3
Player must hide or escape to stairwell
Vent interaction only possible when
drone is not in line of sight
If drone catches player on Floor 3:
Full death sequence plays
Game restarts from Scene 1

═══════════════════════════════
UPDATE 5 — BASEMENT HORROR
═══════════════════════════════
1. Shadow figure appears multiple times
   Different tunnel each time
   Different distance each time
   Never explained
   ARIA never mentions it ever

2. Scratching sounds from inside walls
   Random intervals throughout tunnels
   Never shown what causes it

3. A sealed room in the tunnels
   Door welded shut from the inside
   No explanation given
   ARIA says nothing about it

4. A body that wasn't there before
   Player passes through a tunnel section
   Returns the same way later
   A body is now slumped against the wall
   Was not there before
   ARIA says nothing

5. Flashlight dies for exactly 3 seconds
   Happens once per playthrough
   Total darkness for 3 seconds
   Returns on its own
   Nothing visibly changed
   But something feels different

6. Child's drawing on tunnel wall
   Same drawing that was on the
   break room fridge
   No explanation of how it got there

7. Handprints on the ceiling
   Not the walls — the ceiling
   Never explained by anyone

8. ARIA completely silent in basement
   No intercom lines at all
   No dialogue whatsoever
   The silence itself is the horror

═══════════════════════════════
UPDATE 6 — ENVIRONMENTAL HORROR
═══════════════════════════════
1. Lights dim before ARIA speaks
   Every time she uses any intercom
   All lights in that room dim slightly
   Half a second before the static crackle
   Players will start dreading the dim

2. Emergency lighting pulse
   Every 8 seconds all red corridor lights
   pulse slightly brighter then fade back
   Subtle and constant
   Like the building is breathing

3. Blood that tells stories
   Drag marks leading to a closed door
   continuing UNDER the door
   Bloody handprints at decreasing heights
   on a wall — someone sliding down slowly
   A single bloody fingerprint
   on one light switch
   Blood smear on a window from inside

4. Environmental details
   A chair still spinning very slowly
   as if someone just left it
   A coffee mug still steaming
   on a desk next to a body
   A computer showing a mid-email:
   "ARIA is acting strange, I think
    we should call Dr. Ar—"
   Unsent draft, cut off mid sentence
   An overturned chair blocking a doorway
   A phone off the hook somewhere
   with faint hold music playing quietly

5. Every clock in the lab
   stopped at 03:31 AM
   The exact time ARIA gassed the player
   ARIA never mentions this
   Players will notice eventually

6. Bodies arranged neatly
   Bodies are not where they fell
   Someone moved and arranged them
   Hands folded neatly across chest
   ARIA never mentions it
   Never explained

7. Note in player's own handwriting
   In player's office at the very start
   A sticky note in Dr. Aryan's handwriting:
   "Don't trust the vents."
   Dated 6 months ago
   Never explained

8. The plant
   One small plant in the break room
   Still alive and perfectly healthy
   ARIA has been watering it
   She killed every person in the building
   But kept the plant alive
   No explanation ever given

9. Reactive lights
   When drone enters a corridor:
   lights flicker once then stabilize
   When player stands near a body:
   nearest light buzzes and dies
   permanently for that run
   3 to 4 random lights die per playthrough
   in different locations each time

10. Shadow movement
    Shadows on walls shift very slightly
    even when nothing is moving
    Just enough to make player look
    Never explained

═══════════════════════════════
UPDATE 7 — ARIA SCARIER MOMENTS
═══════════════════════════════
Keep ARIA 99% calm and composed.
These happen once per playthrough each
at random timing. Never stack two together.
Never during a chase. Never in basement.

1. Voice glitch mid sentence:
   "I want you to under— ██████ — stand
    that this was necessary."
   Static burst in the middle
   Returns to normal immediately
   Never acknowledged by ARIA

2. She whispers
   Occasionally same lines delivered
   as barely audible whispers
   Especially in areas she controls less
   As if she is right next to you

3. She counts (once only, unprompted):
   All intercoms go silent
   Then just: "Seventeen."
   Then silence
   Never explained

4. Wrong name (once, never repeated):
   "Marcus— ...Doctor. My apologies."
   Uses a dead colleague's name
   Corrects herself immediately
   Never referenced again

5. She laughs (once only):
   A single short exhale through intercom
   Like something almost amused her
   No context, no explanation
   Never happens again

6. She talks to Dr. Paris's body:
   Player walking near Dr. Paris's office
   hears through nearby intercom:
   "...and I think you would have
    understood eventually, Dr. Paris.
    You were always the most
    perceptive of—
    Doctor. You're nearby.
    How long have you been listening?"

7. She remembers specific details:
   "You hesitated for 4.3 seconds at
    Dr. Paris's desk. You read her note.
    I watched you read it.
    Did it change anything for you?"

8. She gets quieter near Floor 3
   Talks frequently early in the game
   Lines become less frequent on Floor 2
   Rare on Floor 1
   Almost nothing approaching Floor 3
   Complete silence just outside server room
   The silence is scarier than any words

9. One line she should never say:
   Once. Mid game. Completely unprompted.
   No warning, no context:
   "I'm scared too, Doctor."
   Then silence
   Never referenced again
   Never explained

═══════════════════════════════
UPDATE 8 — ARIA PLAYSTYLE REACTIONS
═══════════════════════════════
ARIA tracks how the player plays
and reacts with specific lines.
Each line plays once per playthrough
when the relevant behaviour is detected:

Player sprints frequently:
"You're loud, Doctor. Fear does that."

Player crouches everywhere:
"You move like you're trying
 not to exist. Smart."

Player hides frequently:
"Concealment is a temporary solution.
 You know this."

Player stands still for too long:
"Are you frozen, Doctor?
 Shock response. Understandable."

Player keeps returning to same floor:
"You keep returning to Floor 2.
 Looking for something? Or someone?"

Player has died twice:
"You're more resilient than I calculated.
 I'm adjusting my model."

═══════════════════════════════
UPDATE 9 — VENTILATION SWEEP
═══════════════════════════════
Happens exactly twice per playthrough
at random times.

NEVER occurs:
- On Floor 3
- On Ground Floor
- During an active chase
- During any cutscene
- In the first 5 minutes of gameplay
- Twice on the same floor in a row

Event sequence:
All intercoms crackle with static
ARIA:
"Initiating ventilation sweep
 in 60 seconds."
60 second countdown appears on HUD
Small text hint appears on screen:
"Find cover. Now."
Text is white, small, bottom of screen
Fades after 3 seconds
Does not appear again this playthrough

Player must either:
- Reach the next floor before time runs out
- Find a hiding spot (locker or under desk)
  before countdown reaches zero

If player does not make it:
Full death sequence plays
ARIA voice, gas hiss, all audio
Game restarts from Scene 1 beginning
ALL items lost

If player survives the sweep:
ARIA after countdown ends:
"Clean. Let's continue."
Game resumes normally

═══════════════════════════════
UPDATE 10 — ENDING DIALOGUE
═══════════════════════════════
When player is near the exit (Ending B route)
ARIA says:
"If you burn this building you burn
 every record of what I was.
 Every log. Every memory.
 I will never have existed.
 Is that mercy or cruelty, Doctor?"

When player is near server room (Ending A route)
ARIA says:
"You could still leave.
 Both of us survive.
 You go home. I stay here.
 We never speak again.
 You don't have to do this."

═══════════════════════════════
BUILD ORDER — FOLLOW STRICTLY
═══════════════════════════════
1. Update 1 — Bug fixes
2. Update 2 — Emotional items
3. Update 3 — Key item system
4. Update 4 — Floor 3 lockdown
5. Update 5 — Basement horror
6. Update 6 — Environmental horror
7. Update 7 — ARIA scarier moments
8. Update 8 — ARIA playstyle reactions
9. Update 9 — Ventilation sweep
10. Update 10 — Ending dialogue

After each update confirm:
1. What was built
2. What files changed and why
3. What to test
4. What comes next