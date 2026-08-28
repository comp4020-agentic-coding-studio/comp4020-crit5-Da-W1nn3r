import { playerGeometry } from "../entities/player.js";

const SKY_COLOR = "#bcd6ee";
const GROUND_COLOR = "#5b8a3c";
const GROUND_LINE_COLOR = "#3f6329";

// Draws everything camera-relative. Draw order (back to front): ground →
// level objects by zIndex → checkpoints/end → ambulance (death sequence
// only) → player, head topmost (game_design.md §2). Checkpoints are skipped
// entirely in hardcore mode, where they never set a respawn point anyway.
export function render(ctx, canvas, world) {
  const { camera, level, levelObjects, player, ambulance, sprites, touchedCheckpoints, customization, hideCheckpoints } = world;

  ctx.save();
  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-camera.x, -camera.y);

  drawGround(ctx, level, camera);
  drawObjects(ctx, levelObjects);
  if (!hideCheckpoints) drawCheckpoints(ctx, level.checkpoints, touchedCheckpoints, sprites);
  drawEndTrigger(ctx, level.end);
  if (ambulance) drawRect(ctx, ambulance, "#e2e2e2", sprites.ambulance);
  drawPlayer(ctx, player, customization, sprites);

  ctx.restore();
}

function drawGround(ctx, level, camera) {
  const left = camera.x - 50;
  const right = camera.x + camera.width + 50;
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(left, level.groundY, right - left, camera.height);
  ctx.strokeStyle = GROUND_LINE_COLOR;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(left, level.groundY);
  ctx.lineTo(right, level.groundY);
  ctx.stroke();
}

function drawObjects(ctx, levelObjects) {
  const sorted = [...levelObjects].sort((a, b) => a.zIndex - b.zIndex);
  for (const object of sorted) drawRect(ctx, object, "#a33", object.image);
}

function drawCheckpoints(ctx, checkpoints, touchedCheckpoints, sprites) {
  for (const checkpoint of checkpoints) {
    const image = touchedCheckpoints.has(checkpoint.id) ? sprites.checkpointTrue : sprites.checkpointFalse;
    const size = 40;
    ctx.drawImage(image, checkpoint.x - size / 2, checkpoint.y - size, size, size);
  }
}

function drawEndTrigger(ctx, end) {
  ctx.fillStyle = "rgba(60, 40, 20, 0.55)";
  ctx.fillRect(end.x, end.y - end.height, end.width, end.height);
  ctx.fillStyle = "#f4e7c3";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("WORK", end.x + end.width / 2, end.y - end.height - 10);
  ctx.textAlign = "left";
}

function drawRect(ctx, rect, color, image) {
  ctx.save();
  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.rotate(rect.rotation ?? 0);
  if (image && image.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
  }
  ctx.restore();
}

function drawPlayer(ctx, player, customization, sprites) {
  drawCharacter(ctx, playerGeometry(player), customization, sprites);
}

// Draws a customized character from its geometry — same shape whether that
// geometry comes from a live ragdoll (drawPlayer, above) or the static
// standing pose used by the menu's customization preview (see
// standingPoseGeometry() in ragdoll.js and src/ui/character-preview.js) —
// so the preview can never visually drift from how the game itself renders
// the same customization.
export function drawCharacter(ctx, geometry, customization, sprites) {
  const colors = customization.colors;

  drawRect(ctx, geometry.rightLeg, colors.pants);
  drawRect(ctx, geometry.leftLeg, colors.pants);
  drawRect(ctx, geometry.rightShoe, colors.shoes);
  drawRect(ctx, geometry.leftShoe, colors.shoes);
  drawRect(ctx, geometry.waist, colors.pants);
  drawRect(ctx, geometry.body, colors.shirt);
  drawRect(ctx, geometry.rightArm, colors.shirt);
  drawRect(ctx, geometry.leftArm, colors.shirt);
  drawRect(ctx, geometry.rightHand, colors.hands);
  drawRect(ctx, geometry.leftHand, colors.hands);

  const headSet = geometry.facingFront ? sprites.headFront : sprites.headSide;
  const headImage = headSet[customization.head];
  drawRect(ctx, geometry.head, "#e0b389", headImage);
}
