// Level objects are driven entirely by their level-data flags (see
// game_design.md §8) — there is no per-object behaviour class. `physics`
// and `physicsWithEvent` are reserved and unwired until a level needs them.
export function createLevelObjects(level, resolveAssetUrl) {
  return level.objects.map((data) => ({
    ...data,
    image: loadImage(resolveAssetUrl(data.sprite)),
  }));
}

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}
