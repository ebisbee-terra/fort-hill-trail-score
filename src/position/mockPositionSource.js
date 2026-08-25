// Stands in for real GPS: walks a point along a path of [x, y] vertices
// (meters) at a configurable speed, bouncing back at each end rather than
// wrapping — this is a one-way trail, and the real walk is there-and-back
// (down the same stairs, back through the same walkway), not a closed loop.
// Ported from the prototype's walkRef/trueRef leg-interpolation. Kept behind
// tick()/getCurrent() so a real geolocation source can implement the same
// shape later without touching the rest of the position pipeline.
const BASE_SPEED = 1.35; // meters per second at speedMultiplier = 1

function distanceBetween([ax, ay], [bx, by]) {
  return Math.hypot(ax - bx, ay - by);
}

export function createMockPositionSource({ path }) {
  if (!path || path.length < 2) {
    throw new Error("createMockPositionSource requires a path of at least 2 points");
  }

  const lastLeg = path.length - 2;
  let s = 0; // continuous position: integer part = leg index, fraction = t along it
  let direction = 1; // 1 = walking forward (outbound), -1 = walking back
  let current = { x: path[0][0], y: path[0][1] };

  function tick(dtSeconds, speedMultiplier = 1) {
    const leg = Math.min(Math.floor(s), lastLeg);
    const legLength = Math.max(distanceBetween(path[leg], path[leg + 1]), 1);

    s += (direction * BASE_SPEED * speedMultiplier * dtSeconds) / legLength;
    if (s >= path.length - 1) {
      s = path.length - 1;
      direction = -1;
    } else if (s <= 0) {
      s = 0;
      direction = 1;
    }

    const nextLeg = Math.min(Math.floor(s), lastLeg);
    const t = s - nextLeg;
    const [ax, ay] = path[nextLeg];
    const [bx, by] = path[nextLeg + 1];
    current = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    return current;
  }

  function getCurrent() {
    return current;
  }

  return { tick, getCurrent };
}
