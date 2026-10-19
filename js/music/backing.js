// A small synthesized backing band built from Web Audio nodes. Every
// instrument takes any BaseAudioContext so loops can also be rendered
// offline when a recording is exported.

import { midiToFreq } from './theory.js';
import { createRng } from '../audio/dsp.js';

const DIST_CURVE = (() => {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 5) / Math.tanh(5);
  }
  return c;
})();

/** Gain node with an ADSR-style envelope ending `dur` seconds after t. */
function envelope(ctx, t, { attack = 0.005, peak = 0.3, decay = 0.3, sustain = 0.6, release = 0.08, dur = 0.3 }) {
  const g = ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(peak * sustain, t + attack, decay);
  const end = t + Math.max(dur, attack + 0.01);
  p.setTargetAtTime(0, end, release);
  return { g, stopAt: end + release * 7 };
}

function osc(ctx, type, freq, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

function run(nodes, t, stopAt) {
  for (const n of nodes) {
    n.start(t);
    n.stop(stopAt);
  }
}

// ---------------------------------------------------- plucked string (KS)

const ksData = new Map();
const ksBuffers = new WeakMap();

function pluckBuffer(ctx, midi, mute) {
  const key = `${ctx.sampleRate}:${midi}:${mute ? 1 : 0}`;
  let perCtx = ksBuffers.get(ctx);
  if (!perCtx) ksBuffers.set(ctx, (perCtx = new Map()));
  if (perCtx.has(key)) return perCtx.get(key);
  let data = ksData.get(key);
  if (!data) {
    const sr = ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / midiToFreq(midi)));
    const len = Math.floor(sr * (mute ? 0.22 : 1.8));
    data = new Float32Array(len);
    const line = new Float32Array(N);
    const rng = createRng(midi * 31 + (mute ? 7 : 0));
    let lp = 0;
    for (let i = 0; i < N; i++) {
      lp += 0.55 * (rng() * 2 - 1 - lp);
      line[i] = lp;
    }
    const damping = mute ? 0.9 : 0.9965;
    let idx = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      const next = line[(idx + 1) % N];
      line[idx] = damping * 0.5 * (cur + next);
      data[i] = cur;
      peak = Math.max(peak, Math.abs(cur));
      idx = (idx + 1) % N;
    }
    const g = peak > 0 ? 0.8 / peak : 1;
    for (let i = 0; i < len; i++) data[i] *= g;
    // soften the very start
    for (let i = 0; i < 32 && i < len; i++) data[i] *= i / 32;
    ksData.set(key, data);
  }
  const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.copyToChannel(data, 0);
  perCtx.set(key, b);
  return b;
}

// ------------------------------------------------------------ instruments

