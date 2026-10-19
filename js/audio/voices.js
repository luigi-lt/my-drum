// Layer-based drum synthesizer. A voice definition is a list of layers
// (membrane tones, filtered noise, inharmonic metal partials, 808-style
// square clusters) that are rendered, normalised, mixed and post-processed
// into one or two channels of Float32 audio.

import { createRng, seedFrom, filterChain, whiteNoise, saturate, normalize, fadeTail, fadeIn, mixInto, peak, trimTail } from './dsp.js';

const TWO_PI = Math.PI * 2;

/**
 * Envelope spec: { attack, decay, delay, decay2, mix2, hold }
 * Two-stage exponential: (1 - mix2) * e^(-t/decay) + mix2 * e^(-t/decay2)
 */
function applyEnvelope(buf, sr, env) {
  const attack = Math.max(1, Math.floor((env.attack ?? 0.0005) * sr));
  const delay = Math.floor((env.delay ?? 0) * sr);
  const hold = Math.floor((env.hold ?? 0) * sr);
  const k1 = Math.exp(-1 / (env.decay * sr));
  const k2 = env.decay2 ? Math.exp(-1 / (env.decay2 * sr)) : 0;
  const mix2 = env.decay2 ? (env.mix2 ?? 0.3) : 0;
  let e1 = 1;
  let e2 = 1;
  for (let i = 0; i < buf.length; i++) {
    if (i < delay) {
      buf[i] = 0;
      continue;
    }
    const j = i - delay;
    const a = j < attack ? j / attack : 1;
    buf[i] *= a * ((1 - mix2) * e1 + mix2 * e2);
    if (j >= attack + hold) {
      e1 *= k1;
      e2 *= k2;
    }
  }
  return buf;
}

/** Pitched membrane: fundamental plus circular-membrane modes with a tension glide. */
function renderTone(layer, sr, len) {
  const out = new Float32Array(len);
  const glide = (layer.glide ?? 1) - 1;
  const glideK = Math.exp(-1 / ((layer.glideTime ?? 0.03) * sr));
  const attack = Math.max(1, Math.floor((layer.attack ?? 0.0006) * sr));
  const modes = [{ ratio: 1, gain: 1, decay: layer.decay }, ...(layer.modes ?? [])];
  const wave = layer.wave ?? 'sine';
  for (const m of modes) {
    const k = Math.exp(-1 / (m.decay * sr));
    const glideScale = m.glide ?? 1;
    let env = m.gain;
    let g = glide;
    let ph = m.phase ?? 0;
    for (let i = 0; i < len; i++) {
      const f = layer.f0 * m.ratio * (1 + g * glideScale);
      g *= glideK;
      ph += (TWO_PI * f) / sr;
      let s;
      if (wave === 'triangle') {
        const x = (ph / TWO_PI) % 1;
        s = 4 * Math.abs(x - 0.5) - 1;
      } else {
        s = Math.sin(ph);
      }
      out[i] += s * env * (i < attack ? i / attack : 1);
      env *= k;
      if (env < 1e-6) break;
    }
  }
  return out;
}

function renderNoise(layer, sr, len, rng) {
  const n = whiteNoise(len, rng);
  if (layer.filters) filterChain(n, layer.filters, sr);
  applyEnvelope(n, sr, layer.env);
  return n;
}

/**
 * Inharmonic additive partials, the backbone of cymbal tone. Uses recursive
 * sine oscillators. Returns [mid, side] so callers can build a wide stereo
 * image at mono cost (odd partials go to the side signal).
 */
function renderPartials(layer, sr, len, rng) {
  const mid = new Float32Array(len);
  const side = new Float32Array(len);
  const list = [];
  if (layer.list) for (const p of layer.list) list.push({ ...p });
  const count = layer.count ?? 0;
  const lo = Math.log(layer.fMin ?? 300);
  const hi = Math.log(Math.min(layer.fMax ?? 12000, sr * 0.45));
  const tilt = (layer.tilt ?? 0) / 6.02;
  const decayExp = layer.decayExp ?? 0.3;
  for (let i = 0; i < count; i++) {
    const f = Math.exp(lo + (hi - lo) * rng());
    const g = Math.pow(f / 1000, tilt) * (0.35 + 0.65 * rng());
    const d = layer.decay * Math.pow(1000 / f, decayExp) * (0.7 + 0.6 * rng());
    list.push({ f, g, d });
  }
  const maxDecay = layer.maxDecay ?? Infinity;
  const attack = Math.max(1, Math.floor((layer.attack ?? 0.0004) * sr));
  list.forEach((p, idx) => {
    if (p.f >= sr * 0.48) return;
    const w = (TWO_PI * p.f) / sr;
    const c = 2 * Math.cos(w);
    const phase = rng() * TWO_PI;
    let y1 = Math.sin(phase);
    let y2 = Math.sin(phase - w);
    const k = Math.exp(-1 / (Math.min(p.d, maxDecay) * sr));
    let a = p.g;
    const dst = idx % 2 === 0 ? mid : side;
    for (let i = 0; i < len; i++) {
      const y = c * y1 - y2;
      y2 = y1;
      y1 = y;
      dst[i] += y * a * (i < attack ? i / attack : 1);
      a *= k;
      if (a < 1e-6) break;
    }
  });
  return [mid, side];
}

