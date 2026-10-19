// Sound kit definitions. Every kit is synthesized from scratch at load time,
// so the app ships no third-party samples.

import { renderVoice } from './voices.js';

export const SOUND_IDS = [
  'kick',
  'snare',
  'hihatClosed',
  'tom1',
  'tom2',
  'tom3',
  'floorTom',
  'snareRim',
  'hihatPedal',
  'hihatOpen',
  'crash1',
  'ride',
  'rideBell',
  'crash2',
  'splash',
  'china',
];

// ---------------------------------------------------------------- builders

const kick = ({
  f0 = 52,
  glide = 2.4,
  glideTime = 0.03,
  decay = 0.32,
  click = 0.45,
  thump = 0.35,
  drive = 1.6,
  length = 0.9,
  level = 1,
  modes = true,
} = {}) => ({
  length,
  level,
  drive,
  layers: [
    {
      type: 'tone',
      f0,
      glide,
      glideTime,
      decay,
      modes: modes
        ? [
            { ratio: 1.6, gain: 0.22, decay: decay * 0.25 },
            { ratio: 2.28, gain: 0.1, decay: decay * 0.15 },
          ]
        : [],
    },
    { type: 'noise', gain: thump, filters: [{ type: 'lowpass', f: 220, q: 0.9 }], env: { attack: 0.001, decay: 0.045 } },
    {
      type: 'noise',
      gain: click,
      filters: [
        { type: 'highpass', f: 1800 },
        { type: 'peaking', f: 4200, q: 1.2, gain: 6 },
      ],
      env: { attack: 0.0002, decay: 0.0035 },
    },
  ],
  post: [{ type: 'lowshelf', f: 90, gain: 2 }],
});

const snare = ({
  f0 = 185,
  bodyDecay = 0.12,
  body = 1,
  wires = 0.8,
  wireDecay = 0.16,
  wireDecay2 = 0.32,
  click = 0.5,
  drive = 1.4,
  length = 0.75,
  bright = 1,
  level = 0.95,
} = {}) => ({
  length,
  drive,
  level,
  layers: [
    {
      type: 'tone',
      f0,
      glide: 1.35,
      glideTime: 0.012,
      decay: bodyDecay,
      gain: body,
      modes: [
        { ratio: 1.59, gain: 0.55, decay: bodyDecay * 0.6 },
        { ratio: 2.14, gain: 0.32, decay: bodyDecay * 0.45 },
        { ratio: 2.92, gain: 0.16, decay: bodyDecay * 0.35 },
      ],
    },
    {
      type: 'noise',
      gain: wires,
      filters: [
        { type: 'highpass', f: 1500, q: 0.7 },
        { type: 'lowpass', f: 9500 * bright },
        { type: 'peaking', f: 5200, q: 0.9, gain: 4 },
      ],
      env: { attack: 0.0015, delay: 0.0015, decay: wireDecay, decay2: wireDecay2, mix2: 0.25 },
    },
    { type: 'noise', gain: click, filters: [{ type: 'bandpass', f: 3200, q: 0.8 }], env: { attack: 0.0001, decay: 0.003 } },
  ],
});

const sidestick = ({ pitch = 1, level = 0.75 } = {}) => ({
  length: 0.3,
  level,
  layers: [
    { type: 'noise', gain: 1, filters: [{ type: 'bandpass', f: 1650 * pitch, q: 3.5 }], env: { attack: 0.0002, decay: 0.018 } },
    { type: 'noise', gain: 0.6, filters: [{ type: 'bandpass', f: 3800 * pitch, q: 4 }], env: { attack: 0.0001, decay: 0.01 } },
    { type: 'tone', f0: 520 * pitch, decay: 0.025, gain: 0.7, modes: [{ ratio: 1.47, gain: 0.5, decay: 0.018 }] },
    { type: 'tone', f0: 330 * pitch, decay: 0.07, gain: 0.25 },
  ],
});

