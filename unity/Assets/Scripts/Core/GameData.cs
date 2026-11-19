using System.Collections.Generic;
using Newtonsoft.Json;

namespace ForjaElemental.Core
{
    /// <summary>
    /// Conteúdo do jogo (espelho de FE.Data em js/data.js), carregado do JSON
    /// gerado por tools/export-data.js. As tabelas mantêm a ordem do JS.
    /// </summary>
    public sealed class GameData
    {
        [JsonProperty("CONFIG")] public Config Config;
        [JsonProperty("ARCHETYPES")] public OrderedDict<Archetype> Archetypes;
        [JsonProperty("SKILLS")] public OrderedDict<Skill> Skills;
        [JsonProperty("ELEMENTS")] public OrderedDict<Element> Elements;
        [JsonProperty("ORDERS")] public OrderedDict<Order> Orders;
        [JsonProperty("RELICS")] public OrderedDict<Relic> Relics;
        [JsonProperty("RARITY")] public OrderedDict<Rarity> Rarity;
        [JsonProperty("ITEMS")] public OrderedDict<Item> Items;
        [JsonProperty("STAT_LABELS")] public OrderedDict<string> StatLabels;
        [JsonProperty("ARENA")] public OrderedDict<Arena> Arena;
        [JsonProperty("ACTS")] public OrderedDict<Act> Acts;
        [JsonProperty("EPILOGUE")] public List<string> Epilogue;
        [JsonProperty("BOSSES")] public OrderedDict<Boss> Bosses;
        [JsonProperty("ELITE_AFFIXES")] public OrderedDict<EliteAffix> EliteAffixes;
        [JsonProperty("NODE_TYPES")] public OrderedDict<NodeType> NodeTypes;
        [JsonProperty("META_UPGRADES")] public OrderedDict<MetaUpgrade> MetaUpgrades;
        [JsonProperty("ASCENSIONS")] public List<Ascension> Ascensions;
        [JsonProperty("TERRAIN")] public OrderedDict<TerrainType> Terrain;
        [JsonProperty("MISSIONS")] public OrderedDict<Mission> Missions;
        [JsonProperty("CONDITIONS")] public OrderedDict<Condition> Conditions;
        [JsonProperty("LAYOUTS")] public OrderedDict<Layout> Layouts;
        [JsonProperty("SCALING")] public Scaling Scaling;
        [JsonProperty("DOCTRINES")] public OrderedDict<Doctrine> Doctrines;
        [JsonProperty("COUNTERS")] public OrderedDict<Counter> Counters;
        [JsonProperty("OBJECTIVES")] public OrderedDict<Objective> Objectives;
        [JsonProperty("TACTICS")] public OrderedDict<Tactic> Tactics;
        [JsonProperty("TRAITS")] public OrderedDict<Trait> Traits;
        [JsonProperty("QUARTEL")] public Quartel Quartel;
        [JsonProperty("ENEMY_DEFENSE")] public EnemyDefense EnemyDefense;

        public static GameData Load(string json)
        {
            var d = JsonConvert.DeserializeObject<GameData>(json);
            foreach (var kv in d.Arena) kv.Value.Id = kv.Key;
            foreach (var kv in d.EliteAffixes) kv.Value.Id = kv.Key;
            foreach (var kv in d.Missions) kv.Value.Id = kv.Key;
            foreach (var kv in d.Conditions) kv.Value.Id = kv.Key;
            foreach (var kv in d.Layouts) kv.Value.Id = kv.Key;
            foreach (var kv in d.Terrain) kv.Value.Id = kv.Key;
            foreach (var kv in d.Bosses) kv.Value.Id = kv.Key;
            return d;
        }

        public Act GetAct(int act) => Acts[act.ToString()];
        public Boss GetBoss(int act) => Bosses[act.ToString()];
    }

    public sealed class Config
    {
        public int COLS, ROWS, BENCH, ACTS;
        [JsonProperty("PLAYER_ROW")] public int PlayerRow;
        [JsonProperty("MAX_TEAM")] public int MaxTeam;
        [JsonProperty("ROOMS_PER_ACT")] public int RoomsPerAct;
        [JsonProperty("TOTAL_ROOMS")] public int TotalRooms;
        [JsonProperty("COOP_TOTAL_UNITS")] public int CoopTotalUnits;
        [JsonProperty("COOP_XP_DIV")] public double CoopXpDiv;
        [JsonProperty("START_GOLD")] public int StartGold;
        [JsonProperty("START_CITADEL")] public int StartCitadel;
        [JsonProperty("START_TEAM_LIMIT")] public int StartTeamLimit;
        [JsonProperty("SELL_RATIO")] public double SellRatio;
        [JsonProperty("INTEREST_RATE")] public double InterestRate;
        [JsonProperty("INTEREST_CAP")] public double InterestCap;
        [JsonProperty("XP_BASE")] public double XpBase;
        [JsonProperty("XP_GROWTH")] public double XpGrowth;
        [JsonProperty("ITEM_TIER_MULT")] public double[] ItemTierMult;
        [JsonProperty("MAX_ITEMS")] public int MaxItems;
        [JsonProperty("MAX_ITEM_TIER")] public int MaxItemTier;
        [JsonProperty("SYN_THRESHOLDS")] public int[] SynThresholds;
        [JsonProperty("ORDER_THRESHOLDS")] public int[] OrderThresholds;
        [JsonProperty("NORMAL_ITEM_DROP")] public double NormalItemDrop;
        [JsonProperty("ITEM_EVERY")] public int ItemEvery;
    }

