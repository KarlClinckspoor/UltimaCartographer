// Ultima VII Part Two: Serpent Isle. The 3072 x 3072-tile world drawn in the browser as you pan, from
// the game's own chunk map and objects (data/u7si, by tools/extract-u7.mjs). Objects at or above the
// height cutoff are left out, so roofs and upper floors can be lifted off to see inside.
// Drawing: Exult's rules (gamewin.cc Get_shape_location: an object's hot spot is at
// ((x + 1) * 8 - 1 - 4 * lift, (y + 1) * 8 - 1 - 4 * lift)).
import {esc, svgDoc, g, gridSwatch, p, image} from '../../lib/draw.js';

const DATA = new URL('../../../data/u7si/', import.meta.url);
const N = 3072, CH = 192;   // tiles and chunks a side

let loading = null;
const load = () => loading ||= (async () => {
  const bin = n => fetch(new URL(n, DATA)).then(r => { if (!r.ok) throw new Error(`data/u7si/${n} is missing: run tools/extract-u7.mjs`); return r.arrayBuffer(); });
  const meta = await fetch(new URL('u7si.json', DATA)).then(r => { if (!r.ok) throw new Error('data/u7si/u7si.json is missing: run tools/extract-u7.mjs'); return r.json(); });
  const [map, chunks, frames, objects, ...atlas] = await Promise.all([bin('map.bin'), bin('chunks.bin'), bin('frames.bin'), bin('objects.bin'),
    ...Array.from({length: meta.pages}, (_, i) => image(new URL(`atlas-${i}.png`, DATA)))]);
  const d = {...meta, map: new Uint16Array(map), chunks: new Uint16Array(chunks), fr: new DataView(frames), atlas};
  // objects: x, y, lift, flags, shape | frame << 10, quality (8 bytes); indexed by chunk
  const ov = new DataView(objects), n = objects.byteLength / 8;
  d.obj = {x: new Uint16Array(n), y: new Uint16Array(n), z: new Uint8Array(n), fl: new Uint8Array(n), sf: new Uint16Array(n)};
  d.byChunk = Array.from({length: CH * CH}, () => []);
  for (let i = 0; i < n; i++) {
    const x = ov.getUint16(i * 8, true), y = ov.getUint16(i * 8 + 2, true);
    d.obj.x[i] = x; d.obj.y[i] = y; d.obj.z[i] = ov.getUint8(i * 8 + 4); d.obj.fl[i] = ov.getUint8(i * 8 + 5); d.obj.sf[i] = ov.getUint16(i * 8 + 6, true);
    d.byChunk[(y >> 4) * CH + (x >> 4)].push(i);
  }
  return d;
})();

