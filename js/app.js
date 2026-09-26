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
const gameBar = $('game-bar');
const gameBarIcon = $('game-bar-icon');
const gameBarTitle = $('game-bar-title');
const pickerEl = $('picker');
const pickerGrid = $('picker-grid');
const playBarIcon = $('play-bar-icon');
const playBarTitle = $('play-bar-title');
const playPause = $('play-pause');
const playFs = $('play-fs');
const rootEl = document.documentElement;

const engine = new Engine(canvas, { onChange: onEngineChange, onOpenSettings: openSettings });
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

/* ---------- Mobil oyun modu ---------- */

/**
 * Mobilde oyun oynanırken üst çubuk, oyun çubuğu ve metinler gizlenir; canvas'ın üstünde yalnızca
 * ince bir şerit (ad + tam ekran + duraklat) kalır → canvas büyür. Duraklatınca, oyun bitince ya da
 * bir panel açılınca normal görünüme dönülür. Yalnızca kullanıcı bu oyunda canvas'a dokunduktan
 * sonra devreye girer (Life gibi hep "oynanan" oyunlar açılır açılmaz arayüzü gizlemesin).
 */
let engaged = false;
canvas.addEventListener('pointerdown', () => {
  engaged = true;
}, true);
engine.input.setSurface(stage);

function syncPlayMode() {
  const g = engine.game;
  const on = compactQuery.matches && engaged && !!g && g.state === 'playing' && !engine.paused && !engine.suspended;
  // Swipe/sürükleme oyunlarında canvas'ın altındaki boş alan da dokunma yüzeyi olur.
  const surface = on && !!g.meta.touchSurface;
  engine.input.surfaceEnabled = surface;
  rootEl.classList.toggle('touch-surface', surface);
  if (rootEl.classList.contains('play-mode') === on) return;
  rootEl.classList.toggle('play-mode', on);
  if (on) window.scrollTo(0, 0);
  fitMinHeight = Infinity;
  queueFit();
}

function onEngineChange() {
  syncToolbar();
  syncPlayMode();
}

playPause.addEventListener('click', (e) => {
  e.currentTarget.blur();
  engine.togglePause();
  syncToolbar();
});

/* ---------- Tam ekran ---------- */

const fullscreenOk = !!(document.fullscreenEnabled && rootEl.requestFullscreen);
playFs.hidden = !fullscreenOk; // iPhone Safari sayfa için tam ekranı desteklemez

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await rootEl.requestFullscreen({ navigationUI: 'hide' });
    // Yatay oyunlarda ekranı yatay kilitle (Android; desteklenmiyorsa sessizce geç).
    const wide = engine.width > engine.height * 1.2;
    await screen.orientation?.lock?.(wide ? 'landscape' : 'portrait').catch(() => {});
  } catch {
    /* kullanıcı reddetti ya da desteklenmiyor */
  }
}

playFs.addEventListener('click', (e) => {
  e.currentTarget.blur();
  toggleFullscreen();
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) screen.orientation?.unlock?.();
  syncToolbar();
  fitMinHeight = Infinity;
  queueFit();
});

/* ---------- Oyun seçici (mobil) ---------- */

const picks = new Map();
const isPickerOpen = () => pickerEl.classList.contains('open');

function buildPicker() {
  const frag = document.createDocumentFragment();
  for (const Game of GAMES) {
    const { id, icon } = Game.meta;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick';
    btn.dataset.id = id;
    const [a, b] = themeOf(Game);
    btn.style.setProperty('--pa', a);
    btn.style.setProperty('--pb', b);
    const ico = document.createElement('span');
    ico.className = 'pick-icon';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = icon;
    const name = document.createElement('span');
    name.className = 'pick-name';
    const best = document.createElement('span');
    best.className = 'pick-best';
    btn.append(ico, name, best);
    btn.addEventListener('click', () => {
      closePicker(false);
      if (location.hash.slice(1) !== id) location.hash = id;
    });
    picks.set(id, btn);
    frag.appendChild(btn);
  }
  pickerGrid.appendChild(frag);
}

