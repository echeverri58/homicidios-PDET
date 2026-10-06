#!/usr/bin/env node
/**
 * build-data.js — Generador de datasets para el Dashboard de Homicidios (PDET)
 * ---------------------------------------------------------------------------
 * Lee el CSV fuente `homicidios_pdet.csv` (raíz del repo) y produce:
 *
 *   data/dataset.json  -> Bundle pre-agregado y minificado (Top 10 por variable).
 *   data/records.csv   -> Registros codificados (diccionarios + índices), para
 *                         filtrado interactivo 100% en el navegador.
 *
 * Uso:  node tools/build-data.js
 * Sin dependencias externas. Node >= 18.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'homicidios_pdet.csv');
const OUT_DIR = path.join(ROOT, 'data');

const TOP_N = 10; // Top-N por variable (el bundle trae 10; la app recalcula en vivo)

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Crea un diccionario {etiqueta -> índice} preservando orden de aparición. */
function makeDic() {
  const idx = new Map();
  const arr = [];
  return {
    add(label) {
      let i = idx.get(label);
      if (i === undefined) {
        i = arr.length;
        idx.set(label, i);
        arr.push(label);
      }
      return i;
    },
    get(label) {
      return idx.get(label);
    },
    array: arr,
  };
}

/** Top-N de un Map<string, number> -> [[label, value], ...] */
function topN(map, n) {
  return [...map.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))
    .slice(0, n);
}

/** Top-N devolviendo dos arreglos paralelos compactos: {l:[...], v:[...]} */
function topPack(map, n) {
  const t = topN(map, n);
  return { l: t.map((x) => x[0]), v: t.map((x) => x[1]) };
}

/* ------------------------------------------------------------------ */
/* 1. Lectura del CSV fuente                                          */
/* ------------------------------------------------------------------ */

function readSource() {
  if (!fs.existsSync(SRC)) {
    console.error(`\n  ✖ No se encontró el archivo fuente: ${SRC}\n`);
    process.exit(1);
  }

  const raw = fs.readFileSync(SRC, 'utf8');
  const lines = raw.split(/\r?\n/);
  const header = lines[0];

  const columns = header.split(',').map((c) => c.trim());
  const ci = {
    fecha: columns.indexOf('FECHA HECHO'),
    codDepto: columns.indexOf('COD_DEPTO'),
    depto: columns.indexOf('DEPARTAMENTO'),
    codMuni: columns.indexOf('COD_MUNI'),
    muni: columns.indexOf('MUNICIPIO'),
    zona: columns.indexOf('ZONA'),
    sexo: columns.indexOf('SEXO'),
    arma: columns.indexOf('ARMA MEDIO'),
    modalidad: columns.findIndex((c) => c.startsWith('MODALIDAD')),
    spoa: columns.findIndex((c) => c.startsWith('SPOA')),
    cantidad: columns.indexOf('CANTIDAD'),
  };

  for (const [k, v] of Object.entries(ci)) {
    if (v < 0) {
      console.error(`\n  ✖ Columna no encontrada en el CSV: ${k}\n     Encabezado: ${header}\n`);
      process.exit(1);
    }
  }

  const dict = {
    departments: makeDic(),
    municipalities: makeDic(),
    sexes: makeDic(),
    zones: makeDic(),
    weapons: makeDic(),
    modalities: makeDic(),
    spoa: makeDic(),
  };

  const deptMunicipalities = new Map(); // deptIdx -> Set(muniIdx)
  const muniMeta = []; // {name, deptIdx}
  const muniFirstSeen = new Map();

  const records = []; // {y, m, d, dept, muni, sex, zone, weapon, modality, spoa, count}
  const dailyTotals = new Map(); // "YYYY-MM-DD" -> count (para detectar picos)

  let skipped = 0;
  let rowCount = 0;
  let victimTotal = 0;
  let minDate = null;
  let maxDate = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const c = line.split(',');
    if (c.length < 11) {
      skipped++;
      continue;
    }

    const fecha = c[ci.fecha].trim();
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fecha);
    if (!m) {
      skipped++;
      continue;
    }
    const d = +m[1];
    const mo = +m[2];
    const y = +m[3];

    const deptName = c[ci.depto].trim();
    const muniName = c[ci.muni].trim();
    const deptCode = c[ci.codDepto].trim();
    const muniCode = c[ci.codMuni].trim();

    const deptIdx = dict.departments.add(deptName);
    const muniKey = `${muniCode}|${muniName}`;
    let muniIdx = muniFirstSeen.get(muniKey);
    if (muniIdx === undefined) {
      muniIdx = dict.municipalities.add(muniName);
      muniFirstSeen.set(muniKey, muniIdx);
      muniMeta[muniIdx] = { name: muniName, code: muniCode, dept: deptIdx, deptCode };
    } else if (muniMeta[muniIdx].code !== muniCode && muniCode) {
      // Mismo nombre de municipio en otro departamento -> entrada propia.
      const alt = `${muniCode}|${muniName}`;
      let altIdx = muniFirstSeen.get(alt + '#alt');
      if (altIdx === undefined) {
        altIdx = dict.municipalities.add(muniName);
        muniFirstSeen.set(alt + '#alt', altIdx);
        muniMeta[altIdx] = { name: muniName, code: muniCode, dept: deptIdx, deptCode };
      }
      muniIdx = altIdx;
    }

    const sexIdx = dict.sexes.add(c[ci.sexo].trim() || 'SIN ESTABLECER');
    const zoneIdx = dict.zones.add(c[ci.zona].trim() || 'SIN ESTABLECER');
    const weaponIdx = dict.weapons.add(c[ci.arma].trim() || 'SIN REPORTAR');
    const modalityIdx = dict.modalities.add(c[ci.modalidad].trim() || 'SIN REPORTAR');
    const spoaIdx = dict.spoa.add(c[ci.spoa].trim() || 'SIN REPORTAR');

    const count = Number.parseInt(c[ci.cantidad], 10) || 1;

    if (!deptMunicipalities.has(deptIdx)) deptMunicipalities.set(deptIdx, new Set());
    deptMunicipalities.get(deptIdx).add(muniIdx);

    records.push({ y, m: mo, d, dept: deptIdx, muni: muniIdx, sex: sexIdx, zone: zoneIdx, weapon: weaponIdx, modality: modalityIdx, spoa: spoaIdx, count });

    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dailyTotals.set(iso, (dailyTotals.get(iso) || 0) + count);

    rowCount++;
    victimTotal += count;
    if (!minDate || iso < minDate) minDate = iso;
    if (!maxDate || iso > maxDate) maxDate = iso;
  }

  return {
    columns,
    dict,
    records,
    muniMeta,
    deptMunicipalities,
    dailyTotals,
    stats: { rowCount, victimTotal, skipped, minDate, maxDate },
  };
}

