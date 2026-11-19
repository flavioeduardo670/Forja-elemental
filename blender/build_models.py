"""
Forja Elemental — gera os modelos do jogo no Blender e exporta FBX para o Unity.

Reproduz os modelos procedurais de js/gl3d.js (mesmas primitivas, proporções,
pivôs, cores e brilho) e transforma as poses de js/render.js (pose()) em
animações: Idle, Walk, Attack, Cast, Hit, Stunned, Victory e Die.

Uso (na raiz do repositório):
    blender -b -P blender/build_models.py              # tudo
    blender -b -P blender/build_models.py -- vanguarda # só os modelos cujo nome contém o filtro

Saída: unity/Assets/Art/Models/{Units,Bosses,Summons,Structures}/*.fbx

Convenções
- Coordenadas do JS: Y para cima, frente em +Z, 1 unidade = 1 casa do tabuleiro.
  No Blender: (x, y, z)_js -> (x, -z, y). O FBX volta para Y-up/+Z frente no Unity.
- Cor por vértice (atributo "Col", sRGB). O alfa guarda o brilho emissivo (0..1).
- Bones apontam para +Y com roll 0 (matriz de repouso = identidade), então a
  rotação de cada bone é feita nos eixos do mundo, como o M4.joint do JS.
"""
import bpy
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "unity", "Assets", "Art", "Models")
FPS = 30


# ---------------------------------------------------------------- cores
def hexc(h):
    h = (h or "").lstrip("#")
    if len(h) != 6:
        return (0.6, 0.6, 0.65)
    n = int(h, 16)
    return (((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


O = {"metal": "#C9CED8", "wood": "#8A5A33", "gold": "#F2B33D", "dark": "#2B2438", "white": "#F4EFE4"}


# ---------------------------------------------------------------- construtor (port do Builder do gl3d.js)
class Builder:
    def __init__(self, rig=False):
        self.tris = []  # (p0, p1, p2, n0, n1, n2, col, em, part)
        self.rigged = rig
        self.cur = "torso" if rig else "root"
        self.auto = None

    def part(self, name):
        self.cur = name
        self.auto = None
        return self

    def pick(self, t):
        if self.auto:
            self.cur = self.auto(t)

    def tri(self, p0, p1, p2, n0, n1, n2, col, em):
        self.tris.append((p0, p1, p2, n0, n1, n2, col, em, self.cur if self.rigged else "root"))

    @staticmethod
    def xf(t):
        s = t.get("s", 1)
        sx, sy, sz = t.get("sx", s), t.get("sy", s), t.get("sz", s)
        rx, rz, ry = t.get("rx", 0), t.get("rz", 0), t.get("ry", 0)
        cx, nx, cz, nz, cy, ny = math.cos(rx), math.sin(rx), math.cos(rz), math.sin(rz), math.cos(ry), math.sin(ry)

        def rot(x, y, z):
            y1 = y * cx - z * nx; z1 = y * nx + z * cx; y, z = y1, z1
            x1 = x * cz - y * nz; y1 = x * nz + y * cz; x, y = x1, y1
            x1 = x * cy + z * ny; z1 = -x * ny + z * cy
            return (x1, y, z1)

        tx, ty, tz = t.get("x", 0), t.get("y", 0), t.get("z", 0)

        def p(x, y, z):
            r = rot(x * sx, y * sy, z * sz)
            return (r[0] + tx, r[1] + ty, r[2] + tz)

        def n(x, y, z):
            r = rot(x / sx, y / sy, z / sz)
            l = math.sqrt(r[0] ** 2 + r[1] ** 2 + r[2] ** 2) or 1
            return (r[0] / l, r[1] / l, r[2] / l)

        return p, n

    def quad(self, T, a, b, c, d, nrm, col, em):
        p, n = T
        N = n(*nrm); A, B, C, D = p(*a), p(*b), p(*c), p(*d)
        self.tri(A, B, C, N, N, N, col, em); self.tri(A, C, D, N, N, N, col, em)

    def box(self, t, col, em=0, top=None):
        self.pick(t)
        T = self.xf(t); h = 0.5; top = top or col
        self.quad(T, (-h, h, -h), (h, h, -h), (h, h, h), (-h, h, h), (0, 1, 0), top, em)
        self.quad(T, (-h, -h, -h), (-h, -h, h), (h, -h, h), (h, -h, -h), (0, -1, 0), col, em)
        self.quad(T, (-h, -h, h), (-h, h, h), (h, h, h), (h, -h, h), (0, 0, 1), col, em)
        self.quad(T, (-h, -h, -h), (h, -h, -h), (h, h, -h), (-h, h, -h), (0, 0, -1), col, em)
        self.quad(T, (h, -h, -h), (h, -h, h), (h, h, h), (h, h, -h), (1, 0, 0), col, em)
        self.quad(T, (-h, -h, -h), (-h, h, -h), (-h, h, h), (-h, -h, h), (-1, 0, 0), col, em)

    def cyl(self, t, col, em=0, seg=10, caps=True):
        self.pick(t)
        p, n = self.xf(t)
        for i in range(seg):
            a0 = i / seg * math.pi * 2; a1 = (i + 1) / seg * math.pi * 2
            c0, s0, c1, s1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
            P = [p(c0, 0, s0), p(c1, 0, s1), p(c1, 1, s1), p(c0, 1, s0)]
            N0, N1 = n(c0, 0, s0), n(c1, 0, s1)
            self.tri(P[0], P[1], P[2], N0, N1, N1, col, em); self.tri(P[0], P[2], P[3], N0, N1, N0, col, em)
            if caps:
                up, dn = n(0, 1, 0), n(0, -1, 0)
                self.tri(p(0, 1, 0), P[3], P[2], up, up, up, col, em)
                self.tri(p(0, 0, 0), P[1], P[0], dn, dn, dn, col, em)

    def cone(self, t, col, em=0, seg=10):
        self.pick(t)
        p, n = self.xf(t); apex = p(0, 1, 0)
        for i in range(seg):
            a0 = i / seg * math.pi * 2; a1 = (i + 1) / seg * math.pi * 2; am = (a0 + a1) / 2
            p0, p1 = p(math.cos(a0), 0, math.sin(a0)), p(math.cos(a1), 0, math.sin(a1))
            n0, n1, nm = n(math.cos(a0), 0.7, math.sin(a0)), n(math.cos(a1), 0.7, math.sin(a1)), n(math.cos(am), 0.7, math.sin(am))
            self.tri(p0, p1, apex, n0, n1, nm, col, em)
            dn = n(0, -1, 0)
            self.tri(p(0, 0, 0), p1, p0, dn, dn, dn, col, em)

    def sphere(self, t, col, em=0, lat=6, lon=10):
        self.pick(t)
        p, n = self.xf(t)

        def pt(i, j):
            th = i / lat * math.pi; ph = j / lon * math.pi * 2
            return (math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph))

        for i in range(lat):
            for j in range(lon):
                a, b, c, d = pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)
                A, B, C, D = p(*a), p(*b), p(*c), p(*d)
                nA, nB, nC, nD = n(*a), n(*b), n(*c), n(*d)
                if i > 0: self.tri(A, B, D, nA, nB, nD, col, em)
                if i < lat - 1: self.tri(B, C, D, nB, nC, nD, col, em)

    def torus(self, t, col, r=0.18, em=0, seg=16, side=6):
        self.pick(t)
        p, n = self.xf(t)

        def pt(i, j):
            u = i / seg * math.pi * 2; v = j / side * math.pi * 2; cx, sx = math.cos(u), math.sin(u)
            return ((1 + r * math.cos(v)) * cx, r * math.sin(v), (1 + r * math.cos(v)) * sx), (math.cos(v) * cx, math.sin(v), math.cos(v) * sx)

        for i in range(seg):
            for j in range(side):
                a, b, c, d = pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)
                self.tri(p(*a[0]), p(*b[0]), p(*c[0]), n(*a[1]), n(*b[1]), n(*c[1]), col, em)
                self.tri(p(*a[0]), p(*c[0]), p(*d[0]), n(*a[1]), n(*c[1]), n(*d[1]), col, em)

    def capsule(self, x, y0, y1, z, r, col, em=0):
        au = self.auto
        if au:
            self.cur = au({"x": x, "y": (y0 + y1) / 2, "z": z}); self.auto = None
        self.cyl({"x": x, "y": y0 + r, "z": z, "sx": r, "sz": r, "sy": max(0.001, y1 - y0 - 2 * r)}, col, em, 12, False)
        self.sphere({"x": x, "y": y1 - r, "z": z, "s": r}, col, em, 5, 12)
        self.sphere({"x": x, "y": y0 + r, "z": z, "s": r}, col, em, 5, 12)
        if au:
            self.auto = au


