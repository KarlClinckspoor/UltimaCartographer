// Ultima II: every map of every era and planet, from the game files (extracted to data/u2 by
// tools/extract-u2.mjs). Nothing in Ultima II is random at map level: towers and dungeons too are
// stored in the files. Mechanics: u2-decompiled/docs/MECHANICS.md.
import {esc, g, rect, path, svgDoc, swatch, ring, label, gridLines, gridSwatch, p, canvas, blit, image, json} from '../../lib/draw.js';

const DATA = new URL('../../../data/u2/', import.meta.url);

const ZONES = {
  X0: 'Legends', X1: '9,000,000 B.C.', X2: '1423 B.C.', X3: '1990 A.D.', X4: '2112 A.D.',
  G1: 'Mercury', G2: 'Venus', G3: 'Mars', G4: 'Jupiter', G5: 'Saturn', G6: 'Uranus', G7: 'Neptune', G8: 'Pluto', G9: 'Planet X',
};
const TYPES = ['Surface', 'Village', 'Towne', 'Castle', 'Tower', 'Dungeon'];
const SPECIAL = {X03: 'Minax’s castle', X23: 'Castle of the king', X33: 'Castle of the king', X32: 'Towne with the hotel', X41: 'Village of planes and rockets', G93: 'Castle of Father Antos'};
// Hyperwarp coordinates (Xeno, Yako, Zabo) of each planet; 0 is Earth.
const WARP = ['6-6-6', '5-4-5', '3-3-4', '6-2-3', '1-3-4', '2-8-5', '9-4-6', '4-0-5', '0-1-4', '9-9-9'];
const SIGN_TEXT = z => ['LEGENDS', '9,000,000 B.C.', '1423 B.C.', '1990 A.D.'][z] || '2112 A.D.';

// Surface place tiles -> map type (half code / 2: 5 village, 6 towne, 7 tower, 8 castle, 9 dungeon, 10 sign).
const PLACE_TYPE = {5: 1, 6: 2, 7: 4, 8: 3, 9: 5};
// Time doors on Earth's surface: four spots per era, each in turn for 8 surface turns.
const DOORS = [[[29, 56], [31, 56], [33, 56], [35, 56]], [[34, 8], [47, 28], [36, 56], [20, 37]],
  [[16, 16], [48, 24], [42, 24], [19, 52]], [[56, 52], [28, 12], [33, 23], [20, 52]], [[18, 23], [50, 34], [52, 24], [8, 11]]];
const doorDest = (era, spot) => spot >= era ? spot + 1 : spot;

const TERRAIN = {
  0x00: ['Water', 'Only the frigate sails it.'],
  0x04: ['Marsh', 'Each step costs 5 hit points. Horses and planes refuse it.'],
  0x08: ['Grass', 'The only ground a plane or the rocket can land on.'],
  0x0C: ['Woods', 'Planes can’t taxi through woods.'],
  0x10: ['Mountains', 'Impassable.'],
};
const PEOPLE = {
  0x60: ['Guard', 'A GUARD SAYS: PAY YOUR TAXES!'], 0x64: ['Jester', 'A JESTER SINGS: HO HO HO!'],
  0x68: ['Merchant', 'A MERCHANT SAYS: WILL YOU BUY MY APPLES?'], 0x6C: ['King', null],
  0xF0: ['Fighter', 'A FIGHTER SAYS: UGH, ME TOUGH!'], 0xF4: ['Cleric', 'A CLERIC SAYS: BELIEVE!'],
  0xF8: ['Wizard', 'A WIZARD SAYS: HEX-E-POO-HEX-ON-YOU!'], 0xFC: ['Thief', 'A THIEF SAYS: PSST, WANNA BUY A WATCH?'],
  0x2C: ['Sea serpent', null], 0x30: ['Orc', null], 0x34: ['Daemon', null], 0x38: ['Devil', null], 0x3C: ['Balron', null], 0x40: ['Minax', null],
  0x44: ['Horse', null], 0x48: ['Frigate', null], 0x4C: ['Plane', null], 0x50: ['Rocket', null],
};
const SHOP = (towne, x, y) => (towne ? [['Weapons', 'Armour'], ['Pub', 'Transport']] : [['Oracle', 'Food'], ['Wizard’s spells', 'Cleric’s spells']])[y < 32 ? 0 : 1][x < 32 ? 0 : 1];
const SHOP_NOTE = {
  Weapons: 'Weapons 1-8.', Armour: 'Armour 1-6.', Pub: 'A drink for 5 gold, or tip 0-9 gold for a tip about which monsters carry which items.',
  Transport: 'Sells a horse, and you mount it at once.', Oracle: 'Pay 0-900 gold for one verse of a poem about the ring.',
  Food: '100 food.', 'Wizard’s spells': 'Wizards only.', 'Cleric’s spells': 'Clerics only.',
};
const DMON = ['', 'Orc', 'Ghost', 'Carrion creeper', 'Viper', 'Gremlin', 'Minotaur', 'Balron'];

