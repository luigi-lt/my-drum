// Records what you play as timed events (drum hits plus any backing-loop
// notes), plays takes back through the live engine, and renders them
// offline to a WAV file with the same mixer.

import { createMixer, playVoice, applyChokes } from './audio/engine.js';
import { playNote } from './music/backing.js';
import { encodeWav } from './audio/wav.js';
import { dbAll, dbPut, dbDelete } from './storage.js';
import { PIECE_FOR_SOUND } from './kit/pieces.js';

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

export class Recorder {
  constructor(engine) {
    this.engine = engine;
    this.active = false;
    this.t0 = 0;
    this.hits = [];
    this.notes = [];
    this.kit = null;
  }

  get elapsed() {
    return this.active ? this.engine.ctx.currentTime - this.t0 : 0;
  }

  /** @param {object[]} recentNotes backing notes already scheduled ahead */
  start(kit, recentNotes = []) {
    this.active = true;
    this.t0 = this.engine.ctx.currentTime;
    this.kit = kit;
    this.hits = [];
    this.notes = recentNotes.filter((n) => n.t >= this.t0).map((n) => ({ ...n, t: round(n.t - this.t0) }));
  }

  addHit(sound, velocity, time) {
    if (!this.active) return;
    this.hits.push([round(Math.max(0, time - this.t0)), sound, round(velocity, 3)]);
  }

  addNote(note) {
    if (!this.active) return;
    this.notes.push({ ...note, t: round(note.t - this.t0) });
  }

  /** Stop and return the take, or null if nothing was played. */
  stop(name) {
    if (!this.active) return null;
    this.active = false;
    const stopped = this.engine.ctx.currentTime - this.t0;
    if (!this.hits.length && !this.notes.length) return null;
    const notes = this.notes.filter((n) => n.t < stopped);
    const lastHit = this.hits.length ? this.hits[this.hits.length - 1][0] : 0;
    return {
      id: `rec-${Date.now().toString(36)}`,
      name,
      createdAt: Date.now(),
      duration: round(Math.max(stopped, lastHit + 0.5), 2),
      kit: this.kit,
      hits: this.hits,
      notes,
    };
  }
}

export async function listRecordings() {
  const rows = await dbAll('recordings');
  return rows.map(([, v]) => v).sort((a, b) => b.createdAt - a.createdAt);
}

export const saveRecording = (rec) => dbPut('recordings', rec);
export const deleteRecording = (id) => dbDelete('recordings', id);

/** Live playback of a take, with pad animations. */
export class RecordingPlayer {
  constructor(engine, stage) {
    this.engine = engine;
    this.stage = stage;
    this.timer = null;
    this.endTimer = null;
    this.out = null;
    this.playingId = null;
  }

  play(rec, buffers, overrides, onEnd) {
    this.stop();
    const ctx = this.engine.ctx;
    const t0 = ctx.currentTime + 0.12;
    this.playingId = rec.id;
    this.out = ctx.createGain();
    this.out.connect(this.engine.mixer.backingBus);
    let hi = 0;
    let ni = 0;
    const pump = () => {
      const horizon = ctx.currentTime + 0.25 - t0;
      while (hi < rec.hits.length && rec.hits[hi][0] < horizon) {
        const [t, sound, v] = rec.hits[hi++];
        const when = t0 + t;
        const buffer = overrides?.get(sound) ?? buffers.get(sound);
        this.engine.trigger(sound, v, { when, humanize: false, buffer });
        const piece = PIECE_FOR_SOUND[sound];
        if (piece) this.stage.scheduleFlash(piece, v, when);
      }
      while (ni < rec.notes.length && rec.notes[ni].t < horizon) {
        const n = rec.notes[ni++];
        playNote(ctx, this.out, n, t0 + n.t, n.dur);
      }
    };
    pump();
    this.timer = setInterval(pump, 50);
    this.endTimer = setTimeout(
      () => {
        this.stop();
        onEnd?.();
      },
      (rec.duration + 0.4) * 1000,
    );
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.endTimer);
    this.timer = this.endTimer = null;
    if (this.playingId) {
      this.engine.stopAll();
      this.stage.clearScheduled();
    }
    if (this.out) {
      const g = this.out;
      g.gain.setTargetAtTime(0, this.engine.ctx.currentTime, 0.02);
      setTimeout(() => g.disconnect(), 300);
      this.out = null;
    }
    this.playingId = null;
  }
}

/**
 * Render a take offline. `buffers` maps sound ids to AudioBuffers.
 * Returns a WAV ArrayBuffer.
 */
export async function renderRecording(rec, buffers, overrides, mix, sampleRate) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const tail = 2.5;
  const ctx = new OAC(2, Math.ceil((rec.duration + tail) * sampleRate), sampleRate);
  const mixer = createMixer(ctx, mix);
  const voices = [];
  for (const [t, sound, v] of rec.hits) {
    const buf = overrides?.get(sound) ?? buffers.get(sound);
    const strip = mixer.strips[sound];
    if (!buf || !strip) continue;
    applyChokes(voices, sound, t);
    const voice = playVoice(ctx, strip.input, buf, t, v, null);
    voice.soundId = sound;
    voices.push(voice);
  }
  for (const n of rec.notes) playNote(ctx, mixer.backingBus, n, n.t, n.dur);
  const out = await ctx.startRendering();
  return encodeWav([out.getChannelData(0), out.getChannelData(1)], sampleRate);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
