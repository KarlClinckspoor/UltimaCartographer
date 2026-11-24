# Ultima VIII web export: what u8edit should write

This is the contract between u8edit (`../U8/Ultima8_Decomp/ultima8-portable/editor`, C++/Qt) and the
Cartographer's Ultima VIII maps (`js/games/u8/`). u8edit already does everything hard: it draws items in the
game's order (`DL_ItemNode::compare`, `ui/maprender.cpp`), expands globs, applies the roof height, names items
by running their look routines, and finds the transitions between maps. The export bakes that, so the browser
only places pictures, filters by height and shows text.

Terms are u8edit's own (`MapItem`, `MapRender::Entry`, `LayerOptions`, `EggInfo`, `Transition`, `World`).
Where this file and u8edit disagree, u8edit is right and this file should be fixed.

## The command

```
u8edit --data <game folder> --export-web <out> [--maps 1,3,...] [--save <U8SAVE.nnn>]
```

Run without a window (`QT_QPA_PLATFORM=offscreen` is fine), write, print a report, exit.

- `<out>`: the Cartographer's `data/u8`. Written fresh.
- `--maps`: the maps to export; default every map with items (the Maps list).
- `--save`: the saved game whose movable items and NPCs to use; default `SAVEGAME/U8SAVE.000` (a new game),
  with map 3 from its item cache as u8edit already does.
- Layers as u8edit's defaults: fixed, movable, glob and NPC items; **not** eggs and editor-only shapes, not
  invisible items (they go in the item list with a flag, see below, but are not drawn).

It prints a **size report** (bytes per file kind, per map and in total). That is the first deliverable: atlas
size decides whether we keep PNG or compress.

Deterministic output (same input, same bytes).

## Output

```
data/u8/
  manifest.json               maps, atlas pages, counts
  atlas-<k>.png               every frame any exported map draws, packed into 2048 x 2048 pages (RGBA)
  frames.bin                  where each of those frames is in the atlas
  shapes.json                 shape names, for items without a look name
  graph.json                  the maps as a graph (u8edit's Transitions view)
  maps/<n>/items.bin          the map's items, in draw order
  maps/<n>/info.json          what a click on an item shows
```

Little-endian; no headers in `.bin` files; `manifest.json` has `"format": "u8web", "version": 1`.

## Screen space

Everything is in the map's **screen pixels**, exactly `MapRender::Entry`'s: `sx = x - y`, `sy = x/2 + y/2 - z`
(with x, y as u8edit has them in the entry), the item's hot spot. A frame is drawn with its top-left at
`(sx + left, sy + top)` where `left`/`top` are `Frame::left(flip)` and `Frame::top()`. The Cartographer maps one
screen pixel to one map unit, so every map is a plain picture to it.

## Frames and atlas

Each distinct (shape, frame, flipped) an exported map draws gets a **frame id** (0, 1, 2, ... in any stable
order). Flipped frames are stored already mirrored, so the browser never flips.

`frames.bin`, 16 bytes a frame id:

```
u8   atlas page
u8   0
u16  x, u16 y        top-left in the page
u16  w, u16 h
i16  left, i16 top   offset of the top-left from the hot spot (Frame::left(flip), Frame::top())
u16  shape
```

(the frame number is not needed by the browser; put it in a second file if you like.)

Atlas pages: RGBA PNG with the U8 palette applied, transparent where the frame is. Shelf-packed, 2048 x 2048,
the last page only as tall as it is used. (The Serpent Isle export in `tools/extract-u7.mjs` packs the same way.)

## items.bin (per map)

Every item u8edit's map view draws with the default layers, **in the order it draws them**: the order the display
list gives over the whole map. Drawing any subset in this order is still right, so the browser draws a screen
tile's items by walking the list. 16 bytes an item:

```
i32  sx, i32 sy      hot spot, screen pixels
u16  frame id
u8   z               world height (for the roof)
u8   flags           bit 0 always drawn (the draw flag: shown whatever the roof)
                     bits 1-2 source: 0 fixed, 1 movable, 2 glob, 3 NPC
                     bit 3 invisible (listed for clicks, not drawn)
                     bit 4 has info (an entry in info.json)
u32  info index      into info.json, 0xFFFFFFFF if none
```

The roof rule is u8edit's (`Camera::_roof`): an item is hidden when it is not always drawn and `z >= roof`. The
browser applies it with a height the user picks; 255 shows everything.

Also include, at the end of `manifest.json`'s map entry, the **bounds** in screen pixels (min/max of the drawn
frames' rectangles), so the browser knows the picture's size.

## info.json (per map)

One entry per item that has more to say than its shape's name; glob items and plain scenery need none. Fields as
u8edit's Item window and tooltips have them; leave out what does not apply:

```json
{"name": "Devon", "shape": 382, "frame": 0, "x": 12034, "y": 9010, "z": 0,
 "quality": 0, "npc": 3, "class": "DEVON", "source": "npc",
 "desc": "a plain-words line, as the map tooltip gives it",
 "contents": ["2 bread", "key (opens the shrine door)"],
 "egg": {"kind": "teleport", "toMap": 5, "toItem": 1234, "id": 7},
 "door": {"key": 12, "locked": true}, "key": 12}
```

