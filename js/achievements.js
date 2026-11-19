/* ==========================================================================
   FORJA ELEMENTAL 2.2 — achievements.js
   Conquistas permanentes (salvas na meta), organizadas por categoria.
   Cada uma declara em quais eventos é testada:
     'state'  = qualquer mudança salva      'combat' = fim de combate
     'end'    = fim de expedição            'secret' = easter egg encontrado
     'rename' / 'gift' = ações específicas
   Conquistas `hidden` aparecem como "???" até serem desbloqueadas.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE, D = FE.Data, E = FE.Engine, G = FE.Game;

  const activeOrders = () => Object.values(D.ORDERS).filter(o => E.orderTier(G.orderCounts()[o.id], o) > 0);
  const LAYOUT_COUNT = Object.keys(D.LAYOUTS).length;
  const ARCH_COUNT = Object.keys(D.ARCHETYPES).length;
  const allItems = () => [...G.run.players.flatMap(p => p.bag), ...G.allUnits().flatMap(u => u.items)];
  const sec = (id) => (ev, r, m) => !!m.secrets[id];

  const CATEGORIES = [
    ['campanha', '🗺️ Campanha'], ['combate', '⚔️ Combate'], ['estrategia', '🧠 Estratégia'],
    ['colecao', '🏺 Coleção'], ['coop', '🤝 Cooperativo'], ['segredos', '🔍 Segredos']
  ];

  const LIST = [
    // Campanha
    { id: 'primeiro_sangue', cat: 'campanha', icon: '🗡️', name: 'Primeiro Sangue', reward: 10, desc: 'Vença seu primeiro combate.', on: ['combat'], test: ev => ev.won },
    { id: 'colosso', cat: 'campanha', icon: '🗿', name: 'Quebra-Pedras', reward: 20, desc: 'Derrote o Colosso de Obsidiana (Ato I).', on: ['combat'], test: ev => ev.won && ev.roomType === 'chefe' && ev.act === 1 },
    { id: 'leviata', cat: 'campanha', icon: '🐉', name: 'Domador de Marés', reward: 25, desc: 'Derrote o Leviatã das Marés (Ato II).', on: ['combat'], test: ev => ev.won && ev.roomType === 'chefe' && ev.act === 2 },
    { id: 'eclipse', cat: 'campanha', icon: '👁️', name: 'Fim do Eclipse', reward: 35, desc: 'Derrote o Arconte do Eclipse (Ato III).', on: ['combat'], test: ev => ev.won && ev.roomType === 'chefe' && ev.act === 3 },
    { id: 'reforjado', cat: 'campanha', icon: '⚒️', name: 'Mundo Reforjado', reward: 70, desc: 'Derrote o Ferreiro Primordial e conclua a campanha.', on: ['end'], test: ev => ev.victory },
    { id: 'ascendente', cat: 'campanha', icon: '🔥', name: 'Ascendente', reward: 60, desc: 'Vença uma expedição na Ascensão 3 ou superior.', on: ['end'], test: (ev, r) => ev.victory && r.ascension >= 3 },
    { id: 'lenda', cat: 'campanha', icon: '👑', name: 'Lenda da Forja', reward: 120, desc: 'Vença uma expedição na Ascensão 5.', on: ['end'], test: (ev, r) => ev.victory && r.ascension >= 5 },
    { id: 'por_um_fio', cat: 'campanha', icon: '❤️‍🩹', name: 'Por um Fio', reward: 50, desc: 'Vença uma expedição com a Cidadela abaixo de 25.', on: ['end'], test: (ev, r) => ev.victory && r.citadelHp < 25 },
    { id: 'invicto', cat: 'campanha', icon: '🛡️', name: 'Invicto', reward: 90, desc: 'Vença uma expedição sem perder nenhum combate.', on: ['end'], test: (ev, r) => ev.victory && r.noLoss },
    { id: 'diario', cat: 'campanha', icon: '📅', name: 'Rotina de Herói', reward: 25, desc: 'Chegue ao Ato III num Desafio Diário.', on: ['state', 'end'], test: (ev, r) => !!r.daily && r.act >= 3 },
    { id: 'maratona', cat: 'campanha', icon: '🏃', name: 'Maratonista', reward: 30, desc: 'Inicie 10 expedições.', on: ['state'], test: (ev, r, m) => m.records.runs >= 10, progress: m => [m.records.runs, 10] },

    // Combate
    { id: 'lobo', cat: 'combate', icon: '🐺', name: 'Lobo Solitário', reward: 30, desc: 'Vença um combate a partir da Sala 6 com apenas 1 unidade em campo.', on: ['combat'], test: ev => ev.won && ev.room >= 6 && ev.boardSize === 1 },
    { id: 'legiao', cat: 'combate', icon: '🚩', name: 'Legião', reward: 30, desc: 'Vença um combate com 12 ou mais unidades em campo.', on: ['combat'], test: ev => ev.won && ev.boardSize >= 12 },
    { id: 'impecavel', cat: 'combate', icon: '💎', name: 'Impecável', reward: 40, desc: 'Derrote um Chefe sem perder nenhuma unidade.', on: ['combat'], test: ev => ev.won && ev.roomType === 'chefe' && ev.losses === 0 },
    { id: 'relampago', cat: 'combate', icon: '⚡', name: 'Relâmpago', reward: 20, desc: 'Vença um combate a partir da Sala 6 em menos de 10 segundos.', on: ['combat'], test: ev => ev.won && ev.room >= 6 && ev.time < 10 },
    { id: 'tempestade', cat: 'combate', icon: '⛈️', name: 'Olho da Tempestade', reward: 20, desc: 'Vença um combate que durou mais de 50 segundos.', on: ['combat'], test: ev => ev.won && ev.time > 50 },
    { id: 'exercito', cat: 'combate', icon: '💀', name: 'Exército de Sombras', reward: 25, desc: 'Tenha 5 invocações aliadas vivas ao mesmo tempo.', on: ['combat'], test: ev => ev.maxSummons >= 5 },
    { id: 'carrasco', cat: 'combate', icon: '🪓', name: 'Carrasco', reward: 25, desc: 'Uma única unidade causa 5000+ de dano num combate.', on: ['combat'], test: ev => ev.report.some(x => x.dmgDealt >= 5000) },
    { id: 'muralha', cat: 'combate', icon: '🧱', name: 'Muralha Viva', reward: 25, desc: 'Uma unidade absorve 5000+ de dano e sobrevive.', on: ['combat'], test: ev => ev.report.some(x => x.dmgTaken >= 5000 && x.survived) },
    { id: 'anjo', cat: 'combate', icon: '😇', name: 'Anjo da Guarda', reward: 25, desc: 'Uma unidade cura/protege 3000+ num combate.', on: ['combat'], test: ev => ev.report.some(x => x.healDone >= 3000) },
    { id: 'cartografo', cat: 'combate', icon: '🗺️', name: 'Cartógrafo', reward: 50, desc: `Vença combates em todos os ${LAYOUT_COUNT} tipos de terreno.`, on: ['combat'],
      test: (ev, r, m) => m.lifetime.terrainsWon.length >= LAYOUT_COUNT, progress: m => [m.lifetime.terrainsWon.length, LAYOUT_COUNT] },

    // Estratégia
    { id: 'elemental8', cat: 'estrategia', icon: '🌈', name: 'Mestre Elemental', reward: 30, desc: 'Alcance 8 stacks de um mesmo elemento em campo.', on: ['state'], test: () => Object.values(G.synergyCounts()).some(n => n >= 8) },
    { id: 'prisma', cat: 'estrategia', icon: '🔮', name: 'Prisma Vivo', reward: 30, desc: 'Tenha 4 sinergias elementais ativas ao mesmo tempo.', on: ['state'], test: () => Object.values(G.synergyCounts()).filter(n => E.synergyTier(n) > 0).length >= 4 },
    { id: 'arco_iris', cat: 'estrategia', icon: '🏳️‍🌈', name: 'Arco-Íris', reward: 20, desc: 'Tenha os 6 elementos presentes em campo ao mesmo tempo.', on: ['state'], test: () => Object.values(G.synergyCounts()).every(n => n > 0) },
    { id: 'ordem_max', cat: 'estrategia', icon: '🏰', name: 'Ordem Suprema', reward: 30, desc: 'Alcance o nível máximo de qualquer Classe ou Origem.', on: ['state'], test: () => Object.values(D.ORDERS).some(o => E.orderTier(G.orderCounts()[o.id], o) === o.thresholds.length) },
    { id: 'diplomata', cat: 'estrategia', icon: '🎭', name: 'Diplomata', reward: 25, desc: 'Tenha 5 Classes/Origens ativas ao mesmo tempo.', on: ['state'], test: () => activeOrders().length >= 5 },
    { id: 'veterano', cat: 'estrategia', icon: '🎖️', name: 'Veterano', reward: 25, desc: 'Leve uma unidade ao Nível 10.', on: ['state'], test: () => G.allUnits().some(u => u.level >= 10) },
    { id: 'maestria', cat: 'estrategia', icon: '📘', name: 'Maestria', reward: 10, desc: 'Aprimore uma habilidade até o Nv.3.', on: ['state'], test: () => G.allUnits().some(u => Object.values(u.skills).some(l => l >= 3)) },
    { id: 'polimata', cat: 'estrategia', icon: '🧠', name: 'Polímata', reward: 30, desc: 'Tenha uma unidade com as 4 habilidades desbloqueadas.', on: ['state'], test: () => G.allUnits().some(u => G.arch(u).skills.every(s => (u.skills[s] || 0) > 0)) },
    { id: 'batismo', cat: 'estrategia', icon: '✏️', name: 'Batismo', reward: 5, desc: 'Dê um nome a uma unidade (clique no ✏️ do Inspetor).', on: ['rename'], test: () => true },

    // Coleção
    { id: 'obra_prima', cat: 'colecao', icon: '⭐', name: 'Obra-Prima', reward: 25, desc: 'Possua um item ★★★.', on: ['state'], test: () => allItems().some(i => i.tier >= 3) },
    { id: 'arsenal', cat: 'colecao', icon: '🗃️', name: 'Arsenal', reward: 20, desc: 'Tenha 10 itens ao mesmo tempo (equipados ou na mochila).', on: ['state'], test: () => allItems().length >= 10 },
    { id: 'colecionador', cat: 'colecao', icon: '🏺', name: 'Colecionador', reward: 30, desc: 'Reúna 7 relíquias numa única expedição.', on: ['state'], test: (ev, r) => r.relics.length >= 7 },
    { id: 'lendarias', cat: 'colecao', icon: '🌟', name: 'Toque de Lenda', reward: 35, desc: 'Tenha 3 relíquias lendárias numa expedição.', on: ['state'], test: (ev, r) => r.relics.filter(id => D.RELICS[id].rarity === 'lendaria').length >= 3 },
    { id: 'tesouro', cat: 'colecao', icon: '💰', name: 'Dragão do Tesouro', reward: 20, desc: 'Um jogador acumula 500g ao mesmo tempo.', on: ['state'], test: (ev, r) => r.players.some(p => p.gold >= 500) },
    { id: 'recrutador', cat: 'colecao', icon: '🧭', name: 'Recrutador', reward: 40, desc: `Recrute todos os ${ARCH_COUNT} arquétipos (somando todas as expedições).`, on: ['state'],
      test: (ev, r, m) => m.lifetime.recruited.length >= ARCH_COUNT, progress: m => [m.lifetime.recruited.length, ARCH_COUNT] },
    { id: 'andarilho', cat: 'colecao', icon: '🥾', name: 'Andarilho', reward: 25, desc: 'Visite os 8 tipos de sala numa única expedição.', on: ['state'], test: (ev, r) => (r.roomTypesSeen || []).length >= 8 },

    // Cooperativo
    { id: 'coop_vitoria', cat: 'coop', icon: '🤝', name: 'Irmãos de Armas', reward: 15, desc: 'Vença um combate no modo cooperativo.', on: ['combat'], test: ev => ev.won && ev.coop > 1 },
    { id: 'coop_chefe', cat: 'coop', icon: '🛡️', name: 'Frente Unida', reward: 30, desc: 'Derrote um Chefe no modo cooperativo.', on: ['combat'], test: ev => ev.won && ev.coop > 1 && ev.roomType === 'chefe' },
    { id: 'coop_campanha', cat: 'coop', icon: '🏆', name: 'Juntos até o Fim', reward: 80, desc: 'Conclua a campanha no modo cooperativo.', on: ['end'], test: ev => ev.victory && ev.coop > 1 },
    { id: 'quarteto', cat: 'coop', icon: '4️⃣', name: 'Quarteto Fantástico', reward: 100, desc: 'Conclua a campanha com 4 jogadores.', on: ['end'], test: ev => ev.victory && ev.coop === 4 },
    { id: 'generoso', cat: 'coop', icon: '🎁', name: 'Generosidade', reward: 10, desc: 'Doe ouro ou um item a outro jogador.', on: ['gift'], test: () => true },
    { id: 'harmonia', cat: 'coop', icon: '🎼', name: 'Harmonia Total', reward: 30, desc: 'No co-op, ative 6 Classes/Origens ao mesmo tempo.', on: ['state'], test: (ev, r) => r.players.length > 1 && activeOrders().length >= 6 },
    { id: 'equilibrio', cat: 'coop', icon: '⚖️', name: 'Equilíbrio Perfeito', reward: 30, desc: 'No co-op, vença um combate em que todos os jogadores causaram dano parecido (±25%).', on: ['combat'],
      test: (ev) => {
        if (!ev.won || ev.coop < 2) return false;
        const by = Array(ev.coop).fill(0); ev.report.forEach(x => { by[x.owner] += x.dmgDealt; });
        const avg = by.reduce((a, b) => a + b, 0) / by.length; return avg > 500 && by.every(v => Math.abs(v - avg) <= avg * 0.25);
      } },

    // Segredos (escondidos)
    { id: 's_konami', cat: 'segredos', hidden: true, icon: '🕹️', name: 'Código Antigo', reward: 30, desc: 'Digitou a sequência lendária ↑↑↓↓←→←→BA e ativou o Modo Retrô.', hint: 'Um código que todo veterano conhece.', on: ['secret'], test: sec('konami') },
    { id: 's_bigorna', cat: 'segredos', hidden: true, icon: '🔨', name: 'Bigorna Teimosa', reward: 20, desc: 'Martelou o logotipo da Forja 7 vezes seguidas.', hint: 'O logotipo parece… martelável.', on: ['secret'], test: sec('bigorna') },
    { id: 's_galinha', cat: 'segredos', hidden: true, icon: '🐔', name: 'Galinheiro', reward: 25, desc: 'Iniciou uma expedição com a seed GALINHA.', hint: 'Algumas seeds escondem surpresas.', on: ['secret'], test: sec('galinha') },
    { id: 's_pato', cat: 'segredos', hidden: true, icon: '🦆', name: 'Depuração com Pato', reward: 30, desc: 'Conversou com o Pato de Borracha num Lago Silencioso.', hint: 'Mistérios raros acontecem perto da água.', on: ['secret'], test: sec('pato') },
    { id: 's_ovo', cat: 'segredos', hidden: true, icon: '🐣', name: 'Chocadeira', reward: 40, desc: 'Chocou o Ovo Dourado vencendo 3 combates com ele.', hint: 'Alguns ninhos guardam mais do que parece.', on: ['secret'], test: sec('chocadeira') },
    { id: 's_forja', cat: 'segredos', hidden: true, icon: '👂', name: 'Ouvido Atento', reward: 15, desc: 'Digitou F-O-R-J-A durante a preparação e ouviu marteladas distantes.', hint: 'Escreva o nome do lugar.', on: ['secret'], test: sec('forja') },
    { id: 's_bigorna_nome', cat: 'segredos', hidden: true, icon: '🪨', name: 'Nome de Pedra', reward: 15, desc: 'Batizou uma unidade de "Bigorna". Ela agradece.', hint: 'Que tal um nome… pesado?', on: ['secret'], test: sec('nome_bigorna') },
    { id: 's_creditos', cat: 'segredos', hidden: true, icon: '🎬', name: 'Até o Último Nome', reward: 15, desc: 'Assistiu aos créditos até o fim.', hint: 'Termine a campanha e tenha paciência.', on: ['secret'], test: sec('creditos') }
  ];

  const TITLES = [[0, 'Aprendiz da Forja'], [5, 'Escudeiro'], [12, 'Cavaleiro Elemental'], [20, 'Mestre-Ferreiro'], [30, 'Guardião da Forja'], [40, 'Lenda Imortal'], [LIST.length, 'Forjador de Mundos']];

  const A = FE.Achievements = {
    list: LIST, categories: CATEGORIES,
    unlocked: (id) => !!(G.meta && G.meta.ach[id]),
    count: () => LIST.filter(a => G.meta && G.meta.ach[a.id]).length,
    title() { const n = A.count(); let t = TITLES[0][1]; for (const [min, name] of TITLES) if (n >= min) t = name; return t; },
    nextTitle() { const n = A.count(); const nx = TITLES.find(([min]) => min > n); return nx ? { at: nx[0], name: nx[1] } : null; },
    check(ev) {
      const m = G.meta, r = G.run;
      if (!m) return;
      if (ev.type === 'combat' && ev.won && r) {
        if (ev.layout && !m.lifetime.terrainsWon.includes(ev.layout)) m.lifetime.terrainsWon.push(ev.layout);
        if (ev.roomType === 'chefe') m.lifetime.bossesKilled++;
      }
      let dirty = false;
      for (const a of LIST) {
        if (m.ach[a.id] || !a.on.includes(ev.type)) continue;
        if (!r && a.on.every(t => t !== 'secret')) continue;
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