/* ------------------------------------------------------------------ */
/* 2. Agregación                                                       */
/* ------------------------------------------------------------------ */

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Normaliza el medio/arma a una familia legible. */
function weaponFamily(label) {
  const s = label.toUpperCase();
  if (/DE FUEGO/.test(s)) return 'Arma de fuego';
  if (/BLANCA|CORTOPUNZANTE|CORTANTE|PUNZANTE|MACHETE|CUCHILLO/.test(s)) return 'Arma blanca / cortopunzante';
  if (/CONTUNDENTE|ALMOHADA|BLOQUE|PIEDRA|OBJETO/.test(s)) return 'Objeto contundente';
  if (/EXPLOSIV|BOMBA|GRANADA|MINA|ROCKET|PAPA|POLVORA|DRON|ARTEFACTO/.test(s)) return 'Explosivos';
  if (/VENENO|TOXIC|LICOR|MEDICAMENTO|JERINGA|ALIMENTOS|QUIMICO|SUSTANCIA/.test(s)) return 'Sustancias / tóxicos';
  if (/CUERDA|SOGA|CADENA|CINTAS|CINTURON|PRENDAS|BOLSA/.test(s)) return 'Asfixia / estrangulamiento';
  if (/SIN EMPLEO DE ARMAS/.test(s)) return 'Sin empleo de armas';
  if (/NO REPORTADO|SIN ESTABLECER|^$/.test(s)) return 'Sin reportar / sin establecer';
  return 'Otros medios';
}

/** Agrupa modalidades en categorías temáticas. */
function modalityGroup(label) {
  const s = label.toUpperCase();
  if (/^ENFRENTAMIENTO|ATACADOS POR|TERRORISMO|AMOTINAMIENTO/.test(s)) return 'Violencia armada / conflicto';
  if (/SICARIATO/.test(s)) return 'Sicariato';
  if (/RI[ÑN]A|VIOLENCIA INTRAFAMILIAR|RIÑA ENTRE/.test(s)) return 'Riñas y violencia interpersonal';
  if (/ATRACO|SECUESTRO|FORCEJEO|FRUSTRACION|LINCHAMIENTO|PROTESTA|SACADO FUERZA/.test(s)) return 'Otras circunstancias';
  if (/VIOLENCIA SEXUAL|SIGNOS DE VIOLENCIA|TORTURA/.test(s)) return 'Violencia sexual / tortura';
  if (/DEGOLL|DECAPIT|DESMEMBR|INCINER|QUEMADURA|AHOGAMIENTO|AHORCAMIENTO|ESTRANGUL|SOFOCACION|ENVENENAMIENTO|INHALACION|LANZAMIENTO|EMPLEO DE SUSTANCIAS/.test(s)) return 'Mecanismo violento específico';
  if (/NO REPORTADA|POR ESTABLECER|^$/.test(s)) return 'No reportada / por establecer';
  return 'Otras circunstancias';
}

