// Ultima II (PC/GOG): reads the game files and writes what the site needs to data/u2/.
// Usage: node tools/extract-u2.mjs <GOG game folder> <u2-decompiled folder>
// The GOG folder must be the installed game (it has every planet's map; some ship in lower case).
// The tile bitmaps are read from u2-decompiled/src/U2DATA.ASM and checked against ULTIMAII.EXE.
// Formats: u2-decompiled/docs/MECHANICS.md sections 7.1, 8.1, 9.1.
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';

const [game, decomp] = process.argv.slice(2);
if (!game || !decomp) { console.error('usage: node tools/extract-u2.mjs <game folder> <u2-decompiled folder>'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u2');
mkdirSync(out, {recursive: true});
const names = new Map(readdirSync(game).map(n => [n.toUpperCase(), n]));
const file = n => names.has(n) ? readFileSync(join(game, names.get(n))) : null;

// ---------- tiles ----------
const asm = readFileSync(join(decomp, 'src', 'U2DATA.ASM'), 'latin1').split(/\r?\n/);
const bmp = {};
let cur = null;
for (const l of asm) {
  let m = /^(TileBmp[0-9A-F]{2}) label byte/.exec(l);
  if (m) { cur = m[1]; bmp[cur] = []; continue; }
  m = /^\s*db\s+([^;]*)/i.exec(l);
  if (m && cur) { bmp[cur].push(...m[1].split(',').map(x => parseInt(x.trim().replace(/h$/i, ''), 16))); if (bmp[cur].length >= 0x42) cur = null; }
}
const ti = asm.findIndex(l => l.startsWith('TilePtrTbl label'));
const order = asm.slice(ti + 1).map(l => /^\s*dw (TileBmp\w+)/.exec(l)).filter(Boolean).map(m => m[1]).slice(0, 64);
if (order.length !== 64) throw new Error('TilePtrTbl: expected 64 entries');
const exe = file('ULTIMAII.EXE');
for (const name of new Set(order)) if (exe.indexOf(Buffer.from(bmp[name])) < 0) throw new Error(`${name} is not in ULTIMAII.EXE`);

const CGA1 = [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]];   // the palette the game uses
{
  const w = 16 * 16, h = 4 * 16, px = Buffer.alloc(w * h * 3);
  order.forEach((name, n) => {
    const b = bmp[name], bw = b[0], bh = b[1];
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw * 4; x++) {
      const c = (b[2 + y * bw + (x >> 2)] >> (6 - 2 * (x & 3))) & 3;
      const o = (((n >> 4) * 16 + y) * w + (n & 15) * 16 + x) * 3;
      [px[o], px[o + 1], px[o + 2]] = CGA1[c];
    }
  });
  writeFileSync(join(out, 'tiles.png'), png(w, h, px));
}

// ---------- maps ----------
// MAP<l><zone><type>: 4 KB; surface and towns 64 x 64 (cell y * 64 + x), towers and dungeons 16
// levels of 16 x 16 (level * 256 + y * 16 + x). MON: eight 32-byte arrays X, Y, HP, Tile, Under,
// Mood, StepX, StepY. TLK: 256 bytes of zero-separated strings, high bit set, 8Dh a new line.
const maps = {};
for (const letter of ['X', 'G']) for (let zone = 0; zone <= 9; zone++) for (let type = 0; type <= 5; type++) {
  const id = `${letter}${zone}${type}`, m = file(`MAP${id}`);
  if (!m) continue;
  const entry = {cells: m.subarray(0, 0x1000).toString('hex')};
  const mon = file(`MON${id}`);
  if (mon) {
    const a = k => mon.subarray(k * 32, k * 32 + 32);
    const [X, Y, HP, T, U, M] = [0, 1, 2, 3, 4, 5].map(a);
    entry.people = [];
    for (let i = 0; i < 32; i++) if (T[i]) entry.people.push({x: X[i], y: Y[i], hp: HP[i], tile: T[i], under: U[i], mood: M[i]});
  }
  const tlk = file(`TLK${id}`);
  if (tlk) entry.talk = tlk.toString('latin1').split('\0').slice(1).map(s => [...s].map(c => {
    const v = c.charCodeAt(0) & 0x7F; return v === 0x0D ? '\n' : String.fromCharCode(v);
  }).join('')).filter(s => s.length);
  maps[id] = entry;
}
writeFileSync(join(out, 'u2.json'), JSON.stringify({maps}));
console.log(`maps ${Object.keys(maps).length} (${Object.keys(maps).join(' ')}), tiles 64 -> ${out}`);

function png(w, h, rgb) {
  const crcT = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}
