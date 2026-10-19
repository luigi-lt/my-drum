// Play-along backing loops (no drums: you are the drummer).
//
// Rhythm strings have one character per grid step:
//   x = note, X = accented note, m = short/muted note, - = hold previous, . = rest
// `notes` holds scale-degree tokens (see theory.degree) used in order for
// each hit; parts without notes play the chord voicing instead.

import { parseChord, rootNear, degree, voice } from './theory.js';

export const LOOPS = [
  {
    id: 'rock-anthem',
    name: 'Rock Anthem',
    genre: 'Rock',
    bpm: 120,
    beatsPerBar: 4,
    steps: 16,
    chords: ['E5', 'C5', 'G5', 'D5'],
    parts: [
      { inst: 'guitarDist', voicing: 'power', center: 45, rhythm: 'X.x.x.x.x.x.x.x.', len: 0.9 },
      { inst: 'bass', center: 40, rhythm: 'x.x.x.x.x.x.x.x.', notes: 'R', len: 0.85 },
    ],
  },
  {
    id: 'pop-sunshine',
    name: 'Pop Sunshine',
    genre: 'Pop',
    bpm: 100,
    beatsPerBar: 4,
    steps: 16,
    chords: ['C', 'G', 'Am', 'F'],
    parts: [
      { inst: 'epiano', voicing: 'triad', center: 64, rhythm: 'x..x..x.x..x..x.', len: 0.9 },
      { inst: 'guitarClean', voicing: 'triad', center: 62, rhythm: '..x...x...x...x.', len: 0.45, vel: 0.7 },
      { inst: 'bass', center: 40, rhythm: 'x...x...x...x.x.', notes: 'R R 5 R 8', len: 0.8 },
    ],
  },
  {
    id: 'funk-groove',
    name: 'Funk Groove',
    genre: 'Funk',
    bpm: 96,
    beatsPerBar: 4,
    steps: 16,
    swing: 0.54,
    chords: ['E9', 'E9', 'E9', 'A9'],
    parts: [
      { inst: 'guitarClean', voicing: 'shell', center: 64, rhythm: 'm.mXm.mxm.mXm.mx', len: 0.5, vel: 0.85 },
      { inst: 'epiano', voicing: 'shell', center: 60, rhythm: '......x.......x.', len: 0.3, vel: 0.8 },
      { inst: 'bass', center: 40, rhythm: 'x..x..x.x.xx..x.', notes: 'R R b7 R 8 5 R', len: 0.7 },
    ],
  },
  {
    id: 'blues-shuffle',
    name: 'Blues Shuffle',
    genre: 'Blues',
    bpm: 92,
    beatsPerBar: 4,
    steps: 12,
    chords: ['A7', 'D7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'],
    parts: [
      { inst: 'organ', voicing: 'shell', center: 62, rhythm: 'x..x..x..x..', len: 0.75, vel: 0.75 },
      { inst: 'bass', center: 40, rhythm: 'x.xx.xx.xx.x', notes: 'R 3 5 6 b7 6 5 3', len: 0.85 },
    ],
  },
  {
    id: 'reggae-one-drop',
    name: 'One Drop',
    genre: 'Reggae',
    bpm: 76,
    beatsPerBar: 4,
    steps: 16,
    swing: 0.56,
    chords: ['Am', 'G', 'F', 'G'],
    parts: [
      { inst: 'guitarClean', voicing: 'triad', center: 66, rhythm: '....m.......m...', len: 0.6 },
      { inst: 'organ', voicing: 'triad', center: 60, rhythm: '..x...x...x...x.', len: 0.35, vel: 0.55 },
      { inst: 'bass', center: 40, rhythm: 'x..x....x.x.x...', notes: 'R R 5 8 5', len: 0.75 },
    ],
  },
  {
    id: 'metal-gallop',
    name: 'Metal Gallop',
    genre: 'Metal',
    bpm: 150,
    beatsPerBar: 4,
    steps: 16,
    chords: ['E5', 'E5', 'C5', 'D5'],
    parts: [
      { inst: 'guitarDist', voicing: 'power', center: 41, rhythm: 'X.mmX.mmX.mmX.mm', len: 0.95 },
      { inst: 'bass', center: 40, rhythm: 'x.xxx.xxx.xxx.xx', notes: 'R', len: 0.8 },
    ],
  },
  {
    id: 'jazz-walk',
    name: 'Jazz Walk',
    genre: 'Jazz',
    bpm: 132,
    beatsPerBar: 4,
    steps: 12,
    chords: ['Dm7', 'G7', 'Cmaj7', 'A7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7'],
    parts: [
      { inst: 'epiano', voicing: 'shell', center: 60, rhythm: 'x....x......', len: 0.35, vel: 0.8 },
      {
        inst: 'bass',
        center: 40,
        rhythm: 'x..x..x..x..',
        notes: ['R 3 5 3', 'R 3 5 7', 'R 5 6 5', 'R 3 2 <7'],
        len: 0.95,
      },
    ],
  },
  {
    id: 'bossa-night',
    name: 'Bossa Night',
    genre: 'Latin',
    bpm: 128,
    beatsPerBar: 4,
    steps: 16,
    chords: ['Am7', 'D7', 'Gmaj7', 'E7'],
    parts: [
      { inst: 'guitarClean', voicing: 'full', center: 60, rhythm: '..x..x...x..x...', len: 0.5, vel: 0.8 },
      { inst: 'bass', center: 40, rhythm: 'x.....x.x.....x.', notes: 'R 5 5 R', len: 0.9, vel: 0.85 },
    ],
  },
  {
    id: 'disco-floor',
    name: 'Disco Floor',
    genre: 'Disco',
    bpm: 118,
    beatsPerBar: 4,
    steps: 16,
    chords: ['Am7', 'Am7', 'Dm7', 'Dm7'],
    parts: [
      { inst: 'strings', voicing: 'full', center: 64, rhythm: 'x---------------', len: 1, vel: 0.6 },
      { inst: 'guitarClean', voicing: 'shell', center: 64, rhythm: 'm.x.m.x.m.x.m.x.', len: 0.3, vel: 0.65 },
      { inst: 'bass', center: 40, rhythm: 'x.x.x.x.x.x.x.x.', notes: 'R 8', len: 0.6 },
    ],
  },
  {
    id: 'slow-ballad',
    name: 'Slow Ballad',
    genre: 'Ballad',
    bpm: 72,
    beatsPerBar: 4,
    steps: 16,
    chords: ['G', 'D', 'Em', 'C'],
    parts: [
      { inst: 'strings', voicing: 'triad', center: 60, rhythm: 'x---------------', len: 1, vel: 0.5 },
      { inst: 'epiano', center: 64, rhythm: 'x.x.x.x.x.x.x.x.', notes: 'R 5 8 9 8 5 3 5', len: 0.9, vel: 0.7 },
      { inst: 'bass', center: 40, rhythm: 'x-------x-------', notes: 'R 5', len: 0.95 },
    ],
  },
];

