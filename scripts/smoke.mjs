// End-to-end smoke test in headless Chromium: boots the 3D kit, taps every
// piece, runs a loop, records and exports a take, plays a lesson, edits the
// layout, changes the style and switches to the 2D view and back.
// Needs Playwright (npx playwright install chromium).
//   node scripts/smoke.mjs [--shots dir]

import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return import(join(globalRoot, 'playwright', 'index.mjs'));
  }
}

const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

const port = 8765;
const server = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname, String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

const { chromium } = await loadPlaywright();
// software WebGL so the 3D view also runs on machines without a GPU
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60000 });
  const boot = await page.evaluate(() => ({ kit: myDrum.engine.kitId, sounds: myDrum.engine.buffers.size, view: myDrum.state.view }));
  check(boot.kit === 'studio' && boot.sounds === 16, `boots with the Studio kit (${boot.sounds} sounds)`);
  check(boot.view === '3d', `starts in the 3D view (${boot.view})`);

  // a screen point that taps the piece in whichever view is showing
  const centre = async (id) => {
    const p = await page.evaluate((id) => myDrum.stage.screenPoint(id), id);
    if (!p) throw new Error(`${id} cannot be tapped`);
    return [p.x, p.y];
  };
  const tapAll = async () => {
    const wrong = [];
    for (const id of [
      'kick',
      'snare',
      'hihatClosed',
      'hihatOpen',
      'hihatPedal',
      'tom1',
      'tom2',
      'tom3',
      'floorTom',
      'crash1',
      'crash2',
      'ride',
      'splash',
      'china',
    ]) {
      await page.evaluate(() => (myDrum.engine.voices = []));
      try {
        await page.mouse.click(...(await centre(id)));
      } catch {
        wrong.push(`${id} unreachable`);
        continue;
      }
      const got = await page.evaluate(() => myDrum.engine.voices.map((v) => v.soundId).join('+'));
      const ok = got === id || (id === 'ride' && got === 'rideBell') || (id === 'snare' && got === 'snareRim');
      if (!ok) wrong.push(`${id} played ${got || 'nothing'}`);
    }
    return wrong;
  };
  await page.waitForTimeout(500);
  const wrong3d = await tapAll();
  check(wrong3d.length === 0, `every piece can be tapped in 3D${wrong3d.length ? `: ${wrong3d.join(', ')}` : ''}`);
  if (shots) await page.screenshot({ path: join(shots, 'kit-3d.png') });

  await page.evaluate(() => (myDrum.engine.voices = []));
  await page.keyboard.press('KeyA');
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyO');
  const voices = await page.evaluate(() => myDrum.engine.voices.map((v) => v.soundId));
  check(
    ['hihatClosed', 'kick', 'rideBell'].every((s) => voices.includes(s)),
    `keys trigger sounds (${voices})`,
  );

  await page.click('[data-panel="loops"]');
  await page.click('[data-loop="rock-anthem"]');
  await page.waitForTimeout(2600); // past the one-bar count-in
  check(await page.evaluate(() => myDrum.transport.running && myDrum.state.loopPlaying), 'backing loop plays');

  await page.click('#btn-record');
  for (const k of ['KeyA', 'Space', 'KeyA', 'KeyS']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(120);
  }
  await page.click('#btn-record');
  await page.click('[data-loop="rock-anthem"]');
  const recs = await page.evaluate(() => myDrum.state.recordings.map((r) => ({ hits: r.hits.length, notes: r.notes.length })));
  check(recs.length === 1 && recs[0].hits === 4 && recs[0].notes > 0, `take recorded with hits and loop notes (${JSON.stringify(recs)})`);

  await page.click('[data-panel="recordings"]');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-act="wav"]')]);
  check(download.suggestedFilename().endsWith('.wav'), `exports ${download.suggestedFilename()}`);
  if (shots) await page.screenshot({ path: join(shots, 'recordings.png') });

  await page.click('[data-panel="lessons"]');
  await page.locator('[data-id="rock-beat"] [data-act="start"]').click();
  await page.waitForTimeout(3500);
  const rings = await page.evaluate(() =>
    myDrum.state.view === '3d' ? myDrum.stage.rings.length : document.querySelectorAll('.approach').length,
  );
  check(rings > 0, `lesson shows approach rings (${rings})`);
  if (shots) await page.screenshot({ path: join(shots, 'lesson.png') });
  await page.click('#hud-stop');
  check(!(await page.evaluate(() => myDrum.lessons.active)), 'lesson stops');

  await page.click('#btn-edit');
  await page.waitForFunction(() => !myDrum.stage.tween, null, { timeout: 10000 }); // camera glides to the top view
  const [x, y] = await centre('floorTom');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 20, { steps: 5 });
  await page.mouse.up();
  await page.click('#btn-done');
  const moved = await page.evaluate(() => myDrum.settings.get().layout3d?.floorTom?.x);
  check(typeof moved === 'number' && moved > 0.5, `3D layout editor moves pieces (floor tom x=${moved})`);

  await page.click('#btn-camera');
  check((await page.evaluate(() => myDrum.settings.get().camera)) === 'front', 'camera button switches to the front view');
  await page.click('#btn-camera');
  await page.click('#btn-camera');

  await page.click('[data-panel="style"]');
  await page.click('[data-act="skin"][data-id="neon"]');
  await page.click('[data-act="color"][data-id="#c0141f"]');
  const look = await page.evaluate(() => myDrum.getLook());
  check(
    look.skin === 'neon' && look.heads === 'mesh' && look.color === '#c0141f',
    `style panel applies a skin and a colour (${look.skin}, ${look.color})`,
  );
  if (shots) await page.screenshot({ path: join(shots, 'style.png') });

  await page.click('[data-act="view"][data-id="2d"]');
  await page.click('#panel-close');
  const wrong2d = await tapAll();
  check(wrong2d.length === 0, `every piece can be tapped in 2D${wrong2d.length ? `: ${wrong2d.join(', ')}` : ''}`);
  const finish = await page.evaluate(() => document.querySelector('.pad[data-id="snare"]').dataset.finish);
  check(finish === 'satin', `2D view follows the style (${finish})`);
  if (shots) await page.screenshot({ path: join(shots, 'kit-2d.png') });

  // a bot that hits each note when its ring closes (on the audio clock) should score well;
  // run in 2D because headless software WebGL is too slow for frame-timed hits
  await page.click('[data-panel="lessons"]');
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const { lessons, engine, play } = myDrum;
        document.querySelector('[data-id="four-floor"] [data-act="start"]').click();
        const pending = lessons.notes.map((n) => ({ ...n }));
        const visual = () => engine.ctx.currentTime - engine.latency;
        const bot = () => {
          while (pending.length && visual() >= pending[0].t) {
            const n = pending.shift();
            play(n.pieceId, n.pieceId, 0.85, { source: 'key' }); // these pieces' sound ids match their ids
          }
          if (pending.length) requestAnimationFrame(bot);
        };
        requestAnimationFrame(bot);
        const iv = setInterval(() => {
          const pct = document.querySelector('.modal .result-score');
          if (pct) {
            clearInterval(iv);
            resolve(pct.textContent);
          }
        }, 200);
      }),
  );
  // random or mistimed hitting scores near zero; frame-timed hits in a busy headless browser land around 75-100%
  check(parseInt(result, 10) >= 60, `lesson scoring rewards on-time hits (${result})`);
  await page.click('.modal [data-act="close"]');
  await page.click('[data-panel="style"]');
  await page.click('[data-act="view"][data-id="3d"]');
  check((await page.evaluate(() => myDrum.state.view)) === '3d', 'switches back to 3D');
  await page.click('#panel-close');

  await page.click('[data-panel="kits"]');
  await page.click('[data-kit="vintage808"]');
  await page.waitForFunction(() => myDrum.engine.kitId === 'vintage808', null, { timeout: 30000 });
  check(true, 'switches kits');
  if (shots) await page.screenshot({ path: join(shots, 'kits.png') });

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');
