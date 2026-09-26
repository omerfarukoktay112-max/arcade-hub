import { BaseGame, NEON, clamp } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

const W = 800;
const H = 500;
const PADDLE_W = 12;
const PADDLE_H = 90;
const PADDLE_SPEED = 460;
const TOUCH_SPEED = 1100;
const BALL = 12;
const BALL_SPEED = 380;
const BALL_MAX = 950;
const SPEEDUP = 1.06;
const MAX_ANGLE = (55 * Math.PI) / 180;
const WIN_SCORE = 7;
const SERVE_DELAY = 0.9;

const AI_SPEED = 330;
const AI_REACTION = 0.12;

/* ---------------- Saf mantık ---------------- */

/**
 * Raket isabet noktasına göre yeni hız vektörü.
 * rel ∈ [-1, 1]: raketin ortasına göre çarpma konumu. dir: +1 sağa, -1 sola.
 */
export function bounceVelocity(ballCenterY, paddleY, paddleH, speed, dir) {
  const rel = clamp((ballCenterY - (paddleY + paddleH / 2)) / (paddleH / 2), -1, 1);
  const angle = rel * MAX_ANGLE;
  return { vx: Math.cos(angle) * speed * dir, vy: Math.sin(angle) * speed };
}

/** Topun hedef x'e vardığında y konumunu duvar yansımalarıyla tahmin eder. */
export function predictY(x, y, vx, vy, targetX, height = H, size = BALL) {
  if (vx === 0) return y;
  const t = (targetX - x) / vx;
  if (t < 0) return y;
  const span = height - size;
  let py = y + vy * t;
  const period = span * 2;
  py = ((py % period) + period) % period;
  return py > span ? period - py : py;
}

/* ---------------- Oyun ---------------- */

export class PongGame extends BaseGame {
  static meta = {
    id: 'pong',
    get title() { return t('pong.title'); },
    width: W,
    height: H,
    hasScore: false,
    theme: [NEON.text, NEON.cyan],
    get controls() { return t('pong.controls'); },
    get description() { return t('pong.description'); },
  };

  constructor(engine) {
    super(engine);
    this.mode = this.storage.get('pong:mode', 1) === 2 ? 2 : 1;
    this.menuButtons = [
      { get label() { return t('mode.1p'); }, key: 'Digit1', selected: () => this.mode === 1, onClick: () => this.setMode(1) },
      { get label() { return t('mode.2p'); }, key: 'Digit2', selected: () => this.mode === 2, onClick: () => this.setMode(2) },
    ];
    this.overlayDelay = 0.3;
  }

  setMode(mode) {
    this.mode = mode;
    this.storage.set('pong:mode', mode);
  }

  reset() {
    super.reset();
    this.p1 = { y: (H - PADDLE_H) / 2, x: 24 };
    this.p2 = { y: (H - PADDLE_H) / 2, x: W - 24 - PADDLE_W };
    this.s1 = 0;
    this.s2 = 0;
    this.winner = 0;
    this.ai = { target: H / 2, timer: 0 };
    this.trail = [];
    this.flash = 0;
    this.serve(Math.random() < 0.5 ? 1 : -1);
  }

  serve(dir) {
    this.ball = { x: (W - BALL) / 2, y: (H - BALL) / 2, vx: 0, vy: 0, speed: BALL_SPEED };
    this.serveDir = dir;
    this.serveTimer = SERVE_DELAY;
    this.trail = [];
  }

  launch() {
    const angle = (Math.random() * 2 - 1) * 0.35;
    const b = this.ball;
    b.vx = Math.cos(angle) * b.speed * this.serveDir;
    b.vy = Math.sin(angle) * b.speed;
  }

  movePaddle(p, dir, dt) {
    p.y = clamp(p.y + dir * PADDLE_SPEED * dt, 0, H - PADDLE_H);
  }

  followTouch(p, targetY, dt) {
    const target = clamp(targetY - PADDLE_H / 2, 0, H - PADDLE_H);
    const step = TOUCH_SPEED * dt;
    p.y += clamp(target - p.y, -step, step);
  }

  updateAI(dt) {
    const ai = this.ai;
    const b = this.ball;
    ai.timer -= dt;
    if (ai.timer <= 0) {
      // Gecikmeli karar: yalnızca belirli aralıklarla hedef güncellenir, hatalı tahmin payı vardır.
      ai.timer = AI_REACTION;
      if (b.vx > 0) {
        const err = (Math.random() * 2 - 1) * (18 + b.speed * 0.05);
        ai.target = predictY(b.x, b.y, b.vx, b.vy, this.p2.x - BALL) + BALL / 2 + err;
      } else {
        ai.target = H / 2;
      }
    }
    const center = this.p2.y + PADDLE_H / 2;
    const diff = ai.target - center;
    if (Math.abs(diff) > 8) this.p2.y = clamp(this.p2.y + Math.sign(diff) * Math.min(Math.abs(diff), AI_SPEED * dt), 0, H - PADDLE_H);
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    if (super.update(dt)) return;
    const input = this.input;
    const p = input.pointer;

    // Oyuncu 1
    let d1 = 0;
    if (input.isDown('KeyW') || (this.mode === 1 && input.isDown('ArrowUp'))) d1 -= 1;
    if (input.isDown('KeyS') || (this.mode === 1 && input.isDown('ArrowDown'))) d1 += 1;
    this.movePaddle(this.p1, d1, dt);

    // Oyuncu 2 / yapay zekâ
    if (this.mode === 2) {
      let d2 = 0;
      if (input.isDown('ArrowUp')) d2 -= 1;
      if (input.isDown('ArrowDown')) d2 += 1;
      this.movePaddle(this.p2, d2, dt);
    } else {
      this.updateAI(dt);
    }

    // Dokunma/fare: sol yarı oyuncu 1, 2 oyunculu modda sağ yarı oyuncu 2
    if (p.isDown) {
      if (this.mode === 2 && p.x > W / 2) this.followTouch(this.p2, p.y, dt);
      else this.followTouch(this.p1, p.y, dt);
    }

    if (this.serveTimer > 0) {
      this.serveTimer -= dt;
      if (this.serveTimer <= 0) this.launch();
      return;
    }
    this.stepBall(dt);
  }

