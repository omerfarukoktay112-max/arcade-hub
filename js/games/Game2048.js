import { BaseGame, NEON, HUD_HEIGHT, roundRect, pointInRect } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

const BOARD = 440;
const BOARD_X = 30;
const BOARD_Y = HUD_HEIGHT + 12;
const SLIDE_TIME = 0.11;
const POP_TIME = 0.14;
/** Izgara boyutuna göre hedef karo: küçük tahtada daha az, büyükte daha çok. */
export const TARGETS = { 3: 512, 4: 2048, 5: 4096, 6: 8192 };
export const targetFor = (size) => TARGETS[size] || 2048;

/* ---------------- Saf mantık ---------------- */

/**
 * Tek bir çizgiyi (hareket yönündeki kenardan başlayarak) kaydırır ve birleştirir.
 * Bir karo bir hamlede yalnızca bir kez birleşir.
 * Dönen: { values, moves: [{from, to, value, merged}], gained }
 */
export function slideLine(line) {
  const values = new Array(line.length).fill(0);
  const mergedAt = new Array(line.length).fill(false);
  const moves = [];
  let target = 0;
  let gained = 0;
  for (let i = 0; i < line.length; i++) {
    const v = line[i];
    if (!v) continue;
    if (target > 0 && values[target - 1] === v && !mergedAt[target - 1]) {
      values[target - 1] = v * 2;
      mergedAt[target - 1] = true;
      gained += v * 2;
      moves.push({ from: i, to: target - 1, value: v, merged: true });
    } else {
      values[target] = v;
      moves.push({ from: i, to: target, value: v, merged: false });
      target++;
    }
  }
  return { values, moves, gained };
}

/** Yön için çizgi koordinatları: her çizgi, hareket edilen kenardan başlar. */
function linesFor(dir, size) {
  const lines = [];
  for (let k = 0; k < size; k++) {
    const line = [];
    for (let i = 0; i < size; i++) {
      if (dir === 'left') line.push([k, i]);
      else if (dir === 'right') line.push([k, size - 1 - i]);
      else if (dir === 'up') line.push([i, k]);
      else line.push([size - 1 - i, k]);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Tüm ızgarayı (her kare boyutta) bir yöne hareket ettirir (girdiyi değiştirmez).
 * Dönen: { grid, moved, gained, moves: [{fr, fc, tr, tc, value, merged}] }
 */
export function moveGrid(grid, dir) {
  const out = grid.map((row) => row.slice());
  const moves = [];
  let gained = 0;
  let moved = false;
  for (const coords of linesFor(dir, grid.length)) {
    const res = slideLine(coords.map(([r, c]) => grid[r][c]));
    coords.forEach(([r, c], i) => {
      out[r][c] = res.values[i];
    });
    for (const m of res.moves) {
      const [fr, fc] = coords[m.from];
      const [tr, tc] = coords[m.to];
      if (m.from !== m.to || m.merged) moved = true;
      moves.push({ fr, fc, tr, tc, value: m.value, merged: m.merged });
    }
    gained += res.gained;
  }
  return { grid: out, moved, gained, moves };
}

export function emptyGrid(size = 4) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

/** Boş bir hücreye %90 ihtimalle 2, %10 ihtimalle 4 koyar. Dönen: {r, c, value} | null */
export function spawnTile(grid, rng = Math.random) {
  const empty = [];
  const n = grid.length;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!grid[r][c]) empty.push([r, c]);
  if (!empty.length) return null;
  const [r, c] = empty[Math.floor(rng() * empty.length)];
  const value = rng() < 0.9 ? 2 : 4;
  grid[r][c] = value;
  return { r, c, value };
}

export function canMove(grid) {
  const n = grid.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = grid[r][c];
      if (!v) return true;
      if (c + 1 < n && grid[r][c + 1] === v) return true;
      if (r + 1 < n && grid[r + 1][c] === v) return true;
    }
  }
  return false;
}

export const maxTile = (grid) => Math.max(...grid.flat());

const ROMAN = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** 1–3999 arası sayıyı Roma rakamına çevirir. */
export function toRoman(n) {
  let out = '';
  let v = Math.floor(n);
  for (const [value, sym] of ROMAN) {
    while (v >= value) {
      out += sym;
      v -= value;
    }
  }
  return out;
}

/**
 * Büyük sayılar için Roma rakamı parçaları: 4000 ve üstünde binler "vinculum" (üst çizgi = ×1000)
 * ile yazılır. Dönen: { high, low } — high üst çizgiyle çizilir (ör. 8192 → { high: 'VIII', low: 'CXCII' }).
 */
export function romanParts(n) {
  if (n < 4000) return { high: '', low: toRoman(n) };
  return { high: toRoman(Math.floor(n / 1000)), low: toRoman(n % 1000) };
}

/* ---------------- Oyun ---------------- */

