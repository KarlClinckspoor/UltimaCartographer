// Checks data/u3 (from tools/extract-u3.mjs) against counts and facts in u3-decompiled/docs.
// Usage: node tests/u3-data.test.mjs
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const d = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u3', 'u3.json')));
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.log('FAIL', name); } };

// FORMATS.md 4: cell values over all seven dungeons.
const n = {};
for (const dn of Object.values(d.dungeons)) for (const b of Buffer.from(dn.cells, 'hex')) n[b] = (n[b] || 0) + 1;
for (const [v, c] of Object.entries({0x00: 5622, 0x80: 5753, 0xA0: 452, 0xC0: 176, 0x10: 101, 0x20: 94, 0x30: 45, 0x40: 673,
  0x01: 1, 0x02: 76, 0x03: 451, 0x04: 367, 0x05: 17, 0x06: 249, 0x08: 259}))
  check(`dungeon cells ${(+v).toString(16)} = ${c} (got ${n[v] || 0})`, (n[v] || 0) === c);
// FORMATS.md 3: SOSARIA's whirlpool starts at (5, 3Ah); the speeches hold 4-8 entries in towns.
check('Dardin level 1 message', d.dungeons.DARDIN.messages[0] === "Dardin's Pit!");
// (FORMATS.md says 4 to 8 entries; Death Gulch's table starts with the word 6, so it has 3.)
for (const k of ['BRITISH', 'LCB', 'MOON', 'YEW', 'GREY', 'DAWN', 'DEVIL', 'FAWN', 'DEATH']) check(`${k} speeches 3-8`, d.maps[k].speeches.length >= 3 && d.maps[k].speeches.length <= 8);
check('Death Gulch has 3 speeches', d.maps.DEATH.speeches.length === 3);
check('Sosaria has no creatures in the file', d.maps.SOSARIA.people.length === 0);
check('Ambrosia has 16 creatures', d.maps.AMBROSIA.people.length === 16);
// MECHANICS.md 8.5: the rods (event 5) and the time vision (event 1).
const cell = (k, L, x, y) => Buffer.from(d.dungeons[k].cells, 'hex')[(L - 1) * 256 + y * 16 + x];
check('Fire L8 (4,10) rod', cell('FIRE', 8, 4, 10) === 5);
check('Fire L8 (5,14) rod', cell('FIRE', 8, 5, 14) === 5);
check('P L8 (6,15) rod', cell('P', 8, 6, 15) === 5);
check('Time L8 (1,1) time vision', cell('TIME', 8, 1, 1) === 1);
// MECHANICS.md 7.9: locked doors (B8h) in Castle British 12, Castle Exodus 10.
const count = (k, v) => [...Buffer.from(d.maps[k].cells, 'hex')].filter(b => b === v).length;
check(`Castle British locked doors 12 (got ${count('BRITISH', 0xB8)})`, count('BRITISH', 0xB8) === 12);
check(`Castle Exodus locked doors 10 (got ${count('EXODUS', 0xB8)})`, count('EXODUS', 0xB8) === 10);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
