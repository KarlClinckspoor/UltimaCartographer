# The Ultima Cartographer: research and plan

Nov 23, 2026 · @Karl

## Summary

Build one shared viewer and a separate extractor for each game, instead of copying the U7 site. The U7 map has hand-placed markers on a single image, and that does not scale to ten games.

- **The U7 site is a reskin of the Witcher 3 interactive map** (untamed0/witcher3map): Leaflet 0.7.3, jQuery, tiles on Amazon S3, and about 634 markers typed by hand into one JS file in made-up lat/lng coordinates. No public source repo for the U7 version turned up.
- **The three repos you found are early-stage, and none has a license.** u6map is a good reference for *parsing* (a Python reader for U6's chunk/map files). The drrak U4/U5 pages are a static 4096 px PNG with absolutely positioned labels.
- **Nobody covers the whole series.** U4–U7 have viewers or big static maps. U0–U3, U8, U9 and Serpent Isle have no interactive web map (kxmode announced a Serpent Isle map but I couldn't find it released).
- **Only Akalabeth really works from a lucky number.** U1 (PC) seeds each dungeon level from a per-character seed in the save file plus the entrance's coordinates, and only the walls, doors, force fields and ladders can be reproduced. **U2 dungeons and towers aren't random at all**: they're fixed in the MAPG files.
- **The U0 generator is basically done.** Your `u0-decompiled/tools/akmap.py` already reproduces it. I ported it to JavaScript, and the port matches your Python on 143 cases (11 lucky numbers, each with its world map and levels 1–12).

## How the kxmode U7 map is built

It's a stock slippy map: one big pre-rendered image cut into tiles, with markers typed by hand on top. I read this from the live page's scripts and from the open-source project it comes from.

| Part | What it is |
| --- | --- |
| Origin | A fork of [untamed0/witcher3map](https://github.com/untamed0/witcher3map) (CC BY-NC-SA 4.0). It still points its preview image at `maps/velen/preview.jpg`, a Witcher 3 region |
| Libraries | jQuery 2.1.4, i18next, jQuery.NiceScroll, Leaflet 0.7.3 with plugins (label, hash permalinks, fullscreen, search), Plyr for the music pins |
| Map image | Tiles at `u7map-leaflet.s3.amazonaws.com/files/maps/u7/{z}/{x}/{y}.png`, TMS order, zoom 2–7, default Web Mercator projection (EPSG:3857). The author says S3 hosting costs about $1.50/month |
| Markers | `files/js/mapdata-u7.js` (about 120 KB): 37 layer groups (castles, dungeons, NPCs, shrines, moongates, music…) and 634 `L.marker([lat, lng])` calls, each with a label and an HTML popup linking to the Ultima wiki |
| Coordinates | Made-up lat/lng picked by clicking on the image, not game coordinates. So markers can't be generated from game data, and they break if the image is rebuilt at another size |
| Search | Built in the browser from every marker's popup text, sorted, and fed to Leaflet Control Search |

Where the image came from isn't stated. The likely source is Exult's `--buildmap` option, which writes the 144 superchunks of the world as 2048 × 2048 screenshots to be stitched together.

## The three repos you found

The main thing worth reusing is u6map's file parsing. Nothing in these repos can be adopted as-is: none has a license file, so the code is all rights reserved by default.

| Repo | How it works | Map data | Last change | Reuse |
| --- | --- | --- | --- | --- |
| [grumdrig/u6map](https://github.com/grumdrig/u6map) (U6, Eric Fredricksen, 2007) | `parsemap.py` reads U6's `chunks` and `map` files plus `SAVEGAME/OBJBLK*`, and writes everything into one 570 KB `map.js` (1024 × 1024 tile indices, 5 dungeons, objects, animation data, tile flags). The page draws 16 px tiles from a sprite sheet onto a canvas, with tile and object info on hover. It also writes ImageMagick commands to compose full-size images | Real game data, real game coordinates | 2011; XUL-era | Its notes on the nibble-packed superchunk format. The parser is Python 2. Your U6 decompilation covers the same ground more reliably |
| [drrak/ultima4](https://github.com/drrak/ultima4) (U4, v1.03) | Static page: the body background is a 4096 × 4096 PNG of the world, with absolutely positioned `<a>` labels whose `title` tooltips hold walkthrough notes (runes, mantras, stones). Search is the browser's Ctrl+F. The README is in Polish | One pre-rendered image; label positions in pixels | Dec 2022 | The annotation text, as a checklist of what to mark. The tooltips credit a GameFAQs guide and link the Ultima Codex walkthrough |
| [drrak/ultima5](https://github.com/drrak/ultima5) (U5 + Underworld, v0.99) | Same approach, plus a second page (`u/`) for the Underworld | Same | Dec 2022 | Same |

None of them uses a tiling library, so none can zoom out to an overview or in to full detail. Only u6map works from the game's own files.

## What exists for each game, and the gaps

No game in the series has a zoomable web map built from its own data with searchable markers. U7 comes closest, but its markers are placed by hand. In the last column, "yours" means one of your own decompilations or ports.

| Game | Interactive web map today | Other tools and static maps | Data source for us | Gap |
| --- | --- | --- | --- | --- |
| U0 Akalabeth | None | Playable in the browser through an Apple II emulator | Yours: `akmap.py` (world + dungeons from a lucky number) | Everything; procedural |
| U1 | None | Ultima 1 Revenge map viewer (2007, abandoned); HRUMP scans of the four cloth maps | Yours: `u1-decompiled` | Everything |
| U2 | None | [ModdingWiki map format](https://moddingwiki.shikadi.net/wiki/Ultima_II_Map_Format) (64 × 66 cells, tiles in the EXE); HRUMP Earth map | Yours: `u2-decompiled` (`tools/sprites.py` draws the tiles and dungeon shapes) | Everything, including the time periods and planets |
| U3 | None | [Yragael's DOS map viewer](https://ultima3.ultimacodex.com/ultimate-ultima-map-viewer) for U3–U5; [U3 map format](https://bitbucket.org/mcmagi/ultima-exodus/wiki/U3_Maps_File_Format) (64 × 64) | Yours: `u3-decompiled` | Everything |
| U4 | drrak/ultima4 (static) | [vectorpoem's U4 Map Viewer](https://ultima4.ultimacodex.com/ultima-4-map-viewer) (desktop); [jtauber/ultima4](https://github.com/jtauber/ultima4) (Python → world PNG) | Yours: `u4-decompiled-port` | Zoom, towns, dungeons, structured markers |
| U5 | drrak/ultima5 (static, incl. Underworld) | Yragael's viewer | Yours: `u5d` | Same as U4 |
| U6 (+ Savage Empire, Martian Dreams) | grumdrig/u6map (old canvas page) | Ultima Codex computer-generated map; [TITAN](https://pypi.org/project/titan-ultima/) now reads U6 formats | Yours: `u6-decompiled`, `u6se-`, `u6md-decompiled` | A modern viewer; SE and MD have nothing |
| U7 Black Gate | kxmode (hand-placed markers) | Exult `--buildmap`; TITAN `u7 map-render` | Yours: `Ultima7_Decomp`; Exult | Markers from data (NPCs, eggs, items) |
| U7 Serpent Isle | Announced by kxmode, not found | Codex computer-generated map; same tools as U7 | Same | Everything |
| U8 Pagan | None | [Pagan the Beautiful](https://gallery.ultimacodex.com/pagan-the-beautiful) (stitched screenshots; the whole-Pagan images are lost); TITAN `u8 map-render` | Yours: `Ultima8_DecompPort` | Everything; maps are separate areas |
| U9 Ascension | None | [u9map](https://tangled.org/donpdonp.tngl.sh/u9map) (Linux/Vulkan); [terrain format](https://wiki.ultimacodex.com/wiki/Ultima_IX_internal_formats) documented; a Blender importer | Terrain height maps + objects | Everything; it's 3D, so it needs a top-down render |

Ultima Underworld 1/2 sit outside the 1–9 scope, but [UnderworldGodot](https://github.com/hankmorgan/UnderworldGodot) already works as a map viewer, and your editors read the levels.

## Proposed architecture for Ultima 0–9

Each game gets a small offline extractor that writes standard tiles and marker JSON. One viewer reads them all, and the seeded dungeons are computed live in the browser.

&#91;embedded content: Ultima Cartographer architecture · extractors, data, one viewer\]

Only the extractors are specific to each game; the viewer, the marker format and the hosting are shared.

- **Coordinates are game coordinates.** Use Leaflet's `CRS.Simple`, with one map unit per game tile (U1–U6) or per world unit (U7+). Then markers come straight from game data, and the URL `#u6/world/x/y/zoom` means something to players.
- **Marker schema** (one JSON per map): `{id, layer, name, x, y, z?, popup, links, spoiler?}`. Layers are shared across games where they make sense (towns, dungeons, shrines, moongates, NPCs, items), so one legend works everywhere.
- **Tiles**: render each map once at native resolution, then cut a pyramid with `gdal2tiles` or `libvips dzsave`. Tile games could skip images and draw from a tile sheet plus an index array, the way u6map does; that's smaller, but harder to zoom out smoothly.
- **Multi-level maps** (U5–U6 dungeons, U7 roofs, U8 areas, the U2 eras) are layers within one game, not separate sites.

## Dungeon maps for U0, U1 and U2

The three games need three different approaches. Only U0 is fully determined by a lucky number. U1 needs the character's seed from the save file, and U2 has nothing random to reproduce. All three levels are tiny grids (11 × 11 or 16 × 16), so the browser can compute and draw them directly as SVG, with no image tiles.

| Game | What decides the layout | What can be reproduced | Input the site asks for |
| --- | --- | --- | --- |
| U0 Akalabeth (PC/GOG) | `srandom(lucky × 3 + level)` with DJGPP 2.01's `random()` | Everything: walls, doors, hidden doors, traps, holes, chests, ladders, and each monster's starting square | Lucky number + level (+ the square you arrive on, for monster placement) |
| U1 (PC/GOG) | `character seed + 5x + 3y + 17 × level`, where x, y are the entrance's world coordinates | Walls, doors, secret doors, force fields, ladders. Then the game re-seeds from the clock, so chests, coffins and monsters differ on every visit | The character's save file (seed at offset 0x32 of `playerN.u1`, read in the browser) or the seed typed in, plus a pick from the 36 entrances |
| U2 | Nothing: 16 levels of 16 × 16 cells stored in each MAPG file | Everything except monsters, which spawn at random while you play | Nothing: drawn straight from the game files |

### U0: done in principle

- An 11 × 11 grid: walls on the border and on every even row and column, leaving a 5 × 5 grid of one-square rooms. Each wall between two rooms then rolls trap, hidden door, door, hole and chest in that order, each roll overwriting the last. Ladders sit at (7,3) and (3,7), swapping on odd and even levels; on level 1 the exit is at (1,1).
- **Every dungeon entrance gives the same levels**, because the entrance isn't part of the seed. A level is rebuilt each time you enter it, so chests refill.
- **JS port done**: about 70 lines, matching `akmap.py` on 143 cases (11 lucky numbers from −7 to 2³¹−1, each with its world map and levels 1–12). The world map (21 × 21) uses the same generator, so U0 can be fully procedural.
- Caveat 1: `docs/game/dungeon.md` says the generator was *read from the code, not yet checked in play*. One DOSBox run per lucky number would confirm it.
- Caveat 2: this is the 1997 PC port. The 1980 Apple II original uses Applesoft's `RND`, so the same lucky number almost certainly gives different maps there. Label the site "PC/GOG version", or port the Applesoft generator later.

### U1: reproducible, from the save file

- RNG (`OM4069.ASM`): a 16-bit state, `x = ror3(x + 0x9248)`, then `r = x & 0x3FF`, reduced by repeated subtraction into `[lo, hi]` (hi clamped to 255).
- Level: border walls; in columns 2, 4, 6, 8 each cell is floor, wall, secret door or door with probability 1/4 each; then `2L + 1` extra obstacles (37% force field, else wall) placed from a fixed table of 16 positions, transposed on even levels; ladders at (7,3) and (3,7); level 1's exit at (1,1); no down ladder on level 10.
- To check before trusting it: whether `seed + 5x + 3y + 17L` wraps at 16 bits (it should, since `rndseed` is a word), and one level compared against a memory dump of `D_AD56` in DOSBox.
- Display: overlay the possible chest and monster squares as "varies per visit", rather than inventing positions.

### U2: no generator

- Cell bits from `docs/FINDINGS.md`: 80h wall, C0h door, E0h secret door (drawn as a wall, but passable), 20h/10h ladder down/up, 40h chest.
- The four Earth dungeons (X15, X25, X35, X45) are the same maze; X15 differs in two cells. Dungeons count levels downward and towers upward.
- So U2's dungeons and towers go through the same extractor as its overworld and towns.

## Roadmap and open questions

Start with U4 and U0. U4's world is a small, well-documented 256 × 256 tile grid, and U0 is already solved, so together they test both the tile pipeline and the procedural layer cheaply.

1. **Viewer skeleton plus two pilots.** One page with a game switcher, map layers, marker JSON, search and permalinks; U4 overworld and towns, U0 world and dungeons.
2. **U1–U3.** Small tile maps; the extractors come from your decompilations. Add the U1 dungeon generator, and U2's dungeons and towers from its MAPG files.
3. **U5, U6, Savage Empire, Martian Dreams.** Overworld plus underworld or dungeon levels; objects and NPC schedules from the save and object files.
4. **U7 and Serpent Isle.** Image from Exult `--buildmap` or TITAN; markers generated from the game's fixed objects, eggs and NPC data instead of placed by hand.
5. **U8.** One map per area (TITAN renders them), linked by their exits.
6. **U9.** A top-down render of the terrain height maps plus objects; the hardest step, and last.

Open questions for you:

- [ ] **Game art and hosting.** Host pre-rendered tiles, like kxmode and witcher3map do (non-commercial, credited), or have visitors load their own GOG files and render in the browser? The second never redistributes Origin/EA art, but it's harder to use. Answer: Host pre-rendered tiles for now.
- [ ] **Where to host.** GitHub Pages is free but suggests keeping repos under about 1 GB; full-detail U7/SI tile pyramids would go past that. S3 or Cloudflare R2 cost about as much as kxmode's $1.50/month. Answer: GH-Pages. Let's see what happens to the size and think about it later.
- [ ] **Start fresh rather than fork witcher3map?** Its CC BY-NC-SA license would bind the whole site, and its Leaflet 0.7 is from 2014. I'd write fresh on current Leaflet (BSD-2) and credit kxmode for the idea. Answer: Write fresh from current Leaflet, and credit.
- [ ] **Which versions?** PC/GOG only (what your decompilations cover), or also the Apple II originals of U0–U3, whose generators and maps differ? Answer: PC/GOG Only.
- [ ] **Spoilers.** Hide quest items, secret doors and endgame locations behind a toggle? Answer: Don't hide.

## Sources

- [kxmode Ultima 7 Map](https://www.kxmode.com/u7map/): page scripts and `mapdata-u7.js`, read in the browser on 2026-11-23
- [untamed0/witcher3map](https://github.com/untamed0/witcher3map): the U7 map's base, README and source
- [GOG forum: Ultima 7 interactive map thread](https://gog.com/forum/ultima_series/ultima_7_interactive_map_d/page1) and [Exult forum: Serpent Isle map viewer](https://exult.sourceforge.io/forum/viewtopic.php?p=1768473)
- [Exult forum: --buildmap output](https://exult.sourceforge.io/forum/viewtopic.php?p=1724388)
- [grumdrig/u6map](https://github.com/grumdrig/u6map), [drrak/ultima4](https://github.com/drrak/ultima4), [drrak/ultima5](https://github.com/drrak/ultima5): cloned and read
- [TITAN on PyPI](https://pypi.org/project/titan-ultima/) and [Ultima Codex: TITAN adds U6 and U9 formats](https://ultimacodex.com/2026/09/catching-up-with-titan-ultima-6-and-underworld-2-support-and-a-sosaria-map/)
- [Ultima Codex: Pagan the Beautiful](https://gallery.ultimacodex.com/pagan-the-beautiful), [u9map](https://tangled.org/donpdonp.tngl.sh/u9map), [Ultima IX internal formats](https://wiki.ultimacodex.com/wiki/Ultima_IX_internal_formats)
- Your repos: [u0-decompiled](https://github.com/KarlClinckspoor/u0-decompiled) (`tools/akmap.py`, `docs/game/dungeon.md`), [u1-decompiled](https://github.com/KarlClinckspoor/u1-decompiled) (`docs/game/dungeons.md`, `src/origin/OM4069.ASM`, `docs/game/save-format.md`), [u2-decompiled](https://github.com/KarlClinckspoor/u2-decompiled) (`docs/MECHANICS.md` §8.1, `docs/FINDINGS.md`)
