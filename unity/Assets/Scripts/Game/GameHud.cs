using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using ForjaElemental.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace ForjaElemental.Game
{
    /// <summary>
    /// HUD em UI Toolkit (Assets/UI/Game/GameHud.uxml): barra superior, Quartel, inspetor/exército,
    /// banco e mochila, briefing, mapa, escolhas pendentes, tela inicial e a camada do mundo
    /// (barras de vida, números de dano). Painéis laterais e dock recolhem (botão − ou tecla H).
    /// </summary>
    public sealed class GameHud
    {
        readonly GameController gc;
        readonly VisualElement root, world, leftPanel, rightPanel, dock, briefing, actionBar, banner, toasts, playerTabs;
        readonly ScrollView leftBody, rightBody;
        readonly VisualElement dockBody, mapOverlay, mapFloors, modalOverlay, modal, startOverlay, startCard;
        readonly Label roomLabel, citadelLabel, goldLabel, threatLabel, bannerLabel, leftTitle, rightTitle, limitLabel, mapTitle, mapSub;
        readonly Button speedButton, pauseButton, autoButton;
        readonly List<(string text, string type)> log = new List<(string, string)>();
        bool wide, startOpen = true;
        float bannerTime;
        Pending shownPending; string shownPhase;

        Expedition G => gc.G;
        GameData D => gc.Data;
        static readonly CultureInfo Ci = CultureInfo.InvariantCulture;

        public GameHud(GameController gc, VisualElement root)
        {
            this.gc = gc; this.root = root;
            // a raiz do documento ocupa o painel inteiro; o conteúdo do UXML cresce dentro dela
            root.style.position = Position.Absolute;
            root.style.left = 0; root.style.top = 0; root.style.right = 0; root.style.bottom = 0;
            foreach (var child in root.Children()) child.style.flexGrow = 1;
            T Q<T>(string n) where T : VisualElement => root.Q<T>(n);
            world = Q<VisualElement>("worldLayer");
            leftPanel = Q<VisualElement>("leftPanel"); rightPanel = Q<VisualElement>("rightPanel"); dock = Q<VisualElement>("dock");
            leftBody = Q<ScrollView>("leftBody"); rightBody = Q<ScrollView>("rightBody"); dockBody = Q<VisualElement>("dockBody");
            briefing = Q<VisualElement>("briefing"); actionBar = Q<VisualElement>("actionBar"); banner = Q<VisualElement>("banner"); bannerLabel = Q<Label>("bannerLabel");
            toasts = Q<VisualElement>("toasts"); playerTabs = Q<VisualElement>("playerTabs");
            mapOverlay = Q<VisualElement>("mapOverlay"); mapFloors = Q<VisualElement>("mapFloors"); mapTitle = Q<Label>("mapTitle"); mapSub = Q<Label>("mapSub");
            modalOverlay = Q<VisualElement>("modalOverlay"); modal = Q<VisualElement>("modal");
            startOverlay = Q<VisualElement>("startOverlay"); startCard = Q<VisualElement>("startCard");
            roomLabel = Q<Label>("roomLabel"); citadelLabel = Q<Label>("citadelLabel"); goldLabel = Q<Label>("goldLabel"); threatLabel = Q<Label>("threatLabel");
            leftTitle = Q<Label>("leftTitle"); rightTitle = Q<Label>("rightTitle"); limitLabel = Q<Label>("limitLabel");
            speedButton = Q<Button>("speedButton"); pauseButton = Q<Button>("pauseButton"); autoButton = Q<Button>("autoButton");
            foreach (var sv in new[] { leftBody, rightBody }) { sv.verticalScrollerVisibility = ScrollerVisibility.Hidden; sv.horizontalScrollerVisibility = ScrollerVisibility.Hidden; }

            Q<Button>("mapButton").clicked += ToggleMap;
            Q<Button>("mapClose").clicked += () => mapOverlay.AddToClassList("hidden");
            speedButton.clicked += () => { gc.Speed = gc.Speed >= 4 ? 1 : gc.Speed * 2; Refresh(); };
            pauseButton.clicked += () => { G.TogglePause(); Refresh(); };
            autoButton.clicked += () => { gc.AutoPlay = !gc.AutoPlay; Refresh(); };
            Q<Button>("layoutButton").clicked += ToggleWide;
            Q<Button>("camButton").clicked += () => gc.Rig.Act("tilt");
            Q<Button>("menuButton").clicked += () => OpenStart(true);
            Q<Button>("leftCollapse").clicked += () => Collapse(leftPanel, Q<Button>("leftCollapse"));
            Q<Button>("rightCollapse").clicked += () => Collapse(rightPanel, Q<Button>("rightCollapse"));
            Q<Button>("dockCollapse").clicked += () => Collapse(dock, Q<Button>("dockCollapse"));
            Q<Button>("limitMinus").clicked += () => { G.SetTeamLimit(G.Me().TeamLimit - 1); };
            Q<Button>("limitPlus").clicked += () => { G.SetTeamLimit(G.Me().TeamLimit + 1); };
            BuildStart();
        }

        /* ---------------- utilidades ---------------- */
        /// <summary>Remove emojis (a fonte padrão não tem esses glifos); mantém ★ e setas.</summary>
        public static string Plain(string s)
        {
            if (string.IsNullOrEmpty(s)) return s ?? "";
            var sb = new StringBuilder(s.Length);
            foreach (char ch in s)
            {
                if (char.IsSurrogate(ch) || ch == '️' || ch == '‍' || ch == '⃣') continue;
                if (ch >= '☀' && ch <= '➿' && ch != '★') continue;
                if (ch >= '⬀' && ch <= '⯿') continue;
                if (ch == '⚖' || ch == '⚒' || ch == '⏳' || ch == '⏱' || ch == 'ℹ') continue;
                sb.Append(ch);
            }
            string lead = s.Substring(0, s.Length - s.TrimStart(' ').Length);
            return lead + string.Join(" ", sb.ToString().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries)).Trim();
        }

        static Label L(string text, params string[] cls) { var l = new Label(Plain(text)); foreach (var c in cls) l.AddToClassList(c); return l; }
        static Button B(string text, Action onClick, params string[] cls) { var b = new Button(onClick) { text = Plain(text) }; foreach (var c in cls) b.AddToClassList(c); return b; }
        static VisualElement Row(params VisualElement[] kids) { var r = new VisualElement(); r.AddToClassList("row"); foreach (var k in kids) r.Add(k); return r; }
        static VisualElement Card(params string[] cls) { var v = new VisualElement(); v.AddToClassList("card"); foreach (var c in cls) v.AddToClassList(c); return v; }
        static string N(double v) => JsMath.Round(v).ToString(Ci);
        static string Pct(double v) => JsMath.Round(v * 100).ToString(Ci) + "%";
        string Roman(int a) => a switch { 1 => "I", 2 => "II", 3 => "III", 4 => "IV", _ => a.ToString() };

        void Collapse(VisualElement panel, Button btn)
        {
            panel.ToggleInClassList("collapsed");
            btn.text = panel.ClassListContains("collapsed") ? "+" : "−";
        }

        public void ToggleWide()
        {
            wide = !wide;
            foreach (var p in new[] { leftPanel, rightPanel }) p.EnableInClassList("hidden", wide);
            dock.EnableInClassList("hidden", wide);
        }

        public void ToggleMap()
        {
            if (G.Run == null) return;
            mapOverlay.ToggleInClassList("hidden");
            if (!mapOverlay.ClassListContains("hidden")) BuildMap();
        }

        public bool IsOverUi(Vector2 screen)
        {
            var panel = root.panel; if (panel == null) return false;
            var p = RuntimePanelUtils.ScreenToPanel(panel, new Vector2(screen.x, Screen.height - screen.y));
            var picked = panel.Pick(p);
            return picked != null && picked != root && picked != world;
        }

        /// <summary>Uma escolha está aberta (o modo Auto espera o atraso do relatório).</summary>
        public bool ModalBlocksAuto => G.Run != null && G.Run.Phase == "CHOICE" && G.CurrentPending()?.Kind == "report" && gc.CombatEndedAt > 0 && Time.time - gc.CombatEndedAt < 1.2f;

        /* ---------------- log, toast e banner ---------------- */
        public void AddLog(string text, string type)
        {
            log.Add((Plain(text), type));
            if (log.Count > 60) log.RemoveAt(0);
        }

        public void Toast(string text, string type)
        {
            var t = L(text, "toast", type ?? "info");
            toasts.Add(t);
            t.schedule.Execute(() => t.RemoveFromHierarchy()).StartingIn(2600);
            while (toasts.childCount > 4) toasts.RemoveAt(0);
        }

        public void Banner(string text, float seconds)
        {
            bannerLabel.text = Plain(text); banner.RemoveFromClassList("hidden"); bannerTime = seconds;
        }

        /* ---------------- camada do mundo ---------------- */
        sealed class Floater { public Label label; public Vector3 pos; public float life; }
        readonly List<Floater> floaters = new List<Floater>();
        readonly Dictionary<object, VisualElement> bars = new Dictionary<object, VisualElement>();

        public void FloatText(Vector3 worldPos, string text, string color, float scale)
        {
            if (floaters.Count > 80) return;
            var l = L(text, "float-text");
            l.style.color = MeshKit.Hex(color);
            l.style.fontSize = 14 * scale;
            l.pickingMode = PickingMode.Ignore;
            world.Add(l);
            floaters.Add(new Floater { label = l, pos = worldPos + new Vector3(UnityEngine.Random.Range(-0.12f, 0.12f), 0, 0), life = 1 });
        }

        /// <summary>Mundo → coordenadas do painel pelo viewport (vale para tela e para RenderTexture).</summary>
        Vector2 ToPanel(Vector3 w)
        {
            var vp = gc.cam.WorldToViewportPoint(w);
            var size = root.panel.visualTree.layout.size;
            return new Vector2(vp.x * size.x, (1 - vp.y) * size.y);
        }
        bool InFront(Vector3 w) => gc.cam.WorldToViewportPoint(w).z > 0;

        bool layoutLogged;
        public void Tick(float dt)
        {
            if (root.panel == null) return;
            if (!layoutLogged && root.layout.height > 0)
            {
                layoutLogged = true;
                Debug.Log($"[hud] painel {root.panel.visualTree.layout.size} raiz {root.layout.size} principal {root.Q("mainRow").layout.size} dock {dock.layout.size}");
            }
            for (int i = floaters.Count - 1; i >= 0; i--)
            {
                var f = floaters[i]; f.life -= dt; f.pos += Vector3.up * dt * 0.8f;
                if (f.life <= 0 || !InFront(f.pos)) { f.label.RemoveFromHierarchy(); floaters.RemoveAt(i); continue; }
                var p = ToPanel(f.pos);
                f.label.style.left = p.x - 14; f.label.style.top = p.y - 10; f.label.style.opacity = Mathf.Min(1, f.life * 2);
            }
            UpdateBars();
            if (bannerTime > 0) { bannerTime -= dt; if (bannerTime <= 0) banner.AddToClassList("hidden"); }
            // relatório aparece depois de um instante (a comemoração da vitória)
            if (G.Run != null && G.Run.Phase == "CHOICE" && modalOverlay.ClassListContains("hidden") && !ModalBlocksAuto) Refresh();
            if (G.Run != null && G.Run.Phase == "COMBAT" && G.Combat != null) UpdateCombatInfo();
        }

        void UpdateBars()
        {
            var seen = new HashSet<object>();
            if (G.Run != null && gc.ShowingCombat)
            {
                foreach (var (key, pos, view) in gc.Views())
                {
                    if (!(key is Combatant u) || u.Dead || u.Structure != null && !(u.Stats.MaxHp > 0)) continue;
                    var top = pos + Vector3.up * (u.IsBoss ? 1.65f : u.Structure != null ? (u.Structure == "torre" ? 2.0f : 1.8f) : u.IsSummon ? 0.75f : 1.15f);
                    if (!InFront(top)) continue;
                    seen.Add(key);
                    if (!bars.TryGetValue(key, out var bar))
                    {
                        bar = new VisualElement(); bar.AddToClassList("hpbar"); if (u.Team != "player") bar.AddToClassList("enemy");
                        bar.pickingMode = PickingMode.Ignore;
                        var fill = new VisualElement { name = "fill" }; fill.AddToClassList("hpbar-fill"); fill.pickingMode = PickingMode.Ignore; bar.Add(fill);
                        var sh = new VisualElement { name = "shield" }; sh.AddToClassList("hpbar-shield"); sh.pickingMode = PickingMode.Ignore; bar.Add(sh);
                        var mn = new VisualElement { name = "mana" }; mn.AddToClassList("hpbar-mana"); mn.pickingMode = PickingMode.Ignore; bar.Add(mn);
                        if (u.IsBoss || u.Structure != null) bar.style.width = 90;
                        world.Add(bar); bars[key] = bar;
                    }
                    var p = ToPanel(top);
                    float w = bar.resolvedStyle.width > 0 ? bar.resolvedStyle.width : 46;
                    bar.style.left = p.x - w / 2; bar.style.top = p.y;
                    bar.Q("fill").style.width = Length.Percent((float)(u.Hp / u.Stats.MaxHp * 100));
                    bar.Q("shield").style.width = Length.Percent(Mathf.Min(100, (float)(u.Shield / u.Stats.MaxHp * 100)));
                    bar.Q("mana").style.width = Length.Percent(u.IsSummon || u.Structure != null ? 0 : Mathf.Min(100, (float)(u.Mana / Math.Max(1, u.Stats.MaxMana) * 100)));
                }
            }
            else if (G.Run != null && G.CanEdit())
            {
                foreach (var (key, pos, view) in gc.Views())
                {
                    if (!(key is UnitDef u)) continue;
                    var top = pos + Vector3.up * (u.IsBoss ? 1.7f : 1.2f);
                    if (!InFront(top)) continue;
                    seen.Add(key);
                    if (!bars.TryGetValue(key, out var tag))
                    {
                        tag = L("", "unit-tag"); tag.pickingMode = PickingMode.Ignore; world.Add(tag); bars[key] = tag;
                    }
                    var lab = (Label)tag;
                    bool foe = !u.Id.All(char.IsDigit);
                    lab.text = foe
                        ? $"Nv.{u.Level}{(u.IsBoss ? " · chefe" : u.IsElite ? " · elite" : "")}{(u.Raider ? " · saqueador" : "")}{(u.Ambush ? " · emboscada" : "")}"
                        : $"Nv.{u.Level}{(u.EvoPoints > 0 ? " +PE" : "")}";
                    lab.EnableInClassList("foe-tag", foe);
                    lab.EnableInClassList("selected", u.Id == gc.SelectedId || u.Id == gc.InspectEnemyId);
                    var p = ToPanel(top); lab.style.left = p.x - 18; lab.style.top = p.y;
                }
            }
            foreach (var k in bars.Keys.Where(k => !seen.Contains(k)).ToList()) { bars[k].RemoveFromHierarchy(); bars.Remove(k); }
        }

        void UpdateCombatInfo()
        {
            var c = G.Combat;
            var info = briefing.Q<Label>("combatInfo");
            if (info == null) return;
            int foes = c.Units.Count(u => u.Team == "enemy" && !u.Dead && u.Structure == null);
            int mine = c.Units.Count(u => u.Team == "player" && !u.Dead && !u.IsSummon && u.Structure == null);
            string extra = "";
            if (c.WaveMax > 1) extra += $"   Onda {c.WaveNow}/{c.WaveMax}" + (c.WaveNow < c.WaveMax ? $" (próxima em {Math.Max(0, c.NextWaveT - c.Time):0}s)" : "");
            if (c.City != null) extra += $"   Cidade {(c.City.Dead ? "caiu" : Pct(c.City.Hp / c.City.Stats.MaxHp))}";
            if (c.Fort != null) extra += $"   Fortaleza {(c.Fort.Dead ? "caiu" : Pct(c.Fort.Hp / c.Fort.Stats.MaxHp))}" + (c.FortPool.Count > 0 && !c.Fort.Dead ? $" · {c.FortPool.Count} reforços" : "");
            info.text = $"Tempo {c.Time:0}s   Aliados {mine}   Inimigos {foes}{extra}" + (G.Paused ? "   (pausado)" : "");
        }

        /* ---------------- reconstrução ---------------- */
        public void Refresh()
        {
            var r = G.Run;
            startOverlay.EnableInClassList("hidden", r != null && !startOpen);
            if (r == null) { roomLabel.text = "Forja Elemental"; return; }
            BuildTopBar();
            BuildLeft();
            BuildRight();
            BuildCenter();
            BuildDock();
            BuildModal();
            if (!mapOverlay.ClassListContains("hidden")) BuildMap();
            if (r.Phase == "MAP" && shownPhase != "MAP" && !gc.AutoPlay) { mapOverlay.RemoveFromClassList("hidden"); BuildMap(); }
            if (r.Phase != "MAP") mapOverlay.AddToClassList("hidden");
            shownPhase = r.Phase;
        }

        void BuildTopBar()
        {
            var r = G.Run;
            var act = D.GetAct(r.Act);
            string room = r.Room > 0 ? $" · Sala {r.Room}/{D.Config.TotalRooms}" + (r.Phase == "PREP" || r.Phase == "COMBAT" ? $" · {D.NodeTypes[r.RoomType].Name}" : "") : "";
            roomLabel.text = $"{act.Short} {Plain(act.Name)}{room}";
            citadelLabel.text = $"Cidadela {r.CitadelHp}/{r.CitadelMax}";
            goldLabel.text = $"Ouro {G.Me().Gold}";
            threatLabel.text = r.Scaling == "dinamica" ? $"Ameaça {(r.Threat >= 0 ? "+" : "")}{r.Threat}" : D.Scaling.Modes[r.Scaling].Name;
            playerTabs.Clear();
            if (G.IsCoop())
                foreach (var p in r.Players)
                {
                    int pid = p.Id;
                    var b = B($"{p.Name} ({p.Gold}g){(p.Ready ? " ✓" : "")}", () => { G.SetActive(pid); gc.MarkDirty(); }, "top-btn");
                    b.EnableInClassList("btn-on", pid == r.Active);
                    b.style.borderBottomColor = MeshKit.Hex(p.Color); b.style.borderBottomWidth = 3;
                    playerTabs.Add(b);
                }
            speedButton.text = $"Vel. {gc.Speed:0}×";
            pauseButton.text = G.Paused ? "Continuar" : "Pausar";
            pauseButton.SetEnabled(r.Phase == "COMBAT");
            autoButton.EnableInClassList("btn-on", gc.AutoPlay);
            autoButton.text = gc.AutoPlay ? "Auto: ligado" : "Auto";
        }

        /* ----- Quartel (preparação) ou registro de combate ----- */
        void BuildLeft()
        {
            var r = G.Run; leftBody.Clear();
            if (!G.CanEdit())
            {
                leftTitle.text = "Registro";
                foreach (var (text, type) in Enumerable.Reverse(log).Take(40)) { var l = L(text, "log-line"); if (!string.IsNullOrEmpty(type)) l.AddToClassList(type); leftBody.Add(l); }
                return;
            }
            leftTitle.text = "Quartel";
            var me = G.Me();
            leftBody.Add(Row(L($"Recrutas de {Plain(me.Name)}", "section"), new VisualElement { name = "sp" }, B($"Rolar ({G.RerollCost(me.Id)}g)", () => G.Reroll())));
            for (int i = 0; i < me.Offers.Count; i++)
            {
                var o = me.Offers[i]; int idx = i;
                if (o == null) { leftBody.Add(L("— contratado —", "dim")); continue; }
                var a = D.Archetypes[o.Arch]; var q = D.Quartel.Quality[o.Quality];
                var card = Card("q" + o.Quality);
                card.Add(Row(L($"{a.Name}", "card-title"), L(q.Name, "dim", "gap")));
                card.Add(L($"{a.Role} · {string.Join(" / ", a.Orders.Select(x => D.Orders[x].Name))}", "dim"));
                if (o.Trait != null) card.Add(L($"Traço: {D.Traits[o.Trait].Name} — {D.Traits[o.Trait].Desc}", "wrap"));
                if (o.El != null) card.Add(L($"Elemento: {D.Elements[o.El].Name}", "dim"));
                var buy = B($"Contratar {o.Cost}g", () => G.Hire(idx), "btn-primary"); buy.SetEnabled(me.Gold >= o.Cost);
                card.Add(Row(buy, B(o.Locked ? "Destravar" : "Travar", () => G.ToggleLock(idx))));
                leftBody.Add(card);
            }
            leftBody.Add(L("Contratos (qualquer classe)", "section"));
            var grid = new VisualElement(); grid.AddToClassList("row-wrap");
            foreach (var a in D.Archetypes.Values)
            {
                string id = a.Id; int cost = G.ContractCost(id);
                var b = B($"{a.Name} {cost}g", () => G.Buy(id)); b.SetEnabled(me.Gold >= cost);
                b.tooltip = $"{a.Role} — {string.Join(" / ", a.Orders.Select(x => D.Orders[x].Name))}";
                grid.Add(b);
            }
            leftBody.Add(grid);
        }

        /* ----- Inspetor da unidade ou visão do exército ----- */
        void BuildRight()
        {
            var r = G.Run; rightBody.Clear();
            var sel = gc.SelectedId != null ? G.Find(gc.SelectedId) : null;
            var foe = gc.InspectEnemyId != null ? r.Enemies.FirstOrDefault(e => e.Id == gc.InspectEnemyId) : null;
            if (sel != null && G.CanEdit()) { rightTitle.text = "Unidade"; BuildInspector(sel); return; }
            if (foe != null && G.CanEdit()) { rightTitle.text = "Inimigo"; BuildEnemy(foe); return; }
            rightTitle.text = "Exército";
            if (gc.ShowingCombat) { BuildCombatStats(); return; }
            var syn = G.SynergyCounts(); var oc = G.OrderCounts();
            rightBody.Add(L("Sinergias elementais", "section"));
            foreach (var kv in D.Elements)
            {
                double n = syn.Get(kv.Key); if (n <= 0) continue;
                int tier = StatsCalc.SynergyTier(D, n);
                var l = L($"{kv.Value.Name} {n}  (nível {tier}/4)", tier > 0 ? "goldtext" : "dim"); l.tooltip = Plain(kv.Value.TiersText);
                rightBody.Add(l);
            }
            rightBody.Add(L("Classes e origens", "section"));
            foreach (var o in D.Orders.Values)
            {
                double n = oc.Get(o.Id); if (n <= 0) continue;
                int tier = StatsCalc.OrderTier(D, n, o);
                var l = L($"{o.Name} {n}/{string.Join("/", o.Thresholds)}", tier > 0 ? "goldtext" : "dim"); l.tooltip = Plain(o.TiersText);
                rightBody.Add(l);
            }
            if (r.Relics.Count > 0)
            {
                rightBody.Add(L("Relíquias", "section"));
                foreach (var id in r.Relics) { var l = L(D.Relics[id].Name, "wrap"); l.tooltip = Plain(D.Relics[id].Desc); rightBody.Add(l); }
            }
            rightBody.Add(L("Registro", "section"));
            foreach (var (text, type) in Enumerable.Reverse(log).Take(14)) { var l = L(text, "log-line"); if (!string.IsNullOrEmpty(type)) l.AddToClassList(type); rightBody.Add(l); }
        }

        void Stats(VisualElement parent, StatBlock s)
        {
            var g = new VisualElement(); g.AddToClassList("stat-grid");
            void S(string k, string v) => g.Add(L($"{k} {v}", "stat"));
            S("Vida", N(s.MaxHp)); S("Escudo", N(s.InitialShield)); S("AD", N(s.Ad)); S("AP", N(s.Ap)); S("Armadura", N(s.Armor));
            S("Vel. atq.", s.AttackSpeed.ToString("0.00", Ci)); S("Alcance", s.Range.ToString("0.0", Ci)); S("Crítico", Pct(s.CritChance));
            S("Mana", $"{N(s.StartMana)}/{N(s.MaxMana)}"); S("Roubo", Pct(s.Lifesteal)); S("Esquiva", Pct(s.Dodge)); S("Poder", N(StatsCalc.UnitPower(s)));
            parent.Add(g);
        }

        void BuildInspector(UnitDef u)
        {
            var a = D.Archetypes[u.ArchetypeId];
            rightBody.Add(L(u.Name, "card-title"));
            rightBody.Add(L($"{a.Role} · {string.Join(" / ", a.Orders.Select(x => D.Orders[x].Name))}", "dim"));
            rightBody.Add(L($"Nível {u.Level}  XP {u.Xp}/{G.XpToNext(u.Level)}  PE {u.EvoPoints}", u.EvoPoints > 0 ? "goldtext" : "dim"));
            if (u.Trait != null) rightBody.Add(L($"Traço: {D.Traits[u.Trait].Name} — {D.Traits[u.Trait].Desc}", "wrap"));
            Stats(rightBody, G.StatsOf(u));
            rightBody.Add(L("Habilidades", "section"));
            foreach (var sk in a.Skills)
            {
                var s = D.Skills[sk]; int lv = u.Skills.Get(sk); string id = u.Id, skid = sk;
                var card = Card();
                card.Add(Row(L($"{s.Name}", "bold"), L($"{(s.IsActive ? "ativa" : "passiva")} · Nv.{lv}/3", "dim", "gap")));
                card.Add(L(s.DescByLevel[Math.Max(0, Math.Min(2, lv == 0 ? 0 : lv - 1))], "wrap", "dim"));
                if (u.EvoPoints > 0 && lv < 3) card.Add(B(lv == 0 ? "Aprender (1 PE)" : "Aprimorar (1 PE)", () => G.UpgradeSkill(id, skid)));
                rightBody.Add(card);
            }
            rightBody.Add(L("Elementos", "section"));
            var els = new VisualElement(); els.AddToClassList("row-wrap");
            foreach (var kv in D.Elements)
            {
                int n = u.Elements.Get(kv.Key); string el = kv.Key, id = u.Id;
                var b = B($"{kv.Value.Name} {n}", () => G.AddElement(id, el)); b.SetEnabled(u.EvoPoints > 0); b.tooltip = Plain(kv.Value.PersonalDesc);
                els.Add(b);
            }
            rightBody.Add(els);
            rightBody.Add(L($"Itens ({u.Items.Count}/{D.Config.MaxItems})", "section"));
            for (int i = 0; i < u.Items.Count; i++)
            {
                int slot = i; var it = u.Items[i]; string id = u.Id;
                var card = Card(); card.Add(L($"{D.Items[it.Id].Name} ★{it.Tier}", "bold")); card.Add(L(G.ItemDesc(it.Id, it.Tier), "wrap", "dim"));
                card.Add(B("Remover", () => G.Unequip(id, slot))); rightBody.Add(card);
            }
            if (gc.SelectedBag >= 0 && gc.SelectedBag < G.Bag().Count && u.Items.Count < D.Config.MaxItems)
            {
                int bi = gc.SelectedBag; string id = u.Id;
                rightBody.Add(B($"Equipar {D.Items[G.Bag()[bi].Id].Name}", () => { G.Equip(bi, id); gc.SelectedBag = -1; }, "btn-primary"));
            }
            string uid = u.Id;
            rightBody.Add(Row(G.OnBoard(uid) ? B("Para o banco", () => { G.ToBench(uid); }) : B("Ao campo", () => G.Toggle(uid)),
                B($"Vender +{(int)Math.Floor(u.Cost * D.Config.SellRatio)}g", () => { G.Sell(uid); gc.SelectedId = null; }, "btn-danger")));
        }

        void BuildEnemy(UnitDef e)
        {
            var a = D.Archetypes[e.ArchetypeId];
            rightBody.Add(L(e.Name, "card-title"));
            rightBody.Add(L(e.IsBoss ? "Chefe" : e.IsElite ? "Elite" : $"{a.Name} · {a.Role}", "dim"));
            rightBody.Add(L($"Nível {e.Level}", "dim"));
            if (e.Affixes.Count > 0) rightBody.Add(L("Afixos: " + string.Join(", ", e.Affixes.Select(x => D.EliteAffixes[x].Name)), "wrap"));
            if (e.Elements.Count > 0) rightBody.Add(L("Elementos: " + string.Join(", ", e.Elements.Select(kv => $"{D.Elements[kv.Key].Name} {kv.Value}")), "wrap"));
            Stats(rightBody, G.EnemyStats(e));
            if (e.IsBoss) rightBody.Add(L(D.GetBoss(G.Run.Act).Mechanic, "wrap", "dim"));
            rightBody.Add(L("Habilidades: " + string.Join(", ", e.Skills.Select(kv => $"{D.Skills[kv.Key].Name} {kv.Value}")), "wrap", "dim"));
        }

        void BuildCombatStats()
        {
            var c = G.Combat;
            rightBody.Add(L("Desempenho", "section"));
            foreach (var u in c.Units.Where(x => x.Team == "player" && !x.IsSummon && x.Structure == null).OrderByDescending(x => x.DmgDealt))
                rightBody.Add(L($"{u.Name}: dano {N(u.DmgDealt)} · cura {N(u.HealDone)} · abates {u.Kills}{(u.Dead ? " · caiu" : "")}", u.Dead ? "dim" : "wrap"));
        }

        /* ----- briefing e barra de ações ----- */
        void BuildCenter()
        {
            var r = G.Run;
            briefing.Clear(); actionBar.Clear();
            briefing.EnableInClassList("hidden", false); actionBar.EnableInClassList("hidden", false);
            if (r.Phase == "MAP")
            {
                briefing.Add(L("Escolha o próximo caminho no mapa.", "bold"));
                actionBar.Add(B("Abrir mapa (M)", ToggleMap, "btn-primary", "fight-btn"));
                return;
            }
            if (r.Phase == "COMBAT")
            {
                var info = L("", "bold"); info.name = "combatInfo"; briefing.Add(info);
                actionBar.EnableInClassList("hidden", true);
                return;
            }
            if (r.Phase != "PREP") { briefing.EnableInClassList("hidden", true); actionBar.EnableInClassList("hidden", true); return; }
            var ms = D.Missions[r.Mission ?? "batalha"]; var cd = D.Conditions[r.Cond ?? "nenhuma"];
            briefing.Add(Row(L($"{ms.Name}", "bold", "goldtext"), L(ms.Short, "dim", "gap")));
            foreach (var line in MissionLines(r)) briefing.Add(L(line, "wrap", "goldtext"));
            if (r.Cond != "nenhuma") briefing.Add(L($"Condição: {cd.Name} — {cd.Desc}" + (r.CapPenalty > 0 ? $" Limite em campo nesta sala: {G.FieldLimit(G.Me())}." : ""), "wrap"));
            if (r.Doctrine != null) { var doc = D.Doctrines[r.Doctrine]; briefing.Add(L($"Doutrina: {doc.Name} — {doc.Desc}", "wrap")); briefing.Add(L($"Ponto fraco: {doc.Weak}", "wrap", "dim")); }
            if (r.RoomType == "chefe") briefing.Add(L($"{D.GetBoss(r.Act).Name}: {D.GetBoss(r.Act).Mechanic}", "wrap", "bad"));
            if (r.Intel != null) foreach (var ic in r.Intel.Counters) briefing.Add(L($"Inteligência: {D.Counters[ic.Id].Name} ({ic.Why}) — {D.Counters[ic.Id].Answer}", "wrap", "bad"));
            if (r.Objective != null) briefing.Add(L($"Objetivo bônus: {G.ObjectiveText(r.Objective)} → {r.Objective.Reward.Text}", "wrap", "goldtext"));
            double pp = G.PlayerPower(), ep = G.EnemyPower();
            briefing.Add(L($"Poder: você {N(pp)} × horda {N(ep)}" + (r.Attempt > 0 ? $" · tentativa {r.Attempt + 1}" : ""), "dim"));
            foreach (var t in D.Tactics.Values)
            {
                string id = t.Id;
                var b = B(t.Name, () => G.SetTactic(id)); b.tooltip = Plain(t.Desc); b.EnableInClassList("btn-on", r.Tactic == id);
                actionBar.Add(b);
            }
            actionBar.Add(B("Auto-posicionar", () => G.AutoArrange()));
            string fight = G.IsCoop() ? (G.Me().Ready ? "Cancelar pronto" : "Pronto!") : "Lutar!";
            actionBar.Add(B(fight, gc.StartFight, "btn-primary", "fight-btn"));
        }

        /// <summary>Detalhes da missão para o briefing (ondas, saqueadores, fortaleza).</summary>
        IEnumerable<string> MissionLines(Run r)
        {
            var foes = r.Enemies;
            switch (r.Mission)
            {
                case "ondas":
                case "defesa":
                    {
                        var waves = foes.GroupBy(e => Math.Max(1, e.Wave)).OrderBy(g => g.Key).Select(g => g.Count()).ToList();
                        if (waves.Count > 1) yield return $"{waves.Count} ondas: {waves[0]} inimigos agora, depois " + string.Join(" + ", waves.Skip(1)) + ". Cada onda entra pelo norte após 15s ou quando a atual cai.";
                        if (r.Mission == "defesa")
                        {
                            int raiders = foes.Count(e => e.Raider);
                            yield return $"Proteja a cidade atrás das suas linhas: {raiders} saqueador(es) vão direto nela. Se ela cair, a sala está perdida.";
                        }
                        break;
                    }
                case "invasao":
                    {
                        int spawn = foes.Count(e => e.FortSpawn);
                        yield return $"Derrube a fortaleza: ela envia {spawn} reforço(s) enquanto estiver de pé, protegida por 2 torres de arqueiros. Se ela cair, a horda foge.";
                        break;
                    }
            }
            int amb = foes.Count(e => e.Ambush);
            if (amb > 0) yield return $"{amb} inimigo(s) vão saltar para a sua retaguarda no início.";
        }

        /* ----- banco e mochila ----- */
        void BuildDock()
        {
            dockBody.Clear();
            var r = G.Run; var me = G.Me();
            limitLabel.text = $"Em campo {G.BoardOf(me.Id).Count}/{G.FieldLimit(me)}  (limite {me.TeamLimit}/{G.CapPerPlayer()})  ";
            for (int i = 0; i < me.Bench.Count; i++)
            {
                var u = me.Bench[i]; int slot = i;
                var s = new VisualElement(); s.AddToClassList("slot");
                if (u == null)
                {
                    s.AddToClassList("slot-empty");
                    s.RegisterCallback<ClickEvent>(_ => { if (gc.SelectedId != null && G.OnBoard(gc.SelectedId)) G.ToBench(gc.SelectedId, slot); });
                }
                else
                {
                    string id = u.Id;
                    s.Add(L(D.Archetypes[u.ArchetypeId].Name, "slot-name"));
                    s.Add(L($"Nv.{u.Level}{(u.EvoPoints > 0 ? " · PE " + u.EvoPoints : "")}", "slot-sub"));
                    s.EnableInClassList("selected", gc.SelectedId == id);
                    s.RegisterCallback<ClickEvent>(_ =>
                    {
                        if (gc.SelectedId == id && G.CanEdit()) G.Toggle(id);
                        gc.SelectedId = id; gc.InspectEnemyId = null; gc.MarkDirty();
                    });
                }
                dockBody.Add(s);
            }
            var sep = new VisualElement(); sep.AddToClassList("dock-sep"); dockBody.Add(sep);
            for (int i = 0; i < me.Bag.Count; i++)
            {
                var it = me.Bag[i]; int bi = i;
                var s = new VisualElement(); s.AddToClassList("slot");
                s.Add(L($"{D.Items[it.Id].Name}", "slot-name")); s.Add(L($"★{it.Tier}", "slot-sub"));
                s.tooltip = G.ItemDesc(it.Id, it.Tier);
                s.EnableInClassList("selected", gc.SelectedBag == bi);
                s.RegisterCallback<ClickEvent>(_ =>
                {
                    if (gc.SelectedBag == bi && G.FusePartner(bi) >= 0) { G.Fuse(bi); gc.SelectedBag = -1; return; }
                    gc.SelectedBag = gc.SelectedBag == bi ? -1 : bi;
                    if (gc.SelectedBag >= 0 && gc.SelectedId != null && G.Find(gc.SelectedId) != null && G.Find(gc.SelectedId).Items.Count < D.Config.MaxItems && G.CanEdit())
                    { G.Equip(bi, gc.SelectedId); gc.SelectedBag = -1; }
                    gc.MarkDirty();
                });
                dockBody.Add(s);
            }
            if (me.Bag.Count == 0) dockBody.Add(L("Mochila vazia", "dim"));
        }

        /* ----- mapa ----- */
        void BuildMap()
        {
            var r = G.Run; mapFloors.Clear();
            var act = D.GetAct(r.Act);
            mapTitle.text = $"{act.Short} — {Plain(act.Name)}";
            mapSub.text = r.Phase == "MAP" ? "Escolha a próxima sala (destacadas)." : "Mapa do Ato atual.";
            var avail = r.Phase == "MAP" ? new HashSet<string>(G.AvailableNodes().Select(n => n.Id)) : new HashSet<string>();
            foreach (var floor in r.Map.Floors)
            {
                var col = new VisualElement(); col.AddToClassList("map-floor");
                foreach (var n in floor)
                {
                    var nt = D.NodeTypes[n.Type]; string id = n.Id;
                    string extra = n.Mission != null && n.Mission != "batalha" ? D.Missions[n.Mission].Name : null;
                    if (n.Cond != null && n.Cond != "nenhuma") extra = (extra != null ? extra + "\n" : "") + D.Conditions[n.Cond].Name;
                    var b = B(nt.Name, () => { G.ChooseNode(id); mapOverlay.AddToClassList("hidden"); gc.MarkDirty(); }, "map-node");
                    b.text = Plain(nt.Name) + (extra != null ? "\n" + Plain(extra) : "");
                    b.tooltip = Plain(nt.Desc + "\n" + nt.Reward);
                    b.EnableInClassList("available", avail.Contains(id));
                    b.EnableInClassList("visited", r.Visited.Contains(id));
                    b.EnableInClassList("current", r.NodeId == id);
                    b.SetEnabled(avail.Contains(id));
                    col.Add(b);
                }
                mapFloors.Add(col);
            }
        }

        /* ----- escolhas pendentes, relatório e fim ----- */
        void BuildModal()
        {
            var r = G.Run;
            if (r.Phase == "END") { ShowEnd(); return; }
            var p = G.CurrentPending();
            if (r.Phase != "CHOICE" || p == null || ModalBlocksAuto) { modalOverlay.AddToClassList("hidden"); shownPending = null; return; }
            modalOverlay.RemoveFromClassList("hidden");
            modal.Clear();
            var chooser = G.PendingChooser();
            modal.Add(L(p.Title ?? "", "modal-title"));
            if (!string.IsNullOrEmpty(p.Subtitle)) modal.Add(L(p.Subtitle, "modal-sub"));
            if (G.IsCoop() && p.Kind == "choice") modal.Add(L($"Escolha de {chooser.Name}", "goldtext"));
            var body = new ScrollView(); body.AddToClassList("modal-body"); body.verticalScrollerVisibility = ScrollerVisibility.Hidden;
            modal.Add(body);
            var footer = new VisualElement(); footer.AddToClassList("modal-footer");
            switch (p.Kind)
            {
                case "story":
                    foreach (var para in p.Paragraphs ?? new List<string>()) { var l = L(para, "wrap"); l.enableRichText = true; l.style.marginBottom = 6; body.Add(l); }
                    footer.Add(B(p.Button ?? "Continuar", () => G.SkipPending(), "btn-primary"));
                    break;
                case "choice":
                    for (int i = 0; i < p.Options.Count; i++)
                    {
                        var o = p.Options[i]; int idx = i;
                        var b = B($"{o.Title}{(o.Tag != null ? "  [" + o.Tag + "]" : "")}\n{o.Desc}", () => G.ResolveOption(idx), "option");
                        b.text = Plain($"{o.Title}{(o.Tag != null ? "  [" + o.Tag + "]" : "")}") + "\n" + Plain(o.Desc);
                        b.SetEnabled(G.OptionAffordable(o));
                        body.Add(b);
                    }
                    if (p.AllowSkip || p.Options.Count == 0) footer.Add(B("Pular", () => G.SkipPending()));
                    break;
                case "shop":
                    body.Add(L($"Ouro de {G.Me().Name}: {G.Me().Gold}g", "goldtext"));
                    for (int i = 0; i < p.Offers.Count; i++)
                    {
                        var o = p.Offers[i]; int idx = i;
                        var b = B("", () => G.ResolveOption(idx), "option");
                        b.text = Plain($"{o.Title} — {o.Price}g{(o.Sold ? $" (vendido a {o.Buyer})" : "")}") + "\n" + Plain(o.Desc);
                        b.SetEnabled(!o.Sold && G.Me().Gold >= o.Price);
                        body.Add(b);
                    }
                    footer.Add(B("Seguir viagem", () => G.SkipPending(), "btn-primary"));
                    break;
                case "report":
                    BuildReport(body, p);
                    footer.Add(B(p.Final ? "Concluir expedição" : "Continuar", () => { G.SkipPending(); gc.CombatEndedAt = -1; }, "btn-primary"));
                    break;
            }
            modal.Add(footer);
            shownPending = p;
        }

        void BuildReport(VisualElement body, Pending p)
        {
            var rw = p.Rewards;
            body.Add(L($"Duração: {p.Time:0}s", "dim"));
            foreach (var line in p.Lines ?? new List<string>()) body.Add(L(line, "wrap"));
            if (rw != null)
            {
                foreach (var x in rw.Xp) if (x.N > 0) body.Add(L($"XP: +{x.Each} para cada uma das {x.N} unidade(s){(G.IsCoop() ? " de " + G.P(x.Pid).Name : "")}", "dim"));
                if (rw.Objective != null) body.Add(L($"Objetivo: {rw.Objective.Text} — {(rw.Objective.Done ? "cumprido! " + rw.Objective.Reward : "não cumprido")}", rw.Objective.Done ? "good" : "dim"));
                if (rw.Threat != null) body.Add(L($"Ameaça: {rw.Threat.Before} → {rw.Threat.After} ({rw.Threat.Why})", "dim"));
                if (rw.Citadel != null) body.Add(L($"Cidadela {(rw.Citadel.Delta >= 0 ? "+" : "")}{rw.Citadel.Delta} ({rw.Citadel.Hp}/{rw.Citadel.Max})", rw.Citadel.Delta >= 0 ? "good" : "bad"));
                foreach (var e in rw.Extras) body.Add(L(e.Text, e.Dim ? "dim" : "wrap"));
            }
            foreach (var lu in p.LevelUps ?? new List<string>()) body.Add(L(lu, "goldtext"));
            body.Add(L("Desempenho", "section"));
            foreach (var x in (p.Report ?? new List<CombatReportRow>()).OrderByDescending(x => x.DmgDealt))
                body.Add(L($"{x.Name}: dano {N(x.DmgDealt)} · sofrido {N(x.DmgTaken)} · cura {N(x.HealDone)} · abates {x.Kills}{(x.Survived ? "" : " · caiu")}", x.Survived ? "wrap" : "dim"));
        }

        void ShowEnd()
        {
            var r = G.Run; var e = r.Ended;
            modalOverlay.RemoveFromClassList("hidden"); modal.Clear();
            modal.Add(L(e != null && e.Victory ? "A Forja foi salva!" : "A Cidadela caiu.", "modal-title"));
            if (e != null && e.Victory) foreach (var para in D.Epilogue) { var l = L(para, "wrap"); l.enableRichText = true; modal.Add(l); }
            modal.Add(L($"Sala alcançada: {r.Room}/{D.Config.TotalRooms} · vitórias {r.Stats.Wins} · derrotas {r.Stats.Losses} · abates {r.Stats.Kills}", "wrap"));
            if (e != null) modal.Add(L($"Fragmentos astrais: +{e.Shards}{(e.Unlocked ? " · nova Ascensão desbloqueada!" : "")}", "goldtext"));
            var f = new VisualElement(); f.AddToClassList("modal-footer");
            f.Add(B("Nova expedição", () => { modalOverlay.AddToClassList("hidden"); OpenStart(true); }, "btn-primary"));
            modal.Add(f);
        }

        /* ----- tela inicial ----- */
        int startPlayers = 1, startAsc;
        string startScaling = "dinamica";
        TextField seedField;

        void BuildStart()
        {
            startCard.Clear();
            startCard.Add(L("Forja Elemental", "start-title"));
            startCard.Add(L("Auto-battler tático roguelike — versão Unity", "modal-sub"));
            seedField = new TextField("Seed (opcional)") { value = seedField?.value ?? "" };
            startCard.Add(seedField);
            var modes = D.Scaling.Modes.Keys.ToList();
            Button pb = null, ab = null, sb = null;
            pb = B("", () => { startPlayers = startPlayers % 4 + 1; pb.text = PlayersText(); });
            pb.text = PlayersText();
            ab = B("", () => { startAsc = startAsc >= G.Meta.MaxAscension ? 0 : startAsc + 1; ab.text = AscText(); });
            ab.text = AscText();
            sb = B("", () => { startScaling = modes[(modes.IndexOf(startScaling) + 1) % modes.Count]; sb.text = ScaleText(); sb.tooltip = Plain(D.Scaling.Modes[startScaling].Desc); });
            sb.text = ScaleText(); sb.tooltip = Plain(D.Scaling.Modes[startScaling].Desc);
            startCard.Add(Row(pb, ab, sb));
            // sala de testes: qualquer missão × condição × Ato, direto na preparação
            startCard.Add(L("Sala de testes", "section"));
            var missions = D.Missions.Keys.ToList(); var conds = D.Conditions.Keys.ToList(); var types = new List<string> { "combate", "elite", "chefe" };
            Button mb = null, cb = null, actB = null, tb = null;
            mb = B("", () => { testMission = missions[(missions.IndexOf(testMission) + 1) % missions.Count]; mb.text = "Missão: " + D.Missions[testMission].Name; });
            mb.text = "Missão: " + D.Missions[testMission].Name;
            cb = B("", () => { testCond = conds[(conds.IndexOf(testCond) + 1) % conds.Count]; cb.text = "Condição: " + D.Conditions[testCond].Name; });
            cb.text = "Condição: " + D.Conditions[testCond].Name;
            actB = B("", () => { testAct = testAct % 4 + 1; actB.text = $"Ato {Roman(testAct)}"; });
            actB.text = $"Ato {Roman(testAct)}";
            tb = B("", () => { testType = types[(types.IndexOf(testType) + 1) % types.Count]; tb.text = D.NodeTypes[testType].Name; });
            tb.text = D.NodeTypes[testType].Name;
            var test = new VisualElement(); test.AddToClassList("row-wrap");
            test.Add(mb); test.Add(cb); test.Add(actB); test.Add(tb);
            test.Add(B("Entrar", () => EnterTestRoom()));
            startCard.Add(test);
            var footer = new VisualElement(); footer.AddToClassList("modal-footer");
            if (G.Run != null && G.Run.Phase != "END") footer.Add(B("Voltar ao jogo", () => OpenStart(false)));
            if (SaveSystem.HasRun && (G.Run == null)) footer.Add(B("Continuar expedição", () => { if (gc.ContinueRun()) OpenStart(false); }));
            footer.Add(B("Nova expedição", () => { gc.NewRun(seedField.value, startAsc, startPlayers, startScaling); OpenStart(false); }, "btn-primary"));
            startCard.Add(footer);
            startCard.Add(L($"Fragmentos astrais: {G.Meta.AstralShards} · expedições {G.Meta.Records.Runs} · vitórias {G.Meta.Records.Wins}", "dim"));
            startCard.Add(L("Botão direito: girar a câmera · roda: zoom · H: tela ampla · M: mapa · Espaço: pausa", "dim", "wrap"));
        }

        string testMission = "ondas", testCond = "nenhuma", testType = "combate";
        int testAct = 1;

        /// <summary>Entra na sala de testes (começa uma expedição se não houver uma em andamento).</summary>
        public void EnterTestRoom(string mission = null, string cond = null, int act = 0, string type = null)
        {
            if (G.Run == null || G.Run.Phase == "END" || G.Run.Phase == "COMBAT") gc.NewRun(string.IsNullOrWhiteSpace(seedField?.value) ? "TESTES" : seedField.value, startAsc, startPlayers, startScaling);
            G.EnterTestRoom(type ?? testType, mission ?? testMission, cond ?? testCond, null, act > 0 ? act : testAct);
            gc.SelectedId = null; gc.InspectEnemyId = null;
            OpenStart(false);
        }

        public void OpenStart(bool open)
        {
            startOpen = open;
            if (open) BuildStart();
            startOverlay.EnableInClassList("hidden", !open && G.Run != null);
            Refresh();
        }

        string PlayersText() => startPlayers == 1 ? "Solo" : $"Co-op {startPlayers} jogadores";
        string AscText() => startAsc == 0 ? "Ascensão 0" : $"Ascensão {Roman(startAsc)}";
        string ScaleText() => "Escala: " + D.Scaling.Modes[startScaling].Name;
    }
}