def mul(c, f): return tuple(v * f for v in c)


# ---------------------------------------------------------------- modelos (port de buildUnit/buildBoss/buildSummon/buildStructure)
HUMAN_PIVOTS = {"legL": (-0.085, 0.29, 0), "legR": (0.085, 0.29, 0), "armL": (-0.235, 0.52, 0), "armR": (0.235, 0.52, 0), "head": (0, 0.57, 0), "torso": (0, 0.26, 0)}
BOSS_PIVOTS = {"legL": (-0.18, 0.6, 0), "legR": (0.18, 0.6, 0), "armL": (-0.42, 1.1, 0), "armR": (0.42, 1.1, 0), "head": (0, 1.22, 0), "torso": (0, 0.6, 0)}

ARCH_COLOR = {"vanguarda": "#3b82f6", "paladino": "#fde047", "berserker": "#ea580c", "cacador": "#10b981", "sombra": "#f43f5e", "lanceiro": "#14b8a6",
              "monge": "#f0abfc", "arcanista": "#a855f7", "alquimista": "#06b6d4", "clerigo": "#38bdf8", "bardo": "#f472b6", "artifice": "#f59e0b",
              "druida": "#84cc16", "necromante": "#6366f1"}
ARCH_RANGE = {"vanguarda": 1.45, "paladino": 1.45, "berserker": 1.45, "cacador": 4.3, "sombra": 1.45, "lanceiro": 2.2, "monge": 1.45, "arcanista": 3.6,
              "alquimista": 3.2, "clerigo": 3.1, "bardo": 3.0, "artifice": 3.3, "druida": 3.0, "necromante": 3.2}