- `name`: the look name with Full Names on (every flag set), so people have their names from the start.
- `contents`: the names of what it holds, nested as u8edit nests them.
- `egg`: what it does as an egg (`EggInfo`), and for a teleport egg where it leads: `toItem` is the index of the
  receiving egg in the destination map's info.json (or null).
- NPC statistics from NPCDATA.DAT are welcome under `"npcStats"`.

## graph.json

u8edit's Transitions view, so the Cartographer can draw the same picture and navigate it:

```json
{"maps": [{"id": 3, "name": "Tenebrae", "items": 41234, "eggsOut": 6, "people": ["Devon", "Mordea"],
           "x": 120.5, "y": -40.0}],
 "transitions": [{"kind": "teleportEgg", "fromMap": 3, "fromItem": 812, "toMap": 5, "toItem": 77,
                  "toEgg": 7, "x": 0, "y": 0, "z": 0, "class": null}]}
```

- Map names: the names given in u8edit (File > Export Names has them); none when unnamed.
- `x`, `y`: where the map sits in the Transitions view (the positions u8edit keeps), so the layout matches.
- `kind`: `teleportEgg`, `usecodeToEgg`, `usecodeNpcTeleport` (`Transition::Kind`); `fromItem` and `toItem` are
  indices into the maps' info.json (the egg or the item whose usecode does it), null when not on a map; `x, y, z`
  in world units for places, and also converted to screen pixels as `sx`, `sy`.

## shapes.json

`{"<shape>": "name", ...}`: the names u8edit gives shapes (the Item window's Name, else the usecode class made
readable), for items with no info entry.

## Checks the export should pass

- Counts match u8edit: drawn items per map, transitions.
- Every frame id is in `frames.bin`; every info index is in info.json; every `toItem` exists.
- Drawing items.bin in order gives the same picture as u8edit's map view at the same roof height (compare one
  map, say Tenebrae, pixel for pixel or by eye).
- Re-exporting gives identical bytes; a size report for one map, then every map.

## What the Cartographer does with it (for context)

Each map is a picture in screen pixels, drawn tile by tile as the user pans (the way it draws Serpent Isle): walk
items.bin, skip what the roof hides, blit frames. A click finds the topmost item whose frame covers the pixel.
Teleport eggs and transitions are links that open the destination map at the receiving egg; the graph view lists
every map, laid out as in u8edit, as another way to move around.

## As implemented (u8edit, November 2026)

Where the export goes beyond or differs from the text above. u8edit's own notes are in
`ultima8-portable/editor/README.md`, "The web export".

- Running it: u8edit is a Windows GUI program. Run it with its output redirected to a file (the size
  report is lost otherwise). Do **not** set `QT_QPA_PLATFORM=offscreen`: this build has no such plugin,
  and Qt shows an error dialog and hangs. It takes about 10 seconds and exits with 0. Only files from an
  earlier export are replaced. Output is deterministic (checked: two runs, identical bytes).
- Listed but not drawn: items.bin also lists eggs and other editor-only shapes, with flags bit 3 set
  (the same bit as invisible items), so a click can find teleport eggs. Don't draw bit 3; do hit-test it.
  `manifest.maps[].drawn` and the bounds count drawn items only.
- Bit 5: translucent shape. u8edit draws these at 60% opacity.
- Bounds: `manifest.maps[].bounds` is `{minX, minY, maxX, maxY}` in screen pixels, max exclusive.
- Extra fields: info entries have `item` (u8edit's item index); graph.json map entries have `exported`.
  Info entries for eggs and editor-only shapes have `editorOnly: true`; NPCs have `npcStats`
  (str, dex, int, hp, mana, alignment, dead).
- Map names: none are set yet, so `name` is left out. Node -1 is "Usecode (any map)", with no position.
  Positions come from the u8edit Transitions view.
- Transitions from an item inside a container: `fromItem` is the outermost container on the map.
- A transition's `x, y, z` and `sx, sy` are the **destination**: where the Avatar arrives, in toMap's
  world units and screen pixels. Usecode transitions also have `classId`.
- Glob eggs have no info entries, since what they put down is already on the map.
- `egg` objects: `kind` (`teleport`, `monster`, `usecode`) plus fields for that kind. A sending teleport
  egg has `sends, toMap, toItem, id, fade, range`; a receiving one has `receives, id`.
- World to screen is roughly `sx = (x - y)/4`, `sy = (x + y)/8 - z` (off by a pixel or two from rounding); the
  Cartographer uses items.bin and the transitions' `sx, sy`, not this formula.

### Checked by `tools/check-u8-export.mjs`

463 checks: atlas pages against the PNG headers, frames inside their page, items.bin sizes, frame
ids and info indices, bit 4 set exactly when there is an info index, every info entry used once, the
drawn counts, the bounds recomputed from the frames, sending teleport eggs leading to a receiving egg
with the same id, and transition kinds and indices. All pass but one: shape 0 has no shapes.json entry.

### Asks for u8edit

- shapes.json: 390 of its 757 names are "generic" (and others "quality" or "container"), the
  usecode class's name, which names nothing. A look name per shape (or per shape and frame) is what a
  click on plain scenery needs. Shape 0 is missing.
- Map names, once set in u8edit.
- Some NPCs' frames are blank (for example servant Aramina on map 41: shape 282 frame 73 is a 1 × 1
  frame), so they can be found but not seen. If the game shows them in another frame at the start,
  that frame would be better.
