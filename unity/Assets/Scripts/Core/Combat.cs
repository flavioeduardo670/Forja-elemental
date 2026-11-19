using System;
using System.Collections.Generic;
using System.Linq;

namespace ForjaElemental.Core
{
    /// <summary>
    /// Receptor opcional dos efeitos visuais e sonoros do combate. O motor só
    /// emite dados; a camada Unity decide como mostrar. Nada aqui afeta a lógica.
    /// </summary>
    public interface ICombatFx
    {
        void Text(double x, double y, string text, string color, double scale);
        void Burst(double x, double y, string color, int count);
        void Shock(double x, double y, double radius, string color);
        void Beam(double x1, double y1, double x2, double y2, string color);
        void Slash(double x, double y, double angle, string color, bool big);
        void Death(Combatant u);
        void Sfx(string name, bool arg = false);
        void Log(string text, string type);
        void Wave(int n, int of, int count);
    }

    public sealed class Point { public double X, Y; public Point(double x, double y) { X = x; Y = y; } }

    public sealed class Combatant
    {
        public int Uid;
        public string RosterId, Team, Name, ArchetypeId, Color, Symbol, Script, Structure, Tactic, HuntId;
        public bool IsBoss, IsElite, IsSummon, IsLeader, Ambush, Dead;
        public Combatant Owner, BurnSrc, BleedSrc, Target;
        public List<string> Affixes;
        public int Level, AttackCounter, CastIdx, Kills, Casts;
        public OrderedDict<int> Elements, Skills;
        public StatBlock Stats;
        public double Hp, Shield, Mana, X, Y, StartCol, StartRow, Radius;
        public double AttackCooldown, Stun, Chill, ChillFactor, Burn, BurnDps, BurnExplode, Bleed, BleedDps, Haste, HasteMult = 1.25, AuraT;
        public double DmgDealt, DmgTaken, HealDone;
        public int? HuntUid;
        public double PathT;
        public Point Wp;
        public BossState Ss = new BossState();
        // Apresentação (contadores que a camada visual lê)
        public double Flash, AnimAtk, AnimCast;
        public bool IsPlayer => Team == "player";
    }

    public sealed class BossState
    {
        public double T;
        public bool S1, S2, Final, Enraged, Wave, Eclipse, HasBase;
        public string Phase;
        public double BaseTr, BaseLs;
    }

    public sealed class Projectile { public double X, Y, Speed, Dmg; public Combatant Target, Attacker; public bool Crit; public string Color; }

    public sealed class CombatResult
    {
        public bool Won, CityLost, FortDown;
        public int Survivors, Waves;
        public double Time;
        public double? LeaderAt;
    }

    public sealed class CombatSide { public UnitDef Unit; public StatBlock Stats; public string Team; }

    public sealed class CombatOptions
    {
        public uint Seed = 1;
        public HashSet<string> Relics = new HashSet<string>();
        public string Affix, Tactic = "equilibrio", Mission = "batalha", HuntId, Terrain;
        public double AntiHeal, WaveDelay;
        public List<CombatSide> Players = new List<CombatSide>();
        public List<CombatSide> Enemies = new List<CombatSide>();
        public List<CombatSide> Structures = new List<CombatSide>();
    }

    public sealed class CombatReportRow
    {
        public string RosterId, Name, Symbol, Color;
        public double DmgDealt, DmgTaken, HealDone;
        public int Kills, Casts;
        public bool Survived;
    }

    public sealed class CombatState
    {
        public GameData D;
        public List<Combatant> Units = new List<Combatant>();
        public double Time;
        public Rng Rng;
        public HashSet<string> Relics;
        public string Affix, Tactic, Mission;
        public bool PhoenixUsed, Over, OvertimeAnnounced;
        public CombatResult Result;
        public char[] Terrain;
        public int TerrainVer, MaxPlayerSummons;
        public double AntiHeal;
        public double? LeaderDeathAt;
        public Dictionary<int, List<Combatant>> Reserve = new Dictionary<int, List<Combatant>>();
        public List<Combatant> FortPool = new List<Combatant>();
        public int WaveNow = 1, WaveMax = 1, WaveSize;
        public double LastWaveT, NextWaveT, FortNext;
        public Combatant City, Fort;
        public List<Projectile> Projectiles = new List<Projectile>();
        public ICombatFx Fx;
        internal int UidSeq;
    }

    /// <summary>Port da simulação de combate de js/engine.js §3.</summary>
    public static class CombatEngine
    {
        static readonly HashSet<string> Backline = new HashSet<string> { "clerigo", "druida", "bardo", "cacador", "arcanista", "alquimista", "artifice", "necromante" };
        static readonly string[] AllElements = { "fogo", "agua", "pedra", "ar", "solar", "lunar" };

        /* ---------------- Atributos de invocações e estruturas ---------------- */
        public static StatBlock SummonStats(double hp, double ad, OrderedDict<double> extra = null)
        {
            var s = new StatBlock
            {
                MaxHp = hp, Ad = ad, Ap = 0, Armor = 20, AttackSpeed = 1.0, Range = 1.45, CritChance = 0.10, CritDmg = 1.75, MoveSpeed = 2.4,
                MaxMana = 999, HealPowerMult = 1, DmgDealtMult = 1
            };
            if (extra != null) foreach (var kv in extra) s.Set(kv.Key, kv.Value);
            return s;
        }

        static OrderedDict<double> X(params (string k, double v)[] kv)
        {
            var o = new OrderedDict<double>(); foreach (var (k, v) in kv) o[k] = v; return o;
        }

        public static StatBlock StructureStats(double maxHp, double ad = 0, double armor = 30, double attackSpeed = 0.01, double range = 0.5, double critChance = 0, OrderedDict<double> extra = null)
        {
            var e = X(("ap", 0), ("armor", armor != 0 ? armor : 30), ("attackSpeed", attackSpeed != 0 ? attackSpeed : 0.01), ("range", range != 0 ? range : 0.5),
                ("critChance", critChance), ("moveSpeed", 0), ("maxMana", 99999));
            if (extra != null) foreach (var kv in extra) e[kv.Key] = kv.Value;
            return SummonStats(maxHp, ad, e);
        }

        static Combatant Make(CombatState c, UnitDef src, string team, StatBlock stats, bool isSummon = false, Combatant owner = null)
        {
            c.D.Archetypes.TryGetValue(src.ArchetypeId ?? "", out var arch);
            return new Combatant
            {
                Uid = ++c.UidSeq, RosterId = team == "player" && !isSummon ? src.Id : null, Team = team,
                Name = src.Name ?? arch?.Name, ArchetypeId = src.ArchetypeId, Color = src.Color ?? arch?.Color, Symbol = src.Symbol ?? arch?.Symbol,
                IsBoss = src.IsBoss, IsElite = src.IsElite, IsSummon = isSummon, Owner = owner, Affixes = src.Affixes ?? new List<string>(), Script = src.Script,
                Level = src.Level > 0 ? src.Level : 1, Elements = new OrderedDict<int>(src.Elements), Skills = new OrderedDict<int>(src.Skills), Stats = stats.Clone(),
                Hp = stats.MaxHp, Shield = stats.InitialShield, Mana = stats.StartMana,
                X = src.Col + 0.5, Y = src.Row + 0.5, StartCol = src.Col, StartRow = src.Row,
                AttackCooldown = team == "player" ? 0.3 : 0.4, Structure = src.Structure, Radius = src.Radius
            };
        }

