// Ultima I (PC/GOG): reads the game files and writes what the site needs to data/u1/.
// Usage: node tools/extract-u1.mjs <game folder with OUT.EXE, MAP.BIN, TCD.BIN, T1KTILES.BIN, T1KTOWN.BIN>
// Formats and addresses: u1-decompiled/docs/game/world-and-map.md.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';

const game = process.argv[2];
if (!game) { console.error('usage: node tools/extract-u1.mjs <game folder>'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u1');
mkdirSync(out, {recursive: true});
const file = n => readFileSync(join(game, n));

// ---------- OUT.EXE's DGROUP ----------
const exe = file('OUT.EXE');
const img = exe.subarray(exe.readUInt16LE(8) * 16);   // header paragraphs
const ds = img.readUInt16LE(1) * 16;                   // the first instruction is MOV AX, DGROUP
const dg = (off, n) => img.subarray(ds + off, ds + off + n);
const str = off => { const s = ds + off; return img.subarray(s, img.indexOf(0, s)).toString('latin1'); };

// Places 1..84: x at 18C8, y at 191C, names at 307C (word pointers, entry 0 is "?").
const px = dg(0x18C8, 84), py = dg(0x191C, 84), names = dg(0x307C, 85 * 2);
const places = [];
for (let i = 0; i < 84; i++) places.push({n: i + 1, name: str(names.readUInt16LE((i + 1) * 2)), x: px[i], y: py[i]});

// Town and castle people: 10 maps x 15 records of {type, x, y, hp} words at 31DC; type -1 is unused.
const ent = dg(0x31DC, 10 * 15 * 8), people = [];
for (let m = 0; m < 10; m++) {
  const list = [];
  for (let k = 0; k < 15; k++) {
    const o = (m * 15 + k) * 8, type = ent.readInt16LE(o);
    if (type >= 0) list.push([type, ent.readInt16LE(o + 2), ent.readInt16LE(o + 4), ent.readInt16LE(o + 6)]);
  }
  people.push(list);
}

// Dungeon monster names, pointer table at 3930.
const mnames = dg(0x3930, 25 * 2), dungeonMonsters = [];
for (let i = 0; i < 25; i++) dungeonMonsters.push(str(mnames.readUInt16LE(i * 2)));

// ---------- maps ----------
// MAP.BIN: 168 x 156, 4 bits per cell, even x in the high nibble. Kept as one hex digit per cell, row by row.
const mapBin = file('MAP.BIN');
if (mapBin.length !== 13104) throw new Error('MAP.BIN should be 13104 bytes');
const world = mapBin.toString('hex');
// TCD.BIN: 10 maps of 38 x 18, one byte per cell, column-major (x * 18 + y). Maps 0-1 castles, 2-9 towns.
const tcd = file('TCD.BIN');
if (tcd.length !== 6840) throw new Error('TCD.BIN should be 6840 bytes');
const towns = [];
for (let m = 0; m < 10; m++) towns.push(tcd.subarray(m * 684, (m + 1) * 684).toString('hex'));

writeFileSync(join(out, 'u1.json'), JSON.stringify({places, people, dungeonMonsters, world, towns}));

// ---------- tiles (the Tandy files: 4 bits per pixel, left pixel in the high nibble) ----------
const RGBI = ['000000', '0000aa', '00aa00', '00aaaa', 'aa0000', 'aa00aa', 'aa5500', 'aaaaaa',
  '555555', '5555ff', '55ff55', '55ffff', 'ff5555', 'ff55ff', 'ffff55', 'ffffff'].map(h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)));

function sheet(buf, size, perRow) {
  const per = size * size / 2, count = buf.length / per;
  const rows = Math.ceil(count / perRow), w = perRow * size, h = rows * size;
  const px = Buffer.alloc(w * h * 3);
  for (let t = 0; t < count; t++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const b = buf[t * per + y * size / 2 + (x >> 1)], c = x & 1 ? b & 15 : b >> 4;
    const X = (t % perRow) * size + x, Y = Math.floor(t / perRow) * size + y, o = (Y * w + X) * 3;
    [px[o], px[o + 1], px[o + 2]] = RGBI[c];
  }
  return {png: png(w, h, px), count};
}

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

const tiles = sheet(file('T1KTILES.BIN'), 16, 16);
const town = sheet(file('T1KTOWN.BIN'), 8, 16);
writeFileSync(join(out, 'tiles.png'), tiles.png);
writeFileSync(join(out, 'town.png'), town.png);
console.log(`places ${places.length}, people ${people.flat().length}, tiles ${tiles.count}, town tiles ${town.count} -> ${out}`);
