// Placeholder mapping of the first real stem batch to waypoints, in waypoint
// order. This pairing is arbitrary (filenames don't indicate which waypoint
// they belong to) — swap `stemId` values once the actual song structure is
// known. `label` keeps the original DAW export name for credit-sheet use.
//
// Measured from the files themselves (see afinfo): 48kHz, 110 BPM. Not the
// prototype's 66 BPM — that was a placeholder, this is the real tempo.
//
// NOTE: these files are raw DAW bounces, not yet trimmed to a whole-bar loop
// point (see README's "Stem file prep" section) — expect an audible seam on
// loop until they're re-exported to length.

export const TEMPO = 110;
export const BEATS_PER_BAR = 4;

export const STEMS = [
  { id: "walkway", url: "/audio/arp-1.wav", label: "Arp 1" },
  { id: "stairs", url: "/audio/bloom-sax-1.wav", label: "Bloom Sax - Stem 1" },
  { id: "overlook", url: "/audio/inst-5.wav", label: "Inst 5" },
  { id: "earthwork", url: "/audio/stratus-piano-1.wav", label: "Stratus Piano 1" },
  { id: "northrim", url: "/audio/string-raindrops.wav", label: "String Raindrops" },
];
