// Steady 25 ms tick for the audio scheduler. Worker timers keep running
// when the tab is in the background, unlike main-thread intervals.
let id = null;
self.onmessage = (e) => {
  clearInterval(id);
  id = null;
  if (e.data === 'start') id = setInterval(() => self.postMessage('tick'), 25);
};
