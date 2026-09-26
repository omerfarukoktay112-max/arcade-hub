/**
 * Engine — oyun döngüsü, canvas yönetimi (HiDPI), duraklatma ve oyun yükleme.
 *
 * Döngü sırası: update(dt) → temizle → draw() → drawOverlay() → [duraklatma ekranı] → [geçiş perdesi] → input.endFrame()
 * Oyunlar her zaman mantıksal pikselle çizer; devicePixelRatio ölçeklemesi burada yapılır.
 * Oyun değişince canvas üzerinde oyunun tema rengiyle kısa bir "perde" geçişi oynatılır.
 */
import { Input } from './Input.js';
import { Storage } from './Storage.js';
import { Sound } from './Sound.js';
import { NEON, FONT, easeOutCubic, clamp } from './BaseGame.js';
import { t } from './I18n.js';

const MAX_DT = 0.1;
const TRANSITION_TIME = 0.5;
const SHUTTERS = 7;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function currentDpr() {
  return Math.min(3, Math.max(1, window.devicePixelRatio || 1));
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
    this.game = null;
    this.paused = false;
    this.rafId = 0;
    this.lastTime = 0;
    this._errorLogged = false;

    this._loop = this._loop.bind(this);
    this._onVisibility = () => {
      if (document.hidden) this.pause();
    };
    this._unlockAudio = () => this.sound.unlock();
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('pointerdown', this._unlockAudio, true);
    window.addEventListener('keydown', this._unlockAudio, true);
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

    this.lastTime = performance.now();
    if (!this.rafId) this.rafId = requestAnimationFrame(this._loop);
    this._emit();
    return game;
  }

  /** Canvas'ı mantıksal w×h boyutuna getirir (oyun sırasında da çağrılabilir, ör. Minesweeper). */
  resizeCanvas(w, h) {
    this.width = w;
    this.height = h;
    this.dpr = currentDpr();
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.setProperty('--cw', String(w));
    this.canvas.style.setProperty('--ch', String(h));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.input.setSize(w, h);
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

  _loop(now) {
    this.rafId = requestAnimationFrame(this._loop);
    const dt = Math.min(MAX_DT, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const game = this.game;
    const input = this.input;
    if (!game) {
      input.endFrame();
      return;
    }
    // Tarayıcı yakınlaştırma / ekran değişimi dpr'ı değiştirebilir.
    if (currentDpr() !== this.dpr) this.resizeCanvas(this.width, this.height);

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
    } catch (err) {
      if (!this._errorLogged) {
        this._errorLogged = true;
        console.error(`[${game.constructor.meta?.id}]`, err);
      }
    }
    input.endFrame();
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
