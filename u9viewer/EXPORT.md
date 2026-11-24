# Ultima IX web export: what the U9 editor should write

This is the contract between the U9 editor (`../../u9`, C#) and the U9 viewer (this folder, a static WebGL2
site). The editor reads the game; the viewer only draws. Everything the viewer needs is baked by one new command
in `U9Editor.Cli`, so the browser does no format decoding, no model assembly and no texture conversion.

Terms, units and bit layouts below are the editor's own (`MapSpace`, `TerrainPoint`, `TerrainMap`,
`TerrainTextures`, `SappearModel`, `TypeTable`, `MapObject`, `MapLinks`). Where this file and the editor's
comments disagree, the editor is right and this file should be fixed.

## Why it is shaped this way

The viewer copies what makes noclip.website feel smooth:

1. **Baked, GPU-ready data.** Vertex and index buffers and texture layers arrive ready to upload.
2. **Terrain in tiles with bounding boxes**, so tiles outside the view are skipped and far tiles drawn coarser.
3. **Instanced models.** Objects are grouped by model, so all visible copies of one model are one draw call.
4. **Two kinds of culling:** the view frustum, and distance (using each model's own LOD thresholds; blended
   things get a shorter distance).
5. **Few state changes:** textures in arrays (no rebinding per object), draws sorted by program and texture.

## The command

```
u9 export-web <gamedata> <out> [--maps 9,10,...] [--texture-max 128] [--no-models]
```

