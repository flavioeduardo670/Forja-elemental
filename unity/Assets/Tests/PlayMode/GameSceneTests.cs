using System;
using System.Collections;
using System.IO;
using System.Linq;
using ForjaElemental.Core;
using ForjaElemental.Game;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace ForjaElemental.Tests
{
    /// <summary>
    /// Abre a cena do jogo, joga uma sala com a IA e grava capturas (3D + HUD).
    /// As imagens vão para FORJA_SHOTS (variável de ambiente) ou Logs/Shots.
    /// </summary>
    public class GameSceneTests
    {
        static string ShotsDir => Environment.GetEnvironmentVariable("FORJA_SHOTS") ?? Path.Combine(Application.dataPath, "..", "Logs", "Shots");

        static void Shot(GameController gc, RenderTexture uiRt, string name)
        {
            int w = uiRt.width, h = uiRt.height;
            var camRt = gc.cam.targetTexture;
            gc.cam.Render();
            Texture2D Read(RenderTexture rt) { RenderTexture.active = rt; var t = new Texture2D(w, h, TextureFormat.RGBA32, false); t.ReadPixels(new Rect(0, 0, w, h), 0, 0); t.Apply(); RenderTexture.active = null; return t; }
            var a = Read(camRt); var b = Read(uiRt);
            var pa = a.GetPixels(); var pb = b.GetPixels();
            for (int i = 0; i < pa.Length; i++) { float al = pb[i].a; pa[i] = new Color(pa[i].r * (1 - al) + pb[i].r, pa[i].g * (1 - al) + pb[i].g, pa[i].b * (1 - al) + pb[i].b, 1); }
            a.SetPixels(pa); a.Apply();
            Directory.CreateDirectory(ShotsDir);
            var path = Path.Combine(ShotsDir, name + ".png");
            File.WriteAllBytes(path, a.EncodeToPNG());
            Debug.Log("[teste] captura " + Path.GetFullPath(path));
            UnityEngine.Object.Destroy(a); UnityEngine.Object.Destroy(b);
        }

        static IEnumerator Frames(int n) { for (int i = 0; i < n; i++) yield return null; }

        [UnityTest]
        public IEnumerator Cena_JogaUmaSalaComAIA()
        {
            SceneManager.LoadScene("Jogo");
            yield return Frames(3);
            var gc = UnityEngine.Object.FindAnyObjectByType<GameController>();
            Assert.IsNotNull(gc, "GameController na cena");
            var doc = gc.uiDocument;
            var uiRt = new RenderTexture(1600, 900, 24, RenderTextureFormat.ARGB32);
            doc.panelSettings.targetTexture = uiRt;
            doc.panelSettings.clearColor = true; doc.panelSettings.colorClearValue = new Color(0, 0, 0, 0);
            var camRt = new RenderTexture(1600, 900, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            gc.cam.targetTexture = camRt; // mesmo aspecto da HUD capturada
            yield return Frames(3);
            Shot(gc, uiRt, "0_inicio");

            gc.NewRun("TESTE", 0, 1, "dinamica");
            gc.Hud.OpenStart(false);
            int guard = 0;
            while (gc.G.Run.Phase != "PREP" && guard++ < 20) { gc.Ai.Step(); yield return null; }
            Assert.AreEqual("PREP", gc.G.Run.Phase);
            gc.Ai.Prep(); gc.MarkDirty();
            yield return Frames(5);
            var units = gc.Views().Count();
            Assert.Greater(units, 2, "bonecos do jogador e da horda no tabuleiro");
            Shot(gc, uiRt, "1_preparacao");

            gc.Speed = 1;
            gc.StartFight();
            Assert.AreEqual("COMBAT", gc.G.Run.Phase);
            float t = 0;
            while (gc.G.Run.Phase == "COMBAT" && t < 3.5f) { t += Time.deltaTime; yield return null; }
            gc.MarkDirty();
            yield return Frames(2);
            Shot(gc, uiRt, "2_combate");
            var animators = gc.Views().Select(v => v.view.GetComponent<Animator>()).Where(a => a && a.runtimeAnimatorController).ToList();
            Assert.Greater(animators.Count, 0, "bonecos com Animator");
            Assert.IsTrue(animators.Any(a => { var s = a.GetCurrentAnimatorStateInfo(0); return !s.IsName("Idle"); }), "alguém fora do Idle durante o combate");

            gc.Speed = 4;
            t = 0;
            while (gc.G.Run.Phase == "COMBAT" && t < 90) { t += Time.deltaTime; yield return null; }
            Assert.AreNotEqual("COMBAT", gc.G.Run.Phase, "o combate terminou");
            float wait = 0; while (wait < 1.6f) { wait += Time.deltaTime; yield return null; }
            gc.MarkDirty();
            yield return Frames(3);
            Shot(gc, uiRt, "3_relatorio");
            Assert.AreEqual("report", gc.G.CurrentPending()?.Kind);

            gc.G.SkipPending();
            guard = 0;
            while (gc.G.Run.Phase == "CHOICE" && guard++ < 10) { gc.Ai.ResolvePending(); yield return null; }
            gc.MarkDirty();
            yield return Frames(3);
            if (gc.G.Run.Phase == "MAP") Shot(gc, uiRt, "4_mapa");
            doc.panelSettings.targetTexture = null;
            gc.cam.targetTexture = null;
            uiRt.Release(); camRt.Release();
        }
    }
}
