/**
 * ui.js — Construcción del DOM del dashboard a partir de un resultado de consulta.
 */

import { num, pct, pctNum, compact, dateLong, dateShort, ellipsis, el, mount, $ } from './utils.js';

/* --------------------------------- Iconos -------------------------------- */

const ICONS = {
  victims: '<path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.6-8 5.8V22h16v-2.2c0-3.2-3.6-5.8-8-5.8Z"/>',
  calendar: '<path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 8v10H5V10h14Z"/>',
  pin: '<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/>',
  trend: '<path fill="currentColor" d="M3 17l6-6 4 4 8-8v4h-2V9.4l-6 6-4-4L3.4 18 3 17Z"/>',
  female: '<path fill="currentColor" d="M12 2a5 5 0 0 0-1 9.9V14H8v2h3v4h2v-4h3v-2h-3v-2.1A5 5 0 0 0 12 2Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/>',
  gun: '<path fill="currentColor" d="M3 7h13l3 3h2v2h-6l-1 2H9v3H6v-3H3V7Zm3 2v3h3V9H6Z"/>',
  rural: '<path fill="currentColor" d="M12 2 3 9v13h6v-6h6v6h6V9L12 2Zm0 2.4L19 10v10h-2v-6H7v6H5V10l7-5.6Z"/>',
  alert: '<path fill="currentColor" d="M12 2 1 21h22L12 2Zm0 4.6L19.5 19h-15L12 6.6ZM11 10v5h2v-5h-2Zm0 6v2h2v-2h-2Z"/>',
  scale: '<path fill="currentColor" d="M12 3 2 8v2h20V8L12 3Zm-6 9v6H4v2h16v-2h-2v-6h-2v6h-3v-6h-2v6H8v-6H6Z"/>',
};

const icon = (name) => `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">${ICONS[name] || ICONS.victims}</svg>`;

/* --------------------------------- KPIs ---------------------------------- */

function kpiCard({ label, value, foot, icon: ic = 'victims', color = 'var(--accent)', hero = false }) {
  const node = el('article', { class: `kpi${hero ? ' kpi--hero' : ''}`, style: { '--k-color': color } });
  node.innerHTML = `
    <p class="kpi__label">${icon(ic)}<span>${label}</span></p>
    <p class="kpi__value">${value}</p>
    ${foot ? `<p class="kpi__foot">${foot}</p>` : ''}`;
  return node;
}

export function renderKpis(root, r) {
  const s = r.summary;
  const m = r.meta;
  const cards = [
    kpiCard({
      label: 'Homicidios registrados',
      value: num(s.total),
      foot: `Promedio <strong>${num(s.avgPerYear)}</strong> por año · <strong>${s.avgPerMonth.toFixed(1)}</strong> por mes`,
      icon: 'victims',
      color: 'var(--accent)',
      hero: true,
    }),
    kpiCard({
      label: 'Periodo analizado',
      value: `${s.yearSpan}`,
      foot: `${num(s.years)} años · <strong>${s.avgPerDay.toFixed(2)}</strong> homicidios por día`,
      icon: 'calendar',
      color: 'var(--blue)',
    }),
    kpiCard({
      label: 'Año más violento',
      value: s.peakYear ? num(s.peakYear.year) : '—',
      foot: s.peakYear ? `Con <strong>${num(s.peakYear.count)}</strong> homicidios${s.lowYear ? ` · el menor fue <strong>${s.lowYear.year}</strong>` : ''}` : 'Sin datos',
      icon: 'trend',
      color: 'var(--amber)',
    }),
    kpiCard({
      label: 'Departamentos',
      value: num(s.departments),
      foot: `Lidera <strong>${s.topDept ? ellipsis(s.topDept.name, 16) : '—'}</strong>${s.topDept ? ` (${pct(s.topDept.count, s.total)})` : ''}`,
      icon: 'scale',
      color: 'var(--violet)',
    }),
    kpiCard({
      label: 'Municipios afectados',
      value: num(s.municipalities),
      foot: s.topMuni ? `Mayor registro: <strong>${ellipsis(s.topMuni.name, 18)}</strong> (${num(s.topMuni.count)})` : '—',
      icon: 'pin',
      color: 'var(--cyan)',
    }),
    kpiCard({
      label: 'Víctimas mujeres',
      value: `${s.femPct.toFixed(1)} <small>%</small>`,
      foot: `<strong>${num(s.fem)}</strong> mujeres · ${num(s.femicide)} tipificados como feminicidio`,
      icon: 'female',
      color: '#ff8fb1',
    }),
    kpiCard({
      label: 'Uso de arma de fuego',
      value: `${s.firearmPct.toFixed(1)} <small>%</small>`,
      foot: `<strong>${num(s.firearm)}</strong> hechos · principal medio letal`,
      icon: 'gun',
      color: 'var(--accent-2)',
    }),
    kpiCard({
      label: 'Zona rural',
      value: `${s.ruralPct.toFixed(1)} <small>%</small>`,
      foot: `<strong>${num(s.rural)}</strong> rural vs. ${num(s.urban)} urbanos`,
      icon: 'rural',
      color: 'var(--green)',
    }),
  ];
  if (s.maxDaily) {
    cards.push(kpiCard({
      label: 'Día más crítico',
      value: dateLong(s.maxDaily.date).replace(/^\d+ /, ''),
      foot: `<strong>${num(s.maxDaily.count)}</strong> homicidios registrados en un solo día`,
      icon: 'alert',
      color: 'var(--amber)',
    }));
  }
  mount(root, cards);
}

