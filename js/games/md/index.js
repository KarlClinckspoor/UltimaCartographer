// Martian Dreams (Worlds of Ultima): Mars and the levels beneath it, drawn by the shared Ultima VI
// engine module. Tables from u6md-decompiled SRC (map.c GoThroughEntrance, useact1.c, egg.c).
import {makeEngine} from '../u6/engine.js';

// map.c Entrances: x, y, z for an entrance of quality q (q - 1); ChamberDests for the alien device chamber (0xc5).
const ENTRANCES = [[0x043, 0x051, 1], [0x080, 0x08D, 0], [0x076, 0x0F2, 3], [0x07A, 0x00C, 3], [0x09A, 0x040, 4], [0x2B2, 0x1CC, 0], [0x073, 0x040, 4], [0x29D, 0x1CE, 0],
  [0x0B3, 0x0E1, 4], [0x27B, 0x1F1, 0], [0x0C3, 0x070, 1], [0x0CB, 0x1D1, 0], [0x024, 0x0F1, 1], [0x31A, 0x232, 0], [0x05C, 0x0F1, 1], [0x34C, 0x25A, 0],
  [0x07C, 0x028, 4], [0x13E, 0x118, 0], [0x00A, 0x060, 5], [0x3B7, 0x1C4, 0], [0x05C, 0x0B0, 5], [0x3DC, 0x1DD, 0], [0x05E, 0x029, 4], [0x227, 0x1AB, 0]];
const CHAMBERS = [[0x0CA, 0x295], [0x34D, 0x295], [0x13A, 0x17A], [0x2CD, 0x1FA]];

// The coordinates the plaques on Mars give (objcmd.c CmdLook, type 0xac on the surface): latitude
// (y - 512) * 240 / 1024 S or N, longitude (x - 512) * 360 / 1024 counted as 180 - lon W or lon + 180 E.
// C's division: towards zero.
export const plaque = z => z === 0 ? (x, y) => {
  const lat = Math.trunc((y - 0x200) * 0xf0 / 0x400), lon = Math.trunc((x - 0x200) * 0x168 / 0x400);
  const la = lat > 0 ? `${lat}°S` : lat < 0 ? `${-lat}°N` : '0°';
  const lo = lon === 0 || lon === 180 || lon === -180 ? `${lon === 0 ? 180 : 0}°` : lon > 0 ? `${180 - lon}°W` : `${lon + 180}°E`;
  return `${la}, ${lo} (as on the plaques)`;
} : null;

export default makeEngine({
  coords: plaque,
  id: 'md', title: 'Martian Dreams', version: 'PC/GOG version. Maps, objects and people as they are at the start of a new game.',
  startHour: 12, ampQuote: true,
  levels: ['Mars', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'],
  redGates: [],
  objLadder: -1, objRedGate: -1, objEgg: 0x1D2,
  entranceTypes: [0xAF, 0xD2, 0xA3, 0xB2, 0xB4, 0xC5],
  entrance: r => r.type === 0xC5 ? (CHAMBERS[r.qual - 1] ? [...CHAMBERS[r.qual - 1], 0] : null) : ENTRANCES[r.qual - 1] || null,
  bookTypes: [0x94, 0x97, 0xF3], signTypes: [],   // useact1.c UseRead: read from MDTEXT.LZC (quality - 1)
  hidden: [0x1D2],
});
