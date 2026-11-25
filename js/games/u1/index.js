// Ultima I: the world, the towns and castles (from the game files, extracted to data/u1 by
// tools/extract-u1.mjs) and every dungeon level (computed from the character's seed).
import {level, levelMonsters, CELL} from './u1gen.js';
import {tileLayer, scrollRows} from '../../lib/draw.js';

const DATA = new URL('../../../data/u1/', import.meta.url);
const W = 168, H = 156, TW = 38, TH = 18;

const LANDS = ['Lord British', 'the Feudal Lords', 'the Dark Unknown', 'Danger and Despair'];
const landOf = (x, y) => (y > 77) * 2 + (x > 83);
const START = [49, 40];   // where GEN puts a new character

const TERRAIN = {
  0: ['Water', 'You can’t walk on water: rafts and frigates sail it. Sea monsters live here.'],
  1: ['Grass', 'Land monsters roam it.'],
  2: ['Woods', 'Aircars can’t pass woods. Hidden archers and evil trents live only here.'],
  3: ['Mountains', 'Impassable, even in a vehicle.'],
};

// Signs and monuments, places 41-48: what they say and do (world-and-map.md section 5).
const SIGNS = [
  ['“You feel a strong magic surrounding you!”', 'Agility +10%.'],
  ['“You hear someone say, ‘TURIS-SCIENTIA-MAGNOPERE’”', 'Intelligence +10%. One of the four places a king’s quest can send you.'],
  ['“A sign reads: ‘FORTES FORTUNA ADIUVAT!’”', 'Gives the first weapon you don’t own.'],
  ['Shelley’s “Ozymandias”, then “You feel a strange force!”', 'Wisdom +10%. One of the four places a king’s quest can send you.'],
  ['“ULTIMA THULE!” “The sky grows dark, and a strong magic engulfs you!”', 'Stamina +10%.'],
  ['“OMNIA MUTANTUR!”', 'Charisma +10%. One of the four places a king’s quest can send you.'],
  ['“GO EAST TO GO EAST!”', 'No effect: no gain, and nothing more is said.'],
  ['“The grave is marked: ‘VAE VICTIS’”', 'Stamina +10%. One of the four places a king’s quest can send you.'],
];
const SIGN_NOTE = 'A gain is 10% of the stat (rounded), up to 99. Visiting the same monument twice in a row does nothing (“Hmmmm...no effect!”).';

// Shops by town layout 0-7 (towns n with (n - 1) % 8 = layout), from the sign functions.
const SHOPS = {
  armour: ['The Armour Shop of Lord Eldric D’Charbonneux', 'Max’s Armoury', 'The Iron Fist', 'The Hammer -n- Anvil', null, 'Defense Specialties Unlimited', null, 'Custom Armor Works'],
  food: ['Li’l Karelia’s Finnish Grocery', 'Adventurer’s Supply Post', null, 'The Brown Bag', 'Fresh Food Marketplace', 'Rations Unlimited', 'Fastest Freshest Food Market', 'Exploration Provisioners'],
  weapons: ['The Weapon Shop of Lord Eldric D’Charbonneux', 'The Tempered Steel', 'The Razor’s Edge', 'Cold Steel Creations', 'The Bloody Blade', 'The Duelo Shop', 'Weaponry Supply', 'Cold Steel Creations'],
  magic: ['Mad Chad’s Magic Shoppe', 'Mystic Melinda’s', 'Words of Power', 'Psychic Sam’s Magical Emporium', null, null, null, 'The Unleashed Spell'],
  pub: ['Pub de Varg', 'Ye Olde Local Pub', 'Dr. Cat’s Lair', 'Teaser’s House', null, 'Mary’s Midway', 'Kurtstable’s Korner', 'Dav’s House-o-Suds'],
  transport: ['Scooter’s Super Duper Transport, Inc.', null, null, 'Quality Transport Ltd.', null, 'O.K. New and Used Transport', null, 'Sly Sam’s Transportation Specialists'],
};
const SHOP_KIND = {54: 'armour', 55: 'armour', 56: 'food', 57: 'food', 58: 'weapons', 59: 'weapons', 60: 'magic', 61: 'pub', 62: 'transport'};
const SHOP_LABEL = {armour: 'Armour', food: 'Food', weapons: 'Weapons', magic: 'Magic', pub: 'Pub', transport: 'Transport'};
const PRINCESS = ['Julia', 'Cassandra', 'Marsha', 'Donna', 'Kristen', 'Beth', 'Lori', 'Dianne'];

