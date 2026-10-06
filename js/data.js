/**
 * data.js — Carga de datasets y motor de consulta con filtros cruzados.
 *
 * Fuentes (generadas por tools/build-data.js):
 *   data/dataset.json -> bundle pre-agregado (primer render instantáneo).
 *   data/records.csv  -> registros codificados por índices (filtrado en vivo).
 */

import { topEntries, mapSum } from './utils.js';

/** Nombres de campo del dataset, en el orden de columnas de records.csv. */
const R_YEAR = 0, R_MONTH = 1, R_DAY = 2, R_DEPT = 3, R_MUNI = 4, R_SEX = 5, R_ZONE = 6, R_WEAPON = 7, R_MODALITY = 8, R_SPOA = 9, R_COUNT = 10;

/**
 * Población de referencia estimada (miles de habitantes) para los municipios
 * PDET incluidos en cada departamento. Es una base analítica interna para
 * comparar magnitudes entre departamentos: NO es una proyección oficial del
 * DANE ni corresponde a la población total del departamento.
 */
export const PDET_POP_MILES = {
  ANTIOQUIA: 1100,
  CAUCA: 650,
  'NARIÑO': 480,
  MAGDALENA: 380,
  'VALLE DEL CAUCA': 520,
  BOLIVAR: 620,
  CESAR: 420,
  'NORTE DE SANTANDER': 350,
  CHOCO: 300,
  TOLIMA: 320,
  PUTUMAYO: 260,
  META: 250,
  CORDOBA: 320,
  HUILA: 210,
  SUCRE: 240,
  ARAUCA: 200,
  'LA GUAJIRA': 220,
  GUAVIARE: 120,
};

export const state = {
  bundle: null,
  dicts: null,     // {key: [labels]}
  records: null,   // Int32Array plano (11 campos por registro)
  muniDept: null,  // Int32Array: dept por municipio
  muniCode: null,  // [string]
  ready: false,
  loadedAt: 0,
};

/* ------------------------------------------------------------------ */
/* Carga                                                               */
/* ------------------------------------------------------------------ */

