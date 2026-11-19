using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace ForjaElemental.Core
{
    public sealed partial class Expedition
    {
        /* ---------------- Descrição de itens (descFor) ---------------- */
        static string Fmt(double v, int dec) => v.ToString("F" + dec, CultureInfo.InvariantCulture);
        static string R0(double v) => JsMath.Round(v).ToString(CultureInfo.InvariantCulture);

        public string StatText(string k, double v)
        {
            string label = D.StatLabels.Get(k);
            if (label == null) return "";
            string val = k switch
            {
                "ad" or "ap" or "maxHp" or "armor" or "startMana" or "manaRefund" or "initialShield" or "manaPerAttack" => "+" + R0(v),
                "dmgReduction" => R0(Math.Min(0.6, v) * 100) + "%",
                "thorns" => R0(v * 100) + "%",
                "moveSpeed" or "manaRegen" or "range" => "+" + Fmt(v, 1),
                "regenPct" => Fmt(v * 100, 1) + "% HP/s",
                _ => "+" + R0(v * 100) + "%"
            };
            return $"{val} {label}";
        }

        public string ItemDesc(string id, int tier = 1)
        {
            var it = D.Items[id];
            double m = tier >= 1 && tier <= C.ItemTierMult.Length ? C.ItemTierMult[tier - 1] : 1;
            return string.Join(", ", it.Stats.Select(kv => StatText(kv.Key, kv.Value * m)).Where(s => s.Length > 0));
        }

        /* ---------------- Relíquias ---------------- */
        List<Relic> RelicPool(string source)
        {
            var owned = new HashSet<string>(Run.Relics);
            var pool = D.Relics.Values.Where(x => !owned.Contains(x.Id) && !x.Secret).ToList();
            var w = source == "boss" ? new OrderedDict<double> { ["comum"] = 20, ["rara"] = 55, ["lendaria"] = 25 }
                : source == "start" ? new OrderedDict<double> { ["comum"] = 70, ["rara"] = 30, ["lendaria"] = 0 }
                : new OrderedDict<double> { ["comum"] = 58, ["rara"] = 34, ["lendaria"] = 8 };
            return WithRng(rng =>
            {
                var picks = new List<Relic>();
                for (int i = 0; i < 3 && pool.Count > 0; i++)
                {
                    var avail = w.Keys.Where(k => w[k] > 0 && pool.Any(p => p.Rarity == k)).ToList();
                    if (avail.Count == 0) break;
                    string rar = rng.Weighted(avail.Select(k => (k, w[k])).ToList());
                    var pick = rng.Pick(pool.Where(p => p.Rarity == rar).ToList());
                    picks.Add(pick); pool.Remove(pick);
                }
                return picks;
            });
        }

        Pending MakeRelicChoice(string source)
        {
            var picks = RelicPool(source);
            return new Pending
            {
                Kind = "choice", Pid = NextChooser(),
                Title = source == "boss" ? "👑 Tesouro do Chefe — Escolha 1 Relíquia" : source == "start" ? "🏺 Herança Arcana — Relíquia Inicial" : "💀 Tesouro de Elite — Escolha 1 Relíquia",
                Subtitle = $"Relíquias valem para {(IsCoop() ? "todo o grupo" : "a expedição inteira")}.",
                Options = picks.Select(p => new ChoiceOption { Icon = p.Icon, Title = p.Name, Desc = p.Desc, Tag = D.Rarity[p.Rarity].Name, Rarity = p.Rarity, Effects = new Effects { Relic = p.Id } }).ToList(),
                AllowSkip = true
            };
        }

        UnitDef TopUnit(int? pid)
        {
            UnitDef PickTop(List<UnitDef> l) => l.OrderByDescending(u => u.Level).ThenByDescending(u => u.Xp).FirstOrDefault();
            var list = pid == null ? AllUnits() : UnitsOf(pid.Value);
            return PickTop(list) ?? PickTop(AllUnits());
        }

        List<ItemRef> ItemsOf(int pid) => P(pid).Bag.Concat(UnitsOf(pid).SelectMany(u => u.Items)).ToList();

        void AddRelic(string id, int pid)
        {
            var r = Run;
            if (r.Relics.Contains(id)) return;
            r.Relics.Add(id);
            Log($"🏺 Relíquia obtida: {D.Relics[id].Name}!", "level");
            if (id == "tomo_evolucao") { var u = TopUnit(pid); if (u != null) u.EvoPoints++; }
            if (id == "coracao_forja")
            {
                string it = WithRng(rng => rng.Pick(D.Items.Keys.ToList()));
                P(pid).Bag.Add(new ItemRef { Id = it, Tier = 1 });
                Toast($"Coração da Forja criou: {D.Items[it].Name}!", "success");
            }
        }

        /* ---------------- Eventos das salas sem combate ---------------- */
        static ChoiceOption Opt(string icon, string title, string desc, string tag, Effects fx, int cost = 0) =>
            new ChoiceOption { Icon = icon, Title = title, Desc = desc, Tag = tag, Effects = fx ?? new Effects(), Cost = cost };

        Pending Choice(string title, string subtitle, List<ChoiceOption> opts, bool secret = false) =>
            new Pending { Kind = "choice", Title = title, Subtitle = subtitle, Options = opts, Secret = secret };

        Pending BuildEvent(string type, Rng rng)
        {
            var r = Run; int a = r.Act; double gf = GoldFactor();
            int G(double v) => (int)JsMath.Round(v * gf);
            var itemKeys = D.Items.Keys.ToList();
            string cada = IsCoop() ? "cada jogador" : "você";
            if (type == "forja")
            {
                var opts = rng.Shuffle(itemKeys).Take(3).ToList().Select(id =>
                {
                    int tier = a >= 3 && rng.Chance(0.4) ? 2 : 1;
                    var it = D.Items[id];
                    return Opt(it.Icon, $"{it.Name} ★{tier}", ItemDesc(id, tier), "Forjar", new Effects { Item = new ItemRef { Id = id, Tier = tier } });
                }).ToList();
                opts.Add(Opt("🔨", "Aprimorar Equipamento", "Eleva em +1 tier o seu item de menor tier (equipado ou na mochila).", "Aprimorar", new Effects { UpgradeItem = true }));
                return Choice("⚒️ Forja Rúnica", "O ferreiro ancestral oferece seu trabalho.", opts);
            }
            if (type == "santuario")
            {
                var el = D.Elements[rng.Pick(D.Elements.Keys.ToList())];
                return Choice("🔮 Santuário Elemental", "Os espíritos oferecem poder em troca de devoção.", new List<ChoiceOption>
                {
                    Opt(el.Icon, $"Infusão de {el.Name}", $"Todas as unidades em campo recebem +1 stack de {el.Name}.", "Sinergia em massa", new Effects { ElementAll = el.Id }),
                    Opt("⭐", "Despertar do Líder", "Sua unidade de maior nível ganha +2 Pontos de Evolução.", "+2 PE", new Effects { EvoTop = 2 }),
                    Opt("🩸", "Pacto de Sangue", $"Sacrifique 15 de Cidadela: +{G(80 + a * 15)}g para {cada}.", "Risco", new Effects { Citadel = -15, Gold = 80 + a * 15 })
                });
            }
            if (type == "acampamento")
            {
                return Choice("🏕️ Acampamento", "Um momento de descanso antes da próxima batalha.", new List<ChoiceOption>
                {
                    Opt("❤️", "Reparar Muralhas", $"Restaura +{20 + a * 5} de Cidadela.", "Recuperação", new Effects { Citadel = 20 + a * 5 }),
                    Opt("⚔️", "Treinamento Intensivo", $"+{160 + a * 60} XP divididos entre as unidades em campo{(IsCoop() ? " de cada jogador" : "")}.", "XP", new Effects { XpSplit = 160 + a * 60 }),
                    Opt("🪙", "Saquear Suprimentos", $"+{G(55 + a * 15)}g para {cada}.", "Ouro", new Effects { Gold = 55 + a * 15 })
                });
            }
            if (type == "mercador")
            {
                double disc = 1 - 0.05 * Meta.Upgrades.Get("contatos");
                int Price(double p) => (int)JsMath.Round(p * disc);
                var offers = rng.Shuffle(itemKeys).Take(2 + Coop()).ToList().Select(id =>
                {
                    int tier = rng.Chance(a * 0.13) ? 2 : 1;
                    var it = D.Items[id];
                    return new ChoiceOption { Icon = it.Icon, Title = $"{it.Name} ★{tier}", Desc = ItemDesc(id, tier), Price = Price(tier == 2 ? 130 : 70), Effects = new Effects { Item = new ItemRef { Id = id, Tier = tier } } };
                }).ToList();
                var rp = D.Relics.Values.Where(x => !r.Relics.Contains(x.Id) && !x.Secret).ToList();
                if (rp.Count > 0)
                {
                    var rel = rng.Pick(rp);
                    int rprice = rel.Rarity == "comum" ? 120 : rel.Rarity == "rara" ? 170 : 240;
                    offers.Add(new ChoiceOption { Icon = rel.Icon, Title = rel.Name, Desc = rel.Desc, Tag = D.Rarity[rel.Rarity].Name, Rarity = rel.Rarity, Price = Price(rprice), Effects = new Effects { Relic = rel.Id } });
                }
                offers.Add(new ChoiceOption { Icon = "🧱", Title = "Pedreiros", Desc = "Repara +20 de Cidadela.", Price = Price(45), Effects = new Effects { Citadel = 20 } });
                offers.Add(new ChoiceOption { Icon = "📜", Title = "Pergaminho de Evolução", Desc = "+1 PE para a sua unidade de maior nível.", Price = Price(90), Effects = new Effects { EvoTop = 1 } });
                return new Pending { Kind = "shop", Title = "🛒 Mercador Errante", Subtitle = IsCoop() ? "Cada jogador compra com o próprio ouro (troque o comprador acima)." : "Compre quantas ofertas quiser e depois siga viagem.", Offers = offers };
            }
            // Mistério — eventos raros secretos primeiro
            if (!HasRelic("pato_borracha") && rng.Chance(0.07))
                return Choice("❓ Lago Silencioso", "No meio de um lago perfeitamente calmo, algo amarelo flutua e encara você.", new List<ChoiceOption>
                {
                    Opt("🦆", "Conversar com o pato", "Você explica todos os seus problemas a ele. Ele não responde. Você se sente estranhamente melhor.", "???", new Effects { Relic = "pato_borracha", Secret = "pato" }),
                    Opt("🚶", "Ignorar o pato", "Patos de borracha não são confiáveis.", "Ignorar", null)
                }, true);
            if (!HasRelic("ovo_dourado") && !HasRelic("pintinho_dourado") && rng.Chance(0.07))
                return Choice("❓ Ninho Abandonado", "Entre galhos queimados, um ovo dourado ainda está morno.", new List<ChoiceOption>
                {
                    Opt("🥚", "Levar o ovo", "Talvez algo nasça dele se você continuar vencendo...", "???", new Effects { Relic = "ovo_dourado" }),
                    Opt("🍳", "Fazer um omelete", "+25 de Cidadela. Seus soldados agradecem.", "Recuperação", new Effects { Citadel = 25 })
                }, true);
            var events = new List<Func<Pending>>
            {
                () => Choice("❓ Altar Quebrado", "Uma relíquia brilha entre pedras rachadas. Um tributo parece necessário.", new List<ChoiceOption>
                {
                    Opt("🏺", "Pagar o tributo (60g)", "Receba uma relíquia comum aleatória.", "Relíquia", new Effects { Gold = -60, RandomRelic = "comum" }, 60),
                    Opt("🚶", "Seguir viagem", "Nada acontece.", "Ignorar", null)
                }),
                () =>
                {
                    string arch = rng.Pick(D.Archetypes.Keys.ToList()); var A = D.Archetypes[arch];
                    return Choice("❓ Mercenário Ferido", $"Um {A.Name} ferido pede abrigo.", new List<ChoiceOption>
                    {
                        Opt(A.Symbol, "Acolher no grupo", $"Recebe um {A.Name} Nível {1 + a} gratuitamente (vai ao banco).", "Unidade grátis", new Effects { Recruit = new RecruitFx { Arch = arch, Level = 1 + a } }),
                        Opt("🪙", "Pedir pagamento", $"Ele paga {G(30 + a * 10)}g {(IsCoop() ? "a cada jogador" : "")}.", "Ouro", new Effects { Gold = 30 + a * 10 })
                    });
                },
                () =>
                {
                    var els = rng.Shuffle(D.Elements.Keys).Take(2).ToList();
                    return Choice("❓ Fonte Elemental", "Duas correntes de energia se cruzam numa fonte antiga.", els.Select(el =>
                        Opt(D.Elements[el].Icon, $"Banhar-se em {D.Elements[el].Name}", $"Sua unidade de maior nível recebe +2 stacks de {D.Elements[el].Name}.", "Elemento", new Effects { ElementTop = el, ElementTopN = 2 })).ToList());
                },
                () =>
                {
                    string id = rng.Pick(itemKeys);
                    return Choice("❓ Baú Amaldiçoado", "Um baú pulsa com energia sombria.", new List<ChoiceOption>
                    {
                        Opt(D.Items[id].Icon, "Abrir (−12 Cidadela)", $"Receba {D.Items[id].Name} ★2.", "Risco", new Effects { Citadel = -12, Item = new ItemRef { Id = id, Tier = 2 } }),
                        Opt("🚶", "Deixar fechado", "Prudência.", "Ignorar", null)
                    });
                },
                () => Choice("❓ Biblioteca Esquecida", "Tomos antigos sobre táticas elementais.", new List<ChoiceOption>
                {
                    Opt("📖", "Estudar a fundo", "Sua unidade de maior nível ganha +1 PE.", "+1 PE", new Effects { EvoTop = 1 }),
                    Opt("📚", "Leitura em grupo", $"+{120 + a * 50} XP divididos entre o campo.", "XP", new Effects { XpSplit = 120 + a * 50 })
                }),
                () => Choice("❓ Ferreiro Itinerante", "Um ferreiro anão oferece seus serviços.", new List<ChoiceOption>
                {
                    Opt("🔨", "Aprimorar (50g)", "Eleva +1 tier o seu item de menor tier.", "Aprimorar", new Effects { Gold = -50, UpgradeItem = true }, 50),
                    Opt("🎁", "Comprar sucata (25g)", "Receba 1 item ★1 aleatório.", "Item", new Effects { Gold = -25, RandomItem = 1 }, 25),
                    Opt("🚶", "Recusar", "Seguir viagem.", "Ignorar", null)
                }),
                () => Choice("❓ Taverna à Beira da Estrada", "Bardos cantam sobre a Forja. Um velho aposta que ninguém vence seu jogo de dados.", new List<ChoiceOption>
                {
                    Opt("🎲", "Apostar 40g", "Se vencer, recebe 100g. O velho parece confiante demais...", "Sorte", new Effects { Gold = -40, Gamble = 100 }, 40),
                    Opt("🍺", "Pagar uma rodada (20g)", "As unidades em campo recebem XP de moral.", "XP", new Effects { Gold = -20, XpSplit = 100 + a * 40 }, 20),
                    Opt("🚶", "Seguir viagem", "A estrada chama.", "Ignorar", null)
                }),
                () => Choice("❓ Estátua Chorosa", "Uma estátua de um antigo ferreiro verte lágrimas de metal derretido.", new List<ChoiceOption>
                {
                    Opt("🛡️", "Recolher o metal", "Receba um item ★1 aleatório.", "Item", new Effects { RandomItem = 1 }),
                    Opt("🙏", "Fazer uma prece", "+10 de Vida Máxima da Cidadela (e cura 10).", "Cidadela", new Effects { CitadelMax = 10 })
                })
            };
            return rng.Pick(events)();
        }

        /* Efeitos de escolhas. pid = jogador que decidiu; ouro positivo vai para TODOS no co-op. */
        void ApplyEffects(Effects fx, int pid)
        {
            var r = Run; var chooser = P(pid);
            if (fx.Gold != 0)
            {
                if (fx.Gold > 0) { int v = (int)JsMath.Round(fx.Gold * GoldFactor()); foreach (var p in r.Players) p.Gold += v; Log($"🪙 +{v}g{(IsCoop() ? " para cada jogador" : "")}.", "gold"); }
                else chooser.Gold = Math.Max(0, chooser.Gold + fx.Gold);
            }
            if (fx.Gamble != 0)
            {
                bool win = WithRng(rng => rng.Chance(0.45));
                if (win) { chooser.Gold += fx.Gamble; Log($"🎲 {chooser.Name} venceu a aposta! +{fx.Gamble}g.", "gold"); Toast("🎲 Você venceu a aposta!", "success"); }
                else { Log("🎲 O velho sorri e embolsa o ouro.", "danger"); Toast("🎲 Perdeu a aposta...", "error"); }
            }
            if (fx.Citadel != 0)
            {
                r.CitadelHp = fx.Citadel > 0 ? Math.Min(r.CitadelMax, r.CitadelHp + fx.Citadel) : Math.Max(1, r.CitadelHp + fx.Citadel);
                Log($"🏰 Cidadela {(fx.Citadel > 0 ? "+" : "")}{fx.Citadel} ({r.CitadelHp}/{r.CitadelMax}).", fx.Citadel > 0 ? "win" : "danger");
            }
            if (fx.CitadelMax != 0) { r.CitadelMax += fx.CitadelMax; r.CitadelHp += fx.CitadelMax; Log($"🏰 Muralhas reforçadas: Vida Máxima {r.CitadelMax}.", "win"); }
            if (fx.Relic != null) AddRelic(fx.Relic, pid);
            if (fx.Secret != null) Secret(fx.Secret);
            if (fx.RandomRelic != null)
            {
                var pool = D.Relics.Values.Where(x => x.Rarity == fx.RandomRelic && !r.Relics.Contains(x.Id) && !x.Secret).ToList();
                if (pool.Count > 0) AddRelic(WithRng(rng => rng.Pick(pool)).Id, pid);
            }
            if (fx.Item != null) { chooser.Bag.Add(fx.Item.Clone()); Log($"🎒 {D.Items[fx.Item.Id].Name} ★{fx.Item.Tier} na mochila{(IsCoop() ? " de " + chooser.Name : "")}.", "gold"); }
            if (fx.RandomItem != 0) { string id = WithRng(rng => rng.Pick(D.Items.Keys.ToList())); chooser.Bag.Add(new ItemRef { Id = id, Tier = fx.RandomItem }); Log($"🎒 {D.Items[id].Name} na mochila.", "gold"); }
            if (fx.UpgradeItem)
            {
                var items = ItemsOf(pid).Where(i => i.Tier < C.MaxItemTier).OrderBy(i => i.Tier).ToList();
                if (items.Count == 0) { string id = WithRng(rng => rng.Pick(D.Items.Keys.ToList())); chooser.Bag.Add(new ItemRef { Id = id, Tier = 1 }); Log($"🔨 Sem itens para aprimorar: o ferreiro forjou {D.Items[id].Name}.", "gold"); }
                else { items[0].Tier++; Log($"🔨 {D.Items[items[0].Id].Name} aprimorado para ★{items[0].Tier}.", "gold"); }
            }
            if (fx.XpSplit != 0)
            {
                foreach (var p in r.Players)
                {
                    var mine = BoardOf(p.Id); if (mine.Count == 0) continue;
                    int per = (int)Math.Floor(fx.XpSplit * XpShare() / mine.Count);
                    foreach (var u in mine) GrantXp(u, per);
                }
                Log("📘 XP distribuído entre as unidades em campo.", "level");
            }
            if (fx.EvoTop != 0) { var u = TopUnit(pid); if (u != null) { u.EvoPoints += fx.EvoTop; Log($"⭐ {u.Name} +{fx.EvoTop} PE.", "level"); } }
            if (fx.ElementAll != null) { foreach (var u in r.Board) u.Elements[fx.ElementAll] = u.Elements.Get(fx.ElementAll) + 1; Log($"🔮 +1 {D.Elements[fx.ElementAll].Name} em todo o campo.", "level"); }
            if (fx.ElementTop != null)
            {
                var u = TopUnit(pid); int n = fx.ElementTopN != 0 ? fx.ElementTopN : 1;
                if (u != null) { u.Elements[fx.ElementTop] = u.Elements.Get(fx.ElementTop) + n; Log($"💠 {u.Name} +{n} {D.Elements[fx.ElementTop].Name}.", "level"); }
            }
            if (fx.Recruit != null)
            {
                int slot = FreeBench(chooser);
                if (slot == -1) { chooser.Gold += 40; Log("Banco cheio: o mercenário deixou 40g.", "gold"); }
                else
                {
                    var arch = D.Archetypes[fx.Recruit.Arch]; int id = r.NextUnitId++;
                    var u = new UnitDef { Id = id.ToString(), Owner = chooser.Id, ArchetypeId = arch.Id, Name = $"{arch.Name} #{id}", Cost = arch.Cost, Level = fx.Recruit.Level, EvoPoints = fx.Recruit.Level - 1, Col = -1, Row = -1 };
                    u.Skills[arch.SignatureSkill] = 1;
                    chooser.Bench[slot] = u;
                    Log($"🤝 {arch.Name} juntou-se a {chooser.Name}.", "level");
                }
            }
        }

        /* ---------------- Fila de escolhas ---------------- */
        public Pending CurrentPending() => Run != null && Run.Pending.Count > 0 ? Run.Pending[0] : null;
        public Player PendingChooser() { var p = CurrentPending(); return p != null && p.Pid != null ? P(p.Pid.Value) : Me(); }
        public bool OptionAffordable(ChoiceOption opt, Player payer = null)
        {
            var p = payer ?? PendingChooser();
            return !(opt.Cost != 0 && p.Gold < opt.Cost) && !(opt.Price != 0 && p.Gold < opt.Price);
        }

        public void ResolveOption(int i)
        {
            var r = Run; var p = CurrentPending();
            if (p == null) return;
            if (p.Kind == "shop")
            {
                var o = i >= 0 && i < p.Offers.Count ? p.Offers[i] : null; var buyer = Me();
                if (o == null || o.Sold) return;
                if (buyer.Gold < o.Price) { Toast("Ouro insuficiente.", "error"); return; }
                buyer.Gold -= o.Price; o.Sold = true; o.Buyer = buyer.Name; ApplyEffects(o.Effects, buyer.Id); Sfx("buy");
                Changed(); return;
            }
            if (p.Kind == "choice")
            {
                var o = i >= 0 && i < p.Options.Count ? p.Options[i] : null;
                if (o == null || !OptionAffordable(o)) { Toast("Requisito não atendido.", "error"); return; }
                ApplyEffects(o.Effects ?? new Effects(), p.Pid ?? r.Active); Sfx("levelUp");
            }
            NextPending();
        }

        public void SkipPending() => NextPending();

        void NextPending()
        {
            var r = Run;
            var done = r.Pending.Count > 0 ? r.Pending[0] : null;
            if (done != null) r.Pending.RemoveAt(0);
            if (done != null && done.Final) { EndRun(true, done.Report); return; }
            if (r.Pending.Count == 0)
            {
                r.Phase = r.AfterPending ?? "MAP";
                if (r.Phase == "PREP" && TotalEvo() > 0) OnOpenEvo?.Invoke();
            }
            Ach("state"); Changed();
        }
    }
}
