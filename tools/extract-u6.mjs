// Ultima VI engine games (Ultima VI, The Savage Empire, Martian Dreams): reads the game files and
// writes what the site needs to data/<game>/.
// Usage: node tools/extract-u6.mjs <u6|se|md> <game data folder> <dialogue.json of its decompilation>
// Formats: u6-decompiled SRC (map.c, object.c, console.c GAME_Load, u6.h) and docs/port/MCGA_DRIVER.md (tiles).
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {png} from './png.mjs';

const [game, dir, dialogue] = process.argv.slice(2);
if (!game || !dir) { console.error('usage: node tools/extract-u6.mjs <u6|se|md> <game data folder> [dialogue.json]'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', game);
mkdirSync(out, {recursive: true});
const has = n => existsSync(join(dir, n));
const file = (...names) => { for (const n of names) if (has(n)) return readFileSync(join(dir, n)); throw new Error(`none of ${names.join(', ')} in ${dir}`); };

// ---------- LZW: uint32 size, then 9-12 bit codes, LSB first; 0x100 reset, 0x101 end ----------
function lzw(f) {
  const want = f.readUInt32LE(0), src = f.subarray(4), o = Buffer.alloc(want);
  const prefix = new Int32Array(4096), root = new Uint8Array(4096);
  let bits = 0, width = 9, next = 0x102, size = 0x200, pos = 0, prev = -1;
  const read = () => { const i = bits >> 3, w = (src[i] | src[i + 1] << 8 | (src[i + 2] || 0) << 16) >> (bits & 7); bits += width; return w & ((1 << width) - 1); };
  const str = c => { const s = []; while (c > 0xFF) { s.push(root[c]); c = prefix[c]; } s.push(c); return s.reverse(); };
  for (;;) {
    const c = read();
    if (c === 0x101) break;
    if (c === 0x100) { width = 9; next = 0x102; size = 0x200; prev = read(); o[pos++] = prev; continue; }
    const s = c < next ? str(c) : [...str(prev), str(prev)[0]];
    for (const b of s) o[pos++] = b;
    prefix[next] = prev; root[next] = s[0]; next++;
    if (next >= size && width < 12) { width++; size *= 2; }
    prev = c;
  }
  if (pos !== want) throw new Error(`LZW: ${pos} bytes, expected ${want}`);
  return o;
}
// Packed files: U6's are LZW (a size, then a stream starting with the 0x100 reset code). The later
// games' are libraries: uint32 total size, then uint32 entry offsets whose top byte says how the
// entry is kept (1 LZW, 2 stored); entry() returns one of them.
const isLzw = b => b.length > 6 && ((b[4] | b[5] << 8) & 0x1FF) === 0x100;
function entries(b) {
  if (isLzw(b)) return [lzw(b)];
  if (b.readUInt32LE(0) !== b.length) throw new Error('neither LZW nor a library');
  const first = b.readUInt32LE(4) & 0xFFFFFF, n = first / 4 - 1, out = [];
  for (let i = 0; i < n; i++) {
    const w = b.readUInt32LE(4 + i * 4), o = w & 0xFFFFFF, kind = w >>> 24;
    const e = i + 1 < n ? b.readUInt32LE(8 + i * 4) & 0xFFFFFF : b.length, data = b.subarray(o, e);
    out.push(o === 0 || e <= o ? Buffer.alloc(0) : kind === 1 ? lzw(data) : data);
  }
  return out;
}
const unpack = b => entries(b)[0];

// ---------- palette (6-bit VGA) ----------
const palFile = file('U6PAL', 'SEPAL', 'MDPAL');
const PAL = Array.from({length: 256}, (_, i) => [0, 1, 2].map(k => Math.round(palFile[i * 3 + k] * 255 / 63)));

// ---------- tiles: 0-1FFh in MAPTILES.VGA at TILEINDX paragraphs; 200h-7FFh in OBJTILES.VGA by MASKTYPE blocks ----------
const mask = unpack(file('MASKTYPE.VGA')), fmt = mask.subarray(0, 0x800), block = mask.subarray(0x800, 0xE00);
const blockOfs = i => mask.readUInt16LE(0xE00 + i * 2) * 16;
const mapTiles = unpack(file('MAPTILES.VGA')), tileIndx = file('TILEINDX.VGA'), objTiles = file('OBJTILES.VGA');
const isPacked = t => (fmt[t] & 3) >= 2;
const tileData = new Array(0x800);
for (let t = 0; t < 0x200; t++) tileData[t] = mapTiles.subarray(tileIndx.readUInt16LE(t * 2) * 16);
for (let t = 0x200; t < 0x800;) {   // each block: its tiles one after the other
  const b = block[t - 0x200];
  let o = blockOfs(b);
  for (; t < 0x800 && block[t - 0x200] === b; t++) { tileData[t] = objTiles.subarray(o); o += fmt[t] & 8 ? objTiles[o] * 16 : 256; }
}
const W = 32, sheet = Buffer.alloc(W * 16 * (0x800 / W) * 16 * 4);
const pixels = [];
for (let t = 0; t < 0x800; t++) {
  const px = new Int16Array(256).fill(-1), d = tileData[t];
  if (!isPacked(t)) for (let i = 0; i < 256; i++) px[i] = (fmt[t] & 3) === 1 && d[i] === 0xFF ? -1 : d[i];
  else {   // runs {int16 displacement, uint8 n, n pixels} in a 176-wide raster, converted to 16 wide
    let si = 1, di = 0;
    for (;;) {
      let ax = d.readInt16LE(si); si += 2; di += ax;
      while (ax >= 16) { di -= 160; ax -= 176; }
      const n = d[si++];
      if (!n) break;
      for (let k = 0; k < n; k++) if (di + k >= 0 && di + k < 256) px[di + k] = d[si + k];
      di += n; si += n;
    }
  }
  pixels.push(px);
}
// ANIMDATA: count, then 32 tile numbers, 32 first frames, 32 masks, 32 shifts (main.c); an animated tile
// shows its first frame's pixels (the water tiles have none of their own).
const own = pixels.slice(), animData = [];
if (has('ANIMDATA')) {
  const a = file('ANIMDATA'), n = a.readUInt16LE(0);
  for (let i = 0; i < n; i++) {
    const t = a.readUInt16LE(2 + i * 2), f = a.readUInt16LE(66 + i * 2);
    animData.push([t, f, a[130 + i], a[162 + i]]);
    if (t < 0x800 && f < 0x800) pixels[t] = pixels[f];
  }
}
const avg = [];   // each tile's average colour and coverage, for drawing far zoomed out
for (let t = 0; t < 0x800; t++) {
  const px = pixels[t];
  let r = 0, g = 0, bl = 0, n = 0;
  for (let i = 0; i < 256; i++) {
    if (px[i] < 0) continue;
    const [cr, cg, cb] = PAL[px[i]], x = (t % W) * 16 + (i & 15), y = Math.floor(t / W) * 16 + (i >> 4), o = (y * W * 16 + x) * 4;
    sheet[o] = cr; sheet[o + 1] = cg; sheet[o + 2] = cb; sheet[o + 3] = 255;
    r += cr; g += cg; bl += cb; n++;
  }
  avg.push(n ? [Math.round(r / n), Math.round(g / n), Math.round(bl / n), Math.round(n / 2.56)] : [0, 0, 0, 0]);
}
writeFileSync(join(out, 'tiles.png'), png(W * 16, (0x800 / W) * 16, sheet, 4));

// ---------- tile tables ----------
const flags = file('TILEFLAG');   // 800h terrain, 800h flags, 400h weights, 800h flags 2 (main.c)
const terrain = [...flags.subarray(0, 0x800)], tileFlag = [...flags.subarray(0x800, 0x1000)], tileFlag2 = [...flags.subarray(0x1400, 0x1C00)];
const baseTile = Array.from({length: 0x400}, (_, i) => file('BASETILE').readUInt16LE(i * 2));
// LOOK: (last tile of a range, name) pairs; the name covers the tiles after the previous entry up to it.
const look = new Array(0x800).fill('');
{
  let b = file('LOOK.LZD', 'LOOK.LZC');
  b = unpack(b);
  let o = 0, from = 0;
  while (o < b.length - 2) { const t = b.readUInt16LE(o), e = b.indexOf(0, o + 2); const name = b.subarray(o + 2, e).toString('latin1'); for (let k = from; k <= Math.min(t, 0x7FF); k++) look[k] = name; from = t + 1; o = e + 1; }
}
// BOOK.DAT: word offsets, then texts (signs, books, scrolls, plaques: the object's quality picks one).
let books = [];
if (has('BOOK.DAT')) { const b = file('BOOK.DAT'), n = b.readUInt16LE(0) / 2; for (let i = 0; i < n; i++) { const o = b.readUInt16LE(i * 2), e = i + 1 < n ? b.readUInt16LE(i * 2 + 2) : b.length; books.push(b.subarray(o, e).toString('latin1').replace(/\0/g, '')); } }
// Martian Dreams keeps them in MDTEXT.LZC, an entry per quality - 1 (useact1.c UseRead).
if (has('MDTEXT.LZC')) books = entries(file('MDTEXT.LZC')).map(b => b.toString('latin1').replace(/\0[\s\S]*$/, ''));

// ---------- map and objects: kept as the game stores them (the browser decodes them) ----------
writeFileSync(join(out, 'map.bin'), has('MAP') ? file('MAP') : unpack(file('LZMAP')));
writeFileSync(join(out, 'chunks.bin'), file('CHUNKS'));
const objblk = unpack(file('LZOBJBLK')), dngblk = unpack(file('LZDNGBLK'));
writeFileSync(join(out, 'objblk.bin'), objblk);
// LZDNGBLK: the 5 dungeon levels' blocks, then the starting objlist (NPCs and game state).
let o = 0;
for (let k = 0; k < 5; k++) o += 2 + dngblk.readUInt16LE(o) * 8;
writeFileSync(join(out, 'dngblk.bin'), dngblk.subarray(0, o));
const objlist = dngblk.subarray(o);
writeFileSync(join(out, 'objlist.bin'), objlist);

// ---------- schedules: 257 word pointers, then (hour | weekday << 5, action, x/y/z) entries ----------
const sch = file('SCHEDULE'), schedule = [];
{
  const ptr = i => sch.readUInt16LE(i * 2), base = 0x202;
  for (let n = 0; n < 256; n++) {
    const list = [];
    const count = ptr(256), end = Math.min(n < 255 ? ptr(n + 1) : count, count);
    for (let e = ptr(n); e < end; e++) {
      const r = sch.subarray(base + e * 5, base + e * 5 + 5);
      list.push([r[0], r[1], r.readUInt16LE(2) & 0x3FF, (r.readUInt16LE(3) >> 2) & 0x3FF, r[4] >> 4]);
    }
    schedule.push(list);
  }
}

// ---------- conversations: condensed from the decompilation's export (keywords and what is said) ----------
const talk = {};
if (dialogue && existsSync(dialogue)) {
  for (const s of JSON.parse(readFileSync(dialogue, 'utf8'))) {
    const look = (s.description || []).map(x => x.text || '').join('').replace(/\*\s*$/, '').trim();
    const qa = [], hello = [];
    let cur = null, prompted = false;
    const close = () => { if (cur && cur.a.length) qa.push({k: cur.k, a: cur.a.join(' ').replace(/\s+/g, ' ').trim(), c: cur.c || undefined}); cur = null; };
    for (const c of s.code) for (const it of c.items) {
      if (it.keywords) { if (!cur || cur.a.length) { close(); cur = {k: [], a: [], c: false}; } cur.k.push(...it.keywords); }
      else if (it.input) { prompted = true; }
      else if (it.text !== undefined) { if (cur) cur.a.push(it.text); else if (!prompted) hello.push(it.text); }
      else if (it.if) { if (cur) cur.c = true; }
      else if (it.goto || it.end_answer || it.leave) { if (cur && cur.a.length) close(); }
    }
    close();
    // keep the first answer for each keyword set
    const seen = new Set(), uniq = qa.filter(q => { const key = q.k.join(','); if (seen.has(key)) return false; seen.add(key); return true; });
    talk[s.npc] = {name: s.name.replace(/_ /g, '. ').replace(/_/g, ' '), look, hello: hello.join(' ').replace(/\s+/g, ' ').trim().slice(0, 600), qa: uniq};
  }
}

// ---------- animation: what the browser needs to animate the map as the game does ----------
// Each display tick (DisplayTick, gameloop.c) AnimateTilesAndActors adds 1 to AnimFrameCounter and every ANIMDATA
// entry i whose StateAnimData[i] is 1 shows tile AnimFirstFrame[i] + ((counter & AnimFrameMask[i]) >> AnimFrameShift[i])
// (GR_SET_ANIM_FRAME); state 0 keeps the first frame. Ultima VI then, on even counts, copies the water tiles' pixels
// into the shore tiles 10h-2Fh through ANIMMASK.VGA (GR_ANIMATE_TILES, docs/port/MCGA_DRIVER.md entry 3Fh). Beside
// it PaletteAnimation (main.c of all three) cycles colours E0h-FBh and pulses FFh.
// The state at the start of a game (GAME_Load, console.c of each game):
//   Ultima VI: chains, cranks and bells are still until used.
//   The Savage Empire: everything runs.
//   Martian Dreams: the power-driven machines (tiles of types BCh, BFh, 1B0h, 1B3h) are still unless TalkFlags[73h]
//   bit 2; the canals (IsWaterTile: 10h-17h, C0h-C3h), tiles 1-4 and the clocks (type 62h) get mask 0. The clocks
//   show the hour: DrawSkyBar (gfx.c) sets their first frame to 1A0h + hour % 12.
const animOut = {ms: game === 'u6' ? 55 : 63, tiles: [], pix: {}, dyn: []};
{
  const isAnim = new Set(animData.map(e => e[0]));
  const objlist0 = dngblk.subarray(o);
  const mdFlags = n => objlist0[0x18F1 + n];   // TalkFlags in the objlist (GAME_Load's reads)
  const still = t => game === 'u6' ? [0x3F1, 0x3FC, baseTile[0xEC]].includes(t)
    : game === 'md' ? (!(mdFlags(0x73) & 4) && [0xBC, 0xBF, 0x1B0, 0x1B3].some(ty => t >= baseTile[ty] && t < baseTile[ty + 1]))
      || (t >= 0x10 && t <= 0x17) || (t >= 0xC0 && t <= 0xC3) || (t >= 1 && t <= 4) || t === baseTile[0x62] : false;
  if (game === 'md') animOut.clock = {tile: baseTile[0x62], first: 0x1A0};
  const need = new Set(), dyn = new Set();
  const cycles = px => px.some(c => (c >= 0xE0 && c <= 0xFB) || c === 0xFF);
  for (const [t, first, mask, shift] of animData) {
    if (still(t) || !mask) continue;
    animOut.tiles.push([t, first, mask, shift]);
    dyn.add(t);
    for (let k = 0; k <= mask >> shift; k++) need.add(first + k);
  }
  if (game === 'u6') {
    // the driver's table at 2C00h (port/gfx/mcga.c init_animsrc): the water tile each shore tile copies
    const src = [0x0B, 0x0B, 0x0D, 0x0D, 0x0F, 0x0F, 0x09, 0x09, 0x0D, 0x0F, 0x0B, 0x09, 0x0B, 0x0D, 0x0F, 0x09,
      0x0D, 0x0F, 0x0F, 0x09, 0x09, 0x0B, 0x0B, 0x0D, 0x09, 0x0B, 0x0F, 0x0D, 0x0D, 0x0F, 0x09, 0x0B];
    const masks = unpack(file('ANIMMASK.VGA'));
    animOut.shore = {first: 0x10, src, masks: masks.subarray(0, 32 * 64).toString('base64')};
    for (let k = 0; k < 32; k++) { dyn.add(0x10 + k); need.add(0x10 + k); }
  }
  // tiles whose colours cycle (in any frame they show)
  for (let t = 0; t < 0x800; t++) if (!dyn.has(t) && cycles(pixels[t])) { dyn.add(t); need.add(t); }
  for (const t of need) if (isAnim.has(t) && !still(t) && animOut.tiles.some(e => e[1] <= t && t <= e[1] + (e[2] >> e[3]))) throw new Error(`frame ${t} is itself animated`);
  // pixels: 256 palette indexes, then 32 bytes of opacity bits (a frame's own pixels; a still animated tile's are its first frame's)
  for (const t of [...need].sort((a, b) => a - b)) {
    const px = isAnim.has(t) ? pixels[t] : own[t], b = Buffer.alloc(288);
    for (let i = 0; i < 256; i++) if (px[i] >= 0) { b[i] = px[i]; b[256 + (i >> 3)] |= 1 << (i & 7); }
    animOut.pix[t] = b.toString('base64');
  }
  animOut.dyn = [...dyn].sort((a, b) => a - b);
}

writeFileSync(join(out, `${game}.json`), JSON.stringify({game, pal: PAL, avg, terrain, tileFlag, tileFlag2, baseTile, look, books, schedule, talk, fmt: [...fmt], anim: animOut}));
console.log(`${game}: animated tiles ${animOut.tiles.length}, changing tiles ${animOut.dyn.length}, pixel sets ${Object.keys(animOut.pix).length}`);
console.log(`${game}: tiles 2048, objects ${objblk.length} + ${o} bytes, objlist ${objlist.length}, schedules ${schedule.filter(s => s.length).length}, talk ${Object.keys(talk).length}, books ${books.length} -> ${out}`);
