// Small preloaded-image registry shared by the renderer and the UI screens
// — every sprite the shipped game draws outside of level objects (which
// load their own image per game_design.md §8).
function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

export function createSprites(assetsBaseUrl) {
  const at = (path) => new URL(path, assetsBaseUrl).href;
  return {
    checkpointFalse: loadImage(at("objects/checkpoint_false.png")),
    checkpointTrue: loadImage(at("objects/checkpoint_true.png")),
    ambulance: loadImage(at("objects/ambulance.png")),
    headFront: {
      male_00: loadImage(at("player_head/male_00_front.png")),
      female_00: loadImage(at("player_head/female_00_front.png")),
    },
    headSide: {
      male_00: loadImage(at("player_head/male_00_side.png")),
      female_00: loadImage(at("player_head/female_00_side.png")),
    },
    angryBossEnd: loadImage(at("scene/angry_boss_end.png")),
    medicalBillDeath: loadImage(at("scene/medical_bill_death.png")),
  };
}
