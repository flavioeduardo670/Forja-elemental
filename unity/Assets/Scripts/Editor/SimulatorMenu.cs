using System;
using System.IO;
using ForjaElemental.Core;
using UnityEditor;
using UnityEngine;

namespace ForjaElemental.EditorTools
{
    /// <summary>
    /// Simulador de balanceamento no Editor (equivale a tests/sim.js).
    /// Menu: Forja Elemental ▸ Simular expedições.
    /// Linha de comando: unity run unity -- -executeMethod ForjaElemental.EditorTools.SimulatorMenu.RunFromCommandLine -simArgs "30 0 1 dinamica"
    /// </summary>
    public static class SimulatorMenu
    {
        static GameData LoadData() => GameData.Load(File.ReadAllText(Path.Combine(Application.dataPath, "Resources", "Data", "forja-data.json")));

        [MenuItem("Forja Elemental/Simular expedições (30, solo, Dinâmica)")]
        public static void RunDefault() => Run(new[] { "30", "0", "1", "dinamica" });

        public static void RunFromCommandLine()
        {
            var args = Environment.GetCommandLineArgs();
            int i = Array.IndexOf(args, "-simArgs");
            Run(i >= 0 && i + 1 < args.Length ? args[i + 1].Split(' ', StringSplitOptions.RemoveEmptyEntries) : new string[0]);
        }

        static void Run(string[] a)
        {
            int runs = a.Length > 0 ? int.Parse(a[0]) : 30, asc = a.Length > 1 ? int.Parse(a[1]) : 0, players = a.Length > 2 ? int.Parse(a[2]) : 1;
            string scaling = a.Length > 3 ? a[3] : "dinamica", ai = a.Length > 4 ? a[4] : null;
            var t0 = DateTime.Now;
            var sum = ExpeditionSim.Run(LoadData(), runs, asc, players, scaling, ai);
            foreach (var e in sum.ErrorMessages) Debug.LogError(e);
            Debug.Log($"[sim] {sum.ToJson()}  ({(DateTime.Now - t0).TotalSeconds:0.0}s)");
        }
    }
}
