/* ==========================================================================
   FORJA ELEMENTAL 2.2 — game.js
   Regras da expedição: estado da run, jogadores (solo ou co-op local de
   2–4), economia, roster, progressão, mapa, eventos e persistência.
   Sem DOM: comunica-se com a UI por FE.Bus ('changed', 'log', 'toast',
   'sfx', 'openEvo'). Escolhas ficam numa fila serializável (run.pending).

   MODELO DE JOGADORES
   run.players[i] = { id, name, color, gold, bench[8], bag[], teamLimit, ready }
   Cada unidade tem `owner` (índice do jogador). O campo é compartilhado.
   Solo = 1 jogador com limite 1–16. Co-op = N jogadores com teto de
   12/N unidades em campo cada (6, 4 ou 3).
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE;
  const D = FE.Data, C = D.CONFIG, E = FE.Engine;

  const log = (t, type = '') => FE.Bus.emit('log', { t, type });
  const toast = (t, type = 'info') => FE.Bus.emit('toast', { t, type });
  const sfx = (name, arg) => FE.Bus.emit('sfx', { name, arg });
  const changed = () => FE.Bus.emit('changed');

  const G = FE.Game = { run: null, meta: null, combat: null, paused: false };
  const PLAYER_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24'];
  G.PLAYER_COLORS = PLAYER_COLORS;

  /* ---------------- META (com migração da v1) ---------------- */
  function defaultMeta() {
    return {
      v: 2, astralShards: 0,
      upgrades: Object.fromEntries(Object.keys(D.META_UPGRADES).map(k => [k, 0])),
      maxAscension: 0, migratedV1: false,
      records: { runs: 0, wins: 0, bestRoom: 0, kills: 0, bestWinAscension: -1, coopRuns: 0, coopWins: 0 },
      ach: {}, secrets: {}, daily: {}, seenTutorial: false,
      lifetime: { recruited: [], terrainsWon: [], bossesKilled: 0 }
    };
  }
  G.loadMeta = function () {
    const def = defaultMeta();
    const m = Object.assign(def, FE.Storage.get(C.SAVE_KEY_META) || {});
    m.upgrades = Object.assign(defaultMeta().upgrades, m.upgrades || {});
    m.records = Object.assign(defaultMeta().records, m.records || {});
    m.ach = m.ach || {}; m.secrets = m.secrets || {}; m.daily = m.daily || {};
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
  /* Segredos (easter eggs) — registrados na meta e verificados pelas conquistas */
  G.secret = function (id) {
    if (!G.meta) return;
    const first = !G.meta.secrets[id];
    G.meta.secrets[id] = (G.meta.secrets[id] || 0) + 1;
    G.saveMeta();
    G.emitAch({ type: 'secret', id });
    return first;
  };

  /* ---------------- RNG da run ---------------- */
  function withRng(fn) {
    const r = FE.RNG(1); r.state = G.run.rngState;
    const out = fn(r); G.run.rngState = r.state;
    return out;
  }

  /* ---------------- JOGADORES ---------------- */
  G.coop = () => (G.run ? G.run.players.length : 1);
  G.isCoop = () => G.coop() > 1;
  G.capPerPlayer = () => (G.isCoop() ? C.COOP_TOTAL_UNITS / G.coop() : C.MAX_TEAM);
  G.goldFactor = () => (G.isCoop() ? 2 / G.coop() : 1);
  G.xpShare = () => (G.isCoop() ? G.capPerPlayer() / C.COOP_XP_DIV : 1);
  G.me = () => G.run.players[G.run.active] || G.run.players[0];
  G.P = (pid) => G.run.players[pid || 0];
  G.ownerOf = (u) => G.P(u.owner || 0);
  G.boardOf = (pid) => G.run.board.filter(u => (u.owner || 0) === pid);
  G.isMine = (u) => !!u && (u.owner || 0) === G.run.active;
  G.setActive = function (pid) {
    if (!G.run || pid < 0 || pid >= G.run.players.length || pid === G.run.active) return;
    G.run.active = pid; G.selectedId = null; sfx('click'); changed();
  };
  const unready = (pid) => { const p = G.P(pid); if (p) p.ready = false; };

  /* ---------------- CRIAÇÃO / SAVE / LOAD ---------------- */
  G.newRun = function ({ seed, ascension = 0, players = 1, names = [], daily = null, scaling = 'dinamica' } = {}) {
    const seedStr = (seed && String(seed).trim().toUpperCase()) || FE.util.randomSeedString();
    const seedNum = FE.util.hashStr(seedStr);
    const asc = daily ? daily.ascension : Math.max(0, Math.min(ascension, G.meta.maxAscension));
    const n = Math.max(1, Math.min(4, players | 0));
    const up = G.meta.upgrades;
    const citadelMax = C.START_CITADEL + up.citadelMax * 10 - (asc >= 4 ? 20 : 0) + (n > 1 ? 20 : 0);
    const firstRun = G.meta.records.runs === 0 && !G.meta.seenTutorial;
    G.combat = null; G.paused = false;
    const cap = n > 1 ? C.COOP_TOTAL_UNITS / n : C.MAX_TEAM;
    const gf = n > 1 ? 2 / n : 1;
    G.run = {
      v: 4, seed: seedStr, rngState: seedNum, ascension: asc, daily: daily ? daily.date : null,
      act: 1, room: 0, nodeId: null, visited: [], map: null,
      roomType: 'combate', affix: 'padrao', enemies: [], attempt: 0,
      citadelHp: citadelMax, citadelMax, nextUnitId: 1,
      players: Array.from({ length: n }, (_, i) => ({
        id: i, name: (names[i] && String(names[i]).trim().slice(0, 14)) || (n > 1 ? `Jogador ${i + 1}` : 'Comandante'),
        color: PLAYER_COLORS[i], gold: Math.round((C.START_GOLD + up.goldStart * 15) * gf) - (asc >= 2 ? 30 : 0),
        bench: Array(C.BENCH).fill(null), bag: [], teamLimit: n > 1 ? Math.min(cap, 3) : C.START_TEAM_LIMIT, ready: false,
        recruited: 0, kills: 0, dmg: 0, heal: 0, offers: [], rerolls: 0
      })),
      active: 0, turn: 0,
      board: [], relics: [],
      stats: { kills: 0, elites: 0, bosses: 0, combats: 0, wins: 0, losses: 0, goldEarned: 0 },
      phase: 'MAP', pending: [], afterPending: 'MAP', ended: null,
      terrain: '.'.repeat(C.COLS * C.ROWS), layout: 'planicie', roomTypesSeen: [], noLoss: true,
      flags: { galinha: seedStr === 'GALINHA', eggWins: 0 },
      scaling: D.SCALING.modes[scaling] ? scaling : 'dinamica', threat: 0, scale: null,
      tactic: 'equilibrio', doctrine: null, intel: null, objective: null, lastDoctrine: null
    };
    G.run.players.forEach(p => G.refreshOffers(p.id, true));
    G.run.map = withRng(r => E.generateActMap(r, 1, asc));
    G.meta.records.runs++; if (n > 1) G.meta.records.coopRuns++;
    G.saveMeta();
    log(`🌌 Nova Expedição ${n > 1 ? `cooperativa (${n} jogadores, até ${cap} unidades cada)` : 'solo'} — seed ${seedStr}${asc ? ` • Ascensão ${asc}` : ''}.`, 'gold');
    if (G.run.flags.galinha) { log('🐔 Có-có-có? Algo parece... diferente nesta expedição.', 'level'); G.secret('galinha'); }
    if (firstRun) { G.run.pending.push(storyTutorial()); G.meta.seenTutorial = true; G.saveMeta(); }
    G.run.pending.push(storyAct(1));
    if (up.relicStart >= 1) G.run.pending.push(makeRelicChoice('start'));
    G.run.afterPending = 'MAP'; G.run.phase = 'CHOICE';
    G.save(); changed();
  };

  G.save = function () {
    if (!G.run || G.run.phase === 'END') return;
    if (G.run.phase === 'COMBAT') return; // salvo antes do combate
    G.emitAch({ type: 'state' });
    FE.Storage.set(C.SAVE_KEY_RUN, G.run);
  };
  G.hasSave = () => { const s = FE.Storage.get(C.SAVE_KEY_RUN); return !!(s && s.v === 4 && s.phase !== 'END'); };
  G.savedSummary = () => { const s = FE.Storage.get(C.SAVE_KEY_RUN); return s && s.v === 4 ? s : null; };
  G.loadRun = function () {
    const s = FE.Storage.get(C.SAVE_KEY_RUN);
    if (!s || s.v !== 4) return false;
    if (s.phase === 'COMBAT') s.phase = 'PREP';
    s.players.forEach(p => { p.ready = false; });
    G.run = s;
    if (!s.tactic) s.tactic = 'equilibrio';
    s.players.forEach(p => { if (!p.offers || !p.offers.length) { p.offers = []; p.rerolls = 0; G.refreshOffers(p.id, true); } }); G.combat = null; G.paused = false;
    log(`📂 Expedição retomada — Ato ${s.act}, Sala ${s.room}/${C.TOTAL_ROOMS}.`, 'gold');
    changed();
    return true;
  };
  G.abandonRun = function () { FE.Storage.del(C.SAVE_KEY_RUN); G.run = null; G.combat = null; };

  /* ---------------- CONSULTAS ---------------- */
  G.arch = (u) => D.ARCHETYPES[u.archetypeId];
  G.allUnits = () => [...G.run.board, ...G.run.players.flatMap(p => p.bench.filter(Boolean))];
  G.unitsOf = (pid) => [...G.boardOf(pid), ...G.P(pid).bench.filter(Boolean)];
  G.find = (id) => G.allUnits().find(u => u.id === id) || null;
  G.onBoard = (id) => G.run.board.some(u => u.id === id);
  G.canEdit = () => G.run && (G.run.phase === 'PREP' || G.run.phase === 'MAP');
  G.hasRelic = (id) => G.run.relics.includes(id);
  G.xpToNext = (lvl) => Math.floor(C.XP_BASE * Math.pow(C.XP_GROWTH, lvl - 1));
  G.recruitCost = (archId) => Math.round(D.ARCHETYPES[archId].cost * (1 - 0.05 * G.meta.upgrades.contatos));
  G.totalGold = () => G.run.players.reduce((s, p) => s + p.gold, 0);

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
  G.statsCtx = (pid, neutral) => ({ isEnemy: false, board: G.run.board, relics: new Set(G.run.relics), affix: G.run.affix,
    gold: pid === undefined ? Math.round(G.totalGold() / G.coop()) : G.P(pid).gold, synergy: G.synergyCounts(), orders: G.orderCounts(), tactic: neutral ? null : G.run.tactic });
  G.statsOf = (u, ctx) => E.computeStats(u, ctx || G.statsCtx(u.owner || 0));
  G.enemyStats = (e, noDef) => E.computeStats(e, { isEnemy: true, affix: G.run.affix, ascension: G.run.ascension, act: G.run.act, noDef: !!noDef, defK: G.run.scaling === 'classica' || G.run.scaling === 'nivelada' ? (root.__ck || D.ENEMY_DEFENSE.fixedK) : 1 });

  /* Pool de XP de uma sala. No co-op cada jogador recebe sua parte
     (pool × teto/6), dividida apenas entre as próprias unidades em campo. */
  G.xpPool = function () {
    const r = G.run;
    let base = 120 + Math.max(1, r.room) * 34;
    if (r.roomType === 'elite') base *= 1.45;
    if (r.roomType === 'chefe') base *= 1.75;
    base *= 1 + G.meta.upgrades.xpBonus * 0.08;
    if (G.hasRelic('tomo_evolucao')) base *= 1.25;
    return Math.round(base);
  };
  G.playerXpPool = () => Math.round(G.xpPool() * G.xpShare());

  /* ---------------- ROSTER ---------------- */
  const P0 = C.PLAYER_ROW;
  G.blocked = (col, row) => E.tileBlocked(G.run.terrain, col, row);
  function freeBoardTile() {
    const cols = [5, 6, 4, 7, 3, 8, 2, 9, 1, 10, 0, 11];
    for (const r of [P0 + 1, P0 + 2, P0, P0 + 3, P0 + 4, P0 + 5]) for (const c of cols) if (!G.blocked(c, r) && !G.run.board.some(u => u.col === c && u.row === r)) return { col: c, row: r };
    return null;
  }
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
  const freeBench = (p) => p.bench.findIndex(s => s === null);
  function guardOwner(u) {
    if (!u) return false;
    if (!G.isMine(u)) { toast(`Essa unidade é de ${G.ownerOf(u).name}. Troque de jogador para mexer nela.`, 'error'); return false; }
    return true;
  }

  /* ---------------- QUARTEL (recrutamento) ----------------
     Cada jogador vê 5 recrutas por sala, com qualidade (Recruta/Veterano/Herói)
     e traços. Pode rolar de novo (ouro), travar cartas para a próxima sala ou
     contratar qualquer arquétipo direto por um preço maior (Contrato). */
  const QT = D.QUARTEL;
  G.contractCost = (archId) => Math.round(G.recruitCost(archId) * QT.contractMult);
  G.rerollCost = (pid = G.run.active) => QT.rerollBase + QT.rerollStep * (G.P(pid).rerolls || 0);
  function rollOffer(rng, pid, want) {
    const r = G.run, act = Math.max(1, r.act), odds = QT.odds[Math.min(3, act - 1)];
    let x = rng.next(), qi = 0;
    while (qi < odds.length - 1 && x > odds[qi]) { x -= odds[qi]; qi++; }
    if (r.room <= 1 && qi > 1) qi = 1;
    const q = QT.quality[qi];
    const archs = Object.values(D.ARCHETYPES);
    let pool = archs;
    if (want === 'front') pool = archs.filter(a => a.pref === 'front' || a.pref === 'mid');
    else if (want === 'back') pool = archs.filter(a => a.pref === 'back');
    else if (rng.chance(QT.synergyBias)) {
      const mineOrders = new Set(G.unitsOf(pid).flatMap(u => D.ARCHETYPES[u.archetypeId].orders));
      const fit = archs.filter(a => a.orders.some(o => mineOrders.has(o)));
      if (fit.length) pool = fit;
    }
    const arch = rng.pick(pool);
    let trait = null, el = null;
    if (rng.chance(q.traitChance)) {
      const ts = Object.values(D.TRAITS).filter(t => q.rareTrait ? t.rare : (t.rare ? rng.chance(0.25) : true));
      trait = rng.pick(ts.length ? ts : Object.values(D.TRAITS)).id;
      if (trait === 'afinidade') el = rng.pick(Object.keys(D.ELEMENTS));
    }
    const tm = trait && D.TRAITS[trait].costMult ? D.TRAITS[trait].costMult : 1;
    return { arch: arch.id, quality: qi, trait, el, cost: Math.max(10, Math.round(G.recruitCost(arch.id) * q.costMult * tm)), locked: false };
  }
  G.refreshOffers = function (pid, newRoom) {
    const p = G.P(pid);
    if (!p.offers) p.offers = [];
    if (newRoom) p.rerolls = 0;
    withRng(rng => {
      const keep = p.offers.filter(o => o && o.locked);
      const fresh = [];
      const slots = QT.slots - keep.length;
      for (let i = 0; i < slots; i++) fresh.push(rollOffer(rng, pid, i === 0 ? 'front' : i === 1 ? 'back' : null));
      p.offers = [...keep, ...rng.shuffle(fresh)].slice(0, QT.slots);
    });
  };
  G.reroll = function () {
    const p = G.me();
    if (!G.canEdit()) return toast('Aguarde o fim do combate.', 'error');
    const cost = G.rerollCost(p.id);
    if (p.gold < cost) return toast(`Rolar o Quartel custa ${cost}g.`, 'error');
    p.gold -= cost; p.rerolls = (p.rerolls || 0) + 1;
    G.refreshOffers(p.id, false);
    sfx('click'); G.save(); changed();
  };
  G.toggleLock = function (i) {
    const o = G.me().offers[i]; if (!o) return;
    o.locked = !o.locked; sfx('click'); G.save(); changed();
  };
  function addUnit(p, archId, cost, extra = {}) {
    const r = G.run, arch = D.ARCHETYPES[archId];
    const tile = G.boardOf(p.id).length < p.teamLimit ? freeBoardTile() : null;
    const slot = freeBench(p);
    if (!tile && slot === -1) { toast('Campo e Banco cheios. Aumente o limite ou venda uma unidade.', 'error'); return null; }
    if (p.gold < cost) { toast(`Ouro insuficiente: custa ${cost}g.`, 'error'); return null; }
    p.gold -= cost; p.recruited++;
    const id = r.nextUnitId++;
    const lvl = extra.level || 1;
    const t = extra.trait ? D.TRAITS[extra.trait] : null;
    const u = { id, owner: p.id, archetypeId: archId, name: `${arch.name} #${id}`, cost, level: lvl, xp: 0,
      evoPoints: (p.recruited <= G.meta.upgrades.mentor ? 1 : 0) + (lvl - 1) + (t && t.pe ? t.pe : 0),
      col: tile ? tile.col : -1, row: tile ? tile.row : -1, elements: extra.el ? { [extra.el]: 1 } : {}, skills: { [arch.signatureSkill]: 1 }, items: [],
      trait: extra.trait || null, quality: extra.quality || 0 };
    if (tile) r.board.push(u); else p.bench[slot] = u;
    const rec = G.meta.lifetime.recruited;
    if (!rec.includes(archId)) { rec.push(archId); G.saveMeta(); }
    unready(p.id); G.selectedId = id; sfx('buy');
    G.emitAch({ type: 'hire', quality: u.quality, trait: u.trait });
    return { u, tile };
  }
  G.hire = function (i) {
    const p = G.me();
    if (!G.canEdit()) return toast('Aguarde o fim do combate.', 'error');
    const o = p.offers[i]; if (!o) return;
    const res = addUnit(p, o.arch, o.cost, { level: QT.quality[o.quality].level, trait: o.trait, el: o.el, quality: o.quality });
    if (!res) return;
    p.offers[i] = null;
    const q = QT.quality[o.quality];
    log(`${G.isCoop() ? p.name + ' contratou' : 'Contratou'} ${q.name} ${res.u.name}${o.trait ? ` (${D.TRAITS[o.trait].icon} ${D.TRAITS[o.trait].name})` : ''} ${res.tile ? 'no campo' : 'no banco'} (${o.cost}g).`, 'gold');
    G.save(); changed();
  };
  /* Contrato direto: qualquer arquétipo, sem traço, preço ×1,5 */
  G.buy = function (archId) {
    const p = G.me();
    if (!G.canEdit()) return toast('Aguarde o fim do combate.', 'error');
    const cost = G.contractCost(archId);
    const res = addUnit(p, archId, cost);
    if (!res) return;
    log(`📜 ${G.isCoop() ? p.name + ' firmou' : 'Firmou'} contrato com ${res.u.name} ${res.tile ? 'no campo' : 'no banco'} (${cost}g).`, 'gold');
    G.save(); changed();
  };

  G.setTactic = function (t) {
    if (!G.canEdit() || !D.TACTICS[t]) return;
    G.run.tactic = t; sfx('click');
    log(`${D.TACTICS[t].icon} Tática: ${D.TACTICS[t].name}.`);
    G.save(); changed();
  };

  G.sell = function (id) {
    if (!G.canEdit()) return;
    const r = G.run;
    const u0 = G.find(id); if (!guardOwner(u0)) return;
    const p = G.ownerOf(u0);
    let u = null;
    const bi = r.board.findIndex(x => x.id === id);
    if (bi !== -1) u = r.board.splice(bi, 1)[0];
    else { const si = p.bench.findIndex(x => x && x.id === id); if (si !== -1) { u = p.bench[si]; p.bench[si] = null; } }
    if (!u) return;
    p.bag.push(...u.items); u.items = [];
    const refund = Math.floor(u.cost * C.SELL_RATIO);
    p.gold += refund;
    if (G.selectedId === id) G.selectedId = null;
    log(`Vendeu ${u.name} por +${refund}g (itens voltaram à mochila).`, 'gold');
    unready(p.id); sfx('buy'); G.save(); changed();
  };

  G.setTeamLimit = function (n) {
    if (!G.canEdit()) return;
    const p = G.me(), lim = Math.max(1, Math.min(G.capPerPlayer(), n));
    const mine = G.boardOf(p.id);
    if (mine.length > lim) {
      const excess = mine.length - lim;
      if (p.bench.filter(s => !s).length < excess) return toast(`Banco cheio: libere ${excess} espaço(s) antes de reduzir o limite.`, 'error');
      const sorted = [...mine].sort((a, b) => (b.row * 20 + b.col) - (a.row * 20 + a.col)).slice(0, excess);
      for (const u of sorted) { G.run.board = G.run.board.filter(x => x !== u); u.col = u.row = -1; p.bench[freeBench(p)] = u; }
      toast(`${excess} unidade(s) movida(s) para o banco.`);
    }
    p.teamLimit = lim; unready(p.id); sfx('place'); G.save(); changed();
  };

  G.placeAt = function (id, col, row) {
    if (!G.canEdit()) return false;
    const r = G.run;
    if (row < P0 || row >= C.ROWS || col < 0 || col >= C.COLS) return false;
    if (G.blocked(col, row)) { toast(`${D.TERRAIN[E.terrainAt(r.terrain, col, row)].name}: não é possível posicionar aqui.`, 'error'); return false; }
    const u = G.find(id); if (!guardOwner(u)) return false;
    const p = G.ownerOf(u);
    const occ = r.board.find(x => x.col === col && x.row === row && x.id !== id);
    if (G.onBoard(id)) {
      if (occ) { occ.col = u.col; occ.row = u.row; }
      u.col = col; u.row = row;
    } else {
      const si = p.bench.findIndex(x => x && x.id === id);
      if (occ && (occ.owner || 0) === p.id) {
        r.board = r.board.filter(x => x !== occ); occ.col = occ.row = -1; p.bench[si] = occ;
      } else {
        if (occ) { toast(`Essa casa está ocupada por uma unidade de ${G.ownerOf(occ).name}.`, 'error'); return false; }
        if (G.boardOf(p.id).length >= p.teamLimit) { toast(`Limite atingido (${G.boardOf(p.id).length}/${p.teamLimit}).`, 'error'); return false; }
        p.bench[si] = null;
      }
      u.col = col; u.row = row; r.board.push(u);
    }
    unready(p.id); sfx('place'); G.save(); changed();
    return true;
  };

  G.toBench = function (id, slot = -1) {
    if (!G.canEdit()) return false;
    const r = G.run;
    const u = G.find(id); if (!guardOwner(u)) return false;
    const p = G.ownerOf(u);
    const bi = r.board.findIndex(x => x.id === id);
    if (bi === -1) {
      const si = p.bench.findIndex(x => x && x.id === id);
      if (si === -1 || slot < 0 || slot === si) return false;
      [p.bench[si], p.bench[slot]] = [p.bench[slot], p.bench[si]];
      sfx('place'); G.save(); changed(); return true;
    }
    const target = slot >= 0 ? slot : freeBench(p);
    if (target === -1) { toast('O Banco está cheio.', 'error'); return false; }
    const occ = p.bench[target];
    r.board.splice(bi, 1);
    if (occ) { occ.col = u.col; occ.row = u.row; r.board.push(occ); }
    u.col = u.row = -1; p.bench[target] = u;
    unready(p.id); sfx('place'); G.save(); changed(); return true;
  };

  G.toggle = function (id) {
    if (G.onBoard(id)) return G.toBench(id);
    const t = freeBoardTile();
    if (!t) return false;
    return G.placeAt(id, t.col, t.row);
  };

  /* Posicionamento automático por papel. No co-op organiza só as unidades
     do jogador ativo, usando as casas livres que restarem. */
  G.autoArrange = function () {
    if (!G.canEdit()) return;
    const mine = G.boardOf(G.run.active);
    if (!mine.length) return;
    const rowsByPref = { front: [P0, P0 + 1], flank: [P0, P0 + 1], mid: [P0 + 1, P0 + 2, P0], back: [P0 + 4, P0 + 3, P0 + 5, P0 + 2] };
    const order = ['front', 'flank', 'mid', 'back'];
    const cols = [5, 6, 4, 7, 3, 8, 2, 9, 1, 10, 0, 11];
    const taken = new Set(G.run.board.filter(u => !G.isMine(u)).map(u => u.col + ',' + u.row));
    const units = mine.sort((a, b) => order.indexOf(G.arch(a).pref) - order.indexOf(G.arch(b).pref));
    for (const u of units) {
      const pref = G.arch(u).pref;
      const colOrder = pref === 'flank' ? [1, 10, 2, 9, 0, 11, 3, 8, 4, 7, 5, 6] : cols;
      let placed = false;
      for (const row of [...rowsByPref[pref], P0, P0 + 1, P0 + 2, P0 + 3, P0 + 4, P0 + 5]) {
        for (const col of colOrder) { const k = col + ',' + row; if (!taken.has(k) && !G.blocked(col, row)) { taken.add(k); u.col = col; u.row = row; placed = true; break; } }
        if (placed) break;
      }
    }
    unready(G.run.active); sfx('place'); G.save(); changed();
  };

  G.rename = function (id, name) {
    const u = G.find(id); if (!guardOwner(u)) return;
    const clean = String(name || '').replace(/[<>]/g, '').trim().slice(0, 18);
    if (!clean) return;
    u.name = clean; u.renamed = true;
    log(`✏️ Unidade rebatizada: ${clean}.`);
    if (/^bigorna$/i.test(clean)) G.secret('nome_bigorna');
    G.emitAch({ type: 'rename' });
    G.save(); changed();
  };

  /* ---------------- ITENS (mochila por jogador) ---------------- */
  G.bag = () => G.me().bag;
  G.equip = function (bagIdx, unitId) {
    if (!G.canEdit()) return toast('Equipe itens fora do combate.', 'error');
    const u = G.find(unitId);
    if (!u) return toast('Selecione uma unidade sua para equipar.', 'error');
    if (!guardOwner(u)) return;
    if (u.items.length >= C.MAX_ITEMS) return toast(`${u.name} já tem ${C.MAX_ITEMS} itens. Clique num slot para remover.`, 'error');
    const bag = G.ownerOf(u).bag;
    const it = bag.splice(bagIdx, 1)[0]; if (!it) return;
    u.items.push(it);
    unready(u.owner || 0); sfx('place'); toast(`${D.ITEMS[it.id].name} ★${it.tier} equipado em ${u.name}.`, 'success'); G.save(); changed();
  };
  G.unequip = function (unitId, slot) {
    if (!G.canEdit()) return;
    const u = G.find(unitId); if (!guardOwner(u) || !u.items[slot]) return;
    G.ownerOf(u).bag.push(u.items.splice(slot, 1)[0]);
    unready(u.owner || 0); sfx('place'); G.save(); changed();
  };
  G.fusePartner = (idx) => { const bag = G.bag(); const a = bag[idx]; if (!a || a.tier >= C.MAX_ITEM_TIER) return -1; return bag.findIndex((b, j) => j !== idx && b.id === a.id && b.tier === a.tier); };
  G.fuse = function (idx) {
    if (!G.canEdit()) return;
    const p = G.me();
    const j = G.fusePartner(idx); if (j === -1) return toast('Precisa de 2 itens iguais do mesmo tier.', 'error');
    const a = p.bag[idx];
    p.bag = p.bag.filter((_, k) => k !== idx && k !== j);
    p.bag.push({ id: a.id, tier: a.tier + 1 });
    sfx('levelUp'); log(`⚒️ Fundiu 2× ${D.ITEMS[a.id].name} → ★${a.tier + 1}!`, 'gold'); G.save(); changed();
  };
  /* No co-op é possível doar itens a outro jogador */
  G.giveItem = function (bagIdx, toPid) {
    if (!G.canEdit() || !G.isCoop()) return;
    const from = G.me(), to = G.P(toPid);
    if (!to || to === from) return;
    const it = from.bag.splice(bagIdx, 1)[0]; if (!it) return;
    to.bag.push(it);
    log(`🎁 ${from.name} deu ${D.ITEMS[it.id].name} ★${it.tier} para ${to.name}.`, 'gold');
    G.emitAch({ type: 'gift' });
    sfx('buy'); G.save(); changed();
  };
  G.giveGold = function (toPid, amount) {
    if (!G.canEdit() || !G.isCoop()) return;
    const from = G.me(), to = G.P(toPid);
    const a = Math.min(from.gold, amount);
    if (!to || to === from || a <= 0) return;
    from.gold -= a; to.gold += a;
    log(`🪙 ${from.name} enviou ${a}g para ${to.name}.`, 'gold');
    G.emitAch({ type: 'gift' });
    sfx('buy'); G.save(); changed();
  };

  /* ---------------- PROGRESSÃO ---------------- */
  G.grantXp = function (u, amount) {
    let mult = 1;
    if (G.hasRelic('coroa_lobo') && G.run.board.length <= 3) mult += 0.35;
    if (u.trait && D.TRAITS[u.trait] && D.TRAITS[u.trait].xp) mult += D.TRAITS[u.trait].xp;
    for (const it of u.items) if (D.ITEMS[it.id].stats.xpMult) mult += D.ITEMS[it.id].stats.xpMult * C.ITEM_TIER_MULT[it.tier - 1];
    u.xp += Math.round(amount * mult);
    let gained = 0;
    while (u.xp >= G.xpToNext(u.level)) { u.xp -= G.xpToNext(u.level); u.level++; u.evoPoints++; gained++; }
    if (gained) { log(`⭐ ${u.name} chegou ao Nível ${u.level} (+${gained} PE).`, 'level'); sfx('levelUp'); }
    return gained;
  };
  G.upgradeSkill = function (id, sk) {
    const u = G.find(id); if (!u || u.evoPoints <= 0 || !guardOwner(u)) return;
    const cur = u.skills[sk] || 0; if (cur >= 3) return;
    u.skills[sk] = cur + 1; u.evoPoints--;
    log(`✨ ${u.name}: ${D.SKILLS[sk].name} → Nv.${cur + 1}.`, 'level'); sfx('levelUp'); unready(u.owner || 0); G.save(); changed();
  };
  G.addElement = function (id, el) {
    const u = G.find(id); if (!u || u.evoPoints <= 0 || !guardOwner(u)) return;
    u.elements[el] = (u.elements[el] || 0) + 1; u.evoPoints--;
    log(`💠 ${u.name} absorveu ${D.ELEMENTS[el].name} (×${u.elements[el]}).`, 'level'); sfx('levelUp'); unready(u.owner || 0); G.save(); changed();
  };
  G.totalEvo = (pid) => (pid === undefined ? G.allUnits() : G.unitsOf(pid)).reduce((s, u) => s + u.evoPoints, 0);

  /* ---------------- MAPA ---------------- */
  G.findNode = (id) => { for (const f of G.run.map.floors) for (const n of f) if (n.id === id) return n; return null; };
  G.availableNodes = function () {
    const r = G.run;
    if (!r.nodeId) return r.map.floors[0];
    const cur = G.findNode(r.nodeId);
    return cur ? cur.next.map(G.findNode).filter(Boolean) : [];
  };
  /* Quem decide a próxima escolha no co-op (rodízio) */
  G.leader = () => G.P(G.run.turn % G.coop());
  function nextChooser() { const pid = G.run.turn % G.coop(); G.run.turn++; return pid; }

  G.chooseNode = function (id) {
    const r = G.run;
    if (r.phase !== 'MAP') return;
    const node = G.availableNodes().find(n => n.id === id);
    if (!node) return;
    r.nodeId = id; r.visited.push(id); r.room = node.room; r.act = node.act;
    r.players.forEach(p => { p.ready = false; G.refreshOffers(p.id, true); });
    const nt = D.NODE_TYPES[node.type];
    log(`🗺️ Sala ${r.room}/${C.TOTAL_ROOMS}: ${nt.icon} ${nt.name}${G.isCoop() ? ` (caminho escolhido por ${G.leader().name})` : ''}.`);
    if (!r.roomTypesSeen.includes(node.type)) r.roomTypesSeen.push(node.type);
    if (['combate', 'elite', 'chefe'].includes(node.type)) {
      r.roomType = node.type; r.affix = node.affix; r.attempt = 0;
      r.layout = node.layout || 'planicie';
      r.terrain = withRng(rng => E.generateTerrain(rng, r.layout, r.act));
      relocateBlocked();
      r.doctrine = node.type === 'chefe' ? null : pickDoctrine();
      r.enemies = withRng(rng => E.generateHorde(rng, r.room, r.act, node.type, r.ascension, r.terrain, G.coop(), r.doctrine));
      if (r.flags.galinha) r.enemies.forEach(e => { e.symbol = e.isBoss ? '🐓' : '🐔'; if (!e.isBoss) e.name = 'Galinha ' + e.name.split(' ')[0]; });
      applyScaling(node.type);
      applyIntel();
      r.objective = pickObjective(node.type);
      log(`🗺️ Terreno: ${D.LAYOUTS[r.layout].icon} ${D.LAYOUTS[r.layout].name} — ${D.LAYOUTS[r.layout].desc}`);
      r.phase = 'PREP';
      if (node.type === 'chefe') { sfx('bossGong'); log(`👑 ${D.BOSSES[r.act].name}: ${D.BOSSES[r.act].mechanic}`, 'danger'); }
      G.save(); changed();
      if (G.totalEvo() > 0) FE.Bus.emit('openEvo');
    } else {
      r.affix = 'padrao'; r.enemies = [];
      if (G.hasRelic('bussola_explorador')) { r.players.forEach(p => { p.gold += Math.round(25 * G.goldFactor()); }); log('🧭 Bússola: ouro extra para todos.', 'gold'); }
      const pid = nextChooser();
      const ev = withRng(rng => buildEvent(node.type, rng));
      ev.pid = pid;
      r.pending.push(ev);
      r.afterPending = 'MAP'; r.phase = 'CHOICE';
      G.save(); changed();
    }
  };

  /* ---------------- PRONTOS E COMBATE ---------------- */
  G.allReady = () => G.run.players.every(p => p.ready);
  G.toggleReady = function (pid = G.run.active) {
    const r = G.run;
    if (r.phase !== 'PREP') return;
    if (!G.isCoop()) return G.startCombat();
    const p = G.P(pid);
    p.ready = !p.ready;
    sfx('click');
    if (p.ready) log(`✋ ${p.name} está pronto.`);
    if (G.allReady()) { G.startCombat(); return; }
    // passa a vez automaticamente para o próximo jogador que ainda não está pronto
    if (p.ready) { const nxt = r.players.find(x => !x.ready); if (nxt) r.active = nxt.id; }
    changed();
  };

  G.startCombat = function () {
    const r = G.run;
    if (r.phase !== 'PREP') return;
    if (!r.board.length) return toast('Coloque pelo menos 1 unidade em campo.', 'error');
    for (const p of r.players) if (G.boardOf(p.id).length > p.teamLimit) return toast(`${p.name} tem unidades demais em campo.`, 'error');
    G.save();
    const ctxs = r.players.map(p => G.statsCtx(p.id));
    G.combat = E.createCombat({
      seed: (FE.util.hashStr(r.seed) ^ (r.room * 7919) ^ (r.attempt * 104729)) >>> 0,
      relics: new Set(r.relics), affix: r.affix, fx: G.settings ? G.settings.fx !== false : true, terrain: r.terrain,
      players: r.board.map(u => ({ unit: { ...u }, stats: G.statsOf(u, ctxs[u.owner || 0]) })),
      enemies: r.enemies.map(e => ({ unit: e, stats: G.enemyStats(e) })),
      tactic: r.tactic, antiHeal: r.intel ? r.intel.antiHeal : 0, huntId: r.intel ? r.intel.huntId : null
    });
    G.combat.startBoard = r.board.length; G.combat.startSyn = G.activeSynergies();
    r.phase = 'COMBAT'; r.stats.combats++; G.paused = false;
    r.players.forEach(p => { p.ready = false; });
    log(`⚔️ Combate na Sala ${r.room}/${C.TOTAL_ROOMS}${r.attempt ? ` (tentativa ${r.attempt + 1})` : ''}.`, 'gold');
    changed();
  };

  /* Poder atual do exército em campo e da horda da sala */
  G.playerPower = function () {
    const ctxs = G.run.players.map(p => G.statsCtx(p.id));
    return E.teamPower(G.run.board.map(u => G.statsOf(u, ctxs[u.owner || 0])));
  };
  G.enemyPower = function (enemies, noDef) { return E.teamPower((enemies || G.run.enemies).map(e => G.enemyStats(e, noDef))); };

  /* ---------------- ESCALA DE PODER ADAPTATIVA ----------------
     O poder do jogador é medido ao entrar na sala, usando as MELHORES
     unidades de cada jogador (campo + banco, até o limite), para que não
     dê para "esconder" o exército no banco e enganar a escala. */
  const SC = D.SCALING;
  G.rosterPower = function () {
    const all = [];
    for (const p of G.run.players) {
      const ctx = G.statsCtx(p.id, true);
      all.push(...G.unitsOf(p.id).map(u => E.unitPower(G.statsOf(u, ctx))).sort((a, b) => b - a).slice(0, p.teamLimit));
    }
    const sum = all.reduce((a, b) => a + b, 0);
    return Math.round(sum * sum / 100);
  };
  G.isAdaptive = () => G.run && (G.run.scaling === 'proporcional' || G.run.scaling === 'dinamica');
  G.rewardMult = () => (G.run && G.run.scaling === 'dinamica' ? 1 + SC.rewardPer * Math.max(0, G.run.threat || 0) : 1);
  G.targetRatio = function (type) {
    const r = G.run;
    const t = (SC.targets[type] || SC.targets.combate)[Math.min(3, r.act - 1)];
    return t * (root.__diff || SC.diff) * (1 + SC.ascPer * r.ascension) * G.coopFactor() * (r.scaling === 'dinamica' ? 1 + SC.threatPer * (r.threat || 0) : 1);
  };
  G.coopFactor = () => { const r = G.run, n = r.players.length; return n > 1 ? SC.coopMult[Math.min(3, r.act - 1)] * (n === 2 ? 1.15 : n === 3 ? 1.85 : 1.45) : 1; };
  G.setScaling = function (mode) {
    if (!G.run || !SC.modes[mode]) return;
    G.run.scaling = mode;
    log(`${SC.modes[mode].icon} Escala de poder: ${SC.modes[mode].name} (vale a partir da próxima sala).`, 'gold');
    G.save(); changed();
  };
  function applyScaling(type) {
    const r = G.run, mode = r.scaling || 'classica';
    const pp = G.rosterPower();
    const savedC = r.enemies.map(e => e.cmods); r.enemies.forEach(e => { e.cmods = null; });
    const ep0 = G.enemyPower();
    r.enemies.forEach((e, i) => { e.cmods = savedC[i] || null; });
    const info = { mode, pp, ep0, k: 1, target: null };
    if (mode === 'nivelada') {
      const units = G.allUnits().slice().sort((a, b) => b.level - a.level).slice(0, Math.max(1, r.players.reduce((s, p) => s + p.teamLimit, 0)));
      const avgLvl = units.length ? units.reduce((s, u) => s + u.level, 0) / units.length : 1;
      const avgSt = units.length ? units.reduce((s, u) => s + Object.values(u.elements).reduce((a, b) => a + b, 0), 0) / units.length : 0;
      const els = Object.keys(D.ELEMENTS);
      withRng(rng => {
        for (const e of r.enemies) {
          const want = e.isBoss ? Math.ceil(avgLvl) : e.isElite ? Math.round(avgLvl) : Math.round(avgLvl * 0.85);
          e.level = Math.max(e.level, want);
          for (let i = 0; i < Math.floor(avgSt * 0.3); i++) { const el = rng.pick(els); e.elements[el] = (e.elements[el] || 0) + 1; }
        }
      });
    } else if (mode === 'proporcional' || mode === 'dinamica') {
      const dt = r.doctrine && D.DOCTRINES[r.doctrine] ? D.DOCTRINES[r.doctrine].tune || 1 : 1;
      const coopTune = r.players.length > 1 && r.doctrine && r.doctrine !== 'bando' ? 0.72 * (1 + (dt - 1) * 0.35) * (D.DOCTRINES[r.doctrine].coopTune || 1) : dt;
      const target = G.targetRatio(type) * coopTune;
      const k = Math.max(SC.kMin, Math.min(SC.kMax, Math.sqrt(target * pp / Math.max(1, ep0))));
      for (const e of r.enemies) {
        const b = e.baseStats;
        e.baseStats = { ...b, maxHp: Math.round(b.maxHp * k), ad: Math.round(b.ad * k), ap: Math.round(b.ap * k) };
      }
      info.k = k; info.target = target;
      if (mode === 'dinamica' && (r.threat || 0) >= 6) withRng(rng => {
        const el = r.enemies.find(e => e.isElite && !e.isBoss);
        if (el && el.affixes.length < 3) el.affixes.push(rng.pick(Object.keys(D.ELITE_AFFIXES).filter(a => !el.affixes.includes(a))));
      });
    }
    info.ep = G.enemyPower();
    info.ratio = info.ep / Math.max(1, pp);
    r.scale = info;
  }
  /* ---------------- DOUTRINAS, INTELIGÊNCIA E OBJETIVOS ---------------- */
  function pickDoctrine() {
    const r = G.run;
    if (r.room <= 1 || root.__noDoc) return 'bando';
    const ok = Object.values(D.DOCTRINES).filter(d => d.id !== 'bando' && d.minRoom <= r.room && d.id !== r.lastDoctrine);
    const id = withRng(rng => rng.chance(0.12) ? 'bando' : rng.pick(ok).id);
    r.lastDoctrine = id;
    return id;
  }
  /* Perfil do exército: o que a horda "enxerga" ao preparar contramedidas */
  G.armyProfile = function () {
    const r = G.run;
    const units = [];
    for (const p of r.players) {
      const ctx = G.statsCtx(p.id, true);
      units.push(...G.unitsOf(p.id).map(u => ({ u, s: G.statsOf(u, ctx) })).map(x => ({ ...x, pw: E.unitPower(x.s) })).sort((a, b) => b.pw - a.pw).slice(0, p.teamLimit));
    }
    if (!units.length) return null;
    let phys = 0, mag = 0, ranged = 0, healers = 0, armor = 0, pw = 0;
    for (const { u, s, pw: w } of units) {
      const a = s.ad * s.attackSpeed, m = s.ap * 0.9;
      phys += a / (a + m) * w; mag += m / (a + m) * w; pw += w;
      if (s.range >= 3) ranged++;
      if (['clerigo', 'druida', 'bardo'].includes(u.archetypeId) || (u.archetypeId === 'paladino' && u.skills.pa_consagrar)) healers++;
      armor += s.armor;
    }
    const top = units[0];
    return { n: units.length, phys: phys / pw, mag: mag / pw, ranged: ranged / units.length, healers, armor: armor / units.length,
      carry: units.length >= 3 ? top.pw / pw : 0, carryId: top.u.id, carryName: top.u.name };
  };
  function applyIntel() {
    const r = G.run;
    r.intel = null;
    if (root.__noIntel) return;
    const coop = r.players.length > 1;
    const nCounters = r.act <= 1 ? 0 : coop ? 1 : r.act === 2 ? 1 : r.act === 3 ? 1 + (r.ascension >= 2 ? 1 : 0) : 2;
    const prof = G.armyProfile();
    if (!nCounters || !prof) return;
    const cand = [];
    if (prof.phys >= 0.62) cand.push({ id: 'placas', score: (prof.phys - 0.62) * 3 + 0.3, v: prof.phys });
    if (prof.mag >= 0.55) cand.push({ id: 'runas', score: (prof.mag - 0.55) * 3 + 0.3, v: prof.mag });
    if (prof.carry >= 0.38) cand.push({ id: 'cacada', score: (prof.carry - 0.38) * 4 + 0.35, v: prof.carry, n: prof.carryName });
    if (prof.ranged >= 0.5 && prof.n >= 3) cand.push({ id: 'batedores', score: (prof.ranged - 0.5) * 2 + 0.25, v: prof.ranged });
    if (prof.healers >= 2) cand.push({ id: 'veneno', score: 0.2 + prof.healers * 0.12, v: prof.healers });
    if (prof.n >= 8 && !coop) cand.push({ id: 'barragem', score: 0.2 + (prof.n - 8) * 0.06, v: prof.n });
    if (prof.armor >= 85) cand.push({ id: 'acido', score: 0.2 + (prof.armor - 85) / 100, v: prof.armor });
    const chosen = cand.sort((a, b) => b.score - a.score).slice(0, nCounters);
    if (!chosen.length) return;
    const intel = { counters: [], antiHeal: 0, huntId: null, huntName: null };
    for (const ch of chosen) {
      const def = D.COUNTERS[ch.id];
      intel.counters.push({ id: ch.id, why: def.why(ch.v, ch.n) });
      if (def.antiHeal) intel.antiHeal = def.antiHeal;
      if (ch.id === 'cacada') { intel.huntId = prof.carryId; intel.huntName = prof.carryName; }
      const m = def.mods;
      for (const e of r.enemies) {
        if (!Object.keys(m).length) break;
        e.cmods = e.cmods ? mergeMods(e.cmods, m) : { ...m };
      }
      if (def.ambush) withRng(rng => {
        const cands = rng.shuffle(r.enemies.filter(e => !e.isBoss && !e.isElite && !e.ambush && e.archetypeId !== 'sombra'));
        cands.slice(0, Math.round(r.enemies.length * def.ambush * (coop ? 0.5 : 1))).forEach(e => { e.ambush = true; });
      });
    }
    r.intel = intel;
    log(`🧠 Inteligência inimiga: ${intel.counters.map(c => `${D.COUNTERS[c.id].icon} ${D.COUNTERS[c.id].name}`).join(' + ')}.`, 'danger');
  }
  function mergeMods(a, b) {
    const o = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (k.endsWith('Mult')) o[k] = (o[k] || 1) * v;
      else if (k === 'chain') o[k] = Math.max(o[k] || 0, v);
      else o[k] = (o[k] || 0) + v;
    }
    return o;
  }
  G.activeSynergies = function () {
    const ec = G.synergyCounts(), oc = G.orderCounts();
    return Object.keys(D.ELEMENTS).filter(k => E.synergyTier(ec[k] || 0) > 0).length + Object.values(D.ORDERS).filter(o => E.orderTier(oc[o.id] || 0, o) > 0).length;
  };
  function pickObjective(type) {
    const r = G.run;
    const lim = r.players.reduce((s, p) => s + p.teamLimit, 0);
    const list = [
      { id: 'blitz', p: type === 'chefe' ? 32 : type === 'elite' ? 20 : 15 },
      { id: 'intacto' },
      { id: 'vitalidade', p: type === 'chefe' ? 35 : 55 },
      { id: 'prisma', p: Math.min(5, 2 + Math.floor(r.act / 2)) }
    ];
    if (lim >= 3) list.push({ id: 'enxuto', p: Math.max(1, lim - 2) });
    if (type !== 'combate') list.push({ id: 'carrasco', p: type === 'chefe' ? 30 : 12 });
    const o = withRng(rng => rng.pick(list));
    const def = D.OBJECTIVES[o.id];
    const gold = Math.round((14 + r.room * 2.2) * (type === 'combate' ? 1 : 1.5) * G.goldFactor());
    o.reward = def.reward === 'gold' ? { kind: 'gold', amount: gold, text: `+${gold}g${G.isCoop() ? ' cada' : ''}` }
      : def.reward === 'xp' ? { kind: 'xp', amount: 0.5, text: '+50% de XP para o time' }
      : { kind: 'item', tier: r.act >= 3 ? 2 : 1, text: `item ★${r.act >= 3 ? 2 : 1}${G.isCoop() ? ' para cada jogador' : ''}` };
    return o;
  }
  G.objectiveText = (o) => o ? D.OBJECTIVES[o.id].text(o.p) : '';
  function evalObjective(o, c, report, won) {
    if (!o || !won) return false;
    const res = c.result;
    switch (o.id) {
      case 'blitz': return res.time <= o.p;
      case 'intacto': return report.every(x => x.survived);
      case 'enxuto': return (c.startBoard || 99) <= o.p;
      case 'prisma': return (c.startSyn || 0) >= o.p;
      case 'vitalidade': {
        const pl = c.units.filter(u => u.team === 'player' && !u.isSummon);
        return pl.reduce((s, u) => s + Math.max(0, u.hp), 0) / Math.max(1, pl.reduce((s, u) => s + u.stats.maxHp, 0)) * 100 >= o.p;
      }
      case 'carrasco': return res.leaderAt !== null && res.leaderAt !== undefined && res.leaderAt <= o.p;
    }
    return false;
  }

  /* Ameaça (modo Dinâmica): sobe com vitórias dominantes, cai com derrotas */
  function updateThreat(won, report, time) {
    const r = G.run;
    if (r.scaling !== 'dinamica') return null;
    const lost = report.filter(x => !x.survived).length / Math.max(1, report.length);
    let d = 0, why = '';
    if (!won) { d = -2; why = 'derrota'; }
    else if (lost === 0 && time < 14) { d = 2; why = 'vitória dominante'; }
    else if (lost <= 0.25) { d = 1; why = 'vitória confortável'; }
    else if (lost >= 0.6) { d = -1; why = 'vitória por pouco'; }
    else why = 'vitória equilibrada';
    const before = r.threat || 0;
    r.threat = Math.max(SC.threatMin, Math.min(SC.threatMax, before + d));
    return { before, after: r.threat, why };
  }

  G.togglePause = function () {
    if (!G.run || G.run.phase !== 'COMBAT') return;
    G.paused = !G.paused; changed();
  };

  G.tick = function (dt) {
    const c = G.combat;
    if (!c) return;
    if (G.paused && G.run.phase === 'COMBAT') return;
    if (G.run.phase === 'COMBAT' && !c.over) {
      let rem = dt;
      while (rem > 0 && !c.over) { const step = Math.min(0.025, rem); E.updateCombat(c, step); rem -= step; }
      if (c.over && !c.handled) { c.handled = true; c.overAt = Date.now(); finishCombat(c); }
    }
    E.updateFx(c, dt);
  };

  G.emitAch = (ev) => { if (FE.Achievements) FE.Achievements.check(ev); };
  const rollItem = (tier) => withRng(rng => ({ id: rng.pick(Object.keys(D.ITEMS)), tier }));

  /* Base de ouro de uma vitória (antes do fator co-op e da Ameaça) */
  function goldBase(type, room) {
    let base = 42 + room * 9 + (type === 'elite' ? 30 : 0) + (type === 'chefe' ? 60 : 0);
    if (G.hasRelic('cofre_mercador')) base += 15;
    if (type === 'chefe' && G.meta.upgrades.relicStart > 1) base += G.meta.upgrades.relicStart * 10;
    return base;
  }
  /* Prévia de recompensas de uma sala de combate (usada no mapa e na preparação) */
  G.previewRewards = function (type = G.run.roomType, room = G.run.room) {
    const r = G.run, rm = G.rewardMult(), me = G.me();
    const savedType = r.roomType, savedRoom = r.room;
    r.roomType = type; r.room = room;
    const pool = Math.round(G.playerXpPool() * rm);
    r.roomType = savedType; r.room = savedRoom;
    const n = Math.max(1, G.boardOf(me.id).length);
    return {
      gold: Math.round(goldBase(type, room) * G.goldFactor() * rm),
      interest: Math.min(C.INTEREST_CAP, Math.floor(me.gold * C.INTEREST_RATE)),
      xpEach: Math.floor(pool / n), pool, killXp: 16 + room * 3, mult: rm,
      item: type === 'combate' ? { chance: ((G.run.normalWins || 0) + 1) % C.ITEM_EVERY === 0 ? 1 : 0, tier: 1, left: C.ITEM_EVERY - ((G.run.normalWins || 0) % C.ITEM_EVERY) } : type === 'elite' ? { chance: 1, tier: 1 } : { chance: 1, tier: 2, each: true },
      relic: type === 'elite' ? 'elite' : type === 'chefe' ? 'boss' : null,
      act: type === 'chefe' && room < C.TOTAL_ROOMS,
      defeat: { citadel: Math.max(10, Math.round((r.enemies.length || 4) * 6 / Math.sqrt(G.coop())) + r.act * 4), xpEach: Math.floor(pool * 0.45 / n) }
    };
  };

  function finishCombat(c) {
    const r = G.run;
    const res = c.result;
    const report = E.combatReport(c).map(x => { const u = G.find(x.rosterId); return { ...x, owner: u ? (u.owner || 0) : 0 }; });
    G.emitAch({ type: 'combat', won: res.won, time: res.time, report, roomType: r.roomType, room: r.room, act: r.act, layout: r.layout,
      boardSize: r.board.length, losses: report.filter(x => !x.survived).length, maxSummons: c.maxPlayerSummons, coop: G.coop() });
    if (!res.won) r.noLoss = false;
    // Instantâneo de XP/nível antes das recompensas (para as barras animadas)
    const snap = new Map(r.board.map(u => [u.id, { level: u.level, xp: u.xp }]));
    const levelUps = [];
    const killXp = 16 + r.room * 3;
    const lines = [];
    const gf = G.goldFactor();
    const rm = G.rewardMult();
    const rewards = { won: res.won, mult: rm, gold: [], xp: [], killXp, items: [], relic: null, extras: [], citadel: null, units: [], threat: null };

    for (const rep of report) {
      const u = G.find(rep.rosterId);
      if (u && rep.kills) { const g = G.grantXp(u, rep.kills * killXp); if (g) levelUps.push(`${u.name} → Nv.${u.level}`); }
      const p = G.P(rep.owner); p.kills += rep.kills; p.dmg += rep.dmgDealt; p.heal += rep.healDone;
    }
    r.stats.kills += report.reduce((s, x) => s + x.kills, 0);
    const objDone = evalObjective(r.objective, c, report, res.won);
    let pool = Math.round(G.playerXpPool() * rm);
    if (objDone && r.objective.reward.kind === 'xp') pool = Math.round(pool * (1 + r.objective.reward.amount));
    if (r.objective) rewards.objective = { id: r.objective.id, text: G.objectiveText(r.objective), done: objDone, reward: r.objective.reward.text, won: res.won };
    if (objDone) { r.stats.objectives = (r.stats.objectives || 0) + 1; G.emitAch({ type: 'objective', total: r.stats.objectives }); }
    const th = updateThreat(res.won, report, res.time);
    rewards.threat = th;
    const splitXp = (mult) => {
      for (const p of r.players) {
        const mine = G.boardOf(p.id);
        if (!mine.length) { rewards.xp.push({ pid: p.id, each: 0, n: 0 }); continue; }
        const each = Math.floor(pool * mult / mine.length);
        for (const u of mine) { const g = G.grantXp(u, each); if (g) levelUps.push(`${u.name} → Nv.${u.level}`); }
        rewards.xp.push({ pid: p.id, each, n: mine.length });
      }
    };
    const finishUnits = () => {
      rewards.units = r.board.map(u => {
        const b = snap.get(u.id) || { level: u.level, xp: 0 };
        return { id: u.id, archetypeId: u.archetypeId, quality: u.quality || 0, name: u.name, symbol: G.arch(u).symbol, color: G.arch(u).color, owner: u.owner || 0,
          lvlBefore: b.level, xpBefore: b.xp, nextBefore: G.xpToNext(b.level), lvlAfter: u.level, xpAfter: u.xp, nextAfter: G.xpToNext(u.level), pe: u.evoPoints };
      });
    };

    if (res.won) {
      sfx('victory');
      r.stats.wins++;
      const gold = Math.round(goldBase(r.roomType, r.room) * gf * rm);
      for (const p of r.players) {
        const interest = Math.min(C.INTEREST_CAP, Math.floor(p.gold * C.INTEREST_RATE));
        const trans = G.boardOf(p.id).reduce((s, u) => s + (u.skills.al_transmutar || 0) * 8, 0);
        p.gold += gold + interest + trans; r.stats.goldEarned += gold + interest + trans;
        rewards.gold.push({ pid: p.id, base: gold, interest, trans, total: gold + interest + trans, now: p.gold });
        lines.push(`🪙 ${G.isCoop() ? p.name + ': ' : ''}+${gold}g, +${interest}g de juros${trans ? `, +${trans}g Transmutação` : ''}`);
      }
      splitXp(1);
      if (objDone && r.objective.reward.kind === 'gold') for (const p of r.players) { p.gold += r.objective.reward.amount; r.stats.goldEarned += r.objective.reward.amount; }
      log(`🏆 Sala ${r.room} vencida! +${gold}g${G.isCoop() ? ' por jogador' : ''}.`, 'win');

      const pend = [];
      const giveItem = (pid, it, label) => { G.P(pid).bag.push(it); rewards.items.push({ pid, item: it, label }); lines.push(`🎁 ${label}: ${D.ITEMS[it.id].name}`); };
      if (r.roomType === 'combate') {
        r.normalWins = (r.normalWins || 0) + 1;
        if (r.normalWins % C.ITEM_EVERY === 0) giveItem(nextChooser(), rollItem(1), 'Item de patrulha');
        else rewards.extras.push({ icon: '🎁', text: `Próximo item em ${C.ITEM_EVERY - r.normalWins % C.ITEM_EVERY} combate(s) comum(ns).`, dim: true });
      }
      if (objDone && r.objective.reward.kind === 'item') for (const p of r.players) giveItem(p.id, rollItem(r.objective.reward.tier), 'Objetivo bônus');
      if (objDone) log(`🎖️ Objetivo cumprido: ${G.objectiveText(r.objective)} (${r.objective.reward.text}).`, 'win');
      if (r.roomType === 'elite') { r.stats.elites++; giveItem(nextChooser(), rollItem(1), 'Item de Elite'); pend.push(makeRelicChoice('elite')); rewards.relic = 'elite'; }
      if (G.hasRelic('ovo_dourado')) {
        r.flags.eggWins++;
        if (r.flags.eggWins >= 3) {
          r.relics = r.relics.filter(x => x !== 'ovo_dourado'); r.relics.push('pintinho_dourado');
          rewards.extras.push({ icon: '🐣', text: 'O Ovo Dourado chocou! Um Pintinho Dourado agora acompanha o grupo.' });
          G.secret('chocadeira');
        } else rewards.extras.push({ icon: '🥚', text: `O Ovo Dourado se mexe... (${r.flags.eggWins}/3)` });
      }
      if (r.roomType === 'chefe') {
        r.stats.bosses++;
        for (const p of r.players) giveItem(p.id, rollItem(2), 'Espólio do Chefe');
        rewards.relic = 'boss';
        if (G.hasRelic('lanterna_ancestral')) { r.board.forEach(u => u.evoPoints++); rewards.extras.push({ icon: '🏮', text: 'Lanterna Ancestral: +1 PE para todo o campo.' }); }
        finishUnits();
        if (r.room >= C.TOTAL_ROOMS) {
          r.pending.unshift({ kind: 'report', won: true, final: true, title: '👑 A Forja foi salva!', lines, levelUps, report, time: res.time, rewards });
          r.afterPending = 'END'; r.phase = 'CHOICE'; changed();
          return;
        }
        pend.push(makeRelicChoice('boss'));
        r.act++; r.nodeId = null; if (r.scaling === 'dinamica') r.threat = Math.max(SC.threatMin, (r.threat || 0) - 1);
        r.map = withRng(rng => E.generateActMap(rng, r.act, r.ascension));
        r.citadelHp = Math.min(r.citadelMax, r.citadelHp + 25);
        rewards.citadel = { delta: 25, hp: r.citadelHp, max: r.citadelMax };
        rewards.extras.push({ icon: D.ACTS[r.act].storyIcon, text: `Novo Ato desbloqueado: ${D.ACTS[r.act].short} — ${D.ACTS[r.act].name}.` });
        log(`🌄 ${D.ACTS[r.act].short} — ${D.ACTS[r.act].name}!`, 'gold');
        pend.push(storyAct(r.act));
      }
      finishUnits();
      r.pending.unshift({ kind: 'report', won: true, title: r.roomType === 'chefe' ? '👑 Chefe Derrotado!' : r.roomType === 'elite' ? '💀 Elite Derrotada!' : '🏆 Vitória!', lines, levelUps, report, time: res.time, rewards });
      r.pending.push(...pend);
      r.afterPending = 'MAP';
      r.enemies = [];
    } else {
      sfx('defeat');
      r.stats.losses++;
      const dmg = Math.max(10, Math.round(res.survivors * 6 / Math.sqrt(G.coop())) + r.act * 4);
      r.citadelHp = Math.max(0, r.citadelHp - dmg);
      splitXp(0.45);
      rewards.citadel = { delta: -dmg, hp: r.citadelHp, max: r.citadelMax };
      lines.push(`🏰 A Cidadela sofreu -${dmg} (${r.citadelHp}/${r.citadelMax})`);
      log(`💥 Derrota na Sala ${r.room}: Cidadela -${dmg}.`, 'danger');
      if (r.citadelHp <= 0) return endRun(false, report);
      r.attempt++;
      finishUnits();
      // Na escala adaptativa a horda é reavaliada para a nova tentativa
      if (G.isAdaptive()) { reScaleForRetry(); rewards.extras.push({ icon: '⚖️', text: `A horda foi reajustada à Ameaça atual (${r.threat >= 0 ? '+' : ''}${r.threat}).` }); }
      r.pending.unshift({ kind: 'report', won: false, title: '💥 Derrota', lines, levelUps, report, time: res.time, rewards });
      r.afterPending = 'PREP';
    }
    r.phase = 'CHOICE';
    G.save(); changed();
  }
  function reScaleForRetry() {
    const r = G.run;
    if (!r.scale || !r.scale.k) return;
    const back = 1 / r.scale.k;
    for (const e of r.enemies) { const b = e.baseStats; e.baseStats = { ...b, maxHp: Math.round(b.maxHp * back), ad: Math.round(b.ad * back), ap: Math.round(b.ap * back) }; }
    applyScaling(r.roomType);
  }

  function endRun(victory, report) {
    const r = G.run;
    const shards = Math.max(10, r.room * 4 + r.stats.elites * 10 + r.stats.bosses * 22 + (victory ? 70 : 0) + r.ascension * 15);
    const m = G.meta;
    m.astralShards += shards;
    m.records.bestRoom = Math.max(m.records.bestRoom, r.room);
    m.records.kills += r.stats.kills;
    let unlocked = false;
    if (victory) {
      m.records.wins++;
      if (G.isCoop()) m.records.coopWins++;
      m.records.bestWinAscension = Math.max(m.records.bestWinAscension, r.ascension);
      if (!r.daily && r.ascension >= m.maxAscension && m.maxAscension < D.ASCENSIONS.length - 1) { m.maxAscension++; unlocked = true; }
    }
    if (r.daily) {
      const prev = m.daily[r.daily] || { room: 0, win: false, tries: 0 };
      m.daily[r.daily] = { room: Math.max(prev.room, r.room), win: prev.win || victory, tries: prev.tries + 1 };
    }
    G.saveMeta();
    r.phase = 'END';
    G.emitAch({ type: 'end', victory, coop: G.coop() });
    r.ended = { victory, shards, unlocked, report };
    FE.Storage.del(C.SAVE_KEY_RUN);
    log(victory ? '👑 EXPEDIÇÃO CONCLUÍDA!' : '💀 A Cidadela caiu.', victory ? 'win' : 'danger');
    changed();
  }

  /* ---------------- HISTÓRIA ---------------- */
  function storyAct(act) {
    const a = D.ACTS[act];
    return { kind: 'story', icon: a.storyIcon, title: `${a.short} — ${a.name}`, paragraphs: a.story, button: act === 1 ? 'Partir em expedição' : 'Seguir adiante' };
  }
  function storyTutorial() {
    return { kind: 'story', icon: '🧭', title: 'Primeiros passos', tutorial: true, button: 'Entendi!', paragraphs: [
      '<b>1. Recrute.</b> Na área Recrutar (parte de baixo da tela) todas as classes estão sempre disponíveis, com preço fixo. Juntar unidades da mesma Classe/Origem ativa sinergias.',
      '<b>2. Posicione.</b> Arraste as unidades no seu lado do campo (linhas de baixo). Tanques na frente, atiradores e magos atrás — ou use 🧭 Auto-posicionar.',
      '<b>3. Escolha o caminho.</b> No 🗺️ Mapa, cada nó é uma sala: combates dão XP e ouro; Forja, Mercador e Santuário dão recursos.',
      '<b>4. Evolua.</b> O XP da sala é <b>dividido</b> entre quem está em campo. Cada nível dá 1 PE: aprimore habilidades ou absorva elementos (botão ⭐ Evoluir).',
      '<b>5. Leia o inimigo.</b> Acima do tabuleiro aparecem a <b>doutrina</b> da horda, a <b>inteligência inimiga</b> (contramedidas contra o seu estilo, a partir do Ato II) e um <b>objetivo bônus</b>. Responda com composição, posição e <b>Tática</b>.',
      '<b>6. Sobreviva.</b> Derrotas custam Vida da Cidadela. Chegue ao fim dos 4 Atos!'
    ] };
  }

  /* ---------------- ESCOLHAS PENDENTES ---------------- */
  function relicPool(source) {
    const owned = new Set(G.run.relics);
    const pool = Object.values(D.RELICS).filter(x => !owned.has(x.id) && !x.secret);
    const w = source === 'boss' ? { comum: 20, rara: 55, lendaria: 25 } : source === 'start' ? { comum: 70, rara: 30, lendaria: 0 } : { comum: 58, rara: 34, lendaria: 8 };
    return withRng(rng => {
      const picks = [];
      for (let i = 0; i < 3 && pool.length; i++) {
        const avail = Object.keys(w).filter(k => w[k] > 0 && pool.some(p => p.rarity === k));
        if (!avail.length) break;
        const rar = rng.weighted(avail.map(k => [k, w[k]]));
        const pick = rng.pick(pool.filter(p => p.rarity === rar));
        picks.push(pick); pool.splice(pool.indexOf(pick), 1);
      }
      return picks;
    });
  }
  function makeRelicChoice(source) {
    const picks = relicPool(source);
    return {
      kind: 'choice', pid: nextChooser(), title: source === 'boss' ? '👑 Tesouro do Chefe — Escolha 1 Relíquia' : source === 'start' ? '🏺 Herança Arcana — Relíquia Inicial' : '💀 Tesouro de Elite — Escolha 1 Relíquia',
      subtitle: `Relíquias valem para ${G.isCoop() ? 'todo o grupo' : 'a expedição inteira'}.`,
      options: picks.map(p => ({ icon: p.icon, title: p.name, desc: p.desc, tag: D.RARITY[p.rarity].name, rarity: p.rarity, effects: { relic: p.id } })),
      allowSkip: true
    };
  }

  function topUnit(pid) {
    const list = pid === undefined ? G.allUnits() : G.unitsOf(pid);
    const pick = (l) => l.slice().sort((a, b) => b.level - a.level || b.xp - a.xp)[0] || null;
    return pick(list) || pick(G.allUnits());
  }
  function itemsOf(pid) { const p = G.P(pid); return [...p.bag, ...G.unitsOf(pid).flatMap(u => u.items)]; }

  function buildEvent(type, rng) {
    const r = G.run, a = r.act, gf = G.goldFactor();
    const g = (v) => Math.round(v * gf);
    const itemKeys = Object.keys(D.ITEMS);
    if (type === 'forja') {
      const opts = rng.shuffle(itemKeys).slice(0, 3).map(id => {
        const tier = a >= 3 && rng.chance(0.4) ? 2 : 1;
        return { icon: D.ITEMS[id].icon, title: `${D.ITEMS[id].name} ★${tier}`, desc: D.ITEMS[id].descFor(tier), tag: 'Forjar', effects: { item: { id, tier } } };
      });
      opts.push({ icon: '🔨', title: 'Aprimorar Equipamento', desc: 'Eleva em +1 tier o seu item de menor tier (equipado ou na mochila).', tag: 'Aprimorar', effects: { upgradeItem: true } });
      return { kind: 'choice', title: '⚒️ Forja Rúnica', subtitle: 'O ferreiro ancestral oferece seu trabalho.', options: opts };
    }
    if (type === 'santuario') {
      const el = D.ELEMENTS[rng.pick(Object.keys(D.ELEMENTS))];
      return { kind: 'choice', title: '🔮 Santuário Elemental', subtitle: 'Os espíritos oferecem poder em troca de devoção.', options: [
        { icon: el.icon, title: `Infusão de ${el.name}`, desc: `Todas as unidades em campo recebem +1 stack de ${el.name}.`, tag: 'Sinergia em massa', effects: { elementAll: el.id } },
        { icon: '⭐', title: 'Despertar do Líder', desc: 'Sua unidade de maior nível ganha +2 Pontos de Evolução.', tag: '+2 PE', effects: { evoTop: 2 } },
        { icon: '🩸', title: 'Pacto de Sangue', desc: `Sacrifique 15 de Cidadela: +${g(80 + a * 15)}g para ${G.isCoop() ? 'cada jogador' : 'você'}.`, tag: 'Risco', effects: { citadel: -15, gold: 80 + a * 15 } }
      ] };
    }
    if (type === 'acampamento') {
      return { kind: 'choice', title: '🏕️ Acampamento', subtitle: 'Um momento de descanso antes da próxima batalha.', options: [
        { icon: '❤️', title: 'Reparar Muralhas', desc: `Restaura +${20 + a * 5} de Cidadela.`, tag: 'Recuperação', effects: { citadel: 20 + a * 5 } },
        { icon: '⚔️', title: 'Treinamento Intensivo', desc: `+${160 + a * 60} XP divididos entre as unidades em campo${G.isCoop() ? ' de cada jogador' : ''}.`, tag: 'XP', effects: { xpSplit: 160 + a * 60 } },
        { icon: '🪙', title: 'Saquear Suprimentos', desc: `+${g(55 + a * 15)}g para ${G.isCoop() ? 'cada jogador' : 'você'}.`, tag: 'Ouro', effects: { gold: 55 + a * 15 } }
      ] };
    }
    if (type === 'mercador') {
      const disc = 1 - 0.05 * G.meta.upgrades.contatos;
      const price = (p) => Math.round(p * disc);
      const offers = rng.shuffle(itemKeys).slice(0, 2 + G.coop()).map(id => {
        const tier = rng.chance(a * 0.13) ? 2 : 1;
        return { icon: D.ITEMS[id].icon, title: `${D.ITEMS[id].name} ★${tier}`, desc: D.ITEMS[id].descFor(tier), price: price(tier === 2 ? 130 : 70), effects: { item: { id, tier } } };
      });
      const rp = Object.values(D.RELICS).filter(x => !r.relics.includes(x.id) && !x.secret);
      if (rp.length) { const rel = rng.pick(rp); offers.push({ icon: rel.icon, title: rel.name, desc: rel.desc, tag: D.RARITY[rel.rarity].name, rarity: rel.rarity, price: price({ comum: 120, rara: 170, lendaria: 240 }[rel.rarity]), effects: { relic: rel.id } }); }
      offers.push({ icon: '🧱', title: 'Pedreiros', desc: 'Repara +20 de Cidadela.', price: price(45), effects: { citadel: 20 } });
      offers.push({ icon: '📜', title: 'Pergaminho de Evolução', desc: '+1 PE para a sua unidade de maior nível.', price: price(90), effects: { evoTop: 1 } });
      return { kind: 'shop', title: '🛒 Mercador Errante', subtitle: G.isCoop() ? 'Cada jogador compra com o próprio ouro (troque o comprador acima).' : 'Compre quantas ofertas quiser e depois siga viagem.', offers };
    }
    // Mistério — eventos raros secretos primeiro
    if (!G.hasRelic('pato_borracha') && rng.chance(0.07)) return { kind: 'choice', secret: true, title: '❓ Lago Silencioso', subtitle: 'No meio de um lago perfeitamente calmo, algo amarelo flutua e encara você.', options: [
      { icon: '🦆', title: 'Conversar com o pato', desc: 'Você explica todos os seus problemas a ele. Ele não responde. Você se sente estranhamente melhor.', tag: '???', effects: { relic: 'pato_borracha', secret: 'pato' } },
      { icon: '🚶', title: 'Ignorar o pato', desc: 'Patos de borracha não são confiáveis.', tag: 'Ignorar', effects: {} } ] };
    if (!G.hasRelic('ovo_dourado') && !G.hasRelic('pintinho_dourado') && rng.chance(0.07)) return { kind: 'choice', secret: true, title: '❓ Ninho Abandonado', subtitle: 'Entre galhos queimados, um ovo dourado ainda está morno.', options: [
      { icon: '🥚', title: 'Levar o ovo', desc: 'Talvez algo nasça dele se você continuar vencendo...', tag: '???', effects: { relic: 'ovo_dourado' } },
      { icon: '🍳', title: 'Fazer um omelete', desc: '+25 de Cidadela. Seus soldados agradecem.', tag: 'Recuperação', effects: { citadel: 25 } } ] };
    const events = [
      () => ({ title: '❓ Altar Quebrado', subtitle: 'Uma relíquia brilha entre pedras rachadas. Um tributo parece necessário.', options: [
        { icon: '🏺', title: 'Pagar o tributo (60g)', desc: 'Receba uma relíquia comum aleatória.', cost: 60, tag: 'Relíquia', effects: { gold: -60, randomRelic: 'comum' } },
        { icon: '🚶', title: 'Seguir viagem', desc: 'Nada acontece.', tag: 'Ignorar', effects: {} } ] }),
      () => { const arch = rng.pick(Object.keys(D.ARCHETYPES)); return { title: '❓ Mercenário Ferido', subtitle: `Um ${D.ARCHETYPES[arch].name} ferido pede abrigo.`, options: [
        { icon: D.ARCHETYPES[arch].symbol, title: 'Acolher no grupo', desc: `Recebe um ${D.ARCHETYPES[arch].name} Nível ${1 + a} gratuitamente (vai ao banco).`, tag: 'Unidade grátis', effects: { recruit: { arch, level: 1 + a } } },
        { icon: '🪙', title: 'Pedir pagamento', desc: `Ele paga ${g(30 + a * 10)}g ${G.isCoop() ? 'a cada jogador' : ''}.`, tag: 'Ouro', effects: { gold: 30 + a * 10 } } ] }; },
      () => { const els = rng.shuffle(Object.keys(D.ELEMENTS)).slice(0, 2); return { title: '❓ Fonte Elemental', subtitle: 'Duas correntes de energia se cruzam numa fonte antiga.', options: els.map(el => (
        { icon: D.ELEMENTS[el].icon, title: `Banhar-se em ${D.ELEMENTS[el].name}`, desc: `Sua unidade de maior nível recebe +2 stacks de ${D.ELEMENTS[el].name}.`, tag: 'Elemento', effects: { elementTop: el, elementTopN: 2 } })) }; },
      () => { const id = rng.pick(itemKeys); return { title: '❓ Baú Amaldiçoado', subtitle: 'Um baú pulsa com energia sombria.', options: [
        { icon: D.ITEMS[id].icon, title: 'Abrir (−12 Cidadela)', desc: `Receba ${D.ITEMS[id].name} ★2.`, tag: 'Risco', effects: { citadel: -12, item: { id, tier: 2 } } },
        { icon: '🚶', title: 'Deixar fechado', desc: 'Prudência.', tag: 'Ignorar', effects: {} } ] }; },
      () => ({ title: '❓ Biblioteca Esquecida', subtitle: 'Tomos antigos sobre táticas elementais.', options: [
        { icon: '📖', title: 'Estudar a fundo', desc: 'Sua unidade de maior nível ganha +1 PE.', tag: '+1 PE', effects: { evoTop: 1 } },
        { icon: '📚', title: 'Leitura em grupo', desc: `+${120 + a * 50} XP divididos entre o campo.`, tag: 'XP', effects: { xpSplit: 120 + a * 50 } } ] }),
      () => ({ title: '❓ Ferreiro Itinerante', subtitle: 'Um ferreiro anão oferece seus serviços.', options: [
        { icon: '🔨', title: 'Aprimorar (50g)', desc: 'Eleva +1 tier o seu item de menor tier.', cost: 50, tag: 'Aprimorar', effects: { gold: -50, upgradeItem: true } },
        { icon: '🎁', title: 'Comprar sucata (25g)', desc: 'Receba 1 item ★1 aleatório.', cost: 25, tag: 'Item', effects: { gold: -25, randomItem: 1 } },
        { icon: '🚶', title: 'Recusar', desc: 'Seguir viagem.', tag: 'Ignorar', effects: {} } ] }),
      () => ({ title: '❓ Taverna à Beira da Estrada', subtitle: 'Bardos cantam sobre a Forja. Um velho aposta que ninguém vence seu jogo de dados.', options: [
        { icon: '🎲', title: 'Apostar 40g', desc: 'Se vencer, recebe 100g. O velho parece confiante demais...', cost: 40, tag: 'Sorte', effects: { gold: -40, gamble: 100 } },
        { icon: '🍺', title: 'Pagar uma rodada (20g)', desc: 'As unidades em campo recebem XP de moral.', cost: 20, tag: 'XP', effects: { gold: -20, xpSplit: 100 + a * 40 } },
        { icon: '🚶', title: 'Seguir viagem', desc: 'A estrada chama.', tag: 'Ignorar', effects: {} } ] }),
      () => ({ title: '❓ Estátua Chorosa', subtitle: 'Uma estátua de um antigo ferreiro verte lágrimas de metal derretido.', options: [
        { icon: '🛡️', title: 'Recolher o metal', desc: 'Receba um item ★1 aleatório.', tag: 'Item', effects: { randomItem: 1 } },
        { icon: '🙏', title: 'Fazer uma prece', desc: '+10 de Vida Máxima da Cidadela (e cura 10).', tag: 'Cidadela', effects: { citadelMax: 10 } } ] })
    ];
    const ev = rng.pick(events)();
    return { kind: 'choice', ...ev };
  }

  /* Efeitos de escolhas. pid = jogador que decidiu (paga custos e recebe
     recompensas individuais). Ouro positivo vai para TODOS no co-op. */
  function applyEffects(fx, pid) {
    const r = G.run, chooser = G.P(pid);
    if (fx.gold) {
      if (fx.gold > 0) { const v = Math.round(fx.gold * G.goldFactor()); r.players.forEach(p => { p.gold += v; }); log(`🪙 +${v}g${G.isCoop() ? ' para cada jogador' : ''}.`, 'gold'); }
      else chooser.gold = Math.max(0, chooser.gold + fx.gold);
    }
    if (fx.gamble) {
      const win = withRng(rng => rng.chance(0.45));
      if (win) { chooser.gold += fx.gamble; log(`🎲 ${chooser.name} venceu a aposta! +${fx.gamble}g.`, 'gold'); toast('🎲 Você venceu a aposta!', 'success'); }
      else { log('🎲 O velho sorri e embolsa o ouro.', 'danger'); toast('🎲 Perdeu a aposta...', 'error'); }
    }
    if (fx.citadel) {
      r.citadelHp = fx.citadel > 0 ? Math.min(r.citadelMax, r.citadelHp + fx.citadel) : Math.max(1, r.citadelHp + fx.citadel);
      log(`🏰 Cidadela ${fx.citadel > 0 ? '+' : ''}${fx.citadel} (${r.citadelHp}/${r.citadelMax}).`, fx.citadel > 0 ? 'win' : 'danger');
    }
    if (fx.citadelMax) { r.citadelMax += fx.citadelMax; r.citadelHp += fx.citadelMax; log(`🏰 Muralhas reforçadas: Vida Máxima ${r.citadelMax}.`, 'win'); }
    if (fx.relic) addRelic(fx.relic, pid);
    if (fx.secret) G.secret(fx.secret);
    if (fx.randomRelic) {
      const pool = Object.values(D.RELICS).filter(x => x.rarity === fx.randomRelic && !r.relics.includes(x.id) && !x.secret);
      if (pool.length) addRelic(withRng(rng => rng.pick(pool)).id, pid);
    }
    if (fx.item) { chooser.bag.push({ ...fx.item }); log(`🎒 ${D.ITEMS[fx.item.id].name} ★${fx.item.tier} na mochila${G.isCoop() ? ' de ' + chooser.name : ''}.`, 'gold'); }
    if (fx.randomItem) { const id = withRng(rng => rng.pick(Object.keys(D.ITEMS))); chooser.bag.push({ id, tier: fx.randomItem }); log(`🎒 ${D.ITEMS[id].name} na mochila.`, 'gold'); }
    if (fx.upgradeItem) {
      let items = itemsOf(pid).filter(i => i.tier < C.MAX_ITEM_TIER).sort((x, y) => x.tier - y.tier);
      if (!items.length) { const id = withRng(rng => rng.pick(Object.keys(D.ITEMS))); chooser.bag.push({ id, tier: 1 }); log(`🔨 Sem itens para aprimorar: o ferreiro forjou ${D.ITEMS[id].name}.`, 'gold'); }
      else { items[0].tier++; log(`🔨 ${D.ITEMS[items[0].id].name} aprimorado para ★${items[0].tier}.`, 'gold'); }
    }
    if (fx.xpSplit) {
      for (const p of r.players) {
        const mine = G.boardOf(p.id); if (!mine.length) continue;
        const per = Math.floor(fx.xpSplit * G.xpShare() / mine.length);
        mine.forEach(u => G.grantXp(u, per));
      }
      log('📘 XP distribuído entre as unidades em campo.', 'level');
    }
    if (fx.evoTop) { const u = topUnit(pid); if (u) { u.evoPoints += fx.evoTop; log(`⭐ ${u.name} +${fx.evoTop} PE.`, 'level'); } }
    if (fx.elementAll) { r.board.forEach(u => { u.elements[fx.elementAll] = (u.elements[fx.elementAll] || 0) + 1; }); log(`🔮 +1 ${D.ELEMENTS[fx.elementAll].name} em todo o campo.`, 'level'); }
    if (fx.elementTop) { const u = topUnit(pid); if (u) { u.elements[fx.elementTop] = (u.elements[fx.elementTop] || 0) + (fx.elementTopN || 1); log(`💠 ${u.name} +${fx.elementTopN || 1} ${D.ELEMENTS[fx.elementTop].name}.`, 'level'); } }
    if (fx.recruit) {
      const slot = freeBench(chooser);
      if (slot === -1) { chooser.gold += 40; log('Banco cheio: o mercenário deixou 40g.', 'gold'); }
      else {
        const arch = D.ARCHETYPES[fx.recruit.arch], id = r.nextUnitId++;
        chooser.bench[slot] = { id, owner: chooser.id, archetypeId: arch.id, name: `${arch.name} #${id}`, cost: arch.cost, level: fx.recruit.level, xp: 0, evoPoints: fx.recruit.level - 1, col: -1, row: -1, elements: {}, skills: { [arch.signatureSkill]: 1 }, items: [] };
        log(`🤝 ${arch.name} juntou-se a ${chooser.name}.`, 'level');
      }
    }
  }

  function addRelic(id, pid) {
    const r = G.run;
    if (r.relics.includes(id)) return;
    r.relics.push(id);
    log(`🏺 Relíquia obtida: ${D.RELICS[id].name}!`, 'level');
    if (id === 'tomo_evolucao') { const u = topUnit(pid); if (u) u.evoPoints++; }
    if (id === 'coracao_forja') { const it = withRng(rng => rng.pick(Object.keys(D.ITEMS))); G.P(pid).bag.push({ id: it, tier: 1 }); toast(`Coração da Forja criou: ${D.ITEMS[it].name}!`, 'success'); }
  }

  G.currentPending = () => (G.run && G.run.pending[0]) || null;
  G.pendingChooser = () => { const p = G.currentPending(); return p && p.pid !== undefined ? G.P(p.pid) : G.me(); };
  G.optionAffordable = (opt, payer) => {
    const p = payer || G.pendingChooser();
    return !(opt.cost && p.gold < opt.cost) && !(opt.price && p.gold < opt.price);
  };

  G.resolveOption = function (i) {
    const r = G.run, p = r.pending[0];
    if (!p) return;
    if (p.kind === 'shop') {
      const o = p.offers[i], buyer = G.me();
      if (!o || o.sold) return;
      if (buyer.gold < o.price) return toast('Ouro insuficiente.', 'error');
      buyer.gold -= o.price; o.sold = true; o.buyer = buyer.name; applyEffects(o.effects, buyer.id); sfx('buy');
      G.save(); changed(); return;
    }
    if (p.kind === 'choice') {
      const o = p.options[i];
      if (!o || !G.optionAffordable(o)) return toast('Requisito não atendido.', 'error');
      applyEffects(o.effects || {}, p.pid !== undefined ? p.pid : r.active); sfx('levelUp');
    }
    nextPending();
  };
  G.skipPending = function () { nextPending(); };
  function nextPending() {
    const r = G.run;
    const done = r.pending.shift();
    if (done && done.final) return endRun(true, done.report);
    if (!r.pending.length) {
      r.phase = r.afterPending || 'MAP';
      if (r.phase === 'PREP' && G.totalEvo() > 0) setTimeout(() => FE.Bus.emit('openEvo'), 0);
    }
    G.save(); changed();
  }
})(typeof window !== 'undefined' ? window : globalThis);
