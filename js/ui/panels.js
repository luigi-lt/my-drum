// Side panels. Each panel renders into the panel body and wires its own
// controls; `app` exposes state and actions (see main.js).

import { KITS } from '../audio/kits.js';
import { LOOPS } from '../music/loops.js';
import { LESSONS } from '../lessons/lessons.js';
import { PIECES, keyLabel } from '../kit/pieces.js';
import { formatTime } from '../recorder.js';

export const FINISHES = [
  { id: 'maple', name: 'Natural maple', a: '#d08a47', b: '#7a4720' },
  { id: 'red', name: 'Red sparkle', a: '#c4222e', b: '#5a0910' },
  { id: 'black', name: 'Satin black', a: '#3c3c41', b: '#0b0b0d' },
  { id: 'white', name: 'Arctic white', a: '#f1ede6', b: '#a39b8e' },
  { id: 'blue', name: 'Blue sparkle', a: '#2f6bd0', b: '#0e2350' },
  { id: 'green', name: 'Racing green', a: '#3f8f5a', b: '#12331f' },
];

export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const pct = (v) => `${Math.round(v * 100)}%`;

function slider(id, label, value, { min = 0, max = 1, step = 0.01, format = pct } = {}) {
  const fill = ((value - min) / (max - min)) * 100;
  return `<div class="field">
    <div class="field-head"><label for="${id}">${label}</label><output for="${id}" id="${id}-out">${format(value)}</output></div>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="--fill:${fill}%">
  </div>`;
}

function toggle(id, label, checked, hint = '') {
  return `<label class="toggle" for="${id}">
    <span class="toggle-text"><span>${label}</span>${hint ? `<small>${hint}</small>` : ''}</span>
    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
  </label>`;
}

/** Bind a slider rendered by slider(): updates its output and fill while dragging. */
function bindSlider(root, id, onInput, format = pct) {
  const input = root.querySelector(`#${id}`);
  const out = root.querySelector(`#${id}-out`);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    out.textContent = format(v);
    onInput(v);
  });
}

function bindToggle(root, id, onChange) {
  root.querySelector(`#${id}`).addEventListener('change', (e) => onChange(e.target.checked));
}

function starsHtml(n) {
  return `<span class="stars" aria-label="${n} of 3 stars">${[0, 1, 2]
    .map((i) => `<span class="${i < n ? 'on' : ''}">${icon('star', 'fill')}</span>`)
    .join('')}</span>`;
}

// ------------------------------------------------------------ play-along

