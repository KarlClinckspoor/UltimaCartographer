// Ultima V (PC/GOG): reads the game files and writes what the site needs to data/u5/.
// Usage: node tools/extract-u5.mjs <game folder>
// Formats: u5-decompiled/OpenU5-Enhanced/docs/formats (maps, TLK/NPC, LZW); the tables kept in
// DATA.OVL (the game's data segment, file offset = DS offset + 0x10) as named in u5d/src/ultima.c.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {png} from './png.mjs';

const game = process.argv[2];
if (!game) { console.error('usage: node tools/extract-u5.mjs <game folder>'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u5');
mkdirSync(out, {recursive: true});
const file = n => readFileSync(join(game, n));
const ovl = file('DATA.OVL');
const cstr = (b, o) => { const e = b.indexOf(0, o); return b.subarray(o, e < 0 ? b.length : e).toString('latin1'); };
const ptr = o => ovl.readUInt16LE(o) ? cstr(ovl, ovl.readUInt16LE(o) + 0x10) : '';   // a pointer into the data segment
const ptrs = (o, n) => Array.from({length: n}, (_, i) => ptr(o + i * 2));
const bytes = (o, n) => [...ovl.subarray(o, o + n)];
const strings = (o, len) => ovl.subarray(o, o + len).toString('latin1').split('\0').slice(0, -1);

// ---------- LZW (variable 9-12 bit codes, LSB first; 0x100 reset, 0x101 end) ----------
function lzw(f) {
  const want = f.readUInt32LE(0), src = f.subarray(4), outb = Buffer.alloc(want);
  const prefix = new Int32Array(4096), root = new Uint8Array(4096);
  let bits = 0, width = 9, next = 0x102, size = 0x200, pos = 0, prev = -1;
  const read = () => { const i = bits >> 3, w = (src[i] | src[i + 1] << 8 | (src[i + 2] || 0) << 16) >> (bits & 7); bits += width; return w & ((1 << width) - 1); };
  const str = c => { const s = []; while (c > 0xFF) { s.push(root[c]); c = prefix[c]; } s.push(c); return s.reverse(); };
  for (;;) {
    const c = read();
    if (c === 0x101) break;
    if (c === 0x100) { width = 9; next = 0x102; size = 0x200; prev = read(); outb[pos++] = prev; continue; }
    const s = c < next ? str(c) : [...str(prev), str(prev)[0]];
    for (const b of s) outb[pos++] = b;
    prefix[next] = prev; root[next] = s[0]; next++;
    if (next >= size && width < 12) { width++; size *= 2; }
    prev = c;
  }
  if (pos !== want) throw new Error(`LZW: ${pos} bytes, expected ${want}`);
  return outb;
}

// ---------- tiles: TILES.16, 512 tiles of 16 x 16, 4 bits a pixel (left pixel in the high nibble) ----------
const EGA = ['000000', '0000aa', '00aa00', '00aaaa', 'aa0000', 'aa00aa', 'aa5500', 'aaaaaa', '555555', '5555ff', '55ff55', '55ffff', 'ff5555', 'ff55ff', 'ffff55', 'ffffff']
  .map(h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)));
{
  const sh = lzw(file('TILES.16'));
  if (sh.length !== 512 * 128) throw new Error('TILES.16: unexpected size');
  const w = 16 * 16, h = 32 * 16, px = Buffer.alloc(w * h * 3);
  for (let t = 0; t < 512; t++) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const b = sh[t * 128 + y * 8 + (x >> 1)], c = x & 1 ? b & 15 : b >> 4;
    const o = (((t >> 4) * 16 + y) * w + (t & 15) * 16 + x) * 3;
    [px[o], px[o + 1], px[o + 2]] = EGA[c];
  }
  writeFileSync(join(out, 'tiles.png'), png(w, h, px));
}

// ---------- Britannia (BRIT.DAT holds only the chunks not all water; DATA.OVL 0x3886 says which) and the Underworld ----------
function bigMap(dat, index) {
  const m = Buffer.alloc(65536);
  let src = 0;
  for (let ch = 0; ch < 256; ch++) {
    const col = ch & 15, row = ch >> 4, water = index && index[ch] === 0xFF;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) m[(row * 16 + y) * 256 + col * 16 + x] = water ? 1 : dat[src++];
  }
  return m;
}
const brit = bigMap(file('BRIT.DAT'), bytes(0x3886, 256)), under = bigMap(file('UNDER.DAT'), null);

