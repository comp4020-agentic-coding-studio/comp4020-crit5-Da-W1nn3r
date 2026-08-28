export function setupDeathScreen() {
  const screen = document.getElementById("death-screen");
  return {
    show() {
      screen.hidden = false;
    },
    hide() {
      screen.hidden = true;
    },
  };
}
