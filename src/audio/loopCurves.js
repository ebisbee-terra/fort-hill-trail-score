// Equal-power fade curves for masking the loop seam on stems that aren't
// (yet) trimmed to an exact bar length. Equal-power (rather than linear)
// keeps perceived loudness constant through the overlap instead of dipping.
const CURVE_STEPS = 50;

function buildCurve(shape) {
  const values = new Float32Array(CURVE_STEPS);
  for (let i = 0; i < CURVE_STEPS; i++) {
    values[i] = shape(i / (CURVE_STEPS - 1));
  }
  return values;
}

export const FADE_IN_CURVE = buildCurve((x) => Math.sin((x * Math.PI) / 2));
export const FADE_OUT_CURVE = buildCurve((x) => Math.cos((x * Math.PI) / 2));
