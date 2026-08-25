import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "./AudioEngine.js";
import { STEMS, TEMPO, BEATS_PER_BAR } from "./stemManifest.js";

// React lifecycle wrapper around AudioEngine. The engine itself is created
// lazily on first `boot()` call, which must happen inside a user gesture
// handler (Web Audio requires that to unlock).
export function useAudioEngine() {
  const engineRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | running | error
  const [error, setError] = useState(null);

  const boot = useCallback(async () => {
    if (engineRef.current) return;
    setStatus("loading");
    setError(null);
    const engine = new AudioEngine();
    try {
      await engine.load({ tempo: TEMPO, beatsPerBar: BEATS_PER_BAR, stems: STEMS });
      engine.start();
      engineRef.current = engine;
      setStatus("running");
    } catch (e) {
      setError(e);
      setStatus("error");
    }
  }, []);

  const shutdown = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setStatus("idle");
  }, []);

  const setGain = useCallback((stemId, value, rampBars) => {
    engineRef.current?.setGain(stemId, value, rampBars);
  }, []);

  useEffect(() => () => engineRef.current?.dispose(), []);

  return { status, error, boot, shutdown, setGain };
}
