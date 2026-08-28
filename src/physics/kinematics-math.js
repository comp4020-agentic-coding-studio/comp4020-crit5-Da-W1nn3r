export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Rotates a local-space vector by `angle` radians.
export function rotateVector(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

// A rotated rect is stored as its top-left corner *before* rotation, plus
// width/height/rotation — the same shape the level schema and editor use.
// Corner math always rotates around the rect's own center.
export function rectCorners(rect) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const rotation = rect.rotation ?? 0;
  const local = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((point) => {
    const rotated = rotateVector(point.x, point.y, rotation);
    return { x: cx + rotated.x, y: cy + rotated.y };
  });
}

function edgeAxes(corners) {
  const axes = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const length = Math.hypot(edge.x, edge.y) || 1;
    // The outward normal of this edge, normalized.
    axes.push({ x: -edge.y / length, y: edge.x / length });
  }
  return axes;
}

function project(corners, axis) {
  const dots = corners.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...dots), max: Math.max(...dots) };
}

// Separating Axis Theorem test for two arbitrary CONVEX polygons, given as
// their corner arrays already in world space. Only correct for convex
// shapes — a concave hitbox is tested as the union of its ear-clipped
// triangles instead (see getHitboxTriangles below).
export function polygonsOverlap(cornersA, cornersB) {
  const axes = [...edgeAxes(cornersA), ...edgeAxes(cornersB)];
  for (const axis of axes) {
    const projA = project(cornersA, axis);
    const projB = project(cornersB, axis);
    if (projA.max < projB.min || projB.max < projA.min) return false;
  }
  return true;
}

// Kept as a thin wrapper — most callers just have two rects.
export function rotatedRectsOverlap(rectA, rectB) {
  return polygonsOverlap(rectCorners(rectA), rectCorners(rectB));
}

export function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

// Rotates `point` about `center` by `angle` radians.
export function rotatePoint(point, center, angle) {
  const local = rotateVector(point.x - center.x, point.y - center.y, angle);
  return { x: center.x + local.x, y: center.y + local.y };
}

// World-space hitbox corners for a level object. `hitboxPolygon` points are
// stored relative to the object's own top-left — the same frame-independent
// [0, width] x [0, height] box that `width`/`height` describe — so the same
// object definition still works after being placed at a different x/y, and
// dragging a placed object in the level editor carries its polygon with it
// instead of leaving it stranded at the old absolute position. Falls back to
// the rect's own corners when no polygon was authored (today's behavior,
// unchanged).
export function objectHitboxCorners(object) {
  const polygon = object.hitboxPolygon;
  if (Array.isArray(polygon) && polygon.length >= 3) {
    const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
    const rotation = object.rotation ?? 0;
    return polygon.map((point) => rotatePoint({ x: object.x + point.x, y: object.y + point.y }, center, rotation));
  }
  return rectCorners(object);
}

// Scales polygon points about their own origin (the object's top-left) —
// used when an object's width/height changes so `hitboxPolygon` (already
// relative to that origin) stays aligned with the resized box.
export function scalePolygonPoints(points, scaleX, scaleY) {
  return points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
}

function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

// Assumes CCW winding (see triangulatePolygon, which normalizes to it).
function isConvexVertex(prev, curr, next) {
  const cross = (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x);
  return cross > 0;
}

function pointInTriangle(p, a, b, c) {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// Ear-clipping triangulation of a simple polygon (convex or concave, either
// winding). SAT only works on convex shapes, so every other polygon check
// (collision, physics-body construction) treats a hitbox as the union of
// these triangles rather than handling concave shapes directly.
export function triangulatePolygon(points) {
  if (points.length < 3) return [];
  if (points.length === 3) return [points];
  const poly = points.slice();
  if (signedArea(poly) < 0) poly.reverse();
  const indices = poly.map((_, i) => i);
  const triangles = [];
  let guard = 0;
  while (indices.length > 3 && guard++ < poly.length * poly.length) {
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const iPrev = indices[(i - 1 + indices.length) % indices.length];
      const iCurr = indices[i];
      const iNext = indices[(i + 1) % indices.length];
      const prev = poly[iPrev];
      const curr = poly[iCurr];
      const next = poly[iNext];
      if (!isConvexVertex(prev, curr, next)) continue;
      const containsOther = indices.some(
        (j) => j !== iPrev && j !== iCurr && j !== iNext && pointInTriangle(poly[j], prev, curr, next),
      );
      if (containsOther) continue;
      triangles.push([prev, curr, next]);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    // Degenerate/self-intersecting input (shouldn't happen — the editor
    // refuses to close those) — stop rather than loop forever.
    if (!clipped) break;
  }
  if (indices.length === 3) triangles.push([poly[indices[0]], poly[indices[1]], poly[indices[2]]]);
  return triangles;
}

// The point Matter.Bodies.fromVertices should be given as its (x, y) so it
// doesn't recentre (and thereby silently shift) an off-centre triangle.
export function verticesMean(points) {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// The single accessor everything else should call: uses a precomputed cache
// when the caller already has one (real game objects, cached once at level
// load — see level-loader.js) or triangulates on the fly (editor context,
// not perf-sensitive).
export function getHitboxTriangles(object) {
  if (Array.isArray(object.hitboxTriangles)) return object.hitboxTriangles;
  return triangulatePolygon(objectHitboxCorners(object));
}

function orientation(a, b, c) {
  const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return Math.min(a.x, c.x) <= b.x && b.x <= Math.max(a.x, c.x) && Math.min(a.y, c.y) <= b.y && b.y <= Math.max(a.y, c.y);
}

function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

// True if any two non-adjacent edges of `points` cross — a "bowtie" the
// editor should refuse to close (ear-clipping and the physics/collision
// paths built on it all assume a simple polygon).
export function polygonSelfIntersects(points) {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const sharesVertex = (i + 1) % n === j || (j + 1) % n === i;
      if (sharesVertex) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

const DEFAULT_SNAP_INCREMENT = Math.PI / 12; // 15°

export function snapAngleTo(angle, increment = DEFAULT_SNAP_INCREMENT) {
  return Math.round(angle / increment) * increment;
}

// Snaps the direction from `from` to `to` onto the nearest angle increment,
// preserving the original distance between the two points.
export function snapPointToAngle(from, to, increment = DEFAULT_SNAP_INCREMENT) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const angle = snapAngleTo(Math.atan2(dy, dx), increment);
  return { x: from.x + Math.cos(angle) * distance, y: from.y + Math.sin(angle) * distance };
}