        /* ---------------- Criação ---------------- */
        public static CombatState Create(GameData d, CombatOptions o, ICombatFx fx = null)
        {
            var C = d.Config;
            var c = new CombatState
            {
                D = d, Rng = new Rng(o.Seed), Relics = o.Relics ?? new HashSet<string>(), Affix = o.Affix, Fx = fx,
                Terrain = (o.Terrain ?? new string('.', C.COLS * C.ROWS)).ToCharArray(), AntiHeal = o.AntiHeal, Tactic = o.Tactic ?? "equilibrio",
                Mission = o.Mission ?? "batalha", NextWaveT = o.WaveDelay != 0 ? o.WaveDelay : 15, FortNext = 6
            };
            foreach (var p in o.Players) c.Units.Add(Make(c, p.Unit, "player", p.Stats));
            string tgtMode = d.Tactics.TryGetValue(c.Tactic, out var tac) ? tac.Target : null;
            foreach (var u in c.Units) if (u.Team == "player") u.Tactic = tgtMode;
            foreach (var st in o.Structures)
            {
                var u = Make(c, st.Unit, st.Team, st.Stats);
                c.Units.Add(u);
                if (st.Unit.Structure == "cidade") c.City = u;
                if (st.Unit.Structure == "forte") c.Fort = u;
            }
            foreach (var e in o.Enemies)
            {
                var u = Make(c, e.Unit, "enemy", e.Stats);
                u.Ambush = e.Unit.Ambush; u.HuntId = o.HuntId; u.IsLeader = e.Unit.Leader || e.Unit.IsBoss;
                if (e.Unit.Raider && c.City != null) u.HuntUid = c.City.Uid;
                if (e.Unit.FortSpawn) { c.FortPool.Add(u); continue; }
                int w = e.Unit.Wave > 0 ? e.Unit.Wave : 1;
                if (w > 1)
                {
                    if (!c.Reserve.TryGetValue(w, out var list)) c.Reserve[w] = list = new List<Combatant>();
                    list.Add(u); c.WaveMax = Math.Max(c.WaveMax, w); continue;
                }
                c.Units.Add(u);
            }
            c.WaveSize = c.Units.Count(u => u.Team == "enemy" && u.Structure == null);
            foreach (var u in c.Units)
            {
                if (u.Team == "enemy") EnterEnemy(c, u);
                else if (c.Relics.Contains("sino_guerra") && u.Structure == null) { u.Haste = 5; u.HasteMult = 1.3; }
            }
            // Sombra: salto para a retaguarda adversária
            foreach (var u in c.Units)
            {
                if ((u.ArchetypeId != "sombra" && !u.Ambush) || u.IsBoss || u.IsElite) continue;
                int row = u.Team == "player" ? 0 : C.ROWS - 1;
                int col = NearestFreeCol(c, row, (int)Math.Floor(u.X), u.Uid);
                if (col != -1) { Burst(c, u.X, u.Y, "#f43f5e", 10); u.X = col + 0.5; u.Y = row + 0.5; Burst(c, u.X, u.Y, "#f43f5e", 14); }
            }
            return c;
        }

        static void EnterEnemy(CombatState c, Combatant u)
        {
            if (u.Structure != null) return;
            if (c.Relics.Contains("nucleo_instavel"))
            {
                double n = JsMath.Round(u.Stats.MaxHp * 0.15); u.Hp = Math.Max(1, u.Hp - n);
                Text(c, u.X, u.Y - 0.4, $"-{n} 💣", "#f97316", 1.1);
            }
            if (c.Relics.Contains("teia_arcana")) { u.Chill = 4; u.ChillFactor = 0.35; }
            if (u.Script == "arconte") SetArcontePhase(c, u, "solar");
        }

        static int NearestFreeCol(CombatState c, int row, int pref, int ignore)
        {
            int[] offs = { 0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8 };
            foreach (int off in offs)
            {
                int col = pref + off;
                if (col < 0 || col >= c.D.Config.COLS || Board.TileBlocked(c.D, c.Terrain, col, row)) continue;
                if (!c.Units.Any(u => !u.Dead && u.Uid != ignore && Math.Floor(u.X) == col && Math.Floor(u.Y) == row)) return col;
            }
            return -1;
        }

        /* ---------------- Terreno e caminhos ---------------- */
        static char TileOf(CombatState c, double x, double y) => Board.TerrainAt(c.D, c.Terrain, (int)Math.Floor(x), (int)Math.Floor(y));
        static bool BlockedAt(CombatState c, double x, double y) => Board.TileBlocked(c.D, c.Terrain, (int)Math.Floor(x), (int)Math.Floor(y));

        static bool LineClear(CombatState c, double x1, double y1, double x2, double y2)
        {
            int n = (int)Math.Ceiling(JsMath.Hypot(x2 - x1, y2 - y1) / 0.25);
            for (int i = 1; i < n; i++) { double t = i / (double)n; if (BlockedAt(c, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false; }
            return true;
        }

        /* BFS em 8 direções (sem cortar quinas) → centro da próxima casa do caminho */
        static Point NextStep(CombatState c, int sx, int sy, int tx, int ty)
        {
            int N = c.D.Config.COLS, M = c.D.Config.ROWS, start = sy * N + sx, goal = ty * N + tx;
            if (start == goal) return null;
            var prev = new int[N * M];
            for (int i = 0; i < prev.Length; i++) prev[i] = -1;
            prev[start] = start;
            var q = new List<int> { start };
            for (int h = 0; h < q.Count; h++)
            {
                int cur = q[h]; if (cur == goal) break;
                int cx = cur % N, cy = cur / N;
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= N || ny >= M) continue;
                        int j = ny * N + nx;
                        if (prev[j] != -1) continue;
                        if (j != goal && Board.TileBlocked(c.D, c.Terrain, nx, ny)) continue;
                        if (dx != 0 && dy != 0 && (Board.TileBlocked(c.D, c.Terrain, cx + dx, cy) || Board.TileBlocked(c.D, c.Terrain, cx, cy + dy))) continue;
                        prev[j] = cur; q.Add(j);
                    }
            }
            if (goal < 0 || goal >= prev.Length || prev[goal] == -1) return null;
            int node = goal;
            while (prev[node] != start) node = prev[node];
            return new Point(node % N + 0.5, node / N + 0.5);
        }

        /* ---------------- Efeitos (só repassa ao receptor) ---------------- */
        static void Text(CombatState c, double x, double y, string t, string color = "#fff", double scale = 1) => c.Fx?.Text(x, y, t, color, scale);
        static void Burst(CombatState c, double x, double y, string color, int n = 10) => c.Fx?.Burst(x, y, color, n);
        static void Shock(CombatState c, double x, double y, double r, string color) => c.Fx?.Shock(x, y, r, color);
        static void Beam(CombatState c, double x1, double y1, double x2, double y2, string color) => c.Fx?.Beam(x1, y1, x2, y2, color);
        static void Sfx(CombatState c, string name, bool arg = false) => c.Fx?.Sfx(name, arg);
        static void Log(CombatState c, string t, string type) => c.Fx?.Log(t, type);

        static List<Combatant> Alive(CombatState c, string team = null) => c.Units.Where(u => !u.Dead && (team == null || u.Team == team)).ToList();
        static double Dist(Combatant a, Combatant b) => JsMath.Hypot(a.X - b.X, a.Y - b.Y);
        static double Ratio(Combatant u) => u.Hp / u.Stats.MaxHp;

        /* ---------------- Dano, cura, escudo, morte ---------------- */
        sealed class Vis { public string T, Color; public double Scale = 1; }

        static double ApplyRaw(CombatState c, Combatant tgt, double amount, Combatant src, Vis vis)
        {
            if (tgt == null || tgt.Dead || amount <= 0) return 0;
            double rem = amount;
            if (tgt.Shield > 0) { double ab = Math.Min(tgt.Shield, rem); tgt.Shield -= ab; rem -= ab; }
            tgt.Hp = Math.Max(0, tgt.Hp - rem);
            tgt.DmgTaken += amount;
            if (vis != null) tgt.Flash = 0.12;
            var credit = src != null ? (src.Owner ?? src) : null;
            if (credit != null && credit.Team != tgt.Team) credit.DmgDealt += amount;
            if (vis != null) Text(c, tgt.X, tgt.Y - 0.3, vis.T, vis.Color, vis.Scale);
            if (tgt.Hp <= 0 && !tgt.Dead) HandleDeath(c, src, tgt);
            return amount;
        }

        public sealed class DmgOpts { public bool NoDodge, NoThorns; public double ArmorPen; }

