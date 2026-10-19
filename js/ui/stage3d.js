// The 3D stage: renders the kit with Three.js, turns taps into hits by
// raycasting, animates drums and cymbals, shows lesson rings, and lets you
// move pieces (top view) or orbit the camera.

import * as THREE from '../../vendor/three.module.min.js';
import { PIECES, PIECE_BY_ID, keyLabel } from '../kit/pieces.js';
import { defaultLayout3d, clamp3d } from '../kit/layout3d.js';
import { DEFAULT_LOOK } from '../kit/looks.js';
import { createMaterials } from '../three/materials.js';
import { buildKit, disposeKit } from '../three/parts.js';
import { buildScenery } from '../three/scenery.js';
import { VIEWS, placeCamera, fitView, lerpView, PHI_RANGE, DIST_RANGE } from '../three/camera.js';
import { dropLogoTextures, logoTexture } from '../three/textures.js';

export const QUALITY = {
  high: { dpr: 2, shadows: true, shadowSize: 2048 },
  balanced: { dpr: 1.5, shadows: true, shadowSize: 1024 },
  low: { dpr: 1, shadows: false, shadowSize: 512 },
};

// amplitude (rad), decay (s), frequency (Hz) of each cymbal's wobble
const WOBBLE = {
  crash1: [0.16, 0.9, 3.0],
  crash2: [0.15, 1.0, 2.8],
  splash: [0.2, 0.5, 4.2],
  china: [0.14, 0.8, 3.2],
  ride: [0.06, 1.2, 2.4],
  hihatClosed: [0.03, 0.12, 7],
  hihatOpen: [0.09, 0.45, 5],
};

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function keyText(piece) {
  const main = keyLabel(piece.keys[0]);
  const zone = piece.zones && Object.values(piece.zones)[0]?.keys?.[0];
  return zone ? `${main} · ${keyLabel(zone)}` : main;
}

export class Stage3D {
  /**
   * `init` sets the starting state in one go (look, layout, layout3d, mirror,
   * quality, view, customView) so the scene is built only once.
   */
  constructor({ wrap, onHit, onLayoutEdit, getVisualTime, onEditSelect, onCameraChange, init = {} }) {
    Object.assign(this, { wrap, onHit, onLayoutEdit, getVisualTime, onEditSelect, onCameraChange });
    this.layout = init.layout ?? null;
    this.mirror = !!init.mirror;
    this.layout3d = init.layout3d ?? defaultLayout3d();
    this.look = init.look ?? DEFAULT_LOOK;
    this.zones = true;
    this.pressure = false;
    this.defaultVelocity = 0.85;
    this.forced = new Set();
    this.editing = false;
    this.adjusting = false;
    this.rotated = false;
    this.queue = [];
    this.anims = new Map();
    this.ripples = [];
    this.rings = [];
    this.pointers = new Map();
    this.drag = null;
    this.selected = null;
    this.customView = init.customView ? { ...init.customView, target: new THREE.Vector3(...init.customView.target) } : null;
    this.viewName = VIEWS[init.view] || (init.view === 'custom' && this.customView) ? init.view : 'drummer';
    this.view = null;
    this.tween = null;
    this.quality = QUALITY[init.quality] ? init.quality : 'balanced';
    this.dirty = true;
    this.overlayDirty = true;
    this.pendingRebuild = false;

    this.host = document.createElement('div');
    this.host.className = 'stage3d';
    wrap.prepend(this.host);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.host.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay3d';
    this.host.appendChild(this.overlay);
    this.tags = new Map();
    for (const p of PIECES) {
      const tag = document.createElement('span');
      tag.className = 'tag3d';
      tag.innerHTML = `<span class="tag-name">${p.name}</span><span class="tag-key">${keyText(p)}</span>`;
      this.overlay.appendChild(tag);
      this.tags.set(p.id, tag);
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
    this.raycaster = new THREE.Raycaster();
    this.ringGeo = new THREE.RingGeometry(0.92, 1, 64);
    this.rippleGeo = new THREE.RingGeometry(0.78, 1, 48);
    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(1.02, 1.16, 64),
      new THREE.MeshBasicMaterial({ color: 0xf3a63b, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }),
    );
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.renderOrder = 30;
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);
    this.kit = null;
    this.mats = null;
    this.scenery = null;

