const LATE_IMAGE = { src: "./assets/scene/angry_boss_end.png", alt: "Your angry boss, glaring at you for being late" };
const ON_TIME_IMAGE = { src: "./assets/scene/angry_boss_end.png", alt: "Your boss, satisfied that you made it back to work on time" };

export function setupWinScreen() {
  const screen = document.getElementById("win-screen");
  const image = document.getElementById("win-image");
  const message = document.getElementById("win-message");
  const stats = document.getElementById("win-stats");
  const prompt = document.getElementById("win-prompt");

  return {
    show(elapsedSeconds, deathCount, onTime) {
      const variant = onTime ? ON_TIME_IMAGE : LATE_IMAGE;
      image.src = variant.src;
      image.alt = variant.alt;
      message.textContent = onTime ? "You're on time. Now Get to Work!" : "You're late. Fired.";
      stats.textContent = `Time: ${elapsedSeconds.toFixed(1)}s — Deaths: ${deathCount}`;
      prompt.textContent = onTime ? "Press any key to roll credits" : "Press any key to return to the menu";
      screen.hidden = false;
    },
    hide() {
      screen.hidden = true;
    },
  };
}
