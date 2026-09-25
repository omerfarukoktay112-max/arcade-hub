// Saf oyun mantığı testleri — bağımlılıksız mini test koşucusu.
// Kullanım: node tests/logic.test.mjs
import assert from 'node:assert/strict';

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

/** Tekrarlanabilir rastgelelik için basit tohumlu üreteç (mulberry32). */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ======================= Snake ======================= */
{
  const { enqueueDirection, stepSnake, spawnFood, DIRS } = await import('../js/games/SnakeGame.js');

  test('snake: hızlı ardışık basışla ters yöne dönülemez', () => {
    // Sağa gidiyor; aynı adım içinde önce Yukarı sonra Sol'a basılıyor.
    let q = [];
    q = enqueueDirection(q, DIRS.right, DIRS.up);
    q = enqueueDirection(q, DIRS.right, DIRS.left);
    assert.deepEqual(q, [DIRS.up, DIRS.left]); // Sol, Yukarı'dan SONRA uygulanır → güvenli
    // Tampon boşken doğrudan ters yön reddedilir
    assert.deepEqual(enqueueDirection([], DIRS.right, DIRS.left), []);
    // Aynı yön tekrar eklenmez
    assert.deepEqual(enqueueDirection([DIRS.up], DIRS.right, DIRS.up), [DIRS.up]);
  });

  test('snake: iki basış bir adımda uygulanırsa kendine çarpmaz', () => {
    let snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
    let q = enqueueDirection([], DIRS.right, DIRS.up);
    q = enqueueDirection(q, DIRS.right, DIRS.left);
    let r = stepSnake(snake, q[0], null, 20, 20);
    assert.equal(r.dead, false);
    r = stepSnake(r.snake, q[1], null, 20, 20);
    assert.equal(r.dead, false);
    assert.deepEqual(r.snake[0], { x: 4, y: 4 });
  });

  test('snake: duvar ve kuyruk çarpması, kuyruk ucuna girmek serbest', () => {
    assert.equal(stepSnake([{ x: 0, y: 0 }], DIRS.left, null, 10, 10).dead, true);
    // Kare şeklinde dönen 4'lük yılan: kuyruk ucu bu adımda boşalır → ölmez
    const loop = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }];
    assert.equal(stepSnake(loop, DIRS.left, null, 10, 10).dead, false);
    // Ama yem yiyip büyürken kuyruk yerinde kalır → ölür
    assert.equal(stepSnake(loop, DIRS.left, { x: 0, y: 0 }, 10, 10).dead, true);
  });

  test('snake: yem yılanın üstünde doğmaz', () => {
    const rng = seeded(7);
    const snake = [];
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) if (!(x === 3 && y === 3)) snake.push({ x, y });
    for (let i = 0; i < 50; i++) assert.deepEqual(spawnFood(snake, 4, 4, rng), { x: 3, y: 3 });
    snake.push({ x: 3, y: 3 });
    assert.equal(spawnFood(snake, 4, 4, rng), null);
  });
}

