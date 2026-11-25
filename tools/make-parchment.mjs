// The site's parchment frame (img/parchment.png): the Ultima Underworld automap's blank sheet (BLNKMAP.BYT, 320 x 200,
// palette 1 of PALS.DAT, both on the GOG CD image), cut into a nine-slice for CSS border-image: 16-pixel corners and
// edges from its clean top-left corner and top and left edges (the other corners carry the map's buttons), mirrored
// for the right and bottom, and a 128-pixel square of the sheet for the middle. Lightened to the site's paper tone;
// the black outside the torn edge is transparent.
// Usage: node tools/make-parchment.mjs "C:/GOG Games/Ultima Underworld/game.gog"
import {readFileSync, writeFileSync} from 'node:fs';
import {png} from './png.mjs';

const iso = readFileSync(process.argv[2]);
// ISO 9660: find a file's directory record by its name (the name follows 33 bytes of record), read extent and size
const file = name => {
  const n = Buffer.from(name);
  for (let i = iso.indexOf(n); i >= 0; i = iso.indexOf(n, i + 1)) {
    const r = i - 33;
    if (iso[r + 32] === n.length) { const lba = iso.readUInt32LE(r + 2), size = iso.readUInt32LE(r + 10); return iso.subarray(lba * 2048, lba * 2048 + size); }
  }
  throw new Error(`${name} not found`);
};
const map = file('BLNKMAP.BYT'), pals = file('PALS.DAT'), P = 768;
const rgb = c => [0, 1, 2].map(k => pals[P + c * 3 + k] * 4);
const E = 16, M = 128, S = E * 2 + M;   // edge, middle, sheet size
// source pixel for each output pixel: corners from (0..15, 0..15), edges from the top and left strips, mirrored
const src = (x, y) => {
  const fx = x >= E + M ? S - 1 - x : x, fy = y >= E + M ? S - 1 - y : y;   // mirror right and bottom
  if (fx < E && fy < E) return [fx, fy];
  if (fy < E) return [24 + (fx - E), fy];            // top edge: x 24..151
  if (fx < E) return [fx, 24 + (fy - E)];            // left edge: y 24..151
  return [60 + (fx - E), 40 + (fy - E)];            // the sheet: x 60..187, y 40..167
};
// the sheet's median brightness, mapped to the site's paper colour; darker and lighter pixels keep their ratio
const lum = c => { const [r, g, b] = rgb(c); return .3 * r + .59 * g + .11 * b; };
const mid = (() => { const l = []; for (let y = 40; y < 168; y++) for (let x = 60; x < 188; x++) l.push(lum(map[y * 320 + x])); l.sort((a, b) => a - b); return l[l.length >> 1]; })();
const PAPER = [244, 236, 214], INK = [70, 46, 26];
const out = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const [sx, sy] = src(x, y), c = map[sy * 320 + sx], l = lum(c), o = (y * S + x) * 4;
  if (l < 12) continue;   // the black outside the edge
  const t = Math.max(0, Math.min(1.15, l / mid));   // 1 = the sheet's middle tone
  const v = t >= 1 ? PAPER.map(p => Math.min(255, p + (t - 1) * 60)) : PAPER.map((p, k) => INK[k] + (p - INK[k]) * Math.pow(t, 2.2));
  out[o] = v[0]; out[o + 1] = v[1]; out[o + 2] = v[2]; out[o + 3] = 255;
}
writeFileSync(new URL('../img/parchment.png', import.meta.url), png(S, S, out, 4));
console.log(`img/parchment.png: ${S} x ${S}, slice ${E}, middle tone ${mid.toFixed(0)}`);
