import { BaseGame, NEON, roundRect, shuffle } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

export const COLS = 10;
export const ROWS = 20;
const CELL = 30;
const FIELD_W = COLS * CELL; // 300
const PANEL_X = FIELD_W;
const DAS = 0.17; // basılı tutunca tekrar başlamadan önceki gecikme
const ARR = 0.05; // tekrar aralığı
const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;
const SOFT_DROP_INTERVAL = 0.04;
const CLEAR_ANIM = 0.22;

/* ---------------- Saf mantık ---------------- */

/** SRS başlangıç (0) durumları. Diğer durumlar matris döndürmesiyle elde edilir. */
export const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
};
export const TYPES = Object.keys(SHAPES);

const COLORS = { I: NEON.cyan, J: NEON.blue, L: NEON.orange, O: NEON.yellow, S: NEON.green, T: NEON.purple, Z: NEON.pink };

/*
 * SRS wall kick tabloları (Tetris Guideline). Değerler (x, y) — y YUKARI pozitif;
 * ızgarada y aşağı arttığı için uygularken y'nin işareti çevrilir.
 */
const JLSTZ_KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export const emptyBoard = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(null));

/** dir = 1 saat yönü, -1 saat yönü tersi. */
export function rotateMatrix(m, dir) {
  const n = m.length;
  return m.map((row, r) => row.map((_, c) => (dir > 0 ? m[n - 1 - c][r] : m[c][n - 1 - r])));
}

export function createPiece(type) {
  const matrix = SHAPES[type].map((row) => row.slice());
  const x = type === 'O' ? 4 : 3;
  const y = type === 'I' ? -1 : 0;
  return { type, rot: 0, x, y, matrix };
}

/** Parçanın dolu hücrelerinin ızgara koordinatları. */
export function cellsOf(piece, x = piece.x, y = piece.y, matrix = piece.matrix) {
  const out = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) if (matrix[r][c]) out.push([x + c, y + r]);
  }
  return out;
}

export function collides(board, piece, x = piece.x, y = piece.y, matrix = piece.matrix) {
  for (const [cx, cy] of cellsOf(piece, x, y, matrix)) {
    if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
    if (cy >= 0 && board[cy][cx]) return true;
  }
  return false;
}

/** SRS döndürme + wall kick. Başarılıysa yeni parça, değilse null. */
export function tryRotate(board, piece, dir) {
  const to = (piece.rot + dir + 4) % 4;
  const matrix = rotateMatrix(piece.matrix, dir);
  if (piece.type === 'O') return { ...piece, rot: to, matrix };
  const kicks = (piece.type === 'I' ? I_KICKS : JLSTZ_KICKS)[`${piece.rot}>${to}`];
  for (const [kx, ky] of kicks) {
    const x = piece.x + kx;
    const y = piece.y - ky; // y yukarı pozitif → ızgarada ters
    if (!collides(board, piece, x, y, matrix)) return { ...piece, rot: to, matrix, x, y };
  }
  return null;
}

export function dropDistance(board, piece) {
  let d = 0;
  while (!collides(board, piece, piece.x, piece.y + d + 1)) d++;
  return d;
}

/** Parçayı tahtaya yazar (yeni tahta döner). Görünür alanın üstünde kalan hücre varsa lockOut = true. */
export function mergePiece(board, piece) {
  const out = board.map((row) => row.slice());
  let lockOut = false;
  for (const [x, y] of cellsOf(piece)) {
    if (y < 0) lockOut = true;
    else out[y][x] = piece.type;
  }
  return { board: out, lockOut };
}

export function fullRows(board) {
  const rows = [];
  board.forEach((row, i) => {
    if (row.every(Boolean)) rows.push(i);
  });
  return rows;
}

