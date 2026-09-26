/**
 * Engine — oyun döngüsü, canvas yönetimi (HiDPI), duraklatma ve oyun yükleme.
 *
 * Döngü sırası: update(dt) → temizle → draw() → drawOverlay() → [duraklatma ekranı] → [geçiş perdesi] → input.endFrame()
 * Oyunlar her zaman mantıksal pikselle çizer; ölçekleme burada yapılır. Canvas'ın iç çözünürlüğü
 * mantıksal boyuttan değil, ekranda GÖSTERİLDİĞİ boyuttan hesaplanır (CSS genişliği × dpr, dpr ≤ 2):
 * telefonda 600 px'lik bir oyun ~370 CSS px'e sığdırıldığında 1800 px yerine ~740 px çizilir.
 * Oyun değişince canvas üzerinde oyunun tema rengiyle kısa bir "perde" geçişi oynatılır.
 */
import { Input } from './Input.js';
import { Storage } from './Storage.js';
import { Sound } from './Sound.js';
import { NEON, FONT, easeOutCubic, clamp } from './BaseGame.js';
import { t } from './I18n.js';

const MAX_DT = 0.1;
/**
 * Kare hızı politikası (pil/ısınma için; oyun mantığı dt ile çalıştığından hız değişmez):
 * - Dokunmatik cihazda ekran 100 Hz'in üstündeyse (120 Hz telefonlar) 60 FPS ile sınırlanır.
 * - Duraklatılmışken PAUSED_FPS, ayar paneli açıkken ve "sakin" ekranda CALM_FPS.
 * - Sakin: son girdiden ACTIVE_MS geçmiş, durum 1 sn'den eski ve oyun needsFullRate() demiyor.
 * - Yeni bir girdi gelirse kare beklenmeden hemen işlenir (gecikme yok).
 */
const CAP_FPS = 60;
const CALM_FPS = 30;
const PAUSED_FPS = 10;
const ACTIVE_MS = 2500;
const TRANSITION_TIME = 0.5;
const SHUTTERS = 7;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Çizim için kullanılan en yüksek piksel yoğunluğu. 3× ekranlarda 2× ile fark gözle seçilmez, piksel sayısı 2,25 kat azalır. */
const MAX_DPR = 2;

function currentDpr() {
  return Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
}

