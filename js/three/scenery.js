// The room around the kit: floor, rug or riser, backdrop, lights, light
// beams and a reflection environment for chrome, lacquer and bronze.

import * as THREE from '../../vendor/three.module.min.js';
import { floorTexture, rugTexture, beamTexture } from './textures.js';

const STAGE = {
  club: {
    background: 0x140e0b,
    fog: [0x140e0b, 3.5, 11],
    floor: 'club',
    rug: true,
    backdrop: 0x2a0d10,
    hemi: [0xfff3e6, 0x1c1714, 0.6],
    key: [0xfff3e8, 22],
    rims: [
      [0xffb070, 12, [-2.4, 2.6, -1.8]],
      [0xffc890, 10, [2.4, 2.4, -1.6]],
    ],
    env: { ambient: 0x161412, panels: [0xfff4ea, 0xffdcc0, 0xffe8d2] },
    beams: [],
  },
  studio: {
    background: 0x2b2723,
    fog: [0x2b2723, 5, 14],
    floor: 'studio',
    rug: true,
    backdrop: 0x4a443d,
    hemi: [0xfff6ea, 0x3a3027, 0.85],
    key: [0xfff6ec, 22],
    rims: [
      [0xdfe8ff, 16, [-2.6, 2.4, -1.4]],
      [0xfff0d8, 14, [2.6, 2.4, -1.2]],
    ],
    env: { ambient: 0x4a443d, panels: [0xffffff, 0xf3f6ff, 0xfff1dc] },
    beams: [],
  },
  arena: {
    background: 0x05060b,
    fog: [0x05060b, 4, 13],
    floor: 'arena',
    rug: false,
    backdrop: 0x07080e,
    hemi: [0xb8c6ff, 0x0b0c14, 0.4],
    key: [0xffffff, 26],
    rims: [
      [0xff3fa4, 30, [-2.2, 3.0, -1.6]],
      [0x2ee6d6, 30, [2.2, 3.0, -1.6]],
      [0x4d7cff, 18, [0, 3.2, -2.4]],
    ],
    env: { ambient: 0x0b0c14, panels: [0xffffff, 0xff8cc8, 0x8cf0e6] },
    beams: [
      [0xff3fa4, [-1.8, 4.2, -2.4], [-0.6, 0, -0.6]],
      [0x2ee6d6, [1.8, 4.2, -2.4], [0.7, 0, -0.5]],
      [0x4d7cff, [0, 4.6, -3.0], [0.1, 0, -0.4]],
      [0xffffff, [-0.9, 4.4, -2.8], [0.9, 0, 0.2]],
    ],
  },
};

export const KIT_CENTER = new THREE.Vector3(0.1, 0.6, -0.4);

/** Reflection environment: a dark room with glowing softboxes, pre-filtered for PBR. */
function environmentMap(renderer, env) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: env.ambient, side: THREE.BackSide }));
  scene.add(room);
  const panel = (color, strength, size, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.material.color.multiplyScalar(strength);
    m.position.set(...pos);
    m.lookAt(0, 0.8, 0);
    scene.add(m);
  };
  panel(env.panels[0], 6, [3.5, 1.6], [0, 3.6, 1.2]);
  panel(env.panels[1], 8, [1.2, 3.2], [-4.5, 2, -1]);
  panel(env.panels[2], 8, [1.2, 3.2], [4.5, 2, -1]);
  panel(env.panels[0], 5, [5, 0.5], [0, 1.4, -5.5]);
  panel(env.panels[0], 6, [0.6, 0.6], [2.5, 3.5, 3]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return rt;
}

function lightBeam(color, from, to) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(0.04, 0.55, len, 24, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: beamTexture(),
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
  return m;
}

/**
 * Build the scenery for a stage style into `scene`.
 * Returns { group, dispose(), keyLight } so the caller can tune shadows.
 */
export function buildScenery(scene, renderer, stageId, { shadows = true, shadowSize = 1024, glow = '' } = {}) {
  const s = STAGE[stageId] ?? STAGE.club;
  const group = new THREE.Group();

  scene.background = new THREE.Color(s.background);
  scene.fog = new THREE.Fog(...s.fog);
  const envRT = environmentMap(renderer, s.env);
  scene.environment = envRT.texture;

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ map: floorTexture(s.floor), roughness: s.floor === 'studio' ? 0.55 : 0.8, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  if (s.rug) {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.0), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.1, 0.004, -0.35);
    rug.receiveShadow = true;
    group.add(rug);
  } else {
    // a riser with a lit front edge
    const riser = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.02, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6, metalness: 0.2 }),
    );
    riser.position.set(0.1, -0.008, -0.4);
    riser.receiveShadow = true;
    group.add(riser);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.012, 0.012),
      new THREE.MeshBasicMaterial({ color: glow || 0x4d7cff, toneMapped: false }),
    );
    strip.position.set(0.1, 0.004, 0.8);
    group.add(strip);
  }

  // backdrop curtain / wall
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: s.backdrop, roughness: 0.95 }));
  back.position.set(0, 3, -3.4);
  back.receiveShadow = true;
  group.add(back);

  // lights
  const hemi = new THREE.HemisphereLight(...s.hemi);
  group.add(hemi);
  const key = new THREE.SpotLight(s.key[0], s.key[1], 0, 0.62, 0.65, 2);
  key.position.set(0.2, 3.4, 1.4);
  key.target.position.copy(KIT_CENTER);
  key.castShadow = shadows;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 7;
  group.add(key, key.target);
  for (const [color, intensity, pos] of s.rims) {
    const l = new THREE.SpotLight(color, intensity, 0, 0.8, 0.8, 2);
    l.position.set(...pos);
    l.target.position.copy(KIT_CENTER);
    group.add(l, l.target);
  }
  for (const [color, from, to] of s.beams) group.add(lightBeam(color, from, to));

  scene.add(group);
  return {
    group,
    keyLight: key,
    dispose() {
      scene.remove(group);
      // textures are shared through the texture cache, so only geometry, materials and shadows go
      group.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
        if (o.isLight) o.dispose?.();
      });
      envRT.dispose();
      scene.environment = null;
    },
  };
}
