/* ==========================================================================
   FORJA ELEMENTAL 4.1 — gl3d.js
   Mini-motor 3D próprio (WebGL 1, sem dependências):
   • matemática de matrizes (coluna-major), câmera em perspectiva;
   • construtor de malhas low-poly (caixa, cilindro, cone, esfera, toro)
     com cor e brilho próprio (emissivo) por vértice;
   • modelos: blocos de terreno e bonecos 3D de cada classe, invocação e chefe.
   Unidades do mundo: 1 = uma casa. X = coluna, Z = linha, Y = para cima.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE;

  /* ---------------- Matemática ---------------- */
  const M4 = {
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    },
    lookAt(e, c, up) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    model(tx, ty, tz, yaw, s, sy) {
      const c = Math.cos(yaw), n = Math.sin(yaw), y = sy === undefined ? s : sy;
      return new Float32Array([c * s, 0, -n * s, 0, 0, y, 0, 0, n * s, 0, c * s, 0, tx, ty, tz, 1]);
    },
    identity() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    /* v5.0: rotação de uma parte em volta do seu pivô: T(p)·Ry·Rx·Rz·T(-p) */
    joint(px, py, pz, rx, rz, ry = 0, dy = 0) {
      const cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz), cy = Math.cos(ry), sy = Math.sin(ry);
      // R = Ry * Rx * Rz
      const a00 = cz, a01 = -sz, a02 = 0, a10 = cx * sz, a11 = cx * cz, a12 = -sx, a20 = sx * sz, a21 = sx * cz, a22 = cx;
      const r00 = cy * a00 + sy * a20, r01 = cy * a01 + sy * a21, r02 = cy * a02 + sy * a22;
      const r10 = a10, r11 = a11, r12 = a12;
      const r20 = -sy * a00 + cy * a20, r21 = -sy * a01 + cy * a21, r22 = -sy * a02 + cy * a22;
      const tx = px - (r00 * px + r01 * py + r02 * pz), ty = py + dy - (r10 * px + r11 * py + r12 * pz), tz = pz - (r20 * px + r21 * py + r22 * pz);
      return new Float32Array([r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, tx, ty, tz, 1]);
    }
  };

  const hex = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    if (!m) return [0.6, 0.6, 0.65];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const shade = (h, f) => { const c = hex(h); return f < 0 ? c.map(v => v * (1 + f)) : c.map(v => v + (1 - v) * f); };

  /* ---------------- Construtor de malhas ----------------
     Vértice: posição(3) normal(3) cor(3) emissivo(1) = 10 floats */
  class Builder {
    constructor() { this.v = []; this.parts = null; this.cur = 'torso'; this.auto = null; }
    /* v5.0: malha dividida em partes (pernas, braços, cabeça...) para animar */
    rig() { this.parts = {}; return this; }
    part(name) { this.cur = name; this.auto = null; return this; }
    pick(t) { if (this.auto) this.cur = this.auto(t); }
    tri(p0, p1, p2, n0, n1, n2, col, em) {
      const v = this.parts ? (this.parts[this.cur] || (this.parts[this.cur] = [])) : this.v;
      v.push(p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], col[0], col[1], col[2], em,
        p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], col[0], col[1], col[2], em,
        p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], col[0], col[1], col[2], em);
    }
    /* transforma ponto/normal: escala → rotX → rotZ → rotY → translação */
    xf(t) {
      const sx = t.sx ?? t.s ?? 1, sy = t.sy ?? t.s ?? 1, sz = t.sz ?? t.s ?? 1;
      const cx = Math.cos(t.rx || 0), nx = Math.sin(t.rx || 0), cz = Math.cos(t.rz || 0), nz = Math.sin(t.rz || 0), cy = Math.cos(t.ry || 0), ny = Math.sin(t.ry || 0);
      const rot = (x, y, z) => {
        let y1 = y * cx - z * nx, z1 = y * nx + z * cx; y = y1; z = z1;
        let x1 = x * cz - y * nz; y1 = x * nz + y * cz; x = x1; y = y1;
        x1 = x * cy + z * ny; z1 = -x * ny + z * cy;
        return [x1, y, z1];
      };
      return {
        p: (x, y, z) => { const r = rot(x * sx, y * sy, z * sz); return [r[0] + (t.x || 0), r[1] + (t.y || 0), r[2] + (t.z || 0)]; },
        n: (x, y, z) => { const r = rot(x / sx, y / sy, z / sz); const l = Math.hypot(r[0], r[1], r[2]) || 1; return [r[0] / l, r[1] / l, r[2] / l]; }
      };
    }
    quad(T, a, b, c, d, n, col, em) {
      const N = T.n(...n), A = T.p(...a), B = T.p(...b), C = T.p(...c), D = T.p(...d);
      this.tri(A, B, C, N, N, N, col, em); this.tri(A, C, D, N, N, N, col, em);
    }
    /* caixa centrada (lado 1) */
    box(t, col, em = 0, topCol) {
      this.pick(t);
      const T = this.xf(t), h = 0.5;
      const top = topCol || col;
      this.quad(T, [-h, h, -h], [h, h, -h], [h, h, h], [-h, h, h], [0, 1, 0], top, em);
      this.quad(T, [-h, -h, -h], [-h, -h, h], [h, -h, h], [h, -h, -h], [0, -1, 0], col, em);
      this.quad(T, [-h, -h, h], [-h, h, h], [h, h, h], [h, -h, h], [0, 0, 1], col, em);
      this.quad(T, [-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], [0, 0, -1], col, em);
      this.quad(T, [h, -h, -h], [h, -h, h], [h, h, h], [h, h, -h], [1, 0, 0], col, em);
      this.quad(T, [-h, -h, -h], [-h, h, -h], [-h, h, h], [-h, -h, h], [-1, 0, 0], col, em);
    }
    /* cilindro de raio 1, y de 0 a 1 */
    cyl(t, col, em = 0, seg = 10, caps = true) {
      this.pick(t);
      const T = this.xf(t);
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const P = [T.p(c0, 0, s0), T.p(c1, 0, s1), T.p(c1, 1, s1), T.p(c0, 1, s0)];
        const N0 = T.n(c0, 0, s0), N1 = T.n(c1, 0, s1);
        this.tri(P[0], P[1], P[2], N0, N1, N1, col, em); this.tri(P[0], P[2], P[3], N0, N1, N0, col, em);
        if (caps) {
          const up = T.n(0, 1, 0), dn = T.n(0, -1, 0);
          this.tri(T.p(0, 1, 0), P[3], P[2], up, up, up, col, em);
          this.tri(T.p(0, 0, 0), P[1], P[0], dn, dn, dn, col, em);
        }
      }
    }
    /* cone de raio 1, base em y=0, ponta em y=1 */
    cone(t, col, em = 0, seg = 10) {
      this.pick(t);
      const T = this.xf(t), apex = T.p(0, 1, 0);
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
        const p0 = T.p(Math.cos(a0), 0, Math.sin(a0)), p1 = T.p(Math.cos(a1), 0, Math.sin(a1));
        const n0 = T.n(Math.cos(a0), 0.7, Math.sin(a0)), n1 = T.n(Math.cos(a1), 0.7, Math.sin(a1)), nm = T.n(Math.cos(am), 0.7, Math.sin(am));
        this.tri(p0, p1, apex, n0, n1, nm, col, em);
        const dn = T.n(0, -1, 0);
        this.tri(T.p(0, 0, 0), p1, p0, dn, dn, dn, col, em);
      }
    }
    /* esfera de raio 1 centrada */
    sphere(t, col, em = 0, lat = 6, lon = 10) {
      this.pick(t);
      const T = this.xf(t);
      const pt = (i, j) => { const th = i / lat * Math.PI, ph = j / lon * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
      for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
        const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
        const A = T.p(...a), B = T.p(...b), C = T.p(...c), D = T.p(...d);
        const nA = T.n(...a), nB = T.n(...b), nC = T.n(...c), nD = T.n(...d);
        if (i > 0) this.tri(A, B, D, nA, nB, nD, col, em);
        if (i < lat - 1) this.tri(B, C, D, nB, nC, nD, col, em);
      }
    }
    /* toro no plano XZ: raio maior 1, raio menor r */
    torus(t, col, r = 0.18, em = 0, seg = 16, side = 6) {
      this.pick(t);
      const T = this.xf(t);
      const pt = (i, j) => { const u = i / seg * Math.PI * 2, v = j / side * Math.PI * 2; const cx = Math.cos(u), sx = Math.sin(u); return { p: [(1 + r * Math.cos(v)) * cx, r * Math.sin(v), (1 + r * Math.cos(v)) * sx], n: [Math.cos(v) * cx, Math.sin(v), Math.cos(v) * sx] }; };
      for (let i = 0; i < seg; i++) for (let j = 0; j < side; j++) {
        const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
        this.tri(T.p(...a.p), T.p(...b.p), T.p(...c.p), T.n(...a.n), T.n(...b.n), T.n(...c.n), col, em);
        this.tri(T.p(...a.p), T.p(...c.p), T.p(...d.p), T.n(...a.n), T.n(...c.n), T.n(...d.n), col, em);
      }
    }
    /* cápsula vertical: raio r, de y0 a y1 */
    capsule(x, y0, y1, z, r, col, em = 0) {
      const au = this.auto; if (au) { this.cur = au({ x, y: (y0 + y1) / 2, z }); this.auto = null; }
      this.cyl({ x, y: y0 + r, z, sx: r, sz: r, sy: Math.max(0.001, y1 - y0 - 2 * r) }, col, em, 12, false);
      this.sphere({ x, y: y1 - r, z, s: r }, col, em, 5, 12);
      this.sphere({ x, y: y0 + r, z, s: r }, col, em, 5, 12);
      if (au) this.auto = au;
    }
    data() { return new Float32Array(this.v); }
    rigData(pivots) { const out = {}; for (const k in this.parts) out[k] = new Float32Array(this.parts[k]); return { parts: out, pivots }; }
  }

  /* ---------------- Paletas ---------------- */
  const ACT = {
    1: { grass: ['#8CC66A', '#84BE63'], dirt: '#A87A4E', dirt2: '#8E6440' },
    2: { grass: ['#D5BE70', '#CCB466'], dirt: '#B48650', dirt2: '#946B40' },
    3: { grass: ['#97A3D4', '#8D99CB'], dirt: '#6E6390', dirt2: '#574D78' },
    4: { grass: ['#B3A095', '#AA978C'], dirt: '#7A5446', dirt2: '#5F3F34' }
  };
  const ELEV = { M: 0.32, H: 0.14, W: -0.2, B: -0.2, L: -0.18, S: -0.07, R: -0.95, U: 0.5, O: -0.95, Z: 0.02 };
  const elev = (t) => ELEV[t] || 0;
  const hsh = (c, r, k = 0) => { let h = (c * 374761393 + r * 668265263 + k * 2147483647) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h % 1000) / 1000; };

  /* ---------------- Terreno ---------------- */
  function buildTerrain(terrainAt, cols, rows, act, playerRow) {
    const B = new Builder();
    const pal = ACT[Math.min(4, act || 1)] || ACT[1];
    const BOTTOM = -0.7;
    const grass = (c, r) => hex(pal.grass[(c + r) % 2]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const t = terrainAt(c, r), top = elev(t);
      const x = c + 0.5, z = r + 0.5;
      const jitter = (hsh(c, r, 7) - 0.5) * 0.04;
      let topCol, sideCol = hex(pal.dirt), em = 0, slab = true;
      switch (t) {
        case 'F': topCol = shade(pal.grass[0], -0.1); break;
        case 'M': topCol = hex('#B6AFA4'); sideCol = hex('#8F897F'); slab = false; break;
        case 'H': topCol = shade(pal.grass[0], 0.06); break;
        case 'W': case 'B': topCol = hex('#6FBDE6'); sideCol = hex('#4F94BD'); slab = false; break;
        case 'L': topCol = hex('#FF7A2E'); sideCol = hex('#B4441A'); em = 0.85; slab = false; break;
        case 'S': topCol = hex('#77A06F'); sideCol = hex('#59744F'); slab = false; break;
        case 'R': topCol = hex('#2E2836'); sideCol = hex('#4C4048'); slab = false; break;
        case 'O': topCol = hex('#251C1E'); sideCol = hex('#4A3A30'); slab = false; break;
        case 'U': topCol = hex(hsh(c, r, 1) > 0.5 ? '#D3CAB8' : '#CCC2AF'); sideCol = hex('#A2957F'); slab = false; break;
        case 'Z': topCol = hex('#BDB6AA'); sideCol = hex('#8F877B'); break;
        default: topCol = grass(c, r).map(v => v + jitter);
      }
      const yTop = top, yBot = Math.min(BOTTOM, yTop - 0.12);
      if (slab) {
        B.box({ x, z, y: yTop - 0.04, sx: 1, sz: 1, sy: 0.08 }, shade('#000000', 0).map((_, i) => topCol[i] * 0.82), 0, topCol);
        B.box({ x, z, y: (yTop - 0.08 + yBot) / 2, sx: 1, sz: 1, sy: (yTop - 0.08) - yBot }, sideCol);
      } else {
        B.box({ x, z, y: (yTop + yBot) / 2, sx: 1, sz: 1, sy: yTop - yBot }, sideCol, t === 'L' ? 0.5 : 0, topCol);
        if (t === 'L') B.box({ x, z, y: yTop + 0.002, sx: 0.999, sz: 0.999, sy: 0.003 }, topCol, em);
      }
      // decoração
      if (t === 'F') {
        [[-0.22, -0.18], [0.2, -0.05], [-0.02, 0.24]].forEach(([dx, dz], i) => {
          const tx = x + dx + (hsh(c, r, i) - 0.5) * 0.08, tz = z + dz + (hsh(c, r, i + 3) - 0.5) * 0.08, hh = 0.5 + hsh(c, r, i + 6) * 0.2;
          B.cyl({ x: tx, y: yTop, z: tz, sx: 0.045, sz: 0.045, sy: 0.12 }, hex('#7A5134'), 0, 6);
          B.cone({ x: tx, y: yTop + 0.1, z: tz, sx: 0.2, sz: 0.2, sy: hh * 0.62 }, hex('#2E8A4D'), 0, 7);
          B.cone({ x: tx, y: yTop + 0.1 + hh * 0.32, z: tz, sx: 0.15, sz: 0.15, sy: hh * 0.5 }, hex('#3BA05A'), 0, 7);
        });
      } else if (t === 'M') {
        B.cone({ x: x - 0.12, y: yTop, z: z - 0.05, sx: 0.36, sz: 0.36, sy: 0.62 }, hex('#9C958B'), 0, 6);
        B.cone({ x: x - 0.12, y: yTop + 0.42, z: z - 0.05, sx: 0.12, sz: 0.12, sy: 0.2 }, hex('#FFFFFF'), 0.15, 6);
        B.cone({ x: x + 0.22, y: yTop, z: z + 0.16, sx: 0.26, sz: 0.26, sy: 0.4 }, hex('#8A847A'), 0, 6);
        B.cone({ x: x + 0.22, y: yTop + 0.27, z: z + 0.16, sx: 0.09, sz: 0.09, sy: 0.13 }, hex('#FFFFFF'), 0.15, 6);
      } else if (t === 'H') {
        B.sphere({ x, y: yTop, z, sx: 0.36, sy: 0.12, sz: 0.36 }, shade(pal.grass[0], 0.1), 0, 4, 10);
      } else if (t === 'P') {
        B.cyl({ x, y: yTop, z, sx: 0.17, sz: 0.17, sy: 0.72 }, hex('#D8D0C1'), 0, 10);
        B.box({ x, y: yTop + 0.76, z, sx: 0.44, sz: 0.44, sy: 0.08 }, hex('#C7BEAD'));
        B.box({ x, y: yTop + 0.03, z, sx: 0.42, sz: 0.42, sy: 0.06 }, hex('#C7BEAD'));
      } else if (t === 'B') {
        const horiz = ['W', 'R', 'L'].includes(terrainAt(c - 1, r)) || ['W', 'R', 'L'].includes(terrainAt(c + 1, r));
        for (let i = 0; i < 5; i++) {
          const o = -0.4 + i * 0.2;
          B.box(horiz ? { x: x + o, y: 0.02, z, sx: 0.16, sy: 0.05, sz: 0.72 } : { x, y: 0.02, z: z + o, sx: 0.72, sy: 0.05, sz: 0.16 }, hex(i % 2 ? '#C48A50' : '#B97F47'));
        }
        const rail = horiz ? [[0, -0.38], [0, 0.38]] : [[-0.38, 0], [0.38, 0]];
        rail.forEach(([dx, dz]) => B.box(horiz ? { x, y: 0.12, z: z + dz, sx: 1, sy: 0.04, sz: 0.04 } : { x: x + dx, y: 0.12, z, sx: 0.04, sy: 0.04, sz: 1 }, hex('#7A5134')));
      } else if (t === 'W') {
        B.box({ x: x + (hsh(c, r, 2) - 0.5) * 0.4, y: yTop + 0.004, z: z + (hsh(c, r, 3) - 0.5) * 0.4, sx: 0.28, sy: 0.004, sz: 0.04 }, hex('#E8F6FF'), 0.6);
      } else if (t === 'L') {
        B.box({ x: x - 0.1, y: yTop + 0.006, z, sx: 0.5, sy: 0.006, sz: 0.05, ry: 0.6 }, hex('#FFE07A'), 1);
        B.box({ x: x + 0.15, y: yTop + 0.006, z: z + 0.15, sx: 0.35, sy: 0.006, sz: 0.04, ry: -0.4 }, hex('#FFE07A'), 1);
      } else if (t === 'S') {
        for (let i = 0; i < 3; i++) B.cyl({ x: x + (hsh(c, r, i) - 0.5) * 0.55, y: yTop, z: z + (hsh(c, r, i + 4) - 0.5) * 0.55, sx: 0.1, sz: 0.1, sy: 0.01 }, hex('#4E8A57'), 0, 8);
        B.sphere({ x: x + 0.12, y: yTop + 0.04, z: z - 0.1, s: 0.04 }, hex('#F7A8C9'), 0.2, 3, 6);
      } else if (t === 'U') {
        // plataforma de pedra: juntas no topo, ameias nas bordas e escada
        B.box({ x, y: yTop + 0.003, z, sx: 0.98, sy: 0.004, sz: 0.02 }, hex('#9F9583'));
        B.box({ x, y: yTop + 0.003, z, sx: 0.02, sy: 0.004, sz: 0.98 }, hex('#9F9583'));
        for (let k = 1; k < 4; k++) B.box({ x, y: yTop * k / 4, z: z - 0.501, sx: 1, sy: 0.015, sz: 0.004 }, hex('#8C806B'));
        const nb = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        nb.forEach(([dc, dr], i) => {
          const n = terrainAt(c + dc, r + dr);
          if (n === 'U') return;
          const ex = x + dc * 0.45, ez = z + dr * 0.45;
          if ((dr !== 0) && !ELEV[n] && hsh(c, r, 30 + i) > 0.35) {
            for (let k = 0; k < 3; k++) B.box({ x, y: yTop * (k + 0.5) / 4, z: z + dr * (0.6 + k * 0.12) - dr * 0.12, sx: 0.5, sy: yTop / 4, sz: 0.12 }, hex('#BFB4A0'));
          } else for (let k = -1; k <= 1; k += 2) B.box({ x: ex + (dr !== 0 ? k * 0.28 : 0), y: yTop + 0.06, z: ez + (dc !== 0 ? k * 0.28 : 0), sx: dc !== 0 ? 0.1 : 0.2, sy: 0.12, sz: dr !== 0 ? 0.1 : 0.2 }, hex('#B8AC96'));
        });
      } else if (t === 'T') {
        // alçapão de madeira escondido na grama
        B.box({ x, y: yTop + 0.012, z, sx: 0.6, sy: 0.02, sz: 0.6 }, hex('#8A5A33'));
        for (let k = -1; k <= 1; k++) B.box({ x: x + k * 0.2, y: yTop + 0.024, z, sx: 0.012, sy: 0.006, sz: 0.58 }, hex('#5C3A21'));
        B.torus({ x, y: yTop + 0.026, z: z + 0.18, s: 0.05 }, hex('#55505C'), 0.25, 0, 10, 4);
      } else if (t === 'O') {
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; B.sphere({ x: x + Math.cos(a) * 0.46, y: 0.0, z: z + Math.sin(a) * 0.46, sx: 0.1, sy: 0.05, sz: 0.1 }, hex('#7A6A5C'), 0, 3, 6); }
      } else if (t === 'Z') {
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) B.box({ x: x - 0.33 + i * 0.33, y: yTop + 0.004, z: z - 0.33 + j * 0.33, sx: 0.29, sy: 0.008, sz: 0.29 }, hex('#B9B2A6').map(v => v * (0.9 + hsh(c * 3 + i, r * 3 + j, 2) * 0.12)));
      } else if (t === '.' && hsh(c, r, 9) > 0.86) {
        B.sphere({ x: x + (hsh(c, r, 12) - 0.5) * 0.5, y: yTop, z: z + (hsh(c, r, 13) - 0.5) * 0.5, sx: 0.07, sy: 0.04, sz: 0.06 }, hex('#A39C92'), 0, 3, 6);
        B.sphere({ x: x + (hsh(c, r, 14) - 0.5) * 0.6, y: yTop + 0.02, z: z + (hsh(c, r, 15) - 0.5) * 0.6, s: 0.025 }, hex(hsh(c, r, 16) > 0.5 ? '#F7E36B' : '#FFFFFF'), 0.1, 3, 5);
      } else if (t === '.' && hsh(c, r, 9) > 0.7) {
        for (let i = 0; i < 3; i++) B.cone({ x: x + (hsh(c, r, i + 11) - 0.5) * 0.6 + i * 0.03, y: yTop, z: z + (hsh(c, r, i + 15) - 0.5) * 0.6, sx: 0.025, sz: 0.025, sy: 0.08 }, shade(pal.grass[0], -0.25), 0, 4);
      }
    }
    buildSurround(B, cols, rows, act);
    // fronteira entre os lados: traços brancos
    for (let c = 0; c < cols; c++) for (let i = 0; i < 2; i++) {
      const t = terrainAt(c, playerRow), t2 = terrainAt(c, playerRow - 1);
      const y = Math.max(elev(t), elev(t2)) + 0.012;
      B.box({ x: c + 0.18 + i * 0.5, y, z: playerRow, sx: 0.3, sy: 0.01, sz: 0.045 }, hex('#FFFFFF'), 0.7);
    }
    return B.data();
  }

  /* ---------------- Bonecos 3D ----------------
     Pés em (0,0,0), frente para +Z, altura ~0.9 casa. */
  const O = { metal: '#C9CED8', wood: '#8A5A33', gold: '#F2B33D', dark: '#2B2438', white: '#F4EFE4' };

  /* Easter egg GALINHA: galinha (comum) e galo (chefe, maior e com coroa) */
  /* ---------------- v5.0: estruturas (cidade, fortaleza, torre) ----------------
     Origem no centro da estrutura. Fortaleza e torre olham para +Z (o jogador);
     a cidade olha para -Z (o inimigo). */
  function buildStructure(kind) {
    const B = new Builder(), C = hex;
    const stone = C('#C9C0AE'), stoneD = C('#9F9583'), dark = C('#3A3440'), wood = C(O.wood);
    const crenels = (x0, x1, y, z, step = 0.26, sz = 0.16) => { for (let x = x0; x <= x1 + 1e-6; x += step) B.box({ x, y: y + 0.06, z, sx: 0.13, sy: 0.12, sz }, stone); };
    const roofHouse = (x, z, w, d, h, wall, roof) => {
      B.box({ x, y: h / 2, z, sx: w, sy: h, sz: d }, C(wall));
      B.box({ x, y: h + 0.02, z, sx: w * 0.74, sy: w * 0.74, sz: d * 1.06, rz: Math.PI / 4 }, C(roof));
      B.box({ x, y: 0.12, z: z - d / 2 - 0.005, sx: 0.12, sy: 0.24, sz: 0.01 }, wood);
      B.box({ x: x + w * 0.28, y: h * 0.62, z: z - d / 2 - 0.005, sx: 0.1, sy: 0.1, sz: 0.01 }, C('#FFE7A3'), 0.6);
    };
    const flag = (x, y, z, col, h = 0.55) => { B.cyl({ x, y, z, sx: 0.018, sz: 0.018, sy: h }, wood, 0, 5); B.box({ x: x + 0.13, y: y + h - 0.1, z, sx: 0.26, sy: 0.15, sz: 0.012 }, C(col), 0.15); };
    if (kind === 'cidade') {
      B.box({ y: 0.02, z: 0.35, sx: 4.6, sy: 0.04, sz: 1.9 }, C('#B9B2A6'));
      B.box({ y: 0.3, z: -0.45, sx: 4.2, sy: 0.6, sz: 0.22 }, stone);
      crenels(-2.0, 2.0, 0.6, -0.45);
      B.box({ y: 0.22, z: -0.565, sx: 0.5, sy: 0.44, sz: 0.02 }, dark);
      for (const sx of [-1, 1]) {
        B.cyl({ x: sx * 0.42, y: 0, z: -0.45, sx: 0.24, sz: 0.24, sy: 0.9 }, stoneD, 0, 10);
        B.cone({ x: sx * 0.42, y: 0.9, z: -0.45, sx: 0.3, sz: 0.3, sy: 0.38 }, C('#2E8C80'), 0, 10);
        B.cyl({ x: sx * 2.15, y: 0, z: -0.45, sx: 0.2, sz: 0.2, sy: 0.75 }, stoneD, 0, 10);
        B.cone({ x: sx * 2.15, y: 0.75, z: -0.45, sx: 0.25, sz: 0.25, sy: 0.32 }, C('#2E8C80'), 0, 10);
      }
      roofHouse(-1.5, 0.3, 0.6, 0.5, 0.42, '#EFE3C8', '#C4553E');
      roofHouse(-0.75, 0.6, 0.5, 0.45, 0.36, '#F3E9D6', '#3D6FB6');
      roofHouse(0.85, 0.35, 0.55, 0.5, 0.4, '#EBDDBF', '#C4553E');
      roofHouse(1.6, 0.7, 0.5, 0.45, 0.34, '#F3E9D6', '#C98A12');
      roofHouse(-1.6, 1.0, 0.5, 0.4, 0.32, '#EBDDBF', '#3D6FB6');
      B.box({ x: 0.1, y: 0.55, z: 0.75, sx: 0.4, sy: 1.1, sz: 0.4 }, C('#E9E1D0'));
      B.cone({ x: 0.1, y: 1.1, z: 0.75, sx: 0.32, sz: 0.32, sy: 0.55 }, C('#7A3B2E'), 0, 4);
      B.box({ x: 0.1, y: 0.85, z: 0.545, sx: 0.12, sy: 0.16, sz: 0.01 }, C('#F2B33D'), 0.5);
      flag(-0.42, 1.25, -0.45, '#13897C'); flag(0.42, 1.25, -0.45, '#13897C');
    } else if (kind === 'forte') {
      B.box({ y: 0.05, sx: 3.4, sy: 0.1, sz: 1.2 }, stoneD);
      B.box({ y: 0.75, z: -0.05, sx: 1.3, sy: 1.5, sz: 0.95 }, C('#7C7486'));
      crenels(-0.55, 0.55, 1.5, 0.38); crenels(-0.55, 0.55, 1.5, -0.48);
      B.box({ y: 0.32, z: 0.43, sx: 0.46, sy: 0.6, sz: 0.04 }, dark);
      for (let i = 0; i < 4; i++) B.box({ x: -0.16 + i * 0.105, y: 0.32, z: 0.455, sx: 0.025, sy: 0.58, sz: 0.012 }, C('#55505C'));
      B.box({ y: 1.05, z: 0.43, sx: 0.5, sy: 0.12, sz: 0.02 }, C('#D9483B'), 0.2);
      for (const sx of [-1, 1]) {
        B.box({ x: sx * 1.05, y: 0.42, z: 0.05, sx: 0.8, sy: 0.84, sz: 0.3 }, C('#857D90'));
        crenels(sx * 1.05 - 0.3, sx * 1.05 + 0.3, 0.84, 0.05, 0.2, 0.2);
        B.cyl({ x: sx * 1.5, y: 0.05, z: 0.05, sx: 0.28, sz: 0.28, sy: 1.15 }, C('#7C7486'), 0, 10);
        B.cone({ x: sx * 1.5, y: 1.2, z: 0.05, sx: 0.34, sz: 0.34, sy: 0.5 }, C('#A33A30'), 0, 10);
        B.box({ x: sx * 1.5, y: 0.75, z: 0.33, sx: 0.06, sy: 0.14, sz: 0.01 }, C('#FF8A3D'), 0.8);
      }
      flag(0, 1.5, -0.05, '#D9483B', 0.7);
    } else {
      B.cyl({ y: 0, sx: 0.32, sz: 0.32, sy: 0.08 }, stoneD, 0, 12);
      B.cyl({ y: 0.05, sx: 0.24, sz: 0.24, sy: 1.15 }, C('#857D90'), 0, 10);
      B.box({ y: 1.22, sx: 0.66, sy: 0.1, sz: 0.66 }, wood);
      for (const [x, z] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) B.cyl({ x, y: 1.27, z, sx: 0.025, sz: 0.025, sy: 0.38 }, wood, 0, 5);
      B.cone({ y: 1.62, sx: 0.48, sz: 0.48, sy: 0.32 }, C('#A33A30'), 0, 4);
      B.capsule(0, 1.27, 1.55, 0.05, 0.07, C('#8B2F3A'));
      B.box({ y: 0.7, z: 0.235, sx: 0.06, sy: 0.14, sz: 0.01 }, C('#FF8A3D'), 0.8);
    }
    return B.data();
  }

  /* ---------------- v5.0: entorno do tabuleiro (cenário além das casas) -------- */
  const RIM = {
    1: { ground: '#7DB65E', ground2: '#76AE58', cliff: '#8A6440' },
    2: { ground: '#D9C27A', ground2: '#D1B970', cliff: '#A47A4A' },
    3: { ground: '#8590C4', ground2: '#7D88BC', cliff: '#5C5280' },
    4: { ground: '#9E8C82', ground2: '#958479', cliff: '#5F3F34' }
  };
  function buildSurround(B, cols, rows, act) {
    const pal = RIM[Math.min(4, act || 1)] || RIM[1], E = 4;
    const tree = (x, z, h) => { B.cyl({ x, y: -0.06, z, sx: 0.06, sz: 0.06, sy: 0.25 }, hex('#7A5134'), 0, 6); B.cone({ x, y: 0.12, z, sx: 0.32, sz: 0.32, sy: h * 0.6 }, hex('#2E8A4D'), 0, 7); B.cone({ x, y: 0.12 + h * 0.3, z, sx: 0.24, sz: 0.24, sy: h * 0.5 }, hex('#3BA05A'), 0, 7); };
    const round = (x, z, h) => { B.cyl({ x, y: -0.06, z, sx: 0.06, sz: 0.06, sy: 0.3 }, hex('#7A5134'), 0, 6); B.sphere({ x, y: 0.3 + h * 0.25, z, s: 0.3 + h * 0.1 }, hex('#4FA45A'), 0, 5, 9); };
    const rock = (x, z, s, col) => B.sphere({ x, y: -0.06, z, sx: s, sy: s * 0.7, sz: s * 0.9 }, hex(col || '#A39C92'), 0, 4, 7);
    for (let r = -E; r < rows + E; r++) for (let c = -E; c < cols + E; c++) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) continue;
      const x = c + 0.5, z = r + 0.5, h = hsh(c + 99, r + 99, 1);
      const col = hex((c + r) % 2 ? pal.ground : pal.ground2).map(v => v * (0.94 + h * 0.06));
      B.box({ x, z, y: -0.38, sx: 1, sz: 1, sy: 0.64 }, hex(pal.cliff), 0, col);
      const d = Math.max(c < 0 ? -c : c >= cols ? c - cols + 1 : 0, r < 0 ? -r : r >= rows ? r - rows + 1 : 0);
      if (d < 2 && h < 0.75) continue;
      const k = hsh(c + 7, r + 3, 4), ox = (hsh(c, r, 5) - 0.5) * 0.4, oz = (hsh(c, r, 6) - 0.5) * 0.4;
      if (act === 2) {
        if (k > 0.82) { B.cyl({ x: x + ox, y: -0.06, z: z + oz, sx: 0.08, sz: 0.08, sy: 0.55 }, hex('#3F8F4E'), 0, 7); B.cyl({ x: x + ox + 0.1, y: 0.2, z: z + oz, sx: 0.05, sz: 0.05, sy: 0.22 }, hex('#3F8F4E'), 0, 6); }
        else if (k > 0.62) B.sphere({ x: x + ox, y: -0.08, z: z + oz, sx: 0.5, sy: 0.2, sz: 0.4 }, hex('#E3CC88'), 0, 4, 8);
        else if (k > 0.5) rock(x + ox, z + oz, 0.18, '#B9926A');
      } else if (act === 3) {
        if (k > 0.8) { B.cone({ x: x + ox, y: -0.06, z: z + oz, sx: 0.1, sz: 0.1, sy: 0.6, rz: 0.2 }, hex('#9FE4FF'), 0.55, 5); B.cone({ x: x + ox + 0.12, y: -0.06, z: z + oz, sx: 0.07, sz: 0.07, sy: 0.38, rz: -0.3 }, hex('#C9A7FF'), 0.55, 5); }
        else if (k > 0.62) { B.cyl({ x: x + ox, y: -0.06, z: z + oz, sx: 0.04, sz: 0.04, sy: 0.18 }, hex('#E9E1F5'), 0, 5); B.sphere({ x: x + ox, y: 0.13, z: z + oz, sx: 0.14, sy: 0.07, sz: 0.14 }, hex('#7B5CC9'), 0.2, 4, 8); }
        else if (k > 0.5) rock(x + ox, z + oz, 0.22, '#5F567E');
      } else if (act === 4) {
        if (k > 0.8) B.cone({ x: x + ox, y: -0.06, z: z + oz, sx: 0.16, sz: 0.16, sy: 0.7 }, hex('#2E2733'), 0, 5);
        else if (k > 0.7) B.box({ x: x + ox, y: -0.055, z: z + oz, sx: 0.5, sy: 0.01, sz: 0.4, ry: k * 3 }, hex('#FF7A2E'), 0.9);
        else if (k > 0.55) { B.cyl({ x: x + ox, y: -0.06, z: z + oz, sx: 0.05, sz: 0.05, sy: 0.5, rz: 0.15 }, hex('#4A3A34'), 0, 5); B.cyl({ x: x + ox + 0.08, y: 0.25, z: z + oz, sx: 0.03, sz: 0.03, sy: 0.22, rz: -0.8 }, hex('#4A3A34'), 0, 5); }
      } else {
        if (k > 0.74) tree(x + ox, z + oz, 0.7 + h * 0.5);
        else if (k > 0.6) round(x + ox, z + oz, h);
        else if (k > 0.52) rock(x + ox, z + oz, 0.2);
        else if (k > 0.44) for (let i = 0; i < 3; i++) B.sphere({ x: x + (hsh(c, r, i + 20) - 0.5) * 0.7, y: -0.04, z: z + (hsh(c, r, i + 23) - 0.5) * 0.7, s: 0.035 }, hex(['#F7E36B', '#F7A8C9', '#FFFFFF'][i]), 0.1, 3, 5);
      }
    }
    // moldura de madeira em volta do campo (cara de diorama)
    const fr = hex('#6E4A2E'), fr2 = hex('#8A5E3A');
    B.box({ x: cols / 2, y: 0.0, z: -0.06, sx: cols + 0.24, sy: 0.1, sz: 0.12 }, fr, 0, fr2);
    B.box({ x: cols / 2, y: 0.0, z: rows + 0.06, sx: cols + 0.24, sy: 0.1, sz: 0.12 }, fr, 0, fr2);
    B.box({ x: -0.06, y: 0.0, z: rows / 2, sx: 0.12, sy: 0.1, sz: rows }, fr, 0, fr2);
    B.box({ x: cols + 0.06, y: 0.0, z: rows / 2, sx: 0.12, sy: 0.1, sz: rows }, fr, 0, fr2);
  }

  function buildChicken(key, team, acc, ring) {
    const B = new Builder();
    const galo = key === 'c_galo', k = galo ? 2 : 1;
    const S = (t) => { const o = Object.assign({}, t); for (const f of ['x', 'y', 'z', 's', 'sx', 'sy', 'sz']) if (o[f] !== undefined) o[f] *= k; return o; };
    const white = hex(galo ? '#C9792E' : '#FBFBF8'), wing = hex(galo ? '#A65E22' : '#E6E9EE'), head = hex(galo ? '#E0A050' : '#FBFBF8');
    const red = hex('#E23B3B'), orange = hex('#F2A93B'), dark = hex('#1E2433');
    B.cyl(S({ y: 0, sx: 0.3, sz: 0.3, sy: 0.05 }), ring, 0, 16);
    B.cyl(S({ x: -0.07, y: 0.04, sx: 0.022, sz: 0.022, sy: 0.18 }), orange, 0, 6);
    B.cyl(S({ x: 0.07, y: 0.04, sx: 0.022, sz: 0.022, sy: 0.18 }), orange, 0, 6);
    B.box(S({ x: -0.07, y: 0.055, z: 0.05, sx: 0.08, sy: 0.02, sz: 0.12 }), orange);
    B.box(S({ x: 0.07, y: 0.055, z: 0.05, sx: 0.08, sy: 0.02, sz: 0.12 }), orange);
    B.sphere(S({ y: 0.36, sx: 0.21, sy: 0.18, sz: 0.25 }), white, 0, 7, 12);
    B.cyl(S({ y: 0.3, sx: 0.205, sz: 0.24, sy: 0.05 }), acc, 0, 14, false);
    B.sphere(S({ x: -0.2, y: 0.37, z: -0.02, sx: 0.05, sy: 0.11, sz: 0.17 }), wing, 0, 5, 8);
    B.sphere(S({ x: 0.2, y: 0.37, z: -0.02, sx: 0.05, sy: 0.11, sz: 0.17 }), wing, 0, 5, 8);
    if (galo) {
      const tail = [hex('#1F5C4A'), hex('#2C3E73'), hex('#1F5C4A'), hex('#7A2E2E'), hex('#2C3E73')];
      tail.forEach((c, i) => B.cone(S({ x: (i - 2) * 0.05, y: 0.42, z: -0.18, sx: 0.06, sz: 0.035, sy: 0.38 - Math.abs(i - 2) * 0.05, rx: -0.75 + (i % 2) * 0.2, rz: (i - 2) * 0.25 }), c, 0.08, 6));
    } else B.cone(S({ y: 0.42, z: -0.2, sx: 0.09, sz: 0.05, sy: 0.2, rx: -0.9 }), white, 0, 7);
    B.sphere(S({ y: 0.6, z: 0.12, s: 0.115 }), head, 0, 6, 10);
    const comb = galo ? [[-0.04, 0.72, 0.1, 0.04], [0, 0.75, 0.12, 0.05], [0.04, 0.72, 0.14, 0.04], [0, 0.71, 0.06, 0.035]] : [[0, 0.72, 0.1, 0.03], [0, 0.73, 0.14, 0.035], [0, 0.7, 0.18, 0.025]];
    comb.forEach(([x, y, z, r]) => B.sphere(S({ x: 0, y, z, sx: 0.02, sy: r, sz: r }), red, 0.05, 4, 6));
    B.cone(S({ y: 0.59, z: 0.22, sx: 0.035, sz: 0.03, sy: 0.08, rx: Math.PI / 2 }), orange, 0, 6);
    B.sphere(S({ y: 0.52, z: 0.2, sx: 0.022, sy: 0.04, sz: 0.022 }), red, 0, 3, 6);
    B.sphere(S({ x: -0.065, y: 0.63, z: 0.2, s: 0.02 }), dark, 0, 3, 6);
    B.sphere(S({ x: 0.065, y: 0.63, z: 0.2, s: 0.02 }), dark, 0, 3, 6);
    if (team === 'e') {
      B.box(S({ x: -0.06, y: 0.665, z: 0.205, sx: 0.06, sy: 0.016, sz: 0.015, rz: -0.4 }), dark);
      B.box(S({ x: 0.06, y: 0.665, z: 0.205, sx: 0.06, sy: 0.016, sz: 0.015, rz: 0.4 }), dark);
    }
    if (galo) {
      B.cyl(S({ y: 0.76, z: 0.08, sx: 0.07, sz: 0.07, sy: 0.04 }), hex('#F2B33D'), 0.15, 10);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; B.cone(S({ x: Math.cos(a) * 0.06, y: 0.8, z: 0.08 + Math.sin(a) * 0.06, sx: 0.018, sz: 0.018, sy: 0.05 }), hex('#F2B33D'), 0.15, 4); }
    }
    return B.data();
  }

  function buildUnit(key, team, accHex) {
    const B = new Builder();
    const enemy = team === 'e';
    const acc = hex(accHex || '#94a3b8');
    const body = hex(enemy ? '#8B2F3A' : '#2F6FB4');
    const skin = hex(enemy ? '#9DB08A' : '#F6D3B4');
    const ring = hex(enemy ? '#D9483B' : '#13897C');
    const C = (h) => hex(h);
    if (key && key.startsWith('c_')) return buildChicken(key, team, acc, ring);
    if (key && key.startsWith('b_')) return buildBoss(key);
    if (key && key.startsWith('s_')) return buildSummon(key, team, acc, ring);
    // v5.0: boneco articulado — base, pernas, tronco, braços e cabeça em partes
    B.rig();
    const pants = body.map(v => v * 0.62), boot = hex('#3A2E2A');
    B.part('base'); B.cyl({ y: 0, sx: 0.3, sz: 0.3, sy: 0.05 }, ring, 0, 16);
    B.part('legL'); B.capsule(-0.085, 0.04, 0.3, 0, 0.068, pants); B.box({ x: -0.085, y: 0.05, z: 0.025, sx: 0.12, sy: 0.07, sz: 0.17 }, boot);
    B.part('legR'); B.capsule(0.085, 0.04, 0.3, 0, 0.068, pants); B.box({ x: 0.085, y: 0.05, z: 0.025, sx: 0.12, sy: 0.07, sz: 0.17 }, boot);
    B.part('torso'); B.capsule(0, 0.2, 0.56, 0, 0.175, body);
    B.cyl({ y: 0.25, sx: 0.178, sz: 0.178, sy: 0.07 }, acc, 0, 14, false);
    B.sphere({ y: 0.5, sx: 0.2, sy: 0.07, sz: 0.16 }, body.map(v => v * 0.9), 0, 4, 10);
    B.part('armL'); B.capsule(-0.235, 0.27, 0.53, 0, 0.055, body); B.sphere({ x: -0.235, y: 0.27, s: 0.058 }, skin, 0, 3, 6);
    B.part('armR'); B.capsule(0.235, 0.27, 0.53, 0, 0.055, body); B.sphere({ x: 0.235, y: 0.27, s: 0.058 }, skin, 0, 3, 6);
    B.part('head'); B.sphere({ y: 0.7, s: 0.17 }, skin, 0, 7, 12);
    // olhos
    if (!enemy) { B.sphere({ x: -0.065, y: 0.67, z: 0.165, s: 0.026 }, C('#1E2433'), 0, 3, 6); B.sphere({ x: 0.065, y: 0.67, z: 0.165, s: 0.026 }, C('#1E2433'), 0, 3, 6); }
    else {
      B.box({ x: -0.06, y: 0.68, z: 0.165, sx: 0.07, sy: 0.022, sz: 0.02, rz: -0.35 }, C('#1E2433'));
      B.box({ x: 0.06, y: 0.68, z: 0.165, sx: 0.07, sy: 0.022, sz: 0.02, rz: 0.35 }, C('#1E2433'));
      B.cone({ x: -0.12, y: 0.76, z: 0, sx: 0.045, sz: 0.045, sy: 0.17, rz: 0.45 }, C('#F2E7D0'), 0, 6);
      B.cone({ x: 0.12, y: 0.76, z: 0, sx: 0.045, sz: 0.045, sy: 0.17, rz: -0.45 }, C('#F2E7D0'), 0, 6);
    }
    const handR = (x, y, z) => B.sphere({ x, y, z, s: 0.06 }, skin, 0, 3, 6);
    // acessórios da classe: cada peça vai para a parte do corpo onde está
    B.auto = (t) => { const x = t.x || 0, y = t.y || 0; if (y >= 0.55 && Math.abs(x) < 0.2) return 'head'; if (x > 0.15) return 'armR'; if (x < -0.15) return 'armL'; return 'torso'; };
    switch (key) {
      case 'vanguarda':
        B.sphere({ y: 0.7, s: 0.195, sy: 0.15 }, C(O.metal), 0, 5, 12);
        B.box({ y: 0.82, sx: 0.04, sy: 0.08, sz: 0.3 }, acc);
        B.box({ x: -0.26, y: 0.3, z: 0.08, sx: 0.06, sy: 0.36, sz: 0.3 }, acc);
        B.box({ x: -0.295, y: 0.3, z: 0.08, sx: 0.01, sy: 0.3, sz: 0.06 }, C('#FFFFFF'), 0.2);
        B.cyl({ x: 0.22, y: 0.15, z: 0.08, sx: 0.025, sz: 0.025, sy: 0.4, rx: 0.2 }, C(O.metal), 0, 6);
        break;
      case 'paladino':
        B.torus({ y: 0.9, s: 0.17 }, C(O.gold), 0.12, 0.5, 14, 5);
        B.cyl({ x: 0.25, y: 0.1, z: 0.05, sx: 0.025, sz: 0.025, sy: 0.6 }, C(O.wood), 0, 6);
        B.box({ x: 0.25, y: 0.72, z: 0.05, sx: 0.2, sy: 0.12, sz: 0.12 }, acc);
        handR(0.22, 0.35, 0.05);
        break;
      case 'berserker':
        B.box({ y: 0.78, sx: 0.37, sy: 0.05, sz: 0.37 }, acc);
        B.cyl({ x: 0.25, y: 0.1, z: 0.05, sx: 0.025, sz: 0.025, sy: 0.62, rz: -0.15 }, C(O.wood), 0, 6);
        B.box({ x: 0.36, y: 0.64, z: 0.05, sx: 0.18, sy: 0.2, sz: 0.03 }, C(O.metal));
        handR(0.25, 0.35, 0.05);
        break;
      case 'cacador':
        B.cone({ y: 0.6, s: 0.21, sy: 0.32 }, C('#2F8A4E'), 0, 10);
        for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI; B.box({ x: 0.26, y: 0.42 + Math.sin(a) * 0.3, z: 0.02 + Math.cos(a) * 0.14, sx: 0.035, sy: 0.12, sz: 0.035, rx: -a }, C(O.wood)); }
        B.box({ x: 0.26, y: 0.42, z: 0.02, sx: 0.006, sy: 0.6, sz: 0.006 }, C('#1E2433'));
        break;
      case 'sombra':
        B.cone({ y: 0.55, s: 0.22, sy: 0.42 }, C('#3B3150'), 0, 10);
        B.box({ y: 0.66, z: 0.17, sx: 0.18, sy: 0.03, sz: 0.02 }, acc, 0.8);
        B.box({ x: -0.25, y: 0.28, z: 0.12, sx: 0.03, sy: 0.22, sz: 0.04, rx: 0.6 }, C(O.metal));
        B.box({ x: 0.25, y: 0.28, z: 0.12, sx: 0.03, sy: 0.22, sz: 0.04, rx: 0.6 }, C(O.metal));
        break;
      case 'lanceiro':
        B.cyl({ x: 0.24, y: 0.05, z: 0.05, sx: 0.022, sz: 0.022, sy: 0.95 }, C(O.wood), 0, 6);
        B.cone({ x: 0.24, y: 1.0, z: 0.05, sx: 0.05, sz: 0.05, sy: 0.16 }, C(O.metal), 0, 6);
        B.cyl({ x: -0.25, y: 0.12, z: 0.06, sx: 0.16, sz: 0.16, sy: 0.04, rz: Math.PI / 2 }, acc, 0, 12);
        break;
      case 'monge':
        B.torus({ y: 0.72, s: 0.18 }, acc, 0.15, 0, 14, 5);
        B.sphere({ x: -0.25, y: 0.33, z: 0.1, s: 0.085 }, skin, 0, 4, 8);
        B.sphere({ x: 0.25, y: 0.33, z: 0.1, s: 0.085 }, skin, 0, 4, 8);
        break;
      case 'arcanista':
        B.cyl({ y: 0.77, sx: 0.27, sz: 0.27, sy: 0.025 }, acc, 0, 14);
        B.cone({ y: 0.78, s: 0.17, sy: 0.38, rz: 0.12 }, acc, 0, 10);
        B.cyl({ x: 0.26, y: 0.03, z: 0.05, sx: 0.022, sz: 0.022, sy: 0.82 }, C(O.wood), 0, 6);
        B.sphere({ x: 0.26, y: 0.9, z: 0.05, s: 0.075 }, C('#C9A7FF'), 0.7, 4, 8);
        break;
      case 'alquimista':
        B.box({ y: 0.7, z: 0.15, sx: 0.26, sy: 0.05, sz: 0.04 }, C('#2B3140'));
        B.cyl({ x: -0.06, y: 0.69, z: 0.16, sx: 0.04, sz: 0.04, sy: 0.03, rx: Math.PI / 2 }, C('#9BE7F5'), 0.4, 8);
        B.cyl({ x: 0.06, y: 0.69, z: 0.16, sx: 0.04, sz: 0.04, sy: 0.03, rx: Math.PI / 2 }, C('#9BE7F5'), 0.4, 8);
        B.sphere({ x: 0.27, y: 0.3, z: 0.08, s: 0.09 }, acc, 0.35, 4, 8);
        B.cyl({ x: 0.27, y: 0.37, z: 0.08, sx: 0.03, sz: 0.03, sy: 0.09 }, acc, 0.35, 6);
        break;
      case 'clerigo':
        B.torus({ y: 0.92, s: 0.17 }, C(O.gold), 0.12, 0.6, 14, 5);
        B.cyl({ x: 0.26, y: 0.03, z: 0.05, sx: 0.022, sz: 0.022, sy: 0.82 }, C(O.metal), 0, 6);
        B.box({ x: 0.26, y: 0.82, z: 0.05, sx: 0.04, sy: 0.24, sz: 0.04 }, acc, 0.3);
        B.box({ x: 0.26, y: 0.84, z: 0.05, sx: 0.18, sy: 0.04, sz: 0.04 }, acc, 0.3);
        break;
      case 'bardo':
        B.cone({ y: 0.76, sx: 0.24, sz: 0.24, sy: 0.12 }, acc, 0, 12);
        B.box({ x: 0.1, y: 0.9, z: -0.05, sx: 0.03, sy: 0.18, sz: 0.06, rz: -0.6 }, C('#F5F0E6'));
        B.sphere({ x: 0.2, y: 0.25, z: 0.2, sx: 0.12, sy: 0.12, sz: 0.05 }, C(O.wood), 0, 4, 8);
        B.box({ x: 0.28, y: 0.42, z: 0.2, sx: 0.04, sy: 0.25, sz: 0.03, rz: -0.5 }, C('#5C3A21'));
        break;
      case 'artifice':
        B.box({ y: 0.7, z: 0.15, sx: 0.26, sy: 0.05, sz: 0.04 }, C('#2B3140'));
        B.cyl({ x: -0.06, y: 0.69, z: 0.16, sx: 0.045, sz: 0.045, sy: 0.03, rx: Math.PI / 2 }, C('#FFD166'), 0.4, 8);
        B.cyl({ x: 0.06, y: 0.69, z: 0.16, sx: 0.045, sz: 0.045, sy: 0.03, rx: Math.PI / 2 }, C('#FFD166'), 0.4, 8);
        B.cyl({ x: 0, y: 0.32, z: -0.2, sx: 0.15, sz: 0.15, sy: 0.04, rx: Math.PI / 2 }, acc, 0, 8);
        B.box({ x: 0.25, y: 0.3, z: 0.08, sx: 0.04, sy: 0.3, sz: 0.04, rz: 0.3 }, C(O.metal));
        break;
      case 'druida':
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; B.cone({ x: Math.cos(a) * 0.15, y: 0.76, z: Math.sin(a) * 0.15, sx: 0.05, sz: 0.05, sy: 0.12 }, C('#4FA94D'), 0, 5); }
        B.cyl({ x: 0.26, y: 0.03, z: 0.05, sx: 0.025, sz: 0.025, sy: 0.82 }, C(O.wood), 0, 6);
        B.sphere({ x: 0.26, y: 0.88, z: 0.05, s: 0.09 }, acc, 0.2, 4, 8);
        break;
      case 'necromante':
        B.cone({ y: 0.55, s: 0.22, sy: 0.42 }, C('#2C2438'), 0, 10);
        B.box({ y: 0.66, z: 0.17, sx: 0.18, sy: 0.03, sz: 0.02 }, acc, 0.8);
        B.cyl({ x: 0.26, y: 0.03, z: 0.05, sx: 0.022, sz: 0.022, sy: 0.8 }, C(O.wood), 0, 6);
        B.sphere({ x: 0.26, y: 0.88, z: 0.05, s: 0.075 }, C(O.white), 0.1, 4, 8);
        B.box({ x: 0.26, y: 0.88, z: 0.11, sx: 0.07, sy: 0.02, sz: 0.02 }, acc, 0.8);
        break;
    }
    return B.rigData(HUMAN_PIVOTS);
  }
  const HUMAN_PIVOTS = { legL: [-0.085, 0.29, 0], legR: [0.085, 0.29, 0], armL: [-0.235, 0.52, 0], armR: [0.235, 0.52, 0], head: [0, 0.57, 0], torso: [0, 0.26, 0] };
  const BOSS_PIVOTS = { legL: [-0.18, 0.6, 0], legR: [0.18, 0.6, 0], armL: [-0.42, 1.1, 0], armR: [0.42, 1.1, 0], head: [0, 1.22, 0], torso: [0, 0.6, 0] };

  function buildSummon(key, team, acc, ring) {
    const B = new Builder(), C = hex;
    B.cyl({ y: 0, sx: 0.24, sz: 0.24, sy: 0.04 }, ring, 0, 14);
    switch (key) {
      case 's_torreta':
        B.cyl({ y: 0.04, sx: 0.16, sz: 0.16, sy: 0.25 }, C(O.metal), 0, 10);
        B.sphere({ y: 0.36, s: 0.13 }, acc, 0.15, 5, 10);
        B.box({ y: 0.36, z: 0.17, sx: 0.06, sy: 0.06, sz: 0.24 }, C('#1E2433'));
        break;
      case 's_lobo':
        B.box({ y: 0.22, sx: 0.18, sy: 0.16, sz: 0.36 }, C('#8D95A6'));
        B.box({ y: 0.33, z: 0.22, sx: 0.15, sy: 0.14, sz: 0.16 }, C('#8D95A6'));
        B.cone({ x: -0.05, y: 0.4, z: 0.2, sx: 0.03, sz: 0.03, sy: 0.09 }, C('#6B7385'), 0, 4);
        B.cone({ x: 0.05, y: 0.4, z: 0.2, sx: 0.03, sz: 0.03, sy: 0.09 }, C('#6B7385'), 0, 4);
        [[-0.06, -0.12], [0.06, -0.12], [-0.06, 0.12], [0.06, 0.12]].forEach(([x, z]) => B.box({ x, y: 0.08, z, sx: 0.05, sy: 0.12, sz: 0.05 }, C('#6B7385')));
        break;
      case 's_esqueleto':
        B.capsule(0, 0.04, 0.4, 0, 0.12, C(O.white));
        B.sphere({ y: 0.5, s: 0.12 }, C('#F5F1E8'), 0, 5, 10);
        B.sphere({ x: -0.04, y: 0.51, z: 0.1, s: 0.03 }, C('#1E2433'), 0, 3, 5); B.sphere({ x: 0.04, y: 0.51, z: 0.1, s: 0.03 }, C('#1E2433'), 0, 3, 5);
        break;
      case 's_cria':
        B.sphere({ y: 0.2, sx: 0.12, sy: 0.1, sz: 0.18 }, acc, 0.1, 5, 10);
        B.cone({ y: 0.2, z: -0.16, sx: 0.08, sz: 0.03, sy: 0.12, rx: -Math.PI / 2 }, acc, 0, 6);
        break;
      default:
        B.cone({ y: 0.04, sx: 0.15, sz: 0.15, sy: 0.4 }, acc, 0.75, 8);
        B.sphere({ y: 0.14, s: 0.12 }, acc, 0.6, 4, 8);
    }
    return B.data();
  }

  function buildBoss(key) {
    const B = new Builder().rig(), C = hex;
    B.part('base');
    const tint = { b_colosso: '#5B5566', b_leviata: '#2F6F86', b_arconte: '#5B3F8C', b_ferreiro: '#7A4A2A' }[key] || '#5B5566';
    const sh = '#4A4554', glow = C('#FF8A3D');
    B.cyl({ y: 0, sx: 0.62, sz: 0.62, sy: 0.06 }, C('#D9483B'), 0, 20);
    B.auto = (t) => { const x = t.x || 0, y = t.y || 0; if (y >= 1.25) return 'head'; if (Math.abs(x) >= 0.36) return x > 0 ? 'armR' : 'armL'; if (y < 0.62) return x > 0 ? 'legR' : 'legL'; return 'torso'; };
    B.box({ x: -0.18, y: 0.32, sx: 0.2, sy: 0.55, sz: 0.24 }, C(sh));
    B.box({ x: 0.18, y: 0.32, sx: 0.2, sy: 0.55, sz: 0.24 }, C(sh));
    B.box({ y: 0.9, sx: 0.66, sy: 0.62, sz: 0.42 }, C(tint));
    B.box({ y: 0.98, z: 0.22, sx: 0.08, sy: 0.3, sz: 0.02, rz: 0.4 }, glow, 1);
    B.box({ x: 0.12, y: 0.82, z: 0.22, sx: 0.06, sy: 0.24, sz: 0.02, rz: -0.5 }, glow, 1);
    B.sphere({ x: -0.42, y: 1.12, s: 0.17 }, C(sh), 0, 5, 10);
    B.sphere({ x: 0.42, y: 1.12, s: 0.17 }, C(sh), 0, 5, 10);
    B.box({ x: -0.46, y: 0.78, z: 0.04, sx: 0.18, sy: 0.55, sz: 0.2 }, C(sh));
    B.box({ x: 0.46, y: 0.78, z: 0.04, sx: 0.18, sy: 0.55, sz: 0.2 }, C(sh));
    B.box({ y: 1.38, sx: 0.32, sy: 0.3, sz: 0.3 }, C(tint));
    B.box({ x: -0.07, y: 1.4, z: 0.152, sx: 0.08, sy: 0.04, sz: 0.01 }, glow, 1);
    B.box({ x: 0.07, y: 1.4, z: 0.152, sx: 0.08, sy: 0.04, sz: 0.01 }, glow, 1);
    for (let i = 0; i < 5; i++) B.cone({ x: -0.14 + i * 0.07, y: 1.53, z: 0, sx: 0.04, sz: 0.04, sy: 0.12 + (i % 2) * 0.06 }, C(O.gold), 0.3, 5);
    if (key === 'b_leviata') { B.cone({ x: -0.32, y: 1.1, sx: 0.06, sz: 0.12, sy: 0.3, rz: 0.7 }, C('#7FD3E8')); B.cone({ x: 0.32, y: 1.1, sx: 0.06, sz: 0.12, sy: 0.3, rz: -0.7 }, C('#7FD3E8')); }
    if (key === 'b_arconte') { B.sphere({ y: 1.4, z: 0.16, sx: 0.11, sy: 0.08, sz: 0.04 }, C('#FDE68A'), 0.8, 4, 10); B.sphere({ y: 1.4, z: 0.19, s: 0.035 }, C('#1E2433'), 0, 3, 6); }
    if (key === 'b_ferreiro') { B.cyl({ x: 0.52, y: 0.5, z: 0.2, sx: 0.04, sz: 0.04, sy: 0.9, rx: 0.2 }, C(O.wood), 0, 6); B.box({ x: 0.52, y: 1.42, z: 0.38, sx: 0.36, sy: 0.22, sz: 0.22 }, C(O.metal)); }
    return B.rigData(BOSS_PIVOTS);
  }

  /* Disco de sombra (preto, achatado) */
  function buildDisc() { const B = new Builder(); B.cyl({ y: 0, sy: 0.001 }, [0, 0, 0], 0, 20); return B.data(); }

  FE.GL3D = { M4, Builder, hex, buildTerrain, buildUnit, buildDisc, buildStructure, elev, ACT };
})(window);
