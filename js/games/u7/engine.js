// The Ultima VII engine's world (The Black Gate, Serpent Isle): 3072 x 3072 tiles drawn in the browser as you pan, from
// the game's own chunk map and objects (data/<id>, by tools/extract-u7.mjs). Objects at or above the
// height cutoff are left out, so roofs and upper floors can be lifted off to see inside.
// Drawing: the original renderer's rules, from the decomp (../Ultima7_Decomp): an object's hot spot is at
// ((x + 1) * 8 - 1 - 4 * lift, (y + 1) * 8 - 1 - 4 * lift) (main/bltshape.c), and objects are painted in the order
// common/sortitem.c works out.
import {esc, svgDoc, g, gridSwatch, p, image} from '../../lib/draw.js';
import {RUNES_PARAM, loadFont, glyph, runicBlock} from '../../lib/runes.js';

const N = 3072, CH = 192;   // tiles and chunks a side

export function makeU7(cfg) {
const DATA = new URL(`../../../data/${cfg.id}/`, import.meta.url);
let loading = null;
const load = () => loading ||= (async () => {
  // a missing file: the visitor gets a plain message, the console how to rebuild it
  const missing = n => { console.warn(`data/${cfg.id}/${n} is missing: run tools/extract-u7.mjs ${cfg.id}`); return new Error(`Couldn’t load the map data for ${cfg.title}. Try reloading the page.`); };
  const bin = n => fetch(new URL(n, DATA)).then(r => { if (!r.ok) throw missing(n); return r.arrayBuffer(); });
  const meta = await fetch(new URL(`${cfg.id}.json`, DATA)).then(r => { if (!r.ok) throw missing(`${cfg.id}.json`); return r.json(); });
  const atlasUrl = Array.from({length: meta.pages}, (_, i) => new URL(`atlas-${i}.png`, DATA).href);
  const [map, chunks, frames, objects, contents, ...atlas] = await Promise.all([bin('map.bin'), bin('chunks.bin'), bin('frames.bin'), bin('objects.bin'),
    fetch(new URL('contents.json', DATA)).then(r => r.ok ? r.json() : {}), ...atlasUrl.map(u => image(u))]);
  // sign, gravestone and plaque texts and their fonts (tools/extract-u7-signs.mjs)
  const signs = await fetch(new URL('signs.json', DATA)).then(r => r.ok ? r.json() : (console.warn(`data/${cfg.id}/signs.json is missing: run tools/extract-u7-signs.mjs ${cfg.id}`), {texts: {}, fonts: {}}));
  const d = {...meta, map: new Uint16Array(map), chunks: new Uint16Array(chunks), fr: new DataView(frames), atlas, atlasUrl, contents, signs};
  // frames.bin lists the frames used, each under shape * 64 + frame: an index from that key to the record (-1 none)
  d.at = new Int32Array(1024 * 64).fill(-1);
  for (let o = 0; o < frames.byteLength; o += 20) d.at[d.fr.getUint32(o, true)] = o + 4;
  // objects: x, y, lift, flags, shape | frame << 10, quality, 0 (10 bytes); indexed by chunk
  const R = 10, ov = new DataView(objects), n = objects.byteLength / R;
  d.obj = {x: new Uint16Array(n), y: new Uint16Array(n), z: new Uint8Array(n), fl: new Uint8Array(n), sf: new Uint16Array(n), q: new Uint8Array(n)};
  d.byChunk = Array.from({length: CH * CH}, () => []);
  for (let i = 0; i < n; i++) {
    const k = i * R, x = ov.getUint16(k, true), y = ov.getUint16(k + 2, true);
    d.obj.x[i] = x; d.obj.y[i] = y; d.obj.z[i] = ov.getUint8(k + 4); d.obj.fl[i] = ov.getUint8(k + 5); d.obj.sf[i] = ov.getUint16(k + 6, true); d.obj.q[i] = ov.getUint8(k + 8);
    d.byChunk[(y >> 4) * CH + (x >> 4)].push(i);
  }
  // every key in the game, by its number (its quality): lying on the map, in a container (where the container is), or
  // carried by someone. A key opens the locks with the same number (Exult contain.cc: keys go by quality).
  d.keys = new Map();
  const addKey = (q, at) => { if (!d.keys.has(q)) d.keys.set(q, []); d.keys.get(q).push(at); };
  const walk = (items, at) => { for (const it of items) { if (it[0] === KEY) addKey(it[2], at); walk(it.slice(3), at); } };
  for (let i = 0; i < n; i++) if ((d.obj.sf[i] & 0x3FF) === KEY) addKey(d.obj.q[i], {x: d.obj.x[i], y: d.obj.y[i], where: 'lies'});
  for (const [i, items] of Object.entries(contents)) walk(items, {x: d.obj.x[+i], y: d.obj.y[+i], where: 'in', box: d.obj.sf[+i]});
  for (const p of meta.npcs) if (p.inv) walk(p.inv, {x: p.x, y: p.y, where: 'carried', who: p});
  // how many locked chests each lock number has
  d.ord = orderer(d.tfa); d.lists = new Map();
  d.locks = new Map();
  for (let i = 0; i < n; i++) if (LOCKED.has(d.obj.sf[i] & 0x3FF)) d.locks.set(d.obj.q[i], (d.locks.get(d.obj.q[i]) || 0) + 1);
  return d;
})();

// ground: U7MAP holds 12 x 12 superchunks of 16 x 16 chunk numbers; a chunk is 16 x 16 tiles of shape | frame << 10
const groundAt = (d, x, y) => 0x7FFF & d.chunks[d.map[((y >> 8) * 12 + (x >> 8)) * 256 + ((y >> 4) & 15) * 16 + ((x >> 4) & 15)] * 256 + (y & 15) * 16 + (x & 15)];
// a frame number has 6 bits: 32 and up is a reflected frame (the extractor stores it ready turned)
const FR = (d, sf) => { const o = d.at[(sf & 0x3FF) * 64 + ((sf >> 10) & 63)], v = d.fr; return o < 0 ? null : {page: v.getUint8(o), ax: v.getUint16(o + 2, true), ay: v.getUint16(o + 4, true), w: v.getUint16(o + 6, true), h: v.getUint16(o + 8, true), xl: v.getInt16(o + 10, true), ya: v.getInt16(o + 12, true), c1: v.getUint8(o + 14), c2: v.getUint8(o + 15)}; };
const avg = f => [f.c1 & 0xF0, (f.c1 & 15) << 4, f.c2 & 0xF0, (f.c2 & 15) * 17];
const isFlat = sf => (sf & 0x3FF) < 0x96;
// An item's name as the game builds it (decomp main/look.c ProduceItemDisplayName): a name is four parts split by
// slashes, article/base/singular/plural: one is the article, a space, the base and the singular ("/key//s" is "key"),
// more the count, the base and the plural ("3 keys"); a name without slashes is all base ("3 gold"). Some shapes name
// each frame instead (TEXT.FLX's misc names). The article ("a", "an") is dropped here, for titles.
function name(d, sf, q = 0) {
  let s = d.frameNames?.[(sf & 0x3FF) * 64 + ((sf >> 10) & 31)] || d.names[sf & 0x3FF] || '';
  if (s.includes('/')) {
    const [a, b = '', c = '', e = ''] = s.split('/');
    s = q > 1 ? `${q} ${b}${e}` : `${a ? a + ' ' : ''}${b}${c}`;
  } else if (s && q > 1) s = `${q} ${s}`;
  s = s.replace(/^(a|an) /i, '').trim();
  return s ? s.replace(/^\w/, ch => ch.toUpperCase()) : 'Unnamed object';
}
// A chunk's list as the game builds it when the chunk comes into view (decomp main/vitem.c LoadChunkItems): its
// movable objects as the region file lists them, then each terrain cell that is a shape of its own (150 and up; all of
// them are of class 0, the only ones the game makes objects of), then its fixed objects, each put in place by PlaceItem.
// Returns a dummy head whose next is the first object.
function chunkList(d, ci) {
  let head = d.lists.get(ci);
  if (head) return head;
  head = {next: null};
  const cx = ci % CH, cy = ci / CH | 0, ids = d.byChunk[ci], node = i => ({x: d.obj.x[i], y: d.obj.y[i], z: d.obj.z[i], sf: d.obj.sf[i], t: i, next: null});
  let tail = head;
  for (const i of ids) if (!(d.obj.fl[i] & 1)) tail = tail.next = node(i);
  for (let k = 0; k < 256; k++) {
    const x = cx * 16 + (k & 15), y = cy * 16 + (k >> 4), sf = groundAt(d, x, y);
    if (!isFlat(sf)) d.ord.place(head, {x, y, z: 0, sf, t: -1, next: null});
  }
  for (const i of ids) if (d.obj.fl[i] & 1) d.ord.place(head, node(i));
  d.lists.set(ci, head);
  return head;
}
// schedule activities (Exult schedule.h)
const ACT = ['fighting', 'pacing east-west', 'pacing north-south', 'talking', 'dancing', 'eating', 'farming', 'keeping shop', 'mining', 'hunting', 'standing', 'loitering', 'wandering',
  'at the forge', 'sleeping', 'waiting', 'sitting', 'grazing', 'baking', 'sewing', 'keeping away', 'in the lab', 'thieving', 'waiting tables', 'on an errand', 'playing', 'eating at the inn', 'dueling',
  'preaching', 'patrolling', 'at a desk', 'following the Avatar'];
const hh = h => `${String(h).padStart(2, '0')}:00`;
const pname = n => n.name.replace(/_/g, ' ').replace(/ \d+$/, m => m) || `NPC ${n.n}`;
// the entry in force at an hour: the latest 3-hour period reached
function slotAt(sched, hour) {
  const per = Math.floor(hour / 3);
  let best = null, ago = 99;
  for (const e of sched) { const a = (per - e[0] + 8) % 8; if (a < ago) { ago = a; best = e; } }
  return best;
}
// Keys (decomp usecode Key.use, SI &KEY.use): a key opens a locked chest (522) or one of the four doors with the same
// quality as its own. A door's state is its frame mod 4: 0 shut, 1 open, 2 locked, 3 magically locked (no key opens it).
// Black Gate's sealed box (798) needs no key: using it opens it (SealedBox.use); in Serpent Isle 798 is a baby dragon.
const KEY = 641, LOCKED = new Set([522]), DOORS = new Set([270, 376, 432, 433]), SEALED = 798;
// a shape's footprint in tiles (TFA.DAT), x and y swapped for a reflected frame
const size = (d, sf) => { const t = d.tfa[(sf & 0x3FF) * 3 + 2], a = 1 + (t & 7), b = 1 + ((t >> 3) & 7); return sf & (32 << 10) ? [b, a] : [a, b]; };
// An object's picture on the map, in shape pixels (8 a tile): the hot spot is ((x + 1) * 8 - 1 - 4 * lift, likewise y).
function box(d, o) {
  const f = FR(d, o.sf); if (!f) return null;
  const hx = (o.x + 1) * 8 - 1 - 4 * o.z, hy = (o.y + 1) * 8 - 1 - 4 * o.z;
  o.f = f; o.left = hx - f.xl; o.top = hy - f.ya;
  return o;
}
// ---------- the game's drawing order (decomp: BG U7/common/sortitem.c; Serpent Isle's is the same) ----------
// Each chunk keeps its objects in a list, nearest first. An object's extent is three bit masks: the cells it covers
// across and down, counted back from a chunk's far corner (bit k: k cells west or north of it), and the heights it
// covers (bit 15 - z for the ground up). PlaceItem puts a new object before the first one in its chunk's list that
// lies behind it, then moves up a later one that lies in front of it. RenderOrder::build merges the chunks in view,
// from the bottom right, holding back an object that reaches into the chunk to its left or above until that chunk
// has been listed up to it. The painter draws the result last to first, so the flat objects (height 0), listed
// after everything else, go down first.
const SPAN = [0x1, 0x3, 0x7, 0xf, 0x1f, 0x3f, 0x7f, 0xff], HMASK = [0x8000, 0x4000, 0x6000, 0x7000, 0x7800, 0x7c00, 0x7e00, 0x7f00];
const WAITING = 0, READY = 1, ACTIVE = 2, HELD = 3, HELD_BOTH = 4, DONE = 5;   // a chunk's sorting state
function orderer(tfa) {
  const t2 = sf => tfa[(sf & 0x3FF) * 3 + 2];
  const fpx = sf => (sf & 0x8000 ? t2(sf) >> 3 : t2(sf)) & 7, fpy = sf => (sf & 0x8000 ? t2(sf) : t2(sf) >> 3) & 7;   // GetFootprintX/Y
  const height = o => tfa[(o.sf & 0x3FF) * 3] >> 5;
  const shl = (m, n) => n < 32 ? (m << n) | 0 : 0;   // a 32-bit long, as in the game
  // SetItemExtent: o's masks counted from (bx, by); only the low byte of a coordinate counts, as in the game
  const ext = (o, bx, by) => ({bx, by, x: shl(SPAN[fpx(o.sf)], (bx - o.x) & 255), y: shl(SPAN[fpy(o.sf)], (by - o.y) & 255), z: HMASK[height(o)] >> o.z});
  const corner = o => ext(o, (o.x & ~15) + 15, (o.y & ~15) + 15);
  // CompareItemExtent: 1 if o lies behind the box, 2 if in front of it, 0 if neither
  function cmp(b, o) {
    const a = ext(o, b.bx, b.by);
    if (b.x <= a.x && b.y <= a.y && b.z <= a.z) return 1;
    if (b.x >= a.x && b.y >= a.y && b.z >= a.z) return 2;
    const zLE = b.z <= a.z || (b.z & a.z), zGE = b.z >= a.z || (b.z & a.z);
    if (a.x & b.x) {
      if (a.y & b.y) { if (b.z < a.z) return 1; if (b.z > a.z) return 2; }
      else { if (b.y < a.y && zLE) return 1; if (b.y > a.y && zGE) return 2; }
    } else if (a.y & b.y) { if (b.x < a.x && zLE) return 1; if (b.x > a.x && zGE) return 2; }
    else if (b.x < a.x) { if (b.y < a.y && zLE) return 1; }
    else if (b.y > a.y && zGE) return 2;
    return 0;
  }
  // PlaceItem: o into the list after head (a dummy whose next is the first object)
  function place(head, o) {
    const first = corner(o);
    let prev = head, cur = head.next;
    while (cur && cmp(first, cur) !== 1) { prev = cur; cur = cur.next; }
    o.next = cur; prev.next = o;
    if (!cur) return;
    let before = prev, found = null, second = null, guard = 100000;
    prev = cur; cur = cur.next;
    while (cur && --guard) {
      if (found) {
        if (cur === found) { prev.next = cur.next; cur.next = o; before.next = cur; before = cur; cur = prev; found = null; }
        else if (cmp(second, cur) === 2) { found = cur; second = corner(cur); prev = o; cur = o.next; }
      } else if (cmp(first, cur) === 2) { found = cur; second = corner(cur); prev = o; cur = o.next; }
      prev = cur; cur = cur.next;
    }
  }
  const crossX = o => (((o.x & 255) - fpx(o.sf)) & 0xfff0) !== ((o.x & 255) & 0xfff0);   // ShapeCrossesChunkX
  const crossY = o => (((o.y & 255) - fpy(o.sf)) & 0xfff0) !== ((o.y & 255) & 0xfff0);
  // IsItemHiddenBehind: whether b lies behind a, measured from the far corner of the farther of their chunks
  const hidden = (a, b) => cmp(ext(a, Math.max(a.x & ~15, b.x & ~15) + 15, Math.max(a.y & ~15, b.y & ~15) + 15), b) === 1;
  // RenderOrder::build over a grid of chunk lists (heads[row][col]: each chunk's first object); keep(o) is addItem's
  // test (in the box, within the heights). Returns the objects nearest first.
  function build(heads, keep) {
    const R = heads.length, C = heads[0].length, LR = R - 1, LC = C - 1, out = [];
    const grid = v => heads.map(r => r.map(() => v));
    const NX = heads.map(r => r.slice()), ST = grid(WAITING), H1 = grid(null), H2 = grid(null);
    const add = o => { if (o && keep(o)) out.push(o); };
    const push = (r, c, o) => { if (!H1[r][c]) H1[r][c] = o; else if (!H2[r][c]) H2[r][c] = o; };
    function release(col, row, r) {   // ReleaseHeldItem
      if (!r) return false;
      if (row < LR && r === NX[row + 1][col]) {
        if (ST[row + 1][col] !== HELD) return false;
        NX[row + 1][col] = r.next; ST[row + 1][col] = READY; return true;
      }
      if (col < LC && r === NX[row][col + 1]) {
        if (ST[row][col + 1] !== HELD) return false;
        NX[row][col + 1] = r.next; ST[row][col + 1] = READY; return true;
      }
      if (row < LR && col < LC && r === NX[row + 1][col + 1] && ST[row + 1][col + 1] === HELD_BOTH) {
        NX[row + 1][col + 1] = r.next; ST[row + 1][col + 1] = READY;
        for (const [y, x] of [[row + 1, col], [row, col + 1]]) {
          if (r === H1[y][x]) { H1[y][x] = H2[y][x]; H2[y][x] = null; }
          if (r === H2[y][x]) H2[y][x] = null;
        }
        return true;
      }
      return false;
    }
    const settle = (row, col) => { if (!H1[row][col] && H2[row][col]) { H1[row][col] = H2[row][col]; H2[row][col] = null; } };
    ST[LR][LC] = READY;
    let cur = null, col = LC, row = LR, mode = 0, fb = null, sb = null, guard = 2000000;
    while (--guard) {
      if (!cur) {
        if (mode) {   // the chunk's held objects, before its own
          if (mode === 2) {
            cur = H1[row][col]; let other = H2[row][col];
            if (hidden(other, cur)) { cur = other; other = H1[row][col]; }
            H1[row][col] = H2[row][col] = null;
            if (release(col, row, cur)) add(cur);
            if (release(col, row, other)) add(other);
          } else {
            cur = H1[row][col]; H1[row][col] = null;
            if (release(col, row, cur)) add(cur);
          }
          mode = 0; settle(row, col); cur = null;
          continue;
        }
        // the next chunk ready, from the bottom right; when none is, the first one still holding an object gives it up
        let done = false;
        col = LC; row = LR;
        while (ST[row][col] !== READY) if (--col < 0) { col = LC; if (--row < 0) { done = true; break; } }
        if (done) {
          done = false; col = LC; row = LR;
          while (ST[row][col] === DONE) if (--col < 0) { col = LC; if (--row < 0) { done = true; break; } }
          if (!done && (ST[row][col] === HELD || ST[row][col] === HELD_BOTH)) {
            ST[row][col] = READY;
            cur = NX[row][col]; add(cur);
            NX[row][col] = cur = cur ? cur.next : null;
            if (col > 0) H1[row][col - 1] = H2[row][col - 1] = null;
            if (row > 0) H1[row - 1][col] = H2[row - 1][col] = null;
          }
        }
        if (done) break;
        cur = H1[row][col];
        if (cur) {
          mode = 1; fb = corner(cur);
          cur = H2[row][col];
          if (cur) { mode = 2; sb = corner(cur); }
        } else mode = 0;
        cur = NX[row][col];
        ST[row][col] = ACTIVE;
        if (row > 0 && (col === LC || ST[row - 1][col + 1] > READY) && ST[row - 1][col] < HELD) ST[row - 1][col] = READY;
        if (col > 0 && (row === LR || ST[row + 1][col - 1] > READY) && ST[row][col - 1] < HELD) ST[row][col - 1] = READY;
      }
      if (!cur) { ST[row][col] = DONE; continue; }
      if (height(cur) === 0) {   // flat: listed at the end
        NX[row][col] = cur = cur.next;
        if (!cur) ST[row][col] = DONE;
        continue;
      }
      let flag = false, h1 = 0, h2 = 0;
      if (mode) h1 = cmp(fb, cur);
      if (mode === 2) h2 = cmp(sb, cur);
      if (h1 === 1 || h2 === 1) { NX[row][col] = cur; ST[row][col] = READY; flag = true; }
      else if (h1 !== 2 && h2 !== 2) {
        if (col > 0 && crossX(cur)) {
          if (mode) { h1 = 1; if (mode === 2) h2 = 1; flag = true; }
          NX[row][col] = cur;
          push(row, col - 1, cur);
          if (row > 0 && crossY(cur)) { ST[row][col] = HELD_BOTH; push(row - 1, col, cur); push(row - 1, col - 1, cur); }
          else { ST[row][col] = HELD; if (row > 0 && ST[row - 1][col] === READY) ST[row - 1][col] = WAITING; }
        } else if (row > 0 && crossY(cur)) {
          if (mode) { h1 = 1; if (mode === 2) h2 = 1; flag = true; }
          NX[row][col] = cur; ST[row][col] = HELD;
          if (col > 0 && ST[row][col - 1] === READY) ST[row][col - 1] = WAITING;
          push(row - 1, col, cur);
        }
        if (!flag && (ST[row][col] === HELD || ST[row][col] === HELD_BOTH)) { cur = null; mode = 0; continue; }
      }
      if (flag) {
        if (h1 === 1) {
          if (h2 === 1 && hidden(H2[row][col], H1[row][col])) { const t = H1[row][col]; H1[row][col] = H2[row][col]; H2[row][col] = t; }
          cur = H1[row][col]; H1[row][col] = null;
          if (release(col, row, cur)) add(cur);
        }
        if (h2 === 1) { cur = H2[row][col]; H2[row][col] = null; if (release(col, row, cur)) add(cur); }
        settle(row, col);
        mode = 0; cur = null;
      } else {
        add(cur);
        cur = cur.next;
        if (!cur) { NX[row][col] = null; ST[row][col] = DONE; }
      }
    }
    if (!guard) {   // a walk that does not end (not seen): whatever it missed goes on top rather than nowhere
      console.warn('U7 draw order: the walk did not end');
      const seen = new Set(out);
      for (const r of heads) for (const h of r) for (let o = h; o; o = o.next) if (height(o) && !seen.has(o)) add(o);
    }
    // the flat objects, chunk by chunk from the top left
    for (const r of heads) for (const h of r) for (let o = h; o; o = o.next) if (!height(o)) add(o);
    return out;
  }
  return {place, build};
}
// Animation, as the original renderer does it (decomp: BG U7/common/mapview.c RendererState::frame and
// WorldView::paintItem; SI si/common/mapview.c adds kind 15). Each repaint the clock ticks once; an animated shape's
// kind says how its frame moves. The game keeps a moving frame per item; here it is worked out from the tick (and,
// where the game rolls dice, from a hash of the item and the tick), so neighbouring tiles agree.
const hash = (i, t) => { let h = (i * 2654435761 ^ t * 40503) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h ^ h >>> 13) % 100; };
function animFrame(kind, n, f, t, id, hour) {
  switch (kind) {
    case 0: return (f + t) % n;                                   // RendererState::frame: the tick added
    case 1: return (f + t) % n;                                   // one a repaint
    case 2: case 12: return (f + (t >> 2)) % n;                   // a quarter of the repaints (2: by chance, 12: every 4th)
    case 3: case 4: { const p = 2 * (n - 1) || 1, k = ((kind === 4 ? t >> 2 : t) + f) % p; return k < n ? k : p - k; }   // to and fro
    case 5: { if (f) return (f + t) % n; const P = n + 20, k = (t + hash(id, 0)) % P; return k < n ? k : 0; }   // now and then a run through
    case 6: return hash(id, t) % n;                               // any frame
    case 7: return f ^ (hash(id, t / 10 | 0) & 1);                // the other of a pair, a 5% chance a repaint: about every 20
    case 9: case 10: { const L = kind === 9 ? 8 : 6, g = f + t; return n < L || g < n ? Math.min(g, n - 1) : n - L + (g - (n - L)) % L; }   // run, then loop the last 8 (6)
    case 11: return f ? 1 + (f - 1 + t) % (n - 1) : 0;            // loop 1.. once started
    case 13: return Math.min(f + t, n - 1);                       // run to the end and stay
    case 14: return (f + (t >> 2)) % n;                           // a quarter of the clock added
    case 8: return Math.min(hour, n - 1);                         // the hour (sundials)
    case 15: { const g = f - f % 6, m = Math.min(6, n - g); return g + (f - g + t) % m; }   // SI: loops of 6 frames
    default: return f;
  }
}

