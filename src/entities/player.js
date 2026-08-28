import { createRagdoll, ragdollGeometry, applyRagdollInput, settleRagdoll } from "../physics/ragdoll.js";

function ragdollParts(ragdoll) {
  return [...ragdoll.bodies, ...ragdoll.constraints];
}

export function createPlayer(Matter, world, spawn, customization, groundYAt) {
  const ragdoll = createRagdoll(Matter, spawn.x, groundYAt);
  Matter.Composite.add(world, ragdollParts(ragdoll));
  return { ragdoll, customization };
}

// Applies this tick's held-key motors to the limb bodies. Stepping the
// physics engine itself happens once, globally, in main.js. `speedMultiplier`
// scales limb spin speed — hardcore mode runs faster, see main.js.
export function updatePlayer(player, input, dt, speedMultiplier = 1) {
  applyRagdollInput(player.ragdoll, input, dt, speedMultiplier);
}

// Called once per tick, after the physics engine has stepped, to drive each
// limb's angle back toward its target relative to the torso. `touchingBodyIds`
// (from main.js's collision tracking) is which limbs are currently resting
// on the ground/an object, so a grounded limb can grip instead of being
// kinematically locked to the torso — see settleRagdoll.
export function settlePlayer(Matter, player, touchingBodyIds) {
  settleRagdoll(Matter, player.ragdoll, touchingBodyIds);
}

// Called once on death. Physics keeps running afterwards (see main.js), but
// nothing should still be reading key input into the ragdoll's limb motors
// — without this, a limb whose key was still held on the fatal tick would
// keep spinning under its own motor forever instead of going fully passive.
export function releasePlayerControl(player) {
  player.ragdoll.activity = { rightArm: false, leftArm: false, rightLeg: false, leftLeg: false };
}

export function respawnPlayer(Matter, world, player, spawn, groundYAt) {
  Matter.Composite.remove(world, ragdollParts(player.ragdoll));
  player.ragdoll = createRagdoll(Matter, spawn.x, groundYAt);
  Matter.Composite.add(world, ragdollParts(player.ragdoll));
}

export function removePlayer(Matter, world, player) {
  Matter.Composite.remove(world, ragdollParts(player.ragdoll));
}

export function playerGeometry(player) {
  return ragdollGeometry(player.ragdoll);
}

export function torsoPoint(player) {
  return playerGeometry(player).hip;
}
