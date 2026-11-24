// Ultima Underworld I and II, top down: every level as the Underworld editor's export has it (data/uw1, data/uw2;
// docs/uw-export.md). The picture is the editor's map; tiles.bin and objects.json give what a click shows, and
// teleports (stairs between levels, magic doors) are links. Squares are tiles with north up: square (x, y) is
// tile (x, 63 - y). Each level can also be opened in the 3D viewer (uwviewer/).
import {esc, g, svgDoc, swatch, gridLines, gridSwatch, image, json} from '../../lib/draw.js';

const TYPES = ['solid rock', 'open', 'open to the south-east', 'open to the south-west', 'open to the north-east', 'open to the north-west',
  'slope up to the north', 'slope up to the south', 'slope up to the east', 'slope up to the west'];
const C = {tele: '#f2b33d', arrive: '#5ec8e8', start: '#7ee081'};
const cap = s => String(s).replace(/^\w/, c => c.toUpperCase());
const flat = c => typeof c === 'string' ? esc(c) : `${esc(c.name)}${c.contents?.length ? ` (${c.contents.map(flat).join(', ')})` : ''}`;

export function makeUW(cfg) {
  const DATA = new URL(`../../../data/${cfg.id}/`, import.meta.url);
  const HINT = `run UwEditor.Cli export-web --game ${cfg.id} --out data/${cfg.id} (docs/uw-export.md)`;
  let meta = null, loading = null, teleportIndex = null;
  const levels = new Map();
  const load = () => loading ||= json(new URL('manifest.json', DATA), HINT).then(m => (meta = m));
  const level = id => {
    if (!levels.has(id)) levels.set(id, Promise.all([
      fetch(new URL(`levels/${id}/tiles.bin`, DATA)).then(r => { if (!r.ok) throw new Error(`data/${cfg.id}/levels/${id} is missing: ${HINT}`); return r.arrayBuffer(); }),
      json(new URL(`levels/${id}/objects.json`, DATA))]).then(([t, o]) => ({tiles: new Uint8Array(t), objects: o})));
    return levels.get(id);
  };
  const nameOf = id => meta?.levels.find(l => l.id === id)?.name.replace(/ \(\d+\)$/, '') || `Level ${id}`;
  // a link as where it ends: a lever's trigger's link, else the link itself
  const ends = k => k?.kind === 'lever' ? ends(k.does) : k;

  return {
    id: cfg.id, title: cfg.title, version: 'PC/GOG version, as a new game starts. Exported by the Underworld editor from the game files.',
    params: [], transient: [], defaultMap: 'L1',
    maps() {
      const list = [{id: '3d', name: 'Open in 3D', href: `uwviewer/#${cfg.id}`, title: 'Fly through the levels in 3D'}];
      if (!meta) return [...list, {id: 'L1', name: 'Level 1'}];
      for (const l of meta.levels) list.push({id: `L${l.id}`, name: l.realm ? nameOf(l.id).replace(`${l.realm} `, '') : String(l.id), title: l.name, group: l.realm || 'Levels'});
      return list;
    },
    async render(mapId, params) {
      const man = await load();
      const id = +String(mapId).replace(/^L/, '');
      const L = man.levels.find(l => l.id === id);
      if (!L) throw new Error(`no level ${mapId}`);
      const [lv, pic] = await Promise.all([level(id), image(new URL(`levels/${id}/map.png`, DATA))]);
      const O = lv.objects, T = lv.tiles;
      const tile = (tx, ty) => { const o = (ty * 64 + tx) * 8; return {type: T[o], floor: T[o + 1], flags: T[o + 6]}; };
      const onTile = new Map();
      O.forEach((o, i) => { if (o && o.in == null) { const k = o.y * 64 + o.x; if (!onTile.has(k)) onTile.set(k, []); onTile.get(k).push(i); } });

      // teleports from here, and the places other levels' teleports arrive on this one (needs their objects)
      const out = [];
      O.forEach((o, i) => { const k = ends(o?.link); if (k?.kind === 'teleport') out.push({i, o, k}); });
      // where they arrive: from teleports.json (tools/index-uw.mjs), else from every level's objects
      const arrive = new Map(), arriveAt = (from, x, y) => { const key = y * 64 + x; if (!arrive.has(key)) arrive.set(key, new Set()); arrive.get(key).add(from); };
      const index = await (teleportIndex ||= fetch(new URL('teleports.json', DATA)).then(r => r.ok ? r.json() : null).catch(() => null));
      if (index) for (const [from, to, x, y] of index) { if (to === id) arriveAt(from, x, y); }
      else {
        const others = await Promise.all(man.levels.filter(l => l.id !== id).map(l => level(l.id).then(v => ({l, v}))));
        for (const {l, v} of [{l: L, v: lv}, ...others]) v.objects.forEach(o => { const k = ends(o?.link); if (k?.kind === 'teleport' && k.level === id) arriveAt(l.id, k.x, k.y); });
      }
      const sq = (tx, ty) => [tx, 63 - ty];
      let tele = '', arr = '', start = '';
      const seen = new Set();
      for (const {o} of out) { const k = o.y * 64 + o.x; if (seen.has(k)) continue; seen.add(k); const [x, y] = sq(o.x, o.y); tele += `<circle cx="${x + .5}" cy="${y + .5}" r=".32" fill="${C.tele}" stroke="#111" stroke-width=".08"/>`; }
      for (const [k] of arrive) { const [x, y] = sq(k % 64, k >> 6); arr += `<circle cx="${x + .5}" cy="${y + .5}" r=".38" fill="none" stroke="${C.arrive}" stroke-width=".12"/>`; }
      if (L.start) { const [x, y] = sq(Math.floor(L.start.x), Math.floor(L.start.z)); start = `<path d="M${x + .5} ${y + .12}L${x + .85} ${y + .85}L${x + .15} ${y + .85}z" fill="${C.start}" stroke="#111" stroke-width=".06"/>`; }
      const svg = svgDoc(64, 64, g('grid', gridLines(64, 64)) + g('arrive', arr) + g('teleports', tele) + g('start', start));

      const linkLine = k => {
        if (!k) return '';
        if (k.kind === 'teleport') return `Takes you to ${esc(k.level === id ? 'another place on this level' : nameOf(k.level))} (${k.x}, ${k.y}).`;
        if (k.kind === 'lever') return `Works ${esc(O[k.object]?.name || 'a trigger')}${k.does ? `: ${linkLine(k.does)}` : '.'}`;
        return k.text ? esc(cap(k.text)) + (k.text.endsWith('.') ? '' : '.') : '';
      };
      const objHtml = o => {
        const bits = [];
        if (o.critter) bits.push(`${esc(cap(o.critter.attitude || ''))}${o.critter.hp != null ? `, ${o.critter.hp} hit points` : ''}${o.critter.talksAs ? `; talks as ${esc(o.critter.talksAs)}` : ''}`);
        if (o.desc) bits.push(esc(cap(o.desc)));
        if (o.lock) bits.push(`${o.lock.locked ? 'Locked' : 'Unlocked'}${o.lock.key ? `; opened by ${esc(o.lock.key)}` : ''}`);
        if (o.contents?.length) bits.push(`Holds ${o.contents.map(flat).join(', ')}`);
        if (o.text) bits.push(`“${esc(o.text.trim())}”`);
        const l = linkLine(o.link); if (l) bits.push(l);
        if (o.flags?.length) bits.push(`<span class="muted">${esc(o.flags.join(', '))}</span>`);
        return `<li><b>${esc(cap(o.name))}</b>${bits.length ? `<br>${bits.join('<br>')}` : ''}</li>`;
      };
      const viewer = (tx, ty) => `uwviewer/#${cfg.id}/${id}/${tx + .5},${ty + .5}`;   // relative to the site's page

      const cell = (x, y) => {
        const tx = x, ty = 63 - y, t = tile(tx, ty), list = (onTile.get(ty * 64 + tx) || []).map(i => O[i]);
        const links = [];
        for (const o of list) { const k = ends(o.link); if (k?.kind === 'teleport') links.push({label: k.level === id ? 'Where it leads' : `To ${nameOf(k.level)}`, map: `L${k.level}`, focus: sq(k.x, k.y)}); }
        const from = arrive.get(ty * 64 + tx);
        if (from) for (const l of from) if (l !== id) links.push({label: `Back to ${nameOf(l)}`, map: `L${l}`});
        const shown = list.filter(o => !o.flags?.includes('invisible') || o.link || o.desc);
        const flags = [t.flags & 1 && 'a door', t.flags & 4 && 'magic does not work here'].filter(Boolean);
        const body = `<p class="muted">${esc(cap(TYPES[t.type] || `type ${t.type}`))}${t.type ? `, floor height ${t.floor}` : ''}${flags.length ? ` · ${flags.join(', ')}` : ''}</p>` +
          (shown.length ? `<ul>${shown.slice(0, 14).map(objHtml).join('')}</ul>${shown.length > 14 ? `<p class="muted">and ${shown.length - 14} more</p>` : ''}` : '') +
          (from ? `<p>Arrive here from ${esc([...from].map(l => l === id ? 'elsewhere on this level' : nameOf(l)).join(', '))}.</p>` : '') +
          (t.type ? `<p><a href="${viewer(tx, ty)}" target="_blank">Open here in 3D</a></p>` : '');
        const main = shown.find(o => o.critter) || shown.find(o => o.link) || shown[0];
        return {title: main ? cap(main.name) : cap(TYPES[t.type] || 'tile'), body, links};
      };

      // where "Open this level in 3D" puts you: the new-game start, else the open tile nearest the middle (not rock)
      const entry = L.start ? [Math.floor(L.start.x), Math.floor(L.start.z)] : (() => {
        for (let r = 0; r < 32; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && tile(32 + dx, 32 + dy).type) return [32 + dx, 32 + dy];
        return [32, 32];
      })();
      const features = [];
      O.forEach(o => { if (o && o.in == null && o.name && !o.flags?.includes('invisible')) features.push({name: cap(o.name), x: o.x, y: 63 - o.y, detail: o.critter ? 'creature' : o.text ? 'writing' : ''}); });
      return {
        title: L.name.replace(/ \(\d+\)$/, ''), subtitle: cfg.title, width: 64, height: 64, native: 16, images: [{src: pic, layer: 'map'}], svg, cell, features,
        info: `<h3>${esc(L.name.replace(/ \(\d+\)$/, ''))}</h3>
          <p>64 × 64 tiles, north up, as the Underworld editor draws the map: everything on the level, not only what a player has seen. ${L.objects} objects.</p>
          <p>Amber dots are teleports and stairs to other levels: click one to follow it. Blue rings are where they arrive.${L.start ? ' The green arrow is where a new game begins.' : ''}</p>
          <p><a href="${viewer(...entry)}" target="_blank">Open this level in 3D</a></p>`,
        layers: [
          {id: 'map', name: 'Map'},
          {id: 'teleports', name: 'Teleports and stairs', swatch: swatch(`<circle cx=".5" cy=".5" r=".3" fill="${C.tele}" stroke="#111" stroke-width=".08"/>`)},
          {id: 'arrive', name: 'Arrivals', swatch: swatch(`<circle cx=".5" cy=".5" r=".3" fill="none" stroke="${C.arrive}" stroke-width=".12"/>`)},
          ...(L.start ? [{id: 'start', name: 'New-game start', swatch: swatch(`<path d="M.5 .12L.85 .85L.15 .85z" fill="${C.start}"/>`)}] : []),
          {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false},
        ],
      };
    },
  };
}