const C = {wall: '#4b4e45', wallTop: '#62665a', floor: '#1b1d18', door: '#d9a441', ladder: '#6cc5d9', chest: '#f0c419',
  shop: '#e0b354', door2: '#e57a7a', pick: '#6cd98a', time: '#b48cff', talk: '#8cc6e0', start: '#ffffff'};

let loading = null;
const load = () => loading ||= (async () => {
  const [d, tiles] = await Promise.all([json(new URL('u2.json', DATA), 'run tools/extract-u2.mjs'), image(new URL('tiles.png', DATA))]);
  for (const m of Object.values(d.maps)) m.bytes = Uint8Array.from(m.cells.match(/../g), b => parseInt(b, 16));
  d.tiles = tiles; d.png = {};
  return d;
})();
let maps = null;   // the map ids, once loaded (for the map list)

const zoneOf = id => id.slice(0, 2);
const typeOf = id => +id[2];
const nameOf = id => typeOf(id) === 0 ? ZONES[zoneOf(id)] : SPECIAL[id.slice(0, 3)] || TYPES[typeOf(id)];
const titleOf = id => typeOf(id) === 0 ? `${ZONES[zoneOf(id)]}` : `${ZONES[zoneOf(id)]}: ${nameOf(id).toLowerCase().startsWith('castle') || SPECIAL[id.slice(0, 3)] ? nameOf(id) : TYPES[typeOf(id)].toLowerCase()}`;
const tileOf = code => (code >> 2) & 0x3F;

// Where each place of a zone is on its surface.
function placesOf(d, zone) {
  const s = d.maps[`${zone}0`], out = [];
  if (!s) return out;
  for (let i = 0; i < 4096; i++) {
    const t = tileOf(s.bytes[i]);
    if (t >= 5 && t <= 10) out.push({x: i & 63, y: i >> 6, tile: t, map: PLACE_TYPE[t] !== undefined ? `${zone}${PLACE_TYPE[t]}` : null});
  }
  return out;
}

function tileImage(d, id, cells) {
  if (d.png[id]) return d.png[id];
  const c = canvas(64 * 16, 64 * 16), ctx = c.getContext('2d');
  for (let i = 0; i < 4096; i++) blit(ctx, d.tiles, 16, tileOf(cells[i]), i & 63, i >> 6);
  return d.png[id] = c.toDataURL();
}

// ---------- surfaces ----------

