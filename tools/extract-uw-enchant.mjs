// Ultima Underworld I and II: what the game adds after an enchanted object's name once it is identified, for the
// web export's objects (data/<uw1|uw2>/levels/<n>/objects.json, written by the editor). Reads the game's LEV.ARK
// and STRINGS.PAK and writes data/<id>/enchant.json: {level: {object index: {of, charges?, note?}}}.
// Usage: node tools/extract-uw-enchant.mjs <uw1|uw2> <DATA folder>
// Rules (underworld-exhumed, both games): obj/USEITEMS.C decode_obj_spell and obj/LOOK.C do_of; UW2's weapon
// names that say the opposite of what they do: the editor's EnchantmentEffects (combat/COMBAT.C DoPlayerWeapon).
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const [id, dir] = process.argv.slice(2);
if (!/^uw[12]$/.test(id || '') || !dir) { console.error('usage: node tools/extract-uw-enchant.mjs <uw1|uw2> <DATA folder>'); process.exit(1); }
const uw2 = id === 'uw2';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', id);
const file = n => readFileSync(join(dir, n));
const u16 = (b, o) => b[o] | b[o + 1] << 8, u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;

// ---------- STRINGS.PAK: a Huffman tree, then blocks of strings (a string ends at '|') ----------
function strings(b) {
  const n = u16(b, 0), nodes = [];
  for (let i = 0; i < n; i++) nodes.push(b.subarray(2 + i * 4, 6 + i * 4));   // char, parent, left, right
  let p = 2 + n * 4;
  const count = u16(b, p), blocks = {};
  for (let i = 0; i < count; i++) blocks[u16(b, p + 2 + i * 6)] = u32(b, p + 4 + i * 6);
  return blk => {
    const at = blocks[blk]; if (at == null) return [];
    const k = u16(b, at), list = [];
    for (let s = 0; s < k; s++) {
      let q = at + 2 + 2 * k + u16(b, at + 2 + 2 * s), raw = 0, bit = 0, str = '';
      for (let guard = 0; guard < 512; guard++) {
        let node = n - 1;
        while (nodes[node][2] !== 255 && nodes[node][3] !== 255) {
          if (!bit) { raw = b[q++]; bit = 8; }
          node = raw & 0x80 ? nodes[node][3] : nodes[node][2]; raw = (raw << 1) & 255; bit--;
        }
        const c = nodes[node][0];
        if (c === 0x7C || c === 0xFF) break;
        str += String.fromCharCode(c);
      }
      list.push(str);
    }
    return list;
  };
}
const block = strings(file('STRINGS.PAK'));
const spells = block(6);   // block 6: enchantment and spell names

// ---------- LEV.ARK: UW1 a count and offsets; UW2 a count, then offsets, flags, lengths (LZSS when flag 2) ----------
function lzss(src, at, end) {
  const N = 4096, F = 18, text = new Uint8Array(N).fill(0x20), out = [];
  let r = N - F, flags = 0, p = at;
  for (;;) {
    if (((flags >>= 1) & 256) === 0) { if (p >= end) break; flags = src[p++] | 0xFF00; }
    if (flags & 1) { if (p >= end) break; const c = src[p++]; out.push(c); text[r++] = c; r &= N - 1; }
    else {
      if (p + 1 >= end) break;
      let i = src[p++], j = src[p++]; i |= (j & 0xF0) << 4; j = (j & 0x0F) + 2;
      for (let k = 0; k <= j; k++) { const c = text[(i + k) & (N - 1)]; out.push(c); text[r++] = c; r &= N - 1; }
    }
  }
  return Uint8Array.from(out);
}
const ark = file('LEV.ARK'), blocks = u16(ark, 0);
function levelBlock(n) {
  if (!uw2) { const o = u32(ark, 2 + 4 * n); return o ? ark.subarray(o, o + 0x7C08) : null; }
  const o = u32(ark, 6 + 4 * n), fl = u32(ark, 6 + 4 * blocks + 4 * n), len = u32(ark, 6 + 8 * blocks + 4 * n);
  if (!o || !len) return null;
  return fl & 2 ? lzss(ark, o + 4, o + len) : ark.subarray(o, o + len);
}