/** Kart metinleri: oyun adı ve (puanlı oyunlarda) varsayılan ayardaki rekor. */
function renderPicker() {
  const current = engine.game?.meta.id;
  for (const Game of GAMES) {
    const { id, title, hasScore, lowerIsBetter } = Game.meta;
    const btn = picks.get(id);
    btn.querySelector('.pick-name').textContent = title;
    const best = hasScore === false || lowerIsBetter ? null : storage.getBest(id);
    btn.querySelector('.pick-best').textContent = best ? t('ui.bestShort', { n: best }) : '';
    if (id === current) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}

function openPicker() {
  if (isPickerOpen()) return;
  closeSettings(false);
  lastFocus = document.activeElement;
  renderPicker();
  engine.setSuspended(true);
  pickerEl.classList.add('open');
  pickerEl.setAttribute('aria-hidden', 'false');
  gameBar.setAttribute('aria-expanded', 'true');
  (pickerGrid.querySelector('[aria-current="page"]') || pickerGrid.querySelector('button'))?.focus();
}

function closePicker(restoreFocus = true) {
  if (!isPickerOpen()) return;
  pickerEl.classList.remove('open');
  pickerEl.setAttribute('aria-hidden', 'true');
  gameBar.setAttribute('aria-expanded', 'false');
  engine.setSuspended(false);
  syncToolbar();
  if (restoreFocus && lastFocus && lastFocus !== document.body) lastFocus.focus?.();
  else document.activeElement?.blur?.();
  lastFocus = null;
}

gameBar.addEventListener('click', () => openPicker());
pickerEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closePicker();
});

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

/* ---------- Görünür yükseklik ---------- */

const canvasWrap = document.querySelector('.canvas-wrap');
const compactQuery = window.matchMedia('(max-width: 640px), (pointer: coarse)'); // CSS'teki mobil düzenle uyumlu
let fitQueued = false;
let fitWidth = 0;
let fitMinHeight = Infinity;

/**
 * Canvas'ın sığması gereken yüksekliği --avail-h olarak yazar: görünür pencere yüksekliği − canvas'ın
 * sayfadaki üst konumu. 75vh mobilde tarayıcı çubuklarını hesaba katmaz ve üstteki çubuk/menü
 * yüksekliği cihaza göre değişir; bu yüzden ölçülür. Masaüstünde eskisi gibi en fazla %75.
 * Mobilde aynı genişlikte görülen EN KÜÇÜK yükseklik kullanılır (svh gibi): kaydırırken adres çubuğu
 * açılıp kapandıkça canvas zıplamaz.
 */
function fitStage() {
  fitQueued = false;
  const vw = window.innerWidth;
  let vh = window.innerHeight;
  const compact = compactQuery.matches;
  if (compact) {
    if (vw !== fitWidth) fitMinHeight = Infinity; // yön değişti
    fitWidth = vw;
    fitMinHeight = Math.min(fitMinHeight, vh);
    vh = fitMinHeight;
  }
  const top = canvasWrap.getBoundingClientRect().top + window.scrollY;
  const room = vh - top - 12;
  const h = compact ? room : Math.min(vh * 0.75, room);
  document.documentElement.style.setProperty('--avail-h', `${Math.max(220, Math.floor(h))}px`);
  // Yatay oyun (Pong, Life, zor Minesweeper): dikey telefonda "yan çevir" ipucu gösterilir.
  if (engine.width > engine.height * 1.2) rootEl.dataset.wide = '';
  else delete rootEl.dataset.wide;
}

function queueFit() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(fitStage);
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
  closePicker(false);
  engaged = false;
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

/**
 * Dokunmatik cihaz (fare/hover yok): kontrol satırı ve alt bilgi klavye yerine dokunma hareketlerini
 * anlatır (meta.touchControls, data-i18n-touch). Dokunmatik ekranlı ama fareli dizüstünde klavye metni kalır.
 */