function renderSurface(d, id) {
  const zone = zoneOf(id), earth = zone[0] === 'X', era = +zone[1];
  const m = d.maps[id], places = placesOf(d, zone);
  let labels = '', doors = '';
  for (const pl of places) labels += label(pl.x + 1.08, pl.y + .78, pl.tile === 10 ? 'Sign' : pl.map ? TYPES[typeOf(pl.map)] : '?', .8, '#f4efe0', 'start');
  if (earth) DOORS[era].forEach(([x, y], k) => { doors += ring(x, y, C.time, '', .14) + label(x + .5, y - .2, `→ ${ZONES['X' + doorDest(era, k)]}`, .7, C.time); });
  const svg = svgDoc(64, 64, g('names', labels) + (earth ? g('doors', doors) : '') + g('grid', gridLines(64, 64)));

  const cell = (x, y) => {
    const code = m.bytes[y * 64 + x], t = tileOf(code), pl = places.find(q => q.x === x && q.y === y);
    const k = earth ? DOORS[era].findIndex(([a, b]) => a === x && b === y) : -1;
    let doorNote = '', links = [];
    if (k >= 0) {
      const dest = doorDest(era, k), [ax, ay] = DOORS[dest][k];
      doorNote = p(`<b>Time door spot ${k + 1}.</b> The door stands here for 8 surface turns in every 32, and leads to <b>${ZONES['X' + dest]}</b>, arriving at ${ax}, ${ay}.`);
      links.push({label: `Through to ${ZONES['X' + dest]}`, map: `X${dest}0`, focus: [ax, ay]});
    }
    if (pl) {
      if (pl.tile === 10) return {title: 'Sign', body: p(`It reads “${SIGN_TEXT(era)}”.`) + doorNote, links};
      const exists = d.maps[pl.map];
      const enter = typeOf(pl.map) >= 4 ? {label: `Enter, level 0`, map: `${pl.map}-0`, focus: [5, 5]} : {label: 'Enter', map: pl.map, focus: [31, 62]};
      return {title: nameOf(pl.map), body: p('Enter on foot only.') + (exists ? '' : p('No map file for it.')) + doorNote, links: exists ? [enter, ...links] : links};
    }
    const [name, note] = TERRAIN[code & 0x7C] || [`Tile ${t}`, ''];
    return {title: name, body: p(note) + doorNote, links};
  };
  const features = places.map(pl => ({name: pl.tile === 10 ? 'Sign' : nameOf(pl.map), x: pl.x, y: pl.y}));
  if (earth) DOORS[era].forEach(([x, y], k) => features.push({name: `Time door to ${ZONES['X' + doorDest(era, k)]}`, x, y}));

  const planet = earth ? 0 : era;
  const info = earth
    ? `<h3>${ZONES[zone]}</h3>
      <p>One of Earth’s five eras. Time doors move between four spots every 8 turns spent on the surface; which one is open
      depends only on the turn count. Spot 1 always leads to Legends (from Legends, to 9,000,000 B.C.).</p>
      <p class="muted">The surface wraps around at every edge. Earth’s surface is saved when you enter a place, so its monsters and the time door stay put.</p>
      ${era === 4 ? '<p>A rocket landing on Earth always arrives in 2112 A.D.</p>' : ''}`
    : `<h3>${ZONES[zone]}</h3>
      <p>Hyperwarp to <b>${WARP[planet]}</b> (Xeno-Yako-Zabo) and land on grass. Nothing here is saved: dying or quitting on a planet
      resumes from the launch on Earth.</p>
      <p class="muted">The surface wraps around at every edge.</p>`;
  return {
    title: ZONES[zone], subtitle: earth ? 'Earth' : `Planet · warp ${WARP[planet]}`, width: 64, height: 64,
    images: [{src: tileImage(d, id, m.bytes)}], svg, cell, features, info,
    layers: [
      {id: 'names', name: 'Place names', swatch: swatch(label(.5, .8, 'A', .9))},
      ...(earth ? [{id: 'doors', name: 'Time door spots', swatch: swatch(ring(0, 0, C.time, '', .14))}] : []),
      {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false},
    ],
  };
}

// ---------- villages, townes, castles ----------

