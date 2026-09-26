import { BaseGame, NEON, HUD_HEIGHT, roundRect } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

const W = 600;
const H = 600;
const AREA_H = H - HUD_HEIGHT; // 560
const START_INTERVAL = 0.12;
const MIN_INTERVAL = 0.05;
const SPEEDUP = 0.97;

/** Harita boyutları: hücre boyutu küçüldükçe ızgara büyür; ızgara alanın ortasına yerleşir. */
export const GRID_SIZES = {
  small: { cell: 40 }, // 15×14
  medium: { cell: 30 }, // 20×18
  normal: { cell: 20 }, // 30×28
  large: { cell: 15 }, // 40×37
};
export const gridFor = (size) => {
  const { cell } = GRID_SIZES[size] || GRID_SIZES.normal;
  return { cell, cols: Math.floor(W / cell), rows: Math.floor(AREA_H / cell) };
};

/** Yılan renkleri: hue gövde tonudur; 'rainbow' gövde boyunca ve zamanla döner. */
const SNAKE_COLORS = {
  green: { color: NEON.green, hue: 150 },
  cyan: { color: NEON.cyan, hue: 187 },
  pink: { color: NEON.pink, hue: 330 },
  purple: { color: NEON.purple, hue: 270 },
  gold: { color: NEON.yellow, hue: 50 },
  rainbow: { color: 'rainbow', hue: 0 },
};

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
 * snake: baş önde {x,y} dizisi. food: tek yem, yem dizisi ya da null.
 * Dönen: { snake, ate, foodIndex, dead } — foodIndex yenen yemin dizideki sırası (yoksa -1).
 */
export function stepSnake(snake, dir, food, cols, rows) {
  const head = snake[0];
  const next = { x: head.x + dir.x, y: head.y + dir.y };
  if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows) return { snake, ate: false, foodIndex: -1, dead: true };
  const foods = Array.isArray(food) ? food : food ? [food] : [];
  const foodIndex = foods.findIndex((f) => f && f.x === next.x && f.y === next.y);
  const ate = foodIndex >= 0;
  // Büyümüyorsa kuyruk bu adımda boşalacağı için çarpışmaya dahil edilmez.
  const body = ate ? snake : snake.slice(0, -1);
  if (body.some((s) => s.x === next.x && s.y === next.y)) return { snake, ate: false, foodIndex: -1, dead: true };
  const moved = [next, ...snake];
  if (!ate) moved.pop();
  return { snake: moved, ate, foodIndex, dead: false };
}