const clap = ({ tone = 1, tail = 0.12, level = 0.8 } = {}) => {
  const f = [
    { type: 'bandpass', f: 1150 * tone, q: 1.6 },
    { type: 'highpass', f: 600 },
  ];
  return {
    length: 0.6,
    level,
    layers: [
      { type: 'noise', gain: 1, filters: f, env: { attack: 0.0004, decay: 0.006 } },
      { type: 'noise', gain: 0.9, filters: f, env: { delay: 0.011, attack: 0.0004, decay: 0.006 } },
      { type: 'noise', gain: 0.85, filters: f, env: { delay: 0.022, attack: 0.0004, decay: 0.007 } },
      { type: 'noise', gain: 0.8, filters: f, env: { delay: 0.031, attack: 0.001, decay: tail } },
    ],
  };
};

const tom = ({ f0, decay, glide = 1.28, glideTime = 0.06, strike = 0.35, drive = 1.3, level = 0.74, length } = {}) => ({
  length: length ?? Math.min(2.2, decay * 4 + 0.2),
  drive,
  level,
  layers: [
    {
      type: 'tone',
      f0,
      glide,
      glideTime,
      decay,
      modes: [
        { ratio: 1.594, gain: 0.38, decay: decay * 0.42 },
        { ratio: 1.6, gain: 0.2, decay: decay * 0.4 },
        { ratio: 2.136, gain: 0.2, decay: decay * 0.28 },
        { ratio: 2.296, gain: 0.12, decay: decay * 0.22 },
        { ratio: 2.653, gain: 0.07, decay: decay * 0.18 },
      ],
    },
    {
      type: 'noise',
      gain: strike,
      filters: [{ type: 'bandpass', f: Math.max(900, f0 * 6), q: 0.9 }],
      env: { attack: 0.0003, decay: 0.014 },
    },
    { type: 'noise', gain: strike * 0.5, filters: [{ type: 'lowpass', f: f0 * 3 }], env: { attack: 0.001, decay: 0.04 } },
  ],
});

const hihat = ({ decay = 0.05, open = false, tone = 1, level = 0.55, length } = {}) => ({
  length: length ?? (open ? 1.8 : 0.35),
  level,
  stereo: open,
  width: 0.5,
  layers: [
    {
      type: 'partials',
      count: open ? 90 : 60,
      fMin: 2800 * tone,
      fMax: 15000,
      tilt: 0.5,
      decay: decay * 1.4,
      decayExp: 0.2,
      gain: 0.55,
    },
    {
      type: 'noise',
      gain: 1,
      filters: [
        { type: 'highpass', f: 6000 * tone, q: 0.7 },
        { type: 'peaking', f: 8500, q: 1, gain: 4 },
        { type: 'highshelf', f: 12000, gain: -4 },
      ],
      env: { attack: 0.0004, decay, decay2: decay * 2.2, mix2: 0.2 },
    },
    {
      type: 'noise',
      gain: 0.45,
      filters: [{ type: 'bandpass', f: 3800 * tone, q: 1.2 }],
      env: { attack: 0.0002, decay: decay * 0.4 },
    },
    { type: 'noise', gain: 0.5, filters: [{ type: 'highpass', f: 2500 }], env: { attack: 0.0001, decay: 0.0025 } },
  ],
  post: [{ type: 'highpass', f: 400 }],
});

const pedal = ({ tone = 1, level = 0.48 } = {}) => ({
  length: 0.3,
  level,
  layers: [
    {
      type: 'noise',
      gain: 1,
      filters: [
        { type: 'highpass', f: 5500 * tone },
        { type: 'peaking', f: 8000, q: 1, gain: 3 },
      ],
      env: { attack: 0.004, decay: 0.028 },
    },
    { type: 'noise', gain: 0.55, filters: [{ type: 'bandpass', f: 650, q: 2.5 }], env: { attack: 0.001, decay: 0.012 } },
    { type: 'partials', count: 40, fMin: 3000 * tone, fMax: 12000, decay: 0.03, gain: 0.4 },
  ],
  post: [{ type: 'highpass', f: 300 }],
});