def build_unit(key, team, acc_hex):
    B = Builder(rig=True)
    enemy = team == "e"
    acc = hexc(acc_hex)
    body = hexc("#8B2F3A" if enemy else "#2F6FB4")
    skin = hexc("#9DB08A" if enemy else "#F6D3B4")
    ring = hexc("#D9483B" if enemy else "#13897C")
    C = hexc
    pants, boot = mul(body, 0.62), hexc("#3A2E2A")
    B.part("base"); B.cyl({"y": 0, "sx": 0.3, "sz": 0.3, "sy": 0.05}, ring, 0, 16)
    B.part("legL"); B.capsule(-0.085, 0.04, 0.3, 0, 0.068, pants); B.box({"x": -0.085, "y": 0.05, "z": 0.025, "sx": 0.12, "sy": 0.07, "sz": 0.17}, boot)
    B.part("legR"); B.capsule(0.085, 0.04, 0.3, 0, 0.068, pants); B.box({"x": 0.085, "y": 0.05, "z": 0.025, "sx": 0.12, "sy": 0.07, "sz": 0.17}, boot)
    B.part("torso"); B.capsule(0, 0.2, 0.56, 0, 0.175, body)
    B.cyl({"y": 0.25, "sx": 0.178, "sz": 0.178, "sy": 0.07}, acc, 0, 14, False)
    B.sphere({"y": 0.5, "sx": 0.2, "sy": 0.07, "sz": 0.16}, mul(body, 0.9), 0, 4, 10)
    B.part("armL"); B.capsule(-0.235, 0.27, 0.53, 0, 0.055, body); B.sphere({"x": -0.235, "y": 0.27, "s": 0.058}, skin, 0, 3, 6)
    B.part("armR"); B.capsule(0.235, 0.27, 0.53, 0, 0.055, body); B.sphere({"x": 0.235, "y": 0.27, "s": 0.058}, skin, 0, 3, 6)
    B.part("head"); B.sphere({"y": 0.7, "s": 0.17}, skin, 0, 7, 12)
    if not enemy:
        B.sphere({"x": -0.065, "y": 0.67, "z": 0.165, "s": 0.026}, C("#1E2433"), 0, 3, 6)
        B.sphere({"x": 0.065, "y": 0.67, "z": 0.165, "s": 0.026}, C("#1E2433"), 0, 3, 6)
    else:
        B.box({"x": -0.06, "y": 0.68, "z": 0.165, "sx": 0.07, "sy": 0.022, "sz": 0.02, "rz": -0.35}, C("#1E2433"))
        B.box({"x": 0.06, "y": 0.68, "z": 0.165, "sx": 0.07, "sy": 0.022, "sz": 0.02, "rz": 0.35}, C("#1E2433"))
        B.cone({"x": -0.12, "y": 0.76, "z": 0, "sx": 0.045, "sz": 0.045, "sy": 0.17, "rz": 0.45}, C("#F2E7D0"), 0, 6)
        B.cone({"x": 0.12, "y": 0.76, "z": 0, "sx": 0.045, "sz": 0.045, "sy": 0.17, "rz": -0.45}, C("#F2E7D0"), 0, 6)

    def handR(x, y, z): B.sphere({"x": x, "y": y, "z": z, "s": 0.06}, skin, 0, 3, 6)

    def auto(t):
        x, y = t.get("x", 0), t.get("y", 0)
        if y >= 0.55 and abs(x) < 0.2: return "head"
        if x > 0.15: return "armR"
        if x < -0.15: return "armL"
        return "torso"

    B.auto = auto
    M, W, G = C(O["metal"]), C(O["wood"]), C(O["gold"])
    if key == "vanguarda":
        B.sphere({"y": 0.7, "s": 0.195, "sy": 0.15}, M, 0, 5, 12)
        B.box({"y": 0.82, "sx": 0.04, "sy": 0.08, "sz": 0.3}, acc)
        B.box({"x": -0.26, "y": 0.3, "z": 0.08, "sx": 0.06, "sy": 0.36, "sz": 0.3}, acc)
        B.box({"x": -0.295, "y": 0.3, "z": 0.08, "sx": 0.01, "sy": 0.3, "sz": 0.06}, C("#FFFFFF"), 0.2)
        B.cyl({"x": 0.22, "y": 0.15, "z": 0.08, "sx": 0.025, "sz": 0.025, "sy": 0.4, "rx": 0.2}, M, 0, 6)
    elif key == "paladino":
        B.torus({"y": 0.9, "s": 0.17}, G, 0.12, 0.5, 14, 5)
        B.cyl({"x": 0.25, "y": 0.1, "z": 0.05, "sx": 0.025, "sz": 0.025, "sy": 0.6}, W, 0, 6)
        B.box({"x": 0.25, "y": 0.72, "z": 0.05, "sx": 0.2, "sy": 0.12, "sz": 0.12}, acc)
        handR(0.22, 0.35, 0.05)
    elif key == "berserker":
        B.box({"y": 0.78, "sx": 0.37, "sy": 0.05, "sz": 0.37}, acc)
        B.cyl({"x": 0.25, "y": 0.1, "z": 0.05, "sx": 0.025, "sz": 0.025, "sy": 0.62, "rz": -0.15}, W, 0, 6)
        B.box({"x": 0.36, "y": 0.64, "z": 0.05, "sx": 0.18, "sy": 0.2, "sz": 0.03}, M)
        handR(0.25, 0.35, 0.05)
    elif key == "cacador":
        B.cone({"y": 0.6, "s": 0.21, "sy": 0.32}, C("#2F8A4E"), 0, 10)
        for i in range(7):
            a = -math.pi / 2 + i / 6 * math.pi
            B.box({"x": 0.26, "y": 0.42 + math.sin(a) * 0.3, "z": 0.02 + math.cos(a) * 0.14, "sx": 0.035, "sy": 0.12, "sz": 0.035, "rx": -a}, W)
        B.box({"x": 0.26, "y": 0.42, "z": 0.02, "sx": 0.006, "sy": 0.6, "sz": 0.006}, C("#1E2433"))
    elif key == "sombra":
        B.cone({"y": 0.55, "s": 0.22, "sy": 0.42}, C("#3B3150"), 0, 10)
        B.box({"y": 0.66, "z": 0.17, "sx": 0.18, "sy": 0.03, "sz": 0.02}, acc, 0.8)
        B.box({"x": -0.25, "y": 0.28, "z": 0.12, "sx": 0.03, "sy": 0.22, "sz": 0.04, "rx": 0.6}, M)
        B.box({"x": 0.25, "y": 0.28, "z": 0.12, "sx": 0.03, "sy": 0.22, "sz": 0.04, "rx": 0.6}, M)
    elif key == "lanceiro":
        B.cyl({"x": 0.24, "y": 0.05, "z": 0.05, "sx": 0.022, "sz": 0.022, "sy": 0.95}, W, 0, 6)
        B.cone({"x": 0.24, "y": 1.0, "z": 0.05, "sx": 0.05, "sz": 0.05, "sy": 0.16}, M, 0, 6)
        B.cyl({"x": -0.25, "y": 0.12, "z": 0.06, "sx": 0.16, "sz": 0.16, "sy": 0.04, "rz": math.pi / 2}, acc, 0, 12)
    elif key == "monge":
        B.torus({"y": 0.72, "s": 0.18}, acc, 0.15, 0, 14, 5)
        B.sphere({"x": -0.25, "y": 0.33, "z": 0.1, "s": 0.085}, skin, 0, 4, 8)
        B.sphere({"x": 0.25, "y": 0.33, "z": 0.1, "s": 0.085}, skin, 0, 4, 8)
    elif key == "arcanista":
        B.cyl({"y": 0.77, "sx": 0.27, "sz": 0.27, "sy": 0.025}, acc, 0, 14)
        B.cone({"y": 0.78, "s": 0.17, "sy": 0.38, "rz": 0.12}, acc, 0, 10)
        B.cyl({"x": 0.26, "y": 0.03, "z": 0.05, "sx": 0.022, "sz": 0.022, "sy": 0.82}, W, 0, 6)
        B.sphere({"x": 0.26, "y": 0.9, "z": 0.05, "s": 0.075}, C("#C9A7FF"), 0.7, 4, 8)
    elif key == "alquimista":
        B.box({"y": 0.7, "z": 0.15, "sx": 0.26, "sy": 0.05, "sz": 0.04}, C("#2B3140"))
        B.cyl({"x": -0.06, "y": 0.69, "z": 0.16, "sx": 0.04, "sz": 0.04, "sy": 0.03, "rx": math.pi / 2}, C("#9BE7F5"), 0.4, 8)
        B.cyl({"x": 0.06, "y": 0.69, "z": 0.16, "sx": 0.04, "sz": 0.04, "sy": 0.03, "rx": math.pi / 2}, C("#9BE7F5"), 0.4, 8)
        B.sphere({"x": 0.27, "y": 0.3, "z": 0.08, "s": 0.09}, acc, 0.35, 4, 8)
        B.cyl({"x": 0.27, "y": 0.37, "z": 0.08, "sx": 0.03, "sz": 0.03, "sy": 0.09}, acc, 0.35, 6)
    elif key == "clerigo":
        B.torus({"y": 0.92, "s": 0.17}, G, 0.12, 0.6, 14, 5)
        B.cyl({"x": 0.26, "y": 0.03, "z": 0.05, "sx": 0.022, "sz": 0.022, "sy": 0.82}, M, 0, 6)
        B.box({"x": 0.26, "y": 0.82, "z": 0.05, "sx": 0.04, "sy": 0.24, "sz": 0.04}, acc, 0.3)
        B.box({"x": 0.26, "y": 0.84, "z": 0.05, "sx": 0.18, "sy": 0.04, "sz": 0.04}, acc, 0.3)
    elif key == "bardo":
        B.cone({"y": 0.76, "sx": 0.24, "sz": 0.24, "sy": 0.12}, acc, 0, 12)
        B.box({"x": 0.1, "y": 0.9, "z": -0.05, "sx": 0.03, "sy": 0.18, "sz": 0.06, "rz": -0.6}, C("#F5F0E6"))
        B.sphere({"x": 0.2, "y": 0.25, "z": 0.2, "sx": 0.12, "sy": 0.12, "sz": 0.05}, W, 0, 4, 8)
        B.box({"x": 0.28, "y": 0.42, "z": 0.2, "sx": 0.04, "sy": 0.25, "sz": 0.03, "rz": -0.5}, C("#5C3A21"))
    elif key == "artifice":
        B.box({"y": 0.7, "z": 0.15, "sx": 0.26, "sy": 0.05, "sz": 0.04}, C("#2B3140"))
        B.cyl({"x": -0.06, "y": 0.69, "z": 0.16, "sx": 0.045, "sz": 0.045, "sy": 0.03, "rx": math.pi / 2}, C("#FFD166"), 0.4, 8)
        B.cyl({"x": 0.06, "y": 0.69, "z": 0.16, "sx": 0.045, "sz": 0.045, "sy": 0.03, "rx": math.pi / 2}, C("#FFD166"), 0.4, 8)
        B.cyl({"x": 0, "y": 0.32, "z": -0.2, "sx": 0.15, "sz": 0.15, "sy": 0.04, "rx": math.pi / 2}, acc, 0, 8)
        B.box({"x": 0.25, "y": 0.3, "z": 0.08, "sx": 0.04, "sy": 0.3, "sz": 0.04, "rz": 0.3}, M)
    elif key == "druida":
        for i in range(6):
            a = i / 6 * math.pi * 2
            B.cone({"x": math.cos(a) * 0.15, "y": 0.76, "z": math.sin(a) * 0.15, "sx": 0.05, "sz": 0.05, "sy": 0.12}, C("#4FA94D"), 0, 5)
        B.cyl({"x": 0.26, "y": 0.03, "z": 0.05, "sx": 0.025, "sz": 0.025, "sy": 0.82}, W, 0, 6)
        B.sphere({"x": 0.26, "y": 0.88, "z": 0.05, "s": 0.09}, acc, 0.2, 4, 8)
    elif key == "necromante":
        B.cone({"y": 0.55, "s": 0.22, "sy": 0.42}, C("#2C2438"), 0, 10)
        B.box({"y": 0.66, "z": 0.17, "sx": 0.18, "sy": 0.03, "sz": 0.02}, acc, 0.8)
        B.cyl({"x": 0.26, "y": 0.03, "z": 0.05, "sx": 0.022, "sz": 0.022, "sy": 0.8}, W, 0, 6)
        B.sphere({"x": 0.26, "y": 0.88, "z": 0.05, "s": 0.075}, C(O["white"]), 0.1, 4, 8)
        B.box({"x": 0.26, "y": 0.88, "z": 0.11, "sx": 0.07, "sy": 0.02, "sz": 0.02}, acc, 0.8)
    return B


