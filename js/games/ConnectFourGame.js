import { BaseGame, NEON, roundRect } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

export const ROWS = 6;
export const COLS = 7;
const W = 700;
const H = 650;
const CELL = 88;
const BX = (W - CELL * COLS) / 2;
const BY = 112;
const PREVIEW_Y = 76;
const PIECE_R = CELL * 0.38;
const DROP_GRAVITY = 3200;
const AI_DELAY = 0.35;
export const AI_DEPTH = 5;
const COLORS = { 1: NEON.pink, 2: NEON.yellow };
const WIN_SCORE = 1_000_000;

/** Seans skor tablosu: sayfa açık kaldıkça (oyunlar arası geçişte de) korunur, kaydedilmez. */
const sessionTally = { 1: 0, 2: 0, draw: 0 };

/* ---------------- Saf mantık ---------------- */

export const createBoard = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

/** Sütunda taşın düşeceği satır (en alttaki boş), sütun doluysa -1. */
export function dropRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r][col]) return r;
  return -1;
}

export const validCols = (board) => [3, 2, 4, 1, 5, 0, 6].filter((c) => board[0][c] === 0);
export const isFull = (board) => board[0].every(Boolean);

/** Tüm 4'lü pencereler (yatay, dikey, iki çapraz). Önceden hesaplanır. */
const WINDOWS = (() => {
  const out = [];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const cells = [];
        for (let k = 0; k < 4; k++) cells.push([r + dr * k, c + dc * k]);
        if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS)) out.push(cells);
      }
    }
  }
  return out;
})();

/** Kazanan dörtlü: { player, cells } ya da null. */
export function findWin(board) {
  for (const cells of WINDOWS) {
    const [r0, c0] = cells[0];
    const p = board[r0][c0];
    if (p && cells.every(([r, c]) => board[r][c] === p)) return { player: p, cells };
  }
  return null;
}

/** Pencere skoru heuristiği. */
export function scoreWindow(values, player) {
  const opp = player === 1 ? 2 : 1;
  let own = 0;
  let theirs = 0;
  let empty = 0;
  for (const v of values) {
    if (v === player) own++;
    else if (v === opp) theirs++;
    else empty++;
  }
  if (own === 4) return 1000;
  if (own === 3 && empty === 1) return 5;
  if (own === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -4;
  return 0;
}

export function evaluate(board, player) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (board[r][3] === player) score += 3; // orta sütun
  for (const cells of WINDOWS) score += scoreWindow(cells.map(([r, c]) => board[r][c]), player);
  return score;
}

/** Alfa-beta budamalı minimax. ai: maksimize eden oyuncu. */
export function alphaBeta(board, depth, alpha, beta, maximizing, ai) {
  const win = findWin(board);
  if (win) return win.player === ai ? WIN_SCORE + depth : -WIN_SCORE - depth; // hızlı kazanç / geç kayıp
  if (isFull(board)) return 0;
  if (depth === 0) return evaluate(board, ai);
  const me = maximizing ? ai : ai === 1 ? 2 : 1;
  let best = maximizing ? -Infinity : Infinity;
  for (const c of validCols(board)) {
    const r = dropRow(board, c);
    board[r][c] = me;
    const v = alphaBeta(board, depth - 1, alpha, beta, !maximizing, ai);
    board[r][c] = 0;
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (alpha >= beta) break;
  }
  return best;
}

/** AI için en iyi sütun (eşitlikte merkeze yakın olan). */
export function bestMove(board, ai, depth = AI_DEPTH) {
  const b = board.map((row) => row.slice());
  let bestCol = -1;
  let bestVal = -Infinity;
  for (const c of validCols(b)) {
    const r = dropRow(b, c);
    b[r][c] = ai;
    const v = alphaBeta(b, depth - 1, -Infinity, Infinity, false, ai);
    b[r][c] = 0;
    if (v > bestVal) {
      bestVal = v;
      bestCol = c;
    }
  }
  return bestCol;
}

/* ---------------- Oyun ---------------- */