const INSTRUMENTS = {
  bass(ctx, dest, ev, t, dur) {
    const f = midiToFreq(ev.midi[0]);
    const o1 = osc(ctx, 'sawtooth', f);
    const o2 = osc(ctx, 'triangle', f, 6);
    const mix2 = ctx.createGain();
    mix2.gain.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(260 + 1500 * ev.vel, t);
    lp.frequency.setTargetAtTime(240, t, 0.09);
    const { g, stopAt } = envelope(ctx, t, { attack: 0.004, peak: 0.5 * ev.vel, decay: 0.25, sustain: 0.6, release: 0.05, dur });
    o1.connect(lp);
    o2.connect(mix2);
    mix2.connect(lp);
    lp.connect(g);
    g.connect(dest);
    run([o1, o2], t, stopAt);
  },

  epiano(ctx, dest, ev, t, dur) {
    for (const m of ev.midi) {
      const f = midiToFreq(m);
      const car = osc(ctx, 'sine', f);
      const mod = osc(ctx, 'sine', f);
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * (0.8 + 1.6 * ev.vel), t);
      idx.gain.setTargetAtTime(f * 0.2, t, 0.35);
      mod.connect(idx);
      idx.connect(car.frequency);
      const tine = osc(ctx, 'sine', f * 4);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.25 * ev.vel, t);
      tg.gain.setTargetAtTime(0, t, 0.06);
      tine.connect(tg);
      const { g, stopAt } = envelope(ctx, t, { attack: 0.003, peak: 0.16 * ev.vel, decay: 0.9, sustain: 0.35, release: 0.25, dur });
      car.connect(g);
      tg.connect(g);
      g.connect(dest);
      run([car, mod, tine], t, stopAt);
    }
  },

  organ(ctx, dest, ev, t, dur) {
    const harm = [
      [1, 0.5],
      [2, 0.35],
      [3, 0.22],
      [4, 0.12],
    ];
    for (const m of ev.midi) {
      const f = midiToFreq(m);
      const { g, stopAt } = envelope(ctx, t, { attack: 0.006, peak: 0.1 * ev.vel, decay: 1, sustain: 1, release: 0.06, dur });
      const oscs = harm.map(([h, a]) => {
        const o = osc(ctx, 'sine', f * h);
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og);
        og.connect(g);
        return o;
      });
      g.connect(dest);
      run(oscs, t, stopAt);
    }
  },

  strings(ctx, dest, ev, t, dur) {
    for (const m of ev.midi) {
      const f = midiToFreq(m);
      const a = osc(ctx, 'sawtooth', f, -7);
      const b = osc(ctx, 'sawtooth', f, 7);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      lp.Q.value = 0.7;
      const { g, stopAt } = envelope(ctx, t, { attack: 0.35, peak: 0.055 * ev.vel, decay: 1, sustain: 1, release: 0.5, dur });
      a.connect(lp);
      b.connect(lp);
      lp.connect(g);
      g.connect(dest);
      run([a, b], t, stopAt);
    }
  },

  guitarDist(ctx, dest, ev, t, dur) {
    const mix = ctx.createGain();
    mix.gain.value = 0.9;
    const oscs = [];
    for (const m of ev.midi) {
      const f = midiToFreq(m);
      for (const d of [-8, 8]) {
        const o = osc(ctx, 'sawtooth', f, d);
        o.connect(mix);
        oscs.push(o);
      }
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = DIST_CURVE;
    shaper.oversample = '2x';
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = ev.mute ? 1400 : 3600;
    cab.Q.value = 0.9;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 700;
    mid.gain.value = -5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const { g, stopAt } = envelope(ctx, t, {
      attack: 0.003,
      peak: 0.11 * ev.vel,
      decay: 0.4,
      sustain: 0.85,
      release: ev.mute ? 0.025 : 0.07,
      dur,
    });
    mix.connect(shaper);
    shaper.connect(cab);
    cab.connect(mid);
    mid.connect(hp);
    hp.connect(g);
    g.connect(dest);
    run(oscs, t, stopAt);
  },

  guitarClean(ctx, dest, ev, t, dur) {
    const notes = [...ev.midi].sort((a, b) => a - b);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = ev.mute ? 2500 : 5200;
    lp.connect(dest);
    notes.forEach((m, i) => {
      const at = t + i * 0.011;
      const src = ctx.createBufferSource();
      src.buffer = pluckBuffer(ctx, m, ev.mute);
      const { g, stopAt } = envelope(ctx, at, {
        attack: 0.002,
        peak: 0.2 * ev.vel,
        decay: 2,
        sustain: 1,
        release: 0.06,
        dur: Math.max(0.05, dur - i * 0.011),
      });
      src.connect(g);
      g.connect(lp);
      src.start(at);
      src.stop(Math.min(stopAt, at + src.buffer.duration));
    });
  },
};

export const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS);

/** Play one loop event at time t (seconds) with duration in seconds. */
export function playNote(ctx, dest, ev, t, durSeconds) {
  const inst = INSTRUMENTS[ev.inst];
  if (!inst) return;
  inst(ctx, dest, ev, t, Math.max(0.03, durSeconds));
}

// ------------------------------------------------------------- metronome

const clickCache = new WeakMap();

export function clickBuffer(ctx, accent) {
  let c = clickCache.get(ctx);
  if (!c) clickCache.set(ctx, (c = {}));
  const key = accent ? 'a' : 'n';
  if (c[key]) return c[key];
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.06);
  const data = new Float32Array(len);
  const f = accent ? 2100 : 1500;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    data[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.009) * (accent ? 0.9 : 0.65);
  }
  const b = ctx.createBuffer(1, len, sr);
  b.copyToChannel(data, 0);
  c[key] = b;
  return b;
}

export function playClick(ctx, dest, t, accent) {
  const s = ctx.createBufferSource();
  s.buffer = clickBuffer(ctx, accent);
  s.connect(dest);
  s.start(t);
}
