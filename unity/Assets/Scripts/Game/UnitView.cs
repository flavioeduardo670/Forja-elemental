using UnityEngine;

namespace ForjaElemental.Game
{
    /// <summary>
    /// Boneco no tabuleiro: posição suavizada, rosto virado para o alvo e Animator
    /// alimentado pelo estado do combate (os mesmos sinais que o pose() do JS usava).
    /// </summary>
    public sealed class UnitView : MonoBehaviour
    {
        public const float UnitScale = 1.18f;   // US do render.js
        static readonly int SpeedId = Animator.StringToHash("Speed"), StunnedId = Animator.StringToHash("Stunned"), VictoryId = Animator.StringToHash("Victory");
        static readonly int AttackId = Animator.StringToHash("Attack"), CastId = Animator.StringToHash("Cast"), HitId = Animator.StringToHash("Hit"), DieId = Animator.StringToHash("Die");
        static readonly int TintId = Shader.PropertyToID("_Tint"), GrayId = Shader.PropertyToID("_Gray");

        public object Ref;
        public bool Seen;
        Animator anim;
        Renderer[] rends;
        MaterialPropertyBlock mpb;
        float yaw, speed;
        Vector3 last;
        bool dead, hasPos;
        float deadTime;
        float lastAtk, lastCast, lastFlash;

        public static UnitView Create(GameObject prefab, Transform parent, object reference, float scale)
        {
            var go = prefab ? Instantiate(prefab, parent) : GameObject.CreatePrimitive(PrimitiveType.Capsule);
            if (!prefab) { go.transform.SetParent(parent); go.transform.localScale = new Vector3(0.4f, 0.4f, 0.4f); }
            var v = go.AddComponent<UnitView>();
            v.Ref = reference;
            v.anim = go.GetComponent<Animator>();
            v.rends = go.GetComponentsInChildren<Renderer>();
            v.mpb = new MaterialPropertyBlock();
            go.transform.localScale = Vector3.one * scale;
            return v;
        }

        /// <summary>Atualiza posição, direção e animações. faceTo: ponto para onde olhar (ou null).</summary>
        public void Sync(Vector3 pos, Vector3? faceTo, float defaultYaw, float dt, bool stunned, bool victory, float animAtk, float animCast, float flash, bool isDead, float tint = 0)
        {
            if (!hasPos) { last = pos; transform.position = pos; yaw = defaultYaw; hasPos = true; }
            var delta = pos - last; delta.y = 0;
            float sp = dt > 0 ? delta.magnitude / dt : 0;
            speed += (Mathf.Min(1, sp / 1.4f) - speed) * Mathf.Min(1, dt * 9);
            last = pos;
            transform.position = pos;
            float want = yaw;
            if (faceTo.HasValue) { var d = faceTo.Value - pos; d.y = 0; if (d.sqrMagnitude > 1e-4f) want = Mathf.Atan2(d.x, d.z) * Mathf.Rad2Deg; }
            else if (delta.sqrMagnitude > 1e-6f) want = Mathf.Atan2(delta.x, delta.z) * Mathf.Rad2Deg;
            else if (!faceTo.HasValue && sp < 0.01f) want = defaultYaw;
            yaw = Mathf.LerpAngle(yaw, want, 1 - Mathf.Pow(0.0005f, dt));
            transform.rotation = Quaternion.Euler(0, yaw, 0);

            if (anim && anim.runtimeAnimatorController)
            {
                anim.SetFloat(SpeedId, speed);
                anim.SetBool(StunnedId, stunned && !isDead);
                anim.SetBool(VictoryId, victory && !isDead);
                if (animAtk > lastAtk + 0.5f) anim.SetTrigger(AttackId);
                if (animCast > lastCast + 0.5f) anim.SetTrigger(CastId);
                if (flash > lastFlash + 0.05f && !isDead) anim.SetTrigger(HitId);
                if (isDead && !dead) { anim.SetTrigger(DieId); deadTime = 0; }
            }
            lastAtk = animAtk; lastCast = animCast; lastFlash = flash;
            if (isDead) { deadTime += dt; }
            dead = isDead;
            float fl = Mathf.Max(tint, flash > 0 ? Mathf.Min(0.7f, flash * 6) : 0);
            mpb.SetColor(TintId, new Color(1, 1, 1, fl));
            mpb.SetFloat(GrayId, isDead ? Mathf.Min(1, deadTime * 2) : 0);
            foreach (var r in rends) r.SetPropertyBlock(mpb);
            // depois de cair, afunda e some
            if (isDead && deadTime > 0.9f) transform.position = pos + Vector3.down * Mathf.Min(0.6f, (deadTime - 0.9f) * 0.8f);
        }

        public bool FinishedDying => dead && deadTime > 1.8f;
    }
}
