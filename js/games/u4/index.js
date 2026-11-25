// Ultima IV: Britannia, the 16 castles, townes and villages (and Lord British's upper floor), the 8
// dungeons with their rooms, from the game files (data/u4, by tools/extract-u4.mjs). Townsfolk show
// their whole conversation. Mechanics: u4-decompiled-port/docs/MECHANICS.md.
import {esc, g, rect, path, svgDoc, swatch, ring, label, gridLines, gridSwatch, p, canvas, blit, image, json, centredGlyphs} from '../../lib/draw.js';

const DATA = new URL('../../../data/u4/', import.meta.url);

const TOWN_FILES = ['LCB_1', 'LYCAEUM', 'EMPATH', 'SERPENT', 'MOONGLOW', 'BRITAIN', 'JHELOM', 'YEW', 'MINOC', 'TRINSIC', 'SKARA', 'MAGINCIA', 'PAWS', 'DEN', 'VESPER', 'COVE'];
const TALK_FILES = ['LCB', 'LYCAEUM', 'EMPATH', 'SERPENT', 'MOONGLOW', 'BRITAIN', 'JHELOM', 'YEW', 'MINOC', 'TRINSIC', 'SKARA', 'MAGINCIA', 'PAWS', 'DEN', 'VESPER', 'COVE'];
const DUNGEON_FILES = ['DECEIT', 'DESPISE', 'DESTARD', 'WRONG', 'COVETOUS', 'SHAME', 'HYTHLOTH', 'ABYSS'];
const STONES = ['Blue', 'Yellow', 'Red', 'Green', 'Orange', 'Purple', null, null];
const BALL = {damage: [2, 2, 2, 4, 4, 4, 6, 6], str: [0, 0, 5, 0, 5, 5, 5, 0], dex: [0, 5, 0, 5, 5, 0, 5, 0], int: [5, 0, 0, 5, 0, 5, 5, 0]};
const KIND_LABEL = {weapons: 'Weapons', armour: 'Armour', food: 'Food', pub: 'Pub', reagents: 'Reagents', healer: 'Healer', inn: 'Inn', guild: 'Guild', horses: 'Stables', hawkwind: 'Seer'};
// What touching a dungeon's magic orb does (BALL above), as a sentence.
const listAnd = a => a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a.join('');
export const orbText = di => {
  const up = ['strength', 'dexterity', 'intelligence'].filter((s, i) => [BALL.str, BALL.dex, BALL.int][i][di]);
  return `Search, and a chosen character touches it: ${BALL.damage[di]}00 damage${up.length ? `, and +5 ${listAnd(up)}` : ''}. Gone afterwards.`;
};
const MOVE = {0: 'Stands still.', 1: 'Wanders.', 0x80: 'Follows you.', 0xFF: 'Attacks on sight.'};

// Searching the exact square (U4_SRCH.C SearchSpots): location number (0 outdoors), x, y, what.
const SEARCH = [
  [0, 0xB6, 0x36, 'Mandrake root', 'Only when both moons are new.'], [0, 0x64, 0xA5, 'Mandrake root', 'Only when both moons are new.'],
  [0, 0x2E, 0x95, 'Nightshade', 'Only when both moons are new.'], [0, 0xCD, 0x2C, 'Nightshade', 'Only when both moons are new.'],
  [0, 0xB0, 0xD0, 'The Bell of Courage', 'Once.'], [0, 0x2D, 0xAD, 'The Silver Horn', 'Once. Blocks the daemons for 10 turns.'],
  [0, 0x60, 0xD7, 'The Wheel of the H.M.S. Cape', 'Once. Repairs a ship’s hull from 50 to 99.'],
  [0, 0xC5, 0xF5, 'The Skull of Mondain', 'Only when both moons are new.'], [0, 0xE0, 0x85, 'The Black Stone', 'Only when both moons are new (the Moonglow moongate’s square).'],
  [0, 0x40, 0x50, 'The White Stone', 'Once.'],
  [2, 0x06, 0x06, 'The Book of Truth', 'Once.'], [16, 0x16, 0x01, 'The Candle of Love', 'Once.'], [2, 0x16, 0x03, 'The telescope', 'Look at any towne’s map.'],
  [3, 0x16, 0x04, 'Mystic Armour', 'Only with all eight virtues at 0 and none owned.'], [4, 0x08, 0x0F, 'Mystic Weapons', 'Only with all eight virtues at 0 and none owned.'],
  [5, 0x08, 0x06, 'The Rune of Honesty', 'Once.'], [6, 0x19, 0x01, 'The Rune of Compassion', 'Once.'], [7, 0x1E, 0x1E, 'The Rune of Valor', 'Once.'],
  [8, 0x0D, 0x06, 'The Rune of Justice', 'Once.'], [9, 0x1C, 0x1E, 'The Rune of Sacrifice', 'Once.'], [10, 0x02, 0x1D, 'The Rune of Honor', 'Once.'],
  [1, 0x11, 0x08, 'The Rune of Spirituality', 'Once.'], [13, 0x1D, 0x1D, 'The Rune of Humility', 'Once.'],
];
const TERRAIN = {
  0: 'Only ships and the balloon cross deep water.', 1: 'Ships sail it.', 2: 'Shallow water: impassable on foot.', 3: 'Poisons whoever walks through it.',
  8: 'Impassable.', 0x4C: 'Burns whoever walks on it.', 0x44: 'Poisons.', 0x45: 'Impassable.', 0x46: 'Burns.', 0x47: 'Puts you to sleep.',
};

