// Builds the 3D drum kit from the layout: shells with lugs and hoops,
// lathe-turned cymbals, stands, pedals and tom mounts. Every piece returns
// a frame for its playing surface (local +Y is the surface normal), hit
// proxies for tapping, and the moving parts used by the hit animations.

import * as THREE from '../../vendor/three.module.min.js';
import { PIECE_BY_ID } from '../kit/pieces.js';
import { THRONE, worldPosition } from '../kit/layout3d.js';
import { glowTexture } from './textures.js';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

// how far each piece leans toward the drummer
const TILT = {
  snare: 6,
  tom1: 14,
  tom2: 14,
  tom3: 10,
  floorTom: 0,
  crash1: 14,
  crash2: 14,
  splash: 10,
  china: 8,
  ride: 9,
  hihatClosed: 0,
  hihatOpen: 4,
};

const CYMBAL_SHAPE = {
  crash1: 'crash',
  crash2: 'crash',
  splash: 'splash',
  ride: 'ride',
  china: 'china',
  hihatClosed: 'hat',
  hihatOpen: 'hat',
};

// ---------------------------------------------------------------- helpers

function mesh(geo, mat, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function matrix(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
}

/** Merge [geometry, matrix] pairs into one indexed geometry (position, normal, uv). */
export function mergeTransformed(list) {
  const geos = list.map(([g, m]) => {
    const c = g.clone();
    c.applyMatrix4(m);
    return c;
  });
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
      io += src.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** Geometry for a tube between two points. */
function tubeGeo(a, b, r, seg = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Three legs splayed from a pole down to the floor. */
function tripodParts(top, spread, parts) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const foot = new THREE.Vector3(Math.cos(a) * spread, 0.012, Math.sin(a) * spread);
    parts.push([tubeGeo(new THREE.Vector3(0, top, 0), foot, 0.0075), new THREE.Matrix4()]);
    parts.push([new THREE.SphereGeometry(0.014, 8, 6), matrix([foot.x, 0.012, foot.z])]);
  }
  parts.push([new THREE.CylinderGeometry(0.016, 0.016, 0.05, 12), matrix([0, top, 0])]);
}

/** Materials made for one kit build (not shared with the material set). */
function own(material) {
  material.userData.own = true;
  return material;
}

function invisible(geo) {
  return new THREE.Mesh(geo, own(new THREE.MeshBasicMaterial({ visible: false })));
}

function flashDisc(r) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 48),
    own(
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

function glowSprite(size) {
  const s = new THREE.Sprite(
    own(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0xffd7a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );
  s.scale.set(size, size, 1);
  s.renderOrder = 3;
  return s;
}

/** Rotation that turns a piece's local +Z toward the throne and leans it by `tilt`. */
function aim(obj, wx, wz, tiltDeg) {
  const yaw = Math.atan2(THRONE.x - wx, THRONE.z - wz);
  obj.rotation.set(tiltDeg * DEG, yaw, 0, 'YXZ');
}

// ------------------------------------------------------------------ drums

function drumShell(mats, pieceId, r, depth, lugs, { snare = false } = {}) {
  const g = new THREE.Group();
  const shellGeo = new THREE.CylinderGeometry(r, r, depth, 64, 1, true);
  const shell = mesh(shellGeo, mats.shell(pieceId), { receive: true });
  shell.position.y = -depth / 2;
  const inner = mesh(shellGeo, mats.inner, { cast: false });
  inner.position.y = -depth / 2;
  const head = mesh(new THREE.CircleGeometry(r * 0.99, 64), mats.head, { cast: false, receive: true });
  head.rotation.x = -Math.PI / 2;
  head.position.y = 0.002;
  const bottom = mesh(new THREE.CircleGeometry(r * 0.99, 40), mats.bottomHead, { cast: false });
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -depth;
  g.add(shell, inner, head, bottom);

  const tube = Math.max(0.0055, r * 0.028);
  const parts = [
    [new THREE.TorusGeometry(r + tube * 0.6, tube, 10, 72), matrix([0, 0.004, 0], [-Math.PI / 2, 0, 0])],
    [new THREE.TorusGeometry(r + tube * 0.6, tube, 10, 72), matrix([0, -depth, 0], [-Math.PI / 2, 0, 0])],
  ];
  const lugH = Math.min(depth * 0.45, 0.08);
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2 + Math.PI / lugs;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rot = [0, Math.PI / 2 - a, 0];
    parts.push([new THREE.BoxGeometry(0.016, lugH, 0.02), matrix([c * (r + 0.009), -depth / 2, s * (r + 0.009)], rot)]);
    // tension rods from the hoop claws down to the lug (top and bottom)
    const rodR = r + tube * 1.25;
    const top = new THREE.Vector3(c * rodR, 0.01, s * rodR);
    const lugTop = new THREE.Vector3(c * rodR, -depth / 2 + lugH / 2, s * rodR);
    parts.push([tubeGeo(top, lugTop, 0.0028, 6), new THREE.Matrix4()]);
    parts.push([new THREE.BoxGeometry(0.012, 0.012, 0.014), matrix([top.x, 0.008, top.z], rot)]);
    if (snare || depth > 0.3) {
      const bot = new THREE.Vector3(c * rodR, -depth - 0.006, s * rodR);
      const lugBot = new THREE.Vector3(c * rodR, -depth / 2 - lugH / 2, s * rodR);
      parts.push([tubeGeo(bot, lugBot, 0.0028, 6), new THREE.Matrix4()]);
    }
  }
  if (snare) {
    // throw-off and butt plate
    parts.push([new THREE.BoxGeometry(0.03, 0.05, 0.022), matrix([r + 0.012, -depth / 2, 0])]);
    parts.push([new THREE.BoxGeometry(0.022, 0.035, 0.018), matrix([-(r + 0.01), -depth / 2, 0])]);
  }
  const hw = mesh(mergeTransformed(parts), mats.hardware);
  g.add(hw);
  if (mats.glow) {
    const glowGeo = mergeTransformed([
      [new THREE.TorusGeometry(r + tube * 2.2, tube * 0.35, 6, 72), matrix([0, 0.004, 0], [-Math.PI / 2, 0, 0])],
      [new THREE.TorusGeometry(r + tube * 2.2, tube * 0.35, 6, 72), matrix([0, -depth, 0], [-Math.PI / 2, 0, 0])],
    ]);
    g.add(mesh(glowGeo, mats.glow, { cast: false }));
  }
  return { group: g, tube };
}

function buildDrum(id, item, ctx) {
  const { mats, mirror } = ctx;
  const p = worldPosition(item, mirror);
  const r = item.d / 2;
  const depth = id === 'snare' ? 0.14 : id === 'floorTom' ? item.d * 0.92 : item.d * 0.75;
  const lugs = id === 'snare' ? 10 : r > 0.17 ? 8 : 6;
  const root = new THREE.Group();
  root.position.set(p.x, 0, p.z);
  const body = new THREE.Group();
  body.position.y = p.y;
  aim(body, p.x, p.z, TILT[id] ?? 0);
  root.add(body);
  const { group, tube } = drumShell(mats, id, r, depth, lugs, { snare: id === 'snare' });
  body.add(group);

  body.updateMatrix();
  const bottom = new THREE.Vector3(0, -depth, 0).applyMatrix4(body.matrix);
  const parts = [];
  if (id === 'floorTom') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
      const bracket = new THREE.Vector3(Math.cos(a) * (r + 0.02), -depth * 0.35, Math.sin(a) * (r + 0.02)).applyMatrix4(body.matrix);
      const foot = new THREE.Vector3(Math.cos(a) * (r + 0.09), 0.015, Math.sin(a) * (r + 0.09)).applyEuler(
        new THREE.Euler(0, body.rotation.y, 0),
      );
      parts.push([tubeGeo(bracket, foot, 0.006), new THREE.Matrix4()]);
      parts.push([new THREE.SphereGeometry(0.014, 8, 6), matrix([foot.x, 0.014, foot.z])]);
    }
  } else if (!ctx.mountedOnKick?.has(id)) {
    // snare stand, or a floor stand for a tom placed away from the kick
    const poleTop = bottom.y - (id === 'snare' ? 0.025 : 0.04);
    parts.push([tubeGeo(new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(bottom.x, poleTop, bottom.z), 0.011), new THREE.Matrix4()]);
    tripodParts(0.3, 0.27, parts);
    if (id === 'snare') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const tip = new THREE.Vector3(Math.cos(a) * r * 0.8, -depth - 0.005, Math.sin(a) * r * 0.8).applyMatrix4(body.matrix);
        parts.push([tubeGeo(new THREE.Vector3(bottom.x, poleTop, bottom.z), tip, 0.006), new THREE.Matrix4()]);
      }
    }
  }
  if (parts.length) root.add(mesh(mergeTransformed(parts), mats.hardware));

  const flash = flashDisc(r * 0.98);
  flash.position.y = 0.004;
  body.add(flash);
  const proxy = invisible(new THREE.CylinderGeometry(r * 1.04, r * 1.04, depth + 0.02, 24));
  proxy.position.y = -depth / 2 + 0.01;
  body.add(proxy);

  return {
    id,
    kind: 'drum',
    root,
    body,
    radius: r,
    surfaceY: 0.006,
    proxies: [proxy],
    flash,
    labelLocal: new THREE.Vector3(0, 0.01, r + tube * 2),
    bottom,
  };
}

