// Exponential moving average on raw position readings — the first of
// CLAUDE.md's three mandatory smoothing layers. Bad GPS fixes get absorbed
// here before they ever reach gain calculation.
export function createEmaSmoother(alpha, initial) {
  let state = initial;
  return function smooth(sample) {
    if (!state) {
      state = sample;
      return state;
    }
    state = {
      x: state.x + (sample.x - state.x) * alpha,
      y: state.y + (sample.y - state.y) * alpha,
    };
    return state;
  };
}
