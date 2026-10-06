/**
 * app.js — Orquestador del dashboard: carga de datos, filtros, render y eventos.
 */

import {
  $, $$, num, pct, debounce, downloadCsv, storedTheme, storeTheme, rafThrottle, dateLong, ellipsis,
} from './utils.js';
import {
  state, loadBundle, loadRecords, labels, query, activeFilterCount, EMPTY_FILTERS, weaponFamily,
} from './data.js';
import {
  lineChart, barChart, hBarChart, donutChart, redrawAll, readThemeFromCss, hideTip,
} from './charts.js';
import {
  renderKpis, renderRank, renderChips, renderFilterSummary, renderTable, exportTableCsv,
  renderFindings, renderSourceNote, renderEmpty,
} from './ui.js';

/* ------------------------------------------------------------------ */
/* Estado de la interfaz                                               */
/* ------------------------------------------------------------------ */

const ui = {
  trendGran: 'year',      // 'year' | 'month'
  deptMetric: 'total',    // 'total' | 'fem' | 'rural'
};

let filters = { ...EMPTY_FILTERS };
let result = null;

/* ------------------------------- Nodos ---------------------------- */

const N = {
  status: $('#dataStatus'),
  btnFilters: $('#btnFilters'),
  filters: $('#filters'),
  overlay: $('#overlay'),
  filterCount: $('#filterCount'),
  filterSummary: $('#filterSummary'),
  chips: $('#activeChips'),
  kpis: $('#kpis'),
  trend: $('#chartTrend'),
  trendSub: $('#trendSub'),
  trendFoot: $('#trendFoot'),
  rankYear: $('#rankYear'),
  month: $('#chartMonth'),
  weekday: $('#chartWeekday'),
  dayOfMonth: $('#chartDayOfMonth'),
  rankDept: $('#rankDept'),
  rankMuni: $('#rankMuni'),
  rankWeapon: $('#rankWeapon'),
  rankModality: $('#rankModality'),
  rankSex: $('#rankSex'),
  rankZone: $('#rankZone'),
  rankSpoa: $('#rankSpoa'),
  rankWeaponFamily: $('#rankWeaponFamily'),
  sex: $('#chartSex'),
  zone: $('#chartZone'),
  spoa: $('#chartSpoa'),
  dept: $('#chartDept'),
  deptBarSub: $('#deptBarSub'),
  table: $('#detailTable'),
  findings: $('#findings'),
  sourceNote: $('#sourceNote'),
  brandRange: $('#brandRange'),
  footMeta: $('#footMeta'),
  live: $('#liveRegion'),
  navFilters: $('#navFilters'),
  btnTheme: $('#btnTheme'),
};

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

boot();

async function boot() {
  applyTheme(storedTheme(), { silent: true });
  bindChrome();

  try {
    setStatus('loading', 'Cargando datos…');
    const bundle = await loadBundle();

    // Filtros por defecto = rango completo.
    filters.yearFrom = bundle.meta.minYear;
    filters.yearTo = bundle.meta.maxYear;

    // Primer render: estructura y aviso de carga (instantáneo).
    renderSkeleton();
    setStatus('partial', 'Datos agregados listos · cargando detalle…');

    // Hidratación de registros para el filtrado en vivo.
    await loadRecords();
    populateFilterOptions();
    runQueryAndRender();
    setStatus('ready', `Listo · ${num(state.records.length / 11)} registros`);
    announce(`Datos cargados: ${num(bundle.meta.total)} homicidios en ${num(bundle.meta.municipalities)} municipios.`);
    void weaponFamily;
  } catch (err) {
    console.error(err);
    setStatus('error', 'Error al cargar los datos');
    showFatal(err);
  }
}

function setStatus(kind, text) {
  if (!N.status) return;
  N.status.className = `pill${kind === 'ready' ? ' is-ready' : kind === 'error' ? ' is-error' : ' pill--live'}`;
  N.status.replaceChildren(Object.assign(document.createElement('i'), { className: 'dot' }));
  N.status.append(document.createTextNode(` ${text}`));
}