/* -------------------------------- Rankings -------------------------------- */

/**
 * Lista de ranking con barra proporcional.
 * @param {HTMLElement} root
 * @param {Array} rows - [[nombre, valor, meta?], ...]
 * @param {{total:number, unit?:string, onPick?:Function, meta:(row)=>string}} opts
 */
export function renderRank(root, rows, opts = {}) {
  const { total = 0, onPick = null, metaOf = null, valueLabel = 'casos', decimals = 1 } = opts;
  if (!rows.length) {
    mount(root, [el('p', { class: 'rank__empty', text: 'Sin datos para los filtros aplicados.' })]);
    return;
  }
  const max = Math.max(...rows.map((r) => r[1]));
  const items = rows.map((row, i) => {
    const [name, value, extra] = row;
    const metaText = metaOf ? metaOf(row) : extra ? String(extra) : '';
    const rowEl = el('div', { class: `rank__row${onPick ? ' is-clickable' : ''}` });
    rowEl.style.animationDelay = `${Math.min(i * 28, 320)}ms`;
    if (onPick) {
      rowEl.setAttribute('role', 'button');
      rowEl.tabIndex = 0;
      rowEl.title = `Filtrar por ${name}`;
      const act = () => onPick(name, row);
      rowEl.addEventListener('click', act);
      rowEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(); }
      });
    }
    rowEl.innerHTML = `
      <span class="rank__pos">${i + 1}</span>
      <span class="rank__body">
        <span class="rank__top">
          <span class="rank__name">${ellipsis(name, 34)}${metaText ? `<span class="rank__meta">${metaText}</span>` : ''}</span>
          <span class="rank__val">${num(value)}<span>${pctNum(value, total).toFixed(decimals)} %</span></span>
        </span>
        <span class="rank__bar"><span class="rank__fill" style="width:${Math.max(2, (value / max) * 100).toFixed(2)}%"></span></span>
      </span>`;
    rowEl.setAttribute('aria-label', `${i + 1}. ${name}: ${num(value)} ${valueLabel}, ${pct(value, total)}`);
    return rowEl;
  });
  mount(root, items);
}

/* ------------------------------ Chips activos ----------------------------- */

const FILTER_LABELS = {
  dept: 'Departamento',
  sex: 'Sexo',
  zone: 'Zona',
  weapon: 'Arma',
  modality: 'Modalidad',
  spoa: 'Clasificación SPOA',
  search: 'Municipio',
  years: 'Años',
};

export function renderChips(root, filters, meta, onRemove) {
  const chips = [];
  for (const key of ['dept', 'sex', 'zone', 'weapon', 'modality', 'spoa', 'search']) {
    const v = filters[key];
    if (!v) continue;
    chips.push({ key, label: FILTER_LABELS[key], value: v });
  }
  if (meta && (filters.yearFrom !== meta.minYear || filters.yearTo !== meta.maxYear)) {
    chips.push({ key: 'years', label: FILTER_LABELS.years, value: `${filters.yearFrom ?? meta.minYear} – ${filters.yearTo ?? meta.maxYear}` });
  }
  if (!chips.length) {
    root.hidden = true;
    mount(root, []);
    return 0;
  }
  root.hidden = false;
  mount(
    root,
    chips.map((c) => {
      const node = el('span', { class: 'chip' });
      node.innerHTML = `${c.label}: <b>${ellipsis(c.value, 24)}</b>`;
      const btn = el('button', { type: 'button', 'aria-label': `Quitar filtro ${c.label}`, text: '×' });
      btn.addEventListener('click', () => onRemove(c.key));
      node.append(btn);
      return node;
    })
  );
  return chips.length;
}

