import { useEffect, useMemo, useState } from "react";
import { useAudioEngine } from "./audio/useAudioEngine.js";
import { usePositionEngine, OVERLAP_FACTOR } from "./position/usePositionEngine.js";
import { INNER_PLATEAU_FRACTION } from "./position/waypointGain.js";
import { STEMS } from "./audio/stemManifest.js";
import { WAYPOINTS } from "./waypoints.js";
import { CONTEXT_TRAILS, RIVER, WATER_POLYGONS, WOOD_POLYGONS } from "./basemap.js";
import { resetVisitCount } from "./visitCount.js";
import { ConditionIcon } from "./conditionIcons.jsx";
import { getMapTint } from "./mapTint.js";

const WEATHER_OPTIONS = [
  ["clear", "Clear"],
  ["overcast", "Overcast"],
  ["wet", "Wet"],
];
const DAYPART_OPTIONS = [
  ["morning", "Morning"],
  ["midday", "Midday"],
  ["golden", "Golden"],
  ["dusk", "Dusk"],
];

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

const STEM_COLORS = ["#C2452D", "#4A6FA5", "#E0A02B", "#3F7A6B", "#8A5A8C", "#2F7D8C", "#B4633A"];

// Artwork is a stripe per stem, width proportional to gain -- CLAUDE.md is
// explicit this is not a single "now playing" track, so there's no single
// track image, just the blend itself made visible.
function Artwork({ stack, size }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 8, overflow: "hidden", display: "flex",
      flexShrink: 0, background: "#2A3B33" }}>
      {stack.map((s) => (
        <div key={s.key} style={{ flex: Math.max(s.level, 0.001), background: s.color,
          transition: "flex 1s linear" }} />
      ))}
    </div>
  );
}

