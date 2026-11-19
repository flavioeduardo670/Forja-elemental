using System;
using UnityEngine;
using T = ForjaElemental.Game.MeshKit.T;

namespace ForjaElemental.Game
{
    /// <summary>Port de buildTerrain e buildSurround (js/gl3d.js): tabuleiro 3D com entorno temático por Ato.</summary>
    public static class TerrainBuilder
    {
        static readonly string[][] Grass = { new[] { "#8CC66A", "#84BE63" }, new[] { "#D5BE70", "#CCB466" }, new[] { "#97A3D4", "#8D99CB" }, new[] { "#B3A095", "#AA978C" } };
        static readonly string[] Dirt = { "#A87A4E", "#B48650", "#6E6390", "#7A5446" };
        static readonly string[][] Rim = { new[] { "#7DB65E", "#76AE58", "#8A6440" }, new[] { "#D9C27A", "#D1B970", "#A47A4A" }, new[] { "#8590C4", "#7D88BC", "#5C5280" }, new[] { "#9E8C82", "#958479", "#5F3F34" } };

        public static float Elev(char t)
        {
            switch (t)
            {
                case 'M': return 0.32f; case 'H': return 0.14f; case 'W': return -0.2f; case 'B': return -0.2f; case 'L': return -0.18f;
                case 'S': return -0.07f; case 'R': return -0.95f; case 'U': return 0.5f; case 'O': return -0.95f; case 'Z': return 0.02f;
                default: return 0;
            }
        }
        static bool HasElev(char t) => Elev(t) != 0;

        /* hsh do JS, incluindo a perda de precisão do produto em double */
        public static float Hsh(int c, int r, int k = 0)
        {
            long v = c * 374761393L + r * 668265263L + k * 2147483647L;
            uint h = (uint)(v & 0xFFFFFFFFL);
            int x = (int)(h ^ (h >> 13));
            double prod = x * 1274126177.0;
            double m = prod % 4294967296.0; if (m < 0) m += 4294967296.0;
            uint h2 = (uint)m;
            return h2 % 1000 / 1000f;
        }

        public static Mesh Build(Func<int, int, char> terrainAt, int cols, int rows, int act, int playerRow)
        {
            var B = new MeshKit(rows);
            int ai = Mathf.Clamp(act, 1, 4) - 1;
            var grass = Grass[ai]; string dirt = Dirt[ai];
            const float BOTTOM = -0.7f;
            Color H(string h) => MeshKit.Hex(h);
            for (int r = 0; r < rows; r++)
                for (int c = 0; c < cols; c++)
                {
                    char t = terrainAt(c, r); float top = Elev(t);
                    float x = c + 0.5f, z = r + 0.5f;
                    float jitter = (Hsh(c, r, 7) - 0.5f) * 0.04f;
                    Color topCol, sideCol = H(dirt); float em = 0; bool slab = true;
                    switch (t)
                    {
                        case 'F': topCol = MeshKit.Shade(grass[0], -0.1f); break;
                        case 'M': topCol = H("#B6AFA4"); sideCol = H("#8F897F"); slab = false; break;
                        case 'H': topCol = MeshKit.Shade(grass[0], 0.06f); break;
                        case 'W': case 'B': topCol = H("#6FBDE6"); sideCol = H("#4F94BD"); slab = false; break;
                        case 'L': topCol = H("#FF7A2E"); sideCol = H("#B4441A"); em = 0.85f; slab = false; break;
                        case 'S': topCol = H("#77A06F"); sideCol = H("#59744F"); slab = false; break;
                        case 'R': topCol = H("#2E2836"); sideCol = H("#4C4048"); slab = false; break;
                        case 'O': topCol = H("#251C1E"); sideCol = H("#4A3A30"); slab = false; break;
                        case 'U': topCol = H(Hsh(c, r, 1) > 0.5f ? "#D3CAB8" : "#CCC2AF"); sideCol = H("#A2957F"); slab = false; break;
                        case 'Z': topCol = H("#BDB6AA"); sideCol = H("#8F877B"); break;
                        default: { var g = H(grass[(c + r) % 2]); topCol = new Color(g.r + jitter, g.g + jitter, g.b + jitter); break; }
                    }
                    float yTop = top, yBot = Mathf.Min(BOTTOM, yTop - 0.12f);
                    if (slab)
                    {
                        B.Box(T.At(x, yTop - 0.04f, z).Size(1, 0.08f, 1), MeshKit.Mul(topCol, 0.82f), 0, topCol);
                        B.Box(T.At(x, (yTop - 0.08f + yBot) / 2, z).Size(1, (yTop - 0.08f) - yBot, 1), sideCol);
                    }
                    else
                    {
                        B.Box(T.At(x, (yTop + yBot) / 2, z).Size(1, yTop - yBot, 1), sideCol, t == 'L' ? 0.5f : 0, topCol);
                        if (t == 'L') B.Box(T.At(x, yTop + 0.002f, z).Size(0.999f, 0.003f, 0.999f), topCol, em);
                    }
                    Decorate(B, terrainAt, t, c, r, x, z, yTop, grass);
                }
            Surround(B, cols, rows, act);
            for (int c = 0; c < cols; c++)
                for (int i = 0; i < 2; i++)
                {
                    char t = terrainAt(c, playerRow), t2 = terrainAt(c, playerRow - 1);
                    float y = Mathf.Max(Elev(t), Elev(t2)) + 0.012f;
                    B.Box(T.At(c + 0.18f + i * 0.5f, y, playerRow).Size(0.3f, 0.01f, 0.045f), H("#FFFFFF"), 0.7f);
                }
            return B.Build("Terreno");
        }

