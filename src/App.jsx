import { useEffect, useMemo, useRef, useState } from "react";
import { useAudioEngine } from "./audio/useAudioEngine.js";
import { usePositionEngine, OVERLAP_FACTOR } from "./position/usePositionEngine.js";
import { INNER_PLATEAU_FRACTION, ringPoints, clamp } from "./position/waypointGain.js";
import { STEMS, TEMPO, BEATS_PER_BAR } from "./audio/stemManifest.js";
import { barsToSeconds } from "./audio/barMath.js";
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
// Raised from 40 per user feedback ("show some more context... maybe double
// the size"). basemap.js already has real OSM-derived geometry well past
// the trail's own bounds (checked: x -623 to 295, y -293 to 298, versus the
// trail's own -515 to 206 / -140 to 135) -- this was sitting unused, not
// missing. 60 is short of a literal double specifically because CAMERA_ASPECT
// (1.75) is wider than basemap's own real-data aspect ratio (~1.55): fitting
// the *width* to real coverage is the binding constraint, not height. Going
// further would start showing blank paper past real data on the sides,
// which is exactly what the user asked this NOT to do. A wider OSM export
// would lift that ceiling if more zoom-out is wanted later.
const MAP_PADDING_M = 60;

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

// Closest point to (x,y) on segment (ax,ay)-(bx,by), clamped to the segment.
function closestPointOnSegment(x, y, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : clamp(((x - ax) * abx + (y - ay) * aby) / lenSq, 0, 1);
  const cx = ax + abx * t, cy = ay + aby * t;
  return { x: cx, y: cy, dist: Math.hypot(x - cx, y - cy) };
}

// Waypoints sit right on (or very near) the trail line, so a fixed label
// offset regularly lands on top of the path -- whichever way the path
// happens to bend at that particular point. Push the label out along the
// waypoint's own offset from the nearest point on the path instead: that
// vector already points to whichever side of the line the waypoint (and so
// its label) belongs on, for any path shape, without hardcoding a direction
// per waypoint.
const LABEL_OFFSET_M = 15;
function labelAnchor(waypoint, path) {
  let nearest = null;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const c = closestPointOnSegment(waypoint.x, waypoint.y, ax, ay, bx, by);
    if (!nearest || c.dist < nearest.dist) nearest = c;
  }
  let dx = waypoint.x - nearest.x, dy = waypoint.y - nearest.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) { dx = 1; dy = -1; } // waypoint sits essentially on the line -- pick a fixed fallback side
  const scale = LABEL_OFFSET_M / (len < 0.5 ? Math.SQRT2 : len);
  return { x: waypoint.x + dx * scale, y: waypoint.y + dy * scale };
}

