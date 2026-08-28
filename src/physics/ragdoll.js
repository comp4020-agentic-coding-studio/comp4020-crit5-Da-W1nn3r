import { rotateVector } from "./kinematics-math.js";

// Real rigid-body ragdoll: the torso, the four limbs and the head are
// actual Matter.js bodies with mass and gravity, connected by pin-joint
// constraints at the shoulder/hip/neck points. Collisions with the ground
// and level objects are resolved by the physics engine itself — a body part
// physically cannot pass through solid geometry, rather than only being
// checked for overlap after the fact. Matter is passed in explicitly
// (never read from `window` at module scope) so this file stays importable
// under plain Node for spec/crit-5.test.ts. The hands and shoes stay
// slaved/cosmetic rects derived from their parent limb's transform — they
// were never independently posed even in the old kinematic model. The head
// is given a negative mass (see HEAD_MASS/createRagdoll below) purely as a
// gag: it doesn't change how gravity pulls on it (gravitational
// acceleration is mass-independent — the sign cancels), but it does flip
// which way the neck joint's own correction impulse pushes the head to
// close the joint's gap, so instead of hanging like dead weight it floats
// and kicks against the tether. The joint only constrains position though,
// so settleRagdoll() separately locks the head's angle to the torso's every
// tick — rigid, no independent spin — while leaving that floaty position
// alone.
export const ANGULAR_SPEED = Math.PI * 0.7; // rad/s motor speed while a key is held
// Matter's default body density (0.001) made a spinning limb nearly
// massless next to the torso (density 0.004), so the reaction force the
// grounded-limb case (settleRagdoll) feeds back through the pin joint was
// too small to move the torso at all — spinning a leg just spun the leg.
// Heavier limbs (comparable to the torso itself) mean the same motor speed
// now kicks the torso a small but real distance when a grounded limb
// "pushes off". Applies to arms too, for a lying-down player flailing an
// arm against the ground.
export const LIMB_DENSITY = 0.012;
export const TORSO_WIDTH = 24;
export const TORSO_HEIGHT = 56;
export const WAIST_HEIGHT = 18;
export const ARM_WIDTH = 8;
export const ARM_LENGTH = 34;
export const LEG_WIDTH = 10;
export const LEG_LENGTH = 40;
export const HEAD_SIZE = 28; // rendered sprite size
export const HEAD_HITBOX_SIZE = 18; // smaller-than-sprite lethal hitbox, so grazing the art doesn't kill; also the actual physics body's size
export const HEAD_MASS = 0.05; // magnitude only — set negative on the body itself, see createRagdoll
export const HAND_SIZE = 10;
export const SHOE_WIDTH = 16;
export const SHOE_HEIGHT = 8;
export const IDLE_TO_FRONT_FACE_SECONDS = 3;

const SHOULDER_LOCAL_Y = -TORSO_HEIGHT / 2;
const HIP_LOCAL_Y = TORSO_HEIGHT / 2;
const PLAYER_COLLISION_GROUP = -1; // negative group: player parts never collide with each other

// Plain collision bitmasks (Matter doesn't export any named ones). "default"
// is what every ground/solid/hazard level body ends up with, since none of
// them set an explicit collisionFilter — that's Matter's own default
// category. Player parts must list it in their mask to keep colliding with
// that geometry, and also list "ambulance" so the death-sequence ambulance
// (see src/entities/ambulance.js) can land on them for real.
export const COLLISION_CATEGORY = {
  default: 0x0001,
  player: 0x0002,
  ambulance: 0x0004,
};

// Same torso/limb-local anchor points passed to pinJoint() below, looked up
// by limb name so settleRagdoll() can re-derive them for the idle case.
const LIMB_ANCHOR = {
  rightArm: { torso: { x: 0, y: SHOULDER_LOCAL_Y }, limb: { x: 0, y: -ARM_LENGTH / 2 } },
  leftArm: { torso: { x: 0, y: SHOULDER_LOCAL_Y }, limb: { x: 0, y: -ARM_LENGTH / 2 } },
  rightLeg: { torso: { x: 0, y: HIP_LOCAL_Y }, limb: { x: 0, y: -LEG_LENGTH / 2 } },
  leftLeg: { torso: { x: 0, y: HIP_LOCAL_Y }, limb: { x: 0, y: -LEG_LENGTH / 2 } },
};

function pinJoint(Matter, bodyA, pointA, bodyB, pointB) {
  return Matter.Constraint.create({ bodyA, pointA, bodyB, pointB, length: 0, stiffness: 0.85, damping: 0.3 });
}