// ---------- places: 40 (32 settlements, then the 8 dungeons) ----------
const FALLBACK = {14: "Sutek's Hut", 15: "Sin'Vraal's Hut", 16: "Grendel's Hut", 17: "Lord British's Castle", 18: 'Palace of Blackthorn'};
const title = s => s.toLowerCase().replace(/(^|[\s(])(\w)/g, (m, a, c) => a + c.toUpperCase()).replace(/'S\b/g, "'s").replace(/\bOf\b/g, 'of').replace(/\bThe\b(?!^)/g, 'the').replace(/^the/, 'The');
const placeX = bytes(0x1E9A, 40), placeY = bytes(0x1EC2, 40);
const places = ptrs(0x1E4A, 40).map((n, i) => ({n: i + 1, name: n ? title(n) : FALLBACK[i + 1], x: placeX[i], y: placeY[i]}));

// Settlement maps: 4 files of 16 floors of 32 x 32, 8 places each. DATA.OVL 0x1E2A has each place's entry
// floor (z 0) in its file; the four places with a cellar keep it just before.
const FILES = ['TOWNE', 'DWELLING', 'CASTLE', 'KEEP'], CELLAR = new Set([4, 17, 18, 32]);
const entry = bytes(0x1E2A, 32), towns = {};
for (let n = 1; n <= 32; n++) {
  const f = FILES[(n - 1) >> 3], dat = file(`${f}.DAT`), k = (n - 1) & 7;
  const first = entry[n - 1] - (CELLAR.has(n) ? 1 : 0);
  const end = k === 7 ? 16 : entry[n] - (CELLAR.has(n + 1) ? 1 : 0);
  const floors = {};
  for (let i = first; i < end; i++) floors[i - entry[n - 1]] = dat.subarray(i * 1024, (i + 1) * 1024).toString('hex');
  towns[n] = {file: f, floors};
}

// ---------- people: per place 32 schedules (3 AI types, 3 x, 3 y, 3 z, 4 hours), then 32 types and 32 dialog numbers ----------
for (const f of FILES) {
  const b = file(`${f}.NPC`), base0 = FILES.indexOf(f) * 8;
  for (let k = 0; k < 8; k++) {
    const o = k * 0x240, people = [];
    for (let i = 1; i < 32; i++) {
      const s = b.subarray(o + i * 16, o + i * 16 + 16), type = b[o + 0x200 + i], talk = b[o + 0x220 + i];
      if (!type && !talk) continue;
      people.push({i, type, talk, ai: [...s.subarray(0, 3)], x: [...s.subarray(3, 6)], y: [...s.subarray(6, 9)], z: [...s.subarray(9, 12)].map(z => z > 127 ? z - 256 : z), hours: [...s.subarray(12, 16)]});
    }
    towns[base0 + k + 1].people = people;
  }
}

// ---------- conversations (.TLK): an index of (dialog number, offset), then each script's lines ----------
const words = strings(0x104C, 0x24E);
const WORD = new Map();
{ let off = 0; for (const [a, b, d] of [[1, 7, 1], [9, 27, 1], [29, 49, 1], [51, 64, 1], [66, 66, 1], [68, 69, 1], [71, 71, 1], [76, 129, 4]]) { off -= d; for (let k = a; k <= b; k++) WORD.set(k, k + off); } }
const OPS = {0x81: 'avatar', 0x82: 'end', 0x83: 'pause', 0x84: 'join', 0x85: 'gold', 0x86: 'give', 0x87: 'or', 0x88: 'askname', 0x89: 'karma+', 0x8A: 'karma-',
  0x8B: 'guards', 0x8C: 'ifknown', 0x8D: 'nl', 0x8E: 'rune', 0x8F: 'key', 0x90: 'labeldef', 0x9F: 'endscript', 0xA2: 'section', 0xFD: 'goto', 0xFE: 'define', 0xFF: 'nothing'};
// One script line: text, with the commands written as {name} or {name n}.
function scriptLines(b) {
  const lines = [];
  let cur = '', chars = false, gold = 0, goldBuf = '';
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0) { if (cur.endsWith('to give unto charity!')) continue; lines.push(cur); cur = ''; chars = false; continue; }
    if ((c >= 0xA0 && c <= 0xA1) || (c >= 0xA5 && c <= 0xDA) || (c >= 0xE1 && c <= 0xFA)) {
      const ch = String.fromCharCode(c - 0x80);
      chars = true;
      if (ch === '@') continue;
      if (gold) { goldBuf += ch; if (--gold === 0) { cur += `{gold ${parseInt(goldBuf, 10)}}`; goldBuf = ''; } continue; }
      cur += ch; continue;
    }
    if (chars) { cur += ' '; chars = false; }
    if (WORD.has(c) && c <= 128) { cur += (words[WORD.get(c)] || '') + ' '; continue; }
    if (c >= 0x91 && c <= 0x9B) { cur += `{label ${c - 0x91}}`; continue; }
    const op = OPS[c];
    if (op === 'gold') { gold = 3; continue; }
    if (op === 'give') { cur += `{give ${b[++i]}}`; continue; }
    cur += `{${op || 'op ' + c}}`;
  }
  if (cur) lines.push(cur);
  return lines.map(s => s.replace(/ +/g, ' ').replace(/ ([,.!?;:])/g, '$1'));
}
const isKey = s => { const t = s.replace(/\{[^}]*\}/g, '').trim(); return t.length >= 1 && t.length <= 6 && !t.includes(' '); };
const keyOf = s => s.replace(/\{[^}]*\}/g, '').trim().toLowerCase();
const hasOr = s => s.includes('{or}');
const isLabelDef = s => s.startsWith('{labeldef}');
// Name, description, greeting, job, bye; keyword answers; then labelled follow-ups (a question and its answers).
function structure(lines) {
  const sc = {name: lines[0] || '', look: lines[1] || '', greeting: lines[2] || '', job: lines[3] || '', bye: lines[4] || '', qa: [], labels: []};
  let i = 5;
  while (i < lines.length && !isLabelDef(lines[i])) {
    const keys = [keyOf(lines[i])];
    while (i + 1 < lines.length && hasOr(lines[i + 1])) { i += 2; keys.push(keyOf(lines[i] || '')); }
    sc.qa.push({k: keys.filter(Boolean), a: lines[i + 1] || ''});
    i += 2;
  }
  while (i < lines.length) {
    const m = lines[i];
    if (!isLabelDef(m)) { i++; continue; }
    if (m.startsWith('{labeldef}{endscript}')) break;
    const lab = {n: +(/\{label (\d+)\}/.exec(m) || [0, 0])[1], ask: m.replace(/^\{labeldef\}\{label \d+\}/, ''), text: [], qa: []};
    i++;
    if (i < lines.length && !isLabelDef(lines[i])) lab.text.push(lines[i++]);
    while (i < lines.length && !isLabelDef(lines[i])) {
      if (isKey(lines[i]) && i + 1 < lines.length && !isLabelDef(lines[i + 1])) {
        const keys = [keyOf(lines[i])];
        while (i + 1 < lines.length && hasOr(lines[i + 1])) { i += 2; keys.push(keyOf(lines[i] || '')); }
        lab.qa.push({k: keys.filter(Boolean), a: lines[i + 1] || ''});
        i += 2;
      } else lab.text.push(lines[i++]);
    }
    sc.labels.push(lab);
  }
  return sc;
}
const talk = {};
for (const f of FILES) {
  const b = file(`${f}.TLK`), n = b.readUInt16LE(0), idx = [];
  for (let i = 0; i < n; i++) idx.push([b.readUInt16LE(2 + i * 4), b.readUInt16LE(4 + i * 4)]);
  talk[f] = {};
  idx.forEach(([npc, off], i) => { const end = i + 1 < n ? idx[i + 1][1] : b.length; talk[f][npc] = structure(scriptLines(b.subarray(off, end))); });
}

