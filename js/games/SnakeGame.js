import { BaseGame, NEON, HUD_HEIGHT, roundRect } from '../core/BaseGame.js';

const CELL = 20;
const COLS = 30;
const ROWS = 28; // 600 - 40 (HUD) = 560 / 20
const START_INTERVAL = 0.12;
const MIN_INTERVAL = 0.05;
const SPEEDUP = 0.97;

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const isOpposite = (a, b) => a.x === -b.x && a.y === -b.y;
const isSame = (a, b) => a.x === b.x && a.y === b.y;

/**
 * Yön tamponuna yeni yön ekler (saf fonksiyon).
 * Karşılaştırma, tampondaki son yöne (yoksa son GERÇEK hareket yönüne) göre yapılır;
 * böylece iki hızlı basışla yılanın kendi üstüne dönmesi imkânsızdır.
 */
export function enqueueDirection(queue, lastMoved, dir, maxLength = 3) {
  const ref = queue.length ? queue[queue.length - 1] : lastMoved;
  if (isSame(ref, dir) || isOpposite(ref, dir) || queue.length >= maxLength) return queue;
  return [...queue, dir];
}

/**
 * Bir adım ilerletir (saf fonksiyon).
 * snake: baş önde {x,y} dizisi. Dönen: { snake, ate, dead }
 */
export function stepSnake(snake, dir, food, cols, rows) {
  const head = snake[0];
  const next = { x: head.x + dir.x, y: head.y + dir.y };
  if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows) return { snake, ate: false, dead: true };
  const ate = !!food && next.x === food.x && next.y === food.y;
  // Büyümüyorsa kuyruk bu adımda boşalacağı için çarpışmaya dahil edilmez.
  const body = ate ? snake : snake.slice(0, -1);
  if (body.some((s) => s.x === next.x && s.y === next.y)) return { snake, ate: false, dead: true };
  const moved = [next, ...snake];
  if (!ate) moved.pop();
  return { snake: moved, ate, dead: false };
}

/** Yılanın üstünde olmayan rastgele bir hücre (yer yoksa null). */
export function spawnFood(snake, cols, rows, rng = Math.random) {
  const taken = new Set(snake.map((s) => s.y * cols + s.x));
  const free = [];
  for (let i = 0; i < cols * rows; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return null;
  const i = free[Math.floor(rng() * free.length)];
  return { x: i % cols, y: Math.floor(i / cols) };
}

export class SnakeGame extends BaseGame {
  static meta = {
    id: 'snake',
    title: 'Snake',
    width: 600,
    height: 600,
    controls: 'Ok tuşları / WASD ile yön · Mobilde kaydır (swipe)',
    description: 'Yemleri topla, uza ve duvarlara ya da kuyruğuna çarpma. Her yemde yılan biraz hızlanır.',
  };

  reset() {
    super.reset();
    const cy = Math.floor(ROWS / 2);
    this.snake = [
      { x: 8, y: cy },
      { x: 7, y: cy },
      { x: 6, y: cy },
    ];
    this.dir = DIRS.right;
    this.lastMoved = DIRS.right;
    this.queue = [];
    this.interval = START_INTERVAL;
    this.acc = 0;
    this.food = spawnFood(this.snake, COLS, ROWS);
    this.eatFlash = 0;
  }

  readDirection() {
    const i = this.input;
    let dir = null;
    if (i.wasPressed('ArrowUp', 'KeyW') || i.swipe === 'up') dir = DIRS.up;
    else if (i.wasPressed('ArrowDown', 'KeyS') || i.swipe === 'down') dir = DIRS.down;
    else if (i.wasPressed('ArrowLeft', 'KeyA') || i.swipe === 'left') dir = DIRS.left;
    else if (i.wasPressed('ArrowRight', 'KeyD') || i.swipe === 'right') dir = DIRS.right;
    if (dir) this.queue = enqueueDirection(this.queue, this.lastMoved, dir);
  }

  update(dt) {
    this.eatFlash = Math.max(0, this.eatFlash - dt);
    if (super.update(dt)) return;
    this.readDirection();

    this.acc += dt;
    while (this.acc >= this.interval && this.state === 'playing') {
      this.acc -= this.interval;
      this.step();
    }
  }

  step() {
    if (this.queue.length) this.dir = this.queue.shift();
    const res = stepSnake(this.snake, this.dir, this.food, COLS, ROWS);
    if (res.dead) {
      this.gameOver(false);
      return;
    }
    this.snake = res.snake;
    this.lastMoved = this.dir;
    if (res.ate) {
      this.score += 10;
      this.eatFlash = 0.15;
      this.interval = Math.max(MIN_INTERVAL, this.interval * SPEEDUP);
      this.sound.beep(880, 0.05, { type: 'square', slide: 300 });
      this.food = spawnFood(this.snake, COLS, ROWS);
      if (!this.food) this.gameOver(true); // tüm alan doldu
    }
  }

  draw() {
    const ctx = this.ctx;
    const oy = HUD_HEIGHT;

    // Izgara
    ctx.strokeStyle = NEON.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= COLS; x++) {
      ctx.moveTo(x * CELL + 0.5, oy);
      ctx.lineTo(x * CELL + 0.5, oy + ROWS * CELL);
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.moveTo(0, oy + y * CELL + 0.5);
      ctx.lineTo(COLS * CELL, oy + y * CELL + 0.5);
    }
    ctx.stroke();

    // Yem
    if (this.food) {
      const pulse = 1 + Math.sin(this.time * 6) * 0.12;
      const cx = this.food.x * CELL + CELL / 2;
      const cy = oy + this.food.y * CELL + CELL / 2;
      ctx.save();
      ctx.fillStyle = NEON.pink;
      ctx.shadowColor = NEON.pink;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, (CELL / 2 - 3) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Yılan
    const n = this.snake.length;
    ctx.save();
    for (let i = n - 1; i >= 0; i--) {
      const s = this.snake[i];
      const t = i / Math.max(1, n - 1);
      const light = 62 - t * 22;
      ctx.fillStyle = i === 0 ? NEON.green : `hsl(150, 100%, ${light}%)`;
      if (i === 0) {
        ctx.shadowColor = NEON.green;
        ctx.shadowBlur = 16 + this.eatFlash * 60;
      }
      roundRect(ctx, s.x * CELL + 2, oy + s.y * CELL + 2, CELL - 4, CELL - 4, i === 0 ? 6 : 4);
      ctx.fill();
    }
    ctx.restore();

    // Göz
    const head = this.snake[0];
    const d = this.dir;
    ctx.fillStyle = NEON.bg;
    const hx = head.x * CELL + CELL / 2 + d.x * 4;
    const hy = oy + head.y * CELL + CELL / 2 + d.y * 4;
    const px = -d.y * 4;
    const py = d.x * 4;
    ctx.fillRect(hx + px - 1.5, hy + py - 1.5, 3, 3);
    ctx.fillRect(hx - px - 1.5, hy - py - 1.5, 3, 3);

    this.drawHUD(`UZUNLUK ${n}`);
  }
}
