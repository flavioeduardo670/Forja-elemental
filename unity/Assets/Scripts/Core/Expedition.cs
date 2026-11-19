using System;
using System.Collections.Generic;
using System.Linq;

namespace ForjaElemental.Core
{
    /// <summary>
    /// Regras da expedição (port de js/game.js): jogadores (solo ou co-op 2–4),
    /// Quartel, roster, progressão, mapa, cenários, escala de poder, inteligência
    /// inimiga, objetivos, recompensas, eventos e a fila de escolhas.
    /// Não depende da Unity: a interface ouve os eventos On*.
    /// </summary>
    public sealed partial class Expedition
    {
        public readonly GameData D;
        public Meta Meta;
        public Run Run;
        public CombatState Combat;
        public bool Paused;
        public string SelectedId;
        public ICombatFx CombatFx;

        public event Action<string, string> OnLog, OnToast;
        public event Action<string> OnSfx;
        public event Action OnChanged, OnOpenEvo;
        /// <summary>Gancho para conquistas (G.emitAch). Recebe o tipo do evento.</summary>
        public event Action<string> OnAchievementEvent;

        public static readonly string[] PlayerColors = { "#38bdf8", "#f472b6", "#a3e635", "#fbbf24" };
        readonly Config C;
        readonly int P0;
        readonly int[] ColOrder, PlayerRows;

        public Expedition(GameData data, Meta meta = null)
        {
            D = data; C = data.Config; P0 = C.PlayerRow;
            Meta = meta ?? Meta.Default(data);
            int m = C.COLS / 2; var co = new List<int>();
            for (int i = 0; i < C.COLS; i++) { co.Add(m - 1 - i); co.Add(m + i); }
            ColOrder = co.Where(c => c >= 0 && c < C.COLS).ToArray();
            PlayerRows = Enumerable.Range(P0, C.ROWS - P0).ToArray();
        }

        void Log(string t, string type = "") => OnLog?.Invoke(t, type);
        void Toast(string t, string type = "info") => OnToast?.Invoke(t, type);
        void Sfx(string name) => OnSfx?.Invoke(name);
        void Changed() => OnChanged?.Invoke();
        void Ach(string type) => OnAchievementEvent?.Invoke(type);

        /* ---------------- RNG da run ---------------- */
        T WithRng<T>(Func<Rng, T> fn)
        {
            var r = Rng.FromState(Run.RngState);
            var o = fn(r); Run.RngState = r.State;
            return o;
        }
        void WithRng(Action<Rng> fn) => WithRng<int>(r => { fn(r); return 0; });

        /* ---------------- Meta ---------------- */
        public int MetaCost(string id) => D.MetaUpgrades[id].BaseCost + Meta.Upgrades.Get(id) * 25;
        public bool BuyMeta(string id)
        {
            var def = D.MetaUpgrades[id]; int lvl = Meta.Upgrades.Get(id), cost = MetaCost(id);
            if (lvl >= def.MaxLevel || Meta.AstralShards < cost) return false;
            Meta.AstralShards -= cost; Meta.Upgrades[id] = lvl + 1; Sfx("levelUp"); Changed();
            return true;
        }
        public bool Secret(string id)
        {
            bool first = Meta.Secrets.Get(id) == 0;
            Meta.Secrets[id] = Meta.Secrets.Get(id) + 1;
            Ach("secret");
            return first;
        }

        /* ---------------- Jogadores ---------------- */
        public int Coop() => Run != null ? Run.Players.Count : 1;
        public bool IsCoop() => Coop() > 1;
        public int CapPerPlayer() => IsCoop() ? C.CoopTotalUnits / Coop() : C.MaxTeam;
        public double GoldFactor() => IsCoop() ? 2.0 / Coop() : 1;
        public double XpShare() => IsCoop() ? CapPerPlayer() / C.CoopXpDiv : 1;
        public Player Me() => Run.Active >= 0 && Run.Active < Run.Players.Count ? Run.Players[Run.Active] : Run.Players[0];
        public Player P(int pid) => pid >= 0 && pid < Run.Players.Count ? Run.Players[pid] : null;
        public Player OwnerOf(UnitDef u) => P(u.Owner);
        public List<UnitDef> BoardOf(int pid) => Run.Board.Where(u => u.Owner == pid).ToList();
        public bool IsMine(UnitDef u) => u != null && u.Owner == Run.Active;
        public void SetActive(int pid)
        {
            if (Run == null || pid < 0 || pid >= Run.Players.Count || pid == Run.Active) return;
            Run.Active = pid; SelectedId = null; Sfx("click"); Changed();
        }
        void Unready(int pid) { var p = P(pid); if (p != null) p.Ready = false; }

