// Ultima VIII: Pagan. Every map as u8edit draws it, baked by u8edit's web export (data/u8, docs/u8-export.md):
// items in the game's own draw order, already in screen pixels, so drawing a piece of the map is walking the
// list and placing pictures from the atlas. One map unit here is one screen pixel.
import {esc, g, svgDoc, swatch, canvas, image, json} from '../../lib/draw.js';

const DATA = new URL('../../../data/u8/', import.meta.url);
const HINT = 'run u8edit --export-web data/u8 (docs/u8-export.md)';
const NONE = 0xFFFFFFFF, BIN = 512;
const SOURCES = ['fixed', 'movable', 'glob', 'npc'];
const C = {out: '#f2b33d', in: '#5ec8e8', node: '#c9a45c', usecode: '#c78bd8'};

let meta = null, loading = null;
const load = () => loading ||= (async () => {
  const man = await json(new URL('manifest.json', DATA), HINT);
  const [frames, shapes, graph, ...atlas] = await Promise.all([
    fetch(new URL('frames.bin', DATA)).then(r => r.arrayBuffer()), json(new URL('shapes.json', DATA)), json(new URL('graph.json', DATA)),
    ...man.atlas.map(a => image(new URL(a.file, DATA)))]);
  const v = new DataView(frames), n = man.frames;
  const F = {page: new Uint8Array(n), x: new Uint16Array(n), y: new Uint16Array(n), w: new Uint16Array(n), h: new Uint16Array(n), left: new Int16Array(n), top: new Int16Array(n), shape: new Uint16Array(n)};
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    F.page[i] = v.getUint8(o); F.x[i] = v.getUint16(o + 2, true); F.y[i] = v.getUint16(o + 4, true); F.w[i] = v.getUint16(o + 6, true); F.h[i] = v.getUint16(o + 8, true);
    F.left[i] = v.getInt16(o + 10, true); F.top[i] = v.getInt16(o + 12, true); F.shape[i] = v.getUint16(o + 14, true);
  }
  const byId = new Map(man.maps.map(m => [m.id, m]));
  const node = new Map(graph.maps.map(m => [m.id, m]));
  meta = {man, F, shapes, graph, atlas, byId, node, maps: new Map(), alpha: null};
  return meta;
})();

// names for the maps (the export has none yet); a name set in u8edit wins
const NAMES = {3: 'Docks', 4: 'West farmland', 5: 'East Tenebrae to the graveyard', 6: 'Graveyard', 7: 'North Tenebrae to the plateau', 8: 'Plateau',
  12: 'Daemon’s Crag', 14: 'Obsidian Fortress', 15: 'Slayer quest', 16: 'Carthax Lake (before)', 21: 'Stone Cove', 24: 'Lava river (before)', 25: 'Lava river (after)',
  26: 'Carthax Lake (after)', 28: 'Carthax dam', 31: 'Hall of the Mountain King', 37: 'Argentrock Isle', 39: 'West Tenebrae', 40: 'Central Tenebrae', 41: 'East Tenebrae',
  43: 'Ethereal Realm (centre)', 44: 'Ethereal Realm (Pyros)', 45: 'Ethereal Realm (Hydros)', 46: 'Ethereal Realm (Stratos)', 47: 'Ethereal Realm (Lithos)',
  49: 'Catacombs hub', 50: 'Upper catacombs', 51: 'Catacombs gauntlet', 54: 'Zealans', 57: 'Conventicle of the Dead', 62: 'Ancient Necromancers', 63: 'Cozy home'};
const named = id => !!(meta?.node.get(id)?.name || NAMES[id]);
const mapName = id => id === -1 ? 'Usecode (any map)' : meta?.node.get(id)?.name || NAMES[id] || `Map ${id}`;
const mapTitle = id => { const n = meta?.node.get(id), base = `${mapName(id)} (map ${id})`; return n?.people?.length ? `${base}: ${n.people.slice(0, 3).join(', ')}${n.people.length > 3 ? '…' : ''}` : base; };
const cap = s => String(s).replace(/^\w/, c => c.toUpperCase());