export const LOOP_BY_ID = Object.fromEntries(LOOPS.map((l) => [l.id, l]));

const VEL = { x: 0.78, X: 1, m: 0.6 };

/** Turn a loop definition into a sorted list of note events (beats from loop start). */
export function compileLoop(loop) {
  const bars = loop.chords.length;
  const stepBeats = loop.beatsPerBar / loop.steps;
  const swing = loop.swing ? (loop.swing - 0.5) * 2 * stepBeats : 0;
  const chordCache = new Map();
  const chord = (sym) => {
    if (!chordCache.has(sym)) chordCache.set(sym, parseChord(sym));
    return chordCache.get(sym);
  };
  const chordAt = (bar, step) => {
    const parts = loop.chords[bar].trim().split(/\s+/);
    const idx = Math.min(parts.length - 1, Math.floor(step / (loop.steps / parts.length)));
    return chord(parts[idx]);
  };

  const events = [];
  for (const part of loop.parts) {
    const rhythms = Array.isArray(part.rhythm) ? part.rhythm : [part.rhythm];
    const noteBars = part.notes ? (Array.isArray(part.notes) ? part.notes : [part.notes]).map((s) => s.trim().split(/\s+/)) : null;
    let last = null;
    for (let bar = 0; bar < bars; bar++) {
      const r = rhythms[bar % rhythms.length];
      if (r.length !== loop.steps) throw new Error(`${loop.id}: rhythm "${r}" is not ${loop.steps} steps`);
      const tokens = noteBars ? noteBars[bar % noteBars.length] : null;
      let hit = 0;
      for (let s = 0; s < loop.steps; s++) {
        const c = r[s];
        if (c === '-') {
          if (last) last.dur += stepBeats;
          continue;
        }
        last = null;
        if (c === '.') continue;
        if (!(c in VEL)) throw new Error(`${loop.id}: bad rhythm character "${c}"`);
        const ch = chordAt(bar, s);
        let midi;
        if (tokens) {
          const base = rootNear(ch, part.center);
          midi = [base + degree(tokens[hit % tokens.length], ch)];
        } else {
          midi = voice(ch, part.center, part.voicing ?? 'triad');
        }
        const ev = {
          beat: bar * loop.beatsPerBar + s * stepBeats + (s % 2 === 1 ? swing : 0),
          dur: stepBeats * (c === 'm' ? 0.45 : 1),
          len: part.len ?? 0.9,
          inst: part.inst,
          midi,
          vel: VEL[c] * (part.vel ?? 1),
          mute: c === 'm',
        };
        events.push(ev);
        last = c === 'm' ? null : ev;
        hit++;
      }
    }
  }
  events.sort((a, b) => a.beat - b.beat);
  return { loop, events, lengthBeats: bars * loop.beatsPerBar };
}

/** Events of a compiled loop (repeating forever) with from <= beat < to. */
export function loopEvents(compiled, from, to) {
  const out = [];
  if (to <= from) return out;
  const L = compiled.lengthBeats;
  const first = Math.floor(from / L);
  const last = Math.floor(to / L);
  for (let k = first; k <= last; k++) {
    for (const e of compiled.events) {
      const b = k * L + e.beat;
      if (b >= from && b < to) out.push({ ...e, beat: b, dur: e.dur * e.len });
    }
  }
  return out;
}