export function createRagdoll(Matter, startX, groundYAt) {
  const groundY = groundYAt(startX);
  const hipY = groundY - LEG_LENGTH;
  const torsoCenterY = hipY - TORSO_HEIGHT / 2;
  const shoulderY = torsoCenterY + SHOULDER_LOCAL_Y;

  const bodyOptions = {
    // Deliberately far above the usual 0-1 "realistic" range — Matter treats
    // these as plain solver coefficients, not physical constants, and a
    // grounded limb needs to grip hard enough to actually stop the torso's
    // momentum (see settleRagdoll) rather than let it glide.
    friction: 3,
    frictionStatic: 6,
    frictionAir: 0.03,
    restitution: 0,
    collisionFilter: {
      group: PLAYER_COLLISION_GROUP,
      category: COLLISION_CATEGORY.player,
      mask: COLLISION_CATEGORY.default | COLLISION_CATEGORY.ambulance,
    },
  };

  const torso = Matter.Bodies.rectangle(startX, torsoCenterY, TORSO_WIDTH, TORSO_HEIGHT, {
    ...bodyOptions,
    density: 0.004,
    frictionAir: 0.06,
    label: "player:torso",
  });
  const rightArm = Matter.Bodies.rectangle(startX, shoulderY + ARM_LENGTH / 2, ARM_WIDTH, ARM_LENGTH, {
    ...bodyOptions,
    density: LIMB_DENSITY,
    label: "player:rightArm",
  });
  const leftArm = Matter.Bodies.rectangle(startX, shoulderY + ARM_LENGTH / 2, ARM_WIDTH, ARM_LENGTH, {
    ...bodyOptions,
    density: LIMB_DENSITY,
    label: "player:leftArm",
  });
  const rightLeg = Matter.Bodies.rectangle(startX, hipY + LEG_LENGTH / 2, LEG_WIDTH, LEG_LENGTH, {
    ...bodyOptions,
    density: LIMB_DENSITY,
    label: "player:rightLeg",
  });
  const leftLeg = Matter.Bodies.rectangle(startX, hipY + LEG_LENGTH / 2, LEG_WIDTH, LEG_LENGTH, {
    ...bodyOptions,
    density: LIMB_DENSITY,
    label: "player:leftLeg",
  });
  const head = Matter.Bodies.rectangle(startX, shoulderY - HEAD_HITBOX_SIZE / 2, HEAD_HITBOX_SIZE, HEAD_HITBOX_SIZE, {
    ...bodyOptions,
    label: "player:head",
  });
  Matter.Body.setMass(head, -HEAD_MASS);

  const constraints = [
    pinJoint(Matter, torso, { x: 0, y: SHOULDER_LOCAL_Y }, rightArm, { x: 0, y: -ARM_LENGTH / 2 }),
    pinJoint(Matter, torso, { x: 0, y: SHOULDER_LOCAL_Y }, leftArm, { x: 0, y: -ARM_LENGTH / 2 }),
    pinJoint(Matter, torso, { x: 0, y: HIP_LOCAL_Y }, rightLeg, { x: 0, y: -LEG_LENGTH / 2 }),
    pinJoint(Matter, torso, { x: 0, y: HIP_LOCAL_Y }, leftLeg, { x: 0, y: -LEG_LENGTH / 2 }),
    pinJoint(Matter, torso, { x: 0, y: SHOULDER_LOCAL_Y }, head, { x: 0, y: HEAD_HITBOX_SIZE / 2 }),
  ];

  return {
    torso,
    rightArm,
    leftArm,
    rightLeg,
    leftLeg,
    head,
    bodies: [torso, rightArm, leftArm, rightLeg, leftLeg, head],
    constraints,
    idleSeconds: 0,
    // Each limb's rotation is authored relative to the torso, not in world
    // space: this is the angle a key held/released actually changes. It's
    // reapplied on top of the torso's own live angle every tick in
    // settleRagdoll(), so a limb rotates along with the torso as it topples
    // instead of holding a fixed world-space orientation, and — since a key
    // release simply stops this value from changing — a released limb's bend
    // relative to the torso holds exactly, with no drift or decay.
    relativeAngle: { rightArm: 0, leftArm: 0, rightLeg: 0, leftLeg: 0 },
  };
}

function driveLimb(ragdoll, name, input, positiveKey, negativeKey, dt, speedMultiplier) {
  const positive = input.isHeld(positiveKey);
  const negative = input.isHeld(negativeKey);
  if (positive === negative) return false;
  ragdoll.relativeAngle[name] += (positive ? ANGULAR_SPEED : -ANGULAR_SPEED) * speedMultiplier * dt;
  return true;
}

