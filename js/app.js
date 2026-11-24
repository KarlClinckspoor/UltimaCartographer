// The shared viewer. It knows nothing about any one game: each game module (js/games/*) says
// what maps it has and renders one on request.
//
// A game module:
//   id, title, version             shown in the game list
//   params: [{key, label, type: 'int', def, min, max, help, random?,
//             file?: {label, accept, read(ArrayBuffer) -> value (throws an Error with a message)}}]
//   transient: ['key']             params dropped when changing map unless a link sets them
//   defaultMap
//   maps(params, mapId) -> [{id, name, group?, title?}]   groups show as collapsible lists
//   render(mapId, params) -> view, or a Promise of one:
//   view = {
//     title, subtitle, width, height,   size in game squares; square (x, y) spans x..x+1, y..y+1
//     images: [{src, layer?, at?}],     pixel images (URL, data URL or canvas) stretched over the map,
//                                       or over at = [x, y, width, height] in squares; drawn first, in
//                                       order; with a layer id they can be switched off
//     native,                           image pixels per square (else worked out from the first image)
//     svg,                              markup with viewBox 0 0 width height, drawn over the images;
//                                       toggleable parts in elements with data-layer="<layer id>"
//     layers: [{id, name, swatch, on?}],
//     features: [{name, x, y, detail?}], what search finds
//     cell(x, y) -> {title, body, links: [{label, map?, params?, focus?: [x, y]}]} | null
//     info,                             html for the side panel
//     draw(canvas, x0, y0, span, off),  for maps too big for images: draws squares x0..x0+span,
//                                       y0..y0+span into a 256-pixel canvas (may return a Promise);
//                                       off = Set of layer ids switched off; called again when it changes
//     wrap,                             true when walking off an edge comes back at the opposite one:
//                                       arrows outside the map say so
//   }
//
// URL: #<game>/<map>?<params>&view=<x>,<y>,<zoom>
import {GAMES} from './games/index.js';

const L = window.L;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

const state = {game: null, mapId: null, params: {}};
const hidden = {};            // game id -> Set of layer ids switched off
const seenLayers = {};        // game id -> Set of layer ids already given their default
let view = null;              // what render() returned for the current map
let overlay = null;
let wrapOverlay = null;
let drawLayer = null, drawnOff = '';
let images = [];              // [{overlay, layer}]
let showing = 0;
let fileNote = null;
let nativeZoom = null;        // the zoom at which the pixel images show one image pixel per screen pixel          // what the last save file read gave, shown under its input              // the latest show() call; an older one that finishes late is dropped

const map = L.map('map', {
  crs: L.CRS.Simple, minZoom: 1, maxZoom: 8, zoomSnap: 0.25, zoomDelta: 0.5,
  wheelPxPerZoomLevel: 90, attributionControl: false, keyboard: true,
});
// Wrapping maps: an arrow beside every row and column pointing off the edge, and a note on each side
// saying where you come back. The arrows sit in a margin of WRAP squares around the map.
// Size of the margin, in squares: 1.5 for a small dungeon, more on big maps so the notes stay readable.
const wrapUnit = v => Math.max(1, Math.min(v.width, v.height) / 24);
const wrapBounds = v => { const m = 1.5 * wrapUnit(v); return L.latLngBounds(toLatLng(-m, v.height + m), toLatLng(v.width + m, -m)); };
function wrapSvg(w, h) {
  const u = wrapUnit({width: w, height: h}), m = 1.5 * u, c = '#e0b354', fs = .3 * u;
  const arrow = (x, y, rot) => `<path d="M-.16 -.2L.14 0L-.16 .2" transform="translate(${x} ${y}) rotate(${rot}) scale(${u})" fill="none" stroke="${c}" stroke-width=".07" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`;
  const text = (x, y, rot, t) => `<text transform="translate(${x} ${y}) rotate(${rot})" text-anchor="middle" font-size="${fs}" font-family="system-ui, sans-serif" fill="${c}" opacity=".9">${t}</text>`;
  // an arrow by every row and column on a small map, about 16 a side on a big one
  const stepX = Math.max(1, Math.round(w / 16)), stepY = Math.max(1, Math.round(h / 16));
  let b = '';
  for (let y = stepY / 2; y < h; y += stepY) b += arrow(w + .35 * u, y, 0) + arrow(-.35 * u, y, 180);
  for (let x = stepX / 2; x < w; x += stepX) b += arrow(x, h + .35 * u, 90) + arrow(x, -.35 * u, 270);
  b += text(w + .95 * u, h / 2, 90, 'off this edge: back in at the left') + text(-.85 * u, h / 2, -90, 'off this edge: back in at the right');
  b += text(w / 2, -.75 * u, 0, 'off this edge: back in at the bottom') + text(w / 2, h + 1.0 * u, 0, 'off this edge: back in at the top');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${w + 2 * m} ${h + 2 * m}">${b}</svg>`;
  return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
}

