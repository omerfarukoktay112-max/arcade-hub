import { BaseGame, NEON, HUD_HEIGHT, roundRect, shuffle } from '../core/BaseGame.js';

const W = 600;
const H = 650;
export const COLS = 4;
export const ROWS = 4;
export const PAIRS = (COLS * ROWS) / 2;
const CARD = 132;
const GAP = 12;
const GX = (W - (CARD * COLS + GAP * (COLS - 1))) / 2;
const GY = HUD_HEIGHT + 16;
const FLIP_SPEED = 4; // 1 / 0.25 sn
export const MISMATCH_DELAY = 0.8;

const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon', 'ring', 'cross'];
const COLORS = [NEON.cyan, NEON.pink, NEON.yellow, NEON.green, NEON.purple, NEON.orange, NEON.blue, NEON.red];

/* ---------------- Saf mantık ---------------- */

/** 8 çift: her yüz (şekil+renk) tam iki kez, karıştırılmış. */
export function createDeck(rng = Math.random) {
  const faces = [];
  for (let i = 0; i < PAIRS; i++) faces.push(i, i);
  return shuffle(faces, rng);
}

/** Daha az hamle → daha çok puan. En iyi durum (8 hamle) 1000 puan. */
export const computeScore = (moves) => Math.max(50, 1000 - Math.max(0, moves - PAIRS) * 40);

/* ---------------- Oyun ---------------- */

export class MemoryGame extends BaseGame {
  static meta = {
    id: 'memory',
    title: 'Memory Match',
    width: W,
    height: H,
    controls: 'Tıkla / dokun ya da oklar + Enter ile kart çevir',
    description: 'Kartları çevirip aynı şekil ve renkteki çiftleri bul. Ne kadar az hamle, o kadar çok puan.',
  };

  constructor(engine) {
    super(engine);
    this.overlayDelay = 0.6;
  }

  reset() {
    super.reset();
    this.cards = createDeck().map((face) => ({ face, flip: 0, target: 0, matched: false, matchT: 0 }));
    this.open = [];
    this.lockTimer = 0;
    this.moves = 0;
    this.found = 0;
    this.elapsed = 0;
    this.cursor = 0;
    this.showCursor = false;
  }

  update(dt) {
    for (const c of this.cards) {
      const step = FLIP_SPEED * dt;
      c.flip = c.flip < c.target ? Math.min(c.target, c.flip + step) : Math.max(c.target, c.flip - step);
      if (c.matched) c.matchT += dt;
    }
    if (super.update(dt)) return;
    this.elapsed += dt;

    if (this.lockTimer > 0) {
      // Eşleşmeyen iki kart açıkken yeni tıklama alınmaz
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) {
        for (const i of this.open) this.cards[i].target = 0;
        this.open = [];
      }
      return;
    }

