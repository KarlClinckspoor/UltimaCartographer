// Ultima V: Britannia and the Underworld, the 32 settlements floor by floor, the 8 dungeons and their
// rooms, from the game files (data/u5, by tools/extract-u5.mjs). Townsfolk stand where their schedule
// puts them at the hour chosen, and show their whole conversation. Game logic: u5-decompiled/u5d/src.
import {placeLabels, esc, g, rect, path, svgDoc, swatch, ring, label, gridLines, gridSwatch, p, canvas, image, json, tileLayer, rnd, chain} from '../../lib/draw.js';

const DATA = new URL('../../../data/u5/', import.meta.url);

const SHOP_KIND = ['Armourer', 'Pub', 'Stables', 'Shipwright', 'Reagents', 'Provisioner', 'Healer', 'Inn'];   // dialog numbers 0x81-0x88
const AI = {0: 'Stays put', 1: 'Wanders', 2: 'Wanders widely', 3: 'A child: runs away', 4: 'Keeps shop', 6: 'Demands, attacks or follows', 7: 'Works'};
const DUNGEON_STYLE = [3, 1, 1, 3, 3, 2, 2, 1];   // DungeonMainLoop: 3 brick (Deceit, Wrong, Covetous), 2 cave (Shame, Hythloth), 1 stalactites
const WALL_TEXT = [['Bottomless Pit'], ['The Maze of Lost Souls'], [], ['The Prison Wrong'], ['The Crypt', 'Upper Crypts', 'Lower Crypts', 'Debters Ally'], ['Deep', 'Deeper', 'Deepest'], ['Mother Lode Maze'], []];
const FOUNTAIN = ['cures poison', 'heals fully', 'poisons', 'tastes bad (hurts)'];
const FIELD = ['sleep', 'poison gas', 'fire', 'electric'];
const ITEM = {1: 'a chest', 2: 'a sack of gold', 3: 'a potion', 4: 'a scroll', 5: 'a weapon', 6: 'a shield', 7: 'a ring of keys', 8: 'a gem', 9: 'a helm', 10: 'a ring',
  11: 'some armour', 12: 'an amulet', 13: 'some torches', 15: 'some food', 0x19: 'a strange rock', 0x1E: 'a rotting body', 0x1F: 'a moldy corpse'};
const EQUIP_ITEM = new Set([5, 6, 9, 10, 11, 12]), COUNT_ITEM = new Set([2, 7, 8, 13, 15]);
const ENTRY_RULE = {13: 'Only while you have no keys.', 14: 'Once a day.', 15: 'Only while you do not own one.'};   // FindHiddenItem entries 0xd-0xf
const KIND = n => n <= 8 ? 'Townes' : n <= 12 ? 'Lighthouses' : n <= 16 ? 'Huts' : n <= 18 ? 'Castles' : n <= 24 ? 'Villages' : n <= 32 ? 'Keeps' : 'Dungeons';
const FLOOR = z => z < 0 ? 'Cellar' : z === 0 ? 'Ground floor' : `Upper floor ${z}`;
// tiles that are a place's entrance on the big maps: huts, villages, townes, keeps, castles, dungeons, the Lycaeum's kind
const PLACE_TILE = new Set([16, 17, 18, 19, 20, 21, 22, 23, 24, 27, 57, 62]);

const C = {wall: '#4b4e45', wallTop: '#62665a', floor: '#1b1d18', door: '#d9a441', ladder: '#6cc5d9', chest: '#f0c419', event: '#b48cff',
  shop: '#e0b354', talk: '#8cc6e0', gate: '#b48cff', sign: '#f4efe0', item: '#6cd98a', room: '#e57aa8', shrine: '#bff5c9', stair: '#c9a0ff'};

let loading = null;
const load = () => loading ||= (async () => {
  const [d, tiles, font0, font1] = await Promise.all([json(new URL('u5.json', DATA), 'run tools/extract-u5.mjs'), image(new URL('tiles.png', DATA)),
    image(new URL('font0.png', DATA)), image(new URL('font1.png', DATA))]);
  d.fonts = [font0, font1];
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)), hex = h => Uint8Array.from(h.match(/../g), b => parseInt(b, 16));
  d.britBytes = b64(d.brit); d.underBytes = b64(d.under);
  for (const t of Object.values(d.towns)) { t.bytes = {}; for (const [z, h] of Object.entries(t.floors)) t.bytes[z] = hex(h); t.people = t.people.filter(q => q.type); }
  d.dungeonBytes = d.dungeons.map(hex);
  for (const r of d.rooms) r.bytes = hex(r.map);
  d.tiles = tiles;
  return d;
})();

const cap = s => s.replace(/^\w/, c => c.toUpperCase());
const tname = (d, t) => { const s = d.look[t]; return !s || s === 'x' || s === '*' ? `Tile ${t}` : cap(s.replace(/^(a|an|some) /, '')); };
// ---------- animation (u5d src/world.c AnimateActors, AnimateTiles; EGA.DRV's tile routine, driver call 0x60) ----------
// While the game waits for a key (party.c GetChar) it waits for the next timer tick (pollkey.c, WaitTicks(1)) and
// then makes one animation pass and redraws (view.c UpdateFrame): about 110 ms a pass under GOG's DOSBox (OpenU5
// measured 110-117 ms). One pass:
//   AnimateTiles: waterfalls (D4-D7) and fountains (D8-DB) step to their next frame; on odd passes the snake sign
//     (EC-EF) steps and the torture tiles (80-83) swap with their partner; on every fourth pass the clock (FA-FB) and
//     the bellows (FC-FD) swap. A square shows tileFrames[its tile], so neighbours in a group keep their offsets.
//   EGA.DRV: water (01-03) and lava (8F) scroll down one pixel row (the bottom row comes back at the top; deep ocean,
//     00, keeps still); rivers (60-6F, masks 70-7F), coasts (34-37) and water corners (E4-E7, masks D0-D3) get the
//     scrolled water copied into their water (the mask's bright pixels); the keep, castle and pennant (12, 15, 3E)
//     swap pixel rows 0 and 2, the small castle (14) rows 2 and 4 of its left half, each with a 1-in-2 chance; and
//     fires, sconces and stoves (B0-B3, BC-BF, DE) flicker: their colour bits under the mask tiles (C0-C3, CC-CF,
//     C2) are XORed with random bits, so they come out at random.
//   AnimateActors: every person and creature runs its own little script of frames (animSequences, ultima.c).
const PASS_MS = 110;
const EGA_RGB = ['000000', '0000aa', '00aa00', '00aaaa', 'aa0000', 'aa00aa', 'aa5500', 'aaaaaa', '555555', '5555ff', '55ff55', '55ffff', 'ff5555', 'ff55ff', 'ffff55', 'ffffff'];
const SCROLL = new Set([0x01, 0x02, 0x03, 0x8F]);
const maskOf = n => n >= 0x60 && n <= 0x6F ? n + 0x10 : n >= 0x34 && n <= 0x37 ? n - 0x34 + 0xD0 : n >= 0xE4 && n <= 0xE7 ? n - 0xE4 + 0xD0 : -1;
const FLAGS = {0x12: [0, 2, 16], 0x15: [0, 2, 16], 0x3E: [0, 2, 16], 0x14: [2, 4, 8]};   // rows swapped, pixels wide
const fireMask = n => (n >= 0xB0 && n <= 0xB3) || (n >= 0xBC && n <= 0xBF) ? n + 0x10 : n === 0xDE ? 0xC2 : -1;
const FIRE_KEYS = 64;
// the tile a square of tile n shows after `tick` passes (AnimateTiles)
// the eight moon phases, 0 new to 4 full and back (the game's MoonPhases: NewMoon = 0 ... FullMoon = 4)
const MOON = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];

