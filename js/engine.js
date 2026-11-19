/* ==========================================================================
   FORJA ELEMENTAL 2.0 — engine.js
   Lógica pura (sem DOM): cálculo de atributos, geração procedural
   (mapa + hordas) e simulação de combate em tempo real.
   Pode rodar no navegador, em Node (testes/simulações de balanceamento)
   ou num servidor autoritativo futuramente.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE;
  const D = FE.Data;
  const C = D.CONFIG;
  const { clamp } = FE.util;

  /* ======================================================================
     1. ATRIBUTOS EFETIVOS
     ctx (jogador): { isEnemy:false, board, relics:Set, affix, gold, synergy, orders }
     ctx (inimigo): { isEnemy:true, affix, ascension }
     ====================================================================== */
  function synergyTier(count) {
    const t = C.SYN_THRESHOLDS;
    for (let i = t.length - 1; i >= 0; i--) if (count >= t[i]) return i + 1;
    return 0;
  }
  function orderTier(count, ord) {
    const t = (ord && ord.thresholds) || C.ORDER_THRESHOLDS;
    for (let i = t.length - 1; i >= 0; i--) if (count >= t[i]) return i + 1;
    return 0;
  }

  function computeStats(unit, ctx) {
    const arch = D.ARCHETYPES[unit.archetypeId];
    const b = unit.baseStats || arch.stats;
    const lvl = unit.level || 1;
    const s = {
      maxHp: b.maxHp * (1 + (lvl - 1) * 0.14), ad: b.ad * (1 + (lvl - 1) * 0.12), ap: b.ap * (1 + (lvl - 1) * 0.12),
      armor: b.armor + (lvl - 1) * 3.5, attackSpeed: b.attackSpeed, range: b.range, critChance: b.critChance, critDmg: 1.75,
      moveSpeed: b.moveSpeed, maxMana: b.maxMana, startMana: 15, manaRegen: 2, manaPerAttack: 12,
      dodge: 0, lifesteal: 0, thorns: 0, executeBonus: 0, highHpBonus: 0, healPowerMult: 1, initialShield: 0,
      trueDmgBonus: 0, dmgReduction: 0, magicPen: 0, armorPen: 0, manaRefund: 0, dmgDealtMult: 1, regenPct: 0,
      auraHeal: 0, burnPct: 0, explodePct: 0, chillAmt: 0, chainTargets: 0, solarAuraReduce: 0, xpMult: 0, initialShieldPct: 0,
      guardAura: 0, inspireAura: 0, summonMult: 0, summonHp: 0
    };

    // 1. Stacks elementais individuais
    let distinct = 0;
    for (const [el, st] of Object.entries(unit.elements || {})) {
      if (st <= 0) continue;
      distinct++;
      if (el === 'fogo') { s.ad *= 1 + 0.12 * st; s.ap *= 1 + 0.12 * st; }
      else if (el === 'agua') { s.maxMana += 15 * st; s.ap += 8 * st; }
      else if (el === 'pedra') { s.armor += 14 * st; s.maxHp += 90 * st; }
      else if (el === 'ar') { s.attackSpeed *= 1 + 0.12 * st; }
      else if (el === 'solar') { s.critChance += 0.10 * st; s.ad += 10 * st; }
      else if (el === 'lunar') { s.critDmg += 0.10 * st; s.ap += 10 * st; }
    }

    // 2. Passivas do arquétipo
    const k = unit.skills || {};
    if (k.vg_couraca) { s.armor += k.vg_couraca * 18; s.maxHp *= 1 + k.vg_couraca * 0.14; }
    if (k.vg_provocacao) s.thorns += k.vg_provocacao * 0.18;
    if (k.ar_fluxo) { s.ap *= 1 + k.ar_fluxo * 0.22; s.manaRegen += k.ar_fluxo * 4; }
    if (k.ar_eco) { s.magicPen += k.ar_eco * 0.15; s.dmgDealtMult += k.ar_eco * 0.12; }
    if (k.ca_olho_aguia) { s.critChance += k.ca_olho_aguia * 0.12; s.critDmg += k.ca_olho_aguia * 0.25; s.range += k.ca_olho_aguia * 0.4; }
    if (k.ca_vento_leve) s.attackSpeed *= 1 + k.ca_vento_leve * 0.18;
    if (k.so_veneno) s.executeBonus += k.so_veneno * 0.18;
    if (k.so_evasao) { s.dodge += k.so_evasao * 0.10; s.lifesteal += k.so_evasao * 0.10; }
    if (k.cl_graca) s.healPowerMult += k.cl_graca * 0.22;
    if (k.cl_aura_mana) { s.ap *= 1 + k.cl_aura_mana * 0.18; s.manaPerAttack += k.cl_aura_mana * 5; }
    if (k.at_engrenagem) { s.attackSpeed *= 1 + k.at_engrenagem * 0.16; s.ap *= 1 + k.at_engrenagem * 0.16; }
    if (k.at_campo_forca) { s.initialShield += k.at_campo_forca * 140; s.startMana += k.at_campo_forca * 15; }
    if (k.be_sede_sangue) s.lifesteal += k.be_sede_sangue * 0.11;
    if (k.be_pele_ferro) { s.ad *= 1 + k.be_pele_ferro * 0.15; s.maxHp += k.be_pele_ferro * 140; }
    if (k.ln_postura) { s.armor += k.ln_postura * 12; s.dodge += k.ln_postura * 0.08; }
    if (k.ln_primeiro) s.highHpBonus += k.ln_primeiro * 0.20;
    if (k.dr_casca) { s.maxHp += k.dr_casca * 120; s.dmgReduction += k.dr_casca * 0.07; }
    if (k.pa_aura) s.guardAura += k.pa_aura * 0.05;
    if (k.pa_fe) { s.maxHp *= 1 + k.pa_fe * 0.12; s.armor += k.pa_fe * 10; }
    if (k.mo_fluxo) { s.manaPerAttack += k.mo_fluxo * 5; s.attackSpeed *= 1 + k.mo_fluxo * 0.08; }
    if (k.mo_serenidade) s.dodge += k.mo_serenidade * 0.10;
    if (k.al_catalise) { s.ap *= 1 + k.al_catalise * 0.15; s.maxMana *= 1 - k.al_catalise * 0.08; }
    if (k.bd_inspirar) s.inspireAura += k.bd_inspirar * 0.06;
    if (k.bd_ritmo) { s.startMana += k.bd_ritmo * 12; s.manaRegen += k.bd_ritmo * 3; }
    if (k.ne_pacto) { s.lifesteal += k.ne_pacto * 0.10; s.summonHp += k.ne_pacto * 0.20; }

    // 3. Itens (com tier ★1–★3)
    const items = unit.items || [];
    for (const it of items) {
      const def = D.ITEMS[it.id];
      if (!def) continue;
      const m = C.ITEM_TIER_MULT[(it.tier || 1) - 1] || 1;
      for (const [stat, val] of Object.entries(def.stats)) {
        const v = val * m;
        if (stat === 'asMult') s.attackSpeed *= 1 + v;
        else if (stat === 'healMult') s.healPowerMult += v;
        else if (s[stat] !== undefined) s[stat] += v;
      }
    }

    if (!ctx.isEnemy) {
      // 4. Ordens: Classes e Origens (cada arquétipo pertence a duas)
      const mine = new Set(arch.orders || []);
      for (const ord of Object.values(D.ORDERS)) {
        const tier = orderTier((ctx.orders && ctx.orders[ord.id]) || 0, ord);
        if (!tier) continue;
        const t = ord.tiers[tier - 1];
        if (t.healAll) s.healPowerMult += t.healAll;
        if (t.teamShield) s.initialShieldPct += t.teamShield;
        if (!mine.has(ord.id)) continue;
        if (t.hpPct) s.maxHp *= 1 + t.hpPct;
        if (t.armor) s.armor += t.armor;
        if (t.apPct) s.ap *= 1 + t.apPct;
        if (t.manaRegen) s.manaRegen += t.manaRegen;
        if (t.crit) s.critChance += t.crit;
        if (t.critDmg) s.critDmg += t.critDmg;
        if (t.startMana) s.startMana += t.startMana;
        if (t.summonMult) s.summonMult += t.summonMult;
        if (t.regenPct) s.regenPct += t.regenPct;
        if (t.asPct) s.attackSpeed *= 1 + t.asPct;
        if (t.lifesteal) s.lifesteal += t.lifesteal;
        if (t.execute) s.executeBonus += t.execute;
        if (t.trueDmg) s.trueDmgBonus += t.trueDmg;
        if (t.armorPen) s.armorPen += t.armorPen;
      }
    }

    // 5. Sinergias elementais
    for (const [elKey, el] of Object.entries(D.ELEMENTS)) {
      let tier;
      if (ctx.isEnemy) tier = (unit.elements && unit.elements[elKey] > 0) ? (unit.isBoss ? 2 : 1) : 0;
      else tier = synergyTier((ctx.synergy && ctx.synergy[elKey]) || 0);
      if (!tier) continue;
      const i = tier - 1;
      if (elKey === 'fogo') { s.burnPct = el.burnPct[i]; s.explodePct = el.explodePct[i]; }
      else if (elKey === 'agua') { s.manaRegen += el.manaRegen[i]; s.chillAmt = el.chillAmt[i]; }
      else if (elKey === 'pedra') { s.armor += el.armorBonus[i]; s.initialShieldPct += el.shieldPct[i]; }
      else if (elKey === 'ar') { s.attackSpeed *= 1 + el.asMult[i]; s.dodge += el.dodge[i]; s.chainTargets = el.chainTargets[i]; }
      else if (elKey === 'solar') { s.trueDmgBonus += el.trueDmgPct[i]; s.solarAuraReduce = el.auraReduce[i]; }
      else if (elKey === 'lunar') { s.lifesteal += el.lifesteal[i]; s.critDmg += el.critDmg[i]; }
    }

    // 6. Relíquias (jogador)
    if (!ctx.isEnemy) {
      const has = (id) => ctx.relics && ctx.relics.has(id);
      const n = ctx.board ? ctx.board.length : 0;
      if (has('coroa_lobo') && n <= 3) { s.maxHp *= 1.65; s.ad *= 1.55; s.ap *= 1.55; }
      if (has('estandarte_legiao') && n > 5) { const ex = n - 5; s.attackSpeed *= 1 + ex * 0.07; s.armor += ex * 10; }
      if (has('prisma_elemental') && distinct >= 3) { s.maxHp *= 1.35; s.ad *= 1.35; s.ap *= 1.35; s.armor *= 1.35; }
      if (has('reator_mana')) { s.maxMana = Math.max(35, Math.round(s.maxMana * 0.75)); s.dmgDealtMult += 0.25; }
      if (has('cofre_mercador')) s.dmgDealtMult += Math.floor((ctx.gold || 0) / 15) * 0.01;
      if (has('martelo_ferreiro') && items.length >= 2) { s.ad *= 1.30; s.ap *= 1.30; s.initialShieldPct += 0.25; }
      if (has('ampulheta_temporal')) s.startMana += 40;
      if (has('egide_tita') && unit.row >= C.PLAYER_ROW && unit.row <= C.PLAYER_ROW + 1) { s.maxHp *= 1.35; s.armor += 25; }
      if (has('lente_atirador') && unit.row >= C.ROWS - 2) { s.critChance += 0.25; s.range += 1.0; }
      if (has('bencao_celestial')) s.healPowerMult *= 1.40;
      if (has('coracao_forja') && items.length > 0) { const bo = 1 + items.length * 0.15; s.maxHp *= bo; s.ad *= bo; s.ap *= bo; }
      if (has('escudo_vigia')) s.initialShieldPct += 0.12;
      if (has('presa_vampira')) s.lifesteal += 0.10;
      if (has('pato_borracha')) s.critChance += 0.06;
      if (has('pintinho_dourado')) { s.attackSpeed *= 1.08; s.maxHp *= 1.08; }
    } else {
      // 6b. Inimigos: afixos de elite e ascensão
      for (const af of unit.affixes || []) {
        if (af === 'blindado') { s.armor *= 1.5; s.maxHp *= 1.3; }
        if (af === 'veloz') { s.attackSpeed *= 1.4; s.moveSpeed += 1; }
        if (af === 'vampirico') s.lifesteal += 0.25;
        if (af === 'regenerativo') s.regenPct += 0.02;
      }
      const asc = ctx.ascension || 0;
      if (asc > 0) { const m = 1 + asc * 0.06; s.maxHp *= m; s.ad *= m; s.ap *= m; }
    }

    // 7. Arena
    const af = ctx.affix;
    if (af === 'tempestade_arcana') s.manaRegen *= 1.35;
    if (af === 'solo_vulcanico') s.dmgDealtMult *= 1.22;
    if (af === 'nevoa_densa') s.dodge += 0.18;
    if (af === 'arena_sagrada') s.healPowerMult *= 1.30;
    if (af === 'vento_cortante') s.attackSpeed *= 1.25;
    if (af === 'eclipse_sombrio') { s.lifesteal += 0.20; s.critDmg += 0.25; }

    // 8. Derivados que dependem de valores finais
    if (k.dr_seiva) s.auraHeal = 6 * k.dr_seiva + s.ap * 0.05 * k.dr_seiva;
    s.initialShield += s.maxHp * s.initialShieldPct;

    const maxMana = Math.round(s.maxMana);
    return {
      ...s,
      maxHp: Math.round(s.maxHp), ad: Math.round(s.ad), ap: Math.round(s.ap), armor: Math.round(s.armor),
      attackSpeed: +s.attackSpeed.toFixed(2), range: +s.range.toFixed(2), critChance: Math.min(0.95, s.critChance),
      critDmg: +s.critDmg.toFixed(2), maxMana, startMana: Math.min(maxMana, Math.round(s.startMana)),
      manaRegen: +s.manaRegen.toFixed(1), dodge: Math.min(0.70, s.dodge), dmgReduction: Math.min(0.60, s.dmgReduction),
      magicPen: Math.min(0.80, s.magicPen), armorPen: Math.min(0.80, s.armorPen), initialShield: Math.round(s.initialShield)
    };
  }

  /* ======================================================================
     2. GERAÇÃO PROCEDURAL: AFIXOS, MAPA RAMIFICADO E HORDAS
     ====================================================================== */
  function rollAffix(rng, room) {
    if (room === 1) return 'padrao';
    const keys = Object.keys(D.ARENA);
    return rng.chance(0.25) ? 'padrao' : rng.pick(keys.slice(1));
  }

  function generateActMap(rng, act, asc) {
    const floors = [];
    for (let f = 1; f <= C.ROOMS_PER_ACT; f++) {
      const RPA = C.ROOMS_PER_ACT;
      let count = f === RPA ? 1 : (f === 1 ? 2 : rng.int(2, 3));
      if (f >= 2 && f < RPA && rng.chance(0.25)) count = Math.min(4, count + 1);
      const nodes = [];
      for (let i = 0; i < count; i++) {
        let type;
        if (f === RPA) type = 'chefe';
        else if (f === 1) type = 'combate';
        else if (f === RPA - 1 && i === count - 1) type = 'acampamento';
        else type = rng.weighted([['combate', 38], ['elite', asc >= 3 ? 24 : 16], ['misterio', 14], ['forja', 9], ['santuario', 8], ['acampamento', 6], ['mercador', 9]]);
        const room = (act - 1) * C.ROOMS_PER_ACT + f;
        const fights = type === 'combate' || type === 'elite' || type === 'chefe';
        const layouts = Object.keys(D.LAYOUTS).filter(k => D.LAYOUTS[k].acts.includes(act));
        nodes.push({ id: `a${act}f${f}n${i}`, act, floor: f, index: i, type, room,
          affix: (type === 'combate' || type === 'elite') ? rollAffix(rng, room) : 'padrao',
          layout: fights ? (room === 1 ? 'planicie' : rng.pick(layouts)) : null, next: [] });
      }
      floors.push(nodes);
    }
    // Garante ao menos 1 combate/elite no andar 2 para não travar o ganho de XP
    // Garante ao menos 1 combate/elite nos andares intermediários para não travar o XP
    for (let fi = 1; fi < floors.length - 1; fi++) {
      if (floors[fi].some(n => n.type === 'combate' || n.type === 'elite')) continue;
      const n0 = floors[fi][0]; n0.type = 'combate'; n0.affix = rollAffix(rng, n0.room);
      n0.layout = n0.layout || rng.pick(Object.keys(D.LAYOUTS).filter(k => D.LAYOUTS[k].acts.includes(act)));
    }
    const link = (a, id) => { if (!a.next.includes(id)) a.next.push(id); };
    for (let f = 0; f < floors.length - 1; f++) {
      const A = floors[f], B = floors[f + 1];
      A.forEach((n, i) => {
        const j = A.length === 1 ? 0 : Math.round(i * (B.length - 1) / (A.length - 1));
        link(n, B[j].id);
        if (B[j + 1] && rng.chance(0.45)) link(n, B[j + 1].id);
      });
      B.forEach((m, j) => {
        if (!A.some(n => n.next.includes(m.id))) {
          const i = B.length === 1 ? 0 : Math.round(j * (A.length - 1) / (B.length - 1));
          link(A[i], m.id);
        }
      });
    }
    return { act, floors };
  }

  /* ---------------- Terreno procedural (12x12, espelhado entre os lados) --- */
  const isBlocked = (t) => !!(D.TERRAIN[t] && D.TERRAIN[t].blocked);
  function terrainAt(terrain, col, row) {
    if (!terrain || col < 0 || row < 0 || col >= C.COLS || row >= C.ROWS) return '.';
    return terrain[row * C.COLS + col];
  }
  function tileBlocked(terrain, col, row) {
    if (col < 0 || row < 0 || col >= C.COLS || row >= C.ROWS) return true;
    return isBlocked(terrainAt(terrain, col, row));
  }

  function generateTerrain(rng, layout, act) {
    const N = C.COLS, H = C.ROWS, half = H / 2;
    const g = Array(N * H).fill('.');
    const set = (c, r, t) => { if (c >= 0 && c < N && r >= 0 && r < half) g[r * N + c] = t; };
    const rnd = (a, b) => rng.int(a, b);
    switch (layout) {
      case 'planicie':
        for (let k = rnd(3, 5); k > 0; k--) set(rnd(0, N - 1), rnd(1, 4), rng.pick(['F', 'F', 'H']));
        break;
      case 'floresta':
        for (let k = rnd(11, 15); k > 0; k--) set(rnd(0, N - 1), rnd(1, 5), 'F');
        for (let k = 2; k > 0; k--) set(rnd(1, N - 2), rnd(2, 4), 'M');
        break;
      case 'rio': {
        for (let c = 0; c < N; c++) set(c, 5, 'W');
        const groups = [[1, 2, 3], [5, 6], [8, 9, 10]];
        for (const gr of rng.shuffle(groups).slice(0, rnd(2, 3))) set(rng.pick(gr), 5, 'B');
        for (let k = rnd(2, 4); k > 0; k--) set(rnd(0, N - 1), rnd(1, 3), rng.pick(['F', 'H']));
        break;
      }
      case 'lago':
        for (let r = 0; r < half; r++) for (let c = 0; c < N; c++) {
          const dx = (c + 0.5 - N / 2) / 2.7, dy = (r + 0.5 - H / 2) / 1.9;
          if (dx * dx + dy * dy <= 1) set(c, r, 'W');
        }
        for (let k = rnd(3, 5); k > 0; k--) set(rnd(0, N - 1), rnd(2, 4), 'F');
        break;
      case 'montanha': {
        const gaps = new Set();
        for (const gr of [[1, 2], [5, 6], [9, 10]]) { const c0 = rng.pick(gr); gaps.add(c0); if (rng.chance(0.4)) gaps.add(c0 + 1); }
        for (let c = 0; c < N; c++) if (!gaps.has(c)) { set(c, 5, 'M'); if (rng.chance(0.3) && !gaps.has(c - 1) && !gaps.has(c + 1)) set(c, 4, 'M'); }
        for (let k = 3; k > 0; k--) set(rnd(0, N - 1), rnd(1, 3), 'H');
        break;
      }
      case 'pantano':
        for (let k = 4; k > 0; k--) {
          const cx = rnd(1, N - 2), cy = rnd(2, 5);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (rng.chance(0.7)) set(cx + dx, cy + dy, 'S');
        }
        for (let k = 2; k > 0; k--) set(rnd(1, N - 2), rnd(3, 5), 'W');
        break;
      case 'ravina':
        for (let r = 1; r < half; r++) { set(5, r, 'R'); set(6, r, 'R'); }
        set(5, 3, 'B'); set(6, 3, 'B');
        for (let k = 2; k > 0; k--) { const c = rnd(1, 3), r = rnd(2, 4); set(c, r, 'M'); set(N - 1 - c, r, 'M'); }
        break;
      case 'ruinas':
        for (let k = rnd(4, 6); k > 0; k--) { const c = rnd(0, 5), r = rnd(2, 5); set(c, r, 'P'); set(N - 1 - c, r, 'P'); }
        for (let k = 2; k > 0; k--) set(rnd(0, N - 1), rnd(1, 3), 'H');
        break;
      case 'ilhas': {
        for (let r = 2; r < half; r++) for (let c = 0; c < N; c++) set(c, r, 'R');
        for (let r = 2; r <= 4; r++) for (let c = 1; c <= 4; c++) set(c, r, '.');
        for (let r = 2; r <= 4; r++) for (let c = 7; c <= 10; c++) set(c, r, '.');
        set(5, 3, 'B'); set(6, 3, 'B');
        for (const c of rng.shuffle([2, 3, 8, 9]).slice(0, 2)) set(c, 5, 'B');
        for (let k = 2; k > 0; k--) set(rnd(1, 10), rnd(2, 4), 'H');
        break;
      }
      case 'magma': {
        for (let c = 0; c < N; c++) set(c, 5, 'L');
        for (const c of rng.shuffle([2, 5, 6, 9]).slice(0, 2)) set(c, 5, 'B');
        for (let k = 3; k > 0; k--) set(rnd(0, N - 1), rnd(2, 4), 'M');
        for (let k = 3; k > 0; k--) set(rnd(0, N - 1), rnd(2, 4), 'L');
        break;
      }
    }
    // Espelha a metade inimiga para o lado do jogador (campo justo)
    for (let r = 0; r < half; r++) for (let c = 0; c < N; c++) g[(H - 1 - r) * N + c] = g[r * N + c];
    // Garante que os dois lados estão conectados
    for (let tries = 0; tries < 6 && !connected(g); tries++) {
      const c = rnd(1, N - 2);
      for (let r = 0; r < H; r++) if (isBlocked(g[r * N + c])) g[r * N + c] = (g[r * N + c] === 'M' || g[r * N + c] === 'P') ? '.' : 'B';
    }
    return g.join('');
  }
  function connected(g) {
    const N = C.COLS, H = C.ROWS, seen = new Uint8Array(N * H), q = [];
    for (let c = 0; c < N; c++) { const i = (H - 1) * N + c; if (!isBlocked(g[i])) { seen[i] = 1; q.push(i); } }
    while (q.length) {
      const i = q.pop(), x = i % N, y = (i - x) / N;
      if (y === 0) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= H) continue;
        const j = ny * N + nx; if (!seen[j] && !isBlocked(g[j])) { seen[j] = 1; q.push(j); }
      }
    }
    return false;
  }
  function nearestPassable(terrain, col, row, taken) {
    for (let rad = 0; rad < 12; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
      const c = col + dx, r = row + dy;
      if (!tileBlocked(terrain, c, r) && !(taken && taken.has(c + ',' + r))) return { col: c, row: r };
    }
    return { col, row };
  }

  function makeEnemyStats(arch, scale, mult = 0.82) {
    const st = arch.stats;
    return {
      maxHp: Math.round(st.maxHp * scale * mult), ad: Math.round(st.ad * scale * mult), ap: Math.round(st.ap * scale * mult),
      armor: Math.round(st.armor), attackSpeed: st.attackSpeed, range: st.range, critChance: st.critChance,
      moveSpeed: st.moveSpeed, maxMana: st.maxMana
    };
  }

  /* Escala do co-op: o time tem sempre até 12 unidades, não importa se 2, 3 ou 4 jogadores */
  const CO = { count: 1.3, countPer: 0.05, stat: 1.05, statPer: 0.13, boss: 1.3, bossPer: 0.14 };
  function generateHorde(rng, room, act, roomType, asc, terrain, players = 1) {
    const enemies = [];
    const archKeys = Object.keys(D.ARCHETYPES);
    const elKeys = Object.keys(D.ELEMENTS);
    const fac = D.ACTS[act];
    const isBoss = roomType === 'chefe', isElite = roomType === 'elite';
    // Co-op: mais inimigos e um pouco mais fortes (o time pode ter até 12 unidades)
    const coop = players > 1, coopCount = coop ? CO.count + CO.countPer * room : 1, coopStat = coop ? CO.stat + CO.statPer * room : 1;
    const baseCount = isBoss ? 2 + Math.floor(room * 0.26) : 2 + Math.floor(room * 0.55) + (isElite ? 1 : 0);
    const count = Math.min(isBoss ? 12 : 22, Math.round(baseCount * coopCount));
    const scale = (1 + (room - 1) * 0.135 + (isElite ? 0.15 : 0)) * coopStat;

    const cols = [...Array(C.COLS).keys()];
    const slots = [];
    for (let r = C.PLAYER_ROW - 1; r >= 0; r--) for (const c of rng.shuffle(cols)) if (!tileBlocked(terrain, c, r)) slots.push({ col: c, row: r });
    const lead = (isBoss || isElite) ? nearestPassable(terrain, 5, 2) : null;
    const reserved = (p) => lead && p.row === lead.row && p.col === lead.col;

    if (isBoss) {
      const bc = D.BOSSES[act];
      enemies.push({
        id: `boss_${room}`, name: bc.name, archetypeId: 'vanguarda', symbol: bc.symbol, color: bc.color,
        isBoss: true, isElite: true, level: Math.max(3, Math.floor(room * 0.95)), col: lead.col, row: lead.row,
        elements: { ...bc.elements }, skills: { ...bc.skills }, affixes: [], script: bc.script,
        baseStats: {
          maxHp: Math.round(820 * scale * bc.hpMult * (coop ? CO.boss + CO.bossPer * room : 1)), ad: Math.round(52 * scale * bc.adMult), ap: Math.round(65 * scale * bc.apMult),
          armor: Math.round(35 + room * 3.5), attackSpeed: 0.85, range: 2.2, critChance: 0.20, moveSpeed: 1.9, maxMana: 85
        }
      });
    } else if (isElite) {
      const el1 = rng.pick(elKeys);
      const affs = rng.shuffle(Object.keys(D.ELITE_AFFIXES)).slice(0, act >= 2 ? 2 : 1);
      const archId = rng.pick(['berserker', 'vanguarda', 'lanceiro']);
      enemies.push({
        id: `elite_${room}`, name: `Comandante ${D.ELEMENTS[el1].name}`, archetypeId: archId, symbol: '👹', color: '#f59e0b',
        isBoss: false, isElite: true, level: Math.max(2, Math.floor(room * 0.85)), col: lead.col, row: lead.row,
        elements: { [el1]: 2 }, skills: { [D.ARCHETYPES[archId].signatureSkill]: 2, [D.ARCHETYPES[archId].skills[1]]: 1 }, affixes: affs,
        baseStats: { ...makeEnemyStats(D.ARCHETYPES[archId], scale, 1.0), maxHp: Math.round(740 * scale * 1.95), ad: Math.round(64 * scale * 1.3), armor: Math.round(28 + room * 2.5), range: Math.max(1.5, D.ARCHETYPES[archId].stats.range) }
      });
    }

    let si = 0;
    const frontPool = ['vanguarda', 'berserker', 'lanceiro', 'paladino', 'monge'];
    for (let i = 0; i < count; i++) {
      while (si < slots.length && reserved(slots[si])) si++;
      if (si >= slots.length) break;
      const pos = slots[si++];
      const archKey = pos.row >= C.PLAYER_ROW - 2 && i < Math.ceil(count / 2) ? rng.pick(frontPool) : rng.pick(archKeys);
      const arch = D.ARCHETYPES[archKey];
      const els = {};
      if (room >= 2 && rng.chance(0.5)) els[rng.pick(elKeys)] = 1;
      if (asc >= 5 && room >= 3) { const e = rng.pick(elKeys); els[e] = (els[e] || 0) + 1; }
      const skills = { [arch.signatureSkill]: room >= 7 ? 2 : 1 };
      if (room >= 11) skills[arch.skills[1]] = 1;
      const [fname, fsym] = fac.faction[archKey];
      enemies.push({
        id: `e_${room}_${i}`, name: fname, archetypeId: archKey, symbol: fsym, color: fac.enemyColor,
        isBoss: false, isElite: false, level: Math.max(1, Math.floor(1 + (room - 1) * 0.42)), col: pos.col, row: pos.row,
        elements: els, skills, affixes: [],
        baseStats: { ...makeEnemyStats(arch, scale), armor: Math.round(arch.stats.armor * (1 + (room - 1) * 0.05)) }
      });
    }
    return enemies;
  }

  /* ======================================================================
     3. SIMULAÇÃO DE COMBATE
     ====================================================================== */
  const SUMMON_STATS = (hp, ad, extra = {}) => ({
    maxHp: hp, ad, ap: 0, armor: 20, attackSpeed: 1.0, range: 1.45, critChance: 0.10, critDmg: 1.75, moveSpeed: 2.4,
    maxMana: 999, startMana: 0, manaRegen: 0, manaPerAttack: 0, dodge: 0, lifesteal: 0, thorns: 0, executeBonus: 0,
    highHpBonus: 0, healPowerMult: 1, initialShield: 0, trueDmgBonus: 0, dmgReduction: 0, magicPen: 0, armorPen: 0,
    manaRefund: 0, dmgDealtMult: 1, regenPct: 0, auraHeal: 0, burnPct: 0, explodePct: 0, chillAmt: 0, chainTargets: 0,
    solarAuraReduce: 0, ...extra
  });

  let uidSeq = 0;
  function makeCombatant(src, team, stats, extra = {}) {
    const arch = D.ARCHETYPES[src.archetypeId] || {};
    return {
      uid: `${team}_${src.id}_${++uidSeq}`, rosterId: team === 'player' && !extra.isSummon ? src.id : null, team,
      name: src.name || arch.name, archetypeId: src.archetypeId, color: src.color || arch.color, symbol: src.symbol || arch.symbol,
      isBoss: !!src.isBoss, isElite: !!src.isElite, isSummon: false, owner: null, affixes: src.affixes || [], script: src.script || null,
      level: src.level || 1, elements: { ...(src.elements || {}) }, skills: { ...(src.skills || {}) }, stats: { ...stats },
      hp: stats.maxHp, displayHp: stats.maxHp, shield: stats.initialShield || 0, mana: stats.startMana || 0,
      x: src.col + 0.5, y: src.row + 0.5, startCol: src.col, startRow: src.row,
      attackCooldown: team === 'player' ? 0.3 : 0.4, attackCounter: 0, castIdx: 0, lungeX: 0, lungeY: 0,
      stun: 0, chill: 0, chillFactor: 0, burn: 0, burnDps: 0, burnExplode: 0, burnSrc: null, bleed: 0, bleedDps: 0, bleedSrc: null,
      haste: 0, hasteMult: 1.25, dead: false, auraT: 0, ss: {}, dmgDealt: 0, dmgTaken: 0, healDone: 0, kills: 0, casts: 0,
      ...extra
    };
  }

  function createCombat(opts) {
    const c = {
      units: [], time: 0, rng: FE.RNG(opts.seed || 1), relics: opts.relics || new Set(), affix: opts.affix,
      phoenixUsed: false, over: false, result: null, overtimeAnnounced: false, fxOn: opts.fx !== false,
      terrain: opts.terrain || '.'.repeat(C.COLS * C.ROWS), maxPlayerSummons: 0,
      fx: { projectiles: [], particles: [], texts: [], shockwaves: [], beams: [], slashes: [], ghosts: [], shake: 0 }
    };
    for (const p of opts.players) c.units.push(makeCombatant(p.unit, 'player', p.stats));
    for (const e of opts.enemies) c.units.push(makeCombatant(e.unit, 'enemy', e.stats));

    const has = (id) => c.relics.has(id);
    for (const u of c.units) {
      if (u.team === 'enemy') {
        if (has('nucleo_instavel')) { const n = Math.round(u.stats.maxHp * 0.15); u.hp = Math.max(1, u.hp - n); u.displayHp = u.hp; text(c, u.x, u.y - 0.4, `-${n} 💣`, '#f97316', 1.1); }
        if (has('teia_arcana')) { u.chill = 4; u.chillFactor = 0.35; }
        if (u.script === 'arconte') setArcontePhase(c, u, 'solar');
      } else if (has('sino_guerra')) { u.haste = 5; u.hasteMult = 1.3; }
    }
    // Sombra: salto para a retaguarda adversária
    for (const u of c.units) {
      if (u.archetypeId !== 'sombra' || u.isBoss || u.isElite) continue;
      const row = u.team === 'player' ? 0 : C.ROWS - 1;
      const col = nearestFreeCol(c, row, Math.floor(u.x), u.uid);
      if (col !== -1) { particles(c, u.x, u.y, '#f43f5e', 10); u.x = col + 0.5; u.y = row + 0.5; particles(c, u.x, u.y, '#f43f5e', 14); }
    }
    return c;
  }

  function nearestFreeCol(c, row, pref, ignore) {
    for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7]) {
      const col = pref + off;
      if (col < 0 || col >= C.COLS || tileBlocked(c.terrain, col, row)) continue;
      if (!c.units.some(u => !u.dead && u.uid !== ignore && Math.floor(u.x) === col && Math.floor(u.y) === row)) return col;
    }
    return -1;
  }

  const tileOf = (c, x, y) => terrainAt(c.terrain, Math.floor(x), Math.floor(y));
  const blockedAt = (c, x, y) => tileBlocked(c.terrain, Math.floor(x), Math.floor(y));
  function lineClear(c, x1, y1, x2, y2) {
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.25);
    for (let i = 1; i < n; i++) { const t = i / n; if (blockedAt(c, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false; }
    return true;
  }
  /* BFS em 8 direções (sem cortar quinas) → centro da próxima casa do caminho */
  function nextStep(c, sx, sy, tx, ty) {
    const N = C.COLS, M = C.ROWS, start = sy * N + sx, goal = ty * N + tx;
    if (start === goal) return null;
    const prev = new Int16Array(N * M).fill(-1);
    prev[start] = start;
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h]; if (cur === goal) break;
      const cx = cur % N, cy = (cur - cx) / N;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= M) continue;
        const j = ny * N + nx;
        if (prev[j] !== -1) continue;
        if (j !== goal && tileBlocked(c.terrain, nx, ny)) continue;
        if (dx && dy && (tileBlocked(c.terrain, cx + dx, cy) || tileBlocked(c.terrain, cx, cy + dy))) continue;
        prev[j] = cur; q.push(j);
      }
    }
    if (prev[goal] === -1) return null;
    let node = goal;
    while (prev[node] !== start) node = prev[node];
    return { x: node % N + 0.5, y: Math.floor(node / N) + 0.5 };
  }

  // ----- Efeitos visuais (dados apenas; render.js desenha) -----
  function text(c, x, y, t, color = '#fff', scale = 1) { if (c.fxOn && c.fx.texts.length < 140) c.fx.texts.push({ x, y, text: t, color, scale, vy: -0.95, life: 1, maxLife: 1 }); }
  function particles(c, x, y, color, n = 10) {
    if (!c.fxOn) return;
    for (let i = 0; i < n && c.fx.particles.length < 600; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.2;
      c.fx.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color, size: 2.2 + Math.random() * 2.6, life: 0.4 + Math.random() * 0.35, maxLife: 0.75 });
    }
  }
  function shock(c, x, y, r, color) {
    if (!c.fxOn) return;
    c.fx.shockwaves.push({ x, y, radius: 0.15, maxRadius: r, color, life: 0.38, maxLife: 0.38 });
    if (r >= 2.5) c.fx.shake = Math.max(c.fx.shake, Math.min(10, r * 1.6));
  }
  function beam(c, x1, y1, x2, y2, color) { if (c.fxOn) c.fx.beams.push({ x1, y1, x2, y2, color, life: 0.22, maxLife: 0.22 }); }
  const sfx = (name, arg) => FE.Bus.emit('sfx', { name, arg });

  // ----- Dano, cura, escudo, morte -----
  function applyRaw(c, tgt, amount, src, vis) {
    if (!tgt || tgt.dead || amount <= 0) return 0;
    let rem = amount;
    if (tgt.shield > 0) { const ab = Math.min(tgt.shield, rem); tgt.shield -= ab; rem -= ab; }
    tgt.hp = Math.max(0, tgt.hp - rem);
    tgt.dmgTaken += amount;
    if (vis) tgt.flash = 0.12;
    const credit = src ? (src.owner || src) : null;
    if (credit && credit.team !== tgt.team) credit.dmgDealt += amount;
    if (vis) text(c, tgt.x + (Math.random() - 0.5) * 0.25, tgt.y - 0.3, vis.t, vis.color, vis.scale || 1);
    if (tgt.hp <= 0 && !tgt.dead) handleDeath(c, src, tgt);
    return amount;
  }

  function dealDamage(c, att, tgt, raw, type = 'physical', crit = false, opts = {}) {
    if (!tgt || tgt.dead) return 0;
    const forest = tileOf(c, tgt.x, tgt.y) === 'F' ? 0.15 : 0;
    if (type === 'physical' && !opts.noDodge && c.rng.next() < Math.min(0.75, tgt.stats.dodge + forest)) { text(c, tgt.x, tgt.y - 0.35, 'ESQUIVA', '#38bdf8', 0.9); return 0; }
    let dmg = raw * (att ? att.stats.dmgDealtMult : 1);
    if (att) {
      const ratio = tgt.hp / tgt.stats.maxHp;
      if (att.stats.executeBonus > 0 && ratio < 0.45) dmg *= 1 + att.stats.executeBonus;
      if (att.stats.highHpBonus > 0 && ratio > 0.70) dmg *= 1 + att.stats.highHpBonus;
      let aura = 0, insp = 0, guard = 0;
      for (const u of c.units) {
        if (u.dead) continue;
        if (u.team !== att.team && u.stats.solarAuraReduce > 0 && Math.hypot(u.x - att.x, u.y - att.y) <= 2.2) aura = Math.max(aura, u.stats.solarAuraReduce);
        if (u.team === att.team && u.stats.inspireAura > 0 && Math.hypot(u.x - att.x, u.y - att.y) <= 2.5) insp = Math.max(insp, u.stats.inspireAura);
        if (u.team === tgt.team && u.stats.guardAura > 0 && Math.hypot(u.x - tgt.x, u.y - tgt.y) <= 2.5) guard = Math.max(guard, u.stats.guardAura);
      }
      dmg *= (1 - aura) * (1 + insp) * (1 - guard);
      if (att.stats.range > 2.3 && tileOf(c, att.x, att.y) === 'H') dmg *= 1.10;
    }
    let armor = tgt.stats.armor;
    if (type === 'magic') armor *= 0.45 * (1 - (att ? att.stats.magicPen : 0));
    else if (type === 'physical') armor *= 1 - Math.min(0.9, (att ? att.stats.armorPen : 0) + (opts.armorPen || 0));
    else armor = 0;
    dmg = dmg * (100 / (100 + Math.max(0, armor))) * (1 - tgt.stats.dmgReduction);
    const trueD = att && type !== 'true' && att.stats.trueDmgBonus > 0 ? raw * att.stats.trueDmgBonus : 0;
    const final = Math.max(3, Math.round(dmg + trueD));

    const color = crit ? '#facc15' : (type === 'magic' ? '#d8b4fe' : (type === 'true' ? '#fde68a' : '#f8fafc'));
    applyRaw(c, tgt, final, att, { t: crit ? `${final}!` : `${final}`, color, scale: crit ? 1.18 : 0.98 });

    if (att && !att.dead) {
      let ls = att.stats.lifesteal;
      if (att.skills.be_sede_sangue && att.hp / att.stats.maxHp < 0.5) ls *= 2;
      if (ls > 0) att.hp = Math.min(att.stats.maxHp, att.hp + Math.round(final * ls));
      if (att.stats.burnPct > 0 && !tgt.dead) {
        tgt.burn = 3.0;
        tgt.burnDps = Math.max(tgt.burnDps, Math.round(tgt.stats.maxHp * att.stats.burnPct));
        tgt.burnExplode = Math.max(tgt.burnExplode, att.stats.explodePct || 0);
        tgt.burnSrc = att;
      }
      if (type === 'physical' && tgt.stats.thorns > 0 && !opts.noThorns && !tgt.dead) {
        applyRaw(c, att, Math.max(2, Math.round(raw * tgt.stats.thorns * 0.5)), tgt, null);
      }
    }
    return final;
  }

  function heal(c, src, tgt, raw) {
    if (!tgt || tgt.dead) return 0;
    const amt = Math.round(raw * (src ? src.stats.healPowerMult : 1));
    const healed = Math.min(tgt.stats.maxHp - tgt.hp, amt);
    if (healed > 0) {
      tgt.hp += healed;
      if (src) (src.owner || src).healDone += healed;
      text(c, tgt.x, tgt.y - 0.35, `+${healed}`, '#34d399', 1.0);
      particles(c, tgt.x, tgt.y, '#34d399', 5);
    }
    return healed;
  }
  function shieldUp(c, src, tgt, raw) {
    if (!tgt || tgt.dead) return;
    const amt = Math.round(raw * (src ? src.stats.healPowerMult : 1));
    tgt.shield += amt;
    if (src) (src.owner || src).healDone += Math.round(amt * 0.5);
    text(c, tgt.x, tgt.y - 0.42, `+${amt} 🛡️`, '#93c5fd', 0.95);
  }

  function handleDeath(c, killer, v) {
    if (v.team === 'player' && !v.isSummon && c.relics.has('fenix_cinzas') && !c.phoenixUsed) {
      c.phoenixUsed = true;
      v.hp = Math.round(v.stats.maxHp * 0.45);
      shock(c, v.x, v.y, 2.0, '#f97316'); particles(c, v.x, v.y, '#facc15', 24);
      text(c, v.x, v.y - 0.55, 'FÊNIX RENASCEU! 🔥', '#facc15', 1.25);
      sfx('levelUp');
      for (const e of alive(c, 'enemy')) if (Math.hypot(e.x - v.x, e.y - v.y) <= 2.1) dealDamage(c, v, e, v.stats.ap * 1.4 + 90, 'magic');
      return;
    }
    v.dead = true; v.hp = 0;
    if (c.fxOn) c.fx.ghosts.push({ x: v.x, y: v.y, symbol: v.symbol, color: v.color, life: 0.9, maxLife: 0.9 });
    if (v.isBoss && c.fxOn) c.fx.shake = 14;
    for (const n of c.units) if (!n.dead && n.skills.ne_colheita) n.stats.ap = Math.round(n.stats.ap * (1 + 0.04 * n.skills.ne_colheita));
    particles(c, v.x, v.y, v.color, 16); shock(c, v.x, v.y, 1.0, v.color);
    sfx('death');
    if (v.burn > 0 && v.burnExplode > 0) {
      const boom = Math.round(v.stats.maxHp * v.burnExplode);
      shock(c, v.x, v.y, 1.7, '#ef4444');
      for (const o of alive(c, v.team)) if (Math.hypot(o.x - v.x, o.y - v.y) <= 1.75) applyRaw(c, o, boom, v.burnSrc, { t: `${boom} 🔥`, color: '#f97316' });
    }
    if (v.affixes.includes('explosivo')) {
      const boom = Math.round(v.stats.maxHp * 0.20);
      shock(c, v.x, v.y, 2.2, '#fb923c');
      for (const o of alive(c, v.team === 'player' ? 'enemy' : 'player')) if (Math.hypot(o.x - v.x, o.y - v.y) <= 2.0) applyRaw(c, o, boom, v, { t: `${boom} 💥`, color: '#fb923c' });
    }
    if (killer && killer.team !== v.team) {
      const k = killer.owner || killer;
      k.kills++;
      if (k.team === 'player' && c.relics.has('calice_sangue') && !k.dead) { heal(c, k, k, k.stats.maxHp * 0.20); k.haste = 4; k.hasteMult = 1.25; }
    }
  }

  function alive(c, team) { return c.units.filter(u => !u.dead && (!team || u.team === team)); }

  function summon(c, owner, def) {
    const u = makeCombatant({ id: 's', archetypeId: def.archetypeId || 'berserker', name: def.name, symbol: def.symbol, color: def.color, col: 0, row: 0, level: def.level || 1 },
      owner.team, SUMMON_STATS(Math.round(def.hp * (1 + (owner.stats.summonMult || 0) + (owner.stats.summonHp || 0))), Math.round(def.ad * (1 + (owner.stats.summonMult || 0))), def.extra || {}),
      { isSummon: true, owner: owner.isSummon ? owner.owner : owner });
    u.x = clamp(owner.x + (c.rng.next() - 0.5) * 1.2, 0.5, C.COLS - 0.5);
    u.y = clamp(owner.y + (owner.team === 'player' ? -0.6 : 0.6), 0.5, C.ROWS - 0.5);
    if (blockedAt(c, u.x, u.y)) { u.x = owner.x; u.y = owner.y; }
    u.attackCooldown = 0.25;
    particles(c, u.x, u.y, def.color, 14);
    c.units.push(u);
    return u;
  }

  // ----- Habilidades -----
  const SKILL_FX = {
    vg_impacto(c, s, t, l, en, al, wb) {
      shock(c, s.x, s.y, 1.85, '#3b82f6');
      const dmg = 65 + l * 35 + s.stats.ad * 0.85;
      for (const e of en) if (Math.hypot(e.x - s.x, e.y - s.y) <= 1.9) { e.stun = Math.max(e.stun, 1.1 + l * 0.35); wb(e); dealDamage(c, s, e, dmg); }
      shieldUp(c, s, s, 110 + l * 65);
    },
    vg_bastiao(c, s, t, l, en, al) {
      shock(c, s.x, s.y, 1.9, '#60a5fa');
      const sh = 140 + l * 80 + s.stats.ap * 1.1;
      for (const a of al) if (Math.hypot(a.x - s.x, a.y - s.y) <= 1.95) shieldUp(c, s, a, sh);
    },
    ar_orbe(c, s, t, l, en, al, wb) {
      if (!t) return;
      shock(c, t.x, t.y, 1.9, '#a855f7'); particles(c, t.x, t.y, '#c084fc', 18);
      const dmg = 90 + l * 45 + s.stats.ap * (1.05 + l * 0.20);
      for (const e of en) if (Math.hypot(e.x - t.x, e.y - t.y) <= 1.95) { wb(e); dealDamage(c, s, e, dmg, 'magic'); }
    },
    ar_meteoro(c, s, t, l, en, al, wb) {
      const dmg = 85 + l * 35 + s.stats.ap;
      const targets = c.rng.shuffle(en);
      for (let i = 0; i < 1 + l && targets.length; i++) {
        const e = targets[i % targets.length];
        shock(c, e.x, e.y, 1.4, '#f97316'); particles(c, e.x, e.y, '#ef4444', 14); wb(e); dealDamage(c, s, e, dmg, 'magic');
      }
    },
    ca_saraivada(c, s, t, l, en, al, wb) {
      const dmg = 50 + l * 25 + s.stats.ad * (0.85 + l * 0.15);
      const sorted = en.slice().sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
      for (let i = 0; i < 2 + l && sorted.length; i++) { const e = sorted[i % sorted.length]; beam(c, s.x, s.y, e.x, e.y, '#34d399'); wb(e); dealDamage(c, s, e, dmg); }
    },
    ca_tiro_letal(c, s, t, l, en, al, wb) {
      if (!t) return;
      beam(c, s.x, s.y, t.x, t.y, '#facc15');
      const dmg = 110 + l * 55 + s.stats.ad * 1.4 + Math.max(0, t.stats.maxHp - t.hp) * l * 0.08;
      wb(t); dealDamage(c, s, t, dmg, 'physical', true, { noDodge: true });
    },
    so_golpe(c, s, t, l, en, al, wb) {
      if (!t) return;
      particles(c, t.x, t.y, '#f43f5e', 16);
      t.bleed = 3; t.bleedDps = Math.max(t.bleedDps, l * 30); t.bleedSrc = s;
      wb(t); dealDamage(c, s, t, 80 + l * 45 + s.stats.ad * (1.2 + l * 0.2), 'physical', true, { noDodge: true });
    },
    so_danca(c, s, t, l, en, al, wb) {
      shock(c, s.x, s.y, 1.7, '#f43f5e');
      const dmg = 75 + l * 40 + s.stats.ad;
      for (const e of en) if (Math.hypot(e.x - s.x, e.y - s.y) <= 1.75) { wb(e); dealDamage(c, s, e, dmg); }
    },
    cl_luz(c, s, t, l, en, al) {
      const tgt = al.slice().sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0] || s;
      sfx('heal');
      heal(c, s, tgt, 115 + l * 55 + s.stats.ap * (1.2 + l * 0.25)); shieldUp(c, s, tgt, 60 + l * 40);
    },
    cl_prece(c, s, t, l, en, al) {
      sfx('heal');
      const h = 65 + l * 35 + s.stats.ap * 0.75;
      for (const a of al) { heal(c, s, a, h); if (!a.isSummon) a.mana = Math.min(a.stats.maxMana, a.mana + 10 + l * 8); }
    },
    at_torreta(c, s, t, l) {
      summon(c, s, { name: `Torreta Nv.${l}`, symbol: '🗼', color: '#f59e0b', archetypeId: 'artifice', level: l,
        hp: 260 + l * 140 + Math.round(s.stats.ap * 1.5), ad: 38 + l * 22 + Math.round(s.stats.ap * 0.45),
        extra: { range: 4.0, attackSpeed: 1.35, moveSpeed: 0, armor: 20 + l * 8, critChance: 0.15 } });
    },
    at_sobrecarga(c, s, t, l, en, al, wb) {
      const dmg = 85 + l * 40 + s.stats.ap * 1.1;
      let prev = s;
      const list = t ? [t, ...en.filter(e => e !== t)] : en;
      for (let i = 0; i < 1 + l && i < list.length; i++) { const e = list[i]; beam(c, prev.x, prev.y, e.x, e.y, '#facc15'); wb(e); dealDamage(c, s, e, dmg, 'magic'); prev = e; }
    },
    be_furia(c, s, t, l, en, al, wb) {
      shock(c, s.x, s.y, 1.75, '#ea580c');
      const dmg = 85 + l * 45 + s.stats.ad * (1.15 + l * 0.2);
      for (const e of en) if (Math.hypot(e.x - s.x, e.y - s.y) <= 1.8) { wb(e); dealDamage(c, s, e, dmg); }
      heal(c, s, s, Math.max(0, s.stats.maxHp - s.hp) * (0.10 + l * 0.05));
    },
    be_corte_giratorio(c, s, t, l, en, al, wb) {
      shock(c, s.x, s.y, 1.85, '#f97316');
      const dmg = 75 + l * 40 + s.stats.ad * 0.95;
      for (const e of en) if (Math.hypot(e.x - s.x, e.y - s.y) <= 1.9) { wb(e); dealDamage(c, s, e, dmg); }
    },
    ln_estocada(c, s, t, l, en, al, wb) {
      if (!t) return;
      const dx = t.x - s.x, dy = t.y - s.y, len = Math.max(0.01, Math.hypot(dx, dy));
      const ex = t.x + dx / len * 1.6, ey = t.y + dy / len * 1.6;
      beam(c, s.x, s.y, ex, ey, '#2dd4bf');
      const dmg = 70 + l * 40 + s.stats.ad * 1.1;
      for (const e of en) {
        // distância do ponto ao segmento s→(ex,ey)
        const px = e.x - s.x, py = e.y - s.y, sx = ex - s.x, sy = ey - s.y;
        const tt = clamp((px * sx + py * sy) / (sx * sx + sy * sy), 0, 1);
        if (Math.hypot(px - sx * tt, py - sy * tt) <= 0.55) { wb(e); dealDamage(c, s, e, dmg, 'physical', false, { armorPen: 0.2 + l * 0.1 }); }
      }
    },
    ln_varredura(c, s, t, l, en, al, wb) {
      shock(c, s.x, s.y, 2.3, '#14b8a6');
      const dmg = 60 + l * 35 + s.stats.ad * 0.9;
      for (const e of en) if (Math.hypot(e.x - s.x, e.y - s.y) <= 2.3) { e.chill = Math.max(e.chill, 1 + l * 0.5); e.chillFactor = Math.max(e.chillFactor, 0.35); wb(e); dealDamage(c, s, e, dmg); }
    },
    dr_raizes(c, s, t, l, en, al, wb) {
      const list = c.rng.shuffle(en).slice(0, 1 + l);
      for (const e of list) {
        particles(c, e.x, e.y, '#84cc16', 12); e.stun = Math.max(e.stun, 1 + l * 0.3);
        wb(e); dealDamage(c, s, e, 60 + l * 30 + s.stats.ap * 0.8, 'magic');
      }
    },
    dr_lobo(c, s, t, l) {
      summon(c, s, { name: 'Lobo Espiritual', symbol: '🐺', color: '#a3e635', archetypeId: 'berserker', level: l,
        hp: 300 + l * 150 + Math.round(s.stats.ap * 1.2), ad: 35 + l * 20 + Math.round(s.stats.ap * 0.3),
        extra: { attackSpeed: 1.1, moveSpeed: 3.0, armor: 18 + l * 6, lifesteal: 0.15 } });
    }
  };

  function knockback(c, s, t, dist) {
    const dx = t.x - s.x, dy = t.y - s.y, len = Math.max(0.01, Math.hypot(dx, dy));
    for (let d = 0; d < dist; d += 0.1) {
      const nx = clamp(t.x + dx / len * 0.1, 0.4, C.COLS - 0.4), ny = clamp(t.y + dy / len * 0.1, 0.4, C.ROWS - 0.4);
      if (blockedAt(c, nx, ny)) break;
      t.x = nx; t.y = ny;
    }
  }
  Object.assign(SKILL_FX, {
    pa_martelo(c, s, t, l) {
      if (!t) return;
      shock(c, t.x, t.y, 1.0, '#fde047'); particles(c, t.x, t.y, '#fef08a', 14);
      t.stun = Math.max(t.stun, 1 + l * 0.3);
      const dealt = dealDamage(c, s, t, 70 + l * 40 + s.stats.ad * 0.9 + s.stats.ap * 0.5, 'magic');
      const al = alive(c, s.team).sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
      if (al && dealt) heal(c, s, al, dealt * 0.5);
    },
    pa_consagrar(c, s, t, l, en, al) {
      shock(c, s.x, s.y, 2.0, '#fde047'); sfx('heal');
      for (const e of en) if (Math.hypot(e.x - s.x, e.y - s.y) <= 2.0) dealDamage(c, s, e, 55 + l * 30 + s.stats.ap * 0.7, 'magic');
      for (const a of al) if (Math.hypot(a.x - s.x, a.y - s.y) <= 2.0) heal(c, s, a, 40 + l * 25 + s.stats.ap * 0.5);
    },
    mo_palma(c, s, t, l, en, al, wb) {
      if (!t) return;
      particles(c, t.x, t.y, '#f0abfc', 14); wb(t);
      dealDamage(c, s, t, 60 + l * 35 + s.stats.ad, 'physical', false, { noDodge: true });
      if (!t.dead && !t.isBoss) knockback(c, s, t, 1.5);
      t.stun = Math.max(t.stun, 0.6 + l * 0.2);
    },
    mo_rajada(c, s, t, l, en, al, wb) {
      if (!t) return;
      wb(t);
      for (let i = 0; i < 3 + l && !t.dead; i++) dealDamage(c, s, t, 20 + l * 10 + s.stats.ad * 0.4, 'physical', c.rng.next() < s.stats.critChance);
    },
    al_frasco(c, s, t, l, en, al, wb) {
      if (!t) return;
      shock(c, t.x, t.y, 1.6, '#06b6d4'); particles(c, t.x, t.y, '#67e8f9', 16);
      for (const e of en) if (Math.hypot(e.x - t.x, e.y - t.y) <= 1.6) { e.stats.armor = Math.max(0, e.stats.armor - l * 10); wb(e); dealDamage(c, s, e, 70 + l * 35 + s.stats.ap * 0.9, 'magic'); }
    },
    al_nevoa(c, s, t, l, en) {
      const cx = t ? t.x : s.x, cy = t ? t.y : s.y;
      shock(c, cx, cy, 2.0, '#a3e635'); particles(c, cx, cy, '#a3e635', 20);
      for (const e of en) if (Math.hypot(e.x - cx, e.y - cy) <= 2.0) { e.bleed = 4; e.bleedDps = Math.max(e.bleedDps, 15 + l * 10 + s.stats.ap * 0.2); e.bleedSrc = s; }
    },
    bd_hino(c, s, t, l, en, al) {
      shock(c, s.x, s.y, 3.0, '#f472b6');
      for (const a of al) { a.haste = Math.max(a.haste, 4); a.hasteMult = Math.max(a.haste > 0 ? a.hasteMult : 1, 1.2 + l * 0.1); }
    },
    bd_balada(c, s, t, l, en, al) {
      sfx('heal'); shock(c, s.x, s.y, 3.0, '#f9a8d4');
      for (const a of al) if (Math.hypot(a.x - s.x, a.y - s.y) <= 3) { heal(c, s, a, 60 + l * 30 + s.stats.ap * 0.6); if (!a.isSummon) a.mana = Math.min(a.stats.maxMana, a.mana + 15); }
    },
    ne_erguer(c, s, t, l) {
      for (let i = 0; i < (l >= 3 ? 2 : 1); i++) summon(c, s, { name: 'Esqueleto', symbol: '💀', color: '#cbd5e1', archetypeId: 'berserker', level: l,
        hp: 200 + l * 100 + Math.round(s.stats.ap * 0.8), ad: 30 + l * 15 + Math.round(s.stats.ap * 0.25), extra: { moveSpeed: 2.5, armor: 14 + l * 5 } });
    },
    ne_drenar(c, s, t, l) {
      if (!t) return;
      beam(c, s.x, s.y, t.x, t.y, '#6366f1');
      const dealt = dealDamage(c, s, t, 90 + l * 45 + s.stats.ap, 'magic');
      if (dealt) heal(c, s, s, dealt * 0.5);
    }
  });

  function castSkill(c, s, target, isEcho = false) {
    if (!isEcho) sfx('magic');
    if (s.team === 'player' && c.relics.has('pato_borracha') && c.rng.chance(0.12)) { text(c, s.x, s.y - 0.9, 'QUACK! 🦆', '#fde047', 1.1); sfx('quack'); }
    s.casts++;
    if (s.team === 'player' && c.relics.has('orbe_sobrecarga')) s.stats.ap = Math.round(s.stats.ap * 1.12);
    if (s.stats.manaRefund > 0) s.mana = Math.min(s.stats.maxMana, s.mana + s.stats.manaRefund);
    const actives = Object.keys(s.skills).filter(id => s.skills[id] > 0 && D.SKILLS[id] && D.SKILLS[id].type === 'ativa');
    const id = actives.length ? actives[s.castIdx % actives.length] : (D.ARCHETYPES[s.archetypeId] || {}).signatureSkill;
    if (!isEcho) s.castIdx++;
    const lvl = s.skills[id] || 1;
    const sk = D.SKILLS[id];
    if (sk) text(c, s.x, s.y - 0.55, `${sk.icon} ${sk.name}${isEcho ? ' (Eco)' : ''}`, '#38bdf8', 1.0);
    const en = alive(c, s.team === 'player' ? 'enemy' : 'player');
    const al = alive(c, s.team);
    const wb = (e) => { if (s.stats.chillAmt > 0 && e) { e.chill = Math.max(e.chill, 3); e.chillFactor = Math.max(e.chillFactor, s.stats.chillAmt); } };
    const fn = SKILL_FX[id];
    if (fn) fn(c, s, target && !target.dead ? target : en[0], lvl, en, al, wb);
    if (!isEcho && s.team === 'player' && c.relics.has('anel_eco') && c.rng.chance(0.2)) castSkill(c, s, target, true);
  }

  // ----- Chefes -----
  function setArcontePhase(c, u, phase) {
    if (!u.ss.base) u.ss.base = { tr: u.stats.trueDmgBonus, ls: u.stats.lifesteal };
    u.ss.phase = phase;
    u.stats.trueDmgBonus = u.ss.base.tr + (phase === 'solar' ? 0.4 : 0);
    u.stats.lifesteal = u.ss.base.ls + (phase === 'lunar' ? 0.4 : 0);
    u.color = phase === 'solar' ? '#facc15' : '#c084fc';
    text(c, u.x, u.y - 0.7, phase === 'solar' ? '☀️ FASE SOLAR' : '🌙 FASE LUNAR', u.color, 1.25);
  }

  const BOSS_SCRIPTS = {
    ferreiro(c, u, dt) {
      const ss = u.ss;
      ss.t = (ss.t || 0) + dt;
      if (ss.t >= 8) {
        ss.t = 0;
        const ps = alive(c, 'player');
        if (ps.length) {
          // mira no ponto com mais unidades num raio de 2
          let best = ps[0], bn = 0;
          for (const p of ps) { const n = ps.filter(q => Math.hypot(q.x - p.x, q.y - p.y) <= 2).length; if (n > bn) { bn = n; best = p; } }
          shock(c, best.x, best.y, 2.0, '#f59e0b'); particles(c, best.x, best.y, '#fbbf24', 30);
          text(c, best.x, best.y - 0.8, '⚒️ MARTELADA!', '#fbbf24', 1.3); sfx('bossGong');
          for (const p of ps) if (Math.hypot(p.x - best.x, p.y - best.y) <= 2) { p.stun = Math.max(p.stun, 1); applyRaw(c, p, Math.round(p.stats.maxHp * 0.14), u, { t: 'MARTELADA', color: '#fbbf24' }); }
        }
      }
      for (const [k, th] of [['s1', 0.70], ['s2', 0.35]]) {
        if (!ss[k] && u.hp < u.stats.maxHp * th) {
          ss[k] = true;
          const els = c.rng.shuffle(['fogo', 'agua', 'pedra', 'ar', 'solar', 'lunar']).slice(0, 2);
          for (const el of els) summon(c, u, { name: `Avatar de ${D.ELEMENTS[el].name}`, symbol: D.ELEMENTS[el].icon, color: D.ELEMENTS[el].color, archetypeId: 'berserker',
            hp: Math.round(u.stats.maxHp * 0.10), ad: Math.round(u.stats.ad * 0.40), extra: { armor: 30, moveSpeed: 2.4, lifesteal: el === 'lunar' ? 0.3 : 0 } });
          FE.Bus.emit('clog', { t: '⚒️ O Ferreiro forja Avatares Elementais!', type: 'danger' });
        }
      }
      if (!ss.final && u.hp < u.stats.maxHp * 0.25) {
        ss.final = true;
        u.stats.attackSpeed *= 1.6; u.shield += Math.round(u.stats.maxHp * 0.15); u.color = '#ef4444';
        shock(c, u.x, u.y, 4, '#ef4444'); text(c, u.x, u.y - 0.8, '🔥 FORJA FINAL!', '#ef4444', 1.4); sfx('bossGong');
        FE.Bus.emit('clog', { t: '🔥 Forja Final! O Ferreiro acelera seus golpes.', type: 'danger' });
      }
    },
    colosso(c, u) {
      if (!u.ss.enraged && u.hp < u.stats.maxHp * 0.5) {
        u.ss.enraged = true;
        u.stats.ad = Math.round(u.stats.ad * 1.5); u.stats.attackSpeed *= 1.3;
        u.shield += Math.round(u.stats.maxHp * 0.15); u.color = '#ef4444';
        shock(c, u.x, u.y, 3.0, '#ef4444'); particles(c, u.x, u.y, '#f97316', 30);
        text(c, u.x, u.y - 0.8, '🔥 FÚRIA ÍGNEA!', '#f97316', 1.4);
        sfx('bossGong'); FE.Bus.emit('clog', { t: '🗿 O Colosso entrou em Fúria Ígnea!', type: 'danger' });
      }
    },
    leviata(c, u, dt) {
      u.ss.t = (u.ss.t || 0) + dt;
      if (u.ss.t >= 9) {
        u.ss.t = 0;
        for (let i = 0; i < 2; i++) summon(c, u, { name: 'Cria das Marés', symbol: '🐟', color: '#0ea5e9', archetypeId: 'berserker',
          hp: Math.round(u.stats.maxHp * 0.08), ad: Math.round(u.stats.ad * 0.35), extra: { moveSpeed: 2.6, armor: 15 } });
        text(c, u.x, u.y - 0.7, '🌊 Crias das Marés!', '#38bdf8', 1.2);
      }
      if (!u.ss.wave && u.hp < u.stats.maxHp * 0.5) {
        u.ss.wave = true;
        shock(c, u.x, u.y, 6, '#38bdf8'); sfx('bossGong');
        FE.Bus.emit('clog', { t: '🐉 O Leviatã invocou um Maremoto!', type: 'danger' });
        for (const p of alive(c, 'player')) { p.chill = 4; p.chillFactor = 0.45; dealDamage(c, u, p, p.stats.maxHp * 0.06, 'magic'); }
      }
    },
    arconte(c, u, dt) {
      u.ss.t = (u.ss.t || 0) + dt;
      if (u.ss.t >= 10) { u.ss.t = 0; setArcontePhase(c, u, u.ss.phase === 'solar' ? 'lunar' : 'solar'); }
      if (!u.ss.eclipse && u.hp < u.stats.maxHp * 0.3) {
        u.ss.eclipse = true;
        shock(c, u.x, u.y, 8, '#9333ea'); sfx('bossGong');
        FE.Bus.emit('clog', { t: '👁️ ECLIPSE TOTAL! Todo o seu time sofre 20% da Vida.', type: 'danger' });
        for (const p of alive(c, 'player')) applyRaw(c, p, Math.round(p.stats.maxHp * 0.2), u, { t: 'ECLIPSE', color: '#c084fc', scale: 1.1 });
      }
    }
  };

  function chooseTarget(u, opps) {
    let best = null, bd = Infinity;
    if (u.archetypeId === 'sombra' && !u.isSummon) {
      for (const o of opps) { if (o.hp < bd) { bd = o.hp; best = o; } }
      return best;
    }
    if (u.archetypeId === 'cacador' && !u.isSummon) {
      let lowest = null, lr = Infinity;
      for (const o of opps) {
        if (Math.hypot(o.x - u.x, o.y - u.y) <= u.stats.range) { const r = o.hp / o.stats.maxHp; if (r < lr) { lr = r; lowest = o; } }
      }
      if (lowest) return lowest;
    }
    for (const o of opps) { const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  function updateCombat(c, dt) {
    if (c.over) return;
    c.time += dt;
    const players = c.units.filter(u => u.team === 'player' && !u.dead && !u.isSummon);
    const enemies = alive(c, 'enemy');
    if (!players.length || !enemies.length) {
      c.over = true;
      c.result = { won: players.length > 0, survivors: enemies.filter(e => !e.isSummon).length, time: c.time };
      return;
    }

    // Tempestade da Forja: evita impasses após 45s
    let storm = 0;
    if (c.time > 50) {
      storm = (c.time - 50) * 0.004;
      if (!c.overtimeAnnounced) { c.overtimeAnnounced = true; FE.Bus.emit('clog', { t: '⛈️ Tempestade da Forja! Todos sofrem dano crescente.', type: 'danger' }); }
    }

    const allPlayers = alive(c, 'player');
    c.maxPlayerSummons = Math.max(c.maxPlayerSummons, allPlayers.filter(u => u.isSummon).length);
    const units = c.units.slice();
    for (const u of units) {
      if (u.dead) continue;
      u.displayHp += (u.hp - u.displayHp) * Math.min(1, dt * 10);
      u.lungeX *= Math.pow(0.05, dt); u.lungeY *= Math.pow(0.05, dt);
      if (!u.isSummon && u.stats.manaRegen > 0) u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.manaRegen * dt);
      if (u.stats.regenPct > 0) u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * u.stats.regenPct * dt);
      const tile = tileOf(c, u.x, u.y);
      if (tile === 'L') { applyRaw(c, u, u.stats.maxHp * 0.03 * dt, null, null); if (Math.random() < dt * 3) particles(c, u.x, u.y, '#f97316', 1); if (u.dead) continue; }
      if (storm > 0) { applyRaw(c, u, u.stats.maxHp * storm * dt, null, null); if (u.dead) continue; }
      if (u.burn > 0) { u.burn -= dt; applyRaw(c, u, u.burnDps * dt, u.burnSrc, null); if (Math.random() < dt * 4) particles(c, u.x, u.y, '#f97316', 1); if (u.dead) continue; }
      if (u.bleed > 0) { u.bleed -= dt; applyRaw(c, u, u.bleedDps * dt, u.bleedSrc, null); if (u.dead) continue; }
      if (u.chill > 0) { u.chill -= dt; if (u.chill <= 0) u.chillFactor = 0; }
      if (u.haste > 0) u.haste -= dt;
      if (u.script && BOSS_SCRIPTS[u.script]) { BOSS_SCRIPTS[u.script](c, u, dt); if (u.dead) continue; }
      if (u.stats.auraHeal > 0) {
        u.auraT += dt;
        if (u.auraT >= 1) { u.auraT -= 1; for (const a of alive(c, u.team)) if (a.hp < a.stats.maxHp && Math.hypot(a.x - u.x, a.y - u.y) <= 2.5) heal(c, u, a, u.stats.auraHeal); }
      }
      if (u.stun > 0) { u.stun -= dt; continue; }

      const opps = u.team === 'player' ? enemies.filter(e => !e.dead) : allPlayers.filter(p => !p.dead);
      const tgt = chooseTarget(u, opps);
      if (!tgt) continue;
      const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);

      const range = u.stats.range + (u.stats.range > 2.3 && tile === 'H' ? 1 : 0);
      if (dist <= range) {
        let mult = 1;
        if (u.archetypeId === 'berserker' && !u.isSummon) mult += (1 - u.hp / u.stats.maxHp) * 0.55;
        if (u.chill > 0) mult *= 1 - u.chillFactor;
        if (u.haste > 0) mult *= u.hasteMult;
        u.attackCooldown -= dt * u.stats.attackSpeed * mult;
        if (u.attackCooldown <= 0) {
          u.attackCooldown = 1.0;
          if (!u.isSummon && u.mana >= u.stats.maxMana) { u.mana = 0; castSkill(c, u, tgt); }
          else {
            u.attackCounter++;
            const crit = c.rng.next() < u.stats.critChance;
            const dmg = u.stats.ad * (crit ? u.stats.critDmg : 1);
            if (!u.isSummon) u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.manaPerAttack);
            if (u.stats.range <= 2.3) {
              const dx = tgt.x - u.x, dy = tgt.y - u.y, len = Math.max(0.01, Math.hypot(dx, dy));
              u.lungeX = dx / len * 0.26; u.lungeY = dy / len * 0.26;
              if (c.fxOn && c.fx.slashes.length < 60) c.fx.slashes.push({ x: tgt.x, y: tgt.y, a: Math.atan2(dy, dx), color: crit ? '#facc15' : u.color, life: 0.18, maxLife: 0.18, big: crit });
              sfx('hit', crit); dealDamage(c, u, tgt, dmg, 'physical', crit);
            } else {
              c.fx.projectiles.push({ x: u.x, y: u.y, target: tgt, attacker: u, speed: 8, dmg, crit, color: u.color });
            }
            if (u.stats.chainTargets > 0 && u.attackCounter % 4 === 0) {
              let prev = tgt;
              const cd = Math.round(u.stats.ad * 0.55 + u.stats.ap * 0.45);
              for (const o of opps.filter(o => !o.dead && o !== tgt).slice(0, u.stats.chainTargets - 1)) { beam(c, prev.x, prev.y, o.x, o.y, '#34d399'); dealDamage(c, u, o, cd, 'magic'); prev = o; }
            }
          }
        }
      } else if (u.stats.moveSpeed > 0) {
        let wx = tgt.x, wy = tgt.y;
        if (!lineClear(c, u.x, u.y, tgt.x, tgt.y)) {
          u.pathT = (u.pathT || 0) - dt;
          if (u.pathT <= 0 || !u.wp || Math.hypot(u.wp.x - u.x, u.wp.y - u.y) < 0.2) { u.pathT = 0.35; u.wp = nextStep(c, Math.floor(u.x), Math.floor(u.y), Math.floor(tgt.x), Math.floor(tgt.y)); }
          if (u.wp) { wx = u.wp.x; wy = u.wp.y; }
        } else u.wp = null;
        const dx = wx - u.x, dy = wy - u.y, d = Math.max(0.01, Math.hypot(dx, dy));
        let ms = u.stats.moveSpeed * (u.chill > 0 ? 1 - u.chillFactor * 0.5 : 1) * (tile === 'S' ? 0.55 : 1);
        let vx = dx / d * ms, vy = dy / d * ms;
        for (const o of c.units) {
          if (o.dead || o === u) continue;
          const ox = u.x - o.x, oy = u.y - o.y, od = Math.hypot(ox, oy);
          if (od > 0.001 && od < 0.7) { const push = (0.7 - od) * 3.2; vx += ox / od * push; vy += oy / od * push; }
        }
        const nx = clamp(u.x + vx * dt, 0.4, C.COLS - 0.4), ny = clamp(u.y + vy * dt, 0.4, C.ROWS - 0.4);
        if (!blockedAt(c, nx, ny)) { u.x = nx; u.y = ny; }
        else if (!blockedAt(c, nx, u.y)) u.x = nx;
        else if (!blockedAt(c, u.x, ny)) u.y = ny;
      }
    }

    // Projéteis (afetam a lógica)
    const P = c.fx.projectiles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      if (!p.target || p.target.dead) { P.splice(i, 1); continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
      if (d <= 0.25) { sfx('hit', p.crit); dealDamage(c, p.attacker, p.target, p.dmg, 'physical', p.crit); particles(c, p.x, p.y, p.color, 5); P.splice(i, 1); }
      else { p.px = p.x; p.py = p.y; p.x += dx / d * p.speed * dt; p.y += dy / d * p.speed * dt; }
    }
  }

  function updateFx(c, dt) {
    const f = c.fx;
    for (let i = f.particles.length - 1; i >= 0; i--) { const p = f.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) f.particles.splice(i, 1); }
    for (let i = f.shockwaves.length - 1; i >= 0; i--) { const s = f.shockwaves[i]; s.life -= dt; s.radius = 0.15 + (1 - Math.max(0, s.life / s.maxLife)) * s.maxRadius; if (s.life <= 0) f.shockwaves.splice(i, 1); }
    for (let i = f.beams.length - 1; i >= 0; i--) { f.beams[i].life -= dt; if (f.beams[i].life <= 0) f.beams.splice(i, 1); }
    for (let i = f.texts.length - 1; i >= 0; i--) { const t = f.texts[i]; t.y += t.vy * dt; t.life -= dt; if (t.life <= 0) f.texts.splice(i, 1); }
    for (let i = f.slashes.length - 1; i >= 0; i--) { f.slashes[i].life -= dt; if (f.slashes[i].life <= 0) f.slashes.splice(i, 1); }
    for (let i = f.ghosts.length - 1; i >= 0; i--) { const g = f.ghosts[i]; g.y -= dt * 0.6; g.life -= dt; if (g.life <= 0) f.ghosts.splice(i, 1); }
    f.shake = Math.max(0, f.shake - dt * 30);
    for (const u of c.units) if (u.flash > 0) u.flash -= dt;
  }

  /* Relatório pós-combate por unidade do jogador (invocações creditadas ao dono) */
  function combatReport(c) {
    return c.units.filter(u => u.team === 'player' && !u.isSummon).map(u => ({
      rosterId: u.rosterId, name: u.name, symbol: u.symbol, color: u.color,
      dmgDealt: Math.round(u.dmgDealt), dmgTaken: Math.round(u.dmgTaken), healDone: Math.round(u.healDone),
      kills: u.kills, casts: u.casts, survived: !u.dead
    }));
  }

  /* ======================================================================
     4. ESCALA DE PODER
     Poder de uma unidade = √(vida efetiva × dano por segundo). Poder de um
     time = (Σ poder)² — lei quadrática de Lanchester: dobrar o número de
     unidades iguais quadruplica a força em combate.
     ====================================================================== */
  function unitPower(s) {
    const ehp = (s.maxHp + (s.initialShield || 0)) * (1 + Math.max(0, s.armor) / 100)
      / Math.max(0.3, 1 - (s.dodge || 0)) / Math.max(0.4, 1 - (s.dmgReduction || 0)) * (1 + (s.regenPct || 0) * 12);
    const crit = 1 + Math.min(0.95, s.critChance || 0) * Math.max(0, (s.critDmg || 1.75) - 1);
    const atk = s.ad * s.attackSpeed * crit;
    const mag = s.ap * s.attackSpeed * 0.55 * (1 + (s.manaRegen || 0) / 12);
    const dps = (atk + mag) * (1 + (s.trueDmgBonus || 0)) * (s.dmgDealtMult || 1) * (1 + (s.lifesteal || 0) * 0.5);
    return Math.sqrt(Math.max(1, ehp) * Math.max(1, dps));
  }
  function teamPower(statsList) {
    const sum = statsList.reduce((a, s) => a + unitPower(s), 0);
    return Math.round(sum * sum / 100);
  }

  FE.Engine = {
    unitPower, teamPower,
    computeStats, synergyTier, orderTier, generateActMap, generateHorde, rollAffix,
    generateTerrain, terrainAt, tileBlocked, nearestPassable, COOP_SCALE: CO,
    createCombat, updateCombat, updateFx, combatReport
  };
})(typeof window !== 'undefined' ? window : globalThis);