function announce(msg) {
  if (N.live) N.live.textContent = msg;
}

function showFatal(err) {
  const isFile = location.protocol === 'file:';
  N.kpis.replaceChildren();
  N.kpis.innerHTML = `
    <article class="kpi kpi--hero" style="--k-color: var(--accent)">
      <p class="kpi__label"><span>No se pudieron cargar los datos</span></p>
      <p class="kpi__value" style="font-size:20px">${err.message}</p>
      <p class="kpi__foot">${isFile
        ? 'El navegador bloquea <code>fetch()</code> sobre <code>file://</code>. Ejecuta un servidor local: <code>npm run serve</code> (o <code>python -m http.server 8080</code>) y abre <code>http://localhost:8080</code>.'
        : 'Verifica que existan <code>data/dataset.json</code> y <code>data/records.csv</code> (generados con <code>npm run build:data</code>).'}</p>
    </article>`;
}

/* ------------------------------------------------------------------ */
/* Filtros: opciones y lectura                                         */
/* ------------------------------------------------------------------ */

function populateFilterOptions() {
  const L = labels();
  const b = state.bundle;

  fillSelect($('#fDept'), L.departments, 'Todos los departamentos');
  fillSelect($('#fSex'), L.sexes, 'Todos');
  fillSelect($('#fZone'), L.zones, 'Todas');
  fillSelect($('#fWeapon'), L.weapons, 'Todos');
  fillSelect($('#fModality'), L.modalities, 'Todas');
  fillSelect($('#fSpoa'), L.spoa, 'Todas');

  const years = b.years;
  const yFrom = $('#fYearFrom');
  const yTo = $('#fYearTo');
  yFrom.replaceChildren(...years.map((y) => new Option(String(y), String(y))));
  yTo.replaceChildren(...years.map((y) => new Option(String(y), String(y))));
  yFrom.value = String(filters.yearFrom);
  yTo.value = String(filters.yearTo);

  N.brandRange.textContent = `${b.meta.minYear}–${b.meta.maxYear}`;
  N.footMeta.textContent = `HOMICIDIO (datos.gov.co) × Municipios PDET (datos.gov.co) · ${num(b.meta.sourceRows)} filas · ${num(b.meta.total)} víctimas · ${b.meta.minDate} a ${b.meta.maxDate}`;
  document.title = `Observatorio de Homicidios PDET ${b.meta.minYear}–${b.meta.maxYear} · Colombia`;
}

function fillSelect(select, values, allLabel) {
  if (!select) return;
  select.replaceChildren(new Option(allLabel, ''));
  for (const v of values) select.append(new Option(ellipsis(v, 46), v));
}

function readFilters() {
  const yFrom = Number($('#fYearFrom').value);
  const yTo = Number($('#fYearTo').value);
  filters = {
    dept: $('#fDept').value,
    sex: $('#fSex').value,
    zone: $('#fZone').value,
    weapon: $('#fWeapon').value,
    modality: $('#fModality').value,
    spoa: $('#fSpoa').value,
    search: $('#fSearch').value.trim(),
    yearFrom: Math.min(yFrom, yTo),
    yearTo: Math.max(yFrom, yTo),
  };
}

/* ------------------------------------------------------------------ */
/* Ciclo de render                                                     */
/* ------------------------------------------------------------------ */

const scheduleRender = debounce(() => runQueryAndRender(), 160);

function requestRender() {
  scheduleRender();
}

function runQueryAndRender() {
  const next = query(filters);
  if (!next) return;
  result = next;
  renderAll();
}

/** Estado de espera mientras se descargan los registros. */
function renderSkeleton() {
  const m = state.bundle?.meta;
  if (!m) return;
  N.kpis.innerHTML = `
    <article class="kpi kpi--hero" style="--k-color: var(--accent)">
      <p class="kpi__label"><span>Cargando el detalle de los registros…</span></p>
      <p class="kpi__value">${num(m.total)}</p>
      <p class="kpi__foot">${num(m.sourceRows)} filas · ${m.minYear}–${m.maxYear} · preparando los rankings interactivos</p>
    </article>`;
}

