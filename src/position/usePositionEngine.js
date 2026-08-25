import { useEffect, useRef, useState } from "react";
import { WAYPOINTS } from "../waypoints.js";
import { createMockPositionSource } from "./mockPositionSource.js";
import { createEmaSmoother } from "./smoothing.js";
import { computeGains } from "./waypointGain.js";
import { createArrivalTracker } from "./arrivalHysteresis.js";

const TICK_MS = 50; // 20 Hz, near real GPS cadence
const SMOOTH_ALPHA = 0.13;
const GAIN_RAMP_BARS = 1;
const START_POINT = [392, 640];

// Widens each waypoint's effective falloff radius beyond its authored value,
// so neighboring waypoints' zones overlap more and someone spends longer
// inside 2-3 blended layers instead of passing through a single stem at a
// time. Tuned against the prototype's placeholder scene-unit coordinates —
// revisit once real GPS-derived spacing (in meters) replaces them, per
// CLAUDE.md's 80m-minimum / 150-200m-typical waypoint spacing.
export const OVERLAP_FACTOR = 1.5;

const PATH = [START_POINT, ...WAYPOINTS.map((w) => [w.x, w.y])];

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

  const walkingRef = useRef(walking);
  const speedRef = useRef(speed);
  const sourceRef = useRef(null);
  const smootherRef = useRef(null);
  const trackerRef = useRef(null);

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

      setPosition(smoothed);
      setGains(nextGains);
      if (arrivals.length > 0) setLastArrival(arrivals[arrivals.length - 1]);

      if (setGain) {
        for (const w of WAYPOINTS) setGain(w.id, nextGains[w.id], GAIN_RAMP_BARS);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [setGain]);

  return { position, gains, lastArrival, walking, setWalking, speed, setSpeed, path: PATH };
}
