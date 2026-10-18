// How the kit looks: skins (ready-made styles), shell finishes and colours,
// hardware, drum heads, cymbal finishes, rim glow and the stage. A look can
// also repaint single pieces. Pure data and helpers, shared by both views.

import { PIECES, PIECE_BY_ID } from './pieces.js';

export const SHELL_FINISHES = [
  { id: 'gloss', name: 'Gloss' },
  { id: 'sparkle', name: 'Sparkle' },
  { id: 'wood', name: 'Wood grain' },
  { id: 'pearl', name: 'Pearl' },
  { id: 'metallic', name: 'Metallic' },
  { id: 'satin', name: 'Satin' },
];

export const SHELL_COLORS = [
  { id: '#c0141f', name: 'Red' },
  { id: '#e0571b', name: 'Orange' },
  { id: '#e8b021', name: 'Yellow' },
  { id: '#1f8a4c', name: 'Green' },
  { id: '#13472e', name: 'Racing green' },
  { id: '#2ec4b6', name: 'Teal' },
  { id: '#1f5fd0', name: 'Blue' },
  { id: '#0f2350', name: 'Navy' },
  { id: '#6d34b8', name: 'Purple' },
  { id: '#d63a8b', name: 'Pink' },
  { id: '#c98a4b', name: 'Maple' },
  { id: '#6b3a1e', name: 'Walnut' },
  { id: '#d4af37', name: 'Gold' },
  { id: '#9aa0a8', name: 'Silver' },
  { id: '#f2efe8', name: 'White' },
  { id: '#111214', name: 'Black' },
];

export const HARDWARE = [
  { id: 'chrome', name: 'Chrome' },
  { id: 'black', name: 'Black nickel' },
  { id: 'gold', name: 'Gold' },
];

export const HEADS = [
  { id: 'coated', name: 'Coated' },
  { id: 'clear', name: 'Clear' },
  { id: 'black', name: 'Black' },
  { id: 'mesh', name: 'Mesh' },
];

export const CYMBAL_FINISHES = [
  { id: 'traditional', name: 'Traditional' },
  { id: 'brilliant', name: 'Brilliant' },
  { id: 'dark', name: 'Dark raw' },
  { id: 'black', name: 'Black' },
];

export const GLOWS = [
  { id: '', name: 'Off' },
  { id: '#2ee6d6', name: 'Teal' },
  { id: '#ff3fa4', name: 'Pink' },
  { id: '#ffb02e', name: 'Amber' },
  { id: '#4d7cff', name: 'Blue' },
  { id: '#7dff5a', name: 'Lime' },
];

export const STAGES = [
  { id: 'club', name: 'Club' },
  { id: 'studio', name: 'Studio' },
  { id: 'arena', name: 'Arena' },
];