const crash = ({ decay = 1.5, tone = 1, length = 3.4, level = 0.72, count = 170, trash = 0, extra = [] } = {}) => ({
  length,
  level,
  stereo: true,
  width: 0.8,
  drive: trash ? 1 + trash * 2 : 1.05,
  layers: [
    {
      type: 'partials',
      count,
      fMin: 320 * tone,
      fMax: 13000,
      tilt: 0.5,
      decay,
      decayExp: 0.35,
      gain: 0.7,
      maxDecay: length / 4,
    },
    {
      type: 'noise',
      gain: 0.55,
      filters: [
        { type: 'highpass', f: 2600 * tone },
        { type: 'peaking', f: 6500 * tone, q: 0.7, gain: 3 },
      ],
      env: { attack: 0.012, decay: decay * 0.55, decay2: decay * 0.95, mix2: 0.5 },
    },
    { type: 'noise', gain: 0.3, filters: [{ type: 'highpass', f: 9000 }], env: { attack: 0.02, decay: decay * 0.35 } },
    { type: 'noise', gain: 0.9, filters: [{ type: 'highpass', f: 1200 }], env: { attack: 0.0002, decay: 0.006 } },
    { type: 'noise', gain: 0.35, filters: [{ type: 'bandpass', f: 900 * tone, q: 0.8 }], env: { attack: 0.001, decay: 0.08 } },
    ...extra,
  ],
  post: [{ type: 'highpass', f: 250 }],
});

const ride = ({ decay = 2.6, tone = 1, length = 4.5, level = 0.56 } = {}) => ({
  length,
  level,
  stereo: true,
  width: 0.7,
  layers: [
    {
      type: 'partials',
      count: 120,
      fMin: 300 * tone,
      fMax: 10000,
      tilt: 0,
      decay,
      decayExp: 0.4,
      gain: 0.6,
      maxDecay: length / 4,
    },
    { type: 'partials', count: 14, fMin: 2400 * tone, fMax: 5200 * tone, decay: 0.35, decayExp: 0, gain: 0.5 },
    {
      type: 'noise',
      gain: 0.22,
      filters: [
        { type: 'highpass', f: 3500 * tone },
        { type: 'peaking', f: 7000, q: 0.8, gain: 3 },
      ],
      env: { attack: 0.02, decay: decay * 0.6 },
    },
    {
      type: 'noise',
      gain: 0.8,
      filters: [
        { type: 'highpass', f: 2200 },
        { type: 'peaking', f: 5000, q: 1.5, gain: 6 },
      ],
      env: { attack: 0.0002, decay: 0.008 },
    },
  ],
  post: [{ type: 'highpass', f: 220 }],
});

const bell = ({ tone = 1, length = 4, level = 0.62 } = {}) => ({
  length,
  level,
  stereo: true,
  width: 0.5,
  layers: [
    {
      type: 'partials',
      list: [
        { f: 742 * tone, g: 1, d: 2.4 },
        { f: 1163 * tone, g: 0.75, d: 2.0 },
        { f: 1689 * tone, g: 0.6, d: 1.7 },
        { f: 2301 * tone, g: 0.42, d: 1.3 },
        { f: 3012 * tone, g: 0.3, d: 1.0 },
        { f: 3893 * tone, g: 0.2, d: 0.8 },
        { f: 4974 * tone, g: 0.12, d: 0.6 },
      ],
      gain: 0.9,
    },
    { type: 'partials', count: 50, fMin: 600 * tone, fMax: 9000, decay: 1.4, decayExp: 0.4, gain: 0.35 },
    {
      type: 'noise',
      gain: 0.6,
      filters: [
        { type: 'highpass', f: 2000 },
        { type: 'peaking', f: 4500, q: 1.2, gain: 4 },
      ],
      env: { attack: 0.0002, decay: 0.006 },
    },
  ],
  post: [{ type: 'highpass', f: 300 }],
});

// ------------------------------------------------------- electronic voices

const HAT_808 = [263, 400, 421, 474, 587, 845];

