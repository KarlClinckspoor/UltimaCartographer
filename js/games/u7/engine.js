// The Ultima VII engine's world (The Black Gate, Serpent Isle): 3072 x 3072 tiles drawn in the browser as you pan, from
// the game's own chunk map and objects (data/<id>, by tools/extract-u7.mjs). Objects at or above the
// height cutoff are left out, so roofs and upper floors can be lifted off to see inside.
// Drawing: Exult's rules (gamewin.cc Get_shape_location: an object's hot spot is at
// ((x + 1) * 8 - 1 - 4 * lift, (y + 1) * 8 - 1 - 4 * lift)).
import {esc, svgDoc, g, gridSwatch, p, image} from '../../lib/draw.js';

const N = 3072, CH = 192;   // tiles and chunks a side

export function makeU7(cfg) {
const DATA = new URL(`../../../data/${cfg.id}/`, import.meta.url);
let loading = null;
const load = () => loading ||= (async () => {
  // a missing file: the visitor gets a plain message, the console how to rebuild it
  const missing = n => { console.warn(`data/${cfg.id}/${n} is missing: run tools/extract-u7.mjs ${cfg.id}`); return new Error(`Couldn’t load the map data for ${cfg.title}. Try reloading the page.`); };
  const bin = n => fetch(new URL(n, DATA)).then(r => { if (!r.ok) throw missing(n); return r.arrayBuffer(); });
  const meta = await fetch(new URL(`${cfg.id}.json`, DATA)).then(r => { if (!r.ok) throw missing(`${cfg.id}.json`); return r.json(); });
  const atlasUrl = Array.from({length: meta.pages}, (_, i) => new URL(`atlas-${i}.png`, DATA).href);
  const [map, chunks, frames, objects, contents, ...atlas] = await Promise.all([bin('map.bin'), bin('chunks.bin'), bin('frames.bin'), bin('objects.bin'),
    fetch(new URL('contents.json', DATA)).then(r => r.ok ? r.json() : {}), ...atlasUrl.map(u => image(u))]);
  const d = {...meta, map: new Uint16Array(map), chunks: new Uint16Array(chunks), fr: new DataView(frames), atlas, atlasUrl, contents};
  // frames.bin lists the frames used, each under shape * 64 + frame: an index from that key to the record (-1 none)
  d.at = new Int32Array(1024 * 64).fill(-1);
  for (let o = 0; o < frames.byteLength; o += 20) d.at[d.fr.getUint32(o, true)] = o + 4;
  // objects: x, y, lift, flags, shape | frame << 10, quality, 0 (10 bytes); indexed by chunk
  const R = 10, ov = new DataView(objects), n = objects.byteLength / R;
  d.obj = {x: new Uint16Array(n), y: new Uint16Array(n), z: new Uint8Array(n), fl: new Uint8Array(n), sf: new Uint16Array(n), q: new Uint8Array(n)};
  d.byChunk = Array.from({length: CH * CH}, () => []);
  for (let i = 0; i < n; i++) {
    const k = i * R, x = ov.getUint16(k, true), y = ov.getUint16(k + 2, true);
    d.obj.x[i] = x; d.obj.y[i] = y; d.obj.z[i] = ov.getUint8(k + 4); d.obj.fl[i] = ov.getUint8(k + 5); d.obj.sf[i] = ov.getUint16(k + 6, true); d.obj.q[i] = ov.getUint8(k + 8);
    d.byChunk[(y >> 4) * CH + (x >> 4)].push(i);
  }
  // every key in the game, by its number (its quality): lying on the map, in a container (where the container is), or
  // carried by someone. A key opens the locks with the same number (Exult contain.cc: keys go by quality).
  d.keys = new Map();
  const addKey = (q, at) => { if (!d.keys.has(q)) d.keys.set(q, []); d.keys.get(q).push(at); };
  const walk = (items, at) => { for (const it of items) { if (it[0] === KEY) addKey(it[2], at); walk(it.slice(3), at); } };
  for (let i = 0; i < n; i++) if ((d.obj.sf[i] & 0x3FF) === KEY) addKey(d.obj.q[i], {x: d.obj.x[i], y: d.obj.y[i], where: 'lies'});
  for (const [i, items] of Object.entries(contents)) walk(items, {x: d.obj.x[+i], y: d.obj.y[+i], where: 'in', box: d.obj.sf[+i]});
  for (const p of meta.npcs) if (p.inv) walk(p.inv, {x: p.x, y: p.y, where: 'carried', who: p});
  // how many locked chests and sealed boxes each lock number has
  d.locks = new Map();
  for (let i = 0; i < n; i++) if (LOCKED.has(d.obj.sf[i] & 0x3FF)) d.locks.set(d.obj.q[i], (d.locks.get(d.obj.q[i]) || 0) + 1);
  return d;
})();

// ground: U7MAP holds 12 x 12 superchunks of 16 x 16 chunk numbers; a chunk is 16 x 16 tiles of shape | frame << 10
const groundAt = (d, x, y) => 0x7FFF & d.chunks[d.map[((y >> 8) * 12 + (x >> 8)) * 256 + ((y >> 4) & 15) * 16 + ((x >> 4) & 15)] * 256 + (y & 15) * 16 + (x & 15)];
// a frame number has 6 bits: 32 and up is a reflected frame (the extractor stores it ready turned)
const FR = (d, sf) => { const o = d.at[(sf & 0x3FF) * 64 + ((sf >> 10) & 63)], v = d.fr; return o < 0 ? null : {page: v.getUint8(o), ax: v.getUint16(o + 2, true), ay: v.getUint16(o + 4, true), w: v.getUint16(o + 6, true), h: v.getUint16(o + 8, true), xl: v.getInt16(o + 10, true), ya: v.getInt16(o + 12, true), c1: v.getUint8(o + 14), c2: v.getUint8(o + 15)}; };
const avg = f => [f.c1 & 0xF0, (f.c1 & 15) << 4, f.c2 & 0xF0, (f.c2 & 15) * 17];
const isFlat = sf => (sf & 0x3FF) < 0x96;
// An item's name as the game builds it (Exult objs/objnames.cc): a name is four parts split by slashes, the singular
// the first part, a space, the second and the third ("/key//s" is "key"), the plural the count, the second and the
// fourth ("3 keys"); some shapes name each frame instead (TEXT.FLX's misc names). A leading "a"/"an" is dropped.
function name(d, sf, q = 0) {
  let s = d.frameNames?.[(sf & 0x3FF) * 64 + ((sf >> 10) & 31)] || d.names[sf & 0x3FF] || '';
  if (s.includes('/')) {
    const [a, b = '', c = '', e = ''] = s.split('/');
    s = q > 1 ? `${q} ${b}${e}` : `${a ? a + ' ' : ''}${b}${c}`;
  }
  s = s.replace(/^(a|an) /i, '').trim();
  return s ? s.replace(/^\w/, ch => ch.toUpperCase()) : 'Unnamed object';
}
// schedule activities (Exult schedule.h)
const ACT = ['fighting', 'pacing east-west', 'pacing north-south', 'talking', 'dancing', 'eating', 'farming', 'keeping shop', 'mining', 'hunting', 'standing', 'loitering', 'wandering',
  'at the forge', 'sleeping', 'waiting', 'sitting', 'grazing', 'baking', 'sewing', 'keeping away', 'in the lab', 'thieving', 'waiting tables', 'on an errand', 'playing', 'eating at the inn', 'dueling',
  'preaching', 'patrolling', 'at a desk', 'following the Avatar'];
const hh = h => `${String(h).padStart(2, '0')}:00`;
const pname = n => n.name.replace(/_/g, ' ').replace(/ \d+$/, m => m) || `NPC ${n.n}`;
// the entry in force at an hour: the latest 3-hour period reached
function slotAt(sched, hour) {
  const per = Math.floor(hour / 3);
  let best = null, ago = 99;
  for (const e of sched) { const a = (per - e[0] + 8) % 8; if (a < ago) { ago = a; best = e; } }
  return best;
}
const KEY = 641, LOCKED = new Set([522, 798]), DOORS = new Set([270, 376, 432, 433]);   // locked chest, sealed box; the four doors (Exult shape_info, keyring.uc)
// a shape's footprint in tiles (TFA.DAT), x and y swapped for a reflected frame
const size = (d, sf) => { const t = d.tfa[(sf & 0x3FF) * 3 + 2], a = 1 + (t & 7), b = 1 + ((t >> 3) & 7); return sf & (32 << 10) ? [b, a] : [a, b]; };
// An object's box in tiles and its picture on the map (in shape pixels, 8 a tile), as Exult's Ordering_info has them
// (objs/ordinfo.h): x from xleft to xright, y from yfar to ynear, height from zbot to ztop; a flat object (no height)
// counts as one below its lift. The picture's hot spot is ((x + 1) * 8 - 1 - 4 * lift, (y + 1) * 8 - 1 - 4 * lift).
function box(d, o) {
  const f = FR(d, o.sf); if (!f) return null;
  const [xs, ys] = size(d, o.sf), zs = d.tfa[(o.sf & 0x3FF) * 3] >> 5;
  const hx = (o.x + 1) * 8 - 1 - 4 * o.z, hy = (o.y + 1) * 8 - 1 - 4 * o.z;
  return Object.assign(o, {f, zs, xl: o.x - xs + 1, xr: o.x, yf: o.y - ys + 1, yn: o.y, zb: zs ? o.z : o.z - 1, zt: o.z + zs - 1,
    left: hx - f.xl, top: hy - f.ya});
}
// along one axis: cmp -1 if the first range is before the second, 1 if after, 0 if equal; over if they overlap (Compare_ranges)
function ranges(a1, b1, a2, b2) {
  if (b1 < a2) return [-1, false];
  if (b2 < a1) return [1, false];
  return [a1 < a2 ? -1 : a1 > a2 ? 1 : b1 < b2 ? 1 : b1 > b2 ? -1 : 0, true];
}
// which of two overlapping pictures is drawn first: -1 the first, 1 the second, 0 either (Exult Game_object::compare,
// objs/objs.cc). The game's own rule: whatever is nearer (south, east) or higher goes over.
function compare(a, b) {
  const [xc, xo] = ranges(a.xl, a.xr, b.xl, b.xr), [yc, yo] = ranges(a.yf, a.yn, b.yf, b.yn), [zc, zo] = ranges(a.zb, a.zt, b.zb, b.zt);
  if (!xc && !yc && !zc) return a.f.w < b.f.w && a.f.h < b.f.h ? -1 : a.f.w > b.f.w && a.f.h > b.f.h ? 1 : 0;
  if (xo && yo && zo) {
    if (!a.zs) return !b.zs ? 0 : -1;
    if (!b.zs) return 1;
    if (a.z === b.z && a.zs - b.zs > 1) return 1;
    if (a.z === b.z && b.zs - a.zs > 1) return -1;   // the same rule the other way round (Exult only asks one way)
  }
  if (xc >= 0 && yc >= 0 && zc >= 0) return 1;
  if (xc <= 0 && yc <= 0 && zc <= 0) return -1;
  if (yo) {
    if (xo) return zc;
    if (zo) return xc;
    if (!zc) return xc;
    if (xc === zc) return xc;
    return 0;
  }
  if (xo) return zo || !zc ? yc : yc === zc ? yc : 0;
  if (xc === -1) { if (yc === -1) return zo || zc <= 0 ? -1 : 0; }
  else if (yc === 1) { if (zo || zc >= 0) return 1; if (a.zt / 5 < b.zb / 5) return -1; }
  return 0;
}
// the order to paint a set of boxed objects: each after everything it must cover, found by comparing only pictures
// that overlap (bucketed by 64-pixel squares); ties keep the given order
function paintOrder(list) {
  const B = 64, buckets = new Map();
  list.forEach((o, i) => {
    o.i = i; o.deps = null;
    for (let by = Math.floor(o.top / B); by <= Math.floor((o.top + o.f.h - 1) / B); by++) for (let bx = Math.floor(o.left / B); bx <= Math.floor((o.left + o.f.w - 1) / B); bx++) {
      const k = by * 100000 + bx; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(o);
    }
  });
  for (const [k, os] of buckets) {
    const by = Math.floor(k / 100000), bx = k - by * 100000;
    for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) {
      const a = os[i], b = os[j], l = Math.max(a.left, b.left), t = Math.max(a.top, b.top);
      if (l >= Math.min(a.left + a.f.w, b.left + b.f.w) || t >= Math.min(a.top + a.f.h, b.top + b.f.h)) continue;   // no overlap
      if (Math.floor(l / B) !== bx || Math.floor(t / B) !== by) continue;   // compared in another bucket
      // Exult asks only one way round (each new object against those already placed), and its answers are not
      // always mirror images: ask both ways, and leave a pair with conflicting answers to the default order
      const ab = compare(a, b), ba = compare(b, a), c = ab && ba && ab === ba ? 0 : ab || -ba;
      if (c < 0) (b.deps ||= []).push(a); else if (c > 0) (a.deps ||= []).push(b);
    }
  }
  // Kahn's topological sort, always painting the ready object that comes first in the given order; a cycle (the data has
  // them: a body lying half inside a wall, beside a table) is broken by painting the first remaining object, so it costs
  // one small overlap instead of reordering whole walls
  const n = list.length, need = new Int32Array(n), after = Array.from({length: n}, () => []);
  for (const o of list) if (o.deps) for (const q of o.deps) { need[o.i]++; after[q.i].push(o.i); }
  const heap = [], push = v => { heap.push(v); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p] <= v) break; heap[k] = heap[p]; k = p; } heap[k] = v; };
  const pop = () => { const top = heap[0], v = heap.pop(); if (heap.length) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1] < heap[c]) c++; if (heap[c] >= v) break; heap[k] = heap[c]; k = c; } heap[k] = v; } return top; };
  const done = new Uint8Array(n), out = [];
  for (let i = 0; i < n; i++) if (!need[i]) push(i);
  let scan = 0;
  while (out.length < n) {
    let i;
    if (heap.length) i = pop();
    else { while (done[scan]) scan++; i = scan; }   // a cycle: force the first one left
    if (done[i]) continue;
    done[i] = 1; out.push(list[i]);
    for (const j of after[i]) if (!done[j] && --need[j] === 0) push(j);
  }
  return out;
}
// an item's picture, shrunk or grown to a line of text: a CSS sprite from the atlas page
function icon(d, sf, px = 18) {
  const f = FR(d, sf); if (!f || !f.w) return '';
  const s = Math.min(px / f.h, 2 * px / f.w), img = d.atlas[f.page];
  return `<span class="u7icon" style="width:${(f.w * s).toFixed(1)}px;height:${(f.h * s).toFixed(1)}px;background:url(${d.atlasUrl[f.page]}) ${(-f.ax * s).toFixed(1)}px ${(-f.ay * s).toFixed(1)}px/${(img.naturalWidth * s).toFixed(1)}px ${(img.naturalHeight * s).toFixed(1)}px"></span>`;
}

