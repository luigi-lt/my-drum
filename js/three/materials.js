// PBR materials for a look: shell finishes, heads, hardware, cymbals.
// Materials are shared by every piece with the same finish, so a full kit
// stays at a handful of shader programs.

import * as THREE from '../../vendor/three.module.min.js';
import { shellFor, cymbalFor } from '../kit/looks.js';
import { woodTexture, sparkleTextures, pearlTexture, headTexture, logoTexture, cymbalTextures } from './textures.js';

function shellMaterial(finish, color) {
  switch (finish) {
    case 'sparkle': {
      const t = sparkleTextures(color);
      t.map.wrapS = t.roughness.wrapS = THREE.RepeatWrapping;
      t.map.repeat.set(3, 1);
      t.roughness.repeat.set(3, 1);
      return new THREE.MeshPhysicalMaterial({
        map: t.map,
        roughnessMap: t.roughness,
        roughness: 0.9,
        metalness: 0.55,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
      });
    }
    case 'wood':
      return new THREE.MeshPhysicalMaterial({ map: woodTexture(color), roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'pearl':
      return new THREE.MeshPhysicalMaterial({
        map: pearlTexture(color),
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        iridescence: 0.55,
        iridescenceIOR: 1.35,
      });
    case 'metallic':
      return new THREE.MeshPhysicalMaterial({ color, metalness: 0.85, roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    case 'satin':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08 });
    default:
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 });
  }
}

function headMaterial(kind) {
  const map = headTexture(kind);
  if (kind === 'clear') {
    return new THREE.MeshPhysicalMaterial({ map, roughness: 0.16, transparent: true, opacity: 0.5, depthWrite: false });
  }
  return new THREE.MeshStandardMaterial({
    map,
    color: kind === 'coated' ? 0xdad4c8 : 0xffffff,
    roughness: kind === 'black' ? 0.5 : kind === 'mesh' ? 0.95 : 0.82,
  });
}

const HARDWARE = {
  chrome: { color: 0xeceff2, metalness: 1, roughness: 0.12 },
  black: { color: 0x2b2d31, metalness: 0.9, roughness: 0.3 },
  gold: { color: 0xdcad4a, metalness: 1, roughness: 0.18 },
};

function cymbalMaterial(finish) {
  const t = cymbalTextures(finish);
  return new THREE.MeshStandardMaterial({
    map: t.map,
    roughnessMap: t.roughness,
    roughness: 1,
    metalness: finish === 'black' ? 0.75 : 1,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  });
}

/** Everything the part builders need for one look. Call dispose() when replaced. */
export function createMaterials(look) {
  const shells = new Map();
  const cymbals = new Map();
  const all = [];
  const keep = (m) => {
    all.push(m);
    return m;
  };
  const mats = {
    look,
    hardware: keep(new THREE.MeshStandardMaterial(HARDWARE[look.hardware] ?? HARDWARE.chrome)),
    head: keep(headMaterial(look.heads)),
    reso: keep(new THREE.MeshStandardMaterial({ map: logoTexture(look.logo, look.heads, look.glow), roughness: 0.6 })),
    inner: keep(new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.85, side: THREE.BackSide })),
    bottomHead: keep(new THREE.MeshStandardMaterial({ color: 0xd6d0c4, roughness: 0.7, side: THREE.DoubleSide })),
    felt: keep(new THREE.MeshStandardMaterial({ color: 0x4a2a24, roughness: 1 })),
    rubber: keep(new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 })),
    beater: keep(new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.95 })),
    glow: look.glow ? keep(new THREE.MeshBasicMaterial({ color: look.glow, toneMapped: false })) : null,
    shell(pieceId) {
      const { finish, color } = shellFor(look, pieceId);
      const key = `${finish}:${color}`;
      if (!shells.has(key)) shells.set(key, keep(shellMaterial(finish, color)));
      return shells.get(key);
    },
    cymbal(pieceId) {
      const finish = cymbalFor(look, pieceId);
      if (!cymbals.has(finish)) cymbals.set(finish, keep(cymbalMaterial(finish)));
      return cymbals.get(finish);
    },
    dispose() {
      for (const m of all) m.dispose();
    },
  };
  return mats;
}