const label = {
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 11,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

// Weather stem ids (stemManifest.js) keyed by the weather value they're
// active for. Clear has no entry -- it's the neutral baseline, no stem.
const WEATHER_STEM_IDS = { overcast: "weather_overcast", wet: "weather_wet" };
// Slower than a waypoint gain ramp -- a weather state is a deliberate
// condition change, not a continuous position-driven blend, so it should
// ease in/out rather than snap. Matches usePositionEngine's STILL_RAMP_BARS
// for the same reason. Governs how long it takes to reach the breathing
// base level below when a weather state turns on or off, not the breathing
// itself, which runs continuously once there.
const WEATHER_RAMP_BARS = 4;
// Per user feedback: a weather layer sitting at a flat 1.0 read as too
// present/static. Now it breathes continuously between base-amplitude and
// base+amplitude (0.5-1.0) over one slow sine cycle per periodBars, driven
// natively in Web Audio (AudioEngine.setBreathingGain) rather than a JS
// timer -- see that method for why. periodBars is intentionally not a clean
// multiple of the stem files' own 18-bar loop length, so the breathing
// cycle and the file's own repeat point drift out of sync with each other
// instead of always swelling at the same spot in the loop.
const WEATHER_BREATHE = { base: 0.75, amplitude: 0.25, periodBars: 25 };

// gains (from usePositionEngine) only covers position-driven stems --
// still and the weather stems are driven directly off other state, so the
// UI-facing level for those has to be computed here instead of just read
// off gains[id]. Shared by the dev-harness GainRow list and the stack shown
// in the lock screen / map HUD so both stay in sync.
//
// Weather's level is a live sine computed in JS, mirroring the same math as
// AudioEngine.setBreathingGain, rather than reading the real AudioParam --
// Web Audio's AudioParam.value getter only ever returns the *intrinsic*
// (scheduled) value, not the live sum with a connected audio-rate signal
// like the breathing oscillator, so there's no way to read the true
// instantaneous gain back out from the graph. A first version of this just
// showed the flat breathing base (0.75) the whole time, which -- fairly --
// read as the breathing not working at all rather than as a UI
// simplification. breatheStartedAtMs/nowMs come from the effect below;
// wall-clock (performance.now()) rather than the AudioContext's own clock,
// so it's an approximation, not a sample-accurate mirror -- fine for a
// meter, not for anything that needs to line up with the actual audio.
function stemLevel(id, { gains, stillnessActive, weather, breatheStartedAtMs, nowMs }) {
  if (id === "still") return stillnessActive ? 1 : 0;
  const isActiveWeatherStem =
    (id === WEATHER_STEM_IDS.overcast && weather === "overcast") ||
    (id === WEATHER_STEM_IDS.wet && weather === "wet");
  if (isActiveWeatherStem) {
    if (breatheStartedAtMs == null) return 0;
    const elapsedMs = nowMs - breatheStartedAtMs;
    if (elapsedMs < 0) {
      // Still in the ramp-in toward the breathing base -- approximate as linear.
      const rampMs = barsToSeconds(WEATHER_RAMP_BARS, TEMPO, BEATS_PER_BAR) * 1000;
      return WEATHER_BREATHE.base * clamp(1 + elapsedMs / rampMs, 0, 1);
    }
    const periodMs = barsToSeconds(WEATHER_BREATHE.periodBars, TEMPO, BEATS_PER_BAR) * 1000;
    return WEATHER_BREATHE.base + WEATHER_BREATHE.amplitude * Math.sin((2 * Math.PI * elapsedMs) / periodMs);
  }
  if (id === WEATHER_STEM_IDS.overcast || id === WEATHER_STEM_IDS.wet) return 0;
  return gains[id] ?? 0;
}

const WAYPOINTS_BY_ID = Object.fromEntries(WAYPOINTS.map((w) => [w.id, w]));

// Fader/label display name, distinct from stemManifest.js's `label` (which
// is deliberately the original DAW export name, kept for the credits
// sheet -- see that file's header comment). Per user feedback: the faders,
// here and on the user-facing HUD, should read as "The Walkway" / "Foot of
// the Stairs" etc., not "Opening Pad" / "Bloom Sax - Stem 1", for every stem
// that's actually tied to a waypoint. Stillness and the weather stems have
// no waypoint, so they fall back to their own condition/state name instead.
function stemDisplayName(id) {
  if (WAYPOINTS_BY_ID[id]) return WAYPOINTS_BY_ID[id].name;
  if (id === "still") return "Stillness";
  if (id === WEATHER_STEM_IDS.overcast) return "Overcast";
  if (id === WEATHER_STEM_IDS.wet) return "Wet";
  return id;
}

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

// At least as long as the longer of WAYPOINTS.length (8) and STEMS.length
// (11), so neither list's own index wraps back to a color already in use by
// that same list -- e.g. STEMS[0] (walkway) and STEMS[8] (still) would
// otherwise both land on the same color whenever they're both audible at once.
const STEM_COLORS = [
  "#6B7A3F", "#C2452D", "#4A6FA5", "#E0A02B", "#3F7A6B",
  "#8A5A8C", "#2F7D8C", "#B4633A", "#5B6B78", "#A8763E", "#5C8A6A",
];

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

// Highest zoom-out the free camera can reach beyond the trail's own bounds
// fit, so "zoom all the way out" via pinch/wheel doesn't hard-stop exactly
// at the trail edges.
const MAX_CAMERA_OVERZOOM = 1.4;

function TrailMap({ path, waypoints, gains, position, bgColor = PAPER, hud }) {
  // zoom: 0 = tightest follow (centered on the walker), 1 = whole trail
  // (centered on the trail itself) -- the farthest out the +/- buttons go.
  // Starts 2 clicks out from the tightest zoom rather than fully zoomed in.
  const [zoom, setZoom] = useState(2 * ZOOM_STEP);

  // Free camera: null means "follow the walker" (the zoom slider above
  // drives height/center automatically, same as before). Any drag or pinch
  // gesture seeds this from wherever the auto camera currently sits and
  // takes over from there, so someone can look around the rest of the trail
  // without waiting for the walker to get there -- the whole point of
  // adding this, per user feedback that panning shouldn't require advancing
  // the mock position or zooming all the way out. A "recenter" button hands
  // control back to auto-follow.
  const [manualView, setManualView] = useState(null);

  const containerRef = useRef(null);
  const gestureRef = useRef(null); // transient drag/pinch bookkeeping, not state -- see the gesture effect below
  const liveRef = useRef({}); // latest auto camera + fullHeight + manualView, read by the gesture effect without re-subscribing every tick

  const waypointsById = useMemo(() => Object.fromEntries(waypoints.map((w) => [w.id, w])), [waypoints]);
  // Static per path+waypoints, not per position tick -- no reason to
  // recompute this every 50ms while walking.
  const labelAnchors = useMemo(
    () => Object.fromEntries(waypoints.map((w) => [w.id, labelAnchor(w, path)])),
    [waypoints, path]
  );
  const bounds = useMemo(() => pathBounds(path), [path]);
  const fullHeight = Math.max(bounds.height, bounds.width / CAMERA_ASPECT) + MAP_PADDING_M * 2;

  const autoHeight = lerp(MIN_CAMERA_HEIGHT_M, fullHeight, zoom);
  const autoCenterX = lerp(position.x, bounds.centerX, zoom);
  const autoCenterY = lerp(position.y, bounds.centerY, zoom);

  const following = manualView === null;
  const height = following ? autoHeight : manualView.height;
  const width = height * CAMERA_ASPECT;
  const centerX = following ? autoCenterX : manualView.centerX;
  const centerY = following ? autoCenterY : manualView.centerY;
  const viewX = centerX - width / 2;
  const viewY = centerY - height / 2;

  liveRef.current = { autoHeight, autoCenterX, autoCenterY, fullHeight, manualView };

  // Pan (mouse drag + single-finger touch) and zoom (wheel + two-finger
  // pinch) as native listeners attached once, not React synthetic props --
  // this re-renders every 50ms while walking (position ticks), and
  // re-attaching gesture listeners that often would drop a gesture mid-drag.
  // Reads current camera state through liveRef/manualView's setter form
  // instead of closing over render-scoped values.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const seed = () => {
      const mv = liveRef.current.manualView;
      if (mv) return mv;
      const { autoCenterX, autoCenterY, autoHeight } = liveRef.current;
      const seeded = { centerX: autoCenterX, centerY: autoCenterY, height: autoHeight };
      setManualView(seeded);
      return seeded;
    };

    const clampHeight = (h) => clamp(h, MIN_CAMERA_HEIGHT_M, liveRef.current.fullHeight * MAX_CAMERA_OVERZOOM);

    const pixelScale = () => {
      const rect = el.getBoundingClientRect();
      const base = liveRef.current.manualView ?? {
        height: liveRef.current.autoHeight,
        centerX: liveRef.current.autoCenterX,
        centerY: liveRef.current.autoCenterY,
      };
      return {
        mppX: (base.height * CAMERA_ASPECT) / (rect.width || 1),
        mppY: base.height / (rect.height || 1),
      };
    };

    const startPan = (clientX, clientY) => {
      const s = seed();
      gestureRef.current = { mode: "pan", startX: clientX, startY: clientY, seedCenterX: s.centerX, seedCenterY: s.centerY, seedHeight: s.height, scale: pixelScale() };
    };
    const movePan = (clientX, clientY) => {
      const g = gestureRef.current;
      if (!g || g.mode !== "pan") return;
      const dxPx = clientX - g.startX;
      const dyPx = clientY - g.startY;
      setManualView({
        centerX: g.seedCenterX - dxPx * g.scale.mppX,
        centerY: g.seedCenterY - dyPx * g.scale.mppY,
        height: g.seedHeight,
      });
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      startPan(e.clientX, e.clientY);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };
    const onMouseMove = (e) => movePan(e.clientX, e.clientY);
    const onMouseUp = () => {
      gestureRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    const onWheel = (e) => {
      e.preventDefault();
      const s = seed();
      const factor = Math.exp(e.deltaY * 0.0015);
      setManualView({ ...s, height: clampHeight(s.height * factor) });
    };

    const touchDist = (touches) => Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const s = seed();
        gestureRef.current = { mode: "pinch", startDist: touchDist(e.touches), seed: s };
      } else if (e.touches.length === 1) {
        startPan(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      const g = gestureRef.current;
      if (!g) return;
      if (g.mode === "pinch" && e.touches.length === 2) {
        const ratio = g.startDist / touchDist(e.touches);
        setManualView({ ...g.seed, height: clampHeight(g.seed.height * ratio) });
      } else if (g.mode === "pan" && e.touches.length === 1) {
        movePan(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) gestureRef.current = null;
    };

    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", touchAction: "none" }}>
      <svg
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        style={{ width: "100%", height: "100%", background: bgColor, borderRadius: 8, display: "block", cursor: "grab" }}
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
            the trail path/markers so those stay crisp on top. A waypoint with
            `stretch` (see waypoints.js) bulges into a half-ellipse toward one
            named neighbor rather than a plain circle -- ringPoints traces
            that true shape so the contour drawn here always matches the
            actual falloff, not an approximation of it. */}
        {waypoints.map((w, i) => {
          const color = STEM_COLORS[i % STEM_COLORS.length];
          const target = w.stretch ? waypointsById[w.stretch.towardId] : null;
          const outer = w.radius * OVERLAP_FACTOR;
          const inner = outer * INNER_PLATEAU_FRACTION;
          const outerPath = toArea(ringPoints(w, target, outer).map((p) => [p.x, p.y]));
          const innerPath = toArea(ringPoints(w, target, inner).map((p) => [p.x, p.y]));
          return (
            <g key={w.id}>
              <path d={outerPath} fill={color} stroke="none" opacity=".16" />
              <path d={innerPath} fill={color} stroke="none" opacity=".28" />
            </g>
          );
        })}

        <path d={toLine(path)} stroke={INK} strokeWidth="3" fill="none" opacity=".8" />
        {waypoints.map((w, i) => {
          const color = STEM_COLORS[i % STEM_COLORS.length];
          const target = w.stretch ? waypointsById[w.stretch.towardId] : null;
          const outerPath = toArea(ringPoints(w, target, w.radius * OVERLAP_FACTOR).map((p) => [p.x, p.y]));
          return (
            <g key={w.id}>
              <path
                d={outerPath}
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
              {/* A halo (stroke painted under the fill) instead of a
                  measured background pill -- legible over the trail path or
                  a busy reach-zone blend without needing to estimate text
                  width for a monospace-ish UI font. Anchored off the path
                  (labelAnchors, computed above) rather than a fixed offset
                  from the dot, so it lands to whichever side of the line the
                  waypoint is actually on instead of routinely sitting on top
                  of the path itself. text-anchor flips to keep the label
                  growing further away from the dot instead of back over it. */}
              <text
                x={labelAnchors[w.id].x}
                y={labelAnchors[w.id].y + 2}
                textAnchor={labelAnchors[w.id].x < w.x ? "end" : "start"}
                fill={INK}
                stroke={bgColor}
                strokeWidth={2.5}
                strokeLinejoin="round"
                paintOrder="stroke"
                style={{ ...label, fontSize: 7.5 }}
                opacity=".8"
              >
                {w.name}
              </text>
            </g>
          );
        })}
        <circle cx={position.x} cy={position.y} r="6" fill="#C2452D" stroke={PAPER} strokeWidth="2" />
      </svg>

      {hud && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{hud}</div>
      )}

      <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {!following && (
          <ZoomButton onClick={() => setManualView(null)}>⟲</ZoomButton>
        )}
        <ZoomButton
          onClick={() => {
            if (following) setZoom((z) => Math.max(0, z - ZOOM_STEP));
            else setManualView((mv) => ({ ...mv, height: clamp(mv.height / 1.3, MIN_CAMERA_HEIGHT_M, fullHeight * MAX_CAMERA_OVERZOOM) }));
          }}
          disabled={following ? zoom <= 0 : height <= MIN_CAMERA_HEIGHT_M + 0.01}
        >
          +
        </ZoomButton>
        <ZoomButton
          onClick={() => {
            if (following) setZoom((z) => Math.min(1, z + ZOOM_STEP));
            else setManualView((mv) => ({ ...mv, height: clamp(mv.height * 1.3, MIN_CAMERA_HEIGHT_M, fullHeight * MAX_CAMERA_OVERZOOM) }));
          }}
          disabled={following ? zoom >= 1 : height >= fullHeight * MAX_CAMERA_OVERZOOM - 0.01}
        >
          −
        </ZoomButton>
      </div>
    </div>
  );
}

