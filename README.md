# Arcade Hub

**Live:** <https://omerfarukoktay112-max.github.io/arcade-hub/>

A serverless, dependency-free retro arcade game library that runs in the browser. 12 classic games with a dark, neon-accented interface. All graphics are drawn in code on a canvas and all sounds are generated with Web Audio. There is no build step, npm package, framework or CDN: just put the files on GitHub Pages as they are.

- Plain HTML + CSS + vanilla JavaScript (ES modules)
- Desktop (keyboard/mouse) and mobile (tap, swipe, long press) support. On phones the game menu becomes a single bar that opens a game picker with all 12 games (it opens by itself on first visit), buttons are at least 44 px, and the canvas is sized to the visible screen height. Once you start playing, the header hides and only a slim bar (name, full screen, pause) stays so the board gets bigger; wide games (Pong, Life) suggest turning the phone sideways
- Crisp rendering on HiDPI/Retina displays
- High scores, game settings and language preference are stored in the browser's `localStorage`
- Direct links such as `#tetris`
- **Installable and offline:** add it to the home screen as an app (web app manifest); after the first visit it also opens without a connection (service worker, network-first so updates show up immediately)
- **Multilingual:** Turkish and English (the 🌐 selector in the top bar). Game names, buttons, rules and all text drawn on the canvas switch instantly, without restarting the game. On first visit the browser language is used (Turkish if it is neither)
- **Game settings (⚙):** settings panel for Snake, 2048, Breakout, Flappy Bird and Memory Match; the *⚙ Settings* button on the ready screen (O key) opens it too
- **Per-game theme:** top bar buttons, menu, title and canvas glow take on each game's own color palette
- **Transitions:** switching games plays a theme-colored blind-wipe curtain, fades in the title and text, and smoothly blends the colors; ready/game-over screens fade in. If "reduce motion" is enabled in the OS, only fades are used instead of movement

## Games and controls

In every game **P / Esc** pauses and resumes; the game pauses automatically when the tab is hidden. Press **Space / tap** to start and **Enter / tap** to restart after the game ends. The top bar has **Settings**, **Pause** and **Sound** buttons and the **language** selector (only icons are shown on narrow screens). The game is suspended while the settings panel is open; **Esc** closes the panel.

In the Turkish interface the game names appear as *Yılan, Mayın Tarlası, Tuğla Kırıcı, Flappy Kuş, XOX, Dört Bağla, Işıkları Söndür, Hafıza Eşleştirme, Hayat Oyunu*; links (`#snake` etc.) are language-independent.

| Game | Link | Controls |
|---|---|---|
| **Snake** | `#snake` | Arrow keys / WASD · swipe on mobile · ⚙ map size (15×14 – 40×37), snake color (including rainbow), 1/2/3/5 apples at once |
| **2048** | `#2048` | Arrow keys / WASD · swipe. On reaching the target: *Continue* (Space) or *Restart* (Enter) · ⚙ grid 3×3 / 4×4 / 5×5 / 6×6, Roman numerals |
| **Minesweeper** | `#minesweeper` | Left click / tap: reveal · Right click / long press: flag · Click a revealed number: open its neighbors (chord) · 1/2/3 or the buttons on top: Easy 9×9 / Medium 16×16 / Hard 16×30 |
| **Tetris** | `#tetris` | ←/→ move (hold: auto-repeat) · ↑ / X rotate · Z rotate counter-clockwise · ↓ soft drop · Space hard drop · C / Shift hold · Mobile: tap = rotate, horizontal drag = move, swipe down = hard drop, swipe up = hold |
| **Pong** | `#pong` | 1 / 2: number of players · Player 1: W/S (also ↑/↓ in single player) · Player 2: ↑/↓ · Mobile: the paddle follows the height you touch |
| **Breakout** | `#breakout` | Mouse / touch or ←/→ (A/D) · Space / click: launch the ball · catch falling capsules with the paddle · ⚙ power-up frequency (off / normal / lots) |
| **Flappy Bird** | `#flappy` | Space / ↑ / click / tap: flap · ⚙ bird color (7) and look (crown, shades, ninja, top hat, robot) |
| **Tic-Tac-Toe** | `#tictactoe` | Click / tap or arrows + Enter · 1 / 2: number of players · K / Z: easy / hard |
| **Connect Four** | `#connect4` | Pick a column with mouse / touch and drop · ←/→ + Enter / Space · 1 / 2: number of players |
| **Lights Out** | `#lightsout` | Click / tap or arrows + Enter · R / *Reset*: restart the level · H / *Hint* |
| **Memory Match** | `#memory` | Click / tap or arrows + Enter · ⚙ difficulty: 3×4 / 4×4 / 4×5 / 5×6 cards |
| **Conway's Game of Life** | `#life` | Space: play/pause · N: single step · C: clear · R: random · + / −: speed · 1 / 2 / 3: glider / pulsar / Gosper glider gun · Drag: draw (right click: erase) · Mobile: bottom toolbar |

