#!/usr/bin/env node
/**
 * verify.js — Pruebas de humo del motor de datos y del build.
 * Ejecuta las consultas del dashboard en Node (con shims mínimos de navegador)
 * y valida invariantes clave. Sin dependencias.
 *
 * Uso:  node tools/verify.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

/* ------------------------- Shims de navegador ------------------------- */

globalThis.window = { devicePixelRatio: 1, addEventListener() {}, innerWidth: 1200, innerHeight: 800 };
globalThis.document = { documentElement: {}, createElement: () => ({ style: {}, setAttribute() {}, append() {} }), getElementById: () => null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.fetch = async (url) => {
  const file = path.join(ROOT, String(url).replace(/^\.?\//, ''));
  if (!fs.existsSync(file)) return { ok: false, status: 404 };
  const text = fs.readFileSync(file, 'utf8');
  return { ok: true, status: 200, text: async () => text };
};

/* ------------------------------- Runner ------------------------------- */

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✖ ${name}\n      ${err.message}`);
  }
}

async function main() {
  const data = await import('../js/data.js');
  const { num } = await import('../js/utils.js');

  console.log('\n  ▸ Verificación del dashboard de homicidios PDET');
  console.log('  ' + '─'.repeat(58));

  const bundle = await data.loadBundle();
  await data.loadRecords();
  const L = data.labels();

  console.log(`\n  Archivos fuente`);
  test('dataset.json contiene metadatos y rankings', () => {
    assert.ok(bundle.meta.total > 0, 'total inválido');
    assert.ok(bundle.years.length >= 10, 'pocos años');
    assert.ok(bundle.top.department.l.length > 0, 'sin top de departamentos');
    assert.strictEqual(bundle.top.department.l.length, Math.min(10, bundle.meta.departments));
  });

  test('records.csv se decodifica completo (11 campos por fila)', () => {
    assert.ok(data.state.records.length > 0, 'sin registros');
    assert.strictEqual(data.state.records.length % 11, 0, 'longitud no múltiplo de 11');
    assert.strictEqual(data.state.records.length / 11, bundle.meta.sourceRows, 'conteo de filas distinto al bundle');
  });

  test('los diccionarios cubren todos los índices usados', () => {
    const r = data.state.records;
    for (let i = 0; i < r.length; i += 11) {
      assert.ok(r[i + 3] < L.departments.length, `depto fuera de rango en ${i}`);
      assert.ok(r[i + 4] < L.municipalities.length, `municipio fuera de rango en ${i}`);
      assert.ok(r[i + 5] < L.sexes.length, `sexo fuera de rango en ${i}`);
      assert.ok(r[i + 6] < L.zones.length, `zona fuera de rango en ${i}`);
      assert.ok(r[i + 7] < L.weapons.length, `arma fuera de rango en ${i}`);
      assert.ok(r[i + 8] < L.modalities.length, `modalidad fuera de rango en ${i}`);
    }
  });

  console.log(`\n  Consulta base (${num(bundle.meta.total)} víctimas registradas)`);
  const base = data.query({});

  test('el total consultado coincide con el bundle', () => {
    assert.strictEqual(base.total, bundle.meta.total);
  });

  test('los rankings respetan el Top 10 y vienen ordenados', () => {
    for (const [key, rows] of Object.entries(base.ranks)) {
      assert.ok(rows.length <= 10, `${key} supera 10 filas`);
      const values = rows.map((r) => r[1]);
      const sorted = [...values].sort((a, b) => b - a);
      assert.deepStrictEqual(values, sorted, `${key} no está ordenado descendentemente`);
      assert.ok(values.every((v) => v > 0), `${key} contiene valores no positivos`);
    }
  });

  test('la suma de sexos, zonas y clasificación SPOA equivale al total', () => {
    const sum = (rows) => rows.reduce((a, r) => a + r[1], 0);
    assert.strictEqual(sum(base.ranks.sex), base.total, 'sexo');
    assert.strictEqual(sum(base.ranks.zone), base.total, 'zona');
    assert.strictEqual(sum(base.ranks.spoa), base.total, 'spoa');
  });

  test('la suma de todos los departamentos equivale al total', () => {
    let t = 0;
    for (const v of base.maps.byDept.values()) t += v;
    assert.strictEqual(t, base.total);
    assert.strictEqual(base.details.length, base.summary.departments);
  });

  test('la serie anual suma el total y cubre todo el periodo', () => {
    const sum = base.series.year.values.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, base.total);
    assert.strictEqual(base.series.year.labels.length, bundle.meta.yearCount);
  });

  test('la serie mensual y semanal se calculan', () => {
    assert.ok(base.series.month.values.length > 100, 'serie mensual muy corta');
    assert.strictEqual(base.series.month.values.reduce((a, b) => a + b, 0), base.total);
    assert.strictEqual(base.series.weekday.values.length, 7);
    assert.strictEqual(base.series.weekday.values.reduce((a, b) => a + b, 0), base.total);
    assert.strictEqual(base.series.dayOfMonth.values.reduce((a, b) => a + b, 0), base.total);
  });

  test('los porcentajes del resumen son coherentes', () => {
    const s = base.summary;
    assert.ok(Math.abs(s.femPct + (100 - s.femPct) - 100) < 1e-9);
    assert.ok(s.ruralPct + s.urbanPct > 99.5 && s.ruralPct + s.urbanPct <= 100.01, 'rural+urbano no suma ~100 %');
    assert.ok(s.firearmPct > 0 && s.firearmPct <= 100, 'porcentaje de arma de fuego fuera de rango');
    assert.ok(s.avgPerYear > 0, 'promedio anual inválido');
  });

  test('el día más crítico tiene fecha válida', () => {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(base.summary.maxDaily.date), base.summary.maxDaily.date);
    assert.ok(base.summary.maxDaily.count > 0);
  });

  console.log('\n  Filtros');
  const topDept = base.ranks.department[0][0];
  const fDept = data.query({ dept: topDept });
  test(`filtrar por departamento (${topDept}) reduce y aísla el conjunto`, () => {
    assert.ok(fDept.total > 0 && fDept.total < base.total, 'el filtro no redujo el total');
    assert.strictEqual(fDept.details.length, 1, 'debería quedar un solo departamento');
    assert.strictEqual(fDept.details[0].name, topDept);
    assert.strictEqual(fDept.details[0].count, fDept.total, 'el detalle no coincide con el total');
  });

  test('filtrar por año delimita el periodo', () => {
    const y = bundle.years[bundle.years.length - 3];
    const q = data.query({ yearFrom: y, yearTo: y });
    assert.ok(q.total > 0);
    assert.strictEqual(q.series.year.labels.length, 1);
    assert.strictEqual(q.series.year.values[0], q.total);
    assert.strictEqual(q.summary.years, 1);
    assert.ok(Math.abs(q.summary.avgPerYear - q.total) < 1e-6, 'el promedio anual con un año debe ser el total');
  });

  test('el filtro de sexo femenino coincide con el resumen nacional', () => {
    const q = data.query({ sex: 'FEMENINO' });
    assert.strictEqual(q.total, base.summary.fem, 'el total femenino difiere del resumen');
    assert.strictEqual(q.ranks.sex.length, 1);
  });

  test('la búsqueda por municipio encuentra resultados', () => {
    const target = data.state.dicts.municipalities[0];
    const q = data.query({ search: target.slice(0, Math.max(4, target.length - 2)) });
    assert.ok(q.total > 0, `sin resultados para "${target}"`);
    assert.ok(q.summary.municipalities >= 1);
  });

  test('una búsqueda inexistente devuelve un conjunto vacío sin errores', () => {
    const q = data.query({ search: 'zzzzmunicipioinexistente' });
    assert.strictEqual(q.total, 0);
    assert.deepStrictEqual(q.ranks.department, []);
    assert.deepStrictEqual(q.details, []);
    assert.strictEqual(q.summary.femPct, 0);
  });

  test('los filtros combinados se intersectan (depto + sexo + arma de fuego)', () => {
    const q = data.query({ dept: topDept, sex: 'MASCULINO', weapon: 'ARMA DE FUEGO' });
    assert.ok(q.total > 0 && q.total <= fDept.total, 'la intersección no es un subconjunto');
    assert.deepStrictEqual(q.ranks.weapon.map((r) => r[0]), ['ARMA DE FUEGO']);
    assert.deepStrictEqual(q.ranks.sex.map((r) => r[0]), ['MASCULINO']);
  });

  test('los grupos analíticos (familia de arma y modalidad) suman el total', () => {
    const sum = (rows) => rows.reduce((a, r) => a + r[1], 0);
    assert.strictEqual(sum([...base.maps.byWeaponFamily.entries()]), base.total);
    assert.strictEqual(sum([...base.maps.byModalityGroup.entries()]), base.total);
  });

  test('el índice por 100.000 habitantes es positivo para departamentos con población base', () => {
    const withRate = base.details.filter((d) => d.rate != null);
    assert.ok(withRate.length > 0, 'ningún departamento tiene índice calculado');
    assert.ok(withRate.every((d) => d.rate > 0 && d.rate < 1000), 'índice fuera de rango razonable');
  });

  test('el conteo de filtros activos responde a la configuración', () => {
    assert.strictEqual(data.activeFilterCount({}), 0);
    assert.strictEqual(data.activeFilterCount({ dept: 'CAUCA', sex: 'FEMENINO' }), 2);
  });

  console.log('\n  Rendimiento');
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) data.query({ dept: i % 2 ? 'CAUCA' : '', sex: i % 3 ? 'FEMENINO' : '' });
  const per = (Date.now() - t0) / 8;
  test(`cada consulta tarda menos de 120 ms (promedio ${per.toFixed(1)} ms)`, () => {
    assert.ok(per < 120, `consulta lenta: ${per.toFixed(1)} ms`);
  });

  console.log('\n  Archivos del sitio');
  for (const f of ['index.html', 'css/styles.css', 'js/app.js', 'js/charts.js', 'js/data.js', 'js/ui.js', 'js/utils.js', 'assets/favicon.svg', 'manifest.webmanifest', 'README.md', 'LICENSE']) {
    test(`existe ${f}`, () => assert.ok(fs.existsSync(path.join(ROOT, f)), 'archivo faltante'));
  }

  test('index.html referencia los módulos y la hoja de estilos', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('js/app.js'), 'sin script de aplicación');
    assert.ok(html.includes('css/styles.css'), 'sin hoja de estilos');
    assert.ok(html.includes('data/dataset.json'), 'sin precarga del dataset');
  });

  console.log(`\n  ${passed} pruebas superadas, ${failed} fallidas\n`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('\n  ✖ Error inesperado:', err);
  process.exit(1);
});
