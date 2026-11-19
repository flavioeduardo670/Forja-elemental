using System;
using System.Collections.Generic;

namespace ForjaElemental.Core
{
    /// <summary>Port de computeStats, applyMods e da escala de poder (js/engine.js §1 e §4).</summary>
    public static class StatsCalc
    {
        public static int SynergyTier(GameData d, double count)
        {
            var t = d.Config.SynThresholds;
            for (int i = t.Length - 1; i >= 0; i--) if (count >= t[i]) return i + 1;
            return 0;
        }

        public static int OrderTier(GameData d, double count, Order ord)
        {
            var t = ord?.Thresholds ?? d.Config.OrderThresholds;
            for (int i = t.Length - 1; i >= 0; i--) if (count >= t[i]) return i + 1;
            return 0;
        }

        /// <summary>Modificadores genéricos (traços, táticas, doutrinas e contramedidas).</summary>
        public static void ApplyMods(StatBlock s, OrderedDict<double> m)
        {
            if (m == null) return;
            double v;
            if ((v = m.Get("hpMult")) != 0) s.MaxHp *= v;
            if ((v = m.Get("adMult")) != 0) s.Ad *= v;
            if ((v = m.Get("apMult")) != 0) s.Ap *= v;
            if ((v = m.Get("armorMult")) != 0) s.Armor *= v;
            if ((v = m.Get("armorAdd")) != 0) s.Armor += v;
            if ((v = m.Get("asMult")) != 0) s.AttackSpeed *= v;
            if ((v = m.Get("healMult")) != 0) s.HealPowerMult *= v;
            if ((v = m.Get("startMana")) != 0) s.StartMana += v;
            if ((v = m.Get("manaRegenMult")) != 0) s.ManaRegen *= v;
            if ((v = m.Get("lifesteal")) != 0) s.Lifesteal += v;
            if ((v = m.Get("dmgMult")) != 0) s.DmgDealtMult *= v;
            if ((v = m.Get("magicReduce")) != 0) s.MagicReduce = Math.Min(0.6, s.MagicReduce + v);
            if ((v = m.Get("armorPen")) != 0) s.ArmorPen += v;
            if ((v = m.Get("chain")) != 0) s.ChainTargets = Math.Max(s.ChainTargets, v);
            if ((v = m.Get("crit")) != 0) s.CritChance += v;
            if ((v = m.Get("dodge")) != 0) s.Dodge += v;
            if ((v = m.Get("shieldPct")) != 0) s.InitialShieldPct += v;
            if ((v = m.Get("dmgReduce")) != 0) s.DmgReduction += v;
            if ((v = m.Get("execute")) != 0) s.ExecuteBonus += v;
            if ((v = m.Get("highHp")) != 0) s.HighHpBonus += v;
            if ((v = m.Get("inspire")) != 0) s.InspireAura += v;
            if ((v = m.Get("elemResist")) != 0) s.ElemResist = Math.Min(0.6, s.ElemResist + v);
        }

