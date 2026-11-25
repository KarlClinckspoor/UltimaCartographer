// Akalabeth: the world and every dungeon level, computed from the lucky number.
import {world, dungeon, stats, ladderUp, LAND, DG, MONSTERS, STATS} from './akgen.js';

const LEVELS_LISTED = 12;
const MON_LETTER = ['', 'S', 'T', 'R', 'O', 'V', 'C', 'G', 'M', 'D', 'B'];
const MON_DAMAGE = m => m === 1 ? 'L' : `0–${m - 1} + L`;
const MON_NOTE = {
  2: '10% of its attacks steal an item instead.',
  6: 'Drawn hanging from the ceiling.',
  7: '10% of its attacks halve your food instead.',
  8: 'Never moves. Looks like a chest and is named “Chest!”.',
};
const CHEST_ITEMS = 'one food, a rapier, an axe, a shield, a bow or an amulet';

const C = {
  plains: '#1f2a1b', plainsDot: '#33432c', mountainBg: '#272824', mountain: '#a39f90', snow: '#dedbd0',
  tree: '#5d9b48', trunk: '#7a5a38', town: '#d9b56b', dungeon: '#cf5a41', castle: '#f0cf6e',
  floor: '#1b1d18', wall: '#4b4e45', wallTop: '#62665a', door: '#d9a441', hidden: '#d9a441',
  trap: '#e0533e', hole: '#000', chest: '#f0c419', ladder: '#6cc5d9', monster: '#e57aa8', grid: '#ffffff',
};

// ---------- small SVG helpers (coordinates in squares) ----------

const f = n => +n.toFixed(3);
const g = (layer, body) => `<g data-layer="${layer}">${body}</g>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" ${extra}/>`;
const path = (d, stroke, w, extra = '') => `<path d="${d}" ${extra.includes('fill=') ? '' : 'fill="none"'} stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="geometricPrecision">${body}</svg>`;
const swatch = body => `<svg viewBox="0 0 1 1">${body}</svg>`;

function gridLines(w, h) {
  let d = '';
  for (let x = 1; x < w; x++) d += `M${x} 0V${h}`;
  for (let y = 1; y < h; y++) d += `M0 ${y}H${w}`;
  return path(d, C.grid, 0.01, 'opacity=".12"');
}

