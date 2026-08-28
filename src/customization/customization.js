import { HANDS_COLORS, PANTS_COLORS, SHIRT_COLORS, SHOES_COLORS } from "./palette.js";

export function defaultCustomization() {
  return {
    head: "male_00",
    colors: {
      shirt: SHIRT_COLORS[0],
      pants: PANTS_COLORS[0],
      shoes: SHOES_COLORS[0],
      hands: HANDS_COLORS[0],
    },
  };
}