// Integrates each limb's angle-relative-to-torso from this tick's held keys.
// Nothing here touches the Matter bodies directly — settleRagdoll() below
// bakes the result onto the real bodies once the torso's own angle for this
// tick is known (after the physics engine steps). `speedMultiplier` scales
// ANGULAR_SPEED — hardcore ("I don't need Insurance") mode passes 1.5, see
// main.js.
export function applyRagdollInput(ragdoll, input, dt, speedMultiplier = 1) {
  const activity = {
    rightArm: driveLimb(ragdoll, "rightArm", input, "w", "i", dt, speedMultiplier),
    leftArm: driveLimb(ragdoll, "leftArm", input, "s", "k", dt, speedMultiplier),
    rightLeg: driveLimb(ragdoll, "rightLeg", input, "d", "l", dt, speedMultiplier),
    leftLeg: driveLimb(ragdoll, "leftLeg", input, "a", "j", dt, speedMultiplier),
  };
  ragdoll.activity = activity;
  const anyActive = activity.rightArm || activity.leftArm || activity.rightLeg || activity.leftLeg;
  ragdoll.idleSeconds = anyActive ? 0 : ragdoll.idleSeconds + dt;
}

// Runs once per tick, after the physics engine has stepped, so ragdoll.torso
// has this tick's settled angle. Each limb's target is torso.angle +
// relativeAngle — but how a limb reaches it depends on both whether it's
// being actively driven AND whether it's currently touching the ground/an
// object (`touchingBodyIds`, from main.js's collision tracking):
//
// - Actively driven, OR idle but grounded: set an angular VELOCITY that
//   closes the gap over exactly one step (Matter.Body.setAngularVelocity
//   takes radians PER STEP, see ANGULAR_SPEED above, so that's the raw delta
//   with no dt division) and otherwise leave the limb's linear motion alone.
//   Expressing the motion as velocity — applied before the *next*
//   Engine.update — lets Matter's own contact solver see the limb genuinely
//   in contact with the ground and resolve real friction against it, which
//   is exactly what's needed here: a grounded limb has to be able to grip
//   and drag on the torso to stop it sliding, and that only happens if the
//   pin joint is left free to actually transmit force both ways.
// - Idle AND airborne: hold the limb rigidly at its target angle WITHOUT
//   going through the pin-joint's own correction at all. Body.setAngle alone
//   rotates a limb about its own centroid, not the shoulder/hip anchor
//   point, so it quietly displaces the anchor away from the torso's matching
//   point every tick; the joint then has to yank it back, and that
//   correction impulse leaks into the torso via Newton's third law. Because
//   the target angle drifts a little every tick the torso isn't perfectly
//   still (e.g. tipping over mid-fall), that yank never stops firing — a
//   persistent forcing loop that read as the player slowly gliding with no
//   key held. Repositioning the limb's centroid so the anchor point lands
//   exactly on the torso's anchor (rotating "about the joint", not the
//   centroid) means there's never a discrepancy for the joint to correct, so
//   no reaction force leaks into the torso — safe to do only while airborne,
//   since there's no ground contact whose stopping force this would also be
//   throwing away.
export function settleRagdoll(Matter, ragdoll, touchingBodyIds) {
  const torso = ragdoll.torso;

  // The neck pin joint only constrains position, not orientation, so a
  // free head would spin under the joint's torque (worse once its mass is
  // negative — the correction torque comes back inverted). Lock the head's
  // angle to the torso's every tick — rigid, no spin — while leaving its
  // position untouched so the negative-mass joint can still bounce/float it
  // independently. Matching angularVelocity to the torso's (rather than
  // zeroing it) means next tick's implicit rotation is already correct
  // before we override again, so this doesn't fight the solver.
  Matter.Body.setAngle(ragdoll.head, torso.angle);
  Matter.Body.setAngularVelocity(ragdoll.head, torso.angularVelocity);

  for (const name of ["rightArm", "leftArm", "rightLeg", "leftLeg"]) {
    const limb = ragdoll[name];
    const targetAngle = torso.angle + ragdoll.relativeAngle[name];
    const grounded = touchingBodyIds?.has(limb.id);
    if (ragdoll.activity?.[name] || grounded) {
      Matter.Body.setAngularVelocity(limb, targetAngle - limb.angle);
    } else {
      const anchor = LIMB_ANCHOR[name];
      const anchorWorld = worldPoint(torso, anchor.torso.x, anchor.torso.y);
      const limbOffset = rotateVector(anchor.limb.x, anchor.limb.y, targetAngle);
      Matter.Body.setAngle(limb, targetAngle);
      Matter.Body.setPosition(limb, { x: anchorWorld.x - limbOffset.x, y: anchorWorld.y - limbOffset.y });
      Matter.Body.setVelocity(limb, torso.velocity);
      Matter.Body.setAngularVelocity(limb, torso.angularVelocity);
    }
  }
}

function worldPoint(body, localX, localY) {
  const rotated = rotateVector(localX, localY, body.angle);
  return { x: body.position.x + rotated.x, y: body.position.y + rotated.y };
}

function rectFromBody(body, width, height) {
  return { x: body.position.x - width / 2, y: body.position.y - height / 2, width, height, rotation: body.angle };
}