function renderTown(d, id) {
  const m = d.maps[id], zone = zoneOf(id), towne = typeOf(id) === 2;
  const people = (m.people || []).filter(q => q.x < 64 && q.y < 64);
  const floor = m.bytes.slice();
  for (const q of people) if (floor[q.y * 64 + q.x] === q.tile) floor[q.y * 64 + q.x] = q.under;   // people are stamped into the map
  const base = tileImage(d, id, floor);
  const ppl = canvas(64 * 16, 64 * 16), pctx = ppl.getContext('2d');
  for (const q of people) blit(pctx, d.tiles, 16, tileOf(q.tile), q.x, q.y);
  const talk = q => q.mood >= 0x80 ? ((m.talk || [])[q.mood - 0x81] || '').replace(/:(?=\S)/, ': ') || null : null;

  const parts = {shops: '', locked: '', pickups: '', timedoors: '', talkers: '', start: ring(31, 62, C.start, '.18 .1')};
  const features = [];
  for (let i = 0; i < 4096; i++) {
    const x = i & 63, y = i >> 6, c = floor[i];
    if (c === 0xA0) { parts.locked += ring(x, y, C.door2); features.push({name: 'Locked door', x, y}); }
    if (c === 0x54 || c === 0x58) { parts.pickups += ring(x, y, C.pick, '.16 .1'); features.push({name: c === 0x54 ? 'Armour' : 'Weapon', x, y}); }
    if (c === 0xC0) { parts.timedoors += ring(x, y, C.time, '', .14); features.push({name: 'Time door', x, y}); }
  }
  for (const q of people) {
    const [kind] = PEOPLE[q.tile] || [`Tile ${tileOf(q.tile)}`];
    if (q.tile === 0x68 && !talk(q)) { parts.shops += ring(q.x, q.y, C.shop); features.push({name: `${SHOP(towne, q.x, q.y)} (merchant)`, x: q.x, y: q.y}); }
    else if (talk(q)) { parts.talkers += ring(q.x, q.y, C.talk); features.unshift({name: talk(q).split(/[:\n]/)[0], x: q.x, y: q.y, detail: talk(q)}); }
    else features.push({name: kind, x: q.x, y: q.y});
  }
  const svg = svgDoc(64, 64, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(64, 64)));

  const surface = placesOf(d, zone).find(q => q.map === id);
  const exit = surface ? {label: 'Leave for the surface', map: `${zone}0`, focus: [surface.x, surface.y]} : {label: 'Leave for the surface', map: `${zone}0`};
  const cell = (x, y) => {
    const q = people.find(r => r.x === x && r.y === y), c = floor[y * 64 + x];
    const edge = x === 0 || y === 0 || x === 63 || y === 63;
    if (q) {
      const [kind, line] = PEOPLE[q.tile] || [`Tile ${tileOf(q.tile)}`, null];
      const said = talk(q);
      let body = said ? `<p>“${esc(said).replace(/\n/g, ' ')}”</p><p class="muted">Stands still; Transact to hear it.</p>` : '';
      if (q.tile === 0x6C) body += p('“WELCOME MY CHILD … FIRST MY 50 G.P. TRIBUTE!”, then 300 hit points (200 from 5000, 100 from 7500, none from 9900).');
      else if (q.tile === 0x68 && !said) body += p(`<b>${SHOP(towne, x, y)}</b>: Transact across the counter. ${SHOP_NOTE[SHOP(towne, x, y)]}`, '<span class="muted">The shop depends on the quarter of the map.</span>');
      else if (!said && line) body += p(`“${line}”`);
      if (id === 'X32' || id === 'G32') {
        const n = q.mood - 0x80;
        if (n === 1) body += p('Offer 500 gold: the quick sword Enilno.');
        if (n === 2) body += p('Offer 500 gold: the ring, if you have earned it from Father Antos.');
        if (n === 3) body += p('Offer anything, even 0: a random weapon.');
        if (n === 4) body += p('Offer gold: usually raises an attribute by 4 per hundred.');
      }
      if (id === 'G93' && q.mood === 0x81) body += p('Talking to him earns the ring.');
      return {title: said ? said.split(/[:\n]/)[0].replace(/\s+\w+$/, '') || kind : kind, body: body + p(`Hit points ${q.hp}.`)};
    }
    let title, body = '';
    if (c === 0x70) title = 'Floor';
    else if (c === 0x78) title = 'Wall';
    else if (c === 0x7C) title = 'Counter';
    else if (c === 0xA0) [title, body] = ['Locked door', p('Shown as the letter I. Unlock it with a key (guards carry keys), from the east or west only.')];
    else if (c === 0x54) [title, body] = ['Armour', p('Get: 1 in 4 empty, else cloth, leather or chain. Back every visit.')];
    else if (c === 0x58) [title, body] = ['Weapon', p('Get: 1 in 8 empty, else dagger to light sword. Back every visit.')];
    else if (c === 0x5C) [title, body] = ['Force field', p('1000 damage, unless you wear the ring.')];
    else if (c === 0xC0) [title, body] = ['Time door', p('Leads to the castle of the era the surface door currently points at (1423 B.C. or 1990 A.D.), or hangs the game with “WRONG DISK” half the time.')];
    else if (c >= 0x80) title = 'Lettering';
    else if (TERRAIN[c & 0x7C]) [title, body] = [TERRAIN[c & 0x7C][0], p(TERRAIN[c & 0x7C][1])];
    else title = `Tile ${tileOf(c)}`;
    if (x === 31 && y === 62) body += p('<b>You enter here.</b>');
    return {title, body, links: edge ? [exit] : []};
  };

  const talkers = people.filter(talk).map(q => `<li>${esc(talk(q)).replace(/\n/g, ' ')} <span class="muted">(${q.x}, ${q.y})</span></li>`).join('');
  const shopList = [...new Set(people.filter(q => q.tile === 0x68 && !talk(q)).map(q => SHOP(towne, q.x, q.y)))];
  const info = `<h3>${esc(titleOf(id))}</h3>
    ${shopList.length ? `<p>Shops: ${shopList.join(', ')}.</p>` : ''}
    ${talkers ? `<p>People with something to say:</p><ul>${talkers}</ul>` : ''}
    <p class="muted">Towns are reloaded from the disk on every visit: killed guards, opened doors and taken items are all back.</p>`;
  const layers = [
    {id: 'people', name: 'People'},
    {id: 'talkers', name: 'People who talk', swatch: swatch(ring(0, 0, C.talk))},
    {id: 'shops', name: 'Shops', swatch: swatch(ring(0, 0, C.shop))},
    {id: 'locked', name: 'Locked doors', swatch: swatch(ring(0, 0, C.door2))},
    {id: 'pickups', name: 'Armour and weapons to pick up', swatch: swatch(ring(0, 0, C.pick, '.16 .1'))},
  ];
  if (parts.timedoors) layers.push({id: 'timedoors', name: 'Time doors', swatch: swatch(ring(0, 0, C.time, '', .14))});
  layers.push({id: 'start', name: 'Where you enter', swatch: swatch(ring(0, 0, C.start, '.18 .1'))}, {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false});
  return {title: titleOf(id), subtitle: zone[0] === 'X' ? 'Earth' : 'Planet', width: 64, height: 64,
    images: [{src: base}, {src: ppl.toDataURL(), layer: 'people'}], svg, cell, features, info, layers};
}

