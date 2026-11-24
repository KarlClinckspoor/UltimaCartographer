// Serpent Isle's regions, as the game names them: the Locate spell (In Wis, CIRCLE1.use LocateSpell_i) barks the
// name of the region WhereIs_i (UTILSI.use) finds for the Avatar's tile. WhereIs_i tests rectangles in order, each
// with strict bounds (a < x < b and c < y < d), and returns the first match; left over, y < 1024 is the Ice Plains
// and the rest the Wilderness. Transcribed from the decompiled usecode; Exult's getLocationID (0x993) is the same.

// [id, rectangles as [a, b, c, d]: a < x < b, c < y < d], in WhereIs_i's order
const RECTS = [
  [0, [[1710, 1855, 1340, 1455], [2443, 2531, 28, 126]]],
  [2, [[2244, 2558, 929, 1278], [2592, 2815, 1024, 1247]]],
  [31, [[2810, 3071, 1024, 1536], [0, 255, 1025, 1535]]],
  [3, [[858, 1187, 1533, 2007], [2752, 2767, 192, 223]]],
  [4, [[1152, 1407, 2560, 2735], [1408, 1999, 2416, 2751], [1936, 2028, 2736, 2812], [2848, 3039, 1808, 1980], [13, 171, 1567, 1659], [2573, 2623, 94, 127], [2611, 2655, 159, 175]]],
  [21, [[1360, 1424, 464, 528], [2703, 2784, 79, 160]]],
  [22, [[1472, 1784, 476, 566]]],
  [5, [[1328, 1600, 529, 880]]],
  [7, [[1104, 1695, 1216, 1375], [560, 800, 1600, 1715], [1530, 1776, 1020, 1215]]],
  [9, [[1168, 1328, 2144, 2288], [2800, 2815, 192, 223]]],
  [10, [[112, 560, 800, 1040]]],
  [11, [[1920, 2128, 1264, 1393], [2000, 2176, 1090, 1270]]],
  [12, [[784, 1024, 2048, 2280]]],
  [13, [[672, 1136, 2432, 2800], [2846, 2864, 174, 209]]],
  [14, [[2100, 2494, 1723, 2126]]],
  [15, [[2016, 2256, 1408, 1680], [2160, 2320, 1312, 1504], [2240, 2592, 1312, 1425], [2400, 2656, 1424, 1616], [2544, 2656, 1600, 1744], [2480, 2576, 1696, 1808]]],
  [16, [[1800, 1978, 948, 1108], [2963, 3052, 67, 236]]],
  [17, [[1760, 1839, 592, 687], [2816, 2959, 80, 127]]],
  [18, [[1408, 1471, 912, 1007]]],
  [19, [[2240, 2367, 288, 335]]],
  [20, [[2224, 2303, 784, 863], [2464, 2815, 768, 911]]],
  // the fifth rectangle (2832 < x < 240) is empty in the game too
  [23, [[928, 1103, 976, 1327], [1104, 1391, 1008, 1183], [1184, 1295, 624, 1023], [1104, 1231, 608, 767], [2832, 240, 2048, 2288], [0, 192, 1792, 2048]]],
  [24, [[1840, 2398, 520, 760], [2174, 2398, 360, 520]]],
  [25, [[1280, 2030, 0, 400]]],
  [26, [[1344, 1520, 1408, 1648], [1520, 1770, 1370, 1600]]],
  [27, [[528, 720, 2384, 2736]]],
  [28, [[600, 780, 1150, 1480]]],
  [29, [[890, 1160, 830, 890]]],
  [30, [[303, 479, 1839, 1984]]],
  [32, [[0, 2304, 2815, 3072], [2303, 3072, 2559, 3072], [2927, 3072, 2495, 2560]]],
  [33, [[2303, 2560, 2559, 2816]]],   // inside the rectangle before it: never reached
  [65535, [[2579, 2623, 20, 61], [2512, 2542, 160, 174], [592, 816, 831, 1153]]],
];
// What In Wis says for each (LocateSpell_i); ids it has no name for get "We must be lost."
export const NAMES = {65535: 'the Wilderness', 14: 'Moonshade', 0: 'Castle of the White Dragon', 1: 'Claw', 2: 'Monk Isle', 3: 'Fawn', 4: 'Furnace',
  5: 'Glacier Mountains', 6: 'Grand Shrine', 7: 'Great Northern Forest', 8: 'Ice Plains', 9: 'Inn of the Sleeping Bull', 10: 'Isle of Crypts',
  11: 'Isles of the Mad Mage', 12: 'Knight’s Test', 13: 'Monitor', 15: 'Mountains of Freedom', 16: 'Shamino’s Castle', 17: 'Temple of Discipline',
  18: 'Temple of Emotion', 19: 'Temple of Enthusiasm', 20: 'Temple of Ethicality', 21: 'Temple of Logic', 22: 'Temple of Tolerance',
  23: 'Skullcrusher Mountains', 24: 'Spinebreaker Mountains', 25: 'Sunrise Isle', 26: 'Gorlab Swamp', 28: 'Western Forest', 29: 'Village of the Gwani',
  30: 'Isle of Programmers'};
