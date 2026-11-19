using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using ForjaElemental.Core;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace ForjaElemental.Tests
{
    /// <summary>
    /// Paridade das regras da expedição (js/game.js) e do simulador (tests/sim.js).
    /// Referências geradas por `node tools/sim-trace.js`.
    /// </summary>
    public class ExpeditionTests
    {
        static GameData data;
        static string Golden(string name) => File.ReadAllText(Path.Combine(Application.dataPath, "Tests", "EditMode", "Golden", name));

        [OneTimeSetUp]
        public void Load() => data = GameData.Load(File.ReadAllText(Path.Combine(Application.dataPath, "Resources", "Data", "forja-data.json")));

        /* Mesma assinatura de estado de tools/sim-trace.js */
        static string N(double v) => v.ToString(CultureInfo.InvariantCulture);
        static string Kv<T>(OrderedDict<T> o) => o == null ? "" : string.Join(",", o.Select(kv => $"{kv.Key}={kv.Value}"));
        static string Items(List<ItemRef> l) => string.Join(",", l.Select(i => i.Id + "*" + i.Tier));
        static string UnitSig(UnitDef u) => $"{u.Id}:{u.ArchetypeId}:{u.Level}:{u.Xp}:{u.EvoPoints}:{N(u.Col)},{N(u.Row)}:{Kv(u.Elements)}:{Kv(u.Skills)}:{Items(u.Items)}:{u.Trait ?? ""}";

        static string Snapshot(Expedition g)
        {
            var r = g.Run;
            return string.Join("|", new[]
            {
                r.Phase, N(r.Room), N(r.Act), r.RngState.ToString(CultureInfo.InvariantCulture), $"{r.CitadelHp}/{r.CitadelMax}", N(r.Threat), N(r.Attempt), string.Join(",", r.Relics),
                string.Join("#", r.Players.Select(p => $"{p.Gold};{p.TeamLimit};{Items(p.Bag)};{string.Join("/", p.Bench.Where(b => b != null).Select(UnitSig))}")),
                string.Join("/", r.Board.Select(UnitSig)), string.Join(",", r.Pending.Select(p => p.Kind))
            });
        }

        static string FirstDiff(string a, string b)
        {
            var fa = a.Split('|'); var fb = b.Split('|');
            string[] names = { "fase", "sala", "ato", "rng", "cidadela", "ameaça", "tentativa", "relíquias", "jogadores", "campo", "pendências" };
            for (int i = 0; i < System.Math.Min(fa.Length, fb.Length); i++)
                if (fa[i] != fb[i]) return $"{names[i]}:\n  JS: {fa[i]}\n  C#: {fb[i]}";
            return "tamanho";
        }

        [Test]
        public void Expedicao_PassoAPassoIgualAoJs()
        {
            var runs = JArray.Parse(Golden("runs.json"));
            var fails = new List<string>();
            foreach (var run in runs)
            {
                var trace = run["trace"].Select(t => (string)t).ToList();
                var sim = new ExpeditionSim(data);
                var mine = new List<string>();
                sim.OnStep = g => mine.Add(Snapshot(g));
                string err = null;
                try { sim.PlayRun((string)run["seed"], (int)run["ascension"], (int)run["players"], (string)run["scaling"]); }
                catch (System.Exception ex) { err = ex.ToString(); }
                int n = System.Math.Min(trace.Count, mine.Count);
                int k = -1;
                for (int i = 0; i < n; i++) if (trace[i] != mine[i]) { k = i; break; }
                if (k >= 0) fails.Add($"{run["seed"]} diverge no passo {k}/{trace.Count} — {FirstDiff(trace[k], mine[k])}");
                else if (trace.Count != mine.Count) fails.Add($"{run["seed"]}: {mine.Count} passos no C#, {trace.Count} no JS{(err != null ? "\n" + err : "")}");
                else if (err != null) fails.Add($"{run["seed"]}: {err}");
            }
            if (fails.Count > 0) Assert.Fail(string.Join("\n\n", fails));
        }

        [Test]
        public void Simulador_MesmoResultadoDoSimJs()
        {
            var cfgs = JArray.Parse(Golden("sim-summary.json"));
            var fails = new List<string>();
            foreach (var cfg in cfgs)
            {
                var a = (JArray)cfg["args"];
                var sum = ExpeditionSim.Run(data, (int)a[0], (int)a[1], (int)a[2], (string)a[3]);
                string js = (string)cfg["json"], cs = sum.ToJson();
                if (js != cs) fails.Add($"sim.js {a.ToString(Newtonsoft.Json.Formatting.None)}\n  JS: {js}\n  C#: {cs}{(sum.ErrorMessages.Count > 0 ? "\n  " + sum.ErrorMessages[0] : "")}");
                else Debug.Log($"sim {a.ToString(Newtonsoft.Json.Formatting.None)} → {cs}");
            }
            if (fails.Count > 0) Assert.Fail(string.Join("\n\n", fails));
        }
    }
}
