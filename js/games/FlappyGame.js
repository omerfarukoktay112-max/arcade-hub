import { BaseGame, NEON, HUD_HEIGHT, clamp } from '../core/BaseGame.js';

const W = 400;
const H = 600;
export const GROUND_Y = 550;
export const CEILING_Y = HUD_HEIGHT;
export const GRAVITY = 1500; // px/s²
export const FLAP_VELOCITY = -430; // px/s
const MAX_FALL = 720;
export const BIRD_X = 110;
export const BIRD_R = 14;
export const PIPE_W = 66;
const PIPE_SPACING = 220;
const PIPE_SPEED = 170;
export const GAP_MIN = 138;
export const GAP_MAX = 178;
const EDGE = 50; // boşluğun tavana/zemine en az uzaklığı

/* ---------------- Saf mantık ---------------- */

/** dt tabanlı dikey fizik (yarı kapalı Euler). */
export function birdStep(y, vy, dt) {
  const nvy = Math.min(MAX_FALL, vy + GRAVITY * dt);
  return { y: y + nvy * dt, vy: nvy };
}

/** Rastgele boşluk yüksekliği ve konumuyla boru. */
export function makePipe(x, rng = Math.random) {
  const gapH = GAP_MIN + rng() * (GAP_MAX - GAP_MIN);
  const minY = CEILING_Y + EDGE;
  const maxY = GROUND_Y - EDGE - gapH;
  const gapY = minY + rng() * (maxY - minY);
  return { x, gapY, gapH, passed: false };
}

function circleHitsRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/** Kuş (daire) boruya çarpıyor mu? Üst boru: CEILING..gapY, alt boru: gapY+gapH..GROUND */
export function hitsPipe(birdY, pipe, r = BIRD_R * 0.85) {
  return (
    circleHitsRect(BIRD_X, birdY, r, pipe.x, CEILING_Y - 1000, PIPE_W, pipe.gapY - CEILING_Y + 1000) ||
    circleHitsRect(BIRD_X, birdY, r, pipe.x, pipe.gapY + pipe.gapH, PIPE_W, GROUND_Y - (pipe.gapY + pipe.gapH))
  );
}

/* ---------------- Oyun ---------------- */

export class FlappyGame extends BaseGame {
  static meta = {
    id: 'flappy',
    title: 'Flappy Bird',
    width: W,
    height: H,
    controls: 'Space / ↑ / tıkla / dokun: zıpla',
    description: 'Boruların arasındaki boşluklardan geç. Her boru +1 puan; zemine ya da boruya çarpma.',
  };

  constructor(engine) {
    super(engine);
    this.overlayDelay = 0.6;
    // Arka plan yıldızları (sabit, deterministik)
    this.stars = Array.from({ length: 40 }, (_, i) => ({
      x: (i * 97) % W, y: CEILING_Y + ((i * 53) % (GROUND_Y - CEILING_Y - 60)), s: 1 + (i % 3),
    }));
  }

  reset() {
    super.reset();
    this.bird = { y: 270, vy: 0, rot: 0 };
    this.pipes = [];
    this.scroll = 0;
    this.nextPipeIn = 0;
  }

  start() {
    super.start();
    this.pipes = [makePipe(W + 40)];
    this.nextPipeIn = PIPE_SPACING;
    this.flap();
  }

  flap() {
    this.bird.vy = FLAP_VELOCITY;
    this.sound.beep(620, 0.05, { type: 'triangle', slide: 240 });
  }

