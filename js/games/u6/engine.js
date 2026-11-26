// The Ultima VI engine (Ultima VI, The Savage Empire, Martian Dreams): maps drawn in the browser, a
// grid tile at a time, from the game's own chunk map and object blocks (data/<game>, by
// tools/extract-u6.mjs). Formats and rules: u6-decompiled SRC (map.c, object.c, npctrack.c, objcmd.c).
import {esc, g, svgDoc, swatch, ring, label, gridLines, gridSwatch, p, image} from '../../lib/draw.js';
import {RUNES_PARAM, loadFont, words, runicBlock} from '../../lib/runes.js';

const DOUBLE_H = 0x40, DOUBLE_W = 0x80, BACKGROUND = 0x20, FOREGROUND = 0x10;   // TileFlag / TileFlag2 bits (u6.h)
const LOCXYZ = 0, CONTAINED = 8, INVISIBLE = 2;
const hh = h => `${String(h).padStart(2, '0')}:00`;
const cap = s => s.replace(/^\w/, c => c.toUpperCase());
const clean = s => (s || '').replace(/\\(\w*)/g, '').replace(/\/\w*/g, '').trim();

// objlist (console.c GAME_Load): the arrays for objects 0-FFh (the NPCs), then the game state.
const OL = {status: 0, pos: 0x100, shape: 0x400, amount: 0x600, orig: 5617, state: 7153};

// ---------- animation (data from tools/extract-u6.mjs, which says where each rule comes from) ----------
// At display tick n (the game's AnimFrameCounter and PaletteCycle, both n after n ticks):
//   an ANIMDATA tile shows frame first + ((n & mask) >> shift)   (AnimateTilesAndActors, gameloop.c)
//   Ultima VI's shore tiles 10h-2Fh take their water tile's pixels through a mask, on even n (GR_ANIMATE_TILES)
//   colours E0h-E7h and E8h-EFh rotate a step a tick, F0h-F3h, F4h-F7h, F8h-FBh every second tick, and FFh pulses
//   through grey levels 12-19 and back (PaletteAnimation, main.c)
// Every tile that can change has a slot in a small sheet, repainted once per tick for the tiles that changed.
function animator(raw, basePal) {
  const dyn = raw.dyn, slot = new Int16Array(0x800).fill(-1);
  dyn.forEach((t, i) => { slot[t] = i; });
  const pix = new Map();
  const GROUP = c => c >= 0xE0 && c <= 0xEF ? 1 : c >= 0xF0 && c <= 0xFB ? 2 : c === 0xFF ? 4 : 0;
  for (const [k, b64] of Object.entries(raw.pix)) {
    const b = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), idx = b.subarray(0, 256), alpha = new Uint8Array(256);
    let g = 0;
    for (let i = 0; i < 256; i++) if (b[256 + (i >> 3)] >> (i & 7) & 1) { alpha[i] = 1; g |= GROUP(idx[i]); }
    pix.set(+k, {idx, alpha, g});
  }
  const anim = new Map(raw.tiles.map(([t, first, mask, shift]) => [t, {first, mask, shift}]));
  const frameOf = (t, n) => { const a = anim.get(t); return a ? a.first + ((n & a.mask) >> a.shift) : t; };
  const framesOf = t => { const a = anim.get(t); return a ? Array.from({length: (a.mask >> a.shift) + 1}, (_, k) => a.first + k) : [t]; };
  // shore masks (ANIMMASK.VGA): byte counts copy, skip, copy, ... ending with 0
  let shore = null;
  if (raw.shore) {
    const m = Uint8Array.from(atob(raw.shore.masks), c => c.charCodeAt(0));
    shore = raw.shore.src.map((src, k) => {
      const copy = new Uint8Array(256);
      let p = k * 64, i = 0, n = m[p++];
      for (let j = 0; j < n && i < 256; j++) copy[i++] = 1;
      for (;;) {
        n = m[p++]; if (!n) break; i += n;
        n = m[p++]; if (!n) break;
        for (let j = 0; j < n && i < 256; j++) copy[i++] = 1;
      }
      return {src, copy};
    });
  }
  const shoreOf = t => shore && t >= raw.shore.first && t < raw.shore.first + 32 ? shore[t - raw.shore.first] : null;
  // the colour groups each slot may show
  const groups = dyn.map(t => {
    const s = shoreOf(t), sets = [...framesOf(t), ...(s ? framesOf(s.src) : [])];
    return sets.reduce((g, f) => g | (pix.get(f)?.g || 0), 0);
  });
  // what a slot shows at tick n, as a number (equal numbers, equal pixels); n = 0: the static picture
  const keyOf = (i, n) => {
    if (!n) return -1;
    const t = dyn[i], s = shoreOf(t), g = groups[i];
    const tri = (n - 1) & 15;
    return (((frameOf(t, n) * 2049 + (s && n >= 2 ? frameOf(s.src, n & ~1) + 1 : 0)) * 8 + (g & 1 ? n & 7 : 0)) * 4 + (g & 2 ? (n >> 1) & 3 : 0)) * 16 + (g & 4 ? (tri > 7 ? 15 - tri : tri) : 0);
  };
  const keyMemo = new Map();
  const keysAt = n => {
    let k = keyMemo.get(n);
    if (!k) { k = Float64Array.from(dyn, (_, i) => keyOf(i, n)); keyMemo.set(n, k); if (keyMemo.size > 6) keyMemo.delete(keyMemo.keys().next().value); }
    return k;
  };
  // tiles that look different at tick b than at tick a
  let chMemo = null;
  const changed = (a, b) => {
    if (chMemo && chMemo.a === a && chMemo.b === b) return chMemo.f;
    const ka = keysAt(a), kb = keysAt(b), f = new Uint8Array(0x800);
    dyn.forEach((t, i) => { if (ka[i] !== kb[i]) f[t] = 1; });
    chMemo = {a, b, f};
    return f;
  };
  const palAt = n => {
    const p = basePal.slice(), tri = (n - 1) & 15, grey = Math.round(((tri > 7 ? 15 - tri : tri) + 12) * 255 / 63);
    for (let j = 0; j < 8; j++) { p[0xE0 + j] = basePal[0xE7 - ((n - j) & 7)]; p[0xE8 + j] = basePal[0xEF - ((n - j) & 7)]; }
    for (let j = 0; j < 4; j++) for (const b of [0xF0, 0xF4, 0xF8]) p[b + j] = basePal[b + 3 - (((n >> 1) - j) & 3)];
    p[0xFF] = [grey, grey, grey];
    return p;
  };
  const cols = 32, rows = Math.ceil(dyn.length / cols) || 1;
  const sheet = document.createElement('canvas');
  sheet.width = cols * 16; sheet.height = rows * 16;
  const sctx = sheet.getContext('2d'), img = sctx.createImageData(sheet.width, sheet.height), cur = new Float64Array(dyn.length).fill(NaN);
  let at = -1;
  // paint the sheet for tick n (n > 0)
  function frame(n) {
    if (at === n) return;
    at = n;
    const keys = keysAt(n), pal = palAt(n), px = img.data;
    let dirty = false;
    for (let i = 0; i < dyn.length; i++) {
      if (cur[i] === keys[i]) continue;
      cur[i] = keys[i]; dirty = true;
      const t = dyn[i], s = shoreOf(t), base = pix.get(s ? t : frameOf(t, n));
      if (!base) continue;
      const over = s && n >= 2 ? pix.get(frameOf(s.src, n & ~1)) : null;
      const ox = (i % cols) * 16, oy = Math.floor(i / cols) * 16;
      for (let q = 0; q < 256; q++) {
        const src = over && s.copy[q] ? over : base, o = ((oy + (q >> 4)) * sheet.width + ox + (q & 15)) * 4;
        if (!src.alpha[q]) { px[o + 3] = 0; continue; }
        const c = pal[src.idx[q]];
        px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
      }
    }
    if (dirty) sctx.putImageData(img, 0, 0);
  }
  // slot i drawn at s pixels (s = 8 or 16) for the current frame, 32 times side by side: a run of the same tile
  // along a row (open water) is then one drawImage
  const strips = new Map();
  function strip(i, s) {
    const id = i * 32 + s;
    let c = strips.get(id);
    if (!c) { const cv = document.createElement('canvas'); cv.width = s * 32; cv.height = s; c = {cv, ctx: cv.getContext('2d'), key: NaN}; strips.set(id, c); }
    if (c.key !== cur[i]) {
      c.key = cur[i];
      c.ctx.clearRect(0, 0, s * 32, s);
      c.ctx.imageSmoothingEnabled = s < 16;
      c.ctx.drawImage(sheet, (i % cols) * 16, Math.floor(i / cols) * 16, 16, 16, 0, 0, s, s);
      for (let w = s; w < s * 32; w *= 2) c.ctx.drawImage(c.cv, 0, 0, w, s, w, 0, w, s);
    }
    return c.cv;
  }
  return {ms: raw.ms, clock: raw.clock, slot, frame, changed, strip};
}

