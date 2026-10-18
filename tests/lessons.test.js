import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, compileLesson } from '../js/lessons/lessons.js';
import { WINDOWS, grade, createScore, judgeHit, expireMisses, accuracy, stars } from '../js/lessons/scoring.js';

test('every lesson compiles', () => {
  const ids = new Set();
  for (const l of LESSONS) {
    assert.ok(!ids.has(l.id), `duplicate ${l.id}`);
    ids.add(l.id);
    const c = compileLesson(l);
    assert.ok(c.notes.length > 0);
    assert.ok(c.lengthBeats > 0 && c.lengthBeats % 4 === 0);
    for (let i = 1; i < c.notes.length; i++) assert.ok(c.notes[i].beat >= c.notes[i - 1].beat, 'sorted');
    assert.ok(c.notes.every((n) => n.beat < c.lengthBeats));
    assert.ok([1, 2, 3].includes(l.level));
  }
});

test('rock beat has the expected note count', () => {
  const c = compileLesson(LESSONS.find((l) => l.id === 'rock-beat'));
  // per bar: 8 hats + 2 kicks + 2 snares, times 4 repeats
  assert.equal(c.notes.length, 12 * 4);
  assert.equal(c.lengthBeats, 16);
});

test('grade windows', () => {
  assert.equal(grade(0), 'perfect');
  assert.equal(grade(WINDOWS.perfect), 'perfect');
  assert.equal(grade(-0.06), 'good');
  assert.equal(grade(-0.12), 'early');
  assert.equal(grade(0.12), 'late');
  assert.equal(grade(0.2), null);
});

function notes() {
  return [
    { t: 1.0, pieceId: 'kick', matched: false },
    { t: 1.0, pieceId: 'hihatClosed', matched: false },
    { t: 1.5, pieceId: 'hihatClosed', matched: false },
    { t: 2.0, pieceId: 'snare', matched: false },
  ];
}

test('hits match the closest note on the same piece', () => {
  const n = notes();
  const s = createScore(n.length);
  assert.equal(judgeHit(n, 'hihatClosed', 1.48, s).grade, 'perfect');
  assert.equal(n[2].matched, true);
  assert.equal(judgeHit(n, 'hihatClosed', 1.07, s).grade, 'good');
  // nothing left to match on the hi-hat: counts as an extra hit
  assert.equal(judgeHit(n, 'hihatClosed', 1.2, s), null);
  assert.equal(s.extra, 1);
  // wrong piece never matches
  assert.equal(judgeHit(n, 'tom1', 2.0, s), null);
  assert.equal(s.extra, 2);
});

test('missed notes expire after the window and break the combo', () => {
  const n = notes();
  const s = createScore(n.length);
  judgeHit(n, 'kick', 1.0, s);
  assert.equal(s.combo, 1);
  const missed = expireMisses(n, 1.0 + WINDOWS.ok + 0.01, s);
  assert.deepEqual(
    missed.map((m) => m.pieceId),
    ['hihatClosed'],
  );
  assert.equal(s.combo, 0);
  assert.equal(s.miss, 1);
  expireMisses(n, Infinity, s);
  assert.equal(s.miss, 3);
  assert.equal(s.judged, 4);
});

test('accuracy and stars', () => {
  const s = createScore(4);
  s.perfect = 4;
  assert.equal(accuracy(s), 100);
  assert.equal(stars(100), 3);
  s.perfect = 2;
  s.good = 1;
  s.miss = 1;
  assert.equal(accuracy(s), Math.round(270 / 4));
  s.extra = 100;
  assert.equal(accuracy(s), 0);
  assert.equal(stars(59), 0);
  assert.equal(stars(60), 1);
  assert.equal(stars(80), 2);
});
