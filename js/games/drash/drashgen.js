// Escape from Mt. Drash (VIC-20, 1983): the level generator, ported from mtdrash's C core
// (src/core/maze.c, lines 10000-10095, 11000-11010 and 63000-63040 of the BASIC program DRASH2) and the part
// of its byte-level Commodore BASIC float model (src/core/cbmfloat.c) that RND(1), *4, INT() and >.8 need.
// The float routines keep the ROM's zero page and carry between calls, as the C does, so the RND sequence
// and every comparison come out bit for bit as on the VIC-20.

// ---------- Commodore BASIC V2 floats (a port of cbmfloat.c) ----------

const RES = 0x26, OLDOV = 0x56, FACEXP = 0x61, FACHO = 0x62, FACMOH = 0x63, FACMO = 0x64, FACLO = 0x65, FACSGN = 0x66,
  BITS = 0x68, ARGEXP = 0x69, ARGHO = 0x6A, ARGMOH = 0x6B, ARGMO = 0x6C, ARGLO = 0x6D, ARGSGN = 0x6E, ARISGN = 0x6F,
  FACOV = 0x70, RNDX = 0x8B;

export const BOOT_SEED = [0x80, 0x4F, 0xC7, 0x52, 0x58];   // the BASIC ROM's RND seed at power-on

class Fp {
  constructor(seed = BOOT_SEED) { this.z = new Uint8Array(256); this.c = 0; this.y = 0; this.z.set(seed, RNDX); }
  seed() { return [...this.z.subarray(RNDX, RNDX + 5)]; }

  adc(a, v) { const r = a + v + this.c; this.c = r >> 8; return r & 255; }
  sbc(a, v) { const r = a - v - (1 - this.c); this.c = r >= 0 ? 1 : 0; return r & 255; }
  asl(v) { this.c = v >> 7; return (v << 1) & 255; }
  lsr(v) { this.c = v & 1; return v >> 1; }
  rol(v) { const r = ((v << 1) | this.c) & 255; this.c = v >> 7; return r; }
  ror(v) { const r = (v >> 1) | (this.c << 7); this.c = v & 1; return r; }

  shiftBits(x, a, y, enterB0) {               // $D9A6/$D9B0
    const Z = this.z;
    let first = !enterB0;
    for (;;) {
      if (first) {
        Z[x + 1] = this.asl(Z[x + 1]);
        if (this.c) Z[x + 1] = (Z[x + 1] + 1) & 255;
        Z[x + 1] = this.ror(Z[x + 1]);
        Z[x + 1] = this.ror(Z[x + 1]);
      }
      first = true;
      Z[x + 2] = this.ror(Z[x + 2]);
      Z[x + 3] = this.ror(Z[x + 3]);
      Z[x + 4] = this.ror(Z[x + 4]);
      a = this.ror(a);
      y = (y + 1) & 255;
      if (y === 0) break;
    }
    this.c = 0; this.y = y;
    return a;
  }

  shiftRight(x, a, enter985) {                 // $D983/$D985/$D999
    const Z = this.z;
    let skip = !enter985;
    for (;;) {
      if (!skip) {
        Z[FACOV] = Z[x + 4]; Z[x + 4] = Z[x + 3]; Z[x + 3] = Z[x + 2]; Z[x + 2] = Z[x + 1]; Z[x + 1] = Z[BITS];
      }
      skip = false;
      a = this.adc(a, 8);
      if (!((a & 0x80) || a === 0)) break;
    }
    a = this.sbc(a, 8);
    const y = a;
    a = Z[FACOV];
    if (this.c) { this.c = 0; this.y = y; return a; }
    return this.shiftBits(x, a, y, false);
  }

