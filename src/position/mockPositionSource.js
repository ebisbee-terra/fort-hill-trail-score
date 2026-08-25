// Stands in for real GPS: walks a point along a path of scene-unit [x, y]
// vertices at a configurable speed, wrapping back to the start at the end.
// Ported from the prototype's walkRef/trueRef leg-interpolation. Kept behind
// tick()/getCurrent() so a real geolocation source can implement the same
// shape later without touching the rest of the position pipeline.
const BASE_SPEED = 1.35; // scene units per second at speedMultiplier = 1

function distanceBetween([ax, ay], [bx, by]) {
  return Math.hypot(ax - bx, ay - by);
}

export function createMockPositionSource({ path }) {
  if (!path || path.length < 2) {
    throw new Error("createMockPositionSource requires a path of at least 2 points");
  }

  let leg = 0;
  let t = 0;
  let current = { x: path[0][0], y: path[0][1] };

  function tick(dtSeconds, speedMultiplier = 1) {
    const a = path[leg];
    const b = path[(leg + 1) % path.length];
    const legLength = Math.max(distanceBetween(a, b), 1);

    t += (BASE_SPEED * speedMultiplier * dtSeconds) / legLength;
    while (t >= 1) {
      t -= 1;
      leg = (leg + 1) % path.length;
    }

    const [ax, ay] = path[leg];
    const [bx, by] = path[(leg + 1) % path.length];
    current = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    return current;
  }

  function getCurrent() {
    return current;
  }

  return { tick, getCurrent };
}
