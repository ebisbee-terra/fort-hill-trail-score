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

// A waypoint can optionally carry `stretch: { towardId, factor }` (see
// waypoints.js) to bulge its zone into an ellipse reaching toward one named
// neighbor, instead of a plain circle -- e.g. Foot of the Stairs reaching
// toward The Walkway across a long gap, without also inflating its radius on
// every other side. `factor` > 1 divides distance *only on the neighbor's
// side of the waypoint* (positive dot product with the axis toward it), so
// the falloff is a true half-stretched ellipse: circular behind the
// waypoint, elongated in front. `target` is the neighbor's own {x, y}.
function effectiveDistance(px, py, w, target) {
  const rawDx = px - w.x, rawDy = py - w.y;
  if (!w.stretch || !target) return Math.hypot(rawDx, rawDy);
  const axisDx = target.x - w.x, axisDy = target.y - w.y;
  const axisLen = Math.hypot(axisDx, axisDy);
  if (axisLen === 0) return Math.hypot(rawDx, rawDy);
  const axisX = axisDx / axisLen, axisY = axisDy / axisLen;
  const parallel = rawDx * axisX + rawDy * axisY;
  if (parallel <= 0) return Math.hypot(rawDx, rawDy); // behind the waypoint: unstretched
  const perpX = rawDx - parallel * axisX, perpY = rawDy - parallel * axisY;
  const perp = Math.hypot(perpX, perpY);
  return Math.hypot(parallel / w.stretch.factor, perp);
}

// Traces the boundary at a given "shape distance" (e.g. the outer falloff
// edge, or the inner plateau edge) around a waypoint, honoring `stretch` the
// same way effectiveDistance does -- so the map can draw the true half-
// ellipse contour instead of a plain circle that no longer matches the
// actual gain shape. Pure geometry, no gain math; steps=64 is plenty smooth
// at map scale.
export function ringPoints(w, target, shapeDistance, steps = 64) {
  const points = [];
  let axisX = 0, axisY = 0, hasAxis = false;
  if (w.stretch && target) {
    const axisDx = target.x - w.x, axisDy = target.y - w.y;
    const axisLen = Math.hypot(axisDx, axisDy);
    if (axisLen > 0) {
      axisX = axisDx / axisLen;
      axisY = axisDy / axisLen;
      hasAxis = true;
    }
  }
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const dirX = Math.cos(theta), dirY = Math.sin(theta);
    let k = 1;
    if (hasAxis) {
      const cosA = dirX * axisX + dirY * axisY;
      if (cosA > 0) {
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        k = Math.hypot(cosA / w.stretch.factor, sinA);
      }
    }
    const t = shapeDistance / k;
    points.push({ x: w.x + dirX * t, y: w.y + dirY * t });
  }
  return points;
}

export function computeGains(position, waypoints, overlapFactor = 1) {
  const byId = Object.fromEntries(waypoints.map((w) => [w.id, w]));
  const gains = {};
  for (const w of waypoints) {
    const d = effectiveDistance(position.x, position.y, w, w.stretch && byId[w.stretch.towardId]);
    gains[w.id] = gainForDistance(d, w.radius, overlapFactor);
  }
  return gains;
}