function shownTile(n, tick) {
  const cycle = (base, k) => base + ((n - base + k) & 3);
  if (n >= 0xD4 && n <= 0xD7) return cycle(0xD4, tick);
  if (n >= 0xD8 && n <= 0xDB) return cycle(0xD8, tick);
  if (n >= 0xEC && n <= 0xEF) return cycle(0xEC, tick >> 1);
  if (n >= 0x80 && n <= 0x83) return n ^ ((tick >> 1) & 1);
  if (n >= 0xFA && n <= 0xFD) return n ^ ((tick >> 2) & 1);
  return n;
}
const cycles = n => shownTile(n, 1) !== n || shownTile(n, 2) !== n || shownTile(n, 4) !== n;
const animated = [];
for (let n = 0; n < 0x100; n++) if (cycles(n) || SCROLL.has(n) || maskOf(n) >= 0 || FLAGS[n] || fireMask(n) >= 0) animated.push(n);
function frame(n, tick) {
  if (!tick || n >= 0x100) return 0;
  if (SCROLL.has(n)) return tick % 16;
  if (maskOf(n) >= 0) return 1 + tick % 16;
  if (FLAGS[n]) return rnd(tick, n) < .5 ? 1 : 0;
  if (fireMask(n) >= 0) return 1 + Math.floor(rnd(tick, n) * FIRE_KEYS);
  const t = shownTile(n, tick);
  return t === n ? 0 : t;
}
let sheetPx = null;
const tileCache = new Map(), waterCache = new Map();
const waterAt = (d, by) => waterCache.get(by) || waterCache.set(by, scrolled(tilePx(d, 0x03), by)).get(by);
function tilePx(d, n) {
  if (tileCache.has(n)) return tileCache.get(n);
  if (!sheetPx) { const c = canvas(d.tiles.width, d.tiles.height), x = c.getContext('2d'); x.drawImage(d.tiles, 0, 0); sheetPx = x.getImageData(0, 0, c.width, c.height); }
  const out = new Uint8ClampedArray(16 * 16 * 4), ox = (n % 16) * 16, oy = (n >> 4) * 16;
  for (let y = 0; y < 16; y++) out.set(sheetPx.data.subarray(((oy + y) * sheetPx.width + ox) * 4, ((oy + y) * sheetPx.width + ox + 16) * 4), y * 64);
  tileCache.set(n, out);
  return out;
}
const EGA_INDEX = new Map(EGA_RGB.map((h, i) => [parseInt(h, 16), i]));
const egaOf = (px, o) => EGA_INDEX.get(px[o] << 16 | px[o + 1] << 8 | px[o + 2]) ?? -1;
const setEga = (px, o, c) => { const v = parseInt(EGA_RGB[c], 16); px[o] = v >> 16; px[o + 1] = v >> 8 & 255; px[o + 2] = v & 255; };
function scrolled(px, by) {
  const out = new Uint8ClampedArray(px.length);
  for (let y = 0; y < 16; y++) out.set(px.subarray(y * 64, y * 64 + 64), ((y + by) % 16) * 64);
  return out;
}
function picture(d) {
  return (n, key, ctx) => {
    if (cycles(n)) {
      // a frame of a cycling group: another tile's picture
      ctx.drawImage(d.tiles, (key % 16) * 16, (key >> 4) * 16, 16, 16, 0, 0, 16, 16);
      return;
    }
    const img = ctx.getImageData(0, 0, 16, 16), px = img.data;
    if (SCROLL.has(n)) px.set(scrolled(px, key));
    else if (maskOf(n) >= 0) {
      const water = waterAt(d, key - 1), mask = tilePx(d, maskOf(n));
      for (let o = 0; o < px.length; o += 4) if (egaOf(mask, o) >= 8) px.set(water.subarray(o, o + 4), o);
    } else if (FLAGS[n]) {
      const [a, b, wide] = FLAGS[n], ra = px.slice(a * 64, a * 64 + wide * 4);
      px.copyWithin(a * 64, b * 64, b * 64 + wide * 4); px.set(ra, b * 64);
    } else if (fireMask(n) >= 0) {
      const mask = tilePx(d, fireMask(n));
      for (let o = 0; o < px.length; o += 4) {
        const m = egaOf(mask, o), c = egaOf(px, o);
        if (m > 0 && c >= 0) setEga(px, o, c ^ (Math.floor(rnd(key, o) * 16) & m));
      }
    }
    ctx.putImageData(img, 0, 0);
  };
}
// AnimateActors for one actor (its actor tile, 0x34 up): its frame after each pass, from its script. A pass with a
// wait pending only counts it down; otherwise half the passes do nothing (not for the playing bard, 5C, or the
// mimic, A8), and the rest run the script until it shows a frame or starts a wait: 1-4 show frame base + op - 1,
// 0 starts again, 5 shows the actor's own tile and waits 6 one time in 4, 6 starts again 3 times in 4, 7 goes to
// step 2, 8N waits N passes (8F: for good).
const SEQ = [
  [2, 3, 4, 5], [1, 2, 3, 4], [1, 2, 3, 4, 3, 4, 1, 2], [1, 2, 3, 4, 0x87], [1, 0x8F, 2, 3, 4], [2, 0x84, 3, 0x84, 4, 0x84, 5],
  [1, 2, 1, 2, 3, 4, 2, 3, 4], [2, 3, 4, 3, 2, 5], [1, 0x8F, 2, 3, 4, 7], [2, 0x82, 3, 0x82, 4, 0x82, 6, 1], [1, 2, 3, 5]];