export function renderFilterSummary(node, filters, r) {
  const s = r.summary;
  const parts = [];
  if (filters.dept) parts.push(`departamento ${filters.dept}`);
  if (filters.sex) parts.push(`sexo ${filters.sex.toLowerCase()}`);
  if (filters.zone) parts.push(`zona ${filters.zone.toLowerCase()}`);
  if (filters.weapon) parts.push(`arma ${filters.weapon.toLowerCase()}`);
  if (filters.modality) parts.push(`modalidad ${filters.modality.toLowerCase()}`);
  if (filters.spoa) parts.push(filters.spoa.toLowerCase());
  if (filters.search?.trim().length >= 2) parts.push(`municipio “${filters.search.trim()}”`);
  const yr = `${filters.yearFrom ?? r.meta.minYear}–${filters.yearTo ?? r.meta.maxYear}`;
  const base = `Periodo ${yr} · ${num(s.total)} homicidios en ${num(s.municipalities)} municipios`;
  node.textContent = parts.length ? `${base} · filtros: ${parts.join(', ')}.` : `${base} · sin filtros adicionales.`;
}

/* --------------------------------- Tabla ---------------------------------- */

let tableSort = { key: 'count', asc: false };

export function sortDetails(rows, key, asc) {
  const copy = [...rows];
  copy.sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'es');
    return asc ? cmp : -cmp;
  });
  return copy;
}

export function renderTable(table, rows, total, { onSort } = {}) {
  const tbody = table.querySelector('tbody');
  const max = Math.max(1, ...rows.map((r) => r.count));
  const sortToggle = onSort || (() => renderTable(table, rows, total));

  if (!rows.length) {
    mount(tbody, [el('tr', {}, [el('td', { colspan: 7, class: 'rank__empty', text: 'Ningún departamento coincide con los filtros aplicados.' })])]);
    return;
  }

  const sorted = sortDetails(rows, tableSort.key, tableSort.asc);

  mount(
    tbody,
    sorted.map((row) => {
      const tr = el('tr');
      tr.innerHTML = `
        <td><span class="mini" style="width:${Math.max(3, (row.count / max) * 46).toFixed(1)}px"></span>${row.name}</td>
        <td class="num">${num(row.count)}</td>
        <td class="num">${pct(row.count, total)}</td>
        <td class="num">${row.rate == null ? '—' : row.rate.toFixed(1)}</td>
        <td class="num">${row.ruralPct.toFixed(1)} %</td>
        <td class="num">${num(row.fem)}</td>
        <td class="col-hide">${ellipsis(row.topWeapon, 30)}</td>`;
      return tr;
    })
  );

  table.querySelectorAll('thead th').forEach((th) => {
    const key = th.dataset.sort;
    const active = key === tableSort.key;
    th.classList.toggle('is-sorted', active);
    th.classList.toggle('asc', active && tableSort.asc);
    th.setAttribute('aria-sort', active ? (tableSort.asc ? 'ascending' : 'descending') : 'none');
    if (!th.dataset.bound) {
      th.dataset.bound = '1';
      th.tabIndex = 0;
      const toggle = () => {
        if (tableSort.key === key) tableSort.asc = !tableSort.asc;
        else tableSort = { key, asc: key === 'name' };
        sortToggle();
      };
      th.addEventListener('click', toggle);
      th.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });
    }
  });
}

export function exportTableCsv(rows, total, filename) {
  return [
    ['Departamento', 'Homicidios', 'Porcentaje del total', 'Indice por 100.000 hab.', 'Porcentaje rural', 'Feminicidios', 'Municipios afectados', 'Arma predominante'],
    ...rows.map((r) => [
      r.name,
      r.count,
      pctNum(r.count, total).toFixed(2).replace('.', ','),
      r.rate == null ? '' : r.rate.toFixed(1).replace('.', ','),
      r.ruralPct.toFixed(1).replace('.', ','),
      r.fem,
      r.municipalities,
      r.topWeapon,
    ]),
  ];
}

/* ------------------------------- Hallazgos -------------------------------- */

