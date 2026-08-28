import { useEffect, useRef, useState } from "react";
import { WAYPOINTS } from "../waypoints.js";
import { TRAIL_PATH } from "../trailPath.js";
import { createMockPositionSource } from "./mockPositionSource.js";
import { createEmaSmoother } from "./smoothing.js";
import { computeGains } from "./waypointGain.js";
import { createArrivalTracker } from "./arrivalHysteresis.js";
import { createStillnessDetector } from "./stillnessDetector.js";
import { getAndIncrementVisitCount } from "../visitCount.js";

const TICK_MS = 50; // 20 Hz, near real GPS cadence
const SMOOTH_ALPHA = 0.13;
const GAIN_RAMP_BARS = 1;
const START_POINT = TRAIL_PATH[0];

// CLAUDE.md: "stop moving for ~3s and an extra stem opens... unlocks on
// visit 2+."
const STILL_STEM_ID = "still";
const STILL_AFTER_MS = 3000;
const STILL_MOVE_THRESHOLD_M = 2;
// Slower than a waypoint gain ramp (GAIN_RAMP_BARS=1) -- this is a deliberate
// "the piece settles" moment, not a continuous position-driven blend, so it
// should open and close more gradually.
const STILL_RAMP_BARS = 4;

// Widens each waypoint's effective falloff radius beyond its authored value,
// so neighboring waypoints' zones overlap more and someone spends longer
// inside 2-3 blended layers instead of passing through a single stem at a
// time. Tuned against real waypoint spacing (see waypoints.js) — CLAUDE.md's
// 80m-minimum / 150-200m-typical rule. Raised from 1.5 to 1.6 alongside the
// per-waypoint radius/ellipse tuning in waypoints.js, together closing every
// remaining spot on the trail where combined gain across all stems dropped
// below the 0.70 floor (see waypoints.js's floor note for the full reasoning
// and the specific gaps this was covering).
export const OVERLAP_FACTOR = 1.6;

const PATH = TRAIL_PATH;

// Ties the mocked position source to smoothing, waypoint gain calculation,
// and arrival hysteresis, then pushes the resulting per-stem gains into the
// audio engine every tick. One steady interval, reading walking/speed from
// refs so it isn't torn down and rebuilt on every state change.
export function usePositionEngine({ setGain } = {}) {
  const [walking, setWalking] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [position, setPosition] = useState({ x: START_POINT[0], y: START_POINT[1] });
  const [gains, setGains] = useState(() => Object.fromEntries(WAYPOINTS.map((w) => [w.id, 0])));
  const [lastArrival, setLastArrival] = useState(null);
  const [isStill, setIsStill] = useState(false);
  const [visitCount, setVisitCount] = useState(1);

  const walkingRef = useRef(walking);
  const speedRef = useRef(speed);
  const sourceRef = useRef(null);
  const smootherRef = useRef(null);
  const trackerRef = useRef(null);
  const stillnessRef = useRef(null);
  const hasCountedVisitRef = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; this ref (which persists
    // across that simulated remount, unlike a state initializer) keeps the
    // real localStorage increment to exactly once per actual page load.
    if (hasCountedVisitRef.current) return;
    hasCountedVisitRef.current = true;
    setVisitCount(getAndIncrementVisitCount());
  }, []);

  useEffect(() => {
    walkingRef.current = walking;
  }, [walking]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    sourceRef.current = createMockPositionSource({ path: PATH });
    smootherRef.current = createEmaSmoother(SMOOTH_ALPHA, {
      x: START_POINT[0],
      y: START_POINT[1],
    });
    trackerRef.current = createArrivalTracker(WAYPOINTS.map((w) => w.id));
    stillnessRef.current = createStillnessDetector({
      windowMs: STILL_AFTER_MS,
      moveThresholdMeters: STILL_MOVE_THRESHOLD_M,
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const dt = TICK_MS / 1000;
      const source = sourceRef.current;
      const truePos = walkingRef.current
        ? source.tick(dt, speedRef.current)
        : source.getCurrent();

      const smoothed = smootherRef.current(truePos);
      const nextGains = computeGains(smoothed, WAYPOINTS, OVERLAP_FACTOR);
      const arrivals = trackerRef.current.update(nextGains);
      const nowStill = stillnessRef.current.update(smoothed, Date.now());
      const stillnessActive = nowStill && visitCount >= 2;

      setPosition(smoothed);
      setGains(nextGains);
      setIsStill(nowStill);
      if (arrivals.length > 0) setLastArrival(arrivals[arrivals.length - 1]);

      if (setGain) {
        for (const w of WAYPOINTS) setGain(w.id, nextGains[w.id], GAIN_RAMP_BARS);
        setGain(STILL_STEM_ID, stillnessActive ? 1 : 0, STILL_RAMP_BARS);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [setGain, visitCount]);

  return {
    position,
    gains,
    lastArrival,
    walking,
    setWalking,
    speed,
    setSpeed,
    path: PATH,
    isStill,
    visitCount,
    stillnessActive: isStill && visitCount >= 2,
  };
}
