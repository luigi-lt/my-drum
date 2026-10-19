import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('the service worker precaches every script and stylesheet', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const files = [...walk(join(root, 'js')), ...walk(join(root, 'css')), ...walk(join(root, 'vendor')).filter((f) => f.endsWith('.js'))].map(
    (f) => relative(root, f),
  );
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `${f} missing from sw.js ASSETS`);
});

test('the manifest points at icons that exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.orientation, 'landscape');
  for (const icon of manifest.icons) assert.ok(statSync(join(root, icon.src)).size > 0, icon.src);
});
