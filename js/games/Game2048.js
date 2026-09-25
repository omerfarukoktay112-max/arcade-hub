import { BaseGame, NEON, HUD_HEIGHT, roundRect } from '../core/BaseGame.js';

const SIZE = 4;
const BOARD = 440;
const BOARD_X = 30;
const BOARD_Y = HUD_HEIGHT + 12;
const GAP = 12;
const TILE = (BOARD - GAP * (SIZE + 1)) / SIZE;
const SLIDE_TIME = 0.11;
const POP_TIME = 0.14;
const TARGET = 2048;

/* ---------------- Saf mantık ---------------- */

/**
 * Tek bir çizgiyi (hareket yönündeki kenardan başlayarak) kaydırır ve birleştirir.
 * Bir karo bir hamlede yalnızca bir kez birleşir.
 * Dönen: { values, moves: [{from, to, value, merged}], gained }
 */
export function slideLine(line) {
  const values = new Array(line.length).fill(0);
  const mergedAt = new Array(line.length).fill(false);
  const moves = [];
  let target = 0;
  let gained = 0;
  for (let i = 0; i < line.length; i++) {
    const v = line[i];
    if (!v) continue;
    if (target > 0 && values[target - 1] === v && !mergedAt[target - 1]) {
      values[target - 1] = v * 2;
      mergedAt[target - 1] = true;
      gained += v * 2;
      moves.push({ from: i, to: target - 1, value: v, merged: true });
    } else {
      values[target] = v;
      moves.push({ from: i, to: target, value: v, merged: false });
      target++;
    }
  }
  return { values, moves, gained };
}

/** Yön için çizgi koordinatları: her çizgi, hareket edilen kenardan başlar. */
function linesFor(dir) {
  const lines = [];
  for (let k = 0; k < SIZE; k++) {
    const line = [];
    for (let i = 0; i < SIZE; i++) {
      if (dir === 'left') line.push([k, i]);
      else if (dir === 'right') line.push([k, SIZE - 1 - i]);
      else if (dir === 'up') line.push([i, k]);
      else line.push([SIZE - 1 - i, k]);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Tüm ızgarayı bir yöne hareket ettirir (girdiyi değiştirmez).
 * Dönen: { grid, moved, gained, moves: [{fr, fc, tr, tc, value, merged}] }
 */
export function moveGrid(grid, dir) {
  const out = grid.map((row) => row.slice());
  const moves = [];
  let gained = 0;
  let moved = false;
  for (const coords of linesFor(dir)) {
    const res = slideLine(coords.map(([r, c]) => grid[r][c]));
    coords.forEach(([r, c], i) => {
      out[r][c] = res.values[i];
    });
    for (const m of res.moves) {
      const [fr, fc] = coords[m.from];
      const [tr, tc] = coords[m.to];
      if (m.from !== m.to || m.merged) moved = true;
      moves.push({ fr, fc, tr, tc, value: m.value, merged: m.merged });
    }
    gained += res.gained;
  }
  return { grid: out, moved, gained, moves };
}

export function emptyGrid() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
}

/** Boş bir hücreye %90 ihtimalle 2, %10 ihtimalle 4 koyar. Dönen: {r, c, value} | null */
export function spawnTile(grid, rng = Math.random) {
  const empty = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) empty.push([r, c]);
  if (!empty.length) return null;
  const [r, c] = empty[Math.floor(rng() * empty.length)];
  const value = rng() < 0.9 ? 2 : 4;
  grid[r][c] = value;
  return { r, c, value };
}

export function canMove(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c];
      if (!v) return true;
      if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
      if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
    }
  }
  return false;
}

export const maxTile = (grid) => Math.max(...grid.flat());

/* ---------------- Oyun ---------------- */

const TILE_COLORS = {
  2: NEON.cyan, 4: NEON.blue, 8: NEON.purple, 16: NEON.pink, 32: NEON.red, 64: NEON.orange,
  128: NEON.yellow, 256: NEON.green, 512: '#00ffd0', 1024: '#ff66ff', 2048: '#ffffff',
};
const tileColor = (v) => TILE_COLORS[v] || NEON.yellow;
const cellX = (c) => BOARD_X + GAP + c * (TILE + GAP);
const cellY = (r) => BOARD_Y + GAP + r * (TILE + GAP);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

export class Game2048 extends BaseGame {
  static meta = {
    id: '2048',
    title: '2048',
    width: 500,
    height: 500,
    controls: 'Ok tuşları / WASD ile kaydır · Mobilde kaydır (swipe)',
    description: 'Aynı sayıları birleştirerek 2048 karosuna ulaş. Her hamlede yeni bir 2 ya da 4 gelir.',
  };

  reset() {
    super.reset();
    this.grid = emptyGrid();
    this.continued = false;
    this.slide = null; // { t, moves, spawn }
    this.effects = []; // { r, c, kind: 'pop'|'appear', t }
    this.menuButtons = [];
    for (let i = 0; i < 2; i++) {
      const s = spawnTile(this.grid);
      this.effects.push({ r: s.r, c: s.c, kind: 'appear', t: 0 });
    }
  }

