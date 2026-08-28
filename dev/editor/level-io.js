// Load/new/save level JSON through the exact schema the game itself loads
// (src/level/level-schema.js) so the editor can never produce a level the
// game's loader would coerce differently.
import { defaultLevel, validateLevel } from "../../src/level/level-schema.js";

export function newLevel() {
  return defaultLevel();
}

export function readLevelFile(file) {
  return file.text().then((text) => validateLevel(JSON.parse(text)));
}

// Strips the view helpers `validateLevel` doesn't add (it returns plain
// data) back down to a plain, JSON-serializable level object — kept as a
// no-op passthrough since validateLevel already returns plain data, but
// named so callers don't have to know that.
export function toPlainLevel(level) {
  return JSON.parse(JSON.stringify(level));
}

export async function saveLevel(level) {
  await downloadJsonFile(toPlainLevel(level), `${level.id || "level"}.json`);
}

// Generic "save this JSON to disk" used by both level saves and object-def
// saves. Prefers showSaveFilePicker (lets the author write straight into
// assets/levels/ or assets/objects/); falls back to a plain download
// link when unsupported (Firefox, Safari) or the user cancels the picker.
export async function downloadJsonFile(data, suggestedName) {
  const text = JSON.stringify(data, null, 2);
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      // Fall through to the download-link path for any other failure.
    }
  }
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  URL.revokeObjectURL(url);
}
