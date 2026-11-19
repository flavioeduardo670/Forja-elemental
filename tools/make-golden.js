// Gera valores de referência (golden) a partir do motor JS para os testes
// EditMode do port em C#. Roda expedições como tests/sim.js e grava:
//   rng.json        — sequências do mulberry32
//   stats.json      — chamadas reais de computeStats (+ unitPower)
//   generation.json — generateActMap, generateTerrain e generateHorde com o estado do RNG
//   combat.json     — combates reais (opções de createCombat) e o resultado final
// Uso: node tools/make-golden.js [campanhas]
const fs = require('fs');
const path = require('path');
globalThis.window = globalThis;
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
for (const f of ['core', 'data', 'engine', 'game', 'achievements']) require(path.join(__dirname, '..', 'js', f + '.js'));
const FE = globalThis.FE, G = FE.Game, D = FE.Data, E = FE.Engine;
const OUT = path.join(__dirname, '..', 'unity', 'Assets', 'Tests', 'EditMode', 'Golden');
fs.mkdirSync(OUT, { recursive: true });
const clone = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v instanceof Set ? [...v] : v)));
const write = (name, data) => { const s = JSON.stringify(data); fs.writeFileSync(path.join(OUT, name), s + '\n'); console.log(`${name}: ${(s.length / 1024).toFixed(0)} KB`); };

/* ---------------- RNG ---------------- */
const rng = [1, 7, 12345, 0xDEADBEEF, 4294967295, 2654435769].map(seed => {
  const r = FE.RNG(seed); const values = []; for (let i = 0; i < 64; i++) values.push(r.next());
  const r2 = FE.RNG(seed); const ints = []; for (let i = 0; i < 32; i++) ints.push(r2.int(-5, 20));
  return { seed, values, ints, state: r.state };
});
const hashes = ['SIM0P1', 'DIA-2026-11-19', 'KARUMI-123', ''].map(s => ({ s, h: FE.util.hashStr(s) }));

/* ---------------- Captura das chamadas do motor ---------------- */
const statsCases = new Map(); let statsCalls = 0;
const origStats = E.computeStats;
E.computeStats = function (unit, ctx) {
  const res = origStats(unit, ctx);
  statsCalls++;
  if (statsCalls % 7 === 0 && statsCases.size < 600) {
    const c = { ...ctx, boardCount: ctx.board ? ctx.board.length : 0, board: undefined };
    const key = JSON.stringify([unit.archetypeId, unit.level, unit.elements, unit.skills, unit.items, unit.trait, unit.affixes, unit.isBoss, c.isEnemy, c.tactic, c.affix]);
    if (!statsCases.has(key)) statsCases.set(key, clone({ unit, ctx: c, expected: res, power: E.unitPower(res) }));
  }
  return res;
};
const gen = { maps: [], terrains: [], hordes: [] };
const wrapGen = (name, list, max, argsOf) => {
  const orig = E[name];
  E[name] = function (r, ...args) {
    const state = r.state;
    const res = orig(r, ...args);
    if (list.length < max) list.push(clone({ state, args: argsOf(args), expected: res, stateAfter: r.state }));
    return res;
  };
};
wrapGen('generateActMap', gen.maps, 24, ([act, asc]) => ({ act, asc }));
wrapGen('generateTerrain', gen.terrains, 120, ([layout, act, cond, mission]) => ({ layout, act, cond, mission }));
wrapGen('generateHorde', gen.hordes, 120, ([room, act, roomType, asc, terrain, players, doctrineId, extraCount]) => ({ room, act, roomType, asc, terrain, players, doctrineId, extraCount }));

const combatOpts = [];
const origCreate = E.createCombat;
E.createCombat = function (opts) {
  combatOpts.push(clone({ ...opts, fx: false, room: G.run.room, roomType: G.run.roomType, cond: G.run.cond, players_n: G.coop() }));
  return origCreate(opts);
};