// animSequences[0xb0 + (base - 0x34) / 4]: which script each family of four frames runs
const SEQ_OF = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 9, 0, 1, 6, 1, 1, 0, 4, 0, 3, 0, 10, 0, 1, 0, 1, 0, 1,
  0, 1, 7, 0, 7, 0, 0, 2, 8, 0, 0];
function actorFrames(tiles) {
  return tiles.map((tile, i) => {
    const base = tile & 0xFC;
    if (base < 0x34 || base === 0xE8 || base === 0xB4) return () => tile;
    const seq = SEQ[SEQ_OF[(base - 0x34) >> 2]] || [];
    const op = k => k < seq.length ? seq[k] : 0;
    const run = chain({step: 0, delay: 0, anim: tile}, (s, tick) => {
      let {step, delay, anim} = s, r = 0;
      if (delay === 0xF) return s;
      if (delay) return {step, delay: delay - 1, anim};
      if (base !== 0x5C && base !== 0xA8 && rnd(i, tick, r++) < .5) return s;
      for (let guard = 0; guard < 32; guard++) {
        const o = op(step);
        if (o === 0) { step = 0; continue; }
        if (o <= 4) { anim = base + o - 1; step++; break; }
        if (o === 5) {
          if (rnd(i, tick, r++) < .25) { anim = tile; if (base === 0x5C) step++; else delay = 6; break; }
          step++; continue;
        }
        if (o === 6) { if (rnd(i, tick, r++) < .75) step = 0; else step++; continue; }
        if (o === 7) { step = 2; continue; }
        delay = o - 0x80; step++; break;
      }
      return {step, delay, anim};
    });
    return tick => run(tick).anim;
  });
}
// the view's draw() and animate for a 16-pixel tile map, with people over it (sprite tile = 0x100 + actor tile)
function animatedMap(d, bytes, w, h, sprites = [], spriteLayer) {
  const f = actorFrames(sprites.map(q => q.tile - 0x100));
  return {
    animate: {ms: PASS_MS},
    draw: tileLayer({w, h, sheet: d.tiles, at: (x, y) => bytes[y * w + x], frame, picture: picture(d), animated,
      sprites, spriteLayer, spriteTile: (i, tick) => 0x100 + f[i](tick)}),
  };
}

function itemText(d, h) {
  let s = ITEM[h.tile] || tname(d, h.tile + 0x100).toLowerCase();
  if (EQUIP_ITEM.has(h.tile) && d.equip[h.value]) s += `: ${d.equip[h.value]}`;
  else if (COUNT_ITEM.has(h.tile) && h.value < 0xFF) s += ` (${h.value})`;
  return s;
}
const hiddenAt = (d, loc, floor) => d.hidden.map((h, i) => ({...h, i})).filter(h => h.loc === loc && h.floor === floor);
const searchHTML = (d, list) => list.map(h => p(`<b>Search here: ${esc(itemText(d, h))}.</b> ${ENTRY_RULE[h.i] || 'Once.'}`)).join('');
const signHTML = s => `<p class="sign">${esc(s.text).replace(/\n/g, '<br>')}</p>`;

// ---------- Britannia and the Underworld ----------

