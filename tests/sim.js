// Simulação headless: joga N expedições com uma IA simples para validar
// regras, achar exceções e medir balanceamento. Uso: node tests/sim.js [runs] [ascensao]
const path = require('path');
globalThis.window = globalThis;
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
for (const f of ['core', 'data', 'engine', 'game']) require(path.join(__dirname, '..', 'js', f + '.js'));
const FE = globalThis.FE, G = FE.Game, D = FE.Data;

const RUNS = +process.argv[2] || 30, ASC = +process.argv[3] || 0;
G.loadMeta(); G.meta.maxAscension = 5;
const results = []; let errors = 0;

function aiPrep() {
  const r = G.run;
  // sobe o limite quando sobra ouro e compra unidades variadas
  const order = ['vanguarda', 'arcanista', 'clerigo', 'cacador', 'berserker', 'druida', 'lanceiro', 'artifice', 'sombra'];
  let guard = 0;
  while (r.gold >= 40 && guard++ < 10) {
    if (r.board.length >= r.teamLimit) { if (r.teamLimit < 7) G.setTeamLimit(r.teamLimit + 1); else break; }
    const arch = order[(r.nextUnitId - 1) % order.length];
    if (r.gold < G.recruitCost(arch)) break;
    G.buy(arch);
  }
  while (r.bag.length && r.board.some(u => u.items.length < 3)) { const u = r.board.find(u => u.items.length < 3); G.equip(0, u.id); }
  for (const u of G.allUnits()) while (u.evoPoints > 0) {
    const a = D.ARCHETYPES[u.archetypeId];
    const sk = a.skills.find(s => (u.skills[s] || 0) < 3 && D.SKILLS[s].type === 'ativa' && u.skills[s]) || a.skills.find(s => (u.skills[s] || 0) < 3);
    if (sk && u.level % 2 === 0) G.upgradeSkill(u.id, sk); else G.addElement(u.id, ['fogo', 'pedra', 'agua'][u.id % 3]);
  }
  G.autoArrange();
}

for (let i = 0; i < RUNS; i++) {
  try {
    G.newRun({ seed: 'SIM' + i, ascension: ASC });
    let steps = 0;
    while (G.run.phase !== 'END' && steps++ < 400) {
      const r = G.run;
      if (r.phase === 'CHOICE') {
        const p = G.currentPending();
        if (p.kind === 'shop') G.skipPending();
        else if (p.kind === 'report') G.skipPending();
        else { const idx = p.options.findIndex(o => G.optionAffordable(o)); idx >= 0 ? G.resolveOption(idx) : G.skipPending(); }
      } else if (r.phase === 'MAP') {
        aiPrep();
        const av = G.availableNodes();
        G.chooseNode((av.find(n => n.type === 'acampamento' && r.citadelHp < 60) || av.find(n => n.type !== 'elite') || av[0]).id);
      } else if (r.phase === 'PREP') {
        aiPrep(); G.startCombat();
        let t = 0;
        while (G.run.phase === 'COMBAT' && t < 200) { G.tick(0.05); t += 0.05; }
        if (t >= 200) throw new Error('combate não terminou');
      }
    }
    const e = G.run.ended || {};
    results.push({ room: G.run.room, win: !!e.victory, kills: G.run.stats.kills, relics: G.run.relics.length, lvl: Math.max(...G.allUnits().map(u => u.level), 0) });
  } catch (err) { errors++; console.error('RUN', i, err.stack); }
}
const wins = results.filter(r => r.win).length;
const avgRoom = results.reduce((s, r) => s + r.room, 0) / Math.max(1, results.length);
console.log(JSON.stringify({ runs: RUNS, asc: ASC, errors, wins, winRate: (wins / RUNS).toFixed(2), avgRoom: avgRoom.toFixed(1),
  rooms: results.map(r => r.room).join(','), maxLvl: Math.max(...results.map(r => r.lvl)) }));
