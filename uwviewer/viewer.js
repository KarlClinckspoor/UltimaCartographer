// Ultima Underworld I and II in 3D: draws what the Underworld editor exports (data/uw1, data/uw2; docs/uw-export.md)
// with WebGL2, as a sibling of u9viewer/ (same camera, controls and texture arrays).
//
// World space is the export's: x east, y up, z north, in tiles. The GPU gets (x, y, -z), so the picture is not
// mirrored; level triangles face the open space and are culled from behind, models are drawn from both sides.

const $ = s => document.querySelector(s);
const canvas = $('#gl'), gl = canvas.getContext('webgl2', {antialias: true});
if (!gl) throw new Error('WebGL2 is needed');
const status = t => { $('#status').textContent = t; };
const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
const cap = s => String(s).replace(/^\w/, c => c.toUpperCase());

// ---------- small math (as u9viewer) ----------
const mat = {
  persp(fovy, aspect, near, far) { const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); },
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  view(p, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = [sy * cp, sp, -cy * cp];
    const r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, p), -dot(u, p), dot(f, p), 1]);
  },
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

// ---------- GL helpers ----------
function program(vs, fs) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp usampler2D;\nprecision highp sampler2DArray;\n' + src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
  return {p, u};
}
let DATA = null;
const url = n => new URL(n, DATA);
const fetchBin = async n => { const r = await fetch(url(n)); if (!r.ok) throw new Error(`${n} is missing: run UwEditor.Cli export-web (docs/uw-export.md)`); return r.arrayBuffer(); };
const fetchJson = async n => { const r = await fetch(url(n)); if (!r.ok) throw new Error(`${n} is missing: run UwEditor.Cli export-web (docs/uw-export.md)`); return r.json(); };
const loadImage = async n => { const r = await fetch(url(n)); return createImageBitmap(await r.blob(), {premultiplyAlpha: 'none', colorSpaceConversion: 'none'}); };
// the texture strips as one TEXTURE_2D_ARRAY: perFile layers of size x size a file, stacked top to bottom
async function textureArray(T) {
  const t = gl.createTexture();
  const bind = () => { gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); };
  bind();
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.log2(T.size) + 1, gl.RGBA8, T.size, T.size, T.count);
  for (let i = 0; i < T.files.length; i++) {
    const img = await loadImage(T.files[i]), n = Math.min(img.height / T.size, T.count - i * T.perFile);
    bind();
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i * T.perFile, T.size, T.size, n, gl.RGBA, gl.UNSIGNED_BYTE, img);
    img.close();
  }
  bind();
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  // Crisp pixels up close (nearest), and far or at a slant the full-size texture for as long as the GPU can:
  // anisotropic filtering keeps floors and long walls from dropping to the small mipmaps.
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return t;
}

