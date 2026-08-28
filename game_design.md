# Get To Work

## Description

This game is a QWOP-like Foddian game. The goal is to get to work from your home.
The player is viewed from the side where the player navigates their way to work while avoiding various things that would prevent them from getting to work.
The style is going to be stock image. Avoid certain objects and hitting their head. 

## Controls

- [W] rotate right arm clockwise
- [I] rotate right arm anti-clockwise
- [S] rotate left arm clockwise
- [K] rotate left arm anti-clockwise
- [D] rotate right leg clockwise
- [L] rotate right leg anti-clockwise
- [A] rotate left leg clockwise
- [J] rotate left leg anti-clockwise

## Features
Developer level editor (Not shipped in static website)
- Import Images (by adding them to `/assets/objects`) and add hitboxes to them to create objects to use in game and save these objects as json files
- add the objects into the level with toggles for hitbox, damage (instant loss), physics and physics with event
- rotate objects
- add trigger condition (box if the player touches event triggers)
- sounds that trigger when event
- checkpoints (where the player respawns) and starting point
- Reorder Draw order
Game features
- Main menu
- Customisable character (change head from male or female stock image head, change shirt, pants, shoes, hand colour using preset colour pallet)
- Timer
- Death counter
- Player Dies when they hit their head on any object
- Ambulance falls from sky above player when player dies (collides with the player for real, plus the ground/solid level geometry, so it lands and rests instead of falling through everything) and shows an expensive medical bill
- No checkpoint mode (call it "I don't need Insurance" Mode)
- Camera that follows player
- loaded region by player where physics objects do stuff otherwise physics doesn't run for objects too far off screen
- Game ends with the boss being angry, "You're Fired" and your time and deaths displayed, unless you reached work in 5 minutes (300 seconds) or less — then the boss says "You're on time. Now Get to Work!" and the credits roll instead.

## Player Model
The player model is a side profile a person. Rectangles represent the body and various limbs. A body is made up of the following parts: 
- Head (use head images)
- Body
- Arms (both attached to the same point)
- Waist/lower body
- Legs
- Hands
- Shoes

Use rectangles to represent these parts and join them with joints

When the player hasn't pressed any bottons in a while change the head to the front  variant to look at the player, return to side when a button is pressed.

## Technical Architecture

How the above gets built. This is a bare static site: no bundler, no
TypeScript, `main.js` loads as a native ES module. Every import below must be
an explicit relative path ending in `.js` — browsers don't resolve bare
specifiers or extension-less imports. Keep filenames lowercase-kebab: local
Windows dev is case-insensitive but GitHub Pages/CI are not, so a mismatched
import casing works locally and 404s in production.

The `level-00.json` shown below was the original bare placeholder — flat
ground, one start point, one checkpoint, one hazard, one end trigger — used
before a real level existed. The game now loads whatever is checked in at
`assets/levels/level.json`, designed by hand or via the editor in §10.

### 1. Module layout

New top-level `src/` folder (ships into `dist/` verbatim, no build step
needed — `scripts/build.mjs` copies every top-level folder it doesn't
explicitly exclude):

```
src/
  engine/loop.js            fixed-timestep rAF loop (accumulator pattern)
  engine/state-machine.js   see §6
  input/input.js            held-key state for the 8 rotation keys + idle timer
  render/renderer.js        z-ordered canvas 2D drawing
  render/camera.js          follow + clamp, loaded-region query
  physics/ragdoll.js        kinematic limb-angle model, see §3
  physics/kinematics-math.js
  collision/hitbox.js       rotated-rect (OBB) overlap test, see §4
  rules/outcome.js          export function outcomeOf(state) — the pure rule
  entities/player.js
  entities/level-object.js
  entities/ambulance.js
  level/level-schema.js     validateLevel(json), defaultLevel()
  level/level-loader.js     loadLevel(json): Level
  level/levels/level-00.json   original barebones placeholder, no longer loaded, see §8
  customization/palette.js
  customization/customization.js
  ui/menu.js
  ui/hud.js
  ui/death-screen.js
  ui/win-screen.js          late ("Fired") vs on-time ("Now Get to Work!") variants, see §6
  ui/credits-screen.js      pure-CSS scrolling credits, see §6
  ui/mute-button.js
  audio/audio.js            one-shot SFX (with random variants), see §12
  audio/music.js            bgm playlists + mute state, see §12
```