function LayerList({ stack }) {
  return (
    <div>
      {stack.map((s) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
          <span style={{ width: 4, height: 12, background: s.color, flexShrink: 0 }} />
          <span style={{ ...label, fontSize: 9, color: CONTOUR, flex: 1, minWidth: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
          <span style={{ width: 44, height: 3, background: "#2A3B33", flexShrink: 0 }}>
            <span style={{ display: "block", height: "100%", width: `${s.level * 100}%`,
              background: s.color, transition: "width 1s linear" }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// What CLAUDE.md calls "the primary interface during the walk" -- the phone
// is in a pocket, screen off, and this lock-screen media card is what
// someone actually sees if they glance at it. Never a single "now playing"
// track: every audible layer, with its level, always.
function LockScreenPreview({ stack, weatherIcon, daypartIcon }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ background: "#0C120F", border: `8px solid ${INK}`, borderRadius: 28,
      padding: "26px 16px 20px", height: "100%", minHeight: 420, boxSizing: "border-box",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      boxShadow: "0 18px 40px rgba(0,0,0,.5)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 46, color: PAPER, opacity: 0.92,
          lineHeight: 1 }}>{time}</div>
        <div style={{ ...label, color: CONTOUR, opacity: 0.55, marginTop: 6 }}>{date}</div>
      </div>

      <div style={{ background: "rgba(255,255,255,.07)", borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Artwork stack={stack} size={50} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 15, color: PAPER }}>Fort Hill Loop</div>
            <div style={{ ...label, fontSize: 9, color: CONTOUR, marginTop: 4 }}>Elijah Bisbee</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <ConditionIcon kind={weatherIcon} color={CONTOUR} dim={0.85} />
            <ConditionIcon kind={daypartIcon} color={CONTOUR} dim={0.85} />
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,.09)", marginTop: 11, paddingTop: 7 }}>
          {stack.length > 0 ? (
            <LayerList stack={stack} />
          ) : (
            <div style={{ ...label, fontSize: 9, color: CONTOUR, opacity: 0.5, padding: "4px 0" }}>
              no audible layers yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Selector({ name, options, current, onPick }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ ...label, fontSize: 9, color: CONTOUR, opacity: 0.6, marginBottom: 4 }}>{name}</div>
      <div style={{ display: "flex", gap: 5 }}>
        {options.map(([value, text]) => (
          <button
            key={value}
            onClick={() => onPick(value)}
            style={{
              ...label,
              flex: 1,
              fontSize: 9,
              padding: "6px 4px",
              background: current === value ? PAPER : "transparent",
              color: current === value ? INK : CONTOUR,
              border: `1px solid ${current === value ? CONTOUR : "#3a4a41"}`,
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

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

function TrailMap({ path, waypoints, gains, position, bgColor = PAPER }) {
  // zoom: 0 = tightest follow (centered on the walker), 1 = whole trail
  // (centered on the trail itself) -- the farthest out the user can go.
  // Starts 2 clicks out from the tightest zoom rather than fully zoomed in.
  const [zoom, setZoom] = useState(2 * ZOOM_STEP);

  const bounds = useMemo(() => pathBounds(path), [path]);
  const fullHeight = Math.max(bounds.height, bounds.width / CAMERA_ASPECT) + MAP_PADDING_M * 2;

  const height = lerp(MIN_CAMERA_HEIGHT_M, fullHeight, zoom);
  const width = height * CAMERA_ASPECT;
  const centerX = lerp(position.x, bounds.centerX, zoom);
  const centerY = lerp(position.y, bounds.centerY, zoom);
  const viewX = centerX - width / 2;
  const viewY = centerY - height / 2;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        style={{ width: "100%", height: "100%", background: bgColor, borderRadius: 8, display: "block" }}
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

        {/* Colored reach zones, one per waypoint: outer = falloff edge (radius
            * OVERLAP_FACTOR), inner = the full-gain plateau. Semi-opaque so
            overlap between neighbors shows as a visibly darker blend, and any
            gap with no waypoint reaching it shows as plain paper. Drawn under
            the trail path/markers so those stay crisp on top. */}
        {waypoints.map((w, i) => {
          const color = STEM_COLORS[i % STEM_COLORS.length];
          const outer = w.radius * OVERLAP_FACTOR;
          const inner = outer * INNER_PLATEAU_FRACTION;
          return (
            <g key={w.id}>
              <circle cx={w.x} cy={w.y} r={outer} fill={color} stroke="none" opacity=".16" />
              <circle cx={w.x} cy={w.y} r={inner} fill={color} stroke="none" opacity=".28" />
            </g>
          );
        })}

        <path d={toLine(path)} stroke={INK} strokeWidth="3" fill="none" opacity=".8" />
        {waypoints.map((w, i) => {
          const color = STEM_COLORS[i % STEM_COLORS.length];
          return (
            <g key={w.id}>
              <circle
                cx={w.x}
                cy={w.y}
                r={w.radius * OVERLAP_FACTOR}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray="3 5"
                opacity={0.5 + (gains[w.id] ?? 0) * 0.5}
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
          );
        })}
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

// A realistic-proportioned phone frame taking over the viewport, so what's
// inside can actually be judged as "what this looks like on a phone" rather
// than as one narrow column among dev controls.
function PhonePreview({ children, onExit }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,10,8,.96)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(390px, 90vw)",
          height: "min(844px, 85vh)",
          background: RIG,
          border: `10px solid ${INK}`,
          borderRadius: 40,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,.6)",
          display: "flex",
          flexDirection: "column",
          padding: 10,
        }}
      >
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
      <button
        onClick={onExit}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          ...label,
          background: "transparent",
          color: PAPER,
          border: `1px solid ${CONTOUR}`,
          borderRadius: 4,
          padding: "8px 14px",
          cursor: "pointer",
        }}
      >
        exit full screen
      </button>
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

  // Manually picked for now -- not yet wired to a real weather fetch or
  // solar-altitude calculation, and not yet driving the audio engine (no
  // weather stem or daypart filter/reverb chain exists yet). Just the icons.
  const [weather, setWeather] = useState("clear");
  const [daypart, setDaypart] = useState("midday");
  const mapTint = getMapTint(weather, daypart);

  const [showLockScreen, setShowLockScreen] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const stack = STEMS.map((s, i) => ({
    key: s.id,
    name: s.label,
    color: STEM_COLORS[i % STEM_COLORS.length],
    level: s.id === "still" ? (stillnessActive ? 1 : 0) : gains[s.id] ?? 0,
  }))
    .filter((s) => s.level > 0.08)
    .sort((a, b) => b.level - a.level);

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
          <TransportButton onClick={() => setShowLockScreen((v) => !v)} active={showLockScreen}>
            {showLockScreen ? "show map" : "preview lock screen"}
          </TransportButton>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <ConditionIcon kind={weather} color={PAPER} />
          <ConditionIcon kind={daypart} color={PAPER} />
          <span style={{ ...label, color: CONTOUR, opacity: 0.7 }}>
            {WEATHER_OPTIONS.find(([v]) => v === weather)[1]} ·{" "}
            {DAYPART_OPTIONS.find(([v]) => v === daypart)[1]}
          </span>
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

        <div style={{ height: 320 }}>
          {showLockScreen ? (
            <LockScreenPreview stack={stack} weatherIcon={weather} daypartIcon={daypart} />
          ) : (
            <TrailMap path={path} waypoints={WAYPOINTS} gains={gains} position={position} bgColor={mapTint} />
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <TransportButton onClick={() => setShowFullscreen(true)}>full screen preview</TransportButton>
        </div>

        {showFullscreen && (
          <PhonePreview onExit={() => setShowFullscreen(false)}>
            {showLockScreen ? (
              <LockScreenPreview stack={stack} weatherIcon={weather} daypartIcon={daypart} />
            ) : (
              <TrailMap path={path} waypoints={WAYPOINTS} gains={gains} position={position} bgColor={mapTint} />
            )}
          </PhonePreview>
        )}

        <div style={{ marginTop: 16 }}>
          {STEMS.map((s) => (
            <GainRow
              key={s.id}
              stemLabel={s.label}
              level={s.id === "still" ? (stillnessActive ? 1 : 0) : gains[s.id] ?? 0}
            />
          ))}
        </div>

        <Selector name="weather" options={WEATHER_OPTIONS} current={weather} onPick={setWeather} />
        <Selector name="time of day" options={DAYPART_OPTIONS} current={daypart} onPick={setDaypart} />

        <div style={{ ...label, color: CONTOUR, opacity: 0.6, marginTop: 20, lineHeight: 1.8 }}>
          stems must be loaded (start audio) before gain changes are audible
          <br />
          click "walk" to move the mock position along the trail
        </div>
      </div>
    </div>
  );
}
