using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace ForjaElemental.Core
{
    /// <summary>
    /// Simulação headless de expedições com a mesma IA simples de tests/sim.js (ver SimpleAi),
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

        public readonly Expedition G;
        public readonly SimpleAi Ai;

        /// <summary>Chamado após cada passo do laço principal (para traços de paridade).</summary>
        public Action<Expedition> OnStep;

        public ExpeditionSim(GameData data, string ai = null)
        {
            G = new Expedition(data);
            G.Meta.MaxAscension = 5; G.Meta.SeenTutorial = true;
            Ai = new SimpleAi(G, ai);
        }

        /// <summary>Joga uma expedição inteira. Lança exceção se um combate não terminar.</summary>
        public RunResult PlayRun(string seed, int ascension, int players, string scaling, OrderedDict<int[]> docStats = null)
        {
            G.NewRun(seed, ascension, players, scaling: scaling);
            OnStep?.Invoke(G);
            int steps = 0;
            while (G.Run.Phase != "END" && steps++ < 600)
            {
                string doc = Ai.Step();
                if (G.Run.Phase == "COMBAT")
                {
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
            var sum = new Summary { Ai = sim.Ai.FixTactic ?? (sim.Ai.Smart ? "smart" : "dumb"), Mode = scaling, Runs = runs, Asc = asc, Players = players };
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