        static double DealDamage(CombatState c, Combatant att, Combatant tgt, double raw, string type = "physical", bool crit = false, DmgOpts opts = null)
        {
            if (tgt == null || tgt.Dead) return 0;
            opts = opts ?? new DmgOpts();
            char tt = TileOf(c, tgt.X, tgt.Y);
            double forest = tt == 'F' ? 0.15 : tt == 'U' ? 0.10 : 0;
            if (type == "physical" && !opts.NoDodge && c.Rng.Next() < Math.Min(0.75, tgt.Stats.Dodge + forest)) { Text(c, tgt.X, tgt.Y - 0.35, "ESQUIVA", "#38bdf8", 0.9); return 0; }
            double dmg = raw * (att != null ? att.Stats.DmgDealtMult : 1);
            if (att != null)
            {
                double ratio = Ratio(tgt);
                if (att.Stats.ExecuteBonus > 0 && ratio < 0.45) dmg *= 1 + att.Stats.ExecuteBonus;
                if (att.Stats.HighHpBonus > 0 && ratio > 0.70) dmg *= 1 + att.Stats.HighHpBonus;
                double aura = 0, insp = 0, guard = 0;
                foreach (var u in c.Units)
                {
                    if (u.Dead) continue;
                    if (u.Team != att.Team && u.Stats.SolarAuraReduce > 0 && JsMath.Hypot(u.X - att.X, u.Y - att.Y) <= 2.2) aura = Math.Max(aura, u.Stats.SolarAuraReduce);
                    if (u.Team == att.Team && u.Stats.InspireAura > 0 && JsMath.Hypot(u.X - att.X, u.Y - att.Y) <= 2.5) insp = Math.Max(insp, u.Stats.InspireAura);
                    if (u.Team == tgt.Team && u.Stats.GuardAura > 0 && JsMath.Hypot(u.X - tgt.X, u.Y - tgt.Y) <= 2.5) guard = Math.Max(guard, u.Stats.GuardAura);
                }
                dmg *= (1 - aura) * (1 + insp) * (1 - guard);
                char at0 = TileOf(c, att.X, att.Y);
                if (att.Stats.Range > 2.3 && at0 == 'H') dmg *= 1.10;
                if (att.Stats.Range > 2.3 && at0 == 'U') dmg *= 1.15;
            }
            double armor = tgt.Stats.Armor;
            if (type == "magic") armor *= 0.45 * (1 - (att != null ? att.Stats.MagicPen : 0));
            else if (type == "physical") armor *= 1 - Math.Min(0.9, (att != null ? att.Stats.ArmorPen : 0) + opts.ArmorPen);
            else armor = 0;
            dmg = dmg * (100 / (100 + Math.Max(0, armor))) * (1 - tgt.Stats.DmgReduction) * (type == "magic" ? 1 - tgt.Stats.MagicReduce : 1);
            double trueD = att != null && type != "true" && att.Stats.TrueDmgBonus > 0 ? raw * att.Stats.TrueDmgBonus * (1 - tgt.Stats.ElemResist) : 0;
            double final = Math.Max(3, JsMath.Round(dmg + trueD));

            string color = crit ? "#facc15" : (type == "magic" ? "#d8b4fe" : (type == "true" ? "#fde68a" : "#f8fafc"));
            ApplyRaw(c, tgt, final, att, new Vis { T = crit ? $"{final}!" : $"{final}", Color = color, Scale = crit ? 1.18 : 0.98 });

            if (att != null && !att.Dead)
            {
                double ls = att.Stats.Lifesteal;
                if (att.Skills.Get("be_sede_sangue") != 0 && Ratio(att) < 0.5) ls *= 2;
                if (ls > 0) att.Hp = Math.Min(att.Stats.MaxHp, att.Hp + JsMath.Round(final * ls));
                if (att.Stats.BurnPct > 0 && !tgt.Dead)
                {
                    tgt.Burn = 3.0;
                    tgt.BurnDps = Math.Max(tgt.BurnDps, JsMath.Round(tgt.Stats.MaxHp * att.Stats.BurnPct * (1 - tgt.Stats.ElemResist)));
                    tgt.BurnExplode = Math.Max(tgt.BurnExplode, att.Stats.ExplodePct);
                    tgt.BurnSrc = att;
                }
                if (type == "physical" && tgt.Stats.Thorns > 0 && !opts.NoThorns && !tgt.Dead)
                    ApplyRaw(c, att, Math.Max(2, JsMath.Round(raw * tgt.Stats.Thorns * 0.5)), tgt, null);
            }
            return final;
        }

        static double Heal(CombatState c, Combatant src, Combatant tgt, double raw)
        {
            if (tgt == null || tgt.Dead) return 0;
            double amt = JsMath.Round(raw * (src != null ? src.Stats.HealPowerMult : 1) * (tgt.Team == "player" && c.AntiHeal != 0 ? 1 - c.AntiHeal : 1));
            double healed = Math.Min(tgt.Stats.MaxHp - tgt.Hp, amt);
            if (healed > 0)
            {
                tgt.Hp += healed;
                if (src != null) (src.Owner ?? src).HealDone += healed;
                Text(c, tgt.X, tgt.Y - 0.35, $"+{healed}", "#34d399", 1.0);
                Burst(c, tgt.X, tgt.Y, "#34d399", 5);
            }
            return healed;
        }

        static void ShieldUp(CombatState c, Combatant src, Combatant tgt, double raw)
        {
            if (tgt == null || tgt.Dead) return;
            double amt = JsMath.Round(raw * (src != null ? src.Stats.HealPowerMult : 1));
            tgt.Shield += amt;
            if (src != null) (src.Owner ?? src).HealDone += JsMath.Round(amt * 0.5);
            Text(c, tgt.X, tgt.Y - 0.42, $"+{amt} 🛡️", "#93c5fd", 0.95);
        }

        static void HandleDeath(CombatState c, Combatant killer, Combatant v)
        {
            if (v.Team == "enemy" && v.IsLeader && c.LeaderDeathAt == null && !(v.Hp > 0)) c.LeaderDeathAt = c.Time;
            if (v.Team == "player" && !v.IsSummon && c.Relics.Contains("fenix_cinzas") && !c.PhoenixUsed)
            {
                c.PhoenixUsed = true;
                v.Hp = JsMath.Round(v.Stats.MaxHp * 0.45);
                Shock(c, v.X, v.Y, 2.0, "#f97316"); Burst(c, v.X, v.Y, "#facc15", 24);
                Text(c, v.X, v.Y - 0.55, "FÊNIX RENASCEU! 🔥", "#facc15", 1.25);
                Sfx(c, "levelUp");
                foreach (var e in Alive(c, "enemy")) if (Dist(e, v) <= 2.1) DealDamage(c, v, e, v.Stats.Ap * 1.4 + 90, "magic");
                return;
            }
            v.Dead = true; v.Hp = 0;
            c.Fx?.Death(v);
            foreach (var n in c.Units)
            {
                int lv = n.Skills.Get("ne_colheita");
                if (!n.Dead && lv != 0) n.Stats.Ap = JsMath.Round(n.Stats.Ap * (1 + 0.04 * lv));
            }
            Burst(c, v.X, v.Y, v.Color, 16); Shock(c, v.X, v.Y, 1.0, v.Color);
            Sfx(c, "death");
            if (v.Burn > 0 && v.BurnExplode > 0)
            {
                double boom = JsMath.Round(v.Stats.MaxHp * v.BurnExplode);
                Shock(c, v.X, v.Y, 1.7, "#ef4444");
                foreach (var o in Alive(c, v.Team))
                    if (Dist(o, v) <= 1.75) { double bm = JsMath.Round(boom * (1 - o.Stats.ElemResist)); ApplyRaw(c, o, bm, v.BurnSrc, new Vis { T = $"{bm}", Color = "#f97316" }); }
            }
            if (v.Affixes.Contains("explosivo"))
            {
                double boom = JsMath.Round(v.Stats.MaxHp * 0.20);
                Shock(c, v.X, v.Y, 2.2, "#fb923c");
                foreach (var o in Alive(c, v.Team == "player" ? "enemy" : "player"))
                    if (Dist(o, v) <= 2.0) ApplyRaw(c, o, boom, v, new Vis { T = $"{boom} 💥", Color = "#fb923c" });
            }
            if (killer != null && killer.Team != v.Team)
            {
                var k = killer.Owner ?? killer;
                k.Kills++;
                if (k.Team == "player" && c.Relics.Contains("calice_sangue") && !k.Dead) { Heal(c, k, k, k.Stats.MaxHp * 0.20); k.Haste = 4; k.HasteMult = 1.25; }
            }
        }

        sealed class SummonDef { public string Name, Symbol, Color, ArchetypeId = "berserker"; public int Level = 1; public double Hp, Ad; public OrderedDict<double> Extra; }