// -------------------------------------------------------------- bass drum

function buildKick(id, item, ctx) {
  const { mats, mirror } = ctx;
  const p = worldPosition(item, mirror);
  const r = item.d / 2;
  const depth = 0.42;
  const root = new THREE.Group();
  root.position.set(p.x, 0, p.z);
  // the drum's axis runs toward the drummer: batter head faces +Z
  const body = new THREE.Group();
  body.position.set(0, p.y, depth / 2);
  body.rotation.set(Math.PI / 2, 0, 0);
  root.add(body);

  const g = new THREE.Group();
  const shellGeo = new THREE.CylinderGeometry(r, r, depth, 72, 1, true);
  const shell = mesh(shellGeo, mats.shell(id), { receive: true });
  shell.position.y = -depth / 2;
  const inner = mesh(shellGeo, mats.inner, { cast: false });
  inner.position.y = -depth / 2;
  const batter = mesh(new THREE.CircleGeometry(r * 0.985, 72), mats.head, { cast: false });
  batter.rotation.x = -Math.PI / 2;
  batter.position.y = 0.004;
  const reso = mesh(new THREE.CircleGeometry(r * 0.985, 72), mats.reso, { cast: false });
  reso.rotation.x = Math.PI / 2;
  reso.rotation.z = Math.PI;
  reso.position.y = -depth - 0.004;
  g.add(shell, inner, batter, reso);
  // wooden hoops in the shell finish
  const hoopGeo = mergeTransformed([
    [new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.032, 72, 1, true), matrix([0, -0.006, 0])],
    [new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.032, 72, 1, true), matrix([0, -depth + 0.006, 0])],
  ]);
  const hoopMat = own(mats.shell(id).clone());
  hoopMat.side = THREE.DoubleSide;
  g.add(mesh(hoopGeo, hoopMat));
  const parts = [];
  const lugs = 10;
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2 + Math.PI / lugs;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rot = [0, Math.PI / 2 - a, 0];
    for (const y of [-depth * 0.22, -depth * 0.78])
      parts.push([new THREE.BoxGeometry(0.018, 0.06, 0.022), matrix([c * (r + 0.01), y, s * (r + 0.01)], rot)]);
    for (const [y0, y1] of [
      [0.0, -depth * 0.19],
      [-depth, -depth * 0.81],
    ]) {
      parts.push([
        tubeGeo(new THREE.Vector3(c * (r + 0.02), y0, s * (r + 0.02)), new THREE.Vector3(c * (r + 0.02), y1, s * (r + 0.02)), 0.0032, 6),
        new THREE.Matrix4(),
      ]);
    }
  }
  g.add(mesh(mergeTransformed(parts), mats.hardware));
  if (mats.glow) {
    g.add(
      mesh(
        mergeTransformed([
          [new THREE.TorusGeometry(r + 0.016, 0.0035, 6, 96), matrix([0, 0.012, 0], [-Math.PI / 2, 0, 0])],
          [new THREE.TorusGeometry(r + 0.016, 0.0035, 6, 96), matrix([0, -depth - 0.012, 0], [-Math.PI / 2, 0, 0])],
        ]),
        mats.glow,
        { cast: false },
      ),
    );
  }
  body.add(g);

  // spurs and the pedal (in the root's upright frame)
  const world = [];
  for (const sx of [-1, 1]) {
    const top = new THREE.Vector3(sx * r * 0.82, p.y - r * 0.45, -depth * 0.25);
    const foot = new THREE.Vector3(sx * (r + 0.1), 0.012, -depth * 0.55);
    world.push([tubeGeo(top, foot, 0.006), new THREE.Matrix4()]);
  }
  const headZ = depth / 2;
  const axleZ = headZ + 0.075;
  world.push([new THREE.BoxGeometry(0.13, 0.012, 0.03), matrix([0, 0.012, axleZ])]); // base plate
  for (const sx of [-1, 1]) world.push([new THREE.BoxGeometry(0.012, 0.13, 0.016), matrix([sx * 0.058, 0.075, axleZ])]);
  world.push([new THREE.CylinderGeometry(0.006, 0.006, 0.13, 8), matrix([0, 0.13, axleZ], [0, 0, Math.PI / 2])]);
  root.add(mesh(mergeTransformed(world), mats.hardware));

  const footboard = new THREE.Group();
  footboard.position.set(0, 0.022, axleZ + 0.27);
  const board = mesh(new THREE.BoxGeometry(0.085, 0.012, 0.25), mats.rubber);
  board.position.set(0, 0.02, -0.125);
  board.rotation.x = 0.12;
  footboard.add(board);
  root.add(footboard);

  // beater swings forward around the axle
  const beater = new THREE.Group();
  beater.position.set(0, 0.13, axleZ);
  const shaft = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8), mats.hardware);
  shaft.position.y = 0.1;
  const ball = mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.045, 16), mats.beater);
  ball.position.y = 0.195;
  ball.rotation.z = Math.PI / 2;
  beater.add(shaft, ball);
  beater.rotation.x = 0.55; // resting, leaned back toward the drummer
  root.add(beater);

  const flash = flashDisc(r * 0.97);
  flash.position.y = 0.008;
  body.add(flash);
  const proxy = invisible(new THREE.CylinderGeometry(r * 1.03, r * 1.03, depth, 24));
  proxy.position.y = -depth / 2;
  body.add(proxy);
  const pedalProxy = invisible(new THREE.BoxGeometry(0.2, 0.2, 0.42));
  pedalProxy.position.set(0, 0.1, axleZ + 0.12);
  root.add(pedalProxy);

  return {
    id,
    kind: 'kick',
    root,
    body,
    radius: r,
    surfaceY: 0.01,
    proxies: [proxy, pedalProxy],
    flash,
    beater,
    footboard,
    labelLocal: new THREE.Vector3(0, 0.02, r * 0.62),
    kickTop: new THREE.Vector3(p.x, p.y + r, p.z),
    depth,
  };
}