        /* ---------------- Criação ---------------- */
        public void NewRun(string seed = null, int ascension = 0, int players = 1, IList<string> names = null, string daily = null, int? dailyAscension = null, string scaling = "dinamica")
        {
            string seedStr = !string.IsNullOrWhiteSpace(seed) ? seed.Trim().ToUpperInvariant() : RandomSeedString();
            uint seedNum = JsMath.HashStr(seedStr);
            int asc = daily != null ? (dailyAscension ?? 0) : Math.Max(0, Math.Min(ascension, Meta.MaxAscension));
            int n = Math.Max(1, Math.Min(4, players));
            var up = Meta.Upgrades;
            int citadelMax = C.StartCitadel + up.Get("citadelMax") * 10 - (asc >= 4 ? 20 : 0) + (n > 1 ? 20 : 0);
            bool firstRun = Meta.Records.Runs == 0 && !Meta.SeenTutorial;
            Combat = null; Paused = false;
            int cap = n > 1 ? C.CoopTotalUnits / n : C.MaxTeam;
            double gf = n > 1 ? 2.0 / n : 1;
            Run = new Run
            {
                Seed = seedStr, RngState = seedNum, Ascension = asc, Daily = daily, CitadelHp = citadelMax, CitadelMax = citadelMax,
                Terrain = new string('.', C.COLS * C.ROWS), Scaling = D.Scaling.Modes.ContainsKey(scaling) ? scaling : "dinamica"
            };
            Run.Flags.Galinha = seedStr == "GALINHA";
            for (int i = 0; i < n; i++)
            {
                string nm = names != null && i < names.Count && !string.IsNullOrWhiteSpace(names[i]) ? names[i].Trim() : null;
                if (nm != null && nm.Length > 14) nm = nm.Substring(0, 14);
                Run.Players.Add(new Player
                {
                    Id = i, Name = nm ?? (n > 1 ? $"Jogador {i + 1}" : "Comandante"), Color = PlayerColors[i],
                    Gold = (int)JsMath.Round((C.StartGold + up.Get("goldStart") * 15) * gf) - (asc >= 2 ? 30 : 0),
                    Bench = Enumerable.Repeat<UnitDef>(null, C.BENCH).ToList(), TeamLimit = n > 1 ? Math.Min(cap, 3) : C.StartTeamLimit
                });
            }
            foreach (var p in Run.Players) RefreshOffers(p.Id, true);
            Run.Map = WithRng(r => Generation.GenerateActMap(D, r, 1, asc));
            Meta.Records.Runs++; if (n > 1) Meta.Records.CoopRuns++;
            Log($"🌌 Nova Expedição {(n > 1 ? $"cooperativa ({n} jogadores, até {cap} unidades cada)" : "solo")} — seed {seedStr}{(asc != 0 ? $" • Ascensão {asc}" : "")}.", "gold");
            if (Run.Flags.Galinha) { Log("🐔 Có-có-có? Algo parece... diferente nesta expedição.", "level"); Secret("galinha"); }
            if (firstRun) { Run.Pending.Add(StoryTutorial()); Meta.SeenTutorial = true; }
            Run.Pending.Add(StoryAct(1));
            if (up.Get("relicStart") >= 1) Run.Pending.Add(MakeRelicChoice("start"));
            Run.AfterPending = "MAP"; Run.Phase = "CHOICE";
            Ach("state"); Changed();
        }

        static readonly Random SeedRandom = new Random();
        public static string RandomSeedString()
        {
            string[] syl = { "ka", "ru", "mi", "to", "ze", "lo", "vi", "na", "qu", "xe", "bo", "si", "fa", "dra", "gon", "lux" };
            var s = "";
            for (int i = 0; i < 3; i++) s += syl[SeedRandom.Next(syl.Length)];
            return s.ToUpperInvariant() + "-" + SeedRandom.Next(100, 1000);
        }

        /* ---------------- Consultas ---------------- */
        public Archetype Arch(UnitDef u) => D.Archetypes[u.ArchetypeId];
        public List<UnitDef> AllUnits() => Run.Board.Concat(Run.Players.SelectMany(p => p.Bench.Where(b => b != null))).ToList();
        public List<UnitDef> UnitsOf(int pid) => BoardOf(pid).Concat(P(pid).Bench.Where(b => b != null)).ToList();
        public UnitDef Find(string id) => AllUnits().FirstOrDefault(u => u.Id == id);
        public bool OnBoard(string id) => Run.Board.Any(u => u.Id == id);
        public bool CanEdit() => Run != null && (Run.Phase == "PREP" || Run.Phase == "MAP");
        public bool HasRelic(string id) => Run.Relics.Contains(id);
        public int XpToNext(int lvl) => (int)Math.Floor(C.XpBase * Math.Pow(C.XpGrowth, lvl - 1));
        public int RecruitCost(string archId) => (int)JsMath.Round(D.Archetypes[archId].Cost * (1 - 0.05 * Meta.Upgrades.Get("contatos")));
        public int TotalGold() => Run.Players.Sum(p => p.Gold);

        public OrderedDict<double> SynergyCounts()
        {
            var counts = new OrderedDict<double>();
            foreach (var k in D.Elements.Keys) counts[k] = 0;
            foreach (var u in Run.Board) foreach (var kv in u.Elements) if (counts.ContainsKey(kv.Key)) counts[kv.Key] += kv.Value;
            if (HasRelic("cristal_sinergia")) foreach (var k in counts.Keys.ToList()) if (counts[k] > 0) counts[k] += 1;
            return counts;
        }
        public OrderedDict<double> OrderCounts()
        {
            var counts = new OrderedDict<double>();
            foreach (var k in D.Orders.Keys) counts[k] = 0;
            foreach (var u in Run.Board) foreach (var o in Arch(u).Orders) counts[o] += 1;
            return counts;
        }
        /// <summary>statsCtx(pid, neutral). pid nulo = média do ouro.</summary>
        public StatsContext StatsCtx(int? pid, bool neutral = false) => new StatsContext
        {
            IsEnemy = false, BoardCount = Run.Board.Count, Relics = new HashSet<string>(Run.Relics), Affix = Run.Affix,
            Gold = pid == null ? JsMath.Round(TotalGold() / (double)Coop()) : P(pid.Value).Gold,
            Synergy = SynergyCounts(), Orders = OrderCounts(), Tactic = neutral ? null : Run.Tactic
        };
        public StatBlock StatsOf(UnitDef u, StatsContext ctx = null) => StatsCalc.Compute(D, u, ctx ?? StatsCtx(u.Owner));
        public StatBlock EnemyStats(UnitDef e, bool noDef = false) => StatsCalc.Compute(D, e, new StatsContext
        {
            IsEnemy = true, Affix = Run.Affix, Ascension = Run.Ascension, Act = Run.Act, NoDef = noDef,
            DefK = Run.Scaling == "classica" || Run.Scaling == "nivelada" ? D.EnemyDefense.FixedK : 1
        });

