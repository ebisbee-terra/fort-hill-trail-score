// Stem id === waypoint id, one stem per waypoint. `label` keeps the
// original DAW export name for credit-sheet use.
//
// Measured from the files themselves (see afinfo): 48kHz, 110 BPM. Not the
// prototype's 66 BPM — that was a placeholder, this is the real tempo.
//
// walkway/stairs/overlook/earthwork/northrim are raw DAW bounces, not yet
// trimmed to a whole-bar loop point (see README's "Stem file prep" section)
// — expect an audible seam on loop until they're re-exported to length.
// opening-pad and stillness are from a later, cleanly bar-trimmed batch
// (exactly 18 bars at 110 BPM) — no seam expected from those two.
//
// Still unassigned from that second batch: bfs.wav, jasno.wav,
// staccato-vocals.wav, inst-5-alt.wav, string-raindrops-alt.wav (the last
// two share names with the first batch's files but are confirmed NOT
// replacements — new, distinct content). Meant as weather and/or
// time-of-day condition layers per the user, but the exact state-by-state
// assignment isn't decided yet, so they're not wired in.

export const TEMPO = 110;
export const BEATS_PER_BAR = 4;

// How much overlap AudioEngine crossfades at each stem's own loop point, to
// mask a seam on files that aren't trimmed to an exact bar length (see note
// above). Independent of the waypoint gain ramps — this masks a click, it
// doesn't fix phase drift from an inexact loop length.
export const LOOP_CROSSFADE_BARS = 1 / 8;

export const STEMS = [
  { id: "walkway", url: "/audio/opening-pad.wav", label: "Opening Pad" },
  { id: "stairs", url: "/audio/bloom-sax-1.wav", label: "Bloom Sax - Stem 1" },
  { id: "overlook", url: "/audio/inst-5.wav", label: "Inst 5" },
  { id: "earthwork", url: "/audio/stratus-piano-1.wav", label: "Stratus Piano 1" },
  { id: "northrim", url: "/audio/string-raindrops.wav", label: "String Raindrops" },
  { id: "still", url: "/audio/stillness.wav", label: "Stillness" },
];