// ---------- shaders ----------
// Light as the game does it: each whole square of distance has a light map (light.json shades), each map a
// brightness; between squares the two are blended. Full bright skips it. Night vision is grey.
const COMMON = `
uniform mat4 uViewProj; uniform vec3 uEye; uniform float uFall[10]; uniform int uFull; uniform int uMono;
uniform usampler2D uRemap;
vec4 gpu(vec3 w) { return uViewProj * vec4(w.x, w.y, -w.z, 1.0); }
uint remap(uint layer) { return texelFetch(uRemap, ivec2(int(layer), 0), 0).r; }`;
const LIGHT = `
// Sharp pixels at every distance: sample at the texel's centre (as nearest filtering would) but with the true
// gradients, so the mipmap level and anisotropic filtering are those of the real slope.
vec4 texel(sampler2DArray t, vec2 uv, float layer) {
  vec2 n = vec2(textureSize(t, 0).xy), c = (floor(uv * n) + 0.5) / n;
  return textureGrad(t, vec3(c, layer), dFdx(uv), dFdy(uv));
}
uniform float uFallF[10]; uniform int uFullF; uniform int uMonoF;
vec3 lit(vec3 c, float dist) {
  if (uFullF == 0) { float d = clamp(dist, 0.0, 8.99); int i = int(floor(d)); c *= mix(uFallF[i], uFallF[i + 1], fract(d)); }
  if (uMonoF == 1) c = vec3(dot(c, vec3(0.3, 0.59, 0.11)));
  return c;
}`;
const levelProg = program(COMMON + `
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in uint aLayer; layout(location=3) in float aShade; layout(location=4) in uint aKind;
uniform int uCeiling;
out vec2 vUV; flat out uint vLayer; out float vShade; out float vDist; flat out uint vKind;
// The editor marks ceilings with a shade of -0.7 (0.7, seen only from below: 3d/GRIDDB.C); the export clamps it to 0, so
// a ceiling's 0 is read as 0.7. The ceiling shows only to an eye below it, as in the game.
void main() { vUV = aUV; vLayer = remap(aLayer); vShade = aKind == 2u && aShade == 0.0 ? 0.7 : aShade; vKind = aKind; vDist = distance(aPos, uEye); gl_Position = gpu(aPos);
  if (aKind == 2u && (uCeiling == 0 || uEye.y > 3.98)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`, LIGHT + `
uniform sampler2DArray uTex;
in vec2 vUV; flat in uint vLayer; in float vShade; in float vDist; flat in uint vKind; out vec4 o;
void main() { vec4 t = texel(uTex, vUV, float(vLayer)); o = vec4(lit(t.rgb * vShade, vDist), 1.0); }`);
const modelProg = program(COMMON + `
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in uint aLayer; layout(location=3) in uint aColor; layout(location=4) in uint aFlags;
uniform int uHidden;
out vec2 vUV; flat out uint vLayer; flat out vec3 vColor; out float vDist;
void main() { vUV = aUV; vLayer = aLayer == 65535u ? 65535u : remap(aLayer);
  vColor = vec3(float((aColor >> 11) & 31u) / 31.0, float((aColor >> 5) & 63u) / 63.0, float(aColor & 31u) / 31.0);
  vDist = distance(aPos, uEye); gl_Position = gpu(aPos);
  if ((aFlags & 1u) != 0u && uHidden == 0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`, LIGHT + `
uniform sampler2DArray uTex;
in vec2 vUV; flat in uint vLayer; flat in vec3 vColor; in float vDist; out vec4 o;
void main() { vec3 c = vLayer == 65535u ? vColor : texel(uTex, vUV, float(vLayer)).rgb; o = vec4(lit(c, vDist), 1.0); }`);
// sprites: one quad an object, turned to face the camera about the vertical
const spriteProg = program(COMMON + `
layout(location=0) in vec2 aCorner; layout(location=1) in vec3 iBase; layout(location=2) in vec2 iSize; layout(location=3) in float iAlpha;
layout(location=4) in vec4 iRect; layout(location=5) in uint iFlags;
uniform vec3 uRight; uniform vec2 uAtlas; uniform int uHidden;
out vec2 vUV; out float vAlpha; out float vDist;
void main() { vec3 p = iBase + uRight * aCorner.x * iSize.x + vec3(0.0, aCorner.y * iSize.y, 0.0);
  vUV = (iRect.xy + vec2(aCorner.x + 0.5, 1.0 - aCorner.y) * iRect.zw) / uAtlas; vAlpha = iAlpha; vDist = distance(p, uEye); gl_Position = gpu(p);
  if ((iFlags & 3u) != 0u && uHidden == 0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`, LIGHT + `
uniform sampler2D uSprites;
in vec2 vUV; in float vAlpha; in float vDist; out vec4 o;
void main() { vec4 t = texture(uSprites, vUV); if (t.a < 0.5) discard; o = vec4(lit(t.rgb, vDist), vAlpha); }`);

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]), gl.STATIC_DRAW);

// ---------- state ----------
const S = {game: null, man: null, light: null, tex: null, remap: null, remapData: null, sprites: null, level: null,
  cam: {x: 32, y: 1, z: 32, yaw: 0, pitch: 0}, speed: 3, keys: new Set(), topDown: false};
window.__uw = S;

