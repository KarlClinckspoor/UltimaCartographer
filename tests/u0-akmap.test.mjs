// Checks js/games/u0/akgen.js against u0-decompiled/tools/akmap.py.
// Usage: node tests/u0-akmap.test.mjs [path/to/u0-decompiled]
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {world, dungeon, stats} from '../js/games/u0/akgen.js';

const here = dirname(fileURLToPath(import.meta.url));
const tools = resolve(process.argv[2] || resolve(here, '../../u0-decompiled'), 'tools');
const LUCKY = [-7, 0, 1, 2, 7, 42, 99, 1234, 31337, 65535, 1e6, 2 ** 31 - 1];
const LEVELS = 15;
const ARRIVE = [[1, 1], [5, 5], [2, 1]];

const py = `
import sys, json
sys.path.insert(0, sys.argv[1])
import akmap
out = {}
for lucky in json.loads(sys.argv[2]):
    w, t, c = akmap.world(lucky)
    out[str(lucky)] = {'world': [w, list(t), list(c)], 'stats': akmap.stats(lucky, 5), 'levels': {}}
    for level in range(1, ${LEVELS} + 1):
        for px, py in ${JSON.stringify(ARRIVE)}:
            d, m = akmap.dungeon(lucky, level, px, py)
            out[str(lucky)]['levels']['%d/%d,%d' % (level, px, py)] = [d, {str(k): list(v) for k, v in m.items()}]
print(json.dumps(out))
`;
const ref = JSON.parse(execFileSync('python', ['-I', '-c', py, tools, JSON.stringify(LUCKY)], {maxBuffer: 1 << 28}).toString());

let pass = 0, fail = 0;
const check = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else { fail++; console.log('MISMATCH', name); }
};
for (const lucky of LUCKY) {
  const r = ref[String(lucky)], w = world(lucky);
  check(`world ${lucky}`, [w.w, w.town, w.castle], r.world);
  check(`stats ${lucky}`, stats(lucky, 5), r.stats);
  for (let level = 1; level <= LEVELS; level++) for (const [px, py] of ARRIVE) {
    const {d, mons} = dungeon(lucky, level, px, py);
    check(`dungeon ${lucky} L${level} @${px},${py}`, [d, Object.fromEntries(Object.entries(mons))], r.levels[`${level}/${px},${py}`]);
  }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
