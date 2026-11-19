/* ==========================================================================
   FORJA ELEMENTAL 2.0 — game.js
   Camada de regras da expedição: estado da run, economia, roster,
   progressão, mapa, eventos e persistência. Sem DOM: comunica-se com a UI
   por FE.Bus ('changed', 'log', 'toast', 'sfx', 'openEvo').
   Escolhas do jogador ficam numa fila serializável (run.pending), então
   recarregar a página no meio de uma escolha não perde nada.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE;
  const D = FE.Data, C = D.CONFIG, E = FE.Engine;

  const log = (t, type = '') => FE.Bus.emit('log', { t, type });
  const toast = (t, type = 'info') => FE.Bus.emit('toast', { t, type });
  const sfx = (name, arg) => FE.Bus.emit('sfx', { name, arg });
  const changed = () => FE.Bus.emit('changed');

  const G = FE.Game = { run: null, meta: null, combat: null };

  /* ---------------- META (com migração da v1) ---------------- */
  function defaultMeta() {
    return {
      v: 2, astralShards: 0,
      upgrades: Object.fromEntries(Object.keys(D.META_UPGRADES).map(k => [k, 0])),
      maxAscension: 0, migratedV1: false,
      records: { runs: 0, wins: 0, bestRoom: 0, kills: 0, bestWinAscension: -1 },
      ach: {}, lifetime: { recruited: [], terrainsWon: [], bossesKilled: 0 }
    };
  }
  G.loadMeta = function () {
    const m = Object.assign(defaultMeta(), FE.Storage.get(C.SAVE_KEY_META) || {});
    m.upgrades = Object.assign(defaultMeta().upgrades, m.upgrades || {});
    m.records = Object.assign(defaultMeta().records, m.records || {});
    m.ach = m.ach || {};
    m.lifetime = Object.assign(defaultMeta().lifetime, m.lifetime || {});
    if (!m.migratedV1) {
      const old = FE.Storage.get(C.LEGACY_META_KEY);
      if (old) {
        m.astralShards += Number(old.astralShards) || 0;
        for (const k of Object.keys(old.upgrades || {})) if (m.upgrades[k] !== undefined) m.upgrades[k] = Math.max(m.upgrades[k], old.upgrades[k] || 0);
        G.migratedNotice = true;
      }
      m.migratedV1 = true;
    }
    G.meta = m;
    G.saveMeta();
    return m;
  };
  G.saveMeta = () => FE.Storage.set(C.SAVE_KEY_META, G.meta);
  G.metaCost = (id) => D.META_UPGRADES[id].baseCost + (G.meta.upgrades[id] || 0) * 25;
  G.buyMeta = function (id) {
    const def = D.META_UPGRADES[id], lvl = G.meta.upgrades[id] || 0, cost = G.metaCost(id);
    if (lvl >= def.maxLevel || G.meta.astralShards < cost) return false;
    G.meta.astralShards -= cost; G.meta.upgrades[id] = lvl + 1; G.saveMeta(); sfx('levelUp'); changed();
    return true;
  };

  /* ---------------- RNG da run ---------------- */
  function withRng(fn) {
    const r = FE.RNG(1); r.state = G.run.rngState;
    const out = fn(r); G.run.rngState = r.state;
    return out;
  }

  /* ---------------- CRIAÇÃO / SAVE / LOAD ---------------- */
  G.newRun = function ({ seed, ascension = 0 } = {}) {
    const seedStr = (seed && String(seed).trim()) || FE.util.randomSeedString();
    const seedNum = FE.util.hashStr(seedStr);
    const asc = Math.max(0, Math.min(ascension, G.meta.maxAscension));
    const up = G.meta.upgrades;
    const citadelMax = C.START_CITADEL + up.citadelMax * 10 - (asc >= 4 ? 20 : 0);
    G.combat = null;
    G.run = {
      v: 3, seed: seedStr, rngState: seedNum, ascension: asc,
      act: 1, room: 0, nodeId: null, visited: [], map: null,
      roomType: 'combate', affix: 'padrao', enemies: [], attempt: 0,
      citadelHp: citadelMax, citadelMax, gold: C.START_GOLD + up.goldStart * 15 - (asc >= 2 ? 30 : 0),
      teamLimit: C.START_TEAM_LIMIT, nextUnitId: 1, recruited: 0,
      board: [], bench: Array(C.BENCH).fill(null), relics: [], bag: [],
      stats: { kills: 0, elites: 0, bosses: 0, combats: 0, wins: 0, losses: 0, goldEarned: 0, bestHit: 0 },
      phase: 'MAP', pending: [], afterPending: 'MAP', ended: null,
      terrain: '.'.repeat(C.COLS * C.ROWS), layout: 'planicie', roomTypesSeen: [], noLoss: true
    };
    G.run.map = withRng(r => E.generateActMap(r, 1, asc));
    G.meta.records.runs++; G.saveMeta();
    log(`🌌 Nova Expedição (seed ${seedStr}${asc ? ` • Ascensão ${asc}` : ''}). Conquiste 15 salas em 3 Atos.`, 'gold');
    if (up.relicStart >= 1) pushRelicChoice('start');
    G.save(); changed();
  };

  G.save = function () {
    if (!G.run || G.run.phase === 'END') return;
    if (G.run.phase === 'COMBAT') return; // salvo antes do combate
    G.emitAch({ type: 'state' });
    FE.Storage.set(C.SAVE_KEY_RUN, G.run);
  };
  G.hasSave = () => { const s = FE.Storage.get(C.SAVE_KEY_RUN); return !!(s && s.v === 3 && s.phase !== 'END'); };
  G.loadRun = function () {
    const s = FE.Storage.get(C.SAVE_KEY_RUN);
    if (!s || s.v !== 3) return false;
    if (s.phase === 'COMBAT') s.phase = 'PREP';
    G.run = s; G.combat = null;
    log(`📂 Expedição retomada — Ato ${s.act}, Sala ${s.room}/15.`, 'gold');
    changed();
    return true;
  };
  G.abandonRun = function () { FE.Storage.del(C.SAVE_KEY_RUN); G.run = null; G.combat = null; };

  /* ---------------- CONSULTAS ---------------- */
  G.arch = (u) => D.ARCHETYPES[u.archetypeId];
  G.allUnits = () => [...G.run.board, ...G.run.bench.filter(Boolean)];
  G.find = (id) => G.allUnits().find(u => u.id === id) || null;
  G.onBoard = (id) => G.run.board.some(u => u.id === id);
  G.canEdit = () => G.run && (G.run.phase === 'PREP' || G.run.phase === 'MAP');
  G.hasRelic = (id) => G.run.relics.includes(id);
  G.xpToNext = (lvl) => Math.floor(C.XP_BASE * Math.pow(C.XP_GROWTH, lvl - 1));
  G.recruitCost = (archId) => Math.round(D.ARCHETYPES[archId].cost * (1 - 0.05 * G.meta.upgrades.contatos));

  G.synergyCounts = function () {
    const counts = Object.fromEntries(Object.keys(D.ELEMENTS).map(k => [k, 0]));
    for (const u of G.run.board) for (const [k, v] of Object.entries(u.elements)) if (counts[k] !== undefined) counts[k] += v;
    if (G.hasRelic('cristal_sinergia')) for (const k of Object.keys(counts)) if (counts[k] > 0) counts[k] += 1;
    return counts;
  };
  G.orderCounts = function () {
    const counts = Object.fromEntries(Object.keys(D.ORDERS).map(k => [k, 0]));
    for (const u of G.run.board) for (const o of G.arch(u).orders) counts[o]++;
    return counts;
  };
  G.statsCtx = () => ({ isEnemy: false, board: G.run.board, relics: new Set(G.run.relics), affix: G.run.affix, gold: G.run.gold, synergy: G.synergyCounts(), orders: G.orderCounts() });
  G.statsOf = (u, ctx) => E.computeStats(u, ctx || G.statsCtx());
  G.enemyStats = (e) => E.computeStats(e, { isEnemy: true, affix: G.run.affix, ascension: G.run.ascension });

  G.xpPool = function () {
    const r = G.run;
    let base = 120 + Math.max(1, r.room) * 38;
    if (r.roomType === 'elite') base *= 1.45;
    if (r.roomType === 'chefe') base *= 1.75;
    base *= 1 + G.meta.upgrades.xpBonus * 0.08;
    if (G.hasRelic('tomo_evolucao')) base *= 1.25;
    return Math.round(base);
  };

  /* ---------------- ROSTER ---------------- */
  const P0 = C.PLAYER_ROW;
  G.blocked = (col, row) => E.tileBlocked(G.run.terrain, col, row);
  function freeBoardTile() {
    const cols = [5, 6, 4, 7, 3, 8, 2, 9, 1, 10, 0, 11];
    for (const r of [P0 + 1, P0 + 2, P0, P0 + 3, P0 + 4, P0 + 5]) for (const c of cols) if (!G.blocked(c, r) && !G.run.board.some(u => u.col === c && u.row === r)) return { col: c, row: r };
    return null;
  }
  /* Ao trocar de terreno, unidades em casas bloqueadas são reposicionadas */
  function relocateBlocked() {
    const taken = new Set(G.run.board.filter(u => !G.blocked(u.col, u.row)).map(u => u.col + ',' + u.row));
    for (const u of G.run.board) {
      if (!G.blocked(u.col, u.row)) continue;
      let best = null, bd = Infinity;
      for (let r = P0; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) {
        if (G.blocked(c, r) || taken.has(c + ',' + r)) continue;
        const d = Math.hypot(c - u.col, r - u.row); if (d < bd) { bd = d; best = { c, r }; }
      }
      if (best) { u.col = best.c; u.row = best.r; taken.add(best.c + ',' + best.r); }
    }
  }
  const freeBench = () => G.run.bench.findIndex(s => s === null);

  G.buy = function (archId) {
    const r = G.run;
    if (!G.canEdit()) return toast('Aguarde o fim do combate.', 'error');
    const arch = D.ARCHETYPES[archId], cost = G.recruitCost(archId);
    if (r.gold < cost) return toast(`Ouro insuficiente: ${arch.name} custa ${cost}g.`, 'error');
    const tile = r.board.length < r.teamLimit ? freeBoardTile() : null;
    const slot = freeBench();
    if (!tile && slot === -1) return toast('Campo e Banco cheios. Aumente o limite da comp ou venda uma unidade.', 'error');
    r.gold -= cost;
    const id = r.nextUnitId++;
    r.recruited++;
    const u = { id, archetypeId: archId, name: `${arch.name} #${id}`, cost, level: 1, xp: 0,
      evoPoints: r.recruited <= G.meta.upgrades.mentor ? 1 : 0,
      col: tile ? tile.col : -1, row: tile ? tile.row : -1, elements: {}, skills: { [arch.signatureSkill]: 1 }, items: [] };
    if (tile) r.board.push(u); else r.bench[slot] = u;
    log(`Recrutou ${u.name} ${tile ? 'no campo' : 'no banco'} (${cost}g).`, 'gold');
    G.meta.lifetime = G.meta.lifetime || {}; const rec = G.meta.lifetime.recruited = G.meta.lifetime.recruited || [];
    if (!rec.includes(archId)) { rec.push(archId); G.saveMeta(); }
    G.selectedId = id; sfx('buy'); G.save(); changed();
  };

  G.sell = function (id) {
    if (!G.canEdit()) return;
    const r = G.run;
    let u = null;
    const bi = r.board.findIndex(x => x.id === id);
    if (bi !== -1) u = r.board.splice(bi, 1)[0];
    else { const si = r.bench.findIndex(x => x && x.id === id); if (si !== -1) { u = r.bench[si]; r.bench[si] = null; } }
    if (!u) return;
    r.bag.push(...u.items); u.items = [];
    const refund = Math.floor(u.cost * C.SELL_RATIO);
    r.gold += refund;
    if (G.selectedId === id) G.selectedId = null;
    log(`Vendeu ${u.name} por +${refund}g (itens voltaram à mochila).`, 'gold');
    sfx('buy'); G.save(); changed();
  };

  G.setTeamLimit = function (n) {
    if (!G.canEdit()) return;
    const r = G.run, lim = Math.max(1, Math.min(C.MAX_TEAM, n));
    if (r.board.length > lim) {
      const excess = r.board.length - lim;
      if (r.bench.filter(s => !s).length < excess) return toast(`Banco cheio: libere ${excess} espaço(s) antes de reduzir o limite.`, 'error');
      const sorted = [...r.board].sort((a, b) => (b.row * 10 + b.col) - (a.row * 10 + a.col)).slice(0, excess);
      for (const u of sorted) { r.board = r.board.filter(x => x !== u); u.col = u.row = -1; r.bench[freeBench()] = u; }
      toast(`${excess} unidade(s) movida(s) para o banco.`);
    }
    r.teamLimit = lim; sfx('place'); G.save(); changed();
  };

  /* Coloca/move uma unidade (do campo ou do banco) para um tile do campo. */
  G.placeAt = function (id, col, row) {
    if (!G.canEdit()) return false;
    const r = G.run;
    if (row < P0 || row >= C.ROWS || col < 0 || col >= C.COLS) return false;
    if (G.blocked(col, row)) { toast(`${D.TERRAIN[E.terrainAt(r.terrain, col, row)].name}: não é possível posicionar aqui.`, 'error'); return false; }
    const u = G.find(id); if (!u) return false;
    const occ = r.board.find(x => x.col === col && x.row === row && x.id !== id);
    if (G.onBoard(id)) {
      if (occ) { occ.col = u.col; occ.row = u.row; }
      u.col = col; u.row = row;
    } else {
      const si = r.bench.findIndex(x => x && x.id === id);
      if (occ) { // troca: ocupante vai ao slot do banco
        r.board = r.board.filter(x => x !== occ); occ.col = occ.row = -1; r.bench[si] = occ;
      } else {
        if (r.board.length >= r.teamLimit) { toast(`Limite da composição atingido (${r.board.length}/${r.teamLimit}).`, 'error'); return false; }
        r.bench[si] = null;
      }
      u.col = col; u.row = row; r.board.push(u);
    }
    sfx('place'); G.save(); changed();
    return true;
  };

  G.toBench = function (id, slot = -1) {
    if (!G.canEdit()) return false;
    const r = G.run;
    const bi = r.board.findIndex(x => x.id === id);
    if (bi === -1) { // banco → banco (troca de slots)
      const si = r.bench.findIndex(x => x && x.id === id);
      if (si === -1 || slot < 0 || slot === si) return false;
      [r.bench[si], r.bench[slot]] = [r.bench[slot], r.bench[si]];
      sfx('place'); G.save(); changed(); return true;
    }
    const u = r.board[bi];
    let target = slot >= 0 ? slot : freeBench();
    if (target === -1) { toast('O Banco está cheio.', 'error'); return false; }
    const occ = r.bench[target];
    r.board.splice(bi, 1);
    if (occ) { occ.col = u.col; occ.row = u.row; r.board.push(occ); }
    u.col = u.row = -1; r.bench[target] = u;
    sfx('place'); G.save(); changed(); return true;
  };

  G.toggle = function (id) {
    if (G.onBoard(id)) return G.toBench(id);
    const t = freeBoardTile();
    if (!t) return false;
    return G.placeAt(id, t.col, t.row);
  };

  /* Posicionamento automático por papel: tanques na frente, alcance atrás. */
  G.autoArrange = function () {
    if (!G.canEdit() || !G.run.board.length) return;
    const rowsByPref = { front: [P0, P0 + 1], flank: [P0, P0 + 1], mid: [P0 + 1, P0 + 2, P0], back: [P0 + 4, P0 + 3, P0 + 5, P0 + 2] };
    const order = ['front', 'flank', 'mid', 'back'];
    const cols = [5, 6, 4, 7, 3, 8, 2, 9, 1, 10, 0, 11];
    const taken = new Set();
    const units = [...G.run.board].sort((a, b) => order.indexOf(G.arch(a).pref) - order.indexOf(G.arch(b).pref));
    for (const u of units) {
      const pref = G.arch(u).pref;
      const colOrder = pref === 'flank' ? [1, 10, 2, 9, 0, 11, 3, 8, 4, 7, 5, 6] : cols;
      let placed = false;
      for (const row of [...rowsByPref[pref], P0, P0 + 1, P0 + 2, P0 + 3, P0 + 4, P0 + 5]) {
        for (const col of colOrder) { const k = col + ',' + row; if (!taken.has(k) && !G.blocked(col, row)) { taken.add(k); u.col = col; u.row = row; placed = true; break; } }
        if (placed) break;
      }
    }
    sfx('place'); G.save(); changed();
  };

  /* ---------------- ITENS ---------------- */
  G.equip = function (bagIdx, unitId) {
    if (!G.canEdit()) return toast('Equipe itens fora do combate.', 'error');
    const u = G.find(unitId);
    if (!u) return toast('Selecione uma unidade para equipar.', 'error');
    if (u.items.length >= C.MAX_ITEMS) return toast(`${u.name} já tem ${C.MAX_ITEMS} itens. Clique num slot para remover.`, 'error');
    const it = G.run.bag.splice(bagIdx, 1)[0]; if (!it) return;
    u.items.push(it);
    sfx('place'); toast(`${D.ITEMS[it.id].name} ★${it.tier} equipado em ${u.name}.`, 'success'); G.save(); changed();
  };
  G.unequip = function (unitId, slot) {
    if (!G.canEdit()) return;
    const u = G.find(unitId); if (!u || !u.items[slot]) return;
    G.run.bag.push(u.items.splice(slot, 1)[0]);
    sfx('place'); G.save(); changed();
  };
  G.fusePartner = (idx) => { const a = G.run.bag[idx]; if (!a || a.tier >= C.MAX_ITEM_TIER) return -1; return G.run.bag.findIndex((b, j) => j !== idx && b.id === a.id && b.tier === a.tier); };
  G.fuse = function (idx) {
    if (!G.canEdit()) return;
    const j = G.fusePartner(idx); if (j === -1) return toast('Precisa de 2 itens iguais do mesmo tier.', 'error');
    const a = G.run.bag[idx];
    G.run.bag = G.run.bag.filter((_, k) => k !== idx && k !== j);
    G.run.bag.push({ id: a.id, tier: a.tier + 1 });
    sfx('levelUp'); log(`⚒️ Fundiu 2× ${D.ITEMS[a.id].name} → ★${a.tier + 1}!`, 'gold'); G.save(); changed();
  };

  /* ---------------- PROGRESSÃO ---------------- */
  G.grantXp = function (u, amount) {
    let mult = 1;
    if (G.hasRelic('coroa_lobo') && G.run.board.length <= 3) mult += 0.35;
    for (const it of u.items) if (D.ITEMS[it.id].stats.xpMult) mult += D.ITEMS[it.id].stats.xpMult * C.ITEM_TIER_MULT[it.tier - 1];
    u.xp += Math.round(amount * mult);
    let gained = 0;
    while (u.xp >= G.xpToNext(u.level)) { u.xp -= G.xpToNext(u.level); u.level++; u.evoPoints++; gained++; }
    if (gained) { log(`⭐ ${u.name} chegou ao Nível ${u.level} (+${gained} PE).`, 'level'); sfx('levelUp'); }
    return gained;
  };
  G.upgradeSkill = function (id, sk) {
    const u = G.find(id); if (!u || u.evoPoints <= 0) return;
    const cur = u.skills[sk] || 0; if (cur >= 3) return;
    u.skills[sk] = cur + 1; u.evoPoints--;
    log(`✨ ${u.name}: ${D.SKILLS[sk].name} → Nv.${cur + 1}.`, 'level'); sfx('levelUp'); G.save(); changed();
  };
  G.addElement = function (id, el) {
    const u = G.find(id); if (!u || u.evoPoints <= 0) return;
    u.elements[el] = (u.elements[el] || 0) + 1; u.evoPoints--;
    log(`💠 ${u.name} absorveu ${D.ELEMENTS[el].name} (×${u.elements[el]}).`, 'level'); sfx('levelUp'); G.save(); changed();
  };
  G.totalEvo = () => G.allUnits().reduce((s, u) => s + u.evoPoints, 0);

  /* ---------------- MAPA ---------------- */
  G.findNode = (id) => { for (const f of G.run.map.floors) for (const n of f) if (n.id === id) return n; return null; };
  G.availableNodes = function () {
    const r = G.run;
    if (!r.nodeId) return r.map.floors[0];
    const cur = G.findNode(r.nodeId);
    return cur ? cur.next.map(G.findNode).filter(Boolean) : [];
  };

  G.chooseNode = function (id) {
    const r = G.run;
    if (r.phase !== 'MAP') return;
    const node = G.availableNodes().find(n => n.id === id);
    if (!node) return;
    r.nodeId = id; r.visited.push(id); r.room = node.room; r.act = node.act;
    const nt = D.NODE_TYPES[node.type];
    log(`🗺️ Sala ${r.room}/15: ${nt.icon} ${nt.name}.`);
    if (!r.roomTypesSeen.includes(node.type)) r.roomTypesSeen.push(node.type);
    if (['combate', 'elite', 'chefe'].includes(node.type)) {
      r.roomType = node.type; r.affix = node.affix; r.attempt = 0;
      r.layout = node.layout || 'planicie';
      r.terrain = withRng(rng => E.generateTerrain(rng, r.layout, r.act));
      relocateBlocked();
      r.enemies = withRng(rng => E.generateHorde(rng, r.room, r.act, node.type, r.ascension, r.terrain));
      log(`🗺️ Terreno: ${D.LAYOUTS[r.layout].icon} ${D.LAYOUTS[r.layout].name} — ${D.LAYOUTS[r.layout].desc}`);
      r.phase = 'PREP';
      if (node.type === 'chefe') { sfx('bossGong'); log(`👑 ${D.BOSSES[r.act].name}: ${D.BOSSES[r.act].mechanic}`, 'danger'); }
      G.save(); changed();
      if (G.totalEvo() > 0) FE.Bus.emit('openEvo');
    } else {
      r.affix = 'padrao'; r.enemies = [];
      if (G.hasRelic('bussola_explorador')) { r.gold += 25; log('🧭 Bússola: +25g.', 'gold'); }
      r.pending.push(withRng(rng => buildEvent(node.type, rng)));
      r.afterPending = 'MAP'; r.phase = 'CHOICE';
      G.save(); changed();
    }
  };

  /* ---------------- COMBATE ---------------- */
  G.startCombat = function () {
    const r = G.run;
    if (r.phase !== 'PREP') return;
    if (!r.board.length) return toast('Coloque pelo menos 1 unidade em campo.', 'error');
    if (r.board.length > r.teamLimit) return toast('Excesso de unidades em campo.', 'error');
    G.save();
    const ctx = G.statsCtx();
    G.combat = E.createCombat({
      seed: (FE.util.hashStr(r.seed) ^ (r.room * 7919) ^ (r.attempt * 104729)) >>> 0,
      relics: new Set(r.relics), affix: r.affix, fx: G.settings ? G.settings.fx !== false : true, terrain: r.terrain,
      players: r.board.map(u => ({ unit: { ...u, name: u.name }, stats: G.statsOf(u, ctx) })),
      enemies: r.enemies.map(e => ({ unit: e, stats: G.enemyStats(e) }))
    });
    r.phase = 'COMBAT'; r.stats.combats++;
    log(`⚔️ Combate na Sala ${r.room}/15${r.attempt ? ` (tentativa ${r.attempt + 1})` : ''}.`, 'gold');
    changed();
  };

  G.tick = function (dt) {
    const c = G.combat;
    if (!c) return;
    if (G.run.phase === 'COMBAT' && !c.over) {
      let rem = dt;
      while (rem > 0 && !c.over) { const step = Math.min(0.025, rem); E.updateCombat(c, step); rem -= step; }
      if (c.over && !c.handled) { c.handled = true; finishCombat(c); }
    }
    E.updateFx(c, dt);
  };

  G.emitAch = (ev) => { if (FE.Achievements) FE.Achievements.check(ev); };
  function finishCombat(c) {
    const r = G.run;
    const res = c.result;
    const report = E.combatReport(c);
    G.emitAch({ type: 'combat', won: res.won, time: res.time, report, roomType: r.roomType, room: r.room, act: r.act, layout: r.layout,
      boardSize: r.board.length, losses: report.filter(x => !x.survived).length, maxSummons: c.maxPlayerSummons });
    if (!res.won) r.noLoss = false;
    const pool = G.xpPool();
    const n = Math.max(1, r.board.length);
    const levelUps = [];
    const killXp = 16 + r.room * 3;
    const lines = [];

    for (const rep of report) {
      const u = G.find(rep.rosterId);
      if (u && rep.kills) { const g = G.grantXp(u, rep.kills * killXp); if (g) levelUps.push(`${u.name} → Nv.${u.level}`); }
    }
    r.stats.kills += report.reduce((s, x) => s + x.kills, 0);

    if (res.won) {
      sfx('victory');
      r.stats.wins++;
      let gold = 42 + r.room * 10 + (r.roomType === 'elite' ? 30 : 0) + (r.roomType === 'chefe' ? 60 : 0);
      if (G.hasRelic('cofre_mercador')) gold += 15;
      if (r.roomType === 'chefe' && G.meta.upgrades.relicStart > 1) gold += G.meta.upgrades.relicStart * 10;
      const interest = Math.min(C.INTEREST_CAP, Math.floor(r.gold * C.INTEREST_RATE));
      r.gold += gold + interest; r.stats.goldEarned += gold + interest;
      lines.push(`🪙 +${gold}g de recompensa e +${interest}g de juros`);
      const trans = r.board.reduce((sum, u) => sum + (u.skills.al_transmutar || 0) * 8, 0);
      if (trans) { r.gold += trans; lines.push(`⚗️ Transmutação: +${trans}g`); }
      const per = Math.floor(pool / n);
      for (const u of r.board) { const g = G.grantXp(u, per); if (g) levelUps.push(`${u.name} → Nv.${u.level}`); }
      lines.push(`📘 +${per} XP para cada uma das ${n} unidade(s) em campo (+${killXp} XP por abate)`);
      log(`🏆 Sala ${r.room} vencida! +${gold + interest}g, +${per} XP/unid.`, 'win');

      const pend = [];
      if (r.roomType === 'combate' && withRng(rng => rng.chance(C.NORMAL_ITEM_DROP))) {
        const it = withRng(rng => ({ id: rng.pick(Object.keys(D.ITEMS)), tier: 1 }));
        r.bag.push(it); lines.push(`🎁 Item encontrado: ${D.ITEMS[it.id].icon} ${D.ITEMS[it.id].name}`);
      }
      if (r.roomType === 'elite') {
        r.stats.elites++;
        const it = withRng(rng => ({ id: rng.pick(Object.keys(D.ITEMS)), tier: 1 }));
        r.bag.push(it); lines.push(`🎁 Item de Elite: ${D.ITEMS[it.id].icon} ${D.ITEMS[it.id].name}`);
        pend.push(makeRelicChoice('elite'));
      }
      if (r.roomType === 'chefe') {
        r.stats.bosses++;
        const it = withRng(rng => ({ id: rng.pick(Object.keys(D.ITEMS)), tier: 2 }));
        r.bag.push(it); lines.push(`🎁 Espólio do Chefe: ${D.ITEMS[it.id].icon} ${D.ITEMS[it.id].name} ★2`);
        if (G.hasRelic('lanterna_ancestral')) { r.board.forEach(u => u.evoPoints++); lines.push('🏮 Lanterna Ancestral: +1 PE para todo o campo'); }
        if (r.room >= C.TOTAL_ROOMS) { G.combatReportData = { report, lines, levelUps, won: true }; return endRun(true, report); }
        pend.push(makeRelicChoice('boss'));
        // Avança de Ato
        r.act++; r.nodeId = null;
        r.map = withRng(rng => E.generateActMap(rng, r.act, r.ascension));
        const healAmt = 20;
        r.citadelHp = Math.min(r.citadelMax, r.citadelHp + healAmt);
        lines.push(`🏰 Novo Ato: ${D.ACTS[r.act].name}. Cidadela +${healAmt}.`);
        log(`🌄 ${D.ACTS[r.act].short} — ${D.ACTS[r.act].name}!`, 'gold');
      }
      r.pending.unshift({ kind: 'report', won: true, title: r.roomType === 'chefe' ? '👑 Chefe Derrotado!' : '🏆 Vitória!', lines, levelUps, report, time: res.time });
      r.pending.push(...pend);
      r.afterPending = 'MAP';
      r.enemies = [];
    } else {
      sfx('defeat');
      r.stats.losses++;
      const dmg = Math.max(10, res.survivors * 7 + r.act * 4);
      r.citadelHp = Math.max(0, r.citadelHp - dmg);
      const per = Math.floor(pool * 0.45 / n);
      for (const u of r.board) { const g = G.grantXp(u, per); if (g) levelUps.push(`${u.name} → Nv.${u.level}`); }
      lines.push(`🏰 A Cidadela sofreu -${dmg} (${r.citadelHp}/${r.citadelMax})`);
      lines.push(`📘 +${per} XP de treino por unidade`);
      log(`💥 Derrota na Sala ${r.room}: Cidadela -${dmg}.`, 'danger');
      if (r.citadelHp <= 0) return endRun(false, report);
      r.attempt++;
      r.pending.unshift({ kind: 'report', won: false, title: '💥 Derrota', lines: [...lines, '🔁 Ajuste a composição e tente a sala novamente.'], levelUps, report, time: res.time });
      r.afterPending = 'PREP';
    }
    r.phase = 'CHOICE';
    G.save(); changed();
  }

  function endRun(victory, report) {
    const r = G.run;
    const shards = Math.max(10, r.room * 5 + r.stats.elites * 12 + r.stats.bosses * 25 + (victory ? 60 : 0) + r.ascension * 15);
    const m = G.meta;
    m.astralShards += shards;
    m.records.bestRoom = Math.max(m.records.bestRoom, r.room);
    m.records.kills += r.stats.kills;
    let unlocked = false;
    if (victory) {
      m.records.wins++;
      m.records.bestWinAscension = Math.max(m.records.bestWinAscension, r.ascension);
      if (r.ascension >= m.maxAscension && m.maxAscension < D.ASCENSIONS.length - 1) { m.maxAscension++; unlocked = true; }
    }
    G.saveMeta();
    r.phase = 'END';
    G.emitAch({ type: 'end', victory });
    r.ended = { victory, shards, unlocked, report };
    FE.Storage.del(C.SAVE_KEY_RUN);
    log(victory ? '👑 EXPEDIÇÃO CONCLUÍDA!' : '💀 A Cidadela caiu.', victory ? 'win' : 'danger');
    changed();
  }

  /* ---------------- ESCOLHAS PENDENTES (relíquias, eventos, loja) ---------------- */
  function relicPool(source) {
    const owned = new Set(G.run.relics);
    const pool = Object.values(D.RELICS).filter(x => !owned.has(x.id));
    const w = source === 'boss' ? { comum: 20, rara: 55, lendaria: 25 } : source === 'start' ? { comum: 70, rara: 30, lendaria: 0 } : { comum: 58, rara: 34, lendaria: 8 };
    return withRng(rng => {
      const picks = [];
      for (let i = 0; i < 3 && pool.length; i++) {
        const avail = Object.keys(w).filter(k => w[k] > 0 && pool.some(p => p.rarity === k));
        if (!avail.length) break;
        const rar = rng.weighted(avail.map(k => [k, w[k]]));
        const cands = pool.filter(p => p.rarity === rar);
        const pick = rng.pick(cands);
        picks.push(pick); pool.splice(pool.indexOf(pick), 1);
      }
      return picks;
    });
  }
  function makeRelicChoice(source) {
    const picks = relicPool(source);
    return {
      kind: 'choice', title: source === 'boss' ? '👑 Tesouro do Chefe — Escolha 1 Relíquia' : source === 'start' ? '🏺 Herança Arcana — Relíquia Inicial' : '💀 Tesouro de Elite — Escolha 1 Relíquia',
      subtitle: 'Relíquias concedem efeitos passivos pelo resto da expedição.',
      options: picks.map(p => ({ icon: p.icon, title: p.name, desc: p.desc, tag: D.RARITY[p.rarity].name, rarity: p.rarity, effects: { relic: p.id } })),
      allowSkip: true
    };
  }
  function pushRelicChoice(source) {
    G.run.pending.push(makeRelicChoice(source));
    G.run.afterPending = 'MAP'; G.run.phase = 'CHOICE';
  }

  function topUnit() { return G.allUnits().slice().sort((a, b) => b.level - a.level || b.xp - a.xp)[0] || null; }
  function allItems() { return [...G.run.bag, ...G.allUnits().flatMap(u => u.items)]; }

  function buildEvent(type, rng) {
    const r = G.run, a = r.act;
    const itemKeys = Object.keys(D.ITEMS);
    if (type === 'forja') {
      const opts = rng.shuffle(itemKeys).slice(0, 3).map(id => {
        const tier = a >= 3 && rng.chance(0.4) ? 2 : 1;
        return { icon: D.ITEMS[id].icon, title: `${D.ITEMS[id].name} ★${tier}`, desc: D.ITEMS[id].descFor(tier), tag: 'Forjar', effects: { item: { id, tier } } };
      });
      if (allItems().some(i => i.tier < C.MAX_ITEM_TIER)) opts.push({ icon: '🔨', title: 'Aprimorar Equipamento', desc: 'Eleva em +1 tier o item de menor tier que você possui (equipado ou na mochila).', tag: 'Aprimorar', effects: { upgradeItem: true } });
      return { kind: 'choice', title: '⚒️ Forja Rúnica', subtitle: 'O ferreiro ancestral oferece seu trabalho.', options: opts };
    }
    if (type === 'santuario') {
      const el = D.ELEMENTS[rng.pick(Object.keys(D.ELEMENTS))];
      return { kind: 'choice', title: '🔮 Santuário Elemental', subtitle: 'Os espíritos oferecem poder em troca de devoção.', options: [
        { icon: el.icon, title: `Infusão de ${el.name}`, desc: `Todas as unidades em campo recebem +1 stack de ${el.name}.`, tag: 'Sinergia em massa', effects: { elementAll: el.id } },
        { icon: '⭐', title: 'Despertar do Líder', desc: 'A unidade de maior nível ganha +2 Pontos de Evolução.', tag: '+2 PE', effects: { evoTop: 2 } },
        { icon: '🩸', title: 'Pacto de Sangue', desc: `Sacrifique 15 de Cidadela por +${80 + a * 15}g.`, tag: 'Risco', effects: { citadel: -15, gold: 80 + a * 15 } }
      ] };
    }
    if (type === 'acampamento') {
      return { kind: 'choice', title: '🏕️ Acampamento', subtitle: 'Um momento de descanso antes da próxima batalha.', options: [
        { icon: '❤️', title: 'Reparar Muralhas', desc: `Restaura +${20 + a * 5} de Cidadela.`, tag: 'Recuperação', effects: { citadel: 20 + a * 5 } },
        { icon: '⚔️', title: 'Treinamento Intensivo', desc: `+${160 + a * 60} XP divididos entre as unidades em campo.`, tag: 'XP', effects: { xpSplit: 160 + a * 60 } },
        { icon: '🪙', title: 'Saquear Suprimentos', desc: `+${55 + a * 15}g.`, tag: 'Ouro', effects: { gold: 55 + a * 15 } }
      ] };
    }
    if (type === 'mercador') {
      const disc = 1 - 0.05 * G.meta.upgrades.contatos;
      const price = (p) => Math.round(p * disc);
      const offers = rng.shuffle(itemKeys).slice(0, 3).map(id => {
        const tier = rng.chance(a * 0.15) ? 2 : 1;
        return { icon: D.ITEMS[id].icon, title: `${D.ITEMS[id].name} ★${tier}`, desc: D.ITEMS[id].descFor(tier), price: price(tier === 2 ? 130 : 70), effects: { item: { id, tier } } };
      });
      const rp = Object.values(D.RELICS).filter(x => !r.relics.includes(x.id));
      if (rp.length) { const rel = rng.pick(rp); offers.push({ icon: rel.icon, title: rel.name, desc: rel.desc, tag: D.RARITY[rel.rarity].name, rarity: rel.rarity, price: price({ comum: 120, rara: 170, lendaria: 240 }[rel.rarity]), effects: { relic: rel.id } }); }
      offers.push({ icon: '🧱', title: 'Pedreiros', desc: 'Repara +20 de Cidadela.', price: price(45), effects: { citadel: 20 } });
      offers.push({ icon: '📜', title: 'Pergaminho de Evolução', desc: '+1 PE para a unidade de maior nível.', price: price(90), effects: { evoTop: 1 } });
      return { kind: 'shop', title: '🛒 Mercador Errante', subtitle: 'Compre quantas ofertas quiser e depois siga viagem.', offers };
    }
    // Mistério
    const events = [
      () => ({ title: '❓ Altar Quebrado', subtitle: 'Uma relíquia brilha entre pedras rachadas. Um tributo parece necessário.', options: [
        { icon: '🏺', title: 'Pagar o tributo (60g)', desc: 'Receba uma relíquia comum aleatória.', cost: 60, tag: 'Relíquia', effects: { gold: -60, randomRelic: 'comum' } },
        { icon: '🚶', title: 'Seguir viagem', desc: 'Nada acontece.', tag: 'Ignorar', effects: {} } ] }),
      () => { const arch = rng.pick(Object.keys(D.ARCHETYPES)); return { title: '❓ Mercenário Ferido', subtitle: `Um ${D.ARCHETYPES[arch].name} ferido pede abrigo.`, options: [
        { icon: D.ARCHETYPES[arch].symbol, title: 'Acolher no grupo', desc: `Recebe um ${D.ARCHETYPES[arch].name} Nível ${1 + a} gratuitamente (vai ao banco).`, tag: 'Unidade grátis', effects: { recruit: { arch, level: 1 + a } } },
        { icon: '🪙', title: 'Pedir pagamento', desc: `Ele paga ${30 + a * 10}g pela ajuda.`, tag: 'Ouro', effects: { gold: 30 + a * 10 } } ] }; },
      () => { const els = rng.shuffle(Object.keys(D.ELEMENTS)).slice(0, 2); return { title: '❓ Fonte Elemental', subtitle: 'Duas correntes de energia se cruzam numa fonte antiga.', options: els.map(el => (
        { icon: D.ELEMENTS[el].icon, title: `Banhar-se em ${D.ELEMENTS[el].name}`, desc: `A unidade de maior nível recebe +2 stacks de ${D.ELEMENTS[el].name}.`, tag: 'Elemento', effects: { elementTop: el, elementTopN: 2 } })) }; },
      () => { const id = rng.pick(itemKeys); return { title: '❓ Baú Amaldiçoado', subtitle: 'Um baú pulsa com energia sombria.', options: [
        { icon: D.ITEMS[id].icon, title: `Abrir (−12 Cidadela)`, desc: `Receba ${D.ITEMS[id].name} ★2.`, tag: 'Risco', effects: { citadel: -12, item: { id, tier: 2 } } },
        { icon: '🚶', title: 'Deixar fechado', desc: 'Prudência.', tag: 'Ignorar', effects: {} } ] }; },
      () => ({ title: '❓ Biblioteca Esquecida', subtitle: 'Tomos antigos sobre táticas elementais.', options: [
        { icon: '📖', title: 'Estudar a fundo', desc: 'A unidade de maior nível ganha +1 PE.', tag: '+1 PE', effects: { evoTop: 1 } },
        { icon: '📚', title: 'Leitura em grupo', desc: `+${120 + a * 50} XP divididos entre o campo.`, tag: 'XP', effects: { xpSplit: 120 + a * 50 } } ] }),
      () => ({ title: '❓ Ferreiro Itinerante', subtitle: 'Um ferreiro anão oferece seus serviços.', options: [
        { icon: '🔨', title: 'Aprimorar (50g)', desc: 'Eleva +1 tier o seu item de menor tier.', cost: 50, tag: 'Aprimorar', effects: { gold: -50, upgradeItem: true } },
        { icon: '🎁', title: 'Comprar sucata (25g)', desc: 'Receba 1 item ★1 aleatório.', cost: 25, tag: 'Item', effects: { gold: -25, randomItem: 1 } },
        { icon: '🚶', title: 'Recusar', desc: 'Seguir viagem.', tag: 'Ignorar', effects: {} } ] })
    ];
    const ev = rng.pick(events)();
    return { kind: 'choice', ...ev };
  }

  function applyEffects(fx) {
    const r = G.run;
    if (fx.gold) { r.gold = Math.max(0, r.gold + fx.gold); if (fx.gold > 0) log(`🪙 +${fx.gold}g.`, 'gold'); }
    if (fx.citadel) {
      r.citadelHp = fx.citadel > 0 ? Math.min(r.citadelMax, r.citadelHp + fx.citadel) : Math.max(1, r.citadelHp + fx.citadel);
      log(`🏰 Cidadela ${fx.citadel > 0 ? '+' : ''}${fx.citadel} (${r.citadelHp}/${r.citadelMax}).`, fx.citadel > 0 ? 'win' : 'danger');
    }
    if (fx.relic) addRelic(fx.relic);
    if (fx.randomRelic) {
      const pool = Object.values(D.RELICS).filter(x => x.rarity === fx.randomRelic && !r.relics.includes(x.id));
      if (pool.length) addRelic(withRng(rng => rng.pick(pool)).id);
    }
    if (fx.item) { r.bag.push({ ...fx.item }); log(`🎒 ${D.ITEMS[fx.item.id].name} ★${fx.item.tier} na mochila.`, 'gold'); }
    if (fx.randomItem) { const id = withRng(rng => rng.pick(Object.keys(D.ITEMS))); r.bag.push({ id, tier: fx.randomItem }); log(`🎒 ${D.ITEMS[id].name} na mochila.`, 'gold'); }
    if (fx.upgradeItem) {
      const items = allItems().filter(i => i.tier < C.MAX_ITEM_TIER).sort((x, y) => x.tier - y.tier);
      if (items[0]) { items[0].tier++; log(`🔨 ${D.ITEMS[items[0].id].name} aprimorado para ★${items[0].tier}.`, 'gold'); }
    }
    if (fx.xpSplit) { const n = Math.max(1, r.board.length); const per = Math.floor(fx.xpSplit / n); r.board.forEach(u => G.grantXp(u, per)); log(`📘 +${per} XP por unidade em campo.`, 'level'); }
    if (fx.evoTop) { const u = topUnit(); if (u) { u.evoPoints += fx.evoTop; log(`⭐ ${u.name} +${fx.evoTop} PE.`, 'level'); } }
    if (fx.elementAll) { r.board.forEach(u => { u.elements[fx.elementAll] = (u.elements[fx.elementAll] || 0) + 1; }); log(`🔮 +1 ${D.ELEMENTS[fx.elementAll].name} em todo o campo.`, 'level'); }
    if (fx.elementTop) { const u = topUnit(); if (u) { u.elements[fx.elementTop] = (u.elements[fx.elementTop] || 0) + (fx.elementTopN || 1); log(`💠 ${u.name} +${fx.elementTopN || 1} ${D.ELEMENTS[fx.elementTop].name}.`, 'level'); } }
    if (fx.recruit) {
      const slot = freeBench();
      if (slot === -1) { r.gold += 40; log('Banco cheio: o mercenário deixou 40g.', 'gold'); }
      else {
        const arch = D.ARCHETYPES[fx.recruit.arch], id = r.nextUnitId++;
        const u = { id, archetypeId: arch.id, name: `${arch.name} #${id}`, cost: arch.cost, level: fx.recruit.level, xp: 0, evoPoints: fx.recruit.level - 1, col: -1, row: -1, elements: {}, skills: { [arch.signatureSkill]: 1 }, items: [] };
        r.bench[slot] = u; log(`🤝 ${u.name} juntou-se ao grupo.`, 'level');
      }
    }
  }

  function addRelic(id) {
    const r = G.run;
    if (r.relics.includes(id)) return;
    r.relics.push(id);
    log(`🏺 Relíquia obtida: ${D.RELICS[id].name}!`, 'level');
    if (id === 'tomo_evolucao') { const u = topUnit(); if (u) u.evoPoints++; }
    if (id === 'coracao_forja') { const it = withRng(rng => rng.pick(Object.keys(D.ITEMS))); r.bag.push({ id: it, tier: 1 }); toast(`Coração da Forja criou: ${D.ITEMS[it].name}!`, 'success'); }
  }

  G.currentPending = () => (G.run && G.run.pending[0]) || null;
  G.optionAffordable = (opt) => !(opt.cost && G.run.gold < opt.cost) && !(opt.price && G.run.gold < opt.price);

  G.resolveOption = function (i) {
    const r = G.run, p = r.pending[0];
    if (!p) return;
    if (p.kind === 'shop') {
      const o = p.offers[i];
      if (!o || o.sold) return;
      if (r.gold < o.price) return toast('Ouro insuficiente.', 'error');
      r.gold -= o.price; o.sold = true; applyEffects(o.effects); sfx('buy');
      G.save(); changed(); return;
    }
    if (p.kind === 'choice') {
      const o = p.options[i];
      if (!o || !G.optionAffordable(o)) return toast('Requisito não atendido.', 'error');
      applyEffects(o.effects || {}); sfx('levelUp');
    }
    nextPending();
  };
  G.skipPending = function () { nextPending(); };
  function nextPending() {
    const r = G.run;
    r.pending.shift();
    if (!r.pending.length) {
      r.phase = r.afterPending || 'MAP';
      if (r.phase === 'PREP' && G.totalEvo() > 0) setTimeout(() => FE.Bus.emit('openEvo'), 0);
    }
    G.save(); changed();
  }
})(typeof window !== 'undefined' ? window : globalThis);
