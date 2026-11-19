using System;
using System.Collections.Generic;
using System.Linq;

namespace ForjaElemental.Core
{
    public sealed class MapNode
    {
        public string Id, Type, Affix, Layout, Mission, Cond;
        public int Act, Floor, Index, Room;
        public List<string> Next = new List<string>();
    }

    public sealed class ActMap
    {
        public int Act;
        public List<List<MapNode>> Floors = new List<List<MapNode>>();
    }

    public struct Cell { public int Col, Row; public Cell(int c, int r) { Col = c; Row = r; } }

    /// <summary>Consultas ao terreno (string/char[] de COLS×ROWS, linha a linha).</summary>
    public static class Board
    {
        public static char TerrainAt(GameData d, char[] terrain, int col, int row)
        {
            var C = d.Config;
            if (terrain == null || col < 0 || row < 0 || col >= C.COLS || row >= C.ROWS) return '.';
            return terrain[row * C.COLS + col];
        }

        public static bool IsBlocked(GameData d, char t) => d.Terrain.TryGetValue(t.ToString(), out var tt) && tt.Blocked;

        public static bool TileBlocked(GameData d, char[] terrain, int col, int row)
        {
            var C = d.Config;
            if (col < 0 || row < 0 || col >= C.COLS || row >= C.ROWS) return true;
            return IsBlocked(d, TerrainAt(d, terrain, col, row));
        }

        public static bool NoPlaceAt(GameData d, char[] terrain, int col, int row)
            => d.Terrain.TryGetValue(TerrainAt(d, terrain, col, row).ToString(), out var t) && t.NoPlace;