// ---------------------------------------------------------------- cymbals

function cymbalProfile(r, shape) {
  const bellR = { ride: 0.3, crash: 0.24, splash: 0.26, hat: 0.22, china: 0.27 }[shape] * r;
  const bellH = { ride: 0.14, crash: 0.1, splash: 0.085, hat: 0.075, china: 0.1 }[shape] * r;
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const rr = r * (0.025 + (0.975 * i) / N);
    let y;
    if (rr <= bellR) {
      const t = rr / bellR;
      y = shape === 'china' ? bellH * (t < 0.88 ? 1 : 1 - ((t - 0.88) / 0.12) * 0.62) : bellH * (1 - 0.55 * Math.pow(t, 3));
    } else {
      const t = (rr - bellR) / (r - bellR);
      if (shape === 'china') {
        y = bellH * 0.38 * Math.pow(1 - Math.min(t / 0.8, 1), 1.4);
        if (t > 0.8) y += r * 0.055 * Math.pow((t - 0.8) / 0.2, 1.6);
      } else {
        y = bellH * 0.45 * Math.pow(1 - t, 1.5);
      }
    }
    pts.push(new THREE.Vector2(rr, y));
  }
  return { pts, bellH, bellR };
}

function cymbalMesh(r, shape, mat) {
  const { pts, bellH } = cymbalProfile(r, shape);
  const m = mesh(new THREE.LatheGeometry(pts, 64), mat);
  return { mesh: m, bellH };
}