// ---------- towers and dungeons ----------

const glyph = {
  wall: (x, y) => rect(x, y, 1, 1, C.wall) + rect(x, y, 1, .12, C.wallTop),
  door: (x, y) => rect(x + .2, y + .2, .6, .6, 'none', `stroke="${C.door}" stroke-width=".1" rx=".05"`),
  secret: (x, y) => rect(x + .2, y + .2, .6, .6, 'none', `stroke="${C.door}" stroke-width=".09" stroke-dasharray=".13 .1" rx=".05"`),
  chest: (x, y) => rect(x + .22, y + .32, .56, .4, '#5a4410', `stroke="${C.chest}" stroke-width=".06" rx=".05"`) + path(`M${x + .22} ${y + .46}H${x + .78}M${x + .5} ${y + .46}V${y + .56}`, C.chest, .05),
  ladder: (x, y, up, down) => path(`M${x + .32} ${y + .12}V${y + .88}M${x + .68} ${y + .12}V${y + .88}M${x + .32} ${y + .3}H${x + .68}M${x + .32} ${y + .5}H${x + .68}M${x + .32} ${y + .7}H${x + .68}`, C.ladder, .06) +
    (up ? `<path d="M${x + .8} ${y + .08}l.15 .2h-.3z" fill="${C.ladder}"/>` : '') + (down ? `<path d="M${x + .8} ${y + .92}l.15 -.2h-.3z" fill="${C.ladder}"/>` : ''),
  start: (x, y) => `<rect x="${x + .05}" y="${y + .05}" width=".9" height=".9" fill="none" stroke="#ffffff" stroke-width=".05" stroke-dasharray=".1 .07" rx=".1"/>`,
};

