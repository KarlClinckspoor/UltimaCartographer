// Ultima III (PC/GOG): reads the game files and writes what the site needs to data/u3/.
// Usage: node tools/extract-u3.mjs <game folder>
// Formats: u3-decompiled/docs/FORMATS.md sections 2-4.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {png} from './png.mjs';

const game = process.argv[2];
if (!game) { console.error('usage: node tools/extract-u3.mjs <game folder>'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u3');
mkdirSync(out, {recursive: true});
const file = n => readFileSync(join(game, n));

// SHAPES.ULT: 80 tiles of 16 x 16, CGA 2 bits a pixel, 4 bytes a row, the 8 even rows then the 8 odd.
const CGA1 = [[0, 0, 0], [0, 170, 170], [170, 0, 170], [170, 170, 170]];   // palette 1, low intensity, as ULTIMA.COM sets
{
  const sh = file('SHAPES.ULT'), w = 16 * 16, h = 5 * 16, px = Buffer.alloc(w * h * 3);
  for (let t = 0; t < 80; t++) for (let r = 0; r < 16; r++) {
    const row = r % 2 === 0 ? r / 2 : 8 + (r - 1) / 2;
    for (let x = 0; x < 16; x++) {
      const c = (sh[t * 64 + row * 4 + (x >> 2)] >> (6 - 2 * (x & 3))) & 3;
      const o = ((Math.floor(t / 16) * 16 + r) * w + (t % 16) * 16 + x) * 3;
      [px[o], px[o + 1], px[o + 2]] = CGA1[c];
    }
  }
  writeFileSync(join(out, 'tiles.png'), png(w, h, px));
}

// Maps (4648 bytes): the 64 x 64 map, speeches at 1000h (word offsets from 1000h, count = first / 2),
// creatures: tile 1180h, under 11A0h, x 11C0h, y 11E0h, talk 1200h (32 each).
const MAPS = ['SOSARIA', 'AMBROSIA', 'BRITISH', 'LCB', 'MOON', 'YEW', 'MONTOR_E', 'MONTOR_W', 'GREY', 'DAWN', 'DEVIL', 'FAWN', 'DEATH', 'EXODUS'];
const maps = {};
for (const name of MAPS) {
  const b = file(`${name}.ULT`);
  if (b.length !== 4648) throw new Error(`${name}.ULT: ${b.length} bytes, expected 4648`);
  const n = b.readUInt16LE(0x1000) / 2, speeches = [];
  for (let i = 0; i < n && n <= 16; i++) {
    const o = 0x1000 + b.readUInt16LE(0x1000 + i * 2);
    speeches.push(b.subarray(o, b.indexOf(0, o)).toString('latin1').replace(/^\n+|\n+$/g, ''));
  }
  const people = [];
  for (let i = 0; i < 32; i++) if (b[0x1180 + i]) people.push({tile: b[0x1180 + i], under: b[0x11A0 + i], x: b[0x11C0 + i], y: b[0x11E0 + i], talk: b[0x1200 + i]});
  maps[name] = {cells: b.subarray(0, 4096).toString('hex'), speeches, people};
}

// Dungeons (2192 bytes): 8 levels of 16 x 16, then 8 word offsets from 800h to each level's message.
const DUNGEONS = ['DARDIN', 'FIRE', 'MINE', 'PERINIAN', 'TIME', 'M', 'P'];
const dungeons = {};
for (const name of DUNGEONS) {
  const b = file(`${name}.ULT`);
  const messages = [];
  for (let l = 0; l < 8; l++) { const o = 0x800 + b.readUInt16LE(0x800 + l * 2); messages.push(b.subarray(o, b.indexOf(0, o)).toString('latin1').trim()); }
  dungeons[name] = {cells: b.subarray(0, 0x800).toString('hex'), messages};
}

writeFileSync(join(out, 'u3.json'), JSON.stringify({maps, dungeons}));
console.log(`maps ${Object.keys(maps).length}, dungeons ${Object.keys(dungeons).length}, tiles 80 -> ${out}`);