// ---------- signs: SIGNS.DAT records (place, floor, x, y, text), plus the Sign of Eight Laws kept in DATA.OVL ----------
const DIGRAPH = {'@': ' ', '[': 'TH', '^': 'EA', _: 'ST', ']': 'NG', '\\': 'EE'};
const scrub = raw => { let s = '', prev = ''; for (const ch of raw) { const c = ch.charCodeAt(0); if ((ch >= 'A' && ch <= 'Z') || ch === ' ') s += ch; else if (ch in DIGRAPH) s += DIGRAPH[ch]; else if (ch === 'g' && prev === 'g') s += '\n'; else if (c > 127) s += String.fromCharCode(c - 128); prev = ch; } return s.replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).filter(Boolean).join('\n'); };
const signs = [];
{
  const b = file('SIGNS.DAT');
  for (let o = 0x42; o + 4 <= b.length;) {
    const [loc, floor, x, y] = b.subarray(o, o + 4);
    if (!loc && !floor && !x && !y) break;
    let text = cstr(b, o + 4);
    const len = text.length;
    if (!text.trim()) text = cstr(b, o + 4 + len + 1 + 4);
    signs.push({loc, floor: floor > 127 ? floor - 256 : floor, x, y, text: scrub(text)});
    o += 4 + len + 1;
  }
  // Its text has a 0 byte after the first line: read on to the second.
  const laws = ovl.indexOf(0, ovl.indexOf(0, 0x743A) + 1);
  signs.push({loc: 32, floor: 0, x: 15, y: 19, text: scrub(ovl.subarray(0x743A, laws).toString('latin1'))});
}

