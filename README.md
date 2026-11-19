# Forja Elemental 4.1

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

## Novidades da 5.0 — Campo de Batalha Vivo
- **Bonecos articulados** (pernas, braços, cabeça): andam, golpeiam, atiram, conjuram, recuam ao levar dano, cambaleiam atordoados, caem ao morrer e comemoram a vitória. Ver `pose()` e `drawRigged()` em `render.js` e `Builder.rig()` em `gl3d.js`.
- **Tabuleiro 16×14** e hordas maiores (`CONFIG.COLS/ROWS`, `generateHorde`). O gerador de terreno agora é paramétrico.
- **Missões** (`D.MISSIONS`): Batalha Campal, Reforços Inimigos (ondas), Defender a Cidade, Invadir a Base. Estruturas são unidades com `structure` e `radius` (`createCombat`, `updateWaves`).
- **Condições de campo** (`D.CONDITIONS`): Dois Andares (`U`), Alçapões (`T` → `O`), Chão Desabado, Desfiladeiro Estreito. `cap` reduz o limite em campo (`G.fieldLimit`).
- **Cenário**: entorno temático por Ato, moldura de diorama, cidade/fortaleza/torres em 3D (`buildSurround`, `buildStructure`).
- **Interface compacta**: cartões com −, colunas com ‹ › (tecla H), dock recolhível, Tela ampla no combate (`UI.applyLayout`).
- Saves da 4.x não carregam (o tabuleiro mudou de tamanho).

## Novidades da 4.1 — Tabuleiro 3D
- **`js/gl3d.js`**: mini-motor WebGL próprio (sem dependências) — matrizes, construtor de malhas low-poly (caixa, cilindro, cone, esfera, toro, cápsula) com cor e brilho por vértice, terreno 3D por tipo de casa e bonecos 3D por classe/invocação/chefe.
- **`js/render.js`**: renderizador 3D com câmera orbital (yaw/pitch/zoom suavizados), seleção de casa por raio, sombras, bonecos virando para o alvo e camada 2D (`#battle-canvas`) para barras, números e efeitos.
- **`js/render-iso.js`**: renderizador isométrico 2D da 4.0, usado automaticamente quando não há WebGL.
- Controles: botão direito/do meio ou Shift + arrastar, setas, roda do mouse, botões no canto do tabuleiro.

## Novidades da 4.0 — Diorama
- **Visual novo**: `js/render.js` reescrito com projeção isométrica (`R.project`, `R.tileAt` com correção de altura), blocos com altura por terreno e paleta por Ato; `js/toys.js` define os bonecos de brinquedo (camadas Path2D/SVG) usados no canvas e na interface (`FE.Toy.draw`, `FE.Toy.svg`, `FE.Art.medal` agora devolve um retrato de boneco).
- **Tema claro em cartões** (bloco v4.0 no fim de `css/style.css`).
- **Sem sorteio no recrutamento**: todas as classes, preço fixo (`G.buy`); o código do Quartel antigo ficou inativo.
- **Itens determinísticos**: um item a cada `CONFIG.ITEM_EVERY` (3) combates comuns.
- **Inimigos veteranos** (`D.ENEMY_DEFENSE`): vida, armadura, resistência mágica e o novo `elemResist` (reduz queimadura, explosões, ricochete e dano verdadeiro) crescendo por Ato; elites ×1,2 e chefes ×1,35. Nas escalas fixas valem ×`fixedK`.
- **Dificuldade**: `SCALING.diff` (0,72), `kMin` 0,4, `kMax` 7 e `G.coopFactor`. Simulador (IA simples, 45 campanhas): solo Dinâmica ~36%, co-op 2/3/4 ~33/47/33%, Clássica ~17%.

## Novidades da 3.1 — Arte e clareza
- **`js/art.js`**: emblemas vetoriais próprios (14 arquétipos, 5 invocações, 4 chefes) usados no canvas (`FE.Art.draw` via Path2D) e no DOM (`FE.Art.svg`/`FE.Art.medal`). Para trocar a arte de uma classe basta editar as camadas em `ICONS`.
- **Miniaturas** no tabuleiro: base metálica, disco na cor da classe, espinhos para inimigos (dourados em elites e chefes), selo de nível, barras arredondadas, estados desenhados (atordoado, queimando, congelado) e fantasmas com a mesma arte.
- **Tabuleiro mais limpo**: sem textos sobrepostos, grade em pontos, divisória luminosa.
- **Briefing compacto**: doutrina / inteligência / objetivo viram 3 chips expansíveis; poder e recompensas numa linha; táticas compactas.
- Sinergias inativas viram uma fileira de ícones; Inspetor com retrato; **Modo Foco** (tecla F).

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
