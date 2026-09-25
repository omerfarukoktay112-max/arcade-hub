/**
 * Storage — localStorage sarmalayıcı.
 * Gizli pencere, kapalı site verisi veya kota hatası gibi durumlarda sessizce
 * varsayılan değere düşer; oyunlar hiçbir zaman istisna görmez.
 */
const PREFIX = 'arcade-hub:';

function backend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const Storage = {
  get(key, fallback = null) {
    try {
      const raw = backend()?.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      const store = backend();
      if (!store) return false;
      store.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      backend()?.removeItem(PREFIX + key);
    } catch {
      /* yok say */
    }
  },

  /** Kayıtlı en iyi değer ya da null. */
  getBest(key) {
    const value = this.get(`best:${key}`, null);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  },

  /**
   * Yeni bir sonucu dener; rekor kırıldıysa kaydeder ve true döner.
   * lowerIsBetter: süre gibi "düşük olan iyi" skorlar için.
   */
  submitScore(key, value, lowerIsBetter = false) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (!lowerIsBetter && value <= 0) return false;
    const best = this.getBest(key);
    const better = best === null || (lowerIsBetter ? value < best : value > best);
    if (better) this.set(`best:${key}`, value);
    return better;
  },
};
