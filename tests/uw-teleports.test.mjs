// data/<uw>/teleports.json (tools/index-uw.mjs) must match the export it was made from.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {teleports} from '../tools/index-uw.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const g of ['uw1', 'uw2']) test(`${g}: teleports.json matches the export (run tools/index-uw.mjs after an export)`, () => {
  assert.deepEqual(JSON.parse(readFileSync(join(root, g, 'teleports.json'), 'utf8')), teleports(join(root, g)));
});
