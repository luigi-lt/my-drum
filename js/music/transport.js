// Look-ahead scheduler ("two clocks" pattern): a timer wakes every 25 ms and
// schedules everything due in the next 150 ms on the audio clock.

import { playNote, playClick } from './backing.js';
import { compileLoop, loopEvents, LOOP_BY_ID } from './loops.js';

function createTicker(fn) {
  let worker = null;
  let interval = null;
  let active = false;
  const fallback = () => {
    worker = null;
    if (active && !interval) interval = setInterval(fn, 25);
  };
  try {
    worker = new Worker(new URL('./ticker-worker.js', import.meta.url));
    worker.onmessage = fn;
    worker.onerror = fallback;
  } catch {
    worker = null;
  }
  return {
    start() {
      active = true;
      if (worker) worker.postMessage('start');
      else if (!interval) interval = setInterval(fn, 25);
    },
    stop() {
      active = false;
      if (worker) worker.postMessage('stop');
      clearInterval(interval);
      interval = null;
    },
  };
}

export class Transport {
  /**
   * @param {BaseAudioContext} ctx
   * @param {{backing?: AudioNode, click?: AudioNode}} buses where tracks send audio
   */
  constructor(ctx, buses = {}) {
    this.ctx = ctx;
    this.buses = buses;
    this.bpm = 100;
    this.beatsPerBar = 4;
    this.running = false;
    this.anchorTime = 0;
    this.anchorBeat = 0;
    this.scheduledUntil = 0;
    this.lookahead = 0.15;
    this.tracks = [];
    this.listeners = new Set();
    this.out = null;
    this.ticker = createTicker(() => this.pump());
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type) {
    for (const f of this.listeners) f(type, this);
  }

  get secPerBeat() {
    return 60 / this.bpm;
  }

  beatAt(time) {
    return this.anchorBeat + (time - this.anchorTime) / this.secPerBeat;
  }

  timeAt(beat) {
    return this.anchorTime + (beat - this.anchorBeat) * this.secPerBeat;
  }

  addTrack(track) {
    this.tracks.push(track);
    return track;
  }

  /** Fresh output gains per run, so stop() can silence notes already scheduled. */
  makeOutputs() {
    const mk = (dest) => {
      if (!dest) return null;
      const g = this.ctx.createGain();
      g.connect(dest);
      return g;
    };
    return { backing: mk(this.buses.backing), click: mk(this.buses.click) };
  }

  start({ delay = 0.1 } = {}) {
    if (this.running) this.stop();
    this.out = this.makeOutputs();
    this.anchorTime = this.ctx.currentTime + delay;
    this.anchorBeat = 0;
    this.scheduledUntil = 0;
    this.running = true;
    for (const t of this.tracks) t.reset?.(this);
    this.ticker.start();
    this.pump();
    this.emit('start');
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.ticker.stop();
    const out = this.out;
    if (out) {
      const t = this.ctx.currentTime;
      for (const g of Object.values(out)) {
        if (!g) continue;
        g.gain.setTargetAtTime(0, t, 0.02);
        setTimeout(() => g.disconnect(), 400);
      }
    }
    for (const t of this.tracks) t.stop?.(this);
    this.emit('stop');
  }

  setBpm(bpm) {
    const next = Math.min(260, Math.max(30, Math.round(bpm)));
    if (this.running) {
      const t = Math.max(this.ctx.currentTime, this.anchorTime);
      this.anchorBeat = this.beatAt(t);
      this.anchorTime = t;
    }
    this.bpm = next;
    this.emit('tempo');
  }

  pump() {
    if (!this.running) return;
    const until = this.beatAt(this.ctx.currentTime + this.lookahead);
    if (until <= this.scheduledUntil) return;
    const from = this.scheduledUntil;
    this.scheduledUntil = until;
    for (const t of this.tracks) t.schedule(from, until, this);
  }
}

/** Metronome clicks, plus a one-bar count-in when requested. */
export class MetronomeTrack {
  constructor() {
    this.enabled = false;
    this.countInBeats = 0;
  }

  schedule(from, to, tr) {
    if (!tr.out?.click) return;
    for (let b = Math.ceil(from); b < to; b++) {
      if (b < 0) continue;
      const counting = b < this.countInBeats;
      if (!this.enabled && !counting) continue;
      playClick(tr.ctx, tr.out.click, tr.timeAt(b), b % tr.beatsPerBar === 0);
    }
  }
}

/** Plays a backing loop starting at `startBeat` (after any count-in). */
export class LoopTrack {
  constructor() {
    this.loopId = null;
    this.compiled = null;
    this.startBeat = 0;
    this.onNote = null;
    this.recent = [];
  }

  setLoop(loopId) {
    this.loopId = loopId;
    this.compiled = loopId && LOOP_BY_ID[loopId] ? compileLoop(LOOP_BY_ID[loopId]) : null;
  }

  reset() {
    this.recent = [];
  }

  schedule(from, to, tr) {
    if (!this.compiled || !tr.out?.backing) return;
    const now = tr.ctx.currentTime;
    this.recent = this.recent.filter((n) => n.t + n.dur > now);
    const evs = loopEvents(this.compiled, Math.max(0, from - this.startBeat), to - this.startBeat);
    for (const ev of evs) {
      const t = tr.timeAt(ev.beat + this.startBeat);
      const dur = ev.dur * tr.secPerBeat;
      playNote(tr.ctx, tr.out.backing, ev, t, dur);
      const note = { t, dur, inst: ev.inst, midi: ev.midi, vel: ev.vel, mute: ev.mute };
      this.recent.push(note);
      this.onNote?.(note);
    }
  }
}
