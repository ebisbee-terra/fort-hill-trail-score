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
export function gainForDistance(d, radius) {
  return smoothstep(clamp(1 - d / radius, 0, 1));
}

export function computeGains(position, waypoints) {
  const gains = {};
  for (const w of waypoints) {
    gains[w.id] = gainForDistance(distance(position.x, position.y, w.x, w.y), w.radius);
  }
  return gains;
}
