// The shape every level (this game's, and the future editor's) reads and
// writes. Kept as plain-object defaults/validation, not a class, so a level
// is just JSON with no behaviour attached.

export function defaultLevel() {
  return {
    id: "untitled",
    name: "Untitled level",
    bounds: { minX: 0, maxX: 2000 },
    groundY: 500,
    start: { x: 100, y: 500 },
    checkpoints: [],
    end: { x: 1900, y: 500, width: 100, height: 300 },
    objects: [],
  };
}

// Exported so the editor's object maker can start a new definition with the
// same defaults the game loader would fill in for a partial one.
export function defaultObjectFlags() {
  return { hitbox: false, instantDamage: false, physics: false, physicsWithEvent: false };
}

// A `hitboxPolygon` must be at least a triangle of plain {x,y} points to be
// usable — anything else (missing, malformed, hand-edited into garbage)
// falls back to null, which means "use the object's own rect as its
// hitbox" (see kinematics-math.js's objectHitboxCorners).
function validateHitboxPolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return null;
  const points = polygon.map((point) => ({ x: Number(point?.x), y: Number(point?.y) }));
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  return points;
}

// Fills in anything missing so a hand-written or partially-authored level
// JSON never crashes the loader — it just gets sane defaults for what it
// left out.
export function validateLevel(json) {
  const base = defaultLevel();
  const level = { ...base, ...json };
  level.bounds = { ...base.bounds, ...json.bounds };
  level.start = { ...base.start, ...json.start };
  level.end = { ...base.end, ...json.end };
  level.checkpoints = (json.checkpoints ?? []).map((cp) => ({ id: cp.id, x: cp.x, y: cp.y }));
  level.objects = (json.objects ?? []).map((object) => ({
    id: object.id,
    sprite: object.sprite,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation ?? 0,
    zIndex: object.zIndex ?? 0,
    flags: { ...defaultObjectFlags(), ...object.flags },
    trigger: object.trigger ?? null,
    hitboxPolygon: validateHitboxPolygon(object.hitboxPolygon),
  }));
  return level;
}