const C = {wall: '#4b4e45', wallTop: '#62665a', floor: '#1b1d18', door: '#d9a441', ladder: '#6cc5d9', chest: '#f0c419', event: '#b48cff',
  shop: '#e0b354', talk: '#8cc6e0', gate: '#b48cff', start: '#ffffff', item: '#6cd98a', room: '#e57aa8', mon: '#e57a7a'};

let loading = null;
const load = () => loading ||= (async () => {
  const [d, tiles, charset] = await Promise.all([json(new URL('u4.json', DATA), 'run tools/extract-u4.mjs'), image(new URL('tiles.png', DATA)), image(new URL('charset.png', DATA))]);
  d.charset = charset; d.glyph = centredGlyphs(charset);
  d.worldBytes = Uint8Array.from(atob(d.world), c => c.charCodeAt(0));
  const hex = h => Uint8Array.from(h.match(/../g), b => parseInt(b, 16));
  for (const t of Object.values(d.towns)) t.bytes = hex(t.cells);
  for (const dn of Object.values(d.dungeons)) { dn.bytes = hex(dn.cells); for (const r of dn.rooms) r.bytes = hex(r.map); }
  d.tiles = tiles; d.cache = {};
  return d;
})();

const tname = (d, t) => (d.tileNames[t] || `tile ${t}`).toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).replace(/ [nsew]$/, '').replace(/ npc$/, '');
const toBlobURL = c => new Promise(r => c.toBlob(b => r(URL.createObjectURL(b))));

async function gridImages(d, key, bytes, w, h, chunk) {
  if (d.cache[key]) return d.cache[key];
  const out = [];
  for (let cy = 0; cy < h; cy += chunk) for (let cx = 0; cx < w; cx += chunk) {
    const cw = Math.min(chunk, w - cx), ch = Math.min(chunk, h - cy), c = canvas(cw * 16, ch * 16), ctx = c.getContext('2d');
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) blit(ctx, d.tiles, 16, bytes[(cy + y) * w + cx + x], x, y);
    out.push({src: await toBlobURL(c), at: [cx, cy, cw, ch]});
  }
  return d.cache[key] = out;
}
async function peopleImage(d, list, w, h) {
  const c = canvas(w * 16, h * 16), ctx = c.getContext('2d');
  for (const q of list) blit(ctx, d.tiles, 16, q.tile, q.x, q.y);
  return toBlobURL(c);
}

const kindOf = n => n <= 4 ? 'castle' : n <= 12 ? 'towne' : n <= 16 ? 'village' : n <= 24 ? 'dungeon' : 'shrine';
const townId = n => n === 1 ? 'LCB_1' : TOWN_FILES[n - 1];

// ---------- Britannia ----------

