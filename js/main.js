// MyDrum: wires the sound engine, the stage, play-along transport,
// recorder, lessons, MIDI and the panels together.

import { DrumEngine } from './audio/engine.js';
import { KITS } from './audio/kits.js';
import { KEY_MAP } from './kit/pieces.js';
import { mergeLayout, defaultLayout } from './kit/layout.js';
import { Stage } from './ui/stage.js';
import { createPanelHost, esc, icon } from './ui/panels.js';
import { loadSettings, createStore, clearSettings, dbAll, dbPut, dbDelete } from './storage.js';
import { Transport, MetronomeTrack, LoopTrack } from './music/transport.js';
import { LOOP_BY_ID } from './music/loops.js';
import { LESSONS, LESSON_BY_ID } from './lessons/lessons.js';
import { LessonSession, LessonTrack } from './lessons/session.js';
import {
  Recorder,
  RecordingPlayer,
  listRecordings,
  saveRecording,
  deleteRecording,
  renderRecording,
  downloadBlob,
  formatTime,
} from './recorder.js';
import { MidiInput } from './input/midi.js';
import { PIECES } from './kit/pieces.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

export const DEFAULTS = {
  kit: 'studio',
  customBase: 'studio',
  finish: 'maple',
  volume: 0.85,
  room: 0.25,
  backingVolume: 0.6,
  clickVolume: 0.6,
  velocity: 0.85,
  pressure: false,
  zones: true,
  vibrate: false,
  wakeLock: true,
  labels: true,
  keys: !coarse,
  mirror: false,
  layout: null,
  bpm: 120,
  beatsPerBar: 4,
  loopId: 'rock-anthem',
  countIn: true,
  lessonSpeed: 1,
  lessonClick: true,
  lessonBest: {},
  midi: false,
  portraitMode: '',
};

// ------------------------------------------------------------------ state

const settings = createStore(loadSettings(DEFAULTS));
let layout = mergeLayout(settings.get().layout);

const state = {
  loopPlaying: false,
  metronome: false,
  recordings: [],
  takeCounter: 0,
  playingRecording: null,
  customSamples: new Map(),
  loadingKit: null,
  loopTouched: false,
  inFrame,
};

const engine = new DrumEngine();
const getVisualTime = () => engine.ctx.currentTime - engine.latency;

const stage = new Stage({
  wrap: $('#stage-wrap'),
  el: $('#stage'),
  onHit: play,
  onLayoutEdit: saveLayout,
  getVisualTime,
});

const transport = new Transport(engine.ctx, { backing: engine.mixer.backingBus, click: engine.mixer.clickBus });
const metronome = transport.addTrack(new MetronomeTrack());
const loopTrack = transport.addTrack(new LoopTrack());
const lessonTrack = transport.addTrack(new LessonTrack(engine, stage));
const recorder = new Recorder(engine);
const player = new RecordingPlayer(engine, stage);
loopTrack.onNote = (n) => recorder.addNote(n);

const lessons = new LessonSession({
  engine,
  transport,
  metronome,
  track: lessonTrack,
  stage,
  getVisualTime,
  onUpdate: updateLessonHud,
  onFinish: showLessonResult,
});

const midi = new MidiInput(
  (target, velocity) => play(target.pieceId, target.sound, velocity, { source: 'midi' }),
  () => panels.refresh('settings'),
);

// ------------------------------------------------------------------ playing

function play(pieceId, sound, velocity, info = {}) {
  engine.unlock();
  const t = engine.trigger(sound, velocity);
  stage.flash(pieceId, velocity, info.source === 'touch' ? { x: info.x, y: info.y } : null);
  if (t !== null) recorder.addHit(sound, velocity, t);
  if (lessons.active) lessons.hit(pieceId, getVisualTime());
  if (info.source === 'touch' && settings.get().vibrate) navigator.vibrate?.(8);
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target;
  if (target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
  if (e.key === 'Escape') {
    if (!$('#piece-pop').hidden) $('#piece-pop').hidden = true;
    else if (document.querySelector('.modal-back')) closeModal();
    else if (panels.current) panels.close();
    else if (stage.editing) exitEdit();
    else if (lessons.active) stopLesson();
    return;
  }
  const m = KEY_MAP[e.code];
  if (!m || stage.editing) return;
  e.preventDefault();
  if (e.repeat) return;
  play(m.pieceId, m.sound, e.shiftKey ? 1 : settings.get().velocity, { source: 'key' });
});

