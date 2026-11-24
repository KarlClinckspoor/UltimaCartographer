// Ultima IX viewer: draws what the U9 editor bakes (data/, see EXPORT.md) with WebGL2.
// After noclip.website: data arrives ready for the GPU, terrain is drawn tile by tile with culling and coarser
// grids far away, models are culled by view and distance and drawn instanced, textures live in arrays.
//
// World space is the editor's: x east, y up, z north (row), one unit a terrain point. The GPU gets (x, y, -z),
// a right-handed space, so the picture is not mirrored.

const DATA = new URL('data/', import.meta.url);
const $ = s => document.querySelector(s);
const canvas = $('#gl'), gl = canvas.getContext('webgl2', {antialias: true});
if (!gl) throw new Error('WebGL2 is needed');
const status = t => { $('#status').textContent = t; };

// ---------- small math ----------
const mat = {
  persp(fovy, aspect, near, far) { const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); },
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  // view from a position in GPU space and yaw (0 = north, clockwise) / pitch (up positive)
  view(p, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = [sy * cp, sp, -cy * cp];                     // forward (GPU space: north is -z)
    const r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, p), -dot(u, p), dot(f, p), 1]);
  },
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
// frustum planes (GPU space) from a view-projection matrix
function frustum(m) {
  const p = [];
  for (const [i, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const a = m[3] + s * m[i], b = m[7] + s * m[4 + i], c = m[11] + s * m[8 + i], d = m[15] + s * m[12 + i], l = Math.hypot(a, b, c);
    p.push([a / l, b / l, c / l, d / l]);
  }
  return p;
}
const sphereIn = (pl, x, y, z, r) => pl.every(q => q[0] * x + q[1] * y + q[2] * z + q[3] > -r);
const boxIn = (pl, x0, y0, z0, x1, y1, z1) => pl.every(q => q[0] * (q[0] > 0 ? x1 : x0) + q[1] * (q[1] > 0 ? y1 : y0) + q[2] * (q[2] > 0 ? z1 : z0) + q[3] > 0);

// ---------- GL helpers ----------
function program(vs, fs) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp usampler2D;\nprecision highp sampler2DArray;\n' + src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
  return {p, u};
}
const fetchBin = async n => { const r = await fetch(new URL(n, DATA)); if (!r.ok) throw new Error(`${n} is missing: run u9 export-web`); return r.arrayBuffer(); };
const fetchJson = async n => { const r = await fetch(new URL(n, DATA)); if (!r.ok) throw new Error(`${n} is missing`); return r.json(); };
const loadImage = async n => { const r = await fetch(new URL(n, DATA)); return createImageBitmap(await r.blob(), {premultiplyAlpha: 'none', colorSpaceConversion: 'none'}); };
// a TEXTURE_2D_ARRAY from PNG strips of size x size layers stacked vertically
const MAX_LAYERS = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
// An exported array deeper than the GPU allows becomes several GL arrays of MAX_LAYERS each.
async function textureArrays(size, count, files) {
  const out = [];
  for (let first = 0; first < Math.max(1, count); first += MAX_LAYERS) out.push(await textureArray(size, count, files, first, Math.min(MAX_LAYERS, count - first)));
  return out;
}
async function textureArray(size, count, files, first = 0, depth = count) {
  const t = gl.createTexture(), levels = Math.floor(Math.log2(size)) + 1;
  // Loading awaits between uploads while frames are drawn, and drawing rebinds textures: keep a unit of our own
  // and bind again before every call.
  const bind = () => { gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); };
  bind();
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, size, size, Math.max(1, depth));
  let z = 0;   // layers of the whole exported array passed so far
  for (const f of files) {
    if (z >= first + depth) break;
    if (z + 64 <= first) { z += 64; continue; }   // 64 layers a file (EXPORT.md)
    const img = await loadImage(f), n = Math.min(img.height / size, count - z);   // a strip may be padded past the count
    if (n <= 0) { img.close(); continue; }
    // the part of this strip that falls in [first, first + depth)
    const a = Math.max(z, first), b = Math.min(z + n, first + depth);
    if (b > a) {
      const sub = await createImageBitmap(img, 0, (a - z) * size, size, (b - a) * size, {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
      bind();
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, a - first, size, size, b - a, gl.RGBA, gl.UNSIGNED_BYTE, sub);
      sub.close();
    }
    z += n; img.close();
  }
  bind();
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  return t;
}

