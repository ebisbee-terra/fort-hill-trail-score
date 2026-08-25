# Trail Score — Fort Hill Loop

A location-aware adaptive music walk for Cleveland Metroparks, Rocky River
Reservation. Stems of a single composition are pinned to waypoints along a
trail; gain follows the hiker's GPS position, so moving through the park
re-orchestrates the piece in real time. Positioned as a temporary art
installation — months of life, not years.

Think game-audio vertical remixing, where the state variable is physical
position instead of combat intensity.

## Platform — decided, do not re-litigate

- **React + Vite web app, wrapped with Capacitor** for iOS and Android.
- **Background audio and background location are non-negotiable.** The phone
  lives in a pocket with the screen off. Mobile browsers suspend audio and
  throttle geolocation when backgrounded, which is why this is a native
  wrapper and not a pure web app.
- **No backend.** All content ships bundled in the app. The only network call
  is a weather fetch at session start. This is deliberate: a months-long
  installation should have no server to maintain, no hosting bill, and no
  security surface.
- **Assume no cell signal on the trail.** Everything downloads before the walk
  begins. Weather fetch happens at the parking lot and is cached for the
  session; if it fails, default to Clear and continue silently.
- Use platform-native audio DSP (AVAudioUnit / Android equivalents / Web
  Audio). No commercial DSP SDKs — no licensing costs anywhere in this project.

## The trail

Valley Parkway lot → Woodland walkway past the Nature Center → 155 stairs
**UP** to the hilltop → Fort Hill loop → back **DOWN** the same stairs →
return. About 1 mile round trip.

The stairs ascend from the valley floor to the trail. Going up, hikers are
working and the overlook is the payoff. Coming down, they are spent and the
piece should be resolving. Same stairs, opposite musical function — do not
treat the descent as the climb reversed.

Verified coordinates:
- Rocky River Nature Center — 41.4090491, -81.8840210
- Fort Hill Stairs (base) — 41.4091315, -81.8855033

Trail geometry comes from OpenStreetMap plus a field-recorded GPX. The
Woodland approach, the stairs, and the Fort Hill loop are three separate OSM
ways that need stitching. **The coordinates in the prototype are hand-drawn
approximations — replace them, don't build on them.**

Seven waypoints, roughly 150–200m apart. Waypoints cannot be closer than about
80m or their fades overlap into mud.

## Audio engine

- All stems share **one tempo** and loop on a **common bar length**. They start
  together and never stop — only gain changes. This is what makes them blend
  rather than crossfade.
- Express crossfade times **in bars, not seconds**, so fades land musically.
- Gain per stem = smoothstep falloff on distance from its waypoint. No hard
  radius edges.
- Target 2–3 audible stems at any point. Above four it turns to mud.

### Position handling — the core of the whole thing

GPS under summer canopy is bad, and it is worse at the base of a 90-foot shale
cliff because of signal reflection. Worst reception coincides with tightest
waypoint spacing. Three layers of smoothing, all mandatory:

1. Exponential moving average on raw position readings.
2. Gain ramps of roughly one bar, so a bad fix takes seconds to affect the mix.
3. Hysteresis on waypoint arrival — fires at 0.85 gain, re-arms only below 0.5,
   so someone loitering on a boundary is not buzzed repeatedly.

The mix must always drift, never switch. Glitchy is the one unacceptable
failure mode. Latency on arrival is an accepted cost.

### The stairs

GPS is effectively 2D. Base and top of the stairs are ~78m apart horizontally
but 90 feet vertically, so distance-based crossfade fails exactly at the most
dramatic moment. Use **barometric altitude** as a second dimension. Optionally
script the climb as a timed build that runs on its own timeline once the stair
zone is entered — it is the one place everyone moves the same direction at the
same pace, so a linear passage is honest there.

## Conditions — additive, never combinatorial

Conditions **add layers or process the master**. They never swap out variant
sets of the waypoint stems. Six waypoint stems × three weather states × four
dayparts would be over a hundred pieces of audio; the additive model covers
every combination with about a dozen.

