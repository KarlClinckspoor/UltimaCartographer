// Runic text drawn in a game's own font. Each game gives its font sheet (a PNG of glyphs in a grid, white on transparent,
// written by its extractor) and how to read it; the glyphs are tinted and shown as CSS sprites. Used by Ultima V, VI and
// VII (The Black Gate and Serpent Isle), each with its own font. Ultima IV prints no text in runes.
import {image, esc} from './draw.js';

// The same choice in every game that has runic text, so a link keeps it from one game to the next.
export const RUNES_PARAM = {key: 'runes', label: 'Runic text', options: [[0, 'Translated'], [1, 'In runes']], def: 0, min: 0, max: 1,
  help: 'Signs, plaques, gravestones and books written in runes: drawn as the game draws them, in its own font (hover for the translation), or in letters.'};

let fonts = 0;
const loaded = new Map();
// url: the sheet; w, h: a glyph cell; perRow: cells a row; widths: each glyph's width when the font is proportional;
// gap: pixels added after each glyph (a font's letter spacing, may be negative); scale: screen pixels a font pixel; hint: what to run when the sheet is missing (then this resolves to null and the
// page shows the translation).
export function loadFont(url, {w = 8, h = 8, perRow = 16, widths = null, gap = 0, scale = 2, color = '#f1e6c8', hint = ''} = {}) {
  const key = String(url);
  if (!loaded.has(key)) loaded.set(key, (async () => {
    let img;
    try { img = await image(url); }
    catch { console.warn(`${key} is missing${hint ? `: ${hint}` : ''}. Runic text is shown translated until then.`); return null; }
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const a = ctx.getImageData(0, 0, c.width, c.height).data, n = perRow * Math.floor(c.height / h), blank = new Uint8Array(n);
    for (let ch = 0; ch < n; ch++) {
      const gx = (ch % perRow) * w, gy = Math.floor(ch / perRow) * h, gw = widths ? widths[ch] || 0 : w;
      let any = false;
      for (let y = 0; y < h && !any; y++) for (let x = 0; x < gw; x++) if (a[((gy + y) * c.width + gx + x) * 4 + 3]) { any = true; break; }
      blank[ch] = !any;
    }
    ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
    return {url: c.toDataURL(), v: `--rf${fonts++}`, w, h, perRow, widths, gap, scale, blank, sheetW: c.width, sheetH: c.height};
  })());
  return loaded.get(key);
}

// One glyph as a sprite (its sheet is the CSS variable font.v, which runicBlock sets on the paragraph).
export function glyph(f, code) {
  const s = f.scale, w = (f.widths ? f.widths[code] || 0 : f.w) * s;
  return `<span class="rune-glyph" style="width:${w}px;height:${f.h * s}px;${f.gap ? `margin-right:${f.gap * s}px;` : ''}background-image:var(${f.v});background-size:${f.sheetW * s}px ${f.sheetH * s}px;` +
    `background-position:-${(code % f.perRow) * f.w * s}px -${Math.floor(code / f.perRow) * f.h * s}px"></span>`;
}

// A run of text in a font, word by word so that lines break only between words. code(ch) gives the glyph for a character,
// or null to write the character as it is (a character the font leaves blank is written as itself too, except a space).
export function words(f, text, code = ch => ch.charCodeAt(0)) {
  return text.split(/( +)/).map(wd => {
    if (/^ *$/.test(wd)) return wd ? ' ' : '';
    let s = '';
    for (const ch of wd) { const c = code(ch); s += c != null && c < f.blank.length && !f.blank[c] ? glyph(f, c) : esc(ch); }
    return `<span class="rune-word">${s}</span>`;
  }).join('');
}

// The paragraph around runic HTML: the fonts it uses, and the translation as its tooltip and accessible name.
export function runicBlock(html, said, fontsUsed, cls = '') {
  const vars = fontsUsed.map(f => `${f.v}:url('${f.url}')`).join(';');
  return `<p class="sign runic${cls ? ` ${cls}` : ''}" role="img" aria-label="${esc(said)}" title="${esc(said)}" style="${vars}">${html}</p>`;
}