    public sealed class BaseStats
    {
        public double MaxHp, Ad, Ap, Armor, AttackSpeed, Range, CritChance, MoveSpeed, MaxMana;
        public BaseStats Clone() => (BaseStats)MemberwiseClone();
    }

    public sealed class Archetype
    {
        public string Id, Name, Role, Color, Symbol, SignatureSkill, Pref;
        public List<string> Orders, Skills;
        public int Cost;
        public BaseStats Stats;
    }

    public sealed class Skill
    {
        public string Id, Name, Type, Icon;
        public List<string> DescByLevel;
        public bool IsActive => Type == "ativa";
    }

    public sealed class Element
    {
        public string Id, Name, Icon, Color, PersonalDesc, TiersText;
        public double[] BurnPct, ExplodePct, ManaRegen, ChillAmt, ArmorBonus, ShieldPct, AsMult, Dodge, ChainTargets, TrueDmgPct, AuraReduce, Lifesteal, CritDmg;
    }

    public sealed class OrderTier
    {
        public double HpPct, Armor, Crit, CritDmg, ApPct, ManaRegen, HealAll, StartMana, SummonMult, RegenPct, AsPct, Lifesteal, Execute, TeamShield, TrueDmg, ArmorPen;
    }

    public sealed class Order
    {
        public string Id, Kind, Name, Icon, Color, TiersText;
        public int[] Thresholds;
        public List<OrderTier> Tiers;
        public List<string> Members;
    }

    public sealed class Relic { public string Id, Name, Icon, Rarity, Desc; public bool Secret; }
    public sealed class Rarity { public string Name, Color; }
    public sealed class Item { public string Id, Name, Icon; public OrderedDict<double> Stats; }
    public sealed class Arena { public string Id, Name, Icon, Desc; }

    public sealed class Act
    {
        public string Name, Short, EnemyColor, StoryIcon;
        public List<string> Story;
        public OrderedDict<string> Palette;
        public OrderedDict<List<string>> Faction;
    }

    public sealed class Boss
    {
        public string Id, Name, Symbol, Color, Script, Mechanic;
        public OrderedDict<int> Elements, Skills;
        public double HpMult, AdMult, ApMult;
    }

    public sealed class EliteAffix { public string Id, Name, Icon, Color, Desc; }
    public sealed class NodeType { public string Name, Icon, Color, Desc, Reward; }
    public sealed class MetaUpgrade { public string Name, Icon; public int MaxLevel, BaseCost; public List<string> DescByLevel; }
    public sealed class Ascension { public int Level; public string Name, Desc; }
    public sealed class TerrainType { public string Id, Name, Icon, Desc; public bool Blocked, NoPlace; }

    public sealed class Mission
    {
        public string Id, Name, Icon, Short, Desc, Reward;
        public double Tune, Weight;
        public int[] Waves, Acts;
    }

    public sealed class Condition
    {
        public string Id, Name, Icon, Desc;
        public double Weight, Tune;
        public int Cap;
        public int[] Acts;
    }

    public sealed class Layout { public string Id, Name, Icon, Desc; public int[] Acts; }

    public sealed class ScalingMode { public string Name, Icon, Desc; public bool Recommended; }

    public sealed class Scaling
    {
        public OrderedDict<ScalingMode> Modes;
        public OrderedDict<double[]> Targets;
        public double Diff, KMin, KMax, AscPer, ThreatMin, ThreatMax, ThreatPer, RewardPer;
        public double[] CoopMult;
    }

    public sealed class Doctrine
    {
        public string Id, Short, Name, Icon, Color, Desc, Weak, Formation;
        public int MinRoom;
        public double Tune, CoopTune, Ambush, CountMult;
        public List<string> Counters, Pool, Front;
        public OrderedDict<double> Mods;
    }

    public sealed class Counter
    {
        public string Id, Short, Name, Icon, Color, Desc, Answer;
        public OrderedDict<double> Mods;
        public double Ambush, AntiHeal;
    }

    public sealed class Objective { public string Id, Icon, Name, Reward; public bool Leader; }

    public sealed class Tactic
    {
        public string Id, Name, Icon, Desc, Target;
        public OrderedDict<double> Mods;
    }

    public sealed class Trait
    {
        public string Id, Name, Icon, Desc;
        public bool Rare;
        public OrderedDict<double> Mods;
        public double CostMult, Xp, Pe;
    }

    public sealed class QuartelQuality { public int Id, Level; public string Name, Color; public double CostMult, TraitChance; public bool RareTrait; }

    public sealed class Quartel
    {
        public int Slots, RerollBase, RerollStep;
        public double ContractMult, SynergyBias;
        public List<QuartelQuality> Quality;
        public double[][] Odds;
    }

    public sealed class EnemyDefense
    {
        public double[] Hp, Armor, ArmorFlat, Magic, Elem;
        public double EliteMult, BossMult, FixedK;
    }
}
