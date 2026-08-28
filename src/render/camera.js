import { clamp } from "../physics/kinematics-math.js";

const LOAD_MARGIN = 500;

export function createCamera(viewportWidth, viewportHeight) {
  return { x: 0, y: 0, width: viewportWidth, height: viewportHeight };
}

// Both axes follow the player with the same clamp-to-bounds formula, even
// though the barebones level is flat, so a non-flat level later doesn't
// need this module reworked (game_design.md §7).
export function followPlayer(camera, target, bounds, groundYAt) {
  const maxX = Math.max(bounds.minX, bounds.maxX - camera.width);
  camera.x = clamp(target.x - camera.width / 2, bounds.minX, maxX);

  const targetGroundY = groundYAt(target.x);
  camera.y = clamp(target.y - camera.height / 2, targetGroundY - camera.height, targetGroundY);
}

// Objects outside the loaded region get no update and no collision test —
// a scope/performance mechanism, invisible on this small level but present
// from the start.
export function isInLoadedRegion(camera, x) {
  return x >= camera.x - LOAD_MARGIN && x <= camera.x + camera.width + LOAD_MARGIN;
}