  zeroFac() { this.z[FACEXP] = 0; this.z[FACSGN] = 0; }
  incMantissa() {
    const Z = this.z;
    if ((Z[FACLO] = (Z[FACLO] + 1) & 255)) return true;
    if ((Z[FACMO] = (Z[FACMO] + 1) & 255)) return true;
    if ((Z[FACMOH] = (Z[FACMOH] + 1) & 255)) return true;
    return (Z[FACHO] = (Z[FACHO] + 1) & 255) !== 0;
  }
  complementMantissa() {
    const Z = this.z;
    for (const k of [FACHO, FACMOH, FACMO, FACLO, FACOV]) Z[k] ^= 0xFF;
    if ((Z[FACOV] = (Z[FACOV] + 1) & 255)) return;
    this.incMantissa();
  }
  negateFac() { this.z[FACSGN] ^= 0xFF; this.complementMantissa(); }
  carryIntoExponent() {
    const Z = this.z;
    if (!this.c) return;
    if ((Z[FACEXP] = (Z[FACEXP] + 1) & 255) === 0) throw new Error('?OVERFLOW');
    for (const k of [FACHO, FACMOH, FACMO, FACLO, FACOV]) Z[k] = this.ror(Z[k]);
  }
  normalize() {                                 // $D8D7
    const Z = this.z;
    let a = 0;
    this.c = 0;
    while (Z[FACHO] === 0) {
      Z[FACHO] = Z[FACMOH]; Z[FACMOH] = Z[FACMO]; Z[FACMO] = Z[FACLO]; Z[FACLO] = Z[FACOV]; Z[FACOV] = 0;
      a = this.adc(a, 8);
      this.c = a >= 0x20 ? 1 : 0;
      if (a === 0x20) { this.zeroFac(); return; }
    }
    while (!(Z[FACHO] & 0x80)) {
      a = this.adc(a, 1);
      Z[FACOV] = this.asl(Z[FACOV]);
      Z[FACLO] = this.rol(Z[FACLO]);
      Z[FACMO] = this.rol(Z[FACMO]);
      Z[FACMOH] = this.rol(Z[FACMOH]);
      Z[FACHO] = this.rol(Z[FACHO]);
    }
    this.c = 1;
    a = this.sbc(a, Z[FACEXP]);
    if (this.c) { this.zeroFac(); return; }
    a ^= 0xFF;
    a = this.adc(a, 1);
    Z[FACEXP] = a;
    this.carryIntoExponent();
  }
  signNormalize() { if (!this.c) this.negateFac(); this.normalize(); }

  round() {                                     // $DC1B
    const Z = this.z;
    if (Z[FACEXP] === 0) return;
    Z[FACOV] = this.asl(Z[FACOV]);
    if (!this.c) return;
    if (this.incMantissa()) return;
    this.carryIntoExponent();
  }
  movfm(s) {                                    // $DBA2
    const Z = this.z;
    Z[FACLO] = s[4]; Z[FACMO] = s[3]; Z[FACMOH] = s[2]; Z[FACSGN] = s[1]; Z[FACHO] = s[1] | 0x80; Z[FACEXP] = s[0]; Z[FACOV] = 0;
  }
  movmf(d, at) {                                // $DBD4, into this.z at offset `at`
    const Z = this.z;
    this.round();
    d[at + 4] = Z[FACLO]; d[at + 3] = Z[FACMO]; d[at + 2] = Z[FACMOH];
    d[at + 1] = (Z[FACSGN] | 0x7F) & Z[FACHO]; d[at] = Z[FACEXP];
    Z[FACOV] = 0;
  }
  conupk(s) {                                   // $DA8C
    const Z = this.z;
    Z[ARGLO] = s[4]; Z[ARGMO] = s[3]; Z[ARGMOH] = s[2]; Z[ARGSGN] = s[1];
    Z[ARISGN] = s[1] ^ Z[FACSGN]; Z[ARGHO] = s[1] | 0x80; Z[ARGEXP] = s[0];
  }
  movfa() { const Z = this.z; Z[FACSGN] = Z[ARGSGN]; for (let x = 5; x >= 1; x--) Z[0x60 + x] = Z[0x68 + x]; Z[FACOV] = 0; }
  push() {                                      // $CE33
    const Z = this.z;
    const sgn = Z[FACSGN];
    this.round();
    return {sgn, exp: Z[FACEXP], m: [Z[FACHO], Z[FACMOH], Z[FACMO], Z[FACLO]]};
  }
  pullArg(s) {                                  // $CE66
    const Z = this.z;
    Z[ARGEXP] = s.exp; Z[ARGHO] = s.m[0]; Z[ARGMOH] = s.m[1]; Z[ARGMO] = s.m[2]; Z[ARGLO] = s.m[3];
    Z[ARGSGN] = s.sgn; Z[ARISGN] = s.sgn ^ Z[FACSGN];
  }
  loadFac6(v) { const Z = this.z; [Z[FACEXP], Z[FACHO], Z[FACMOH], Z[FACMO], Z[FACLO], Z[FACSGN], Z[FACOV]] = v; }

