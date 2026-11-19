using System.Collections.Generic;

namespace ForjaElemental.Core
{
    /* Estado serializável da expedição (G.run e G.meta em js/game.js). */

    public sealed class Offer
    {
        public string Arch, Trait, El;
        public int Quality, Cost;
        public bool Locked;
    }

    public sealed class Player
    {
        public int Id, Gold, TeamLimit, Recruited, Kills, Rerolls;
        public string Name, Color;
        public double Dmg, Heal;
        public bool Ready;
        public List<UnitDef> Bench = new List<UnitDef>();
        public List<ItemRef> Bag = new List<ItemRef>();
        public List<Offer> Offers = new List<Offer>();
    }

    public sealed class StructureSpec { public string Structure, Team, Name; public double X, Y, Radius; }

    public sealed class ScaleInfo { public string Mode; public double Pp, Ep0, K = 1, Ep, Ratio; public double? Target; }

    public sealed class IntelCounter { public string Id, Why; }

    public sealed class Intel
    {
        public List<IntelCounter> Counters = new List<IntelCounter>();
        public double AntiHeal;
        public string HuntId, HuntName;
    }

    public sealed class ObjectiveReward { public string Kind, Text; public double Amount; public int Tier; }

    public sealed class RunObjective { public string Id; public double? P; public ObjectiveReward Reward; }

    public sealed class RunStats { public int Kills, Elites, Bosses, Combats, Wins, Losses, GoldEarned, Objectives; }

    public sealed class RunFlags { public bool Galinha; public int EggWins; }

    public sealed class RecruitFx { public string Arch; public int Level; }

    /// <summary>Efeitos de uma escolha (applyEffects). Zero/null = sem efeito, como no JS.</summary>
    public sealed class Effects
    {
        public int Gold, Gamble, Citadel, CitadelMax, RandomItem, XpSplit, EvoTop, ElementTopN;
        public string Relic, Secret, RandomRelic, ElementAll, ElementTop;
        public ItemRef Item;
        public bool UpgradeItem;
        public RecruitFx Recruit;
    }

    public sealed class ChoiceOption
    {
        public string Icon, Title, Desc, Tag, Rarity, Buyer;
        public int Cost, Price;
        public bool Sold;
        public Effects Effects = new Effects();
    }

    public sealed class GoldReward { public int Pid, Base, Interest, Trans, Total, Now; }
    public sealed class XpReward { public int Pid, Each, N; }
    public sealed class ItemReward { public int Pid; public ItemRef Item; public string Label; }
    public sealed class ExtraLine { public string Icon, Text; public bool Dim; }
    public sealed class CitadelChange { public int Delta, Hp, Max; }
    public sealed class ThreatChange { public int Before, After; public string Why; }
    public sealed class ObjectiveResult { public string Id, Text, Reward; public bool Done, Won; }

    public sealed class UnitProgress
    {
        public string Id, ArchetypeId, Name, Symbol, Color;
        public int Quality, Owner, LvlBefore, XpBefore, NextBefore, LvlAfter, XpAfter, NextAfter, Pe;
    }

    public sealed class Rewards
    {
        public bool Won;
        public double Mult;
        public int KillXp;
        public string Relic;
        public List<GoldReward> Gold = new List<GoldReward>();
        public List<XpReward> Xp = new List<XpReward>();
        public List<ItemReward> Items = new List<ItemReward>();
        public List<ExtraLine> Extras = new List<ExtraLine>();
        public List<UnitProgress> Units = new List<UnitProgress>();
        public CitadelChange Citadel;
        public ThreatChange Threat;
        public ObjectiveResult Objective;
    }

    /// <summary>Item da fila de escolhas: história, escolha, loja ou relatório.</summary>
    public sealed class Pending
    {
        public string Kind, Title, Subtitle, Icon, Button;
        public int? Pid;
        public bool AllowSkip, Secret, Tutorial, Won, Final;
        public double Time;
        public List<ChoiceOption> Options, Offers;
        public List<string> Paragraphs, Lines, LevelUps;
        public List<CombatReportRow> Report;
        public Rewards Rewards;
    }

    public sealed class RunEnd { public bool Victory, Unlocked; public int Shards; public List<CombatReportRow> Report; }

    public sealed class Run
    {
        public int V = 5;
        public string Seed, Daily;
        public uint RngState;
        public int Ascension, Act = 1, Room, Attempt, CitadelHp, CitadelMax, NextUnitId = 1, Active, Turn, Threat, CapPenalty, NormalWins;
        public string NodeId, RoomType = "combate", Affix = "padrao", Phase = "MAP", AfterPending = "MAP", Terrain, Layout = "planicie";
        public string Scaling = "dinamica", Tactic = "equilibrio", Doctrine, LastDoctrine, Mission, Cond;
        public bool NoLoss = true;
        public List<string> Visited = new List<string>(), Relics = new List<string>(), RoomTypesSeen = new List<string>();
        public ActMap Map;
        public List<UnitDef> Enemies = new List<UnitDef>(), Board = new List<UnitDef>();
        public List<Player> Players = new List<Player>();
        public List<Pending> Pending = new List<Pending>();
        public List<StructureSpec> Structures = new List<StructureSpec>();
        public RunStats Stats = new RunStats();
        public RunFlags Flags = new RunFlags();
        public RunEnd Ended;
        public ScaleInfo Scale;
        public Intel Intel;
        public RunObjective Objective;
    }

    public sealed class MetaRecords { public int Runs, Wins, BestRoom, Kills, BestWinAscension = -1, CoopRuns, CoopWins; }
    public sealed class MetaLifetime { public List<string> Recruited = new List<string>(), TerrainsWon = new List<string>(); public int BossesKilled; }
    public sealed class DailyRecord { public int Room, Tries; public bool Win; }

    public sealed class Meta
    {
        public int V = 2, AstralShards, MaxAscension;
        public bool MigratedV1, SeenTutorial;
        public OrderedDict<int> Upgrades = new OrderedDict<int>();
        public MetaRecords Records = new MetaRecords();
        public OrderedDict<bool> Ach = new OrderedDict<bool>();
        public OrderedDict<int> Secrets = new OrderedDict<int>();
        public OrderedDict<DailyRecord> DailyRecords = new OrderedDict<DailyRecord>();
        public MetaLifetime Lifetime = new MetaLifetime();

        public static Meta Default(GameData d)
        {
            var m = new Meta();
            foreach (var k in d.MetaUpgrades.Keys) m.Upgrades[k] = 0;
            return m;
        }
    }
}
