using System;
using System.Collections.Generic;
using System.Reflection;
using Newtonsoft.Json;

namespace ForjaElemental.Core
{
    /// <summary>
    /// Atributos efetivos de uma unidade (o objeto devolvido por computeStats).
    /// Campos públicos em double, com os mesmos nomes do JS.
    /// </summary>
    public sealed class StatBlock
    {
        public double MaxHp, Ad, Ap, Armor, AttackSpeed, Range, CritChance, CritDmg, MoveSpeed, MaxMana,
            StartMana, ManaRegen, ManaPerAttack, Dodge, Lifesteal, Thorns, ExecuteBonus, HighHpBonus, HealPowerMult,
            InitialShield, TrueDmgBonus, DmgReduction, MagicPen, ArmorPen, ManaRefund, DmgDealtMult, RegenPct,
            AuraHeal, BurnPct, ExplodePct, ChillAmt, ChainTargets, SolarAuraReduce, XpMult, InitialShieldPct,
            GuardAura, InspireAura, SummonMult, SummonHp, MagicReduce, ElemResist;

        public StatBlock Clone() => (StatBlock)MemberwiseClone();

        private static readonly Dictionary<string, FieldInfo> Fields = BuildFields();
        private static Dictionary<string, FieldInfo> BuildFields()
        {
            var d = new Dictionary<string, FieldInfo>();
            foreach (var f in typeof(StatBlock).GetFields(BindingFlags.Public | BindingFlags.Instance))
                d[char.ToLowerInvariant(f.Name[0]) + f.Name.Substring(1)] = f;
            return d;
        }

        /// <summary>Existe um atributo com esse nome (camelCase, como no JS)?</summary>
        public static bool Has(string key) => Fields.ContainsKey(key);
        public double Get(string key) => Fields.TryGetValue(key, out var f) ? (double)f.GetValue(this) : 0;
        public void Set(string key, double v) { if (Fields.TryGetValue(key, out var f)) f.SetValue(this, v); }
        public void Add(string key, double v) { if (Fields.TryGetValue(key, out var f)) f.SetValue(this, (double)f.GetValue(this) + v); }
        public static IEnumerable<string> Names => Fields.Keys;
    }

    public sealed class ItemRef
    {
        public string Id;
        public int Tier = 1;
        public ItemRef Clone() => (ItemRef)MemberwiseClone();
    }

    /// <summary>
    /// Unidade como definida fora do combate: recruta do jogador (roster),
    /// inimigo gerado por generateHorde ou estrutura (cidade, forte, torre).
    /// </summary>
    public sealed class UnitDef
    {
        public string Id, Name, ArchetypeId, Symbol, Color, Trait, Script, Structure;
        public int Owner, Level = 1, Wave;
        public double Col, Row, Radius;
        public OrderedDict<int> Elements = new OrderedDict<int>();
        public OrderedDict<int> Skills = new OrderedDict<int>();
        public List<ItemRef> Items = new List<ItemRef>();
        public List<string> Affixes = new List<string>();
        public bool IsBoss, IsElite, Leader, Ambush, Raider, FortSpawn;
        public OrderedDict<double> Mods, Cmods;
        public BaseStats BaseStats;

        public UnitDef Clone()
        {
            var u = (UnitDef)MemberwiseClone();
            u.Elements = new OrderedDict<int>(Elements);
            u.Skills = new OrderedDict<int>(Skills);
            u.Items = Items == null ? new List<ItemRef>() : Items.ConvertAll(i => i.Clone());
            u.Affixes = Affixes == null ? new List<string>() : new List<string>(Affixes);
            u.Mods = Mods == null ? null : new OrderedDict<double>(Mods);
            u.Cmods = Cmods == null ? null : new OrderedDict<double>(Cmods);
            u.BaseStats = BaseStats?.Clone();
            return u;
        }
    }

    /// <summary>Contexto de computeStats (ctx no JS).</summary>
    public sealed class StatsContext
    {
        public bool IsEnemy, NoDef;
        public int BoardCount, Ascension, Act;
        public double Gold;
        public double? DefK;
        public string Affix, Tactic;
        public HashSet<string> Relics = new HashSet<string>();
        public OrderedDict<double> Synergy, Orders;
    }
}