        static void Decorate(MeshKit B, Func<int, int, char> terrainAt, char t, int c, int r, float x, float z, float yTop, string[] grass)
        {
            Color H(string h) => MeshKit.Hex(h);
            if (t == 'F')
            {
                float[][] spots = { new[] { -0.22f, -0.18f }, new[] { 0.2f, -0.05f }, new[] { -0.02f, 0.24f } };
                for (int i = 0; i < 3; i++)
                {
                    float tx = x + spots[i][0] + (Hsh(c, r, i) - 0.5f) * 0.08f, tz = z + spots[i][1] + (Hsh(c, r, i + 3) - 0.5f) * 0.08f, hh = 0.5f + Hsh(c, r, i + 6) * 0.2f;
                    B.Cyl(T.At(tx, yTop, tz).Size(0.045f, 0.12f, 0.045f), H("#7A5134"), 0, 6);
                    B.Cone(T.At(tx, yTop + 0.1f, tz).Size(0.2f, hh * 0.62f, 0.2f), H("#2E8A4D"), 0, 7);
                    B.Cone(T.At(tx, yTop + 0.1f + hh * 0.32f, tz).Size(0.15f, hh * 0.5f, 0.15f), H("#3BA05A"), 0, 7);
                }
            }
            else if (t == 'M')
            {
                B.Cone(T.At(x - 0.12f, yTop, z - 0.05f).Size(0.36f, 0.62f, 0.36f), H("#9C958B"), 0, 6);
                B.Cone(T.At(x - 0.12f, yTop + 0.42f, z - 0.05f).Size(0.12f, 0.2f, 0.12f), H("#FFFFFF"), 0.15f, 6);
                B.Cone(T.At(x + 0.22f, yTop, z + 0.16f).Size(0.26f, 0.4f, 0.26f), H("#8A847A"), 0, 6);
                B.Cone(T.At(x + 0.22f, yTop + 0.27f, z + 0.16f).Size(0.09f, 0.13f, 0.09f), H("#FFFFFF"), 0.15f, 6);
            }
            else if (t == 'H') B.Sphere(T.At(x, yTop, z).Size(0.36f, 0.12f, 0.36f), MeshKit.Shade(grass[0], 0.1f), 0, 4, 10);
            else if (t == 'P')
            {
                B.Cyl(T.At(x, yTop, z).Size(0.17f, 0.72f, 0.17f), H("#D8D0C1"), 0, 10);
                B.Box(T.At(x, yTop + 0.76f, z).Size(0.44f, 0.08f, 0.44f), H("#C7BEAD"));
                B.Box(T.At(x, yTop + 0.03f, z).Size(0.42f, 0.06f, 0.42f), H("#C7BEAD"));
            }
            else if (t == 'B')
            {
                bool Wet(char n) => n == 'W' || n == 'R' || n == 'L';
                bool horiz = Wet(terrainAt(c - 1, r)) || Wet(terrainAt(c + 1, r));
                for (int i = 0; i < 5; i++)
                {
                    float o = -0.4f + i * 0.2f; var col = H(i % 2 == 1 ? "#C48A50" : "#B97F47");
                    if (horiz) B.Box(T.At(x + o, 0.02f, z).Size(0.16f, 0.05f, 0.72f), col); else B.Box(T.At(x, 0.02f, z + o).Size(0.72f, 0.05f, 0.16f), col);
                }
                foreach (int k in new[] { -1, 1 })
                    if (horiz) B.Box(T.At(x, 0.12f, z + k * 0.38f).Size(1, 0.04f, 0.04f), H("#7A5134")); else B.Box(T.At(x + k * 0.38f, 0.12f, z).Size(0.04f, 0.04f, 1), H("#7A5134"));
            }
            else if (t == 'W') B.Box(T.At(x + (Hsh(c, r, 2) - 0.5f) * 0.4f, yTop + 0.004f, z + (Hsh(c, r, 3) - 0.5f) * 0.4f).Size(0.28f, 0.004f, 0.04f), H("#E8F6FF"), 0.6f);
            else if (t == 'L')
            {
                B.Box(T.At(x - 0.1f, yTop + 0.006f, z).Size(0.5f, 0.006f, 0.05f).Ry(0.6f), H("#FFE07A"), 1);
                B.Box(T.At(x + 0.15f, yTop + 0.006f, z + 0.15f).Size(0.35f, 0.006f, 0.04f).Ry(-0.4f), H("#FFE07A"), 1);
            }
            else if (t == 'S')
            {
                for (int i = 0; i < 3; i++) B.Cyl(T.At(x + (Hsh(c, r, i) - 0.5f) * 0.55f, yTop, z + (Hsh(c, r, i + 4) - 0.5f) * 0.55f).Size(0.1f, 0.01f, 0.1f), H("#4E8A57"), 0, 8);
                B.Sphere(T.At(x + 0.12f, yTop + 0.04f, z - 0.1f).S(0.04f), H("#F7A8C9"), 0.2f, 3, 6);
            }
            else if (t == 'U')
            {
                B.Box(T.At(x, yTop + 0.003f, z).Size(0.98f, 0.004f, 0.02f), H("#9F9583"));
                B.Box(T.At(x, yTop + 0.003f, z).Size(0.02f, 0.004f, 0.98f), H("#9F9583"));
                for (int k = 1; k < 4; k++) B.Box(T.At(x, yTop * k / 4, z - 0.501f).Size(1, 0.015f, 0.004f), H("#8C806B"));
                int[][] nb = { new[] { 0, -1 }, new[] { 0, 1 }, new[] { -1, 0 }, new[] { 1, 0 } };
                for (int i = 0; i < 4; i++)
                {
                    int dc = nb[i][0], dr = nb[i][1]; char n = terrainAt(c + dc, r + dr);
                    if (n == 'U') continue;
                    float ex = x + dc * 0.45f, ez = z + dr * 0.45f;
                    if (dr != 0 && !HasElev(n) && Hsh(c, r, 30 + i) > 0.35f)
                        for (int k = 0; k < 3; k++) B.Box(T.At(x, yTop * (k + 0.5f) / 4, z + dr * (0.6f + k * 0.12f) - dr * 0.12f).Size(0.5f, yTop / 4, 0.12f), H("#BFB4A0"));
                    else
                        for (int k = -1; k <= 1; k += 2)
                            B.Box(T.At(ex + (dr != 0 ? k * 0.28f : 0), yTop + 0.06f, ez + (dc != 0 ? k * 0.28f : 0)).Size(dc != 0 ? 0.1f : 0.2f, 0.12f, dr != 0 ? 0.1f : 0.2f), H("#B8AC96"));
                }
            }
            else if (t == 'T')
            {
                B.Box(T.At(x, yTop + 0.012f, z).Size(0.6f, 0.02f, 0.6f), H("#8A5A33"));
                for (int k = -1; k <= 1; k++) B.Box(T.At(x + k * 0.2f, yTop + 0.024f, z).Size(0.012f, 0.006f, 0.58f), H("#5C3A21"));
                B.Torus(T.At(x, yTop + 0.026f, z + 0.18f).S(0.05f), H("#55505C"), 0.25f, 0, 10, 4);
            }
            else if (t == 'O')
            {
                for (int k = 0; k < 6; k++) { float a = k / 6f * Mathf.PI * 2; B.Sphere(T.At(x + Mathf.Cos(a) * 0.46f, 0, z + Mathf.Sin(a) * 0.46f).Size(0.1f, 0.05f, 0.1f), H("#7A6A5C"), 0, 3, 6); }
            }
            else if (t == 'Z')
            {
                var bc = H("#B9B2A6");
                for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) B.Box(T.At(x - 0.33f + i * 0.33f, yTop + 0.004f, z - 0.33f + j * 0.33f).Size(0.29f, 0.008f, 0.29f), MeshKit.Mul(bc, 0.9f + Hsh(c * 3 + i, r * 3 + j, 2) * 0.12f));
            }
            else if (t == '.' && Hsh(c, r, 9) > 0.86f)
            {
                B.Sphere(T.At(x + (Hsh(c, r, 12) - 0.5f) * 0.5f, yTop, z + (Hsh(c, r, 13) - 0.5f) * 0.5f).Size(0.07f, 0.04f, 0.06f), H("#A39C92"), 0, 3, 6);
                B.Sphere(T.At(x + (Hsh(c, r, 14) - 0.5f) * 0.6f, yTop + 0.02f, z + (Hsh(c, r, 15) - 0.5f) * 0.6f).S(0.025f), H(Hsh(c, r, 16) > 0.5f ? "#F7E36B" : "#FFFFFF"), 0.1f, 3, 5);
            }
            else if (t == '.' && Hsh(c, r, 9) > 0.7f)
                for (int i = 0; i < 3; i++) B.Cone(T.At(x + (Hsh(c, r, i + 11) - 0.5f) * 0.6f + i * 0.03f, yTop, z + (Hsh(c, r, i + 15) - 0.5f) * 0.6f).Size(0.025f, 0.08f, 0.025f), MeshKit.Shade(grass[0], -0.25f), 0, 4);
        }