/** 808-style metallic cluster: detuned square waves through band filters. */
function renderSquares(layer, sr, len) {
  const out = new Float32Array(len);
  const scale = layer.scale ?? 1;
  for (const f0 of layer.freqs) {
    const f = f0 * scale;
    let ph = 0;
    const inc = f / sr;
    for (let i = 0; i < len; i++) {
      ph += inc;
      if (ph >= 1) ph -= 1;
      out[i] += ph < 0.5 ? 1 : -1;
    }
  }
  if (layer.filters) filterChain(out, layer.filters, sr);
  applyEnvelope(out, sr, layer.env);
  return out;
}

function scaleInPlace(buf, g) {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

/** Normalise a layer so its peak is 1, making layer gains comparable. */
function unit(buf) {
  const p = peak(buf);
  return p > 0 ? scaleInPlace(buf, 1 / p) : buf;
}

/**
 * Render a voice definition into an array of channels (1 = mono, 2 = stereo).
 * def = { length, stereo, layers: [...], drive, post: [filters], level, width }
 */
export function renderVoice(def, sampleRate, seedKey = 'voice') {
  const sr = sampleRate;
  const len = Math.ceil(def.length * sr);
  const rng = createRng(seedFrom(seedKey));
  const stereo = !!def.stereo;
  const L = new Float32Array(len);
  const R = stereo ? new Float32Array(len) : null;
  const width = def.width ?? 0.6;

  for (const layer of def.layers) {
    const gain = layer.gain ?? 1;
    if (layer.type === 'tone') {
      const t = unit(renderTone(layer, sr, len));
      mixInto(L, t, gain);
      if (R) mixInto(R, t, gain);
    } else if (layer.type === 'noise') {
      if (R && layer.stereo !== false) {
        const a = renderNoise(layer, sr, len, rng);
        const b = renderNoise(layer, sr, len, rng);
        const p = Math.max(peak(a), peak(b)) || 1;
        // blend two independent noises: width 0 = mono, 1 = fully decorrelated
        for (let i = 0; i < len; i++) {
          const m = (a[i] + b[i]) * 0.5;
          const s = (a[i] - b[i]) * 0.5;
          L[i] += ((m + s * width) / p) * gain;
          R[i] += ((m - s * width) / p) * gain;
        }
      } else {
        const n = unit(renderNoise(layer, sr, len, rng));
        mixInto(L, n, gain);
        if (R) mixInto(R, n, gain);
      }
    } else if (layer.type === 'partials') {
      const [mid, side] = renderPartials(layer, sr, len, rng);
      let p = 0;
      for (let i = 0; i < len; i++) p = Math.max(p, Math.abs(mid[i] + side[i]));
      const g = gain / (p || 1);
      // odd partials flip polarity on the right channel (scaled by width)
      const sideR = 1 - 2 * width;
      for (let i = 0; i < len; i++) {
        L[i] += (mid[i] + side[i]) * g;
        if (R) R[i] += (mid[i] + side[i] * sideR) * g;
      }
    } else if (layer.type === 'squares') {
      const s = unit(renderSquares(layer, sr, len));
      mixInto(L, s, gain);
      if (R) mixInto(R, s, gain);
    } else {
      throw new Error(`Unknown layer type ${layer.type}`);
    }
  }

  let channels = R ? [L, R] : [L];
  for (const c of channels) {
    if (def.post) filterChain(c, def.post, sr);
    if (def.drive) {
      // saturate relative to the current peak so drive is level independent
      const p = peak(c) || 1;
      scaleInPlace(c, 1 / p);
      saturate(c, def.drive);
    }
    if (def.tail !== false) fadeTail(c, def.tailFraction ?? 0.25);
    fadeIn(c, 8);
  }
  normalize(channels, 0.98 * (def.level ?? 1));
  channels = trimTail(channels, sr, 0.0004, 0.05);
  return channels;
}

// Re-exported for the metronome and backing instruments.
export { createRng, seedFrom };