// ---------- shaders ----------
const COMMON = `
uniform mat4 uViewProj; uniform vec3 uEye; uniform float uFogEnd;
vec3 gpu(vec3 w) { return vec3(w.x, w.y, -w.z); }`;
const LIGHT = `
uniform vec3 uFogColor;
vec3 shade(vec3 base, vec3 n, float dist, float fogEnd) {
  vec3 L = normalize(vec3(0.35, 0.8, 0.45));
  float d = max(dot(normalize(n), L), 0.0);
  vec3 c = base * (0.45 + 0.65 * d);
  float fog = clamp((dist - fogEnd * 0.6) / (fogEnd * 0.4), 0.0, 1.0);
  return mix(c, uFogColor, fog);
}`;
const terrainProg = program(COMMON + `
in vec2 aGrid; in float aSkirt; in vec3 iTile;   // grid position in points; 1 on the skirt; tile origin x, row and grid step
uniform usampler2D uHeight; uniform ivec2 uSize;
out vec3 vWorld; out vec3 vNormal; out float vDist;
float H(int x, int z) { return float(texelFetch(uHeight, ivec2(clamp(x, 0, uSize.x - 1), clamp(z, 0, uSize.y - 1)), 0).r) / 32.0; }
void main() {
  int x = int(iTile.x + aGrid.x), z = int(iTile.y + aGrid.y), s = int(iTile.z);
  float h = H(x, z);
  vNormal = vec3(H(x - s, z) - H(x + s, z), 2.0 * float(s), H(x, z - s) - H(x, z + s));
  vWorld = vec3(float(x), h - aSkirt * 2.0, float(z));
  vDist = distance(vWorld, uEye);
  gl_Position = uViewProj * vec4(gpu(vWorld), 1.0);
}`, LIGHT + `
in vec3 vWorld; in vec3 vNormal; in float vDist;
uniform usampler2D uInfo; uniform sampler2DArray uTex; uniform ivec2 uSize; uniform float uFogEnd;
out vec4 frag;
void main() {
  ivec2 q = ivec2(floor(vWorld.x), floor(vWorld.z));
  uint info = texelFetch(uInfo, clamp(q, ivec2(0), uSize - 1), 0).r;
  if ((info & 0x1000u) != 0u) discard;   // hole
  uint layer = info >> 16; uint rot = (info >> 13) & 3u;
  vec2 f = fract(vWorld.xz);   // u east, v north
  vec2 dx = dFdx(vWorld.xz), dy = dFdy(vWorld.xz);
  // the texture's top row is at its v = 0 (EXPORT.md / TerrainPoint.Rotation)
  vec2 tc = rot == 0u ? vec2(f.x, 1.0 - f.y) : rot == 1u ? vec2(1.0 - f.y, 1.0 - f.x) : rot == 2u ? vec2(1.0 - f.x, f.y) : vec2(f.y, f.x);
  if (rot == 1u || rot == 3u) { dx = dx.yx; dy = dy.yx; }
  vec3 base = layer == 0xFFFFu ? vec3(1.0, 0.0, 1.0) : textureGrad(uTex, vec3(tc, float(layer)), dx, dy).rgb;
  frag = vec4(shade(base, vNormal, vDist, uFogEnd), 1.0);
}`);

