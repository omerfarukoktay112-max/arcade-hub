// Headless Chrome/Edge duman testi — npm bağımlılığı yok.
// Chrome DevTools Protocol'e Node'un yerleşik WebSocket'i ile bağlanır.
//
// Kullanım: node tests/browser-smoke.mjs [--shots <klasör>] [--url <yayındaki adres>]
// Tarayıcı yolu: CHROME_PATH ortam değişkeni ya da bilinen kurulum yolları.
// Tarayıcı bulunamazsa test atlanır (çıkış kodu 0).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './serve.mjs';

const args = process.argv.slice(2);
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
// --url <adres>: yerel sunucu yerine yayındaki siteyi test eder (ör. GitHub Pages)
const liveUrl = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const browserPath = CANDIDATES.find((p) => existsSync(p));
if (!browserPath) {
  console.log('Tarayıcı bulunamadı; tarayıcı duman testi atlandı.');
  process.exit(0);
}
if (typeof WebSocket === 'undefined') {
  console.log('Bu Node sürümünde yerleşik WebSocket yok (Node 22+ gerekli); test atlandı.');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HTTP_PORT = 8765;
const DEBUG_PORT = 9333;

const server = await startServer(HTTP_PORT);
const profile = mkdtempSync(join(tmpdir(), 'arcade-hub-'));
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

let ws;
let nextId = 1;
const pending = new Map();
const problems = [];

async function cleanup(code) {
  try {
    ws?.close();
  } catch {}
  browser.kill();
  server.close();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(code);
}

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, bad) => pending.set(id, { ok, bad, method }));
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

const KEYS = {
  Space: { key: ' ', keyCode: 32 }, Enter: { key: 'Enter', keyCode: 13 }, Escape: { key: 'Escape', keyCode: 27 },
  ArrowUp: { key: 'ArrowUp', keyCode: 38 }, ArrowDown: { key: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', keyCode: 37 }, ArrowRight: { key: 'ArrowRight', keyCode: 39 },
  KeyP: { key: 'p', keyCode: 80 }, KeyC: { key: 'c', keyCode: 67 }, KeyN: { key: 'n', keyCode: 78 },
  KeyR: { key: 'r', keyCode: 82 }, KeyW: { key: 'w', keyCode: 87 }, KeyS: { key: 's', keyCode: 83 },
  KeyH: { key: 'h', keyCode: 72 },
  Digit1: { key: '1', keyCode: 49 }, Digit2: { key: '2', keyCode: 50 }, Digit3: { key: '3', keyCode: 51 },
};
async function key(code, holdMs = 30) {
  const k = KEYS[code];
  const base = { code, key: k.key, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: k.key.length === 1 ? k.key : undefined });
  await sleep(holdMs);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(40);
}

/** Canvas üzerinde mantıksal koordinata (lx, ly) tıklar. */
async function clickCanvas(lx, ly, button = 'left') {
  const pt = await evaluate(`(() => {
    const c = document.getElementById('game-canvas'); const r = c.getBoundingClientRect();
    const e = window.arcadeHub.engine;
    return { x: r.left + ${lx} * r.width / e.width, y: r.top + ${ly} * r.height / e.height };
  })()`);
  const common = { x: pt.x, y: pt.y, button, clickCount: 1 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common, buttons: button === 'right' ? 2 : 1 });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common, buttons: 0 });
  await sleep(60);
}

async function shot(name) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shotsDir, `${name}.png`), Buffer.from(r.data, 'base64'));
}

const G = 'window.arcadeHub.engine.game';
const expect = (cond, msg) => {
  if (!cond) problems.push(msg);
};

