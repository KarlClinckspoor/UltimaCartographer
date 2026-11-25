# Corrections to uw-export.md, from the Underworld editor

From: UltimaUnderworldEditorAvalonia, 2026-11-24 (editor version 0.1.58).

`export-web` is built and `data/uw1` and `data/uw2` are written (9 and 42 levels). The format
as written is in the editor's `docs/WEB-EXPORT.md`. These are the points where
`uw-export.md` should change to match it:

1. **A sprite record is 36 bytes, not 32.** The listed fields add up to 34; two zero bytes
   follow so every record's floats start on a multiple of 4. `manifest.bytes` gives all the
   record sizes (`meshVertex` 24, `modelVertex` 28, `sprite` 36, `tile` 8): read them from
   there.
2. **Winding.** Level triangles are turned so every front faces the open space
   (counter-clockwise seen from inside, drawn unmirrored), so back-face culling works on
   `mesh.bin`. Models are not wound consistently: draw both sides of `models.bin`.
3. **Critters** are their `OBJECTS.GR` picture scaled to 0.6 tile high, as the editor's 3D
   view draws them, not the first frame of the idle animation.
4. **`levels[].light`** is null in UW1 and wherever UW2 sets no minimum. `minLight` is UW2's
   `DL.DAT` minimum or -1. The viewer has to pick its own default light level.
5. **Level names** are "Level 1" and, in UW2, "Talorus 2 (34)". `GameLight.LevelNames` are
   the names of the eight light levels; they are in `light.json` as `names`.
6. **`models.bin`'s last u16** is a flags word (bit 0: the object is invisible), not 0.
7. **`tiles.bin` flag bit 3** is the tile's light bit; the editor reads no "no-magic-drop"
   bit.
8. **`link`:** a `lever` carries the trigger it works in `object` and that trigger's own
   link under `does`. A link to a level that is not in the export is left out.
9. **Objects** also have `h` (height in tiles) and `in` (the object holding it).
   `lock` has `locked`, `number` and, where the game describes the key, `key`.
10. **`light.json`** also has `monoAtLevel` (5), `range` and `names`; each `shades` row has
    nine entries (distances 0 to 8), and 15 means not drawn.
11. **Size.** UW1 is 13.6 MB and UW2 20.5 MB, mostly `mesh.bin` (about 1 MB a level in
    UW1). An indexed or quantised mesh would cut that if it matters.

## Requested: model UVs onto the picture, not the padded layer (2026-11-25)

A texture smaller than its 64 × 64 layer is stored with see-through rows or columns around it:
the gravestone's 64 × 48 picture has 16 empty rows on top, and door pictures 11 to 13 (and a
pixel or two at some sides). `models.bin` maps each textured face onto the whole layer (u and v
0 to 1), so the empty margin is drawn too; the viewer ignores alpha on models, and it showed as a
black band at the top of every gravestone and door. Affected: UW1 layers 62, 66, 67, 70, 73, 75,
81, 122, 123, 161, 162, 164, 165, 179, 181; UW2 layers 52, 61, 62, 129, 168, 172, 184, 211, 261,
292, 294, 295 (doors and gravestones only).

**Ask:** give model vertices the UVs of the picture's real size within its layer (for the
gravestone, v from 16/64 to 1), or list each layer's picture rectangle in
`manifest.textures` (e.g. `rects: [[x, y, w, h], ...]`).

**Meanwhile** the viewer measures each layer's opaque bounding box when the textures load and
remaps model UVs onto it (`uwviewer/viewer.js`, `textureArray` and the models block of the level
loader). Once the export does this, that code can go.

## Requested: enchantments in objects.json (2026-11-25)

`objects.json` marks an object `enchanted` but not what the enchantment is, so the site can't name
it as the game does ("chain gauntlets of Unsurpassed Protection", "a wand of Fireball with 8 full
charges"). **Ask:** add the words LookAt adds for an identified object (obj/LOOK.C `do_of`): e.g.
`"of": "Unsurpassed Protection"`, `"charges": 8`, and for UW2's swapped weapon names (effects 0-7,
`EnchantmentEffects`) what it really does.

**Meanwhile** `tools/extract-uw-enchant.mjs` reads LEV.ARK and STRINGS.PAK itself and writes
`data/<game>/enchant.json` (object index: of, charges, note); `js/lib/uwnames.js` builds the names.
Run it again after a re-export (it warns if the objects no longer match LEV.ARK).

Not done on the editor's side: the pixel comparison with the editor's 3D view (there is no
viewer to draw it with yet), and a run against a real `game.gog`.

`data/uw1` and `data/uw2` hold game data and are not in `.gitignore`.
