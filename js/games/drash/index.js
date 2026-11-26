// Escape from Mt. Drash (VIC-20, Sierra On-Line 1983): the 15 levels, made in the browser by the game's own
// generator (drashgen.js) from the random-number state the level starts with.
import {level, chainStart, advance, BOOT_SEED, WALL, KEY, EXIT} from './drashgen.js';
import {g, rect, path, svgDoc, swatch, gridLines, gridSwatch, label, p} from '../../lib/draw.js';

// The VIC-20 palette as the web port shows it (VICE "mike-ntsc").
const VIC = {black: '#000000', white: '#ffffff', red: '#f91137', cyan: '#35f9f6', purple: '#ff3cc6', green: '#3ceda9',
  blue: '#0f57f7', yellow: '#fee963'};

// Per level (MECHANICS.md section 4). Index by level.
const TYPES = ['Gremlin', 'Floating Orb', 'Dancing Demon', 'Phantom', 'Purple Slime'];
const RANKS = ['Qwimby', 'Corporal', 'Cadet', 'Captain', 'Colonel'];
const ROUND = {1: 1.01, 2: 1.01, 3: .86, 4: .86, 5: .71, 6: .71, 7: .56, 8: .56, 9: .41, 10: .41};
const typesAt = lv => TYPES.slice(0, Math.min(5, Math.floor((lv + 1) / 2)));
const keysNeeded = lv => lv < 5 || lv === 15 ? 0 : lv < 13 ? 1 : 2;
const levelOf = id => { const m = /^level-(\d+)$/.exec(id || ''); return m ? Math.max(1, Math.min(15, +m[1])) : 1; };

// ---------- pictures (a square is one map character, 8 x 8 VIC pixels) ----------

const px = 1 / 8;
const glyph = {
  wall: (x, y) => rect(x, y, 1, 1, VIC.red),
  floor: (x, y) => rect(x, y, 1, 1, VIC.black),
  // the exit: a reversed checkerboard character whose colour the interrupt cycles; drawn in two of its colours
  exit: (x, y) => {
    let b = rect(x, y, 1, 1, VIC.yellow);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) b += rect(x + i * px, y + j * px, px, px, VIC.green);
    return b;
  },
  key: (x, y) => path(`M${x + .5} ${y + .1}L${x + .88} ${y + .5}L${x + .5} ${y + .9}L${x + .12} ${y + .5}Z`, VIC.yellow, .02, `fill="${VIC.yellow}"`),
  monster: (x, y) => path(`M${x + .15} ${y + .15}L${x + .85} ${y + .85}M${x + .85} ${y + .15}L${x + .15} ${y + .85}`, VIC.red, .16),
  you: (x, y) => `<rect x="${x + .16}" y="${y + .22}" width=".68" height=".56" rx=".22" fill="none" stroke="${VIC.blue}" stroke-width=".13"/>`,
  teleport: (x, y) => `<circle cx="${x + .5}" cy="${y + .5}" r=".36" fill="none" stroke="${VIC.cyan}" stroke-width=".05" stroke-dasharray=".1 .08"/>`,
};
const sw = {
  monsters: swatch(glyph.floor(0, 0) + glyph.monster(0, 0)),
  keys: swatch(glyph.floor(0, 0) + glyph.key(0, 0)),
  exit: swatch(glyph.exit(0, 0)),
  start: swatch(glyph.floor(0, 0) + glyph.you(0, 0)),
  teleport: swatch(glyph.floor(0, 0) + glyph.teleport(0, 0)),
  route: swatch(glyph.floor(0, 0) + path('M0 .5H1', VIC.purple, .14, 'stroke-dasharray=".2 .12"')),
  grid: gridSwatch,
};

// ---------- the way out ----------

