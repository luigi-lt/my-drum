// Offline support: the app shell is cached on install and served when the
// network is unavailable. Same-origin requests go network-first so updates
// show up immediately; Google Fonts are cached on first use.

const CACHE = 'mydrum-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/main.js',
  'js/storage.js',
  'js/recorder.js',
  'js/audio/dsp.js',
  'js/audio/voices.js',
  'js/audio/kits.js',
  'js/audio/engine.js',
  'js/audio/reverb.js',
  'js/audio/wav.js',
  'js/audio/render-worker.js',
  'js/kit/pieces.js',
  'js/kit/layout.js',
  'js/ui/stage.js',
  'js/ui/panels.js',
  'js/input/midi.js',
  'js/music/theory.js',
  'js/music/loops.js',
  'js/music/backing.js',
  'js/music/transport.js',
  'js/music/ticker-worker.js',
  'js/lessons/lessons.js',
  'js/lessons/scoring.js',
  'js/lessons/session.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
    );
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
