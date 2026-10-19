// Web Audio side of the drum kit: mixer graph, kit buffers, voice playback,
// hi-hat choke and drum damping. The mixer and voice helpers take any
// BaseAudioContext, so recordings can be rendered offline with the same sound.

import { SOUND_IDS, renderSound } from './kits.js';
import { generateRoomIR } from './reverb.js';
import { createRng } from './dsp.js';

// Stereo position of each sound from the drummer's seat (-1 left, +1 right).
export const SOUND_PAN = {
  kick: 0,
  snare: -0.08,
  snareRim: -0.08,
  hihatClosed: -0.38,
  hihatOpen: -0.4,
  hihatPedal: -0.36,
  tom1: -0.18,
  tom2: 0.05,
  tom3: 0.2,
  floorTom: 0.38,
  crash1: -0.45,
  crash2: 0.42,
  ride: 0.5,
  rideBell: 0.5,
  splash: -0.15,
  china: 0.62,
};

const DRUM_SOUNDS = new Set(['kick', 'snare', 'tom1', 'tom2', 'tom3', 'floorTom']);
const HAT_CHOKERS = new Set(['hihatClosed', 'hihatPedal']);
const MAX_VOICES = 64;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const velocityGain = (v) => Math.pow(clamp(v, 0, 1), 1.6);
export const velocityCutoff = (v) => 900 * Math.pow(2, clamp(v, 0, 1) * 4.6);

function softClipCurve(n = 4096) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    curve[i] = ax < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((ax - 0.8) / 0.2));
  }
  return curve;
}

export function channelsToBuffer(ctx, channels) {
  const b = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
  channels.forEach((c, i) => b.copyToChannel(c, i));
  return b;
}

let irCache = null;
function roomIR(sampleRate) {
  if (!irCache || irCache.sampleRate !== sampleRate) {
    irCache = { sampleRate, channels: generateRoomIR(sampleRate) };
  }
  return irCache.channels;
}

/**
 * Build the mixing graph on any (realtime or offline) audio context.
 * drums -> per-sound strip (gain, pan) -> drum bus -> master
 *                                     \-> room send -> convolver -> master
 * backing bus and click bus also feed the master, which ends in a soft clipper.
 */
export function createMixer(ctx, opts = {}) {
  const limiter = ctx.createWaveShaper();
  limiter.curve = softClipCurve();
  limiter.oversample = 'none';
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = opts.volume ?? 0.85;
  master.connect(limiter);

  const convolver = ctx.createConvolver();
  convolver.buffer = channelsToBuffer(ctx, roomIR(ctx.sampleRate));
  convolver.connect(master);

  const drumBus = ctx.createGain();
  drumBus.gain.value = 0.9;
  drumBus.connect(master);
  const roomSend = ctx.createGain();
  roomSend.gain.value = opts.room ?? 0.25;
  drumBus.connect(roomSend);
  roomSend.connect(convolver);

  const backingBus = ctx.createGain();
  backingBus.gain.value = opts.backing ?? 0.6;
  backingBus.connect(master);
  const backingSend = ctx.createGain();
  backingSend.gain.value = 0.15;
  backingBus.connect(backingSend);
  backingSend.connect(convolver);

  const clickBus = ctx.createGain();
  clickBus.gain.value = opts.click ?? 0.6;
  clickBus.connect(master);

  const strips = {};
  for (const id of SOUND_IDS) {
    const input = ctx.createGain();
    let panner = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = (SOUND_PAN[id] ?? 0) * (opts.mirror ? -1 : 1);
      input.connect(panner);
      panner.connect(drumBus);
    } else {
      input.connect(drumBus);
    }
    strips[id] = { input, panner };
  }

  return {
    master,
    drumBus,
    roomSend,
    backingBus,
    clickBus,
    strips,
    setMirror(mirror) {
      for (const id of SOUND_IDS) {
        const p = strips[id].panner;
        if (p) p.pan.value = (SOUND_PAN[id] ?? 0) * (mirror ? -1 : 1);
      }
    },
  };
}

/** Start one sample. Returns a voice handle used for chokes and cleanup. */
export function playVoice(ctx, dest, buffer, when, velocity, rng = null) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  let rate = 1;
  let g = velocityGain(velocity);
  if (rng) {
    rate = Math.pow(2, ((rng() * 2 - 1) * 6) / 1200);
    g *= 1 + (rng() * 2 - 1) * 0.08;
  }
  src.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = g;
  if (velocity < 0.97) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = velocityCutoff(velocity);
    f.Q.value = 0.4;
    src.connect(f);
    f.connect(gain);
  } else {
    src.connect(gain);
  }
  gain.connect(dest);
  src.start(when);
  return { src, gain, level: g, start: when, end: when + buffer.duration / rate };
}

function fadeVoice(voice, t, timeConstant, toLevel = 0) {
  const p = voice.gain.gain;
  try {
    p.cancelScheduledValues(t);
    p.setValueAtTime(voice.level, t);
    p.setTargetAtTime(toLevel, t, timeConstant);
    if (toLevel === 0) voice.src.stop(t + timeConstant * 8);
  } catch {
    /* voice already stopped */
  }
}

/** Apply hi-hat choke and drum damping rules to a list of voices. */
export function applyChokes(voices, soundId, t) {
  for (const v of voices) {
    if (v.start > t || v.end <= t) continue;
    if (HAT_CHOKERS.has(soundId) && v.soundId === 'hihatOpen') fadeVoice(v, t, 0.012);
    else if (DRUM_SOUNDS.has(soundId) && v.soundId === soundId && !v.damped) {
      v.damped = true;
      fadeVoice(v, t, 0.03, v.level * 0.3);
      v.level *= 0.3; // later fades start from the damped level
    }
  }
}

