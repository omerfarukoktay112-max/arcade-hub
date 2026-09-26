/**
 * Input — klavye ve pointer (fare + dokunma + kalem) girdisinin TEK kaynağı.
 *
 * Oyunlar asla kendi event listener'ını eklemez; her karede bu sınıfın
 * durumunu okur. Tek karelik bilgiler (wasPressed, pointer.clicked, swipe...)
 * Engine'in çağırdığı endFrame() ile sıfırlanır.
 */
const PREVENT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const LONG_PRESS_MS = 400;
const SWIPE_PX = 30; // CSS pikseli
const TAP_SLOP_PX = 12; // dokunmanın hâlâ "tap" sayıldığı en fazla kayma
/**
 * Swipe yönü ancak bir eksen diğerinin bu kadar katıysa belirlenir; çapraz (belirsiz) harekette
 * hareket SWIPE_PX × 2'yi geçene kadar beklenir. Aksi halde Tetris'te yana sürüklerken parmağın
 * ilk anda biraz aşağı kayması istemeden sert düşürme yapıyordu.
 */
const SWIPE_RATIO = 1.4;

function isEditable(el) {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = canvas.width; // mantıksal (oyun) genişliği; Engine günceller
    this.height = canvas.height;

    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysTyped = new Set(); // bu karede basılan e.key değerleri (+, - gibi semboller için)

    /**
     * x, y      : mantıksal canvas koordinatı
     * isDown    : şu an basılı mı
     * pressed   : bu karede basıldı mı (ham pointerdown, her tür)
     * released  : bu karede bırakıldı mı
     * clicked   : bu karede tıklama/dokunma gerçekleşti mi
     *             (fare: basış anında; dokunma: kaydırmadan kısa bırakınca;
     *              uzun basış: button = 2 ile)
     * button    : 0 sol / 2 sağ (uzun basış dahil)
     * type      : 'mouse' | 'touch' | 'pen'
     * hover     : fare canvas üzerinde mi
     */
    this.pointer = {
      x: 0, y: 0,
      isDown: false, pressed: false, released: false, clicked: false,
      button: 0, type: 'mouse', hover: false,
      startX: 0, startY: 0,
    };
    /** Bu karede algılanan kaydırma: 'up' | 'down' | 'left' | 'right' | null */
    this.swipe = null;

    this._gesture = null;
    this._longPressTimer = 0;
    /** Son klavye/pointer olayının zamanı (performance.now). Engine sakin ekranda kare hızını buna göre düşürür. */
    this.lastActivity = 0;
    /**
     * Dokunma yüzeyi: canvas dışındaki bir alan (mobil oyun modunda sahne). Etkinken orada başlayan
     * dokunuşlar da oyuna gider (başparmak tahtayı örtmeden swipe/sürükleme yapabilsin); koordinatlar
     * canvas sınırına sıkıştırılır. app.js açar/kapatır (surfaceEnabled).
     */
    this.surface = null;
    this.surfaceEnabled = false;
    this._onSurfaceDown = this._onSurfaceDown.bind(this);

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerLeave);
    canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  /* ---------- Oyunların kullandığı API ---------- */

  /** Kodlardan herhangi biri basılı mı? */
  isDown(...codes) {
    return codes.some((c) => this.keysDown.has(c));
  }

  /** Kodlardan herhangi birine bu karede yeni mi basıldı? (tuş tekrarı sayılmaz) */
  wasPressed(...codes) {
    return codes.some((c) => this.keysPressed.has(c));
  }

  /**
   * Sembol tuşları için (ör. '+', '-'): e.code fiziksel konumdur ve klavye düzenine göre
   * farklı sembollere denk gelir (Türkçe Q'da '-' tuşunun kodu 'Equal'). Bu yüzden
   * yalnızca sembollerde e.key tabanlı kontrol kullanılır.
   */
  wasTyped(...keys) {
    return keys.some((k) => this.keysTyped.has(k));
  }

  /** Engine'in, bir basışı oyuna ulaşmadan tüketmesi için. */
  consume(...codes) {
    for (const c of codes) this.keysPressed.delete(c);
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Tek karelik tüm girdileri sıfırlar. Her karenin sonunda çağrılır. */
  endFrame() {
    this.keysPressed.clear();
    this.keysTyped.clear();
    this.pointer.pressed = false;
    this.pointer.released = false;
    this.pointer.clicked = false;
    this.swipe = null;
  }

  /** Oyun değişince tüm durumu temizler. */
  reset() {
    this.keysDown.clear();
    this.endFrame();
    this._cancelLongPress();
    this._gesture = null;
    this.pointer.isDown = false;
    this.pointer.button = 0;
  }

  /** Canvas dışındaki dokunma yüzeyini bağlar (bkz. surfaceEnabled). */
  setSurface(el) {
    this.surface?.removeEventListener('pointerdown', this._onSurfaceDown);
    this.surface = el;
    el?.addEventListener('pointerdown', this._onSurfaceDown);
  }

  destroy() {
    this.setSurface(null);
    this.reset();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onPointerDown);
    c.removeEventListener('pointermove', this._onPointerMove);
    c.removeEventListener('pointerup', this._onPointerUp);
    c.removeEventListener('pointercancel', this._onPointerUp);
    c.removeEventListener('pointerleave', this._onPointerLeave);
    c.removeEventListener('contextmenu', this._onContextMenu);
  }

  /* ---------- Klavye ---------- */

  _onKeyDown(e) {
    if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    this.lastActivity = performance.now();
    if (PREVENT_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat && !this.keysDown.has(e.code)) this.keysPressed.add(e.code);
    if (!e.repeat) this.keysTyped.add(e.key);
    this.keysDown.add(e.code);
  }

  _onKeyUp(e) {
    this.lastActivity = performance.now();
    if (PREVENT_KEYS.has(e.code) && !isEditable(e.target)) e.preventDefault();
    this.keysDown.delete(e.code);
  }

  _onBlur() {
    // Pencere odağı kaybedince keyup gelmeyebilir; takılı tuş kalmasın.
    this.keysDown.clear();
    this._cancelLongPress();
    this._gesture = null;
    this.pointer.isDown = false;
  }

  /* ---------- Pointer ---------- */

  _toLogical(e, clamp = false) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 0, y: 0 };
    const x = ((e.clientX - r.left) * this.width) / r.width;
    const y = ((e.clientY - r.top) * this.height) / r.height;
    if (!clamp) return { x, y };
    return { x: Math.min(this.width, Math.max(0, x)), y: Math.min(this.height, Math.max(0, y)) };
  }

  _onSurfaceDown(e) {
    if (!this.surfaceEnabled || e.pointerType === 'mouse' || e.target === this.canvas) return;
    if (e.target.closest?.('button, a, select, input, label')) return; // şerit düğmeleri çalışsın
    this._onPointerDown(e, true);
  }

  _onPointerDown(e, fromSurface = false) {
    this.lastActivity = performance.now();
    if (this._gesture) return; // ikinci parmakları yok say
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* bazı tarayıcılar desteklemez */
    }
    const p = this.pointer;
    const pos = this._toLogical(e, fromSurface);
    p.x = p.startX = pos.x;
    p.y = p.startY = pos.y;
    p.isDown = true;
    p.pressed = true;
    p.type = e.pointerType || 'mouse';
    p.button = e.button === 2 ? 2 : 0;

    const gesture = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, fromSurface,
      type: p.type, moved: false, swiped: false, longPressed: false,
    };
    this._gesture = gesture;

    if (p.type === 'mouse') {
      this._click(p.button);
    } else {
      this._cancelLongPress();
      this._longPressTimer = setTimeout(() => {
        this._longPressTimer = 0;
        if (this._gesture === gesture && !gesture.moved) {
          gesture.longPressed = true;
          this._click(2);
        }
      }, LONG_PRESS_MS);
    }
  }

  _onPointerMove(e) {
    this.lastActivity = performance.now();
    const p = this.pointer;
    const g = this._gesture;
    const pos = this._toLogical(e, !!g?.fromSurface);
    p.x = pos.x;
    p.y = pos.y;
    if (e.pointerType === 'mouse') p.hover = true;

    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist > TAP_SLOP_PX && !g.moved) {
      g.moved = true;
      this._cancelLongPress();
    }
    if (!g.swiped && !g.longPressed && dist >= SWIPE_PX) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) >= Math.min(ax, ay) * SWIPE_RATIO || dist >= SWIPE_PX * 2) {
        g.swiped = true;
        this.swipe = ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      }
    }
  }

  _onPointerUp(e) {
    this.lastActivity = performance.now();
    const g = this._gesture;
    if (!g || g.id !== e.pointerId) return;
    const p = this.pointer;
    const pos = this._toLogical(e, g.fromSurface);
    p.x = pos.x;
    p.y = pos.y;
    p.isDown = false;
    p.released = true;
    this._cancelLongPress();
    if (e.type === 'pointerup' && g.type !== 'mouse' && !g.moved && !g.longPressed) {
      this._click(0);
    }
    this._gesture = null;
  }

  _onPointerLeave(e) {
    if (e.pointerType === 'mouse') this.pointer.hover = false;
  }

  _click(button) {
    this.pointer.clicked = true;
    this.pointer.button = button;
  }

  _cancelLongPress() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = 0;
    }
  }
}