/* ======================= 2048 ======================= */
{
  const { slideLine, moveGrid, spawnTile, canMove, emptyGrid } = await import('../js/games/Game2048.js');
  const vals = (line) => slideLine(line).values;

  test('2048: bir karo bir hamlede yalnızca bir kez birleşir', () => {
    assert.deepEqual(vals([2, 2, 2, 2]), [4, 4, 0, 0]);
    assert.deepEqual(vals([2, 2, 4, 0]), [4, 4, 0, 0]); // yeni 4, eski 4 ile tekrar birleşmez
    assert.deepEqual(vals([4, 4, 8, 0]), [8, 8, 0, 0]);
    assert.deepEqual(vals([2, 0, 0, 2]), [4, 0, 0, 0]);
    assert.deepEqual(vals([2, 2, 2, 0]), [4, 2, 0, 0]);
    assert.deepEqual(vals([8, 4, 2, 2]), [8, 4, 4, 0]);
    assert.equal(slideLine([2, 2, 4, 4]).gained, 12);
  });

  test('2048: yönler doğru ve hareketsiz kaydırma "moved=false"', () => {
    const g = [[2, 0, 0, 2], [0, 0, 0, 0], [0, 4, 0, 0], [0, 4, 0, 0]];
    assert.deepEqual(moveGrid(g, 'right').grid[0], [0, 0, 0, 4]);
    assert.deepEqual(moveGrid(g, 'down').grid.map((r) => r[1]), [0, 0, 0, 8]);
    assert.deepEqual(moveGrid(g, 'up').grid.map((r) => r[1]), [8, 0, 0, 0]);
    const stuck = [[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    assert.equal(moveGrid(stuck, 'left').moved, false);
    assert.equal(moveGrid(stuck, 'up').moved, false);
    assert.equal(moveGrid(stuck, 'right').moved, true);
    assert.deepEqual(g[0], [2, 0, 0, 2], 'girdi değişmemeli');
  });

  test('2048: yeni karolar ~%90 2, ~%10 4 ve yalnızca boş hücreye', () => {
    const rng = seeded(3);
    let fours = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const g = emptyGrid();
      g[0][0] = 8;
      const s = spawnTile(g, rng);
      assert.ok(!(s.r === 0 && s.c === 0));
      if (s.value === 4) fours++;
    }
    const ratio = fours / N;
    assert.ok(ratio > 0.08 && ratio < 0.12, `4 oranı ${ratio}`);
  });

  test('2048: hamle kalmayınca canMove=false', () => {
    assert.equal(canMove([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]), false);
    assert.equal(canMove([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]]), true);
    assert.equal(canMove([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 0, 4], [4, 2, 4, 2]]), true);
  });
}

/* ======================= Minesweeper ======================= */
{
  const { createBoard, placeMines, reveal, chord, toggleFlag, isWon, DIFFICULTIES } = await import('../js/games/MinesweeperGame.js');

  /** Metinden tahta: '*' mayın, '.' boş */
  function boardFrom(rows) {
    const b = createBoard(rows.length, rows[0].length);
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      b.cells[r * b.cols + c].mine = ch === '*';
    }));
    for (let i = 0; i < b.cells.length; i++) {
      const r = Math.floor(i / b.cols);
      const c = i % b.cols;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < b.rows && cc < b.cols && b.cells[rr * b.cols + cc].mine) n++;
      }
      b.cells[i].adj = n;
    }
    b.mines = b.cells.filter((x) => x.mine).length;
    b.placed = true;
    return b;
  }

  test('minesweeper: ilk tıklama asla mayın değil, mayın sayısı tam', () => {
    for (const d of Object.values(DIFFICULTIES)) {
      for (let seed = 1; seed <= 200; seed++) {
        const rng = seeded(seed);
        const r = Math.floor(rng() * d.rows);
        const c = Math.floor(rng() * d.cols);
        const b = placeMines(createBoard(d.rows, d.cols), d.mines, r, c, rng);
        assert.equal(b.cells[r * d.cols + c].mine, false);
        assert.equal(b.cells[r * d.cols + c].adj, 0, 'ilk tıklama bir alan açmalı');
        assert.equal(b.cells.filter((x) => x.mine).length, d.mines);
        assert.equal(reveal(b, r, c).hitMine, false);
      }
    }
  });

  test('minesweeper: komşu sayıları doğru', () => {
    const b = placeMines(createBoard(9, 9), 10, 4, 4, seeded(11));
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if ((dr || dc) && r + dr >= 0 && c + dc >= 0 && r + dr < 9 && c + dc < 9 && b.cells[(r + dr) * 9 + c + dc].mine) n++;
      }
      assert.equal(b.cells[i].adj, n);
    }
  });

  test('minesweeper: flood-fill boş alanı açar, sayılarda durur, bayrağa girmez', () => {
    const b = boardFrom([
      '.....',
      '.....',
      '...**',
      '...*.',
    ]);
    const res = reveal(b, 0, 0);
    assert.equal(res.hitMine, false);
    const open = b.cells.map((x) => (x.open ? 1 : 0)).join('');
    // Satır 0-1 tamamen, satır 2-3'te yalnızca ilk üç sütun açılır; mayınlar ve (3,4) kapalı
    assert.equal(open, '11111' + '11111' + '11100' + '11100');
    // Bayrak flood-fill'i durdurur
    const b2 = boardFrom(['....', '....', '....']);
    toggleFlag(b2, 1, 1);
    reveal(b2, 0, 0);
    assert.equal(b2.cells[5].open, false);
    assert.equal(isWon(b2), false);
    toggleFlag(b2, 1, 1);
    reveal(b2, 1, 1);
    assert.equal(isWon(b2), true);
  });

  test('minesweeper: chord yalnızca bayrak sayısı eşitse açar', () => {
    const b = boardFrom([
      '*..',
      '...',
      '...',
    ]);
    reveal(b, 1, 1); // "1"
    assert.equal(b.cells[4].adj, 1);
    assert.equal(chord(b, 1, 1), null, 'bayraksız chord yapılmaz');
    toggleFlag(b, 0, 0);
    const res = chord(b, 1, 1);
    assert.equal(res.hitMine, false);
    assert.equal(isWon(b), true);
    // Yanlış bayrakla chord mayına bastırır
    const b2 = boardFrom(['*..', '...', '...']);
    reveal(b2, 1, 1);
    toggleFlag(b2, 0, 1);
    assert.equal(chord(b2, 1, 1).hitMine, true);
  });
}

