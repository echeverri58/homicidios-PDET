/**
 * utils.js — Helpers de formato, DOM y matemáticas.
 * Sin dependencias.
 */

/* ------------------------------- Formato ------------------------------- */

const nfInt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const nfDec = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 71304 -> "71.304" */
export const num = (n) => nfInt.format(Math.round(n || 0));

/** 0.2761 -> "27,6 %" */
export function pct(value, total, decimals = 1) {
  if (!total) return '0 %';
  const v = (value / total) * 100;
  return `${(decimals ? nfDec : nfInt).format(v)} %`;
}

/** Versión numérica de pct(), para ordenar o pintar. */
export const pctNum = (value, total) => (total ? (value / total) * 100 : 0);

/** 1234 -> "1,2 mil" · 1250000 -> "1,3 M" (etiquetas compactas de ejes) */
export function compact(n) {
  const v = Math.abs(n);
  if (v >= 1e6) return `${nfDec.format(n / 1e6)} M`;
  if (v >= 1e4) return `${nfInt.format(Math.round(n / 1e3))} mil`;
  if (v >= 1e3) return `${nfDec.format(n / 1e3)} mil`;
  return nfInt.format(n);
}

/** 2024 -> "2024" · date "2024-03-05" -> "5 mar 2024" */
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function dateLong(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  if (!m) return String(y);
  if (!d) return `${MONTHS_SHORT[m - 1]} ${y}`;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}
export function dateShort(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return d ? `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` : String(y);
}
export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MONTHS_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAYS_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Trunca una etiqueta larga respetando palabras. */
export function ellipsis(text, max = 26) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.55 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Titulariza solo para etiquetas en mayúsculas sostenidas del CSV. */
export function titleCase(s) {
  const t = String(s ?? '').trim();
  if (!t) return 'Sin dato';
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .replace(/(^|[\s/(\-])([a-záéíóúñü])/g, (_, p, c) => p + c.toUpperCase());
}

export const slug = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dato';

/* --------------------------------- DOM --------------------------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Crea un elemento con atributos y hijos. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function setText(node, value) {
  if (node && node.textContent !== String(value)) node.textContent = value;
}

/** Reemplaza el contenido de un nodo. */
export function mount(node, children) {
  if (!node) return;
  node.replaceChildren(...[].concat(children).filter(Boolean));
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------ Funciones ------------------------------ */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Debounce clásico. */
export function debounce(fn, wait = 180) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Petición de frame con coalescencia. */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs = [];
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

/** Redondeo "bonito" para ejes (1, 2, 2.5, 5, 10 × 10^n). */
export function niceCeil(value) {
  if (!(value > 0)) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const f = value / base;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * base;
}

/** Genera marcas legibles de 0..max. */
export function ticks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const step = niceCeil(raw);
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v));
  return out.length > 1 ? out : [0, Math.round(max)];
}

/** Ordena un Map<string, number> y devuelve el top N. */
export function topEntries(mapLike, n = 10) {
  const entries = mapLike instanceof Map ? [...mapLike.entries()] : Object.entries(mapLike || {});
  return entries
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))
    .slice(0, n);
}

/** Suma los valores de un Map. */
export const mapSum = (map) => {
  let t = 0;
  for (const v of map.values()) t += v;
  return t;
};

/** Color HSL estable por índice (para series). */
export function seriesColor(i) {
  const palette = ['#e63950', '#ff7a5c', '#f5b544', '#35d0c0', '#5aa9ff', '#9b8cff', '#57d98b', '#ff8fb1', '#7ea6c9', '#c9a227'];
  return palette[i % palette.length];
}

export const PALETTE = ['#e63950', '#ff7a5c', '#f5b544', '#35d0c0', '#5aa9ff', '#9b8cff', '#57d98b', '#ff8fb1', '#7ea6c9', '#c9a227'];

/* --------------------------------- CSV --------------------------------- */

/** Descarga una matriz de filas como CSV (compatible con Excel es-CO). */
export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function triggerDownload(blobOrUrl, filename) {
  const isUrl = typeof blobOrUrl === 'string';
  const url = isUrl ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  if (!isUrl) setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Lee la preferencia de tema guardada. */
export function storedTheme() {
  try {
    const t = localStorage.getItem('homicidios:theme');
    if (t === 'light' || t === 'dark') return t;
  } catch { /* almacenamiento no disponible */ }
  return 'dark';
}
export function storeTheme(t) {
  try { localStorage.setItem('homicidios:theme', t); } catch { /* noop */ }
}
