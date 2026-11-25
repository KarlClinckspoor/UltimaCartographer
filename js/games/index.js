// Every game the site knows. A game without a module or a page is listed but can't be opened yet.
import u0 from './u0/index.js';
import u1 from './u1/index.js';
import u2 from './u2/index.js';
import u3 from './u3/index.js';
import u4 from './u4/index.js';
import u5 from './u5/index.js';
import u6 from './u6/index.js';
import se from './se/index.js';
import md from './md/index.js';
import u7bg from './u7bg/index.js';
import u7si from './u7si/index.js';
import u8 from './u8/index.js';
import uw1 from './uw1/index.js';
import uw2 from './uw2/index.js';

// In the order of the story (the canon timeline), not of release. A game with `href` is a page of its own (the 3D
// viewers): choosing it opens that page.
export const GAMES = [
  u0,
  u1,
  u2,
  u3,
  u4,
  u5,
  u6,
  se,
  md,
  uw1,
  u7bg,
  uw2,
  u7si,
  u8,
  {id: 'u9', title: 'Ultima IX: Ascension (opens 3D view)', href: 'u9viewer/'},
];
