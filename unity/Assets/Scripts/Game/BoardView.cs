using System.Linq;
using ForjaElemental.Core;
using UnityEngine;

namespace ForjaElemental.Game
{
    /// <summary>
    /// Tabuleiro 3D. Coordenadas do motor (x = coluna, y = linha, 0 = topo/inimigo) viram o mundo
    /// do Unity como (x, altura, ROWS − y): o lado do jogador fica perto da câmera.
    /// </summary>
    public sealed class BoardView : MonoBehaviour
    {
        public Material material;
        GameData d;
        MeshFilter mf;
        string builtKey;
        char[] terrain;

        public int Cols => d.Config.COLS;
        public int Rows => d.Config.ROWS;

        public void Init(GameData data)
        {
            d = data;
            mf = GetComponent<MeshFilter>(); if (!mf) mf = gameObject.AddComponent<MeshFilter>();
            var mr = GetComponent<MeshRenderer>(); if (!mr) mr = gameObject.AddComponent<MeshRenderer>();
            mr.sharedMaterial = material;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            mr.receiveShadows = true;
        }

        /// <summary>Reconstrói a malha se o terreno ou o Ato mudaram.</summary>
        public void Show(char[] t, int act)
        {
            string key = new string(t) + "|" + act;
            if (key == builtKey) return;
            builtKey = key; terrain = (char[])t.Clone();
            if (mf.sharedMesh) Destroy(mf.sharedMesh);
            mf.sharedMesh = TerrainBuilder.Build((c, r) => Board.TerrainAt(d, terrain, c, r), Cols, Rows, act, d.Config.PlayerRow);
        }

        /* ---------------- destaque de casas (posicionamento) ---------------- */
        MeshFilter hlFilter;
        string hlKey;

        /// <summary>Pinta casas do tabuleiro (cor com alfa). Lista vazia apaga.</summary>
        public void Highlight(System.Collections.Generic.List<(int c, int r, Color col)> tiles)
        {
            string key = tiles == null ? "" : string.Join(";", tiles.Select(t => $"{t.c},{t.r},{t.col}"));
            if (key == hlKey) return;
            hlKey = key;
            if (hlFilter == null)
            {
                var go = new GameObject("Destaques"); go.transform.SetParent(transform, false);
                hlFilter = go.AddComponent<MeshFilter>();
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = new Material(Shader.Find("Sprites/Default"));
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; mr.receiveShadows = false;
            }
            if (hlFilter.sharedMesh) Destroy(hlFilter.sharedMesh);
            if (tiles == null || tiles.Count == 0) { hlFilter.sharedMesh = null; return; }
            var v = new System.Collections.Generic.List<Vector3>(); var cols = new System.Collections.Generic.List<Color>(); var idx = new System.Collections.Generic.List<int>();
            foreach (var (c, r, col) in tiles)
            {
                float y = GroundAt(c + 0.5, r + 0.5) + 0.025f; const float m = 0.06f;
                int b = v.Count;
                v.Add(new Vector3(c + m, y, Rows - r - m)); v.Add(new Vector3(c + 1 - m, y, Rows - r - m));
                v.Add(new Vector3(c + 1 - m, y, Rows - r - 1 + m)); v.Add(new Vector3(c + m, y, Rows - r - 1 + m));
                for (int i = 0; i < 4; i++) cols.Add(col);
                idx.AddRange(new[] { b, b + 1, b + 2, b, b + 2, b + 3 });
            }
            var mesh = new Mesh { name = "Destaques" };
            mesh.SetVertices(v); mesh.SetColors(cols); mesh.SetTriangles(idx, 0); mesh.RecalculateBounds();
            hlFilter.sharedMesh = mesh;
        }

        public char TileAt(int c, int r) => terrain == null ? '.' : Board.TerrainAt(d, terrain, c, r);

        /// <summary>Altura do chão (groundAt do JS: ponte fica um pouco acima da água).</summary>
        public float GroundAt(double x, double y)
        {
            char t = TileAt((int)System.Math.Floor(x), (int)System.Math.Floor(y));
            return t == 'B' ? 0.07f : TerrainBuilder.Elev(t);
        }

        public Vector3 World(double x, double y, float lift = 0) => new Vector3((float)x, GroundAt(x, y) + lift, Rows - (float)y);
        public Vector3 TileCenter(int c, int r, float lift = 0) => World(c + 0.5, r + 0.5, lift);

        /// <summary>Raio da câmera → coordenadas do motor (interseção com o plano do chão).</summary>
        public bool ScreenToBoard(Camera cam, Vector2 screen, out double x, out double y)
        {
            var ray = cam.ScreenPointToRay(screen);
            x = y = 0;
            float h = 0;
            for (int i = 0; i < 3; i++)
            {
                var plane = new Plane(Vector3.up, new Vector3(0, h, 0));
                if (!plane.Raycast(ray, out float dist)) return false;
                var p = ray.GetPoint(dist);
                x = p.x; y = Rows - p.z;
                h = GroundAt(x, y);
            }
            return x >= 0 && y >= 0 && x < Cols && y < Rows;
        }
    }
}
