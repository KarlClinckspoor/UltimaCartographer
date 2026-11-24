# Ultima Underworld I and II web export: what UWEditorAvalonia should write

This is the contract between the Underworld editor (`../UltimaUnderworldEditorAvalonia`, C#/.NET) and two
readers in this repo:

- **`uwviewer/`**: a 3D viewer, a sibling of `u9viewer/` that shares its WebGL2 code (camera, texture arrays,
  instanced draws, picking). You fly over or walk through a level as the editor's 3D view shows it.
- **The Cartographer** (`js/games/uw1`, `js/games/uw2`): every level as a top-down 2D map, like the automap,
  with clickable tiles and objects, and links between levels.

The editor already does everything hard. `LevelScene.Build` gives the mesh, texture layers, sprites and
models; `MapPicture` gives the 2D map; `GameLight` gives the game's darkness; `ObjectNames` and
`GameStrings` give the text. The export **serialises what the editor already builds**, so the browser does no
game logic. Terms are the editor's own (`LevelModel`, `LevelScene`, `LevelMesh`, `LevelVertex`, `ModelMesh`,
`SpriteAtlas`, `SpriteInstance`, `SceneOptions`, `GameLight`). Where this file and the editor disagree, the
editor is right and this file should be fixed.

## The command

```
UwEditor.Cli export-web --game <uw1|uw2> --data <game folder or game.gog> --out <dir>
                        [--level 1,2,...] [--save <SAVEn folder>]
```

- `<out>`: the Cartographer's `data/uw1` or `data/uw2`. Replace the files an earlier export wrote and
  leave anything else alone.
- `--level`: the levels to export. The default is every level: 9 in UW1 and all of UW2's maps. In UW2,
  skip the empty slots in `LEV.ARK`.
- `--save`: a saved game to read the levels from. The default is the shipped data, as a new game starts.
- No window. Print a **size report**: bytes per file kind, per level, and in total. Exit with 0 on success.
- Deterministic: the same input gives the same bytes. The tests should check this.
- Use the scene options of a fresh 3D view: ceiling, objects and models built (the viewer toggles them),
  with invisible objects, traps and triggers exported too and flagged (see below), not drawn by default.

## Output

```
data/uw1/                      (data/uw2/ the same)
  manifest.json                game, levels, texture strips, counts
  tex-<k>.png                  wall and floor textures, 64 x 64 each, stacked as a vertical strip
  sprites-<k>.png              object and critter pictures (SpriteAtlas pages, RGBA)
  light.json                   the game's light tables (GameLight), for the viewer's darkness
  levels/<n>/mesh.bin          the level's surfaces (LevelMesh)
  levels/<n>/models.bin        the objects drawn as 3D models (ModelMesh)
  levels/<n>/sprites.bin       the objects drawn as pictures (SpriteInstance list)
  levels/<n>/tiles.bin         the 64 x 64 tile grid, for the 2D map and tile clicks
  levels/<n>/objects.json      what a click on an object shows, and the links
  levels/<n>/map.png           the 2D map (MapPicture.Render)
```

Little-endian, with no headers in `.bin` files. `manifest.json` has `"format": "uwweb", "version": 1`.

## Coordinates

Use `LevelVertex`'s: **x east, y up, z north, in tiles**. Tile (tx, ty) covers x tx..tx+1 and z ty..ty+1.
The 2D map draws north up, so a Cartographer square (x, y) is tile (x, 63 - y). Give heights in tiles, as
the mesh has them, so the viewer and the click text agree.

## manifest.json

```json
{"format": "uwweb", "version": 1, "game": "uw1",
 "textures": {"files": ["tex-0.png"], "count": 212, "size": 64, "animated": [{"layer": 40, "frames": [40, 41, 42, 43], "ms": 200}]},
 "sprites": {"files": ["sprites-0.png"]},
 "levels": [{"id": 1, "name": "Level 1", "realm": null, "vertices": 51234, "modelVertices": 8120, "sprites": 312,
             "objects": 640, "light": 3, "minLight": -1, "start": {"x": 32.5, "y": 1.2, "z": 2.5, "heading": 0}}]}
```

- `textures`: the **global** set of wall and floor textures that any exported level uses (deduplicated
  across levels), each as one 64 × 64 layer. A strip holds at most 256 layers (64 × 16384 px), so it
  fits a texture array. Floors that are 32 × 32 in the game are scaled to 64 × 64, nearest neighbour.
  `MissingLayer`'s checkerboard is one layer too.
- `animated`: layers the game cycles (water, lava and the like), with the frames in order and the
  speed. Leave it empty if the editor doesn't animate them yet.
- `levels[].name`: the editor's level name (`GameLight.LevelNames`, or UW2's world and level).
  `realm` is UW2's world (Britannia, Prison Tower, Killorn Keep, Ice Caverns, Talorus, Scintillus
  Academy, Pits of Carnage, Tomb of Praecor Loth, Ethereal Void), as the editor names them; null in UW1.
