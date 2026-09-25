# CLAUDE.md — Arcade Hub

Bu dosya, projeye geri dönüldüğünde bağlamı tek seferde kurmak içindir. Önce bunu, sonra ilgili oyun dosyasını oku.
Kullanıcıya dönük tanıtım, kontrol tablosu ve tasarım gerekçeleri `README.md`'de.

## Proje özeti

- Sunucusuz, build adımı olmayan HTML5 retro arcade portalı. 12 oyun, koyu + neon arayüz, tüm grafikler canvas ile koddan çizilir.
- **Canlı:** https://omerfarukoktay112-max.github.io/arcade-hub/ (GitHub Pages, `main` / kök dizin)
- **Depo:** https://github.com/omerfarukoktay112-max/arcade-hub (public; Pages ücretsiz planda public ister)
- **Yayınlama:** `main`'e her push siteyi 1–2 dakikada günceller. Ayrı bir CI yok.
- Arayüz metinleri **Türkçe**, oyun adları özgün İngilizce halleriyle.

## Kesin kurallar (ihlal etme)

1. **Saf HTML + CSS + vanilla JS (ES modules).** npm bağımlılığı, `package.json`, framework, CDN, harici font/kütüphane, resim veya ses dosyası YOK. Sesler `core/Sound.js` (Web Audio) ile üretilir.
2. **Yollar göreli** (`./js/...`, `../core/...`); site `/arcade-hub/` alt dizininde çalışır. `/` ile başlayan yol yok.
3. **Import'lar `.js` uzantılı ve dosya adıyla birebir aynı harflerle** yazılır (Pages Linux, büyük/küçük harfe duyarlı).
4. Kökteki boş **`.nojekyll`** silinmez. `.gitattributes` satır sonlarını LF'ye sabitler.
5. Oyunlar **asla** `addEventListener`, `setTimeout`, `setInterval`, `requestAnimationFrame` kullanmaz. Girdi yalnızca `this.input`'tan, zamanlama `update(dt)` sayaçlarıyla yapılır. `tests/check.mjs` bu kuralı otomatik denetler.
6. Oyun modülleri üst düzeyde DOM'a dokunmaz; Node'da import edilebilmeleri gerekir (testler böyle çalışıyor).
7. Her değişiklikten sonra üç test komutu çalıştırılır (aşağıda). Commit ve push yalnızca kullanıcı isterse yapılır.

## Dosya haritası

```
index.html              tek sayfa; menü HTML'de yazılı DEĞİL (app.js üretir). Favicon data-URI.
css/style.css           tema değişkenleri; canvas boyutu --cw/--ch ile (aşağıya bak); ≤640px'te menü yatay kayar
js/app.js               GAMES dizisi (tek kaynak), menü üretimi, hash yönlendirme, Duraklat/Ses düğmeleri,
                        window.arcadeHub = { engine, games } (hata ayıklama ve testler bunu kullanır)
js/core/Engine.js       rAF döngüsü, dt ≤ 0.1, HiDPI, loadGame(), resizeCanvas(w,h), pause/resume/togglePause
js/core/Input.js        klavye + pointer (fare/dokunma/kalem), uzun basış, swipe, wasTyped
js/core/BaseGame.js     temel sınıf + NEON paleti, FONT, HUD_HEIGHT=40, clamp/randInt/shuffle/roundRect/pointInRect
js/core/Storage.js      localStorage sarmalayıcı, 'arcade-hub:' öneki, getBest/submitScore
js/core/Sound.js        Web Audio bip: beep(freq,dur,{type,volume,slide,delay}), seq(), win(), lose(); muted saklanır
js/games/*Game.js       12 oyun (her biri tek dosya: saf mantık export'ları + oyun sınıfı)
tests/serve.mjs         bağımsız statik sunucu; /arcade-hub/ alt dizinini de taklit eder
tests/check.mjs         statik denetimler
tests/logic.test.mjs    saf mantık testleri (53) + fakeEngine() + seeded() yardımcıları
tests/browser-smoke.mjs headless Chrome/Edge testi (CDP + Node yerleşik WebSocket; Playwright yok)
```

## Çekirdek API — bilinmesi gereken ayrıntılar