function buildCymbal(id, item, ctx) {
  const { mats, mirror } = ctx;
  const p = worldPosition(item, mirror);
  const r = item.d / 2;
  const shape = CYMBAL_SHAPE[id];
  const root = new THREE.Group();
  root.position.set(p.x, 0, p.z);
  const body = new THREE.Group();
  body.position.y = p.y;
  aim(body, p.x, p.z, TILT[id] ?? 10);
  root.add(body);
  const wobble = new THREE.Group();
  body.add(wobble);
  const { mesh: cym, bellH } = cymbalMesh(r, shape, mats.cymbal(id));
  wobble.add(cym);
  const nuts = mergeTransformed([
    [new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), matrix([0, bellH + 0.008, 0])],
    [new THREE.CylinderGeometry(0.004, 0.004, 0.06, 8), matrix([0, bellH, 0])],
  ]);
  wobble.add(mesh(nuts, mats.felt, { cast: false }));
  const wing = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.008), mats.hardware, { cast: false });
  wing.position.y = bellH + 0.022;
  wobble.add(wing);

  // straight stand with a tilter under the cymbal
  const parts = [];
  parts.push([tubeGeo(new THREE.Vector3(0, 0.36, 0), new THREE.Vector3(0, p.y - 0.035, 0), 0.0105), new THREE.Matrix4()]);
  parts.push([new THREE.SphereGeometry(0.017, 12, 8), matrix([0, p.y - 0.03, 0])]);
  tripodParts(0.36, 0.3, parts);
  root.add(mesh(mergeTransformed(parts), mats.hardware));

  const glow = glowSprite(r * 2.6);
  glow.position.y = bellH;
  wobble.add(glow);
  const proxy = invisible(new THREE.CylinderGeometry(r * 1.04, r * 1.04, bellH + 0.035, 24));
  proxy.position.y = bellH / 2;
  body.add(proxy);

  return {
    id,
    kind: 'cymbal',
    root,
    body,
    wobble,
    radius: r,
    surfaceY: bellH * 0.5,
    proxies: [proxy],
    glow,
    labelLocal: new THREE.Vector3(0, 0, r * 0.98),
  };
}