        public static StatBlock Compute(GameData d, UnitDef unit, StatsContext ctx)
        {
            var C = d.Config;
            var arch = d.Archetypes[unit.ArchetypeId];
            var b = unit.BaseStats ?? arch.Stats;
            int lvl = unit.Level > 0 ? unit.Level : 1;
            var s = new StatBlock
            {
                MaxHp = b.MaxHp * (1 + (lvl - 1) * 0.14), Ad = b.Ad * (1 + (lvl - 1) * 0.12), Ap = b.Ap * (1 + (lvl - 1) * 0.12),
                Armor = b.Armor + (lvl - 1) * 3.5, AttackSpeed = b.AttackSpeed, Range = b.Range, CritChance = b.CritChance, CritDmg = 1.75,
                MoveSpeed = b.MoveSpeed, MaxMana = b.MaxMana, StartMana = 15, ManaRegen = 2, ManaPerAttack = 12,
                HealPowerMult = 1, DmgDealtMult = 1
            };

            // 1. Stacks elementais individuais
            int distinct = 0;
            foreach (var kv in unit.Elements)
            {
                int st = kv.Value;
                if (st <= 0) continue;
                distinct++;
                switch (kv.Key)
                {
                    case "fogo": s.Ad *= 1 + 0.12 * st; s.Ap *= 1 + 0.12 * st; break;
                    case "agua": s.MaxMana += 15 * st; s.Ap += 8 * st; break;
                    case "pedra": s.Armor += 14 * st; s.MaxHp += 90 * st; break;
                    case "ar": s.AttackSpeed *= 1 + 0.12 * st; break;
                    case "solar": s.CritChance += 0.10 * st; s.Ad += 10 * st; break;
                    case "lunar": s.CritDmg += 0.10 * st; s.Ap += 10 * st; break;
                }
            }

            // 2. Passivas do arquétipo
            var k = unit.Skills;
            int l;
            if ((l = k.Get("vg_couraca")) != 0) { s.Armor += l * 18; s.MaxHp *= 1 + l * 0.14; }
            if ((l = k.Get("vg_provocacao")) != 0) s.Thorns += l * 0.18;
            if ((l = k.Get("ar_fluxo")) != 0) { s.Ap *= 1 + l * 0.22; s.ManaRegen += l * 4; }
            if ((l = k.Get("ar_eco")) != 0) { s.MagicPen += l * 0.15; s.DmgDealtMult += l * 0.12; }
            if ((l = k.Get("ca_olho_aguia")) != 0) { s.CritChance += l * 0.12; s.CritDmg += l * 0.25; s.Range += l * 0.4; }
            if ((l = k.Get("ca_vento_leve")) != 0) s.AttackSpeed *= 1 + l * 0.18;
            if ((l = k.Get("so_veneno")) != 0) s.ExecuteBonus += l * 0.18;
            if ((l = k.Get("so_evasao")) != 0) { s.Dodge += l * 0.10; s.Lifesteal += l * 0.10; }
            if ((l = k.Get("cl_graca")) != 0) s.HealPowerMult += l * 0.22;
            if ((l = k.Get("cl_aura_mana")) != 0) { s.Ap *= 1 + l * 0.18; s.ManaPerAttack += l * 5; }
            if ((l = k.Get("at_engrenagem")) != 0) { s.AttackSpeed *= 1 + l * 0.16; s.Ap *= 1 + l * 0.16; }
            if ((l = k.Get("at_campo_forca")) != 0) { s.InitialShield += l * 140; s.StartMana += l * 15; }
            if ((l = k.Get("be_sede_sangue")) != 0) s.Lifesteal += l * 0.11;
            if ((l = k.Get("be_pele_ferro")) != 0) { s.Ad *= 1 + l * 0.15; s.MaxHp += l * 140; }
            if ((l = k.Get("ln_postura")) != 0) { s.Armor += l * 12; s.Dodge += l * 0.08; }
            if ((l = k.Get("ln_primeiro")) != 0) s.HighHpBonus += l * 0.20;
            if ((l = k.Get("dr_casca")) != 0) { s.MaxHp += l * 120; s.DmgReduction += l * 0.07; }
            if ((l = k.Get("pa_aura")) != 0) s.GuardAura += l * 0.05;
            if ((l = k.Get("pa_fe")) != 0) { s.MaxHp *= 1 + l * 0.12; s.Armor += l * 10; }
            if ((l = k.Get("mo_fluxo")) != 0) { s.ManaPerAttack += l * 5; s.AttackSpeed *= 1 + l * 0.08; }
            if ((l = k.Get("mo_serenidade")) != 0) s.Dodge += l * 0.10;
            if ((l = k.Get("al_catalise")) != 0) { s.Ap *= 1 + l * 0.15; s.MaxMana *= 1 - l * 0.08; }
            if ((l = k.Get("bd_inspirar")) != 0) s.InspireAura += l * 0.06;
            if ((l = k.Get("bd_ritmo")) != 0) { s.StartMana += l * 12; s.ManaRegen += l * 3; }
            if ((l = k.Get("ne_pacto")) != 0) { s.Lifesteal += l * 0.10; s.SummonHp += l * 0.20; }

            // 2b. Traço do recruta (Quartel)
            if (!ctx.IsEnemy && unit.Trait != null && d.Traits.TryGetValue(unit.Trait, out var trait)) ApplyMods(s, trait.Mods);

            // 3. Itens (com tier ★1–★3)
            var items = unit.Items ?? new List<ItemRef>();
            foreach (var it in items)
            {
                if (!d.Items.TryGetValue(it.Id, out var def)) continue;
                int ti = (it.Tier > 0 ? it.Tier : 1) - 1;
                double m = ti >= 0 && ti < C.ItemTierMult.Length && C.ItemTierMult[ti] != 0 ? C.ItemTierMult[ti] : 1;
                foreach (var kv in def.Stats)
                {
                    double v = kv.Value * m;
                    if (kv.Key == "asMult") s.AttackSpeed *= 1 + v;
                    else if (kv.Key == "healMult") s.HealPowerMult += v;
                    else if (StatBlock.Has(kv.Key)) s.Add(kv.Key, v);
                }
            }

            if (!ctx.IsEnemy)
            {
                // 4. Ordens: Classes e Origens
                var mine = new HashSet<string>(arch.Orders ?? new List<string>());
                foreach (var ord in d.Orders.Values)
                {
                    int tier = OrderTier(d, ctx.Orders?.Get(ord.Id) ?? 0, ord);
                    if (tier == 0) continue;
                    var t = ord.Tiers[tier - 1];
                    if (t.HealAll != 0) s.HealPowerMult += t.HealAll;
                    if (t.TeamShield != 0) s.InitialShieldPct += t.TeamShield;
                    if (!mine.Contains(ord.Id)) continue;
                    if (t.HpPct != 0) s.MaxHp *= 1 + t.HpPct;
                    if (t.Armor != 0) s.Armor += t.Armor;
                    if (t.ApPct != 0) s.Ap *= 1 + t.ApPct;
                    if (t.ManaRegen != 0) s.ManaRegen += t.ManaRegen;
                    if (t.Crit != 0) s.CritChance += t.Crit;
                    if (t.CritDmg != 0) s.CritDmg += t.CritDmg;
                    if (t.StartMana != 0) s.StartMana += t.StartMana;
                    if (t.SummonMult != 0) s.SummonMult += t.SummonMult;
                    if (t.RegenPct != 0) s.RegenPct += t.RegenPct;
                    if (t.AsPct != 0) s.AttackSpeed *= 1 + t.AsPct;
                    if (t.Lifesteal != 0) s.Lifesteal += t.Lifesteal;
                    if (t.Execute != 0) s.ExecuteBonus += t.Execute;
                    if (t.TrueDmg != 0) s.TrueDmgBonus += t.TrueDmg;
                    if (t.ArmorPen != 0) s.ArmorPen += t.ArmorPen;
                }
            }

            // 5. Sinergias elementais
            foreach (var kv in d.Elements)
            {
                string elKey = kv.Key; var el = kv.Value;
                int tier;
                if (ctx.IsEnemy) tier = unit.Elements.Get(elKey) > 0 ? (unit.IsBoss ? 2 : 1) : 0;
                else tier = SynergyTier(d, ctx.Synergy?.Get(elKey) ?? 0);
                if (tier == 0) continue;
                int i = tier - 1;
                switch (elKey)
                {
                    case "fogo": s.BurnPct = el.BurnPct[i]; s.ExplodePct = el.ExplodePct[i]; break;
                    case "agua": s.ManaRegen += el.ManaRegen[i]; s.ChillAmt = el.ChillAmt[i]; break;
                    case "pedra": s.Armor += el.ArmorBonus[i]; s.InitialShieldPct += el.ShieldPct[i]; break;
                    case "ar": s.AttackSpeed *= 1 + el.AsMult[i]; s.Dodge += el.Dodge[i]; s.ChainTargets = el.ChainTargets[i]; break;
                    case "solar": s.TrueDmgBonus += el.TrueDmgPct[i]; s.SolarAuraReduce = el.AuraReduce[i]; break;
                    case "lunar": s.Lifesteal += el.Lifesteal[i]; s.CritDmg += el.CritDmg[i]; break;
                }
            }

            if (!ctx.IsEnemy)
            {
                // 6. Relíquias (jogador)
                var R = ctx.Relics ?? new HashSet<string>();
                int n = ctx.BoardCount;
                if (R.Contains("coroa_lobo") && n <= 3) { s.MaxHp *= 1.65; s.Ad *= 1.55; s.Ap *= 1.55; }
                if (R.Contains("estandarte_legiao") && n > 5) { int ex = n - 5; s.AttackSpeed *= 1 + ex * 0.07; s.Armor += ex * 10; }
                if (R.Contains("prisma_elemental") && distinct >= 3) { s.MaxHp *= 1.35; s.Ad *= 1.35; s.Ap *= 1.35; s.Armor *= 1.35; }
                if (R.Contains("reator_mana")) { s.MaxMana = Math.Max(35, JsMath.Round(s.MaxMana * 0.75)); s.DmgDealtMult += 0.25; }
                if (R.Contains("cofre_mercador")) s.DmgDealtMult += Math.Floor(ctx.Gold / 15) * 0.01;
                if (R.Contains("martelo_ferreiro") && items.Count >= 2) { s.Ad *= 1.30; s.Ap *= 1.30; s.InitialShieldPct += 0.25; }
                if (R.Contains("ampulheta_temporal")) s.StartMana += 40;
                if (R.Contains("egide_tita") && unit.Row >= C.PlayerRow && unit.Row <= C.PlayerRow + 1) { s.MaxHp *= 1.35; s.Armor += 25; }
                if (R.Contains("lente_atirador") && unit.Row >= C.ROWS - 2) { s.CritChance += 0.25; s.Range += 1.0; }
                if (R.Contains("bencao_celestial")) s.HealPowerMult *= 1.40;
                if (R.Contains("coracao_forja") && items.Count > 0) { double bo = 1 + items.Count * 0.15; s.MaxHp *= bo; s.Ad *= bo; s.Ap *= bo; }
                if (R.Contains("escudo_vigia")) s.InitialShieldPct += 0.12;
                if (R.Contains("presa_vampira")) s.Lifesteal += 0.10;
                if (R.Contains("pato_borracha")) s.CritChance += 0.06;
                if (R.Contains("pintinho_dourado")) { s.AttackSpeed *= 1.08; s.MaxHp *= 1.08; }
                if (ctx.Tactic != null && d.Tactics.TryGetValue(ctx.Tactic, out var tac)) ApplyMods(s, tac.Mods);
            }
            else
            {
                // 6b. Inimigos: afixos de elite e ascensão
                foreach (var af in unit.Affixes ?? new List<string>())
                {
                    if (af == "blindado") { s.Armor *= 1.5; s.MaxHp *= 1.3; }
                    if (af == "veloz") { s.AttackSpeed *= 1.4; s.MoveSpeed += 1; }
                    if (af == "vampirico") s.Lifesteal += 0.25;
                    if (af == "regenerativo") s.RegenPct += 0.02;
                }
                int asc = ctx.Ascension;
                if (asc > 0) { double m = 1 + asc * 0.06; s.MaxHp *= m; s.Ad *= m; s.Ap *= m; }
                ApplyMods(s, unit.Mods); ApplyMods(s, unit.Cmods);
                // Defesas de veterano: crescem por Ato
                if (!ctx.NoDef)
                {
                    var V = d.EnemyDefense;
                    int ai = Math.Max(0, Math.Min(3, (ctx.Act != 0 ? ctx.Act : 1) - 1));
                    double defK = ctx.DefK ?? 1;
                    double bossK = (unit.IsBoss ? V.BossMult : unit.IsElite ? V.EliteMult : 1) * defK;
                    s.MaxHp *= 1 + V.Hp[ai] * bossK;
                    s.Armor = s.Armor * (1 + V.Armor[ai] * bossK) + V.ArmorFlat[ai] * defK;
                    s.MagicReduce = Math.Min(0.6, s.MagicReduce + V.Magic[ai] * bossK);
                    s.ElemResist = Math.Min(0.6, s.ElemResist + V.Elem[ai] * bossK);
                }
            }

            // 7. Arena
            switch (ctx.Affix)
            {
                case "tempestade_arcana": s.ManaRegen *= 1.35; break;
                case "solo_vulcanico": s.DmgDealtMult *= 1.22; break;
                case "nevoa_densa": s.Dodge += 0.18; break;
                case "arena_sagrada": s.HealPowerMult *= 1.30; break;
                case "vento_cortante": s.AttackSpeed *= 1.25; break;
                case "eclipse_sombrio": s.Lifesteal += 0.20; s.CritDmg += 0.25; break;
            }

            // 8. Derivados que dependem de valores finais
            if ((l = k.Get("dr_seiva")) != 0) s.AuraHeal = 6 * l + s.Ap * 0.05 * l;
            s.InitialShield += s.MaxHp * s.InitialShieldPct;

            var r = s.Clone();
            double maxMana = JsMath.Round(s.MaxMana);
            r.MaxHp = JsMath.Round(s.MaxHp); r.Ad = JsMath.Round(s.Ad); r.Ap = JsMath.Round(s.Ap); r.Armor = JsMath.Round(s.Armor);
            r.AttackSpeed = JsMath.Fixed(s.AttackSpeed, 2); r.Range = JsMath.Fixed(s.Range, 2); r.CritChance = Math.Min(0.95, s.CritChance);
            r.CritDmg = JsMath.Fixed(s.CritDmg, 2); r.MaxMana = maxMana; r.StartMana = Math.Min(maxMana, JsMath.Round(s.StartMana));
            r.ManaRegen = JsMath.Fixed(s.ManaRegen, 1); r.Dodge = Math.Min(0.70, s.Dodge); r.DmgReduction = Math.Min(0.60, s.DmgReduction);
            r.MagicPen = Math.Min(0.80, s.MagicPen); r.ArmorPen = Math.Min(0.80, s.ArmorPen); r.InitialShield = JsMath.Round(s.InitialShield);
            return r;
        }

