// The exported data the site reads from other tools (u8edit, the Underworld editor, the U9 editor), checked by
// each export's own checker against its spec: docs/u8-export.md, docs/uw-export.md, u9viewer/EXPORT.md.
// Usage: node --test tests/exports.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = script => {
  const r = spawnSync(process.execPath, [join(root, script)], {encoding: 'utf8', maxBuffer: 1 << 26});
  const fails = r.stdout.split('\n').filter(l => l.startsWith('FAIL ')).map(l => l.trim());
  const m = /(\d+) passed, (\d+) failed/.exec(r.stdout);
  return {status: r.status, fails, passed: m ? +m[1] : 0, stdout: r.stdout + r.stderr};
};

// docs/u8-export.md, "What the checker finds": shape 0 has no shapes.json entry (the site falls back on "Shape 0")
const U8_KNOWN = ['FAIL every frame\'s shape has a name in shapes.json 1 without'];

test('U8 export (data/u8): only the documented failure', () => {
  const r = run('tools/check-u8-export.mjs');
  assert.ok(r.passed > 400, r.stdout);
  assert.deepEqual(r.fails.filter(f => !U8_KNOWN.includes(f)), [], r.stdout);
});

test('Underworld exports (data/uw1, data/uw2)', () => {
  const r = run('tools/check-uw-export.mjs');
  assert.ok(r.passed > 700, r.stdout);
  assert.deepEqual(r.fails, [], r.stdout);
  assert.equal(r.status, 0, r.stdout);
});

test('U9 export (u9viewer/data)', () => {
  const r = run('u9viewer/tools/check-export.mjs');
  assert.ok(r.passed > 2000, r.stdout);
  assert.deepEqual(r.fails, [], r.stdout);
  assert.equal(r.status, 0, r.stdout);
});
