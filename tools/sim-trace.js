// Grava referências de expedições inteiras para os testes de paridade do C#:
//   runs.json        — traço passo a passo (mesma IA de tests/sim.js) de algumas expedições
//   sim-summary.json — saída de `node tests/sim.js` para algumas configurações
// Uso: node tools/sim-trace.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
globalThis.window = globalThis;
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
for (const f of ['core', 'data', 'engine', 'game', 'achievements']) require(path.join(__dirname, '..', 'js', f + '.js'));
const FE = globalThis.FE, G = FE.Game, D = FE.Data;
const OUT = path.join(__dirname, '..', 'unity', 'Assets', 'Tests', 'EditMode', 'Golden');

/* Assinatura do estado da expedição — o C# monta a mesma string */
const kv = (o) => Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join(',');
const unitSig = (u) => `${u.id}:${u.archetypeId}:${u.level}:${u.xp}:${u.evoPoints}:${u.col},${u.row}:${kv(u.elements)}:${kv(u.skills)}:${u.items.map(i => i.id + '*' + i.tier).join(',')}:${u.trait || ''}`;
function snapshot() {
  const r = G.run;
  return [r.phase, r.room, r.act, r.rngState, `${r.citadelHp}/${r.citadelMax}`, r.threat, r.attempt, r.relics.join(','),
    r.players.map(p => `${p.gold};${p.teamLimit};${p.bag.map(i => i.id + '*' + i.tier).join(',')};${p.bench.filter(Boolean).map(unitSig).join('/')}`).join('#'),
    r.board.map(unitSig).join('/'), r.pending.map(p => p.kind).join(',')].join('|');
}

/* IA — cópia fiel de tests/sim.js (modo smart) */
const ORDER = ['vanguarda', 'arcanista', 'clerigo', 'cacador', 'paladino', 'necromante', 'bardo', 'monge', 'alquimista', 'berserker', 'druida', 'lanceiro', 'artifice', 'sombra'];
function aiPrepPlayer(pid) {
  const r = G.run; r.active = pid; const p = G.me();
  const cap = G.capPerPlayer();
  let guard = 0;
  while (guard++ < 14) {
    const mine = G.boardOf(pid).length;
    if (mine >= G.fieldLimit(p)) { if (p.teamLimit < Math.min(cap, 7)) G.setTeamLimit(p.teamLimit + 1); else break; }
    const mineU = G.unitsOf(pid), nf = mineU.filter(u => ['front', 'mid', 'flank'].includes(D.ARCHETYPES[u.archetypeId].pref)).length;
    const wantFront = nf < Math.ceil((mineU.length + 1) * 0.4);
    const have = new Set(mineU.map(u => u.archetypeId));
    const oc = {}; for (const u of G.allUnits()) for (const o of D.ARCHETYPES[u.archetypeId].orders) oc[o] = (oc[o] || 0) + 1;
    const score = (arch, q) => D.ARCHETYPES[arch].orders.reduce((t, o) => t + Math.min(3, oc[o] || 0), 0) * 1.2 + q * 1.5 + ((['front', 'mid', 'flank'].includes(D.ARCHETYPES[arch].pref) === wantFront) ? 2.5 : 0) + (have.has(arch) ? 0.3 : 0);
    const arch = ORDER.slice().sort((a, b) => score(b, 0) - score(a, 0))[0];
    if (p.gold >= G.contractCost(arch)) { G.buy(arch); continue; }
    break;
  }
  while (p.bag.length && G.boardOf(pid).some(u => u.items.length < 3)) { const u = G.boardOf(pid).find(u => u.items.length < 3); G.equip(0, u.id); }
  for (const u of G.unitsOf(pid)) while (u.evoPoints > 0) {
    const a = D.ARCHETYPES[u.archetypeId];
    const sk = a.skills.find(s => (u.skills[s] || 0) < 3 && D.SKILLS[s].type === 'ativa' && u.skills[s]) || a.skills.find(s => (u.skills[s] || 0) < 3);
    if (sk && u.level % 2 === 0) G.upgradeSkill(u.id, sk); else G.addElement(u.id, ['fogo', 'pedra', 'agua'][u.id % 3]);
  }
  G.autoArrange();
}
const TACT = { emboscada: 'falange', sacerdocio: 'retaguarda', artilharia: 'retaguarda', ritual: 'assalto', furia: 'falange', enxame: 'assalto', muralha: 'foco' };
const aiPrep = () => { if (G.run.phase === 'PREP') G.setTactic(TACT[G.run.doctrine] || 'equilibrio'); for (let i = 0; i < G.coop(); i++) aiPrepPlayer(i); G.run.active = 0; };

G.loadMeta(); G.meta.maxAscension = 5; G.meta.seenTutorial = true;
const configs = [
  { seed: 'SIM0P1', ascension: 0, players: 1, scaling: 'dinamica' },
  { seed: 'SIM1P1', ascension: 3, players: 1, scaling: 'classica' },
  { seed: 'SIM2P2', ascension: 1, players: 2, scaling: 'proporcional' },
  { seed: 'SIM3P3', ascension: 5, players: 3, scaling: 'nivelada' },
  { seed: 'SIM4P4', ascension: 2, players: 4, scaling: 'dinamica' },
  { seed: 'SIM5P1', ascension: 5, players: 1, scaling: 'dinamica' }
];
const runs = [];
for (const cfg of configs) {
  G.newRun(cfg);
  const trace = [snapshot()];
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
      let t = 0; while (G.run.phase === 'COMBAT' && t < 200) { G.tick(0.05); t += 0.05; }
      if (t >= 200) throw new Error('combate não terminou');
    }
    trace.push(snapshot());
  }
  const e = G.run.ended || {};
  runs.push({ ...cfg, trace, victory: !!e.victory, room: G.run.room });
  console.log(`${cfg.seed}: ${trace.length} passos, ${e.victory ? 'vitória' : 'derrota na sala ' + G.run.room}`);
}
fs.writeFileSync(path.join(OUT, 'runs.json'), JSON.stringify(runs) + '\n');

/* Resumos de tests/sim.js (a última linha da saída é o JSON) */
const sims = [[20, 0, 1, 'dinamica'], [10, 3, 1, 'classica'], [8, 1, 2, 'proporcional'], [8, 2, 3, 'nivelada']];
const summary = sims.map(([n, asc, pl, sc]) => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'tests', 'sim.js'), n, asc, pl, sc], { encoding: 'utf8' }).trim().split('\n').pop();
  console.log(out);
  return { args: [n, asc, pl, sc], json: out };
});
fs.writeFileSync(path.join(OUT, 'sim-summary.json'), JSON.stringify(summary, null, 1) + '\n');
