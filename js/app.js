/**
 * app.js — oyun kaydı, menü üretimi, hash yönlendirme, dil, oyun teması ve ayar paneli.
 * Oyun listesinin TEK kaynağı aşağıdaki GAMES dizisidir; menü meta bilgisinden üretilir.
 */
import { Engine } from './core/Engine.js';
import { NEON, optionLabel } from './core/BaseGame.js';
import { t, LANGS, getLang, setLang, isSupported, detectLang, onLangChange } from './core/I18n.js';
import { SnakeGame } from './games/SnakeGame.js';
import { Game2048 } from './games/Game2048.js';
import { MinesweeperGame } from './games/MinesweeperGame.js';
import { TetrisGame } from './games/TetrisGame.js';
import { PongGame } from './games/PongGame.js';
import { BreakoutGame } from './games/BreakoutGame.js';
import { FlappyGame } from './games/FlappyGame.js';
import { TicTacToeGame } from './games/TicTacToeGame.js';
import { ConnectFourGame } from './games/ConnectFourGame.js';
import { LightsOutGame } from './games/LightsOutGame.js';
import { MemoryGame } from './games/MemoryGame.js';
import { LifeGame } from './games/LifeGame.js';

const GAMES = [
  SnakeGame,
  Game2048,
  MinesweeperGame,
  TetrisGame,
  PongGame,
  BreakoutGame,
  FlappyGame,
  TicTacToeGame,
  ConnectFourGame,
  LightsOutGame,
  MemoryGame,
  LifeGame,
];

const DEFAULT_ID = SnakeGame.meta.id;
const DEFAULT_THEME = [NEON.cyan, NEON.pink];
const themeOf = (Game) => Game.meta.theme || DEFAULT_THEME;

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const menu = $('game-menu');
const stage = document.querySelector('.stage');
const titleEl = $('game-title');
const descEl = $('game-description');
const controlsEl = $('game-controls');
const pauseBtn = $('pause-btn');
const muteBtn = $('mute-btn');
const settingsBtn = $('settings-btn');
const langSelect = $('lang-select');
const settingsEl = $('settings');
const settingsTitle = $('settings-title');
const settingsBody = $('settings-body');
const settingsReset = $('settings-reset');

const engine = new Engine(canvas, { onChange: syncToolbar, onOpenSettings: openSettings });
const storage = engine.storage;
const buttons = new Map();

/* ---------- Menü ---------- */

function buildMenu() {
  const frag = document.createDocumentFragment();
  for (const Game of GAMES) {
    const { id } = Game.meta;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.dataset.id = id;
    const [a, b] = themeOf(Game);
    btn.style.setProperty('--btn-accent', a);
    btn.style.setProperty('--btn-accent-2', b);
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

/* ---------- Tema ve geçiş ---------- */

/** Üst çubuk, menü ve sahne oyunun tema renklerini alır (CSS'te @property ile yumuşak geçiş). */
function applyTheme(Game) {
  const [a, b] = themeOf(Game);
  const root = document.documentElement;
  root.style.setProperty('--accent', a);
  root.style.setProperty('--accent-2', b);
  root.dataset.game = Game.meta.id;
}

/** Başlık/açıklama için giriş animasyonunu yeniden tetikler (canvas'taki perde Engine'de). */
function playStageEnter() {
  stage.classList.remove('entering');
  void stage.offsetWidth; // animasyonu yeniden başlatmak için yeniden akış
  stage.classList.add('entering');
}

/* ---------- Yönlendirme ---------- */

function route() {
  let id = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  let Game = findGame(id);
  if (!Game) {
    Game = findGame(DEFAULT_ID);
    id = DEFAULT_ID;
    history.replaceState(null, '', `#${id}`);
  }
  if (engine.game && engine.game.constructor === Game) return;

  closeSettings(false);
  engine.loadGame(Game);
  applyTheme(Game);
  renderGameText();
  playStageEnter();

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
  syncToolbar();
}

/** Geçerli dile göre oyun adı, açıklama, kontroller ve menü etiketleri. */
function renderGameText() {
  for (const Game of GAMES) buttons.get(Game.meta.id).textContent = Game.meta.title;
  const Game = engine.game?.constructor;
  if (!Game) return;
  const { title, description, controls } = Game.meta;
  titleEl.textContent = title;
  descEl.textContent = description;
  controlsEl.textContent = controls;
  document.title = `${title} · Arcade Hub`;
}

/* ---------- Üst çubuk ---------- */

function setToolButton(btn, icon, label) {
  btn.querySelector('.ico').textContent = icon;
  btn.querySelector('.lbl').textContent = label;
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

function syncToolbar() {
  setToolButton(pauseBtn, engine.paused ? '▶' : '⏸', engine.paused ? t('ui.resume') : t('ui.pause'));
  const muted = engine.sound.muted;
  setToolButton(muteBtn, muted ? '🔇' : '🔊', muted ? t('ui.soundOff') : t('ui.soundOn'));
  muteBtn.setAttribute('aria-pressed', String(muted));
  const hasSettings = !!engine.game?.constructor.settings.length;
  settingsBtn.disabled = !hasSettings;
  setToolButton(settingsBtn, '⚙', t('ui.settings'));
  settingsBtn.title = hasSettings ? t('ui.settings') : t('ui.noSettings');
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

settingsBtn.addEventListener('click', () => openSettings());

/* ---------- Dil ---------- */

function buildLangSelect() {
  for (const lang of LANGS) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.short;
    opt.title = lang.name;
    langSelect.appendChild(opt);
  }
  langSelect.addEventListener('change', () => {
    if (setLang(langSelect.value)) storage.set('lang', langSelect.value);
    langSelect.blur();
  });
}

/** Statik HTML metinleri (data-i18n*) ve dile bağlı tüm DOM parçaları. */
function applyLang() {
  const lang = getLang();
  document.documentElement.lang = lang;
  langSelect.value = lang;
  const langName = LANGS.find((l) => l.code === lang)?.name || lang;
  langSelect.title = `${t('ui.language')}: ${langName}`;
  langSelect.setAttribute('aria-label', t('ui.language'));
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll('[data-i18n-content]')) el.setAttribute('content', t(el.dataset.i18nContent));
  renderGameText();
  syncToolbar();
  if (isSettingsOpen()) renderSettings();
}

function initLang() {
  const saved = storage.get('lang', null);
  const code = isSupported(saved) ? saved : detectLang(navigator.languages || [navigator.language]);
  setLang(code);
  onLangChange(applyLang);
  applyLang();
}

/* ---------- Ayar paneli ---------- */

const isSettingsOpen = () => settingsEl.classList.contains('open');

/** Oyunun `static settings` şemasından seçenek düğmeleri üretir. */
function renderSettings() {
  const game = engine.game;
  const schema = game?.constructor.settings || [];
  settingsTitle.textContent = t('ui.settingsTitle', { game: game?.meta.title ?? '' });
  settingsBody.textContent = '';
  if (!schema.length) {
    const p = document.createElement('p');
    p.className = 'settings-empty';
    p.textContent = t('ui.noSettings');
    settingsBody.appendChild(p);
    return;
  }
  for (const def of schema) {
    const group = document.createElement('fieldset');
    group.className = `setting setting-${def.type || 'choice'}`;
    const legend = document.createElement('legend');
    legend.textContent = t(def.labelKey);
    if (def.live) {
      const live = document.createElement('small');
      live.className = 'live';
      live.textContent = t('ui.liveNote');
      legend.append(' ', live);
    }
    group.appendChild(legend);
    const row = document.createElement('div');
    row.className = 'seg';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', t(def.labelKey));
    def.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt';
      btn.setAttribute('role', 'radio');
      const checked = game.settings[def.id] === opt.value;
      btn.setAttribute('aria-checked', String(checked));
      btn.dataset.setting = def.id;
      btn.dataset.index = String(i);
      if (opt.color) {
        const sw = document.createElement('span');
        sw.className = opt.color === 'rainbow' ? 'sw rainbow' : 'sw';
        if (opt.color !== 'rainbow') sw.style.setProperty('--sw', opt.color);
        sw.setAttribute('aria-hidden', 'true');
        btn.appendChild(sw);
      }
      const label = document.createElement('span');
      label.textContent = optionLabel(opt);
      btn.appendChild(label);
      if (opt.note) {
        const note = document.createElement('small');
        note.textContent = opt.note;
        btn.appendChild(note);
      }
      row.appendChild(btn);
    });
    group.appendChild(row);
    settingsBody.appendChild(group);
  }
}

