import { BaseGame, NEON, HUD_HEIGHT, clamp, roundRect } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

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

/* ---------------- Güçlendirmeler ---------------- */

/**
 * Tuğla kırılınca düşebilen güçlendirmeler. weight: çıkma ağırlığı, duration: süreli etkiler (sn).
 * multi: her top üçe bölünür · wide: raket genişler · laser: raket otomatik lazer atar
 * slow: toplar yavaşlar · fire: top tuğlaları sekmeden deler · life: +1 can
 */
export const POWERUPS = {
  multi: { color: NEON.cyan, glyph: '×3', weight: 3 },
  wide: { color: NEON.green, glyph: '↔', weight: 3, duration: 12 },
  laser: { color: NEON.red, glyph: '⇡', weight: 2, duration: 8 },
  slow: { color: NEON.blue, glyph: 'S', weight: 2, duration: 8 },
  fire: { color: NEON.orange, glyph: 'F', weight: 1.5, duration: 6 },
  life: { color: NEON.pink, glyph: '♥', weight: 0.7 },
};
export const DROP_RATES = { off: 0, normal: 0.16, lots: 0.32 };
export const MAX_BALLS = 12;
const WIDE_W = 160;
const DROP_SPEED = 170;
const DROP_W = 36;
const DROP_H = 16;
const SLOW_FACTOR = 0.6;
const LASER_SPEED = 900;
const LASER_EVERY = 0.4;
const MAX_LIVES = 5;

/** chance olasılıkla ağırlıklı rastgele bir güçlendirme türü, yoksa null (saf). */
export function pickPowerUp(rng = Math.random, chance = DROP_RATES.normal) {
  if (chance <= 0 || rng() >= chance) return null;
  const entries = Object.entries(POWERUPS);
  const total = entries.reduce((s, [, p]) => s + p.weight, 0);
  let roll = rng() * total;
  for (const [type, p] of entries) {
    roll -= p.weight;
    if (roll < 0) return type;
  }
  return entries[entries.length - 1][0];
}

/**
 * Topu `count` topa böler: biri aynı yönde, diğerleri ±spread radyan döndürülmüş, hepsi aynı hızda (saf).
 * Neredeyse yatay giden kopyalar olmasın diye dikey bileşen hızın en az %30'u tutulur.
 */
export function splitBall(ball, count = 3, spread = 0.4) {
  const speed = Math.hypot(ball.vx, ball.vy) || 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i - (count - 1) / 2) * spread;
    let vx = ball.vx * Math.cos(a) - ball.vy * Math.sin(a);
    let vy = ball.vx * Math.sin(a) + ball.vy * Math.cos(a);
    const minVy = speed * 0.3;
    if (Math.abs(vy) < minVy) {
      vy = (vy < 0 || (vy === 0 && ball.vy <= 0) ? -1 : 1) * minVy;
      vx = Math.sign(vx || 1) * Math.sqrt(speed * speed - vy * vy);
    }
    out.push({ x: ball.x, y: ball.y, vx, vy, stuck: false });
  }
  return out;
}

/* ---------------- Oyun ---------------- */

export class BreakoutGame extends BaseGame {
  static meta = {
    id: 'breakout',
    get title() { return t('breakout.title'); },
    width: W,
    height: H,
    theme: [NEON.pink, NEON.orange],
    get controls() { return t('breakout.controls'); },
    get description() { return t('breakout.description'); },
  };

  static settings = [
    {
      id: 'powerups', labelKey: 'set.powerups', live: true, default: 'normal',
      options: [
        { value: 'off', labelKey: 'breakout.pu.off' },
        { value: 'normal', labelKey: 'breakout.pu.normal' },
        { value: 'lots', labelKey: 'breakout.pu.lots' },
      ],
    },
  ];

  constructor(engine) {
    super(engine);
    this.rng = Math.random; // testlerde tohumlu üreteçle değiştirilebilir
  }