  readMove() {
    const i = this.input;
    if (i.wasPressed('ArrowUp', 'KeyW') || i.swipe === 'up') return 'up';
    if (i.wasPressed('ArrowDown', 'KeyS') || i.swipe === 'down') return 'down';
    if (i.wasPressed('ArrowLeft', 'KeyA') || i.swipe === 'left') return 'left';
    if (i.wasPressed('ArrowRight', 'KeyD') || i.swipe === 'right') return 'right';
    return null;
  }

  animate(dt) {
    if (this.slide) {
      this.slide.t += dt;
      if (this.slide.t >= SLIDE_TIME) this.finishSlide();
    }
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < POP_TIME);
  }

  finishSlide() {
    const s = this.slide;
    this.slide = null;
    for (const m of s.moves) if (m.merged) this.effects.push({ r: m.tr, c: m.tc, kind: 'pop', t: 0 });
    if (s.spawn) this.effects.push({ r: s.spawn.r, c: s.spawn.c, kind: 'appear', t: 0 });
  }

  update(dt) {
    this.animate(dt);
    if (this.state === 'won') {
      this.time += dt;
      this.stateTime += dt;
      this.updateWon();
      return;
    }
    if (super.update(dt)) return;

    const dir = this.readMove();
    if (!dir) return;
    if (this.slide) this.finishSlide(); // hızlı girişte animasyonu tamamla
    const res = moveGrid(this.grid, dir);
    if (!res.moved) return; // hareket yoksa yeni karo da yok

    this.grid = res.grid;
    this.score += res.gained;
    const spawn = spawnTile(this.grid);
    this.slide = { t: 0, moves: res.moves, spawn };
    this.sound.beep(res.gained ? 520 + Math.min(600, Math.log2(res.gained) * 40) : 300, 0.05, { type: 'triangle' });

    if (!this.continued && maxTile(this.grid) >= TARGET) {
      this.gameOver(true);
      this.menuButtons = [
        { label: 'Devam et', key: 'Space', color: NEON.green, onClick: () => this.continueGame() },
        { label: 'Yeniden', key: 'Enter', color: NEON.pink, onClick: () => this.restart() },
      ];
    } else if (!canMove(this.grid)) {
      this.gameOver(false);
    }
  }

  /** Kazanınca yalnızca iki buton / iki tuş geçerlidir; rastgele dokunuş yeniden başlatmaz. */
  updateWon() {
    if (this.stateTime < 0.4) return;
    const layout = this.overlayLayout();
    const p = this.input.pointer;
    for (const b of layout.buttons) {
      if (this.input.wasPressed(b.key) || (p.clicked && p.x >= b.rect.x && p.x <= b.rect.x + b.rect.w && p.y >= b.rect.y && p.y <= b.rect.y + b.rect.h)) {
        b.onClick();
        return;
      }
    }
  }

  continueGame() {
    this.continued = true;
    this.menuButtons = [];
    this.state = 'playing';
    this.stateTime = 0;
  }

  overlayContent() {
    const c = super.overlayContent();
    if (this.state === 'won') {
      c.title = '2048! KAZANDIN';
      c.hint = 'Space: devam et · Enter: yeniden başla';
    }
    return c;
  }

  drawTile(x, y, value, scale = 1) {
    const ctx = this.ctx;
    const color = tileColor(value);
    const s = TILE * scale;
    const ox = x + (TILE - s) / 2;
    const oy = y + (TILE - s) / 2;
    ctx.save();
    roundRect(ctx, ox, oy, s, s, 10 * scale);
    ctx.fillStyle = '#0d0d1e';
    ctx.fill();
    ctx.globalAlpha = 0.16 + Math.min(0.3, Math.log2(value) * 0.025);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    if (value >= 128) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
    }
    ctx.stroke();
    ctx.restore();
    const digits = String(value).length;
    const size = (digits <= 2 ? 40 : digits === 3 ? 34 : digits === 4 ? 28 : 22) * scale;
    this.text(String(value), x + TILE / 2, y + TILE / 2 + 2, { size, color, glow: value >= 128 ? 10 : 0 });
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    roundRect(ctx, BOARD_X, BOARD_Y, BOARD, BOARD, 14);
    ctx.fillStyle = '#0b0b18';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 228, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = NEON.grid;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        roundRect(ctx, cellX(c), cellY(r), TILE, TILE, 10);
        ctx.fill();
      }
    }
    ctx.restore();

    if (this.slide) {
      // Kayma: karolar eski değerleriyle eski konumdan yeni konuma
      const t = easeOut(Math.min(1, this.slide.t / SLIDE_TIME));
      for (const m of this.slide.moves) {
        const x = cellX(m.fc) + (cellX(m.tc) - cellX(m.fc)) * t;
        const y = cellY(m.fr) + (cellY(m.tr) - cellY(m.fr)) * t;
        this.drawTile(x, y, m.value);
      }
    } else {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = this.grid[r][c];
          if (!v) continue;
          let scale = 1;
          const fx = this.effects.find((e) => e.r === r && e.c === c);
          if (fx) {
            const k = fx.t / POP_TIME;
            scale = fx.kind === 'appear' ? 0.3 + 0.7 * easeOut(k) : 1 + 0.14 * Math.sin(k * Math.PI);
          }
          this.drawTile(cellX(c), cellY(r), v, scale);
        }
      }
    }

    this.drawHUD(this.continued ? 'DEVAM MODU' : `EN BÜYÜK ${maxTile(this.grid)}`);
  }
}