def build_boss(key):
    B = Builder(rig=True); C = hexc
    B.part("base")
    tint = {"b_colosso": "#5B5566", "b_leviata": "#2F6F86", "b_arconte": "#5B3F8C", "b_ferreiro": "#7A4A2A"}.get(key, "#5B5566")
    sh, glow = C("#4A4554"), C("#FF8A3D")
    B.cyl({"y": 0, "sx": 0.62, "sz": 0.62, "sy": 0.06}, C("#D9483B"), 0, 20)

    def auto(t):
        x, y = t.get("x", 0), t.get("y", 0)
        if y >= 1.25: return "head"
        if abs(x) >= 0.36: return "armR" if x > 0 else "armL"
        if y < 0.62: return "legR" if x > 0 else "legL"
        return "torso"

    B.auto = auto
    T = C(tint)
    B.box({"x": -0.18, "y": 0.32, "sx": 0.2, "sy": 0.55, "sz": 0.24}, sh)
    B.box({"x": 0.18, "y": 0.32, "sx": 0.2, "sy": 0.55, "sz": 0.24}, sh)
    B.box({"y": 0.9, "sx": 0.66, "sy": 0.62, "sz": 0.42}, T)
    B.box({"y": 0.98, "z": 0.22, "sx": 0.08, "sy": 0.3, "sz": 0.02, "rz": 0.4}, glow, 1)
    B.box({"x": 0.12, "y": 0.82, "z": 0.22, "sx": 0.06, "sy": 0.24, "sz": 0.02, "rz": -0.5}, glow, 1)
    B.sphere({"x": -0.42, "y": 1.12, "s": 0.17}, sh, 0, 5, 10)
    B.sphere({"x": 0.42, "y": 1.12, "s": 0.17}, sh, 0, 5, 10)
    B.box({"x": -0.46, "y": 0.78, "z": 0.04, "sx": 0.18, "sy": 0.55, "sz": 0.2}, sh)
    B.box({"x": 0.46, "y": 0.78, "z": 0.04, "sx": 0.18, "sy": 0.55, "sz": 0.2}, sh)
    B.box({"y": 1.38, "sx": 0.32, "sy": 0.3, "sz": 0.3}, T)
    B.box({"x": -0.07, "y": 1.4, "z": 0.152, "sx": 0.08, "sy": 0.04, "sz": 0.01}, glow, 1)
    B.box({"x": 0.07, "y": 1.4, "z": 0.152, "sx": 0.08, "sy": 0.04, "sz": 0.01}, glow, 1)
    for i in range(5):
        B.cone({"x": -0.14 + i * 0.07, "y": 1.53, "z": 0, "sx": 0.04, "sz": 0.04, "sy": 0.12 + (i % 2) * 0.06}, C(O["gold"]), 0.3, 5)
    if key == "b_leviata":
        B.cone({"x": -0.32, "y": 1.1, "sx": 0.06, "sz": 0.12, "sy": 0.3, "rz": 0.7}, C("#7FD3E8"))
        B.cone({"x": 0.32, "y": 1.1, "sx": 0.06, "sz": 0.12, "sy": 0.3, "rz": -0.7}, C("#7FD3E8"))
    if key == "b_arconte":
        B.sphere({"y": 1.4, "z": 0.16, "sx": 0.11, "sy": 0.08, "sz": 0.04}, C("#FDE68A"), 0.8, 4, 10)
        B.sphere({"y": 1.4, "z": 0.19, "s": 0.035}, C("#1E2433"), 0, 3, 6)
    if key == "b_ferreiro":
        B.cyl({"x": 0.52, "y": 0.5, "z": 0.2, "sx": 0.04, "sz": 0.04, "sy": 0.9, "rx": 0.2}, C(O["wood"]), 0, 6)
        B.box({"x": 0.52, "y": 1.42, "z": 0.38, "sx": 0.36, "sy": 0.22, "sz": 0.22}, C(O["metal"]))
    return B


