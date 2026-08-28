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
//   - parking_lot, walkway, stairs, overlook: all anchored to real
//     coordinates now, cross-checked against two fresh OSM exports (full
//     <osm> XML files, not screenshots) -- see the correction notes below.
//   - north_rim: objectively data-derived (max-latitude point on the real
//     loop) -- confirmed in the same exports, sub-meter match.
//   - earthwork, ridge: NOT derivable from OSM (earthworks are a National
//     Register site, deliberately unmapped; "ridge" isn't a taggable feature).
//     Placed heuristically to keep 80m+ spacing and fill the long north_rim-to-
//     ridge stretch CLAUDE.md's own open questions flag as a concern. Treat
//     these two as provisional until confirmed on the ground or via a
//     field-recorded GPX walk.
//
// CORRECTION (this session, second export): `parking_lot` and `walkway`
// were still sitting on a screenshot-guessed route -- the first OSM export's
// bounding box stopped short of Valley Parkway, so it couldn't confirm or
// fix that leg. A second, wider export reaches Valley Parkway, and rather
// than eyeball it again, this leg was resolved by running an actual
// shortest-path search (Dijkstra) over every walkable way in that export,
// from the real Woodland-Loop-Trail/Valley-Parkway junction to the real
// stairs-top node. See trailPath.js's header for the full story, including
// the fact that the original placeholder diagonal (before any screenshot
// was involved) turned out to already be closer to this real path than the
// screenshot-guessed route that replaced it.
//
// CORRECTION (this session, against the fresh export): `stairs` and
// `overlook` had their coordinates swapped. The real Fort Hill Stairs way is
// one OSM way with 6 nodes between two endpoints; one endpoint sits ~13m
// from the user's own field-recorded "Fort Hill Stairs (base)" GPS reading,
// the other ~52m from it. The coordinate at the ~52m-off endpoint had been
// assigned to `stairs`, and the ~13m-off endpoint to `overlook` -- backwards.
// The old "~52m, likely canopy/cliff GPS drift" comment that used to live
// here was actually just measuring the distance to the wrong node; the
// user's field reading was fine. Fixed by swapping the two coordinates
// (kept each id's own radius, since that reflects compositional intent --
// Overlook as the lingering payoff vs Stairs as a brief transitional touch,
// per CLAUDE.md -- not the physical node).
//
// The export has no elevation data, so which end is physically uphill
// couldn't be settled from it alone -- confirmed directly by the user
// instead: Overlook is the top, Foot of the Stairs is the bottom.
//
// CORRECTION (this session, third pass): the swap above assigned "bottom"
// to whichever staircase endpoint sat closest to the user's own recorded
// base GPS reading (13m vs 52m) -- reasonable evidence, but not the same
// thing as ground truth, and it doesn't actually settle east/west; it only
// settles which end is uphill. The user has since confirmed the east/west
// layout directly: Foot of the Stairs renders on the right (east, the node
// nearer Walkway/the Nature Center side) and Overlook on the left (west,
// the node nearer the loop). That's the OPPOSITE of what the GPS-distance
// reasoning above concluded -- swapped back to match. Left the earlier
// reasoning in place above rather than deleting it, since it's a real
// example of two individually-reasonable signals (a GPS reading vs.
// firsthand knowledge of the park) disagreeing, and firsthand knowledge won.
//
// radius (meters) = 0.6x the shorter distance to an adjacent waypoint, so that
// once OVERLAP_FACTOR (usePositionEngine.js) widens it, neighbors blend
// 2-3 deep rather than bleeding across the whole trail.
//
// Combined-gain floor: no point on the trail should ever sum to less than
// 0.70 across all stems at once, even mid-fade between waypoints -- a
// leisurely pace spends real time in those gaps, and a near-silent stretch
// reads as boring or broken, not atmospheric. Walked the corrected
// trailPath.js at 2m resolution to check (see the analysis this shipped
// with); two spots needed more than an isotropic radius bump to fix without
// bleeding circles across unrelated parts of the folded loop, so they carry
// an optional `stretch: { towardId, factor }` -- see waypointGain.js's
// effectiveDistance. It bulges the zone into a half-ellipse reaching toward
// one named neighbor (stays circular on every other side), rather than
// inflating the whole radius just to cover one direction:
//   - stairs <-> walkway: the ~215m gap past the Nature Center loop is the
//     single longest stretch on the trail with only two stems that could
//     ever cover it; both lean toward each other. (Stairs is the east/right
//     node here -- see the east/west correction note above.)
//   - overlook <-> northrim: quiet for a long stretch despite real overlap
//     on paper -- both lean toward each other too. (Overlook is the
//     west/left node -- same correction.)
// The remaining gaps (past ridge, toward return) closed with a smaller
// radius nudge instead, since they're single-sided thin spots on waypoints
// that don't have one dominant neighbor direction to lean into.

