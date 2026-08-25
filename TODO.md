# Trail Score — loose ends

Working list of what's left, pulled from CLAUDE.md and everything found
while building the audio engine, position pipeline, and dev harness map.
Not a roadmap/priority order — just don't-forget-this items.

## Content

- [ ] **Bar-trim the remaining 4 first-batch stems** (`bloom-sax-1.wav`,
      `inst-5.wav`, `stratus-piano-1.wav`, `string-raindrops.wav`). Raw DAW
      bounces — durations don't land on a whole bar count at 110 BPM, so the
      loop crossfade (`AudioEngine`) is masking an audible seam rather than
      looping cleanly. Content fix, not a code fix. (`arp-1.wav` no longer
      matters here — it was swapped out for `opening-pad.wav`, which is
      already cleanly bar-trimmed.)
- [ ] **Confirm/replace the remaining stem → waypoint mapping** in
      `stemManifest.js` (`stairs`, `overlook`, `earthwork`, `northrim`) —
      still arbitrary, not tied to the actual song structure.
- [x] ~~Record a "still" stem~~ — done, `stillness.wav` is wired in.
- [ ] **Assign the 5 remaining second-batch stems** (`bfs.wav`, `jasno.wav`,
      `staccato-vocals.wav`, `inst-5-alt.wav`, `string-raindrops-alt.wav`) to
      specific weather/daypart states — staged in `public/audio/`, not wired
      into `stemManifest.js` yet, pending exact state-by-state assignment.
- [ ] Stems 6–7 (`ridge`, `return`) have waypoints but no audio yet.

## Trail geometry — needs on-the-ground confirmation

- [x] ~~Walkway routing~~ — fixed. It previously never actually used
      Woodland Loop Trail; corrected against a user-marked-up map
      screenshot, now starting from the Valley Parkway lot.
- [ ] **Earthworks waypoint position** — not derivable from OSM (it's a
      National Register site, deliberately unmapped). Currently placed
      heuristically in `waypoints.js`, flagged `UNCONFIRMED`.
- [ ] **East Ridge waypoint position** — also heuristic/unconfirmed, "ridge"
      isn't a taggable OSM feature.
- [ ] A field-recorded GPX walk (per CLAUDE.md) would resolve both of the
      above, plus give real elevation data for the stairs (see below).

## CLAUDE.md's own open questions (still open)

- [ ] Exact trailhead sign/QR placement in the Valley Parkway lot.
- [ ] Does foot traffic wander onto the West Channel Pond Loop Trail branch
      near the top of the stairs — problem, or optional waypoint?
- [ ] Whether the long North Rim–to–Ridge stretch (the one we slotted
      Earthworks into) actually holds interest for the ~2 minutes it takes
      to walk — worth checking after a real walk-through.
- [ ] Confirm park hours with Metroparks (Google lists 8am–9pm, which would
      rule out a pre-dawn daypart).

## Conditions system — mocked/visual only so far

- [ ] **Weather**: no real Open-Meteo fetch yet. `weather` state in `App.jsx`
      is a manual selector. Needs the actual API call plus a weather stem
      per state (Clear/Overcast/Wet), each layered on top per CLAUDE.md.
- [ ] **Time of day**: no solar-altitude calculation yet. `daypart` state is
      also a manual selector. Needs real math (lat/lon + time → solar
      altitude → Morning/Midday/Golden/Dusk) plus the master filter
      cutoff + reverb wet DSP chain in `AudioEngine` — no chain like that
      exists yet at all.
- [ ] Condition icons (`conditionIcons.jsx`) are visual-only right now —
      not wired to audio in either direction.

## Stairs — barometric altitude

- [ ] GPS is 2D; the stairs need altitude as a second dimension per
      CLAUDE.md, since horizontal distance alone can't distinguish base from
      top. No barometer input exists in this web dev harness — this is
      native-only work, blocked until the Capacitor wrapper exists.
- [ ] The "same stairs, opposite musical function" going up vs. down isn't
      implemented yet — currently symmetric (gain is purely position-based,
      direction-agnostic).

## Platform — not started

- [ ] Capacitor wrapper (iOS/Android) — background audio, background
      location. Everything so far is browser-only with mocked GPS.
- [ ] Lock-screen media card (the primary during-walk interface per
      CLAUDE.md) — a visual preview exists in the dev harness now
      (`LockScreenPreview` in `App.jsx`), but the real native lock-screen
      integration (MPNowPlayingInfoCenter / Android media session) is
      unstarted native work.
- [ ] Mic capture feature (sing a note at the overlook/earthworks, pitch-snap
      into the key) — not started.

## UI

- [ ] The dev harness map is functional but not the real paper-map UI —
      CLAUDE.md's start → map → capture → summary screens, hollow-until-
      reached blazes, etc. haven't been built.
- [ ] Post-walk summary screen with the conditions-collected grid — not
      started.
