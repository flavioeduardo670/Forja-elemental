using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace ForjaElemental.EditorTools
{
    /// <summary>
    /// Importação dos modelos gerados por blender/build_models.py e montagem
    /// do Animator e dos prefabs.
    /// Menu: Forja Elemental ▸ Montar modelos (ou -executeMethod ForjaElemental.EditorTools.ArtPipeline.BuildAll).
    /// </summary>
    public class ArtPipeline : AssetPostprocessor
    {
        public const string ModelsDir = "Assets/Art/Models";
        public const string MaterialPath = "Assets/Art/Materials/ForjaVertexColor.mat";
        public const string ControllerPath = "Assets/Art/Animation/Boneco.controller";
        public const string PrefabsDir = "Assets/Art/Prefabs";
        public const string OverridesDir = "Assets/Art/Animation/Overrides";
        public static readonly string[] Clips = { "Idle", "Walk", "Attack", "Cast", "Hit", "Stunned", "Victory", "Die" };
        static readonly HashSet<string> Looping = new HashSet<string> { "Idle", "Walk", "Stunned", "Victory" };

        bool IsOurs => assetPath.StartsWith(ModelsDir + "/");
        bool IsStructure => assetPath.StartsWith(ModelsDir + "/Structures/");

        void OnPreprocessModel()
        {
            if (!IsOurs) return;
            var mi = (ModelImporter)assetImporter;
            mi.globalScale = 1; mi.useFileScale = true;
            mi.importNormals = ModelImporterNormals.Import;
            mi.importTangents = ModelImporterTangents.None;
            mi.importBlendShapes = false; mi.importCameras = false; mi.importLights = false;
            mi.isReadable = false;
            mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            mi.animationType = IsStructure ? ModelImporterAnimationType.None : ModelImporterAnimationType.Generic;
            mi.importAnimation = !IsStructure;
            mi.resampleCurves = true;
            mi.animationCompression = ModelImporterAnimationCompression.Optimal;
        }

        void OnPreprocessAnimation()
        {
            if (!IsOurs || IsStructure) return;
            var mi = (ModelImporter)assetImporter;
            var clips = mi.defaultClipAnimations;
            foreach (var c in clips)
            {
                string n = c.name.Contains("|") ? c.name.Substring(c.name.LastIndexOf('|') + 1) : c.name;
                c.name = n;
                c.loopTime = Looping.Contains(n);
                c.loopPose = false;
            }
            mi.clipAnimations = clips;
        }

        Material OnAssignMaterialModel(Material material, Renderer renderer)
        {
            if (!IsOurs) return null;
            return AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
        }

        /* ---------------- Montagem ---------------- */
        static void EnsureDir(string path) { if (!AssetDatabase.IsValidFolder(path)) { var parent = Path.GetDirectoryName(path).Replace('\\', '/'); EnsureDir(parent); AssetDatabase.CreateFolder(parent, Path.GetFileName(path)); } }

        static Material EnsureMaterial()
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (mat != null) return mat;
            EnsureDir(Path.GetDirectoryName(MaterialPath).Replace('\\', '/'));
            var shader = Shader.Find("ForjaElemental/VertexColorLit");
            if (shader == null) throw new System.Exception("Shader ForjaElemental/VertexColorLit não encontrado.");
            mat = new Material(shader) { name = "ForjaVertexColor", enableInstancing = true };
            AssetDatabase.CreateAsset(mat, MaterialPath);
            return mat;
        }

        static AnimatorController BuildController(Dictionary<string, AnimationClip> placeholder)
        {
            EnsureDir(Path.GetDirectoryName(ControllerPath).Replace('\\', '/'));
            AssetDatabase.DeleteAsset(ControllerPath);
            var ac = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            ac.AddParameter("Speed", AnimatorControllerParameterType.Float);
            ac.AddParameter("Stunned", AnimatorControllerParameterType.Bool);
            ac.AddParameter("Victory", AnimatorControllerParameterType.Bool);
            foreach (var t in new[] { "Attack", "Cast", "Hit", "Die" }) ac.AddParameter(t, AnimatorControllerParameterType.Trigger);
            var sm = ac.layers[0].stateMachine;
            var st = new Dictionary<string, AnimatorState>();
            var pos = new Dictionary<string, Vector3>
            {
                ["Idle"] = new Vector3(300, 0), ["Walk"] = new Vector3(560, 0), ["Attack"] = new Vector3(300, 120), ["Cast"] = new Vector3(560, 120),
                ["Hit"] = new Vector3(300, 240), ["Stunned"] = new Vector3(560, 240), ["Victory"] = new Vector3(300, 360), ["Die"] = new Vector3(560, 360)
            };
            foreach (var n in Clips) { st[n] = sm.AddState(n, pos[n]); st[n].motion = placeholder[n]; }
            sm.defaultState = st["Idle"];

            AnimatorStateTransition T(AnimatorState from, AnimatorState to, float dur, bool exit = false)
            {
                var tr = from.AddTransition(to); tr.duration = dur; tr.hasExitTime = exit; if (exit) tr.exitTime = 0.95f; return tr;
            }
            AnimatorStateTransition Any(AnimatorState to, float dur)
            {
                var tr = sm.AddAnyStateTransition(to); tr.duration = dur; tr.hasExitTime = false; tr.canTransitionToSelf = false; return tr;
            }
            T(st["Idle"], st["Walk"], 0.12f).AddCondition(AnimatorConditionMode.Greater, 0.1f, "Speed");
            T(st["Walk"], st["Idle"], 0.15f).AddCondition(AnimatorConditionMode.Less, 0.1f, "Speed");
            foreach (var n in new[] { "Attack", "Cast", "Hit" })
            {
                var tr = Any(st[n], 0.04f); tr.AddCondition(AnimatorConditionMode.If, 0, n); tr.canTransitionToSelf = true;
                T(st[n], st["Idle"], 0.1f, true);
            }
            Any(st["Die"], 0.05f).AddCondition(AnimatorConditionMode.If, 0, "Die");
            Any(st["Stunned"], 0.1f).AddCondition(AnimatorConditionMode.If, 0, "Stunned");
            T(st["Stunned"], st["Idle"], 0.15f).AddCondition(AnimatorConditionMode.IfNot, 0, "Stunned");
            Any(st["Victory"], 0.2f).AddCondition(AnimatorConditionMode.If, 0, "Victory");
            T(st["Victory"], st["Idle"], 0.2f).AddCondition(AnimatorConditionMode.IfNot, 0, "Victory");
            return ac;
        }

        static Dictionary<string, AnimationClip> ClipsOf(string modelPath) =>
            AssetDatabase.LoadAllAssetRepresentationsAtPath(modelPath).OfType<AnimationClip>()
                .Where(c => !c.name.StartsWith("__preview__")).GroupBy(c => c.name).ToDictionary(g => g.Key, g => g.First());

        [MenuItem("Forja Elemental/Montar modelos (material, Animator e prefabs)")]
        public static void BuildAll()
        {
            EnsureMaterial();
            // reimporta os FBX para aplicar material e clipes
            var models = AssetDatabase.FindAssets("t:Model", new[] { ModelsDir }).Select(AssetDatabase.GUIDToAssetPath).OrderBy(p => p).ToList();
            foreach (var p in models) AssetDatabase.ImportAsset(p, ImportAssetOptions.ForceUpdate);

            var animated = models.Where(p => !p.Contains("/Structures/")).ToList();
            if (animated.Count == 0) { Debug.LogWarning("[arte] Nenhum modelo animado em " + ModelsDir); return; }
            var basePath = animated.FirstOrDefault(p => p.EndsWith("/vanguarda_p.fbx")) ?? animated[0];
            var baseClips = ClipsOf(basePath);
            var missing = Clips.Where(c => !baseClips.ContainsKey(c)).ToList();
            if (missing.Count > 0) throw new System.Exception($"Clipes ausentes em {basePath}: {string.Join(", ", missing)}");
            var ac = BuildController(baseClips);

            EnsureDir(OverridesDir);
            int n = 0;
            foreach (var path in models)
            {
                string name = Path.GetFileNameWithoutExtension(path);
                string cat = Path.GetFileName(Path.GetDirectoryName(path));
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var go = (GameObject)PrefabUtility.InstantiatePrefab(model);
                go.name = name;
                if (cat != "Structures")
                {
                    var clips = ClipsOf(path);
                    var ov = new AnimatorOverrideController(ac) { name = name };
                    var pairs = new List<KeyValuePair<AnimationClip, AnimationClip>>();
                    foreach (var c in Clips) if (clips.TryGetValue(c, out var mine)) pairs.Add(new KeyValuePair<AnimationClip, AnimationClip>(baseClips[c], mine));
                    ov.ApplyOverrides(pairs);
                    string ovPath = $"{OverridesDir}/{name}.overrideController";
                    AssetDatabase.DeleteAsset(ovPath);
                    AssetDatabase.CreateAsset(ov, ovPath);
                    var anim = go.GetComponent<Animator>();
                    if (anim == null) anim = go.AddComponent<Animator>();
                    anim.runtimeAnimatorController = ov;
                    anim.applyRootMotion = false;
                    anim.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
                }
                foreach (var r in go.GetComponentsInChildren<Renderer>())
                {
                    r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                    if (r is SkinnedMeshRenderer smr) smr.updateWhenOffscreen = false;
                }
                EnsureDir($"{PrefabsDir}/{cat}");
                PrefabUtility.SaveAsPrefabAsset(go, $"{PrefabsDir}/{cat}/{name}.prefab");
                Object.DestroyImmediate(go);
                n++;
            }
            AssetDatabase.SaveAssets();
            Debug.Log($"[arte] {n} prefab(s) montado(s) em {PrefabsDir}; controller {ControllerPath}.");
        }
    }
}
