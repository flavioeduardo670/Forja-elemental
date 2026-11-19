/* ==========================================================================
   FORJA ELEMENTAL 2.0 — main.js
   Inicialização, configurações, atalhos de teclado e laço principal.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE, G = FE.Game, UI = FE.UI, R = FE.Render, C = FE.Data.CONFIG;

  FE.settings = Object.assign({ sound: true, volume: 0.8, fx: true, autoEvo: true, speed: 1 }, FE.Storage.get(C.SAVE_KEY_SETTINGS) || {});
  FE.applySettings = function () {
    const s = FE.settings;
    FE.Audio.enabled = !!s.sound; FE.Audio.volume = s.volume;
    if (FE.Audio.master) FE.Audio.master.gain.value = s.volume;
    G.settings = s;
    if (G.combat) G.combat.fxOn = s.fx !== false;
    FE.Storage.set(C.SAVE_KEY_SETTINGS, s);
  };

  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { UI.closeModal(); return; }
    if (!G.run) return;
    if (k === ' ') { e.preventDefault(); UI.primaryAction(); }
    else if (k === 's') UI.cycleSpeed();
    else if (k === 'a' && !UI.modalKind) G.autoArrange();
    else if (k === 'e' && (!UI.modalKind || UI.modalKind === 'evo')) { if (UI.modalKind === 'evo') UI.closeModal(); else UI.openEvo(); }
    else if (k === 'm' && (!UI.modalKind || UI.modalKind === 'map')) { if (UI.modalKind === 'map') UI.closeModal(); else UI.showMap(); }
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
    R.init(document.getElementById('battle-canvas'));
    UI.init();
    document.getElementById('btn-speed').innerHTML = `⏩ ${FE.settings.speed}x <kbd>S</kbd>`;
    UI.refresh();
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
