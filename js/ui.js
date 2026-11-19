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
  const UI = FE.UI = { drag: null, inspectEnemyId: null, synTab: 'el', modalKind: null, mapDismissed: false, lastPhase: null, codexTab: 'guia', evoUnitId: null, titleAsc: 0, titleScaling: 'dinamica', shopTab: 'rec', leftTab: 'syn' };
  const USER_MODALS = ['evo', 'codex', 'meta', 'settings', 'menu', 'ach', 'credits', 'give'];
  const ROMAN = ['', 'I', 'II', 'III'];

  /* ======================= UTILITÁRIOS ======================= */
  UI.toast = function (t, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`; el.textContent = t;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
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
  const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(Math.round(n));
  UI.fmt = fmt;
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
    $('hud-citadel').textContent = `${r.citadelHp}/${r.citadelMax}`;
    $('hud-citadel').parentElement.parentElement.classList.toggle('low', r.citadelHp / r.citadelMax < 0.35);
    refreshTrack();
    $('hud-citadel-bar').style.width = `${Math.round(r.citadelHp / r.citadelMax * 100)}%`;
    const me = G.me(), mine = G.boardOf(me.id).length, cap = G.capPerPlayer();
    $('hud-gold').textContent = `${me.gold}g`;
    $('hud-gold-label').textContent = G.isCoop() ? `Ouro • ${me.name}` : 'Ouro';
    const team = $('hud-team');
    $('hud-team-label').innerHTML = G.isCoop() ? `Em campo • <b style="color:${me.color}">${esc(me.name)}</b> (teto ${cap})` : 'Unidades em campo';
    team.textContent = `${mine} / ${me.teamLimit}`;
    team.className = mine > me.teamLimit ? 'crimson-text' : 'emerald-text';
    const edit = G.canEdit();
    document.querySelectorAll('#comp-controls button').forEach(b => {
      b.disabled = !edit || (b.dataset.preset && +b.dataset.preset > cap);
      if (b.dataset.preset) b.classList.toggle('active', +b.dataset.preset === me.teamLimit);
    });
    const pool = G.playerXpPool(), n = Math.max(1, mine);
    $('hud-xp').innerHTML = `${G.isCoop() ? 'Sua parte' : 'Pool'}: ${pool} XP ÷ ${n} = <span class="gold-text">${Math.floor(pool / n)} XP/unid</span>`;
    const pe = G.totalEvo(G.isCoop() ? me.id : undefined);
    $('cmd-summary').innerHTML = `<div ${tipAttr('Poder do seu elenco (melhores unidades até o limite), a mesma medida que a escala de poder usa.')}><span>Poder do elenco</span><b>⚔ ${fmt(G.rosterPower())}</b></div>
      <div><span>Sinergias ativas</span><b>✦ ${G.activeSynergies()}</b></div>
      <div><span>Tática</span><b>${D.TACTICS[r.tactic || 'equilibrio'].icon} ${D.TACTICS[r.tactic || 'equilibrio'].name}</b></div>
      <div><span>Juros na próxima vitória</span><b class="gold-text">+${Math.min(C.INTEREST_CAP, Math.floor(me.gold * C.INTEREST_RATE))}g</b></div>
      <div><span>PE para gastar</span><b class="${pe ? 'violet-text' : ''}">⭐ ${pe}</b></div>`;
    $('hud-strategy').textContent = n === 1 ? '👑 Hyper-Carry Solo (100% XP)' : n <= 3 ? '⚡ Trio de Elite (nível ultra-rápido)' : n <= 7 ? '⚖️ Composição Equilibrada' : '🌊 Exército Massivo (sinergias máximas)';
    const bar = $('hud-relics');
    bar.innerHTML = r.relics.length
      ? r.relics.map(id => `<div class="relic-badge" style="--rc:${D.RARITY[D.RELICS[id].rarity].color}" ${tipAttr(relicTip(id))}>${D.RELICS[id].icon}</div>`).join('')
      : '<span class="shelf-empty">Nenhuma ainda — vêm de Elites, Chefes e Mistérios.</span>';
    $('footer-note').innerHTML = `Forja Elemental v${FE.VERSION} • ${G.isCoop() ? `Co-op ${G.coop()} jogadores` : 'Solo'}${r.daily ? ' • 📅 Desafio Diário' : ''} • seed <b>${esc(r.seed)}</b>${r.ascension ? ` • Ascensão ${r.ascension}` : ''} • progresso salvo automaticamente neste navegador`;
    refreshPlayers();
  }

  /* ======================= JOGADORES (co-op) ======================= */
  function refreshPlayers() {
    const bar = $('players-bar'), r = G.run;
    if (!G.isCoop()) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    const prep = r.phase === 'PREP';
    bar.innerHTML = r.players.map(p => {
      const n = G.boardOf(p.id).length, pe = G.totalEvo(p.id);
      return `<button class="player-chip ${p.id === r.active ? 'active' : ''} ${p.ready ? 'ready' : ''}" data-player="${p.id}" style="--pc:${p.color}" ${tipAttr(`<b>${esc(p.name)}</b><br>🪙 ${p.gold}g • ${n}/${p.teamLimit} em campo • ${G.unitsOf(p.id).length} unidades • ${p.bag.length} itens na mochila<br>Tecla ${p.id + 1} para assumir o controle`)}>
        <span class="pc-dot"></span><span class="pc-name">${esc(p.name)}</span><span class="pc-gold">🪙${p.gold}</span><span class="pc-units">${n}/${p.teamLimit}</span>
        ${pe ? `<span class="pc-pe">+${pe}</span>` : ''}${prep ? `<span class="pc-ready">${p.ready ? '✔' : '…'}</span>` : ''}</button>`;
    }).join('') + `<span class="players-hint">${prep ? `Prontos: ${r.players.filter(p => p.ready).length}/${r.players.length}` : r.phase === 'MAP' ? `🧭 Guia do caminho: <b style="color:${G.leader().color}">${esc(G.leader().name)}</b>` : ''}</span>`;
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
    else if (G.isCoop()) { const me = G.me(), rc = r.players.filter(p => p.ready).length; start.innerHTML = me.ready ? `✖ Cancelar pronto (${esc(me.name)}) • ${rc}/${r.players.length}` : `✋ ${esc(me.name)} pronto! • ${rc}/${r.players.length} <kbd>Espaço</kbd>`; }
    else start.innerHTML = `⚔️ Iniciar ${r.roomType === 'chefe' ? 'Chefe' : r.roomType === 'elite' ? 'Elite' : 'Combate'} <kbd>Espaço</kbd>`;
    $('btn-pause').style.display = r.phase === 'COMBAT' ? 'inline-flex' : 'none';
    $('btn-pause').innerHTML = G.paused ? '▶️ Continuar <kbd>P</kbd>' : '⏸️ Pausar <kbd>P</kbd>';
    $('pause-overlay').classList.toggle('show', r.phase === 'COMBAT' && G.paused);
    $('btn-arrange').disabled = !G.canEdit();
    const evo = G.totalEvo(G.isCoop() ? r.active : undefined);
    const be = $('btn-evo');
    be.style.display = evo > 0 && G.canEdit() ? 'inline-flex' : 'none';
    $('evo-pts').textContent = evo;

    const ov = $('board-overlay');
    const showOv = r.phase === 'MAP' && UI.modalKind !== 'map';
    ov.classList.toggle('show', showOv);
    $('overlay-text').textContent = r.board.length ? 'Ajuste composição, itens e evoluções. Depois escolha o próximo caminho.' : 'Contrate recrutas no Quartel abaixo e depois escolha o primeiro caminho.';
    $('log-badge').textContent = r.room ? `S${r.room}` : '';
    refreshPowerPanel(); refreshRewardStrip(); refreshThreat(); refreshIntel(); refreshTactics();
  }

  /* ======================= TRILHA DA CAMPANHA ======================= */
  function refreshTrack() {
    const r = G.run, el = $('campaign-track');
    if (!r) { el.innerHTML = ''; return; }
    let h = '';
    for (let a = 1; a <= C.ACTS; a++) {
      const pips = [];
      for (let i = 1; i <= C.ROOMS_PER_ACT; i++) {
        const room = (a - 1) * C.ROOMS_PER_ACT + i;
        const st = room < r.room || (room === r.room && (r.phase === 'MAP' || r.phase === 'CHOICE') && !r.enemies.length && r.room > 0) ? 'done' : room === r.room ? 'cur' : '';
        const boss = i === C.ROOMS_PER_ACT;
        pips.push(`<i class="pip ${st} ${boss ? 'boss' : ''}" ${tipAttr(boss ? `<b>Sala ${room}</b> — ${D.BOSSES[a].symbol} ${D.BOSSES[a].name}` : `Sala ${room}`)}>${boss ? D.BOSSES[a].symbol : ''}</i>`);
      }
      h += `<div class="act-seg ${a === r.act ? 'cur' : a < r.act ? 'done' : ''}"><span class="act-lbl">${D.ACTS[a].short}</span><div class="pips">${pips.join('')}</div></div>`;
    }
    el.innerHTML = h;
  }

  /* ======================= INTELIGÊNCIA, DOUTRINA, OBJETIVO E TÁTICA ======================= */
  /* Briefing compacto: chips (doutrina • inteligência • objetivo) com detalhe expansível */
  UI.intelOpen = null;
  function refreshIntel() {
    const r = G.run, el = $('intel-panel');
    const live = r.phase === 'PREP' && r.enemies.length;
    if (!live) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const chips = [], det = {};
    if (r.roomType === 'chefe') {
      const b = D.BOSSES[r.act];
      chips.push({ k: 'doc', c: '#facc15', ic: FE.Art.svg(FE.Art.BOSS_KEYS[r.act], { acc: '#fde047' }), kick: 'Chefe', txt: b.name, sub: 'mecânica especial' });
      det.doc = `<b>${b.name}</b> — ${b.mechanic}`;
    } else if (r.doctrine) {
      const d = D.DOCTRINES[r.doctrine];
      chips.push({ k: 'doc', c: d.color, ic: `<span class="bf-emo">${d.icon}</span>`, kick: 'Doutrina', txt: d.name, sub: d.short });
      det.doc = `<b>${d.icon} ${d.name}.</b> ${d.desc}<br><span class="bf-good">Fraqueza:</span> ${d.weak}${d.counters.length ? `<span class="bf-arch">${d.counters.map(a => `<span ${tipAttr(archTip(D.ARCHETYPES[a]))}>${FE.Art.medal(a, { color: D.ARCHETYPES[a].color, cls: 'xs' })}</span>`).join('')}</span>` : ''}`;
    }
    const intel = r.intel;
    if (intel && intel.counters.length) {
      chips.push({ k: 'ctr', c: '#f87171', ic: '<span class="bf-emo">🧠</span>', kick: 'Inteligência', txt: intel.counters.map(c => D.COUNTERS[c.id].name).join(' + '), sub: intel.counters.map(c => D.COUNTERS[c.id].short).join(' • '), alert: true });
      det.ctr = intel.counters.map(c => { const d = D.COUNTERS[c.id]; return `<div class="bf-ctr"><b>${d.icon} ${d.name}</b> <span class="bf-why">— porque ${c.why}.</span> ${d.desc}<br><span class="bf-good">Resposta:</span> ${d.answer}</div>`; }).join('');
    } else {
      chips.push({ k: 'ctr', c: '#64748b', ic: '<span class="bf-emo">🧠</span>', kick: 'Inteligência', txt: r.act >= 2 ? 'Sem contramedidas' : 'Desperta no Ato II', sub: r.act >= 2 ? 'exército equilibrado' : 'eles ainda não estudam você', dim: true });
      det.ctr = r.act >= 2 ? 'Seu exército está equilibrado: a horda não achou um ponto fraco para explorar.' : 'A partir do Ato II, ao você entrar na sala, a horda analisa seu exército e prepara contramedidas contra o seu estilo.';
    }
    const o = r.objective;
    if (o) {
      chips.push({ k: 'obj', c: '#fbbf24', ic: `<span class="bf-emo">${D.OBJECTIVES[o.id].icon}</span>`, kick: 'Objetivo bônus', txt: G.objectiveText(o), sub: o.reward.text });
      det.obj = `<b>${D.OBJECTIVES[o.id].icon} ${D.OBJECTIVES[o.id].name}:</b> ${G.objectiveText(o)}. Recompensa extra se cumprir: <b class="gold-text">${o.reward.text}</b>. É opcional — vencer já paga a sala normalmente.`;
    }
    if (UI.intelOpen && !det[UI.intelOpen]) UI.intelOpen = null;
    el.innerHTML = `<div class="bf-chips">${chips.map(c => `<button class="bf-chip ${c.alert ? 'alert' : ''} ${c.dim ? 'dim' : ''} ${UI.intelOpen === c.k ? 'open' : ''}" data-intel="${c.k}" style="--bc:${c.c}">
        <span class="bf-ic">${c.ic}</span><span class="bf-txt"><span class="bf-kick">${c.kick}</span><b>${c.txt}</b><small>${c.sub}</small></span><span class="bf-car">${UI.intelOpen === c.k ? '▴' : '▾'}</span></button>`).join('')}</div>
      ${UI.intelOpen ? `<div class="bf-detail" style="--bc:${chips.find(c => c.k === UI.intelOpen).c}">${det[UI.intelOpen]}</div>` : ''}`;
  }
  function refreshTactics() {
    const r = G.run, el = $('tactic-bar');
    if (r.phase !== 'PREP') { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = `<span class="tb-lbl">Tática</span>` + Object.values(D.TACTICS).map(t => `<button class="tactic ${r.tactic === t.id ? 'active' : ''}" data-tactic="${t.id}" ${tipAttr(`<b>${t.icon} ${t.name}</b><br>${t.desc}`)}><span>${t.icon}</span><em>${t.name}</em></button>`).join('');
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
    $('syn-count').textContent = active.length;
    list.innerHTML =
      (active.length ? `<div class="syn-section"><span>Ativas</span></div>${active.map(e => card(e, false)).join('')}` : '') +
      (partial.length ? `<div class="syn-section"><span>Em progresso</span></div>${partial.map(e => card(e, true)).join('')}` : '') +
      (!active.length && !partial.length ? '<div class="syn-empty">Coloque unidades em campo: unidades da mesma <b>Classe</b> ou <b>Origem</b>, e stacks do mesmo <b>Elemento</b>, ativam sinergias.</div>' : '') +
      `<div class="syn-section"><span>Outras (${idle.length})</span><span>passe o mouse</span></div><div class="syn-idle">${idle.map(e => `<span class="syn-dot" style="--el-color:${e.color}" ${tipAttr(`<b>${e.icon} ${e.name}</b> (${e.kind})<br>${e.desc}${e.members ? '<br>' + e.members : ''}`)}>${e.icon}</span>`).join('')}</div>`;
  }

  /* ======================= PODER, AMEAÇA E RECOMPENSAS ======================= */
  const SCL = D.SCALING;
  /* Razão "justa" calibrada para o momento (sem Ascensão nem Ameaça) */
  function fairRatio() {
    const r = G.run, i = Math.min(3, r.act - 1);
    let t = (SCL.targets[r.roomType] || SCL.targets.combate)[i];
    t *= G.coopFactor();
    return t;
  }
  UI.difficulty = function () {
    const r = G.run;
    if (!r || !r.enemies.length || !r.board.length) return null;
    const pp = G.playerPower(), ep = G.enemyPower();
    const rel = (ep / Math.max(1, pp)) / fairRatio();
    const lv = rel < 0.6 ? ['Muito fácil', '#34d399'] : rel < 0.85 ? ['Fácil', '#86efac'] : rel < 1.2 ? ['Equilibrado', '#fbbf24'] : rel < 1.6 ? ['Difícil', '#fb923c'] : ['Mortal', '#ef4444'];
    return { pp, ep, rel, label: lv[0], color: lv[1] };
  };
  function refreshPowerPanel() {
    const el = $('power-panel'), r = G.run;
    const d = r.phase === 'PREP' ? UI.difficulty() : null;
    if (!d) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const share = Math.round(100 / (1 + d.rel));
    const mode = SCL.modes[r.scaling || 'classica'];
    el.innerHTML = `<span class="pp-num you">⚔ ${fmt(d.pp)}</span>
      <div class="pp-mid" ${tipAttr(`<b>Seu exército × Horda</b><br>Poder = √(vida efetiva × dano por segundo) de cada unidade; o do time cresce com o quadrado da soma.<br><br>Dificuldade estimada: <b style="color:${d.color}">${d.label}</b> (comparada ao esperado para esta sala).<br>Escala: ${mode.icon} <b>${mode.name}</b> — ${mode.desc}`)}>
        <div class="pp-bar"><div class="pp-you" style="width:${share}%"></div><div class="pp-foe" style="width:${100 - share}%"></div><i class="pp-tick" style="left:${share}%"></i></div></div>
      <span class="pp-num foe">${fmt(d.ep)} ☠</span><span class="pp-diff" style="--dc:${d.color}">${d.label}</span>`;
  }
  function refreshRewardStrip() {
    const el = $('reward-strip'), r = G.run;
    if (r.phase !== 'PREP' || !r.enemies.length) { el.style.display = 'none'; return; }
    const pv = G.previewRewards();
    el.style.display = 'flex';
    const each = G.isCoop() ? ' cada' : '';
    const item = r.roomType === 'combate' ? `${Math.round(pv.item.chance * 100)}% item` : r.roomType === 'elite' ? 'item ★1' : 'item ★2';
    const tip = `<b>🏆 Se vencer</b><br>🪙 +${pv.gold}g${each} (+${pv.interest}g de juros)<br>📘 +${pv.xpEach} XP por unidade em campo (+${pv.killXp} por abate)<br>🎁 ${r.roomType === 'combate' ? `${Math.round(pv.item.chance * 100)}% de chance de item ★1` : r.roomType === 'elite' ? 'item ★1 garantido' : `item ★2 para ${G.isCoop() ? 'cada jogador' : 'você'}`}${pv.relic ? `<br>🏺 escolha de relíquia${pv.relic === 'boss' ? ' (rara/lendária)' : ''}` : ''}${pv.act ? '<br>🌄 próximo Ato + ❤️ 25' : ''}${pv.mult > 1 ? `<br>🔥 +${Math.round((pv.mult - 1) * 100)}% pela Ameaça` : ''}<br><br><b>💥 Se perder</b><br>❤️ cerca de −${pv.defeat.citadel} de Cidadela • 📘 +${pv.defeat.xpEach} XP/unidade • tenta a sala de novo`;
    el.setAttribute('data-tip', tip);
    el.innerHTML = `<span class="rs-lbl win">Vitória</span><span>🪙 <b>+${pv.gold}g</b>${each}</span><span>📘 <b>${pv.xpEach}</b> XP/un.</span><span>🎁 ${item}</span>${pv.relic ? '<span class="rs-hl">🏺 relíquia</span>' : ''}${pv.mult > 1 ? `<span class="rs-hl">🔥 +${Math.round((pv.mult - 1) * 100)}%</span>` : ''}
      <span class="rs-sep"></span><span class="rs-lbl lose">Derrota</span><span>❤️ −${pv.defeat.citadel}</span>`;
  }
  function refreshThreat() {
    const el = $('threat-pill'), r = G.run;
    if (!r || r.scaling !== 'dinamica') { el.style.display = 'none'; return; }
    const t = r.threat || 0;
    el.style.display = 'flex';
    const pct = Math.round((t - SCL.threatMin) / (SCL.threatMax - SCL.threatMin) * 100);
    el.innerHTML = `<span class="label">🔥 Ameaça</span><span class="value" style="color:${t >= 6 ? '#f87171' : t >= 3 ? '#fb923c' : t < 0 ? '#38bdf8' : '#fde68a'}">${t > 0 ? '+' : ''}${t}</span><div class="threat-meter"><div style="width:${pct}%"></div></div>`;
    el.setAttribute('data-tip', `<b>Medidor de Ameaça</b> (escala Dinâmica)<br>Inimigos: <b>${t >= 0 ? '+' : ''}${Math.round(SCL.threatPer * t * 100)}%</b> de poder • Recompensas: <b>+${Math.round(SCL.rewardPer * Math.max(0, t) * 100)}%</b> de ouro e XP<br><br>Vitória dominante (sem baixas, &lt;14s): +2<br>Vitória confortável: +1<br>Vitória por pouco: −1 • Derrota: −2<br>Novo Ato: −1${t >= 6 ? '<br><br>⚠️ Ameaça 6+: elites ganham um afixo extra.' : ''}`);
  }

  /* ======================= BANCO ======================= */
  function refreshBench() {
    const me = G.me(), grid = $('bench-grid');
    $('bench-count').textContent = `${me.bench.filter(Boolean).length} / ${C.BENCH}`;
    $('bench-title').innerHTML = G.isCoop() ? `🪑 Banco de <b style="color:${me.color}">${esc(me.name)}</b> — arraste para o campo` : '🪑 Banco de Reservas — arraste para o campo (não divide XP)';
    grid.innerHTML = me.bench.map((u, i) => {
      if (!u) return `<div class="bench-slot" data-slot="${i}"></div>`;
      const a = D.ARCHETYPES[u.archetypeId];
      return `<div class="bench-slot occupied ${G.selectedId === u.id ? 'selected' : ''}" data-slot="${i}" data-unit="${u.id}" ${tipAttr(`<b>${a.symbol} ${esc(u.name)}</b> — Nv.${u.level}${u.trait ? `<br>${D.TRAITS[u.trait].icon} ${D.TRAITS[u.trait].name}: ${D.TRAITS[u.trait].desc}` : ''}<br>Arraste para o campo • duplo clique envia`)}>
        <span class="bench-lvl">Nv.${u.level}</span>${u.evoPoints > 0 ? '<span class="bench-evo-dot">+</span>' : ''}
        ${FE.Art.medal(u.archetypeId, { color: a.color, quality: u.quality || 0, cls: 'bench-medal' })}${u.trait ? `<span class="bench-trait">${D.TRAITS[u.trait].icon}</span>` : ''}</div>`;
    }).join('');
  }

  /* ======================= QUARTEL ======================= */
  const QT = D.QUARTEL;
  const MAXS = (() => { const m = { hp: 0, ad: 0, ap: 0, range: 0 }; for (const a of Object.values(D.ARCHETYPES)) { m.hp = Math.max(m.hp, a.stats.maxHp); m.ad = Math.max(m.ad, a.stats.ad * a.stats.attackSpeed); m.ap = Math.max(m.ap, a.stats.ap); m.range = Math.max(m.range, a.stats.range); } return m; })();
  function statBars(a) {
    const b = (lbl, v, max, cls) => `<div class="sb"><span>${lbl}</span><div class="sb-track"><div class="sb-fill ${cls}" style="width:${Math.max(6, Math.round(v / max * 100))}%"></div></div></div>`;
    return `<div class="rq-stats">${b('❤', a.stats.maxHp, MAXS.hp, 'hp')}${b('⚔', a.stats.ad * a.stats.attackSpeed, MAXS.ad, 'ad')}${b('✦', a.stats.ap, MAXS.ap, 'ap')}${b('➶', a.stats.range, MAXS.range, 'rg')}</div>`;
  }
  function synergyGain(a) {
    const oc = G.orderCounts();
    return a.orders.map(id => D.ORDERS[id]).filter(o => o.thresholds.includes(oc[o.id] + 1));
  }
  function refreshShop() {
    const me = G.me(), edit = G.canEdit();
    document.querySelectorAll('#shop-tabs [data-shop]').forEach(b => b.classList.toggle('active', b.dataset.shop === UI.shopTab));
    $('reroll-cost').textContent = `${G.rerollCost(me.id)}g`;
    $('btn-reroll').disabled = !edit || me.gold < G.rerollCost(me.id) || UI.shopTab !== 'rec';
    $('btn-reroll').style.visibility = UI.shopTab === 'rec' ? 'visible' : 'hidden';
    $('quartel-hint').textContent = UI.shopTab === 'rec'
      ? (G.isCoop() ? `Recrutas de ${me.name} • novos a cada sala • 🔒 trava para a próxima • arraste uma unidade aqui para vender` : 'Novos recrutas a cada sala • 🔒 trava uma carta para a próxima • arraste uma unidade aqui para vender')
      : `Contrate qualquer arquétipo, sem traço, por ${Math.round((QT.contractMult - 1) * 100)}% a mais`;
    const grid = $('shop-grid');
    grid.className = 'shop-grid ' + (UI.shopTab === 'rec' ? 'quartel' : 'contracts');
    if (UI.shopTab === 'con') {
      grid.innerHTML = Object.values(D.ARCHETYPES).map(a => {
        const cost = G.contractCost(a.id), ok = me.gold >= cost && edit, gain = synergyGain(a);
        return `<div class="con-card ${ok ? '' : 'unaffordable'}" data-buy="${a.id}" style="--ac:${a.color}" ${tipAttr(archTip(a) + (gain.length ? `<br><br><b style="color:#facc15">Ativa:</b> ${gain.map(o => `${o.icon} ${o.name}`).join(', ')}` : ''))}>
          ${gain.length ? '<span class="next-tier">▲</span>' : ''}${FE.Art.medal(a.id, { color: a.color, cls: 'sm' })}<span class="con-name">${a.name}</span><span class="con-role">${a.role}</span><span class="con-cost">🪙 ${cost}</span></div>`;
      }).join('');
      return;
    }
    const oc0 = G.orderCounts();
    const tierOf = (a) => Math.max(0, ...a.orders.map(id => D.ORDERS[id].thresholds.indexOf(oc0[id] + 1) + 1));
    const quals = me.offers.filter(Boolean).map(o => tierOf(D.ARCHETYPES[o.arch]));
    const minTier = quals.filter(t => t > 0).length > 2 ? 2 : 1;
    grid.innerHTML = me.offers.map((o, i) => {
      if (!o) return `<div class="rq-card empty"><span>✔</span>Contratado<small>Volta na próxima sala</small></div>`;
      const a = D.ARCHETYPES[o.arch], q = QT.quality[o.quality], t = o.trait ? D.TRAITS[o.trait] : null;
      const ok = me.gold >= o.cost && edit, gain = tierOf(a) >= minTier ? synergyGain(a) : [];
      const traitTxt = t ? `${t.icon} ${t.name}${o.el ? `: ${D.ELEMENTS[o.el].icon} ${D.ELEMENTS[o.el].name}` : ''}` : '';
      const tip = `${archTip(a)}${t ? `<br><br><b>${t.icon} Traço — ${t.name}${t.rare ? ' (raro)' : ''}:</b> ${t.desc}${o.el ? ` (${D.ELEMENTS[o.el].name})` : ''}` : ''}${o.quality ? `<br><b style="color:${q.color}">${q.name}:</b> chega no Nível ${q.level} com ${q.level - 1} PE para gastar.` : ''}${gain.length ? `<br><br><b style="color:#facc15">Colocar em campo ativa:</b> ${gain.map(g => `${g.icon} ${g.name} (${G.orderCounts()[g.id] + 1})`).join(', ')}` : ''}`;
      return `<div class="rq-card q${o.quality} ${ok ? '' : 'unaffordable'} ${o.locked ? 'locked' : ''}" data-hire="${i}" style="--ac:${a.color};--qc:${q.color}" ${tipAttr(tip)}>
        <div class="rq-top"><span class="rq-quality">${q.name}</span><button class="rq-lock" data-lock="${i}" title="${o.locked ? 'Destravar' : 'Travar para a próxima sala'}">${o.locked ? '🔒' : '🔓'}</button></div>
        <div class="rq-art">${FE.Art.medal(o.arch, { color: a.color, quality: o.quality, cls: 'lg' })}${q.level > 1 ? `<span class="rq-lvl">Nv.${q.level}</span>` : ''}${gain.length ? '<span class="rq-up" title="Completa uma sinergia">▲</span>' : ''}</div>
        <div class="rq-name">${a.name}</div><div class="rq-role">${a.role} · ${a.orders.map(id => `<span style="color:${D.ORDERS[id].color}" title="${D.ORDERS[id].name}">${D.ORDERS[id].icon}</span>`).join(' ')}</div>
        ${statBars(a)}
        <div class="rq-trait ${t ? (t.rare ? 'rare' : '') : 'none'}">${t ? traitTxt : 'Sem traço'}</div>
        <div class="rq-buy"><span>🪙 ${o.cost}g</span><em>Contratar</em></div></div>`;
    }).join('');
  }

  /* ======================= INSPETOR & MOCHILA ======================= */
  function refreshBag() {
    const bag = G.bag(), me = G.me();
    $('bag-count').textContent = bag.length;
    $('bag-title').innerHTML = G.isCoop() ? `🎒 Mochila de <span style="color:${me.color}">${esc(me.name)}</span>` : '🎒 Mochila';
    $('give-gold').style.display = G.isCoop() && G.canEdit() ? 'inline-flex' : 'none';
    const grid = $('bag-grid');
    if (!bag.length) { grid.innerHTML = '<span style="font-size:11px;color:var(--text-muted);">Nenhum item solto.</span>'; return; }
    grid.innerHTML = bag.map((it, i) => {
      const def = D.ITEMS[it.id];
      const canFuse = G.fusePartner(i) !== -1 && G.canEdit();
      return `<div class="bag-item-chip t${it.tier}" data-bag="${i}" ${tipAttr(itemTip(it) + '<br><i>Clique para equipar na unidade selecionada</i>')}>${def.icon} ${def.name} <span class="tier-stars">${stars(it.tier)}</span>${canFuse ? `<button class="fuse-btn" data-fuse="${i}" title="Fundir 2 iguais">⚒</button>` : ''}${G.isCoop() && G.canEdit() ? `<button class="fuse-btn give" data-give="${i}" title="Doar a outro jogador">🎁</button>` : ''}</div>`;
    }).join('');
  }

  function statCells(s) {
    const c = (l, v, cls = '') => `<div class="stat-cell"><span>${l}</span><span class="${cls}">${v}</span></div>`;
    const extra = [
      s.critChance ? c('💥 Crítico', `${Math.round(s.critChance * 100)}% ×${s.critDmg}`, 'gold-text') : '',
      s.dodge ? c('🌪️ Esquiva', `${Math.round(s.dodge * 100)}%`, 'sky-text') : '',
      s.lifesteal ? c('🩸 Vampirismo', `${Math.round(s.lifesteal * 100)}%`) : '',
      s.initialShield ? c('🔰 Escudo', s.initialShield) : '',
      s.trueDmgBonus ? c('☀️ Dano Verd.', `${Math.round(s.trueDmgBonus * 100)}%`) : '',
      s.magicReduce ? c('🔰 Resist. mágica', `${Math.round(s.magicReduce * 100)}%`) : ''
    ].join('');
    return `<div class="stats-grid">${c('❤️ Vida', s.maxHp, 'emerald-text')}${c('🛡️ Armadura', s.armor)}${c('⚔️ Ataque', s.ad)}${c('🔮 Magia', s.ap, 'violet-text')}${c('⚡ Vel. Atq', `${s.attackSpeed}/s`)}${c('🎯 Alcance', s.range)}${c('💧 Mana', `${s.startMana}/${s.maxMana}`)}${extra}</div>`;
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
    const owner = G.ownerOf(u), mine = G.isMine(u);
    sub.innerHTML = `${a.role} • ${onBoard ? 'Em Campo' : 'No Banco'}${G.isCoop() ? ` • <span style="color:${owner.color}">${esc(owner.name)}</span>` : ''}`;
    const s = R.statsCache.get(u.id) || G.statsOf(u);
    const next = G.xpToNext(u.level), pct = Math.min(100, Math.round(u.xp / next * 100));
    const edit = G.canEdit() && mine;
    let equip = '';
    for (let i = 0; i < C.MAX_ITEMS; i++) {
      const it = u.items[i];
      equip += it ? `<div class="equip-slot filled" data-unequip="${i}" ${tipAttr(itemTip(it) + '<br><i>Clique para remover</i>')}><span style="font-size:15px;">${D.ITEMS[it.id].icon}</span><span style="font-weight:800;color:var(--gold-light);font-size:9.5px;">${D.ITEMS[it.id].name}</span><span class="tier-stars">${stars(it.tier)}</span></div>`
        : `<div class="equip-slot"><span style="color:var(--text-muted);">+ Slot ${i + 1}</span></div>`;
    }
    const locked = a.skills.filter(sk => !u.skills[sk]).length;
    box.innerHTML = `
      <div class="unit-header-card">
        <div class="insp-hero">${FE.Art.medal(u.archetypeId, { color: a.color, quality: u.quality || 0, cls: 'xl' })}
          <div class="insp-id"><h3>${esc(u.name)} ${mine ? '<button class="rename-btn" data-act="rename" title="Renomear">✏️</button>' : ''}</h3><span class="insp-role">${a.role} · Nível ${u.level}</span></div></div>
        ${!mine ? `<div class="info-box" style="padding:6px 8px;font-size:11px;border-color:${owner.color}">🔒 Unidade de <b style="color:${owner.color}">${esc(owner.name)}</b>. Pressione ${owner.id + 1} para jogar como ${esc(owner.name)}.</div>` : ''}
        ${u.trait || u.quality ? `<div class="trait-line">${u.quality ? `<span class="q-badge q${u.quality}">${QT.quality[u.quality].name}</span>` : ''}${u.trait ? `<span class="el-chip trait-chip" ${tipAttr(D.TRAITS[u.trait].desc)}>${D.TRAITS[u.trait].icon} ${D.TRAITS[u.trait].name} — ${D.TRAITS[u.trait].desc}</span>` : ''}</div>` : ''}
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
        <div class="insp-hero">${FE.Art.medal(e.isBoss ? FE.Art.BOSS_KEYS[G.run.act] : e.archetypeId, { color: e.color, enemy: true, boss: e.isBoss, cls: 'xl' })}
          <div class="insp-id"><h3>${esc(e.name)}</h3><span class="insp-role">${e.isBoss ? 'Chefe' : e.isElite ? 'Elite' : 'Inimigo'} · Nível ${e.level}</span></div></div>
        <div style="font-size:11px;color:var(--text-secondary);">Arquétipo base: ${arch.symbol} ${arch.name} (${arch.role})</div>
        ${e.ambush ? '<span class="el-chip" style="color:#fb7185">🦅 Salta para a sua retaguarda no início</span>' : ''}
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
    if (r.phase === 'CHOICE') {
      const p = G.currentPending();
      const c = G.combat;
      if (p && p.kind === 'report' && c && c.overAt && Date.now() - c.overAt < 1500 && UI.modalKind !== 'pending') {
        showBanner(p);
        clearTimeout(UI.reportT); UI.reportT = setTimeout(() => UI.syncModal(), 1500 - (Date.now() - c.overAt));
        return;
      }
      showPending(); return;
    }
    if (r.phase === 'MAP') {
      if (UI.modalKind === 'pending' || UI.modalKind === 'end') { $('modal').classList.remove('open'); UI.modalKind = null; }
      if (UI.modalKind === 'map') { showMap(); return; }
      if (!UI.mapDismissed && !UI.modalKind) showMap();
      return;
    }
    if (UI.modalKind === 'map' || UI.modalKind === 'pending' || UI.modalKind === 'end' || UI.modalKind === 'title') { $('modal').classList.remove('open'); UI.modalKind = null; }
  };

  /* ---------- Tela de título ---------- */
  UI.titleMode = 1; UI.titleNames = ['', '', '', ''];
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  function showTitle(fromMenu = false) {
    const m = G.meta, rec = m.records, A = FE.Achievements;
    const save = !G.run ? G.savedSummary() : null;
    UI.titleAsc = Math.min(UI.titleAsc, m.maxAscension);
    const ascBtns = D.ASCENSIONS.map(a => `<button class="asc-btn ${UI.titleAsc === a.level ? 'active' : ''}" data-asc="${a.level}" ${a.level > m.maxAscension ? 'disabled' : ''} ${tipAttr(`<b>${a.name}</b><br>${a.desc}${a.level > m.maxAscension ? '<br><i>Vença uma expedição no nível anterior para desbloquear.</i>' : ''}`)}>${a.level === 0 ? 'Padrão' : 'A' + a.level}</button>`).join('');
    const modes = [[1, '🧙 Solo', 'Até 16 unidades, você decide tudo.'], [2, '👥 2 jogadores', 'Até 6 unidades cada.'], [3, '👥 3 jogadores', 'Até 4 unidades cada.'], [4, '👥 4 jogadores', 'Até 3 unidades cada.']];
    const modeBtns = modes.map(([n, l, d]) => `<button class="asc-btn mode-btn ${UI.titleMode === n ? 'active' : ''}" data-mode="${n}" ${tipAttr(`<b>${l}</b><br>${d}`)}>${l}</button>`).join('');
    const names = UI.titleMode > 1 ? `<div class="names-grid">${Array.from({ length: UI.titleMode }, (_, i) => `<input class="input name-input" data-name="${i}" maxlength="14" placeholder="Jogador ${i + 1}" value="${esc(UI.titleNames[i] || '')}" style="border-color:${G.PLAYER_COLORS[i]}" />`).join('')}</div>` : '';
    const dk = todayKey(), daily = m.daily[dk];
    const nt = A.nextTitle();
    const body = openModal('title', {
      title: `⚔ Forja Elemental ${FE.VERSION.slice(0, 3)}`, sub: `Auto-battler tático roguelike • ${C.TOTAL_ROOMS} salas • ${C.ACTS} Atos • solo ou co-op local`, closable: !!(fromMenu && G.run), size: 'narrow',
      body: `<div class="title-hero"><div class="logo" id="title-logo">FORJA ELEMENTAL</div><div class="tag">Monte sua composição, divida a experiência e forje elementos até o coração da Forja.</div>
          <div class="rank-tag">🏅 ${A.title()}${nt ? ` <span class="muted">— próximo título com ${nt.at} conquistas</span>` : ''}</div></div>
        ${G.migratedNotice ? '<div class="info-box" style="margin-bottom:12px;border-color:var(--emerald)">✅ Seus Fragmentos Astrais e melhorias da versão anterior foram importados.</div>' : ''}
        <div class="records" style="margin-bottom:14px;grid-template-columns:repeat(5,1fr);">
          <div class="record"><b>${rec.runs}</b><span>Expedições</span></div><div class="record"><b>${rec.wins}</b><span>Vitórias</span></div><div class="record"><b>${A.count()}/${A.list.length}</b><span>Conquistas</span></div>
          <div class="record"><b>${rec.bestRoom}/${C.TOTAL_ROOMS}</b><span>Melhor sala</span></div><div class="record"><b>${rec.coopWins}</b><span>Vitórias co-op</span></div>
        </div>
        ${fromMenu && G.run ? `<div class="info-box" style="margin-bottom:12px;">Expedição em andamento: Ato ${G.run.act}, Sala ${G.run.room}/${C.TOTAL_ROOMS} (seed ${esc(G.run.seed)}). Iniciar outra abandona a atual.</div>` : ''}
        ${save ? `<div class="info-box" style="margin-bottom:12px;border-color:var(--violet)">📂 Expedição salva: ${save.players.length > 1 ? `co-op com ${save.players.map(p => esc(p.name)).join(', ')}` : 'solo'} — Ato ${save.act}, Sala ${save.room}/${C.TOTAL_ROOMS}, Cidadela ${save.citadelHp}/${save.citadelMax}.</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div class="form-row"><label>Modo de jogo</label><div class="asc-list">${modeBtns}</div>
            <span class="muted" style="font-size:11.5px;">${UI.titleMode > 1 ? `Co-op local: os jogadores se revezam no mesmo aparelho (teclas 1–${UI.titleMode} ou os botões acima do tabuleiro). ${C.COOP_TOTAL_UNITS} unidades no total, ${C.COOP_TOTAL_UNITS / UI.titleMode} por jogador; cada um tem ouro, banco e mochila próprios. Inimigos ficam mais numerosos e fortes.` : 'Você controla toda a expedição.'}</span>${names}</div>
          <div class="form-row"><label>Ascensão (dificuldade)</label><div class="asc-list" id="asc-list">${ascBtns}</div><span class="muted" style="font-size:11.5px;" id="asc-desc">${D.ASCENSIONS[UI.titleAsc].desc}</span></div>
          <div class="form-row"><label>Escala de poder dos inimigos</label><div class="scale-list">${Object.entries(D.SCALING.modes).map(([k, md]) => `<button class="scale-btn ${UI.titleScaling === k ? 'active' : ''}" data-scaling="${k}"><b>${md.icon} ${md.name}${md.recommended ? ' <span class="rec">recomendado</span>' : ''}</b><span>${md.desc}</span></button>`).join('')}</div></div>
          <div class="form-row"><label>Seed (opcional — mesma seed, mesmo mapa e hordas)</label><input class="input" id="seed-input" maxlength="24" placeholder="Deixe vazio para aleatória" /></div>
          <div class="info-box daily-box"><div><b>📅 Desafio Diário</b> — mesma seed para todos hoje, Ascensão I, modo solo.<br><span class="muted">${daily ? `Seu melhor hoje: Sala ${daily.room}/${C.TOTAL_ROOMS}${daily.win ? ' • 👑 vencido!' : ''} (${daily.tries} tentativa${daily.tries > 1 ? 's' : ''})` : 'Você ainda não jogou o desafio de hoje.'}</span></div>
            <button class="btn btn-secondary" data-act="daily">Jogar desafio</button></div>
        </div>`,
      footer: `<div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" data-act="open-meta">🌌 Santuário (${m.astralShards})</button>
          <button class="btn btn-secondary" data-act="open-codex">📖 Como Jogar</button>
          <button class="btn btn-secondary" data-act="open-ach">🏆 Conquistas</button></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${save ? '<button class="btn btn-evo btn-lg" data-act="continue">📂 Continuar</button>' : ''}
          ${fromMenu && G.run ? '<button class="btn btn-secondary btn-lg" data-act="close">↩ Voltar</button>' : ''}
          <button class="btn btn-primary btn-lg" data-act="new-run">⚔️ Nova Expedição</button></div>`
    });
    body.querySelectorAll('[data-asc]').forEach(b => b.addEventListener('click', () => { UI.titleAsc = +b.dataset.asc; showTitle(fromMenu); }));
    body.querySelectorAll('[data-scaling]').forEach(b => b.addEventListener('click', () => { UI.titleScaling = b.dataset.scaling; showTitle(fromMenu); }));
    body.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { UI.titleMode = +b.dataset.mode; showTitle(fromMenu); }));
    body.querySelectorAll('[data-name]').forEach(i => i.addEventListener('input', () => { UI.titleNames[+i.dataset.name] = i.value; }));
    $('title-logo').addEventListener('click', () => UI.anvilClick());
    const f = $('modal-footer');
    const start = (opts) => {
      if (fromMenu && G.run && !UI.confirmAbandon) { UI.confirmAbandon = true; UI.toast('Clique de novo para confirmar o abandono da expedição atual.', 'error'); return; }
      UI.confirmAbandon = false;
      $('combat-log').innerHTML = ''; UI.prevTiers = {}; UI.prevTiersReady = false;
      G.newRun(opts);
      UI.mapDismissed = false; UI.inspectEnemyId = null; G.selectedId = null;
      $('modal').classList.remove('open'); UI.modalKind = null; UI.refresh();
    };
    f.querySelector('[data-act="new-run"]').addEventListener('click', () => start({ seed: $('seed-input').value, ascension: UI.titleAsc, players: UI.titleMode, names: UI.titleNames, scaling: UI.titleScaling }));
    body.querySelector('[data-act="daily"]').addEventListener('click', () => start({ seed: 'DIA-' + dk, players: 1, daily: { date: dk, ascension: 1 }, scaling: 'dinamica' }));
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
    const RPA = C.ROOMS_PER_ACT;
    const W = 860, H = 390, fx = (f) => 60 + (f - 1) * ((W - 120) / (RPA - 1));
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
      let rwTxt = t.reward;
      if (['combate', 'elite', 'chefe'].includes(n.type) && r.phase === 'MAP') { const pv = G.previewRewards(n.type, n.room); rwTxt = `🪙 ~${pv.gold}g${G.isCoop() ? ' cada' : ''} • 📘 ~${pv.pool} XP${G.isCoop() ? ' (sua parte)' : ''} a dividir • ${n.type === 'combate' ? '🎁 30% item' : n.type === 'elite' ? '🎁 item + 🏺 relíquia' : '🎁 item ★2 + 🏺 relíquia + 🌄 Ato'}`; }
      const tip = `<b>${t.icon} ${t.name}</b> — Sala ${n.room}<br>${t.desc}<br><span style="color:#fde68a">Recompensa: ${rwTxt}</span>${(n.type === 'combate' || n.type === 'elite') ? `<br>Arena: ${D.ARENA[n.affix].icon} ${D.ARENA[n.affix].name} (${D.ARENA[n.affix].desc})` : ''}${n.layout ? `<br>Terreno: ${D.LAYOUTS[n.layout].icon} <b>${D.LAYOUTS[n.layout].name}</b> — ${D.LAYOUTS[n.layout].desc}` : ''}${n.type === 'chefe' ? `<br><br><b>${D.BOSSES[n.act].name}</b>: ${D.BOSSES[n.act].mechanic}` : ''}`;
      nodes += `<g class="map-node ${isAv ? 'reachable' : ''}" data-node="${n.id}" ${tipAttr(tip)} opacity="${!isAv && !isVis && !isCur ? 0.55 : 1}">
        ${isAv ? `<circle class="ring" cx="${p.x}" cy="${p.y}" r="${rad + 6}" fill="none" stroke="${t.color}"/>` : ''}
        <circle class="body" cx="${p.x}" cy="${p.y}" r="${rad}" fill="${isVis ? '#2a2f45' : '#18233c'}" stroke="${isCur ? '#fbbf24' : t.color}" stroke-width="${isCur ? 4 : 2}"/>
        <text x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="middle" font-size="${n.type === 'chefe' ? 26 : 20}">${isVis && !isCur ? '✔️' : t.icon}</text>
        <text x="${p.x}" y="${p.y + rad + 15}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#94a3b8">${t.name}${n.layout ? ' ' + D.LAYOUTS[n.layout].icon : ''}</text></g>`;
    }));
    const floorsLbl = Array.from({ length: RPA }, (_, i) => i + 1).map(f => `<text x="${fx(f)}" y="18" text-anchor="middle" font-size="11" font-weight="800" fill="#64748b">SALA ${(r.act - 1) * RPA + f}</text>`).join('');
    const boss = D.BOSSES[r.act];
    const actsBar = Array.from({ length: C.ACTS }, (_, i) => i + 1).map(a => `<span class="act-pill ${a === r.act ? 'cur' : a < r.act ? 'done' : ''}">${D.ACTS[a].storyIcon} ${D.ACTS[a].short}</span>`).join('<span class="act-sep">›</span>');
    const body = openModal('map', {
      title: `🗺️ ${D.ACTS[r.act].short} — ${D.ACTS[r.act].name}`,
      sub: r.phase === 'MAP' ? `${G.isCoop() ? `🧭 <b style="color:${G.leader().color}">${esc(G.leader().name)}</b> guia este trecho (combinem juntos!). ` : ''}Escolha um nó pulsante. Passe o mouse para ver detalhes.` : 'Visualização do caminho deste Ato.',
      size: 'wide',
      body: `<div class="acts-bar">${actsBar}</div><div class="map-wrap"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">${floorsLbl}${edges}${nodes}</svg></div>
        <div class="map-info">
          <div class="info-box"><h4>👑 Guardião do Ato</h4><b>${boss.symbol} ${boss.name}</b><br>${boss.mechanic}</div>
          <div class="info-box"><h4>O que cada sala dá</h4><div class="legend-rewards">${Object.values(D.NODE_TYPES).map(t => `<div><b>${t.icon} ${t.name}</b><span>${t.reward}</span></div>`).join('')}</div></div>
        </div>`,
      footer: `<span>Cidadela ❤️ ${r.citadelHp}/${r.citadelMax} • ${G.isCoop() ? r.players.map(p => `<span style="color:${p.color}">${esc(p.name)} ${p.gold}g</span>`).join(' • ') : `Ouro ${G.me().gold}g`}</span><button class="btn btn-secondary" data-act="close">👀 Ver tabuleiro (preparar)</button>`
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
  function playerTabs() {
    return `<div class="buyer-tabs">${G.run.players.map(p => `<button class="player-chip ${p.id === G.run.active ? 'active' : ''}" data-buyer="${p.id}" style="--pc:${p.color}"><span class="pc-dot"></span><span class="pc-name">${esc(p.name)}</span><span class="pc-gold">🪙${p.gold}</span></button>`).join('')}</div>`;
  }
  function showPending() {
    const p = G.currentPending();
    if (!p) return;
    if (p.kind === 'report') return showReport(p);
    if (p.kind === 'story') return showStory(p);
    const isShop = p.kind === 'shop';
    const list = isShop ? p.offers : p.options;
    const chooser = isShop ? G.me() : G.pendingChooser();
    const cards = list.map((o, i) => {
      const afford = G.optionAffordable(o, chooser);
      const rc = o.rarity ? D.RARITY[o.rarity].color : '';
      const cls = o.sold ? 'sold' : (!afford ? 'disabled' : '');
      return `<div class="rl-card ${cls}" data-opt="${i}" style="${rc ? `--rc:${rc}` : ''}">
        <div class="ic">${o.icon}</div><h3>${o.title}</h3><p>${o.desc}</p>
        ${isShop ? `<span class="rl-price">${o.sold ? `Vendido${o.buyer && G.isCoop() ? ' a ' + esc(o.buyer) : ''}` : `🪙 ${o.price}g`}</span>` : `<span class="rl-tag" ${rc ? `style="color:${rc};border-color:${rc}"` : ''}>${o.tag || 'Escolher'}</span>`}</div>`;
    }).join('');
    const who = G.isCoop() && !isShop ? `<div class="chooser-banner" style="--pc:${chooser.color}">🎯 Decisão de <b>${esc(chooser.name)}</b> <span class="muted">(${p.secret ? 'um encontro raro!' : 'as escolhas se revezam entre os jogadores'})</span></div>` : '';
    const body = openModal('pending', {
      title: p.title, sub: p.subtitle || '', closable: false,
      body: `${isShop && G.isCoop() ? `<div class="muted" style="font-size:12px;margin-bottom:6px;">Quem está comprando:</div>${playerTabs()}` : ''}${who}<div class="cards-grid">${cards}</div>`,
      footer: `<span>🪙 ${G.isCoop() ? `${esc(chooser.name)}: ` : 'Ouro: '}<b class="gold-text">${chooser.gold}g</b> • ❤️ Cidadela ${G.run.citadelHp}/${G.run.citadelMax}</span>
        ${isShop ? '<button class="btn btn-primary" data-act="skip">Seguir viagem →</button>' : p.allowSkip ? '<button class="btn btn-secondary" data-act="skip">Pular (sem recompensa)</button>' : ''}`
    });
    body.querySelectorAll('[data-opt]').forEach(c => c.addEventListener('click', () => { $('tooltip').style.display = 'none'; G.resolveOption(+c.dataset.opt); }));
    body.querySelectorAll('[data-buyer]').forEach(b => b.addEventListener('click', () => { G.setActive(+b.dataset.buyer); }));
    const sk = $('modal-footer').querySelector('[data-act="skip"]');
    if (sk) sk.addEventListener('click', () => G.skipPending());
  }

  function showBanner(p) {
    const b = $('combat-banner');
    if (b.dataset.shown === String(G.combat.overAt)) return;
    b.dataset.shown = String(G.combat.overAt);
    b.className = 'combat-banner show ' + (p.won ? 'win' : 'lose');
    b.innerHTML = p.won ? `<span>${G.run.roomType === 'chefe' || p.final ? '👑' : '🏆'}</span>${p.final ? 'A FORJA FOI SALVA' : p.title.replace(/^\S+\s/, '').toUpperCase()}` : '<span>💥</span>DERROTA';
    setTimeout(() => { b.className = 'combat-banner'; }, 1450);
  }

  function showStory(p) {
    openModal('pending', {
      title: p.title, closable: false, size: 'narrow',
      body: `<div class="story"><div class="story-icon">${p.icon}</div>${p.paragraphs.map(t => `<p>${t}</p>`).join('')}</div>`,
      footer: `<span>${p.tutorial ? 'Você pode rever tudo em 📖 Códice.' : ''}</span><button class="btn btn-primary btn-lg" data-act="next">${p.button || 'Continuar'} →</button>`
    });
    $('modal-footer').querySelector('[data-act="next"]').addEventListener('click', () => G.skipPending());
  }

  function showReport(p) {
    const rep = p.report || [];
    const coop = G.isCoop();
    const rw = p.rewards || null;
    const P = (pid) => G.P(pid);
    const pname = (pid) => coop ? `<b style="color:${P(pid).color}">${esc(P(pid).name)}</b> ` : '';
    let cards = '';
    if (rw) {
      if (rw.won) {
        cards += `<div class="rcard gold"><div class="rc-ic">🪙</div><div class="rc-body"><h4>Ouro</h4>${rw.gold.map(g => `<div class="rc-line">${pname(g.pid)}<b class="big">+${g.total}g</b> <small>${g.base} recompensa + ${g.interest} juros${g.trans ? ` + ${g.trans} Transmutação` : ''}</small><span class="rc-now">agora: ${g.now}g</span></div>`).join('')}
          ${rw.mult > 1 ? `<div class="rc-note">🔥 inclui +${Math.round((rw.mult - 1) * 100)}% pela Ameaça</div>` : ''}<div class="rc-note">Juros: 10% do ouro guardado (máx. ${C.INTEREST_CAP}g).</div></div></div>`;
      }
      if (rw.won) {
        cards += `<div class="rcard items"><div class="rc-ic">🎁</div><div class="rc-body"><h4>Itens</h4>${rw.items.length ? rw.items.map(it => `<div class="rc-line">${pname(it.pid)}<span class="item-pill t${it.item.tier}">${D.ITEMS[it.item.id].icon} ${D.ITEMS[it.item.id].name} ${'★'.repeat(it.item.tier)}</span><small>${it.label} • foi para a mochila</small></div>`).join('') : `<div class="rc-line muted">Nenhum item desta vez <small>(${Math.round(C.NORMAL_ITEM_DROP * 100)}% de chance em combates comuns)</small></div>`}</div></div>`;
        if (rw.relic) cards += `<div class="rcard relic"><div class="rc-ic">🏺</div><div class="rc-body"><h4>Relíquia</h4><div class="rc-line">Você escolherá <b>1 de 3 relíquias</b> ${rw.relic === 'boss' ? '(maior chance de rara/lendária)' : ''} na próxima tela.</div></div></div>`;
      }
      const xpRows = (rw.units || []).map((u, i) => {
        const up = u.lvlAfter > u.lvlBefore;
        const from = Math.round(u.xpBefore / u.nextBefore * 100), to = Math.round(u.xpAfter / u.nextAfter * 100);
        return `<div class="xp-row" ${coop ? `style="--pc:${P(u.owner).color}"` : ''}><span class="xp-name">${u.archetypeId ? FE.Art.medal(u.archetypeId, { color: u.color, quality: u.quality, cls: 'xs' }) : u.symbol} ${esc(u.name)}</span>
          <span class="xp-lvl">${up ? `<b class="lvlup">⬆ Nv.${u.lvlBefore} → ${u.lvlAfter}</b>` : `Nv.${u.lvlAfter}`}</span>
          <div class="xp-track"><div class="xp-fill" data-from="${up ? 0 : from}" data-to="${to}" style="width:${up ? 0 : from}%"></div></div>
          ${up ? `<span class="pe-chip">+${u.lvlAfter - u.lvlBefore} PE</span>` : `<span class="xp-pct">${u.xpAfter}/${u.nextAfter}</span>`}</div>`;
      }).join('');
      cards += `<div class="rcard xp wide"><div class="rc-ic">📘</div><div class="rc-body"><h4>Experiência</h4>
        <div class="rc-note">${rw.xp.filter(x => x.n).map(x => `${pname(x.pid)}${x.each} XP para cada uma de ${x.n} unidade(s)`).join(' • ')} ${rw.won ? `• +${rw.killXp} XP por abate` : '• 45% do XP (treino)'}</div>${xpRows}
        ${(rw.units || []).some(u => u.lvlAfter > u.lvlBefore) ? '<div class="rc-note">⭐ Cada nível dá 1 Ponto de Evolução — use em <b>Evoluir</b> antes da próxima luta.</div>' : ''}</div></div>`;
      if (rw.objective) {
        const ob = rw.objective;
        cards += `<div class="rcard objective ${ob.done ? 'done' : 'miss'}"><div class="rc-ic">${D.OBJECTIVES[ob.id].icon}</div><div class="rc-body"><h4>Objetivo bônus</h4><div class="rc-line"><b class="big">${ob.done ? '✔ Cumprido' : '✖ Não cumprido'}</b></div><div class="rc-note">${ob.text} • ${ob.done ? `ganhou ${ob.reward}` : `valia ${ob.reward}`}</div></div></div>`;
      }
      if (rw.threat) {
        const t = rw.threat, d = t.after - t.before;
        cards += `<div class="rcard threat"><div class="rc-ic">🔥</div><div class="rc-body"><h4>Ameaça</h4><div class="rc-line"><b class="big">${t.before} → ${t.after}</b> <small>${t.why}${d ? ` (${d > 0 ? '+' : ''}${d})` : ''}</small></div>
          <div class="rc-note">Próximas salas: inimigos ${t.after >= 0 ? '+' : ''}${Math.round(SCL.threatPer * t.after * 100)}% • recompensas +${Math.round(SCL.rewardPer * Math.max(0, t.after) * 100)}%</div></div></div>`;
      }
      if (rw.citadel) cards += `<div class="rcard citadel ${rw.citadel.delta < 0 ? 'bad' : ''}"><div class="rc-ic">🏰</div><div class="rc-body"><h4>Cidadela</h4><div class="rc-line"><b class="big">${rw.citadel.delta > 0 ? '+' : ''}${rw.citadel.delta}</b> <small>${rw.citadel.hp}/${rw.citadel.max}</small></div><div class="mini-bar"><div style="width:${Math.round(rw.citadel.hp / rw.citadel.max * 100)}%"></div></div></div></div>`;
      const ex = rw.extras.filter(e => !/^Sem item/.test(e.text));
      if (ex.length) cards += `<div class="rcard extras wide"><div class="rc-body">${ex.map(e => `<div class="rc-line ${e.dim ? 'muted' : ''}">${e.icon} ${e.text}</div>`).join('')}</div></div>`;
    } else cards = `<div class="report-lines">${p.lines.map(l => `<div>${l}</div>`).join('')}</div>`;

    const maxD = Math.max(1, ...rep.map(x => x.dmgDealt)), maxT = Math.max(1, ...rep.map(x => x.dmgTaken)), maxH = Math.max(1, ...rep.map(x => x.healDone));
    const mvp = rep.slice().sort((a, b) => (b.dmgDealt + b.healDone) - (a.dmgDealt + a.healDone))[0];
    const bar = (v, m, c) => `<div class="bar-cell"><div class="bar" style="width:${Math.round(v / m * 90)}px;background:${c}"></div><span>${fmt(v)}</span></div>`;
    const sorted = coop ? rep.slice().sort((a, b) => a.owner - b.owner || b.dmgDealt - a.dmgDealt) : rep;
    const rows = sorted.map(x => `<tr ${coop ? `style="box-shadow: inset 3px 0 0 ${P(x.owner).color}"` : ''}><td>${x.symbol} ${esc(x.name)} ${x === mvp ? '👑' : ''} ${x.survived ? '' : '<span class="dead-tag">✖ caiu</span>'}</td>
      <td>${bar(x.dmgDealt, maxD, '#f59e0b')}</td><td>${bar(x.dmgTaken, maxT, '#ef4444')}</td><td>${bar(x.healDone, maxH, '#10b981')}</td><td>${x.kills}</td></tr>`).join('');
    let team = '';
    if (coop) {
      const tot = G.run.players.map(pl => { const mine = rep.filter(x => x.owner === pl.id); return { pl, d: mine.reduce((s, x) => s + x.dmgDealt, 0), h: mine.reduce((s, x) => s + x.healDone, 0), k: mine.reduce((s, x) => s + x.kills, 0) }; });
      const best = tot.slice().sort((a, b) => (b.d + b.h) - (a.d + a.h))[0];
      team = `<div class="team-totals">${tot.map(t => `<div class="team-card" style="--pc:${t.pl.color}"><b>${esc(t.pl.name)} ${t === best && t.d + t.h > 0 ? '🏅' : ''}</b><span>⚔️ ${fmt(t.d)} • 💚 ${fmt(t.h)} • ☠️ ${t.k}</span></div>`).join('')}</div>`;
    }
    openModal('pending', {
      title: p.title, sub: `Duração do combate: ${p.time ? p.time.toFixed(1) : '?'}s${mvp ? ` • MVP: ${mvp.symbol} ${esc(mvp.name)}` : ''}`, closable: false, size: 'wide',
      body: `<div class="reward-cards">${cards}</div>
        <details class="stats-details"><summary>📊 Estatísticas do combate (dano, cura e abates por unidade)</summary>${team}
        <table class="report-table"><thead><tr><th>Unidade</th><th>Dano causado</th><th>Dano sofrido</th><th>Cura/Escudo</th><th>Abates</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="muted" style="font-size:11px;margin-top:6px;">Invocações (torretas, lobos, esqueletos) têm o dano creditado ao dono.</div></details>`,
      footer: `<span>${p.won ? (G.run.pending.length > 1 ? `A seguir: ${G.run.pending[1].kind === 'choice' ? '🏺 escolha de recompensa' : G.run.pending[1].kind === 'story' ? '📖 história do próximo Ato' : '…'}` : 'A seguir: 🗺️ escolha do próximo caminho') : 'A seguir: 🔁 nova tentativa nesta sala'}</span><button class="btn btn-primary btn-lg" data-act="next">${p.final ? 'Ver o desfecho →' : 'Continuar →'}</button>`
    });
    setTimeout(() => document.querySelectorAll('.xp-fill').forEach(f => { f.style.width = f.dataset.to + '%'; }), 120);
    $('modal-footer').querySelector('[data-act="next"]').addEventListener('click', () => G.skipPending());
  }

  /* ---------- Fim de run, epílogo e créditos ---------- */
  function showEnd() {
    const r = G.run, e = r.ended;
    const coop = r.players.length > 1;
    openModal('end', {
      title: e.victory ? '👑 A FORJA FOI SALVA — VITÓRIA!' : '💀 A CIDADELA CAIU',
      sub: `Ato ${r.act} • Sala ${r.room}/${C.TOTAL_ROOMS} • ${coop ? `Co-op ${r.players.length} jogadores` : 'Solo'}${r.daily ? ' • 📅 Desafio Diário' : ''} • seed ${esc(r.seed)}${r.ascension ? ` • Ascensão ${r.ascension}` : ''}`, closable: false, size: 'narrow',
      body: `${e.victory ? `<div class="story" style="margin-bottom:14px;"><div class="story-icon">🔥</div>${D.EPILOGUE.map(t => `<p>${t}</p>`).join('')}</div>` : ''}
        <div class="records" style="margin-bottom:14px;">
          <div class="record"><b class="violet-text">+${e.shards}</b><span>Fragmentos</span></div><div class="record"><b>${r.stats.kills}</b><span>Abates</span></div>
          <div class="record"><b>${r.stats.wins}/${r.stats.combats}</b><span>Vitórias/combates</span></div><div class="record"><b>${r.relics.length}</b><span>Relíquias</span></div></div>
        ${e.unlocked ? `<div class="info-box" style="border-color:var(--gold);margin-bottom:12px;">🔓 <b>Nova dificuldade desbloqueada:</b> ${D.ASCENSIONS[G.meta.maxAscension].name} — ${D.ASCENSIONS[G.meta.maxAscension].desc}</div>` : ''}
        ${coop ? `<div class="team-totals" style="margin-bottom:12px;">${r.players.map(p => `<div class="team-card" style="--pc:${p.color}"><b>${esc(p.name)}</b><span>⚔️ ${fmt(p.dmg)} • 💚 ${fmt(p.heal)} • ☠️ ${p.kills}</span></div>`).join('')}</div>` : ''}
        <div class="info-box"><h4>Composição final</h4>${G.allUnits().map(u => `${D.ARCHETYPES[u.archetypeId].symbol} ${esc(u.name)} (Nv.${u.level})`).join(' • ') || '—'}</div>`,
      footer: `<div style="display:flex;gap:8px;"><button class="btn btn-evo" data-act="meta">🌌 Santuário (${G.meta.astralShards})</button>${e.victory ? '<button class="btn btn-secondary" data-act="credits">🎬 Créditos</button>' : ''}</div><button class="btn btn-primary btn-lg" data-act="again">🔄 Nova Expedição</button>`
    });
    const f = $('modal-footer');
    f.querySelector('[data-act="meta"]').addEventListener('click', () => UI.openMeta(() => { G.run = null; UI.refresh(); }));
    f.querySelector('[data-act="again"]').addEventListener('click', () => { G.run = null; UI.modalKind = null; UI.refresh(); });
    const cr = f.querySelector('[data-act="credits"]');
    if (cr) cr.addEventListener('click', () => UI.openCredits());
  }

  UI.openCredits = function () {
    const r = G.run;
    const heroes = r ? G.allUnits().map(u => `${D.ARCHETYPES[u.archetypeId].symbol} ${esc(u.name)}`) : [];
    const lines = ['<h3>FORJA ELEMENTAL</h3>', '<p>um auto-battler tático roguelike</p>', '<br>',
      '<h4>Direção de Jogo</h4><p>Você' + (r && r.players.length > 1 ? ` e ${r.players.slice(1).map(p => esc(p.name)).join(', ')}` : '') + '</p>',
      '<h4>Heróis da Cidadela</h4>' + (heroes.length ? heroes.map(h => `<p>${h}</p>`).join('') : '<p>—</p>'),
      '<h4>Elenco de Apoio</h4><p>14 arquétipos, 56 habilidades e uma quantidade irresponsável de partículas</p>',
      '<h4>Vilões</h4><p>🗿 Colosso de Obsidiana</p><p>🐉 Leviatã das Marés</p><p>👁️ Arconte do Eclipse</p><p>⚒️ Ferreiro Primordial</p>',
      '<h4>Consultor de Depuração</h4><p>🦆 Pato de Borracha</p>',
      '<h4>Nenhuma galinha foi ferida</h4><p>🐔 (bem, quase nenhuma)</p>',
      '<br><h3>Obrigado por jogar!</h3>', '<p class="muted">Dica: nem todos os segredos foram encontrados…</p>'];
    openModal('credits', {
      title: '🎬 Créditos', size: 'narrow', closable: true,
      body: `<div class="credits-wrap"><div class="credits-roll" id="credits-roll">${lines.join('')}</div></div>`,
      footer: '<span class="muted">Assista até o fim…</span><button class="btn btn-primary" data-act="close">Fechar</button>'
    });
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => { UI.modalKind = null; $('modal').classList.remove('open'); UI.refresh(); });
    $('credits-roll').addEventListener('animationend', () => { if (G.secret('creditos')) FE.Audio.play('secret'); });
  };

  /* ---------- Evolução ---------- */
  UI.openEvo = function (unitId) {
    if (!G.run || !G.canEdit()) return;
    const eligible = (G.isCoop() ? G.unitsOf(G.run.active) : G.allUnits()).filter(u => u.evoPoints > 0);
    if (!eligible.length) return UI.toast('Nenhuma unidade com Pontos de Evolução.', 'info');
    UI.evoUnitId = unitId && eligible.some(u => u.id === unitId) ? unitId : (eligible.some(u => u.id === UI.evoUnitId) ? UI.evoUnitId : eligible[0].id);
    UI.modalKind = 'evo';
    renderEvo();
  };
  function renderEvo() {
    const eligible = (G.isCoop() ? G.unitsOf(G.run.active) : G.allUnits()).filter(u => u.evoPoints > 0);
    if (!eligible.length) { UI.modalKind = null; $('modal').classList.remove('open'); UI.refresh(); return; }
    if (!eligible.some(u => u.id === UI.evoUnitId)) UI.evoUnitId = eligible[0].id;
    const u = eligible.find(x => x.id === UI.evoUnitId), a = D.ARCHETYPES[u.archetypeId];
    const syn = G.synergyCounts(), onBoard = G.onBoard(u.id);
    const tabs = eligible.map(x => `<button class="unit-tab-btn ${x.id === u.id ? 'active' : ''}" data-evotab="${x.id}">${FE.Art.medal(x.archetypeId, { color: D.ARCHETYPES[x.archetypeId].color, cls: 'xs' })} ${esc(x.name)} (Nv.${x.level}) <span class="pts-pill">+${x.evoPoints} PE</span></button>`).join('');
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
      title: `⭐ Evolução — Pontos de Evolução (PE)${G.isCoop() ? ' — ' + esc(G.me().name) : ''}`, sub: 'Aprimore habilidades exclusivas (até Nv.3) ou acumule elementos para sinergias 2/4/6/8.', size: 'wide',
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
        ${G.run ? `<div class="setting-row col"><div><b>Escala de poder</b><div class="muted" style="font-size:11.5px;">Vale a partir da próxima sala.</div></div><div class="scale-list compact">${Object.entries(D.SCALING.modes).map(([k, md]) => `<button class="scale-btn ${G.run.scaling === k ? 'active' : ''}" data-setscale="${k}" ${tipAttr(md.desc)}><b>${md.icon} ${md.name}</b></button>`).join('')}</div></div>` : ''}
        <div class="setting-row"><div><b>Abandonar expedição</b><div class="muted" style="font-size:11.5px;">Encerra a run atual sem Fragmentos.</div></div><button class="btn btn-danger" data-act="abandon" ${G.run && G.run.phase !== 'COMBAT' ? '' : 'disabled'}>Abandonar</button></div>`,
      footer: `<span>Atalhos: Espaço iniciar/pronto • P pausar • S velocidade • A auto-posicionar • E evoluir • M mapa • C códice • 1–4 jogador • Esc fechar</span><button class="btn btn-primary" data-act="close">Fechar</button>`
    });
    body.querySelectorAll('[data-toggle]').forEach(t => t.addEventListener('click', () => { s[t.dataset.toggle] = !s[t.dataset.toggle]; FE.applySettings(); UI.openSettings(); }));
    body.querySelectorAll('[data-setscale]').forEach(b => b.addEventListener('click', () => { G.setScaling(b.dataset.setscale); UI.toast(`Escala de poder: ${D.SCALING.modes[b.dataset.setscale].name}`, 'success'); UI.openSettings(); UI.refresh(); }));
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
    const tabs = [['guia', '🧭 Como Jogar'], ['arq', '⚔️ Arquétipos'], ['sin', '✦ Sinergias'], ['ter', '🏞️ Terrenos'], ['rel', '🏺 Relíquias'], ['itm', '🎒 Itens'], ['ini', '👹 Inimigos'], ['dou', '🧠 Doutrinas'], ['qua', '🏰 Quartel & Táticas'], ['rw', '🎁 Recompensas'], ['esc', '📈 Escala de Poder'], ['notas', '📝 Notas da Versão']];
    let content = '';
    const t = UI.codexTab;
    if (t === 'guia') content = `<div class="codex-prose">
      <h3>Objetivo</h3><p>Atravesse ${C.TOTAL_ROOMS} salas em ${C.ACTS} Atos e derrote os quatro Guardiões, até o Ferreiro Primordial. Se a Cidadela chegar a 0, a expedição termina — mas você leva Fragmentos Astrais para melhorias permanentes.</p>
      <h3>Modo cooperativo (2 a 4 jogadores)</h3><ul><li>Jogado no mesmo aparelho: os jogadores se revezam. Troque o controle com as teclas <code>1</code>–<code>4</code> ou clicando no nome acima do tabuleiro.</li>
      <li>O time tem <b>até ${C.COOP_TOTAL_UNITS} unidades</b>, divididas igualmente: 6 cada (2 jogadores), 4 (3 jogadores) ou 3 (4 jogadores). Cada jogador escolhe as suas.</li>
      <li>Cada jogador tem <b>ouro, banco e mochila próprios</b> e recebe sua parte do XP, dividida só entre as próprias unidades em campo — o dilema hyper-carry × exército vale para cada um.</li>
      <li>Sinergias, relíquias e Cidadela são <b>compartilhadas</b>. Escolhas de recompensa se revezam entre os jogadores; no Mercador cada um compra com o próprio ouro. Dá para doar ouro e itens (🎁).</li>
      <li>O combate só começa quando <b>todos marcam Pronto</b> (<code>Espaço</code>). Os inimigos ficam mais numerosos e fortes para compensar o time maior.</li></ul>
      <h3>O coração da estratégia: XP compartilhado</h3><p>Cada sala gera um <b>pool de XP dividido apenas entre as unidades em campo</b>. Poucas unidades sobem de nível muito rápido (hyper-carry); muitas unidades ativam mais sinergias, mas crescem devagar. O controle <b>Comp 1–16</b> no topo define o limite do campo. O banco não divide XP.</p>
      <h3>Estratégia: leia o inimigo</h3><p>Antes de cada luta o painel acima do tabuleiro mostra a <b>doutrina</b> da horda (e sua fraqueza), a <b>inteligência inimiga</b> — contramedidas que eles prepararam contra o seu estilo, a partir do Ato II — e um <b>objetivo bônus</b>. Responda trocando unidades do banco, reposicionando e escolhendo uma <b>Tática</b>. Detalhes nas abas 🧠 Doutrinas e 🏰 Quartel &amp; Táticas.</p>
      <h3>Evolução</h3><p>Cada nível concede 1 PE. Gaste-o para desbloquear/aprimorar uma das 4 habilidades do arquétipo (até Nv.3) <i>ou</i> para absorver 1 stack de elemento.</p>
      <h3>Sinergias</h3><ul><li><b>Elementos</b> (2/4/6/8 stacks somados no campo): Fogo, Água, Pedra, Ar, Solar, Lunar.</li><li><b>Classes</b> (2/4/6): Bastião, Lâmina, Arcano, Devoção e Invocador.</li><li><b>Origens</b> (2/3/4): Selvagem, Oculto, Celestial e Engenho.</li><li>Cada arquétipo tem 1 Classe + 1 Origem. No Quartel, ▲ indica que aquele recruta ativa um novo nível.</li></ul>
      <h3>Terreno</h3><p>O tabuleiro é 12×12 e muda a cada sala: montanhas, lagos, rios com pontes, ravinas, florestas (esquiva), colinas (alcance), pântanos (lentidão) e lava (dano). Posicione-se pensando nos gargalos.</p>
      <h3>Conquistas</h3><p>${FE.Achievements.list.length} conquistas permanentes em 6 categorias (botão 🏆), algumas secretas. Cada uma rende Fragmentos Astrais e sobe o seu título de comandante.</p>
      <h3>Desafio Diário</h3><p>Todo dia uma seed nova, igual para todos, na Ascensão I. Seu melhor resultado do dia fica registrado na tela inicial.</p>
      <h3>Mapa</h3><p>Cada Ato tem um mapa ramificado. Combates e Elites dão XP; Forja, Santuário, Acampamento, Mercador e Mistério dão recursos sem lutar. Elites e Chefes garantem relíquias.</p>
      <h3>Controles</h3><ul><li>Arraste unidades entre banco e campo, ou dentro do campo para trocar posições. Arraste até o Quartel para vender.</li><li>Clique em inimigos durante a preparação para estudá-los.</li><li>Itens: selecione uma unidade e clique no item da mochila. Dois itens iguais do mesmo tier podem ser fundidos (★→★★→★★★).</li><li>Clique no ✏️ do Inspetor para dar nome às suas unidades.</li><li>Atalhos: <code>Espaço</code> iniciar/pronto • <code>P</code> pausar • <code>S</code> velocidade • <code>A</code> auto-posicionar • <code>F</code> modo foco • <code>E</code> evoluir • <code>M</code> mapa • <code>C</code> códice • <code>1–4</code> jogador • <code>Esc</code> fechar.</li></ul></div>`;
    if (t === 'arq') content = `<div class="codex-grid">${Object.values(D.ARCHETYPES).map(a => `<div class="codex-card"><h4><span class="h-medal">${FE.Art.medal(a.id, { color: a.color, cls: 'sm' })} ${a.name}</span><span class="gold-text">${a.cost}g</span></h4>
      <div>${a.role} • ${ordersLine(a)}</div>
      <div>❤️ ${a.stats.maxHp} • ⚔️ ${a.stats.ad} • 🔮 ${a.stats.ap} • 🛡️ ${a.stats.armor} • ⚡ ${a.stats.attackSpeed} • 🎯 ${a.stats.range}</div>
      ${a.skills.map(s => `<div>${D.SKILLS[s].icon} <b>${D.SKILLS[s].name}</b> <i>(${D.SKILLS[s].type})</i>: ${D.SKILLS[s].desc(1)}</div>`).join('')}</div>`).join('')}</div>`;
    if (t === 'sin') content = `<div class="codex-grid">${Object.values(D.ELEMENTS).map(e => `<div class="codex-card"><h4 style="color:${e.color}">${e.icon} ${e.name}</h4><div><b>Pessoal:</b> ${e.personalDesc}</div><div><b>Sinergia 2/4/6/8:</b> ${e.tiersText}</div></div>`).join('')}
      ${Object.values(D.ORDERS).map(o => `<div class="codex-card"><h4 style="color:${o.color}"><span>${o.icon} ${o.name}</span><span class="kind-tag">${o.kind}</span></h4><div>Membros: ${o.members.map(m => D.ARCHETYPES[m].symbol + ' ' + D.ARCHETYPES[m].name).join(', ')}</div><div><b>${o.thresholds.join('/')}:</b> ${o.tiersText}</div></div>`).join('')}</div>`;
    if (t === 'ter') content = `<div class="codex-prose" style="margin-bottom:12px;"><p>Cada sala de combate acontece num tabuleiro 12×12 com terreno próprio, espelhado entre os dois lados. Obstáculos forçam as unidades a contornar (elas calculam o caminho sozinhas) e pontes viram gargalos. Passe o mouse sobre uma casa do tabuleiro para ver seu efeito.</p></div>
      <div class="codex-grid">${Object.entries(D.TERRAIN).filter(([k]) => k !== '.').map(([k, t]) => `<div class="codex-card"><h4><span>${t.icon} ${t.name}</span><span class="kind-tag">${t.blocked ? 'bloqueia' : 'passável'}</span></h4><div>${t.desc}</div></div>`).join('')}
      ${Object.values(D.LAYOUTS).map(l => `<div class="codex-card"><h4><span>${l.icon} ${l.name}</span><span class="kind-tag">Ato ${l.acts.map(a => ['', 'I', 'II', 'III', 'IV'][a]).join(', ')}</span></h4><div>${l.desc}</div></div>`).join('')}</div>`;
    if (t === 'rel') content = `<div class="codex-grid">${Object.values(D.RELICS).filter(r => !r.secret || (G.run && G.run.relics.includes(r.id)) || FE.Achievements.unlocked('s_pato') && r.id === 'pato_borracha' || FE.Achievements.unlocked('s_ovo') && r.id !== 'pato_borracha').map(r => `<div class="codex-card" style="border-color:${D.RARITY[r.rarity].color}55"><h4><span>${r.icon} ${r.name}</span><span style="color:${D.RARITY[r.rarity].color};font-size:11px;">${D.RARITY[r.rarity].name}</span></h4><div>${r.desc}</div></div>`).join('')}</div>`;
    if (t === 'itm') content = `<div class="codex-grid">${Object.values(D.ITEMS).map(i => `<div class="codex-card"><h4>${i.icon} ${i.name}</h4><div>★ ${i.descFor(1)}</div><div class="muted">★★★ ${i.descFor(3)}</div></div>`).join('')}</div>`;
    if (t === 'ini') content = `<div class="codex-grid">${[1, 2, 3, 4].map(a => `<div class="codex-card"><h4>${D.ACTS[a].short} — ${D.ACTS[a].name}</h4><div style="font-size:16px;letter-spacing:3px;">${Object.values(D.ACTS[a].faction).map(f => `<span title="${f[0]}">${f[1]}</span>`).join(' ')}</div><div><b>${D.BOSSES[a].symbol} ${D.BOSSES[a].name}:</b> ${D.BOSSES[a].mechanic}</div></div>`).join('')}
      ${Object.values(D.ELITE_AFFIXES).map(f => `<div class="codex-card"><h4 style="color:${f.color}">${f.icon} Afixo de Elite: ${f.name}</h4><div>${f.desc}</div></div>`).join('')}
      <div class="codex-card"><h4>⛈️ Tempestade da Forja</h4><div>Após 50s de combate, todas as unidades sofrem dano crescente — impede impasses.</div></div></div>`;
    if (t === 'dou') content = `<div class="codex-prose" style="margin-bottom:12px;"><p>Cada horda comum ou de elite segue uma <b>doutrina</b> — um plano de batalha visível no painel acima do tabuleiro antes da luta. A escala de poder mantém a força total justa; a doutrina muda <i>como</i> o inimigo luta. A resposta certa é composição, posicionamento e tática.</p>
      <p>A partir do <b>Ato II</b>, a horda também usa <b>inteligência</b>: ao você entrar na sala ela analisa as melhores unidades do seu elenco (campo + banco) e prepara <b>contramedidas</b> contra o seu ponto mais previsível (1 no Ato II, até 2 nos Atos III–IV). Você vê o que eles prepararam e ainda pode trocar unidades, posição e tática antes de lutar.</p></div>
      <div class="codex-grid">${Object.values(D.DOCTRINES).map(d => `<div class="codex-card" style="border-color:${d.color}66"><h4><span>${d.icon} ${d.name}</span><span class="kind-tag">doutrina • sala ${d.minRoom}+</span></h4><div>${d.desc}</div><div class="muted"><b>Fraqueza:</b> ${d.weak}</div></div>`).join('')}
      ${Object.values(D.COUNTERS).map(c => `<div class="codex-card" style="border-color:${c.color}66"><h4><span>${c.icon} ${c.name}</span><span class="kind-tag">contramedida</span></h4><div>${c.desc}</div><div class="muted"><b>Resposta:</b> ${c.answer}</div></div>`).join('')}</div>`;
    if (t === 'qua') content = `<div class="codex-prose" style="margin-bottom:12px;"><h3>Quartel</h3><p>A cada sala o Quartel oferece <b>${D.QUARTEL.slots} recrutas</b> (sempre pelo menos um de linha de frente e um de retaguarda). Cada um tem <b>qualidade</b> — ${D.QUARTEL.quality.map(q => `<b style="color:${q.color}">${q.name}</b> (Nv.${q.level}, preço ×${q.costMult})`).join(', ')} — e pode ter um <b>traço</b>. Heróis aparecem mais nos Atos finais e sempre têm um traço raro. Parte das ofertas puxa arquétipos que completam as Ordens que você já tem.</p>
      <p><b>🎲 Rolar</b> troca as cartas não travadas (${D.QUARTEL.rerollBase}g, +${D.QUARTEL.rerollStep}g a cada rolagem na mesma sala). <b>🔒 Travar</b> guarda uma carta para a próxima sala. <b>📜 Contratos</b> contratam qualquer arquétipo sem traço por ${Math.round((D.QUARTEL.contractMult - 1) * 100)}% a mais — o caminho garantido, porém caro.</p>
      <h3>Táticas</h3><p>Antes de cada luta escolha a postura do exército na barra acima do tabuleiro. Ela vale até você trocar.</p></div>
      <div class="codex-grid">${Object.values(D.TACTICS).map(x => `<div class="codex-card"><h4>${x.icon} ${x.name}</h4><div>${x.desc}</div></div>`).join('')}
      ${Object.values(D.TRAITS).map(x => `<div class="codex-card" ${x.rare ? 'style="border-color:#fbbf2466"' : ''}><h4><span>${x.icon} ${x.name}</span><span class="kind-tag">${x.rare ? 'traço raro' : 'traço'}</span></h4><div>${x.desc}</div></div>`).join('')}
      ${Object.values(D.OBJECTIVES).map(x => `<div class="codex-card"><h4><span>${x.icon} ${x.name}</span><span class="kind-tag">objetivo</span></h4><div>${x.text('N')}</div></div>`).join('')}</div>`;
    if (t === 'rw') content = `<div class="codex-prose">
      <h3>De onde vem o poder do seu exército</h3>
      <ul><li><b>🪙 Ouro</b> — cada vitória paga uma recompensa base (cresce com a sala; elite +30, chefe +60) mais <b>juros de 10%</b> do ouro guardado (máx. ${C.INTEREST_CAP}g). Use para comprar unidades, rolar a loja e subir o limite do time. Em co-op, cada jogador recebe a sua parte.</li>
      <li><b>📘 XP</b> — a vitória gera um bolo de XP dividido igualmente entre as unidades em campo (menos unidades = mais XP cada) + bônus por abate. Elites dão ×1,45 e chefes ×1,75. Derrota ainda dá 45% do XP (treino).</li>
      <li><b>⭐ Nível e PE</b> — cada nível aumenta os atributos da unidade e dá <b>1 Ponto de Evolução</b>, gasto em <b>Evoluir</b> para habilidades e talentos.</li>
      <li><b>🎁 Itens</b> — combates comuns têm 30% de chance de item ★1; elites garantem um; chefes dão ★2 para cada jogador. Itens iguais se fundem em tiers maiores.</li>
      <li><b>🏺 Relíquias</b> — escolha 1 de 3 após elites e chefes (chefes favorecem raras/lendárias). Também aparecem em Mistérios e no Mercador.</li>
      <li><b>❤️ Cidadela</b> — sua vida da expedição. Derrotas tiram Cidadela (mais em salas difíceis) e você tenta de novo; chefes vencidos devolvem 25.</li>
      <li><b>🔥 Bônus de Ameaça</b> — na escala Dinâmica, cada ponto positivo de Ameaça dá +${Math.round(D.SCALING.rewardPer * 100)}% de ouro e XP.</li></ul>
      <p>Antes de cada luta, a faixa <b>“Se vencer / Se perder”</b> acima do tabuleiro mostra exatamente o que está em jogo, e o mapa mostra a recompensa de cada sala ao passar o mouse. Depois da luta, o relatório separa tudo em cartões: ouro (com a conta), XP por unidade com barras, itens, relíquia, Ameaça e Cidadela.</p></div>`;
    if (t === 'esc') content = `<div class="codex-prose">
      <h3>Escalas de poder</h3><p>Define como os inimigos acompanham a força do seu exército. Escolha na tela inicial; pode trocar em ⚙️ Configurações durante a expedição.</p>
      ${Object.values(D.SCALING.modes).map(md => `<p><b>${md.icon} ${md.name}</b>${md.recommended ? ' (recomendada)' : ''} — ${md.desc}</p>`).join('')}
      <h3>Como o poder é medido</h3>
      <p>Poder de uma unidade = √(vida efetiva × dano por segundo), contando armadura, resistência mágica, itens, relíquias, sinergias e nível. O poder do time é o <b>quadrado da soma</b> (lei de Lanchester): 6 unidades médias valem bem mais que 3 fortes. A barra <b>Seu exército × Horda</b> compara os dois e indica se a luta está Fácil, Equilibrada, Difícil ou Mortal para o momento da campanha.</p>
      <p>Nas escalas adaptativas o jogo mede a força do seu <b>elenco inteiro</b> (inclusive o banco) ao entrar na sala — então guardar unidades fortes no banco não engana o sistema, e espalhar XP entre mais unidades não é punido. A correção é suave (raiz quadrada, limitada entre ×${D.SCALING.kMin} e ×${D.SCALING.kMax}), para que boas decisões ainda sejam recompensadas.</p></div>`;
    if (t === 'notas') content = `<div class="codex-prose">
      <h3>v3.1 — Arte e clareza</h3>
      <ul><li><b>Arte própria</b> para todas as classes, invocações e chefes, com miniaturas de tabuleiro (base metálica, espinhos nos inimigos, selo de nível).</li>
      <li><b>Layout mais limpo</b>: briefing em chips expansíveis, poder e recompensas numa linha, sinergias inativas recolhidas, Inspetor com retrato.</li>
      <li><b>Modo Foco</b> (tecla F): só o tabuleiro e o briefing.</li></ul>
      <h3>v3.0 — Mesa de Guerra</h3>
      <ul><li><b>Doutrinas inimigas</b>: 7 planos de batalha (Muralha de Escudos, Emboscada, Artilharia, Enxame, Sacerdócio, Ritual Arcano, Horda Furiosa) que mudam composição, formação e atributos da horda.</li>
      <li><b>Inteligência inimiga</b> a partir do Ato II: 7 contramedidas contra o seu estilo (dano físico ou mágico demais, um campeão carregando o time, muitos atiradores, dependência de cura, exército grande, armadura alta).</li>
      <li><b>Táticas</b>: Equilíbrio, Assalto, Falange, Caça à Retaguarda e Fogo Concentrado.</li>
      <li><b>Objetivos bônus</b> em cada luta, com ouro, XP ou item.</li>
      <li><b>Quartel</b>: recrutas rotativos com qualidade (Recruta/Veterano/Herói) e 16 traços, rolagem, trava e Contratos.</li>
      <li><b>Novo layout</b>: trilha de campanha, painel de inteligência, doca de Comando + Quartel, tema visual novo.</li></ul>
      <h3>v2.3</h3>
      <ul><li><b>4 escalas de poder</b> para os inimigos: Clássica, Nivelada, Proporcional e <b>Dinâmica</b> (com Medidor de Ameaça que endurece os inimigos — e aumenta as recompensas — quando você domina).</li>
      <li><b>Barra de poder</b> Seu exército × Horda com dificuldade estimada antes de cada luta.</li>
      <li><b>Recompensas claras</b>: faixa “Se vencer / Se perder”, recompensas no mapa, relatório em cartões com a conta do ouro, barras de XP animadas por unidade e subidas de nível.</li>
      <li><b>Visual</b>: tremor de tela em impactos, cortes corpo a corpo, rastros de projéteis, fantasmas ao morrer, flash de dano, halo e selo de nível nas unidades, água/lava animadas, vinheta e faixa de Vitória/Derrota.</li></ul>
      <h3>v2.2</h3>
      <ul><li><b>Modo cooperativo local</b> para 2, 3 ou 4 jogadores: ${C.COOP_TOTAL_UNITS} unidades divididas, ouro/banco/mochila por jogador, sistema de Pronto, escolhas em rodízio, doações e relatório por jogador.</li>
      <li><b>Campanha ampliada</b>: 4 Atos × 6 salas = ${C.TOTAL_ROOMS} salas. Novo <b>Ato IV — Coração da Forja</b> com facção própria, mapa <i>Ilhas Flutuantes</i> e o chefe final <b>Ferreiro Primordial</b>. Introduções de história a cada Ato, epílogo e créditos.</li>
      <li><b>Rebalanceamento</b> completo com o simulador (solo, co-op e todas as Ascensões).</li>
      <li><b>Conquistas v2</b>: ${FE.Achievements.list.length} conquistas em 6 categorias, conquistas secretas e títulos de comandante.</li>
      <li><b>Desafio Diário</b>, pausa, renomear unidades, guia de primeiros passos, novos eventos de Mistério (Taverna, Estátua Chorosa).</li>
      <li>E alguns segredos que não vamos contar aqui. 🤫</li></ul>
      <h3>v2.1</h3>
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
      <ul><li>Co-op online (o motor determinístico permite sincronizar só as ações dos jogadores) e ranking do desafio diário.</li><li>Arte/sprites e animações por arquétipo; trilha sonora.</li><li>Mais Atos/facções e eventos via <code>data.js</code>; editor de conteúdo em JSON.</li><li>Servidor autoritativo reutilizando <code>engine.js</code> para modo PvP assíncrono.</li></ul></div>`;
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
  UI.achCat = 'todas';
  UI.openAch = function (onBack) {
    if (onBack !== undefined) UI.achBack = onBack;
    const m = G.meta, A = FE.Achievements;
    const cats = [['todas', '⭐ Todas'], ...A.categories];
    const list = A.list.filter(a => UI.achCat === 'todas' || a.cat === UI.achCat);
    const cards = list.map(a => {
      const done = m.ach[a.id];
      const hidden = a.hidden && !done;
      const pr = a.progress && !done ? a.progress(m) : null;
      return `<div class="ach-card ${done ? 'done' : ''} ${hidden ? 'secret' : ''}"><div class="ach-ic">${hidden ? '❔' : a.icon}</div><div style="flex:1;"><h4>${hidden ? '???' : a.name}</h4><p>${hidden ? `<i>Conquista secreta. Pista: ${a.hint}</i>` : a.desc}</p>
        ${pr ? `<div class="ach-progress"><div style="width:${Math.min(100, pr[0] / pr[1] * 100)}%"></div></div><div class="muted" style="font-size:10px;margin-top:2px;">${pr[0]}/${pr[1]}</div>` : ''}
        <div class="ach-meta">${done ? `✔ ${new Date(done).toLocaleDateString('pt-BR')} • ` : ''}🌌 +${a.reward}</div></div></div>`;
    }).join('');
    const total = A.list.reduce((s, a) => s + a.reward, 0), got = A.list.filter(a => m.ach[a.id]).reduce((s, a) => s + a.reward, 0);
    const pct = Math.round(A.count() / A.list.length * 100);
    const nt = A.nextTitle();
    const body = openModal('ach', {
      title: `🏆 Conquistas — ${A.count()}/${A.list.length}`, sub: `Título atual: <b class="gold-text">${A.title()}</b>${nt ? ` • próximo: ${nt.name} (${nt.at})` : ''} • Fragmentos: ${got}/${total}`, size: 'wide',
      body: `<div class="ach-overall"><div style="width:${pct}%"></div></div>
        <div class="codex-tabs">${cats.map(([k, l]) => { const n = k === 'todas' ? A.list.length : A.list.filter(a => a.cat === k).length, d = A.list.filter(a => (k === 'todas' || a.cat === k) && m.ach[a.id]).length; return `<button class="tab ${UI.achCat === k ? 'active' : ''}" data-acat="${k}">${l} ${d}/${n}</button>`; }).join('')}</div>
        <div class="ach-grid">${cards}</div>`,
      footer: `<span>As conquistas são permanentes e valem para todas as expedições.</span><button class="btn btn-primary" data-act="close">${UI.achBack ? '← Voltar' : 'Fechar'}</button>`
    });
    body.querySelectorAll('[data-acat]').forEach(b => b.addEventListener('click', () => { UI.achCat = b.dataset.acat; UI.openAch(); }));
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => {
      const back = UI.achBack; UI.achBack = null;
      if (back) { UI.modalKind = null; back(); } else UI.closeModal(true);
    });
  };

  /* ---------- Doações (co-op) ---------- */
  UI.openGive = function (bagIdx) {
    if (!G.isCoop()) return;
    const me = G.me(), it = bagIdx !== undefined ? me.bag[bagIdx] : null;
    const others = G.run.players.filter(p => p.id !== me.id);
    const body = openModal('give', {
      title: it ? `🎁 Doar ${D.ITEMS[it.id].icon} ${D.ITEMS[it.id].name} ${stars(it.tier)}` : '🪙 Enviar ouro', sub: `${esc(me.name)} tem ${me.gold}g`, size: 'narrow',
      body: `<div style="display:flex;flex-direction:column;gap:10px;">${others.map(p => `<div class="give-row" style="--pc:${p.color}"><b style="color:${p.color}">${esc(p.name)}</b> <span class="muted">🪙 ${p.gold}g • ${p.bag.length} itens</span>
        <div style="display:flex;gap:6px;">${it ? `<button class="btn btn-primary" data-to="${p.id}">Doar item</button>` : [10, 25, 50, 100].map(v => `<button class="btn btn-secondary" data-to="${p.id}" data-amt="${v}" ${me.gold < v ? 'disabled' : ''}>${v}g</button>`).join('')}</div></div>`).join('')}</div>`,
      footer: '<span></span><button class="btn btn-secondary" data-act="close">Fechar</button>'
    });
    body.querySelectorAll('[data-to]').forEach(b => b.addEventListener('click', () => {
      if (it) { G.giveItem(bagIdx, +b.dataset.to); UI.closeModal(true); }
      else { G.giveGold(+b.dataset.to, +b.dataset.amt); UI.openGive(); }
    }));
    $('modal-footer').querySelector('[data-act="close"]').addEventListener('click', () => UI.closeModal(true));
  };

  /* ======================= REFRESH ======================= */
  UI.refresh = function () {
    const r = G.run;
    if (r && r.phase !== UI.lastPhase) {
      if (r.phase === 'MAP') UI.mapDismissed = false;
      if (r.phase === 'COMBAT') requestAnimationFrame(() => { const cv = $('canvas-container'); const bx = cv.getBoundingClientRect(); if (bx.bottom > innerHeight || bx.top < 80) window.scrollBy({ top: bx.top - 96, behavior: 'smooth' }); });
      UI.lastPhase = r.phase;
    }
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
    if (unit && !G.isMine(unit)) { G.selectedId = unit.id; UI.inspectEnemyId = null; UI.refresh(); return; }
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
    $('shop-grid').addEventListener('click', (e) => {
      const l = e.target.closest('[data-lock]'); if (l) { e.stopPropagation(); return G.toggleLock(+l.dataset.lock); }
      const h = e.target.closest('[data-hire]'); if (h) return G.hire(+h.dataset.hire);
      const c = e.target.closest('[data-buy]'); if (c) G.buy(c.dataset.buy);
    });
    $('shop-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-shop]'); if (b) { UI.shopTab = b.dataset.shop; refreshShop(); } });
    $('btn-reroll').addEventListener('click', () => G.reroll());
    $('intel-panel').addEventListener('click', (e) => { const b = e.target.closest('[data-intel]'); if (!b) return; UI.intelOpen = UI.intelOpen === b.dataset.intel ? null : b.dataset.intel; refreshIntel(); });
    $('tactic-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-tactic]'); if (b) G.setTactic(b.dataset.tactic); });
    $('left-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-left]'); if (!b) return;
      UI.leftTab = b.dataset.left;
      document.querySelectorAll('#left-tabs .seg').forEach(x => x.classList.toggle('active', x === b));
      $('synergy-list').style.display = UI.leftTab === 'syn' ? '' : 'none';
      $('combat-log').style.display = UI.leftTab === 'log' ? '' : 'none';
      if (UI.leftTab === 'log') $('combat-log').scrollTop = $('combat-log').scrollHeight;
    });
    $('bag-grid').addEventListener('click', (e) => {
      const gv = e.target.closest('[data-give]'); if (gv) { e.stopPropagation(); UI.openGive(+gv.dataset.give); return; }
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
      if (act === 'rename') UI.startRename(id);
    });
    $('comp-controls').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !G.run) return;
      if (b.dataset.preset) G.setTeamLimit(+b.dataset.preset);
      if (b.dataset.limit) G.setTeamLimit(G.me().teamLimit + +b.dataset.limit);
    });
    $('btn-start').addEventListener('click', () => UI.primaryAction());
    $('btn-pause').addEventListener('click', () => G.togglePause());
    $('players-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-player]'); if (b) G.setActive(+b.dataset.player); });
    $('give-gold').addEventListener('click', () => UI.openGive());
    document.querySelector('.brand-mark').addEventListener('click', () => UI.anvilClick());
    $('overlay-map-btn').addEventListener('click', () => UI.showMap());
    $('btn-speed').addEventListener('click', () => UI.cycleSpeed());
    $('btn-arrange').addEventListener('click', () => G.autoArrange());
    $('btn-evo').addEventListener('click', () => UI.openEvo());
    $('btn-map').addEventListener('click', () => UI.showMap());
    $('btn-focus').addEventListener('click', () => UI.toggleFocus());
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

  UI.toggleFocus = function () {
    const on = document.body.classList.toggle('focus-mode');
    $('btn-focus').classList.toggle('active', on);
    setTimeout(() => { R.resize(); UI.refresh(); }, 30);
    UI.toast(on ? '🎯 Modo Foco: só o tabuleiro e o briefing (F para voltar).' : 'Modo Foco desligado.');
  };
  UI.primaryAction = function () {
    const r = G.run; if (!r || UI.modalKind) return;
    if (r.phase === 'MAP') UI.showMap();
    else if (r.phase === 'PREP') G.toggleReady();
  };

  /* ---------- Renomear ---------- */
  UI.startRename = function (id) {
    const u = G.find(id); if (!u) return;
    const h3 = document.querySelector('#inspector .unit-title-row h3'); if (!h3) return;
    h3.innerHTML = `<input class="input rename-input" maxlength="18" value="${esc(u.name)}" />`;
    const inp = h3.querySelector('input'); inp.focus(); inp.select();
    const done = (save) => { if (save) G.rename(id, inp.value); else UI.refresh(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
  };

  /* ---------- Easter eggs de interface ---------- */
  UI.anvilHits = 0;
  UI.anvilClick = function () {
    FE.Audio.play('anvil');
    const icon = document.querySelector('.brand-icon');
    icon.classList.remove('hit'); void icon.offsetWidth; icon.classList.add('hit');
    clearTimeout(UI.anvilT); UI.anvilT = setTimeout(() => { UI.anvilHits = 0; }, 1500);
    if (++UI.anvilHits >= 7) {
      UI.anvilHits = 0;
      for (let i = 0; i < 24; i++) {
        const sp = document.createElement('div'); sp.className = 'spark';
        const rc = icon.getBoundingClientRect();
        sp.style.left = (rc.left + rc.width / 2) + 'px'; sp.style.top = (rc.top + rc.height / 2) + 'px';
        sp.style.setProperty('--dx', ((Math.random() - 0.5) * 220) + 'px'); sp.style.setProperty('--dy', (-Math.random() * 160 - 20) + 'px');
        document.body.appendChild(sp); setTimeout(() => sp.remove(), 900);
      }
      UI.toast('🔨 CLANG! A bigorna aguentou firme.', 'ach');
      if (G.secret('bigorna')) FE.Audio.play('secret');
    }
  };
  UI.setRetro = function (on) {
    document.body.classList.toggle('retro', on);
    FE.settings.retro = on; FE.applySettings();
  };
  UI.cycleSpeed = function () {
    const s = FE.settings;
    s.speed = s.speed === 1 ? 2 : s.speed === 2 ? 3 : 1;
    $('btn-speed').innerHTML = `⏩ ${s.speed}x <kbd>S</kbd>`;
    FE.applySettings();
  };
})(window);
