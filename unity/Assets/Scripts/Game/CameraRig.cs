using UnityEngine;
using UnityEngine.InputSystem;

namespace ForjaElemental.Game
{
    /// <summary>
    /// Câmera orbital do render.js: yaw/pitch/zoom suavizados em volta do centro do tabuleiro.
    /// Botão direito/do meio ou Shift + arrastar gira; roda do mouse aproxima; setas giram/inclinam.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public sealed class CameraRig : MonoBehaviour
    {
        public const float Yaw0 = Mathf.PI / 4, Pitch0 = 0.9f, Dist0 = 25;
        public float yaw = Yaw0, pitch = Pitch0, dist = Dist0;
        public float tyaw = Yaw0, tpitch = Pitch0, tdist = Dist0;
        public int cols = 16, rows = 14;
        public float shake;
        public System.Func<Vector2, bool> IsOverUi;
        Vector2? orbitFrom; float orbitYaw, orbitPitch;
        Camera cam;

        void Awake() { cam = GetComponent<Camera>(); cam.fieldOfView = 34; cam.nearClipPlane = 0.5f; cam.farClipPlane = 140; }

        public void Act(string a)
        {
            const float step = Mathf.PI / 8;
            switch (a)
            {
                case "left": tyaw -= step; break;
                case "right": tyaw += step; break;
                case "up": tpitch = Mathf.Min(1.42f, tpitch + 0.12f); break;
                case "down": tpitch = Mathf.Max(0.42f, tpitch - 0.12f); break;
                case "in": tdist = Mathf.Max(11, tdist - 3); break;
                case "out": tdist = Mathf.Min(44, tdist + 3); break;
                case "tilt": tpitch = tpitch > 1.15f ? 0.6f : tpitch > 0.8f ? 1.3f : 0.92f; break;
                case "home": { float turns = Mathf.Round((tyaw - Yaw0) / (Mathf.PI * 2)); tyaw = Yaw0 + turns * Mathf.PI * 2; tpitch = Pitch0; tdist = Dist0; break; }
            }
        }

        void Update()
        {
            var m = Mouse.current; var k = Keyboard.current;
            if (m != null)
            {
                bool shift = k != null && k.shiftKey.isPressed;
                bool dragBtn = m.rightButton.isPressed || m.middleButton.isPressed || (shift && m.leftButton.isPressed);
                var p = m.position.ReadValue();
                if (dragBtn && orbitFrom == null && (IsOverUi == null || !IsOverUi(p))) { orbitFrom = p; orbitYaw = tyaw; orbitPitch = tpitch; }
                if (!dragBtn) orbitFrom = null;
                if (orbitFrom != null)
                {
                    tyaw = orbitYaw - (p.x - orbitFrom.Value.x) * 0.008f;
                    tpitch = Mathf.Clamp(orbitPitch - (p.y - orbitFrom.Value.y) * 0.006f, 0.42f, 1.42f);
                    yaw = tyaw; pitch = tpitch;
                }
                float wheel = m.scroll.ReadValue().y;
                if (wheel != 0 && (IsOverUi == null || !IsOverUi(p))) tdist = Mathf.Clamp(tdist * (wheel > 0 ? 0.9f : 1.1f), 11, 44);
            }
            if (k != null)
            {
                if (k.leftArrowKey.wasPressedThisFrame) Act("left");
                if (k.rightArrowKey.wasPressedThisFrame) Act("right");
                if (k.upArrowKey.wasPressedThisFrame) Act("up");
                if (k.downArrowKey.wasPressedThisFrame) Act("down");
            }
            Apply(Time.unscaledDeltaTime);
        }

        public void Apply(float dt)
        {
            float kk = 1 - Mathf.Pow(0.0015f, dt);
            yaw += (tyaw - yaw) * kk; pitch += (tpitch - pitch) * kk; dist += (tdist - dist) * kk;
            shake = Mathf.Max(0, shake - dt * 30);
            float sx = shake > 0 ? (Random.value - 0.5f) * shake * 0.012f : 0, sz = shake > 0 ? (Random.value - 0.5f) * shake * 0.012f : 0;
            // alvo e olho nas coordenadas do JS (z = linha), depois espelhados para o Unity
            float tx = cols / 2f - 0.1f + sx, tz = rows / 2f - 0.1f + sz, ty = -0.1f;
            float cp = Mathf.Cos(pitch);
            var eye = new Vector3(tx + Mathf.Sin(yaw) * dist * cp, ty + Mathf.Sin(pitch) * dist, tz + Mathf.Cos(yaw) * dist * cp);
            var target = new Vector3(tx, ty, rows - tz);
            eye.z = rows - eye.z;
            transform.position = eye;
            transform.rotation = Quaternion.LookRotation(target - eye, Vector3.up);
        }
    }
}
