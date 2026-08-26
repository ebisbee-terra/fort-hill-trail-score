export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Fraction of the (overlap-widened) radius that's a flat full-gain plateau,
// rather than gain=1 existing only at the exact center point. A single-point
// peak is fragile to any position noise/lag (EMA smoothing, real GPS jitter)
// and works against the goal of spending real time inside 2-3 full layers —
// a plateau is forgiving of both and gives "arrived" a real zone to live in,
// not an instant.
export const INNER_PLATEAU_FRACTION = 0.45;

// Flat gain=1 out to the inner plateau, then smoothstep falloff from there
// out to the outer (overlap-widened) radius, then 0. overlapFactor widens
// (>1) or narrows (<1) the effective outer radius without changing the
// authored radius itself — the knob for how long someone spends inside
// overlapping layers versus a single stem.
export function gainForDistance(d, radius, overlapFactor = 1, innerFraction = INNER_PLATEAU_FRACTION) {
  const outer = radius * overlapFactor;
  const inner = outer * innerFraction;
  if (d <= inner) return 1;
  if (outer <= inner) return 0; // degenerate radius, avoid divide-by-zero
  return smoothstep(clamp(1 - (d - inner) / (outer - inner), 0, 1));
}

export function computeGains(position, waypoints, overlapFactor = 1) {
  const gains = {};
  for (const w of waypoints) {
    gains[w.id] = gainForDistance(
      distance(position.x, position.y, w.x, w.y),
      w.radius,
      overlapFactor
    );
  }
  return gains;
}
