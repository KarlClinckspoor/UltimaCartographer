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
