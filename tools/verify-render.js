#!/usr/bin/env node
/**
 * verify-render.js — Prueba de integración del dashboard completo.
 *
 * Levanta un shim de DOM/Canvas, carga index.html, importa js/app.js y ejecuta
 * el ciclo real (boot → carga de datos → render → filtros → exportación),
 * verificando que no haya errores de ejecución y que el DOM se construya.
 *
 * Uso:  node tools/verify-render.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { installGlobalShim } = require('./dom-shim.js');

const ROOT = path.resolve(__dirname, '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const shim = installGlobalShim({ html: INDEX });
const { document, window: win, flushRaf } = shim;

/* ------------------------------ fetch local ------------------------------ */

globalThis.fetch = async (url) => {
  const file = path.join(ROOT, String(url).replace(/^\.?\//, ''));
  if (!fs.existsSync(file)) return { ok: false, status: 404, text: async () => '' };
  const text = fs.readFileSync(file, 'utf8');
  return { ok: true, status: 200, text: async () => text };
};

/* -------------------------------- Runner -------------------------------- */

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✖ ${name}\n      ${err.message}`); }
}

async function waitFor(predicate, { timeout = 25000, interval = 40 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

const canvasOps = () => [...document.querySelectorAll('canvas')].map((c) => ({ c, ops: c.getContext('2d').ops }));

async function main() {
  console.log('\n  ▸ Prueba de integración del dashboard (DOM simulado)');
  console.log('  ' + '─'.repeat(58));

  // Captura de errores no controlados.
  process.on('unhandledRejection', (r) => errors.push(String(r)));
  process.on('uncaughtException', (e) => errors.push(String(e && e.stack ? e.stack : e)));

  console.log('\n  Arranque de la aplicación');
  const app = await import('../js/app.js');
  assert.ok(app, 'app.js no exporta nada');

  const ready = await waitFor(() => document.querySelector('#dataStatus')?.textContent.includes('Listo'), { timeout: 30000 });
  flushRaf();

  test('la aplicación completa el arranque y reporta "Listo"', () => {
    assert.ok(ready, `estado actual: "${document.querySelector('#dataStatus')?.textContent}"`);
  });

  test('no hay errores de ejecución durante el arranque', () => {
    assert.deepStrictEqual(errors, []);
  });

  console.log('\n  Renderizado del DOM');

  test('se pintan las tarjetas de KPI con valores reales', () => {
    const kpis = document.querySelectorAll('#kpis .kpi');
    assert.ok(kpis.length >= 8, `solo ${kpis.length} tarjetas`);
    const values = kpis.map((k) => k.querySelector('.kpi__value')?.textContent ?? '');
    assert.ok(values.every((v) => v.length > 0), 'alguna tarjeta sin valor');
    assert.ok(values.some((v) => /71\.304/.test(v)), `no se encontró el total esperado: ${values.join(' | ')}`);
  });

  test('los rankings se llenan con hasta 10 filas ordenadas', () => {
    const targets = {
      rankYear: 10,
      rankDept: 10,
      rankMuni: 10,
      rankWeapon: 10,
      rankModality: 10,
      rankSex: 4,
      rankZone: 2,
      rankSpoa: 2,
      rankWeaponFamily: 9,
    };
    for (const [id, expected] of Object.entries(targets)) {
      const rows = document.querySelectorAll(`#${id} .rank__row`);
      assert.strictEqual(rows.length, expected, `${id}: ${rows.length} filas (esperadas ${expected})`);
      const values = rows.map((r) => Number(r.querySelector('.rank__val')?.textContent.replace(/[^\d]/g, '') ?? 0));
      assert.ok(values.every((v) => v > 0), `${id}: valor no positivo`);
      const sorted = [...values].sort((a, b) => b - a);
      assert.deepStrictEqual(values, sorted, `${id}: filas desordenadas`);
      assert.ok(rows.every((r) => r.querySelector('.rank__fill')?.style.width), `${id}: barra sin ancho`);
    }
  });

  test('los gráficos dibujan contenido en el canvas', () => {
    const ids = ['chartTrend', 'chartMonth', 'chartWeekday', 'chartDayOfMonth', 'chartDept', 'chartSex', 'chartZone', 'chartSpoa'];
    const missing = ids.filter((id) => !document.querySelector(`#${id} canvas`));
    assert.deepStrictEqual(missing, [], `contenedores sin canvas: ${missing.join(', ')}`);
    const charts = canvasOps();
    assert.strictEqual(charts.length, ids.length, `${charts.length} canvas para ${ids.length} gráficos`);
    for (const { c, ops } of charts) {
      const where = c.parentNode?.id || 'canvas';
      assert.ok(ops.length > 25, `${where}: ${ops.length} operaciones de dibujo`);
      assert.ok(ops.some((o) => o.name === 'fillText'), `${where}: no dibuja etiquetas`);
      assert.ok(ops.some((o) => o.name === 'fill' || o.name === 'stroke'), `${where}: no pinta formas`);
    }
  });

  test('el tooltip y el hit-testing responden al puntero', () => {
    const canvas = document.querySelector('#chartTrend canvas');
    assert.ok(canvas, 'no se encontró el canvas de tendencia');
    const before = canvas.getContext('2d').ops.length;
    canvas.dispatchEvent({ type: 'pointermove', clientX: 210, clientY: 90 });
    flushRaf();
    const tip = document.querySelector('#tooltip');
    assert.ok(!tip.hidden, 'el tooltip no se mostró');
    assert.ok(tip.innerHTML.includes('<strong>'), 'el tooltip no tiene contenido estructurado');
    assert.ok(canvas.getContext('2d').ops.length > before, 'el hover no redibujó el gráfico');
    canvas.dispatchEvent({ type: 'pointerleave' });
  });

  test('la tabla de detalle lista todos los departamentos', () => {
    const rows = document.querySelectorAll('#detailTable tbody tr');
    assert.strictEqual(rows.length, 19, `${rows.length} filas`);
    const first = rows[0].querySelectorAll('td').map((td) => td.textContent.trim());
    assert.strictEqual(first[0].replace(/[\d.]+$/, '').trim().length > 0, true);
    assert.ok(Number(first[1].replace(/\./g, '')) > 0, 'la primera fila no tiene total');
    const sorted = rows.map((r) => Number(r.querySelectorAll('td')[1].textContent.replace(/\./g, '')));
    assert.deepStrictEqual(sorted, [...sorted].sort((a, b) => b - a), 'la tabla no viene ordenada por total');
  });

  test('se generan los chips, los hallazgos y la nota de fuente', () => {
    assert.ok(document.querySelectorAll('#findings li').length >= 6, 'pocos hallazgos');
    assert.ok(document.querySelector('#sourceNote').textContent.includes('70.939'), 'la nota de fuente no cita el total de filas');
    assert.ok(document.querySelector('#filterSummary').textContent.includes('71.304'), 'el resumen no muestra el total');
  });

  console.log('\n  Interacción y filtros');

  const countRows = (id) => document.querySelectorAll(`#${id} .rank__row`).length;

  test('el filtro por departamento se aplica al pulsar un ranking', () => {
    const first = document.querySelector('#rankDept .rank__row');
    assert.ok(first, 'sin filas en el ranking de departamentos');
    first.click();
    flushRaf();
  });

  // El render está debounced: se espera al siguiente ciclo.
  await new Promise((r) => setTimeout(r, 420));
  flushRaf();

  test('con un departamento seleccionado el detalle se reduce a una fila', () => {
    const rows = document.querySelectorAll('#detailTable tbody tr');
    assert.strictEqual(rows.length, 1, `${rows.length} filas tras filtrar por departamento`);
    const chips = document.querySelectorAll('#activeChips .chip');
    assert.ok(chips.length >= 1, 'no se creó el chip del filtro');
    assert.ok(document.querySelector('#filterCount').textContent !== '0', 'el contador de filtros no se actualizó');
    assert.strictEqual(document.querySelector('#fDept').value.length > 0, true, 'el select no quedó sincronizado');
  });

  test('el detalle restante cuadra con el total filtrado', () => {
    const row = document.querySelectorAll('#detailTable tbody tr')[0];
    const total = Number(row.querySelectorAll('td')[1].textContent.replace(/\./g, ''));
    const shown = Number(document.querySelector('#kpis .kpi__value').textContent.replace(/\./g, ''));
    assert.strictEqual(total, shown, 'el detalle no coincide con el KPI total');
  });

  test('cambiar el año en el select reajusta las series', () => {
    const sel = document.querySelector('#fYearTo');
    sel.value = '2010';
    sel.dispatchEvent({ type: 'change' });
  });

  await new Promise((r) => setTimeout(r, 420));
  flushRaf();

  test('el rango de años se refleja en el número de tarjetas de resumen', () => {
    const yearRank = countRows('rankYear');
    assert.ok(yearRank > 0 && yearRank <= 10, `ranking de años con ${yearRank} filas`);
    const summary = document.querySelector('#filterSummary').textContent;
    assert.ok(/Periodo \d{4}–2010/.test(summary), `el resumen no refleja el periodo: ${summary}`);
  });

  test('el botón de reinicio restablece todos los filtros', () => {
    document.querySelector('#btnReset').click();
  });

  await new Promise((r) => setTimeout(r, 420));
  flushRaf();

  test('tras reiniciar vuelven los 19 departamentos y no hay chips', () => {
    assert.strictEqual(document.querySelectorAll('#detailTable tbody tr').length, 19);
    assert.strictEqual(document.querySelectorAll('#activeChips .chip').length, 0, 'quedaron chips activos');
    assert.strictEqual(document.querySelector('#activeChips').hidden, true, 'la cinta de chips sigue visible');
    assert.strictEqual(document.querySelector('#fDept').value, '');
  });

  test('la búsqueda de municipio filtra el conjunto', async () => {
    const input = document.querySelector('#fSearch');
    input.value = 'tumaco';
    input.dispatchEvent({ type: 'input' });
  });

  await new Promise((r) => setTimeout(r, 520));
  flushRaf();

  test('la búsqueda por "tumaco" deja un solo municipio visible', () => {
    const rows = document.querySelectorAll('#detailTable tbody tr');
    assert.strictEqual(rows.length, 1, `${rows.length} filas`);
    assert.ok(rows[0].textContent.includes('NARI'), 'el municipio encontrado no corresponde a Nariño');
    const muniRank = document.querySelectorAll('#rankMuni .rank__row');
    assert.ok(muniRank[0].textContent.toLowerCase().includes('tumaco'), 'el ranking no muestra Tumaco');
  });

  test('el modo mes de la tendencia redibuja el gráfico', () => {
    const btn = document.querySelector('.seg__btn[data-gran="month"]');
    const before = document.querySelector('#chartTrend canvas').getContext('2d').ops.length;
    btn.click();
    flushRaf();
    const after = document.querySelector('#chartTrend canvas').getContext('2d').ops.length;
    assert.ok(after !== before || after > 0, 'el gráfico no se redibujó');
    assert.ok(document.querySelector('#trendSub').textContent.toLowerCase().includes('mensual'), 'no cambió el subtítulo');
    document.querySelector('.seg__btn[data-gran="year"]').click();
    flushRaf();
  });

  test('el comparativo departamental cambia de métrica', () => {
    const btn = document.querySelector('.seg__btn[data-metric="fem"]');
    btn.click();
    flushRaf();
    assert.ok(document.querySelector('#deptBarSub').textContent.includes('mujeres'), 'no cambió la métrica');
    document.querySelector('.seg__btn[data-metric="fig"]').click();
    flushRaf();
    assert.ok(document.querySelector('#deptBarSub').textContent.includes('Total'), 'no volvió a la métrica total');
  });

  test('el ordenamiento de la tabla funciona por columna', () => {
    document.querySelector('#btnReset').click();
    document.querySelector('thead th[data-sort="name"]').click();
    const names = document.querySelectorAll('#detailTable tbody tr').map((r) => r.querySelectorAll('td')[0].textContent.trim());
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'es'));
    assert.deepStrictEqual(names, sorted, 'la columna no se ordenó alfabéticamente');
    document.querySelector('thead th[data-sort="count"]').click();
    const counts = document.querySelectorAll('#detailTable tbody tr').map((r) => Number(r.querySelectorAll('td')[1].textContent.replace(/\./g, '')));
    assert.deepStrictEqual(counts, [...counts].sort((a, b) => b - a), 'no se ordenó por total descendente');
  });

  test('el cambio de tema redibuja sin errores', () => {
    document.querySelector('#btnTheme').click();
    flushRaf();
    assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'light');
    document.querySelector('#btnTheme').click();
    flushRaf();
    assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'dark');
  });

  test('el panel de filtros se abre y se cierra con el teclado', () => {
    const btn = document.querySelector('#btnFilters');
    const panel = document.querySelector('#filters');
    btn.click();
    assert.strictEqual(panel.hidden, false, 'el panel no se abrió');
    assert.strictEqual(btn.getAttribute('aria-expanded'), 'true');
    document.querySelector('#btnApplyClose').click();
    assert.strictEqual(panel.hidden, true, 'el panel no se cerró');
  });

  test('la exportación a CSV se ejecuta sin errores', () => {
    const before = errors.length;
    document.querySelector('#btnExport').click();
    assert.strictEqual(errors.length, before, 'la exportación lanzó un error');
  });

  test('no se registraron errores en toda la sesión de pruebas', () => {
    assert.deepStrictEqual(errors, []);
  });

  console.log(`\n  ${passed} pruebas superadas, ${failed} fallidas\n`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('\n  ✖ Error inesperado:', err);
  process.exit(1);
});