/** Dolu satırları siler, üstünü aşağı kaydırır. Dönen: { board, cleared } */
export function clearLines(board) {
  const kept = board.filter((row) => !row.every(Boolean));
  const cleared = ROWS - kept.length;
  const fresh = Array.from({ length: cleared }, () => new Array(COLS).fill(null));
  return { board: [...fresh, ...kept.map((r) => r.slice())], cleared };
}

const LINE_POINTS = [0, 100, 300, 500, 800];
export const scoreForLines = (n, level) => (LINE_POINTS[n] || 0) * level;
export const levelForLines = (lines) => 1 + Math.floor(lines / 10);
/** Guideline yerçekimi (sn/satır). Seviye 1: 1 sn. */
export const gravityInterval = (level) => Math.max(0.03, Math.pow(0.8 - (level - 1) * 0.007, level - 1));

/** 7-bag: her 7 parçada her tip tam bir kez gelir. */
export function createBag(rng = Math.random) {
  let bag = [];
  return () => {
    if (!bag.length) bag = shuffle(TYPES.slice(), rng);
    return bag.pop();
  };
}

/* ---------------- Oyun ---------------- */

export class TetrisGame extends BaseGame {
  static meta = {
    id: 'tetris',
    get title() { return t('tetris.title'); },
    width: 480,
    height: 600,
    theme: [NEON.cyan, NEON.purple],
    touchSurface: true, // mobil oyun modunda canvas dışındaki dokunuşlar da oyuna gider
    icon: '🧩',
    get controls() { return t('tetris.controls'); },
    get touchControls() { return t('tetris.touchControls'); },
    get description() { return t('tetris.description'); },
  };

  reset() {
    super.reset();
    this.board = emptyBoard();
    this.nextType = createBag();
    this.queue = [this.nextType(), this.nextType(), this.nextType()];
    this.hold = null;
    this.holdUsed = false;
    this.lines = 0;
    this.level = 1;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.dasDir = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.dragAnchor = 0;
    this.dragMoved = false;
    this.clearing = null;
    this.current = null;
    this.spawn();
  }

  spawn(type = null) {
    const t = type || this.queue.shift();
    if (!type) this.queue.push(this.nextType());
    let piece = createPiece(t);
    if (collides(this.board, piece)) piece = { ...piece, y: piece.y - 1 };
    this.current = piece;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (collides(this.board, piece)) this.gameOver(false); // block out
  }

  grounded() {
    return collides(this.board, this.current, this.current.x, this.current.y + 1);
  }

