# Forja Elemental 3.0

Auto-battler tático roguelike em HTML/JS puro (sem build, sem dependências).

## Rodar
Abra `index.html` no navegador (ou sirva a pasta com qualquer servidor estático).

## Estrutura
- `js/core.js` — namespace `FE`, RNG com seed serializável, barramento de eventos, storage.
- `js/data.js` — todo o conteúdo (arquétipos, habilidades, elementos, ordens, relíquias, itens, facções, chefes, meta, ascensões).
- `js/engine.js` — lógica pura sem DOM: atributos, geração de mapa/hordas, simulação de combate.
- `js/achievements.js` — 27 conquistas declarativas testadas por eventos.
- `js/game.js` — regras da expedição, economia, escolhas pendentes, save/load versionado (migra a meta da v1).
- `js/render.js`, `js/ui.js`, `js/audio.js`, `js/main.js` — apresentação e entrada.
- `tests/sim.js` — simulador headless: `node tests/sim.js <runs> <ascensao>`.

## Adicionar conteúdo
1. Registre em `data.js` (ex.: nova relíquia com `rarity` e `desc`).
2. Se tiver efeito novo, implemente em `engine.js` (`computeStats`, `SKILL_FX` ou `BOSS_SCRIPTS`).
3. Rode `tests/sim.js` para conferir que nada quebrou e a taxa de vitória continua na faixa desejada.

## Novidades da 3.0 — Mesa de Guerra
- **Doutrinas inimigas** (`D.DOCTRINES`, `E.generateHorde(..., doctrineId)`): composição, formação, emboscada e modificadores por horda; `tune`/`coopTune` calibram a escala adaptativa.
- **Inteligência inimiga** (`D.COUNTERS`, `G.armyProfile`, `applyIntel` em game.js): a partir do Ato II a horda analisa o elenco e aplica contramedidas (`e.cmods`, fora da normalização de poder), anticura, caçada ao campeão e batedores.
- **Táticas** (`D.TACTICS`, `G.setTactic`, `ctx.tactic`, alvo em `chooseTarget`). A escala de poder mede o elenco sem tática (`statsCtx(pid, true)`).
- **Objetivos bônus** (`D.OBJECTIVES`, `pickObjective`/`evalObjective`).
- **Quartel** (`D.QUARTEL`, `D.TRAITS`, `G.refreshOffers/hire/reroll/toggleLock`, `G.buy` = contrato).
- **Layout novo**: trilha de campanha, painel de inteligência, barra de táticas, doca Comando + Quartel; tema em `css/style.css` (bloco v3.0).
- Simulador: `node tests/sim.js <runs> <asc> <jogadores> <escala> [tática|dumb]` — imprime taxa de vitória por doutrina.

## Novidades da 2.3
- **Escalas de poder** (`D.SCALING`, `G.targetRatio`, `applyScaling` em game.js): Clássica, Nivelada, Proporcional e Dinâmica (padrão, com Medidor de Ameaça −3..+10: +7% de poder inimigo e +6% de recompensa por ponto).
- **Métrica de poder** (`Engine.unitPower/teamPower`): √(vida efetiva × DPS) por unidade, time = (Σ)²/100 (Lanchester).
- **Recompensas explícitas**: `G.previewRewards()` alimenta a faixa "Se vencer / Se perder" e os tooltips do mapa; `finishCombat` gera `rewards` estruturado para o relatório em cartões.
- **Visual**: tremor de tela, cortes, rastros, fantasmas, flash de dano, halo/selo de nível, terreno animado, vinheta, faixa de vitória.
- Simulador: `node tests/sim.js <runs> <asc> <jogadores> <escala>`.

## Novidades da 2.2
- Co-op local 2–4 jogadores (12 unidades divididas; ouro, banco e mochila por jogador; sistema de Pronto; escolhas em rodízio; doações).
- Campanha com 4 Atos × 6 salas (24), Ato IV "Coração da Forja" e chefe final Ferreiro Primordial; história, epílogo e créditos.
- 52 conquistas em 6 categorias (8 secretas) e títulos; Desafio Diário; pausa; renomear unidades.
- Balanceamento: `node tests/sim.js <runs> <ascensao> <jogadores>` — a escala do co-op fica em `FE.Engine.COOP_SCALE`.