// unlock audio on the first gesture of any kind (iOS needs this)
const unlock = () => {
  engine.unlock();
  requestWakeLock();
};
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });
window.addEventListener('touchend', () => engine.unlock(), { capture: true });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------- kits/sounds

function overrideMap() {
  const m = new Map();
  for (const [k, v] of state.customSamples) m.set(k, v.buffer);
  return m;
}

function applyOverrides() {
  engine.setOverrides(settings.get().kit === 'custom' ? overrideMap() : null);
}

async function applyKit() {
  const s = settings.get();
  const base = s.kit === 'custom' ? s.customBase : s.kit;
  const name = s.kit === 'custom' ? 'My Kit' : (KITS.find((k) => k.id === base)?.name ?? 'kit');
  const slow = !engine.isLoaded(base);
  if (slow) {
    state.loadingKit = s.kit;
    showLoading(`Tuning ${name}`);
    panels.refresh('kits');
  }
  try {
    await engine.loadKit(base, setLoading);
  } catch (err) {
    toast(`Could not build the ${name} sounds: ${err.message}`);
  }
  applyOverrides();
  state.loadingKit = null;
  if (slow) hideLoading();
  panels.refresh('kits');
}

function decode(data) {
  return new Promise((resolve, reject) => {
    const p = engine.ctx.decodeAudioData(data.slice(0), resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

async function loadCustomSamples() {
  for (const [sound, v] of await dbAll('samples')) {
    try {
      state.customSamples.set(sound, { name: v.name, buffer: await decode(v.data) });
    } catch {
      /* unreadable sample: ignore */
    }
  }
  applyOverrides();
}

// ------------------------------------------------------------ play-along

function startMetronomeOnly() {
  loopTrack.setLoop(null);
  transport.stop();
  transport.bpm = settings.get().bpm;
  transport.beatsPerBar = settings.get().beatsPerBar;
  metronome.countInBeats = 0;
  metronome.enabled = true;
  transport.start();
}

function startLoop(id) {
  const loop = LOOP_BY_ID[id];
  if (!loop) return;
  if (lessons.active) lessons.stop();
  stopPlayback();
  const patch = { loopId: id };
  if (id !== settings.get().loopId || !state.loopTouched) patch.bpm = loop.bpm;
  state.loopTouched = true;
  settings.set(patch);
  engine.unlock();
  transport.stop();
  loopTrack.setLoop(id);
  transport.bpm = settings.get().bpm;
  transport.beatsPerBar = loop.beatsPerBar;
  const countIn = settings.get().countIn ? loop.beatsPerBar : 0;
  loopTrack.startBeat = countIn;
  metronome.countInBeats = countIn;
  metronome.enabled = state.metronome;
  transport.start();
  state.loopPlaying = true;
  updateToolbar();
  panels.refresh('loops');
}

function stopLoop() {
  transport.stop();
  loopTrack.setLoop(null);
  metronome.countInBeats = 0;
  state.loopPlaying = false;
  if (state.metronome) startMetronomeOnly();
  updateToolbar();
  panels.refresh('loops');
}

function setMetronome(on) {
  state.metronome = on;
  metronome.enabled = on;
  if (!lessons.active) {
    if (on && !transport.running) {
      engine.unlock();
      startMetronomeOnly();
    }
    if (!on && transport.running && !state.loopPlaying) transport.stop();
  }
  updateToolbar();
}

function setBpm(v) {
  const bpm = clamp(Math.round(v), 40, 240);
  settings.set({ bpm });
  if (!lessons.active) transport.setBpm(bpm);
  updateToolbar();
}

// ------------------------------------------------------------- recording

async function toggleRecord() {
  engine.unlock();
  if (recorder.active) {
    const n = state.takeCounter + 1;
    const rec = recorder.stop(`Take ${n}`);
    if (rec) {
      state.takeCounter = n;
      state.recordings.unshift(rec);
      await saveRecording(rec);
      toast(`Saved ${rec.name} (${formatTime(rec.duration)}). Find it under Recordings.`);
    } else {
      toast('Nothing saved: no hits were recorded.');
    }
  } else {
    stopPlayback();
    const s = settings.get();
    recorder.start({ id: s.kit, base: engine.kitId }, loopTrack.recent);
    toast('Recording. Press Rec again to save the take.');
  }
  updateToolbar();
  panels.refresh('recordings');
}

function stopPlayback() {
  if (!state.playingRecording) return;
  player.stop();
  state.playingRecording = null;
  panels.refresh('recordings');
}

async function recordingSounds(rec) {
  const base = rec.kit?.base ?? engine.kitId;
  const buffers = await engine.ensureKit(base);
  const overrides = rec.kit?.id === 'custom' ? overrideMap() : null;
  return { buffers, overrides };
}

async function togglePlayback(rec) {
  if (state.playingRecording === rec.id) {
    stopPlayback();
    return;
  }
  if (recorder.active) {
    toast('Stop recording before playing a take.');
    return;
  }
  stopPlayback();
  engine.unlock();
  const { buffers, overrides } = await recordingSounds(rec);
  player.play(rec, buffers, overrides, () => {
    state.playingRecording = null;
    panels.refresh('recordings');
  });
  state.playingRecording = rec.id;
  panels.refresh('recordings');
}

async function exportRecording(rec, button) {
  button.disabled = true;
  toast(`Rendering ${rec.name}…`);
  try {
    const { buffers, overrides } = await recordingSounds(rec);
    const s = settings.get();
    const wav = await renderRecording(
      rec,
      buffers,
      overrides,
      { volume: s.volume, room: s.room, backing: s.backingVolume, mirror: s.mirror },
      engine.sampleRate,
    );
    const file = `${rec.name.replace(/[^\w\- ]+/g, '').trim() || 'take'}.wav`;
    downloadBlob(new Blob([wav], { type: 'audio/wav' }), file);
    toast(`${file} is ready.`);
  } catch (err) {
    toast(`Could not export: ${err.message}`);
  } finally {
    button.disabled = false;
  }
}

// ---------------------------------------------------------------- lessons

function startLesson(id, { demo = false } = {}) {
  const lesson = LESSON_BY_ID[id];
  if (!lesson) return;
  if (state.loopPlaying) {
    transport.stop();
    loopTrack.setLoop(null);
    state.loopPlaying = false;
  }
  stopPlayback();
  if (stage.editing) exitEdit();
  closeModal();
  panels.close();
  engine.unlock();
  loopTrack.setLoop(null);
  const s = settings.get();
  lessons.start(lesson, { speed: s.lessonSpeed, demo, click: s.lessonClick });
  updateToolbar();
}

function stopLesson() {
  lessons.stop();
  afterLesson();
}

function afterLesson() {
  if (state.metronome) startMetronomeOnly();
  transport.bpm = settings.get().bpm;
  updateToolbar();
}

let hudCache = '';
function updateLessonHud(st) {
  const hud = $('#lesson-hud');
  if (!st) {
    hud.hidden = true;
    hudCache = '';
    return;
  }
  hud.hidden = false;
  const label = st.demo ? 'Demo' : st.countIn ? 'Get ready' : `Combo ${st.combo}`;
  const key = `${st.lesson.id}|${label}|${st.accuracy}|${st.demo}`;
  if (key !== hudCache) {
    hudCache = key;
    $('#hud-title').innerHTML = `${esc(st.lesson.title)} <span>· ${label}</span>`;
    $('#hud-score').firstChild.textContent = st.demo ? '--' : `${st.accuracy}%`;
  }
  $('#hud-progress').style.transform = `scaleX(${st.progress.toFixed(4)})`;
}

function showLessonResult(result) {
  afterLesson();
  const { lesson } = result;
  const idx = LESSONS.findIndex((l) => l.id === lesson.id);
  const next = LESSONS[idx + 1];
  let body;
  if (result.demo) {
    body = `<h3>${esc(lesson.title)}</h3>
      <p class="note">${esc(lesson.tip)}</p>
      <div class="btn-row"><button class="btn primary" data-act="play">Play it now</button><button class="btn" data-act="close">Close</button></div>`;
  } else {
    const best = settings.get().lessonBest || {};
    const prev = best[lesson.id];
    const isBest = !prev || result.pct > prev.pct;
    if (isBest) settings.set({ lessonBest: { ...best, [lesson.id]: { pct: result.pct, stars: result.stars } } });
    const sc = result.score;
    const verdict =
      result.stars === 3 ? 'Nailed it' : result.stars === 2 ? 'Solid groove' : result.stars === 1 ? 'Getting there' : 'Keep practising';
    body = `<h3>${verdict}</h3>
      <div class="result-stars">${[0, 1, 2].map((i) => `<span style="color:var(${i < result.stars ? '--amber' : '--faint'})">${icon('star', 'fill')}</span>`).join('')}</div>
      <div class="result-score">${result.pct}%</div>
      <p class="note">${esc(lesson.title)} at ${Math.round(result.speed * 100)}% speed${isBest && prev ? ' · new best' : ''}</p>
      <div class="result-grid">
        <div><b>${sc.perfect}</b>Perfect</div><div><b>${sc.good}</b>Good</div><div><b>${sc.early + sc.late}</b>Off</div><div><b>${sc.miss}</b>Missed</div>
      </div>
      ${sc.extra ? `<p class="note">${sc.extra} extra ${sc.extra === 1 ? 'hit' : 'hits'} outside the pattern.</p>` : ''}
      <div class="btn-row">
        <button class="btn primary" data-act="retry">Try again</button>
        ${next ? `<button class="btn" data-act="next">Next: ${esc(next.title)}</button>` : ''}
        <button class="btn" data-act="close">Close</button>
      </div>`;
  }
  openModal(body, (act) => {
    if (act === 'retry' || act === 'play') startLesson(lesson.id);
    else if (act === 'next') startLesson(next.id);
    else closeModal();
  });
  panels.refresh('lessons');
}

function openModal(html, onAct) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) onAct(act.dataset.act);
    else if (e.target === back) closeModal();
  });
  $('#app').appendChild(back);
  back.querySelector('.btn.primary, .btn')?.focus();
}

