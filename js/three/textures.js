// Procedural textures painted on 2D canvases: wood grain, sparkle and pearl
// wraps, drum heads, lathed cymbals, the bass drum logo, rug and floors.
// Everything is generated, so the 3D kit ships no image files.

import * as THREE from '../../vendor/three.module.min.js';
import { createRng } from '../audio/dsp.js';
import { hexToRgb, shade, luminance } from '../kit/looks.js';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { color = true, repeat = null, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.flipY = flipY;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

// colour-dependent wraps are kept in a small LRU so dragging the colour
// picker cannot pile up textures in GPU memory
const WRAP_LIMIT = 10;
const wrapKeys = [];

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  if (/^(wood|sparkle|pearl):/.test(key)) {
    const i = wrapKeys.indexOf(key);
    if (i >= 0) wrapKeys.splice(i, 1);
    wrapKeys.push(key);
    while (wrapKeys.length > WRAP_LIMIT) {
      const old = wrapKeys.shift();
      const v = cache.get(old);
      cache.delete(old);
      // a texture still in use is simply uploaded again by three.js
      for (const t of v.isTexture ? [v] : Object.values(v)) t.dispose();
    }
  }
  return cache.get(key);
}

/** Paint every pixel with fn(x, y) -> [r, g, b]. */
function paint(c, fn) {
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const [r, g, b] = fn(x, y);
      d[i++] = r;
      d[i++] = g;
      d[i++] = b;
      d[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// ------------------------------------------------------------ shell wraps

/** Wood veneer: grain runs around the shell (u), rings vary along its height (v). */
export function woodTexture(color) {
  return cached(`wood:${color}`, () => {
    const c = canvas(1024, 512);
    const [r, g, b] = hexToRgb(color);
    const rng = createRng(17);
    const jitter = new Float32Array(1024).map(() => rng());
    paint(c, (x, y) => {
      const w = y + 7 * Math.sin(x * 0.011 + y * 0.003) + 3 * Math.sin(x * 0.029 + 1.7) + 1.5 * Math.sin(x * 0.07);
      const grain = 0.5 + 0.5 * Math.sin(w * 0.42 + 2.2 * Math.sin(w * 0.05));
      const band = 0.5 + 0.5 * Math.sin(w * 0.047 + 0.8);
      const fleck = jitter[(x * 7 + y * 13) & 1023];
      const k = 0.72 + 0.16 * grain + 0.14 * band + 0.05 * fleck;
      return [clamp255(r * k), clamp255(g * k), clamp255(b * k)];
    });
    return toTexture(c);
  });
}

/** Metal-flake sparkle: base colour with thousands of bright and dark flakes. */
export function sparkleTextures(color) {
  return cached(`sparkle:${color}`, () => {
    const map = canvas(512, 512);
    const rough = canvas(512, 512);
    const m = map.getContext('2d');
    const r = rough.getContext('2d');
    m.fillStyle = shade(color, -0.12);
    m.fillRect(0, 0, 512, 512);
    r.fillStyle = '#7a7a7a';
    r.fillRect(0, 0, 512, 512);
    const rng = createRng(29);
    // a few flake shades, each drawn in one batch (much faster than per-flake styles)
    const shades = [0.3, 0.45, 0.6, 0.75, -0.25, -0.4, -0.55].map((a) => shade(color, a));
    r.fillStyle = '#141414';
    for (let k = 0; k < shades.length; k++) {
      m.fillStyle = shades[k];
      const bright = k < 4;
      for (let i = 0; i < 2000; i++) {
        const x = rng() * 512;
        const y = rng() * 512;
        const s = 1 + rng() * 1.6;
        m.fillRect(x, y, s, s);
        if (bright) r.fillRect(x, y, s, s);
      }
    }
    return { map: toTexture(map), roughness: toTexture(rough, { color: false }) };
  });
}

/** Marbled pearl wrap (white marine pearl and friends). */
export function pearlTexture(color) {
  return cached(`pearl:${color}`, () => {
    const c = canvas(512, 512);
    const [r, g, b] = hexToRgb(color);
    const light = luminance(color) > 0.5;
    paint(c, (x, y) => {
      const u = x / 512;
      const v = y / 512;
      const n =
        Math.sin(u * 19 + Math.sin(v * 13 + Math.sin(u * 7) * 2) * 2.4) +
        0.6 * Math.sin(v * 31 + Math.sin(u * 23) * 1.8) +
        0.35 * Math.sin((u + v) * 57 + Math.sin(v * 9) * 3);
      const k = (light ? 0.86 : 0.75) + 0.09 * n;
      const tint = 6 * Math.sin(n * 2.1);
      return [clamp255(r * k + tint), clamp255(g * k), clamp255(b * k - tint)];
    });
    return toTexture(c);
  });
}

// ------------------------------------------------------------------ heads

/** Drum head on a disc (CircleGeometry UVs map the disc onto the square). */
export function headTexture(kind) {
  return cached(`head:${kind}`, () => {
    const S = 512;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const rng = createRng(kind.length * 97);
    const base = { coated: '#e6dfd1', clear: '#d9dad3', black: '#1b1b1d', mesh: '#2b2d31' }[kind];
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    if (kind === 'mesh') {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      for (let i = 0; i < S; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, S);
        ctx.moveTo(0, i);
        ctx.lineTo(S, i);
        ctx.stroke();
      }
    } else {
      // coating grain
      for (let i = 0; i < 9000; i++) {
        const a = rng() * 0.06;
        ctx.fillStyle = kind === 'black' ? `rgba(255,255,255,${a * 0.5})` : `rgba(80,64,40,${a})`;
        ctx.fillRect(rng() * S, rng() * S, 2, 2);
      }
      // stick wear in the playing area
      const g = ctx.createRadialGradient(S * 0.52, S * 0.47, 0, S * 0.52, S * 0.47, S * 0.24);
      g.addColorStop(0, kind === 'black' ? 'rgba(255,255,255,0.08)' : 'rgba(110,90,60,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    // collar ring near the edge
    ctx.strokeStyle = kind === 'black' || kind === 'mesh' ? 'rgba(255,255,255,0.08)' : 'rgba(60,48,30,0.18)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2);
    ctx.stroke();
    return toTexture(c);
  });
}

/** Front bass drum head with the logo. */
export function logoTexture(text, heads, glow) {
  return cached(`logo:${text}:${heads}:${glow}:${document.fonts?.status}`, () => {
    const S = 1024;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const dark = heads !== 'coated';
    ctx.fillStyle = dark ? '#151517' : '#f0ebe0';
    ctx.fillRect(0, 0, S, S);
    const ink = dark ? '#f3e9dc' : '#1b1714';
    const accent = glow || '#f3a63b';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = text || ' ';
    let size = 210;
    ctx.font = `800 ${size}px 'Big Shoulders Display', 'Arial Narrow', Impact, sans-serif`;
    while (ctx.measureText(label).width > S * 0.66 && size > 40) {
      size -= 8;
      ctx.font = `800 ${size}px 'Big Shoulders Display', 'Arial Narrow', Impact, sans-serif`;
    }
    ctx.fillText(label, S / 2, S * 0.46);
    ctx.fillStyle = accent;
    ctx.fillRect(S * 0.3, S * 0.46 + size * 0.55, S * 0.4, 10);
    ctx.fillRect(S * 0.3, S * 0.46 - size * 0.62, S * 0.4, 10);
    // port hole
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(S * 0.68, S * 0.72, S * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 10;
    ctx.stroke();
    return toTexture(c);
  });
}

// ---------------------------------------------------------------- cymbals

const CYMBAL_TONES = {
  traditional: { base: '#c8a764', hi: '#f2e0ae', lo: '#8c6c34', rough: 0.32 },
  brilliant: { base: '#d8b86e', hi: '#fff0c8', lo: '#b38c44', rough: 0.17 },
  dark: { base: '#8b6a3c', hi: '#b8925a', lo: '#4e3a20', rough: 0.55 },
  black: { base: '#1c1c1e', hi: '#57575c', lo: '#0c0c0d', rough: 0.3 },
};

export function cymbalTone(finish) {
  return CYMBAL_TONES[finish] ?? CYMBAL_TONES.traditional;
}

/** Lathe grooves: LatheGeometry maps v from the bell (0) to the edge (1); canvas row 0 is v = 0. */
export function cymbalTextures(finish) {
  return cached(`cym:${finish}`, () => {
    const tone = cymbalTone(finish);
    const W = 256;
    const H = 1024;
    const map = canvas(W, H);
    const rough = canvas(W, H);
    const m = map.getContext('2d');
    const r = rough.getContext('2d');
    const rng = createRng(finish.length * 131);
    m.fillStyle = tone.base;
    m.fillRect(0, 0, W, H);
    r.fillStyle = `rgb(${tone.rough * 255},${tone.rough * 255},${tone.rough * 255})`;
    r.fillRect(0, 0, W, H);
    const bellEnd = H * 0.2;
    for (let y = bellEnd; y < H; y += 2 + Math.floor(rng() * 2)) {
      const t = rng();
      m.fillStyle = t > 0.5 ? tone.hi : tone.lo;
      m.globalAlpha = 0.25 + rng() * 0.3;
      m.fillRect(0, y, W, 1);
      const rv = Math.max(0, Math.min(1, tone.rough + (t > 0.5 ? -0.12 : 0.15)));
      r.fillStyle = `rgb(${rv * 255},${rv * 255},${rv * 255})`;
      r.fillRect(0, y, W, 1);
    }
    m.globalAlpha = 1;
    if (finish === 'dark') {
      // hammer marks
      for (let i = 0; i < 900; i++) {
        const x = rng() * W;
        const y = bellEnd + rng() * (H - bellEnd);
        m.fillStyle = rng() > 0.5 ? 'rgba(30,20,8,0.28)' : 'rgba(255,230,180,0.12)';
        m.beginPath();
        m.ellipse(x, y, 3 + rng() * 5, 2 + rng() * 4, 0, 0, Math.PI * 2);
        m.fill();
      }
    }
    // logo stamp, a small mark near the bell
    m.fillStyle = finish === 'black' ? 'rgba(230,200,140,0.5)' : 'rgba(40,24,6,0.45)';
    m.fillRect(W * 0.1, H * 0.34, W * 0.18, 12);
    m.fillRect(W * 0.1, H * 0.36, W * 0.12, 8);
    return { map: toTexture(map, { flipY: false }), roughness: toTexture(rough, { color: false, flipY: false }) };
  });
}

// ----------------------------------------------------------------- floors

/** A wool rug with border bands and a central medallion. */
export function rugTexture() {
  return cached('rug', () => {
    const W = 1024;
    const H = 768;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const rng = createRng(5);
    ctx.fillStyle = '#5a1f22';
    ctx.fillRect(0, 0, W, H);
    // field pattern
    ctx.strokeStyle = 'rgba(214,160,86,0.16)';
    ctx.lineWidth = 3;
    for (let i = -H; i < W; i += 46) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.moveTo(i + H, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }
    // medallion
    ctx.save();
    ctx.translate(W / 2, H / 2);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = ['#2c1a33', '#c8984f', '#3a1316', '#c8984f'][k];
      const s = 1 - k * 0.22;
      ctx.beginPath();
      for (let a = 0; a <= 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const rr = (a % 2 ? 120 : 160) * s;
        ctx.lineTo(Math.cos(ang) * rr * 1.25, Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // borders
    const band = (inset, w, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    };
    band(14, 28, '#2b1013');
    band(34, 8, '#c8984f');
    band(54, 26, '#1f2a3d');
    band(72, 6, '#c8984f');
    for (let x = 60; x < W - 60; x += 32) {
      ctx.fillStyle = '#c8984f';
      ctx.beginPath();
      ctx.arc(x, 54, 5, 0, Math.PI * 2);
      ctx.arc(x, H - 54, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // wool fuzz
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng() - 0.5) * 26;
      d[i] = clamp255(d[i] + n);
      d[i + 1] = clamp255(d[i + 1] + n);
      d[i + 2] = clamp255(d[i + 2] + n);
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

/** Floor boards for the studio, a painted stage deck for club and arena. */
export function floorTexture(stage) {
  return cached(`floor:${stage}`, () => {
    const S = 1024;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const rng = createRng(stage.length * 7);
    const palette = {
      studio: ['#4a3220', '#55392a', '#3f2a1b', '#5c4130'],
      club: ['#1c1714', '#211b17', '#181412', '#251e19'],
      arena: ['#141619', '#17191d', '#111316', '#1a1c20'],
    }[stage];
    // paint the seams first so no pixel is left transparent
    ctx.fillStyle = { studio: '#3a2616', club: '#0c0908', arena: '#08090b' }[stage];
    ctx.fillRect(0, 0, S, S);
    const plank = S / 8;
    for (let i = 0; i < 8; i++) {
      let y = -rng() * 400;
      while (y < S) {
        const len = 260 + rng() * 380;
        ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
        ctx.fillRect(i * plank, y, plank - 3, len - 3);
        // grain streaks
        ctx.globalAlpha = stage === 'studio' ? 0.18 : 0.08;
        for (let k = 0; k < 10; k++) {
          ctx.fillStyle = rng() > 0.5 ? '#000' : '#fff';
          ctx.fillRect(i * plank + rng() * plank, y, 1.5, len - 3);
        }
        ctx.globalAlpha = 1;
        y += len;
      }
    }
    if (stage !== 'studio') {
      // gaffer tape marks and scuffs
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.015 + rng() * 0.025})`;
        ctx.fillRect(rng() * S, rng() * S, 20 + rng() * 120, 2 + rng() * 4);
      }
    }
    return toTexture(c, { repeat: [6, 6] });
  });
}

/** Soft radial gradient used for light beams and glows. */
export function glowTexture() {
  return cached('glow', () => {
    const c = canvas(128, 128);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return toTexture(c);
  });
}

/** Vertical fade for light beam cones (bright at the top). */
export function beamTexture() {
  return cached('beam', () => {
    const c = canvas(4, 256);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    return toTexture(c);
  });
}

/** Forget cached logo textures (fonts finished loading, or the text changed). */
export function dropLogoTextures() {
  for (const k of [...cache.keys()]) {
    if (k.startsWith('logo:')) {
      cache.get(k).dispose();
      cache.delete(k);
    }
  }
}
