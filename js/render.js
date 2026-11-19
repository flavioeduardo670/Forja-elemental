/* ==========================================================================
   FORJA ELEMENTAL 4.1 — render.js  (3D em WebGL com câmera orbital)
   • Terreno e bonecos em 3D (gl3d.js), luz direcional + ambiente, sombras.
   • Câmera: gira (botão direito/do meio arrastando, setas ← →, botões),
     inclina (↑ ↓), aproxima (roda do mouse, + −). Duplo clique no ⌂ reseta.
   • Camada 2D por cima (#battle-canvas) para barras, números e efeitos.
   • Sem WebGL: usa o renderizador isométrico (render-iso.js).
   Coordenadas de jogo: (x, y) em casas → mundo (X = x, Z = y, Y = altura).
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE, D = FE.Data, C = D.CONFIG, G = FE.Game;
  const N = C.COLS, P0 = C.PLAYER_ROW;
  const R = FE.Render = { tile: 52, canvas: null, ctx: null, hover: null, statsCache: new Map(), mode: '3d' };
  const FOV = 34 * Math.PI / 180;
  const CAM0 = { yaw: Math.PI / 4, pitch: 0.98, dist: 24.5 };
  const US = 1.32; // escala dos bonecos em relação à casa
  const cam = R.cam = { yaw: CAM0.yaw, pitch: CAM0.pitch, dist: CAM0.dist, tyaw: CAM0.yaw, tpitch: CAM0.pitch, tdist: CAM0.dist, eye: [0, 0, 0], vp: null, f: 1 / Math.tan(FOV / 2) };

  /* ---------------- Inicialização ---------------- */
  R.init = function (overlay) {
    R.canvas = overlay; R.ctx = overlay.getContext('2d');
    const glc = document.createElement('canvas');
    glc.className = 'gl-canvas';
    overlay.parentElement.insertBefore(glc, overlay);
    let gl = null;
    try { gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) || glc.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl || !setupGL(gl)) {
      glc.remove();
      const Iso = FE.RenderIso;
      R.mode = 'iso';
      ['resize', 'draw', 'invalidate', 'tileAt', 'project'].forEach(k => { if (Iso[k]) R[k] = (...a) => Iso[k](...a); });
      Object.defineProperty(R, 'hover', { get: () => Iso.hover, set: (v) => { Iso.hover = v; } });
      Iso.statsCache = R.statsCache;
      Iso.init(overlay);
      return;
    }
    R.gl = gl; R.glc = glc;
    buildCamUI(overlay.parentElement);
    bindCamInput(overlay);
    R.resize();
    root.addEventListener('resize', R.resize);
  };

  R.resize = function () {
    const rect = R.canvas.parentElement.getBoundingClientRect();
    const dpr = FE.settings && FE.settings.retro ? 0.35 : Math.min(2, root.devicePixelRatio || 1);
    R.w = rect.width; R.h = rect.height;
    for (const cv of [R.canvas, R.glc]) { cv.width = Math.max(1, Math.round(rect.width * dpr)); cv.height = Math.max(1, Math.round(rect.height * dpr)); }
    R.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.gl.viewport(0, 0, R.glc.width, R.glc.height);
    R.dpr = dpr;
  };
  R.invalidate = function () {
    R.statsCache.clear();
    if (!G.run) return;
    const ctx = G.statsCtx();
    for (const u of G.allUnits()) R.statsCache.set(u.id, G.statsOf(u, ctx));
  };

  /* ---------------- WebGL ---------------- */
  const VS = `attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute float aE;
uniform mat4 uVP; uniform mat4 uM; varying vec3 vN; varying vec3 vC; varying float vE; varying float vY;
void main(){ vec4 w = uM * vec4(aP,1.0); vN = mat3(uM) * aN; vC = aC; vE = aE; vY = w.y; gl_Position = uVP * w; }`;
  const FS = `precision mediump float; varying vec3 vN; varying vec3 vC; varying float vE; varying float vY;
uniform vec3 uL; uniform vec4 uTint; uniform float uA; uniform float uGray; uniform float uTime;
void main(){ vec3 n = normalize(vN); float d = max(dot(n,uL),0.0);
 vec3 hemi = mix(vec3(0.62,0.58,0.56), vec3(0.92,0.95,1.0), n.y*0.5+0.5);
 vec3 c = vC*(hemi*0.62 + d*vec3(0.62,0.6,0.56));
 c = mix(c, vC*(1.08+0.08*sin(uTime*3.0+vY*6.0)), vE);
 float g = dot(c, vec3(0.3,0.59,0.11)); c = mix(c, vec3(g), uGray);
 c = mix(c, uTint.rgb, uTint.a);
 gl_FragColor = vec4(c, uA); }`;
  let prog, loc = {};
  function setupGL(gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    ['aP', 'aN', 'aC', 'aE'].forEach(a => { loc[a] = gl.getAttribLocation(prog, a); });
    ['uVP', 'uM', 'uL', 'uTint', 'uA', 'uGray', 'uTime'].forEach(u => { loc[u] = gl.getUniformLocation(prog, u); });
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    const l = [-0.45, 0.82, 0.38], n = Math.hypot(...l); gl.uniform3f(loc.uL, l[0] / n, l[1] / n, l[2] / n);
    return true;
  }
  function mesh(data) {
    const gl = R.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { b, n: data.length / 10 };
  }
  function drawMesh(m, M, o = {}) {
    const gl = R.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
    const st = 40;
    gl.enableVertexAttribArray(loc.aP); gl.vertexAttribPointer(loc.aP, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(loc.aN); gl.vertexAttribPointer(loc.aN, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(loc.aC); gl.vertexAttribPointer(loc.aC, 3, gl.FLOAT, false, st, 24);
    gl.enableVertexAttribArray(loc.aE); gl.vertexAttribPointer(loc.aE, 1, gl.FLOAT, false, st, 36);
    gl.uniformMatrix4fv(loc.uM, false, M);
    const t = o.tint || [0, 0, 0, 0];
    gl.uniform4f(loc.uTint, t[0], t[1], t[2], t[3]);
    gl.uniform1f(loc.uA, o.alpha === undefined ? 1 : o.alpha);
    gl.uniform1f(loc.uGray, o.gray || 0);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
  }
  const unitMeshes = new Map();
  function unitMesh(key, team, acc) {
    const k = `${key}|${team}|${acc}`;
    let m = unitMeshes.get(k);
    if (!m) { m = mesh(FE.GL3D.buildUnit(key, team, acc)); unitMeshes.set(k, m); }
    return m;
  }
  let terrainMesh = null, terrainKey = '', discMesh = null;
  function terrain() {
    const run = G.run, key = run ? `${run.terrain}|${run.act}` : 'none';
    if (terrainMesh && terrainKey === key) return terrainMesh;
    const at = (c, r) => (c < 0 || r < 0 || c >= N || r >= N) ? '.' : (run ? FE.Engine.terrainAt(run.terrain, c, r) : '.');
    if (terrainMesh) R.gl.deleteBuffer(terrainMesh.b);
    terrainMesh = mesh(FE.GL3D.buildTerrain(at, N, N, run ? run.act : 1, P0));
    terrainKey = key;
    return terrainMesh;
  }

  /* ---------------- Câmera ---------------- */
  const M4 = () => FE.GL3D.M4;
  function updateCamera(dt) {
    const k = 1 - Math.pow(0.0015, dt);
    cam.yaw += (cam.tyaw - cam.yaw) * k; cam.pitch += (cam.tpitch - cam.pitch) * k; cam.dist += (cam.tdist - cam.dist) * k;
    const shake = G.combat && G.run && G.run.phase === 'COMBAT' && FE.settings.fx !== false ? G.combat.fx.shake : 0;
    const tx = 5.9 + (shake ? (Math.random() - 0.5) * shake * 0.012 : 0), tz = 5.9 + (shake ? (Math.random() - 0.5) * shake * 0.012 : 0), ty = -0.1;
    const cp = Math.cos(cam.pitch);
    cam.eye = [tx + Math.sin(cam.yaw) * cam.dist * cp, ty + Math.sin(cam.pitch) * cam.dist, tz + Math.cos(cam.yaw) * cam.dist * cp];
    cam.target = [tx, ty, tz];
    const aspect = R.w / Math.max(1, R.h);
    const P = M4().perspective(FOV, aspect, 0.5, 80), V = M4().lookAt(cam.eye, cam.target, [0, 1, 0]);
    cam.vp = M4().mul(P, V);
    cam.aspect = aspect;
  }
  /* mundo → tela (px) + pixels por unidade naquela profundidade */
  function project(x, y, z) {
    const m = cam.vp;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.01) return null;
    return { x: (cx / cw * 0.5 + 0.5) * R.w, y: (1 - (cy / cw * 0.5 + 0.5)) * R.h, ppu: (R.h / 2) * cam.f / cw };
  }
  R.project = (x, y, z = 0) => project(x, z, y);
  const elev = (t) => FE.GL3D.elev(t);
  const groundAt = (x, y) => {
    if (!G.run) return 0;
    const t = FE.Engine.terrainAt(G.run.terrain, Math.floor(x), Math.floor(y));
    return t === 'B' ? 0.07 : elev(t);
  };

  /* Seleção: raio da câmera até o chão (corrige blocos elevados) */
  R.tileAt = function (clientX, clientY) {
    const rect = R.canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const out = { col: -1, row: -1, px, py, wx: -1, wy: -1, inside: false };
    if (!cam.vp) return out;
    const nx = px / rect.width * 2 - 1, ny = 1 - py / rect.height * 2;
    const e = cam.eye, t = cam.target;
    let fx = t[0] - e[0], fy = t[1] - e[1], fz = t[2] - e[2]; let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0; l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    const th = 1 / cam.f;
    const dx = fx + rx * nx * th * cam.aspect + ux * ny * th, dy = fy + ry * nx * th * cam.aspect + uy * ny * th, dz = fz + rz * nx * th * cam.aspect + uz * ny * th;
    if (dy >= -1e-4) return out;
    const hit = (h) => { const k = (h - e[1]) / dy; return [e[0] + dx * k, e[2] + dz * k]; };
    let [wx, wz] = hit(0);
    for (let i = 0; i < 2; i++) {
      const tt = G.run ? FE.Engine.terrainAt(G.run.terrain, Math.floor(wx), Math.floor(wz)) : '.';
      const h = tt === 'B' ? 0.07 : elev(tt);
      if (Math.abs(h) < 1e-3) break;
      [wx, wz] = hit(h);
    }
    out.wx = wx; out.wy = wz; out.col = Math.floor(wx); out.row = Math.floor(wz);
    out.inside = out.col >= 0 && out.row >= 0 && out.col < N && out.row < N;
    return out;
  };

  /* ---------------- Controles da câmera ---------------- */
  const ICON = {
    left: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4', right: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
    tilt: 'M3 17l9-10l9 10M7 17h10', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', home: 'M4 11l8-7l8 7v9h-5v-6H9v6H4z'
  };
  function buildCamUI(container) {
    const bar = document.createElement('div');
    bar.className = 'cam-ctrl';
    const btn = (id, label, d) => `<button type="button" data-cam="${id}" aria-label="${label}" data-tip="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg></button>`;
    bar.innerHTML = btn('left', 'Girar para a esquerda (←)', ICON.left) + btn('right', 'Girar para a direita (→)', ICON.right) +
      btn('tilt', 'Inclinar a câmera (↑ ↓)', ICON.tilt) + btn('in', 'Aproximar (roda do mouse / +)', ICON.plus) + btn('out', 'Afastar (roda do mouse / −)', ICON.minus) + btn('home', 'Câmera padrão', ICON.home);
    bar.addEventListener('click', (e) => { const b = e.target.closest('[data-cam]'); if (b) R.camAction(b.dataset.cam); });
    container.appendChild(bar);
    const hint = document.createElement('div');
    hint.className = 'cam-hint';
    hint.textContent = 'Botão direito + arrastar para girar • roda do mouse para zoom';
    container.appendChild(hint);
  }
  R.camAction = function (a) {
    const step = Math.PI / 4;
    if (a === 'left') cam.tyaw -= step;
    else if (a === 'right') cam.tyaw += step;
    else if (a === 'tilt') cam.tpitch = cam.tpitch > 1.15 ? 0.6 : cam.tpitch > 0.8 ? 1.3 : 0.92;
    else if (a === 'up') cam.tpitch = Math.min(1.42, cam.tpitch + 0.12);
    else if (a === 'down') cam.tpitch = Math.max(0.42, cam.tpitch - 0.12);
    else if (a === 'in') cam.tdist = Math.max(10, cam.tdist - 2.5);
    else if (a === 'out') cam.tdist = Math.min(32, cam.tdist + 2.5);
    else if (a === 'home') { const turns = Math.round((cam.tyaw - CAM0.yaw) / (Math.PI * 2)); cam.tyaw = CAM0.yaw + turns * Math.PI * 2; cam.tpitch = CAM0.pitch; cam.tdist = CAM0.dist; }
  };
  function bindCamInput(el) {
    let orbit = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault(); e.stopImmediatePropagation();
        orbit = { x: e.clientX, y: e.clientY, yaw: cam.tyaw, pitch: cam.tpitch, id: e.pointerId };
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignora */ }
        el.classList.add('orbiting');
      }
    }, true);
    el.addEventListener('pointermove', (e) => {
      if (!orbit) return;
      cam.tyaw = orbit.yaw - (e.clientX - orbit.x) * 0.008;
      cam.tpitch = Math.max(0.42, Math.min(1.42, orbit.pitch + (e.clientY - orbit.y) * 0.006));
      cam.yaw = cam.tyaw; cam.pitch = cam.tpitch;
    });
    const end = () => { orbit = null; el.classList.remove('orbiting'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); cam.tdist = Math.max(10, Math.min(32, cam.tdist + Math.sign(e.deltaY) * 1.4)); }, { passive: false });
  }

  /* ---------------- Desenho ---------------- */
  let lastT = 0;
  const prevPos = new WeakMap(), faceYaw = new WeakMap();
  R.draw = function () {
    const now = performance.now() / 1000, dt = Math.min(0.05, lastT ? now - lastT : 0.016); lastT = now;
    updateCamera(dt);
    const gl = R.gl, ctx = R.ctx;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.uVP, false, cam.vp);
    gl.uniform1f(loc.uTime, now);
    gl.depthMask(true);
    drawMesh(terrain(), FE.GL3D.M4.identity());
    ctx.clearRect(0, 0, R.w, R.h);
    if (!G.run) return;
    const run = G.run, editing = G.canEdit();
    const drag = FE.UI && FE.UI.drag && FE.UI.drag.moved ? FE.UI.drag : null;
    const items = collect(run, editing, drag);

    // sombras (discos escuros no chão)
    if (!discMesh) discMesh = mesh(FE.GL3D.buildDisc());
    gl.depthMask(false);
    for (const it of items) {
      const g = groundAt(it.x, it.y) + 0.012, s = (it.isBoss ? 0.62 : it.isSummon ? 0.24 : 0.3) * US;
      drawMesh(discMesh, FE.GL3D.M4.model(it.x, g, it.y, 0, s, 1), { tint: [0.08, 0.1, 0.16, 1], alpha: 0.22 });
    }
    gl.depthMask(true);
    // bonecos
    for (const it of items) {
      const key = FE.Art.keyOf(it);
      const acc = it.team === 'p' || it.isSummon ? (it.color || '#94a3b8') : (D.ARCHETYPES[it.archetypeId] ? D.ARCHETYPES[it.archetypeId].color : '#F28C6B');
      const m = unitMesh(key, it.team, acc);
      const yaw = facing(it);
      const scale = (it.isBoss ? 0.95 : it.isElite ? 1.12 : it.isSummon ? 0.85 : 1) * US;
      const g = groundAt(it.x, it.y) + (it.lifted ? 0.35 : 0) + (it.bob || 0);
      const fl = it.flash > 0 ? Math.min(0.7, it.flash * 6) : 0;
      drawMesh(m, FE.GL3D.M4.model(it.x, g, it.y, yaw, scale), { tint: [1, 1, 1, fl], alpha: it.faded ? 0.55 : 1 });
    }
    // fantasmas
    if (run.phase === 'COMBAT' && G.combat) {
      gl.depthMask(false);
      for (const gh of G.combat.fx.ghosts) {
        const k = Math.max(0, gh.life / gh.maxLife);
        const m = unitMesh(FE.Art.keyOf(gh), gh.team === 'player' ? 'p' : 'e', '#cbd5e1');
        drawMesh(m, FE.GL3D.M4.model(gh.x, groundAt(gh.x, gh.y) + (1 - k) * 0.6, gh.y, gh.team === 'player' ? Math.PI : 0, (gh.isBoss ? 0.95 : 1) * US), { gray: 1, alpha: k * 0.45 });
      }
      gl.depthMask(true);
    }
    // camada 2D
    overlay(ctx, run, editing, drag, items);
    if (run.phase === 'COMBAT' && G.combat) fx(G.combat.fx);
  };

  function collect(run, editing, drag) {
    const items = [];
    if (run.phase !== 'COMBAT' || !G.combat) {
      for (const e of run.enemies) {
        items.push({ ref: e, x: e.col + 0.5, y: e.row + 0.5, team: 'e', archetypeId: e.archetypeId, color: e.color, symbol: e.symbol, level: e.level, isBoss: e.isBoss, isElite: e.isElite, affixes: e.affixes, elements: e.elements,
          hp: 1, displayHp: 1, maxHp: 1, shield: 0, mana: 0, maxMana: 1, preview: true, selected: FE.UI && FE.UI.inspectEnemyId === e.id });
      }
      const sel = G.selectedId;
      for (const u of run.board) {
        if (drag && drag.id === u.id) continue;
        const s = R.statsCache.get(u.id) || G.statsOf(u);
        items.push({ ref: u, x: u.col + 0.5, y: u.row + 0.5, team: 'p', archetypeId: u.archetypeId, color: D.ARCHETYPES[u.archetypeId].color, level: u.level, elements: u.elements,
          items: u.items.length, hp: s.maxHp, displayHp: s.maxHp, maxHp: s.maxHp, shield: s.initialShield, mana: s.startMana, maxMana: s.maxMana, range: s.range,
          selected: sel === u.id, evo: u.evoPoints > 0, quality: u.quality || 0, ownerColor: G.isCoop() ? G.ownerOf(u).color : null, faded: G.isCoop() && !G.isMine(u) });
      }
      if (drag && drag.fromBoard && R.hover && R.hover.inside) {
        const u = G.find(drag.id);
        if (u) items.push({ ref: drag, x: R.hover.wx, y: R.hover.wy, team: 'p', archetypeId: u.archetypeId, color: D.ARCHETYPES[u.archetypeId].color, level: u.level, hp: 1, displayHp: 1, maxHp: 1, shield: 0, mana: 0, maxMana: 1, selected: true, lifted: true });
      }
    } else {
      const t = performance.now() / 1000;
      for (const u of G.combat.units) {
        if (u.dead) continue;
        const ru = u.rosterId ? G.find(u.rosterId) : (u.owner && u.owner.rosterId ? G.find(u.owner.rosterId) : null);
        const x = u.x + u.lungeX, y = u.y + u.lungeY;
        const pp = prevPos.get(u); const moving = pp && Math.hypot(u.x - pp[0], u.y - pp[1]) > 0.002;
        items.push({ ref: u, x, y, team: u.team === 'player' ? 'p' : 'e', color: u.color, symbol: u.symbol, archetypeId: u.archetypeId, level: u.level, isBoss: u.isBoss, isElite: u.isElite, affixes: u.affixes,
          elements: u.elements, items: ru ? ru.items.length : 0, hp: u.hp, displayHp: u.displayHp, maxHp: u.stats.maxHp, shield: u.shield, mana: u.mana, maxMana: u.stats.maxMana,
          isSummon: u.isSummon, quality: ru ? ru.quality || 0 : 0, selected: u.rosterId && G.selectedId === u.rosterId, stunned: u.stun > 0, chilled: u.chill > 0, burning: u.burn > 0, flash: u.flash || 0,
          ownerColor: G.isCoop() && u.team === 'player' && ru ? G.ownerOf(ru).color : null, bob: moving ? Math.abs(Math.sin(t * 13 + (u.x + u.y) * 3)) * 0.06 : 0,
          dx: pp ? u.x - pp[0] : 0, dy: pp ? u.y - pp[1] : 0, target: u.target });
        prevPos.set(u, [u.x, u.y]);
      }
    }
    return items;
  }
  function facing(it) {
    const def = it.team === 'p' ? Math.PI : 0;
    let yaw = faceYaw.get(it.ref);
    let want = yaw === undefined ? def : yaw;
    if (it.target && !it.target.dead) want = Math.atan2(it.target.x - it.x, it.target.y - it.y);
    else if (Math.hypot(it.dx || 0, it.dy || 0) > 0.002) want = Math.atan2(it.dx, it.dy);
    if (yaw === undefined) yaw = want;
    let d = want - yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    yaw += d * 0.25;
    if (it.ref) faceYaw.set(it.ref, yaw);
    return yaw;
  }

  /* ---------------- Camada 2D: destaques, barras, efeitos ---------------- */
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }
  function tileQuad(c, r) {
    const t = G.run ? FE.Engine.terrainAt(G.run.terrain, c, r) : '.', h = (t === 'B' ? 0.07 : elev(t)) + 0.01;
    const pts = [project(c, h, r), project(c + 1, h, r), project(c + 1, h, r + 1), project(c, h, r + 1)];
    return pts.every(Boolean) ? pts : null;
  }
  function ringPts(x, y, rad, h) {
    const pts = [];
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; const p = project(x + Math.cos(a) * rad, h, y + Math.sin(a) * rad); if (!p) return null; pts.push(p); }
    return pts;
  }
  function overlay(ctx, run, editing, drag, items) {
    if (editing && R.hover && R.hover.inside) {
      const { col, row } = R.hover, mine = row >= P0;
      const bad = !mine || FE.Engine.tileBlocked(run.terrain, col, row);
      const q = tileQuad(col, row);
      if (q && (mine || drag)) {
        poly(ctx, q); ctx.fillStyle = bad ? 'rgba(217,72,59,.28)' : drag ? 'rgba(19,137,124,.32)' : 'rgba(242,179,61,.30)'; ctx.fill();
        ctx.strokeStyle = bad ? '#D9483B' : drag ? '#13897C' : '#F2B33D'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    // raio de alcance da unidade selecionada (preparação)
    const sel = items.find(i => i.selected && i.team === 'p' && i.range && !i.lifted);
    if (sel && editing) {
      const pts = ringPts(sel.x, sel.y, sel.range, groundAt(sel.x, sel.y) + 0.02);
      if (pts) { ctx.save(); poly(ctx, pts); ctx.strokeStyle = 'rgba(242,179,61,.85)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore(); }
    }
    // ordem: de longe para perto (pela profundidade)
    const proj = items.map(it => {
      const g = groundAt(it.x, it.y);
      const sc = (it.isBoss ? 0.95 : it.isElite ? 1.12 : it.isSummon ? 0.85 : 1) * US;
      const H = (it.isBoss ? 1.7 : it.isSummon ? 0.62 : 1.0) * sc;
      return { it, foot: project(it.x, g + (it.lifted ? 0.35 : 0), it.y), head: project(it.x, g + H + (it.bob || 0), it.y), g };
    }).filter(p => p.foot && p.head).sort((a, b) => a.foot.ppu - b.foot.ppu);
    const t = performance.now() / 1000;
    for (const { it, foot, head, g } of proj) {
      const k = foot.ppu / 52;
      if (it.selected || it.ownerColor) {
        const pts = ringPts(it.x, it.y, it.isBoss ? 0.85 : 0.46, g + 0.02);
        if (pts) { ctx.save(); poly(ctx, pts); ctx.strokeStyle = it.selected ? '#F2B33D' : it.ownerColor; ctx.lineWidth = 2.6; if (it.selected) { ctx.shadowColor = 'rgba(242,179,61,.8)'; ctx.shadowBlur = 8; } ctx.stroke(); ctx.restore(); }
      }
      if (it.burning || it.chilled) {
        const pts = ringPts(it.x, it.y, 0.36, g + 0.03);
        if (pts) { ctx.save(); poly(ctx, pts); ctx.strokeStyle = it.burning ? `rgba(255,138,61,${0.6 + 0.3 * Math.sin(t * 18)})` : 'rgba(125,211,252,.95)'; ctx.lineWidth = 2.4; ctx.stroke(); ctx.restore(); }
      }
      if (it.stunned) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.09; ctx.fillStyle = '#F2B33D'; ctx.beginPath(); ctx.arc(head.x + Math.cos(a) * 10 * k, head.y + 4 * k + Math.sin(a) * 3 * k, 2.6, 0, Math.PI * 2); ctx.fill(); }
      const els = Object.keys(it.elements || {}).filter(e => it.elements[e] > 0);
      els.forEach((e, i) => { const ox = foot.x + (i - (els.length - 1) / 2) * 8 * k, oy = foot.y + 9 * k; ctx.fillStyle = D.ELEMENTS[e].color; ctx.beginPath(); ctx.arc(ox, oy, 3.2 * k, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); });
      bars(ctx, it, head.x, head.y - 4 * k, k);
    }
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function bars(ctx, u, x, y, k) {
    k = Math.max(0.55, Math.min(1.6, k));
    const boss = u.isBoss, summon = u.isSummon;
    if (u.preview && !u.selected && u.team === 'e' && !boss && !u.isElite) { badge(ctx, u, x, y, k); return; }
    const bw = (boss ? 64 : summon ? 22 : 34) * k, bh = (summon ? 3 : 4.6) * k, bx = x - bw / 2, by = y - 8 * k;
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(30,36,51,.18)'; ctx.lineWidth = 1;
    rrect(ctx, bx - 2, by - 2, bw + 4, bh + 4 + (summon ? 0 : 2.6 * k), 4); ctx.fill(); ctx.stroke();
    const ratio = Math.max(0, Math.min(1, u.hp / u.maxHp)), disp = Math.max(0, Math.min(1, u.displayHp / u.maxHp));
    ctx.fillStyle = '#EDF1F6'; rrect(ctx, bx, by, bw, bh, 2); ctx.fill();
    ctx.fillStyle = 'rgba(242,179,61,.75)'; rrect(ctx, bx, by, bw * disp, bh, 2); ctx.fill();
    ctx.fillStyle = u.team === 'p' ? '#13897C' : '#D9483B'; rrect(ctx, bx, by, bw * ratio, bh, 2); ctx.fill();
    if (u.shield > 0) { ctx.fillStyle = '#7DC4F5'; rrect(ctx, bx, by, bw * Math.min(1, u.shield / u.maxHp), 2, 1); ctx.fill(); }
    if (!summon) {
      ctx.fillStyle = '#E8EEF5'; ctx.fillRect(bx, by + bh + 1, bw, 1.6 * k);
      ctx.fillStyle = '#5B8DEF'; ctx.fillRect(bx, by + bh + 1, bw * Math.max(0, Math.min(1, u.mana / u.maxMana)), 1.6 * k);
      badge(ctx, u, bx + bw + 7 * k, by + bh / 2, k);
    }
    if (u.evo) { ctx.fillStyle = '#6B4FA0'; ctx.beginPath(); ctx.arc(bx - 6 * k, by + bh / 2, 3.2 * k, 0, Math.PI * 2); ctx.fill(); }
  }
  function badge(ctx, u, x, y, k) {
    const r = 6.6 * k;
    ctx.fillStyle = u.isBoss ? '#D9483B' : u.quality === 2 ? '#C98A12' : u.quality === 1 ? '#3B6FD6' : '#1E2433';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(9 * k)}px Nunito, Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(u.level), x, y + 0.5);
  }

  function fx(f) {
    const ctx = R.ctx, BODY = 0.45;
    const at = (x, y, z = BODY) => project(x, groundAt(x, y) + z, y);
    for (const s of f.shockwaves) {
      const pts = ringPts(s.x, s.y, s.radius, groundAt(s.x, s.y) + 0.05); if (!pts) continue;
      ctx.save(); poly(ctx, pts); ctx.strokeStyle = s.color; ctx.globalAlpha = Math.max(0, s.life / s.maxLife) * 0.9; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
    for (const b of f.beams) {
      const a = at(b.x1, b.y1), c = at(b.x2, b.y2); if (!a || !c) continue;
      ctx.save(); ctx.strokeStyle = b.color; ctx.globalAlpha = Math.max(0, b.life / b.maxLife); ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.shadowColor = b.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke(); ctx.restore();
    }
    for (const p of f.projectiles) {
      const a = at(p.x, p.y); if (!a) continue;
      if (p.px !== undefined) {
        const dx = p.x - p.px, dy = p.y - p.py, len = Math.hypot(dx, dy) || 1, tl = at(p.x - dx / len * 0.5, p.y - dy / len * 0.5);
        if (tl) { ctx.save(); ctx.strokeStyle = p.crit ? '#F2B33D' : p.color; ctx.globalAlpha = 0.6; ctx.lineWidth = p.crit ? 4 : 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tl.x, tl.y); ctx.stroke(); ctx.restore(); }
      }
      ctx.fillStyle = p.crit ? '#F2B33D' : '#fff'; ctx.strokeStyle = 'rgba(30,36,51,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(a.x, a.y, (p.crit ? 4.6 : 3.3) * Math.max(0.8, a.ppu / 52), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const sl of f.slashes) {
      const kk = Math.max(0, sl.life / sl.maxLife), a = at(sl.x, sl.y, 0.4); if (!a) continue;
      ctx.save(); ctx.strokeStyle = sl.color; ctx.globalAlpha = kk; ctx.lineWidth = sl.big ? 4 : 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(a.x, a.y, a.ppu * (sl.big ? 0.42 : 0.33), a.ppu * (sl.big ? 0.28 : 0.22), 0, sl.a - 1.1 + (1 - kk) * 0.6, sl.a + 0.2 + (1 - kk) * 0.6); ctx.stroke(); ctx.restore();
    }
    for (const p of f.particles) {
      const a = at(p.x, p.y); if (!a) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(a.x, a.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of f.texts) {
      if (!t._b) t._b = { x: t.x, y: t.y };
      const a = at(t._b.x, t._b.y, 1.15); if (!a) continue;
      const y = a.y - (t._b.y - t.y) * a.ppu * 1.1, k = Math.max(0.7, Math.min(1.5, a.ppu / 52));
      ctx.save(); ctx.globalAlpha = Math.min(1, t.life * 1.4);
      ctx.font = `800 ${Math.round(13 * k * t.scale)}px Fredoka, Nunito, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#FFFFFF'; ctx.lineJoin = 'round'; ctx.strokeText(t.text, a.x, y);
      ctx.fillStyle = readable(t.color); ctx.fillText(t.text, a.x, y); ctx.restore();
    }
  }
  function readable(c) {
    const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#1E2433';
    const n = parseInt(m[1], 16), lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
    if (lum > 235) return '#1E2433';
    if (lum > 170) { const f = 0.6; return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`; }
    return c;
  }
})(window);