    const signal = (this.abort = new AbortController()).signal;
    wrap.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false, signal });
    wrap.addEventListener('pointermove', (e) => this.onPointerMove(e), { signal });
    wrap.addEventListener('pointerup', (e) => this.onPointerUp(e), { signal });
    wrap.addEventListener('pointercancel', (e) => this.onPointerUp(e), { signal });
    wrap.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    wrap.addEventListener('wheel', (e) => this.onWheel(e), { passive: false, signal });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), { signal });
    canvas.addEventListener('webglcontextrestored', () => this.setLook(this.look, true), { signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(wrap);
    // the bass drum logo needs the display font; redraw it once fonts arrive
    document.fonts?.ready.then(() => !this.destroyed && this.refreshLogo());

    const conf = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, conf.dpr));
    this.renderer.shadowMap.enabled = conf.shadows;
    this.mats = createMaterials(this.look);
    this.rebuildScenery();
    this.resize();
    this.rebuildKit();
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------- settings

  setLayout(layout, mirror) {
    const rebuild = !this.layout || mirror !== this.mirror || layout !== this.layout;
    this.layout = layout;
    this.mirror = mirror;
    if (rebuild) this.rebuildKit();
  }

  setLayout3d(layout3d) {
    this.layout3d = layout3d;
    this.rebuildKit();
  }

  setLook(look, force = false) {
    const prev = this.look;
    this.look = look;
    if (!force && prev === look) return;
    this.mats?.dispose();
    this.mats = createMaterials(look);
    if (force || !this.scenery || prev.stage !== look.stage || prev.glow !== look.glow) this.rebuildScenery();
    this.rebuildKit();
  }

  setQuality(q) {
    const prev = QUALITY[this.quality];
    this.quality = QUALITY[q] ? q : 'balanced';
    const conf = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, conf.dpr));
    this.renderer.shadowMap.enabled = conf.shadows;
    if (this.scenery && (prev.shadows !== conf.shadows || prev.shadowSize !== conf.shadowSize)) this.rebuildScenery();
    this.resize();
  }

  refreshLogo() {
    if (!this.mats) return;
    dropLogoTextures();
    this.mats.reso.map = logoTexture(this.look.logo, this.look.heads, this.look.glow);
    this.mats.reso.needsUpdate = true;
    this.dirty = true;
  }

  setOptions({ labels, keys, zones, pressure, velocity }) {
    if (labels !== undefined) this.host.classList.toggle('no-labels', !labels);
    if (keys !== undefined) this.host.classList.toggle('no-keys', !keys);
    if (zones !== undefined) this.zones = zones;
    if (pressure !== undefined) this.pressure = pressure;
    if (velocity !== undefined) this.defaultVelocity = velocity;
    this.overlayDirty = true;
  }

  /** Show pieces a lesson needs even when the layout hides them. */
  forceVisible(ids) {
    const before = [...this.hiddenSet()].join();
    this.forced = new Set(ids);
    if ([...this.hiddenSet()].join() !== before) this.rebuildKit();
  }

  /** Visibility changed in the layout (pieces menu). */
  place() {
    this.rebuildKit();
  }

  hiddenSet() {
    const hidden = new Set();
    if (!this.layout) return hidden;
    for (const [id, item] of Object.entries(this.layout)) if (item.hidden && !this.forced.has(id)) hidden.add(id);
    return hidden;
  }

  // ---------------------------------------------------------- building

  rebuildScenery() {
    this.scenery?.dispose();
    const conf = QUALITY[this.quality];
    this.scenery = buildScenery(this.scene, this.renderer, this.look.stage, {
      shadows: conf.shadows,
      shadowSize: conf.shadowSize,
      glow: this.look.glow,
    });
    this.dirty = true;
  }

  rebuildKit() {
    if (!this.mats) return;
    if (this.kit) {
      this.scene.remove(this.kit.group);
      disposeKit(this.kit.group);
    }
    this.anims.clear();
    this.ripples = [];
    for (const r of this.rings) r.mesh.removeFromParent();
    this.rings = [];
    this.kit = buildKit(this.layout3d, this.hiddenSet(), this.mats, this.mirror);
    this.scene.add(this.kit.group);
    this.kit.group.updateMatrixWorld(true);
    this.proxies = [...this.kit.pieces.values()].flatMap((p) => p.proxies);
    this.points = null;
    for (const [id, tag] of this.tags) tag.hidden = !this.kit.pieces.has(id);
    if (this.selected && !this.kit.pieces.has(this.selected)) this.select(null);
    else this.updateSelectRing();
    if (!this.adjusting && !this.editing && this.viewName !== 'custom') this.applyView(false);
    this.dirty = true;
    this.overlayDirty = true;
  }

  /** Points on every playing surface, used to frame the kit. */
  kitPoints() {
    if (this.points) return this.points;
    const pts = [];
    for (const p of this.kit.pieces.values()) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts.push(p.body.localToWorld(new THREE.Vector3(Math.cos(a) * p.radius, p.surfaceY, Math.sin(a) * p.radius)));
      }
      if (p.footboard) pts.push(p.footboard.localToWorld(new THREE.Vector3(0, 0, 0)));
    }
    this.points = pts;
    return pts;
  }

  // ------------------------------------------------------------ camera

  setView(name, custom = null) {
    if (custom) this.customView = { ...custom, target: new THREE.Vector3(...custom.target) };
    this.viewName = VIEWS[name] || (name === 'custom' && this.customView) ? name : 'drummer';
    if (!this.editing) this.applyView(true);
  }

  targetView(name = this.viewName) {
    if (name === 'custom' && this.customView) return this.customView;
    return fitView(this.camera, VIEWS[name] ?? VIEWS.drummer, this.kitPoints());
  }

  applyView(animate) {
    if (!this.kit || !this.width) return;
    const to = this.targetView(this.editing ? 'top' : this.viewName);
    if (animate && this.view && !reduceMotion()) {
      this.tween = { from: this.view, to, t0: performance.now(), ms: 550 };
    } else {
      this.tween = null;
      this.view = to;
      placeCamera(this.camera, to);
    }
    this.dirty = true;
    this.overlayDirty = true;
  }

  startAdjust() {
    this.adjusting = true;
    this.tween = null;
    if (this.view) placeCamera(this.camera, this.view);
  }

  stopAdjust(save = true) {
    this.adjusting = false;
    this.pointers.clear();
    if (save && this.view) {
      this.viewName = 'custom';
      this.customView = { ...this.view, target: this.view.target.clone() };
      const t = this.view.target;
      this.onCameraChange?.('custom', { theta: this.view.theta, phi: this.view.phi, dist: this.view.dist, target: [t.x, t.y, t.z] });
    } else {
      this.applyView(true);
    }
  }

  resize() {
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.adjusting && this.view) placeCamera(this.camera, this.view);
    else this.applyView(false);
    this.dirty = true;
    this.overlayDirty = true;
  }

  // ------------------------------------------------------------- input

  /** Pointer position in the stage's own CSS pixels (handles the turned-phone mode). */
  localPoint(e) {
    if (this.rotated) {
      return { x: e.clientY - this.wrap.offsetLeft, y: window.innerWidth - e.clientX - this.wrap.offsetTop };
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  setRay(p) {
    this.raycaster.setFromCamera(new THREE.Vector2((p.x / this.width) * 2 - 1, -(p.y / this.height) * 2 + 1), this.camera);
  }

  /** Which piece is under a stage point. Returns { id, sound, dist, local } or null. */
  pick(p, zones = this.zones) {
    if (!this.kit) return null;
    this.setRay(p);
    const hit = this.raycaster.intersectObjects(this.proxies, false)[0];
    let piece;
    let local;
    if (hit) {
      piece = this.kit.pieces.get(hit.object.userData.pieceId);
      local = piece.body.worldToLocal(hit.point.clone());
    } else {
      // forgiving near-miss: the closest piece centre within a small radius
      let best = null;
      const limit = Math.min(this.width, this.height) * 0.06;
      for (const pc of this.kit.pieces.values()) {
        const s = this.project(pc.body.localToWorld(new THREE.Vector3(0, pc.surfaceY, 0)));
        if (!s) continue;
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < limit && (!best || d < best.d)) best = { pc, d };
      }
      if (!best) return null;
      piece = best.pc;
      local = new THREE.Vector3(0, piece.surfaceY, piece.radius * 0.5);
    }
    const def = PIECE_BY_ID[piece.id];
    const dist = Math.hypot(local.x, local.z) / piece.radius;
    let sound = def.sound;
    if (zones && def.zones && hit && hit.object === piece.proxies[0]) {
      if (def.zones.inner && dist <= def.zones.inner.radius) sound = def.zones.inner.sound;
      if (def.zones.outer && dist >= def.zones.outer.radius) sound = def.zones.outer.sound;
    }
    return { id: piece.id, sound, dist, local };
  }

  project(world) {
    const v = world.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  velocityFor(e, hit) {
    let v = this.defaultVelocity;
    if (this.pressure && (e.pointerType === 'touch' || e.pointerType === 'pen') && e.pressure > 0 && e.pressure !== 0.5) {
      v = 0.3 + 0.7 * Math.min(1, e.pressure);
    }
    if (hit.dist > 0.75 && PIECE_BY_ID[hit.id].kind === 'drum') v *= 0.93;
    return Math.min(1, v);
  }

  onPointerDown(e) {
    if (e.button > 0) return;
    if (e.target.closest('[data-ui]')) return;
    e.preventDefault();
    const p = this.localPoint(e);
    if (this.adjusting) {
      this.pointers.set(e.pointerId, p);
      this.capture(e);
      this.orbitStart = { view: { ...this.view, target: this.view.target.clone() }, pts: new Map(this.pointers) };
      return;
    }
    if (this.editing) {
      this.editDown(e, p);
      return;
    }
    const hit = this.pick(p);
    if (!hit) return;
    this.onHit(hit.id, hit.sound, this.velocityFor(e, hit), { source: 'touch', local: hit.local, x: p.x, y: p.y });
  }

  onPointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, p);
    if (this.adjusting) this.orbitMove();
    else if (this.editing) this.editMove(p);
  }

  onPointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.adjusting) {
      this.orbitStart = this.pointers.size
        ? { view: { ...this.view, target: this.view.target.clone() }, pts: new Map(this.pointers) }
        : null;
      return;
    }
    if (this.editing && this.drag) {
      if (this.pointers.size === 0) {
        this.drag = null;
        this.rebuildKit();
        this.onLayoutEdit?.(this.layout3d);
      } else {
        const [p] = this.pointers.values();
        this.drag.pinch = null;
        this.drag.start = this.floorPoint(p);
        this.drag.orig = { ...this.layout3d[this.drag.id] };
      }
    }
  }

  capture(e) {
    try {
      this.wrap.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  }

  onWheel(e) {
    if (!this.editing && !this.adjusting) return;
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.07 : 1 / 1.07;
    if (this.adjusting) {
      this.view.dist = Math.min(DIST_RANGE[1], Math.max(DIST_RANGE[0], this.view.dist * f));
      placeCamera(this.camera, this.view);
      this.dirty = this.overlayDirty = true;
      return;
    }
    const hit = this.pick(this.localPoint(e), false);
    const id = hit?.id ?? this.selected;
    if (!id) return;
    this.select(id);
    this.resizePiece(id, this.layout3d[id].d / f);
  }

  // ------------------------------------------------------- camera orbit

  orbitMove() {
    const start = this.orbitStart;
    if (!start) return;
    const now = [...this.pointers.entries()];
    const v = { ...start.view, target: start.view.target.clone() };
    if (now.length === 1) {
      const [id, p] = now[0];
      const p0 = start.pts.get(id);
      if (!p0) return;
      v.theta = start.view.theta - (p.x - p0.x) * 0.006;
      v.phi = Math.min(PHI_RANGE[1], Math.max(PHI_RANGE[0], start.view.phi - (p.y - p0.y) * 0.005));
    } else if (now.length >= 2) {
      const [a, b] = now;
      const a0 = start.pts.get(a[0]);
      const b0 = start.pts.get(b[0]);
      if (!a0 || !b0) return;
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
      const d1 = Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) || 1;
      v.dist = Math.min(DIST_RANGE[1], Math.max(DIST_RANGE[0], start.view.dist * (d0 / d1)));
    }
    this.view = v;
    placeCamera(this.camera, v);
    this.dirty = this.overlayDirty = true;
  }

  // -------------------------------------------------------- layout edit

  setEditing(on) {
    this.editing = on;
    this.drag = null;
    this.pointers.clear();
    if (!on) this.select(null);
    this.applyView(true);
  }

  select(id) {
    this.selected = id;
    this.updateSelectRing();
    this.onEditSelect?.(id, id ? this.layout3d[id] : null);
    this.dirty = true;
  }

  updateSelectRing() {
    const piece = this.selected && this.kit?.pieces.get(this.selected);
    this.selectRing.visible = !!piece && this.editing;
    if (!piece) return;
    const r = PIECE_BY_ID[piece.id].kind === 'pedal' ? 0.16 : piece.radius;
    this.selectRing.scale.setScalar(r);
    this.selectRing.position.set(piece.root.position.x, 0.012, piece.root.position.z);
  }

  floorPoint(p) {
    this.setRay(p);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out) ? out : null;
  }

  editDown(e, p) {
    if (this.drag && this.pointers.size === 1) {
      // a second finger starts a pinch to resize
      const [first] = this.pointers.values();
      this.pointers.set(e.pointerId, p);
      this.drag.pinch = Math.max(10, Math.hypot(p.x - first.x, p.y - first.y));
      this.drag.orig = { ...this.layout3d[this.drag.id] };
      this.capture(e);
      return;
    }
    const hit = this.pick(p, false);
    if (!hit) {
      this.select(null);
      return;
    }
    this.select(hit.id);
    const start = this.floorPoint(p);
    if (!start) return;
    this.drag = { id: hit.id, start, orig: { ...this.layout3d[hit.id] }, pinch: null };
    this.pointers.set(e.pointerId, p);
    this.capture(e);
  }

  editMove(p) {
    const d = this.drag;
    if (!d) return;
    const item = this.layout3d[d.id];
    if (this.pointers.size >= 2 && d.pinch) {
      const [a, b] = [...this.pointers.values()];
      this.resizePiece(d.id, d.orig.d * (Math.hypot(a.x - b.x, a.y - b.y) / d.pinch), false);
      return;
    }
    const f = this.floorPoint(p);
    if (!f || !d.start) return;
    const dx = f.x - d.start.x;
    item.x = d.orig.x + (this.mirror ? -dx : dx);
    item.z = d.orig.z + (f.z - d.start.z);
    clamp3d(d.id, item);
    const piece = this.kit.pieces.get(d.id);
    if (piece) {
      piece.root.position.x = this.mirror ? -item.x : item.x;
      piece.root.position.z = item.z;
      this.updateSelectRing();
    }
    this.dirty = true;
  }

  resizePiece(id, d, save = true) {
    const item = this.layout3d[id];
    item.d = d;
    clamp3d(id, item);
    this.pendingRebuild = true;
    if (save) {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.onLayoutEdit?.(this.layout3d), 250);
    }
    this.onEditSelect?.(id, item);
  }

  /** Slider changes from the edit bar. */
  setPieceProps(id, props) {
    const item = this.layout3d[id];
    if (!item) return;
    Object.assign(item, props);
    clamp3d(id, item);
    this.pendingRebuild = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.onLayoutEdit?.(this.layout3d), 250);
  }

  // ------------------------------------------------------------ visuals

  flash(id, velocity = 0.85, info = null) {
    const piece = this.kit?.pieces.get(id);
    if (!piece) return;
    const v = Math.max(0.2, Math.min(1, velocity));
    const local = info?.local ?? new THREE.Vector3(0, piece.surfaceY, piece.radius * 0.55);
    const prev = this.anims.get(id);
    const anim = { t0: performance.now(), v, local };
    if (piece.wobble) {
      const [amp, decay, freq] = WOBBLE[id] ?? [0.12, 0.8, 3];
      const bell = Math.hypot(local.x, local.z) < piece.radius * 0.3;
      // keep a ringing cymbal's energy when it is hit again
      let a = amp * v * (bell ? 0.45 : 1);
      if (prev?.amp) a = Math.min(amp * 1.4, a + prev.amp * Math.exp(-(anim.t0 - prev.t0) / 1000 / decay) * 0.5);
      const axis = new THREE.Vector3(local.z, 0, -local.x);
      if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
      Object.assign(anim, { amp: a, decay, freq, axis: axis.normalize() });
    }
    if (reduceMotion()) {
      anim.amp = 0;
    }
    this.anims.set(id, anim);
    if ((piece.kind === 'drum' || piece.kind === 'kick') && info?.local && !reduceMotion()) this.addRipple(piece, local, v);
    this.dirty = true;
  }

  addRipple(piece, local, v) {
    const m = new THREE.Mesh(
      this.rippleGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(local.x, piece.surfaceY + 0.003, local.z);
    m.renderOrder = 4;
    piece.body.add(m);
    this.ripples.push({ mesh: m, t0: performance.now(), r: piece.radius, v });
    if (this.ripples.length > 12) this.dropRipple(this.ripples[0]);
  }

  dropRipple(rp) {
    rp.mesh.removeFromParent();
    rp.mesh.material.dispose();
    this.ripples = this.ripples.filter((x) => x !== rp);
  }

  scheduleFlash(id, velocity, time) {
    this.enqueue({ t: time, run: () => this.flash(id, velocity) });
  }

  scheduleApproach(id, time, lead = 1.2) {
    this.enqueue({
      t: time - lead,
      run: () => {
        const piece = this.kit?.pieces.get(id);
        if (!piece) return;
        const foot = piece.kind === 'kick' || piece.kind === 'pedal';
        const m = new THREE.Mesh(
          this.ringGeo,
          new THREE.MeshBasicMaterial({
            color: foot ? 0x78c2d4 : 0xf3a63b,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
          }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.y = piece.surfaceY + 0.006;
        m.renderOrder = 20;
        piece.body.add(m);
        this.rings.push({ mesh: m, start: this.getVisualTime(), hit: time, r: piece.kind === 'pedal' ? 0.12 : piece.radius });
        this.dirty = true;
      },
    });
  }

  showJudgment(id, text, cls) {
    const piece = this.kit?.pieces.get(id);
    if (!piece) return;
    const s = this.project(piece.body.localToWorld(new THREE.Vector3(0, piece.surfaceY, 0)));
    if (!s) return;
    this.overlay.querySelectorAll(`.judge[data-id="${id}"]`).forEach((j) => j.remove());
    const j = document.createElement('span');
    j.className = `judge ${cls}`;
    j.dataset.id = id;
    j.textContent = text;
    j.style.left = `${s.x}px`;
    j.style.top = `${s.y}px`;
    this.overlay.appendChild(j);
    const a = j.animate(
      [
        { transform: 'translate(-50%, -30%) scale(0.8)', opacity: 0 },
        { transform: 'translate(-50%, -70%) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -140%) scale(1)', opacity: 0 },
      ],
      { duration: 650, easing: 'ease-out' },
    );
    a.onfinish = () => j.remove();
  }

  enqueue(item) {
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].t > item.t) i--;
    q.splice(i, 0, item);
  }

  clearScheduled() {
    this.queue = [];
    for (const r of this.rings) {
      r.mesh.removeFromParent();
      r.mesh.material.dispose();
    }
    this.rings = [];
    this.dirty = true;
  }

  /** Screen point (client coordinates) that taps the given piece, for tests and tooling. */
  screenPoint(id) {
    const piece = this.kit?.pieces.get(id);
    if (!piece) return null;
    const r = piece.radius;
    const cands = [
      [0, 0],
      [0, 0.5],
      [0, -0.5],
      [0.5, 0],
      [-0.5, 0],
      [0.6, 0.6],
      [-0.6, 0.6],
    ].map(([x, z]) => piece.body.localToWorld(new THREE.Vector3(x * r, piece.surfaceY, z * r)));
    if (piece.footboard) for (const z of [-0.03, -0.1, -0.18]) cands.push(piece.footboard.localToWorld(new THREE.Vector3(0, 0.03, z)));
    const rect = this.renderer.domElement.getBoundingClientRect();
    for (const w of cands) {
      const s = this.project(w);
      if (!s || s.x < 0 || s.y < 0 || s.x > this.width || s.y > this.height) continue;
      if (this.pick(s, false)?.id === id) return { x: rect.left + s.x, y: rect.top + s.y };
    }
    return null;
  }

  // -------------------------------------------------------------- frame

  animate(now) {
    let active = false;
    for (const [id, a] of this.anims) {
      const piece = this.kit.pieces.get(id);
      if (!piece) {
        this.anims.delete(id);
        continue;
      }
      const t = (now - a.t0) / 1000;
      let done = true;
      if (piece.flash) {
        const o = 0.5 * a.v * Math.exp(-t / 0.09);
        piece.flash.material.opacity = o;
        piece.body.scale.y = piece.kind === 'drum' ? 1 - 0.035 * a.v * Math.exp(-t / 0.05) : 1;
        if (o > 0.004) done = false;
        else {
          piece.flash.material.opacity = 0;
          piece.body.scale.y = 1;
        }
      }
      if (piece.glow) {
        const o = 0.55 * a.v * Math.exp(-t / 0.12);
        piece.glow.material.opacity = o > 0.004 ? o : 0;
        if (o > 0.004) done = false;
      }
      if (piece.wobble && a.amp) {
        const ang = a.amp * Math.exp(-t / a.decay) * Math.sin(2 * Math.PI * a.freq * t);
        piece.wobble.quaternion.setFromAxisAngle(a.axis, ang);
        if (t < a.decay * 4) done = false;
        else piece.wobble.quaternion.identity();
      }
      if (piece.beater || piece.footboard) {
        const pulse = t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) / 0.07);
        if (piece.beater) piece.beater.rotation.x = 0.55 - 0.78 * pulse * a.v;
        if (piece.footboard) piece.footboard.rotation.x = -0.12 * pulse * a.v;
        if (t < 0.6) done = false;
        else {
          if (piece.beater) piece.beater.rotation.x = 0.55;
          if (piece.footboard) piece.footboard.rotation.x = 0;
        }
      }
      if (done) this.anims.delete(id);
      active = true;
    }
    for (const rp of [...this.ripples]) {
      const k = (now - rp.t0) / 380;
      if (k >= 1) {
        this.dropRipple(rp);
        continue;
      }
      rp.mesh.scale.setScalar(rp.r * (0.05 + 0.55 * k));
      rp.mesh.material.opacity = 0.5 * rp.v * (1 - k);
      active = true;
    }
    if (this.rings.length) {
      const vt = this.getVisualTime();
      for (const ring of [...this.rings]) {
        const span = Math.max(0.05, ring.hit - ring.start);
        const k = (vt - ring.start) / span;
        if (k >= 1) {
          const f = (vt - ring.hit) / 0.14;
          ring.mesh.scale.setScalar(ring.r * (1 - 0.08 * Math.min(1, f)));
          ring.mesh.material.opacity = Math.max(0, 1 - f);
          if (f >= 1) {
            ring.mesh.removeFromParent();
            ring.mesh.material.dispose();
            this.rings = this.rings.filter((x) => x !== ring);
          }
        } else {
          ring.mesh.scale.setScalar(ring.r * (1.9 - 0.9 * Math.max(0, k)));
          ring.mesh.material.opacity = Math.min(1, Math.max(0, k) / 0.3);
        }
      }
      active = true;
    }
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.ms);
      this.view = lerpView(this.tween.from, this.tween.to, k);
      placeCamera(this.camera, this.view);
      this.overlayDirty = true;
      if (k >= 1) {
        this.view = this.tween.to;
        this.tween = null;
      }
      active = true;
    }
    return active;
  }

  updateOverlay() {
    for (const [id, tag] of this.tags) {
      const piece = this.kit?.pieces.get(id);
      if (!piece) continue;
      const s = this.project(piece.body.localToWorld(piece.labelLocal.clone()));
      tag.style.visibility = s ? '' : 'hidden';
      if (s) tag.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
    this.updateSelectRing();
  }

  tick(now) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.tick);
    const vt = this.getVisualTime();
    while (this.queue.length && this.queue[0].t <= vt) this.queue.shift().run();
    if (this.pendingRebuild) {
      this.pendingRebuild = false;
      this.rebuildKit();
    }
    const active = this.animate(now);
    if (!active && !this.dirty) return;
    this.dirty = false;
    if (this.overlayDirty) {
      this.overlayDirty = false;
      this.updateOverlay();
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver.disconnect();
    clearTimeout(this.saveTimer);
    if (this.kit) disposeKit(this.kit.group);
    this.scenery?.dispose();
    this.mats?.dispose();
    this.ringGeo.dispose();
    this.rippleGeo.dispose();
    this.selectRing.geometry.dispose();
    this.selectRing.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.host.remove();
  }
}