/** Yılanın ve `blocked` hücrelerin (ör. diğer yemler) üstünde olmayan rastgele bir hücre (yer yoksa null). */
export function spawnFood(snake, cols, rows, rng = Math.random, blocked = []) {
  const taken = new Set([...snake, ...blocked].map((s) => s.y * cols + s.x));
  const free = [];
  for (let i = 0; i < cols * rows; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return null;
  const i = free[Math.floor(rng() * free.length)];
  return { x: i % cols, y: Math.floor(i / cols) };
}

/** Yem listesini hedef sayıya tamamlar (yer kalmadıysa eksik kalır). Yeni dizi döner. */
export function fillFoods(foods, count, snake, cols, rows, rng = Math.random) {
  const out = foods.slice();
  while (out.length < count) {
    const f = spawnFood(snake, cols, rows, rng, out);
    if (!f) break;
    out.push(f);
  }
  return out;
}

export class SnakeGame extends BaseGame {
  static meta = {
    id: 'snake',
    get title() { return t('snake.title'); },
    width: W,
    height: H,
    theme: [NEON.green, NEON.cyan],
    get controls() { return t('snake.controls'); },
    get description() { return t('snake.description'); },
  };

  static settings = [
    {
      id: 'size', labelKey: 'set.mapSize', default: 'normal',
      options: Object.keys(GRID_SIZES).map((value) => {
        const g = gridFor(value);
        return { value, labelKey: `snake.size.${value}`, note: `${g.cols}×${g.rows}` };
      }),
    },
    {
      id: 'color', labelKey: 'set.snakeColor', type: 'color', live: true, default: 'green',
      options: Object.entries(SNAKE_COLORS).map(([value, c]) => ({ value, labelKey: `color.${value}`, color: c.color })),
    },
    {
      id: 'apples', labelKey: 'set.apples', default: 1,
      options: [1, 2, 3, 5].map((n) => ({ value: n, labelKey: 'snake.apples', params: { n } })),
    },
  ];

  reset() {
    super.reset();
    const { cell, cols, rows } = gridFor(this.settings.size);
    this.cell = cell;
    this.cols = cols;
    this.rows = rows;
    this.ox = (W - cols * cell) / 2;
    this.oy = HUD_HEIGHT + (AREA_H - rows * cell) / 2;
    const cy = Math.floor(rows / 2);
    const hx = Math.max(2, Math.floor(cols * 0.27));
    this.snake = [
      { x: hx, y: cy },
      { x: hx - 1, y: cy },
      { x: hx - 2, y: cy },
    ];
    this.dir = DIRS.right;
    this.lastMoved = DIRS.right;
    this.queue = [];
    this.interval = START_INTERVAL;
    this.acc = 0;
    this.foods = fillFoods([], this.settings.apples, this.snake, cols, rows);
    this.eatFlash = 0;
  }

  /** Geriye uyumluluk / testler: ilk yem. */
  get food() {
    return this.foods[0] || null;
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
    const res = stepSnake(this.snake, this.dir, this.foods, this.cols, this.rows);
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
      const rest = this.foods.filter((_, i) => i !== res.foodIndex);
      this.foods = fillFoods(rest, this.settings.apples, this.snake, this.cols, this.rows);
      if (!this.foods.length) this.gameOver(true); // tüm alan doldu
    }
  }

  /** i. segmentin rengi (0 = baş). */
  segmentColor(i, n) {
    const scheme = SNAKE_COLORS[this.settings.color] || SNAKE_COLORS.green;
    const t01 = i / Math.max(1, n - 1);
    if (scheme.color === 'rainbow') return `hsl(${(this.time * 90 + i * 14) % 360}, 100%, ${i === 0 ? 65 : 60 - t01 * 12}%)`;
    if (i === 0) return scheme.color;
    return `hsl(${scheme.hue}, 100%, ${62 - t01 * 22}%)`;
  }

  draw() {
    const ctx = this.ctx;
    const { cell: S, cols, rows, ox, oy } = this;

    // Izgara
    ctx.strokeStyle = NEON.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) {
      ctx.moveTo(ox + x * S + 0.5, oy);
      ctx.lineTo(ox + x * S + 0.5, oy + rows * S);
    }
    for (let y = 0; y <= rows; y++) {
      ctx.moveTo(ox, oy + y * S + 0.5);
      ctx.lineTo(ox + cols * S, oy + y * S + 0.5);
    }
    ctx.stroke();

    // Yemler (yılan pembeyse yem sarı olur ki karışmasın)
    const foodColor = this.settings.color === 'pink' ? NEON.yellow : NEON.pink;
    this.foods.forEach((food, k) => {
      const pulse = 1 + Math.sin(this.time * 6 + k * 1.3) * 0.12;
      ctx.save();
      ctx.fillStyle = foodColor;
      ctx.shadowColor = foodColor;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(ox + food.x * S + S / 2, oy + food.y * S + S / 2, (S / 2 - Math.max(2, S * 0.15)) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Yılan
    const n = this.snake.length;
    const pad = Math.max(1.5, S * 0.1);
    ctx.save();
    for (let i = n - 1; i >= 0; i--) {
      const s = this.snake[i];
      const color = this.segmentColor(i, n);
      ctx.fillStyle = color;
      if (i === 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 16 + this.eatFlash * 60;
      }
      roundRect(ctx, ox + s.x * S + pad, oy + s.y * S + pad, S - pad * 2, S - pad * 2, i === 0 ? S * 0.3 : S * 0.2);
      ctx.fill();
    }
    ctx.restore();

    // Göz
    const head = this.snake[0];
    const d = this.dir;
    const e = S * 0.2;
    const es = Math.max(2, S * 0.15);
    ctx.fillStyle = NEON.bg;
    const hx = ox + head.x * S + S / 2 + d.x * e;
    const hy = oy + head.y * S + S / 2 + d.y * e;
    const px = -d.y * e;
    const py = d.x * e;
    ctx.fillRect(hx + px - es / 2, hy + py - es / 2, es, es);
    ctx.fillRect(hx - px - es / 2, hy - py - es / 2, es, es);

    this.drawHUD(t('snake.length', { n }));
  }
}
