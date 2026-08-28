export const LIMB_KEYS = ["w", "i", "s", "k", "d", "l", "a", "j"];

export function createInput(target = window) {
  const held = new Set();
  const justPressed = new Set();

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (!held.has(key)) justPressed.add(key);
    held.add(key);
  }
  function onKeyUp(event) {
    held.delete(event.key.toLowerCase());
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return {
    isHeld(key) {
      return held.has(key);
    },
    isJustPressed(key) {
      return justPressed.has(key);
    },
    hasAnyJustPressed() {
      return justPressed.size > 0;
    },
    endTick() {
      justPressed.clear();
    },
  };
}
