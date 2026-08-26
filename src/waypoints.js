// Waypoint geometry + metadata (no audio here — see src/audio/stemManifest.js).
//
// x/y are real coordinates in meters, projected from OSM data (equirectangular,
// x=east, y=south — i.e. screen/SVG convention, north renders toward smaller y),
// centered on the Rocky River Nature Center (41.4090491, -81.8840210, CLAUDE.md's
// verified anchor). Source: an Overpass export of the actual Fort Hill Loop Trail,
// Fort Hill Stairs, and connecting walkway, stitched and walked programmatically
// (Valley Parkway lot -> Woodland Loop Trail -> West Channel Pond Loop Trail
// -> stairs -> connector -> Fort Hill Loop). See src/trailPath.js for the
// full walked polyline these were derived from, and its header for a note
// on a walkway-routing correction against a user-marked-up map screenshot.
//
// Confidence varies per waypoint — see `note` on each:
//   - walkway, stairs: anchored to verified/real coordinates.
//   - overlook: confirmed via OSM connector topology + a user-provided
//     "uphill" screenshot (the stairs' far endpoint from the base, matching
//     CLAUDE.md's ~78m horizontal fact, connects via a short path to the loop).
//   - north_rim: objectively data-derived (max-latitude point on the real loop).
//   - earthwork, ridge: NOT derivable from OSM (earthworks are a National
//     Register site, deliberately unmapped; "ridge" isn't a taggable feature).
//     Placed heuristically to keep 80m+ spacing and fill the long north_rim-to-
//     ridge stretch CLAUDE.md's own open questions flag as a concern. Treat
//     these two as provisional until confirmed on the ground or via a
//     field-recorded GPX walk.
//
// One surprise from this process: the user's own recorded "Fort Hill Stairs
// (base)" GPS coordinate sits ~52m from the real OSM base node — almost
// certainly the canopy/cliff GPS-reflection drift CLAUDE.md itself warns
// about, not a bad reading. The OSM-confirmed node is used here instead.
//
// radius (meters) = 0.6x the shorter distance to an adjacent waypoint, so that
// once OVERLAP_FACTOR (usePositionEngine.js) widens it, neighbors blend
// 2-3 deep rather than bleeding across the whole trail.

export const WAYPOINTS = [
  { id: "walkway", name: "The Walkway", x: 168.45, y: 44.99, radius: 150.0,
    note: "moved closer to the Valley Parkway entrance, ~15% along the corrected walkway; radius widened since the gap to Stairs is a real ~250m here" },
  { id: "stairs", name: "Foot of the Stairs", x: -74.82, y: -28.31, radius: 37.0,
    note: "real OSM base-of-stairs node; ~52m from the recorded GPS reading, likely canopy/cliff drift" },
  { id: "overlook", name: "The Overlook", x: -134.86, y: -14.17, radius: 52.0,
    note: "top of stairs / loop entry, confirmed via OSM connector + uphill screenshot; radius bumped from 37 (see northrim note)" },
  { id: "northrim", name: "North Rim", x: -258.91, y: -139.56, radius: 85.0,
    note: "max-latitude point on the real loop (data-derived); radius bumped from 69.6 -- the 0.6x-shorter-neighbor-gap formula sized both this and overlook off their OTHER (closer) neighbor, leaving a real ~16.5m dead zone between the two of them specifically (176.4m gap vs 159.9m combined reach) -- confirmed live, every stem hit 0 in that stretch" },
  { id: "earthwork", name: "The Earthworks", x: -369.85, y: -105.84, radius: 69.6,
    note: "UNCONFIRMED - not tagged in OSM (sensitive site) - verify on the ground" },
  { id: "ridge", name: "East Ridge", x: -458.05, y: -16.11, radius: 75.5,
    note: "UNCONFIRMED - heuristic placement - verify on the ground" },
  { id: "return", name: "The Return", x: -307.56, y: 42.88, radius: 97.0,
    note: "~180m before the loop closes back toward the stairs (heuristic)" },
];
