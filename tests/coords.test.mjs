// The games' own coordinates (the sextants and In Wis) on squares whose readings are known from the games.
// Usage: node --test tests/coords.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sextant as u4} from '../js/games/u4/index.js';
import {sextant as u5} from '../js/games/u5/index.js';
import {sextant as u6} from '../js/games/u6/index.js';
import {sextant as u7bg} from '../js/games/u7bg/index.js';

test('Ultima IV: Lord British’s castle (86, 107)', () => {
  assert.equal(u4(86, 107), `latitude G'L", longitude F'G"`);
});

test('Ultima IV and V: A for 0, P for 15, high nibble first', () => {
  assert.equal(u4(0, 0), `latitude A'A", longitude A'A"`);
  assert.equal(u4(255, 255), `latitude P'P", longitude P'P"`);
  assert.equal(u5(86, 107), u4(86, 107));
});

test('Ultima VI: (307, 347) on the surface reads 2°N, 0°W', () => {
  assert.equal(u6(0)(307, 347), '2°N, 0°W');
});

test('Ultima VI: no reading underground; the gargoyles’ land counts 4 for a square', () => {
  for (const z of [1, 2, 3, 4]) assert.equal(u6(z), null);
  // (76, 90) in the gargoyles' land is (304, 360) scaled, the origin
  assert.equal(u6(5)(76, 90), '0°N, 0°W');
});

test('Ultima VII: The Black Gate (1079, 2214) reads 108 South, 14 East', () => {
  assert.equal(u7bg(1079, 2214), '108 South, 14 East');
});

test('Ultima VII: degrees round towards zero on both sides of the origin (933, 1134)', () => {
  assert.equal(u7bg(933, 1134), '0 South, 0 East');
  assert.equal(u7bg(924, 1125), '0 South, 0 East');
  assert.equal(u7bg(923, 1124), '1 North, 1 West');
});
