// Checks js/games/drash/drashgen.js against Escape from Mt. Drash levels made by the real game in VICE (mtdrash's
// build/golden: an RND seed poked in before the game starts, Z%, the monsters and the seed after dumped at level 1)
// and by mtdrash's C core (tests/maze_check.c, which matches VICE) for levels 1-14 along the no-fight chain.
// Also: the cold-boot level 1, the fixed level 15, and that every generated maze is perfect.
// Usage: node tests/drash-maze.test.mjs
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {level, chainStart, OPEN, WALL} from '../js/games/drash/drashgen.js';

const fx = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'drash-levels.json')));
let pass = 0, fail = 0;
const check = (ok, what) => { if (ok) pass++; else { fail++; console.log('FAIL', what); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [src, list] of [['VICE', fx.vice], ['C', fx.c]]) for (const d of list) {
  const l = level(d.lv, d.seed);
  check(same(l.raw, d.Z), `${src} seed ${d.seed} level ${d.lv}: maze`);
  check(same(l.mons.map(m => m[0]), d.MX) && same(l.mons.map(m => m[1]), d.MY), `${src} seed ${d.seed} level ${d.lv}: monsters`);
  check(l.seedAfter === d.seed_after, `${src} seed ${d.seed} level ${d.lv}: seed after (${l.seedAfter} vs ${d.seed_after})`);
}

// Power-on: level 1 starts from the ROM seed with nothing drawn before it.
check(chainStart(1).seed === '804fc75258' && fx.c[0].seed === '804fc75258', 'cold boot seed');

// Level 15: the fixed zig-zag, 9 monsters.
const l15 = level(15, chainStart(15).seed);
check(l15.mons.length === 9 && l15.raw[2][5] === OPEN && l15.raw[10][3] === OPEN && l15.raw[2][3] === WALL, 'level 15 layout');

// Levels 1-14 from 15 seeds along the RND sequence: 25 cells, 24 openings, all connected.
for (let lv = 1; lv <= 14; lv++) for (let k = 0; k < 15; k++) {
  const {raw} = level(lv, chainStart(Math.min(15, k + 1)).seed);
  let open = 0;
  for (let x = 1; x <= 11; x++) for (let y = 1; y <= 11; y++) if (raw[x][y] && (x % 2) !== (y % 2)) open++;
  const seen = new Set(['10,10']), todo = [[10, 10]];
  while (todo.length) {
    const [x, y] = todo.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!raw[x + dx][y + dy] || x + 2 * dx < 2 || x + 2 * dx > 10 || y + 2 * dy < 2 || y + 2 * dy > 10) continue;
      const k2 = `${x + 2 * dx},${y + 2 * dy}`;
      if (!seen.has(k2)) { seen.add(k2); todo.push([x + 2 * dx, y + 2 * dy]); }
    }
  }
  check(open === 24 && seen.size === 25, `perfect maze, level ${lv} chain seed ${k + 1}`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail || !pass ? 1 : 0);
