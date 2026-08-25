// Condition icons in the map's own visual language (surveyed sun,
// contour-line cloud, horizon arc) per CLAUDE.md — deliberately not the
// filled/gradient glyphs a weather app would use. Same pen-and-ink,
// single-stroke style as the rest of the trail map.
//
// Weather: clear / overcast / wet (CLAUDE.md's three states).
// Daypart: morning / midday / golden / dusk, derived from solar altitude —
// visualized as the sun's position along a fixed horizon arc, low-left
// (rising) through overhead (midday) to low-right (setting), with dusk as
// its own icon once the sun is at/below the horizon.
//
// This module only draws the icons; it doesn't compute which one is active
// (that's real weather-fetch / solar-altitude work, not yet wired up).

const ARC = "M2 14 a8 8 0 0 1 16 0";
const HORIZON = { x1: 1, y1: 14, x2: 19, y2: 14 };

// sun position along the arc: 0 = sunrise (low-left), 0.5 = midday (top), 1 = sunset (low-right)
function sunOnArc(t) {
  const angle = Math.PI - t * Math.PI; // 180deg (left) -> 0deg (right)
  return { cx: 10 + 8 * Math.cos(angle), cy: 14 - 8 * Math.sin(angle) };
}

export function ConditionIcon({ kind, size = 15, color = "#1B2A23", dim = 1 }) {
  const box = { width: size, height: size, flexShrink: 0, opacity: dim };
  const stroke = { stroke: color, fill: "none", strokeWidth: 1.6, strokeLinecap: "round" };

  switch (kind) {
    case "clear":
      return (
        <svg viewBox="0 0 20 20" style={box}>
          <circle cx="10" cy="10" r="4" {...stroke} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
            <line
              key={d}
              {...stroke}
              x1={10 + Math.cos((d * Math.PI) / 180) * 6.5}
              y1={10 + Math.sin((d * Math.PI) / 180) * 6.5}
              x2={10 + Math.cos((d * Math.PI) / 180) * 8.5}
              y2={10 + Math.sin((d * Math.PI) / 180) * 8.5}
            />
          ))}
        </svg>
      );

    case "overcast":
      return (
        <svg viewBox="0 0 20 20" style={box}>
          <path {...stroke} d="M5 13 a3.2 3.2 0 0 1 .4 -6.3 a4 4 0 0 1 7.6 -.6 a3 3 0 0 1 1.5 5.6 z" />
        </svg>
      );

    case "wet":
      return (
        <svg viewBox="0 0 20 20" style={box}>
          <path {...stroke} d="M5 11 a3 3 0 0 1 .4 -5.8 a3.7 3.7 0 0 1 7 -.5 a2.8 2.8 0 0 1 1.4 5.2 z" />
          <line {...stroke} x1="7" y1="14" x2="6" y2="17" />
          <line {...stroke} x1="11" y1="14" x2="10" y2="17" />
          <line {...stroke} x1="15" y1="14" x2="14" y2="17" />
        </svg>
      );

    case "morning":
    case "midday":
    case "golden": {
      const t = kind === "morning" ? 0.12 : kind === "midday" ? 0.5 : 0.88;
      const { cx, cy } = sunOnArc(t);
      return (
        <svg viewBox="0 0 20 20" style={box}>
          <path {...stroke} d={ARC} strokeDasharray="2 2.4" />
          <line {...stroke} {...HORIZON} />
          <circle cx={cx} cy={cy} r="2.6" fill={color} stroke="none" />
        </svg>
      );
    }

    case "dusk":
      return (
        <svg viewBox="0 0 20 20" style={box}>
          <line {...stroke} {...HORIZON} />
          <circle cx="10" cy="13" r="3.4" {...stroke} />
          <path {...stroke} d="M4 10.5 L2.6 9" />
          <path {...stroke} d="M16 10.5 L17.4 9" />
        </svg>
      );

    default:
      return null;
  }
}