// Steps (tiles) between two tiles over open ground, and the path.
function bfs(z, from, to) {
  const key = (x, y) => x * 16 + y, prev = new Map([[key(...from), null]]), q = [from];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === to[0] && y === to[1]) break;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const a = x + dx, b = y + dy;
      if (a < 1 || b < 1 || a > 11 || b > 11 || z[a][b] === WALL || prev.has(key(a, b))) continue;
      prev.set(key(a, b), [x, y]); q.push([a, b]);
    }
  }
  const out = [];
  for (let c = to; c; c = prev.get(key(...c))) out.unshift(c);
  return out;
}
function route(z, lv) {
  const S = [10, 10], E = [2, 2], K = [[10, 2], [2, 10]];
  const join = legs => legs.reduce((a, l) => a.concat(a.length ? l.slice(1) : l), []);
  const n = keysNeeded(lv);
  if (!n) return join([bfs(z, S, E)]);
  const opts = n === 1 ? K.map(k => [S, k, E]) : [[S, K[0], K[1], E], [S, K[1], K[0], E]];
  return opts.map(o => join(o.slice(1).map((t, i) => bfs(z, o[i], t)))).sort((a, b) => a.length - b.length)[0];
}

// ---------- a level ----------

function seedFor(lv, extra) {
  const c = chainStart(lv);
  const total = Math.max(0, c.draws + extra);
  return {seed: total >= c.draws ? advance(c.seed, total - c.draws) : advance(BOOT_SEED, total), total, chain: c};
}

