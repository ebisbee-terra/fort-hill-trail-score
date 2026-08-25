export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Smoothstep falloff on distance from a waypoint, no hard radius edge.
// overlapFactor widens (>1) or narrows (<1) the effective radius used for
// falloff without changing the authored radius itself — the knob for how
// long someone spends inside overlapping layers versus a single stem.
export function gainForDistance(d, radius, overlapFactor = 1) {
  return smoothstep(clamp(1 - d / (radius * overlapFactor), 0, 1));
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