        static Combatant Summon(CombatState c, Combatant owner, SummonDef def)
        {
            var C = c.D.Config;
            var src = new UnitDef { Id = "s", ArchetypeId = def.ArchetypeId, Name = def.Name, Symbol = def.Symbol, Color = def.Color, Level = def.Level };
            var stats = SummonStats(JsMath.Round(def.Hp * (1 + owner.Stats.SummonMult + owner.Stats.SummonHp)), JsMath.Round(def.Ad * (1 + owner.Stats.SummonMult)), def.Extra);
            var u = Make(c, src, owner.Team, stats, true, owner.IsSummon ? owner.Owner : owner);
            u.X = JsMath.Clamp(owner.X + (c.Rng.Next() - 0.5) * 1.2, 0.5, C.COLS - 0.5);
            u.Y = JsMath.Clamp(owner.Y + (owner.Team == "player" ? -0.6 : 0.6), 0.5, C.ROWS - 0.5);
            if (BlockedAt(c, u.X, u.Y)) { u.X = owner.X; u.Y = owner.Y; }
            u.AttackCooldown = 0.25;
            Burst(c, u.X, u.Y, def.Color, 14);
            c.Units.Add(u);
            return u;
        }

        static void Knockback(CombatState c, Combatant s, Combatant t, double dist)
        {
            if (t.Structure != null) return;
            var C = c.D.Config;
            double dx = t.X - s.X, dy = t.Y - s.Y, len = Math.Max(0.01, JsMath.Hypot(dx, dy));
            for (double d = 0; d < dist; d += 0.1)
            {
                double nx = JsMath.Clamp(t.X + dx / len * 0.1, 0.4, C.COLS - 0.4), ny = JsMath.Clamp(t.Y + dy / len * 0.1, 0.4, C.ROWS - 0.4);
                if (BlockedAt(c, nx, ny)) break;
                t.X = nx; t.Y = ny;
            }
        }