### Engine
- Döngü: `update(dt)` → arka planı `NEON.bg` ile doldur → `draw()` → `drawOverlay()` → (duraklatıldıysa) duraklatma ekranı → `input.endFrame()`. `draw` ve `drawOverlay` ayrı `save/restore` blokları içinde çağrılır.
- `loadGame(Class)`: önceki oyunun `destroy()`'u → `input.reset()` → `resizeCanvas(meta.width, meta.height)` → `new Class(engine)` → `init()`.
- `resizeCanvas(w,h)`: canvas iç çözünürlüğü = w·dpr (dpr en fazla 3), `setTransform(dpr…)`, CSS değişkenleri `--cw`/`--ch`, `input.setSize`. Yakınlaştırma dpr'ı değiştirirse her karede yeniden çağrılır. Oyun sırasında çağrılabilir (Minesweeper çağırıyor).
- Duraklatma: P/Escape (Engine tüketir, oyun görmez), duraklatılmışken dokunma devam ettirir, `visibilitychange` gizlenince duraklatır. Yalnızca `game.canPause()` true iken duraklatılabilir (varsayılan: `state === 'playing'`).
- Oyunda istisna olursa döngü durmaz; hata oyun başına bir kez `console.error` edilir.
- Ses bağlamı ilk `pointerdown`/`keydown`'da (capture) `sound.unlock()` ile açılır.

### Input
- Klavye: `isDown(...codes)`, `wasPressed(...codes)` (tuş tekrarı sayılmaz), `consume(...codes)`. Değerler `e.code` (`'ArrowUp'`, `'KeyW'`, `'Space'`, `'Digit1'`). Ctrl/Alt/Meta'lı basışlar yok sayılır. Ok tuşları ve Space için `preventDefault` uygulanır.
- **`wasTyped(...keys)`**: `e.key` tabanlı, YALNIZCA `+`/`-` gibi semboller için. Türkçe Q klavyede `-` tuşunun `e.code`'u `'Equal'` olduğundan semboller `e.code` ile yanlış algılanır.
- `pointer` alanları: `x, y` (mantıksal koordinat), `isDown`, `pressed` (ham basış, bu kare), `released`, `clicked`, `button` (0 / 2), `type` (`'mouse'|'touch'|'pen'`), `hover` (fare canvas üzerinde mi), `startX/startY` (basış noktası).
- **`clicked` semantiği:** fare → basış anında (sağ tık `button = 2`). Dokunma/kalem → bırakışta, yalnızca hareket ≤12 CSS px ise. ~400 ms uzun basış → `clicked` + `button = 2` (bırakışta ayrıca tap üretmez). Anında tepki gereken oyunlar (Flappy) `pointer.pressed` kullanır.
- `swipe`: `'up'|'down'|'left'|'right'|null`. Hareket başına bir kez, 30 CSS px eşiğinde, sürükleme sırasında tetiklenir (fareyle sürüklemede de).
- `endFrame()` tek karelik her şeyi sıfırlar; `reset()` oyun değişince tüm durumu (basılı tuşlar, jest, uzun basış zamanlayıcısı) temizler. Pencere `blur` olunca basılı tuşlar temizlenir.

### BaseGame
- `static meta`: zorunlu `id, title, width, height, controls, description`. İsteğe bağlı: `hasScore: false` (HUD skoru ve rekor gizlenir), `scoreLabel` (`'SÜRE'` gibi), `lowerIsBetter`, `recordOnWin`. `controls` ve `description` canvas altında gösterilir.
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
- Özelleştirme: `overlayContent()` → `{ title, color, lines: [string | {text,color}], hint }` (null dönerse overlay çizilmez). `formatScore(v)`. `drawOverlay()` tamamen override edilebilir (Life, Minesweeper).
- Yardımcılar: `text(str, x, y, {size, color, align, baseline, weight, glow})`, `drawHUD(ortaMetin)` (üstte 40 px: solda SKOR, sağda REKOR), `drawButton(rect, label, {selected, color, size})`.

### Storage anahtarları (`arcade-hub:` önekli)
`best:<recordKey>` (Minesweeper: `best:minesweeper-easy|medium|hard`), `muted`, `pong:mode`, `ttt:mode`, `ttt:difficulty`, `connect4:mode`, `minesweeper:difficulty`.

### CSS'te canvas boyutu
`width: min(calc(var(--cw)*1px), 100%, calc(75vh * var(--cw) / var(--ch)))`, `height: auto`, `aspect-ratio: var(--cw) / var(--ch)`, `touch-action: none`. Canvas'a CSS `border` verme: Input koordinat dönüşümü `getBoundingClientRect` kullanır, kenarlık bunu kaydırır. Parlama `box-shadow` ile yapılır.
Sayfa `lang="tr"` olduğundan başlıklarda `text-transform: uppercase` kullanma ("MİNESWEEPER" gibi yanlış harfler oluşur).

## Oyunlar