- `<gamedata>`: the GOG install, as for the editor.
- `<out>`: the viewer's data folder (`u9viewer/data`). Written fresh; files of maps not exported are left alone.
- `--maps`: the map numbers to bake (the `N` of `terrain.N`); default every map that has a `terrain.N`.
- `--texture-max`: largest texture side in pixels; larger textures are box-filtered down. Default 128.
- `--no-models`: terrain only (the viewer's first milestone).

It prints a **size report**: per map and in total, the bytes of each file kind below. That report is the first
deliverable: we decide texture sizes and compression from it before the viewer goes further (Britannia's raw
inputs are 307 MB of bitmaps and 76 MB of models; the bake should be a few tens of MB at most).

The output must be **deterministic** (same input, same bytes), so re-exports diff cleanly.

## Output layout

```
data/
  manifest.json                 every map, and the shared files
  textures/terrain-<k>.png      terrain texture layers, 128 x 128 each, stacked vertically, at most 64 a file
  textures/model<S>-<k>.png     model texture layers of side S (32, 64, 128...), stacked vertically, at most 64 a file
  models.bin, models.json       every model any exported map uses, all LODs
  maps/<N>/terrain.bin          the map's terrain
  maps/<N>/objects.bin          its objects, grouped by model
  maps/<N>/objects.json         what the viewer shows when an object is clicked
  maps/<N>/links.json           its map changes
```

Little-endian throughout. `.bin` files have no header; their layouts are described in `manifest.json` / below,
and `manifest.json` carries `"format": "u9web", "version": 1`.

## Coordinates

The viewer uses the editor's **world space** (`MapSpace`): x east, y up, z north, one unit per point spacing;
row 0 is south (`NorthIsRowZero` false). So:

- a terrain point (x, row) with height h is at (x, h / 32, row);
- an object at object units (ox, oy, oz) is at (ox / 128, oz / 4 / 32, oy / 128);
- model space (x east, y north, z up, object units) goes to world by (x, z, y) / 128, then the object's rotation
  and position. The exporter does this axis swap, so `models.bin` is already in world axes and units.

Rotations are the stored quaternions, normalised, converted to world axes by the exporter (same swap), written as
4 x int16 (x, y, z, w) x 32767.

## manifest.json

```json
{
  "format": "u9web", "version": 1,
  "textures": {
    "terrain": {"size": 128, "files": ["textures/terrain-0.png", "..."], "count": 412},
    "model": [{"size": 64, "files": ["textures/model64-0.png"], "count": 230, "modes": "textures/model64.modes"}]
  },
  "maps": [
    {"id": 9, "name": "Britannia", "width": 1024, "height": 1024, "tilesX": 64, "tilesY": 64,
     "waterHeight": 123.5, "waveAmplitude": 2.0, "objects": 41234, "links": 57}
  ]
}
```

`name` is the header's name field (trimmed); `waterHeight` is `TerrainMap.WaterHeight` (point-height scale).

## Textures

- **Terrain layers**: exactly `TerrainTextures`' layers for all exported maps together: one 128 x 128 RGBA layer
  per (texture, frame) pair any exported map uses. The viewer uploads them into one `TEXTURE_2D_ARRAY` and builds
  the mipmaps itself. PNG, RGBA, layers stacked top to bottom; layer `i` of the whole set is file `i / 64`, at
  y = 128 x (i % 64).
- **Model layers**: one array per side length. A model texture (bitmap16 record, frame) is resampled to the
  nearest power of two not over `--texture-max`, and goes in that side's array. Same PNG stacking.
- **Modes**: one byte per model layer in `model<S>.modes`: 0 opaque (RGB565), 1 alpha-tested (ARGB1555 or
  magenta colour key), 2 blended (8-bit intensity: glow, smoke). Terrain layers are all opaque.
- Colour keys come out transparent, as `Bitmap16` already does.

(Compression is for later: once the size report is in, KTX2 / Basis may replace the PNGs. Keep the texture
writer in one place so that is a swap.)

## terrain.bin (per map)

The terrain is written the way the game stores it: a map's tiles share chunks (`TerrainMap.TileChunks`).

```
u32 chunkCount
chunkCount x chunk:   256 x u32 point, the 16 x 16 points of a TerrainChunk, row by row (index x + 16 y)
tilesX * tilesY x u16: the chunk of each tile, index tileX + tileY * tilesX
```

with each **point re-coded for the viewer** (still one u32):

- bits 0-11: height, as `TerrainPoint.Height`;
- bit 12: hole;
- bits 13-14: rotation, as `TerrainPoint.Rotation`;
- bits 16-31: terrain layer (index into the terrain array), 0xFFFF when the (texture, frame) pair is missing.

The viewer builds each tile's 17 x 17 vertices from its chunk plus the first column and row of the tiles east and
north, computes normals, and keeps an AABB per tile for culling.

## models.bin / models.json

One shared file for every model the exported maps use. Faces with flag bit 3 (not drawn) are left out.

`models.bin`:

```
vertices: 32 bytes each
  f32 x 3   position (world axes and units, relative to the model's origin)
  i8 x 4    normal (x, y, z) x 127, then 0
  f32 x 2   uv (as stored: v = 0 at the texture's top; UVs wrap)
  u16       texture: (array index << 12) | layer, or 0xFFFF for an untextured face
  u8 x 2    0
  -- plus, for untextured faces, the colour: see "colour" below
indices: u32 x count, three per triangle
```

(Untextured faces: give their three vertices `texture` 0xFFFF and put the face colour in the two spare bytes and
the normal's fourth byte as RGB565 + alpha; or, simpler, write a separate RGBA8 colour stream. Either is fine;
say which in `models.json` under `"colour"`.)

`models.json`:

```json
{
  "vertexBytes": 32, "colour": "rgb565-in-padding",
  "models": {
    "1234": {"bbox": [x0, y0, z0, x1, y1, z1], "lodDistances": [d0, d1, d2, d3],
             "lods": [{"firstIndex": 0, "indexCount": 3600, "baseVertex": 0, "blended": false}]}
  }
}
```

- Keys are sappear.flx record numbers. `lods[0]` is the most detailed; empty LODs are left out.
- `lodDistances`: the header's four thresholds converted to world units (they look like squared distances in
  object units; say in a comment which conversion you settled on).