function renderAll() {
  if (!result) return;
  readThemeFromCss();
  renderKpis(N.kpis, result);
  renderFilterSummary(N.filterSummary, filters, result);
  const nChips = renderChips(N.chips, filters, result.meta, removeFilter);
  syncFilterBadge(nChips);
  renderCharts();
  renderRankings();
  renderTable(N.table, result.details, result.total);
  renderFindings(N.findings, result);
  renderSourceNote(N.sourceNote, result.meta, result);
  syncControls();
}

function syncFilterBadge(n) {
  if (!N.filterCount) return;
  N.filterCount.hidden = !n;
  N.filterCount.textContent = n;
}

/** Mantiene los controles sincronizados (al filtrar desde un gráfico o ranking). */
function syncControls() {
  const set = (sel, val) => { const n = $(sel); if (n && n.value !== val) n.value = val; };
  set('#fDept', filters.dept);
  set('#fSex', filters.sex);
  set('#fZone', filters.zone);
  set('#fWeapon', filters.weapon);
  set('#fModality', filters.modality);
  set('#fSpoa', filters.spoa);
  set('#fYearFrom', String(filters.yearFrom ?? result.meta.minYear));
  set('#fYearTo', String(filters.yearTo ?? result.meta.maxYear));
  const s = $('#fSearch');
  if (s && s.value !== filters.search) s.value = filters.search;
}

/* ------------------------------ Gráficos -------------------------- */

function renderCharts() {
  const r = result;
  const s = r.series;

  // Tendencia
  const gran = ui.trendGran === 'year' ? s.year : s.month;
  const monthly = ui.trendGran === 'month';
  N.trendSub.textContent = monthly
    ? `Serie mensual · ${monthly ? s.month.labels.length : 0} puntos`
    : `Homicidios registrados por año · ${s.year.labels.length} años`;
  lineChart(N.trend, [{ name: monthly ? 'Homicidios del mes' : 'Homicidios del año', values: gran.values, labels: gran.labels }], {
    xLabels: gran.labels,
    showArea: !monthly,
    valueLabel: 'Homicidios',
    onClickPoint: monthly
      ? (i) => {
          const label = gran.labels[i];
          const [mm, yy] = label.split('/');
          const year = 2000 + Number(yy);
          filters.yearFrom = year;
          filters.yearTo = year;
          void mm;
          requestRender();
        }
      : (i) => {
          const year = Number(gran.labels[i]);
          filters.yearFrom = year;
          filters.yearTo = year;
          requestRender();
        },
  });

  const { peakYear, lowYear, avgPerYear, total, years } = r.summary;
  N.trendFoot.innerHTML = peakYear
    ? `Pico en <strong>${peakYear.year}</strong> con <strong>${num(peakYear.count)}</strong> homicidios ·
       promedio anual de <strong>${num(avgPerYear)}</strong> ·
       ${lowYear ? `mínimo en <strong>${lowYear.year}</strong> (${num(lowYear.count)})` : ''} ·
       total <strong>${num(total)}</strong> en <strong>${years}</strong> años.
       <em>Toca un punto para filtrar ese periodo.</em>`
    : 'Sin datos para el periodo seleccionado.';

  // Estacionalidad mensual (mes calendario)
  barChart(N.month, s.calendarMonth.labels.map((m) => ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][Number(m) - 1]), s.calendarMonth.values, {
    valueLabel: 'Homicidios',
    color: '#5aa9ff',
    gradientTo: '#35d0c0',
    highlight: null,
  });

  // Semana
  barChart(N.weekday, s.weekday.labels, s.weekday.values, {
    valueLabel: 'Homicidios',
    color: '#9b8cff',
    gradientTo: '#5aa9ff',
  });

  // Día del mes
  barChart(N.dayOfMonth, s.dayOfMonth.labels, s.dayOfMonth.values, {
    valueLabel: 'Homicidios',
    color: '#f5b544',
    gradientTo: '#ff7a5c',
  });

  // Comparativo departamentos
  const metric = ui.deptMetric;
  const metricKey = metric === 'fig' ? 'count' : metric === 'fem' ? 'fem' : 'rural';
  const metricLabel = metric === 'fig'
    ? 'Total de homicidios'
    : metric === 'fem'
      ? 'Homicidios de mujeres'
      : 'Homicidios en zona rural';
  const rows = [...r.details].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0)).slice(0, 14);
  N.deptBarSub.textContent = `${metricLabel} por departamento (según los filtros aplicados)`;
  barChart(
    N.dept,
    rows.map((d) => ellipsis(d.name, 14)),
    rows.map((d) => d[metricKey] || 0),
    { valueLabel: metricLabel, color: '#e63950', gradientTo: '#ff7a5c', rotateLabels: rows.length > 9 }
  );
}

