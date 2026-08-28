// Dev-only tool (game_design.md §10) — never shipped, see EXCLUDE in
// scripts/build.mjs. Two independent tabs sharing nothing but their file
// picker helpers: Object Maker (image + hitbox -> object-definition JSON)
// and Level Editor (place object definitions into a level -> level JSON).
import { createHitboxTool } from "./editor/hitbox-tool.js";
import { readImageFile, readObjectDefinitionFiles, defaultObjectDefinition } from "./editor/import-objects.js";
import { newLevel, readLevelFile, saveLevel, downloadJsonFile } from "./editor/level-io.js";
import {
  rotatedRectsOverlap,
  polygonsOverlap,
  rectCorners,
  getHitboxTriangles,
  objectHitboxCorners,
  pointInRect,
  clamp,
  rotateVector,
  rotatePoint,
  snapAngleTo,
  scalePolygonPoints,
} from "../src/physics/kinematics-math.js";
import { checkpointTriggerRect } from "../src/collision/hitbox.js";

const FLAG_NAMES = ["hitbox", "instantDamage", "physics", "physicsWithEvent"];
const LEVEL_VIEW_WIDTH = 960;
const LEVEL_VIEW_HEIGHT = 540;
const PICK_TOLERANCE = 4; // half-width of the tiny probe rect used for click hit-testing
const START_MARKER_RADIUS = 14;
const OBJECT_HANDLE_RADIUS = 6; // rotate/resize handles on a selected placed object
const OBJECT_ROTATE_HANDLE_OFFSET = 24;
const MIN_OBJECT_SIZE = 4;

function setupTabs() {
  const tabObject = document.getElementById("tab-object");
  const tabLevel = document.getElementById("tab-level");
  const panelObject = document.getElementById("object-maker");
  const panelLevel = document.getElementById("level-editor");

  function show(tab) {
    const isObject = tab === "object";
    panelObject.hidden = !isObject;
    panelLevel.hidden = isObject;
    tabObject.setAttribute("aria-pressed", String(isObject));
    tabLevel.setAttribute("aria-pressed", String(!isObject));
  }
  tabObject.addEventListener("click", () => show("object"));
  tabLevel.addEventListener("click", () => show("level"));
}

// ---------- Object Maker ----------

function setupObjectMaker() {
  const canvas = document.getElementById("object-canvas");
  const imageInput = document.getElementById("object-image-input");
  const nameInput = document.getElementById("object-name-input");
  const spriteInput = document.getElementById("object-sprite-input");
  const xInput = document.getElementById("object-x");
  const yInput = document.getElementById("object-y");
  const widthInput = document.getElementById("object-width");
  const heightInput = document.getElementById("object-height");
  const rotationInput = document.getElementById("object-rotation");
  const flagInputs = Object.fromEntries(FLAG_NAMES.map((name) => [name, document.getElementById(`object-flag-${name}`)]));
  const saveButton = document.getElementById("object-save-button");
  const drawButton = document.getElementById("object-draw-hitbox-button");
  const resetButton = document.getElementById("object-reset-hitbox-button");
  const status = document.getElementById("object-status");

  let tool = null;

  function syncFieldsFromRect(rect) {
    xInput.value = Math.round(rect.x);
    yInput.value = Math.round(rect.y);
    widthInput.value = Math.round(rect.width);
    heightInput.value = Math.round(rect.height);
    rotationInput.value = Math.round(((rect.rotation ?? 0) * 180) / Math.PI);
  }

  function rectFromFields() {
    return {
      x: Number(xInput.value) || 0,
      y: Number(yInput.value) || 0,
      width: Number(widthInput.value) || 1,
      height: Number(heightInput.value) || 1,
      rotation: ((Number(rotationInput.value) || 0) * Math.PI) / 180,
    };
  }

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    if (!file) return;
    const { image, naturalWidth, naturalHeight } = await readImageFile(file);
    canvas.width = naturalWidth;
    canvas.height = naturalHeight;
    if (tool) tool.destroy();
    tool = createHitboxTool(canvas, image, {
      onChange: ({ rect, status: hint }) => {
        syncFieldsFromRect(rect);
        status.textContent = hint ?? "";
      },
    });
    syncFieldsFromRect(tool.getRect());
    spriteInput.value = `assets/objects/${file.name}`;
    status.textContent = "";
  });

  for (const input of [xInput, yInput, widthInput, heightInput, rotationInput]) {
    input.addEventListener("change", () => tool?.setRect(rectFromFields()));
  }

  drawButton.addEventListener("click", () => tool?.startDrawing());
  resetButton.addEventListener("click", () => tool?.resetToRectangle());

  saveButton.addEventListener("click", async () => {
    if (!tool) {
      status.textContent = "Import an image first.";
      return;
    }
    const rect = tool.getRect();
    // hitboxPolygon is stored relative to the rect's own top-left (the same
    // frame-independent box width/height describe), not the absolute pixel
    // position it was drawn at on this authoring canvas — see
    // kinematics-math.js's objectHitboxCorners.
    const hitboxPolygon = tool.getPolygon().map((point) => ({ x: point.x - rect.x, y: point.y - rect.y }));
    const definition = {
      ...defaultObjectDefinition(),
      name: nameInput.value || "untitled-object",
      sprite: spriteInput.value,
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      rotation: rect.rotation ?? 0,
      flags: Object.fromEntries(FLAG_NAMES.map((name) => [name, flagInputs[name].checked])),
      hitboxPolygon,
    };
    await downloadJsonFile(definition, `${definition.name}.json`);
    status.textContent = `Saved ${definition.name}.json — drop the image into ${definition.sprite.replace(/^assets\/objects\//, "assets/objects/")} by hand if you haven't already.`;
  });
}