function closeModal() {
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
}

// ------------------------------------------------------------ layout edit

function serializeLayout(l) {
  const out = {};
  for (const [id, it] of Object.entries(l)) out[id] = { x: Math.round(it.x), y: Math.round(it.y), d: Math.round(it.d), hidden: it.hidden };
  return out;
}

function saveLayout(l) {
  settings.set({ layout: serializeLayout(l) });
}

function enterEdit() {
  panels.close();
  if (lessons.active) stopLesson();
  stage.setEditing(true);
  $('#edit-bar').hidden = false;
  updateEditBar();
}

function exitEdit() {
  stage.setEditing(false);
  $('#edit-bar').hidden = true;
  $('#piece-pop').hidden = true;
  saveLayout(layout);
  toast('Layout saved.');
}

function updateEditBar() {
  $('#btn-mirror').setAttribute('aria-pressed', String(settings.get().mirror));
}

function renderPiecePop() {
  const pop = $('#piece-pop');
  pop.innerHTML = PIECES.map(
    (p) => `<label class="toggle" for="show-${p.id}"><span class="toggle-text"><span>${p.name}</span></span>
      <input type="checkbox" id="show-${p.id}" data-piece="${p.id}" ${layout[p.id].hidden ? '' : 'checked'}></label>`,
  ).join('');
}

