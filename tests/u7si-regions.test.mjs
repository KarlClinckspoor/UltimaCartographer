// Serpent Isle's regions (js/games/u7si/regions.js): what In Wis says on known squares, and every region label
// placed inside its own region.
// Usage: node --test tests/u7si-regions.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {regionAt, inWis, regionGrid, regionPieces, labelPoint, NAMES, UNNAMED, LOST} from '../js/games/u7si/regions.js';

const N = 3072;

test('known squares', () => {
  assert.equal(regionAt(2300, 1900), 14);
  assert.equal(inWis(2300, 1900), 'Moonshade');
  assert.equal(regionAt(1079, 2214), 65535);
  assert.equal(inWis(1079, 2214), 'the Wilderness');
});

test('bounds are strict: a rectangle’s edge squares are not in it', () => {
  // Moonshade is 2100 < x < 2494, 1723 < y < 2126 and nothing before it in WhereIs_i covers this corner
  assert.equal(regionAt(2101, 1724), 14);
  assert.notEqual(regionAt(2100, 1724), 14);
  assert.notEqual(regionAt(2101, 1723), 14);
});

test('left over: the Ice Plains north of y 1024, the Wilderness south of it', () => {
  // the north-west corner is in no rectangle
  assert.equal(regionAt(1, 1), 8);
  assert.equal(inWis(1, 1), 'Ice Plains');
  // a region with no name in LocateSpell_i
  assert.equal(regionAt(600, 2500), 27);
  assert.equal(inWis(600, 2500), LOST);
});

test('every square has a region', () => {
  const g = regionGrid();
  assert.equal(g.length, N * N);
  assert.ok(g.every(v => v !== 254));
});

test('every labelled piece’s label point is inside its piece’s region', () => {
  const g = regionGrid(), pieces = regionPieces(1).filter(r => NAMES[r.id] || UNNAMED[r.id]);
  assert.ok(pieces.length > 30, `${pieces.length} pieces`);
  const bad = [];
  for (const r of pieces) {
    const [x, y] = labelPoint(r);
    if (g[Math.floor(y) * N + Math.floor(x)] !== r.id) bad.push(`${NAMES[r.id] || UNNAMED[r.id]} at ${x}, ${y}`);
  }
  assert.deepEqual(bad, []);
});