export class DrumEngine {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    try {
      // iOS 17+: play through the silent switch like a music app
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    this.mixer = createMixer(this.ctx);
    this.kits = new Map();
    this.kitId = null;
    this.buffers = new Map();
    this.overrides = null;
    this.voices = [];
    this.rng = createRng(Date.now() & 0xffff);
    this.worker = null;
    this.jobs = new Map();
    this.jobSeq = 0;
    this.loadToken = 0;
    this.unlocked = false;
  }

  get sampleRate() {
    return this.ctx.sampleRate;
  }

  /** Output latency in seconds, as far as the browser reports it. */
  get latency() {
    return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
  }

  async unlock() {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* resume needs a gesture; retried on the next one */
      }
    }
    if (!this.unlocked && this.ctx.state === 'running') {
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      s.connect(this.ctx.destination);
      s.start(0);
      this.unlocked = true;
    }
  }

  setVolume(v) {
    this.mixer.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setRoom(v) {
    this.mixer.roomSend.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setBackingVolume(v) {
    this.mixer.backingBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setClickVolume(v) {
    this.mixer.clickBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setMirror(m) {
    this.mixer.setMirror(m);
  }

  /** Custom samples (soundId -> AudioBuffer) layered over the current kit, or null. */
  setOverrides(map) {
    this.overrides = map && map.size ? map : null;
  }

  bufferFor(soundId) {
    return this.overrides?.get(soundId) ?? this.buffers.get(soundId) ?? null;
  }

  /** Buffers for a kit already in the cache (used by offline export). */
  kitBuffers(kitId) {
    return this.kits.get(kitId) ?? null;
  }

  isLoaded(kitId) {
    return this.kits.has(kitId);
  }

  /**
   * Make kitId the active kit. The first kit loads progressively (sounds
   * become playable as they finish); later switches keep the old kit
   * playing until the new one is complete.
   */
  async loadKit(kitId, onProgress) {
    const token = ++this.loadToken;
    if (this.kits.has(kitId)) {
      this.kitId = kitId;
      this.buffers = this.kits.get(kitId);
      onProgress?.(1);
      return;
    }
    const map = await this.ensureKit(kitId, onProgress, this.buffers.size === 0 ? token : null);
    if (token === this.loadToken) {
      this.kitId = kitId;
      this.buffers = map;
    }
  }

  /** Render a kit into the cache without switching to it. */
  async ensureKit(kitId, onProgress, progressiveToken = null) {
    if (this.kits.has(kitId)) return this.kits.get(kitId);
    const map = new Map();
    if (progressiveToken !== null) {
      this.kitId = kitId;
      this.buffers = map;
    }
    const onSound = (id, channels, i) => {
      map.set(id, channelsToBuffer(this.ctx, channels));
      onProgress?.(i / SOUND_IDS.length);
    };
    try {
      await this.renderInWorker(kitId, onSound);
    } catch {
      await this.renderOnMainThread(kitId, onSound);
    }
    this.kits.set(kitId, map);
    // keep at most three kits in memory
    for (const id of this.kits.keys()) {
      if (this.kits.size <= 3) break;
      if (id !== kitId && id !== this.kitId) this.kits.delete(id);
    }
    return map;
  }

  getWorker() {
    if (this.worker === false) return null;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => this.jobs.get(e.data.jobId)?.(e.data);
        this.worker.onerror = () => {
          this.worker = false;
          for (const handler of this.jobs.values()) handler({ error: 'worker failed' });
        };
      } catch {
        this.worker = false;
      }
    }
    return this.worker || null;
  }

  renderInWorker(kitId, onSound) {
    const worker = this.getWorker();
    if (!worker) return Promise.reject(new Error('no worker'));
    return new Promise((resolve, reject) => {
      const jobId = ++this.jobSeq;
      let count = 0;
      const received = [];
      this.jobs.set(jobId, (msg) => {
        if (msg.error) {
          this.jobs.delete(jobId);
          // keep what already arrived so the fallback does not redo it
          reject(Object.assign(new Error(msg.error), { received }));
        } else if (msg.done) {
          this.jobs.delete(jobId);
          resolve();
        } else {
          received.push(msg.soundId);
          onSound(msg.soundId, msg.channels, ++count);
        }
      });
      worker.postMessage({ jobId, kitId, sampleRate: this.ctx.sampleRate });
    });
  }

  async renderOnMainThread(kitId, onSound) {
    let i = 0;
    for (const id of SOUND_IDS) {
      onSound(id, renderSound(kitId, id, this.ctx.sampleRate), ++i);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  /** Play a sound now (or at `when`). Returns the scheduled start time, or null. */
  trigger(soundId, velocity = 0.85, { when = 0, humanize = true, buffer: forced = null } = {}) {
    const buffer = forced ?? this.bufferFor(soundId);
    const strip = this.mixer.strips[soundId];
    if (!buffer || !strip) return null;
    const ctx = this.ctx;
    const t = Math.max(when, ctx.currentTime);
    const now = ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    applyChokes(this.voices, soundId, t);
    const voice = playVoice(ctx, strip.input, buffer, t, velocity, humanize ? this.rng : null);
    voice.soundId = soundId;
    this.voices.push(voice);
    if (this.voices.length > MAX_VOICES) {
      const oldest = this.voices.shift();
      fadeVoice(oldest, t, 0.02);
    }
    voice.src.onended = () => {
      voice.gain.disconnect();
    };
    return t;
  }

  /** Stop every sounding and scheduled voice (used when playback stops). */
  stopAll() {
    const t = this.ctx.currentTime;
    for (const v of this.voices) fadeVoice(v, t, 0.02);
    this.voices = [];
  }
}
