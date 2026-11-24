# Ultima Cartographer

Interactive maps of the Ultima series (U0–U8, PC/GOG versions), built from the games' own
data and generators. A static site: no build step, no server code, ready for GitHub Pages.

Plan and decisions: `The Ultima Cartographer research and plan.md`.

## Run it

Any static file server from this folder, for example:

    python tools/serve.py 8137

then open http://127.0.0.1:8137/. (`python -m http.server` works too, but on Windows it refuses
connections when the browser asks for many files at once; `tools/serve.py` is the same server
with a longer queue.) (Opening `index.html` as a file doesn't work: browsers
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
| `js/games/u5/index.js` | Ultima V's maps: Britannia, the Underworld, 32 settlements floor by floor, 8 dungeons × 8 levels and their rooms |
| `js/games/u6/engine.js` | The Ultima VI engine's maps (Ultima VI, The Savage Empire, Martian Dreams): drawn in the browser a grid tile at a time from the game's chunk map, objects and people |
| `js/games/u7/engine.js` | The Ultima VII engine's world (The Black Gate, Serpent Isle): 3072 × 3072 tiles drawn as you pan, with a height cutoff and people by the hour |
| `js/games/u7bg/`, `js/games/u7si/` | Each game's name for the engine |
| `js/games/u8/index.js` | Ultima VIII: the 45 maps that have items, drawn as you pan from u8edit's web export, with a roof cut, teleport links and a graph of how the maps connect |
| `data/u8/` | Written by u8edit (`--export-web`, see `docs/u8-export.md`); checked by `tools/check-u8-export.mjs` |
| `js/games/uw/engine.js`, `js/games/uw1/`, `js/games/uw2/` | Ultima Underworld I and II top down: every level from the Underworld editor's export, with teleports and stairs as links |
| `data/uw1/`, `data/uw2/` | Written by the Underworld editor (`export-web`, see `docs/uw-export.md`); checked by `tools/check-uw-export.mjs` |
| `uwviewer/` | The Underworld levels in 3D (WebGL2), from the same export; open `/uwviewer/` |
| `u9viewer/` | Ultima IX in 3D, from the U9 editor's export (`u9viewer/data`); open `/u9viewer/` |
| `js/games/u6/`, `js/games/se/`, `js/games/md/` | Each game's tables for the engine (level names, entrances, readable objects) |
| `data/u3/`, `data/u4/`, `data/u5/` | Extracted by `tools/extract-u3.mjs`, `tools/extract-u4.mjs` and `tools/extract-u5.mjs` |
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
    node tools/extract-u5.mjs "C:/GOG Games/Ultima 5"
    node tools/extract-u6.mjs u6 "C:/GOG Games/Ultima 6" ../u6-decompiled/dialogue.json
    node tools/extract-u6.mjs se "C:/GOG Games/The Savage Empire/SAVAGE" ../u6se-decompiled/dialogue.json
    node tools/extract-u6.mjs md "C:/GOG Games/Martian Dreams/MARTIAN" ../u6md-decompiled/dialogue.json
    node tools/extract-u7.mjs u7bg "C:/GOG Games/Ultima 7/STATIC"
    node tools/extract-u7.mjs u7si "C:/GOG Games/Ultima 7 - Serpent Isle/STATIC"

Ultima VIII is baked by u8edit (the editor in `../U8/Ultima8_Decomp`), not by a script here. From Git
Bash (keep the redirect: u8edit is a GUI program and its report is lost without it):

    "../U8/Ultima8_Decomp/build/editor/u8edit.exe" --data "../U8/gamedata/ENGLISH"       --export-web "$(pwd)/data/u8" > u8-export-report.txt 2>&1
    node tools/check-u8-export.mjs

Ultima IV reads its game data from the GOG folder and the tables the game keeps in code (tile
names, place names and squares, moongates, mantras, shop names and counter rows) from the port's C
source. Ultima II needs the installed GOG folder: u2-decompiled's `gamedata` copy lacks most planet maps
(they ship with lower-case names). Its tile bitmaps come from `u2-decompiled/src/U2DATA.ASM` and
are checked byte for byte against `ULTIMAII.EXE`. Ultima V needs only the game folder: the tables it
keeps in code (place names and squares, shops, hidden items, shrines) are read from `DATA.OVL`, at the
offsets u5d's `ultima.c` gives them.

## Tests

    node tests/u0-akmap.test.mjs [path/to/u0-decompiled]
    node tests/u1-dungeon.test.mjs
    node tests/u2-data.test.mjs
    node tests/u3-data.test.mjs
    node tests/u4-data.test.mjs
    node tests/u5-data.test.mjs
    node tests/u6-data.test.mjs
    node tests/u7-data.test.mjs

The first compares the Akalabeth generators with `akmap.py` (12 lucky numbers: world, stats,
levels 1–15 from three arrival squares); it needs Python and a `u0-decompiled` checkout (default
`../u0-decompiled`). The second compares the Ultima I generator with levels dumped from the
running game (`tests/fixtures/`), which `tools/verify-u1-dungeon.py` makes through
u1-decompiled's DOSBox harness. The third checks the Ultima II extraction against facts
u2-decompiled's MECHANICS.md states (which maps exist, tri-lithium chest counts, the shared Earth
maze, Pluto's dungeon, talk strings). The U3 and U4 tests do the same against their
decompilations' docs: U3's dungeon cell counts, rods, time vision and locked doors; U4's moongates,
each place standing on a tile of its kind, altars, rooms, talk records and mantras; U5's places and
shrines on their tiles, dungeons opening into the Underworld, floors per file, shops, signs and that
every townsperson's dialog number has a script. The U6 test covers all three engine games: file
layouts, map bounds, schedules, Lord British's day, the moonstones, and that every way down from
Britannia leads to a ladder whose way back returns to the same square.

## Akalabeth notes

- Generators from the 1997 PC port (DJGPP `random()`); the Apple II original's maps differ.
- Read from the code and checked against `akmap.py`, but not yet confirmed in DOSBox.
- Monster squares depend on the square you arrive on. Arriving by ladder always gives the same
  squares; the "Arrive on this square" action covers amulet ladders.

## Dungeon levels drawn as the gem view

Ultima III, IV and V's dungeon levels are drawn the way each game's own map of a level looks: what Peer at a gem
(or Vieda, or the View spell) shows, glyph for glyph, from the game's fonts (U3 `CHARSET.ULT`, U4 `CHARSET.EGA`, U5
`IBM.CH` and `RUNES.CH` with the fountain and field pictures) as the decompiled `ShowDungeonMap` / `DrawViewCell`
pick them. What the gem view leaves out (room numbers, U4's waiting monsters, what U3's "?" squares are) is added
as small labels in a corner of the cell.

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