def build_summon(key, team, acc_hex):
    B = Builder(rig=False); C = hexc
    acc = hexc(acc_hex)
    ring = hexc("#D9483B" if team == "e" else "#13897C")
    B.cyl({"y": 0, "sx": 0.24, "sz": 0.24, "sy": 0.04}, ring, 0, 14)
    if key == "s_torreta":
        B.cyl({"y": 0.04, "sx": 0.16, "sz": 0.16, "sy": 0.25}, C(O["metal"]), 0, 10)
        B.sphere({"y": 0.36, "s": 0.13}, acc, 0.15, 5, 10)
        B.box({"y": 0.36, "z": 0.17, "sx": 0.06, "sy": 0.06, "sz": 0.24}, C("#1E2433"))
    elif key == "s_lobo":
        B.box({"y": 0.22, "sx": 0.18, "sy": 0.16, "sz": 0.36}, C("#8D95A6"))
        B.box({"y": 0.33, "z": 0.22, "sx": 0.15, "sy": 0.14, "sz": 0.16}, C("#8D95A6"))
        B.cone({"x": -0.05, "y": 0.4, "z": 0.2, "sx": 0.03, "sz": 0.03, "sy": 0.09}, C("#6B7385"), 0, 4)
        B.cone({"x": 0.05, "y": 0.4, "z": 0.2, "sx": 0.03, "sz": 0.03, "sy": 0.09}, C("#6B7385"), 0, 4)
        for x, z in [(-0.06, -0.12), (0.06, -0.12), (-0.06, 0.12), (0.06, 0.12)]:
            B.box({"x": x, "y": 0.08, "z": z, "sx": 0.05, "sy": 0.12, "sz": 0.05}, C("#6B7385"))
    elif key == "s_esqueleto":
        B.capsule(0, 0.04, 0.4, 0, 0.12, C(O["white"]))
        B.sphere({"y": 0.5, "s": 0.12}, C("#F5F1E8"), 0, 5, 10)
        B.sphere({"x": -0.04, "y": 0.51, "z": 0.1, "s": 0.03}, C("#1E2433"), 0, 3, 5)
        B.sphere({"x": 0.04, "y": 0.51, "z": 0.1, "s": 0.03}, C("#1E2433"), 0, 3, 5)
    elif key == "s_cria":
        B.sphere({"y": 0.2, "sx": 0.12, "sy": 0.1, "sz": 0.18}, acc, 0.1, 5, 10)
        B.cone({"y": 0.2, "z": -0.16, "sx": 0.08, "sz": 0.03, "sy": 0.12, "rx": -math.pi / 2}, acc, 0, 6)
    else:  # avatar elemental
        B.cone({"y": 0.04, "sx": 0.15, "sz": 0.15, "sy": 0.4}, acc, 0.75, 8)
        B.sphere({"y": 0.14, "s": 0.12}, acc, 0.6, 4, 8)
    return B