function aggregate(src) {
  const { dict, records, muniMeta, deptMunicipalities, dailyTotals, stats } = src;

  const years = new Set();
  const byYear = new Map();
  const byDept = new Map();
  const byMuni = new Map();
  const bySex = new Map();
  const byZone = new Map();
  const byWeapon = new Map();
  const byModality = new Map();
  const bySpoa = new Map();
  const byMonth = new Map();
  const byWeekday = new Map();
  const byDayOfMonth = new Map();
  const byYearMonth = new Map(); // "YYYY-MM"
  const byWeaponFamily = new Map();
  const byModalityGroup = new Map();

  const deptYear = new Map(); // deptIdx -> Map(year -> count)
  const yearSex = new Map(); // year -> Map(sexIdx -> count)
  const deptWeapon = new Map(); // deptIdx -> Map(weaponIdx -> count)
  const deptSex = new Map();
  const muniYearTop = new Map(); // muniIdx -> Map(year -> count)

  const bump = (map, key, val) => map.set(key, (map.get(key) || 0) + val);

  for (const r of records) {
    const n = r.count;
    years.add(r.y);
    bump(byYear, r.y, n);
    bump(byDept, r.dept, n);
    bump(byMuni, r.muni, n);
    bump(bySex, r.sex, n);
    bump(byZone, r.zone, n);
    bump(byWeapon, r.weapon, n);
    bump(byModality, r.modality, n);
    bump(bySpoa, r.spoa, n);
    bump(byMonth, r.m, n);
    bump(byWeekday, new Date(Date.UTC(r.y, r.m - 1, r.d)).getUTCDay(), n);
    bump(byDayOfMonth, r.d, n);
    bump(byYearMonth, `${r.y}-${String(r.m).padStart(2, '0')}`, n);
    bump(byWeaponFamily, weaponFamily(dict.weapons.array[r.weapon]), n);
    bump(byModalityGroup, modalityGroup(dict.modalities.array[r.modality]), n);

    if (!deptYear.has(r.dept)) deptYear.set(r.dept, new Map());
    bump(deptYear.get(r.dept), r.y, n);

    if (!yearSex.has(r.y)) yearSex.set(r.y, new Map());
    bump(yearSex.get(r.y), r.sex, n);

    if (!deptWeapon.has(r.dept)) deptWeapon.set(r.dept, new Map());
    bump(deptWeapon.get(r.dept), r.weapon, n);

    if (!deptSex.has(r.dept)) deptSex.set(r.dept, new Map());
    bump(deptSex.get(r.dept), r.sex, n);

    if (!muniYearTop.has(r.muni)) muniYearTop.set(r.muni, new Map());
    bump(muniYearTop.get(r.muni), r.y, n);
  }

  const yearList = [...years].sort((a, b) => a - b);
  const total = stats.victimTotal;

  // Picos: días con más homicidios + mejor/peor año.
  const dayPeaks = [...dailyTotals.entries()]
    .filter(([, v]) => v >= 10)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([date, value]) => ({ date, value }));

  const yearRows = yearList.map((y) => {
    const count = byYear.get(y) || 0;
    return { year: y, count };
  });

  const sortedYearRows = [...yearRows].sort((a, b) => b.count - a.count);
  const peakYear = sortedYearRows[0] || null;
  const lowYear = sortedYearRows[sortedYearRows.length - 1] || null;

  // Departamentos
  const departments = [...byDept.entries()]
    .map(([idx, count]) => {
      const dYear = deptYear.get(idx) || new Map();
      const dWeap = deptWeapon.get(idx) || new Map();
      const dSex = deptSex.get(idx) || new Map();
      const topWeapon = topN(dWeap, 1)[0];
      const topMuni = topN(
        new Map(
          [...(deptMunicipalities.get(idx) || [])].map((mi) => [mi, byMuni.get(mi) || 0])
        ),
        1
      )[0];
      const fem = dSex.get(dict.sexes.get('FEMENINO')) || 0;
      const muniCount = (deptMunicipalities.get(idx) || new Set()).size;
      return {
        name: dict.departments.array[idx],
        count,
        share: +(count / total * 100).toFixed(2),
        municipalities: muniCount,
        topWeapon: topWeapon ? dict.weapons.array[topWeapon[0]] : '—',
        topMunicipality: topMuni ? muniMeta[topMuni[0]].name : '—',
        femicides: fem,
        series: yearList.map((y) => ({ year: y, count: dYear.get(y) || 0 })),
      };
    })
    .sort((a, b) => b.count - a.count);

  // Municipios (Top global)
  const municipalities = [...byMuni.entries()]
    .map(([idx, count]) => {
      const meta = muniMeta[idx];
      const ySer = muniYearTop.get(idx) || new Map();
      return {
        name: meta.name,
        code: meta.code,
        department: dict.departments.array[meta.dept],
        count,
        share: +(count / total * 100).toFixed(2),
        avgPerYear: +(count / yearList.length).toFixed(1),
        series: yearList.map((y) => ({ year: y, count: ySer.get(y) || 0 })),
      };
    })
    .sort((a, b) => b.count - a.count);

  const muniPerDept = dict.departments.array.map((name, idx) => ({
    name,
    municipalities: (deptMunicipalities.get(idx) || new Set()).size,
  }));

  // Series mensuales completas (para gráfico de línea)
  const timeline = [...byYearMonth.entries()]
    .map(([key, count]) => {
      const [y, m] = key.split('-').map(Number);
      return { y, m, count };
    })
    .sort((a, b) => a.y - b.y || a.m - b.m);

  // Top 10 de cada variable observada.
  const toEntries = (map, labels) =>
    topPack(new Map([...map.entries()].map(([k, v]) => [labels[k], v])), TOP_N);

  const bundle = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'homicidios_pdet.csv',
      author: 'John A. Echeverry O. — Analista de Datos',
      contact: 'echeverri58@gmail.com · Cel: 3217466359',
      requestedBy: 'Mauricio García',
      sources: [
        {
          name: 'HOMICIDIO — Portal de Datos Abiertos de Colombia',
          url: 'https://www.datos.gov.co/Seguridad-y-Defensa/HOMICIDIO/m8fd-ahd9/explore/query/SELECT%0A%20%20%60fecha_hecho%60%2C%0A%20%20%60cod_depto%60%2C%0A%20%20%60departamento%60%2C%0A%20%20%60cod_muni%60%2C%0A%20%20%60municipio%60%2C%0A%20%20%60zona%60%2C%0A%20%20%60sexo%60%2C%0A%20%20%60arma_medio%60%2C%0A%20%20%60_modalidad_presunta%60%2C%0A%20%20%60spoa_caracterizacion%60%2C%0A%20%20%60cantidad%60%0AORDER%20BY%20%60fecha_hecho%60%20DESC%20NULL%20LAST/page/filter',
        },
        {
          name: 'Municipios PDET — Portal de Datos Abiertos de Colombia',
          url: 'https://www.datos.gov.co/Agricultura-y-Desarrollo-Rural/Municipios-PDET/idrk-ba8y/explore/query/SELECT%0A%20%20%60cod_subreg%60%2C%0A%20%20%60nom_subreg%60%2C%0A%20%20%60cod_depto%60%2C%0A%20%20%60nom_depto%60%2C%0A%20%20%60cod_muni%60%2C%0A%20%20%60nom_muni%60/page/filter',
        },
      ],
      sourceRows: stats.rowCount,
      total: stats.victimTotal,
      minDate: stats.minDate,
      maxDate: stats.maxDate,
      minYear: yearList[0],
      maxYear: yearList[yearList.length - 1],
      yearCount: yearList.length,
      departments: dict.departments.array.length,
      municipalities: dict.municipalities.array.length,
      skipped: stats.skipped,
      avgPerYear: +(total / yearList.length).toFixed(1),
      peakYear,
      lowYear,
      topN: TOP_N,
    },
    columns: src.columns,
    years: yearList,
    timeline,
    yearRows,
    departments,
    municipalities,
    muniPerDept,
    dayPeaks,
    top: {
      year: topPack(byYear, TOP_N),
      department: toEntries(byDept, dict.departments.array),
      municipality: toEntries(byMuni, muniMeta.map((m) => `${m.name} (${dict.departments.array[m.dept]})`)),
      sex: toEntries(bySex, dict.sexes.array),
      zone: toEntries(byZone, dict.zones.array),
      weapon: toEntries(byWeapon, dict.weapons.array),
      modality: toEntries(byModality, dict.modalities.array),
      spoa: toEntries(bySpoa, dict.spoa.array),
      weaponFamily: topPack(byWeaponFamily, TOP_N),
      modalityGroup: topPack(byModalityGroup, TOP_N),
      month: { l: MONTHS_ES.filter((_, i) => (byMonth.get(i + 1) || 0) > 0), v: MONTHS_ES.map((_, i) => byMonth.get(i + 1) || 0).filter((v) => v > 0) },
      weekday: {
        l: WEEKDAYS_ES.filter((_, i) => byWeekday.has(i)),
        v: WEEKDAYS_ES.map((_, i) => byWeekday.get(i) || 0).filter((v, i) => byWeekday.has(i)),
      },
      dayOfMonth: topPack(byDayOfMonth, 31),
    },
    distributions: {
      sex: topPack(bySex, 99),
      zone: topPack(byZone, 99),
      weaponFamily: topPack(byWeaponFamily, 99),
      modalityGroup: topPack(byModalityGroup, 99),
      spoa: topPack(bySpoa, 99),
    },
    crosstab: {
      yearSex: yearList.map((y) => ({
        year: y,
        values: dict.sexes.array.map((_, i) => (yearSex.get(y) || new Map()).get(i) || 0),
      })),
      sexLabels: dict.sexes.array,
    },
  };

  return bundle;
}