$('#piece-pop').addEventListener('change', (e) => {
  const id = e.target.dataset.piece;
  if (!id) return;
  layout[id].hidden = !e.target.checked;
  stage.place();
  saveLayout(layout);
});

let resetArmed = null;
$('#edit-bar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'btn-done') exitEdit();
  if (b.id === 'btn-pieces') {
    const pop = $('#piece-pop');
    if (pop.hidden) renderPiecePop();
    pop.hidden = !pop.hidden;
  }
  if (b.id === 'btn-mirror') {
    settings.set({ mirror: !settings.get().mirror });
    updateEditBar();
  }
  if (b.id === 'btn-reset-layout') {
    if (resetArmed) {
      clearTimeout(resetArmed);
      resetArmed = null;
      layout = defaultLayout();
      stage.setLayout(layout, settings.get().mirror);
      saveLayout(layout);
      b.querySelector('.tool-label').textContent = 'Reset';
      toast('Layout reset to the standard kit.');
      if (!$('#piece-pop').hidden) renderPiecePop();
    } else {
      b.querySelector('.tool-label').textContent = 'Tap again';
      resetArmed = setTimeout(() => {
        resetArmed = null;
        b.querySelector('.tool-label').textContent = 'Reset';
      }, 2500);
    }
  }
});

// -------------------------------------------------------------- toolbar

