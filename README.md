# Ultima Cartographer

Interactive maps of the Ultima series (U0–U8, PC/GOG versions), built from the games' own
data and generators. A static site: no build step, no server code, ready for GitHub Pages.

Plan and decisions: `The Ultima Cartographer research and plan.md`.

## Run it

Any static file server from this folder, for example:

    python -m http.server 8137

then open http://127.0.0.1:8137/. (Opening `index.html` as a file doesn't work: browsers
block ES modules over `file://`.)

## Layout

| Path | What |
|---|---|
| `index.html`, `css/site.css` | The page |
| `js/app.js` | The shared viewer: game and map switcher, parameters, layers, search, square popups with links between maps, permalinks. The game module contract is documented at the top |
| `js/games/index.js` | The list of games; one without a module shows as "coming" |
| `js/games/u0/akgen.js` | Akalabeth's generators (world, dungeon levels, stats), ported from `u0-decompiled/tools/akmap.py` |
| `js/games/u0/index.js` | Akalabeth's maps: drawing, popups, side panel |
| `js/games/u1/u1gen.js` | Ultima I's dungeon generator (OUT.EXE `mkdung`, the `rndrange` RNG) |
| `js/games/u1/index.js` | Ultima I's maps: the world, 32 towns, 8 castles, 36 dungeons × 10 levels |
| `data/u1/` | Ultima I data extracted from the game files by `tools/extract-u1.mjs` |
| `js/games/u2/index.js` | Ultima II's maps: 5 eras of Earth and 9 planets, their towns, castles, towers and dungeons |
| `data/u2/` | Ultima II data extracted by `tools/extract-u2.mjs` |
| `js/games/u3/index.js` | Ultima III's maps: Sosaria, Ambrosia, 12 townes and castles, 7 dungeons × 8 levels |
| `js/games/u4/index.js` | Ultima IV's maps: Britannia, 16 castles, townes and villages (and LB's upper floor), 8 dungeons × 8 levels and their rooms |
| `data/u3/`, `data/u4/` | Extracted by `tools/extract-u3.mjs` and `tools/extract-u4.mjs` |
| `js/lib/draw.js` | Drawing helpers shared by game modules (U2 onwards) |
| `tools/png.mjs` | The PNG writer the newer extractors share |
| `tools/` | Extractors and checks that need the game files or DOSBox |
| `vendor/leaflet` | Leaflet 1.9.4 (BSD-2-Clause, see its LICENSE) |
| `tests/` | Checks |

## URLs

`#<game>/<map>?<params>&view=<x>,<y>,<zoom>`, in game coordinates. For example
`#u0/level-3?lucky=42&play=5` is dungeon level 3 for lucky number 42 at level of play 5.

## Game data

Games drawn from their own files have an extractor that writes `data/<game>/`. Run it again
only if the extractor changes:

    node tools/extract-u1.mjs ../u1-decompiled/gamedata
    node tools/extract-u2.mjs "C:/GOG Games/Ultima 2" ../u2-decompiled

    node tools/extract-u3.mjs "C:/GOG Games/Ultima 3"
    node tools/extract-u4.mjs "C:/GOG Games/Ultima 4" ../u4-decompiled-port

Ultima IV reads its game data from the GOG folder and the tables the game keeps in code (tile
names, place names and squares, moongates, mantras, shop names and counter rows) from the port's C
source. Ultima II needs the installed GOG folder: u2-decompiled's `gamedata` copy lacks most planet maps
(they ship with lower-case names). Its tile bitmaps come from `u2-decompiled/src/U2DATA.ASM` and
are checked byte for byte against `ULTIMAII.EXE`.

## Tests

    node tests/u0-akmap.test.mjs [path/to/u0-decompiled]
    node tests/u1-dungeon.test.mjs
    node tests/u2-data.test.mjs
    node tests/u3-data.test.mjs
    node tests/u4-data.test.mjs

The first compares the Akalabeth generators with `akmap.py` (12 lucky numbers: world, stats,
levels 1–15 from three arrival squares); it needs Python and a `u0-decompiled` checkout (default
`../u0-decompiled`). The second compares the Ultima I generator with levels dumped from the
running game (`tests/fixtures/`), which `tools/verify-u1-dungeon.py` makes through
u1-decompiled's DOSBox harness. The third checks the Ultima II extraction against facts
u2-decompiled's MECHANICS.md states (which maps exist, tri-lithium chest counts, the shared Earth
maze, Pluto's dungeon, talk strings). The U3 and U4 tests do the same against their
decompilations' docs: U3's dungeon cell counts, rods, time vision and locked doors; U4's moongates,
each place standing on a tile of its kind, altars, rooms, talk records and mantras.

## Akalabeth notes

- Generators from the 1997 PC port (DJGPP `random()`); the Apple II original's maps differ.
- Read from the code and checked against `akmap.py`, but not yet confirmed in DOSBox.
- Monster squares depend on the square you arrive on. Arriving by ladder always gives the same
  squares; the "Arrive on this square" action covers amulet ladders.

## Ultima I notes

- PC/GOG version (the 1986 remake). Tiles are the Tandy/EGA 16-colour set.
- Dungeon walls, doors, secret doors, force fields and ladders come from the character's seed
  (offset 0x32 of `PLAYERn.U1`, readable in the page) and the entrance's square. Checked against
  the running game for two characters, all 10 levels. Chests, coffins and monsters are placed
  after a re-seed from the clock, so the page lists what can appear instead of placing them.
- Towns share 8 layouts and castles 2, as in the game; each town's page shows its own name and shops.

## Ultima II notes

- PC/GOG version, CGA palette 1 as the game uses.
- Every map is fixed in the files, towers and dungeons included, so it is the same for everyone.
- Earth's time doors are shown at their four spots per era with where each leads; which spot is
  open depends on the turn count. Townspeople show their talk lines, and merchants their shop
  (which the game picks by the quarter of the map).

## Ultima III notes

- PC/GOG version, CGA palette 1 (low intensity) as the game sets it.
- Merchants show their service. The game picks it from the row the party stands on when
  transacting (and always the Equine Emporium when facing west), so the page works it out from
  each merchant's counter. The `LCB` towne is named after the sign in its square.
- Dungeon events are shown with what they do; fountains and rods depend on their column.

## Ultima IV notes

- PC/GOG version, EGA tiles. Britannia is drawn as 64 images of 32 × 32 squares.
- Every townsperson's whole conversation is in their popup. Shopkeepers show their shop's name and
  keeper (from the counter-row table the game uses). Squares where Search finds an item are ringed.
- Dungeon rooms open as their own maps, with foes and triggers. The Shrine of Spirituality has no
  square: in the game's table it shares Humility's, and Enter finds Humility.

## Credits

A fan project, not affiliated with Origin Systems or Electronic Arts. The idea of an
interactive Ultima map comes from kxmode's Ultima VII map.
