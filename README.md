# Arcade Hub

**Canlı:** <https://omerfarukoktay112-max.github.io/arcade-hub/>

Tarayıcıda çalışan, sunucusuz ve bağımlılıksız bir retro arcade oyun kütüphanesi. 12 klasik oyun; koyu, neon vurgulu arayüz. Tüm grafikler canvas ile koddan çizilir, sesler Web Audio ile üretilir. Build adımı, npm paketi, framework veya CDN yoktur: dosyaları olduğu gibi GitHub Pages'e koymanız yeterli.

- Saf HTML + CSS + vanilla JavaScript (ES modules)
- Masaüstü (klavye/fare) ve mobil (dokunma, swipe, uzun basış) desteği
- HiDPI/Retina ekranlarda keskin görüntü
- Rekorlar tarayıcının `localStorage`'ında saklanır
- `#tetris` gibi doğrudan bağlantılar

## Oyunlar ve kontroller

Tüm oyunlarda **P / Esc** duraklatır ve devam ettirir; sekme gizlenince oyun kendiliğinden duraklar. Başlamak için **Space / dokun**, oyun bitince yeniden başlamak için **Enter / dokun**. Üst çubukta **Duraklat** ve **Ses** düğmeleri vardır.

| Oyun | Bağlantı | Kontroller |
|---|---|---|
| **Snake** | `#snake` | Ok tuşları / WASD · mobilde swipe |
| **2048** | `#2048` | Ok tuşları / WASD · swipe. 2048'de *Devam et* (Space) ya da *Yeniden* (Enter) |
| **Minesweeper** | `#minesweeper` | Sol tık / dokun: aç · Sağ tık / uzun bas: bayrak · Açık sayıya tık: çevresini aç (chord) · 1/2/3 ya da üstteki düğmeler: Kolay 9×9 / Orta 16×16 / Zor 16×30 |
| **Tetris** | `#tetris` | ←/→ kaydır (basılı tut: otomatik tekrar) · ↑ / X döndür · Z ters döndür · ↓ yavaş düşür · Space sert düşür · C / Shift tut · Mobil: dokun = döndür, yatay sürükle = kaydır, aşağı kaydır = sert düşür, yukarı kaydır = tut |
| **Pong** | `#pong` | 1 / 2: oyuncu sayısı · Oyuncu 1: W/S (tek oyuncuda ↑/↓ de) · Oyuncu 2: ↑/↓ · Mobil: dokunduğun yüksekliğe raket gider |
| **Breakout** | `#breakout` | Fare / dokunma ya da ←/→ (A/D) · Space / tık: topu fırlat |
| **Flappy Bird** | `#flappy` | Space / ↑ / tık / dokun: zıpla |
| **Tic-Tac-Toe** | `#tictactoe` | Tık / dokun ya da oklar + Enter · 1 / 2: oyuncu sayısı · K / Z: kolay / zor |
| **Connect Four** | `#connect4` | Fare / dokunma ile sütun seç ve bırak · ←/→ + Enter / Space · 1 / 2: oyuncu sayısı |
| **Lights Out** | `#lightsout` | Tık / dokun ya da oklar + Enter · R / *Sıfırla*: seviyeyi baştan al · H / *İpucu* |
| **Memory Match** | `#memory` | Tık / dokun ya da oklar + Enter |
| **Conway's Game of Life** | `#life` | Space: oynat/durdur · N: tek adım · C: temizle · R: rastgele · + / −: hız · 1 / 2 / 3: glider / pulsar / Gosper glider gun · Sürükle: çiz (sağ tık: sil) · Mobil: alt araç çubuğu |

Hash yoksa ya da geçersizse Snake açılır.

## Yerel çalıştırma

ES modülleri `file://` üzerinden yüklenmez; herhangi bir statik sunucu gerekir. Proje klasöründe şunlardan birini çalıştırın:

```sh
python -m http.server 8000      # Python 3 (bazı sistemlerde: python3)
npx serve .                     # Node.js
node tests/serve.mjs 8000       # bağımlılıksız yerleşik sunucu
```

Ardından <http://localhost:8000/> adresini açın. `node tests/serve.mjs` ayrıca GitHub Pages alt dizinini taklit eder: <http://localhost:8000/arcade-hub/>.

## Testler

Hiçbiri npm paketi gerektirmez (Node.js 22+ önerilir):

```sh
node tests/check.mjs          # tüm JS dosyaları node --check; import yolları ve büyük/küçük harf;
                              # HTML'de mutlak/harici yol yok; app.js kaydı; oyunlarda listener/zamanlayıcı yok
node tests/logic.test.mjs     # 53 saf mantık testi (2048 birleştirme, Tetris SRS/satır silme, Minesweeper
                              # flood-fill/chord, minimax, alfa-beta, Lights Out çözülebilirlik, Life adımı…)
node tests/browser-smoke.mjs  # headless Chrome/Edge: 12 oyun hash + menü ile açılır, gerçek klavye/fare/dokunma
                              # olaylarıyla oynatılır, hızlı oyun geçişi, 375px mobil düzen; konsolda hata aranır
```