// The sextant's reading (U4_LOCAT.C CMD_Locate): latitude from y, longitude from x, each as two letters, the high
// and low nibble, A for 0.
export const sextant = (x, y) => { const L = v => String.fromCharCode(65 + v); return `latitude ${L(y >> 4)}'${L(y & 15)}", longitude ${L(x >> 4)}'${L(x & 15)}"`; };
async function renderWorld(d) {
  const W = 256, images = await gridImages(d, 'world', d.worldBytes, W, W, 32);
  let names = '', gates = '', items = '';
  const features = [];
  for (const pl of d.places) {
    if (pl.n === 31) continue;   // Spirituality shares Humility's square in the table; it is reached by moongate
    names += label(pl.x + 1.08, pl.y + .78, pl.name.replace(/!$/, ''), .9, kindOf(pl.n) === 'dungeon' ? '#ffb0a0' : kindOf(pl.n) === 'shrine' ? '#bff5c9' : '#f4efe0', 'start');
    features.push({name: pl.name.replace(/!$/, ''), x: pl.x, y: pl.y, detail: kindOf(pl.n)});
  }
  d.moongates.forEach(([x, y], k) => { gates += ring(x, y, C.gate, '', .14) + label(x + .5, y - .25, `Trammel ${k}`, .75, C.gate); features.push({name: `Moongate (Trammel phase ${k})`, x, y}); });
  for (const [loc, x, y, what] of SEARCH) if (!loc) { items += ring(x, y, C.item, '.16 .1', .12); features.push({name: what, x, y, detail: 'search'}); }
  const svg = svgDoc(W, W, g('names', names) + g('gates', gates) + g('items', items) + g('grid', gridLines(W, W)));
  const cell = (x, y) => {
    const t = d.worldBytes[y * W + x], links = [];
    const pl = [...d.places].reverse().find(q => q.x === x && q.y === y);
    const gate = d.moongates.findIndex(([a, b]) => a === x && b === y), spot = SEARCH.find(s => !s[0] && s[1] === x && s[2] === y);
    let body = '';
    if (spot) body += p(`<b>Search here: ${spot[3]}.</b> ${spot[4]}`);
    if (gate >= 0) body += p(`<b>A moongate</b> opens here while Trammel is in phase ${gate}. It sends you to the gate of Felucca’s phase${gate === 4 ? '; with both moons in phase 4 it sends you to the Shrine of Spirituality instead' : ''}.`);
    if (pl) {
      const k = kindOf(pl.n);
      if (k === 'castle' || k === 'towne' || k === 'village') links.push({label: 'Enter', map: townId(pl.n), focus: [15, 31]});
      if (k === 'dungeon') links.push({label: 'Enter level 1', map: `${DUNGEON_FILES[pl.n - 17]}-1`, focus: [1, 1]});
      if (pl.n === 24) body += p('Enter only after ringing the Bell, reading the Book and lighting the Candle here, in that order. Using the Skull here casts it into the lava: not required, but it raises every virtue by 10.');
      if (k === 'shrine') body += p(`Mantra: <b>${d.mantras[pl.n - 25].toUpperCase()}</b>. Meditate for a vision. With the virtue at its peak and the rune in hand, you reach partial Avatarhood.`);
      return {title: pl.name.replace(/!$/, ''), body, links};
    }
    return {title: tname(d, t), body: (TERRAIN[t] ? p(TERRAIN[t]) : '') + body};
  };
  const info = `<h3>Britannia</h3>
    <p>256 × 256 squares. Moongates: the open one follows Trammel’s phase, and where it sends you follows Felucca’s. Both moons reset to new whenever you load a saved game.</p>
    <p class="muted">Dotted green rings mark squares where Search finds something. The Shrine of Spirituality has no square of its own: only a moongate reaches it.</p>`;
  // the world wraps: the map window moves with & 0xff (U4_MAP.C)
  return {title: 'Britannia', subtitle: 'Ultima IV', width: W, height: W, native: 16, wrap: true, images, svg, cell, features, info, coords: sextant,
    layers: [{id: 'names', name: 'Place names', swatch: swatch(label(.5, .8, 'A', .9))},
      {id: 'gates', name: 'Moongates', swatch: swatch(ring(0, 0, C.gate, '', .14))},
      {id: 'items', name: 'Things to search for', swatch: swatch(ring(0, 0, C.item, '.16 .1', .12))},
      {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}]};
}

// ---------- castles, townes, villages ----------

function shopAt(d, loc, row) {
  for (let k = 7; k >= 0; k--) if (d.shopRows[loc - 1][k] === row) {
    const s = d.shops[k], id = s.ids[loc - 1];
    return {kind: s.kind, name: id ? s.names[id - 1] : KIND_LABEL[s.kind], keeper: id ? s.keepers[id - 1] : ''};
  }
  if (loc === 13 && row === 0x18) return {kind: 'horses', name: 'Horses', keeper: ''};
  if (loc === 1 && row === 0x19) return {kind: 'hawkwind', name: 'Hawkwind the seer', keeper: 'Hawkwind'};
  return null;
}

