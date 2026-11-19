using System.Collections.Generic;
using System.Linq;
using ForjaElemental.Core;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace ForjaElemental.Game
{
    /// <summary>
    /// Liga a expedição (ForjaElemental.Core) ao tabuleiro 3D, aos bonecos, à câmera e à HUD.
    /// A lógica fica toda no Core; aqui só há apresentação e entrada.
    /// </summary>
    public sealed class GameController : MonoBehaviour
    {
        public ModelCatalog catalog;
        public Material vertexColorMaterial;
        public UIDocument uiDocument;
        public Camera cam;

        public GameData Data { get; private set; }
        public Expedition G { get; private set; }
        public SimpleAi Ai { get; private set; }
        public BoardView Board { get; private set; }
        public CameraRig Rig { get; private set; }
        public GameHud Hud { get; private set; }
        public CombatFx Fx { get; private set; }

        public float Speed = 1;
        public bool AutoPlay;
        public string SelectedId;       // unidade do roster selecionada
        public string InspectEnemyId;   // inimigo selecionado na preparação
        public int SelectedBag = -1;
        public float CombatEndedAt = -1;
        bool dirty = true, saveDirty;
        float autoTimer;
        CombatState shownCombat;

        readonly Dictionary<object, UnitView> views = new Dictionary<object, UnitView>();
        readonly Dictionary<object, float> collapse = new Dictionary<object, float>();
        Transform unitsRoot;

        void Awake()
        {
            Data = GameData.Load(Resources.Load<TextAsset>("Data/forja-data").text);
            G = new Expedition(Data, SaveSystem.LoadMeta(Data));
            Ai = new SimpleAi(G);
            G.OnChanged += () => { dirty = true; saveDirty = true; };
            G.OnLog += (t, type) => Hud?.AddLog(t, type);
            G.OnToast += (t, type) => Hud?.Toast(t, type);

            var boardGo = new GameObject("Tabuleiro");
            Board = boardGo.AddComponent<BoardView>(); Board.material = vertexColorMaterial; Board.Init(Data);
            unitsRoot = new GameObject("Bonecos").transform;
            if (!cam) cam = Camera.main;
            Rig = cam.GetComponent<CameraRig>(); if (!Rig) Rig = cam.gameObject.AddComponent<CameraRig>();
            Rig.cols = Data.Config.COLS; Rig.rows = Data.Config.ROWS;
            Fx = new GameObject("Efeitos").AddComponent<CombatFx>();
            Fx.board = Board; Fx.rig = Rig;
            G.CombatFx = Fx;
            Board.Show(new string('.', Data.Config.COLS * Data.Config.ROWS).ToCharArray(), 1);
        }

        void Start()
        {
            Hud = new GameHud(this, uiDocument.rootVisualElement);
            Fx.hud = Hud;
            Rig.IsOverUi = Hud.IsOverUi;
        }

        /* ---------------- ações chamadas pela HUD ---------------- */
        public void NewRun(string seed, int asc, int players, string scaling)
        {
            ClearViews();
            G.NewRun(seed, asc, players, scaling: scaling);
            SelectedId = null; InspectEnemyId = null; SelectedBag = -1; CombatEndedAt = -1; shownCombat = null;
            SaveSystem.SaveMeta(G.Meta);
            dirty = true;
        }

        public bool ContinueRun()
        {
            var r = SaveSystem.LoadRun();
            if (r == null) return false;
            ClearViews();
            G.Run = r; G.Combat = null; G.Paused = false;
            dirty = true;
            return true;
        }

        public void StartFight()
        {
            if (G.IsCoop()) G.ToggleReady(); else G.StartCombat();
            CombatEndedAt = -1;
        }

        public void MarkDirty() => dirty = true;

        /* ---------------- laço ---------------- */
        void Update()
        {
            if (Hud == null) return;
            float dt = Time.deltaTime;
            var r = G.Run;
            if (r != null)
            {
                if (AutoPlay && r.Phase != "COMBAT" && r.Phase != "END" && !Hud.ModalBlocksAuto)
                {
                    autoTimer -= dt;
                    if (autoTimer <= 0) { autoTimer = 0.35f; Ai.Step(); CombatEndedAt = -1; }
                }
                if (r.Phase == "COMBAT" && G.Combat != null) { G.Tick(dt * Speed); if (G.Combat.Over && CombatEndedAt < 0) CombatEndedAt = Time.time; }
                else if (G.Combat != null) CombatEngine.UpdateAnim(G.Combat, dt);
                HandleBoardInput();
                HandleKeys();
            }
            if (dirty) { dirty = false; Hud.Refresh(); }
            if (saveDirty && r != null) { saveDirty = false; SaveSystem.SaveRun(G.Run); SaveSystem.SaveMeta(G.Meta); }
            SyncWorld(dt);
            Fx.Tick(dt, ShowingCombat ? G.Combat : null);
            Hud.Tick(dt);
        }

        /// <summary>O tabuleiro mostra o combate (durante a luta e logo depois, no relatório).</summary>
        public bool ShowingCombat => G.Run != null && G.Combat != null && (G.Run.Phase == "COMBAT" || (G.Run.Phase == "CHOICE" && G.Combat.Over && G.CurrentPending()?.Kind == "report"));

        /* ---------------- mundo ---------------- */
        void SyncWorld(float dt)
        {
            var r = G.Run;
            if (r == null) return;
            if (ShowingCombat) Board.Show(G.Combat.Terrain, r.Act);
            else Board.Show(r.Terrain.ToCharArray(), r.Act);
            foreach (var v in views.Values) v.Seen = false;
            bool won = ShowingCombat && G.Combat.Over && G.Combat.Result != null && G.Combat.Result.Won;
            if (ShowingCombat)
            {
                if (shownCombat != G.Combat) { ClearViews(); shownCombat = G.Combat; }
                foreach (var u in G.Combat.Units)
                {
                    var v = ViewFor(u, () => catalog.For(u), Scale(u.IsBoss, u.IsElite, u.IsSummon, u.Structure != null));
                    var pos = Board.World(u.X, u.Y, 0);
                    Vector3? face = u.Target != null && !u.Target.Dead ? Board.World(u.Target.X, u.Target.Y) : (Vector3?)null;
                    float defYaw = u.Team == "player" ? 0 : 180;
                    if (u.Structure != null)
                    {
                        // estrutura destruída desaba: afunda e achata em ~1,5s
                        float fall = 0;
                        if (u.Dead) { collapse.TryGetValue(u, out fall); fall += dt; collapse[u] = fall; }
                        v.transform.position = pos + Vector3.down * Mathf.Min(1.2f, fall * 0.8f);
                        v.transform.rotation = Quaternion.Euler(fall * 6, u.Structure == "cidade" ? 180 : 0, fall * 4);
                        v.transform.localScale = new Vector3(1, Mathf.Max(0.05f, 1 - fall * 0.6f), 1);
                        v.Seen = true; v.gameObject.SetActive(fall < 1.6f);
                        if (u.Dead && fall <= dt) Fx.Shock(u.X, u.Y, 3.0, "#D9483B");
                        continue;
                    }
                    v.Sync(pos, face, defYaw, dt, u.Stun > 0, won && u.Team == "player", (float)u.AnimAtk, (float)u.AnimCast, (float)u.Flash, u.Dead);
                    v.Seen = true;
                }
            }
            else
            {
                shownCombat = null;
                foreach (var u in r.Board)
                {
                    var v = ViewFor(u, () => catalog.For(u.ArchetypeId, true, false, null, false, u.Name, null), Scale(false, false, false, false));
                    v.Sync(Board.TileCenter((int)u.Col, (int)u.Row), null, 0, dt, false, false, 0, 0, 0, false, u.Id == SelectedId ? 0.25f : 0);
                    v.Seen = true;
                }
                if (r.Phase == "PREP" || (r.Phase == "CHOICE" && r.Enemies.Count > 0))
                {
                    foreach (var e in r.Enemies)
                    {
                        if (e.Wave > 1 || e.FortSpawn) continue;
                        var v = ViewFor(e, () => catalog.For(e.ArchetypeId, false, e.IsBoss, e.Script, false, e.Name, null), Scale(e.IsBoss, e.IsElite, false, false));
                        v.Sync(Board.TileCenter((int)e.Col, (int)e.Row), null, 180, dt, false, false, 0, 0, 0, false, e.Id == InspectEnemyId ? 0.25f : 0);
                        v.Seen = true;
                    }
                    foreach (var s in r.Structures ?? new List<StructureSpec>())
                    {
                        var v = ViewFor(s, () => catalog.Get(s.Structure), 1);
                        v.transform.position = Board.World(s.X, s.Y); v.transform.rotation = Quaternion.Euler(0, s.Structure == "cidade" ? 180 : 0, 0);
                        v.Seen = true;
                    }
                }
            }
            foreach (var key in views.Where(kv => !kv.Value.Seen).Select(kv => kv.Key).ToList()) { Destroy(views[key].gameObject); views.Remove(key); collapse.Remove(key); }
            Board.Highlight(PlacementTiles());
        }

        static readonly Color FreeTile = new Color(0.35f, 0.95f, 0.6f, 0.28f), SwapTile = new Color(0.4f, 0.75f, 1f, 0.22f), SelTile = new Color(1f, 0.78f, 0.25f, 0.5f), NoTile = new Color(1f, 0.3f, 0.3f, 0.22f);

        /// <summary>Casas onde a unidade selecionada pode ir (verde livre, azul troca, vermelho bloqueada).</summary>
        List<(int c, int r, Color col)> PlacementTiles()
        {
            var r = G.Run;
            if (r == null || ShowingCombat || !G.CanEdit() || SelectedId == null) return null;
            var u = G.Find(SelectedId);
            if (u == null || !G.IsMine(u)) return null;
            bool onBoard = G.OnBoard(u.Id);
            bool canAdd = onBoard || G.BoardOf(u.Owner).Count < G.FieldLimit(G.P(u.Owner));
            var list = new List<(int, int, Color)>();
            for (int row = Data.Config.PlayerRow; row < Data.Config.ROWS; row++)
                for (int c = 0; c < Data.Config.COLS; c++)
                {
                    if (onBoard && (int)u.Col == c && (int)u.Row == row) { list.Add((c, row, SelTile)); continue; }
                    if (G.NoPlace(c, row)) { list.Add((c, row, NoTile)); continue; }
                    var occ = r.Board.FirstOrDefault(x => (int)x.Col == c && (int)x.Row == row);
                    if (occ != null) { if (occ.Owner == u.Owner) list.Add((c, row, SwapTile)); continue; }
                    if (canAdd) list.Add((c, row, FreeTile));
                }
            return list;
        }

        static float Scale(bool boss, bool elite, bool summon, bool structure) =>
            structure ? 1 : (boss ? 0.95f : elite ? 1.12f : summon ? 0.85f : 1) * UnitView.UnitScale;

        UnitView ViewFor(object key, System.Func<GameObject> prefab, float scale)
        {
            if (views.TryGetValue(key, out var v)) return v;
            v = UnitView.Create(prefab(), unitsRoot, key, scale);
            views[key] = v;
            return v;
        }

        void ClearViews() { foreach (var v in views.Values) if (v) Destroy(v.gameObject); views.Clear(); }

        /// <summary>Posição de tela de uma unidade (para a HUD).</summary>
        public IEnumerable<(object key, Vector3 world, UnitView view)> Views() => views.Select(kv => (kv.Key, kv.Value.transform.position, kv.Value));

        /* ---------------- entrada ---------------- */
        void HandleKeys()
        {
            var k = Keyboard.current; if (k == null) return;
            if (k.hKey.wasPressedThisFrame) Hud.ToggleWide();
            if (k.escapeKey.wasPressedThisFrame) { SelectedId = null; InspectEnemyId = null; SelectedBag = -1; dirty = true; }
            if (k.spaceKey.wasPressedThisFrame && G.Run.Phase == "COMBAT") G.TogglePause();
            if (k.mKey.wasPressedThisFrame) Hud.ToggleMap();
        }

        void HandleBoardInput()
        {
            var m = Mouse.current; if (m == null || !m.leftButton.wasPressedThisFrame) return;
            if (Keyboard.current != null && Keyboard.current.shiftKey.isPressed) return;
            var sp = m.position.ReadValue();
            if (Hud.IsOverUi(sp) || !G.CanEdit()) return;
            if (!Board.ScreenToBoard(cam, sp, out double x, out double y)) return;
            int c = (int)x, row = (int)y;
            var r = G.Run;
            var mine = r.Board.FirstOrDefault(u => (int)u.Col == c && (int)u.Row == row);
            var foe = r.Enemies.FirstOrDefault(e => (int)e.Col == c && (int)e.Row == row && e.Wave <= 1 && !e.FortSpawn);
            if (foe != null) { InspectEnemyId = foe.Id; SelectedId = null; dirty = true; return; }
            if (SelectedId != null && G.Find(SelectedId) != null && row >= Data.Config.PlayerRow)
            {
                if (mine != null && mine.Id == SelectedId) { SelectedId = null; dirty = true; return; }
                if (mine == null || G.IsMine(mine)) { G.PlaceAt(SelectedId, c, row); dirty = true; return; }
            }
            if (mine != null)
            {
                if (!G.IsMine(mine)) G.SetActive(mine.Owner);
                SelectedId = mine.Id; InspectEnemyId = null; dirty = true;
                return;
            }
            SelectedId = null; InspectEnemyId = null; dirty = true;
        }
    }
}