/* ======================= Tetris ======================= */
{
  const T = await import('../js/games/TetrisGame.js');
  const { SHAPES, TYPES, rotateMatrix, createPiece, tryRotate, collides, clearLines, fullRows, mergePiece,
    scoreForLines, levelForLines, createBag, emptyBoard, dropDistance, COLS, ROWS } = T;

  test('tetris: 4 kez döndürme başlangıca döner, CW ve CCW birbirinin tersi', () => {
    for (const t of TYPES) {
      let m = SHAPES[t];
      for (let i = 0; i < 4; i++) m = rotateMatrix(m, 1);
      assert.deepEqual(m, SHAPES[t]);
      assert.deepEqual(rotateMatrix(rotateMatrix(SHAPES[t], 1), -1), SHAPES[t]);
    }
  });

  test('tetris: SRS durumları (T ve I) doğru', () => {
    const b = emptyBoard();
    const t = tryRotate(b, { ...createPiece('T'), y: 5 }, 1);
    assert.deepEqual(t.matrix, [[0, 1, 0], [0, 1, 1], [0, 1, 0]]);
    assert.equal(t.rot, 1);
    const i = tryRotate(b, { ...createPiece('I'), y: 5 }, 1);
    assert.deepEqual(i.matrix.map((r) => r.join('')), ['0010', '0010', '0010', '0010']);
    const o = createPiece('O');
    const o2 = tryRotate(b, o, 1);
    assert.equal(o2.x, o.x);
    assert.equal(o2.y, o.y);
  });

  test('tetris: SRS wall kick — duvara yaslı T ve I', () => {
    const b = emptyBoard();
    // T, R durumunda sol duvara yaslı (x=-1 → dolu sütunlar 0 ve 1). R→2 döndürme: test 2 (+1, 0)
    let tR = tryRotate(b, { ...createPiece('T'), y: 10 }, 1);
    tR = { ...tR, x: -1 };
    assert.equal(collides(b, tR), false);
    const t2 = tryRotate(b, tR, 1);
    assert.equal(t2.rot, 2);
    assert.equal(t2.x, 0);
    assert.equal(t2.y, 10);
    // I, R durumunda sol duvarda (x=-2 → sütun 0). R→2: test1 (-1,0) çarpar, test2 (+2,0) → x=0
    let iR = tryRotate(b, { ...createPiece('I'), y: 10 }, 1);
    iR = { ...iR, x: -2 };
    assert.equal(collides(b, iR), false);
    const i2 = tryRotate(b, iR, 1);
    assert.equal(i2.x, 0);
    assert.equal(i2.y, 10);
    // I, 0 durumunda sağ duvarda; 0→R: test1 (0,0) → x=6 sütun 8 (serbest)
    const i0 = { ...createPiece('I'), x: 6, y: 10 };
    assert.equal(tryRotate(b, i0, 1).x, 6);
  });

  test('tetris: kick ile zemin altından yukarı kaçış ve tamamen kilitli döndürme', () => {
    // T yere oturmuş (0 durumu, en alt satırda). 0→R: test1 çarpmaz → yerinde döner
    const b = emptyBoard();
    const t = { ...createPiece('T'), y: ROWS - 2 };
    assert.equal(dropDistance(b, t), 0);
    const r = tryRotate(b, t, 1);
    assert.ok(r, 'döndürülebilmeli');
    assert.equal(collides(b, r), false);
    // Her yanı dolu bir kuyu: döndürme mümkün değil → null
    const full = emptyBoard().map((row) => row.map(() => 'Z'));
    for (let x = 0; x < 3; x++) full[5][3 + x] = null;
    full[4][4] = null;
    const stuck = { ...createPiece('T'), x: 3, y: 4 };
    assert.equal(collides(full, stuck), false);
    assert.equal(tryRotate(full, stuck, 1), null);
  });

  test('tetris: satır silme, üst satırlar aşağı kayar', () => {
    const b = emptyBoard();
    b[ROWS - 1] = new Array(COLS).fill('I');
    b[ROWS - 2] = new Array(COLS).fill('J');
    b[ROWS - 2][4] = null;
    b[ROWS - 3][0] = 'T';
    b[ROWS - 4] = new Array(COLS).fill('L');
    assert.deepEqual(fullRows(b), [ROWS - 4, ROWS - 1]);
    const { board, cleared } = clearLines(b);
    assert.equal(cleared, 2);
    assert.equal(board.length, ROWS);
    assert.equal(board[ROWS - 1][4], null);
    assert.equal(board[ROWS - 1][0], 'J');
    assert.equal(board[ROWS - 2][0], 'T');
    assert.ok(board[0].every((c) => c === null) && board[1].every((c) => c === null));
  });

  test('tetris: I parçası ile tetris (4 satır) ve puanlama', () => {
    let b = emptyBoard();
    for (let r = ROWS - 4; r < ROWS; r++) for (let c = 1; c < COLS; c++) b[r][c] = 'O';
    let i = tryRotate(b, { ...createPiece('I'), y: 0 }, 1); // dikey, sütun x+2
    i = { ...i, x: -2 };
    i = { ...i, y: i.y + dropDistance(b, i) };
    b = mergePiece(b, i).board;
    assert.equal(clearLines(b).cleared, 4);
    assert.equal(scoreForLines(1, 1), 100);
    assert.equal(scoreForLines(2, 1), 300);
    assert.equal(scoreForLines(3, 2), 1000);
    assert.equal(scoreForLines(4, 3), 2400);
    assert.equal(levelForLines(9), 1);
    assert.equal(levelForLines(10), 2);
  });

  test('tetris: 7-bag her 7 parçada tüm tipleri bir kez verir', () => {
    const next = createBag(seeded(5));
    for (let k = 0; k < 50; k++) {
      const bag = Array.from({ length: 7 }, next).sort();
      assert.deepEqual(bag, TYPES.slice().sort());
    }
  });
}

