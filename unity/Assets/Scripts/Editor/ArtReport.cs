using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace ForjaElemental.EditorTools
{
    /// <summary>Relatório dos modelos importados: clipes, tamanho, orientação e cores.</summary>
    public static class ArtReport
    {
        [MenuItem("Forja Elemental/Relatório dos modelos")]
        public static void Run()
        {
            var sb = new StringBuilder("[arte] relatório\n");
            foreach (var path in AssetDatabase.FindAssets("t:Model", new[] { ArtPipeline.ModelsDir }).Select(AssetDatabase.GUIDToAssetPath).OrderBy(p => p))
            {
                var meshes = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Mesh>().ToList();
                var clips = AssetDatabase.LoadAllAssetRepresentationsAtPath(path).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__")).ToList();
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var r = go.GetComponentInChildren<Renderer>();
                var mesh = meshes.FirstOrDefault();
                string orient = "";
                if (mesh != null)
                {
                    // frente em +Z: as botas/rosto ficam em z > 0; mede o lado com mais área à frente
                    var v = mesh.vertices; float zMax = v.Max(p => p.z), zMin = v.Min(p => p.z);
                    orient = $"z∈[{zMin:0.00},{zMax:0.00}] y∈[{v.Min(p => p.y):0.00},{v.Max(p => p.y):0.00}] x∈[{v.Min(p => p.x):0.00},{v.Max(p => p.x):0.00}]";
                    var cols = mesh.colors32;
                    orient += $" cores={(cols != null && cols.Length > 0 ? cols.Length.ToString() : "NENHUMA")} emissivos={cols.Count(c => c.a > 0)} vértices={mesh.vertexCount}";
                }
                string bones = r is SkinnedMeshRenderer smr ? string.Join(",", smr.bones.Select(b => b.name)) : "-";
                foreach (Transform t in go.GetComponentsInChildren<Transform>())
                    if (t.localRotation != Quaternion.identity && t != go.transform && (t.name == "Rig" || t.GetComponent<Renderer>()))
                        sb.AppendLine($"   rotação no nó {t.name}: {t.localEulerAngles}");
                sb.AppendLine($"{Path.GetFileNameWithoutExtension(path)}: escala={go.transform.localScale.x:0.###} {orient} mat={(r ? r.sharedMaterial?.name : "-")} bones={bones}");
                sb.AppendLine("   clipes: " + string.Join(", ", clips.Select(c => $"{c.name}({c.length:0.00}s{(c.isLooping ? ",loop" : "")})")));
            }
            Debug.Log(sb.ToString());
        }

        /// <summary>
        /// Amostra clipes e mede a posição da mão direita e da cabeça na malha deformada.
        /// Esperado (pose() do JS): Cast no meio → mão no alto e à frente (y≈0.83, z>0);
        /// Die no fim → cabeça caída para trás (z&lt;0, y baixo).
        /// </summary>
        public static void PoseCheck()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ArtPipeline.PrefabsDir + "/Units/vanguarda_p.prefab");
            var go = Object.Instantiate(prefab);
            var smr = go.GetComponentInChildren<SkinnedMeshRenderer>();
            var clips = AssetDatabase.LoadAllAssetRepresentationsAtPath(ArtPipeline.ModelsDir + "/Units/vanguarda_p.fbx").OfType<AnimationClip>().ToDictionary(c => c.name);
            var sb = new StringBuilder("[arte] poses\n");
            void Measure(string clip, float t)
            {
                clips[clip].SampleAnimation(go, clips[clip].length * t);
                var m = new Mesh(); smr.BakeMesh(m, true);
                var v = m.vertices; var c = m.colors32;
                var w = smr.transform.localToWorldMatrix;
                bool Skin(Color32 k) => k.r > 230 && k.g > 195 && k.g < 220 && k.b > 165 && k.b < 190;
                var hand = Enumerable.Range(0, v.Length).Where(i => Skin(c[i])).Select(i => w.MultiplyPoint3x4(v[i])).Where(p => p.x > 0.17f).ToList();
                var head = Enumerable.Range(0, v.Length).Where(i => Skin(c[i])).Select(i => w.MultiplyPoint3x4(v[i])).Where(p => Mathf.Abs(p.x) < 0.15f).ToList();
                Vector3 Avg(System.Collections.Generic.List<Vector3> l) => l.Count == 0 ? Vector3.positiveInfinity : l.Aggregate(Vector3.zero, (a, b) => a + b) / l.Count;
                sb.AppendLine($"{clip}@{t:0.00}: mão dir. {Avg(hand):F3}  cabeça {Avg(head):F3}");
                Object.DestroyImmediate(m);
            }
            Measure("Idle", 0); Measure("Cast", 0.5f); Measure("Attack", 0.3f); Measure("Walk", 0.25f); Measure("Die", 1f); Measure("Victory", 0.5f);
            Object.DestroyImmediate(go);
            Debug.Log(sb.ToString());
        }

        /// <summary>Vértice médio da cabeça (cor de pele) para conferir a frente do modelo.</summary>
        public static void FrontCheck()
        {
            var path = ArtPipeline.ModelsDir + "/Units/vanguarda_p.fbx";
            var mesh = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Mesh>().First();
            var v = mesh.vertices; var c = mesh.colors32;
            // olhos: cor #1E2433, perto de y≈0.67
            var eyes = Enumerable.Range(0, v.Length).Where(i => c[i].r < 40 && c[i].g < 45 && c[i].b > 40 && c[i].b < 60 && v[i].y > 0.6f).Select(i => v[i]).ToList();
            Debug.Log($"[arte] olhos: {eyes.Count} vértices, z médio = {(eyes.Count > 0 ? eyes.Average(p => p.z) : float.NaN):0.000} (frente em +Z se positivo)");
        }
    }
}