// The sextant's reading (cast2.c CAST2_06ec: the sextant, outdoors in Britannia at night, and In Wis): latitude from y, longitude from x, each as two letters, the high
// and low nibble, A for 0;
// the game prints them in runes.
export const sextant = (x, y) => { const L = v => String.fromCharCode(65 + v); return `latitude ${L(y >> 4)}'${L(y & 15)}", longitude ${L(x >> 4)}'${L(x & 15)}"`; };
async function renderBig(d, under) {
  const W = 256, bytes = under ? d.underBytes : d.britBytes, floor = under ? -1 : 0;
  const parts = {names: '', shrines: '', gates: '', signs: '', items: ''}, features = [];
  // a place belongs on the map whose square there is a settlement or dungeon tile: Ararat and Doom lie in the Underworld,
  // and the same squares in Britannia are plain terrain (and the reverse for every other place)
  const places = d.places.filter(pl => PLACE_TILE.has(bytes[pl.y * W + pl.x]));
  // labels placed together so none covers another (Lord British's castle and the two halves of Britanny sit side by
  // side); a moongate's label is its moonstone's phase as a moon (0 new, 4 full)
  const items = [];
  for (const pl of places) {
    const small = pl.n >= 19 && pl.n <= 21;
    items.push({x: pl.x, y: pl.y, text: pl.name, size: small ? .6 : .9, color: pl.n > 32 ? '#ffb0a0' : '#f4efe0', first: small ? 'above' : 'right', layer: 'names'});
    features.push({name: pl.name, x: pl.x, y: pl.y, detail: KIND(pl.n)});
  }
  const shrines = under ? [] : d.shrines.filter(s => s.x || s.y);
  for (const s of shrines) { items.push({x: s.x, y: s.y, text: `Shrine of ${s.virtue}`, size: .8, color: C.shrine, layer: 'shrines'}); features.push({name: `Shrine of ${s.virtue}`, x: s.x, y: s.y, detail: 'shrine'}); }
  const gates = d.moonstones.map((m, i) => ({...m, i})).filter(m => m.buried && m.under === under);
  for (const m of gates) { parts.gates += ring(m.x, m.y, C.gate, '', .14); items.push({x: m.x, y: m.y, text: `${MOON[m.i]} ${m.i}`, size: 1, color: C.gate, first: 'above', layer: 'gates'}); features.push({name: `Moongate (${MOON[m.i]} phase ${m.i})`, x: m.x, y: m.y}); }
  placeLabels(items).forEach((svg, i) => { parts[items[i].layer] += svg; });
  const signs = d.signs.filter(s => s.loc === 0 && s.floor === floor);
  for (const s of signs) { parts.signs += ring(s.x, s.y, C.sign, '.12 .08', .1); features.push({name: s.text.replace(/\n/g, ' '), x: s.x, y: s.y, detail: 'sign'}); }
  const hidden = hiddenAt(d, 0, floor);
  for (const h of hidden) { parts.items += ring(h.x, h.y, C.item, '.16 .1', .12); features.push({name: cap(itemText(d, h)), x: h.x, y: h.y, detail: 'search'}); }
  const svg = svgDoc(W, W, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(W, W)));
  const cell = (x, y) => {
    const t = bytes[y * W + x], links = [];
    let body = '';
    const pl = places.find(q => q.x === x && q.y === y), sh = shrines.find(s => s.x === x && s.y === y), gate = gates.find(m => m.x === x && m.y === y);
    for (const s of signs) if (s.x === x && s.y === y) body += signHTML(s);
    body += searchHTML(d, hidden.filter(h => h.x === x && h.y === y));
    if (gate) body += p(`<b>Moongate.</b> A moonstone (phase ${gate.i}) is buried here when the game starts; at night a gate stands on it and sends you to the stone of the moons’ phase. Dig a stone up and bury it elsewhere to move the gate.`);
    if (sh) body += p(`Mantra: <b>${esc(sh.mantra.toUpperCase())}</b>. Meditate here on a quest for ${esc(sh.virtue)}; the Shadowlords may have taken the shrine.`);
    if (pl && pl.n <= 32) {
      links.push({label: `Enter ${pl.name}`, map: `P${pl.n}.0`, focus: [15, 30]});
    }
    if (pl && pl.n > 32) links.push(under ? {label: `Klimb up into ${pl.name}, level 8`, map: `D${pl.n - 33}-8`, focus: [x & 7, y & 7]} : {label: `Enter ${pl.name}, level 1`, map: `D${pl.n - 33}-1`, focus: [x & 7, y & 7]});
    if (pl && pl.n > 32) body += p(under ? `${pl.name}’s bottom level opens here.` : `The dungeon’s entrance. Its bottom level leads down into the Underworld at this same square.`);
    if (pl && pl.n > 32) links.push(under ? {label: 'The same square in Britannia', map: 'brit', focus: [x, y]} : {label: 'The same square in the Underworld', map: 'under', focus: [x, y]});
    return {title: pl ? pl.name : sh ? `Shrine of ${sh.virtue}` : tname(d, t), body, links};
  };
  const info = under
    ? `<h3>The Underworld</h3><p>256 × 256 squares beneath Britannia. Each dungeon’s bottom level opens onto it at the square of the dungeon’s entrance above, so the dungeons are the ways between the two lands.</p>`
    : `<h3>Britannia</h3><p>256 × 256 squares. The eight moonstones start buried at the moongates; at night a gate stands wherever a stone lies buried.</p>
       <p class="muted">Dotted green rings mark squares where Search finds something; dotted white ones are signs.</p>`;
  // both wrap: the position is a byte and the outdoor chunk window is masked with & 0x1f (mainout.c)
  return {title: under ? 'The Underworld' : 'Britannia', subtitle: 'Ultima V', width: W, height: W, native: 16, wrap: true, ...animatedMap(d, bytes, W, W), svg, cell, features, info, coords: under ? null : sextant,
    layers: [{id: 'names', name: 'Place names', swatch: swatch(label(.5, .8, 'A', .9))},
      ...(under ? [] : [{id: 'shrines', name: 'Shrines', swatch: swatch(label(.5, .8, 'S', .9, C.shrine))}, {id: 'gates', name: 'Moongates (at game start)', swatch: swatch(ring(0, 0, C.gate, '', .14))}]),
      {id: 'signs', name: 'Signs', swatch: swatch(ring(0, 0, C.sign, '.12 .08'))},
      {id: 'items', name: 'Things to search for', swatch: swatch(ring(0, 0, C.item, '.16 .1', .12))},
      {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}]};
}

// ---------- settlements ----------

// The schedule in force at an hour: at hours[0] they go to place 0, at hours[1] to 1, at hours[2] to 2, at hours[3] back to 1.
const SLOT = [0, 1, 2, 1];
function slotAt(q, hour) {
  if (q.hours.every(h => !h)) return 0;
  let best = -1, bestAgo = 99;
  q.hours.forEach((h, i) => { const ago = (hour - h + 24) % 24; if (ago < bestAgo) { bestAgo = ago; best = i; } });
  return SLOT[best];
}
const hh = h => `${String(h).padStart(2, '0')}:00`;

function talkHTML(sc) {
  const fmt = s => esc(s)
    .replace(/\{avatar\}/g, '<i>(your name)</i>').replace(/\{gold (\d+)\}/g, '<span class="tag">takes $1 gold</span> ')
    .replace(/\{give (\d+)\}/g, '<span class="tag">gives something</span> ').replace(/\{karma\+\}/g, '<span class="tag">karma +1</span> ').replace(/\{karma-\}/g, '<span class="tag">karma −1</span> ')
    .replace(/\{guards\}/g, '<span class="tag">calls the guards</span> ').replace(/\{join\}/g, '<span class="tag">joins you</span> ').replace(/\{askname\}/g, '<span class="tag">asks your name</span> ')
    .replace(/\{ifknown\}\{label (\d+)\}/g, (m, n) => `<span class="tag">if they know your name: Q${+n + 1}</span> `).replace(/\{label (\d+)\}/g, (m, n) => `<span class="tag">→ Q${+n + 1}</span> `)
    .replace(/\{end\}/g, '<span class="tag">ends the talk</span>').replace(/\{rune\}/g, '<span class="tag">in runes</span> ')
    .replace(/\{[a-z+\- 0-9]+\}/g, ' ').replace(/\s+/g, ' ').trim();
  const row = (k, v) => v ? `<tr><th>${esc(k)}</th><td>${fmt(v)}</td></tr>` : '';
  let h = `<table>${row('Look', sc.look)}${row('Hello', sc.greeting)}${row('Job', sc.job)}${row('Bye', sc.bye)}${sc.qa.map(q => row(q.k.join(', '), q.a)).join('')}</table>`;
  for (const l of sc.labels) {
    h += `<p><b>Q${l.n + 1}:</b> <i>${fmt(l.ask)}</i></p><table>${l.qa.map(q => row(q.k.join(', '), q.a)).join('')}${l.text.map(t => row('otherwise', t)).join('')}</table>`;
  }
  return h + '<p class="muted">Keywords match on their first four letters.</p>';
}

