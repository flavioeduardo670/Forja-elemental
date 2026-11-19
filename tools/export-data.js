// Exporta o conteúdo de js/data.js (FE.Data) para JSON consumido pelo Unity.
// Funções de texto (descrições por nível) viram arrays de strings; o resto
// das funções (formatação de UI) é descartado.
// Uso: node tools/export-data.js
const fs = require('fs');
const path = require('path');
globalThis.window = globalThis;
for (const f of ['core', 'data']) require(path.join(__dirname, '..', 'js', f + '.js'));
const D = globalThis.FE.Data;

const out = {};
for (const [key, val] of Object.entries(D)) out[key] = val;

// Habilidades: descrição por nível (1..3)
out.SKILLS = Object.fromEntries(Object.entries(D.SKILLS).map(([id, s]) => [id, { ...s, desc: undefined, descByLevel: [1, 2, 3].map(l => s.desc(l)) }]));
// Meta-progressão: descrição por nível atual (0..maxLevel)
out.META_UPGRADES = Object.fromEntries(Object.entries(D.META_UPGRADES).map(([id, m]) => [id, { ...m, desc: undefined, descByLevel: [...Array(m.maxLevel + 1).keys()].map(l => m.desc(l)) }]));
// Rótulos de atributos: só o nome
out.STAT_LABELS = Object.fromEntries(Object.entries(D.STAT_LABELS).map(([k, v]) => [k, v[0]]));

const json = JSON.stringify(out, (k, v) => (typeof v === 'function' ? undefined : v), 1);
const dest = path.join(__dirname, '..', 'unity', 'Assets', 'Resources', 'Data', 'forja-data.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, json + '\n');
console.log(`OK: ${path.relative(process.cwd(), dest)} (${(json.length / 1024).toFixed(1)} KB)`);