/**
 * DOM'suz sahte engine: oyun sınıflarının update() mantığını Node'da sürmek için.
 * Çizim yapılmaz; girdi elle ayarlanır.
 */
export function fakeEngine(Game) {
  const store = new Map();
  const input = {
    down: new Set(), pressed: new Set(), swipe: null,
    pointer: { x: 0, y: 0, isDown: false, pressed: false, released: false, clicked: false, button: 0, type: 'mouse', hover: false },
    isDown(...c) { return c.some((k) => this.down.has(k)); },
    wasPressed(...c) { return c.some((k) => this.pressed.has(k)); },
    consume() {},
    endFrame() { this.pressed.clear(); this.swipe = null; Object.assign(this.pointer, { pressed: false, released: false, clicked: false }); },
  };
  const engine = {
    width: Game.meta.width, height: Game.meta.height, ctx: null, input,
    storage: {
      get: (k, f = null) => (store.has(k) ? store.get(k) : f),
      set: (k, v) => store.set(k, v),
      getBest: (k) => store.get(`best:${k}`) ?? null,
      submitScore: (k, v, lower) => {
        const b = store.get(`best:${k}`);
        const better = b === undefined || (lower ? v < b : v > b);
        if (better && (lower || v > 0)) store.set(`best:${k}`, v);
        return better;
      },
    },
    sound: { beep() {}, seq() {}, win() {}, lose() {} },
    resizeCanvas(w, h) { this.width = w; this.height = h; },
  };
  const game = new Game(engine);
  game.init();
  return { game, input, engine, step(dt = 1 / 60) { game.update(dt); input.endFrame(); } };
}

