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
    usePositionEngine.js   # ties the above together, drives AudioEngine.setGain
  waypoints.js             # waypoint geometry/metadata (placeholder coordinates)
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

**The first batch of real stems dropped into `public/audio/` (`arp-1.wav`,
`bloom-sax-1.wav`, `inst-5.wav`, `stratus-piano-1.wav`,
`string-raindrops.wav`) are raw DAW bounces and are *not* yet trimmed to a
bar-exact loop length** — durations don't land on a whole bar boundary at 110
BPM. Expect an audible seam/click on loop until they're re-exported with a
clean loop point. That's a content task, not an engine bug — the scheduling
architecture (phase-locked start, bar-based gain ramps) doesn't care what's
in the buffer.

The `stemManifest.js` mapping of stem → waypoint is also a placeholder
(filenames don't indicate which waypoint each belongs to) — swap `stemId`
values once the real song structure is known. Adding more stems later is
data-only: add the file to `public/audio/` and an entry to `stemManifest.js`
— no code changes.

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
themselves — tune it there. It'll need revisiting once real GPS-derived
waypoint spacing (in meters) replaces the current placeholder coordinates.

## Git LFS

Stem audio is tracked through [Git LFS](https://git-lfs.com) (see
`.gitattributes`) since WAV files run tens of MB each. Run `git lfs install`
once per machine before cloning/pulling this repo.
