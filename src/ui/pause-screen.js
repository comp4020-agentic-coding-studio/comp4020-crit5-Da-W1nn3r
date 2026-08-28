export function setupPauseScreen({ onResume, onRestart, onQuit }) {
  const screen = document.getElementById("pause-screen");
  const resumeButton = document.getElementById("resume-button");
  const restartButton = document.getElementById("restart-button");
  const quitButton = document.getElementById("quit-button");

  resumeButton.addEventListener("click", onResume);
  restartButton.addEventListener("click", onRestart);
  quitButton.addEventListener("click", onQuit);

  return {
    show() {
      screen.hidden = false;
    },
    hide() {
      screen.hidden = true;
    },
  };
}
