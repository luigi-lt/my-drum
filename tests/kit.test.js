import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, KEY_MAP, MIDI_MAP, PIECE_FOR_SOUND, midiTarget } from '../js/kit/pieces.js';
import { SOUND_IDS } from '../js/audio/kits.js';
import { SOUND_PAN } from '../js/audio/engine.js';
import { STAGE_W, STAGE_H, defaultLayout, mergeLayout, projectLayout, hitTest, toDesign, MAX_SIZE, MIN_SIZE } from '../js/kit/layout.js';

test('every piece and zone plays a sound the kits provide', () => {
  for (const p of PIECES) {
    assert.ok(SOUND_IDS.includes(p.sound), p.id);
    for (const z of Object.values(p.zones ?? {})) assert.ok(SOUND_IDS.includes(z.sound), `${p.id} zone`);
  }
  for (const id of SOUND_IDS) assert.ok(PIECE_FOR_SOUND[id], `${id} belongs to a piece`);
  for (const id of SOUND_IDS) assert.ok(id in SOUND_PAN, `${id} has a pan position`);
});

test('keyboard shortcuts are unique', () => {
  const seen = new Map();
  for (const p of PIECES) {
    const keys = [...p.keys, ...Object.values(p.zones ?? {}).flatMap((z) => z.keys ?? [])];
    for (const k of keys) {
      assert.ok(!seen.has(k), `${k} used by ${seen.get(k)} and ${p.id}`);
      seen.set(k, p.id);
    }
  }
  assert.deepEqual(KEY_MAP.Space, { pieceId: 'kick', sound: 'kick' });
  assert.deepEqual(KEY_MAP.KeyX, { pieceId: 'snare', sound: 'snareRim' });
});

test('General MIDI drum notes map to the right pieces', () => {
  assert.deepEqual(midiTarget(36), { pieceId: 'kick', sound: 'kick' });
  assert.deepEqual(midiTarget(38), { pieceId: 'snare', sound: 'snare' });
  assert.deepEqual(midiTarget(37), { pieceId: 'snare', sound: 'snareRim' });
  assert.deepEqual(midiTarget(42), { pieceId: 'hihatClosed', sound: 'hihatClosed' });
  assert.deepEqual(midiTarget(46), { pieceId: 'hihatOpen', sound: 'hihatOpen' });
  assert.deepEqual(midiTarget(53), { pieceId: 'ride', sound: 'rideBell' });
  assert.equal(midiTarget(60), null);
  for (const sound of Object.values(MIDI_MAP)) assert.ok(SOUND_IDS.includes(sound));
});

test('default layout fits the stage', () => {
  const l = defaultLayout();
  for (const p of PIECES) {
    const it = l[p.id];
    assert.ok(it, p.id);
    assert.ok(it.x >= 0 && it.x <= STAGE_W && it.y >= 0 && it.y <= STAGE_H, `${p.id} inside the stage`);
    assert.ok(it.d >= MIN_SIZE && it.d <= MAX_SIZE, `${p.id} size`);
  }
});

test('tapping the centre of each piece hits that piece', () => {
  for (const [vw, vh] of [
    [STAGE_W, STAGE_H],
    [2200, 900],
    [1600, 1200],
  ]) {
    const items = projectLayout(defaultLayout(), vw, vh, false);
    for (const it of items) {
      const hit = hitTest(items, it.x, it.y, false);
      assert.equal(hit?.id, it.id, `${it.id} at ${vw}x${vh}`);
    }
  }
});

test('zones: ride bell in the centre, snare rim at the edge', () => {
  const items = projectLayout(defaultLayout(), STAGE_W, STAGE_H, false);
  const ride = items.find((i) => i.id === 'ride');
  const snare = items.find((i) => i.id === 'snare');
  assert.equal(hitTest(items, ride.x, ride.y).sound, 'rideBell');
  assert.equal(hitTest(items, ride.x + ride.r * 0.6, ride.y).sound, 'ride');
  assert.equal(hitTest(items, ride.x, ride.y, false).sound, 'ride');
  assert.equal(hitTest(items, snare.x, snare.y).sound, 'snare');
  assert.equal(hitTest(items, snare.x - snare.r * 0.93, snare.y).sound, 'snareRim');
  assert.equal(hitTest(items, -50, -50), null);
});

test('left-handed mirror swaps sides and maps back to design units', () => {
  const l = defaultLayout();
  const normal = projectLayout(l, STAGE_W, STAGE_H, false);
  const mirrored = projectLayout(l, STAGE_W, STAGE_H, true);
  const hh = (items) => items.find((i) => i.id === 'hihatClosed');
  assert.ok(hh(normal).x < STAGE_W / 2);
  assert.ok(hh(mirrored).x > STAGE_W / 2);
  const back = toDesign(hh(mirrored).x, hh(mirrored).y, STAGE_W, STAGE_H, true);
  assert.equal(Math.round(back.x), l.hihatClosed.x);
  assert.equal(Math.round(back.y), l.hihatClosed.y);
});

test('hidden pieces are not projected or hit', () => {
  const l = defaultLayout();
  l.snare.hidden = true;
  const items = projectLayout(l, STAGE_W, STAGE_H);
  assert.ok(!items.some((i) => i.id === 'snare'));
  const hit = hitTest(items, l.snare.x, l.snare.y);
  assert.notEqual(hit?.id, 'snare');
});

test('mergeLayout ignores junk and clamps values', () => {
  assert.deepEqual(mergeLayout(null), defaultLayout());
  assert.deepEqual(mergeLayout('nope'), defaultLayout());
  const m = mergeLayout({ snare: { x: 99999, y: -5, d: 5, hidden: true }, bogus: { x: 1 }, kick: { x: 'a' } });
  assert.equal(m.snare.x, STAGE_W);
  assert.equal(m.snare.y, 0);
  assert.equal(m.snare.d, MIN_SIZE);
  assert.equal(m.snare.hidden, true);
  assert.equal(m.kick.x, defaultLayout().kick.x);
  assert.ok(!('bogus' in m));
});
