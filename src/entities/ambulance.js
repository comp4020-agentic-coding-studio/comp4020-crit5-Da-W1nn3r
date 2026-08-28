import { COLLISION_CATEGORY } from "../physics/ragdoll.js";

const SPAWN_Y = -400;
const WIDTH = 180;
const HEIGHT = 120;

// A real Matter body: falls from the sky under the world's own gravity and
// crashes into the ragdoll for real, rather than a scripted fall + overlap
// check against a fixed point. Physics keeps running through the whole
// death sequence (see main.js), so this is a genuine collision, not an
// animation. Its mask starts as just the player's category — "default"
// (the category every ground/solid/hazard level body ends up with, since
// none of them set an explicit collisionFilter; see ragdoll.js's
// COLLISION_CATEGORY comment) is deliberately left out, so the ambulance
// falls straight through any ground/solid geometry between its spawn point
// and the player instead of landing on it and never reaching them (that
// used to leave ambulanceHitFlag unset forever, so the death screen never
// showed). Once main.js's collisionStart handler sees it actually touch the
// player, it widens the mask to include "default" too, so the ambulance
// then settles on the ground for real like any other body for the rest of
// the death sequence.
export function createAmbulance(Matter, world, x) {
  const body = Matter.Bodies.rectangle(x, SPAWN_Y, WIDTH, HEIGHT, {
    label: "ambulance",
    friction: 3,
    collisionFilter: {
      category: COLLISION_CATEGORY.ambulance,
      mask: COLLISION_CATEGORY.player,
    },
  });
  Matter.Composite.add(world, body);
  return body;
}

// Called once the ambulance's own collisionStart fires against the player —
// re-enables collision with ground/solid geometry so it settles for real
// instead of staying passed-through forever.
export function enableAmbulanceGroundCollision(ambulance) {
  ambulance.collisionFilter.mask |= COLLISION_CATEGORY.default;
}

export function removeAmbulance(Matter, world, ambulance) {
  if (ambulance) Matter.Composite.remove(world, ambulance);
}

// Rect shape (top-left origin) for the renderer, read fresh from the body's
// current position/angle each frame — same convention as ragdollGeometry.
export function ambulanceGeometry(ambulance) {
  return {
    x: ambulance.position.x - WIDTH / 2,
    y: ambulance.position.y - HEIGHT / 2,
    width: WIDTH,
    height: HEIGHT,
    rotation: ambulance.angle,
  };
}
