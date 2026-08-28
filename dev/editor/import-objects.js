// File-picker preview flows. Nothing here writes to disk — a static dev
// server can't do that from browser JS — these only decode what the author
// picked so the rest of the editor has something to draw/place.
import { defaultObjectFlags } from "../../src/level/level-schema.js";

// Object-definition shape produced by the object maker and consumed by the
// level editor's palette — not a placed instance (no id/x/y/zIndex/trigger),
// just what a new instance should start as:
// { name, sprite, width, height, rotation, flags, hitboxPolygon }
export function defaultObjectDefinition() {
  return {
    name: "untitled-object",
    sprite: "",
    width: 60,
    height: 60,
    rotation: 0,
    flags: defaultObjectFlags(),
    hitboxPolygon: null,
  };
}

// Resolves once the picked image has decoded, so callers immediately know
// its natural size (used as the object definition's default width/height).
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ file, url, image, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`could not decode image: ${file.name}`));
    };
    image.src = url;
  });
}

export async function readObjectDefinitionFile(file) {
  const json = JSON.parse(await file.text());
  const base = defaultObjectDefinition();
  return { ...base, ...json, flags: { ...base.flags, ...json.flags } };
}

export async function readObjectDefinitionFiles(fileList) {
  return Promise.all(Array.from(fileList).map(readObjectDefinitionFile));
}