async function loadGame(game) {
  S.game = game; DATA = new URL(`../data/${game}/`, import.meta.url);
  status('Loading textures…');
  [S.man, S.light] = await Promise.all([fetchJson('manifest.json'), fetchJson('light.json')]);
  const T = S.man.textures;
  if (S.tex) gl.deleteTexture(S.tex);
  S.tex = await textureArray(T);
  S.remapData = new Uint16Array(T.count).map((_, i) => i);
  if (S.remap) gl.deleteTexture(S.remap);
  S.remap = gl.createTexture(); gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D, S.remap);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, T.count, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, S.remapData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const sp = await loadImage(S.man.sprites.files[0]);
  if (S.sprites) gl.deleteTexture(S.sprites);
  S.sprites = gl.createTexture(); gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, S.sprites);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sp); sp.close();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // the level list, by UW2's worlds
  const groups = new Map();
  for (const l of S.man.levels) { const k = l.realm || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
  $('#level').innerHTML = [...groups].map(([k, ls]) => (k ? `<optgroup label="${esc(k)}">` : '') + ls.map(l => `<option value="${l.id}">${esc(l.name.replace(/ \(\d+\)$/, ''))}</option>`).join('') + (k ? '</optgroup>' : '')).join('');
  $('#light').innerHTML = `<option value="-1">Full bright</option>` + S.light.names.map((n, i) => `<option value="${i}">${esc(n.replace(/^\d+: /, '')).replace(/^\w/, c => c.toUpperCase())}</option>`).join('');
  $('#light').value = '6';
  $('#game').value = game;
}

async function loadLevel(id, place) {
  status(`Loading ${S.man.levels.find(l => l.id === id)?.name || 'level ' + id}…`);
  const p = `levels/${id}/`;
  const [mesh, models, sprites, tiles, objects] = await Promise.all([fetchBin(p + 'mesh.bin'), fetchBin(p + 'models.bin'), fetchBin(p + 'sprites.bin'), fetchBin(p + 'tiles.bin'), fetchJson(p + 'objects.json')]);
  const L = S.man.levels.find(l => l.id === id);
  if (S.level) for (const b of S.level.buffers) gl.deleteBuffer(b);
  const lv = {id, L, objects, tiles: new Uint8Array(tiles), buffers: [], mesh: new DataView(mesh), models: new DataView(models), sprites: new DataView(sprites)};
  const buf = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); lv.buffers.push(b); return b; };
  const f = (loc, n, type, stride, off, normalized = false) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, type, normalized, stride, off); };
  const i = (loc, n, type, stride, off) => { gl.enableVertexAttribArray(loc); gl.vertexAttribIPointer(loc, n, type, stride, off); };
  // level
  lv.meshVao = gl.createVertexArray(); gl.bindVertexArray(lv.meshVao);
  buf(new Uint8Array(mesh, 0, L.vertices * 24));
  f(0, 3, gl.FLOAT, 24, 0); f(1, 2, gl.FLOAT, 24, 12); i(2, 1, gl.UNSIGNED_SHORT, 24, 20); f(3, 1, gl.UNSIGNED_BYTE, 24, 22, true); i(4, 1, gl.UNSIGNED_BYTE, 24, 23);
  // models
  lv.modelVao = gl.createVertexArray(); gl.bindVertexArray(lv.modelVao);
  if (L.modelVertices) { buf(models); f(0, 3, gl.FLOAT, 28, 0); f(1, 2, gl.FLOAT, 28, 12); i(2, 1, gl.UNSIGNED_SHORT, 28, 20); i(3, 1, gl.UNSIGNED_SHORT, 28, 22); i(4, 1, gl.UNSIGNED_SHORT, 28, 26); }
  // sprites: instanced quads
  lv.spriteVao = gl.createVertexArray(); gl.bindVertexArray(lv.spriteVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad); f(0, 2, gl.FLOAT, 8, 0);
  if (L.sprites) {
    buf(sprites);
    f(1, 3, gl.FLOAT, 36, 0); f(2, 2, gl.FLOAT, 36, 12); f(3, 1, gl.UNSIGNED_BYTE, 36, 21, true); f(4, 4, gl.UNSIGNED_SHORT, 36, 22); i(5, 1, gl.UNSIGNED_BYTE, 36, 32);
    for (const loc of [1, 2, 3, 4, 5]) gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);
  S.level = lv;
  $('#level').value = String(id);
  const c = S.cam;
  if (place) Object.assign(c, place);
  else if (L.start) Object.assign(c, {x: L.start.x, z: L.start.z, y: L.start.y + 0.75, yaw: (L.start.heading || 0) * Math.PI / 180, pitch: 0});
  else { const t = firstOpen(lv); Object.assign(c, {x: t[0] + 0.5, z: t[1] + 0.5, y: floorAt(t[0] + .5, t[1] + .5) + 0.75, yaw: 0, pitch: 0}); }
  if (place && place.y == null) c.y = floorAt(c.x, c.z) + 0.75;
  status(`${L.name.replace(/ \(\d+\)$/, '')}: ${L.triangles.toLocaleString()} triangles, ${L.objects} objects`);
  writeHash();
}
const tileAt = (lv, tx, ty) => { const o = (ty * 64 + tx) * 8; return {type: lv.tiles[o], floor: lv.tiles[o + 1], flags: lv.tiles[o + 6]}; };
const floorAt = (x, z) => { const lv = S.level, tx = Math.max(0, Math.min(63, Math.floor(x))), ty = Math.max(0, Math.min(63, Math.floor(z))); return tileAt(lv, tx, ty).floor * 0.25; };
function firstOpen(lv) { for (let r = 0; r < 32; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = 32 + dx, y = 32 + dy; if (tileAt(lv, x, y).type) return [x, y]; } return [32, 32]; }

