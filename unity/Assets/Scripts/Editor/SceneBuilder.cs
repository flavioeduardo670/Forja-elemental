using System.Linq;
using ForjaElemental.Game;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.UIElements;

namespace ForjaElemental.EditorTools
{
    /// <summary>
    /// Monta a cena jogável Assets/Scenes/Jogo.unity: câmera orbital, luz, controlador do jogo e HUD.
    /// Menu: Forja Elemental ▸ Montar cena do jogo (ou -executeMethod ForjaElemental.EditorTools.SceneBuilder.Build).
    /// </summary>
    public static class SceneBuilder
    {
        public const string ScenePath = "Assets/Scenes/Jogo.unity";
        public const string PanelSettingsPath = "Assets/UI/PanelSettings.asset";
        const string ThemePath = "Assets/UI/ForjaTheme.tss";
        const string HudPath = "Assets/UI/Game/GameHud.uxml";

        public static PanelSettings EnsurePanelSettings()
        {
            var ps = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelSettingsPath);
            if (ps == null) { ps = ScriptableObject.CreateInstance<PanelSettings>(); AssetDatabase.CreateAsset(ps, PanelSettingsPath); }
            ps.themeStyleSheet = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(ThemePath);
            ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            ps.referenceResolution = new Vector2Int(1600, 900);
            ps.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            ps.match = 0.5f;
            ps.clearColor = false;
            EditorUtility.SetDirty(ps);
            return ps;
        }

        [MenuItem("Forja Elemental/Montar cena do jogo")]
        public static void Build()
        {
            var catalog = AssetDatabase.LoadAssetAtPath<ModelCatalog>(ArtPipeline.CatalogPath) ?? ArtPipeline.BuildCatalog();
            var mat = AssetDatabase.LoadAssetAtPath<Material>(ArtPipeline.MaterialPath);
            var ps = EnsurePanelSettings();
            var hud = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(HudPath);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.62f, 0.66f, 0.78f);
            RenderSettings.ambientEquatorColor = new Color(0.48f, 0.5f, 0.56f);
            RenderSettings.ambientGroundColor = new Color(0.28f, 0.26f, 0.3f);
            RenderSettings.fog = false;

            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.10f, 0.11f, 0.16f);
            camGo.AddComponent<CameraRig>();

            var lightGo = new GameObject("Sol");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional; light.intensity = 1.5f; light.color = new Color(1f, 0.96f, 0.9f);
            light.shadows = LightShadows.Soft; light.shadowStrength = 0.75f;
            lightGo.transform.rotation = Quaternion.Euler(52, -35, 0);

            var uiGo = new GameObject("HUD");
            var doc = uiGo.AddComponent<UIDocument>();
            doc.panelSettings = ps; doc.visualTreeAsset = hud;

            var gcGo = new GameObject("Jogo");
            var gc = gcGo.AddComponent<GameController>();
            gc.catalog = catalog; gc.vertexColorMaterial = mat; gc.uiDocument = doc; gc.cam = cam;

            EditorSceneManager.SaveScene(scene, ScenePath);
            var scenes = EditorBuildSettings.scenes.Where(s => s.path != ScenePath).ToList();
            scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
            AssetDatabase.SaveAssets();
            Debug.Log($"[cena] {ScenePath} montada (catálogo com {catalog.entries.Count} modelos).");
        }
    }
}
