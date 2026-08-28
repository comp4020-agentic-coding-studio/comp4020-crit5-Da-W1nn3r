// Click-to-place polygon hitbox authoring over a loaded image, plus a
// rotation handle for the whole shape. Produces { rect, polygon } where
// `rect` is the same { x, y, width, height, rotation } shape
// level-schema.js/kinematics-math.js already use (top-left corner
// pre-rotation, rotated about its own center) and `polygon` is an array of
// { x, y } points in the same absolute, pre-rotation canvas-pixel frame as
// `rect` itself (so it overlays the image directly while authoring). The
// caller (editor.js) re-bases these to rect-relative [0, width] x
// [0, height] coordinates before saving them as `hitboxPolygon` — see
// kinematics-math.js's objectHitboxCorners for why that frame is the one
// that survives being placed at a different x/y later. Assumes `canvas`'s
// pixel size equals the image's natural size (the caller sizes it that
// way), so pointer offsetX/offsetY line up 1:1 with image/rect coordinates.
//
// `rect.width`/`height` double as the object's future *display* size — both
// the level editor (editor.js's drawRotatedRect) and the real renderer
// (src/render/renderer.js's drawRect) stretch the whole sprite image into
// exactly that box. So this tool draws the image the same way (scaled to
// rect, rotated about its own center) rather than always at natural size —
// otherwise a polygon traced while looking at the full-resolution image
// stops lining up with the art the moment the object is placed and the
// image gets squished into a differently-sized/positioned box.
import { rotateVector, rotatePoint, polygonSelfIntersects, snapPointToAngle, snapAngleTo } from "../../src/physics/kinematics-math.js";

const HANDLE_RADIUS = 6;
const VERTEX_RADIUS = 5;
const ROTATE_HANDLE_OFFSET = 24;
const CLOSE_TOLERANCE = 10; // px from the first vertex that counts as "click to close"
const EDGE_INSERT_TOLERANCE = 6; // px from an edge that counts as "double-click to insert here"
const SNAP_INCREMENT = Math.PI / 12; // 15° — hold Shift to snap to this

// Defaults the display box to the image's full natural size, matching
// import-objects.js's readImageFile comment ("used as the object
// definition's default width/height") — so a freshly imported image shows
// WYSIWYG at 1:1 until the author deliberately resizes it.
function defaultRect(image) {
  return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight, rotation: 0 };
}

function defaultPolygon(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function rotateHandlePoint(rect) {
  const center = rectCenter(rect);
  const local = rotateVector(0, -rect.height / 2 - ROTATE_HANDLE_OFFSET, rect.rotation ?? 0);
  return { x: center.x + local.x, y: center.y + local.y };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return { distance: distance(p, { x: a.x + abx * t, y: a.y + aby * t }), t };
}

function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i];
    const pj = points[j];
    const crosses = pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function retargetPolygon(oldRect, newRect, points) {
  const scaleX = oldRect.width ? newRect.width / oldRect.width : 1;
  const scaleY = oldRect.height ? newRect.height / oldRect.height : 1;
  return points.map((point) => ({
    x: newRect.x + (point.x - oldRect.x) * scaleX,
    y: newRect.y + (point.y - oldRect.y) * scaleY,
  }));
}

