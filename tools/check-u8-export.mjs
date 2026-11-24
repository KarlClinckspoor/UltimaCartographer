// Checks u8edit's web export (data/u8) against docs/u8-export.md: sizes, references, counts, bounds.
// Usage: node tools/check-u8-export.mjs [data folder]
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u8');
const J = p => JSON.parse(readFileSync(join(dir, p), 'utf8'));
let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) pass++; else { fail++; console.log('FAIL', name, more); } };
const size = p => statSync(join(dir, p)).size;
const kb = n => (n / 1024).toFixed(0) + ' KB';
const NONE = 0xFFFFFFFF;

const man = J('manifest.json');
check('format u8web v1', man.format === 'u8web' && man.version === 1, `${man.format} ${man.version}`);

// atlas pages: the PNG's own width and height (IHDR) must match the manifest
const pages = man.atlas.map(a => {
  const ok = existsSync(join(dir, a.file));
  check(`exists ${a.file}`, ok);
  if (!ok) return {w: 0, h: 0};
  const b = readFileSync(join(dir, a.file));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), rgba = b[25] === 6;
  check(`${a.file}: ${a.width} x ${a.height} RGBA`, w === a.width && h === a.height && rgba, `${w} x ${h} type ${b[25]}`);
  check(`${a.file}: at most 2048 x 2048`, w <= 2048 && h <= 2048);
  return {w, h};
});

// frames.bin
const fb = readFileSync(join(dir, 'frames.bin'));
check('frames.bin = 16 bytes a frame', fb.length === man.frames * 16, `${fb.length} vs ${man.frames * 16}`);
const shapes = J('shapes.json');
const frames = [];
let badRect = 0, noName = 0;
for (let i = 0; i < man.frames; i++) {
  const o = i * 16, f = {page: fb[o], x: fb.readUInt16LE(o + 2), y: fb.readUInt16LE(o + 4), w: fb.readUInt16LE(o + 6), h: fb.readUInt16LE(o + 8),
    left: fb.readInt16LE(o + 10), top: fb.readInt16LE(o + 12), shape: fb.readUInt16LE(o + 14)};
  const p = pages[f.page];
  if (!p || fb[o + 1] !== 0 || f.x + f.w > p.w || f.y + f.h > p.h) badRect++;
  if (!(f.shape in shapes)) noName++;
  frames.push(f);
}
check('frames lie inside their atlas page', badRect === 0, `${badRect} bad`);
check('every frame\'s shape has a name in shapes.json', noName === 0, `${noName} without`);

// maps
const graph = J('graph.json');
const infoLen = {}, infos = {};
let totalItems = 0, totalBin = 0, totalInfo = 0;
for (const m of man.maps) {
  const p = `maps/${m.id}/`;
  const b = readFileSync(join(dir, p + 'items.bin')), info = J(p + 'info.json');
  infos[m.id] = info; infoLen[m.id] = info.length;
  totalBin += b.length; totalInfo += size(p + 'info.json'); totalItems += m.items;
  check(`map ${m.id}: items.bin = 16 bytes an item`, b.length === m.items * 16, `${b.length} vs ${m.items * 16}`);
  check(`map ${m.id}: info count`, info.length === m.info, `${info.length} vs ${m.info}`);
  let drawn = 0, badFrame = 0, badInfo = 0, flagMismatch = 0, pad = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const used = new Set();
  for (let i = 0; i < m.items; i++) {
    const o = i * 16, sx = b.readInt32LE(o), sy = b.readInt32LE(o + 4), fid = b.readUInt16LE(o + 8), flags = b[o + 11], ii = b.readUInt32LE(o + 12);
    if (fid >= man.frames) { badFrame++; continue; }
    if (ii !== NONE) { if (ii >= info.length) badInfo++; else used.add(ii); }
    if (!!(flags & 16) !== (ii !== NONE)) flagMismatch++;
    if (flags & 0xC0) pad++;
    if (flags & 8) continue;
    drawn++;
    const f = frames[fid], x0 = sx + f.left, y0 = sy + f.top;
    minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x0 + f.w); maxY = Math.max(maxY, y0 + f.h);
  }
  check(`map ${m.id}: frame ids exist`, badFrame === 0, `${badFrame}`);
  check(`map ${m.id}: info indices exist`, badInfo === 0, `${badInfo}`);
  check(`map ${m.id}: bit 4 set exactly when there is an info index`, flagMismatch === 0, `${flagMismatch}`);
  check(`map ${m.id}: flag bits 6-7 clear`, pad === 0, `${pad}`);
  check(`map ${m.id}: every info entry is used by an item`, used.size === info.length, `${used.size} of ${info.length}`);
  check(`map ${m.id}: drawn count`, drawn === m.drawn, `${drawn} vs ${m.drawn}`);
  const bd = m.bounds;
  check(`map ${m.id}: bounds = drawn frames' rectangles`, bd.minX === minX && bd.minY === minY && bd.maxX === maxX && bd.maxY === maxY,
    `${JSON.stringify(bd)} vs ${minX},${minY},${maxX},${maxY}`);
  check(`map ${m.id}: in graph.json as exported`, graph.maps.some(g => g.id === m.id && g.exported));
}

// teleport eggs: a sending egg's toItem is a receiving egg with the same id on toMap
let eggs = 0, badEgg = 0;
for (const [id, info] of Object.entries(infos)) for (const e of info) {
  if (e.egg?.kind !== 'teleport' || !e.egg.sends || e.egg.toItem == null) continue;
  eggs++;
  const r = infos[e.egg.toMap]?.[e.egg.toItem];
  if (!r?.egg?.receives || r.egg.id !== e.egg.id) { badEgg++; if (badEgg < 4) console.log('  egg', id, e.item, JSON.stringify(e.egg)); }
}
check('sending teleport eggs lead to a receiving egg with their id', badEgg === 0, `${badEgg} of ${eggs}`);

// transitions
let badT = 0;
const inMap = (map, i) => i == null || (infoLen[map] != null && i >= 0 && i < infoLen[map]);
for (const t of graph.transitions) {
  const ok = ['teleportEgg', 'usecodeToEgg', 'usecodeNpcTeleport'].includes(t.kind) && inMap(t.fromMap, t.fromItem) && inMap(t.toMap, t.toItem);
  if (!ok) { badT++; if (badT < 4) console.log('  transition', JSON.stringify(t)); }
}
check('transitions: kinds and item indices', badT === 0, `${badT} of ${graph.transitions.length}`);
const ids = new Set(graph.maps.map(g => g.id));
check('transitions: maps are in the graph', graph.transitions.every(t => ids.has(t.fromMap) && ids.has(t.toMap)));

const atlasBytes = man.atlas.reduce((s, a) => s + size(a.file), 0);
console.log(`maps ${man.maps.length}, items ${totalItems.toLocaleString()}, frames ${man.frames}, transitions ${graph.transitions.length}, teleport eggs ${eggs}`);
console.log(`sizes: items.bin ${kb(totalBin)}, info.json ${kb(totalInfo)}, atlas ${kb(atlasBytes)}, frames.bin ${kb(fb.length)}, shapes.json ${kb(size('shapes.json'))}, graph.json ${kb(size('graph.json'))}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
