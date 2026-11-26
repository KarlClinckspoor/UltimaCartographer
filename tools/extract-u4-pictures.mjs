// Ultima IV's full-screen pictures (*.EGA: the title, the intro, the shrine visions, the rune pictures, the end game),
// written as PNGs to look at, not used by the site.
// Usage: node tools/extract-u4-pictures.mjs <game folder> <out folder>
// From u4-decompiled-port: SRC-TITLE/INFLATE.ASM (LzwDecode, LzwNextCode, LzwHashSlot) unpacks the file, 12-bit codes,
// two codes in three bytes, a hashed dictionary of 0xF00 slots that starts over after 0xCCC new strings; SRC-TITLE/
// GRAPH.ASM CB_ega puts each unpacked byte on screen as two pixels of 4 bits, high nibble first, 320 x 200. That is
// how TITLE.EXE's pictures are packed. The pictures AVATAR.EXE shows (the shrine visions and runes, the end game:
// SRC/U4_SHRIN.C, U4_END.C) go through EGA.DRV, which the decompilation does not include; they are run-length packed
// (0x02, a count, a byte; any other byte as it is), which unpacks each to exactly 32000 bytes, one screen.
import {readFileSync, writeFileSync, readdirSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {png} from './png.mjs';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node tools/extract-u4-pictures.mjs <game folder> <out folder>'); process.exit(1); }
mkdirSync(out, {recursive: true});
const EGA = [[0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170], [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
  [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255], [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255]];

function inflate(buf) {
  const prefix = new Uint16Array(0x1000), suffix = new Uint8Array(0x1000), outb = [];
  let pos = 0, half = false, rest = 0;
  const next = () => {   // LzwNextCode
    if (pos >= buf.length) return 0xFFFF;
    let a = buf[pos++], code;
    if (!half) {
      if (pos >= buf.length) return 0xFFFF;
      const b = buf[pos++]; rest = b; code = (a << 4) | (b >> 4);
    } else code = ((rest & 15) << 8) | a;
    half = !half;
    return code;
  };
  const slot = (pre, ch) => {   // LzwHashSlot: a free slot, or the one holding (pre, ch)
    const hit = s => !prefix[s] || ((prefix[s] & ~0x2000) === pre && suffix[s] === ch);
    let s = ((ch << 4) ^ pre) & 0xFFF;
    if (s >> 8 && hit(s)) return s;
    let v = ((((ch << 1) + pre) | 0x800) >>> 0);
    v = (v * v) >>> 0;
    s = (v >>> 6) & 0xFFF;   // the middle bits of the square: MUL, RCL x2, then AH:DL
    if (s >> 8 && hit(s)) return s;
    for (;;) { s = (s + 0x1FD) & 0xFFF; if (s >> 8 && hit(s)) return s; }
  };
  let count = 0, old = next(), ch = old;
  if (old === 0xFFFF) return Buffer.alloc(0);
  outb.push(old & 255);
  for (;;) {
    let code = next();
    if (code === 0xFFFF) break;
    if (code >> 8) {
      const stack = [];
      let c = code;
      if (!prefix[c]) { stack.push(ch); c = old; }   // not yet in the dictionary: the previous string and its first byte
      while (c >> 8) { stack.push(suffix[c]); c = prefix[c] & ~0x2000; }
      ch = c; outb.push(c);
      while (stack.length) outb.push(stack.pop());
    } else { outb.push(code); ch = code; }
    const s = slot(old, ch);
    suffix[s] = ch; prefix[s] = old | 0x2000;
    if (++count > 0xCCC) {
      count = 0; prefix.fill(0);
      code = next();
      if (code === 0xFFFF) break;
      ch = code; outb.push(code & 255);
    }
    old = code;
  }
  return Buffer.from(outb);
}

function unrle(buf) {
  const o = [];
  for (let i = 0; i < buf.length; i++) { if (buf[i] === 2) { const n = buf[++i], v = buf[++i]; for (let k = 0; k < n; k++) o.push(v); } else o.push(buf[i]); }
  return Buffer.from(o);
}
// the pictures TITLE.EXE loads (SRC-TITLE/TITLE_0.C, TITLE_1.C); the rest are AVATAR.EXE's (START: the game's frame, U4_GRAPH.ASM DrawGameFrame)
const TITLE = new Set(['TITLE', 'ANIMATE', 'TREE', 'PORTAL', 'OUTSIDE', 'INSIDE', 'WAGON', 'GYPSY', 'ABACUS', 'HONCOM', 'VALJUS', 'SACHONOR', 'SPIRHUM']);

for (const f of readdirSync(dir).filter(n => /\.EGA$/i.test(n) && !/^(CHARSET|SHAPES)\.EGA$/i.test(n))) {
  const name = f.replace(/\.EGA$/i, '').toUpperCase(), file = readFileSync(join(dir, f)), raw = TITLE.has(name) ? inflate(file) : unrle(file), W = 320, H = 200, px = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { const b = raw[i >> 1] ?? 0, c = EGA[i & 1 ? b & 15 : b >> 4]; px.set(c, i * 3); }
  writeFileSync(join(out, f.replace(/\.EGA$/i, '.png')), png(W, H, px));
  console.log(`${f}: ${TITLE.has(name) ? 'LZW' : 'RLE'}, ${raw.length} bytes unpacked${raw.length === 32000 ? '' : ' (not one screen!)'}`);
}
