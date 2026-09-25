# CLAUDE.md — Arcade Hub mimari kuralları

Sunucusuz, build adımı olmayan HTML5 oyun portalı. Dosyalar olduğu gibi GitHub Pages'e yayınlanır.

## Kesin kurallar

- **Saf HTML + CSS + vanilla JS (ES modules).** npm bağımlılığı, framework, CDN, harici kütüphane, resim veya ses dosyası YOK. Tüm görseller canvas ile koddan çizilir; sesler `core/Sound.js` üzerinden Web Audio ile üretilir.
- **Yollar göreli** (`./js/...`, `../core/...`) olmalı; site bir alt dizinde (`kullanici.github.io/arcade-hub/`) çalışır. `/` ile başlayan mutlak yol kullanma.
- **Import'lar `.js` uzantılı ve dosya adlarıyla büyük/küçük harf birebir aynı** olmalı (Pages Linux'ta çalışır). `node tests/check.mjs` bunu denetler.
- Arayüz metinleri Türkçe; oyun adları İngilizce özgün halleriyle kalır.
- Kök dizindeki boş `.nojekyll` silinmemeli.

## Oyun sözleşmesi

Her oyun `js/games/<Ad>Game.js` içinde `BaseGame`'den türeyen, **dosya adıyla aynı isimde export edilen** bir sınıftır.

- `static meta = { id, title, width, height, controls, description }` zorunlu. İsteğe bağlı: `hasScore: false` (HUD/rekor kapalı), `scoreLabel`, `lowerIsBetter` (süre gibi), `recordOnWin`.
- Girdi **yalnızca** `this.input`'tan okunur: `isDown(code)`, `wasPressed(code)`, `wasTyped(key)` (yalnızca `+`/`-` gibi semboller), `pointer.{x,y,isDown,pressed,clicked,button,type,hover,startX,startY}`, `swipe`. Klavyede `e.code` değerleri kullanılır (`'ArrowUp'`, `'KeyW'`, `'Space'`).
- Oyunlar **asla** `addEventListener`, `setTimeout`, `setInterval` veya `requestAnimationFrame` kullanmaz. Zamanlama `update(dt)` içindeki sayaçlarla yapılır (`dt` saniye, en fazla 0.1). `tests/check.mjs` bunu denetler.
- Çizim mantıksal pikselle yapılır (`meta.width/height`); devicePixelRatio'yu yalnızca Engine bilir.
- Yaşam döngüsü: `constructor(engine)` → `init()` → her karede `update(dt)` → `draw()` → `drawOverlay()` → oyun değişince `destroy()`.
- Durumlar: `'ready' | 'playing' | 'over' | 'won'`. Bitiş için `this.gameOver(won)` çağrılır; rekor otomatik kaydedilir.
- Ortak başlat/yeniden başlat BaseGame'dedir. Alt sınıf kalıbı:
  ```js
  update(dt) {
    this.animate(dt);              // durumdan bağımsız animasyonlar (isteğe bağlı)
    if (super.update(dt)) return;  // 'playing' değilse ya da bu kare menüye aitse
    // ... oyun mantığı
  }
  ```
- Yeni oyun için durum `reset()` içinde kurulur (`super.reset()` çağrılarak); `restart()` = `reset()` + `start()`.
- Hazır/bitti ekranında seçenek gerekiyorsa `this.menuButtons = [{ label, key, group, selected(), onClick() }]` kullanılır; overlay bunları otomatik yerleştirir ve hem tıklama hem kısayol tuşunu işler.
- Kritik mantık (birleştirme, döndürme, AI, çözücü, adım fonksiyonu…) DOM'suz **saf fonksiyonlar** olarak aynı dosyadan export edilir ve `tests/logic.test.mjs` içinde test edilir. Oyun modülleri üst düzeyde DOM'a dokunmamalı (Node'da import edilebilmeli).
- Kalıcı veri yalnızca `this.storage` (`core/Storage.js`, `arcade-hub:` önekli, try/catch sarmalı) ile.

## Yeni oyun ekleme

1. `js/games/YeniGame.js` oluştur: `export class YeniGame extends BaseGame { static meta = {...} ... }`.
2. `js/app.js` içinde import et ve `GAMES` dizisine ekle. Menü butonu `meta`'dan otomatik üretilir; HTML'e dokunma. `#<meta.id>` hash'i oyunu doğrudan açar.
3. Saf mantığı export et, `tests/logic.test.mjs`'e test ekle (gerekirse `fakeEngine(Game)` ile update döngüsünü Node'da sür).
4. Gerekirse `tests/browser-smoke.mjs` içindeki `SCENARIOS` nesnesine tarayıcı senaryosu ekle.
5. Doğrula:
   ```sh
   node tests/check.mjs          # sözdizimi, import yolları/harf, kayıt, yasak API'ler
   node tests/logic.test.mjs     # saf mantık testleri
   node tests/browser-smoke.mjs  # headless Chrome/Edge (varsa): konsol hatası, hash, mobil, dokunma
   ```

## Dosya haritası

- `js/app.js` — oyun kaydı (tek kaynak `GAMES`), menü üretimi, hash yönlendirme, araç çubuğu.
- `js/core/Engine.js` — rAF döngüsü, HiDPI, `loadGame`, `resizeCanvas`, duraklatma (P/Esc, sekme gizlenince).
- `js/core/Input.js` — klavye + pointer (fare/dokunma/kalem), uzun basış, swipe.
- `js/core/BaseGame.js` — temel sınıf, HUD, overlay, çizim yardımcıları, `NEON` paleti.
- `js/core/Storage.js`, `js/core/Sound.js` — localStorage ve Web Audio sarmalayıcıları.
- `tests/` — geliştirme araçları (yayında kullanılmaz): statik sunucu, denetimler, testler.
