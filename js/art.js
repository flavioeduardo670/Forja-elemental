/* ==========================================================================
   FORJA ELEMENTAL 3.1 — art.js
   Arte vetorial própria das unidades (sem emojis): cada arquétipo, invocação
   e chefe é um emblema em SVG (viewBox 64×64). O mesmo desenho é usado no
   canvas (via Path2D) e no DOM (via <svg>), então tabuleiro, banco, Quartel e
   Inspetor falam a mesma língua visual.
   Camadas: f = preenchimento ('ink' claro, 'cut' recorte escuro, 'acc' cor de
   destaque), s = traço (mesmas chaves) com w = espessura.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE;

  function gear(cx, cy, rOut, rIn, teeth) {
    let d = '';
    const step = Math.PI * 2 / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      const pts = [[a - step * 0.22, rIn], [a - step * 0.14, rOut], [a + step * 0.14, rOut], [a + step * 0.22, rIn], [a + step * 0.5, rIn]];
      for (const [ang, r] of pts) d += `${d ? 'L' : 'M'}${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)} `;
    }
    return d + 'Z';
  }
  const circ = (cx, cy, r) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

  const ICONS = {
    /* ---------- Arquétipos ---------- */
    vanguarda: [
      { f: 'ink', d: 'M32 5 L54 12 V30 C54 44 44 53 32 59 C20 53 10 44 10 30 V12 Z' },
      { f: 'cut', d: 'M32 12 L47 16.5 V30 C47 40 40 47 32 51.5 C24 47 17 40 17 30 V16.5 Z' },
      { f: 'ink', d: 'M32 12 L47 16.5 V30 C47 40 40 47 32 51.5 Z' },
      { f: 'acc', d: circ(32, 30, 5.5) }
    ],
    paladino: [
      { s: 'acc', w: 3, d: circ(32, 20, 15) },
      { f: 'ink', d: 'M16 12 H48 Q50 12 50 14 V26 Q50 28 48 28 H16 Q14 28 14 26 V14 Q14 12 16 12 Z' },
      { f: 'cut', d: 'M20 17 H44 V23 H20 Z' },
      { f: 'ink', d: 'M29 28 H35 V54 H29 Z' },
      { f: 'ink', d: 'M26 54 H38 L35 60 H29 Z' }
    ],
    berserker: [
      { f: 'ink', d: 'M29.5 6 H34.5 V60 H29.5 Z' },
      { f: 'ink', d: 'M29.5 13 C17 10 7 19 7 30 C7 40 17 47 29.5 43 Z' },
      { f: 'ink', d: 'M34.5 13 C47 10 57 19 57 30 C57 40 47 47 34.5 43 Z' },
      { f: 'cut', d: 'M24 18 C16 18 12 24 12 30 C12 36 16 40 24 40 C20 34 20 24 24 18 Z' },
      { f: 'cut', d: 'M40 18 C48 18 52 24 52 30 C52 36 48 40 40 40 C44 34 44 24 40 18 Z' }
    ],
    cacador: [
      { s: 'ink', w: 5, d: 'M20 6 C46 16 46 48 20 58' },
      { s: 'acc', w: 1.6, d: 'M20 6 L20 58' },
      { s: 'ink', w: 3.2, d: 'M8 32 H50' },
      { f: 'ink', d: 'M58 32 L46 25 V39 Z' },
      { s: 'acc', w: 2.4, d: 'M12 32 L6 26 M12 32 L6 38 M17 32 L11 26 M17 32 L11 38' }
    ],
    sombra: [
      { f: 'ink', d: 'M32 5 C17 5 9 20 9 34 L8 58 H56 L55 34 C55 20 47 5 32 5 Z' },
      { f: 'cut', d: 'M32 20 C23 20 18 29 18 38 L20 52 H44 L46 38 C46 29 41 20 32 20 Z' },
      { f: 'acc', d: 'M22 35 L30 37 L29 40 L22 38 Z M42 35 L34 37 L35 40 L42 38 Z' },
      { s: 'ink', w: 2, d: 'M32 5 L32 14' }
    ],
    lanceiro: [
      { f: 'ink', d: 'M30 24 H34 V60 H30 Z' },
      { f: 'ink', d: 'M32 3 L41 18 L32 27 L23 18 Z' },
      { f: 'cut', d: 'M32 9 L36 18 L32 22 Z' },
      { s: 'ink', w: 3.5, d: 'M22 27 H42' },
      { f: 'acc', d: 'M34 30 H50 L46 36 L50 42 H34 Z' }
    ],
    monge: [
      { f: 'ink', d: 'M17 28 Q17 20 25 20 H44 Q51 20 51 28 V44 Q51 57 38 57 H28 Q17 57 17 46 Z' },
      { s: 'cut', w: 2.6, d: 'M26 21 V33 M34.5 21 V33 M43 21 V33' },
      { s: 'cut', w: 2.6, d: 'M17 38 Q27 37 31 45' },
      { f: 'acc', d: circ(32, 10, 4) },
      { s: 'acc', w: 2, d: 'M22 12 L26 15 M42 12 L38 15' }
    ],
    arcanista: [
      { s: 'acc', w: 2.4, d: 'M7 40 A26 9 -18 1 0 57 32 A26 9 -18 1 0 7 40' },
      { f: 'ink', d: circ(32, 36, 13) },
      { f: 'cut', d: 'M24 32 A9 9 0 0 1 36 25 A11 11 0 0 0 24 32 Z' },
      { f: 'ink', d: 'M32 3 L34.5 10.5 L42 13 L34.5 15.5 L32 23 L29.5 15.5 L22 13 L29.5 10.5 Z' }
    ],
    alquimista: [
      { f: 'ink', d: 'M26 5 H38 V9 H36 V21 L48 35 C55 45 49 59 32 59 C15 59 9 45 16 35 L28 21 V9 H26 Z' },
      { f: 'acc', d: 'M14 43 C20 39 26 47 32 43 C38 39 44 47 50 43 C51 53 44 56 32 56 C20 56 13 53 14 43 Z' },
      { f: 'ink', d: circ(26, 48, 2.2) + circ(37, 51, 1.6) + circ(31, 36, 1.8) },
      { s: 'cut', w: 1.6, d: 'M28 13 H36' }
    ],
    clerigo: [
      { s: 'acc', w: 2.2, d: 'M32 2 V8 M32 56 V62 M2 30 H8 M56 30 H62 M11 9 L15 13 M53 9 L49 13 M11 51 L15 47 M53 51 L49 47' },
      { f: 'ink', d: 'M27 8 H37 V24 H52 V35 H37 V58 H27 V35 H12 V24 H27 Z' },
      { f: 'cut', d: 'M30 11 H34 V27 H49 V32 H34 V55 H30 V32 H15 V27 H30 Z' },
      { f: 'ink', d: circ(32, 29.5, 4.5) }
    ],
    bardo: [
      { s: 'ink', w: 5, d: 'M18 8 C9 24 13 44 24 50 H40 C51 44 55 24 46 8' },
      { s: 'ink', w: 3.4, d: 'M18 17 H46' },
      { s: 'acc', w: 1.6, d: 'M26 17 V49 M32 17 V49 M38 17 V49' },
      { f: 'ink', d: 'M21 50 H43 V57 H21 Z' },
      { f: 'acc', d: circ(18, 8, 3) + circ(46, 8, 3) }
    ],
    artifice: [
      { f: 'ink', d: gear(32, 32, 27, 20.5, 10) },
      { f: 'cut', d: circ(32, 32, 12) },
      { f: 'acc', d: circ(32, 32, 6) },
      { s: 'ink', w: 2.5, d: 'M32 20 V26 M32 38 V44 M20 32 H26 M38 32 H44' }
    ],
    druida: [
      { f: 'ink', d: 'M31 59 C31 59 7 47 9 26 C11 9 31 5 54 5 C56 28 50 51 31 59 Z' },
      { s: 'cut', w: 2.6, d: 'M31 59 C29 41 35 23 51 8' },
      { s: 'cut', w: 2, d: 'M32 40 L20 36 M34 30 L22 22 M38 22 L32 12 M33 42 L44 40 M37 32 L48 26' },
      { f: 'acc', d: circ(51, 50, 4) }
    ],
    necromante: [
      { f: 'ink', d: 'M32 5 C17 5 9 16 9 28 C9 36 13 41 18 43 V53 H46 V43 C51 41 55 36 55 28 C55 16 47 5 32 5 Z' },
      { f: 'cut', d: 'M24 24 C29 24 30 28 30 31 C30 35 26 37 22 36 C18 35 18 31 19 28 C20 25 22 24 24 24 Z M40 24 C35 24 34 28 34 31 C34 35 38 37 42 36 C46 35 46 31 45 28 C44 25 42 24 40 24 Z' },
      { f: 'acc', d: circ(25, 31, 2.2) + circ(39, 31, 2.2) },
      { f: 'cut', d: 'M32 38 L35 44 H29 Z' },
      { s: 'cut', w: 2, d: 'M24 48 V53 M29 48 V53 M35 48 V53 M40 48 V53' },
      { f: 'ink', d: 'M20 55 H44 V60 H20 Z' }
    ],
    /* ---------- Invocações ---------- */
    s_torreta: [
      { f: 'ink', d: 'M16 54 H48 L44 40 H20 Z' },
      { f: 'ink', d: circ(32, 32, 11) },
      { f: 'ink', d: 'M38 28 H58 V36 H38 Z' },
      { f: 'acc', d: circ(32, 32, 4) }
    ],
    s_lobo: [
      { f: 'ink', d: 'M10 12 L22 20 H42 L54 12 L52 32 C52 46 42 56 32 58 C22 56 12 46 12 32 Z' },
      { f: 'cut', d: 'M22 32 L29 35 L26 38 Z M42 32 L35 35 L38 38 Z' },
      { f: 'cut', d: 'M28 46 H36 L32 51 Z' },
      { f: 'acc', d: 'M23 33 L27 35 L25 36 Z M41 33 L37 35 L39 36 Z' }
    ],
    s_esqueleto: [
      { f: 'ink', d: 'M32 8 C21 8 15 16 15 25 C15 31 18 35 22 37 V45 H42 V37 C46 35 49 31 49 25 C49 16 43 8 32 8 Z' },
      { f: 'cut', d: circ(25, 25, 4.5) + circ(39, 25, 4.5) },
      { s: 'ink', w: 4, d: 'M14 50 L50 60 M50 50 L14 60' }
    ],
    s_avatar: [
      { f: 'ink', d: 'M32 4 C40 18 52 24 52 38 C52 50 43 58 32 58 C21 58 12 50 12 38 C12 24 24 18 32 4 Z' },
      { f: 'cut', d: 'M32 24 C36 32 42 35 42 42 C42 48 37 52 32 52 C27 52 22 48 22 42 C22 35 28 32 32 24 Z' },
      { f: 'acc', d: circ(32, 43, 5) }
    ],
    s_cria: [
      { f: 'ink', d: 'M8 32 C18 16 40 16 48 32 C40 48 18 48 8 32 Z' },
      { f: 'ink', d: 'M46 32 L58 20 V44 Z' },
      { f: 'cut', d: circ(20, 29, 3) },
      { s: 'cut', w: 2, d: 'M28 24 C31 29 31 35 28 40' }
    ],
    /* ---------- Chefes ---------- */
    b_colosso: [
      { f: 'ink', d: 'M12 22 L22 6 H42 L52 22 V44 L42 58 H22 L12 44 Z' },
      { f: 'cut', d: 'M18 22 L25 12 H39 L46 22 V30 H18 Z' },
      { f: 'acc', d: 'M20 26 L29 24 L29 28 Z M44 26 L35 24 L35 28 Z' },
      { s: 'cut', w: 2.4, d: 'M24 44 H40 M22 50 L30 46 M42 50 L34 46 M32 34 L28 40' }
    ],
    b_leviata: [
      { s: 'ink', w: 8, d: 'M6 46 C14 28 22 28 30 44 C38 60 46 58 50 40' },
      { f: 'ink', d: 'M44 38 C44 24 50 14 60 12 C60 22 58 34 50 42 Z' },
      { f: 'acc', d: circ(53, 22, 2.5) },
      { s: 'acc', w: 2, d: 'M12 36 L8 30 M22 32 L20 25 M36 54 L38 60' }
    ],
    b_arconte: [
      { f: 'ink', d: 'M4 32 C16 12 48 12 60 32 C48 52 16 52 4 32 Z' },
      { f: 'cut', d: circ(32, 32, 14) },
      { f: 'acc', d: circ(32, 32, 9) },
      { f: 'cut', d: 'M32 22 C37 26 37 38 32 42 C35 36 35 28 32 22 Z' },
      { s: 'ink', w: 2.4, d: 'M32 2 V9 M32 55 V62 M12 10 L17 15 M52 10 L47 15' }
    ],
    b_ferreiro: [
      { f: 'ink', d: 'M6 30 H52 C52 37 46 41 40 41 V47 H48 V56 H16 V47 H24 V41 C14 41 6 37 6 30 Z' },
      { f: 'cut', d: 'M10 33 H48 C47 35 45 37 40 37 H24 C16 37 12 35 10 33 Z' },
      { f: 'ink', d: 'M30 5 H50 V15 H30 Z' },
      { s: 'ink', w: 4, d: 'M40 15 L28 27' },
      { f: 'acc', d: circ(56, 24, 2.5) + circ(50, 22, 1.6) + circ(58, 18, 1.4) }
    ],
    unknown: [{ f: 'ink', d: circ(32, 32, 16) }, { f: 'cut', d: circ(32, 32, 8) }]
  };

  const SUMMON_BY_SYMBOL = { '🗼': 's_torreta', '🐺': 's_lobo', '💀': 's_esqueleto', '🐟': 's_cria' };
  const BOSS_BY_SYMBOL = { '🗿': 'b_colosso', '🐉': 'b_leviata', '👁️': 'b_arconte', '⚒️': 'b_ferreiro' };
  const BOSS_KEYS = { 1: 'b_colosso', 2: 'b_leviata', 3: 'b_arconte', 4: 'b_ferreiro' };

  /* Escolhe o emblema de uma unidade qualquer (roster, inimigo, invocação ou chefe) */
  function keyOf(u) {
    if (!u) return 'unknown';
    if (u.symbol === '🐓') return 'c_galo';
    if (u.symbol === '🐔') return 'c_galinha';
    if (u.isBoss) return BOSS_BY_SYMBOL[u.symbol] || 'b_colosso';
    if (u.isSummon) return SUMMON_BY_SYMBOL[u.symbol] || 's_avatar';
    return ICONS[u.archetypeId] ? u.archetypeId : 'unknown';
  }

  /* Paleta: tinta clara para o desenho, recorte escuro e destaque colorido */
  function inks(o) {
    return { ink: o.ink || '#fff6e4', cut: o.cut || 'rgba(10,8,14,.55)', acc: o.acc || '#fde68a' };
  }

  const P2D = new Map();
  const path = (d) => { let p = P2D.get(d); if (!p) { p = new Path2D(d); P2D.set(d, p); } return p; };

  /* Canvas: desenha o emblema centrado em (cx, cy) com lado `size` */
  function draw(ctx, key, cx, cy, size, o = {}) {
    const layers = ICONS[key] || ICONS.unknown, k = inks(o);
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 64, size / 64);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; }
    for (const L of layers) {
      if (L.f) { ctx.fillStyle = k[L.f]; ctx.fill(path(L.d)); if (L.f === 'ink') { ctx.shadowColor = 'transparent'; } }
      if (L.s) { ctx.strokeStyle = k[L.s]; ctx.lineWidth = L.w || 2; ctx.stroke(path(L.d)); }
    }
    ctx.restore();
  }

  /* DOM: o mesmo emblema como <svg> */
  function svg(key, o = {}) {
    const layers = ICONS[key] || ICONS.unknown, k = inks(o);
    const body = layers.map(L => L.f ? `<path d="${L.d}" fill="${k[L.f]}"/>` : `<path d="${L.d}" fill="none" stroke="${k[L.s]}" stroke-width="${L.w || 2}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    return `<svg class="art ${o.cls || ''}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
  }

  /* Medalhão completo em HTML (usado no banco, Quartel, Inspetor e Códice) */
  function medal(u, o = {}) {
    const key = typeof u === 'string' ? u : keyOf(u);
    const color = o.color || '#94a3b8';
    const enemy = !!o.enemy;
    return `<span class="medal ${enemy ? 'enemy' : ''} ${o.boss ? 'boss' : ''} q${o.quality || 0} ${o.cls || ''}" style="--mc:${color}">${svg(key, { acc: o.acc || lighten(color) })}</span>`;
  }

  function lighten(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fde68a';
    const n = parseInt(m[1], 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(c + (255 - c) * 0.45);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  FE.Art = { ICONS, keyOf, draw, svg, medal, lighten, BOSS_KEYS };
})(window);