// one map's items, binned by screen area so a tile only walks what can touch it
function loadMap(d, id) {
  if (d.maps.has(id)) return d.maps.get(id);
  const p = (async () => {
    const [buf, info] = await Promise.all([fetch(new URL(`maps/${id}/items.bin`, DATA)).then(r => { if (!r.ok) throw new Error(`data/u8/maps/${id}/items.bin is missing: ${HINT}`); return r.arrayBuffer(); }),
      json(new URL(`maps/${id}/info.json`, DATA))]);
    const v = new DataView(buf), n = buf.byteLength / 16, F = d.F, b = d.byId.get(id).bounds;
    const M = {id, n, info, sx: new Int32Array(n), sy: new Int32Array(n), fid: new Uint16Array(n), z: new Uint8Array(n), fl: new Uint8Array(n), ii: new Uint32Array(n),
      bounds: b, bins: new Map(), at: new Map()};
    const lists = new Map();
    for (let i = 0; i < n; i++) {
      const o = i * 16, sx = v.getInt32(o, true), sy = v.getInt32(o + 4, true), f = v.getUint16(o + 8, true);
      M.sx[i] = sx; M.sy[i] = sy; M.fid[i] = f; M.z[i] = v.getUint8(o + 10); M.fl[i] = v.getUint8(o + 11); M.ii[i] = v.getUint32(o + 12, true);
      if (M.ii[i] !== NONE) M.at.set(M.ii[i], i);
      const x0 = sx + F.left[f], y0 = sy + F.top[f];
      for (let by = Math.floor(y0 / BIN); by <= Math.floor((y0 + F.h[f] - 1) / BIN); by++) for (let bx = Math.floor(x0 / BIN); bx <= Math.floor((x0 + F.w[f] - 1) / BIN); bx++) {
        const k = bx + ',' + by; let l = lists.get(k); if (!l) lists.set(k, l = []); l.push(i);
      }
    }
    for (const [k, l] of lists) M.bins.set(k, Uint32Array.from(l));
    return M;
  })();
  d.maps.set(id, p);
  p.catch(() => d.maps.delete(id));
  return p;
}

// the items over a screen rectangle, in draw order
function itemsIn(M, x0, y0, x1, y1) {
  const seen = [];
  for (let by = Math.floor(y0 / BIN); by <= Math.floor((y1 - 1) / BIN); by++) for (let bx = Math.floor(x0 / BIN); bx <= Math.floor((x1 - 1) / BIN); bx++) {
    const l = M.bins.get(bx + ',' + by); if (l) seen.push(l);
  }
  if (seen.length === 1) return seen[0];
  const all = new Uint32Array(seen.reduce((s, l) => s + l.length, 0));
  let o = 0; for (const l of seen) { all.set(l, o); o += l.length; }
  all.sort();
  let w = 0; for (let i = 0; i < all.length; i++) if (!w || all[i] !== all[w - 1]) all[w++] = all[i];
  return all.subarray(0, w);
}

// the atlas pages' alpha, for clicks that should hit what is drawn and not its empty corners
function alphaOf(d) {
  return d.alpha ||= d.atlas.map(img => { const c = canvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; });
}