        /* XP de uma sala; no co-op cada jogador recebe sua parte */
        public int XpPool()
        {
            double b = 120 + Math.Max(1, Run.Room) * 34;
            if (Run.RoomType == "elite") b *= 1.45;
            if (Run.RoomType == "chefe") b *= 1.75;
            b *= 1 + Meta.Upgrades.Get("xpBonus") * 0.08;
            if (HasRelic("tomo_evolucao")) b *= 1.25;
            return (int)JsMath.Round(b);
        }
        public int PlayerXpPool() => (int)JsMath.Round(XpPool() * XpShare());

        /* ---------------- Roster ---------------- */
        public bool Blocked(int col, int row) => Board.TileBlocked(D, Run.Terrain.ToCharArray(), col, row);
        public bool NoPlace(double col, double row)
        {
            char t = Board.TerrainAt(D, Run.Terrain.ToCharArray(), (int)col, (int)row);
            if (col != Math.Floor(col) || row != Math.Floor(row)) t = '.';
            return D.Terrain.TryGetValue(t.ToString(), out var tt) && (tt.Blocked || tt.NoPlace);
        }
        public int FieldLimit(Player p) => Math.Max(1, p.TeamLimit - (Run != null ? Run.CapPenalty : 0));

        Cell? FreeBoardTile()
        {
            var rows = new[] { P0 + 1, P0 + 2, P0 }.Concat(PlayerRows.Skip(3));
            foreach (int r in rows) foreach (int c in ColOrder)
                    if (!NoPlace(c, r) && !Run.Board.Any(u => u.Col == c && u.Row == r)) return new Cell(c, r);
            return null;
        }

        void RelocateBlocked()
        {
            var taken = new HashSet<string>(Run.Board.Where(u => !NoPlace(u.Col, u.Row)).Select(u => u.Col + "," + u.Row));
            foreach (var u in Run.Board)
            {
                if (!NoPlace(u.Col, u.Row)) continue;
                Cell? best = null; double bd = double.PositiveInfinity;
                for (int r = P0; r < C.ROWS; r++)
                    for (int c = 0; c < C.COLS; c++)
                    {
                        if (NoPlace(c, r) || taken.Contains(c + "," + r)) continue;
                        double d = JsMath.Hypot(c - u.Col, r - u.Row); if (d < bd) { bd = d; best = new Cell(c, r); }
                    }
                if (best != null) { u.Col = best.Value.Col; u.Row = best.Value.Row; taken.Add(best.Value.Col + "," + best.Value.Row); }
            }
        }

        static int FreeBench(Player p) => p.Bench.FindIndex(s => s == null);

        bool GuardOwner(UnitDef u)
        {
            if (u == null) return false;
            if (!IsMine(u)) { Toast($"Essa unidade é de {OwnerOf(u).Name}. Troque de jogador para mexer nela.", "error"); return false; }
            return true;
        }

        /* ---------------- Quartel ---------------- */
        public int ContractCost(string archId) => (int)JsMath.Round(RecruitCost(archId) * D.Quartel.ContractMult);
        public int RerollCost(int? pid = null) => D.Quartel.RerollBase + D.Quartel.RerollStep * P(pid ?? Run.Active).Rerolls;

        Offer RollOffer(Rng rng, int pid, string want)
        {
            var QT = D.Quartel;
            int act = Math.Max(1, Run.Act);
            var odds = QT.Odds[Math.Min(3, act - 1)];
            double x = rng.Next(); int qi = 0;
            while (qi < odds.Length - 1 && x > odds[qi]) { x -= odds[qi]; qi++; }
            if (Run.Room <= 1 && qi > 1) qi = 1;
            var q = QT.Quality[qi];
            var archs = D.Archetypes.Values.ToList();
            var pool = archs;
            if (want == "front") pool = archs.Where(a => a.Pref == "front" || a.Pref == "mid").ToList();
            else if (want == "back") pool = archs.Where(a => a.Pref == "back").ToList();
            else if (rng.Chance(QT.SynergyBias))
            {
                var mineOrders = new HashSet<string>(UnitsOf(pid).SelectMany(u => D.Archetypes[u.ArchetypeId].Orders));
                var fit = archs.Where(a => a.Orders.Any(o => mineOrders.Contains(o))).ToList();
                if (fit.Count > 0) pool = fit;
            }
            var arch = rng.Pick(pool);
            string trait = null, el = null;
            if (rng.Chance(q.TraitChance))
            {
                var all = D.Traits.Values.ToList();
                var ts = new List<Trait>();
                foreach (var t in all) if (q.RareTrait ? t.Rare : (t.Rare ? rng.Chance(0.25) : true)) ts.Add(t);
                trait = rng.Pick(ts.Count > 0 ? ts : all).Id;
                if (trait == "afinidade") el = rng.Pick(D.Elements.Keys.ToList());
            }
            double tm = trait != null && D.Traits[trait].CostMult != 0 ? D.Traits[trait].CostMult : 1;
            return new Offer { Arch = arch.Id, Quality = qi, Trait = trait, El = el, Cost = Math.Max(10, (int)JsMath.Round(RecruitCost(arch.Id) * q.CostMult * tm)) };
        }

        public void RefreshOffers(int pid, bool newRoom)
        {
            var p = P(pid);
            if (newRoom) p.Rerolls = 0;
            WithRng(rng =>
            {
                var keep = p.Offers.Where(o => o != null && o.Locked).ToList();
                var fresh = new List<Offer>();
                int slots = D.Quartel.Slots - keep.Count;
                for (int i = 0; i < slots; i++) fresh.Add(RollOffer(rng, pid, i == 0 ? "front" : i == 1 ? "back" : null));
                p.Offers = keep.Concat(rng.Shuffle(fresh)).Take(D.Quartel.Slots).ToList();
            });
        }

        public void Reroll()
        {
            var p = Me();
            if (!CanEdit()) { Toast("Aguarde o fim do combate.", "error"); return; }
            int cost = RerollCost(p.Id);
            if (p.Gold < cost) { Toast($"Rolar o Quartel custa {cost}g.", "error"); return; }
            p.Gold -= cost; p.Rerolls++;
            RefreshOffers(p.Id, false);
            Sfx("click"); Changed();
        }