// ---------- drawing ----------
function falloff() {
  const L = +$('#light').value, out = new Float32Array(10);
  if (L < 0) return {full: 1, mono: 0, out};
  const mono = L === S.light.monoAtLevel, table = mono && S.light.mono ? S.light.mono : S.light.brightness;
  for (let d = 0; d < 9; d++) { const m = S.light.shades[L][d]; out[d] = m >= 15 ? 0 : table[m]; }
  out[9] = 0;
  return {full: 0, mono: mono ? 1 : 0, out};
}
function frame(now) {
  const w = canvas.clientWidth * devicePixelRatio, h = canvas.clientHeight * devicePixelRatio;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  move();
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const lv = S.level;
  if (!lv) return requestAnimationFrame(frame);
  // animated textures: point each animated layer at its current frame
  let changed = false;
  for (const a of S.man.textures.animated) { const fr = a.frames[Math.floor(now / a.ms) % a.frames.length]; if (S.remapData[a.layer] !== fr) { S.remapData[a.layer] = fr; changed = true; } }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.remap);
  if (changed) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S.remapData.length, 1, gl.RED_INTEGER, gl.UNSIGNED_SHORT, S.remapData);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, S.tex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, S.sprites);
  const c = S.cam, eye = [c.x, c.y, -c.z];
  const vp = mat.mul(mat.persp(Math.PI / 3, w / h, 0.02, 120), mat.view(eye, c.yaw, c.pitch));
  const fall = falloff(), hidden = $('#hidden').checked ? 1 : 0;
  const use = p => {
    gl.useProgram(p.p); gl.uniformMatrix4fv(p.u.uViewProj, false, vp); gl.uniform3f(p.u.uEye, c.x, c.y, c.z);
    gl.uniform1fv(p.u.uFallF, fall.out); gl.uniform1i(p.u.uFullF, fall.full); gl.uniform1i(p.u.uMonoF, fall.mono);
    gl.uniform1i(p.u.uRemap, 1); if (p.u.uTex) gl.uniform1i(p.u.uTex, 0); if (p.u.uHidden) gl.uniform1i(p.u.uHidden, hidden);
  };
  gl.enable(gl.DEPTH_TEST);
  // the level: fronts face the open space; in GPU space (z turned) they are counter-clockwise
  use(levelProg); gl.uniform1i(levelProg.u.uCeiling, $('#ceiling').checked && !S.topDown ? 1 : 0);
  gl.enable(gl.CULL_FACE); gl.frontFace(gl.CCW); gl.cullFace(gl.BACK);
  gl.bindVertexArray(lv.meshVao); gl.drawArrays(gl.TRIANGLES, 0, lv.L.vertices);
  gl.disable(gl.CULL_FACE);
  if ($('#objects').checked) {
    if (lv.L.modelVertices) { use(modelProg); gl.bindVertexArray(lv.modelVao); gl.drawArrays(gl.TRIANGLES, 0, lv.L.modelVertices); }
    if (lv.L.sprites) {
      use(spriteProg); gl.uniform1i(spriteProg.u.uSprites, 2);
      gl.uniform3f(spriteProg.u.uRight, Math.cos(c.yaw), 0, -Math.sin(c.yaw)); gl.uniform2f(spriteProg.u.uAtlas, S.man.sprites.width, S.man.sprites.height);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(lv.spriteVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, lv.L.sprites);
      gl.disable(gl.BLEND);
    }
  }
  gl.bindVertexArray(null);
  requestAnimationFrame(frame);
}