/* ------------------------------ Rankings -------------------------- */

function renderRankings() {
  const r = result;
  const total = r.total;

  renderRank(N.rankYear, r.ranks.year, {
    total,
    metaOf: (row) => (Number(row[0]) === r.summary.peakYear?.year ? '· año pico' : ''),
    onPick: (name) => {
      const y = Number(name);
      filters.yearFrom = y;
      filters.yearTo = y;
      requestRender();
    },
  });

  renderRank(N.rankDept, r.ranks.department, {
    total,
    onPick: (name) => { filters.dept = name; filters.search = ''; requestRender(); },
  });

  renderRank(N.rankMuni, r.ranks.municipality, {
    total,
    metaOf: (row) => `<span class="rank__meta">${ellipsis(row[2] ?? '', 20)}</span>`,
    onPick: (name) => {
      filters.dept = '';
      filters.search = name;
      requestRender();
    },
  });

  renderRank(N.rankWeapon, r.ranks.weapon, {
    total,
    metaOf: (row) => `<span class="rank__meta">${weaponFamily(row[0])}</span>`,
    onPick: (name) => { filters.weapon = name; requestRender(); },
  });

  renderRank(N.rankModality, r.ranks.modality, {
    total,
    onPick: (name) => { filters.modality = name; requestRender(); },
  });

  renderRank(N.rankWeaponFamily, r.ranks.weaponFamily, { total });
  renderRank(N.rankSex, r.ranks.sex, { total, onPick: (name) => { filters.sex = name; requestRender(); } });
  renderRank(N.rankZone, r.ranks.zone, { total, onPick: (name) => { filters.zone = name; requestRender(); } });
  renderRank(N.rankSpoa, r.ranks.spoa, { total, onPick: (name) => { filters.spoa = name; requestRender(); } });

  // Dona: sexo
  donutChart(N.sex, r.ranks.sex.map((x) => x[0]), r.ranks.sex.map((x) => x[1]), {
    centerLabel: 'Víctimas',
    valueLabel: 'Víctimas',
  });
  donutChart(N.zone, r.ranks.zone.map((x) => x[0]), r.ranks.zone.map((x) => x[1]), {
    centerLabel: 'Hechos',
    valueLabel: 'Homicidios',
  });
  donutChart(N.spoa, r.ranks.spoa.map((x) => x[0]), r.ranks.spoa.map((x) => x[1]), {
    centerLabel: 'Hechos',
    valueLabel: 'Homicidios',
  });

  // Conteos en las etiquetas de cada tarjeta
  $$('.tag[data-count]').forEach((tag) => {
    const map = {
      dept: `${r.summary.departments} con datos · ${num(total)} casos`,
      muni: `${num(r.summary.municipalities)} con datos`,
      weapon: `${r.meta.dictSizes.weapons} categorías`,
      modality: `${r.meta.dictSizes.modalities} categorías`,
    };
    tag.textContent = map[tag.dataset.count] || '';
  });
}

/* ------------------------------------------------------------------ */
/* Interacción de la cabecera y filtros                                */
/* ------------------------------------------------------------------ */

