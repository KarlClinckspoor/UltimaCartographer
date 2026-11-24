// Ultima III: Sosaria, Ambrosia, the 12 townes and castles and the 7 dungeons, from the game files
// (extracted to data/u3 by tools/extract-u3.mjs). Mechanics: u3-decompiled/docs/MECHANICS.md.
import {esc, g, rect, path, svgDoc, swatch, ring, label, gridLines, gridSwatch, p, canvas, blit, image, json, centredGlyphs} from '../../lib/draw.js';

const DATA = new URL('../../../data/u3/', import.meta.url);

const SHAPES = ['Water', 'Grass', 'Brush', 'Forest', 'Mountains', 'Dungeon', 'Towne', 'Castle', 'Floor', 'Chest', 'Horse', 'Frigate',
  'Whirlpool', 'Serpent', 'Man-O-War', 'Pirate', 'Merchant', 'Jester', 'Guard', 'Lord British', 'Fighter', 'Cleric', 'Wizard', 'Thief',
  'Orc', 'Skeleton', 'Giant', 'Daemon', 'Pincher', 'Dragon', 'Balron', 'Exodus', 'Force field', 'Lava', 'Moon gate', 'Wall', 'Void', 'Wall'];
const shapeName = s => s < SHAPES.length ? SHAPES[s] : s <= 57 ? 'Lettering' : {58: 'Snake', 59: 'Snake', 60: 'Magic', 61: 'Fire', 62: 'Shrine', 63: 'Ranger'}[s] || `Shape ${s}`;
const TERRAIN_NOTE = {
  0: 'Only a frigate sails it, and only with the wind.', 4: 'Impassable.', 32: 'Stops the party and costs the first member without the Mark of Force 99 hit points.',
  33: 'Costs 50 hit points to everyone without the Mark of Fire; the party passes.', 12: 'Swallows a frigate and carries the party to Ambrosia.',
};

// Townes and castles: file, name, entrance on Sosaria, where you arrive inside.
const TOWNS = [
  ['BRITISH', 'Castle British', 45, 18, 'castle'], ['EXODUS', 'Castle Exodus', 10, 53, 'castle'],
  ['LCB', 'LCB', 46, 19, 'towne'], ['MOON', 'Moon', 6, 13, 'towne'], ['YEW', 'Yew', 34, 16, 'towne'],
  ['MONTOR_E', 'Montor East', 49, 58, 'towne'], ['MONTOR_W', 'Montor West', 47, 58, 'towne'], ['GREY', 'Grey', 7, 44, 'towne'],
  ['DAWN', 'Dawn', 37, 53, 'towne'], ['DEVIL', 'Devil Guard', 18, 31, 'towne'], ['FAWN', 'Fawn', 30, 2, 'towne'], ['DEATH', 'Death Gulch', 56, 31, 'towne'],
];
const DUNGEONS = [['DARDIN', 'Dardin’s Pit', 46, 7], ['FIRE', 'Fire', 49, 34], ['MINE', 'Mines of Morinia', 9, 28], ['PERINIAN', 'Perinian', 56, 6],
  ['TIME', 'Time', 58, 30], ['M', 'M', 19, 57], ['P', 'P', 58, 44]];
