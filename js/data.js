/* ==========================================================================
   FORJA ELEMENTAL 2.0 — data.js
   Todo o conteúdo do jogo é declarativo. Para adicionar um arquétipo,
   relíquia, item, facção ou evento basta registrar aqui (e, para efeitos
   novos, um handler em engine.js). Nada aqui depende do DOM.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE;

  const CONFIG = {
    COLS: 12, ROWS: 12, PLAYER_ROW: 6, BENCH: 8, MAX_TEAM: 16,
    ROOMS_PER_ACT: 5, ACTS: 3, TOTAL_ROOMS: 15,
    START_GOLD: 150, START_CITADEL: 100, START_TEAM_LIMIT: 4,
    SELL_RATIO: 0.75, INTEREST_RATE: 0.10, INTEREST_CAP: 25,
    XP_BASE: 95, XP_GROWTH: 1.40,
    ITEM_TIER_MULT: [1, 1.6, 2.4], MAX_ITEMS: 3, MAX_ITEM_TIER: 3,
    SYN_THRESHOLDS: [2, 4, 6, 8],
    ORDER_THRESHOLDS: [2, 4, 6],
    NORMAL_ITEM_DROP: 0.30,
    SAVE_KEY_RUN: 'forja_elemental_v2_run',
    SAVE_KEY_META: 'forja_elemental_v2_meta',
    SAVE_KEY_SETTINGS: 'forja_elemental_v2_settings',
    LEGACY_META_KEY: 'forja_elemental_roguelike_meta_v1'
  };

  /* ---------------- 14 ARQUÉTIPOS (cada um com 1 Classe + 1 Origem) ------- */
  const ARCHETYPES = {
    vanguarda: { id: 'vanguarda', name: 'Vanguarda', role: 'Tanque', orders: ['bastiao', 'engenho'], cost: 25, color: '#3b82f6', symbol: '🛡', signatureSkill: 'vg_impacto',
      skills: ['vg_impacto', 'vg_bastiao', 'vg_couraca', 'vg_provocacao'], pref: 'front',
      stats: { maxHp: 820, ad: 42, ap: 25, armor: 40, attackSpeed: 0.72, range: 1.45, critChance: 0.05, moveSpeed: 2.1, maxMana: 95 } },
    paladino: { id: 'paladino', name: 'Paladino', role: 'Guardião', orders: ['bastiao', 'celestial'], cost: 35, color: '#fde047', symbol: '⚜️', signatureSkill: 'pa_martelo',
      skills: ['pa_martelo', 'pa_consagrar', 'pa_aura', 'pa_fe'], pref: 'front',
      stats: { maxHp: 760, ad: 48, ap: 50, armor: 36, attackSpeed: 0.75, range: 1.45, critChance: 0.06, moveSpeed: 2.1, maxMana: 90 } },
    berserker: { id: 'berserker', name: 'Berserker', role: 'Lutador', orders: ['bastiao', 'selvagem'], cost: 35, color: '#ea580c', symbol: '🪓', signatureSkill: 'be_furia',
      skills: ['be_furia', 'be_corte_giratorio', 'be_sede_sangue', 'be_pele_ferro'], pref: 'front',
      stats: { maxHp: 640, ad: 70, ap: 15, armor: 24, attackSpeed: 0.92, range: 1.45, critChance: 0.16, moveSpeed: 2.4, maxMana: 85 } },
    cacador: { id: 'cacador', name: 'Caçador', role: 'Atirador', orders: ['lamina', 'selvagem'], cost: 30, color: '#10b981', symbol: '🏹', signatureSkill: 'ca_saraivada',
      skills: ['ca_saraivada', 'ca_tiro_letal', 'ca_olho_aguia', 'ca_vento_leve'], pref: 'back',
      stats: { maxHp: 470, ad: 64, ap: 15, armor: 16, attackSpeed: 1.15, range: 4.3, critChance: 0.20, moveSpeed: 2.2, maxMana: 90 } },
    sombra: { id: 'sombra', name: 'Sombra', role: 'Assassino', orders: ['lamina', 'oculto'], cost: 35, color: '#f43f5e', symbol: '🗡', signatureSkill: 'so_golpe',
      skills: ['so_golpe', 'so_danca', 'so_veneno', 'so_evasao'], pref: 'flank',
      stats: { maxHp: 500, ad: 75, ap: 25, armor: 18, attackSpeed: 1.05, range: 1.45, critChance: 0.28, moveSpeed: 3.2, maxMana: 80 } },
    lanceiro: { id: 'lanceiro', name: 'Lanceiro', role: 'Duelista', orders: ['lamina', 'engenho'], cost: 30, color: '#14b8a6', symbol: '🔱', signatureSkill: 'ln_estocada',
      skills: ['ln_estocada', 'ln_varredura', 'ln_postura', 'ln_primeiro'], pref: 'mid',
      stats: { maxHp: 600, ad: 58, ap: 20, armor: 26, attackSpeed: 0.95, range: 2.2, critChance: 0.12, moveSpeed: 2.3, maxMana: 85 } },
    monge: { id: 'monge', name: 'Monge', role: 'Lutador Ágil', orders: ['lamina', 'selvagem'], cost: 30, color: '#f0abfc', symbol: '👊', signatureSkill: 'mo_palma',
      skills: ['mo_palma', 'mo_rajada', 'mo_fluxo', 'mo_serenidade'], pref: 'flank',
      stats: { maxHp: 580, ad: 60, ap: 30, armor: 22, attackSpeed: 1.2, range: 1.45, critChance: 0.15, moveSpeed: 2.8, maxMana: 70 } },
    arcanista: { id: 'arcanista', name: 'Arcanista', role: 'Mago', orders: ['arcano', 'oculto'], cost: 30, color: '#a855f7', symbol: '🔮', signatureSkill: 'ar_orbe',
      skills: ['ar_orbe', 'ar_meteoro', 'ar_fluxo', 'ar_eco'], pref: 'back',
      stats: { maxHp: 440, ad: 32, ap: 78, armor: 14, attackSpeed: 0.80, range: 3.6, critChance: 0.10, moveSpeed: 2.0, maxMana: 85 } },
    alquimista: { id: 'alquimista', name: 'Alquimista', role: 'Mago de Área', orders: ['arcano', 'engenho'], cost: 30, color: '#06b6d4', symbol: '⚗️', signatureSkill: 'al_frasco',
      skills: ['al_frasco', 'al_nevoa', 'al_catalise', 'al_transmutar'], pref: 'back',
      stats: { maxHp: 480, ad: 36, ap: 70, armor: 18, attackSpeed: 0.85, range: 3.2, critChance: 0.08, moveSpeed: 2.0, maxMana: 85 } },
    clerigo: { id: 'clerigo', name: 'Clérigo', role: 'Curandeiro', orders: ['devocao', 'celestial'], cost: 30, color: '#38bdf8', symbol: '✨', signatureSkill: 'cl_luz',
      skills: ['cl_luz', 'cl_prece', 'cl_graca', 'cl_aura_mana'], pref: 'back',
      stats: { maxHp: 510, ad: 30, ap: 70, armor: 20, attackSpeed: 0.85, range: 3.1, critChance: 0.08, moveSpeed: 2.1, maxMana: 80 } },
    bardo: { id: 'bardo', name: 'Bardo', role: 'Inspirador', orders: ['devocao', 'celestial'], cost: 30, color: '#f472b6', symbol: '🎻', signatureSkill: 'bd_hino',
      skills: ['bd_hino', 'bd_balada', 'bd_inspirar', 'bd_ritmo'], pref: 'back',
      stats: { maxHp: 500, ad: 34, ap: 60, armor: 18, attackSpeed: 0.90, range: 3.0, critChance: 0.08, moveSpeed: 2.1, maxMana: 80 } },
    artifice: { id: 'artifice', name: 'Artífice', role: 'Engenheiro', orders: ['invocador', 'engenho'], cost: 35, color: '#f59e0b', symbol: '⚙️', signatureSkill: 'at_torreta',
      skills: ['at_torreta', 'at_sobrecarga', 'at_engrenagem', 'at_campo_forca'], pref: 'back',
      stats: { maxHp: 520, ad: 48, ap: 62, armor: 22, attackSpeed: 0.85, range: 3.3, critChance: 0.12, moveSpeed: 2.0, maxMana: 85 } },
    druida: { id: 'druida', name: 'Druida', role: 'Xamã', orders: ['invocador', 'selvagem'], cost: 35, color: '#84cc16', symbol: '🌿', signatureSkill: 'dr_raizes',
      skills: ['dr_raizes', 'dr_lobo', 'dr_seiva', 'dr_casca'], pref: 'back',
      stats: { maxHp: 560, ad: 34, ap: 66, armor: 22, attackSpeed: 0.82, range: 3.0, critChance: 0.08, moveSpeed: 2.0, maxMana: 90 } },
    necromante: { id: 'necromante', name: 'Necromante', role: 'Feiticeiro', orders: ['invocador', 'oculto'], cost: 35, color: '#6366f1', symbol: '☠️', signatureSkill: 'ne_erguer',
      skills: ['ne_erguer', 'ne_drenar', 'ne_colheita', 'ne_pacto'], pref: 'back',
      stats: { maxHp: 470, ad: 30, ap: 72, armor: 16, attackSpeed: 0.82, range: 3.2, critChance: 0.08, moveSpeed: 2.0, maxMana: 90 } }
  };

  /* ---------------- 56 HABILIDADES (4 por arquétipo, Nv.1–3) ---------------- */
  const SKILLS = {
    vg_impacto: { name: 'Impacto Sísmico', type: 'ativa', icon: '💥', desc: l => `Golpeia o solo: (${65 + l * 35} + 85% AD) em área, atordoa ${(1.1 + l * 0.35).toFixed(1)}s e gera ${110 + l * 65} de Escudo.` },
    vg_bastiao: { name: 'Bastião Inabalável', type: 'ativa', icon: '🛡️', desc: l => `Concede (${140 + l * 80} + 110% AP) de Escudo para si e aliados próximos.` },
    vg_couraca: { name: 'Couraça de Titânio', type: 'passiva', icon: '🪨', desc: l => `+${l * 18} Armadura e +${l * 14}% Vida Máxima.` },
    vg_provocacao: { name: 'Retaliação Espinhosa', type: 'passiva', icon: '🦔', desc: l => `Reflete ${l * 18}% do dano físico recebido.` },

    ar_orbe: { name: 'Orbe Arcano', type: 'ativa', icon: '🔮', desc: l => `Orbe explosivo em área: (${90 + l * 45} + ${105 + l * 20}% AP) de dano mágico.` },
    ar_meteoro: { name: 'Chuva de Meteoros', type: 'ativa', icon: '☄️', desc: l => `${1 + l} meteoros em inimigos: (${85 + l * 35} + 100% AP) cada.` },
    ar_fluxo: { name: 'Mente Expandida', type: 'passiva', icon: '📘', desc: l => `+${l * 22}% AP e +${l * 4} Mana/s.` },
    ar_eco: { name: 'Ressonância Mágica', type: 'passiva', icon: '✨', desc: l => `Ignora ${l * 15}% da resistência e causa +${l * 12}% de dano.` },

    ca_saraivada: { name: 'Saraivada Precisa', type: 'ativa', icon: '🏹', desc: l => `${2 + l} flechas: (${50 + l * 25} + ${85 + l * 15}% AD) cada.` },
    ca_tiro_letal: { name: 'Disparo Perfurante', type: 'ativa', icon: '🎯', desc: l => `Tiro crítico: (${110 + l * 55} + 140% AD) + ${l * 8}% da Vida perdida do alvo.` },
    ca_olho_aguia: { name: 'Olho de Águia', type: 'passiva', icon: '🦅', desc: l => `+${l * 12}% Crítico, +${l * 25}% Dano Crítico, +${(l * 0.4).toFixed(1)} Alcance.` },
    ca_vento_leve: { name: 'Cadência Rápida', type: 'passiva', icon: '🌪️', desc: l => `+${l * 18}% Velocidade de Ataque.` },

    so_golpe: { name: 'Golpe Fantasma', type: 'ativa', icon: '🗡️', desc: l => `Crítico garantido: (${80 + l * 45} + ${120 + l * 20}% AD) e sangramento ${l * 30}/s.` },
    so_danca: { name: 'Dança das Lâminas', type: 'ativa', icon: '🌑', desc: l => `Corta todos ao redor: (${75 + l * 40} + 100% AD).` },
    so_veneno: { name: 'Lâmina Letal', type: 'passiva', icon: '💀', desc: l => `+${l * 18}% de dano contra alvos abaixo de 45% de Vida.` },
    so_evasao: { name: 'Manto das Sombras', type: 'passiva', icon: '👤', desc: l => `+${l * 10}% Esquiva e +${l * 10}% Roubo de Vida.` },

    cl_luz: { name: 'Luz Restauradora', type: 'ativa', icon: '💖', desc: l => `Cura o aliado mais ferido em (${115 + l * 55} + ${120 + l * 25}% AP) e concede ${60 + l * 40} de Escudo.` },
    cl_prece: { name: 'Prece Coletiva', type: 'ativa', icon: '🌟', desc: l => `Cura todos os aliados em (${65 + l * 35} + 75% AP) e restaura ${10 + l * 8} de Mana.` },
    cl_graca: { name: 'Graça Divina', type: 'passiva', icon: '🕊️', desc: l => `+${l * 22}% de eficácia em Curas e Escudos.` },
    cl_aura_mana: { name: 'Fonte Espiritual', type: 'passiva', icon: '💧', desc: l => `+${l * 18}% AP e +${l * 5} Mana por ataque.` },

    at_torreta: { name: 'Implante de Torreta', type: 'ativa', icon: '⚙️', desc: l => `Invoca Torreta (${260 + l * 140} HP, ${38 + l * 22} AD) que atira nos inimigos.` },
    at_sobrecarga: { name: 'Descarga Voltaica', type: 'ativa', icon: '⚡', desc: l => `Feixe que atinge ${1 + l} inimigos: (${85 + l * 40} + 110% AP).` },
    at_engrenagem: { name: 'Engenharia Precisa', type: 'passiva', icon: '🔧', desc: l => `+${l * 16}% Vel. Ataque e +${l * 16}% AP.` },
    at_campo_forca: { name: 'Campo de Força', type: 'passiva', icon: '🔋', desc: l => `Começa com +${l * 140} Escudo e +${l * 15} Mana.` },

    be_furia: { name: 'Fúria Carmesim', type: 'ativa', icon: '🪓', desc: l => `Golpe em área: (${85 + l * 45} + ${115 + l * 20}% AD), cura ${10 + l * 5}% da Vida perdida.` },
    be_corte_giratorio: { name: 'Turbilhão de Aço', type: 'ativa', icon: '🌪️', desc: l => `Gira o machado: (${75 + l * 40} + 95% AD) em todos ao redor.` },
    be_sede_sangue: { name: 'Sede de Sangue', type: 'passiva', icon: '🩸', desc: l => `+${l * 11}% Roubo de Vida (dobra abaixo de 50% HP).` },
    be_pele_ferro: { name: 'Frenesi Indomável', type: 'passiva', icon: '🔥', desc: l => `+${l * 15}% AD e +${l * 140} Vida Máxima.` },

    ln_estocada: { name: 'Estocada Perfurante', type: 'ativa', icon: '🔱', desc: l => `Perfura o alvo e quem estiver atrás: (${70 + l * 40} + 110% AD), ignora ${20 + l * 10}% da Armadura.` },
    ln_varredura: { name: 'Varredura de Haste', type: 'ativa', icon: '〰️', desc: l => `Gira a lança em raio 2.3: (${60 + l * 35} + 90% AD) e lentidão de 35% por ${(1 + l * 0.5).toFixed(1)}s.` },
    ln_postura: { name: 'Postura Defensiva', type: 'passiva', icon: '🧱', desc: l => `+${l * 12} Armadura e +${l * 8}% Esquiva.` },
    ln_primeiro: { name: 'Primeiro Sangue', type: 'passiva', icon: '🩸', desc: l => `+${l * 20}% de dano contra alvos acima de 70% de Vida.` },

    dr_raizes: { name: 'Raízes Constritoras', type: 'ativa', icon: '🌱', desc: l => `Enraíza ${1 + l} inimigos por ${(1 + l * 0.3).toFixed(1)}s: (${60 + l * 30} + 80% AP) mágico.` },
    dr_lobo: { name: 'Chamado Selvagem', type: 'ativa', icon: '🐺', desc: l => `Invoca Lobo Espiritual (${300 + l * 150} HP, ${35 + l * 20} AD) corpo a corpo.` },
    dr_seiva: { name: 'Seiva Vital', type: 'passiva', icon: '🍃', desc: l => `A cada 1s cura aliados em raio 2.5 em (${6 * l} + ${5 * l}% AP).` },
    dr_casca: { name: 'Casca de Carvalho', type: 'passiva', icon: '🌳', desc: l => `+${l * 120} Vida e -${l * 7}% de dano sofrido.` },

    pa_martelo: { name: 'Martelo da Justiça', type: 'ativa', icon: '🔨', desc: l => `Golpe sagrado: (${70 + l * 40} + 90% AD + 50% AP) mágico, atordoa ${(1 + l * 0.3).toFixed(1)}s e cura o aliado mais ferido em 50% do dano.` },
    pa_consagrar: { name: 'Solo Consagrado', type: 'ativa', icon: '✝️', desc: l => `Raio 2.0: (${55 + l * 30} + 70% AP) aos inimigos e cura aliados em (${40 + l * 25} + 50% AP).` },
    pa_aura: { name: 'Aura de Proteção', type: 'passiva', icon: '🔆', desc: l => `Aliados em raio 2.5 (inclusive ele) sofrem -${l * 5}% de dano.` },
    pa_fe: { name: 'Fé Inabalável', type: 'passiva', icon: '🙏', desc: l => `+${l * 12}% Vida e +${l * 10} Armadura.` },

    mo_palma: { name: 'Palma do Dragão', type: 'ativa', icon: '🐉', desc: l => `(${60 + l * 35} + 100% AD), empurra o alvo 1.5 casa e atordoa ${(0.6 + l * 0.2).toFixed(1)}s.` },
    mo_rajada: { name: 'Cem Golpes', type: 'ativa', icon: '💢', desc: l => `${3 + l} golpes rápidos de (${20 + l * 10} + 40% AD) no alvo.` },
    mo_fluxo: { name: 'Fluxo do Chi', type: 'passiva', icon: '☯️', desc: l => `+${l * 5} Mana por ataque e +${l * 8}% Vel. Ataque.` },
    mo_serenidade: { name: 'Serenidade', type: 'passiva', icon: '🍃', desc: l => `+${l * 10}% Esquiva.` },

    al_frasco: { name: 'Frasco Corrosivo', type: 'ativa', icon: '🧪', desc: l => `Explode em raio 1.6: (${70 + l * 35} + 90% AP) mágico e -${l * 10} Armadura permanente nos atingidos.` },
    al_nevoa: { name: 'Névoa Tóxica', type: 'ativa', icon: '☁️', desc: l => `Envenena inimigos em raio 2.0 por 4s: (${15 + l * 10} + 20% AP)/s.` },
    al_catalise: { name: 'Catálise', type: 'passiva', icon: '🔬', desc: l => `+${l * 15}% AP e -${l * 8}% de Mana Máxima.` },
    al_transmutar: { name: 'Transmutação', type: 'passiva', icon: '🪙', desc: l => `Se estiver em campo numa vitória: +${l * 8}g.` },

    bd_hino: { name: 'Hino de Guerra', type: 'ativa', icon: '🎺', desc: l => `Todos os aliados ganham +${20 + l * 10}% Vel. Ataque por 4s.` },
    bd_balada: { name: 'Balada Restauradora', type: 'ativa', icon: '🎶', desc: l => `Cura aliados em raio 3 em (${60 + l * 30} + 60% AP) e restaura 15 de Mana.` },
    bd_inspirar: { name: 'Inspiração', type: 'passiva', icon: '🎵', desc: l => `Aliados em raio 2.5 causam +${l * 6}% de dano.` },
    bd_ritmo: { name: 'Ritmo', type: 'passiva', icon: '🥁', desc: l => `+${l * 12} Mana inicial e +${l * 3} Mana/s.` },

    ne_erguer: { name: 'Erguer Mortos', type: 'ativa', icon: '💀', desc: l => `Invoca ${l >= 3 ? 2 : 1} Esqueleto(s) (${200 + l * 100} HP, ${30 + l * 15} AD).` },
    ne_drenar: { name: 'Drenar Vida', type: 'ativa', icon: '🩸', desc: l => `Feixe: (${90 + l * 45} + 100% AP) mágico; cura-se em 50% do dano.` },
    ne_colheita: { name: 'Colheita de Almas', type: 'passiva', icon: '👻', desc: l => `Cada morte no combate (de qualquer lado) concede +${l * 4}% AP.` },
    ne_pacto: { name: 'Pacto Sombrio', type: 'passiva', icon: '📕', desc: l => `+${l * 10}% Roubo de Vida e invocações com +${l * 20}% Vida.` }
  };
  for (const [id, sk] of Object.entries(SKILLS)) sk.id = id;

  /* ---------------- 6 ELEMENTOS (stacks individuais + sinergia 2/4/6/8) ---- */
  const ELEMENTS = {
    fogo: { id: 'fogo', name: 'Fogo', icon: '🔥', color: '#ef4444', personalDesc: '+12% AD/AP por stack',
      tiersText: 'Queimadura (2%/3.5%/5%/7% HP/s); inimigos queimando explodem ao morrer (15%/25%/35%/50% HP).',
      burnPct: [0.02, 0.035, 0.05, 0.07], explodePct: [0.15, 0.25, 0.35, 0.50] },
    agua: { id: 'agua', name: 'Água', icon: '💧', color: '#38bdf8', personalDesc: '+15 Mana Máx e +8 AP por stack',
      tiersText: '+4/+8/+13/+20 Mana/s; habilidades aplicam lentidão (25%/35%/45%/55%).',
      manaRegen: [4, 8, 13, 20], chillAmt: [0.25, 0.35, 0.45, 0.55] },
    pedra: { id: 'pedra', name: 'Pedra', icon: '🪨', color: '#d97706', personalDesc: '+14 Armadura e +90 HP por stack',
      tiersText: '+20/+45/+75/+115 Armadura e Escudo inicial de 15%/30%/50%/75% da Vida.',
      armorBonus: [20, 45, 75, 115], shieldPct: [0.15, 0.30, 0.50, 0.75] },
    ar: { id: 'ar', name: 'Ar', icon: '🌪️', color: '#34d399', personalDesc: '+12% Vel. Ataque por stack',
      tiersText: '+15%/30%/50%/75% Vel. Ataque, +10%/18%/26%/35% Esquiva e raios em cadeia a cada 4 ataques.',
      asMult: [0.15, 0.30, 0.50, 0.75], dodge: [0.10, 0.18, 0.26, 0.35], chainTargets: [2, 3, 4, 5] },
    solar: { id: 'solar', name: 'Solar', icon: '☀️', color: '#facc15', personalDesc: '+10% Crítico e +10 AD por stack',
      tiersText: '+12%/22%/35%/50% Dano Verdadeiro e Aura Solar (-10%/-18%/-25%/-35% dano de inimigos próximos).',
      trueDmgPct: [0.12, 0.22, 0.35, 0.50], auraReduce: [0.10, 0.18, 0.25, 0.35] },
    lunar: { id: 'lunar', name: 'Lunar', icon: '🌙', color: '#c084fc', personalDesc: '+10% Dano Crítico e +10 AP por stack',
      tiersText: '+12%/22%/35%/50% Roubo de Vida e +35%/70%/110%/160% Dano Crítico.',
      lifesteal: [0.12, 0.22, 0.35, 0.50], critDmg: [0.35, 0.70, 1.10, 1.60] }
  };

  /* ---------------- 9 ORDENS: 5 Classes (função) + 4 Origens --------------
     Cada arquétipo pertence a 1 Classe e 1 Origem. Os limiares são por ordem. */
  const ORDERS = {
    bastiao: { id: 'bastiao', kind: 'Classe', name: 'Bastião', icon: '🏰', color: '#60a5fa', thresholds: [2, 4, 6],
      tiersText: 'Membros: +15%/30%/50% Vida e +10/25/45 Armadura.',
      tiers: [{ hpPct: 0.15, armor: 10 }, { hpPct: 0.30, armor: 25 }, { hpPct: 0.50, armor: 45 }] },
    lamina: { id: 'lamina', kind: 'Classe', name: 'Lâmina', icon: '⚔️', color: '#f87171', thresholds: [2, 4, 6],
      tiersText: 'Membros: +10%/20%/35% Crítico e +20%/40%/70% Dano Crítico.',
      tiers: [{ crit: 0.10, critDmg: 0.20 }, { crit: 0.20, critDmg: 0.40 }, { crit: 0.35, critDmg: 0.70 }] },
    arcano: { id: 'arcano', kind: 'Classe', name: 'Arcano', icon: '📜', color: '#c084fc', thresholds: [2, 4, 6],
      tiersText: 'Membros: +15%/30%/50% AP e +2/4/7 Mana/s.',
      tiers: [{ apPct: 0.15, manaRegen: 2 }, { apPct: 0.30, manaRegen: 4 }, { apPct: 0.50, manaRegen: 7 }] },
    devocao: { id: 'devocao', kind: 'Classe', name: 'Devoção', icon: '🕯️', color: '#a3e635', thresholds: [2, 4, 6],
      tiersText: 'TODO o time: +15%/30%/50% Cura e Escudo. Membros: +15/30/50 Mana inicial.',
      tiers: [{ healAll: 0.15, startMana: 15 }, { healAll: 0.30, startMana: 30 }, { healAll: 0.50, startMana: 50 }] },
    invocador: { id: 'invocador', kind: 'Classe', name: 'Invocador', icon: '🪄', color: '#fbbf24', thresholds: [2, 4, 6],
      tiersText: 'Invocações dos membros com +25%/55%/100% Vida e Dano. Membros: +10/20/35 Mana inicial.',
      tiers: [{ summonMult: 0.25, startMana: 10 }, { summonMult: 0.55, startMana: 20 }, { summonMult: 1.0, startMana: 35 }] },
    selvagem: { id: 'selvagem', kind: 'Origem', name: 'Selvagem', icon: '🐾', color: '#4ade80', thresholds: [2, 3, 4],
      tiersText: 'Membros: regeneram 1%/1.8%/3% da Vida por segundo e +10%/15%/25% Vel. Ataque.',
      tiers: [{ regenPct: 0.010, asPct: 0.10 }, { regenPct: 0.018, asPct: 0.15 }, { regenPct: 0.030, asPct: 0.25 }] },
    oculto: { id: 'oculto', kind: 'Origem', name: 'Oculto', icon: '🌘', color: '#818cf8', thresholds: [2, 3, 4],
      tiersText: 'Membros: +10%/18%/28% Roubo de Vida e +15%/25%/40% de dano em alvos abaixo de 45% de Vida.',
      tiers: [{ lifesteal: 0.10, execute: 0.15 }, { lifesteal: 0.18, execute: 0.25 }, { lifesteal: 0.28, execute: 0.40 }] },
    celestial: { id: 'celestial', kind: 'Origem', name: 'Celestial', icon: '🌞', color: '#fde68a', thresholds: [2, 3, 4],
      tiersText: 'TODO o time: Escudo inicial de 6%/12%/20% da Vida. Membros: +10%/18%/28% Dano Verdadeiro.',
      tiers: [{ teamShield: 0.06, trueDmg: 0.10 }, { teamShield: 0.12, trueDmg: 0.18 }, { teamShield: 0.20, trueDmg: 0.28 }] },
    engenho: { id: 'engenho', kind: 'Origem', name: 'Engenho', icon: '🔩', color: '#94a3b8', thresholds: [2, 3, 4],
      tiersText: 'Membros: +15/30/50 Armadura e +10%/20%/35% Penetração de Armadura.',
      tiers: [{ armor: 15, armorPen: 0.10 }, { armor: 30, armorPen: 0.20 }, { armor: 50, armorPen: 0.35 }] }
  };
  for (const o of Object.values(ORDERS)) o.members = Object.values(ARCHETYPES).filter(a => a.orders.includes(o.id)).map(a => a.id);

  /* ---------------- 24 RELÍQUIAS com raridade ----------------------------- */
  const RELICS = {
    coroa_lobo: { name: 'Coroa do Lobo Solitário', icon: '🐺', rarity: 'rara', desc: 'Com 3 ou menos unidades em campo: +65% Vida, +55% Dano e +35% XP.' },
    estandarte_legiao: { name: 'Estandarte da Legião', icon: '🚩', rarity: 'rara', desc: 'Cada unidade em campo acima de 5 concede +7% Vel. Ataque e +10 Armadura a todo o exército.' },
    prisma_elemental: { name: 'Prisma Elemental', icon: '💎', rarity: 'lendaria', desc: 'Unidades com 3+ elementos diferentes recebem +35% em Vida, AD, AP e Armadura.' },
    reator_mana: { name: 'Reator de Mana', icon: '⚛️', rarity: 'rara', desc: 'Habilidades custam 25% menos Mana e todo dano aumenta 25%.' },
    cofre_mercador: { name: 'Cofre do Mercador', icon: '💰', rarity: 'comum', desc: '+15g por vitória e +1% de dano para cada 15g guardados.' },
    fenix_cinzas: { name: 'Fênix de Cinzas', icon: '🦅', rarity: 'lendaria', desc: 'A primeira unidade aliada a morrer em cada combate revive com 45% de HP e explode em fogo.' },
    martelo_ferreiro: { name: 'Martelo do Ferreiro', icon: '🔨', rarity: 'comum', desc: 'Unidades com 2+ itens ganham +30% de Dano e Escudo de 25% da Vida.' },
    ampulheta_temporal: { name: 'Ampulheta Temporal', icon: '⏳', rarity: 'comum', desc: 'Todos os aliados começam o combate com +40 de Mana.' },
    orbe_sobrecarga: { name: 'Orbe de Sobrecarga', icon: '🔮', rarity: 'rara', desc: 'Cada conjuração concede +12% AP acumulável durante o combate.' },
    egide_tita: { name: 'Égide do Titã', icon: '🏛️', rarity: 'comum', desc: 'Unidades nas duas linhas da frente (6 e 7) ganham +35% Vida e +25 Armadura.' },
    lente_atirador: { name: 'Lente do Atirador', icon: '🔭', rarity: 'comum', desc: 'Unidades nas duas linhas de trás (10 e 11) ganham +25% Crítico e +1.0 de Alcance.' },
    calice_sangue: { name: 'Cálice Carmesim', icon: '🍷', rarity: 'rara', desc: 'Ao abater, cura 20% da Vida e ganha +25% Vel. Ataque por 4s.' },
    tomo_evolucao: { name: 'Tomo da Evolução', icon: '📖', rarity: 'comum', desc: '+25% de XP em todas as salas. Ao obter: +1 PE para a unidade de maior nível.' },
    nucleo_instavel: { name: 'Núcleo Instável', icon: '💣', rarity: 'rara', desc: 'No início do combate, inimigos sofrem 15% da Vida Máxima.' },
    bencao_celestial: { name: 'Bênção Celestial', icon: '🌟', rarity: 'comum', desc: 'Escudos e curas aplicados por aliados são 40% mais fortes.' },
    coracao_forja: { name: 'Coração da Forja', icon: '🔥', rarity: 'lendaria', desc: '+15% Dano e Vida por item equipado. Ao obter: forja 1 item aleatório.' },
    sino_guerra: { name: 'Sino de Guerra', icon: '🔔', rarity: 'comum', desc: 'Aliados começam o combate com +30% Vel. Ataque por 5s.' },
    anel_eco: { name: 'Anel do Eco', icon: '💍', rarity: 'lendaria', desc: 'Habilidades têm 20% de chance de serem conjuradas duas vezes.' },
    lanterna_ancestral: { name: 'Lanterna Ancestral', icon: '🏮', rarity: 'rara', desc: 'Cada Chefe derrotado concede +1 PE a todas as unidades em campo.' },
    bussola_explorador: { name: 'Bússola do Explorador', icon: '🧭', rarity: 'comum', desc: 'Salas não-combate concedem +25g ao serem visitadas.' },
    escudo_vigia: { name: 'Escudo do Vigia', icon: '🔰', rarity: 'comum', desc: 'Aliados começam com Escudo de 12% da Vida Máxima.' },
    presa_vampira: { name: 'Presa Vampírica', icon: '🦇', rarity: 'rara', desc: '+10% Roubo de Vida para todo o time.' },
    teia_arcana: { name: 'Teia Arcana', icon: '🕸️', rarity: 'rara', desc: 'Inimigos começam o combate com 35% de lentidão por 4s.' },
    cristal_sinergia: { name: 'Cristal de Sinergia', icon: '🔷', rarity: 'lendaria', desc: 'Cada elemento já ativo no time (1+ stack) conta +1 stack para a sinergia.' }
  };
  for (const [id, r] of Object.entries(RELICS)) r.id = id;
  const RARITY = {
    comum: { name: 'Comum', color: '#94a3b8' },
    rara: { name: 'Rara', color: '#38bdf8' },
    lendaria: { name: 'Lendária', color: '#f59e0b' }
  };

  /* ---------------- 16 ITENS (tiers ★1–★3 por fusão) ----------------------- */
  const ITEMS = {
    lamina_solar: { name: 'Lâmina Solar', icon: '🗡️', stats: { ad: 35, critChance: 0.15, trueDmgBonus: 0.15 } },
    egide_pedra: { name: 'Égide de Pedra', icon: '🛡️', stats: { maxHp: 320, armor: 35, dmgReduction: 0.12 } },
    cajado_abissal: { name: 'Cajado Abissal', icon: '🪄', stats: { ap: 45, startMana: 25, magicPen: 0.20 } },
    botas_vendaval: { name: 'Botas do Vendaval', icon: '👢', stats: { asMult: 0.35, dodge: 0.15, moveSpeed: 0.8 } },
    foice_lunar: { name: 'Foice Lunar', icon: '🌙', stats: { ad: 25, lifesteal: 0.20, critDmg: 0.40 } },
    nucleo_arcano: { name: 'Núcleo Arcano', icon: '💠', stats: { ap: 30, manaRegen: 6, manaRefund: 25 } },
    armadura_espinhos: { name: 'Armadura de Espinhos', icon: '🦔', stats: { maxHp: 250, armor: 40, thorns: 0.30 } },
    coroa_estrategista: { name: 'Coroa do Estrategista', icon: '👑', stats: { ad: 20, ap: 20, maxHp: 200, xpMult: 0.25 } },
    arco_tempestade: { name: 'Arco da Tempestade', icon: '🏹', stats: { ad: 25, asMult: 0.25, range: 1.0 } },
    calice_harmonia: { name: 'Cálice da Harmonia', icon: '🏆', stats: { ap: 30, maxHp: 200, healMult: 0.30 } },
    manopla_colosso: { name: 'Manopla do Colosso', icon: '🥊', stats: { maxHp: 450, ad: 22, initialShield: 200 } },
    adaga_crepusculo: { name: 'Adaga do Crepúsculo', icon: '🔪', stats: { ad: 30, critChance: 0.25, executeBonus: 0.30 } },
    lanca_rompedor: { name: 'Lança do Rompedor', icon: '⛏️', stats: { ad: 28, armorPen: 0.25, critChance: 0.08 } },
    totem_vital: { name: 'Totem Vital', icon: '🪵', stats: { maxHp: 280, regenPct: 0.012, armor: 12 } },
    amuleto_vigia: { name: 'Amuleto do Vigia', icon: '📿', stats: { armor: 22, dodge: 0.12, startMana: 15 } },
    sino_pressa: { name: 'Sino da Pressa', icon: '⏱️', stats: { asMult: 0.20, manaPerAttack: 8, ap: 15 } }
  };
  const STAT_LABELS = {
    ad: ['AD', v => `+${Math.round(v)}`], ap: ['AP', v => `+${Math.round(v)}`], maxHp: ['Vida', v => `+${Math.round(v)}`],
    armor: ['Armadura', v => `+${Math.round(v)}`], critChance: ['Crítico', v => `+${Math.round(v * 100)}%`],
    critDmg: ['Dano Crítico', v => `+${Math.round(v * 100)}%`], trueDmgBonus: ['Dano Verdadeiro', v => `+${Math.round(v * 100)}%`],
    dmgReduction: ['Redução de Dano', v => `${Math.round(Math.min(0.6, v) * 100)}%`], startMana: ['Mana Inicial', v => `+${Math.round(v)}`],
    magicPen: ['Pen. Mágica', v => `+${Math.round(v * 100)}%`], asMult: ['Vel. Ataque', v => `+${Math.round(v * 100)}%`],
    dodge: ['Esquiva', v => `+${Math.round(v * 100)}%`], moveSpeed: ['Vel. Mov.', v => `+${v.toFixed(1)}`],
    lifesteal: ['Roubo de Vida', v => `+${Math.round(v * 100)}%`], manaRegen: ['Mana/s', v => `+${v.toFixed(1)}`],
    manaRefund: ['Mana ao conjurar', v => `+${Math.round(v)}`], thorns: ['Reflexão', v => `${Math.round(v * 100)}%`],
    xpMult: ['XP', v => `+${Math.round(v * 100)}%`], range: ['Alcance', v => `+${v.toFixed(1)}`],
    healMult: ['Cura/Escudo', v => `+${Math.round(v * 100)}%`], initialShield: ['Escudo Inicial', v => `+${Math.round(v)}`],
    executeBonus: ['Dano vs <45% HP', v => `+${Math.round(v * 100)}%`], armorPen: ['Pen. Armadura', v => `+${Math.round(v * 100)}%`],
    regenPct: ['Regeneração', v => `${(v * 100).toFixed(1)}% HP/s`], manaPerAttack: ['Mana/ataque', v => `+${Math.round(v)}`]
  };
  for (const [id, it] of Object.entries(ITEMS)) {
    it.id = id;
    it.descFor = (tier = 1) => {
      const m = CONFIG.ITEM_TIER_MULT[tier - 1] || 1;
      return Object.entries(it.stats).map(([k, v]) => {
        const lab = STAT_LABELS[k];
        return lab ? `${lab[1](v * m)} ${lab[0]}` : '';
      }).filter(Boolean).join(', ');
    };
  }

  /* ---------------- ARENAS ---------------------------------------------------- */
  const ARENA = {
    padrao: { name: 'Campo Neutro', icon: '🌿', desc: 'Sem alterações.' },
    tempestade_arcana: { name: 'Tempestade Arcana', icon: '⚡', desc: '+35% Regeneração de Mana para todos.' },
    solo_vulcanico: { name: 'Solo Vulcânico', icon: '🌋', desc: '+22% Dano causado por todos.' },
    nevoa_densa: { name: 'Névoa Densa', icon: '🌫️', desc: '+18% Esquiva para todos.' },
    arena_sagrada: { name: 'Arena Sagrada', icon: '✨', desc: '+30% Curas e Escudos.' },
    vento_cortante: { name: 'Vento Cortante', icon: '💨', desc: '+25% Vel. Ataque para todos.' },
    eclipse_sombrio: { name: 'Eclipse Sombrio', icon: '🌑', desc: '+20% Roubo de Vida e +25% Dano Crítico.' }
  };

  /* ---------------- ATOS, FACÇÕES INIMIGAS E CHEFES ---------------------------- */
  const ACTS = {
    1: { name: 'Floresta Cinzenta', short: 'ATO I', palette: { enemyA: '#131d1b', enemyB: '#0f1715', playerA: '#132229', playerB: '#0e1a20', divider: 'rgba(16,185,129,.45)' },
      enemyColor: '#65a30d',
      faction: { vanguarda: ['Tronco Animado', '🪵'], berserker: ['Lobo Cinzento', '🐺'], cacador: ['Arqueiro Goblin', '🏹'], arcanista: ['Xamã Fúngico', '🍄'], sombra: ['Aranha Sombria', '🕷️'], clerigo: ['Espírito do Bosque', '🌫️'], artifice: ['Goblin Engenhoqueiro', '🔩'], lanceiro: ['Batedor Silvano', '🔱'], druida: ['Ent Jovem', '🌳'], paladino: ['Cavaleiro Silvestre', '🐗'], monge: ['Macaco Lutador', '🐒'], alquimista: ['Bruxa do Brejo', '🧪'], bardo: ['Fada Cantora', '🧚'], necromante: ['Coruja Agourenta', '🦉'] } },
    2: { name: 'Ruínas Solares', short: 'ATO II', palette: { enemyA: '#241b12', enemyB: '#1c150e', playerA: '#1c2233', playerB: '#151a28', divider: 'rgba(245,158,11,.5)' },
      enemyColor: '#d97706',
      faction: { vanguarda: ['Golem de Areia', '🗿'], berserker: ['Escorpião Rubro', '🦂'], cacador: ['Sentinela Solar', '☀️'], arcanista: ['Sacerdote Dourado', '📿'], sombra: ['Múmia Furtiva', '🧟'], clerigo: ['Oráculo das Dunas', '🔆'], artifice: ['Autômato de Bronze', '🤖'], lanceiro: ['Guarda do Templo', '🔱'], druida: ['Cacto Ancestral', '🌵'], paladino: ['Templário do Sol', '🛕'], monge: ['Monge do Deserto', '🧘'], alquimista: ['Alquimista de Âmbar', '🏺'], bardo: ['Encantador de Serpentes', '🐍'], necromante: ['Embalsamador', '⚱️'] } },
    3: { name: 'Abismo do Eclipse', short: 'ATO III', palette: { enemyA: '#231126', enemyB: '#190c1c', playerA: '#151930', playerB: '#0f1326', divider: 'rgba(192,132,252,.5)' },
      enemyColor: '#9333ea',
      faction: { vanguarda: ['Cavaleiro do Vazio', '♜'], berserker: ['Devorador Abissal', '👹'], cacador: ['Atirador Espectral', '🏹'], arcanista: ['Lich Menor', '💀'], sombra: ['Espectro', '👻'], clerigo: ['Acólito do Eclipse', '🕯️'], artifice: ['Forja-Viva', '⚙️'], lanceiro: ['Lanceiro Caído', '🔱'], druida: ['Raiz Corrompida', '🥀'], paladino: ['Cavaleiro Profano', '🗡️'], monge: ['Asceta do Vazio', '🌀'], alquimista: ['Destilador de Almas', '🧫'], bardo: ['Sirene Abissal', '🧜'], necromante: ['Arquilich', '👿'] } }
  };

  const BOSSES = {
    1: { name: 'Colosso de Obsidiana', symbol: '🗿', color: '#d97706', script: 'colosso', elements: { pedra: 2, fogo: 2 }, skills: { vg_impacto: 2, vg_bastiao: 2 }, hpMult: 2.6, adMult: 1.35, apMult: 1.35,
      mechanic: 'Abaixo de 50% de Vida entra em Fúria Ígnea: +50% AD, +30% Vel. Ataque e Escudo de 15% da Vida.' },
    2: { name: 'Leviatã das Marés', symbol: '🐉', color: '#0284c7', script: 'leviata', elements: { agua: 3, ar: 2 }, skills: { ar_orbe: 2, cl_prece: 2 }, hpMult: 3.3, adMult: 1.5, apMult: 1.65,
      mechanic: 'A cada 9s invoca 2 Crias das Marés. Abaixo de 50%: Maremoto deixa todo o seu time lento por 4s.' },
    3: { name: 'Arconte do Eclipse', symbol: '👁️', color: '#9333ea', script: 'arconte', elements: { solar: 3, lunar: 3, fogo: 2 }, skills: { ar_meteoro: 3, vg_impacto: 3, cl_luz: 2 }, hpMult: 4.2, adMult: 1.7, apMult: 1.85,
      mechanic: 'Alterna a cada 10s entre Fase Solar (+40% Dano Verdadeiro) e Fase Lunar (+40% Roubo de Vida). Abaixo de 30%: Eclipse Total causa 20% da Vida a todo o seu time.' }
  };

  const ELITE_AFFIXES = {
    blindado: { name: 'Blindado', icon: '🛡️', color: '#93c5fd', desc: '+50% Armadura e +30% Vida.' },
    veloz: { name: 'Veloz', icon: '💨', color: '#6ee7b7', desc: '+40% Vel. Ataque e +1 Vel. Mov.' },
    vampirico: { name: 'Vampírico', icon: '🦇', color: '#f87171', desc: '+25% Roubo de Vida.' },
    explosivo: { name: 'Explosivo', icon: '💥', color: '#fb923c', desc: 'Ao morrer explode causando 20% da sua Vida em seu time.' },
    regenerativo: { name: 'Regenerativo', icon: '♻️', color: '#86efac', desc: 'Regenera 2% da Vida por segundo.' }
  };

  /* ---------------- MAPA ------------------------------------------------------ */
  const NODE_TYPES = {
    combate: { name: 'Combate', icon: '⚔️', color: '#94a3b8', desc: 'Horda padrão. Ouro, XP e chance de item.' },
    elite: { name: 'Elite', icon: '💀', color: '#f87171', desc: 'Comandante com afixos. Relíquia garantida.' },
    chefe: { name: 'Chefe', icon: '👑', color: '#facc15', desc: 'Guardião do Ato com mecânicas próprias.' },
    forja: { name: 'Forja Rúnica', icon: '⚒️', color: '#fbbf24', desc: 'Escolha 1 de 3 itens ou aprimore um item.' },
    santuario: { name: 'Santuário', icon: '🔮', color: '#c084fc', desc: 'Bênçãos elementais e pactos arriscados.' },
    acampamento: { name: 'Acampamento', icon: '🏕️', color: '#34d399', desc: 'Repare a Cidadela, treine ou saqueie.' },
    mercador: { name: 'Mercador', icon: '🛒', color: '#38bdf8', desc: 'Compre itens, relíquias e serviços.' },
    misterio: { name: 'Mistério', icon: '❓', color: '#e2e8f0', desc: 'Um encontro inesperado. Risco e recompensa.' }
  };

  /* ---------------- META-PROGRESSÃO E ASCENSÃO -------------------------------- */
  const META_UPGRADES = {
    goldStart: { name: 'Tesouro Inicial', icon: '🪙', maxLevel: 5, baseCost: 30, desc: l => `+${l * 15}g ao iniciar (próximo: +${(l + 1) * 15}g).` },
    citadelMax: { name: 'Muralhas da Cidadela', icon: '🏰', maxLevel: 5, baseCost: 35, desc: l => `+${l * 10} Vida Máxima da Cidadela (próximo: +${(l + 1) * 10}).` },
    xpBonus: { name: 'Sabedoria Ancestral', icon: '📘', maxLevel: 5, baseCost: 40, desc: l => `+${l * 8}% de XP em todas as salas (próximo: +${(l + 1) * 8}%).` },
    relicStart: { name: 'Herança Arcana', icon: '🏺', maxLevel: 3, baseCost: 50, desc: l => l === 0 ? 'Nv.1: escolha 1 Relíquia inicial gratuita.' : `Relíquia inicial + ${l * 10}g por Chefe derrotado.` },
    mentor: { name: 'Mentoria', icon: '🎓', maxLevel: 2, baseCost: 60, desc: l => `As primeiras ${l} unidade(s) recrutadas começam com +1 PE (próximo: ${l + 1}).` },
    contatos: { name: 'Contatos Comerciais', icon: '🤝', maxLevel: 3, baseCost: 45, desc: l => `-${l * 5}% no custo de recrutamento e do Mercador (próximo: -${(l + 1) * 5}%).` }
  };

  const ASCENSIONS = [
    { level: 0, name: 'Expedição Padrão', desc: 'A experiência base.' },
    { level: 1, name: 'Ascensão I', desc: 'Inimigos +6% em Vida e Dano por nível de Ascensão.' },
    { level: 2, name: 'Ascensão II', desc: 'Acima, e começa com -30g.' },
    { level: 3, name: 'Ascensão III', desc: 'Acima, e Elites aparecem com mais frequência.' },
    { level: 4, name: 'Ascensão IV', desc: 'Acima, e a Cidadela começa com -20 de Vida.' },
    { level: 5, name: 'Ascensão V', desc: 'Acima, e inimigos comuns (a partir da Sala 3) ganham 1 stack elemental extra.' }
  ];

  /* ---------------- TERRENO (12x12) ------------------------------------------
     Cada casa do tabuleiro tem um tipo. Bloqueados impedem passagem e
     posicionamento; os demais alteram o combate de quem está sobre eles. */
  const TERRAIN = {
    '.': { name: 'Campo', icon: '', blocked: false, desc: 'Sem efeito.' },
    M: { name: 'Montanha', icon: '⛰️', blocked: true, desc: 'Intransponível. Força as unidades a contornar.' },
    W: { name: 'Água', icon: '🌊', blocked: true, desc: 'Lago ou rio: intransponível. Atravesse pelas pontes.' },
    R: { name: 'Ravina', icon: '🕳️', blocked: true, desc: 'Abismo intransponível. Atravesse pelas pontes.' },
    P: { name: 'Pilar em Ruínas', icon: '🏛️', blocked: true, desc: 'Obstáculo de pedra intransponível.' },
    B: { name: 'Ponte', icon: '🌉', blocked: false, desc: 'Única passagem sobre água e ravinas — um gargalo tático.' },
    F: { name: 'Floresta', icon: '🌲', blocked: false, desc: '+15% de Esquiva contra ataques físicos para quem está nela.' },
    H: { name: 'Colina', icon: '⛰', blocked: false, desc: 'Unidades à distância ganham +1 de Alcance e +10% de dano.' },
    S: { name: 'Pântano', icon: '🪷', blocked: false, desc: '-45% de Velocidade de Movimento.' },
    L: { name: 'Lava', icon: '🔥', blocked: false, desc: 'Causa 3% da Vida Máxima por segundo a quem estiver sobre ela.' }
  };

  const LAYOUTS = {
    planicie: { name: 'Planície Aberta', icon: '🌾', acts: [1, 2], desc: 'Terreno aberto com poucos bosques e colinas.' },
    floresta: { name: 'Floresta Densa', icon: '🌲', acts: [1], desc: 'Muitas árvores dão esquiva; rochas pelo caminho.' },
    rio: { name: 'Rio das Pontes', icon: '🌉', acts: [1, 2], desc: 'Um rio corta o campo ao meio: só se cruza pelas pontes.' },
    lago: { name: 'Lago Central', icon: '🏞️', acts: [1, 2, 3], desc: 'Um lago no centro divide o combate em dois flancos.' },
    montanha: { name: 'Passo da Montanha', icon: '🏔️', acts: [1, 2, 3], desc: 'Uma cordilheira com poucas passagens estreitas e colinas.' },
    pantano: { name: 'Pântano Sombrio', icon: '🪷', acts: [1, 3], desc: 'Lama que retarda o avanço e pequenas poças.' },
    ravina: { name: 'Ravina Partida', icon: '🕳️', acts: [2, 3], desc: 'Um abismo vertical separa os flancos; pontes nas pontas.' },
    ruinas: { name: 'Ruínas Antigas', icon: '🏛️', acts: [2, 3], desc: 'Pilares de pedra criam corredores e esconderijos.' },
    magma: { name: 'Campos de Magma', icon: '🌋', acts: [3], desc: 'Rios de lava ferem quem os atravessa; rochas de obsidiana.' }
  };

  FE.Data = { CONFIG, ARCHETYPES, SKILLS, ELEMENTS, ORDERS, RELICS, RARITY, ITEMS, STAT_LABELS, ARENA, ACTS, BOSSES, ELITE_AFFIXES, NODE_TYPES, META_UPGRADES, ASCENSIONS, TERRAIN, LAYOUTS };
})(typeof window !== 'undefined' ? window : globalThis);
