// Persistence: settings in localStorage, custom samples and recordings in
// IndexedDB. Every access is guarded; private windows and blocked storage
// fall back to memory so the app keeps working for the session.

const SETTINGS_KEY = 'mydrum.settings.v1';

export function loadSettings(defaults) {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(defaults);
    const saved = JSON.parse(raw);
    const out = structuredClone(defaults);
    for (const k of Object.keys(defaults)) {
      if (saved[k] !== undefined && (defaults[k] === null || typeof saved[k] === typeof defaults[k])) out[k] = saved[k];
    }
    return out;
  } catch {
    return structuredClone(defaults);
  }
}

let saveTimer = null;
export function saveSettings(settings) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, 150);
}

export function clearSettings() {
  clearTimeout(saveTimer);
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Tiny observable store for app settings. */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      saveSettings(state);
      for (const f of subs) f(state, patch);
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

// ------------------------------------------------------------ IndexedDB

const memory = { samples: new Map(), recordings: new Map() };
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('no indexedDB'));
        return;
      }
      const req = indexedDB.open('mydrum', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples');
        if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      dbPromise = Promise.reject(err);
      dbPromise.catch(() => {});
      throw err;
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function dbGet(store, key) {
  try {
    return await tx(store, 'readonly', (s) => s.get(key));
  } catch {
    return memory[store].get(key);
  }
}

export async function dbPut(store, value, key) {
  try {
    await tx(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
  } catch {
    memory[store].set(key ?? value.id, value);
  }
}

export async function dbDelete(store, key) {
  try {
    await tx(store, 'readwrite', (s) => s.delete(key));
  } catch {
    memory[store].delete(key);
  }
}

export async function dbAll(store) {
  try {
    const keys = await tx(store, 'readonly', (s) => s.getAllKeys());
    const values = await tx(store, 'readonly', (s) => s.getAll());
    return keys.map((k, i) => [k, values[i]]);
  } catch {
    return [...memory[store].entries()];
  }
}

export async function dbClear(store) {
  try {
    await tx(store, 'readwrite', (s) => s.clear());
  } catch {
    memory[store].clear();
  }
}