/* ---------------- Expedições (mesma IA do tests/sim.js) ---------------- */
const RUNS = +process.argv[2] || 6;
G.loadMeta(); G.meta.maxAscension = 5; G.meta.seenTutorial = true;
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
    const score = (arch) => D.ARCHETYPES[arch].orders.reduce((t, o) => t + Math.min(3, oc[o] || 0), 0) * 1.2 + ((['front', 'mid', 'flank'].includes(D.ARCHETYPES[arch].pref) === wantFront) ? 2.5 : 0) + (have.has(arch) ? 0.3 : 0);
    const arch = ORDER.slice().sort((a, b) => score(b) - score(a))[0];
    if (p.gold >= G.contractCost(arch)) { G.buy(arch); continue; }
    break;
  }
  while (p.bag.length && G.boardOf(pid).some(u => u.items.length < 3)) { const u = G.boardOf(pid).find(u => u.items.length < 3); G.equip(0, u.id); }
  for (const u of G.unitsOf(pid)) while (u.evoPoints > 0) {
    const a = D.ARCHETYPES[u.archetypeId];
    const sk = a.skills.find(s => (u.skills[s] || 0) < 3 && D.SKILLS[s].type === 'ativa' && u.skills[s]) || a.skills.find(s => (u.skills[s] || 0) < 3);
    if (sk && u.level % 2 === 0) G.upgradeSkill(u.id, sk); else G.addElement(u.id, ['fogo', 'pedra', 'agua', 'ar', 'solar', 'lunar'][u.id % 6]);
  }
  G.autoArrange();
}
const TACT = { emboscada: 'falange', sacerdocio: 'retaguarda', artilharia: 'retaguarda', ritual: 'assalto', furia: 'falange', enxame: 'assalto', muralha: 'foco' };
const aiPrep = () => { if (G.run.phase === 'PREP') G.setTactic(TACT[G.run.doctrine] || 'equilibrio'); for (let i = 0; i < G.coop(); i++) aiPrepPlayer(i); G.run.active = 0; };
const setups = [];
for (let i = 0; i < RUNS; i++) setups.push({ seed: 'GOLD' + i, ascension: i % 6, players: [1, 1, 2, 1, 3, 4][i % 6], scaling: ['dinamica', 'classica', 'proporcional', 'nivelada'][i % 4] });
for (const s of setups) {
  G.newRun(s);
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
    }
  }
}

/* ---------------- Reexecução isolada dos combates capturados ---------------- */
// Escolhe combates variados (missão × condição × tipo de sala × jogadores) e
// roda cada um com passo fixo de 0,025s, registrando o resultado e um traço.
const seen = new Set(); const picked = [];
for (const o of combatOpts) {
  const key = [o.mission, o.cond, o.roomType, o.players_n, o.structures.length > 0].join('|');
  if (seen.has(key) && picked.length >= 8) continue;
  if (seen.has(key) && picked.filter(p => p.key === key).length >= 2) continue;
  seen.add(key); picked.push({ key, o });
  if (picked.length >= 40) break;
}
const combats = [];
for (const { key, o } of picked) {
  const opts = JSON.parse(JSON.stringify(o));
  const c = origCreate({ ...opts, relics: new Set(opts.relics) });
  const trace = []; let steps = 0;
  while (!c.over && steps < 200 / 0.025) {
    E.updateCombat(c, 0.025); steps++;
    if (steps % 40 === 0) trace.push({ t: c.time, n: c.units.length, hp: c.units.reduce((a, u) => a + (u.dead ? 0 : u.hp), 0), rng: c.rng.state });
  }
  combats.push({
    key, opts: o, steps, result: c.result,
    units: c.units.map(u => ({ team: u.team, archetypeId: u.archetypeId, isSummon: u.isSummon, structure: u.structure, hp: u.hp, shield: u.shield, mana: u.mana, dead: u.dead, x: u.x, y: u.y, kills: u.kills, dmgDealt: u.dmgDealt, dmgTaken: u.dmgTaken, healDone: u.healDone, casts: u.casts })),
    report: E.combatReport(c), trace, rngState: c.rng.state
  });
}

write('rng.json', { rng, hashes });
write('stats.json', [...statsCases.values()]);
write('generation.json', gen);
write('combat.json', combats);
console.log(`combates capturados: ${combatOpts.length}, gravados: ${combats.length} (${[...new Set(combats.map(c => c.key))].length} tipos)`);