export class ConnectFourGame extends BaseGame {
  static meta = {
    id: 'connect4',
    get title() { return t('connect4.title'); },
    width: W,
    height: H,
    hasScore: false,
    theme: [NEON.blue, NEON.yellow],
    get controls() { return t('connect4.controls'); },
    get description() { return t('connect4.description'); },
  };

  constructor(engine) {
    super(engine);
    this.overlayDelay = 1;
    this.overlayDim = 0.6;
    this.mode = this.storage.get('connect4:mode', 1) === 2 ? 2 : 1;
    this.tally = sessionTally;
    this.menuButtons = [
      { get label() { return t('mode.1p'); }, key: 'Digit1', selected: () => this.mode === 1, onClick: () => this.setMode(1) },
      { get label() { return t('mode.2p'); }, key: 'Digit2', selected: () => this.mode === 2, onClick: () => this.setMode(2) },
    ];
  }

  setMode(mode) {
    this.mode = mode;
    this.storage.set('connect4:mode', mode);
  }

  reset() {
    super.reset();
    this.board = createBoard();
    this.turn = 1;
    this.selCol = 3;
    this.falling = null;
    this.win = null;
    this.draw_ = false;
    this.aiTimer = 0;
    this.lastPointerX = null;
  }

  get aiTurn() {
    return this.mode === 1 && this.turn === 2;
  }

  colAt(x) {
    const c = Math.floor((x - BX) / CELL);
    return c >= 0 && c < COLS ? c : -1;
  }

  update(dt) {
    this.updateFalling(dt);
    if (super.update(dt)) return;
    if (this.falling) return;

    if (this.aiTurn) {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) this.drop(bestMove(this.board, 2));
      return;
    }

