// Ultima Underworld object names as the game words them, shared by the maps (js/games/uw) and the 3D viewer:
// - an identified enchanted item adds " of <enchantment>", and a wand its charges (obj/LOOK.C do_of), from
//   data/<game>/enchant.json (tools/extract-uw-enchant.mjs). A UW2 weapon whose enchantment name says the opposite
//   of what it does gets a "*", and its note says what it really does;
// - a creature that talks goes by its name, its kind after it in brackets ("Fissif (human)"); one that doesn't
//   keeps its kind ("a goblin").
const bare = s => String(s).replace(/^(an?|the|some) /i, '');

export function uwName(o, e) {
  if (!o) return '';
  const t = o.critter?.talksAs;
  if (t) { const kind = bare(o.name); return t.toLowerCase().includes(kind.toLowerCase()) ? t : `${t} (${kind})`; }
  if (!e) return o.name;
  let s = `${o.name} of ${e.of}`;
  if (e.charges != null) s += ` with ${e.charges || 'no'} full charge${e.charges === 1 ? '' : 's'}`;
  return e.note ? s + '*' : s;
}

// Gives each object of a level its index, its full name (full), its note (note) and the indexes of what it holds
// (kids, in the export's order). ench: that level's part of enchant.json ({index: {of, charges?, note?}}).
export function annotate(objects, ench = {}) {
  objects.forEach((o, i) => { if (!o) return; o.idx = i; o.full = uwName(o, ench[i]); o.note = ench[i]?.note || null; o.kids = []; });
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