If the hash is missing or invalid, Snake opens.

## Running locally

ES modules do not load over `file://`; any static server will do. Run one of these in the project folder:

```sh
python -m http.server 8000      # Python 3 (on some systems: python3)
npx serve .                     # Node.js
node tests/serve.mjs 8000       # built-in, dependency-free server
```

Then open <http://localhost:8000/>. `node tests/serve.mjs` also emulates the GitHub Pages subdirectory: <http://localhost:8000/arcade-hub/>.

## Tests

None of them need npm packages (Node.js 22+ recommended):

```sh
node tests/check.mjs          # node --check on every JS file; import paths and letter case;
                              # no absolute/external paths in HTML; app.js registry; no listeners/timers in games;
                              # i18n: dictionaries share the same keys, every key used in code/HTML/settings exists
node tests/logic.test.mjs     # 68 pure logic tests (2048 merging/sizes/Roman, Tetris SRS, Minesweeper
                              # flood fill/chord, minimax, alpha-beta, power-ups, settings, text fitting…)
node tests/browser-smoke.mjs  # headless Chrome/Edge: opens all 12 games by hash and menu, plays them with real
                              # keyboard/mouse/touch events, fast game switching, 375px mobile layout, language
                              # switching, theme, settings panel, game-over overflow check for every game and
                              # language, frame-rate policy, mobile game picker, play mode, swipe direction
                              # lock, touch texts, PWA (installable, opens with the server stopped);
                              # fails on any console error
```

To test the deployed site: `node tests/browser-smoke.mjs --url https://<user>.github.io/arcade-hub/`. The browser test finds Chrome/Edge on its own (it can also be set with `CHROME_PATH`); it is skipped if no browser is found. `--shots <folder>` saves a screenshot of every game.

## Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g. `arcade-hub`) and push the project:
   ```sh
   git remote add origin https://github.com/<user>/arcade-hub.git
   git push -u origin main
   ```
2. In the repository go to **Settings → Pages**.
3. Select **Build and deployment → Source: Deploy from a branch**.
4. Choose **Branch: `main`**, folder **`/ (root)`** and press **Save**.
5. After a minute or two the site is live at `https://<user>.github.io/arcade-hub/`.

All paths are relative, so it works in a subdirectory without changes. The empty `.nojekyll` file in the root disables Jekyll processing.

## Adding a new game

1. Create `js/games/NewGame.js`:
   ```js
   import { BaseGame, NEON } from '../core/BaseGame.js';
   import { t } from '../core/I18n.js';

   export class NewGame extends BaseGame {
     static meta = {
       id: 'new',                 // hash: #new
       get title() { return t('new.title'); },             // text comes from the dictionaries (js/i18n/*.js)
       width: 600, height: 600,   // logical resolution
       theme: [NEON.cyan, NEON.pink],                      // top bar / menu colors
       get controls() { return t('new.controls'); },
       get touchControls() { return t('new.touchControls'); },   // shown on touch devices
       icon: '🎮',                                         // shown in the mobile game picker
       get description() { return t('new.description'); },
     };

     // Optional: settings that appear automatically in the ⚙ panel (value: this.settings.speed)
     static settings = [
       { id: 'speed', labelKey: 'new.set.speed', default: 1,
         options: [{ value: 1, labelKey: 'new.slow' }, { value: 2, labelKey: 'new.fast' }] },
     ];

     reset() {
       super.reset();             // score = 0
       this.x = 300;
     }

     update(dt) {
       if (super.update(dt)) return;          // ready/game-over screens are handled by the base class
       if (this.input.isDown('ArrowLeft')) this.x -= 200 * dt;
       if (this.input.wasPressed('Space')) this.score++;
       if (this.score >= 10) this.gameOver(true);
     }

     draw() {
       this.ctx.fillStyle = NEON.cyan;
       this.ctx.fillRect(this.x, 300, 20, 20);
       this.drawHUD();
     }
   }
   ```
   The class name must match the file name; `check.mjs` looks for the export under that name.
