import { BaseGame, NEON, HUD_HEIGHT, clamp } from '../core/BaseGame.js';

const W = 600;
const H = 700;
export const BRICK_COLS = 10;
export const BRICK_ROWS = 8;
const MARGIN = 20;
const GAP = 4;
const BRICK_W = (W - MARGIN * 2 - GAP * (BRICK_COLS - 1)) / BRICK_COLS;
const BRICK_H = 22;
const BRICK_TOP = HUD_HEIGHT + 50;
const PADDLE_W = 100;
const PADDLE_H = 14;
const PADDLE_Y = H - 50;
const PADDLE_SPEED = 620;
const BALL_R = 7;
const BASE_SPEED = 360;
const MAX_BOUNCE = (60 * Math.PI) / 180;
const LIVES = 3;
const ROW_COLORS = [NEON.pink, NEON.red, NEON.orange, NEON.yellow, NEON.green, NEON.cyan, NEON.blue, NEON.purple];

/* ---------------- Saf mantık ---------------- */

/** Basit tohumlu rastgele (seviye dizilimleri her oyunda aynı olsun diye). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Seviye dizilimi: BRICK_ROWS × BRICK_COLS; 0 boş, 1 normal, 2 sağlam (iki vuruş).
 * Tüm dizilimler yatayda simetriktir ve en az bir tuğla içerir.
 */
export function layoutForLevel(level) {
  const grid = Array.from({ length: BRICK_ROWS }, () => new Array(BRICK_COLS).fill(0));
  const set = (r, c, v) => {
    grid[r][c] = v;
    grid[r][BRICK_COLS - 1 - c] = v;
  };
  const half = BRICK_COLS / 2;
  const pattern = (level - 1) % 4;
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < half; c++) {
      if (pattern === 0) {
        if (r < 6) set(r, c, 1);
      } else if (pattern === 1) {
        set(r, c, r < 2 ? 2 : 1);
      } else if (pattern === 2) {
        // Piramit
        if (c >= half - 1 - r) set(r, c, r === 0 ? 2 : 1);
      } else if (level < 8) {
        // Şeritler ve boşluklar
        if (r % 2 === 0 && c !== 1) set(r, c, r === 0 ? 2 : 1);
      }
    }
  }
  if (pattern === 3 && level >= 8) {
    const rng = lcg(level * 7919);
    const tough = Math.min(0.45, 0.1 + level * 0.03);
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < half; c++) if (rng() < 0.75) set(r, c, rng() < tough ? 2 : 1);
    }
  }
  if (!grid.some((row) => row.some(Boolean))) set(0, half - 1, 1);
  return grid;
}

export const levelSpeed = (level) => Math.min(720, BASE_SPEED * (1 + 0.1 * (level - 1)));

/**
 * Daire–dikdörtgen çarpışması. Çarpışma varsa en az girilen eksene göre
 * normal ve derinlik döner: { axis: 'x'|'y', depth, sign } — yoksa null.
 */
export function circleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  if (dx * dx + dy * dy > r * r) return null;
  const overlapX = Math.min(cx + r - rect.x, rect.x + rect.w - (cx - r));
  const overlapY = Math.min(cy + r - rect.y, rect.y + rect.h - (cy - r));
  if (overlapX < overlapY) return { axis: 'x', depth: overlapX, sign: cx < rect.x + rect.w / 2 ? -1 : 1 };
  return { axis: 'y', depth: overlapY, sign: cy < rect.y + rect.h / 2 ? -1 : 1 };
}

/** Rakete çarpma noktasına göre yukarı doğru yeni hız. */
export function paddleBounce(ballX, paddleX, paddleW, speed) {
  const rel = clamp((ballX - (paddleX + paddleW / 2)) / (paddleW / 2), -1, 1);
  const a = rel * MAX_BOUNCE;
  return { vx: Math.sin(a) * speed, vy: -Math.cos(a) * speed };
}

/* ---------------- Oyun ---------------- */

export class BreakoutGame extends BaseGame {
  static meta = {
    id: 'breakout',
    title: 'Breakout',
    width: W,
    height: H,
    controls: 'Fare / dokunma ya da ←/→ (A/D) ile raket · Space / tık / dokun: topu fırlat',
    description: 'Topu raketle karşıla ve tüm tuğlaları kır. 3 canın var; her seviyede top hızlanır ve yeni dizilim gelir.',
  };

  reset() {
    super.reset();
    this.level = 1;
    this.lives = LIVES;
    this.paddle = { x: (W - PADDLE_W) / 2 };
    this.particles = [];
    this.lastPointerX = null;
    this.buildLevel();
  }

  buildLevel() {
    const layout = layoutForLevel(this.level);
    this.bricks = [];
    layout.forEach((row, r) => row.forEach((hp, c) => {
      if (!hp) return;
      this.bricks.push({
        x: MARGIN + c * (BRICK_W + GAP), y: BRICK_TOP + r * (BRICK_H + GAP), w: BRICK_W, h: BRICK_H,
        hp, maxHp: hp, row: r, points: (BRICK_ROWS - r) * 10,
      });
    }));
    this.alive = this.bricks.length;
    this.resetBall();
  }

  resetBall() {
    this.speed = levelSpeed(this.level);
    this.ball = { x: this.paddle.x + PADDLE_W / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true };
  }

  start() {
    super.start();
    this.launch();
  }

  launch() {
    const b = this.ball;
    if (!b.stuck) return;
    const a = (Math.random() * 2 - 1) * 0.35;
    b.vx = Math.sin(a) * this.speed;
    b.vy = -Math.cos(a) * this.speed;
    b.stuck = false;
    this.sound.beep(600, 0.05);
  }

