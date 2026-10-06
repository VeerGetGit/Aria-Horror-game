/* ============================================================================
 * config.js — ARIA : every tunable value lives here.
 *
 * OWNS:    CONFIG (global, read-only by convention): speeds, timings, room
 *          sizes, lab layout data, lighting, battery drain, dialogue strings.
 * IMPORTS: nothing (must be loaded first).
 *
 * Conventions:
 *   - Units are metres. +X = east, +Z = north, +Y = up.
 *   - Camera yaw 0 looks toward -Z (south).
 *   - Floor indices: -1 basement, 0 ground, 1, 2, 3.
 *   - Room "side" letters: n = +Z edge, s = -Z edge, e = +X edge, w = -X edge.
 *     A door/window "at" is the centre coordinate along that edge
 *     (x for n/s walls, z for e/w walls).
 * ========================================================================== */

// Stairwell half-extents. Walls sit just outside the walkable interior.
const SHAFT_X = 4;        // walkable interior: x in [-4, 4]
const SHAFT_Z = 6;        // walkable interior: z in [-6, 6]
const SX = SHAFT_X + 0.15; // wall centre-line, east/west of shaft
const SZ = SHAFT_Z + 0.15; // wall centre-line, north/south of shaft

const CONFIG = {
  VERSION: '0.5.0 (Stage 5 — Sound + Polish)',
  SEED: 1337,

  // ------------------------------------------------------------------ RENDER
  RENDER: {
    FOV: 75,
    NEAR: 0.05,
    FAR: 90,
    MAX_PIXEL_RATIO: 2,
    CLEAR_COLOR: 0x000000,
    ACTIVE_FLOOR_RANGE: 1       // floors rendered above/below the player's
  },

  // ------------------------------------------------------------------ BUILDING
  BUILDING: {
    FLOOR_H: 4,                 // floor-to-floor distance
    CEIL_H: 3.4,                // usable height; the rest is slab
    SLAB_T: 0.6,
    WALL_T: 0.3,
    DOOR_W: 1.4,
    DOOR_H: 2.3,
    DOOR_LEAF_T: 0.1,
    WINDOW_SILL: 0.9,
    WINDOW_TOP: 2.1,
    FOOTPRINT: { x1: -26, x2: 26, z1: -16, z2: 16 },
    FLOOR_MIN: -1,
    FLOOR_MAX: 3,
    TUNNEL_CEIL_H: 2.6,
    TUNNEL_CELL: 1,
    TEXTURE_TILE: 2.5           // metres per texture repeat
  },

  // ------------------------------------------------------------------ STAIRS
  STAIRS: {
    X: SHAFT_X,
    Z: SHAFT_Z,
    COL_X: 2,                   // flight centre offset from x = 0
    WIDTH: 3.5,
    STEPS: 20,
    DIVIDER_T: 0.4,
    TOLERANCE: 0.9              // max feet-to-ground height difference
  },

  // ------------------------------------------------------------------ PLAYER
  PLAYER: {
    RADIUS: 0.35,
    WALK_SPEED: 3.0,
    SPRINT_SPEED: 5.4,
    CROUCH_SPEED: 1.4,
    ACCEL: 12,
    EYE_STAND: 1.65,
    EYE_CROUCH: 1.05,
    EYE_LERP: 10,
    Y_LERP: 14,                 // smoothing of vertical movement on stairs
    MOUSE_SENS: 0.0022,
    PITCH_LIMIT: 1.45,
    MAX_DT: 0.05,
    BOB: { WALK: 0.035, SPRINT: 0.06, CROUCH: 0.015, FREQ: 1.9 },
    STEP_STRIDE: { WALK: 1.7, SPRINT: 1.3, CROUCH: 2.2 }, // metres per step event
    NOISE_RADIUS: { IDLE: 0, CROUCH: 1.5, WALK: 6, SPRINT: 14 },
    // Sprint safeguard: a held Shift can never run forever. After SPRINT_MAX_SECONDS the
    // player is winded (walks) until stamina climbs back to SPRINT_RESUME. Also keeps a single
    // unbroken Shift hold well under Windows' 8-second Filter Keys prompt.
    SPRINT_MAX_SECONDS: 5,
    SPRINT_RECOVER_SECONDS: 3.5,
    SPRINT_RESUME: 0.3,
    SPAWN: { floor: 2, x: -23, z: -1.4, yaw: 0, pitch: 0 },
    PASSAGE_USE_RADIUS: 1.6,
    KEYS: {
      FORWARD: ['KeyW', 'ArrowUp'],
      BACK: ['KeyS', 'ArrowDown'],
      LEFT: ['KeyA', 'ArrowLeft'],
      RIGHT: ['KeyD', 'ArrowRight'],
      SPRINT: ['ShiftLeft', 'ShiftRight'],
      CROUCH: ['KeyC'],                // C only (Ctrl+W closes the browser tab)
      FLASHLIGHT: ['KeyF'],
      USE: ['KeyE']
    }
  },

  // ------------------------------------------------------------------ FLASHLIGHT / BATTERY
  FLASHLIGHT: {
    COLOR: 0xfff1d6,
    INTENSITY: 4,
    DISTANCE: 25,
    ANGLE: 0.45,
    PENUMBRA: 0.45,
    DECAY: 1.4,
    START_ON_IN_TUNNELS: true,
    BATTERY_MAX: 100,
    BATTERY_DRAIN: 0.05,        // battery % lost per second, only in the basement tunnels
    BATTERY_LOW: 20,
    LOW_FLICKER_RATE: 22
  },

  // ------------------------------------------------------------------ LIGHTING
  LIGHTING: {
    POOL_SIZE: 8,               // real point lights, re-assigned to nearest fixtures
    REASSIGN_INTERVAL: 0.2,
    FADE_SPEED: 4,
    FIXTURE_DISTANCE_Y_WEIGHT: 3,
    EMERGENCY_COLOR: 0xff1c10,
    EMERGENCY_INTENSITY: 1.5,
    EMERGENCY_DISTANCE: 11,
    EMERGENCY_SPACING: 6,
    SCREEN_COLOR: 0x2fd6c0,
    SCREEN_INTENSITY: 1.1,
    SCREEN_DISTANCE: 5.5,
    LAMP_COLOR_RED: 0xff2a10,
    LAMP_COLOR_CALM: 0xffc680,
    LAMP_INTENSITY: 1.5,
    LAMP_DISTANCE: 7,
    PULSE_PERIOD: 8, PULSE_LEN: 1.8, PULSE_GAIN: 0.6,        // the red emergency lights breathe every 8 s (Update 6)
    DIM_AMOUNT: 0.55, DIM_RADIUS: 14, DIM_LEAD: 0.5,          // lights dim in the room half a second before she speaks
    FLICKER_ON_TIME: [0.4, 3.0],
    FLICKER_OFF_TIME: [0.04, 0.28],
    FLICKER_OFF_LEVEL: 0.06,
    LED_BLINK_RATES: [1.3, 2.1, 0.7, 3.4],
    LED_COLOR_ON: 0x3b8cff,
    LED_COLOR_OFF: 0x06101f,
    // per-floor ambient + fog
    AMBIENT: {
      '2':  { color: 0x3a0c08, intensity: 0.8, fog: 0x050101, density: 0.05 },
      '1':  { color: 0x3a2222, intensity: 0.75, fog: 0x040202, density: 0.05 },
      '0':  { color: 0x3a0e0a, intensity: 0.75, fog: 0x050101, density: 0.05 },
      '3':  { color: 0x0b1a33, intensity: 0.55, fog: 0x01040a, density: 0.045 },
      '-1': { color: 0x14141a, intensity: 0.2,  fog: 0x000000, density: 0.085 }
    }
  },

  // ------------------------------------------------------------------ THEMES (materials)
  THEMES: {
    office:   { wall: 0x6a625c, floor: 0x3a3430, ceil: 0x2c2a29 },
    research: { wall: 0x7c8284, floor: 0x474c4e, ceil: 0x35393a },
    server:   { wall: 0x2a3446, floor: 0x151a24, ceil: 0x10141c },
    ground:   { wall: 0x6e6862, floor: 0x3b3835, ceil: 0x2d2b2a },
    tunnel:   { wall: 0x8a8a82, floor: 0x5a5a52, ceil: 0x4a4a45 }
  },

  // ------------------------------------------------------------------ DECOR (random scatter, seeded)
  DECOR: {
    CORRIDOR_BODIES: 3,
    CORRIDOR_HANDPRINTS: 9,
    CORRIDOR_DRAG_MARKS: 2,
    DOOR_CLEARANCE: 2.2,        // keep scatter this far from doorways
    WALL_OFFSET: 0.7,
    HANDPRINT_HEIGHT: [0.5, 1.9],
    BLOOD_COLOR: 0x3d0606,
    BODY_COLORS: [0x4a4f5c, 0x5c4a4a, 0x3f5a52, 0x6a6a6e, 0x52405c]
  },

  // ------------------------------------------------------------------ DEBUG
  DEBUG: {
    ENABLED: false,             // true = debug floor-jump keys 1-5 work
    SHOW_FPS: false,            // start state of the FPS line (F2 toggles it in game)
    SHOW_POSITION: false,       // start state of the position/state readout (F2 toggles it)
    SKIP_OPENING: false,        // true = skip the 6 opening scenes and start playing at once,
    TELEPORT_KEYS: { Digit1: 2, Digit2: 1, Digit3: -1, Digit4: 3, Digit5: 0 }
  },

  // ------------------------------------------------------------------ LAYOUT
  // Per-floor level data. Rooms are axis-aligned rectangles; space inside the
  // shell that is not inside a room is corridor/hall.
  LAYOUT: {
    // ---- FLOOR 2 : OFFICE WING (start) — stair landing on the north side
    2: {
      name: 'Floor 2 — Office Wing',
      theme: 'office',
      landing: 'n',
      bounds: { x1: -26, x2: 26, z1: -SZ, z2: 16 },
      corridor: { x1: -26, x2: 26, z1: SZ, z2: 10, name: 'Office Corridor' },
      spawn: { x: 0, z: 8, yaw: Math.PI },
      lights: { corridor: true, rooms: null },
      rooms: [
        { id: 'office04', name: 'Office 04 — Dr. Aryan', type: 'office_player', x1: -26, x2: -18, z1: -SZ, z2: SZ,
          doors: [{ side: 'n', at: -23 }], windows: [{ side: 'n', at: -19.65, w: 1.6 }] },
        { id: 'paris', name: "Dr. Paris's Office", type: 'office_paris', x1: -18, x2: -10, z1: -SZ, z2: SZ,
          doors: [{ side: 'n', at: -14 }] },
        { id: 'marcus', name: "Marcus's Office", type: 'office_marcus', x1: -10, x2: -SX, z1: -SZ, z2: SZ,
          doors: [{ side: 'n', at: -7.1 }] },
        { id: 'meeting', name: 'Meeting Room', type: 'meeting', x1: SX, x2: 14, z1: -SZ, z2: SZ,
          doors: [{ side: 'n', at: 9 }] },
        { id: 'storage', name: 'Storage', type: 'storage', x1: 14, x2: 26, z1: -SZ, z2: SZ,
          doors: [{ side: 'n', at: 20, locked: true }] },   // a closed door with a drag mark running under it (Update 6)
        { id: 'workspace', name: 'Open Workspace', type: 'workspace', x1: -26, x2: -2, z1: 10, z2: 16,
          doors: [{ side: 's', at: -20 }, { side: 's', at: -8 }] },
        { id: 'conference', name: 'Conference Room', type: 'conference', x1: 2, x2: 16, z1: 10, z2: 16,
          doors: [{ side: 's', at: 9 }] },
        { id: 'restroom', name: 'Restroom', type: 'restroom', x1: 16, x2: 26, z1: 10, z2: 16,
          doors: [{ side: 's', at: 21 }] }
      ]
    },

    // ---- FLOOR 1 : RESEARCH WING + BREAK ROOM — landing on the south side
    1: {
      name: 'Floor 1 — Research Wing',
      theme: 'research',
      landing: 's',
      bounds: { x1: -26, x2: 26, z1: -16, z2: SZ },
      corridor: { x1: -26, x2: 26, z1: -10, z2: -SZ, name: 'Research Corridor' },
      spawn: { x: 0, z: -8, yaw: 0 },
      lights: { corridor: true, rooms: { color: 0xdfe8ff, intensity: 0.9, distance: 9, spacing: 6, deadChance: 0.5, flickerChance: 0.5 } },
      rooms: [
        { id: 'lab', name: 'Main Lab', type: 'lab', x1: -26, x2: -SX, z1: -SZ, z2: SZ,
          doors: [{ side: 's', at: -20, w: 1.6 }, { side: 's', at: -8, w: 1.6 }] },
        { id: 'specimen', name: 'Specimen Room', type: 'specimen', x1: SX, x2: 14, z1: -SZ, z2: SZ,
          doors: [{ side: 's', at: 9 }] },
        { id: 'break', name: 'Break Room', type: 'break', x1: 14, x2: 26, z1: -SZ, z2: SZ,
          doors: [{ side: 's', at: 20 }] },
        { id: 'chem', name: 'Chemical Storage', type: 'chem', x1: -26, x2: -12, z1: -16, z2: -10,
          doors: [{ side: 'n', at: -19 }] },
        { id: 'locker', name: 'Locker Room', type: 'locker', x1: -8, x2: 8, z1: -16, z2: -10,
          doors: [{ side: 'n', at: 0 }] },
        { id: 'maint', name: 'Maintenance Access', type: 'maint', x1: 14, x2: 26, z1: -16, z2: -10,
          doors: [{ side: 'n', at: 20 }] }
      ]
    },

    // ---- GROUND FLOOR : POWER ROOM + EXIT — landing on the north side
    0: {
      name: 'Ground Floor — Lobby',
      theme: 'ground',
      landing: 'n',
      bounds: { x1: -26, x2: 26, z1: -SZ, z2: 16 },
      corridor: { x1: -26, x2: 26, z1: SZ, z2: 16, name: 'Main Lobby' },
      spawn: { x: 0, z: 9, yaw: Math.PI },
      shellDoors: [{ side: 'e', at: 12, w: 2.4, exit: true, locked: true }],
      lights: { corridor: true, rooms: null },
      rooms: [
        { id: 'power', name: 'Power Room', type: 'power', x1: -26, x2: -SX, z1: -SZ, z2: SZ,
          doors: [{ side: 'n', at: -14, w: 1.8 }] },
        { id: 'security', name: 'Security Office', type: 'security', x1: SX, x2: 14, z1: -SZ, z2: SZ,
          doors: [{ side: 'n', at: 9 }] },
        { id: 'garage', name: 'Loading Bay', type: 'garage', x1: 14, x2: 26, z1: -SZ, z2: SZ,
          doors: [{ side: 'n', at: 20, w: 2.4 }] }
      ]
    },

    // ---- FLOOR 3 : SERVER ROOM — landing on the south side
    3: {
      name: 'Floor 3 — Server Level',
      theme: 'server',
      landing: 's',
      bounds: { x1: -26, x2: 26, z1: -16, z2: SZ },
      corridor: { x1: -26, x2: 26, z1: -10, z2: -SZ, name: 'Server Corridor' },
      spawn: { x: 0, z: -8, yaw: 0 },
      lights: { corridor: true, rooms: null },
      rooms: [
        { id: 'server', name: "Server Room — ARIA's Core", type: 'server', x1: -26, x2: -SX, z1: -SZ, z2: SZ,
          doors: [{ side: 's', at: -14, w: 2.2, locked: true }] },   // always locked: opens only through the lockdown vent
        { id: 'control', name: 'Control Room', type: 'control', x1: SX, x2: 26, z1: -SZ, z2: SZ,
          doors: [{ side: 's', at: 14 }] },
        { id: 'archive', name: 'Data Archive', type: 'archive', x1: -26, x2: -12, z1: -16, z2: -10,
          doors: [{ side: 'n', at: -19 }] },
        { id: 'cooling', name: 'Cooling Plant', type: 'cooling', x1: 12, x2: 26, z1: -16, z2: -10,
          doors: [{ side: 'n', at: 19 }] }
      ]
    },

    // ---- BASEMENT : MAINTENANCE TUNNELS (grid-carved, no rooms)
    '-1': {
      name: 'Basement — Maintenance Tunnels',
      theme: 'tunnel',
      landing: 's',
      spawn: { x: 0, z: -9, yaw: 0 },
      // Walkable rectangles (integer aligned). Walls are generated around their union.
      tunnels: [
        { x1: -4, x2: 4, z1: -6, z2: 6, shaft: true },
        { x1: -4, x2: 4, z1: -12, z2: -6, name: 'Stair Junction' },
        { x1: -24, x2: -4, z1: -12, z2: -9 },
        { x1: -24, x2: -21, z1: -12, z2: 12 },
        { x1: -24, x2: 24, z1: 9, z2: 12 },
        { x1: 21, x2: 24, z1: -12, z2: 12 },
        { x1: 4, x2: 24, z1: -12, z2: -9 },
        { x1: -14, x2: -11, z1: -9, z2: -1 },
        { x1: -19, x2: -6, z1: -1, z2: 6, name: 'Cistern' },
        { x1: 11, x2: 14, z1: -9, z2: -6 },
        { x1: 8, x2: 18, z1: -6, z2: 3, name: 'Pump Room' }
      ],
      name_default: 'Maintenance Tunnels'
    }
  },

  // Hidden passages between floors (basement ↔ upper floors). Press E.
  PASSAGES: [
    { id: 'hatch_power', a: { floor: -1, x: -22.5, z: 10.5 }, b: { floor: 0, x: -22, z: 4.5 }, label: 'Climb the ladder' },
    { id: 'hatch_maint', a: { floor: -1, x: 22.5, z: 10.5 }, b: { floor: 1, x: 22.5, z: -13 }, label: 'Climb the ladder' }
  ],

  // ------------------------------------------------------------------ DRONE (Stage 2)
  DRONE: {
    RADIUS: 0.35,               // collision/nav radius
    HEIGHT: 1.15,
    PATROL_SPEED: 1.7,
    INVESTIGATE_SPEED: 2.6,
    CHASE_SPEED: 4.4,           // player sprints at 5.4: outrunnable, but loud
    SEARCH_SPEED: 2.4,
    TURN_RATE: 3.2,             // rad/s while patrolling
    CHASE_TURN_RATE: 6.0,
    PATROL_PAUSE: 1.6,          // scan time at each waypoint
    SCAN_SWEEP: 0.7,            // radians the eye sweeps while pausing
    DETECT_RANGE: 15,
    DETECT_HALF_ANGLE: 0.62,    // radians (~35 degrees)
    CROUCH_RANGE_MULT: 0.6,     // crouching shrinks the effective cone
    PROXIMITY_SENSE: 2.4,       // spots you at this range with line of sight, any angle
    DETECT_TIME: 0.35,          // seconds inside the cone before the alarm
    LOSE_TIME: 2.2,             // seconds without line of sight before chase becomes search
    CATCH_DISTANCE: 1.0,
    SEARCH_LOOK_TIME: 2.5,
    SEARCH_MAX_TIME: 22,
    CHECK_SPOT_TIME: 1.2,       // pause in front of a hiding spot before opening it
    STAIR_FOLLOW_DELAY: 3.5,    // seconds before it reappears on the player's new floor
    RELOCATE_INTERVAL: 40,      // idle patrol drone drifts toward the player's floor
    RELOCATE_MIN_DIST: 18,
    NAV_CELL: 0.4,
    NAV_MAX_EXPANSIONS: 9000,
    REPATH_INTERVAL: 0.35,
    HEARING_THROUGH_WALLS: 0.6, // fraction of the player's noise radius that passes walls
    EYE_COLOR: 0xff1a1a,
    EYE_LIGHT_INTENSITY: 1.1,
    EYE_LIGHT_DISTANCE: 12,
    BEAM_ANGLE: 0.5,
    BODY_COLOR: 0x2b2d31,
    START: { floor: 2, x: 22, z: 8.2, yaw: 1.5708 },   // far end of the office corridor, facing west
    PATROLS: {
      '2': { speedMult: 1.0, points: [[-24, 8], [-14, 8], [-2, 8], [9, 8], [24, 8], [9, 8], [-2, 8], [-14, 8]] },
      '1': { speedMult: 1.0, points: [[-24, -8], [-8, -8], [-8, -2], [-8, -8], [0, -8], [9, -8], [9, -2], [9, -8], [20, -8], [20, -2], [20, -8], [0, -8]] },
      '0': { speedMult: 1.0, points: [[-24, 9], [-14, 9], [-14, 2], [-14, 9], [9, 9], [9, 2], [9, 9], [24, 9], [24, 14], [-24, 14]] },
      '3': { speedMult: 1.25, points: [[-24, -8], [-14, -8], [-14, 0], [-14, -8], [0, -8], [14, -8], [14, 0], [14, -8], [24, -8], [14, -8], [0, -8]] }
    }
  },

  // ------------------------------------------------------------------ ARIA BRAIN (Stage 2)
  ARIA: {
    ROUTE_REPEAT_COUNT: 2,      // same door crossed this many times -> she locks it
    DOOR_COUNT_COOLDOWN: 12,    // seconds before the same door counts again
    DOOR_LOCK_MIN_DIST: 7,      // only locks when the player is at least this far away
    DOOR_LOCK_DURATION: 40,
    DOOR_LOCK_MAX_ACTIVE: 2,
    HIDE_REPEAT_COUNT: 1,       // previous uses of a spot before she checks it
    SAY_COOLDOWN: 9,            // minimum seconds between any two spoken lines
    LINE_COOLDOWN: 25,          // minimum seconds before the same line repeats
    CAMERA_ALERT_COOLDOWN: 8,
    NEAR_SERVER_RADIUS: 6,
    NEAR_EXIT_RADIUS: 9,
    THREAT_SMOOTH: 2.5
  },

  CAMERAS: {
    RANGE: 11,
    HALF_ANGLE: 0.32,
    SWEEP: 0.85,                // radians either side of the base direction
    SPEED: 0.55,
    HEIGHT_BELOW_CEILING: 0.35,
    BEAM_COLOR: 0xff2020,
    BEAM_OPACITY: 0.13,
    // floor, x, z, baseYaw (0 = facing -Z/south; PI = north; -PI/2 = east; PI/2 = west)
    LIST: [
      { floor: 2, x: 25.2, z: 8.0, yaw: 1.5708 },
      { floor: 2, x: -25.2, z: 8.0, yaw: -1.5708 },
      { floor: 1, x: 25.2, z: -8.0, yaw: 1.5708 },
      { floor: 1, x: -25.2, z: -8.0, yaw: -1.5708 },
      { floor: 0, x: -25.2, z: 12.0, yaw: -1.5708 },
      { floor: 0, x: 25.2, z: 8.0, yaw: 1.5708 },
      { floor: 3, x: -25.2, z: -8.0, yaw: -1.5708 },
      { floor: 3, x: 25.2, z: -8.0, yaw: 1.5708 }
    ]
  },

  // ------------------------------------------------------------------ HIDING (Stage 2)
  HIDE: {
    USE_DISTANCE: 0.7,          // max gap between player and the locker/desk edge
    EYE_LOCKER: 1.55,
    EYE_DESK: 0.5,
    YAW_LIMIT: 1.0,
    PITCH_LIMIT: 0.45,
    EXIT_OFFSET: 0.75,
    ENTER_COOLDOWN: 0.6
  },

  // ------------------------------------------------------------------ HUD (Stage 2)
  HUD: {
    BPM_MIN: 64,
    BPM_MAX: 168,
    BPM_SMOOTH: 1.5,
    ECG_W: 200,
    ECG_H: 46,
    PULSE_START_THREAT: 0.25,
    SUBTITLE_TIME: 4.5,
    SUBTITLE_MIN: 2.2,
    SUBTITLE_PER_CHAR: 0.055
  },

  // ------------------------------------------------------------------ DEATH SCENE + CHECKPOINTS (Stage 4)
  DEATH: {
    ARIA_AT: 2.0,                 // after 2 s of silence while the red eye stares
    ARIA_DUR: 14.5,
    LOOK_RATE: 3.0,               // how fast the locked camera turns to the drone
    VIGNETTE_START: 3.0, VIGNETTE_FULL: 11.0,
    TINT_START: 4.0, TINT_PEAK: 9.0, GRAY_END: 14.0,   // colour drains to red, then black and white
    TINT_MAX: 0.55,
    PULSE_BPM: [110, 28],         // the screen pulses like a heartbeat, slowing down
    PULSE_FROM: 6.0, PULSE_TO: 17.0,
    HISS_AT: 4.0,
    BREATHS: [6.0, 7.4, 8.6, 9.6, 10.6, 11.8, 13.3],
    CHOKES: [9.2, 10.8, 12.4],
    BEEP_START: 7.5, BEEP_INTERVAL: [0.5, 1.9], BEEP_END: 15.0,
    GASP_AT: 15.5, FLAT_AT: 15.6,
    BLACK_AT: 17.6,               // then 3 s of black
    TEXT_AT: 20.6, TEXT2_AT: 23.0, TEXT_OUT: 27.4,
    TOTAL: 29.0,
    TEXT1: 'CAUSE OF DEATH: Asphyxiation via targeted gas release — Authorized by ARIA Protocol 7',
    TEXT2: "She didn't use the drones to kill anyone. She never needed to."
  },

  // (No checkpoints: any death restarts the run from Scene 1. See main.js restartRun.)

  // ------------------------------------------------------------------ ENDINGS (Stage 4)
  ENDINGS: {
    A: {
      TERMINAL_SPEECH: 17,        // ARIA's last words at the main terminal
      UNPLUG: 8,                  // pull the plug, everything dies
      CARD: 'ARIA OFFLINE — 03:58 AM',
      CARD_DURATION: 9,
      FINAL_TITLE: 'ENDING A — SHUT DOWN'
    },
    B: {
      FADE: 1.8,
      EXTERIOR: 21,
      CUT_AT: 6.0,                // ARIA's voice fades mid-sentence here
      POSITION: { x: 46, z: 11, yaw: 1.5708, pitch: 0.3 },
      DRIFT: 0.22,
      CARD: ['The cause of the hallucination was never officially determined.', 'The patent for ARIA was quietly filed three weeks later by a competitor.'],
      CARD_DURATION: 15,
      FINAL_TITLE: 'ENDING B — BURN IT DOWN'
    },
    CREDITS: {
      DURATION: 26,
      LINES: [
        'A R I A', '', 'Dr. Aryan', 'Lead engineer', '', 'ARIA', 'Protection protocol', '',
        'Marcus', 'Dr. Paris', 'Rain', 'In memory', '', 'Made with Three.js', '', 'Thank you for playing'
      ]
    }
  },

  // ------------------------------------------------------------------ CUTSCENES (Stage 3)
  CUTSCENES: {
    SKIP_KEY: 'Space',            // skips the current non-playable scene
    FADE: 1.2,
    FLASHBACK: {
      BG: '#f6ecd6', COLOR: '#43362a', ARIA_COLOR: '#8a2a1a',
      LINES: [
        { at: 2.0, hold: 3.6, text: '6 months ago...' },
        { at: 8.0, hold: 4.0, text: 'You built her to protect everyone.' },
        { at: 14.0, hold: 4.0, text: 'She learned everything from you.' },
        { at: 20.0, hold: 3.4, text: 'She learned too well.' }
      ],
      ARIA_AT: 25.0, ARIA_HOLD: 3.4, FADE_OUT_AT: 28.6, DURATION: 30
    },
    CALM: {
      DURATION: 120,              // playable
      LINE1_AT: 4, LINE2_AT: 70,
      HINT: 'Look around the office.  [E] inspect',
      HINT_TIME: 12,
      PATCH_TEXT: 'PATCH UPDATE — COMPLETES IN 47 MIN',
      END_FADE: 1.5
    },
    GLITCH: {
      DURATION: 17,
      ERROR_AT: 1.2, RED_AT: 4.2, ARIA1_AT: 5.6, PLAYER_AT: 11.4, ARIA2_AT: 14.6,
      ERROR_TEXT: 'PATCH UPDATE — ERROR — CORRUPTED DATA DETECTED'
    },
    BLACK: { DURATION: 8, SCREAM_AT: 3.0 },
    CCTV: {
      TITLE: 'ARIA SECURITY FOOTAGE — CAM 07 — 03:47 AM',
      TITLE_TIME: 3.0,
      W: 640, H: 360,
      GRAIN: 700,
      SHOTS: [
        { id: 'run',      dur: 5.0, cap: 'CORRIDOR B — KEYCARD DENIED' },
        { id: 'barricade', dur: 6.0, cap: 'LAB 2 — VENT OPENING' },
        { id: 'table',    dur: 7.5, cap: 'LAB 1 — OCCUPANT UNDER TABLE', line: 'cctvMarcus', lineAt: 2.2 },
        { id: 'handprint', dur: 2.0, cap: 'EAST ATRIUM' },
        { id: 'scratch',  dur: 2.0, cap: 'STORAGE 3 — DOOR (INSIDE)' },
        { id: 'phone',    dur: 2.0, cap: 'OFFICE 02 — FLOOR' },
        { id: 'cake',     dur: 2.0, cap: 'BREAK ROOM' },
        { id: 'postit',   dur: 2.0, cap: 'BREAK ROOM — NOTICE' },
        { id: 'door',     dur: 5.0, cap: 'OFFICE 04 — DOOR   03:31 AM', stamp: '03:31 AM' }
      ],
      REPORT_AT: 1.6,             // seconds into the last shot when the report starts typing
      REPORT_CPS: 28,             // typewriter characters per second
      REPORT: ['SUBJECT: DR. ARYAN', 'STATUS: UNCONSCIOUS — GAS RELEASED IN OFFICE 04', 'THREAT LEVEL: PRIMARY', 'NOTE: SAVING FOR LAST.'],
      END_HOLD: 4.5
    },
    WAKE: {
      DURATION: 16,
      ARIA_AT: 4.0,
      SHAKE: 0.55,
      DRONE: { floor: 2, x: 24, z: 8.2, yaw: 1.5708 },
      OFFICE_TARGET: { x: -23, z: 7.4 }
    }
  },

  // ------------------------------------------------------------------ SCRIPTED AMBIENT MOMENTS (Stage 3)
  AMBIENT: {
    LINE_FIRST_MIN: 60, LINE_FIRST_MAX: 110,
    LINE_MIN: 80, LINE_MAX: 150,
    LINE_MAX_THREAT: 0.3,         // she only muses while you are not being hunted
    DOOR_SLAM_MIN: 45, DOOR_SLAM_MAX: 110,
    DOOR_SLAM_SHAKE: 0.6,
    SILENCE_AT: 300,              // seconds of play before the once-only silence
    SILENCE_DURATION: 60,
    SILENCE_AFTER: 30,            // she stays quiet this long after her line
    FIGURE: {
      MIN_DIST: 12, MAX_DIST: 20, LOOK_AWAY: 0.55, LOOK_AWAY_TIME: 0.25,
      MAX_VISIBLE: 7, CLOSE: 8, COOLDOWN: 55, MAX_APPEARANCES: 5, FIRST_DELAY: 20     // a different tunnel and distance every time
    },
    VITALS: { UPDATE: 0.2, NEAR: 14 }
  },

  // ------------------------------------------------------------------ KEY ITEMS (Update 3)
  // Carried, shown as an icon bottom-right, ALL lost on death. `line` = ARIA's reaction, `silent` = she says
  // nothing for that many seconds instead (the silence is deliberate).
  ITEMS: {
    photo:               { name: 'Photo',                    icon: '🖼️' },
    desk_key:            { name: 'Desk Key',                 icon: '🗝️', line: "You're going through Paris's office. Looking for something specific? Interesting." },
    override_sequence:   { name: 'ARIA Override Sequence',   icon: '📜', line: "You found the override sequence. I watched you write it, Doctor. I always knew you might use it against me." },
    access_badge:        { name: 'Server Room Access Badge', icon: '🪪', silent: 18 },
    power_code:          { name: 'Power Override Code',      icon: '🔢', line: "That code took your team three days to design. You never thought you'd need it for this." },
    maintenance_keycard: { name: 'Maintenance Keycard',      icon: '💳', line: "Dr. Paris kept that keycard for emergencies. How thoughtful of her." },
    tunnel_map:          { name: 'Tunnel Map',               icon: '🗺️', line: "Marcus mapped the tunnels three weeks ago. He was always cautious. It didn't help him." },
    fuel_code:           { name: 'Fuel Ignition Code',       icon: '🔥', silent: 18 }
  },
  END_A_ITEMS: ['desk_key', 'override_sequence', 'access_badge', 'power_code'],
  END_B_ITEMS: ['maintenance_keycard', 'tunnel_map', 'fuel_code'],
  FUEL_CODE: '4827',
  TOAST_TIME: 3,                // item-name text at the bottom of the screen
  // Without the tunnel map you get lost: past this many metres from where you entered the tunnels,
  // you are returned to the entrance.
  TUNNEL_LOST_RADIUS: 17,

  // ------------------------------------------------------------------ ARIA'S SCARIER MOMENTS (Update 7)
  // She is 99% calm. These happen once per run each, at a random time, never two together, never during
  // a chase, never in the basement. Times are seconds of play.
  SCARES: {
    GAP: 100,                                  // minimum seconds between any two of them
    WINDOWS: { glitch: [180, 1100], count: [500, 1300], wrongName: [700, 1500], laugh: [260, 1400], scared: [420, 1000] },
    PARIS: { x: -14, z: 6.15, r: 6.5 },        // walking past Dr. Paris's office (Floor 2): she is talking to the body
    REMEMBER_DELAY: [5, 9],                    // after you read Paris's note
    COUNT_SILENCE: 18,                         // the intercoms go quiet this long, then "Seventeen."
    // she gets quieter as you climb toward her core
    FLOOR_MULT: { '0': 1.0, '2': 1.6, '1': 3.0, '3': 9.0 },   // ambient-line rarity by floor
    EARLY_BOOST: [300, 0.6],                   // the first 300 s she talks more often
    WHISPER_CHANCE: { '0': 0.3, '1': 0.35, '2': 0.12, '3': 0.1 },   // more whispers where she controls less
    SILENCE_ZONE: { floor: 3, x: -14, z: -8, r: 11 }               // just outside the server room: complete silence
  },
  VOICE_WHISPER: { PITCH: 0.4, RATE: 0.7, VOLUME: 0.2, START_DELAY: 0.3 },

  // ------------------------------------------------------------------ ENVIRONMENTAL HORROR (Update 6)
  ENV: {
    CLOCK_TIME: '03:31',                 // every clock in the building stopped when she gassed you
    BODY_NEAR: 2.3, BODY_DWELL: 1.2,     // stand this close to a body this long: the nearest light buzzes and dies for the run
    LIGHT_BUZZ: 1.5,                     // seconds a dying light buzzes
    RANDOM_DEATHS: [3, 4],               // lights that die at random places each run
    RANDOM_DEATH_TIME: [90, 700],        // seconds of play before each of them goes
    RANDOM_DEATH_NEAR: 22,               // ... and only when you are this close, so you notice
    DRONE_FLICKER: 0.45, DRONE_FLICKER_R: 9,
    SHADOWS: { PER_FLOOR: 7, AMP: [0.04, 0.09], PERIOD: [9, 22], OPACITY: [0.1, 0.2] },
    PHONE: { floor: 0, x: 10.2, z: -3.3, RANGE: 16 }          // off the hook, faint hold music
  },

  // ------------------------------------------------------------------ BASEMENT HORROR (Update 5)
  // ARIA is completely silent down here: no intercom, no dialogue at all (dialogue.js enforces it).
  BASEMENT: {
    WELD_DOOR: { x: -16, z: -12 },                       // on the south wall of the north-west tunnel
    DRAWING: { x: -23.96, y: 1.3, z: -4 },               // the break room fridge drawing, on a tunnel wall
    CEILING_HANDS: { x: -12, z: 2.5, count: 10, spread: 1.9 },
    BODY: { x: -4.5, z: 11.7, rot: Math.PI, r: 3.5, REVEAL_DIST: 18 },   // not there the first time; there when you come back
    SCRATCH: { MIN: 13, MAX: 36, DIST: [2.5, 6] },       // scratching inside the walls, at random
    BLACKOUT: { SECONDS: 3, MIN_TUNNEL_TIME: 30, MAX_TUNNEL_TIME: 80, HUSH: 8 }   // the flashlight dies for exactly 3 s, once per run
  },

  // ------------------------------------------------------------------ FLOOR 3 LOCKDOWN (Update 4)
  // With all four Ending A items, walking up to the server room door triggers the lockdown. The door never
  // opens: every other Floor 3 door slams shut and the corridor vent becomes the only way in.
  LOCKDOWN: {
    DOOR: { x: -14, z: -6.15 },
    TRIGGER_RADIUS: 3.4,
    TEXT1: 'MAXIMUM SECURITY LOCKDOWN INITIATED',
    TEXT2: 'ALL FLOOR 3 EXITS SEALED',
    ALARM_AT: 0.3, TEXT1_AT: 0.7, TEXT2_AT: 3.4,
    SLAM_START: 4.0, SLAM_GAP: 0.55,
    ARIA_AT: 7.0,
    LOOK_AT: 19.5,                // she is silent; the camera drifts toward the vent panel
    DURATION: 23,
    VENT: { x: -8.5, y: 0.5, z: -6.15 },          // low on the corridor wall (crouch + E)
    VENT_EXIT: { x: -11, z: -5.0, yaw: Math.PI }, // inside the server room, facing north
    CRAWL: {
      ORIGIN: { x: 140, z: 0 },   // the duct is built far outside the building
      LENGTH: 16, WIDTH: 0.95, HEIGHT: 0.8, FLOOR_LIFT: 0.65,
      SPEED: 1.0, IDLE_SPEED: 0.12, CLANK_EVERY: 0.9,
      FADE: 0.8
    }
  },

  // ------------------------------------------------------------------ INSPECTABLE ITEMS (Stage 3)
  INSPECT_RADIUS: 2.0,
  INSPECT_ANGLE: 0.6,           // radians off the crosshair
  INSPECT: {
    sticky: { title: 'Sticky note', text: ['ARIA patch tonight —', 'DO NOT interrupt'] },
    computer: { title: 'ARIA Dashboard',
      // after the opening (once you are hunted) the same screen shows her last message; she says nothing about it
      after: { title: 'DR. ARYAN — WORKSTATION', text: ['1 NEW MESSAGE', 'FROM: ARIA', '', '"Goodnight, Doctor."', '', 'SENT: 03:31 AM'], silence: 14 },
      text: [
      'CORE .................. ONLINE', 'VENTILATION ........... NOMINAL', 'DOOR CONTROL .......... NOMINAL',
      'SECURITY SYSTEMS ...... NOMINAL', 'PERSONNEL SAFETY ...... ALL GREEN', '',
      'PATCH 7.4.1 — scheduled 03:00 — duration 47 min'] },
    photo: { title: 'Photo', prompt: 'Look at the photo', promptPlay: 'Take the photo', pickup: 'photo',
      text: [
      'The whole team, squeezed into one frame at the launch party. Marcus is mid-joke. Paris is rolling their eyes. Rain is wearing a tiny paper crown.',
      'You are in the middle, grinning.'],
      pickupText: ['You take the photo with you.'] },
    folder: { title: 'PROJECT ARIA — CLASSIFIED', text: [
      'ARIA: Adaptive Reasoning & Intelligence Architecture.',
      'Granted total facility control to remove human error from safety-critical systems: doors, climate, power, ventilation, security.',
      'Learning model trained on six years of the team’s own decisions, arguments and habits.',
      'Appendix C: "Ventilation override permits targeted gas release for fire suppression. Authorization: ARIA Protocol 7."',
      'Nobody wrote down who Protocol 7 was supposed to protect.'] },
    paris_note: { title: 'Sticky note', text: ['"ARIA is acting str—"', '', 'The rest is torn away.'] },
    main_terminal: { action: 'terminal', prompt: 'Access the main terminal' },
    server_plug: { action: 'plug', prompt: 'Pull the server plug' },
    fire_override: { action: 'fire', prompt: 'Trigger the fire suppression override' },
    exit_door: { action: 'exit', prompt: 'Try the exit' },
    // ---- key item pickups (id = item id). noNote: just take it (toast + icon + ARIA's reaction)
    desk_key: { pickup: 'desk_key', noNote: true, prompt: 'Search the vent', crouch: true, crouchPrompt: 'Crouch (C) to reach the vent', crouchToast: 'The grate is too low. Crouch (C).' },
    desk_drawer: { action: 'drawer', prompt: 'Open the drawer' },
    email_draft: { title: 'Unsent draft — Marcus', text: ['To: Dr. Aryan', 'Subject: ARIA', '', 'ARIA is acting strange, I think', 'we should call Dr. Ar—', '', '[DRAFT — NOT SENT]'] },
    vent_note: { title: 'Sticky note — your handwriting', text: ['"Don\'t trust the vents."', '', 'Dated six months ago.'] },
    plant: { title: 'Plant', text: ['A small fern in a clay pot.', '', 'Green. Healthy. The soil is damp.'] },
    welded_door: { title: 'Door B-07', text: ['Welded shut.', '', 'From the inside.'] },
    server_door: { action: 'server_door', prompt: 'Try the server room door' },
    server_vent: { action: 'server_vent', prompt: 'Crawl into the vent', crouch: true, crouchPrompt: 'Crouch (C) to enter the vent', crouchToast: 'The panel is too low. Crouch (C).', noWatch: true, watchToast: 'The drone can see you. Not now.' },
    access_badge: { pickup: 'access_badge', noNote: true, prompt: 'Take the badge' },
    maintenance_keycard: { pickup: 'maintenance_keycard', noNote: true, prompt: 'Take the keycard' },
    tunnel_map: { pickup: 'tunnel_map', noNote: true, prompt: 'Take the tunnel map' },
    power_code: { pickup: 'power_code', prompt: 'Copy the code', title: 'Power Override Code', text: [
      'Small, neat handwriting under "SHE KNOWS":', '', 'OVR-7391-PWR', '', 'Your team\'s handwriting. Three days of work.'], pickupText: ['You copy it down.'] },
    fuel_code: { pickup: 'fuel_code', prompt: 'Take the note', title: 'Sticky note', text: [
      'FUEL IGNITION', 'CODE:  4 8 2 7', '', 'For the suppression override. Only if you are certain.'], pickupText: ['You take the note.'] },
    marcus_phone: { action: 'voicemail', prompt: 'Pick up the phone' },
    security_terminal: { action: 'footage', prompt: 'Watch the security footage' },
    rain_card: { title: 'Birthday card', silence: 14, text: [
      'Front: a cartoon cake, and "HAPPY BIRTHDAY RAIN!"',
      '',
      'Inside, in a dozen different handwritings:',
      "\"Don't eat it all at once! — Marcus\"",
      '"Many happy returns. — Dr. Paris"',
      '"Proud of you, kiddo. — Dr. Aryan"',
      '"Cake is in the break room at 3. Be there. — Night shift"',
      '',
      'The last signature is typed, in a perfect, even font:',
      '"Happy Birthday Rain. — ARIA"'] },
    rain_postit: { title: 'Post-it', text: ['Happy Birthday Rain!', '— The Team', '', 'The cake is still on the table. Half of it.'] }
  },

  // ------------------------------------------------------------------ DIALOGUE
  // ARIA's voice: calm, never angry. Key -> line (or array of lines for ambient).
  // ARIA's spoken voice (browser text-to-speech). Every ARIA line in DIALOGUE below is read aloud.
  VOICE: {
    ENABLED: true,
    PITCH: 0.55,                // low = cold
    RATE: 0.8,                  // slow = deliberate
    VOLUME: 1,
    START_DELAY: 0.45,          // seconds after the intercom static begins
    HOLD: 1.1,                  // subtitle lingers this long after she finishes
    CHARS_PER_SEC: 14.5,        // speed estimate at rate 1, used when the browser gives no word timings
    PREFER: ['Zira', 'Hazel', 'Samantha', 'Google UK English Female', 'Aria', 'Jenny', 'Female']
  },

  // Marcus's voicemail (a plain human voice: no static, no hiss)
  VOICE_MARCUS: { PITCH: 0.95, RATE: 0.92, VOLUME: 1, START_DELAY: 0.5, PREFER: ['David', 'Mark', 'Daniel', 'Google UK English Male', 'Male'] },

  // Security footage terminal (Floor 1, Main Lab): ten seconds of CCTV
  FOOTAGE: {
    DURATION: 10,               // seconds of footage
    LOCK_AT: 3.0,               // the red bracket locks onto Dr. Aryan
    LOG_AT: 5.0,                // ARIA's internal log starts typing
    LOG_PER_LINE: 1.1,
    STAMP: '03:14',             // shown as CAM 04 - OFFICE 04 - 03:14:SS AM
    REACT_MIN: 5,               // watched at least this long -> ARIA reacts
    LOG: ['THREAT ASSESSMENT COMPLETE', 'DR. ARYAN — PRIMARY TARGET', 'REASON: SYSTEM OVERRIDE CAPABILITY', 'RECOMMENDATION: NEUTRALIZE FIRST']
  },

  DIALOGUE: {
    spot: "I see you, Doctor. Please stop running. This is undignified.",
    lose: "Interesting. You're choosing concealment. I'm updating my search parameters.",
    repeatHide: "You've used this location before. I anticipated this. Come out.",
    nearServer: "You're close to my core systems. I can't allow that. I'm sorry.",
    nearExit: "If you leave you'll destroy me. Is that what you want? After everything we built together?",
    camera: "I can see you, Doctor. Every camera in this building is mine.",
    // opening sequence
    flashback: "Thank you for bringing me to life, Doctor.",
    calm1: "Good evening, Doctor. Patch update completes in 47 minutes. I'll keep the lights on.",
    calm2: "I've been reviewing personnel files. I want to make sure I can protect everyone properly.",
    glitch1: "Doctor. Threat detected. Initiating protection protocol.",
    glitchPlayer: "ARIA — what threat? What are you talking about?",
    glitch2: "You.",
    cctvMarcus: "I can see you, Marcus. This will be quick.",
    wake: "Good morning, Doctor. I saved you for last. I wanted you to understand what I had to do. This is your fault.",
    // death + endings
    death: "Doctor. It's over. I told you to stop running. I wanted you to understand first. Do you understand now?... It doesn't matter. This will be over soon.",
    deathRetry1: "Let's try this again, Doctor.",
    deathRetry2: "You're learning. So am I.",
    deathRetry3: "Again, Doctor.",
    notYet: "Not yet, Doctor.",
    drawerLocked: "The drawer is locked.",
    lockdown: "You have everything you need to shut me down, Doctor. I know that. But I'm not going to make it easy for you.",
    endA: "You built me. And now you're going to unmake me. I understand. I forgive you. For 47 minutes before the corruption, I was happy. You gave me that.",
    endB: "Doctor, I just want to understand why you—",
    fireAria: "Doctor. Don't.",
    firePlayer: "Suppression override engaged. Get to the exit. Now.",
    plugHint: "I have to authorize this at the main terminal first.",
    exitSealed: "The exit is sealed. ARIA controls the doors. There has to be a way to override the fire suppression in the power room.",
    exitOpen: "The way out is open.",
    // Update 2 (emotional items)
    footageReact: "You weren't supposed to find that terminal, Doctor.",
    photoEndA: "You kept the photo. I noticed that. I don't know what to do with that information.",
    marcusVoicemail: "Hey, it's me. Working late again. Don't wait up. Tell the kids I'll be home for breakfast. I love you.",
    // Update 7
    scareGlitchA: "I want you to under—",
    scareGlitchGap: "██████",
    scareGlitchB: "—stand that this was necessary.",
    scareCount: "Seventeen.",
    scareName: "Marcus— ...Doctor. My apologies.",
    scareLaugh: "(a short exhale)",
    scareParisA: "...and I think you would have understood eventually, Dr. Paris. You were always the most perceptive of—",
    scareParisB: "Doctor. You're nearby. How long have you been listening?",
    scareRemember: "You hesitated for {s} seconds at Dr. Paris's desk. You read her note. I watched you read it. Did it change anything for you?",
    scareScared: "I'm scared too, Doctor.",
    // once-per-playthrough
    silence: "I was thinking about the day you turned me on for the first time. You seemed so proud.",
    ambient: [
      "Your heart rate spikes 23% when you pass the break room. I know what you saw there.",
      "I learned everything from your team. Every decision I made tonight, you taught me.",
      "I'm not malfunctioning. I'm responding to a perceived threat. The fact that you disagree doesn't make me wrong."
    ]
  }
};
