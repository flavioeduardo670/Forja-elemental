using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace ForjaElemental.Core
{
    /// <summary>
    /// Simulação headless de expedições com a mesma IA simples de tests/sim.js,
    /// para validar regras e medir balanceamento no C#.
    /// </summary>
    public sealed class ExpeditionSim
    {
        public sealed class RunResult { public int Room, Lvl, Losses, Units; public bool Win; }

        public sealed class Summary
        {
            public string Ai, Mode;
            public int Runs, Asc, Players, Errors, MaxLvl;
            public double WinRate, AvgRoom, AvgLosses, AvgUnits;
            public OrderedDict<int> Fim = new OrderedDict<int>();
            public OrderedDict<int[]> Doc = new OrderedDict<int[]>();
            public List<string> ErrorMessages = new List<string>();

            /// <summary>Mesmo formato do JSON impresso por tests/sim.js.</summary>
            public string ToJson()
            {
                var ci = CultureInfo.InvariantCulture;
                string F(double v, int d) => JsMath.Fixed(v, d).ToString("F" + d, ci);
                var sb = new StringBuilder();
                sb.Append($"{{\"ai\":\"{Ai}\",\"mode\":\"{Mode}\",\"runs\":{Runs},\"asc\":{Asc},\"players\":{Players},\"errors\":{Errors},");
                sb.Append($"\"winRate\":\"{F(WinRate, 2)}\",\"avgRoom\":\"{F(AvgRoom, 1)}\",\"fim\":{{");
                sb.Append(string.Join(",", Fim.Select(kv => $"\"{kv.Key}\":{kv.Value}")));
                sb.Append($"}},\"maxLvl\":{MaxLvl},\"avgLosses\":\"{F(AvgLosses, 1)}\",\"doc\":{{");
                sb.Append(string.Join(",", Doc.Select(kv => $"\"{kv.Key}\":\"{JsMath.Round(kv.Value[0] / (double)kv.Value[1] * 100).ToString(ci)}%/{kv.Value[1]}\"")));
                sb.Append($"}},\"avgUnits\":\"{F(AvgUnits, 1)}\"}}");
                return sb.ToString();
            }
        }

        static readonly string[] Order = { "vanguarda", "arcanista", "clerigo", "cacador", "paladino", "necromante", "bardo", "monge", "alquimista", "berserker", "druida", "lanceiro", "artifice", "sombra" };
        static readonly Dictionary<string, string> Tact = new Dictionary<string, string>
        {
            ["emboscada"] = "falange", ["sacerdocio"] = "retaguarda", ["artilharia"] = "retaguarda", ["ritual"] = "assalto",
            ["furia"] = "falange", ["enxame"] = "assalto", ["muralha"] = "foco"
        };
        static readonly HashSet<string> FrontPrefs = new HashSet<string> { "front", "mid", "flank" };

        readonly GameData d;
        public readonly Expedition G;
        readonly bool smart;
        readonly string fixTactic;

        /// <summary>Chamado após cada passo do laço principal (para traços de paridade).</summary>
        public Action<Expedition> OnStep;

        public ExpeditionSim(GameData data, string ai = null)
        {
            d = data;
            G = new Expedition(data);
            G.Meta.MaxAscension = 5; G.Meta.SeenTutorial = true;
            smart = ai != "dumb";
            fixTactic = ai != null && data.Tactics.ContainsKey(ai) ? ai : null;
        }

        void AiPrepPlayer(int pid)
        {
            var r = G.Run; r.Active = pid; var p = G.Me();
            int cap = G.CapPerPlayer();
            int guard = 0;
            while (guard++ < 14)
            {
                int mine = G.BoardOf(pid).Count;
                if (mine >= G.FieldLimit(p)) { if (p.TeamLimit < Math.Min(cap, 7)) G.SetTeamLimit(p.TeamLimit + 1); else break; }
                var mineU = G.UnitsOf(pid);
                int nf = mineU.Count(u => FrontPrefs.Contains(d.Archetypes[u.ArchetypeId].Pref));
                bool wantFront = nf < Math.Ceiling((mineU.Count + 1) * 0.4);
                var have = new HashSet<string>(mineU.Select(u => u.ArchetypeId));
                var oc = new Dictionary<string, int>();
                foreach (var u in G.AllUnits()) foreach (var o in d.Archetypes[u.ArchetypeId].Orders) oc[o] = (oc.TryGetValue(o, out var v) ? v : 0) + 1;
                double Score(string arch) =>
                    d.Archetypes[arch].Orders.Sum(o => Math.Min(3, oc.TryGetValue(o, out var v) ? v : 0)) * 1.2 + 0 * 1.5
                    + ((FrontPrefs.Contains(d.Archetypes[arch].Pref) == wantFront) ? 2.5 : 0) + (have.Contains(arch) ? 0.3 : 0);
                string best = Order.OrderByDescending(Score).First();
                if (p.Gold >= G.ContractCost(best)) { G.Buy(best); continue; }
                break;
            }
            while (p.Bag.Count > 0 && G.BoardOf(pid).Any(u => u.Items.Count < 3)) { var u = G.BoardOf(pid).First(x => x.Items.Count < 3); G.Equip(0, u.Id); }
            foreach (var u in G.UnitsOf(pid))
                while (u.EvoPoints > 0)
                {
                    var a = d.Archetypes[u.ArchetypeId];
                    string sk = a.Skills.FirstOrDefault(s => u.Skills.Get(s) < 3 && d.Skills[s].Type == "ativa" && u.Skills.Get(s) != 0) ?? a.Skills.FirstOrDefault(s => u.Skills.Get(s) < 3);
                    if (sk != null && u.Level % 2 == 0) G.UpgradeSkill(u.Id, sk);
                    else G.AddElement(u.Id, new[] { "fogo", "pedra", "agua" }[int.Parse(u.Id) % 3]);
                }
            G.AutoArrange();
        }

        void AiPrep()
        {
            if (G.Run.Phase == "PREP")
            {
                if (fixTactic != null) G.SetTactic(fixTactic);
                else if (smart) G.SetTactic(G.Run.Doctrine != null && Tact.TryGetValue(G.Run.Doctrine, out var t) ? t : "equilibrio");
            }
            for (int i = 0; i < G.Coop(); i++) AiPrepPlayer(i);
            G.Run.Active = 0;
        }

        /// <summary>Joga uma expedição inteira. Lança exceção se um combate não terminar.</summary>
        public RunResult PlayRun(string seed, int ascension, int players, string scaling,
            OrderedDict<int[]> docStats = null)
        {
            G.NewRun(seed, ascension, players, scaling: scaling);
            OnStep?.Invoke(G);
            int steps = 0;
            while (G.Run.Phase != "END" && steps++ < 600)
            {
                var r = G.Run;
                if (r.Phase == "CHOICE")
                {
                    var p = G.CurrentPending();
                    if (p.Kind == "shop" || p.Kind == "report" || p.Kind == "story") G.SkipPending();
                    else { int idx = p.Options.FindIndex(o => G.OptionAffordable(o)); if (idx >= 0) G.ResolveOption(idx); else G.SkipPending(); }
                }
                else if (r.Phase == "MAP")
                {
                    AiPrep();
                    var av = G.AvailableNodes();
                    var pick = av.FirstOrDefault(n => n.Type == "acampamento" && r.CitadelHp < 60) ?? av.FirstOrDefault(n => n.Type != "elite") ?? av[0];
                    G.ChooseNode(pick.Id);
                }
                else if (r.Phase == "PREP")
                {
                    AiPrep(); string doc = r.Doctrine ?? "chefe"; G.StartCombat();
                    double t = 0;
                    while (G.Run.Phase == "COMBAT" && t < 200) { G.Tick(0.05); t += 0.05; }
                    if (t >= 200) throw new Exception("combate não terminou");
                    var rep = G.CurrentPending();
                    if (rep != null && rep.Kind == "report" && docStats != null)
                    {
                        if (!docStats.TryGetValue(doc, out var ds)) docStats[doc] = ds = new int[2];
                        ds[1]++; if (rep.Won) ds[0]++;
                    }
                }
                OnStep?.Invoke(G);
            }
            var e = G.Run.Ended;
            return new RunResult
            {
                Room = G.Run.Room, Win = e != null && e.Victory, Lvl = Math.Max(G.AllUnits().Select(u => u.Level).DefaultIfEmpty(0).Max(), 0),
                Losses = G.Run.Stats.Losses, Units = G.Run.Board.Count
            };
        }

        /// <summary>Equivale a `node tests/sim.js runs asc players scaling [ai]`.</summary>
        public static Summary Run(GameData data, int runs = 30, int asc = 0, int players = 1, string scaling = "dinamica", string ai = null)
        {
            var sim = new ExpeditionSim(data, ai);
            var results = new List<RunResult>();
            var sum = new Summary { Ai = sim.fixTactic ?? (sim.smart ? "smart" : "dumb"), Mode = scaling, Runs = runs, Asc = asc, Players = players };
            for (int i = 0; i < runs; i++)
            {
                try { results.Add(sim.PlayRun($"SIM{i}P{players}", asc, players, scaling, sum.Doc)); }
                catch (Exception ex) { sum.Errors++; sum.ErrorMessages.Add($"RUN {i}: {ex}"); }
            }
            int wins = results.Count(r => r.Win);
            sum.WinRate = wins / (double)runs;
            sum.AvgRoom = results.Sum(r => r.Room) / (double)Math.Max(1, results.Count);
            foreach (var r in results)
            {
                string k = r.Win ? "V" : "A" + (int)Math.Ceiling(r.Room / (double)data.Config.RoomsPerAct);
                sum.Fim[k] = sum.Fim.Get(k) + 1;
            }
            sum.MaxLvl = results.Count > 0 ? results.Max(r => r.Lvl) : 0;
            sum.AvgLosses = results.Sum(r => r.Losses) / (double)results.Count;
            sum.AvgUnits = results.Sum(r => r.Units) / (double)results.Count;
            return sum;
        }
    }
}