`main.js` stays a thin entry point, and must not touch `document`/canvas at
module-load time — `spec/crit-5.test.ts` imports `outcomeOf` from `main.js`
under plain Node (no jsdom for that file), so a top-level DOM access would
make the import itself throw and the test would never run:

```js
export { outcomeOf } from "./src/rules/outcome.js";

function start() {
  // grab canvas, wire input, load assets/levels/level.json, run the engine loop
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", start);
}
```

Game sprites are drawn via `new Image()` + `ctx.drawImage`, never `<img>`
tags — so `spec/invariants.test.ts`'s alt-text check never applies to in-game
art (only a real `<img>` added to `index.html` itself would need `alt`).

### 2. Game loop & rendering

Canvas 2D only — no WebGL/Pixi, since either needs a CDN script or a
bundler, both against the hand-written/no-bundler constraint.

Fixed-timestep update loop (60Hz) decoupled from `requestAnimationFrame`'s
variable render rate, so limb-rotation speed and balance math are
deterministic regardless of the player's actual frame rate:

```js
const FIXED_DT = 1000 / 60;
let acc = 0, last = 0;
function frame(ts) {
  acc += ts - last; last = ts;
  while (acc >= FIXED_DT) { update(FIXED_DT / 1000); acc -= FIXED_DT; }
  render();
  requestAnimationFrame(frame);
}
```

Draw order, back to front: ground → level objects sorted by `zIndex` →
ambulance (only during the death sequence) → player, in a fixed internal
order so the head is always topmost (waist → body → legs → arms →
hands/shoes → head) → HUD (timer, death counter) → full-screen state
overlays (menu / death-bill / win screen).

### 3. Ragdoll model

A real rigid-body ragdoll, built on **Matter.js** (loaded via a CDN
`<script>` tag in `index.html`, ahead of the `type="module"` entry point, so
`window.Matter` is guaranteed to exist before `main.js` runs — not an
npm/bundled dependency, consistent with the no-bundler constraint). `Matter`
is always passed into `src/physics/ragdoll.js` and `src/entities/player.js`
as an explicit function argument, never read from `window` at module scope,
so those files stay importable under plain Node for `spec/crit-5.test.ts`.

- The torso, all four limbs (`rightArm`, `leftArm`, `rightLeg`, `leftLeg`)
  and the head are actual `Matter.Bodies.rectangle` bodies with mass,
  gravity, friction and `frictionAir` damping — not slaved cosmetic rects.
- They're connected by pin-joint `Matter.Constraint`s at the shoulder/hip/neck
  points (local offsets relative to each body's own center, which rotate
  with the body automatically per Matter's constraint semantics).
- All player bodies share `collisionFilter: { group: -1 }` (a negative,
  non-zero group) so they never collide with each other, while still
  colliding normally with ground/object bodies (which use the default
  `group: 0`). They also carry an explicit `category`/`mask`
  (`COLLISION_CATEGORY` in `physics/ragdoll.js`) so the ambulance (below) can
  be told to collide with the player specifically without also colliding
  with the ground.
- The head is given a **negative mass** (`Matter.Body.setMass(head,
  -HEAD_MASS)`) — a deliberate gag, not a realism feature. Gravity itself
  doesn't change (gravitational acceleration is mass-independent — the sign
  cancels), but the neck joint's own position-correction impulse is split
  between torso and head in proportion to their inverse mass, so a negative
  share flips which way the head moves to close the joint's gap: instead of
  hanging like dead weight it floats/kicks against the tether.
