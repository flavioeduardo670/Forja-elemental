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