const modelProg = program(COMMON + `
in vec3 aPos; in vec4 aNorm; in vec2 aUV; in uint aTex; in uint aCol;
in vec3 iPos; in vec4 iQuat;
out vec3 vNormal; out vec2 vUV; flat out uint vTex; flat out uint vCol; out float vDist;
vec3 rot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  vec3 w = iPos + rot(iQuat, aPos);
  vNormal = rot(iQuat, aNorm.xyz); vUV = aUV; vTex = aTex; vCol = aCol;
  vDist = distance(w, uEye);
  gl_Position = uViewProj * vec4(gpu(w), 1.0);
}`, LIGHT + `
in vec3 vNormal; in vec2 vUV; flat in uint vTex; flat in uint vCol; in float vDist;
uniform sampler2DArray uT0, uT1, uT2, uT3, uT4, uT5, uT6, uT7; uniform usampler2D uModes; uniform int uPass; uniform float uFogEnd;
uniform int uFirst[8]; uniform int uMaxLayers;   // the first sampler of each exported array; layers per sampler
out vec4 frag;
void main() {
  vec4 c; uint mode = 0u;
  vec2 dx = dFdx(vUV), dy = dFdy(vUV);
  if (vTex == 0xFFFFu) {
    c = vec4(float((vCol >> 11) & 31u) / 31.0, float((vCol >> 5) & 63u) / 63.0, float(vCol & 31u) / 31.0, 1.0);
  } else {
    uint a = vTex >> 12; int layer = int(vTex & 0xFFFu);
    mode = texelFetch(uModes, ivec2(layer, int(a)), 0).r;
    int si = uFirst[a] + layer / uMaxLayers;
    vec3 t = vec3(vUV, float(layer % uMaxLayers));
    c = si == 0 ? textureGrad(uT0, t, dx, dy) : si == 1 ? textureGrad(uT1, t, dx, dy) : si == 2 ? textureGrad(uT2, t, dx, dy)
      : si == 3 ? textureGrad(uT3, t, dx, dy) : si == 4 ? textureGrad(uT4, t, dx, dy) : si == 5 ? textureGrad(uT5, t, dx, dy)
      : si == 6 ? textureGrad(uT6, t, dx, dy) : textureGrad(uT7, t, dx, dy);
  }
  if (uPass == 0) { if (mode == 2u || (mode == 1u && c.a < 0.5)) discard; frag = vec4(shade(c.rgb, gl_FrontFacing ? vNormal : -vNormal, vDist, uFogEnd), 1.0); }
  else { if (mode != 2u) discard; frag = vec4(c.rgb * c.a, c.a); }
}`);

const waterProg = program(COMMON + `
in vec2 aPos; uniform vec2 uSize2; uniform float uY; out float vDist;
void main() { vec3 w = vec3(aPos * uSize2, uY); w = vec3(w.x, uY, aPos.y * uSize2.y); vDist = distance(w, uEye); gl_Position = uViewProj * vec4(gpu(w), 1.0); }`, LIGHT + `
in float vDist; uniform float uFogEnd; out vec4 frag;
void main() { frag = vec4(mix(vec3(0.12, 0.25, 0.45), uFogColor, clamp((vDist - uFogEnd * 0.6) / (uFogEnd * 0.4), 0.0, 1.0)), 0.6); }`);

// ---------- terrain grids: one template per step (1, 2, 4, 8 points), with a skirt round the edge ----------
const grids = [1, 2, 4, 8].map(step => {
  const n = 16 / step, verts = [], idx = [], at = (gx, gy, skirt) => { verts.push(gx * step, gy * step, skirt); return verts.length / 3 - 1; };
  const id = [];
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) id[y * (n + 1) + x] = at(x, y, 0);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = id[y * (n + 1) + x], b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const edge = [];   // the border, walked round, with a dropped copy
  for (let x = 0; x < n; x++) edge.push([x, 0]); for (let y = 0; y < n; y++) edge.push([n, y]);
  for (let x = n; x > 0; x--) edge.push([x, n]); for (let y = n; y > 0; y--) edge.push([0, y]);
  const ring = edge.map(([x, y]) => [id[y * (n + 1) + x], at(x, y, 1)]);
  for (let i = 0; i < ring.length; i++) { const [a, a2] = ring[i], [b, b2] = ring[(i + 1) % ring.length]; idx.push(a, b, a2, b, b2, a2); }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const aGrid = gl.getAttribLocation(terrainProg.p, 'aGrid'), aSkirt = gl.getAttribLocation(terrainProg.p, 'aSkirt');
  gl.enableVertexAttribArray(aGrid); gl.vertexAttribPointer(aGrid, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(aSkirt); gl.vertexAttribPointer(aSkirt, 1, gl.FLOAT, false, 12, 8);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  const iTile = gl.getAttribLocation(terrainProg.p, 'iTile');
  gl.enableVertexAttribArray(iTile); gl.vertexAttribPointer(iTile, 3, gl.FLOAT, false, 12, 0); gl.vertexAttribDivisor(iTile, 1);
  gl.bindVertexArray(null);
  return {step, vao, inst, count: idx.length, data: new Float32Array(4096 * 3)};
});