async function renderTown(d, n, z, hour) {
  const t = d.towns[n], pl = d.places[n - 1], bytes = t.bytes[z], floors = Object.keys(t.bytes).map(Number).sort((a, b) => a - b);
  const at = (x, y) => bytes[y * 32 + x];
  const here = t.people.map(q => { const s = slotAt(q, hour); return {...q, slot: s, px: q.x[s], py: q.y[s], pz: q.z[s]}; }).filter(q => q.pz === z);
  const scripts = d.talk[t.file];
  const shopOf = q => { if (q.talk < 0x81 || q.talk > 0x88) return null; const k = q.talk - 0x81, i = d.shops.maps[k].indexOf(n); return {kind: SHOP_KIND[k], name: i >= 0 ? d.shops.names[k][i] : SHOP_KIND[k], keeper: i >= 0 ? d.shops.keepers[k][i] : ''}; };
  const parts = {talkers: '', shops: '', stairs: '', signs: '', items: ''}, features = [];
  for (const q of here) {
    const s = shopOf(q), sc = scripts[q.talk];
    if (s) { parts.shops += ring(q.px, q.py, C.shop); features.push({name: s.name, x: q.px, y: q.py, detail: s.kind}); }
    else if (sc) { parts.talkers += ring(q.px, q.py, C.talk); features.push({name: sc.name, x: q.px, y: q.py, detail: `${sc.job} ${sc.qa.flatMap(r => r.k).join(' ')}`}); }
    else features.push({name: tname(d, q.type + 0x100), x: q.px, y: q.py});
  }
  const signs = d.signs.filter(s => s.loc === n && s.floor === z), hidden = hiddenAt(d, n, z);
  for (const s of signs) { parts.signs += ring(s.x, s.y, C.sign, '.12 .08', .1); features.push({name: s.text.replace(/\n/g, ' '), x: s.x, y: s.y, detail: 'sign'}); }
  for (const h of hidden) { parts.items += ring(h.x, h.y, C.item, '.16 .1', .12); features.unshift({name: cap(itemText(d, h)), x: h.x, y: h.y, detail: 'search'}); }
  const isStair = c => c >= 0xC4 && c <= 0xC7, isLadder = c => c === 0xC8 || c === 0xC9;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (isStair(at(x, y)) || isLadder(at(x, y))) parts.stairs += ring(x, y, C.stair, '.2 .1', .08);
  const svg = svgDoc(32, 32, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(32, 32)));
  const fid = zz => `P${n}.${zz}`;

  const cell = (x, y) => {
    const c = at(x, y), links = [];
    if (x === 0 || y === 0 || x === 31 || y === 31) links.push({label: 'Leave for Britannia', map: 'brit', focus: [pl.x, pl.y]});
    if (c === 0xC8 && t.bytes[z + 1]) links.push({label: `Klimb up to the ${FLOOR(z + 1).toLowerCase()}`, map: fid(z + 1), focus: [x, y]});
    if (c === 0xC9 && t.bytes[z - 1]) links.push({label: `Klimb down to the ${FLOOR(z - 1).toLowerCase()}`, map: fid(z - 1), focus: [x, y]});
    if (isStair(c)) for (const zz of [z + 1, z - 1]) if (t.bytes[zz] && isStair(t.bytes[zz][y * 32 + x])) links.push({label: `Stairs to the ${FLOOR(zz).toLowerCase()}`, map: fid(zz), focus: [x, y]});
    if (isStair(c) && !links.some(l => l.map && l.map !== 'brit')) for (const zz of [z + 1, z - 1]) if (t.bytes[zz]) links.push({label: `Stairs (probably) to the ${FLOOR(zz).toLowerCase()}`, map: fid(zz), focus: [x, y]});
    let body = signs.filter(s => s.x === x && s.y === y).map(signHTML).join('') + searchHTML(d, hidden.filter(h => h.x === x && h.y === y));
    const q = here.find(r => r.px === x && r.py === y);
    if (q) {
      const s = shopOf(q), sc = scripts[q.talk];
      const stops = (q.hours.some(Boolean) ? [0, 1, 2, 3] : [0]).map(i => ({i, sl: SLOT[i]}));
      const schedHTML = `<p class="muted">${stops.map(({i, sl}) => `${q.hours.some(Boolean) ? `From ${hh(q.hours[i])}: ` : 'Always: '}${q.x[sl]}, ${q.y[sl]}${q.z[sl] !== z ? ` (${FLOOR(q.z[sl]).toLowerCase()})` : ''}, ${(AI[q.ai[sl]] || '').toLowerCase()}`).join('<br>')}</p>`;
      for (const {i, sl} of stops) if (q.hours.some(Boolean) && (q.x[sl] !== x || q.y[sl] !== y || q.z[sl] !== z)) links.push({label: `At ${hh(q.hours[i])}`, map: fid(q.z[sl]), params: {hour: q.hours[i]}, focus: [q.x[sl], q.y[sl]]});
      if (s) return {title: s.name, body: p(`${s.kind}${s.keeper ? `, kept by ${esc(s.keeper)}` : ''}.`) + schedHTML + body, links};
      if (sc) return {title: sc.name.replace(/\{[^}]*\}/g, '') || tname(d, q.type + 0x100), body: `<p class="muted">${esc(tname(d, q.type + 0x100))}</p>` + talkHTML(sc) + schedHTML + body, links};
      const role = q.talk === 0xFF ? p(n === 5 ? 'Asks half your gold “to charity” to let you pass.' : n === 18 ? 'Lets you pass if you give the password while wearing the Black Badge.' : 'Demands 10 gold per party member to let you pass.') : '';
      return {title: tname(d, q.type + 0x100), body: role + schedHTML + body, links};
    }
    return {title: tname(d, c), body, links};
  };

  const services = [...new Set(t.people.map(shopOf).filter(Boolean).map(s => `${s.name} (${s.kind.toLowerCase()})`))];
  const named = t.people.map(q => scripts[q.talk]).filter(Boolean).map(sc => sc.name.replace(/\{[^}]*\}/g, ''));
  const info = `<h3>${esc(pl.name)}${floors.length > 1 ? `, ${FLOOR(z).toLowerCase()}` : ''}</h3>
    <p>People are shown where they stand at ${hh(hour)}; change the hour to follow their day. Click anyone to read their whole conversation and where they go.</p>
    ${services.length ? `<p>Shops: ${services.map(esc).join(', ')}.</p>` : ''}
    ${named.length ? `<p>People: ${[...new Set(named)].map(esc).join(', ')}.</p>` : ''}
    <p class="muted">Dashed violet rings: stairs and ladders. Dotted green: search here. Dotted white: signs.</p>`;
  return {
    title: pl.name, subtitle: `${KIND(n).replace(/s$/, '')}${floors.length > 1 ? ` · ${FLOOR(z)}` : ''} · ${hh(hour)}`,
    width: 32, height: 32, native: 16, ...animatedMap(d, bytes, 32, 32, here.map(q => ({tile: q.type + 0x100, x: q.px, y: q.py})), 'people'), svg, cell, features, info,
    layers: [{id: 'people', name: 'People'}, {id: 'talkers', name: 'People who talk', swatch: swatch(ring(0, 0, C.talk))},
      {id: 'shops', name: 'Shopkeepers', swatch: swatch(ring(0, 0, C.shop))}, {id: 'stairs', name: 'Stairs and ladders', swatch: swatch(ring(0, 0, C.stair, '.2 .1', .08))},
      {id: 'signs', name: 'Signs', swatch: swatch(ring(0, 0, C.sign, '.12 .08'))}, {id: 'items', name: 'Things to search for', swatch: swatch(ring(0, 0, C.item, '.16 .1', .12))},
      {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
  };
}

// ---------- dungeons ----------

const glyph = {
  wall: (x, y, col = C.wall) => rect(x, y, 1, 1, col) + rect(x, y, 1, .12, C.wallTop),
  door: (x, y, col = C.door) => rect(x + .2, y + .2, .6, .6, 'none', `stroke="${col}" stroke-width=".1" rx=".05"`),
  secret: (x, y) => rect(x + .2, y + .2, .6, .6, 'none', `stroke="${C.door}" stroke-width=".09" stroke-dasharray=".13 .1" rx=".05"`),
  chest: (x, y, open) => rect(x + .22, y + .32, .56, .4, open ? 'none' : '#5a4410', `stroke="${C.chest}" stroke-width=".06" rx=".05"`) + path(`M${x + .22} ${y + .46}H${x + .78}M${x + .5} ${y + .46}V${y + .56}`, C.chest, .05),
  ladder: (x, y, up, down) => path(`M${x + .32} ${y + .12}V${y + .88}M${x + .68} ${y + .12}V${y + .88}M${x + .32} ${y + .3}H${x + .68}M${x + .32} ${y + .5}H${x + .68}M${x + .32} ${y + .7}H${x + .68}`, C.ladder, .06) +
    (up ? `<path d="M${x + .8} ${y + .08}l.15 .2h-.3z" fill="${C.ladder}"/>` : '') + (down ? `<path d="M${x + .8} ${y + .92}l.15 -.2h-.3z" fill="${C.ladder}"/>` : ''),
  mark: (x, y, letter, color) => `<circle cx="${x + .5}" cy="${y + .5}" r=".32" fill="#1d1a24" stroke="${color}" stroke-width=".06"/><text x="${x + .5}" y="${y + .63}" text-anchor="middle" font-size=".36" font-family="Georgia, serif" font-weight="700" fill="${color}">${letter}</text>`,
};
const roomIndex = (k, r) => k === 1 ? -1 : (k === 0 ? 0 : k - 1) * 16 + r;   // EnterRoom: 16 rooms a dungeon in DUNGEON.CBT, Despise has none

function describe(d, k, c) {
  const hi = c & 0xF0, lo = c & 15, style = DUNGEON_STYLE[k];
  const grapple = c < 0x80 && (c & 8) ? ' With a grapple you can Klimb up from here.' : '';
  switch (hi >> 4) {
    case 0: return ['Passage', grapple];
    case 1: return ['Ladder up', grapple];
    case 2: return ['Ladder down', grapple];
    case 3: return ['Ladder up and down', grapple];
    case 4: return ['Chest', 'A wooden chest: treasure, and it may be trapped.'];
    case 5: return ['Fountain', `Drink: it ${FOUNTAIN[Math.min(lo, 3)]}.`];
    case 6: return lo === 1 || lo === 9 ? ['Hidden pit', 'Looks like a passage; you fall to the level below.' + grapple] : lo === 2 || lo === 10 ? ['Bomb trap', 'KABOOM: hurts the party, then is gone.'] : ['Pit', 'Klimb down it to the level below.' + grapple];
    case 7: return ['Open chest', ''];
    case 8: return [`${cap(FIELD[lo & 3])} field`, ['Puts the party to sleep.', 'Poisons.', 'Burns.', 'Shocks.'][lo & 3]];
    case 9: return ['Nothing of note', ''];
    case 10: case 15: return ['Heavy door', `Opens into room ${lo}: a fight on its own map.`];
    case 11: return ['Wall', lo && WALL_TEXT[k][lo - 1] ? `Written on it: <b>${WALL_TEXT[k][lo - 1].toUpperCase()}</b>.` : ''];
    case 12: return [style === 1 ? 'Dripping stalactite' : style === 2 ? 'Caved-in passage' : 'Remains of a less fortunate adventurer', 'Blocks the way.'];
    case 13: return ['Secret door', 'Looks like a wall.'];
    case 14: return ['Heavy door', ''];
  }
  return ['?', ''];
}

// The View (gem or spell) in a dungeon: dnglook.c DrawViewCell. Each cell is an 8 x 8 glyph of IBM.CH (font 0) or
// RUNES.CH (font 1) in a text colour, or a little picture drawn with lines (the fountain, a field's stripes).
const EGA5 = {black: '#000000', blue: '#0000aa', lightGray: '#aaaaaa', red: '#ff5555', magenta: '#ff55ff', blueB: '#5555ff', green: '#55ff55', yellow: '#ffff55', white: '#ffffff'};
function viewCell(d, ctx, x, y, cell) {
  const X = x * 8, Y = y * 8, kind = cell >> 4;
  const glyph = (font, ch, fg, bg) => {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(X, Y, 8, 8); }
    const t = canvas(8, 8), tc = t.getContext('2d');
    tc.drawImage(d.fonts[font], (ch % 16) * 8, Math.floor(ch / 16) * 8, 8, 8, 0, 0, 8, 8);
    tc.globalCompositeOperation = 'source-in'; tc.fillStyle = fg; tc.fillRect(0, 0, 8, 8);
    ctx.drawImage(t, X, Y);
  };
  const line = (color, x0, y0, x1, y1) => { ctx.fillStyle = color; ctx.fillRect(X + Math.min(x0, x1), Y + Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1); };
  switch (kind) {
    case 0: if (cell & 8) glyph(0, 0x18, EGA5.lightGray); break;   // where a fall landed: a grapple klimbs up
    case 1: glyph(1, 0x2E, EGA5.lightGray); break;   // ladder up
    case 2: glyph(1, 0x2D, EGA5.lightGray); break;   // ladder down
    case 3: glyph(1, 0x2F, EGA5.lightGray); break;   // ladder up and down
    case 4: glyph(1, 0x70, EGA5.yellow); break;      // chest
    case 5:   // fountain
      line(EGA5.white, 1, 4, 6, 4); line(EGA5.white, 2, 5, 5, 5); line(EGA5.white, 1, 6, 2, 6); line(EGA5.white, 5, 6, 6, 6);
      line(EGA5.blueB, 1, 2, 1, 2); line(EGA5.blueB, 2, 1, 2, 1); line(EGA5.blueB, 3, 2, 4, 2); line(EGA5.blueB, 3, 3, 4, 3); line(EGA5.blueB, 5, 1, 5, 1); line(EGA5.blueB, 6, 2, 6, 2);
      break;
    case 6:
      if (cell === 0x60) glyph(0, 0x19, EGA5.lightGray);
      else if (cell === 0x61 || cell === 0x69) glyph(1, 0x71, EGA5.lightGray);   // pit trap
      else if (cell === 0x68) glyph(0, 0x12, EGA5.lightGray);
      else glyph(1, 0x72, EGA5.red);
      break;
    case 8:   // a field: stripes in magenta, red, blue and green
      [[EGA5.magenta, 0], [EGA5.red, 2], [EGA5.blueB, 4], [EGA5.green, 6]].forEach(([c, r]) => { line(c, 1, r, 6, r); line(c, 1, r + 1, 6, r + 1); });
      break;
    case 10: case 15: glyph(1, 0x73, EGA5.yellow); break;   // a room's door
    case 11: if (cell === 0xB0) glyph(0, 0x7F, EGA5.white); else glyph(1, 0x74, EGA5.white); break;   // wall; with writing
    case 12: glyph(1, 0x75, EGA5.white, EGA5.blue); break;
    case 13: glyph(1, 0x76, EGA5.white, EGA5.blue); break;   // the EGA driver's background
    case 14: glyph(1, 0x77, EGA5.yellow); break;   // door
  }
}
const badge = (x, y, text, color) => `<rect x="${x + .02}" y="${y + .02}" width="${.14 + .17 * String(text).length}" height=".34" rx=".06" fill="#000" opacity=".8"/><text x="${x + .09}" y="${y + .29}" font-size=".3" font-family="system-ui, sans-serif" font-weight="700" fill="${color}">${esc(String(text))}</text>`;