const GATES = [[8, 8], [57, 46], [15, 27], [36, 58], [15, 29], [12, 55], [31, 31], [58, 31]];
const SHRINES = [[4, 36, 'Strength'], [45, 52, 'Dexterity'], [6, 6, 'Intelligence'], [55, 27, 'Wisdom']];
const SERVICES = ['Pub', 'Grocer', 'Temple', 'Weapons', 'Armour', 'Guild', 'Radrion the oracle', 'Equine Emporium'];
const SERVICE_NOTE = {
  Pub: 'Pay 7 gold or more for a tip; the tens digit picks it.', Grocer: '1 gold a ration.', Temple: 'Cure 100, heal 200, resurrect 500, recall from ashes 900.',
  Weapons: 'Dagger to two-handed sword; selling pays the full price.', Armour: 'Cloth to plate; selling pays the full price.',
  Guild: 'Gems 75, keys 50, powders 90, torches 6.', 'Radrion the oracle': 'Pay 0-900 gold for one verse of a rhyme about marks, shrines, cards and the Lord of Time.',
  'Equine Emporium': '200 gold a party member: the party rides a horse.',
};
const MOVES = ['Stands still.', 'Wanders.', 'Comes towards the party (never attacks).', 'Hostile: chases the party and attacks.'];
const EVENTS = {1: 'Time vision', 2: 'Fountain', 3: 'Strange wind', 4: 'Trap', 5: 'Red hot rod', 6: 'Gremlins', 8: 'Misty writing'};
const DMON = ['Orc', 'Skeleton', 'Giant', 'Daemon', 'Pincher', 'Dragon', 'Balron'];

const C = {wall: '#4b4e45', wallTop: '#62665a', floor: '#1b1d18', door: '#d9a441', ladder: '#6cc5d9', chest: '#f0c419', event: '#b48cff',
  shop: '#e0b354', talk: '#8cc6e0', gate: '#b48cff', start: '#ffffff', lock: '#e57a7a', shrine: '#6cd98a'};

let loading = null;
const load = () => loading ||= (async () => {
  const [d, tiles, charset] = await Promise.all([json(new URL('u3.json', DATA), 'run tools/extract-u3.mjs'), image(new URL('tiles.png', DATA)), image(new URL('charset.png', DATA))]);
  d.charset = charset; d.glyph = centredGlyphs(charset);
  for (const m of Object.values(d.maps)) m.bytes = Uint8Array.from(m.cells.match(/../g), b => parseInt(b, 16));
  for (const m of Object.values(d.dungeons)) m.bytes = Uint8Array.from(m.cells.match(/../g), b => parseInt(b, 16));
  d.tiles = tiles; d.png = {};
  return d;
})();

function mapImage(d, key, cells) {
  if (d.png[key]) return d.png[key];
  const c = canvas(64 * 16, 64 * 16), ctx = c.getContext('2d');
  for (let i = 0; i < 4096; i++) blit(ctx, d.tiles, 16, cells[i] >> 2, i & 63, i >> 6);
  return d.png[key] = c.toDataURL();
}
function peopleImage(d, people) {
  const c = canvas(64 * 16, 64 * 16), ctx = c.getContext('2d');
  for (const q of people) blit(ctx, d.tiles, 16, q.tile >> 2, q.x, q.y);
  return c.toDataURL();
}
// The map with the people taken off (they are written into it, MonUnder holds the cell underneath).
function floorOf(m) {
  const f = m.bytes.slice();
  for (const q of m.people) if (f[q.y * 64 + q.x] === q.tile) f[q.y * 64 + q.x] = q.under;
  return f;
}

// ---------- Sosaria and Ambrosia ----------

