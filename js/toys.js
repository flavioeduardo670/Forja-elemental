/* ==========================================================================
   FORJA ELEMENTAL 4.0 — toys.js
   Bonecos de brinquedo (estilo diorama). Cada boneco é uma lista de camadas
   em coordenadas locais (pés em 0,0; altura ~50), com cores por "token":
   O contorno • body corpo do time • acc cor da classe • skin pele • ring base
   do time • metal • wood • gold. O mesmo desenho vai para o canvas (Path2D)
   e para o DOM (<svg>), então tabuleiro, banco e recrutamento são idênticos.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE;

  const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
  const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
  const rrect = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;

  /* f = preenchimento, s = traço, w = espessura do traço */
  const BASE = [
    { f: 'ring', s: 'O', w: 1.2, d: ell(0, -1, 11, 4.4) },
    { f: 'body', d: rrect(-8.5, -24, 17, 22, 8) },
    { f: 'acc', d: 'M-8.5 -14H8.5V-9H-8.5Z' },
    { s: 'O', w: 1.4, d: rrect(-8.5, -24, 17, 22, 8) },
    { f: 'skin', s: 'O', w: 1.4, d: circ(0, -31, 8) }
  ];
  const FACE_P = [{ f: 'O', d: circ(-2.8, -31, 1.2) + circ(2.8, -31, 1.2) }];
  const FACE_E = [
    { f: '#F2E7D0', s: 'O', w: 1.1, d: 'M-6 -36L-9 -44L-3 -38ZM6 -36L9 -44L3 -38Z' },
    { s: 'O', w: 1.8, d: 'M-4 -31L-1.5 -30M4 -31L1.5 -30' }
  ];

  const PROPS = {
    vanguarda: [
      { f: 'metal', s: 'O', w: 1.2, d: 'M-8 -38Q0 -45 8 -38L8 -34H-8Z' },
      { f: 'acc', s: 'O', w: 1.4, d: 'M-17 -22H-5V-11Q-11 -4 -17 -11Z' },
      { s: '#ffffff', w: 1.4, d: 'M-11 -21V-7', o: 0.8 }
    ],
    paladino: [
      { s: 'gold', w: 1.6, d: circ(0, -31, 11) },
      { s: 'O', w: 2.6, d: 'M9 -6L14 -34' },
      { f: 'acc', s: 'O', w: 1.3, d: rrect(8, -42, 13, 8, 2) }
    ],
    berserker: [
      { s: 'wood', w: 2.6, d: 'M10 -2L15 -34' },
      { f: 'metal', s: 'O', w: 1.2, d: 'M14 -36Q25 -35 23 -23Q19 -28 13 -27Z' },
      { f: 'acc', d: rrect(-9, -38, 18, 3.5, 1.5) }
    ],
    cacador: [
      { f: '#2F8A4E', s: 'O', w: 1.2, d: 'M-8 -33Q0 -46 8 -33L7 -29H-7Z' },
      { s: 'wood', w: 2.6, d: 'M11 -38Q21 -21 11 -4' },
      { s: 'O', w: 0.8, d: 'M11 -38V-4' }
    ],
    sombra: [
      { f: '#3B3150', s: 'O', w: 1.2, d: 'M-9 -30Q0 -48 9 -30L8 -24H-8Z' },
      { s: 'acc', w: 1.8, d: 'M-4 -31H-1M1 -31H4' },
      { s: 'metal', w: 2.4, d: 'M-15 -6L-9 -16M15 -6L9 -16' }
    ],
    lanceiro: [
      { s: 'wood', w: 2.2, d: 'M12 -2V-46' },
      { f: 'metal', s: 'O', w: 1, d: 'M12 -52L15.5 -45L12 -42L8.5 -45Z' },
      { f: 'acc', s: 'O', w: 1.3, d: circ(-12, -15, 6.5) }
    ],
    monge: [
      { f: 'acc', d: rrect(-8.5, -37, 17, 3.6, 1.6) },
      { s: 'acc', w: 1.6, d: 'M7 -36L12 -40M7 -35L12 -33' },
      { f: 'skin', s: 'O', w: 1.3, d: circ(-12, -16, 4.2) + circ(12, -16, 4.2) }
    ],
    arcanista: [
      { f: 'acc', s: 'O', w: 1.3, d: 'M-9 -36L1 -54L9 -36Z' },
      { s: 'O', w: 2.2, d: 'M-11 -36H11' },
      { s: 'wood', w: 2.4, d: 'M13 -2V-36' },
      { f: '#C9A7FF', s: 'O', w: 1.2, d: circ(13, -39, 4.5) },
      { f: '#ffffff', d: circ(12, -40.5, 1.4) }
    ],
    alquimista: [
      { f: '#2B3140', d: rrect(-7.5, -34.5, 15, 4, 2) },
      { f: '#9BE7F5', s: 'O', w: 1, d: circ(-3.5, -32.5, 2.6) + circ(3.5, -32.5, 2.6) },
      { f: 'acc', s: 'O', w: 1.2, d: 'M10 -26H14V-21L18 -15Q19 -9 12 -9Q5 -9 6 -15L10 -21Z' }
    ],
    clerigo: [
      { s: 'gold', w: 1.8, d: circ(0, -31, 11) },
      { s: '#C9CED8', w: 2.4, d: 'M13 -2V-34' },
      { s: 'acc', w: 3, d: 'M8.5 -29H17.5M13 -38V-24' }
    ],
    bardo: [
      { f: 'acc', s: 'O', w: 1.2, d: 'M-10 -36Q0 -44 10 -36Z' },
      { s: '#F5F0E6', w: 2, d: 'M6 -40Q12 -48 16 -44' },
      { f: 'wood', s: 'O', w: 1.2, d: ell(12, -12, 6, 5) },
      { s: 'O', w: 1.6, d: 'M12 -16L20 -30' }
    ],
    artifice: [
      { f: '#2B3140', d: rrect(-7.5, -35, 15, 4, 2) },
      { f: '#FFD166', s: 'O', w: 1, d: circ(-3.5, -33, 2.4) + circ(3.5, -33, 2.4) },
      { f: 'acc', s: 'O', w: 1.2, d: 'M10 -30l2.5 -2.5l2 2l2.5 -2.5l2 2l-2.5 2.5l2 2l-2.5 2.5l-2 -2l-2.5 2.5l-2 -2l2.5 -2.5z' },
      { s: 'metal', w: 2.4, d: 'M-12 -6L-12 -20' }
    ],
    druida: [
      { f: '#4FA94D', s: 'O', w: 1, d: 'M-9 -36Q-6 -42 -2 -38Q0 -44 3 -38Q7 -42 9 -36Z' },
      { s: 'wood', w: 2.6, d: 'M13 -2V-38' },
      { f: 'acc', s: 'O', w: 1, d: ell(16, -40, 4, 2.4) + ell(10, -42, 3.5, 2.2) }
    ],
    necromante: [
      { f: '#2C2438', s: 'O', w: 1.2, d: 'M-9 -30Q0 -48 9 -30L8 -24H-8Z' },
      { s: 'acc', w: 1.8, d: 'M-4 -31H-1M1 -31H4' },
      { s: 'wood', w: 2.2, d: 'M13 -2V-36' },
      { f: '#F2EEE4', s: 'O', w: 1.1, d: 'M9 -40Q9 -46 13 -46Q17 -46 17 -40L16 -37H10Z' }
    ]
  };

  /* Invocações (sem corpo padrão) */
  const SUMMONS = {
    s_torreta: [
      { f: 'ring', s: 'O', w: 1.1, d: ell(0, -1, 10, 4) },
      { f: 'metal', s: 'O', w: 1.3, d: 'M-8 -2L-6 -16H6L8 -2Z' },
      { f: 'acc', s: 'O', w: 1.3, d: circ(0, -19, 6) },
      { f: 'O', d: rrect(3, -21, 12, 4, 1.5) }
    ],
    s_lobo: [
      { f: 'ring', s: 'O', w: 1.1, d: ell(0, -1, 11, 4) },
      { f: '#8D95A6', s: 'O', w: 1.3, d: 'M-11 -6Q-12 -16 -2 -16H6L10 -24L12 -16Q15 -14 13 -10H10L9 -3H5V-8H-5V-3H-9Z' },
      { f: 'O', d: circ(9.5, -17, 1) }
    ],
    s_esqueleto: [
      { f: 'ring', s: 'O', w: 1.1, d: ell(0, -1, 10, 4) },
      { f: '#EDE8DC', s: 'O', w: 1.3, d: rrect(-6, -20, 12, 18, 5) },
      { s: 'O', w: 1, d: 'M-6 -14H6M-6 -9H6' },
      { f: '#F5F1E8', s: 'O', w: 1.3, d: circ(0, -26, 6.5) },
      { f: 'O', d: circ(-2.4, -26, 1.6) + circ(2.4, -26, 1.6) }
    ],
    s_avatar: [
      { f: 'ring', s: 'O', w: 1.1, d: ell(0, -1, 10, 4) },
      { f: 'acc', s: 'O', w: 1.3, d: 'M0 -34C6 -24 11 -20 11 -12C11 -5 6 -2 0 -2C-6 -2 -11 -5 -11 -12C-11 -20 -6 -24 0 -34Z' },
      { f: '#ffffff', d: circ(-3, -12, 1.6) + circ(3, -12, 1.6), o: 0.9 }
    ],
    s_cria: [
      { f: 'ring', s: 'O', w: 1.1, d: ell(0, -1, 10, 4) },
      { f: 'acc', s: 'O', w: 1.3, d: 'M-11 -12Q0 -24 9 -12Q0 0 -11 -12ZM8 -12L15 -18V-6Z' },
      { f: 'O', d: circ(-5, -13, 1.2) }
    ]
  };

  /* Chefes: um golem-base com variações por Ato */
  function bossLayers(key) {
    const tint = { b_colosso: '#5B5566', b_leviata: '#2F6F86', b_arconte: '#5B3F8C', b_ferreiro: '#7A4A2A' }[key] || '#5B5566';
    const L = [
      { f: 'ring', s: 'O', w: 1.6, d: ell(0, -2, 30, 10) },
      { f: 'shade', s: 'O', w: 1.6, d: rrect(-16, -30, 12, 28, 4) + rrect(4, -30, 12, 28, 4) },
      { f: tint, s: 'O', w: 1.8, d: 'M-26 -62Q0 -76 26 -62L22 -26H-22Z' },
      { f: 'shade', s: 'O', w: 1.6, d: rrect(-38, -62, 14, 34, 6) + rrect(24, -62, 14, 34, 6) },
      { f: tint, s: 'O', w: 1.8, d: 'M-14 -66L-10 -84H10L14 -66Z' },
      { s: 'glow', w: 2.4, d: 'M-12 -52L-4 -40L-10 -30M10 -54L4 -42L12 -32' },
      { s: 'glow', w: 3, d: 'M-7 -76H-2M2 -76H7' },
      { f: 'gold', s: 'O', w: 1.2, d: 'M-10 -84L-6 -92L-2 -86L2 -94L6 -86L10 -92L10 -84Z' }
    ];
    if (key === 'b_leviata') L.push({ f: '#7FD3E8', s: 'O', w: 1.2, d: 'M-26 -62L-34 -74L-20 -68ZM26 -62L34 -74L20 -68Z' });
    if (key === 'b_arconte') L.push({ f: '#FDE68A', s: 'O', w: 1.4, d: ell(0, -76, 8, 5) }, { f: 'O', d: circ(0, -76, 2.6) });
    if (key === 'b_ferreiro') L.push({ s: 'wood', w: 4, d: 'M31 -40L44 -78' }, { f: 'metal', s: 'O', w: 1.4, d: rrect(36, -92, 20, 12, 2) });
    return L;
  }


  /* Easter egg GALINHA: galinha (inimiga comum) e galo (chefe) */
  function chickenLayers(key) {
    const galo = key === 'c_galo';
    const L = [
      { f: 'ring', s: 'O', w: 1.2, d: ell(0, -1, 11, 4.4) },
      { s: '#E8902A', w: 2, d: 'M-4 -2V-9M4 -2V-9M-6 -1H-2M2 -1H6' },
      galo ? { f: '#1F5C4A', s: 'O', w: 1.2, d: 'M-8 -20Q-22 -36 -16 -46Q-12 -32 -4 -24ZM-9 -17Q-24 -24 -24 -36Q-14 -26 -5 -20Z' }
           : { f: '#FFFFFF', s: 'O', w: 1.2, d: 'M-8 -18L-16 -30L-6 -24Z' },
      { f: galo ? '#C9792E' : '#FFFFFF', s: 'O', w: 1.4, d: ell(0, -16, 10, 8.5) },
      { f: galo ? '#A65E22' : '#E9EDF3', s: 'O', w: 1.1, d: ell(-1, -16, 6, 4.5) },
      { f: 'acc', d: 'M-9 -12H9V-10H-9Z', o: 0.9 },
      { f: galo ? '#E0A050' : '#FFFFFF', s: 'O', w: 1.4, d: circ(3, -29, 6.5) },
      { f: '#E23B3B', s: 'O', w: 1, d: galo ? 'M-2 -34Q0 -44 3 -36Q5 -45 7 -36Q10 -43 10 -33Z' : 'M0 -34Q2 -40 4 -35Q6 -40 8 -34Z' },
      { f: '#F2A93B', s: 'O', w: 1, d: 'M9 -30L15 -28L9 -26Z' },
      { f: '#E23B3B', d: ell(9, -24, 1.6, 2.4) },
      { f: 'O', d: circ(5, -30, 1.3) },
      { s: 'O', w: 1.4, d: 'M2.5 -33.5L7 -32' }
    ];
    if (galo) L.push({ f: 'gold', s: 'O', w: 1, d: 'M-2 -46L0 -51L2 -47L4 -52L6 -47L8 -51L10 -46Z' });
    return L;
  }

  function palette(team, acc, o = {}) {
    const enemy = team === 'e';
    return {
      O: '#1E2433', acc, ring: enemy ? '#D9483B' : '#13897C',
      body: o.body || (enemy ? '#8B2F3A' : '#2F6FB4'), skin: enemy ? '#9DB08A' : '#F6D3B4',
      metal: '#C9CED8', wood: '#8A5A33', gold: '#F2B33D', shade: '#4A4554', glow: '#FF8A3D'
    };
  }

  function layersFor(key, team) {
    if (key && key.startsWith('c_')) return chickenLayers(key);
    if (key && key.startsWith('b_')) return bossLayers(key);
    if (key && key.startsWith('s_')) return SUMMONS[key] || SUMMONS.s_avatar;
    return BASE.concat(team === 'e' ? FACE_E : FACE_P, PROPS[key] || []);
  }

  const P2D = new Map();
  const path = (d) => { let p = P2D.get(d); if (!p) { p = new Path2D(d); P2D.set(d, p); } return p; };
  const col = (pal, k) => (k && k[0] === '#') ? k : pal[k] || k;

  /* Canvas: pés em (x, y), escala s (1 = ~50px de altura) */
  function draw(ctx, key, team, x, y, s, o = {}) {
    const acc = o.acc || '#94a3b8';
    const pal = palette(team, acc, o);
    const L = layersFor(key, team);
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(30,36,51,.22)'; ctx.beginPath(); ctx.ellipse(0, 0, key && key.startsWith('b_') ? 34 : 13, key && key.startsWith('b_') ? 12 : 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const l of L) {
      const p = path(l.d);
      if (l.o !== undefined) ctx.globalAlpha = l.o;
      if (l.f) { ctx.fillStyle = col(pal, l.f); ctx.fill(p); }
      if (l.s) { ctx.strokeStyle = col(pal, l.s); ctx.lineWidth = l.w || 1.2; ctx.stroke(p); }
      if (l.o !== undefined) ctx.globalAlpha = 1;
    }
    if (o.flash > 0) { ctx.globalAlpha = Math.min(0.75, o.flash * 6); ctx.fillStyle = '#fff'; for (const l of L) if (l.f) ctx.fill(path(l.d)); ctx.globalAlpha = 1; }
    ctx.restore();
  }

  /* DOM: <svg> com o boneco centralizado. w×h em px, escala s */
  function svg(key, team, acc, w = 64, h = 72, s = 1.1, o = {}) {
    const pal = palette(team, acc, o);
    const L = layersFor(key, team);
    const boss = key && key.startsWith('b_');
    const body = L.map(l => `<path d="${l.d}" fill="${l.f ? col(pal, l.f) : 'none'}"${l.s ? ` stroke="${col(pal, l.s)}" stroke-width="${l.w || 1.2}" stroke-linecap="round" stroke-linejoin="round"` : ''}${l.o !== undefined ? ` opacity="${l.o}"` : ''}/>`).join('');
    return `<svg class="toy" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><g transform="translate(${w / 2} ${h - 6}) scale(${s})"><ellipse cx="0" cy="0" rx="${boss ? 34 : 13}" ry="${boss ? 12 : 5}" fill="rgba(30,36,51,.18)"/>${body}</g></svg>`;
  }

  /* Atalho: boneco de um arquétipo do jogador / de uma unidade qualquer */
  function svgArch(archId, w, h, s, team = 'p') {
    const a = FE.Data.ARCHETYPES[archId];
    return svg(archId, team, a ? a.color : '#94a3b8', w, h, s);
  }

  FE.Toy = { draw, svg, svgArch, layersFor };
})(window);

/* Retratos de boneco para a interface (substitui os medalhões da 3.x) */
(function (root) {
  const FE = root.FE;
  const SZ = { xs: [26, 28, 0.44], sm: [36, 40, 0.62], '': [46, 52, 0.82], lg: [84, 92, 1.45], xl: [76, 84, 1.3], 'bench-medal': [58, 64, 0.98] };
  FE.Art.medal = function (u, o = {}) {
    const key = typeof u === 'string' ? u : FE.Art.keyOf(u);
    const [w, h, s] = SZ[o.cls || ''] || SZ[''];
    const boss = key.startsWith('b_');
    return `<span class="toy-port ${o.cls || ''} ${o.enemy ? 'enemy' : ''} q${o.quality || 0}" style="--mc:${o.color || '#94a3b8'}">${FE.Toy.svg(key, o.enemy ? 'e' : 'p', o.color || '#94a3b8', w, h, boss ? s * 0.55 : s)}</span>`;
  };
})(window);
