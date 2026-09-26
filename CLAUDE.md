# CLAUDE.md — Arcade Hub

Bu dosya, projeye geri dönüldüğünde bağlamı tek seferde kurmak içindir. Önce bunu, sonra ilgili oyun dosyasını oku.
Kullanıcıya dönük tanıtım, kontrol tablosu ve tasarım gerekçeleri `README.md`'de.

## Proje özeti

- Sunucusuz, build adımı olmayan HTML5 retro arcade portalı. 12 oyun, koyu + neon arayüz, tüm grafikler canvas ile koddan çizilir.
- **Canlı:** https://omerfarukoktay112-max.github.io/arcade-hub/ (GitHub Pages, `main` / kök dizin)
- **Depo:** https://github.com/omerfarukoktay112-max/arcade-hub (public; Pages ücretsiz planda public ister)
- **Yayınlama:** `main`'e her push siteyi 1–2 dakikada günceller. Ayrı bir CI yok.
- Arayüz **çok dilli** (Türkçe varsayılan + İngilizce). Oyun adları da çevrilir (TR: Yılan, Mayın Tarlası, Tuğla Kırıcı, XOX, Dört Bağla…); hash id'leri dilden bağımsızdır.

## Kesin kurallar (ihlal etme)

1. **Saf HTML + CSS + vanilla JS (ES modules).** npm bağımlılığı, `package.json`, framework, CDN, harici font/kütüphane, resim veya ses dosyası YOK. Sesler `core/Sound.js` (Web Audio) ile üretilir.
2. **Yollar göreli** (`./js/...`, `../core/...`); site `/arcade-hub/` alt dizininde çalışır. `/` ile başlayan yol yok.
3. **Import'lar `.js` uzantılı ve dosya adıyla birebir aynı harflerle** yazılır (Pages Linux, büyük/küçük harfe duyarlı).
4. Kökteki boş **`.nojekyll`** silinmez. `.gitattributes` satır sonlarını LF'ye sabitler.
5. Oyunlar **asla** `addEventListener`, `setTimeout`, `setInterval`, `requestAnimationFrame` kullanmaz. Girdi yalnızca `this.input`'tan, zamanlama `update(dt)` sayaçlarıyla yapılır. `tests/check.mjs` bu kuralı otomatik denetler.
6. Oyun modülleri üst düzeyde DOM'a dokunmaz; Node'da import edilebilmeleri gerekir (testler böyle çalışıyor).
7. **Kullanıcıya görünen metin koda gömülmez.** `t('anahtar', {param})` kullanılır; anahtar hem `js/i18n/tr.js` hem `en.js`'e eklenir (`check.mjs` denetler). `meta.title/controls/description` (ve Minesweeper `scoreLabel`) getter'dır. `menuButtons` etiketleri de getter olur: `{ get label() { return t('mode.1p'); }, … }`. Dar alanlara çizilen metinlere `text(..., { maxWidth })` verilir (çeviriler uzun olabilir).
8. Her değişiklikten sonra üç test komutu çalıştırılır (aşağıda). Commit ve push yalnızca kullanıcı isterse yapılır.

## Dosya haritası

```
index.html              tek sayfa; menü HTML'de yazılı DEĞİL (app.js üretir). Favicon data-URI.
css/style.css           tema değişkenleri; canvas boyutu --cw/--ch ile (aşağıya bak); ≤640px'te menü yatay kayar
js/app.js               GAMES dizisi (tek kaynak), menü üretimi, hash yönlendirme, Ayarlar/Duraklat/Ses/dil,
                        oyun teması (--accent), sahne giriş animasyonu, şemadan üretilen ayar paneli,
                        window.arcadeHub = { engine, games, openSettings, closeSettings, setLang }
js/core/I18n.js         t(key, params), setLang/getLang/onLangChange, detectLang, LANGS; DOM'a dokunmaz (Node'da 'tr')
js/i18n/tr.js, en.js    düz anahtar → metin sözlükleri; değer fonksiyon da olabilir (çoğul: en 'snake.apples')
js/core/Engine.js       rAF döngüsü, dt ≤ 0.1, HiDPI, loadGame(), resizeCanvas(w,h), pause/resume/togglePause,
                        setSuspended (ayar paneli), oyun geçiş perdesi (_drawTransition)
js/core/Input.js        klavye + pointer (fare/dokunma/kalem), uzun basış, swipe, wasTyped
js/core/BaseGame.js     temel sınıf + NEON paleti, FONT, HUD_HEIGHT=40, clamp/randInt/shuffle/roundRect/pointInRect,
                        ayar şeması (resolveSettings, setSetting, optionLabel), fitText/measureText
js/core/Storage.js      localStorage sarmalayıcı, 'arcade-hub:' öneki, getBest/submitScore
js/core/Sound.js        Web Audio bip: beep(freq,dur,{type,volume,slide,delay}), seq(), win(), lose(); muted saklanır
js/games/*Game.js       12 oyun (her biri tek dosya: saf mantık export'ları + oyun sınıfı)
tests/serve.mjs         bağımsız statik sunucu; /arcade-hub/ alt dizinini de taklit eder
tests/check.mjs         statik denetimler
tests/logic.test.mjs    saf mantık testleri (68) + fakeEngine() + seeded() yardımcıları
tests/browser-smoke.mjs headless Chrome/Edge testi (CDP + Node yerleşik WebSocket; Playwright yok)
```

