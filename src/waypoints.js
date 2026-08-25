// Waypoint geometry + metadata (no audio here — see src/audio/stemManifest.js).
// x/y are the prototype's hand-drawn scene-unit coordinates, carried over as
// placeholders. CLAUDE.md is explicit these are not real trail geometry —
// replace with OSM/GPX-derived coordinates before this ships.

export const WAYPOINTS = [
  { id: "walkway", name: "The Walkway", x: 310, y: 608, radius: 175 },
  { id: "stairs", name: "Foot of the Stairs", x: 140, y: 535, radius: 110 },
  { id: "overlook", name: "The Overlook", x: 100, y: 470, radius: 105 },
  { id: "earthwork", name: "The Earthworks", x: 90, y: 378, radius: 120 },
  { id: "northrim", name: "North Rim", x: 170, y: 235, radius: 125 },
];