  /** Başarılı hareket/döndürme sonrası kilit gecikmesini (sınırlı sayıda) yeniler. */
  touched() {
    if (this.lockTimer > 0 && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    const p = this.current;
    if (collides(this.board, p, p.x + dx, p.y)) return false;
    p.x += dx;
    this.touched();
    this.sound.beep(220, 0.02, { volume: 0.03 });
    return true;
  }

  rotate(dir) {
    const r = tryRotate(this.board, this.current, dir);
    if (!r) return;
    this.current = r;
    this.touched();
    this.sound.beep(440, 0.03, { type: 'triangle', volume: 0.04 });
  }

  hardDrop() {
    const d = dropDistance(this.board, this.current);
    this.current.y += d;
    this.score += d * 2;
    this.sound.beep(160, 0.06, { slide: -60 });
    this.lock();
  }

  holdPiece() {
    if (this.holdUsed) return;
    const type = this.current.type;
    if (this.hold) this.spawn(this.hold);
    else this.spawn();
    this.hold = type;
    this.holdUsed = true;
    this.sound.beep(330, 0.04, { type: 'triangle' });
  }

  lock() {
    const { board, lockOut } = mergePiece(this.board, this.current);
    this.board = board;
    this.current = null;
    if (lockOut) {
      this.gameOver(false);
      return;
    }
    const rows = fullRows(board);
    if (rows.length) {
      this.clearing = { rows, t: 0 };
      this.score += scoreForLines(rows.length, this.level);
      this.lines += rows.length;
      const newLevel = levelForLines(this.lines);
      if (newLevel > this.level) this.sound.seq([[660, 0.06], [880, 0.1]], { type: 'triangle' });
      this.level = newLevel;
      this.sound.beep(rows.length === 4 ? 1046 : 740, 0.12, { type: 'square', slide: 200 });
    } else {
      this.sound.beep(120, 0.04, { volume: 0.04 });
      this.spawn();
    }
  }

  update(dt) {
    if (super.update(dt)) return;
    if (this.clearing) {
      this.clearing.t += dt;
      if (this.clearing.t >= CLEAR_ANIM) {
        this.board = clearLines(this.board).board;
        this.clearing = null;
        this.spawn();
      }
      return;
    }
    if (!this.current) return;
    const input = this.input;
    const p = input.pointer;

    // Tut / döndür / sert düşür (wasPressed: tuş tekrarı tetiklemez)
    if (input.wasPressed('KeyC', 'ShiftLeft', 'ShiftRight') || input.swipe === 'up') {
      this.holdPiece();
      if (this.state !== 'playing') return;
    }
    if (input.wasPressed('ArrowUp', 'KeyX', 'KeyW')) this.rotate(1);
    if (input.wasPressed('KeyZ')) this.rotate(-1);
    if (p.pressed) {
      this.dragAnchor = p.startX; // basış noktası (kare işlenene kadar parmak ilerlemiş olabilir)
      this.dragMoved = false;
    }
    if (p.clicked && p.button === 0 && !this.dragMoved) this.rotate(1);
    if (input.wasPressed('Space') || input.swipe === 'down') {
      this.hardDrop();
      return;
    }

    // Sağa/sola: DAS/ARR
    const left = input.isDown('ArrowLeft', 'KeyA');
    const right = input.isDown('ArrowRight', 'KeyD');
    if (input.wasPressed('ArrowLeft', 'KeyA')) this.startDas(-1);
    else if (input.wasPressed('ArrowRight', 'KeyD')) this.startDas(1);
    else if ((this.dasDir === -1 && !left) || (this.dasDir === 1 && !right)) {
      if (left) this.startDas(-1, false);
      else if (right) this.startDas(1, false);
      else this.dasDir = 0;
    }
    if (this.dasDir) {
      this.dasTimer += dt;
      if (this.dasTimer >= DAS) {
        this.arrTimer += dt;
        while (this.arrTimer >= ARR) {
          this.arrTimer -= ARR;
          if (!this.move(this.dasDir)) {
            this.arrTimer = 0;
            break;
          }
        }
      }
    }

    // Dokunmatik sürükleme: her hücre genişliği kadar sürüklemede bir kaydırma
    if (p.isDown && p.type !== 'mouse') {
      while (p.x - this.dragAnchor >= CELL) {
        this.move(1);
        this.dragAnchor += CELL;
        this.dragMoved = true;
      }
      while (this.dragAnchor - p.x >= CELL) {
        this.move(-1);
        this.dragAnchor -= CELL;
        this.dragMoved = true;
      }
    }

    // Yerçekimi + yavaş düşürme
    const soft = input.isDown('ArrowDown', 'KeyS');
    const interval = soft ? Math.min(SOFT_DROP_INTERVAL, gravityInterval(this.level)) : gravityInterval(this.level);
    this.gravityAcc += dt;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (this.grounded()) {
        this.gravityAcc = 0;
        break;
      }
      this.current.y++;
      this.lockTimer = 0;
      if (soft) this.score += 1;
    }

    // Kilit gecikmesi
    if (this.grounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY || this.lockResets >= MAX_LOCK_RESETS) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  startDas(dir, moveNow = true) {
    this.dasDir = dir;
    this.dasTimer = moveNow ? 0 : DAS;
    this.arrTimer = 0;
    if (moveNow) this.move(dir);
  }

  /* ---------- Çizim ---------- */

  drawBlock(x, y, size, color, alpha = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.28;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    ctx.fillRect(x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4);
    ctx.restore();
  }

  drawMini(type, cx, cy, size = 18) {
    if (!type) return;
    const m = SHAPES[type];
    const cells = cellsOf({ matrix: m }, 0, 0, m);
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
    const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
    for (const [x, y] of cells) {
      this.drawBlock(cx - w / 2 + (x - Math.min(...xs)) * size, cy - h / 2 + (y - Math.min(...ys)) * size, size, COLORS[type]);
    }
  }

  drawBox(label, x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();
    roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 228, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    this.text(label, x + 10, y + 14, { size: 12, align: 'left', color: NEON.dim });
  }

  draw() {
    const ctx = this.ctx;

    // Oyun alanı ızgarası
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(0, 0, FIELD_W, ROWS * CELL);
    ctx.strokeStyle = NEON.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(c * CELL + 0.5, 0);
      ctx.lineTo(c * CELL + 0.5, ROWS * CELL);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.moveTo(0, r * CELL + 0.5);
      ctx.lineTo(FIELD_W, r * CELL + 0.5);
    }
    ctx.stroke();

    // Yerleşmiş bloklar
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.board[r][c];
        if (t) this.drawBlock(c * CELL, r * CELL, CELL, COLORS[t], this.isEnded ? 0.55 : 1);
      }
    }

    // Silinen satır animasyonu
    if (this.clearing) {
      const k = this.clearing.t / CLEAR_ANIM;
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.85 * (1 - k);
      for (const r of this.clearing.rows) ctx.fillRect(0, r * CELL, FIELD_W, CELL);
      ctx.restore();
    }

    // Ghost ve aktif parça
    const p = this.current;
    if (p && this.state !== 'ready') {
      const d = dropDistance(this.board, p);
      ctx.save();
      ctx.strokeStyle = COLORS[p.type];
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      for (const [x, y] of cellsOf(p, p.x, p.y + d)) {
        if (y >= 0) ctx.strokeRect(x * CELL + 3.5, y * CELL + 3.5, CELL - 7, CELL - 7);
      }
      ctx.restore();
      ctx.save();
      ctx.shadowColor = COLORS[p.type];
      ctx.shadowBlur = 12;
      for (const [x, y] of cellsOf(p)) if (y >= 0) this.drawBlock(x * CELL, y * CELL, CELL, COLORS[p.type]);
      ctx.restore();
    }

    // Kenar
    ctx.strokeStyle = 'rgba(34, 228, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(FIELD_W + 1, 0);
    ctx.lineTo(FIELD_W + 1, this.height);
    ctx.stroke();

    // Yan panel
    ctx.fillStyle = NEON.panel;
    ctx.fillRect(PANEL_X + 2, 0, this.width - PANEL_X - 2, this.height);
    const px = PANEL_X + 14;
    const pw = this.width - PANEL_X - 28;
    const stat = (label, value, y, color) => {
      this.text(label, px, y, { size: 12, align: 'left', color: NEON.dim, maxWidth: pw });
      this.text(String(value), px, y + 22, { size: 22, align: 'left', color });
    };
    stat(t('hud.score'), this.score, 22, NEON.cyan);
    const best = this.best;
    stat(t('hud.best'), best === null ? '-' : best, 78, NEON.pink);
    stat(t('common.LEVEL'), this.level, 134, NEON.yellow);
    stat(t('tetris.lines'), this.lines, 190, NEON.green);

    this.drawBox(t('tetris.next'), px, 240, pw, 200);
    this.queue.slice(0, 3).forEach((t, i) => this.drawMini(t, px + pw / 2, 290 + i * 54, i === 0 ? 18 : 14));
    this.drawBox(t('tetris.hold'), px, 456, pw, 100);
    ctx.save();
    if (this.holdUsed) ctx.globalAlpha = 0.35;
    this.drawMini(this.hold, px + pw / 2, 514, 18);
    ctx.restore();
  }
}
