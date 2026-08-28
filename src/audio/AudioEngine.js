import { barsToSeconds } from "./barMath.js";
import { FADE_IN_CURVE, FADE_OUT_CURVE } from "./loopCurves.js";

const SCHEDULE_AHEAD_SECONDS = 2; // how far ahead voices are queued
const SCHEDULER_INTERVAL_MS = 500; // how often the lookahead check runs

// Loads real stem files, starts them all phase-locked, and exposes per-stem
// gain control. Framework-agnostic — no React, no Tone.js, just Web Audio.
//
// The whole point: stems start together and never stop. Only gain moves.
//
// Each stem loops via a self-rescheduling chain of overlapping one-shot
// voices (rather than native AudioBufferSourceNode.loop), crossfading each
// voice's tail into the next voice's head. This masks the click a file
// produces if it isn't trimmed to an exact bar length — the crossfade hides
// the seam, it doesn't fix the underlying phase drift, so bar-exact files
// are still the goal for final content.
export class AudioEngine {
  #ctx = null;
  #master = null;
  #tempo = 120;
  #beatsPerBar = 4;
  #loopCrossfadeBars = 1 / 8;
  #buffers = new Map(); // id -> AudioBuffer
  #gains = new Map(); // id -> GainNode (persistent, position-controlled)
  #loopers = new Map(); // id -> { timerId, activeSources: Set }
  #modulators = new Map(); // id -> { osc, modGain } -- active setBreathingGain LFOs, see below
  #started = false;

  async load({ tempo, beatsPerBar, stems, loopCrossfadeBars }) {
    this.#tempo = tempo;
    this.#beatsPerBar = beatsPerBar;
    if (loopCrossfadeBars != null) this.#loopCrossfadeBars = loopCrossfadeBars;
    this.#ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.#master = this.#ctx.createGain();
    this.#master.gain.value = 1;
    this.#master.connect(this.#ctx.destination);

    await Promise.all(
      stems.map(async ({ id, url }) => {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await this.#ctx.decodeAudioData(arrayBuffer);
        this.#buffers.set(id, audioBuffer);
      })
    );
  }

  // Schedules every stem's first voice at the same AudioContext time, so
  // they land phase-locked regardless of main-thread scheduling jitter. Each
  // stem then keeps itself looping independently via #startLooper.
  start() {
    if (this.#started) return;
    this.#started = true;

    const t0 = this.#ctx.currentTime + 0.15;
    for (const [id, buffer] of this.#buffers) {
      const stemGain = this.#ctx.createGain();
      stemGain.gain.value = 0;
      stemGain.connect(this.#master);
      this.#gains.set(id, stemGain);

      this.#startLooper(id, buffer, stemGain, t0);
    }
  }

  #startLooper(id, buffer, stemGain, firstVoiceStart) {
    const duration = buffer.duration;
    const crossfade = Math.min(
      barsToSeconds(this.#loopCrossfadeBars, this.#tempo, this.#beatsPerBar),
      duration * 0.4 // never let the crossfade eat more than 40% of a short buffer
    );

    const activeSources = new Set();
    let nextVoiceStart = firstVoiceStart;

    const scheduleVoice = (startTime) => {
      const source = this.#ctx.createBufferSource();
      source.buffer = buffer;

      const voiceGain = this.#ctx.createGain();
      source.connect(voiceGain);
      voiceGain.connect(stemGain);

      voiceGain.gain.setValueCurveAtTime(FADE_IN_CURVE, startTime, crossfade);
      voiceGain.gain.setValueCurveAtTime(
        FADE_OUT_CURVE,
        startTime + duration - crossfade,
        crossfade
      );

      const stopTime = startTime + duration + 0.02;
      source.start(startTime);
      source.stop(stopTime);
      activeSources.add(source);
      source.onended = () => {
        source.disconnect();
        voiceGain.disconnect();
        activeSources.delete(source);
      };

      return startTime + (duration - crossfade);
    };

    const scheduleAhead = () => {
      const horizon = this.#ctx.currentTime + SCHEDULE_AHEAD_SECONDS;
      while (nextVoiceStart < horizon) {
        nextVoiceStart = scheduleVoice(nextVoiceStart);
      }
    };

    scheduleAhead();
    const timerId = setInterval(scheduleAhead, SCHEDULER_INTERVAL_MS);
    this.#loopers.set(id, { timerId, activeSources });
  }

  setGain(stemId, value, rampBars) {
    const gainNode = this.#gains.get(stemId);
    if (!gainNode) return;

    // A flat target overrides any breathing modulation in progress on this
    // stem -- without this, turning a weather stem off would ramp its base
    // toward 0 while the LFO kept adding its swing on top, dipping the
    // param negative on every downswing instead of actually going silent.
    this.#stopModulation(stemId);

    const now = this.#ctx.currentTime;
    const rampSeconds = barsToSeconds(rampBars, this.#tempo, this.#beatsPerBar);

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(value, now + rampSeconds);
  }

  // A continuous, audio-thread-driven slow fade between (base - amplitude)
  // and (base + amplitude), via an OscillatorNode feeding the stem's own
  // gain AudioParam -- not a JS setInterval loop re-targeting setGain, which
  // would be subject to tab-throttling/timer jitter and wouldn't stay smooth
  // in the background. Web Audio sums an audio-rate connection into an
  // AudioParam's own scheduled value, so ramping the param to `base` first
  // and then connecting the (oscillator -> amplitude-scaled gain) on top
  // gives exactly that range, continuously, with no further JS involvement
  // once started.
  setBreathingGain(stemId, { base, amplitude, periodBars }, rampBars) {
    const gainNode = this.#gains.get(stemId);
    if (!gainNode) return;
    this.#stopModulation(stemId);

    const now = this.#ctx.currentTime;
    const rampSeconds = barsToSeconds(rampBars, this.#tempo, this.#beatsPerBar);
    const periodSeconds = barsToSeconds(periodBars, this.#tempo, this.#beatsPerBar);

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(base, now + rampSeconds);

    const osc = this.#ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 1 / periodSeconds;
    const modGain = this.#ctx.createGain();
    modGain.gain.value = amplitude;
    osc.connect(modGain);
    modGain.connect(gainNode.gain);
    // Starts once the base ramp lands, so the LFO's first swing begins from
    // a settled base rather than fighting the ramp-in.
    osc.start(now + rampSeconds);
    this.#modulators.set(stemId, { osc, modGain });
  }

  #stopModulation(stemId) {
    const mod = this.#modulators.get(stemId);
    if (!mod) return;
    try {
      mod.osc.stop();
    } catch {
      // already stopped
    }
    mod.osc.disconnect();
    mod.modGain.disconnect();
    this.#modulators.delete(stemId);
  }

  get isStarted() {
    return this.#started;
  }

  dispose() {
    for (const { timerId, activeSources } of this.#loopers.values()) {
      clearInterval(timerId);
      for (const source of activeSources) {
        try {
          source.stop();
        } catch {
          // already stopped
        }
        source.disconnect();
      }
    }
    for (const stemId of this.#modulators.keys()) this.#stopModulation(stemId);
    for (const gain of this.#gains.values()) gain.disconnect();
    this.#loopers.clear();
    this.#gains.clear();
    this.#buffers.clear();
    this.#master?.disconnect();
    this.#ctx?.close();
    this.#ctx = null;
    this.#started = false;
  }
}
