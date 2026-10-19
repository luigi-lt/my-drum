// Runs a lesson: count-in, approach rings on the pads, timing judgement,
// and an optional demo mode where the app plays the pattern for you.

import { compileLesson } from './lessons.js';
import { createScore, judgeHit, expireMisses, accuracy, stars } from './scoring.js';
import { PIECE_BY_ID } from '../kit/pieces.js';

const LABEL = { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late' };

/** Transport track that plays the lesson pattern in demo mode. */
export class LessonTrack {
  constructor(engine, stage) {
    this.engine = engine;
    this.stage = stage;
    this.notes = [];
    this.offset = 0;
    this.demo = false;
    this.enabled = false;
  }

  schedule(from, to, tr) {
    if (!this.enabled || !this.demo) return;
    for (const n of this.notes) {
      const b = n.beat + this.offset;
      if (b < from) continue;
      if (b >= to) break;
      const t = tr.timeAt(b);
      this.engine.trigger(PIECE_BY_ID[n.pieceId].sound, 0.85, { when: t });
      this.stage.scheduleFlash(n.pieceId, 0.85, t);
    }
  }
}

export class LessonSession {
  constructor({ engine, transport, metronome, track, stage, getVisualTime, onUpdate, onFinish }) {
    Object.assign(this, { engine, transport, metronome, track, stage, getVisualTime, onUpdate, onFinish });
    this.lesson = null;
    this.raf = 0;
  }

  get active() {
    return !!this.lesson;
  }

  start(lesson, { speed = 1, demo = false, click = true } = {}) {
    this.stop();
    const compiled = compileLesson(lesson);
    const tr = this.transport;
    tr.stop();
    tr.bpm = Math.round(lesson.bpm * speed);
    tr.beatsPerBar = 4;
    const countIn = 4;
    this.metronome.countInBeats = countIn;
    this.savedClick = this.metronome.enabled;
    this.metronome.enabled = click;
    Object.assign(this.track, { notes: compiled.notes, offset: countIn, demo, enabled: true });
    tr.start({ delay: 0.2 });

    this.lesson = lesson;
    this.demo = demo;
    this.speed = speed;
    this.notes = compiled.notes.map((n) => ({ t: tr.timeAt(countIn + n.beat), pieceId: n.pieceId, matched: false }));
    this.startTime = tr.timeAt(0);
    this.endTime = tr.timeAt(countIn + compiled.lengthBeats) + 0.3;
    this.score = createScore(this.notes.length);
    this.stage.forceVisible(compiled.pieces);
    const lead = Math.min(1.5, Math.max(0.7, 2 * tr.secPerBeat));
    for (const n of this.notes) this.stage.scheduleApproach(n.pieceId, n.t, lead);
    this.loop();
  }

  /** A pad was hit at `time` on the visual clock. */
  hit(pieceId, time) {
    if (!this.lesson || this.demo) return;
    const r = judgeHit(this.notes, pieceId, time, this.score);
    if (r) this.stage.showJudgment(pieceId, LABEL[r.grade], r.grade);
    this.onUpdate?.(this.status());
  }

  status() {
    const s = this.score;
    const now = this.getVisualTime();
    const span = this.endTime - this.startTime;
    // running accuracy over the notes judged so far
    const judgedPct = s.judged ? accuracy({ ...s, total: s.judged }) : 100;
    return {
      lesson: this.lesson,
      demo: this.demo,
      progress: Math.min(1, Math.max(0, (now - this.startTime) / span)),
      accuracy: judgedPct,
      combo: s.combo,
      countIn: now < this.notes[0]?.t - 0.05,
    };
  }

  loop() {
    const now = this.getVisualTime();
    if (!this.demo) {
      for (const m of expireMisses(this.notes, now, this.score)) this.stage.showJudgment(m.pieceId, 'Miss', 'miss');
    }
    this.onUpdate?.(this.status());
    if (now >= this.endTime) {
      this.finish();
      return;
    }
    this.raf = requestAnimationFrame(() => this.loop());
  }

  finish() {
    if (!this.demo) expireMisses(this.notes, Infinity, this.score);
    const pct = accuracy(this.score);
    const result = { lesson: this.lesson, demo: this.demo, speed: this.speed, pct, stars: stars(pct), score: { ...this.score } };
    this.stop();
    this.onFinish?.(result);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    if (!this.lesson) return;
    this.lesson = null;
    this.track.enabled = false;
    this.metronome.countInBeats = 0;
    this.metronome.enabled = this.savedClick;
    this.transport.stop();
    this.engine.stopAll();
    this.stage.clearScheduled();
    this.stage.forceVisible([]);
    this.onUpdate?.(null);
  }
}
