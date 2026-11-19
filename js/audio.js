/* ==========================================================================
   FORJA ELEMENTAL 2.0 — audio.js
   Sons sintetizados (Web Audio), volume mestre e limitação de disparos
   para não saturar em combates grandes (16 vs 13).
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE;
  const A = FE.Audio = {
    enabled: true, volume: 0.8, ctx: null, master: null, last: {},
    ensure() {
      if (!this.enabled) return null;
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        try { this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); } catch (_) { return null; }
      }
      this.master.gain.value = this.volume;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    },
    tone(freq, type = 'sine', dur = 0.12, gain = 0.08, delay = 0, end = null) {
      const ctx = this.ensure(); if (!ctx) return;
      const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.01);
    },
    throttle(name, ms) { const now = performance.now(); if (this.last[name] && now - this.last[name] < ms) return false; this.last[name] = now; return true; },
    play(name, arg) {
      if (!this.enabled) return;
      switch (name) {
        case 'buy': this.tone(587.33, 'triangle', 0.09, 0.09); this.tone(880, 'triangle', 0.14, 0.09, 0.06); break;
        case 'place': this.tone(220, 'sine', 0.07, 0.07, 0, 140); break;
        case 'hit': if (!this.throttle('hit', 45)) return;
          if (arg) { this.tone(440, 'sawtooth', 0.11, 0.06, 0, 180); this.tone(880, 'triangle', 0.09, 0.04, 0.02); }
          else this.tone(190, 'triangle', 0.06, 0.035, 0, 95); break;
        case 'magic': if (!this.throttle('magic', 70)) return; this.tone(420, 'sine', 0.18, 0.05, 0, 780); break;
        case 'heal': if (!this.throttle('heal', 90)) return; this.tone(523.25, 'sine', 0.14, 0.05); this.tone(659.25, 'sine', 0.16, 0.05, 0.05); break;
        case 'death': if (!this.throttle('death', 80)) return; this.tone(160, 'square', 0.12, 0.03, 0, 60); break;
        case 'levelUp': if (!this.throttle('lvl', 120)) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 'triangle', i === 3 ? 0.24 : 0.12, 0.08, i * 0.08)); break;
        case 'victory': this.tone(440, 'triangle', 0.14, 0.08); this.tone(554.37, 'triangle', 0.14, 0.08, 0.1); this.tone(659.25, 'triangle', 0.26, 0.09, 0.2); break;
        case 'defeat': this.tone(311.13, 'sawtooth', 0.2, 0.06, 0, 220); this.tone(233.08, 'sawtooth', 0.28, 0.06, 0.16, 165); break;
        case 'bossGong': this.tone(110, 'sawtooth', 0.5, 0.09, 0, 72); this.tone(82, 'sine', 0.7, 0.07, 0.05, 60); break;
        case 'click': this.tone(660, 'sine', 0.04, 0.03); break;
        case 'quack': this.tone(520, 'square', 0.07, 0.05, 0, 380); this.tone(470, 'square', 0.09, 0.05, 0.09, 330); break;
        case 'anvil': this.tone(1760, 'triangle', 0.25, 0.08, 0, 1500); this.tone(2637, 'sine', 0.3, 0.04, 0.01); break;
        case 'secret': [659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => this.tone(f, 'square', 0.1, 0.05, i * 0.07)); break;
      }
    }
  };
  FE.Bus.on('sfx', ({ name, arg }) => A.play(name, arg));
})(window);
