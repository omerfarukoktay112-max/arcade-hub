import { BaseGame, NEON, roundRect, pointInRect, shuffle } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

export const DIFFICULTIES = {
  easy: { labelKey: 'common.easy', rows: 9, cols: 9, mines: 10, cell: 36 },
  medium: { labelKey: 'common.medium', rows: 16, cols: 16, mines: 40, cell: 30 },
  hard: { labelKey: 'common.hard', rows: 16, cols: 30, mines: 99, cell: 26 },
};
const ORDER = ['easy', 'medium', 'hard'];
const TOP = 84;
const PAD = 16;
const MIN_W = 360;

const sizeFor = (d) => ({
  width: Math.max(MIN_W, d.cols * d.cell + PAD * 2),
  height: TOP + d.rows * d.cell + PAD,
});

/* ---------------- Saf mantık ---------------- */

export function createBoard(rows, cols) {
  return {
    rows, cols, mines: 0, placed: false,
    cells: Array.from({ length: rows * cols }, () => ({ mine: false, adj: 0, open: false, flag: false })),
  };
}

export function neighbors(board, r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < board.rows && nc < board.cols) out.push(nr * board.cols + nc);
    }
  }
  return out;
}

/**
 * Mayınları İLK tıklamadan sonra yerleştirir: tıklanan hücre (ve yer varsa komşuları)
 * asla mayın olmaz. Komşu sayıları (adj) hesaplanır.
 */
export function placeMines(board, count, safeR, safeC, rng = Math.random) {
  const total = board.rows * board.cols;
  const safeIdx = safeR * board.cols + safeC;
  const safe = new Set([safeIdx, ...neighbors(board, safeR, safeC)]);
  if (total - safe.size < count) {
    // Çok yoğun tahtada yalnızca tıklanan hücre korunur.
    safe.clear();
    safe.add(safeIdx);
  }
  const candidates = [];
  for (let i = 0; i < total; i++) if (!safe.has(i)) candidates.push(i);
  shuffle(candidates, rng);
  const n = Math.min(count, candidates.length);
  for (let k = 0; k < n; k++) board.cells[candidates[k]].mine = true;
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / board.cols);
    const c = i % board.cols;
    board.cells[i].adj = neighbors(board, r, c).filter((j) => board.cells[j].mine).length;
  }
  board.mines = n;
  board.placed = true;
  return board;
}

/**
 * Hücreyi açar; boş (adj = 0) hücrelerde flood-fill uygular (yinelemeli, yığınla).
 * Bayraklı hücreler açılmaz. Dönen: { hitMine, mineIndex, opened: number[] }
 */
export function reveal(board, r, c) {
  const start = r * board.cols + c;
  const cell = board.cells[start];
  const result = { hitMine: false, mineIndex: -1, opened: [] };
  if (!cell || cell.open || cell.flag) return result;
  if (cell.mine) {
    cell.open = true;
    result.hitMine = true;
    result.mineIndex = start;
    return result;
  }
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    const cur = board.cells[i];
    if (cur.open || cur.flag || cur.mine) continue;
    cur.open = true;
    result.opened.push(i);
    if (cur.adj === 0) {
      for (const j of neighbors(board, Math.floor(i / board.cols), i % board.cols)) {
        if (!board.cells[j].open) stack.push(j);
      }
    }
  }
  return result;
}

/**
 * Açık bir sayıya tıklama (chord): etrafındaki bayrak sayısı sayıya eşitse
 * bayraksız komşuların hepsini açar. Uygulanamıyorsa null döner.
 */
export function chord(board, r, c) {
  const cell = board.cells[r * board.cols + c];
  if (!cell || !cell.open || cell.adj === 0) return null;
  const around = neighbors(board, r, c);
  const flags = around.filter((j) => board.cells[j].flag).length;
  if (flags !== cell.adj) return null;
  const total = { hitMine: false, mineIndex: -1, opened: [] };
  for (const j of around) {
    const res = reveal(board, Math.floor(j / board.cols), j % board.cols);
    total.opened.push(...res.opened);
    if (res.hitMine && !total.hitMine) {
      total.hitMine = true;
      total.mineIndex = res.mineIndex;
    }
  }
  return total;
}

export function toggleFlag(board, r, c) {
  const cell = board.cells[r * board.cols + c];
  if (!cell || cell.open) return false;
  cell.flag = !cell.flag;
  return true;
}

export function isWon(board) {
  if (!board.placed) return false;
  let open = 0;
  for (const cell of board.cells) if (cell.open && !cell.mine) open++;
  return open === board.rows * board.cols - board.mines;
}

/* ---------------- Oyun ---------------- */

const NUM_COLORS = [null, NEON.cyan, NEON.green, NEON.pink, NEON.purple, NEON.orange, '#00ffd0', NEON.yellow, '#ffffff'];

