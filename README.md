# 240 Racing (JavaScript)

A browser re-implementation of **240 Racing v1.01** (1998, DOS), the top-down Volvo 240 racer by
Alexander Sandström, Mikael Sjöberg and Lars Andersson (Brålanda). The game logic was reverse-engineered
from the original Turbo Pascal 6 executable and rewritten in JavaScript (HTML5 canvas, Web Audio).

The start page offers two ways to play. Both run on the same engine.

## Free edition (nothing to download)

Every asset the engine needs is generated in the browser by code in `public/js/free/`. None of it comes from the
original game:

| engine needs | free edition |
|---|---|
| two tracks (picture, palette, start grid, checkpoints) | *Sjökanten Raceway* (lakeside) and *Vinterringen* (winter), built from splines with procedural ground, lake, trees, rocks and a cabin |
| title picture | a new dusk scene with a generic boxy sedan and a new logo |
| start lights | new drawings |
| car sprites (32x14) | new top-down sedans, red and yellow |
| 7x8 font | an original 5x7 typeface with drop shadow |
| scroller text, default hiscores, track names | newly written; the hiscore drivers are fictional |

Free-edition hiscores are stored separately from original-game hiscores.
The short functional labels shared by both editions (LAP:, MPH:, GET READY!, menu items and so on) are part of the engine.

## Original edition (bring your own game files)

The original tracks, pictures, car sprites and font are the authors' work and are not included or served. To play the
original, drop the `240racing.zip` distribution (or the loose files) onto the page:

- required: `240R.EXE`, `GFX.BIN`, `240BURN.BIN`, `BANA1.LEV`, `BANA2.LEV` (hiscore files are optional)
- files are parsed locally and cached in IndexedDB; nothing is uploaded

Car textures, font, scroller text and default hiscores are read straight out of the player's `240R.EXE` at runtime.

## Run locally

```sh
npm start            # http://localhost:3000  (PORT to override)
```

For development, put the original files in `./original/` (gitignored). On `localhost` the page loads them
automatically from `/dev-data/`. That route is disabled when `NODE_ENV=production` or on Railway.

## Deploy to GitHub Pages

The game is plain static files, so GitHub Pages can host it with no server. `.github/workflows/pages.yml` publishes
`public/` on every push to `main` (repo Settings → Pages → Source: GitHub Actions).

## Deploy to Railway

No dependencies and no build step: Railway detects Node from `package.json` and runs `node server.js`
(see `railway.json`, health check at `/healthz`). The server listens on `$PORT`.

1. Push this directory to a GitHub repo (`original/` is gitignored, so the game files are not pushed).
2. In Railway: New Project → Deploy from GitHub repo → pick the repo.
3. Settings → Networking → Generate Domain.

Or with the CLI: `railway init && railway up`.

## Controls

| | red car (player 1) | yellow car (player 2) |
|---|---|---|
| accelerate | A | Ctrl |
| brake | Z | Alt |
| reverse | X | ↓ |
| steer | S / F | ← / → |

Space starts a race, F1 help, F2 options (players, laps 3/6/9, track, sound, LAKRIS skid marks, key setup),
H hiscores, keypad +/− (or +/− on the main row) sound, Esc quits. One player is a time trial; there is no AI.
On macOS, Ctrl+←/→ may switch desktops, so remap the yellow car's keys in F2 → Setup keys.

## How faithful is it

The engine is a line-by-line port of the decompiled Turbo Pascal program, including its quirks:

- physics runs once per emulated VGA retrace (70.086 Hz), lap times use the reprogrammed 100 Hz PIT timer
- cars are rotated, texture-mapped quads drawn with the original 9.7/8.8 fixed-point scan converter
- "collision" is the original single-pixel probe under the car's nose (off-road = speed × 0.93 per frame)
- skid marks are burnt permanently into the background buffer, shaded by drift angle
- hiscore tables are chosen by lap count and stored in the original 262-byte record format (kept in localStorage)
- original bugs are kept (e.g. the 1-px sprite trails, the "LOOSER" spelling, track 3 being unselectable)

Not ported: the text-mode shareware screen shown on exit to DOS; the page returns to the start screen instead.

## Layout

```
server.js            static file server (zero dependencies)
railway.json         Railway deploy settings
public/index.html    page + file loader UI
public/js/
  main.js            boot: pick an edition, load/validate files, start the game
  assets-original.js asset set read from the player's original files
  free/              asset set generated from code (free edition)
    index.js         FreeAssets: same interface as the original asset set
    tracks.js        spline tracks, scenery, checkpoints and start grid
    title.js         title picture and logo
    sprites.js       track palette layout, car textures, start lights
    font.js          5x7 typeface
    raster.js        indexed-colour drawing helpers (noise, dithering, shapes)
  files.js           zip reader, validation, IndexedDB cache
  exe.js             MZ parsing, Turbo Pascal Real conversion
  tp.js              Turbo Pascal runtime semantics (Round, Str, Random)
  vga.js             mode 13h: 64 KB VGA segment, palette, Blit
  clock.js           100 Hz PIT timer and 70.086 Hz vertical retrace
  input.js           scancode key table (the game's INT 9 handler), BIOS ReadKey buffer
  speaker.js         PC speaker (square wave, PIT-quantised pitch)
  dosfs.js           HISCORE*.DAT files
  game.js            program flow, title screen, race loop, menus   (segment 000)
  physics.js         car movement, skid marks, HUD                   (000:0529, 0e11, 142e)
  cars.js            rotated textured car sprites                    (unit 57d)
  font.js            7x8 font, text output, name entry               (unit 468)
  hiscore.js         hiscore tables and key names                    (unit 3af)
```
