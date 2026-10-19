// Where each piece stands in the 3D room, in metres. The drummer sits at
// the origin's +Z side facing -Z; x grows to the drummer's right, h is the
// height of the playing surface and d its diameter.

import { PIECES, PIECE_BY_ID } from './pieces.js';

export const THRONE = { x: 0, y: 0.55, z: 0.42 };

const DEFAULTS = {
  kick: { x: 0, z: -0.6, d: 0.56 },
  hihatPedal: { x: -0.48, z: 0.04, d: 0.13 },
  snare: { x: -0.24, z: -0.14, h: 0.64, d: 0.36 },
  hihatClosed: { x: -0.6, z: -0.22, h: 0.86, d: 0.36 },
  hihatOpen: { x: -0.52, z: -0.6, h: 1.0, d: 0.3 },
  tom1: { x: -0.15, z: -0.48, h: 0.84, d: 0.25 },
  tom2: { x: 0.16, z: -0.5, h: 0.84, d: 0.3 },
  tom3: { x: 0.45, z: -0.36, h: 0.74, d: 0.33 },
  floorTom: { x: 0.48, z: -0.02, h: 0.56, d: 0.41 },
  crash1: { x: -0.44, z: -0.78, h: 1.22, d: 0.43 },
  splash: { x: 0.0, z: -0.86, h: 1.12, d: 0.25 },
  crash2: { x: 0.42, z: -0.86, h: 1.26, d: 0.46 },
  china: { x: 0.88, z: -0.62, h: 1.3, d: 0.45 },
  ride: { x: 0.82, z: -0.22, h: 1.0, d: 0.53 },
};

// size and height ranges per kind of piece
export const LIMITS = {
  drum: { d: [0.2, 0.56], h: [0.4, 1.15] },
  kick: { d: [0.4, 0.66], h: null },
  cymbal: { d: [0.2, 0.62], h: [0.75, 1.7] },
  hihat: { d: [0.28, 0.42], h: [0.7, 1.3] },
  pedal: { d: [0.13, 0.13], h: null },
};

export const AREA = { x: [-1.3, 1.3], z: [-1.3, 0.25] };

/** Height of the playing surface; kicks rest on the floor and pedals sit on it. */
export function heightOf(id, item) {
  const kind = PIECE_BY_ID[id].kind;
  if (kind === 'kick') return item.d / 2 + 0.015;
  if (kind === 'pedal') return 0.02;
  return item.h;
}

export function defaultLayout3d() {
  const out = {};
  for (const p of PIECES) {
    const d = DEFAULTS[p.id];
    out[p.id] = { x: d.x, z: d.z, h: d.h ?? 0, d: d.d };
    out[p.id].h = heightOf(p.id, out[p.id]);
  }
  return out;
}

export function clamp3d(id, item) {
  const lim = LIMITS[PIECE_BY_ID[id].kind];
  const c = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
  item.x = c(item.x, AREA.x);
  item.z = c(item.z, AREA.z);
  item.d = c(item.d, lim.d);
  item.h = lim.h ? c(item.h, lim.h) : heightOf(id, item);
  return item;
}

/** Merge a saved layout onto the defaults, ignoring junk. */
export function mergeLayout3d(saved) {
  const base = defaultLayout3d();
  if (!saved || typeof saved !== 'object') return base;
  for (const id of Object.keys(base)) {
    const s = saved[id];
    if (!s || typeof s !== 'object') continue;
    for (const k of ['x', 'z', 'h', 'd']) if (Number.isFinite(s[k])) base[id][k] = s[k];
    clamp3d(id, base[id]);
  }
  return base;
}

/** World position of a piece's playing surface (mirrored for left-handed players). */
export function worldPosition(item, mirror = false) {
  return { x: mirror ? -item.x : item.x, y: item.h, z: item.z };
}