- `light`, `minLight`: what `GameLight` uses for the level (UW2's DL.DAT minimum, or -1).
- `start`: the new-game start, only on the level where a new game begins.

## mesh.bin (per level)

`LevelMesh`, without index buffers: three vertices make a triangle, in the order the editor builds them.
24 bytes per vertex:

```
f32 x, f32 y, f32 z      tiles
f32 u, f32 v             repeating texture coordinates, as LevelVertex
u16 layer                into manifest.textures (global, not the level's own list)
u8  shade                LevelVertex.Shade * 255
u8  kind                 0 floor, 1 wall, 2 ceiling (TriangleKind), the same for all 3 vertices
```

Then one u16 per triangle: its tile, x + 64 y (`TriangleTile`), for picking and for highlighting a tile.
`manifest.levels[].vertices` gives the count, so the tile array starts at `vertices * 24`.

The winding should match the editor's, with front faces counter-clockwise when seen from inside the
level. The viewer culls back faces.

## models.bin (per level)

`ModelMesh` (doors, furniture, levers and writings as the game's 3D models). 28 bytes per vertex:

```
f32 x, f32 y, f32 z
f32 u, f32 v
u16 layer                into manifest.textures, or 0xFFFF for a flat colour
u16 rgb565               colour (when layer is 0xFFFF, or a tint)
u16 object               the object index in objects.json
u16 0
```

Its texture layers go into the global texture set like the level's. Triangles are three vertices in a
row, as in mesh.bin.

## sprites.bin (per level)

`SpriteInstance` list, the objects drawn as pictures facing the camera. 32 bytes each:

```
f32 x, f32 y, f32 z      the base (bottom centre), tiles
f32 w, f32 h             size in tiles
u8  page, u8 alpha       sprite page; alpha 0-255
u16 x, u16 y, u16 w, u16 h   the picture's rectangle in its page
u16 object               index in objects.json
u8  flags                bit 0 invisible, bit 1 trap or trigger, bit 2 critter, bit 3 in a container
                         (not on the floor: leave these out, they go under the container's contents)
u8  0
```

Critters use the first frame of their idle animation, facing south, as the editor shows them. Sprites
for invisible objects, traps and triggers are listed, so the viewer can show them on request (as the
3D view's Invisible and Traps and triggers options do).

## tiles.bin (per level)

64 × 64 tiles, row by row from y = 0 (south), 8 bytes per tile:

```
u8  type                 0 solid, 1 open, 2-5 diagonals (SE, SW, NE, NW), 6-9 slopes (N, S, E, W)
u8  floor                floor height in the game's units (0-15)
u16 floorLayer           into manifest.textures
u16 wallLayer            into manifest.textures
u8  flags                bit 0 door, bit 1 has objects, bit 2 magic disabled, bit 3 no-magic-drop
u8  0
```

Use the type names and order the editor shows; if they differ from this list, follow the editor and
fix this file.

## objects.json (per level)

An array indexed by **object index** (the level's own numbering, so `object` in the .bin files and the
links below point straight in). Use null for unused slots. Use the fields the editor's properties panel
has, and leave out what doesn't apply:

```json
{"name": "a door", "item": 320, "x": 31, "y": 4, "fine": [3, 7], "z": 24, "heading": 2,
 "quality": 40, "owner": 0, "flags": ["invisible"],
 "desc": "a plain-words line, as the editor's tooltip gives it",
 "lock": {"locked": true, "key": "a key to the Seers' storeroom"},
 "contents": ["a red potion", "3 gold coins"],
 "critter": {"name": "goblin", "hp": 12, "attitude": "hostile", "whoami": 11, "talksAs": "Shak"},
 "text": "words written on a scroll, a plaque or a book",
 "link": {"kind": "teleport", "level": 2, "x": 30, "y": 60, "z": 16}}
```

- `name`: `ObjectNames`, with the article, as the game says it.
- `contents`: names of what a container or critter holds, nested as the editor nests them.
- `text`: what a book, scroll or plaque says (`GameStrings`).
- `critter.talksAs`: the conversation's speaker, when it has one.
- `link`: what the object does when it fires, resolved as far as the editor can:
  - `teleport` (a move trigger's teleport trap, stairs between levels): the `level` and the tile
    `x, y`, plus `z` if known.
  - `trap`: the object index it fires, plus the trap's kind and a plain-words line.
  - `door`: the door it opens.
  - `lever`: what a lever or switch works.

  Chains (trigger, then trap, then teleport) can be flattened to where they end, with `via` listing
  the objects in between.

## map.png (per level)

`MapPicture.Render(level, 16)`: 1024 × 1024 for a 64 × 64 level, north up, everything shown (not
only what a player has explored). PNG, RGBA. The Cartographer lays it under its own markers.

## light.json

What the 3D view needs to darken by distance as the game does (`GameLight`):

```json
{"brightness": [1, 0.93, ...], "mono": [1, ...], "shades": [[0, 1, 2, ...], ...], "levelLight": {"1": 3}}
```

- `brightness`: how bright each of the 16 light maps leaves the palette (`LIGHT.DAT`), and `mono` for
  `MONO.DAT`.
- `shades`: for each light level 0-7, the map at each whole-square distance.

The viewer has a "full bright" switch, but a game-like look is the default.

## Checks the export should pass

- Every `layer` is below `textures.count`, every sprite rectangle is inside its page, every `object` is
  a real entry, and every link's level and object exist.
- `vertices` and the other counts match the files' sizes.
- The mesh is the 3D view's: drawing mesh.bin with the textures matches the editor's view of the same
  level from the same camera, by eye or pixel for pixel. Check one UW1 level and one UW2 level.
- Re-exporting gives identical bytes. Size report for one level, then for everything.

## What the readers do with it (for context)

- **uwviewer**: loads the manifest, the texture strips into a texture array, and a level's mesh, models
  and sprites. It draws them with the game's distance darkness, with toggles for the ceiling, objects
  and invisible things. A click picks a triangle (tile) or an object and shows its objects.json entry,
  and teleport links open the destination level at that tile. The URL holds the level and camera, as
  u9viewer's does.
- **Cartographer**: `map.png` as the picture and `tiles.bin` for a tile's popup (type, heights,
  textures, what lies there). Objects come from objects.json at their tiles, searchable by name.
  Teleports, stairs and level changes are links. A button opens the same spot in uwviewer.

Expected size: a few MB per game (textures and sprites shared, small meshes). The report will tell.