async function getText(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${res.status})`);
  return res.text();
}

/** Carga el bundle agregado. */
export async function loadBundle() {
  const text = await getText('data/dataset.json');
  state.bundle = JSON.parse(text);
  return state.bundle;
}

/** Carga los registros codificados y arma el arreglo plano. */
export async function loadRecords() {
  const text = await getText('data/records.csv');
  const lines = text.split('\n');
  const dicts = {};
  let dataStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '#dic') continue;
    if (line === '#data') { dataStart = i + 1; break; }
    const parts = line.split('\u0001');
    const key = parts.shift();
    if (key) dicts[key] = parts;
  }
  if (dataStart < 0) throw new Error('records.csv no contiene la sección #data');

  const rows = lines.length - dataStart;
  const flat = new Int32Array(rows * 11);
  let k = 0;
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const p = line.split('|');
    flat[k++] = +p[0]; flat[k++] = +p[1]; flat[k++] = +p[2]; flat[k++] = +p[3];
    flat[k++] = +p[4]; flat[k++] = +p[5]; flat[k++] = +p[6]; flat[k++] = +p[7];
    flat[k++] = +p[8]; flat[k++] = +p[9]; flat[k++] = +p[10];
  }

  state.dicts = dicts;
  state.records = k === flat.length ? flat : flat.subarray(0, k);
  state.muniDept = dicts.muniDept.map(Number);
  state.muniCode = dicts.muniCode;
  state.ready = true;
  state.loadedAt = Date.now();
  return state;
}

/** Etiquetas legibles de los diccionarios (con nombres amigables). */
export function labels() {
  const d = state.dicts;
  return {
    departments: d.departments,
    municipalities: d.municipalities,
    sexes: d.sexes.map(friendlier),
    zones: d.zones.map(friendlier),
    weapons: d.weapons.map(friendlier),
    modalities: d.modalities.map(friendlier),
    spoa: d.spoa.map(friendlier),
  };
}

const FRIENDLY = {
  'NO REPORTA': 'No reporta',
  'SIN ESTABLECER': 'Sin establecer',
  'NO REPORTADO': 'No reportado',
  'NO REPORTADA': 'No reportada',
  'SIN REPORTAR': 'Sin reportar',
  'POR ESTABLECER': 'Por establecer',
  'MASCULINO': 'Masculino',
  'FEMENINO': 'Femenino',
  'RURAL': 'Rural',
  'URBANA': 'Urbana',
};
const friendlier = (s) => FRIENDLY[s] ?? (s === s.toUpperCase() ? titleish(s) : s);

function titleish(s) {
  return s
    .toLowerCase()
    .replace(/(^|[\s/(\-])([a-záéíóúñü])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\bGao\b/g, 'GAO')
    .replace(/\bEjer\b/g, 'EJER')
    .replace(/\bEl n\b/gi, 'ELN');
}

/* ------------------------------------------------------------------ */
/* Agrupaciones analíticas                                             */
/* ------------------------------------------------------------------ */

export function weaponFamily(label) {
  const s = String(label).toUpperCase();
  if (/DE FUEGO/.test(s)) return 'Arma de fuego';
  if (/BLANCA|CORTOPUNZANTE|CORTANTE|PUNZANTE|MACHETE|CUCHILLO/.test(s)) return 'Arma blanca / cortopunzante';
  if (/CONTUNDENTE|ALMOHADA|BLOQUE|PIEDRA|OBJETO/.test(s)) return 'Objeto contundente';
  if (/EXPLOSIV|BOMBA|GRANADA|MINA|ROCKET|PAPA|POLVORA|DRON|ARTEFACTO/.test(s)) return 'Explosivos';
  if (/VENENO|TOXIC|LICOR|MEDICAMENTO|JERINGA|ALIMENTOS|QUIMICO|SUSTANCIA/.test(s)) return 'Sustancias / tóxicos';
  if (/CUERDA|SOGA|CADENA|CINTAS|CINTURON|PRENDAS|BOLSA/.test(s)) return 'Asfixia / estrangulamiento';
  if (/SIN EMPLEO DE ARMAS/.test(s)) return 'Sin empleo de armas';
  if (/NO REPORTADO|SIN ESTABLECER|SIN REPORTAR|^$/.test(s)) return 'Sin reportar / sin establecer';
  return 'Otros medios';
}

export function modalityGroup(label) {
  const s = String(label).toUpperCase();
  if (/^ENFRENTAMIENTO|ATACADOS POR|TERRORISMO|AMOTINAMIENTO/.test(s)) return 'Violencia armada / conflicto';
  if (/SICARIATO/.test(s)) return 'Sicariato';
  if (/RI[ÑN]A|VIOLENCIA INTRAFAMILIAR/.test(s)) return 'Riñas y violencia interpersonal';
  if (/VIOLENCIA SEXUAL|SIGNOS DE VIOLENCIA|TORTURA/.test(s)) return 'Violencia sexual / tortura';
  if (/DEGOLL|DECAPIT|DESMEMBR|INCINER|QUEMADURA|AHOGAMIENTO|AHORCAMIENTO|ESTRANGUL|SOFOCACION|ENVENENAMIENTO|INHALACION|LANZAMIENTO|EMPLEO DE SUSTANCIAS/.test(s)) return 'Mecanismo violento específico';
  if (/NO REPORTADA|POR ESTABLECER|SIN REPORTAR|^$/.test(s)) return 'No reportada / por establecer';
  return 'Otras circunstancias';
}

/* ------------------------------------------------------------------ */
/* Filtros y consulta                                                  */
/* ------------------------------------------------------------------ */

export const EMPTY_FILTERS = Object.freeze({
  dept: '',
  yearFrom: null,
  yearTo: null,
  sex: '',
  zone: '',
  weapon: '',
  modality: '',
  spoa: '',
  search: '',
});

export function activeFilterCount(f) {
  let n = 0;
  if (f.dept) n++;
  if (f.sex) n++;
  if (f.zone) n++;
  if (f.weapon) n++;
  if (f.modality) n++;
  if (f.spoa) n++;
  if (f.search && f.search.trim().length >= 2) n++;
  const b = state.bundle?.meta;
  if (b) {
    const from = f.yearFrom ?? b.minYear;
    const to = f.yearTo ?? b.maxYear;
    if (from !== b.minYear || to !== b.maxYear) n++;
  }
  return n;
}

/** Ejecuta la consulta sobre los registros codificados. Devuelve null si aún no se han cargado. */
export function query(filters = EMPTY_FILTERS) {
  const rec = state.records;
  if (!rec || !state.dicts || !state.bundle) return null;
  const D = state.dicts;
  const bundle = state.bundle;
  const meta = bundle.meta;

  const minYear = meta.minYear;
  const maxYear = meta.maxYear;
  const yFrom = filters.yearFrom ?? minYear;
  const yTo = filters.yearTo ?? maxYear;

  // Resolución de índices de filtro (cadenas -> índices del diccionario).
  const iDept = filters.dept ? D.departments.indexOf(filters.dept) : -1;
  const iSex = filters.sex ? D.sexes.indexOf(filters.sex) : -1;
  const iZone = filters.zone ? D.zones.indexOf(filters.zone) : -1;
  const iWeapon = filters.weapon ? D.weapons.indexOf(filters.weapon) : -1;
  const iModality = filters.modality ? D.modalities.indexOf(filters.modality) : -1;
  const iSpoa = filters.spoa ? D.spoa.indexOf(filters.spoa) : -1;

  const search = (filters.search || '').trim().toLowerCase();
  const muniMatch = search.length >= 2 ? new Set() : null;
  if (muniMatch) {
    D.municipalities.forEach((name, i) => {
      if (name.toLowerCase().includes(search)) muniMatch.add(i);
    });
  }

  const deptMuni = state.muniDept;

  // ---- Acumuladores ------------------------------------------------
  const byYear = new Map();
  const byMonth = new Map();
  const byWeekday = new Map();
  const byDayOfMonth = new Map();
  const byDept = new Map();
  const byMuni = new Map();
  const bySex = new Map();
  const byZone = new Map();
  const byWeapon = new Map();
  const byModality = new Map();
  const bySpoa = new Map();
  const byWeaponFamily = new Map();
  const byModalityGroup = new Map();
  const byYearMonth = new Map();
  const deptDetail = new Map(); // dept -> {count, fem, rural, municipalities:Set, topWeapon:Map}

  let total = 0;
  let maxDailyDate = null;
  let maxDailyCount = 0;

  const bump = (map, key, val) => map.set(key, (map.get(key) || 0) + val);

  for (let i = 0; i < rec.length; i += 11) {
    if (iDept >= 0 && rec[i + R_DEPT] !== iDept) continue;
    if (iSex >= 0 && rec[i + R_SEX] !== iSex) continue;
    if (iZone >= 0 && rec[i + R_ZONE] !== iZone) continue;
    if (iWeapon >= 0 && rec[i + R_WEAPON] !== iWeapon) continue;
    if (iModality >= 0 && rec[i + R_MODALITY] !== iModality) continue;
    if (iSpoa >= 0 && rec[i + R_SPOA] !== iSpoa) continue;

    const y = rec[i + R_YEAR];
    if (y < yFrom || y > yTo) continue;

    const muni = rec[i + R_MUNI];
    if (muniMatch && !muniMatch.has(muni)) continue;

    const n = rec[i + R_COUNT];
    const dept = rec[i + R_DEPT];
    const mo = rec[i + R_MONTH];
    const day = rec[i + R_DAY];

    total += n;
    bump(byYear, y, n);
    bump(byMonth, mo, n);
    bump(byDayOfMonth, day, n);
    bump(byDept, dept, n);
    bump(byMuni, muni, n);
    bump(bySex, rec[i + R_SEX], n);
    bump(byZone, rec[i + R_ZONE], n);
    bump(byWeapon, rec[i + R_WEAPON], n);
    bump(byModality, rec[i + R_MODALITY], n);
    bump(bySpoa, rec[i + R_SPOA], n);
    bump(byWeaponFamily, weaponFamily(D.weapons[rec[i + R_WEAPON]]), n);
    bump(byModalityGroup, modalityGroup(D.modalities[rec[i + R_MODALITY]]), n);
    bump(byYearMonth, y * 100 + mo, n);

    const wd = new Date(Date.UTC(y, mo - 1, day)).getUTCDay();
    bump(byWeekday, wd, n);

    let det = deptDetail.get(dept);
    if (!det) {
      det = { count: 0, fem: 0, rural: 0, municipalities: new Set(), topWeapon: new Map() };
      deptDetail.set(dept, det);
    }
    det.count += n;
    if (rec[i + R_SEX] === D.sexes.indexOf('FEMENINO')) det.fem += n;
    if (D.zones[rec[i + R_ZONE]] === 'RURAL') det.rural += n;
    det.municipalities.add(muni);
    bump(det.topWeapon, rec[i + R_WEAPON], n);

    if (n > maxDailyCount) { maxDailyCount = n; maxDailyDate = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
  }

  // ---- Series temporales -------------------------------------------
  const yearsSpan = Math.max(1, yTo - yFrom + 1);
  const yearLabels = [];
  const yearValues = [];
  for (let y = yFrom; y <= yTo; y++) {
    yearLabels.push(String(y));
    yearValues.push(byYear.get(y) || 0);
  }

  const monthKeys = [...byYearMonth.keys()].sort((a, b) => a - b);
  const monthLabels = monthKeys.map((k) => {
    const y = Math.floor(k / 100);
    const m = k % 100;
    return `${String(m).padStart(2, '0')}/${String(y).slice(2)}`;
  });
  const monthValues = monthKeys.map((k) => byYearMonth.get(k));

  // ---- Rankings (Top 10 por variable) ------------------------------
  const rankDept = topEntries(new Map([...byDept].map(([i, v]) => [D.departments[i], v])), 10);
  const rankMuni = topEntries(
    new Map([...byMuni].map(([i, v]) => [`${D.municipalities[i]}|${D.departments[deptMuni[i]]}`, v])),
    10
  ).map(([key, v]) => {
    const [name, dept] = key.split('|');
    return [`${name}`, v, dept];
  });

  const bundleTop = bundle.top;
  const isPristine =
    !filters.dept && !filters.sex && !filters.zone && !filters.weapon && !filters.modality &&
    !filters.spoa && !muniMatch && yFrom === minYear && yTo === maxYear;

  const rankYear = topEntries(byYear, 10).map(([y, v]) => [String(y), v]);
  const rankSex = topEntries(new Map([...bySex].map(([i, v]) => [D.sexes[i], v])), 10);
  const rankZone = topEntries(new Map([...byZone].map(([i, v]) => [D.zones[i], v])), 10);
  const rankWeapon = topEntries(new Map([...byWeapon].map(([i, v]) => [D.weapons[i], v])), 10);
  const rankModality = topEntries(new Map([...byModality].map(([i, v]) => [D.modalities[i], v])), 10);
  const rankSpoa = topEntries(new Map([...bySpoa].map(([i, v]) => [D.spoa[i], v])), 10);
  const rankWeaponFamily = topEntries(byWeaponFamily, 10);
  const rankModalityGroup = topEntries(byModalityGroup, 10);

  // ---- Detalle por departamento ------------------------------------
  const yearCount = yearsSpan;
  const details = [];
  for (const [deptIdx, det] of deptDetail) {
    const name = D.departments[deptIdx];
    const topW = topEntries(det.topWeapon, 1)[0];
    const popMiles = PDET_POP_MILES[name];
    const rate = popMiles ? (det.count / yearCount / (popMiles * 1000)) * 100000 : null;
    details.push({
      name,
      count: det.count,
      fem: det.fem,
      rural: det.rural,
      ruralPct: det.count ? (det.rural / det.count) * 100 : 0,
      share: total ? (det.count / total) * 100 : 0,
      municipalities: det.municipalities.size,
      topWeapon: topW ? D.weapons[topW[0]] : '—',
      rate,
    });
  }
  details.sort((a, b) => b.count - a.count);

  // ---- Lecturas rápidas --------------------------------------------
  const sortedYears = [...byYear.entries()].sort((a, b) => b[1] - a[1]);
  const peakYear = sortedYears[0] ? { year: sortedYears[0][0], count: sortedYears[0][1] } : null;
  const lowYear = sortedYears.length > 1
    ? { year: sortedYears[sortedYears.length - 1][0], count: sortedYears[sortedYears.length - 1][1] }
    : null;

  const weaponsTotal = mapSum(byWeapon);
  const firearmCount = [...byWeapon.entries()]
    .filter(([i]) => weaponFamily(D.weapons[i]) === 'Arma de fuego')
    .reduce((a, [, v]) => a + v, 0);

  const femCount = bySex.get(D.sexes.indexOf('FEMENINO')) || 0;
  const femicideCount = (() => {
    const i = D.spoa.indexOf('FEMINICIDIO');
    return i >= 0 ? (bySpoa.get(i) || 0) : 0;
  })();

  const ruralCount = byZone.get(D.zones.indexOf('RURAL')) || 0;
  const urbanCount = byZone.get(D.zones.indexOf('URBANA')) || 0;

  const municipalityCount = byMuni.size;

  const result = {
    filters,
    pristine: isPristine,
    total,
    meta: {
      ...meta,
      dictSizes: {
        weapons: D.weapons.length,
        modalities: D.modalities.length,
        sexes: D.sexes.length,
        departments: D.departments.length,
        municipalities: D.municipalities.length,
      },
    },
    summary: {
      total,
      years: yearCount,
      avgPerYear: total / yearCount,
      avgPerMonth: total / (yearCount * 12),
      avgPerDay: total / (yearCount * 365.25),
      departments: byDept.size,
      municipalities: municipalityCount,
      fem: femCount,
      femPct: total ? (femCount / total) * 100 : 0,
      femicide: femicideCount,
      rural: ruralCount,
      urban: urbanCount,
      ruralPct: total ? (ruralCount / total) * 100 : 0,
      urbanPct: total ? (urbanCount / total) * 100 : 0,
      firearm: firearmCount,
      firearmPct: weaponsTotal ? (firearmCount / weaponsTotal) * 100 : 0,
      peakYear,
      lowYear,
      maxDaily: maxDailyCount ? { date: maxDailyDate, count: maxDailyCount } : null,
      topDept: rankDept[0] ? { name: rankDept[0][0], count: rankDept[0][1] } : null,
      topMuni: rankMuni[0] ? { name: rankMuni[0][0], dept: rankMuni[0][2], count: rankMuni[0][1] } : null,
      topWeapon: rankWeapon[0] ? { name: rankWeapon[0][0], count: rankWeapon[0][1] } : null,
      topModality: rankModality[0] ? { name: rankModality[0][0], count: rankModality[0][1] } : null,
      yearSpan: `${Math.min(yFrom, yTo)}–${Math.max(yFrom, yTo)}`,
    },
    series: {
      year: { labels: yearLabels, values: yearValues },
      month: { labels: monthLabels, values: monthValues },
      calendarMonth: {
        labels: Array.from({ length: 12 }, (_, i) => i + 1).map((m) => String(m)),
        values: Array.from({ length: 12 }, (_, i) => byMonth.get(i + 1) || 0),
      },
      weekday: {
        labels: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
        values: Array.from({ length: 7 }, (_, i) => byWeekday.get(i) || 0),
      },
      dayOfMonth: {
        labels: Array.from({ length: 31 }, (_, i) => String(i + 1)),
        values: Array.from({ length: 31 }, (_, i) => byDayOfMonth.get(i + 1) || 0),
      },
    },
    ranks: {
      year: rankYear,
      department: rankDept,
      municipality: rankMuni,
      sex: rankSex,
      zone: rankZone,
      weapon: rankWeapon,
      modality: rankModality,
      spoa: rankSpoa,
      weaponFamily: rankWeaponFamily,
      modalityGroup: rankModalityGroup,
    },
    details,
    maps: {
      byYear, byMonth, byWeekday, byDayOfMonth, byDept, byMuni, bySex, byZone,
      byWeapon, byModality, bySpoa, byWeaponFamily, byModalityGroup,
    },
    bundleTop,
  };

  return result;
}

/** Series por departamento (para el comparativo). */
export function deptSeriesMetric(metric, filters) {
  const base = query({ ...filters });
  return base;
}