export class Engine {
  constructor(canvas, { onChange = null, onOpenSettings = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.storage = Storage;
    this.sound = new Sound(Storage);
    this.input = new Input(canvas);
    this.onChange = onChange;
    /** Oyunların "⚙ Ayarlar" düğmesi bunu çağırır (app.js ayar panelini açar). */
    this.openSettings = onOpenSettings;
    /** true iken oyun güncellenmez ve girdi alınmaz (ör. ayar paneli açıkken); çizim sürer. */
    this.suspended = false;
    this.transition = null;
    this.reducedMotion = false;

    this.width = canvas.width;
    this.height = canvas.height;
    this.dpr = 1;
    /** Mantıksal pikselden canvas pikseline ölçek (CSS genişliği × dpr / mantıksal genişlik). */
    this.scale = 1;
    this.game = null;
    this.paused = false;
    this.rafId = 0;
    this.lastTime = 0;
    this._errorLogged = false;
    this._lastFrame = 0;
    this._rafPrev = 0;
    this._rafAvg = 16.7; // ölçülen rAF aralığı (ms), ekran yenileme hızını anlamak için
    this.limitHighRefresh = !!window.matchMedia?.('(pointer: coarse)').matches;

    this._loop = this._loop.bind(this);
    this._onVisibility = () => {
      if (document.hidden) this.pause();
    };
    this._unlockAudio = () => this.sound.unlock();
    // Canvas'ın ekrandaki boyutu değişince (döndürme, pencere, düzen) iç çözünürlük yeniden hesaplanır.
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._fitBacking(true));
      this._resizeObserver.observe(canvas);
    }
    document.addEventListener('visibilitychange', this._onVisibility);
    // pointerup/touchend: dokunmatikte ses izni parmak kalkınca oluşur (yoksa ilk dokunuş sessiz kalırdı).
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
      window.addEventListener(type, this._unlockAudio, true);
    }
  }

  /** Önceki oyunu yok eder, canvas'ı yeni oyunun boyutuna getirir ve başlatır. */
  loadGame(GameClass) {
    if (this.game) {
      try {
        this.game.destroy();
      } catch (err) {
        console.error(err);
      }
    }
    this.game = null;
    this.paused = false;
    this.input.reset();
    this._errorLogged = false;

    const { width, height, theme } = GameClass.meta;
    this.resizeCanvas(width, height);
    // "Hareketi azalt" tercihinde panjurlar yerine yalnızca solma kullanılır (geçiş yine görünür).
    this.reducedMotion = reducedMotion();
    this.transition = { t: 0, colors: theme || [NEON.cyan, NEON.pink], fade: this.reducedMotion };
    const game = new GameClass(this);
    this.game = game;
    game.init();
    this._state = game.state;

    this.lastTime = performance.now();
    this.input.lastActivity = this.lastTime; // yeni oyun: ilk saniyeler tam hız
    if (!this.rafId) this.rafId = requestAnimationFrame(this._loop);
    this._emit();
    return game;
  }

  /** Canvas'ı mantıksal w×h boyutuna getirir (oyun sırasında da çağrılabilir, ör. Minesweeper). */
  resizeCanvas(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.style.setProperty('--cw', String(w));
    this.canvas.style.setProperty('--ch', String(h));
    this.input.setSize(w, h);
    this._fitBacking(false);
  }

  /**
   * İç çözünürlüğü canvas'ın ekrandaki boyutuna uydurur. Boyut değişmediyse dokunmaz
   * (canvas.width atamak içeriği siler). `redraw`: ResizeObserver'dan gelindiğinde tuval
   * boyama öncesi silinmiş olur; boş kare görünmesin diye hemen yeniden çizilir.
   */
  _fitBacking(redraw) {
    const w = this.width;
    const h = this.height;
    const dpr = currentDpr();
    // clientWidth, CSS'teki min(...) sonucudur; ekran dışı/gizliyse mantıksal boyuta düşülür.
    const cssW = this.canvas.clientWidth || w;
    const scale = Math.min(cssW, w) * dpr / w;
    const bw = Math.max(1, Math.round(w * scale));
    const bh = Math.max(1, Math.round(h * scale));
    this.dpr = dpr;
    if (bw === this.canvas.width && bh === this.canvas.height && scale === this.scale) return;
    this.scale = scale;
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    if (redraw && this.game) this._render(0);
  }

  /** Oyunu dondurur/çözer. Çözülürken oynanan bir oyun varsa duraklatma ekranına geçer. */
  setSuspended(on) {
    this.suspended = !!on;
    this.input.reset();
    if (!on) {
      this.lastTime = performance.now();
      this.pause();
    }
  }

  pause() {
    if (this.paused || !this.game || !this.game.canPause()) return;
    this.paused = true;
    this._emit();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.lastTime = performance.now();
    this._emit();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  _emit() {
    if (this.onChange) this.onChange(this);
  }

  /** Bu kare için iki kare arası en kısa süre (ms); 0 = her rAF karesi. */
  _minFrameGap(now) {
    const cap = this.limitHighRefresh && this._rafAvg < 10 ? 1000 / CAP_FPS : 0;
    const game = this.game;
    if (!game || this.transition) return cap;
    if (this.paused) return 1000 / PAUSED_FPS;
    if (this.suspended) return 1000 / CALM_FPS;
    const calm = now - this.input.lastActivity > ACTIVE_MS && game.stateTime > 1 && !game.needsFullRate();
    return calm ? Math.max(cap, 1000 / CALM_FPS) : cap;
  }

  _loop(now) {
    this.rafId = requestAnimationFrame(this._loop);
    if (this._rafPrev) this._rafAvg += (Math.min(100, now - this._rafPrev) - this._rafAvg) * 0.05;
    this._rafPrev = now;
    // Kare atlama: girdi yoksa ve bir sonraki kareye henüz vakit gelmediyse hiçbir şey yapma.
    // (Girdi kaybolmaz: Input durumu endFrame'e kadar birikir.)
    const gap = this._minFrameGap(now);
    if (gap && now - this._lastFrame < gap - 1.5 && this.input.lastActivity <= this._lastFrame) return;
    this._lastFrame = now;
    const dt = Math.min(MAX_DT, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const game = this.game;
    const input = this.input;
    if (!game) {
      input.endFrame();
      return;
    }
    // Tarayıcı yakınlaştırma / ekran değişimi dpr'ı değiştirebilir.
    if (currentDpr() !== this.dpr) this._fitBacking(false);

    try {
      if (this.suspended) {
        // Girdi yok sayılır; son kare olduğu gibi çizilir.
      } else if (input.wasPressed('KeyP', 'Escape')) {
        input.consume('KeyP', 'Escape');
        this.togglePause();
      } else if (this.paused && input.pointer.clicked) {
        input.pointer.clicked = false;
        this.resume();
      }

      if (!this.paused && !this.suspended) game.update(dt);
      // Oyun bittiyse ya da artık duraklatılamıyorsa duraklatmayı kaldır.
      if (this.paused && !game.canPause()) this.resume();
      // Oyun durumu değiştiyse (hazır → oynanıyor → bitti) arayüze haber ver (ör. mobil oyun modu).
      if (game.state !== this._state) {
        this._state = game.state;
        this._emit();
      }

      this._draw(dt);
    } catch (err) {
      this._logError(err);
    }
    input.endFrame();
  }

  /** Yalnızca çizim (güncelleme yok); ör. canvas yeniden boyutlanınca aynı kareyi tekrar çizer. */
  _render(dt) {
    try {
      this._draw(dt);
    } catch (err) {
      this._logError(err);
    }
  }

  _draw(dt) {
    const game = this.game;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = NEON.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    game.draw();
    ctx.restore();
    ctx.save();
    game.drawOverlay();
    ctx.restore();
    if (this.paused) this._drawPause();
    if (this.transition) this._drawTransition(dt);
  }

  _logError(err) {
    if (this._errorLogged) return;
    this._errorLogged = true;
    console.error(`[${this.game?.constructor.meta?.id}]`, err);
  }

  _drawPause() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 4, 10, 0.75)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.min(40, Math.floor(w / 11))}px ${FONT}`;
    ctx.fillStyle = NEON.yellow;
    ctx.shadowColor = NEON.yellow;
    ctx.shadowBlur = 16;
    ctx.fillText(t('pause.title'), w / 2, h / 2 - 18, w - 24);
    ctx.shadowBlur = 0;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = NEON.text;
    ctx.fillText(t('pause.hint'), w / 2, h / 2 + 24, w - 24);
    ctx.restore();
  }

  /**
   * Oyun geçiş perdesi: dikey panjurlar, soldan sağa kademeli olarak yukarı/aşağı çekilir;
   * kenarlarında yeni oyunun tema renkleriyle parlayan bir çizgi vardır. Hareketi azalt
   * tercihinde perde yerinde kararıp açılır (solma).
   */
  _drawTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    if (tr.t >= TRANSITION_TIME) {
      this.transition = null;
      return;
    }
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (tr.fade) {
      ctx.save();
      ctx.globalAlpha = 1 - easeOutCubic(tr.t / TRANSITION_TIME);
      ctx.fillStyle = NEON.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }
    const bw = w / SHUTTERS;
    const stagger = 0.035;
    const span = TRANSITION_TIME - stagger * (SHUTTERS - 1);
    ctx.save();
    for (let i = 0; i < SHUTTERS; i++) {
      const k = easeOutCubic(clamp((tr.t - i * stagger) / span, 0, 1));
      if (k >= 1) continue;
      const up = i % 2 === 0;
      const bh = h * (1 - k);
      const y = up ? 0 : h - bh;
      ctx.fillStyle = NEON.bg;
      ctx.fillRect(i * bw - 0.5, y, bw + 1, bh);
      const color = tr.colors[i % tr.colors.length];
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.fillRect(i * bw, up ? bh - 3 : y, bw, 3);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}