function buildHiHat(id, item, ctx) {
  const { mats, mirror } = ctx;
  const p = worldPosition(item, mirror);
  const r = item.d / 2;
  const open = id === 'hihatOpen';
  const gap = open ? 0.028 : 0.004;
  const root = new THREE.Group();
  root.position.set(p.x, 0, p.z);
  const body = new THREE.Group();
  body.position.y = p.y;
  aim(body, p.x, p.z, TILT[id] ?? 0);
  root.add(body);
  const wobble = new THREE.Group();
  body.add(wobble);
  const mat = mats.cymbal(id);
  const top = cymbalMesh(r, 'hat', mat);
  wobble.add(top.mesh);
  const bottom = cymbalMesh(r, 'hat', mat);
  bottom.mesh.scale.y = -1;
  bottom.mesh.position.y = -gap;
  body.add(bottom.mesh);
  const clutch = mergeTransformed([
    [new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), matrix([0, top.bellH + 0.02, 0])],
    [new THREE.CylinderGeometry(0.02, 0.02, 0.008, 12), matrix([0, top.bellH + 0.004, 0])],
  ]);
  wobble.add(mesh(clutch, mats.hardware, { cast: false }));

  const parts = [];
  parts.push([tubeGeo(new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, p.y + 0.09, 0), 0.0095), new THREE.Matrix4()]);
  tripodParts(0.3, 0.26, parts);
  root.add(mesh(mergeTransformed(parts), mats.hardware));

  const glow = glowSprite(r * 2.4);
  glow.position.y = top.bellH;
  wobble.add(glow);
  const proxy = invisible(new THREE.CylinderGeometry(r * 1.05, r * 1.05, top.bellH + gap + 0.04, 24));
  proxy.position.y = top.bellH / 2 - gap / 2;
  body.add(proxy);

  return {
    id,
    kind: 'cymbal',
    hat: true,
    open,
    root,
    body,
    wobble,
    radius: r,
    surfaceY: top.bellH * 0.5,
    proxies: [proxy],
    glow,
    labelLocal: new THREE.Vector3(0, 0, r * 0.98),
  };
}

