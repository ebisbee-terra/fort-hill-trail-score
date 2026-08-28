// Tints the paper map's background based on weather and time of day, in the
// same spirit as the prototype's `mixc` daypart blend (trail-score-v3.jsx),
// extended to also react to weather. Two sequential blends toward named
// target colors -- weather first, then daypart -- rather than a single
// combined color, so each condition's contribution stays legible and the
// weights can be tuned independently.

function mixHex(a, b, t) {
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

// { color: target to blend toward, weight: how strongly (0-1) }
const WEATHER_TINTS = {
  clear: { color: "#F2E8C9", weight: 0.05 }, // faint sun-bleached warmth
  overcast: { color: "#B9C2C2", weight: 0.14 }, // desaturated, cool gray
  wet: { color: "#8FA7B3", weight: 0.16 }, // cool blue-slate
};

const DAYPART_TINTS = {
  morning: { color: "#D7E3E0", weight: 0.08 }, // pale, cool
  midday: { color: "#EDEBE0", weight: 0 }, // no tint -- baseline
  golden: { color: "#E8B65E", weight: 0.18 }, // warm amber
  dusk: { color: "#5C6B8C", weight: 0.24 }, // deep dusty blue-violet
};

export function getMapTint(weather, daypart, base = "#EDEBE0") {
  const w = WEATHER_TINTS[weather] ?? WEATHER_TINTS.clear;
  const d = DAYPART_TINTS[daypart] ?? DAYPART_TINTS.midday;
  const afterWeather = mixHex(base, w.color, w.weight);
  return mixHex(afterWeather, d.color, d.weight);
}