const toLatLng = (x, y) => L.latLng(-y, x);
const cellBounds = (x, y) => L.latLngBounds(toLatLng(x, y + 1), toLatLng(x + 1, y));
const hoverRect = L.rectangle([[0, 0], [0, 0]], {color: '#e4e1d6', weight: 1, opacity: .6, fill: false, interactive: false});
const selRect = L.rectangle([[0, 0], [0, 0]], {color: '#e0b354', weight: 2, fill: false, interactive: false});

const Readout = L.Control.extend({
  onAdd() { this.el = L.DomUtil.create('div', 'coord-readout'); this.el.textContent = '—'; return this.el; },
  set(t) { this.el.textContent = t; },
});
const readout = new Readout({position: 'bottomleft'}).addTo(map);

// ---------- URL ----------

function readHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const [gameId, mapId] = path.split('/');
  const q = Object.fromEntries(new URLSearchParams(query));
  const game = GAMES.find(g => g.id === gameId && g.render) || GAMES.find(g => g.render);
  let v = null;
  if (q.view) { const [x, y, z] = q.view.split(',').map(Number); if ([x, y, z].every(Number.isFinite)) v = {x, y, z}; }
  delete q.view;
  return {game, mapId: mapId || game.defaultMap, params: normalize(game, q), view: v};
}

function normalize(game, q) {
  const p = {...q};
  for (const d of game.params || []) {
    let v = parseInt(p[d.key], 10);
    if (!Number.isFinite(v)) v = d.def;
    p[d.key] = Math.min(d.max, Math.max(d.min, v));
  }
  return p;
}

function hashFor(game, mapId, params, v) {
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) if (val !== null && val !== undefined && val !== '') q.set(k, val);
  if (v) q.set('view', `${+v.x.toFixed(2)},${+v.y.toFixed(2)},${v.z}`);
  return `#${game.id}/${mapId}?${q}`;
}

function currentView() {
  const c = map.getCenter();
  return {x: c.lng, y: -c.lat, z: map.getZoom()};
}

function writeHash(push) {
  const h = hashFor(state.game, state.mapId, state.params, currentView());
  if (push) history.pushState(null, '', h); else history.replaceState(null, '', h);
}

// ---------- navigation ----------

// Change game, map or params; focus is a square to centre on and open.
function go({game = state.game, mapId, params, focus, push = true} = {}) {
  const gameChanged = game !== state.game;
  mapId = mapId || (gameChanged ? game.defaultMap : state.mapId);
  let p = gameChanged ? {} : {...state.params};
  if (!gameChanged && mapId !== state.mapId) for (const k of game.transient || []) delete p[k];
  if (params) for (const [k, v] of Object.entries(params)) if (v === null) delete p[k]; else p[k] = v;
  state.game = game; state.mapId = mapId; state.params = normalize(game, p);
  if (push) history.pushState(null, '', hashFor(game, mapId, state.params, null));
  show({focus, keepView: !gameChanged && !focus && mapId === view?.mapId});
}

