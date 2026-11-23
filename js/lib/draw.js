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
export async function image(url) { const i = new Image(); i.src = url; await i.decode(); return i; }
export async function json(url, hint) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.pathname?.split('/').slice(-2).join('/') || url} is missing${hint ? `: ${hint}` : ''}`);
  return r.json();
}
