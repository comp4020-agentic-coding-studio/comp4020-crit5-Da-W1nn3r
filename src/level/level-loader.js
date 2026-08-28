import { validateLevel } from "./level-schema.js";
import { getHitboxTriangles } from "../physics/kinematics-math.js";

// Fetches over http(s), so this works identically under `pnpm dev` and on
// GitHub Pages — never opened as a bare file:// document.
export async function loadLevel(url) {
  const response = await fetch(url);
  const json = await response.json();
  const data = validateLevel(json);
  return createLevelView(data);
}

function createLevelView(data) {
  // Level objects never move after load (physics/physicsWithEvent are
  // reserved/unwired — see game_design.md §8), so triangulating a polygon
  // hitbox is a one-time load-time cost, not a per-tick one. Objects
  // without a custom polygon are left untouched (their rect stays the
  // cheap rect-vs-rect path in collision/hitbox.js and main.js).
  const objects = data.objects.map((object) =>
    object.hitboxPolygon ? { ...object, hitboxTriangles: getHitboxTriangles(object) } : object,
  );
  return {
    ...data,
    objects,
    groundYAt(_x) {
      // Barebones level is flat; kept as a function of x so a future level
      // with varying terrain doesn't require callers to change.
      return data.groundY;
    },
    objectsNear(x, margin) {
      return objects.filter((object) => object.x + object.width >= x - margin && object.x <= x + margin);
    },
  };
}
