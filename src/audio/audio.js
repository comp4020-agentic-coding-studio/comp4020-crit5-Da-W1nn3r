// One-shot sound effects. Several events have multiple recorded takes
// ("variants") of the same line — a random one plays each time so the same
// event doesn't sound identical on every death.
const AUDIO_BASE = new URL("../../assets/audio/", import.meta.url);

const HURT_VARIANTS = [
  "hurt_00.m4a",
  "hurt_01.m4a",
  "hurt_02.m4a",
  "hurt_03.m4a",
  "hurt_04.m4a",
  "hurt_05.m4a",
];
const FIRED_VARIANTS = ["fired_00.m4a", "fired_01.m4a"];
const AMBULANCE_SOUND = "ambulance.mp3";
const ON_TIME_SOUND = "on_time.m4a";

function pickVariant(variants) {
  return variants[Math.floor(Math.random() * variants.length)];
}

function playClip(fileName) {
  const audio = new Audio(new URL(fileName, AUDIO_BASE).href);
  audio.play().catch(() => {});
}

// The player just took a lethal hit.
export function playHurtSound() {
  playClip(pickVariant(HURT_VARIANTS));
}

// The ambulance drops in for the death sequence.
export function playAmbulanceSound() {
  playClip(AMBULANCE_SOUND);
}

// "You're Fired" — the win/end screen, late variant.
export function playFiredSound() {
  playClip(pickVariant(FIRED_VARIANTS));
}

// "Now Get to Work!" — the win/end screen, on-time variant.
export function playOnTimeSound() {
  playClip(ON_TIME_SOUND);
}

// Level objects can reserve a `trigger.sound` field (game_design.md §8/§11),
// but no level authors one yet, so this stays a no-op until one does.
export function playTriggerSound(_soundId) {}
