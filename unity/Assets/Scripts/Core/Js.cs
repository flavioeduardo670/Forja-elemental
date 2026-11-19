using System;
using System.Collections.Generic;
using System.Numerics;

namespace ForjaElemental.Core
{
    /// <summary>
    /// Operações numéricas com a mesma semântica do JavaScript (V8), para que o
    /// port reproduza bit a bit os resultados de js/engine.js.
    /// </summary>
    public static class JsMath
    {
        /// <summary>Math.round do JS: meio arredonda para +∞ (não é o arredondamento bancário do C#).</summary>
        public static double Round(double x)
        {
            if (double.IsNaN(x) || double.IsInfinity(x)) return x;
            double f = Math.Floor(x);
            return x - f >= 0.5 ? f + 1 : f;
        }

        /// <summary>Math.hypot do V8: normaliza pelo maior valor e soma com compensação de Kahan.</summary>
        public static double Hypot(double a, double b)
        {
            a = Math.Abs(a); b = Math.Abs(b);
            if (double.IsNaN(a) || double.IsNaN(b))
                return double.IsInfinity(a) || double.IsInfinity(b) ? double.PositiveInfinity : double.NaN;
            double max = a > b ? a : b;
            if (double.IsPositiveInfinity(max)) return double.PositiveInfinity;
            if (max == 0) return 0;
            double sum = 0, comp = 0;
            double n = a / max, summand = n * n - comp, pre = sum + summand;
            comp = (pre - sum) - summand; sum = pre;
            n = b / max; summand = n * n - comp; pre = sum + summand;
            sum = pre;
            return Math.Sqrt(sum) * max;
        }

        static readonly double[] Pow10 = { 1, 10, 100, 1000, 10000, 100000, 1000000 };

        /// <summary>
        /// +x.toFixed(d) do JS: arredonda o valor binário EXATO do double (1.025 vira 1.02,
        /// porque 1.025 é 1.02499…), empate para o maior. Formatar com "F2" no Mono não serve.
        /// </summary>
        public static double Fixed(double x, int digits)
        {
            if (double.IsNaN(x) || double.IsInfinity(x)) return x;
            bool neg = x < 0; if (neg) x = -x;
            long bits = BitConverter.DoubleToInt64Bits(x);
            int exp = (int)((bits >> 52) & 0x7FF);
            long man = bits & 0xFFFFFFFFFFFFFL;
            if (exp == 0) exp = 1; else man |= 1L << 52;
            exp -= 1075; // x = man × 2^exp
            BigInteger num = new BigInteger(man) * BigInteger.Pow(10, digits), q;
            if (exp >= 0) q = num << exp;
            else
            {
                int sh = -exp;
                q = num >> sh;
                BigInteger rem = num - (q << sh);
                if (rem * 2 >= BigInteger.One << sh) q += 1;
            }
            double res = (double)q / Pow10[digits];
            return neg ? -res : res;
        }

        public static double Clamp(double v, double a, double b) => Math.Max(a, Math.Min(b, v));

        /// <summary>FE.util.hashStr (FNV-1a 32 bits sobre unidades UTF-16).</summary>
        public static uint HashStr(string str)
        {
            unchecked
            {
                uint h = 2166136261u;
                foreach (char ch in str) { h ^= ch; h *= 16777619u; }
                return h;
            }
        }
    }

    /// <summary>RNG mulberry32 com estado serializável (FE.RNG).</summary>
    public sealed class Rng
    {
        public uint State;

        public Rng(uint seed) { State = seed == 0 ? 1u : seed; }

        public static Rng FromState(uint state) => new Rng(1) { State = state };

        public double Next()
        {
            unchecked
            {
                uint t = State = State + 0x6D2B79F5u;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        public int Int(int a, int b) => a + (int)Math.Floor(Next() * (b - a + 1));

        public T Pick<T>(IList<T> arr) => arr[(int)Math.Floor(Next() * arr.Count)];

        public bool Chance(double p) => Next() < p;

        public List<T> Shuffle<T>(IEnumerable<T> src)
        {
            var a = new List<T>(src);
            for (int i = a.Count - 1; i > 0; i--)
            {
                int j = (int)Math.Floor(Next() * (i + 1));
                (a[i], a[j]) = (a[j], a[i]);
            }
            return a;
        }

        public T Weighted<T>(IList<(T key, double weight)> entries)
        {
            double tot = 0;
            foreach (var e in entries) tot += e.weight;
            double x = Next() * tot;
            foreach (var e in entries) { if ((x -= e.weight) < 0) return e.key; }
            return entries[entries.Count - 1].key;
        }
    }
}
