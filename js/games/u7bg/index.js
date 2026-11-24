// Ultima VII: The Black Gate, drawn by the Ultima VII engine (js/games/u7/engine.js).
import {makeU7} from '../u7/engine.js';

// The sextant and In Wis (Sextant.use; Exult cheat_screen.cc): degrees from (933, 1134), 10 tiles a degree,
// C's division (towards zero).
export const sextant = (x, y) => {
  const lon = Math.trunc((x - 933) / 10), lat = Math.trunc((y - 1134) / 10);
  return `${Math.abs(lat)} ${lat < 0 ? 'North' : 'South'}, ${Math.abs(lon)} ${lon < 0 ? 'West' : 'East'}`;
};

export default makeU7({coords: sextant, id: 'u7bg', title: 'Ultima VII: The Black Gate', world: 'Britannia', subtitle: 'Ultima VII: The Black Gate'});
