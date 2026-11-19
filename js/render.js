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
    // variação sutil por casa (menos "xadrez", mais chão)
    for (let r = 0; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) { const h = hash(c, r, 9); x.fillStyle = h > 0.5 ? `rgba(255,255,255,${(h - 0.5) * 0.05})` : `rgba(0,0,0,${(0.5 - h) * 0.12})`; x.fillRect(c * T, r * T, T, T); }
    const zt = x.createLinearGradient(0, 0, 0, T * C.ROWS);
    zt.addColorStop(0, 'rgba(127,29,29,.16)'); zt.addColorStop(P0 / C.ROWS, 'rgba(127,29,29,.02)'); zt.addColorStop(P0 / C.ROWS + 0.001, 'rgba(14,116,144,.03)'); zt.addColorStop(1, 'rgba(14,116,144,.12)');
    x.fillStyle = zt; x.fillRect(0, 0, T * C.COLS, T * C.ROWS);
    // grade discreta: só pontos nos cruzamentos
    x.fillStyle = 'rgba(255,255,255,.10)';
    for (let r = 1; r < C.ROWS; r++) for (let c = 1; c < C.COLS; c++) { x.beginPath(); x.arc(c * T, r * T, 1.1, 0, Math.PI * 2); x.fill(); }
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
    { const lg = ctx.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, 'rgba(233,162,59,0)'); lg.addColorStop(0.5, 'rgba(233,162,59,.55)'); lg.addColorStop(1, 'rgba(233,162,59,0)');
      ctx.save(); ctx.strokeStyle = lg; ctx.lineWidth = 1.5; ctx.shadowColor = 'rgba(233,162,59,.6)'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(0, P0 * T); ctx.lineTo(W, P0 * T); ctx.stroke(); ctx.restore(); }
    if (!G.run) return;
    const run = G.run;
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
        token({ x: e.col + 0.5, y: e.row + 0.5, color: e.color, symbol: e.symbol, archetypeId: e.archetypeId, level: e.level, isBoss: e.isBoss, isElite: e.isElite, affixes: e.affixes, elements: e.elements,
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
        token({ x: u.col + 0.5, y: u.row + 0.5, archetypeId: u.archetypeId, color: D.ARCHETYPES[u.archetypeId].color, symbol: D.ARCHETYPES[u.archetypeId].symbol, level: u.level, elements: u.elements,
          items: u.items.length, hp: s.maxHp, displayHp: s.maxHp, maxHp: s.maxHp, shield: s.initialShield, mana: s.startMana, maxMana: s.maxMana,
          xp: u.xp, nextXp: G.xpToNext(u.level), isPlayer: true, selected: sel === u.id, evo: u.evoPoints > 0,
          ownerColor: G.isCoop() ? G.ownerOf(u).color : null, faded: G.isCoop() && !G.isMine(u) });
      }
      if (drag && drag.fromBoard && drag.overCanvas) {
        const u = G.find(drag.id);
        if (u) token({ x: drag.cx / T, y: drag.cy / T, archetypeId: u.archetypeId, color: D.ARCHETYPES[u.archetypeId].color, symbol: D.ARCHETYPES[u.archetypeId].symbol, level: u.level, elements: u.elements,
          hp: 1, displayHp: 1, maxHp: 1, shield: 0, mana: 0, maxMana: 1, isPlayer: true, selected: true });
      }
    } else {
      const c = G.combat;
      const list = c.units.filter(u => !u.dead).sort((a, b) => a.y - b.y);
      for (const u of list) {
        const ru = u.rosterId ? G.find(u.rosterId) : (u.owner && u.owner.rosterId ? G.find(u.owner.rosterId) : null);
        token({ x: u.x + u.lungeX, y: u.y + u.lungeY, color: u.color, symbol: u.symbol, archetypeId: u.archetypeId, level: u.level, isBoss: u.isBoss, isElite: u.isElite, affixes: u.affixes,
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
      const k = Math.max(0, gh.life / gh.maxLife);
      ctx.save(); ctx.globalAlpha = k * 0.6;
      ctx.fillStyle = gh.team === 'player' ? 'rgba(148,163,184,.35)' : 'rgba(127,29,29,.35)';
      ctx.beginPath(); ctx.arc(gh.x * T, gh.y * T, T * 0.3 * (1.2 - k * 0.2), 0, Math.PI * 2); ctx.fill();
      FE.Art.draw(ctx, FE.Art.keyOf(gh), gh.x * T, gh.y * T, T * 0.42, { ink: '#e5e7eb', acc: '#9ca3af', cut: 'rgba(0,0,0,.4)', shadow: false });
      ctx.restore();
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

  /* ---------- Miniaturas: base metálica + disco + emblema vetorial ---------- */
  const SHADE = (hex, f) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
    const n = parseInt(m[1], 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  };
  function token(u) {
    const ctx = R.ctx, T = R.tile, A = FE.Art;
    const cx = u.x * T, cy = u.y * T;
    const r = T * (u.isBoss ? 0.44 : u.isSummon ? 0.25 : 0.335);
    const enemy = !u.isPlayer;
    const t = performance.now() / 1000;
    ctx.save();
    if (u.preview) ctx.globalAlpha = 0.92;
    if (u.faded) ctx.globalAlpha = 0.72;

    // sombra no chão
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.62, r * 1.0, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();

    // anel de seleção / dono (co-op)
    if (u.selected) {
      ctx.save(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10;
      ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 14;
      ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (u.ownerColor) { ctx.strokeStyle = u.ownerColor; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke(); }

    // espinhos: inimigos (discretos), elites (dourados) e chefes (coroa)
    if (enemy && !u.isSummon) {
      const n = u.isBoss ? 12 : u.isElite ? 8 : 6, len = u.isBoss ? r * 0.26 : u.isElite ? r * 0.22 : r * 0.14;
      ctx.fillStyle = u.isBoss ? '#f59e0b' : u.isElite ? '#d97706' : '#7f1d1d';
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / n, w = Math.PI / n * 0.55;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a - w) * r * 0.96, cy + Math.sin(a - w) * r * 0.96);
        ctx.lineTo(cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len));
        ctx.lineTo(cx + Math.cos(a + w) * r * 0.96, cy + Math.sin(a + w) * r * 0.96);
        ctx.fill();
      }
    }

    // aro metálico
    const rim = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    if (u.isSummon) { rim.addColorStop(0, enemy ? '#fca5a5' : '#d9f99d'); rim.addColorStop(1, enemy ? '#450a0a' : '#1a2e05'); }
    else if (u.isBoss) { rim.addColorStop(0, '#fff1c1'); rim.addColorStop(0.5, '#e0a43a'); rim.addColorStop(1, '#5b3108'); }
    else if (enemy) { rim.addColorStop(0, '#f87171'); rim.addColorStop(0.55, '#7f1d1d'); rim.addColorStop(1, '#2a0606'); }
    else { rim.addColorStop(0, '#fff1c8'); rim.addColorStop(0.5, '#c9953f'); rim.addColorStop(1, '#4a2e0c'); }
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // disco interno
    const ir = r * (u.isSummon ? 0.8 : 0.84);
    const col = u.color || '#64748b';
    const disc = ctx.createRadialGradient(cx - ir * 0.35, cy - ir * 0.45, ir * 0.1, cx, cy, ir);
    if (enemy) { disc.addColorStop(0, SHADE(col, -0.15)); disc.addColorStop(0.6, SHADE(col, -0.6)); disc.addColorStop(1, '#0b0710'); }
    else { disc.addColorStop(0, SHADE(col, 0.35)); disc.addColorStop(0.55, col); disc.addColorStop(1, SHADE(col, -0.65)); }
    ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2; ctx.stroke();

    // emblema
    const key = A.keyOf(u);
    A.draw(ctx, key, cx, cy + 0.5, ir * (u.isBoss ? 1.55 : 1.52), enemy
      ? { ink: '#ffe4e1', acc: u.isBoss ? '#fde047' : '#fb7185', cut: 'rgba(20,0,0,.55)' }
      : { ink: '#fffaf0', acc: SHADE(col, 0.55), cut: 'rgba(8,6,14,.5)' });

    // brilho especular
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(cx - ir * 0.28, cy - ir * 0.52, ir * 0.52, ir * 0.22, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();

    // estados
    if (u.chilled) { ctx.strokeStyle = 'rgba(165,243,252,.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.stroke(); }
    if (u.burning) { ctx.save(); ctx.strokeStyle = `rgba(251,146,60,${0.55 + 0.35 * Math.sin(t * 18)})`; ctx.lineWidth = 2.5; ctx.shadowColor = '#f97316'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (u.stunned) { for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.09; ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.6, cy - r * 0.95 + Math.sin(a) * r * 0.18, 2.4, 0, Math.PI * 2); ctx.fill(); } }
    if (u.flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.7, u.flash * 6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }

    // elementos: contas coloridas no arco inferior
    const els = Object.keys(u.elements || {}).filter(k => u.elements[k] > 0);
    const orbR = Math.max(2.6, T * 0.05);
    els.forEach((k, i) => {
      const a = Math.PI / 2 + (i - (els.length - 1) / 2) * 0.42, ox = cx + Math.cos(a) * (r + 1), oy = cy + Math.sin(a) * (r + 1);
      ctx.fillStyle = D.ELEMENTS[k].color; ctx.beginPath(); ctx.arc(ox, oy, orbR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0b0a10'; ctx.lineWidth = 1.2; ctx.stroke();
    });
    // afixos de elite: losangos coloridos à direita
    (u.affixes || []).forEach((af, i) => {
      const AF = D.ELITE_AFFIXES[af]; if (!AF) return;
      const ox = cx + r + 5, oy = cy - r * 0.4 + i * 8, s = 3.4;
      ctx.fillStyle = AF.color || '#f59e0b'; ctx.beginPath(); ctx.moveTo(ox, oy - s); ctx.lineTo(ox + s, oy); ctx.lineTo(ox, oy + s); ctx.lineTo(ox - s, oy); ctx.closePath(); ctx.fill();
    });
    // itens: pequenos pontos dourados à esquerda
    for (let i = 0; i < (u.items || 0); i++) { ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(cx - r - 4, cy - r * 0.35 + i * 6, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    hpBars(u, cx, cy, r, !!u.isSummon);
  }

  function rrect(ctx, x, y, w, h, rad) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, rad) : ctx.rect(x, y, w, h); }
  function hpBars(u, cx, cy, r, small) {
    const ctx = R.ctx, T = R.tile;
    const bw = T * (small ? 0.5 : u.isBoss ? 0.9 : 0.72), bx = cx - bw / 2;
    const hh = small ? 3 : 5;
    let by = cy - r - (small ? 6 : 11);
    ctx.save(); if (u.preview) ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(8,6,12,.85)'; rrect(ctx, bx - 1.5, by - 1.5, bw + 3, hh + 3, 3); ctx.fill();
    const ratio = Math.max(0, Math.min(1, u.hp / u.maxHp)), disp = Math.max(0, Math.min(1, u.displayHp / u.maxHp));
    ctx.fillStyle = 'rgba(255,255,255,.75)'; rrect(ctx, bx, by, bw * disp, hh, 2); ctx.fill();
    const g = ctx.createLinearGradient(bx, by, bx, by + hh);
    if (u.isPlayer) { g.addColorStop(0, '#6ee7b7'); g.addColorStop(1, '#059669'); } else { g.addColorStop(0, '#fca5a5'); g.addColorStop(1, '#b91c1c'); }
    ctx.fillStyle = g; rrect(ctx, bx, by, bw * ratio, hh, 2); ctx.fill();
    if (!small && u.maxHp > 1) { ctx.fillStyle = 'rgba(8,6,12,.5)'; const step = u.maxHp > 6000 ? 1000 : u.maxHp > 2500 ? 500 : 250; for (let v = step; v < u.maxHp; v += step) ctx.fillRect(bx + bw * v / u.maxHp, by, 1, hh); }
    if (u.shield > 0) { ctx.fillStyle = 'rgba(191,219,254,.95)'; rrect(ctx, bx, by, bw * Math.min(1, u.shield / u.maxHp), 2, 1); ctx.fill(); }
    if (!small) {
      by += hh + 2;
      ctx.fillStyle = 'rgba(8,6,12,.8)'; ctx.fillRect(bx, by, bw, 2.4);
      ctx.fillStyle = '#7dd3fc'; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, u.mana / u.maxMana)), 2.4);
      // selo de nível (losango) na base da miniatura
      const s = Math.max(7, T * 0.12), lx = cx, ly = cy + r * 0.92;
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = u.isBoss ? '#f59e0b' : u.isPlayer ? '#1a1520' : '#2a0707';
      ctx.strokeStyle = u.isBoss ? '#fff1c1' : u.isPlayer ? '#e9b860' : '#f87171'; ctx.lineWidth = 1.4;
      ctx.fillRect(-s * 0.72, -s * 0.72, s * 1.44, s * 1.44); ctx.strokeRect(-s * 0.72, -s * 0.72, s * 1.44, s * 1.44);
      ctx.restore();
      ctx.font = `900 ${Math.round(s * 1.05)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = u.isBoss ? '#1c1206' : '#fff'; ctx.fillText(String(u.level), lx, ly + 0.5);
      if (u.evo) { ctx.fillStyle = '#c084fc'; ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(cx + r * 0.8, cy - r * 0.8, 3.6, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  R.tileAt = function (clientX, clientY) {
    const rect = R.canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    return { col: Math.floor(px / R.tile), row: Math.floor(py / R.tile), px, py, inside: px >= 0 && py >= 0 && px < rect.width && py < rect.height };
  };
})(window);
