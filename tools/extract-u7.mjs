// Ultima VII (Serpent Isle and The Black Gate): reads the game's STATIC folder and writes what the site
// needs to data/<id>/: the map as the game stores it (U7MAP superchunks of U7CHUNKS chunks), the fixed
// (U7IFIX) and movable (INITGAME.DAT u7ireg) objects as compact records, and only the shape frames the
// map uses, packed into atlas pages.
// Usage: node tools/extract-u7.mjs <u7si|u7bg> <STATIC folder>
// Formats: Exult (gamemap.cc get_ifix_chunk_objects / read_ireg_objects, shapes/vgafile.cc, gamedat.cc), checked against
// the decomp (../Ultima7_Decomp: main/vitem.c IfixEntry, common/itemovr1.c ReadItemRecord, include/iteminfo.h).
import {readFileSync, writeFileSync, mkdirSync, existsSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {png} from './png.mjs';

const [id, dir] = process.argv.slice(2);
if (!id || !dir) { console.error('usage: node tools/extract-u7.mjs <u7si|u7bg> <STATIC folder>'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', id);
mkdirSync(out, {recursive: true});
const file = n => readFileSync(join(dir, n));

// Flex: count at 0x54, then (offset, length) pairs from 0x80.
function flex(b) {
  const n = b.readUInt32LE(0x54), e = [];
  for (let i = 0; i < n; i++) e.push([b.readUInt32LE(0x80 + i * 8), b.readUInt32LE(0x84 + i * 8)]);
  return e;
}

// ---------- palette: PALETTES.FLX entry 0, 6-bit ----------
const palFlex = file('PALETTES.FLX'), [po] = flex(palFlex)[0];
const PAL = Array.from({length: 256}, (_, i) => [0, 1, 2].map(k => Math.min(255, palFlex[po + i * 3 + k] * 4)));

// ---------- translucency: in a shape TFA.DAT marks translucent (blood, water, glass, fields), colours 0xEE-0xFE are
// not colours but blends with what lies beneath, each through a table of XFORM.TBL: colour c uses entry 254 - c
// (decomp common/xformtbl.c, main/bltshape.c: 17 tables). The atlas can only hold a colour and an alpha, so each table is fitted as the blend
// out = a * tint + (1 - a) * beneath that comes nearest it over the palette's fixed colours.
const XF = (() => {
  const b = file('XFORM.TBL'), e = flex(b), out = [];
  for (let k = 0; k < 17; k++) {
    const [o] = e[16 - k];
    let best = null;
    for (let a = 0.05; a <= 0.95; a += 0.01) {
      const T = [0, 1, 2].map(c => { let s = 0; for (let d = 0; d < 224; d++) s += (PAL[b[o + d]][c] - (1 - a) * PAL[d][c]) / a; return Math.max(0, Math.min(255, Math.round(s / 224))); });
      let err = 0; for (let d = 0; d < 224; d++) for (let c = 0; c < 3; c++) { const x = PAL[b[o + d]][c] - (a * T[c] + (1 - a) * PAL[d][c]); err += x * x; }
      if (!best || err < best.err) best = {a, T, err};
    }
    out.push([...best.T, Math.round(best.a * 255)]);
  }
  return out;
})();

// ---------- shapes ----------
const shapes = file('SHAPES.VGA'), shapeEntries = flex(shapes);
// A frame as {w, h, xleft, yabove, px: Int16Array (-1 transparent)}; flats (shapes < 0x96) are raw 8 x 8.
// Frame numbers have 6 bits: 32 and up is frame - 32 reflected, its rows and columns swapped (the same object turned
// a quarter, a west wall's version of a north wall's sconce: Exult vgafile.cc Shape_frame::reflect).
function frame(sh, fr) {
  if (fr & 32) {
    const f = frame(sh, fr & 31); if (!f) return null;
    const px = new Int16Array(f.w * f.h);
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) px[x * f.h + y] = f.px[y * f.w + x];
    return {...f, w: f.h, h: f.w, xleft: f.yabove, yabove: f.xleft, px};
  }
  const [off, len] = shapeEntries[sh] || [0, 0];
  if (!len) return null;
  const dlen = shapes.readUInt32LE(off);
  const rle = dlen === len || (!(len & 1) && dlen === len - 1);
  if (!rle) {
    if ((fr + 1) * 64 > len) return null;
    const px = new Int16Array(64);
    for (let i = 0; i < 64; i++) px[i] = shapes[off + fr * 64 + i];
    return {w: 8, h: 8, xleft: 8, yabove: 8, px, flat: true};
  }
  const hdr = shapes.readUInt32LE(off + 4), n = (hdr - 4) / 4;
  if (fr >= n) return null;
  const fo = off + shapes.readUInt32LE(off + 4 + fr * 4);
  const xright = shapes.readInt16LE(fo), xleft = shapes.readInt16LE(fo + 2), yabove = shapes.readInt16LE(fo + 4), ybelow = shapes.readInt16LE(fo + 6);
  const w = xleft + xright + 1, h = yabove + ybelow + 1;
  if (w <= 0 || h <= 0 || w > 1024 || h > 1024) return null;
  const px = new Int16Array(w * h).fill(-1);
  let p = fo + 8;
  for (;;) {
    let scan = shapes.readUInt16LE(p); p += 2;
    if (!scan) break;
    const enc = scan & 1; scan >>= 1;
    let x = xleft + shapes.readInt16LE(p); const y = yabove + shapes.readInt16LE(p + 2); p += 4;
    const put = c => { if (x >= 0 && x < w && y >= 0 && y < h) px[y * w + x] = c; x++; };
    if (!enc) { for (let k = 0; k < scan; k++) put(shapes[p++]); }
    else for (let done = 0; done < scan;) {
      let b = shapes[p++]; const rep = b & 1; b >>= 1;
      if (rep) { const c = shapes[p++]; for (let k = 0; k < b; k++) put(c); } else for (let k = 0; k < b; k++) put(shapes[p++]);
      done += b;
    }
  }
  return {w, h, xleft, yabove, px};
}

// how many frames a shape has (flats: 64 bytes a frame; others: the frame table in the header)
function frameCount(sh) {
  const [off, len] = shapeEntries[sh] || [0, 0];
  if (!len) return 0;
  const dlen = shapes.readUInt32LE(off), rle = dlen === len || (!(len & 1) && dlen === len - 1);
  return rle ? (shapes.readUInt32LE(off + 4) - 4) / 4 : Math.floor(len / 64);
}

// ---------- the map ----------
const u7map = file('U7MAP'), chunks = file('U7CHUNKS');
const used = new Set(), key = (s, f) => s * 64 + f;   // f: 6 bits, with the reflected flag
const usedChunks = new Set();
for (let i = 0; i < 144 * 256; i++) usedChunks.add(u7map.readUInt16LE(i * 2));
for (const c of usedChunks) for (let t = 0; t < 256; t++) { const v = chunks.readUInt16LE(c * 512 + t * 2); used.add(key(v & 0x3FF, (v >> 10) & 0x1F)); }

// ---------- objects: records of x, y (absolute tiles), lift, shape, frame, quality, kind ----------
// TFA.DAT: 3 bytes a shape; the class is tfa[1] & 15 (7 = eggs, traps, moongates: not drawn).
const tfa = file('TFA.DAT'), cls = s => tfa[s * 3 + 1] & 15;
const objs = [];
for (let sc = 0; sc < 144; sc++) {
  const name = `U7IFIX${sc.toString(16).toUpperCase().padStart(2, '0')}`;
  if (!existsSync(join(dir, name))) continue;
  const b = file(name), scx = (sc % 12) * 16, scy = Math.floor(sc / 12) * 16;
  flex(b).forEach(([o, len], ch) => {
    const cx = scx + (ch & 15), cy = scy + (ch >> 4);
    for (let k = 0; k + 4 <= len; k += 4) {
      const e = b.subarray(o + k, o + k + 4), s = e[2] + 256 * (e[3] & 3), f = e[3] >> 2;
      objs.push({x: cx * 16 + (e[0] >> 4), y: cy * 16 + (e[0] & 15), z: e[1] & 15, s, f, q: 0, fixed: 1});
    }
  });
}
// INITGAME.DAT: a flex of files, each a 13-byte name then the data.
const init = file('INITGAME.DAT'), files = {};
for (const [o, len] of flex(init)) if (len > 13) files[init.subarray(o, o + 13).toString('latin1').replace(/\0.*$/s, '').replace(/\.$/, '').toLowerCase()] = init.subarray(o + 13, o + len);
const nibswap = v => ((v & 15) << 4) | (v >> 4);
// IREG entries from p: each a length byte then the entry; a container's contents follow it, ended by a 0 or 1 (eggs,
// barges and virtue stones use the same bytes for other things: Exult read_ireg_objects). Returns the top-level entries,
// each {e, len, s, f, q, kids: [...]}, and where it stopped; with stopAtEnd, a 0 or 1 at the top level ends the list
// (an NPC's inventory).
function iregEntries(b, p, stopAtEnd) {
  const top = [], stack = [top];
  while (p < b.length) {
    const len = b[p++];
    if (len === 0 || len === 1) { if (stack.length > 1) { stack.pop(); continue; } if (stopAtEnd) break; continue; }
    if (len === 2) { p += 2; continue; }
    if (len === 255) { p += 1; const l = b.readUInt16LE(p); p += 2 + l; continue; }   // special entry
    const e = b.subarray(p, p + len); p += len;
    if (![6, 10, 12, 13, 14, 18].includes(len)) continue;
    const s = e[2] + 256 * (e[3] & 3), f = e[3] >> 2, item = {e, len, s, f, q: len === 6 || len === 10 ? e[5] : e[7], kids: []};
    stack[stack.length - 1].push(item);
    if ((len === 12 || len === 13) && ![7, 9, 11].includes(cls(s)) && (e[4] | e[5] << 8)) stack.push(item.kids);
  }
  return {top, p};
}
// contents as compact arrays: [shape, frame, quality, ...contents]
const tree = items => items.map(i => { used.add(key(i.s, i.f)); return [i.s, i.f, i.q, ...tree(i.kids)]; });
let iregCount = 0;
for (let sc = 0; sc < 144; sc++) {
  const b = files[`u7ireg${sc.toString(16).padStart(2, '0')}`];
  if (!b) continue;
  const scx = (sc % 12) * 16, scy = Math.floor(sc / 12) * 16;
  for (const {e, len, s, f, q, kids} of iregEntries(b, 0, false).top) {
    const lift = nibswap(len === 6 || len === 10 ? e[4] : e[len === 13 ? 10 : 9]) & 15;
    objs.push({x: (scx + (e[0] >> 4)) * 16 + (e[0] & 15), y: (scy + (e[1] >> 4)) * 16 + (e[1] & 15), z: lift, s, f, q, fixed: 0, kids: kids.length ? tree(kids) : null});
    iregCount++;
  }
}
for (const o of objs) if (cls(o.s) !== 7) used.add(key(o.s, o.f));

// NPCs (npc.dat in INITGAME.DAT; decomp common/itemovr2.c, main/u7npc.h): counts of NPCs and monsters, then 117-byte
// records: x, y in the superchunk (chunk in the high nibble, tile in the low), shape | frame << 10, then the item's extra
// record (contents link, superchunk, quality, flags, z in the high nibble of byte 9, ...), then the NPC buffer (its
// ref at 14, status at 16, work type at 22, name at 101). A record whose ref is 0 is an empty slot; an inventory
// follows (IREG entries up to an end mark) only when the ref, the shape and the contents link are all set.
const npcs = [];
{
  const b = files['npc.dat'], total = b.readUInt16LE(0) + b.readUInt16LE(2);
  let p = 4;
  for (let n = 0; n < total && p + 117 <= b.length; n++) {
    const r = b.subarray(p, p + 117), sc = r[6], sf = r.readUInt16LE(2), ref = r.readUInt16LE(14), inv = ref && (sf & 0x3FF) && r.readUInt16LE(4);
    const nm = r.subarray(101, 117).toString('latin1').replace(/\0.*$/s, '').trim();
    const x = ((sc % 12) * 16 + (r[0] >> 4)) * 16 + (r[0] & 15), y = (Math.floor(sc / 12) * 16 + (r[1] >> 4)) * 16 + (r[1] & 15);
    p += 117;
    let inventory = null;
    if (inv) { const r2 = iregEntries(b, p, true); p = r2.p; if (r2.top.length) inventory = r2.top; }   // entries until a 0 or 1 at depth 0
    if (ref && (sf & 0x3FF) && (x || y)) { npcs.push({n, name: nm, x, y, z: r[9] >> 4, sf, wt: r[22], st: r.readUInt16LE(16), ...(inventory ? {inv: tree(inventory)} : {})}); used.add(key(sf & 0x3FF, sf >> 10)); }
  }
}
// schedule.dat (INITGAME.DAT): NPC count (the Avatar not counted), word offsets, then 4-byte entries:
// period (3 hours) | activity << 3, x, y in the superchunk, superchunk (Exult readnpcs.cc, Schedule_change::set4).
{
  const b = files['schedule.dat'] || file('SCHEDULE.DAT'), cnt = b.readUInt32LE(0), off = i => b.readUInt16LE(4 + i * 2), base = 4 + cnt * 2;
  for (const npc of npcs) {
    const i = npc.n;
    if (i < 1 || i > cnt) continue;
    const list = [];
    for (let e = off(i - 1); e < off(i) && i < cnt; e++) {
      const r = b.subarray(base + e * 4, base + e * 4 + 4), sc = r[3];
      list.push([r[0] & 7, r[0] >> 3, (sc % 12) * 256 + r[1], Math.floor(sc / 12) * 256 + r[2]]);
    }
    if (list.length) npc.sched = list;
  }
}

// ---------- animation ----------
// TFA.DAT: bit 2 of a shape's first byte marks it animated; after the 3072 bytes, 512 more give each shape an animation
// kind, two a byte, odd shapes in the high nibble (decomp BG U7/common/type.c: LoadTfa, GetTypeAnimation). The map
// cycles through all of an animated shape's frames, so all of them go in the atlas.
const animated = s => (tfa[s * 3] & 4) !== 0;
const animKind = s => tfa.length >= 3584 ? (s & 1 ? tfa[3072 + (s >> 1)] >> 4 : tfa[3072 + (s >> 1)] & 15) : 0;
const anim = {};   // shape: [kind, frames], for the animated shapes on the map
for (const k of [...used]) {
  const s = k >> 6;
  if (!animated(s) || anim[s]) continue;
  const n = frameCount(s);
  if (n < 2) continue;
  anim[s] = [animKind(s), Math.min(n, 32)];
  for (let f = 0; f < Math.min(n, 32); f++) used.add(key(s, f));
}

// ---------- atlas: the used frames, shelf-packed into 2048 x 2048 pages ----------
const frames = [];
for (const k of used) { const fr = frame(k >> 6, k & 63); if (fr) frames.push({k, ...fr}); }
frames.sort((a, b) => b.h - a.h || b.w - a.w);
const PAGE = 2048, pages = [];
let page = null, sx = 0, sy = 0, shelf = 0;
const newPage = () => { page = Buffer.alloc(PAGE * PAGE * 4); pages.push(page); sx = sy = shelf = 0; };
newPage();
for (const fr of frames) {
  if (sx + fr.w > PAGE) { sx = 0; sy += shelf; shelf = 0; }
  if (sy + fr.h > PAGE) newPage();
  fr.page = pages.length - 1; fr.ax = sx; fr.ay = sy;
  const clear = tfa[(fr.k >> 6) * 3 + 2] & 128;   // translucent
  for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) {
    const c = fr.px[y * fr.w + x];
    if (c < 0 || c === 255) continue;
    const o = ((sy + y) * PAGE + sx + x) * 4;
    if (clear && c >= 0xEE) [page[o], page[o + 1], page[o + 2], page[o + 3]] = XF[c - 0xEE];
    else { [page[o], page[o + 1], page[o + 2]] = PAL[c]; page[o + 3] = 255; }
  }
  sx += fr.w; shelf = Math.max(shelf, fr.h);
}
// the last page only as tall as it is used
const lastH = Math.min(PAGE, sy + shelf);
for (const f of ['atlas-0.png', 'atlas-1.png', 'atlas-2.png', 'atlas-3.png', 'atlas-4.png', 'atlas-5.png', 'atlas-6.png', 'atlas-7.png']) if (existsSync(join(out, f))) rmSync(join(out, f));
pages.forEach((pg, i) => { const h = i === pages.length - 1 ? lastH : PAGE; writeFileSync(join(out, `atlas-${i}.png`), png(PAGE, h, pg.subarray(0, PAGE * h * 4), 4)); });

// frames.bin: the frames used, 20 bytes each: shape * 64 + frame (uint32), then page, (unused), x, y, w, h, xleft,
// yabove (int16), average colour (RGBA, 4 bits each)
const fb = Buffer.alloc(frames.length * 20);
for (const [j, fr] of frames.entries()) {
  fb.writeUInt32LE(fr.k, j * 20);
  const o = j * 20 + 4;
  let r = 0, g = 0, bl = 0, n = 0;
  for (const c of fr.px) if (c >= 0 && c !== 255) { r += PAL[c][0]; g += PAL[c][1]; bl += PAL[c][2]; n++; }
  fb[o] = fr.page; fb.writeUInt16LE(fr.ax, o + 2); fb.writeUInt16LE(fr.ay, o + 4); fb.writeUInt16LE(fr.w, o + 6); fb.writeUInt16LE(fr.h, o + 8);
  fb.writeInt16LE(fr.xleft, o + 10); fb.writeInt16LE(fr.yabove, o + 12);
  fb[o + 14] = n ? Math.round(r / n) >> 4 << 4 | Math.round(g / n) >> 4 : 0; fb[o + 15] = n ? Math.round(bl / n) >> 4 << 4 | Math.min(15, Math.round(n * 15 / fr.px.length)) : 0;
}
writeFileSync(join(out, 'frames.bin'), fb);
writeFileSync(join(out, 'map.bin'), u7map);
writeFileSync(join(out, 'chunks.bin'), chunks);
// objects.bin: 10 bytes each: x, y (uint16), lift, flags (1 fixed, 2 not drawn), shape | frame << 10, quality (a lock's
// and its key's number; a stack's count), 0. Grouped by chunk, each chunk's in the order the game loads them: the movable
// objects as the region file lists them, then the fixed ones as U7IFIX does (decomp: common/loadreg.c LoadRegion, then
// main/vitem.c LoadChunkItems). The game's drawing order starts from that order.
objs.forEach((o, i) => { o.n = i; });
const chunkOf = o => (o.y >> 4) * 192 + (o.x >> 4);
objs.sort((a, b) => chunkOf(a) - chunkOf(b) || a.fixed - b.fixed || a.n - b.n);
const R = 10, ob = Buffer.alloc(objs.length * R);
objs.forEach((o, i) => { const k = i * R; ob.writeUInt16LE(o.x, k); ob.writeUInt16LE(o.y, k + 2); ob[k + 4] = o.z; ob[k + 5] = o.fixed | (cls(o.s) === 7 ? 2 : 0); ob.writeUInt16LE(o.s | o.f << 10, k + 6); ob[k + 8] = o.q; });
writeFileSync(join(out, 'objects.bin'), ob);
// contents.json: what each container on the map holds, keyed by its index in objects.bin
const contents = {}; objs.forEach((o, i) => { if (o.kids) contents[i] = o.kids; });
writeFileSync(join(out, 'contents.json'), JSON.stringify(contents));
// names: TEXT.FLX entry n is the name of shape n
const text = file('TEXT.FLX'), names = flex(text).slice(0, 1024).map(([o, len]) => text.subarray(o, o + len).toString('latin1').replace(/\0.*$/s, ''));
// frame names: some shapes name each frame (food, reagents, amulets, desk items, Serpent Isle's keys); the names are
// TEXT.FLX's misc names (from entry 0x500), which frame has which from the Exult team's tables (tools/u7-framenames.json)
const textAt = i => { const [o, len] = flex(text)[i] || [0, 0]; return text.subarray(o, o + len).toString('latin1').replace(/\0.*$/s, ''); };
const frameNames = {};
for (const [s, f, m] of JSON.parse(readFileSync(new URL('./u7-framenames.json', import.meta.url)))[id] || []) frameNames[s * 64 + f] = textAt(0x500 + m);
writeFileSync(join(out, `${id}.json`), JSON.stringify({names, frameNames, tfa: [...tfa.subarray(0, 3072)], anim, pages: pages.length, lastH, npcs}));
const kb = n => `${Math.round(n / 1024)} KB`;
console.log(`${id}: ${usedChunks.size} chunks used, ${objs.length} objects (${iregCount} movable), ${frames.length} frames in ${pages.length} atlas pages`);
console.log(`sizes: chunks ${kb(chunks.length)}, map ${kb(u7map.length)}, objects ${kb(ob.length)}, frames table ${kb(fb.length)}`);
