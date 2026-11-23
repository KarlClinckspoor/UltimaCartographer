// Ultima I (PC/GOG) dungeon generator, from u1-decompiled: OUTB.C mkdung/dungseed, origin OM4069
// (rndrange) and OM37FD (seedrnd). Levels are indexed [x][y], 0..10.

// rndrange(lo, hi): 16-bit state; seed = ror3(seed + 0x9248); r = seed & 0x3FF, then r -= (hi - lo) while
// r > hi - lo (hi clamped to 255); result (r + lo) & 0xFF. Note it subtracts hi - lo, not hi - lo + 1.
export class Rng {
  constructor(seed) { this.s = seed & 0xFFFF; }
  range(lo, hi) {
    let a = (this.s + 0x9248) & 0xFFFF;
    a = ((a >>> 3) | (a << 13)) & 0xFFFF;
    this.s = a;
    let r = a & 0x3FF;
    const span = (hi < 0xFF ? hi : 0xFF) - lo;
    while (r > span) r -= span;
    return (r + lo) & 0xFF;
  }
}

export const CELL = {FLOOR: 0, WALL: 1, SECRET_DOOR: 2, DOOR: 3, LADDER_DOWN: 6, LADDER_UP: 7, FORCE_FIELD: 8};

// The 16 places where extra walls and force fields go (dirtab[38..53], dirtab[54..69] in OUT.EXE),
// transposed on even levels.
const XS = [4, 8, 5, 2, 8, 1, 5, 4, 6, 1, 3, 7, 3, 9, 2, 6];
const YS = [1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 8, 8, 9, 9];

// The seed of a level: the character's seed (record offset 0x32) + 5x + 3y + 17 * level, x and y the
// entrance's world square, in 16 bits.
export const levelSeed = (seed, x, y, level) => (seed + 5 * x + 3 * y + 17 * level) & 0xFFFF;

// The part of a level that doesn't change between visits: walls, doors, secret doors, force fields
// and ladders. (Chests, coffins and monsters come after a re-seed from the clock.)
export function level(seed, x, y, L) {
  const r = new Rng(levelSeed(seed, x, y, L));
  const a = Array.from({length: 11}, () => new Array(11).fill(0));
  for (let i = 0; i <= 10; i++) a[i][0] = a[0][i] = a[10][i] = a[i][10] = 1;
  for (let i = 2; i <= 8; i += 2) for (let j = 1; j <= 9; j++) a[i][j] = r.range(1, 4) - 1;
  const extra = [];
  for (let k = 0; k <= 2 * L; k++) {
    const d = r.range(1, 255) > 160 ? 8 : 1;
    const i = r.range(1, 16) - 1;
    const [cx, cy] = L & 1 ? [XS[i], YS[i]] : [YS[i], XS[i]];
    a[cx][cy] = d;
    extra.push([cx, cy, d]);
  }
  a[1][2] = 0;
  if (L & 1) { a[7][3] = 7; a[3][7] = 6; } else { a[7][3] = 6; a[3][7] = 7; }
  if (L === 10) a[7][3] = 0;
  if (L === 1) { a[1][1] = 7; a[7][3] = 0; }
  return {a, extra};
}

// The five monster kinds a level draws its three monsters from: ids (L - 1) / 2 * 5 + 0..4.
export const levelMonsters = L => [0, 1, 2, 3, 4].map(k => Math.floor((L - 1) / 2) * 5 + k);