export function createHitboxTool(canvas, image, { rect: initialRect, polygon: initialPolygon, onChange } = {}) {
  const ctx = canvas.getContext("2d");
  canvas.tabIndex = 0; // focusable, so Enter/Escape/Backspace reach it while drawing

  let rect = initialRect ?? defaultRect(image);
  let points = initialPolygon && initialPolygon.length >= 3 ? initialPolygon : defaultPolygon(rect);
  let mode = "idle"; // "idle" | "drawing"
  let drawPoints = [];
  let drawPreview = null;
  let preDrawRect = null; // snapshot to restore rotation if drawing is cancelled
  let drag = null; // { mode: "vertex" | "polygon" | "rotate", ... }
  let statusMessage = "";

  function notify() {
    onChange?.({ rect, polygon: points.map((p) => ({ ...p })), status: statusMessage });
  }

  function toLocalRel(point, refRect) {
    return rotatePoint(point, rectCenter(refRect), -(refRect.rotation ?? 0));
  }
  function toDisplayRel(point, refRect) {
    return rotatePoint(point, rectCenter(refRect), refRect.rotation ?? 0);
  }
  function toLocal(point) {
    return toLocalRel(point, rect);
  }
  function toDisplay(point) {
    return toDisplayRel(point, rect);
  }
  function displayPoints() {
    return points.map(toDisplay);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Same math as editor.js's drawRotatedRect / renderer.js's drawRect: the
    // whole image stretched into rect's box, rotated about its own center —
    // a WYSIWYG preview of how this sprite will actually be placed.
    const center = rectCenter(rect);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rect.rotation ?? 0);
    ctx.drawImage(image, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    ctx.restore();

    const shown = mode === "drawing" ? drawPoints.map(toDisplay) : displayPoints();

    if (shown.length > 0) {
      ctx.beginPath();
      ctx.moveTo(shown[0].x, shown[0].y);
      for (const point of shown.slice(1)) ctx.lineTo(point.x, point.y);
      if (mode === "idle") ctx.closePath();
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (mode === "idle") {
        ctx.fillStyle = "rgba(255, 210, 63, 0.15)";
        ctx.fill();
      }
    }

    if (mode === "drawing" && drawPreview && shown.length > 0) {
      const last = shown[shown.length - 1];
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(drawPreview.x, drawPreview.y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255, 210, 63, 0.6)";
      ctx.stroke();
      ctx.setLineDash([]);
    }

    shown.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, VERTEX_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd23f";
      ctx.fill();
      if (mode === "drawing" && index === 0 && drawPoints.length >= 3) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, VERTEX_RADIUS + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#7fd88f";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    if (mode === "idle") {
      const center = rectCenter(rect);
      const handle = rotateHandlePoint(rect);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(handle.x, handle.y);
      ctx.strokeStyle = "rgba(255, 210, 63, 0.6)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd23f";
      ctx.fill();
    }
  }

  function localPoint(event) {
    return { x: event.offsetX, y: event.offsetY };
  }

  function findVertexAt(displayPts, point, radius = VERTEX_RADIUS + 4) {
    for (let i = 0; i < displayPts.length; i++) {
      if (distance(point, displayPts[i]) <= radius) return i;
    }
    return -1;
  }

  function findEdgeAt(displayPts, point, tolerance = EDGE_INSERT_TOLERANCE) {
    for (let i = 0; i < displayPts.length; i++) {
      const a = displayPts[i];
      const b = displayPts[(i + 1) % displayPts.length];
      const { distance: d, t } = distanceToSegment(point, a, b);
      if (d <= tolerance && t > 0.02 && t < 0.98) return i;
    }
    return -1;
  }

  function updateCursor(raw) {
    if (mode === "drawing") {
      canvas.style.cursor = "crosshair";
      return;
    }
    if (distance(raw, rotateHandlePoint(rect)) <= HANDLE_RADIUS + 4) {
      canvas.style.cursor = "grab";
      return;
    }
    const displayPts = displayPoints();
    if (findVertexAt(displayPts, raw) !== -1) {
      canvas.style.cursor = "pointer";
    } else if (pointInPolygon(raw, displayPts)) {
      canvas.style.cursor = "move";
    } else {
      canvas.style.cursor = "crosshair";
    }
  }

  function beginDrawingMode() {
    mode = "drawing";
    preDrawRect = { ...rect };
    rect = { ...rect, rotation: 0 };
    drawPoints = [];
    drawPreview = null;
    statusMessage = "Click to add points. Shift snaps the angle.";
    notify();
    draw();
  }

  function cancelDrawing() {
    mode = "idle";
    if (preDrawRect) {
      rect = preDrawRect;
      preDrawRect = null;
    }
    drawPoints = [];
    drawPreview = null;
    statusMessage = "";
    notify();
    draw();
  }

  function closeDrawing() {
    if (drawPoints.length < 3) {
      statusMessage = "Need at least 3 points to close a shape.";
      draw();
      return;
    }
    if (polygonSelfIntersects(drawPoints)) {
      statusMessage = "Those edges cross — fix the shape before closing.";
      draw();
      return;
    }
    // rect is the sprite's *display* box (see the file header) — a drawn
    // hitbox is just an overlay on it, not a redefinition of it. Only
    // restore the rotation drawing suspended; width/height/x/y (and thus
    // what's saved as the object's size) stay exactly what they were.
    if (preDrawRect) rect = preDrawRect;
    points = drawPoints;
    mode = "idle";
    drawPoints = [];
    drawPreview = null;
    preDrawRect = null;
    statusMessage = "";
    notify();
    draw();
  }

  function handleDrawingClick(raw, event) {
    const displayPts = drawPoints.map(toDisplay);
    if (drawPoints.length >= 3 && distance(raw, displayPts[0]) <= CLOSE_TOLERANCE + VERTEX_RADIUS) {
      closeDrawing();
      return;
    }
    let next = toLocal(raw);
    if (event.shiftKey && drawPoints.length > 0) {
      const prevDisplay = displayPts[displayPts.length - 1];
      next = toLocal(snapPointToAngle(prevDisplay, raw, SNAP_INCREMENT));
    }
    drawPoints.push(next);
    drawPreview = null;
    statusMessage =
      drawPoints.length >= 3 ? "Click the first point (green) or press Enter to close. Shift snaps the angle." : "Click to add points. Shift snaps the angle.";
    draw();
  }

  function onPointerDown(event) {
    canvas.focus();
    const raw = localPoint(event);

    if (mode === "drawing") {
      handleDrawingClick(raw, event);
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (distance(raw, rotateHandlePoint(rect)) <= HANDLE_RADIUS + 4) {
      drag = { mode: "rotate", center: rectCenter(rect) };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const displayPts = displayPoints();
    const vertexIndex = findVertexAt(displayPts, raw);
    if (vertexIndex !== -1) {
      if (event.altKey) {
        if (points.length > 3) {
          points = points.filter((_, i) => i !== vertexIndex);
          statusMessage = "";
          notify();
        } else {
          statusMessage = "A hitbox needs at least 3 points — can't delete this one.";
        }
        draw();
        return;
      }
      drag = { mode: "vertex", index: vertexIndex };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (pointInPolygon(raw, displayPts)) {
      drag = { mode: "polygon", originalPoints: points.map((p) => ({ ...p })), originalRect: { ...rect }, start: toLocal(raw) };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    beginDrawingMode();
    handleDrawingClick(raw, event);
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const raw = localPoint(event);

    if (mode === "drawing") {
      drawPreview = raw;
      if (event.shiftKey && drawPoints.length > 0) {
        const prevDisplay = toDisplay(drawPoints[drawPoints.length - 1]);
        drawPreview = snapPointToAngle(prevDisplay, raw, SNAP_INCREMENT);
      }
      draw();
      return;
    }

    if (!drag) {
      updateCursor(raw);
      return;
    }

    if (drag.mode === "rotate") {
      const rawAngle = Math.atan2(raw.x - drag.center.x, -(raw.y - drag.center.y));
      rect = { ...rect, rotation: event.shiftKey ? snapAngleTo(rawAngle, SNAP_INCREMENT) : rawAngle };
    } else if (drag.mode === "vertex") {
      let next = toLocal(raw);
      if (event.shiftKey) {
        const prevIndex = (drag.index - 1 + points.length) % points.length;
        const prevDisplay = toDisplay(points[prevIndex]);
        next = toLocal(snapPointToAngle(prevDisplay, raw, SNAP_INCREMENT));
      }
      points = points.map((point, i) => (i === drag.index ? next : point));
    } else if (drag.mode === "polygon") {
      const currentLocal = toLocalRel(raw, drag.originalRect);
      const dx = currentLocal.x - drag.start.x;
      const dy = currentLocal.y - drag.start.y;
      points = drag.originalPoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
      rect = { ...drag.originalRect, x: drag.originalRect.x + dx, y: drag.originalRect.y + dy };
    }
    draw();
  }

  function onPointerUp(event) {
    if (mode === "drawing" || !drag) return;
    drag = null;
    canvas.releasePointerCapture(event.pointerId);
    notify();
    draw();
  }

  function onDoubleClick(event) {
    if (mode !== "idle") return;
    const raw = localPoint(event);
    const displayPts = displayPoints();
    const edgeIndex = findEdgeAt(displayPts, raw);
    if (edgeIndex === -1) return;
    const insertAt = toLocal(raw);
    points = [...points.slice(0, edgeIndex + 1), insertAt, ...points.slice(edgeIndex + 1)];
    notify();
    draw();
  }

  function onKeyDown(event) {
    if (mode !== "drawing") return;
    if (event.key === "Enter") {
      event.preventDefault();
      closeDrawing();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelDrawing();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      drawPoints.pop();
      draw();
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("keydown", onKeyDown);
  draw();

  return {
    getRect() {
      return rect;
    },
    getPolygon() {
      return points.map((point) => ({ ...point }));
    },
    setRect(nextRect) {
      points = retargetPolygon(rect, nextRect, points);
      rect = nextRect;
      if (mode === "drawing") cancelDrawing();
      else draw();
    },
    startDrawing() {
      beginDrawingMode();
    },
    resetToRectangle() {
      if (mode === "drawing") cancelDrawing();
      points = defaultPolygon(rect);
      notify();
      draw();
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("keydown", onKeyDown);
    },
  };
}