function renderGraph(d) {
  const nodes = d.graph.maps.filter(m => m.x != null);
  const pad = 120, minX = Math.min(...nodes.map(m => m.x)) - pad, minY = Math.min(...nodes.map(m => m.y)) - pad;
  const W = Math.max(...nodes.map(m => m.x)) - minX + pad, H = Math.max(...nodes.map(m => m.y)) - minY + pad;
  const at = id => { const m = d.node.get(id); return m?.x != null ? [m.x - minX, m.y - minY] : null; };
  // the usecode node (no place on any map) goes at the bottom left
  const pos = id => at(id) || [pad / 2, H - pad / 2];
  let edges = '', marks = '';
  const pairs = new Map();
  for (const t of d.graph.transitions) { const k = `${t.fromMap}>${t.toMap}`; pairs.set(k, (pairs.get(k) || 0) + 1); }
  for (const [k, count] of pairs) {
    const [a, b] = k.split('>').map(Number), [x1, y1] = pos(a), [x2, y2] = pos(b);
    if (a === b) continue;
    const back = pairs.has(`${b}>${a}`), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const bend = back ? 18 : 0, cx = mx - dy / len * bend, cy = my + dx / len * bend;
    const usecode = d.graph.transitions.some(t => t.fromMap === a && t.toMap === b && t.kind !== 'teleportEgg');
    edges += `<path d="M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}" stroke="${usecode ? C.usecode : '#9a9384'}" stroke-width="${Math.min(6, 1.5 + count / 2)}" fill="none" opacity=".7" marker-end="url(#arr)"/>`;
  }
  for (const m of d.graph.maps) {
    const [x, y] = pos(m.id), r = m.id === -1 ? 16 : 10 + Math.sqrt(m.items || 0) / 12;
    marks += `<circle cx="${x}" cy="${y}" r="${r}" fill="${m.exported && named(m.id) ? C.node : '#555'}" stroke="#111" stroke-width="2"/>` +
      `<text x="${x}" y="${y - r - 6}" font-size="22" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" fill="#f4efe0" stroke="#111" stroke-width="4" paint-order="stroke">${esc(mapName(m.id))}</text>`;
  }
  const svg = svgDoc(W, H, `<defs><marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#bbb"/></marker></defs>` +
    g('edges', edges) + g('nodes', marks));
  const cell = (x, y) => {
    let best = null, bd = 50;
    for (const m of d.graph.maps) { const [px, py] = pos(m.id), dd = Math.hypot(px - x, py - y); if (dd < bd) { bd = dd; best = m; } }
    if (!best) return null;
    const out = d.graph.transitions.filter(t => t.fromMap === best.id), into = d.graph.transitions.filter(t => t.toMap === best.id);
    const uniq = l => [...new Set(l)];
    const links = best.exported ? [{label: `Open ${mapName(best.id)}`, map: `m${best.id}`}] : [];
    for (const to of uniq(out.map(t => t.toMap))) if (to !== best.id && d.byId.has(to)) links.push({label: `→ ${mapName(to)}`, map: `m${to}`});
    return {title: mapName(best.id), links, box: [pos(best.id)[0] - 30, pos(best.id)[1] - 30, 60, 60],
      body: `${best.items != null ? `<p>${best.items.toLocaleString()} items${best.people?.length ? `; people: ${esc(best.people.join(', '))}` : ''}</p>` : ''}
        <p class="muted">${out.length} ways out, ${into.length} ways in.</p>`};
  };
  return {
    title: 'How the maps connect', subtitle: 'Ultima VIII · u8edit’s Transitions view', width: W, height: H, svg, cell, hover: false,
    features: d.graph.maps.map(m => { const [x, y] = pos(m.id); return {name: mapName(m.id), x, y, detail: (m.people || []).join(', ')}; }),
    info: `<h3>How the maps connect</h3><p>Every map, laid out as in u8edit’s Transitions view, with an arrow for each way from one to another: grey for teleport eggs, purple for usecode that moves the Avatar.</p>
      <p>Click a map to open it. Bigger circles hold more items; grey ones are unused or unfinished maps.</p>`,
    layers: [{id: 'edges', name: 'Transitions'}, {id: 'nodes', name: 'Maps'}],
  };
}