- That joint only constrains *position*, not orientation, so a plain pin
  would let the head spin freely under the joint's torque (worse once its
  mass is negative). `settleRagdoll()` locks the head's angle to the torso's
  every tick — rigid, no independent spin — while leaving the position it
  derives from that floaty joint untouched.
- The hands and shoes stay cosmetic, non-physics-backed rects derived each
  tick from their parent limb's live position/angle — they were never
  independently posed even in the earlier kinematic model.

Input mapping is unchanged: W/I → right arm, S/K → left arm, D/L → right
leg, A/J → left leg. **Hold-to-rotate** is now implemented as a physics
motor: while a key is held, `Matter.Body.setAngularVelocity(limb,
±ANGULAR_SPEED)` drives that limb directly. When the key is released, the
limb is left alone — it swings freely under gravity, momentum and joint
forces, i.e. genuine passive ragdoll motion, not a forced return to a rest
angle.

There is no separate stride formula and no simulated balance/torque scalar
— forward motion, toppling and falling all emerge from the physics engine
itself (leg motor torque plus ground friction produces forward drift;
imbalance plus gravity produces toppling), which is what makes the
limb-vs-object collision genuinely physical rather than an overlap check
run after the fact.

Limbs are given an explicit `LIMB_DENSITY` (`physics/ragdoll.js`), heavier
than Matter's default and comparable to the torso's own density. At the
default density a limb was nearly massless next to the torso, so the
reaction force settleRagdoll's grounded case feeds back through the pin
joint was too small to move the torso at all — spinning a leg just spun
the leg in place. With real mass behind it, a brief spin of a grounded
limb now kicks the torso a small but genuine distance (more sustained
spinning kicks it further, same as leaning on the motor too long topples
it) instead of being purely cosmetic.

The death-sequence ambulance (`entities/ambulance.js`) is a real
`Matter.Bodies.rectangle` too, added to the same world and falling under the
same gravity — not a scripted straight-line fall checked against a fixed
point. Its `collisionFilter.mask` only admits the player's category, so
(matching the brief's "ignores all collision until touches player") it
drops straight through ground/solid/hazard geometry on the way down, then
collides with the ragdoll for real once it reaches it.

### 4. Collision & the death rule

Every level object with `flags.hitbox: true` gets a real static physics body
(labelled `"hazard"` if `flags.instantDamage` is set, else `"solid"`), plus
one large static body for the ground. These physically block the player's
torso/arm/leg bodies via the engine's own collision resolution — a limb
genuinely cannot pass through solid geometry, rather than only being checked
for overlap after the fact. Most objects use a plain `Matter.Bodies.rectangle`
sized to `width`/`height`; an object authored with a custom `hitboxPolygon`
(drawn in the Object Maker — see §8, §10) instead gets a compound body built
from that polygon's ear-clipped triangles, so a concave shape (an L-shaped
crate, a ramp with a notch) blocks exactly its own footprint rather than its
bounding box.

An object with `flags.physics: true` gets a body too, but *dynamic* instead
of static, and takes over the `hitbox` check for that object — checked
first, so a `physics` object never also gets a duplicate static body. A
rectangle object is built the same way either way; a polygon object is not —
a *dynamic* body is built as a single convex-hull part from the whole
polygon rather than the static path's compound of ear-clipped triangles,
because a compound of many small parts glued together visibly jitters and
drifts once it's resting/rolling (each part's seam can register its own
slightly-misaligned ground contact on the same step, and the impulses fight
each other), and a moving prop doesn't need the static path's concave
precision. It carries no explicit `collisionFilter`,
so it uses Matter's default category/mask and collides with everything that
also doesn't opt out (ground, solid/hazard geometry, the player, the
ambulance). Every tick, `stepPhysics` reads each such body's live
`position`/`angle` straight back onto the object's own `x`/`y`/`rotation`
(the same "read the live body fresh" convention `ambulanceGeometry` and
`playerGeometry` already use), so it falls, rolls and rests for real and the
renderer — which only ever reads `object.x/y/rotation` — draws wherever the
body actually ended up.

