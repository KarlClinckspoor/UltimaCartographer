// Checks data/u6, data/se and data/md (from tools/extract-u6.mjs) against the decompilations' sources.
// Usage: node tests/u6-data.test.mjs
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.log('FAIL', name); } };
const load = g => ({...JSON.parse(readFileSync(join(root, g, `${g}.json`))), bin: n => readFileSync(join(root, g, n))});
// object blocks: count, then 8-byte records (object.c, u6.h struct coord)
function objects(b, blocks) {
  const out = [];
  for (let o = 0, k = 0; k < blocks && o < b.length; k++) {
    const n = b.readUInt16LE(o); o += 2;
    for (let i = 0; i < n; i++, o += 8) out.push({status: b[o], x: b.readUInt16LE(o + 1) & 0x3FF, y: (b.readUInt16LE(o + 2) >> 2) & 0x3FF, z: b[o + 3] >> 4, type: b.readUInt16LE(o + 4) & 0x3FF, frame: b.readUInt16LE(o + 4) >> 10, qual: b[o + 7]});
  }
  return out;
}

for (const g of ['u6', 'se', 'md']) {
  const d = load(g);
  check(`${g}: map is 64 superchunks + 5 levels`, d.bin('map.bin').length === 64 * 0x180 + 5 * 0x600);
  check(`${g}: 1024 chunks`, d.bin('chunks.bin').length === 1024 * 64);
  check(`${g}: tile names`, d.look[0] === 'Nothing' && d.look.length === 2048);
  check(`${g}: objlist holds the NPC tables and game state`, d.bin('objlist.bin').length > 0x100 * 3 + 0x400);
  const all = objects(d.bin('objblk.bin'), 64).concat(objects(d.bin('dngblk.bin'), 5));
  check(`${g}: objects on the map stay in it`, all.filter(r => !(r.status & 0x18)).every(r => r.z <= 5 && (r.z === 0 || (r.x < 256 && r.y < 256))));
  // (Martian Dreams also parks some people on a level 6 that has no map; they are not drawn)
  check(`${g}: schedules point at real squares`, d.schedule.flat().filter(e => e[4] <= 5).every(e => e[4] === 0 || (e[2] < 256 && e[3] < 256)));
}

// Ultima VI
{
  const d = load('u6');
  check('U6: Lord British is NPC 5', d.talk[5].name === 'Lord British');
  check('U6: Lord British sits on his throne at 8:00 (307, 348)', JSON.stringify(d.schedule[5][0]) === JSON.stringify([8, 0x92, 307, 348, 0]));
  // gamestat.c MoonstonePos: the moongates of a new game
  const ol = d.bin('objlist.bin'), ms = Array.from({length: 8}, (_, i) => [0, 2, 4].map(k => ol.readUInt16LE(7153 + 0x2A + i * 6 + k)));
  check('U6: moonstones', JSON.stringify(ms) === JSON.stringify([[0x3A7, 0x106, 0], [0x1F7, 0x166, 0], [0x09F, 0x3AE, 0], [0x127, 0x026, 0], [0x33F, 0x0A6, 0], [0x147, 0x336, 0], [0x017, 0x016, 1], [0x397, 0x3A6, 0]]));
  check('U6: the game starts at 8:00 on 4/7/161 with karma 75', ol[7153 + 3] === 8 && ol[7153 + 4] === 4 && ol[7153 + 5] === 7 && ol.readUInt16LE(7153 + 6) === 161 && ol[7153 + 8] === 75);
  check("U6: book 55 is Iolo's Place", d.books[54] === "Iolo's Place");
  check('U6: every conversation has a name', Object.values(d.talk).every(t => t.name));
  // map.c PartyChangeLevel: down from the surface divides the chunk coordinates by 4; the ladder up on level 1
  // multiplies them back and adds 8 or 16 by the bits of its quality. Each way down must lead to a way up back home.
  const all = objects(d.bin('objblk.bin'), 64).concat(objects(d.bin('dngblk.bin'), 5)).filter(r => !(r.status & 0x18));
  const downs = all.filter(r => r.z === 0 && (r.type === 0x134 || r.type === 0x146 || (r.type === 0x131 && r.frame === 0)));
  let ok = 0;
  for (const r of downs) {
    const x = ((r.x >> 2) & 0xF8) + (r.x & 7), y = ((r.y >> 2) & 0xF8) + (r.y & 7);
    const up = all.find(u => u.z === 1 && u.x === x && u.y === y && u.type === 0x131 && u.frame === 1);
    if (up && ((up.x << 2) & 0x3E0) + (up.x & 7) + (up.qual & 1 ? 8 : 0) + (up.qual & 2 ? 16 : 0) === r.x && ((up.y << 2) & 0x3E0) + (up.y & 7) + (up.qual & 4 ? 8 : 0) + (up.qual & 8 ? 16 : 0) === r.y) ok++;
  }
  console.log(`U6: ${ok} of ${downs.length} ways down lead to a ladder back to the same square`);
  check(`U6: ways down with a matching ladder back (${ok} of ${downs.length})`, downs.length >= 20 && ok >= downs.length * 0.9);
  // npctrack.c DungeonNames: the seven dungeons each have an entrance of their quality on the surface
  for (let q = 1; q <= 7; q++) check(`U6: entrance of dungeon ${q}`, all.some(r => r.z === 0 && (r.type === 0x134 || r.type === 0x146) && r.qual === q));
}

// The Savage Empire and Martian Dreams
{
  const se = load('se'), md = load('md');
  check('SE: Dokray', Object.values(se.talk).some(t => t.name === 'Dokray'));
  check('MD: Spector', Object.values(md.talk).some(t => t.name === 'Spector'));
  check('MD: Nellie Bly', Object.values(md.talk).some(t => t.name === 'Nellie Bly'));
  check('MD: 31 texts in MDTEXT.LZC', md.books.length === 31 && md.books[0].startsWith('BULLFIGHTING'));
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
