import { standingPoseGeometry } from "../physics/ragdoll.js";
import { drawCharacter } from "../render/renderer.js";

const GROUND_MARGIN = 10; // px of headroom below the feet, inside the canvas

// Draws a static standing pose of the customized character on its own
// canvas in the menu — there's no ragdoll instance yet at this point (that's
// only created once "Start" is pressed), so this reads standingPoseGeometry()
// instead of a physics body. Call render() again whenever `customization` is
// mutated (menu.js does, via its onChange callback) since nothing here
// polls for changes on its own.
export function setupCharacterPreview({ customization, sprites }) {
  const canvas = document.getElementById("character-preview");
  const ctx = canvas.getContext("2d");
  const centerX = canvas.width / 2;
  const groundY = canvas.height - GROUND_MARGIN;

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCharacter(ctx, standingPoseGeometry(centerX, groundY), customization, sprites);
  }

  // Head sprites are loaded async (see sprites.js); a click fast enough to
  // render before they've decoded would otherwise leave the fallback color
  // rect on screen for good, since nothing else re-renders the menu.
  for (const image of Object.values(sprites.headFront)) {
    image.addEventListener("load", render);
  }

  render();
  return { render };
}