export function renderFindings(node, r) {
  const s = r.summary;
  const ranks = r.ranks;
  const items = [];

  if (s.topDept && s.topMuni && s.topWeapon) {
    items.push(
      `El <strong>${s.topDept.name}</strong> concentra <strong>${pct(s.topDept.count, s.total)}</strong> de los homicidios del conjunto filtrado, con <strong>${num(s.topDept.count)}</strong> casos.`
    );
    items.push(
      `El municipio con más registros es <strong>${s.topMuni.name}</strong>${s.topMuni.dept ? ` (${s.topMuni.dept})` : ''}, con <strong>${num(s.topMuni.count)}</strong> homicidios (${pct(s.topMuni.count, s.total)} del total).`
    );
    items.push(
      `El medio letal predominante es <strong>${ellipsis(s.topWeapon.name, 40)}</strong> con <strong>${num(s.topWeapon.count)}</strong> casos; las armas de fuego representan el <strong>${s.firearmPct.toFixed(1)} %</strong> del total.`
    );
  }

  if (s.topModality) {
    items.push(
      `La modalidad presunta más frecuente es <strong>${ellipsis(s.topModality.name, 36)}</strong> con <strong>${num(s.topModality.count)}</strong> hechos (${pct(s.topModality.count, s.total)}).`
    );
  }

  if (r.ranks.weaponFamily.length) {
    const [n1, v1] = r.ranks.weaponFamily[0];
    const second = r.ranks.weaponFamily[1];
    items.push(
      `Agrupando los ${r.meta.dictSizes.weapons} medios del registro, <strong>${n1}</strong> explica <strong>${pct(v1, s.total)}</strong> del total${second ? `, seguido por <strong>${second[0]}</strong> (${pct(second[1], s.total)})` : ''}.`
    );
  }

  if (s.peakYear) {
    const trend = ranks.year.length > 1 ? s.peakYear.count - ranks.year[1][1] : 0;
    items.push(
      `El año con más homicidios fue <strong>${s.peakYear.year}</strong> (<strong>${num(s.peakYear.count)}</strong>)${trend > 0 ? `, un <strong>${((trend / s.peakYear.count) * 100).toFixed(1)} %</strong> por encima del siguiente año` : ''}.`
    );
  }

  items.push(
    `El <strong>${s.femPct.toFixed(1)} %</strong> de las víctimas son mujeres (<strong>${num(s.fem)}</strong> casos) y <strong>${num(s.femicide)}</strong> hechos están tipificados como feminicidio.`
  );

  items.push(
    `La violencia es mayoritariamente <strong>${s.ruralPct > s.urbanPct ? 'rural' : 'urbana'}</strong>: <strong>${s.ruralPct.toFixed(1)} %</strong> de los casos ocurrieron en zona rural y <strong>${s.urbanPct.toFixed(1)} %</strong> en zona urbana.`
  );

  if (s.maxDaily) {
    items.push(
      `El día con más hechos registrados fue el <strong>${dateShort(s.maxDaily.date)}</strong>, con <strong>${num(s.maxDaily.count)}</strong> homicidios.`
    );
  }

  if (r.ranks.municipality.length >= 5) {
    const top5 = r.ranks.municipality.slice(0, 5).reduce((a, [, v]) => a + v, 0);
    items.push(
      `Los <strong>5 municipios</strong> con más casos reúnen <strong>${num(top5)}</strong> homicidios, equivalentes al <strong>${pct(top5, s.total)}</strong> del total filtrado.`
    );
  }

  mount(node, items.map((html) => el('li', { html })));
}

/* ------------------------------ Nota de fuente ---------------------------- */

export function renderSourceNote(node, meta, r) {
  node.innerHTML = `
    <p class="legal">
      Datos: <strong>HOMICIDIO</strong> (datos.gov.co) cruzado con <strong>Municipios PDET</strong> (datos.gov.co) ·
      <strong>${num(meta.sourceRows)}</strong> registros · <strong>${num(meta.total)}</strong> víctimas ·
      periodo <strong>${dateLong(meta.minDate)}</strong> a <strong>${dateLong(meta.maxDate)}</strong> ·
      <strong>${num(r.summary.municipalities)}</strong> municipios visibles con los filtros actuales.
      ${meta.skipped ? `${num(meta.skipped)} filas descartadas por formato inválido. ` : ''}
      Tablero creado por <strong>John A. Echeverry O.</strong>, Analista de Datos
      (<a href="mailto:echeverri58@gmail.com">echeverri58@gmail.com</a> · Cel: 321 746 6359),
      por solicitud de <strong>Mauricio García</strong>.
    </p>`;
}

/* -------------------------------- Vacíos ---------------------------------- */

export function renderEmpty(root, message = 'No hay datos con los filtros seleccionados.') {
  mount(root, [el('p', { class: 'rank__empty', text: message })]);
}

export { compact, dateLong, dateShort, num, pct, ellipsis, $ };