        /* ---------------- Habilidades ---------------- */
        static void RunSkill(CombatState c, string id, Combatant s, Combatant t, int l, List<Combatant> en, List<Combatant> al, Action<Combatant> wb)
        {
            switch (id)
            {
                case "vg_impacto":
                    {
                        Shock(c, s.X, s.Y, 1.85, "#3b82f6");
                        double dmg = 65 + l * 35 + s.Stats.Ad * 0.85;
                        foreach (var e in en) if (Dist(e, s) <= 1.9) { e.Stun = Math.Max(e.Stun, 1.1 + l * 0.35); wb(e); DealDamage(c, s, e, dmg); }
                        ShieldUp(c, s, s, 110 + l * 65);
                        break;
                    }
                case "vg_bastiao":
                    {
                        Shock(c, s.X, s.Y, 1.9, "#60a5fa");
                        double sh = 140 + l * 80 + s.Stats.Ap * 1.1;
                        foreach (var a in al) if (Dist(a, s) <= 1.95) ShieldUp(c, s, a, sh);
                        break;
                    }
                case "ar_orbe":
                    {
                        if (t == null) return;
                        Shock(c, t.X, t.Y, 1.9, "#a855f7"); Burst(c, t.X, t.Y, "#c084fc", 18);
                        double dmg = 90 + l * 45 + s.Stats.Ap * (1.05 + l * 0.20);
                        foreach (var e in en) if (Dist(e, t) <= 1.95) { wb(e); DealDamage(c, s, e, dmg, "magic"); }
                        break;
                    }
                case "ar_meteoro":
                    {
                        double dmg = 85 + l * 35 + s.Stats.Ap;
                        var targets = c.Rng.Shuffle(en);
                        for (int i = 0; i < 1 + l && targets.Count > 0; i++)
                        {
                            var e = targets[i % targets.Count];
                            Shock(c, e.X, e.Y, 1.4, "#f97316"); Burst(c, e.X, e.Y, "#ef4444", 14); wb(e); DealDamage(c, s, e, dmg, "magic");
                        }
                        break;
                    }
                case "ca_saraivada":
                    {
                        double dmg = 50 + l * 25 + s.Stats.Ad * (0.85 + l * 0.15);
                        var sorted = en.OrderBy(a => JsMath.Hypot(a.X - s.X, a.Y - s.Y)).ToList();
                        for (int i = 0; i < 2 + l && sorted.Count > 0; i++) { var e = sorted[i % sorted.Count]; Beam(c, s.X, s.Y, e.X, e.Y, "#34d399"); wb(e); DealDamage(c, s, e, dmg); }
                        break;
                    }
                case "ca_tiro_letal":
                    {
                        if (t == null) return;
                        Beam(c, s.X, s.Y, t.X, t.Y, "#facc15");
                        double dmg = 110 + l * 55 + s.Stats.Ad * 1.4 + Math.Max(0, t.Stats.MaxHp - t.Hp) * l * 0.08;
                        wb(t); DealDamage(c, s, t, dmg, "physical", true, new DmgOpts { NoDodge = true });
                        break;
                    }
                case "so_golpe":
                    {
                        if (t == null) return;
                        Burst(c, t.X, t.Y, "#f43f5e", 16);
                        t.Bleed = 3; t.BleedDps = Math.Max(t.BleedDps, l * 30); t.BleedSrc = s;
                        wb(t); DealDamage(c, s, t, 80 + l * 45 + s.Stats.Ad * (1.2 + l * 0.2), "physical", true, new DmgOpts { NoDodge = true });
                        break;
                    }
                case "so_danca":
                    {
                        Shock(c, s.X, s.Y, 1.7, "#f43f5e");
                        double dmg = 75 + l * 40 + s.Stats.Ad;
                        foreach (var e in en) if (Dist(e, s) <= 1.75) { wb(e); DealDamage(c, s, e, dmg); }
                        break;
                    }
                case "cl_luz":
                    {
                        var tgt = al.OrderBy(Ratio).FirstOrDefault() ?? s;
                        Sfx(c, "heal");
                        Heal(c, s, tgt, 115 + l * 55 + s.Stats.Ap * (1.2 + l * 0.25)); ShieldUp(c, s, tgt, 60 + l * 40);
                        break;
                    }
                case "cl_prece":
                    {
                        Sfx(c, "heal");
                        double h = 65 + l * 35 + s.Stats.Ap * 0.75;
                        foreach (var a in al) { Heal(c, s, a, h); if (!a.IsSummon) a.Mana = Math.Min(a.Stats.MaxMana, a.Mana + 10 + l * 8); }
                        break;
                    }
                case "at_torreta":
                    Summon(c, s, new SummonDef
                    {
                        Name = $"Torreta Nv.{l}", Symbol = "🗼", Color = "#f59e0b", ArchetypeId = "artifice", Level = l,
                        Hp = 260 + l * 140 + JsMath.Round(s.Stats.Ap * 1.5), Ad = 38 + l * 22 + JsMath.Round(s.Stats.Ap * 0.45),
                        Extra = X(("range", 4.0), ("attackSpeed", 1.35), ("moveSpeed", 0), ("armor", 20 + l * 8), ("critChance", 0.15))
                    });
                    break;
                case "at_sobrecarga":
                    {
                        double dmg = 85 + l * 40 + s.Stats.Ap * 1.1;
                        var prev = s;
                        var list = t != null ? new[] { t }.Concat(en.Where(e => e != t)).ToList() : en;
                        for (int i = 0; i < 1 + l && i < list.Count; i++) { var e = list[i]; Beam(c, prev.X, prev.Y, e.X, e.Y, "#facc15"); wb(e); DealDamage(c, s, e, dmg, "magic"); prev = e; }
                        break;
                    }
                case "be_furia":
                    {
                        Shock(c, s.X, s.Y, 1.75, "#ea580c");
                        double dmg = 85 + l * 45 + s.Stats.Ad * (1.15 + l * 0.2);
                        foreach (var e in en) if (Dist(e, s) <= 1.8) { wb(e); DealDamage(c, s, e, dmg); }
                        Heal(c, s, s, Math.Max(0, s.Stats.MaxHp - s.Hp) * (0.10 + l * 0.05));
                        break;
                    }
                case "be_corte_giratorio":
                    {
                        Shock(c, s.X, s.Y, 1.85, "#f97316");
                        double dmg = 75 + l * 40 + s.Stats.Ad * 0.95;
                        foreach (var e in en) if (Dist(e, s) <= 1.9) { wb(e); DealDamage(c, s, e, dmg); }
                        break;
                    }
                case "ln_estocada":
                    {
                        if (t == null) return;
                        double dx = t.X - s.X, dy = t.Y - s.Y, len = Math.Max(0.01, JsMath.Hypot(dx, dy));
                        double ex = t.X + dx / len * 1.6, ey = t.Y + dy / len * 1.6;
                        Beam(c, s.X, s.Y, ex, ey, "#2dd4bf");
                        double dmg = 70 + l * 40 + s.Stats.Ad * 1.1;
                        foreach (var e in en)
                        {
                            double px = e.X - s.X, py = e.Y - s.Y, sx = ex - s.X, sy = ey - s.Y;
                            double tt = JsMath.Clamp((px * sx + py * sy) / (sx * sx + sy * sy), 0, 1);
                            if (JsMath.Hypot(px - sx * tt, py - sy * tt) <= 0.55) { wb(e); DealDamage(c, s, e, dmg, "physical", false, new DmgOpts { ArmorPen = 0.2 + l * 0.1 }); }
                        }
                        break;
                    }
                case "ln_varredura":
                    {
                        Shock(c, s.X, s.Y, 2.3, "#14b8a6");
                        double dmg = 60 + l * 35 + s.Stats.Ad * 0.9;
                        foreach (var e in en) if (Dist(e, s) <= 2.3) { e.Chill = Math.Max(e.Chill, 1 + l * 0.5); e.ChillFactor = Math.Max(e.ChillFactor, 0.35); wb(e); DealDamage(c, s, e, dmg); }
                        break;
                    }
                case "dr_raizes":
                    {
                        var list = c.Rng.Shuffle(en).Take(1 + l).ToList();
                        foreach (var e in list)
                        {
                            Burst(c, e.X, e.Y, "#84cc16", 12); e.Stun = Math.Max(e.Stun, 1 + l * 0.3);
                            wb(e); DealDamage(c, s, e, 60 + l * 30 + s.Stats.Ap * 0.8, "magic");
                        }
                        break;
                    }
                case "dr_lobo":
                    Summon(c, s, new SummonDef
                    {
                        Name = "Lobo Espiritual", Symbol = "🐺", Color = "#a3e635", ArchetypeId = "berserker", Level = l,
                        Hp = 300 + l * 150 + JsMath.Round(s.Stats.Ap * 1.2), Ad = 35 + l * 20 + JsMath.Round(s.Stats.Ap * 0.3),
                        Extra = X(("attackSpeed", 1.1), ("moveSpeed", 3.0), ("armor", 18 + l * 6), ("lifesteal", 0.15))
                    });
                    break;
                case "pa_martelo":
                    {
                        if (t == null) return;
                        Shock(c, t.X, t.Y, 1.0, "#fde047"); Burst(c, t.X, t.Y, "#fef08a", 14);
                        t.Stun = Math.Max(t.Stun, 1 + l * 0.3);
                        double dealt = DealDamage(c, s, t, 70 + l * 40 + s.Stats.Ad * 0.9 + s.Stats.Ap * 0.5, "magic");
                        var ally = Alive(c, s.Team).OrderBy(Ratio).FirstOrDefault();
                        if (ally != null && dealt != 0) Heal(c, s, ally, dealt * 0.5);
                        break;
                    }
                case "pa_consagrar":
                    {
                        Shock(c, s.X, s.Y, 2.0, "#fde047"); Sfx(c, "heal");
                        foreach (var e in en) if (Dist(e, s) <= 2.0) DealDamage(c, s, e, 55 + l * 30 + s.Stats.Ap * 0.7, "magic");
                        foreach (var a in al) if (Dist(a, s) <= 2.0) Heal(c, s, a, 40 + l * 25 + s.Stats.Ap * 0.5);
                        break;
                    }
                case "mo_palma":
                    {
                        if (t == null) return;
                        Burst(c, t.X, t.Y, "#f0abfc", 14); wb(t);
                        DealDamage(c, s, t, 60 + l * 35 + s.Stats.Ad, "physical", false, new DmgOpts { NoDodge = true });
                        if (!t.Dead && !t.IsBoss) Knockback(c, s, t, 1.5);
                        t.Stun = Math.Max(t.Stun, 0.6 + l * 0.2);
                        break;
                    }
                case "mo_rajada":
                    {
                        if (t == null) return;
                        wb(t);
                        for (int i = 0; i < 3 + l && !t.Dead; i++) DealDamage(c, s, t, 20 + l * 10 + s.Stats.Ad * 0.4, "physical", c.Rng.Next() < s.Stats.CritChance);
                        break;
                    }
                case "al_frasco":
                    {
                        if (t == null) return;
                        Shock(c, t.X, t.Y, 1.6, "#06b6d4"); Burst(c, t.X, t.Y, "#67e8f9", 16);
                        foreach (var e in en) if (Dist(e, t) <= 1.6) { e.Stats.Armor = Math.Max(0, e.Stats.Armor - l * 10); wb(e); DealDamage(c, s, e, 70 + l * 35 + s.Stats.Ap * 0.9, "magic"); }
                        break;
                    }
                case "al_nevoa":
                    {
                        double cx = t != null ? t.X : s.X, cy = t != null ? t.Y : s.Y;
                        Shock(c, cx, cy, 2.0, "#a3e635"); Burst(c, cx, cy, "#a3e635", 20);
                        foreach (var e in en) if (JsMath.Hypot(e.X - cx, e.Y - cy) <= 2.0) { e.Bleed = 4; e.BleedDps = Math.Max(e.BleedDps, 15 + l * 10 + s.Stats.Ap * 0.2); e.BleedSrc = s; }
                        break;
                    }
                case "bd_hino":
                    Shock(c, s.X, s.Y, 3.0, "#f472b6");
                    foreach (var a in al) { a.Haste = Math.Max(a.Haste, 4); a.HasteMult = Math.Max(a.Haste > 0 ? a.HasteMult : 1, 1.2 + l * 0.1); }
                    break;
                case "bd_balada":
                    Sfx(c, "heal"); Shock(c, s.X, s.Y, 3.0, "#f9a8d4");
                    foreach (var a in al) if (Dist(a, s) <= 3) { Heal(c, s, a, 60 + l * 30 + s.Stats.Ap * 0.6); if (!a.IsSummon) a.Mana = Math.Min(a.Stats.MaxMana, a.Mana + 15); }
                    break;
                case "ne_erguer":
                    for (int i = 0; i < (l >= 3 ? 2 : 1); i++)
                        Summon(c, s, new SummonDef
                        {
                            Name = "Esqueleto", Symbol = "💀", Color = "#cbd5e1", ArchetypeId = "berserker", Level = l,
                            Hp = 200 + l * 100 + JsMath.Round(s.Stats.Ap * 0.8), Ad = 30 + l * 15 + JsMath.Round(s.Stats.Ap * 0.25),
                            Extra = X(("moveSpeed", 2.5), ("armor", 14 + l * 5))
                        });
                    break;
                case "ne_drenar":
                    {
                        if (t == null) return;
                        Beam(c, s.X, s.Y, t.X, t.Y, "#6366f1");
                        double dealt = DealDamage(c, s, t, 90 + l * 45 + s.Stats.Ap, "magic");
                        if (dealt != 0) Heal(c, s, s, dealt * 0.5);
                        break;
                    }
            }
        }