settingsBody.addEventListener('click', (e) => {
  const btn = e.target.closest('.opt');
  const game = engine.game;
  if (!btn || !game) return;
  const def = game.constructor.settings.find((d) => d.id === btn.dataset.setting);
  const opt = def?.options[Number(btn.dataset.index)];
  if (!opt) return;
  if (game.setSetting(def.id, opt.value)) engine.sound.beep(520, 0.04);
  const { setting, index } = btn.dataset;
  renderSettings();
  settingsBody.querySelector(`.opt[data-setting="${setting}"][data-index="${index}"]`)?.focus();
});

settingsReset.addEventListener('click', () => {
  const game = engine.game;
  if (!game) return;
  for (const def of game.constructor.settings) game.setSetting(def.id, def.default);
  engine.sound.beep(440, 0.05);
  renderSettings();
});

let lastFocus = null;

function openSettings() {
  if (!engine.game?.constructor.settings.length || isSettingsOpen()) return;
  lastFocus = document.activeElement;
  renderSettings();
  engine.setSuspended(true);
  settingsEl.classList.add('open');
  settingsEl.setAttribute('aria-hidden', 'false');
  settingsBtn.setAttribute('aria-expanded', 'true');
  (settingsBody.querySelector('[aria-checked="true"]') || settingsBody.querySelector('button'))?.focus();
}

function closeSettings(restoreFocus = true) {
  if (!isSettingsOpen()) return;
  settingsEl.classList.remove('open');
  settingsEl.setAttribute('aria-hidden', 'true');
  settingsBtn.setAttribute('aria-expanded', 'false');
  engine.setSuspended(false); // oynanan bir oyun varsa duraklatılmış olarak döner
  syncToolbar();
  if (restoreFocus && lastFocus && lastFocus !== document.body) lastFocus.focus?.();
  if (lastFocus === settingsBtn || !restoreFocus) settingsBtn.blur();
  lastFocus = null;
}

settingsEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeSettings();
});

// Panel açıkken Esc paneli kapatır; tuş oyuna/Engine'e ulaşmaz (Esc aksi halde duraklatmayı değiştirirdi).
window.addEventListener('keydown', (e) => {
  if (!isSettingsOpen()) return;
  if (e.code === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeSettings();
  } else if (e.code !== 'Tab') {
    e.stopImmediatePropagation(); // Enter/Space/oklar yalnızca paneldeki düğmeler içindir
  }
}, true);

/* ---------- Başlat ---------- */

buildMenu();
buildLangSelect();
initLang();
window.addEventListener('hashchange', route);
route();
syncToolbar();

// Hata ayıklama ve otomatik testler için (konsoldan: arcadeHub.engine.game)
window.arcadeHub = { engine, games: GAMES, openSettings, closeSettings, setLang };
