// Pure win/loss rule. No DOM, no canvas, no keystrokes — the same function
// spec/crit-5.test.ts calls directly is the function the live game calls
// every tick, so tested logic and shipped logic can't drift apart.
export function outcomeOf(state) {
  if (state.bodyHit) return "lost";
  if (state.reachedWork) return "won";
  return "playing";
}
