import { BaseGame, NEON } from '../core/BaseGame.js';

const W = 450;
const H = 500;
const CELL = 130;
const BX = (W - CELL * 3) / 2;
const BY = 52;
const AI_DELAY = 0.45;

/** Seans skor tablosu: sayfa açık kaldıkça (oyunlar arası geçişte de) korunur, kaydedilmez. */
const sessionTally = { X: 0, O: 0, draw: 0 };

/* ---------------- Saf mantık ---------------- */

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** { player, line } kazanan varsa; { player: null, draw: true } beraberlikte; yoksa null. */
export function winnerOf(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { player: board[a], line };
  }
  if (board.every(Boolean)) return { player: null, draw: true, line: null };
  return null;
}

export const other = (p) => (p === 'X' ? 'O' : 'X');
export const emptyCells = (board) => board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

/**
 * Minimax: `ai` açısından tahta değeri. Derinliğe göre ayarlıdır:
 * hızlı kazanç ve geç kayıp tercih edilir.
 */
export function minimax(board, turn, ai, depth = 0) {
  const res = winnerOf(board);
  if (res) {
    if (res.draw) return 0;
    return res.player === ai ? 10 - depth : depth - 10;
  }
  let best = turn === ai ? -Infinity : Infinity;
  for (const i of emptyCells(board)) {
    board[i] = turn;
    const v = minimax(board, other(turn), ai, depth + 1);
    board[i] = null;
    best = turn === ai ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

/** En iyi hamle. rng verilirse eşit değerli hamleler arasından rastgele seçer. */
export function bestMove(board, ai, rng = null) {
  const b = board.slice();
  let bestVal = -Infinity;
  let moves = [];
  for (const i of emptyCells(b)) {
    b[i] = ai;
    const v = minimax(b, other(ai), ai, 1);
    b[i] = null;
    if (v > bestVal) {
      bestVal = v;
      moves = [i];
    } else if (v === bestVal) {
      moves.push(i);
    }
  }
  if (!moves.length) return -1;
  return rng ? moves[Math.floor(rng() * moves.length)] : moves[0];
}

/** Zorluk: 'hard' = her zaman minimax, 'easy' = %50 rastgele hamle. */
export function aiMove(board, ai, difficulty = 'hard', rng = Math.random) {
  const empty = emptyCells(board);
  if (!empty.length) return -1;
  if (difficulty === 'easy' && rng() < 0.5) return empty[Math.floor(rng() * empty.length)];
  return bestMove(board, ai, rng);
}

/* ---------------- Oyun ---------------- */

export class TicTacToeGame extends BaseGame {
  static meta = {
    id: 'tictactoe',
    title: 'Tic-Tac-Toe',
    width: W,
    height: H,
    hasScore: false,
    controls: 'Tıkla / dokun ya da oklar + Enter ile işaret koy · 1/2: oyuncu sayısı · K/Z: kolay/zor',
    description: 'Üç taşını yan yana diz. Tek oyunculu modda X sensin; zor seviyedeki bilgisayar yenilmez.',
  };

  constructor(engine) {
    super(engine);
    this.overlayDelay = 0.9;
    this.overlayDim = 0.6;
    this.mode = this.storage.get('ttt:mode', 1) === 2 ? 2 : 1;
    this.difficulty = this.storage.get('ttt:difficulty', 'hard') === 'easy' ? 'easy' : 'hard';
    this.tally = sessionTally;
    this.menuButtons = [
      { label: '1 Oyuncu', key: 'Digit1', group: 0, selected: () => this.mode === 1, onClick: () => this.setOption('mode', 1) },
      { label: '2 Oyuncu', key: 'Digit2', group: 0, selected: () => this.mode === 2, onClick: () => this.setOption('mode', 2) },
      { label: 'Kolay', key: 'KeyK', group: 1, color: NEON.green, selected: () => this.difficulty === 'easy', onClick: () => this.setOption('difficulty', 'easy') },
      { label: 'Zor', key: 'KeyZ', group: 1, color: NEON.pink, selected: () => this.difficulty === 'hard', onClick: () => this.setOption('difficulty', 'hard') },
    ];
  }

  setOption(name, value) {
    this[name] = value;
    this.storage.set(`ttt:${name}`, value);
  }

  reset() {
    super.reset();
    this.board = new Array(9).fill(null);
    this.placedAt = new Array(9).fill(0);
    this.turn = 'X';
    this.result = null;
    this.aiTimer = 0;
    this.cursor = 4;
    this.showCursor = false;
  }

  get aiTurn() {
    return this.mode === 1 && this.turn === 'O';
  }

  cellAt(x, y) {
    const c = Math.floor((x - BX) / CELL);
    const r = Math.floor((y - BY) / CELL);
    if (c < 0 || r < 0 || c > 2 || r > 2) return -1;
    return r * 3 + c;
  }

  update(dt) {
    if (super.update(dt)) return;
    const input = this.input;

    if (this.aiTurn) {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) this.place(aiMove(this.board, 'O', this.difficulty));
      return;
    }

    // Klavye imleci
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    for (const [code, d] of Object.entries(moves)) {
      if (input.wasPressed(code)) {
        this.showCursor = true;
        const r = Math.floor(this.cursor / 3);
        const c = this.cursor % 3;
        if (Math.abs(d) === 1) this.cursor = r * 3 + ((c + d + 3) % 3);
        else this.cursor = (this.cursor + d + 9) % 9;
      }
    }
    if (input.wasPressed('Enter', 'Space')) {
      this.showCursor = true;
      this.place(this.cursor);
      return;
    }
    const p = input.pointer;
    if (p.clicked && p.button === 0) {
      const i = this.cellAt(p.x, p.y);
      if (i >= 0) {
        this.showCursor = false;
        this.place(i);
      }
    }
  }

  place(i) {
    if (i < 0 || this.board[i]) return;
    this.board[i] = this.turn;
    this.placedAt[i] = this.time;
    this.sound.beep(this.turn === 'X' ? 520 : 390, 0.06, { type: 'triangle' });
    const res = winnerOf(this.board);
    if (res) {
      this.result = res;
      if (res.draw) this.tally.draw++;
      else this.tally[res.player]++;
      // İki kişilik oyunda ya da X (oyuncu) kazanınca "kazandın"; beraberlik ve kayıp "over"
      const won = !res.draw && (this.mode === 2 || res.player === 'X');
      this.gameOver(won);
      return;
    }
    this.turn = other(this.turn);
    if (this.aiTurn) this.aiTimer = AI_DELAY;
  }

  overlayContent() {
    const c = super.overlayContent();
    if (this.state === 'ready') {
      c.lines = [{ text: 'Mod ve zorluk seç', color: NEON.dim }];
      return c;
    }
    const r = this.result;
    if (!r || r.draw) {
      c.title = 'BERABERE';
      c.color = NEON.yellow;
    } else if (this.mode === 1) {
      c.title = r.player === 'X' ? 'KAZANDIN!' : 'KAYBETTİN';
    } else {
      c.title = `${r.player} KAZANDI!`;
    }
    c.lines = [{ text: `X ${this.tally.X}  ·  Berabere ${this.tally.draw}  ·  O ${this.tally.O}`, color: NEON.text }];
    return c;
  }

  /* ---------- Çizim ---------- */

  drawX(cx, cy, s, t) {
    const ctx = this.ctx;
    const k = Math.min(1, t * 6);
    ctx.save();
    ctx.strokeStyle = NEON.pink;
    ctx.shadowColor = NEON.pink;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    const d = s * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - d);
    ctx.lineTo(cx - d + 2 * d * Math.min(1, k * 2), cy - d + 2 * d * Math.min(1, k * 2));
    if (k > 0.5) {
      const k2 = (k - 0.5) * 2;
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx + d - 2 * d * k2, cy - d + 2 * d * k2);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawO(cx, cy, s, t) {
    const ctx = this.ctx;
    const k = Math.min(1, t * 5);
    ctx.save();
    ctx.strokeStyle = NEON.cyan;
    ctx.shadowColor = NEON.cyan;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.stroke();
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    // Üst bilgi
    this.text(`X  ${this.tally.X}`, 24, 26, { size: 18, align: 'left', color: NEON.pink });
    this.text(`BERABERE ${this.tally.draw}`, W / 2, 26, { size: 14, color: NEON.dim });
    this.text(`${this.tally.O}  O`, W - 24, 26, { size: 18, align: 'right', color: NEON.cyan });

    // Izgara
    ctx.save();
    ctx.strokeStyle = NEON.purple;
    ctx.shadowColor = NEON.purple;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(BX + i * CELL, BY + 10);
      ctx.lineTo(BX + i * CELL, BY + CELL * 3 - 10);
      ctx.moveTo(BX + 10, BY + i * CELL);
      ctx.lineTo(BX + CELL * 3 - 10, BY + i * CELL);
    }
    ctx.stroke();
    ctx.restore();

    // Önizleme (fare) ve klavye imleci
    const p = this.input.pointer;
    if (this.state === 'playing' && !this.aiTurn) {
      const hover = p.type === 'mouse' && p.hover ? this.cellAt(p.x, p.y) : -1;
      if (hover >= 0 && !this.board[hover]) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        const cx = BX + (hover % 3) * CELL + CELL / 2;
        const cy = BY + Math.floor(hover / 3) * CELL + CELL / 2;
        if (this.turn === 'X') this.drawX(cx, cy, CELL, 1);
        else this.drawO(cx, cy, CELL, 1);
        ctx.restore();
      }
      if (this.showCursor) {
        ctx.save();
        ctx.strokeStyle = NEON.yellow;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.strokeRect(BX + (this.cursor % 3) * CELL + 8, BY + Math.floor(this.cursor / 3) * CELL + 8, CELL - 16, CELL - 16);
        ctx.restore();
      }
    }

    // İşaretler
    for (let i = 0; i < 9; i++) {
      const v = this.board[i];
      if (!v) continue;
      const cx = BX + (i % 3) * CELL + CELL / 2;
      const cy = BY + Math.floor(i / 3) * CELL + CELL / 2;
      const t = this.time - this.placedAt[i];
      if (v === 'X') this.drawX(cx, cy, CELL, t);
      else this.drawO(cx, cy, CELL, t);
    }

    // Kazanan çizgi
    if (this.result && this.result.line) {
      const [a, , c] = this.result.line;
      const k = Math.min(1, this.stateTime * 3);
      const ax = BX + (a % 3) * CELL + CELL / 2;
      const ay = BY + Math.floor(a / 3) * CELL + CELL / 2;
      const cx = BX + (c % 3) * CELL + CELL / 2;
      const cy = BY + Math.floor(c / 3) * CELL + CELL / 2;
      const ex = (cx - ax) * 0.18;
      const ey = (cy - ay) * 0.18;
      ctx.save();
      ctx.strokeStyle = NEON.yellow;
      ctx.shadowColor = NEON.yellow;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax - ex, ay - ey);
      ctx.lineTo(ax - ex + (cx - ax + 2 * ex) * k, ay - ey + (cy - ay + 2 * ey) * k);
      ctx.stroke();
      ctx.restore();
    }

    // Alt durum satırı
    let status;
    if (this.state === 'playing') {
      status = this.aiTurn ? 'Bilgisayar düşünüyor…' : this.mode === 1 ? 'Sıra sende (X)' : `Sıra: ${this.turn}`;
    } else {
      status = this.mode === 1 ? `1 Oyuncu · ${this.difficulty === 'easy' ? 'Kolay' : 'Zor'}` : '2 Oyuncu';
    }
    this.text(status, W / 2, H - 22, { size: 16, color: this.turn === 'X' ? NEON.pink : NEON.cyan });
  }
}