  update(dt) {
    this.updateParticles(dt);
    if (super.update(dt)) return;
    const input = this.input;
    const p = input.pointer;

    // Raket: klavye ya da imleç
    let dir = 0;
    if (input.isDown('ArrowLeft', 'KeyA')) dir -= 1;
    if (input.isDown('ArrowRight', 'KeyD')) dir += 1;
    if (dir) this.paddle.x += dir * PADDLE_SPEED * dt;
    if ((p.type === 'mouse' && p.hover && p.x !== this.lastPointerX) || p.isDown) {
      this.paddle.x = p.x - PADDLE_W / 2;
    }
    this.lastPointerX = p.x;
    this.paddle.x = clamp(this.paddle.x, 0, W - PADDLE_W);

    const b = this.ball;
    if (b.stuck) {
      b.x = this.paddle.x + PADDLE_W / 2;
      b.y = PADDLE_Y - BALL_R - 1;
      if (input.wasPressed('Space', 'ArrowUp', 'KeyW') || p.clicked) this.launch();
      return;
    }
    this.stepBall(dt);
  }

  /** Alt adımlarla ilerleme: her adımda top en fazla yarıçapının yarısı kadar yol alır. */
  stepBall(dt) {
    const b = this.ball;
    const dist = Math.hypot(b.vx, b.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / (BALL_R * 0.5)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.x += b.vx * h;
      b.y += b.vy * h;

      // Duvarlar
      if (b.x - BALL_R < 0) {
        b.x = BALL_R;
        b.vx = Math.abs(b.vx);
        this.sound.beep(320, 0.02, { volume: 0.03 });
      } else if (b.x + BALL_R > W) {
        b.x = W - BALL_R;
        b.vx = -Math.abs(b.vx);
        this.sound.beep(320, 0.02, { volume: 0.03 });
      }
      if (b.y - BALL_R < HUD_HEIGHT) {
        b.y = HUD_HEIGHT + BALL_R;
        b.vy = Math.abs(b.vy);
        this.sound.beep(320, 0.02, { volume: 0.03 });
      }

      // Raket
      if (b.vy > 0) {
        const hit = circleRect(b.x, b.y, BALL_R, { x: this.paddle.x, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H });
        if (hit && b.y < PADDLE_Y + PADDLE_H / 2) {
          const v = paddleBounce(b.x, this.paddle.x, PADDLE_W, Math.hypot(b.vx, b.vy));
          b.vx = v.vx;
          b.vy = v.vy;
          b.y = PADDLE_Y - BALL_R;
          this.sound.beep(440, 0.04, { type: 'triangle' });
        }
      }

      // Tuğlalar (adım başına en fazla bir çarpışma)
      for (const brick of this.bricks) {
        if (brick.hp <= 0) continue;
        const hit = circleRect(b.x, b.y, BALL_R, brick);
        if (!hit) continue;
        if (hit.axis === 'x') {
          b.vx = Math.abs(b.vx) * hit.sign;
          b.x += hit.depth * hit.sign;
        } else {
          b.vy = Math.abs(b.vy) * hit.sign;
          b.y += hit.depth * hit.sign;
        }
        this.hitBrick(brick);
        break;
      }
      if (this.alive === 0) {
        this.nextLevel();
        return;
      }

      // Alt kenar: can kaybı
      if (b.y - BALL_R > H) {
        this.loseLife();
        return;
      }
    }
  }

  hitBrick(brick) {
    brick.hp--;
    if (brick.hp > 0) {
      this.sound.beep(700, 0.03, { type: 'square', volume: 0.04 });
      return;
    }
    this.alive--;
    this.score += brick.points * (brick.maxHp > 1 ? 2 : 1);
    this.sound.beep(500 + (BRICK_ROWS - brick.row) * 60, 0.05, { type: 'square' });
    const color = ROW_COLORS[brick.row % ROW_COLORS.length];
    for (let i = 0; i < 8 && this.particles.length < 160; i++) {
      this.particles.push({
        x: brick.x + Math.random() * brick.w, y: brick.y + Math.random() * brick.h,
        vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.5, color,
      });
    }
  }

  nextLevel() {
    this.score += 100 * this.level;
    this.level++;
    this.sound.win();
    this.buildLevel();
  }

  loseLife() {
    this.lives--;
    if (this.lives <= 0) {
      this.gameOver(false);
      return;
    }
    this.sound.beep(200, 0.2, { type: 'sawtooth', slide: -120 });
    this.resetBall();
  }

  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 400 * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }

  draw() {
    const ctx = this.ctx;
    // Tuğlalar
    for (const brick of this.bricks) {
      if (brick.hp <= 0) continue;
      const color = ROW_COLORS[brick.row % ROW_COLORS.length];
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = brick.hp > 1 ? 0.5 : 0.25;
      ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(brick.x + 1, brick.y + 1, brick.w - 2, brick.h - 2);
      if (brick.hp > 1) ctx.strokeRect(brick.x + 5, brick.y + 5, brick.w - 10, brick.h - 10);
      ctx.restore();
    }

    // Parçacıklar
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // Raket
    ctx.save();
    ctx.fillStyle = NEON.cyan;
    ctx.shadowColor = NEON.cyan;
    ctx.shadowBlur = 16;
    ctx.fillRect(this.paddle.x, PADDLE_Y, PADDLE_W, PADDLE_H);
    ctx.restore();

    // Top
    const b = this.ball;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = NEON.yellow;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (b.stuck && this.state === 'playing') {
      this.text('Space / dokun ile fırlat', W / 2, PADDLE_Y - 60, { size: 15, color: NEON.yellow });
    }

    this.drawHUD(`SEVİYE ${this.level}  CAN ${'●'.repeat(Math.max(0, this.lives))}`);
  }
}