async function renderMap(d, id, params) {
  const M = await loadMap(d, id), F = d.F, b = M.bounds, info = M.info;
  const W = b.maxX - b.minX, H = b.maxY - b.minY;
  const roof = Math.max(0, Math.min(255, params.roof ?? 255));
  // transitions starting on this map, by the info index of the item that starts them, and those arriving here
  const out = new Map(), into = [];
  for (const t of d.graph.transitions) {
    if (t.fromMap === id && t.fromItem != null) { if (!out.has(t.fromItem)) out.set(t.fromItem, []); out.get(t.fromItem).push(t); }
    if (t.toMap === id) into.push(t);
  }
  const focusOn = t => { const tb = d.byId.get(t.toMap)?.bounds; return tb && t.sx != null ? [t.sx - tb.minX, t.sy - tb.minY] : undefined; };
  const linkFor = t => d.byId.has(t.toMap) ? {label: t.toMap === id ? 'Where it leads' : `To ${mapName(t.toMap)}`, map: `m${t.toMap}`, focus: focusOn(t)} : null;

  const shownFn = off => {
    const src = SOURCES.map(s => !off.has(s)), eggs = !off.has('hidden');
    return i => { const f = M.fl[i]; return src[(f >> 1) & 3] && (f & 8 ? eggs : true) && ((f & 1) || M.z[i] < roof); };
  };
  const drawItems = (ctx, list, shown, ox, oy, sc) => {
    for (const i of list) {
      if (!shown(i)) continue;
      const f = M.fid[i], fl = M.fl[i];
      ctx.globalAlpha = fl & 8 ? 0.5 : fl & 32 ? 0.6 : 1;
      ctx.drawImage(d.atlas[F.page[f]], F.x[f], F.y[f], F.w[f], F.h[f], (M.sx[i] + F.left[f] - ox) * sc, (M.sy[i] + F.top[f] - oy) * sc, F.w[f] * sc, F.h[f] * sc);
    }
    ctx.globalAlpha = 1;
  };
  // far out, tiles are cut from one picture of the whole map at a quarter size
  const overviews = new Map();
  const overview = off => {
    const key = [...off].sort().join();
    if (!overviews.has(key)) {
      const q = 4, c = canvas(Math.ceil(W / q), Math.ceil(H / q)), ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      drawItems(ctx, Array.from({length: M.n}, (_, i) => i), shownFn(off), b.minX, b.minY, 1 / q);
      overviews.set(key, c);
    }
    return overviews.get(key);
  };

  function draw(cv, x0, y0, span, off) {
    const ctx = cv.getContext('2d'), sc = 256 / span;
    if (x0 >= W || y0 >= H || x0 + span <= 0 || y0 + span <= 0) return;
    if (span > 1024) { const o = overview(off); ctx.imageSmoothingEnabled = true; ctx.drawImage(o, x0 / 4, y0 / 4, span / 4, span / 4, 0, 0, 256, 256); return; }
    ctx.imageSmoothingEnabled = sc < 1;
    const ox = b.minX + x0, oy = b.minY + y0;
    drawItems(ctx, itemsIn(M, ox, oy, ox + span, oy + span), shownFn(off), ox, oy, sc);
  }

  // markers: where teleports and usecode moves start (amber) and where they arrive (blue)
  const posOf = ii => { const i = M.at.get(ii); return i == null ? null : [M.sx[i] - b.minX, M.sy[i] - b.minY]; };
  // the drawn pixel of an item's picture nearest its middle (a person lying in bed is hollow in the middle)
  const solidOf = ii => {
    const i = M.at.get(ii); if (i == null) return null;
    const f = M.fid[i], A = alphaOf(d)[F.page[f]], pw = d.atlas[F.page[f]].width, cx = F.w[f] / 2, cy = F.h[f] / 2;
    let best = null, bd = Infinity;
    for (let y = 0; y < F.h[f]; y++) for (let x = 0; x < F.w[f]; x++) {
      if (!A[((F.y[f] + y) * pw + F.x[f] + x) * 4 + 3]) continue;
      const dd = (x - cx) ** 2 + (y - cy) ** 2; if (dd < bd) { bd = dd; best = [x, y]; }
    }
    return best ? [M.sx[i] + F.left[f] + best[0] + .5 - b.minX, M.sy[i] + F.top[f] + best[1] + .5 - b.minY] : midOf(ii);
  };
  // the middle of an item's picture (its hot spot is at its feet, often over the floor)
  const midOf = ii => { const i = M.at.get(ii); if (i == null) return null; const f = M.fid[i]; return [M.sx[i] + F.left[f] + F.w[f] / 2 - b.minX, M.sy[i] + F.top[f] + F.h[f] / 2 - b.minY]; };
  let outs = '', ins = '';
  const R = 9;
  for (const [ii] of out) { const p_ = posOf(ii); if (p_) outs += `<circle cx="${p_[0]}" cy="${p_[1]}" r="${R}" fill="${C.out}" stroke="#111" stroke-width="2.5"/>`; }
  for (const t of into) if (t.sx != null) ins += `<circle cx="${t.sx - b.minX}" cy="${t.sy - b.minY}" r="${R}" fill="none" stroke="${C.in}" stroke-width="3.5"/>`;
  const svg = svgDoc(W, H, g('arrive', ins) + g('leave', outs));

  const infoHtml = (e, ii) => {
    const bits = [];
    if (e.desc) bits.push(`<p>${esc(e.desc)}</p>`);
    if (e.contents?.length) bits.push(`<p class="muted">Holds:</p><ul>${e.contents.map(c => `<li>${esc(typeof c === 'string' ? c : JSON.stringify(c))}</li>`).join('')}</ul>`);
    if (e.npcStats && !e.desc) { const s = e.npcStats; bits.push(`<p>Strength ${s.str}, dexterity ${s.dex}, intelligence ${s.int}, hit points ${s.hp}${s.mana ? `, mana ${s.mana}` : ''}</p>`); }
    if (e.npcStats?.dead) bits.push('<p>Dead.</p>');
    bits.push(`<p class="muted">${esc(cap(e.source === 'npc' ? 'person' : e.source || ''))}${e.class ? ` · ${esc(e.class)}` : ''} · shape ${e.shape}, frame ${e.frame}${e.quality ? ` · quality ${e.quality}` : ''} · world ${e.x}, ${e.y}, height ${e.z}${e.z >= roof ? ' (above the roof cut)' : ''}</p>`);
    return bits.join('');
  };
  const cell = (x, y) => {
    const X = x + b.minX, Y = y + b.minY;
    // a marker first: they sit on invisible eggs that nothing else lets you click
    let hit = null;
    const near = (px, py) => Math.hypot(px - x, py - y) <= R + 2;
    for (const [ii] of out) { const p_ = posOf(ii); if (p_ && near(...p_)) { hit = M.at.get(ii); break; } }
    if (hit == null) for (const t of into) if (t.sx != null && near(t.sx - b.minX, t.sy - b.minY)) {
      const i = t.toItem != null ? M.at.get(t.toItem) : null;
      const from = d.graph.transitions.filter(u => u.toMap === id && u.sx === t.sx && u.sy === t.sy);
      const e = i != null ? info[M.ii[i]] : null;
      return {title: e ? cap(e.name) : 'Arrival point', box: [t.sx - b.minX - R, t.sy - b.minY - R, 2 * R, 2 * R],
        body: `${e ? infoHtml(e) : ''}<p>Arrive here from: ${esc([...new Set(from.map(u => mapName(u.fromMap)))].join(', '))}.</p>`,
        links: [...new Set(from.map(u => u.fromMap))].filter(m => d.byId.has(m) && m !== id).map(m => ({label: `Back to ${mapName(m)}`, map: `m${m}`}))};
    }
    if (hit == null) {
      const A = alphaOf(d), off = new Set(currentOff()), shown = shownFn(off);
      const list = itemsIn(M, X, Y, X + 1, Y + 1);
      for (let k = list.length - 1; k >= 0; k--) {
        const i = list[k]; if (!shown(i)) continue;
        const f = M.fid[i], lx = X - (M.sx[i] + F.left[f]), ly = Y - (M.sy[i] + F.top[f]);
        if (lx < 0 || ly < 0 || lx >= F.w[f] || ly >= F.h[f]) continue;
        const page = d.atlas[F.page[f]];
        if (A[F.page[f]][((F.y[f] + ly) * page.width + F.x[f] + lx) * 4 + 3] === 0) continue;
        // scenery with nothing to say over a person (a blanket over someone in bed): take the person
        if (hit == null) hit = i;
        const named = j => M.ii[j] !== NONE && info[M.ii[j]].name;
        if (((M.fl[i] >> 1) & 3) === 3 && named(i)) { if (!named(hit)) hit = i; break; }
        if (named(hit)) break;
      }
    }
    if (hit == null) return null;
    const i = hit, f = M.fid[i], ii = M.ii[i], e = ii !== NONE ? info[ii] : null;
    const links = (out.get(ii) || []).map(linkFor).filter(Boolean);
    // shapes.json falls back on usecode class names; the shared ones (generic, quality, container) name nothing
    const shapeName = /^(generic|quality|container)$/.test(d.shapes[F.shape[f]] || '') ? null : d.shapes[F.shape[f]];
    const title = cap(e?.name || shapeName || `shape ${F.shape[f]}`);
    const kinds = ['fixed', 'movable', 'glob', 'person'];
    const body = e ? infoHtml(e) : `<p class="muted">${cap(kinds[(M.fl[i] >> 1) & 3])} · shape ${F.shape[f]} · height ${M.z[i]}${M.fl[i] & 8 ? ' · not drawn in the game' : ''}</p>`;
    const usecode = (out.get(ii) || []).filter(t => t.kind !== 'teleportEgg');
    return {title, body: body + (usecode.length ? `<p>Its usecode (${esc(usecode[0].class || '')}) moves the Avatar.</p>` : ''), links,
      box: [M.sx[i] + F.left[f] - b.minX, M.sy[i] + F.top[f] - b.minY, F.w[f], F.h[f]]};
  };

  // what search finds: people, named things, eggs
  const features = [];
  for (let k = 0; k < info.length; k++) {
    const e = info[k], p_ = e.egg ? posOf(k) : e.npc != null ? solidOf(k) : midOf(k); if (!p_ || !e.name) continue;
    features.push({name: cap(e.name), x: p_[0], y: p_[1], detail: e.npc != null ? 'person' : e.egg ? `${e.egg.kind} egg` : e.class || ''});
  }
  const ln = d.node.get(id);
  return {
    title: mapName(id), subtitle: `Ultima VIII${roof < 255 ? ` · roof cut at height ${roof}` : ''}`, width: W, height: H, native: 1, draw, cell, svg, features, hover: false,
    info: `<h3>${esc(mapName(id))}</h3>
      <p>${M.n.toLocaleString()} items as a new game starts, ${d.byId.get(id).drawn.toLocaleString()} of them drawn, in the game’s own order (baked by u8edit).${ln?.people?.length ? ` People: ${esc(ln.people.join(', '))}.` : ''}</p>
      <p>Amber dots start a teleport or a usecode move: click one to follow it. Blue rings are where they arrive. Turn on “Eggs and triggers” to see what the game never draws.</p>
      <p class="muted">Roof cut: items at that height or above are hidden unless always drawn, as u8edit does it; 255 shows everything.</p>`,
    layers: [
      {id: 'fixed', name: 'Fixed items'}, {id: 'movable', name: 'Movable items'}, {id: 'glob', name: 'Globs'}, {id: 'npc', name: 'People and creatures'},
      {id: 'hidden', name: 'Eggs and triggers (not drawn in the game)', on: false},
      {id: 'leave', name: 'Ways out', swatch: swatch(`<circle cx=".5" cy=".5" r=".3" fill="${C.out}" stroke="#111" stroke-width=".08"/>`)},
      {id: 'arrive', name: 'Arrivals', swatch: swatch(`<circle cx=".5" cy=".5" r=".3" fill="none" stroke="${C.in}" stroke-width=".12"/>`)},
    ],
  };
}

