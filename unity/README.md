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
- `Assets/Resources/Data/forja-data.json` — conteúdo exportado de `js/data.js`.
- `Assets/Tests/EditMode/` — testes de paridade com o motor JS (`Golden/*.json`).

## Fluxo
O JS continua sendo a referência de regras. Depois de mudar `js/data.js` ou `js/engine.js`:

```
node tools/export-data.js      # atualiza forja-data.json
node tools/make-golden.js      # regrava os valores de referência
unity test unity --mode EditMode
```

Os testes comparam RNG, atributos, mapa, terreno, hordas e combates completos (estado do RNG,
vida das unidades e resultado) com o JS. Uma divergência aponta o primeiro ponto em que o port difere.
