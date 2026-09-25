/**
 * app.js — oyun kaydı, menü üretimi ve hash yönlendirme.
 * Oyun listesinin TEK kaynağı aşağıdaki GAMES dizisidir; menü meta bilgisinden üretilir.
 */
import { Engine } from './core/Engine.js';
import { SnakeGame } from './games/SnakeGame.js';
import { Game2048 } from './games/Game2048.js';
import { MinesweeperGame } from './games/MinesweeperGame.js';
import { TetrisGame } from './games/TetrisGame.js';
import { PongGame } from './games/PongGame.js';
import { BreakoutGame } from './games/BreakoutGame.js';
import { FlappyGame } from './games/FlappyGame.js';
import { TicTacToeGame } from './games/TicTacToeGame.js';

const GAMES = [
  SnakeGame,
  Game2048,
  MinesweeperGame,
  TetrisGame,
  PongGame,
  BreakoutGame,
  FlappyGame,
  TicTacToeGame,
];

const DEFAULT_ID = SnakeGame.meta.id;

const canvas = document.getElementById('game-canvas');
const menu = document.getElementById('game-menu');
const titleEl = document.getElementById('game-title');
const descEl = document.getElementById('game-description');
const controlsEl = document.getElementById('game-controls');
const pauseBtn = document.getElementById('pause-btn');
const muteBtn = document.getElementById('mute-btn');

const engine = new Engine(canvas, { onChange: syncToolbar });
const buttons = new Map();

function buildMenu() {
  const frag = document.createDocumentFragment();
  for (const Game of GAMES) {
    const { id, title } = Game.meta;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.textContent = title;
    btn.dataset.id = id;
    btn.addEventListener('click', onMenuClick);
    buttons.set(id, btn);
    frag.appendChild(btn);
  }
  menu.appendChild(frag);
}

function onMenuClick(e) {
  const btn = e.currentTarget;
  btn.blur(); // Enter/Space oyunda tekrar butona tıklamasın
  const id = btn.dataset.id;
  if (location.hash.slice(1) === id) return;
  location.hash = id;
}

function findGame(id) {
  return GAMES.find((G) => G.meta.id === id);
}

function route() {
  let id = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  let Game = findGame(id);
  if (!Game) {
    Game = findGame(DEFAULT_ID);
    id = DEFAULT_ID;
    history.replaceState(null, '', `#${id}`);
  }
  if (engine.game && engine.game.constructor === Game) return;

  engine.loadGame(Game);
  const { title, description, controls } = Game.meta;
  titleEl.textContent = title;
  descEl.textContent = description;
  controlsEl.textContent = controls;
  document.title = `${title} · Arcade Hub`;

  for (const [bid, btn] of buttons) {
    const active = bid === id;
    btn.classList.toggle('active', active);
    if (active) {
      btn.setAttribute('aria-current', 'page');
      btn.scrollIntoView({ block: 'nearest', inline: 'center' });
    } else {
      btn.removeAttribute('aria-current');
    }
  }
}

function syncToolbar() {
  pauseBtn.textContent = engine.paused ? '▶ Devam' : '⏸ Duraklat';
  const muted = engine.sound.muted;
  muteBtn.textContent = muted ? '🔇 Sessiz' : '🔊 Ses açık';
  muteBtn.setAttribute('aria-pressed', String(muted));
}

pauseBtn.addEventListener('click', (e) => {
  e.currentTarget.blur();
  engine.togglePause();
  syncToolbar();
});

muteBtn.addEventListener('click', (e) => {
  e.currentTarget.blur();
  engine.sound.toggleMuted();
  if (!engine.sound.muted) engine.sound.beep(880, 0.06);
  syncToolbar();
});

buildMenu();
window.addEventListener('hashchange', route);
route();
syncToolbar();

// Hata ayıklama ve otomatik testler için (konsoldan: arcadeHub.engine.game)
window.arcadeHub = { engine, games: GAMES };