- `blended`: true if any of the LOD's faces use a blended texture; the viewer draws those after opaque ones.
- Animated models: first frame only (`Face.Frame`, the material's first animation frame), as the editor does.

## objects.bin / objects.json (per map)

Every drawn object of `fixed.N` and `nonfixed.N`, **grouped by model** (all objects of one model together, models
in ascending order), so the viewer can upload one instance buffer and draw each model's run in one call.

`objects.bin`, 24 bytes an object:

```
f32 x 3   position (world)
i16 x 4   rotation quaternion (world axes) x 32767
u16       model (sappear.flx record: the nonfixed override, else the type's default)
u16       object index in objects.json
```

Left out of `objects.bin` (but still in `objects.json`, with `"drawn": false`): objects whose type has no model
or whose model has no drawable faces, and invisible helper types (trigger zones such as type 1111, arrival markers
such as type 1134). The viewer shows those as markers when asked.

`objects.json`: one entry per object, in a stable order (fixed first, then nonfixed, each in file order):

```json
[{"type": 512, "name": "door", "fixed": true, "drawn": true, "x": 501.5, "row": 553.2, "height": 210,
  "link": 0, "book": 0}]
```

`name` from TYPENAME.FLX, `x`/`row`/`height` in terrain points as `MapObject` gives them, `link` the nonfixed link
number (0 if none), `book` the type's book field. More fields (usecode, flags, weight) are welcome: the viewer
shows whatever is there.

## links.json (per map)

`MapLinks` for the map, one entry per map change:

```json
[{"object": 1203, "script": "...", "toMap": 12, "toX": 34.5, "toRow": 80.0, "toHeight": 96,
  "toObject": 88, "markerType": 1134}]
```

`object` and `toObject` are indices into the two maps' `objects.json`. Links whose destination could not be
resolved still appear, with `toObject: null` and whatever is known. The viewer turns each into "go there".

## Checks the export should pass

- Counts match the editor: objects per map, links per map, terrain layers (`TerrainTextures.Layers.Count`).
- Every `objects.bin` model is in `models.json`; every texture reference points at a real layer; every
  `terrain.bin` chunk index is below `chunkCount`.
- Re-exporting gives identical bytes.
- A size report for Britannia (map 9) alone, then for every map.

## Milestones (viewer side, for context)

1. Terrain only (`--no-models`): tiles, culling, fly camera, top-down mode.
2. Models: instancing by model, distance culling with LODs, blended last.
3. Clicking objects (objects.json) and map links (links.json, load the destination map).
4. All maps; a link from the Cartographer to a map and position, and back.

## As implemented (u9 export-web, editor commit c6cefba)

Where the editor's output differs from or adds to the text above:

- **Vertex (32 bytes):** f32 x3 position, i8 x4 normal x127 (the fourth byte is an untextured face's alpha),
  f32 x2 uv, u16 texture, **u16 untextured colour as RGB565** (0 when textured), **u32 zero**. `models.json`
  says `"colour": "rgb565-in-padding"`.
- **models.bin** is the vertices, then the u32 indices; `models.json` gives `vertexCount`, `indexOffset` (bytes)
  and `indexCount`. Indices are relative to each LOD's `baseVertex`. Vertices are shared within a LOD.
- **Winding:** swapping y and z mirrors models, so triangle winding is reversed. Draw both sides (the editor
  does), or flip the winding.
- **lodDistances:** the thresholds are squared distances in object units (250000 = 500 units); written as
  `sqrt(t) / 128` world units, `null` for 0, 0xFFFFFFFF and the odd value above 2^31 (no limit).
- **Object rotation in world axes:** the stored quaternion (x, y, z, w) becomes (-x, -z, -y, w). The y/z swap is a
  mirror, so the axis swaps and the angle changes sign.
- **Model texture sides:** the power of two nearest the frame's larger side, at most `--texture-max`, at least 8.
  Arrays seen: 8, 16, 32, 64, 128.
- **Modes:** 0 opaque, 1 alpha-tested (ARGB1555, or RGB565 with magenta-keyed pixels), 2 blended (8-bit intensity).
- **Not drawn:** types 1111 and 1134, the placeholder type 8191, objects with no model, and models whose every face
  has flag bit 3 (blocking walls).
- **objects.json** also has `model`, `flags`, `usecode` and `weight`. **links.json** also has `trigger` (the
  TRIGGERS.FLX slot) and `toLink`.
- **Terrain points:** bit 15 of the game's point is dropped (its meaning is unknown).
- **Size report** (Debug build, this machine): Britannia alone 73 MB in 8 s, of which model textures at 128 px are
  37 MB, `models.bin` 15 MB, `terrain.bin` 5.5 MB, `objects.json` 5.1 MB. Every map: 180 MB in 14 s (model
  textures 58 MB, `models.bin` 25 MB). `--texture-max 64` is the obvious first saving.
