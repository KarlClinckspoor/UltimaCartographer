// Ultima VII sign, gravestone and plaque texts and the fonts the game draws them in, for data/<id>/signs.json and
// data/<id>/font-<n>.png.
// Usage: node tools/extract-u7-signs.mjs <u7bg|u7si> <STATIC folder> <decompiled usecode folder>
//   u7bg: ../Ultima7_Decomp/decompiled/"Black Gate/U7/usecode"   u7si: ../Ultima7_Decomp/decompiled/"Serpent Isle/si/usecode"
// From the Ultima 7 decompilation (KarlClinckspoor/Ultima7_Decomp):
// - An item's usecode routine is the one numbered as its shape (usecode/usecode.uh). The sign routines read the item's
//   quality and, for each quality, pass a list of lines to ShowSign_i with a sign style (inter/uccomm11.c
//   UC_DisplayRunes), so the text is keyed by (shape, quality). The decompiled routines rebuild the game's USECODE byte
//   for byte, so their string lists are read here.
// - main/signgump.c: the style picks the font. The Black Gate: 49 sign, 50 gravestone, 51 plaque, fonts 1, 3, 6. Serpent
//   Isle: 44 sign, 45, 46 plaque, fonts 1, 3, 6; styles 47-49 are the same in the runic fonts 9, 9, 10 (the serpent
//   plaques, style 49). main/u7manage.c: FONTS.VGA is a flex, font n its record n, a shape whose frame c is character c
//   (main/colbuf.c); main/u7font.c: per-font letter spacing.
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {png} from './png.mjs';

const [id, dir, ucDir] = process.argv.slice(2);
if (!id || !dir || !ucDir) { console.error('usage: node tools/extract-u7-signs.mjs <u7bg|u7si> <STATIC folder> <decompiled usecode folder>'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', id);

// shape -> [usecode file, kind]; style -> font (main/signgump.c)
const GAME = {
  u7bg: {routines: {379: ['Sign.use', 'sign'], 715: ['Tombstone.use', 'gravestone'], 820: ['Plaque.use', 'plaque']},
    fonts: {49: 1, 50: 3, 51: 6}, spacing: [-1, 1, 0, 1, 0, 0, 0, -1]},
  u7si: {routines: {379: ['&SIGN.use', 'sign'], 820: ['&PLAQUE.use', 'plaque'], 709: ['&SERP_PL.use', 'serpent plaque']},
    fonts: {44: 1, 45: 3, 46: 6, 47: 9, 48: 9, 49: 10}, spacing: null},
}[id];
if (!GAME) throw new Error(`unknown game ${id}`);

// ---------- texts: in each routine, the first list of strings given for each quality ----------
const strings = s => [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\(.)/g, '$1'));
const texts = {};
for (const [shape, [name, kind]] of Object.entries(GAME.routines)) {
  const src = readFileSync(join(ucDir, name), 'latin1').split(/\r?\n/);
  const style = +(/ShowSign_i\([^;]*,\s*(\d+)\);/.exec(src.join('\n')) || [])[1];
  const byQ = {};
  let q = null;
  for (const line of src) {
    const c = /^\s*(?:case (\d+) \{|if \(v\d+ = (\d+)\) \{)/.exec(line);
    if (c) { q = +(c[1] ?? c[2]); continue; }
    if (/^\s*default \{/.test(line)) { q = null; continue; }
    if (q == null || byQ[q]) continue;
    // a list or a single string, given to ShowSign_i or put in the variable the routine passes to it
    if (/ShowSign_i\(|^\s*v\d+ = (<< "|")/.test(line)) { const s = strings(line); if (s.length) byQ[q] = s; }
  }
  texts[shape] = {kind, style, font: GAME.fonts[style], lines: byQ};
  console.log(`${id} ${name}: shape ${shape}, style ${style}, font ${GAME.fonts[style]}, ${Object.keys(byQ).length} texts`);
}

// ---------- fonts: FONTS.VGA record n, frame c = character c (RLE shape frames, as SHAPES.VGA) ----------
const vga = readFileSync(join(dir, 'FONTS.VGA')), n = vga.readUInt32LE(0x54);
const rec = i => i < n ? [vga.readUInt32LE(0x80 + i * 8), vga.readUInt32LE(0x84 + i * 8)] : [0, 0];
function frames(i) {
  const [off, len] = rec(i);
  if (!len) return [];
  const count = (vga.readUInt32LE(off + 4) - 4) / 4, list = [];
  for (let f = 0; f < count; f++) {
    const fo = off + vga.readUInt32LE(off + 4 + f * 4);
    const xright = vga.readInt16LE(fo), xleft = vga.readInt16LE(fo + 2), yabove = vga.readInt16LE(fo + 4), ybelow = vga.readInt16LE(fo + 6);
    const w = xleft + xright + 1, h = yabove + ybelow + 1, px = new Uint8Array(Math.max(0, w * h));
    let p = fo + 8;
    for (;;) {
      let scan = vga.readUInt16LE(p); p += 2;
      if (!scan) break;
      const enc = scan & 1; scan >>= 1;
      let x = xleft + vga.readInt16LE(p); const y = yabove + vga.readInt16LE(p + 2); p += 4;
      const put = () => { if (x >= 0 && x < w && y >= 0 && y < h) px[y * w + x] = 1; x++; };
      if (!enc) { for (let k = 0; k < scan; k++) { put(); p++; } }
      else for (let done = 0; done < scan;) {
        let b = vga[p++]; const rep = b & 1; b >>= 1;
        if (rep) { p++; for (let k = 0; k < b; k++) put(); } else for (let k = 0; k < b; k++) { put(); p++; }
        done += b;
      }
    }
    list.push({w: Math.max(0, w), h: Math.max(0, h), yabove, px});
  }
  return list;
}
// A sheet of 16 cells a row, each as wide as the widest glyph and tall enough for every glyph on one baseline; the glyph
// at the cell's left. White on transparent, as the other games' font sheets.
const fonts = {};
for (const f of new Set(Object.values(texts).map(t => t.font))) {
  const fr = frames(f);
  const above = Math.max(...fr.map(g => g.yabove)), below = Math.max(...fr.map(g => g.h - g.yabove));
  const cw = Math.max(...fr.map(g => g.w)), ch = above + below, rows = Math.ceil(fr.length / 16), W = cw * 16, H = ch * rows;
  const img = Buffer.alloc(W * H * 4);
  fr.forEach((g, c) => {
    const ox = (c % 16) * cw, oy = Math.floor(c / 16) * ch + above - g.yabove;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.px[y * g.w + x]) img.fill(255, ((oy + y) * W + ox + x) * 4, ((oy + y) * W + ox + x) * 4 + 4);
  });
  writeFileSync(join(out, `font-${f}.png`), png(W, H, img, 4));
  fonts[f] = {w: cw, h: ch, perRow: 16, widths: fr.map(g => g.w), gap: GAME.spacing ? GAME.spacing[f] * 2 : 0};
  console.log(`${id} font ${f}: ${fr.length} glyphs, cell ${cw} x ${ch}`);
}
writeFileSync(join(out, 'signs.json'), JSON.stringify({texts, fonts}));
