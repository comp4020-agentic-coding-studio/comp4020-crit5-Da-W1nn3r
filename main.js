// Hand-written entry point, loaded as a module by index.html. No build step
// compiles this --- what's here is what ships.
//
// `outcomeOf` is re-exported so spec/crit-5.test.ts can import it directly
// under plain Node/vitest (no DOM, no `window.Matter`). Everything else
// below only runs once `start()` is called from the DOMContentLoaded guard
// at the bottom, so this module never touches `document`/`window`/canvas
// just by being imported.
export { outcomeOf } from "./src/rules/outcome.js";

import { outcomeOf } from "./src/rules/outcome.js";
import { createLoop } from "./src/engine/loop.js";
import { createStateMachine } from "./src/engine/state-machine.js";
import { createInput } from "./src/input/input.js";
import { createCamera, followPlayer, isInLoadedRegion } from "./src/render/camera.js";
import { createSprites } from "./src/render/sprites.js";
import { render } from "./src/render/renderer.js";
import { loadLevel } from "./src/level/level-loader.js";
import { createLevelObjects } from "./src/entities/level-object.js";
import { createAmbulance, removeAmbulance, ambulanceGeometry, enableAmbulanceGroundCollision } from "./src/entities/ambulance.js";
import {
  createPlayer,
  playerGeometry,
  releasePlayerControl,
  removePlayer,
  respawnPlayer,
  settlePlayer,
  torsoPoint,
  updatePlayer,
} from "./src/entities/player.js";
import { anyPartHitsHazard, checkpointTriggerRect, pointReachedTrigger } from "./src/collision/hitbox.js";
import { getHitboxTriangles, objectHitboxCorners, verticesMean } from "./src/physics/kinematics-math.js";
import { defaultCustomization } from "./src/customization/customization.js";
import { setupMenu } from "./src/ui/menu.js";
import { setupCharacterPreview } from "./src/ui/character-preview.js";
import { setupHud } from "./src/ui/hud.js";
import { setupDeathScreen } from "./src/ui/death-screen.js";
import { setupWinScreen } from "./src/ui/win-screen.js";
import { setupCreditsScreen } from "./src/ui/credits-screen.js";
import { setupPauseScreen } from "./src/ui/pause-screen.js";
import { setupMuteButton } from "./src/ui/mute-button.js";
import { playAmbulanceSound, playFiredSound, playHurtSound, playTriggerSound } from "./src/audio/audio.js";
import { isMusicMuted, pauseMusic, resumeMusic, startMusic, stopMusic, toggleMusicMuted } from "./src/audio/music.js";
import { recordTime } from "./src/state/best-times.js";

// A key press is required to leave the death/win screens, but not the very
// tick they appear on — otherwise the same key that caused the fall (still
// "just pressed" on that tick) would insta-skip the screen.
const DEAD_BILL_MIN_SECONDS = 0.6;
const NEARBY_OBJECT_MARGIN = 500;
const GROUND_THICKNESS = 1000;
const GROUND_MARGIN = 4000;
// Scales the whole engine's gravity, so this affects every non-static body
// in the Matter world equally: the player's ragdoll, the death-sequence
// ambulance once it exists, and any level object flagged `physics` — all
// float a bit more than Matter's plain default would give them.
const PLAYER_GRAVITY_SCALE = 0.6;
// Hardcore ("I don't need Insurance") mode spins limbs 50% faster.
const HARDCORE_LIMB_SPEED_MULTIPLIER = 1.5;
// Reaching work with this much or less on the clock earns the "on time"
// ending (and credits) instead of the "late, fired" one.
const WIN_ON_TIME_SECONDS = 300;
// Toggles the pause menu, but only while PLAYING — see `update`.
const PAUSE_KEY = "escape";

// A fixed logical resolution, scaled (letterboxed) to fit whatever window
// size the browser gives us, so the game always shows the same extent of
// the level rather than revealing more/less world on resize.
const VIRTUAL_WIDTH = 1280;
const VIRTUAL_HEIGHT = 720;

function endTriggerRect(end) {
  return { x: end.x, y: end.y - end.height, width: end.width, height: end.height };
}