Yayındaki siteyi test etmek için: `node tests/browser-smoke.mjs --url https://<kullanici>.github.io/arcade-hub/`. Tarayıcı testi Chrome/Edge'i kendisi bulur (`CHROME_PATH` ile de verilebilir); tarayıcı yoksa atlanır. `--shots <klasör>` ile her oyunun ekran görüntüsünü kaydeder.

## GitHub Pages'te yayınlama

1. GitHub'da yeni bir depo oluşturun (ör. `arcade-hub`) ve projeyi gönderin:
   ```sh
   git remote add origin https://github.com/<kullanici>/arcade-hub.git
   git push -u origin main
   ```
2. Depoda **Settings → Pages** bölümüne gidin.
3. **Build and deployment → Source: Deploy from a branch** seçin.
4. **Branch: `main`**, klasör: **`/ (root)`** seçip **Save**'e basın.
5. Bir iki dakika sonra site `https://<kullanici>.github.io/arcade-hub/` adresinde yayında olur.

Tüm yollar göreli olduğu için alt dizinde sorunsuz çalışır. Kökteki boş `.nojekyll` dosyası Jekyll işlemesini kapatır.

## Yeni oyun ekleme

1. `js/games/YeniGame.js` dosyasını oluşturun:
   ```js
   import { BaseGame, NEON } from '../core/BaseGame.js';

   export class YeniGame extends BaseGame {
     static meta = {
       id: 'yeni',                // hash: #yeni
       title: 'Yeni Oyun',
       width: 600, height: 600,   // mantıksal çözünürlük
       controls: 'Ok tuşları ile hareket',
       description: 'Kısa açıklama.',
     };

     reset() {
       super.reset();             // score = 0
       this.x = 300;
     }

     update(dt) {
       if (super.update(dt)) return;          // hazır/bitti ekranı ortak olarak yönetilir
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
2. `js/app.js` içinde import edip `GAMES` dizisine ekleyin. Menü butonu otomatik oluşur.
3. Oyun mantığını saf fonksiyonlar olarak export edip `tests/logic.test.mjs`'e test ekleyin, ardından üç test komutunu çalıştırın.

Kurallar: girdi yalnızca `this.input`'tan okunur, listener veya `setTimeout` eklenmez, zamanlama `dt` ile yapılır, harici kaynak kullanılmaz. Ayrıntılar için [CLAUDE.md](CLAUDE.md).

## Proje yapısı

```
arcade-hub/
├── index.html            # tek sayfa; oyun listesi HTML'de yazılı değildir
├── .nojekyll
├── css/style.css
├── js/
│   ├── app.js            # oyun kaydı, menü, hash yönlendirme
│   ├── core/             # Engine, Input, BaseGame, Storage, Sound
│   └── games/            # 12 oyun, her biri BaseGame'den türer
└── tests/                # yalnızca geliştirme: sunucu, denetimler, testler
```

## Tasarım kararları

**Çekirdek**
- `core/Sound.js` istenen yapıya ek bir dosyadır: Web Audio bip sesleri. Ses varsayılan olarak açıktır; tarayıcı kuralları gereği ses bağlamı ilk tuş/dokunuşta oluşturulur. Sessize alma tercihi saklanır.
- Canvas boyutu CSS'te `--cw`/`--ch` değişkenleriyle `min(mantıksal genişlik, %100, 75vh × oran)` olarak hesaplanır, yükseklik `aspect-ratio` ile türetilir; böylece oran her ekranda korunur. Engine bu değişkenleri `resizeCanvas()` içinde yazar ve tarayıcı yakınlaştırması dpr'ı değiştirirse canvas'ı yeniden ölçekler.
- `pointer.clicked` fare için basış anında, dokunmada ise kısa ve kaydırmasız bırakışta (≤12px) oluşur; ~400 ms uzun basış `button = 2` ile tıklama üretir. Böylece Minesweeper'da dokunma ile uzun basış birbirine karışmaz. Anında tepki gereken oyunlar (Flappy) ham `pointer.pressed` değerini kullanır.
- Oyunlar `e.code` kullanır; tek istisna `+`/`−` sembolleridir. `e.code` fiziksel konum olduğundan Türkçe Q klavyede `-` işaretli tuşun kodu `Equal`'dır; bu yüzden Input'a sembol tuşları için `e.key` tabanlı `wasTyped()` eklendi.
- Yeniden başlatma yalnızca **Enter / dokunma** ile ve oyun bittikten en az 0,4 sn sonra olur. Space kasıtlı olarak dışarıda bırakıldı: Tetris'te sert düşürme ya da Flappy'de zıplama sırasında yanlışlıkla yeniden başlamasın. Kazanan çizginin görünmesi gereken oyunlarda (`overlayDelay`) sonuç ekranı kısa bir gecikmeyle gelir.
- Mod/zorluk seçimleri için ortak `menuButtons` mekanizması: hazır ve bitti ekranında düğme + kısayol tuşu olarak çizilir.
- Bir oyunda çalışma zamanı hatası olursa Engine döngüyü durdurmaz, hatayı oyun başına bir kez konsola yazar.
- Rekorlar `arcade-hub:best:<id>` anahtarıyla saklanır; seçilen modlar da hatırlanır. Hata ayıklama için `window.arcadeHub` (`engine`, `games`) açıktır.
- Sayfa `lang="tr"` olduğu için başlıklarda CSS `uppercase` kullanılmaz (aksi halde "MİNESWEEPER" gibi yanlış büyük harfler oluşur).

**Oyunlar**
- **Snake:** 600×600'ün üst 40 px'i HUD; oyun alanı 30×28 hücre. Yön tamponu en fazla 3 basış tutar ve her basış bir önceki *tamponlanmış* yöne göre doğrulanır. Başlangıç adımı 0,12 sn, her yemde %3 hızlanır (en az 0,05 sn).
- **2048:** Kazanınca rekor kaydedilir; ekrana rastgele dokunmak oyunu yeniden başlatmaz, yalnızca *Devam et* / *Yeniden* düğmeleri çalışır.
- **Minesweeper:** Hazır ekranı yoktur; ilk tıklama oyunu başlatır. Mayınlar ilk tıklanan hücreye ve komşularına konmaz (ilk tıklama her zaman bir alan açar). En iyi süre zorluk başına ayrı saklanır; seçilen zorluk hatırlanır. Canvas boyutu zorluğa göre `engine.resizeCanvas()` ile değişir.
- **Tetris:** 300×600 alan + 180 px yan panel. Skor/rekor standart üst HUD yerine yan panelde gösterilir. Guideline yerçekimi eğrisi, 0,5 sn kilit gecikmesi (en fazla 15 yenileme), DAS 170 ms / ARR 50 ms, sonraki 3 parça önizlemesi, soft drop +1 ve hard drop +2 puan/hücre.
- **Pong:** Skor rekoru yoktur (`hasScore: false`). Yapay zekâ hedefini 0,12 sn'de bir, hız arttıkça büyüyen hata payıyla tahmin eder ve raketi oyuncudan yavaştır (330 vs 460 px/s). Simülasyonda tahmin yapan bir oyuncu onu yenebiliyor, reaktif bir oyuncu ise kaybediyor. İki oyunculu modda dokunmatik ekranın sağ yarısı ikinci raketi yönetir.
- **Breakout:** Dört dizilim (tam, sağlam üst sıralar, piramit, şeritler) döngüyle gelir; 8. seviyeden itibaren şerit dizilimi yerine seviyeye özgü, tohumlu, simetrik rastgele dizilim üretilir. Sağlam tuğlalar iki vuruşta kırılır ve iki kat puan verir. Her seviye topu %10 hızlandırır, seviye bonusu 100 × seviyedir.
- **Flappy Bird:** Ardışık boru boşlukları en fazla 130 px kayar. Bu sınır olmadan ardışık boşluklar arasında 270 px'ten fazla fark olabiliyordu ve bu fark en hızlı tırmanışla bile zar zor yetişilebiliyordu.
- **Tic-Tac-Toe ve Connect Four:** Skor tablosu sayfa açık kaldıkça (oyunlar arası geçişte de) korunur, kaydedilmez. İnsan her zaman ilk oynar. Connect Four AI'si derinlik 5 alfa-beta, merkezden dışa sütun sıralaması ve "hızlı kazanç / geç kayıp" tercihli değerlendirme kullanır.
- **Lights Out:** 10 seviye; seviye *n*'de çözülmüş tahtaya 3 + 2(n−1) farklı hücrede tıklanır (tümü sönük sonuç reddedilir). Hedef hamle ve **İpucu**, GF(2) Gauss eliminasyonuyla bulunan en kısa çözümden gelir. Seviye puanı: `max(10, 100·seviye − 10·fazla hamle − 25·ipucu)`.
- **Memory Match:** Skor = `max(50, 1000 − 40 × (hamle − 8))`; kusursuz oyun 1000 puan. Eşleşmeyen kartlar ikinci kart açıldıktan 0,8 sn sonra kapanır.
- **Game of Life:** Açılışta bir Gosper glider gun hazır bekler. Hücre rengi yaşa göre değişir. Klavyesiz cihazlar için canvas içinde bir araç çubuğu vardır (Oynat, Adım, Rastgele, Temizle, döngüsel desen ve hız). Hız 1–60 nesil/sn aralığındadır.
