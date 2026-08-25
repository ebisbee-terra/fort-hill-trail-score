// Hysteresis on waypoint arrival: fires once gain crosses buzzAt, re-arms
// only once gain drops back below rearmAt. Stops someone loitering on a
// boundary from being buzzed repeatedly.
export function createArrivalTracker(ids, { buzzAt = 0.85, rearmAt = 0.5 } = {}) {
  const armed = Object.fromEntries(ids.map((id) => [id, true]));

  function update(gains) {
    const arrived = [];
    for (const id of ids) {
      const g = gains[id] ?? 0;
      if (g >= buzzAt && armed[id]) {
        armed[id] = false;
        arrived.push(id);
      } else if (g < rearmAt && !armed[id]) {
        armed[id] = true;
      }
    }
    return arrived;
  }

  return { update };
}
