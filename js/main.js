/* ==========================================================================
   FORJA ELEMENTAL 2.0 — main.js
   Inicialização, configurações, atalhos de teclado e laço principal.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE, G = FE.Game, UI = FE.UI, R = FE.Render, C = FE.Data.CONFIG;

  FE.settings = Object.assign({ sound: true, volume: 0.8, fx: true, autoEvo: true, speed: 1, retro: false }, FE.Storage.get(C.SAVE_KEY_SETTINGS) || {});
  FE.applySettings = function () {
    const s = FE.settings;
    FE.Audio.enabled = !!s.sound; FE.Audio.volume = s.volume;
    if (FE.Audio.master) FE.Audio.master.gain.value = s.volume;
    G.settings = s;
    if (G.combat) G.combat.fxOn = s.fx !== false;
    FE.Storage.set(C.SAVE_KEY_SETTINGS, s);
  };

  /* Easter eggs de teclado: código lendário e a palavra FORJA */
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let seq = [], word = '';
  function eggs(k) {
    seq.push(k); if (seq.length > KONAMI.length) seq.shift();
    if (seq.join(',') === KONAMI.join(',')) {
      seq = [];
      const on = !document.body.classList.contains('retro');
      UI.setRetro(on); R.resize();
      UI.toast(on ? '🕹️ MODO RETRÔ ATIVADO! (repita o código para desligar)' : '🕹️ Modo Retrô desligado.', 'ach');
      FE.Audio.play('secret');
      G.secret('konami');
    }
    if (k.length === 1) {
      word = (word + k).slice(-5);
      if (word === 'forja' && G.run && G.canEdit()) {
        word = '';
        FE.Audio.play('anvil'); setTimeout(() => FE.Audio.play('anvil'), 260); setTimeout(() => FE.Audio.play('anvil'), 520);
        UI.log('👂 Você ouve marteladas distantes, vindas do coração da Forja... alguém ainda trabalha lá.', 'level');
        G.secret('forja');
      }
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    eggs(k);
    if (k === 'escape') { UI.closeModal(); return; }
    if (!G.run) return;
    if (['1', '2', '3', '4'].includes(k) && G.isCoop()) { G.setActive(+k - 1); return; }
    if (k === 'p') { G.togglePause(); return; }
    if (k === ' ') { e.preventDefault(); UI.primaryAction(); }
    else if (k === 's') UI.cycleSpeed();
    else if (k === 'a' && !UI.modalKind) G.autoArrange();
    else if (k === 'e' && (!UI.modalKind || UI.modalKind === 'evo')) { if (UI.modalKind === 'evo') UI.closeModal(); else UI.openEvo(); }
    else if (k === 'm' && (!UI.modalKind || UI.modalKind === 'map')) { if (UI.modalKind === 'map') UI.closeModal(); else UI.showMap(); }
    else if (k === 'f' && !UI.modalKind) UI.toggleFocus();
    else if (!UI.modalKind && FE.Render.camAction && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', '+', '=', '-'].includes(k)) { e.preventDefault(); FE.Render.camAction({ arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down', '+': 'in', '=': 'in', '-': 'out' }[k]); }
    else if (k === 'c' && (!UI.modalKind || UI.modalKind === 'codex')) { if (UI.modalKind === 'codex') UI.closeModal(); else UI.openCodex(null, null); }
  });

  let last = 0;
  function loop(ts) {
    if (!last) last = ts;
    const raw = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    try {
      G.tick(raw * FE.settings.speed);
      R.draw();
      UI.updateBossBar();
    } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  }

  function boot() {
    G.loadMeta();
    FE.applySettings();
    if (FE.settings.retro) document.body.classList.add('retro');
    R.init(document.getElementById('battle-canvas'));
    UI.init();
    document.getElementById('btn-speed').innerHTML = `⏩ ${FE.settings.speed}x <kbd>S</kbd>`;
    UI.refresh();
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