// ---------- camera (as u9viewer) ----------
let last = performance.now();
function move() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  const c = S.cam, k = S.keys, sp = S.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1) * dt;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  if (k.has('KeyW') || S.walk) { c.x += fx * sp; c.z += fz * sp; } if (k.has('KeyS')) { c.x -= fx * sp; c.z -= fz * sp; }
  if (k.has('KeyD')) { c.x += fz * sp; c.z -= fx * sp; } if (k.has('KeyA')) { c.x -= fz * sp; c.z += fx * sp; }
  if (k.has('KeyE')) c.y += sp; if (k.has('KeyQ')) c.y -= sp;
  if (k.size || S.walk) scheduleHash();
}
addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyT') {
    S.topDown = !S.topDown; const c = S.cam;
    if (S.topDown) { S.saved = {...c}; Object.assign(c, {y: 14, pitch: -Math.PI / 2 + 0.001}); } else if (S.saved) Object.assign(c, {y: S.saved.y, pitch: S.saved.pitch});
    return;
  }
  S.keys.add(e.code);
});
addEventListener('keyup', e => S.keys.delete(e.code));
// touch screens: the Walk button moves forward until pressed again; dragging turns. The panel folds away.
$('#walk').onclick = () => { S.walk = !S.walk; $('#walk').classList.toggle('on', S.walk); $('#walk').textContent = S.walk ? '■ Stop' : '▲ Walk'; };
$('#fold').onclick = () => { const f = $('#panel').classList.toggle('folded'); $('#fold').textContent = f ? '+' : '–'; };
if (matchMedia('(max-width: 600px)').matches) $('#fold').onclick();   // a phone: start with the view, not the panel

addEventListener('blur', () => S.keys.clear());
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY, moved: false}; canvas.setPointerCapture(e.pointerId); canvas.focus(); });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  S.cam.yaw += dx * 0.005; S.cam.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.01, S.cam.pitch - dy * 0.005));
  drag.x = e.clientX; drag.y = e.clientY; scheduleHash();
});
canvas.addEventListener('pointerup', e => { if (drag && !drag.moved) pick(e.clientX, e.clientY); drag = null; });
// speed: the wheel or the slider (logarithmic, 0.5 to 60 tiles a second)
const setSpeed = v => { S.speed = Math.max(0.5, Math.min(60, v)); $('#speed').value = Math.log(S.speed); $('#speedv').textContent = S.speed < 10 ? S.speed.toFixed(1) : Math.round(S.speed); };
$('#speed').min = Math.log(0.5); $('#speed').max = Math.log(60); $('#speed').step = 0.01;
$('#speed').oninput = e => setSpeed(Math.exp(+e.target.value));
setSpeed(S.speed);
canvas.addEventListener('wheel', e => { e.preventDefault(); setSpeed(S.speed * (e.deltaY < 0 ? 1.25 : 0.8)); }, {passive: false});

