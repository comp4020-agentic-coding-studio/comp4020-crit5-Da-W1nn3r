// Fastest completed run per mode, remembered the same way music.js
// remembers the mute preference — localStorage, guarded for private
// browsing/storage-disabled environments (falls back to "no best yet"
// rather than throwing).
const STORAGE_KEY = "get-to-work.best-times";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(times) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(times));
  } catch {
    // Best time still shows for the rest of this session, it just won't be
    // remembered next time.
  }
}

export function getBestTime(mode) {
  return load()[mode] ?? null;
}

// Records `seconds` as the best for `mode` if it beats (or is the first)
// stored time, and reports whether it did.
export function recordTime(mode, seconds) {
  const times = load();
  if (times[mode] !== undefined && times[mode] <= seconds) return false;
  times[mode] = seconds;
  save(times);
  return true;
}