function renderLoops(root, app) {
  const s = app.settings.get();
  const playingId = app.state.loopPlaying ? s.loopId : null;
  root.innerHTML = `
    <section class="section">
      <h3 class="section-title">Tempo</h3>
      <div class="tempo-box">
        <button class="round-btn" data-act="bpm-down" aria-label="Slower">${icon('minus')}</button>
        <div class="tempo-value" id="tempo-value">${s.bpm}<small>BPM</small></div>
        <button class="round-btn" data-act="bpm-up" aria-label="Faster">${icon('plus')}</button>
      </div>
      ${slider('bpm-slider', 'Tempo', s.bpm, { min: 40, max: 240, step: 1, format: (v) => `${v} BPM` })}
      <div class="btn-row"><button class="btn" data-act="tap">${icon('tap')} Tap tempo</button></div>
    </section>
    <section class="section">
      <h3 class="section-title">Backing loops</h3>
      <p class="note">Bass, keys and guitar with no drums, so you are the drummer. Tap a loop to play it.</p>
      <div class="list">
        ${LOOPS.map(
          (l) => `<div class="row selectable ${playingId === l.id ? 'current' : ''}" data-loop="${l.id}" role="button" tabindex="0">
            <span class="icon-btn" aria-hidden="true">${playingId === l.id ? '<span class="eq"><i></i><i></i><i></i></span>' : icon('play', 'fill')}</span>
            <span class="row-main"><span class="row-title">${l.name}</span><span class="row-meta">${l.bpm} BPM · ${l.chords.length} bars</span></span>
            <span class="tag">${l.genre}</span>
          </div>`,
        ).join('')}
      </div>
      ${toggle('count-in', 'Count-in', s.countIn, 'One bar of clicks before the band starts')}
      ${slider('backing-vol', 'Band volume', s.backingVolume)}
    </section>
    <section class="section">
      <h3 class="section-title">Metronome</h3>
      ${toggle('metro-on', 'Metronome click', app.state.metronome)}
      <div class="field">
        <div class="field-head"><label>Beats per bar</label></div>
        <div class="segmented" role="group" aria-label="Beats per bar">
          ${[2, 3, 4, 5, 6, 7].map((n) => `<button data-act="bpb" data-n="${n}" aria-pressed="${s.beatsPerBar === n}">${n}</button>`).join('')}
        </div>
      </div>
      ${slider('click-vol', 'Click volume', s.clickVolume)}
    </section>`;

  const setBpm = (v) => {
    app.setBpm(v);
    root.querySelector('#tempo-value').firstChild.textContent = String(app.settings.get().bpm);
    const sl = root.querySelector('#bpm-slider');
    sl.value = app.settings.get().bpm;
    sl.dispatchEvent(new Event('sync'));
  };
  bindSlider(
    root,
    'bpm-slider',
    (v) => setBpm(v),
    (v) => `${v} BPM`,
  );
  root.querySelector('#bpm-slider').addEventListener('sync', (e) => {
    const t = e.target;
    t.style.setProperty('--fill', `${((t.value - 40) / 200) * 100}%`);
    root.querySelector('#bpm-slider-out').textContent = `${t.value} BPM`;
  });
  bindToggle(root, 'metro-on', (on) => app.setMetronome(on));
  bindToggle(root, 'count-in', (on) => app.settings.set({ countIn: on }));
  bindSlider(root, 'click-vol', (v) => app.setMix({ clickVolume: v }));
  bindSlider(root, 'backing-vol', (v) => app.setMix({ backingVolume: v }));

  let taps = [];
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'bpm-down') setBpm(app.settings.get().bpm - 1);
      if (a === 'bpm-up') setBpm(app.settings.get().bpm + 1);
      if (a === 'bpb') {
        app.setBeatsPerBar(Number(act.dataset.n));
        root.querySelectorAll('[data-act="bpb"]').forEach((b) => b.setAttribute('aria-pressed', String(b === act)));
      }
      if (a === 'tap') {
        const now = performance.now();
        taps = taps.filter((t) => now - t < 2500);
        taps.push(now);
        if (taps.length >= 2) {
          const gaps = taps.slice(1).map((t, i) => t - taps[i]);
          setBpm(Math.round(60000 / (gaps.reduce((x, y) => x + y, 0) / gaps.length)));
        }
      }
      return;
    }
    const row = e.target.closest('[data-loop]');
    if (row) app.toggleLoop(row.dataset.loop);
  });
  root.addEventListener('keydown', (e) => {
    const row = e.target.closest('[data-loop]');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      app.toggleLoop(row.dataset.loop);
    }
  });
}

// ------------------------------------------------------------ recordings

function renderRecordings(root, app) {
  const recs = app.state.recordings;
  const recording = app.recorder.active;
  root.innerHTML = `
    <section class="section">
      <div class="btn-row">
        <button class="btn ${recording ? 'danger' : 'primary'}" data-act="rec">${icon(recording ? 'stop' : 'record', 'fill')} ${recording ? 'Stop recording' : 'Start recording'}</button>
      </div>
      <p class="note">Records every hit plus the backing loop if one is playing. Takes are saved in this browser.</p>
      ${app.state.inFrame ? '<p class="note">Downloads are blocked in this preview window. Open the app on its own page to save WAV files.</p>' : ''}
    </section>
    <section class="section">
      <h3 class="section-title">Your takes</h3>
      ${
        recs.length
          ? `<div class="list">${recs
              .map((r) => {
                const playing = app.state.playingRecording === r.id;
                const date = new Date(r.createdAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const kit = KITS.find((k) => k.id === r.kit?.base)?.name ?? 'Kit';
                return `<div class="row" data-id="${r.id}">
                  <button class="icon-btn" data-act="play" aria-label="${playing ? 'Stop' : 'Play'} ${esc(r.name)}">${icon(playing ? 'stop' : 'play', 'fill')}</button>
                  <span class="row-main">
                    <span class="row-title">${esc(r.name)}</span>
                    <span class="row-meta">${formatTime(r.duration)} · ${r.hits.length} hits · ${esc(kit)} · ${date}</span>
                  </span>
                  <button class="icon-btn" data-act="rename" aria-label="Rename">${icon('edit')}</button>
                  <button class="icon-btn" data-act="wav" aria-label="Download WAV">${icon('download')}</button>
                  <button class="icon-btn danger" data-act="delete" aria-label="Delete">${icon('trash')}</button>
                </div>`;
              })
              .join('')}</div>`
          : '<div class="empty">No takes yet. Press Rec in the toolbar, play something, then press it again to save.</div>'
      }
    </section>`;

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'rec') {
      app.toggleRecord();
      return;
    }
    const row = act.closest('[data-id]');
    const id = row?.dataset.id;
    const rec = recs.find((r) => r.id === id);
    if (!rec) return;
    if (a === 'play') app.togglePlayback(rec);
    if (a === 'wav') app.exportRecording(rec, act);
    if (a === 'delete') {
      row.outerHTML = `<div class="confirm" data-id="${id}"><span>Delete "${esc(rec.name)}"?</span>
        <button class="btn small danger" data-act="confirm-delete">Delete</button>
        <button class="btn small" data-act="cancel">Keep</button></div>`;
    }
    if (a === 'confirm-delete') app.removeRecording(rec);
    if (a === 'cancel') app.refreshPanel();
    if (a === 'rename') {
      const main = row.querySelector('.row-main');
      main.innerHTML = `<input class="text-input" id="rename-${id}" value="${esc(rec.name)}" maxlength="40" aria-label="Take name">`;
      const input = main.querySelector('input');
      input.focus();
      input.select();
      const done = (save) => {
        input.onblur = null;
        if (save && input.value.trim()) app.renameRecording(rec, input.value.trim());
        else app.refreshPanel();
      };
      input.onkeydown = (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') done(true);
        if (ev.key === 'Escape') done(false);
      };
      input.onblur = () => done(true);
    }
  });
}