function renderLevel(d, k, L) {
  const pl = d.places[32 + k], cells = d.dungeonBytes[k].subarray((L - 1) * 64, L * 64), at = (x, y) => cells[y * 8 + x];
  const gem = canvas(64, 64), gctx = gem.getContext('2d');
  const parts = {rooms: ''}, features = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const c = at(x, y), hi = c >> 4, [name] = describe(d, k, c);
    viewCell(d, gctx, x, y, c);
    if (hi === 11 && (c & 15)) features.push({name: describe(d, k, c)[1].replace(/<[^>]+>/g, ''), x, y});
    if (hi === 13 || hi === 4 || hi === 7 || hi === 5 || hi === 6 || hi === 8) features.push({name, x, y});
    if (hi >= 1 && hi <= 3) features.unshift({name, x, y});
    if (hi === 10 || hi === 15) { parts.rooms += badge(x, y, c & 15, C.room); features.push({name: `Room ${c & 15}`, x, y}); }
  }
  const svg = svgDoc(8, 8, g('rooms', parts.rooms) + g('grid', gridLines(8, 8)));
  const id = l => `D${k}-${l}`;
  const cell = (x, y) => {
    const c = at(x, y), hi = c >> 4, [title, text] = describe(d, k, c), links = [];
    const up = hi === 1 || hi === 3 || (c < 0x80 && (c & 8)), down = hi === 2 || hi === 3 || hi === 6;
    if (up) links.push(L === 1 ? {label: 'Klimb out to Britannia', map: 'brit', focus: [pl.x, pl.y]} : {label: `Klimb to level ${L - 1}`, map: id(L - 1), focus: [x, y]});
    if (down && !(hi === 6 && (c & 15) % 8 === 2)) links.push(L === 8 ? {label: 'Down into the Underworld', map: 'under', focus: [pl.x, pl.y]} : {label: `Down to level ${L + 1}`, map: id(L + 1), focus: [x, y]});
    if ((hi === 10 || hi === 15) && roomIndex(k, c & 15) >= 0) links.push({label: `Open room ${c & 15}`, map: `D${k}-room-${c & 15}`});
    return {title, body: text ? p(text) : '', links};
  };
  const info = `<h3>${esc(pl.name)}, level ${L}</h3>
    <p>The same for everyone. Klimbing up from level 1 leaves for Britannia; going down from level 8 leads into the Underworld, both at the dungeon’s square.</p>
    <p>Drawn as the View (a gem, or the spell) draws it, with the game’s own glyphs and colours. Room doors carry their room’s number: each opens into a fight on its own 11 × 11 map.</p>
    <p class="muted">Each level is 8 × 8 and wraps at its edges. An arrow on plain floor marks where a fall lands; with a grapple you can Klimb back up from there.</p>`;
  return {
    title: `${pl.name}, level ${L}`, subtitle: 'Dungeon', width: 8, height: 8, wrap: true, native: 8, images: [{src: gem, layer: 'gem'}], svg, cell, features, info,
    layers: [
      {id: 'gem', name: 'Gem view'},
      {id: 'rooms', name: 'Room numbers', swatch: swatch(badge(.2, .3, 1, C.room))},
      {id: 'grid', name: 'Grid', swatch: swatch(rect(0, 0, 1, 1, C.floor) + path('M.5 0V1M0 .5H1', '#888', .06))},
    ],
  };
}

