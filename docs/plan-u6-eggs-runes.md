# Plan: finish the U6-engine eggs and Ultima VI runes (needs the game files)

For a local session that has the GOG games and the decompilations next to this repository. A cloud session
(no game files) did the first part on branch `ccr-da9470be-osbhlv`; what is left needs `U6.CH` and the
decompiled sources. Delete this file when the work is done.

## What is already done (commit "U6 engine: what eggs hatch drawn on the map …")

- `js/games/u6/engine.js`
  - At load, every egg's contents (embryos) are placed on the egg's square in `d.spawnAt[z]`, one of each
    embryo, invisible ones (status bit 2) skipped. They are drawn after the people on the square, as layer
    `spawns` ("Egg spawns, all hatched"), on by default, in the far-out average-colour view too.
  - `eggLine()` writes the egg's popup: chance, hours, and how many of each embryo. **These rules come from
    Nuvie (ScummVM `engines/ultima/nuvie/core/egg_manager.cpp`), not from the decompilations.** See task 4.
  - Search finds eggs ("Egg: Drake"), listed after the people.
  - Runes: `translit()` drops `%` (BOOK.DAT writes it just before every `^` EA and `\` EE, 15 times in all,
    never elsewhere). New `runes` param for Ultima VI (`cfg.runes` in `js/games/u6/index.js`): 0 Translated
    (default), 1 In runes. `loadRunes()` loads `data/u6/runes.png`, or falls back on `data/u5/font1.png`
    (Ultima V's RUNES.CH, the same runes on the same keys, no Gargish). `runicHTML()` draws each character
    from the font as a CSS sprite; a character whose glyph is blank is written as itself, except `%`, which
    is left out. The translation is the paragraph's `title` and `aria-label`.
- `tools/extract-u6.mjs`: writes `data/<game>/runes.png` from the second half of `U6.CH` (128 glyphs of 8 × 8,
  16 a row, white on transparent, the layout `extract-u5.mjs` uses for RUNES.CH). Not run yet: no game files
  in the cloud.
- `js/app.js`: `cell(x, y, at, off)` is now given the Set of layers switched off.
- `css/site.css`: `.sign.runic`, `.rune-word`, `.rune-glyph`.
- `tests/u6-data.test.mjs`: checks the `%` pattern and that the egg at 569, 340 holds a drake.
- README: the U6-engine notes describe the new layer and the runes.

## Tasks

### 1. Get the branch

    git fetch origin ccr-da9470be-osbhlv && git checkout ccr-da9470be-osbhlv

### 2. Extract Ultima VI's rune font

    node tools/extract-u6.mjs u6 "C:/GOG Games/Ultima 6" ../u6-decompiled/dialogue.json

- Expect a new `data/u6/runes.png`, 128 × 64. Open it: capitals should be runes, `[ \ ] ^ _` the TH, EE,
  NG, EA, ST runes, lower case the Gargish letters.
- Nothing else in `data/u6` should change. If `u6.json` or the `.bin` files differ, find out why before
  committing (a different dialogue.json, for instance) rather than committing the drift.
- The Savage Empire and Martian Dreams have no runic text (SE has no BOOK.DAT; MD's MDTEXT has no `<…>`), so
  there is nothing to extract for them. Re-running their extractors should leave their data unchanged.

### 3. Settle what `%` is

The cloud session could only show that `%` always comes right before `^` or `\` in BOOK.DAT. Find out what
the game does with it:

- Look at glyph 0x25 in `runes.png` (U6.CH offset `(128 + 0x25) * 8`). Is it blank, a mark, or half of a
  wider rune?
- In `../u6-decompiled/SRC`, find the code that shows a sign's or book's text (objcmd.c read/look, and the
  console or text print routine it calls) and see whether `%` (0x25) gets special handling: a control
  code, a printf-style escape, a switch of font or width.
- Then:
  - **Blank glyph, or a control code that draws nothing:** the current behaviour is right (left out in
    both modes). Put the decomp's function name in the comment above `translit` in `engine.js`.
  - **Drawn by the game:** `runicHTML` already draws a non-blank glyph. Check that it looks right next to
    the EA and EE runes (tombstone at 138, 197: "SW%\PERS").
  - **Something that changes the next glyph (wider, joined):** change `runicHTML` to match, and say so in the
    README's U6-engine notes, which currently say `%` "adds no letter".

### 4. Check the egg rules against the decompilations

`eggLine()` currently states, for all three games:

- An egg is checked once each time you come within 20 squares of it, approaching from farther than 8.
- It hatches if a random 1–100 is at most its quantity; a quantity of 100 or more always hatches.
- Its quality sets the hours: under 10 any time, 10–19 by day (06:00–18:59), 20–29 by night, 30 and over
  any time. Quality % 10 is the alignment (not shown).
- Each embryo hatches 1 to its quantity at random, or exactly its quantity when the egg's quantity is 100.
  Ultima VI's silver serpent (0x19D) hatches only one.

Check each of these in `../u6-decompiled/SRC` (egg.c, and wherever it is called from the game loop), then in
`../u6se-decompiled` and `../u6md-decompiled` (their `js/games/se/index.js` and `md/index.js` headers
already cite their egg.c). Look closely at what the cloud session could not explain:

- SE egg quantities 0, 2, 201 and 255; MD egg qualities 100 and 104; MD embryo qualities up to 27.
- Status bits: one U6 egg has status 0x20; some embryos have 0x20 or 0x40 set. Do any eggs hatch only once,
  or only after a story flag?
- Where hatched creatures appear: on the egg's square, or tossed around it. The map now draws one of each
  embryo on the egg's square.

If a game differs, give that game's config its own rules (for example a `cfg.eggRules(egg, embryo)` returning
the sentences, defined in its `index.js`) instead of branching on `cfg.id` inside the engine. Change the
comment above `eggLine` to cite the decomp's functions instead of Nuvie wherever they agree.

### 5. Look at it in the browser

    python tools/serve.py 8137

- `#u6/L0?view=569.5,340.5,6`: a drake on the egg square; its popup says "Drake (from an egg)" and gives
  the egg's rules. Switch the layer off: the drake goes and the popup is the egg alone.
- `#u6/L0?runes=1&view=138.5,197.5,6`: click the tombstone. It should be drawn in U6's own runes now, with
  no 404 for `runes.png` in the console. Hover for the translation. If you can, compare it with the game in
  DOSBox.
- Find a Gargish text (a BOOK.DAT entry with lower case inside `<…>`) and check its glyphs with `runes=1`.
- Check The Savage Empire and Martian Dreams for console errors and for eggs drawn in sensible places
  (myrmidex drones, robosaurs).

### 6. Tests and commit

- Run each test on its own: `for t in tests/*.test.mjs; do node "$t" || echo "FAIL $t"; done`.
  (`node --test tests/` fails on Node 22 because it won't take a folder; this predates these changes.
  Optionally change the README to `node --test tests/*.test.mjs`.)
- Optionally add to `tests/u6-data.test.mjs`: `data/u6/runes.png` exists, and glyphs `A`–`Z` and `[`–`_` are
  not blank.
- Commit `data/u6/runes.png` and any fixes on the same branch and push. Remove this file in that commit, or
  leave it if something is still open.
