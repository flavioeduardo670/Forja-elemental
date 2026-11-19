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
    const dpr = FE.settings && FE.settings.retro ? 0.32 : (root.devicePixelRatio || 1);
    R.canvas.width = Math.round(rect.width * dpr); R.canvas.height = Math.round(rect.height * dpr);
    R.tcache = null;
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

  /* ---------- Camada de terreno (pré-renderizada e cacheada) ---------- */
  const P0 = C.PLAYER_ROW;
  const hash = (c, r, k = 0) => { let h = (c * 374761393 + r * 668265263 + k * 2147483647) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h % 1000) / 1000; };
  function paintTile(x, t, c, r, T, pal, terrain) {
    const X = c * T, Y = r * T, en = r < P0, alt = (r + c) % 2 === 1;
    const at = (cc, rr) => FE.Engine.terrainAt(terrain, cc, rr);
    x.fillStyle = en ? (alt ? pal.enemyA : pal.enemyB) : (alt ? pal.playerA : pal.playerB);
    x.fillRect(X, Y, T, T);
    const cx = X + T / 2, cy = Y + T / 2;
    switch (t) {
      case 'W': case 'B': {
        const ravine = t === 'B' && [at(c - 1, r), at(c + 1, r), at(c, r - 1), at(c, r + 1)].includes('R');
        const lava = t === 'B' && [at(c - 1, r), at(c + 1, r)].includes('L');
        if (ravine) { x.fillStyle = '#04060b'; x.fillRect(X, Y, T, T); }
        else if (lava) { x.fillStyle = '#7c2d12'; x.fillRect(X, Y, T, T); }
        else {
          const g = x.createLinearGradient(X, Y, X, Y + T); g.addColorStop(0, '#0e4a74'); g.addColorStop(1, '#0b3556');
          x.fillStyle = g; x.fillRect(X, Y, T, T);
          x.strokeStyle = 'rgba(147,197,253,.28)'; x.lineWidth = 1.2;
          for (let i = 0; i < 2; i++) { const yy = Y + T * (0.3 + i * 0.4) + hash(c, r, i) * 4; x.beginPath(); x.moveTo(X + T * 0.15, yy); x.quadraticCurveTo(X + T * 0.35, yy - 4, X + T * 0.5, yy); x.quadraticCurveTo(X + T * 0.65, yy + 4, X + T * 0.85, yy); x.stroke(); }
        }
        if (t === 'B') {
          const gap = (cc, rr) => ['W', 'R', 'L'].includes(at(cc, rr));
          const vertical = !(gap(c, r - 1) && gap(c, r + 1));
          x.fillStyle = '#8b5a2b';
          if (vertical) {
            x.fillRect(X + T * 0.14, Y, T * 0.72, T);
            x.strokeStyle = '#5c3a1a'; x.lineWidth = 1.5;
            for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(X + T * 0.14, Y + i * T / 5); x.lineTo(X + T * 0.86, Y + i * T / 5); x.stroke(); }
            x.fillStyle = '#3f2810'; x.fillRect(X + T * 0.1, Y, T * 0.06, T); x.fillRect(X + T * 0.84, Y, T * 0.06, T);
          } else {
            x.fillRect(X, Y + T * 0.14, T, T * 0.72);
            x.strokeStyle = '#5c3a1a'; x.lineWidth = 1.5;
            for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(X + i * T / 5, Y + T * 0.14); x.lineTo(X + i * T / 5, Y + T * 0.86); x.stroke(); }
            x.fillStyle = '#3f2810'; x.fillRect(X, Y + T * 0.1, T, T * 0.06); x.fillRect(X, Y + T * 0.84, T, T * 0.06);
          }
        }
        break;
      }
      case 'R': {
        const g = x.createRadialGradient(cx, cy, 2, cx, cy, T * 0.75); g.addColorStop(0, '#000'); g.addColorStop(1, '#141821');
        x.fillStyle = g; x.fillRect(X, Y, T, T);
        x.strokeStyle = '#2b3240'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(X + T * 0.2, Y); for (let i = 1; i <= 4; i++) x.lineTo(X + T * (0.12 + hash(c, r, i) * 0.16), Y + i * T / 4); x.stroke();
        x.beginPath(); x.moveTo(X + T * 0.8, Y); for (let i = 1; i <= 4; i++) x.lineTo(X + T * (0.72 + hash(c, r, i + 9) * 0.16), Y + i * T / 4); x.stroke();
        break;
      }
      case 'M': {
        x.fillStyle = '#26231e'; x.fillRect(X, Y, T, T);
        const peaks = [[0.3, 0.32, 0.55], [0.68, 0.22, 0.62]];
        for (const [px, h, w] of peaks) {
          const bx = X + T * px, top = Y + T * (h + hash(c, r, px * 10) * 0.08);
          x.fillStyle = '#57534e'; x.beginPath(); x.moveTo(bx - T * w / 2, Y + T * 0.92); x.lineTo(bx, top); x.lineTo(bx + T * w / 2, Y + T * 0.92); x.closePath(); x.fill();
          x.fillStyle = '#78716c'; x.beginPath(); x.moveTo(bx, top); x.lineTo(bx + T * w / 2, Y + T * 0.92); x.lineTo(bx + T * 0.05, Y + T * 0.92); x.closePath(); x.fill();
          x.fillStyle = '#e7e5e4'; x.beginPath(); x.moveTo(bx - T * 0.07, top + T * 0.12); x.lineTo(bx, top); x.lineTo(bx + T * 0.08, top + T * 0.13); x.closePath(); x.fill();
        }
        break;
      }
      case 'P': {
        x.fillStyle = '#2a2622'; x.fillRect(X, Y, T, T);
        x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(cx + 3, Y + T * 0.86, T * 0.3, T * 0.09, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#a8a29e'; x.fillRect(cx - T * 0.17, Y + T * 0.22, T * 0.34, T * 0.62);
        x.fillStyle = '#d6d3d1'; x.fillRect(cx - T * 0.24, Y + T * 0.14, T * 0.48, T * 0.1); x.fillRect(cx - T * 0.24, Y + T * 0.8, T * 0.48, T * 0.08);
        x.strokeStyle = '#78716c'; x.lineWidth = 1; for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(cx + i * T * 0.08, Y + T * 0.25); x.lineTo(cx + i * T * 0.08, Y + T * 0.8); x.stroke(); }
        break;
      }
      case 'F': {
        x.fillStyle = 'rgba(20,83,45,.55)'; x.fillRect(X, Y, T, T);
        for (let i = 0; i < 3; i++) {
          const tx = X + T * (0.22 + i * 0.28 + (hash(c, r, i) - 0.5) * 0.1), ty = Y + T * (0.35 + hash(c, r, i + 4) * 0.35), sz = T * (0.16 + hash(c, r, i + 7) * 0.06);
          x.fillStyle = '#3f2a14'; x.fillRect(tx - 1.5, ty + sz * 0.6, 3, sz * 0.5);
          x.fillStyle = i % 2 ? '#15803d' : '#166534'; x.beginPath(); x.moveTo(tx, ty - sz * 1.2); x.lineTo(tx - sz * 0.8, ty + sz * 0.7); x.lineTo(tx + sz * 0.8, ty + sz * 0.7); x.closePath(); x.fill();
        }
        break;
      }
      case 'H': {
        x.fillStyle = 'rgba(77,107,46,.45)'; x.fillRect(X, Y, T, T);
        x.fillStyle = 'rgba(132,160,72,.55)'; x.beginPath(); x.ellipse(cx, cy + T * 0.08, T * 0.42, T * 0.28, 0, Math.PI, 0); x.fill();
        x.strokeStyle = 'rgba(190,210,120,.45)'; x.lineWidth = 1; x.beginPath(); x.ellipse(cx, cy + T * 0.08, T * 0.3, T * 0.18, 0, Math.PI, 0); x.stroke();
        break;
      }
      case 'S': {
        x.fillStyle = 'rgba(54,61,24,.75)'; x.fillRect(X, Y, T, T);
        for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? 'rgba(90,110,40,.6)' : 'rgba(30,40,15,.7)'; x.beginPath(); x.ellipse(X + T * hash(c, r, i), Y + T * hash(c, r, i + 3), T * 0.12, T * 0.07, 0, 0, Math.PI * 2); x.fill(); }
        break;
      }
      case 'L': {
        const g = x.createRadialGradient(cx, cy, 2, cx, cy, T * 0.7); g.addColorStop(0, '#f97316'); g.addColorStop(0.6, '#c2410c'); g.addColorStop(1, '#7c2d12');
        x.fillStyle = g; x.fillRect(X, Y, T, T);
        x.strokeStyle = '#fde047'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(X + T * 0.1, Y + T * hash(c, r, 1)); x.lineTo(cx, cy); x.lineTo(X + T * 0.9, Y + T * hash(c, r, 2)); x.stroke();
        break;
      }
    }
  }
  function terrainLayer(pal) {
    const run = G.run, terrain = run ? run.terrain : null, T = R.tile;
    const key = `${terrain}|${T}|${run ? run.act : 1}`;
    if (R.tcache && R.tcache.key === key) return R.tcache.cv;
    const dpr = root.devicePixelRatio || 1, cv = document.createElement('canvas');
    cv.width = Math.round(T * C.COLS * dpr); cv.height = Math.round(T * C.ROWS * dpr);
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let r = 0; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) paintTile(x, FE.Engine.terrainAt(terrain, c, r), c, r, T, pal, terrain);
    x.fillStyle = 'rgba(239,68,68,.045)'; x.fillRect(0, 0, T * C.COLS, T * P0);
    for (let r = 0; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) {
      x.strokeStyle = r < P0 ? 'rgba(239,68,68,.10)' : 'rgba(56,189,248,.12)'; x.lineWidth = 1;
      x.strokeRect(c * T + 0.5, r * T + 0.5, T - 1, T - 1);
    }
    const anim = [];
    for (let r = 0; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) { const t = FE.Engine.terrainAt(terrain, c, r); if (t === 'W' || t === 'L') anim.push({ c, r, t }); }
    R.tcache = { key, cv, anim };
    return cv;
  }

  R.draw = function () {
    const ctx = R.ctx, T = R.tile, W = T * C.COLS;
    const pal = palette();
    ctx.clearRect(0, 0, W, W);
    const shake = G.combat && G.run && G.run.phase === 'COMBAT' && FE.settings.fx !== false ? G.combat.fx.shake : 0;
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.drawImage(terrainLayer(pal), 0, 0, W, W);
    animTiles(ctx, T);
    ctx.save(); ctx.strokeStyle = pal.divider; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, P0 * T); ctx.lineTo(W, P0 * T); ctx.stroke(); ctx.restore();
    if (!G.run) return;
    const run = G.run;
    ctx.font = `700 ${Math.max(9, Math.round(T * 0.16))}px Inter, sans-serif`; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(248,113,113,.5)'; ctx.fillText(`${D.ACTS[run.act].short} • ${D.ACTS[run.act].name.toUpperCase()} — SALA ${run.room}/${C.TOTAL_ROOMS} • ${(D.LAYOUTS[run.layout] || D.LAYOUTS.planicie).name.toUpperCase()}`, 8, 14);
    ctx.fillStyle = 'rgba(56,189,248,.5)'; ctx.fillText('SEU CAMPO (LINHAS 6–11)', 8, W - 6);

    const editing = G.canEdit();
    const drag = FE.UI && FE.UI.drag && FE.UI.drag.moved ? FE.UI.drag : null;
    if (editing && R.hover && R.hover.row >= P0 && R.hover.row < C.ROWS && R.hover.col >= 0 && R.hover.col < C.COLS) {
      const { col, row } = R.hover;
      const bad = FE.Engine.tileBlocked(run.terrain, col, row);
      ctx.fillStyle = bad ? 'rgba(239,68,68,.22)' : drag ? 'rgba(16,185,129,.18)' : 'rgba(245,158,11,.14)';
      ctx.strokeStyle = bad ? 'rgba(239,68,68,.85)' : drag ? 'rgba(16,185,129,.8)' : 'rgba(245,158,11,.7)'; ctx.lineWidth = 2;
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
          xp: u.xp, nextXp: G.xpToNext(u.level), isPlayer: true, selected: sel === u.id, evo: u.evoPoints > 0,
          ownerColor: G.isCoop() ? G.ownerOf(u).color : null, faded: G.isCoop() && !G.isMine(u) });
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
        const ru = u.rosterId ? G.find(u.rosterId) : (u.owner && u.owner.rosterId ? G.find(u.owner.rosterId) : null);
        token({ x: u.x + u.lungeX, y: u.y + u.lungeY, color: u.color, symbol: u.symbol, level: u.level, isBoss: u.isBoss, isElite: u.isElite, affixes: u.affixes,
          elements: u.elements, items: ru ? ru.items.length : 0, hp: u.hp, displayHp: u.displayHp, maxHp: u.stats.maxHp, shield: u.shield, mana: u.mana,
          maxMana: u.stats.maxMana, xp: ru ? ru.xp : 0, nextXp: ru ? G.xpToNext(ru.level) : 1, isPlayer: u.team === 'player', isSummon: u.isSummon,
          selected: u.rosterId && G.selectedId === u.rosterId, stunned: u.stun > 0, chilled: u.chill > 0, burning: u.burn > 0, flash: u.flash || 0,
          ownerColor: G.isCoop() && u.team === 'player' && ru ? G.ownerOf(ru).color : null });
      }
      fx(c.fx);
    }
    ctx.restore();
    vignette(ctx, W);
  };

  /* Brilho animado da água e da lava (poucos tiles, barato por quadro) */
  function animTiles(ctx, T) {
    if (!R.tcache || !R.tcache.anim.length || (FE.settings && FE.settings.fx === false)) return;
    const t = performance.now() / 1000;
    for (const a of R.tcache.anim) {
      const X = a.c * T, Y = a.r * T;
      const ph = Math.sin(t * (a.t === 'L' ? 2.2 : 1.4) + a.c * 0.9 + a.r * 0.7);
      if (a.t === 'W') {
        ctx.strokeStyle = `rgba(186,230,253,${0.10 + 0.12 * (ph + 1) / 2})`; ctx.lineWidth = 1.4;
        const yy = Y + T * (0.5 + 0.18 * ph);
        ctx.beginPath(); ctx.moveTo(X + T * 0.2, yy); ctx.quadraticCurveTo(X + T * 0.5, yy - 3, X + T * 0.8, yy); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(253,224,71,${0.06 + 0.10 * (ph + 1) / 2})`; ctx.fillRect(X, Y, T, T);
      }
    }
  }
  function vignette(ctx, W) {
    if (!R.vig || R.vig.w !== W) {
      const g = ctx.createRadialGradient(W / 2, W / 2, W * 0.42, W / 2, W / 2, W * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
      R.vig = { w: W, g };
    }
    ctx.fillStyle = R.vig.g; ctx.fillRect(0, 0, W, W);
  }

  function fx(f) {
    const ctx = R.ctx, T = R.tile;
    for (const s of f.shockwaves) { ctx.save(); ctx.strokeStyle = s.color; ctx.globalAlpha = Math.max(0, s.life / s.maxLife) * 0.85; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x * T, s.y * T, s.radius * T, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    for (const b of f.beams) { ctx.save(); ctx.strokeStyle = b.color; ctx.globalAlpha = Math.max(0, b.life / b.maxLife); ctx.lineWidth = 3; ctx.shadowColor = b.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(b.x1 * T, b.y1 * T); ctx.lineTo(b.x2 * T, b.y2 * T); ctx.stroke(); ctx.restore(); }
    for (const p of f.projectiles) {
      if (p.px !== undefined) {
        const dx = p.x - p.px, dy = p.y - p.py, len = Math.hypot(dx, dy) || 1;
        ctx.save(); ctx.strokeStyle = p.crit ? '#fde047' : p.color; ctx.globalAlpha = 0.55; ctx.lineWidth = p.crit ? 4 : 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x * T, p.y * T); ctx.lineTo((p.x - dx / len * 0.45) * T, (p.y - dy / len * 0.45) * T); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = p.crit ? '#facc15' : '#fff'; ctx.beginPath(); ctx.arc(p.x * T, p.y * T, p.crit ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
    }
    for (const sl of f.slashes) {
      const k = Math.max(0, sl.life / sl.maxLife);
      ctx.save(); ctx.strokeStyle = sl.color; ctx.globalAlpha = k; ctx.lineWidth = sl.big ? 4 : 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(sl.x * T, sl.y * T, T * (sl.big ? 0.42 : 0.33), sl.a - 1.1 + (1 - k) * 0.6, sl.a + 0.2 + (1 - k) * 0.6); ctx.stroke(); ctx.restore();
    }
    for (const gh of f.ghosts) {
      ctx.save(); ctx.globalAlpha = Math.max(0, gh.life / gh.maxLife) * 0.7; ctx.font = `${Math.round(T * 0.35)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.filter = 'grayscale(1)'; ctx.fillText(gh.symbol, gh.x * T, gh.y * T); ctx.restore();
    }
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
    if (u.faded) ctx.globalAlpha = 0.78;
    if (u.ownerColor) { ctx.strokeStyle = u.ownerColor; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2); ctx.stroke(); }
    if (u.selected) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke(); }
    if (u.isElite && !u.isBoss) {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(cx, cy, r + 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.85, r * 0.85, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    if (!u.isSummon && !u.preview) {
      const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.55);
      halo.addColorStop(0, u.color + '55'); halo.addColorStop(1, u.color + '00');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.55, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.26, u.color); g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = u.isBoss ? 3 : 2;
    ctx.strokeStyle = u.isPlayer ? (u.isSummon ? '#a3e635' : '#e2e8f0') : (u.isBoss ? '#facc15' : '#fca5a5'); ctx.stroke();
    if (u.chilled) { ctx.strokeStyle = 'rgba(125,211,252,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke(); }
    ctx.font = `${Math.round(r * 1.05)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(u.symbol, cx, cy + 1);
    if (u.flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.75, u.flash * 6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
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
      ctx.font = `${Math.round(T * 0.2)}px sans-serif`; ctx.fillText(A.icon, cx - r - 4, cy + r * 0.2 + i * T * 0.18);
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
    if (!small && u.maxHp > 1) { ctx.fillStyle = 'rgba(8,13,25,.55)'; const step = u.maxHp > 6000 ? 1000 : u.maxHp > 2500 ? 500 : 250; for (let v = step; v < u.maxHp; v += step) ctx.fillRect(bx + bw * v / u.maxHp, by, 1, hh); }
    if (u.shield > 0) { ctx.fillStyle = 'rgba(147,197,253,.95)'; ctx.fillRect(bx, by, bw * Math.min(1, u.shield / u.maxHp), 2.2); }
    if (!small) {
      by += hh + 1;
      ctx.fillStyle = '#080d19'; ctx.fillRect(bx - 1, by, bw + 2, 3.8);
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, u.mana / u.maxMana)), 2.8);
      if (u.isPlayer && u.nextXp) { by += 3.8; ctx.fillStyle = '#1e1b4b'; ctx.fillRect(bx, by, bw, 2.2); ctx.fillStyle = '#facc15'; ctx.fillRect(bx, by, bw * Math.min(1, u.xp / u.nextXp), 2.2); }
      // selo de nível
      const lr = Math.max(6.5, T * 0.12), lx = bx - lr - 1, ly = cy - r - 8;
      ctx.fillStyle = u.isBoss ? '#facc15' : u.isPlayer ? '#1e293b' : '#3b0d0d';
      ctx.strokeStyle = u.isBoss ? '#fde68a' : u.isPlayer ? '#fbbf24' : '#f87171'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = `900 ${Math.round(lr * 1.15)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = u.isBoss ? '#1c1917' : '#fff'; ctx.fillText(String(u.level), lx, ly + 0.5);
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