// water: a unit square
const waterVao = (() => {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(waterProg.p, 'aPos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 8, 0);
  gl.bindVertexArray(null); return vao;
})();

// ---------- state ----------
const S = {manifest: null, terrainTex: null, map: null, models: null, cam: {x: 512, y: 200, z: 512, yaw: 0, pitch: -0.7}, speed: 40, keys: new Set(), dist: 256, topDown: false};

async function loadModels() {
  if (S.models) return S.models;
  status('Loading models…');
  const [json, bin] = await Promise.all([fetchJson('models.json'), fetchBin('models.bin')]);
  const vb = json.vertexBytes || 32, nv = json.vertexCount;
  // WebGL2 has no base vertex: make every index absolute
  const idxIn = new Uint32Array(bin, json.indexOffset, json.indexCount), idx = new Uint32Array(json.indexCount);
  const models = {};
  for (const [id, m] of Object.entries(json.models)) {
    const b = m.bbox || [0, 0, 0, 0, 0, 0];
    const lods = m.lods.map(l => { for (let i = 0; i < l.indexCount; i++) idx[l.firstIndex + i] = idxIn[l.firstIndex + i] + l.baseVertex; return l; });
    models[id] = {lods, dist: m.lodDistances || [], radius: Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 || 1, center: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]};
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbuf); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(bin, 0, nv * vb), gl.STATIC_DRAW);
  const A = n => gl.getAttribLocation(modelProg.p, n);
  gl.enableVertexAttribArray(A('aPos')); gl.vertexAttribPointer(A('aPos'), 3, gl.FLOAT, false, vb, 0);
  gl.enableVertexAttribArray(A('aNorm')); gl.vertexAttribPointer(A('aNorm'), 4, gl.BYTE, true, vb, 12);
  gl.enableVertexAttribArray(A('aUV')); gl.vertexAttribPointer(A('aUV'), 2, gl.FLOAT, false, vb, 16);
  gl.enableVertexAttribArray(A('aTex')); gl.vertexAttribIPointer(A('aTex'), 1, gl.UNSIGNED_SHORT, vb, 24);
  gl.enableVertexAttribArray(A('aCol')); gl.vertexAttribIPointer(A('aCol'), 1, gl.UNSIGNED_SHORT, vb, 26);
  const ibuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.enableVertexAttribArray(A('iPos')); gl.vertexAttribDivisor(A('iPos'), 1);
  gl.enableVertexAttribArray(A('iQuat')); gl.vertexAttribDivisor(A('iQuat'), 1);
  gl.bindVertexArray(null);
  // model textures: one array per size; modes as a R8UI texture, a row per array
  const arrays = S.manifest.textures.model, tex = [];
  const first = [];
  for (const a of arrays) { status(`Loading ${a.size} px model textures…`); first.push(tex.length); tex.push(...await textureArrays(a.size, a.count, a.files)); }
  if (tex.length > 8) throw new Error(`model textures need ${tex.length} texture arrays; the viewer has 8`);
  const w = Math.max(...arrays.map(a => a.count)), modes = new Uint8Array(w * arrays.length);
  for (let i = 0; i < arrays.length; i++) modes.set(new Uint8Array(await fetchBin(arrays[i].modes)), i * w);
  const modeTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, modeTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, w, arrays.length, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, modes);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return S.models = {models, vao, inst, tex, first, modeTex, blended: json.models, instData: new Float32Array(1 << 20)};
}

