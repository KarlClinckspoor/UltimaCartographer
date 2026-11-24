# U9 viewer

A separate static site for Ultima IX: Ascension's maps in 3D (WebGL2), kept in this repository for now. It
draws data the U9 editor bakes (`u9 export-web`, specified in [EXPORT.md](EXPORT.md)); it reads no game files.

## Run it

Bake the data with the U9 editor into `u9viewer/data`, then serve the repository and open the viewer:

    python tools/serve.py 8137
    http://127.0.0.1:8137/u9viewer/

`node u9viewer/tools/check-export.mjs` checks an export against EXPORT.md (references, bounds, counts) and
prints its sizes.

## What it does

- **Terrain**: heights and each quad's texture layer, rotation and hole flag go to the GPU as two integer
  textures; one small grid is drawn per visible tile (instanced), coarser far away, with skirts so the steps
  between grids do not open gaps. Textures come from one texture array, sampled with explicit gradients so the
  per-quad rotation leaves no seams.
- **Objects**: every frame each object is culled by the view and by distance and given a LOD from its model's
  own thresholds; each (model, LOD) is then one instanced draw. Alpha-tested textures cut out; blended ones (glow,
  smoke) are drawn after, without writing depth. Model texture arrays deeper than the GPU allows
  (`MAX_ARRAY_TEXTURE_LAYERS`, usually 2048) are split over two samplers.
- **Water** at the map's water height; fog at the draw distance.
- **Clicking** finds the ground point and the nearest object, with its type, model and position; a map change
  has "Go there", which opens the destination map at the arrival point (or moves there on the same map).
- The address keeps the map and camera: `#map=9&x=502&y=22&z=520&yaw=0&pitch=-0.25`.

Controls: drag to look, WASD to move, Q/E down and up, Shift faster, wheel sets the speed, T top-down.

## Not yet

- Loading is heavy: Britannia pulls about 25 MB of models and 64 MB of PNG textures before every object shows
  (see EXPORT.md's size report; `--texture-max 64` and per-map texture sets would cut it).
- Animated models show their first frame; NPCs and creatures are not in the export.
- No link from the Cartographer yet.