export class MinesweeperGame extends BaseGame {
  static meta = {
    id: 'minesweeper',
    get title() { return t('minesweeper.title'); },
    width: sizeFor(DIFFICULTIES.easy).width,
    height: sizeFor(DIFFICULTIES.easy).height,
    get controls() { return t('minesweeper.controls'); },
    get touchControls() { return t('minesweeper.touchControls'); },
    get description() { return t('minesweeper.description'); },
    get scoreLabel() { return t('minesweeper.time'); },
    theme: [NEON.red, NEON.cyan],
    icon: '💣',
    lowerIsBetter: true,
    recordOnWin: true,
  };

  constructor(engine) {
    super(engine);
    this.overlayDelay = 0.7;
    this.overlayDim = 0.45;
    const saved = this.storage.get('minesweeper:difficulty', 'easy');
    this.diff = DIFFICULTIES[saved] ? saved : 'easy';
  }

  get recordKey() {
    return `minesweeper-${this.diff}`;
  }
  get cfg() {
    return DIFFICULTIES[this.diff];
  }

  init() {
    this.applySize();
    super.init();
  }

  applySize() {
    const { width, height } = sizeFor(this.cfg);
    if (width !== this.width || height !== this.height) this.engine.resizeCanvas(width, height);
    const bw = 96;
    const gap = 10;
    const x0 = (width - (bw * 3 + gap * 2)) / 2;
    this.diffButtons = ORDER.map((id, i) => ({ id, rect: { x: x0 + i * (bw + gap), y: 10, w: bw, h: 32 } }));
  }

  setDifficulty(id) {
    if (!DIFFICULTIES[id]) return;
    this.diff = id;
    this.storage.set('minesweeper:difficulty', id);
    this.applySize();
    this.reset();
    this.state = 'ready';
    this.stateTime = 0;
    this.sound.beep(520, 0.05);
  }

  reset() {
    super.reset();
    const { rows, cols } = this.cfg;
    this.board = createBoard(rows, cols);
    this.elapsed = 0;
    this.exploded = -1;
    this.flags = 0;
  }

  restart() {
    this.reset();
    this.state = 'ready';
    this.stateTime = 0;
  }

  formatScore(v) {
    return t('common.seconds', { v: v.toFixed(1) });
  }

  get boardX() {
    return (this.width - this.cfg.cols * this.cfg.cell) / 2;
  }

  cellAt(x, y) {
    const { rows, cols, cell } = this.cfg;
    const c = Math.floor((x - this.boardX) / cell);
    const r = Math.floor((y - TOP) / cell);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    return { r, c };
  }

  /** Süre sayacı saniyede bir değişir; tıklama animasyonları girdi penceresinde tam hızda. */
  needsFullRate() {
    return false;
  }

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    const input = this.input;
    const p = input.pointer;

    for (let i = 0; i < ORDER.length; i++) {
      if (input.wasPressed(`Digit${i + 1}`, `Numpad${i + 1}`)) {
        this.setDifficulty(ORDER[i]);
        return;
      }
    }
    if (p.clicked) {
      const btn = this.diffButtons.find((b) => pointInRect(p, b.rect));
      if (btn) {
        this.setDifficulty(btn.id);
        return;
      }
    }

    if (this.isEnded) {
      if (this.stateTime >= this.overlayDelay && (input.wasPressed('Enter') || p.clicked)) this.restart();
      return;
    }
    if (this.state === 'playing') this.elapsed += dt;
    if (!p.clicked) return;

