import { useMemo, useState } from "react";
import { useAudioEngine } from "./audio/useAudioEngine.js";
import { usePositionEngine, OVERLAP_FACTOR } from "./position/usePositionEngine.js";
import { STEMS } from "./audio/stemManifest.js";
import { WAYPOINTS } from "./waypoints.js";
import { CONTEXT_TRAILS, RIVER, WATER_POLYGONS, WOOD_POLYGONS } from "./basemap.js";
import { resetVisitCount } from "./visitCount.js";

const PAPER = "#EDEBE0";
const INK = "#1B2A23";
const CONTOUR = "#B9A87E";
const WATER = "#6E9AA8";
const WOOD = "#A9BB93";
const RIG = "#16211C";

// Camera zoom range, in meters of window height, matching the map's
// rendered aspect ratio (container is ~560x320). zoom=0 is the tightest
// follow (centered on the walker); zoom=1 shows the whole trail (centered
// on the trail itself) and is as far out as the user can go.
const CAMERA_ASPECT = 560 / 320;
const MIN_CAMERA_HEIGHT_M = 100;
const ZOOM_STEP = 0.2;
const MAP_PADDING_M = 40;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pathBounds(path) {
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY,
    centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

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

const toLine = (pts) =>
  pts.reduce((d, [x, y], i) => d + (i ? ` L ${x} ${y}` : `M ${x} ${y}`), "");
const toArea = (pts) => toLine(pts) + " Z";

function ZoomButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...label,
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(237,235,224,.92)",
        color: INK,
        border: `1px solid ${CONTOUR}`,
        borderRadius: 4,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontSize: 14,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function TrailMap({ path, waypoints, gains, position }) {
  // zoom: 0 = tightest follow (centered on the walker), 1 = whole trail
  // (centered on the trail itself) -- the farthest out the user can go.
  const [zoom, setZoom] = useState(0);

  const bounds = useMemo(() => pathBounds(path), [path]);
  const fullHeight = Math.max(bounds.height, bounds.width / CAMERA_ASPECT) + MAP_PADDING_M * 2;

  const height = lerp(MIN_CAMERA_HEIGHT_M, fullHeight, zoom);
  const width = height * CAMERA_ASPECT;
  const centerX = lerp(position.x, bounds.centerX, zoom);
  const centerY = lerp(position.y, bounds.centerY, zoom);
  const viewX = centerX - width / 2;
  const viewY = centerY - height / 2;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        style={{ width: "100%", height: 320, background: PAPER, borderRadius: 8, display: "block" }}
      >
        {WOOD_POLYGONS.map((poly, i) => (
          <path key={i} d={toArea(poly)} fill={WOOD} opacity=".35" stroke="none" />
        ))}
        {WATER_POLYGONS.map((poly, i) => (
          <path key={i} d={toArea(poly)} fill={WATER} opacity=".3" stroke="none" />
        ))}
        {RIVER.map((seg, i) => (
          <path key={i} d={toLine(seg)} stroke={WATER} strokeWidth="5" fill="none" opacity=".5" />
        ))}
        {CONTEXT_TRAILS.map((seg, i) => (
          <path key={i} d={toLine(seg)} stroke={INK} strokeWidth="1" strokeDasharray="1 4"
            fill="none" opacity=".3" />
        ))}

        <path d={toLine(path)} stroke={INK} strokeWidth="3" fill="none" opacity=".8" />
        {waypoints.map((w) => (
          <g key={w.id}>
            <circle
              cx={w.x}
              cy={w.y}
              r={w.radius * OVERLAP_FACTOR}
              fill="none"
              stroke={CONTOUR}
              strokeDasharray="3 5"
              opacity={0.3 + (gains[w.id] ?? 0) * 0.4}
            />
            <circle
              cx={w.x}
              cy={w.y}
              r={7}
              fill={INK}
              opacity={0.4 + (gains[w.id] ?? 0) * 0.6}
            />
            <text x={w.x + 11} y={w.y + 4} fill={INK} style={{ ...label, fontSize: 9 }} opacity=".75">
              {w.name}
            </text>
          </g>
        ))}
        <circle cx={position.x} cy={position.y} r="6" fill="#C2452D" stroke={PAPER} strokeWidth="2" />
      </svg>

      <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <ZoomButton onClick={() => setZoom((z) => Math.max(0, z - ZOOM_STEP))} disabled={zoom <= 0}>
          +
        </ZoomButton>
        <ZoomButton onClick={() => setZoom((z) => Math.min(1, z + ZOOM_STEP))} disabled={zoom >= 1}>
          −
        </ZoomButton>
      </div>
    </div>
  );
}

export default function App() {
  const { status, error, boot, shutdown, setGain } = useAudioEngine();
  const {
    position,
    gains,
    lastArrival,
    walking,
    setWalking,
    speed,
    setSpeed,
    path,
    isStill,
    visitCount,
    stillnessActive,
  } = usePositionEngine({ setGain: status === "running" ? setGain : null });

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
          <div style={{ ...label, color: CONTOUR, marginBottom: 4 }}>arrived: {lastArrival}</div>
        )}

        <div style={{ ...label, color: CONTOUR, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <span>
            visit {visitCount}
            {stillnessActive ? " · stillness layer active" : isStill ? " · still (locked until visit 2)" : ""}
          </span>
          <button
            onClick={() => {
              resetVisitCount();
              window.location.reload();
            }}
            style={{ ...label, fontSize: 9, background: "transparent", color: CONTOUR,
              border: `1px solid ${CONTOUR}`, borderRadius: 3, padding: "2px 6px", cursor: "pointer" }}
          >
            reset visits
          </button>
        </div>

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
