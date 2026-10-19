// Guided lessons. Each track is one string per piece; bars are separated
// by "|" and every character is one grid step (x = hit, . = rest).

import { PIECE_BY_ID } from '../kit/pieces.js';

export const LESSONS = [
  {
    id: 'steady-hats',
    title: 'Steady hi-hat',
    level: 1,
    bpm: 70,
    steps: 8,
    repeats: 4,
    tip: 'Eight even notes per bar on the closed hi-hat. Count "1 and 2 and 3 and 4 and".',
    tracks: { hihatClosed: 'xxxxxxxx' },
  },
  {
    id: 'kick-snare',
    title: 'Kick and snare',
    level: 1,
    bpm: 75,
    steps: 8,
    repeats: 4,
    tip: 'Kick on beats 1 and 3, snare on beats 2 and 4: the backbone of most songs.',
    tracks: { kick: 'x...x...', snare: '..x...x.' },
  },
  {
    id: 'rock-beat',
    title: 'Basic rock beat',
    level: 1,
    bpm: 80,
    steps: 8,
    repeats: 4,
    tip: 'Put the two together: eighth notes on the hi-hat over kick and snare.',
    tracks: { hihatClosed: 'xxxxxxxx', kick: 'x...x...', snare: '..x...x.' },
  },
  {
    id: 'extra-kick',
    title: 'Rock beat, extra kicks',
    level: 2,
    bpm: 85,
    steps: 8,
    repeats: 2,
    tip: 'Same hands, busier foot. The second bar adds a kick on the "and" of 2.',
    tracks: {
      hihatClosed: 'xxxxxxxx|xxxxxxxx',
      kick: 'x...xx..|x..xx...',
      snare: '..x...x.|..x...x.',
    },
  },
  {
    id: 'open-hat',
    title: 'Open hi-hat accent',
    level: 2,
    bpm: 90,
    steps: 8,
    repeats: 4,
    tip: 'Open the hi-hat on the last eighth of the bar, then close it on beat 1.',
    tracks: { hihatClosed: 'xxxxxxx.', hihatOpen: '.......x', kick: 'x...x...', snare: '..x...x.' },
  },
  {
    id: 'four-floor',
    title: 'Four on the floor',
    level: 2,
    bpm: 110,
    steps: 8,
    repeats: 4,
    tip: 'Kick on every beat, open hi-hat on every offbeat. Disco and dance music live here.',
    tracks: { kick: 'x.x.x.x.', snare: '..x...x.', hihatOpen: '.x.x.x.x' },
  },
  {
    id: 'ride-groove',
    title: 'Ride groove',
    level: 2,
    bpm: 95,
    steps: 8,
    repeats: 4,
    tip: 'Move your right hand to the ride and keep time with the hi-hat pedal on 2 and 4.',
    tracks: { ride: 'xxxxxxxx', kick: 'x...x...', snare: '..x...x.', hihatPedal: '..x...x.' },
  },
  {
    id: 'half-time',
    title: 'Half-time feel',
    level: 3,
    bpm: 90,
    steps: 8,
    repeats: 4,
    tip: 'The snare moves to beat 3 only, which makes the groove feel twice as slow.',
    tracks: { hihatClosed: 'xxxxxxxx', kick: 'x.....x.', snare: '....x...' },
  },
  {
    id: 'sixteenths',
    title: '16th-note hi-hat',
    level: 3,
    bpm: 72,
    steps: 16,
    repeats: 4,
    tip: 'Four hi-hat notes per beat. Stay relaxed and let the kick sit between them.',
    tracks: {
      hihatClosed: 'xxxxxxxxxxxxxxxx',
      kick: 'x.......x.x.....',
      snare: '....x.......x...',
    },
  },
  {
    id: 'first-fill',
    title: 'Your first fill',
    level: 3,
    bpm: 80,
    steps: 16,
    repeats: 2,
    tip: 'One bar of groove, then sixteenths down the toms, landing on a crash.',
    tracks: {
      crash1: 'x...............|................',
      hihatClosed: '..x.x.x.x.x.x.x.|................',
      kick: 'x.......x.......|................',
      snare: '....x.......x...|xxxx............',
      tom1: '................|....xxxx........',
      tom2: '................|........xx......',
      tom3: '................|..........xx....',
      floorTom: '................|............xxxx',
    },
  },
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

/** Expand a lesson into sorted notes { beat, pieceId } over all repeats. */
export function compileLesson(lesson) {
  const stepBeats = 4 / lesson.steps;
  const pattern = [];
  let bars = 0;
  for (const [pieceId, track] of Object.entries(lesson.tracks)) {
    if (!PIECE_BY_ID[pieceId]) throw new Error(`${lesson.id}: unknown piece ${pieceId}`);
    const barStrings = track.split('|');
    bars = Math.max(bars, barStrings.length);
    barStrings.forEach((bar, b) => {
      if (bar.length !== lesson.steps) throw new Error(`${lesson.id}: ${pieceId} bar ${b + 1} is not ${lesson.steps} steps`);
      for (let s = 0; s < bar.length; s++) {
        if (bar[s] === 'x') pattern.push({ beat: b * 4 + s * stepBeats, pieceId });
        else if (bar[s] !== '.') throw new Error(`${lesson.id}: bad character "${bar[s]}"`);
      }
    });
  }
  const barBeats = bars * 4;
  const notes = [];
  for (let r = 0; r < lesson.repeats; r++) for (const n of pattern) notes.push({ beat: r * barBeats + n.beat, pieceId: n.pieceId });
  notes.sort((a, b) => a.beat - b.beat || a.pieceId.localeCompare(b.pieceId));
  return { notes, lengthBeats: barBeats * lesson.repeats, pieces: Object.keys(lesson.tracks) };
}
