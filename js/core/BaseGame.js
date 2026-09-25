/**
 * BaseGame — tüm oyunların temel sınıfı.
 *
 * Her oyun:
 *  - `static meta = { id, title, width, height, controls, description }` tanımlar,
 *  - girdiyi yalnızca `this.input`'tan okur (kendi listener'ı yoktur),
 *  - zamanlayıcı olarak setTimeout/setInterval değil, update(dt) içindeki sayaçları kullanır.
 *
 * Yaşam döngüsü: constructor(engine) → init() → [update(dt) → draw() → drawOverlay()]* → destroy()
 * Durumlar: 'ready' | 'playing' | 'over' | 'won'
 */

export const NEON = {
  bg: '#07070d',
  panel: 'rgba(12, 12, 28, 0.92)',
  grid: '#15152a',
  text: '#ecebff',
  dim: '#8b8aad',
  cyan: '#22e4ff',
  pink: '#ff2e88',
  green: '#39ff88',
  yellow: '#ffe14d',
  orange: '#ff9a3c',
  purple: '#b26bff',
  red: '#ff4d5e',
  blue: '#4d7cff',
};

export const FONT = '"Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace';
export const HUD_HEIGHT = 40;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const randInt = (min, max, rng = Math.random) => min + Math.floor(rng() * (max - min + 1));
export const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Fisher–Yates karıştırma (yerinde). */
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export class BaseGame {
  static meta = {
    id: 'base',
    title: 'Oyun',
    width: 480,
    height: 480,
    controls: '',
    description: '',
    hasScore: true, // false: HUD skoru ve rekor gösterimi kapanır
    // scoreLabel: 'SKOR', lowerIsBetter: false, recordOnWin: false
  };

  constructor(engine) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.input = engine.input;
    this.storage = engine.storage;
    this.sound = engine.sound;

    this.score = 0;
    this.state = 'ready';
    this.stateTime = 0; // mevcut durumda geçen süre (sn)
    this.time = 0; // oyun yüklendiğinden beri geçen süre (animasyonlar için)
    this.isNewRecord = false;

    /** Hazır/bitti ekranında gösterilen butonlar: { label, key?, group?, selected?(), onClick() } */
    this.menuButtons = [];
    /** Oyun bitince overlay'in gecikmesi (sn) — kazanan çizgiyi vb. görmek için. */
    this.overlayDelay = 0;
    /** Overlay arka planının karartma oranı. */
    this.overlayDim = 0.72;
  }

  get meta() {
    return this.constructor.meta;
  }
  get width() {
    return this.engine.width;
  }
  get height() {
    return this.engine.height;
  }
  get hasScore() {
    return this.meta.hasScore !== false;
  }
  /** Rekorun saklandığı anahtar (ör. zorluk başına farklı rekor için override edilir). */
  get recordKey() {
    return this.meta.id;
  }
  get best() {
    return this.storage.getBest(this.recordKey);
  }
  get isEnded() {
    return this.state === 'over' || this.state === 'won';
  }

  /* ---------- Yaşam döngüsü ---------- */

  init() {
    this.reset();
    this.state = 'ready';
    this.stateTime = 0;
  }

  /** Yeni bir oyun için tüm oyun durumunu sıfırlar. Alt sınıflar super.reset() çağırmalı. */
  reset() {
    this.score = 0;
    this.isNewRecord = false;
  }

  start() {
    this.state = 'playing';
    this.stateTime = 0;
    this.sound.beep(660, 0.06);
  }

  restart() {
    this.reset();
    this.start();
  }

  canPause() {
    return this.state === 'playing';
  }

  /**
   * Ortak başlatma / yeniden başlatma mantığı.
   * true dönerse bu kare oyun mantığına ait değildir; alt sınıf hemen dönmelidir:
   *     update(dt) { if (super.update(dt)) return; ... }
   */
  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    if (this.state === 'playing') return false;
    this.handleMenuInput();
    return true;
  }

  handleMenuInput() {
    const input = this.input;
    const p = input.pointer;
    if (this.isEnded && this.stateTime < this.overlayDelay) return;

    const layout = this.overlayLayout();
    if (layout) {
      for (const b of layout.buttons) {
        const keys = b.key ? [].concat(b.key) : [];
        if ((keys.length && input.wasPressed(...keys)) || (p.clicked && pointInRect(p, b.rect))) {
          b.onClick();
          this.sound.beep(520, 0.04);
          return;
        }
      }
    }

    if (this.state === 'ready') {
      if (input.wasPressed('Space', 'Enter') || p.clicked) this.start();
    } else if (this.isEnded && this.stateTime >= Math.max(0.4, this.overlayDelay)) {
      if (input.wasPressed('Enter') || p.clicked) this.restart();
    }
  }

  /** Oyunu bitirir, rekoru kaydeder. */
  gameOver(won = false) {
    if (this.isEnded) return;
    this.state = won ? 'won' : 'over';
    this.stateTime = 0;
    if (!this.meta.recordOnWin || won) this.recordScore();
    if (won) this.sound.win();
    else this.sound.lose();
  }

  /** Skoru rekor olarak dener (gameOver dışında da çağrılabilir). */
  recordScore() {
    if (!this.hasScore) return false;
    const better = this.storage.submitScore(this.recordKey, this.score, !!this.meta.lowerIsBetter);
    if (better) this.isNewRecord = true;
    return better;
  }

  draw() {}

  destroy() {
    this.menuButtons = [];
  }

  /* ---------- Metin ve çizim yardımcıları ---------- */

  formatScore(value) {
    return String(Math.floor(value));
  }

  text(str, x, y, { size = 18, color = NEON.text, align = 'center', baseline = 'middle', weight = '700', glow = 0 } = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillStyle = color;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /** Standart HUD: solda skor, sağda rekor, ortada isteğe bağlı bilgi. */
  drawHUD(center = '') {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = NEON.panel;
    ctx.fillRect(0, 0, this.width, HUD_HEIGHT);
    ctx.fillStyle = 'rgba(34, 228, 255, 0.35)';
    ctx.fillRect(0, HUD_HEIGHT - 1, this.width, 1);
    ctx.restore();
    const y = HUD_HEIGHT / 2 + 1;
    if (this.hasScore) {
      const label = this.meta.scoreLabel || 'SKOR';
      this.text(`${label} ${this.formatScore(this.score)}`, 14, y, { size: 16, align: 'left', color: NEON.cyan });
      const best = this.best;
      this.text(`REKOR ${best === null ? '-' : this.formatScore(best)}`, this.width - 14, y, {
        size: 16, align: 'right', color: NEON.pink,
      });
    }
    if (center) this.text(center, this.width / 2, y, { size: 15, color: NEON.yellow });
  }

  drawButton(rect, label, { selected = false, color = NEON.cyan, size = 15 } = {}) {
    const ctx = this.ctx;
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = selected ? color : 'rgba(20, 20, 40, 0.95)';
    ctx.globalAlpha = selected ? 0.9 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = selected ? 12 : 4;
    ctx.stroke();
    ctx.restore();
    this.text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, { size, color: selected ? NEON.bg : color });
  }

  /* ---------- Ortak overlay ---------- */

  /**
   * Overlay içeriği. Alt sınıflar özelleştirebilir.
   * { title, color, lines: [string | {text,color}], hint }
   */
  overlayContent() {
    if (this.state === 'ready') {
      return { title: this.meta.title, color: NEON.cyan, lines: [], hint: 'Başlamak için Space / dokun' };
    }
    const won = this.state === 'won';
    const lines = [];
    if (this.hasScore) {
      const label = this.meta.scoreLabel ? this.meta.scoreLabel.toLowerCase() : 'skor';
      lines.push({ text: `${label[0].toLocaleUpperCase('tr')}${label.slice(1)}: ${this.formatScore(this.score)}`, color: NEON.text });
      const best = this.best;
      if (this.isNewRecord) lines.push({ text: 'YENİ REKOR!', color: NEON.yellow });
      else if (best !== null) lines.push({ text: `Rekor: ${this.formatScore(best)}`, color: NEON.dim });
    }
    return {
      title: won ? 'KAZANDIN!' : 'OYUN BİTTİ',
      color: won ? NEON.green : NEON.pink,
      lines,
      hint: 'Enter / dokun ile yeniden başla',
    };
  }

  /** Overlay yerleşimini hesaplar (update'te buton isabeti, draw'da çizim için). */
  overlayLayout() {
    if (this.state === 'playing') return null;
    const content = this.overlayContent();
    if (!content) return null;
    const w = this.width;
    const h = this.height;
    const titleSize = Math.min(40, Math.floor(w / 11));
    const lineH = 28;
    const btnH = 40;
    const gap = 16;

    const groups = [];
    for (const b of this.menuButtons) {
      const g = b.group ?? 0;
      let row = groups.find((r) => r.id === g);
      if (!row) groups.push((row = { id: g, items: [] }));
      row.items.push(b);
    }

    const lines = content.lines || [];
    let total = titleSize + 12 + lines.length * lineH;
    if (groups.length) total += gap + groups.length * (btnH + 10) - 10;
    if (content.hint) total += gap + 22;

    const panelW = Math.min(w - 24, 440);
    let y = Math.max(16, (h - total) / 2);
    const layout = {
      content, titleSize,
      panel: { x: (w - panelW) / 2, y: y - 22, w: panelW, h: total + 44 },
      titleY: y + titleSize / 2,
      lines: [],
      buttons: [],
      hintY: 0,
    };
    y += titleSize + 12;
    for (const line of lines) {
      layout.lines.push({ ...(typeof line === 'string' ? { text: line } : line), y: y + lineH / 2 });
      y += lineH;
    }
    if (groups.length) {
      y += gap;
      for (const row of groups) {
        const n = row.items.length;
        const bw = Math.min(150, (panelW - 24 - (n - 1) * 10) / n);
        let x = (w - (n * bw + (n - 1) * 10)) / 2;
        for (const b of row.items) {
          layout.buttons.push({ ...b, rect: { x, y, w: bw, h: btnH } });
          x += bw + 10;
        }
        y += btnH + 10;
      }
      y -= 10;
    }
    if (content.hint) layout.hintY = y + gap + 11;
    return layout;
  }

  drawOverlay() {
    if (this.state === 'playing') return;
    if (this.isEnded && this.stateTime < this.overlayDelay) return;
    const layout = this.overlayLayout();
    if (!layout) return;
    const ctx = this.ctx;
    const { content, panel } = layout;

    ctx.save();
    ctx.fillStyle = `rgba(4, 4, 10, ${this.overlayDim})`;
    ctx.fillRect(0, 0, this.width, this.height);
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 14);
    ctx.fillStyle = 'rgba(10, 10, 24, 0.9)';
    ctx.fill();
    ctx.strokeStyle = content.color || NEON.cyan;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    this.text(content.title, this.width / 2, layout.titleY, {
      size: layout.titleSize, color: content.color || NEON.cyan, glow: 16,
    });
    for (const line of layout.lines) {
      this.text(line.text, this.width / 2, line.y, { size: 18, color: line.color || NEON.text });
    }
    for (const b of layout.buttons) {
      this.drawButton(b.rect, b.label, { selected: b.selected ? b.selected() : false, color: b.color || NEON.cyan });
    }
    if (content.hint) {
      const blink = 0.55 + 0.45 * Math.sin(this.time * 4);
      ctx.save();
      ctx.globalAlpha = blink;
      this.text(content.hint, this.width / 2, layout.hintY, { size: 15, color: NEON.yellow });
      ctx.restore();
    }
  }
}
