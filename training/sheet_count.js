// How many Electroplanet sheet lines can be filled from a list of spec rows (used by score.py).
// stdin: [{id, type, url, name, brand, model, groups:[{title, rows:[{label, value}]}]}]  ->  stdout: {id: {filled, lines}}
const fs = require('fs');
const path = require('path');
global.GHANDI_SHEETS = require(path.join(__dirname, '..', 'sheets', 'engine.js'));
eval(fs.readFileSync(path.join(__dirname, '..', 'sheets', 'templates.js'), 'utf8'));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = {};
for (const p of input) {
  try {
    const result = { name: p.name || '', brand: p.brand || '', model: p.model || '', url: p.url || '', specGroups: p.groups || [], specs: [].concat(...(p.groups || []).map((g) => g.rows)) };
    const sh = GHANDI_SHEETS.build(result, p.type, { url: p.url, model: p.model || '' });
    out[p.id] = { filled: sh.filled || 0, type: sh.type, rows: [].concat(...sh.groups.filter((g) => g.title !== 'Autre Caractéristique').map((g) => g.rows.map((r) => r.label))) };
  } catch (e) {
    out[p.id] = { filled: 0, error: String(e && e.message) };
  }
}
process.stdout.write(JSON.stringify(out));
