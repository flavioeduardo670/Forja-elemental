using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace ForjaElemental.EditorTools
{
    /// <summary>
    /// Renderiza uma imagem de conferência com todos os prefabs (fila por categoria),
    /// cada um numa pose de um clipe. Serve para revisar a arte sem abrir o Editor.
    /// Linha de comando: -executeMethod ForjaElemental.EditorTools.ArtPreview.Render -previewOut caminho.png [-previewClip Idle]
    /// </summary>
    public static class ArtPreview
    {
        [MenuItem("Forja Elemental/Imagem de conferência dos modelos")]
        public static void RenderMenu() => RenderTo(Path.Combine(Application.dataPath, "..", "Logs", "modelos.png"), "Idle", 0.25f);

        public static void Render()
        {
            var args = Environment.GetCommandLineArgs();
            string Arg(string k, string def) { int i = Array.IndexOf(args, k); return i >= 0 && i + 1 < args.Length ? args[i + 1] : def; }
            RenderTo(Arg("-previewOut", Path.Combine(Application.dataPath, "..", "Logs", "modelos.png")), Arg("-previewClip", "Idle"), float.Parse(Arg("-previewTime", "0.25"), System.Globalization.CultureInfo.InvariantCulture));
        }

        static void RenderTo(string outPath, string clipName, float tNorm)
        {
            var root = new GameObject("PreviewRoot");
            try
            {
                // fileiras da frente (perto da câmera) para o fundo; os modelos olham para +Z (a câmera)
                string P(string cat) => $"{ArtPipeline.PrefabsDir}/{cat}";
                System.Collections.Generic.List<string> Find(string cat, Func<string, bool> f) =>
                    AssetDatabase.FindAssets("t:Prefab", new[] { P(cat) }).Select(AssetDatabase.GUIDToAssetPath).Where(f).OrderBy(p => p).ToList();
                var rows = new (System.Collections.Generic.List<string> paths, float w, float depth)[]
                {
                    (Find("Units", p => p.EndsWith("_p.prefab")), 0.75f, 1.0f),
                    (Find("Units", p => p.EndsWith("_e.prefab")), 0.75f, 1.2f),
                    (Find("Bosses", p => true).Concat(Find("Summons", p => true)).ToList(), 0f, 1.8f),
                    (Find("Structures", p => true), 0f, 2.5f)
                };
                float z = 0; float maxX = 0;
                foreach (var (paths, rowW, rowDepth) in rows)
                {
                    float x = 0;
                    foreach (var p in paths)
                    {
                        var go = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(p), root.transform);
                        float w = rowW > 0 ? rowW : p.Contains("/Structures/") ? 4.9f : p.Contains("/Bosses/") ? 1.45f : 0.62f;
                        go.transform.position = new Vector3(x + w / 2, 0, z);
                        var anim = go.GetComponent<Animator>();
                        if (anim && anim.runtimeAnimatorController)
                        {
                            var clip = anim.runtimeAnimatorController.animationClips.FirstOrDefault(c => c.name == clipName)
                                       ?? anim.runtimeAnimatorController.animationClips.FirstOrDefault(c => c.name == "Idle");
                            if (clip) clip.SampleAnimation(go, clip.length * tNorm);
                        }
                        x += w; maxX = Mathf.Max(maxX, x);
                    }
                    z -= rowDepth;
                }
                // centraliza cada fileira na largura máxima
                foreach (Transform t in root.transform) { }
                var rowsX = root.GetComponentsInChildren<Transform>().Where(t => t.parent == root.transform).GroupBy(t => t.position.z);
                foreach (var g in rowsX) { float w = g.Max(t => t.position.x) + g.Min(t => t.position.x); float off = (maxX - w) / 2; foreach (var t in g) t.position += new Vector3(off, 0, 0); }
                // chão, luz e câmera
                var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
                ground.transform.SetParent(root.transform);
                ground.transform.position = new Vector3(maxX / 2, 0, z / 2); ground.transform.localScale = new Vector3(maxX / 8, 1, -z / 8);
                var gm = new Material(Shader.Find("Universal Render Pipeline/Lit")); gm.color = new Color(0.55f, 0.72f, 0.45f);
                ground.GetComponent<Renderer>().sharedMaterial = gm;
                var lightGo = new GameObject("Sun"); lightGo.transform.SetParent(root.transform);
                var light = lightGo.AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.6f; light.shadows = LightShadows.Soft;
                lightGo.transform.rotation = Quaternion.Euler(50, -30, 0);
                RenderSettings.ambientMode = AmbientMode.Flat; RenderSettings.ambientLight = new Color(0.55f, 0.58f, 0.66f);
                var camGo = new GameObject("Cam"); camGo.transform.SetParent(root.transform);
                var cam = camGo.AddComponent<Camera>();
                cam.orthographic = true; cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.12f, 0.13f, 0.18f);
                camGo.transform.rotation = Quaternion.Euler(24, 180, 0);
                int W = 2400, H = 1260;
                var center = new Vector3(maxX / 2, 0.9f, z / 2);
                camGo.transform.position = center - camGo.transform.forward * 20;
                cam.orthographicSize = Mathf.Max(maxX / (W / (float)H) / 2 * 1.04f, (-z) * 0.42f + 0.8f);
                cam.nearClipPlane = 0.1f; cam.farClipPlane = 60;
                lightGo.transform.rotation = Quaternion.Euler(50, 150, 0);
                var rt = new RenderTexture(W, H, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
                cam.targetTexture = rt; cam.aspect = W / (float)H;
                cam.Render();
                RenderTexture.active = rt;
                var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
                tex.ReadPixels(new Rect(0, 0, W, H), 0, 0); tex.Apply();
                RenderTexture.active = null;
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outPath)));
                File.WriteAllBytes(outPath, tex.EncodeToPNG());
                Debug.Log($"[arte] imagem salva em {Path.GetFullPath(outPath)} (clipe {clipName} @ {tNorm:0.00})");
                UnityEngine.Object.DestroyImmediate(tex); rt.Release();
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }
    }
}
