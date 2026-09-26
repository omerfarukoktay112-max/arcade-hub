import { BaseGame, NEON, HUD_HEIGHT, roundRect, pointInRect } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

export const N = 5;
const W = 500;
const H = 550;
const CELL = 82;
const GAP = 8;
const GX = (W - (CELL * N + GAP * (N - 1))) / 2;
const GY = HUD_HEIGHT + 14;
export const MAX_LEVEL = 10;
const LEVEL_PAUSE = 0.9;
// Dokunmatik cihazlar için R / H kısayollarının düğme karşılıkları
const TOOLS = [
  { id: 'reset', labelKey: 'lightsout.reset', rect: { x: 24, y: H - 36, w: 150, h: 30 } },
  { id: 'hint', labelKey: 'lightsout.hint', rect: { x: 184, y: H - 36, w: 130, h: 30 } },
];

/* ---------------- Saf mantık ---------------- */

/** Hücreye tıklama: kendisi ve 4 komşusu tersine döner (yeni dizi). */
export function toggle(grid, r, c) {
  const out = grid.slice();
  const flip = (rr, cc) => {
    if (rr >= 0 && rr < N && cc >= 0 && cc < N) out[rr * N + cc] ^= 1;
  };
  flip(r, c);
  flip(r - 1, c);
  flip(r + 1, c);
  flip(r, c - 1);
  flip(r, c + 1);
  return out;
}

export const isSolved = (grid) => grid.every((v) => v === 0);

/** Seviye başına başlangıçtaki rastgele tıklama sayısı. */
export const clicksForLevel = (level) => Math.min(N * N - 4, 3 + 2 * (level - 1));

/**
 * Çözülmüş (tümü sönük) tahtaya FARKLI hücrelerde rastgele tıklamalar uygular.
 * Tıklamalar tersinir olduğundan sonuç her zaman çözülebilirdir.
 */
export function scramble(clicks, rng = Math.random) {
  for (;;) {
    const cells = [...Array(N * N).keys()];
    let grid = new Array(N * N).fill(0);
    const used = [];
    for (let k = 0; k < clicks; k++) {
      const j = k + Math.floor(rng() * (cells.length - k));
      [cells[k], cells[j]] = [cells[j], cells[k]];
      used.push(cells[k]);
      grid = toggle(grid, Math.floor(cells[k] / N), cells[k] % N);
    }
    if (!isSolved(grid)) return { grid, clicks: used };
  }
}

/**
 * GF(2) üzerinde Gauss eliminasyonu ile en az tıklamalı çözüm.
 * Dönen: 25 elemanlı 0/1 tıklama vektörü ya da çözümsüzse null.
 */
export function solve(grid) {
  const n = N * N;
  // Artırılmış matris: satır i = "hücre i'yi etkileyen tıklamalar | hücre i durumu"
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n + 1).fill(0);
    const r = Math.floor(i / N);
    const c = i % N;
    for (const [rr, cc] of [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (rr >= 0 && rr < N && cc >= 0 && cc < N) row[rr * N + cc] = 1;
    }
    row[n] = grid[i];
    rows.push(row);
  }
  const pivotCols = [];
  let pr = 0;
  for (let col = 0; col < n && pr < n; col++) {
    let sel = -1;
    for (let r = pr; r < n; r++) if (rows[r][col]) { sel = r; break; }
    if (sel < 0) continue;
    [rows[pr], rows[sel]] = [rows[sel], rows[pr]];
    for (let r = 0; r < n; r++) {
      if (r !== pr && rows[r][col]) for (let k = col; k <= n; k++) rows[r][k] ^= rows[pr][k];
    }
    pivotCols.push(col);
    pr++;
  }
  // Tutarsızlık: 0 = 1 satırı
  for (let r = pr; r < n; r++) if (rows[r][n]) return null;

  const free = [];
  for (let c = 0; c < n; c++) if (!pivotCols.includes(c)) free.push(c);
  let best = null;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const x = new Array(n).fill(0);
    free.forEach((c, k) => (x[c] = (mask >> k) & 1));
    for (let k = pivotCols.length - 1; k >= 0; k--) {
      const col = pivotCols[k];
      let v = rows[k][n];
      for (let c = col + 1; c < n; c++) if (rows[k][c]) v ^= x[c];
      x[col] = v;
    }
    const weight = x.reduce((a, b) => a + b, 0);
    if (!best || weight < best.weight) best = { x, weight };
  }
  return best.x;
}

/* ---------------- Oyun ---------------- */

export class LightsOutGame extends BaseGame {
  static meta = {
    id: 'lightsout',
    get title() { return t('lightsout.title'); },
    width: W,
    height: H,
    theme: ['#00ffd0', NEON.yellow],
    get controls() { return t('lightsout.controls'); },
    get description() { return t('lightsout.description'); },
  };

  reset() {
    super.reset();
    this.level = 1;
    this.cursor = 12;
    this.showCursor = false;
    this.glow = new Array(N * N).fill(0);
    this.setupLevel();
  }

  setupLevel() {
    const { grid } = scramble(clicksForLevel(this.level));
    this.initial = grid;
    this.grid = grid.slice();
    // Hedef: çözücünün bulduğu en az tıklama sayısı
    this.par = solve(grid).reduce((a, b) => a + b, 0);
    this.moves = 0;
    this.hints = 0;
    this.hintCell = -1;
    this.cleared = 0; // seviye bitişi sonrası bekleme sayacı
  }

