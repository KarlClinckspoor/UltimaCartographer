// Ultima IV (PC/GOG): reads the game files and writes what the site needs to data/u4/.
// Usage: node tools/extract-u4.mjs <GOG game folder> <u4-decompiled-port folder>
// Game data comes from the game folder; the tables the game keeps in code (tile names, location
// names, mantras, shop names and where each shop's counter is) are read from the port's C source.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {png} from './png.mjs';

const [game, port] = process.argv.slice(2);
if (!game || !port) { console.error('usage: node tools/extract-u4.mjs <game folder> <u4-decompiled-port folder>'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'u4');
mkdirSync(out, {recursive: true});
const file = n => readFileSync(join(game, n));
const src = n => readFileSync(join(port, 'SRC', n), 'latin1');

// ---------- tables from the C source ----------
const strings = text => [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\n/g, '\n'));
const block = (text, re) => { const m = re.exec(text); if (!m) throw new Error(`not found: ${re}`); return text.slice(m.index + m[0].length, text.indexOf('}', m.index + m[0].length)); };
const numbers = t => t.split(',').map(s => s.replace(/\/\*.*?\*\//g, '').trim()).filter(Boolean).map(Number);

const shapeH = src('U4_SHAPE.H');
const tileNames = [];
for (const m of shapeH.matchAll(/#define TIL_(\w+)\s+(0x[0-9A-Fa-f]+)/g)) tileNames[parseInt(m[2], 16)] = m[1];
for (let i = 0, last = '?'; i < 256; i++) { if (tileNames[i]) last = tileNames[i]; else tileNames[i] = last; }   // later frames take the name before them
const cstes = src('U4_CSTES.C');
const locBlock = cstes.slice(cstes.indexOf('NAME_LOCATIONS'), cstes.indexOf('NAME_VIRTUES'));
const locations = strings(locBlock).slice(0, 24);
const virtues = strings(cstes.slice(cstes.indexOf('NAME_VIRTUES'), cstes.indexOf('NAME_VILLAGER'))).slice(0, 8);
const mantras = strings(block(src('U4_SHRIN.C'), /Mantras\[\]\s*=\s*\{/));
const talkC = src('U4_TALK.C');
const shopRows = [...block(talkC, /ShopRows\[\]\[8\]\s*=\s*\{/).matchAll(/\{([^}]*)\}/g)].map(m => numbers(m[1]));
// ShopRows stops at the first '}': read the 16 rows from the whole initializer instead.
{
  const start = talkC.indexOf('ShopRows[][8]'), end = talkC.indexOf('};', start);
  shopRows.length = 0;
  for (const m of talkC.slice(start, end).matchAll(/\{(0x[^}]*)\}/g)) shopRows.push(numbers(m[1]));
}
const shopsC = src('U4_SHOPS.C');
const KINDS = [['weapons', 'WeaponShop'], ['armour', 'ArmourShop'], ['food', 'FoodShop'], ['pub', 'Pub'], ['reagents', 'ReagentShop'], ['healer', 'Healer'], ['inn', 'Inn'], ['guild', 'GuildShop']];
const shops = KINDS.map(([kind, t]) => ({
  kind,
  ids: numbers(block(shopsC, new RegExp(`${t}Ids\\[16\\]\\s*=\\s*\\{`))),
  names: strings(block(shopsC, new RegExp(`${t}Names\\[\\]\\s*=\\s*\\{`))),
  keepers: strings(block(shopsC, new RegExp(`${t}Keepers\\[\\]\\s*=\\s*\\{`))),
}));
const main2 = src('U4_MAIN2.C');
const bytes = name => numbers(block(main2, new RegExp(`${name}\\[\\]\\s*=\\s*\\{`))).map(v => v & 0xFF);
const places = locations.concat(virtues.map(v => `Shrine of ${v}`)).map((name, i) => ({n: i + 1, name, x: bytes('LocationX')[i], y: bytes('LocationY')[i]}));
const moongates = bytes('MoongateX').map((x, i) => [x, bytes('MoongateY')[i]]);
if (places.length !== 32 || moongates.length !== 8) throw new Error('location tables: unexpected sizes');
if (shopRows.length !== 16 || locations.length !== 24 || mantras.length !== 8) throw new Error('source tables: unexpected sizes');

// ---------- the world: 8 x 8 chunks of 32 x 32, stored as one 256 x 256 grid, row by row ----------
const wm = file('WORLD.MAP'), world = Buffer.alloc(65536);
for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++)
  world[(cy * 32 + y) * 256 + cx * 32 + x] = wm[(cy * 8 + cx) * 1024 + y * 32 + x];

// ---------- towns: a 32 x 32 map, then 32 people: tile, x, y, tile, old x, old y, movement, talk index ----------
const TOWNS = ['LCB_1', 'LYCAEUM', 'EMPATH', 'SERPENT', 'MOONGLOW', 'BRITAIN', 'JHELOM', 'YEW', 'MINOC', 'TRINSIC', 'SKARA', 'MAGINCIA', 'PAWS', 'DEN', 'VESPER', 'COVE', 'LCB_2'];
const TALK = ['LCB', 'LYCAEUM', 'EMPATH', 'SERPENT', 'MOONGLOW', 'BRITAIN', 'JHELOM', 'YEW', 'MINOC', 'TRINSIC', 'SKARA', 'MAGINCIA', 'PAWS', 'DEN', 'VESPER', 'COVE'];
const towns = {};
for (const name of TOWNS) {
  const b = file(`${name}.ULT`);
  const people = [];
  for (let i = 0; i < 32; i++) {
    const o = 0x400;
    if (b[o + i]) people.push({tile: b[o + i], x: b[o + 0x20 + i], y: b[o + 0x40 + i], move: b[o + 0xC0 + i], talk: b[o + 0xE0 + i]});
  }
  towns[name] = {cells: b.subarray(0, 0x400).toString('hex'), people};
}
// Talk files: 16 records of 288 bytes: question topic, humility flag, turn-away chance, then 12 strings.
const talk = {};
for (const name of TALK) {
  const b = file(`${name}.TLK`), recs = [];
  for (let r = 0; r < 16; r++) {
    const rec = b.subarray(r * 288, (r + 1) * 288), s = [];
    let o = 3;
    for (let k = 0; k < 12; k++) { const e = rec.indexOf(0, o); s.push(rec.subarray(o, e < 0 ? 288 : e).toString('latin1')); o = e + 1; }
    recs.push({question: rec[0], humility: rec[1], turnAway: rec[2],
      name: s[0], pronoun: s[1], look: s[2], job: s[3], health: s[4], answer1: s[5], answer2: s[6], ask: s[7], yes: s[8], no: s[9], keyword1: s[10].trim(), keyword2: s[11].trim()});
  }
  talk[name] = recs;
}

// ---------- dungeons: 8 levels of 8 x 8, then rooms of 256 bytes (16, or 64 in the Abyss) ----------
const DUNGEONS = ['DECEIT', 'DESPISE', 'DESTARD', 'WRONG', 'COVETOUS', 'SHAME', 'HYTHLOTH', 'ABYSS'];
const dungeons = {};
for (const name of DUNGEONS) {
  const b = file(`${name}.DNG`), rooms = [];
  for (let o = 512; o + 256 <= b.length; o += 256) {
    const r = b.subarray(o, o + 256);
    const foes = [];
    for (let i = 0; i < 16; i++) if (r[0x10 + i]) foes.push({tile: r[0x10 + i], x: r[0x20 + i], y: r[0x30 + i]});
    const triggers = [];
    for (let i = 0; i < 4; i++) if (r[i * 4]) triggers.push({tile: r[i * 4], at: [r[i * 4 + 1] >> 4, r[i * 4 + 1] & 15], a: [r[i * 4 + 2] >> 4, r[i * 4 + 2] & 15], b: [r[i * 4 + 3] >> 4, r[i * 4 + 3] & 15]});
    rooms.push({map: r.subarray(0x80, 0x80 + 121).toString('hex'), foes, triggers});
  }
  dungeons[name] = {cells: b.subarray(0, 512).toString('hex'), rooms};
}

// ---------- tiles: SHAPES.EGA, 256 tiles of 16 x 16, 4 bits a pixel (left pixel in the high nibble) ----------
const EGA = ['000000', '0000aa', '00aa00', '00aaaa', 'aa0000', 'aa00aa', 'aa5500', 'aaaaaa', '555555', '5555ff', '55ff55', '55ffff', 'ff5555', 'ff55ff', 'ffff55', 'ffffff']
  .map(h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)));
{
  const sh = file('SHAPES.EGA'), w = 16 * 16, h = 16 * 16, px = Buffer.alloc(w * h * 3);
  for (let t = 0; t < 256; t++) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const b = sh[t * 128 + y * 8 + (x >> 1)], c = x & 1 ? b & 15 : b >> 4;
    const o = (((t >> 4) * 16 + y) * w + (t & 15) * 16 + x) * 3;
    [px[o], px[o + 1], px[o + 2]] = EGA[c];
  }
  writeFileSync(join(out, 'tiles.png'), png(w, h, px));
}
// CHARSET.EGA: the game loads its first 4096 bytes, 128 characters of 8 x 8, 4 bits a pixel (left pixel in the
// high nibble, as SHAPES.EGA); the dungeon gem view prints these (U4_PEER.C ShowDungeonMap).
{
  const cs = file('CHARSET.EGA'), w = 16 * 8, h = 8 * 8, px = Buffer.alloc(w * h * 3);
  for (let c = 0; c < 128; c++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const b = cs[c * 32 + y * 4 + (x >> 1)], v = x & 1 ? b & 15 : b >> 4;
    const o = ((Math.floor(c / 16) * 8 + y) * w + (c % 16) * 8 + x) * 3;
    [px[o], px[o + 1], px[o + 2]] = EGA[v];
  }
  writeFileSync(join(out, 'charset.png'), png(w, h, px));
}

writeFileSync(join(out, 'u4.json'), JSON.stringify({world: world.toString('base64'), towns, talk, dungeons, tileNames, places, moongates, virtues, mantras, shopRows, shops}));
console.log(`world 256x256, towns ${Object.keys(towns).length}, talk ${Object.keys(talk).length}, dungeons ${Object.keys(dungeons).length}, tiles 256 -> ${out}`);
