using System;
using System.Collections.Generic;
using System.Linq;

namespace ForjaElemental.Core
{
    /// <summary>
    /// IA simples de tests/sim.js: recruta por sinergia, equipa itens, gasta PE,
    /// auto-posiciona, escolhe táticas por doutrina, caminho no mapa e escolhas.
    /// Usada pelo simulador e pelo botão "Auto" do jogo.
    /// </summary>
    public sealed class SimpleAi
    {
        static readonly string[] Order = { "vanguarda", "arcanista", "clerigo", "cacador", "paladino", "necromante", "bardo", "monge", "alquimista", "berserker", "druida", "lanceiro", "artifice", "sombra" };
        static readonly Dictionary<string, string> Tact = new Dictionary<string, string>
        {
            ["emboscada"] = "falange", ["sacerdocio"] = "retaguarda", ["artilharia"] = "retaguarda", ["ritual"] = "assalto",
            ["furia"] = "falange", ["enxame"] = "assalto", ["muralha"] = "foco"
        };
        static readonly HashSet<string> FrontPrefs = new HashSet<string> { "front", "mid", "flank" };

        readonly Expedition G;
        readonly GameData d;
        public readonly bool Smart;
        public readonly string FixTactic;

        public SimpleAi(Expedition g, string ai = null)
        {
            G = g; d = g.D;
            Smart = ai != "dumb";
            FixTactic = ai != null && d.Tactics.ContainsKey(ai) ? ai : null;
        }

        public void PrepPlayer(int pid)
        {
            var r = G.Run; r.Active = pid; var p = G.Me();
            int cap = G.CapPerPlayer();
            int guard = 0;
            while (guard++ < 14)
            {
                int mine = G.BoardOf(pid).Count;
                if (mine >= G.FieldLimit(p)) { if (p.TeamLimit < Math.Min(cap, 7)) G.SetTeamLimit(p.TeamLimit + 1); else break; }
                var mineU = G.UnitsOf(pid);
                int nf = mineU.Count(u => FrontPrefs.Contains(d.Archetypes[u.ArchetypeId].Pref));
                bool wantFront = nf < Math.Ceiling((mineU.Count + 1) * 0.4);
                var have = new HashSet<string>(mineU.Select(u => u.ArchetypeId));
                var oc = new Dictionary<string, int>();
                foreach (var u in G.AllUnits()) foreach (var o in d.Archetypes[u.ArchetypeId].Orders) oc[o] = (oc.TryGetValue(o, out var v) ? v : 0) + 1;
                double Score(string arch) =>
                    d.Archetypes[arch].Orders.Sum(o => Math.Min(3, oc.TryGetValue(o, out var v) ? v : 0)) * 1.2 + 0 * 1.5
                    + ((FrontPrefs.Contains(d.Archetypes[arch].Pref) == wantFront) ? 2.5 : 0) + (have.Contains(arch) ? 0.3 : 0);
                string best = Order.OrderByDescending(Score).First();
                if (p.Gold >= G.ContractCost(best)) { G.Buy(best); continue; }
                break;
            }
            while (p.Bag.Count > 0 && G.BoardOf(pid).Any(u => u.Items.Count < 3)) { var u = G.BoardOf(pid).First(x => x.Items.Count < 3); G.Equip(0, u.Id); }
            foreach (var u in G.UnitsOf(pid))
                while (u.EvoPoints > 0)
                {
                    var a = d.Archetypes[u.ArchetypeId];
                    string sk = a.Skills.FirstOrDefault(s => u.Skills.Get(s) < 3 && d.Skills[s].Type == "ativa" && u.Skills.Get(s) != 0) ?? a.Skills.FirstOrDefault(s => u.Skills.Get(s) < 3);
                    if (sk != null && u.Level % 2 == 0) G.UpgradeSkill(u.Id, sk);
                    else G.AddElement(u.Id, new[] { "fogo", "pedra", "agua" }[int.Parse(u.Id) % 3]);
                }
            G.AutoArrange();
        }

        /// <summary>Prepara todos os jogadores (e a tática, na fase de preparação).</summary>
        public void Prep()
        {
            if (G.Run.Phase == "PREP")
            {
                if (FixTactic != null) G.SetTactic(FixTactic);
                else if (Smart) G.SetTactic(G.Run.Doctrine != null && Tact.TryGetValue(G.Run.Doctrine, out var t) ? t : "equilibrio");
            }
            for (int i = 0; i < G.Coop(); i++) PrepPlayer(i);
            G.Run.Active = 0;
        }

        public MapNode PickNode()
        {
            var av = G.AvailableNodes();
            return av.FirstOrDefault(n => n.Type == "acampamento" && G.Run.CitadelHp < 60) ?? av.FirstOrDefault(n => n.Type != "elite") ?? av[0];
        }

        /// <summary>Resolve a escolha pendente como o simulador: loja/relatório/história pulam; senão a 1ª opção pagável.</summary>
        public void ResolvePending()
        {
            var p = G.CurrentPending();
            if (p == null) return;
            if (p.Kind == "shop" || p.Kind == "report" || p.Kind == "story") G.SkipPending();
            else { int idx = p.Options.FindIndex(o => G.OptionAffordable(o)); if (idx >= 0) G.ResolveOption(idx); else G.SkipPending(); }
        }

        /// <summary>
        /// Um passo de decisão fora do combate (escolha, mapa ou preparo + início do combate).
        /// Retorna a doutrina da sala quando começa um combate (para estatísticas), senão null.
        /// </summary>
        public string Step()
        {
            var r = G.Run;
            if (r.Phase == "CHOICE") ResolvePending();
            else if (r.Phase == "MAP") { Prep(); G.ChooseNode(PickNode().Id); }
            else if (r.Phase == "PREP") { Prep(); string doc = r.Doctrine ?? "chefe"; G.StartCombat(); return doc; }
            return null;
        }
    }
}
