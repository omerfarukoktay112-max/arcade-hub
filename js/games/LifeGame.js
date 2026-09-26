import { BaseGame, NEON, pointInRect } from '../core/BaseGame.js';
import { t } from '../core/I18n.js';

const W = 800;
const H = 600;
const CELL = 10;
export const COLS = W / CELL; // 80
export const ROWS = H / CELL; // 60
const SPEEDS = [1, 2, 5, 10, 15, 30, 60]; // nesil / sn
const DEFAULT_SPEED = 3;
const STATUS_H = 24; // üstte durum şeridi
export const TOOL_H = 60; // altta dokunmatik araç çubuğu

/* ---------------- Saf mantık ---------------- */

/** Toroidal (kenarları sarmal) ızgarada bir nesil ilerletir. Yeni dizi döner. */
export function step(cells, cols, rows) {
  const next = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const up = ((y - 1 + rows) % rows) * cols;
    const mid = y * cols;
    const down = ((y + 1) % rows) * cols;
    for (let x = 0; x < cols; x++) {
      const l = (x - 1 + cols) % cols;
      const r = (x + 1) % cols;
      const n =
        cells[up + l] + cells[up + x] + cells[up + r] +
        cells[mid + l] + cells[mid + r] +
        cells[down + l] + cells[down + x] + cells[down + r];
      next[mid + x] = n === 3 || (n === 2 && cells[mid + x]) ? 1 : 0;
    }
  }
  return next;
}

/** RLE desen ayrıştırıcı ('b' ölü, 'o' canlı, '$' satır sonu, '!' bitiş). Dönen: [[x, y], ...] */
export function parseRLE(rle) {
  const out = [];
  let x = 0;
  let y = 0;
  let num = '';
  for (const ch of rle.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') {
      num += ch;
      continue;
    }
    const n = num ? parseInt(num, 10) : 1;
    num = '';
    if (ch === 'b') x += n;
    else if (ch === 'o') {
      for (let k = 0; k < n; k++) out.push([x + k, y]);
      x += n;
    } else if (ch === '$') {
      y += n;
      x = 0;
    } else if (ch === '!') break;
  }
  return out;
}

function pulsar() {
  const out = [];
  for (const a of [0, 5, 7, 12]) {
    for (const b of [2, 3, 4, 8, 9, 10]) {
      out.push([b, a]);
      out.push([a, b]);
    }
  }
  return out;
}

export const PATTERNS = {
  glider: { name: 'Glider', cells: parseRLE('bo$2bo$3o!') },
  pulsar: { name: 'Pulsar', cells: pulsar() },
  gun: {
    name: 'Gosper Glider Gun',
    cells: parseRLE('24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!'),
  },
};

/** Deseni (x0, y0) sol üst köşesine yerleştirir (sarmal). */
export function placePattern(cells, cols, rows, pattern, x0, y0) {
  for (const [x, y] of pattern) {
    const px = (((x0 + x) % cols) + cols) % cols;
    const py = (((y0 + y) % rows) + rows) % rows;
    cells[py * cols + px] = 1;
  }
  return cells;
}

export const patternSize = (pattern) => ({
  w: Math.max(...pattern.map((p) => p[0])) + 1,
  h: Math.max(...pattern.map((p) => p[1])) + 1,
});

/* ---------------- Oyun ---------------- */

export class LifeGame extends BaseGame {
  static meta = {
    id: 'life',
    get title() { return t('life.title'); },
    width: W,
    height: H,
    hasScore: false,
    theme: ['#9dff3d', NEON.cyan],
    get controls() { return t('life.controls'); },
    get description() { return t('life.description'); },
  };

  constructor(engine) {
    super(engine);
    // Alt araç çubuğu (klavyesiz cihazlar için; klavye kısayollarıyla aynı eylemler)
    // Mobilde canvas ~0.43× ölçeklendiği için az sayıda büyük düğme; hız ve desen döngüseldir.
    const defs = [['run', 150], ['step', 100], ['random', 130], ['clear', 120], ['pattern', 130], ['speed', 110]];
    const gap = 10;
    const total = defs.reduce((a, [, w]) => a + w, 0) + gap * (defs.length - 1);
    let x = (W - total) / 2;
    this.tools = defs.map(([id, w]) => {
      const rect = { x, y: H - TOOL_H + 8, w, h: TOOL_H - 16 };
      x += w + gap;
      return { id, rect };
    });
  }

  init() {
    this.reset();
    this.state = 'playing'; // hazır/bitti ekranı yok
    this.stateTime = 0;
  }

  reset() {
    super.reset();
    this.cells = new Uint8Array(COLS * ROWS);
    this.age = new Uint16Array(COLS * ROWS);
    this.generation = 0;
    this.running = false;
    this.speed = DEFAULT_SPEED;
    this.acc = 0;
    this.drawMode = 0; // 1 çiz, 0 sil
    this.lastCell = null;
    this.gestureOnBar = false;
    this.nextPattern = 0;
    this.touched = false; // yardım metni ilk etkileşimde kaybolur
    this.message = '';
    this.messageT = 0;
    placePattern(this.cells, COLS, ROWS, PATTERNS.gun.cells, 4, 6);
    this.syncAge();
  }

