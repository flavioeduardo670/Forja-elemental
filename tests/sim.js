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

const RUNS = +process.argv[2] || 30, ASC = +process.argv[3] || 0, PLAYERS = +process.argv[4] || 1, SCALING = process.argv[5] || 'dinamica';
G.loadMeta(); if (globalThis.__defK !== undefined) { const V = FE.Data.ENEMY_DEFENSE; for (const k of ['hp','armor','armorFlat','magic','elem']) V[k] = V[k].map(x => x * globalThis.__defK); } G.meta.maxAscension = 5; G.meta.seenTutorial = true;
const results = []; const DOC = {}; const MIS = {}; let errors = 0;
const ORDER = ['vanguarda', 'arcanista', 'clerigo', 'cacador', 'paladino', 'necromante', 'bardo', 'monge', 'alquimista', 'berserker', 'druida', 'lanceiro', 'artifice', 'sombra'];

function aiPrepPlayer(pid) {
  const r = G.run; r.active = pid; const p = G.me();
  const cap = G.capPerPlayer();
  let guard = 0;
  let rolls = 0;
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
const SMART = process.argv[6] !== 'dumb';
const TACT = { emboscada: 'falange', sacerdocio: 'retaguarda', artilharia: 'retaguarda', ritual: 'assalto', furia: 'falange', enxame: 'assalto', muralha: 'foco' };
const FIX = D.TACTICS[process.argv[6]] ? process.argv[6] : null;
const aiPrep = () => { if (G.run.phase === 'PREP') { if (FIX) G.setTactic(FIX); else if (SMART) G.setTactic(TACT[G.run.doctrine] || 'equilibrio'); } for (let i = 0; i < G.coop(); i++) aiPrepPlayer(i); G.run.active = 0; };

for (let i = 0; i < RUNS; i++) {
  try {
    G.newRun({ seed: 'SIM' + i + 'P' + PLAYERS, ascension: ASC, players: PLAYERS, scaling: SCALING });
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
        aiPrep(); const doc = r.doctrine || 'chefe'; const mis = (r.mission || 'x') + (r.cond && r.cond !== 'nenhuma' ? '+' + r.cond : ''); G.startCombat();
        let t = 0;
        while (G.run.phase === 'COMBAT' && t < 200) { G.tick(0.05); t += 0.05; }
        if (t >= 200) { const c = G.combat; console.error(G.run.mission, G.run.cond, G.run.layout, c.waveNow, c.waveMax, c.units.filter(u => !u.dead).map(u => [u.team, u.structure, u.archetypeId, u.x.toFixed(1), u.y.toFixed(1), Math.round(u.hp), u.stats.moveSpeed, u.huntUid ? 'H' : '']).map(String).join(' | ')); throw new Error('combate não terminou'); }
        const rep = G.currentPending(); if (rep && rep.kind === 'report') { const d = DOC[doc] || (DOC[doc] = [0, 0]); d[1]++; if (rep.won) d[0]++; const m = MIS[mis] || (MIS[mis] = [0, 0, 0]); m[1]++; if (rep.won) m[0]++; m[2] += G.__lastTime || 0; }
      }
    }
    const e = G.run.ended || {};
    results.push({ room: G.run.room, win: !!e.victory, lvl: Math.max(...G.allUnits().map(u => u.level), 0), losses: G.run.stats.losses, units: G.run.board.length });
  } catch (err) { errors++; console.error('RUN', i, err.stack); }
}
const wins = results.filter(r => r.win).length;
const avgRoom = results.reduce((s, r) => s + r.room, 0) / Math.max(1, results.length);
const hist = {}; for (const r of results) { const a = r.win ? 'V' : 'A' + Math.ceil(r.room / D.CONFIG.ROOMS_PER_ACT); hist[a] = (hist[a] || 0) + 1; }
if (process.env.MIS) console.log(Object.entries(MIS).sort().map(([k, v]) => `${k}: ${v[0]}/${v[1]} (${(v[0] / v[1] * 100).toFixed(0)}%) t=${(v[2] / v[1]).toFixed(0)}s`).join('\n'));
console.log(JSON.stringify({ ai: FIX || (SMART ? 'smart' : 'dumb'), mode: SCALING, runs: RUNS, asc: ASC, players: PLAYERS, errors, winRate: (wins / RUNS).toFixed(2), avgRoom: avgRoom.toFixed(1), fim: hist, maxLvl: Math.max(...results.map(r => r.lvl)), avgLosses: (results.reduce((s, r) => s + r.losses, 0) / results.length).toFixed(1), doc: Object.fromEntries(Object.entries(DOC).map(([k, v]) => [k, Math.round(v[0] / v[1] * 100) + '%/' + v[1]])), avgUnits: (results.reduce((s, r) => s + r.units, 0) / results.length).toFixed(1) }));