const TILE_COLORS = {
  2: NEON.cyan, 4: NEON.blue, 8: NEON.purple, 16: NEON.pink, 32: NEON.red, 64: NEON.orange,
  128: NEON.yellow, 256: NEON.green, 512: '#00ffd0', 1024: '#ff66ff', 2048: '#ffffff',
};
const tileColor = (v) => TILE_COLORS[v] || (v > 2048 ? '#ffffff' : NEON.yellow);
const easeOut = (k) => 1 - (1 - k) * (1 - k);

export class Game2048 extends BaseGame {
  static meta = {
    id: '2048',
    get title() { return t('2048.title'); },
    width: 500,
    height: 500,
    theme: [NEON.orange, NEON.yellow],
    get controls() { return t('2048.controls'); },
    get description() { return t('2048.description'); },
  };

  static settings = [
    {
      id: 'size', labelKey: 'set.gridSize', default: 4,
      options: [3, 4, 5, 6].map((n) => ({ value: n, label: `${n}×${n}`, note: String(targetFor(n)) })),
    },
    {
      id: 'numerals', labelKey: 'set.numerals', live: true, default: 'arabic',
      options: [
        { value: 'arabic', labelKey: '2048.arabic' },
        { value: 'roman', labelKey: '2048.roman' },
      ],
    },
  ];

  get size() {
    return this.settings.size;
  }
  get target() {
    return targetFor(this.size);
  }
  /** 4×4 eski rekor anahtarını korur; diğer boyutların ayrı rekoru vardır. */
  get recordKey() {
    return this.size === 4 ? '2048' : `2048-${this.size}`;
  }

  /** Boyuta göre karo ve boşluk ölçüleri. */
  metrics() {
    const n = this.size;
    const gap = n <= 4 ? 12 : n === 5 ? 10 : 8;
    return { n, gap, tile: (BOARD - gap * (n + 1)) / n };
  }
  cellX(c) {
    const { gap, tile } = this.metrics();
    return BOARD_X + gap + c * (tile + gap);
  }
  cellY(r) {
    const { gap, tile } = this.metrics();
    return BOARD_Y + gap + r * (tile + gap);
  }

  reset() {
    super.reset();
    this.grid = emptyGrid(this.size);
    this.continued = false;
    this.slide = null; // { t, moves, spawn }
    this.effects = []; // { r, c, kind: 'pop'|'appear', t }
    this.menuButtons = [];
    for (let i = 0; i < 2; i++) {
      const s = spawnTile(this.grid);
      this.effects.push({ r: s.r, c: s.c, kind: 'appear', t: 0 });
    }
  }

  readMove() {
    const i = this.input;
    if (i.wasPressed('ArrowUp', 'KeyW') || i.swipe === 'up') return 'up';
    if (i.wasPressed('ArrowDown', 'KeyS') || i.swipe === 'down') return 'down';
    if (i.wasPressed('ArrowLeft', 'KeyA') || i.swipe === 'left') return 'left';
    if (i.wasPressed('ArrowRight', 'KeyD') || i.swipe === 'right') return 'right';
    return null;
  }