| id (hash) | Sınıf / boyut | Önemli notlar |
|---|---|---|
| `snake` | SnakeGame 600×600 | Üst 40 px HUD, 30×28 hücre (20 px). Yön tamponu en fazla 3 basış; her basış bir önceki *tamponlanmış* yöne göre doğrulanır. Adım 0,12 sn, her yemde ×0,97 (en az 0,05). Saf: `enqueueDirection`, `stepSnake`, `spawnFood`. |
| `2048` | Game2048 500×500 | Saf: `slideLine`, `moveGrid` (kayma animasyonu için hamle listesi döner), `spawnTile`, `canMove`. 2048'de `'won'` durumunda yalnızca *Devam et* (Space) / *Yeniden* (Enter) düğmeleri çalışır; rastgele dokunuş yeniden başlatmaz (`updateWon`). Devam modunda `continued = true`. |
| `minesweeper` | MinesweeperGame, dinamik | Kolay 9×9/10 (360×424), Orta 16×16/40 (512×580), Zor 16 satır × 30 sütun / 99 (812×516). Boyut `engine.resizeCanvas` ile değişir. `update`'i tamamen kendisi yönetir. Hazır overlay'i yoktur: ilk tıklama mayınları yerleştirir (tıklanan hücre ve komşuları güvenli) ve başlatır. Skor = süre (`lowerIsBetter`, `recordOnWin`), zorluk başına ayrı rekor. `restart()` → `'ready'`. Saf: `createBoard`, `placeMines`, `reveal` (yığınla flood-fill), `chord`, `toggleFlag`, `isWon`. |
| `tetris` | TetrisGame 480×600 | 10×20 alan (30 px) + 180 px yan panel; skor/rekor üst HUD yerine panelde. SRS kick tabloları (y yukarı pozitif, uygularken işaret çevrilir), 7-bag, ghost, 3 parça önizleme, hold (C/Shift, mobilde yukarı swipe). Guideline yerçekimi, kilit gecikmesi 0,5 sn (15 yenileme), DAS 0,17 / ARR 0,05, satır silme animasyonu 0,22 sn. Dokunma: tap döndürür, `pointer.startX`'ten itibaren her 30 mantıksal px sürükleme 1 hücre kaydırır, aşağı swipe hard drop yapar. Saf: `rotateMatrix`, `tryRotate`, `collides`, `clearLines`, `fullRows`, `mergePiece`, `scoreForLines`, `createBag`, `gravityInterval`. |
| `pong` | PongGame 800×500 | `hasScore:false`. Mod menüsü (1/2). AI 0,12 sn'de bir hedef günceller, `predictY` + hız arttıkça büyüyen hata payı, hızı 330 (oyuncu 460). Top alt adımlı hareket eder, her vuruşta ×1,06 (en fazla 950). Dokunma: sol yarı P1, 2P modunda sağ yarı P2. 7'ye ulaşan kazanır. |
| `breakout` | BreakoutGame 600×700 | 10×8 tuğla ızgarası, 4 dizilim döngüsü (8. seviyeden itibaren tohumlu rastgele), sağlam tuğla 2 vuruş. Alt adım = yarıçapın yarısı (tünelleme yok). Raket: klavye ya da imleç (fare yalnızca hareket edince takip edilir: `lastPointerX`). 3 can. Saf: `layoutForLevel`, `circleRect`, `paddleBounce`, `levelSpeed`. |
| `flappy` | FlappyGame 400×600 | Yerçekimi 1500, zıplama −430, zemin y = 550. Ardışık boşluk kayması ≤ `MAX_GAP_SHIFT` (130). Bu sınır olmadan yetişilemeyen boru dizileri oluşuyordu. `this.rng` testte tohumlanabilir. Zıplama `pointer.pressed` ile. Saf: `birdStep`, `makePipe`, `hitsPipe`. |
| `tictactoe` | TicTacToeGame 450×500 | `hasScore:false`. Menü: 1/2 oyuncu, K/Z = kolay/zor (kolay: %50 rastgele hamle). İnsan X ve her zaman ilk oynar. Skor tablosu modül düzeyindeki `sessionTally`'de (oyun değişince de korunur, kaydedilmez). Saf: `winnerOf`, `minimax`, `bestMove`, `aiMove`. |
| `connect4` | ConnectFourGame 700×650 | `hasScore:false`. Alfa-beta derinlik 5, sütun sırası merkezden dışa, pencere heuristiği (3+1: 5, 2+2: 2, rakip 3+1: −4, orta sütun +3). Düşme animasyonu bitince taş tahtaya yazılır. İmleç yalnızca hareket edince sütun seçer (yoksa klavye seçimini ezer). `sessionTally`. Saf: `dropRow`, `findWin`, `evaluate`, `alphaBeta`, `bestMove`. |
| `lightsout` | LightsOutGame 500×550 | 10 seviye; `clicksForLevel = 3 + 2(n−1)` farklı hücreye tıklanarak karıştırılır. `solve()` = GF(2) Gauss eliminasyonu + en az tıklamalı çözüm (hedef hamle ve ipucu bunu kullanır). Alt düğmeler: Sıfırla (R), İpucu (H). Puan: `max(10, 100·seviye − 10·fazla hamle − 25·ipucu)`. |
| `memory` | MemoryGame 600×650 | 4×4 kart, 8 şekil×renk çifti, çevirme animasyonu. Eşleşmeyen kartlar 0,8 sn kilitlenir. Puan `max(50, 1000 − 40·(hamle−8))`. Saf: `createDeck`, `computeScore`. |
| `life` | LifeGame 800×600 | `hasScore:false`, durum hep `'playing'`, `canPause()` hep true, kendi `drawOverlay`'i var: üstte 24 px durum şeridi, altta 60 px dokunmatik araç çubuğu (Oynat, Adım, Rastgele, Temizle, döngüsel desen, döngüsel hız). Klavye ve düğmeler aynı `action(id)` metodunu çağırır. Çubukta başlayan jest çizim yapmaz (`gestureOnBar`). Çizim `pointer.startX/Y`'den başlayıp Bresenham ile yapılır. Açılışta bir Gosper gun hazır bekler. Saf: `step` (toroidal), `parseRLE`, `placePattern`, `PATTERNS`. |

