using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace ForjaElemental.Core
{
    public sealed partial class Expedition
    {
        /* ---------------- Escala de poder adaptativa ---------------- */
        public double RosterPower()
        {
            var all = new List<double>();
            foreach (var p in Run.Players)
            {
                var ctx = StatsCtx(p.Id, true);
                all.AddRange(UnitsOf(p.Id).Select(u => StatsCalc.UnitPower(StatsOf(u, ctx))).OrderByDescending(x => x).Take(FieldLimit(p)));
            }
            double sum = 0; foreach (var x in all) sum += x;
            return JsMath.Round(sum * sum / 100);
        }
        public bool IsAdaptive() => Run != null && (Run.Scaling == "proporcional" || Run.Scaling == "dinamica");
        public double RewardMult() => Run != null && Run.Scaling == "dinamica" ? 1 + D.Scaling.RewardPer * Math.Max(0, Run.Threat) : 1;
        public double CoopFactor()
        {
            int n = Run.Players.Count;
            return n > 1 ? D.Scaling.CoopMult[Math.Min(3, Run.Act - 1)] * (n == 2 ? 1.05 : n == 3 ? 0.95 : 1.45) : 1;
        }
        public double TargetRatio(string type)
        {
            var SC = D.Scaling;
            var arr = SC.Targets.ContainsKey(type) ? SC.Targets[type] : SC.Targets["combate"];
            double t = arr[Math.Min(3, Run.Act - 1)];
            return t * SC.Diff * (1 + SC.AscPer * Run.Ascension) * CoopFactor() * (Run.Scaling == "dinamica" ? 1 + SC.ThreatPer * Run.Threat : 1);
        }
        public void SetScaling(string mode)
        {
            if (Run == null || !D.Scaling.Modes.ContainsKey(mode)) return;
            Run.Scaling = mode;
            Log($"{D.Scaling.Modes[mode].Icon} Escala de poder: {D.Scaling.Modes[mode].Name} (vale a partir da próxima sala).", "gold");
            Changed();
        }

        void ApplyScaling(string type)
        {
            var r = Run; string mode = r.Scaling ?? "classica"; var SC = D.Scaling;
            double pp = RosterPower();
            var savedC = r.Enemies.Select(e => e.Cmods).ToList(); foreach (var e in r.Enemies) e.Cmods = null;
            double ep0 = EnemyPower();
            for (int i = 0; i < r.Enemies.Count; i++) r.Enemies[i].Cmods = savedC[i];
            var info = new ScaleInfo { Mode = mode, Pp = pp, Ep0 = ep0, K = 1 };
            if (mode == "nivelada")
            {
                var units = AllUnits().OrderByDescending(u => u.Level).Take(Math.Max(1, r.Players.Sum(p => p.TeamLimit))).ToList();
                double avgLvl = units.Count > 0 ? units.Sum(u => u.Level) / (double)units.Count : 1;
                double avgSt = units.Count > 0 ? units.Sum(u => u.Elements.Values.Sum()) / (double)units.Count : 0;
                var els = D.Elements.Keys.ToList();
                WithRng(rng =>
                {
                    foreach (var e in r.Enemies)
                    {
                        int want = (int)(e.IsBoss ? Math.Ceiling(avgLvl) : e.IsElite ? JsMath.Round(avgLvl) : JsMath.Round(avgLvl * 0.85));
                        e.Level = Math.Max(e.Level, want);
                        for (int i = 0; i < Math.Floor(avgSt * 0.3); i++) { string el = rng.Pick(els); e.Elements[el] = e.Elements.Get(el) + 1; }
                    }
                });
            }
            else if (mode == "proporcional" || mode == "dinamica")
            {
                double dt = r.Doctrine != null && D.Doctrines.TryGetValue(r.Doctrine, out var doc) && doc.Tune != 0 ? doc.Tune : 1;
                double coopTune = r.Players.Count > 1 && r.Doctrine != null && r.Doctrine != "bando"
                    ? 0.72 * (1 + (dt - 1) * 0.35) * (D.Doctrines[r.Doctrine].CoopTune != 0 ? D.Doctrines[r.Doctrine].CoopTune : 1) : dt;
                double mt = r.Mission != null && D.Missions.TryGetValue(r.Mission, out var mi) && mi.Tune != 0 ? mi.Tune : 1;
                double ct = r.Cond != null && D.Conditions.TryGetValue(r.Cond, out var co) && co.Tune != 0 ? co.Tune : 1;
                double target = TargetRatio(type) * coopTune * mt * ct;
                double k = Math.Max(SC.KMin, Math.Min(SC.KMax, Math.Sqrt(target * pp / Math.Max(1, ep0))));
                foreach (var e in r.Enemies)
                {
                    var b = e.BaseStats.Clone();
                    b.MaxHp = JsMath.Round(b.MaxHp * k); b.Ad = JsMath.Round(b.Ad * k); b.Ap = JsMath.Round(b.Ap * k);
                    e.BaseStats = b;
                }
                info.K = k; info.Target = target;
                if (mode == "dinamica" && r.Threat >= 6) WithRng(rng =>
                {
                    var el = r.Enemies.FirstOrDefault(e => e.IsElite && !e.IsBoss);
                    if (el != null && el.Affixes.Count < 3) el.Affixes.Add(rng.Pick(D.EliteAffixes.Keys.Where(a => !el.Affixes.Contains(a)).ToList()));
                });
            }
            info.Ep = EnemyPower();
            info.Ratio = info.Ep / Math.Max(1, pp);
            r.Scale = info;
        }

        void ReScaleForRetry()
        {
            var r = Run;
            if (r.Scale == null || r.Scale.K == 0) return;
            double back = 1 / r.Scale.K;
            foreach (var e in r.Enemies)
            {
                var b = e.BaseStats.Clone();
                b.MaxHp = JsMath.Round(b.MaxHp * back); b.Ad = JsMath.Round(b.Ad * back); b.Ap = JsMath.Round(b.Ap * back);
                e.BaseStats = b;
            }
            ApplyScaling(r.RoomType);
        }

        /* ---------------- Doutrinas, inteligência e objetivos ---------------- */
        string PickDoctrine()
        {
            var r = Run;
            if (r.Room <= 1) return "bando";
            var ok = D.Doctrines.Values.Where(d => d.Id != "bando" && d.MinRoom <= r.Room && d.Id != r.LastDoctrine).ToList();
            string id = WithRng(rng => rng.Chance(0.12) ? "bando" : rng.Pick(ok).Id);
            r.LastDoctrine = id;
            return id;
        }

        public sealed class ArmyProfile
        {
            public int N, Healers;
            public double Phys, Mag, Ranged, Armor, Carry;
            public string CarryId, CarryName;
        }

        public ArmyProfile GetArmyProfile()
        {
            var units = new List<(UnitDef u, StatBlock s, double pw)>();
            foreach (var p in Run.Players)
            {
                var ctx = StatsCtx(p.Id, true);
                units.AddRange(UnitsOf(p.Id).Select(u => { var s = StatsOf(u, ctx); return (u, s, StatsCalc.UnitPower(s)); })
                    .OrderByDescending(x => x.Item3).Take(p.TeamLimit));
            }
            if (units.Count == 0) return null;
            double phys = 0, mag = 0, armor = 0, pw = 0; int ranged = 0, healers = 0;
            foreach (var (u, s, w) in units)
            {
                double a = s.Ad * s.AttackSpeed, m = s.Ap * 0.9;
                phys += a / (a + m) * w; mag += m / (a + m) * w; pw += w;
                if (s.Range >= 3) ranged++;
                if (u.ArchetypeId == "clerigo" || u.ArchetypeId == "druida" || u.ArchetypeId == "bardo" || (u.ArchetypeId == "paladino" && u.Skills.Get("pa_consagrar") != 0)) healers++;
                armor += s.Armor;
            }
            var top = units[0];
            return new ArmyProfile
            {
                N = units.Count, Phys = phys / pw, Mag = mag / pw, Ranged = ranged / (double)units.Count, Healers = healers, Armor = armor / units.Count,
                Carry = units.Count >= 3 ? top.pw / pw : 0, CarryId = top.u.Id, CarryName = top.u.Name
            };
        }

        static string Pct(double v) => JsMath.Round(v * 100).ToString(CultureInfo.InvariantCulture);
        static string CounterWhy(string id, double v, string n) => id switch
        {
            "placas" => $"{Pct(v)}% do seu dano é físico",
            "runas" => $"{Pct(v)}% do seu dano é mágico",
            "cacada" => $"{n} carrega {Pct(v)}% do poder do time",
            "batedores" => $"{Pct(v)}% do seu time ataca à distância",
            "veneno" => $"você depende de {v} curandeiro(s)",
            "barragem" => $"você luta com {v} unidades",
            "acido" => $"armadura média alta ({JsMath.Round(v)})",
            _ => ""
        };

        static OrderedDict<double> MergeMods(OrderedDict<double> a, OrderedDict<double> b)
        {
            var o = new OrderedDict<double>(a);
            foreach (var kv in b)
            {
                if (kv.Key.EndsWith("Mult")) o[kv.Key] = (o.Get(kv.Key) != 0 ? o.Get(kv.Key) : 1) * kv.Value;
                else if (kv.Key == "chain") o[kv.Key] = Math.Max(o.Get(kv.Key), kv.Value);
                else o[kv.Key] = o.Get(kv.Key) + kv.Value;
            }
            return o;
        }

        void ApplyIntel()
        {
            var r = Run;
            r.Intel = null;
            bool coop = r.Players.Count > 1;
            int nCounters = r.Act <= 1 ? 0 : coop ? 1 : r.Act == 2 ? 1 : r.Act == 3 ? 1 + (r.Ascension >= 2 ? 1 : 0) : 2;
            var prof = GetArmyProfile();
            if (nCounters == 0 || prof == null) return;
            var cand = new List<(string id, double score, double v, string n)>();
            if (prof.Phys >= 0.62) cand.Add(("placas", (prof.Phys - 0.62) * 3 + 0.3, prof.Phys, null));
            if (prof.Mag >= 0.55) cand.Add(("runas", (prof.Mag - 0.55) * 3 + 0.3, prof.Mag, null));
            if (prof.Carry >= 0.38) cand.Add(("cacada", (prof.Carry - 0.38) * 4 + 0.35, prof.Carry, prof.CarryName));
            if (prof.Ranged >= 0.5 && prof.N >= 3) cand.Add(("batedores", (prof.Ranged - 0.5) * 2 + 0.25, prof.Ranged, null));
            if (prof.Healers >= 2) cand.Add(("veneno", 0.2 + prof.Healers * 0.12, prof.Healers, null));
            if (prof.N >= 8 && !coop) cand.Add(("barragem", 0.2 + (prof.N - 8) * 0.06, prof.N, null));
            if (prof.Armor >= 85) cand.Add(("acido", 0.2 + (prof.Armor - 85) / 100, prof.Armor, null));
            var chosen = cand.OrderByDescending(c => c.score).Take(nCounters).ToList();
            if (chosen.Count == 0) return;
            var intel = new Intel();
            foreach (var ch in chosen)
            {
                var def = D.Counters[ch.id];
                intel.Counters.Add(new IntelCounter { Id = ch.id, Why = CounterWhy(ch.id, ch.v, ch.n) });
                if (def.AntiHeal != 0) intel.AntiHeal = def.AntiHeal;
                if (ch.id == "cacada") { intel.HuntId = prof.CarryId; intel.HuntName = prof.CarryName; }
                var m = def.Mods ?? new OrderedDict<double>();
                foreach (var e in r.Enemies)
                {
                    if (m.Count == 0) break;
                    e.Cmods = e.Cmods != null ? MergeMods(e.Cmods, m) : new OrderedDict<double>(m);
                }
                if (def.Ambush != 0) WithRng(rng =>
                {
                    var cands = rng.Shuffle(r.Enemies.Where(e => !e.IsBoss && !e.IsElite && !e.Ambush && e.ArchetypeId != "sombra"));
                    foreach (var e in cands.Take((int)JsMath.Round(r.Enemies.Count * def.Ambush * (coop ? 0.5 : 1)))) e.Ambush = true;
                });
            }
            r.Intel = intel;
            Log($"🧠 Inteligência inimiga: {string.Join(" + ", intel.Counters.Select(c => $"{D.Counters[c.Id].Icon} {D.Counters[c.Id].Name}"))}.", "danger");
        }

        public int ActiveSynergies()
        {
            var ec = SynergyCounts(); var oc = OrderCounts();
            return D.Elements.Keys.Count(k => StatsCalc.SynergyTier(D, ec.Get(k)) > 0) + D.Orders.Values.Count(o => StatsCalc.OrderTier(D, oc.Get(o.Id), o) > 0);
        }

        RunObjective PickObjective(string type)
        {
            var r = Run;
            int lim = r.Players.Sum(p => FieldLimit(p));
            var list = new List<RunObjective>();
            if (r.Mission == null || r.Mission == "batalha") list.Add(new RunObjective { Id = "blitz", P = type == "chefe" ? 32 : type == "elite" ? 20 : 15 });
            list.Add(new RunObjective { Id = "intacto" });
            list.Add(new RunObjective { Id = "vitalidade", P = type == "chefe" ? 35 : 55 });
            list.Add(new RunObjective { Id = "prisma", P = Math.Min(5, 2 + r.Act / 2) });
            if (lim >= 3) list.Add(new RunObjective { Id = "enxuto", P = Math.Max(1, lim - 2) });
            if (type != "combate") list.Add(new RunObjective { Id = "carrasco", P = type == "chefe" ? 30 : 12 });
            var o = WithRng(rng => rng.Pick(list));
            var def = D.Objectives[o.Id];
            int gold = (int)JsMath.Round((14 + r.Room * 2.2) * (type == "combate" ? 1 : 1.5) * GoldFactor());
            int tier = r.Act >= 3 ? 2 : 1;
            o.Reward = def.Reward == "gold" ? new ObjectiveReward { Kind = "gold", Amount = gold, Text = $"+{gold}g{(IsCoop() ? " cada" : "")}" }
                : def.Reward == "xp" ? new ObjectiveReward { Kind = "xp", Amount = 0.5, Text = "+50% de XP para o time" }
                : new ObjectiveReward { Kind = "item", Tier = tier, Text = $"item ★{tier}{(IsCoop() ? " para cada jogador" : "")}" };
            return o;
        }

        public string ObjectiveText(RunObjective o)
        {
            if (o == null) return "";
            string p = o.P?.ToString(CultureInfo.InvariantCulture);
            return o.Id switch
            {
                "blitz" => $"Vença em até {p}s",
                "intacto" => "Vença sem perder nenhuma unidade",
                "enxuto" => $"Vença com no máximo {p} unidade(s) em campo",
                "prisma" => $"Vença com {p}+ sinergias ativas",
                "vitalidade" => $"Termine com {p}%+ da vida total do time",
                "carrasco" => $"Derrote o líder inimigo em até {p}s",
                _ => ""
            };
        }

        bool EvalObjective(RunObjective o, CombatState c, List<CombatReportRow> report, bool won)
        {
            if (o == null || !won) return false;
            var res = c.Result; double p = o.P ?? 0;
            switch (o.Id)
            {
                case "blitz": return res.Time <= p;
                case "intacto": return report.All(x => x.Survived);
                case "enxuto": return (c.StartBoard != 0 ? c.StartBoard : 99) <= p;
                case "prisma": return c.StartSyn >= p;
                case "vitalidade":
                    {
                        var pl = c.Units.Where(u => u.Team == "player" && !u.IsSummon).ToList();
                        return pl.Sum(u => Math.Max(0, u.Hp)) / Math.Max(1, pl.Sum(u => u.Stats.MaxHp)) * 100 >= p;
                    }
                case "carrasco": return res.LeaderAt != null && res.LeaderAt <= p;
            }
            return false;
        }

        /* Ameaça (modo Dinâmica): sobe com vitórias dominantes, cai com derrotas */
        ThreatChange UpdateThreat(bool won, List<CombatReportRow> report, double time)
        {
            var r = Run; var SC = D.Scaling;
            if (r.Scaling != "dinamica") return null;
            double lost = report.Count(x => !x.Survived) / (double)Math.Max(1, report.Count);
            int d = 0; string why;
            if (!won) { d = -2; why = "derrota"; }
            else if (lost == 0 && time < 14) { d = 2; why = "vitória dominante"; }
            else if (lost <= 0.25) { d = 1; why = "vitória confortável"; }
            else if (lost >= 0.6) { d = -1; why = "vitória por pouco"; }
            else why = "vitória equilibrada";
            int before = r.Threat;
            r.Threat = (int)Math.Max(SC.ThreatMin, Math.Min(SC.ThreatMax, before + d));
            return new ThreatChange { Before = before, After = r.Threat, Why = why };
        }

        /* ---------------- Recompensas ---------------- */
        ItemRef RollItem(int tier) => WithRng(rng => new ItemRef { Id = rng.Pick(D.Items.Keys.ToList()), Tier = tier });

        int GoldBase(string type, int room)
        {
            int b = 42 + room * 9 + (type == "elite" ? 30 : 0) + (type == "chefe" ? 60 : 0);
            if (HasRelic("cofre_mercador")) b += 15;
            if (type == "chefe" && Meta.Upgrades.Get("relicStart") > 1) b += Meta.Upgrades.Get("relicStart") * 10;
            return b;
        }

        public sealed class RewardPreview
        {
            public int Gold, Interest, XpEach, Pool, KillXp, DefeatCitadel, DefeatXpEach;
            public double Mult;
            public double ItemChance; public int ItemTier, ItemLeft; public bool ItemEach;
            public string Relic; public bool NextAct;
        }

        public RewardPreview PreviewRewards(string type = null, int? room = null)
        {
            var r = Run; type = type ?? r.RoomType; int rm0 = room ?? r.Room;
            double rm = RewardMult(); var me = Me();
            string savedType = r.RoomType; int savedRoom = r.Room;
            r.RoomType = type; r.Room = rm0;
            int pool = (int)JsMath.Round(PlayerXpPool() * rm);
            r.RoomType = savedType; r.Room = savedRoom;
            int n = Math.Max(1, BoardOf(me.Id).Count);
            var pv = new RewardPreview
            {
                Gold = (int)JsMath.Round(GoldBase(type, rm0) * GoldFactor() * rm),
                Interest = (int)Math.Min(C.InterestCap, Math.Floor(me.Gold * C.InterestRate)),
                XpEach = pool / n, Pool = pool, KillXp = 16 + rm0 * 3, Mult = rm,
                Relic = type == "elite" ? "elite" : type == "chefe" ? "boss" : null, NextAct = type == "chefe" && rm0 < C.TotalRooms,
                DefeatCitadel = Math.Max(10, (int)JsMath.Round((r.Enemies.Count > 0 ? r.Enemies.Count : 4) * 6 / Math.Sqrt(Coop())) + r.Act * 4),
                DefeatXpEach = (int)Math.Floor(pool * 0.45 / n)
            };
            if (type == "combate") { pv.ItemChance = (r.NormalWins + 1) % C.ItemEvery == 0 ? 1 : 0; pv.ItemTier = 1; pv.ItemLeft = C.ItemEvery - (r.NormalWins % C.ItemEvery); }
            else if (type == "elite") { pv.ItemChance = 1; pv.ItemTier = 1; }
            else { pv.ItemChance = 1; pv.ItemTier = 2; pv.ItemEach = true; }
            return pv;
        }

        void FinishCombat(CombatState c)
        {
            var r = Run;
            var res = c.Result; LastCombatTime = res.Time;
            var report = CombatEngine.Report(c);
            foreach (var x in report) { var u0 = Find(x.RosterId); x.Owner = u0 != null ? u0.Owner : 0; }
            Ach("combat");
            if (!res.Won) r.NoLoss = false;
            var snap = r.Board.ToDictionary(u => u.Id, u => (u.Level, u.Xp));
            var levelUps = new List<string>();
            int killXp = 16 + r.Room * 3;
            var lines = new List<string>();
            double gf = GoldFactor(), rm = RewardMult();
            var rewards = new Rewards { Won = res.Won, Mult = rm, KillXp = killXp };

            foreach (var rep in report)
            {
                var u = Find(rep.RosterId);
                if (u != null && rep.Kills != 0) { int g = GrantXp(u, rep.Kills * killXp); if (g > 0) levelUps.Add($"{u.Name} → Nv.{u.Level}"); }
                var p = P(rep.Owner); p.Kills += rep.Kills; p.Dmg += rep.DmgDealt; p.Heal += rep.HealDone;
            }
            r.Stats.Kills += report.Sum(x => x.Kills);
            bool objDone = EvalObjective(r.Objective, c, report, res.Won);
            int pool = (int)JsMath.Round(PlayerXpPool() * rm);
            if (objDone && r.Objective.Reward.Kind == "xp") pool = (int)JsMath.Round(pool * (1 + r.Objective.Reward.Amount));
            if (r.Objective != null) rewards.Objective = new ObjectiveResult { Id = r.Objective.Id, Text = ObjectiveText(r.Objective), Done = objDone, Reward = r.Objective.Reward.Text, Won = res.Won };
            if (objDone) { r.Stats.Objectives++; Ach("objective"); }
            rewards.Threat = UpdateThreat(res.Won, report, res.Time);

            void SplitXp(double mult)
            {
                foreach (var p in r.Players)
                {
                    var mine = BoardOf(p.Id);
                    if (mine.Count == 0) { rewards.Xp.Add(new XpReward { Pid = p.Id }); continue; }
                    int each = (int)Math.Floor(pool * mult / mine.Count);
                    foreach (var u in mine) { int g = GrantXp(u, each); if (g > 0) levelUps.Add($"{u.Name} → Nv.{u.Level}"); }
                    rewards.Xp.Add(new XpReward { Pid = p.Id, Each = each, N = mine.Count });
                }
            }
            void FinishUnits()
            {
                rewards.Units = r.Board.Select(u =>
                {
                    var b = snap.TryGetValue(u.Id, out var sv) ? sv : (u.Level, 0);
                    var a = Arch(u);
                    return new UnitProgress
                    {
                        Id = u.Id, ArchetypeId = u.ArchetypeId, Quality = u.Quality, Name = u.Name, Symbol = a.Symbol, Color = a.Color, Owner = u.Owner,
                        LvlBefore = b.Item1, XpBefore = b.Item2, NextBefore = XpToNext(b.Item1), LvlAfter = u.Level, XpAfter = u.Xp, NextAfter = XpToNext(u.Level), Pe = u.EvoPoints
                    };
                }).ToList();
            }

            if (res.Won)
            {
                Sfx("victory");
                r.Stats.Wins++; r.CapPenalty = 0;
                int gold = (int)JsMath.Round(GoldBase(r.RoomType, r.Room) * gf * rm);
                foreach (var p in r.Players)
                {
                    int interest = (int)Math.Min(C.InterestCap, Math.Floor(p.Gold * C.InterestRate));
                    int trans = BoardOf(p.Id).Sum(u => u.Skills.Get("al_transmutar") * 8);
                    p.Gold += gold + interest + trans; r.Stats.GoldEarned += gold + interest + trans;
                    rewards.Gold.Add(new GoldReward { Pid = p.Id, Base = gold, Interest = interest, Trans = trans, Total = gold + interest + trans, Now = p.Gold });
                    lines.Add($"🪙 {(IsCoop() ? p.Name + ": " : "")}+{gold}g, +{interest}g de juros{(trans != 0 ? $", +{trans}g Transmutação" : "")}");
                }
                SplitXp(1);
                if (objDone && r.Objective.Reward.Kind == "gold") foreach (var p in r.Players) { p.Gold += (int)r.Objective.Reward.Amount; r.Stats.GoldEarned += (int)r.Objective.Reward.Amount; }
                Log($"🏆 Sala {r.Room} vencida! +{gold}g{(IsCoop() ? " por jogador" : "")}.", "win");

                var pend = new List<Pending>();
                void Give(int pid, ItemRef it, string label) { P(pid).Bag.Add(it); rewards.Items.Add(new ItemReward { Pid = pid, Item = it, Label = label }); lines.Add($"🎁 {label}: {D.Items[it.Id].Name}"); }
                if (r.RoomType == "combate")
                {
                    r.NormalWins++;
                    if (r.NormalWins % C.ItemEvery == 0) { int pid = NextChooser(); Give(pid, RollItem(1), "Item de patrulha"); }
                    else rewards.Extras.Add(new ExtraLine { Icon = "🎁", Text = $"Próximo item em {C.ItemEvery - r.NormalWins % C.ItemEvery} combate(s) comum(ns).", Dim = true });
                }
                if (objDone && r.Objective.Reward.Kind == "item") foreach (var p in r.Players) Give(p.Id, RollItem(r.Objective.Reward.Tier), "Objetivo bônus");
                if (objDone) Log($"🎖️ Objetivo cumprido: {ObjectiveText(r.Objective)} ({r.Objective.Reward.Text}).", "win");
                if (r.Mission == "defesa")
                {
                    int bonus = (int)JsMath.Round(gold * 0.5);
                    foreach (var p in r.Players) { p.Gold += bonus; r.Stats.GoldEarned += bonus; }
                    rewards.Extras.Add(new ExtraLine { Icon = "🏘️", Text = $"A cidade agradece: +{bonus}g{(IsCoop() ? " cada" : "")}." });
                }
                if (r.Mission == "invasao") { int pid = NextChooser(); Give(pid, RollItem(r.Act >= 3 ? 2 : 1), res.FortDown ? "Tesouro da fortaleza" : "Saque da base"); }
                if (r.RoomType == "elite") { r.Stats.Elites++; int pid = NextChooser(); Give(pid, RollItem(1), "Item de Elite"); pend.Add(MakeRelicChoice("elite")); rewards.Relic = "elite"; }
                if (HasRelic("ovo_dourado"))
                {
                    r.Flags.EggWins++;
                    if (r.Flags.EggWins >= 3)
                    {
                        r.Relics.Remove("ovo_dourado"); r.Relics.Add("pintinho_dourado");
                        rewards.Extras.Add(new ExtraLine { Icon = "🐣", Text = "O Ovo Dourado chocou! Um Pintinho Dourado agora acompanha o grupo." });
                        Secret("chocadeira");
                    }
                    else rewards.Extras.Add(new ExtraLine { Icon = "🥚", Text = $"O Ovo Dourado se mexe... ({r.Flags.EggWins}/3)" });
                }
                if (r.RoomType == "chefe")
                {
                    r.Stats.Bosses++;
                    foreach (var p in r.Players) Give(p.Id, RollItem(2), "Espólio do Chefe");
                    rewards.Relic = "boss";
                    if (HasRelic("lanterna_ancestral")) { foreach (var u in r.Board) u.EvoPoints++; rewards.Extras.Add(new ExtraLine { Icon = "🏮", Text = "Lanterna Ancestral: +1 PE para todo o campo." }); }
                    FinishUnits();
                    if (r.Room >= C.TotalRooms)
                    {
                        r.Pending.Insert(0, new Pending { Kind = "report", Won = true, Final = true, Title = "👑 A Forja foi salva!", Lines = lines, LevelUps = levelUps, Report = report, Time = res.Time, Rewards = rewards });
                        r.AfterPending = "END"; r.Phase = "CHOICE"; Changed();
                        return;
                    }
                    pend.Add(MakeRelicChoice("boss"));
                    r.Act++; r.NodeId = null; if (r.Scaling == "dinamica") r.Threat = (int)Math.Max(D.Scaling.ThreatMin, r.Threat - 1);
                    r.Map = WithRng(rng => Generation.GenerateActMap(D, rng, r.Act, r.Ascension));
                    r.CitadelHp = Math.Min(r.CitadelMax, r.CitadelHp + 25);
                    rewards.Citadel = new CitadelChange { Delta = 25, Hp = r.CitadelHp, Max = r.CitadelMax };
                    var A = D.GetAct(r.Act);
                    rewards.Extras.Add(new ExtraLine { Icon = A.StoryIcon, Text = $"Novo Ato desbloqueado: {A.Short} — {A.Name}." });
                    Log($"🌄 {A.Short} — {A.Name}!", "gold");
                    pend.Add(StoryAct(r.Act));
                }
                FinishUnits();
                r.Pending.Insert(0, new Pending { Kind = "report", Won = true, Title = r.RoomType == "chefe" ? "👑 Chefe Derrotado!" : r.RoomType == "elite" ? "💀 Elite Derrotada!" : "🏆 Vitória!", Lines = lines, LevelUps = levelUps, Report = report, Time = res.Time, Rewards = rewards });
                r.Pending.AddRange(pend);
                r.AfterPending = "MAP";
                r.Enemies = new List<UnitDef>();
            }
            else
            {
                Sfx("defeat");
                r.Stats.Losses++;
                int dmg = Math.Max(10, (int)JsMath.Round(res.Survivors * 6 / Math.Sqrt(Coop())) + r.Act * 4);
                r.CitadelHp = Math.Max(0, r.CitadelHp - dmg);
                SplitXp(0.45);
                rewards.Citadel = new CitadelChange { Delta = -dmg, Hp = r.CitadelHp, Max = r.CitadelMax };
                lines.Add($"🏰 A Cidadela sofreu -{dmg} ({r.CitadelHp}/{r.CitadelMax})");
                Log($"💥 Derrota na Sala {r.Room}: Cidadela -{dmg}.", "danger");
                if (r.CitadelHp <= 0) { EndRun(false, report); return; }
                r.Attempt++;
                FinishUnits();
                if (IsAdaptive()) { ReScaleForRetry(); rewards.Extras.Add(new ExtraLine { Icon = "⚖️", Text = $"A horda foi reajustada à Ameaça atual ({(r.Threat >= 0 ? "+" : "")}{r.Threat})." }); }
                r.Pending.Insert(0, new Pending { Kind = "report", Won = false, Title = "💥 Derrota", Lines = lines, LevelUps = levelUps, Report = report, Time = res.Time, Rewards = rewards });
                r.AfterPending = "PREP";
            }
            r.Phase = "CHOICE";
            Ach("state"); Changed();
        }

        /// <summary>Duração do último combate (G.__lastTime, usado pelo simulador).</summary>
        public double LastCombatTime;

        void EndRun(bool victory, List<CombatReportRow> report)
        {
            var r = Run; var m = Meta;
            int shards = Math.Max(10, r.Room * 4 + r.Stats.Elites * 10 + r.Stats.Bosses * 22 + (victory ? 70 : 0) + r.Ascension * 15);
            m.AstralShards += shards;
            m.Records.BestRoom = Math.Max(m.Records.BestRoom, r.Room);
            m.Records.Kills += r.Stats.Kills;
            bool unlocked = false;
            if (victory)
            {
                m.Records.Wins++;
                if (IsCoop()) m.Records.CoopWins++;
                m.Records.BestWinAscension = Math.Max(m.Records.BestWinAscension, r.Ascension);
                if (r.Daily == null && r.Ascension >= m.MaxAscension && m.MaxAscension < D.Ascensions.Count - 1) { m.MaxAscension++; unlocked = true; }
            }
            if (r.Daily != null)
            {
                var prev = m.DailyRecords.Get(r.Daily) ?? new DailyRecord();
                m.DailyRecords[r.Daily] = new DailyRecord { Room = Math.Max(prev.Room, r.Room), Win = prev.Win || victory, Tries = prev.Tries + 1 };
            }
            r.Phase = "END";
            Ach("end");
            r.Ended = new RunEnd { Victory = victory, Shards = shards, Unlocked = unlocked, Report = report };
            Log(victory ? "👑 EXPEDIÇÃO CONCLUÍDA!" : "💀 A Cidadela caiu.", victory ? "win" : "danger");
            Changed();
        }

        /* ---------------- História ---------------- */
        Pending StoryAct(int act)
        {
            var a = D.GetAct(act);
            return new Pending { Kind = "story", Icon = a.StoryIcon, Title = $"{a.Short} — {a.Name}", Paragraphs = a.Story, Button = act == 1 ? "Partir em expedição" : "Seguir adiante" };
        }
        Pending StoryTutorial() => new Pending
        {
            Kind = "story", Icon = "🧭", Title = "Primeiros passos", Tutorial = true, Button = "Entendi!", Paragraphs = new List<string>
            {
                "<b>1. Recrute.</b> Na área Recrutar (parte de baixo da tela) todas as classes estão sempre disponíveis, com preço fixo. Juntar unidades da mesma Classe/Origem ativa sinergias.",
                "<b>2. Posicione.</b> Arraste as unidades no seu lado do campo (linhas de baixo). Tanques na frente, atiradores e magos atrás — ou use 🧭 Auto-posicionar.",
                "<b>3. Escolha o caminho.</b> No 🗺️ Mapa, cada nó é uma sala: combates dão XP e ouro; Forja, Mercador e Santuário dão recursos.",
                "<b>4. Evolua.</b> O XP da sala é <b>dividido</b> entre quem está em campo. Cada nível dá 1 PE: aprimore habilidades ou absorva elementos (botão ⭐ Evoluir).",
                "<b>5. Leia o inimigo.</b> Acima do tabuleiro aparecem a <b>doutrina</b> da horda, a <b>inteligência inimiga</b> (contramedidas contra o seu estilo, a partir do Ato II) e um <b>objetivo bônus</b>. Responda com composição, posição e <b>Tática</b>.",
                "<b>6. Sobreviva.</b> Derrotas custam Vida da Cidadela. Chegue ao fim dos 4 Atos!"
            }
        };
    }
}