async function loadMap(id, place) {
  const m = S.manifest.maps.find(q => q.id === id);
  status(`Loading ${m.name || 'map ' + id}…`);
  const t = new DataView(await fetchBin(`maps/${id}/terrain.bin`)), cc = t.getUint32(0, true), W = m.width, H = m.height;
  const heights = new Uint16Array(W * H), info = new Uint32Array(W * H), tileOff = 4 + cc * 1024;
  for (let ty = 0; ty < m.tilesY; ty++) for (let tx = 0; tx < m.tilesX; tx++) {
    const c = t.getUint16(tileOff + (tx + ty * m.tilesX) * 2, true), base = 4 + c * 1024;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const p = t.getUint32(base + (y * 16 + x) * 4, true), o = (ty * 16 + y) * W + tx * 16 + x;
      heights[o] = p & 0xFFF; info[o] = p;
    }
  }
  const tex = (fmt, f, data) => { const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, fmt, W, H, 0, f, fmt === gl.R16UI ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, data); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return tx; };
  if (S.map) { gl.deleteTexture(S.map.hTex); gl.deleteTexture(S.map.iTex); }
  // each tile's height range, for culling
  const tiles = [];
  for (let ty = 0; ty < m.tilesY; ty++) for (let tx = 0; tx < m.tilesX; tx++) {
    let lo = 4095, hi = 0;
    for (let y = 0; y <= 16; y++) for (let x = 0; x <= 16; x++) { const h = heights[Math.min(H - 1, ty * 16 + y) * W + Math.min(W - 1, tx * 16 + x)]; if (h < lo) lo = h; if (h > hi) hi = h; }
    tiles.push([tx * 16, ty * 16, lo / 32 - 2, hi / 32]);
  }
  const map = S.map = {id, m, W, H, heights, info, tiles, hTex: tex(gl.R16UI, gl.RED_INTEGER, heights), iTex: tex(gl.R32UI, gl.RED_INTEGER, info), objects: null, objJson: null, links: null};
  // objects: grouped by model
  const ob = await fetchBin(`maps/${id}/objects.bin`), dv = new DataView(ob), n = ob.byteLength / 24;
  map.objects = {n, pos: new Float32Array(n * 3), quat: new Float32Array(n * 4), model: new Uint16Array(n), idx: new Uint16Array(n)};
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) map.objects.pos[i * 3 + k] = dv.getFloat32(i * 24 + k * 4, true);
    for (let k = 0; k < 4; k++) map.objects.quat[i * 4 + k] = dv.getInt16(i * 24 + 12 + k * 2, true) / 32767;
    map.objects.model[i] = dv.getUint16(i * 24 + 20, true); map.objects.idx[i] = dv.getUint16(i * 24 + 22, true);
  }
  map.links = await fetchJson(`maps/${id}/links.json`);
  fetchJson(`maps/${id}/objects.json`).then(j => { if (S.map === map) map.objJson = j; });
  if (place) Object.assign(S.cam, place);
  else Object.assign(S.cam, {x: W / 2, z: H / 2, y: Math.max(60, W / 6), yaw: 0, pitch: -0.9});
  $('#map').value = id;
  writeHash();
  S.summary = `${m.name || 'Map ' + id}: ${W} × ${H} points, ${n.toLocaleString()} objects, ${m.links} map changes`;
  status(S.models ? S.summary : S.summary + ' · loading models…');
}

// ---------- drawing ----------
const heightAt = (x, z) => { const m = S.map; if (!m) return 0; const xi = Math.max(0, Math.min(m.W - 1, Math.round(x))), zi = Math.max(0, Math.min(m.H - 1, Math.round(z))); return m.heights[zi * m.W + xi] / 32; };