        public void ToggleLock(int i)
        {
            var o = i < Me().Offers.Count ? Me().Offers[i] : null; if (o == null) return;
            o.Locked = !o.Locked; Sfx("click"); Changed();
        }

        (UnitDef u, Cell? tile)? AddUnit(Player p, string archId, int cost, int level = 1, string trait = null, string el = null, int quality = 0)
        {
            var arch = D.Archetypes[archId];
            Cell? tile = BoardOf(p.Id).Count < p.TeamLimit ? FreeBoardTile() : null;
            int slot = FreeBench(p);
            if (tile == null && slot == -1) { Toast("Campo e Banco cheios. Aumente o limite ou venda uma unidade.", "error"); return null; }
            if (p.Gold < cost) { Toast($"Ouro insuficiente: custa {cost}g.", "error"); return null; }
            p.Gold -= cost; p.Recruited++;
            int id = Run.NextUnitId++;
            int lvl = level > 0 ? level : 1;
            var t = trait != null ? D.Traits[trait] : null;
            var u = new UnitDef
            {
                Id = id.ToString(), Owner = p.Id, ArchetypeId = archId, Name = $"{arch.Name} #{id}", Cost = cost, Level = lvl, Xp = 0,
                EvoPoints = (p.Recruited <= Meta.Upgrades.Get("mentor") ? 1 : 0) + (lvl - 1) + (t != null ? (int)t.Pe : 0),
                Col = tile?.Col ?? -1, Row = tile?.Row ?? -1, Trait = trait, Quality = quality
            };
            if (el != null) u.Elements[el] = 1;
            u.Skills[arch.SignatureSkill] = 1;
            if (tile != null) Run.Board.Add(u); else p.Bench[slot] = u;
            if (!Meta.Lifetime.Recruited.Contains(archId)) Meta.Lifetime.Recruited.Add(archId);
            Unready(p.Id); SelectedId = u.Id; Sfx("buy");
            Ach("hire");
            return (u, tile);
        }

        public void Hire(int i)
        {
            var p = Me();
            if (!CanEdit()) { Toast("Aguarde o fim do combate.", "error"); return; }
            var o = i < p.Offers.Count ? p.Offers[i] : null; if (o == null) return;
            var q = D.Quartel.Quality[o.Quality];
            var res = AddUnit(p, o.Arch, o.Cost, q.Level, o.Trait, o.El, o.Quality);
            if (res == null) return;
            p.Offers[i] = null;
            Log($"{(IsCoop() ? p.Name + " contratou" : "Contratou")} {q.Name} {res.Value.u.Name}{(o.Trait != null ? $" ({D.Traits[o.Trait].Icon} {D.Traits[o.Trait].Name})" : "")} {(res.Value.tile != null ? "no campo" : "no banco")} ({o.Cost}g).", "gold");
            Changed();
        }

        /* Contrato direto: qualquer arquétipo, sem traço */
        public void Buy(string archId)
        {
            var p = Me();
            if (!CanEdit()) { Toast("Aguarde o fim do combate.", "error"); return; }
            int cost = ContractCost(archId);
            var res = AddUnit(p, archId, cost);
            if (res == null) return;
            Log($"📜 {(IsCoop() ? p.Name + " firmou" : "Firmou")} contrato com {res.Value.u.Name} {(res.Value.tile != null ? "no campo" : "no banco")} ({cost}g).", "gold");
            Changed();
        }

        public void SetTactic(string t)
        {
            if (!CanEdit() || !D.Tactics.ContainsKey(t)) return;
            Run.Tactic = t; Sfx("click");
            Log($"{D.Tactics[t].Icon} Tática: {D.Tactics[t].Name}.");
            Changed();
        }

        public void Sell(string id)
        {
            if (!CanEdit()) return;
            var u0 = Find(id); if (!GuardOwner(u0)) return;
            var p = OwnerOf(u0);
            UnitDef u = null;
            int bi = Run.Board.FindIndex(x => x.Id == id);
            if (bi != -1) { u = Run.Board[bi]; Run.Board.RemoveAt(bi); }
            else { int si = p.Bench.FindIndex(x => x != null && x.Id == id); if (si != -1) { u = p.Bench[si]; p.Bench[si] = null; } }
            if (u == null) return;
            p.Bag.AddRange(u.Items); u.Items = new List<ItemRef>();
            int refund = (int)Math.Floor(u.Cost * C.SellRatio);
            p.Gold += refund;
            if (SelectedId == id) SelectedId = null;
            Log($"Vendeu {u.Name} por +{refund}g (itens voltaram à mochila).", "gold");
            Unready(p.Id); Sfx("buy"); Changed();
        }

        public void SetTeamLimit(int n)
        {
            if (!CanEdit()) return;
            var p = Me(); int lim = Math.Max(1, Math.Min(CapPerPlayer(), n));
            var mine = BoardOf(p.Id);
            if (mine.Count > lim)
            {
                int excess = mine.Count - lim;
                if (p.Bench.Count(s => s == null) < excess) { Toast($"Banco cheio: libere {excess} espaço(s) antes de reduzir o limite.", "error"); return; }
                var sorted = mine.OrderByDescending(a => a.Row * 20 + a.Col).Take(excess).ToList();
                foreach (var u in sorted) { Run.Board.Remove(u); u.Col = u.Row = -1; p.Bench[FreeBench(p)] = u; }
                Toast($"{excess} unidade(s) movida(s) para o banco.");
            }
            p.TeamLimit = lim; Unready(p.Id); Sfx("place"); Changed();
        }