    const input = this.input;
    const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    for (const [code, [dr, dc]] of Object.entries(moves)) {
      if (input.wasPressed(code)) {
        this.showCursor = true;
        const r = (Math.floor(this.cursor / COLS) + dr + ROWS) % ROWS;
        const c = ((this.cursor % COLS) + dc + COLS) % COLS;
        this.cursor = r * COLS + c;
      }
    }
    if (input.wasPressed('Enter', 'Space')) {
      this.showCursor = true;
      this.flipCard(this.cursor);
      return;
    }
    const p = input.pointer;
    if (p.clicked && p.button === 0) {
      const i = this.cardAt(p.x, p.y);
      if (i >= 0) {
        this.showCursor = false;
        this.flipCard(i);
      }
    }
  }

  cardAt(x, y) {
    const c = Math.floor((x - GX) / (CARD + GAP));
    const r = Math.floor((y - GY) / (CARD + GAP));
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
    if ((x - GX) % (CARD + GAP) > CARD || (y - GY) % (CARD + GAP) > CARD) return -1;
    return r * COLS + c;
  }

  flipCard(i) {
    const card = this.cards[i];
    if (!card || card.matched || card.target === 1 || this.open.length >= 2) return;
    card.target = 1;
    this.open.push(i);
    this.sound.beep(480, 0.03, { type: 'triangle' });
    if (this.open.length < 2) return;

    this.moves++;
    const [a, b] = this.open.map((k) => this.cards[k]);
    if (a.face === b.face) {
      a.matched = b.matched = true;
      this.open = [];
      this.found++;
      this.sound.seq([[660, 0.06], [990, 0.1]], { type: 'triangle' });
      if (this.found === PAIRS) {
        this.score = computeScore(this.moves);
        this.gameOver(true);
      }
    } else {
      this.lockTimer = MISMATCH_DELAY;
      this.sound.beep(200, 0.08, { type: 'sawtooth', volume: 0.04 });
    }
  }

  overlayContent() {
    const c = super.overlayContent();
    if (this.state === 'ready') c.lines = [{ text: `${PAIRS} çifti en az hamlede bul`, color: NEON.dim }];
    if (this.state === 'won') {
      c.title = 'TÜM ÇİFTLER!';
      c.lines.unshift({ text: `${this.moves} hamle · ${Math.floor(this.elapsed)} sn`, color: NEON.dim });
    }
    return c;
  }

  drawShape(shape, cx, cy, s, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.lineWidth = s * 0.14;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const poly = (n, r, rot = -Math.PI / 2) => {
      for (let k = 0; k < n; k++) {
        const a = rot + (k * Math.PI * 2) / n;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
    };
    switch (shape) {
      case 'circle':
        ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'square':
        ctx.rect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84);
        ctx.fill();
        break;
      case 'triangle':
        poly(3, s * 0.56, -Math.PI / 2);
        ctx.fill();
        break;
      case 'diamond':
        poly(4, s * 0.56, -Math.PI / 2);
        ctx.fill();
        break;
      case 'star':
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const r = k % 2 ? s * 0.24 : s * 0.58;
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'hexagon':
        poly(6, s * 0.52, 0);
        ctx.fill();
        break;
      case 'ring':
        ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'cross':
        ctx.moveTo(cx - s * 0.4, cy - s * 0.4);
        ctx.lineTo(cx + s * 0.4, cy + s * 0.4);
        ctx.moveTo(cx + s * 0.4, cy - s * 0.4);
        ctx.lineTo(cx - s * 0.4, cy + s * 0.4);
        ctx.lineWidth = s * 0.2;
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    this.cards.forEach((card, i) => {
      const x = GX + (i % COLS) * (CARD + GAP);
      const y = GY + Math.floor(i / COLS) * (CARD + GAP);
      const scaleX = Math.abs(Math.cos(card.flip * Math.PI));
      const faceUp = card.flip > 0.5;
      const cx = x + CARD / 2;
      ctx.save();
      ctx.translate(cx, y + CARD / 2);
      ctx.scale(Math.max(0.02, scaleX), 1);
      ctx.translate(-cx, -(y + CARD / 2));
      roundRect(ctx, x, y, CARD, CARD, 14);
      if (faceUp) {
        ctx.fillStyle = '#0e0e22';
        ctx.fill();
        const color = COLORS[card.face];
        ctx.strokeStyle = card.matched ? color : 'rgba(236, 235, 255, 0.35)';
        ctx.lineWidth = card.matched ? 3 : 2;
        ctx.stroke();
        this.drawShape(SHAPES[card.face], cx, y + CARD / 2, CARD * 0.5, color);
      } else {
        ctx.fillStyle = '#1b1240';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(178, 107, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = -CARD; k < CARD * 2; k += 16) {
          ctx.moveTo(x + k, y);
          ctx.lineTo(x + k + CARD, y + CARD);
        }
        ctx.stroke();
        ctx.restore();
        roundRect(ctx, x, y, CARD, CARD, 14);
        ctx.strokeStyle = NEON.purple;
        ctx.lineWidth = 2;
        ctx.stroke();
        this.text('?', cx, y + CARD / 2 + 2, { size: 44, color: 'rgba(178, 107, 255, 0.8)' });
      }
      ctx.restore();

      if (card.matched && card.matchT < 0.6) {
        ctx.save();
        ctx.globalAlpha = 1 - card.matchT / 0.6;
        ctx.strokeStyle = NEON.green;
        ctx.shadowColor = NEON.green;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 4;
        roundRect(ctx, x - 3, y - 3, CARD + 6, CARD + 6, 16);
        ctx.stroke();
        ctx.restore();
      }
      if (this.showCursor && i === this.cursor && this.state === 'playing') {
        ctx.save();
        ctx.strokeStyle = NEON.cyan;
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 5]);
        roundRect(ctx, x - 5, y - 5, CARD + 10, CARD + 10, 16);
        ctx.stroke();
        ctx.restore();
      }
    });

    this.text(`EŞLEŞEN ${this.found}/${PAIRS}`, W / 2, H - 18, { size: 14, color: NEON.dim });
    this.drawHUD(`HAMLE ${this.moves} · ${Math.floor(this.elapsed)} sn`);
  }
}