const metal808 = ({ decay, scale = 1, hp = 7000, bp = 10000, noise = 0.3, level = 0.5, length, stereo = false } = {}) => ({
  length: length ?? Math.min(4, Math.max(0.3, decay * 4.5)),
  level,
  stereo,
  width: 0.4,
  layers: [
    {
      type: 'squares',
      freqs: HAT_808,
      scale,
      filters: [
        { type: 'bandpass', f: bp, q: 0.8 },
        { type: 'highpass', f: hp },
      ],
      env: { attack: 0.0003, decay },
    },
    { type: 'noise', gain: noise, filters: [{ type: 'highpass', f: hp }], env: { attack: 0.0003, decay: decay * 0.8 } },
  ],
});

const cowbell = ({ level = 0.55 } = {}) => ({
  length: 0.8,
  level,
  layers: [
    {
      type: 'squares',
      freqs: [540, 800],
      filters: [
        { type: 'bandpass', f: 2640, q: 1.1 },
        { type: 'highpass', f: 500 },
      ],
      env: { attack: 0.0005, decay: 0.07, decay2: 0.28, mix2: 0.35 },
    },
  ],
});

const tom808 = ({ f0, decay, level = 0.85 }) => ({
  length: decay * 5 + 0.1,
  level,
  layers: [
    { type: 'tone', f0, glide: 1.4, glideTime: 0.1, decay },
    { type: 'noise', gain: 0.12, filters: [{ type: 'lowpass', f: f0 * 8 }], env: { attack: 0.0005, decay: 0.03 } },
  ],
});

// -------------------------------------------------------------------- kits

