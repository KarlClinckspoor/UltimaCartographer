// Akalabeth (GOG/PC port, 1997) generators, ported from u0-decompiled/tools/akmap.py.
// Maps are indexed [x][y], x east, y south, as in the game.
const s32 = v => v | 0;

// DJGPP 2.01 srandom()/random(), TYPE_3: degree 31, separation 3.
export class Random {
  constructor(seed) {
    const st = new Int32Array(31); st[0] = seed | 0;
    for (let i = 1; i < 31; i++) st[i] = (Math.imul(1103515245, st[i - 1]) + 12345) | 0;
    this.st = st; this.f = 3; this.r = 0;
    for (let i = 0; i < 310; i++) this.next();
  }
  next() {
    const st = this.st; st[this.f] = (st[this.f] + st[this.r]) | 0;
    const v = (st[this.f] >> 1) & 0x7FFFFFFF;
    if (++this.f >= 31) { this.f = 0; this.r++; } else if (++this.r >= 31) this.r = 0;
    return v;
  }
}

export const LAND = {PLAINS: 0, MOUNTAINS: 1, TREE: 2, TOWN: 3, DUNGEON: 4, CASTLE: 5};
export const DG = {FLOOR: 0, WALL: 1, TRAP: 2, HIDDEN_DOOR: 3, DOOR: 4, CHEST: 5, LADDER_DOWN: 7, LADDER_UP: 8, HOLE: 9};
export const MONSTERS = ['', 'Skeleton', 'Thief', 'Giant Rat', 'Orc', 'Viper', 'Carrion Crawler',
  'Gremlin', 'Mimic', 'Daemon', 'Balrog'];
export const STATS = ['Hit Points', 'Strength', 'Dexterity', 'Stamina', 'Wisdom', 'Gold'];

const pos = r => Math.floor(r.next() % 100 * .01 * 19 + 1);

// The stats offered at character creation: each refusal rolls six more from the same sequence.
export function stats(lucky, rolls = 3) {
  const r = new Random(lucky), out = [];
  for (let k = 0; k < rolls; k++)
    out.push(STATS.map(() => Math.floor(Math.sqrt(r.next() % 100 * .01) * 21 + 4)));
  return out;
}

// createworld: 21 x 21, border mountains; the start town is placed last and may cover the castle.
export function world(lucky) {
  const r = new Random(lucky), w = Array.from({length: 21}, () => new Array(21).fill(0));
  for (let x = 0; x < 21; x++) w[x][0] = w[0][x] = w[x][20] = w[20][x] = 1;
  for (let x = 1; x < 20; x++) for (let y = 1; y < 20; y++) w[x][y] = Math.floor(Math.pow(r.next() % 100 * .01, 5) * 4.5);
  const cx = pos(r), cy = pos(r); w[cx][cy] = 5;
  const tx = pos(r), ty = pos(r); w[tx][ty] = 3;
  return {w, town: [tx, ty], castle: [cx, cy]};
}

// createdungeon + createmonsters. (px, py) is the square the player arrives on; no monster is
// put there. Monster m is written into the map as m * 10; mons[m] = [x, y, hp without the level of play].
export function dungeon(lucky, level, px = 1, py = 1) {
  const r = new Random(s32(lucky * 3 + level)), d = Array.from({length: 11}, () => new Array(11).fill(0));
  for (let x = 0; x < 11; x++) d[x][0] = d[x][10] = d[0][x] = d[10][x] = 1;
  for (let x = 2; x <= 8; x += 2) for (let y = 1; y <= 9; y++) { d[x][y] = 1; d[y][x] = 1; }
  for (let x = 2; x <= 8; x += 2) for (let y = 1; y <= 9; y += 2) {
    for (const [p, v] of [[95, 2], [70, 3], [40, 4]]) { if (r.next() % 100 > p) d[x][y] = v; if (r.next() % 100 > p) d[y][x] = v; }
    if (r.next() % 100 > 97) d[y][x] = 9; if (r.next() % 100 > 97) d[x][y] = 9;
    if (r.next() % 100 > 94) d[x][y] = 5; if (r.next() % 100 > 94) d[y][x] = 5;
  }
  d[2][1] = 0;
  if (level % 2 === 0) { d[7][3] = 7; d[3][7] = 8; } else { d[7][3] = 8; d[3][7] = 7; }
  if (level === 1) { d[1][1] = 8; d[7][3] = 0; }
  const mons = {};
  for (let m = 1; m <= 10; m++) if (m - 2 < level) {
    let mx, my;
    do { mx = r.next() % 9 + 1; my = r.next() % 9 + 1; } while (d[mx][my] !== 0 || (mx === px && my === py));
    d[mx][my] = m * 10; mons[m] = [mx, my, m * 2 + level * 2];
  }
  return {d, mons};
}

// Where the ladder up of a level is: the square a player coming down from above arrives on.
export function ladderUp(level) {
  return level === 1 ? [1, 1] : level % 2 === 0 ? [3, 7] : [7, 3];
}