async function renderRoom(d, k, r) {
  const room = d.rooms[roomIndex(k, r)], pl = d.places[32 + k];
  let trig = '';
  for (const t of room.triggers) trig += ring(t.at[0], t.at[1], C.event, '.16 .1');
  const svg = svgDoc(11, 11, g('triggers', trig) + g('grid', gridLines(11, 11)));
  const doors = [];
  for (let L = 1; L <= 8; L++) { const cells = d.dungeonBytes[k].subarray((L - 1) * 64, L * 64); cells.forEach((c, i) => { if ((c >> 4 === 15 || c >> 4 === 10) && (c & 15) === r) doors.push({L, x: i & 7, y: i >> 3}); }); }
  const cell = (x, y) => {
    const foe = room.foes.find(f => f.x === x && f.y === y), t = room.triggers.find(q => q.at[0] === x && q.at[1] === y), c = room.bytes[y * 11 + x];
    const body = t ? p(`<b>Trigger:</b> stepping here turns ${t.a.join(', ')}${t.b.join(',') !== t.a.join(',') ? ` and ${t.b.join(', ')}` : ''} into ${esc(tname(d, t.tile).toLowerCase())}.`) : '';
    const links = doors.map(o => ({label: `Back to level ${o.L}`, map: `D${k}-${o.L}`, focus: [o.x, o.y]}));
    if (c === 0xC8 || c === 0xC9) links.unshift({label: c === 0xC8 ? 'Klimb up a level from this ladder' : 'This ladder goes down a level'});
    return {title: foe ? tname(d, foe.tile) : tname(d, c), body, links: links.filter(l => l.map)};
  };
  const foes = room.foes.map(f => tname(d, f.tile)), count = foes.reduce((m, f) => (m[f] = (m[f] || 0) + 1, m), {});
  const sides = Object.keys(room.starts);
  return {
    title: `${pl.name}, room ${r}`, subtitle: 'Dungeon room', width: 11, height: 11, native: 16, ...animatedMap(d, room.bytes, 11, 11, room.foes, 'foes'), svg, cell,
    features: room.foes.map(f => ({name: tname(d, f.tile), x: f.x, y: f.y})),
    info: `<h3>${esc(pl.name)}, room ${r}</h3><p>In it: ${Object.entries(count).map(([kk, v]) => `${v} × ${esc(kk)}`).join(', ') || 'nothing'}.</p>
      ${doors.length ? `<p>Its doors: ${doors.map(o => `<a href="#" data-go='${JSON.stringify({map: `D${k}-${o.L}`, focus: [o.x, o.y]})}'>level ${o.L} (${o.x}, ${o.y})</a>`).join(', ')}.</p>` : ''}
      ${sides.length ? `<p>The party can enter from the ${sides.length > 1 ? `${sides.slice(0, -1).join(', ')} and ${sides[sides.length - 1]}` : sides[0]}.</p>` : ''}
      ${room.triggers.length ? '<p>Dotted squares are triggers that change the room when stepped on.</p>' : ''}`,
    layers: [{id: 'foes', name: 'Foes and objects'}, {id: 'triggers', name: 'Triggers', swatch: swatch(ring(0, 0, C.event, '.16 .1'))}, {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
  };
}

let meta = null;
export default {
  id: 'u5', title: 'Ultima V', version: 'PC/GOG version. Every map is read from the game files.',
  params: [{key: 'hour', slider: true, label: 'Hour of the day (towns)', def: 12, min: 0, max: 23,
    help: 'Townsfolk keep a daily schedule of up to three places. 0 is midnight.'}],
  transient: [], defaultMap: 'brit',
  maps(params, mapId) {
    const list = [{id: 'brit', name: 'Britannia'}, {id: 'under', name: 'The Underworld'}];
    if (!meta) return list;
    let m;
    if ((m = /^P(\d+)\.(-?\d)$/.exec(mapId || '')) && meta.towns[m[1]]) {
      const n = +m[1];
      for (const z of Object.keys(meta.towns[n].bytes).map(Number).sort((a, b) => a - b)) list.push({id: `P${n}.${z}`, name: FLOOR(z), group: `${meta.places[n - 1].name}: floors`});
    }
    if ((m = /^D(\d)-/.exec(mapId || '')) && +m[1] < 8) {   // as render(): D8 and D9 are no dungeon (#u5/D8-1 drew Britannia)
      const k = +m[1], name = meta.places[32 + k].name;
      for (let l = 1; l <= 8; l++) list.push({id: `D${k}-${l}`, name: String(l), title: `Level ${l}`, group: `${name}: levels`});
      if (k !== 1) for (let r = 0; r < 16; r++) list.push({id: `D${k}-room-${r}`, name: String(r), title: `Room ${r}`, group: `${name}: rooms`});
    }
    for (const pl of meta.places) list.push(pl.n <= 32 ? {id: `P${pl.n}.0`, name: pl.name, group: KIND(pl.n)} : {id: `D${pl.n - 33}-1`, name: pl.name, group: 'Dungeons'});
    return list;
  },
  async render(mapId, params) {
    const d = await load();
    meta = d;
    const hour = Math.max(0, Math.min(23, params.hour ?? 12));
    let m;
    if ((m = /^D(\d)-room-(\d+)$/.exec(mapId || '')) && +m[1] < 8 && +m[1] !== 1 && +m[2] < 16) return renderRoom(d, +m[1], +m[2]);
    if ((m = /^D(\d)-([1-8])$/.exec(mapId || '')) && +m[1] < 8) return renderLevel(d, +m[1], +m[2]);
    if ((m = /^P(\d+)\.(-?\d)$/.exec(mapId || '')) && d.towns[m[1]] && d.towns[m[1]].bytes[m[2]]) return renderTown(d, +m[1], +m[2], hour);
    if (mapId === 'under') return renderBig(d, true);
    if (mapId && mapId !== 'brit') throw new Error(`no map ${mapId}`);   // the viewer then opens the default map and fixes the address
    return renderBig(d, false);
  },
};