- **Weather** — three states: Clear / Overcast / Wet. Each is *one additional
  stem* layered on top. Open-Meteo, free, no API key. (Add Snow as a fourth if
  the installation runs into winter.)
- **Time of day** — Morning / Midday / Golden / Dusk, derived from **solar
  altitude**, not clock hours. Implemented as **master filter cutoff + reverb
  wet**. No extra audio at all.
- **Stillness** — stop moving for ~3s and an extra stem opens. Detected via
  Core Motion pedometer / Android step counter, **not HealthKit** (avoids
  health-data permissions and extra App Store review scrutiny). Do not map
  cadence to tempo — it would break stem sync.
- **Visit count** — a single integer in local device storage. No account, no
  backend. The stillness stem unlocks on visit 2+. Resetting on reinstall is
  acceptable.

Every active condition shows an icon in the UI, drawn in the map's own visual
language (surveyed sun, contour-line cloud, horizon arc) — not borrowed
weather-app glyphs.

## Interface

Dead simple. The phone is in a pocket; the map is a pre-walk and post-walk
surface, not something people stare at while hiking.

- **Paper trail-map aesthetic**, not a dark music-app UI — sunlight readability
  and a vocabulary hikers already know. Waypoints are blazes, hollow until
  reached. Falloff radii are drawn as topographic contour rings.
- The lock-screen **media card is the primary interface during the walk**. It
  shows the trail name, the artist, and **every audible layer with its level** —
  never a single "now playing" track, because a blend is not a song. Artwork is
  a stripe per stem, width proportional to gain, so it visibly changes as you
  walk.
- **Haptic buzz at the center of a waypoint.** No notifications — the media card
  carries the credits persistently instead.
- Post-walk summary with a conditions-collected grid to drive return visits.
- Screens: start → map → capture → summary.

## Microphone capture

At a natural pause (the overlook or the earthworks — never on the stairs),
prompt for a sung note. Pitch-detect it and snap it into the key so it
harmonizes regardless of what they sing. Offer retry. Process heavily enough
that a poor capture still sounds intentional.

**Hard privacy rule: the recording never leaves the device.** No upload, no
analytics on it, no exceptions. Say so plainly in the permission prompt, the
credits sheet, and the store listing.

## Deferred — decided against, with reasons

- **App Clips** — dropped. Physical invocation (NFC/QR) caps the Clip at 15 MB,
  which audio blows through instantly. Google Play Instant was discontinued in
  December 2025, so there is no Android counterpart anyway.
- **NFC tags** — dropped. Requires taking the phone out and touching a tag,
  which contradicts the pocket experience, and mounting hardware near a
  National Register earthworks site is a significant permitting conversation.
  Barometric altitude solves the stairs without hardware.
- **Step-cadence-to-tempo** — dropped. Would require real-time time-stretching
  and would break stem sync.
- **HealthKit** — dropped. Raw motion sensors give the same signal without the
  privacy and review burden.
- **"How are you feeling" branching** — deferred to a future version. Too much
  compositional complexity for v1.

## Open questions

- Exact trailhead sign/QR placement in the Valley Parkway lot.
- West Channel Pond Loop Trail branches near the top of the stairs — does foot
  traffic wander onto it, and is that a problem or an optional waypoint?
- Whether the longest gap (North Rim to East Ridge) holds interest for the
  two-plus minutes it takes to walk.
- Park hours — Google lists the stairs as 8:00 AM–9:00 PM, which would rule out
  a pre-dawn daypart. Confirm with Metroparks.

## Prototype

`prototype/trail-score-v3.jsx` is a working simulator built in Claude chat. It
uses Tone.js synths standing in for real stems and mocked GPS. **It is a
reference for behavior and visual language, not production code.** Ported
audio must use real files.

One bug worth not repeating: subcomponents defined inside the render function
were remounted on every position update and swallowed click events. Keep
subcomponents at module scope.