const C = {
  floor: '#1b1d18', wall: '#4b4e45', wallTop: '#62665a', door: '#d9a441', secret: '#d9a441',
  field: '#b48cff', ladder: '#6cc5d9', grid: '#ffffff', label: '#f4efe0', shop: '#e0b354', donate: '#6cd98a',
  lock: '#e57a7a', store: '#6cc5d9', throne: '#f0cf6e', start: '#ffffff',
};

// ---------- SVG helpers (coordinates in squares) ----------

const f = n => +n.toFixed(3);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const g = (layer, body) => `<g data-layer="${layer}">${body}</g>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" ${extra}/>`;
const path = (d, stroke, w, extra = '') => `<path d="${d}" ${extra.includes('fill=') ? '' : 'fill="none"'} stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const swatch = body => `<svg viewBox="0 0 1 1">${body}</svg>`;
const ring = (x, y, color, dash = '', w = .1) => `<rect x="${x + .06}" y="${y + .06}" width=".88" height=".88" rx=".12" fill="none" stroke="${color}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const label = (x, y, text, size, color = C.label, anchor = 'middle') =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${size}" font-family="Georgia, serif" text-anchor="${anchor}" fill="${color}" stroke="#000" stroke-width="${f(size / 6)}" paint-order="stroke" stroke-linejoin="round">${esc(text)}</text>`;
function gridLines(w, h) {
  let d = '';
  for (let x = 1; x < w; x++) d += `M${x} 0V${h}`;
  for (let y = 1; y < h; y++) d += `M0 ${y}H${w}`;
  return path(d, C.grid, w > 50 ? 0.03 : 0.015, 'opacity=".18"');
}
const p = (...lines) => lines.filter(Boolean).map(l => `<p>${l}</p>`).join('');

// ---------- data ----------

let loading = null;
function load() {
  return loading ||= (async () => {
    const img = async name => { const i = new Image(); i.src = new URL(name, DATA); await i.decode(); return i; };
    const [json, tiles, town] = await Promise.all([fetch(new URL('u1.json', DATA)).then(r => {
      if (!r.ok) { console.warn('data/u1/u1.json is missing: run tools/extract-u1.mjs'); throw new Error('Couldn’t load the Ultima I map data. Try reloading the page.'); }
      return r.json();
    }), img('tiles.png'), img('town.png')]);
    // World: one hex digit per cell; raw 5, 6, 7 are terrain codes 6, 7, 9.
    const terrain = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { let v = parseInt(json.world[i], 16); if (v > 4) { v++; if (v === 8) v++; } terrain[i] = v; }
    const towns = json.towns.map(h => Uint8Array.from(h.match(/../g), b => parseInt(b, 16)));
    return {...json, terrain, towns, tilesImg: tiles, townImg: town};
  })();
}

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const blit = (ctx, sheet, size, tile, x, y) =>
  ctx.drawImage(sheet, (tile % 16) * size, Math.floor(tile / 16) * size, size, size, x * size, y * size, size, size);

const kindOf = n => n <= 32 ? 'town' : n <= 40 ? 'castle' : n <= 48 ? 'sign' : 'dungeon';
const mapOf = pl => ({town: `town-${pl.n}`, castle: `castle-${pl.n}`, dungeon: `dungeon-${pl.n}-1`}[kindOf(pl.n)]);
const short = name => name.replace(/^The Castle (of )?/, '').replace(/^The /, '');

// ---------- the world ----------

// ---------- animation (OUT.EXE: src/out/OUTC.C, src/origin/OOAF57.ASM drawview, OOA554.ASM animwat) ----------
// On the overworld the main loop calls drawview(cnt) after every keyboard poll that finds no key (cnt counts the
// polls since the last command). drawview first scrolls the water down one pixel row (animwat: the bottom row comes
// back at the top), then repaints: castles show their second picture (5) while cnt % 6 is 3-5, towns their second
// picture (8) unless cnt % 4 is 0. A poll waits about 3 timer ticks (keyup, waittick(3)) plus the repaint: some
// 150 ms. Towns and castles inside, and the dungeons, do not move.
const POLL_MS = 150;
const worldFrame = (n, tick) => !tick ? 0 : n === 0 ? tick % 16 : n === 4 ? Math.floor(tick / 3) % 2 : n === 7 ? (tick % 4 ? 1 : 0) : 0;
function worldPicture(d) {
  return (n, key, ctx) => {
    if (n === 0) return scrollRows(ctx, 16, key);
    const t = n + 1;   // castle 4 -> 5, town 7 -> 8
    ctx.drawImage(d.tilesImg, (t % 16) * 16, Math.floor(t / 16) * 16, 16, 16, 0, 0, 16, 16);
  };
}

function renderWorld(d) {
  d.worldDraw ||= tileLayer({w: W, h: H, sheet: d.tilesImg, at: (x, y) => d.terrain[y * W + x], animated: [0, 4, 7],
    frame: worldFrame, picture: worldPicture(d)});
  const byXY = {};
  for (const pl of d.places) byXY[`${pl.x},${pl.y}`] = pl;
  let names = '';
  for (const pl of d.places) names += label(pl.x + 1.08, pl.y + .78, short(pl.name), .8, C.label, 'start');
  const lands = [[42, 6], [126, 6], [42, 84], [126, 84]].map(([x, y], i) => label(x, y, `The Lands of ${LANDS[i]}`, 2.6, '#ffe9a8')).join('');
  const svg = svgDoc(W, H, g('names', names) + g('lands', lands) +
    g('start', ring(START[0], START[1], C.start, '.18 .1')) + g('grid', gridLines(W, H)) +
    g('seams', path(`M84 0V${H}M0 78H${W}`, '#ffe9a8', .12, 'stroke-dasharray=".6 .4" opacity=".6"')));

  const cell = (x, y) => {
    const pl = byXY[`${x},${y}`], land = `The Lands of ${LANDS[landOf(x, y)]}`;
    if (!pl) {
      const t = TERRAIN[d.terrain[y * W + x]] || ['?', ''];
      const start = x === START[0] && y === START[1] ? '<p><b>A new character starts here.</b></p>' : '';
      return {title: t[0], body: start + p(t[1]) + `<p class="xy">${land}</p>`};
    }
    const k = kindOf(pl.n);
    if (k === 'town') {
      const layout = (pl.n - 1) % 8;
      const shops = Object.keys(SHOPS).filter(s => SHOPS[s][layout]).map(s => SHOP_LABEL[s].toLowerCase());
      return {title: `The town of ${pl.name}`, body: p(`Shops: ${shops.join(', ')}.`, `Same layout as ${sameLayout(d, pl.n).join(', ')}.`) + `<p class="xy">${land}</p>`,
        links: [{label: 'Open the town', map: mapOf(pl), focus: [19, 17]}]};
    }
    if (k === 'castle') return {title: pl.name, body: p(`The king, and Princess ${PRINCESS[pl.n - 33]} to rescue.`) + `<p class="xy">${land}</p>`,
      links: [{label: 'Open the castle', map: mapOf(pl), focus: [0, 9]}]};
    if (k === 'sign') { const [text, effect] = SIGNS[pl.n - 41]; return {title: pl.name, body: p(text, `<b>${effect}</b>`, `<span class="muted">${SIGN_NOTE}</span>`) + `<p class="xy">${land}</p>`}; }
    return {title: pl.name, body: p('A dungeon, 10 levels deep. Its layout comes from your character seed and where this entrance is.') + `<p class="xy">${land}</p>`,
      links: [{label: 'Enter level 1', map: mapOf(pl), focus: [1, 1]}]};
  };

  const features = d.places.map(pl => ({name: pl.name, x: pl.x, y: pl.y, detail: kindOf(pl.n)}));
  const info = `<h3>Sosaria</h3>
    <p>168 × 156 squares in four lands of 84 × 78, each with 8 towns, 2 castles, 2 monuments and 9 dungeons.</p>
    <p class="muted">The world wraps around. North and south simply join. Walking off the east or west edge also
    shifts you 77 squares north or south, into the other half: “GO EAST TO GO EAST!”. Crossing into another land on
    foot clears the monsters of the land you left.</p>`;
  return {
    title: 'Sosaria', subtitle: 'Ultima I', width: W, height: H, native: 16, draw: d.worldDraw, animate: {ms: POLL_MS}, svg, features, cell, info,
    layers: [
      {id: 'names', name: 'Place names', swatch: swatch(label(.5, .8, 'A', .9))},
      {id: 'lands', name: 'Lands', swatch: swatch(label(.5, .8, 'L', .9, '#ffe9a8'))},
      {id: 'seams', name: 'Borders between lands', swatch: swatch(path('M.5 0V1', '#ffe9a8', .12, 'stroke-dasharray=".25 .15"')), on: false},
      {id: 'start', name: 'Start of a new game', swatch: swatch(ring(0, 0, C.start, '.18 .1'))},
      {id: 'grid', name: 'Grid', swatch: swatch(path('M.5 0V1M0 .5H1', '#888', .06)), on: false},
    ],
  };
}

const sameLayout = (d, n) => d.places.filter(q => q.n <= 32 && q.n !== n && (q.n - 1) % 8 === (n - 1) % 8).map(q => q.name);

// ---------- towns and castles ----------

const PEOPLE = {17: 'Guard', 19: 'Bard', 20: 'King', 21: 'Merchant', 22: 'Princess', 50: 'Wench or lecher'};

function renderTown(d, n) {
  const castle = n >= 33, m = castle ? (n - 1) % 2 : (n - 1) % 8 + 2, layout = (n - 1) % 8;
  const pl = d.places[n - 1], cells = d.towns[m].slice();
  if (castle) { const dy = m === 0 ? 14 : 4; cells[35 * TH + dy] = 11; cells[31 * TH + dy] = 11; }   // the locked doors, set on entry
  const at = (x, y) => cells[x * TH + y];

  const base = canvas(TW * 8, TH * 8), bctx = base.getContext('2d');
  for (let x = 0; x < TW; x++) for (let y = 0; y < TH; y++) { const t = at(x, y); blit(bctx, d.townImg, 8, t >= 0x33 ? 1 : t, x, y); }
  const ppl = canvas(TW * 8, TH * 8), pctx = ppl.getContext('2d');
  const people = d.people[m];
  for (const [type, x, y] of people) blit(pctx, d.townImg, 8, type, x, y);

  const parts = {counters: '', donation: '', locks: '', stores: '', throne: '', start: ''};
  const features = [];
  for (let x = 0; x < TW; x++) for (let y = 0; y < TH; y++) {
    const t = at(x, y);
    if (t >= 0x33 && t <= 0x35) parts.donation += ring(x, y, C.donate, '.16 .1');
    if (!castle && SHOP_KIND[t]) { parts.counters += ring(x, y, C.shop, '', .06); features.push({name: SHOPS[SHOP_KIND[t]][layout], x, y, detail: SHOP_LABEL[SHOP_KIND[t]]}); }
    if (castle && (t === 55 || t === 57 || t === 59)) parts.stores += ring(x, y, C.store);
    if (castle && (t === 60 || t === 61)) { parts.locks += ring(x, y, C.lock); features.push({name: 'Lock square', x, y}); }
    if (castle && t === 62) { parts.throne += ring(x, y, C.throne); features.push({name: 'Throne', x, y}); }
  }
  const start = castle ? [0, 9] : [19, 17];
  parts.start = ring(start[0], start[1], C.start, '.18 .1');
  for (const [type, x, y] of people) features.push({name: personName(type, castle, n), x, y, detail: 'person'});
  // one feature per shop is enough for search
  const seen = new Set();
  const feats = features.filter(ft => { const k = ft.name + (ft.detail || ''); if (ft.detail === 'person' || ft.name === 'Lock square' || !seen.has(k)) { seen.add(k); return true; } return false; });

  const svg = svgDoc(TW, TH, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(TW, TH)));
  const exit = {label: 'Leave for the world', map: 'world', focus: [pl.x, pl.y]};

  const cell = (x, y) => {
    const t = at(x, y), who = people.find(e => e[1] === x && e[2] === y);
    const links = (x === 0 || y === 0 || x === TW - 1 || y === TH - 1) && (t === 1 || t >= 0x33) ? [exit] : [];
    if (who) return {title: personName(who[0], castle, n), body: personNote(who, castle, n), links};
    let title, body = '';
    if (castle) {
      if (t === 0x33) [title, body] = ['Donation square', p('Drop pence here: a random attribute rises by a tenth of the amount (up to 99).')];
      else if (t === 0x34) [title, body] = ['Donation square', p('Drop 10 pence or more here for a random weapon.')];
      else if (t === 0x35) [title, body] = ['Donation square', p('Drop pence here for three times as much food.')];
      else if (t === 55 || t === 57 || t === 59) [title, body] = [`${{55: 'Armour', 57: 'Food', 59: 'Weapon'}[t]} storeroom`, p('Steal here, or Get with the king’s permission (one king’s quest, for a white gem, allows nine items).')];
      else if (t === 60 || t === 61) [title, body] = ['Lock square', p('Unlock here with the jester’s key: the door to the north opens. The key fits one of the two squares, chosen at random each time you enter.')];
      else if (t === 62) [title, body] = ['The king’s throne', p('Transact here: offer pence (1½ hit points per pence) or service (a quest).')];
      else if (t === 11 && (x === 31 || x === 35)) [title, body] = ['Locked door', p(`The way to Princess ${PRINCESS[n - 33]}. Unlock it from the lock square just south.`)];
    } else {
      if (t === 0x33) [title, body] = ['Donation square', p('Drop pence here: 1½ hit points per pence; 6% of the time a free spell instead.')];
      else if (SHOP_KIND[t]) [title, body] = [SHOPS[SHOP_KIND[t]][layout], p(`${SHOP_LABEL[SHOP_KIND[t]]} counter: Transact here.`)];
    }
    if (!title) {
      if (t === 1 || t === 0x3F || t >= 0x33) title = 'Floor';
      else if (t === 23) title = 'Wall';
      else if (t >= 24 && t <= 49) title = `Lettering (${String.fromCharCode(41 + t)})`;
      else title = 'Blocked';
    }
    if (x === start[0] && y === start[1]) body += p('<b>You enter here.</b>');
    return {title, body, links};
  };

  const shopRows = castle ? '' : Object.keys(SHOPS).filter(s => SHOPS[s][layout]).map(s => `<tr><th>${SHOP_LABEL[s]}</th><td>${esc(SHOPS[s][layout])}</td></tr>`).join('');
  const info = castle
    ? `<h3>${esc(pl.name)}</h3>
      <p>Princess ${PRINCESS[n - 33]} is locked in the small room to the ${m === 0 ? 'south-east' : 'north-east'}. Kill the jester for the key, unlock
      the right lock square, and leave by any edge with her beside you, for 500 hit points, pence and experience.</p>
      <p class="muted">Castles ${d.places.filter(q => q.n >= 33 && q.n <= 40 && (q.n - 1) % 2 === m).map(q => short(q.name)).join(', ')} share this map.</p>`
    : `<h3>The town of ${esc(pl.name)}</h3>
      <table>${shopRows}</table>
      <p class="muted">Towns ${[pl.name, ...sameLayout(d, n)].join(', ')} share this map and these shops.</p>`;
  const layers = castle
    ? [{id: 'people', name: 'People'}, {id: 'throne', name: 'Throne', swatch: swatch(ring(0, 0, C.throne))},
      {id: 'locks', name: 'Lock squares', swatch: swatch(ring(0, 0, C.lock))}, {id: 'stores', name: 'Storerooms', swatch: swatch(ring(0, 0, C.store))},
      {id: 'donation', name: 'Donation squares', swatch: swatch(ring(0, 0, C.donate, '.16 .1'))}]
    : [{id: 'people', name: 'People'}, {id: 'counters', name: 'Shop counters', swatch: swatch(ring(0, 0, C.shop))},
      {id: 'donation', name: 'Donation squares', swatch: swatch(ring(0, 0, C.donate, '.16 .1'))}];
  layers.push({id: 'start', name: 'Where you enter', swatch: swatch(ring(0, 0, C.start, '.18 .1'))}, {id: 'grid', name: 'Grid', swatch: swatch(path('M.5 0V1M0 .5H1', '#888', .06)), on: false});
  return {
    title: castle ? pl.name : `The town of ${pl.name}`, subtitle: LANDS[landOf(pl.x, pl.y)] && `The Lands of ${LANDS[landOf(pl.x, pl.y)]}`,
    width: TW, height: TH, images: [{src: base}, {src: ppl, layer: 'people'}], svg, features: feats, cell, info, layers,
  };
}

const personName = (type, castle, n) => type === 19 ? (castle ? 'Gwino the jester' : 'Iolo the Bard') : type === 22 ? `Princess ${PRINCESS[n - 33]}` : PEOPLE[type] || `Person ${type}`;
function personNote([type, , , hp], castle) {
  const hpLine = `Hit points ${hp}.`;
  switch (type) {
    case 17: return p(hpLine, 'Stands still, until you anger the town: then guards close in and attack.');
    case 19: return p(hpLine, 'Wanders. Bumping into you steals your best weapon that isn’t readied.',
      castle ? 'Carries the key to the princess’s door: kill him for it. Sings “I’ve got the key!”.' : 'Sings “Ho eyoh he hum!”.');
    case 20: return p(hpLine, 'Stands on his throne. Transact with him from the throne square.');
    case 21: return p(hpLine, 'Stands behind the counter.');
    case 22: return p(hpLine, 'Wanders inside her room; runs from you if the castle turns hostile.');
    case 50: return p(hpLine, 'A wench for a male player, a lecher for a female one. Wanders; one next to you is what makes the pub’s “seduced” event possible.');
  }
  return p(hpLine);
}

// ---------- dungeons ----------

const glyph = {
  wall: (x, y) => rect(x, y, 1, 1, C.wall) + rect(x, y, 1, .12, C.wallTop),
  door: (x, y) => rect(x + .4, y + .08, .2, .84, C.door, 'rx=".04"'),
  secret: (x, y) => path(`M${x + .5} ${y + .1}V${y + .9}`, C.secret, .09, 'stroke-dasharray=".13 .1"'),
  field: (x, y) => path(`M${x + .12} ${y + .3}H${x + .88}M${x + .12} ${y + .5}H${x + .88}M${x + .12} ${y + .7}H${x + .88}`, C.field, .07),
  ladder: (x, y, up) => path(`M${x + .32} ${y + .12}V${y + .88}M${x + .68} ${y + .12}V${y + .88}M${x + .32} ${y + .3}H${x + .68}M${x + .32} ${y + .5}H${x + .68}M${x + .32} ${y + .7}H${x + .68}`, C.ladder, .06) +
    (up ? `<path d="M${x + .8} ${y + .08}l.15 .2h-.3z" fill="${C.ladder}"/>` : `<path d="M${x + .8} ${y + .92}l.15 -.2h-.3z" fill="${C.ladder}"/>`),
  arrival: (x, y) => `<rect x="${x + .05}" y="${y + .05}" width=".9" height=".9" fill="none" stroke="#ffffff" stroke-width=".05" stroke-dasharray=".1 .07" rx=".1"/>`,
};

function renderDungeon(d, n, L, params) {
  const pl = d.places[n - 1], {seed} = params;
  const {a} = level(seed, pl.x, pl.y, L);
  const parts = {base: '', doors: '', secret: '', fields: '', ladders: ''};
  const features = [];
  for (let x = 0; x < 11; x++) for (let y = 0; y < 11; y++) {
    const v = a[x][y];
    parts.base += v === CELL.WALL || v === CELL.SECRET_DOOR ? glyph.wall(x, y) : rect(x, y, 1, 1, C.floor);
    if (v === CELL.DOOR) parts.doors += glyph.door(x, y);
    if (v === CELL.SECRET_DOOR) { parts.secret += glyph.secret(x, y); features.push({name: 'Secret door', x, y}); }
    if (v === CELL.FORCE_FIELD) { parts.fields += glyph.field(x, y); features.push({name: 'Force field', x, y}); }
    if (v === CELL.LADDER_DOWN) { parts.ladders += glyph.ladder(x, y, false); features.unshift({name: 'Ladder down', x, y}); }
    if (v === CELL.LADDER_UP) { parts.ladders += glyph.ladder(x, y, true); features.unshift({name: L === 1 ? 'Ladder up (exit)' : 'Ladder up', x, y}); }
  }
  const arrive = L === 1 ? [1, 1] : L % 2 ? [7, 3] : [3, 7];
  const svg = svgDoc(11, 11, parts.base + Object.entries(parts).filter(([k]) => k !== 'base').map(([k, v]) => g(k, v)).join('') +
    g('grid', gridLines(11, 11)) + g('arrival', glyph.arrival(...arrive)));

  const id = l => `dungeon-${n}-${l}`;
  const cell = (x, y) => {
    const v = a[x][y];
    switch (v) {
      case CELL.FLOOR: return {title: 'Floor', body: x === arrive[0] && y === arrive[1] ? p('<b>You arrive here.</b>') : ''};
      case CELL.WALL: return {title: 'Wall'};
      case CELL.SECRET_DOOR: return {title: 'Secret door', body: p('Looks and blocks like a wall. Inform (search) next to it turns it into a door.')};
      case CELL.DOOR: return {title: 'Door', body: p('You can walk in, but not straight from another door.')};
      case CELL.FORCE_FIELD: return {title: 'Force field', body: p('Blocks like a wall. The Destroy spell removes it; Create makes new ones.')};
      case CELL.LADDER_DOWN: return {title: 'Ladder down', body: p('Klimb facing north or south. You arrive on the ladder up of the next level.'),
        links: [{label: `Climb down to level ${L + 1}`, map: id(L + 1), focus: [x, y]}]};
      case CELL.LADDER_UP: return L === 1
        ? {title: 'Ladder up (exit)', body: p('Klimb facing north or south to leave. Bonus hit points (twice the experience earned down here) are paid on the way out.'), links: [{label: 'Back to the world', map: 'world', focus: [pl.x, pl.y]}]}
        : {title: 'Ladder up', body: p('Klimb facing north or south.') + (x === arrive[0] && y === arrive[1] ? p('<b>You arrive here</b> coming down from above.') : ''),
          links: [{label: `Climb up to level ${L - 1}`, map: id(L - 1), focus: [x, y]}]};
    }
    return null;
  };

  const mons = levelMonsters(L).map(i => d.dungeonMonsters[i] + (i === 11 ? ' (a mimic)' : ''));
  const info = `<h3>${esc(pl.name)}, level ${L}</h3>
    <p>Walls, doors, secret doors, force fields and ladders for character seed <b>${seed}</b>.
    They are the same on every visit.</p>
    <p><b>Changes every visit</b> (the game rolls them afresh each time):</p>
    <ul><li>3 monsters, from: ${mons.join(', ')}.</li>
      <li>Up to ${L + 1} chests or coffins, worth ${3}–${L * L + 9} pence each. A chest trap costs ${L} hit points (never for a thief, or with Agility 75 or more).</li></ul>
    ${L === 10 ? '<p>The bottom: no ladder down.</p>' : ''}
    <p class="muted">Checked against the real game with two characters: all 10 levels matched.</p>`;
  return {
    title: `${pl.name}, level ${L}`, subtitle: `Character seed ${seed} · entrance at ${pl.x}, ${pl.y}`,
    width: 11, height: 11, svg, features, cell, info,
    layers: [
      {id: 'doors', name: 'Doors', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.door(0, 0))},
      {id: 'secret', name: 'Secret doors', swatch: swatch(rect(0, 0, 1, 1, C.wall) + glyph.secret(0, 0))},
      {id: 'fields', name: 'Force fields', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.field(0, 0))},
      {id: 'ladders', name: 'Ladders', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.ladder(0, 0, true))},
      {id: 'arrival', name: 'Where you arrive', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.arrival(0, 0))},
      {id: 'grid', name: 'Grid', swatch: swatch(rect(0, 0, 1, 1, C.floor) + path('M.5 0V1M0 .5H1', '#888', .06))},
    ],
  };
}

// ---------- the module ----------

function parse(mapId) {
  let m;
  if ((m = /^town-(\d+)$/.exec(mapId)) && +m[1] >= 1 && +m[1] <= 32) return {kind: 'town', n: +m[1]};
  if ((m = /^castle-(\d+)$/.exec(mapId)) && +m[1] >= 33 && +m[1] <= 40) return {kind: 'town', n: +m[1]};
  if ((m = /^dungeon-(\d+)-(\d+)$/.exec(mapId)) && +m[1] >= 49 && +m[1] <= 84 && +m[2] >= 1 && +m[2] <= 10) return {kind: 'dungeon', n: +m[1], L: +m[2]};
  return {kind: 'world'};
}

// The place list without waiting for the data (names and squares, for the map list).
let places = null;

export default {
  id: 'u1', title: 'Ultima I', version: 'PC/GOG version (1986 remake). Towns and the world come from the game files; dungeons from your character’s seed.',
  params: [
    {key: 'seed', label: 'Character seed (dungeons only)', def: 0, min: 0, max: 65535, random: true,
      help: 'Set when the character is created. Load your save file (PLAYERn.U1) to read it, or try any number.',
      file: {label: 'Read from PLAYERn.U1…', accept: '.u1,.U1', read(buf) {
        if (buf.byteLength < 0x34) throw new Error('This file is too short to be an Ultima I character file.');
        if (buf.byteLength !== 820) throw new Error(`This isn’t an Ultima I character file (it’s ${buf.byteLength} bytes, not 820).`);
        return new DataView(buf).getUint16(0x32, true);
      }}},
  ],
  transient: [],
  defaultMap: 'world',
  maps(params, mapId) {
    const list = [{id: 'world', name: 'World'}];
    if (!places) return list;
    const cur = parse(mapId);
    if (cur.kind === 'dungeon') for (let l = 1; l <= 10; l++)
      list.push({id: `dungeon-${cur.n}-${l}`, name: String(l), title: `Level ${l}`, group: `${short(places[cur.n - 1].name)}: levels`});
    for (let q = 0; q < 4; q++) for (const pl of places.filter(x => x.n <= 32 && landOf(x.x, x.y) === q))
      list.push({id: `town-${pl.n}`, name: pl.name, group: `Towns: lands of ${LANDS[q]}`});
    for (const pl of places.filter(x => x.n >= 33 && x.n <= 40)) list.push({id: `castle-${pl.n}`, name: short(pl.name), title: pl.name, group: 'Castles'});
    for (let q = 0; q < 4; q++) for (const pl of places.filter(x => x.n >= 49 && landOf(x.x, x.y) === q))
      list.push({id: `dungeon-${pl.n}-1`, name: short(pl.name), title: pl.name, group: `Dungeons: lands of ${LANDS[q]}`});
    return list;
  },
  async render(mapId, params) {
    const d = await load();
    places = d.places;
    const m = parse(mapId);
    if (m.kind === 'town') return renderTown(d, m.n);
    if (m.kind === 'dungeon') return renderDungeon(d, m.n, m.L, params);
    if (mapId && mapId !== 'world') throw new Error(`no map ${mapId}`);   // the viewer then opens the default map and fixes the address
    return renderWorld(d);
  },
};