        static void Surround(MeshKit B, int cols, int rows, int act)
        {
            var pal = Rim[Mathf.Clamp(act, 1, 4) - 1]; const int E = 4;
            Color H(string h) => MeshKit.Hex(h);
            void Tree(float x, float z, float h) { B.Cyl(T.At(x, -0.06f, z).Size(0.06f, 0.25f, 0.06f), H("#7A5134"), 0, 6); B.Cone(T.At(x, 0.12f, z).Size(0.32f, h * 0.6f, 0.32f), H("#2E8A4D"), 0, 7); B.Cone(T.At(x, 0.12f + h * 0.3f, z).Size(0.24f, h * 0.5f, 0.24f), H("#3BA05A"), 0, 7); }
            void Round(float x, float z, float h) { B.Cyl(T.At(x, -0.06f, z).Size(0.06f, 0.3f, 0.06f), H("#7A5134"), 0, 6); B.Sphere(T.At(x, 0.3f + h * 0.25f, z).S(0.3f + h * 0.1f), H("#4FA45A"), 0, 5, 9); }
            void Rock(float x, float z, float s, string col = "#A39C92") => B.Sphere(T.At(x, -0.06f, z).Size(s, s * 0.7f, s * 0.9f), H(col), 0, 4, 7);
            for (int r = -E; r < rows + E; r++)
                for (int c = -E; c < cols + E; c++)
                {
                    if (r >= 0 && r < rows && c >= 0 && c < cols) continue;
                    float x = c + 0.5f, z = r + 0.5f, h = Hsh(c + 99, r + 99, 1);
                    var g = H(((c + r) % 2 + 2) % 2 == 1 ? pal[0] : pal[1]);
                    B.Box(T.At(x, -0.38f, z).Size(1, 0.64f, 1), H(pal[2]), 0, MeshKit.Mul(g, 0.94f + h * 0.06f));
                    int d = Mathf.Max(c < 0 ? -c : c >= cols ? c - cols + 1 : 0, r < 0 ? -r : r >= rows ? r - rows + 1 : 0);
                    if (d < 2 && h < 0.75f) continue;
                    float k = Hsh(c + 7, r + 3, 4), ox = (Hsh(c, r, 5) - 0.5f) * 0.4f, oz = (Hsh(c, r, 6) - 0.5f) * 0.4f;
                    if (act == 2)
                    {
                        if (k > 0.82f) { B.Cyl(T.At(x + ox, -0.06f, z + oz).Size(0.08f, 0.55f, 0.08f), H("#3F8F4E"), 0, 7); B.Cyl(T.At(x + ox + 0.1f, 0.2f, z + oz).Size(0.05f, 0.22f, 0.05f), H("#3F8F4E"), 0, 6); }
                        else if (k > 0.62f) B.Sphere(T.At(x + ox, -0.08f, z + oz).Size(0.5f, 0.2f, 0.4f), H("#E3CC88"), 0, 4, 8);
                        else if (k > 0.5f) Rock(x + ox, z + oz, 0.18f, "#B9926A");
                    }
                    else if (act == 3)
                    {
                        if (k > 0.8f) { B.Cone(T.At(x + ox, -0.06f, z + oz).Size(0.1f, 0.6f, 0.1f).Rz(0.2f), H("#9FE4FF"), 0.55f, 5); B.Cone(T.At(x + ox + 0.12f, -0.06f, z + oz).Size(0.07f, 0.38f, 0.07f).Rz(-0.3f), H("#C9A7FF"), 0.55f, 5); }
                        else if (k > 0.62f) { B.Cyl(T.At(x + ox, -0.06f, z + oz).Size(0.04f, 0.18f, 0.04f), H("#E9E1F5"), 0, 5); B.Sphere(T.At(x + ox, 0.13f, z + oz).Size(0.14f, 0.07f, 0.14f), H("#7B5CC9"), 0.2f, 4, 8); }
                        else if (k > 0.5f) Rock(x + ox, z + oz, 0.22f, "#5F567E");
                    }
                    else if (act == 4)
                    {
                        if (k > 0.8f) B.Cone(T.At(x + ox, -0.06f, z + oz).Size(0.16f, 0.7f, 0.16f), H("#2E2733"), 0, 5);
                        else if (k > 0.7f) B.Box(T.At(x + ox, -0.055f, z + oz).Size(0.5f, 0.01f, 0.4f).Ry(k * 3), H("#FF7A2E"), 0.9f);
                        else if (k > 0.55f) { B.Cyl(T.At(x + ox, -0.06f, z + oz).Size(0.05f, 0.5f, 0.05f).Rz(0.15f), H("#4A3A34"), 0, 5); B.Cyl(T.At(x + ox + 0.08f, 0.25f, z + oz).Size(0.03f, 0.22f, 0.03f).Rz(-0.8f), H("#4A3A34"), 0, 5); }
                    }
                    else
                    {
                        if (k > 0.74f) Tree(x + ox, z + oz, 0.7f + h * 0.5f);
                        else if (k > 0.6f) Round(x + ox, z + oz, h);
                        else if (k > 0.52f) Rock(x + ox, z + oz, 0.2f);
                        else if (k > 0.44f)
                        {
                            string[] fc = { "#F7E36B", "#F7A8C9", "#FFFFFF" };
                            for (int i = 0; i < 3; i++) B.Sphere(T.At(x + (Hsh(c, r, i + 20) - 0.5f) * 0.7f, -0.04f, z + (Hsh(c, r, i + 23) - 0.5f) * 0.7f).S(0.035f), H(fc[i]), 0.1f, 3, 5);
                        }
                    }
                }
            Color fr = H("#6E4A2E"), fr2 = H("#8A5E3A");
            B.Box(T.At(cols / 2f, 0, -0.06f).Size(cols + 0.24f, 0.1f, 0.12f), fr, 0, fr2);
            B.Box(T.At(cols / 2f, 0, rows + 0.06f).Size(cols + 0.24f, 0.1f, 0.12f), fr, 0, fr2);
            B.Box(T.At(-0.06f, 0, rows / 2f).Size(0.12f, 0.1f, rows), fr, 0, fr2);
            B.Box(T.At(cols + 0.06f, 0, rows / 2f).Size(0.12f, 0.1f, rows), fr, 0, fr2);
        }
    }
}