// Builds the Matter body for one level object, static (`hitbox`) or dynamic
// (`physics`) — same shape either way. A plain rect, or, for a custom
// (possibly concave) hitbox polygon, a compound body of one convex-triangle
// part per ear-clipped triangle, already rotated into world space (see
// kinematics-math.js) — no `poly-decomp` dependency needed even for a
// concave shape, the same trick most engines use for concave geometry.
function buildObjectBody(Matter, object, isStatic) {
  const label = object.flags.instantDamage ? "hazard" : "solid";
  if (!object.hitboxPolygon) {
    return Matter.Bodies.rectangle(
      object.x + object.width / 2,
      object.y + object.height / 2,
      object.width,
      object.height,
      { isStatic, angle: object.rotation ?? 0, friction: 3, label },
    );
  }
  if (!isStatic) {
    // A dynamic body stays a single convex part instead of the ear-clipped
    // triangle-fan compound below: many small parts glued together rest/
    // roll with visible jitter, since each part's edge can register its
    // own slightly-misaligned contact against the ground at the same
    // instant, and the resulting impulses fight each other every step. A
    // falling/rolling prop doesn't need the same concave precision a
    // static blocker does, so Matter is given the whole polygon and just
    // takes its convex hull.
    const corners = objectHitboxCorners(object);
    const center = verticesMean(corners);
    return Matter.Bodies.fromVertices(center.x, center.y, [corners], { friction: 3, label });
  }
  const parts = getHitboxTriangles(object).map((triangle) => {
    const mean = verticesMean(triangle);
    return Matter.Bodies.fromVertices(mean.x, mean.y, [triangle], { friction: 3 });
  });
  return Matter.Body.create({ parts, isStatic, friction: 3, label });
}

// Returns the { object, body } pairs for every `physics`-flagged object, so
// the caller can sync each object's rendered x/y/rotation from its body's
// live position/angle every tick (see stepPhysics) — the same "read the
// live body fresh" convention ambulanceGeometry/playerGeometry already use.
function buildWorldBodies(Matter, world, level, levelObjects) {
  const groundBody = Matter.Bodies.rectangle(
    (level.bounds.minX + level.bounds.maxX) / 2,
    level.groundY + GROUND_THICKNESS / 2,
    level.bounds.maxX - level.bounds.minX + GROUND_MARGIN,
    GROUND_THICKNESS,
    { isStatic: true, friction: 3, label: "ground" },
  );
  Matter.Composite.add(world, groundBody);

  // Any object flagged `hitbox` becomes a static solid — the physics engine
  // itself stops the player's real (torso/arm/leg) bodies from passing
  // through it. Any object flagged `physics` instead gets a real dynamic
  // body of its own, so it falls under the world's gravity and collides
  // with the ground/other solids/the player/the ambulance for real —
  // checked first since that subsumes whatever a `hitbox` flag on the same
  // object would otherwise have built here. Either way, `instantDamage`
  // additionally labels the body "hazard" so the collision-event listener
  // below can flag contact with it as lethal.
  const physicsObjects = [];
  for (const object of levelObjects) {
    if (object.flags.physics) {
      const body = buildObjectBody(Matter, object, false);
      Matter.Composite.add(world, body);
      physicsObjects.push({ object, body });
      continue;
    }
    if (!object.flags.hitbox) continue;
    Matter.Composite.add(world, buildObjectBody(Matter, object, true));
  }
  return physicsObjects;
}

function isPlayerBody(body) {
  return typeof body.label === "string" && body.label.startsWith("player:");
}

function isPlayerHead(body) {
  return body.label === "player:head";
}

function isGroundOrSolid(body) {
  return body.label === "ground" || body.label === "solid";
}

function adjustGroundContact(groundContactCounts, pair, delta) {
  const { bodyA, bodyB } = pair;
  const playerBody = isPlayerBody(bodyA) && isGroundOrSolid(bodyB) ? bodyA : isPlayerBody(bodyB) && isGroundOrSolid(bodyA) ? bodyB : null;
  if (!playerBody) return;
  const next = (groundContactCounts.get(playerBody.id) ?? 0) + delta;
  if (next <= 0) groundContactCounts.delete(playerBody.id);
  else groundContactCounts.set(playerBody.id, next);
}

