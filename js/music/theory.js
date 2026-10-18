// Chord symbols, scale degrees and pitch helpers for the backing band.

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const QUALITIES = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  5: [0, 7],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  9: [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  m7b5: [0, 3, 6, 10],
  '7#9': [0, 4, 7, 10, 15],
};

/** Parse "Am7", "F#5", "Bbmaj7" into { root, intervals, symbol }. */
export function parseChord(symbol) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(symbol);
  if (!m) throw new Error(`Bad chord: ${symbol}`);
  const quality = m[3];
  if (!(quality in QUALITIES)) throw new Error(`Unknown chord quality: ${symbol}`);
  let root = NOTE_INDEX[m[1]];
  if (m[2] === '#') root += 1;
  if (m[2] === 'b') root -= 1;
  return { root: (root + 12) % 12, intervals: QUALITIES[quality], symbol };
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Scale-degree token relative to a chord: R 2 b3 3 4 5 6 b7 7 8 9.
 * "3" and "7" follow the chord quality. A leading "<" drops an octave,
 * ">" raises one (they can repeat).
 */
export function degree(token, chord) {
  let t = token;
  let oct = 0;
  while (t[0] === '<' || t[0] === '>') {
    oct += t[0] === '<' ? -12 : 12;
    t = t.slice(1);
  }
  const has = (i) => chord.intervals.includes(i);
  let s;
  switch (t) {
    case 'R':
    case '1':
      s = 0;
      break;
    case '2':
      s = 2;
      break;
    case 'b3':
      s = 3;
      break;
    case '3':
      s = has(3) ? 3 : 4;
      break;
    case '4':
      s = 5;
      break;
    case '5':
      s = has(6) && !has(7) ? 6 : 7;
      break;
    case '6':
      s = 9;
      break;
    case 'b7':
      s = 10;
      break;
    case '7':
      s = has(11) ? 11 : 10;
      break;
    case '8':
      s = 12;
      break;
    case '9':
      s = 14;
      break;
    default:
      throw new Error(`Bad degree: ${token}`);
  }
  return s + oct;
}

/** Midi note of the chord root closest to `center`. */
export function rootNear(chord, center) {
  let n = chord.root;
  while (n + 12 <= center + 6) n += 12;
  return n;
}

/**
 * Chord voicing around `center`.
 * power: root-5-8 | triad: close triad | full: all chord tones | shell: 1-3-7
 */
export function voice(chord, center, style = 'triad') {
  const r = rootNear(chord, center);
  const iv = chord.intervals;
  let notes;
  if (style === 'power') notes = [0, 7, 12];
  else if (style === 'shell') notes = [0, iv.includes(3) ? 3 : 4, iv.includes(11) ? 11 : iv.includes(10) ? 10 : 7];
  else if (style === 'full') notes = iv;
  else notes = iv.filter((i) => i < 12).slice(0, 3);
  return notes.map((i) => r + i);
}