  animate(dt) {
    if (this.slide) {
      this.slide.t += dt;
      if (this.slide.t >= SLIDE_TIME) this.finishSlide();
    }
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < POP_TIME);
  }

  finishSlide() {
    const s = this.slide;
    this.slide = null;
    for (const m of s.moves) if (m.merged) this.effects.push({ r: m.tr, c: m.tc, kind: 'pop', t: 0 });
    if (s.spawn) this.effects.push({ r: s.spawn.r, c: s.spawn.c, kind: 'appear', t: 0 });
  }

  update(dt) {
    this.animate(dt);
    if (this.state === 'won') {
      this.time += dt;
      this.stateTime += dt;
      this.updateWon();
      return;
    }
    if (super.update(dt)) return;

    const dir = this.readMove();
    if (!dir) return;
    if (this.slide) this.finishSlide(); // hızlı girişte animasyonu tamamla
    const res = moveGrid(this.grid, dir);
    if (!res.moved) return; // hareket yoksa yeni karo da yok

    this.grid = res.grid;
    this.score += res.gained;
    const spawn = spawnTile(this.grid);
    this.slide = { t: 0, moves: res.moves, spawn };
    this.sound.beep(res.gained ? 520 + Math.min(600, Math.log2(res.gained) * 40) : 300, 0.05, { type: 'triangle' });

    if (!this.continued && maxTile(this.grid) >= this.target) {
      this.gameOver(true);
      this.menuButtons = [
        { get label() { return t('2048.continue'); }, key: 'Space', color: NEON.green, onClick: () => this.continueGame() },
        { get label() { return t('2048.again'); }, key: 'Enter', color: NEON.pink, onClick: () => this.restart() },
      ];
    } else if (!canMove(this.grid)) {
      this.gameOver(false);
    }
  }

  /** Kazanınca yalnızca iki buton / iki tuş geçerlidir; rastgele dokunuş yeniden başlatmaz. */
  updateWon() {
    if (this.stateTime < 0.4) return;
    const layout = this.overlayLayout();
    const p = this.input.pointer;
    for (const b of layout.buttons) {
      if (this.input.wasPressed(b.key) || (p.clicked && pointInRect(p, b.rect))) {
        b.onClick();
        return;
      }
    }
  }

  continueGame() {
    this.continued = true;
    this.menuButtons = [];
    this.state = 'playing';
    this.stateTime = 0;
  }

  overlayContent() {
    const c = super.overlayContent();
    if (this.state === 'won') {
      c.title = t('2048.wonTitle', { v: this.formatTile(this.target) });
      c.hint = t('2048.wonHint');
    }
    return c;
  }

  /**
   * Karo değerinin düz metin gösterimi (HUD, başlık). Roma modunda 4000'in altı Roma rakamıdır;
   * üstünde üst çizgi (vinculum) düz metinde güvenilir çizilemediğinden sayı olarak kalır.
   */
  formatTile(value) {
    return this.settings.numerals === 'roman' && value < 4000 ? toRoman(value) : String(value);
  }

  drawTile(x, y, value, scale = 1) {
    const ctx = this.ctx;
    const TILE = this.metrics().tile;
    const color = tileColor(value);
    const s = TILE * scale;
    const ox = x + (TILE - s) / 2;
    const oy = y + (TILE - s) / 2;
    const radius = Math.min(10, TILE * 0.12);
    ctx.save();
    roundRect(ctx, ox, oy, s, s, radius * scale);
    ctx.fillStyle = '#0d0d1e';
    ctx.fill();
    ctx.globalAlpha = 0.16 + Math.min(0.3, Math.log2(value) * 0.025);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    if (value >= 128) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
    }
    ctx.stroke();
    ctx.restore();
    const glow = value >= 128 ? 10 : 0;
    const cx = x + TILE / 2;
    const cy = y + TILE / 2 + 2;
    const k = (TILE / 101) * scale; // 4×4'teki karo boyutuna göre ölçek
    if (this.settings.numerals === 'roman') {
      this.drawRoman(value, cx, cy, TILE * scale, k, color, glow);
      return;
    }
    const digits = String(value).length;
    const size = (digits <= 2 ? 40 : digits === 3 ? 34 : digits === 4 ? 28 : 22) * k;
    this.text(String(value), cx, cy, { size, color, glow, maxWidth: TILE * 0.9 * scale });
  }

  /**
   * Roma rakamı: yazı, dizinin uzunluğuna göre karoya sığacak kadar küçülür.
   * 4000 ve üstünde binler üst satırda üst çizgiyle (×1000) gösterilir.
   */
  drawRoman(value, cx, cy, tile, k, color, glow) {
    const { high, low } = romanParts(value);
    const fit = (str, base) => Math.min(base * k, (tile * 0.84) / (Math.max(1, str.length) * 0.6));
    if (!high) {
      this.text(low, cx, cy, { size: fit(low, 34), color, glow, maxWidth: tile * 0.9 });
      return;
    }
    const hs = fit(high, 24);
    const ls = fit(low || 'I', 20);
    const hy = cy - ls * 0.55;
    this.text(high, cx, hy, { size: hs, color, glow, maxWidth: tile * 0.9 });
    const ctx = this.ctx;
    const w = Math.min(tile * 0.9, high.length * hs * 0.62);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, hs * 0.08);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, hy - hs * 0.62);
    ctx.lineTo(cx + w / 2, hy - hs * 0.62);
    ctx.stroke();
    ctx.restore();
    if (low) this.text(low, cx, cy + hs * 0.55, { size: ls, color, glow, maxWidth: tile * 0.9 });
  }

  draw() {
    const ctx = this.ctx;
    const { n, tile: TILE } = this.metrics();
    const cellX = (c) => this.cellX(c);
    const cellY = (r) => this.cellY(r);
    const radius = Math.min(10, TILE * 0.12);
    ctx.save();
    roundRect(ctx, BOARD_X, BOARD_Y, BOARD, BOARD, 14);
    ctx.fillStyle = '#0b0b18';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 228, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = NEON.grid;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        roundRect(ctx, cellX(c), cellY(r), TILE, TILE, radius);
        ctx.fill();
      }
    }
    ctx.restore();

    if (this.slide) {
      // Kayma: karolar eski değerleriyle eski konumdan yeni konuma
      const t = easeOut(Math.min(1, this.slide.t / SLIDE_TIME));
      for (const m of this.slide.moves) {
        const x = cellX(m.fc) + (cellX(m.tc) - cellX(m.fc)) * t;
        const y = cellY(m.fr) + (cellY(m.tr) - cellY(m.fr)) * t;
        this.drawTile(x, y, m.value);
      }
    } else {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = this.grid[r][c];
          if (!v) continue;
          let scale = 1;
          const fx = this.effects.find((e) => e.r === r && e.c === c);
          if (fx) {
            const k = fx.t / POP_TIME;
            scale = fx.kind === 'appear' ? 0.3 + 0.7 * easeOut(k) : 1 + 0.14 * Math.sin(k * Math.PI);
          }
          this.drawTile(cellX(c), cellY(r), v, scale);
        }
      }
    }

    this.drawHUD(this.continued ? t('2048.continued') : t('2048.max', { v: this.formatTile(maxTile(this.grid)) }));
  }
}
