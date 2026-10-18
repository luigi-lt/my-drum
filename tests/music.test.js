import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChord, degree, voice, rootNear, midiToFreq } from '../js/music/theory.js';
import { LOOPS, compileLoop, loopEvents } from '../js/music/loops.js';
import { INSTRUMENT_NAMES } from '../js/music/backing.js';

test('parseChord understands roots, accidentals and qualities', () => {
  assert.deepEqual(parseChord('Am7'), { root: 9, intervals: [0, 3, 7, 10], symbol: 'Am7' });
  assert.equal(parseChord('F#5').root, 6);
  assert.equal(parseChord('Bbmaj7').root, 10);
  assert.equal(parseChord('Cb').root, 11);
  assert.throws(() => parseChord('H7'));
  assert.throws(() => parseChord('Cfoo'));
});

test('degrees follow the chord quality and octave marks', () => {
  const am = parseChord('Am');
  const c7 = parseChord('C7');
  const cmaj7 = parseChord('Cmaj7');
  assert.equal(degree('R', am), 0);
  assert.equal(degree('3', am), 3);
  assert.equal(degree('3', c7), 4);
  assert.equal(degree('7', c7), 10);
  assert.equal(degree('7', cmaj7), 11);
  assert.equal(degree('<5', am), -5);
  assert.equal(degree('>8', am), 24);
  assert.throws(() => degree('x', am));
});

test('voicings land near the requested centre', () => {
  const g = parseChord('G');
  const r = rootNear(g, 60);
  assert.ok(Math.abs(r - 60) <= 6);
  assert.deepEqual(voice(parseChord('E5'), 45, 'power'), [40, 47, 52]);
  assert.equal(voice(parseChord('Dm7'), 60, 'shell').length, 3);
  assert.equal(Math.round(midiToFreq(69)), 440);
});

test('every loop compiles with known instruments and sane ranges', () => {
  const ids = new Set();
  for (const loop of LOOPS) {
    assert.ok(!ids.has(loop.id), `duplicate ${loop.id}`);
    ids.add(loop.id);
    const c = compileLoop(loop);
    assert.equal(c.lengthBeats, loop.chords.length * loop.beatsPerBar);
    assert.ok(c.events.length > 0, loop.id);
    for (const e of c.events) {
      assert.ok(INSTRUMENT_NAMES.includes(e.inst), `${loop.id}: ${e.inst}`);
      assert.ok(e.beat >= 0 && e.beat < c.lengthBeats, `${loop.id}: beat ${e.beat}`);
      assert.ok(e.dur > 0, `${loop.id}: duration`);
      for (const m of e.midi) assert.ok(m >= 24 && m <= 96, `${loop.id}: midi ${m}`);
    }
  }
});

test('loopEvents repeats the loop and windows tile without gaps or doubles', () => {
  const c = compileLoop(LOOPS[0]);
  const whole = loopEvents(c, 0, c.lengthBeats * 3);
  assert.equal(whole.length, c.events.length * 3);
  // the same span cut into uneven scheduler windows must give the same events
  const end = c.lengthBeats * 3;
  const steps = [0.13, 0.4, 1, 0.07, 2.5, 3.3];
  const pieces = [];
  let from = 0;
  for (let i = 0; from < end; i++) {
    const to = Math.min(end, from + steps[i % steps.length]);
    pieces.push(...loopEvents(c, from, to));
    from = to;
  }
  assert.equal(pieces.length, whole.length);
  assert.deepEqual(
    pieces.map((e) => e.beat),
    whole.map((e) => e.beat),
  );
  assert.deepEqual(loopEvents(c, 5, 5), []);
});

test('ties extend notes and swing delays off-beats', () => {
  const loop = {
    id: 't',
    bpm: 100,
    beatsPerBar: 4,
    steps: 8,
    swing: 0.6,
    chords: ['C'],
    parts: [{ inst: 'bass', center: 40, rhythm: 'x--.xx..', notes: 'R', len: 1 }],
  };
  const c = compileLoop(loop);
  assert.equal(c.events.length, 3);
  assert.equal(c.events[0].dur, 1.5); // three half-beat steps
  assert.equal(c.events[1].beat, 2); // step 4: on the beat
  assert.ok(Math.abs(c.events[2].beat - (2.5 + 0.1)) < 1e-9); // step 5: swung by (0.6-0.5)*2*0.5
});