function renderLevel(lv, params) {
  const extra = params.extra || 0;
  const {seed, total, chain} = seedFor(lv, extra);
  const L = level(lv, seed);
  const {z, mons} = L;
  const sq = (x, y) => [x - 1, y - 1];        // Z%(x, y) -> map square; the map shows x, y = 1..11 as the game does
  const parts = {base: '', monsters: '', keys: '', exit: '', start: '', teleport: '', route: '', labels: ''};
  const features = [];
  for (let x = 1; x <= 11; x++) for (let y = 1; y <= 11; y++) {
    const [a, b] = sq(x, y), v = z[x][y];
    parts.base += v === WALL ? glyph.wall(a, b) : glyph.floor(a, b);
    if (v === KEY) { parts.keys += glyph.key(a, b); features.push({name: 'Key', x: a, y: b}); }
    if (v === EXIT) { parts.exit += glyph.exit(a, b); features.push({name: 'Exit', x: a, y: b}); }
  }
  parts.start = glyph.you(...sq(10, 10));
  features.push({name: 'Start', x: 9, y: 9});
  if (lv < 15) for (let x = 4; x <= 8; x += 2) for (let y = 2; y <= 10; y += 2) parts.teleport += glyph.teleport(...sq(x, y));
  const monAt = {};
  mons.forEach(([x, y], i) => { (monAt[`${x},${y}`] ||= []).push(i + 1); });
  for (const [k, list] of Object.entries(monAt)) {
    const [x, y] = k.split(',').map(Number), [a, b] = sq(x, y);
    parts.monsters += glyph.monster(a, b);
    if (list.length > 1) parts.monsters += label(a + .82, b + .95, `×${list.length}`, .36, VIC.white);
    features.push({name: list.length > 1 ? `${list.length} monsters` : 'Monster', x: a, y: b, detail: `monster ${list.join(', ')}`});
  }
  const way = route(z, lv);
  parts.route = path(way.map(([x, y], i) => `${i ? 'L' : 'M'}${x - .5} ${y - .5}`).join(''), VIC.purple, .14, 'stroke-dasharray=".2 .12" opacity=".9"');
  const steps = way.length - 1;

  const svg = svgDoc(11, 11, parts.base + g('teleport', parts.teleport) + g('route', parts.route) + g('exit', parts.exit) +
    g('keys', parts.keys) + g('start', parts.start) + g('monsters', parts.monsters) + g('grid', gridLines(11, 11)));

  // The next level starts from the state this one leaves, if nothing else draws a number on the way.
  const nextExtra = lv < 15 ? total + L.draws - chainStart(lv + 1).draws : 0;
  const nextLink = lv < 15 ? {label: `Level ${lv + 1} (no fights or teleports on the way)`, map: `level-${lv + 1}`, params: {extra: nextExtra || null}, focus: [9, 9]} : null;
  const types = typesAt(lv);

  const cell = (a, b) => {
    const x = a + 1, y = b + 1, v = z[x][y], here = monAt[`${x},${y}`];
    const isCell = x % 2 === 0 && y % 2 === 0, between = (x % 2) !== (y % 2);
    const tele = isCell && x >= 4 && x <= 8 ? 'One of the 15 cells Teleport (T) can put you in.' : '';
    const monNote = here ? p(`<b>${here.length > 1 ? `${here.length} monsters start` : 'A monster starts'} here</b> (number ${here.join(', ')} of ${mons.length}).`,
      `What it looks like is rolled when the fight starts: ${types.join(', ')}. The picture is all that differs.`,
      lv <= 8 ? 'Moves one square after each of your actions, closing the gap across first, then up or down, never around walls. Keys and the exit block it.'
        : 'Never moves on this level: you fight it only by walking onto it.') : '';
    if (v === EXIT) return {title: 'Exit', body: p('Top-left cell, on every level. The game cycles its colour.',
      keysNeeded(lv) ? `Locked until you have picked up ${keysNeeded(lv) === 1 ? 'one of the two keys' : 'both keys'}; standing on it locked does nothing.` : 'Step on it to leave the level.',
      lv === 15 ? 'The way out of Mt. Drash: leaving here wins the game (Questor).' : '') + monNote, links: nextLink ? [nextLink] : []};
    if (v === KEY) return {title: 'Key', body: p(`Level ${lv} needs ${keysNeeded(lv) === 1 ? 'one of the two keys' : 'both keys'} to open the exit.`,
      'Monsters treat a key like a wall, so one can seal a corridor against them.')};
    if (v === WALL) {
      const outer = x === 1 || y === 1 || x === 11 || y === 11;
      return {title: 'Wall', body: between && !outer ? p('A wall the generator left standing between two cells.',
        'Blast (B) knocks it out when you stand in the cell beside it, facing it; that can add a loop to the maze.')
        : outer ? p('The outer wall: Blast can’t open it (the spell is wasted).') : p('A corner post: always solid.')};
    }
    if (x === 10 && y === 10) return {title: 'Start', body: p('Bottom-right cell, facing north, on every level.') + monNote};
    if (between) return {title: 'Corridor', body: p('A wall the generator knocked through, joining two cells.',
      'Each step is half a cell: from a cell into this gap, then into the next cell.') + monNote};
    return {title: `Cell ${x / 2}, ${y / 2}`, body: (tele ? p(tele) : '') + monNote};
  };

  const monRows = mons.map(([x, y], i) => `<tr><td class="num">${i + 1}</td><td class="num">${x}, ${y}</td></tr>`).join('');
  const shows = lv <= 6 ? 'walls, you, keys, exit, monsters' : lv <= 8 ? 'you, keys, exit, monsters (no walls)' : lv <= 10 ? 'you, keys, exit' : lv < 15 ? 'keys and exit only' : 'nothing';
  const extraNote = extra
    ? `<p>${extra > 0 ? extra : -extra} number${Math.abs(extra) === 1 ? '' : 's'} ${extra > 0 ? 'more' : 'fewer'} than a run with no fights or teleports before this level. <a href="#" data-go='{"params":{"extra":null}}'>Back to that run</a>.</p>`
    : `<p>As in a game from power-on where you never fight or teleport before this level${lv === 1 ? ' (level 1: always this maze after switching the VIC-20 on)' : ''}.</p>`;
  const info = `<h3>Level ${lv}</h3>
    <table>
      <tr><th>Monsters</th><td class="num">${mons.length}</td></tr>
      <tr><th>They move</th><td>${lv <= 8 ? 'yes' : 'no'}</td></tr>
      <tr><th>Keys needed</th><td>${lv === 15 ? '0 (no keys)' : keysNeeded(lv) === 0 ? '0' : `${keysNeeded(lv)} of 2`}</td></tr>
      <tr><th>Spells</th><td>${lv === 15 ? 'none' : '3 (Blast, Teleport, Sleep, shared)'}</td></tr>
      <tr><th>Compass</th><td>${lv <= 11 ? 'yes' : 'no'}</td></tr>
      <tr><th>In-game map shows</th><td>${shows}</td></tr>
      <tr><th>Fights look like</th><td>${types.join(', ')}</td></tr>
      <tr><th>Combat round</th><td>${ROUND[lv] || .26} s</td></tr>
      <tr><th>Rank</th><td>${RANKS[Math.floor((lv - 1) / 3)]}</td></tr>
      <tr><th>Shortest way out</th><td>${steps} steps${keysNeeded(lv) ? ' (with the keys)' : ''}</td></tr>
    </table>
    <table><tr><th class="num">Monster</th><th class="num">Z%(x, y)</th></tr>${monRows}</table>
    <h3>Which maze</h3>
    ${lv === 15 ? '<p>Level 15 is always the same zig-zag; only the monsters move with the random numbers.</p>' : ''}
    <p>The game never seeds its random numbers: BASIC starts every power-on from the same seed, and every maze, monster square,
    fight and teleport takes the next numbers from that one sequence. A level’s maze depends on how many numbers were drawn before it:
    each fight draws one for the monster’s picture and one per round, a teleport two. So the maze beyond level 1 depends on how you played.</p>
    ${extraNote}
    <table><tr><th>Numbers drawn before</th><td class="num">${total}</td></tr>
      <tr><th>RND seed</th><td class="num">${seed.toUpperCase().match(/../g).join(' ')}</td></tr>
      <tr><th>This level draws</th><td class="num">${L.draws}</td></tr></table>
    <p class="muted">Generator: a hunt-and-kill maze on a 5 × 5 grid of cells from cell 2, 3, abandoning the walk one carve in five
    (lines 10000–10095 of the BASIC), ported from the mtdrash decompilation and checked against levels the game made in VICE.</p>`;

  return {
    title: `Level ${lv}`, subtitle: extra ? `${total} random numbers drawn before it` : (lv === 1 ? 'From power-on' : 'From power-on, no fights or teleports'),
    width: 11, height: 11, svg, features, cell, info,
    coords: (a, b) => `Z%(${a + 1},${b + 1})`,
    layers: [
      {id: 'monsters', name: 'Monsters (start)', swatch: sw.monsters},
      ...(keysNeeded(lv) ? [{id: 'keys', name: 'Keys', swatch: sw.keys}] : []),
      {id: 'exit', name: 'Exit', swatch: sw.exit},
      {id: 'start', name: 'Start', swatch: sw.start},
      ...(lv < 15 ? [{id: 'teleport', name: 'Teleport landings', swatch: sw.teleport, on: false}] : []),
      {id: 'route', name: 'Shortest way out', swatch: sw.route, on: false},
      {id: 'grid', name: 'Grid', swatch: sw.grid},
    ],
  };
}

export default {
  id: 'drash', title: 'Escape from Mt. Drash',
  version: 'VIC-20 (Sierra On-Line, 1983). Every level made by the game’s own generator.',
  params: [
    {key: 'extra', label: 'Extra random numbers drawn', def: 0, min: -1000, max: 100000, random: true,
      help: 'How many more random numbers than a run with no fights or teleports were drawn before this level (each fight draws one, plus one per round; a teleport two). 0 on level 1 is the maze you get after switching on.'},
  ],
  transient: ['extra'],
  defaultMap: 'level-1',
  maps() {
    const list = [];
    for (let l = 1; l <= 15; l++) list.push({id: `level-${l}`, name: String(l), title: `Level ${l}`, group: 'Levels'});
    return list;
  },
  render(mapId, params) { return renderLevel(levelOf(mapId), params); },
};
