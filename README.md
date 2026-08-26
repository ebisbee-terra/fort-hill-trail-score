# Trail Score — Fort Hill Loop

A location-aware adaptive music walk for Cleveland Metroparks, Rocky River
Reservation. See [CLAUDE.md](./CLAUDE.md) for the full design brief.

This is the real Vite + React app — running in-browser first, with mocked
GPS, before Capacitor gets added. `prototype/trail-score-v3.jsx` is the
earlier Tone.js/SVG simulator kept as a behavioral and visual reference only
(see CLAUDE.md's "Prototype" section) — it is not built on directly.

## What's here so far

Just the audio engine and position pipeline — the core mechanism, with a
minimal dev harness UI to see and hear it working. Not yet built: the paper
map UI, Capacitor wrapper, real trail geometry, weather/daypart/stillness
condition layers, or mic capture.

```
src/
  audio/
    AudioEngine.js        # framework-agnostic Web Audio core — load/start/setGain/dispose
    useAudioEngine.js     # React lifecycle wrapper
    stemManifest.js       # tempo, beats/bar, stem id → file mapping, loop crossfade length
    barMath.js            # bars ↔ seconds conversion
    loopCurves.js         # equal-power fade-in/out curves for the loop crossfade
  position/
    mockPositionSource.js # stands in for GPS — walks a point along a path
    smoothing.js           # EMA smoothing on raw position (CLAUDE.md layer 1)
    waypointGain.js        # smoothstep gain-from-distance
    arrivalHysteresis.js   # 0.85 fire / 0.5 rearm (CLAUDE.md layer 3)
    stillnessDetector.js   # sliding-window "hasn't moved in ~3s" check
    usePositionEngine.js   # ties the above together, drives AudioEngine.setGain
  visitCount.js            # local-storage visit counter, gates the stillness layer
  waypoints.js             # real waypoint geometry/metadata, see provenance notes in the file
  trailPath.js             # the real one-way trail, walked node-by-node from OSM data
```

## Running it

```bash
npm install
npm run dev
```

Click **start audio** (Web Audio requires a user gesture to unlock), then
**walk** to move the mocked position along the trail and hear the stems
crossfade.

```bash
npm test   # unit tests for the pure math (bar conversion, smoothstep, hysteresis)
```

## Stem file prep

The engine assumes every stem file:

- shares the **same tempo** and **sample rate** as the others in the manifest
  (currently 110 BPM / 48kHz — see `src/audio/stemManifest.js`)
- is trimmed to a **whole number of bars**, with **no lead-in silence**, so
  `loop = true` on the `AudioBufferSourceNode` produces a clean seam

**The first batch of real stems (`bloom-sax-1.wav`, `inst-5.wav`,
`stratus-piano-1.wav`, `string-raindrops.wav` — still in use; `arp-1.wav` was
swapped out, see below) are raw DAW bounces and are *not* yet trimmed to a
bar-exact loop length** — durations don't land on a whole bar boundary at 110
BPM. Expect an audible seam/click on loop until they're re-exported with a
clean loop point. That's a content task, not an engine bug — the scheduling
architecture (phase-locked start, bar-based gain ramps) doesn't care what's
in the buffer.

**A second batch** (`opening-pad.wav`, `stillness.wav`, plus `bfs.wav`,
`jasno.wav`, `staccato-vocals.wav`, `inst-5-alt.wav`,
`string-raindrops-alt.wav`) is cleanly bar-trimmed — exactly 18 bars at
110 BPM each, no seam expected. `opening-pad.wav` replaced `arp-1.wav` as the
`walkway` stem, and `stillness.wav` is now the stillness-layer stem (see
below). The other five are meant to become weather and/or time-of-day
condition layers per the user, but the exact state-by-state assignment isn't
decided yet, so they're staged in `public/audio/` but not wired into
`stemManifest.js`.

The remaining `stemManifest.js` mapping of stem → waypoint is still mostly a
placeholder (filenames don't indicate which waypoint each belongs to) — swap
`stemId` values once the rest of the actual song structure is known. Adding
more stems is data-only: add the file to `public/audio/` and an entry to
`stemManifest.js` — no code changes.

## Loop crossfade

Since bar-exact loop trimming is a content task that hasn't happened yet (see
above), `AudioEngine` masks the seam itself: each stem loops via a chain of
overlapping one-shot voices rather than native `loop = true`, crossfading the
tail of one voice into the head of the next with an equal-power curve
(`loopCurves.js`). The overlap length is `LOOP_CROSSFADE_BARS` in
`stemManifest.js` (default 1/8 bar). This hides the click — it does **not**
fix phase drift from a loop length that isn't an exact bar count, which is
still worth fixing at the source for final content.

## Waypoint overlap

`OVERLAP_FACTOR` in `usePositionEngine.js` widens every waypoint's effective
falloff radius beyond its authored value, so neighboring waypoints' zones
overlap more and a walker spends longer inside 2-3 blended layers instead of
passing through one stem at a time (CLAUDE.md's target). It's a multiplier
applied at gain-calculation time, not a change to the radius values
themselves — tune it there.

`INNER_PLATEAU_FRACTION` in `waypointGain.js` (default 0.45) makes full gain
a real zone instead of a single mathematical point: gain is flat at 1 out to
that fraction of the (overlap-widened) radius, then smoothstep-falls-off
from there to the outer edge. Originally added because someone should spend
real time at full gain, not just an instant at the exact center — but it
also turned out to fix a real bug: the `stairs` waypoint's stem was barely
triggering because reaching gain 1.0 required hitting one exact coordinate,
and any EMA-smoothing lag or minor path imprecision meant it never quite
got there. Verified live: `stairs` now reliably reaches gain 1.0 during a
normal walk-through, which it wasn't doing before.

The dev harness map draws these zones directly — each waypoint gets a
colored, semi-opaque wash (outer = falloff edge, inner = the full-gain
plateau, same colors as `STEM_COLORS` in `App.jsx`) so overlap between
neighbors shows as a visibly darker blend, and any real coverage gap shows
as plain paper. This is exactly what surfaced a real dead zone between
`overlook` and `northrim`: at 176.4m apart, their combined reach (159.9m)
fell short by ~16.5m, and every stem hit gain 0 in that stretch during a
normal walk-through — confirmed live before fixing it by widening both
waypoints' radii (see `waypoints.js` notes). Every other adjacent pair on
the loop was checked the same way and already had healthy overlap margins.

## Real trail geometry

`waypoints.js` and `trailPath.js` are built from an actual Overpass/OSM
export of the Fort Hill Loop Trail, Fort Hill Stairs, and the connecting
walkway (not the prototype's hand-drawn placeholders anymore). Coordinates
are meters, projected (equirectangular, screen/SVG y-down) from real lat/lon,
centered on the Rocky River Nature Center.

Confidence varies per waypoint — see the `note` field on each in
`waypoints.js`. In short: `walkway`, `stairs`, and `overlook` are anchored to
real, confirmed positions; `northrim` is objectively data-derived (the loop's
max-latitude point); `earthwork` and `ridge` are **not** derivable from OSM
(the earthworks is a National Register site, deliberately unmapped; "ridge"
isn't a taggable feature) and are placed heuristically — treat those two as
provisional until confirmed on the ground or via a field-recorded GPX walk.

One thing this process surfaced: the recorded "Fort Hill Stairs (base)" GPS
coordinate in CLAUDE.md sits ~52m from the real OSM base node — almost
certainly the canopy/cliff GPS-reflection drift CLAUDE.md itself warns about.
The OSM-confirmed node is used instead.

`mockPositionSource.js` now walks `trailPath.js` there-and-back (bouncing at
each end) rather than wrapping to the start, since the real walk is down the
same stairs and back through the same walkway, not a closed loop.

**The walkway leg was corrected** against a user-marked-up map screenshot of
the intended route. The first version used a shortest-path search anchored
at the Nature Center's own coordinate, which found a shorter unnamed footway
instead of ever actually routing through "Woodland Loop Trail" — even though
CLAUDE.md names it explicitly. The corrected version starts from the Valley
Parkway lot's own service-road access point instead, and does genuinely pass
through both Woodland Loop Trail and West Channel Pond Loop Trail. The
`walkway` waypoint itself was also moved closer to the entrance (and given a
much bigger radius, since the real gap to `stairs` here is ~250m) — it used
to sit right next to the Nature Center.

## Stillness layer

Per CLAUDE.md: stop moving for ~3s and an extra stem opens, gated behind
visit 2+ (a local-storage integer, no account/backend). The real app detects
stillness via Core Motion / step counter, explicitly not GPS or HealthKit —
but this dev harness only has mocked position, so `stillnessDetector.js`
derives it from position instead: a sliding window checks whether the walker
has stayed within a small radius for the full 3s (comparing against a single
per-tick delta would misread ordinary walking as "still," since even normal
walking speed only moves ~7cm per 50ms tick).

`stillness.wav` is now wired in as the `still` stem (`STILL_STEM_ID` in
`usePositionEngine.js`), so this plays for real once audio is started. One
real bug turned up wiring this in: the dev harness's gain-bar row for
`still` read from the `gains` object, which is only ever populated with
*waypoint* gains — since stillness isn't a waypoint, that key never existed
and the row silently showed 0.00 regardless of actual state. `App.jsx` now
special-cases `still` to read `stillnessActive` directly for both the gain
row and the lock-screen layer stack.

Its fade in/out (`STILL_RAMP_BARS` in `usePositionEngine.js`, currently 4
bars) is deliberately slower than a waypoint gain ramp (`GAIN_RAMP_BARS`,
1 bar) — this is meant to feel like "the piece settles," a distinct moment,
not a continuous position-driven blend.

The dev harness shows the current visit number and a "reset visits" button
(for testing both the locked and unlocked states without waiting for actual
repeat visits) next to the transport controls.

## Condition icons

`conditionIcons.jsx` draws CLAUDE.md's weather (Clear/Overcast/Wet) and
time-of-day (Morning/Midday/Golden/Dusk) icons in the map's own visual
language — a surveyed sun, a contour-line cloud, a horizon arc — rather than
borrowed weather-app glyphs. Daypart is visualized as the sun's position
along a fixed arc (low-left at morning, overhead at midday, low-right at
golden), with dusk as its own icon once the sun reaches the horizon.

This is the icon system only. `weather` and `daypart` in `App.jsx` are
manually picked via the selector rows at the bottom of the dev harness, not
yet driven by a real weather fetch or a solar-altitude calculation from
actual time/location, and not yet wired to the audio engine (no weather stem
or daypart filter/reverb chain exists yet).

## Lock screen preview

CLAUDE.md calls the lock-screen media card "the primary interface during the
walk" — the phone is in a pocket, screen off, and this card is what someone
actually sees if they glance at it. The "preview lock screen" toggle in the
dev harness swaps the map for a mockup of it: current time/date, trail name
and artist, active weather/daypart icons, and — critically, per CLAUDE.md —
**every audible layer with its level**, never a single "now playing" track.
Artwork is a stripe per stem, width proportional to gain, exactly as
specified. `Artwork`/`LayerList` in `App.jsx` build this from the same
`gains` data the map already uses.

## Full screen preview

"full screen preview" opens whichever of the map or lock screen is currently
selected inside a realistic phone-proportioned frame that takes over the
viewport (`PhonePreview` in `App.jsx`), so it can actually be judged as "what
this looks like on a phone" rather than as one narrow column next to dev
controls. Not the browser's real Fullscreen API — just a fixed-position
overlay sized like one, which is simpler and doesn't need a permission
prompt.

## Dev harness map

`basemap.js` holds real surrounding context from the same OSM export —
Rocky River, nearby water/forest cover, and the other trails in the
area — rendered as background layers under the main route (purely visual,
none of it feeds gain calculation; large features that extend well beyond
the trail are clipped rather than stretched across kilometers of
irrelevant geometry).

The map camera follows the walker and is user-zoomable (+/- in the bottom
corner) between two bounds: fully zoomed in is a tight follow window
centered on the walker (`MIN_CAMERA_HEIGHT_M` in `App.jsx`); fully zoomed
out shows the whole trail, centered on the trail itself, and is as far as
the user can go — it can't zoom out past that. Intermediate zoom levels
linearly blend both the window size and the center point between those two
states. Starts 2 clicks out from the tightest zoom rather than fully zoomed
in.

## Git LFS

Stem audio is tracked through [Git LFS](https://git-lfs.com) (see
`.gitattributes`) since WAV files run tens of MB each. Run `git lfs install`
once per machine before cloning/pulling this repo.
