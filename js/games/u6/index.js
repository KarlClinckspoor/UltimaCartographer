// Ultima VI: Britannia, the four dungeon levels beneath it and the Gargoyle lands, drawn by the shared
// U6-engine module. Tables below are from u6-decompiled SRC (obj.h object numbers, npctrack.c).
import {makeEngine} from './engine.js';

// npctrack.c RedGateX/Y/Z: where a red gate of quality q sends you (q - 1).
const RX = [0x383, 0x3A7, 0x1B3, 0x1F7, 0x093, 0x397, 0x044, 0x133, 0x0BC, 0x09F, 0x2E3, 0, 0, 0, 0x0E3, 0x017, 0x080, 0x06C, 0x39B, 0x127, 0x04B, 0x147, 0x183, 0x33F, 0x29B];
const RY = [0x1F3, 0x106, 0x18B, 0x166, 0x373, 0x3A6, 0x02D, 0x160, 0x02D, 0x3AE, 0x2BB, 0, 0, 0, 0x083, 0x016, 0x056, 0x0DD, 0x36C, 0x026, 0x1FB, 0x336, 0x313, 0x0A6, 0x043];
const RZ = [0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 1, 5, 5, 0, 0, 0, 0, 0, 0, 0];
// npctrack.c DungeonNames: what Shamino calls the place a hole or mine shaft of quality q leads to.
const DUNGEONS = ['Deceit', 'Despise', 'Destard', 'Wrong', 'Covetous', 'Shame', 'Hythloth', 'GSA', 'Control', 'Passion', 'Diligence',
  'Tomb of Kings', 'Ant Mound', 'Swamp Cave', 'Spider Cave', 'Cyclops Cave', 'Heftimus Cave', 'Heroes’ Hole', 'Pirate Cave', 'Buccaneer’s Cave'];

// The sextant and the Locate spell (spell.c SPELL_PrintLocation), on the surface and in the gargoyles' land only:
// degrees from (304, 360), 8 squares a degree; the gargoyles' land counts 4 for each of its squares.
export const sextant = z => z === 0 || z === 5 ? (x, y) => {
  if (z) { x <<= 2; y <<= 2; }
  const lat = (y - 0x168) >> 3, lon = (x - 0x130) >> 3;
  return `${Math.abs(lat)}°${lat > 0 ? 'S' : 'N'}, ${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;
} : null;

export default makeEngine({
  coords: sextant,
  id: 'u6', title: 'Ultima VI', version: 'PC/GOG version. Maps, objects and people as they are at the start of a new game.',
  startHour: 12, moonstones: true, runes: true,
  levels: ['Britannia', 'Underground, level 1', 'Underground, level 2', 'Underground, level 3', 'Underground, level 4', 'Gargoyle lands'],
  redGates: RX.map((x, i) => x || RY[i] ? [x, RY[i], RZ[i]] : null),
  dungeonNames: DUNGEONS,
  dungeonName: q => q < 8 ? `Dungeon ${DUNGEONS[q - 1]}` : q === 8 ? 'The Great Stygian Abyss' : q <= 11 ? `Shrine of ${DUNGEONS[q - 1]}` : DUNGEONS[q - 1],
  objLadder: 0x131, objRedGate: 0x054, objEgg: 0x14F,
  // egg.c EGG_hatches: quality / 10 is 1 for day eggs (06:00-18:59), 2 for night eggs, anything else any time; each
  // embryo makes 1 to its quantity, exactly its quantity from an egg of quantity 100, one silver serpent (0x19D) whose
  // quantity is its length; a mutant embryo (status 0x40) two-headed creatures. EGG_hatchArea also hatches a "local"
  // egg (status 0x20) in view.
  eggRules: {
    hours: r => ({1: 'by day only (06:00–18:59)', 2: 'by night only (19:00–05:59)'})[Math.floor(r.qual / 10)],
    count: (r, c) => c.type === 0x19D ? '1' : ((r, c) => r.qty === 100 ? String(c.qty) : c.qty <= 1 ? '1' : `1–${c.qty}`)(r, c),
    note: c => c.type === 0x19D ? `${c.qty + 1} body segments` : c.status & 0x40 ? 'two-headed' : '',
    inView: r => r.status & 0x20,
    where: 'The first creature appears on the egg; the others are moved to free squares near it, out of your sight.',
  },
  // What an embryo hatches as, square by square (egg.c EGG_generate, EGG_hatches; object.c AddMonster starts a creature
  // at frame 0): an object type (under the giant rat,
  // 0x156, but not the open chest) as itself, frame 0; the winged gargoyle and the cyclops at frame 0x13; the two-square
  // beasts from the giant scorpion (0x1AA) on at frame 6 with their other half east (frame 0xE, a mutant's 2); the
  // dragon (0x19B) with head north, tail south and wings east and west; the hydra (0x176) amid eight bodies (0x1A9,
  // frame = direction * 4); the silver serpent (0x19D) coiled, its quantity of body segments and a tail; the tangle
  // vine pod (0x16D) with four vines (0x16E) on its sides.
  eggParts: c => {
    const t = c.type, me = {type: t, frame: 0, dx: 0, dy: 0}, DX = [0, 1, 1, 1, 0, -1, -1, -1], DY = [-1, -1, 0, 1, 1, 1, 0, -1];
    if (t < 0x156 && t !== 0x062) return [{...me, frame: 0}];
    if (t === 0x16A || t === 0x1A8) return [{...me, frame: 0x13}];
    if (t >= 0x1AA) return [{...me, frame: 6}, {type: t, frame: c.status & 0x40 ? 2 : 0xE, dx: 1, dy: 0}];
    if (t === 0x19B) return [{...me, frame: 0}, {type: t, frame: 8, dx: 0, dy: -1}, {type: t, frame: 0x10, dx: 0, dy: 1}, {type: t, frame: 0x18, dx: -1, dy: 0}, {type: t, frame: 0x20, dx: 1, dy: 0}];
    if (t === 0x176) return [me, ...DX.map((dx, k) => ({type: 0x1A9, frame: k << 2, dx, dy: DY[k]}))];
    if (t === 0x19D) {
      const SX = [0, -1, -1, 0], SY = [1, 1, 0, 0], BODY = [0xD, 0xA, 0xB, 0xC], TAIL = [1, 3, 5, 7], out = [{...me, frame: 0}];
      for (let s = 0; s <= c.qty; s++) out.push({type: t, frame: (s === c.qty ? TAIL : BODY)[s & 3], dx: SX[s & 3], dy: SY[s & 3]});
      return out;
    }
    if (t === 0x16D) return [{...me, frame: 0}, ...[0, 2, 4, 6].map(k => ({type: 0x16E, frame: k & 2 ? 0 : 1, dx: DX[k], dy: DY[k]}))];
    return [me];
  },
  entranceTypes: [0x134, 0x146],   // OBJ_HOLE, OBJ_MINE_SHAFT
  bookTypes: [0x097, 0x03D, 0x098, 0x10E, 0x03B],   // objcmd.c BookTypes: book, Book of Circles, note, balloon plans, Codex
  signTypes: [0x14C, 0x14D, 0x08F, 0x0FE, 0x0FF],   // SignTypes: sign, gargoyle sign, picture, cross, tombstone
  hidden: [0x14F],   // eggs are never drawn
});