  faddt() {                                     // $D86A
    const Z = this.z;
    let a, x, y;
    if (Z[FACEXP] === 0) { this.movfa(); return; }
    Z[OLDOV] = Z[FACOV];
    x = ARGEXP; a = Z[ARGEXP]; y = a;
    if (a === 0) return;
    this.c = 1;
    a = this.sbc(a, Z[FACEXP]);
    if (a !== 0) {
      if (!this.c) Z[FACOV] = 0;
      else { Z[FACEXP] = y; Z[FACSGN] = Z[ARGSGN]; a ^= 0xFF; a = this.adc(a, 0); Z[OLDOV] = 0; x = FACEXP; }
      this.c = a >= 0xF9 ? 1 : 0;
      if ((a - 0xF9) & 0x80) a = this.shiftRight(x, a, false);
      else { y = a; a = Z[FACOV]; Z[x + 1] = this.lsr(Z[x + 1]); a = this.shiftBits(x, a, y, true); }
    }
    if (Z[ARISGN] & 0x80) {
      const yy = x === ARGEXP ? FACEXP : ARGEXP;
      this.c = 1;
      a ^= 0xFF;
      a = this.adc(a, Z[OLDOV]);
      Z[FACOV] = a;
      Z[FACLO] = this.sbc(Z[yy + 4], Z[x + 4]);
      Z[FACMO] = this.sbc(Z[yy + 3], Z[x + 3]);
      Z[FACMOH] = this.sbc(Z[yy + 2], Z[x + 2]);
      Z[FACHO] = this.sbc(Z[yy + 1], Z[x + 1]);
      if (!this.c) this.negateFac();
      this.normalize();
      return;
    }
    a = this.adc(a, Z[OLDOV]);
    Z[FACOV] = a;
    Z[FACLO] = this.adc(Z[FACLO], Z[ARGLO]);
    Z[FACMO] = this.adc(Z[FACMO], Z[ARGMO]);
    Z[FACMOH] = this.adc(Z[FACMOH], Z[ARGMOH]);
    Z[FACHO] = this.adc(Z[FACHO], Z[ARGHO]);
    this.carryIntoExponent();
  }

  muldiv() {                                    // $DAB7
    const Z = this.z;
    let a = Z[ARGEXP];
    if (a === 0) { this.zeroFac(); return false; }
    this.c = 0;
    a = this.adc(a, Z[FACEXP]);
    if (!this.c) { if (!(a & 0x80)) { this.zeroFac(); return false; } }
    else { if (a & 0x80) throw new Error('?OVERFLOW'); this.c = 0; }
    a = this.adc(a, 0x80);
    Z[FACEXP] = a;
    Z[FACSGN] = a === 0 ? 0 : Z[ARISGN];
    return true;
  }
  multByte(a, alwaysBits) {                     // $DA59/$DA5E
    const Z = this.z;
    if (!alwaysBits && a === 0) { this.shiftRight(RES - 1, a, true); return; }
    a = this.lsr(a);
    a |= 0x80;
    do {
      const y = a;
      if (this.c) {
        this.c = 0;
        Z[0x29] = this.adc(Z[0x29], Z[ARGLO]);
        Z[0x28] = this.adc(Z[0x28], Z[ARGMO]);
        Z[0x27] = this.adc(Z[0x27], Z[ARGMOH]);
        Z[0x26] = this.adc(Z[0x26], Z[ARGHO]);
      }
      Z[0x26] = this.ror(Z[0x26]); Z[0x27] = this.ror(Z[0x27]); Z[0x28] = this.ror(Z[0x28]); Z[0x29] = this.ror(Z[0x29]);
      Z[FACOV] = this.ror(Z[FACOV]);
      a = this.lsr(y);
    } while (a !== 0);
  }
  fmultt() {                                    // $DA2B
    const Z = this.z;
    if (Z[FACEXP] === 0) return;
    if (!this.muldiv()) return;
    Z[0x26] = Z[0x27] = Z[0x28] = Z[0x29] = 0;
    this.multByte(Z[FACOV], false);
    this.multByte(Z[FACLO], false);
    this.multByte(Z[FACMO], false);
    this.multByte(Z[FACMOH], false);
    this.multByte(Z[FACHO], true);
    Z[FACHO] = Z[0x26]; Z[FACMOH] = Z[0x27]; Z[FACMO] = Z[0x28]; Z[FACLO] = Z[0x29];
    this.normalize();
  }

