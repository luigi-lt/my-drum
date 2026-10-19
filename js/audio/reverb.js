// Generates a stereo room impulse response: a handful of early reflections
// followed by a dense, darkening exponential tail.

import { createRng } from './dsp.js';

export function generateRoomIR(sampleRate, { seconds = 1.6, rt60 = 1.2, predelay = 0.008, damping = 0.55 } = {}) {
  const len = Math.ceil(seconds * sampleRate);
  const rng = createRng(0xd2a7);
  const channels = [new Float32Array(len), new Float32Array(len)];
  const tau = rt60 / 6.91; // e^-6.91 = -60 dB
  const pre = Math.floor(predelay * sampleRate);

  channels.forEach((ch, c) => {
    // early reflections
    for (let r = 0; r < 14; r++) {
      const t = predelay + 0.004 + rng() * 0.07;
      const i = Math.floor(t * sampleRate);
      if (i < len) ch[i] += (rng() * 2 - 1) * 0.6 * Math.exp(-t / (tau * 0.6));
    }
    // diffuse tail with a one-pole lowpass whose cutoff falls over time
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sampleRate;
      const progress = t / seconds;
      const coeff = 0.15 + damping * 0.8 * progress; // more smoothing later = darker
      const n = (rng() * 2 - 1) * Math.exp(-t / tau);
      lp = lp + (1 - coeff) * (n - lp);
      ch[i] += lp * (c === 0 ? 1 : 0.97);
    }
    // fade out the final 10% to avoid a hard stop
    const fade = Math.floor(len * 0.1);
    for (let i = 0; i < fade; i++) ch[len - 1 - i] *= i / fade;
  });
  return channels;
}
