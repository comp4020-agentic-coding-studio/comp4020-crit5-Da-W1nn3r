import { HANDS_COLORS, HEAD_OPTIONS, PANTS_COLORS, SHIRT_COLORS, SHOES_COLORS } from "../customization/palette.js";
import { getBestTime } from "../state/best-times.js";

function formatBestTime(seconds) {
  return seconds === null ? "—" : `${seconds.toFixed(1)}s`;
}

// Mutates `customization` in place (the same object the player entity is
// created with), and reports the hardcore ("I don't need Insurance")
// toggle via `onModeChange` — see game_design.md §5/§9. `onChange`
// (optional) fires after every head/color pick, so the character-preview
// canvas can re-render in step with a mutation it has no other way of
// observing.
export function setupMenu({ customization, onStart, onModeChange, onChange }) {
  const screen = document.getElementById("menu-screen");
  const startButton = document.getElementById("start-button");
  const hardcoreToggle = document.getElementById("hardcore-toggle");
  const bestTimeNormal = document.getElementById("best-time-normal");
  const bestTimeHardcore = document.getElementById("best-time-hardcore");

  function refreshBestTimes() {
    bestTimeNormal.textContent = formatBestTime(getBestTime("normal"));
    bestTimeHardcore.textContent = formatBestTime(getBestTime("hardcore"));
  }
  refreshBestTimes();

  renderHeadOptions(customization, onChange);
  renderColorOptions("shirt-options", SHIRT_COLORS, customization, "shirt", onChange);
  renderColorOptions("pants-options", PANTS_COLORS, customization, "pants", onChange);
  renderColorOptions("shoes-options", SHOES_COLORS, customization, "shoes", onChange);
  renderColorOptions("hands-options", HANDS_COLORS, customization, "hands", onChange);

  hardcoreToggle.addEventListener("change", () => {
    onModeChange(hardcoreToggle.checked ? "hardcore" : "normal");
  });
  startButton.addEventListener("click", onStart);

  return {
    show() {
      refreshBestTimes();
      screen.hidden = false;
    },
    hide() {
      screen.hidden = true;
    },
  };
}

function renderHeadOptions(customization, onChange) {
  const container = document.getElementById("head-options");
  for (const option of HEAD_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch-button";
    button.textContent = option.label;
    button.setAttribute("aria-pressed", String(customization.head === option.value));
    button.addEventListener("click", () => {
      customization.head = option.value;
      selectOnly(container, button);
      onChange?.();
    });
    container.appendChild(button);
  }
}

function renderColorOptions(containerId, colors, customization, part, onChange) {
  const container = document.getElementById(containerId);
  for (const color of colors) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch-color";
    button.style.backgroundColor = color;
    button.setAttribute("aria-label", `${part} color ${color}`);
    button.setAttribute("aria-pressed", String(customization.colors[part] === color));
    button.addEventListener("click", () => {
      customization.colors[part] = color;
      selectOnly(container, button);
      onChange?.();
    });
    container.appendChild(button);
  }
}

function selectOnly(container, selected) {
  for (const child of container.children) child.setAttribute("aria-pressed", String(child === selected));
}
