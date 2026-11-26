// Runic text and the fonts it is drawn in (js/lib/runes.js): Ultima V's signs and RUNES.CH, Ultima VI's books and
// U6.CH, Ultima VII's signs and FONTS.VGA. Every character a runic text uses must have a glyph in its own game's font.
// Usage: node tests/runes.test.mjs
import {readFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.log('FAIL', name); } };

// a PNG's alpha (RGBA 8-bit, as tools/png.mjs writes the font sheets)
function alpha(file) {
  const b = readFileSync(file), ids = [];
  let p = 8, W = 0, H = 0;
  while (p < b.length) { const l = b.readUInt32BE(p), t = b.toString('latin1', p + 4, p + 8); if (t === 'IHDR') { W = b.readUInt32BE(p + 8); H = b.readUInt32BE(p + 12); } if (t === 'IDAT') ids.push(b.subarray(p + 8, p + 8 + l)); p += 12 + l; }
  const raw = inflateSync(Buffer.concat(ids)), st = W * 4, out = new Uint8Array(W * H), prev = Buffer.alloc(st), cur = Buffer.alloc(st);
  for (let y = 0; y < H; y++) {
    const ft = raw[y * (st + 1)]; raw.copy(cur, 0, y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let i = 0; i < st; i++) { const A = i >= 4 ? cur[i - 4] : 0, B = prev[i], C = i >= 4 ? prev[i - 4] : 0; let v = cur[i];
      if (ft === 1) v += A; else if (ft === 2) v += B; else if (ft === 3) v += (A + B) >> 1; else if (ft === 4) { const q = A + B - C, pa = Math.abs(q - A), pb = Math.abs(q - B), pc = Math.abs(q - C); v += pa <= pb && pa <= pc ? A : pb <= pc ? B : C; }
      cur[i] = v & 255; }
    for (let x = 0; x < W; x++) out[y * W + x] = cur[x * 4 + 3];
    cur.copy(prev);
  }
  return {W, H, a: out};
}
// whether glyph c of a sheet of w x h cells, perRow a row, has any pixel (widths: proportional fonts)
const inked = (s, c, w, h, perRow = 16, gw = w) => { const gx = (c % perRow) * w, gy = Math.floor(c / perRow) * h; for (let y = 0; y < h; y++) for (let x = 0; x < gw; x++) if (s.a[(gy + y) * s.W + gx + x]) return true; return false; };
const chars = s => [...new Set(s)].join('');

// ---------- Ultima VI: <...> in BOOK.DAT, printed with CON_printf (%x prints x) from U6.CH's upper half ----------
{
  const d = JSON.parse(readFileSync(join(root, 'u6', 'u6.json'))), f = join(root, 'u6', 'runes.png');
  check('U6: runes.png extracted', existsSync(f));
  if (existsSync(f)) {
    const s = alpha(f);
    check('U6: runes.png is 128 glyphs of 8 x 8', s.W === 128 && s.H === 64);
    check('U6: runes for A-Z and [ \\ ] ^ _', [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_'].every(ch => inked(s, ch.charCodeAt(0), 8, 8)));
    const runic = d.books.flatMap(t => [...t.replace(/%(.)/g, '$1').matchAll(/<([^>]*)>/g)].map(m => m[1])).join('');
    const missing = chars(runic).replace(/ /g, '').split('').filter(ch => !inked(s, ch.charCodeAt(0), 8, 8));
    check(`U6: every character in runes has a glyph (missing: ${missing.join('')})`, !missing.length);
    check('U6: Gargish (lower case) in the font', /[a-z]/.test(runic) && [...'abcdefghijklmnopqrstuvwxyz'].filter(ch => runic.includes(ch)).every(ch => inked(s, ch.charCodeAt(0), 8, 8)));
    // % is CON_printf's escape: in BOOK.DAT it only ever puts a \ (EE) or ^ (EA) that CON_putch would take as an escape
    check('U6: % only before \\ or ^', d.books.every(t => !/%[^\\^]/.test(t)));
  }
}

// ---------- Ultima V: signs (lookobj.c PrintSignText), bytes without bit 7 from RUNES.CH ----------
{
  const d = JSON.parse(readFileSync(join(root, 'u5', 'u5.json'))), s = alpha(join(root, 'u5', 'font1.png'));
  check('U5: every sign keeps its raw bytes', d.signs.every(x => typeof x.raw === 'string'));
  const runic = d.signs.map(x => [...x.raw].filter(ch => { const c = ch.charCodeAt(0); return c < 128 && c > 32 && !(c >= 0x26 && c <= 0x31 && c !== 0x28) && c !== 13 && c !== 10; }).join('')).join('');
  const missing = chars(runic).split('').filter(ch => !inked(s, ch.charCodeAt(0), 8, 8));
  check(`U5: every rune on a sign has a glyph (missing: ${missing.join('')})`, !missing.length);
  check('U5: the digraph keys [ \\ ] ^ _ are runes', [...'[\\]^_'].every(ch => inked(s, ch.charCodeAt(0), 8, 8)));
}

// ---------- Ultima VII: ShowSign_i lines, drawn in FONTS.VGA font n (byte c = frame c) ----------
for (const g of ['u7bg', 'u7si']) {
  const f = join(root, g, 'signs.json');
  check(`${g}: signs.json extracted`, existsSync(f));
  if (!existsSync(f)) continue;
  const {texts, fonts} = JSON.parse(readFileSync(f));
  check(`${g}: sign texts`, Object.values(texts).every(t => Object.keys(t.lines).length > 0 && fonts[t.font]));
  for (const t of Object.values(texts)) {
    const fo = fonts[t.font], s = alpha(join(root, g, `font-${t.font}.png`));
    const used = chars(Object.values(t.lines).flat().join('')).replace(/ /g, '');
    // Usecode writes some characters the Britannian fonts leave blank, so the game shows a gap there: ~ (once, Skara Brae's
    // sign), @ (a quote mark), the apostrophe, ? ! & and, in the plaque font 6, the word break |. Anything else missing
    // would be an extraction error.
    const missing = used.split('').filter(ch => { const c = ch.charCodeAt(0); return c >= fo.widths.length || !inked(s, c, fo.w, fo.h, fo.perRow, fo.widths[c]); }).filter(ch => !"~@'?!&|".includes(ch));
    check(`${g}: every character of the ${t.kind} texts has a glyph in font ${t.font} (missing: ${missing.join('')})`, !missing.length);
  }
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