        public bool PlaceAt(string id, int col, int row)
        {
            if (!CanEdit()) return false;
            if (row < P0 || row >= C.ROWS || col < 0 || col >= C.COLS) return false;
            if (NoPlace(col, row)) { Toast($"{D.Terrain[Board.TerrainAt(D, Run.Terrain.ToCharArray(), col, row).ToString()].Name}: não é possível posicionar aqui.", "error"); return false; }
            var u = Find(id); if (!GuardOwner(u)) return false;
            var p = OwnerOf(u);
            var occ = Run.Board.FirstOrDefault(x => x.Col == col && x.Row == row && x.Id != id);
            if (OnBoard(id))
            {
                if (occ != null) { occ.Col = u.Col; occ.Row = u.Row; }
                u.Col = col; u.Row = row;
            }
            else
            {
                int si = p.Bench.FindIndex(x => x != null && x.Id == id);
                if (occ != null && occ.Owner == p.Id) { Run.Board.Remove(occ); occ.Col = occ.Row = -1; p.Bench[si] = occ; }
                else
                {
                    if (occ != null) { Toast($"Essa casa está ocupada por uma unidade de {OwnerOf(occ).Name}.", "error"); return false; }
                    if (BoardOf(p.Id).Count >= FieldLimit(p)) { Toast($"Limite em campo atingido ({BoardOf(p.Id).Count}/{FieldLimit(p)}).", "error"); return false; }
                    p.Bench[si] = null;
                }
                u.Col = col; u.Row = row; Run.Board.Add(u);
            }
            Unready(p.Id); Sfx("place"); Changed();
            return true;
        }

        public bool ToBench(string id, int slot = -1)
        {
            if (!CanEdit()) return false;
            var u = Find(id); if (!GuardOwner(u)) return false;
            var p = OwnerOf(u);
            int bi = Run.Board.FindIndex(x => x.Id == id);
            if (bi == -1)
            {
                int si = p.Bench.FindIndex(x => x != null && x.Id == id);
                if (si == -1 || slot < 0 || slot == si) return false;
                (p.Bench[si], p.Bench[slot]) = (p.Bench[slot], p.Bench[si]);
                Sfx("place"); Changed(); return true;
            }
            int target = slot >= 0 ? slot : FreeBench(p);
            if (target == -1) { Toast("O Banco está cheio.", "error"); return false; }
            var occ = p.Bench[target];
            Run.Board.RemoveAt(bi);
            if (occ != null) { occ.Col = u.Col; occ.Row = u.Row; Run.Board.Add(occ); }
            u.Col = u.Row = -1; p.Bench[target] = u;
            Unready(p.Id); Sfx("place"); Changed(); return true;
        }

        public bool Toggle(string id)
        {
            if (OnBoard(id)) return ToBench(id);
            var t = FreeBoardTile();
            if (t == null) return false;
            return PlaceAt(id, t.Value.Col, t.Value.Row);
        }

        /* Posicionamento automático por papel (só as unidades do jogador ativo) */
        public void AutoArrange()
        {
            if (!CanEdit()) return;
            var mine = BoardOf(Run.Active);
            if (mine.Count == 0) return;
            var rowsByPref = new Dictionary<string, int[]>
            {
                ["front"] = new[] { P0, P0 + 1 }, ["flank"] = new[] { P0, P0 + 1 }, ["mid"] = new[] { P0 + 1, P0 + 2, P0 }, ["back"] = new[] { P0 + 4, P0 + 3, P0 + 5, P0 + 2 }
            };
            var order = new List<string> { "front", "flank", "mid", "back" };
            var taken = new HashSet<string>(Run.Board.Where(u => !IsMine(u)).Select(u => u.Col + "," + u.Row));
            var units = mine.OrderBy(a => order.IndexOf(Arch(a).Pref)).ToList();
            foreach (var u in units)
            {
                string pref = Arch(u).Pref;
                var colOrder = pref == "flank" ? ColOrder.Reverse().ToArray() : ColOrder;
                bool placed = false;
                foreach (int row in rowsByPref[pref].Concat(PlayerRows))
                {
                    foreach (int col in colOrder)
                    {
                        string k = col + "," + row;
                        if (!taken.Contains(k) && !NoPlace(col, row)) { taken.Add(k); u.Col = col; u.Row = row; placed = true; break; }
                    }
                    if (placed) break;
                }
            }
            Unready(Run.Active); Sfx("place"); Changed();
        }

        public void Rename(string id, string name)
        {
            var u = Find(id); if (!GuardOwner(u)) return;
            string clean = (name ?? "").Replace("<", "").Replace(">", "").Trim();
            if (clean.Length > 18) clean = clean.Substring(0, 18);
            if (clean.Length == 0) return;
            u.Name = clean; u.Renamed = true;
            Log($"✏️ Unidade rebatizada: {clean}.");
            if (string.Equals(clean, "bigorna", StringComparison.OrdinalIgnoreCase)) Secret("nome_bigorna");
            Ach("rename"); Changed();
        }

        /* ---------------- Itens ---------------- */
        public List<ItemRef> Bag() => Me().Bag;

        public void Equip(int bagIdx, string unitId)
        {
            if (!CanEdit()) { Toast("Equipe itens fora do combate.", "error"); return; }
            var u = Find(unitId);
            if (u == null) { Toast("Selecione uma unidade sua para equipar.", "error"); return; }
            if (!GuardOwner(u)) return;
            if (u.Items.Count >= C.MaxItems) { Toast($"{u.Name} já tem {C.MaxItems} itens. Clique num slot para remover.", "error"); return; }
            var bag = OwnerOf(u).Bag;
            if (bagIdx < 0 || bagIdx >= bag.Count) return;
            var it = bag[bagIdx]; bag.RemoveAt(bagIdx);
            u.Items.Add(it);
            Unready(u.Owner); Sfx("place"); Toast($"{D.Items[it.Id].Name} ★{it.Tier} equipado em {u.Name}.", "success"); Changed();
        }

        public void Unequip(string unitId, int slot)
        {
            if (!CanEdit()) return;
            var u = Find(unitId); if (!GuardOwner(u) || slot < 0 || slot >= u.Items.Count) return;
            var it = u.Items[slot]; u.Items.RemoveAt(slot);
            OwnerOf(u).Bag.Add(it);
            Unready(u.Owner); Sfx("place"); Changed();
        }

