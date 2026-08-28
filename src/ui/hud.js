export function setupHud() {
  const hud = document.getElementById("hud");
  const timerEl = document.getElementById("hud-timer");
  const deathsEl = document.getElementById("hud-deaths");

  return {
    show() {
      hud.hidden = false;
    },
    hide() {
      hud.hidden = true;
    },
    update(elapsedSeconds, deathCount) {
      timerEl.textContent = `${elapsedSeconds.toFixed(1)}s`;
      deathsEl.textContent = `Deaths: ${deathCount}`;
    },
  };
}
