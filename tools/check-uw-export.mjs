// Checks the Underworld editor's web export (data/uw1, data/uw2) against docs/uw-export.md and the editor's
// docs/WEB-EXPORT.md: record sizes, references, links, sizes.
// Usage: node tools/check-uw-export.mjs [uw1|uw2|data folder ...]   (default: both games)
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const dirs = (process.argv.length > 2 ? process.argv.slice(2) : ['uw1', 'uw2']).map(a => existsSync(join(root, a)) ? join(root, a) : a);
let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) pass++; else { fail++; console.log('FAIL', name, more); } };
const kb = n => (n / 1024).toFixed(0) + ' KB';
const png = p => { const b = readFileSync(p); return {w: b.readUInt32BE(16), h: b.readUInt32BE(20)}; };

for (const dir of dirs) {
  const J = p => JSON.parse(readFileSync(join(dir, p), 'utf8'));
  const size = p => statSync(join(dir, p)).size;
  const man = J('manifest.json'), B = man.bytes;
  console.log(`== ${man.game}: ${man.levels.length} levels`);
  check(`${man.game}: format uwweb v1`, man.format === 'uwweb' && man.version === 1);
  check(`${man.game}: record sizes`, B.meshVertex === 24 && B.modelVertex === 28 && B.sprite === 36 && B.tile === 8, JSON.stringify(B));

  // texture strips: 64 wide, 64 a layer, perFile layers a file, the last one only as tall as it needs
  const T = man.textures;
  let layers = 0;
  T.files.forEach((f, i) => {
    const {w, h} = png(join(dir, f));
    const want = Math.min(T.perFile, T.count - i * T.perFile);
    check(`${man.game}: ${f} is 64 x ${want * 64}`, w === T.size && h === want * T.size, `${w} x ${h}`);
    layers += h / T.size;
  });
  check(`${man.game}: texture layers = count`, layers === T.count, `${layers} vs ${T.count}`);
  check(`${man.game}: animated frames are real layers`, T.animated.every(a => a.frames[0] === a.layer && a.frames.every(l => l < T.count) && a.ms > 0));
  const sp = man.sprites, spPng = png(join(dir, sp.files[0]));
  check(`${man.game}: sprite page size`, spPng.w === sp.width && spPng.h === sp.height, `${spPng.w} x ${spPng.h}`);

  const light = J('light.json');
  check(`${man.game}: light.json`, light.brightness?.length === 16 && light.shades?.length === 8 && light.shades.every(r => r.length === 9 && r.every(v => v >= 0 && v <= 15)) && light.names?.length === 8);

  const ids = new Set(man.levels.map(l => l.id));
  const objs = {};
  for (const L of man.levels) objs[L.id] = J(`levels/${L.id}/objects.json`);
  const totals = {mesh: 0, models: 0, sprites: 0, tiles: 0, objects: 0, map: 0};
  let starts = 0;
  for (const L of man.levels) {
    const p = `levels/${L.id}/`, tag = `${man.game} level ${L.id}`, O = objs[L.id];
    for (const k of Object.keys(totals)) totals[k] += size(p + (k === 'map' ? 'map.png' : k === 'objects' ? 'objects.json' : k + '.bin'));
    if (L.start) starts++;
    // mesh: vertices, then a tile per triangle
    const m = readFileSync(join(dir, p + 'mesh.bin'));
    check(`${tag}: mesh.bin size`, L.vertices === L.triangles * 3 && m.length === L.vertices * 24 + L.triangles * 2, `${m.length} vs ${L.vertices * 24 + L.triangles * 2}`);
    let badLayer = 0, badKind = 0, badTile = 0, mixed = 0, outside = 0;
    for (let v = 0; v < L.vertices; v++) {
      const o = v * 24, x = m.readFloatLE(o), y = m.readFloatLE(o + 4), z = m.readFloatLE(o + 8);
      if (m.readUInt16LE(o + 20) >= T.count) badLayer++;
      if (m[o + 23] > 2) badKind++;
      if (v % 3 === 2 && (m[o + 23] !== m[o - 1] || m[o + 23] !== m[o - 25])) mixed++;
      if (x < 0 || x > 64 || z < 0 || z > 64 || y < 0 || y > 4.01) outside++;
    }
    for (let t = 0; t < L.triangles; t++) if (m.readUInt16LE(L.vertices * 24 + t * 2) >= 4096) badTile++;
    check(`${tag}: mesh layers`, !badLayer, `${badLayer}`);
    check(`${tag}: mesh kinds 0-2, one a triangle`, !badKind && !mixed, `${badKind} bad, ${mixed} mixed`);
    check(`${tag}: mesh inside 64 x 4 x 64 tiles`, !outside, `${outside}`);
    check(`${tag}: triangle tiles`, !badTile, `${badTile}`);
    // models
    const md = readFileSync(join(dir, p + 'models.bin'));
    check(`${tag}: models.bin size`, md.length === L.modelVertices * 28 && L.modelVertices % 3 === 0, `${md.length}`);
    let badM = 0;
    for (let v = 0; v < L.modelVertices; v++) { const o = v * 28, l = md.readUInt16LE(o + 20), ob = md.readUInt16LE(o + 24); if ((l !== 0xFFFF && l >= T.count) || !O[ob]) badM++; }
    check(`${tag}: model layers and objects`, !badM, `${badM}`);
    // sprites
    const s = readFileSync(join(dir, p + 'sprites.bin'));
    check(`${tag}: sprites.bin size`, s.length === L.sprites * 36, `${s.length}`);
    let badS = 0;
    for (let i = 0; i < L.sprites; i++) {
      const o = i * 36, rx = s.readUInt16LE(o + 22), ry = s.readUInt16LE(o + 24), rw = s.readUInt16LE(o + 26), rh = s.readUInt16LE(o + 28), ob = s.readUInt16LE(o + 30);
      if (s[o + 20] !== 0 || rx + rw > sp.width || ry + rh > sp.height || !O[ob] || O[ob].in != null) badS++;
    }
    check(`${tag}: sprite rectangles and objects (none inside a holder)`, !badS, `${badS}`);
    // tiles
    const t = readFileSync(join(dir, p + 'tiles.bin'));
    let badT = 0;
    if (t.length === 4096 * 8) for (let i = 0; i < 4096; i++) { const o = i * 8; if (t[o] > 9 || t[o + 1] > 15 || t.readUInt16LE(o + 2) >= T.count || t.readUInt16LE(o + 4) >= T.count) badT++; }
    check(`${tag}: tiles.bin`, t.length === 4096 * 8 && !badT, `${t.length} bytes, ${badT} bad`);
    const mp = png(join(dir, p + 'map.png'));
    check(`${tag}: map.png 1024 x 1024`, mp.w === 1024 && mp.h === 1024, `${mp.w} x ${mp.h}`);
    // objects and links
    check(`${tag}: objects.json has 1024 slots`, O.length === 1024, `${O.length}`);
    check(`${tag}: object count`, O.filter(Boolean).length === L.objects, `${O.filter(Boolean).length} vs ${L.objects}`);
    let badLink = 0, badIn = 0;
    const linkOk = (k, here) => {
      if (!k) return true;
      if (k.kind === 'teleport') return ids.has(k.level) && k.x >= 0 && k.x < 64 && k.y >= 0 && k.y < 64;
      if (['door', 'trap', 'lever'].includes(k.kind)) return O[k.object] != null && (k.kind !== 'lever' || linkOk(k.does));
      return false;
    };
    for (const o of O) if (o) {
      if (!linkOk(o.link)) { badLink++; if (badLink < 3) console.log('  link', JSON.stringify(o.link)); }
      if (o.via && !o.via.every(i => O[i])) badLink++;
      if (o.in != null && !O[o.in]) badIn++;
    }
    check(`${tag}: links resolve`, !badLink, `${badLink}`);
    check(`${tag}: holders exist`, !badIn, `${badIn}`);
  }
  check(`${man.game}: one level has the new-game start`, starts === 1, `${starts}`);
  const all = Object.values(totals).reduce((a, b) => a + b, 0) + T.files.reduce((a, f) => a + size(f), 0) + size(sp.files[0]);
  console.log(`sizes: mesh ${kb(totals.mesh)}, models ${kb(totals.models)}, sprites ${kb(totals.sprites)}, tiles ${kb(totals.tiles)}, objects ${kb(totals.objects)}, maps ${kb(totals.map)}, textures ${kb(T.files.reduce((a, f) => a + size(f), 0))}; all ${kb(all)}`);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