  update(dt) {
    for (let i = 0; i < N * N; i++) this.glow[i] += (this.grid[i] - this.glow[i]) * Math.min(1, dt * 12);
    if (super.update(dt)) return;

    if (this.cleared > 0) {
      this.cleared -= dt;
      if (this.cleared <= 0) {
        if (this.level >= MAX_LEVEL) {
          this.gameOver(true);
        } else {
          this.level++;
          this.setupLevel();
        }
      }
      return;
    }

    const input = this.input;
    const p = input.pointer;
    const tool = p.clicked && p.button === 0 ? TOOLS.find((t) => pointInRect(p, t.rect)) : null;
    if (input.wasPressed('KeyR') || tool?.id === 'reset') {
      this.resetLevel();
      return;
    }
    if (input.wasPressed('KeyH') || tool?.id === 'hint') {
      this.showHint();
      if (tool) return;
    }
    const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    for (const [code, [dr, dc]] of Object.entries(moves)) {
      if (input.wasPressed(code)) {
        this.showCursor = true;
        const r = (Math.floor(this.cursor / N) + dr + N) % N;
        const c = ((this.cursor % N) + dc + N) % N;
        this.cursor = r * N + c;
      }
    }
    if (input.wasPressed('Enter', 'Space')) {
      this.showCursor = true;
      this.press(this.cursor);
      return;
    }
    if (p.clicked && p.button === 0) {
      const c = Math.floor((p.x - GX) / (CELL + GAP));
      const r = Math.floor((p.y - GY) / (CELL + GAP));
      const inCell = (p.x - GX) % (CELL + GAP) <= CELL && (p.y - GY) % (CELL + GAP) <= CELL;
      if (r >= 0 && r < N && c >= 0 && c < N && inCell) {
        this.showCursor = false;
        this.press(r * N + c);
      }
    }
  }

  resetLevel() {
    this.grid = this.initial.slice();
    this.moves = 0;
    this.hintCell = -1;
    this.sound.beep(260, 0.08, { type: 'triangle' });
  }

  /** Çözücünün en kısa çözümündeki bir hücreyi vurgular (her ipucu seviye puanından düşer). */
  showHint() {
    const sol = solve(this.grid);
    const idx = sol ? sol.indexOf(1) : -1;
    if (idx >= 0 && idx !== this.hintCell) {
      this.hintCell = idx;
      this.hints++;
    }
  }

  press(i) {
    this.grid = toggle(this.grid, Math.floor(i / N), i % N);
    this.moves++;
    this.hintCell = -1;
    this.sound.beep(300 + this.grid.reduce((a, b) => a + b, 0) * 25, 0.05, { type: 'triangle' });
    if (isSolved(this.grid)) {
      const extra = Math.max(0, this.moves - this.par);
      this.score += Math.max(10, this.level * 100 - extra * 10 - this.hints * 25);
      this.cleared = LEVEL_PAUSE;
      this.sound.win();
    }
  }

  overlayContent() {
    const c = super.overlayContent();
    if (this.state === 'ready') c.lines = [{ text: t('lightsout.ready', { n: MAX_LEVEL }), color: NEON.dim }];
    if (this.state === 'won') c.title = t('lightsout.allDone');
    return c;
  }

  draw() {
    const ctx = this.ctx;
    for (let i = 0; i < N * N; i++) {
      const x = GX + (i % N) * (CELL + GAP);
      const y = GY + Math.floor(i / N) * (CELL + GAP);
      const g = Math.max(0, Math.min(1, this.glow[i]));
      ctx.save();
      roundRect(ctx, x, y, CELL, CELL, 12);
      ctx.fillStyle = '#12122a';
      ctx.fill();
      if (g > 0.02) {
        ctx.globalAlpha = g;
        ctx.fillStyle = NEON.yellow;
        ctx.shadowColor = NEON.yellow;
        ctx.shadowBlur = 24;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = g * 0.9;
        ctx.fillStyle = '#fff6c2';
        roundRect(ctx, x + CELL * 0.3, y + CELL * 0.3, CELL * 0.4, CELL * 0.4, 8);
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      roundRect(ctx, x, y, CELL, CELL, 12);
      ctx.strokeStyle = g > 0.5 ? NEON.yellow : 'rgba(178, 107, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (i === this.hintCell) {
        ctx.strokeStyle = NEON.green;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 8);
        roundRect(ctx, x - 4, y - 4, CELL + 8, CELL + 8, 14);
        ctx.stroke();
      }
      if (this.showCursor && i === this.cursor && this.state === 'playing') {
        ctx.strokeStyle = NEON.cyan;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 5]);
        roundRect(ctx, x + 6, y + 6, CELL - 12, CELL - 12, 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.cleared > 0) {
      this.text(this.level >= MAX_LEVEL ? t('lightsout.lastDone') : t('lightsout.levelDone', { n: this.level }), W / 2, GY + (CELL * N + GAP * (N - 1)) / 2, {
        size: 34, color: NEON.green, glow: 18, maxWidth: W - 40,
      });
    }
    for (const tool of TOOLS) this.drawButton(tool.rect, t(tool.labelKey), { size: 13, color: tool.id === 'hint' ? NEON.green : NEON.cyan });
    this.text(t('lightsout.par', { n: this.par }), W - 24, H - 20, { size: 14, align: 'right', color: NEON.dim, maxWidth: W - 340 });
    this.drawHUD(t('lightsout.hud', { level: this.level, max: MAX_LEVEL, moves: this.moves }));
  }
}