function renderWorld(d, key) {
  const m = d.maps[key], sosaria = key === 'SOSARIA', floor = floorOf(m);
  let names = '', gates = '', marks = '';
  const features = [];
  if (sosaria) {
    // Labels go right of the icon, except where a neighbour would be covered.
    const left = new Set(['MONTOR_W']), above = new Set(['TIME']);
    const put = (key, name, x, y, color) => names += left.has(key) ? label(x - .08, y + .78, name, .8, color, 'end')
      : above.has(key) ? label(x + .5, y - .2, name, .8, color) : label(x + 1.08, y + .78, name, .8, color, 'start');
    for (const [file, name, x, y] of TOWNS) { put(file, name, x, y, '#f4efe0'); features.push({name, x, y}); }
    for (const [file, name, x, y] of DUNGEONS) { put(file, name, x, y, '#ffb0a0'); features.push({name: `Dungeon: ${name}`, x, y}); }
    GATES.forEach(([x, y], k) => { gates += ring(x, y, C.gate, '', .14) + label(x + .5, y - .2, `phase ${k}`, .7, C.gate); features.push({name: `Moon gate, phase ${k}`, x, y}); });
    marks += ring(5, 58, C.talk, '.18 .1');
    features.push({name: 'Whirlpool (start)', x: 5, y: 58});
  } else {
    for (const [x, y, attr] of SHRINES) { names += label(x + 1.08, y + .78, `Shrine of ${attr}`, .8, '#bff5c9', 'start'); features.push({name: `Shrine of ${attr}`, x, y}); }
    marks += ring(32, 54, C.start, '.18 .1') + ring(32, 58, C.talk, '.18 .1');
    features.push({name: 'Where the whirlpool leaves you', x: 32, y: 54}, {name: 'Whirlpool home', x: 32, y: 58});
  }
  const svg = svgDoc(64, 64, g('names', names) + (sosaria ? g('gates', gates) : '') + g('marks', marks) + g('grid', gridLines(64, 64)));

  const cell = (x, y) => {
    const s = floor[y * 64 + x] >> 2, links = [];
    if (sosaria) {
      const t = TOWNS.find(r => r[2] === x && r[3] === y), dn = DUNGEONS.find(r => r[2] === x && r[3] === y);
      if (t) {
        const dawn = t[0] === 'DAWN';
        return {title: t[1], body: (dawn ? p('Dawn is only here while both moons line up: the cell turns into a towne when both reach phase 7 and back into forest when both reach 0. Its shops alone sell the +2 and +4 goods.') : '') +
          p(t[4] === 'castle' ? 'You enter at the south edge.' : 'You enter at the west edge.'), links: [{label: 'Enter', map: t[0], focus: t[4] === 'castle' ? [32, 62] : [1, 32]}]};
      }
      if (dn) return {title: `Dungeon: ${dn[1]}`, body: p('Eight levels, fixed in the game file. You arrive on level 1 at (1, 1), facing east, in the dark.'), links: [{label: 'Enter level 1', map: `${dn[0]}-1`, focus: [1, 1]}]};
      const k = GATES.findIndex(([a, b]) => a === x && b === y);
      if (k >= 0) return {title: `Moon gate (phase ${k})`, body: p(`Stands here while the first moon is in phase ${k}. Stepping in takes the party to the gate of the second moon’s phase.`)};
      if (x === 5 && y === 58) return {title: 'The whirlpool', body: p('Where it starts. It wanders the sea, destroys frigates and carries a party it swallows to Ambrosia.')};
    } else {
      const sh = SHRINES.find(r => r[0] === x && r[1] === y);
      if (sh) return {title: `Shrine of ${sh[2]}`, body: p(`E)nter and offer gold: each hundred raises ${sh[2]} by one point, up to the race’s maximum.`, 'Also where the four cards come from.')};
      if (x === 32 && y === 54) return {title: 'Arrival', body: p('The whirlpool leaves the party here, on foot.')};
      if (x === 32 && y === 58) return {title: 'Whirlpool', body: p('The only way back to Sosaria, by frigate. Fighting a pirate ship from land leaves its frigate.')};
    }
    const q = m.people.find(r => r.x === x && r.y === y);
    if (q) return {title: shapeName(q.tile >> 2), body: p(MOVES[q.talk >> 6], 'Back at this spot on every visit.')};
    return {title: shapeName(s), body: p(TERRAIN_NOTE[s] || '')};
  };

  const info = sosaria
    ? `<h3>Sosaria</h3><p>Ten townes, two castles and seven dungeons. The map wraps around and is saved with the game.</p>
      <p>The moon gate on the map is the one of the first moon’s phase; stepping in leads to the gate of the second moon’s phase.</p>
      <p class="muted">Monsters appear at random as you travel; none are stored in the map.</p>`
    : `<h3>Ambrosia</h3><p>Reached only through the whirlpool. Four shrines raise attributes for gold. Nothing is saved: the 16 creatures are back every visit, and foes hit 30 harder.</p>
      <p class="muted">Mountains ring the whole map; the only way out is the whirlpool, by frigate.</p>`;
  const layers = [{id: 'names', name: 'Place names', swatch: swatch(label(.5, .8, 'A', .9))}];
  if (sosaria) layers.push({id: 'gates', name: 'Moon gates', swatch: swatch(ring(0, 0, C.gate, '', .14))});
  if (m.people.length) layers.push({id: 'people', name: 'Creatures'});
  layers.push({id: 'marks', name: 'Whirlpool', swatch: swatch(ring(0, 0, C.talk, '.18 .1'))}, {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false});
  const images = [{src: mapImage(d, key, floor)}];
  if (m.people.length) images.push({src: peopleImage(d, m.people), layer: 'people'});
  return {title: sosaria ? 'Sosaria' : 'Ambrosia', subtitle: 'Ultima III', width: 64, height: 64, images, svg, cell, features, info, layers};
}