// an item's picture, shrunk or grown to a line of text: a CSS sprite from the atlas page
function icon(d, sf, px = 18) {
  const f = FR(d, sf); if (!f || !f.w) return '';
  const s = Math.min(px / f.h, 2 * px / f.w), img = d.atlas[f.page];
  return `<span class="u7icon" style="width:${(f.w * s).toFixed(1)}px;height:${(f.h * s).toFixed(1)}px;background:url(${d.atlasUrl[f.page]}) ${(-f.ax * s).toFixed(1)}px ${(-f.ay * s).toFixed(1)}px/${(img.naturalWidth * s).toFixed(1)}px ${(img.naturalHeight * s).toFixed(1)}px"></span>`;
}

// Signs, gravestones and plaques: the lines usecode gives ShowSign_i for the item's shape and quality, drawn in the font
// of the sign's style (main/signgump.c: 40 characters a line, each centred; the font draws byte c as its frame c). In
// the Britannian runic fonts lower case is the runes, ( + ) * , the TH EA EE NG ST runes and | a word break (usecode
// writes "at|(e" for AT THE), upper case Latin capitals. Serpent Isle's translation (signgump.c, once the Avatar can
// read the script) spells the runes out in capitals; the serpent script's text is in capitals already.
const DIGRAPH = {'(': 'TH', '+': 'EA', ')': 'EE', '*': 'NG', ',': 'ST'};
const signText = (d, s, q) => { const t = d.signs.texts[s], l = t && t.lines[q]; return l ? {kind: t.kind, font: t.font, lines: l} : null; };
const plainLine = l => l.replace(/[(+)*,]/g, c => DIGRAPH[c]).replace(/\|/g, ' ').replace(/@/g, '"').replace(/~/g, '').toUpperCase().trim();
function signHTML(sg, font) {
  const said = sg.lines.map(plainLine).join(' / ');
  if (!font) return `<p class="sign">${sg.lines.map(l => esc(plainLine(l))).join('<br>')}</p>`;
  const html = sg.lines.map(l => [...l].map(ch => { const c = ch.charCodeAt(0); return c < font.widths.length ? glyph(font, c) : ''; }).join('')).join('<br>');
  return runicBlock(html, said, [font], 'u7');
}
let signList = null;
const signFeatures = d => signList ||= Array.from(d.obj.sf, (sf, i) => {
  const sg = signText(d, sf & 0x3FF, d.obj.q[i]);
  return sg && {name: sg.lines.map(plainLine).join(' ').replace(/\s+/g, ' ').slice(0, 60), x: d.obj.x[i], y: d.obj.y[i], detail: sg.kind};
}).filter(Boolean);