  stepBall(dt) {
    const b = this.ball;
    // Alt adımlar: hızlı topun raketin içinden geçmesini engeller.
    const steps = Math.max(1, Math.ceil((b.speed * dt) / 5));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.y < 0) {
        b.y = 0;
        b.vy = Math.abs(b.vy);
        this.sound.beep(300, 0.03, { volume: 0.04 });
      } else if (b.y + BALL > H) {
        b.y = H - BALL;
        b.vy = -Math.abs(b.vy);
        this.sound.beep(300, 0.03, { volume: 0.04 });
      }
      if (b.vx < 0 && this.hitPaddle(this.p1)) {
        b.x = this.p1.x + PADDLE_W;
        this.bounce(this.p1, 1);
      } else if (b.vx > 0 && this.hitPaddle(this.p2)) {
        b.x = this.p2.x - BALL;
        this.bounce(this.p2, -1);
      }
      if (b.x + BALL < 0) return this.point(2);
      if (b.x > W) return this.point(1);
    }
    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > 8) this.trail.shift();
  }

  hitPaddle(p) {
    const b = this.ball;
    return b.x < p.x + PADDLE_W && b.x + BALL > p.x && b.y < p.y + PADDLE_H && b.y + BALL > p.y;
  }

  bounce(p, dir) {
    const b = this.ball;
    b.speed = Math.min(BALL_MAX, b.speed * SPEEDUP);
    const v = bounceVelocity(b.y + BALL / 2, p.y, PADDLE_H, b.speed, dir);
    b.vx = v.vx;
    b.vy = v.vy;
    this.sound.beep(dir > 0 ? 520 : 440, 0.04);
  }

  point(player) {
    if (player === 1) this.s1++;
    else this.s2++;
    this.flash = 0.3;
    this.sound.beep(player === 1 ? 880 : 220, 0.12, { type: 'triangle' });
    if (this.s1 >= WIN_SCORE || this.s2 >= WIN_SCORE) {
      this.winner = this.s1 > this.s2 ? 1 : 2;
      this.gameOver(this.mode === 2 || this.winner === 1);
      return;
    }
    this.serve(player === 1 ? -1 : 1); // sayıyı kaybeden tarafa servis
  }

  overlayContent() {
    const c = super.overlayContent();
    if (this.state === 'ready') {
      c.lines = [{ text: t('pong.ready', { n: WIN_SCORE }), color: NEON.dim }];
      return c;
    }
    if (this.mode === 2) c.title = t('common.playerWins', { n: this.winner });
    else c.title = this.winner === 1 ? t('ov.won') : t('ov.lost');
    c.color = this.winner === 1 ? NEON.cyan : NEON.pink;
    c.lines = [{ text: `${this.s1}  –  ${this.s2}`, color: NEON.text }];
    return c;
  }

  draw() {
    const ctx = this.ctx;
    // Orta çizgi
    ctx.save();
    ctx.strokeStyle = 'rgba(236, 235, 255, 0.18)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flash * 0.15})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Skorlar
    this.text(String(this.s1), W / 2 - 70, 56, { size: 56, color: 'rgba(34, 228, 255, 0.55)' });
    this.text(String(this.s2), W / 2 + 70, 56, { size: 56, color: 'rgba(255, 46, 136, 0.55)' });
    this.text(this.mode === 1 ? t('common.YOU') : t('common.PLAYER', { n: 1 }), W / 4, 22, { size: 13, color: NEON.dim });
    this.text(this.mode === 1 ? t('common.COMPUTER') : t('common.PLAYER', { n: 2 }), (W * 3) / 4, 22, { size: 13, color: NEON.dim });

    // Raketler
    const paddle = (p, color) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillRect(p.x, p.y, PADDLE_W, PADDLE_H);
      ctx.restore();
    };
    paddle(this.p1, NEON.cyan);
    paddle(this.p2, NEON.pink);

    // Top ve iz
    const b = this.ball;
    this.trail.forEach((t, i) => {
      ctx.fillStyle = `rgba(255, 225, 77, ${(i / this.trail.length) * 0.25})`;
      ctx.fillRect(t.x, t.y, BALL, BALL);
    });
    if (!(this.serveTimer > 0 && Math.floor(this.serveTimer * 8) % 2 === 1)) {
      ctx.save();
      ctx.fillStyle = NEON.yellow;
      ctx.shadowColor = NEON.yellow;
      ctx.shadowBlur = 14;
      ctx.fillRect(b.x, b.y, BALL, BALL);
      ctx.restore();
    }
  }
}
