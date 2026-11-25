// Drawing helpers shared by the game modules. SVG coordinates are in map squares.
export const f = n => +n.toFixed(3);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
export const g = (layer, body) => `<g data-layer="${layer}">${body}</g>`;
export const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" ${extra}/>`;
export const path = (d, stroke, w, extra = '') =>
  `<path d="${d}" ${extra.includes('fill=') ? '' : 'fill="none"'} stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
export const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
export const swatch = body => `<svg viewBox="0 0 1 1">${body}</svg>`;
export const ring = (x, y, color, dash = '', w = .1) =>
  `<rect x="${x + .06}" y="${y + .06}" width=".88" height=".88" rx=".12" fill="none" stroke="${color}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
export const label = (x, y, text, size, color = '#f4efe0', anchor = 'middle') =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${size}" font-family="Georgia, serif" text-anchor="${anchor}" fill="${color}" stroke="#000" stroke-width="${f(size / 6)}" paint-order="stroke" stroke-linejoin="round">${esc(text)}</text>`;
export function gridLines(w, h) {
  let d = '';
  for (let x = 1; x < w; x++) d += `M${x} 0V${h}`;
  for (let y = 1; y < h; y++) d += `M0 ${y}H${w}`;
  return path(d, '#ffffff', w > 50 ? 0.03 : 0.015, 'opacity=".18"');
}
export const gridSwatch = swatch(path('M.5 0V1M0 .5H1', '#888', .06));
export const p = (...lines) => lines.filter(Boolean).map(l => `<p>${l}</p>`).join('');

export const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// Copy tile number `tile` of a sheet with `perRow` tiles of `size` pixels to square (x, y).
export const blit = (ctx, sheet, size, tile, x, y, perRow = 16) =>
  ctx.drawImage(sheet, (tile % perRow) * size, Math.floor(tile / perRow) * size, size, size, x * size, y * size, size, size);
// Glyphs of an 8 x 8 font drawn centred in their cells: fonts like CHARSET.EGA keep each sign in the top left
// (columns 0-5, rows 0-6), which looks off-centre on a map. Draws at twice the size so a sign can move half a
// font pixel; the target canvas has 2 * size pixels a square. Signs that fill their cell are drawn as they are.
export function centredGlyphs(sheet, size = 8, perRow = 16) {
  const c = canvas(sheet.width, sheet.height), x = c.getContext('2d');
  x.drawImage(sheet, 0, 0);
  const px = x.getImageData(0, 0, sheet.width, sheet.height).data, offsets = new Map();
  const offset = tile => {
    if (offsets.has(tile)) return offsets.get(tile);
    const sx = (tile % perRow) * size, sy = Math.floor(tile / perRow) * size;
    let x0 = size, y0 = size, x1 = -1, y1 = -1;
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
      const o = ((sy + y) * sheet.width + sx + xx) * 4;
      if (px[o + 3] && (px[o] | px[o + 1] | px[o + 2])) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const r = x1 < 0 ? [0, 0] : [size - (x1 - x0 + 1) - 2 * x0, size - (y1 - y0 + 1) - 2 * y0];
    offsets.set(tile, r);
    return r;
  };
  return (ctx, tile, cx, cy) => {
    const [dx, dy] = offset(tile), s2 = size * 2;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(cx * s2, cy * s2, s2, s2);
    ctx.drawImage(sheet, (tile % perRow) * size, Math.floor(tile / perRow) * size, size, size, cx * s2 + dx, cy * s2 + dy, s2, s2);
  };
}
export async function image(url) { const i = new Image(); i.src = url; await i.decode(); return i; }
export async function json(url, hint) {
  const r = await fetch(url);
  if (!r.ok) {
    // The hint (how to rebuild the file) is for developers; visitors get a plain message.
    console.warn(`${url.pathname?.split('/').slice(-2).join('/') || url} is missing${hint ? `: ${hint}` : ''}`);
    throw new Error('Couldn’t load the map data. Try reloading the page.');
  }
  return r.json();
}

