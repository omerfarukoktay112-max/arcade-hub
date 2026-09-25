/**
 * Engine — oyun döngüsü, canvas yönetimi (HiDPI), duraklatma ve oyun yükleme.
 *
 * Döngü sırası: update(dt) → temizle → draw() → drawOverlay() → [duraklatma ekranı] → input.endFrame()
 * Oyunlar her zaman mantıksal pikselle çizer; devicePixelRatio ölçeklemesi burada yapılır.
 */
import { Input } from './Input.js';
import { Storage } from './Storage.js';
import { Sound } from './Sound.js';
import { NEON, FONT } from './BaseGame.js';

const MAX_DT = 0.1;

function currentDpr() {
  return Math.min(3, Math.max(1, window.devicePixelRatio || 1));
}

export class Engine {
  constructor(canvas, { onChange = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.storage = Storage;
    this.sound = new Sound(Storage);
    this.input = new Input(canvas);
    this.onChange = onChange;

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

    const { width, height } = GameClass.meta;
    this.resizeCanvas(width, height);
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
      if (input.wasPressed('KeyP', 'Escape')) {
        input.consume('KeyP', 'Escape');
        this.togglePause();
      } else if (this.paused && input.pointer.clicked) {
        input.pointer.clicked = false;
        this.resume();
      }

      if (!this.paused) game.update(dt);
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
    ctx.fillText('DURAKLATILDI', w / 2, h / 2 - 18);
    ctx.shadowBlur = 0;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = NEON.text;
    ctx.fillText('Devam: P / Esc / dokun', w / 2, h / 2 + 24);
    ctx.restore();
  }
}
