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
  function orderTier(count) {
    const t = C.ORDER_THRESHOLDS;
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
      auraHeal: 0, burnPct: 0, explodePct: 0, chillAmt: 0, chainTargets: 0, solarAuraReduce: 0, xpMult: 0, initialShieldPct: 0
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
      // 4. Ordens (classes)
      const arch2 = D.ARCHETYPES[unit.archetypeId];
      for (const ord of Object.values(D.ORDERS)) {
        const tier = orderTier((ctx.orders && ctx.orders[ord.id]) || 0);
        if (!tier) continue;
        const t = ord.tiers[tier - 1];
        const member = ord.members.includes(arch2.id);
        if (t.healAll) s.healPowerMult += t.healAll;
        if (!member) continue;
        if (t.hpPct) s.maxHp *= 1 + t.hpPct;
        if (t.armor) s.armor += t.armor;
        if (t.apPct) s.ap *= 1 + t.apPct;
        if (t.manaRegen) s.manaRegen += t.manaRegen;
        if (t.crit) s.critChance += t.crit;
        if (t.critDmg) s.critDmg += t.critDmg;
        if (t.startMana) s.startMana += t.startMana;
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
      if (has('egide_tita') && unit.row >= 4 && unit.row <= 5) { s.maxHp *= 1.35; s.armor += 25; }
      if (has('lente_atirador') && unit.row >= 6) { s.critChance += 0.25; s.range += 1.0; }
      if (has('bencao_celestial')) s.healPowerMult *= 1.40;
      if (has('coracao_forja') && items.length > 0) { const bo = 1 + items.length * 0.15; s.maxHp *= bo; s.ad *= bo; s.ap *= bo; }
      if (has('escudo_vigia')) s.initialShieldPct += 0.12;
      if (has('presa_vampira')) s.lifesteal += 0.10;
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
      let count = f === 5 ? 1 : (f === 1 ? 2 : rng.int(2, 3));
      if (f >= 2 && f <= 4 && rng.chance(0.25)) count = Math.min(4, count + 1);
      const nodes = [];
      for (let i = 0; i < count; i++) {
        let type;
        if (f === 5) type = 'chefe';
        else if (f === 1) type = 'combate';
        else if (f === 4 && i === count - 1) type = 'acampamento';
        else type = rng.weighted([['combate', 38], ['elite', asc >= 3 ? 24 : 16], ['misterio', 14], ['forja', 9], ['santuario', 8], ['acampamento', 6], ['mercador', 9]]);
        const room = (act - 1) * C.ROOMS_PER_ACT + f;
        nodes.push({ id: `a${act}f${f}n${i}`, act, floor: f, index: i, type, room,
          affix: (type === 'combate' || type === 'elite') ? rollAffix(rng, room) : 'padrao', next: [] });
      }
      floors.push(nodes);
    }
    // Garante ao menos 1 combate/elite no andar 2 para não travar o ganho de XP
    if (!floors[1].some(n => n.type === 'combate' || n.type === 'elite')) { floors[1][0].type = 'combate'; floors[1][0].affix = rollAffix(rng, floors[1][0].room); }
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

  function makeEnemyStats(arch, scale, mult = 0.82) {
    const st = arch.stats;
    return {
      maxHp: Math.round(st.maxHp * scale * mult), ad: Math.round(st.ad * scale * mult), ap: Math.round(st.ap * scale * mult),
      armor: Math.round(st.armor), attackSpeed: st.attackSpeed, range: st.range, critChance: st.critChance,
      moveSpeed: st.moveSpeed, maxMana: st.maxMana
    };
  }

  function generateHorde(rng, room, act, roomType, asc) {
    const enemies = [];
    const archKeys = Object.keys(D.ARCHETYPES);
    const elKeys = Object.keys(D.ELEMENTS);
    const fac = D.ACTS[act];
    const isBoss = roomType === 'chefe', isElite = roomType === 'elite';
    const count = isBoss ? Math.min(8, 2 + Math.floor(room * 0.32)) : Math.min(12, 2 + Math.floor(room * 0.6) + (isElite ? 1 : 0));
    const scale = 1 + (room - 1) * 0.14 + (isElite ? 0.15 : 0);

    const slots = [];
    for (let r = 3; r >= 0; r--) for (const c of rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7])) slots.push({ col: c, row: r });
    const reserved = (p) => (isBoss || isElite) && p.row === 1 && (p.col === 3 || p.col === 4);

    if (isBoss) {
      const bc = D.BOSSES[act];
      enemies.push({
        id: `boss_${room}`, name: bc.name, archetypeId: 'vanguarda', symbol: bc.symbol, color: bc.color,
        isBoss: true, isElite: true, level: Math.max(3, Math.floor(room * 0.95)), col: 3, row: 1,
        elements: { ...bc.elements }, skills: { ...bc.skills }, affixes: [], script: bc.script,
        baseStats: {
          maxHp: Math.round(820 * scale * bc.hpMult), ad: Math.round(52 * scale * bc.adMult), ap: Math.round(65 * scale * bc.apMult),
          armor: Math.round(35 + room * 3.5), attackSpeed: 0.85, range: 2.2, critChance: 0.20, moveSpeed: 1.9, maxMana: 85
        }
      });
    } else if (isElite) {
      const el1 = rng.pick(elKeys);
      const affs = rng.shuffle(Object.keys(D.ELITE_AFFIXES)).slice(0, act >= 2 ? 2 : 1);
      const archId = rng.pick(['berserker', 'vanguarda', 'lanceiro']);
      enemies.push({
        id: `elite_${room}`, name: `Comandante ${D.ELEMENTS[el1].name}`, archetypeId: archId, symbol: '👹', color: '#f59e0b',
        isBoss: false, isElite: true, level: Math.max(2, Math.floor(room * 0.85)), col: 3, row: 1,
        elements: { [el1]: 2 }, skills: { [D.ARCHETYPES[archId].signatureSkill]: 2, [D.ARCHETYPES[archId].skills[1]]: 1 }, affixes: affs,
        baseStats: { ...makeEnemyStats(D.ARCHETYPES[archId], scale, 1.0), maxHp: Math.round(740 * scale * 1.95), ad: Math.round(64 * scale * 1.3), armor: Math.round(28 + room * 2.5), range: Math.max(1.5, D.ARCHETYPES[archId].stats.range) }
      });
    }

    let si = 0;
    const frontPool = ['vanguarda', 'berserker', 'lanceiro'];
    for (let i = 0; i < count; i++) {
      while (si < slots.length && reserved(slots[si])) si++;
      if (si >= slots.length) break;
      const pos = slots[si++];
      const archKey = pos.row >= 2 && i < Math.ceil(count / 2) ? rng.pick(frontPool) : rng.pick(archKeys);
      const arch = D.ARCHETYPES[archKey];
      const els = {};
      if (room >= 2 && rng.chance(0.5)) els[rng.pick(elKeys)] = 1;
      if (asc >= 5 && room >= 3) { const e = rng.pick(elKeys); els[e] = (els[e] || 0) + 1; }
      const skills = { [arch.signatureSkill]: room >= 7 ? 2 : 1 };
      if (room >= 11) skills[arch.skills[1]] = 1;
      const [fname, fsym] = fac.faction[archKey];
      enemies.push({
        id: `e_${room}_${i}`, name: fname, archetypeId: archKey, symbol: fsym, color: fac.enemyColor,
        isBoss: false, isElite: false, level: Math.max(1, Math.floor(1 + (room - 1) * 0.45)), col: pos.col, row: pos.row,
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
      fx: { projectiles: [], particles: [], texts: [], shockwaves: [], beams: [] }
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
      const row = u.team === 'player' ? 0 : 7;
      const col = nearestFreeCol(c, row, Math.floor(u.x), u.uid);
      if (col !== -1) { particles(c, u.x, u.y, '#f43f5e', 10); u.x = col + 0.5; u.y = row + 0.5; particles(c, u.x, u.y, '#f43f5e', 14); }
    }
    return c;
  }

  function nearestFreeCol(c, row, pref, ignore) {
    for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7]) {
      const col = pref + off;
      if (col < 0 || col >= C.COLS) continue;
      if (!c.units.some(u => !u.dead && u.uid !== ignore && Math.floor(u.x) === col && Math.floor(u.y) === row)) return col;
    }
    return -1;
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
  function shock(c, x, y, r, color) { if (c.fxOn) c.fx.shockwaves.push({ x, y, radius: 0.15, maxRadius: r, color, life: 0.38, maxLife: 0.38 }); }
  function beam(c, x1, y1, x2, y2, color) { if (c.fxOn) c.fx.beams.push({ x1, y1, x2, y2, color, life: 0.22, maxLife: 0.22 }); }
  const sfx = (name, arg) => FE.Bus.emit('sfx', { name, arg });

  // ----- Dano, cura, escudo, morte -----
  function applyRaw(c, tgt, amount, src, vis) {
    if (!tgt || tgt.dead || amount <= 0) return 0;
    let rem = amount;
    if (tgt.shield > 0) { const ab = Math.min(tgt.shield, rem); tgt.shield -= ab; rem -= ab; }
    tgt.hp = Math.max(0, tgt.hp - rem);
    tgt.dmgTaken += amount;
    const credit = src ? (src.owner || src) : null;
    if (credit && credit.team !== tgt.team) credit.dmgDealt += amount;
    if (vis) text(c, tgt.x + (Math.random() - 0.5) * 0.25, tgt.y - 0.3, vis.t, vis.color, vis.scale || 1);
    if (tgt.hp <= 0 && !tgt.dead) handleDeath(c, src, tgt);
    return amount;
  }

  function dealDamage(c, att, tgt, raw, type = 'physical', crit = false, opts = {}) {
    if (!tgt || tgt.dead) return 0;
    if (type === 'physical' && !opts.noDodge && c.rng.next() < tgt.stats.dodge) { text(c, tgt.x, tgt.y - 0.35, 'ESQUIVA', '#38bdf8', 0.9); return 0; }
    let dmg = raw * (att ? att.stats.dmgDealtMult : 1);
    if (att) {
      const ratio = tgt.hp / tgt.stats.maxHp;
      if (att.stats.executeBonus > 0 && ratio < 0.45) dmg *= 1 + att.stats.executeBonus;
      if (att.stats.highHpBonus > 0 && ratio > 0.70) dmg *= 1 + att.stats.highHpBonus;
      let aura = 0;
      for (const u of c.units) {
        if (!u.dead && u.team !== att.team && u.stats.solarAuraReduce > 0 && Math.hypot(u.x - att.x, u.y - att.y) <= 2.2) aura = Math.max(aura, u.stats.solarAuraReduce);
      }
      dmg *= 1 - aura;
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
      owner.team, SUMMON_STATS(def.hp, def.ad, def.extra || {}), { isSummon: true, owner: owner.isSummon ? owner.owner : owner });
    u.x = clamp(owner.x + (c.rng.next() - 0.5) * 1.2, 0.5, C.COLS - 0.5);
    u.y = clamp(owner.y + (owner.team === 'player' ? -0.6 : 0.6), 0.5, C.ROWS - 0.5);
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

  function castSkill(c, s, target, isEcho = false) {
    if (!isEcho) sfx('magic');
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
    if (c.time > 45) {
      storm = (c.time - 45) * 0.004;
      if (!c.overtimeAnnounced) { c.overtimeAnnounced = true; FE.Bus.emit('clog', { t: '⛈️ Tempestade da Forja! Todos sofrem dano crescente.', type: 'danger' }); }
    }

    const allPlayers = alive(c, 'player');
    const units = c.units.slice();
    for (const u of units) {
      if (u.dead) continue;
      u.displayHp += (u.hp - u.displayHp) * Math.min(1, dt * 10);
      u.lungeX *= Math.pow(0.05, dt); u.lungeY *= Math.pow(0.05, dt);
      if (!u.isSummon && u.stats.manaRegen > 0) u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.manaRegen * dt);
      if (u.stats.regenPct > 0) u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * u.stats.regenPct * dt);
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

      if (dist <= u.stats.range) {
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
        const dx = tgt.x - u.x, dy = tgt.y - u.y, d = Math.max(0.01, dist);
        let ms = u.stats.moveSpeed * (u.chill > 0 ? 1 - u.chillFactor * 0.5 : 1);
        let vx = dx / d * ms, vy = dy / d * ms;
        for (const o of c.units) {
          if (o.dead || o === u) continue;
          const ox = u.x - o.x, oy = u.y - o.y, od = Math.hypot(ox, oy);
          if (od > 0.001 && od < 0.7) { const push = (0.7 - od) * 3.2; vx += ox / od * push; vy += oy / od * push; }
        }
        u.x = clamp(u.x + vx * dt, 0.4, C.COLS - 0.4);
        u.y = clamp(u.y + vy * dt, 0.4, C.ROWS - 0.4);
      }
    }

    // Projéteis (afetam a lógica)
    const P = c.fx.projectiles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      if (!p.target || p.target.dead) { P.splice(i, 1); continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
      if (d <= 0.25) { sfx('hit', p.crit); dealDamage(c, p.attacker, p.target, p.dmg, 'physical', p.crit); particles(c, p.x, p.y, p.color, 5); P.splice(i, 1); }
      else { p.x += dx / d * p.speed * dt; p.y += dy / d * p.speed * dt; }
    }
  }

  function updateFx(c, dt) {
    const f = c.fx;
    for (let i = f.particles.length - 1; i >= 0; i--) { const p = f.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) f.particles.splice(i, 1); }
    for (let i = f.shockwaves.length - 1; i >= 0; i--) { const s = f.shockwaves[i]; s.life -= dt; s.radius = 0.15 + (1 - Math.max(0, s.life / s.maxLife)) * s.maxRadius; if (s.life <= 0) f.shockwaves.splice(i, 1); }
    for (let i = f.beams.length - 1; i >= 0; i--) { f.beams[i].life -= dt; if (f.beams[i].life <= 0) f.beams.splice(i, 1); }
    for (let i = f.texts.length - 1; i >= 0; i--) { const t = f.texts[i]; t.y += t.vy * dt; t.life -= dt; if (t.life <= 0) f.texts.splice(i, 1); }
  }

  /* Relatório pós-combate por unidade do jogador (invocações creditadas ao dono) */
  function combatReport(c) {
    return c.units.filter(u => u.team === 'player' && !u.isSummon).map(u => ({
      rosterId: u.rosterId, name: u.name, symbol: u.symbol, color: u.color,
      dmgDealt: Math.round(u.dmgDealt), dmgTaken: Math.round(u.dmgTaken), healDone: Math.round(u.healDone),
      kills: u.kills, casts: u.casts, survived: !u.dead
    }));
  }

  FE.Engine = {
    computeStats, synergyTier, orderTier, generateActMap, generateHorde, rollAffix,
    createCombat, updateCombat, updateFx, combatReport
  };
})(typeof window !== 'undefined' ? window : globalThis);
