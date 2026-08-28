// Stem id === waypoint id, one stem per waypoint. `label` keeps the
// original DAW export name for credit-sheet use.
//
// Measured from the files themselves (see afinfo): 48kHz, 110 BPM. Not the
// prototype's 66 BPM — that was a placeholder, this is the real tempo.
//
// walkway/stairs/overlook/earthwork/northrim are raw DAW bounces, not yet
// trimmed to a whole-bar loop point (see README's "Stem file prep" section)
// — expect an audible seam on loop until they're re-exported to length.
// opening-pad, stillness, bfs, jasno, and staccato-vocals are all from a
// later, cleanly bar-trimmed batch (confirmed via afinfo: all five are
// exactly 39.27s = 18 bars at 110 BPM, byte-for-byte the same file size) —
// no seam expected from any of them.
//
// parking_lot/ridge/return got bfs/jasno/staccato-vocals respectively, filling
// the three waypoints that had no stem at all -- an otherwise arbitrary
// assignment among that batch, since none of the filenames indicate which
// waypoint they were meant for.
//
// inst-5-alt.wav and string-raindrops-alt.wav (same batch, confirmed NOT
// replacements for inst-5.wav/string-raindrops.wav despite the shared names)
// are now the Weather condition stems, per CLAUDE.md's additive model
// ("each [weather state] is one additional stem layered on top") — id
// weather_overcast / weather_wet below. Clear gets no stem of its own: it's
// the neutral baseline, matching CLAUDE.md's own "if [the weather fetch]
// fails, default to Clear and continue silently." Only 2 spare files existed
// for the 3 weather states, so that reading is also what made the numbers
// work, not just the more elegant one.
//
// Weather stem gain isn't position-driven like the rest of STEMS -- see
// App.jsx's weather effect, which sets these directly off the `weather`
// state rather than through usePositionEngine's per-tick loop.

export const TEMPO = 110;
export const BEATS_PER_BAR = 4;

// How much overlap AudioEngine crossfades at each stem's own loop point, to
// mask a seam on files that aren't trimmed to an exact bar length (see note
// above). Independent of the waypoint gain ramps — this masks a click, it
// doesn't fix phase drift from an inexact loop length.
//
// Raised from 1/8 bar (~0.27s) to 2 bars (~4.36s) -- the short version was
// producing a noticeable "flip" at the loop point on the raw-DAW-bounce
// files (confirmed by ear). Checked against the shortest file in the set
// (string-raindrops.wav, ~41s): even 2 bars is nowhere near AudioEngine's
// duration*0.4 safety cap. This is a first pass at "extended," not a
// measured fix -- there was no way to verify by ear from here, so it may
// still need tuning once someone can listen critically.
export const LOOP_CROSSFADE_BARS = 2;

export const STEMS = [
  { id: "walkway", url: "/audio/opening-pad.wav", label: "Opening Pad" },
  { id: "stairs", url: "/audio/bloom-sax-1.wav", label: "Bloom Sax - Stem 1" },
  { id: "overlook", url: "/audio/inst-5.wav", label: "Inst 5" },
  { id: "earthwork", url: "/audio/stratus-piano-1.wav", label: "Stratus Piano 1" },
  { id: "northrim", url: "/audio/string-raindrops.wav", label: "String Raindrops" },
  { id: "parking_lot", url: "/audio/bfs.wav", label: "BFS" },
  { id: "ridge", url: "/audio/jasno.wav", label: "Jasno" },
  { id: "return", url: "/audio/staccato-vocals.wav", label: "Staccato Vocals" },
  { id: "still", url: "/audio/stillness.wav", label: "Stillness" },
  { id: "weather_overcast", url: "/audio/inst-5-alt.wav", label: "Inst 5 (alt)" },
  { id: "weather_wet", url: "/audio/string-raindrops-alt.wav", label: "String Raindrops (alt)" },
];
