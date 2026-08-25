import { barsToSeconds } from "./barMath.js";

// Loads real stem files, starts them all phase-locked, and exposes per-stem
// gain control. Framework-agnostic — no React, no Tone.js, just Web Audio.
//
// The whole point: stems start together and never stop. Only gain moves.
export class AudioEngine {
  #ctx = null;
  #master = null;
  #tempo = 120;
  #beatsPerBar = 4;
  #buffers = new Map(); // id -> AudioBuffer
  #sources = new Map(); // id -> AudioBufferSourceNode
  #gains = new Map(); // id -> GainNode
  #started = false;

  async load({ tempo, beatsPerBar, stems }) {
    this.#tempo = tempo;
    this.#beatsPerBar = beatsPerBar;
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

  // Schedules every stem's source to start at the same AudioContext time, so
  // they land phase-locked regardless of main-thread scheduling jitter.
  start() {
    if (this.#started) return;
    this.#started = true;

    const t0 = this.#ctx.currentTime + 0.15;
    for (const [id, buffer] of this.#buffers) {
      const source = this.#ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = this.#ctx.createGain();
      gain.gain.value = 0;

      source.connect(gain);
      gain.connect(this.#master);
      source.start(t0);

      this.#sources.set(id, source);
      this.#gains.set(id, gain);
    }
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
    for (const source of this.#sources.values()) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
    }
    for (const gain of this.#gains.values()) gain.disconnect();
    this.#sources.clear();
    this.#gains.clear();
    this.#buffers.clear();
    this.#master?.disconnect();
    this.#ctx?.close();
    this.#ctx = null;
    this.#started = false;
  }
}
