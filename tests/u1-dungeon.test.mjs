// Checks js/games/u1/u1gen.js against levels dumped from the running game (OUT.EXE under DOSBox,
// through u1-decompiled's ktest: a character's seed and position poked in, Enter, then K-limb down
// each ladder, dumping the cell array at AD56 after each level was made).
// Usage: node tests/u1-dungeon.test.mjs
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {level} from '../js/games/u1/u1gen.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let pass = 0, fail = 0;
for (const f of readdirSync(dir).filter(n => n.startsWith('u1-dungeon-'))) {
  const [, seed, x, y] = /seed(\d+)-(\d+)-(\d+)/.exec(f).map(Number);
  for (const [L, cells] of Object.entries(JSON.parse(readFileSync(join(dir, f))))) {
    if (JSON.stringify(level(seed, x, y, +L).a) === JSON.stringify(cells)) pass++;
    else { fail++; console.log(`MISMATCH ${f} level ${L}`); }
  }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail || !pass ? 1 : 0);