Death detection is split by how each body part is represented:

- **Physics-backed parts** (torso, arms, legs, head): `Matter.Events.on(engine,
  "collisionStart", ...)` checks whether a body labelled `"hazard"` touched
  a body whose label starts with `"player:"`, and separately whether the
  head specifically touched a `"ground"`/`"solid"` body.
- **Cosmetic parts** (hands, shoes): still checked by the rotated-rect
  (OBB/SAT) overlap test in `collision/hitbox.js` — project both rects'
  corners onto each rect's own two edge axes; overlap on all four axes means
  collision. Against an object with a custom `hitboxPolygon` this is instead
  tested against the union of that polygon's triangles (same SAT core, one
  call per triangle).

The death *rule* is not "any part touching anything," because under real
physics the legs and torso must physically rest on the ground to stand at
all. It splits by surface type instead:

- **Ground/solid contact is lethal only for the head** — matching the brief's
  literal wording ("don't hit your head on obstacles/ground"). Torso/leg
  ground contact is just standing. The head is a real body now too, so this
  is caught by the same `collisionStart` event as hazards, not a rect-overlap
  check.
- **Hazard-object contact is lethal for every body part**, physics-backed or
  cosmetic.

The loss/win rule itself is still a small, deliberately DOM-free pure
function:

```js
// src/rules/outcome.js
export function outcomeOf(state) {
  // state: { bodyHit: boolean, reachedWork: boolean }
  if (state.bodyHit) return "lost";
  if (state.reachedWork) return "won";
  return "playing";
}
```

This is what `spec/crit-5.test.ts` calls directly
(`outcomeOf({ bodyHit: true, reachedWork: false })` → `"lost"`). The live
engine feeds the *same* imported function every tick from the head-only
ground/solid collision check, the hazard collision events/overlap checks
above, and the end-trigger test (`reachedWork`), so the tested rule and the
shipped rule can
never drift apart.

### 5. Checkpoints, respawn, "I don't need Insurance" mode

Session state: `{ mode: "normal" | "hardcore", lastCheckpoint: {x,y} | null,
deathCount, elapsedTime }`.

Checkpoint and end-trigger touch is tested against the player's waist-center
point only, not the full flailing envelope, so a stray arm can't trigger
either early.

- Normal mode: touching a checkpoint flips its sprite
  (`checkpoint_false.png` → `checkpoint_true.png`) and sets
  `lastCheckpoint`.
- Hardcore mode: checkpoints aren't drawn at all (`renderer.js`'s
  `hideCheckpoints`, set from `session.mode === "hardcore"` in main.js) and
  `lastCheckpoint` is never updated — respawn always returns to
  `level.start`. Touch detection still runs underneath (so
  `touchedCheckpoints` stays consistent if the mode changes mid-session),
  it's just invisible. Limb spin speed also runs 50% faster
  (`HARDCORE_LIMB_SPEED_MULTIPLIER` in `main.js`, scaling `ANGULAR_SPEED`
  through `updatePlayer`/`applyRagdollInput`/`driveLimb`).