## Çekirdek API — bilinmesi gereken ayrıntılar

### Engine
- Döngü: `update(dt)` → arka planı `NEON.bg` ile doldur → `draw()` → `drawOverlay()` → (duraklatıldıysa) duraklatma ekranı → `input.endFrame()`. `draw` ve `drawOverlay` ayrı `save/restore` blokları içinde çağrılır.
- `loadGame(Class)`: önceki oyunun `destroy()`'u → `input.reset()` → `resizeCanvas(meta.width, meta.height)` → `new Class(engine)` → `init()`.
- `resizeCanvas(w,h)`: canvas iç çözünürlüğü = w·dpr (dpr en fazla 3), `setTransform(dpr…)`, CSS değişkenleri `--cw`/`--ch`, `input.setSize`. Yakınlaştırma dpr'ı değiştirirse her karede yeniden çağrılır. Oyun sırasında çağrılabilir (Minesweeper çağırıyor).
- Duraklatma: P/Escape (Engine tüketir, oyun görmez), duraklatılmışken dokunma devam ettirir, `visibilitychange` gizlenince duraklatır. Yalnızca `game.canPause()` true iken duraklatılabilir (varsayılan: `state === 'playing'`).
- Oyunda istisna olursa döngü durmaz; hata oyun başına bir kez `console.error` edilir.
- `suspended` (ayar paneli açıkken): `game.update` çağrılmaz, girdi (P/Esc dahil) yok sayılır, çizim sürer (canlı ayar önizlemesi). `setSuspended(false)` girdiyi sıfırlar ve oynanan oyunu duraklatılmış bırakır.
- `openSettings`: app.js'in verdiği geri çağrı; BaseGame'in hazır ekranındaki "⚙ Ayarlar" düğmesi (O tuşu) bunu çağırır. fakeEngine'de yoktur → düğme çıkmaz.
- Geçiş: `loadGame` her oyunda `meta.theme` renkleriyle 0,5 sn'lik panjur perdesi başlatır. `prefers-reduced-motion: reduce` ise (`engine.reducedMotion`) yalnızca solma çizilir. **Bu makinede headless Chrome "reduce" bildiriyor**; panjuru görmek için CDP `Emulation.setEmulatedMedia` ile `no-preference` ver.
- Ses bağlamı ilk `pointerdown`/`keydown`'da (capture) `sound.unlock()` ile açılır.

### Input
- Klavye: `isDown(...codes)`, `wasPressed(...codes)` (tuş tekrarı sayılmaz), `consume(...codes)`. Değerler `e.code` (`'ArrowUp'`, `'KeyW'`, `'Space'`, `'Digit1'`). Ctrl/Alt/Meta'lı basışlar yok sayılır. Ok tuşları ve Space için `preventDefault` uygulanır.
- **`wasTyped(...keys)`**: `e.key` tabanlı, YALNIZCA `+`/`-` gibi semboller için. Türkçe Q klavyede `-` tuşunun `e.code`'u `'Equal'` olduğundan semboller `e.code` ile yanlış algılanır.
- `pointer` alanları: `x, y` (mantıksal koordinat), `isDown`, `pressed` (ham basış, bu kare), `released`, `clicked`, `button` (0 / 2), `type` (`'mouse'|'touch'|'pen'`), `hover` (fare canvas üzerinde mi), `startX/startY` (basış noktası).
- **`clicked` semantiği:** fare → basış anında (sağ tık `button = 2`). Dokunma/kalem → bırakışta, yalnızca hareket ≤12 CSS px ise. ~400 ms uzun basış → `clicked` + `button = 2` (bırakışta ayrıca tap üretmez). Anında tepki gereken oyunlar (Flappy) `pointer.pressed` kullanır.
- `swipe`: `'up'|'down'|'left'|'right'|null`. Hareket başına bir kez, 30 CSS px eşiğinde, sürükleme sırasında tetiklenir (fareyle sürüklemede de).
- `endFrame()` tek karelik her şeyi sıfırlar; `reset()` oyun değişince tüm durumu (basılı tuşlar, jest, uzun basış zamanlayıcısı) temizler. Pencere `blur` olunca basılı tuşlar temizlenir.