function frame() {
  const w = canvas.clientWidth * devicePixelRatio, h = canvas.clientHeight * devicePixelRatio;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  move();
  gl.viewport(0, 0, w, h);
  const fog = [0.55, 0.65, 0.78];
  gl.clearColor(...fog, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!S.map) return requestAnimationFrame(frame);
  const c = S.cam, eye = [c.x, c.y, -c.z];
  const proj = mat.persp(Math.PI / 3, w / h, 0.1, S.dist * 1.5 + c.y), view = mat.view(eye, c.yaw, c.pitch), vp = mat.mul(proj, view), pl = frustum(vp);
  gl.enable(gl.DEPTH_TEST);
  const common = p => { gl.useProgram(p.p); gl.uniformMatrix4fv(p.u.uViewProj, false, vp); gl.uniform3f(p.u.uEye, c.x, c.y, c.z); gl.uniform1f(p.u.uFogEnd, S.dist); if (p.u.uFogColor) gl.uniform3f(p.u.uFogColor, ...fog); };

  // terrain: visible tiles, the grid step by distance
  const m = S.map;
  common(terrainProg);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.hTex); gl.uniform1i(terrainProg.u.uHeight, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.iTex); gl.uniform1i(terrainProg.u.uInfo, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, S.terrainTex); gl.uniform1i(terrainProg.u.uTex, 2);
  gl.uniform2i(terrainProg.u.uSize, m.W, m.H);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  const counts = [0, 0, 0, 0];
  let tilesDrawn = 0;
  for (const [tx, tz, lo, hi] of m.tiles) {
    const cx = tx + 8, cz = tz + 8, d = Math.hypot(cx - c.x, cz - c.z, (lo + hi) / 2 - c.y);
    if (d > S.dist + 24) continue;
    if (!boxIn(pl, tx, lo, -(tz + 16), tx + 16, hi, -tz)) continue;
    const g = d < 48 ? 0 : d < 120 ? 1 : d < 260 ? 2 : 3, gr = grids[g];
    gr.data.set([tx, tz, gr.step], counts[g] * 3); counts[g]++; tilesDrawn++;
  }
  // drawn front faces are counter-clockwise in GPU space; the grid winds that way seen from above
  gl.frontFace(gl.CW);
  grids.forEach((gr, i) => { if (!counts[i]) return; gl.bindVertexArray(gr.vao); gl.bindBuffer(gl.ARRAY_BUFFER, gr.inst); gl.bufferData(gl.ARRAY_BUFFER, gr.data.subarray(0, counts[i] * 3), gl.STREAM_DRAW); gl.drawElementsInstanced(gl.TRIANGLES, gr.count, gl.UNSIGNED_SHORT, 0, counts[i]); });
  gl.frontFace(gl.CCW);

  // models: culled and given a LOD per instance, then each (model, LOD) drawn instanced
  let objsDrawn = 0;
  const M = S.models, O = m.objects;
  if (M && O && $('#models').checked) {
    gl.disable(gl.CULL_FACE);   // the y/z swap mirrors models: draw both sides (EXPORT.md)
    const runs = [], data = M.instData; let n = 0;
    const byKey = new Map();
    for (let i = 0; i < O.n; i++) {
      const md = M.models[O.model[i]]; if (!md) continue;
      const x = O.pos[i * 3], y = O.pos[i * 3 + 1], z = O.pos[i * 3 + 2];
      const d = Math.hypot(x - c.x, y - c.y, z - c.z);
      if (d > S.dist + md.radius) continue;
      if (!sphereIn(pl, x, y, -z, md.radius + 0.5)) continue;
      let lod = 0;
      while (lod < md.lods.length - 1 && md.dist[lod] != null && d > md.dist[lod]) lod++;
      const key = O.model[i] * 8 + lod;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(i);
    }
    for (const [key, list] of byKey) {
      if (n + list.length > data.length / 7) break;
      runs.push([key, n, list.length]);
      for (const i of list) { data.set(O.pos.subarray(i * 3, i * 3 + 3), n * 7); data.set(O.quat.subarray(i * 4, i * 4 + 4), n * 7 + 3); n++; }
    }
    objsDrawn = n;
    common(modelProg);
    gl.bindVertexArray(M.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, M.inst); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 7), gl.STREAM_DRAW);
    for (let i = 0; i < 8; i++) { gl.activeTexture(gl.TEXTURE3 + i); gl.bindTexture(gl.TEXTURE_2D_ARRAY, M.tex[Math.min(i, M.tex.length - 1)]); gl.uniform1i(modelProg.u['uT' + i], 3 + i); }
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, M.modeTex); gl.uniform1i(modelProg.u.uModes, 11);
    gl.uniform1iv(modelProg.u.uFirst, new Int32Array([...M.first, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 8))); gl.uniform1i(modelProg.u.uMaxLayers, MAX_LAYERS);
    const iPos = gl.getAttribLocation(modelProg.p, 'iPos'), iQuat = gl.getAttribLocation(modelProg.p, 'iQuat');
    const drawRuns = blendedOnly => {
      for (const [key, start, count] of runs) {
        const md = M.models[key >> 3], l = md.lods[key & 7];
        if (blendedOnly && !l.blended) continue;
        gl.vertexAttribPointer(iPos, 3, gl.FLOAT, false, 28, start * 28);
        gl.vertexAttribPointer(iQuat, 4, gl.FLOAT, false, 28, start * 28 + 12);
        gl.drawElementsInstanced(gl.TRIANGLES, l.indexCount, gl.UNSIGNED_INT, l.firstIndex * 4, count);
      }
    };
    gl.uniform1i(modelProg.u.uPass, 0); drawRuns(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1i(modelProg.u.uPass, 1); drawRuns(true);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  // water
  if ($('#water').checked && m.m.waterHeight) {
    common(waterProg); gl.disable(gl.CULL_FACE);
    gl.uniform2f(waterProg.u.uSize2, m.W, m.H); gl.uniform1f(waterProg.u.uY, m.m.waterHeight / 32);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(waterVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disable(gl.BLEND);
  }
  gl.bindVertexArray(null);
  S.stats = {tilesDrawn, objsDrawn};
  requestAnimationFrame(frame);
}

// ---------- camera ----------
let last = performance.now();
function move() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  const c = S.cam, k = S.keys, sp = S.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1) * dt;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  if (k.has('KeyW') || S.walk) { c.x += fx * sp; c.z += fz * sp; } if (k.has('KeyS')) { c.x -= fx * sp; c.z -= fz * sp; }
  if (k.has('KeyD')) { c.x += fz * sp; c.z -= fx * sp; } if (k.has('KeyA')) { c.x -= fz * sp; c.z += fx * sp; }
  if (k.has('KeyE')) c.y += sp; if (k.has('KeyQ')) c.y -= sp;
  c.y = Math.max(c.y, heightAt(c.x, c.z) + 1.5);
  if (k.size || S.walk) scheduleHash();
}
addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyT') { S.topDown = !S.topDown; const c = S.cam; if (S.topDown) { S.saved = {...c}; Object.assign(c, {y: Math.max(c.y, 150), pitch: -Math.PI / 2 + 0.001}); } else if (S.saved) Object.assign(c, {y: S.saved.y, pitch: S.saved.pitch}); return; }
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
canvas.addEventListener('wheel', e => { e.preventDefault(); S.speed = Math.max(2, Math.min(800, S.speed * (e.deltaY < 0 ? 1.25 : 0.8))); status(`Speed ${Math.round(S.speed)} points a second`); }, {passive: false});

