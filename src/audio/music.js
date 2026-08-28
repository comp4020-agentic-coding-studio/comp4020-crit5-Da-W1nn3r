// Background music. Normal mode cycles a playlist, moving to the next track
// once the current one finishes; hardcore ("I don't need Insurance") mode
// has only Latin Industries, so it loops that one track directly instead.
// Menu and credits share a single Digital Lemonade loop.
const AUDIO_BASE = new URL("../../assets/audio/", import.meta.url);

const PLAYLISTS = {
  menu: ["Digital_20Lemonade.mp3"],
  normal: ["Overworld.mp3", "Pixelland.mp3", "The_20Builder.mp3"],
  hardcore: ["Latin_20Industries.mp3"],
};

const MUTE_STORAGE_KEY = "get-to-work.music-muted";

function loadMutedPreference() {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveMutedPreference(value) {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(value));
  } catch {
    // e.g. private browsing with storage disabled — muting still works for
    // this session, it just won't be remembered next time.
  }
}

let currentAudio = null;
let currentMode = null;
let muted = loadMutedPreference();

function playTrack(mode, index) {
  const playlist = PLAYLISTS[mode];
  const audio = new Audio(new URL(playlist[index], AUDIO_BASE).href);
  audio.muted = muted;
  audio.loop = playlist.length === 1;
  audio.addEventListener("ended", () => {
    if (currentAudio !== audio) return;
    playTrack(mode, (index + 1) % playlist.length);
  });
  audio.play().catch(() => {});
  currentAudio = audio;
}

export function startMusic(mode) {
  if (currentMode === mode && currentAudio) return;
  stopMusic();
  currentMode = mode;
  playTrack(mode, 0);
}

export function stopMusic() {
  currentAudio?.pause();
  currentAudio = null;
  currentMode = null;
}

// Pauses/resumes the current track in place (as opposed to stopMusic/
// startMusic, which drop and re-pick a track from the top of its playlist)
// so the pause menu doesn't restart the song underneath it.
export function pauseMusic() {
  currentAudio?.pause();
}

export function resumeMusic() {
  currentAudio?.play().catch(() => {});
}

export function isMusicMuted() {
  return muted;
}

export function setMusicMuted(value) {
  muted = value;
  if (currentAudio) currentAudio.muted = muted;
  saveMutedPreference(muted);
}

export function toggleMusicMuted() {
  setMusicMuted(!muted);
  return muted;
}

// The menu track's first play() attempt (page load, before any click/
// keypress) is blocked by the browser's autoplay policy; retry once on the
// first real user gesture instead of staying silent for the rest of the
// session.
if (typeof document !== "undefined") {
  const resumeOnFirstGesture = () => {
    currentAudio?.play().catch(() => {});
  };
  document.addEventListener("pointerdown", resumeOnFirstGesture, { once: true });
  document.addEventListener("keydown", resumeOnFirstGesture, { once: true });
}
