/**
 * I18n — çoklu dil altyapısı.
 *
 * Sözlükler `js/i18n/<kod>.js` içinde düz anahtar → metin nesneleridir. Metinler `{ad}` biçiminde
 * parametre alabilir; tekil/çoğul gibi durumlar için değer `(params) => string` fonksiyonu da olabilir.
 * Bulunamayan anahtar önce Türkçeye, sonra anahtarın kendisine düşer (arayüz asla boş kalmaz).
 *
 * Oyunlar metinleri her karede `t()` ile ürettiği için dil değişimi anında canvas'a yansır.
 * Bu modül DOM'a dokunmaz; Node testlerinde varsayılan dil Türkçedir.
 * Yeni dil eklemek: `js/i18n/xx.js` oluştur, aşağıda import et ve LANGS'e ekle.
 */
import { tr } from '../i18n/tr.js';
import { en } from '../i18n/en.js';

export const LANGS = [
  { code: 'tr', name: 'Türkçe', short: 'TR', dict: tr },
  { code: 'en', name: 'English', short: 'EN', dict: en },
];
export const DEFAULT_LANG = 'tr';

const byCode = new Map(LANGS.map((l) => [l.code, l]));
let current = DEFAULT_LANG;
const listeners = new Set();

function format(value, params) {
  if (typeof value === 'function') return value(params || {});
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
}

/** Anahtarın geçerli dildeki karşılığı. */
export function t(key, params) {
  const value = byCode.get(current).dict[key] ?? tr[key];
  return value === undefined ? key : format(value, params);
}

/** Anahtar sözlükte var mı (fallback dahil)? */
export const hasKey = (key) => byCode.get(current).dict[key] !== undefined || tr[key] !== undefined;

export const getLang = () => current;

/** toLocaleUpperCase / toLocaleLowerCase için yerel ayar ('tr' → İ/ı kuralları). */
export const locale = () => current;

export const isSupported = (code) => byCode.has(code);

/** Tarayıcı dillerinden desteklenen ilkini seçer (yoksa varsayılan). */
export function detectLang(preferred = []) {
  for (const raw of preferred) {
    const code = String(raw || '').toLowerCase().split('-')[0];
    if (byCode.has(code)) return code;
  }
  return DEFAULT_LANG;
}

export function setLang(code) {
  if (!byCode.has(code) || code === current) return false;
  current = code;
  for (const fn of listeners) fn(code);
  return true;
}

/** Dil değişince çağrılacak fonksiyonu kaydeder; kaydı silen fonksiyon döner. */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