def build_structure(kind):
    B = Builder(rig=False); C = hexc
    stone, stoneD, dark, wood = C("#C9C0AE"), C("#9F9583"), C("#3A3440"), C(O["wood"])

    def crenels(x0, x1, y, z, step=0.26, sz=0.16):
        x = x0
        while x <= x1 + 1e-6:
            B.box({"x": x, "y": y + 0.06, "z": z, "sx": 0.13, "sy": 0.12, "sz": sz}, stone); x += step

    def roof_house(x, z, w, d, h, wall, roof):
        B.box({"x": x, "y": h / 2, "z": z, "sx": w, "sy": h, "sz": d}, C(wall))
        B.box({"x": x, "y": h + 0.02, "z": z, "sx": w * 0.74, "sy": w * 0.74, "sz": d * 1.06, "rz": math.pi / 4}, C(roof))
        B.box({"x": x, "y": 0.12, "z": z - d / 2 - 0.005, "sx": 0.12, "sy": 0.24, "sz": 0.01}, wood)
        B.box({"x": x + w * 0.28, "y": h * 0.62, "z": z - d / 2 - 0.005, "sx": 0.1, "sy": 0.1, "sz": 0.01}, C("#FFE7A3"), 0.6)

    def flag(x, y, z, col, h=0.55):
        B.cyl({"x": x, "y": y, "z": z, "sx": 0.018, "sz": 0.018, "sy": h}, wood, 0, 5)
        B.box({"x": x + 0.13, "y": y + h - 0.1, "z": z, "sx": 0.26, "sy": 0.15, "sz": 0.012}, C(col), 0.15)

    if kind == "cidade":
        B.box({"y": 0.02, "z": 0.35, "sx": 4.6, "sy": 0.04, "sz": 1.9}, C("#B9B2A6"))
        B.box({"y": 0.3, "z": -0.45, "sx": 4.2, "sy": 0.6, "sz": 0.22}, stone)
        crenels(-2.0, 2.0, 0.6, -0.45)
        B.box({"y": 0.22, "z": -0.565, "sx": 0.5, "sy": 0.44, "sz": 0.02}, dark)
        for sx in (-1, 1):
            B.cyl({"x": sx * 0.42, "y": 0, "z": -0.45, "sx": 0.24, "sz": 0.24, "sy": 0.9}, stoneD, 0, 10)
            B.cone({"x": sx * 0.42, "y": 0.9, "z": -0.45, "sx": 0.3, "sz": 0.3, "sy": 0.38}, C("#2E8C80"), 0, 10)
            B.cyl({"x": sx * 2.15, "y": 0, "z": -0.45, "sx": 0.2, "sz": 0.2, "sy": 0.75}, stoneD, 0, 10)
            B.cone({"x": sx * 2.15, "y": 0.75, "z": -0.45, "sx": 0.25, "sz": 0.25, "sy": 0.32}, C("#2E8C80"), 0, 10)
        roof_house(-1.5, 0.3, 0.6, 0.5, 0.42, "#EFE3C8", "#C4553E")
        roof_house(-0.75, 0.6, 0.5, 0.45, 0.36, "#F3E9D6", "#3D6FB6")
        roof_house(0.85, 0.35, 0.55, 0.5, 0.4, "#EBDDBF", "#C4553E")
        roof_house(1.6, 0.7, 0.5, 0.45, 0.34, "#F3E9D6", "#C98A12")
        roof_house(-1.6, 1.0, 0.5, 0.4, 0.32, "#EBDDBF", "#3D6FB6")
        B.box({"x": 0.1, "y": 0.55, "z": 0.75, "sx": 0.4, "sy": 1.1, "sz": 0.4}, C("#E9E1D0"))
        B.cone({"x": 0.1, "y": 1.1, "z": 0.75, "sx": 0.32, "sz": 0.32, "sy": 0.55}, C("#7A3B2E"), 0, 4)
        B.box({"x": 0.1, "y": 0.85, "z": 0.545, "sx": 0.12, "sy": 0.16, "sz": 0.01}, C("#F2B33D"), 0.5)
        flag(-0.42, 1.25, -0.45, "#13897C"); flag(0.42, 1.25, -0.45, "#13897C")
    elif kind == "forte":
        B.box({"y": 0.05, "sx": 3.4, "sy": 0.1, "sz": 1.2}, stoneD)
        B.box({"y": 0.75, "z": -0.05, "sx": 1.3, "sy": 1.5, "sz": 0.95}, C("#7C7486"))
        crenels(-0.55, 0.55, 1.5, 0.38); crenels(-0.55, 0.55, 1.5, -0.48)
        B.box({"y": 0.32, "z": 0.43, "sx": 0.46, "sy": 0.6, "sz": 0.04}, dark)
        for i in range(4):
            B.box({"x": -0.16 + i * 0.105, "y": 0.32, "z": 0.455, "sx": 0.025, "sy": 0.58, "sz": 0.012}, C("#55505C"))
        B.box({"y": 1.05, "z": 0.43, "sx": 0.5, "sy": 0.12, "sz": 0.02}, C("#D9483B"), 0.2)
        for sx in (-1, 1):
            B.box({"x": sx * 1.05, "y": 0.42, "z": 0.05, "sx": 0.8, "sy": 0.84, "sz": 0.3}, C("#857D90"))
            crenels(sx * 1.05 - 0.3, sx * 1.05 + 0.3, 0.84, 0.05, 0.2, 0.2)
            B.cyl({"x": sx * 1.5, "y": 0.05, "z": 0.05, "sx": 0.28, "sz": 0.28, "sy": 1.15}, C("#7C7486"), 0, 10)
            B.cone({"x": sx * 1.5, "y": 1.2, "z": 0.05, "sx": 0.34, "sz": 0.34, "sy": 0.5}, C("#A33A30"), 0, 10)
            B.box({"x": sx * 1.5, "y": 0.75, "z": 0.33, "sx": 0.06, "sy": 0.14, "sz": 0.01}, C("#FF8A3D"), 0.8)
        flag(0, 1.5, -0.05, "#D9483B", 0.7)
    else:
        B.cyl({"y": 0, "sx": 0.32, "sz": 0.32, "sy": 0.08}, stoneD, 0, 12)
        B.cyl({"y": 0.05, "sx": 0.24, "sz": 0.24, "sy": 1.15}, C("#857D90"), 0, 10)
        B.box({"y": 1.22, "sx": 0.66, "sy": 0.1, "sz": 0.66}, wood)
        for x, z in [(-0.28, -0.28), (0.28, -0.28), (-0.28, 0.28), (0.28, 0.28)]:
            B.cyl({"x": x, "y": 1.27, "z": z, "sx": 0.025, "sz": 0.025, "sy": 0.38}, wood, 0, 5)
        B.cone({"y": 1.62, "sx": 0.48, "sz": 0.48, "sy": 0.32}, C("#A33A30"), 0, 4)
        B.capsule(0, 1.27, 1.55, 0.05, 0.07, C("#8B2F3A"))
        B.box({"y": 0.7, "z": 0.235, "sx": 0.06, "sy": 0.14, "sz": 0.01}, C("#FF8A3D"), 0.8)
    return B