const touchQuery = window.matchMedia('(hover: none) and (pointer: coarse)');

/** Geçerli dile göre oyun adı, açıklama, kontroller ve menü etiketleri. */
function renderGameText() {
  for (const Game of GAMES) buttons.get(Game.meta.id).textContent = Game.meta.title;
  const Game = engine.game?.constructor;
  if (!Game) return;
  const { title, description, controls, touchControls, icon } = Game.meta;
  titleEl.textContent = title;
  gameBarTitle.textContent = title;
  gameBarIcon.textContent = icon;
  gameBar.setAttribute('aria-label', `${title} · ${t('ui.allGames')}`);
  playBarTitle.textContent = title;
  playBarIcon.textContent = icon;
  descEl.textContent = description;
  controlsEl.textContent = touchQuery.matches ? touchControls : controls;
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
  setToolButton(playPause, engine.paused ? '▶' : '⏸', engine.paused ? t('ui.resume') : t('ui.pause'));
  const fs = !!document.fullscreenElement;
  setToolButton(playFs, fs ? '✕' : '⛶', fs ? t('ui.exitFullscreen') : t('ui.fullscreen'));
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
  const touch = touchQuery.matches;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(touch && el.dataset.i18nTouch ? el.dataset.i18nTouch : el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll('[data-i18n-content]')) el.setAttribute('content', t(el.dataset.i18nContent));
  renderGameText();
  syncToolbar();
  if (isSettingsOpen()) renderSettings();
  if (isPickerOpen()) renderPicker();
}

function initLang() {
  const saved = storage.get('lang', null);
  const code = isSupported(saved) ? saved : detectLang(navigator.languages || [navigator.language]);
  setLang(code);
  onLangChange(applyLang);
  touchQuery.addEventListener?.('change', applyLang);
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

// Panel (ayarlar ya da oyun seçici) açıkken Esc paneli kapatır; tuş oyuna/Engine'e ulaşmaz
// (Esc aksi halde duraklatmayı değiştirirdi).
window.addEventListener('keydown', (e) => {
  if (!isSettingsOpen() && !isPickerOpen()) return;
  if (e.code === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isPickerOpen()) closePicker();
    else closeSettings();
  } else if (e.code !== 'Tab') {
    e.stopImmediatePropagation(); // Enter/Space/oklar yalnızca paneldeki düğmeler içindir
  }
}, true);

/* ---------- Başlat ---------- */

// İlk açılışta hash yoksa mobilde oyun seçici açılır: 12 oyunun varlığı hemen görünsün.
const firstVisitNoHash = !location.hash;

buildMenu();
buildPicker();
buildLangSelect();
initLang();
window.addEventListener('hashchange', route);
route();
syncToolbar();
fitStage();
if (firstVisitNoHash && compactQuery.matches) openPicker();
window.addEventListener('resize', queueFit);
window.addEventListener('orientationchange', queueFit);
// Üst çubuk/menü/başlık yüksekliği değişirse (dil, satır kaydırma, yazı tipi yüklenmesi) yeniden hesapla.
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(queueFit);
  for (const el of [document.querySelector('.topbar'), menu, gameBar, titleEl, canvas]) ro.observe(el);
}

/* ---------- Çevrimdışı çalışma (PWA) ---------- */

// Service worker ilk ziyarette sayfa yüklendikten SONRA devreye girer; o ana kadar yüklenen dosyaları
// (sayfa, CSS, tüm modüller) ona bildiririz ki ilk ziyaretten sonra site çevrimdışı da açılsın.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
    const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map((e) => e.name)];
    reg.active?.postMessage({ type: 'cache', urls });
  }).catch(() => {
    /* desteklenmiyor ya da engellendi: site yine çevrimiçi çalışır */
  });
}

// Hata ayıklama ve otomatik testler için (konsoldan: arcadeHub.engine.game)
window.arcadeHub = { engine, games: GAMES, openSettings, closeSettings, openPicker, closePicker, setLang, toggleFullscreen };
