import { pointInRect, rotatedRectsOverlap, polygonsOverlap, rectCorners, getHitboxTriangles } from "../physics/kinematics-math.js";

export function partHitsObject(partRect, object) {
  if (!object.flags.hitbox || !object.flags.instantDamage) return false;
  // Plain rect hitbox (the common case): the old, cheap rect-vs-rect SAT.
  // A custom polygon (possibly concave) is tested as the union of its
  // ear-clipped triangles instead — see kinematics-math.js.
  if (!object.hitboxPolygon) return rotatedRectsOverlap(partRect, object);
  const partCorners = rectCorners(partRect);
  return getHitboxTriangles(object).some((triangle) => polygonsOverlap(partCorners, triangle));
}

// Hazard/ground contact for the torso, limbs and head is caught by the
// physics engine's own collision events (see main.js) — they're all real
// Matter bodies now. This checks only the cosmetic, non-physics-backed
// rects (hands, shoes) by rect overlap.
export function anyPartHitsHazard(rects, nearbyObjects) {
  return rects.some((rect) => nearbyObjects.some((object) => partHitsObject(rect, object)));
}

export function pointReachedTrigger(point, triggerRect) {
  return pointInRect(point, triggerRect);
}

const CHECKPOINT_TRIGGER_SIZE = { width: 40, height: 80 };

export function checkpointTriggerRect(checkpoint) {
  return {
    x: checkpoint.x - CHECKPOINT_TRIGGER_SIZE.width / 2,
    y: checkpoint.y - CHECKPOINT_TRIGGER_SIZE.height,
    width: CHECKPOINT_TRIGGER_SIZE.width,
    height: CHECKPOINT_TRIGGER_SIZE.height,
  };
}
