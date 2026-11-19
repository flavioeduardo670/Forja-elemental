using System.Collections.Generic;
using ForjaElemental.Core;
using UnityEngine;

namespace ForjaElemental.Game
{
    /// <summary>
    /// Recebe os efeitos do motor (ICombatFx) e desenha: números flutuantes (via HUD),
    /// ondas de choque, feixes e projéteis. Não afeta a lógica.
    /// </summary>
    public sealed class CombatFx : MonoBehaviour, ICombatFx
    {
        public BoardView board;
        public CameraRig rig;
        public GameHud hud;
        Material lineMat;

        sealed class Fx { public LineRenderer lr; public float life, max, radius; public bool ring; public Vector3 center; }
        readonly List<Fx> active = new List<Fx>();
        readonly Stack<LineRenderer> pool = new Stack<LineRenderer>();
        readonly List<GameObject> shots = new List<GameObject>();
        readonly Stack<GameObject> shotPool = new Stack<GameObject>();
        Material shotMat;

        void Awake()
        {
            var sh = Shader.Find("Sprites/Default");
            lineMat = new Material(sh);
            shotMat = new Material(sh);
        }

        static Color Col(string hex) { var c = MeshKit.Hex(hex); return c; }

        LineRenderer Line()
        {
            var lr = pool.Count > 0 ? pool.Pop() : new GameObject("fx").AddComponent<LineRenderer>();
            lr.transform.SetParent(transform);
            lr.gameObject.SetActive(true);
            lr.sharedMaterial = lineMat; lr.useWorldSpace = true; lr.numCapVertices = 2;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; lr.receiveShadows = false;
            return lr;
        }

        public void Text(double x, double y, string text, string color, double scale) => hud?.FloatText(board.World(x, y, 1.1f), text, color, (float)scale);
        public void Burst(double x, double y, string color, int count) { }
        public void Shock(double x, double y, double radius, string color)
        {
            var lr = Line(); lr.loop = true; lr.positionCount = 28; lr.widthMultiplier = 0.06f;
            var c = Col(color); lr.startColor = lr.endColor = new Color(c.r, c.g, c.b, 0.9f);
            active.Add(new Fx { lr = lr, life = 0.38f, max = 0.38f, radius = (float)radius, ring = true, center = board.World(x, y, 0.05f) });
            if (radius >= 2.5 && rig) rig.shake = Mathf.Max(rig.shake, Mathf.Min(10, (float)radius * 1.6f));
        }
        public void Beam(double x1, double y1, double x2, double y2, string color)
        {
            var lr = Line(); lr.loop = false; lr.positionCount = 2; lr.widthMultiplier = 0.07f;
            var c = Col(color); lr.startColor = lr.endColor = c;
            lr.SetPosition(0, board.World(x1, y1, 0.55f)); lr.SetPosition(1, board.World(x2, y2, 0.55f));
            active.Add(new Fx { lr = lr, life = 0.22f, max = 0.22f });
        }
        public void Slash(double x, double y, double angle, string color, bool big) { }
        public void Death(Combatant u) { }
        public void Sfx(string name, bool arg = false) { }
        public void Log(string text, string type) => hud?.AddLog(text, type);
        public void Wave(int n, int of, int count) => hud?.Banner($"Onda {n} de {of}", 2.2f);

        /// <summary>Atualiza efeitos e desenha os projéteis atuais do combate.</summary>
        public void Tick(float dt, CombatState c)
        {
            for (int i = active.Count - 1; i >= 0; i--)
            {
                var f = active[i]; f.life -= dt;
                if (f.life <= 0) { f.lr.gameObject.SetActive(false); pool.Push(f.lr); active.RemoveAt(i); continue; }
                float k = f.life / f.max;
                var col = f.lr.startColor; col.a = k; f.lr.startColor = f.lr.endColor = col;
                if (f.ring)
                {
                    float r = 0.15f + (1 - k) * f.radius;
                    for (int p = 0; p < f.lr.positionCount; p++) { float a = p / (float)f.lr.positionCount * Mathf.PI * 2; f.lr.SetPosition(p, f.center + new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r)); }
                }
            }
            foreach (var s in shots) { s.SetActive(false); shotPool.Push(s); }
            shots.Clear();
            if (c == null) return;
            foreach (var p in c.Projectiles)
            {
                var go = shotPool.Count > 0 ? shotPool.Pop() : CreateShot();
                go.SetActive(true);
                go.transform.position = board.World(p.X, p.Y, 0.55f);
                go.GetComponent<Renderer>().material.color = Col(p.Color);
                shots.Add(go);
            }
        }

        GameObject CreateShot()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(transform); go.transform.localScale = Vector3.one * 0.12f;
            var r = go.GetComponent<Renderer>(); r.sharedMaterial = shotMat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }
    }
}
