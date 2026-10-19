// The classic 2D stage: draws the kit seen from above with CSS, turns
// touches and clicks into hits, animates pads, and handles the drag/resize
// layout editor. Used when 3D is switched off or unavailable.

import { STAGE_W, STAGE_H, projectLayout, stageFrame, hitTest, clampItem, MIN_SIZE, MAX_SIZE } from '../kit/layout.js';
import { PIECES, PIECE_BY_ID, keyLabel } from '../kit/pieces.js';
import { shellFor, cymbalFor, shade, pieceSurface } from '../kit/looks.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function keyText(piece) {
  const main = keyLabel(piece.keys[0]);
  const zone = piece.zones && Object.values(piece.zones)[0]?.keys?.[0];
  return zone ? `${main} · ${keyLabel(zone)}` : main;
}

function createPad(piece) {
  const el = document.createElement('div');
  const classes = ['pad', piece.kind, piece.id];
  if (piece.open) classes.push('open');
  if (piece.finish) classes.push(`finish-${piece.finish}`);
  el.className = classes.join(' ');
  el.dataset.id = piece.id;
  let inner = '';
  switch (piece.kind) {
    case 'drum':
      inner = '<div class="shadow"></div><div class="shell"></div><div class="lugs"></div><div class="hoop"></div><div class="head"></div>';
      break;
    case 'kick':
      inner =
        '<div class="shadow"></div><div class="shell"></div><div class="lugs"></div><div class="hoop"></div>' +
        '<div class="head"><span class="logo">MyDrum</span><span class="port"></span></div>';
      break;
    case 'hihat':
      inner =
        '<div class="cym">' +
        (piece.open ? '<div class="disc under"></div>' : '') +
        '<div class="disc"></div><div class="bell"></div><div class="clutch"></div></div>';
      break;
    case 'pedal':
      inner = '<div class="pedal-frame"><div class="board"></div><div class="heel"></div></div>';
      break;
    default:
      inner = '<div class="cym"><div class="disc"></div><div class="bell"></div><div class="nut"></div></div>';
  }
  el.innerHTML =
    inner +
    `<div class="glow"></div><span class="tape">${piece.name}</span><span class="key">${keyText(piece)}</span>` +
    '<span class="handle" aria-hidden="true"></span>';
  return el;
}

