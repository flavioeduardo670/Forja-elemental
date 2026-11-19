# Forja Elemental — guia para o Claude Code

Responda sempre em português.

## O que é
Auto-battler tático roguelike. A versão jogável atual (v5.0) é web: HTML/CSS/JS puro, sem build.
Abra `index.html` no navegador. `node tests/sim.js <runs> <asc> <jogadores> [modo]` roda o simulador
de balanceamento headless (o motor em `js/engine.js` é puro e roda no Node).

Arquivos (ordem de carga): core, data, engine, game, achievements, audio, art, toys, gl3d,
render-iso, render, ui, main. Namespace global `FE`, eventos em `FE.Bus`, RNG com seed via `withRng`.

## Objetivo agora: migrar para Unity + Blender
- **Unity** é a engine. O projeto Unity fica em `unity/` (URP 3D, Unity 6 LTS). Use a Unity CLI
  (`unity ...`) e o pacote Pipeline para dirigir o Editor, compilar e testar.
- **Blender** modela os bonecos, chefes, estruturas e peças de terreno. Scripts `bpy` em `blender/`,
  exportando `.fbx`/`.glb` para `unity/Assets/Art/`. Os modelos procedurais de `js/gl3d.js`
  (bonecos articulados por partes: legL, legR, torso, armL, armR, head) servem de referência de
  proporção, pivôs e cores.
- **Web continua sendo a referência de regras.** Portar a lógica de `js/data.js`, `js/engine.js` e
  `js/game.js` para C# mantendo os mesmos números; validar comparando com `tests/sim.js`.

## Ordem sugerida
1. Criar `unity/` com a Unity CLI (template URP) e instalar o pacote Pipeline.
2. Portar dados (`data.js` → ScriptableObjects ou JSON) e o motor de combate (C# puro, testável em EditMode).
3. Simulador em C# e testes EditMode comparando taxa de vitória com o simulador JS.
4. Modelos no Blender (scripts em `blender/`), importar e montar Animator (andar, atacar, conjurar, levar dano, morrer, comemorar).
5. Tabuleiro 16×14, câmera orbital, UI (UI Toolkit) compacta com painéis recolhíveis.
6. Missões (batalha, ondas, defender cidade, invadir base) e condições de campo.

## Estado da migração
Passos 1–6 feitos: `unity/` com Core em C# (paridade testada contra o JS via `tools/*.js` e
`unity/Assets/Tests`), modelos do Blender (`blender/build_models.py`) e a cena jogável
`unity/Assets/Scenes/Jogo.unity` com todas as missões e condições. Detalhes em `unity/README.md`.
Ferramentas fora do PATH nesta máquina: git (GitHub Desktop) e, em shells antigos, `unity`/`node`.

## Versionamento
Cada versão tem tag (`v2.0.0` … `v5.0.0`). Commits pequenos, mensagens em português.
Nunca commitar `unity/Library`, `Temp`, `Logs`, `UserSettings`, builds ou `.blend1`.
