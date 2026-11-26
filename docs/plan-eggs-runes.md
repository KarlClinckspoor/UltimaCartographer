# Plan: finish the U6-engine eggs and runic text in U4, U5, U6 and U7 (needs the game files)

For a local session that has the GOG games and the decompilations next to this repository. A cloud session
(no game files) did the first part on branch `ccr-da9470be-osbhlv`. What is left needs the games' font files
and the decompiled sources. Delete this file when the work is done.

The goal for runic text, in every game that has it: a "Runic text" choice (Translated / In runes) that draws
the text in **that game's own rune font**, never another game's. Ultima VI is done apart from extracting its
font (tasks 2–3). Ultima IV, V and VII are task 6.

## What is already done (commit "U6 engine: what eggs hatch drawn on the map …")

- `js/games/u6/engine.js`
  - At load, every egg's contents (embryos) are placed on the egg's square in `d.spawnAt[z]`, one of each
    embryo, invisible ones (status bit 2) skipped. They are drawn after the people on the square, as layer
    `spawns` ("Egg spawns, all hatched"), on by default, in the far-out average-colour view too.
  - `eggLine()` writes the egg's popup: chance, hours, and how many of each embryo. **The cloud session took
    these rules from Nuvie, which this project must not rely on.** Task 4 replaces them with what the
    decompilations say.
  - Search finds eggs ("Egg: Drake"), listed after the people.
  - Runes: `translit()` drops `%` (BOOK.DAT writes it just before every `^` EA and `\` EE, 15 times in all,
    never elsewhere). New `runes` param for Ultima VI (`cfg.runes` in `js/games/u6/index.js`): 0 Translated
    (default), 1 In runes. `loadRunes()` loads `data/u6/runes.png`, or falls back on `data/u5/font1.png`
    (Ultima V's RUNES.CH, the same runes on the same keys, no Gargish). `runicHTML()` draws each character
    from the font as a CSS sprite; a character whose glyph is blank is written as itself, except `%`, which
    is left out. The translation is the paragraph's `title` and `aria-label`.
- `tools/extract-u6.mjs`: writes `data/<game>/runes.png` from the second half of `U6.CH` (128 glyphs of 8 × 8,
  16 a row, white on transparent, the layout `extract-u5.mjs` uses for RUNES.CH). Not run yet: no game files
  in the cloud. Its comment says Nuvie loads the file this way; task 2 confirms the layout from the
  decompilation instead.

**Rule for everything below: work only from the decompilations listed in the README's credits (u4-decompiled
through its port, u5d, u6-decompiled, u6se- and u6md-decompiled, Ultima7_Decomp). Do not use Nuvie, Exult or
ScummVM, and remove the Nuvie references the cloud session added** (the comments in `js/games/u6/engine.js`
and `tools/extract-u6.mjs`, and the README's U6-engine notes). Check against the running game in DOSBox
where it helps.
- `js/app.js`: `cell(x, y, at, off)` is now given the Set of layers switched off.
- `css/site.css`: `.sign.runic`, `.rune-word`, `.rune-glyph`.
- `tests/u6-data.test.mjs`: checks the `%` pattern and that the egg at 569, 340 holds a drake.
- README: the U6-engine notes describe the new layer and the runes.

## Tasks

### 1. Get the branch

    git fetch origin ccr-da9470be-osbhlv && git checkout ccr-da9470be-osbhlv

### 2. Extract Ultima VI's rune font

    node tools/extract-u6.mjs u6 "C:/GOG Games/Ultima 6" ../u6-decompiled/dialogue.json

- Before trusting the output, confirm in `../u6-decompiled` (the font loading and text drawing code) that
  `U6.CH` really is two fonts of 128 8 × 8 glyphs with the runes and Gargish in the second. Fix the extractor
  if it isn't, and replace the Nuvie reference in its comment with the decomp's function.
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

### 4. Take the egg rules from the decompilations

`eggLine()` currently states, for all three games, rules taken from Nuvie. Treat them as unverified guesses:

- An egg is checked once each time you come within 20 squares of it, approaching from farther than 8.
- It hatches if a random 1–100 is at most its quantity; a quantity of 100 or more always hatches.
- Its quality sets the hours: under 10 any time, 10–19 by day (06:00–18:59), 20–29 by night, 30 and over
  any time. Quality % 10 is the alignment (not shown).
- Each embryo hatches 1 to its quantity at random, or exactly its quantity when the egg's quantity is 100.
  Ultima VI's silver serpent (0x19D) hatches only one.

Read the egg code in `../u6-decompiled/SRC` (egg.c, and where the game loop calls it), then in
`../u6se-decompiled` and `../u6md-decompiled` (the headers of `js/games/se/index.js` and `md/index.js`
already cite their egg.c). Write `eggLine()` from what that code does, rule by rule: keep, change or drop
each of the above, and add anything the code does that the list misses. Also check whether the map should
draw one of each embryo or more, and where. Look closely at what the cloud session could not explain:

- SE egg quantities 0, 2, 201 and 255; MD egg qualities 100 and 104; MD embryo qualities up to 27.
- Status bits: one U6 egg has status 0x20; some embryos have 0x20 or 0x40 set. Do any eggs hatch only once,
  or only after a story flag?
- Where hatched creatures appear: on the egg's square, or tossed around it. The map now draws one of each
  embryo on the egg's square.

If a game differs, give that game's config its own rules (for example a `cfg.eggRules(egg, embryo)` returning
the sentences, defined in its `index.js`) instead of branching on `cfg.id` inside the engine. The comments
above `eggLine` and at the spawn placement in `load()`, and the README's U6-engine notes, should cite the
decompilations' files and functions only, as the rest of the engine does.

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

### 6. Runic text in Ultima IV, V and VII, each in its own font

First make the U6 code shared. Move `loadRunes` and `runicHTML` (and `translit`) out of
`js/games/u6/engine.js` into a helper, e.g. `js/lib/runes.js`, that takes a font sheet URL plus a description
of the font: glyph size, glyphs per row, which characters are runes, digraph keys, and characters to leave
out. Use the same param in every game: key `runes`, options `[[0, 'Translated'], [1, 'In runes']]`, default 0,
so a link keeps the choice across games. Each game gets the param only if it has runic text. Keep the CSS
classes from `css/site.css` (`.sign.runic`, `.rune-word`, `.rune-glyph`), but have the helper set the glyph
size, since U7's glyphs are not 8 × 8.

Once U6's own font is extracted, remove U6's fallback to Ultima V's font (`data/u5/font1.png` in
`loadRunes`). The rule is each game's own font. If a font file is missing, the page shows the translation
and logs how to extract the font.

**Ultima IV**
- Find out whether the game shows any text in runes (signs, the Codex chamber, the end game, anything that
  prints with rune glyphs). Check `../u4-decompiled-port` for where the rune glyphs of `CHARSET.EGA` are
  printed. `data/u4/charset.png` is already extracted, so look at it for rune glyphs and note their codes.
- If there is runic text: extract it with its rune codes kept (`tools/extract-u4.mjs`), show it where it
  belongs on the maps, and draw it from `charset.png` (U4's own font).
- If there is none: say so in the README's Ultima IV notes and give U4 no Runic text choice.

**Ultima V**
- Signs are made plain at extraction: `scrub()` in `tools/extract-u5.mjs` (around line 188) maps `[ ^ _ ] \`
  to TH EA ST NG EE, turns `@` into a space and turns bytes above 127 into letters. That throws away which
  characters were runes. Check in u5d (`ultima.c`, the sign display code) which bytes the game prints from
  `RUNES.CH` and which from `IBM.CH`: are signs all runes, or do the high-bit bytes switch font?
- Keep the raw sign text in `u5.json` (for example `raw` beside `text`), and draw it with `data/u5/font1.png`
  (RUNES.CH) and `data/u5/font0.png` (IBM.CH) where the game switches fonts. Show it in `signHTML` in
  `js/games/u5/index.js` when the choice is In runes.
- Other U5 text in runes: talk lines marked `{rune}` (index.js around line 268), and the sextant reading
  (`sextant` in index.js: "the game prints them in runes"). Draw those in runes too when the choice is on,
  or leave a note in the code saying why not.

**Ultima VII (The Black Gate and Serpent Isle)**
- The U7 module (`js/games/u7/engine.js`, `tools/extract-u7.mjs`) shows no sign, plaque, gravestone or book
  text yet, so this is new work for both games.
- Work from the Ultima7_Decomp checkout (KarlClinckspoor/Ultima7_Decomp) only. The existing U7 extractor's
  comments cite Exult for the file formats; leave that code alone, but don't add new Exult-based code or
  references.
- Find where the texts are kept. The sign, plaque, gravestone and book texts are expected to be in
  `USECODE`, shown through a usecode intrinsic that opens the sign or book display. In the decompilation, find
  that intrinsic and its display code, which shapes are signs, plaques, gravestones and books, and how each
  item's quality or frame picks its text. Extract the texts per game into `u7bg.json` and `u7si.json`.
- Fonts: `FONTS.VGA` in each game's `STATIC` folder. From the decompilation's sign display code, find which
  font number it draws with, for each game (Serpent Isle may use a different one). Find the font format
  there too. Extract that font from each game into its own sheet (`data/u7bg/runes.png`,
  `data/u7si/runes.png`) with each glyph's width if the font is proportional; the shared helper must then
  support a width table.
- Show the text in the item popup (the U7 `cell()`), in runes or translated, and add the texts to search.
  Check a few signs against the game in DOSBox (Britain's street signs, a gravestone, a plaque).

For each game, add a test along the lines of the U6 one: no character in the runic texts that the font
leaves blank, and the digraph keys used only where the game uses them. Then update the README's notes for
that game.

### 7. Tests and commit

- Run each test on its own: `for t in tests/*.test.mjs; do node "$t" || echo "FAIL $t"; done`.
  (`node --test tests/` fails on Node 22 because it won't take a folder; this predates these changes.
  Optionally change the README to `node --test tests/*.test.mjs`.)
- Optionally add to `tests/u6-data.test.mjs`: `data/u6/runes.png` exists, and glyphs `A`–`Z` and `[`–`_` are
  not blank.
- Commit `data/u6/runes.png` and any fixes on the same branch and push. Remove this file in that commit, or
  leave it if something is still open.