        public int FusePartner(int idx)
        {
            var bag = Bag(); if (idx < 0 || idx >= bag.Count) return -1;
            var a = bag[idx]; if (a.Tier >= C.MaxItemTier) return -1;
            for (int j = 0; j < bag.Count; j++) if (j != idx && bag[j].Id == a.Id && bag[j].Tier == a.Tier) return j;
            return -1;
        }

        public void Fuse(int idx)
        {
            if (!CanEdit()) return;
            var p = Me();
            int j = FusePartner(idx); if (j == -1) { Toast("Precisa de 2 itens iguais do mesmo tier.", "error"); return; }
            var a = p.Bag[idx];
            p.Bag = p.Bag.Where((_, k) => k != idx && k != j).ToList();
            p.Bag.Add(new ItemRef { Id = a.Id, Tier = a.Tier + 1 });
            Sfx("levelUp"); Log($"⚒️ Fundiu 2× {D.Items[a.Id].Name} → ★{a.Tier + 1}!", "gold"); Changed();
        }

        public void GiveItem(int bagIdx, int toPid)
        {
            if (!CanEdit() || !IsCoop()) return;
            var from = Me(); var to = P(toPid);
            if (to == null || to == from || bagIdx < 0 || bagIdx >= from.Bag.Count) return;
            var it = from.Bag[bagIdx]; from.Bag.RemoveAt(bagIdx);
            to.Bag.Add(it);
            Log($"🎁 {from.Name} deu {D.Items[it.Id].Name} ★{it.Tier} para {to.Name}.", "gold");
            Ach("gift"); Sfx("buy"); Changed();
        }

        public void GiveGold(int toPid, int amount)
        {
            if (!CanEdit() || !IsCoop()) return;
            var from = Me(); var to = P(toPid);
            int a = Math.Min(from.Gold, amount);
            if (to == null || to == from || a <= 0) return;
            from.Gold -= a; to.Gold += a;
            Log($"🪙 {from.Name} enviou {a}g para {to.Name}.", "gold");
            Ach("gift"); Sfx("buy"); Changed();
        }

        /* ---------------- Progressão ---------------- */
        public int GrantXp(UnitDef u, double amount)
        {
            double mult = 1;
            if (HasRelic("coroa_lobo") && Run.Board.Count <= 3) mult += 0.35;
            if (u.Trait != null && D.Traits.TryGetValue(u.Trait, out var tr) && tr.Xp != 0) mult += tr.Xp;
            foreach (var it in u.Items) { double xm = D.Items[it.Id].Stats.Get("xpMult"); if (xm != 0) mult += xm * C.ItemTierMult[it.Tier - 1]; }
            u.Xp += (int)JsMath.Round(amount * mult);
            int gained = 0;
            while (u.Xp >= XpToNext(u.Level)) { u.Xp -= XpToNext(u.Level); u.Level++; u.EvoPoints++; gained++; }
            if (gained > 0) { Log($"⭐ {u.Name} chegou ao Nível {u.Level} (+{gained} PE).", "level"); Sfx("levelUp"); }
            return gained;
        }

        public void UpgradeSkill(string id, string sk)
        {
            var u = Find(id); if (u == null || u.EvoPoints <= 0 || !GuardOwner(u)) return;
            int cur = u.Skills.Get(sk); if (cur >= 3) return;
            u.Skills[sk] = cur + 1; u.EvoPoints--;
            Log($"✨ {u.Name}: {D.Skills[sk].Name} → Nv.{cur + 1}.", "level"); Sfx("levelUp"); Unready(u.Owner); Changed();
        }

        public void AddElement(string id, string el)
        {
            var u = Find(id); if (u == null || u.EvoPoints <= 0 || !GuardOwner(u)) return;
            u.Elements[el] = u.Elements.Get(el) + 1; u.EvoPoints--;
            Log($"💠 {u.Name} absorveu {D.Elements[el].Name} (×{u.Elements[el]}).", "level"); Sfx("levelUp"); Unready(u.Owner); Changed();
        }

        public int TotalEvo(int? pid = null) => (pid == null ? AllUnits() : UnitsOf(pid.Value)).Sum(u => u.EvoPoints);

        /* ---------------- Mapa ---------------- */
        public MapNode FindNode(string id) { foreach (var f in Run.Map.Floors) foreach (var n in f) if (n.Id == id) return n; return null; }
        public List<MapNode> AvailableNodes()
        {
            if (Run.NodeId == null) return Run.Map.Floors[0];
            var cur = FindNode(Run.NodeId);
            return cur != null ? cur.Next.Select(FindNode).Where(n => n != null).ToList() : new List<MapNode>();
        }
        public Player Leader() => P(Run.Turn % Coop());
        int NextChooser() { int pid = Run.Turn % Coop(); Run.Turn++; return pid; }

        void EnforceFieldLimit()
        {
            foreach (var p in Run.Players)
            {
                var mine = BoardOf(p.Id); int lim = FieldLimit(p);
                if (mine.Count <= lim) continue;
                var extra = mine.OrderByDescending(a => a.Row * 20 + a.Col).Take(mine.Count - lim).ToList();
                int moved = 0;
                foreach (var u in extra) { int fb = FreeBench(p); if (fb == -1) break; Run.Board.Remove(u); u.Col = u.Row = -1; p.Bench[fb] = u; moved++; }
                if (moved > 0) Log($"{D.Conditions[Run.Cond].Icon} {D.Conditions[Run.Cond].Name}: {moved} unidade(s) de {p.Name} voltaram para o banco (limite {lim}).", "danger");
            }
        }