function buildHatPedal(id, item, ctx) {
  const { mats, mirror } = ctx;
  const p = worldPosition(item, mirror);
  const root = new THREE.Group();
  root.position.set(p.x, 0, p.z);
  root.rotation.y = Math.atan2(THRONE.x - p.x, THRONE.z - p.z);
  const parts = [
    [new THREE.BoxGeometry(0.1, 0.012, 0.05), matrix([0, 0.008, -0.14])],
    [new THREE.BoxGeometry(0.012, 0.16, 0.012), matrix([0, 0.085, -0.15])],
    [new THREE.BoxGeometry(0.09, 0.016, 0.06), matrix([0, 0.01, 0.14])],
  ];
  root.add(mesh(mergeTransformed(parts), mats.hardware));
  const footboard = new THREE.Group();
  footboard.position.set(0, 0.02, 0.12);
  const board = mesh(new THREE.BoxGeometry(0.085, 0.012, 0.25), mats.rubber);
  board.position.set(0, 0.02, -0.125);
  board.rotation.x = 0.14;
  footboard.add(board);
  root.add(footboard);
  // a body frame on top of the board for rings and labels
  const body = new THREE.Group();
  body.position.set(0, 0.06, 0);
  root.add(body);
  const glow = glowSprite(0.3);
  glow.position.y = 0.04;
  body.add(glow);
  const proxy = invisible(new THREE.BoxGeometry(0.18, 0.18, 0.4));
  proxy.position.set(0, 0.06, 0);
  root.add(proxy);
  return {
    id,
    kind: 'pedal',
    root,
    body,
    radius: 0.09,
    surfaceY: 0,
    proxies: [proxy],
    glow,
    footboard,
    labelLocal: new THREE.Vector3(0, -0.05, 0.16),
  };
}

// -------------------------------------------------------------------- kit

/** Is a tom placed above the bass drum, so it hangs on the kick's mount? */
function onKick(tom, kick) {
  const r = kick.d / 2;
  return Math.abs(tom.x - kick.x) < r * 0.9 && tom.z > kick.z - 0.3 && tom.z < kick.z + 0.3 && tom.h > kick.h + r;
}

/**
 * Build every visible piece. Returns { group, pieces: Map<id, piece> }.
 * `hidden` is a Set of piece ids that are switched off.
 */
export function buildKit(layout3d, hidden, mats, mirror) {
  const group = new THREE.Group();
  const pieces = new Map();
  const mountedOnKick = new Set();
  const kick = layout3d.kick;
  if (!hidden.has('kick')) for (const t of ['tom1', 'tom2', 'tom3']) if (!hidden.has(t) && onKick(layout3d[t], kick)) mountedOnKick.add(t);
  const ctx = { mats, mirror, mountedOnKick };

  for (const [id, item] of Object.entries(layout3d)) {
    if (hidden.has(id)) continue;
    const kind = PIECE_BY_ID[id].kind;
    let piece;
    if (kind === 'kick') piece = buildKick(id, item, ctx);
    else if (kind === 'drum') piece = buildDrum(id, item, ctx);
    else if (kind === 'hihat') piece = buildHiHat(id, item, ctx);
    else if (kind === 'pedal') piece = buildHatPedal(id, item, ctx);
    else piece = buildCymbal(id, item, ctx);
    for (const proxy of piece.proxies) proxy.userData.pieceId = id;
    group.add(piece.root);
    pieces.set(id, piece);
  }

  // tom holder arms from the top of the bass drum
  const kp = pieces.get('kick');
  if (kp && mountedOnKick.size) {
    const parts = [];
    for (const t of mountedOnKick) {
      const tp = pieces.get(t);
      tp.root.updateMatrixWorld(true);
      const bottomWorld = tp.bottom.clone().add(new THREE.Vector3(tp.root.position.x, 0, tp.root.position.z));
      const base = new THREE.Vector3(kp.kickTop.x + (bottomWorld.x > kp.kickTop.x ? 0.04 : -0.04), kp.kickTop.y, kp.kickTop.z + 0.02);
      const elbow = new THREE.Vector3(base.x, (base.y + bottomWorld.y) / 2 + 0.03, base.z);
      parts.push([tubeGeo(base, elbow, 0.011), new THREE.Matrix4()]);
      parts.push([tubeGeo(elbow, bottomWorld, 0.008), new THREE.Matrix4()]);
      parts.push([new THREE.SphereGeometry(0.016, 10, 8), matrix([elbow.x, elbow.y, elbow.z])]);
    }
    parts.push([new THREE.BoxGeometry(0.07, 0.03, 0.06), matrix([kp.kickTop.x, kp.kickTop.y + 0.01, kp.kickTop.z + 0.02])]);
    group.add(mesh(mergeTransformed(parts), mats.hardware));
  }
  return { group, pieces };
}

/** Free geometries of a kit group (materials belong to the material set). */
export function disposeKit(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material?.userData.own) o.material.dispose();
  });
}