// ---------- clicking: the ground point under the pointer, then the nearest object to it ----------
function pick(px, py) {
  const m = S.map; if (!m) return;
  const c = S.cam, w = canvas.clientWidth, h = canvas.clientHeight, t = Math.tan(Math.PI / 6);
  const nx = (px / w * 2 - 1) * t * (w / h), ny = (1 - py / h * 2) * t;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const f = [sy * cp, sp, cy * cp], r = norm([cy, 0, -sy]), u = cross(f, r).map(v => -v);   // world space (z north)
  const dir = norm([f[0] + r[0] * nx + u[0] * ny, f[1] + r[1] * nx + u[1] * ny, f[2] + r[2] * nx + u[2] * ny]);
  let hit = null;
  for (let s = 0; s < S.dist * 1.5; s += 0.25) { const x = c.x + dir[0] * s, y = c.y + dir[1] * s, z = c.z + dir[2] * s; if (y <= heightAt(x, z)) { hit = [x, y, z]; break; } }
  if (!hit) return;
  const O = m.objects, list = m.objJson || [];
  let best = -1, bd = 3;
  for (let i = 0; i < list.length; i++) { const o = list[i], d = Math.hypot(o.x - hit[0], o.row - hit[2]); if (d < bd) { bd = d; best = i; } }
  const box = $('#info');
  const link = best >= 0 ? m.links.find(l => l.object === best) : null;
  if (best < 0) { box.style.display = 'block'; box.innerHTML = `<h2>Ground</h2><p>${hit[0].toFixed(1)}, ${hit[2].toFixed(1)} · height ${(hit[1] * 32).toFixed(0)}</p>`; return; }
  const o = list[best];
  box.style.display = 'block';
  box.innerHTML = `<h2>${esc(o.name || 'type ' + o.type)}</h2><p>Type ${o.type}${o.model != null ? `, model ${o.model}` : ''} · ${o.fixed ? 'fixed' : 'movable'}${o.drawn ? '' : ' · not drawn'}<br>${o.x.toFixed(1)}, ${o.row.toFixed(1)}, height ${o.height}</p>` +
    (link ? `<p>Map change to <b>${esc(mapName(link.toMap))}</b>.</p><button id="go">Go there</button>` : '') + `<button id="close">Close</button>`;
  $('#close').onclick = () => { box.style.display = 'none'; };
  if (link) $('#go').onclick = () => { box.style.display = 'none'; loadMap(link.toMap, link.toX != null ? {x: link.toX, z: link.toRow, y: (link.toHeight || 0) / 32 + 20, pitch: -0.5} : null); };
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
const mapName = id => { const m = S.manifest.maps.find(q => q.id === id); return m ? (m.name || `map ${id}`) : `map ${id}`; };

// ---------- the address: #map=9&x=..&y=..&z=..&yaw=..&pitch=.. ----------
let hashTimer = 0;
const scheduleHash = () => { clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 400); };
function writeHash() { if (!S.map) return; const c = S.cam; history.replaceState(null, '', `#map=${S.map.id}&x=${c.x.toFixed(1)}&y=${c.y.toFixed(1)}&z=${c.z.toFixed(1)}&yaw=${c.yaw.toFixed(3)}&pitch=${c.pitch.toFixed(3)}`); }
const readHash = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));

