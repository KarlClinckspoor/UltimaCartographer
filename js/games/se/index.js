// The Savage Empire (Worlds of Ultima): the Valley of Eodon and the levels beneath it, drawn by the
// shared Ultima VI engine module. Tables from u6se-decompiled SRC (map.c, egg.c).
import {makeEngine} from '../u6/engine.js';

// map.c: where an entrance leads, by its type and quality (C_08CB_0855).
const T14 = [[0x161, 0x279], [0x08B, 0x00B], [0x0DA, 0x01B], [0x013, 0x053], [0x00B, 0x0CB], [0x062, 0x053], [0x0EB, 0x054], [0x0E3, 0x0B3], [0x0F3, 0x0CC], [0x033, 0x0F3], [0x123, 0x045], [0x110, 0x045], [0x1F1, 0x04D]];
const T16 = [[0x18C, 0x044], [0x258, 0x0DF], [0x08A, 0x1C9], [0x08B, 0x1FD], [0x170, 0x150], [0x279, 0x1D0], [0x29A, 0x2B1], [0x0EA, 0x03D]];
const TE3 = [[0x389, 0x2ED], [0x335, 0x15D], [0x3DA, 0x19D], [0x08C, 0x24E], [0x07C, 0x256], [0x06C, 0x25E], [0x34D, 0x28E], [0x36D, 0x28E], [0x35D, 0x296], [0x37D, 0x296], [0x2AD, 0x176], [0x2C5, 0x18D], [0x2D5, 0x19E], [0x2DD, 0x19E], [0x2BD, 0x156], [0x3BC, 0x0EC], [0x3A1, 0x34D]];
const TA3 = [[0x02D, 0x082], [0x019, 0x083], [0x051, 0x093], [0x0D1, 0x05B], [0x095, 0x0EC], [0x04A, 0x0C3], [0x0F4, 0x0AC], [0x0E4, 0x0B4], [0x0D4, 0x0BC], [0x08D, 0x03C], [0x0AD, 0x03C], [0x09D, 0x044], [0x0BD, 0x044], [0x00D, 0x0F4], [0x0B5, 0x0E4], [0x0C5, 0x0F4], [0x0CD, 0x0F4], [0x0ED, 0x0F4], [0x014, 0x0DA], [0x0B1, 0x083]];
const at = (t, i, z) => t[i] ? [t[i][0], t[i][1], z] : null;

export default makeEngine({
  id: 'se', title: 'The Savage Empire', version: 'PC/GOG version. Maps, objects and people as they are at the start of a new game.',
  startHour: 12,
  levels: ['Valley of Eodon', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'],
  redGates: [],
  objLadder: -1, objRedGate: -1, objEgg: 0xE6,
  // egg.c EGG_hatches: no hours. How many of each embryo depends on its type: 0x7F and 0xCB make 10-20 piles; 0x143
  // makes 5-15 on level 1 and its quantity elsewhere (one, after talk flag 1 bit 8); 0x11A, 0x12D and 0x136-0x146 1 to
  // their quantity (their quantity from an egg of quantity over 100); any other type one. Objects (types under 0x11A)
  // land up to 3 squares from the egg.
  eggRules: {
    count: (r, c) => c.type === 0x7F || c.type === 0xCB ? '10–20' : c.type === 0x143 ? (r.z === 1 ? '5–15' : String(c.qty))
      : c.type === 0x11A || c.type === 0x12D || (c.type >= 0x136 && c.type <= 0x146) ? (r.qty > 100 || c.qty <= 1 ? String(Math.max(1, c.qty)) : `1–${c.qty}`) : '1',
    note: c => c.type === 0x143 ? 'only one once a story flag is set' : '',
    where: 'The first creature appears on the egg and the others near it; objects land up to 3 squares from it.',
  },
  // What an embryo hatches as, square by square (egg.c EGG_generate, EGG_hatches): an object (type under 0x11A) as
  // itself, frame 0 (0xA7 frame 3); the pteranodon (0x120) and the 2 x 2 creatures (npctrack.c IsTwoTileCreature: 0x11B,
  // 0x12C, 0x147, 0x14A-0x14F) at frame 1, 0x128 at frame 3; the dinosaurs made of several objects (object.c
  // OBJ_GetCreatureParts: a head type and its body and tail types, each at frame (1 << shift) - 1) with each part on the
  // side where the head's tile and the part's tile join (their TerrainType bits 0x80 >> side, north east south west);
  // 0x124 with four 0x11A around it.
  eggParts: (c, d) => {
    const t = c.type, me = {type: t, frame: 0, dx: 0, dy: 0}, DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    if (t < 0x11A) return [{...me, frame: t === 0xA7 ? 3 : 0}];
    if (t === 0x120 || [0x11B, 0x12C, 0x147, 0x14A, 0x14B, 0x14C, 0x14D, 0x14E, 0x14F].includes(t)) return [{...me, frame: 1}];
    if (t === 0x128) return [{...me, frame: 3}];
    const P = {0x126: [[1, 2, 1], [0x126, 0x125, 0x127]], 0x121: [[1, 0], [0x121, 0x122]], 0x129: [[1, 0], [0x129, 0x12A]],
      0x12F: [[1, 0], [0x12F, 0x130]], 0x11C: [[1, 0], [0x11C, 0x11D]], 0x131: [[1, 0], [0x131, 0x132]]}[t];
    if (P) {
      const [sh, ty] = P, head = (1 << sh[0]) - 1, out = [{...me, frame: head}];
      for (let i = 1; i < ty.length; i++) {
        const pf = (1 << sh[i]) - 1;
        for (let j = 0; j < 4; j++) if ((d.terrain[d.baseTile[t] + head] & (0x80 >> j)) && (d.terrain[d.baseTile[ty[i]] + pf] & (0x80 >> ((j + 2) % 4)))) {
          out.push({type: ty[i], frame: pf, dx: DX[j], dy: DY[j]}); break;
        }
      }
      return out;
    }
    if (t === 0x124) return [me, ...[0, 1, 2, 3].map(j => ({type: 0x11A, frame: 0, dx: DX[j], dy: DY[j]}))];
    return [me];
  },
  entranceTypes: [0x14, 0xA3, 0x16, 0xE3, 0x103, 0xA0],
  entrance: r => r.type === 0x14 ? at(T14, r.qual, 1) : r.type === 0xA3 ? at(TA3, r.qual - 101, 2) : r.type === 0x16 ? at(T16, r.qual - 1, r.qual === 8 ? 2 : 0)
    : r.type === 0xE3 ? at(TE3, r.qual - 104, 0) : r.type === 0x103 ? [0xC0, 0x1CC, 0] : r.type === 0xA0 ? [0x9D, 0x89, 3] : null,
  // The Savage Empire has no signs or books (no BOOK.DAT, no read command); its only written texts are
  // two messages in objcmd.c: CmdLook on the headless statue (0xf7, quality 0) and ReadJimmysNotes (0x31).
  bookTypes: [], signTypes: [],
  note: r => r.type === 0xF7 && r.qual === 0
    ? '<p class="sign">Searching here, you find a piece of paper with notes written on it:<br><br>“The statue is of the same materials and workmanship as that golden head Fritz found. It appears to be a mechanism of some sort. I will have to talk to Fritz about this…”</p>'
    : r.type === 0x31 ? '<p class="muted">Jimmy’s notebook: no one but Jimmy can read his shorthand (“Why don’t you just ask me what you want to know?”).</p>' : '',
  hidden: [0xE6],
});