// Glyphs drawn in a unit square at (x, y).
const glyph = {
  plainsDots: (x, y) => { // a little texture, the same for a square every time
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const a = (h % 7) / 10 + .15, b = ((h >> 3) % 7) / 10 + .15;
    return `<circle cx="${f(x + a)}" cy="${f(y + b)}" r=".03" fill="${C.plainsDot}"/><circle cx="${f(x + 1 - b)}" cy="${f(y + .2 + a / 2)}" r=".025" fill="${C.plainsDot}"/>`;
  },
  mountain: (x, y) => path(`M${x + .08} ${y + .85}L${x + .38} ${y + .3}L${x + .58} ${y + .62}L${x + .7} ${y + .45}L${x + .93} ${y + .85}Z`, C.mountain, .05, `fill="#3a3b35"`) +
    path(`M${f(x + .3)} ${f(y + .45)}L${x + .38} ${y + .3}L${f(x + .46)} ${f(y + .45)}`, C.snow, .05),
  tree: (x, y) => rect(x + .46, y + .55, .08, .3, C.trunk) + `<circle cx="${x + .5}" cy="${y + .42}" r=".28" fill="${C.tree}"/>`,
  town: (x, y) => [[.12, .42, .34], [.5, .32, .38]].map(([dx, top, w]) =>
    path(`M${f(x + dx)} ${y + .82}V${f(y + top + .2)}L${f(x + dx + w / 2)} ${f(y + top)}L${f(x + dx + w)} ${f(y + top + .2)}V${y + .82}Z`, C.town, .05, `fill="#4a3d22"`)).join('') +
    rect(x + .63, y + .64, .1, .18, C.town),
  dungeon: (x, y) => path(`M${x + .15} ${y + .85}V${y + .5}A.35 .35 0 0 1 ${x + .85} ${y + .5}V${y + .85}Z`, C.dungeon, .06, `fill="#0c0c0a"`) +
    path(`M${x + .3} ${y + .62}H${x + .7}M${x + .26} ${y + .73}H${x + .74}`, C.dungeon, .04),
  castle: (x, y) => path(`M${x + .12} ${y + .88}V${y + .3}H${x + .24}V${y + .2}H${x + .36}V${y + .3}H${x + .44}V${y + .2}H${x + .56}V${y + .3}H${x + .64}V${y + .2}H${x + .76}V${y + .3}H${x + .88}V${y + .88}Z`, C.castle, .05, `fill="#4d4120"`) +
    path(`M${x + .42} ${y + .88}V${y + .6}A.08 .08 0 0 1 ${x + .58} ${y + .6}V${y + .88}`, C.castle, .04),
  start: (x, y) => `<circle cx="${x + .5}" cy="${y + .5}" r=".47" fill="none" stroke="#ffffff" stroke-width=".05" stroke-dasharray=".12 .08"/>`,

  wall: (x, y) => rect(x, y, 1, 1, C.wall) + rect(x, y, 1, .12, C.wallTop),
  // Doors, hidden doors: a bar across the gap. A gap at even x joins rooms east and west.
  door: (x, y) => x % 2 === 0 ? rect(x + .4, y + .08, .2, .84, C.door, 'rx=".04"') : rect(x + .08, y + .4, .84, .2, C.door, 'rx=".04"'),
  hidden: (x, y) => x % 2 === 0
    ? path(`M${x + .5} ${y + .1}V${y + .9}`, C.hidden, .09, 'stroke-dasharray=".13 .1"')
    : path(`M${x + .1} ${y + .5}H${x + .9}`, C.hidden, .09, 'stroke-dasharray=".13 .1"'),
  trap: (x, y) => path(`M${x + .25} ${y + .25}L${x + .75} ${y + .75}M${x + .75} ${y + .25}L${x + .25} ${y + .75}`, C.trap, .11),
  hole: (x, y) => `<circle cx="${x + .5}" cy="${y + .5}" r=".3" fill="${C.hole}" stroke="${C.trap}" stroke-width=".06"/>`,
  chest: (x, y) => rect(x + .22, y + .32, .56, .4, '#5a4410', `stroke="${C.chest}" stroke-width=".06" rx=".05"`) + path(`M${x + .22} ${y + .46}H${x + .78}M${x + .5} ${y + .46}V${y + .56}`, C.chest, .05),
  ladder: (x, y, up) => path(`M${x + .32} ${y + .12}V${y + .88}M${x + .68} ${y + .12}V${y + .88}M${x + .32} ${y + .3}H${x + .68}M${x + .32} ${y + .5}H${x + .68}M${x + .32} ${y + .7}H${x + .68}`, C.ladder, .06) +
    (up ? `<path d="M${x + .8} ${y + .08}l.15 .2h-.3z" fill="${C.ladder}"/>` : `<path d="M${x + .8} ${y + .92}l.15 -.2h-.3z" fill="${C.ladder}"/>`),
  monster: (x, y, m) => `<circle cx="${x + .5}" cy="${y + .5}" r=".36" fill="#3a1a28" stroke="${C.monster}" stroke-width=".06"/>` +
    `<text x="${x + .5}" y="${y + .63}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size=".38" fill="${C.monster}">${MON_LETTER[m]}</text>`,
  arrival: (x, y) => `<rect x="${x + .05}" y="${y + .05}" width=".9" height=".9" fill="none" stroke="#ffffff" stroke-width=".05" stroke-dasharray=".1 .07" rx=".1"/>`,
};