async function start() {
  const Matter = window.Matter;
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = VIRTUAL_WIDTH;
  canvas.height = VIRTUAL_HEIGHT;
  const camera = createCamera(VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

  function resizeCanvas() {
    const scale = Math.min(window.innerWidth / VIRTUAL_WIDTH, window.innerHeight / VIRTUAL_HEIGHT);
    const displayWidth = VIRTUAL_WIDTH * scale;
    const displayHeight = VIRTUAL_HEIGHT * scale;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.style.left = `${(window.innerWidth - displayWidth) / 2}px`;
    canvas.style.top = `${(window.innerHeight - displayHeight) / 2}px`;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const level = await loadLevel(new URL("./assets/levels/level.json", import.meta.url));
  const sprites = createSprites(new URL("./assets/", import.meta.url));
  const levelObjects = createLevelObjects(level, (path) => new URL(path, import.meta.url).href);

  const engine = Matter.Engine.create();
  engine.gravity.scale *= PLAYER_GRAVITY_SCALE;
  const world = engine.world;
  const physicsObjects = buildWorldBodies(Matter, world, level, levelObjects);

  // The torso/arms/legs are real Matter bodies, so their contact with the
  // ground or a solid object is resolved physically (they simply can't pass
  // through it) — no death there. Contact with a "hazard" body is still an
  // instant, unrecoverable loss, latched here and consumed/reset each tick.
  let hazardHitFlag = false;
  // The head is also a real Matter body, but unlike the torso/limbs it's
  // still lethal on ground/solid contact ("don't hit your head on
  // obstacles/ground") — it just no longer needs a separate rect-overlap
  // check to catch that, since it's a real collision now too.
  let headContactHitFlag = false;
  // Set by the real ambulance body's own collisionStart against the player
  // (see below) — replaces the old scripted "touches a fixed hip point" check.
  let ambulanceHitFlag = false;
  // Counts, per player-body id, how many ground/solid bodies it's currently
  // touching — a count above zero is what settlePlayer/settleRagdoll uses to
  // decide an idle limb should grip via the physics solver instead of being
  // kinematically locked to the torso. A count (not a flag) so a body resting
  // across two overlapping solids doesn't lose its grip the instant either
  // one individually ends contact.
  const groundContactCounts = new Map();
  Matter.Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      const hazardTouchedByPlayer =
        (isPlayerBody(bodyA) && bodyB.label === "hazard") || (isPlayerBody(bodyB) && bodyA.label === "hazard");
      if (hazardTouchedByPlayer) hazardHitFlag = true;
      const headTouchedGroundOrSolid =
        (isPlayerHead(bodyA) && isGroundOrSolid(bodyB)) || (isPlayerHead(bodyB) && isGroundOrSolid(bodyA));
      if (headTouchedGroundOrSolid) headContactHitFlag = true;
      const ambulanceTouchedPlayer =
        (isPlayerBody(bodyA) && bodyB.label === "ambulance") || (isPlayerBody(bodyB) && bodyA.label === "ambulance");
      if (ambulanceTouchedPlayer) {
        ambulanceHitFlag = true;
        enableAmbulanceGroundCollision(bodyA.label === "ambulance" ? bodyA : bodyB);
      }
      adjustGroundContact(groundContactCounts, pair, 1);
    }
  });
  Matter.Events.on(engine, "collisionEnd", (event) => {
    for (const pair of event.pairs) {
      adjustGroundContact(groundContactCounts, pair, -1);
    }
  });

  const input = createInput(window);
  const customization = defaultCustomization();
  const session = {
    mode: "normal",
    lastCheckpoint: null,
    deathCount: 0,
    elapsedTime: 0,
    touchedCheckpoints: new Set(),
  };

  let player = null;
  let ambulance = null;
  let deadBillTimer = 0;
  let onTimeEnding = false;
  // Layered on top of the state machine rather than a state of its own: a
  // PAUSED state would re-enter PLAYING through its onEnter, which always
  // respawns the player (see PLAYING.onEnter) — wrong for a plain resume.
  let paused = false;

  function spawnPoint() {
    return session.lastCheckpoint ?? level.start;
  }

  const characterPreview = setupCharacterPreview({ customization, sprites });
  const menu = setupMenu({
    customization,
    onStart: () => stateMachine.transitionTo("PLAYING"),
    onModeChange: (mode) => {
      session.mode = mode;
    },
    onChange: characterPreview.render,
  });
  const hud = setupHud();
  const deathScreen = setupDeathScreen();
  const winScreen = setupWinScreen();
  const creditsScreen = setupCreditsScreen();
  setupMuteButton({ isMuted: isMusicMuted, onToggle: toggleMusicMuted });

  function setPaused(value) {
    paused = value;
    if (paused) {
      pauseScreen.show();
      pauseMusic();
    } else {
      pauseScreen.hide();
      resumeMusic();
    }
  }

  const pauseScreen = setupPauseScreen({
    onResume: () => setPaused(false),
    onRestart: () => {
      session.deathCount = 0;
      session.elapsedTime = 0;
      session.lastCheckpoint = null;
      session.touchedCheckpoints.clear();
      hazardHitFlag = false;
      headContactHitFlag = false;
      groundContactCounts.clear();
      respawnPlayer(Matter, world, player, spawnPoint(), level.groundYAt);
      setPaused(false);
    },
    onQuit: () => {
      setPaused(false);
      removeAmbulance(Matter, world, ambulance);
      ambulance = null;
      if (player) removePlayer(Matter, world, player);
      player = null;
      session.deathCount = 0;
      session.elapsedTime = 0;
      session.lastCheckpoint = null;
      session.touchedCheckpoints.clear();
      hud.hide();
      stateMachine.transitionTo("MENU");
    },
  });

  const handlers = {
    MENU: {
      onEnter() {
        menu.show();
        hud.hide();
        startMusic("menu");
      },
      onExit() {
        menu.hide();
      },
    },
    PLAYING: {
      onEnter() {
        if (player) {
          respawnPlayer(Matter, world, player, spawnPoint(), level.groundYAt);
        } else {
          player = createPlayer(Matter, world, spawnPoint(), customization, level.groundYAt);
        }
        hazardHitFlag = false;
        headContactHitFlag = false;
        groundContactCounts.clear();
        removeAmbulance(Matter, world, ambulance);
        ambulance = null;
        hud.show();
        startMusic(session.mode);
      },
    },
    DEAD_AMBULANCE: {
      onEnter() {
        releasePlayerControl(player);
        ambulanceHitFlag = false;
        ambulance = createAmbulance(Matter, world, torsoPoint(player).x);
        playHurtSound();
        playAmbulanceSound();
      },
    },
    DEAD_BILL: {
      onEnter() {
        deadBillTimer = 0;
        deathScreen.show();
      },
      onExit() {
        deathScreen.hide();
      },
    },
    WON: {
      onEnter() {
        hud.hide();
        onTimeEnding = session.elapsedTime <= WIN_ON_TIME_SECONDS;
        recordTime(session.mode, session.elapsedTime);
        winScreen.show(session.elapsedTime, session.deathCount, onTimeEnding);
        if (!onTimeEnding) playFiredSound();
        stopMusic();
      },
      onExit() {
        winScreen.hide();
        if (player) removePlayer(Matter, world, player);
        session.deathCount = 0;
        session.elapsedTime = 0;
        session.lastCheckpoint = null;
        session.touchedCheckpoints.clear();
        player = null;
      },
    },
    CREDITS: {
      onEnter() {
        creditsScreen.show();
        startMusic("menu");
      },
      onExit() {
        creditsScreen.hide();
      },
    },
  };

  const stateMachine = createStateMachine("MENU", handlers, {});

  // Steps the physics world and re-derives the camera/ragdoll pose from it.
  // Called every tick regardless of state (PLAYING, or the death sequence)
  // so the ragdoll — and, once it exists, the ambulance — keep falling,
  // settling and colliding for real instead of freezing the instant the
  // player dies.
  function stepPhysics(dt) {
    Matter.Engine.update(engine, dt * 1000);
    settlePlayer(Matter, player, groundContactCounts);
    followPlayer(camera, torsoPoint(player), level.bounds, level.groundYAt);
    for (const { object, body } of physicsObjects) {
      object.x = body.position.x - object.width / 2;
      object.y = body.position.y - object.height / 2;
      object.rotation = body.angle;
    }
  }

  function updatePlaying(dt) {
    const limbSpeedMultiplier = session.mode === "hardcore" ? HARDCORE_LIMB_SPEED_MULTIPLIER : 1;
    updatePlayer(player, input, dt, limbSpeedMultiplier);
    stepPhysics(dt);
    session.elapsedTime += dt;

    const geometry = playerGeometry(player);
    const nearbyObjects = level.objectsNear(player.ragdoll.torso.position.x, NEARBY_OBJECT_MARGIN);
    const cosmeticHazardHit = anyPartHitsHazard(
      [geometry.rightHand, geometry.leftHand, geometry.rightShoe, geometry.leftShoe],
      nearbyObjects,
    );
    const bodyHit = cosmeticHazardHit || hazardHitFlag || headContactHitFlag;

    const torso = torsoPoint(player);
    for (const checkpoint of level.checkpoints) {
      if (session.touchedCheckpoints.has(checkpoint.id)) continue;
      if (!pointReachedTrigger(torso, checkpointTriggerRect(checkpoint))) continue;
      session.touchedCheckpoints.add(checkpoint.id);
      if (session.mode === "normal") session.lastCheckpoint = { x: checkpoint.x, y: checkpoint.y };
      playTriggerSound("checkpoint");
    }

    const reachedWork = pointReachedTrigger(torso, endTriggerRect(level.end));
    const outcome = outcomeOf({ bodyHit, reachedWork });

    if (outcome === "lost") {
      session.deathCount += 1;
      stateMachine.transitionTo("DEAD_AMBULANCE");
    } else if (outcome === "won") {
      stateMachine.transitionTo("WON");
    }

    hud.update(session.elapsedTime, session.deathCount);
  }

  function update(dt) {
    const state = stateMachine.getState();

    // Pausing/resuming only makes sense mid-run, and is handled outside the
    // switch below so it can short-circuit updatePlaying/stepPhysics for the
    // rest of this tick without touching the state machine (see `paused`).
    if (state === "PLAYING") {
      if (input.isJustPressed(PAUSE_KEY)) setPaused(!paused);
      else if (!paused) updatePlaying(dt);
      input.endTick();
      return;
    }

    switch (state) {
      case "DEAD_AMBULANCE":
        stepPhysics(dt);
        if (ambulanceHitFlag) stateMachine.transitionTo("DEAD_BILL");
        break;
      case "DEAD_BILL":
        stepPhysics(dt);
        deadBillTimer += dt;
        if (deadBillTimer >= DEAD_BILL_MIN_SECONDS && input.hasAnyJustPressed()) {
          stateMachine.transitionTo("PLAYING");
        }
        break;
      case "WON":
        if (input.hasAnyJustPressed()) {
          stateMachine.transitionTo(onTimeEnding ? "CREDITS" : "MENU");
        }
        break;
      case "CREDITS":
        if (input.hasAnyJustPressed()) stateMachine.transitionTo("MENU");
        break;
    }
    input.endTick();
  }

  function renderFrame() {
    const currentState = stateMachine.getState();
    if (currentState === "MENU" || currentState === "CREDITS") return;
    const visibleObjects = levelObjects.filter((object) => isInLoadedRegion(camera, object.x));
    render(ctx, canvas, {
      camera,
      level,
      levelObjects: visibleObjects,
      player,
      ambulance: ambulance ? ambulanceGeometry(ambulance) : null,
      sprites,
      touchedCheckpoints: session.touchedCheckpoints,
      customization,
      hideCheckpoints: session.mode === "hardcore",
    });
  }

  createLoop(update, renderFrame).start();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", start);
}
