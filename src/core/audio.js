// ---------------------------------------------------------------------------
// Game sounds (refactor Phase 5). initAudio() runs at the spot the audio
// section used to run in main.js, after the storage migration, so the saved
// mute setting is read exactly when it was before.
// ---------------------------------------------------------------------------
import { MUTE_KEY } from './config.js';
import { readJSON, writeJSON } from './storage.js';

// Web Audio, everything synthesized. iOS only lets a context start inside a
// user gesture, so it is created (and re-resumed after interruptions) on taps.
// Keep the audio session category "ambient" (Safari 16.4+): it respects the
// ring/silent switch and, critically, never interrupts or ducks whatever the
// player is already listening to (music, a podcast). The tradeoff is the
// game goes silent with the ring/silent switch on, which is the right
// tradeoff: this is a secondary SFX layer, not the player's primary audio.
export const audio = {
  ctx: null,
  master: null,
  noise: null,
  whoosh: null,
  muted: false, // read from storage in initAudio()

  syncSession() {
    const session = navigator.audioSession;
    if (session && session.type !== 'ambient') {
      try { session.type = 'ambient'; } catch (err) { /* older WebKit: read-only */ }
    }
  },

  unlock() {
    this.syncSession(); // before the context exists, so it starts in the right category
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // A silent one-sample blip is what actually unlocks output on older iOS.
      const blip = this.ctx.createBufferSource();
      blip.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      blip.connect(this.ctx.destination);
      blip.start();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  },

  live() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  },

  setMuted(muted) {
    this.muted = muted;
    writeJSON(MUTE_KEY, muted);
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.03);
    this.syncSession();
    if (muted) this.whooshStop();
  },

  whooshStart() {
    if (!this.live() || this.whoosh) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 240;
    filter.Q.value = 1.4;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.whoosh = { src, filter, gain };
  },

  // level 0..1 is how hard the air is rushing (volume), speed 0..1 how fast
  // the ground is going by (pitch).
  whooshSet(level, speed) {
    if (!this.whoosh) return;
    const now = this.ctx.currentTime;
    this.whoosh.filter.frequency.setTargetAtTime(220 + 2600 * speed * speed, now, 0.06);
    this.whoosh.src.playbackRate.setTargetAtTime(0.7 + 0.6 * speed, now, 0.06);
    this.whoosh.gain.gain.setTargetAtTime(0.32 * level, now, 0.06);
  },

  whooshStop() {
    if (!this.whoosh) return;
    const { src, gain } = this.whoosh;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.1);
    src.stop(now + 0.6);
    this.whoosh = null;
  },

  tone(type, from, to, start, dur, peak, filterHz = 0) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node = osc.connect(gain);
    if (filterHz) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filterHz;
      node = node.connect(lp);
    }
    node.connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  },

  // Deep body thump plus a short filtered-noise contact click. slow > 1
  // stretches and lowers it for the bullseye slow motion.
  thump(slow = 1) {
    if (!this.live()) return;
    const now = this.ctx.currentTime;
    this.tone('sine', 120 / slow, 36 / slow, now, 0.45 * slow, 0.95);
    const click = this.ctx.createBufferSource();
    click.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 / slow;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07 * slow);
    click.connect(lp).connect(gain).connect(this.master);
    click.start(now);
    click.stop(now + 0.1 * slow);
  },

  chime() {
    if (!this.live()) return;
    const now = this.ctx.currentTime + 0.05;
    this.tone('sine', 1046.5, 1046.5, now, 1.3, 0.14);
    this.tone('sine', 1568, 1568, now + 0.09, 1.2, 0.1);
    this.tone('triangle', 2093, 2093, now + 0.18, 0.9, 0.05);
  },

  // Paper-on-glass tick as the postcard drops into its slot.
  tick() {
    if (!this.live()) return;
    const now = this.ctx.currentTime;
    const click = this.ctx.createBufferSource();
    click.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3200;
    hp.Q.value = 0.9;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    click.connect(hp).connect(gain).connect(this.master);
    click.start(now, Math.random() * 0.5);
    click.stop(now + 0.04);
    this.tone('triangle', 1900, 1500, now, 0.06, 0.06);
  },

  // Paper rip for the pack tear: a short noise burst through a falling bandpass.
  tear() {
    if (!this.live()) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(3600, now);
    bp.frequency.exponentialRampToValueAtTime(700, now + 0.32);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    src.connect(bp).connect(gain).connect(this.master);
    src.start(now, Math.random() * 0.4);
    src.stop(now + 0.4);
  },

  // Deadpan two-note "wah wah" for a blowout.
  bwomp() {
    if (!this.live()) return;
    const now = this.ctx.currentTime + 0.25;
    this.tone('square', 233, 220, now, 0.32, 0.07, 700);
    this.tone('square', 208, 150, now + 0.36, 0.7, 0.07, 600);
  },
};

// Called where the audio section used to run: reads the saved mute setting
// (after migrateStorage) and arms the gesture unlock.
export function initAudio() {
  audio.muted = Boolean(readJSON(MUTE_KEY)?.muted);
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((type) =>
    window.addEventListener(type, () => audio.unlock(), { capture: true, passive: true }),
  );
}
