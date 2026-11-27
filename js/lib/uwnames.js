// Ultima Underworld object names as the game words them, shared by the maps (js/games/uw) and the 3D viewer:
// - an identified enchanted item adds " of <enchantment>", and a wand its charges (obj/LOOK.C do_of): the export's
//   of, charges and note on each object (editor 0.1.59). A UW2 weapon whose enchantment name says the opposite of
//   what it does gets a "*", and its note says what it really does. The export names a lock's and a spell object's
//   enchantment too, as do_of would; but a lock sits in its door and a spell object in its wand, never looked at, so
//   those keep their plain names;
// - an identified cursed item has "cursed " before its name (obj/LOOK.C do_mods: "a cursed crown"); the export marks
//   it cursed, and its note says what the curse does (combat/SPELLS.C backfire);
// - a creature that talks goes by its name, its kind after it in brackets ("Fissif (human)"); one that doesn't
//   keeps its kind ("a goblin").
const bare = s => String(s).replace(/^(an?|the|some) /i, '');

export function uwName(o, e) {
  if (!o) return '';
  const t = o.critter?.talksAs;
  if (t) { const kind = bare(o.name); return t.toLowerCase().includes(kind.toLowerCase()) ? t : `${t} (${kind})`; }
  const base = o.cursed ? o.name.replace(/^(?:(an?) |(the|some) )?/i, (m, a, other) => a ? 'a cursed ' : other ? `${other} cursed ` : 'cursed ') : o.name;
  if (!e) return o.cursed ? base + '*' : base;
  let s = `${base} of ${e.of}`;
  if (e.charges != null) s += ` with ${e.charges || 'no'} full charge${e.charges === 1 ? '' : 's'}`;
  return e.note || o.cursed ? s + '*' : s;
}

const CURSE = 'Cursed: its enchantment is a curse that backfires on whoever uses it, some d8s of damage (but never below 3 hit points). The game shows "cursed" only once the item is identified.';
const UNSEEN = new Set([0x10F, 0x120]);   // a lock, a spell object
const enchantOf = o => o.of && !UNSEEN.has(o.item) ? {of: o.of, charges: o.charges, note: o.note} : null;

// Gives each object of a level its index, its full name (full), its note (note) and the indexes of what it holds
// (kids, in the export's order).
export function annotate(objects) {
  objects.forEach((o, i) => {
    if (!o) return;
    const e = enchantOf(o);
    o.idx = i; o.full = uwName(o, e); o.kids = [];
    o.note = [e?.note, o.cursed ? CURSE : null].filter(Boolean).join(' ') || null;
  });
  objects.forEach((o, i) => { if (o && o.in != null && objects[o.in]) objects[o.in].kids.push(i); });
  return objects;
}

// What an object holds, as text: each thing's full name, with what that holds in brackets
export function holds(objects, o, esc, depth = 0) {
  return o.kids.map(i => objects[i]).filter(Boolean).map(c => `${esc(c.full)}${c.kids.length && depth < 4 ? ` (${holds(objects, c, esc, depth + 1)})` : ''}`).join(', ');
}

// The notes of the objects listed, for the end of a card: "* Works as ..."
export function notes(objects, list) {
  const seen = new Set(), out = [];
  const walk = (o, depth) => { if (!o) return; if (o.note && !seen.has(o.note)) { seen.add(o.note); out.push(o.note); } if (depth < 4) for (const i of o.kids || []) walk(objects[i], depth + 1); };
  for (const o of list) walk(o, 0);
  return out.map(n => `* ${n}`);
}