        /* Ondas, saqueadores, reforços da fortaleza e estruturas da missão */
        void AssignScenario(Rng rng)
        {
            int N = C.COLS, H = C.ROWS; string m = Run.Mission;
            Run.Structures = new List<StructureSpec>();
            var foes = Run.Enemies.Where(e => !e.IsBoss && !e.IsElite).OrderByDescending(e => e.Row).ToList();
            void Split(double[] fr)
            {
                int i = 0;
                for (int w = 0; w < fr.Length; w++)
                {
                    int n = w == fr.Length - 1 ? foes.Count - i : (int)JsMath.Round(foes.Count * fr[w]);
                    for (int k = 0; k < n && i < foes.Count; k++) foes[i++].Wave = w + 1;
                }
            }
            if (m == "ondas") Split(rng.Chance(0.5) || Run.RoomType == "chefe" ? new[] { 0.5, 0.5 } : new[] { 0.4, 0.3, 0.3 });
            if (m == "defesa")
            {
                Split(new[] { 0.4, 0.3, 0.3 });
                var fast = new HashSet<string> { "sombra", "berserker", "cacador", "lanceiro", "monge" };
                foreach (var e in foes) if (fast.Contains(e.ArchetypeId) ? rng.Chance(0.55) : rng.Chance(0.2)) e.Raider = true;
                Run.Structures.Add(new StructureSpec { Structure = "cidade", Team = "player", X = N / 2.0, Y = H - 0.5, Radius = 1.25, Name = "Cidade de Pedravale" });
            }
            if (m == "invasao")
            {
                foreach (var e in Enumerable.Reverse(foes).Take((int)JsMath.Round(foes.Count * 0.3))) e.FortSpawn = true;
                Run.Structures.Add(new StructureSpec { Structure = "forte", Team = "enemy", X = N / 2.0, Y = 0.55, Radius = 1.3, Name = "Fortaleza Inimiga" });
                Run.Structures.Add(new StructureSpec { Structure = "torre", Team = "enemy", X = 2.5, Y = 1.5, Radius = 0.4, Name = "Torre de Arqueiros" });
                Run.Structures.Add(new StructureSpec { Structure = "torre", Team = "enemy", X = N - 2.5, Y = 1.5, Radius = 0.4, Name = "Torre de Arqueiros" });
            }
        }

        /* Atributos das estruturas a partir da horda já escalada */
        List<CombatSide> StructureUnits()
        {
            if (Run.Structures == null || Run.Structures.Count == 0) return new List<CombatSide>();
            var st = Run.Enemies.Select(e => EnemyStats(e)).ToList();
            double sumHp = st.Sum(s => s.MaxHp), avgAd = st.Sum(s => s.Ad) / Math.Max(1, st.Count);
            int act = Run.Act;
            var outL = new List<CombatSide>();
            for (int i = 0; i < Run.Structures.Count; i++)
            {
                var s = Run.Structures[i];
                StatBlock stats;
                if (s.Structure == "cidade") stats = CombatEngine.StructureStats(JsMath.Round(sumHp * 0.2), 0, 40 + act * 8);
                else if (s.Structure == "forte")
                {
                    var ex = new OrderedDict<double>(); ex["magicReduce"] = 0.1;
                    stats = CombatEngine.StructureStats(JsMath.Round(sumHp * 0.28), 0, 30 + act * 8, extra: ex);
                }
                else stats = CombatEngine.StructureStats(JsMath.Round(sumHp * 0.07), JsMath.Round(avgAd * 1.15), 30 + act * 6, 0.8, 4.8, 0.1);
                outL.Add(new CombatSide
                {
                    Team = s.Team, Stats = stats,
                    Unit = new UnitDef
                    {
                        Id = $"st{i}", Name = s.Name, ArchetypeId = s.Structure == "torre" ? "cacador" : "vanguarda", Structure = s.Structure, Radius = s.Radius,
                        Col = s.X - 0.5, Row = s.Y - 0.5, Level = Math.Max(1, Run.Room / 2), Color = s.Team == "player" ? "#C98A12" : "#D9483B",
                        Symbol = s.Structure == "cidade" ? "🏘️" : s.Structure == "forte" ? "🏰" : "🗼"
                    }
                });
            }
            return outL;
        }