export class Stage2D {
  /**
   * @param {object} o
   * @param {HTMLElement} o.wrap   element that receives pointer input
   * @param {HTMLElement} o.el     the scaled stage element
   * @param {(id:string, sound:string, velocity:number, info:object)=>void} o.onHit
   * @param {(layout:object)=>void} o.onLayoutEdit
   * @param {()=>number} o.getVisualTime  audio clock adjusted for output latency
   */
  constructor({ wrap, el, onHit, onLayoutEdit, getVisualTime }) {
    this.wrap = wrap;
    this.el = el;
    this.onHit = onHit;
    this.onLayoutEdit = onLayoutEdit;
    this.getVisualTime = getVisualTime;
    this.layout = null;
    this.mirror = false;
    this.zones = true;
    this.pressure = false;
    this.defaultVelocity = 0.85;
    this.pads = new Map();
    this.items = [];
    this.scale = 1;
    this.vw = STAGE_W;
    this.vh = STAGE_H;
    this.editing = false;
    this.rotated = false;
    this.drag = null;
    this.pointers = new Map();
    this.queue = [];
    this.forcedVisible = new Set();

    this.rug = document.createElement('div');
    this.rug.className = 'rug';
    el.appendChild(this.rug);
    for (const p of PIECES) {
      const pad = createPad(p);
      this.pads.set(p.id, pad);
      el.appendChild(pad);
    }

    const signal = (this.abort = new AbortController()).signal;
    wrap.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false, signal });
    wrap.addEventListener('pointermove', (e) => this.onPointerMove(e), { signal });
    wrap.addEventListener('pointerup', (e) => this.onPointerUp(e), { signal });
    wrap.addEventListener('pointercancel', (e) => this.onPointerUp(e), { signal });
    wrap.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    wrap.addEventListener('wheel', (e) => this.onWheel(e), { passive: false, signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(wrap);

    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.el.replaceChildren();
    this.el.removeAttribute('style');
    this.el.className = 'stage';
    for (const k of Object.keys(this.el.dataset)) delete this.el.dataset[k];
    delete this.wrap.dataset.stage;
  }

  /** Colours and finishes from the look (see kit/looks.js), as CSS variables. */
  setLook(look) {
    const el = this.el;
    el.dataset.hardware = look.hardware;
    el.dataset.heads = look.heads;
    if (look.glow) {
      el.dataset.glow = 'on';
      el.style.setProperty('--glow', look.glow);
    } else {
      delete el.dataset.glow;
    }
    this.wrap.dataset.stage = look.stage;
    for (const [id, pad] of this.pads) {
      const surface = pieceSurface(id);
      if (surface === 'shell') {
        const { finish, color } = shellFor(look, id);
        pad.dataset.finish = finish;
        pad.style.setProperty('--wrap-1', shade(color, 0.14));
        pad.style.setProperty('--wrap-2', shade(color, -0.42));
      } else if (surface === 'cymbal') {
        pad.dataset.cymbals = cymbalFor(look, id);
      }
    }
    const logo = this.pads.get('kick')?.querySelector('.logo');
    if (logo) logo.textContent = look.logo || ' ';
  }

  // the 2D view has no camera or 3D layout
  setView() {}
  setLayout3d() {}
  setQuality() {}

  /** Client coordinates of a piece's centre, for tests and tooling. */
  screenPoint(id) {
    const pad = this.pads.get(id);
    if (!pad || pad.hidden) return null;
    const r = pad.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  setLayout(layout, mirror) {
    this.layout = layout;
    this.mirror = mirror;
    this.resize();
  }

  setOptions({ labels, keys, zones, pressure, velocity }) {
    if (labels !== undefined) this.el.classList.toggle('no-labels', !labels);
    if (keys !== undefined) this.el.classList.toggle('no-keys', !keys);
    if (zones !== undefined) {
      this.zones = zones;
      this.el.classList.toggle('zones', zones);
    }
    if (pressure !== undefined) this.pressure = pressure;
    if (velocity !== undefined) this.defaultVelocity = velocity;
  }

  /** Temporarily show pieces (a lesson needs them) even if the layout hides them. */
  forceVisible(ids) {
    this.forcedVisible = new Set(ids);
    this.place();
  }

  resize() {
    const W = this.wrap.clientWidth;
    const H = this.wrap.clientHeight;
    if (!W || !H || !this.layout) return;
    const s = Math.min(W / STAGE_W, H / STAGE_H);
    this.scale = s;
    this.vw = W / s;
    this.vh = H / s;
    this.el.style.width = `${this.vw}px`;
    this.el.style.height = `${this.vh}px`;
    this.el.style.transform = `scale(${s})`;
    this.place();
  }

  effectiveLayout() {
    if (!this.forcedVisible.size) return this.layout;
    const out = {};
    for (const [id, item] of Object.entries(this.layout)) {
      out[id] = this.forcedVisible.has(id) ? { ...item, hidden: false } : item;
    }
    return out;
  }

  place() {
    if (!this.layout) return;
    this.items = projectLayout(this.effectiveLayout(), this.vw, this.vh, this.mirror);
    // the rug sits under the kit area and runs off the bottom edge
    const { kx, ky, ox, oy } = stageFrame(this.vw, this.vh);
    Object.assign(this.rug.style, {
      left: `${ox + STAGE_W * 0.09 * kx}px`,
      top: `${oy + STAGE_H * 0.16 * ky}px`,
      width: `${STAGE_W * 0.82 * kx}px`,
      height: `${STAGE_H * 0.9 * ky}px`,
    });
    const byId = new Map(this.items.map((i) => [i.id, i]));
    for (const [id, pad] of this.pads) {
      const it = byId.get(id);
      pad.hidden = !it;
      if (!it) continue;
      const d = it.r * 2;
      pad.style.left = `${it.x - it.r}px`;
      pad.style.top = `${it.y - it.r}px`;
      pad.style.width = `${d}px`;
      pad.style.height = `${d}px`;
      pad.style.setProperty('--d', `${d}px`);
      pad.style.zIndex = String(it.piece.z * 10);
    }
  }

  toVirtual(e) {
    if (this.rotated) {
      // the whole app is turned 90deg clockwise: undo that, then offset to the stage
      const lx = e.clientY;
      const ly = window.innerWidth - e.clientX;
      return { x: (lx - this.wrap.offsetLeft) / this.scale, y: (ly - this.wrap.offsetTop) / this.scale };
    }
    const rect = this.el.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / this.scale, y: (e.clientY - rect.top) / this.scale };
  }

  itemFor(id) {
    return this.items.find((i) => i.id === id) ?? null;
  }

  velocityFor(e, hit) {
    let v = this.defaultVelocity;
    if (this.pressure && (e.pointerType === 'touch' || e.pointerType === 'pen') && e.pressure > 0 && e.pressure !== 0.5) {
      v = 0.3 + 0.7 * Math.min(1, e.pressure);
    }
    // edge hits on drums are a touch softer, like a real head
    if (hit.dist > 0.75 && PIECE_BY_ID[hit.id].kind === 'drum') v *= 0.93;
    return Math.min(1, v);
  }

  // ------------------------------------------------------------- input

  onPointerDown(e) {
    if (e.button > 0) return;
    if (e.target.closest('[data-ui]')) return;
    e.preventDefault();
    const p = this.toVirtual(e);
    if (this.editing) {
      this.editDown(e, p);
      return;
    }
    const hit = hitTest(this.items, p.x, p.y, this.zones);
    if (!hit) return;
    this.onHit(hit.id, hit.sound, this.velocityFor(e, hit), { x: p.x, y: p.y, source: 'touch' });
  }

  onPointerMove(e) {
    if (!this.drag || !this.pointers.has(e.pointerId)) return;
    const p = this.toVirtual(e);
    this.pointers.set(e.pointerId, p);
    const d = this.drag;
    const item = this.layout[d.id];
    const { kx, ky } = stageFrame(this.vw, this.vh);
    if (this.pointers.size >= 2 && d.pinch) {
      const [a, b] = [...this.pointers.values()];
      item.d = d.orig.d * (Math.hypot(a.x - b.x, a.y - b.y) / d.pinch);
    } else if (d.mode === 'resize') {
      const it = this.itemFor(d.id);
      // the handle sits on the rim, so the pointer's distance from the centre is the radius
      if (it) item.d = 2 * Math.hypot(p.x - it.x, p.y - it.y);
    } else {
      const dx = (p.x - d.start.x) / kx;
      item.x = d.orig.x + (this.mirror ? -dx : dx);
      item.y = d.orig.y + (p.y - d.start.y) / ky;
    }
    item.d = Math.min(MAX_SIZE, Math.max(MIN_SIZE, item.d));
    clampItem(item);
    this.place();
  }

  onPointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.drag && this.pointers.size === 0) {
      this.pads.get(this.drag.id)?.classList.remove('dragging');
      this.drag = null;
      this.onLayoutEdit?.(this.layout);
    } else if (this.drag && this.pointers.size === 1) {
      // pinch ended: continue as a move from the remaining finger
      const [p] = this.pointers.values();
      this.drag.pinch = null;
      this.drag.mode = 'move';
      this.drag.start = p;
      this.drag.orig = { ...this.layout[this.drag.id] };
    }
  }

  editDown(e, p) {
    if (this.drag) {
      // second finger on the same piece starts a pinch-resize
      if (this.pointers.size === 1) {
        const [first] = this.pointers.values();
        this.pointers.set(e.pointerId, p);
        this.drag.pinch = Math.max(10, Math.hypot(p.x - first.x, p.y - first.y));
        this.drag.orig = { ...this.layout[this.drag.id] };
        this.capture(e);
      }
      return;
    }
    const handle = e.target.closest('.handle');
    const id = handle ? handle.closest('.pad').dataset.id : hitTest(this.items, p.x, p.y, false)?.id;
    if (!id) return;
    this.drag = { id, mode: handle ? 'resize' : 'move', start: p, orig: { ...this.layout[id] }, pinch: null };
    this.pointers.set(e.pointerId, p);
    this.pads.get(id).classList.add('dragging');
    this.capture(e);
  }

  capture(e) {
    try {
      this.wrap.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  }

  onWheel(e) {
    if (!this.editing) return;
    e.preventDefault();
    const p = this.toVirtual(e);
    const hit = hitTest(this.items, p.x, p.y, false);
    if (!hit) return;
    const item = this.layout[hit.id];
    item.d *= e.deltaY < 0 ? 1.06 : 1 / 1.06;
    clampItem(item);
    this.place();
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => this.onLayoutEdit?.(this.layout), 250);
  }

  setEditing(on) {
    this.editing = on;
    this.el.classList.toggle('editing', on);
    this.drag = null;
    this.pointers.clear();
  }

  // ------------------------------------------------------------ visuals

  /** Animate a hit right now. `point` is in stage coordinates (optional). */
  flash(id, velocity = 0.85, point = null) {
    const pad = this.pads.get(id);
    if (!pad || pad.hidden) return;
    const piece = PIECE_BY_ID[id];
    const v = Math.max(0.2, Math.min(1, velocity));
    pad.querySelector('.glow').animate([{ opacity: 0.3 + 0.55 * v }, { opacity: 0 }], {
      duration: 280,
      easing: 'ease-out',
    });
    if (reduceMotion()) return;
    const it = this.itemFor(id);
    if (piece.kind === 'drum' || piece.kind === 'kick') {
      pad.animate([{ transform: 'scale(1)' }, { transform: `scale(${1 - 0.035 * v})`, offset: 0.3 }, { transform: 'scale(1)' }], {
        duration: 160,
        easing: 'ease-out',
      });
      if (point && it) this.ripple(pad, point.x - (it.x - it.r), point.y - (it.y - it.r), v);
    } else if (piece.kind === 'pedal') {
      pad
        .querySelector('.board')
        .animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.9) translateY(2%)', offset: 0.35 }, { transform: 'scaleY(1)' }], {
          duration: 160,
          easing: 'ease-out',
        });
    } else {
      const cym = pad.querySelector('.cym');
      let dx = 0.35;
      let dy = -0.6;
      if (point && it) {
        dx = (point.x - it.x) / it.r;
        dy = (point.y - it.y) / it.r;
      }
      const amp = (piece.kind === 'hihat' && !piece.open ? 5 : 13) * v;
      const rx = -dy * amp;
      const ry = dx * amp;
      const f = (k) => `perspective(900px) rotateX(${rx * k}deg) rotateY(${ry * k}deg)`;
      cym.animate(
        [
          { transform: f(0) },
          { transform: f(1), offset: 0.12 },
          { transform: f(-0.55), offset: 0.38 },
          { transform: f(0.3), offset: 0.62 },
          { transform: f(-0.12), offset: 0.82 },
          { transform: f(0) },
        ],
        { duration: piece.kind === 'hihat' && !piece.open ? 260 : 780, easing: 'ease-out' },
      );
    }
  }

  ripple(pad, x, y, v) {
    if (pad.querySelectorAll('.ripple').length > 2) return;
    const r = document.createElement('span');
    r.className = 'ripple';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    pad.appendChild(r);
    const a = r.animate(
      [
        { transform: 'scale(0.3)', opacity: 0.45 + 0.4 * v },
        { transform: 'scale(2.6)', opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    );
    a.onfinish = () => r.remove();
  }

  /** Queue a hit animation for an audio-clock time (playback, demos). */
  scheduleFlash(id, velocity, time) {
    this.enqueue({ t: time, run: () => this.flash(id, velocity) });
  }

  /** Show a shrinking ring that closes on the pad exactly at `time`. */
  scheduleApproach(id, time, lead = 1.2) {
    const piece = PIECE_BY_ID[id];
    this.enqueue({
      t: time - lead,
      run: () => {
        const pad = this.pads.get(id);
        if (!pad || pad.hidden) return;
        const ring = document.createElement('span');
        ring.className = 'approach' + (piece.kind === 'kick' || piece.kind === 'pedal' ? ' foot' : '');
        pad.appendChild(ring);
        const remaining = Math.max(0.05, time - this.getVisualTime());
        const a = ring.animate(
          [
            { transform: 'scale(1.9)', opacity: 0 },
            { opacity: 1, offset: 0.3 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: remaining * 1000, easing: 'linear', fill: 'forwards' },
        );
        a.onfinish = () => {
          const out = ring.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.92)' }], { duration: 140 });
          out.onfinish = () => ring.remove();
        };
      },
    });
  }

  showJudgment(id, text, cls) {
    const pad = this.pads.get(id);
    if (!pad || pad.hidden) return;
    pad.querySelectorAll('.judge').forEach((j) => j.remove());
    const j = document.createElement('span');
    j.className = `judge ${cls}`;
    j.textContent = text;
    pad.appendChild(j);
    const a = j.animate(
      [
        { transform: 'translate(-50%, -30%) scale(0.8)', opacity: 0 },
        { transform: 'translate(-50%, -60%) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -110%) scale(1)', opacity: 0 },
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
    this.el.querySelectorAll('.approach').forEach((r) => r.remove());
  }

  tick() {
    if (this.destroyed) return;
    const now = this.getVisualTime();
    while (this.queue.length && this.queue[0].t <= now) this.queue.shift().run();
    this.raf = requestAnimationFrame(this.tick);
  }
}