return {
  id: cfg.id, title: cfg.title, version: 'PC/GOG version. The map, objects and people as they are at the start of a new game.',
  params: [{key: 'cut', label: 'Height cutoff', def: 5, min: 1, max: 16, help: 'Hides objects at this height or above. 5 takes the roofs off most buildings; 16 shows everything.'},
    {key: 'hour', slider: true, label: 'Hour of the day', def: 12, min: 0, max: 23, help: 'People follow schedules in 3-hour blocks. 0 is midnight.'}, RUNES_PARAM],
  transient: [], defaultMap: 'world',
  maps() { return [{id: 'world', name: cfg.world}]; },
  async render(mapId, params) {
    const d = await load();
    const cut = Math.max(1, Math.min(16, params.cut ?? 5));
    const shown = i => d.obj.z[i] < cut && !(d.obj.fl[i] & 2);
    const hour = Math.max(0, Math.min(23, params.hour ?? 12));
    // the fonts of the signs, in runes
    const fonts = {};
    if (params.runes === 1) for (const [n, f] of Object.entries(d.signs.fonts)) fonts[n] = await loadFont(new URL(`font-${n}.png`, DATA), {...f, scale: 1, hint: `run tools/extract-u7-signs.mjs ${cfg.id}`});
    // the game leaves alone an NPC whose own work is waiting (15), and the dead, the party and the paralysed (status
    // 0x8000, 0x800, 0x1000): they stay where it starts them (decomp main/appts.c); the rest go where their schedule says
    const stays = n => n.wt === 15 || (n.st & 0x9800);
    const people = d.npcs.map(n => { const e = n.sched && !stays(n) && slotAt(n.sched, hour); return {...n, px: e ? e[2] : n.x, py: e ? e[3] : n.y, pz: e ? 0 : n.z, act: e ? e[1] : null}; });
    const peopleByChunk = new Map();
    for (const n of people) { const k = (n.py >> 4) * CH + (n.px >> 4); if (!peopleByChunk.has(k)) peopleByChunk.set(k, []); peopleByChunk.get(k).push(n); }

    // the chunk lists for this hour: a chunk with people in it gets its own copy, each person put in by PlaceItem
    const lists = new Map();
    const listOf = ci => {
      let head = lists.get(ci);
      if (head) return head;
      head = chunkList(d, ci);
      const ps = peopleByChunk.get(ci);
      if (ps) {
        const base = head; head = {next: null};
        let tail = head;
        for (let o = base.next; o; o = o.next) tail = tail.next = {...o, next: null};
        for (const n of ps) d.ord.place(head, {x: n.px, y: n.py, z: n.pz, sf: n.sf, t: -2, n, next: null});
      }
      lists.set(ci, head);
      return head;
    };
    // the objects standing on squares xa..xb - 1, ya..yb - 1 that keep() lets through, nearest first (the game's
    // order; painted last to first)
    const order = (xa, ya, xb, yb, keep) => {
      const c0 = Math.max(0, xa >> 4), r0 = Math.max(0, ya >> 4), c1 = Math.min(CH - 1, (xb - 1) >> 4), r1 = Math.min(CH - 1, (yb - 1) >> 4), heads = [];
      for (let r = r0; r <= r1; r++) { const row = []; for (let c = c0; c <= c1; c++) row.push(listOf(r * CH + c).next); heads.push(row); }
      return d.ord.build(heads, o => o.x >= xa && o.x < xb && o.y >= ya && o.y < yb && keep(o));
    };
    const keeper = off => o => o.t >= 0 ? !off.has('objects') && shown(o.t) : o.t === -2 ? !off.has('people') && o.z < cut : true;

    // per tile canvas, what was drawn for it: the flat ground and the ordered pictures, kept so an animation tick only
    // swaps frames and draws again (no new paint order)
    const drawn = new WeakMap();
    const anim = d.anim || {};
    const swap = (o, t) => {   // the picture of an animated object at tick t, its hot spot unchanged
      const a = anim[o.sf & 0x3FF]; if (!a || !t) return o.f && o;
      const f0 = (o.sf >> 10) & 31, fr = animFrame(a[0], a[1], f0 % a[1], t, o.t >= 0 ? o.t : o.y * N + o.x + 1e7, hour);
      if (fr === f0) return o;
      const f = FR(d, (o.sf & 0x83FF) | fr << 10); if (!f) return o;
      const hx = o.left + o.f.xl, hy = o.top + o.f.ya;
      return {f, left: hx - f.xl, top: hy - f.ya};
    };
    function draw(cv, x0, y0, span, off, tick = 0) {
      const ctx = cv.getContext('2d'), sc = 256 / span;   // canvas pixels a tile
      const xa = Math.max(0, Math.floor(x0)), ya = Math.max(0, Math.floor(y0)), xb = Math.min(N, Math.ceil(x0 + span)), yb = Math.min(N, Math.ceil(y0 + span));
      if (xa >= xb || ya >= yb) return;
      const objsOn = !off.has('objects');
      if (sc < 2) {   // far out: each tile its frame's average colour
        const img = ctx.createImageData(256, 256), px = img.data, step = 1 / sc;
        for (let py = 0; py < 256; py++) {
          const y = Math.floor(y0 + py * step); if (y < 0 || y >= N) continue;
          for (let qx = 0; qx < 256; qx++) {
            const x = Math.floor(x0 + qx * step); if (x < 0 || x >= N) continue;
            const f = FR(d, groundAt(d, x, y)); if (!f) continue;
            const c = avg(f), o = (py * 256 + qx) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
          }
        }
        if (objsOn) for (let cy = ya >> 4; cy <= (yb - 1) >> 4; cy++) for (let cx = xa >> 4; cx <= (xb - 1) >> 4; cx++) for (const i of d.byChunk[cy * CH + cx]) {
          if (!shown(i)) continue;
          const f = FR(d, d.obj.sf[i]); if (!f || f.c2 % 16 < 6) continue;
          const qx = Math.floor((d.obj.x[i] - x0) * sc), py = Math.floor((d.obj.y[i] - y0) * sc);
          if (qx < 0 || py < 0 || qx > 255 || py > 255) continue;
          const c = avg(f), o = (py * 256 + qx) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
        }
        ctx.putImageData(img, 0, 0);
        return;
      }
      ctx.imageSmoothingEnabled = sc < 8;
      const k = sc / 8;   // canvas pixels a shape pixel
      const key = `${x0},${y0},${span},${[...off].sort()}`, memo = drawn.get(cv);
      if (tick && memo && memo.key === key) {
        if (!memo.animated) return;   // nothing moves on this tile
        ctx.clearRect(0, 0, 256, 256);
        for (const [f, x, y] of memo.flats) { ctx.imageSmoothingEnabled = false; ctx.drawImage(d.atlas[f.page], f.ax, f.ay, f.w, f.h, (x - x0) * sc, (y - y0) * sc, f.w * k, f.h * k); }
        ctx.imageSmoothingEnabled = sc < 8;
        for (const o of memo.list) { const p = swap(o, tick); if (p) ctx.drawImage(d.atlas[p.f.page], p.f.ax, p.f.ay, p.f.w, p.f.h, (p.left / 8 - x0) * sc, (p.top / 8 - y0) * sc, p.f.w * k, p.f.h * k); }
        return;
      }
      const blit = (f, left, top) => ctx.drawImage(d.atlas[f.page], f.ax, f.ay, f.w, f.h, (left / 8 - x0) * sc, (top / 8 - y0) * sc, f.w * k, f.h * k);
      // the ground's flat tiles (the game's paintTerrain), then the objects in the game's order: those standing up to 2
      // chunks below and right of the tile, as a picture reaches at most 63 pixels above its hot spot and 60 more
      // for height
      const flats = [];
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const sf = groundAt(d, x, y);
        if (isFlat(sf)) { const f = FR(d, sf); if (f) { flats.push([f, x, y]); ctx.imageSmoothingEnabled = false; blit(f, x * 8, y * 8); ctx.imageSmoothingEnabled = sc < 8; } }
      }
      const list = [];
      for (const o of order(xa - 2, ya - 2, xb + 32, yb + 32, keeper(off)).reverse()) {
        if (!box(d, o)) continue;
        if (o.left / 8 > x0 + span || o.top / 8 > y0 + span || (o.left + o.f.w) / 8 < x0 || (o.top + o.f.h) / 8 < y0) continue;
        list.push(o);
      }
      drawn.set(cv, {key, flats, list, animated: list.some(o => anim[o.sf & 0x3FF])});
      for (const o of list) { const p = swap(o, tick); blit(p.f, p.left, p.top); }
    }

    // what is drawn at a point (in tiles): every shown object, person and terrain shape whose picture has an opaque
    // pixel there, the one on top first
    const probe = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
    const opaque = (o, px, py) => {
      const dx = Math.floor(px - o.left), dy = Math.floor(py - o.top);
      if (dx < 0 || dy < 0 || dx >= o.f.w || dy >= o.f.h) return false;
      probe.clearRect(0, 0, 1, 1); probe.drawImage(d.atlas[o.f.page], o.f.ax + dx, o.f.ay + dy, 1, 1, 0, 0, 1, 1);
      return probe.getImageData(0, 0, 1, 1).data[3] > 0;
    };
    function drawnAt(fx, fy) {
      const px = fx * 8, py = fy * 8, tx = Math.floor(fx), ty = Math.floor(fy);
      // a picture lies up and left of its object's square: the objects from here to 2 chunks down and right
      return order(tx - 2, ty - 2, tx + 32, ty + 32, keeper(new Set())).filter(o => box(d, o) && opaque(o, px, py));
    }
    // what a container holds, nested, each line with the item's picture
    const count = (s, q) => (d.tfa[s * 3 + 1] & 15) === 3 && (q & 0x7F) > 1 ? q & 0x7F : 0;   // a stack (class 3): quality's low 7 bits are how many (common/item.c)
    const keyNote = q => { const n = d.locks.get(q) || 0; return ` <span class="muted">(opens lock ${q}${n > 1 ? `: ${n} locked chests${n > 20 ? ', a skeleton key' : ''}` : n ? ': 1 locked chest' : ''})</span>`; };
    const holds = (items, depth = 0) => `<ul class="holds">${items.slice(0, 40).map(it => `<li>${icon(d, it[0] | it[1] << 10)} ${esc(name(d, it[0] | it[1] << 10, count(it[0], it[2])))}${it[0] === KEY ? keyNote(it[2]) : ''}${it.length > 3 && depth < 3 ? holds(it.slice(3), depth + 1) : ''}</li>`).join('')}${items.length > 40 ? `<li class="muted">and ${items.length - 40} more</li>` : ''}</ul>`;
    // where the keys numbered q are, as text and links
    const keyPlaces = (q, links) => {
      const ks = d.keys.get(q) || [];
      // lockpicks open only lock 0 (decomp usecode Lockpick.use)
      if (!ks.length) return p(`<span class="muted">No key with this number is in the game at the start: ${q ? 'only magic opens it' : 'a lockpick or magic opens it'}.</span>`);
      const lines = ks.slice(0, 6).map(k => {
        links.push({label: k.who ? `Key: ${pname(k.who)}` : `Key at ${k.x}, ${k.y}`, focus: [k.x, k.y]});
        return k.who ? `${esc(pname(k.who))} carries it.` : k.where === 'in' ? `In a ${esc(name(d, k.box).toLowerCase())} at ${k.x}, ${k.y}.` : `On the ground at ${k.x}, ${k.y}.`;
      });
      return p(`The key${ks.length > 1 ? 's' : ''} for it: ${lines.join(' ')}`);
    };
    const cell = (x, y, at) => {
      const hits = at ? drawnAt(at[0], at[1]) : [], top = hits[0] || null;
      const who = top ? (top.n ? [top.n] : []) : people.filter(n => n.px === x && n.py === y);
      if (who.length) {
        const n = who[0], links = [];
        let body = `<p class="muted">${esc(name(d, n.sf))}${n.act != null ? ` · ${ACT[n.act] || 'busy'}` : ' · at their starting spot'}</p>`;
        if (n.sched) {
          body += `<p class="muted">${[...n.sched].sort((a, b) => a[0] - b[0]).map(e => `${hh(e[0] * 3)}: ${ACT[e[1]] || 'busy'} at ${e[2]}, ${e[3]}`).join('<br>')}</p>`;
          for (const e of n.sched) if (e[2] !== x || e[3] !== y) links.push({label: `At ${hh(e[0] * 3)}`, params: {hour: e[0] * 3}, focus: [e[2], e[3]]});
        }
        if (n.inv) body += `<p class="muted">Carries:</p>${holds(n.inv)}`;
        return {title: pname(n), body, links};
      }
      // the objects drawn under the pointer (top first), then the rest standing on the square: hidden, above the cutoff
      const sf = groundAt(d, x, y), here = hits.filter(o => o.t >= 0).map(o => o.t);
      for (let cy = y >> 4; cy <= Math.min(CH - 1, (y >> 4) + 1); cy++) for (let cx = x >> 4; cx <= Math.min(CH - 1, (x >> 4) + 1); cx++) for (const i of d.byChunk[cy * CH + cx]) {
        const [w, h] = size(d, d.obj.sf[i]), ox = d.obj.x[i], oy = d.obj.y[i];
        if (x <= ox && x > ox - w && y <= oy && y > oy - h && !here.includes(i)) here.push(i);
      }
      if (!at) here.sort((a, b) => d.obj.z[b] - d.obj.z[a]);
      const links = [];
      const line = i => {
        const s = d.obj.sf[i] & 0x3FF, q = d.obj.q[i], c = d.contents[i];
        let t = `${icon(d, d.obj.sf[i])} ${esc(name(d, d.obj.sf[i], count(s, q)))} <span class="muted">· height ${d.obj.z[i]}${d.obj.z[i] >= cut ? ' · above the cutoff (hidden)' : ''}${d.obj.fl[i] & 2 ? ' · invisible in the game (a trigger)' : ''}${d.obj.fl[i] & 1 ? '' : ', movable'}</span>`;
        if (s === KEY) t += keyNote(q);
        if (LOCKED.has(s)) t += `<br><b>Locked</b> <span class="muted">(lock ${q})</span>.${keyPlaces(q, links)}`;
        if (s === SEALED && cfg.id === 'u7bg') t += `<br><span class="muted">Sealed: it opens when used, no key needed.</span>`;
        // a door's state is its frame mod 4 (2 locked, 3 magically locked)
        const ds = (d.obj.sf[i] >> 10) & 3;
        if (DOORS.has(s) && ds === 2) t += `<br><b>Locked</b> <span class="muted">(lock ${q})</span>.${keyPlaces(q, links)}`;
        if (DOORS.has(s) && ds === 3) t += `<br><b>Magically locked</b> <span class="muted">: no key opens it, only a spell.</span>`;
        const sg = signText(d, s, q);
        if (sg) t += signHTML(sg, fonts[sg.font]);
        if (c) t += holds(c);
        return t;
      };
      const terrain = top && top.t === -1, ground = terrain ? top.sf : sf;
      const body = (here.length ? `<ul class="objs">${here.map(i => `<li>${line(i)}</li>`).join('')}</ul>` : '') + (d.names[ground & 0x3FF] ? p(`<span class="muted">${terrain ? '' : 'Ground: '}${esc(name(d, ground))}</span>`) : '');   // unnamed ground: say nothing
      const title = terrain ? name(d, ground) : here.length ? name(d, d.obj.sf[at ? here[0] : here.find(i => d.obj.z[i] < cut) ?? here[0]]) : d.names[ground & 0x3FF] ? name(d, ground) : 'Ground';
      return {title, body, links};
    };

    return {
      title: cfg.world, subtitle: `${cfg.subtitle} · height cutoff ${cut} · ${hh(hour)}`, width: N, height: N, native: 8, draw, cell, coords: cfg.coords, animate: {ms: 100},
      features: [...people.map(n => ({name: pname(n), x: n.px, y: n.py, detail: n.act != null ? ACT[n.act] : ''})), ...signFeatures(d)],
      svg: svgDoc(N, N, g('grid', `<path d="${Array.from({length: CH - 1}, (_, i) => `M${(i + 1) * 16} 0V${N}M0 ${(i + 1) * 16}H${N}`).join('')}" stroke="#fff" stroke-width=".5" opacity=".25" fill="none"/>`) + (cfg.overlay ? cfg.overlay.svg() : '')),
      info: `<h3>${cfg.world}</h3><p>3072 × 3072 squares, drawn as you pan, with the game’s ${d.obj.x.length.toLocaleString()} objects as they are at the start of a new game.</p>
        <p>Height cutoff ${cut}: objects at height ${cut} or above are hidden${cut <= 5 ? ', so most roofs are off' : ''}. Click a square to list everything on it and how high it sits.</p>
        <p class="muted">Objects are drawn in the game’s own order, worked out as the original program does it: nearest and highest on top. A click picks what is drawn under the pointer.</p>`,
      layers: [{id: 'objects', name: 'Objects'}, {id: 'people', name: 'People'}, ...(cfg.overlay ? cfg.overlay.layers : []), {id: 'grid', name: 'Grid', swatch: gridSwatch, on: false}],
    };
  },
};
}