        static void CastSkill(CombatState c, Combatant s, Combatant target, bool isEcho = false)
        {
            var d = c.D;
            if (!isEcho) Sfx(c, "magic");
            if (s.Team == "player" && c.Relics.Contains("pato_borracha") && c.Rng.Chance(0.12)) { Text(c, s.X, s.Y - 0.9, "QUACK! 🦆", "#fde047", 1.1); Sfx(c, "quack"); }
            s.Casts++; s.AnimCast = 1;
            if (s.Team == "player" && c.Relics.Contains("orbe_sobrecarga")) s.Stats.Ap = JsMath.Round(s.Stats.Ap * 1.12);
            if (s.Stats.ManaRefund > 0) s.Mana = Math.Min(s.Stats.MaxMana, s.Mana + s.Stats.ManaRefund);
            var actives = s.Skills.Where(kv => kv.Value > 0 && d.Skills.TryGetValue(kv.Key, out var sk0) && sk0.IsActive).Select(kv => kv.Key).ToList();
            string id = actives.Count > 0 ? actives[s.CastIdx % actives.Count] : (d.Archetypes.TryGetValue(s.ArchetypeId ?? "", out var ar) ? ar.SignatureSkill : null);
            if (!isEcho) s.CastIdx++;
            int lvl = s.Skills.Get(id); if (lvl == 0) lvl = 1;
            if (id != null && d.Skills.TryGetValue(id, out var sk)) Text(c, s.X, s.Y - 0.55, $"{sk.Icon} {sk.Name}{(isEcho ? " (Eco)" : "")}", "#38bdf8", 1.0);
            var en = Alive(c, s.Team == "player" ? "enemy" : "player");
            var al = Alive(c, s.Team);
            void Wb(Combatant e) { if (s.Stats.ChillAmt > 0 && e != null) { e.Chill = Math.Max(e.Chill, 3); e.ChillFactor = Math.Max(e.ChillFactor, s.Stats.ChillAmt); } }
            if (id != null) RunSkill(c, id, s, target != null && !target.Dead ? target : en.FirstOrDefault(), lvl, en, al, Wb);
            if (!isEcho && s.Team == "player" && c.Relics.Contains("anel_eco") && c.Rng.Chance(0.2)) CastSkill(c, s, target, true);
        }

        /* ---------------- Chefes ---------------- */
        static void SetArcontePhase(CombatState c, Combatant u, string phase)
        {
            if (!u.Ss.HasBase) { u.Ss.HasBase = true; u.Ss.BaseTr = u.Stats.TrueDmgBonus; u.Ss.BaseLs = u.Stats.Lifesteal; }
            u.Ss.Phase = phase;
            u.Stats.TrueDmgBonus = u.Ss.BaseTr + (phase == "solar" ? 0.4 : 0);
            u.Stats.Lifesteal = u.Ss.BaseLs + (phase == "lunar" ? 0.4 : 0);
            u.Color = phase == "solar" ? "#facc15" : "#c084fc";
            Text(c, u.X, u.Y - 0.7, phase == "solar" ? "☀️ FASE SOLAR" : "🌙 FASE LUNAR", u.Color, 1.25);
        }

        static void BossScript(CombatState c, Combatant u, double dt)
        {
            var ss = u.Ss; var d = c.D;
            switch (u.Script)
            {
                case "ferreiro":
                    ss.T += dt;
                    if (ss.T >= 8)
                    {
                        ss.T = 0;
                        var ps = Alive(c, "player");
                        if (ps.Count > 0)
                        {
                            Combatant best = ps[0]; int bn = 0;
                            foreach (var p in ps) { int n = ps.Count(q => Dist(q, p) <= 2); if (n > bn) { bn = n; best = p; } }
                            Shock(c, best.X, best.Y, 2.0, "#f59e0b"); Burst(c, best.X, best.Y, "#fbbf24", 30);
                            Text(c, best.X, best.Y - 0.8, "⚒️ MARTELADA!", "#fbbf24", 1.3); Sfx(c, "bossGong");
                            foreach (var p in ps)
                                if (Dist(p, best) <= 2) { p.Stun = Math.Max(p.Stun, 1); ApplyRaw(c, p, JsMath.Round(p.Stats.MaxHp * 0.14), u, new Vis { T = "MARTELADA", Color = "#fbbf24" }); }
                        }
                    }
                    for (int k = 0; k < 2; k++)
                    {
                        bool done = k == 0 ? ss.S1 : ss.S2; double th = k == 0 ? 0.70 : 0.35;
                        if (!done && u.Hp < u.Stats.MaxHp * th)
                        {
                            if (k == 0) ss.S1 = true; else ss.S2 = true;
                            var els = c.Rng.Shuffle(AllElements).Take(2).ToList();
                            foreach (var el in els)
                            {
                                var E = d.Elements[el];
                                Summon(c, u, new SummonDef
                                {
                                    Name = $"Avatar de {E.Name}", Symbol = E.Icon, Color = E.Color, ArchetypeId = "berserker",
                                    Hp = JsMath.Round(u.Stats.MaxHp * 0.10), Ad = JsMath.Round(u.Stats.Ad * 0.40),
                                    Extra = X(("armor", 30), ("moveSpeed", 2.4), ("lifesteal", el == "lunar" ? 0.3 : 0))
                                });
                            }
                            Log(c, "⚒️ O Ferreiro forja Avatares Elementais!", "danger");
                        }
                    }
                    if (!ss.Final && u.Hp < u.Stats.MaxHp * 0.25)
                    {
                        ss.Final = true;
                        u.Stats.AttackSpeed *= 1.6; u.Shield += JsMath.Round(u.Stats.MaxHp * 0.15); u.Color = "#ef4444";
                        Shock(c, u.X, u.Y, 4, "#ef4444"); Text(c, u.X, u.Y - 0.8, "🔥 FORJA FINAL!", "#ef4444", 1.4); Sfx(c, "bossGong");
                        Log(c, "🔥 Forja Final! O Ferreiro acelera seus golpes.", "danger");
                    }
                    break;
                case "colosso":
                    if (!ss.Enraged && u.Hp < u.Stats.MaxHp * 0.5)
                    {
                        ss.Enraged = true;
                        u.Stats.Ad = JsMath.Round(u.Stats.Ad * 1.5); u.Stats.AttackSpeed *= 1.3;
                        u.Shield += JsMath.Round(u.Stats.MaxHp * 0.15); u.Color = "#ef4444";
                        Shock(c, u.X, u.Y, 3.0, "#ef4444"); Burst(c, u.X, u.Y, "#f97316", 30);
                        Text(c, u.X, u.Y - 0.8, "🔥 FÚRIA ÍGNEA!", "#f97316", 1.4);
                        Sfx(c, "bossGong"); Log(c, "🗿 O Colosso entrou em Fúria Ígnea!", "danger");
                    }
                    break;
                case "leviata":
                    ss.T += dt;
                    if (ss.T >= 9)
                    {
                        ss.T = 0;
                        for (int i = 0; i < 2; i++)
                            Summon(c, u, new SummonDef
                            {
                                Name = "Cria das Marés", Symbol = "🐟", Color = "#0ea5e9", ArchetypeId = "berserker",
                                Hp = JsMath.Round(u.Stats.MaxHp * 0.08), Ad = JsMath.Round(u.Stats.Ad * 0.35), Extra = X(("moveSpeed", 2.6), ("armor", 15))
                            });
                        Text(c, u.X, u.Y - 0.7, "🌊 Crias das Marés!", "#38bdf8", 1.2);
                    }
                    if (!ss.Wave && u.Hp < u.Stats.MaxHp * 0.5)
                    {
                        ss.Wave = true;
                        Shock(c, u.X, u.Y, 6, "#38bdf8"); Sfx(c, "bossGong");
                        Log(c, "🐉 O Leviatã invocou um Maremoto!", "danger");
                        foreach (var p in Alive(c, "player")) { p.Chill = 4; p.ChillFactor = 0.45; DealDamage(c, u, p, p.Stats.MaxHp * 0.06, "magic"); }
                    }
                    break;
                case "arconte":
                    ss.T += dt;
                    if (ss.T >= 10) { ss.T = 0; SetArcontePhase(c, u, ss.Phase == "solar" ? "lunar" : "solar"); }
                    if (!ss.Eclipse && u.Hp < u.Stats.MaxHp * 0.3)
                    {
                        ss.Eclipse = true;
                        Shock(c, u.X, u.Y, 8, "#9333ea"); Sfx(c, "bossGong");
                        Log(c, "👁️ ECLIPSE TOTAL! Todo o seu time sofre 20% da Vida.", "danger");
                        foreach (var p in Alive(c, "player")) ApplyRaw(c, p, JsMath.Round(p.Stats.MaxHp * 0.2), u, new Vis { T = "ECLIPSE", Color = "#c084fc", Scale = 1.1 });
                    }
                    break;
            }
        }

        static bool HasBossScript(string s) => s == "ferreiro" || s == "colosso" || s == "leviata" || s == "arconte";

