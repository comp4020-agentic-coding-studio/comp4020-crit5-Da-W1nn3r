const FIXED_DT_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 5; // caps the catch-up after a tab was backgrounded

// Fixed-timestep update decoupled from requestAnimationFrame's variable
// render rate, so gameplay math is deterministic regardless of frame rate
// (game_design.md §2).
export function createLoop(update, render) {
  let accumulatorMs = 0;
  let lastTimestamp = null;
  let running = false;
  let frameHandle = null;

  function frame(timestamp) {
    if (!running) return;
    if (lastTimestamp === null) lastTimestamp = timestamp;
    accumulatorMs += timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    let ticks = 0;
    while (accumulatorMs >= FIXED_DT_MS && ticks < MAX_TICKS_PER_FRAME) {
      update(FIXED_DT_MS / 1000);
      accumulatorMs -= FIXED_DT_MS;
      ticks++;
    }
    render();
    frameHandle = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTimestamp = null;
      frameHandle = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
    },
  };
}