## Test ve doğrulama

```sh
node tests/check.mjs                 # node --check, import yolu/harf, HTML yolları, .nojekyll, GAMES kaydı, yasak API'ler
node tests/logic.test.mjs            # 53 saf mantık testi; ~2 sn
node tests/browser-smoke.mjs --shots <klasör>        # yerel (tests/serve.mjs'i 8765'te kendisi açar)
node tests/browser-smoke.mjs --url https://omerfarukoktay112-max.github.io/arcade-hub/   # canlı site
```

- `logic.test.mjs` içindeki **`fakeEngine(GameClass)`** DOM'suz bir engine döndürür: `{ game, input, engine, step(dt) }`. Girdi elle verilir: `input.pressed.add('Space')`, `input.typed.add('+')`, `Object.assign(input.pointer, {...})`. **`seeded(n)`** tohumlu RNG üretir. Rastgeleliğe bağlı testleri mutlaka tohumla; bir kez kararsız (flaky) Flappy testi böyle çıktı.
- `browser-smoke.mjs`:
  - Chrome/Edge'i bulur (`CHROME_PATH` ile de verilebilir); tarayıcı yoksa testi atlar.
  - Oyun başına senaryolar `SCENARIOS` nesnesinde; oyun durumuna `window.arcadeHub.engine.game` üzerinden erişir.
  - Sırasıyla şunları dener: geçersiz hash → Snake, her oyunu hash ve menüyle açma, P/Esc, 12 oyun × 8 tur hızlı geçiş, 375px mobil düzen (taşma, en-boy oranı, dpr = 2), dokunma (tap, uzun basış, swipe).
  - Konsolda uyarı ya da hata görürse başarısız sayılır.
- Görsel kontrol: `--shots` ile kaydedilen PNG'leri Read aracıyla incele.
- Zamanlama tuzağı: Connect Four'da taş düşüşü + AI gecikmesi yaklaşık 1,5 sn sürer; tarayıcı senaryolarında yeterince bekle.

## Yeni oyun ekleme

1. `js/games/YeniGame.js`: `export class YeniGame extends BaseGame { static meta = {...} }`. Sınıf adı dosya adıyla aynı olmalı; `check.mjs` export'u bu adla arar.
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

## Çalışma ortamı notları

- Windows 11; Git Bash + PowerShell. Node 24 var (yerleşik `WebSocket`); **Python yok**. Yerel sunucu için `node tests/serve.mjs 8000` kullan (http://localhost:8000/ ve /arcade-hub/).
- Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe` (Edge de var).
- `gh` CLI `omerfarukoktay112-max` hesabıyla oturum açık.
- Uzun ve çok satırlı düzenlemeleri Bash heredoc içinde `node -e` ile yapma: ters tırnak ve `${}` içeren heredoc'lar bozuluyor. Edit aracını ya da scratchpad'e yazılmış bir `.cjs` betiğini kullan.
- Commit mesajları Türkçe, önekli: `feat: <oyun> eklendi`, `fix: …`, `test: …`, `docs: …`; sonunda `Co-Authored-By` satırı bulunur.
