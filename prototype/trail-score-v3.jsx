import React, { useState, useRef, useEffect, useCallback } from "react";
import * as Tone from "tone";

/* ------------------------------------------------------------------
   TRAIL SCORE — Fort Hill Loop + Woodland approach
   Valley Parkway lot → walkway past the Nature Center → 155 stairs
   UP to the hilltop → loop → back DOWN the stairs → return.
   About 1 mile round trip.

   GEOREFERENCE (verified):
     Rocky River Nature Center  41.4090491, -81.8840210
     Fort Hill Stairs (base)    41.4091315, -81.8855033

   NOTE: subcomponents live at module scope on purpose. Defining them
   inside the render made React remount them on every state update,
   which ate click events.
------------------------------------------------------------------- */

const TEMPO = 66;
const PAPER = "#EDEBE0";
const INK = "#1B2A23";
const CONTOUR = "#B9A87E";
const WATER = "#6E9AA8";
const RIG = "#16211C";

const GPS_ERROR = 13;
const TICK_MS = 50;        // 20 Hz — near real GPS cadence
const SMOOTH_ALPHA = 0.13; // tuned for 20 Hz
const RAMP_SEC = 2.6;
const BUZZ_AT = 0.85;
const REARM_AT = 0.5;
const STILL_AFTER = 3000;

const WAYPOINTS = [
  { id: "walkway", name: "The Walkway", song: "First Land", blurb: "drone",
    x: 310, y: 608, radius: 175, color: "#C2452D", credit: "Elijah Bisbee", instrument: "bowed guitar" },
  { id: "stairs", name: "Foot of the Stairs", song: "Hundred Fifty-Five", blurb: "bass",
    x: 140, y: 535, radius: 110, color: "#4A6FA5", credit: "Elijah Bisbee", instrument: "upright bass" },
  { id: "overlook", name: "The Overlook", song: "Ninety Feet", blurb: "bells",
    x: 100, y: 470, radius: 105, color: "#E0A02B", credit: "Elijah Bisbee", instrument: "glockenspiel" },
  { id: "earthwork", name: "The Earthworks", song: "Walls and Ditches", blurb: "plucked",
    x: 90, y: 378, radius: 120, color: "#3F7A6B", credit: "guest artist", instrument: "banjo, harp" },
  { id: "northrim", name: "North Rim", song: "Sycamore Light", blurb: "pad",
    x: 170, y: 235, radius: 125, color: "#8A5A8C", credit: "Elijah Bisbee", instrument: "strings" },
  { id: "ridge", name: "East Ridge", song: "The Long Way Down", blurb: "voice",
    x: 325, y: 300, radius: 130, color: "#2F7D8C", credit: "Elijah Bisbee", instrument: "voice, tape" },
  { id: "return", name: "The Return", song: "Back Down the Hill", blurb: "steel",
    x: 270, y: 432, radius: 120, color: "#B4633A", credit: "Elijah Bisbee", instrument: "pedal steel" },
];

const WEATHER = {
  clear:    { label: "Clear",    stem: "Open Sky",    color: "#D9A441", level: .25 },
  overcast: { label: "Overcast", stem: "Low Ceiling", color: "#8A9AA0", level: .5 },
  wet:      { label: "Wet",      stem: "Runoff",      color: "#5E86A8", level: .85 },
};
const DAYPARTS = {
  morning: { label: "Morning", tone: .15, wet: .30 },
  midday:  { label: "Midday",  tone: .00, wet: .25 },
  golden:  { label: "Golden",  tone: .45, wet: .45 },
  dusk:    { label: "Dusk",    tone: .75, wet: .60 },
};

const APPROACH = [[392, 640], [355, 628], [318, 614], [285, 600], [252, 586], [225, 575],
  [196, 562], [168, 550], [148, 541]];
const STAIRS = [[130, 520], [116, 496], [104, 478]];
const UP = [...APPROACH, ...STAIRS];
const LOOP = [
  [95, 435], [90, 395], [95, 350], [110, 305], [135, 265], [170, 235], [212, 218],
  [255, 220], [292, 238], [318, 268], [330, 305], [328, 345], [312, 383], [288, 415],
  [255, 440], [218, 458], [178, 468], [138, 472],
];
const TRAIL = [...UP, ...LOOP, ...[...UP].reverse()];
const STAIR_ZONE = { x0: 96, x1: 152, y0: 470, y1: 545 };

const toPath = (p) => p.reduce((d, [x, y], i) => d + (i ? ` L ${x} ${y}` : `M ${x} ${y}`), "");
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (t) => t * t * (3 - 2 * t);
const gainFor = (d, r) => smoothstep(clamp(1 - d / r, 0, 1));

const mixc = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
};