// ---------- dungeons: 8 x 8 levels of 8 x 8; rooms (DUNGEON.CBT): 16 for each dungeon but Despise, 11 rows of 32 bytes ----------
const dungeonDat = file('DUNGEON.DAT'), dungeons = [];
for (let k = 0; k < 8; k++) dungeons.push(dungeonDat.subarray(k * 512, (k + 1) * 512).toString('hex'));
const cbt = file('DUNGEON.CBT'), rooms = [];
for (let m = 0; m < cbt.length / 0x160; m++) {
  const r = cbt.subarray(m * 0x160, (m + 1) * 0x160), row = y => r.subarray(y * 32, y * 32 + 32);
  const map = Buffer.alloc(121);
  for (let y = 0; y < 11; y++) row(y).copy(map, y * 11, 0, 11);
  const foes = [];
  for (let i = 0; i < 16; i++) { const t = row(5)[11 + i], x = row(6)[11 + i], y = row(7)[11 + i]; if (t && (x || y)) foes.push({tile: t + 0x100, x, y}); }
  const triggers = [];
  for (let i = 0; i < 8; i++) {
    const t = row(0)[11 + i], at = [row(8)[11 + i], row(8)[19 + i]];
    if (t && (at[0] || at[1])) triggers.push({tile: t, at, a: [row(9)[11 + i], row(9)[19 + i]], b: [row(10)[11 + i], row(10)[19 + i]]});
  }
  const starts = {};
  ['east', 'west', 'south', 'north'].forEach((d, k) => { const rr = row(1 + k); if (rr[11]) starts[d] = Array.from({length: 6}, (_, p) => [rr[11 + p], rr[17 + p]]); });
  rooms.push({map: map.toString('hex'), foes, triggers, starts});
}

// ---------- tables ----------
const look = (() => { const b = file('LOOK2.DAT'); let min = b.length; for (let i = 0; i * 2 < min; i++) min = Math.min(min, b.readUInt16LE(i * 2)); return Array.from({length: min >> 1}, (_, i) => cstr(b, b.readUInt16LE(i * 2))); })();
const shops = {names: Array.from({length: 8}, (_, k) => ptrs(0x21DA + k * 32, 16)), keepers: Array.from({length: 8}, (_, k) => ptrs(0x22DA + k * 32, 16)), maps: Array.from({length: 8}, (_, k) => bytes(0x23DA + k * 16, 16))};
const hidden = (() => { const c = 0x72, a = o => bytes(o, c); const [tile, value, map, level, x, y] = [0x3E88, 0x3EFA, 0x3F6C, 0x3FDE, 0x4050, 0x40C2].map(a); return tile.map((t, i) => ({tile: t, value: value[i], loc: map[i], floor: level[i] > 127 ? level[i] - 256 : level[i], x: x[i], y: y[i]})).filter(h => h.tile); })();
const init = file('INIT.GAM');
const moonstones = Array.from({length: 8}, (_, i) => ({x: init[0x28A + i], y: init[0x292 + i], buried: init[0x29A + i] === 0, under: init[0x2A2 + i] === 0xFF}));
const virtues = strings(0xB98, 0x48), mantras = strings(0xBE0, 0x1E);
const shrines = bytes(0x1F7E, 8).map((x, i) => ({x, y: ovl[0x1F86 + i], virtue: virtues[i], mantra: mantras[i]}));
const equip = ptrs(0x1806, 48);
const wordsOfPower = strings(0x44AD, 0x3A);

writeFileSync(join(out, 'u5.json'), JSON.stringify({brit: brit.toString('base64'), under: under.toString('base64'), places, towns, talk, signs, dungeons, rooms, look, shops, hidden, moonstones, shrines, equip, wordsOfPower}));
console.log(`places ${places.length}, settlements ${Object.keys(towns).length}, scripts ${Object.values(talk).reduce((n, t) => n + Object.keys(t).length, 0)}, signs ${signs.length}, rooms ${rooms.length}, look ${look.length}, hidden ${hidden.length} -> ${out}`);
