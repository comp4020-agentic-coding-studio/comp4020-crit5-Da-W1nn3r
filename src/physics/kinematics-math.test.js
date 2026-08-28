import { describe, expect, it } from "vitest";
import {
  polygonsOverlap,
  rectCorners,
  rotatedRectsOverlap,
  triangulatePolygon,
  polygonSelfIntersects,
  scalePolygonPoints,
  snapAngleTo,
  snapPointToAngle,
} from "./kinematics-math.js";

// Shoelace formula, used only to check triangulation covers the source
// polygon's exact area — not exported by kinematics-math.js.
function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function triangleArea([a, b, c]) {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
}

describe("triangulatePolygon", () => {
  it("covers a concave (L-shaped) polygon with the right total area", () => {
    // An L-shape: a 10x10 square with a 5x5 bite out of its top-right corner.
    const lShape = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];
    const triangles = triangulatePolygon(lShape);
    expect(triangles).toHaveLength(lShape.length - 2);
    const totalArea = triangles.reduce((sum, triangle) => sum + triangleArea(triangle), 0);
    expect(totalArea).toBeCloseTo(polygonArea(lShape), 6);
  });

  it("triangulates a plain rectangle into two triangles covering its area", () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ];
    const triangles = triangulatePolygon(rect);
    expect(triangles).toHaveLength(2);
    const totalArea = triangles.reduce((sum, triangle) => sum + triangleArea(triangle), 0);
    expect(totalArea).toBeCloseTo(8, 6);
  });
});

describe("polygonsOverlap", () => {
  it("agrees with rotatedRectsOverlap for two overlapping rects", () => {
    const a = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };
    const b = { x: 5, y: 5, width: 10, height: 10, rotation: 0.3 };
    expect(polygonsOverlap(rectCorners(a), rectCorners(b))).toBe(rotatedRectsOverlap(a, b));
    expect(rotatedRectsOverlap(a, b)).toBe(true);
  });

  it("agrees with rotatedRectsOverlap for two separated rects", () => {
    const a = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };
    const b = { x: 100, y: 100, width: 10, height: 10, rotation: 0.7 };
    expect(polygonsOverlap(rectCorners(a), rectCorners(b))).toBe(rotatedRectsOverlap(a, b));
    expect(rotatedRectsOverlap(a, b)).toBe(false);
  });
});

describe("snapPointToAngle / snapAngleTo", () => {
  it("snaps a direction to the nearest 15° ray, preserving distance", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 1 }; // close to, but not exactly, the 0° ray
    const snapped = snapPointToAngle(from, to);
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    expect(snapped.x).toBeCloseTo(distance, 6);
    expect(snapped.y).toBeCloseTo(0, 6);
  });

  it("snaps an angle to the nearest increment", () => {
    expect(snapAngleTo(Math.PI / 12 + 0.01)).toBeCloseTo(Math.PI / 12, 6);
    expect(snapAngleTo(0.02)).toBeCloseTo(0, 6);
  });
});

describe("scalePolygonPoints", () => {
  it("scales each point about the origin independently per axis", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 4 },
      { x: 6, y: 8 },
    ];
    const scaled = scalePolygonPoints(points, 2, 0.5);
    expect(scaled).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 2 },
      { x: 12, y: 4 },
    ]);
  });
});

describe("polygonSelfIntersects", () => {
  it("flags a bowtie quadrilateral", () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(polygonSelfIntersects(bowtie)).toBe(true);
  });

  it("passes a simple concave polygon", () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonSelfIntersects(lShape)).toBe(false);
  });
});
