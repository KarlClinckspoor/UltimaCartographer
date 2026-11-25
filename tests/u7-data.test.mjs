// Checks data/u7si (from tools/extract-u7.mjs) against the game's file layouts as Exult reads them.
// Usage: node tests/u7-data.test.mjs
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u7si');
const d = JSON.parse(readFileSync(join(dir, 'u7si.json'))), bin = n => readFileSync(join(dir, n));
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.log('FAIL', name); } };
const map = bin('map.bin'), chunks = bin('chunks.bin'), frames = bin('frames.bin'), objs = bin('objects.bin');
check('U7MAP: 12 x 12 superchunks of 16 x 16 chunk numbers', map.length === 144 * 256 * 2);
check('U7CHUNKS: 3072 chunks of 16 x 16 tiles', chunks.length === 3072 * 512);
check('every chunk number is a chunk', [...Array(144 * 256).keys()].every(i => map.readUInt16LE(i * 2) < 3072));
// every tile of the map and every drawn object has its frame in the atlas
// frames.bin: 20-byte records of shape * 64 + frame (uint32) and the frame's place in the atlas
const have = new Set(); for (let o = 0; o < frames.length; o += 20) have.add(frames.readUInt32LE(o));
const hasFrame = sf => have.has((sf & 0x3FF) * 64 + ((sf >> 10) & 63));
let missing = 0;
for (let i = 0; i < 144 * 256; i++) { const c = map.readUInt16LE(i * 2); for (let t = 0; t < 256; t++) if (!hasFrame(chunks.readUInt16LE(c * 512 + t * 2) & 0x7FFF)) missing++; }
check(`ground frames in the atlas (missing ${missing})`, missing === 0);
let objMissing = 0, outside = 0;
const R = 10;   // objects.bin record size
check('objects.bin is whole records', objs.length % R === 0);
for (let o = 0; o < objs.length; o += R) { if (!(objs[o + 5] & 2) && !hasFrame(objs.readUInt16LE(o + 6))) objMissing++; if (objs.readUInt16LE(o) >= 3072 || objs.readUInt16LE(o + 2) >= 3072 || objs[o + 4] > 15) outside++; }
check(`object frames in the atlas (missing ${objMissing})`, objMissing < 50);
check('objects lie on the map with lifts 0-15', outside === 0);
check('objects sorted by y, then x', (() => { for (let o = R; o < objs.length; o += R) { const a = objs.readUInt16LE(o - R + 2) * 4096 + objs.readUInt16LE(o - R), b = objs.readUInt16LE(o + 2) * 4096 + objs.readUInt16LE(o); if (b < a) return false; } return true; })());
check('shape names (TEXT.FLX)', d.names.length === 1024 && d.names.some(n => /moongate/i.test(n)));
const npc = name => d.npcs.find(n => n.name === name);
check('NPC 0 is the Avatar', d.npcs[0].n === 0 && d.npcs[0].name === 'Avatar');
check('companions in order', npc('Dupre')?.n === 1 && npc('Shamino')?.n === 2 && npc('Iolo')?.n === 3);
check('NPCs on the map', d.npcs.every(n => n.x < 3072 && n.y < 3072));
check('schedules: periods 0-7, activities 0-31, squares on the map', d.npcs.filter(n => n.sched).flatMap(n => n.sched).every(e => e[0] < 8 && e[1] < 32 && e[2] < 3072 && e[3] < 3072));
check('most NPCs have schedules', d.npcs.filter(n => n.sched).length > 200);
// containers' contents: compact [shape, frame, quality, ...contents], keyed by object index; keys are shape 641
const contents = JSON.parse(readFileSync(join(dir, 'contents.json')));
const items = []; const walk = a => { for (const it of a) { items.push(it); walk(it.slice(3)); } };
for (const v of Object.values(contents)) walk(v); for (const n of d.npcs) if (n.inv) walk(n.inv);
check('containers hold things', Object.keys(contents).length > 500 && Object.keys(contents).every(i => +i < objs.length / R));
check('contents are shapes with frames in the atlas', items.every(it => it[0] < 1024 && hasFrame(it[0] | it[1] << 10)));
check('keys among the contents', items.some(it => it[0] === 641));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