export const SKINS = [
  {
    id: 'classic-maple',
    name: 'Classic Maple',
    finish: 'wood',
    color: '#c98a4b',
    hardware: 'chrome',
    heads: 'coated',
    cymbals: 'traditional',
    glow: '',
    stage: 'club',
  },
  {
    id: 'red-sparkle',
    name: 'Red Sparkle',
    finish: 'sparkle',
    color: '#c0141f',
    hardware: 'chrome',
    heads: 'coated',
    cymbals: 'brilliant',
    glow: '',
    stage: 'arena',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    finish: 'gloss',
    color: '#111214',
    hardware: 'black',
    heads: 'black',
    cymbals: 'dark',
    glow: '',
    stage: 'arena',
  },
  {
    id: 'vintage-pearl',
    name: 'Vintage Pearl',
    finish: 'pearl',
    color: '#f2efe8',
    hardware: 'chrome',
    heads: 'coated',
    cymbals: 'dark',
    glow: '',
    stage: 'studio',
  },
  {
    id: 'ocean-sparkle',
    name: 'Ocean Sparkle',
    finish: 'sparkle',
    color: '#1f5fd0',
    hardware: 'chrome',
    heads: 'clear',
    cymbals: 'brilliant',
    glow: '',
    stage: 'club',
  },
  {
    id: 'gold-rush',
    name: 'Gold Rush',
    finish: 'metallic',
    color: '#d4af37',
    hardware: 'gold',
    heads: 'clear',
    cymbals: 'brilliant',
    glow: '',
    stage: 'arena',
  },
  {
    id: 'walnut',
    name: 'Walnut Studio',
    finish: 'wood',
    color: '#6b3a1e',
    hardware: 'black',
    heads: 'coated',
    cymbals: 'dark',
    glow: '',
    stage: 'studio',
  },
  {
    id: 'racing-green',
    name: 'Racing Green',
    finish: 'satin',
    color: '#13472e',
    hardware: 'chrome',
    heads: 'coated',
    cymbals: 'traditional',
    glow: '',
    stage: 'studio',
  },
  {
    id: 'purple-haze',
    name: 'Purple Haze',
    finish: 'metallic',
    color: '#6d34b8',
    hardware: 'black',
    heads: 'coated',
    cymbals: 'brilliant',
    glow: '#ff3fa4',
    stage: 'arena',
  },
  {
    id: 'neon',
    name: 'Neon Electronic',
    finish: 'satin',
    color: '#1b1d22',
    hardware: 'black',
    heads: 'mesh',
    cymbals: 'black',
    glow: '#2ee6d6',
    stage: 'arena',
  },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

const STYLE_KEYS = ['finish', 'color', 'hardware', 'heads', 'cymbals', 'glow', 'stage'];

export const DEFAULT_LOOK = Object.freeze(lookFromSkin('classic-maple'));

/** A fresh look from a skin, keeping the bass drum logo text if given. */
export function lookFromSkin(skinId, logo = 'MyDrum') {
  const skin = SKIN_BY_ID[skinId] ?? SKINS[0];
  const look = { skin: skin.id, pieces: {}, logo };
  for (const k of STYLE_KEYS) look[k] = skin[k];
  return look;
}

const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const hasId = (list, id) => list.some((o) => o.id === id);

/** Validate a saved look; unknown or broken values fall back to the default. */
export function normalizeLook(saved) {
  const look = lookFromSkin(DEFAULT_LOOK.skin);
  if (!saved || typeof saved !== 'object') return look;
  if (SKIN_BY_ID[saved.skin]) look.skin = saved.skin;
  if (hasId(SHELL_FINISHES, saved.finish)) look.finish = saved.finish;
  if (isHex(saved.color)) look.color = saved.color.toLowerCase();
  if (hasId(HARDWARE, saved.hardware)) look.hardware = saved.hardware;
  if (hasId(HEADS, saved.heads)) look.heads = saved.heads;
  if (hasId(CYMBAL_FINISHES, saved.cymbals)) look.cymbals = saved.cymbals;
  if (saved.glow === '' || isHex(saved.glow)) look.glow = saved.glow;
  if (hasId(STAGES, saved.stage)) look.stage = saved.stage;
  if (typeof saved.logo === 'string') look.logo = saved.logo.slice(0, 14);
  if (saved.pieces && typeof saved.pieces === 'object') {
    for (const [id, p] of Object.entries(saved.pieces)) {
      if (!PIECE_BY_ID[id] || !p || typeof p !== 'object') continue;
      const out = {};
      if (isHex(p.color)) out.color = p.color.toLowerCase();
      if (hasId(SHELL_FINISHES, p.finish)) out.finish = p.finish;
      if (hasId(CYMBAL_FINISHES, p.cymbals)) out.cymbals = p.cymbals;
      if (Object.keys(out).length) look.pieces[id] = out;
    }
  }
  return look;
}

/** Whether a piece has a painted shell (drums) or a cymbal finish. */
export function pieceSurface(pieceId) {
  const kind = PIECE_BY_ID[pieceId]?.kind;
  if (kind === 'drum' || kind === 'kick') return 'shell';
  if (kind === 'cymbal' || kind === 'hihat') return 'cymbal';
  return null;
}

/** Shell finish and colour for a drum, after per-piece paint. */
export function shellFor(look, pieceId) {
  const p = look.pieces?.[pieceId];
  return { finish: p?.finish ?? look.finish, color: p?.color ?? look.color };
}

/** Cymbal finish for a cymbal or hi-hat, after per-piece paint. */
export function cymbalFor(look, pieceId) {
  return look.pieces?.[pieceId]?.cymbals ?? look.cymbals;
}

/** Paint one piece with the look's current shell or cymbal choice. */
export function paintPiece(look, pieceId) {
  const surface = pieceSurface(pieceId);
  if (!surface) return look;
  const pieces = { ...look.pieces };
  pieces[pieceId] = surface === 'shell' ? { finish: look.finish, color: look.color } : { cymbals: look.cymbals };
  return { ...look, pieces };
}

/** Does the look differ from its skin (so the UI can say "Custom")? */
export function isCustomized(look) {
  const skin = SKIN_BY_ID[look.skin];
  if (!skin) return true;
  return Object.keys(look.pieces ?? {}).length > 0 || STYLE_KEYS.some((k) => skin[k] !== look[k]);
}

// ------------------------------------------------------------ colour math

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const c = (v) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix a colour toward white (amount > 0) or black (amount < 0). */
export function shade(hex, amount) {
  const rgb = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  return rgbToHex(rgb.map((v) => v + (target - v) * a));
}

/** Relative luminance (0 dark .. 1 light), for choosing readable ink. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const DRUM_PIECES = PIECES.filter((p) => pieceSurface(p.id) === 'shell').map((p) => p.id);
export const CYMBAL_PIECES = PIECES.filter((p) => pieceSurface(p.id) === 'cymbal').map((p) => p.id);