return {
  id: cfg.id, title: cfg.title, version: 'PC/GOG version. The map, objects and people as they are at the start of a new game.',
  params: [{key: 'cut', label: 'Height cutoff', def: 5, min: 1, max: 16, help: 'Hides objects at this height or above. 5 takes the roofs off most buildings; 16 shows everything.'},
    {key: 'hour', slider: true, label: 'Hour of the day', def: 12, min: 0, max: 23, help: 'People follow schedules in 3-hour blocks. 0 is midnight.'}],
  transient: [], defaultMap: 'world',
  maps() { return [{id: 'world', name: cfg.world}]; },
  async render(mapId, params) {
    const d = await load();
    const cut = Math.max(1, Math.min(16, params.cut ?? 5));
    const shown = i => d.obj.z[i] < cut && !(d.obj.fl[i] & 2);
    const hour = Math.max(0, Math.min(23, params.hour ?? 12));
    // a lone 'waiting' entry is a placeholder (the companions'), so they stay where the game starts them
    const people = d.npcs.map(n => { const e = n.sched && !(n.sched.length === 1 && n.sched[0][1] === 15) && slotAt(n.sched, hour); return {...n, px: e ? e[2] : n.x, py: e ? e[3] : n.y, pz: e ? 0 : n.z, act: e ? e[1] : null}; });
    const peopleByChunk = new Map();
    for (const n of people) { const k = (n.py >> 4) * CH + (n.px >> 4); if (!peopleByChunk.has(k)) peopleByChunk.set(k, []); peopleByChunk.get(k).push(n); }

    function draw(cv, x0, y0, span, off) {
      const ctx = cv.getContext('2d'), sc = 256 / span;   // canvas pixels a tile
      const xa = Math.max(0, Math.floor(x0)), ya = Math.max(0, Math.floor(y0)), xb = Math.min(N, Math.ceil(x0 + span)), yb = Math.min(N, Math.ceil(y0 + span));
      if (xa >= xb || ya >= yb) return;
      const objsOn = !off.has('objects');
      if (sc < 2) {   // far out: each tile its frame's average colour
        const img = ctx.createImageData(256, 256), px = img.data, step = 1 / sc;
        for (let py = 0; py < 256; py++) {
          const y = Math.floor(y0 + py * step); if (y < 0 || y >= N) continue;
          for (let qx = 0; qx < 256; qx++) {
            const x = Math.floor(x0 + qx * step); if (x < 0 || x >= N) continue;
            const f = FR(d, groundAt(d, x, y)); if (!f) continue;
            const c = avg(f), o = (py * 256 + qx) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
          }
        }
        if (objsOn) for (let cy = ya >> 4; cy <= (yb - 1) >> 4; cy++) for (let cx = xa >> 4; cx <= (xb - 1) >> 4; cx++) for (const i of d.byChunk[cy * CH + cx]) {
          if (!shown(i)) continue;
          const f = FR(d, d.obj.sf[i]); if (!f || f.c2 % 16 < 6) continue;
          const qx = Math.floor((d.obj.x[i] - x0) * sc), py = Math.floor((d.obj.y[i] - y0) * sc);
          if (qx < 0 || py < 0 || qx > 255 || py > 255) continue;
          const c = avg(f), o = (py * 256 + qx) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
        }
        ctx.putImageData(img, 0, 0);
        return;
      }
      ctx.imageSmoothingEnabled = sc < 8;
      const k = sc / 8;   // canvas pixels a shape pixel
      const blit = (f, left, top) => ctx.drawImage(d.atlas[f.page], f.ax, f.ay, f.w, f.h, (left / 8 - x0) * sc, (top / 8 - y0) * sc, f.w * k, f.h * k);
      // the ground's flat tiles, then everything with height (terrain shapes from the chunks and objects), lowest and farthest first
      const tall = [];
      for (let y = ya; y < yb + 8 && y < N; y++) for (let x = xa; x < xb + 8 && x < N; x++) {
        const sf = groundAt(d, x, y);
        if (isFlat(sf)) { if (x < xb && y < yb) { const f = FR(d, sf); if (f) { ctx.imageSmoothingEnabled = false; blit(f, x * 8, y * 8); ctx.imageSmoothingEnabled = sc < 8; } } }
        else tall.push({x, y, z: 0, sf, t: -1});
      }
      if (objsOn) {
        const m = 6;   // shapes reach up to ~6 chunks up and left of their tile
        for (let cy = Math.max(0, (ya >> 4)); cy <= Math.min(CH - 1, ((yb - 1) >> 4) + m); cy++) for (let cx = Math.max(0, (xa >> 4)); cx <= Math.min(CH - 1, ((xb - 1) >> 4) + m); cx++)
          for (const i of d.byChunk[cy * CH + cx]) if (shown(i)) tall.push({x: d.obj.x[i], y: d.obj.y[i], z: d.obj.z[i], sf: d.obj.sf[i], t: i});
      }
      if (!off.has('people')) for (let cy = Math.max(0, ya >> 4); cy <= Math.min(CH - 1, ((yb - 1) >> 4) + 2); cy++) for (let cx = Math.max(0, xa >> 4); cx <= Math.min(CH - 1, ((xb - 1) >> 4) + 2); cx++)
        for (const n of peopleByChunk.get(cy * CH + cx) || []) if (n.pz < cut) tall.push({x: n.px, y: n.py, z: n.pz, sf: n.sf, t: -2});
      // the pictures on this tile, painted in the game's order (paintOrder: Exult's comparison of the objects' boxes)
      const vis = [];
      for (const o of tall) {
        if (!box(d, o)) continue;
        if (o.left / 8 > x0 + span || o.top / 8 > y0 + span || (o.left + o.f.w) / 8 < x0 || (o.top + o.f.h) / 8 < y0) continue;
        vis.push(o);
      }
      vis.sort((a, b) => a.z - b.z || (a.x + a.y) - (b.x + b.y) || a.y - b.y);
      for (const o of paintOrder(vis)) blit(o.f, o.left, o.top);
    }

    // what is drawn at a point (in tiles): every shown object, person and terrain shape whose picture has an opaque
    // pixel there, the one on top first
    const probe = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
    const opaque = (o, px, py) => {
      const dx = Math.floor(px - o.left), dy = Math.floor(py - o.top);
      if (dx < 0 || dy < 0 || dx >= o.f.w || dy >= o.f.h) return false;
      probe.clearRect(0, 0, 1, 1); probe.drawImage(d.atlas[o.f.page], o.f.ax + dx, o.f.ay + dy, 1, 1, 0, 0, 1, 1);
      return probe.getImageData(0, 0, 1, 1).data[3] > 0;
    };
    function drawnAt(fx, fy) {
      const px = fx * 8, py = fy * 8, tx = Math.floor(fx), ty = Math.floor(fy), cand = [];
      // a picture lies up and left of its object's square: look at the squares from here to 2 chunks down and right
      for (let y = ty; y < Math.min(N, ty + 32); y++) for (let x = tx; x < Math.min(N, tx + 32); x++) { const sf = groundAt(d, x, y); if (!isFlat(sf)) cand.push({x, y, z: 0, sf, t: -1}); }
      for (let cy = ty >> 4; cy <= Math.min(CH - 1, (ty >> 4) + 2); cy++) for (let cx = tx >> 4; cx <= Math.min(CH - 1, (tx >> 4) + 2); cx++)
        for (const i of d.byChunk[cy * CH + cx]) if (shown(i)) cand.push({x: d.obj.x[i], y: d.obj.y[i], z: d.obj.z[i], sf: d.obj.sf[i], t: i});
      for (const n of people) if (n.pz < cut && n.px >= tx && n.py >= ty && n.px < tx + 16 && n.py < ty + 16) cand.push({x: n.px, y: n.py, z: n.pz, sf: n.sf, t: -2, n});
      const hits = cand.filter(o => box(d, o) && opaque(o, px, py));
      hits.sort((a, b) => a.z - b.z || (a.x + a.y) - (b.x + b.y) || a.y - b.y);
      return paintOrder(hits).reverse();
    }
    // what a container holds, nested, each line with the item's picture
    const count = (s, q) => (d.tfa[s * 3 + 1] & 15) === 3 && q > 1 ? q : 0;   // a stack: its quality is how many
    const keyNote = q => { const n = d.locks.get(q) || 0; return ` <span class="muted">(opens lock ${q}${n > 1 ? `: ${n} locked chests${n > 20 ? ', a skeleton key' : ''}` : n ? ': 1 locked chest' : ''})</span>`; };
    const holds = (items, depth = 0) => `<ul class="holds">${items.slice(0, 40).map(it => `<li>${icon(d, it[0] | it[1] << 10)} ${esc(name(d, it[0] | it[1] << 10, count(it[0], it[2])))}${it[0] === KEY ? keyNote(it[2]) : ''}${it.length > 3 && depth < 3 ? holds(it.slice(3), depth + 1) : ''}</li>`).join('')}${items.length > 40 ? `<li class="muted">and ${items.length - 40} more</li>` : ''}</ul>`;
    // where the keys numbered q are, as text and links
    const keyPlaces = (q, links) => {
      const ks = d.keys.get(q) || [];
      if (!ks.length) return p('<span class="muted">No key with this number is in the game at the start: it has to be picked or opened by magic.</span>');
      const lines = ks.slice(0, 6).map(k => {
        links.push({label: k.who ? `Key: ${pname(k.who)}` : `Key at ${k.x}, ${k.y}`, focus: [k.x, k.y]});
        return k.who ? `${esc(pname(k.who))} carries it.` : k.where === 'in' ? `In a ${esc(name(d, k.box).toLowerCase())} at ${k.x}, ${k.y}.` : `On the ground at ${k.x}, ${k.y}.`;
      });
      return p(`The key${ks.length > 1 ? 's' : ''} for it: ${lines.join(' ')}`);
    };
    const cell = (x, y, at) => {
      const hits = at ? drawnAt(at[0], at[1]) : [], top = hits[0] || null;
      const who = top ? (top.n ? [top.n] : []) : people.filter(n => n.px === x && n.py === y);
      if (who.length) {
        const n = who[0], links = [];
        let body = `<p class="muted">${esc(name(d, n.sf))}${n.act != null ? ` · ${ACT[n.act] || 'busy'}` : ' · at their starting spot'}</p>`;
        if (n.sched) {
          body += `<p class="muted">${[...n.sched].sort((a, b) => a[0] - b[0]).map(e => `${hh(e[0] * 3)}: ${ACT[e[1]] || 'busy'} at ${e[2]}, ${e[3]}`).join('<br>')}</p>`;
          for (const e of n.sched) if (e[2] !== x || e[3] !== y) links.push({label: `At ${hh(e[0] * 3)}`, params: {hour: e[0] * 3}, focus: [e[2], e[3]]});
        }
        if (n.inv) body += `<p class="muted">Carries:</p>${holds(n.inv)}`;
        return {title: pname(n), body, links};
      }
      // the objects drawn under the pointer (top first), then the rest standing on the square: hidden, above the cutoff
      const sf = groundAt(d, x, y), here = hits.filter(o => o.t >= 0).map(o => o.t);
      for (let cy = y >> 4; cy <= Math.min(CH - 1, (y >> 4) + 1); cy++) for (let cx = x >> 4; cx <= Math.min(CH - 1, (x >> 4) + 1); cx++) for (const i of d.byChunk[cy * CH + cx]) {
        const [w, h] = size(d, d.obj.sf[i]), ox = d.obj.x[i], oy = d.obj.y[i];
        if (x <= ox && x > ox - w && y <= oy && y > oy - h && !here.includes(i)) here.push(i);
      }
      if (!at) here.sort((a, b) => d.obj.z[b] - d.obj.z[a]);
      const links = [];
      const line = i => {
        const s = d.obj.sf[i] & 0x3FF, q = d.obj.q[i], c = d.contents[i];
        let t = `${icon(d, d.obj.sf[i])} ${esc(name(d, d.obj.sf[i], count(s, q)))} <span class="muted">· height ${d.obj.z[i]}${d.obj.z[i] >= cut ? ' · above the cutoff (hidden)' : ''}${d.obj.fl[i] & 2 ? ' · invisible in the game (a trigger)' : ''}${d.obj.fl[i] & 1 ? '' : ', movable'}</span>`;
        if (s === KEY) t += keyNote(q);
        if (LOCKED.has(s)) t += `<br><b>Locked</b> <span class="muted">(lock ${q})</span>.${keyPlaces(q, links)}`;
        // a door's locked state is in its frame; say only which key fits, when one does
        if (DOORS.has(s) && q && d.keys.has(q)) t += `<br><span class="muted">Lock ${q}.</span>${keyPlaces(q, links)}`;
        if (c) t += holds(c);
        return t;
      };
      const terrain = top && top.t === -1, ground = terrain ? top.sf : sf;
      const body = (here.length ? `<ul class="objs">${here.map(i => `<li>${line(i)}</li>`).join('')}</ul>` : '') + (d.names[ground & 0x3FF] ? p(`<span class="muted">${terrain ? '' : 'Ground: '}${esc(name(d, ground))}</span>`) : '');   // unnamed ground: say nothing
      const title = terrain ? name(d, ground) : here.length ? name(d, d.obj.sf[at ? here[0] : here.find(i => d.obj.z[i] < cut) ?? here[0]]) : d.names[ground & 0x3FF] ? name(d, ground) : 'Ground';
      return {title, body, links};
    };

    return {
      title: cfg.world, subtitle: `${cfg.subtitle} · height cutoff ${cut} · ${hh(hour)}`, width: N, height: N, native: 8, draw, cell, coords: cfg.coords,
      features: people.map(n => ({name: pname(n), x: n.px, y: n.py, detail: n.act != null ? ACT[n.act] : ''})),
      svg: svgDoc(N, N, g('grid', `<path d="${Array.from({length: CH - 1}, (_, i) => `M${(i + 1) * 16} 0V${N}M0 ${(i + 1) * 16}H${N}`).join('')}" stroke="#fff" stroke-width=".5" opacity=".25" fill="none"/>`) + (cfg.overlay ? cfg.overlay.svg() : '')),
      info: `<h3>${cfg.world}</h3><p>3072 × 3072 squares, drawn as you pan, with the game’s ${d.obj.x.length.toLocaleString()} objects as they are at the start of a new game.</p>
        <p>Height cutoff ${cut}: objects at height ${cut} or above are hidden${cut <= 5 ? ', so most roofs are off' : ''}. Click a square to list everything on it and how high it sits.</p>
        <p class="muted">Objects are drawn in the game’s order, as Exult works it out: nearest and highest on top. A click picks what is drawn under the pointer.</p>`,
      layers: [{id: 'objects', name: 'Objects'}, {id: 'people', name: 'People'}, ...(cfg.overlay ? cfg.overlay.layers : []), {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
    };
  },
};
}