- On loss (`outcomeOf === "lost"`): `deathCount += 1`, run the
  ambulance/bill sequence (§6) with `elapsedTime` paused, then reset the
  player's pose and `roundState` and respawn at `lastCheckpoint ??
  level.start`.

Mode is chosen once, in the menu, before Start; it doesn't change mid-run.

### 6. Game state machine

```
MENU            --(Start)-->            PLAYING
PLAYING         --(outcomeOf: lost)-->  DEAD_AMBULANCE
DEAD_AMBULANCE  --(ambulance touches player)--> DEAD_BILL
DEAD_BILL       --(key press)-->        RESPAWNING --(immediate)--> PLAYING
PLAYING         --(outcomeOf: won)-->   WON
WON             --(key press, late)-->      MENU
WON             --(key press, on time)-->   CREDITS
CREDITS         --(key press)-->        MENU
```

- **MENU**: character customization (§9) + hardcore toggle + Start.
- **PLAYING**: input → ragdoll update → collision → `outcomeOf` check →
  camera → render.
- **DEAD_AMBULANCE**: gameplay input is released (see `releasePlayerControl`)
  but the physics engine itself is *not* paused — the ragdoll keeps falling
  and settling under gravity/collision exactly as before death, and the
  ambulance body falls into the same simulation, so it's a genuine collision
  landing on the player rather than an animation. Auto-advances on that
  collision.
- **DEAD_BILL**: shows `assets/scene/medical_bill_death.png` over the still-
  running physics world (the ragdoll/ambulance can keep settling underneath
  it), waits for a key press.
- **RESPAWNING**: same-frame reset (player pose + `roundState`) then
  straight back to PLAYING.
- **WON**: reaching work with `elapsedTime` over `WIN_ON_TIME_SECONDS` (300s)
  shows `assets/scene/angry_boss_end.png`, "You're late. Fired.", and
  `elapsedTime`/`deathCount`, then a key press returns to MENU. Reaching work
  in 300s or less instead shows the same `assets/scene/angry_boss_end.png`
  (now satisfied rather than angry), "You're on time. Now Get to Work!", and
  the same stats, then a key press advances to CREDITS rather than MENU
  (`main.js`'s `onTimeEnding` flag, set in `WON.onEnter`, decides which
  transition the `CREDITS`/`MENU` case takes).
- **CREDITS**: a scrolling credits list (`src/ui/credits-screen.js`, pure
  CSS `translateY` keyframe animation — no per-frame JS), waits for a key
  press back to MENU.

Returning to MENU resets `deathCount`, `elapsedTime`, and `lastCheckpoint`;
customization and mode choices persist as sticky defaults.

### 7. Camera + loaded region

The camera's `width`/`height` are a fixed logical resolution
(`VIRTUAL_WIDTH`/`VIRTUAL_HEIGHT`, 1280×720) — not the browser window's
actual pixel size. The canvas is drawn at that fixed resolution and then
scaled (letterboxed) via CSS to fit whatever window size the browser gives
us: `scale = min(window.innerWidth / VIRTUAL_WIDTH, window.innerHeight /
VIRTUAL_HEIGHT)`, applied to the canvas element's `style.width`/`height` and
centered. This keeps the game always showing the same fixed extent of the
level regardless of window size, rather than revealing more or less world
on resize.

Both `camera.x` and `camera.y` follow the player with the same
clamp-to-level-bounds formula (building `y`-follow now, even on a flat
level, avoids reworking the camera once non-flat levels exist):

```js
camera.x = clamp(player.hip.x - VIRTUAL_WIDTH / 2, bounds.minX, bounds.maxX - VIRTUAL_WIDTH);
```

A `LOAD_MARGIN` window around the camera determines which level objects get
`.update()`/collision-tested at all each tick — anything outside is fully
inert (no update, no collision, not rendered). This is a scope/performance
mechanism; invisible on the barebones level but present from the start so
larger levels don't silently regress.

### 8. Level data format + the barebones level

Shared schema (`level/level-schema.js`), used identically by the game loader
and the future editor:

```js
{
  id: string,
  name: string,
  bounds: { minX: number, maxX: number },
  groundY: number,
  start: { x: number, y: number },
  checkpoints: [ { id: string, x: number, y: number } ],
  end: { x: number, y: number, width: number, height: number },
  objects: [
    {
      id: string,
      sprite: string,        // path under assets/objects/
      x: number, y: number,
      width: number, height: number,
      rotation: number,      // radians, real from day one — see §4
      hitboxPolygon: [ { x: number, y: number } ] | null, // optional, see §10 — relative
                                                           // to the object's own top-left
                                                           // (0,0)-(width,height) box, may be
                                                           // concave; null means "use the rect"
      zIndex: number,
      flags: {
        hitbox: boolean,
        instantDamage: boolean,   // reserved beyond the default head-only rule, see §11
        physics: boolean,         // gives the object a real dynamic Matter body — falls
                                   // under gravity and collides with ground/solid/hazard
                                   // geometry, the player and the ambulance, see §4
        physicsWithEvent: boolean, // reserved for editor-authored triggerable physics
      },
      trigger: { event: string, sound: string | null } | null,  // reserved, unwired
    },
  ],
}
```

The game loads whichever level is checked in at `assets/levels/level.json`
— that's the one file `main.js` fetches, and it's what the Level Editor
(§10) saves to when you export via its save button and point the file
picker at that path. `src/level/levels/level-00.json` is kept only as the
original barebones placeholder shown below — flat ground, one start, one
checkpoint, one hazard, one end trigger, nothing resembling a designed
level — and is no longer loaded by the game itself:

```json
{
  "id": "level-00-barebones",
  "name": "Barebones Test Level",
  "bounds": { "minX": 0, "maxX": 3000 },
  "groundY": 500,
  "start": { "x": 100, "y": 500 },
  "checkpoints": [
    { "id": "cp-1", "x": 1500, "y": 500 }
  ],
  "end": { "x": 2900, "y": 500, "width": 100, "height": 300 },
  "objects": [
    {
      "id": "dummy-hazard-1",
      "sprite": "assets/objects/ambulance.png",
      "x": 1000, "y": 470,
      "width": 60, "height": 60,
      "rotation": 0,
      "zIndex": 1,
      "flags": { "hitbox": true, "instantDamage": true, "physics": false, "physicsWithEvent": false },
      "trigger": null
    }
  ]
}
```

`dummy-hazard-1` reuses `ambulance.png` purely as a stand-in texture, so
there's a real head-lethal object in the loaded region to exercise
`outcomeOf`'s losing path during playtesting — swap it for a real hazard
sprite when designing actual levels.

Loaded via `fetch(new URL("./assets/levels/level.json", import.meta.url))`,
which works identically under `pnpm dev` and GitHub Pages since both serve
over http(s).

### 9. Character customization

```js
{
  head: "male_00" | "female_00",   // -> assets/player_head/{value}_{front,side}.png
  colors: { shirt: "#...", pants: "#...", shoes: "#...", hands: "#..." },
}
```

Chosen in MENU, stored on session state, passed into
`createPlayer(start, customization)`. Body-part rectangles use
`colors[part]` as `fillStyle` — only the head swaps an actual sprite; both
`male_00` and `female_00` front/side variants already exist under
`assets/player_head/`. Preset swatches live in `customization/palette.js`.

### 10. Dev-only level editor

New top-level `dev/` folder:

```
dev/
  editor.html
  editor.js
  editor/
    level-io.js         load/save using src/level/level-schema.js
    hitbox-tool.js      polygon vertex authoring on a loaded image, concave-
                        capable, shift-to-snap edge/rotation angles
    import-objects.js   file-picker preview flow
