// Kit layout in design units (a 1600 x 900 stage seen from the drum throne),
// plus projection onto the real stage size and circular hit testing.

import { PIECES, PIECE_BY_ID } from './pieces.js';

export const STAGE_W = 1600;
export const STAGE_H = 900;
export const MIN_SIZE = 90;
export const MAX_SIZE = 520;

const DEFAULTS = {
  crash1: { x: 360, y: 165, d: 330 },
  splash: { x: 650, y: 92, d: 190 },
  crash2: { x: 1170, y: 135, d: 320 },
  china: { x: 1490, y: 118, d: 250 },
  ride: { x: 1440, y: 470, d: 360 },
  hihatOpen: { x: 140, y: 300, d: 210 },
  hihatClosed: { x: 175, y: 565, d: 270 },
  tom1: { x: 640, y: 330, d: 230 },
  tom2: { x: 900, y: 310, d: 240 },
  tom3: { x: 1130, y: 420, d: 250 },
  floorTom: { x: 1180, y: 715, d: 330 },
  snare: { x: 520, y: 650, d: 310 },
  kick: { x: 850, y: 785, d: 400 },
  hihatPedal: { x: 300, y: 805, d: 160 },
};

export function defaultLayout() {
  const out = {};
  for (const p of PIECES) out[p.id] = { ...DEFAULTS[p.id], hidden: false };
  return out;
}

/** Merge a saved (possibly partial or outdated) layout onto the defaults. */
export function mergeLayout(saved) {
  const base = defaultLayout();
  if (!saved || typeof saved !== 'object') return base;
  for (const id of Object.keys(base)) {
    const s = saved[id];
    if (!s) continue;
    const item = base[id];
    if (Number.isFinite(s.x)) item.x = s.x;
    if (Number.isFinite(s.y)) item.y = s.y;
    if (Number.isFinite(s.d)) item.d = s.d;
    if (typeof s.hidden === 'boolean') item.hidden = s.hidden;
    clampItem(item);
  }
  return base;
}

export function clampItem(item) {
  item.d = Math.min(MAX_SIZE, Math.max(MIN_SIZE, item.d));
  item.x = Math.min(STAGE_W, Math.max(0, item.x));
  item.y = Math.min(STAGE_H, Math.max(0, item.y));
  return item;
}

/**
 * How design units map onto a stage of vw x vh virtual pixels (vw >= 1600,
 * vh >= 900). Extra room spreads the kit out, up to `maxSpread`, and any
 * space left over centres it.
 */
export function stageFrame(vw, vh, maxSpread = 1.35) {
  const kx = Math.min(vw / STAGE_W, maxSpread);
  const ky = Math.min(vh / STAGE_H, maxSpread);
  return { kx, ky, ox: (vw - STAGE_W * kx) / 2, oy: (vh - STAGE_H * ky) / 2 };
}

/** Place the layout on the stage. Mirroring swaps sides for left-handed players. */
export function projectLayout(layout, vw, vh, mirror = false) {
  const { kx, ky, ox, oy } = stageFrame(vw, vh);
  return PIECES.filter((p) => !layout[p.id].hidden).map((p) => {
    const l = layout[p.id];
    const dx = mirror ? STAGE_W - l.x : l.x;
    return { id: p.id, piece: p, x: ox + dx * kx, y: oy + l.y * ky, r: l.d / 2 };
  });
}

/** Convert a virtual stage point back to design units (inverse of projectLayout). */
export function toDesign(x, y, vw, vh, mirror = false) {
  const { kx, ky, ox, oy } = stageFrame(vw, vh);
  const dx = (x - ox) / kx;
  return { x: mirror ? STAGE_W - dx : dx, y: (y - oy) / ky };
}

/**
 * Find the piece under a point. Higher z wins; ties go to the closest centre.
 * Returns { id, sound, dist } (dist = distance / radius) or null.
 */
export function hitTest(items, x, y, zones = true) {
  let best = null;
  for (const it of items) {
    const dist = Math.hypot(x - it.x, y - it.y) / it.r;
    if (dist > 1) continue;
    const z = it.piece.z;
    if (!best || z > best.z || (z === best.z && dist < best.dist)) best = { it, z, dist };
  }
  if (!best) return null;
  const piece = best.it.piece;
  let sound = piece.sound;
  if (zones && piece.zones) {
    if (piece.zones.inner && best.dist <= piece.zones.inner.radius) sound = piece.zones.inner.sound;
    if (piece.zones.outer && best.dist >= piece.zones.outer.radius) sound = piece.zones.outer.sound;
  }
  return { id: piece.id, sound, dist: best.dist };
}

export function pieceName(id) {
  return PIECE_BY_ID[id]?.name ?? id;
}