  update(dt) {
    const bird = this.bird;
    if (this.state === 'ready') {
      bird.y = 270 + Math.sin(this.time * 3) * 8;
      bird.rot = 0;
      this.scroll += PIPE_SPEED * dt * 0.5;
    } else if (this.state === 'over' && bird.y < GROUND_Y - BIRD_R) {
      // Çarpıştıktan sonra kuş zemine düşer
      const s = birdStep(bird.y, Math.max(bird.vy, 0), dt);
      bird.y = Math.min(GROUND_Y - BIRD_R, s.y);
      bird.vy = s.vy;
      bird.rot = Math.min(Math.PI / 2, bird.rot + dt * 6);
    }
    if (super.update(dt)) return;

    const input = this.input;
    if (input.wasPressed('Space', 'ArrowUp', 'KeyW') || input.pointer.pressed) this.flap();

    const s = birdStep(bird.y, bird.vy, dt);
    bird.y = s.y;
    bird.vy = s.vy;
    if (bird.y - BIRD_R < CEILING_Y) {
      bird.y = CEILING_Y + BIRD_R;
      bird.vy = Math.max(0, bird.vy);
    }
    bird.rot = clamp(bird.vy / 600, -0.5, 1.4);

    // Borular
    const dx = PIPE_SPEED * dt;
    this.scroll += dx;
    for (const p of this.pipes) p.x -= dx;
    this.nextPipeIn -= dx;
    if (this.nextPipeIn <= 0) {
      this.pipes.push(makePipe(W + 10));
      this.nextPipeIn += PIPE_SPACING;
    }
    this.pipes = this.pipes.filter((p) => p.x + PIPE_W > -10);

    for (const p of this.pipes) {
      if (!p.passed && p.x + PIPE_W / 2 < BIRD_X) {
        p.passed = true;
        this.score++;
        this.sound.beep(880, 0.06, { type: 'square' });
      }
      if (hitsPipe(bird.y, p)) {
        this.crash();
        return;
      }
    }
    if (bird.y + BIRD_R >= GROUND_Y) {
      bird.y = GROUND_Y - BIRD_R;
      this.crash();
    }
  }

  crash() {
    this.sound.beep(140, 0.2, { type: 'sawtooth', slide: -80 });
    this.gameOver(false);
  }

  draw() {
    const ctx = this.ctx;
    // Gökyüzü
    const g = ctx.createLinearGradient(0, CEILING_Y, 0, GROUND_Y);
    g.addColorStop(0, '#0a0620');
    g.addColorStop(1, '#1a0b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, CEILING_Y, W, GROUND_Y - CEILING_Y);
    ctx.fillStyle = 'rgba(236, 235, 255, 0.5)';
    for (const s of this.stars) {
      const x = (((s.x - this.scroll * 0.1 * s.s) % W) + W) % W;
      ctx.fillRect(x, s.y, s.s, s.s);
    }

    // Borular
    for (const p of this.pipes) {
      const drawPipe = (y, h, capY) => {
        ctx.save();
        ctx.fillStyle = 'rgba(57, 255, 136, 0.14)';
        ctx.fillRect(p.x, y, PIPE_W, h);
        ctx.strokeStyle = NEON.green;
        ctx.lineWidth = 2;
        ctx.shadowColor = NEON.green;
        ctx.shadowBlur = 10;
        ctx.strokeRect(p.x + 1, y, PIPE_W - 2, h);
        ctx.fillStyle = '#0d2a1c';
        ctx.fillRect(p.x - 5, capY, PIPE_W + 10, 18);
        ctx.strokeRect(p.x - 5, capY, PIPE_W + 10, 18);
        ctx.restore();
      };
      drawPipe(CEILING_Y, p.gapY - CEILING_Y, p.gapY - 18);
      drawPipe(p.gapY + p.gapH, GROUND_Y - p.gapY - p.gapH, p.gapY + p.gapH);
    }

    // Zemin
    ctx.fillStyle = '#120a1f';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = NEON.pink;
    ctx.fillRect(0, GROUND_Y, W, 2);
    ctx.strokeStyle = 'rgba(255, 46, 136, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const off = this.scroll % 24;
    for (let x = -off; x < W + 24; x += 24) {
      ctx.moveTo(x, GROUND_Y + 4);
      ctx.lineTo(x - 14, H);
    }
    ctx.stroke();

    this.drawBird();
    this.drawHUD();
    if (this.state === 'playing') {
      this.text(String(this.score), W / 2, 100, { size: 48, color: 'rgba(255, 255, 255, 0.85)', glow: 12 });
    }
  }

  drawBird() {
    const ctx = this.ctx;
    const b = this.bird;
    ctx.save();
    ctx.translate(BIRD_X, b.y);
    ctx.rotate(b.rot);
    ctx.shadowColor = NEON.yellow;
    ctx.shadowBlur = 16;
    ctx.fillStyle = NEON.yellow;
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Kanat
    const flapPhase = this.state === 'over' ? 0 : Math.sin(this.time * 22);
    ctx.fillStyle = NEON.orange;
    ctx.beginPath();
    ctx.ellipse(-4, 3, 8, 4 + flapPhase * 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Göz
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = NEON.bg;
    ctx.beginPath();
    ctx.arc(7.5, -5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Gaga
    ctx.fillStyle = NEON.pink;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(21, 3);
    ctx.lineTo(11, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