// The game's own pictures (akworld.cc drawworld): each square a 58 x 53 picture of light cyan lines on black,
// plains left empty. Coordinates here are the game's pixels within the square.
const CYAN = '#55ffff';
const orig = (() => {
  const L = (x, y, pts) => `<path d="${pts.map(([a, b], i) => `${i ? 'L' : 'M'}${f(x + a / 58)} ${f(y + b / 53)}`).join('')}" fill="none" stroke="${CYAN}" stroke-width=".035" stroke-linecap="square"/>`;
  const R = (x, y, a, b, c, d) => `<rect x="${f(x + a / 58)}" y="${f(y + b / 53)}" width="${f((c - a) / 58)}" height="${f((d - b) / 53)}" fill="none" stroke="${CYAN}" stroke-width=".035"/>`;
  return {
    mountain: (x, y) => L(x, y, [[12, 53], [12, 42], [23, 31], [46, 31], [46, 53]]) + L(x, y, [[0, 10], [12, 10]]) + L(x, y, [[58, 10], [46, 10]]) +
      L(x, y, [[0, 42], [12, 42]]) + L(x, y, [[46, 42], [58, 42]]) + L(x, y, [[12, 0], [12, 21], [23, 21], [23, 31], [35, 31], [35, 11]]) + L(x, y, [[35, 10], [46, 10], [46, 0]]),
    tree: (x, y) => R(x, y, 23, 21, 35, 31),
    town: (x, y) => R(x, y, 11, 10, 23, 21) + R(x, y, 35, 10, 46, 21) + R(x, y, 23, 21, 35, 31) + R(x, y, 11, 31, 23, 43) + R(x, y, 35, 31, 46, 43),
    dungeon: (x, y) => L(x, y, [[23, 21], [34, 31]]) + L(x, y, [[23, 31], [34, 21]]),
    castle: (x, y) => R(x, y, 0, 0, 58, 53) + R(x, y, 12, 10, 46, 42) + L(x, y, [[12, 10], [46, 42]]) + L(x, y, [[46, 10], [12, 42]]),
  };
})();
const swO = k => swatch(rect(0, 0, 1, 1, '#000') + orig[k](0, 0));

const sw = {
  grid: swatch(rect(0, 0, 1, 1, C.plains) + path('M.5 0V1M0 .5H1', '#888', .06)),
  terrain: swatch(rect(0, 0, 1, 1, C.plains) + glyph.mountain(0, 0)),
  trees: swatch(rect(0, 0, 1, 1, C.plains) + glyph.tree(0, 0)),
  towns: swatch(rect(0, 0, 1, 1, C.plains) + glyph.town(0, 0)),
  dungeons: swatch(rect(0, 0, 1, 1, C.plains) + glyph.dungeon(0, 0)),
  castle: swatch(rect(0, 0, 1, 1, C.plains) + glyph.castle(0, 0)),
  start: swatch(rect(0, 0, 1, 1, C.plains) + glyph.start(0, 0)),
  doors: swatch(rect(0, 0, 1, 1, C.floor) + glyph.door(0, 0)),
  hidden: swatch(rect(0, 0, 1, 1, C.wall) + path('M.5 .1V.9', C.hidden, .09, 'stroke-dasharray=".13 .1"')),
  traps: swatch(rect(0, 0, 1, 1, C.floor) + glyph.trap(0, 0)),
  holes: swatch(rect(0, 0, 1, 1, C.floor) + glyph.hole(0, 0)),
  chests: swatch(rect(0, 0, 1, 1, C.floor) + glyph.chest(0, 0)),
  ladders: swatch(rect(0, 0, 1, 1, C.floor) + glyph.ladder(0, 0, true)),
  monsters: swatch(rect(0, 0, 1, 1, C.floor) + glyph.monster(0, 0, 4)),
  arrival: swatch(rect(0, 0, 1, 1, C.floor) + glyph.arrival(0, 0)),
};

