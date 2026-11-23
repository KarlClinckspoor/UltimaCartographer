// Checks data/u4 (from tools/extract-u4.mjs) against facts in u4-decompiled-port/docs/MECHANICS.md.
// Usage: node tests/u4-data.test.mjs
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const d = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u4', 'u4.json')));
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.log('FAIL', name); } };
const world = Buffer.from(d.world, 'base64');
const at = (x, y) => world[y * 256 + x];

// 1.5: the moongates.
check('moongates', JSON.stringify(d.moongates) === JSON.stringify([[224, 133], [96, 102], [38, 224], [50, 37], [166, 19], [104, 194], [23, 126], [187, 167]]));
// The places sit on tiles of their kind (TIL_DUNGEON 09, TOWN 0A, CASTLE 0B, VILLAGE 0C, LCB entrance 0E, SHRINE 1E; the Abyss on lava 4C).
// Magincia lies in ruins (TIL_RUINS 1D); the Abyss is entered on the fire-field square (EnterPlace's comment: lava at E9,E9 falls through to the fire field case).
const kinds = {castle: [0x0B, 0x0E], towne: [0x0A, 0x1D], village: [0x0C], dungeon: [0x09, 0x46], shrine: [0x1E]};
const kindOf = n => n <= 4 ? 'castle' : n <= 12 ? 'towne' : n <= 16 ? 'village' : n <= 24 ? 'dungeon' : 'shrine';
for (const pl of d.places) if (pl.n !== 31) check(`${pl.name} on a ${kindOf(pl.n)} tile (got ${at(pl.x, pl.y).toString(16)})`, kinds[kindOf(pl.n)].includes(at(pl.x, pl.y)));
// 3.4: dungeon stones come from altars: the six dungeons with stones each have one (B0h).
for (const k of ['DECEIT', 'DESPISE', 'DESTARD', 'WRONG', 'COVETOUS', 'SHAME'])
  check(`${k} has an altar`, [...Buffer.from(d.dungeons[k].cells, 'hex')].some(b => (b & 0xF0) === 0xB0));
// File layout: 16 rooms per dungeon, 64 in the Abyss; 16 talk records per towne.
for (const [k, v] of Object.entries(d.dungeons)) check(`${k} rooms`, v.rooms.length === (k === 'ABYSS' ? 64 : 16));
for (const [k, v] of Object.entries(d.talk)) check(`${k} talk records`, v.length === 16);
check('Iolo in Britain', d.talk.BRITAIN.some(r => r.name === 'Iolo'));
check('mantras', d.mantras.join(' ') === 'ahm mu ra beh cah summ om lum');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