  sign() { const Z = this.z; return Z[FACEXP] === 0 ? 0 : (Z[FACSGN] & 0x80) ? 0xFF : 1; }
  fcomp(m) {                                    // $DC5B
    const Z = this.z;
    if (m[0] === 0) return this.sign();
    if ((m[1] ^ Z[FACSGN]) & 0x80) return (Z[FACSGN] & 0x80) ? 0xFF : 1;
    if (m[0] !== Z[FACEXP]) this.c = m[0] >= Z[FACEXP] ? 1 : 0;
    else if (((m[1] | 0x80) & 255) !== Z[FACHO]) this.c = ((m[1] | 0x80) & 255) >= Z[FACHO] ? 1 : 0;
    else if (m[2] !== Z[FACMOH]) this.c = m[2] >= Z[FACMOH] ? 1 : 0;
    else if (m[3] !== Z[FACMO]) this.c = m[3] >= Z[FACMO] ? 1 : 0;
    else {
      this.c = 0x7F >= Z[FACOV] ? 1 : 0;
      if (this.sbc(m[4], Z[FACLO]) === 0) return 0;
    }
    let a = Z[FACSGN];
    if (this.c) a ^= 0xFF;
    return (a & 0x80) ? 0xFF : 1;
  }
  qint() {                                      // $DC9B
    const Z = this.z;
    let a = Z[FACEXP];
    if (a === 0) { Z[FACHO] = Z[FACMOH] = Z[FACMO] = Z[FACLO] = 0; this.y = 0; return; }
    this.c = 1;
    a = this.sbc(a, 0xA0);
    if (Z[FACSGN] & 0x80) { const x = a; Z[BITS] = 0xFF; this.complementMantissa(); a = x; }
    this.c = a >= 0xF9 ? 1 : 0;
    if ((a - 0xF9) & 0x80) { this.shiftRight(FACEXP, a, false); Z[BITS] = this.y; return; }
    const y = a;
    a = Z[FACSGN] & 0x80;
    Z[FACHO] = this.lsr(Z[FACHO]);
    a |= Z[FACHO];
    Z[FACHO] = a;
    this.shiftBits(FACEXP, a, y, true);
    Z[BITS] = this.y;
  }
  int() {                                       // $DCCC
    const Z = this.z;
    if (Z[FACEXP] >= 0xA0) return;
    this.qint();
    const y = this.y;
    Z[FACOV] = y;
    let a = Z[FACSGN];
    Z[FACSGN] = y;
    a ^= 0x80;
    this.rol(a);
    Z[FACEXP] = 0xA0;
    Z[0x07] = Z[FACLO];
    this.signNormalize();
  }
  toInt16() {                                   // truncating, on a copy (as cbm_to_int16)
    const t = new Fp(); t.z.set(this.z); t.c = this.c; t.y = this.y;
    t.qint();
    const v = (t.z[FACMO] << 8) | t.z[FACLO];
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  rnd() {                                       // RND(1), $E0BB
    const Z = this.z;
    this.movfm(Z.subarray(RNDX, RNDX + 5));
    this.conupk([0x98, 0x35, 0x44, 0x7A, 0x00]); this.fmultt();
    this.conupk([0x68, 0x28, 0xB1, 0x46, 0x00]); this.faddt();
    let t = Z[FACLO]; Z[FACLO] = Z[FACHO]; Z[FACHO] = t;
    t = Z[FACMOH]; Z[FACMOH] = Z[FACMO]; Z[FACMO] = t;
    Z[FACSGN] = 0;
    Z[FACOV] = Z[FACEXP];
    Z[FACEXP] = 0x80;
    this.normalize();
    this.movmf(Z, RNDX);
  }
}

// Literals as BASIC's parser leaves them in FAC (mtdrash src/core/literals.h).
const L_4 = [0x83, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00];
const L_POINT8 = [0x80, 0xCC, 0xCC, 0xCC, 0xCC, 0x00, 0x80];

// INT(RND(1)*4): RND, then the expression evaluator's push, literal, pull, multiply, INT.
function rnd4(fp) {
  fp.rnd();
  const s = fp.push(); fp.loadFac6(L_4); fp.pullArg(s); fp.fmultt();
  fp.int();
  return fp.toInt16();
}
// RND(1)>.8
function rndOver8(fp) {
  fp.rnd();
  const s = fp.push(); fp.loadFac6(L_POINT8); fp.pullArg(s);
  const Z = fp.z;
  const m = [Z[ARGEXP], (Z[ARGSGN] | 0x7F) & Z[ARGHO], Z[ARGMOH], Z[ARGMO], Z[ARGLO]];
  return fp.fcomp(m) === 0xFF;
}

// ---------- the level ----------

export const WALL = 0, OPEN = 1, SEEN = 2, KEY = 3, EXIT = 4;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

// Z%(x, y) for x, y in 0..12 as the generator leaves it (before the start, keys and exit are marked), and
// the monsters. `fp` carries the RND state in and out; `s` is the BASIC variable S (it makes no difference:
// the first carve from (4,6) always sets it to 1 before it is read).
function makeMaze(fp, lv, s = 0) {
  const z = Array.from({length: 13}, (_, x) => Array.from({length: 13}, (_, y) => (x === 0 || y === 0 || x === 12 || y === 12) ? OPEN : WALL));
  if (lv === 15) {                              // 11000-11010
    for (let i = 2; i <= 10; i++) for (let j = 2; j <= 10; j += 2) z[i][j] = OPEN;
    z[2][5] = z[2][9] = z[10][3] = z[10][7] = OPEN;
    return z;
  }
  let px = 4, py = 6, f;
  z[px][py] = OPEN;
  let st = 'check';
  for (;;) {
    if (st === 'check') {                       // 10020
      st = z[px - 2][py] + z[px + 2][py] + z[px][py - 2] + z[px][py + 2] < 4 ? 'carve' : 'restart';
    }
    if (st === 'restart') {                     // 10030
      if (s === 1) { px = 0; py = 2; s = 0; }
      st = 'scan';
    }
    if (st === 'scan') {                        // 10040-10060
      px += 2;
      if (px > 10) { px = 2; py += 2; if (py > 10) return z; }
      st = z[px][py] !== OPEN ? 'scan' : 'check';
      continue;
    }
    // 10070-10090
    do f = rnd4(fp); while (z[px + 2 * DX[f]][py + 2 * DY[f]] === OPEN);
    z[px + DX[f]][py + DY[f]] = OPEN;
    px += 2 * DX[f]; py += 2 * DY[f];
    z[px][py] = OPEN;
    s = 1;
    st = rndOver8(fp) ? 'restart' : 'check';
  }
}

function placeMonsters(fp, ct) {                // 63000-63040
  const mons = [];
  for (let i = 0; i <= ct; i++) {
    let mx = rnd4(fp) * 2 + 2;
    const my = rnd4(fp) * 2 + 2;
    if (mx === 2 && my === 2) mx = 4;
    mons.push([mx, my]);
  }
  return mons;
}

const hex = b => b.map(v => v.toString(16).padStart(2, '0')).join('');
const unhex = h => [0, 1, 2, 3, 4].map(i => parseInt(h.substr(2 * i, 2), 16));

// One level from a given RND seed (5 bytes or 10 hex digits), as the game makes it at line 10000:
// {raw: Z% straight from the generator, z: with keys, start and exit marked, mons, ct, draws, seedBefore, seedAfter}.
export function level(lv, seed = BOOT_SEED) {
  const fp = new Fp(typeof seed === 'string' ? unhex(seed) : seed);
  const before = fp.seed();
  let draws = 0;
  const rnd0 = fp.rnd.bind(fp);
  fp.rnd = () => { draws++; rnd0(); };
  const raw = makeMaze(fp, lv);
  const ct = Math.floor((Math.min(lv, 15) + 1) / 2);
  const mons = placeMonsters(fp, ct);
  const z = raw.map(c => c.slice());
  if (lv > 4 && lv < 15) z[2][10] = z[10][2] = KEY;   // 10120
  z[10][10] = SEEN; z[2][2] = EXIT;                    // 10140
  return {lv, raw, z, mons, ct, draws, seedBefore: hex(before), seedAfter: hex(fp.seed())};
}

// The RND seed after n draws from `seed`.
export function advance(seed, n) {
  const fp = new Fp(typeof seed === 'string' ? unhex(seed) : seed);
  for (let i = 0; i < n; i++) fp.rnd();
  return hex(fp.seed());
}

// The levels of a game started from power-on in which nothing else draws a random number: no fights, no
// teleports (each fight draws one number for the monster's picture and one per round; a teleport two).
// chainSeeds(n)[lv] is the seed level lv starts from; chainDraws[lv] the draws since power-on.
const chain = {seeds: [null, hex(BOOT_SEED)], draws: [null, 0]};
export function chainStart(lv) {
  while (chain.seeds.length <= lv) {
    const k = chain.seeds.length - 1, l = level(k, chain.seeds[k]);
    chain.seeds.push(l.seedAfter); chain.draws.push(chain.draws[k] + l.draws);
  }
  return {seed: chain.seeds[lv], draws: chain.draws[lv]};
}
