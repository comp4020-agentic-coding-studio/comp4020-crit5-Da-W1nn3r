import { describe, expect, it } from "vitest";
// Crit 5 ("A game"): "it can be lost — a wrong move is possible, and play
// ends somewhere — a win, a loss or a finish," and the spec asks for one rule
// under a focused automated test. This checks the *rule* directly — a plain
// function exported from main.js — rather than simulating keystrokes or
// clicks, so it survives however you end up capturing input.
//
// Starts red on purpose: there's no game yet. Once you've picked your
// mechanic, replace `outcomeOf` with whatever you actually name your rule,
// and the state below with a real losing input for it.
import { outcomeOf } from "../main.js";

describe("crit 5: one rule ends the round", () => {
  it("a losing move produces a losing outcome", () => {
    // Any part of the player's body has touched a hazard (or the ground) —
    // an instant, unrecoverable loss, whatever else is true of the rest of
    // the state.
    expect(outcomeOf({ bodyHit: true, reachedWork: false })).toBe("lost");
  });
});