const panels = createPanelHost(
  {
    settings,
    state,
    engine,
    recorder,
    midi,
    setBpm,
    setBeatsPerBar(n) {
      settings.set({ beatsPerBar: n });
      if (!state.loopPlaying && !lessons.active) transport.beatsPerBar = n;
    },
    setMetronome,
    setMix(patch) {
      settings.set(patch);
      if ('volume' in patch) engine.setVolume(patch.volume);
      if ('room' in patch) engine.setRoom(patch.room);
      if ('backingVolume' in patch) engine.setBackingVolume(patch.backingVolume);
      if ('clickVolume' in patch) engine.setClickVolume(patch.clickVolume);
    },
    toggleLoop(id = settings.get().loopId) {
      if (state.loopPlaying && id === settings.get().loopId) stopLoop();
      else startLoop(id);
    },
    toggleRecord,
    togglePlayback,
    exportRecording,
    async removeRecording(rec) {
      if (state.playingRecording === rec.id) stopPlayback();
      await deleteRecording(rec.id);
      state.recordings = state.recordings.filter((r) => r.id !== rec.id);
      toast(`Deleted ${rec.name}.`);
      panels.refresh('recordings');
    },
    async renameRecording(rec, name) {
      rec.name = name;
      await saveRecording(rec);
      panels.refresh('recordings');
    },
    startLesson,
    async selectKit(id, base) {
      const s = settings.get();
      const patch = { kit: id };
      if (base) patch.customBase = base;
      const meta = KITS.find((k) => k.id === id);
      if (meta && id !== s.kit) patch.finish = meta.finish;
      settings.set(patch);
      panels.refresh('kits');
      await applyKit();
    },
    async loadCustomSample(sound, file) {
      try {
        if (file.size > 8 * 1024 * 1024) throw new Error('the file is over 8 MB, use a short one-shot sample');
        const data = await file.arrayBuffer();
        const buffer = await decode(data);
        await dbPut('samples', { name: file.name, data }, sound);
        state.customSamples.set(sound, { name: file.name, buffer });
        applyOverrides();
        engine.unlock();
        engine.trigger(sound, 0.85);
        toast(`Loaded ${file.name}.`);
      } catch (err) {
        toast(`Could not load that file: ${err?.message || 'the format is not supported'}.`);
      }
      panels.refresh('kits');
    },
    async clearCustomSample(sound) {
      await dbDelete('samples', sound);
      state.customSamples.delete(sound);
      applyOverrides();
      panels.refresh('kits');
    },
    async connectMidi() {
      try {
        await midi.connect();
        settings.set({ midi: true });
        toast(midi.devices.length ? `MIDI connected: ${midi.devices.join(', ')}` : 'MIDI is on. Plug in your drum kit.');
      } catch (err) {
        toast(err?.message || 'MIDI access was blocked.');
      }
      panels.refresh('settings');
    },
    disconnectMidi() {
      midi.disconnect();
      settings.set({ midi: false });
      panels.refresh('settings');
    },
    setWakeLock(on) {
      settings.set({ wakeLock: on });
      if (on) requestWakeLock();
      else releaseWakeLock();
    },
    resetSettings() {
      clearSettings();
      location.reload();
    },
    refreshPanel() {
      panels.refresh();
    },
    onPanelChange(name) {
      document.querySelectorAll('[data-panel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.panel === name)));
    },
  },
  { el: $('#panel'), title: $('#panel-title'), body: $('#panel-body'), close: $('#panel-close') },
);

function updateToolbar() {
  const s = settings.get();
  const loopBtn = $('#btn-loop');
  loopBtn.setAttribute('aria-pressed', String(state.loopPlaying));
  loopBtn.querySelector('use').setAttribute('href', state.loopPlaying ? '#i-stop' : '#i-play');
  loopBtn.setAttribute('aria-label', state.loopPlaying ? 'Stop backing loop' : 'Play backing loop');
  $('#loop-name').textContent = LOOP_BY_ID[s.loopId]?.name ?? 'Loop';
  $('#btn-metronome').setAttribute('aria-pressed', String(state.metronome));
  $('#bpm-value').textContent = lessons.active ? String(transport.bpm) : String(s.bpm);
  const rec = $('#btn-record');
  rec.classList.toggle('recording', recorder.active);
  rec.setAttribute('aria-label', recorder.active ? 'Stop recording and save' : 'Start recording');
  if (!recorder.active) $('#rec-time').textContent = 'Rec';
}

document.querySelector('.toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (e.detail) b.blur(); // pointer clicks should not leave focus for Space to re-trigger
  if (b.dataset.panel) panels.toggle(b.dataset.panel);
  else if (b.id === 'btn-loop') toggleCurrentLoop();
  else if (b.id === 'btn-metronome') setMetronome(!state.metronome);
  else if (b.id === 'btn-bpm') panels.toggle('loops');
  else if (b.id === 'btn-record') toggleRecord();
  else if (b.id === 'btn-edit') enterEdit();
  else if (b.id === 'btn-fullscreen') toggleFullscreen();
});