2. Import it in `js/app.js` and add it to the `GAMES` array. The menu button and the `#<id>` link are created automatically.
   Add every key you use to both `js/i18n/tr.js` and `js/i18n/en.js` (`check.mjs` catches missing ones).
3. Export the game logic as pure functions, add tests to `tests/logic.test.mjs`, then run the three test commands.

Rules: input is read only from `this.input`, no listeners or `setTimeout` are added, timing is done with `dt`, no external resources are used, and user-facing text is never hard-coded (always `t()`). Every keyboard-only action needs a touch equivalent. See [CLAUDE.md](CLAUDE.md) for details.

## Project structure

```
arcade-hub/
├── index.html            # single page; the game list is not written in the HTML
├── manifest.webmanifest  # installable web app (icon is an inline SVG, no image files)
├── sw.js                 # service worker: network-first, cache fallback for offline use
├── .nojekyll
├── css/style.css
├── js/
│   ├── app.js            # game registry, menu, hash routing, language, theme, settings panel
│   ├── core/             # Engine, Input, BaseGame, Storage, Sound, I18n
│   ├── i18n/             # tr.js (default/fallback), en.js — flat key → text dictionaries
│   └── games/            # 12 games, each extending BaseGame
└── tests/                # development only: server, checks, tests
```

## Design decisions

**Core**
- `core/Sound.js` is an addition to the requested structure: Web Audio beeps. Sound is on by default; due to browser rules the audio context is created on the first key press/touch. The mute preference is saved.
- The canvas size is computed in CSS from the `--cw`/`--ch` variables as `min(logical width, 100%, 75vh × ratio)`, and the height is derived with `aspect-ratio`, so the ratio holds on every screen. The Engine writes these variables in `resizeCanvas()` and rescales the canvas if browser zoom changes the dpr.
- `pointer.clicked` fires on press for the mouse, and for touch on a short release without movement (≤12px); a ~400 ms long press produces a click with `button = 2`. This keeps tap and long press apart in Minesweeper. Games that need an instant response (Flappy) use the raw `pointer.pressed` value.
- Games use `e.code`; the only exception is the `+`/`−` symbols. `e.code` is the physical key position, so on a Turkish Q keyboard the key labeled `-` has the code `Equal`; that is why Input has an `e.key`-based `wasTyped()` for symbol keys.
- Restarting happens only with **Enter / tap**, and at least 0.4 s after the game ends. Space is deliberately left out so a hard drop in Tetris or a flap in Flappy doesn't restart by accident. In games where the winning line should stay visible (`overlayDelay`), the result screen appears after a short delay.
- A shared `menuButtons` mechanism for mode/difficulty choices: drawn as buttons with shortcut keys on the ready and game-over screens.
- If a game throws at runtime, the Engine keeps the loop running and logs the error to the console once per game.
- High scores are stored under `arcade-hub:best:<id>`; selected modes are remembered too. For debugging, `window.arcadeHub` (`engine`, `games`, `openSettings`, `closeSettings`, `setLang`) is exposed.
- The page `lang` follows the selected language; titles in Turkish never use CSS `uppercase` / JS `toUpperCase` (it would produce wrong capitals such as "MİNESWEEPER"). Uppercase labels on the canvas are separate dictionary keys (e.g. `common.PLAYER`).
- **Multilingual:** `core/I18n.js` holds the current language at module level; `t(key, params)` reads from the dictionary on every call. Since games produce their text with `t()` every frame and fields like `meta.title` are getters, changing the language does not reload the game and no progress is lost. A missing key falls back to Turkish, then to the key itself.
- **Settings schema:** a game declares its options with `static settings`; `BaseGame` validates the values and stores them under `arcade-hub:settings:<id>`, and the panel is generated from this schema. `live: true` settings (color, look, numeral style) apply instantly; those that affect gameplay return the game to its ready screen. Settings that change the board size keep separate high scores (`2048-5`, `memory-expert` …); the default size keeps the original record key.
- **Game-over overflow:** the shared overlay measures every line; text that doesn't fit the panel is first shrunk and, if it still doesn't fit, split into lines at the `·` separators. Titles are fitted the same way. The long score line in Connect Four (especially with "Bilgisayar" and large numbers) used to overflow before this; it is now also split into two short lines.
- **Theme and transitions:** `meta.theme` has two colors; app.js writes them into the `--accent`/`--accent-2` CSS variables. The variables are registered with `@property`, so colors — gradients included — transition smoothly. The canvas transition curtain is drawn by the Engine (game code is unchanged).