  reset() {
    super.reset();
    this.level = 1;
    this.lives = LIVES;
    this.paddle = { x: (W - PADDLE_W) / 2 };
    this.paddleW = PADDLE_W;
    this.particles = [];
    this.lastPointerX = null;
    this.buildLevel();
  }

  /** Geriye uyumluluk ve testler: ilk top. Atama tüm topları bu topla değiştirir. */
  get ball() {
    return this.balls[0];
  }
  set ball(b) {
    this.balls = [b];
  }

  get paddleTargetW() {
    return this.effects.wide > 0 ? WIDE_W : PADDLE_W;
  }

  clearPowerUps() {
    this.drops = [];
    this.lasers = [];
    this.laserTimer = 0;
    this.effects = { wide: 0, laser: 0, slow: 0, fire: 0 };
    this.flash = null;
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
    this.clearPowerUps();
    this.resetBall();
  }

  resetBall() {
    this.speed = levelSpeed(this.level);
    this.balls = [{ x: this.paddle.x + this.paddleW / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true }];
  }

  start() {
    super.start();
    this.launch();
  }

  launch() {
    let launched = false;
    for (const b of this.balls) {
      if (!b.stuck) continue;
      const a = (Math.random() * 2 - 1) * 0.35;
      b.vx = Math.sin(a) * this.speed;
      b.vy = -Math.cos(a) * this.speed;
      b.stuck = false;
      launched = true;
    }
    if (launched) this.sound.beep(600, 0.05);
  }

  update(dt) {
    this.updateParticles(dt);
    if (super.update(dt)) return;
    const input = this.input;
    const p = input.pointer;

    // Süreli etkiler ve raket genişliği (yumuşak geçiş)
    for (const k of Object.keys(this.effects)) this.effects[k] = Math.max(0, this.effects[k] - dt);
    const center = this.paddle.x + this.paddleW / 2;
    this.paddleW += (this.paddleTargetW - this.paddleW) * Math.min(1, dt * 10);
    this.paddle.x = center - this.paddleW / 2;

    // Raket: klavye ya da imleç
    let dir = 0;
    if (input.isDown('ArrowLeft', 'KeyA')) dir -= 1;
    if (input.isDown('ArrowRight', 'KeyD')) dir += 1;
    if (dir) this.paddle.x += dir * PADDLE_SPEED * dt;
    if ((p.type === 'mouse' && p.hover && p.x !== this.lastPointerX) || p.isDown) {
      this.paddle.x = p.x - this.paddleW / 2;
    }
    this.lastPointerX = p.x;
    this.paddle.x = clamp(this.paddle.x, 0, W - this.paddleW);

    this.updateDrops(dt);
    if (this.state !== 'playing') return;
    this.updateLasers(dt);
    if (this.state !== 'playing' || this.alive === 0) return;

    const stuck = this.balls.some((b) => b.stuck);
    for (const b of this.balls) {
      if (!b.stuck) continue;
      b.x = this.paddle.x + this.paddleW / 2;
      b.y = PADDLE_Y - BALL_R - 1;
    }
    if (stuck) {
      if (input.wasPressed('Space', 'ArrowUp', 'KeyW') || p.clicked) this.launch();
      return;
    }
    this.stepBall(this.effects.slow > 0 ? dt * SLOW_FACTOR : dt);
  }

  /**
   * Tüm topları alt adımlarla ilerletir: her adımda top en fazla yarıçapının yarısı kadar yol alır.
   * Alttan çıkan top kaybolur; hiç top kalmazsa can gider.
   */
  stepBall(dt) {
    const lost = new Set();
    for (const b of this.balls) {
      if (b.stuck) continue;
      const res = this.stepOneBall(b, dt);
      if (res === 'level') return;
      if (res === 'lost') lost.add(b);
    }
    if (!lost.size) return;
    this.balls = this.balls.filter((b) => !lost.has(b));
    if (!this.balls.length) this.loseLife();
  }