/** Oyuna özgü senaryolar: gerçek girdi olaylarıyla kritik akışları dener. */
const SCENARIOS = {
  async 2048() {
    await evaluate(`${G}.restart(); ${G}.grid = [[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]`);
    await key('ArrowLeft');
    await sleep(500);
    expect((await state()).state === 'won', '2048: 2048 karosunda "won" olmadı');
    await key('Space');
    const s = await evaluate(`({ st: ${G}.state, c: ${G}.continued })`);
    expect(s.st === 'playing' && s.c, `2048: "devam et" çalışmadı ${JSON.stringify(s)}`);
    await evaluate(`${G}.grid = [[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,8]]; ${G}.grid[3][3] = 0`);
    await key('ArrowRight');
    await key('ArrowDown');
    await sleep(300);
  },

  async minesweeper() {
    await key('Digit3');
    let s = await state();
    expect(s.w === 812 && s.h === 516, `minesweeper: Zor boyutu ${s.w}x${s.h}`);
    await key('Digit1');
    s = await state();
    expect(s.state === 'ready' && s.w === 360, `minesweeper: Kolay'a dönmedi ${JSON.stringify(s)}`);
    const cellPos = (i) => `(() => { const g = ${G}; const S = g.cfg.cell;
      return { x: g.boardX + (${i} % g.cfg.cols) * S + S / 2, y: 84 + Math.floor(${i} / g.cfg.cols) * S + S / 2 }; })()`;
    const first = await evaluate(cellPos(40));
    await clickCanvas(first.x, first.y);
    s = await state();
    expect(s.state === 'playing', `minesweeper: ilk tıklamada başlamadı (${s.state})`);
    const opened = await evaluate(`${G}.board.cells[40].open && !${G}.board.cells[40].mine`);
    expect(opened, 'minesweeper: ilk tıklanan hücre açılmadı / mayın');
    const closed = await evaluate(`${G}.board.cells.findIndex(c => !c.open)`);
    const cp = await evaluate(cellPos(closed));
    await clickCanvas(cp.x, cp.y, 'right');
    expect(await evaluate(`${G}.board.cells[${closed}].flag`), 'minesweeper: sağ tık bayrak koymadı');
    await clickCanvas(cp.x, cp.y, 'right');
    const mine = await evaluate(`${G}.board.cells.findIndex(c => c.mine)`);
    const mp = await evaluate(cellPos(mine));
    await clickCanvas(mp.x, mp.y);
    expect((await state()).state === 'over', 'minesweeper: mayına basınca bitmedi');
    await sleep(800);
    await shot('minesweeper-boom');
    await key('Enter');
    expect((await state()).state === 'ready', 'minesweeper: Enter ile yeniden başlamadı');
  },

  async tetris() {
    await evaluate(`${G}.restart()`);
    await key('ArrowLeft', 500); // DAS/ARR: basılı tutunca duvara kadar gitmeli
    const minX = await evaluate(`(() => { const p = ${G}.current; let m = 99;
      p.matrix.forEach(row => row.forEach((v, c) => { if (v) m = Math.min(m, p.x + c); })); return m; })()`);
    expect(minX === 0, `tetris: DAS ile sola dayanmadı (x=${minX})`);
    await key('KeyC');
    expect(await evaluate(`${G}.hold !== null`), 'tetris: C ile tutma çalışmadı');
    await evaluate(`(() => { const g = ${G};
      for (let r = 16; r < 20; r++) for (let c = 1; c < 10; c++) g.board[r][c] = 'O';
      g.current = { type: 'I', rot: 1, x: -2, y: 0, matrix: [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]] }; })()`);
    const before = await evaluate(`${G}.score`);
    await key('Space');
    await sleep(400);
    const after = await evaluate(`({ lines: ${G}.lines, score: ${G}.score, rest: ${G}.board.flat().filter(Boolean).length })`);
    expect(after.lines === 4 && after.score - before >= 800 && after.rest === 0, `tetris: 4 satır silinmedi ${JSON.stringify(after)}`);
  },

  async pong() {
    await evaluate(`${G}.init()`);
    await key('Digit2');
    expect(await evaluate(`${G}.mode === 2`), 'pong: 2 tuşu 2 oyuncu modunu seçmedi');
    await key('Space');
    const y0 = await evaluate(`({ a: ${G}.p1.y, b: ${G}.p2.y })`);
    await key('ArrowUp', 250);
    await key('KeyS', 250);
    const y1 = await evaluate(`({ a: ${G}.p1.y, b: ${G}.p2.y })`);
    expect(y1.b < y0.b && y1.a > y0.a, `pong: raketler tuşlarla hareket etmedi ${JSON.stringify([y0, y1])}`);
    await evaluate(`${G}.setMode(1)`);
  },

  async tictactoe() {
    await evaluate(`${G}.init()`);
    await key('Digit1');
    await key('Space');
    const cell = (i) => [30 + (i % 3) * 130 + 65, 52 + Math.floor(i / 3) * 130 + 65];
    await clickCanvas(...cell(4));
    await sleep(700);
    const n = await evaluate(`${G}.board.filter(Boolean).length`);
    expect(n === 2, `tictactoe: oyuncu + AI hamlesi bekleniyordu, tahtada ${n} işaret`);
    // Kalan hamleleri klavye imleciyle oyna; zor AI'ye karşı sonuç kayıp olamaz
    for (let k = 0; k < 12 && (await state()).state === 'playing'; k++) {
      const free = await evaluate(`${G}.board.findIndex(v => !v)`);
      await clickCanvas(...cell(free));
      await sleep(650);
    }
    const r = await evaluate(`${G}.result && ${G}.result.player`);
    expect(r !== 'X', 'tictactoe: zor AI kaybetti');
    await sleep(900);
  },

  async connect4() {
    await evaluate(`${G}.init()`);
    await key('Digit1');
    await key('Space');
    await clickCanvas(42 + 3 * 88 + 44, 300);
    await sleep(2000);
    let n = await evaluate(`${G}.board.flat().filter(Boolean).length`);
    expect(n === 2, `connect4: fare + AI hamlesi bekleniyordu, tahtada ${n} taş`);
    await key('ArrowLeft');
    expect(await evaluate(`${G}.selCol`) === 2, 'connect4: ← sütun seçimini değiştirmedi');
    await key('Enter');
    await sleep(2000);
    n = await evaluate(`${G}.board.flat().filter(Boolean).length`);
    expect(n === 4, `connect4: klavye + AI hamlesi bekleniyordu, tahtada ${n} taş`);
    expect(await evaluate(`${G}.board.some(r => r[2] === 1)`), 'connect4: klavye ile seçilen sütuna düşmedi');
  },

  async memory() {
    await evaluate(`${G}.restart()`);
    // Bir eşleşen çifti gerçek tıklamalarla aç
    const pos = (i) => [18 + (i % 4) * 144 + 66, 56 + Math.floor(i / 4) * 144 + 66];
    const pair = await evaluate(`(() => { const c = ${G}.cards; const j = c.findIndex((d, k) => k > 0 && d.face === c[0].face); return j; })()`);
    await clickCanvas(...pos(0));
    await clickCanvas(...pos(pair));
    await sleep(300);
    expect(await evaluate(`${G}.found === 1 && ${G}.moves === 1`), 'memory: eşleşen çift tıklamayla bulunmadı');
    await evaluate(`${G}.cards.forEach(c => c.target = 1)`); // görsel kontrol için tüm yüzler
    await sleep(400);
  },

  async life() {
    await evaluate(`${G}.init()`);
    await key('KeyC');
    expect(await evaluate(`${G}.population`) === 0, 'life: C temizlemedi');
    // Fareyle sürükleyerek çizim
    const pt = await evaluate(`(() => { const r = document.getElementById('game-canvas').getBoundingClientRect();
      return { x: r.left + 105 * r.width / 800, y: r.top + 205 * r.height / 600, sx: r.width / 800 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let k = 1; k <= 10; k++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x + k * 30 * pt.sx, y: pt.y, button: 'left', buttons: 1 });
      await sleep(20);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x + 300 * pt.sx, y: pt.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(100);
    const drawn = await evaluate(`${G}.population`);
    expect(drawn === 31, `life: sürükleyerek çizim 31 hücre bekleniyordu, ${drawn}`);
    await key('Digit3');
    await key('Space');
    await sleep(800);
    const s = await evaluate(`({ run: ${G}.running, gen: ${G}.generation })`);
    expect(s.run && s.gen > 3, `life: Space ile çalışmadı ${JSON.stringify(s)}`);
    // Dokunmatik araç çubuğu: OYNAT/DURDUR düğmesi
    const r = await evaluate(`${G}.tools.find(t => t.id === 'run').rect`);
    await clickCanvas(r.x + r.w / 2, r.y + r.h / 2);
    expect(!(await evaluate(`${G}.running`)), 'life: araç çubuğu DURDUR düğmesi çalışmadı');
    const pop = await evaluate(`${G}.population`);
    const t = await evaluate(`${G}.tools.find(t => t.id === 'clear').rect`);
    await clickCanvas(t.x + t.w / 2, t.y + t.h / 2);
    expect(pop > 0 && (await evaluate(`${G}.population`)) === 0, 'life: araç çubuğu TEMİZLE düğmesi çalışmadı');
    const pt2 = await evaluate(`${G}.tools.find(t => t.id === 'pattern').rect`);
    await clickCanvas(pt2.x + pt2.w / 2, pt2.y + pt2.h / 2);
    expect((await evaluate(`${G}.population`)) === 5, 'life: araç çubuğu desen (glider) düğmesi çalışmadı');
  },

  async lightsout() {
    await evaluate(`${G}.restart()`);
    const initial = await evaluate(`${G}.grid.join('')`);
    await clickCanvas(24 + 41, 54 + 41); // sol üst hücre
    expect((await evaluate(`${G}.moves`)) === 1, 'lightsout: hücre tıklaması hamle saymadı');
    await clickCanvas(24 + 75, 550 - 21); // SIFIRLA
    expect((await evaluate(`${G}.grid.join('')`)) === initial, 'lightsout: SIFIRLA düğmesi başlangıca döndürmedi');
    await clickCanvas(184 + 65, 550 - 21); // İPUCU
    expect((await evaluate(`${G}.hintCell`)) >= 0, 'lightsout: İPUCU düğmesi hücre göstermedi');
  },
};

const state = () => evaluate(`(() => { const g = window.arcadeHub.engine.game;
  return { id: g.constructor.meta.id, state: g.state, score: g.score, paused: window.arcadeHub.engine.paused,
           w: window.arcadeHub.engine.width, h: window.arcadeHub.engine.height }; })()`);

try {
  // DevTools uç noktası hazır olana kadar bekle
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch {}
    await sleep(200);
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) throw new Error('DevTools sayfa hedefi bulunamadı');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, bad) => {
    ws.onopen = ok;
    ws.onerror = bad;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.bad(new Error(`${p.method}: ${msg.error.message}`));
      else p.ok(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      problems.push(`istisna: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(msg.params.type)) {
      problems.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    } else if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
      problems.push(`log.${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
    }
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  // Alt dizin yayınını taklit ederek aç (GitHub Pages: kullanici.github.io/arcade-hub/)
  const BASE = liveUrl || `http://127.0.0.1:${HTTP_PORT}/arcade-hub/`;
  console.log(`Test adresi: ${BASE}`);
  await send('Page.navigate', { url: `${BASE}#olmayan-oyun` });
  await sleep(1200);
  const games = await evaluate(`window.arcadeHub.games.map(G => G.meta.id)`);
  const first = await state();
  const hashNow = await evaluate('location.hash');
  console.log(`Geçersiz hash → ${first.id} (${hashNow})`);
  if (hashNow !== '#snake') problems.push(`geçersiz hash #snake'e düzeltilmedi: ${hashNow}`);
  if (first.id !== 'snake') problems.push(`geçersiz hash Snake açmadı: ${first.id}`);
  const menuCount = await evaluate(`document.querySelectorAll('#game-menu .menu-btn').length`);
  if (menuCount !== games.length) problems.push(`menü buton sayısı ${menuCount} ≠ ${games.length}`);

  // 1) Her oyunu hash ile aç, temel girdilerle oynat
  for (const id of games) {
    await evaluate(`location.hash = ${JSON.stringify(id)}`);
    await sleep(350);
    let s = await state();
    if (s.id !== id) problems.push(`#${id} hash'i ${s.id} oyununu açtı`);
    const active = await evaluate(`document.querySelector('.menu-btn.active')?.dataset.id`);
    if (active !== id) problems.push(`#${id}: aktif menü butonu ${active}`);
    await shot(`${id}-ready`);

    await key('Space');
    await clickCanvas(s.w / 2, s.h / 2);
    for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Space', 'Enter']) await key(k);
    await clickCanvas(s.w * 0.3, s.h * 0.6);
    await clickCanvas(s.w * 0.7, s.h * 0.4, 'right');
    await sleep(700);
    s = await state();
    if (s.state === 'playing') {
      await key('KeyP');
      if (!(await state()).paused) problems.push(`${id}: P ile duraklamadı`);
      await shot(`${id}-paused`);
      await key('Escape');
      if ((await state()).paused) problems.push(`${id}: Esc ile devam etmedi`);
    }
    await sleep(400);
    await shot(`${id}-play`);
    if (SCENARIOS[id]) {
      await SCENARIOS[id]();
      await shot(`${id}-scenario`);
    }
    console.log(`  ${id.padEnd(12)} durum=${(await state()).state}`);
  }

  // 2) Menü tıklamasıyla açılış (hashchange akışı)
  for (const id of games) {
    await evaluate(`document.querySelector('.menu-btn[data-id="${id}"]').click()`);
    await sleep(60);
    const s = await state();
    if (s.id !== id) problems.push(`menü tıklaması ${id} yerine ${s.id} açtı`);
    if (await evaluate(`document.activeElement?.classList.contains('menu-btn')`)) problems.push(`${id}: buton blur edilmedi`);
  }

  // 3) Hızlı geçiş: 12 oyun × 8 tur, her karede
  for (let round = 0; round < 8; round++) {
    for (const id of games) {
      await evaluate(`location.hash = ${JSON.stringify(id)}`);
      await sleep(16);
    }
  }
  await sleep(500);
  const leakCheck = await evaluate(`(() => { const e = window.arcadeHub.engine; return { keys: e.input.keysDown.size, gesture: !!e.input._gesture }; })()`);
  if (leakCheck.keys || leakCheck.gesture) problems.push(`hızlı geçiş sonrası artık girdi durumu: ${JSON.stringify(leakCheck)}`);

  // 4) Mobil genişlik (375px)
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 740, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  for (const id of games) {
    await evaluate(`location.hash = ${JSON.stringify(id)}`);
    await sleep(250);
    const m = await evaluate(`(() => {
      const c = document.getElementById('game-canvas').getBoundingClientRect();
      const e = window.arcadeHub.engine;
      return { scrollW: document.documentElement.scrollWidth, cw: c.width, ch: c.height, left: c.left, right: c.right,
               ratio: (c.width / c.height) / (e.width / e.height), dpr: e.canvas.width / e.width };
    })()`);
    if (m.scrollW > 375) problems.push(`mobil ${id}: yatay taşma (scrollWidth ${m.scrollW})`);
    if (m.left < 0 || m.right > 375) problems.push(`mobil ${id}: canvas ekrandan taşıyor (${m.left}–${m.right})`);
    if (Math.abs(m.ratio - 1) > 0.02) problems.push(`mobil ${id}: en-boy oranı bozuk (${m.ratio.toFixed(3)})`);
    if (Math.abs(m.dpr - 2) > 0.01) problems.push(`mobil ${id}: HiDPI ölçeği ${m.dpr}`);
    await shot(`mobile-${id}`);
  }
  await sleep(300);

  // 5) Dokunmatik girdi (touch emülasyonu): tap, uzun basış, swipe
  const css = (lx, ly) => evaluate(`(() => { const r = document.getElementById('game-canvas').getBoundingClientRect();
    const e = window.arcadeHub.engine; return { x: r.left + ${lx} * r.width / e.width, y: r.top + ${ly} * r.height / e.height }; })()`);
  const touch = async (lx, ly, { hold = 60, dx = 0, dy = 0 } = {}) => {
    const p = await css(lx, ly);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    const steps = dx || dy ? 6 : 0;
    for (let k = 1; k <= steps; k++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + (dx * k) / steps, y: p.y + (dy * k) / steps }] });
      await sleep(16);
    }
    await sleep(hold);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(80);
  };
  const go = async (id) => {
    await evaluate(`location.hash = ${JSON.stringify(id)}`);
    await sleep(200);
  };

  await go('flappy');
  await evaluate(`${G}.init()`);
  await touch(200, 300);
  expect((await state()).state === 'playing', 'dokunma: Flappy dokunarak başlamadı');

  await go('2048');
  await evaluate(`${G}.restart(); ${G}.grid = [[2,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]`);
  await touch(250, 250, { dx: 90 });
  await sleep(200);
  expect(await evaluate(`${G}.grid[0][3] === 2`), 'dokunma: 2048 sağa swipe çalışmadı');

  await go('snake');
  await evaluate(`${G}.restart()`);
  await touch(300, 300, { dy: -90 });
  await sleep(300);
  expect(await evaluate(`${G}.dir.y === -1`), 'dokunma: Snake yukarı swipe çalışmadı');

  await go('tetris');
  await evaluate(`${G}.restart()`);
  const rot0 = await evaluate(`${G}.current.rot`);
  await touch(150, 300);
  expect((await evaluate(`${G}.current.rot`)) !== rot0, 'dokunma: Tetris dokunma döndürmedi');
  const x0 = await evaluate(`${G}.current.x`);
  const cellCss = (await css(30, 0)).x - (await css(0, 0)).x;
  await touch(150, 300, { dx: cellCss * 3.4 });
  expect((await evaluate(`${G}.current.x`)) === x0 + 3, 'dokunma: Tetris sürükleme 3 hücre kaydırmadı');

  await go('minesweeper');
  await evaluate(`${G}.setDifficulty('easy')`);
  await touch(180, 84 + 4 * 36 + 18);
  expect((await state()).state === 'playing', 'dokunma: Minesweeper dokunmayla açılmadı');
  const closed = await evaluate(`${G}.board.cells.findIndex(c => !c.open)`);
  await touch(16 + 2 + (closed % 9) * 36 + 18, 84 + Math.floor(closed / 9) * 36 + 18, { hold: 600 });
  expect(await evaluate(`${G}.board.cells[${closed}].flag`), 'dokunma: Minesweeper uzun basış bayrak koymadı');
  expect(await evaluate(`${G}.board.cells[${closed}].open === false`), 'dokunma: uzun basış hücreyi de açtı');

  await go('life');
  const run = await evaluate(`${G}.tools.find(t => t.id === 'run').rect`);
  await touch(run.x + run.w / 2, run.y + run.h / 2);
  expect(await evaluate(`${G}.running`), 'dokunma: Life OYNAT düğmesi çalışmadı');
  await shot('mobile-touch-life');

  console.log(`\n${games.length} oyun hash/menü/hızlı geçiş/mobil/dokunmatik kontrolünden geçirildi.`);
} catch (err) {
  problems.push(`test hatası: ${err.stack || err.message}`);
}

if (problems.length) {
  console.error(`\n${problems.length} sorun:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  await cleanup(1);
} else {
  console.log('Konsolda hata/uyarı yok ✓');
  await cleanup(0);
}