**Games**
- **Snake:** the top 40 px of the 600×600 canvas is the HUD; the default play field is 30×28 cells (15×14, 20×18 or 40×37 via settings; the grid is centered in the field). With multiple apples, each eaten apple is replaced by a new one; apples never spawn on top of each other or on the snake. The direction buffer holds up to 3 presses, and each press is validated against the previous *buffered* direction. The initial step is 0.12 s and speeds up 3% per apple (minimum 0.05 s).
- **2048:** the target tile depends on the grid (3×3: 512, 4×4: 2048, 5×5: 4096, 6×6: 8192). In Roman numeral mode, tiles of 4000 and above show the thousands on a separate line with an overline (vinculum, ×1000); the font shrinks with the length of the string. The high score is saved on a win; tapping the screen randomly doesn't restart, only the *Continue* / *Restart* buttons work.
- **Minesweeper:** there is no ready screen; the first click starts the game. Mines are never placed on the first clicked cell or its neighbors (the first click always opens an area). The best time is stored per difficulty, and the selected difficulty is remembered. The canvas size changes with difficulty via `engine.resizeCanvas()`.
- **Tetris:** 300×600 field + 180 px side panel. Score/high score are shown in the side panel instead of the standard top HUD. Guideline gravity curve, 0.5 s lock delay (up to 15 resets), DAS 170 ms / ARR 50 ms, 3-piece next preview, soft drop +1 and hard drop +2 points per cell.
- **Pong:** no high score (`hasScore: false`). The AI re-predicts its target every 0.12 s with an error margin that grows with speed, and its paddle is slower than the player's (330 vs 460 px/s). In simulation, a player who anticipates can beat it while a purely reactive one loses. In two-player mode the right half of a touch screen controls the second paddle.
- **Breakout:** four layouts (full, sturdy top rows, pyramid, stripes) cycle; from level 8 on, the stripes layout is replaced by a seeded, symmetric random layout unique to the level. Sturdy bricks take two hits and give double points. Each level speeds the ball up by 10%, and the level bonus is 100 × level. A broken brick drops a capsule (16% chance on normal): **×3** splits every ball into three (up to 12 balls), **↔** widens the paddle for 12 s, **⇡** automatic laser for 8 s, **S** slow motion for 8 s, **F** fireball for 6 s (pierces bricks without bouncing), **♥** +1 life (up to 5). A life is lost only when the last ball falls; effects reset when a life is lost or the level ends.
- **Flappy Bird:** since the panel covers the bird on the ready screen, the selected color/look is previewed enlarged above the panel. Consecutive pipe gaps shift by at most 130 px. Without this limit consecutive gaps could differ by more than 270 px, which was barely reachable even with the fastest climb.
- **Tic-Tac-Toe and Connect Four:** the scoreboard persists while the page is open (also across game switches) and is not saved. The human always moves first. The Connect Four AI uses depth-5 alpha-beta, center-out column ordering, and evaluation that prefers "win fast / lose slow".
- **Lights Out:** 10 levels; at level *n*, 3 + 2(n−1) distinct cells are clicked on a solved board (an all-off result is rejected). The target move count and **Hint** come from the shortest solution found with Gaussian elimination over GF(2). Level score: `max(10, 100·level − 10·extra moves − 25·hints)`.
- **Memory Match:** score = `max(50, 125 × pairs − 40 × (moves − pairs))`; a perfect 4×4 game scores 1000. With more than 8 pairs, shapes and colors are combined with an offset so every face stays unique. Unmatched cards flip back 0.8 s after the second card is revealed.
- **Game of Life:** a Gosper glider gun is ready on start. Cell color changes with age. For keyboardless devices there is a toolbar inside the canvas (Play, Step, Random, Clear, cycling pattern and speed). Speed ranges from 1 to 60 generations per second.