// ---------- clicking: the nearest level triangle, model triangle or sprite along the ray ----------
function ray(px, py) {
  const c = S.cam, w = canvas.clientWidth, h = canvas.clientHeight, t = Math.tan(Math.PI / 6);
  const nx = (px / w * 2 - 1) * t * (w / h), ny = (1 - py / h * 2) * t;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const f = [sy * cp, sp, cy * cp], r = [cy, 0, -sy], u = [-sp * sy, cp, -sp * cy];   // world space (z north)
  return {o: [c.x, c.y, c.z], d: norm([f[0] + r[0] * nx + u[0] * ny, f[1] + r[1] * nx + u[1] * ny, f[2] + r[2] * nx + u[2] * ny])};
}
function hitTri(R, a, b, c) {   // Möller-Trumbore; distance or -1
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], p = cross(R.d, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-9) return -1;
  const s = [R.o[0] - a[0], R.o[1] - a[1], R.o[2] - a[2]], u = dot(s, p) / det; if (u < 0 || u > 1) return -1;
  const q = cross(s, e1), v = dot(R.d, q) / det; if (v < 0 || u + v > 1) return -1;
  const t = dot(e2, q) / det; return t > 1e-4 ? t : -1;
}
function pick(px, py) {
  const lv = S.level; if (!lv) return;
  const R = ray(px, py), ceiling = $('#ceiling').checked && !S.topDown, objectsOn = $('#objects').checked, hidden = $('#hidden').checked;
  let best = {t: Infinity};
  const m = lv.mesh, P = (v, s, dv) => [dv.getFloat32(v * s, true), dv.getFloat32(v * s + 4, true), dv.getFloat32(v * s + 8, true)];
  for (let t = 0; t < lv.L.triangles; t++) {
    const kind = m.getUint8(t * 72 + 23); if (kind === 2 && !ceiling) continue;
    const d = hitTri(R, P(t * 3, 24, m), P(t * 3 + 1, 24, m), P(t * 3 + 2, 24, m));
    if (d > 0 && d < best.t) best = {t: d, tile: m.getUint16(lv.L.vertices * 24 + t * 2, true), kind};
  }
  if (objectsOn) {
    const md = lv.models;
    for (let t = 0; t < lv.L.modelVertices / 3; t++) {
      if ((md.getUint16(t * 84 + 26, true) & 1) && !hidden) continue;
      const d = hitTri(R, P(t * 3, 28, md), P(t * 3 + 1, 28, md), P(t * 3 + 2, 28, md));
      if (d > 0 && d < best.t) best = {t: d, object: md.getUint16(t * 84 + 24, true)};
    }
    const sp = lv.sprites, r = [Math.cos(S.cam.yaw), 0, -Math.sin(S.cam.yaw)];
    for (let i = 0; i < lv.L.sprites; i++) {
      const o = i * 36; if ((sp.getUint8(o + 32) & 3) && !hidden) continue;
      const b = [sp.getFloat32(o, true), sp.getFloat32(o + 4, true), sp.getFloat32(o + 8, true)], w = sp.getFloat32(o + 12, true), h = sp.getFloat32(o + 16, true);
      const c0 = [b[0] - r[0] * w / 2, b[1], b[2] - r[2] * w / 2], c1 = [b[0] + r[0] * w / 2, b[1], b[2] + r[2] * w / 2], c2 = [c1[0], b[1] + h, c1[2]], c3 = [c0[0], b[1] + h, c0[2]];
      const d = Math.max(hitTri(R, c0, c1, c2), hitTri(R, c0, c2, c3));
      if (d > 0 && d < best.t - 0.02) best = {t: d, object: sp.getUint16(o + 30, true)};
    }
  }
  if (best.t === Infinity) return;
  const O = lv.objects;
  let tx, ty, focus = null;
  if (best.object != null) { focus = O[best.object]; tx = focus.x; ty = focus.y; } else { tx = best.tile % 64; ty = best.tile >> 6; }
  const t = tileAt(lv, tx, ty);
  const onTile = O.filter(o => o && o.in == null && o.x === tx && o.y === ty && (hidden || !o.flags?.includes('invisible') || o.link));
  const list = focus ? [focus, ...onTile.filter(o => o !== focus)] : onTile;
  const box = $('#info');
  const TYPES = ['solid rock', 'open', 'open to the south-east', 'open to the south-west', 'open to the north-east', 'open to the north-west', 'slope up to the north', 'slope up to the south', 'slope up to the east', 'slope up to the west'];
  const ends = k => k?.kind === 'lever' ? ends(k.does) : k;
  const levelName = id => (S.man.levels.find(l => l.id === id)?.name || `level ${id}`).replace(/ \(\d+\)$/, '');
  const flat = c => typeof c === 'string' ? esc(c) : `${esc(c.name)}${c.contents?.length ? ` (${c.contents.map(flat).join(', ')})` : ''}`;
  const item = o => {
    const bits = [];
    if (o.critter) bits.push(`${esc(cap(o.critter.attitude || ''))}${o.critter.hp != null ? `, ${o.critter.hp} hit points` : ''}${o.critter.talksAs ? `; talks as ${esc(o.critter.talksAs)}` : ''}`);
    if (o.desc) bits.push(esc(cap(o.desc)));
    if (o.lock) bits.push(`${o.lock.locked ? 'Locked' : 'Unlocked'}${o.lock.key ? `; opened by ${esc(o.lock.key)}` : ''}`);
    if (o.contents?.length) bits.push(`Holds ${o.contents.map(flat).join(', ')}`);
    if (o.text) bits.push(`“${esc(o.text.trim())}”`);
    const k = ends(o.link); if (k?.kind === 'teleport') bits.push(`Takes you to ${esc(k.level === lv.id ? 'another place on this level' : levelName(k.level))} (${k.x}, ${k.y}).`);
    else if (o.link?.text) bits.push(esc(cap(o.link.text)));
    return `<li><b>${esc(cap(o.name))}</b>${bits.length ? `<br>${bits.join('<br>')}` : ''}</li>`;
  };
  const teles = list.map(o => ends(o.link)).filter(k => k?.kind === 'teleport');
  box.style.display = 'block';
  box.innerHTML = `<h2>${esc(cap(focus ? focus.name : TYPES[t.type] || 'tile'))}</h2>
    <p class="muted">Tile ${tx}, ${ty} · ${esc(TYPES[t.type] || '')}${t.type ? `, floor height ${t.floor}` : ''}${best.kind === 1 ? ' · a wall' : best.kind === 2 ? ' · the ceiling' : ''}</p>
    ${list.length ? `<ul>${list.slice(0, 12).map(item).join('')}</ul>` : ''}
    ${teles.map((k, i) => `<button data-go="${i}">Go to ${esc(k.level === lv.id ? 'where it leads' : levelName(k.level))}</button>`).join('')}
    <p><a href="../#${S.game}/L${lv.id}?view=${tx + .5},${63 - ty + .5},5">On the map</a></p><button id="close">Close</button>`;
  $('#close').onclick = () => { box.style.display = 'none'; };
  for (const b of box.querySelectorAll('[data-go]')) b.onclick = () => {
    const k = teles[+b.dataset.go]; box.style.display = 'none';
    const place = {x: k.x + 0.5, z: k.y + 0.5, y: null, pitch: 0};
    if (k.level === lv.id) { Object.assign(S.cam, place); S.cam.y = floorAt(place.x, place.z) + 0.75; writeHash(); } else loadLevel(k.level, place);
  };
}

