// Small DSP toolkit used to synthesize drum samples offline.
// Everything here is pure JavaScript (no Web Audio), so it runs in a
// worker, on the main thread, or under Node for tests.

const TWO_PI = Math.PI * 2;

/** Deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit seed. */
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Biquad filter (RBJ audio EQ cookbook), direct form I.
 * type: lowpass | highpass | bandpass | peaking | lowshelf | highshelf
 */
export class Biquad {
  constructor(type, freq, q = Math.SQRT1_2, sampleRate = 48000, gainDb = 0) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, freq, q, sampleRate, gainDb);
  }

  set(type, freq, q, sampleRate, gainDb = 0) {
    const f = Math.min(Math.max(freq, 10), sampleRate * 0.49);
    const w0 = (TWO_PI * f) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(q, 0.0001));
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass':
        b0 = (1 - cos) / 2;
        b1 = 1 - cos;
        b2 = (1 - cos) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cos) / 2;
        b1 = -(1 + cos);
        b2 = (1 + cos) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'peaking':
        b0 = 1 + alpha * A;
        b1 = -2 * cos;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cos;
        a2 = 1 - alpha / A;
        break;
      case 'lowshelf':
      case 'highshelf': {
        const sq = 2 * Math.sqrt(A) * alpha;
        const s = type === 'lowshelf' ? 1 : -1;
        b0 = A * (A + 1 - s * (A - 1) * cos + sq);
        b1 = s * 2 * A * (A - 1 - s * (A + 1) * cos);
        b2 = A * (A + 1 - s * (A - 1) * cos - sq);
        a0 = A + 1 + s * (A - 1) * cos + sq;
        a1 = -s * 2 * (A - 1 + s * (A + 1) * cos);
        a2 = A + 1 + s * (A - 1) * cos - sq;
        break;
      }
      default:
        throw new Error(`Unknown filter type: ${type}`);
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  process(buf) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.tick(buf[i]);
    return buf;
  }
}

/** Apply a chain of filter specs [{type, f, q, gain}] to a buffer in place. */
export function filterChain(buf, specs, sampleRate) {
  for (const s of specs) new Biquad(s.type, s.f, s.q ?? Math.SQRT1_2, sampleRate, s.gain ?? 0).process(buf);
  return buf;
}

/** Fill a new buffer with white noise in [-1, 1]. */
export function whiteNoise(length, rng) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rng() * 2 - 1;
  return out;
}

/** Symmetric soft clipper normalised so that drive does not change unity peaks much. */
export function saturate(buf, drive = 1) {
  if (drive <= 1.0001) return buf;
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) * norm;
  return buf;
}

export function peak(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > p) p = a;
  }
  return p;
}

export function rms(buf, start = 0, end = buf.length) {
  let s = 0;
  const e = Math.min(end, buf.length);
  for (let i = start; i < e; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, e - start));
}

/** Scale one or more channels together so the loudest peak equals target. */
export function normalize(channels, target = 0.9) {
  let p = 0;
  for (const c of channels) p = Math.max(p, peak(c));
  if (p === 0) return channels;
  const g = target / p;
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= g;
  return channels;
}

/** Fade the last `tailFraction` of the buffer with a raised-cosine curve. */
export function fadeTail(buf, tailFraction = 0.3) {
  const n = buf.length;
  const start = Math.floor(n * (1 - tailFraction));
  const len = n - start;
  for (let i = start; i < n; i++) {
    const x = (i - start) / len;
    buf[i] *= 0.5 + 0.5 * Math.cos(Math.PI * x);
  }
  return buf;
}

/** Short fade-in to avoid a click when a sample starts at a non-zero value. */
export function fadeIn(buf, samples = 16) {
  const n = Math.min(samples, buf.length);
  for (let i = 0; i < n; i++) buf[i] *= i / n;
  return buf;
}

/** Add src * gain into dst (lengths may differ). */
export function mixInto(dst, src, gain = 1, offset = 0) {
  const n = Math.min(src.length, dst.length - offset);
  for (let i = 0; i < n; i++) dst[i + offset] += src[i] * gain;
  return dst;
}

/**
 * Multiply a buffer by an exponential decay envelope with an optional linear
 * attack and start delay. `decay` is the time constant in seconds.
 */
export function applyDecay(buf, sampleRate, decay, attack = 0, delay = 0) {
  const k = Math.exp(-1 / (decay * sampleRate));
  const d = Math.floor(delay * sampleRate);
  const a = Math.max(1, Math.floor(attack * sampleRate));
  let env = 1;
  for (let i = 0; i < buf.length; i++) {
    if (i < d) {
      buf[i] = 0;
      continue;
    }
    const j = i - d;
    const atk = j < a ? j / a : 1;
    buf[i] *= env * atk;
    env *= k;
  }
  return buf;
}

/** Cut trailing samples below `threshold` (keeps at least `minSeconds`). */
export function trimTail(channels, sampleRate, threshold = 0.0005, minSeconds = 0.05) {
  let last = 0;
  for (const c of channels) {
    for (let i = c.length - 1; i >= 0; i--) {
      if (Math.abs(c[i]) > threshold) {
        if (i > last) last = i;
        break;
      }
    }
  }
  const len = Math.min(channels[0].length, Math.max(last + 1, Math.floor(minSeconds * sampleRate)));
  if (len === channels[0].length) return channels;
  return channels.map((c) => {
    const out = c.slice(0, len);
    // tiny fade so the cut never clicks
    const f = Math.min(64, len);
    for (let i = 0; i < f; i++) out[len - 1 - i] *= i / f;
    return out;
  });
}

export const dbToGain = (db) => Math.pow(10, db / 20);