// ---------- townes and castles ----------

function shopOf(floor, q) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = q.x + dx, cy = q.y + dy, px = q.x + 2 * dx, py = q.y + 2 * dy;
    if (cx < 0 || cy < 0 || cx > 63 || cy > 63 || px < 0 || py < 0 || px > 63 || py > 63) continue;
    const c = floor[cy * 64 + cx], s = floor[py * 64 + px] >> 2;
    if (c < 0x94 || c > 0xE4) continue;
    if (!(s >= 1 && s <= 11 && s !== 4)) continue;   // the party must be able to stand there
    return {service: dx === 1 ? SERVICES[7] : SERVICES[py & 7], from: [px, py]};   // facing west is always the Equine Emporium
  }
  return null;
}

function renderTown(d, key) {
  const m = d.maps[key], t = TOWNS.find(r => r[0] === key), castle = t[4] === 'castle';
  const floor = floorOf(m);
  const parts = {talkers: '', shops: '', locked: '', start: ring(...(castle ? [32, 62] : [1, 32]), C.start, '.18 .1')};
  const features = [];
  const speech = q => (q.talk & 63) ? m.speeches[(q.talk & 63) - 1] : null;
  for (const q of m.people) {
    const s = q.tile >> 2, sp = speech(q), shop = s === 16 ? shopOf(floor, q) : null;
    if (shop) { parts.shops += ring(q.x, q.y, C.shop); features.push({name: shop.service, x: q.x, y: q.y}); }
    else if (sp) { parts.talkers += ring(q.x, q.y, C.talk); features.push({name: sp.replace(/\n/g, ' '), x: q.x, y: q.y}); }
    else features.push({name: shapeName(s), x: q.x, y: q.y});
  }
  for (let i = 0; i < 4096; i++) if (floor[i] === 0xB8) { parts.locked += ring(i & 63, i >> 6, C.lock); features.push({name: 'Locked door', x: i & 63, y: i >> 6}); }
  const svg = svgDoc(64, 64, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(64, 64)));
  const exit = {label: 'Leave for Sosaria', map: 'SOSARIA', focus: [t[2], t[3]]};

  const cell = (x, y) => {
    const q = m.people.find(r => r.x === x && r.y === y), c = floor[y * 64 + x], s = c >> 2;
    const links = x === 0 || y === 0 || x === 63 || y === 63 ? [exit] : [];
    if (q) {
      const ks = q.tile >> 2, sp = speech(q), shop = ks === 16 ? shopOf(floor, q) : null;
      let body = sp ? `<p>“${esc(sp).replace(/\n/g, ' ')}”</p>` : '';
      if (shop) body += p(`<b>${shop.service}</b>: Transact from ${shop.from[0]}, ${shop.from[1]}, across the counter. ${SERVICE_NOTE[shop.service]}`);
      if (ks === 19) body += p('Transact with him: +100 maximum hit points each time, while your experience allows, up to 2550; from 550 on only with the Mark of Kings.');
      return {title: shop ? `Merchant: ${shop.service}` : shapeName(ks), body: body + p(MOVES[q.talk >> 6])};
    }
    let title = shapeName(s), body = '';
    if (c === 0xB8) [title, body] = ['Locked door', p('Shown as the letter I. Unlock it with a key, standing east or west of it.')];
    else if (s === 9) body = p('A chest: gold, and maybe a weapon or armour. Back every visit; some are trapped.');
    else if (TERRAIN_NOTE[s]) body = p(TERRAIN_NOTE[s]);
    if ((castle && x === 32 && y === 62) || (!castle && x === 1 && y === 32)) body += p('<b>You enter here.</b>');
    return {title, body, links};
  };
  const talkers = m.people.filter(speech).map(q => `<li>${esc(speech(q)).replace(/\n/g, ' ')} <span class="muted">(${q.x}, ${q.y})</span></li>`).join('');
  const services = [...new Set(m.people.filter(q => q.tile >> 2 === 16).map(q => shopOf(floor, q)?.service).filter(Boolean))];
  const info = `<h3>${esc(t[1])}</h3>
    ${key === 'LCB' ? '<p class="muted">Named after the sign in its square; the game never names it otherwise.</p>' : ''}
    ${services.length ? `<p>Services: ${services.join(', ')}.</p>` : ''}
    ${talkers ? `<p>What people say:</p><ul>${talkers}</ul>` : ''}
    <p class="muted">Nothing in a towne is saved: chests, people, unlocked doors and an angry guard all reset on the next visit.</p>`;
  return {
    title: t[1], subtitle: castle ? 'Castle' : 'Towne', width: 64, height: 64,
    images: [{src: mapImage(d, key, floor)}, {src: peopleImage(d, m.people), layer: 'people'}], svg, cell, features, info,
    layers: [{id: 'people', name: 'People'}, {id: 'talkers', name: 'People who talk', swatch: swatch(ring(0, 0, C.talk))},
      {id: 'shops', name: 'Merchants', swatch: swatch(ring(0, 0, C.shop))}, {id: 'locked', name: 'Locked doors', swatch: swatch(ring(0, 0, C.lock))},
      {id: 'start', name: 'Where you enter', swatch: swatch(ring(0, 0, C.start, '.18 .1'))}, {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
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
  event: (x, y, n) => `<circle cx="${x + .5}" cy="${y + .5}" r=".3" fill="#2a1d3a" stroke="${C.event}" stroke-width=".06"/><text x="${x + .5}" y="${y + .62}" text-anchor="middle" font-size=".34" font-family="Georgia, serif" font-weight="700" fill="${C.event}">${{1: 'T', 2: 'F', 3: 'W', 4: 'X', 5: 'R', 6: 'G', 8: 'M'}[n] || '?'}</text>`,
  start: (x, y) => `<rect x="${x + .05}" y="${y + .05}" width=".9" height=".9" fill="none" stroke="#ffffff" stroke-width=".05" stroke-dasharray=".1 .07" rx=".1"/>`,
};

// view.c ShowDungeonMap (Peer at a gem): the CHARSET.ULT character printed for each cell value
const gemChar = c => c === 0xC0 ? 1 : c === 0xA0 ? 2 : c === 0x80 ? 3 : c === 0x30 ? 4 : c === 0x20 ? 5 : c === 0x10 ? 6 : c === 0 ? 0 : 0x3F;
// a small label in a cell's corner, leaving the gem glyph visible
const badge = (x, y, text, color) => `<rect x="${x + .02}" y="${y + .02}" width="${.14 + .17 * String(text).length}" height=".34" rx=".06" fill="#000" opacity=".8"/><text x="${x + .09}" y="${y + .29}" font-size=".3" font-family="system-ui, sans-serif" font-weight="700" fill="${color}">${esc(String(text))}</text>`;

function eventNote(n, x, msg) {
  switch (n) {
    case 1: return 'The Time Lord: “The one way is Love, Sol, Moons & Death, all else fails.”';
    case 2: return `Drink: ${['poison', 'healed to full', 'lose 25 hit points', 'poison cured'][x & 3]} (decided by the fountain’s column). Stays.`;
    case 3: return 'Puts the light out. Stays.';
    case 4: return 'Only the first member’s dexterity can evade it; otherwise the whole party is hurt. Then gone.';
    case 5: return `Gives the <b>Mark of ${['Force', 'Fire', 'the Snake', 'Kings'][x & 3]}</b> and costs 50 hit points. Stays.`;
    case 6: return 'A random member loses 100 food. Then gone.';
    case 8: return `The level’s message: “${esc(msg)}”. Then gone.`;
  }
  return '';
}

function renderLevel(d, key, L) {
  const dn = DUNGEONS.find(r => r[0] === key), m = d.dungeons[key];
  const cells = m.bytes.subarray((L - 1) * 256, L * 256), at = (x, y) => cells[y * 16 + x];
  // the level as the gem view prints it: one CHARSET.ULT character a cell, '?' for what it has no sign for
  const gem = canvas(256, 256), gctx = gem.getContext('2d');
  const parts = {marks: ''};
  const features = [];
  let chests = 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = at(x, y);
    d.glyph(gctx, gemChar(c), x, y);
    if (c === 0xA0) features.push({name: 'Secret door', x, y});
    if (c === 0x40) { parts.marks += badge(x, y, 'C', C.chest); chests++; features.push({name: 'Chest', x, y}); }
    if (c < 0x80 && c & 0x30) features.unshift({name: c === 0x30 ? 'Ladder up and down' : c & 0x10 ? 'Ladder up' : 'Ladder down', x, y});
    if (c >= 1 && c <= 8 && c !== 7) { parts.marks += badge(x, y, {1: 'T', 2: 'F', 3: 'W', 4: 'X', 5: 'R', 6: 'G', 8: 'M'}[c], C.event); features.push({name: c === 2 ? `Fountain (${['poison', 'heal', 'harm', 'cure'][x & 3]})` : c === 5 ? `Rod: Mark of ${['Force', 'Fire', 'the Snake', 'Kings'][x & 3]}` : EVENTS[c], x, y}); }
  }
  const svg = svgDoc(16, 16, g('marks', parts.marks) + g('grid', gridLines(16, 16)) + (L === 1 ? g('start', glyph.start(1, 1)) : ''));
  const id = l => `${key}-${l}`;
  const cell = (x, y) => {
    const c = at(x, y), links = [];
    if (c === 0x80 || (c > 0x80 && c < 0xA0) || (c > 0xA0 && c < 0xC0)) return {title: 'Wall'};
    if (c === 0xA0) return {title: 'Secret door', body: p('Drawn as a wall; walking forward goes through. A gem or the Vieda spell shows it.')};
    if (c >= 0xC0) return {title: 'Door', body: p('Walk in going forward. You can’t turn or back up while standing in it.')};
    if (c === 0x40) return {title: 'Chest', body: p('Get chest: gold, sometimes a weapon or armour; may be trapped. Back on every visit.')};
    if (c >= 1 && c <= 8 && c !== 7) return {title: c === 2 ? `Fountain: ${['poison', 'healing', 'harm', 'cure'][x & 3]}` : c === 5 ? `Red hot rod: Mark of ${['Force', 'Fire', 'the Snake', 'Kings'][x & 3]}` : EVENTS[c], body: p(eventNote(c, x, m.messages[L - 1]))};
    if (c & 0x30) {
      if (c & 0x10) links.push(L === 1 ? {label: 'Klimb out to Sosaria', map: 'SOSARIA', focus: [dn[2], dn[3]]} : {label: `Klimb to level ${L - 1}`, map: id(L - 1), focus: [x, y]});
      if (c & 0x20 && L < 8) links.push({label: `Descend to level ${L + 1}`, map: id(L + 1), focus: [x, y]});
      return {title: c === 0x30 ? 'Ladder up and down' : c & 0x10 ? 'Ladder up' : 'Ladder down', body: L === 1 && x === 1 && y === 1 ? p('<b>You arrive here.</b>') : '', links};
    }
    return {title: 'Floor', body: (L === 1 && x === 1 && y === 1 ? p('<b>You arrive here.</b>') : '') + p('Wandering monsters only attack on floor squares.')};
  };
  const kinds = DMON.slice(0, Math.min(L + 1, 7));
  const info = `<h3>${esc(dn[1])}, level ${L}</h3>
    <p>Misty writing: “${esc(m.messages[L - 1])}”</p>
    <p>${chests} chest${chests === 1 ? '' : 's'}. Encounters: ${((L + 1) / 256 * 100).toFixed(1)}% a turn on a floor square, from ${kinds.join(', ')}; the party’s square becomes a chest before the fight.</p>
    <p>Drawn as the gem view (Peer at a gem, or Vieda) draws it, signs from the game’s own font; it prints “?” for chests and the special squares, so letters say what each is: C chest, F fountain, R rod, T Time Lord, W wind, X trap, G gremlins, M misty writing.</p>
    <p class="muted">Fixed in the game file, the same for everyone. Every level wraps at its edges. Light is only for the view: you can move and fight in the dark.</p>`;
  return {
    title: `${dn[1]}, level ${L}`, subtitle: 'Dungeon', width: 16, height: 16, wrap: true, native: 16, images: [{src: gem, layer: 'gem'}], svg, cell, features, info,
    layers: [
      {id: 'gem', name: 'Gem view'},
      {id: 'marks', name: 'What the “?” squares are', swatch: swatch(badge(.2, .3, 'F', C.event))},
      ...(L === 1 ? [{id: 'start', name: 'Where you arrive', swatch: swatch(rect(0, 0, 1, 1, C.floor) + glyph.start(0, 0))}] : []),
      {id: 'grid', name: 'Grid', swatch: swatch(rect(0, 0, 1, 1, C.floor) + path('M.5 0V1M0 .5H1', '#888', .06))},
    ],
  };
}

export default {
  id: 'u3', title: 'Ultima III', version: 'PC/GOG version. Every map is read from the game files.',
  params: [], transient: [], defaultMap: 'SOSARIA',
  maps(params, mapId) {
    const list = [{id: 'SOSARIA', name: 'Sosaria'}, {id: 'AMBROSIA', name: 'Ambrosia'}];
    const m = /^([A-Z_]+)-(\d)$/.exec(mapId || '');
    if (m && DUNGEONS.some(r => r[0] === m[1])) for (let l = 1; l <= 8; l++) list.push({id: `${m[1]}-${l}`, name: String(l), title: `Level ${l}`, group: `${DUNGEONS.find(r => r[0] === m[1])[1]}: levels`});
    for (const t of TOWNS) list.push({id: t[0], name: t[1], group: t[4] === 'castle' ? 'Castles' : 'Townes'});
    for (const dn of DUNGEONS) list.push({id: `${dn[0]}-1`, name: dn[1], group: 'Dungeons'});
    return list;
  },
  async render(mapId, params) {
    const d = await load();
    const m = /^([A-Z_]+)-([1-8])$/.exec(mapId || '');
    if (m && d.dungeons[m[1]]) return renderLevel(d, m[1], +m[2]);
    if (TOWNS.some(t => t[0] === mapId)) return renderTown(d, mapId);
    if (mapId && mapId !== 'SOSARIA' && mapId !== 'AMBROSIA') throw new Error(`no map ${mapId}`);   // the viewer then opens the default map and fixes the address
    return renderWorld(d, mapId === 'AMBROSIA' ? 'AMBROSIA' : 'SOSARIA');
  },
};