async function show({focus, initialView, keepView} = {}) {
  const {game, mapId, params} = state;
  const ticket = ++showing;
  const before = keepView ? currentView() : null;
  let v;
  try {
    v = await game.render(mapId, params);
  } catch (e) {
    console.error(e);
    $('#map-title').innerHTML = `Could not draw this map<small>${esc(e.message)}</small>`;
    return;
  }
  if (ticket !== showing) return;
  map.closePopup();
  view = v;
  view.mapId = mapId;

  if (overlay) overlay.remove();
  if (wrapOverlay) { wrapOverlay.remove(); wrapOverlay = null; }
  if (drawLayer) { drawLayer.remove(); drawLayer = null; }
  for (const i of images) i.overlay.remove();
  const bounds = L.latLngBounds(toLatLng(0, view.height), toLatLng(view.width, 0));
  images = (view.images || []).map(i => ({
    layer: i.layer,
    overlay: L.imageOverlay(i.src instanceof HTMLCanvasElement ? i.src.toDataURL() : i.src,
      i.at ? L.latLngBounds(toLatLng(i.at[0], i.at[1] + i.at[3]), toLatLng(i.at[0] + i.at[2], i.at[1])) : bounds,
      {interactive: false, className: 'pixel-image'}).addTo(map),
  }));
  if (view.draw) {
    const v = view;
    drawnOff = [...(hidden[game.id] || [])].sort().join();
    const Layer = L.GridLayer.extend({
      createTile(c, done) {
        const cv = document.createElement('canvas'), span = 256 / 2 ** c.z;
        cv.width = cv.height = 256;
        Promise.resolve().then(() => v.draw(cv, c.x * span, c.y * span, span, hidden[game.id] || new Set())).then(() => done(null, cv), e => { console.error(e); done(e, cv); });
        return cv;
      },
    });
    drawLayer = new Layer({tileSize: 256, bounds, noWrap: true, maxNativeZoom: Math.log2(view.native || 16), className: 'pixel-tile', keepBuffer: 1}).addTo(map);
  }
  // Pixel art: crisp when drawn at its own size or bigger, smoothed when shrunk.
  const first = view.images?.[0]?.src;
  nativeZoom = view.native ? Math.log2(view.native) : first instanceof HTMLCanvasElement ? Math.log2(first.width / view.width) : null;
  pixelMode();
  const svg = new DOMParser().parseFromString(view.svg || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.width} ${view.height}"/>`, 'image/svg+xml').documentElement;
  overlay = L.svgOverlay(svg, bounds, {interactive: false}).addTo(map);
  const shown = view.wrap ? wrapBounds(view) : bounds;
  if (view.wrap) wrapOverlay = L.svgOverlay(wrapSvg(view.width, view.height), shown, {interactive: false, className: 'wrap-arrows'}).addTo(map);
  map.setMaxBounds(shown.pad(0.5));
  hoverRect.remove(); selRect.remove();

  const fitZoom = map.getBoundsZoom(shown, false, L.point(40, 40));
  map.setMinZoom(Math.min(fitZoom - 1, 3));
  if (initialView) map.setView(toLatLng(initialView.x, initialView.y), initialView.z, {animate: false});
  else if (before) map.setView(toLatLng(before.x, before.y), before.z, {animate: false});
  else map.fitBounds(shown, {padding: [40, 40], animate: false});

  $('#map-title').innerHTML = `${esc(view.title)}${view.subtitle ? `<small>${esc(view.subtitle)}</small>` : ''}`;
  document.title = `${view.title} · ${game.title} · Ultima Cartographer`;
  drawPanel();
  applyLayers();
  if (focus) openCell(focus[0], focus[1], true);
  writeHash(false);
}

// ---------- side panel ----------

function drawGames() {
  const sel = $('#game');
  sel.innerHTML = GAMES.map(g => `<option value="${g.id}" ${g.render ? '' : 'disabled'}>${esc(g.title)}${g.render ? '' : ' (coming)'}</option>`).join('');
  sel.onchange = () => go({game: GAMES.find(g => g.id === sel.value)});
}

