/* ==========================================================================
   FORJA ELEMENTAL 2.1 — achievements.js
   Conquistas permanentes (salvas na meta). Cada conquista declara em quais
   eventos é testada ('state' = qualquer mudança salva, 'combat' = fim de
   combate, 'end' = fim de expedição) e quantos Fragmentos Astrais rende.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE, D = FE.Data, E = FE.Engine, G = FE.Game;

  const activeOrders = () => Object.values(D.ORDERS).filter(o => E.orderTier(G.orderCounts()[o.id], o) > 0);
  const LAYOUT_COUNT = Object.keys(D.LAYOUTS).length;
  const ARCH_COUNT = Object.keys(D.ARCHETYPES).length;

  const LIST = [
    { id: 'primeiro_sangue', icon: '🗡️', name: 'Primeiro Sangue', reward: 10, desc: 'Vença seu primeiro combate.', on: ['combat'], test: ev => ev.won },
    { id: 'colosso', icon: '🗿', name: 'Quebra-Pedras', reward: 20, desc: 'Derrote o Colosso de Obsidiana (Chefe do Ato I).', on: ['combat'], test: ev => ev.won && ev.roomType === 'chefe' && ev.act === 1 },
    { id: 'leviata', icon: '🐉', name: 'Domador de Marés', reward: 30, desc: 'Derrote o Leviatã das Marés (Chefe do Ato II).', on: ['combat'], test: ev => ev.won && ev.roomType === 'chefe' && ev.act === 2 },
    { id: 'arconte', icon: '👁️', name: 'Fim do Eclipse', reward: 60, desc: 'Vença uma expedição completa.', on: ['end'], test: ev => ev.victory },
    { id: 'lobo', icon: '🐺', name: 'Lobo Solitário', reward: 30, desc: 'Vença um combate a partir da Sala 5 com apenas 1 unidade em campo.', on: ['combat'], test: ev => ev.won && ev.room >= 5 && ev.boardSize === 1 },
    { id: 'legiao', icon: '🚩', name: 'Legião', reward: 30, desc: 'Vença um combate com 12 ou mais unidades em campo.', on: ['combat'], test: ev => ev.won && ev.boardSize >= 12 },
    { id: 'impecavel', icon: '💎', name: 'Impecável', reward: 40, desc: 'Derrote um Chefe sem perder nenhuma unidade.', on: ['combat'], test: ev => ev.won && ev.roomType === 'chefe' && ev.losses === 0 },
    { id: 'relampago', icon: '⚡', name: 'Relâmpago', reward: 20, desc: 'Vença um combate a partir da Sala 5 em menos de 10 segundos.', on: ['combat'], test: ev => ev.won && ev.room >= 5 && ev.time < 10 },
    { id: 'exercito', icon: '💀', name: 'Exército de Sombras', reward: 25, desc: 'Tenha 5 invocações aliadas vivas ao mesmo tempo.', on: ['combat'], test: ev => ev.maxSummons >= 5 },
    { id: 'carrasco', icon: '🪓', name: 'Carrasco', reward: 25, desc: 'Uma única unidade causa 4000+ de dano num combate.', on: ['combat'], test: ev => ev.report.some(x => x.dmgDealt >= 4000) },
    { id: 'muralha', icon: '🧱', name: 'Muralha Viva', reward: 25, desc: 'Uma unidade absorve 4000+ de dano e sobrevive.', on: ['combat'], test: ev => ev.report.some(x => x.dmgTaken >= 4000 && x.survived) },
    { id: 'elemental8', icon: '🌈', name: 'Mestre Elemental', reward: 30, desc: 'Alcance 8 stacks de um mesmo elemento em campo.', on: ['state'], test: () => Object.values(G.synergyCounts()).some(n => n >= 8) },
    { id: 'prisma', icon: '🔮', name: 'Prisma Vivo', reward: 30, desc: 'Tenha 4 sinergias elementais ativas ao mesmo tempo.', on: ['state'], test: () => Object.values(G.synergyCounts()).filter(n => E.synergyTier(n) > 0).length >= 4 },
    { id: 'ordem_max', icon: '🏰', name: 'Ordem Suprema', reward: 30, desc: 'Alcance o nível máximo de qualquer Classe ou Origem.', on: ['state'], test: () => Object.values(D.ORDERS).some(o => E.orderTier(G.orderCounts()[o.id], o) === o.thresholds.length) },
    { id: 'diplomata', icon: '🎭', name: 'Diplomata', reward: 25, desc: 'Tenha 5 Classes/Origens ativas ao mesmo tempo.', on: ['state'], test: () => activeOrders().length >= 5 },
    { id: 'obra_prima', icon: '⭐', name: 'Obra-Prima', reward: 25, desc: 'Possua um item ★★★.', on: ['state'], test: (ev, r) => [...r.bag, ...G.allUnits().flatMap(u => u.items)].some(i => i.tier >= 3) },
    { id: 'colecionador', icon: '🏺', name: 'Colecionador', reward: 30, desc: 'Reúna 6 relíquias numa única expedição.', on: ['state'], test: (ev, r) => r.relics.length >= 6 },
    { id: 'veterano', icon: '🎖️', name: 'Veterano', reward: 25, desc: 'Leve uma unidade ao Nível 10.', on: ['state'], test: () => G.allUnits().some(u => u.level >= 10) },
    { id: 'maestria', icon: '📘', name: 'Maestria', reward: 10, desc: 'Aprimore uma habilidade até o Nv.3.', on: ['state'], test: () => G.allUnits().some(u => Object.values(u.skills).some(l => l >= 3)) },
    { id: 'tesouro', icon: '💰', name: 'Dragão do Tesouro', reward: 20, desc: 'Acumule 500g ao mesmo tempo.', on: ['state'], test: (ev, r) => r.gold >= 500 },
    { id: 'recrutador', icon: '🧭', name: 'Recrutador', reward: 40, desc: `Recrute todos os ${ARCH_COUNT} arquétipos (somando todas as expedições).`, on: ['state'],
      test: (ev, r, m) => m.lifetime.recruited.length >= ARCH_COUNT, progress: m => [m.lifetime.recruited.length, ARCH_COUNT] },
    { id: 'cartografo', icon: '🗺️', name: 'Cartógrafo', reward: 50, desc: `Vença combates em todos os ${LAYOUT_COUNT} tipos de terreno.`, on: ['combat'],
      test: (ev, r, m) => m.lifetime.terrainsWon.length >= LAYOUT_COUNT, progress: m => [m.lifetime.terrainsWon.length, LAYOUT_COUNT] },
    { id: 'andarilho', icon: '🥾', name: 'Andarilho', reward: 25, desc: 'Visite 7 tipos de sala diferentes numa única expedição.', on: ['state'], test: (ev, r) => (r.roomTypesSeen || []).length >= 7 },
    { id: 'por_um_fio', icon: '❤️‍🩹', name: 'Por um Fio', reward: 50, desc: 'Vença uma expedição com a Cidadela abaixo de 25.', on: ['end'], test: (ev, r) => ev.victory && r.citadelHp < 25 },
    { id: 'invicto', icon: '🛡️', name: 'Invicto', reward: 80, desc: 'Vença uma expedição sem perder nenhum combate.', on: ['end'], test: (ev, r) => ev.victory && r.noLoss },
    { id: 'ascendente', icon: '🔥', name: 'Ascendente', reward: 60, desc: 'Vença uma expedição na Ascensão 3 ou superior.', on: ['end'], test: (ev, r) => ev.victory && r.ascension >= 3 },
    { id: 'lenda', icon: '👑', name: 'Lenda da Forja', reward: 100, desc: 'Vença uma expedição na Ascensão 5.', on: ['end'], test: (ev, r) => ev.victory && r.ascension >= 5 }
  ];

  const A = FE.Achievements = {
    list: LIST,
    unlocked: (id) => !!(G.meta && G.meta.ach[id]),
    count: () => LIST.filter(a => G.meta && G.meta.ach[a.id]).length,
    check(ev) {
      const m = G.meta, r = G.run;
      if (!m || !r) return;
      if (ev.type === 'combat' && ev.won) {
        if (ev.layout && !m.lifetime.terrainsWon.includes(ev.layout)) m.lifetime.terrainsWon.push(ev.layout);
        if (ev.roomType === 'chefe') m.lifetime.bossesKilled++;
      }
      let dirty = false;
      for (const a of LIST) {
        if (m.ach[a.id] || !a.on.includes(ev.type)) continue;
        let ok = false;
        try { ok = a.test(ev, r, m); } catch (_) { ok = false; }
        if (!ok) continue;
        m.ach[a.id] = Date.now(); m.astralShards += a.reward; dirty = true;
        FE.Bus.emit('achievement', a);
      }
      if (dirty || ev.type !== 'state') G.saveMeta();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
