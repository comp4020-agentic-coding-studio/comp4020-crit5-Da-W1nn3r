export function setupMuteButton({ isMuted, onToggle }) {
  const button = document.getElementById("mute-button");

  function render(muted) {
    button.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
  }

  render(isMuted());
  button.addEventListener("click", () => {
    render(onToggle());
  });
}