/* ------------------------------------------------------------------ */
/* 3. Serialización de registros codificados                           */
/* ------------------------------------------------------------------ */

function writeRecords(src, outPath) {
  const { dict, records, muniMeta } = src;
  const lines = [];

  // Diccionarios: una línea por dimensión, valores separados por \u0001.
  const S = '\u0001';
  lines.push('#dic');
  lines.push(['departments', ...dict.departments.array].join(S));
  lines.push(['municipalities', ...dict.municipalities.array].join(S));
  lines.push(['sexes', ...dict.sexes.array].join(S));
  lines.push(['zones', ...dict.zones.array].join(S));
  lines.push(['weapons', ...dict.weapons.array].join(S));
  lines.push(['modalities', ...dict.modalities.array].join(S));
  lines.push(['spoa', ...dict.spoa.array].join(S));
  lines.push(['muniDept', ...muniMeta.map((m) => m.dept)].join(S));
  lines.push(['muniCode', ...muniMeta.map((m) => m.code)].join(S));

  // Registros: y|m|d|dept|muni|sex|zone|weapon|modality|spoa|count
  const body = new Array(records.length);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    body[i] = `${r.y}|${r.m}|${r.d}|${r.dept}|${r.muni}|${r.sex}|${r.zone}|${r.weapon}|${r.modality}|${r.spoa}|${r.count}`;
  }
  lines.push('#data');
  for (const b of body) lines.push(b);

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return Buffer.byteLength(lines.join('\n'), 'utf8');
}

