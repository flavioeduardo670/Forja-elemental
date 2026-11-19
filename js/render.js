/* ==========================================================================
   FORJA ELEMENTAL 4.0 — render.js  (Diorama isométrico)
   Tabuleiro 12×12 em blocos isométricos com altura (montanha sobe, água e
   lava afundam, ravina é buraco) e bonecos de brinquedo (toys.js).
   Somente leitura do estado. Coordenadas de mundo: (x, y) em casas, com o
   centro de uma casa em (col + .5, row + .5).
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE, D = FE.Data, C = D.CONFIG, G = FE.Game;
  const R = FE.Render = { tile: 52, tw: 52, th: 26, ox: 0, oy: 0, w: 0, h: 0, canvas: null, ctx: null, hover: null, statsCache: new Map() };
  const N = C.COLS, P0 = C.PLAYER_ROW;

  R.init = function (canvas) {
    R.canvas = canvas; R.ctx = canvas.getContext('2d');
    R.resize();
    root.addEventListener('resize', R.resize);
  };
  R.resize = function () {
    const rect = R.canvas.parentElement.getBoundingClientRect();
    const dpr = FE.settings && FE.settings.retro ? 0.32 : (root.devicePixelRatio || 1);
    R.canvas.width = Math.round(rect.width * dpr); R.canvas.height = Math.round(rect.height * dpr);
    R.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.w = rect.width; R.h = rect.height;
    const tw = Math.min(rect.width / (N + 0.9), rect.height / (N * 0.5 + 2.6));
    R.tw = tw; R.th = tw / 2; R.tile = tw;
    R.k = tw / 52;
    R.ox = rect.width / 2;
    R.oy = (rect.height - N * R.th) / 2 + tw * 0.62;
    R.tcache = null;
  };
  R.invalidate = function () {
    R.statsCache.clear();
    if (!G.run) return;
    const ctx = G.statsCtx();
    for (const u of G.allUnits()) R.statsCache.set(u.id, G.statsOf(u, ctx));
  };

  /* Projeção: mundo → tela (z = altura em px, para cima) */
  const P = (x, y, z = 0) => [R.ox + (x - y) * R.tw / 2, R.oy + (x + y) * R.th / 2 - z];
  R.project = P;
  R.tileAt = function (clientX, clientY) {
    const rect = R.canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const u = (px - R.ox) / (R.tw / 2), v = (py - R.oy) / (R.th / 2);
    let wx = (u + v) / 2, wy = (v - u) / 2;
    let col = Math.floor(wx), row = Math.floor(wy);
    // corrige pela altura do bloco (montanhas/colinas mais altas)
    const t = G.run ? FE.Engine.terrainAt(G.run.terrain, col, row) : '.';
    const e = elev(t) * R.k;
    if (e > 0) { const v2 = (py + e - R.oy) / (R.th / 2); wx = (u + v2) / 2; wy = (v2 - u) / 2; col = Math.floor(wx); row = Math.floor(wy); }
    const inside = col >= 0 && row >= 0 && col < N && row < N && px >= 0 && py >= 0 && px < rect.width && py < rect.height;
    return { col, row, px, py, wx, wy, inside };
  };

  /* ---------- Paletas por Ato (topo da grama e céu) ---------- */
  const ACT_STYLE = {
    1: { grass: ['#9BD07A', '#93C872'], dirt: ['#B07F52', '#8E6440'], sky: ['#DCEEFB', '#F4F8EC'] },
    2: { grass: ['#D8C478', '#CFBA6E'], dirt: ['#B98A55', '#946B40'], sky: ['#FBE9CF', '#FBF5E8'] },
    3: { grass: ['#9AA6D6', '#909CCD'], dirt: ['#6E6390', '#574D78'], sky: ['#E3DDF6', '#F3F0FA'] },
    4: { grass: ['#B9A49A', '#B09B90'], dirt: ['#7A5446', '#5F3F34'], sky: ['#F6DCCF', '#FAF0EA'] }
  };
  const style = () => ACT_STYLE[G.run ? Math.min(4, G.run.act || 1) : 1];
  function elev(t) { return { M: 16, H: 7, P: 0, W: -7, B: -7, L: -7, S: -3, R: -28 }[t] || 0; }
  function shade(hex, f) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
    const n = parseInt(m[1], 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }
  R.shade = shade;
  const hash = (c, r, k = 0) => { let h = (c * 374761393 + r * 668265263 + k * 2147483647) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h % 1000) / 1000; };

  /* ---------- Bloco isométrico ---------- */
  function block(x, t, c, r) {
    const st = style(), k = R.k, TW = R.tw, TH = R.th;
    const e = elev(t) * k;
    const [X, Y0] = P(c, r); const Y = Y0 - e;
    const depth = 12 * k + Math.max(0, e) + (t === 'R' ? 28 * k : 0);
    let top;
    switch (t) {
      case 'F': top = shade(st.grass[0], -0.12); break;
      case 'M': top = '#B8B1A6'; break;
      case 'H': top = shade(st.grass[0], 0.08); break;
      case 'W': case 'B': top = '#7EC6EA'; break;
      case 'L': top = '#FF8A3D'; break;
      case 'S': top = '#7FA27A'; break;
      case 'R': top = '#3A3346'; break;
      case 'P': top = st.grass[(c + r) % 2]; break;
      default: top = st.grass[(c + r) % 2];
    }
    const a = [X, Y], b = [X + TW / 2, Y + TH / 2], cc = [X, Y + TH], d = [X - TW / 2, Y + TH / 2];
    const earth = t === '.' || t === 'F' || t === 'H' || t === 'P';
    const sideL = t === 'R' ? '#5C5048' : earth ? st.dirt[0] : shade(top, -0.22);
    const sideR = t === 'R' ? '#463C35' : earth ? st.dirt[1] : shade(top, -0.38);
    x.fillStyle = sideL; x.beginPath(); x.moveTo(d[0], d[1]); x.lineTo(cc[0], cc[1]); x.lineTo(cc[0], cc[1] + depth); x.lineTo(d[0], d[1] + depth); x.closePath(); x.fill();
    x.fillStyle = sideR; x.beginPath(); x.moveTo(cc[0], cc[1]); x.lineTo(b[0], b[1]); x.lineTo(b[0], b[1] + depth); x.lineTo(cc[0], cc[1] + depth); x.closePath(); x.fill();
    if (earth) { // faixa de grama sobre a terra
      x.fillStyle = shade(top, -0.18);
      x.beginPath(); x.moveTo(d[0], d[1]); x.lineTo(cc[0], cc[1]); x.lineTo(cc[0], cc[1] + 3.5 * k); x.lineTo(d[0], d[1] + 3.5 * k); x.closePath(); x.fill();
      x.fillStyle = shade(top, -0.3);
      x.beginPath(); x.moveTo(cc[0], cc[1]); x.lineTo(b[0], b[1]); x.lineTo(b[0], b[1] + 3.5 * k); x.lineTo(cc[0], cc[1] + 3.5 * k); x.closePath(); x.fill();
    }
    x.fillStyle = top; x.strokeStyle = 'rgba(30,36,51,.08)'; x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(cc[0], cc[1]); x.lineTo(d[0], d[1]); x.closePath(); x.fill(); x.stroke();
    const cx = X, cy = Y + TH / 2;
    if (t === '.' && hash(c, r, 3) > 0.72) { // tufos de grama
      x.strokeStyle = shade(top, -0.25); x.lineWidth = 1.1 * k;
      const gx = cx + (hash(c, r, 4) - 0.5) * TW * 0.4, gy = cy + (hash(c, r, 5) - 0.5) * TH * 0.4;
      x.beginPath(); x.moveTo(gx - 3 * k, gy); x.lineTo(gx - 4 * k, gy - 4 * k); x.moveTo(gx, gy); x.lineTo(gx, gy - 5 * k); x.moveTo(gx + 3 * k, gy); x.lineTo(gx + 4 * k, gy - 4 * k); x.stroke();
    }
    if (t === 'F') {
      [[-9, -2], [8, -4], [0, 5]].forEach(([dx, dy], i) => {
        const tx = cx + (dx + (hash(c, r, i) - 0.5) * 4) * k, ty = cy + dy * k;
        x.fillStyle = '#7A5134'; x.fillRect(tx - 1.5 * k, ty, 3 * k, 4 * k);
        x.fillStyle = '#2F8A4E'; x.beginPath(); x.moveTo(tx, ty - 21 * k); x.lineTo(tx + 8 * k, ty); x.lineTo(tx - 8 * k, ty); x.closePath(); x.fill();
        x.fillStyle = '#23703E'; x.beginPath(); x.moveTo(tx, ty - 21 * k); x.lineTo(tx + 8 * k, ty); x.lineTo(tx, ty); x.closePath(); x.fill();
      });
    } else if (t === 'M') {
      const poly = (pts, f) => { x.fillStyle = f; x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(cx + px * k, cy + py * k) : x.moveTo(cx + px * k, cy + py * k)); x.closePath(); x.fill(); };
      poly([[-17, 5], [-3, -22], [6, -10], [11, -16], [19, 5]], '#9B958C');
      poly([[-3, -22], [6, -10], [2, 5]], '#7E786F');
      poly([[-8, -13], [-3, -22], [2, -15], [-2, -12]], '#FFFFFF');
      poly([[8, -12], [11, -16], [13, -11]], '#FFFFFF');
    } else if (t === 'H') {
      x.fillStyle = shade(top, 0.12); x.beginPath(); x.ellipse(cx, cy - 2 * k, TW * 0.28, TH * 0.28, 0, Math.PI, 0); x.fill();
    } else if (t === 'P') {
      x.fillStyle = '#D9D2C3'; x.strokeStyle = '#1E2433'; x.lineWidth = 1;
      x.fillRect(cx - 6 * k, cy - 26 * k, 12 * k, 26 * k); x.strokeRect(cx - 6 * k, cy - 26 * k, 12 * k, 26 * k);
      x.fillStyle = '#C4BCAB'; x.fillRect(cx - 9 * k, cy - 30 * k, 18 * k, 5 * k); x.strokeRect(cx - 9 * k, cy - 30 * k, 18 * k, 5 * k);
      x.strokeStyle = 'rgba(30,36,51,.35)'; x.beginPath(); x.moveTo(cx - 2 * k, cy - 22 * k); x.lineTo(cx - 2 * k, cy - 4 * k); x.moveTo(cx + 2.5 * k, cy - 20 * k); x.lineTo(cx + 2.5 * k, cy - 6 * k); x.stroke();
    } else if (t === 'W' || t === 'B') {
      x.strokeStyle = '#E6F6FF'; x.lineWidth = 1.6 * k; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx - 12 * k, cy - 2 * k); x.quadraticCurveTo(cx - 6 * k, cy - 5 * k, cx, cy - 2 * k); x.quadraticCurveTo(cx + 6 * k, cy + 1 * k, cx + 12 * k, cy - 2 * k); x.stroke();
      if (t === 'B') {
        const horiz = G.run && ['W', 'R', 'L'].includes(FE.Engine.terrainAt(G.run.terrain, c - 1, r));
        for (let i = -2; i <= 2; i++) {
          const px = cx + (horiz ? i * 6 : -i * 6) * k, py = cy + i * 3 * k;
          x.fillStyle = '#C98F55'; x.strokeStyle = '#7A5134'; x.lineWidth = 0.8;
          x.beginPath();
          if (horiz) { x.moveTo(px - 4 * k, py - 7 * k); x.lineTo(px + 6 * k, py - 2 * k); x.lineTo(px + 1 * k, py + 0.5 * k); x.lineTo(px - 9 * k, py - 4.5 * k); }
          else { x.moveTo(px + 4 * k, py - 7 * k); x.lineTo(px - 6 * k, py - 2 * k); x.lineTo(px - 1 * k, py + 0.5 * k); x.lineTo(px + 9 * k, py - 4.5 * k); }
          x.closePath(); x.fill(); x.stroke();
        }
      }
    } else if (t === 'L') {
      x.strokeStyle = '#FFE07A'; x.lineWidth = 2 * k; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx - 14 * k, cy); x.lineTo(cx - 4 * k, cy - 3 * k); x.lineTo(cx + 3 * k, cy + 3 * k); x.lineTo(cx + 13 * k, cy - 1 * k); x.stroke();
      x.fillStyle = '#FFE07A'; x.beginPath(); x.arc(cx + 5 * k, cy - 6 * k, 2.2 * k, 0, Math.PI * 2); x.fill();
    } else if (t === 'S') {
      x.fillStyle = '#5E8A68'; for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(cx + (hash(c, r, i) - 0.5) * TW * 0.5, cy + (hash(c, r, i + 4) - 0.5) * TH * 0.5, 4 * k, 2 * k, 0, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#F7A8C9'; x.beginPath(); x.arc(cx + 4 * k, cy - 1 * k, 1.8 * k, 0, Math.PI * 2); x.fill();
    }
  }

  /* Camada de terreno pré-renderizada (ilha + blocos na ordem do pintor) */
  function terrainLayer() {
    const run = G.run, terrain = run ? run.terrain : null;
    const key = `${terrain}|${R.w}|${R.h}|${run ? run.act : 1}`;
    if (R.tcache && R.tcache.key === key) return R.tcache.cv;
    const dpr = FE.settings && FE.settings.retro ? 0.32 : (root.devicePixelRatio || 1);
    const cv = document.createElement('canvas');
    cv.width = Math.round(R.w * dpr); cv.height = Math.round(R.h * dpr);
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    // sombra da ilha
    const [cx, cy] = P(N / 2, N / 2);
    const sg = x.createRadialGradient(cx, cy + R.th * 1.2, 0, cx, cy + R.th * 1.2, R.tw * N * 0.56);
    sg.addColorStop(0, 'rgba(30,36,51,.16)'); sg.addColorStop(0.75, 'rgba(30,36,51,.07)'); sg.addColorStop(1, 'rgba(30,36,51,0)');
    x.fillStyle = sg; x.beginPath(); x.ellipse(cx, cy + R.th * 1.2, R.tw * N * 0.56, R.th * N * 0.6, 0, 0, Math.PI * 2); x.fill();
    const cells = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cells.push([c, r]);
    cells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[1] - b[1]);
    for (const [c, r] of cells) block(x, terrain ? FE.Engine.terrainAt(terrain, c, r) : '.', c, r);
    // tinta suave por lado + fronteira
    for (const [c, r] of cells) {
      const t = terrain ? FE.Engine.terrainAt(terrain, c, r) : '.';
      if (t === 'R') continue;
      const e = elev(t) * R.k;
      const [X, Y0] = P(c, r); const Y = Y0 - e;
      x.fillStyle = r < P0 ? 'rgba(217,72,59,.06)' : 'rgba(19,137,124,.05)';
      x.beginPath(); x.moveTo(X, Y); x.lineTo(X + R.tw / 2, Y + R.th / 2); x.lineTo(X, Y + R.th); x.lineTo(X - R.tw / 2, Y + R.th / 2); x.closePath(); x.fill();
    }
    const [ax, ay] = P(0, P0), [bx, by] = P(N, P0);
    x.save(); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2.2 * R.k; x.setLineDash([6 * R.k, 5 * R.k]);
    x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); x.restore();
    const anim = [];
    for (const [c, r] of cells) { const t = terrain ? FE.Engine.terrainAt(terrain, c, r) : '.'; if (t === 'W' || t === 'L') anim.push({ c, r, t }); }
    R.tcache = { key, cv, anim };
    return cv;
  }

  /* Destaque de uma casa (losango no topo do bloco) */
  function tileDiamond(ctx, c, r, fill, stroke, lw = 2) {
    const t = G.run ? FE.Engine.terrainAt(G.run.terrain, c, r) : '.';
    const [X, Y0] = P(c, r); const Y = Y0 - elev(t) * R.k;
    ctx.beginPath(); ctx.moveTo(X, Y + 1); ctx.lineTo(X + R.tw / 2 - 2, Y + R.th / 2); ctx.lineTo(X, Y + R.th - 1); ctx.lineTo(X - R.tw / 2 + 2, Y + R.th / 2); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  const groundZ = (x, y) => G.run ? elev(FE.Engine.terrainAt(G.run.terrain, Math.floor(x), Math.floor(y))) * R.k : 0;

  R.draw = function () {
    const ctx = R.ctx;
    ctx.clearRect(0, 0, R.w, R.h);
    const shake = G.combat && G.run && G.run.phase === 'COMBAT' && FE.settings.fx !== false ? G.combat.fx.shake : 0;
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.drawImage(terrainLayer(), 0, 0, R.w, R.h);
    animTiles(ctx);
    if (!G.run) { ctx.restore(); return; }
    const run = G.run;
    const editing = G.canEdit();
    const drag = FE.UI && FE.UI.drag && FE.UI.drag.moved ? FE.UI.drag : null;
    if (editing && R.hover && R.hover.inside) {
      const { col, row } = R.hover;
      const mine = row >= P0;
      const bad = !mine || FE.Engine.tileBlocked(run.terrain, col, row);
      if (mine || drag) tileDiamond(ctx, col, row, bad ? 'rgba(217,72,59,.28)' : drag ? 'rgba(19,137,124,.30)' : 'rgba(242,179,61,.30)', bad ? '#D9483B' : drag ? '#13897C' : '#F2B33D');
    }
    const items = [];
    if (run.phase !== 'COMBAT' || !G.combat) {
      for (const e of run.enemies) {
        items.push({ x: e.col + 0.5, y: e.row + 0.5, team: 'e', archetypeId: e.archetypeId, color: e.color, symbol: e.symbol, level: e.level, isBoss: e.isBoss, isElite: e.isElite, affixes: e.affixes, elements: e.elements,
          hp: 1, displayHp: 1, maxHp: 1, shield: 0, mana: 0, maxMana: 1, preview: true, selected: FE.UI && FE.UI.inspectEnemyId === e.id, ambush: e.ambush });
      }
      const sel = G.selectedId;
      for (const u of run.board) {
        if (drag && drag.id === u.id) continue;
        const s = R.statsCache.get(u.id) || G.statsOf(u);
        if (sel === u.id && editing) {
          const [px, py] = P(u.col + 0.5, u.row + 0.5);
          ctx.save(); ctx.strokeStyle = 'rgba(242,179,61,.75)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.ellipse(px, py, s.range * R.tw * 0.7071, s.range * R.th * 0.7071, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        items.push({ x: u.col + 0.5, y: u.row + 0.5, team: 'p', archetypeId: u.archetypeId, color: D.ARCHETYPES[u.archetypeId].color, level: u.level, elements: u.elements,
          items: u.items.length, hp: s.maxHp, displayHp: s.maxHp, maxHp: s.maxHp, shield: s.initialShield, mana: s.startMana, maxMana: s.maxMana,
          selected: sel === u.id, evo: u.evoPoints > 0, quality: u.quality || 0,
          ownerColor: G.isCoop() ? G.ownerOf(u).color : null, faded: G.isCoop() && !G.isMine(u) });
      }
      if (drag && drag.fromBoard && R.hover && R.hover.inside) {
        const u = G.find(drag.id);
        if (u) items.push({ x: R.hover.wx, y: R.hover.wy, team: 'p', archetypeId: u.archetypeId, color: D.ARCHETYPES[u.archetypeId].color, level: u.level, hp: 1, displayHp: 1, maxHp: 1, shield: 0, mana: 0, maxMana: 1, selected: true, lifted: true });
      }
    } else {
      const c = G.combat;
      for (const u of c.units) {
        if (u.dead) continue;
        const ru = u.rosterId ? G.find(u.rosterId) : (u.owner && u.owner.rosterId ? G.find(u.owner.rosterId) : null);
        items.push({ x: u.x + u.lungeX, y: u.y + u.lungeY, team: u.team === 'player' ? 'p' : 'e', color: u.color, symbol: u.symbol, archetypeId: u.archetypeId, level: u.level, isBoss: u.isBoss, isElite: u.isElite, affixes: u.affixes,
          elements: u.elements, items: ru ? ru.items.length : 0, hp: u.hp, displayHp: u.displayHp, maxHp: u.stats.maxHp, shield: u.shield, mana: u.mana,
          maxMana: u.stats.maxMana, isSummon: u.isSummon, quality: ru ? ru.quality || 0 : 0,
          selected: u.rosterId && G.selectedId === u.rosterId, stunned: u.stun > 0, chilled: u.chill > 0, burning: u.burn > 0, flash: u.flash || 0,
          ownerColor: G.isCoop() && u.team === 'player' && ru ? G.ownerOf(ru).color : null });
      }
    }
    items.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const it of items) toy(it);
    if (run.phase === 'COMBAT' && G.combat) fx(G.combat.fx);
    ctx.restore();
  };

  /* Brilho animado da água e da lava */
  function animTiles(ctx) {
    if (!R.tcache || !R.tcache.anim.length || (FE.settings && FE.settings.fx === false)) return;
    const t = performance.now() / 1000, k = R.k;
    for (const a of R.tcache.anim) {
      const [X, Y0] = P(a.c, a.r); const Y = Y0 - elev(a.t) * k;
      const ph = Math.sin(t * (a.t === 'L' ? 2.2 : 1.4) + a.c * 0.9 + a.r * 0.7);
      if (a.t === 'W') {
        ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.35 * (ph + 1) / 2})`; ctx.lineWidth = 1.4 * k; ctx.lineCap = 'round';
        const yy = Y + R.th * (0.62 + 0.08 * ph);
        ctx.beginPath(); ctx.moveTo(X - 6 * k, yy); ctx.quadraticCurveTo(X, yy - 3 * k, X + 6 * k, yy); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(255,224,122,${0.10 + 0.18 * (ph + 1) / 2})`;
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + R.tw / 2, Y + R.th / 2); ctx.lineTo(X, Y + R.th); ctx.lineTo(X - R.tw / 2, Y + R.th / 2); ctx.closePath(); ctx.fill();
      }
    }
  }

  /* ---------- Bonecos ---------- */
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function toy(u) {
    const ctx = R.ctx, k = R.k;
    const [fx0, fy0] = P(u.x, u.y);
    const fz = groundZ(u.x, u.y) + (u.lifted ? 10 * k : 0);
    const fx = fx0, fy = fy0 - fz;
    const boss = u.isBoss, summon = u.isSummon;
    const s = k * (boss ? 0.95 : summon ? 0.78 : u.isElite ? 1.08 : 0.94);
    const key = FE.Art.keyOf(u);
    ctx.save();
    if (u.faded) ctx.globalAlpha = 0.7;
    if (u.selected) {
      ctx.save(); ctx.strokeStyle = '#F2B33D'; ctx.lineWidth = 2.6; ctx.shadowColor = 'rgba(242,179,61,.8)'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(fx, fy, (boss ? 36 : 17) * s, (boss ? 13 : 7) * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (u.ownerColor) { ctx.strokeStyle = u.ownerColor; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(fx, fy, 14 * s, 6 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (u.isElite && !boss) { ctx.strokeStyle = '#F2B33D'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.ellipse(fx, fy, 15 * s, 6.5 * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    const acc = u.team === 'p' || summon ? (u.color || '#94a3b8') : (D.ARCHETYPES[u.archetypeId] ? D.ARCHETYPES[u.archetypeId].color : '#F28C6B');
    FE.Toy.draw(ctx, key, u.team, fx, fy, s, { acc, flash: u.flash || 0 });
    const headY = fy - (boss ? 96 : summon ? 34 : 52) * s;
    // estados
    const t = performance.now() / 1000;
    if (u.burning) { ctx.save(); ctx.strokeStyle = `rgba(255,138,61,${0.6 + 0.3 * Math.sin(t * 18)})`; ctx.lineWidth = 2.4; ctx.shadowColor = '#FF8A3D'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.ellipse(fx, fy, 15 * s, 6 * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (u.chilled) { ctx.strokeStyle = 'rgba(125,211,252,.95)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(fx, fy, 15 * s, 6 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (u.stunned) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.09; ctx.fillStyle = '#F2B33D'; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 9 * s, headY + 2 + Math.sin(a) * 3 * s, 2.4, 0, Math.PI * 2); ctx.fill(); }
    // elementos: contas na base
    const els = Object.keys(u.elements || {}).filter(e => u.elements[e] > 0);
    els.forEach((e, i) => {
      const ox = fx + (i - (els.length - 1) / 2) * 7 * k, oy = fy + 7 * s;
      ctx.fillStyle = D.ELEMENTS[e].color; ctx.beginPath(); ctx.arc(ox, oy, 3 * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    });
    ctx.restore();
    bars(u, fx, headY, k, boss, summon);
  }

  function bars(u, x, y, k, boss, summon) {
    const ctx = R.ctx;
    if (u.preview && !u.selected && u.team === 'e' && !boss && !u.isElite) { levelBadge(ctx, u, x + 15 * k, y - 4 * k, k); return; }
    const bw = (boss ? 62 : summon ? 22 : 32) * k, bh = (summon ? 3 : 4.5) * k;
    const bx = x - bw / 2, by = y - 9 * k;
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(30,36,51,.18)'; ctx.lineWidth = 1;
    rrect(ctx, bx - 2, by - 2, bw + 4, bh + 4 + (summon ? 0 : 2.5 * k), 4); ctx.fill(); ctx.stroke();
    const ratio = Math.max(0, Math.min(1, u.hp / u.maxHp)), disp = Math.max(0, Math.min(1, u.displayHp / u.maxHp));
    ctx.fillStyle = '#EDF1F6'; rrect(ctx, bx, by, bw, bh, 2); ctx.fill();
    ctx.fillStyle = 'rgba(242,179,61,.75)'; rrect(ctx, bx, by, bw * disp, bh, 2); ctx.fill();
    ctx.fillStyle = u.team === 'p' ? '#13897C' : '#D9483B'; rrect(ctx, bx, by, bw * ratio, bh, 2); ctx.fill();
    if (u.shield > 0) { ctx.fillStyle = '#7DC4F5'; rrect(ctx, bx, by, bw * Math.min(1, u.shield / u.maxHp), 2, 1); ctx.fill(); }
    if (!summon) {
      ctx.fillStyle = '#E8EEF5'; ctx.fillRect(bx, by + bh + 1, bw, 1.6 * k);
      ctx.fillStyle = '#5B8DEF'; ctx.fillRect(bx, by + bh + 1, bw * Math.max(0, Math.min(1, u.mana / u.maxMana)), 1.6 * k);
      levelBadge(ctx, u, bx + bw + 7 * k, by + bh / 2, k);
    }
    if (u.evo) { ctx.fillStyle = '#6B4FA0'; ctx.beginPath(); ctx.arc(bx - 6 * k, by + bh / 2, 3.2 * k, 0, Math.PI * 2); ctx.fill(); }
  }
  function levelBadge(ctx, u, x, y, k) {
    const r = 6.5 * k;
    ctx.fillStyle = u.isBoss ? '#D9483B' : u.quality === 2 ? '#C98A12' : u.quality === 1 ? '#3B6FD6' : '#1E2433';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(9 * k)}px Nunito, Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(u.level), x, y + 0.5);
  }

  /* ---------- Efeitos ---------- */
  function fx(f) {
    const ctx = R.ctx, k = R.k, Z = 22 * k; // altura do "corpo" para efeitos no ar
    const at = (x, y, z = Z) => { const [a, b] = P(x, y); return [a, b - groundZ(x, y) - z]; };
    for (const s of f.shockwaves) {
      const [x, y] = at(s.x, s.y, 0);
      ctx.save(); ctx.strokeStyle = s.color; ctx.globalAlpha = Math.max(0, s.life / s.maxLife) * 0.9; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, s.radius * R.tw * 0.7071, s.radius * R.th * 0.7071, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    for (const b of f.beams) {
      const [x1, y1] = at(b.x1, b.y1), [x2, y2] = at(b.x2, b.y2);
      ctx.save(); ctx.strokeStyle = b.color; ctx.globalAlpha = Math.max(0, b.life / b.maxLife); ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.shadowColor = b.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    }
    for (const p of f.projectiles) {
      const [x, y] = at(p.x, p.y);
      if (p.px !== undefined) {
        const dx = p.x - p.px, dy = p.y - p.py, len = Math.hypot(dx, dy) || 1;
        const [tx, ty] = at(p.x - dx / len * 0.5, p.y - dy / len * 0.5);
        ctx.save(); ctx.strokeStyle = p.crit ? '#F2B33D' : p.color; ctx.globalAlpha = 0.6; ctx.lineWidth = p.crit ? 4 : 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = p.crit ? '#F2B33D' : '#fff'; ctx.strokeStyle = 'rgba(30,36,51,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, (p.crit ? 4.5 : 3.2) * Math.max(1, k), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const sl of f.slashes) {
      const kk = Math.max(0, sl.life / sl.maxLife);
      const [x, y] = at(sl.x, sl.y, 18 * k);
      ctx.save(); ctx.strokeStyle = sl.color; ctx.globalAlpha = kk; ctx.lineWidth = sl.big ? 4 : 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(x, y, R.tw * (sl.big ? 0.42 : 0.33), R.tw * (sl.big ? 0.26 : 0.2), 0, sl.a - 1.1 + (1 - kk) * 0.6, sl.a + 0.2 + (1 - kk) * 0.6); ctx.stroke(); ctx.restore();
    }
    for (const gh of f.ghosts) {
      const kk = Math.max(0, gh.life / gh.maxLife);
      const [x, y] = at(gh.x, gh.y, 0);
      ctx.save(); ctx.globalAlpha = kk * 0.55; ctx.filter = 'grayscale(1)';
      FE.Toy.draw(ctx, FE.Art.keyOf(gh), gh.team === 'player' ? 'p' : 'e', x, y - (1 - kk) * 18 * k, k * (gh.isBoss ? 0.95 : 0.9), { acc: '#cbd5e1' });
      ctx.restore();
    }
    for (const p of f.particles) {
      const [x, y] = at(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of f.texts) {
      if (!t._b) t._b = { x: t.x, y: t.y };
      const [x, y0] = at(t._b.x, t._b.y, 44 * k);
      const y = y0 - (t._b.y - t.y) * R.th * 2.2;
      ctx.save(); ctx.globalAlpha = Math.min(1, t.life * 1.4);
      ctx.font = `800 ${Math.round(13 * k * t.scale)}px Fredoka, Nunito, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#FFFFFF'; ctx.lineJoin = 'round'; ctx.strokeText(t.text, x, y);
      ctx.fillStyle = readable(t.color); ctx.fillText(t.text, x, y); ctx.restore();
    }
  }
  /* Textos de dano sobre fundo claro: escurece cores muito claras */
  function readable(c) {
    const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#1E2433';
    const n = parseInt(m[1], 16), lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
    return lum > 235 ? '#1E2433' : lum > 170 ? shade(c, -0.4) : c;
  }
})(window);