/* ======================= Pong ======================= */
{
  const { PongGame, bounceVelocity, predictY } = await import('../js/games/PongGame.js');

  test('pong: açı rakete çarpma noktasına göre, hız korunur', () => {
    const mid = bounceVelocity(145, 100, 90, 400, 1);
    assert.ok(Math.abs(mid.vy) < 1e-9 && mid.vx > 0);
    const top = bounceVelocity(100, 100, 90, 400, -1);
    assert.ok(top.vy < 0 && top.vx < 0);
    const bottom = bounceVelocity(190, 100, 90, 400, 1);
    assert.ok(bottom.vy > 0);
    assert.ok(Math.abs(Math.hypot(top.vx, top.vy) - 400) < 1e-6);
  });

  test('pong: duvar yansımalı y tahmini', () => {
    assert.equal(predictY(0, 100, 100, 0, 300), 100);
    // 500 yükseklik, top 12: yansıma sınırı 488. Yukarı giden top duvardan döner.
    assert.equal(Math.round(predictY(0, 50, 100, -100, 100)), 50);
    assert.equal(Math.round(predictY(0, 50, 100, -100, 200)), 150); // 50 − 200 = −150 → yansıma: 150
    assert.equal(Math.round(predictY(0, 400, 100, 100, 200)), 976 - 600); // 600 > 488 → 376
  });

  test('pong: yapay zekâ hareketsiz oyuncuyu yener ama yenilmez değildir', () => {
    // 1) Hareketsiz oyuncu → AI kazanır
    const a = fakeEngine(PongGame);
    a.game.setMode(1);
    a.game.start();
    for (let i = 0; i < 60 * 300 && a.game.state === 'playing'; i++) a.step();
    assert.equal(a.game.state, 'over');
    assert.equal(a.game.winner, 2);

    // 2) Kusursuz oyuncu (raket topu birebir takip eder) → AI er geç sayı kaçırır
    let aiConceded = 0;
    for (let round = 0; round < 3; round++) {
      const b = fakeEngine(PongGame);
      b.game.setMode(1);
      b.game.start();
      for (let i = 0; i < 60 * 400 && b.game.state === 'playing'; i++) {
        const g = b.game;
        g.p1.y = Math.max(0, Math.min(500 - 90, g.ball.y + 6 - 45));
        b.step();
      }
      aiConceded += b.game.s1;
    }
    assert.ok(aiConceded > 0, 'AI hiç sayı kaçırmadı (yenilmez)');
  });
}

/* ======================= Koşucu ======================= */
let failed = 0;
for (const { name, fn } of results) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n    ${err.message.split('\n').join('\n    ')}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} test geçti`);
if (failed) process.exit(1);