### BaseGame
- `static meta`: zorunlu `id, title, width, height, controls, description` (metinler `t()` getter'ı). İsteğe bağlı: `hasScore: false` (HUD skoru ve rekor gizlenir), `scoreLabel`, `lowerIsBetter`, `recordOnWin`, `theme: [accent, accent2]` (üst çubuk/menü/başlık/canvas parıltısı ve geçiş perdesi). `controls` ve `description` canvas altında gösterilir.
- **`static settings`** (ayar şeması): `[{ id, labelKey, type?: 'color', default, live?, options: [{ value, labelKey | label, params?, note?, color? }] }]`. Değerler `this.settings.<id>`'de (constructor'da `arcade-hub:settings:<oyun>`'dan `resolveSettings` ile doğrulanarak yüklenir). `setSetting(id, v)` kaydeder ve `onSettingChange` çağırır: varsayılan davranış `live` değilse `init()` (hazır ekranı). `reset()` boyutları `this.settings`'ten okur. Boyut değiştiren ayarlar `recordKey`'i ayırır ama varsayılan değer eski anahtarı korur. Hazır ekranı ayar özetini (`settingsSummary`) otomatik gösterir; oyun `overlayContent`'te `c.lines = [...]` yerine `unshift/push` kullanırsa özet kalır.
- Erişim: `this.engine, ctx, input, storage, sound, width, height` (getter, engine'den okunur), `meta`, `best`, `recordKey` (varsayılan `meta.id`), `isEnded`.
- Durum: `score`, `state` (`'ready'|'playing'|'over'|'won'`), `stateTime` (mevcut durumdaki süre), `time` (toplam süre, animasyon için).
- Yaşam döngüsü: `init()` = `reset()` + `state = 'ready'`. `reset()` (alt sınıf `super.reset()` çağırır) → `start()` → `restart()` = `reset()` + `start()`.
- **`update(dt)` sözleşmesi:** `time`/`stateTime`'ı artırır. `'playing'` ise false döner; değilse menü girdisini işler ve **true** döner. Alt sınıf kalıbı:
  ```js
  update(dt) {
    this.animate(dt);              // durumdan bağımsız animasyonlar (isteğe bağlı)
    if (super.update(dt)) return;  // 'playing' değil ya da bu kare menüye ait
    // oyun mantığı
  }
  ```
- Ortak menü girdisi: `'ready'` → Space/Enter/tap başlatır. `'over'/'won'` → yalnızca **Enter/tap** ile yeniden başlatır (Space bilinçli olarak yok), `max(0.4, overlayDelay)` sn sonra.
- `menuButtons = [{ label, key, group, color, selected(), onClick() }]`: hazır ve bitti ekranında overlay'e otomatik yerleşir; aynı `group` aynı satırda. Tıklama da kısayol tuşu da çalışır.
- `overlayDelay` (bitişten sonra overlay gecikmesi, ör. kazanan çizgiyi göstermek için), `overlayDim` (karartma oranı).
- `gameOver(won)`: durumu ayarlar, `recordOnWin` yoksa ya da kazanıldıysa `recordScore()` çağırır, win/lose sesi çalar. `recordScore()` bitiş olmadan da çağrılabilir.
- Özelleştirme: `overlayContent()` → `{ title, color, lines: [string | {text,color,size?}], hint }` (null dönerse overlay çizilmez). `formatScore(v)`. `drawOverlay()` tamamen override edilebilir (Life, Minesweeper) ya da genişletilebilir (Flappy kuş önizlemesi).
- **Overlay yerleşimi taşmaz:** `overlayLayout()` başlığı, satırları ve ipucunu `fitText` ile panel iç genişliğine (panel − 32) sığdırır: önce küçültür (satır en az 12 px), sonra `' · '` (yoksa boşluk) ayraçlarından böler. Layout'ta `titleLines`, `lines[].size`, `hintLines` vardır. Overlay `OVERLAY_FADE` (0,22 sn) boyunca solarak ve 14 px kayarak belirir (`overlayProgress()`); `drawButton` mevcut `globalAlpha`'yı çarpar.
- Yardımcılar: `text(str, x, y, {size, color, align, baseline, weight, glow, maxWidth})`, `drawHUD(ortaMetin)` (üstte 40 px: solda SKOR, sağda REKOR; üçüne de maxWidth), `drawButton(rect, label, {selected, color, size})`.

### Storage anahtarları (`arcade-hub:` önekli)
`best:<recordKey>` (Minesweeper: `best:minesweeper-easy|medium|hard`; 2048: `best:2048` (4×4) / `best:2048-3|5|6`; Memory: `best:memory` (normal) / `best:memory-easy|hard|expert`), `muted`, `lang`, `settings:<oyun id>` (ayar nesnesi), `pong:mode`, `ttt:mode`, `ttt:difficulty`, `connect4:mode`, `minesweeper:difficulty`.

### CSS'te canvas boyutu
`width: min(calc(var(--cw)*1px), 100%, calc(75vh * var(--cw) / var(--ch)))`, `height: auto`, `aspect-ratio: var(--cw) / var(--ch)`, `touch-action: none`. Canvas'a CSS `border` verme: Input koordinat dönüşümü `getBoundingClientRect` kullanır, kenarlık bunu kaydırır. Parlama `box-shadow` ile yapılır.
Sayfa `lang`'ı seçilen dile göre değişir; Türkçede başlıklarda `text-transform: uppercase` kullanma ("MİNESWEEPER" gibi yanlış harfler oluşur). Büyük harfli canvas etiketleri sözlükte ayrı anahtardır (`common.PLAYER`), `toUpperCase` ile üretilmez.

### Tema ve üst çubuk (CSS)
`--accent` / `--accent-2` `@property` ile kayıtlıdır (yumuşak renk geçişi) ve app.js tarafından `meta.theme`'den yazılır; `getComputedStyle` bunları `rgb()` döndürür. Üst çubuk düğmeleri, aktif menü hapı (`--btn-accent` her düğmede), başlık, canvas parıltısı ve ayar paneli bu değişkenleri `color-mix` ile kullanır. ≤640 px'te üst çubuk düğmeleri yalnızca simge gösterir (`.lbl` gizli; ad `aria-label`'da). Hareketi azalt açıkken kayma/bulanıklık animasyonları kapanır, solma ve renk geçişleri kalır.

## Oyunlar

| id (hash) | Sınıf / boyut | Önemli notlar |
|---|---|---|
| `snake` | SnakeGame 600×600 | Üst 40 px HUD. Ayarlar: `size` (small 40 px → 15×14, medium 30 → 20×18, **normal** 20 → 30×28, large 15 → 40×37; `gridFor`, ızgara ortalanır: `this.ox/oy/cell/cols/rows`), `color` (live; rainbow), `apples` 1/2/3/5 (`this.foods`, `fillFoods`; `food` getter ilk yem). Yön tamponu en fazla 3 basış; her basış bir önceki *tamponlanmış* yöne göre doğrulanır. Adım 0,12 sn, her yemde ×0,97 (en az 0,05). Saf: `enqueueDirection`, `stepSnake` (yem tek/dizi/null; `foodIndex` döner), `spawnFood` (`blocked`), `fillFoods`, `gridFor`. |
| `2048` | Game2048 500×500 | Ayarlar: `size` 3/4/5/6 (hedef `TARGETS`: 512/2048/4096/8192; `metrics()` karo/boşluk), `numerals` arabic/roman (live; `drawRoman`: 4000+ binler üst çizgili ayrı satır; düz metinde `formatTile` 4000+ için sayı). Saf: `slideLine`, `moveGrid` (boyut `grid.length`'ten; kayma animasyonu için hamle listesi döner), `spawnTile`, `canMove`, `emptyGrid(n)`, `toRoman`, `romanParts`. 2048'de `'won'` durumunda yalnızca *Devam et* (Space) / *Yeniden* (Enter) düğmeleri çalışır; rastgele dokunuş yeniden başlatmaz (`updateWon`). Devam modunda `continued = true`. |
| `minesweeper` | MinesweeperGame, dinamik | Kolay 9×9/10 (360×424), Orta 16×16/40 (512×580), Zor 16 satır × 30 sütun / 99 (812×516). Boyut `engine.resizeCanvas` ile değişir. `update`'i tamamen kendisi yönetir. Hazır overlay'i yoktur: ilk tıklama mayınları yerleştirir (tıklanan hücre ve komşuları güvenli) ve başlatır. Skor = süre (`lowerIsBetter`, `recordOnWin`), zorluk başına ayrı rekor. `restart()` → `'ready'`. Saf: `createBoard`, `placeMines`, `reveal` (yığınla flood-fill), `chord`, `toggleFlag`, `isWon`. |
| `tetris` | TetrisGame 480×600 | 10×20 alan (30 px) + 180 px yan panel; skor/rekor üst HUD yerine panelde. SRS kick tabloları (y yukarı pozitif, uygularken işaret çevrilir), 7-bag, ghost, 3 parça önizleme, hold (C/Shift, mobilde yukarı swipe). Guideline yerçekimi, kilit gecikmesi 0,5 sn (15 yenileme), DAS 0,17 / ARR 0,05, satır silme animasyonu 0,22 sn. Dokunma: tap döndürür, `pointer.startX`'ten itibaren her 30 mantıksal px sürükleme 1 hücre kaydırır, aşağı swipe hard drop yapar. Saf: `rotateMatrix`, `tryRotate`, `collides`, `clearLines`, `fullRows`, `mergePiece`, `scoreForLines`, `createBag`, `gravityInterval`. |
| `pong` | PongGame 800×500 | `hasScore:false`. Mod menüsü (1/2). AI 0,12 sn'de bir hedef günceller, `predictY` + hız arttıkça büyüyen hata payı, hızı 330 (oyuncu 460). Top alt adımlı hareket eder, her vuruşta ×1,06 (en fazla 950). Dokunma: sol yarı P1, 2P modunda sağ yarı P2. 7'ye ulaşan kazanır. |
| `breakout` | BreakoutGame 600×700 | **Çoklu top:** `this.balls` (`ball` getter/setter ilk top — testler `game.ball = {...}` atar). Güçlendirmeler `POWERUPS` (multi/wide/laser/slow/fire/life), tuğla kırılınca `pickPowerUp(this.rng, DROP_RATES[settings.powerups])` → `this.drops`; raketle yakalanınca `applyPowerUp`. Süreli etkiler `this.effects`; slow = top dt'si ×0,6; fire = tuğlayı sekmeden deler; laser = 0,4 sn'de bir çift ışın (`this.lasers`). Raket genişliği `this.paddleW` hedefe yumuşak yaklaşır. Son top düşünce can gider, `clearPowerUps`. Ayar: `powerups` off/normal/lots (live). 10×8 tuğla ızgarası, 4 dizilim döngüsü (8. seviyeden itibaren tohumlu rastgele), sağlam tuğla 2 vuruş. Alt adım = yarıçapın yarısı (tünelleme yok). Raket: klavye ya da imleç (fare yalnızca hareket edince takip edilir: `lastPointerX`). 3 can. Saf: `layoutForLevel`, `circleRect`, `paddleBounce`, `levelSpeed`, `pickPowerUp`, `splitBall`. |
| `flappy` | FlappyGame 400×600 | Ayarlar (ikisi de live): `color` (`BIRD_COLORS`: gövde/kanat/gaga, ghost yarı saydam, rainbow), `skin` (`BIRD_SKINS`: classic/crown/shades/ninja/tophat/robot, `drawAccessory`). `drawBird(x, y, rot, scale)`; hazır ekranında `drawOverlay` panelin üstüne büyük önizleme çizer. Yerçekimi 1500, zıplama −430, zemin y = 550. Ardışık boşluk kayması ≤ `MAX_GAP_SHIFT` (130). Bu sınır olmadan yetişilemeyen boru dizileri oluşuyordu. `this.rng` testte tohumlanabilir. Zıplama `pointer.pressed` ile. Saf: `birdStep`, `makePipe`, `hitsPipe`. |
| `tictactoe` | TicTacToeGame 450×500 | `hasScore:false`. Menü: 1/2 oyuncu, K/Z = kolay/zor (kolay: %50 rastgele hamle). İnsan X ve her zaman ilk oynar. Skor tablosu modül düzeyindeki `sessionTally`'de (oyun değişince de korunur, kaydedilmez). Saf: `winnerOf`, `minimax`, `bestMove`, `aiMove`. |
| `connect4` | ConnectFourGame 700×650 | `hasScore:false`. Bitiş ekranı skor tablosu iki satırdır (`Oyuncu 1  3 – 2  Bilgisayar` + `Berabere: n`); eskiden tek uzun satır panelden taşıyordu. Alfa-beta derinlik 5, sütun sırası merkezden dışa, pencere heuristiği (3+1: 5, 2+2: 2, rakip 3+1: −4, orta sütun +3). Düşme animasyonu bitince taş tahtaya yazılır. İmleç yalnızca hareket edince sütun seçer (yoksa klavye seçimini ezer). `sessionTally`. Saf: `dropRow`, `findWin`, `evaluate`, `alphaBeta`, `bestMove`. |
| `lightsout` | LightsOutGame 500×550 | 10 seviye; `clicksForLevel = 3 + 2(n−1)` farklı hücreye tıklanarak karıştırılır. `solve()` = GF(2) Gauss eliminasyonu + en az tıklamalı çözüm (hedef hamle ve ipucu bunu kullanır). Alt düğmeler: Sıfırla (R), İpucu (H). Puan: `max(10, 100·seviye − 10·fazla hamle − 25·ipucu)`. |
| `memory` | MemoryGame 600×650 | Ayar `grid`: easy 3×4 / **normal 4×4** / hard 4×5 / expert 5×6 (`GRIDS`, `gridLayout` kare kartı ortalar; `this.cols/rows/pairs/card/gx/gy`). Yüz → `faceOf` (8 şekil × 8 renk, 8'den sonra renk kaydırılır). Eşleşmeyen kartlar 0,8 sn kilitlenir. Puan `max(50, 125·çift − 40·(hamle−çift))` (4×4: 1000). Saf: `createDeck(rng, pairs)`, `computeScore(moves, pairs)`, `faceOf`, `gridLayout`. |
| `life` | LifeGame 800×600 | `hasScore:false`, durum hep `'playing'`, `canPause()` hep true, kendi `drawOverlay`'i var: üstte 24 px durum şeridi, altta 60 px dokunmatik araç çubuğu (Oynat, Adım, Rastgele, Temizle, döngüsel desen, döngüsel hız). Klavye ve düğmeler aynı `action(id)` metodunu çağırır. Çubukta başlayan jest çizim yapmaz (`gestureOnBar`). Çizim `pointer.startX/Y`'den başlayıp Bresenham ile yapılır. Açılışta bir Gosper gun hazır bekler. Saf: `step` (toroidal), `parseRLE`, `placePattern`, `PATTERNS`. |

## Test ve doğrulama

```sh
node tests/check.mjs                 # node --check, import yolu/harf, HTML yolları, .nojekyll, GAMES kaydı, yasak API'ler
node tests/logic.test.mjs            # 68 saf mantık testi; ~2 sn
node tests/browser-smoke.mjs --shots <klasör>        # yerel (tests/serve.mjs'i 8765'te kendisi açar)
node tests/browser-smoke.mjs --url https://omerfarukoktay112-max.github.io/arcade-hub/   # canlı site
```

- `logic.test.mjs` içindeki **`fakeEngine(GameClass)`** DOM'suz bir engine döndürür: `{ game, input, engine, step(dt) }`. Girdi elle verilir: `input.pressed.add('Space')`, `input.typed.add('+')`, `Object.assign(input.pointer, {...})`. **`seeded(n)`** tohumlu RNG üretir. Rastgeleliğe bağlı testleri mutlaka tohumla; bir kez kararsız (flaky) Flappy testi böyle çıktı.
- `browser-smoke.mjs`:
  - Chrome/Edge'i bulur (`CHROME_PATH` ile de verilebilir); tarayıcı yoksa testi atlar.
  - Oyun başına senaryolar `SCENARIOS` nesnesinde; oyun durumuna `window.arcadeHub.engine.game` üzerinden erişir.
  - Sırasıyla şunları dener: geçersiz hash → Snake, her oyunu hash ve menüyle açma, P/Esc, 12 oyun × 8 tur hızlı geçiş, 375px mobil düzen (taşma, en-boy oranı, dpr = 2), dokunma (tap, uzun basış, swipe), ardından masaüstünde dil seçici, tema değişkeni, ayar paneli (aç / seçenek / Esc / O kısayolu / oynarken kapanınca duraklama), 2048/Memory/Flappy/Breakout ayarları ve **her oyun × her dil × hazır/bitti/kazandı için overlay metinlerinin panele sığması**.
  - Konsolda uyarı ya da hata görürse başarısız sayılır.
- Görsel kontrol: `--shots` ile kaydedilen PNG'leri Read aracıyla incele.
- Zamanlama tuzağı: Connect Four'da taş düşüşü + AI gecikmesi yaklaşık 1,5 sn sürer; tarayıcı senaryolarında yeterince bekle.

## Yeni oyun ekleme

1. `js/games/YeniGame.js`: `export class YeniGame extends BaseGame { static meta = {...} }`. Sınıf adı dosya adıyla aynı olmalı; `check.mjs` export'u bu adla arar. Metinler `t()` getter'larıyla, `theme` renkleriyle; ayar gerekiyorsa `static settings`. Tüm anahtarlar tr.js + en.js'e.
2. `js/app.js`: import et ve `GAMES` dizisine ekle. Menü ve `#<id>` otomatik gelir.
3. Saf mantığı export et ve `tests/logic.test.mjs`'e ekle; yeni bölümü `/* ===== Koşucu ===== */` işaretinin önüne koy. İsteğe bağlı olarak `SCENARIOS`'a tarayıcı senaryosu ekle.
4. Klavyesiz cihazı unutma: klavyeye özel her eylemin dokunmatik bir karşılığı olmalı (canvas içi düğme, swipe ya da uzun basış).
5. README'deki oyun tablosunu ve bu dosyadaki oyun tablosunu güncelle.

## Geçmişte yakalanan tuzaklar (tekrarlama)

- **Basış ile ilk kare arasında imleç ilerleyebilir:** sürükleme çapası `pointer.x` değil, `pointer.startX/startY` olmalı (Life çizimi ve Tetris kaydırma bu yüzden düzeltildi).
- **Fare hover'ı klavye seçimini ezmesin:** imleçten seçim yalnızca `p.x` değiştiğinde yapılır (`lastPointerX` kalıbı).
- **Rastgele üretilen seviyeler oynanabilir mi?** Fizik sınırına göre kontrol et (Flappy boşluk kayması örneği).
- **Oturum boyunca yaşaması gereken veri** oyun örneğinde değil, modül düzeyinde tutulmalı; oyun her geçişte yeniden oluşturulur.
- **Test konumlarını doğrula:** ör. `..111.2` zaten kaybedilmiş bir konumdur; AI'nin tüm hamleleri eşit derecede kötü görünür.
- **Metin panele sığmıyor mu?** Sabit genişlik varsayma: çeviriler ve büyük sayılar uzar. Overlay'de `fitText`, serbest çizimde `maxWidth` kullan (Connect Four bitiş ekranı hatası).
- **Yorumlarda `t('...')` yazma:** `check.mjs` koddaki `t('x')` kalıplarını anahtar olarak denetler; yorumdaki örnek de hata verir.
- **Ayar paneli açıkken tuşlar:** app.js pencerede capture aşamasında Esc'i (ve Tab dışındaki tuşları) `stopImmediatePropagation` ile keser; aksi halde Esc Engine'de duraklatmayı değiştirir, Enter hazır ekranında oyunu başlatırdı.

## Çalışma ortamı notları

- Windows 11; Git Bash + PowerShell. Node 24 var (yerleşik `WebSocket`); **Python yok**. Yerel sunucu için `node tests/serve.mjs 8000` kullan (http://localhost:8000/ ve /arcade-hub/).
- Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe` (Edge de var).
- `gh` CLI `omerfarukoktay112-max` hesabıyla oturum açık.
- Uzun ve çok satırlı düzenlemeleri Bash heredoc içinde `node -e` ile yapma: ters tırnak ve `${}` içeren heredoc'lar bozuluyor. Edit aracını ya da scratchpad'e yazılmış bir `.cjs` betiğini kullan.
- Commit mesajları Türkçe, önekli: `feat: <oyun> eklendi`, `fix: …`, `test: …`, `docs: …`; sonunda `Co-Authored-By` satırı bulunur.
