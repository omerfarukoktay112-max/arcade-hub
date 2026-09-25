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
