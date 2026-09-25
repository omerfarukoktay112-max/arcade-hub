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

  destroy() {
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
    if (PREVENT_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat && !this.keysDown.has(e.code)) this.keysPressed.add(e.code);
    this.keysDown.add(e.code);
  }

  _onKeyUp(e) {
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

  _toLogical(e) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - r.left) * this.width) / r.width,
      y: ((e.clientY - r.top) * this.height) / r.height,
    };
  }

  _onPointerDown(e) {
    if (this._gesture) return; // ikinci parmakları yok say
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* bazı tarayıcılar desteklemez */
    }
    const p = this.pointer;
    const pos = this._toLogical(e);
    p.x = p.startX = pos.x;
    p.y = p.startY = pos.y;
    p.isDown = true;
    p.pressed = true;
    p.type = e.pointerType || 'mouse';
    p.button = e.button === 2 ? 2 : 0;

    const gesture = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY,
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
    const p = this.pointer;
    const pos = this._toLogical(e);
    p.x = pos.x;
    p.y = pos.y;
    if (e.pointerType === 'mouse') p.hover = true;

    const g = this._gesture;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist > TAP_SLOP_PX && !g.moved) {
      g.moved = true;
      this._cancelLongPress();
    }
    if (!g.swiped && !g.longPressed && dist >= SWIPE_PX) {
      g.swiped = true;
      this.swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
  }

  _onPointerUp(e) {
    const g = this._gesture;
    if (!g || g.id !== e.pointerId) return;
    const p = this.pointer;
    const pos = this._toLogical(e);
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