    const at = this.cellAt(p.x, p.y);
    if (!at) return;
    if (p.button === 2) this.flag(at.r, at.c);
    else this.open(at.r, at.c);
  }

  flag(r, c) {
    if (!this.board.placed) return;
    if (toggleFlag(this.board, r, c)) {
      const cell = this.board.cells[r * this.board.cols + c];
      this.flags += cell.flag ? 1 : -1;
      this.sound.beep(cell.flag ? 700 : 500, 0.04, { type: 'triangle' });
    }
  }

  open(r, c) {
    const board = this.board;
    const cell = board.cells[r * board.cols + c];
    if (!board.placed) {
      placeMines(board, this.cfg.mines, r, c);
      this.start();
    }
    let res;
    if (cell.open) res = chord(board, r, c);
    else if (!cell.flag) res = reveal(board, r, c);
    if (!res || (!res.opened.length && !res.hitMine)) return;

    this.score = Math.round(this.elapsed * 10) / 10;
    if (res.hitMine) {
      this.exploded = res.mineIndex;
      for (const m of board.cells) if (m.mine && !m.flag) m.open = true;
      this.gameOver(false);
      return;
    }
    this.sound.beep(360 + Math.min(500, res.opened.length * 12), 0.04, { type: 'triangle' });
    if (isWon(board)) {
      for (const m of board.cells) if (m.mine) m.flag = true;
      this.flags = board.mines;
      this.gameOver(true);
    }
  }

  overlayContent() {
    const c = super.overlayContent();
    if (this.state === 'over') {
      c.title = t('minesweeper.boom');
      c.lines = [{ text: t('minesweeper.hitMine'), color: NEON.text }];
    }
    return c;
  }

  drawOverlay() {
    if (this.state === 'ready') return; // hazır ekranı yok: ilk tıklama başlatır
    super.drawOverlay();
  }

  /* ---------- Çizim ---------- */

  drawMine(cx, cy, size) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = NEON.text;
    ctx.fillStyle = NEON.text;
    ctx.lineWidth = Math.max(1.5, size * 0.1);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      ctx.moveTo(cx - Math.cos(a) * size * 0.42, cy - Math.sin(a) * size * 0.42);
      ctx.lineTo(cx + Math.cos(a) * size * 0.42, cy + Math.sin(a) * size * 0.42);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = NEON.bg;
    ctx.beginPath();
    ctx.arc(cx - size * 0.08, cy - size * 0.08, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawClock(cx, cy, r) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = NEON.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.65);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.stroke();
    ctx.restore();
  }

  drawFlag(cx, cy, size) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = NEON.text;
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.12, cy - size * 0.32);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.3);
    ctx.moveTo(cx - size * 0.28, cy + size * 0.3);
    ctx.lineTo(cx + size * 0.18, cy + size * 0.3);
    ctx.stroke();
    ctx.fillStyle = NEON.pink;
    ctx.shadowColor = NEON.pink;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.1, cy - size * 0.32);
    ctx.lineTo(cx + size * 0.3, cy - size * 0.16);
    ctx.lineTo(cx - size * 0.1, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    const { rows, cols, cell: S, mines } = this.cfg;
    const bx = this.boardX;
    const board = this.board;
    const lost = this.state === 'over';
    const p = this.input.pointer;
    const hover = p.type === 'mouse' && p.hover && !this.isEnded ? this.cellAt(p.x, p.y) : null;

    // Üst çubuk: zorluk butonları
    ctx.fillStyle = NEON.panel;
    ctx.fillRect(0, 0, this.width, TOP - 8);
    for (const [i, b] of this.diffButtons.entries()) {
      this.drawButton(b.rect, `${i + 1} ${t(DIFFICULTIES[b.id].labelKey)}`, { selected: b.id === this.diff, size: 14 });
    }
    // Bilgi satırı
    const infoY = 61;
    this.drawMine(PAD + 10, infoY, 20);
    this.text(String(mines - this.flags).padStart(3, '0'), PAD + 26, infoY + 1, { size: 18, align: 'left', color: NEON.pink });
    this.text(String(Math.min(999, Math.floor(this.elapsed))).padStart(3, '0'), this.width - PAD, infoY + 1, {
      size: 18, align: 'right', color: NEON.cyan,
    });
    this.drawClock(this.width - PAD - 52, infoY, 8);
    const best = this.best;
    const centerText = this.state === 'ready' ? t('minesweeper.clickCell') : t('minesweeper.best', { v: best === null ? '-' : this.formatScore(best) });
    this.text(centerText, this.width / 2, infoY + 1, { size: 13, color: this.state === 'ready' ? NEON.yellow : NEON.dim, maxWidth: this.width - 190 });

    // Tahta
    const fontSize = Math.floor(S * 0.58);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const cell = board.cells[i];
        const x = bx + c * S;
        const y = TOP + r * S;
        if (cell.open) {
          ctx.fillStyle = i === this.exploded ? '#5a0f24' : '#0c0c18';
          ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
          if (cell.mine) this.drawMine(x + S / 2, y + S / 2, S * 0.8);
          else if (cell.adj) {
            this.text(String(cell.adj), x + S / 2, y + S / 2 + 1, { size: fontSize, color: NUM_COLORS[cell.adj] });
          }
        } else {
          const isHover = hover && hover.r === r && hover.c === c;
          roundRect(ctx, x + 1.5, y + 1.5, S - 3, S - 3, 4);
          ctx.fillStyle = isHover ? '#2a2a52' : '#1a1a36';
          ctx.fill();
          ctx.strokeStyle = isHover ? NEON.cyan : 'rgba(34, 228, 255, 0.22)';
          ctx.lineWidth = 1;
          ctx.stroke();
          if (cell.flag) {
            this.drawFlag(x + S / 2, y + S / 2, S * 0.8);
            if (lost && !cell.mine) {
              // Yanlış bayrak
              ctx.save();
              ctx.strokeStyle = NEON.red;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(x + 5, y + 5);
              ctx.lineTo(x + S - 5, y + S - 5);
              ctx.moveTo(x + S - 5, y + 5);
              ctx.lineTo(x + 5, y + S - 5);
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      }
    }
    ctx.strokeStyle = 'rgba(34, 228, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, TOP - 0.5, cols * S + 1, rows * S + 1);
  }
}
