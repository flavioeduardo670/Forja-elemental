using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ForjaElemental.Game
{
    /// <summary>
    /// Port do construtor de malhas de js/gl3d.js (caixa, cilindro, cone, esfera, toro, cápsula)
    /// com cor por vértice (sRGB) e brilho no alfa — o mesmo formato do shader ForjaElemental/VertexColorLit.
    /// As peças são descritas nas coordenadas do JS (destro, Y para cima) e convertidas para o Unity
    /// espelhando Z: (x, y, z) → (x, y, ZOffset − z).
    /// </summary>
    public sealed class MeshKit
    {
        public struct T
        {
            public float x, y, z, s, sx, sy, sz, rx, ry, rz;
            public bool hasS, hasSx, hasSy, hasSz;
            public static T At(float x, float y, float z) => new T { x = x, y = y, z = z };
            public T S(float v) { s = v; hasS = true; return this; }
            public T Sx(float v) { sx = v; hasSx = true; return this; }
            public T Sy(float v) { sy = v; hasSy = true; return this; }
            public T Sz(float v) { sz = v; hasSz = true; return this; }
            public T Size(float a, float b, float c) => Sx(a).Sy(b).Sz(c);
            public T Rx(float v) { rx = v; return this; }
            public T Ry(float v) { ry = v; return this; }
            public T Rz(float v) { rz = v; return this; }
            public float SX => hasSx ? sx : hasS ? s : 1;
            public float SY => hasSy ? sy : hasS ? s : 1;
            public float SZ => hasSz ? sz : hasS ? s : 1;
        }

        readonly List<Vector3> pos = new List<Vector3>();
        readonly List<Vector3> nrm = new List<Vector3>();
        readonly List<Color> col = new List<Color>();
        public float ZOffset;

        public MeshKit(float zOffset) { ZOffset = zOffset; }

        public static Color Hex(string h)
        {
            if (h != null && h.StartsWith("#")) h = h.Substring(1);
            if (h == null || h.Length != 6 || !int.TryParse(h, System.Globalization.NumberStyles.HexNumber, null, out int n)) return new Color(0.6f, 0.6f, 0.65f);
            return new Color(((n >> 16) & 255) / 255f, ((n >> 8) & 255) / 255f, (n & 255) / 255f);
        }
        public static Color Shade(string h, float f) { var c = Hex(h); return Shade(c, f); }
        public static Color Shade(Color c, float f) => f < 0 ? new Color(c.r * (1 + f), c.g * (1 + f), c.b * (1 + f)) : new Color(c.r + (1 - c.r) * f, c.g + (1 - c.g) * f, c.b + (1 - c.b) * f);
        public static Color Mul(Color c, float f) => new Color(c.r * f, c.g * f, c.b * f);

        void Tri(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 n0, Vector3 n1, Vector3 n2, Color c, float em)
        {
            // espelha Z (destro → canhoto) e inverte a ordem para manter a face visível
            Vector3 M(Vector3 p) => new Vector3(p.x, p.y, ZOffset - p.z);
            Vector3 N(Vector3 n) => new Vector3(n.x, n.y, -n.z);
            var cc = new Color(c.r, c.g, c.b, em);
            pos.Add(M(p0)); pos.Add(M(p2)); pos.Add(M(p1));
            nrm.Add(N(n0)); nrm.Add(N(n2)); nrm.Add(N(n1));
            col.Add(cc); col.Add(cc); col.Add(cc);
        }

        struct Xf
        {
            float sx, sy, sz, cx, nx, cz, nz, cy, ny, tx, ty, tz;
            public Xf(T t)
            {
                sx = t.SX; sy = t.SY; sz = t.SZ;
                cx = Mathf.Cos(t.rx); nx = Mathf.Sin(t.rx); cz = Mathf.Cos(t.rz); nz = Mathf.Sin(t.rz); cy = Mathf.Cos(t.ry); ny = Mathf.Sin(t.ry);
                tx = t.x; ty = t.y; tz = t.z;
            }
            Vector3 Rot(float x, float y, float z)
            {
                float y1 = y * cx - z * nx, z1 = y * nx + z * cx; y = y1; z = z1;
                float x1 = x * cz - y * nz; y1 = x * nz + y * cz; x = x1; y = y1;
                x1 = x * cy + z * ny; z1 = -x * ny + z * cy;
                return new Vector3(x1, y, z1);
            }
            public Vector3 P(float x, float y, float z) { var r = Rot(x * sx, y * sy, z * sz); return new Vector3(r.x + tx, r.y + ty, r.z + tz); }
            public Vector3 N(float x, float y, float z) { var r = Rot(x / sx, y / sy, z / sz); float l = r.magnitude; return l > 0 ? r / l : r; }
        }

        void Quad(Xf T, Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n, Color col, float em, Color? top = null)
        {
            var N = T.N(n.x, n.y, n.z);
            var A = T.P(a.x, a.y, a.z); var B = T.P(b.x, b.y, b.z); var C = T.P(c.x, c.y, c.z); var D = T.P(d.x, d.y, d.z);
            Tri(A, B, C, N, N, N, col, em); Tri(A, C, D, N, N, N, col, em);
        }

        public void Box(T t, Color c, float em = 0, Color? top = null)
        {
            var X = new Xf(t); float h = 0.5f; var tc = top ?? c;
            Quad(X, new Vector3(-h, h, -h), new Vector3(h, h, -h), new Vector3(h, h, h), new Vector3(-h, h, h), Vector3.up, tc, em);
            Quad(X, new Vector3(-h, -h, -h), new Vector3(-h, -h, h), new Vector3(h, -h, h), new Vector3(h, -h, -h), Vector3.down, c, em);
            Quad(X, new Vector3(-h, -h, h), new Vector3(-h, h, h), new Vector3(h, h, h), new Vector3(h, -h, h), Vector3.forward, c, em);
            Quad(X, new Vector3(-h, -h, -h), new Vector3(h, -h, -h), new Vector3(h, h, -h), new Vector3(-h, h, -h), Vector3.back, c, em);
            Quad(X, new Vector3(h, -h, -h), new Vector3(h, -h, h), new Vector3(h, h, h), new Vector3(h, h, -h), Vector3.right, c, em);
            Quad(X, new Vector3(-h, -h, -h), new Vector3(-h, h, -h), new Vector3(-h, h, h), new Vector3(-h, -h, h), Vector3.left, c, em);
        }

        public void Cyl(T t, Color c, float em = 0, int seg = 10, bool caps = true)
        {
            var X = new Xf(t);
            for (int i = 0; i < seg; i++)
            {
                float a0 = i / (float)seg * Mathf.PI * 2, a1 = (i + 1) / (float)seg * Mathf.PI * 2;
                float c0 = Mathf.Cos(a0), s0 = Mathf.Sin(a0), c1 = Mathf.Cos(a1), s1 = Mathf.Sin(a1);
                Vector3 P0 = X.P(c0, 0, s0), P1 = X.P(c1, 0, s1), P2 = X.P(c1, 1, s1), P3 = X.P(c0, 1, s0);
                Vector3 N0 = X.N(c0, 0, s0), N1 = X.N(c1, 0, s1);
                Tri(P0, P1, P2, N0, N1, N1, c, em); Tri(P0, P2, P3, N0, N1, N0, c, em);
                if (caps)
                {
                    Vector3 up = X.N(0, 1, 0), dn = X.N(0, -1, 0);
                    Tri(X.P(0, 1, 0), P3, P2, up, up, up, c, em);
                    Tri(X.P(0, 0, 0), P1, P0, dn, dn, dn, c, em);
                }
            }
        }

        public void Cone(T t, Color c, float em = 0, int seg = 10)
        {
            var X = new Xf(t); var apex = X.P(0, 1, 0);
            for (int i = 0; i < seg; i++)
            {
                float a0 = i / (float)seg * Mathf.PI * 2, a1 = (i + 1) / (float)seg * Mathf.PI * 2, am = (a0 + a1) / 2;
                Vector3 p0 = X.P(Mathf.Cos(a0), 0, Mathf.Sin(a0)), p1 = X.P(Mathf.Cos(a1), 0, Mathf.Sin(a1));
                Vector3 n0 = X.N(Mathf.Cos(a0), 0.7f, Mathf.Sin(a0)), n1 = X.N(Mathf.Cos(a1), 0.7f, Mathf.Sin(a1)), nm = X.N(Mathf.Cos(am), 0.7f, Mathf.Sin(am));
                Tri(p0, p1, apex, n0, n1, nm, c, em);
                var dn = X.N(0, -1, 0);
                Tri(X.P(0, 0, 0), p1, p0, dn, dn, dn, c, em);
            }
        }

        public void Sphere(T t, Color c, float em = 0, int lat = 6, int lon = 10)
        {
            var X = new Xf(t);
            Vector3 Pt(int i, int j) { float th = i / (float)lat * Mathf.PI, ph = j / (float)lon * Mathf.PI * 2; return new Vector3(Mathf.Sin(th) * Mathf.Cos(ph), Mathf.Cos(th), Mathf.Sin(th) * Mathf.Sin(ph)); }
            for (int i = 0; i < lat; i++)
                for (int j = 0; j < lon; j++)
                {
                    Vector3 a = Pt(i, j), b = Pt(i + 1, j), cc = Pt(i + 1, j + 1), d = Pt(i, j + 1);
                    Vector3 A = X.P(a.x, a.y, a.z), B = X.P(b.x, b.y, b.z), C = X.P(cc.x, cc.y, cc.z), D = X.P(d.x, d.y, d.z);
                    Vector3 nA = X.N(a.x, a.y, a.z), nB = X.N(b.x, b.y, b.z), nC = X.N(cc.x, cc.y, cc.z), nD = X.N(d.x, d.y, d.z);
                    if (i > 0) Tri(A, B, D, nA, nB, nD, c, em);
                    if (i < lat - 1) Tri(B, C, D, nB, nC, nD, c, em);
                }
        }

        public void Torus(T t, Color c, float r = 0.18f, float em = 0, int seg = 16, int side = 6)
        {
            var X = new Xf(t);
            (Vector3 p, Vector3 n) Pt(int i, int j)
            {
                float u = i / (float)seg * Mathf.PI * 2, v = j / (float)side * Mathf.PI * 2, cx = Mathf.Cos(u), sx = Mathf.Sin(u);
                return (new Vector3((1 + r * Mathf.Cos(v)) * cx, r * Mathf.Sin(v), (1 + r * Mathf.Cos(v)) * sx), new Vector3(Mathf.Cos(v) * cx, Mathf.Sin(v), Mathf.Cos(v) * sx));
            }
            for (int i = 0; i < seg; i++)
                for (int j = 0; j < side; j++)
                {
                    var a = Pt(i, j); var b = Pt(i + 1, j); var cc = Pt(i + 1, j + 1); var d = Pt(i, j + 1);
                    Tri(X.P(a.p.x, a.p.y, a.p.z), X.P(b.p.x, b.p.y, b.p.z), X.P(cc.p.x, cc.p.y, cc.p.z), X.N(a.n.x, a.n.y, a.n.z), X.N(b.n.x, b.n.y, b.n.z), X.N(cc.n.x, cc.n.y, cc.n.z), c, em);
                    Tri(X.P(a.p.x, a.p.y, a.p.z), X.P(cc.p.x, cc.p.y, cc.p.z), X.P(d.p.x, d.p.y, d.p.z), X.N(a.n.x, a.n.y, a.n.z), X.N(cc.n.x, cc.n.y, cc.n.z), X.N(d.n.x, d.n.y, d.n.z), c, em);
                }
        }

        public Mesh Build(string name)
        {
            var m = new Mesh { name = name, indexFormat = pos.Count > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            m.SetVertices(pos); m.SetNormals(nrm); m.SetColors(col);
            var idx = new int[pos.Count]; for (int i = 0; i < idx.Length; i++) idx[i] = i;
            m.SetTriangles(idx, 0);
            m.RecalculateBounds();
            return m;
        }

        public int VertexCount => pos.Count;
    }
}
