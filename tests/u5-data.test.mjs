// Checks data/u5 (from tools/extract-u5.mjs) against facts in the decompilations (u5d/src, OpenU5-Enhanced/docs/formats).
// Usage: node tests/u5-data.test.mjs
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const d = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u5', 'u5.json')));
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.log('FAIL', name); } };
const brit = Buffer.from(d.brit, 'base64'), under = Buffer.from(d.under, 'base64');
const at = (m, x, y) => m[y * 256 + x];

// tiles.h: TILE_MAP_HUT 10, KEEP 12, VILLAGE 13, TOWNE 14, CAVE 16, MINE 17, DUNGEON 18, SHRINE 19, LIGHTHOUSE 1B.
// The two castles are drawn with several tiles (CASTLELB 3E, PALACEBT 39): their entrance square is the gate in the middle.
// The art does not always follow the kind: New Magincia is drawn as a village, Buccaneer's Den as a towne, the Lycaeum,
// Empath Abbey and Serpent's Hold as castles (15), and Ararat has no building at all: its square is plain brush (08).
const tile = {Townes: [0x14, 0x13], Lighthouses: [0x1B], Huts: [0x10], Villages: [0x13, 0x14], Keeps: [0x12, 0x15], Dungeons: [0x16, 0x17, 0x18]};
const KIND = n => n <= 8 ? 'Townes' : n <= 12 ? 'Lighthouses' : n <= 16 ? 'Huts' : n <= 18 ? 'Castles' : n <= 24 ? 'Villages' : n <= 32 ? 'Keeps' : 'Dungeons';
for (const pl of d.places) {
  if (KIND(pl.n) === 'Castles' || pl.n === 40) continue;
  if (pl.n === 25) { check('Ararat on brush', at(brit, pl.x, pl.y) === 0x08); continue; }
  check(`${pl.name} on a ${KIND(pl.n)} tile (got ${at(brit, pl.x, pl.y).toString(16)})`, tile[KIND(pl.n)].includes(at(brit, pl.x, pl.y)));
}
// DUNGEON_1d08_Exit: leaving by the bottom lands in the Underworld at the dungeon's own square, so each has an opening there.
for (const pl of d.places.filter(q => q.n > 32)) check(`${pl.name} opens into the Underworld`, [0x16, 0x17, 0x18].includes(at(under, pl.x, pl.y)));
// Shrines: on shrine tiles, but Spirituality's (0, 0) is reached only through a moongate.
for (const s of d.shrines) if (s.x || s.y) check(`Shrine of ${s.virtue} on a shrine tile`, at(brit, s.x, s.y) === 0x19);
check('mantras', d.shrines.map(s => s.mantra).join(' ') === 'Ahm Mu Ra Beh Cah Summ Om Lum');
// The moonstones start buried at the moongates of Ultima IV.
check('moonstones', JSON.stringify(d.moonstones.map(m => [m.x, m.y])) === JSON.stringify([[224, 133], [96, 102], [38, 224], [50, 37], [166, 19], [104, 194], [23, 126], [187, 167]]) && d.moonstones.every(m => m.buried && !m.under));
check('words of power', d.wordsOfPower.join(' ') === 'FALLAX VILIS INOPIA MALUM AVIDUS INFAMA IGNAVUS VERAMOCOR');
// maps.md: each settlement file has 16 floors; Lord British's castle and Blackthorn's palace have five (cellar to third), Yew a cellar.
const files = {};
for (const t of Object.values(d.towns)) files[t.file] = (files[t.file] || 0) + Object.keys(t.floors).length;
for (const [f, n] of Object.entries(files)) check(`${f} floors`, n === 16);
check('castle floors', Object.keys(d.towns[17].floors).sort().join() === '-1,0,1,2,3' && Object.keys(d.towns[18].floors).sort().join() === '-1,0,1,2,3');
check('Yew cellar', Object.keys(d.towns[4].floors).sort().join() === '-1,0');
check('Serpent\'s Hold', Object.keys(d.towns[32].floors).sort().join() === '-1,0,1');
// EnterRoom: DUNGEON.CBT holds 16 rooms for each dungeon but Despise.
check('112 rooms', d.rooms.length === 112);
check('512 tile names', d.look.length === 512 && d.look[1] === 'deep water');
check('48 arms', d.equip.length === 48 && d.equip[0] === 'Leather Helm');
check('113 hidden things', d.hidden.length === 113);
// ultima.c: shopNames[0][0] is Iolo's Bows, sold in map 2 (Britain); the Inn of Skara Brae is The Haunting Inn.
check("Iolo's Bows in Britain", d.shops.names[0][0] === "Iolo's Bows" && d.shops.maps[0][0] === 2);
check('The Haunting Inn in Skara Brae', d.shops.maps[7][d.shops.names[7].indexOf('The Haunting Inn')] === 7);
// TLK: every dialog number below 0x80 in the .NPC files has a script in its file's .TLK.
for (const t of Object.values(d.towns)) for (const q of t.people) if (q.type && q.talk && q.talk < 0x80) check(`script ${t.file} ${q.talk}`, !!d.talk[t.file][q.talk]);
check('Zachariah of Moonglow', d.talk.TOWNE[1].name === 'Zachariah' && d.talk.TOWNE[1].job === 'I study the stars.');
check('resistance password', d.talk.TOWNE[1].labels.some(l => l.qa.some(q => q.k.includes('dawn'))));
check('Sign of Eight Laws', d.signs.some(s => s.loc === 32 && s.text === 'LIVE BY THE EIGHT LAWS'));
check('signposts', d.signs.some(s => s.loc === 0 && s.text === 'NORTH BRITAIN\nEAST PAWS\nSOUTH TRINSIC'));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