function drawPanel() {
  const {game, mapId, params} = state;
  $('#game').value = game.id;
  $('#game-version').textContent = game.version || '';

  $('#params').innerHTML = (game.params || []).map(d => `
    <div class="param">
      <label for="p-${d.key}">${esc(d.label)}</label>
      <div class="row">
        <input id="p-${d.key}" type="number" inputmode="numeric" min="${d.min}" max="${d.max}" step="1" value="${params[d.key]}">
        ${d.random ? `<button class="btn" data-random="${d.key}" title="Pick a random one">Random</button>` : ''}
      </div>
      ${d.file ? `<div class="row file-row"><label class="btn file-btn">${esc(d.file.label)}<input type="file" data-file="${d.key}" accept="${esc(d.file.accept || '')}" hidden></label><span class="muted" id="f-${d.key}"></span></div>` : ''}
      ${d.help ? `<p class="muted">${esc(d.help)}</p>` : ''}
    </div>`).join('');
  for (const inp of document.querySelectorAll('[data-file]')) inp.onchange = async () => {
    const d = game.params.find(x => x.key === inp.dataset.file), f = inp.files[0];
    if (!f) return;
    try {
      const v = d.file.read(await f.arrayBuffer());
      fileNote = {key: d.key, text: `Read ${v} from ${f.name}`};
      go({params: {[d.key]: v}});
    } catch (e) {
      $(`#f-${d.key}`).textContent = e.message;
    }
  };
  if (fileNote && $(`#f-${fileNote.key}`)) $(`#f-${fileNote.key}`).textContent = fileNote.text;
  for (const d of game.params || []) {
    const el = $(`#p-${d.key}`);
    el.onchange = () => go({params: {[d.key]: el.value}});
  }
  for (const b of document.querySelectorAll('[data-random]'))
    b.onclick = () => go({params: {[b.dataset.random]: Math.floor(Math.random() * 100000)}});

  const groups = [];
  for (const m of game.maps(params, mapId)) {
    if (!groups.length || groups.at(-1).name !== (m.group || '')) groups.push({name: m.group || '', maps: []});
    groups.at(-1).maps.push(m);
  }
  const btn = m => `<button data-map="${esc(m.id)}" class="${m.id === mapId ? 'current' : ''}" title="${esc(m.title || m.name)}">${esc(m.name)}</button>`;
  $('#maps').innerHTML = groups.map(g => g.name
    ? `<details ${g.maps.some(m => m.id === mapId) || groups.length <= 3 ? 'open' : ''}><summary>${esc(g.name)}</summary><div class="btns">${g.maps.map(btn).join('')}</div></details>`
    : `<div class="btns">${g.maps.map(btn).join('')}</div>`).join('');
  for (const b of document.querySelectorAll('#maps button')) b.onclick = () => go({mapId: b.dataset.map});

  const off = hidden[game.id] ||= new Set();
  const seen = seenLayers[game.id] ||= new Set();
  for (const l of view.layers) if (!seen.has(l.id)) { seen.add(l.id); if (l.on === false) off.add(l.id); }
  $('#layers').innerHTML = view.layers.map(l => `
    <li><label><input type="checkbox" data-layer="${l.id}" ${off.has(l.id) ? '' : 'checked'}>
      ${l.swatch || ''}<span>${esc(l.name)}</span></label></li>`).join('');
  for (const c of document.querySelectorAll('#layers input')) c.onchange = () => {
    if (c.checked) off.delete(c.dataset.layer); else off.add(c.dataset.layer);
    applyLayers();
  };

  $('#info').innerHTML = view.info || '';
  $('#info').hidden = !view.info;
  // Links in the panel: data-go='{"map": ..., "params": {...}, "focus": [x, y]}'
  for (const a of document.querySelectorAll('#info [data-go]')) a.onclick = e => {
    e.preventDefault();
    const l = JSON.parse(a.dataset.go);
    go({mapId: l.map, params: l.params, focus: l.focus});
  };
  search();
}