        public void ChooseNode(string id)
        {
            var r = Run;
            if (r.Phase != "MAP") return;
            var node = AvailableNodes().FirstOrDefault(n => n.Id == id);
            if (node == null) return;
            r.NodeId = id; r.Visited.Add(id); r.Room = node.Room; r.Act = node.Act;
            foreach (var p in r.Players) { p.Ready = false; RefreshOffers(p.Id, true); }
            var nt = D.NodeTypes[node.Type];
            Log($"🗺️ Sala {r.Room}/{C.TotalRooms}: {nt.Icon} {nt.Name}{(IsCoop() ? $" (caminho escolhido por {Leader().Name})" : "")}.");
            if (!r.RoomTypesSeen.Contains(node.Type)) r.RoomTypesSeen.Add(node.Type);
            if (node.Type == "combate" || node.Type == "elite" || node.Type == "chefe")
            {
                r.RoomType = node.Type; r.Affix = node.Affix; r.Attempt = 0;
                r.Layout = node.Layout ?? "planicie";
                r.Mission = node.Mission ?? "batalha"; r.Cond = node.Cond ?? "nenhuma";
                int capN = D.Conditions.TryGetValue(r.Cond, out var cd0) ? cd0.Cap : 0;
                r.CapPenalty = IsCoop() ? (int)Math.Floor(capN / (double)Coop() + 0.25) : capN;
                r.Terrain = WithRng(rng => Generation.GenerateTerrain(D, rng, r.Layout, r.Act, r.Cond, r.Mission));
                RelocateBlocked();
                EnforceFieldLimit();
                r.Doctrine = node.Type == "chefe" ? null : PickDoctrine();
                double extra = r.Mission == "ondas" ? 1.3 : r.Mission == "defesa" ? 1.35 : r.Mission == "invasao" ? 1.2 : 1;
                r.Enemies = WithRng(rng => Generation.GenerateHorde(D, rng, r.Room, r.Act, node.Type, r.Ascension, r.Terrain, Coop(), r.Doctrine, extra));
                WithRng(rng => AssignScenario(rng));
                if (r.Flags.Galinha) foreach (var e in r.Enemies) { e.Symbol = e.IsBoss ? "🐓" : "🐔"; e.Name = e.IsBoss ? "Galo " + e.Name : "Galinha " + e.Name.Split(' ')[0]; }
                ApplyScaling(node.Type);
                ApplyIntel();
                r.Objective = PickObjective(node.Type);
                var lay = D.Layouts[r.Layout];
                Log($"🗺️ Terreno: {lay.Icon} {lay.Name} — {lay.Desc}");
                var ms = D.Missions[r.Mission]; var cd = D.Conditions[r.Cond];
                Log($"{ms.Icon} Missão: {ms.Name} — {ms.Desc}", r.Mission == "batalha" ? "" : "level");
                if (r.Cond != "nenhuma") Log($"{cd.Icon} Condição: {cd.Name} — {cd.Desc}", "level");
                r.Phase = "PREP";
                if (node.Type == "chefe") { Sfx("bossGong"); var b = D.GetBoss(r.Act); Log($"👑 {b.Name}: {b.Mechanic}", "danger"); }
                Ach("state"); Changed();
                if (TotalEvo() > 0) OnOpenEvo?.Invoke();
            }
            else
            {
                r.Affix = "padrao"; r.Enemies = new List<UnitDef>(); r.Structures = new List<StructureSpec>(); r.CapPenalty = 0; r.Mission = null; r.Cond = null;
                if (HasRelic("bussola_explorador")) { foreach (var p in r.Players) p.Gold += (int)JsMath.Round(25 * GoldFactor()); Log("🧭 Bússola: ouro extra para todos.", "gold"); }
                int pid = NextChooser();
                var ev = WithRng(rng => BuildEvent(node.Type, rng));
                ev.Pid = pid;
                r.Pending.Add(ev);
                r.AfterPending = "MAP"; r.Phase = "CHOICE";
                Ach("state"); Changed();
            }
        }

        /* ---------------- Prontos e combate ---------------- */
        public bool AllReady() => Run.Players.All(p => p.Ready);
        public void ToggleReady(int? pid = null)
        {
            var r = Run;
            if (r.Phase != "PREP") return;
            if (!IsCoop()) { StartCombat(); return; }
            var p = P(pid ?? r.Active);
            p.Ready = !p.Ready;
            Sfx("click");
            if (p.Ready) Log($"✋ {p.Name} está pronto.");
            if (AllReady()) { StartCombat(); return; }
            if (p.Ready) { var nxt = r.Players.FirstOrDefault(x => !x.Ready); if (nxt != null) r.Active = nxt.Id; }
            Changed();
        }

        public void StartCombat()
        {
            var r = Run;
            if (r.Phase != "PREP") return;
            if (r.Board.Count == 0) { Toast("Coloque pelo menos 1 unidade em campo.", "error"); return; }
            foreach (var p in r.Players)
                if (BoardOf(p.Id).Count > FieldLimit(p)) { Toast($"{p.Name} tem unidades demais em campo (limite {FieldLimit(p)} nesta sala).", "error"); return; }
            Ach("state");
            var ctxs = r.Players.Select(p => StatsCtx(p.Id)).ToList();
            uint seed = unchecked(JsMath.HashStr(r.Seed) ^ (uint)(r.Room * 7919) ^ (uint)(r.Attempt * 104729));
            Combat = CombatEngine.Create(D, new CombatOptions
            {
                Seed = seed, Relics = new HashSet<string>(r.Relics), Affix = r.Affix, Terrain = r.Terrain,
                Players = r.Board.Select(u => new CombatSide { Unit = u.Clone(), Stats = StatsOf(u, ctxs[u.Owner]) }).ToList(),
                Enemies = r.Enemies.Select(e => new CombatSide { Unit = e, Stats = EnemyStats(e) }).ToList(),
                Tactic = r.Tactic, AntiHeal = r.Intel?.AntiHeal ?? 0, HuntId = r.Intel?.HuntId,
                Mission = r.Mission ?? "batalha", Structures = StructureUnits()
            }, CombatFx);
            Combat.StartBoard = r.Board.Count; Combat.StartSyn = ActiveSynergies();
            r.Phase = "COMBAT"; r.Stats.Combats++; Paused = false;
            foreach (var p in r.Players) p.Ready = false;
            Log($"⚔️ Combate na Sala {r.Room}/{C.TotalRooms}{(r.Attempt > 0 ? $" (tentativa {r.Attempt + 1})" : "")}.", "gold");
            Changed();
        }

        public double PlayerPower()
        {
            var ctxs = Run.Players.Select(p => StatsCtx(p.Id)).ToList();
            return StatsCalc.TeamPower(Run.Board.Select(u => StatsOf(u, ctxs[u.Owner])));
        }
        public double EnemyPower(List<UnitDef> enemies = null, bool noDef = false) => StatsCalc.TeamPower((enemies ?? Run.Enemies).Select(e => EnemyStats(e, noDef)));

        public void TogglePause() { if (Run == null || Run.Phase != "COMBAT") return; Paused = !Paused; Changed(); }

        /// <summary>Avança o combate em passos de no máximo 0,025s (G.tick).</summary>
        public void Tick(double dt)
        {
            var c = Combat;
            if (c == null) return;
            if (Paused && Run.Phase == "COMBAT") return;
            if (Run.Phase == "COMBAT" && !c.Over)
            {
                double rem = dt;
                while (rem > 0 && !c.Over) { double step = Math.Min(0.025, rem); CombatEngine.Update(c, step); rem -= step; }
                if (c.Over && !c.Handled) { c.Handled = true; FinishCombat(c); }
            }
            CombatEngine.UpdateAnim(c, dt);
        }
    }
}