// the layers switched off right now (for clicks, which should hit only what is drawn)
let lastOff = new Set();
const currentOff = () => lastOff;

export default {
  id: 'u8', title: 'Ultima VIII', version: 'PC version, as a new game starts. Baked by u8edit from the game files.',
  params: [{key: 'roof', label: 'Roof cut (height)', def: 255, min: 0, max: 255, help: 'Items at this height or higher are hidden unless the game always draws them: lower it to look inside buildings. 255 shows everything.'}],
  transient: [], defaultMap: 'm3',
  maps() {
    const list = [{id: 'graph', name: 'How the maps connect'}];
    if (!meta) return list;
    // maps with no name are unused or unfinished: kept, but in their own list after the rest
    const used = meta.man.maps.filter(m => named(m.id)), unused = meta.man.maps.filter(m => !named(m.id));
    for (const m of used.sort((a, b) => mapName(a.id).localeCompare(mapName(b.id)))) list.push({id: `m${m.id}`, name: mapName(m.id), title: mapTitle(m.id), group: 'Maps'});
    for (const m of unused) list.push({id: `m${m.id}`, name: String(m.id), title: mapTitle(m.id), group: 'Unused and unfinished'});
    return list;
  },
  async render(mapId, params) {
    const d = await load();
    if (mapId === 'graph') return renderGraph(d);
    const id = +String(mapId).replace(/^m/, '');
    if (!d.byId.has(id)) throw new Error(`no map ${mapId}`);
    const v = await renderMap(d, id, params);
    const draw = v.draw;
    v.draw = (cv, x0, y0, span, off) => { lastOff = off; return draw(cv, x0, y0, span, off); };
    return v;
  },
};
