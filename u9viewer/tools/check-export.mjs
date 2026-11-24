// Checks the U9 editor's export (u9viewer/data) against EXPORT.md: references, bounds, sizes.
// Usage: node u9viewer/tools/check-export.mjs [data folder]
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const J = p => JSON.parse(readFileSync(join(dir, p), 'utf8'));
let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) pass++; else { fail++; console.log('FAIL', name, more); } };
const size = p => statSync(join(dir, p)).size;
const mb = n => (n / 1048576).toFixed(1) + ' MB';

const man = J('manifest.json');
check('format u9web v1', man.format === 'u9web' && man.version === 1);
for (const f of man.textures.terrain.files) check(`exists ${f}`, existsSync(join(dir, f)));
const arrays = man.textures.model;
for (const a of arrays) { for (const f of a.files) check(`exists ${f}`, existsSync(join(dir, f))); check(`modes ${a.size}`, size(a.modes) === a.count, `${size(a.modes)} vs ${a.count}`); }
const terrainLayers = man.textures.terrain.count;

// models
const mj = J('models.json'), mb_ = readFileSync(join(dir, 'models.bin'));
const vb = mj.vertexBytes || 32;
check('models.bin = vertices + indices', mb_.length === mj.vertexCount * vb + mj.indexCount * 4, `${mb_.length} vs ${mj.vertexCount * vb + mj.indexCount * 4}`);
let badTex = 0, badIdx = 0, lods = 0, tris = 0;
const dv = new DataView(mb_.buffer, mb_.byteOffset, mb_.byteLength);
for (let v = 0; v < mj.vertexCount; v++) {
  const t = dv.getUint16(v * vb + 24, true);
  if (t === 0xFFFF) continue;
  const a = arrays[t >> 12];
  if (!a || (t & 0xFFF) >= a.count) badTex++;
}
const models = mj.models;
for (const [id, m] of Object.entries(models)) for (const l of m.lods) {
  lods++; tris += l.indexCount / 3;
  const base = mj.indexOffset + l.firstIndex * 4;
  for (let i = 0; i < l.indexCount; i += Math.max(1, Math.floor(l.indexCount / 64))) {
    const v = l.baseVertex + dv.getUint32(base + i * 4, true);
    if (v >= mj.vertexCount) { badIdx++; break; }
  }
}
check('texture references point at real layers', badTex === 0, `${badTex} bad`);
check('indices point at real vertices', badIdx === 0, `${badIdx} LODs bad`);
console.log(`models: ${Object.keys(models).length}, LODs ${lods}, triangles ${Math.round(tris).toLocaleString()}, vertices ${mj.vertexCount.toLocaleString()}`);

// maps
let totals = {terrain: 0, objectsBin: 0, objectsJson: 0, links: 0};
for (const m of man.maps) {
  const p = `maps/${m.id}/`;
  const t = readFileSync(join(dir, p + 'terrain.bin')), tv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const cc = tv.getUint32(0, true), tiles = m.tilesX * m.tilesY;
  const ok = t.length === 4 + cc * 1024 + tiles * 2;
  check(`map ${m.id}: terrain.bin size`, ok, `${t.length} vs ${4 + cc * 1024 + tiles * 2}`);
  if (ok) {
    let badChunk = 0, badLayer = 0;
    for (let i = 0; i < tiles; i++) if (tv.getUint16(4 + cc * 1024 + i * 2, true) >= cc) badChunk++;
    for (let i = 0; i < cc * 256; i++) { const l = tv.getUint32(4 + i * 4, true) >>> 16; if (l !== 0xFFFF && l >= terrainLayers) badLayer++; }
    check(`map ${m.id}: chunk indices`, badChunk === 0, `${badChunk}`);
    check(`map ${m.id}: terrain layers`, badLayer === 0, `${badLayer}`);
  }
  const ob = readFileSync(join(dir, p + 'objects.bin')), od = new DataView(ob.buffer, ob.byteOffset, ob.byteLength);
  const oj = J(p + 'objects.json'), n = ob.length / 24;
  check(`map ${m.id}: objects.bin whole records`, ob.length % 24 === 0);
  check(`map ${m.id}: objects count`, oj.length === m.objects, `${oj.length} vs ${m.objects}`);
  let missingModel = 0, outside = 0, badQ = 0, unsorted = 0, badRef = 0, prev = -1;
  for (let i = 0; i < n; i++) {
    const o = i * 24, x = od.getFloat32(o, true), z = od.getFloat32(o + 8, true);
    const q = [0, 1, 2, 3].map(k => od.getInt16(o + 12 + k * 2, true) / 32767), len = Math.hypot(...q);
    const model = od.getUint16(o + 20, true), idx = od.getUint16(o + 22, true);
    if (!models[model]) missingModel++;
    if (x < -1 || z < -1 || x > m.width + 1 || z > m.height + 1) outside++;
    if (Math.abs(len - 1) > 0.01) badQ++;
    if (model < prev) unsorted++; prev = model;
    if (idx >= oj.length || !oj[idx].drawn) badRef++;
  }
  check(`map ${m.id}: drawn objects have models`, missingModel === 0, `${missingModel}`);
  check(`map ${m.id}: objects inside the map`, outside === 0, `${outside}`);
  check(`map ${m.id}: unit quaternions`, badQ === 0, `${badQ}`);
  check(`map ${m.id}: grouped by model`, unsorted === 0, `${unsorted}`);
  check(`map ${m.id}: index into objects.json`, badRef === 0, `${badRef}`);
  const lj = J(p + 'links.json');
  check(`map ${m.id}: links count`, lj.length === m.links, `${lj.length} vs ${m.links}`);
  check(`map ${m.id}: link destinations are maps`, lj.every(l => l.toMap == null || man.maps.some(q => q.id === l.toMap)), JSON.stringify(lj.find(l => l.toMap != null && !man.maps.some(q => q.id === l.toMap))));
  totals.terrain += t.length; totals.objectsBin += ob.length; totals.objectsJson += size(p + 'objects.json'); totals.links += size(p + 'links.json');
}
const texBytes = readdirSync(join(dir, 'textures')).reduce((s, f) => s + size('textures/' + f), 0);
console.log(`maps ${man.maps.length}; sizes: textures ${mb(texBytes)}, models.bin ${mb(mb_.length)}, models.json ${mb(size('models.json'))}, terrain ${mb(totals.terrain)}, objects.bin ${mb(totals.objectsBin)}, objects.json ${mb(totals.objectsJson)}, links ${mb(totals.links)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