// ---------- start ----------
(async () => {
  try {
    S.manifest = await fetchJson('manifest.json');
    const sel = $('#map');
    sel.innerHTML = S.manifest.maps.map(m => `<option value="${m.id}">${m.id}: ${esc(m.name || '(unnamed)')}</option>`).join('');
    sel.onchange = () => loadMap(+sel.value);
    $('#dist').oninput = e => { S.dist = +e.target.value; $('#distv').textContent = S.dist; };
    $('#distv').textContent = S.dist;
    status('Loading terrain textures…');
    const tt = S.manifest.textures.terrain;
    if (tt.count > MAX_LAYERS) throw new Error(`${tt.count} terrain layers; this GPU allows ${MAX_LAYERS} in one array`);
    S.terrainTex = await textureArray(tt.size, tt.count, tt.files);
    const h = readHash(), id = +(h.map || 9);
    requestAnimationFrame(frame);
    // a hand-edited address can hold anything: a camera with a NaN in it draws nothing (move() lifts a low y above the ground)
    const place = Number.isFinite(+h.x) && Number.isFinite(+h.z) && h.x && h.z ? {x: +h.x, y: Number.isFinite(+h.y) && h.y ? +h.y : 0, z: +h.z, yaw: +h.yaw || 0, pitch: +h.pitch || -0.5} : null;
    await loadMap(S.manifest.maps.some(m => m.id === id) ? id : S.manifest.maps[0].id, place);
    loadModels().then(() => status(S.summary)).catch(e => status('Models: ' + e.message));
    setInterval(() => { if (S.stats && !S.keys.size) $('#help').dataset.stats = `${S.stats.tilesDrawn} tiles, ${S.stats.objsDrawn} objects`; }, 500);
  } catch (e) { status(e.message); console.error(e); }
})();
window.__u9 = S;
