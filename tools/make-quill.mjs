// The map cursor: Ultima Underworld's automap quill (CURSORS.GR picture 12, which ui/AUTOMAP.C sets when the map
// opens), drawn at twice its size into img/quill.png. Prints the tip, the cursor's hot spot, for css/site.css.
// Usage: node tools/make-quill.mjs <UW1 DATA folder>
// CURSORS.GR: type 1, a count, offsets; each picture type 10 (4 bits a pixel, high nibble first): width, height, an
// auxiliary palette (16 entries of ALLPALS.DAT into PALS.DAT palette 0), a size, the pixels. Colour 0 is see-through.
import {readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {png} from './png.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/make-quill.mjs <UW1 DATA folder>'); process.exit(1); }
const gr = readFileSync(join(dir, 'CURSORS.GR')), pal = readFileSync(join(dir, 'PALS.DAT')), aux = readFileSync(join(dir, 'ALLPALS.DAT'));
const o = gr.readUInt32LE(3 + 12 * 4), w = gr[o + 1], h = gr[o + 2], ap = gr[o + 3];
if (gr[o] !== 10) throw new Error(`cursor 12 is type ${gr[o]}, not 10`);
const S = 2, out = Buffer.alloc(w * S * h * S * 4);
let tip = null;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const k = y * w + x, v = gr[o + 6 + (k >> 1)], n = k & 1 ? v & 15 : v >> 4;
  if (!n) continue;
  const c = aux[ap * 16 + n];
  if (!tip || x < tip[0] || (x === tip[0] && y > tip[1])) tip = [x, y];   // the leftmost, lowest pixel: the nib
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
    const q = ((y * S + dy) * w * S + x * S + dx) * 4;
    out[q] = pal[c * 3] * 4; out[q + 1] = pal[c * 3 + 1] * 4; out[q + 2] = pal[c * 3 + 2] * 4; out[q + 3] = 255;
  }
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'img', 'quill.png'), png(w * S, h * S, out, 4));
console.log(`img/quill.png: ${w * S} x ${h * S}, hot spot ${tip[0] * S} ${tip[1] * S + S - 1}`);