function partRect(body, localY, width, height) {
  const center = worldPoint(body, 0, localY);
  return { x: center.x - width / 2, y: center.y - height / 2, width, height, rotation: body.angle };
}

function limbEndCap(limbBody, limbLength, width, height) {
  const end = worldPoint(limbBody, 0, limbLength / 2);
  return { x: end.x - width / 2, y: end.y - height / 2, width, height, rotation: limbBody.angle };
}

// A static standing pose in the same shape ragdollGeometry() returns, but
// with no Matter body/ragdoll involved at all — for the menu's customization
// preview, which runs before any ragdoll exists (see character-preview.js).
// Centered horizontally on centerX, feet resting on groundY.
export function standingPoseGeometry(centerX, groundY) {
  const hipY = groundY - LEG_LENGTH;
  const torsoCenterY = hipY - TORSO_HEIGHT / 2;
  const shoulderY = torsoCenterY + SHOULDER_LOCAL_Y;
  const bodyHeight = TORSO_HEIGHT - WAIST_HEIGHT;

  const rect = (centerY, width, height) => ({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    rotation: 0,
  });

  return {
    waist: rect(torsoCenterY + TORSO_HEIGHT / 2 - WAIST_HEIGHT / 2, TORSO_WIDTH + 2, WAIST_HEIGHT),
    body: rect(torsoCenterY - TORSO_HEIGHT / 2 + bodyHeight / 2, TORSO_WIDTH, bodyHeight),
    head: rect(shoulderY - HEAD_HITBOX_SIZE / 2, HEAD_SIZE, HEAD_SIZE),
    rightArm: rect(shoulderY + ARM_LENGTH / 2, ARM_WIDTH, ARM_LENGTH),
    leftArm: rect(shoulderY + ARM_LENGTH / 2, ARM_WIDTH, ARM_LENGTH),
    rightLeg: rect(hipY + LEG_LENGTH / 2, LEG_WIDTH, LEG_LENGTH),
    leftLeg: rect(hipY + LEG_LENGTH / 2, LEG_WIDTH, LEG_LENGTH),
    rightHand: rect(shoulderY + ARM_LENGTH, HAND_SIZE, HAND_SIZE),
    leftHand: rect(shoulderY + ARM_LENGTH, HAND_SIZE, HAND_SIZE),
    rightShoe: rect(hipY + LEG_LENGTH, SHOE_WIDTH, SHOE_HEIGHT),
    leftShoe: rect(hipY + LEG_LENGTH, SHOE_WIDTH, SHOE_HEIGHT),
    facingFront: true,
  };
}

// Forward-kinematic geometry for rendering and hitboxes, read fresh each
// tick from the physics bodies' current position/angle — nothing here
// simulates anything itself.
export function ragdollGeometry(ragdoll) {
  const torso = ragdoll.torso;
  const bodyHeight = TORSO_HEIGHT - WAIST_HEIGHT;

  const waist = partRect(torso, TORSO_HEIGHT / 2 - WAIST_HEIGHT / 2, TORSO_WIDTH + 2, WAIST_HEIGHT);
  const body = partRect(torso, -TORSO_HEIGHT / 2 + bodyHeight / 2, TORSO_WIDTH, bodyHeight);
  // The head body's own physical size is HEAD_HITBOX_SIZE (see createRagdoll)
  // so ground/hazard contact matches the tighter hitbox; the rendered sprite
  // is drawn larger (HEAD_SIZE) around that same center.
  const head = rectFromBody(ragdoll.head, HEAD_SIZE, HEAD_SIZE);

  return {
    hip: worldPoint(torso, 0, TORSO_HEIGHT / 2),
    waist,
    body,
    head,
    rightArm: rectFromBody(ragdoll.rightArm, ARM_WIDTH, ARM_LENGTH),
    leftArm: rectFromBody(ragdoll.leftArm, ARM_WIDTH, ARM_LENGTH),
    rightLeg: rectFromBody(ragdoll.rightLeg, LEG_WIDTH, LEG_LENGTH),
    leftLeg: rectFromBody(ragdoll.leftLeg, LEG_WIDTH, LEG_LENGTH),
    rightHand: limbEndCap(ragdoll.rightArm, ARM_LENGTH, HAND_SIZE, HAND_SIZE),
    leftHand: limbEndCap(ragdoll.leftArm, ARM_LENGTH, HAND_SIZE, HAND_SIZE),
    rightShoe: limbEndCap(ragdoll.rightLeg, LEG_LENGTH, SHOE_WIDTH, SHOE_HEIGHT),
    leftShoe: limbEndCap(ragdoll.leftLeg, LEG_LENGTH, SHOE_WIDTH, SHOE_HEIGHT),
    facingFront: ragdoll.idleSeconds >= IDLE_TO_FRONT_FACE_SECONDS,
  };
}
