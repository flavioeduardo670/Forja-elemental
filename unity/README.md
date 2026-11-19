# Unity

Projeto Unity (URP 3D, Unity 6000.6.10f1) do Forja Elemental.

## Estrutura
- `Assets/Scripts/Core/` — motor de regras em C# puro (assembly `ForjaElemental.Core`, sem dependência da Unity):
  - `Js.cs` — `JsMath` (Math.round, Math.hypot e toFixed com a semântica do V8) e `Rng` (mulberry32 de `js/core.js`).
  - `OrderedDict.cs` — dicionário com ordem de inserção (o motor depende da ordem das chaves, como no JS).
  - `GameData.cs` — modelo do conteúdo; `GameData.Load(json)`.
  - `Units.cs` — `UnitDef`, `StatBlock`, `StatsContext`.
  - `StatsCalc.cs` — `computeStats`, `applyMods`, poder (`UnitPower`/`TeamPower`).
  - `Generation.cs` — mapa do Ato, terreno 16×14, hordas e cenários.
  - `Combat.cs` — simulação de combate (`CombatEngine.Create/Update`); efeitos visuais saem por `ICombatFx`.
  - `RunModel.cs` — estado serializável da expedição (`Run`, `Player`, `Pending`, `Meta`...).
  - `Expedition*.cs` — regras da expedição (port de `js/game.js`): Quartel, roster, XP, mapa, cenários,
    escala de poder, inteligência inimiga, objetivos, recompensas, eventos, relíquias e fila de escolhas.
    A interface ouve `OnLog`, `OnToast`, `OnSfx`, `OnChanged`, `OnOpenEvo`.
  - `ExpeditionSim.cs` — simulador headless com a mesma IA de `tests/sim.js`.
- `Assets/Scripts/Editor/SimulatorMenu.cs` — menu **Forja Elemental ▸ Simular expedições** e entrada de linha de comando.
- `Assets/Resources/Data/forja-data.json` — conteúdo exportado de `js/data.js`.
- `Assets/Tests/EditMode/` — testes de paridade com o motor JS (`Golden/*.json`).

## Fluxo
O JS continua sendo a referência de regras. Depois de mudar `js/data.js` ou `js/engine.js`:

```
node tools/export-data.js      # atualiza forja-data.json
node tools/make-golden.js      # regrava os valores de referência do motor
node tools/sim-trace.js        # regrava expedições passo a passo e resumos do sim.js
unity test unity --mode EditMode
```

Os testes comparam RNG, atributos, mapa, terreno, hordas, combates completos, expedições inteiras
(estado a cada passo) e a saída do simulador com o JS. Uma divergência aponta o primeiro ponto em
que o port difere.

Simulador C# (mesmos argumentos e mesma saída de `node tests/sim.js <runs> <asc> <jogadores> <escala> [tática|dumb]`):

```
unity run unity -- -executeMethod ForjaElemental.EditorTools.SimulatorMenu.RunFromCommandLine -simArgs "30 0 1 dinamica"
```