        public static Cell NearestPassable(GameData d, char[] terrain, int col, int row, HashSet<string> taken, bool place)
        {
            for (int rad = 0; rad < 16; rad++)
                for (int dy = -rad; dy <= rad; dy++)
                    for (int dx = -rad; dx <= rad; dx++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != rad) continue;
                        int c = col + dx, r = row + dy;
                        if (!TileBlocked(d, terrain, c, r) && !(place && NoPlaceAt(d, terrain, c, r)) && !(taken != null && taken.Contains(c + "," + r)))
                            return new Cell(c, r);
                    }
            return new Cell(col, row);
        }
    }

    /// <summary>Port da geração procedural de js/engine.js §2.</summary>
    public static class Generation
    {
        /* Escala do co-op (FE.Engine.COOP_SCALE) */
        public static double CoCount = 1.3, CoCountPer = 0.05, CoStat = 1.05, CoStatPer = 0.13, CoBoss = 1.3, CoBossPer = 0.14;

        public static string RollAffix(GameData d, Rng rng, int room)
        {
            if (room == 1) return "padrao";
            var keys = d.Arena.Keys;
            return rng.Chance(0.25) ? "padrao" : rng.Pick(keys.Skip(1).ToList());
        }

        public static (string mission, string cond) RollScenario(GameData d, Rng rng, string type, int room, int act)
        {
            if (room == 1) return ("batalha", "nenhuma");
            bool Ok(int[] acts) => acts == null || acts.Contains(act);
            var missions = d.Missions.Where(kv => Ok(kv.Value.Acts)).ToList();
            if (type == "chefe") missions = missions.Where(kv => kv.Key == "batalha" || kv.Key == "ondas").ToList();
            if (type == "elite") missions = missions.Where(kv => kv.Key != "defesa").ToList();
            if (room <= 2) missions = missions.Where(kv => kv.Key == "batalha" || kv.Key == "ondas").ToList();
            string mission = rng.Weighted(missions.Select(kv => (kv.Key, type == "chefe" && kv.Key == "ondas" ? 20.0 : kv.Value.Weight)).ToList());
            var conds = d.Conditions.Where(kv => Ok(kv.Value.Acts)).ToList();
            if (room <= 2) conds = conds.Where(kv => kv.Key == "nenhuma" || kv.Key == "andares").ToList();
            if (type == "chefe") conds = conds.Where(kv => kv.Key == "nenhuma" || kv.Key == "andares").ToList();
            string cond = rng.Weighted(conds.Select(kv => (kv.Key, kv.Value.Weight)).ToList());
            return (mission, cond);
        }

        static List<string> LayoutsFor(GameData d, int act) => d.Layouts.Where(kv => kv.Value.Acts.Contains(act)).Select(kv => kv.Key).ToList();

        public static ActMap GenerateActMap(GameData d, Rng rng, int act, int asc)
        {
            var C = d.Config;
            int RPA = C.RoomsPerAct;
            var floors = new List<List<MapNode>>();
            for (int f = 1; f <= RPA; f++)
            {
                int count = f == RPA ? 1 : (f == 1 ? 2 : rng.Int(2, 3));
                if (f >= 2 && f < RPA && rng.Chance(0.25)) count = Math.Min(4, count + 1);
                var nodes = new List<MapNode>();
                for (int i = 0; i < count; i++)
                {
                    string type;
                    if (f == RPA) type = "chefe";
                    else if (f == 1) type = "combate";
                    else if (f == RPA - 1 && i == count - 1) type = "acampamento";
                    else type = rng.Weighted(new List<(string, double)> { ("combate", 38), ("elite", asc >= 3 ? 24 : 16), ("misterio", 14), ("forja", 9), ("santuario", 8), ("acampamento", 6), ("mercador", 9) });
                    int room = (act - 1) * RPA + f;
                    bool fights = type == "combate" || type == "elite" || type == "chefe";
                    var layouts = LayoutsFor(d, act);
                    var nd = new MapNode { Id = $"a{act}f{f}n{i}", Act = act, Floor = f, Index = i, Type = type, Room = room };
                    nd.Affix = (type == "combate" || type == "elite") ? RollAffix(d, rng, room) : "padrao";
                    nd.Layout = fights ? (room == 1 ? "planicie" : rng.Pick(layouts)) : null;
                    if (fights) (nd.Mission, nd.Cond) = RollScenario(d, rng, type, room, act);
                    nodes.Add(nd);
                }
                floors.Add(nodes);
            }
            // Garante ao menos 1 combate/elite nos andares intermediários
            for (int fi = 1; fi < floors.Count - 1; fi++)
            {
                if (floors[fi].Any(n => n.Type == "combate" || n.Type == "elite")) continue;
                var n0 = floors[fi][0]; n0.Type = "combate"; n0.Affix = RollAffix(d, rng, n0.Room);
                n0.Layout = n0.Layout ?? rng.Pick(LayoutsFor(d, act));
                if (n0.Mission == null) (n0.Mission, n0.Cond) = RollScenario(d, rng, "combate", n0.Room, act);
            }
            void Link(MapNode a, string id) { if (!a.Next.Contains(id)) a.Next.Add(id); }
            for (int f = 0; f < floors.Count - 1; f++)
            {
                var A = floors[f]; var B = floors[f + 1];
                for (int i = 0; i < A.Count; i++)
                {
                    int j = A.Count == 1 ? 0 : (int)JsMath.Round(i * (B.Count - 1) / (double)(A.Count - 1));
                    Link(A[i], B[j].Id);
                    if (j + 1 < B.Count && rng.Chance(0.45)) Link(A[i], B[j + 1].Id);
                }
                for (int j = 0; j < B.Count; j++)
                {
                    var m = B[j];
                    if (!A.Any(n => n.Next.Contains(m.Id)))
                    {
                        int i = B.Count == 1 ? 0 : (int)JsMath.Round(j * (A.Count - 1) / (double)(B.Count - 1));
                        Link(A[i], m.Id);
                    }
                }
            }
            return new ActMap { Act = act, Floors = floors };
        }

        /* ---------------- Terreno procedural (16x14, espelhado entre os lados) --- */
        public static string GenerateTerrain(GameData d, Rng rng, string layout, int act, string cond = "nenhuma", string mission = "batalha")
        {
            var C = d.Config;
            int N = C.COLS, H = C.ROWS, half = H / 2, mid = half - 1;
            double cx = N / 2.0;
            var g = Enumerable.Repeat('.', N * H).ToArray();
            void Set(int c, int r, char t) { if (c >= 0 && c < N && r >= 0 && r < half) g[r * N + c] = t; }
            char Get(int c, int r) => g[r * N + c];
            int Rnd(int a, int b) => rng.Int(a, b);
            List<List<int>> Groups(int n)
            {
                var outL = new List<List<int>>(); double w = N / (double)n;
                for (int i = 0; i < n; i++)
                {
                    int a = (int)JsMath.Round(i * w) + 1, b = (int)JsMath.Round((i + 1) * w) - 2;
                    outL.Add(Enumerable.Range(0, Math.Max(1, b - a + 1)).Select(k => a + k).ToList());
                }
                return outL;
            }
            switch (layout)
            {
                case "planicie":
                    for (int k = Rnd(5, 8); k > 0; k--) Set(Rnd(0, N - 1), Rnd(1, half - 2), rng.Pick(new[] { 'F', 'F', 'H' }));
                    break;
                case "floresta":
                    for (int k = Rnd(16, 22); k > 0; k--) Set(Rnd(0, N - 1), Rnd(1, mid), 'F');
                    for (int k = 3; k > 0; k--) Set(Rnd(1, N - 2), Rnd(2, half - 2), 'M');
                    break;
                case "rio":
                    for (int c = 0; c < N; c++) Set(c, mid, 'W');
                    {
                        var sh = rng.Shuffle(Groups(4)); int take = Rnd(2, 3);
                        foreach (var gr in sh.Take(take)) { int c0 = rng.Pick(gr); Set(c0, mid, 'B'); if (rng.Chance(0.4)) Set(c0 + 1, mid, 'B'); }
                    }
                    for (int k = Rnd(3, 5); k > 0; k--) Set(Rnd(0, N - 1), Rnd(1, mid - 2), rng.Pick(new[] { 'F', 'H' }));
                    break;
                case "lago":
                    for (int r = 0; r < half; r++)
                        for (int c = 0; c < N; c++)
                        {
                            double dx = (c + 0.5 - cx) / 3.5, dy = (r + 0.5 - H / 2.0) / 2.3;
                            if (dx * dx + dy * dy <= 1) Set(c, r, 'W');
                        }
                    for (int k = Rnd(4, 6); k > 0; k--) Set(Rnd(0, N - 1), Rnd(2, half - 2), 'F');
                    break;
                case "montanha":
                    {
                        var gaps = new HashSet<int>();
                        foreach (var gr in Groups(4)) { int c0 = rng.Pick(gr); gaps.Add(c0); if (rng.Chance(0.4)) gaps.Add(c0 + 1); }
                        for (int c = 0; c < N; c++)
                            if (!gaps.Contains(c)) { Set(c, mid, 'M'); if (rng.Chance(0.3) && !gaps.Contains(c - 1) && !gaps.Contains(c + 1)) Set(c, mid - 1, 'M'); }
                        for (int k = 4; k > 0; k--) Set(Rnd(0, N - 1), Rnd(1, mid - 2), 'H');
                        break;
                    }
                case "pantano":
                    for (int k = 5; k > 0; k--)
                    {
                        int px = Rnd(1, N - 2), py = Rnd(2, mid);
                        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) if (rng.Chance(0.7)) Set(px + dx, py + dy, 'S');
                    }
                    for (int k = 3; k > 0; k--) Set(Rnd(1, N - 2), Rnd(3, mid), 'W');
                    break;
                case "ravina":
                    {
                        int a = (int)Math.Floor(cx) - 1, b = (int)Math.Floor(cx);
                        for (int r = 1; r < half; r++) { Set(a, r, 'R'); Set(b, r, 'R'); }
                        int br = Rnd(2, mid - 1); Set(a, br, 'B'); Set(b, br, 'B');
                        for (int k = 3; k > 0; k--) { int c = Rnd(1, a - 2), r = Rnd(2, mid - 1); Set(c, r, 'M'); Set(N - 1 - c, r, 'M'); }
                        break;
                    }
                case "ruinas":
                    for (int k = Rnd(5, 8); k > 0; k--) { int c = Rnd(0, (int)Math.Floor(cx) - 1), r = Rnd(2, mid); Set(c, r, 'P'); Set(N - 1 - c, r, 'P'); }
                    for (int k = 3; k > 0; k--) Set(Rnd(0, N - 1), Rnd(1, mid - 2), 'H');
                    break;
                case "ilhas":
                    {
                        for (int r = 2; r < half; r++) for (int c = 0; c < N; c++) Set(c, r, 'R');
                        int w = (int)Math.Floor(N * 0.32);
                        for (int r = 2; r <= mid - 1; r++) { for (int c = 1; c <= w; c++) Set(c, r, '.'); for (int c = N - 1 - w; c <= N - 2; c++) Set(c, r, '.'); }
                        int br = Rnd(3, mid - 1); for (int c = w + 1; c < N - 1 - w; c++) Set(c, br, 'B');
                        foreach (int c in rng.Shuffle(new[] { 2, 3, w - 1, N - 1 - w + 1, N - 4, N - 3 }).Take(3)) Set(c, mid, 'B');
                        for (int k = 3; k > 0; k--)
                        {
                            int o1 = Rnd(1, w), o2 = Rnd(N - 1 - w, N - 2);
                            int pc = rng.Pick(new[] { o1, o2 });
                            Set(pc, Rnd(2, mid - 1), 'H');
                        }
                        break;
                    }
                case "magma":
                    for (int c = 0; c < N; c++) Set(c, mid, 'L');
                    foreach (var gr in rng.Shuffle(Groups(4)).Take(2)) Set(rng.Pick(gr), mid, 'B');
                    for (int k = 4; k > 0; k--) Set(Rnd(0, N - 1), Rnd(2, mid - 1), 'M');
                    for (int k = 4; k > 0; k--) Set(Rnd(0, N - 1), Rnd(2, mid - 1), 'L');
                    break;
            }
            // Condições de campo (na metade inimiga; o espelho leva para o seu lado)
            bool Soft(char t) => t == '.' || t == 'F' || t == 'H' || t == 'S';
            if (cond == "andares")
            {
                int w = rng.Pick(new[] { 2, 3 }), r0 = Rnd(1, Math.Max(1, mid - 3));
                int b1 = Rnd(1, (int)Math.Floor(cx) - w - 1), b2 = Rnd((int)Math.Ceiling(cx) + 1, N - w - 1);
                foreach (int c0 in new[] { b1, b2 })
                    for (int r = r0; r < r0 + 2; r++) for (int c = c0; c < c0 + w; c++) if (Soft(Get(c, r))) Set(c, r, 'U');
                if (rng.Chance(0.5)) { int c0 = (int)Math.Floor(cx) - 1; for (int c = c0; c < c0 + 2; c++) if (Soft(Get(c, mid - 1))) Set(c, mid - 1, 'U'); }
            }
            else if (cond == "alcapoes")
            {
                for (int k = Rnd(4, 6); k > 0; k--) { int c = Rnd(1, N - 2), r = rng.Pick(new[] { mid, mid - 1, mid - 2 }); if (Soft(Get(c, r))) Set(c, r, 'T'); }
            }
            else if (cond == "buracos")
            {
                for (int k = Rnd(4, 6); k > 0; k--) { int c = Rnd(0, N - 1), r = Rnd(1, mid); if (Soft(Get(c, r))) Set(c, r, 'O'); }
            }
            else if (cond == "estreito")
            {
                for (int r = 0; r < half; r++) foreach (int c in new[] { 0, 1, N - 2, N - 1 }) Set(c, r, 'M');
            }
            // Espelha a metade inimiga para o lado do jogador
            for (int r = 0; r < half; r++) for (int c = 0; c < N; c++) g[(H - 1 - r) * N + c] = g[r * N + c];
            // Missões com estruturas
            void Plaza(int r) { for (int c = (int)Math.Floor(cx) - 2; c <= (int)Math.Ceiling(cx) + 1; c++) g[r * N + c] = 'Z'; }
            if (mission == "defesa") Plaza(H - 1);
            if (mission == "invasao") { Plaza(0); g[N + 2] = 'Z'; g[N + N - 3] = 'Z'; }
            // Garante que os dois lados estão conectados
            for (int tries = 0; tries < 8 && !Connected(d, g); tries++)
            {
                int c = Rnd(2, N - 3);
                for (int r = 0; r < H; r++)
                {
                    char t = g[r * N + c];
                    if (Board.IsBlocked(d, t)) g[r * N + c] = (t == 'M' || t == 'P' || t == 'O') ? '.' : 'B';
                }
            }
            return new string(g);
        }

        static bool Connected(GameData d, char[] g)
        {
            int N = d.Config.COLS, H = d.Config.ROWS;
            var seen = new bool[N * H]; var q = new List<int>();
            for (int c = 0; c < N; c++) { int i = (H - 1) * N + c; if (!Board.IsBlocked(d, g[i])) { seen[i] = true; q.Add(i); } }
            int[] dxs = { 1, -1, 0, 0 }, dys = { 0, 0, 1, -1 };
            while (q.Count > 0)
            {
                int i = q[q.Count - 1]; q.RemoveAt(q.Count - 1);
                int x = i % N, y = i / N;
                if (y == 0) return true;
                for (int k = 0; k < 4; k++)
                {
                    int nx = x + dxs[k], ny = y + dys[k]; if (nx < 0 || ny < 0 || nx >= N || ny >= H) continue;
                    int j = ny * N + nx; if (!seen[j] && !Board.IsBlocked(d, g[j])) { seen[j] = true; q.Add(j); }
                }
            }
            return false;
        }

        static BaseStats MakeEnemyStats(Archetype arch, double scale, double mult = 0.82)
        {
            var st = arch.Stats;
            return new BaseStats
            {
                MaxHp = JsMath.Round(st.MaxHp * scale * mult), Ad = JsMath.Round(st.Ad * scale * mult), Ap = JsMath.Round(st.Ap * scale * mult),
                Armor = JsMath.Round(st.Armor), AttackSpeed = st.AttackSpeed, Range = st.Range, CritChance = st.CritChance,
                MoveSpeed = st.MoveSpeed, MaxMana = st.MaxMana
            };
        }

        public static List<UnitDef> GenerateHorde(GameData d, Rng rng, int room, int act, string roomType, int asc, string terrainStr,
            int players = 1, string doctrineId = null, double extraCount = 1)
        {
            var C = d.Config;
            var terrain = terrainStr?.ToCharArray();
            var doc = doctrineId != null && roomType != "chefe" ? d.Doctrines[doctrineId] : null;
            var dmods = doc != null ? new OrderedDict<double>(doc.Mods) : null;
            var enemies = new List<UnitDef>();
            var archKeys = d.Archetypes.Keys.ToList();
            var elKeys = d.Elements.Keys.ToList();
            var fac = d.GetAct(act);
            bool isBoss = roomType == "chefe", isElite = roomType == "elite";
            bool coop = players > 1;
            double coopCount = coop ? CoCount + CoCountPer * room : 1, coopStat = coop ? CoStat + CoStatPer * room : 1;
            int baseCount = isBoss ? 3 + (int)Math.Floor(room * 0.33) : 3 + (int)Math.Floor(room * 0.7) + (isElite ? 1 : 0);
            double docCount = doc != null && doc.CountMult != 0 ? (coop ? 1 + (doc.CountMult - 1) * 0.5 : doc.CountMult) : 1;
            int count = (int)Math.Min(isBoss ? 16 : 34, JsMath.Round(baseCount * coopCount * docCount * (extraCount != 0 ? extraCount : 1)));
            double scale = (1 + (room - 1) * 0.135 + (isElite ? 0.15 : 0)) * coopStat;

            var cols = Enumerable.Range(0, C.COLS).ToList();
            var slots = new List<Cell>();
            for (int r = C.PlayerRow - 1; r >= 0; r--)
                foreach (int c in rng.Shuffle(cols))
                    if (!Board.TileBlocked(d, terrain, c, r) && !Board.NoPlaceAt(d, terrain, c, r)) slots.Add(new Cell(c, r));
            Cell? lead = (isBoss || isElite) ? Board.NearestPassable(d, terrain, C.COLS / 2 - 1, 2, null, true) : (Cell?)null;
            bool Reserved(Cell p) => lead.HasValue && p.Row == lead.Value.Row && p.Col == lead.Value.Col;

            if (isBoss)
            {
                var bc = d.GetBoss(act);
                enemies.Add(new UnitDef
                {
                    Id = $"boss_{room}", Name = bc.Name, ArchetypeId = "vanguarda", Symbol = bc.Symbol, Color = bc.Color,
                    IsBoss = true, IsElite = true, Level = Math.Max(3, (int)Math.Floor(room * 0.95)), Col = lead.Value.Col, Row = lead.Value.Row,
                    Elements = new OrderedDict<int>(bc.Elements), Skills = new OrderedDict<int>(bc.Skills), Script = bc.Script,
                    BaseStats = new BaseStats
                    {
                        MaxHp = JsMath.Round(820 * scale * bc.HpMult * (coop ? CoBoss + CoBossPer * room : 1)), Ad = JsMath.Round(52 * scale * bc.AdMult), Ap = JsMath.Round(65 * scale * bc.ApMult),
                        Armor = JsMath.Round(35 + room * 3.5), AttackSpeed = 0.85, Range = 2.2, CritChance = 0.20, MoveSpeed = 1.9, MaxMana = 85
                    }
                });
            }
            else if (isElite)
            {
                string el1 = rng.Pick(elKeys);
                var affs = rng.Shuffle(d.EliteAffixes.Keys).Take(act >= 2 ? 2 : 1).ToList();
                string archId = rng.Pick(new[] { "berserker", "vanguarda", "lanceiro" });
                var a = d.Archetypes[archId];
                var bs = MakeEnemyStats(a, scale, 1.0);
                bs.MaxHp = JsMath.Round(740 * scale * 1.95); bs.Ad = JsMath.Round(64 * scale * 1.3); bs.Armor = JsMath.Round(28 + room * 2.5); bs.Range = Math.Max(1.5, a.Stats.Range);
                var sk = new OrderedDict<int>(); sk[a.SignatureSkill] = 2; sk[a.Skills[1]] = 1;
                var els = new OrderedDict<int>(); els[el1] = 2;
                enemies.Add(new UnitDef
                {
                    Id = $"elite_{room}", Name = $"Comandante {d.Elements[el1].Name}", ArchetypeId = archId, Symbol = "👹", Color = "#f59e0b",
                    IsBoss = false, IsElite = true, Level = Math.Max(2, (int)Math.Floor(room * 0.85)), Col = lead.Value.Col, Row = lead.Value.Row,
                    Elements = els, Skills = sk, Affixes = affs, Mods = dmods != null && doc.CountMult == 0 ? new OrderedDict<double>(dmods) : null, Leader = true,
                    BaseStats = bs
                });
            }

            int si = 0, bi = slots.Count - 1;
            var frontPool = new List<string> { "vanguarda", "berserker", "lanceiro", "paladino", "monge" };
            var pool = doc?.Pool ?? archKeys;
            int nFront = doc?.Front != null ? Math.Min(count, Math.Max(doc.Front.Count, (int)JsMath.Round(count * 0.34))) : 0;
            int ambushN = doc != null && doc.Ambush != 0 ? (int)JsMath.Round(count * doc.Ambush * (coop ? 0.6 : 1)) : 0;
            for (int i = 0; i < count; i++)
            {
                string archKey = null; Cell pos;
                if (doc?.Front != null && i < nFront) archKey = doc.Front[i % doc.Front.Count];
                else if (doc?.Front != null) archKey = rng.Pick(pool);
                bool deep = doc != null && doc.Formation == "back" && i >= nFront;
                if (deep) { while (bi >= si && Reserved(slots[bi])) bi--; if (bi < si) break; pos = slots[bi--]; }
                else { while (si <= bi && Reserved(slots[si])) si++; if (si > bi) break; pos = slots[si++]; }
                if (archKey == null)
                    archKey = pos.Row >= C.PlayerRow - 2 && i < (int)Math.Ceiling(count / 2.0) ? rng.Pick(doc?.Pool != null ? pool : frontPool) : rng.Pick(pool);
                var arch = d.Archetypes[archKey];
                var els = new OrderedDict<int>();
                if (room >= 2 && rng.Chance(0.5)) els[rng.Pick(elKeys)] = 1;
                if (asc >= 5 && room >= 3) { string e = rng.Pick(elKeys); els[e] = els.Get(e) + 1; }
                var skills = new OrderedDict<int>(); skills[arch.SignatureSkill] = room >= 7 ? 2 : 1;
                if (room >= 11) skills[arch.Skills[1]] = 1;
                var fe = fac.Faction[archKey];
                var bs = MakeEnemyStats(arch, scale);
                bs.Armor = JsMath.Round(arch.Stats.Armor * (1 + (room - 1) * 0.05));
                enemies.Add(new UnitDef
                {
                    Id = $"e_{room}_{i}", Name = fe[0], ArchetypeId = archKey, Symbol = fe[1], Color = fac.EnemyColor,
                    IsBoss = false, IsElite = false, Level = Math.Max(1, (int)Math.Floor(1 + (room - 1) * 0.42)), Col = pos.Col, Row = pos.Row,
                    Elements = els, Skills = skills, Mods = dmods != null ? new OrderedDict<double>(dmods) : null,
                    Ambush = i >= count - ambushN && archKey != "sombra",
                    BaseStats = bs
                });
            }
            return enemies;
        }
    }
}
