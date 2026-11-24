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

Not done on the editor's side: the pixel comparison with the editor's 3D view (there is no
viewer to draw it with yet), and a run against a real `game.gog`.

`data/uw1` and `data/uw2` hold game data and are not in `.gitignore`.
