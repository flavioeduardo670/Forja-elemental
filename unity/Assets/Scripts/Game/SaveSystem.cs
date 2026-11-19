using System;
using System.IO;
using ForjaElemental.Core;
using Newtonsoft.Json;
using UnityEngine;

namespace ForjaElemental.Game
{
    /// <summary>Save da expedição e da meta-progressão em JSON (Application.persistentDataPath).</summary>
    public static class SaveSystem
    {
        static string Dir => Application.persistentDataPath;
        static string MetaPath => Path.Combine(Dir, "forja_meta.json");
        static string RunPath => Path.Combine(Dir, "forja_run.json");
        static readonly JsonSerializerSettings Settings = new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore };

        public static Meta LoadMeta(GameData d)
        {
            try { if (File.Exists(MetaPath)) return JsonConvert.DeserializeObject<Meta>(File.ReadAllText(MetaPath), Settings) ?? Meta.Default(d); }
            catch (Exception e) { Debug.LogWarning("[save] meta inválida: " + e.Message); }
            return Meta.Default(d);
        }

        public static void SaveMeta(Meta m) { try { File.WriteAllText(MetaPath, JsonConvert.SerializeObject(m, Settings)); } catch (Exception e) { Debug.LogWarning("[save] " + e.Message); } }

        public static bool HasRun => File.Exists(RunPath);

        public static void SaveRun(Run r)
        {
            try
            {
                if (r == null || r.Phase == "END") { if (File.Exists(RunPath)) File.Delete(RunPath); return; }
                if (r.Phase == "COMBAT") return; // salvo antes do combate, como no JS
                File.WriteAllText(RunPath, JsonConvert.SerializeObject(r, Settings));
            }
            catch (Exception e) { Debug.LogWarning("[save] " + e.Message); }
        }

        public static Run LoadRun()
        {
            try
            {
                if (!File.Exists(RunPath)) return null;
                var r = JsonConvert.DeserializeObject<Run>(File.ReadAllText(RunPath), Settings);
                if (r == null || r.V != 5) return null;
                if (r.Phase == "COMBAT") r.Phase = "PREP";
                foreach (var p in r.Players) p.Ready = false;
                return r;
            }
            catch (Exception e) { Debug.LogWarning("[save] expedição inválida: " + e.Message); return null; }
        }

        public static void DeleteRun() { try { if (File.Exists(RunPath)) File.Delete(RunPath); } catch { } }
    }
}
