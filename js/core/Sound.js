/**
 * Sound — Web Audio API ile üretilen basit bip sesleri. Ses dosyası yoktur.
 * AudioContext, tarayıcı kuralları gereği ilk kullanıcı etkileşiminde (unlock) oluşturulur.
 */
export class Sound {
  constructor(storage) {
    this.storage = storage;
    this.muted = storage.get('muted', false) === true;
    this.ctx = null;
    this.master = null;
  }

  /** Engine her tuş/dokunuşta çağırır; ilk seferde ses bağlamını açar. */
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.6;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = !!muted;
    this.storage.set('muted', this.muted);
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Tek bir bip. slide: süre boyunca frekansa eklenecek Hz (kayan ton).
   * delay: saniye cinsinden gecikme (seri çalmak için).
   */
  beep(freq = 440, duration = 0.08, { type = 'square', volume = 0.06, slide = 0, delay = 0 } = {}) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** Ardışık notalar: [[frekans, süre], ...] */
  seq(notes, opts = {}) {
    let delay = 0;
    for (const [freq, duration] of notes) {
      this.beep(freq, duration, { ...opts, delay });
      delay += duration;
    }
  }

  win() {
    this.seq([[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.16]], { type: 'triangle', volume: 0.08 });
  }

  lose() {
    this.seq([[392, 0.1], [311, 0.1], [233, 0.22]], { type: 'sawtooth', volume: 0.05 });
  }
}