// Floating HUD for the user-facing full-screen map (not the bare dev-harness
// map, which already has this info in the controls below it). Passed to
// TrailMap as `hud` and absolutely positioned over the map by that component
// -- everything here defaults to pointer-events: none from the parent so
// dragging the map underneath still works; only the credits button opts
// back in. Weather now really does drive its own stem (App's weather
// effect); daypart's icon here is still just reflecting the dev-harness
// picker -- CLAUDE.md specs daypart as filter/reverb, not a stem, and that
// chain doesn't exist yet, so there's no daypart-driven layer to point at.
function MapHud({ stack, weatherIcon, daypartIcon, visitCount, onShowCredits }) {
  const weatherLabel = WEATHER_OPTIONS.find(([v]) => v === weatherIcon)?.[1];
  const daypartLabel = DAYPART_OPTIONS.find(([v]) => v === daypartIcon)?.[1];
  return (
    <>
      <div style={{ position: "absolute", top: 10, left: 10, maxWidth: 200,
        background: "rgba(237,235,224,.9)", border: `1px solid ${CONTOUR}`, borderRadius: 8, padding: "8px 10px" }}>
        <div style={{ ...label, fontSize: 8, color: INK, opacity: .55, marginBottom: 4 }}>now audible</div>
        {stack.length > 0 ? (
          stack.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
              <span style={{ width: 4, height: 10, background: s.color, flexShrink: 0, borderRadius: 1 }} />
              <span style={{ ...label, fontSize: 9, color: INK, flex: 1, minWidth: 0, whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
              {/* A small weather glyph, not another color swatch -- marks
                  this row as condition-driven rather than another place on
                  the trail, per user feedback asking for that distinction
                  to be visible, not just explained in the caption below. */}
              {s.isWeather && <ConditionIcon kind={weatherIcon} size={10} color={INK} dim={0.6} />}
            </div>
          ))
        ) : (
          <div style={{ ...label, fontSize: 9, color: INK, opacity: .55 }}>arriving…</div>
        )}
        {/* Quiet, only appears when a weather layer is actually playing --
            names the cause (conditions) rather than the effect (a stem id),
            so it doesn't read as another waypoint. */}
        {stack.some((s) => s.isWeather) && weatherLabel && daypartLabel && (
          <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 9.5, color: INK,
            opacity: 0.62, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${CONTOUR}`, lineHeight: 1.35 }}>
            Because it's {weatherLabel.toLowerCase()} this {daypartLabel.toLowerCase()}, that extra layer is
            the weather — not the trail.
          </div>
        )}
      </div>

      <div style={{ position: "absolute", top: 10, right: 10, display: "flex", flexDirection: "column",
        alignItems: "flex-end", gap: 4 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", background: "rgba(237,235,224,.9)",
          border: `1px solid ${CONTOUR}`, borderRadius: 20, padding: "5px 9px" }}>
          <ConditionIcon kind={weatherIcon} color={INK} />
          <ConditionIcon kind={daypartIcon} color={INK} />
        </div>
        {/* CLAUDE.md: visit count unlocks the stillness stem on visit 2+ --
            surfaced here so that's visible without leaving the map screen. */}
        <div style={{ ...label, fontSize: 8, color: INK, opacity: .6, background: "rgba(237,235,224,.9)",
          border: `1px solid ${CONTOUR}`, borderRadius: 10, padding: "2px 8px" }}>
          visit {visitCount}
        </div>
      </div>

      <button
        onClick={onShowCredits}
        style={{ position: "absolute", bottom: 10, left: 10, pointerEvents: "auto", ...label, fontSize: 11,
          width: 28, height: 28, borderRadius: "50%", background: "rgba(237,235,224,.9)",
          color: INK, border: `1px solid ${CONTOUR}`, cursor: "pointer" }}
      >
        i
      </button>
    </>
  );
}

// Content is placeholder throughout except the privacy line, which is a
// hard requirement (CLAUDE.md: the mic capture must say plainly, in the
// credits sheet among other places, that the recording never leaves the
// device) rather than something still being decided.
function CreditsSheet({ onClose }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(6,10,8,.55)", display: "flex",
      alignItems: "flex-end", zIndex: 5, pointerEvents: "auto" }}>
      <div style={{ width: "100%", background: PAPER, borderRadius: "16px 16px 0 0", padding: "18px 18px 22px",
        boxSizing: "border-box", color: INK }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 17 }}>Credits</div>
          <button
            onClick={onClose}
            style={{ ...label, background: "transparent", border: `1px solid ${CONTOUR}`, borderRadius: 4,
              padding: "4px 10px", cursor: "pointer", color: INK }}
          >
            close
          </button>
        </div>
        <div style={{ ...label, fontSize: 10, color: INK, opacity: .85, lineHeight: 1.7 }}>
          Fort Hill Loop
          <br />
          Composed by Elijah Bisbee
        </div>
        <div style={{ ...label, fontSize: 9, color: CONTOUR, opacity: .85, marginTop: 12, lineHeight: 1.6 }}>
          full stem / sample credits — TBD
        </div>
        <div style={{ ...label, fontSize: 9, color: INK, opacity: .75, marginTop: 14, lineHeight: 1.7,
          borderTop: `1px solid ${CONTOUR}`, paddingTop: 10 }}>
          your sung note stays on this device. no upload, no analytics on it, no exceptions.
        </div>
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
  const { status, error, boot, shutdown, setGain, setBreathingGain } = useAudioEngine();
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
  // solar-altitude calculation. Weather now drives its own stem (see the
  // effect below); daypart still doesn't drive audio (no filter/reverb
  // chain exists yet) -- CLAUDE.md specs that as master filter cutoff +
  // reverb wet, not a stem, so daypart has nothing to wire up here yet.
  const [weather, setWeather] = useState("clear");
  const [daypart, setDaypart] = useState("midday");
  const mapTint = getMapTint(weather, daypart);

  // Weather isn't position-driven like the rest of STEMS, so it doesn't go
  // through usePositionEngine's per-tick loop -- just react to the weather
  // value changing (or audio starting up already on a non-Clear value). The
  // active state's stem breathes continuously (setBreathingGain); the
  // inactive one gets a flat setGain(...,0,...), which also stops its own
  // breathing modulation if it had any (see AudioEngine.setGain).
  //
  // breatheStartedAtMs records approximately when the real oscillator starts
  // in AudioEngine (now + the ramp-in, in wall-clock terms via
  // performance.now() rather than the AudioContext's own clock) purely so
  // stemLevel can compute a live-looking UI value -- see that function.
  const [breatheStartedAtMs, setBreatheStartedAtMs] = useState(null);
  const [nowMs, setNowMs] = useState(() => performance.now());

  useEffect(() => {
    // audioOn has to gate breatheStartedAtMs too, not just the engine calls
    // below -- an early return here for !audioOn used to skip clearing it,
    // so stopping audio while a weather layer was active left the UI meter
    // "breathing" on stale state even though nothing was actually playing.
    const breathing = audioOn && (weather === "overcast" || weather === "wet");
    if (breathing) {
      setBreathingGain(WEATHER_STEM_IDS[weather], WEATHER_BREATHE, WEATHER_RAMP_BARS);
      setBreatheStartedAtMs(performance.now() + barsToSeconds(WEATHER_RAMP_BARS, TEMPO, BEATS_PER_BAR) * 1000);
    } else {
      setBreatheStartedAtMs(null);
    }
    if (!audioOn) return;
    if (weather !== "overcast") setGain(WEATHER_STEM_IDS.overcast, 0, WEATHER_RAMP_BARS);
    if (weather !== "wet") setGain(WEATHER_STEM_IDS.wet, 0, WEATHER_RAMP_BARS);
  }, [weather, audioOn, setGain, setBreathingGain]);

  // Drives nowMs forward only while something is actually breathing, so this
  // doesn't spin a rAF loop (and re-render App every frame) the rest of the
  // time.
  useEffect(() => {
    if (breatheStartedAtMs == null) return;
    let raf;
    const tick = () => {
      setNowMs(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [breatheStartedAtMs]);

  const [showLockScreen, setShowLockScreen] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const stack = STEMS.map((s, i) => ({
    key: s.id,
    name: stemDisplayName(s.id),
    color: STEM_COLORS[i % STEM_COLORS.length],
    level: stemLevel(s.id, { gains, stillnessActive, weather, breatheStartedAtMs, nowMs }),
    isWeather: s.id === WEATHER_STEM_IDS.overcast || s.id === WEATHER_STEM_IDS.wet,
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
          <PhonePreview onExit={() => { setShowFullscreen(false); setShowCredits(false); }}>
            <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
              {showLockScreen ? (
                <LockScreenPreview stack={stack} weatherIcon={weather} daypartIcon={daypart} />
              ) : (
                <TrailMap
                  path={path}
                  waypoints={WAYPOINTS}
                  gains={gains}
                  position={position}
                  bgColor={mapTint}
                  hud={
                    <MapHud
                      stack={stack}
                      weatherIcon={weather}
                      daypartIcon={daypart}
                      visitCount={visitCount}
                      onShowCredits={() => setShowCredits(true)}
                    />
                  }
                />
              )}
              {showCredits && <CreditsSheet onClose={() => setShowCredits(false)} />}
            </div>
          </PhonePreview>
        )}

        <div style={{ marginTop: 16 }}>
          {STEMS.map((s) => (
            <GainRow
              key={s.id}
              stemLabel={stemDisplayName(s.id)}
              level={stemLevel(s.id, { gains, stillnessActive, weather, breatheStartedAtMs, nowMs })}
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
