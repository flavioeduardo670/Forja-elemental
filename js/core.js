/* ==========================================================================
   FORJA ELEMENTAL 2.0 — core.js
   Namespace global, RNG determinístico (seed), barramento de eventos,
   utilitários e camada de persistência versionada.
   Nenhum módulo de lógica (engine/game) acessa o DOM: comunicação via FE.Bus.
   ========================================================================== */
(function (root) {
  'use strict';
  const FE = root.FE = root.FE || {};
  FE.VERSION = '3.1.0';

  FE.util = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    esc: (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    pct: (v) => Math.round(v * 100) + '%',
    hashStr(str) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    randomSeedString() {
      const syl = ['ka', 'ru', 'mi', 'to', 'ze', 'lo', 'vi', 'na', 'qu', 'xe', 'bo', 'si', 'fa', 'dra', 'gon', 'lux'];
      let s = '';
      for (let i = 0; i < 3; i++) s += syl[Math.floor(Math.random() * syl.length)];
      return s.toUpperCase() + '-' + Math.floor(Math.random() * 900 + 100);
    }
  };

  /* RNG mulberry32 com estado serializável: a mesma seed gera o mesmo mapa,
     as mesmas hordas e as mesmas ofertas — base para replays, desafios
     diários e depuração de balanceamento. */
  FE.RNG = function (seed) {
    const r = { state: (seed >>> 0) || 1 };
    r.next = function () {
      let t = (r.state = (r.state + 0x6D2B79F5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (a, b) => a + Math.floor(r.next() * (b - a + 1));
    r.pick = (arr) => arr[Math.floor(r.next() * arr.length)];
    r.chance = (p) => r.next() < p;
    r.shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    r.weighted = (entries) => {
      const tot = entries.reduce((s, e) => s + e[1], 0);
      let x = r.next() * tot;
      for (const e of entries) { if ((x -= e[1]) < 0) return e[0]; }
      return entries[entries.length - 1][0];
    };
    return r;
  };

  FE.Bus = {
    h: {},
    on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); },
    emit(ev, payload) { (this.h[ev] || []).forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } }); }
  };

  FE.Storage = {
    get(k) { try { const r = root.localStorage && root.localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (_) { return null; } },
    set(k, v) { try { root.localStorage && root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { root.localStorage && root.localStorage.removeItem(k); } catch (_) {} }
  };
})(typeof window !== 'undefined' ? window : globalThis);