// ---------- Level Editor ----------

function endRect(end) {
  return { x: end.x, y: end.y - end.height, width: end.width, height: end.height };
}

function probeRect(point) {
  return { x: point.x - PICK_TOLERANCE, y: point.y - PICK_TOLERANCE, width: PICK_TOLERANCE * 2, height: PICK_TOLERANCE * 2, rotation: 0 };
}

// A custom polygon (possibly concave) is tested as the union of its
// ear-clipped triangles, same as the runtime collision path in
// src/collision/hitbox.js — so click-selection respects an object's real
// shape, not just its bounding rect.
function objectHitAt(object, point) {
  if (!object.hitboxPolygon) return rotatedRectsOverlap(probeRect(point), object);
  const probeCorners = rectCorners(probeRect(point));
  return getHitboxTriangles(object).some((triangle) => polygonsOverlap(probeCorners, triangle));
}

function objectCenter(object) {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

// Same handle placement/rotation convention as dev/editor/hitbox-tool.js's
// rotateHandlePoint, so dragging a placed object feels identical to
// dragging a hitbox in the Object Maker.
function objectRotateHandlePoint(object) {
  const center = objectCenter(object);
  const local = rotateVector(0, -object.height / 2 - OBJECT_ROTATE_HANDLE_OFFSET, object.rotation ?? 0);
  return { x: center.x + local.x, y: center.y + local.y };
}

function objectResizeHandlePoint(object) {
  return rotatePoint({ x: object.x + object.width, y: object.y + object.height }, objectCenter(object), object.rotation ?? 0);
}

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function setupLevelEditor() {
  const canvas = document.getElementById("level-canvas");
  const ctx = canvas.getContext("2d");
  const status = document.getElementById("level-status");
  const idInput = document.getElementById("level-id");
  const nameInput = document.getElementById("level-name");
  const minXInput = document.getElementById("level-min-x");
  const maxXInput = document.getElementById("level-max-x");
  const groundYInput = document.getElementById("level-ground-y");
  const paletteList = document.getElementById("palette-list");
  const inspectorBody = document.getElementById("inspector-body");

  canvas.width = LEVEL_VIEW_WIDTH;
  canvas.height = LEVEL_VIEW_HEIGHT;

  const state = {
    level: newLevel(),
    palette: [], // [{ name, sprite, width, height, rotation, flags }]
    images: new Map(), // sprite path -> HTMLImageElement
    armedPaletteIndex: null,
    selection: null, // { type: "object"|"checkpoint"|"start"|"end", id? }
    camera: { x: 0 },
    drag: null,
  };

  function imageFor(sprite) {
    if (!sprite) return null;
    if (!state.images.has(sprite)) {
      const image = new Image();
      image.src = new URL(sprite, new URL("../", import.meta.url)).href;
      state.images.set(sprite, image);
    }
    return state.images.get(sprite);
  }

  function maxCameraX() {
    const span = state.level.bounds.maxX - state.level.bounds.minX;
    return state.level.bounds.minX + Math.max(0, span - LEVEL_VIEW_WIDTH);
  }

  function clampCamera() {
    state.camera.x = clamp(state.camera.x, state.level.bounds.minX, maxCameraX());
  }

  function syncMetaFields() {
    idInput.value = state.level.id;
    nameInput.value = state.level.name;
    minXInput.value = state.level.bounds.minX;
    maxXInput.value = state.level.bounds.maxX;
    groundYInput.value = state.level.groundY;
  }

  for (const [input, apply] of [
    [idInput, (v) => (state.level.id = v)],
    [nameInput, (v) => (state.level.name = v)],
    [minXInput, (v) => (state.level.bounds.minX = Number(v) || 0)],
    [maxXInput, (v) => (state.level.bounds.maxX = Number(v) || 0)],
    [groundYInput, (v) => (state.level.groundY = Number(v) || 0)],
  ]) {
    input.addEventListener("change", () => {
      apply(input.value);
      clampCamera();
      draw();
    });
  }

  document.getElementById("level-new-button").addEventListener("click", () => {
    state.level = newLevel();
    state.selection = null;
    state.camera.x = 0;
    syncMetaFields();
    renderInspector();
    draw();
    status.textContent = "New level.";
  });

  document.getElementById("level-load-input").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    state.level = await readLevelFile(file);
    state.selection = null;
    state.camera.x = state.level.bounds.minX;
    syncMetaFields();
    renderInspector();
    draw();
    status.textContent = `Loaded ${file.name}.`;
  });

  document.getElementById("level-save-button").addEventListener("click", async () => {
    await saveLevel(state.level);
    status.textContent = `Saved ${state.level.id}.json.`;
  });

  document.getElementById("objects-load-input").addEventListener("change", async (event) => {
    const definitions = await readObjectDefinitionFiles(event.target.files);
    state.palette.push(...definitions);
    for (const definition of definitions) imageFor(definition.sprite);
    renderPalette();
    status.textContent = `Imported ${definitions.length} object definition(s).`;
  });

  document.getElementById("level-add-checkpoint").addEventListener("click", () => {
    const id = generateId("cp");
    state.level.checkpoints.push({ id, x: state.camera.x + LEVEL_VIEW_WIDTH / 2, y: state.level.groundY });
    state.selection = { type: "checkpoint", id };
    renderInspector();
    draw();
  });

  function renderPalette() {
    paletteList.replaceChildren();
    state.palette.forEach((definition, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-item";
      button.setAttribute("aria-pressed", String(state.armedPaletteIndex === index));
      const image = imageFor(definition.sprite);
      if (image) {
        const thumb = document.createElement("img");
        thumb.src = image.src;
        thumb.alt = "";
        button.appendChild(thumb);
      }
      button.appendChild(document.createTextNode(definition.name));
      button.addEventListener("click", () => {
        state.armedPaletteIndex = state.armedPaletteIndex === index ? null : index;
        renderPalette();
      });
      paletteList.appendChild(button);
    });
  }

  function findObject(id) {
    return state.level.objects.find((object) => object.id === id);
  }
  function findCheckpoint(id) {
    return state.level.checkpoints.find((checkpoint) => checkpoint.id === id);
  }

  function numberField(labelText, value, onChange) {
    const row = document.createElement("div");
    row.className = "inspector-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.value = value;
    input.addEventListener("change", () => {
      onChange(Number(input.value) || 0);
      draw();
    });
    label.appendChild(input);
    row.appendChild(label);
    return row;
  }

  function textField(labelText, value, onChange) {
    const row = document.createElement("div");
    row.className = "inspector-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("change", () => {
      onChange(input.value);
      draw();
    });
    label.appendChild(input);
    row.appendChild(label);
    return row;
  }

  function checkboxField(labelText, checked, onChange) {
    const row = document.createElement("div");
    row.className = "inspector-row";
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => {
      onChange(input.checked);
      draw();
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(labelText));
    row.appendChild(label);
    return row;
  }

  function deleteButton(onDelete) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger";
    button.textContent = "Delete";
    button.addEventListener("click", () => {
      onDelete();
      state.selection = null;
      renderInspector();
      draw();
    });
    return button;
  }

  function renderInspector() {
    inspectorBody.replaceChildren();
    const selection = state.selection;
    if (!selection) {
      const empty = document.createElement("p");
      empty.id = "inspector-empty";
      empty.textContent = "Nothing selected.";
      inspectorBody.appendChild(empty);
      return;
    }

    if (selection.type === "object") {
      const object = findObject(selection.id);
      if (!object) return (state.selection = null);
      inspectorBody.append(
        numberField("X", object.x, (v) => (object.x = v)),
        numberField("Y", object.y, (v) => (object.y = v)),
        numberField("Width", object.width, (v) => {
          // hitboxPolygon is relative to the object's own [0,width] box, so
          // it has to rescale in step or it'd desync from the new sprite
          // size — see kinematics-math.js's objectHitboxCorners.
          const scaleX = v / (object.width || 1);
          object.width = v;
          if (object.hitboxPolygon) object.hitboxPolygon = scalePolygonPoints(object.hitboxPolygon, scaleX, 1);
        }),
        numberField("Height", object.height, (v) => {
          const scaleY = v / (object.height || 1);
          object.height = v;
          if (object.hitboxPolygon) object.hitboxPolygon = scalePolygonPoints(object.hitboxPolygon, 1, scaleY);
        }),
        numberField("Rotation (deg)", Math.round((object.rotation * 180) / Math.PI), (v) => (object.rotation = (v * Math.PI) / 180)),
        numberField("zIndex", object.zIndex, (v) => (object.zIndex = v)),
        ...FLAG_NAMES.map((name) => checkboxField(name, object.flags[name], (v) => (object.flags[name] = v))),
        textField("Trigger event", object.trigger?.event ?? "", (v) => {
          object.trigger = v ? { event: v, sound: object.trigger?.sound ?? null } : null;
        }),
        textField("Trigger sound", object.trigger?.sound ?? "", (v) => {
          if (object.trigger) object.trigger.sound = v || null;
        }),
        deleteButton(() => {
          state.level.objects = state.level.objects.filter((o) => o.id !== object.id);
        }),
      );
    } else if (selection.type === "checkpoint") {
      const checkpoint = findCheckpoint(selection.id);
      if (!checkpoint) return (state.selection = null);
      inspectorBody.append(
        textField("Id", checkpoint.id, (v) => (checkpoint.id = v)),
        numberField("X", checkpoint.x, (v) => (checkpoint.x = v)),
        numberField("Y", checkpoint.y, (v) => (checkpoint.y = v)),
        deleteButton(() => {
          state.level.checkpoints = state.level.checkpoints.filter((c) => c.id !== checkpoint.id);
        }),
      );
    } else if (selection.type === "start") {
      inspectorBody.append(
        numberField("X", state.level.start.x, (v) => (state.level.start.x = v)),
        numberField("Y", state.level.start.y, (v) => (state.level.start.y = v)),
      );
    } else if (selection.type === "end") {
      inspectorBody.append(
        numberField("X", state.level.end.x, (v) => (state.level.end.x = v)),
        numberField("Y", state.level.end.y, (v) => (state.level.end.y = v)),
        numberField("Width", state.level.end.width, (v) => (state.level.end.width = v)),
        numberField("Height", state.level.end.height, (v) => (state.level.end.height = v)),
      );
    }
  }

  function screenX(worldX) {
    return worldX - state.camera.x;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#bcd6ee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#3f6329";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, state.level.groundY);
    ctx.lineTo(canvas.width, state.level.groundY);
    ctx.stroke();

    for (const object of [...state.level.objects].sort((a, b) => a.zIndex - b.zIndex)) {
      drawRotatedRect(object, screenX(object.x), object.y, object.width, object.height, object.rotation, "#a33", state.selection?.type === "object" && state.selection.id === object.id);
    }

    if (state.selection?.type === "object") {
      const selectedObject = findObject(state.selection.id);
      if (selectedObject) drawObjectHandles(selectedObject);
    }

    for (const checkpoint of state.level.checkpoints) {
      const rect = checkpointTriggerRect(checkpoint);
      const selected = state.selection?.type === "checkpoint" && state.selection.id === checkpoint.id;
      ctx.fillStyle = selected ? "rgba(255, 210, 63, 0.5)" : "rgba(80, 160, 220, 0.5)";
      ctx.fillRect(screenX(rect.x), rect.y, rect.width, rect.height);
      ctx.strokeStyle = selected ? "#ffd23f" : "#3a80c8";
      ctx.strokeRect(screenX(rect.x), rect.y, rect.width, rect.height);
      ctx.fillStyle = "#fff";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(checkpoint.id, screenX(checkpoint.x) - rect.width / 2, rect.y - 4);
    }

    const startSelected = state.selection?.type === "start";
    ctx.beginPath();
    ctx.arc(screenX(state.level.start.x), state.level.start.y, START_MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = startSelected ? "#ffd23f" : "#5fbf5f";
    ctx.fill();
    ctx.fillStyle = "#0c0f14";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("start", screenX(state.level.start.x) - 12, state.level.start.y + 4);

    const rect = endRect(state.level.end);
    const endSelected = state.selection?.type === "end";
    ctx.fillStyle = endSelected ? "rgba(255, 210, 63, 0.6)" : "rgba(60, 40, 20, 0.55)";
    ctx.fillRect(screenX(rect.x), rect.y, rect.width, rect.height);
    ctx.fillStyle = "#f4e7c3";
    ctx.fillText("WORK", screenX(rect.x) + rect.width / 2 - 16, rect.y - 6);
  }

  function drawRotatedRect(rect, x, y, width, height, rotation, color, selected) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(rotation ?? 0);
    const image = imageFor(rect.sprite);
    if (image && image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(-width / 2, -height / 2, width, height);
    }
    if (selected) {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 2;
      ctx.strokeRect(-width / 2, -height / 2, width, height);
    }
    ctx.restore();
  }

  // Rotate + resize handles for the selected placed object, drawn in the
  // same visual language as the Object Maker's hitbox-tool.js handles. The
  // real (possibly custom-polygon) hitbox is outlined too, so a resize
  // drag visibly scales the actual collision shape, not just the sprite box.
  function drawObjectHandles(object) {
    if (object.hitboxPolygon) {
      const corners = objectHitboxCorners(object);
      ctx.beginPath();
      ctx.moveTo(screenX(corners[0].x), corners[0].y);
      for (const point of corners.slice(1)) ctx.lineTo(screenX(point.x), point.y);
      ctx.closePath();
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const center = objectCenter(object);
    const rotateHandle = objectRotateHandlePoint(object);
    ctx.beginPath();
    ctx.moveTo(screenX(center.x), center.y);
    ctx.lineTo(screenX(rotateHandle.x), rotateHandle.y);
    ctx.strokeStyle = "rgba(255, 210, 63, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(screenX(rotateHandle.x), rotateHandle.y, OBJECT_HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd23f";
    ctx.fill();

    const resizeHandle = objectResizeHandlePoint(object);
    ctx.beginPath();
    ctx.arc(screenX(resizeHandle.x), resizeHandle.y, OBJECT_HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#7fd88f";
    ctx.fill();
  }

  function worldPoint(event) {
    return { x: event.offsetX + state.camera.x, y: event.offsetY };
  }

  function hitTest(point) {
    for (const checkpoint of state.level.checkpoints) {
      if (pointInRect(point, checkpointTriggerRect(checkpoint))) return { type: "checkpoint", id: checkpoint.id };
    }
    if (Math.hypot(point.x - state.level.start.x, point.y - state.level.start.y) <= START_MARKER_RADIUS) {
      return { type: "start" };
    }
    const objectsTopFirst = [...state.level.objects].sort((a, b) => b.zIndex - a.zIndex);
    for (const object of objectsTopFirst) {
      if (objectHitAt(object, point)) return { type: "object", id: object.id };
    }
    if (pointInRect(point, endRect(state.level.end))) return { type: "end" };
    return null;
  }

  canvas.addEventListener("pointerdown", (event) => {
    const point = worldPoint(event);

    if (state.armedPaletteIndex !== null && !hitTest(point)) {
      const definition = state.palette[state.armedPaletteIndex];
      const object = {
        id: generateId("obj"),
        sprite: definition.sprite,
        x: point.x - definition.width / 2,
        y: point.y - definition.height / 2,
        width: definition.width,
        height: definition.height,
        rotation: definition.rotation ?? 0,
        zIndex: 0,
        flags: { ...definition.flags },
        trigger: null,
        // Already relative to the object's own top-left, so it copies
        // straight across regardless of where it's placed — see
        // kinematics-math.js's objectHitboxCorners.
        hitboxPolygon: definition.hitboxPolygon ? definition.hitboxPolygon.map((point) => ({ ...point })) : null,
      };
      state.level.objects.push(object);
      state.selection = { type: "object", id: object.id };
      state.armedPaletteIndex = null;
      renderPalette();
      renderInspector();
      draw();
      return;
    }

    if (state.selection?.type === "object") {
      const selectedObject = findObject(state.selection.id);
      if (selectedObject) {
        const rotateHandle = objectRotateHandlePoint(selectedObject);
        if (Math.hypot(point.x - rotateHandle.x, point.y - rotateHandle.y) <= OBJECT_HANDLE_RADIUS + 4) {
          canvas.setPointerCapture(event.pointerId);
          state.drag = { mode: "rotate-object", id: selectedObject.id, center: objectCenter(selectedObject) };
          return;
        }
        const resizeHandle = objectResizeHandlePoint(selectedObject);
        if (Math.hypot(point.x - resizeHandle.x, point.y - resizeHandle.y) <= OBJECT_HANDLE_RADIUS + 4) {
          canvas.setPointerCapture(event.pointerId);
          state.drag = {
            mode: "resize-object",
            id: selectedObject.id,
            originalRect: {
              x: selectedObject.x,
              y: selectedObject.y,
              width: selectedObject.width,
              height: selectedObject.height,
              rotation: selectedObject.rotation ?? 0,
            },
            originalPolygon: selectedObject.hitboxPolygon ? selectedObject.hitboxPolygon.map((p) => ({ ...p })) : null,
          };
          return;
        }
      }
    }

    const hit = hitTest(point);
    canvas.setPointerCapture(event.pointerId);
    if (!hit) {
      state.selection = null;
      state.drag = { mode: "pan", startClientX: event.clientX, startCameraX: state.camera.x };
      renderInspector();
      draw();
      return;
    }

    state.selection = hit;
    renderInspector();
    if (hit.type === "object") {
      const object = findObject(hit.id);
      state.drag = { mode: "object", id: hit.id, offsetX: point.x - object.x, offsetY: point.y - object.y };
    } else if (hit.type === "checkpoint") {
      const checkpoint = findCheckpoint(hit.id);
      state.drag = { mode: "checkpoint", id: hit.id, offsetX: point.x - checkpoint.x, offsetY: point.y - checkpoint.y };
    } else if (hit.type === "start") {
      state.drag = { mode: "start", offsetX: point.x - state.level.start.x, offsetY: point.y - state.level.start.y };
    } else if (hit.type === "end") {
      state.drag = { mode: "end", offsetX: point.x - state.level.end.x, offsetY: point.y - state.level.end.y };
    }
    draw();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.drag) return;
    if (state.drag.mode === "pan") {
      state.camera.x = state.drag.startCameraX - (event.clientX - state.drag.startClientX);
      clampCamera();
      draw();
      return;
    }
    const point = worldPoint(event);
    if (state.drag.mode === "object") {
      const object = findObject(state.drag.id);
      if (object) {
        object.x = point.x - state.drag.offsetX;
        object.y = point.y - state.drag.offsetY;
      }
    } else if (state.drag.mode === "checkpoint") {
      const checkpoint = findCheckpoint(state.drag.id);
      if (checkpoint) {
        checkpoint.x = point.x - state.drag.offsetX;
        checkpoint.y = point.y - state.drag.offsetY;
      }
    } else if (state.drag.mode === "start") {
      state.level.start.x = point.x - state.drag.offsetX;
      state.level.start.y = point.y - state.drag.offsetY;
    } else if (state.drag.mode === "end") {
      state.level.end.x = point.x - state.drag.offsetX;
      state.level.end.y = point.y - state.drag.offsetY;
    } else if (state.drag.mode === "rotate-object") {
      const object = findObject(state.drag.id);
      if (object) {
        const angle = Math.atan2(point.x - state.drag.center.x, -(point.y - state.drag.center.y));
        object.rotation = event.shiftKey ? snapAngleTo(angle) : angle;
      }
    } else if (state.drag.mode === "resize-object") {
      const object = findObject(state.drag.id);
      const { originalRect, originalPolygon } = state.drag;
      if (object) {
        const local = rotatePoint(point, objectCenter(originalRect), -(originalRect.rotation ?? 0));
        let newWidth = Math.max(MIN_OBJECT_SIZE, local.x - originalRect.x);
        let newHeight = Math.max(MIN_OBJECT_SIZE, local.y - originalRect.y);
        if (event.shiftKey) newHeight = newWidth / (originalRect.width / originalRect.height);
        object.width = newWidth;
        object.height = newHeight;
        if (originalPolygon) {
          object.hitboxPolygon = scalePolygonPoints(originalPolygon, newWidth / originalRect.width, newHeight / originalRect.height);
        }
      }
    }
    renderInspector();
    draw();
  });

  canvas.addEventListener("pointerup", (event) => {
    state.drag = null;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.camera.x += event.deltaX || event.deltaY;
      clampCamera();
      draw();
    },
    { passive: false },
  );

  syncMetaFields();
  renderPalette();
  renderInspector();
  draw();
}

setupTabs();
setupObjectMaker();
setupLevelEditor();