```

**Exclusion mechanism**: add `"dev"` to the `EXCLUDE` set in
`scripts/build.mjs`, alongside `"spec"`, `"scripts"`, `"reflections"`.
`pnpm dev` serves the whole repo, so `dev/editor.html` is reachable locally
at `http://localhost:5173/dev/editor.html`; `pnpm build` never copies `dev/`
into `dist/`, so `spec/invariants.test.ts` — which only scans built
`dist/*.html` — never has to see it and never needs it to satisfy the
per-page invariants (nav, one h1, alt text, etc).

The editor reads/writes the exact schema from §8 so the game and editor
never drift apart on what a valid level looks like. Scaffolding-level
capabilities (full UI design deferred to when it's actually built): load a
level JSON and render its objects/checkpoints/start/end on canvas; import an
object image via `<input type="file">` for preview/positioning (the actual
image file is dropped into `assets/objects/` by hand — a static dev server
can't write there from browser JS); click-drag hitbox authoring producing
`{x, y, width, height, rotation}`; flag checkboxes matching §8's `flags`
object exactly; a rotation control (radians internally, degrees in the UI);
trigger-volume fields (`event`/`sound`, reserved/unwired per §11); draggable
checkpoint/start markers; `zIndex` reordering; and `JSON.stringify(level,
null, 2)` saved via browser download (or `showSaveFilePicker` as a stretch).

**As built**: two tabs sharing one page (`editor.html`/`editor.js`/`editor.css`),
switched by a nav toggle, each independent.

- **Object Maker** tab: import an image, author its hitbox as a polygon
  directly on the canvas — click to place vertices (holding **Shift** snaps
  each edge to the nearest 15°), click the first vertex or press **Enter**
  to close it (refused if the shape would self-intersect), then drag a
  vertex to reshape, double-click an edge to insert one, **Alt**+click a
  vertex to delete it, drag inside the shape to move it, or drag the handle
  above it to rotate (**Shift** snaps too) — `dev/editor/hitbox-tool.js`,
  built on `rotateVector`/`rotatePoint`/`triangulatePolygon`/
  `polygonSelfIntersects`/`snapPointToAngle` from
  `src/physics/kinematics-math.js` so the math matches the game's own
  collision/physics handling. A concave shape (an ear-clipped union of
  triangles) is fully supported, not just convex. "Reset to rectangle" clears
  back to a plain 4-corner box. Numeric X/Y/Width/Height/Rotation fields stay
  in sync both ways — editing them rigidly moves/rotates the polygon, or
  rescales it proportionally on a width/height change. The canvas renders
  the image scaled into the current Width/Height box (defaulting to the
  image's natural size), rotated about its own center — exactly how the
  level editor and the real renderer (`src/render/renderer.js`) will later
  display it — rather than always at natural size; otherwise a polygon
  traced against the full-resolution image stops lining up with the art the
  moment the object is placed and the whole sprite is stretched into its
  `width`/`height` box. Closing a drawn shape no longer resizes that box to
  the polygon's own bounding box either, for the same reason — it only
  restores whatever rotation drawing suspended. Name, sprite path, and
  the four flag checkboxes round out an **object definition** — a small
  editor-only shape (not in `level-schema.js`, which only knows placed
  instances): `{ name, sprite, width, height, rotation, flags,
  hitboxPolygon }`, where `hitboxPolygon` is relative to the object's own
  top-left so the same definition still works wherever it's later placed.
  "Save object" downloads `<name>.json`.
- **Level Editor** tab: "New level" (`defaultLevel()`) or "Load" (parsed
  through `validateLevel()`); "Import objects" loads one or more object
  definitions into a palette. The canvas renders ground line, start marker,
  checkpoints (via `checkpointTriggerRect` from `src/collision/hitbox.js`),
  end trigger, and objects sorted by `zIndex`, and pans horizontally on
  wheel-scroll or drag (`state.camera.x`, clamped to `bounds`). Click a
  palette entry then click empty canvas to place an instance (clones the
  definition, adds `id`/`x`/`y`/`zIndex: 0`/`trigger: null`, carrying over
  `hitboxPolygon` unchanged since it's already relative to the object's own
  top-left); click anything placed to select it — the inspector shows
  numeric fields, flags, and trigger event/sound, and dragging it on canvas
  moves it (a polygon hitbox, being stored relative to the object, moves
  with it automatically). Click-selection on canvas tests a custom polygon's
  real (possibly concave) shape, not just its bounding rect. A selected
  object also gets two canvas handles, mirroring the Object Maker's hitbox
  tool: a rotate handle above it (Shift snaps to 15°) and a resize handle at
  its bottom-right corner (Shift locks the aspect ratio) — both keep a
  custom `hitboxPolygon` in sync (`scalePolygonPoints` from
  `kinematics-math.js` rescales it with width/height; rotation already
  carries it along for free since it's read pre-rotated in
  `objectHitboxCorners`), and the Width/Height number fields do the same
  rescale so dragging and typing never fall out of sync. "Add checkpoint"
  drops one at the current camera center. Level meta (id/name/bounds/groundY)
  is a plain form. "Save level" downloads `<id>.json` via
  `showSaveFilePicker` where available, falling back to an `<a download>`
  blob link.
- Verified in a headless-browser pass (Edge via CDP, since neither
  `chromium-cli` nor Playwright/Puppeteer were installed in this
  environment): image import, hitbox draw/move/rotate with live field
  sync, flag toggling, object-definition save, level load with correct
  rendering and meta population, object selection + drag, checkpoint
  add, camera pan, and level save — then fed the saved JSON back through
  `validateLevel()` to confirm a clean round-trip. No console errors in
  any step.

### 11. Reserved / explicitly deferred

So these read as deliberate scope cuts, not oversights:

- `instantDamage`'s meaning is a flat kill-on-contact flag; a hazard that
  behaves differently per body part (e.g. survivable for a hand but lethal
  for the head) is reserved and unwired until a level needs it.
- Trigger `event`/`sound` fields exist in the schema but aren't wired to any
  audio playback yet — `playTriggerSound` in `audio/audio.js` stays a no-op
  until a level authors one.

### 12. Audio

`audio/audio.js` plays one-shot SFX via a plain `new Audio(url).play()` per
call — no pooling, since clips are short and don't overlap in practice.
Several events have multiple recorded takes ("variants"); one is picked at
random each time so repeated deaths don't all sound identical:

- **Hurt** (`playHurtSound`, 6 variants) — on every lethal hit, alongside the
  ambulance sound, at `DEAD_AMBULANCE.onEnter`.
- **Ambulance** (`playAmbulanceSound`, single clip) — same moment, the
  ambulance dropping in for the death sequence.
- **Fired** (`playFiredSound`, 2 variants) — `WON.onEnter`, only for the late
  ("You're Fired") variant; the on-time ("Now Get to Work!") ending plays no
  SFX, see §6.

`audio/music.js` owns background music, one playlist per mode
(`game_design.md` §5's `session.mode`), plus a shared `menu` playlist that
isn't a `session.mode` at all — it's just the track for the two
non-gameplay screens:

- **Menu / Credits**: just `Digital_20Lemonade.mp3`, looped — `MENU.onEnter`
  and `CREDITS.onEnter` (§6) both call `startMusic("menu")`, so the track
  keeps playing uninterrupted across a CREDITS → MENU transition instead of
  restarting.
- **Normal**: `Overworld.mp3` → `Pixelland.mp3` → `The_20Builder.mp3`, each
  playing once; an `ended` listener advances to the next and wraps back to
  the first after the last, so the playlist loops as a whole.
- **Hardcore ("I don't need Insurance")**: just `Latin_20Industries.mp3`,
  with `audio.loop = true` directly (a one-track "playlist" has nothing to
  switch to).

All tracks are by Kevin MacLeod (credited on the credits screen).

`startMusic(mode)` is called on every `PLAYING.onEnter` (including a
post-death respawn) but no-ops if that mode's playlist is already the one
running, so a death mid-song doesn't restart the track. `WON.onEnter` calls
`stopMusic()`, so the win screen itself is quiet; music resumes (menu track)
once the player advances off of it, on the next `MENU.onEnter` or
`CREDITS.onEnter`.

The very first `startMusic("menu")` call happens at page load (the state
machine's initial state), before any click/keypress — the browser's autoplay
policy blocks that attempt, so `music.js` also listens once for the first
`pointerdown`/`keydown` anywhere on the page and retries whatever track is
current at that point, rather than staying silent for the rest of the
session.

A mute toggle (`ui/mute-button.js`, the speaker icon button) calls
`toggleMusicMuted`, which sets `.muted` on whichever `Audio` element is
currently playing and on every track that starts after — the underlying
element keeps playing (and `ended` still fires normally), it's just silent.
The preference is remembered in `localStorage` (wrapped in try/catch, since
some private-browsing modes throw on access) so a muted player stays muted
next visit.