  /** Tek topu ilerletir. Dönen: 'level' (seviye bitti), 'lost' (alttan çıktı) ya da undefined. */
  stepOneBall(b, dt) {
    const dist = Math.hypot(b.vx, b.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / (BALL_R * 0.5)));
    const h = dt / steps;
    const fire = this.effects.fire > 0;
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
        const hit = circleRect(b.x, b.y, BALL_R, { x: this.paddle.x, y: PADDLE_Y, w: this.paddleW, h: PADDLE_H });
        if (hit && b.y < PADDLE_Y + PADDLE_H / 2) {
          const v = paddleBounce(b.x, this.paddle.x, this.paddleW, Math.hypot(b.vx, b.vy));
          b.vx = v.vx;
          b.vy = v.vy;
          b.y = PADDLE_Y - BALL_R;
          this.sound.beep(440, 0.04, { type: 'triangle' });
        }
      }

      // Tuğlalar (adım başına en fazla bir çarpışma). Ateş topu sekmeden deler.
      for (const brick of this.bricks) {
        if (brick.hp <= 0) continue;
        const hit = circleRect(b.x, b.y, BALL_R, brick);
        if (!hit) continue;
        if (fire) {
          while (brick.hp > 0) this.hitBrick(brick);
        } else {
          if (hit.axis === 'x') {
            b.vx = Math.abs(b.vx) * hit.sign;
            b.x += hit.depth * hit.sign;
          } else {
            b.vy = Math.abs(b.vy) * hit.sign;
            b.y += hit.depth * hit.sign;
          }
          this.hitBrick(brick);
        }
        break;
      }
      if (this.alive === 0) {
        this.nextLevel();
        return 'level';
      }

      // Alt kenar
      if (b.y - BALL_R > H) return 'lost';
    }
    return undefined;
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
    const type = pickPowerUp(this.rng, DROP_RATES[this.settings.powerups] ?? 0);
    if (type && this.alive > 0) this.drops.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, type });
  }

  updateDrops(dt) {
    const px = this.paddle.x;
    const pw = this.paddleW;
    const keep = [];
    for (const d of this.drops) {
      d.y += DROP_SPEED * dt;
      const caught = d.y + DROP_H / 2 >= PADDLE_Y && d.y - DROP_H / 2 <= PADDLE_Y + PADDLE_H
        && d.x + DROP_W / 2 >= px && d.x - DROP_W / 2 <= px + pw;
      if (caught) this.applyPowerUp(d.type);
      else if (d.y - DROP_H / 2 < H) keep.push(d);
    }
    this.drops = keep;
  }

  applyPowerUp(type) {
    const def = POWERUPS[type];
    if (!def) return;
    this.score += 25;
    this.sound.seq([[720, 0.05], [1080, 0.08]], { type: 'triangle' });
    if (def.duration) this.effects[type] = def.duration;
    if (type === 'multi') {
      const room = MAX_BALLS - this.balls.length;
      const extra = [];
      for (const b of this.balls) {
        if (b.stuck || extra.length >= room) continue;
        extra.push(...splitBall(b, 3).slice(1, 1 + Math.min(2, room - extra.length)));
      }
      this.balls.push(...extra);
    } else if (type === 'life') {
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
    } else if (type === 'laser') {
      this.laserTimer = 0;
    }
    this.flash = { type, t: 0.9 };
  }

  updateLasers(dt) {
    if (this.effects.laser > 0) {
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.laserTimer = LASER_EVERY;
        this.lasers.push({ x: this.paddle.x + 6, y: PADDLE_Y }, { x: this.paddle.x + this.paddleW - 6, y: PADDLE_Y });
        this.sound.beep(1200, 0.03, { type: 'square', volume: 0.03, slide: -400 });
      }
    }
    const keep = [];
    for (const l of this.lasers) {
      l.y -= LASER_SPEED * dt;
      const brick = this.bricks.find((br) => br.hp > 0 && l.x >= br.x && l.x <= br.x + br.w && l.y <= br.y + br.h && l.y + 12 >= br.y);
      if (brick) {
        this.hitBrick(brick);
        if (this.alive === 0) {
          this.nextLevel();
          return;
        }
      } else if (l.y > HUD_HEIGHT) {
        keep.push(l);
      }
    }
    this.lasers = keep;
  }

  nextLevel() {
    this.score += 100 * this.level;
    this.level++;
    this.sound.win();
    this.buildLevel();
  }

  loseLife() {
    this.lives--;
    this.clearPowerUps();
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
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }
  }

  drawCapsule(x, y, type, alpha = 1) {
    const ctx = this.ctx;
    const def = POWERUPS[type];
    ctx.save();
    ctx.globalAlpha = alpha;
    roundRect(ctx, x - DROP_W / 2, y - DROP_H / 2, DROP_W, DROP_H, DROP_H / 2);
    ctx.fillStyle = 'rgba(10, 10, 24, 0.9)';
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    this.text(def.glyph, x, y + 1, { size: 12, color: def.color });
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

    // Düşen güçlendirmeler ve lazerler
    for (const d of this.drops) this.drawCapsule(d.x, d.y, d.type);
    if (this.lasers.length) {
      ctx.save();
      ctx.strokeStyle = NEON.red;
      ctx.shadowColor = NEON.red;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const l of this.lasers) {
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x, l.y + 12);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Raket (lazer etkisinde iki uçta namlu)
    const pc = this.effects.wide > 0 ? NEON.green : NEON.cyan;
    ctx.save();
    ctx.fillStyle = pc;
    ctx.shadowColor = pc;
    ctx.shadowBlur = 16;
    ctx.fillRect(this.paddle.x, PADDLE_Y, this.paddleW, PADDLE_H);
    if (this.effects.laser > 0) {
      ctx.fillStyle = NEON.red;
      ctx.shadowColor = NEON.red;
      ctx.fillRect(this.paddle.x + 3, PADDLE_Y - 7, 6, 7);
      ctx.fillRect(this.paddle.x + this.paddleW - 9, PADDLE_Y - 7, 6, 7);
    }
    ctx.restore();

    // Toplar (ateş topu turuncu parlar)
    const fire = this.effects.fire > 0;
    ctx.save();
    ctx.fillStyle = fire ? '#ffd2a8' : '#ffffff';
    ctx.shadowColor = fire ? NEON.orange : NEON.yellow;
    ctx.shadowBlur = fire ? 22 : 14;
    for (const b of this.balls) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (this.balls.some((b) => b.stuck) && this.state === 'playing') {
      this.text(t('breakout.launch'), W / 2, PADDLE_Y - 60, { size: 15, color: NEON.yellow, maxWidth: W - 40 });
    }

    // Etkin güçlendirme adı (kısa süre) ve süreli etkilerin kalan süre çubukları
    if (this.flash) {
      const def = POWERUPS[this.flash.type];
      this.text(t(`breakout.pu.${this.flash.type}`), W / 2, PADDLE_Y - 100, {
        size: 20, color: def.color, glow: 12, maxWidth: W - 40,
      });
    }
    let x = 12;
    for (const [type, left] of Object.entries(this.effects)) {
      if (left <= 0) continue;
      const def = POWERUPS[type];
      const y = H - 18;
      this.drawCapsule(x + DROP_W / 2, y, type, left < 2 ? 0.5 + 0.5 * Math.sin(this.time * 16) : 1);
      ctx.fillStyle = def.color;
      ctx.fillRect(x + DROP_W + 4, y - 2, 40 * (left / def.duration), 4);
      x += DROP_W + 52;
    }

    this.drawHUD(t('breakout.hud', { level: this.level, lives: '●'.repeat(Math.max(0, this.lives)) }));
  }
}
