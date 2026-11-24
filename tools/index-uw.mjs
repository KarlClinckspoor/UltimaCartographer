// Writes data/<uw1|uw2>/teleports.json from the Underworld editor's export: every teleport (and lever working one)
// as [from level, to level, x, y], so a map can mark where other levels' teleports arrive without fetching every
// level's objects.json (42 files, 2.3 MB for UW2). Run it again after each export; tests/uw-teleports.test.mjs checks it.
// Usage: node tools/index-uw.mjs [uw1 uw2]
import {readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ends = k => k?.kind === 'lever' ? ends(k.does) : k;
export function teleports(dir) {
  const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')), out = new Set();
  for (const L of man.levels) for (const o of JSON.parse(readFileSync(join(dir, `levels/${L.id}/objects.json`), 'utf8'))) {
    const k = ends(o?.link); if (k?.kind === 'teleport') out.add(JSON.stringify([L.id, k.level, k.x, k.y]));
  }
  return [...out].map(s => JSON.parse(s)).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[3] - b[3] || a[2] - b[2]);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const g of process.argv.length > 2 ? process.argv.slice(2) : ['uw1', 'uw2']) {
    const t = teleports(join(root, g));
    writeFileSync(join(root, g, 'teleports.json'), JSON.stringify(t));
    console.log(`${g}: ${t.length} teleports -> data/${g}/teleports.json`);
  }
}
