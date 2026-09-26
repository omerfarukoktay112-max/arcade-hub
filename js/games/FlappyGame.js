import { BaseGame, NEON, HUD_HEIGHT, clamp } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

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
/** Ardışık iki boşluk arasındaki en büyük dikey kayma (her zaman yetişilebilir kalsın). */
export const MAX_GAP_SHIFT = 130;

/* ---------------- Saf mantık ---------------- */

/** dt tabanlı dikey fizik (yarı kapalı Euler). */
export function birdStep(y, vy, dt) {
  const nvy = Math.min(MAX_FALL, vy + GRAVITY * dt);
  return { y: y + nvy * dt, vy: nvy };
}

/**
 * Rastgele boşluk yüksekliği ve konumuyla boru. prevGapY verilirse yeni boşluk
 * öncekinden en fazla MAX_GAP_SHIFT kadar kayar.
 */
export function makePipe(x, rng = Math.random, prevGapY = null) {
  const gapH = GAP_MIN + rng() * (GAP_MAX - GAP_MIN);
  let minY = CEILING_Y + EDGE;
  let maxY = GROUND_Y - EDGE - gapH;
  if (prevGapY !== null) {
    minY = Math.max(minY, prevGapY - MAX_GAP_SHIFT);
    maxY = Math.min(maxY, prevGapY + MAX_GAP_SHIFT);
  }
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

/* ---------------- Görünüm ---------------- */

/** Kuş renk paletleri: gövde, kanat, gaga. 'rainbow' gövde tonunu zamanla döndürür. */
export const BIRD_COLORS = {
  yellow: { body: NEON.yellow, wing: NEON.orange, beak: NEON.pink },
  red: { body: NEON.red, wing: '#ffa0aa', beak: NEON.yellow },
  ice: { body: NEON.cyan, wing: NEON.blue, beak: NEON.yellow },
  lime: { body: NEON.green, wing: '#16a35a', beak: NEON.orange },
  purple: { body: NEON.purple, wing: NEON.pink, beak: NEON.yellow },
  ghost: { body: '#e8e8ff', wing: '#9d9dd0', beak: NEON.pink, alpha: 0.7 },
  rainbow: { body: 'rainbow', wing: '#ffffff', beak: NEON.yellow },
};
/** Aksesuarlar (skin): kuşla birlikte döner. */
export const BIRD_SKINS = ['classic', 'crown', 'shades', 'ninja', 'tophat', 'robot'];

/* ---------------- Oyun ---------------- */

export class FlappyGame extends BaseGame {
  static meta = {
    id: 'flappy',
    get title() { return t('flappy.title'); },
    width: W,
    height: H,
    theme: [NEON.yellow, NEON.green],
    get controls() { return t('flappy.controls'); },
    get description() { return t('flappy.description'); },
  };

  static settings = [
    {
      id: 'color', labelKey: 'set.birdColor', type: 'color', live: true, default: 'yellow',
      options: Object.entries(BIRD_COLORS).map(([value, c]) => ({ value, labelKey: `color.${value}`, color: c.body })),
    },
    {
      id: 'skin', labelKey: 'set.birdSkin', live: true, default: 'classic',
      options: BIRD_SKINS.map((value) => ({ value, labelKey: `flappy.skin.${value}` })),
    },
  ];

  constructor(engine) {
    super(engine);
    this.overlayDelay = 0.6;
    this.rng = Math.random; // testlerde tohumlu üreteçle değiştirilebilir
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
    this.pipes = [makePipe(W + 40, this.rng)];
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
      const last = this.pipes[this.pipes.length - 1];
      this.pipes.push(makePipe(W + 10, this.rng, last ? last.gapY : null));
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

  /** Hazır ekranında panel kuşu örttüğü için seçili görünüm panelin üstünde büyütülmüş önizlenir. */
  drawOverlay() {
    super.drawOverlay();
    if (this.state !== 'ready') return;
    const layout = this.overlayLayout();
    if (!layout) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = this.overlayProgress();
    this.drawBird(W / 2, Math.max(CEILING_Y + 40, layout.panel.y - 42) + Math.sin(this.time * 3) * 5, 0, 1.6);
    ctx.restore();
  }

  drawBird(x = BIRD_X, y = this.bird.y, rot = this.bird.rot, scale = 1) {
    const ctx = this.ctx;
    const palette = BIRD_COLORS[this.settings.color] || BIRD_COLORS.yellow;
    const body = palette.body === 'rainbow' ? `hsl(${(this.time * 120) % 360}, 100%, 62%)` : palette.body;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    if (palette.alpha) ctx.globalAlpha *= palette.alpha;
    ctx.shadowColor = body;
    ctx.shadowBlur = 16;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Kanat
    const flapPhase = this.state === 'over' ? 0 : Math.sin(this.time * 22);
    ctx.fillStyle = palette.wing;
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
    ctx.fillStyle = palette.beak;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(21, 3);
    ctx.lineTo(11, 7);
    ctx.closePath();
    ctx.fill();
    this.drawAccessory(this.settings.skin);
    ctx.restore();
  }

  /** Aksesuar, kuşun yerel koordinatlarında (merkez 0,0; yarıçap BIRD_R) çizilir. */
  drawAccessory(skin) {
    const ctx = this.ctx;
    const flutter = this.state === 'over' ? 0 : Math.sin(this.time * 18) * 2;
    switch (skin) {
      case 'crown':
        ctx.fillStyle = NEON.yellow;
        ctx.shadowColor = NEON.yellow;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(-9, -11);
        ctx.lineTo(-10, -23);
        ctx.lineTo(-4, -16);
        ctx.lineTo(0, -25);
        ctx.lineTo(4, -16);
        ctx.lineTo(10, -23);
        ctx.lineTo(9, -11);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = NEON.pink;
        ctx.beginPath();
        ctx.arc(0, -14, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'shades':
        ctx.fillStyle = '#05050a';
        ctx.fillRect(0, -10, 15, 8);
        ctx.fillRect(-6, -8, 7, 2);
        ctx.fillStyle = 'rgba(34, 228, 255, 0.8)';
        ctx.fillRect(3, -9, 5, 2);
        break;
      case 'ninja':
        ctx.fillStyle = NEON.red;
        ctx.fillRect(-13, -11, 26, 5);
        ctx.beginPath();
        ctx.moveTo(-12, -10);
        ctx.lineTo(-25, -15 + flutter);
        ctx.lineTo(-23, -9 + flutter);
        ctx.closePath();
        ctx.moveTo(-12, -8);
        ctx.lineTo(-24, -4 - flutter);
        ctx.lineTo(-20, -1 - flutter);
        ctx.closePath();
        ctx.fill();
        break;
      case 'tophat':
        ctx.fillStyle = '#16162c';
        ctx.strokeStyle = NEON.purple;
        ctx.lineWidth = 1.5;
        ctx.fillRect(-7, -31, 14, 17);
        ctx.strokeRect(-7, -31, 14, 17);
        ctx.fillRect(-12, -15, 24, 4);
        ctx.strokeRect(-12, -15, 24, 4);
        ctx.fillStyle = NEON.pink;
        ctx.fillRect(-7, -19, 14, 3);
        break;
      case 'robot': {
        ctx.strokeStyle = '#c8cbe0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-2, -13);
        ctx.lineTo(-5, -24);
        ctx.stroke();
        const on = Math.sin(this.time * 6) > 0;
        ctx.fillStyle = on ? NEON.red : '#5a1a22';
        ctx.shadowColor = NEON.red;
        ctx.shadowBlur = on ? 10 : 0;
        ctx.beginPath();
        ctx.arc(-5, -25, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#c8cbe0';
        for (const [x, y] of [[-9, 4], [-3, 9]]) {
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default:
        break;
    }
  }
}
