import { useAudioEngine } from "./audio/useAudioEngine.js";
import { usePositionEngine, OVERLAP_FACTOR } from "./position/usePositionEngine.js";
import { STEMS } from "./audio/stemManifest.js";
import { WAYPOINTS } from "./waypoints.js";

const PAPER = "#EDEBE0";
const INK = "#1B2A23";
const CONTOUR = "#B9A87E";
const RIG = "#16211C";

const label = {
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 11,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

// Kept at module scope on purpose — subcomponents defined inside the render
// function get remounted on every position tick and swallow click events.
// (Same bug CLAUDE.md flags in the prototype.)

function TransportButton({ children, onClick, active, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...label,
        padding: "10px 16px",
        background: active ? PAPER : "transparent",
        color: active ? INK : PAPER,
        border: `1px solid ${CONTOUR}`,
        borderRadius: 4,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function GainRow({ stemLabel, level }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <span style={{ ...label, width: 150, flexShrink: 0, color: CONTOUR }}>{stemLabel}</span>
      <span style={{ flex: 1, height: 6, background: "#2A3B33", borderRadius: 3, overflow: "hidden" }}>
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${level * 100}%`,
            background: PAPER,
            transition: "width 120ms linear",
          }}
        />
      </span>
      <span style={{ ...label, width: 40, textAlign: "right", color: CONTOUR }}>
        {level.toFixed(2)}
      </span>
    </div>
  );
}

function TrailMap({ path, waypoints, gains, position }) {
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const pad = 60;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;

  const toPath = (pts) =>
    pts.reduce((d, [x, y], i) => d + (i ? ` L ${x} ${y}` : `M ${x} ${y}`), "");

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      style={{ width: "100%", height: 320, background: "#0f1712", borderRadius: 8 }}
    >
      <path d={toPath(path)} stroke={CONTOUR} strokeWidth="2" fill="none" opacity=".5" />
      {waypoints.map((w) => (
        <g key={w.id}>
          <circle
            cx={w.x}
            cy={w.y}
            r={w.radius * OVERLAP_FACTOR}
            fill="none"
            stroke={CONTOUR}
            strokeDasharray="3 5"
            opacity={0.2 + (gains[w.id] ?? 0) * 0.4}
          />
          <circle
            cx={w.x}
            cy={w.y}
            r={10}
            fill={PAPER}
            opacity={0.3 + (gains[w.id] ?? 0) * 0.7}
          />
          <text x={w.x + 14} y={w.y + 4} fill={PAPER} style={{ ...label, fontSize: 9 }}>
            {w.name}
          </text>
        </g>
      ))}
      <circle cx={position.x} cy={position.y} r="7" fill="#C2452D" stroke={PAPER} strokeWidth="2" />
    </svg>
  );
}

export default function App() {
  const { status, error, boot, shutdown, setGain } = useAudioEngine();
  const { position, gains, lastArrival, walking, setWalking, speed, setSpeed, path } =
    usePositionEngine({ setGain: status === "running" ? setGain : null });

  const audioOn = status === "running";

  return (
    <div style={{ background: RIG, minHeight: "100vh", color: PAPER, padding: "24px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ ...label, opacity: 0.6 }}>Trail Score</div>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 26, margin: "6px 0 20px" }}>
          Audio engine dev harness
        </h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <TransportButton
            onClick={audioOn ? shutdown : boot}
            active={audioOn}
            disabled={status === "loading"}
          >
            {status === "loading" ? "loading stems…" : audioOn ? "stop audio" : "start audio"}
          </TransportButton>
          <TransportButton onClick={() => setWalking((w) => !w)} active={walking}>
            {walking ? "pause" : "walk"}
          </TransportButton>
          <TransportButton onClick={() => setSpeed((s) => (s === 1 ? 4 : s === 4 ? 10 : 1))}>
            {speed}×
          </TransportButton>
        </div>

        {status === "error" && (
          <div style={{ ...label, color: "#C2452D", marginBottom: 12 }}>
            failed to load stems: {String(error?.message ?? error)}
          </div>
        )}

        {lastArrival && (
          <div style={{ ...label, color: CONTOUR, marginBottom: 8 }}>arrived: {lastArrival}</div>
        )}

        <TrailMap path={path} waypoints={WAYPOINTS} gains={gains} position={position} />

        <div style={{ marginTop: 16 }}>
          {STEMS.map((s) => (
            <GainRow key={s.id} stemLabel={s.label} level={gains[s.id] ?? 0} />
          ))}
        </div>

        <div style={{ ...label, color: CONTOUR, opacity: 0.6, marginTop: 20, lineHeight: 1.8 }}>
          stems must be loaded (start audio) before gain changes are audible
          <br />
          click "walk" to move the mock position along the trail
        </div>
      </div>
    </div>
  );
}
