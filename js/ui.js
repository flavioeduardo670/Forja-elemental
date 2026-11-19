/* ==========================================================================
   FORJA ELEMENTAL 2.0 — ui.js
   Painéis, modais, tooltips e entrada (clique, arrastar-e-soltar, toque).
   A UI só lê FE.Game e chama suas ações; o motor nunca toca no DOM.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE, D = FE.Data, C = D.CONFIG, G = FE.Game, R = FE.Render;
  const $ = (id) => document.getElementById(id);
  const esc = FE.util.esc;
  const UI = FE.UI = { drag: null, inspectEnemyId: null, synTab: 'el', modalKind: null, mapDismissed: false, lastPhase: null, codexTab: 'guia', evoUnitId: null, titleAsc: 0 };
  const USER_MODALS = ['evo', 'codex', 'meta', 'settings', 'menu', 'ach'];
  const ROMAN = ['', 'I', 'II', 'III'];

  /* ======================= UTILITÁRIOS ======================= */
  UI.toast = function (t, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`; el.textContent = t;
    $('toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(16px)'; setTimeout(() => el.remove(), 220); }, 2800);
  };
  UI.log = function (t, type = '') {
    const box = $('combat-log');
    const el = document.createElement('div');
    el.className = `log-entry ${type}`; el.textContent = t;
    box.appendChild(el); box.scrollTop = box.scrollHeight;
    while (box.children.length > 80) box.removeChild(box.firstChild);
  };
  const stars = (t) => '★'.repeat(t);
  const tipAttr = (html) => `data-tip="${esc(html)}"`;
  function itemTip(it) {
    const def = D.ITEMS[it.id];
    return `<b>${def.icon} ${def.name} ${stars(it.tier)}</b><br>${def.descFor(it.tier)}`;
  }
  function relicTip(id) {
    const r = D.RELICS[id];
    return `<b>${r.icon} ${r.name}</b> <span style="color:${D.RARITY[r.rarity].color}">(${D.RARITY[r.rarity].name})</span><br>${r.desc}`;
  }
  const ordersLine = (a) => a.orders.map(id => `<span style="color:${D.ORDERS[id].color}">${D.ORDERS[id].icon} ${D.ORDERS[id].name}</span>`).join(' • ');
  function archTip(a) {
    const sk = a.skills.map(s => `${D.SKILLS[s].icon} ${D.SKILLS[s].name} <i>(${D.SKILLS[s].type})</i>`).join('<br>');
    return `<b>${a.symbol} ${a.name}</b> — ${a.role}<br>${ordersLine(a)}<br>❤️ ${a.stats.maxHp} • ⚔️ ${a.stats.ad} • 🔮 ${a.stats.ap} • 🛡️ ${a.stats.armor}<br>⚡ ${a.stats.attackSpeed}/s • 🎯 alcance ${a.stats.range}<br><br>${sk}`;
  }

  /* ======================= TOOLTIP ======================= */
  function initTooltip() {
    const tip = $('tooltip');
    let cur = null;
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t === cur) return;
      cur = t;
      if (!t || UI.drag) { tip.style.display = 'none'; return; }
      tip.innerHTML = t.getAttribute('data-tip'); tip.style.display = 'block';
    });
    document.addEventListener('mousemove', (e) => {
      if (tip.style.display !== 'block') return;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + 14, y = e.clientY + 14;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14;
      if (y + h > innerHeight - 8) y = e.clientY - h - 14;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    });
    document.addEventListener('pointerdown', () => { tip.style.display = 'none'; cur = null; });
  }

  /* ======================= HEADER ======================= */
  function refreshHeader() {
    const r = G.run;
    $('hud-shards').textContent = G.meta.astralShards;
    $('hud-ach').textContent = `${FE.Achievements.count()}/${FE.Achievements.list.length}`;
    if (!r) return;
    $('hud-act').textContent = `${D.ACTS[r.act].short} • ${D.ACTS[r.act].name}${r.ascension ? ` • Asc. ${r.ascension}` : ''}`;
    $('hud-room').textContent = `${r.room} / ${C.TOTAL_ROOMS}`;
    $('hud-citadel').textContent = `❤️ ${r.citadelHp}/${r.citadelMax}`;
    $('hud-citadel-bar').style.width = `${Math.round(r.citadelHp / r.citadelMax * 100)}%`;
    $('hud-gold').textContent = `${r.gold}g`;
    const team = $('hud-team');
    team.textContent = `${r.board.length} / ${r.teamLimit}`;
    team.className = r.board.length > r.teamLimit ? 'crimson-text' : 'emerald-text';
    const edit = G.canEdit();
    document.querySelectorAll('#comp-controls button').forEach(b => {
      b.disabled = !edit;
      if (b.dataset.preset) b.classList.toggle('active', +b.dataset.preset === r.teamLimit);
    });
    const pool = G.xpPool(), n = Math.max(1, r.board.length);
    $('hud-xp').innerHTML = `Pool: ${pool} XP ÷ ${n} = <span class="gold-text">${Math.floor(pool / n)} XP/unid</span>`;
    $('hud-strategy').textContent = n === 1 ? '👑 Hyper-Carry Solo (100% XP)' : n <= 3 ? '⚡ Trio de Elite (nível ultra-rápido)' : n <= 7 ? '⚖️ Composição Equilibrada' : '🌊 Exército Massivo (sinergias máximas)';
    const bar = $('hud-relics');
    bar.innerHTML = r.relics.length
      ? r.relics.map(id => `<div class="relic-badge" style="--rc:${D.RARITY[D.RELICS[id].rarity].color}" ${tipAttr(relicTip(id))}>${D.RELICS[id].icon}</div>`).join('')
      : '<span style="font-size:10.5px;color:var(--text-muted);font-weight:700;">Relíquias (0)</span>';
    $('footer-note').innerHTML = `Forja Elemental v${FE.VERSION} • seed <b>${esc(r.seed)}</b>${r.ascension ? ` • Ascensão ${r.ascension}` : ''} • progresso salvo automaticamente neste navegador`;
  }

  /* ======================= BOARD CHROME ======================= */
  function refreshBoardChrome() {
    const r = G.run;
    const phase = $('phase-chip'), room = $('room-chip'), affix = $('affix-chip');
    const map = { PREP: ['Preparação', 'chip prep'], COMBAT: ['Combate', 'chip combat'], MAP: ['Mapa', 'chip map'], CHOICE: ['Recompensa', 'chip map'], END: ['Encerrada', 'chip'] };
    const [txt, cls] = map[r.phase] || ['—', 'chip'];
    phase.textContent = txt; phase.className = cls;
    const nt = D.NODE_TYPES[r.roomType];
    if (r.phase === 'PREP' || r.phase === 'COMBAT') {
      room.textContent = `${nt.icon} ${nt.name} • ${r.enemies.length} inimigo(s)`;
      room.className = r.roomType === 'combate' ? 'chip' : 'chip danger';
      room.removeAttribute('data-tip');
      if (r.roomType === 'chefe') room.setAttribute('data-tip', `<b>${D.BOSSES[r.act].symbol} ${D.BOSSES[r.act].name}</b><br>${D.BOSSES[r.act].mechanic}`);
    } else { room.textContent = '🗺️ Entre salas'; room.className = 'chip'; }
    const lay = D.LAYOUTS[r.layout] || D.LAYOUTS.planicie;
    const present = [...new Set(r.terrain.split(''))].filter(t => t !== '.').map(t => `${D.TERRAIN[t].icon} <b>${D.TERRAIN[t].name}:</b> ${D.TERRAIN[t].desc}`);
    $('terrain-chip').textContent = `${lay.icon} ${lay.name}`;
    $('terrain-chip').setAttribute('data-tip', `<b>Terreno: ${lay.name}</b><br>${lay.desc}${present.length ? '<br><br>' + present.join('<br>') : ''}`);
    const a = D.ARENA[r.affix] || D.ARENA.padrao;
    affix.textContent = `${a.icon} ${a.name}`; affix.setAttribute('data-tip', `<b>Arena:</b> ${a.desc}`);

    const start = $('btn-start');
    start.disabled = r.phase !== 'PREP' && r.phase !== 'MAP';
    if (r.phase === 'MAP') start.innerHTML = '🗺️ Escolher Caminho <kbd>Espaço</kbd>';
    else if (r.phase === 'COMBAT') start.innerHTML = '🔥 Batalhando...';
    else start.innerHTML = `⚔️ Iniciar ${r.roomType === 'chefe' ? 'Chefe' : r.roomType === 'elite' ? 'Elite' : 'Combate'} <kbd>Espaço</kbd>`;
    $('btn-arrange').disabled = !G.canEdit();
    const evo = G.totalEvo();
    const be = $('btn-evo');
    be.style.display = evo > 0 && G.canEdit() ? 'inline-flex' : 'none';
    $('evo-pts').textContent = evo;

    const ov = $('board-overlay');
    const showOv = r.phase === 'MAP' && UI.modalKind !== 'map';
    ov.classList.toggle('show', showOv);
    $('overlay-text').textContent = r.board.length ? 'Ajuste composição, itens e evoluções. Depois escolha o próximo caminho.' : 'Recrute unidades na loja abaixo e depois escolha o primeiro caminho.';
    $('log-badge').textContent = r.phase === 'PREP' ? `Sala ${r.room}` : '';
  }

  /* ======================= SINERGIAS ======================= */
  UI.prevTiers = {};
  function refreshSynergies() {
    const list = $('synergy-list');
    const ecounts = G.synergyCounts(), ocounts = G.orderCounts();
    const entries = [];
    for (const el of Object.values(D.ELEMENTS)) {
      const n = ecounts[el.id];
      entries.push({ key: 'el:' + el.id, kind: 'Elemento', name: el.name, icon: el.icon, color: el.color, n, tier: FE.Engine.synergyTier(n), th: C.SYN_THRESHOLDS, desc: el.tiersText, members: '' });
    }
    for (const o of Object.values(D.ORDERS)) {
      const n = ocounts[o.id];
      const members = o.members.map(m => `<span ${tipAttr(archTip(D.ARCHETYPES[m]))}>${D.ARCHETYPES[m].symbol}</span>`).join(' ');
      entries.push({ key: 'or:' + o.id, kind: o.kind, name: o.name, icon: o.icon, color: o.color, n, tier: FE.Engine.orderTier(n, o), th: o.thresholds, desc: o.tiersText, members });
    }
    const flash = new Set();
    if (G.canEdit()) for (const e of entries) {
      const prev = UI.prevTiers[e.key] || 0;
      if (e.tier > prev && UI.prevTiersReady) { flash.add(e.key); UI.toast(`✦ ${e.icon} ${e.name} nível ${e.tier} ativado (${e.n})!`, 'success'); UI.log(`✦ Sinergia ativada: ${e.icon} ${e.name} — nível ${e.tier}.`, 'level'); }
    }
    for (const e of entries) UI.prevTiers[e.key] = e.tier;
    UI.prevTiersReady = true;
    const active = entries.filter(e => e.tier > 0).sort((x, y) => y.tier - x.tier || y.n - x.n);
    const partial = entries.filter(e => e.tier === 0 && e.n > 0).sort((x, y) => y.n - x.n);
    const idle = entries.filter(e => e.n === 0);
    const card = (e, compact) => `<div class="synergy-card ${e.tier ? 'active' : e.n ? '' : 'dim'} ${compact ? 'compact' : ''} ${flash.has(e.key) ? 'flash' : ''}" style="--el-color:${e.color}" ${compact ? tipAttr(`<b>${e.icon} ${e.name}</b> (${e.kind})<br>${e.desc}`) : ''}>
        <div class="synergy-top"><span class="synergy-name" style="color:${e.tier ? e.color : 'var(--text-primary)'}">${e.icon} ${e.name} (${e.n})<span class="kind-tag">${e.kind}</span></span>
        <div class="synergy-tiers">${e.th.map(t => `<span class="tier-badge ${e.n >= t ? 'reached' : ''}">${t}</span>`).join('')}</div></div>
        <div class="synergy-desc">${e.desc}</div>${e.members ? `<div class="synergy-members">${e.members}</div>` : ''}</div>`;
    $('syn-count').textContent = `${active.length} ativa(s)`;
    list.innerHTML =
      (active.length ? `<div class="syn-section"><span>Ativas</span></div>${active.map(e => card(e, false)).join('')}` : '') +
      (partial.length ? `<div class="syn-section"><span>Em progresso</span></div>${partial.map(e => card(e, true)).join('')}` : '') +
      `<div class="syn-section"><span>Disponíveis</span><span>passe o mouse</span></div>${idle.map(e => card(e, true)).join('')}`;
  }

  /* ======================= BANCO ======================= */
  function refreshBench() {
    const r = G.run, grid = $('bench-grid');
    $('bench-count').textContent = `${r.bench.filter(Boolean).length} / ${C.BENCH}`;
    grid.innerHTML = r.bench.map((u, i) => {
      if (!u) return `<div class="bench-slot" data-slot="${i}"></div>`;
      const a = D.ARCHETYPES[u.archetypeId];
      return `<div class="bench-slot occupied ${G.selectedId === u.id ? 'selected' : ''}" data-slot="${i}" data-unit="${u.id}" ${tipAttr(`<b>${a.symbol} ${esc(u.name)}</b> — Nv.${u.level}<br>Arraste para o campo • duplo clique envia`)}>
        <span class="bench-lvl">Nv.${u.level}</span>${u.evoPoints > 0 ? '<span class="bench-evo-dot">+</span>' : ''}
        <div class="bench-token" style="background:${a.color}35;border-color:${a.color};">${a.symbol}</div></div>`;
    }).join('');
  }

  /* ======================= LOJA ======================= */
  function refreshShop() {
    const r = G.run;
    $('shop-grid').innerHTML = Object.values(D.ARCHETYPES).map(a => {
      const cost = G.recruitCost(a.id);
      const ok = r.gold >= cost && G.canEdit();
      const oc = G.orderCounts();
      const next = a.orders.map(id => D.ORDERS[id]).filter(o => o.thresholds.includes(oc[o.id] + 1));
      const tip = archTip(a) + (next.length ? `<br><br><b style="color:#facc15">Recrutar e colocar em campo ativa:</b> ${next.map(o => `${o.icon} ${o.name} (${oc[o.id] + 1})`).join(', ')}` : '');
      return `<div class="shop-card ${ok ? '' : 'unaffordable'} ${next.length && r.board.length < r.teamLimit ? 'completes' : ''}" data-buy="${a.id}" ${tipAttr(tip)}>
        ${next.length && r.board.length < r.teamLimit ? '<span class="next-tier">▲</span>' : ''}
        <div class="shop-avatar" style="background:${a.color}28;border-color:${a.color};">${a.symbol}</div>
        <div class="shop-name">${a.name}</div><div class="shop-role">${a.role}</div>
        <div class="shop-orders">${a.orders.map(id => `<div style="color:${D.ORDERS[id].color}">${D.ORDERS[id].icon} ${D.ORDERS[id].name}</div>`).join('')}</div>
        <div class="shop-cost">🪙 ${cost}g</div></div>`;
    }).join('');
  }

  /* ======================= INSPETOR & MOCHILA ======================= */
  function refreshBag() {
    const r = G.run;
    $('bag-count').textContent = r.bag.length;
    const grid = $('bag-grid');
    if (!r.bag.length) { grid.innerHTML = '<span style="font-size:11px;color:var(--text-muted);">Nenhum item solto.</span>'; return; }
    grid.innerHTML = r.bag.map((it, i) => {
      const def = D.ITEMS[it.id];
      const canFuse = G.fusePartner(i) !== -1 && G.canEdit();
      return `<div class="bag-item-chip t${it.tier}" data-bag="${i}" ${tipAttr(itemTip(it) + '<br><i>Clique para equipar na unidade selecionada</i>')}>${def.icon} ${def.name} <span class="tier-stars">${stars(it.tier)}</span>${canFuse ? `<button class="fuse-btn" data-fuse="${i}" title="Fundir 2 iguais">⚒</button>` : ''}</div>`;
    }).join('');
  }

  function statCells(s) {
    return `<div class="stats-grid">
      <div class="stat-cell"><span>❤️ Vida</span><span class="emerald-text">${s.maxHp}</span></div>
      <div class="stat-cell"><span>🛡️ Armadura</span><span>${s.armor}</span></div>
      <div class="stat-cell"><span>⚔️ Dano (AD)</span><span>${s.ad}</span></div>
      <div class="stat-cell"><span>🔮 Magia (AP)</span><span class="violet-text">${s.ap}</span></div>
      <div class="stat-cell"><span>⚡ Vel. Atq</span><span>${s.attackSpeed}/s</span></div>
      <div class="stat-cell"><span>🎯 Alcance</span><span>${s.range}</span></div>
      <div class="stat-cell"><span>💥 Crítico</span><span class="gold-text">${Math.round(s.critChance * 100)}% ×${s.critDmg}</span></div>
      <div class="stat-cell"><span>🌪️ Esquiva</span><span class="sky-text">${Math.round(s.dodge * 100)}%</span></div>
      <div class="stat-cell"><span>🩸 Vampirismo</span><span>${Math.round(s.lifesteal * 100)}%</span></div>
      <div class="stat-cell"><span>💧 Mana</span><span>${s.startMana}/${s.maxMana}</span></div>
      ${s.initialShield ? `<div class="stat-cell"><span>🔰 Escudo</span><span>${s.initialShield}</span></div>` : ''}
      ${s.trueDmgBonus ? `<div class="stat-cell"><span>☀️ Dano Verd.</span><span>${Math.round(s.trueDmgBonus * 100)}%</span></div>` : ''}
    </div>`;
  }
  function skillsHtml(skills) {
    return Object.entries(skills).filter(([, l]) => l > 0).map(([id, l]) => {
      const sk = D.SKILLS[id]; if (!sk) return '';
      return `<div class="ability-item"><div class="ability-item-head"><span>${sk.icon} ${sk.name} <strong class="gold-text">Nv.${l}</strong></span><span class="ability-type ${sk.type}">${sk.type}</span></div><p>${sk.desc(l)}</p></div>`;
    }).join('');
  }
  function elementsHtml(els) {
    const e = Object.entries(els || {}).filter(([, v]) => v > 0);
    return e.length ? e.map(([k, v]) => `<span class="el-chip" style="color:${D.ELEMENTS[k].color}">${D.ELEMENTS[k].icon} ${D.ELEMENTS[k].name} ×${v}</span>`).join('') : '<span style="font-size:10.5px;color:var(--text-muted);">Nenhum elemento.</span>';
  }

  function refreshInspector() {
    const box = $('inspector'), sub = $('inspector-sub');
    const r = G.run;
    if (UI.inspectEnemyId) {
      const e = r.enemies.find(x => x.id === UI.inspectEnemyId);
      if (e) return renderEnemyInspector(e, box, sub);
      UI.inspectEnemyId = null;
    }
    const u = G.find(G.selectedId);
    if (!u) {
      sub.textContent = 'Nenhuma selecionada';
      box.innerHTML = `<div class="inspector-empty"><div style="font-size:26px;">🧭</div><strong>Selecione uma unidade</strong>
        <span style="font-size:11.5px;">Clique numa unidade sua (campo ou banco) para ver atributos, itens e evoluções — ou num inimigo para estudá-lo antes da luta.</span></div>`;
      return;
    }
    const a = D.ARCHETYPES[u.archetypeId];
    const onBoard = G.onBoard(u.id);
    sub.textContent = `${a.role} • ${onBoard ? 'Em Campo' : 'No Banco'}`;
    const s = R.statsCache.get(u.id) || G.statsOf(u);
    const next = G.xpToNext(u.level), pct = Math.min(100, Math.round(u.xp / next * 100));
    const edit = G.canEdit();
    let equip = '';
    for (let i = 0; i < C.MAX_ITEMS; i++) {
      const it = u.items[i];
      equip += it ? `<div class="equip-slot filled" data-unequip="${i}" ${tipAttr(itemTip(it) + '<br><i>Clique para remover</i>')}><span style="font-size:15px;">${D.ITEMS[it.id].icon}</span><span style="font-weight:800;color:var(--gold-light);font-size:9.5px;">${D.ITEMS[it.id].name}</span><span class="tier-stars">${stars(it.tier)}</span></div>`
        : `<div class="equip-slot"><span style="color:var(--text-muted);">+ Slot ${i + 1}</span></div>`;
    }
    const locked = a.skills.filter(sk => !u.skills[sk]).length;
    box.innerHTML = `
      <div class="unit-header-card">
        <div class="unit-title-row"><h3>${a.symbol} ${esc(u.name)}</h3><span class="lvl-badge">Nível ${u.level}</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${a.orders.map(id => `<span class="el-chip" style="color:${D.ORDERS[id].color}" ${tipAttr(`<b>${D.ORDERS[id].icon} ${D.ORDERS[id].name}</b> (${D.ORDERS[id].kind})<br>${D.ORDERS[id].tiersText}`)}>${D.ORDERS[id].icon} ${D.ORDERS[id].name}</span>`).join('')}<span class="el-chip" style="color:${a.color}">${a.role}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-secondary);"><span>Experiência</span><span>${u.xp} / ${next} (${pct}%)</span></div>
        <div class="progress-track"><div class="progress-fill-xp" style="width:${pct}%"></div></div>
      </div>
      ${statCells(s)}
      <div><div class="sec-label">Equipamentos (até 3)</div><div class="equip-slots-row">${equip}</div></div>
      <div><div class="sec-label">Stacks Elementais</div><div class="tags-wrap">${elementsHtml(u.elements)}</div></div>
      <div><div class="sec-label">Habilidades ${locked ? `<span style="text-transform:none;font-weight:600;">(${locked} bloqueada(s) — use PE)</span>` : ''}</div><div class="ability-list">${skillsHtml(u.skills)}</div></div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:auto;">
        ${u.evoPoints > 0 && edit ? `<button class="btn btn-evo" data-act="evo">⭐ Evoluir (${u.evoPoints} PE)</button>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <button class="btn btn-secondary" data-act="toggle" ${edit ? '' : 'disabled'}>${onBoard ? '⬇️ P/ Banco' : '⬆️ P/ Campo'}</button>
          <button class="btn btn-danger" data-act="sell" ${edit ? '' : 'disabled'}>💰 Vender +${Math.floor(u.cost * C.SELL_RATIO)}g</button>
        </div>
      </div>`;
    box.dataset.unit = u.id;
  }

  function renderEnemyInspector(e, box, sub) {
    const s = G.enemyStats(e);
    const arch = D.ARCHETYPES[e.archetypeId];
    sub.textContent = e.isBoss ? 'Chefe de Ato' : e.isElite ? 'Elite' : 'Inimigo';
    const boss = e.isBoss ? D.BOSSES[G.run.act] : null;
    box.innerHTML = `
      <div class="unit-header-card enemy">
        <div class="unit-title-row"><h3>${e.symbol} ${esc(e.name)}</h3><span class="lvl-badge">Nível ${e.level}</span></div>
        <div style="font-size:11px;color:var(--text-secondary);">Arquétipo base: ${arch.symbol} ${arch.name} (${arch.role})</div>
        ${(e.affixes || []).map(af => `<span class="el-chip" style="color:${D.ELITE_AFFIXES[af].color}">${D.ELITE_AFFIXES[af].icon} ${D.ELITE_AFFIXES[af].name}: ${D.ELITE_AFFIXES[af].desc}</span>`).join('')}
      </div>
      ${boss ? `<div class="info-box"><h4>👑 Mecânica</h4>${boss.mechanic}</div>` : ''}
      ${statCells(s)}
      <div><div class="sec-label">Elementos</div><div class="tags-wrap">${elementsHtml(e.elements)}</div></div>
      <div><div class="sec-label">Habilidades</div><div class="ability-list">${skillsHtml(e.skills)}</div></div>
      <button class="btn btn-secondary" data-act="clear-enemy">← Voltar às minhas unidades</button>`;
  }

  /* ======================= MODAIS ======================= */
  function openModal(kind, { title, sub = '', body = '', footer = '', closable = true, size = '' }) {
    UI.modalKind = kind;
    $('modal-title').innerHTML = title; $('modal-sub').innerHTML = sub;
    $('modal-body').innerHTML = body; $('modal-footer').innerHTML = footer;
    $('modal-footer').style.display = footer ? 'flex' : 'none';
    $('modal-close').style.display = closable ? '' : 'none';
    $('modal-card').className = `modal-card ${size}`;
    $('modal').classList.add('open');
    UI.modalClosable = closable;
    return $('modal-body');
  }
  UI.closeModal = function (force) {
    if (!force && !UI.modalClosable) return;
    if (UI.modalKind === 'map') UI.mapDismissed = true;
    $('modal').classList.remove('open');
    UI.modalKind = null;
    UI.refresh();
  };

  UI.syncModal = function () {
    const r = G.run;
    if (!r) { if (UI.modalKind !== 'title') showTitle(); return; }
    if (USER_MODALS.includes(UI.modalKind) || UI.modalKind === 'title') { if (UI.modalKind === 'evo') renderEvo(); if (UI.modalKind === 'meta') renderMeta(); return; }
    if (r.phase === 'END') { if (UI.modalKind !== 'end') showEnd(); return; }
    if (r.phase === 'CHOICE') { showPending(); return; }
    if (r.phase === 'MAP') {
      if (UI.modalKind === 'pending' || UI.modalKind === 'end') { $('modal').classList.remove('open'); UI.modalKind = null; }
      if (UI.modalKind === 'map') { showMap(); return; }
      if (!UI.mapDismissed && !UI.modalKind) showMap();
      return;
    }
    if (UI.modalKind === 'map' || UI.modalKind === 'pending' || UI.modalKind === 'end' || UI.modalKind === 'title') { $('modal').classList.remove('open'); UI.modalKind = null; }
  };

  /* ---------- Tela de título ---------- */
  function showTitle(fromMenu = false) {
    const m = G.meta, rec = m.records;
    const hasSave = G.hasSave() && !G.run;
    UI.titleAsc = Math.min(UI.titleAsc, m.maxAscension);
    const ascBtns = D.ASCENSIONS.map(a => `<button class="asc-btn ${UI.titleAsc === a.level ? 'active' : ''}" data-asc="${a.level}" ${a.level > m.maxAscension ? 'disabled' : ''} ${tipAttr(`<b>${a.name}</b><br>${a.desc}${a.level > m.maxAscension ? '<br><i>Vença uma expedição no nível anterior para desbloquear.</i>' : ''}`)}>${a.level === 0 ? 'Padrão' : 'A' + a.level}</button>`).join('');
    const body = openModal('title', {
      title: '⚔ Forja Elemental 2.1', sub: 'Auto-battler tático roguelike • 15 salas • 3 Atos', closable: !!(fromMenu && G.run), size: 'narrow',
      body: `<div class="title-hero"><div class="logo">FORJA ELEMENTAL</div><div class="tag">Monte sua composição, divida a experiência e forje elementos até o Arconte do Eclipse.</div></div>
        ${G.migratedNotice ? '<div class="info-box" style="margin-bottom:12px;border-color:var(--emerald)">✅ Seus Fragmentos Astrais e melhorias da versão anterior foram importados.</div>' : ''}
        <div class="records" style="margin-bottom:14px;grid-template-columns:repeat(5,1fr);">
          <div class="record"><b>${rec.runs}</b><span>Expedições</span></div><div class="record"><b>${rec.wins}</b><span>Vitórias</span></div><div class="record"><b>${FE.Achievements.count()}/${FE.Achievements.list.length}</b><span>Conquistas</span></div>
          <div class="record"><b>${rec.bestRoom}/15</b><span>Melhor sala</span></div><div class="record"><b>${rec.kills}</b><span>Abates</span></div>
        </div>
        ${fromMenu && G.run ? `<div class="info-box" style="margin-bottom:12px;">Expedição em andamento: Ato ${G.run.act}, Sala ${G.run.room}/15 (seed ${esc(G.run.seed)}). Iniciar outra abandona a atual.</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div class="form-row"><label>Ascensão (dificuldade)</label><div class="asc-list" id="asc-list">${ascBtns}</div><span class="muted" style="font-size:11.5px;" id="asc-desc">${D.ASCENSIONS[UI.titleAsc].desc}</span></div>
          <div class="form-row"><label>Seed (opcional — mesma seed, mesmo mapa e hordas)</label><input class="input" id="seed-input" maxlength="24" placeholder="Deixe vazio para aleatória" /></div>
        </div>`,
      footer: `<div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" data-act="open-meta">🌌 Santuário (${m.astralShards})</button>
          <button class="btn btn-secondary" data-act="open-codex">📖 Como Jogar</button>
          <button class="btn btn-secondary" data-act="open-ach">🏆 Conquistas</button></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${hasSave ? '<button class="btn btn-evo btn-lg" data-act="continue">📂 Continuar</button>' : ''}
          ${fromMenu && G.run ? '<button class="btn btn-secondary btn-lg" data-act="close">↩ Voltar</button>' : ''}
          <button class="btn btn-primary btn-lg" data-act="new-run">⚔️ Nova Expedição</button></div>`
    });
    body.querySelectorAll('[data-asc]').forEach(b => b.addEventListener('click', () => { UI.titleAsc = +b.dataset.asc; showTitle(fromMenu); }));
    const f = $('modal-footer');
    f.querySelector('[data-act="new-run"]').addEventListener('click', () => {
      const seed = $('seed-input').value;
      if (fromMenu && G.run && !UI.confirmAbandon) { UI.confirmAbandon = true; UI.toast('Clique de novo em "Nova Expedição" para confirmar o abandono da atual.', 'error'); return; }
      UI.confirmAbandon = false;
      $('combat-log').innerHTML = ''; UI.prevTiers = {}; UI.prevTiersReady = false;
      G.newRun({ seed, ascension: UI.titleAsc });
      UI.mapDismissed = false; UI.inspectEnemyId = null; G.selectedId = null;
      $('modal').classList.remove('open'); UI.modalKind = null; UI.refresh();
    });
    const cont = f.querySelector('[data-act="continue"]');
    if (cont) cont.addEventListener('click', () => { $('combat-log').innerHTML = ''; UI.prevTiers = {}; UI.prevTiersReady = false; G.loadRun(); $('modal').classList.remove('open'); UI.modalKind = null; UI.mapDismissed = false; UI.refresh(); });
    const back = f.querySelector('[data-act="close"]');
    if (back) back.addEventListener('click', () => UI.closeModal(true));
    f.querySelector('[data-act="open-meta"]').addEventListener('click', () => UI.openMeta(() => showTitle(fromMenu)));
    f.querySelector('[data-act="open-codex"]').addEventListener('click', () => UI.openCodex('guia', () => showTitle(fromMenu)));
    f.querySelector('[data-act="open-ach"]').addEventListener('click', () => UI.openAch(() => showTitle(fromMenu)));
  }
  UI.showTitle = showTitle;

  /* ---------- Mapa ---------- */
  function showMap() {
    const r = G.run, mapd = r.map;
    const avail = new Set(r.phase === 'MAP' ? G.availableNodes().map(n => n.id) : []);
    const visited = new Set(r.visited);
    const W = 820, H = 390, fx = (f) => 70 + (f - 1) * 170;
    const pos = {};
    mapd.floors.forEach(fl => fl.forEach((n, i) => { pos[n.id] = { x: fx(n.floor), y: H / 2 + 8 + (i - (fl.length - 1) / 2) * 86 }; }));
    let edges = '', nodes = '';
    mapd.floors.forEach(fl => fl.forEach(n => n.next.forEach(id => {
      const a = pos[n.id], b = pos[id];
      const onPath = visited.has(n.id) && (visited.has(id) || avail.has(id));
      edges += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${onPath ? '#fbbf24' : '#3d5280'}" stroke-width="${onPath ? 3 : 2}" stroke-dasharray="${onPath ? '' : '5 6'}" opacity="${onPath ? 0.9 : 0.6}"/>`;
    })));
    mapd.floors.forEach(fl => fl.forEach(n => {
      const p = pos[n.id], t = D.NODE_TYPES[n.type];
      const isCur = r.nodeId === n.id, isAv = avail.has(n.id), isVis = visited.has(n.id);
      const rad = n.type === 'chefe' ? 30 : 23;
      const tip = `<b>${t.icon} ${t.name}</b> — Sala ${n.room}<br>${t.desc}${(n.type === 'combate' || n.type === 'elite') ? `<br>Arena: ${D.ARENA[n.affix].icon} ${D.ARENA[n.affix].name} (${D.ARENA[n.affix].desc})` : ''}${n.layout ? `<br>Terreno: ${D.LAYOUTS[n.layout].icon} <b>${D.LAYOUTS[n.layout].name}</b> — ${D.LAYOUTS[n.layout].desc}` : ''}${n.type === 'chefe' ? `<br><br><b>${D.BOSSES[n.act].name}</b>: ${D.BOSSES[n.act].mechanic}` : ''}`;
      nodes += `<g class="map-node ${isAv ? 'reachable' : ''}" data-node="${n.id}" ${tipAttr(tip)} opacity="${!isAv && !isVis && !isCur ? 0.55 : 1}">
        ${isAv ? `<circle class="ring" cx="${p.x}" cy="${p.y}" r="${rad + 6}" fill="none" stroke="${t.color}"/>` : ''}
        <circle class="body" cx="${p.x}" cy="${p.y}" r="${rad}" fill="${isVis ? '#2a2f45' : '#18233c'}" stroke="${isCur ? '#fbbf24' : t.color}" stroke-width="${isCur ? 4 : 2}"/>
        <text x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="middle" font-size="${n.type === 'chefe' ? 26 : 20}">${isVis && !isCur ? '✔️' : t.icon}</text>
        <text x="${p.x}" y="${p.y + rad + 15}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#94a3b8">${t.name}${n.layout ? ' ' + D.LAYOUTS[n.layout].icon : ''}</text></g>`;
    }));
    const floorsLbl = [1, 2, 3, 4, 5].map(f => `<text x="${fx(f)}" y="18" text-anchor="middle" font-size="11" font-weight="800" fill="#64748b">SALA ${(r.act - 1) * 5 + f}</text>`).join('');
    const boss = D.BOSSES[r.act];
    const body = openModal('map', {
      title: `🗺️ ${D.ACTS[r.act].short} — ${D.ACTS[r.act].name}`,
      sub: r.phase === 'MAP' ? 'Escolha um nó pulsante. Passe o mouse para ver detalhes.' : 'Visualização do caminho deste Ato.',
      size: 'wide',
      body: `<div class="map-wrap"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">${floorsLbl}${edges}${nodes}</svg></div>
        <div class="map-info">
          <div class="info-box"><h4>👑 Guardião do Ato</h4><b>${boss.symbol} ${boss.name}</b><br>${boss.mechanic}</div>
          <div class="info-box"><h4>Legenda</h4><div class="legend">${Object.values(D.NODE_TYPES).map(t => `<span>${t.icon} ${t.name}</span>`).join('')}</div>
            <div style="margin-top:6px;">Salas não-combate não dão XP de combate, mas oferecem recursos. Dica: prepare-se (itens, PE) antes de clicar.</div></div>
        </div>`,
      footer: `<span>Cidadela ❤️ ${r.citadelHp}/${r.citadelMax} • Ouro ${r.gold}g • Unidades ${G.allUnits().length}</span><button class="btn btn-secondary" data-act="close">👀 Ver tabuleiro (preparar)</button>`
    });
    body.querySelectorAll('.map-node.reachable').forEach(g => g.addEventListener('click', () => {
      $('tooltip').style.display = 'none';
      UI.modalKind = null; $('modal').classList.remove('open');
      G.chooseNode(g.dataset.node);
    }));
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => UI.closeModal(true));
  }
  UI.showMap = function () { if (G.run) { UI.mapDismissed = false; showMap(); } };

  /* ---------- Escolhas pendentes ---------- */
  function showPending() {
    const p = G.currentPending();
    if (!p) return;
    if (p.kind === 'report') return showReport(p);
    const isShop = p.kind === 'shop';
    const list = isShop ? p.offers : p.options;
    const cards = list.map((o, i) => {
      const afford = G.optionAffordable(o);
      const rc = o.rarity ? D.RARITY[o.rarity].color : '';
      const cls = o.sold ? 'sold' : (!afford ? 'disabled' : '');
      return `<div class="rl-card ${cls}" data-opt="${i}" style="${rc ? `--rc:${rc}` : ''}">
        <div class="ic">${o.icon}</div><h3>${o.title}</h3><p>${o.desc}</p>
        ${isShop ? `<span class="rl-price">${o.sold ? 'Vendido' : `🪙 ${o.price}g`}</span>` : `<span class="rl-tag" ${rc ? `style="color:${rc};border-color:${rc}"` : ''}>${o.tag || 'Escolher'}</span>`}</div>`;
    }).join('');
    const body = openModal('pending', {
      title: p.title, sub: p.subtitle || '', closable: false,
      body: `<div class="cards-grid">${cards}</div>`,
      footer: `<span>🪙 Ouro: <b class="gold-text">${G.run.gold}g</b> • ❤️ Cidadela ${G.run.citadelHp}/${G.run.citadelMax}</span>
        ${isShop ? '<button class="btn btn-primary" data-act="skip">Seguir viagem →</button>' : p.allowSkip ? '<button class="btn btn-secondary" data-act="skip">Pular (sem recompensa)</button>' : ''}`
    });
    body.querySelectorAll('[data-opt]').forEach(c => c.addEventListener('click', () => { $('tooltip').style.display = 'none'; G.resolveOption(+c.dataset.opt); }));
    const sk = $('modal-footer').querySelector('[data-act="skip"]');
    if (sk) sk.addEventListener('click', () => G.skipPending());
  }

  function showReport(p) {
    const rep = p.report || [];
    const maxD = Math.max(1, ...rep.map(x => x.dmgDealt)), maxT = Math.max(1, ...rep.map(x => x.dmgTaken)), maxH = Math.max(1, ...rep.map(x => x.healDone));
    const mvp = rep.slice().sort((a, b) => (b.dmgDealt + b.healDone) - (a.dmgDealt + a.healDone))[0];
    const bar = (v, m, c) => `<div class="bar-cell"><div class="bar" style="width:${Math.round(v / m * 90)}px;background:${c}"></div><span>${v}</span></div>`;
    const rows = rep.map(x => `<tr><td>${x.symbol} ${esc(x.name)} ${x === mvp ? '👑' : ''} ${x.survived ? '' : '<span class="dead-tag">✖ caiu</span>'}</td>
      <td>${bar(x.dmgDealt, maxD, '#f59e0b')}</td><td>${bar(x.dmgTaken, maxT, '#ef4444')}</td><td>${bar(x.healDone, maxH, '#10b981')}</td><td>${x.kills}</td></tr>`).join('');
    const body = openModal('pending', {
      title: p.title, sub: `Duração do combate: ${p.time ? p.time.toFixed(1) : '?'}s`, closable: false,
      body: `<div class="report-lines">${p.lines.map(l => `<div>${l}</div>`).join('')}</div>
        ${p.levelUps && p.levelUps.length ? `<div style="margin-bottom:12px;">${p.levelUps.map(l => `<span class="lvl-chip">⭐ ${esc(l)}</span>`).join('')}</div>` : ''}
        <table class="report-table"><thead><tr><th>Unidade</th><th>Dano causado</th><th>Dano sofrido</th><th>Cura/Escudo</th><th>Abates</th></tr></thead><tbody>${rows}</tbody></table>`,
      footer: `<span>Invocações (torretas, lobos) têm o dano creditado ao dono.</span><button class="btn btn-primary" data-act="next">Continuar →</button>`
    });
    $('modal-footer').querySelector('[data-act="next"]').addEventListener('click', () => G.skipPending());
  }

  /* ---------- Fim de run ---------- */
  function showEnd() {
    const r = G.run, e = r.ended;
    openModal('end', {
      title: e.victory ? '👑 EXPEDIÇÃO CONCLUÍDA — VITÓRIA!' : '💀 A CIDADELA CAIU',
      sub: `Ato ${r.act} • Sala ${r.room}/15 • seed ${esc(r.seed)}${r.ascension ? ` • Ascensão ${r.ascension}` : ''}`, closable: false, size: 'narrow',
      body: `<div class="records" style="margin-bottom:14px;">
          <div class="record"><b class="violet-text">+${e.shards}</b><span>Fragmentos</span></div><div class="record"><b>${r.stats.kills}</b><span>Abates</span></div>
          <div class="record"><b>${r.stats.wins}/${r.stats.combats}</b><span>Vitórias/combates</span></div><div class="record"><b>${r.relics.length}</b><span>Relíquias</span></div></div>
        ${e.unlocked ? `<div class="info-box" style="border-color:var(--gold);margin-bottom:12px;">🔓 <b>Nova dificuldade desbloqueada:</b> ${D.ASCENSIONS[G.meta.maxAscension].name} — ${D.ASCENSIONS[G.meta.maxAscension].desc}</div>` : ''}
        <div class="info-box"><h4>Sua composição final</h4>${G.allUnits().map(u => `${D.ARCHETYPES[u.archetypeId].symbol} ${esc(u.name)} (Nv.${u.level})`).join(' • ') || '—'}</div>`,
      footer: `<button class="btn btn-evo" data-act="meta">🌌 Santuário Astral (${G.meta.astralShards})</button><button class="btn btn-primary btn-lg" data-act="again">🔄 Nova Expedição</button>`
    });
    const f = $('modal-footer');
    f.querySelector('[data-act="meta"]').addEventListener('click', () => UI.openMeta(() => { G.run = null; UI.refresh(); }));
    f.querySelector('[data-act="again"]').addEventListener('click', () => { G.run = null; UI.modalKind = null; UI.refresh(); });
  }

  /* ---------- Evolução ---------- */
  UI.openEvo = function (unitId) {
    if (!G.run || !G.canEdit()) return;
    const eligible = G.allUnits().filter(u => u.evoPoints > 0);
    if (!eligible.length) return UI.toast('Nenhuma unidade com Pontos de Evolução.', 'info');
    UI.evoUnitId = unitId && eligible.some(u => u.id === unitId) ? unitId : (eligible.some(u => u.id === UI.evoUnitId) ? UI.evoUnitId : eligible[0].id);
    UI.modalKind = 'evo';
    renderEvo();
  };
  function renderEvo() {
    const eligible = G.allUnits().filter(u => u.evoPoints > 0);
    if (!eligible.length) { UI.modalKind = null; $('modal').classList.remove('open'); UI.refresh(); return; }
    if (!eligible.some(u => u.id === UI.evoUnitId)) UI.evoUnitId = eligible[0].id;
    const u = eligible.find(x => x.id === UI.evoUnitId), a = D.ARCHETYPES[u.archetypeId];
    const syn = G.synergyCounts(), onBoard = G.onBoard(u.id);
    const tabs = eligible.map(x => `<button class="unit-tab-btn ${x.id === u.id ? 'active' : ''}" data-evotab="${x.id}">${D.ARCHETYPES[x.archetypeId].symbol} ${esc(x.name)} (Nv.${x.level}) <span class="pts-pill">+${x.evoPoints} PE</span></button>`).join('');
    const skills = a.skills.map(id => {
      const sk = D.SKILLS[id], cur = u.skills[id] || 0, max = cur >= 3, nxt = Math.min(3, cur + 1);
      return `<button class="evo-choice" data-sk="${id}" ${max ? 'disabled' : ''}><div class="evo-choice-top"><span>${sk.icon} ${sk.name} <strong class="gold-text">(Nv.${cur} → ${max ? 'MÁX' : 'Nv.' + nxt})</strong></span><span class="ability-type ${sk.type}">${cur ? sk.type : 'desbloquear'}</span></div><div class="evo-choice-desc">${sk.desc(nxt)}</div></button>`;
    }).join('');
    const els = Object.values(D.ELEMENTS).map(el => {
      const st = u.elements[el.id] || 0, team = syn[el.id], next = team + (onBoard ? 1 : 0);
      const reach = onBoard && C.SYN_THRESHOLDS.includes(next);
      return `<button class="evo-choice" data-el="${el.id}" style="border-left:3px solid ${el.color}"><div class="evo-choice-top"><span style="color:${el.color}">${el.icon} ${el.name} (${st} → ${st + 1})</span><span style="font-size:10.5px;color:${reach ? '#facc15' : 'var(--text-muted)'}">Time: ${team} → ${next}${reach ? ' ⭐' : ''}</span></div><div class="evo-choice-desc"><b>Pessoal:</b> ${el.personalDesc}</div></button>`;
    }).join('');
    const body = openModal('evo', {
      title: '⭐ Evolução — Pontos de Evolução (PE)', sub: 'Aprimore habilidades exclusivas (até Nv.3) ou acumule elementos para sinergias 2/4/6/8.', size: 'wide',
      body: `<div class="unit-tabs">${tabs}</div><div class="evo-grid">
        <div><div class="evo-section-title"><span>1. Habilidades de ${a.name}</span><span>Restam ${u.evoPoints} PE</span></div><div class="evo-options">${skills}</div></div>
        <div><div class="evo-section-title"><span>2. Elementos</span><span>${onBoard ? 'Conta p/ sinergia' : 'No banco: não conta'}</span></div><div class="evo-options">${els}</div></div></div>`,
      footer: '<span>Cada stack fortalece a unidade e soma para a sinergia do time enquanto ela estiver em campo.</span><button class="btn btn-primary" data-act="close">Concluir</button>'
    });
    body.querySelectorAll('[data-evotab]').forEach(b => b.addEventListener('click', () => { UI.evoUnitId = +b.dataset.evotab; renderEvo(); }));
    body.querySelectorAll('[data-sk]').forEach(b => b.addEventListener('click', () => G.upgradeSkill(u.id, b.dataset.sk)));
    body.querySelectorAll('[data-el]').forEach(b => b.addEventListener('click', () => G.addElement(u.id, b.dataset.el)));
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => UI.closeModal(true));
  }

  /* ---------- Santuário (meta) ---------- */
  UI.openMeta = function (onBack) { UI.metaBack = onBack || null; UI.modalKind = 'meta'; renderMeta(); };
  function renderMeta() {
    const m = G.meta;
    const rows = Object.entries(D.META_UPGRADES).map(([id, u]) => {
      const lvl = m.upgrades[id] || 0, max = lvl >= u.maxLevel, cost = G.metaCost(id);
      return `<div class="info-box" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div><div style="font-size:14px;font-weight:800;color:var(--text-primary);">${u.icon} ${u.name} <span class="gold-text">(${lvl}/${u.maxLevel})</span></div><div style="margin-top:2px;">${u.desc(lvl)}</div></div>
        <button class="btn btn-primary" data-meta="${id}" ${max || m.astralShards < cost ? 'disabled' : ''}>${max ? 'MÁXIMO' : `🌌 ${cost}`}</button></div>`;
    }).join('');
    const body = openModal('meta', {
      title: '🌌 Santuário Astral', sub: 'Melhorias permanentes compradas com Fragmentos Astrais (ganhos ao fim de cada expedição).', size: 'narrow',
      body: `<div style="display:flex;flex-direction:column;gap:8px;">${rows}</div>
        <div class="info-box" style="margin-top:10px;"><h4>Ascensão</h4>Dificuldade máxima desbloqueada: <b>${D.ASCENSIONS[m.maxAscension].name}</b>. Vença uma expedição no seu nível máximo para liberar o próximo.</div>`,
      footer: `<span>Fragmentos: <b class="violet-text">${m.astralShards}</b></span><button class="btn btn-primary" data-act="close">${UI.metaBack ? '← Voltar' : 'Fechar'}</button>`
    });
    body.querySelectorAll('[data-meta]').forEach(b => b.addEventListener('click', () => { if (G.buyMeta(b.dataset.meta)) renderMeta(); }));
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => metaClose());
  }
  function metaClose() {
    const back = UI.metaBack; UI.metaBack = null;
    if (back) { UI.modalKind = null; back(); } else UI.closeModal(true);
  }

  /* ---------- Configurações ---------- */
  UI.openSettings = function () {
    const s = FE.settings;
    const row = (k, label, desc) => `<div class="setting-row"><div><b>${label}</b><div class="muted" style="font-size:11.5px;">${desc}</div></div><div class="toggle ${s[k] ? 'on' : ''}" data-toggle="${k}"></div></div>`;
    const body = openModal('settings', {
      title: '⚙️ Configurações', size: 'narrow',
      body: `${row('sound', 'Som', 'Efeitos sonoros sintetizados.')}
        <div class="setting-row"><div><b>Volume</b></div><input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" id="vol"/></div>
        ${row('fx', 'Efeitos visuais', 'Partículas, ondas e números flutuantes no combate (desligue em aparelhos lentos).')}
        ${row('autoEvo', 'Abrir Evolução automaticamente', 'Ao entrar numa sala com PE disponíveis.')}
        <div class="setting-row"><div><b>Abandonar expedição</b><div class="muted" style="font-size:11.5px;">Encerra a run atual sem Fragmentos.</div></div><button class="btn btn-danger" data-act="abandon" ${G.run && G.run.phase !== 'COMBAT' ? '' : 'disabled'}>Abandonar</button></div>`,
      footer: `<span>Atalhos: Espaço iniciar/mapa • S velocidade • A auto-posicionar • E evoluir • M mapa • C códice • Esc fechar</span><button class="btn btn-primary" data-act="close">Fechar</button>`
    });
    body.querySelectorAll('[data-toggle]').forEach(t => t.addEventListener('click', () => { s[t.dataset.toggle] = !s[t.dataset.toggle]; FE.applySettings(); UI.openSettings(); }));
    $('vol').addEventListener('input', (e) => { s.volume = e.target.value / 100; FE.applySettings(); });
    body.querySelector('[data-act="abandon"]').addEventListener('click', (e) => {
      if (e.target.dataset.armed) { G.abandonRun(); $('modal').classList.remove('open'); UI.modalKind = null; UI.refresh(); return; }
      e.target.dataset.armed = '1'; e.target.textContent = 'Confirmar abandono';
    });
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => UI.closeModal(true));
  };

  /* ---------- Códice ---------- */
  UI.openCodex = function (tab, onBack) {
    if (tab) UI.codexTab = tab;
    if (onBack !== undefined) UI.codexBack = onBack;
    const tabs = [['guia', '🧭 Como Jogar'], ['arq', '⚔️ Arquétipos'], ['sin', '✦ Sinergias'], ['ter', '🏞️ Terrenos'], ['rel', '🏺 Relíquias'], ['itm', '🎒 Itens'], ['ini', '👹 Inimigos'], ['notas', '📝 Notas da Versão']];
    let content = '';
    const t = UI.codexTab;
    if (t === 'guia') content = `<div class="codex-prose">
      <h3>Objetivo</h3><p>Atravesse 15 salas em 3 Atos e derrote os três Guardiões. Se a Cidadela chegar a 0, a expedição termina — mas você leva Fragmentos Astrais para melhorias permanentes.</p>
      <h3>O coração da estratégia: XP compartilhado</h3><p>Cada sala gera um <b>pool de XP dividido apenas entre as unidades em campo</b>. Poucas unidades sobem de nível muito rápido (hyper-carry); muitas unidades ativam mais sinergias, mas crescem devagar. O controle <b>Comp 1–16</b> no topo define o limite do campo. O banco não divide XP.</p>
      <h3>Evolução</h3><p>Cada nível concede 1 PE. Gaste-o para desbloquear/aprimorar uma das 4 habilidades do arquétipo (até Nv.3) <i>ou</i> para absorver 1 stack de elemento.</p>
      <h3>Sinergias</h3><ul><li><b>Elementos</b> (2/4/6/8 stacks somados no campo): Fogo, Água, Pedra, Ar, Solar, Lunar.</li><li><b>Classes</b> (2/4/6): Bastião, Lâmina, Arcano, Devoção e Invocador.</li><li><b>Origens</b> (2/3/4): Selvagem, Oculto, Celestial e Engenho.</li><li>Cada arquétipo tem 1 Classe + 1 Origem. Na loja, ▲ indica que recrutar aquela unidade ativa um novo nível.</li></ul>
      <h3>Terreno</h3><p>O tabuleiro é 12×12 e muda a cada sala: montanhas, lagos, rios com pontes, ravinas, florestas (esquiva), colinas (alcance), pântanos (lentidão) e lava (dano). Posicione-se pensando nos gargalos.</p>
      <h3>Conquistas</h3><p>27 conquistas permanentes (botão 🏆) que rendem Fragmentos Astrais.</p>
      <h3>Mapa</h3><p>Cada Ato tem um mapa ramificado. Combates e Elites dão XP; Forja, Santuário, Acampamento, Mercador e Mistério dão recursos sem lutar. Elites e Chefes garantem relíquias.</p>
      <h3>Controles</h3><ul><li>Arraste unidades entre banco e campo, ou dentro do campo para trocar posições. Arraste até a loja para vender.</li><li>Clique em inimigos durante a preparação para estudá-los.</li><li>Itens: selecione uma unidade e clique no item da mochila. Dois itens iguais do mesmo tier podem ser fundidos (★→★★→★★★).</li><li>Atalhos: <code>Espaço</code> <code>S</code> <code>A</code> <code>E</code> <code>M</code> <code>C</code> <code>Esc</code>.</li></ul></div>`;
    if (t === 'arq') content = `<div class="codex-grid">${Object.values(D.ARCHETYPES).map(a => `<div class="codex-card"><h4><span>${a.symbol} ${a.name}</span><span class="gold-text">${a.cost}g</span></h4>
      <div>${a.role} • ${ordersLine(a)}</div>
      <div>❤️ ${a.stats.maxHp} • ⚔️ ${a.stats.ad} • 🔮 ${a.stats.ap} • 🛡️ ${a.stats.armor} • ⚡ ${a.stats.attackSpeed} • 🎯 ${a.stats.range}</div>
      ${a.skills.map(s => `<div>${D.SKILLS[s].icon} <b>${D.SKILLS[s].name}</b> <i>(${D.SKILLS[s].type})</i>: ${D.SKILLS[s].desc(1)}</div>`).join('')}</div>`).join('')}</div>`;
    if (t === 'sin') content = `<div class="codex-grid">${Object.values(D.ELEMENTS).map(e => `<div class="codex-card"><h4 style="color:${e.color}">${e.icon} ${e.name}</h4><div><b>Pessoal:</b> ${e.personalDesc}</div><div><b>Sinergia 2/4/6/8:</b> ${e.tiersText}</div></div>`).join('')}
      ${Object.values(D.ORDERS).map(o => `<div class="codex-card"><h4 style="color:${o.color}"><span>${o.icon} ${o.name}</span><span class="kind-tag">${o.kind}</span></h4><div>Membros: ${o.members.map(m => D.ARCHETYPES[m].symbol + ' ' + D.ARCHETYPES[m].name).join(', ')}</div><div><b>${o.thresholds.join('/')}:</b> ${o.tiersText}</div></div>`).join('')}</div>`;
    if (t === 'ter') content = `<div class="codex-prose" style="margin-bottom:12px;"><p>Cada sala de combate acontece num tabuleiro 12×12 com terreno próprio, espelhado entre os dois lados. Obstáculos forçam as unidades a contornar (elas calculam o caminho sozinhas) e pontes viram gargalos. Passe o mouse sobre uma casa do tabuleiro para ver seu efeito.</p></div>
      <div class="codex-grid">${Object.entries(D.TERRAIN).filter(([k]) => k !== '.').map(([k, t]) => `<div class="codex-card"><h4><span>${t.icon} ${t.name}</span><span class="kind-tag">${t.blocked ? 'bloqueia' : 'passável'}</span></h4><div>${t.desc}</div></div>`).join('')}
      ${Object.values(D.LAYOUTS).map(l => `<div class="codex-card"><h4><span>${l.icon} ${l.name}</span><span class="kind-tag">Ato ${l.acts.map(a => ['', 'I', 'II', 'III'][a]).join(', ')}</span></h4><div>${l.desc}</div></div>`).join('')}</div>`;
    if (t === 'rel') content = `<div class="codex-grid">${Object.values(D.RELICS).map(r => `<div class="codex-card" style="border-color:${D.RARITY[r.rarity].color}55"><h4><span>${r.icon} ${r.name}</span><span style="color:${D.RARITY[r.rarity].color};font-size:11px;">${D.RARITY[r.rarity].name}</span></h4><div>${r.desc}</div></div>`).join('')}</div>`;
    if (t === 'itm') content = `<div class="codex-grid">${Object.values(D.ITEMS).map(i => `<div class="codex-card"><h4>${i.icon} ${i.name}</h4><div>★ ${i.descFor(1)}</div><div class="muted">★★★ ${i.descFor(3)}</div></div>`).join('')}</div>`;
    if (t === 'ini') content = `<div class="codex-grid">${[1, 2, 3].map(a => `<div class="codex-card"><h4>${D.ACTS[a].short} — ${D.ACTS[a].name}</h4><div style="font-size:16px;letter-spacing:3px;">${Object.values(D.ACTS[a].faction).map(f => `<span title="${f[0]}">${f[1]}</span>`).join(' ')}</div><div><b>${D.BOSSES[a].symbol} ${D.BOSSES[a].name}:</b> ${D.BOSSES[a].mechanic}</div></div>`).join('')}
      ${Object.values(D.ELITE_AFFIXES).map(f => `<div class="codex-card"><h4 style="color:${f.color}">${f.icon} Afixo de Elite: ${f.name}</h4><div>${f.desc}</div></div>`).join('')}
      <div class="codex-card"><h4>⛈️ Tempestade da Forja</h4><div>Após 45s de combate, todas as unidades sofrem dano crescente — impede impasses.</div></div></div>`;
    if (t === 'notas') content = `<div class="codex-prose">
      <h3>v2.1 — novidades</h3>
      <ul><li><b>Tabuleiro 12×12</b> com <b>terreno físico</b>: 9 tipos de casa (montanha, água, ravina, pilar, ponte, floresta, colina, pântano, lava) e 9 mapas procedurais (Rio das Pontes, Lago Central, Passo da Montanha, Ravina Partida, Campos de Magma…). As unidades usam <b>busca de caminho</b> para contornar obstáculos.</li>
      <li><b>5 novos arquétipos</b> (Paladino, Monge, Alquimista, Bardo, Necromante) → 14 arquétipos e 56 habilidades.</li>
      <li><b>9 sinergias de classe</b>: cada unidade tem uma <b>Classe</b> (Bastião, Lâmina, Arcano, Devoção, Invocador) e uma <b>Origem</b> (Selvagem, Oculto, Celestial, Engenho).</li>
      <li>Painel de sinergias unificado (ativas no topo), aviso quando um nível é ativado e ▲ na loja.</li>
      <li><b>27 conquistas</b> com recompensa em Fragmentos.</li></ul>
      <h3>v2.0</h3>
      <ul><li><b>Mapa ramificado de verdade</b> por Ato (estilo roguelike), com 8 tipos de sala, incluindo Mercador e Mistério (6 eventos).</li>
      <li><b>2 novos arquétipos</b> (Lanceiro e Druida) → 9 arquétipos e 36 habilidades; invocações genéricas (torretas, lobos).</li>
      <li><b>Ordens</b>: segunda camada de sinergia por classe (2/4/6).</li>
      <li><b>Chefes com mecânicas</b> (fúria, invocações, fases Solar/Lunar e Eclipse) e <b>Elites com afixos</b>.</li>
      <li><b>24 relíquias com raridade</b> e <b>16 itens com tiers ★1–★3</b> por fusão.</li>
      <li><b>Facções</b> temáticas por Ato, <b>Ascensão 0–5</b>, <b>seed</b> reproduzível e <b>salvamento automático</b> da run.</li>
      <li><b>Relatório pós-combate</b> (dano, dano sofrido, cura, abates, MVP), inspeção de inimigos, arrastar-e-soltar banco↔campo, venda por arraste, auto-posicionamento, atalhos e configurações.</li>
      <li><b>Correções</b>: espinhos, explosões de queimadura e afixo explosivo agora disparam morte corretamente; vitória não depende de invocações vivas; combates longos encerram via Tempestade da Forja.</li>
      <li><b>Balanceamento</b>: curva de inimigos recalibrada com simulações automatizadas (a v1 tinha um pico de dificuldade intransponível no 1º chefe).</li></ul>
      <h3>Arquitetura (pensada para escalar)</h3>
      <ul><li><code>core.js</code> — namespace, RNG com seed serializável, barramento de eventos, storage.</li>
      <li><code>data.js</code> — todo o conteúdo declarativo (arquétipos, habilidades, relíquias, itens, facções, chefes, meta).</li>
      <li><code>engine.js</code> — lógica pura sem DOM: atributos, geração procedural, simulação de combate. Roda no Node para testes.</li>
      <li><code>game.js</code> — regras da expedição, economia, escolhas pendentes serializáveis, save versionado com migração da v1.</li>
      <li><code>render.js</code> / <code>ui.js</code> / <code>audio.js</code> / <code>main.js</code> — apresentação e entrada.</li>
      <li><code>achievements.js</code> — conquistas declarativas testadas por eventos.</li>
      <li><code>tests/sim.js</code> — simulador headless que joga centenas de runs para medir taxa de vitória por Ascensão.</li></ul>
      <h3>Próximos passos sugeridos</h3>
      <ul><li>Desafio diário (seed do dia) e ranking — já viabilizado pelo RNG determinístico.</li><li>Arte/sprites e animações por arquétipo; trilha sonora.</li><li>Mais Atos/facções e eventos via <code>data.js</code>; editor de conteúdo em JSON.</li><li>Servidor autoritativo reutilizando <code>engine.js</code> para modo PvP assíncrono.</li></ul></div>`;
    const body = openModal('codex', {
      title: '📖 Códice da Forja', size: 'wide',
      body: `<div class="codex-tabs">${tabs.map(([k, l]) => `<button class="tab ${k === t ? 'active' : ''}" data-ctab="${k}">${l}</button>`).join('')}</div>${content}`,
      footer: `<span>Forja Elemental v${FE.VERSION}</span><button class="btn btn-primary" data-act="close">${UI.codexBack ? '← Voltar' : 'Fechar'}</button>`
    });
    body.querySelectorAll('[data-ctab]').forEach(b => b.addEventListener('click', () => UI.openCodex(b.dataset.ctab)));
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => {
      const back = UI.codexBack; UI.codexBack = null;
      if (back) { UI.modalKind = null; back(); } else UI.closeModal(true);
    });
  };

  /* ---------- Conquistas ---------- */
  UI.openAch = function (onBack) {
    if (onBack !== undefined) UI.achBack = onBack;
    const m = G.meta, A = FE.Achievements;
    const cards = A.list.map(a => {
      const done = m.ach[a.id];
      const pr = a.progress ? a.progress(m) : null;
      return `<div class="ach-card ${done ? 'done' : ''}"><div class="ach-ic">${a.icon}</div><div style="flex:1;"><h4>${a.name}</h4><p>${a.desc}</p>
        ${pr && !done ? `<div class="ach-progress"><div style="width:${Math.min(100, pr[0] / pr[1] * 100)}%"></div></div><div class="muted" style="font-size:10px;margin-top:2px;">${pr[0]}/${pr[1]}</div>` : ''}
        <div class="ach-meta">${done ? `✔ ${new Date(done).toLocaleDateString('pt-BR')} • ` : ''}🌌 +${a.reward}</div></div></div>`;
    }).join('');
    const total = A.list.reduce((s, a) => s + a.reward, 0), got = A.list.filter(a => m.ach[a.id]).reduce((s, a) => s + a.reward, 0);
    openModal('ach', {
      title: `🏆 Conquistas — ${A.count()}/${A.list.length}`, sub: `Fragmentos ganhos com conquistas: ${got}/${total}`, size: 'wide',
      body: `<div class="ach-grid">${cards}</div>`,
      footer: `<span>As conquistas são permanentes e valem para todas as expedições.</span><button class="btn btn-primary" data-act="close">${UI.achBack ? '← Voltar' : 'Fechar'}</button>`
    });
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => {
      const back = UI.achBack; UI.achBack = null;
      if (back) { UI.modalKind = null; back(); } else UI.closeModal(true);
    });
  };

  /* ======================= REFRESH ======================= */
  UI.refresh = function () {
    const r = G.run;
    if (r && r.phase !== UI.lastPhase) { if (r.phase === 'MAP') UI.mapDismissed = false; UI.lastPhase = r.phase; }
    if (!r) UI.lastPhase = null;
    R.invalidate();
    refreshHeader();
    if (r) { refreshBoardChrome(); refreshSynergies(); refreshBench(); refreshShop(); refreshInspector(); refreshBag(); }
    UI.syncModal();
  };

  UI.updateBossBar = function () {
    const bar = $('boss-bar');
    const c = G.combat;
    const boss = c && G.run && G.run.phase === 'COMBAT' ? c.units.find(u => u.isBoss) : null;
    if (!boss) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';
    $('bb-name').textContent = `${boss.symbol} ${boss.name}${boss.ss.phase ? (boss.ss.phase === 'solar' ? ' — ☀️ Fase Solar' : ' — 🌙 Fase Lunar') : ''}${boss.ss.enraged ? ' — 🔥 Fúria' : ''}`;
    $('bb-fill').style.width = `${Math.max(0, boss.hp / boss.stats.maxHp * 100)}%`;
    $('bb-shield').style.width = `${Math.min(100, boss.shield / boss.stats.maxHp * 100)}%`;
  };

  /* ======================= ENTRADA ======================= */
  function startDrag(id, fromBoard, e) {
    UI.drag = { id, fromBoard, sx: e.clientX, sy: e.clientY, moved: false };
  }
  function onMove(e) {
    if (R.canvas) {
      const t = R.tileAt(e.clientX, e.clientY);
      R.hover = t.inside ? t : null;
      const tip = $('tooltip');
      if (t.inside && G.run && !UI.drag && !UI.modalKind) {
        const code = FE.Engine.terrainAt(G.run.terrain, t.col, t.row);
        if (code !== '.') {
          const T = D.TERRAIN[code];
          tip.innerHTML = `<b>${T.icon} ${T.name}</b><br>${T.desc}`; tip.style.display = 'block';
          tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; UI.terrainTip = true;
        } else if (UI.terrainTip) { tip.style.display = 'none'; UI.terrainTip = false; }
      } else if (UI.terrainTip) { tip.style.display = 'none'; UI.terrainTip = false; }
    }
    const d = UI.drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
      if (!G.canEdit()) { UI.drag = null; return; }
      d.moved = true;
      const u = G.find(d.id);
      if (!u) { UI.drag = null; return; }
      const a = D.ARCHETYPES[u.archetypeId], gh = $('drag-ghost');
      gh.textContent = a.symbol; gh.style.background = a.color + '55'; gh.style.display = 'flex';
      $('tooltip').style.display = 'none';
    }
    if (d.moved) {
      const gh = $('drag-ghost'); gh.style.left = e.clientX + 'px'; gh.style.top = e.clientY + 'px';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      document.querySelectorAll('.bench-slot.drop-hover').forEach(s => s.classList.remove('drop-hover'));
      const slot = el && el.closest('.bench-slot'); if (slot) slot.classList.add('drop-hover');
      $('shop-panel').classList.toggle('sell-zone', !!(el && el.closest('#shop-panel')));
    }
  }
  function onUp(e) {
    const d = UI.drag; if (!d) return;
    UI.drag = null;
    $('drag-ghost').style.display = 'none';
    document.querySelectorAll('.bench-slot.drop-hover').forEach(s => s.classList.remove('drop-hover'));
    $('shop-panel').classList.remove('sell-zone');
    if (!d.moved) { G.selectedId = d.id; UI.inspectEnemyId = null; UI.refresh(); return; }
    const t = R.tileAt(e.clientX, e.clientY);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (t.inside) { if (t.row >= C.PLAYER_ROW) G.placeAt(d.id, t.col, t.row); else UI.toast('Posicione apenas no seu lado do campo (linhas 6–11).', 'error'); }
    else if (el && el.closest('.bench-slot')) G.toBench(d.id, +el.closest('.bench-slot').dataset.slot);
    else if (el && el.closest('#shop-panel')) G.sell(d.id);
    G.selectedId = d.id; UI.refresh();
  }

  function onCanvasDown(e) {
    if (!G.run) return;
    const t = R.tileAt(e.clientX, e.clientY);
    const r = G.run;
    if (r.phase === 'COMBAT' && G.combat) {
      const hit = G.combat.units.find(u => !u.dead && u.rosterId && Math.hypot(u.x - t.px / R.tile, u.y - t.py / R.tile) < 0.45);
      if (hit) { G.selectedId = hit.rosterId; UI.inspectEnemyId = null; refreshInspector(); }
      return;
    }
    const unit = r.board.find(u => u.col === t.col && u.row === t.row);
    if (unit) { e.preventDefault(); startDrag(unit.id, true, e); return; }
    const enemy = r.enemies.find(x => x.col === t.col && x.row === t.row);
    if (enemy) { UI.inspectEnemyId = enemy.id; UI.refresh(); return; }
    if (G.selectedId && t.row >= C.PLAYER_ROW && G.canEdit()) G.placeAt(G.selectedId, t.col, t.row);
  }

  UI.init = function () {
    initTooltip();
    const canvas = $('battle-canvas');
    canvas.addEventListener('pointerdown', onCanvasDown);
    canvas.addEventListener('dblclick', (e) => {
      const t = R.tileAt(e.clientX, e.clientY);
      const u = G.run && G.run.board.find(x => x.col === t.col && x.row === t.row);
      if (u) G.toBench(u.id);
    });
    canvas.addEventListener('pointerleave', () => { R.hover = null; });
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', () => { UI.drag = null; $('drag-ghost').style.display = 'none'; });

    $('bench-grid').addEventListener('pointerdown', (e) => {
      const s = e.target.closest('.bench-slot'); if (!s) return;
      if (s.dataset.unit) { e.preventDefault(); startDrag(+s.dataset.unit, false, e); }
      else if (G.selectedId && G.onBoard(G.selectedId)) G.toBench(G.selectedId, +s.dataset.slot);
    });
    $('bench-grid').addEventListener('dblclick', (e) => { const s = e.target.closest('.bench-slot'); if (s && s.dataset.unit) G.toggle(+s.dataset.unit); });
    $('shop-grid').addEventListener('click', (e) => { const c = e.target.closest('[data-buy]'); if (c) G.buy(c.dataset.buy); });
    $('bag-grid').addEventListener('click', (e) => {
      const f = e.target.closest('[data-fuse]'); if (f) { e.stopPropagation(); G.fuse(+f.dataset.fuse); return; }
      const c = e.target.closest('[data-bag]'); if (c) G.equip(+c.dataset.bag, G.selectedId);
    });
    $('inspector').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-unequip]'); if (!b) return;
      const id = G.selectedId;
      if (b.dataset.unequip !== undefined) return G.unequip(id, +b.dataset.unequip);
      const act = b.dataset.act;
      if (act === 'evo') UI.openEvo(id);
      if (act === 'toggle') G.toggle(id);
      if (act === 'sell') G.sell(id);
      if (act === 'clear-enemy') { UI.inspectEnemyId = null; UI.refresh(); }
    });
    $('comp-controls').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !G.run) return;
      if (b.dataset.preset) G.setTeamLimit(+b.dataset.preset);
      if (b.dataset.limit) G.setTeamLimit(G.run.teamLimit + +b.dataset.limit);
    });
    $('btn-start').addEventListener('click', () => UI.primaryAction());
    $('overlay-map-btn').addEventListener('click', () => UI.showMap());
    $('btn-speed').addEventListener('click', () => UI.cycleSpeed());
    $('btn-arrange').addEventListener('click', () => G.autoArrange());
    $('btn-evo').addEventListener('click', () => UI.openEvo());
    $('btn-map').addEventListener('click', () => UI.showMap());
    $('btn-codex').addEventListener('click', () => UI.openCodex(null, null));
    $('btn-meta').addEventListener('click', () => UI.openMeta());
    $('btn-ach').addEventListener('click', () => UI.openAch(null));
    $('btn-settings').addEventListener('click', () => UI.openSettings());
    $('btn-menu').addEventListener('click', () => { if (G.run && G.run.phase === 'COMBAT') return UI.toast('Aguarde o fim do combate.', 'error'); showTitle(true); });
    $('modal-close').addEventListener('click', () => UI.closeModal());
    $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal') && UI.modalClosable) UI.closeModal(); });

    FE.Bus.on('changed', () => UI.refresh());
    FE.Bus.on('log', ({ t, type }) => UI.log(t, type));
    FE.Bus.on('clog', ({ t, type }) => UI.log(t, type));
    FE.Bus.on('toast', ({ t, type }) => UI.toast(t, type));
    FE.Bus.on('achievement', (a) => {
      UI.toast(`🏆 Conquista: ${a.icon} ${a.name} (+${a.reward} 🌌)`, 'ach');
      UI.log(`🏆 Conquista desbloqueada: ${a.name} — ${a.desc} (+${a.reward} Fragmentos)`, 'gold');
      FE.Audio.play('levelUp');
    });
    FE.Bus.on('openEvo', () => { if (FE.settings.autoEvo && !UI.modalKind) UI.openEvo(); });
  };

  UI.primaryAction = function () {
    const r = G.run; if (!r || UI.modalKind) return;
    if (r.phase === 'MAP') UI.showMap();
    else if (r.phase === 'PREP') G.startCombat();
  };
  UI.cycleSpeed = function () {
    const s = FE.settings;
    s.speed = s.speed === 1 ? 2 : s.speed === 2 ? 3 : 1;
    $('btn-speed').innerHTML = `⏩ ${s.speed}x <kbd>S</kbd>`;
    FE.applySettings();
  };
})(window);