## Ultima V notes

- PC/GOG version, EGA tiles. Britannia and the Underworld are drawn as 64 images of 32 × 32 squares.
- Townsfolk keep schedules: the hour box (0–23) puts them where they are at that hour, on the floor
  they are on. Each popup has their whole conversation (keywords, follow-up questions and what
  they lead to), where they go during the day, and buttons to follow them.
- Shopkeepers show their shop and keeper from the game's own table (`shopMapIds`); signs show their
  text; squares where Search finds something are ringed, with any condition (keys, once a day).
- Dungeons: klimbing up from level 1 leads to Britannia and down from level 8 to the Underworld, at
  the dungeon's square. Hidden pit traps (0x61) look like passages in the game; here they show as grey pits.
  Rooms open as their own maps, with foes, triggers and the doors that lead into them.
- The moongates shown are where the moonstones lie buried when a game starts.

## Ultima VI, The Savage Empire and Martian Dreams notes

- PC/GOG versions. One module draws all three: the 1024 × 1024 surface and five 256 × 256 levels
  are drawn in the browser as you pan, from the game's chunk map (12-bit chunk indexes, 8 × 8-tile
  chunks) and its object blocks, so the data stays small (about 1 MB a game). Far out, each square
  is drawn as its tile's average colour.
- Objects are as a new game starts, multi-tile ones included; eggs (creature spawners) are not
  drawn but are listed with what they hold. Containers list their contents; signs and books show
  their text (rune digraphs expanded); ladders, holes and entrances link to where they lead (U6 by
  the game's coordinate rule, the other two by their entrance tables).
- People stand where their schedule puts them at the chosen hour; their popup has their day, what
  they carry and their conversation, condensed from each decompilation's `dialogue.json`
  (keywords and answers; "depends" marks answers that change with the story).
- Ultima VI labels the dungeon and shrine entrances with the names Shamino gives them.
- Dungeon maps that wrap show arrows at their edges.

## Ultima VII: The Black Gate and Serpent Isle notes

- Both games use the same engine and formats, so one extractor and one viewer serve both. Black
  Gate keeps SCHEDULE.DAT in STATIC instead of inside INITGAME.DAT. Its world is 67,003 objects and
  6,201 frames in one atlas page, about 4 MB.

- PC/GOG version. The map is kept as the game keeps it: U7MAP (144 superchunks of chunk numbers)
  and U7CHUNKS (3072 reusable 16 × 16-tile chunks), plus the fixed (U7IFIX) and movable
  (INITGAME.DAT u7ireg) objects as 8-byte records. Only the 8,300 shape frames the map uses are
  extracted from SHAPES.VGA, into two atlas pages, so the whole world is about 4.7 MB; drawing it
  as pictures instead would take hundreds.
- Height cutoff: objects at or above the chosen lift are left out. 5 takes the roofs off most
  buildings to show inside; 16 shows everything.
- People come from npc.dat with their names and are placed by their schedule.dat entries
  (3-hour periods); their popups list their day with buttons to follow them.
- The draw order is simple (lift, then distance), so some overlaps differ from the game. Formats
  as Exult reads them (gamemap.cc, actorio.cc, readnpcs.cc, shapes/vgafile.cc).

## Ultima VIII notes

- PC version, as a new game starts (`SAVEGAME/U8SAVE.000`). u8edit does the hard parts and bakes them
  (`docs/u8-export.md`): items in the game's draw order (`DL_ItemNode::compare`), in screen pixels,
  with globs expanded and look names. The browser walks the list for each tile and places frames from
  two atlas pages; one map unit is one screen pixel. About 16 MB for all 45 maps.
- Roof cut: items at that height or above are hidden unless the game always draws them, as u8edit
  does it. Around 60 takes the caps off the mushroom trees; 255 shows everything.
- Amber dots start a teleport (egg or usecode) and link to where it leads; blue rings are where they
  arrive. Eggs and triggers the game never draws can be shown with their layer. Translucent shapes
  are drawn at 60%, as u8edit draws them.
- "How the maps connect" is u8edit's Transitions view: every map at the position u8edit keeps, an
  arrow for each way between two. Map names are kept in the module (`NAMES`) until u8edit sets them; a name from u8edit wins. Maps without a name are unused or unfinished ones the game never sends you to: they are listed apart, under "Unused and unfinished", and grey in the graph.

## Ultima Underworld notes

- Exported by the Underworld editor (`../UltimaUnderworldEditorAvalonia`), not by a script here:

      UwEditor.Cli export-web --game uw1 --data "<game folder or game.gog>" --out data/uw1
      UwEditor.Cli export-web --game uw2 --data "<game folder or game.gog>" --out data/uw2
      node tools/check-uw-export.mjs

- The 2D maps are the editor's map pictures, north up, with everything on the level. Amber dots are
  teleports and stairs, blue rings where they arrive; popups list a tile's objects with their text, locks,
  contents and links, and open the same spot in 3D.
- `uwviewer/` draws the level mesh, the 3D models and the sprites with the game's light falloff
  (light.json), animated textures, the ceiling only from below, and hidden objects, traps and triggers on
  request. Click for what is there; teleports can be followed. The URL is
  `#<game>/<level>/<x>,<z>[,<y>,<yaw>,<pitch>]` in tiles.

## Credits

A fan project, not affiliated with or endorsed by Electronic Arts or Origin Systems. The games, and all the
maps, pictures and words drawn here from their files, belong to their owners: they were made by Richard
Garriott and the people of Origin Systems (Akalabeth by Richard Garriott, published by California Pacific).

**The idea.** An interactive Ultima map comes from the Ultima VII map by [kxmode (Ryan Allen)](https://www.kxmode.com/).

**The decompilations** this site reads its tables, formats and rules from, and the people who started them:

| Game | Project | Original author | Used through |
| --- | --- | --- | --- |
| Akalabeth, Ultima I–III | u0-, u1-, u2-, u3-decompiled | Karl Clinckspoor | [KarlClinckspoor](https://github.com/KarlClinckspoor) |
| Ultima IV | [u4-decompiled](https://github.com/ergonomy-joe/u4-decompiled) | ergonomy_joe | [u4-decompiled-port](https://github.com/KarlClinckspoor/u4-decompiled-port) |
| Ultima V | [u5d](https://github.com/wonst719/u5d) | wonst719 | [KarlClinckspoor/u5d](https://github.com/KarlClinckspoor/u5d); the sextant found with the help of [OpenU5-Enhanced](https://github.com/thekojac304/OpenU5-Enhanced) (thekojac304) |
| Ultima VI | [u6-decompiled](https://github.com/ergonomy-joe/u6-decompiled) | ergonomy_joe | [KarlClinckspoor/u6-decompiled](https://github.com/KarlClinckspoor/u6-decompiled) |
| The Savage Empire, Martian Dreams | u6se-, u6md-decompiled, built on u6-decompiled | Karl Clinckspoor | [KarlClinckspoor](https://github.com/KarlClinckspoor) |
| Ultima VII (both parts) | [Ultima7_Decomp](https://github.com/Kitrinx/Ultima7_Decomp) | Kitrinx (Jamie Blanks) | [KarlClinckspoor/Ultima7_Decomp](https://github.com/KarlClinckspoor/Ultima7_Decomp) |
| Ultima VIII | [Ultima8_Decomp](https://github.com/Kitrinx/Ultima8_Decomp) | Kitrinx (Jamie Blanks) | [Ultima8_DecompPort](https://github.com/KarlClinckspoor/Ultima8_DecompPort), whose editor u8edit bakes the U8 maps |
| Ultima Underworld I and II | [underworld-exhumed](https://github.com/abedegno/underworld-exhumed) | abedegno | [UltimaUnderworldEditorAvalonia](https://github.com/KarlClinckspoor/UltimaUnderworldEditorAvalonia), which exports the levels |
| Ultima IX | [U9GL](https://github.com/theGreyWanderer-uc/tgwUltima9GL) | theGreyWanderer | [UltimaIXEditorAvalonia](https://github.com/KarlClinckspoor/UltimaIXEditorAvalonia), which exports the world |

**Exult.** The [Exult team](https://github.com/exult/exult)'s engine is where the Ultima VII file formats, the sextant's
reckoning and Serpent Isle's regions were checked.

**Software.** [Leaflet](https://leafletjs.com/) (BSD-2-Clause, Vladimir Agafonkin and contributors) draws the 2D maps.
The 3D viewers follow ideas from [noclip.website](https://noclip.website/) (Jasper St. Pierre and contributors) for drawing
large worlds smoothly; no code is taken from it.

**License.** The site's own code and documents are MIT (see `LICENSE`); the game data is not covered.