# ---------------------------------------------------------------- poses (port de pose() em js/render.js)
def rest_pose():
    return {"legL": [0, 0, 0], "legR": [0, 0, 0], "armL": [0, -0.07, 0], "armR": [0, 0.07, 0], "head": [0, 0, 0], "torso": [0, 0, 0],
            "dy": 0.0, "root": [0, 0, 0], "rootDy": 0.0, "bodyDy": 0.0, "bodySy": 1.0}


def pose_idle(t, info):
    P = rest_pose(); br = math.sin(t * 2.1)
    P["armL"][1] += -br * 0.03; P["armR"][1] += br * 0.03; P["head"][0] += br * 0.03
    P["bodyDy"] = 0.008 * (1 + br)
    return P


def pose_walk(t, info):
    P = rest_pose(); ph = t * 12; s = math.sin(ph)
    P["legL"][0] = -s * 0.8; P["legR"][0] = s * 0.8
    P["armL"][0] = s * 0.6; P["armR"][0] = -s * 0.6
    P["dy"] = abs(math.cos(ph)) * 0.04; P["torso"][0] = 0.12
    P["bodyDy"] = abs(math.sin(ph)) * 0.05
    return P


def pose_attack(t, info):
    P = rest_pose()
    if info["ranged"]:
        env = math.sin(math.pi * min(1, t * 1.15))
        P["armR"][0] = -1.5 * env
        if info["bow"]: P["armL"][0] = -1.45 * env
        P["torso"][0] -= 0.08 * env; P["torso"][2] = 0.2 * env
        P["bodyDy"] = 0.03 * env
    else:
        ang = -2.7 * (t / 0.3) if t < 0.3 else (-2.7 + 2.3 * ((t - 0.3) / 0.25) if t < 0.55 else -0.4 * (1 - (t - 0.55) / 0.45))
        P["armR"][0] = ang
        P["armL"][0] = ang if info["boss"] else -0.5 * math.sin(math.pi * t)
        P["torso"][2] = -0.3 * (t / 0.3) if t < 0.3 else 0.25 * (1 - t)
        P["torso"][0] += 0.2 * math.sin(math.pi * min(1, max(0, (t - 0.3) / 0.4)))
        P["bodySy"] = 1 - 0.12 * math.sin(math.pi * t)
    return P


def pose_cast(t, info):
    P = rest_pose(); env = math.sin(math.pi * t)
    P["armL"][0] = -2.9 * env; P["armR"][0] = -2.9 * env; P["armL"][1] = -0.35 * env; P["armR"][1] = 0.35 * env
    P["head"][0] -= 0.25 * env; P["dy"] += 0.07 * env; P["torso"][0] -= 0.1 * env
    P["bodyDy"] = 0.07 * env
    return P


def pose_hit(t, info):
    P = rest_pose(); f = 0.8 * math.sin(math.pi * t)
    P["torso"][0] -= 0.28 * f; P["head"][0] -= 0.2 * f
    P["root"][0] = 0.08 * f if not info["rigged"] else 0
    P["bodySy"] = 1 - 0.1 * f
    return P


def pose_stunned(t, info):
    P = rest_pose()
    P["head"][1] = math.sin(t * 9) * 0.28; P["torso"][1] = math.sin(t * 4.5) * 0.07
    if not info["rigged"]: P["root"][1] = math.sin(t * 9) * 0.15
    return P


def pose_victory(t, info):
    P = rest_pose(); j = abs(math.sin(t * 6))
    P["armL"][0] = -2.9; P["armR"][0] = -2.9; P["armL"][1] = -0.3; P["armR"][1] = 0.3; P["dy"] = j * 0.12
    P["bodyDy"] = j * 0.12
    return P


def pose_die(t, info):
    P = rest_pose(); e = t
    P["root"][0] = -min(1, e * 2.2) * 1.45  # cai para trás (rx < 0 leva a cabeça para -Z)
    P["rootDy"] = -e * 0.25
    return P


# nome: (função, duração em s, em loop?) — tempos iguais aos do JS
CLIPS = {
    "Idle": (pose_idle, 2 * math.pi / 2.1, True),
    "Walk": (pose_walk, 2 * math.pi / 12, True),
    "Attack": (pose_attack, 1 / 3.4, False),
    "Cast": (pose_cast, 1 / 1.9, False),
    "Hit": (pose_hit, 0.25, False),
    "Stunned": (pose_stunned, 2 * math.pi / 4.5, True),
    "Victory": (pose_victory, math.pi / 6, True),
    "Die": (pose_die, 0.9, False),
}


# ---------------------------------------------------------------- Blender
def J(p):
    """JS (x, y, z) -> Blender (x, -z, y)."""
    return (p[0], -p[2], p[1])


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS


def make_material():
    m = bpy.data.materials.get("ForjaVertexColor")
    if m: return m
    m = bpy.data.materials.new("ForjaVertexColor")
    m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    return m


