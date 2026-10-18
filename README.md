# MyDrum

A realistic drum kit that runs in the browser, built as a web version of the kind of experience [Real Drum](https://play.google.com/store/apps/details?id=br.com.rodrigokolb.realdrum) offers on phones: a full kit you play with your fingers, a mouse, the keyboard or a MIDI drum set, with backing loops to play along with, recording, and guided lessons.

Everything is original: the code, the look and every sound. The drums are synthesized in your browser when the app loads, so there are no sample files to download.

## Features

- **Full 14-piece kit**: kick, snare (with rim-click zone), three rack toms, floor tom, open and closed hi-hat, hi-hat pedal, two crashes, ride (with bell zone), splash and china.
- **Multi-touch with low latency**: hits fire on touch-down through the Web Audio API, with hi-hat choke, natural drum damping, per-hit variation and a room reverb.
- **Five sound kits plus your own**: Studio, Rock Arena, Jazz Club, Vintage 808 and Electro, plus **My Kit**, where you load your own WAV/MP3/OGG samples onto any piece.
- **Six shell finishes**, piece labels and keyboard hints you can switch on or off.
- **Layout editor**: drag pieces, resize them (handle, pinch or scroll wheel), hide the ones you don't use, and mirror the kit for left-handed players.
- **Play-along**: ten backing loops (rock, pop, funk, blues, reggae, metal, jazz, bossa, disco, ballad) played by a synthesized bass, keys and guitar band, with tempo control, tap tempo, count-in and a metronome.
- **Recorder**: captures your hits and the backing loop, plays takes back on the kit, and exports them as WAV.
- **Lessons**: ten graded grooves and fills. Rings close in on the pad to hit, every hit is judged Perfect, Good, Early or Late, and your best score and stars are saved.
- **Keyboard and MIDI**: play from the computer keyboard or plug in an electronic drum kit (General MIDI drum map, Chrome and Edge).
- **Installable app**: works offline after the first visit and can be added to the home screen. On phones with rotation lock it can turn the kit sideways.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. There is nothing to install.

```sh
npm start
```

Then open http://localhost:8080. Any static web server works too, for example `python3 -m http.server`. Opening `index.html` straight from disk does not work, because browsers block ES modules on `file://` pages.

## Put it online

The app is plain static files, so any static host works. With GitHub Pages:

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick your branch and the `/ (root)` folder, and save.
3. Your kit will be live at `https://<your-user>.github.io/my-drum/` in a minute or two.

Use HTTPS when you host it: the offline mode and MIDI need a secure page.

## Playing

| Piece           | Keys        | MIDI notes          |
| --------------- | ----------- | ------------------- |
| Kick            | Space, B, V | 35, 36              |
| Snare           | S, D        | 38, 40              |
| Snare rim click | X           | 37, 39              |
| Hi-hat (closed) | A           | 42, 22              |
| Open hi-hat     | Q           | 46, 26              |
| Hi-hat pedal    | Z           | 44                  |
| Crash           | W           | 49                  |
| Splash          | E           | 55                  |
| Crash 2         | U           | 57                  |
| China           | P           | 52                  |
| Ride            | I           | 51, 59              |
| Ride bell       | O           | 53                  |
| Tom 1, 2, 3     | J, K, L     | 48/50, 45/47, 43/58 |
| Floor tom       | ;, M        | 41                  |

Hold **Shift** for an accent. On screen, tapping the snare's rim plays a rim click and tapping the ride's bell plays the bell (you can turn these zones off in Settings).

## Project layout

```
index.html            app shell, icon sprite
css/app.css           all styling (stage, pads, panels)
js/main.js            wires everything together
js/audio/             DSP toolkit, drum synthesis, kits, reverb, WAV encoder, Web Audio engine
js/kit/               the kit's pieces (keys, MIDI) and layout/hit testing
js/music/             chords, backing loops, band instruments, look-ahead scheduler
js/lessons/           lesson patterns, timing judgement, lesson runner
js/ui/                stage rendering and input, side panels
js/input/midi.js      Web MIDI input
js/recorder.js        recording, playback and WAV export
sw.js                 offline cache
tests/                unit tests (node:test)
scripts/              dev server and browser smoke test
```

## Tests

```sh
npm test          # unit tests: synthesis, layout and hit testing, loops, lessons, offline cache
npm run test:e2e  # browser smoke test; needs Playwright with Chromium installed
```

## Credits

Inspired by Real Drum by Kolb Apps. MyDrum is an independent project and is not affiliated with Kolb Apps; it uses none of their code, artwork or sounds.

Released under the Apache License 2.0 (see `LICENSE`).
