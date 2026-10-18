// The pieces of the drum kit: what they look like, which sound they play,
// and how they map to the keyboard and to General MIDI drum notes.

/**
 * kind: drum | kick | cymbal | hihat | pedal
 * z: stacking order for overlapping hit areas (higher wins)
 * zones: optional inner/outer zones that play a different sound
 */
export const PIECES = [
  { id: 'crash1', name: 'Crash', kind: 'cymbal', sound: 'crash1', keys: ['KeyW'], z: 1 },
  { id: 'splash', name: 'Splash', kind: 'cymbal', sound: 'splash', keys: ['KeyE'], z: 1, finish: 'bright' },
  { id: 'crash2', name: 'Crash 2', kind: 'cymbal', sound: 'crash2', keys: ['KeyU'], z: 1 },
  { id: 'china', name: 'China', kind: 'cymbal', sound: 'china', keys: ['KeyP'], z: 1, finish: 'china' },
  {
    id: 'ride',
    name: 'Ride',
    kind: 'cymbal',
    sound: 'ride',
    keys: ['KeyI'],
    z: 1,
    finish: 'ride',
    zones: { inner: { radius: 0.3, sound: 'rideBell', keys: ['KeyO'] } },
  },
  { id: 'hihatOpen', name: 'Open hi-hat', kind: 'hihat', sound: 'hihatOpen', keys: ['KeyQ'], z: 2, open: true },
  { id: 'hihatClosed', name: 'Hi-hat', kind: 'hihat', sound: 'hihatClosed', keys: ['KeyA'], z: 2 },
  { id: 'tom1', name: 'Tom 1', kind: 'drum', sound: 'tom1', keys: ['KeyJ'], z: 3 },
  { id: 'tom2', name: 'Tom 2', kind: 'drum', sound: 'tom2', keys: ['KeyK'], z: 3 },
  { id: 'tom3', name: 'Tom 3', kind: 'drum', sound: 'tom3', keys: ['KeyL'], z: 3 },
  { id: 'floorTom', name: 'Floor tom', kind: 'drum', sound: 'floorTom', keys: ['Semicolon', 'KeyM'], z: 3 },
  {
    id: 'snare',
    name: 'Snare',
    kind: 'drum',
    sound: 'snare',
    keys: ['KeyS', 'KeyD'],
    z: 4,
    zones: { outer: { radius: 0.86, sound: 'snareRim', keys: ['KeyX'] } },
  },
  { id: 'kick', name: 'Kick', kind: 'kick', sound: 'kick', keys: ['Space', 'KeyB', 'KeyV'], z: 3 },
  { id: 'hihatPedal', name: 'Hi-hat pedal', kind: 'pedal', sound: 'hihatPedal', keys: ['KeyZ'], z: 5 },
];

export const PIECE_BY_ID = Object.fromEntries(PIECES.map((p) => [p.id, p]));

/** Which piece a sound belongs to (zone sounds map to their parent piece). */
export const PIECE_FOR_SOUND = (() => {
  const m = {};
  for (const p of PIECES) {
    m[p.sound] = p.id;
    if (p.zones) for (const z of Object.values(p.zones)) m[z.sound] = p.id;
  }
  return m;
})();

/** Keyboard code -> { pieceId, sound } */
export const KEY_MAP = (() => {
  const m = {};
  for (const p of PIECES) {
    for (const k of p.keys) m[k] = { pieceId: p.id, sound: p.sound };
    if (p.zones) {
      for (const z of Object.values(p.zones)) for (const k of z.keys ?? []) m[k] = { pieceId: p.id, sound: z.sound };
    }
  }
  return m;
})();

/** Human label for a KeyboardEvent.code. */
export function keyLabel(code) {
  if (code === 'Space') return 'Space';
  if (code === 'Semicolon') return ';';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** General MIDI percussion (channel 10) plus common e-kit rim/edge notes. */
export const MIDI_MAP = {
  35: 'kick',
  36: 'kick',
  37: 'snareRim',
  38: 'snare',
  39: 'snareRim',
  40: 'snare',
  41: 'floorTom',
  43: 'tom3',
  45: 'tom2',
  47: 'tom2',
  48: 'tom1',
  50: 'tom1',
  58: 'tom3',
  42: 'hihatClosed',
  22: 'hihatClosed',
  44: 'hihatPedal',
  46: 'hihatOpen',
  26: 'hihatOpen',
  49: 'crash1',
  55: 'splash',
  57: 'crash2',
  52: 'china',
  51: 'ride',
  59: 'ride',
  53: 'rideBell',
};

/** Resolve a MIDI note number to { pieceId, sound } or null. */
export function midiTarget(note) {
  const sound = MIDI_MAP[note];
  if (!sound) return null;
  return { pieceId: PIECE_FOR_SOUND[sound], sound };
}