        /* Poder de uma unidade = √(vida efetiva × DPS). Time = (Σ)²/100 (Lanchester). */
        public static double UnitPower(StatBlock s)
        {
            double ehp = (s.MaxHp + s.InitialShield) * (1 + Math.Max(0, s.Armor) / 100)
                / Math.Max(0.3, 1 - s.Dodge) / Math.Max(0.4, 1 - s.DmgReduction) * (1 + s.RegenPct * 12);
            double crit = 1 + Math.Min(0.95, s.CritChance) * Math.Max(0, (s.CritDmg != 0 ? s.CritDmg : 1.75) - 1);
            double atk = s.Ad * s.AttackSpeed * crit;
            double mag = s.Ap * s.AttackSpeed * 0.55 * (1 + s.ManaRegen / 12);
            double dps = (atk + mag) * (1 + s.TrueDmgBonus) * (s.DmgDealtMult != 0 ? s.DmgDealtMult : 1) * (1 + s.Lifesteal * 0.5);
            return Math.Sqrt(Math.Max(1, ehp) * Math.Max(1, dps));
        }

        public static double TeamPower(IEnumerable<StatBlock> list)
        {
            double sum = 0;
            foreach (var s in list) sum += UnitPower(s);
            return JsMath.Round(sum * sum / 100);
        }
    }
}