// ---------- an object's enchantment, as LookAt words it ----------
const MOBILES = 256, objAt = i => i < MOBILES ? 0x4000 + i * 0x1B : 0x5B00 + (i - MOBILES) * 8;
// UW2: the four "Accuracy" weapon names add damage and the four "Damage" names add to hit (EnchantmentEffects)
const uw2Note = e => e < 4 ? `Works as +${2 * e + 1} damage, not accuracy: Ultima Underworld II swaps its weapon enchantment names.`
  : `Works as +${2 * e - 7} to hit, not damage: Ultima Underworld II swaps its weapon enchantment names.`;
function enchantment(L, i) {
  const o = objAt(i), w0 = u16(L, o), item = w0 & 0x1FF, link = u16(L, o + 6) >> 6, quant = w0 & 0x8000;
  if (item >= 0x180 && item < 0x1C0) return null;   // traps carry none
  if (item >= 0x40 && item < 0x80) return null;      // creatures: named otherwise
  if (item === 0x10F || (item >= 0x120 && item < 0x130)) return null;   // a lock (its link is its number), a spell object (inside a wand; never seen)
  // UW2: a potion holding a trap object (major 6) is "of Poison" (do_of)
  if (uw2 && item >= 0xE1 && item <= 0xE7 && !quant && link > 0)
    for (let k = link, guard = 0; k && guard < 1024; k = u16(L, objAt(k) + 4) >> 6, guard++) if ((u16(L, objAt(k)) & 0x1FF) >> 6 === 6) return {of: 'Poison'};
  let spell = -1;
  if (!quant && link > 0) {   // a spell object (0x120-0x12F) among its contents
    for (let k = link, guard = 0; k && guard < 1024; k = u16(L, objAt(k) + 4) >> 6, guard++) { const it = u16(L, objAt(k)) & 0x1FF; if (it >= 0x120 && it < 0x130) { spell = k; break; } }
  } else if (quant && (w0 & 0x1000) && (item >> 6) !== 5) spell = i;   // its own link (not a door, switch or writing: major 5, described otherwise)
  if (spell < 0) return null;
  const sw0 = u16(L, objAt(spell)), slink = u16(L, objAt(spell) + 6) >> 6, flag = !!(sw0 & 0x800);
  // a container is not an enchanted item: only a charged spell object (a wand's, a staff's) names what holds it
  if (spell !== i && !flag && !(w0 & 0x1000)) return null;
  let major, effect;
  if (flag) { major = (slink & 0x1FF) >> 6; major = major ? major + 12 : -1; effect = slink & 0x3F; }
  else { major = (slink & 0x1FF) >> 4; effect = slink & 0xF; }
  let name, note;
  if (major === 12) {
    const armour = ((item >> 4) & 3) > 1;
    name = spells[0x1C0 + (armour ? 0x10 : 0) + effect];
    if (uw2 && !armour && effect < 8) note = uw2Note(effect);
  } else if (major === 9) return null;   // a curse: no words after the name
  else name = spells[flag && major <= 0 ? 0x100 + effect : (major << 4) + effect];
  const r = {of: (name || 'UNNAMED').trim()};
  if (spell !== i && (sw0 & 0x800)) r.charges = u16(L, objAt(spell) + 4) & 0x3F;
  if (note) r.note = note;
  return r;
}

// the export's levels are 1-based block numbers + 1; its object indexes are the game's
const manifest = JSON.parse(readFileSync(join(out, 'manifest.json')));
const result = {};
let named = 0, checked = 0, mismatch = 0;
for (const lv of manifest.levels) {
  const L = levelBlock(lv.id - 1); if (!L) continue;
  const objs = JSON.parse(readFileSync(join(out, 'levels', String(lv.id), 'objects.json')));
  const per = {};
  objs.forEach((x, i) => {
    if (!x) return;
    checked++;
    if ((u16(L, objAt(i)) & 0x1FF) !== x.item) { mismatch++; return; }
    if (!x.flags?.includes('enchanted') && !(u16(L, objAt(i) + 6) >> 6)) return;   // neither enchanted nor holding anything
    const e = enchantment(L, i);
    if (e) { per[i] = e; named++; }
  });
  if (Object.keys(per).length) result[lv.id] = per;
}
if (mismatch) console.warn(`${mismatch} of ${checked} objects differ from LEV.ARK: is this the same game data the export was made from?`);
writeFileSync(join(out, 'enchant.json'), JSON.stringify(result));
console.log(`${id}: ${named} enchanted objects named, in ${Object.keys(result).length} levels`);
