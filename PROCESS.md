# Process overview

A reading-guide to how the work came together --- a map to your process, not an
essay about it.

## What I built

**Get To Work** is a QWOP-style Foddian game: a ragdoll office worker, rotated
one limb-joint at a time with no direct movement key, has to stagger from home
to the office without letting any part of their body touch a hazard or the
ground before they get there. A hand-rolled fixed-timestep engine drives the
kinematic ragdoll and hitbox collision; every level and object is authored as
JSON data in a separate browser-based editor rather than hardcoded into the
engine, and missing the 300-second cutoff swaps the ending from "You're Fired"
to a scrolling credits screen.

## The moments that mattered

1. **Separating the editor from the engine instead of building levels straight
   into it.** `game_design.md` set out a developer-only level/object editor as
   a first-class feature, not a build script --- importing sprites, drawing
   hitboxes, and saving objects and levels as JSON the game loads at runtime.
   I judged that leaving an agent to invent art direction and level layout
   inline with engine code wouldn't add up to a cohesive feel, and that
   keeping the two apart would let me redesign a level without touching engine
   code at all. I knew it held up when playtesting a level for a minute was
   enough to feel the physics and ask for one specific change, rather than a
   rebuild
   ([`8318724...f9f7ee0`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Da-W1nn3r/compare/8318724...f9f7ee0)).

2. **Writing the losing rule's test before the game existed.**
   `spec/crit-5.test.ts` asserts `outcomeOf({ bodyHit: true, reachedWork: false
   })` returns `"lost"`, against a plain function pulled out of `main.js`
   rather than simulated keystrokes --- deliberately red on commit, since
   neither the function nor the game were there yet. It only went green once
   the real engine, rules and `outcomeOf` landed, so the contract drove the
   implementation instead of being reverse-engineered from it afterwards
   ([`0b563ba...8318724`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Da-W1nn3r/compare/0b563ba...8318724)).

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that a
reflection entry the marker reads is in `reflections/`, and that your
`CLAUDE.md` is there --- before a marker ever opens the file. It checks that
your map is traceable, not that it is good: the marker judges whether your
small, deliberately chosen set of moments shows real judgement and reflection. A
green check is not a substitute for that curation.

Images aren't checked: whether one renders is visible the moment you look. Open
this file on GitHub and look at it before you ship.


1. What was the breakthrough that moved the work forward?
I knew that Claude was bad at designing many of the things that humans interact with such as the level. And I knew that it was much better at making more general tools and things with a more explicit design requirement. Having it make the tool to make the thing I wanted was much more effective than than telling it to make a level or something like that.

2. What did this work change about who I want to be as a software developer?
I think Claude and other similar agentic tools would be useful to use them where there are clear defined goals such as making a level editor with these features. These agentic tools seem really good at that kind of task but fail at other concepts that require subjective judgement or more vibes based words. 