const label = { fontFamily: "ui-monospace, 'SF Mono', Menlo, 'Courier New', monospace",
  fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase" };
const legend = { fontFamily: "Georgia, 'Iowan Old Style', serif" };

/* ================= module-scope subcomponents ================= */

const Ico = ({ kind, size = 15, color = INK, dim = 1, flip }) => {
  const box = { width: size, height: size, flexShrink: 0, opacity: dim,
    transform: flip ? "scaleX(-1)" : undefined };
  const a = { stroke: color, fill: "none", strokeWidth: 1.6, strokeLinecap: "round" };
  switch (kind) {
    case "clear": return (
      <svg viewBox="0 0 20 20" style={box}><circle cx="10" cy="10" r="4" {...a} />
        {[0,45,90,135,180,225,270,315].map((d) => (
          <line key={d} {...a} x1={10+Math.cos(d*Math.PI/180)*6.5} y1={10+Math.sin(d*Math.PI/180)*6.5}
            x2={10+Math.cos(d*Math.PI/180)*8.5} y2={10+Math.sin(d*Math.PI/180)*8.5} />))}</svg>);
    case "overcast": return (
      <svg viewBox="0 0 20 20" style={box}><path {...a}
        d="M5 13 a3.2 3.2 0 0 1 .4 -6.3 a4 4 0 0 1 7.6 -.6 a3 3 0 0 1 1.5 5.6 z" /></svg>);
    case "wet": return (
      <svg viewBox="0 0 20 20" style={box}><path {...a}
        d="M5 11 a3 3 0 0 1 .4 -5.8 a3.7 3.7 0 0 1 7 -.5 a2.8 2.8 0 0 1 1.4 5.2 z" />
        <line {...a} x1="7" y1="14" x2="6" y2="17" /><line {...a} x1="11" y1="14" x2="10" y2="17" />
        <line {...a} x1="15" y1="14" x2="14" y2="17" /></svg>);
    case "sun-arc": return (
      <svg viewBox="0 0 20 20" style={box}><path {...a} d="M2 14 a8 8 0 0 1 16 0" strokeDasharray="2 2.4" />
        <line {...a} x1="1" y1="14" x2="19" y2="14" />
        <circle cx="10" cy="6.2" r="2.6" fill={color} stroke="none" /></svg>);
    case "dusk": return (
      <svg viewBox="0 0 20 20" style={box}><line {...a} x1="1" y1="14" x2="19" y2="14" />
        <circle cx="10" cy="13" r="3.4" {...a} /><path {...a} d="M4 10.5 L2.6 9" />
        <path {...a} d="M16 10.5 L17.4 9" /></svg>);
    case "still": return (
      <svg viewBox="0 0 20 20" style={box}><circle cx="10" cy="10" r="2.4" fill={color} stroke="none" />
        <circle cx="10" cy="10" r="5.4" {...a} /><circle cx="10" cy="10" r="8.4" {...a} opacity=".5" /></svg>);
    case "climb": return (
      <svg viewBox="0 0 20 20" style={box}><path {...a} d="M2 17 h4 v-4 h4 v-4 h4 v-4 h4" /></svg>);
    case "mic": return (
      <svg viewBox="0 0 20 20" style={box}><rect x="7.5" y="2.5" width="5" height="9" rx="2.5" {...a} />
        <path {...a} d="M4.5 9.5 a5.5 5.5 0 0 0 11 0" /><line {...a} x1="10" y1="15" x2="10" y2="17.5" /></svg>);
    default: return null;
  }
};

const Btn = ({ children, onClick, primary, disabled, style: st }) => (
  <button className="tsBtn" onClick={onClick} disabled={disabled}
    style={{ ...label, padding: "12px 14px", background: primary ? PAPER : "transparent",
      color: primary ? INK : CONTOUR, border: primary ? "none" : `1px solid ${CONTOUR}`,
      borderRadius: 3, ...st }}>{children}</button>
);

const Conditions = ({ weather, daypart, still, stairDir, captured, color = INK, dim = .62 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
    <Ico kind={weather} color={color} dim={dim} />
    <Ico kind={daypart === "dusk" ? "dusk" : "sun-arc"} color={color} dim={dim} />
    {still && <Ico kind="still" color={color} />}
    {stairDir && <Ico kind="climb" color={color} flip={stairDir === "down"} />}
    {captured && <Ico kind="mic" color={color} />}
  </div>
);

const Artwork = ({ stack, size }) => (
  <div style={{ width: size, height: size, borderRadius: 8, overflow: "hidden", display: "flex",
    flexShrink: 0, background: "#2A3B33" }}>
    {stack.map((s) => <div key={s.key} style={{ flex: s.level, background: s.color,
      transition: "flex 2s linear" }} />)}
  </div>
);

const LayerList = ({ stack }) => (
  <div>{stack.map((s) => (
    <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2.5px 0" }}>
      <span style={{ width: 4, height: 11, background: s.color, flexShrink: 0 }} />
      <span style={{ ...label, fontSize: 9, color: CONTOUR, flex: 1, minWidth: 0, whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
      <span style={{ width: 40, height: 3, background: "#2A3B33", flexShrink: 0 }}>
        <span style={{ display: "block", height: "100%", width: `${s.level * 100}%`,
          background: s.color, transition: "width 2s linear" }} />
      </span>
    </div>))}
  </div>
);

const Tabs = ({ screen, locked, onGo }) => (
  <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
    {["start", "map", "capture", "summary", "pocket"].map((s) => {
      const on = s === "pocket" ? locked : (!locked && screen === s);
      return <button key={s} className="tsBtn" onClick={() => onGo(s)}
        style={{ ...label, flex: 1, fontSize: 7.5, padding: "9px 1px",
          background: on ? PAPER : "transparent", color: on ? INK : CONTOUR,
          border: `1px solid ${CONTOUR}`, borderRadius: 3 }}>{s}</button>;
    })}
  </div>
);

const Selector = ({ name, options, current, onPick }) => (
  <div style={{ marginTop: 11 }}>
    <div style={{ ...label, fontSize: 8, color: CONTOUR, opacity: .6, marginBottom: 5 }}>{name}</div>
    <div style={{ display: "flex", gap: 5 }}>
      {options.map(([k, text]) => (
        <button key={k} className="tsBtn" onClick={() => onPick(k)}
          style={{ ...label, flex: 1, fontSize: 8, padding: "8px 1px",
            background: current === k ? "#22332B" : "transparent",
            color: current === k ? PAPER : CONTOUR,
            border: `1px solid ${current === k ? CONTOUR : "#2A3B33"}`, borderRadius: 3 }}>{text}</button>))}
    </div>
  </div>
);

/* ================= main ================= */

export default function TrailScore() {
  const [screen, setScreen] = useState("start");
  const [locked, setLocked] = useState(false);
  const [pos, setPos] = useState({ x: 392, y: 640 });
  const [audioOn, setAudioOn] = useState(false);
  const [booting, setBooting] = useState(false);
  const [walking, setWalking] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [gains, setGains] = useState(() => WAYPOINTS.map(() => 0));
  const [visited, setVisited] = useState(() => new Set());
  const [sheet, setSheet] = useState(false);
  const [notes, setNotes] = useState(false);
  const [lastBuzz, setLastBuzz] = useState(null);
  const [weather, setWeather] = useState("overcast");
  const [daypart, setDaypart] = useState("golden");
  const [visitNo, setVisitNo] = useState(2);
  const [still, setStill] = useState(false);
  const [stairDir, setStairDir] = useState(null);
  const [captured, setCaptured] = useState(false);
  const [capState, setCapState] = useState("idle");
  const [capSecs, setCapSecs] = useState(0);
  const [collected] = useState(() => new Set(["clear|morning", "overcast|midday"]));

  const audio = useRef(null);
  const svgRef = useRef(null);
  const walkRef = useRef({ leg: 0, t: 0 });
  const trueRef = useRef({ x: 392, y: 640 });
  const smoothRef = useRef({ x: 392, y: 640 });
  const armed = useRef(Object.fromEntries(WAYPOINTS.map((w) => [w.id, true])));
  const moveStamp = useRef(Date.now());
  const dyRef = useRef(0);
  const walkingRef = useRef(false);
  const speedRef = useRef(4);

  useEffect(() => { walkingRef.current = walking; }, [walking]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const stillOn = still && visitNo >= 2;

  /* ---------------- audio ---------------- */
  const buildAudio = useCallback(async () => {
    await Tone.start();
    const T = Tone.getTransport ? Tone.getTransport() : Tone.Transport;
    T.bpm.value = TEMPO;
    const reverb = new Tone.Reverb({ decay: 7, wet: .4 }).toDestination();
    const tone = new Tone.Filter({ type: "lowpass", frequency: 16000 }).connect(reverb);
    const g = {};
    [...WAYPOINTS.map((w) => w.id), "weather", "still", "captured"].forEach((id) => {
      g[id] = new Tone.Gain(0).connect(tone);
    });

    const drone = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 1.5,
      envelope: { attack: 4, decay: 2, sustain: 1, release: 6 },
      modulationEnvelope: { attack: 6, sustain: 1 }, volume: -14 }).connect(g.walkway);
    const l1 = new Tone.Loop((t) => drone.triggerAttackRelease(["D2", "A2"], "3m", t), "3m");

    const bass = new Tone.MonoSynth({ oscillator: { type: "triangle" }, filter: { Q: 1, frequency: 420 },
      envelope: { attack: .02, decay: .5, sustain: .1, release: .8 }, volume: -8 }).connect(g.stairs);
    const bn = ["D2","D2","A1","D2","C2","C2","G1","A1"]; let i1 = 0;
    const l2 = new Tone.Loop((t) => bass.triggerAttackRelease(bn[i1++ % bn.length], "8n", t), "2n");

    const bell = new Tone.FMSynth({ harmonicity: 3.01, modulationIndex: 9,
      envelope: { attack: .005, decay: 2.4, sustain: 0, release: 2.4 }, volume: -16 }).connect(g.overlook);
    const bl = ["D6","A5","F5","E6","G5","A5","D6","C6"]; let i2 = 0;
    const l3 = new Tone.Loop((t) => { if (i2 % 3 !== 1) bell.triggerAttackRelease(bl[i2 % bl.length], "2n", t); i2++; }, "2n.");

    const pluck = new Tone.PluckSynth({ attackNoise: .7, dampening: 2600, resonance: .92, volume: -6 }).connect(g.earthwork);
    const pl = ["D4","F4","A4","G4","E4","A4","F4","D4"]; let i3 = 0;
    const l4 = new Tone.Loop((t) => pluck.triggerAttackRelease(pl[i3++ % pl.length], "8n", t), "8n");

    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", count: 3, spread: 24 },
      envelope: { attack: 3, decay: 1, sustain: .9, release: 5 }, volume: -24 }).connect(g.northrim);
    const ch = [["D4","F4","A4"],["C4","E4","G4"],["B3","D4","G4"],["A3","C4","E4"]]; let i4 = 0;
    const l5 = new Tone.Loop((t) => pad.triggerAttackRelease(ch[i4++ % ch.length], "2m", t), "2m");

    const vox = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 2, oscillator: { type: "sine" },
      envelope: { attack: 1.6, decay: 1, sustain: .7, release: 3.5 }, volume: -18 }).connect(g.ridge);
    const vl = [["A4","D5"],["G4","C5"],["F4","A4"],["E4","A4"]]; let i5 = 0;
    const l6 = new Tone.Loop((t) => vox.triggerAttackRelease(vl[i5++ % vl.length], "1m", t), "1m");

    const steel = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" },
      envelope: { attack: 1.2, decay: 2, sustain: .5, release: 4 }, volume: -20 }).connect(g.return);
    const sl = [["F4","A4","C5"],["E4","G4","B4"],["D4","F4","A4"]]; let i7 = 0;
    const l10 = new Tone.Loop((t) => steel.triggerAttackRelease(sl[i7++ % sl.length], "1m", t), "1m");

    const wNoise = new Tone.NoiseSynth({ noise: { type: "pink" },
      envelope: { attack: 2, decay: 1, sustain: 1, release: 3 }, volume: -26 }).connect(g.weather);
    const l7 = new Tone.Loop((t) => wNoise.triggerAttackRelease("2m", t), "2m");

    const shimmer = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" },
      envelope: { attack: 5, decay: 2, sustain: .9, release: 8 }, volume: -22 }).connect(g.still);
    const sc = [["D5","A5","D6"],["C5","G5","E6"]]; let i6 = 0;
    const l8 = new Tone.Loop((t) => shimmer.triggerAttackRelease(sc[i6++ % sc.length], "4m", t), "4m");

    const cap = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 1.01, oscillator: { type: "sine" },
      envelope: { attack: 2.5, decay: 2, sustain: .8, release: 6 }, volume: -20 }).connect(g.captured);
    const l9 = new Tone.Loop((t) => cap.triggerAttackRelease(["D4", "A4"], "4m", t), "4m");

    const loops = [l1,l2,l3,l4,l5,l6,l7,l8,l9,l10];
    loops.forEach((l) => l.start(0));
    T.start();
    audio.current = { gains: g, tone, reverb, dispose: () => {
      T.stop(); T.cancel(); loops.forEach((l) => l.dispose());
      [drone,bass,bell,pluck,pad,vox,steel,wNoise,shimmer,cap].forEach((s) => s.dispose());
      Object.values(g).forEach((n) => n.dispose()); tone.dispose(); reverb.dispose();
    } };
  }, []);

  const toggleAudio = async () => {
    if (audioOn) { audio.current?.dispose(); audio.current = null; setAudioOn(false); return; }
    setBooting(true);
    try { await buildAudio(); setAudioOn(true); } catch (e) { console.error(e); }
    setBooting(false);
  };
  useEffect(() => () => audio.current?.dispose(), []);

  useEffect(() => {
    if (!audio.current) return;
    const d = DAYPARTS[daypart];
    audio.current.tone.frequency.rampTo(16000 - d.tone * 13500, 3);
    audio.current.reverb.wet.rampTo(d.wet, 3);
  }, [daypart, audioOn]);

  useEffect(() => {
    if (!audio.current) return;
    audio.current.gains.weather.gain.rampTo(WEATHER[weather].level, RAMP_SEC);
    audio.current.gains.still.gain.rampTo(stillOn ? .8 : 0, 4);
    audio.current.gains.captured.gain.rampTo(captured ? .6 : 0, RAMP_SEC);
  }, [weather, stillOn, captured, audioOn]);

  useEffect(() => {
    const next = WAYPOINTS.map((w) => gainFor(dist(pos.x, pos.y, w.x, w.y), w.radius));
    setGains(next);
    if (audio.current) WAYPOINTS.forEach((w, i) => audio.current.gains[w.id].gain.rampTo(next[i], RAMP_SEC));
    WAYPOINTS.forEach((w, i) => {
      if (next[i] >= BUZZ_AT && armed.current[w.id]) {
        armed.current[w.id] = false;
        setVisited((p) => new Set(p).add(w.id));
        setLastBuzz(w.id); setTimeout(() => setLastBuzz((c) => (c === w.id ? null : c)), 900);
        try { if (navigator.vibrate) navigator.vibrate([16, 70, 26]); } catch (e) {}
      } else if (next[i] < REARM_AT && !armed.current[w.id]) armed.current[w.id] = true;
    });
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- one steady 20 Hz loop; reads walking/speed from refs ---- */
  useEffect(() => {
    const id = setInterval(() => {
      const dt = TICK_MS / 1000;
      if (walkingRef.current) {
        moveStamp.current = Date.now();
        const w = walkRef.current; let guard = 0, len = 0;
        do {
          const a = TRAIL[w.leg], b = TRAIL[(w.leg + 1) % TRAIL.length];
          len = dist(a[0], a[1], b[0], b[1]);
          if (len < .5) w.leg = (w.leg + 1) % TRAIL.length;
        } while (len < .5 && guard++ < TRAIL.length);
        w.t += (1.35 * speedRef.current * dt) / Math.max(len, 1);
        while (w.t >= 1) { w.t -= 1; w.leg = (w.leg + 1) % TRAIL.length; }
        const a = TRAIL[w.leg], b = TRAIL[(w.leg + 1) % TRAIL.length];
        trueRef.current = { x: a[0] + (b[0] - a[0]) * w.t, y: a[1] + (b[1] - a[1]) * w.t };
      }
      setStill(Date.now() - moveStamp.current > STILL_AFTER);

      const prev = smoothRef.current;
      const r = { x: trueRef.current.x + (Math.random() - .5) * GPS_ERROR * 2,
                  y: trueRef.current.y + (Math.random() - .5) * GPS_ERROR * 2 };
      const nx = prev.x + (r.x - prev.x) * SMOOTH_ALPHA;
      const ny = prev.y + (r.y - prev.y) * SMOOTH_ALPHA;
      dyRef.current = dyRef.current * .88 + (ny - prev.y) * .12;
      smoothRef.current = { x: nx, y: ny };

      const inZone = nx > STAIR_ZONE.x0 && nx < STAIR_ZONE.x1 && ny > STAIR_ZONE.y0 && ny < STAIR_ZONE.y1;
      setStairDir(inZone ? (dyRef.current < 0 ? "up" : "down") : null);
      setPos({ x: nx, y: ny });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (capState !== "rec") return;
    const id = setInterval(() => setCapSecs((s) => {
      if (s >= 14) { setCapState("done"); return 15; } return s + 1;
    }), 300);
    return () => clearInterval(id);
  }, [capState]);

  /* ---- controls ---- */
  const startWalk = () => {
    const nw = !walking;
    setWalking(nw);
    if (nw && !locked && screen !== "map") setScreen("map");
  };
  const goTo = (s) => {
    if (s === "pocket") { setLocked(true); return; }
    setLocked(false); setScreen(s); setSheet(false);
  };
  const place = (evt) => {
    const svg = svgRef.current; if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sc = Math.min(r.width / 420, r.height / 700);
    const ox = (r.width - 420 * sc) / 2, oy = (r.height - 700 * sc) / 2;
    trueRef.current = { x: (evt.clientX - r.left - ox) / sc, y: (evt.clientY - r.top - oy) / sc };
    moveStamp.current = Date.now();
  };

  /* ---- derived ---- */
  const stack = [
    ...WAYPOINTS.map((w, i) => ({ key: w.id, name: w.song, color: w.color, level: gains[i] })),
    { key: "weather", name: WEATHER[weather].stem, color: WEATHER[weather].color,
      level: WEATHER[weather].level },
    ...(stillOn ? [{ key: "still", name: "Standing Still", color: "#C9C2AE", level: .8 }] : []),
    ...(captured ? [{ key: "cap", name: "Your Voice", color: "#E8DCC0", level: .6 }] : []),
  ].filter((s) => s.level > .08).sort((a, b) => b.level - a.level);

  const strongest = gains.reduce((b, g, i) => (g > gains[b] ? i : b), 0);
  const dominant = gains[strongest] > .05 ? WAYPOINTS[strongest] : null;
  const tint = mixc(dominant ? mixc(PAPER, dominant.color, gains[strongest] * .15) : PAPER,
    "#6A5A3E", DAYPARTS[daypart].tone * .18);
  const nextT = WAYPOINTS.filter((w) => !visited.has(w.id))
    .sort((a, b) => dist(pos.x, pos.y, a.x, a.y) - dist(pos.x, pos.y, b.x, b.y))[0];
  const bearing = nextT ? Math.atan2(nextT.y - pos.y, nextT.x - pos.x) * (180 / Math.PI) : 0;
  const tDist = nextT ? Math.round(dist(pos.x, pos.y, nextT.x, nextT.y)) : 0;
  const cond = { weather, daypart, still: stillOn, stairDir, captured };

  return (
    <div style={{ background: RIG, minHeight: "100%", padding: "14px 12px 22px", color: PAPER,
      fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .tsBtn{transition:background .15s,color .15s;cursor:pointer}
        .tsBtn:disabled{cursor:default;opacity:.6}
        .tsBtn:focus-visible{outline:2px solid ${CONTOUR};outline-offset:2px}
        .tsSheet{transition:transform .28s cubic-bezier(.22,.61,.36,1)}
        @keyframes tsPulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(3.4);opacity:0}}
        @keyframes tsBreathe{0%,100%{opacity:.3}50%{opacity:.85}}
        @media (prefers-reduced-motion:reduce){.tsSheet{transition:none}}
      `}</style>

      <div style={{ maxWidth: 380, margin: "0 auto", height: "min(62vh, 600px)", minHeight: 430,
        border: `8px solid ${INK}`, borderRadius: 28, overflow: "hidden", position: "relative",
        display: "flex", flexDirection: "column",
        background: locked ? "#0C120F" : tint, boxShadow: "0 18px 40px rgba(0,0,0,.5)" }}>

        {locked && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            justifyContent: "space-between", padding: "26px 16px 20px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...legend, fontSize: 46, color: PAPER, opacity: .92, lineHeight: 1 }}>5:47</div>
              <div style={{ ...label, color: CONTOUR, opacity: .55, marginTop: 6 }}>Saturday, October 11</div>
            </div>
            <div style={{ background: "rgba(255,255,255,.07)", borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Artwork stack={stack} size={50} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...legend, fontSize: 15, color: PAPER }}>Fort Hill Loop</div>
                  <div style={{ ...label, fontSize: 9, color: CONTOUR, marginTop: 4 }}>Elijah Bisbee</div>
                </div>
                <Conditions {...cond} color={CONTOUR} dim={.75} />
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,.09)", marginTop: 11, paddingTop: 7 }}>
                <LayerList stack={stack} />
              </div>
            </div>
          </div>
        )}

        {!locked && screen === "start" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 20px",
            color: INK, justifyContent: "space-between", overflowY: "auto" }}>
            <div>
              <div style={{ ...label, opacity: .5 }}>Cleveland Metroparks</div>
              <h1 style={{ ...legend, fontSize: 27, fontWeight: 400, margin: "8px 0 0", lineHeight: 1.15 }}>
                Fort Hill Loop</h1>
              <div style={{ ...label, opacity: .5, marginTop: 7 }}>about 1 mile · 7 waypoints · 155 stairs</div>
            </div>
            <div style={{ border: `1px solid ${CONTOUR}`, borderRadius: 4, padding: "14px 14px 12px",
              margin: "16px 0" }}>
              <div style={{ ...label, opacity: .5, marginBottom: 10 }}>Today you'll hear</div>
              {[[weather, WEATHER[weather].label, WEATHER[weather].stem],
                [daypart === "dusk" ? "dusk" : "sun-arc", DAYPARTS[daypart].label, "light and air"]]
                .map(([ico, name, note]) => (
                <div key={name} style={{ display: "flex", gap: 11, alignItems: "center", padding: "5px 0" }}>
                  <Ico kind={ico} size={18} />
                  <span style={{ ...legend, fontSize: 14, flex: 1 }}>{name}</span>
                  <span style={{ ...label, fontSize: 9, opacity: .55 }}>{note}</span>
                </div>))}
              <div style={{ borderTop: `1px solid ${CONTOUR}88`, marginTop: 9, paddingTop: 10,
                ...label, fontSize: 9, opacity: .6 }}>
                {visitNo === 1 ? "First walk" : `Walk no. ${visitNo} — stillness unlocked`}
              </div>
            </div>
            <div>
              <div style={{ ...label, fontSize: 9, opacity: .55, lineHeight: 1.9, marginBottom: 12 }}>
                headphones recommended<br />the music keeps playing with your screen off
              </div>
              <Btn primary onClick={() => { setScreen("map"); setWalking(true); }}
                style={{ width: "100%" }}>begin the walk</Btn>
            </div>
          </div>
        )}

        {!locked && screen === "map" && (<>
          <div style={{ padding: "10px 14px 2px", display: "flex", justifyContent: "space-between",
            alignItems: "center", flexShrink: 0 }}>
            <span style={{ ...label, color: INK, opacity: .55 }}>{visited.size} / {WAYPOINTS.length}</span>
            <Conditions {...cond} />
          </div>

          <svg ref={svgRef} viewBox="0 0 420 700" preserveAspectRatio="xMidYMid meet"
            style={{ flex: 1, minHeight: 0, width: "100%", touchAction: "none", cursor: "crosshair" }}
            onPointerDown={(e) => { setWalking(false); e.currentTarget.setPointerCapture(e.pointerId); place(e); }}
            onPointerMove={(e) => { if (e.buttons) place(e); }}>

            <g stroke={CONTOUR} fill="none" opacity=".3">
              <ellipse cx="205" cy="335" rx="150" ry="160" /><ellipse cx="205" cy="330" rx="112" ry="120" />
              <ellipse cx="208" cy="326" rx="72" ry="78" /><ellipse cx="210" cy="322" rx="34" ry="38" />
            </g>
            <path d="M 4 210 Q 34 330 22 450 Q 12 560 66 646 Q 150 706 280 682 Q 372 664 424 696"
              stroke={WATER} strokeWidth="9" fill="none" opacity=".42" />
            <text x="44" y="300" style={{ ...label, fontSize: 8 }} fill={WATER} opacity=".85"
              transform="rotate(78 44 300)">Rocky River</text>
            <path d="M 66 505 L 58 450 L 56 390 L 64 330" stroke={INK} strokeWidth="2" fill="none" opacity=".5" />
            {[0,1,2,3,4,5].map((i) => (
              <line key={i} x1={64 - i * 1.2} y1={496 - i * 34} x2={53 - i * 1.2} y2={492 - i * 34}
                stroke={INK} strokeWidth="1.5" opacity=".4" />))}
            <text x="30" y="420" style={{ ...label, fontSize: 8 }} fill={INK} opacity=".5"
              transform="rotate(-90 30 420)">shale cliff · 90 ft</text>

            <rect x="368" y="616" width="46" height="42" rx="3" fill="none" stroke={INK}
              strokeWidth="1.5" opacity=".55" />
            <text x="384" y="643" style={{ ...legend, fontSize: 17 }} fill={INK} opacity=".6">P</text>
            <path d="M 208 566 L 246 560 L 252 582 L 214 588 Z" fill={INK} opacity=".18"
              stroke={INK} strokeWidth="1.2" />
            <text x="196" y="605" style={{ ...label, fontSize: 8 }} fill={INK} opacity=".55">Nature Center</text>

            {WAYPOINTS.map((w, i) => (
              <g key={w.id}>
                {[1, .72, .45].map((f, k) => (
                  <circle key={k} cx={w.x} cy={w.y} r={w.radius * f} fill="none" stroke={w.color}
                    strokeWidth="1" strokeDasharray="3 5" opacity={.13 + gains[i] * .4} />))}
                <circle cx={w.x} cy={w.y} r={w.radius * .45} fill={w.color} opacity={gains[i] * .1} />
              </g>))}

            <path d={toPath([...UP, ...LOOP, [104, 478]])} stroke={INK} strokeWidth="4" fill="none"
              strokeLinecap="round" strokeLinejoin="round" opacity=".85" />

            {Array.from({ length: 9 }).map((_, i) => {
              const t = i / 8, x = 148 + (104 - 148) * t, y = 541 + (478 - 541) * t;
              return <line key={i} x1={x - 6} y1={y - 4} x2={x + 6} y2={y + 4} stroke={INK}
                strokeWidth={stairDir ? 3 : 2} opacity={stairDir ? 1 : .7} />;
            })}
            <text x="150" y="512" style={{ ...label, fontSize: 8 }} fill={INK} opacity=".5">155 steps up</text>

            {WAYPOINTS.map((w, i) => (
              <g key={w.id}>
                {lastBuzz === w.id && <circle cx={w.x} cy={w.y} r="14" fill="none" stroke={w.color}
                  strokeWidth="3" style={{ animation: "tsPulse .9s ease-out",
                    transformOrigin: `${w.x}px ${w.y}px` }} />}
                <rect x={w.x - 5} y={w.y - 9} width="10" height="18" rx="1.5"
                  fill={visited.has(w.id) ? w.color : tint} stroke={w.color} strokeWidth="2.5" />
                <text x={w.x + 12} y={w.y + 4} style={{ ...label, fontSize: 9 }} fill={INK}
                  opacity={.5 + gains[i] * .5}>{w.name}</text>
              </g>))}

            {stillOn && [22, 34, 46].map((r, k) => (
              <circle key={r} cx={pos.x} cy={pos.y} r={r} fill="none" stroke={INK} strokeWidth="1"
                style={{ animation: `tsBreathe ${4 + k}s ease-in-out infinite` }} />))}
            <circle cx={pos.x} cy={pos.y} r="13" fill={INK} opacity=".12" />
            <circle cx={pos.x} cy={pos.y} r="6.5" fill={INK} stroke={tint} strokeWidth="2.5" />
            {nextT && <g transform={`translate(${pos.x} ${pos.y}) rotate(${bearing}) translate(22 0)`}>
              <path d="M 0 -6 L 9 0 L 0 6 Z" fill={nextT.color} /></g>}

            <g style={label} fill={INK} opacity=".45">
              <line x1="24" y1="680" x2="124" y2="680" stroke={INK} strokeWidth="1.5" />
              <text x="24" y="672" fontSize="9">100 m</text>
            </g>
          </svg>

          <div style={{ background: INK, padding: "11px 14px", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...legend, fontSize: 15 }}>
                  {stairDir === "up" ? "The Stairs — climbing"
                    : stairDir === "down" ? "The Stairs — descending"
                    : stillOn ? "Standing still" : "Fort Hill Loop"}
                </div>
                <div style={{ ...label, color: CONTOUR, marginTop: 3 }}>
                  {nextT ? `${tDist} m to next · ` : ""}{stack.length} layers</div>
              </div>
              <Btn onClick={() => setSheet(true)} style={{ padding: "9px 11px", flexShrink: 0 }}>credits</Btn>
            </div>
            <div style={{ marginTop: 8 }}><LayerList stack={stack} /></div>
          </div>

          <div className="tsSheet" style={{ position: "absolute", left: 0, right: 0, bottom: 0,
            background: tint, color: INK, borderTop: `2px solid ${INK}`, padding: "16px 16px 22px",
            maxHeight: "80%", overflowY: "auto", zIndex: 15,
            transform: sheet ? "translateY(0)" : "translateY(105%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
              marginBottom: 10 }}>
              <span style={{ ...legend, fontSize: 17 }}>Credits</span>
              <button className="tsBtn" onClick={() => setSheet(false)} style={{ ...label,
                background: "transparent", border: "none", color: INK, opacity: .6, padding: 6 }}>close</button>
            </div>
            {WAYPOINTS.map((w) => (
              <div key={w.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0",
                borderBottom: `1px solid ${CONTOUR}66` }}>
                <span style={{ width: 8, height: 15, background: w.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...legend, fontSize: 13 }}>“{w.song}”</span>
                  <span style={{ ...label, fontSize: 9, display: "block", opacity: .6, marginTop: 2 }}>
                    {w.name} · {w.instrument}</span>
                </span>
                <span style={{ ...label, fontSize: 9 }}>{w.credit}</span>
              </div>))}
            <div style={{ ...label, fontSize: 9, opacity: .55, marginTop: 12, lineHeight: 1.9 }}>
              condition layers by Elijah Bisbee<br />
              your recording stays on this phone and is never uploaded
            </div>
          </div>
        </>)}

        {!locked && screen === "capture" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 20px",
            color: INK, justifyContent: "space-between", textAlign: "center" }}>
            <div>
              <div style={{ ...label, opacity: .5 }}>The Overlook</div>
              <h2 style={{ ...legend, fontSize: 22, fontWeight: 400, margin: "10px 0 0", lineHeight: 1.3 }}>
                {capState === "done" ? "Keep this?" : "Sing one note"}</h2>
              <p style={{ ...label, fontSize: 9, opacity: .6, lineHeight: 2, marginTop: 10 }}>
                {capState === "done" ? "tuned to the key and folded into the mix"
                  : "any pitch — it will be tuned to the piece"}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: 80 }}>
              {Array.from({ length: 25 }).map((_, i) => {
                const active = capState === "rec" && i < (capSecs / 15) * 25;
                const h = capState === "idle" ? 4
                  : 10 + Math.abs(Math.sin(i * 1.3)) * (capState === "done" ? 42 : 56);
                return <span key={i} style={{ width: 4, borderRadius: 2,
                  height: capState === "rec" && !active ? 4 : h,
                  background: capState === "done" ? "#B4633A" : active ? INK : `${INK}33`,
                  transition: "height .25s ease" }} />;
              })}
            </div>
            <div>
              {capState !== "done" ? (<>
                <button className="tsBtn" onClick={() => { setCapSecs(0); setCapState("rec"); }}
                  disabled={capState === "rec"} style={{ width: 70, height: 70, borderRadius: "50%",
                    border: `2px solid ${INK}`, background: capState === "rec" ? INK : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                  <Ico kind="mic" size={28} color={capState === "rec" ? PAPER : INK} /></button>
                <div style={{ ...label, fontSize: 9, opacity: .55, marginTop: 12 }}>
                  {capState === "rec" ? `listening · ${Math.min(capSecs, 15)}s` : "tap to record"}</div>
                <Btn onClick={() => setScreen("map")} style={{ width: "100%", marginTop: 14,
                  border: "none", opacity: .6 }}>skip</Btn>
              </>) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={() => { setCapState("idle"); setCapSecs(0); }} style={{ flex: 1 }}>retry</Btn>
                  <Btn primary onClick={() => { setCaptured(true); setScreen("map"); }} style={{ flex: 2 }}>
                    add to the mix</Btn>
                </div>)}
            </div>
          </div>
        )}

        {!locked && screen === "summary" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 22px", color: INK }}>
            <div style={{ ...label, opacity: .5 }}>Your walk</div>
            <div style={{ display: "flex", gap: 13, alignItems: "center", margin: "12px 0 18px" }}>
              <Artwork stack={stack} size={72} />
              <div>
                <div style={{ ...legend, fontSize: 19 }}>Fort Hill Loop</div>
                <div style={{ ...label, fontSize: 9, opacity: .55, marginTop: 5 }}>
                  {WEATHER[weather].label} · {DAYPARTS[daypart].label}</div>
                <div style={{ ...label, fontSize: 9, opacity: .55, marginTop: 3 }}>
                  {stack.length} layers · 41 min</div>
              </div>
            </div>
            <div style={{ ...label, opacity: .5, marginBottom: 7 }}>Conditions collected</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto repeat(4, 1fr)", gap: 4, marginBottom: 18 }}>
              <span />
              {Object.entries(DAYPARTS).map(([k, d]) => (
                <span key={k} style={{ ...label, fontSize: 7, opacity: .5, textAlign: "center" }}>
                  {d.label.slice(0, 4)}</span>))}
              {Object.entries(WEATHER).map(([wk, w]) => (
                <React.Fragment key={wk}>
                  <span style={{ display: "flex", alignItems: "center" }}><Ico kind={wk} size={13} dim={.6} /></span>
                  {Object.keys(DAYPARTS).map((dk) => {
                    const got = collected.has(`${wk}|${dk}`) || (wk === weather && dk === daypart);
                    return <span key={dk} style={{ height: 24, borderRadius: 2,
                      background: got ? w.color : "transparent",
                      border: `1px solid ${got ? w.color : CONTOUR + "88"}`, opacity: got ? .85 : 1 }} />;
                  })}
                </React.Fragment>))}
            </div>
            <div style={{ ...label, opacity: .5, marginBottom: 7 }}>What you heard</div>
            <div style={{ background: INK, borderRadius: 4, padding: "11px 13px" }}>
              <LayerList stack={stack} /></div>
            <div style={{ ...label, fontSize: 9, opacity: .55, lineHeight: 1.9, marginTop: 16 }}>
              come back in different weather<br />or at a different hour for a different piece</div>
            <Btn primary onClick={() => setScreen("start")} style={{ width: "100%", marginTop: 14 }}>done</Btn>
          </div>
        )}
      </div>

      {/* ================= SIMULATOR ================= */}
      <div style={{ maxWidth: 380, margin: "12px auto 0" }}>
        <Tabs screen={screen} locked={locked} onGo={goTo} />

        <div style={{ display: "flex", gap: 7 }}>
          <Btn onClick={toggleAudio} disabled={booting} style={{ flex: 2,
            background: audioOn ? CONTOUR : PAPER, color: INK, border: "none" }}>
            {booting ? "starting…" : audioOn ? "stop audio" : "start audio"}</Btn>
          <Btn onClick={startWalk} style={{ flex: 2, background: walking ? "#22332B" : "transparent",
            color: PAPER }}>{walking ? "pause" : "walk"}</Btn>
          <Btn onClick={() => setSpeed((s) => (s === 1 ? 4 : s === 4 ? 10 : 1))}
            style={{ flex: 1, color: PAPER }}>{speed}×</Btn>
        </div>

        <Selector name="weather" current={weather} onPick={setWeather}
          options={Object.entries(WEATHER).map(([k, v]) => [k, v.label])} />
        <Selector name="time of day" current={daypart} onPick={setDaypart}
          options={Object.entries(DAYPARTS).map(([k, v]) => [k, v.label])} />
        <Selector name="visit number" current={visitNo} onPick={setVisitNo}
          options={[[1, "first"], [2, "2nd"], [3, "3rd"]]} />

        <button className="tsBtn" onClick={() => setNotes((n) => !n)} style={{ ...label, width: "100%",
          marginTop: 11, padding: "8px", background: "transparent", color: CONTOUR, border: "none",
          opacity: .75 }}>{notes ? "hide" : "show"} notes</button>
        {notes && (
          <div style={{ ...label, color: CONTOUR, marginTop: 2, opacity: .7, lineHeight: 2 }}>
            <div>tempo {TEMPO} · gps ±{GPS_ERROR}m · {RAMP_SEC}s fade · {1000 / TICK_MS} Hz</div>
            <div>stillness opens after {STILL_AFTER / 1000}s (visit 2+)</div>
            <div>time of day = master filter + reverb, no extra stems</div>
            <div>drag the map to reposition · mic capture is simulated</div>
          </div>)}
      </div>
    </div>
  );
}
