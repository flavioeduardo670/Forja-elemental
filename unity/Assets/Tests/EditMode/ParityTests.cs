using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using ForjaElemental.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using NUnit.Framework;
using UnityEngine;

namespace ForjaElemental.Tests
{
    /// <summary>
    /// Paridade com o motor JS: compara o port C# com os valores gravados por
    /// tools/make-golden.js (rode `node tools/make-golden.js` após mudar o JS).
    /// </summary>
    public class ParityTests
    {
        static GameData data;
        static readonly JsonSerializer Ser = JsonSerializer.Create(new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });
        static readonly JsonSerializer OutSer = JsonSerializer.Create(new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            ContractResolver = new CamelCasePropertyNamesContractResolver()
        });

        static string Golden(string name) => File.ReadAllText(Path.Combine(Application.dataPath, "Tests", "EditMode", "Golden", name));

        [OneTimeSetUp]
        public void Load()
        {
            data = GameData.Load(File.ReadAllText(Path.Combine(Application.dataPath, "Resources", "Data", "forja-data.json")));
        }

        /* ---------------- Comparação de JSON ---------------- */
        static bool Falsy(JToken t) => t == null || t.Type == JTokenType.Null ||
            (t.Type == JTokenType.Boolean && !(bool)t) || ((t.Type == JTokenType.Integer || t.Type == JTokenType.Float) && (double)t == 0) ||
            (t.Type == JTokenType.Array && !t.HasValues) || (t.Type == JTokenType.Object && !t.HasValues);

        /// <summary>Compara o esperado (JS) com o obtido (C#). Chaves ausentes no JS só podem ser "falsy" no C#.</summary>
        static void Diff(JToken exp, JToken act, string path, List<string> errs, double tol = 1e-9)
        {
            if (errs.Count > 12) return;
            if (Falsy(exp) && Falsy(act)) return;
            if (exp == null || act == null) { errs.Add($"{path}: esperado {exp?.ToString(Formatting.None) ?? "∅"}, obtido {act?.ToString(Formatting.None) ?? "∅"}"); return; }
            bool expNum = exp.Type == JTokenType.Integer || exp.Type == JTokenType.Float, actNum = act.Type == JTokenType.Integer || act.Type == JTokenType.Float;
            if (expNum && actNum)
            {
                double a = (double)exp, b = (double)act;
                if (Math.Abs(a - b) > tol * Math.Max(1, Math.Abs(a))) errs.Add($"{path}: esperado {a:R}, obtido {b:R}");
                return;
            }
            if (exp.Type == JTokenType.Object && act.Type == JTokenType.Object)
            {
                var eo = (JObject)exp; var ao = (JObject)act;
                foreach (var p in eo.Properties()) Diff(p.Value, ao[p.Name], $"{path}.{p.Name}", errs, tol);
                foreach (var p in ao.Properties()) if (eo[p.Name] == null && !Falsy(p.Value)) errs.Add($"{path}.{p.Name}: sobra no C# ({p.Value.ToString(Formatting.None)})");
                return;
            }
            if (exp.Type == JTokenType.Array && act.Type == JTokenType.Array)
            {
                var ea = (JArray)exp; var aa = (JArray)act;
                if (ea.Count != aa.Count) { errs.Add($"{path}: tamanho {ea.Count} ≠ {aa.Count}"); return; }
                for (int i = 0; i < ea.Count; i++) Diff(ea[i], aa[i], $"{path}[{i}]", errs, tol);
                return;
            }
            if (exp.Type == JTokenType.String || act.Type == JTokenType.String)
            {
                if (exp.ToString() != act.ToString()) errs.Add($"{path}: esperado \"{exp}\", obtido \"{act}\"");
                return;
            }
            if (!JToken.DeepEquals(exp, act)) errs.Add($"{path}: esperado {exp.ToString(Formatting.None)}, obtido {act.ToString(Formatting.None)}");
        }

        static void AssertNoErrors(List<string> failures, int total, string what)
        {
            if (failures.Count == 0) return;
            var sb = new StringBuilder($"{failures.Count}/{total} {what} divergem do JS:\n");
            foreach (var f in failures.Take(10)) sb.AppendLine(f);
            Assert.Fail(sb.ToString());
        }

        /* ---------------- Testes ---------------- */
        [Test]
        public void Dados_CarregamComAsContagensDoJs()
        {
            Assert.AreEqual(14, data.Archetypes.Count);
            Assert.AreEqual(56, data.Skills.Count);
            Assert.AreEqual(6, data.Elements.Count);
            Assert.AreEqual(9, data.Orders.Count);
            Assert.AreEqual(16, data.Items.Count);
            Assert.AreEqual(4, data.Bosses.Count);
            Assert.AreEqual("vanguarda", data.Archetypes.Keys[0]);
            Assert.AreEqual(820, data.Archetypes["vanguarda"].Stats.MaxHp);
            Assert.AreEqual(3, data.Skills["vg_impacto"].DescByLevel.Count);
            Assert.AreEqual(16, data.Config.COLS);
            Assert.AreEqual(14, data.Config.ROWS);
        }

        [Test]
        public void Rng_ReproduzOMulberry32DoJs()
        {
            var g = JObject.Parse(Golden("rng.json"));
            foreach (var c in g["rng"])
            {
                var r = new Rng((uint)(long)c["seed"]);
                foreach (var v in c["values"]) Assert.AreEqual((double)v, r.Next(), 0, $"seed {c["seed"]}");
                Assert.AreEqual((uint)(long)c["state"], r.State);
                var r2 = new Rng((uint)(long)c["seed"]);
                foreach (var v in c["ints"]) Assert.AreEqual((int)v, r2.Int(-5, 20));
            }
            foreach (var h in g["hashes"]) Assert.AreEqual((uint)(long)h["h"], JsMath.HashStr((string)h["s"]), (string)h["s"]);
        }

        [Test]
        public void ComputeStats_IgualAoJs()
        {
            var cases = JArray.Parse(Golden("stats.json"));
            var fails = new List<string>();
            for (int i = 0; i < cases.Count; i++)
            {
                var c = cases[i];
                var unit = c["unit"].ToObject<UnitDef>(Ser);
                var ctx = c["ctx"].ToObject<StatsContext>(Ser);
                var res = StatsCalc.Compute(data, unit, ctx);
                var errs = new List<string>();
                Diff(c["expected"], JToken.FromObject(res, OutSer), "stats", errs);
                Diff(c["power"], new JValue(StatsCalc.UnitPower(res)), "power", errs);
                if (errs.Count > 0) fails.Add($"#{i} {unit.ArchetypeId} (inimigo={ctx.IsEnemy}): {string.Join("; ", errs.Take(4))}");
            }
            AssertNoErrors(fails, cases.Count, "casos de computeStats");
        }

        [Test]
        public void GenerateActMap_IgualAoJs()
        {
            var g = JObject.Parse(Golden("generation.json"));
            var fails = new List<string>(); int n = 0;
            foreach (var c in g["maps"])
            {
                n++;
                var rng = Rng.FromState((uint)(long)c["state"]);
                var map = Generation.GenerateActMap(data, rng, (int)c["args"]["act"], (int)c["args"]["asc"]);
                var errs = new List<string>();
                Diff(c["expected"], JToken.FromObject(map, OutSer), "map", errs);
                if (rng.State != (uint)(long)c["stateAfter"]) errs.Add("estado final do RNG");
                if (errs.Count > 0) fails.Add($"mapa {n}: {string.Join("; ", errs.Take(4))}");
            }
            AssertNoErrors(fails, n, "mapas");
        }

        [Test]
        public void GenerateTerrain_IgualAoJs()
        {
            var g = JObject.Parse(Golden("generation.json"));
            var fails = new List<string>(); int n = 0;
            foreach (var c in g["terrains"])
            {
                n++;
                var a = c["args"];
                var rng = Rng.FromState((uint)(long)c["state"]);
                string t = Generation.GenerateTerrain(data, rng, (string)a["layout"], (int)a["act"], (string)a["cond"], (string)a["mission"]);
                if (t != (string)c["expected"] || rng.State != (uint)(long)c["stateAfter"])
                    fails.Add($"terreno {n} ({a["layout"]}/{a["cond"]}/{a["mission"]}): {(t == (string)c["expected"] ? "RNG final difere" : "grade difere")}");
            }
            AssertNoErrors(fails, n, "terrenos");
        }

        [Test]
        public void GenerateHorde_IgualAoJs()
        {
            var g = JObject.Parse(Golden("generation.json"));
            var fails = new List<string>(); int n = 0;
            foreach (var c in g["hordes"])
            {
                n++;
                var a = c["args"];
                var rng = Rng.FromState((uint)(long)c["state"]);
                var horde = Generation.GenerateHorde(data, rng, (int)a["room"], (int)a["act"], (string)a["roomType"], (int)a["asc"], (string)a["terrain"],
                    (int)a["players"], (string)a["doctrineId"], a["extraCount"] == null ? 1 : (double)a["extraCount"]);
                var errs = new List<string>();
                Diff(c["expected"], JToken.FromObject(horde, OutSer), "horda", errs);
                if (rng.State != (uint)(long)c["stateAfter"]) errs.Add("estado final do RNG");
                if (errs.Count > 0) fails.Add($"horda {n} (sala {a["room"]}, {a["roomType"]}, {a["doctrineId"]}): {string.Join("; ", errs.Take(4))}");
            }
            AssertNoErrors(fails, n, "hordas");
        }

        static CombatOptions OptionsFrom(JToken o)
        {
            CombatSide Side(JToken s, string team) => new CombatSide { Unit = s["unit"].ToObject<UnitDef>(Ser), Stats = s["stats"].ToObject<StatBlock>(Ser), Team = (string)s["team"] ?? team };
            return new CombatOptions
            {
                Seed = (uint)(long)o["seed"],
                Relics = new HashSet<string>(o["relics"]?.ToObject<List<string>>() ?? new List<string>()),
                Affix = (string)o["affix"], Terrain = (string)o["terrain"], Tactic = (string)o["tactic"],
                AntiHeal = o["antiHeal"]?.Type == JTokenType.Null || o["antiHeal"] == null ? 0 : (double)o["antiHeal"],
                HuntId = o["huntId"]?.Type == JTokenType.Null ? null : (string)o["huntId"],
                Mission = (string)o["mission"],
                Players = o["players"].Select(s => Side(s, "player")).ToList(),
                Enemies = o["enemies"].Select(s => Side(s, "enemy")).ToList(),
                Structures = (o["structures"] ?? new JArray()).Select(s => Side(s, null)).ToList()
            };
        }

        [Test]
        public void Combate_IgualAoJs()
        {
            var combats = JArray.Parse(Golden("combat.json"));
            var fails = new List<string>();
            int n = 0;
            foreach (var cb in combats)
            {
                n++;
                var c = CombatEngine.Create(data, OptionsFrom(cb["opts"]));
                int steps = 0, ti = 0;
                var trace = (JArray)cb["trace"];
                string firstTrace = null;
                while (!c.Over && steps < 200 / 0.025)
                {
                    CombatEngine.Update(c, 0.025); steps++;
                    if (steps % 40 == 0 && ti < trace.Count && firstTrace == null)
                    {
                        var tr = trace[ti++];
                        double hp = c.Units.Where(u => !u.Dead).Sum(u => u.Hp);
                        if (c.Units.Count != (int)tr["n"] || Math.Abs(hp - (double)tr["hp"]) > 1e-6 * Math.Max(1, hp) || c.Rng.State != (uint)(long)tr["rng"])
                            firstTrace = $"diverge em t={(double)tr["t"]:0.000}s (unidades {c.Units.Count}/{tr["n"]}, vida {hp:0.##}/{(double)tr["hp"]:0.##}, rng {(c.Rng.State == (uint)(long)tr["rng"] ? "ok" : "≠")})";
                    }
                }
                var errs = new List<string>();
                if (firstTrace != null) errs.Add(firstTrace);
                if (steps != (int)cb["steps"]) errs.Add($"passos {steps} ≠ {cb["steps"]}");
                Diff(cb["result"], JToken.FromObject(c.Result, OutSer), "result", errs, 1e-6);
                if (errs.Count > 0) fails.Add($"combate {n} [{cb["key"]}]: {string.Join("; ", errs.Take(4))}");
            }
            AssertNoErrors(fails, n, "combates");
        }

        [Test]
        public void Combate_UnidadesFinaisIguaisAoJs()
        {
            var combats = JArray.Parse(Golden("combat.json"));
            var fails = new List<string>(); int n = 0;
            foreach (var cb in combats)
            {
                n++;
                var c = CombatEngine.Create(data, OptionsFrom(cb["opts"]));
                int steps = 0;
                while (!c.Over && steps < 200 / 0.025) { CombatEngine.Update(c, 0.025); steps++; }
                var actual = new JArray(c.Units.Select(u => new JObject
                {
                    ["team"] = u.Team, ["archetypeId"] = u.ArchetypeId, ["isSummon"] = u.IsSummon, ["structure"] = u.Structure,
                    ["hp"] = u.Hp, ["shield"] = u.Shield, ["mana"] = u.Mana, ["dead"] = u.Dead, ["x"] = u.X, ["y"] = u.Y,
                    ["kills"] = u.Kills, ["dmgDealt"] = u.DmgDealt, ["dmgTaken"] = u.DmgTaken, ["healDone"] = u.HealDone, ["casts"] = u.Casts
                }));
                var errs = new List<string>();
                Diff(cb["units"], actual, "units", errs, 1e-6);
                if (errs.Count > 0) fails.Add($"combate {n} [{cb["key"]}]: {string.Join("; ", errs.Take(3))}");
            }
            AssertNoErrors(fails, n, "combates");
        }
    }
}