const levelOf = mapId => { const m = /^level-(\d+)$/.exec(mapId); return m ? Math.max(1, Math.min(9999, +m[1])) : 0; };
const parseAt = s => { const m = /^(\d+),(\d+)$/.exec(s || ''); return m && +m[1] >= 1 && +m[1] <= 9 && +m[2] >= 1 && +m[2] <= 9 ? [+m[1], +m[2]] : null; };
const p = (...lines) => lines.map(l => `<p>${l}</p>`).join('');

// ---------- the world ----------

function renderWorld(params) {
  const {lucky} = params, game = !params.art;   // art 0: the game's pictures
  const G = game ? orig : glyph;
  const {w, town, castle} = world(lucky);
  const castleLost = w[castle[0]][castle[1]] !== LAND.CASTLE;
  const parts = {terrain: '', trees: '', towns: '', dungeons: '', castle: ''};
  const features = [];
  const count = [0, 0, 0, 0, 0, 0];
  for (let x = 0; x < 21; x++) for (let y = 0; y < 21; y++) {
    const v = w[x][y];
    if (x && y && x < 20 && y < 20) count[v]++;
    parts.terrain += game ? (v === LAND.MOUNTAINS ? orig.mountain(x, y) : '')
      : v === LAND.MOUNTAINS ? rect(x, y, 1, 1, C.mountainBg) + glyph.mountain(x, y) : rect(x, y, 1, 1, C.plains) + glyph.plainsDots(x, y);
    if (v === LAND.TREE) parts.trees += G.tree(x, y);
    if (v === LAND.TOWN) { parts.towns += G.town(x, y); features.push({name: x === town[0] && y === town[1] ? 'Starting town' : 'Town', x, y}); }
    if (v === LAND.DUNGEON) { parts.dungeons += G.dungeon(x, y); features.push({name: 'Dungeon', x, y}); }
    if (v === LAND.CASTLE) { parts.castle += G.castle(x, y); features.push({name: 'Castle of Lord British', x, y}); }
  }
  features.sort((a, b) => (a.name === 'Town') - (b.name === 'Town') || a.name.localeCompare(b.name) || a.y - b.y || a.x - b.x);

  const svg = svgDoc(21, 21, (game ? rect(0, 0, 21, 21, '#000') : '') + parts.terrain + g('trees', parts.trees) + g('towns', parts.towns) +
    g('dungeons', parts.dungeons) + g('castle', parts.castle) + g('grid', gridLines(21, 21)) + g('start', glyph.start(...town)));

  const enter = {label: 'Enter dungeon level 1', map: 'level-1', focus: [1, 1]};
  const cell = (x, y) => {
    const v = w[x][y], start = x === town[0] && y === town[1];
    const startNote = start ? '<p><b>You start here.</b> A new game puts you on a random square and makes it a town.</p>' : '';
    switch (v) {
      case LAND.PLAINS: return {title: 'Plains', body: p('Open ground. No encounters on the surface.')};
      case LAND.MOUNTAINS: return {title: 'Mountains', body: p(x === 0 || y === 0 || x === 20 || y === 20 ? 'The map’s edge: the border is all mountains.' : 'Impassable: “You cant pass the Mountains!”')};
      case LAND.TREE: return {title: 'Trees', body: p('Just ground, like the plains.')};
      case LAND.TOWN: return {title: start ? 'Starting town' : 'Town', body: startNote + p('The Adventure Shop: food, rapier, axe, shield, bow and arrows, magic amulet.') +
        (start && castleLost ? p('The castle was placed here too, and the town replaced it: this world has no castle.') : '')};
      case LAND.DUNGEON: return {title: 'Dungeon entrance', body: p('Every entrance leads to the same levels: only the lucky number decides them.'), links: [enter]};
      case LAND.CASTLE: return {title: 'Castle of Lord British', body: p('Lord British sets the quests: ten in all, each to kill a named monster.')};
    }
    return null;
  };

  const offers = stats(lucky, 3);
  const info = `<h3>This world</h3>
    <p>Starting town at <b>${town[0]}, ${town[1]}</b>. ${castleLost ? 'No castle: the starting town was placed on top of it.' : `Castle at <b>${castle[0]}, ${castle[1]}</b>.`}</p>
    <table><tr><th>Plains</th><td class="num">${count[0]}</td><th>Towns</th><td class="num">${count[3]}</td></tr>
      <tr><th>Mountains</th><td class="num">${count[1]}</td><th>Dungeons</th><td class="num">${count[4]}</td></tr>
      <tr><th>Trees</th><td class="num">${count[2]}</td><th>Castle</th><td class="num">${count[5]}</td></tr></table>
    <p class="muted">Nothing guarantees the castle or a dungeon can be reached: mountains may wall them off.</p>
    <h3>Stats offered</h3>
    <table><tr><th></th>${[1, 2, 3].map(k => `<th class="num">${k === 1 ? '1st' : k === 2 ? '2nd' : '3rd'}</th>`).join('')}</tr>
      ${STATS.map((s, i) => `<tr><th>${s}</th>${offers.map(o => `<td class="num">${o[i]}</td>`).join('')}</tr>`).join('')}</table>
    <p class="muted">Each time you refuse, the next six stats come from the same sequence.</p>`;

  return {
    title: 'The world', subtitle: `Lucky number ${lucky}`, width: 21, height: 21, svg, features, cell, info,
    layers: [
      {id: 'trees', name: 'Trees', swatch: game ? swO('tree') : sw.trees},
      {id: 'towns', name: 'Towns', swatch: game ? swO('town') : sw.towns},
      {id: 'dungeons', name: 'Dungeons', swatch: game ? swO('dungeon') : sw.dungeons},
      {id: 'castle', name: 'Castle', swatch: game ? swO('castle') : sw.castle},
      {id: 'start', name: 'Start', swatch: sw.start},
      {id: 'grid', name: 'Grid', swatch: sw.grid},
    ],
  };
}