export function makeEngine(cfg) {
  const DATA = new URL(`../../../data/${cfg.id}/`, import.meta.url);
  let loading = null, meta = null;

  const load = () => loading ||= (async () => {
    // a missing file: the visitor gets a plain message, the console how to rebuild it
    const missing = n => { console.warn(`data/${cfg.id}/${n} is missing: run tools/extract-u6.mjs`); return new Error(`Couldn’t load the map data for ${cfg.title}. Try reloading the page.`); };
    const bin = n => fetch(new URL(n, DATA)).then(r => { if (!r.ok) throw missing(n); return r.arrayBuffer(); }).then(b => new Uint8Array(b));
    const [d, sheet, map, chunks, objblk, dngblk, objlist] = await Promise.all([
      fetch(new URL(`${cfg.id}.json`, DATA)).then(r => { if (!r.ok) throw missing(`${cfg.id}.json`); return r.json(); }),
      image(new URL('tiles.png', DATA)), bin('map.bin'), bin('chunks.bin'), bin('objblk.bin'), bin('dngblk.bin'), bin('objlist.bin')]);
    const maps6 = () => Array.from({length: 6}, () => new Map());
    Object.assign(d, {sheet, map, chunks, objlist, ground: [], objs: [[], [], [], [], [], []], at: maps6(), spawnAt: maps6()});
    const u16 = (b, o) => b[o] | b[o + 1] << 8;
    d.u16 = u16;
    // object blocks: a count, then 8-byte records (status, x/y/z in 3 bytes, type | frame << 10, quantity, quality)
    const all = [];
    const blocks = (b, n) => { let o = 0; for (let k = 0; k < n && o < b.length; k++) { const cnt = u16(b, o), recs = []; o += 2; for (let i = 0; i < cnt; i++, o += 8) recs.push(rec(b, o)); for (const r of recs) if ((r.status & 0x18) === CONTAINED) { const c = recs[r.assoc]; if (c) (c.contents ||= []).push(r); } all.push(...recs); } };
    const rec = (b, o) => { const st = b[o], s = u16(b, o + 4); return {status: st, x: u16(b, o + 1) & 0x3FF, y: (u16(b, o + 2) >> 2) & 0x3FF, z: b[o + 3] >> 4, assoc: u16(b, o + 1), type: s & 0x3FF, frame: s >> 10, qty: b[o + 6], qual: b[o + 7]}; };
    blocks(objblk, 64); blocks(dngblk, 5);
    d.inventory = new Map();
    for (const r of all) {
      const use = r.status & 0x18;
      if (use === LOCXYZ) { if (r.z <= 5) { d.objs[r.z].push(r); place(d, r); } }
      else if (use !== CONTAINED) { if (!d.inventory.has(r.assoc)) d.inventory.set(r.assoc, []); d.inventory.get(r.assoc).push(r); }
    }
    // What every egg would hatch, each embryo once, in the egg's order, on the egg's square: egg.c EGG_hatches makes
    // the first creature there and moves the others near it (cfg.eggRules says how far), so this marks where they come.
    // An embryo that hatches invisible creatures (cfg.eggRules.hidden) is listed but not drawn.
    for (const z of [0, 1, 2, 3, 4, 5]) for (const r of d.objs[z]) {
      if (r.type !== cfg.objEgg || !r.contents) continue;
      for (const c of r.contents) if (!cfg.eggRules.hidden?.(c)) place(d, {...c, x: r.x, y: r.y, z, contents: undefined, egg: r}, d.spawnAt);
    }
    // NPCs 1-FFh with a shape
    d.npcs = [];
    for (let n = 1; n < 256; n++) {
      const s = u16(objlist, OL.shape + n * 2);
      if (!s) continue;
      const o = OL.pos + n * 3, st = objlist[OL.status + n];
      if ((st & 0x18) !== LOCXYZ) continue;
      d.npcs.push({n, type: s & 0x3FF, frame: s >> 10, x: u16(objlist, o) & 0x3FF, y: (u16(objlist, o + 1) >> 2) & 0x3FF, z: objlist[o + 2] >> 4, sched: d.schedule[n] || []});
    }
    d.moonstones = !cfg.moonstones ? [] : Array.from({length: 8}, (_, i) => { const o = OL.state + 0x2A + i * 6; return {x: u16(objlist, o), y: u16(objlist, o + 2), z: u16(objlist, o + 4)}; }).filter(m => m.x || m.y);
    d.cache = {};
    if (d.anim) d.anim = animator(d.anim, d.pal);
    return d;
  })();

  const tileOf = (d, r) => d.baseTile[r.type] + r.frame;
  // An object on (x, y) also covers the square left of it (double width), above it (double height), or the three (both).
  function place(d, r, into = d.at) {
    const t = tileOf(d, r), f = d.tileFlag[t] || 0, parts = [[0, 0, 0]];
    if ((f & DOUBLE_W) && (f & DOUBLE_H)) parts.push([-1, 0, 1], [0, -1, 2], [-1, -1, 3]);
    else if (f & DOUBLE_W) parts.push([-1, 0, 1]);
    else if (f & DOUBLE_H) parts.push([0, -1, 1]);
    const W = r.z ? 256 : 1024;
    for (const [dx, dy, k] of parts) {
      const key = ((r.y + dy) & (W - 1)) * W + ((r.x + dx) & (W - 1)), m = into[r.z];
      if (!m.has(key)) m.set(key, []);
      m.get(key).push({r, tile: t - k, part: k});
    }
  }

  // Ground: chunk indexes of 12 bits, 2 in 3 bytes; the surface in 8 x 8 superchunks of 16 x 16 chunks, levels 1-5 of 32 x 32 (map.c getChunkIdxAt).
  function ground(d, z) {
    if (d.ground[z]) return d.ground[z];
    const W = z ? 256 : 1024, out = new Uint8Array(W * W), {map, chunks} = d;
    for (let cy = 0; cy < W / 8; cy++) for (let cx = 0; cx < W / 8; cx++) {
      let base, pos;
      if (z) { base = 0x6000 + (z - 1) * 0x600; pos = cy * 32 + cx; }
      else { base = ((cx >> 4) + ((cy >> 4) << 3)) * 0x180; pos = (cy & 15) * 16 + (cx & 15); }
      const o = base + pos + (pos >> 1), v = map[o] | map[o + 1] << 8, idx = pos & 1 ? v >> 4 : v & 0xFFF;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[(cy * 8 + y) * W + cx * 8 + x] = chunks[idx * 64 + y * 8 + x];
    }
    return d.ground[z] = out;
  }

  // The schedule entry in force at an hour: the latest hour reached (npctrack.c: hour | weekday << 5; weekday 0 = every day).
  function slotAt(sched, hour) {
    const any = sched.filter(e => !(e[0] >> 5)), list = any.length ? any : sched;
    let best = null, ago = 99;
    for (const e of list) { const a = (hour - (e[0] & 31) + 24) % 24; if (a < ago) { ago = a; best = e; } }
    return best;
  }
  const npcAt = (n, hour) => { const e = n.sched.length ? slotAt(n.sched, hour) : null; return e ? {x: e[2], y: e[3], z: e[4], action: e[1]} : {x: n.x, y: n.y, z: n.z, action: null}; };
  const ACTION = {0x87: 'stands', 0x88: 'stands', 0x89: 'stands', 0x8A: 'stands', 0x8B: 'keeps guard', 0x8C: 'keeps guard', 0x8D: 'keeps guard', 0x8E: 'keeps guard',
    0x8F: 'wanders', 0x90: 'loiters', 0x91: 'sleeps', 0x92: 'sits', 0x93: 'eats', 0x94: 'farms', 0x95: 'works', 0x96: 'works', 0x97: 'plays music', 0x98: 'begs', 0x99: 'works', 0x9A: 'rings the bell', 0x9B: 'brawls', 0x9C: 'mops', 0x0E: 'stays put', 0x0F: 'patrols east-west', 0x10: 'patrols north-south'};

  const tname = (d, t) => cap(clean(d.look[t]) || 'Unnamed object');
  const oname = (d, r) => tname(d, tileOf(d, r) - 0);

  // An item's picture, a line high: its tile cut from the tile sheet (16-pixel tiles, 32 a row) as a CSS sprite.
  // Percentages place the tile whatever size the line is. A double-size object shows its base (bottom right) tile.
  function icon(d, r) {
    const t = tileOf(d, r), rows = d.sheet.naturalHeight / 16;
    return `<span class="item-icon" aria-hidden="true" style="background-image:url('${d.sheet.src}');background-size:3200% ${rows * 100}%;` +
      `background-position:${(t % 32) / 31 * 100}% ${(t >> 5) / (rows - 1) * 100}%"></span>`;
  }
  // An egg: a hidden spawn point (egg.c in each decompilation). EGG_hatchArea tries the eggs of the 40 x 40 area the
  // game loads around you, those more than 8 squares from you; EGG_hatches hatches one if 1-100 at random is at most
  // its quantity, then marks it hatched whatever the result, and object.c OBJ_PurgeFarLocals clears the mark once you
  // are more than 20 squares away. The hours, how many of each embryo and where they go differ: cfg.eggRules.
  function eggLine(d, r) {
    const R = cfg.eggRules, when = R.hours?.(r) || '', chance = r.qty >= 100 ? 'every time' : `${r.qty}% of the times`;
    const kids = (r.contents || []).map(c => `<li>${icon(d, c)}${esc(oname(d, c))} ×${R.count(r, c)}${R.note?.(c) ? ` <span class="muted">(${R.note(c)})</span>` : ''}</li>`).join('');
    const never = R.never?.(r);
    return `${icon(d, r)}${esc(oname(d, r))} <span class="muted">(a hidden spawn point)</span>` + (!kids ? '<p class="muted">It holds nothing, so nothing hatches.</p>'
      : never ? `<p class="muted">${never}</p><ul>${kids}</ul>`
      : `<p class="muted">It hatches ${chance} the game loads its area while you are more than 8 squares away${R.inView?.(r) ? ' (this one even when you are nearer)' : ''}${when ? `, ${when}` : ''}, ` +
        `then not again until you have been more than 20 squares away. ${R.where}</p><ul>${kids}</ul>`);
  }
  function itemLine(d, r, depth = 0) {
    if (r.type === cfg.objEgg) return eggLine(d, r);
    let s = icon(d, r) + esc(oname(d, r));
    if (r.qty > 1) s += ` (${r.qty})`;
    if (r.status & INVISIBLE) s += ' <span class="muted">(invisible)</span>';
    if (cfg.note) s += cfg.note(r);
    if (r.contents && depth < 3) s += `<ul>${r.contents.map(c => `<li>${itemLine(d, c, depth + 1)}</li>`).join('')}</ul>`;
    return s;
  }
  // A book's or sign's text as the game prints it. objcmd.c PrintBookText hands BOOK.DAT's text to console.c CON_printf,
  // where % and a character print that character as it is (an unknown conversion): that is how %\ and %^ put the EE and
  // EA runes on a sign, since CON_putch takes a bare \ or ^ as an escape (SW%\PERS is SWEEPERS, D%^[ DEATH). Then
  // CON_putch: < and > begin and end the runic font, the upper half of U6.CH (char | 0x80), where [ \ ] ^ _ are the TH,
  // EE, NG, EA and ST runes and lower case is Gargish; & begins and ends a part printed only once you speak Gargish
  // (the translation under each Gargish sign); @ marks a keyword (not printed); ` capitalises the next letter; * waits
  // for a key. Returns runs of {text, runic, gargish}.
  function parse(t) {
    const out = [];
    let runic = false, gargish = false, cap = false, cur = null;
    const put = ch => {
      if (cap) { ch = ch.toUpperCase(); cap = false; }
      if (!cur || cur.runic !== runic || cur.gargish !== gargish) out.push(cur = {text: '', runic, gargish});
      cur.text += ch;
    };
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === '%' && i + 1 < t.length) put(t[++i]);
      else if (ch === '<') runic = true;
      else if (ch === '>') runic = false;
      else if (ch === '&') gargish = !gargish;
      else if (ch === '`') cap = true;
      else if (ch === '*') put('\n');
      else if (ch !== '@') put(ch);
    }
    return out;
  }
  const translit = r => r.replace(/\[/g, 'TH').replace(/\]/g, 'NG').replace(/_/g, 'ST').replace(/\^/g, 'EA').replace(/\\/g, 'EE');
  const plainRun = s => s.runic ? (/[a-z]/.test(s.text) ? `‹${s.text}›` : translit(s.text)) : s.text;
  const plainText = t => parse(t).map(plainRun).join('');
  const oneLine = s => s.replace(/\s+/g, ' ').trim();
  const lines = s => esc(s).replace(/^\n+|\n+$/g, '').replace(/\n/g, '<br>');
  const isReadable = r => (cfg.bookTypes.includes(r.type) || cfg.signTypes.includes(r.type)) && r.qual > 0;
  // In runes: the runic parts in U6.CH's runes and Gargish, the rest in letters; what only a Gargish speaker reads is
  // given below the sign.
  const bookHTML = (d, r, font) => {
    const t = d.books[r.qual - 1];
    if (!t) return '';
    const runs = parse(t);
    if (!font || !runs.some(s => s.runic)) return `<p class="sign">${lines(runs.map(plainRun).join(''))}</p>`;
    const shown = runs.filter(s => !s.gargish), known = runs.filter(s => s.gargish).map(s => s.text).join('');
    const html = shown.map(s => s.runic ? s.text.split('\n').map(l => words(font, l)).join('<br>') : esc(s.text).replace(/\n/g, '<br>')).join('').replace(/^(<br>)+|(<br>)+$/g, '');
    return runicBlock(html, oneLine(shown.map(plainRun).join('')), [font]) +
      (oneLine(known) ? p(`<span class="muted">Once you speak Gargish the game adds: ${esc(oneLine(known))}</span>`) : '');
  };
  const loadRunes = () => loadFont(new URL('runes.png', DATA), {hint: `run tools/extract-u6.mjs ${cfg.id} <game folder>`});

  function fmtTalk(s) {
    if (cfg.ampQuote) s = s.replace(/&/g, '”');   // Martian Dreams writes a closing quote as &
    return esc(s).replace(/\$P/g, '<i>(your name)</i>').replace(/\$G/g, '<i>(milord/milady)</i>').replace(/\$[A-Z]/g, '…').replace(/#[A-Z0-9]+/g, '…')
      .replace(/@(\w+)/g, '<b>$1</b>').replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function talkHTML(t) {
    const row = (k, v, c) => `<tr><th>${esc(k)}</th><td>${fmtTalk(v)}${c ? ' <span class="tag">depends</span>' : ''}</td></tr>`;
    return (t.hello ? p(`<i>${fmtTalk(t.hello)}</i>`) : '') + `<table>${t.qa.map(q => row(q.k.join(', '), q.a, q.c)).join('')}</table>` +
      '<p class="muted">The game matches only the first four letters of a keyword. “Depends” means the answer changes as the story goes on.</p>';
  }

  // Level links: up/down through a ladder, hole or mine shaft (map.c PartyChangeLevel).
  function levelLink(d, r) {
    const up = r.z && (r.z === 5 || (r.type === cfg.objLadder && r.frame === 1));
    let x = r.x, y = r.y, z = r.z + (up ? -1 : 1);
    if (z === 1 && !up) { x = ((x >> 2) & 0xF8) + (x & 7); y = ((y >> 2) & 0xF8) + (y & 7); }
    else if (z === 0 && up) { x = ((x << 2) & 0x3E0) + (x & 7) + (r.qual & 1 ? 8 : 0) + (r.qual & 2 ? 16 : 0); y = ((y << 2) & 0x3E0) + (y & 7) + (r.qual & 4 ? 8 : 0) + (r.qual & 8 ? 16 : 0); }
    if (z < 0 || z > 5) return null;
    return {label: `${up ? 'Up' : 'Down'} to ${cfg.levels[z]}`, map: `L${z}`, focus: [x, y]};
  }

  // The later games: an entrance's type and quality pick its destination from a table (map.c of each).
  function entranceLink(r) {
    const t = cfg.entrance(r);
    return t ? {label: `To ${cfg.levels[t[2]]}`, map: `L${t[2]}`, focus: [t[0], t[1]]} : null;
  }

  async function render(mapId, params) {
    const d = await load();
    meta = d;
    const z = Math.max(0, Math.min(5, +(/^L(\d)$/.exec(mapId || '') || [0, 0])[1])), W = z ? 256 : 1024;
    const hour = Math.max(0, Math.min(23, params.hour ?? cfg.startHour));
    const font = cfg.runes && params.runes === 1 ? await loadRunes() : null;
    const gr = ground(d, z), at = d.at[z], spawnAt = d.spawnAt[z];
    const people = d.npcs.map(n => ({...n, now: npcAt(n, hour)})).filter(n => n.now.z === z);
    const peopleAt = new Map();
    for (const n of people) {
      const t = d.baseTile[n.type] + n.frame, f = d.tileFlag[t] || 0, parts = [[0, 0, 0]];
      if ((f & DOUBLE_W) && (f & DOUBLE_H)) parts.push([-1, 0, 1], [0, -1, 2], [-1, -1, 3]); else if (f & DOUBLE_W) parts.push([-1, 0, 1]); else if (f & DOUBLE_H) parts.push([0, -1, 1]);
      for (const [dx, dy, k] of parts) { const key = ((n.now.y + dy) & (W - 1)) * W + ((n.now.x + dx) & (W - 1)); if (!peopleAt.has(key)) peopleAt.set(key, []); peopleAt.get(key).push({n, tile: t - k, part: k}); }
    }
    const sheet = d.sheet, avg = d.avg;
    const drawn = (list, off) => list.filter(e => !(e.r.status & INVISIBLE) && (!cfg.hidden.includes(e.r.type)) && !off.has('objects'));
    // A square's tiles bottom to top, as the game stacks them (decomp SRC/object.c ShowObject), the objects taken in the
    // order the game visits them (its object list, which is the file's): a background tile replaces the ground; any other
    // tile goes under everything already there, except a foreground tile, which goes just under the first foreground
    // tile there, or on top when it is the extra part of a double-size object. So of two plain objects on one square the
    // first in the list is drawn on top (a vase on its end table). People are visited first: above plain objects, under
    // foreground ones. What eggs hatch (layer 'spawns') comes after the people, as the game adds them to its actors.
    const actorsAt = (k, off) => {
      const pl = off.has('people') ? null : peopleAt.get(k), sp = off.has('spawns') ? null : spawnAt.get(k);
      return pl && sp ? [...pl, ...sp] : pl || sp;
    };
    const order = (list, pl = []) => {
      const bg = [], st = [];
      for (const e of [...pl, ...list]) {
        const t = e.tile;
        if (d.tileFlag2[t] & BACKGROUND) { bg.push(e); continue; }
        if (!(d.tileFlag[t] & FOREGROUND)) { st.unshift(e); continue; }
        if (e.part) { st.push(e); continue; }
        const i = st.findIndex(o => d.tileFlag[o.tile] & FOREGROUND);
        if (i < 0) st.push(e); else st.splice(i, 0, e);
      }
      return [...bg, ...st];
    };

    // Animation: each canvas remembers the squares holding a tile that can change and the tick it shows; a tick
    // repaints only those squares whose tiles look different now (ground, objects and people of the square).
    const A = d.anim, drawnAt = new WeakMap();
    const clockFrame = A?.clock ? A.clock.first + hour % 12 : 0;
    const shown = t => A?.clock && t === A.clock.tile ? clockFrame : t;
    function draw(cv, x0, y0, span, off, tick = 0) {
      const ctx = cv.getContext('2d'), scale = 256 / span;
      const xa = Math.max(0, Math.floor(x0)), ya = Math.max(0, Math.floor(y0)), xb = Math.min(W, Math.ceil(x0 + span)), yb = Math.min(W, Math.ceil(y0 + span));
      if (xa >= xb || ya >= yb) return;
      const key = `${x0},${y0},${span},${[...off].sort()}`, was = drawnAt.get(cv);
      if (tick && was && was.key === key) {
        if (scale < 8 || !A) return;   // at 4 pixels a square or less nothing moves (a tick would cost too much)
        if (was.tick === tick) return;
        A.frame(tick);
        const ch = A.changed(was.tick, tick), slot = A.slot;
        ctx.imageSmoothingEnabled = scale < 16;
        for (const s of was.squares) {
          let hit = false;
          for (const t of s.t) if (ch[t]) { hit = true; break; }
          if (!hit) continue;
          ctx.clearRect(s.px, s.py, scale * s.n, scale);
          if (s.t.length === 1) { for (let k = 0; k < s.n; k += 32) { const w = Math.min(32, s.n - k) * scale; ctx.drawImage(A.strip(slot[s.t[0]], scale), 0, 0, w, scale, s.px + k * scale, s.py, w, scale); } continue; }
          for (const t of s.t) { const i = slot[t]; if (i >= 0) ctx.drawImage(A.strip(i, scale), 0, 0, scale, scale, s.px, s.py, scale, scale); else ctx.drawImage(sheet, (t % 32) * 16, (t >> 5) * 16, 16, 16, s.px, s.py, scale, scale); }
        }
        was.tick = tick;
        return;
      }
      if (scale < 8) tick = 0;
      if (scale >= 4) {
        ctx.imageSmoothingEnabled = scale < 16;
        if (tick && A) A.frame(tick);
        const slot = A && tick ? A.slot : null, squares = [];
        const blit = (t, x, y) => {
          const i = slot ? slot[t] : -1;
          if (i >= 0) ctx.drawImage(A.strip(i, scale), 0, 0, scale, scale, (x - x0) * scale, (y - y0) * scale, scale, scale);
          else ctx.drawImage(sheet, (t % 32) * 16, (t >> 5) * 16, 16, 16, (x - x0) * scale, (y - y0) * scale, scale, scale);
        };
        for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) blit(gr[y * W + x], x, y);
        for (let y = ya; y < yb; y++) {
          let run = null;   // squares of one changing ground tile and nothing else, side by side: one fillRect a tick
          for (let x = xa; x < xb; x++) {
            const k = y * W + x, list = at.get(k), pl = actorsAt(k, off), tiles = [gr[k]];
            if (list || pl) for (const e of order(list ? drawn(list, off) : [], pl || [])) { const t = e.n || e.r?.egg ? e.tile : shown(e.tile); blit(t, x, y); tiles.push(t); }
            if (!A || scale < 8 || !tiles.some(t => A.slot[t] >= 0)) { run = null; continue; }
            const px = (x - x0) * scale, py = (y - y0) * scale;
            if (tiles.length === 1 && run && run.t[0] === tiles[0]) { run.n++; continue; }
            const s = {px, py, n: 1, t: tiles};
            squares.push(s);
            run = tiles.length === 1 ? s : null;
          }
        }
        drawnAt.set(cv, {key, tick, squares});
        return;
      }
      drawnAt.set(cv, {key, tick, squares: []});
      // far out: each pixel takes the colour of the square under it (the top object's if it covers most of the square)
      const img = ctx.createImageData(256, 256), px = img.data;
      for (let py = 0; py < 256; py++) {
        const y = Math.floor(y0 + py / scale);
        if (y < 0 || y >= W) continue;
        for (let qx = 0; qx < 256; qx++) {
          const x = Math.floor(x0 + qx / scale);
          if (x < 0 || x >= W) continue;
          let c = avg[gr[y * W + x]];
          const list = at.get(y * W + x);
          if (list) for (const e of order(drawn(list, off))) { const a = avg[e.tile]; if (a[3] > 40) c = a; }
          const sp = !off.has('spawns') && spawnAt.get(y * W + x);
          if (sp) for (const e of sp) { const a = avg[e.tile]; if (a[3] > 40) c = a; }
          const pl = !off.has('people') && peopleAt.get(y * W + x);
          if (pl) c = [255, 240, 200, 100];
          const o = (py * 256 + qx) * 4;
          px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // Labels: entrances named by their quality (npctrack.c DungeonNames), moongates, readable signs.
    const parts = {names: '', gates: '', signs: '', talkers: ''}, features = [], eggFeatures = [];   // eggs last in the search list
    for (const r of d.objs[z]) {
      if (cfg.entranceTypes.includes(r.type) && r.qual && cfg.dungeonNames?.[r.qual - 1] && !z) {
        const nm = cfg.dungeonName(r.qual);
        parts.names += label(r.x + .5, r.y - .3, nm, 1.4, '#ffb0a0');
        features.push({name: nm, x: r.x, y: r.y, detail: 'entrance'});
      }
      if (cfg.signTypes.includes(r.type) && r.qual && d.books[r.qual - 1]) {
        parts.signs += ring(r.x, r.y, '#f4efe0', '.12 .08', .1);
        features.push({name: oneLine(plainText(d.books[r.qual - 1])).slice(0, 60), x: r.x, y: r.y, detail: 'sign'});
      }
      if (r.type === cfg.objRedGate && r.qual) features.push({name: 'Red moongate', x: r.x, y: r.y, detail: 'gate'});
      if (r.type === cfg.objEgg && r.contents) eggFeatures.push({name: `Egg: ${[...new Set(r.contents.map(c => oname(d, c)))].join(', ')}`, x: r.x, y: r.y, detail: 'spawn point'});
    }
    for (const m of d.moonstones) if (m.z === z) { parts.gates += ring(m.x, m.y, '#b48cff', '', .14); features.push({name: 'Moongate (moonstone)', x: m.x, y: m.y, detail: 'gate'}); }
    for (const n of people) {
      const t = d.talk[n.n];
      if (t) { parts.talkers += ring(n.now.x, n.now.y, '#8cc6e0'); features.push({name: t.name, x: n.now.x, y: n.now.y, detail: (t.qa.find(q => q.k.includes('job'))?.a || '').slice(0, 80)}); }
    }
    features.push(...eggFeatures);

    const cell = (x, y, _at, off = new Set()) => {
      const key = y * W + x, links = [], spawns = off.has('spawns') ? [] : spawnAt.get(key) || [];
      // a double-width or double-height object or person also covers the squares left of and above its own: a click
      // there shows it, as on its own square, and outlines both squares
      if (!(peopleAt.get(key) || []).some(e => !e.part) && !(at.get(key) || []).some(e => e.part === 0) && !spawns.some(e => !e.part)) {
        const pe = (peopleAt.get(key) || []).find(e => e.part), oe = (at.get(key) || []).find(e => e.part) || spawns.find(e => e.part);
        const [ax, ay] = pe ? [pe.n.now.x, pe.n.now.y] : oe ? [oe.r.x, oe.r.y] : [];
        if (ax != null && (ax !== x || ay !== y)) {
          const c = cell(ax, ay, undefined, off);
          return c && {...c, box: [Math.min(x, ax), Math.min(y, ay), Math.abs(ax - x) + 1, Math.abs(ay - y) + 1]};
        }
      }
      let body = '', title = tname(d, gr[key]);
      for (const e of peopleAt.get(key) || []) {
        if (e.part) continue;
        const n = e.n, t = d.talk[n.n];
        title = t ? t.name : tname(d, e.tile);
        body += `<p class="muted">${esc(tname(d, e.tile))}${n.now.action != null && ACTION[n.now.action] ? ` · ${ACTION[n.now.action]}` : ''}${t && t.look ? ` · ${esc(t.look)}` : ''}</p>`;
        if (n.sched.length) {
          body += `<p class="muted">${n.sched.map(s => `${hh(s[0] & 31)}: ${ACTION[s[1]] ? `${ACTION[s[1]]} ` : ''}at ${s[2]}, ${s[3]}${s[4] !== z ? ` (${esc(cfg.levels[s[4]])})` : ''}${s[0] >> 5 ? ` (day ${s[0] >> 5} of the week only)` : ''}`).join('<br>')}</p>`;
          for (const s of n.sched) if (s[2] !== x || s[3] !== y || s[4] !== z) links.push({label: `At ${hh(s[0] & 31)}`, map: `L${s[4]}`, params: {hour: s[0] & 31}, focus: [s[2], s[3]]});
        }
        const inv = d.inventory.get(n.n);
        if (inv && inv.length) body += p(`Carries: ${inv.map(r => itemLine(d, r)).join(', ')}`);
        if (t) body += talkHTML(t);
      }
      const list = (at.get(key) || []).filter(e => e.part === 0);
      if (list.length) {
        const items = order(list).reverse();   // the one drawn on top first
        body += `<ul>${items.map(e => `<li>${itemLine(d, e.r)}${isReadable(e.r) ? bookHTML(d, e.r, font) : ''}</li>`).join('')}</ul>`;
        if (!(peopleAt.get(key) || []).some(e => !e.part)) title = oname(d, items[0].r);
        for (const e of items) {
          const r = e.r;
          if (r.type === cfg.objLadder || cfg.entranceTypes.includes(r.type)) { const l = cfg.entrance ? entranceLink(r) : levelLink(d, r); if (l) links.push(l); if (!z && r.qual && cfg.dungeonNames?.[r.qual - 1]) body = p(`<b>${esc(cfg.dungeonName(r.qual))}</b>`) + body; }
          if (r.type === cfg.objRedGate && r.qual && cfg.redGates[r.qual - 1]) { const [gx, gy, gz] = cfg.redGates[r.qual - 1]; links.push({label: 'Where this red gate leads', map: `L${gz}`, focus: [gx, gy]}); }
        }
      }
      // shown on the map as if hatched: the egg's line above says what, how many, how often and when
      const hatched = spawns.filter(e => !e.part);
      if (hatched.length && !(peopleAt.get(key) || []).some(e => !e.part)) title = `${oname(d, hatched[0].r)} (from an egg)`;
      if (d.moonstones.some(m => m.x === x && m.y === y && m.z === z)) body += p('<b>Moongate.</b> A moonstone lies buried here when the game starts. Its blue moongate opens with the moons’ phases, and the Orb of the Moons can take you to it.');
      return {title, body, links};
    };

    const info = `<h3>${esc(cfg.levels[z])}</h3>
      <p>${W} × ${W} squares, drawn from the game’s map and objects as they are when a game starts. People stand where their schedule puts them at ${hh(hour)}.</p>
      <p class="muted">Click a square for everything on it: ${[
        'containers show what they hold',
        cfg.signTypes.length ? 'signs and books their text' : cfg.bookTypes.length ? 'books their text' : '',
        cfg.objLadder >= 0 ? 'ladders and holes where they lead' : 'entrances where they lead',
        'eggs what they hatch, how many and how often',
        'people their day and conversation'].filter(Boolean).join(', ')}.</p>`;
    return {
      title: cfg.levels[z], subtitle: `${cfg.title} · ${hh(hour)}`, width: W, height: W, native: 16, wrap: true, draw, cell, features, info,
      animate: A ? {ms: A.ms} : undefined,
      coords: cfg.coords && cfg.coords(z) ? (x, y) => cfg.coords(z)(x, y) : null,
      svg: svgDoc(W, W, Object.entries(parts).map(([k, v]) => g(k, v)).join('') + g('grid', gridLines(W, W))),
      layers: [{id: 'objects', name: 'Objects'}, {id: 'people', name: 'People'},
        {id: 'spawns', name: 'Egg spawns, all hatched'},
        {id: 'talkers', name: 'People who talk', swatch: swatch(ring(0, 0, '#8cc6e0'))},
        // only the layers this game has: The Savage Empire and Martian Dreams have no named entrances, moongates or signs
        ...(cfg.dungeonNames ? [{id: 'names', name: 'Entrance names', swatch: swatch(label(.5, .8, 'A', .9, '#ffb0a0'))}] : []),
        ...(cfg.moonstones ? [{id: 'gates', name: 'Moongates', swatch: swatch(ring(0, 0, '#b48cff', '', .14))}] : []),
        ...(cfg.signTypes.length ? [{id: 'signs', name: 'Signs', swatch: swatch(ring(0, 0, '#f4efe0', '.12 .08'))}] : []),
        {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
    };
  }

  return {
    id: cfg.id, title: cfg.title, version: cfg.version,
    params: [{key: 'hour', slider: true, label: 'Hour of the day', def: cfg.startHour, min: 0, max: 23, help: 'People keep daily schedules. 0 is midnight.'},
      ...(cfg.runes ? [RUNES_PARAM] : [])],
    transient: [], defaultMap: 'L0',
    maps() { return cfg.levels.map((name, z) => ({id: `L${z}`, name})); },
    render,
    _meta: () => meta,
  };
}