// --------------------------------------------------------------- lessons

function renderLessons(root, app) {
  const s = app.settings.get();
  const best = s.lessonBest || {};
  const levels = [1, 2, 3];
  const levelName = { 1: 'Beginner', 2: 'Getting there', 3: 'Challenge' };
  root.innerHTML = `
    <section class="section">
      <p class="note">Rings close in on the pad you should hit. Hit as the ring reaches the rim. Watch the demo first if a pattern is new.</p>
      <div class="field">
        <div class="field-head"><label>Speed</label></div>
        <div class="segmented" role="group" aria-label="Lesson speed">
          ${[0.6, 0.8, 1].map((v) => `<button data-act="speed" data-v="${v}" aria-pressed="${s.lessonSpeed === v}">${Math.round(v * 100)}%</button>`).join('')}
        </div>
      </div>
      ${toggle('lesson-click', 'Metronome during lessons', s.lessonClick)}
    </section>
    ${levels
      .map(
        (lv) => `<section class="section">
      <h3 class="section-title">Level ${lv} · ${levelName[lv]}</h3>
      <div class="list">${LESSONS.filter((l) => l.level === lv)
        .map((l) => {
          const b = best[l.id];
          return `<div class="row" data-id="${l.id}">
            <span class="row-main">
              <span class="row-title">${l.title}</span>
              <span class="row-meta">${l.bpm} BPM · ${b ? `best ${b.pct}%` : 'not played yet'}</span>
            </span>
            ${starsHtml(b?.stars ?? 0)}
            <button class="btn small" data-act="demo">Demo</button>
            <button class="btn small primary" data-act="start">Play</button>
          </div>`;
        })
        .join('')}</div>
    </section>`,
      )
      .join('')}`;

  bindToggle(root, 'lesson-click', (on) => app.settings.set({ lessonClick: on }));
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'speed') {
      app.settings.set({ lessonSpeed: Number(act.dataset.v) });
      root.querySelectorAll('[data-act="speed"]').forEach((b) => b.setAttribute('aria-pressed', String(b === act)));
      return;
    }
    const id = act.closest('[data-id]')?.dataset.id;
    if (id) app.startLesson(id, { demo: act.dataset.act === 'demo' });
  });
}

// ------------------------------------------------------------------ kits