function applyLayers() {
  const off = hidden[state.game.id] || new Set();
  for (const el of overlay.getElement().querySelectorAll('[data-layer]'))
    el.style.display = off.has(el.dataset.layer) ? 'none' : '';
  for (const i of images) if (i.layer) i.overlay.getElement().style.display = off.has(i.layer) ? 'none' : '';
  const key = [...off].sort().join();
  if (drawLayer && key !== drawnOff) { drawnOff = key; drawLayer.redraw(); }
}

function search() {
  const q = $('#search').value.trim().toLowerCase();
  const hits = view.features.filter(f => !q || f.name.toLowerCase().includes(q) || (f.detail || '').toLowerCase().includes(q));
  $('#results').innerHTML = hits.slice(0, 200).map((f, i) =>
    `<li tabindex="0" data-i="${i}"><span>${esc(f.name)}</span><span class="where">${f.x}, ${f.y}</span></li>`).join('');
  for (const li of document.querySelectorAll('#results li')) {
    const f = hits[li.dataset.i];
    li.onclick = () => openCell(f.x, f.y, true);
    li.onkeydown = e => { if (e.key === 'Enter') openCell(f.x, f.y, true); };
  }
}
$('#search').oninput = search;

// ---------- the map ----------

function cellAt(latlng) {
  const x = Math.floor(latlng.lng), y = Math.floor(-latlng.lat);
  return view && x >= 0 && y >= 0 && x < view.width && y < view.height ? [x, y] : null;
}

function openCell(x, y, pan) {
  const c = view.cell(x, y);
  selRect.setBounds(cellBounds(x, y)).addTo(map);
  if (pan && !map.getBounds().contains(cellBounds(x, y))) map.panTo(toLatLng(x + .5, y + .5));
  if (!c) return;
  const links = c.links || [];
  const html = `<h4>${esc(c.title)}</h4>${c.body || ''}<p class="xy">x ${x}, y ${y}</p>` +
    (links.length ? `<div class="links">${links.map((l, i) => `<button class="btn" data-link="${i}">${esc(l.label)}</button>`).join('')}</div>` : '');
  const popup = L.popup({maxWidth: 340, maxHeight: 440, autoPanPadding: [30, 30]}).setLatLng(toLatLng(x + .5, y + .1)).setContent(html).openOn(map);
  for (const b of popup.getElement().querySelectorAll('[data-link]')) b.onclick = () => {
    const l = links[b.dataset.link];
    go({mapId: l.map || state.mapId, params: l.params, focus: l.focus});
  };
}

map.on('mousemove', e => {
  const c = cellAt(e.latlng);
  if (c) { hoverRect.setBounds(cellBounds(c[0], c[1])).addTo(map); readout.set(`x ${c[0]}, y ${c[1]}`); }
  else { hoverRect.remove(); readout.set('—'); }
});
map.on('click', e => { const c = cellAt(e.latlng); if (c) openCell(c[0], c[1], false); });
map.on('moveend', () => { if (state.game) writeHash(false); });
function pixelMode() {
  map.getContainer().classList.toggle('pixels-crisp', nativeZoom === null || map.getZoom() >= nativeZoom - 0.01);
}
map.on('zoomend', pixelMode);

$('#side-toggle').onclick = () => {
  $('#side').classList.toggle('collapsed');
  requestAnimationFrame(() => { map.invalidateSize(); if (overlay) map.fitBounds((wrapOverlay || overlay).getBounds(), {padding: [40, 40]}); });
};

window.addEventListener('popstate', () => {
  const h = readHash();
  state.game = h.game; state.mapId = h.mapId; state.params = h.params;
  show({initialView: h.view});
});

drawGames();
{
  const h = readHash();
  state.game = h.game; state.mapId = h.mapId; state.params = h.params;
  show({initialView: h.view});
}