def make_mesh(name, B):
    verts, faces, normals, cols, parts = [], [], [], [], []
    for (p0, p1, p2, n0, n1, n2, col, em, part) in B.tris:
        a, b, c = J(p0), J(p1), J(p2)
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        cr = ((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2)
        if cr < 1e-16: continue  # descarta triângulos degenerados
        i = len(verts)
        verts += [a, b, c]; faces.append((i, i + 1, i + 2))
        normals += [J(n0), J(n1), J(n2)]
        lin = tuple(srgb_to_linear(v) for v in col)
        cols += [(lin[0], lin[1], lin[2], float(em))] * 3
        parts.append(part)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for li, loop in enumerate(me.loops):
        ca.data[li].color = cols[loop.vertex_index]
    me.normals_split_custom_set([normals[l.vertex_index] for l in me.loops])
    me.materials.append(make_material())
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj, parts


def make_armature(pivots, has_limbs):
    arm = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, parent=None):
        b = arm.edit_bones.new(name)
        h = J(head); b.head = h; b.tail = (h[0], h[1] + 0.08, h[2]); b.roll = 0
        if parent: b.parent = arm.edit_bones[parent]
        return b

    bone("root", (0, 0, 0))
    if has_limbs:
        bone("torso", pivots["torso"], "root")
        bone("legL", pivots["legL"], "root"); bone("legR", pivots["legR"], "root")
        bone("armL", pivots["armL"], "torso"); bone("armR", pivots["armR"], "torso")
        bone("head", pivots["head"], "torso")
    else:
        bone("body", (0, 0, 0), "root")
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def skin(obj, parts, rig, has_limbs):
    names = set(parts)
    groups = {}
    for n in names:
        bone = n if has_limbs else "body"
        if n == "base": bone = "root"
        groups[n] = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
    for fi, part in enumerate(parts):
        groups[part].add([fi * 3, fi * 3 + 1, fi * 3 + 2], 1.0, "REPLACE")
    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE"); mod.object = rig


def key_pose(rig, P, frame, has_limbs):
    pb = rig.pose.bones
    for b in pb: b.rotation_mode = "YXZ"

    def rot(name, rx, rz, ry=0.0):
        # rotação do JS (Ry·Rx·Rz nos eixos do JS) -> eixos do Blender: X=X, Z_js=-Y, Y_js=Z
        b = pb[name]; b.rotation_euler = (rx, -rz, ry)
        b.keyframe_insert("rotation_euler", frame=frame)

    def loc(name, dz):
        b = pb[name]; b.location = (0, 0, dz)
        b.keyframe_insert("location", frame=frame)

    rot("root", P["root"][0], P["root"][1]); loc("root", P["rootDy"])
    if has_limbs:
        t = P["torso"]; rot("torso", t[0], t[1], t[2]); loc("torso", P["dy"])
        for n in ("legL", "legR", "armL", "armR", "head"):
            rot(n, P[n][0], P[n][1])
    else:
        b = pb["body"]; b.location = (0, 0, P["bodyDy"]); b.keyframe_insert("location", frame=frame)
        b.scale = (1, 1, P["bodySy"]); b.keyframe_insert("scale", frame=frame)


def make_actions(rig, info):
    has_limbs = info["rigged"]
    rig.animation_data_create()
    actions = []
    for name, (fn, dur, loop) in CLIPS.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        frames = max(2, round(dur * FPS))
        for f in range(frames + 1):
            t = f / frames
            tt = t * dur if name in ("Idle", "Walk", "Stunned", "Victory") else t
            key_pose(rig, fn(tt, info), f, has_limbs)
        act.frame_range = (0, frames)
        actions.append(act)
    rig.animation_data.action = actions[0]
    return actions


def export(path, objs, animated):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=True, object_types={"ARMATURE", "MESH"},
        apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", global_scale=1.0,
        axis_forward="-Z", axis_up="Y", bake_space_transform=True,
        use_mesh_modifiers=False, mesh_smooth_type="OFF", colors_type="SRGB",
        add_leaf_bones=False, primary_bone_axis="Y", secondary_bone_axis="X",
        bake_anim=animated, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=animated, bake_anim_force_startend_keying=True,
        bake_anim_step=1.0, bake_anim_simplify_factor=0.0)


def build_and_export(name, sub, B, info, pivots=None):
    reset_scene()
    obj, parts = make_mesh(name, B)
    objs = [obj]
    animated = info is not None
    if animated:
        rig = make_armature(pivots, info["rigged"])
        skin(obj, parts, rig, info["rigged"])
        make_actions(rig, info)
        objs = [rig, obj]
    export(os.path.join(OUT, sub, name + ".fbx"), objs, animated)
    print(f"[forja] {sub}/{name}.fbx  ({len(B.tris)} triângulos)")


ELEMENT_COLOR = {"fogo": "#ef4444", "agua": "#38bdf8", "pedra": "#d97706", "ar": "#34d399", "solar": "#facc15", "lunar": "#c084fc"}
SUMMONS = {"s_torreta": "#f59e0b", "s_lobo": "#a3e635", "s_esqueleto": "#cbd5e1"}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    flt = argv[0] if argv else ""
    jobs = []
    for arch, col in ARCH_COLOR.items():
        for team in ("p", "e"):
            info = {"rigged": True, "ranged": ARCH_RANGE[arch] > 2.3, "bow": arch == "cacador", "boss": False}
            jobs.append((f"{arch}_{team}", "Units", lambda a=arch, t=team, c=col: build_unit(a, t, c), info, HUMAN_PIVOTS))
    for key in ("b_colosso", "b_leviata", "b_arconte", "b_ferreiro"):
        jobs.append((key, "Bosses", lambda k=key: build_boss(k), {"rigged": True, "ranged": False, "bow": False, "boss": True}, BOSS_PIVOTS))
    for key, col in SUMMONS.items():
        for team in ("p", "e"):
            info = {"rigged": False, "ranged": key == "s_torreta", "bow": False, "boss": False}
            jobs.append((f"{key}_{team}", "Summons", lambda k=key, t=team, c=col: build_summon(k, t, c), info, None))
    jobs.append(("s_cria_e", "Summons", lambda: build_summon("s_cria", "e", "#0ea5e9"), {"rigged": False, "ranged": False, "bow": False, "boss": False}, None))
    for el, col in ELEMENT_COLOR.items():
        jobs.append((f"s_avatar_{el}", "Summons", lambda c=col: build_summon("s_avatar", "e", c), {"rigged": False, "ranged": False, "bow": False, "boss": False}, None))
    for kind in ("cidade", "forte", "torre"):
        jobs.append((kind, "Structures", lambda k=kind: build_structure(k), None, None))

    n = 0
    for name, sub, mk, info, piv in jobs:
        if flt and flt not in name: continue
        build_and_export(name, sub, mk(), info, piv); n += 1
    print(f"[forja] {n} modelo(s) exportado(s) para {OUT}")


if __name__ == "__main__":
    main()