/* ------------------------------------------------------------------ */
/* 4. Main                                                             */
/* ------------------------------------------------------------------ */

function main() {
  const t0 = Date.now();
  console.log('\n  ▸ Dashboard Homicidios PDET — build de datos');
  console.log('  ' + '─'.repeat(52));

  const src = readSource();
  console.log(`  ✓ CSV leído: ${src.stats.rowCount.toLocaleString('es-CO')} filas · ${src.stats.victimTotal.toLocaleString('es-CO')} víctimas`);
  console.log(`  ✓ Rango: ${src.stats.minDate} → ${src.stats.maxDate}`);
  console.log(`  ✓ ${src.dict.departments.array.length} departamentos · ${src.dict.municipalities.array.length} municipios`);
  if (src.stats.skipped) console.log(`  ! Filas descartadas: ${src.stats.skipped}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const bundle = aggregate(src);
  const bundlePath = path.join(OUT_DIR, 'dataset.json');
  fs.writeFileSync(bundlePath, JSON.stringify(bundle), 'utf8');
  const bundleSize = fs.statSync(bundlePath).size;

  const recordsPath = path.join(OUT_DIR, 'records.csv');
  const recordsSize = writeRecords(src, recordsPath);

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`  ✓ data/dataset.json  ${kb(bundleSize)}`);
  console.log(`  ✓ data/records.csv   ${kb(recordsSize)}`);
  console.log(`  ✓ Listo en ${Date.now() - t0} ms\n`);
}

main();
