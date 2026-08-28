export function setupCreditsScreen() {
  const screen = document.getElementById("credits-screen");
  return {
    show() {
      screen.hidden = false;
    },
    hide() {
      screen.hidden = true;
    },
  };
}
