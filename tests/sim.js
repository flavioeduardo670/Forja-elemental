// Simulação headless: joga N expedições com uma IA simples para validar
// regras, achar exceções e medir balanceamento.
// Uso: node tests/sim.js [runs] [ascensao] [jogadores]
const path = require('path');
globalThis.window = globalThis;
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
for (const f of ['core', 'data', 'engine', 'game', 'achievements']) require(path.join(__dirname, '..', 'js', f + '.js'));
const FE = globalThis.FE, G = FE.Game, D = FE.Data;
if (globalThis.__sweep) Object.assign(FE.Engine.COOP_SCALE, { countPer: globalThis.__sweep.cnt, statPer: globalThis.__sweep.st, bossPer: globalThis.__sweep.boss });

const RUNS = +process.argv[2] || 30, ASC = +process.argv[3] || 0, PLAYERS = +process.argv[4] || 1;
G.loadMeta(); G.meta.maxAscension = 5; G.meta.seenTutorial = true;
const results = []; let errors = 0;
const ORDER = ['vanguarda', 'arcanista', 'clerigo', 'cacador', 'paladino', 'necromante', 'bardo', 'monge', 'alquimista', 'berserker', 'druida', 'lanceiro', 'artifice', 'sombra'];

function aiPrepPlayer(pid) {
  const r = G.run; r.active = pid; const p = G.me();
  const cap = G.capPerPlayer();
  let guard = 0;
  while (p.gold >= 40 && guard++ < 10) {
    const mine = G.boardOf(pid).length;
    if (mine >= p.teamLimit) { if (p.teamLimit < Math.min(cap, 7)) G.setTeamLimit(p.teamLimit + 1); else break; }
    const arch = ORDER[(r.nextUnitId * 7 + pid * 3) % ORDER.length];
    if (p.gold < G.recruitCost(arch)) break;
    G.buy(arch);
  }
  while (p.bag.length && G.boardOf(pid).some(u => u.items.length < 3)) { const u = G.boardOf(pid).find(u => u.items.length < 3); G.equip(0, u.id); }
  for (const u of G.unitsOf(pid)) while (u.evoPoints > 0) {
    const a = D.ARCHETYPES[u.archetypeId];
    const sk = a.skills.find(s => (u.skills[s] || 0) < 3 && D.SKILLS[s].type === 'ativa' && u.skills[s]) || a.skills.find(s => (u.skills[s] || 0) < 3);
    if (sk && u.level % 2 === 0) G.upgradeSkill(u.id, sk); else G.addElement(u.id, ['fogo', 'pedra', 'agua'][u.id % 3]);
  }
  G.autoArrange();
}
const aiPrep = () => { for (let i = 0; i < G.coop(); i++) aiPrepPlayer(i); G.run.active = 0; };

for (let i = 0; i < RUNS; i++) {
  try {
    G.newRun({ seed: 'SIM' + i + 'P' + PLAYERS, ascension: ASC, players: PLAYERS });
    let steps = 0;
    while (G.run.phase !== 'END' && steps++ < 600) {
      const r = G.run;
      if (r.phase === 'CHOICE') {
        const p = G.currentPending();
        if (p.kind === 'shop' || p.kind === 'report' || p.kind === 'story') G.skipPending();
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
    results.push({ room: G.run.room, win: !!e.victory, lvl: Math.max(...G.allUnits().map(u => u.level), 0), losses: G.run.stats.losses, units: G.run.board.length });
  } catch (err) { errors++; console.error('RUN', i, err.stack); }
}
const wins = results.filter(r => r.win).length;
const avgRoom = results.reduce((s, r) => s + r.room, 0) / Math.max(1, results.length);
const hist = {}; for (const r of results) { const a = r.win ? 'V' : 'A' + Math.ceil(r.room / D.CONFIG.ROOMS_PER_ACT); hist[a] = (hist[a] || 0) + 1; }
console.log(JSON.stringify({ runs: RUNS, asc: ASC, players: PLAYERS, errors, winRate: (wins / RUNS).toFixed(2), avgRoom: avgRoom.toFixed(1), fim: hist, maxLvl: Math.max(...results.map(r => r.lvl)), avgLosses: (results.reduce((s, r) => s + r.losses, 0) / results.length).toFixed(1), avgUnits: (results.reduce((s, r) => s + r.units, 0) / results.length).toFixed(1) }));