    const input = this.input;
    const p = input.pointer;
    if (input.wasPressed('ArrowLeft', 'KeyA')) this.selCol = (this.selCol + COLS - 1) % COLS;
    if (input.wasPressed('ArrowRight', 'KeyD')) this.selCol = (this.selCol + 1) % COLS;
    // İmleç yalnızca hareket edince seçimi değiştirir; böylece klavye seçimi ezilmez.
    if ((p.type === 'mouse' && p.hover && p.x !== this.lastPointerX) || p.isDown) {
      const c = this.colAt(p.x);
      if (c >= 0) this.selCol = c;
    }
    this.lastPointerX = p.x;
    if (input.wasPressed('Enter', 'Space', 'ArrowDown', 'KeyS')) {
      this.drop(this.selCol);
    } else if (p.clicked && p.button === 0) {
      const c = this.colAt(p.x);
      if (c >= 0) this.drop(c);
    }
  }

  drop(col) {
    if (col < 0) return;
    const row = dropRow(this.board, col);
    if (row < 0) {
      this.sound.beep(150, 0.05);
      return;
    }
    this.falling = { col, row, player: this.turn, y: PREVIEW_Y, vy: 0, targetY: BY + row * CELL + CELL / 2 };
    this.sound.beep(this.turn === 1 ? 500 : 420, 0.04, { type: 'triangle' });
  }

  updateFalling(dt) {
    const f = this.falling;
    if (!f) return;
    f.vy += DROP_GRAVITY * dt;
    f.y += f.vy * dt;
    if (f.y < f.targetY) return;
    this.falling = null;
    this.board[f.row][f.col] = f.player;
    this.sound.beep(180, 0.05, { type: 'square', volume: 0.05 });
    const win = findWin(this.board);
    if (win) {
      this.win = win;
      this.tally[win.player]++;
      this.gameOver(this.mode === 2 || win.player === 1);
      return;
    }
    if (isFull(this.board)) {
      this.draw_ = true;
      this.tally.draw++;
      this.gameOver(false);
      return;
    }
    this.turn = this.turn === 1 ? 2 : 1;
    if (this.aiTurn) this.aiTimer = AI_DELAY;
  }

  overlayContent() {
    const c = super.overlayContent();
    if (this.state === 'ready') {
      c.lines = [{ text: t('connect4.ready'), color: NEON.dim }];
      return c;
    }
    if (this.draw_) {
      c.title = t('ov.draw');
      c.color = NEON.yellow;
    } else if (this.mode === 1) {
      c.title = this.win.player === 1 ? t('ov.won') : t('ov.lost');
      if (this.win.player === 2) c.color = NEON.yellow;
    } else {
      c.title = t('common.playerWins', { n: this.win.player });
      c.color = COLORS[this.win.player];
    }
    // Skor tablosu iki kısa satıra bölünür: uzun tek satır dar panelden taşıyordu.
    // (BaseGame ayrıca her satırı panel genişliğine sığdırır / gerekirse böler.)
    const name2 = this.mode === 1 ? t('common.computer') : t('common.player', { n: 2 });
    c.lines = [
      { text: `${t('common.player', { n: 1 })}  ${this.tally[1]} – ${this.tally[2]}  ${name2}`, color: NEON.text },
      { text: t('common.drawsCount', { n: this.tally.draw }), color: NEON.dim, size: 16 },
    ];
    return c;
  }

  drawPiece(cx, cy, player, alpha = 1) {
    const ctx = this.ctx;
    const color = COLORS[player];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, PIECE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, PIECE_R * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    // Üst bilgi
    const name2 = this.mode === 1 ? t('common.COMPUTER') : t('common.PLAYER', { n: 2 });
    const side = W / 3 - 24;
    this.text(`${t('common.PLAYER', { n: 1 })}  ${this.tally[1]}`, 20, 22, { size: 15, align: 'left', color: NEON.pink, maxWidth: side });
    this.text(`${this.tally[2]}  ${name2}`, W - 20, 22, { size: 15, align: 'right', color: NEON.yellow, maxWidth: side });
    let status = t('common.DRAWS', { n: this.tally.draw });
    if (this.state === 'playing') status = this.aiTurn ? t('common.aiThinking') : this.mode === 1 ? t('common.yourTurn') : t('common.turnOf', { who: t('common.player', { n: this.turn }) });
    this.text(status, W / 2, 22, { size: 14, color: this.state === 'playing' ? COLORS[this.turn] : NEON.dim, maxWidth: side + 20 });

    // Önizleme
    if (this.state === 'playing' && !this.falling && !this.aiTurn) {
      const cx = BX + this.selCol * CELL + CELL / 2;
      this.drawPiece(cx, PREVIEW_Y, this.turn, 0.55 + 0.2 * Math.sin(this.time * 6));
      ctx.save();
      ctx.fillStyle = COLORS[this.turn];
      ctx.globalAlpha = 0.06;
      ctx.fillRect(BX + this.selCol * CELL, BY, CELL, CELL * ROWS);
      ctx.restore();
    }

    // Taşlar (tahtanın arkasında)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = this.board[r][c];
        if (v) this.drawPiece(BX + c * CELL + CELL / 2, BY + r * CELL + CELL / 2, v);
      }
    }
    if (this.falling) {
      const f = this.falling;
      this.drawPiece(BX + f.col * CELL + CELL / 2, Math.min(f.y, f.targetY), f.player);
    }

    // Delikli tahta (evenodd)
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, BX - 8, BY - 8, CELL * COLS + 16, CELL * ROWS + 16, 16);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = BX + c * CELL + CELL / 2;
        const cy = BY + r * CELL + CELL / 2;
        ctx.moveTo(cx + PIECE_R + 3, cy);
        ctx.arc(cx, cy, PIECE_R + 3, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = 'rgba(26, 26, 72, 0.92)';
    ctx.fill('evenodd');
    ctx.strokeStyle = NEON.blue;
    ctx.shadowColor = NEON.blue;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Kazanan dörtlü
    if (this.win) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 4;
      ctx.globalAlpha = pulse;
      for (const [r, c] of this.win.cells) {
        ctx.beginPath();
        ctx.arc(BX + c * CELL + CELL / 2, BY + r * CELL + CELL / 2, PIECE_R + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
