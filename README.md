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

## Tests

    node tests/u0-akmap.test.mjs [path/to/u0-decompiled]
    node tests/u1-dungeon.test.mjs

The first compares the Akalabeth generators with `akmap.py` (12 lucky numbers: world, stats,
levels 1–15 from three arrival squares); it needs Python and a `u0-decompiled` checkout (default
`../u0-decompiled`). The second compares the Ultima I generator with levels dumped from the
running game (`tests/fixtures/`), which `tools/verify-u1-dungeon.py` makes through
u1-decompiled's DOSBox harness.

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

## Credits

A fan project, not affiliated with Origin Systems or Electronic Arts. The idea of an
interactive Ultima map comes from kxmode's Ultima VII map.