function renderKits(root, app) {
  const s = app.settings.get();
  const custom = app.state.customSamples;
  const kitCards = [...KITS, { id: 'custom', name: 'My Kit', description: 'Start from any kit and load your own sounds onto any piece.' }];
  const sounds = [];
  for (const p of PIECES) {
    sounds.push({ id: p.sound, name: p.name });
    if (p.zones)
      for (const z of Object.values(p.zones)) sounds.push({ id: z.sound, name: z.sound === 'rideBell' ? 'Ride bell' : 'Snare rim' });
  }
  root.innerHTML = `
    <section class="section">
      <h3 class="section-title">Sound</h3>
      <div class="kit-grid">
        ${kitCards
          .map(
            (k) => `<button class="kit-card" data-kit="${k.id}" aria-pressed="${s.kit === k.id}">
              <span class="kit-name">${k.name}</span><span class="kit-desc">${k.description}</span>
              ${app.state.loadingKit === k.id ? '<span class="kit-desc">Tuning…</span>' : ''}
            </button>`,
          )
          .join('')}
      </div>
    </section>
    <section class="section">
      <h3 class="section-title">Finish</h3>
      <div class="swatches">
        ${FINISHES.map(
          (f) =>
            `<button class="swatch" data-finish="${f.id}" aria-pressed="${s.finish === f.id}" aria-label="${f.name}" title="${f.name}" style="background: radial-gradient(circle at 35% 30%, ${f.a}, ${f.b})"></button>`,
        ).join('')}
      </div>
    </section>
    ${
      s.kit === 'custom'
        ? `<section class="section">
      <h3 class="section-title">My Kit</h3>
      <div class="field">
        <div class="field-head"><label for="custom-base">Start from</label></div>
        <select id="custom-base">${KITS.map((k) => `<option value="${k.id}" ${s.customBase === k.id ? 'selected' : ''}>${k.name}</option>`).join('')}</select>
      </div>
      <p class="note">Load a short one-shot sample (WAV, MP3, OGG or M4A) onto any piece. Files stay in this browser.</p>
      <div class="list">
        ${sounds
          .map((snd) => {
            const c = custom.get(snd.id);
            return `<div class="row" data-sound="${snd.id}">
              <span class="row-main"><span class="row-title">${snd.name}</span>
              <span class="row-meta">${c ? esc(c.name) : 'Built-in sound'}</span></span>
              <button class="btn small" data-act="load">${icon('upload')} Load</button>
              ${c ? `<button class="icon-btn danger" data-act="clear" aria-label="Use built-in sound">${icon('reset')}</button>` : ''}
            </div>`;
          })
          .join('')}
      </div>
      <input type="file" id="sample-file" accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac" hidden>
    </section>`
        : ''
    }`;

  let target = null;
  const file = root.querySelector('#sample-file');
  file?.addEventListener('change', () => {
    if (file.files[0] && target) app.loadCustomSample(target, file.files[0]);
    file.value = '';
  });
  root.querySelector('#custom-base')?.addEventListener('change', (e) => app.selectKit('custom', e.target.value));
  root.addEventListener('click', (e) => {
    const kit = e.target.closest('[data-kit]');
    if (kit) return app.selectKit(kit.dataset.kit);
    const fin = e.target.closest('[data-finish]');
    if (fin) {
      app.settings.set({ finish: fin.dataset.finish });
      root.querySelectorAll('[data-finish]').forEach((b) => b.setAttribute('aria-pressed', String(b === fin)));
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const sound = act.closest('[data-sound]')?.dataset.sound;
    if (act.dataset.act === 'load') {
      target = sound;
      file.click();
    }
    if (act.dataset.act === 'clear') app.clearCustomSample(sound);
  });
}

// -------------------------------------------------------------- settings

function renderSettings(root, app) {
  const s = app.settings.get();
  const midi = app.midi;
  const keyRows = [];
  for (const p of PIECES) {
    keyRows.push([p.name, p.keys]);
    if (p.zones) for (const z of Object.values(p.zones)) keyRows.push([z.sound === 'rideBell' ? 'Ride bell' : 'Snare rim', z.keys]);
  }
  const latency = app.engine.latency;
  root.innerHTML = `
    <section class="section">
      <h3 class="section-title">Sound</h3>
      ${slider('vol', 'Master volume', s.volume)}
      ${slider('room', 'Room ambience', s.room, { max: 0.8 })}
    </section>
    <section class="section">
      <h3 class="section-title">Playing</h3>
      ${slider('vel', 'Tap strength', s.velocity, { min: 0.3, max: 1 })}
      ${toggle('zones', 'Rim and bell zones', s.zones, 'Hit the snare rim for a rim click and the ride centre for the bell')}
      ${toggle('pressure', 'Pressure sensitivity', s.pressure, 'For pens and screens that report touch force')}
      ${'vibrate' in navigator ? toggle('vibrate', 'Vibrate on hit', s.vibrate) : ''}
      ${'wakeLock' in navigator ? toggle('wake', 'Keep screen awake', s.wakeLock) : ''}
    </section>
    <section class="section">
      <h3 class="section-title">Display</h3>
      ${toggle('labels', 'Piece labels', s.labels)}
      ${toggle('keys', 'Keyboard shortcuts on pads', s.keys)}
      ${toggle('mirror', 'Left-handed kit', s.mirror, 'Mirror the layout and the stereo image')}
      ${toggle('turned', 'Turn the kit on upright screens', s.portraitMode === 'turned', 'For phones with rotation lock: hold the phone sideways to play')}
    </section>
    <section class="section">
      <h3 class="section-title">MIDI drums</h3>
      ${
        midi.supported
          ? midi.connected
            ? `<p class="note">${midi.devices.length ? `Connected: ${midi.devices.map(esc).join(', ')}` : 'Listening. Plug in a MIDI drum kit or pad controller.'}</p>
               <div class="btn-row"><button class="btn" data-act="midi-off">Disconnect MIDI</button></div>`
            : `<p class="note">Play the kit from an electronic drum set or pad controller. Notes follow the General MIDI drum map.</p>
               <div class="btn-row"><button class="btn" data-act="midi-on">${icon('midi')} Connect MIDI</button></div>`
          : '<p class="note">This browser does not support Web MIDI. Chrome and Edge on desktop or Android do.</p>'
      }
    </section>
    <section class="section">
      <h3 class="section-title">Keyboard</h3>
      <p class="note">Hold Shift for an accent.</p>
      <div class="kbd-map">${keyRows
        .map(([name, keys]) => `<span class="keys">${keys.map((k) => `<kbd>${keyLabel(k)}</kbd>`).join('')}</span><span>${name}</span>`)
        .join('')}</div>
    </section>
    <section class="section">
      <h3 class="section-title">About</h3>
      <p class="note">Every sound is synthesized in your browser. Audio output latency: ${latency ? `${Math.round(latency * 1000)} ms` : 'not reported by this browser'}.</p>
      <div class="btn-row" id="reset-row"><button class="btn danger" data-act="reset">Reset all settings</button></div>
    </section>`;

  bindSlider(root, 'vol', (v) => app.setMix({ volume: v }));
  bindSlider(root, 'room', (v) => app.setMix({ room: v }));
  bindSlider(root, 'vel', (v) => app.settings.set({ velocity: v }));
  bindToggle(root, 'zones', (on) => app.settings.set({ zones: on }));
  bindToggle(root, 'pressure', (on) => app.settings.set({ pressure: on }));
  if (root.querySelector('#vibrate')) bindToggle(root, 'vibrate', (on) => app.settings.set({ vibrate: on }));
  if (root.querySelector('#wake')) bindToggle(root, 'wake', (on) => app.setWakeLock(on));
  bindToggle(root, 'labels', (on) => app.settings.set({ labels: on }));
  bindToggle(root, 'keys', (on) => app.settings.set({ keys: on }));
  bindToggle(root, 'mirror', (on) => app.settings.set({ mirror: on }));
  bindToggle(root, 'turned', (on) => app.settings.set({ portraitMode: on ? 'turned' : 'upright' }));
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'midi-on') app.connectMidi();
    if (a === 'midi-off') app.disconnectMidi();
    if (a === 'reset') {
      root.querySelector('#reset-row').innerHTML =
        `<div class="confirm"><span>Reset layout, kit and all settings? Takes and samples are kept.</span>
        <button class="btn small danger" data-act="confirm-reset">Reset</button>
        <button class="btn small" data-act="cancel-reset">Cancel</button></div>`;
    }
    if (a === 'confirm-reset') app.resetSettings();
    if (a === 'cancel-reset') app.refreshPanel();
  });
}

export const PANELS = {
  loops: { title: 'Play-along', render: renderLoops },
  recordings: { title: 'Recordings', render: renderRecordings },
  lessons: { title: 'Lessons', render: renderLessons },
  kits: { title: 'Kits', render: renderKits },
  settings: { title: 'Settings', render: renderSettings },
};

/** Manages the single side panel: open, close, toggle and re-render. */
export function createPanelHost(app, { el, title, body, close }) {
  let current = null;
  const render = () => {
    // replace the body so old listeners go away with it
    const fresh = body.cloneNode(false);
    body.replaceWith(fresh);
    body = fresh;
    title.textContent = PANELS[current].title;
    PANELS[current].render(body, app);
  };
  const host = {
    get current() {
      return current;
    },
    open(name) {
      current = name;
      render();
      el.hidden = false;
      app.onPanelChange?.(current);
    },
    toggle(name) {
      if (current === name) host.close();
      else host.open(name);
    },
    close() {
      current = null;
      el.hidden = true;
      app.onPanelChange?.(null);
    },
    refresh(...names) {
      if (!current || (names.length && !names.includes(current))) return;
      const top = body.scrollTop;
      render();
      body.scrollTop = top;
    },
  };
  close.addEventListener('click', () => host.close());
  return host;
}