// ---------- a dungeon level ----------

function renderLevel(level, params) {
  const {lucky, play} = params;
  const up = ladderUp(level);
  const at = parseAt(params.at) || up;
  const {d, mons} = dungeon(lucky, level, at[0], at[1]);
  const parts = {base: '', doors: '', hidden: '', traps: '', holes: '', chests: '', ladders: '', monsters: ''};
  const features = [];
  const n = {chests: 0, traps: 0, holes: 0, hidden: 0};
  for (let x = 0; x < 11; x++) for (let y = 0; y < 11; y++) {
    const v = d[x][y];
    if (v === DG.WALL || v === DG.HIDDEN_DOOR) parts.base += glyph.wall(x, y);
    else parts.base += rect(x, y, 1, 1, C.floor);
    if (v === DG.DOOR) parts.doors += glyph.door(x, y);
    if (v === DG.HIDDEN_DOOR) { parts.hidden += glyph.hidden(x, y); n.hidden++; features.push({name: 'Hidden door', x, y}); }
    if (v === DG.TRAP) { parts.traps += glyph.trap(x, y); n.traps++; features.push({name: 'Trap', x, y}); }
    if (v === DG.HOLE) { parts.holes += glyph.hole(x, y); n.holes++; features.push({name: 'Hole', x, y}); }
    if (v === DG.CHEST) { parts.chests += glyph.chest(x, y); n.chests++; features.push({name: 'Chest', x, y}); }
    if (v === DG.LADDER_DOWN) { parts.ladders += glyph.ladder(x, y, false); features.push({name: 'Ladder down', x, y}); }
    if (v === DG.LADDER_UP) { parts.ladders += glyph.ladder(x, y, true); features.push({name: level === 1 ? 'Ladder up (exit)' : 'Ladder up', x, y}); }
  }
  for (const [m, [x, y]] of Object.entries(mons)) {
    parts.monsters += glyph.monster(x, y, +m);
    features.unshift({name: MONSTERS[m], x, y, detail: 'monster'});
  }
  const svg = svgDoc(11, 11, parts.base + Object.entries(parts).filter(([k]) => k !== 'base').map(([k, v]) => g(k, v)).join('') +
    g('grid', gridLines(11, 11)) + g('arrival', glyph.arrival(...at)));

  // A fall lands on a gap square, so pass it as the arrival square; a ladder lands on the next level's ladder up.
  const down = (x, y, how, fall) => ({label: `${how} to level ${level + 1}`, map: `level-${level + 1}`, focus: [x, y], params: {at: fall ? `${x},${y}` : null}});
  const upLink = (x, y) => level === 1 ? {label: 'Exit to the surface', map: 'world'} : {label: `Climb to level ${level - 1}`, map: `level-${level - 1}`, focus: [x, y]};
  const monAt = {};
  for (const [m, [x, y]] of Object.entries(mons)) monAt[`${x},${y}`] = +m;

  const cell = (x, y) => {
    const v = d[x][y], m = monAt[`${x},${y}`];
    const isAt = x === at[0] && y === at[1];
    const arrive = !isAt && v === DG.FLOOR && x % 2 && y % 2 ? [{label: 'Arrive on this square', params: {at: `${x},${y}`}, focus: [x, y]}] : [];
    if (m) {
      const hp = 2 * m + 2 * level;
      return {title: MONSTERS[m], body: p(`Hit points <b>${hp + play}</b> (${2 * m} + 2 × level ${level} + level of play ${play}).`,
        `Damage per hit: ${MON_DAMAGE(m).replace('L', level)}.`, ...(MON_NOTE[m] ? [MON_NOTE[m]] : []),
        'Comes back at full strength on its starting square every time the level is entered.')};
    }
    switch (v) {
      case DG.FLOOR: return {title: 'Floor',
        body: (x === 2 && y === 1 ? p('This gap between rooms is always open.') : '') +
          (isAt ? p('<b>You arrive here.</b> No monster is placed on the square you arrive on.') : ''), links: arrive};
      case DG.WALL: return {title: 'Wall', body: x && y && x < 10 && y < 10 && (x % 2) !== (y % 2) ? p('A gap between two rooms that stayed solid wall.') : ''};
      case DG.DOOR: return {title: 'Door', body: p('Walk straight through; there’s nothing to open.')};
      case DG.HIDDEN_DOOR: return {title: 'Hidden door', body: p('Looks exactly like a wall in the game, but you can walk through it.')};
      case DG.TRAP: return {title: 'Trap', body: p(`You fall to level ${level + 1}, onto the same square, for ${3}–${level + 2} damage.`,
        'The trap stays: step on it again and you fall again. About one time in four you land inside a wall (stepping out works).'), links: [down(x, y, 'Fall', true)]};
      case DG.HOLE: return {title: 'Hole', body: p(`Climb down (E, K or X) to level ${level + 1}, onto the same square.`), links: [down(x, y, 'Climb down', true)]};
      case DG.CHEST: return {title: 'Chest', body: p(`“Gold!”: ${level}–${6 * level - 1} gold, and always one item: ${CHEST_ITEMS}.`,
        'Gone once opened, but back the next time you enter the level.')};
      case DG.LADDER_DOWN: return {title: 'Ladder down', body: p(`Arrives on the ladder up of level ${level + 1}.`), links: [down(x, y, 'Climb down')]};
      case DG.LADDER_UP: return {title: level === 1 ? 'Ladder up (exit)' : 'Ladder up',
        body: level === 1 ? p('“Exit Dungeon”: back on the surface at the entrance you took. The hit points you earned from kills this trip are added on the way out.')
          : p(`Arrives on the ladder down of level ${level - 1}.`) + (isAt ? p('<b>You arrive here</b> coming down from above.') : ''),
        links: [upLink(x, y)]};
    }
    return null;
  };

  const monRows = Object.entries(mons).map(([m, [x, y, hp]]) =>
    `<tr><td>${MONSTERS[m]}</td><td class="num">${hp + play}</td><td class="num">${x}, ${y}</td></tr>`).join('');
  const atNote = parseAt(params.at)
    ? `<p>Monsters placed as if you arrived on <b>${at[0]}, ${at[1]}</b>. <a href="#" data-go='{"params":{"at":null}}'>Arrive by the ladder instead</a>.</p>`
    : '';
  const info = `<h3>Level ${level}</h3>
    <table><tr><th>Monster</th><th class="num">HP</th><th class="num">Square</th></tr>${monRows}</table>
    <p>${n.chests} chest${n.chests === 1 ? '' : 's'}, ${n.traps} trap${n.traps === 1 ? '' : 's'}, ${n.holes} hole${n.holes === 1 ? '' : 's'}, ${n.hidden} hidden door${n.hidden === 1 ? '' : 's'}.</p>
    ${atNote}
    <p class="muted">The level is rebuilt every time you enter it: chests refill and killed monsters return.
    Monster squares depend on where you arrive, but by ladder that is always the same square.
    A ladder made with the magic amulet can put you in a room instead: click a floor square and choose “Arrive on this square”.</p>`;

  return {
    title: `Dungeon level ${level}`, subtitle: `Lucky number ${lucky} · level of play ${play}`,
    width: 11, height: 11, svg, features, cell, info,
    layers: [
      {id: 'doors', name: 'Doors', swatch: sw.doors},
      {id: 'hidden', name: 'Hidden doors', swatch: sw.hidden},
      {id: 'traps', name: 'Traps', swatch: sw.traps},
      {id: 'holes', name: 'Holes', swatch: sw.holes},
      {id: 'chests', name: 'Chests', swatch: sw.chests},
      {id: 'ladders', name: 'Ladders', swatch: sw.ladders},
      {id: 'monsters', name: 'Monsters', swatch: sw.monsters},
      {id: 'arrival', name: 'Where you arrive', swatch: sw.arrival},
      {id: 'grid', name: 'Grid', swatch: sw.grid},
    ],
  };
}

