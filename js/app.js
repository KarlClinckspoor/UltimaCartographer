// The shared viewer. It knows nothing about any one game: each game module (js/games/*) says
// what maps it has and renders one on request.
//
// A game module:
//   id, title, version             shown in the game list
//   params: [{key, label, type: 'int', def, min, max, help, random?}]   inputs in the side panel
//   transient: ['key']             params dropped when changing map unless a link sets them
//   defaultMap
//   maps(params, mapId) -> [{id, name, group?, title?}]
//   render(mapId, params) -> {
//     title, subtitle, width, height,   size in game squares; square (x, y) spans x..x+1, y..y+1
//     svg,                              markup with viewBox 0 0 width height; toggleable parts in
//                                       elements with data-layer="<layer id>"
//     layers: [{id, name, swatch, on?}],
//     features: [{name, x, y, detail?}], what search finds
//     cell(x, y) -> {title, body, links: [{label, map?, params?, focus?: [x, y]}]} | null
//     info,                             html for the side panel
//   }
//
// URL: #<game>/<map>?<params>&view=<x>,<y>,<zoom>
import {GAMES} from './games/index.js';

const L = window.L;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

const state = {game: null, mapId: null, params: {}};
const hidden = {};            // game id -> Set of layer ids switched off
let view = null;              // what render() returned for the current map
let overlay = null;

const map = L.map('map', {
  crs: L.CRS.Simple, minZoom: 1, maxZoom: 8, zoomSnap: 0.25, zoomDelta: 0.5,
  wheelPxPerZoomLevel: 90, attributionControl: false, keyboard: true,
});
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
  show({focus, keepView: !gameChanged && !focus && mapId === view?.mapId});
  writeHash(push);
}

function show({focus, initialView, keepView} = {}) {
  const {game, mapId, params} = state;
  const before = keepView ? currentView() : null;
  map.closePopup();
  view = game.render(mapId, params);
  view.mapId = mapId;

  if (overlay) overlay.remove();
  const svg = new DOMParser().parseFromString(view.svg, 'image/svg+xml').documentElement;
  const bounds = L.latLngBounds(toLatLng(0, view.height), toLatLng(view.width, 0));
  overlay = L.svgOverlay(svg, bounds, {interactive: false}).addTo(map);
  map.setMaxBounds(bounds.pad(0.5));
  hoverRect.remove(); selRect.remove();

  const fitZoom = map.getBoundsZoom(bounds, false, L.point(40, 40));
  map.setMinZoom(Math.min(fitZoom - 1, 3));
  if (initialView) map.setView(toLatLng(initialView.x, initialView.y), initialView.z, {animate: false});
  else if (before) map.setView(toLatLng(before.x, before.y), before.z, {animate: false});
  else map.fitBounds(bounds, {padding: [40, 40], animate: false});

  $('#map-title').innerHTML = `${esc(view.title)}${view.subtitle ? `<small>${esc(view.subtitle)}</small>` : ''}`;
  document.title = `${view.title} · ${game.title} · Ultima Cartographer`;
  drawPanel();
  applyLayers();
  if (focus) openCell(focus[0], focus[1], true);
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
      ${d.help ? `<p class="muted">${esc(d.help)}</p>` : ''}
    </div>`).join('');
  for (const d of game.params || []) {
    const el = $(`#p-${d.key}`);
    el.onchange = () => go({params: {[d.key]: el.value}});
  }
  for (const b of document.querySelectorAll('[data-random]'))
    b.onclick = () => go({params: {[b.dataset.random]: Math.floor(Math.random() * 100000)}});

  let group = null;
  $('#maps').innerHTML = game.maps(params, mapId).map(m => {
    const head = m.group !== group ? `<div class="group">${esc((group = m.group) || '')}</div>` : '';
    return `${head}<button data-map="${esc(m.id)}" class="${m.id === mapId ? 'current' : ''}" title="${esc(m.title || m.name)}">${esc(m.name)}</button>`;
  }).join('');
  for (const b of document.querySelectorAll('#maps button')) b.onclick = () => go({mapId: b.dataset.map});

  const off = hidden[game.id] ||= new Set(view.layers.filter(l => l.on === false).map(l => l.id));
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
  const popup = L.popup({maxWidth: 320, autoPanPadding: [30, 30]}).setLatLng(toLatLng(x + .5, y + .1)).setContent(html).openOn(map);
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

$('#side-toggle').onclick = () => {
  $('#side').classList.toggle('collapsed');
  requestAnimationFrame(() => { map.invalidateSize(); if (overlay) map.fitBounds(overlay.getBounds(), {padding: [40, 40]}); });
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
  writeHash(false);
}