// ---------- the address: #<game>/<level>/<x>,<z>[,<y>,<yaw>,<pitch>] ----------
let hashTimer = 0;
const scheduleHash = () => { clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 400); };
function writeHash() { if (!S.level) return; const c = S.cam; history.replaceState(null, '', `#${S.game}/${S.level.id}/${c.x.toFixed(2)},${c.z.toFixed(2)},${c.y.toFixed(2)},${c.yaw.toFixed(3)},${c.pitch.toFixed(3)}`); }
function readHash() {
  const [game, level, pos] = location.hash.replace(/^#\/?/, '').split('/');
  const n = (pos || '').split(',').map(Number);
  return {game: game === 'uw2' ? 'uw2' : 'uw1', level: +level || null, place: n.length >= 2 && !isNaN(n[0]) ? {x: n[0], z: n[1], y: n.length > 2 ? n[2] : null, yaw: n[3] || 0, pitch: n[4] || 0} : null};
}

// ---------- start ----------
(async () => {
  try {
    const h = readHash();
    await loadGame(h.game);
    $('#game').onchange = async () => { await loadGame($('#game').value); await loadLevel(S.man.levels[0].id); };
    $('#level').onchange = () => loadLevel(+$('#level').value);
    requestAnimationFrame(frame);
    await loadLevel(S.man.levels.some(l => l.id === h.level) ? h.level : (S.man.levels.find(l => l.start) || S.man.levels[0]).id, h.place);
  } catch (e) { status(e.message); console.error(e); }
})();