function renderLevel(d, id, L) {
  const m = d.maps[id], zone = zoneOf(id), tower = typeOf(id) === 4;
  const cells = m.bytes.subarray(L * 256, L * 256 + 256), at = (x, y) => cells[y * 16 + x];
  const parts = {base: '', doors: '', secret: '', chests: '', ladders: ''};
  const features = [];
  let chests = 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = at(x, y);
    parts.base += c & 0x80 && c !== 0xC0 ? glyph.wall(x, y) : rect(x, y, 1, 1, C.floor);
    if (c === 0xC0) parts.doors += glyph.door(x, y);
    if (c === 0xE0) { parts.secret += glyph.secret(x, y); features.push({name: 'Secret door', x, y}); }
    if (c === 0x40) { parts.chests += glyph.chest(x, y); chests++; }
    if (!(c & 0x80) && c & 0x30) { parts.ladders += glyph.ladder(x, y, c & 0x10, c & 0x20); features.unshift({name: ladderName(c, tower, L), x, y}); }
  }
  if (chests) features.push({name: `Chests (${chests})`, x: (() => { for (let i = 0; i < 256; i++) if (cells[i] === 0x40) return i & 15; })(), y: (() => { for (let i = 0; i < 256; i++) if (cells[i] === 0x40) return i >> 4; })()});
  const svg = svgDoc(16, 16, parts.base + Object.entries(parts).filter(([k]) => k !== 'base').map(([k, v]) => g(k, v)).join('') +
    g('grid', gridLines(16, 16)) + (L === 0 ? g('start', glyph.start(5, 5)) : ''));

  const surface = placesOf(d, zone).find(q => q.map === id);
  const out = surface ? {label: 'Out to the surface', map: `${zone}0`, focus: [surface.x, surface.y]} : {label: 'Out to the surface', map: `${zone}0`};
  const go = (l, x, y, verb) => l < 0 ? out : l > 15 ? null : {label: `${verb} to level ${l}`, map: `${id}-${l}`, focus: [x, y]};
  const cell = (x, y) => {
    const c = at(x, y), links = [];
    if (c === 0x80) return {title: 'Wall'};
    if (c === 0xC0) return {title: 'Door', body: p('Walk through it going forward; you can’t back through a door.')};
    if (c === 0xE0) return {title: 'Secret door', body: p('Drawn as a plain wall, but you can walk through it going forward.')};
    if (c === 0x40) return {title: 'Chest', body: p(L === 15 ? '<b>Tri-lithium</b>: every chest on level 15 holds one.' :
      `Get: 3 in 4 gold (up to 77), else ${L % 2 ? 'armour' : 'a weapon'}.`, 'Full again on every visit.')};
    if (c & 0x30) {
      const k = c & 0x10, dn = c & 0x20;
      if (k) links.push(tower ? go(L + 1, x, y, 'Klimb') : go(L - 1, x, y, 'Klimb'));
      if (dn) links.push(tower ? go(L - 1, x, y, 'Descend') : go(L + 1, x, y, 'Descend'));
      return {title: ladderName(c, tower, L), body: (L === 0 && x === 5 && y === 5 ? p('<b>You arrive here.</b>') : '') +
        (id === 'G85' && L === 14 && dn ? p('<b>A trap:</b> level 15 has no ladder back up, and the Up Ladder spell always fails there. Only the cleric’s Surface spell gets you out.') : ''),
        links: links.filter(Boolean)};
    }
    return {title: 'Floor', body: L === 0 && x === 5 && y === 5 ? p('<b>You arrive here.</b>') : ''};
  };

  const kinds = [1, 2, 3, 4, 5, 6, 7].filter(k => 2 * (k - 1) <= L);
  const hp = k => ((2 * k + L) * 8) | 0x10;
  const info = `<h3>${esc(titleOf(id))}, level ${L}</h3>
    <p>Fixed in the game file: the same for every character.${chests ? ` ${chests} chest${chests > 1 ? 's' : ''}${L === 15 ? ', each with tri-lithium' : ''}.` : ''}</p>
    <p>Monsters (at most ${L ? 'two' : 'one'} at a time, reappearing almost at once):</p>
    <table><tr><th>Monster</th><th class="num">HP</th></tr>${kinds.map(k => `<tr><td>${DMON[k]}</td><td class="num">${hp(k)}</td></tr>`).join('')}</table>
    <p>Traps: ${L ? `${L} in 256 per step forward; without tools, death.` : 'none on level 0.'}</p>
    ${id === 'G85' ? '<p class="muted">Pluto’s dungeon ends like a tower: level 15 can be reached but not left by ladder.</p>' : ''}
    <p class="muted">${tower ? 'Towers count floors upward: K)limb goes up, D)escend down, and descending from level 0 leaves.' : 'K)limb goes up, D)escend down; climbing from level 0 leaves.'} You always enter in the dark.</p>`;
  return {
    title: `${titleOf(id)}, level ${L}`, subtitle: ZONES[zone], width: 16, height: 16, svg, cell, features, info,
    layers: [
      {id: 'doors', name: 'Doors', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.door(0, 0))},
      {id: 'secret', name: 'Secret doors', swatch: swatch(rect(0, 0, 1, 1, C.wall) + glyph.secret(0, 0))},
      {id: 'chests', name: 'Chests', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.chest(0, 0))},
      {id: 'ladders', name: 'Ladders', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.ladder(0, 0, true, false))},
      ...(L === 0 ? [{id: 'start', name: 'Where you arrive', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.start(0, 0))}] : []),
      {id: 'grid', name: 'Grid', swatch: swatch(rect(0, 0, 1, 1, C.floor) + path('M.5 0V1M0 .5H1', '#888', .06))},
    ],
  };
}