// ground: U7MAP holds 12 x 12 superchunks of 16 x 16 chunk numbers; a chunk is 16 x 16 tiles of shape | frame << 10
const groundAt = (d, x, y) => d.chunks[d.map[((y >> 8) * 12 + (x >> 8)) * 256 + ((y >> 4) & 15) * 16 + ((x >> 4) & 15)] * 256 + (y & 15) * 16 + (x & 15)];
const FR = (d, sf) => { const k = (sf & 0x3FF) * 32 + ((sf >> 10) & 31), o = k * 16, v = d.fr; return v.getUint8(o) === 0xFF ? null : {page: v.getUint8(o), ax: v.getUint16(o + 2, true), ay: v.getUint16(o + 4, true), w: v.getUint16(o + 6, true), h: v.getUint16(o + 8, true), xl: v.getInt16(o + 10, true), ya: v.getInt16(o + 12, true), c1: v.getUint8(o + 14), c2: v.getUint8(o + 15)}; };
const avg = f => [f.c1 & 0xF0, (f.c1 & 15) << 4, f.c2 & 0xF0, (f.c2 & 15) * 17];
const isFlat = sf => (sf & 0x3FF) < 0x96;
const name = (d, sf) => { const s = d.names[sf & 0x3FF] || `shape ${sf & 0x3FF}`; return s.replace(/^\w/, c => c.toUpperCase()).replace(/\/.*$/, ''); };
// schedule activities (Exult schedule.h)
const ACT = ['combat', 'pacing east-west', 'pacing north-south', 'talking', 'dancing', 'eating', 'farming', 'keeping shop', 'mining', 'hunting', 'standing', 'loitering', 'wandering',
  'at the forge', 'sleeping', 'waiting', 'sitting', 'grazing', 'baking', 'sewing', 'shy', 'in the lab', 'thieving', 'waiting tables', 'special', 'playing', 'eating at the inn', 'dueling',
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
const size = (d, s) => { const t = d.tfa[s * 3 + 2]; return [1 + (t & 7), 1 + ((t >> 3) & 7)]; };

export default {
  id: 'u7si', title: 'Ultima VII: Serpent Isle', version: 'PC/GOG version. The map and its objects as a new game starts, from the game files.',
  params: [{key: 'cut', label: 'Height cutoff (lift)', def: 5, min: 1, max: 16, help: 'Objects at this lift or higher are left out: 5 takes the roofs off most buildings, 16 shows everything.'},
    {key: 'hour', label: 'Hour of the day', def: 12, min: 0, max: 23, help: 'People follow schedules in 3-hour periods.'}],
  transient: [], defaultMap: 'world',
  maps() { return [{id: 'world', name: 'Serpent Isle'}]; },
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
      tall.sort((a, b) => a.z - b.z || (a.x + a.y) - (b.x + b.y) || a.y - b.y);
      for (const o of tall) {
        const f = FR(d, o.sf); if (!f) continue;
        const hx = (o.x + 1) * 8 - 1 - 4 * o.z, hy = (o.y + 1) * 8 - 1 - 4 * o.z;
        const left = hx - f.xl, top = hy - f.ya;
        if (left / 8 > x0 + span || top / 8 > y0 + span || (left + f.w) / 8 < x0 || (top + f.h) / 8 < y0) continue;
        blit(f, left, top);
      }
    }

    const cell = (x, y) => {
      const who = people.filter(n => n.px === x && n.py === y);
      if (who.length) {
        const n = who[0], links = [];
        let body = `<p class="muted">${esc(name(d, n.sf))}${n.act != null ? ` · ${ACT[n.act] || 'activity ' + n.act}` : ' · where the game starts them'}</p>`;
        if (n.sched) {
          body += `<p class="muted">${[...n.sched].sort((a, b) => a[0] - b[0]).map(e => `${hh(e[0] * 3)}: ${ACT[e[1]] || e[1]} at ${e[2]}, ${e[3]}`).join('<br>')}</p>`;
          for (const e of n.sched) if (e[2] !== x || e[3] !== y) links.push({label: `At ${hh(e[0] * 3)}`, params: {hour: e[0] * 3}, focus: [e[2], e[3]]});
        }
        return {title: pname(n), body, links};
      }
      const sf = groundAt(d, x, y), here = [];
      for (let cy = y >> 4; cy <= Math.min(CH - 1, (y >> 4) + 1); cy++) for (let cx = x >> 4; cx <= Math.min(CH - 1, (x >> 4) + 1); cx++) for (const i of d.byChunk[cy * CH + cx]) {
        const [w, h] = size(d, d.obj.sf[i] & 0x3FF), ox = d.obj.x[i], oy = d.obj.y[i];
        if (x <= ox && x > ox - w && y <= oy && y > oy - h) here.push(i);
      }
      here.sort((a, b) => d.obj.z[b] - d.obj.z[a]);
      const line = i => `${esc(name(d, d.obj.sf[i]))} <span class="muted">· lift ${d.obj.z[i]}${d.obj.z[i] >= cut ? ', above the cutoff' : ''}${d.obj.fl[i] & 2 ? ', not drawn (egg or trigger)' : ''}${d.obj.fl[i] & 1 ? '' : ', movable'}</span>`;
      const body = (here.length ? `<ul>${here.map(i => `<li>${line(i)}</li>`).join('')}</ul>` : '') + p(`<span class="muted">Ground: ${esc(name(d, sf))}</span>`);
      return {title: here.length ? name(d, d.obj.sf[here.find(i => d.obj.z[i] < cut) ?? here[0]]) : name(d, sf), body, links: []};
    };

    return {
      title: 'Serpent Isle', subtitle: `Ultima VII Part Two · cutoff lift ${cut} · ${hh(hour)}`, width: N, height: N, native: 8, draw, cell,
      features: people.map(n => ({name: pname(n), x: n.px, y: n.py, detail: n.act != null ? ACT[n.act] : ''})),
      svg: svgDoc(N, N, g('grid', `<path d="${Array.from({length: CH - 1}, (_, i) => `M${(i + 1) * 16} 0V${N}M0 ${(i + 1) * 16}H${N}`).join('')}" stroke="#fff" stroke-width=".5" opacity=".25" fill="none"/>`)),
      info: `<h3>Serpent Isle</h3><p>3072 × 3072 tiles, drawn as you pan from the game’s chunk map (${d.map.length} chunk slots built from ${d.chunks.length / 256} reusable chunks) and its ${d.obj.x.length.toLocaleString()} objects as a new game starts.</p>
        <p>Height cutoff ${cut}: objects at lift ${cut} or higher are left out${cut <= 5 ? ', which takes the roofs off' : ''}. Click a square for every object on it and its lift.</p>
        <p class="muted">Draw order is a simple one (lift, then distance), so a few overlaps differ from the game.</p>`,
      layers: [{id: 'objects', name: 'Objects'}, {id: 'people', name: 'People'}, {id: 'grid', name: 'Chunk grid', swatch: gridSwatch, on: false}],
    };
  },
};
