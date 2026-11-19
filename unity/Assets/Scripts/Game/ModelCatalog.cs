using System;
using System.Collections.Generic;
using ForjaElemental.Core;
using UnityEngine;

namespace ForjaElemental.Game
{
    /// <summary>Prefabs dos modelos por chave (gerado por Forja Elemental ▸ Montar modelos).</summary>
    [CreateAssetMenu(menuName = "Forja Elemental/Catálogo de modelos")]
    public sealed class ModelCatalog : ScriptableObject
    {
        [Serializable] public struct Entry { public string key; public GameObject prefab; }
        public List<Entry> entries = new List<Entry>();
        Dictionary<string, GameObject> map;

        public GameObject Get(string key)
        {
            if (map == null) { map = new Dictionary<string, GameObject>(); foreach (var e in entries) if (e.prefab) map[e.key] = e.prefab; }
            return key != null && map.TryGetValue(key, out var p) ? p : null;
        }

        static readonly Dictionary<string, string> AvatarByName = new Dictionary<string, string>
        {
            ["Fogo"] = "fogo", ["Água"] = "agua", ["Pedra"] = "pedra", ["Ar"] = "ar", ["Solar"] = "solar", ["Lunar"] = "lunar"
        };

        /// <summary>Chave do modelo de uma unidade (equivale a FE.Art.keyOf + time).</summary>
        public GameObject For(string archetypeId, bool player, bool isBoss, string script, bool isSummon, string name, string structure)
        {
            string team = player ? "_p" : "_e";
            if (structure != null) return Get(structure);
            if (isBoss) return Get("b_" + (script ?? "colosso")) ?? Get("b_colosso");
            if (isSummon)
            {
                string n = name ?? "";
                if (n.StartsWith("Torreta")) return Get("s_torreta" + team) ?? Get("s_torreta_p");
                if (n.StartsWith("Lobo")) return Get("s_lobo" + team) ?? Get("s_lobo_p");
                if (n.StartsWith("Esqueleto")) return Get("s_esqueleto" + team) ?? Get("s_esqueleto_p");
                if (n.StartsWith("Cria")) return Get("s_cria_e");
                foreach (var kv in AvatarByName) if (n.EndsWith(kv.Key)) return Get("s_avatar_" + kv.Value);
                return Get("s_avatar_fogo");
            }
            return Get(archetypeId + team) ?? Get("vanguarda" + team);
        }

        public GameObject For(Combatant c) => For(c.ArchetypeId, c.Team == "player", c.IsBoss, c.Script, c.IsSummon, c.Name, c.Structure);
    }
}