        /* ---------------- Alvos ---------------- */
        static Combatant ChooseTarget(Combatant u, List<Combatant> opps)
        {
            Combatant best = null; double bd = double.PositiveInfinity;
            if (u.HuntUid != null) { var h = opps.FirstOrDefault(o => o.Uid == u.HuntUid); if (h != null) return h; }
            if (u.HuntId != null && !u.IsSummon) { var h = opps.FirstOrDefault(o => o.RosterId == u.HuntId); if (h != null) return h; }
            if (u.Tactic == "back" && !u.IsSummon)
            {
                foreach (var o in opps) { if (o.IsSummon || !Backline.Contains(o.ArchetypeId ?? "")) continue; double dd = Dist(o, u); if (dd < bd) { bd = dd; best = o; } }
                if (best != null) return best;
            }
            else if (u.Tactic == "low" && !u.IsSummon)
            {
                foreach (var o in opps) { if (Dist(o, u) > u.Stats.Range + 3) continue; if (o.Hp < bd) { bd = o.Hp; best = o; } }
                if (best != null) return best;
            }
            bd = double.PositiveInfinity;
            if (u.ArchetypeId == "sombra" && !u.IsSummon)
            {
                foreach (var o in opps) { if (o.Hp < bd) { bd = o.Hp; best = o; } }
                return best;
            }
            if (u.ArchetypeId == "cacador" && !u.IsSummon)
            {
                Combatant lowest = null; double lr = double.PositiveInfinity;
                foreach (var o in opps)
                    if (Dist(o, u) <= u.Stats.Range) { double r = Ratio(o); if (r < lr) { lr = r; lowest = o; } }
                if (lowest != null) return lowest;
            }
            foreach (var o in opps) { double dd = Dist(o, u); if (dd < bd) { bd = dd; best = o; } }
            return best;
        }

        /* ---------------- Reforços e armadilhas ---------------- */
        static Point FreeSpot(CombatState c, int col, int row)
        {
            var C = c.D.Config;
            for (int rad = 0; rad < 10; rad++)
                for (int dy = -rad; dy <= rad; dy++)
                    for (int dx = -rad; dx <= rad; dx++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != rad) continue;
                        int cc = col + dx, rr = row + dy;
                        if (cc < 0 || rr < 0 || cc >= C.COLS || rr >= C.ROWS || Board.TileBlocked(c.D, c.Terrain, cc, rr)) continue;
                        if (c.Units.Any(u => !u.Dead && JsMath.Hypot(u.X - (cc + 0.5), u.Y - (rr + 0.5)) < 0.6 + u.Radius)) continue;
                        return new Point(cc + 0.5, rr + 0.5);
                    }
            return new Point(col + 0.5, row + 0.5);
        }

        static void BringIn(CombatState c, List<Combatant> list, Combatant near)
        {
            foreach (var u in list)
            {
                var p = near != null
                    ? FreeSpot(c, (int)Math.Floor(near.X + (c.Rng.Next() - 0.5) * 3), (int)Math.Floor(near.Y) + 1)
                    : FreeSpot(c, (int)u.StartCol, (int)Math.Min(1, u.StartRow % 2));
                u.X = p.X; u.Y = p.Y;
                c.Units.Add(u); EnterEnemy(c, u);
                Burst(c, u.X, u.Y, "#F2B33D", 8);
            }
        }

        static void UpdateWaves(CombatState c)
        {
            var foes = c.Units.Where(u => u.Team == "enemy" && !u.Dead && u.Structure == null).ToList();
            if (c.WaveNow < c.WaveMax)
            {
                var nxt = c.Reserve.TryGetValue(c.WaveNow + 1, out var l) ? l : new List<Combatant>();
                if (c.Time >= c.NextWaveT || foes.Count <= Math.Ceiling(c.WaveSize * 0.3))
                {
                    c.WaveNow++;
                    BringIn(c, nxt, null);
                    c.WaveSize = foes.Count + nxt.Count; c.LastWaveT = c.Time; c.NextWaveT = c.Time + 16;
                    Log(c, $"🌊 Onda {c.WaveNow} de {c.WaveMax}: {nxt.Count} inimigos entram pelo norte!", "danger");
                    c.Fx?.Wave(c.WaveNow, c.WaveMax, nxt.Count);
                    Sfx(c, "bossGong");
                }
            }
            if (c.Fort != null && !c.Fort.Dead && c.FortPool.Count > 0 && c.Time >= c.FortNext)
            {
                int n = c.FortPool.Count > 3 ? 2 : 1;
                var batch = c.FortPool.GetRange(0, n); c.FortPool.RemoveRange(0, n);
                BringIn(c, batch, c.Fort); c.FortNext = c.Time + 7; c.LastWaveT = c.Time;
                Text(c, c.Fort.X, c.Fort.Y - 0.9, "REFORÇOS!", "#D9483B", 1.1);
            }
        }

        static bool PendingWaves(CombatState c) => c.WaveNow < c.WaveMax;

        /* Alçapão: quem pisa primeiro cai, sobe machucado e o alçapão vira buraco */
        static void SpringTrap(CombatState c, Combatant u)
        {
            int col = (int)Math.Floor(u.X), row = (int)Math.Floor(u.Y), i = row * c.D.Config.COLS + col;
            c.Terrain[i] = 'O';
            c.TerrainVer++;
            Burst(c, u.X, u.Y, "#8A5A33", 14); Shock(c, u.X, u.Y, 0.9, "#8A5A33");
            ApplyRaw(c, u, JsMath.Round(u.Stats.MaxHp * 0.22), null, new Vis { T = "ALÇAPÃO!", Color = "#C98A12", Scale = 1.1 });
            if (u.Dead) return;
            u.Stun = Math.Max(u.Stun, 1.6); u.Wp = null;
            var p = FreeSpot(c, col, row); u.X = p.X; u.Y = p.Y;
            Sfx(c, "hit", true);
        }