function talkHTML(r) {
  const nl = s => esc(s).replace(/\n/g, ' ');
  const rows = [['Look', r.look], ['Job', r.job], ['Health', r.health], [r.keyword1, r.answer1], [r.keyword2, r.answer2]].filter(([, v]) => v);
  const topic = ['', 'name', 'look', 'job', 'health', r.keyword1, r.keyword2][r.question] || '';
  return `<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${nl(v)}</td></tr>`).join('')}</table>` +
    (r.ask ? p(`After “${esc(topic.toLowerCase())}”: <i>${nl(r.ask)}</i>`, `Yes: ${nl(r.yes)}`, `No: ${nl(r.no)}`) : '') +
    (r.humility ? p('<span class="muted">A humility question: answering yes (bragging) lowers humility; no raises it.</span>') : '') +
    (r.turnAway ? p(`<span class="muted">Turns away ${Math.round(r.turnAway / 2.56)}% of the time.</span>`) : '');
}

async function renderTown(d, key) {
  const loc = key === 'LCB_2' ? 1 : TOWN_FILES.indexOf(key) + 1, t = d.towns[key], pl = d.places[loc - 1];
  const talk = d.talk[TALK_FILES[loc - 1]];
  const images = await gridImages(d, key, t.bytes, 32, 32, 32);
  images.push({src: await peopleImage(d, t.people, 32, 32), layer: 'people'});
  const at = (x, y) => t.bytes[y * 32 + x];
  const parts = {talkers: '', shops: '', items: '', start: key === 'LCB_2' ? '' : ring(15, 31, C.start, '.18 .1')};
  const features = [];
  const shopOf = q => {
    if (q.tile < 0x52 || q.tile > 0x53) return null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = q.x + dx, cy = q.y + dy;
      if (cx < 0 || cy < 0 || cx > 31 || cy > 31) continue;
      const c = at(cx, cy);
      if (c >= 0x60 && c <= 0x7A) { const s = shopAt(d, loc, cy); if (s) return s; }
    }
    return null;
  };
  const rec = q => q.talk >= 1 && q.talk <= 16 ? talk[q.talk - 1] : null;
  for (const q of t.people) {
    const s = shopOf(q), r = rec(q);
    if (s) { parts.shops += ring(q.x, q.y, C.shop); features.push({name: s.name, x: q.x, y: q.y, detail: KIND_LABEL[s.kind] || s.kind}); }
    else if (r) { parts.talkers += ring(q.x, q.y, C.talk); features.push({name: r.name, x: q.x, y: q.y, detail: `${r.job} ${r.keyword1} ${r.keyword2}`}); }
    else features.push({name: tname(d, q.tile), x: q.x, y: q.y});
  }
  for (const [l, x, y, what] of SEARCH) if (l === loc && key !== 'LCB_2') { parts.items += ring(x, y, C.item, '.16 .1', .12); features.unshift({name: what, x, y, detail: 'search'}); }
  const svg = svgDoc(32, 32, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(32, 32)));
  const exit = {label: 'Leave for Britannia', map: 'world', focus: [pl.x, pl.y]};

  const cell = (x, y) => {
    const q = t.people.find(r => r.x === x && r.y === y), c = at(x, y), links = [];
    if (x === 0 || y === 0 || x === 31 || y === 31) links.push(exit);
    if (loc === 1 && c === 0x1B && key === 'LCB_1') links.push({label: 'Klimb up to the upper floor', map: 'LCB_2', focus: [x, y]});
    if (loc === 1 && c === 0x1C && key === 'LCB_2') links.push({label: 'Klimb down', map: 'LCB_1', focus: [x, y]});
    if (loc === 1 && c === 0x1C && key === 'LCB_1') links.push({label: 'Down to the dungeon Hythloth', map: 'HYTHLOTH-1', focus: [1, 1]});
    const spot = SEARCH.find(s => s[0] === loc && s[1] === x && s[2] === y && key !== 'LCB_2');
    const spotHTML = spot ? p(`<b>Search here: ${spot[3]}.</b> ${spot[4]}`) : '';
    if (q) {
      const s = shopOf(q), r = rec(q);
      if (s) return {title: s.name, body: p(`${KIND_LABEL[s.kind] || ''}${s.keeper ? `, kept by ${esc(s.keeper)}` : ''}. Talk across the counter.`) + spotHTML, links};
      if (q.tile === 0x5E) return {title: 'Lord British', body: p('Talk to him to be healed and to rise in level when you have earned it; ask about the virtues, the stones and the codex.') + spotHTML, links};
      if (r) return {title: r.name, body: `<p class="muted">${esc(tname(d, q.tile))} · ${MOVE[q.move] || ''}</p>` + talkHTML(r) + spotHTML, links};
      return {title: tname(d, q.tile), body: p(MOVE[q.move] || '') + spotHTML, links};
    }
    let body = spotHTML;
    if (TERRAIN[c]) body = p(TERRAIN[c]) + body;
    if (key !== 'LCB_2' && x === 15 && y === 31) body += p('<b>You enter here.</b>');
    return {title: tname(d, c), body, links};
  };

  const services = [...new Set(t.people.map(shopOf).filter(Boolean).map(s => `${s.name} (${(KIND_LABEL[s.kind] || s.kind).toLowerCase()})`))];
  const named = t.people.map(rec).filter(Boolean).map(r => r.name);
  const info = `<h3>${esc(key === 'LCB_2' ? 'Castle Britannia, upper floor' : pl.name)}</h3>
    ${services.length ? `<p>Shops: ${services.join(', ')}.</p>` : ''}
    ${named.length ? `<p>People: ${[...new Set(named)].map(esc).join(', ')}.</p>` : ''}
    <p class="muted">Click anyone to read their whole conversation: name, look, job, health, their two keywords and their question.</p>`;
  return {
    title: key === 'LCB_2' ? 'Castle Britannia, upper floor' : pl.name, subtitle: kindOf(loc)[0].toUpperCase() + kindOf(loc).slice(1),
    width: 32, height: 32, native: 16, images, svg, cell, features, info,
    layers: [{id: 'people', name: 'People'}, {id: 'talkers', name: 'People who talk', swatch: swatch(ring(0, 0, C.talk))},
      {id: 'shops', name: 'Shopkeepers', swatch: swatch(ring(0, 0, C.shop))}, {id: 'items', name: 'Things to search for', swatch: swatch(ring(0, 0, C.item, '.16 .1', .12))},
      ...(parts.start ? [{id: 'start', name: 'Where you enter', swatch: swatch(ring(0, 0, C.start, '.18 .1'))}] : []),
      {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
  };
}

// ---------- dungeons ----------

const glyph = {
  wall: (x, y) => rect(x, y, 1, 1, C.wall) + rect(x, y, 1, .12, C.wallTop),
  door: (x, y) => rect(x + .2, y + .2, .6, .6, 'none', `stroke="${C.door}" stroke-width=".1" rx=".05"`),
  secret: (x, y) => rect(x + .2, y + .2, .6, .6, 'none', `stroke="${C.door}" stroke-width=".09" stroke-dasharray=".13 .1" rx=".05"`),
  chest: (x, y) => rect(x + .22, y + .32, .56, .4, '#5a4410', `stroke="${C.chest}" stroke-width=".06" rx=".05"`) + path(`M${x + .22} ${y + .46}H${x + .78}M${x + .5} ${y + .46}V${y + .56}`, C.chest, .05),
  ladder: (x, y, up, down) => path(`M${x + .32} ${y + .12}V${y + .88}M${x + .68} ${y + .12}V${y + .88}M${x + .32} ${y + .3}H${x + .68}M${x + .32} ${y + .5}H${x + .68}M${x + .32} ${y + .7}H${x + .68}`, C.ladder, .06) +
    (up ? `<path d="M${x + .8} ${y + .08}l.15 .2h-.3z" fill="${C.ladder}"/>` : '') + (down ? `<path d="M${x + .8} ${y + .92}l.15 -.2h-.3z" fill="${C.ladder}"/>` : ''),
  mark: (x, y, letter, color) => `<circle cx="${x + .5}" cy="${y + .5}" r=".32" fill="#1d1a24" stroke="${color}" stroke-width=".06"/><text x="${x + .5}" y="${y + .63}" text-anchor="middle" font-size=".36" font-family="Georgia, serif" font-weight="700" fill="${color}">${letter}</text>`,
  start: (x, y) => `<rect x="${x + .05}" y="${y + .05}" width=".9" height=".9" fill="none" stroke="#ffffff" stroke-width=".05" stroke-dasharray=".1 .07" rx=".1"/>`,
};
const FOUNTAIN = ['plain (no effect)', 'healing', 'acid (hurts)', 'curing (poison)', 'poison'];
const FIELD = ['poison', 'energy', 'fire', 'sleep'];
// U4_PEER.C DngMapChars: the character the gem view prints for each kind of dungeon cell (cell >> 4), from CHARSET.EGA
const GEM_CHARS = [0x20, 0x06, 0x05, 0x04, 0x24, 0x20, 0x20, 0x0F, 0x54, 0x46, 0x5E, 0x00, 0x0E, 0x0E, 0x02, 0x03];
// a small label in a cell's corner, leaving the gem glyph visible
export const badge = (x, y, text, color) => `<rect x="${x + .02}" y="${y + .02}" width="${.14 + .17 * String(text).length}" height=".34" rx=".06" fill="#000" opacity=".8"/><text x="${x + .09}" y="${y + .29}" font-size=".3" font-family="system-ui, sans-serif" font-weight="700" fill="${color}">${esc(String(text))}</text>`;
const hasMonster = c => (c & 15) && ![0x80, 0x90, 0xA0, 0xD0, 0xF0].includes(c & 0xF0);

async function renderLevel(d, key, L) {
  const di = DUNGEON_FILES.indexOf(key), dn = d.dungeons[key], pl = d.places[16 + di], abyss = key === 'ABYSS';
  const cells = dn.bytes.subarray((L - 1) * 64, L * 64), at = (x, y) => cells[y * 8 + x];
  // the level as the gem view prints it: one CHARSET.EGA character a cell (U4_PEER.C ShowDungeonMap)
  const gem = canvas(128, 128), gctx = gem.getContext('2d');
  const parts = {rooms: '', monsters: ''};
  const features = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const c = at(x, y), hi = c & 0xF0;
    d.glyph(gctx, GEM_CHARS[hi >> 4], x, y);
    if (hi === 0xE0) features.push({name: 'Secret door', x, y});
    if (hi === 0x40) features.push({name: 'Chest', x, y});
    if (hi >= 0x10 && hi <= 0x30) features.unshift({name: ['', 'Ladder up', 'Ladder down', 'Ladder up and down'][hi >> 4], x, y});
    const sp = {0x50: 'Hole in the ceiling', 0x60: 'Hole in the floor', 0x70: 'Magic orb', 0x80: 'Trap', 0x90: `Fountain: ${FOUNTAIN[c & 15] || '?'}`, 0xA0: `${(FIELD[c & 15] || '?')} field`, 0xB0: 'Altar'}[hi];
    if (sp) features.push({name: sp.replace(/^\w/, ch => ch.toUpperCase()), x, y});
    if (hi === 0xD0) { parts.rooms += badge(x, y, c & 15, C.room); features.push({name: `Room ${c & 15}${(c & 15) === 15 && !abyss ? ' (altar room)' : ''}`, x, y}); }
    if (hasMonster(c)) { const mt = 0x90 + (c & 15) * 4 - 4; parts.monsters += badge(x + .52, y + .62, tname(d, mt)[0], C.mon); features.push({name: tname(d, mt), x, y, detail: 'monster'}); }
  }
  const svg = svgDoc(8, 8, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(8, 8)) + (L === 1 ? g('start', glyph.start(1, 1)) : ''));
  const id = l => `${key}-${l}`;
  const roomIndex = n => abyss ? ((L - 1) >> 1) * 16 + n : n;
  const cell = (x, y) => {
    const c = at(x, y), hi = c & 0xF0, links = [];
    let title, body = '';
    if (hi === 0xF0) return {title: 'Wall'};
    if (hi === 0xE0) return {title: 'Secret door', body: p('Looks like a wall; walk through it.')};
    if (hi === 0xC0) title = 'Door';
    else if (hi === 0x40) [title, body] = ['Chest', p('Gold, and it may be trapped. Full again the next time you enter the dungeon.')];
    else if (hi >= 0x10 && hi <= 0x30) {
      title = ['', 'Ladder up', 'Ladder down', 'Ladder up and down'][hi >> 4];
      if (hi & 0x10) links.push(L === 1 ? {label: 'Klimb out to Britannia', map: 'world', focus: [pl.x, pl.y]} : {label: `Klimb to level ${L - 1}`, map: id(L - 1), focus: [x, y]});
      if (hi & 0x20 && L < 8) links.push({label: `Descend to level ${L + 1}`, map: id(L + 1), focus: [x, y]});
    }
    else if (hi === 0x50) [title, body] = ['Hole in the ceiling', ''];
    else if (hi === 0x60) [title, body] = ['Hole in the floor', ''];
    else if (hi === 0x70) [title, body] = ['Magic orb', p(orbText(di))];
    else if (hi === 0x80) [title, body] = ['Trap', p(['Winds: blow out your light.', 'Falling rocks.'][c & 15] || 'A pit.')];
    else if (hi === 0x90) [title, body] = ['Fountain', p(`Search and drink: ${FOUNTAIN[c & 15] || '?'}.`)];
    else if (hi === 0xA0) [title, body] = [`${(FIELD[c & 15] || '?').replace(/^\w/, ch => ch.toUpperCase())} field`, p(c & 15 ? '' : 'Poisons.')];
    else if (hi === 0xB0) [title, body] = ['Altar', STONES[di] ? p(`Search: the <b>${STONES[di]} Stone</b>, once (+5 honor, 200 experience).`) : p('No stone here.')];
    else if (hi === 0xD0) {
      const n = c & 15;
      title = `Room ${n}`;
      if (n === 15 && !abyss) body = p(`The altar room of ${x === 3 ? 'Love' : x <= 2 ? 'Truth' : 'Courage'}: a part of the Key of Three Parts.`);
      links.push({label: 'Open the room', map: `${key}-room-${roomIndex(n)}`});
    }
    else title = 'Floor';
    if (hasMonster(c)) body = p(`<b>${tname(d, 0x90 + (c & 15) * 4 - 4)}</b> waits here when you arrive.`) + body;
    if (L === 1 && x === 1 && y === 1) body += p('<b>You arrive here</b>, facing east.');
    return {title, body, links};
  };
  const info = `<h3>${esc(pl.name.replace(/!$/, ''))}, level ${L}</h3>
    <p>Drawn as the game’s gem view draws it (Peer at a gem, or the View spell): $ chests, T traps, F fountains, ^ fields, and the signs for ladders, doors and walls. The same for everyone.</p>
    <p>Rooms (pink numbers) open into fights on their own 11 × 11 maps; red letters are the monsters waiting at the start, which the gem view does not show.</p>
    ${STONES[di] ? `<p>Altar stone: ${STONES[di]}.</p>` : ''}
    <p class="muted">Each level is 8 × 8 and wraps at its edges.</p>`;
  return {
    title: `${pl.name.replace(/!$/, '')}, level ${L}`, subtitle: 'Dungeon', width: 8, height: 8, wrap: true, native: 16, images: [{src: gem, layer: 'gem'}], svg, cell, features, info,
    layers: [
      {id: 'gem', name: 'Gem view'},
      {id: 'rooms', name: 'Room numbers', swatch: swatch(badge(.2, .3, 1, C.room))},
      {id: 'monsters', name: 'Monsters at the start', swatch: swatch(badge(.2, .3, 'R', C.mon))},
      ...(L === 1 ? [{id: 'start', name: 'Where you arrive', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.start(0, 0))}] : []),
      {id: 'grid', name: 'Grid', swatch: swatch(rect(0, 0, 1, 1, C.floor) + path('M.5 0V1M0 .5H1', '#888', .06))},
    ],
  };
}

async function renderRoom(d, key, n) {
  const di = DUNGEON_FILES.indexOf(key), room = d.dungeons[key].rooms[n], pl = d.places[16 + di];
  const images = await gridImages(d, `${key}-room-${n}`, room.bytes, 11, 11, 11);
  images.push({src: await peopleImage(d, room.foes, 11, 11), layer: 'foes'});
  let trig = '';
  for (const t of room.triggers) trig += ring(t.at[0], t.at[1], C.event, '.16 .1');
  const svg = svgDoc(11, 11, g('triggers', trig) + g('grid', gridLines(11, 11)));
  const levelOf = key === 'ABYSS' ? `levels ${(n >> 4) * 2 + 1}–${(n >> 4) * 2 + 2}` : null;
  const cell = (x, y) => {
    const foe = room.foes.find(f => f.x === x && f.y === y), t = room.triggers.find(r => r.at[0] === x && r.at[1] === y);
    let body = t ? p(`<b>Trigger:</b> stepping here turns ${t.a.join(', ')}${t.b.join(',') !== t.a.join(',') ? ` and ${t.b.join(', ')}` : ''} into ${esc(tname(d, t.tile).toLowerCase())}.`) : '';
    return {title: foe ? tname(d, foe.tile) : tname(d, room.bytes[y * 11 + x]), body};
  };
  const foes = room.foes.map(f => tname(d, f.tile));
  const count = foes.reduce((m, f) => (m[f] = (m[f] || 0) + 1, m), {});
  return {
    title: `${pl.name.replace(/!$/, '')}, room ${key === 'ABYSS' ? n % 16 : n}`, subtitle: levelOf ? `The Abyss, ${levelOf}` : 'Dungeon room',
    width: 11, height: 11, native: 16, images, svg, cell, features: room.foes.map(f => ({name: tname(d, f.tile), x: f.x, y: f.y})),
    info: `<h3>Room ${key === 'ABYSS' ? n % 16 : n}</h3><p>Foes: ${Object.entries(count).map(([k, v]) => `${v} × ${esc(k)}`).join(', ') || 'none'}.</p>
      ${n === 15 && key !== 'ABYSS' ? '<p>The altar room: which part of the Key of Three Parts it gives depends on the square of the level you entered from (Truth at x 0–2, Love at x 3, Courage beyond). Stand on (5, 5) and name the stones.</p>' : ''}
      ${room.triggers.length ? '<p>Dotted squares are triggers that change the room when stepped on.</p>' : ''}
      <p class="muted">Where the party starts depends on the side it enters from.</p>`,
    layers: [{id: 'foes', name: 'Foes'}, {id: 'triggers', name: 'Triggers', swatch: swatch(ring(0, 0, C.event, '.16 .1'))}, {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
  };
}

let places = null;
export default {
  id: 'u4', title: 'Ultima IV', version: 'PC/GOG version. Every map is read from the game files.',
  params: [], transient: [], defaultMap: 'world',
  maps(params, mapId) {
    const list = [{id: 'world', name: 'Britannia'}];
    if (!places) return list;
    const m = /^([A-Z]+)-(\d+)$/.exec(mapId || ''), r = /^([A-Z]+)-room-(\d+)$/.exec(mapId || '');
    const dk = m ? m[1] : r ? r[1] : null;
    if (dk && DUNGEON_FILES.includes(dk)) for (let l = 1; l <= 8; l++) list.push({id: `${dk}-${l}`, name: String(l), title: `Level ${l}`, group: `${places[16 + DUNGEON_FILES.indexOf(dk)].name.replace(/!$/, '')}: levels`});
    places.slice(0, 16).forEach((pl, i) => {
      list.push({id: townId(i + 1), name: pl.name.replace(/^The /, ''), title: pl.name, group: {castle: 'Castles', towne: 'Townes', village: 'Villages'}[kindOf(i + 1)]});
      if (i === 0) list.push({id: 'LCB_2', name: 'Britannia, upper floor', group: 'Castles'});
    });
    places.slice(16, 24).forEach((pl, i) => list.push({id: `${DUNGEON_FILES[i]}-1`, name: pl.name.replace(/^The Great Stygian /, '').replace(/!$/, ''), title: pl.name, group: 'Dungeons'}));
    return list;
  },
  async render(mapId, params) {
    const d = await load();
    places = d.places;
    let m;
    if ((m = /^([A-Z]+)-room-(\d+)$/.exec(mapId || '')) && d.dungeons[m[1]] && d.dungeons[m[1]].rooms[+m[2]]) return renderRoom(d, m[1], +m[2]);
    if ((m = /^([A-Z]+)-([1-8])$/.exec(mapId || '')) && d.dungeons[m[1]]) return renderLevel(d, m[1], +m[2]);
    if (d.towns[mapId]) return renderTown(d, mapId);
    if (mapId && mapId !== 'world') throw new Error(`no map ${mapId}`);   // the viewer then opens the default map and fixes the address
    return renderWorld(d);
  },
};