function bindChrome() {
  // Abrir/cerrar filtros
  const openFilters = (open) => {
    if (!N.filters) return;
    N.filters.hidden = !open;
    N.btnFilters.setAttribute('aria-expanded', String(open));
    if (N.overlay) N.overlay.hidden = !open || window.scrollY < 40;
    if (open) $('#fDept')?.focus({ preventScroll: true });
  };

  N.btnFilters?.addEventListener('click', () => openFilters(N.filters.hidden));
  N.navFilters?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    openFilters(true);
  });
  N.overlay?.addEventListener('click', () => openFilters(false));
  $('#btnApplyClose')?.addEventListener('click', () => openFilters(false));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && N.filters && !N.filters.hidden) openFilters(false);
  });

  // Controles de filtro
  $$('#filters select').forEach((sel) => sel.addEventListener('change', () => { readFilters(); requestRender(); }));
  $('#fSearch')?.addEventListener('input', debounce(() => {
    readFilters();
    if (filters.search.length === 0 || filters.search.length >= 2) requestRender();
  }, 260));

  $('#btnReset')?.addEventListener('click', () => {
    resetFilters();
    requestRender();
    announce('Filtros restablecidos.');
  });

  // Exportar CSV del detalle
  $('#btnExport')?.addEventListener('click', () => {
    if (!result) return;
    const rows = exportTableCsv(result.details, result.total);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`homicidios-pdet-detalle-${stamp}.csv`, rows);
    announce('Exportación CSV generada.');
  });

  // Segmentado: granularidad de la tendencia
  $$('.seg__btn[data-gran]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.trendGran = btn.dataset.gran;
      $$('.seg__btn[data-gran]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      renderCharts();
    });
  });

  // Segmentado: métrica del comparativo departamental
  $$('.seg__btn[data-metric]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.deptMetric = btn.dataset.metric;
      $$('.seg__btn[data-metric]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      renderCharts();
    });
  });

  // Tema
  N.btnTheme?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    storeTheme(next);
    requestAnimationFrame(() => redrawAll());
  });

  // Navegación inferior: estado activo por scroll
  const sections = [
    ['kpis', $('#panel')],
    ['trend', $('#sec-trend')],
    ['rank', $('#sec-rankings-title')],
    ['table', $('#sec-table')],
  ];
  const navItems = $$('.navbar__item[data-nav]');
  const spy = rafThrottle(() => {
    const y = window.scrollY + 160;
    let current = 'kpis';
    for (const [key, node] of sections) {
      if (node && node.offsetTop <= y) current = key;
    }
    navItems.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === current));
  });
  window.addEventListener('scroll', spy, { passive: true });
  spy();

  // Overlay del panel de filtros en móvil
  window.addEventListener('scroll', () => {
    if (N.overlay && !N.overlay.hidden && window.scrollY < 40) return;
    if (N.overlay && !N.overlay.hidden && window.scrollY >= 40) N.overlay.hidden = true;
  }, { passive: true });

  window.addEventListener('blur', hideTip);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hideTip(); });
}

function resetFilters() {
  const m = state.bundle?.meta;
  filters = {
    ...EMPTY_FILTERS,
    yearFrom: m ? m.minYear : null,
    yearTo: m ? m.maxYear : null,
  };
  syncControls();
}

function removeFilter(key) {
  if (key === 'years') {
    filters.yearFrom = state.bundle.meta.minYear;
    filters.yearTo = state.bundle.meta.maxYear;
  } else {
    filters[key] = '';
  }
  syncControls();
  requestRender();
}

function applyTheme(theme, { silent = false } = {}) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f6fb' : '#070b14');
  if (!silent) readThemeFromCss();
}

/* ------------------------------------------------------------------ */
/* Atajos de teclado                                                   */
/* ------------------------------------------------------------------ */

document.addEventListener('keydown', (ev) => {
  if (ev.target.matches('input, select, textarea')) return;
  if (ev.key === 'f' || ev.key === 'F') {
    ev.preventDefault();
    N.btnFilters?.click();
  }
  if (ev.key === 'r' || ev.key === 'R') {
    resetFilters();
    requestRender();
  }
});

/* Exponer utilidades de depuración en consola (útil en desarrollo). */
window.PDET = { query, state, get result() { return result; }, get filters() { return filters; } };
void pct; void dateLong;
