import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Biquad, createRng, rms, peak } from '../js/audio/dsp.js';
import { KITS, SOUND_IDS, renderSound } from '../js/audio/kits.js';
import { generateRoomIR } from '../js/audio/reverb.js';
import { encodeWav } from '../js/audio/wav.js';

const SR = 44100;

function sine(freq, seconds = 0.5) {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

test('rng is deterministic per seed and stays in [0, 1)', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(createRng(1)(), createRng(2)());
});

test('biquad lowpass passes lows and cuts highs', () => {
  const low = new Biquad('lowpass', 1000, Math.SQRT1_2, SR).process(sine(100));
  const high = new Biquad('lowpass', 1000, Math.SQRT1_2, SR).process(sine(8000));
  const tail = (b) => rms(b, b.length / 2);
  assert.ok(tail(low) > 0.65, `100 Hz kept (${tail(low)})`);
  assert.ok(tail(high) < 0.03, `8 kHz removed (${tail(high)})`);
});

test('biquad highpass cuts lows', () => {
  const out = new Biquad('highpass', 2000, Math.SQRT1_2, SR).process(sine(100));
  assert.ok(rms(out, out.length / 2) < 0.01);
});

for (const kit of KITS) {
  test(`kit "${kit.id}" renders every sound cleanly`, () => {
    for (const id of SOUND_IDS) {
      const channels = renderSound(kit.id, id, SR);
      assert.ok(channels.length === 1 || channels.length === 2, `${id}: channel count`);
      const len = channels[0].length;
      assert.ok(len > SR * 0.05 && len < SR * 7, `${id}: length ${len / SR}s`);
      for (const c of channels) {
        assert.equal(c.length, len);
        assert.ok(
          c.every((v) => Number.isFinite(v)),
          `${id}: finite samples`,
        );
        const p = peak(c);
        assert.ok(p <= 1 && p > 0.2, `${id}: peak ${p}`);
      }
      // the sound must decay: the last 20 ms are far quieter than the first 50 ms
      const c = channels[0];
      const head = rms(c, 0, Math.floor(SR * 0.05));
      const tail = rms(c, len - Math.floor(SR * 0.02));
      assert.ok(tail < head * 0.1, `${id}: decays (head ${head}, tail ${tail})`);
    }
  });
}

test('rendering is deterministic', () => {
  const a = renderSound('studio', 'crash1', SR)[0];
  const b = renderSound('studio', 'crash1', SR)[0];
  assert.deepEqual(a.slice(0, 2000), b.slice(0, 2000));
});

test('kick energy sits in the low end, hi-hat in the highs', () => {
  const zeroCrossRate = (buf, seconds = 0.05) => {
    const n = Math.floor(SR * seconds);
    let z = 0;
    for (let i = 1; i < n; i++) if (buf[i - 1] < 0 !== buf[i] < 0) z++;
    return (z / 2) * (1 / seconds); // approx dominant frequency in Hz
  };
  const kick = renderSound('studio', 'kick', SR)[0].subarray(Math.floor(SR * 0.04));
  const hat = renderSound('studio', 'hihatClosed', SR)[0];
  assert.ok(zeroCrossRate(kick) < 150, `kick ~${zeroCrossRate(kick)} Hz`);
  assert.ok(zeroCrossRate(hat) > 3000, `hat ~${zeroCrossRate(hat)} Hz`);
});

test('room impulse response is stereo, finite and decaying', () => {
  const [l, r] = generateRoomIR(SR);
  assert.equal(l.length, r.length);
  assert.ok(l.every(Number.isFinite) && r.every(Number.isFinite));
  assert.ok(rms(l, 0, SR * 0.2) > rms(l, l.length - SR * 0.2) * 10);
});

test('wav encoder writes a valid 16-bit PCM header and data', () => {
  const left = new Float32Array([0, 0.5, -0.5, 1, -1, 2]);
  const right = new Float32Array(6);
  const buf = encodeWav([left, right], 48000);
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 6 * 2 * 2);
  assert.equal(buf.byteLength, 44 + 24);
  assert.equal(v.getInt16(44 + 4, true), Math.floor(0.5 * 0x7fff)); // left[1]
  assert.equal(v.getInt16(44 + 5 * 4, true), 0x7fff); // clipped 2.0
});
