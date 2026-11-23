// Checks data/u2 (from tools/extract-u2.mjs) against facts u2-decompiled/docs/MECHANICS.md states
// from its own scan of the game files.
// Usage: node tests/u2-data.test.mjs
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const d = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u2', 'u2.json'))).maps;
const bytes = id => Buffer.from(d[id].cells, 'hex');
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.log('FAIL', name); } };

// 7.1: which maps exist.
const expected = 'X00 X03 X10 X11 X15 X20 X21 X22 X23 X24 X25 X30 X31 X32 X33 X34 X35 X40 X41 X45 G10 G15 G20 G30 G32 G40 G41 G44 G45 G50 G60 G61 G70 G71 G80 G81 G82 G85 G90 G92 G93';
check('map list', Object.keys(d).sort().join(' ') === expected.split(' ').sort().join(' '));

// 8.5: chests (40h) on level 15.
const chests15 = id => [...bytes(id).subarray(15 * 256, 16 * 256)].filter(b => b === 0x40).length;
for (const [id, n] of Object.entries({X15: 8, X25: 8, X35: 8, X45: 8, X24: 104, X34: 31, G44: 124, G15: 94, G45: 31, G85: 130}))
  check(`${id} level 15 chests = ${n} (got ${chests15(id)})`, chests15(id) === n);

// 8.1: the four Earth dungeons are one maze, X15 differing in two cells; only the eight documented cell values.
const diff = (a, b) => { let n = 0; const x = bytes(a), y = bytes(b); for (let i = 0; i < 4096; i++) n += x[i] !== y[i]; return n; };
check('X25 = X35 = X45', diff('X25', 'X35') === 0 && diff('X25', 'X45') === 0);
check(`X15 differs from X25 in 2 cells (got ${diff('X15', 'X25')})`, diff('X15', 'X25') === 2);
const ok = new Set([0x00, 0x10, 0x20, 0x30, 0x40, 0x80, 0xC0, 0xE0]);
for (const id of Object.keys(d).filter(k => +k[2] >= 4)) check(`${id} cell values`, [...bytes(id)].every(b => ok.has(b)));

// 8.6: Pluto's dungeon ends like a tower.
const cell = (id, L, x, y) => bytes(id)[L * 256 + y * 16 + x];
check('G85 level 14 down ladder at (7,7), up at (1,1)', cell('G85', 14, 7, 7) & 0x20 && cell('G85', 14, 1, 1) & 0x10);
check('G85 level 15 no up ladder', ![...bytes('G85').subarray(15 * 256)].some(b => !(b & 0x80) && b & 0x10));

// 9.2: the Mars towne's talkers.
check('G32 talk 1 is Marlin Perkins', /Marlin Perkins/i.test(d.G32.talk[0]));
check('X32 talk 1 is Santre', /Santre/.test(d.X32.talk[0]));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