function ladderName(c, tower, L) {
  const k = c & 0x10, d = c & 0x20;
  const up = tower ? !!k : !!k, down = tower ? !!d : !!d;   // K goes up and D down in both; only the level numbers differ
  if (up && down) return 'Ladder up and down';
  if (up) return (!tower && L === 0) ? 'Ladder up (exit)' : 'Ladder up';
  return (tower && L === 0) ? 'Ladder down (exit)' : 'Ladder down';
}

// ---------- the module ----------

const ORDER = ['X0', 'X1', 'X2', 'X3', 'X4', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'];

export default {
  id: 'u2', title: 'Ultima II', version: 'PC/GOG version. Every map is read from the game files; nothing at map level is random.',
  params: [], transient: [], defaultMap: 'X20',
  maps(params, mapId) {
    if (!maps) return [{id: 'X20', name: '1423 B.C.'}];
    const list = [];
    const m = /^([XG]\d[45])-(\d+)$/.exec(mapId || '');
    if (m) for (let l = 0; l < 16; l++) list.push({id: `${m[1]}-${l}`, name: String(l), title: `Level ${l}`, group: `${titleOf(m[1])}: levels`});
    for (const z of ORDER) for (let t = 0; t <= 5; t++) {
      const id = `${z}${t}`;
      if (!maps.includes(id)) continue;
      list.push({id: t >= 4 ? `${id}-0` : id, name: t === 0 ? 'Surface' : nameOf(id), title: titleOf(id), group: z[0] === 'X' ? `Earth, ${ZONES[z]}` : ZONES[z]});
    }
    return list;
  },
  async render(mapId, params) {
    const d = await load();
    maps = Object.keys(d.maps);
    let m = /^([XG]\d)([0-5])(?:-(\d+))?$/.exec(mapId || '');
    if (!m || !d.maps[m[1] + m[2]]) m = /^(X2)(0)$/.exec('X20');
    const id = m[1] + m[2], type = +m[2];
    if (type === 0) return renderSurface(d, id);
    if (type >= 4) return renderLevel(d, id, Math.min(15, Math.max(0, +(m[3] || 0))));
    return renderTown(d, id);
  },
};
