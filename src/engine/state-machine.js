// Small explicit FSM: MENU -> PLAYING -> DEAD_AMBULANCE -> DEAD_BILL ->
// RESPAWNING -> PLAYING, and PLAYING -> WON -> MENU (late) or
// PLAYING -> WON -> CREDITS -> MENU (on time, game_design.md §6).
// `handlers[state]` may define `onEnter(context)` and `onExit(context)`.
export function createStateMachine(initialState, handlers, context) {
  let current = initialState;

  function transitionTo(next) {
    handlers[current]?.onExit?.(context);
    current = next;
    handlers[current]?.onEnter?.(context);
  }

  handlers[current]?.onEnter?.(context);

  return {
    getState() {
      return current;
    },
    transitionTo,
  };
}