function toggleCurrentLoop() {
  if (state.loopPlaying) stopLoop();
  else startLoop(settings.get().loopId);
}

$('#hud-stop').addEventListener('click', () => stopLesson());

// beat lights and the record timer
let dotCount = 0;
function buildDots(n) {
  dotCount = n;
  $('#beat-dots').innerHTML = Array.from({ length: n }, () => '<span></span>').join('');
}
buildDots(4);

function uiTick() {
  const dots = $('#beat-dots').children;
  if (transport.running) {
    if (dotCount !== transport.beatsPerBar) buildDots(transport.beatsPerBar);
    const b = transport.beatAt(getVisualTime());
    const idx = b >= 0 ? Math.floor(b) % transport.beatsPerBar : -1;
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('on', i === idx);
      dots[i].classList.toggle('accent', i === 0);
    }
    transport.pump();
  } else {
    for (const d of dots) d.classList.remove('on');
  }
  if (recorder.active) $('#rec-time').textContent = formatTime(recorder.elapsed);
  requestAnimationFrame(uiTick);
}

// ------------------------------------------------------------ chrome bits

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function showLoading(text) {
  const el = $('#loading');
  el.hidden = false;
  el.classList.remove('done');
  $('#loading-text').textContent = text;
  setLoading(0);
}

function setLoading(p) {
  $('#loading-bar').style.transform = `scaleX(${p})`;
}

function hideLoading() {
  const el = $('#loading');
  el.classList.add('done');
  setTimeout(() => {
    if (el.classList.contains('done')) el.hidden = true;
  }, 450);
}

let wakeLock = null;
async function requestWakeLock() {
  if (!settings.get().wakeLock || wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

const fsEnabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
if (!fsEnabled) $('#btn-fullscreen').hidden = true;

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const el = document.documentElement;
      await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
      await screen.orientation?.lock?.('landscape').catch(() => {});
    } else {
      await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.());
    }
  } catch {
    toast('Fullscreen is not available here.');
  }
}

function checkOrientation() {
  const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 640;
  const choice = settings.get().portraitMode;
  const turn = portrait && choice === 'turned';
  const app = $('#app');
  app.classList.toggle('rotated', turn);
  app.style.width = turn ? `${window.innerHeight}px` : '';
  app.style.height = turn ? `${window.innerWidth}px` : '';
  stage.rotated = turn;
  $('#rotate-hint').hidden = !portrait || choice !== '';
}
window.addEventListener('resize', checkOrientation);
$('#rotate-turn').addEventListener('click', () => settings.set({ portraitMode: 'turned' }));
$('#rotate-dismiss').addEventListener('click', () => settings.set({ portraitMode: 'upright' }));

// ------------------------------------------------------- settings changes

function applyStageOptions(s) {
  stage.setOptions({
    labels: s.labels,
    keys: s.keys,
    zones: s.zones,
    finish: s.finish,
    pressure: s.pressure,
    velocity: s.velocity,
  });
}

settings.subscribe((s, patch) => {
  applyStageOptions(s);
  if ('mirror' in patch) {
    stage.setLayout(layout, s.mirror);
    engine.setMirror(s.mirror);
  }
  if ('portraitMode' in patch) checkOrientation();
});

// ------------------------------------------------------------------ boot

async function boot() {
  const s = settings.get();
  engine.setVolume(s.volume);
  engine.setRoom(s.room);
  engine.setBackingVolume(s.backingVolume);
  engine.setClickVolume(s.clickVolume);
  engine.setMirror(s.mirror);
  transport.bpm = s.bpm;
  transport.beatsPerBar = s.beatsPerBar;
  applyStageOptions(s);
  stage.setLayout(layout, s.mirror);
  updateToolbar();
  checkOrientation();
  requestAnimationFrame(uiTick);

  await applyKit();
  await loadCustomSamples();
  state.recordings = await listRecordings();
  state.takeCounter = state.recordings.reduce((n, r) => Math.max(n, Number(/^Take (\d+)$/.exec(r.name)?.[1] ?? 0)), 0);
  if (s.midi && midi.supported) midi.connect().catch(() => {});

  if ('serviceWorker' in navigator && !inFrame && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  document.body.dataset.ready = 'true';
}

boot();

// handy for debugging and for the automated smoke test
window.myDrum = { engine, transport, stage, settings, state, recorder, lessons, play };