  canPause() {
    return true;
  }

  get population() {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) n += this.cells[i];
    return n;
  }

  syncAge() {
    for (let i = 0; i < this.cells.length; i++) this.age[i] = this.cells[i] ? Math.max(1, this.age[i]) : 0;
  }

  advance() {
    this.cells = step(this.cells, COLS, ROWS);
    for (let i = 0; i < this.cells.length; i++) this.age[i] = this.cells[i] ? Math.min(60000, this.age[i] + 1) : 0;
    this.generation++;
  }

  flash(msg) {
    this.message = msg;
    this.messageT = 1.2;
  }

  update(dt) {
    this.time += dt;
    this.messageT = Math.max(0, this.messageT - dt);
    const input = this.input;

    if (input.wasPressed('Space')) this.action('run');
    if (input.wasPressed('KeyN')) this.action('step');
    if (input.wasPressed('KeyC')) this.action('clear');
    if (input.wasPressed('KeyR')) this.action('random');
    if (input.wasTyped('+') || input.wasPressed('NumpadAdd')) this.action('faster');
    if (input.wasTyped('-') || input.wasPressed('NumpadSubtract')) this.action('slower');
    const keys = [['Digit1', 'glider'], ['Digit2', 'pulsar'], ['Digit3', 'gun']];
    for (const [code, id] of keys) {
      if (input.wasPressed(code, code.replace('Digit', 'Numpad'))) this.action(id, true);
    }

    // Alt çubukta başlayan hareket çizim yapmaz; dokunma/tık düğmeyi tetikler
    const p = input.pointer;
    if (p.pressed) this.gestureOnBar = p.startY >= H - TOOL_H;
    if (p.clicked && p.button === 0 && this.gestureOnBar) {
      const tool = this.tools.find((t) => pointInRect(p, t.rect));
      if (tool) this.action(tool.id);
    }
    if (!this.gestureOnBar) this.handleDrawing();
    else if (!p.isDown && !p.pressed) this.gestureOnBar = false;

    if (this.running) {
      const interval = 1 / SPEEDS[this.speed];
      this.acc += dt;
      let guard = 0;
      while (this.acc >= interval && guard++ < 4) {
        this.acc -= interval;
        this.advance();
      }
      if (guard >= 4) this.acc = 0;
    }
  }

  /** Klavye kısayolları ve araç çubuğunun ortak eylemleri. */
  action(id, atPointer = false) {
    this.touched = true;
    switch (id) {
      case 'run':
        this.running = !this.running;
        this.sound.beep(this.running ? 660 : 440, 0.05, { type: 'triangle' });
        break;
      case 'step':
        this.running = false;
        this.advance();
        break;
      case 'clear':
        this.cells = new Uint8Array(COLS * ROWS);
        this.age = new Uint16Array(COLS * ROWS);
        this.generation = 0;
        this.flash(t('life.cleared'));
        break;
      case 'random':
        for (let i = 0; i < this.cells.length; i++) this.cells[i] = Math.random() < 0.25 ? 1 : 0;
        this.age.fill(0);
        this.syncAge();
        this.generation = 0;
        this.flash(t('life.randomized'));
        break;
      case 'faster':
        this.setSpeed(this.speed + 1);
        break;
      case 'slower':
        this.setSpeed(this.speed - 1);
        break;
      case 'speed':
        this.setSpeed((this.speed + 1) % SPEEDS.length);
        break;
      case 'pattern': {
        const order = ['glider', 'pulsar', 'gun'];
        this.placePatternAt(PATTERNS[order[this.nextPattern]], false);
        this.nextPattern = (this.nextPattern + 1) % order.length;
        break;
      }
      default:
        if (PATTERNS[id]) this.placePatternAt(PATTERNS[id], atPointer);
    }
  }

  setSpeed(i) {
    const clamped = Math.max(0, Math.min(SPEEDS.length - 1, i));
    if (clamped !== this.speed) this.sound.beep(400 + clamped * 80, 0.04);
    this.speed = clamped;
    this.flash(t('life.speedMsg', { n: SPEEDS[this.speed] }));
  }

  /** Deseni fare imlecine (klavye kısayolu) ya da ekran ortasına yerleştirir. */
  placePatternAt(pat, atPointer) {
    const p = this.input.pointer;
    const { w, h } = patternSize(pat.cells);
    let cx = COLS / 2;
    let cy = (ROWS - TOOL_H / CELL) / 2;
    if (atPointer && p.type === 'mouse' && p.hover && p.y < H - TOOL_H) {
      cx = Math.floor(p.x / CELL);
      cy = Math.floor(p.y / CELL);
    }
    placePattern(this.cells, COLS, ROWS, pat.cells, Math.round(cx - w / 2), Math.round(cy - h / 2));
    this.syncAge();
    this.flash(pat.name);
    this.sound.beep(700, 0.05, { type: 'triangle' });
  }

  handleDrawing() {
    const p = this.input.pointer;
    const cellOf = (x, y) => ({
      x: Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))),
      y: Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))),
    });
    if (p.pressed) {
      // Basış noktası: kare işlenene kadar imleç ilerlemiş olabilir, çizgi buradan başlar
      const c = cellOf(p.startX, p.startY);
      // Sağ tık her zaman siler; sol tık başlangıç hücresine göre çizer ya da siler
      this.drawMode = p.button === 2 ? 0 : this.cells[c.y * COLS + c.x] ? 0 : 1;
      this.lastCell = c;
      this.touched = true;
    }
    if (!p.isDown) {
      this.lastCell = null;
      return;
    }
    const c = cellOf(p.x, p.y);
    const from = this.lastCell || c;
    // Bresenham: hızlı sürüklemede boşluk kalmasın
    let x0 = from.x;
    let y0 = from.y;
    const dx = Math.abs(c.x - x0);
    const dy = -Math.abs(c.y - y0);
    const sx = x0 < c.x ? 1 : -1;
    const sy = y0 < c.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const i = y0 * COLS + x0;
      this.cells[i] = this.drawMode;
      this.age[i] = this.drawMode ? 1 : 0;
      if (x0 === c.x && y0 === c.y) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    this.lastCell = c;
  }

  draw() {
    const ctx = this.ctx;
    // Izgara
    ctx.strokeStyle = 'rgba(34, 228, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, H);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(W, y * CELL + 0.5);
    }
    ctx.stroke();

    // Hücreler yaşa göre renklenir (yeni: camgöbeği, genç: yeşil, yaşlı: mor)
    const buckets = [
      [NEON.cyan, (a) => a <= 2],
      [NEON.green, (a) => a > 2 && a <= 12],
      [NEON.purple, (a) => a > 12],
    ];
    for (const [color, test] of buckets) {
      ctx.fillStyle = color;
      for (let i = 0; i < this.cells.length; i++) {
        if (this.cells[i] && test(this.age[i])) {
          ctx.fillRect((i % COLS) * CELL + 1, Math.floor(i / COLS) * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }
  }

  /** Life'ın kendi overlay'i: durum şeridi, araç çubuğu ve yardım. Hazır/bitti ekranı yoktur. */
  drawOverlay() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 8, 20, 0.78)';
    ctx.fillRect(0, 0, W, STATUS_H);
    ctx.fillRect(0, H - TOOL_H, W, TOOL_H);
    ctx.fillStyle = 'rgba(34, 228, 255, 0.35)';
    ctx.fillRect(0, STATUS_H - 1, W, 1);
    ctx.fillRect(0, H - TOOL_H, W, 1);
    ctx.restore();

    const y = STATUS_H / 2 + 1;
    this.text(this.running ? t('life.running') : t('life.stopped'), 12, y, { size: 13, align: 'left', color: this.running ? NEON.green : NEON.yellow, maxWidth: 180 });
    this.text(t('life.gen', { n: this.generation }), 200, y, { size: 13, align: 'left', color: NEON.cyan, maxWidth: 150 });
    this.text(t('life.pop', { n: this.population }), 360, y, { size: 13, align: 'left', color: NEON.pink, maxWidth: 190 });
    this.text(t('life.speed', { n: SPEEDS[this.speed] }), W - 12, y, { size: 13, align: 'right', color: NEON.text, maxWidth: 230 });

    const labels = {
      run: this.running ? t('life.btn.stop') : t('life.btn.play'), step: t('life.btn.step'), random: t('life.btn.random'), clear: t('life.btn.clear'),
      pattern: `+ ${['GLIDER', 'PULSAR', 'GUN'][this.nextPattern]}`, speed: t('life.btn.speed', { n: SPEEDS[this.speed] }),
    };
    for (const tool of this.tools) {
      const color = tool.id === 'run' ? NEON.green : tool.id === 'pattern' ? NEON.purple : NEON.cyan;
      this.drawButton(tool.rect, labels[tool.id], { selected: tool.id === 'run' && this.running, color, size: 16 });
    }

    if (this.messageT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.messageT * 2);
      this.text(this.message, W / 2, STATUS_H + 26, { size: 18, color: NEON.yellow, glow: 10 });
      ctx.restore();
    }
    if (!this.touched) {
      const lines = [t('life.help1'), t('life.help2'), t('life.help3')];
      ctx.save();
      ctx.fillStyle = 'rgba(8, 8, 20, 0.8)';
      ctx.fillRect(W / 2 - 290, H / 2 + 40, 580, 100);
      ctx.strokeStyle = 'rgba(34, 228, 255, 0.4)';
      ctx.strokeRect(W / 2 - 290 + 0.5, H / 2 + 40.5, 580, 100);
      ctx.restore();
      lines.forEach((l, i) => this.text(l, W / 2, H / 2 + 64 + i * 26, { size: 14, color: i === 0 ? NEON.yellow : NEON.text, maxWidth: 560 }));
    }
  }
}
