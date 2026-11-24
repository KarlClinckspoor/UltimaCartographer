// The Ultima VI engine (Ultima VI, The Savage Empire, Martian Dreams): maps drawn in the browser, a
// grid tile at a time, from the game's own chunk map and object blocks (data/<game>, by
// tools/extract-u6.mjs). Formats and rules: u6-decompiled SRC (map.c, object.c, npctrack.c, objcmd.c).
import {esc, g, svgDoc, swatch, ring, label, gridLines, gridSwatch, p, image} from '../../lib/draw.js';

const DOUBLE_H = 0x40, DOUBLE_W = 0x80, BACKGROUND = 0x20;   // TileFlag / TileFlag2 bits (u6.h)
const LOCXYZ = 0, CONTAINED = 8, INVISIBLE = 2;
const hh = h => `${String(h).padStart(2, '0')}:00`;
const cap = s => s.replace(/^\w/, c => c.toUpperCase());
const clean = s => (s || '').replace(/\\(\w*)/g, '').replace(/\/\w*/g, '').trim();

// objlist (console.c GAME_Load): the arrays for objects 0-FFh (the NPCs), then the game state.
const OL = {status: 0, pos: 0x100, shape: 0x400, amount: 0x600, orig: 5617, state: 7153};

export function makeEngine(cfg) {
  const DATA = new URL(`../../../data/${cfg.id}/`, import.meta.url);
  let loading = null, meta = null;

  const load = () => loading ||= (async () => {
    const bin = n => fetch(new URL(n, DATA)).then(r => { if (!r.ok) throw new Error(`data/${cfg.id}/${n} is missing: run tools/extract-u6.mjs`); return r.arrayBuffer(); }).then(b => new Uint8Array(b));
    const [d, sheet, map, chunks, objblk, dngblk, objlist] = await Promise.all([
      fetch(new URL(`${cfg.id}.json`, DATA)).then(r => { if (!r.ok) throw new Error(`data/${cfg.id}/${cfg.id}.json is missing: run tools/extract-u6.mjs`); return r.json(); }),
      image(new URL('tiles.png', DATA)), bin('map.bin'), bin('chunks.bin'), bin('objblk.bin'), bin('dngblk.bin'), bin('objlist.bin')]);
    Object.assign(d, {sheet, map, chunks, objlist, ground: [], objs: [[], [], [], [], [], []], at: [new Map(), new Map(), new Map(), new Map(), new Map(), new Map()]});
    const u16 = (b, o) => b[o] | b[o + 1] << 8;
    d.u16 = u16;
    // object blocks: a count, then 8-byte records (status, x/y/z in 3 bytes, type | frame << 10, quantity, quality)
    const all = [];
    const blocks = (b, n) => { let o = 0; for (let k = 0; k < n && o < b.length; k++) { const cnt = u16(b, o), recs = []; o += 2; for (let i = 0; i < cnt; i++, o += 8) recs.push(rec(b, o)); for (const r of recs) if ((r.status & 0x18) === CONTAINED) { const c = recs[r.assoc]; if (c) (c.contents ||= []).push(r); } all.push(...recs); } };
    const rec = (b, o) => { const st = b[o], s = u16(b, o + 4); return {status: st, x: u16(b, o + 1) & 0x3FF, y: (u16(b, o + 2) >> 2) & 0x3FF, z: b[o + 3] >> 4, assoc: u16(b, o + 1), type: s & 0x3FF, frame: s >> 10, qty: b[o + 6], qual: b[o + 7]}; };
    blocks(objblk, 64); blocks(dngblk, 5);
    d.inventory = new Map();
    for (const r of all) {
      const use = r.status & 0x18;
      if (use === LOCXYZ) { if (r.z <= 5) { d.objs[r.z].push(r); place(d, r); } }
      else if (use !== CONTAINED) { if (!d.inventory.has(r.assoc)) d.inventory.set(r.assoc, []); d.inventory.get(r.assoc).push(r); }
    }
    // NPCs 1-FFh with a shape
    d.npcs = [];
    for (let n = 1; n < 256; n++) {
      const s = u16(objlist, OL.shape + n * 2);
      if (!s) continue;
      const o = OL.pos + n * 3, st = objlist[OL.status + n];
      if ((st & 0x18) !== LOCXYZ) continue;
      d.npcs.push({n, type: s & 0x3FF, frame: s >> 10, x: u16(objlist, o) & 0x3FF, y: (u16(objlist, o + 1) >> 2) & 0x3FF, z: objlist[o + 2] >> 4, sched: d.schedule[n] || []});
    }
    d.moonstones = !cfg.moonstones ? [] : Array.from({length: 8}, (_, i) => { const o = OL.state + 0x2A + i * 6; return {x: u16(objlist, o), y: u16(objlist, o + 2), z: u16(objlist, o + 4)}; }).filter(m => m.x || m.y);
    d.cache = {};
    return d;
  })();

  const tileOf = (d, r) => d.baseTile[r.type] + r.frame;
  // An object on (x, y) also covers the square left of it (double width), above it (double height), or the three (both).
  function place(d, r) {
    const t = tileOf(d, r), f = d.tileFlag[t] || 0, parts = [[0, 0, 0]];
    if ((f & DOUBLE_W) && (f & DOUBLE_H)) parts.push([-1, 0, 1], [0, -1, 2], [-1, -1, 3]);
    else if (f & DOUBLE_W) parts.push([-1, 0, 1]);
    else if (f & DOUBLE_H) parts.push([0, -1, 1]);
    const W = r.z ? 256 : 1024;
    for (const [dx, dy, k] of parts) {
      const key = ((r.y + dy) & (W - 1)) * W + ((r.x + dx) & (W - 1)), m = d.at[r.z];
      if (!m.has(key)) m.set(key, []);
      m.get(key).push({r, tile: t - k, part: k});
    }
  }

  // Ground: chunk indexes of 12 bits, 2 in 3 bytes; the surface in 8 x 8 superchunks of 16 x 16 chunks, levels 1-5 of 32 x 32 (map.c getChunkIdxAt).
  function ground(d, z) {
    if (d.ground[z]) return d.ground[z];
    const W = z ? 256 : 1024, out = new Uint8Array(W * W), {map, chunks} = d;
    for (let cy = 0; cy < W / 8; cy++) for (let cx = 0; cx < W / 8; cx++) {
      let base, pos;
      if (z) { base = 0x6000 + (z - 1) * 0x600; pos = cy * 32 + cx; }
      else { base = ((cx >> 4) + ((cy >> 4) << 3)) * 0x180; pos = (cy & 15) * 16 + (cx & 15); }
      const o = base + pos + (pos >> 1), v = map[o] | map[o + 1] << 8, idx = pos & 1 ? v >> 4 : v & 0xFFF;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[(cy * 8 + y) * W + cx * 8 + x] = chunks[idx * 64 + y * 8 + x];
    }
    return d.ground[z] = out;
  }

  // The schedule entry in force at an hour: the latest hour reached (npctrack.c: hour | weekday << 5; weekday 0 = every day).
  function slotAt(sched, hour) {
    const any = sched.filter(e => !(e[0] >> 5)), list = any.length ? any : sched;
    let best = null, ago = 99;
    for (const e of list) { const a = (hour - (e[0] & 31) + 24) % 24; if (a < ago) { ago = a; best = e; } }
    return best;
  }
  const npcAt = (n, hour) => { const e = n.sched.length ? slotAt(n.sched, hour) : null; return e ? {x: e[2], y: e[3], z: e[4], action: e[1]} : {x: n.x, y: n.y, z: n.z, action: null}; };
  const ACTION = {0x87: 'stands', 0x88: 'stands', 0x89: 'stands', 0x8A: 'stands', 0x8B: 'keeps guard', 0x8C: 'keeps guard', 0x8D: 'keeps guard', 0x8E: 'keeps guard',
    0x8F: 'wanders', 0x90: 'loiters', 0x91: 'sleeps', 0x92: 'sits', 0x93: 'eats', 0x94: 'farms', 0x95: 'works', 0x96: 'works', 0x97: 'plays music', 0x98: 'begs', 0x99: 'works', 0x9A: 'bell ringing', 0x9B: 'brawls', 0x9C: 'mops', 0x0E: 'stays put', 0x0F: 'patrols east-west', 0x10: 'patrols north-south'};

  const tname = (d, t) => cap(clean(d.look[t]) || `tile ${t}`);
  const oname = (d, r) => tname(d, tileOf(d, r) - 0);

  function itemLine(d, r, depth = 0) {
    let s = esc(oname(d, r));
    if (r.qty > 1) s += ` (${r.qty})`;
    if (r.status & INVISIBLE) s += ' <span class="muted">(invisible)</span>';
    if (cfg.note) s += cfg.note(r);
    if (r.contents && depth < 3) s += `<ul>${r.contents.map(c => `<li>${itemLine(d, c, depth + 1)}</li>`).join('')}</ul>`;
    return s;
  }
  // Text between < and > is in runes, where [ ] _ ^ \ stand for TH, NG, ST, EA, EE (the street signs: <BELLRI]ER LANE>);
  // lower case inside them is Gargish. & breaks a line.
  const runes = t => t.replace(/<([^>]*)>/g, (m, r) => /[a-z]/.test(r) ? `‹${r}›` : r.replace(/\[/g, 'TH').replace(/\]/g, 'NG').replace(/_/g, 'ST').replace(/\^/g, 'EA').replace(/\\/g, 'EE'));
  const isReadable = r => (cfg.bookTypes.includes(r.type) || cfg.signTypes.includes(r.type)) && r.qual > 0;
  const bookHTML = (d, r) => { const t = d.books[r.qual - 1]; return t ? `<p class="sign">${esc(runes(t)).replace(/&amp;|\*/g, '<br>').replace(/\n/g, '<br>')}</p>` : ''; };

  function fmtTalk(s) {
    if (cfg.ampQuote) s = s.replace(/&/g, '”');   // Martian Dreams writes a closing quote as &
    return esc(s).replace(/\$P/g, '<i>(your name)</i>').replace(/\$G/g, '<i>(milord/milady)</i>').replace(/\$[A-Z]/g, '…').replace(/#[A-Z0-9]+/g, '…')
      .replace(/@(\w+)/g, '<b>$1</b>').replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function talkHTML(t) {
    const row = (k, v, c) => `<tr><th>${esc(k)}</th><td>${fmtTalk(v)}${c ? ' <span class="tag">depends</span>' : ''}</td></tr>`;
    return (t.hello ? p(`<i>${fmtTalk(t.hello)}</i>`) : '') + `<table>${t.qa.map(q => row(q.k.join(', '), q.a, q.c)).join('')}</table>` +
      '<p class="muted">Keywords match on their first four letters. “Depends”: what follows changes with the story.</p>';
  }

  // Level links: up/down through a ladder, hole or mine shaft (map.c PartyChangeLevel).
  function levelLink(d, r) {
    const up = r.z && (r.z === 5 || (r.type === cfg.objLadder && r.frame === 1));
    let x = r.x, y = r.y, z = r.z + (up ? -1 : 1);
    if (z === 1 && !up) { x = ((x >> 2) & 0xF8) + (x & 7); y = ((y >> 2) & 0xF8) + (y & 7); }
    else if (z === 0 && up) { x = ((x << 2) & 0x3E0) + (x & 7) + (r.qual & 1 ? 8 : 0) + (r.qual & 2 ? 16 : 0); y = ((y << 2) & 0x3E0) + (y & 7) + (r.qual & 4 ? 8 : 0) + (r.qual & 8 ? 16 : 0); }
    if (z < 0 || z > 5) return null;
    return {label: `${up ? 'Up' : 'Down'} to ${cfg.levels[z]}`, map: `L${z}`, focus: [x, y]};
  }

  // The later games: an entrance's type and quality pick its destination from a table (map.c of each).
  function entranceLink(r) {
    const t = cfg.entrance(r);
    return t ? {label: `To ${cfg.levels[t[2]]}`, map: `L${t[2]}`, focus: [t[0], t[1]]} : null;
  }

  async function render(mapId, params) {
    const d = await load();
    meta = d;
    const z = Math.max(0, Math.min(5, +(/^L(\d)$/.exec(mapId || '') || [0, 0])[1])), W = z ? 256 : 1024;
    const hour = Math.max(0, Math.min(23, params.hour ?? cfg.startHour));
    const gr = ground(d, z), at = d.at[z];
    const people = d.npcs.map(n => ({...n, now: npcAt(n, hour)})).filter(n => n.now.z === z);
    const peopleAt = new Map();
    for (const n of people) {
      const t = d.baseTile[n.type] + n.frame, f = d.tileFlag[t] || 0, parts = [[0, 0, 0]];
      if ((f & DOUBLE_W) && (f & DOUBLE_H)) parts.push([-1, 0, 1], [0, -1, 2], [-1, -1, 3]); else if (f & DOUBLE_W) parts.push([-1, 0, 1]); else if (f & DOUBLE_H) parts.push([0, -1, 1]);
      for (const [dx, dy, k] of parts) { const key = ((n.now.y + dy) & (W - 1)) * W + ((n.now.x + dx) & (W - 1)); if (!peopleAt.has(key)) peopleAt.set(key, []); peopleAt.get(key).push({n, tile: t - k, part: k}); }
    }
    const sheet = d.sheet, avg = d.avg;
    const drawn = (list, off) => list.filter(e => !(e.r.status & INVISIBLE) && (!cfg.hidden.includes(e.r.type)) && !off.has('objects'));
    const order = list => [...list.filter(e => d.tileFlag2[e.tile] & BACKGROUND), ...list.filter(e => !(d.tileFlag2[e.tile] & BACKGROUND))];

    function draw(cv, x0, y0, span, off) {
      const ctx = cv.getContext('2d'), scale = 256 / span;
      const xa = Math.max(0, Math.floor(x0)), ya = Math.max(0, Math.floor(y0)), xb = Math.min(W, Math.ceil(x0 + span)), yb = Math.min(W, Math.ceil(y0 + span));
      if (xa >= xb || ya >= yb) return;
      if (scale >= 4) {
        ctx.imageSmoothingEnabled = scale < 16;
        const blit = (t, x, y) => ctx.drawImage(sheet, (t % 32) * 16, (t >> 5) * 16, 16, 16, (x - x0) * scale, (y - y0) * scale, scale, scale);
        for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) blit(gr[y * W + x], x, y);
        for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
          const list = at.get(y * W + x);
          if (list) for (const e of order(drawn(list, off))) blit(e.tile, x, y);
          const pl = !off.has('people') && peopleAt.get(y * W + x);
          if (pl) for (const e of pl) blit(e.tile, x, y);
        }
        return;
      }
      // far out: each pixel takes the colour of the square under it (the top object's if it covers most of the square)
      const img = ctx.createImageData(256, 256), px = img.data;
      for (let py = 0; py < 256; py++) {
        const y = Math.floor(y0 + py / scale);
        if (y < 0 || y >= W) continue;
        for (let qx = 0; qx < 256; qx++) {
          const x = Math.floor(x0 + qx / scale);
          if (x < 0 || x >= W) continue;
          let c = avg[gr[y * W + x]];
          const list = at.get(y * W + x);
          if (list) for (const e of drawn(list, off)) { const a = avg[e.tile]; if (a[3] > 40) c = a; }
          const pl = !off.has('people') && peopleAt.get(y * W + x);
          if (pl) c = [255, 240, 200, 100];
          const o = (py * 256 + qx) * 4;
          px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // Labels: entrances named by their quality (npctrack.c DungeonNames), moongates, readable signs.
    const parts = {names: '', gates: '', signs: '', talkers: ''}, features = [];
    for (const r of d.objs[z]) {
      if (cfg.entranceTypes.includes(r.type) && r.qual && cfg.dungeonNames?.[r.qual - 1] && !z) {
        const nm = cfg.dungeonName(r.qual);
        parts.names += label(r.x + .5, r.y - .3, nm, 1.4, '#ffb0a0');
        features.push({name: nm, x: r.x, y: r.y, detail: 'entrance'});
      }
      if (cfg.signTypes.includes(r.type) && r.qual && d.books[r.qual - 1]) {
        parts.signs += ring(r.x, r.y, '#f4efe0', '.12 .08', .1);
        features.push({name: runes(d.books[r.qual - 1]).replace(/[*&\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60), x: r.x, y: r.y, detail: 'sign'});
      }
      if (r.type === cfg.objRedGate && r.qual) features.push({name: 'Red moongate', x: r.x, y: r.y, detail: 'gate'});
    }
    for (const m of d.moonstones) if (m.z === z) { parts.gates += ring(m.x, m.y, '#b48cff', '', .14); features.push({name: 'Moongate (moonstone)', x: m.x, y: m.y, detail: 'gate'}); }
    for (const n of people) {
      const t = d.talk[n.n];
      if (t) { parts.talkers += ring(n.now.x, n.now.y, '#8cc6e0'); features.push({name: t.name, x: n.now.x, y: n.now.y, detail: (t.qa.find(q => q.k.includes('job'))?.a || '').slice(0, 80)}); }
    }

    const cell = (x, y) => {
      const key = y * W + x, links = [];
      // a double-width or double-height object or person also covers the squares left of and above its own: a click
      // there shows it, as on its own square, and outlines both squares
      if (!(peopleAt.get(key) || []).some(e => !e.part) && !(at.get(key) || []).some(e => e.part === 0)) {
        const pe = (peopleAt.get(key) || []).find(e => e.part), oe = (at.get(key) || []).find(e => e.part);
        const [ax, ay] = pe ? [pe.n.now.x, pe.n.now.y] : oe ? [oe.r.x, oe.r.y] : [];
        if (ax != null && (ax !== x || ay !== y)) {
          const c = cell(ax, ay);
          return c && {...c, box: [Math.min(x, ax), Math.min(y, ay), Math.abs(ax - x) + 1, Math.abs(ay - y) + 1]};
        }
      }
      let body = '', title = tname(d, gr[key]);
      for (const e of peopleAt.get(key) || []) {
        if (e.part) continue;
        const n = e.n, t = d.talk[n.n];
        title = t ? t.name : tname(d, e.tile);
        body += `<p class="muted">${esc(tname(d, e.tile))}${n.now.action != null && ACTION[n.now.action] ? ` · ${ACTION[n.now.action]}` : ''}${t && t.look ? ` · ${esc(t.look)}` : ''}</p>`;
        if (n.sched.length) {
          body += `<p class="muted">${n.sched.map(s => `${s[0] >> 5 ? `day ${s[0] >> 5}, ` : ''}${hh(s[0] & 31)}: ${s[2]}, ${s[3]}${s[4] !== z ? ` (${esc(cfg.levels[s[4]])})` : ''}${ACTION[s[1]] ? `, ${ACTION[s[1]]}` : ''}`).join('<br>')}</p>`;
          for (const s of n.sched) if (s[2] !== x || s[3] !== y || s[4] !== z) links.push({label: `At ${hh(s[0] & 31)}`, map: `L${s[4]}`, params: {hour: s[0] & 31}, focus: [s[2], s[3]]});
        }
        const inv = d.inventory.get(n.n);
        if (inv && inv.length) body += p(`Carries: ${inv.map(r => itemLine(d, r)).join(', ')}`);
        if (t) body += talkHTML(t);
      }
      const list = (at.get(key) || []).filter(e => e.part === 0);
      if (list.length) {
        const items = [...list].reverse();
        body += `<ul>${items.map(e => `<li>${itemLine(d, e.r)}${isReadable(e.r) ? bookHTML(d, e.r) : ''}</li>`).join('')}</ul>`;
        if (!(peopleAt.get(key) || []).some(e => !e.part)) title = oname(d, items[0].r);
        for (const e of items) {
          const r = e.r;
          if (r.type === cfg.objLadder || cfg.entranceTypes.includes(r.type)) { const l = cfg.entrance ? entranceLink(r) : levelLink(d, r); if (l) links.push(l); if (!z && r.qual && cfg.dungeonNames?.[r.qual - 1]) body = p(`<b>${esc(cfg.dungeonName(r.qual))}</b>`) + body; }
          if (r.type === cfg.objRedGate && r.qual && cfg.redGates[r.qual - 1]) { const [gx, gy, gz] = cfg.redGates[r.qual - 1]; links.push({label: 'Where this red gate leads', map: `L${gz}`, focus: [gx, gy]}); }
          if (r.type === cfg.objEgg) body += p('<span class="muted">An egg: creatures hatch here when you come near (what it holds is listed).</span>');
        }
      }
      if (d.moonstones.some(m => m.x === x && m.y === y && m.z === z)) body += p('<b>Moongate.</b> A moonstone lies buried here when the game starts; the blue gate on it is reached by the Orb of the Moons and by the moons’ phases.');
      return {title, body, links};
    };

    const info = `<h3>${esc(cfg.levels[z])}</h3>
      <p>${W} × ${W} squares, drawn from the game’s map and objects as they are when a game starts. People stand where their schedule puts them at ${hh(hour)}.</p>
      <p class="muted">Click a square for everything on it: containers show what they hold, signs and books their text, ladders and holes where they lead, people their day and conversation.</p>`;
    return {
      title: cfg.levels[z], subtitle: `${cfg.title} · ${hh(hour)}`, width: W, height: W, native: 16, wrap: true, draw, cell, features, info,
      coords: cfg.coords && cfg.coords(z) ? (x, y) => cfg.coords(z)(x, y) : null,
      svg: svgDoc(W, W, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(W, W))),
      layers: [{id: 'objects', name: 'Objects'}, {id: 'people', name: 'People'}, {id: 'talkers', name: 'People who talk', swatch: swatch(ring(0, 0, '#8cc6e0'))},
        {id: 'names', name: 'Entrance names', swatch: swatch(label(.5, .8, 'A', .9, '#ffb0a0'))}, {id: 'gates', name: 'Moongates', swatch: swatch(ring(0, 0, '#b48cff', '', .14))},
        {id: 'signs', name: 'Signs', swatch: swatch(ring(0, 0, '#f4efe0', '.12 .08'))}, {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
    };
  }

  return {
    id: cfg.id, title: cfg.title, version: cfg.version,
    params: [{key: 'hour', label: 'Hour of the day', def: cfg.startHour, min: 0, max: 23, help: 'People keep daily schedules. 0 is midnight.'}],
    transient: [], defaultMap: 'L0',
    maps() { return cfg.levels.map((name, z) => ({id: `L${z}`, name})); },
    render,
    _meta: () => meta,
  };
}
