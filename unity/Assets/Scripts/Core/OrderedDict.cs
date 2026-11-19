using System;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ForjaElemental.Core
{
    internal interface IOrderedDict
    {
        Type ValueType { get; }
        void SetBoxed(string key, object value);
        IEnumerable<KeyValuePair<string, object>> Boxed();
    }

    /// <summary>
    /// Dicionário que preserva a ordem de inserção, como os objetos do JS.
    /// A ordem importa: o motor itera chaves (elementos, habilidades, tabelas
    /// de dados) e o RNG sorteia por posição.
    /// </summary>
    [JsonConverter(typeof(OrderedDictConverter))]
    public sealed class OrderedDict<T> : IEnumerable<KeyValuePair<string, T>>, IOrderedDict
    {
        private readonly List<string> keys = new List<string>();
        private readonly Dictionary<string, T> map = new Dictionary<string, T>();

        public OrderedDict() { }
        public OrderedDict(OrderedDict<T> other) { if (other != null) foreach (var kv in other) this[kv.Key] = kv.Value; }

        public int Count => keys.Count;
        public IReadOnlyList<string> Keys => keys;
        public IEnumerable<T> Values { get { foreach (var k in keys) yield return map[k]; } }

        public T this[string key]
        {
            get => map[key];
            set { if (!map.ContainsKey(key)) keys.Add(key); map[key] = value; }
        }

        public bool ContainsKey(string key) => key != null && map.ContainsKey(key);
        public bool TryGetValue(string key, out T value) => map.TryGetValue(key, out value);

        /// <summary>Valor ou default (equivale a `obj[key] || 0` no JS para números).</summary>
        public T Get(string key) => key != null && map.TryGetValue(key, out var v) ? v : default;

        public bool Remove(string key) { if (!map.Remove(key)) return false; keys.Remove(key); return true; }

        public IEnumerator<KeyValuePair<string, T>> GetEnumerator()
        {
            foreach (var k in keys) yield return new KeyValuePair<string, T>(k, map[k]);
        }
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

        Type IOrderedDict.ValueType => typeof(T);
        void IOrderedDict.SetBoxed(string key, object value) => this[key] = (T)value;
        IEnumerable<KeyValuePair<string, object>> IOrderedDict.Boxed()
        {
            foreach (var k in keys) yield return new KeyValuePair<string, object>(k, map[k]);
        }
    }

    public sealed class OrderedDictConverter : JsonConverter
    {
        public override bool CanConvert(Type t) => t.IsGenericType && t.GetGenericTypeDefinition() == typeof(OrderedDict<>);

        public override object ReadJson(JsonReader reader, Type objectType, object existing, JsonSerializer serializer)
        {
            if (reader.TokenType == JsonToken.Null) return null;
            var obj = JObject.Load(reader);
            var dict = (IOrderedDict)Activator.CreateInstance(objectType);
            foreach (var prop in obj.Properties())
                dict.SetBoxed(prop.Name, prop.Value.Type == JTokenType.Null ? null : prop.Value.ToObject(dict.ValueType, serializer));
            return dict;
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer)
        {
            writer.WriteStartObject();
            foreach (var kv in ((IOrderedDict)value).Boxed()) { writer.WritePropertyName(kv.Key); serializer.Serialize(writer, kv.Value); }
            writer.WriteEndObject();
        }
    }
}
