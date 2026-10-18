// End-to-end smoke test in headless Chromium: boots the app, plays pads,
// runs a loop, records and exports a take, starts a lesson and edits the
// layout. Needs Playwright (npx playwright install chromium).
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
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
  const boot = await page.evaluate(() => ({ kit: myDrum.engine.kitId, sounds: myDrum.engine.buffers.size }));
  check(boot.kit === 'studio' && boot.sounds === 16, `boots with the Studio kit (${boot.sounds} sounds)`);

  const centre = async (id) => {
    const b = await page.locator(`.pad[data-id="${id}"]`).boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  await page.mouse.click(...(await centre('snare')));
  await page.mouse.click(...(await centre('ride')));
  await page.keyboard.press('KeyA');
  await page.keyboard.press('Space');
  const voices = await page.evaluate(() => myDrum.engine.voices.map((v) => v.soundId));
  check(
    ['snare', 'rideBell', 'hihatClosed', 'kick'].every((s) => voices.includes(s)),
    `clicks and keys trigger sounds (${voices})`,
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
  const rings = await page.locator('.approach').count();
  check(rings > 0, `lesson shows approach rings (${rings})`);
  if (shots) await page.screenshot({ path: join(shots, 'lesson.png') });
  await page.click('#hud-stop');
  check(!(await page.evaluate(() => myDrum.lessons.active)), 'lesson stops');

  // a bot that hits each note when its ring closes (on the audio clock) should score well
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
  check(parseInt(result, 10) >= 80, `lesson scoring rewards on-time hits (${result})`);
  await page.click('.modal [data-act="close"]');

  await page.click('#btn-edit');
  const [x, y] = await centre('tom1');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 50, y + 20, { steps: 4 });
  await page.mouse.up();
  await page.click('#btn-done');
  const moved = await page.evaluate(() => myDrum.settings.get().layout?.tom1?.x);
  check(typeof moved === 'number' && moved < 640, `layout editor moves pieces (tom1 x=${moved})`);

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
