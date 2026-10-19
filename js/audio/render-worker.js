// Renders kit sounds off the main thread and streams them back one by one.
import { renderSound, SOUND_IDS } from './kits.js';

self.onmessage = (e) => {
  const { jobId, kitId, sampleRate } = e.data;
  try {
    for (const soundId of SOUND_IDS) {
      const channels = renderSound(kitId, soundId, sampleRate);
      self.postMessage(
        { jobId, soundId, channels },
        channels.map((c) => c.buffer),
      );
    }
    self.postMessage({ jobId, done: true });
  } catch (err) {
    self.postMessage({ jobId, error: String((err && err.message) || err) });
  }
};