export const WAYPOINTS = [
  { id: "parking_lot", name: "The Parking Lot", x: 157.84, y: 28.60, radius: 55.0,
    note: "the lot polygon's own centroid (167.19, 23.87) sat 10.5m off the trail line itself -- nudged onto the nearest point on trailPath.js instead, per user feedback that it visibly wasn't on the trail. Still inside the real lot's footprint (~59m x ~112m from the OSM export), just on the edge nearer the walked path rather than the shape's geometric middle. Radius unchanged at 55. No audio stem assigned yet, same as ridge/return below" },
  { id: "walkway", name: "The Walkway", x: 100.12, y: -18.01, radius: 130.0,
    note: "real OSM node on the shortest-path route from the lot to the stairs (see trailPath.js/correction note above), placed for even ~180m spacing to both Parking Lot and Overlook -- close to the old (screenshot-guessed) position by coincidence, so no ellipse stretch is needed here anymore; isotropic radius already covers both gaps" },
  { id: "stairs", name: "Foot of the Stairs", x: -75.01, y: -28.28, radius: 37.0,
    stretch: { towardId: "walkway", factor: 1.4 },
    note: "the east (right-hand) end of the real 6-node staircase way, per the user's direct east/west confirmation (see correction note above) -- the end nearer Walkway / the Nature Center side, not the end nearer the user's own recorded base GPS point. Leans toward Walkway (see floor note above)" },
  { id: "overlook", name: "The Overlook", x: -135.21, y: -14.15, radius: 52.0,
    stretch: { towardId: "northrim", factor: 1.6 },
    note: "the west (left-hand) end of the same staircase way, per the user's direct east/west confirmation (see correction note above) -- the end nearer the loop, ~13m from the user's recorded base GPS point. Leans toward North Rim (see floor note above)" },
  { id: "northrim", name: "North Rim", x: -258.91, y: -139.56, radius: 85.0,
    stretch: { towardId: "overlook", factor: 1.6 },
    note: "max-latitude point on the real loop (data-derived); radius bumped from 69.6 -- the 0.6x-shorter-neighbor-gap formula sized both this and its stairs-cluster neighbor off their OTHER (closer) neighbor, leaving a real dead zone between the two of them specifically -- confirmed live, every stem hit 0 in that stretch. Leans toward Overlook now (see correction note above -- Overlook is the west/loop-side node, so it's the one actually near North Rim)" },
  { id: "earthwork", name: "The Earthworks", x: -369.85, y: -105.84, radius: 82.0,
    note: "UNCONFIRMED - not tagged in OSM (sensitive site) - verify on the ground. Radius nudged up from 69.6 to help close the 0.70 combined-gain floor along the far side of the loop (see note above)" },
  { id: "ridge", name: "East Ridge", x: -458.05, y: -16.11, radius: 90.0,
    note: "UNCONFIRMED - heuristic placement - verify on the ground. Radius nudged up from 75.5 -- this stretch of the loop bulges away from every waypoint, so it needed the biggest nudge to hold the 0.70 floor (see note above)" },
  { id: "return", name: "The Return", x: -307.56, y: 42.88, radius: 112.0,
    note: "~180m before the loop closes back toward the stairs (heuristic). Radius nudged up from 97 to help close the 0.70 combined-gain floor along the far side of the loop (see note above)" },
];