export default {
  id: 'u0', title: 'Akalabeth', version: 'PC/GOG version (1997 port). Everything is computed from the lucky number.',
  params: [
    {key: 'lucky', label: 'Lucky number', def: 1234, min: -2147483648, max: 2147483647, random: true,
      help: 'Decides the world, every dungeon level and the stats offered.'},
    {key: 'play', label: 'Level of play (1–10)', def: 1, min: 1, max: 10, help: 'Only adds to the monsters’ hit points.'},
    {key: 'art', label: 'Map style', def: 0, min: 0, max: 1, options: [[0, 'Original'], [1, 'Redrawn']],
      help: 'The world in the game’s own line drawings, or redrawn. The game shows dungeons only in first person, so their maps are always redrawn.'},
  ],
  transient: ['at'],
  defaultMap: 'world',
  maps(params, mapId) {
    const list = [{id: 'world', name: 'World', group: 'Surface'}];
    for (let l = 1; l <= LEVELS_LISTED; l++) list.push({id: `level-${l}`, name: String(l), title: `Dungeon level ${l}`, group: 'Dungeon levels (endless)'});
    const cur = levelOf(mapId);
    if (cur > LEVELS_LISTED) list.push({id: mapId, name: String(cur), title: `Dungeon level ${cur}`, group: 'Dungeon levels (endless)'});
    return list;
  },
  render(mapId, params) {
    const level = levelOf(mapId);
    return level ? renderLevel(level, params) : renderWorld(params);
  },
};