const KIT_DEFS = {
  studio: {
    name: 'Studio',
    description: 'Natural acoustic kit, medium tuning, tight room.',
    finish: 'maple',
    sounds: {
      kick: kick(),
      snare: snare(),
      snareRim: sidestick(),
      hihatClosed: hihat({ decay: 0.05 }),
      hihatOpen: hihat({ decay: 0.42, open: true }),
      hihatPedal: pedal(),
      tom1: tom({ f0: 212, decay: 0.38 }),
      tom2: tom({ f0: 168, decay: 0.45 }),
      tom3: tom({ f0: 134, decay: 0.55 }),
      floorTom: tom({ f0: 98, decay: 0.7 }),
      crash1: crash({ decay: 1.5 }),
      crash2: crash({ decay: 1.7, tone: 0.9, length: 3.8 }),
      ride: ride(),
      rideBell: bell(),
      splash: crash({ decay: 0.5, tone: 1.6, length: 1.7, count: 110, level: 0.62 }),
      china: crash({
        decay: 1.0,
        tone: 1.15,
        length: 2.8,
        trash: 0.8,
        level: 0.45,
        extra: [{ type: 'noise', gain: 0.5, filters: [{ type: 'bandpass', f: 1500, q: 1 }], env: { attack: 0.002, decay: 0.7 } }],
      }),
    },
  },
  rock: {
    name: 'Rock Arena',
    description: 'Big, low-tuned drums with punchy attack and long cymbals.',
    finish: 'red',
    sounds: {
      kick: kick({ f0: 48, decay: 0.4, click: 0.65, drive: 2.0, length: 1.0 }),
      snare: snare({ f0: 172, wires: 0.85, wireDecay: 0.2, wireDecay2: 0.4, bodyDecay: 0.16, drive: 1.8, length: 0.9 }),
      snareRim: sidestick({ pitch: 0.9 }),
      hihatClosed: hihat({ decay: 0.055, tone: 0.9 }),
      hihatOpen: hihat({ decay: 0.5, open: true, tone: 0.9, length: 2 }),
      hihatPedal: pedal({ tone: 0.9 }),
      tom1: tom({ f0: 182, decay: 0.48, drive: 1.6 }),
      tom2: tom({ f0: 146, decay: 0.56, drive: 1.6 }),
      tom3: tom({ f0: 118, decay: 0.66, drive: 1.6 }),
      floorTom: tom({ f0: 86, decay: 0.85, drive: 1.6, length: 2.4 }),
      crash1: crash({ decay: 1.8, tone: 0.95, length: 3.8 }),
      crash2: crash({ decay: 2.0, tone: 0.85, length: 4.2 }),
      ride: ride({ decay: 3.0, length: 5 }),
      rideBell: bell({ tone: 0.95 }),
      splash: crash({ decay: 0.55, tone: 1.5, length: 1.8, count: 110, level: 0.62 }),
      china: crash({
        decay: 1.2,
        tone: 1.05,
        length: 3,
        trash: 1,
        level: 0.45,
        extra: [{ type: 'noise', gain: 0.55, filters: [{ type: 'bandpass', f: 1400, q: 1 }], env: { attack: 0.002, decay: 0.8 } }],
      }),
    },
  },
  jazz: {
    name: 'Jazz Club',
    description: 'Small, high-tuned bebop kit with dark, washy cymbals.',
    finish: 'black',
    sounds: {
      kick: kick({ f0: 68, glide: 1.5, decay: 0.5, click: 0.25, thump: 0.2, drive: 1.1, length: 1.2 }),
      snare: snare({ f0: 245, wires: 0.6, wireDecay: 0.12, wireDecay2: 0.24, bodyDecay: 0.09, drive: 1.15, bright: 1.1 }),
      snareRim: sidestick({ pitch: 1.1 }),
      hihatClosed: hihat({ decay: 0.045, tone: 0.85 }),
      hihatOpen: hihat({ decay: 0.38, open: true, tone: 0.85 }),
      hihatPedal: pedal({ tone: 0.85 }),
      tom1: tom({ f0: 265, decay: 0.45, strike: 0.25, drive: 1.1 }),
      tom2: tom({ f0: 212, decay: 0.52, strike: 0.25, drive: 1.1 }),
      tom3: tom({ f0: 176, decay: 0.58, strike: 0.25, drive: 1.1 }),
      floorTom: tom({ f0: 136, decay: 0.68, strike: 0.25, drive: 1.1 }),
      crash1: crash({ decay: 2.0, tone: 0.85, length: 4 }),
      crash2: crash({ decay: 2.2, tone: 0.78, length: 4.4 }),
      ride: ride({ decay: 3.6, tone: 0.85, length: 5.5 }),
      rideBell: bell({ tone: 0.88 }),
      splash: crash({ decay: 0.6, tone: 1.4, length: 1.8, count: 110, level: 0.6 }),
      china: crash({ decay: 1.4, tone: 0.95, length: 3.2, trash: 0.6, level: 0.47 }),
    },
  },
  vintage808: {
    name: 'Vintage 808',
    description: 'Classic analog drum machine: booming kick, clap, cowbell.',
    finish: 'white',
    sounds: {
      kick: kick({
        f0: 47,
        glide: 2.2,
        glideTime: 0.018,
        decay: 0.6,
        click: 0.12,
        thump: 0,
        drive: 1.15,
        length: 1.8,
        modes: false,
        level: 0.92,
      }),
      snare: {
        length: 0.5,
        level: 0.9,
        layers: [
          { type: 'tone', f0: 185, glide: 1.15, glideTime: 0.01, decay: 0.09, modes: [{ ratio: 1.78, gain: 0.6, decay: 0.06 }] },
          {
            type: 'noise',
            gain: 0.9,
            filters: [
              { type: 'highpass', f: 1800 },
              { type: 'lowpass', f: 10000 },
            ],
            env: { attack: 0.0005, decay: 0.14 },
          },
        ],
      },
      snareRim: clap(),
      hihatClosed: metal808({ decay: 0.035 }),
      hihatOpen: metal808({ decay: 0.35, stereo: true }),
      hihatPedal: metal808({ decay: 0.02, level: 0.4, hp: 6000 }),
      tom1: tom808({ f0: 220, decay: 0.32 }),
      tom2: tom808({ f0: 175, decay: 0.38 }),
      tom3: tom808({ f0: 140, decay: 0.44 }),
      floorTom: tom808({ f0: 105, decay: 0.5 }),
      crash1: metal808({ decay: 1.0, scale: 1.2, hp: 5000, bp: 8000, noise: 0.8, level: 0.6, stereo: true }),
      crash2: metal808({ decay: 1.2, scale: 1.05, hp: 4500, bp: 7500, noise: 0.8, level: 0.6, stereo: true }),
      ride: metal808({ decay: 1.2, scale: 1.3, hp: 5000, bp: 7000, noise: 0.2, level: 0.5, stereo: true }),
      rideBell: cowbell(),
      splash: metal808({ decay: 0.45, scale: 2, hp: 6500, noise: 0.7, level: 0.55, stereo: true }),
      china: { ...metal808({ decay: 0.8, scale: 1.4, hp: 3000, bp: 5000, noise: 0.9, level: 0.42, stereo: true }), drive: 3 },
    },
  },
  electro: {
    name: 'Electro',
    description: 'Hard-hitting electronic kit for dance and pop.',
    finish: 'blue',
    sounds: {
      kick: kick({ f0: 50, glide: 5, glideTime: 0.009, decay: 0.38, click: 0.7, thump: 0.1, drive: 2.6, modes: false }),
      snare: {
        length: 0.6,
        level: 0.95,
        drive: 1.8,
        layers: [
          { type: 'tone', f0: 200, glide: 1.5, glideTime: 0.015, decay: 0.1 },
          { type: 'noise', gain: 0.9, filters: [{ type: 'highpass', f: 1200 }], env: { attack: 0.0005, decay: 0.2 } },
        ],
      },
      snareRim: clap({ tone: 1.1, tail: 0.18, level: 0.9 }),
      hihatClosed: hihat({ decay: 0.035, tone: 1.15, level: 0.5 }),
      hihatOpen: hihat({ decay: 0.3, open: true, tone: 1.15, level: 0.5 }),
      hihatPedal: metal808({ decay: 0.02, level: 0.4 }),
      tom1: tom({ f0: 230, decay: 0.26, glide: 1.6, glideTime: 0.05, strike: 0.2, drive: 1.6 }),
      tom2: tom({ f0: 180, decay: 0.3, glide: 1.6, glideTime: 0.05, strike: 0.2, drive: 1.6 }),
      tom3: tom({ f0: 145, decay: 0.34, glide: 1.6, glideTime: 0.05, strike: 0.2, drive: 1.6 }),
      floorTom: tom({ f0: 110, decay: 0.4, glide: 1.6, glideTime: 0.05, strike: 0.2, drive: 1.6 }),
      crash1: crash({ decay: 1.1, tone: 1.3, length: 2.8 }),
      crash2: crash({ decay: 1.3, tone: 1.15, length: 3.2 }),
      ride: ride({ decay: 1.8, tone: 1.2, length: 3.5 }),
      rideBell: cowbell(),
      splash: crash({ decay: 0.4, tone: 1.8, length: 1.4, count: 100, level: 0.6 }),
      china: crash({ decay: 0.9, tone: 1.2, length: 2.4, trash: 1.2, level: 0.42 }),
    },
  },
};

export const KITS = Object.entries(KIT_DEFS).map(([id, k]) => ({
  id,
  name: k.name,
  description: k.description,
  finish: k.finish,
}));

export function hasKit(id) {
  return Object.prototype.hasOwnProperty.call(KIT_DEFS, id);
}

/** Render one sound of a kit. Returns an array of Float32Array channels. */
export function renderSound(kitId, soundId, sampleRate) {
  const kit = KIT_DEFS[kitId];
  if (!kit) throw new Error(`Unknown kit ${kitId}`);
  const def = kit.sounds[soundId];
  if (!def) throw new Error(`Kit ${kitId} has no sound ${soundId}`);
  return renderVoice(def, sampleRate, `${kitId}:${soundId}`);
}

/** Render every sound of a kit, calling onSound(soundId, channels) as each finishes. */
export function renderKit(kitId, sampleRate, onSound) {
  const out = {};
  for (const id of SOUND_IDS) {
    out[id] = renderSound(kitId, id, sampleRate);
    if (onSound) onSound(id, out[id]);
  }
  return out;
}
