// Ultima VII Part Two: Serpent Isle, drawn by the Ultima VII engine (js/games/u7/engine.js), with the names the
// Locate spell (In Wis) gives each region, written over the middle of the region: each label's box is centred on
// the centroid of the tiles the game counts as that region; a region in several pieces (islands) gets a label on
// each, sized by the island.
import {makeU7} from '../u7/engine.js';
import {esc, g, swatch} from '../../lib/draw.js';
import {NAMES, UNNAMED, regionPieces, labelPoint, inWis} from './regions.js';

let labels = null;
function regionLabels() {
  if (labels) return labels;
  let out = '';
  // one label for each separate piece (island) of a region, however small
  for (const r of regionPieces(1)) {
    const named = NAMES[r.id], text = named || UNNAMED[r.id];
    if (!text) continue;
    // the size follows the island's: bigger islands, bigger names (at most 56 tiles high), and never wider than the
    // island, so a narrow dungeon room in the corner gets a small name
    const fit = (r.box[2] - r.box[0] + 1) / (text.length * .56 + .8);
    const size = Math.max(1, Math.min(56, Math.sqrt(r.tiles) / 7, fit)), w = text.length * size * .56 + size * .8, h = size * 1.45;
    // the label's box stays on the map (Dream World's pieces lie along its east and west edges)
    let [lx, ly] = labelPoint(r);
    lx = Math.max(w / 2 + 2, Math.min(3070 - w / 2, lx)); ly = Math.max(h / 2 + 2, Math.min(3070 - h / 2, ly));
    const x = lx.toFixed(1), y = ly.toFixed(1);
    out += `<g opacity="${named ? 1 : .6}"><rect x="${(lx - w / 2).toFixed(1)}" y="${(ly - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(size * .3).toFixed(1)}" fill="#14130f" fill-opacity=".72" stroke="#e0b354" stroke-opacity=".55" stroke-width="${(size * .06).toFixed(2)}"/>` +
      `<text x="${x}" y="${y}" dy=".35em" text-anchor="middle" font-family="Georgia, serif" font-size="${size.toFixed(1)}" font-weight="600"${named ? '' : ' font-style="italic"'} fill="#f2e3b8">${esc(text)}</text></g>`;
  }
  return (labels = g('regions', out));
}

export default makeU7({id: 'u7si', title: 'Ultima VII: Serpent Isle', world: 'Serpent Isle', subtitle: 'Ultima VII Part Two',
  coords: (x, y) => `In Wis: ${inWis(x, y)}`,
  overlay: {svg: regionLabels, layers: [{id: 'regions', name: 'Region names (from the Locate spell)', swatch: swatch('<rect x=".1" y=".3" width=".8" height=".4" rx=".1" fill="#14130f" stroke="#e0b354" stroke-width=".06"/>')}]},
});
