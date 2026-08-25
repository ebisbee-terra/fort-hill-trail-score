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

    const now = this.#ctx.currentTime;
    const rampSeconds = barsToSeconds(rampBars, this.#tempo, this.#beatsPerBar);

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(value, now + rampSeconds);
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