// ---------- animated tile maps ----------
// A deterministic random number in [0, 1) from integers: the same square, sprite and tick always draw the same.
export function rnd(...k) {
  let h = 0x9E3779B9;
  for (const v of k) { h = Math.imul(h ^ (v | 0), 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}
// A state that changes once per tick by step(state, tick): chain(init, step)(tick) is the state after `tick` steps.
// Ticks normally come one after another, so the last answer is kept and stepped on from.
export function chain(init, step) {
  let t = 0, s = init;
  return tick => {
    if (tick < t) { t = 0; s = init; }
    while (t < tick) s = step(s, ++t);
    return s;
  };
}

// A tile map drawn into the viewer's canvas tiles (view.draw), for maps whose pictures move. Draws the whole canvas
// once, then on each tick only the squares whose picture changed (one pattern fill per tile).
//   w, h                 the map's size in squares
//   sheet, size, perRow  the tile sheet: tile n at column n % perRow, row n / perRow, size pixels square
//   at(x, y)             the tile number of a square
//   frame(n, tick)       which picture tile n shows at a tick: 0 (the default) is the sheet's own, any other key
//                        is drawn by picture(n, key, ctx) into a size x size canvas holding the sheet's picture
//   sprites              [{x, y, tile}] drawn over the squares (people), switched off with the layer `spriteLayer`;
//                        spriteTile(i, tick) gives sprite i's tile at a tick (else its own)
//   animated             the tile numbers whose frame can change (only their squares are looked at on a tick)
// Tick 0 is the static picture. Squares smaller than `still` screen pixels are not animated (too small to see).
export function tileLayer({w, h, sheet, size = 16, perRow = 16, at, frame = () => 0, picture, sprites = [], spriteLayer, spriteTile, animated = [], still = 8}) {
  const anim = new Set(animated);
  const pics = new Map();
  // tile n's picture `key` at s pixels a square, as a canvas
  const pic = (n, key, s) => {
    const id = `${n}:${key}:${s}`;
    let c = pics.get(id);
    if (c) return c;
    let src = canvas(size, size);
    const x = src.getContext('2d');
    x.drawImage(sheet, (n % perRow) * size, Math.floor(n / perRow) * size, size, size, 0, 0, size, size);
    if (key) picture(n, key, x);
    if (s !== size) {
      c = canvas(s, s);
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(src, 0, 0, s, s);
    } else c = src;
    pics.set(id, c);
    return c;
  };
  const patterns = new WeakMap();
  const pattern = (ctx, c) => { let p = patterns.get(c); if (!p) patterns.set(c, p = ctx.createPattern(c, 'repeat')); return p; };
  const spriteAt = new Map(sprites.map((q, i) => [q.y * w + q.x, i]));
  const tileOfSprite = (i, tick) => tick && spriteTile ? spriteTile(i, tick) : sprites[i].tile;
  // The whole map at 4 pixels a square (each tile's pixels averaged in blocks), for zoomed-out canvases.
  let mip = null;
  const mipMap = () => {
    if (mip) return mip;
    const m = 4, k = size / m, avg = new Map();
    const sc = canvas(sheet.width, sheet.height), sx = sc.getContext('2d');
    sx.drawImage(sheet, 0, 0);
    const px = sx.getImageData(0, 0, sheet.width, sheet.height).data;
    const tileAvg = n => {
      let a = avg.get(n);
      if (a) return a;
      a = new Uint8ClampedArray(m * m * 4);
      const ox = (n % perRow) * size, oy = Math.floor(n / perRow) * size;
      for (let by = 0; by < m; by++) for (let bx = 0; bx < m; bx++) {
        const s = [0, 0, 0, 0];
        for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) {
          const o = ((oy + by * k + y) * sheet.width + ox + bx * k + x) * 4;
          for (let c = 0; c < 4; c++) s[c] += px[o + c];
        }
        for (let c = 0; c < 4; c++) a[(by * m + bx) * 4 + c] = s[c] / (k * k);
      }
      avg.set(n, a);
      return a;
    };
    const img = new ImageData(w * m, h * m), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = tileAvg(at(x, y));
      for (let r = 0; r < m; r++) d.set(a.subarray(r * m * 4, (r + 1) * m * 4), ((y * m + r) * w * m + x * m) * 4);
    }
    mip = canvas(w * m, h * m);
    mip.getContext('2d').putImageData(img, 0, 0);
    return mip;
  };
  const state = new WeakMap();   // canvas -> what it shows

  return (cv, x0, y0, span, off, tick) => {
    const ctx = cv.getContext('2d'), s = 256 / span;
    const x1 = Math.min(w, x0 + span), y1 = Math.min(h, y0 + span);
    const showSprites = sprites.length && !(spriteLayer && off.has(spriteLayer));
    const offKey = [...off].sort().join();
    let st = state.get(cv);
    const moving = s >= still;
    if (st && st.off === offKey && st.x0 === x0 && st.y0 === y0 && st.span === span) {
      if (!moving || st.tick === tick) return;
      // the squares whose picture changed since the last tick drawn
      const touched = new Set();
      for (const [n, cells] of st.cells) {
        const key = frame(n, tick);
        if (key === st.keys.get(n)) continue;
        st.keys.set(n, key);
        // one fill for all the squares of this tile: its picture as a pattern lined up with the squares
        let path = st.paths.get(n);
        if (!path) {
          path = new Path2D();
          for (const c of cells) path.rect((c % w - x0) * s, (Math.floor(c / w) - y0) * s, s, s);
          st.paths.set(n, path);
        }
        ctx.fillStyle = pattern(ctx, pic(n, key, s));
        ctx.fill(path);
        for (const c of cells) touched.add(c);
      }
      if (showSprites) for (const i of st.sprites) {
        const q = sprites[i], c = q.y * w + q.x, t = tileOfSprite(i, tick), key = frame(t, tick), id = `${t}:${key}`;
        if (id === st.spriteTiles.get(i) && !touched.has(c)) continue;
        st.spriteTiles.set(i, id);
        const g = at(q.x, q.y);
        if (!touched.has(c)) ctx.drawImage(pic(g, frame(g, tick), s), (q.x - x0) * s, (q.y - y0) * s);
        ctx.drawImage(pic(t, key, s), (q.x - x0) * s, (q.y - y0) * s);
      }
      st.tick = tick;
      return;
    }
    // the whole canvas
    st = {off: offKey, x0, y0, span, tick, cells: new Map(), paths: new Map(), keys: new Map(), sprites: [], spriteTiles: new Map()};
    state.set(cv, st);
    ctx.clearRect(0, 0, 256, 256);
    if (!moving) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mipMap(), x0 * 4, y0 * 4, (x1 - x0) * 4, (y1 - y0) * 4, 0, 0, (x1 - x0) * s, (y1 - y0) * s);
    } else {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const n = at(x, y);
        let key = 0;
        if (anim.has(n)) {
          key = frame(n, tick);
          const c = y * w + x;
          if (!st.cells.has(n)) { st.cells.set(n, []); st.keys.set(n, key); }
          st.cells.get(n).push(c);
        }
        ctx.drawImage(pic(n, key, s), (x - x0) * s, (y - y0) * s);
      }
    }
    if (showSprites) for (const [c, i] of spriteAt) {
      const q = sprites[i];
      if (q.x < x0 || q.x >= x1 || q.y < y0 || q.y >= y1) continue;
      const t = moving ? tileOfSprite(i, tick) : q.tile, key = moving ? frame(t, tick) : 0;
      st.sprites.push(i); st.spriteTiles.set(i, `${t}:${key}`);
      ctx.drawImage(pic(t, key, s), (q.x - x0) * s, (q.y - y0) * s);
    }
  };
}
// Tile n's rows moved down by `by` pixels, the bottom rows coming back at the top (water and lava flowing).
export function scrollRows(ctx, size, by) {
  const img = ctx.getImageData(0, 0, size, size), out = ctx.createImageData(size, size), row = size * 4;
  for (let y = 0; y < size; y++) out.data.set(img.data.subarray(y * row, (y + 1) * row), ((y + by) % size) * row);
  ctx.putImageData(out, 0, 0);
}
