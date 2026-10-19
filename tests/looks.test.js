import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINS,
  SHELL_FINISHES,
  HARDWARE,
  HEADS,
  CYMBAL_FINISHES,
  STAGES,
  GLOWS,
  DEFAULT_LOOK,
  lookFromSkin,
  normalizeLook,
  shellFor,
  cymbalFor,
  paintPiece,
  isCustomized,
  pieceSurface,
  shade,
  luminance,
  DRUM_PIECES,
  CYMBAL_PIECES,
} from '../js/kit/looks.js';
import { PIECES } from '../js/kit/pieces.js';
import { defaultLayout3d, mergeLayout3d, clamp3d, LIMITS, AREA, heightOf } from '../js/kit/layout3d.js';

const ids = (list) => list.map((o) => o.id);

test('every skin uses known finishes, hardware, heads, cymbals, glow and stage', () => {
  assert.equal(new Set(ids(SKINS)).size, SKINS.length);
  for (const s of SKINS) {
    assert.ok(ids(SHELL_FINISHES).includes(s.finish), `${s.id} finish`);
    assert.match(s.color, /^#[0-9a-f]{6}$/);
    assert.ok(ids(HARDWARE).includes(s.hardware), `${s.id} hardware`);
    assert.ok(ids(HEADS).includes(s.heads), `${s.id} heads`);
    assert.ok(ids(CYMBAL_FINISHES).includes(s.cymbals), `${s.id} cymbals`);
    assert.ok(ids(GLOWS).includes(s.glow), `${s.id} glow`);
    assert.ok(ids(STAGES).includes(s.stage), `${s.id} stage`);
  }
});

test('lookFromSkin copies the skin and keeps the logo', () => {
  const l = lookFromSkin('neon', 'BAND');
  assert.equal(l.skin, 'neon');
  assert.equal(l.heads, 'mesh');
  assert.equal(l.logo, 'BAND');
  assert.deepEqual(l.pieces, {});
  assert.equal(lookFromSkin('nope').skin, SKINS[0].id);
});

test('normalizeLook keeps valid values and drops junk', () => {
  assert.deepEqual(normalizeLook(null), lookFromSkin(DEFAULT_LOOK.skin));
  const l = normalizeLook({
    skin: 'midnight',
    finish: 'pearl',
    color: '#ABCDEF',
    hardware: 'plastic',
    heads: 'clear',
    cymbals: 'black',
    glow: 'red',
    stage: 'arena',
    logo: 'A very long logo text here',
    pieces: { snare: { color: '#112233', finish: 'nope' }, ghost: { color: '#000000' }, ride: { cymbals: 'dark' }, tom1: 'x' },
  });
  assert.equal(l.skin, 'midnight');
  assert.equal(l.finish, 'pearl');
  assert.equal(l.color, '#abcdef');
  assert.equal(l.hardware, DEFAULT_LOOK.hardware);
  assert.equal(l.heads, 'clear');
  assert.equal(l.glow, DEFAULT_LOOK.glow);
  assert.equal(l.logo.length, 14);
  assert.deepEqual(l.pieces, { snare: { color: '#112233' }, ride: { cymbals: 'dark' } });
});

test('painting a piece overrides only that piece', () => {
  let l = lookFromSkin('classic-maple');
  l = { ...l, finish: 'sparkle', color: '#1f5fd0', cymbals: 'black' };
  const painted = paintPiece(l, 'snare');
  assert.deepEqual(shellFor(painted, 'snare'), { finish: 'sparkle', color: '#1f5fd0' });
  const back = { ...painted, finish: 'wood', color: '#c98a4b' };
  assert.deepEqual(shellFor(back, 'snare'), { finish: 'sparkle', color: '#1f5fd0' });
  assert.deepEqual(shellFor(back, 'tom1'), { finish: 'wood', color: '#c98a4b' });
  const cym = paintPiece(back, 'ride');
  assert.equal(cymbalFor({ ...cym, cymbals: 'traditional' }, 'ride'), 'black');
  assert.equal(paintPiece(l, 'hihatPedal'), l, 'pedals cannot be painted');
  assert.ok(isCustomized(painted));
  assert.ok(!isCustomized(lookFromSkin('red-sparkle')));
});

test('every piece is a drum, a cymbal or a pedal', () => {
  for (const p of PIECES) {
    const s = pieceSurface(p.id);
    if (p.kind === 'pedal') assert.equal(s, null);
    else assert.ok(s === 'shell' || s === 'cymbal', p.id);
  }
  assert.equal(DRUM_PIECES.length + CYMBAL_PIECES.length, PIECES.length - 1);
});

test('colour helpers', () => {
  assert.equal(shade('#808080', 1), '#ffffff');
  assert.equal(shade('#808080', -1), '#000000');
  assert.equal(shade('#204060', 0), '#204060');
  assert.ok(luminance('#ffffff') > 0.99 && luminance('#000000') < 0.01);
});

test('default 3D layout respects the limits and the floor', () => {
  const l = defaultLayout3d();
  for (const p of PIECES) {
    const it = l[p.id];
    const lim = LIMITS[p.kind];
    assert.ok(it.d >= lim.d[0] && it.d <= lim.d[1], `${p.id} size`);
    if (lim.h) assert.ok(it.h >= lim.h[0] && it.h <= lim.h[1], `${p.id} height`);
    assert.ok(it.x >= AREA.x[0] && it.x <= AREA.x[1] && it.z >= AREA.z[0] && it.z <= AREA.z[1], `${p.id} position`);
  }
  assert.equal(l.kick.h, heightOf('kick', l.kick), 'the kick rests on the floor');
  // cymbals hang above the drums they sit near
  assert.ok(l.crash1.h > l.tom1.h && l.ride.h > l.floorTom.h);
});

test('mergeLayout3d clamps saved values and keeps the kick on the floor', () => {
  const m = mergeLayout3d({ snare: { x: 9, z: -9, h: 3, d: 0.01 }, kick: { d: 0.6, h: 2 }, bogus: { x: 1 }, tom1: 'x' });
  assert.equal(m.snare.x, AREA.x[1]);
  assert.equal(m.snare.z, AREA.z[0]);
  assert.equal(m.snare.h, LIMITS.drum.h[1]);
  assert.equal(m.snare.d, LIMITS.drum.d[0]);
  assert.equal(m.kick.d, 0.6);
  assert.equal(m.kick.h, 0.6 / 2 + 0.015);
  assert.deepEqual(m.tom1, defaultLayout3d().tom1);
  assert.ok(!('bogus' in m));
  const item = { x: 0, z: 0, h: 0.5, d: 0.5 };
  clamp3d('hihatPedal', item);
  assert.equal(item.d, LIMITS.pedal.d[0]);
});