// the regions In Wis has no name for, named as Exult's sources name them (not words of the game)
export const UNNAMED = {27: 'starting area', 31: 'Dream World', 32: 'Silver Seed', 33: 'the Maze'};
export const LOST = 'We must be lost.';

const N = 3072, WILD = 255;
let grid = null;
// the region of every tile (one byte; ids as WhereIs_i's, 255 the Wilderness), filled rectangle by rectangle in
// order, each taking only tiles no earlier rectangle took: the same as testing in order and taking the first match
export function regionGrid() {
  if (grid) return grid;
  const code = id => id === 65535 ? WILD : id;
  grid = new Uint8Array(N * N).fill(254);   // 254: not yet taken
  for (const [id, rects] of RECTS) for (const [a, b, c, d] of rects)
    for (let y = Math.max(0, c + 1); y < Math.min(N, d); y++) for (let x = Math.max(0, a + 1); x < Math.min(N, b); x++) {
      const o = y * N + x; if (grid[o] === 254) grid[o] = code(id);
    }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const o = y * N + x; if (grid[o] === 254) grid[o] = y < 1024 ? 8 : WILD; }
  return grid;
}
export const regionAt = (x, y) => { const v = regionGrid()[y * N + x]; return v === WILD ? 65535 : v; };
// what In Wis would say on a tile
export const inWis = (x, y) => NAMES[regionAt(x, y)] || LOST;

// each region's tiles: count, centroid (of the tile centres) and bounding box
export function regionStats() {
  const g = regionGrid(), sx = new Float64Array(256), sy = new Float64Array(256), n = new Float64Array(256);
  const box = Array.from({length: 256}, () => [N, N, -1, -1]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = g[y * N + x]; sx[v] += x + .5; sy[v] += y + .5; n[v]++;
    const b = box[v]; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  const out = [];
  for (let v = 0; v < 255; v++) if (n[v]) out.push({id: v, tiles: n[v], x: sx[v] / n[v], y: sy[v] / n[v], box: box[v]});
  return out;
}

// Each connected piece of each region (4-neighbour), with its tiles' count, centroid and bounding box. A region can
// lie in several places: the game stores dungeon interiors in the map's north-east corner and counts them as the
// region they belong to, so one centroid for all of a region's tiles can fall far from all of them.
export function regionPieces(minTiles = 1) {
  const g = regionGrid(), seen = new Uint8Array(N * N), q = new Int32Array(N * N), out = [];
  for (let start = 0; start < N * N; start++) {
    if (seen[start]) continue;
    const v = g[start];
    let head = 0, tail = 0, n = 0, sx = 0, sy = 0, x0 = N, y0 = N, x1 = -1, y1 = -1;
    q[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const o = q[head++], x = o % N, y = (o - x) / N;
      n++; sx += x + .5; sy += y + .5;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !seen[o - 1] && g[o - 1] === v) { seen[o - 1] = 1; q[tail++] = o - 1; }
      if (x < N - 1 && !seen[o + 1] && g[o + 1] === v) { seen[o + 1] = 1; q[tail++] = o + 1; }
      if (y > 0 && !seen[o - N] && g[o - N] === v) { seen[o - N] = 1; q[tail++] = o - N; }
      if (y < N - 1 && !seen[o + N] && g[o + N] === v) { seen[o + N] = 1; q[tail++] = o + N; }
    }
    if (n >= minTiles && v !== WILD) out.push({id: v, tiles: n, x: sx / n, y: sy / n, box: [x0, y0, x1, y1]});
  }
  return out;
}

// Where to put a piece's label: its centroid, unless the piece is so irregular that the centroid falls outside it
// (the Ice Plains, all that is left north of y 1024); then the point of the piece farthest from its edge, found on a
// grid of 8 x 8 tiles (a chamfer distance transform), the nearest such point to the centroid on a tie.
export function labelPoint(piece) {
  const g = regionGrid(), v = piece.id, cx = Math.floor(piece.x), cy = Math.floor(piece.y);
  if (g[cy * N + cx] === v) return [piece.x, piece.y];
  const S = 8, M = N / S, [x0, y0, x1, y1] = piece.box, d = new Float32Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = i * S + 4, y = j * S + 4;
    d[j * M + i] = x >= x0 && x <= x1 && y >= y0 && y <= y1 && g[y * N + x] === v ? 1e9 : 0;
  }
  const at = (i, j) => i < 0 || j < 0 || i >= M || j >= M ? 0 : d[j * M + i];
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) if (d[j * M + i]) d[j * M + i] = Math.min(d[j * M + i], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414);
  for (let j = M - 1; j >= 0; j--) for (let i = M - 1; i >= 0; i--) if (d[j * M + i]) d[j * M + i] = Math.min(d[j * M + i], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414);
  let best = 0, bx = piece.x, by = piece.y, bd = Infinity;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const v2 = d[j * M + i], x = i * S + 4, y = j * S + 4, dist = Math.hypot(x - piece.x, y - piece.y);
    if (v2 > best + 1e-6 || (Math.abs(v2 - best) < 1e-6 && dist < bd)) { best = v2; bx = x; by = y; bd = dist; }
  }
  return [bx, by];
}