        /* ---------------- Passo de simulação ---------------- */
        public static void Update(CombatState c, double dt)
        {
            if (c.Over) return;
            var C = c.D.Config;
            c.Time += dt;
            UpdateWaves(c);
            var players = c.Units.Where(u => u.Team == "player" && !u.Dead && !u.IsSummon && u.Structure == null).ToList();
            var enemies = Alive(c, "enemy");
            if (enemies.Count == 0 && PendingWaves(c)) { c.NextWaveT = 0; UpdateWaves(c); enemies = Alive(c, "enemy"); }
            bool cityLost = c.City != null && c.City.Dead, fortDown = c.Fort != null && c.Fort.Dead;
            if (players.Count == 0 || enemies.Count == 0 || cityLost || fortDown)
            {
                c.Over = true;
                bool won = players.Count > 0 && !cityLost;
                c.Result = new CombatResult { Won = won, CityLost = cityLost, FortDown = fortDown, Survivors = enemies.Count(e => !e.IsSummon && e.Structure == null), Time = c.Time, LeaderAt = c.LeaderDeathAt, Waves = c.WaveNow };
                if (fortDown && won) Log(c, "🏰 A fortaleza caiu! Os defensores fogem em pânico.", "win");
                if (cityLost) Log(c, "🏘️ A cidade foi saqueada...", "danger");
                return;
            }

            // Tempestade da Forja: evita impasses (começa 35s após a última onda)
            double storm = 0;
            double stormAt = Math.Max(55, c.LastWaveT + 35);
            if (c.Time > stormAt && !PendingWaves(c))
            {
                storm = (c.Time - stormAt) * 0.004;
                if (!c.OvertimeAnnounced) { c.OvertimeAnnounced = true; Log(c, "⛈️ Tempestade da Forja! Todos sofrem dano crescente.", "danger"); }
            }

            var allPlayers = Alive(c, "player");
            c.MaxPlayerSummons = Math.Max(c.MaxPlayerSummons, allPlayers.Count(u => u.IsSummon));
            var units = c.Units.ToList();
            foreach (var u in units)
            {
                if (u.Dead) continue;
                if (u.Structure != null && !(u.Stats.Ad > 0)) { if (storm > 0) ApplyRaw(c, u, u.Stats.MaxHp * storm * 1.5 * dt, null, null); continue; }
                if (!u.IsSummon && u.Stats.ManaRegen > 0) u.Mana = Math.Min(u.Stats.MaxMana, u.Mana + u.Stats.ManaRegen * dt);
                if (u.Stats.RegenPct > 0) u.Hp = Math.Min(u.Stats.MaxHp, u.Hp + u.Stats.MaxHp * u.Stats.RegenPct * dt);
                char tile = TileOf(c, u.X, u.Y);
                if (tile == 'L') { ApplyRaw(c, u, u.Stats.MaxHp * 0.03 * dt, null, null); if (u.Dead) continue; }
                if (storm > 0) { ApplyRaw(c, u, u.Stats.MaxHp * storm * (u.Structure != null ? 1.5 : 1) * dt, null, null); if (u.Dead) continue; }
                if (u.Burn > 0) { u.Burn -= dt; ApplyRaw(c, u, u.BurnDps * dt, u.BurnSrc, null); if (u.Dead) continue; }
                if (u.Bleed > 0) { u.Bleed -= dt; ApplyRaw(c, u, u.BleedDps * dt, u.BleedSrc, null); if (u.Dead) continue; }
                if (u.Chill > 0) { u.Chill -= dt; if (u.Chill <= 0) u.ChillFactor = 0; }
                if (u.Haste > 0) u.Haste -= dt;
                if (u.Script != null && HasBossScript(u.Script)) { BossScript(c, u, dt); if (u.Dead) continue; }
                if (u.Stats.AuraHeal > 0)
                {
                    u.AuraT += dt;
                    if (u.AuraT >= 1) { u.AuraT -= 1; foreach (var a in Alive(c, u.Team)) if (a.Hp < a.Stats.MaxHp && Dist(a, u) <= 2.5) Heal(c, u, a, u.Stats.AuraHeal); }
                }
                if (u.Stun > 0) { u.Stun -= dt; continue; }

                var opps = u.Team == "player" ? enemies.Where(e => !e.Dead).ToList() : allPlayers.Where(p => !p.Dead).ToList();
                var tgt = ChooseTarget(u, opps); u.Target = tgt;
                if (tgt == null) continue;
                double dist = Dist(tgt, u);

                double range = u.Stats.Range + (u.Stats.Range > 2.3 && tile == 'H' ? 1 : 0) + (u.Stats.Range > 2.3 && tile == 'U' ? 1.5 : 0);
                if (dist - tgt.Radius <= range)
                {
                    double mult = 1;
                    if (u.ArchetypeId == "berserker" && !u.IsSummon) mult += (1 - Ratio(u)) * 0.55;
                    if (u.Chill > 0) mult *= 1 - u.ChillFactor;
                    if (u.Haste > 0) mult *= u.HasteMult;
                    u.AttackCooldown -= dt * u.Stats.AttackSpeed * mult;
                    if (u.AttackCooldown <= 0)
                    {
                        u.AttackCooldown = 1.0;
                        if (!u.IsSummon && u.Structure == null && u.Mana >= u.Stats.MaxMana) { u.Mana = 0; CastSkill(c, u, tgt); }
                        else
                        {
                            u.AttackCounter++; u.AnimAtk = 1;
                            bool crit = c.Rng.Next() < u.Stats.CritChance;
                            double dmg = u.Stats.Ad * (crit ? u.Stats.CritDmg : 1);
                            if (!u.IsSummon) u.Mana = Math.Min(u.Stats.MaxMana, u.Mana + u.Stats.ManaPerAttack);
                            if (u.Stats.Range <= 2.3)
                            {
                                double dx = tgt.X - u.X, dy = tgt.Y - u.Y;
                                c.Fx?.Slash(tgt.X, tgt.Y, Math.Atan2(dy, dx), crit ? "#facc15" : u.Color, crit);
                                Sfx(c, "hit", crit); DealDamage(c, u, tgt, dmg, "physical", crit);
                            }
                            else
                            {
                                c.Projectiles.Add(new Projectile { X = u.X, Y = u.Y, Target = tgt, Attacker = u, Speed = 8, Dmg = dmg, Crit = crit, Color = u.Color });
                            }
                            if (u.Stats.ChainTargets > 0 && u.AttackCounter % 4 == 0)
                            {
                                var prev = tgt;
                                double cd = JsMath.Round(u.Stats.Ad * 0.55 + u.Stats.Ap * 0.45);
                                foreach (var o in opps.Where(o => !o.Dead && o != tgt).Take((int)u.Stats.ChainTargets - 1).ToList())
                                {
                                    Beam(c, prev.X, prev.Y, o.X, o.Y, "#34d399"); DealDamage(c, u, o, cd * (1 - o.Stats.ElemResist), "magic"); prev = o;
                                }
                            }
                        }
                    }
                }
                else if (u.Stats.MoveSpeed > 0)
                {
                    double wx = tgt.X, wy = tgt.Y;
                    if (!LineClear(c, u.X, u.Y, tgt.X, tgt.Y))
                    {
                        u.PathT -= dt;
                        if (u.PathT <= 0 || u.Wp == null || JsMath.Hypot(u.Wp.X - u.X, u.Wp.Y - u.Y) < 0.2)
                        {
                            u.PathT = 0.35;
                            u.Wp = NextStep(c, (int)Math.Floor(u.X), (int)Math.Floor(u.Y), (int)Math.Floor(tgt.X), (int)Math.Floor(tgt.Y));
                        }
                        if (u.Wp != null) { wx = u.Wp.X; wy = u.Wp.Y; }
                    }
                    else u.Wp = null;
                    double ddx = wx - u.X, ddy = wy - u.Y, dd = Math.Max(0.01, JsMath.Hypot(ddx, ddy));
                    double ms = u.Stats.MoveSpeed * (u.Chill > 0 ? 1 - u.ChillFactor * 0.5 : 1) * (tile == 'S' ? 0.55 : 1);
                    double vx = ddx / dd * ms, vy = ddy / dd * ms;
                    foreach (var o in c.Units)
                    {
                        if (o.Dead || o == u) continue;
                        double ox = u.X - o.X, oy = u.Y - o.Y, od = JsMath.Hypot(ox, oy);
                        double lim = 0.7 + o.Radius; if (od > 0.001 && od < lim) { double push = (lim - od) * 3.2; vx += ox / od * push; vy += oy / od * push; }
                    }
                    double nx = JsMath.Clamp(u.X + vx * dt, 0.4, C.COLS - 0.4), ny = JsMath.Clamp(u.Y + vy * dt, 0.4, C.ROWS - 0.4);
                    if (!BlockedAt(c, nx, ny)) { u.X = nx; u.Y = ny; }
                    else if (!BlockedAt(c, nx, u.Y)) u.X = nx;
                    else if (!BlockedAt(c, u.X, ny)) u.Y = ny;
                    if (TileOf(c, u.X, u.Y) == 'T') SpringTrap(c, u);
                }
            }

            // Projéteis (afetam a lógica)
            var P = c.Projectiles;
            for (int i = P.Count - 1; i >= 0; i--)
            {
                var p = P[i];
                if (p.Target == null || p.Target.Dead) { P.RemoveAt(i); continue; }
                double dx = p.Target.X - p.X, dy = p.Target.Y - p.Y, d = JsMath.Hypot(dx, dy);
                if (d <= 0.25) { Sfx(c, "hit", p.Crit); DealDamage(c, p.Attacker, p.Target, p.Dmg, "physical", p.Crit); Burst(c, p.X, p.Y, p.Color, 5); P.RemoveAt(i); }
                else { p.X += dx / d * p.Speed * dt; p.Y += dy / d * p.Speed * dt; }
            }
        }

        /// <summary>Decai os contadores visuais (equivale à parte de unidades de updateFx).</summary>
        public static void UpdateAnim(CombatState c, double dt)
        {
            foreach (var u in c.Units)
            {
                if (u.Flash > 0) u.Flash -= dt;
                if (u.AnimAtk > 0) u.AnimAtk = Math.Max(0, u.AnimAtk - dt * 3.4);
                if (u.AnimCast > 0) u.AnimCast = Math.Max(0, u.AnimCast - dt * 1.9);
            }
        }

        /// <summary>Relatório pós-combate por unidade do jogador (invocações creditadas ao dono).</summary>
        public static List<CombatReportRow> Report(CombatState c) =>
            c.Units.Where(u => u.Team == "player" && !u.IsSummon && u.Structure == null).Select(u => new CombatReportRow
            {
                RosterId = u.RosterId, Name = u.Name, Symbol = u.Symbol, Color = u.Color,
                DmgDealt = JsMath.Round(u.DmgDealt), DmgTaken = JsMath.Round(u.DmgTaken), HealDone = JsMath.Round(u.HealDone),
                Kills = u.Kills, Casts = u.Casts, Survived = !u.Dead
            }).ToList();
    }
}
