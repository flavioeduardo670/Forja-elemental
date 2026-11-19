/* ==========================================================================
   FORJA ELEMENTAL 2.0 — render.js
   Desenho do tabuleiro 8x8 em Canvas 2D (HiDPI). Somente leitura do estado.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE, D = FE.Data, C = D.CONFIG, G = FE.Game;
  const R = FE.Render = { tile: 60, canvas: null, ctx: null, hover: null, statsCache: new Map() };

  R.init = function (canvas) {
    R.canvas = canvas; R.ctx = canvas.getContext('2d');
    R.resize();
    root.addEventListener('resize', R.resize);
  };
  R.resize = function () {
    const rect = R.canvas.parentElement.getBoundingClientRect();
    const dpr = root.devicePixelRatio || 1;
    R.canvas.width = Math.round(rect.width * dpr); R.canvas.height = Math.round(rect.height * dpr);
    R.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.tile = rect.width / C.COLS;
  };
  R.invalidate = function () {
    R.statsCache.clear();
    if (!G.run) return;
    const ctx = G.statsCtx();
    for (const u of G.allUnits()) R.statsCache.set(u.id, G.statsOf(u, ctx));
  };

  function palette() { return (D.ACTS[G.run ? G.run.act : 1] || D.ACTS[1]).palette; }

  R.draw = function () {
    const ctx = R.ctx, T = R.tile, W = T * C.COLS;
    const pal = palette();
    ctx.clearRect(0, 0, W, W);
    for (let r = 0; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) {
      const en = r < 4, alt = (r + c) % 2 === 1;
      ctx.fillStyle = en ? (alt ? pal.enemyA : pal.enemyB) : (alt ? pal.playerA : pal.playerB);
      ctx.fillRect(c * T, r * T, T, T);
      ctx.strokeStyle = en ? 'rgba(239,68,68,.12)' : 'rgba(56,189,248,.14)'; ctx.lineWidth = 1;
      ctx.strokeRect(c * T + 0.5, r * T + 0.5, T - 1, T - 1);
    }
    ctx.save(); ctx.strokeStyle = pal.divider; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, 4 * T); ctx.lineTo(W, 4 * T); ctx.stroke(); ctx.restore();
    if (!G.run) return;
    const run = G.run;
    ctx.font = `700 ${Math.max(9, Math.round(T * 0.14))}px Inter, sans-serif`; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(248,113,113,.32)'; ctx.fillText(`${D.ACTS[run.act].short} • ${D.ACTS[run.act].name.toUpperCase()} — SALA ${run.room}/15`, 8, 15);
    ctx.fillStyle = 'rgba(56,189,248,.3)'; ctx.fillText('SEU CAMPO (LINHAS 4–7)', 8, W - 7);

    const editing = G.canEdit();
    const drag = FE.UI && FE.UI.drag && FE.UI.drag.moved ? FE.UI.drag : null;
    if (editing && R.hover && R.hover.row >= 4 && R.hover.row < 8 && R.hover.col >= 0 && R.hover.col < 8) {
      const { col, row } = R.hover;
      ctx.fillStyle = drag ? 'rgba(16,185,129,.18)' : 'rgba(245,158,11,.14)';
      ctx.strokeStyle = drag ? 'rgba(16,185,129,.8)' : 'rgba(245,158,11,.7)'; ctx.lineWidth = 2;
      ctx.fillRect(col * T + 2, row * T + 2, T - 4, T - 4); ctx.strokeRect(col * T + 2, row * T + 2, T - 4, T - 4);
    }

    if (run.phase !== 'COMBAT' || !G.combat) {
      for (const e of run.enemies) {
        token({ x: e.col + 0.5, y: e.row + 0.5, color: e.color, symbol: e.symbol, level: e.level, isBoss: e.isBoss, isElite: e.isElite, affixes: e.affixes, elements: e.elements,
          hp: 1, displayHp: 1, maxHp: 1, shield: 0, mana: 0, maxMana: 1, isPlayer: false, preview: true, selected: FE.UI && FE.UI.inspectEnemyId === e.id });
      }
      const sel = G.selectedId;
      for (const u of run.board) {
        if (drag && drag.id === u.id) continue;
        const s = R.statsCache.get(u.id) || G.statsOf(u);
        if (sel === u.id && editing) {
          ctx.save(); ctx.strokeStyle = 'rgba(251,191,36,.35)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc((u.col + 0.5) * T, (u.row + 0.5) * T, s.range * T, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        token({ x: u.col + 0.5, y: u.row + 0.5, color: D.ARCHETYPES[u.archetypeId].color, symbol: D.ARCHETYPES[u.archetypeId].symbol, level: u.level, elements: u.elements,
          items: u.items.length, hp: s.maxHp, displayHp: s.maxHp, maxHp: s.maxHp, shield: s.initialShield, mana: s.startMana, maxMana: s.maxMana,
          xp: u.xp, nextXp: G.xpToNext(u.level), isPlayer: true, selected: sel === u.id, evo: u.evoPoints > 0 });
      }
      if (drag && drag.fromBoard && drag.overCanvas) {
        const u = G.find(drag.id);
        if (u) token({ x: drag.cx / T, y: drag.cy / T, color: D.ARCHETYPES[u.archetypeId].color, symbol: D.ARCHETYPES[u.archetypeId].symbol, level: u.level, elements: u.elements,
          hp: 1, displayHp: 1, maxHp: 1, shield: 0, mana: 0, maxMana: 1, isPlayer: true, selected: true });
      }
    } else {
      const c = G.combat;
      const list = c.units.filter(u => !u.dead).sort((a, b) => a.y - b.y);
      for (const u of list) {
        const ru = u.rosterId ? G.find(u.rosterId) : null;
        token({ x: u.x + u.lungeX, y: u.y + u.lungeY, color: u.color, symbol: u.symbol, level: u.level, isBoss: u.isBoss, isElite: u.isElite, affixes: u.affixes,
          elements: u.elements, items: ru ? ru.items.length : 0, hp: u.hp, displayHp: u.displayHp, maxHp: u.stats.maxHp, shield: u.shield, mana: u.mana,
          maxMana: u.stats.maxMana, xp: ru ? ru.xp : 0, nextXp: ru ? G.xpToNext(ru.level) : 1, isPlayer: u.team === 'player', isSummon: u.isSummon,
          selected: u.rosterId && G.selectedId === u.rosterId, stunned: u.stun > 0, chilled: u.chill > 0, burning: u.burn > 0 });
      }
      fx(c.fx);
    }
  };

  function fx(f) {
    const ctx = R.ctx, T = R.tile;
    for (const s of f.shockwaves) { ctx.save(); ctx.strokeStyle = s.color; ctx.globalAlpha = Math.max(0, s.life / s.maxLife) * 0.85; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x * T, s.y * T, s.radius * T, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    for (const b of f.beams) { ctx.save(); ctx.strokeStyle = b.color; ctx.globalAlpha = Math.max(0, b.life / b.maxLife); ctx.lineWidth = 3; ctx.shadowColor = b.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(b.x1 * T, b.y1 * T); ctx.lineTo(b.x2 * T, b.y2 * T); ctx.stroke(); ctx.restore(); }
    for (const p of f.projectiles) { ctx.fillStyle = p.crit ? '#facc15' : p.color; ctx.beginPath(); ctx.arc(p.x * T, p.y * T, p.crit ? 5 : 3.8, 0, Math.PI * 2); ctx.fill(); }
    for (const p of f.particles) { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x * T, p.y * T, p.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const t of f.texts) {
      ctx.save(); ctx.globalAlpha = Math.min(1, t.life * 1.4);
      ctx.font = `900 ${Math.round(T * 0.2 * t.scale)}px Inter, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#080d19'; ctx.strokeText(t.text, t.x * T, t.y * T);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x * T, t.y * T); ctx.restore();
    }
  }

  function token(u) {
    const ctx = R.ctx, T = R.tile;
    const cx = u.x * T, cy = u.y * T;
    const r = T * (u.isBoss ? 0.40 : u.isSummon ? 0.24 : 0.31);
    ctx.save();
    if (u.preview) ctx.globalAlpha = 0.86;
    if (u.selected) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke(); }
    if (u.isElite && !u.isBoss) {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(cx, cy, r + 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.85, r * 0.85, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.26, u.color); g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = u.isBoss ? 3 : 2;
    ctx.strokeStyle = u.isPlayer ? (u.isSummon ? '#a3e635' : '#e2e8f0') : (u.isBoss ? '#facc15' : '#fca5a5'); ctx.stroke();
    if (u.chilled) { ctx.strokeStyle = 'rgba(125,211,252,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke(); }
    ctx.font = `${Math.round(r * 1.05)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(u.symbol, cx, cy + 1);
    if (u.stunned) { ctx.font = `${Math.round(r * 0.7)}px sans-serif`; ctx.fillText('💫', cx + r * 0.7, cy - r * 0.7); }
    if (u.burning) { ctx.font = `${Math.round(r * 0.55)}px sans-serif`; ctx.fillText('🔥', cx - r * 0.75, cy - r * 0.6); }

    const els = Object.keys(u.elements || {}).filter(k => u.elements[k] > 0);
    const orbR = Math.max(3, T * 0.062);
    els.forEach((k, i) => {
      const a = Math.PI * 0.15 + i * 0.55, ox = cx + Math.cos(a) * (r + 2), oy = cy + Math.sin(a) * (r + 2);
      ctx.fillStyle = D.ELEMENTS[k].color; ctx.beginPath(); ctx.arc(ox, oy, orbR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#080d19'; ctx.lineWidth = 1; ctx.stroke();
    });
    (u.affixes || []).forEach((af, i) => {
      const A = D.ELITE_AFFIXES[af]; if (!A) return;
      ctx.font = `${Math.round(T * 0.16)}px sans-serif`; ctx.fillText(A.icon, cx - r - 4, cy + r * 0.2 + i * T * 0.18);
    });
    for (let i = 0; i < (u.items || 0); i++) { ctx.fillStyle = '#fbbf24'; ctx.fillRect(cx - r * 0.55 + i * 6 - 2, cy + r + 1, 4, 4); }

    if (u.isSummon) { ctx.restore(); hpBars(u, cx, cy, r, true); return; }
    ctx.restore();
    hpBars(u, cx, cy, r, false);
  }

  function hpBars(u, cx, cy, r, small) {
    const ctx = R.ctx, T = R.tile;
    const bw = T * (small ? 0.5 : 0.76), bx = cx - bw / 2;
    let by = cy - r - (small ? 7 : 13);
    ctx.save(); if (u.preview) ctx.globalAlpha = 0.86;
    const hh = small ? 3 : 4.5;
    ctx.fillStyle = '#080d19'; ctx.fillRect(bx - 1, by - 1, bw + 2, hh + 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, u.displayHp / u.maxHp)), hh);
    ctx.fillStyle = u.isPlayer ? '#10b981' : '#ef4444'; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, u.hp / u.maxHp)), hh);
    if (u.shield > 0) { ctx.fillStyle = 'rgba(147,197,253,.95)'; ctx.fillRect(bx, by, bw * Math.min(1, u.shield / u.maxHp), 2.2); }
    if (!small) {
      by += hh + 1;
      ctx.fillStyle = '#080d19'; ctx.fillRect(bx - 1, by, bw + 2, 3.8);
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, u.mana / u.maxMana)), 2.8);
      if (u.isPlayer && u.nextXp) { by += 3.8; ctx.fillStyle = '#1e1b4b'; ctx.fillRect(bx, by, bw, 2.2); ctx.fillStyle = '#facc15'; ctx.fillRect(bx, by, bw * Math.min(1, u.xp / u.nextXp), 2.2); }
      ctx.font = `800 ${Math.max(8.5, Math.round(T * 0.135))}px Inter, sans-serif`; ctx.textAlign = 'right';
      ctx.fillStyle = u.isBoss ? '#facc15' : '#e2e8f0'; ctx.fillText(`Nv.${u.level}`, bx - 2, cy - r - 7);
      if (u.evo) { ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(bx + bw + 5, cy - r - 9, 4.5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  R.tileAt = function (clientX, clientY) {
    const rect = R.canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    return { col: Math.floor(px / R.tile), row: Math.floor(py / R.tile), px, py, inside: px >= 0 && py >= 0 && px < rect.width && py < rect.height };
  };
})(window);
