/**
 * charts.js — Motor de gráficos propio sobre Canvas 2D.
 * Cero dependencias. Retina-aware, responsive, con tooltip y hit-testing.
 */

import { ticks, num, compact as fmtCompact, ellipsis, niceCeil } from './utils.js';

/* ------------------------------------------------------------------ */
/* Superficie de dibujo (maneja DPR y tamaño)                          */
/* ------------------------------------------------------------------ */

class Surface {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /** Ajusta el bitmap al tamaño CSS. Devuelve las dimensiones lógicas. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(40, Math.round(rect.width));
    const h = Math.max(40, Math.round(rect.height));
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    return this;
  }

  get ctx2() { return this.ctx; }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  path(pts, { close = false } = {}) {
    const c = this.ctx;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (close) c.closePath();
  }

  rect(x, y, w, h, { r = 0, fill, stroke, lw = 1 } = {}) {
    const c = this.ctx;
    c.beginPath();
    if (r > 0) roundedPath(c, x, y, w, h, r);
    else c.rect(x, y, w, h);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }

  text(str, x, y, { size = 12, weight = 500, color = '#a6b4cd', align = 'left', baseline = 'middle', mono = false, max = 0 } = {}) {
    const c = this.ctx;
    c.font = `${weight} ${size}px ${mono ? monoStack : fontStack}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = baseline;
    const label = max ? ellipsis(str, max) : str;
    c.fillText(label, x, y);
    return c.measureText(label).width;
  }

  line(x1, y1, x2, y2, { color = 'rgba(148,172,214,.13)', lw = 1, dash = null } = {}) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    if (dash) c.setLineDash(dash);
    c.strokeStyle = color;
    c.lineWidth = lw;
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.restore();
  }
}

const fontStack = '"Inter","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif';
const monoStack = '"JetBrains Mono","Cascadia Mono",ui-monospace,Consolas,monospace';

function roundedPath(c, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  if (typeof c.roundRect === 'function') { c.roundRect(x, y, w, h, rr); return; }
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** Traza una polilínea suavizada (Catmull-Rom → Bézier). */
function smoothPath(c, pts, tension = 0.32) {
  if (pts.length < 3) {
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    return;
  }
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2;
    c.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
}

/* ------------------------------------------------------------------ */
/* Tema y tooltip                                                      */
/* ------------------------------------------------------------------ */

export const theme = {
  text: '#eaf0fb',
  text2: '#a6b4cd',
  text3: '#6d7d99',
  line: 'rgba(148,172,214,.13)',
  grid: 'rgba(148,172,214,.10)',
  surface: '#141d31',
  accent: '#e63950',
  accent2: '#ff7a5c',
  cyan: '#35d0c0',
  amber: '#f5b544',
  violet: '#9b8cff',
  blue: '#5aa9ff',
  green: '#57d98b',
  palette: ['#e63950', '#ff7a5c', '#f5b544', '#35d0c0', '#5aa9ff', '#9b8cff', '#57d98b', '#ff8fb1', '#7ea6c9', '#c9a227'],
};

export function readThemeFromCss() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;
  theme.text = g('--text', theme.text);
  theme.text2 = g('--text-2', theme.text2);
  theme.text3 = g('--text-3', theme.text3);
  theme.line = g('--line', theme.line);
  theme.grid = g('--line', theme.grid);
  theme.surface = g('--surface-2', theme.surface);
  theme.accent = g('--accent', theme.accent);
  theme.accent2 = g('--accent-2', theme.accent2);
}

/* ------------------------------ Tooltip ----------------------------- */

const tip = { node: null, visible: false };

function tipNode() {
  if (!tip.node) tip.node = document.getElementById('tooltip');
  return tip.node;
}

export function showTip(html, clientX, clientY) {
  const node = tipNode();
  if (!node) return;
  node.innerHTML = html;
  node.hidden = false;
  tip.visible = true;
  const r = node.getBoundingClientRect();
  let x = clientX + 14;
  let y = clientY - r.height - 12;
  if (x + r.width > window.innerWidth - 8) x = clientX - r.width - 14;
  if (x < 8) x = 8;
  if (y < 8) y = clientY + 18;
  if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

export function hideTip() {
  if (!tip.visible) return;
  const node = tipNode();
  if (node) node.hidden = true;
  tip.visible = false;
}

/* ------------------------------------------------------------------ */
/* Registro de gráficos (dibujo diferido + resize)                     */
/* ------------------------------------------------------------------ */

const registry = new Map(); // canvas -> { draw, hit }
let observer = null;
let listening = false;

function ensureObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const rec = registry.get(e.target);
        if (!rec) continue;
        rec.visible = e.isIntersecting;
        if (e.isIntersecting) rec.draw();
      }
    },
    { rootMargin: '180px 0px' }
  );
}

function ensureGlobalListeners() {
  if (listening) return;
  listening = true;
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      for (const rec of registry.values()) if (rec.visible) rec.draw();
    });
  });
  window.addEventListener('scroll', hideTip, { passive: true });
}

/** Registra/actualiza un gráfico en un contenedor <figure>. */
function register(container, draw, hit) {
  const canvas = container.querySelector('canvas');
  if (!canvas) return null;
  registry.set(canvas, { draw, hit, visible: true, container });
  ensureObserver();
  ensureGlobalListeners();
  if (observer) {
    observer.unobserve(canvas);
    observer.observe(canvas);
  }
  return canvas;
}

/** Limpia el contenedor y deja un mensaje si no hay datos. */
function emptyState(container, message) {
  const canvas = container.querySelector('canvas');
  if (canvas) registry.delete(canvas);
  container.replaceChildren(
    Object.assign(document.createElement('div'), { className: 'chart__empty', textContent: message })
  );
}

function prepare(container) {
  let canvas = container.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    container.replaceChildren(canvas);
  }
  return canvas;
}

/** Conecta tooltip + hover a un canvas con región de hit-testing. */
function wirePointer(canvas, getHit, redrawHover) {
  let hoverIndex = -1;
  const move = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * rect.width;
    const py = ((ev.clientY - rect.top) / rect.height) * rect.height;
    const hit = getHit(px, py);
    if (hit && hit.html) {
      showTip(hit.html, ev.clientX, ev.clientY);
      canvas.style.cursor = hit.clickable ? 'pointer' : 'crosshair';
    } else {
      hideTip();
      canvas.style.cursor = 'crosshair';
    }
    const idx = hit ? hit.index : -1;
    if (idx !== hoverIndex) {
      hoverIndex = idx;
      redrawHover?.(idx);
    }
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', move);
  canvas.addEventListener('pointerleave', () => {
    hideTip();
    if (hoverIndex !== -1) { hoverIndex = -1; redrawHover?.(-1); }
  });
  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const hit = getHit(ev.clientX - rect.left, ev.clientY - rect.top);
    if (hit?.onClick) hit.onClick();
  });
}

/* ------------------------------------------------------------------ */
/* Axis helper                                                         */
/* ------------------------------------------------------------------ */

function valueAxis(s, max, { left, right, top, bottom }, opts = {}) {
  const { count = 4, format = (v) => num(v) } = opts;
  const safeMax = niceCeil(max) || 1;
  const list = ticks(safeMax, count);
  const top2 = list[list.length - 1] || 1;
  const yOf = (v) => bottom - (v / top2) * (bottom - top);
  for (const t of list) {
    const y = yOf(t);
    s.line(left, y, right, y, { color: theme.grid, lw: 1 });
    s.text(format(t), left - 9, y, { size: 10.5, color: theme.text3, align: 'right', baseline: 'middle' });
  }
  return { yOf, max: top2, ticks: list };
}

/* ================================================================== */
/* 1. Gráfico de tendencia (líneas + área suavizada)                   */
/* ================================================================== */

export function lineChart(container, series, opts = {}) {
  const {
    xLabels = [],
    height = 0,
    yFormat = compactish,
    valueLabel = 'Homicidios',
    showArea = true,
    onClickPoint = null,
  } = opts;

  if (!series.length || !series[0]?.values?.some((v) => v > 0)) {
    emptyState(container, 'Sin datos para los filtros seleccionados.');
    return;
  }

  const canvas = prepare(container);
  let hover = -1;

  const draw = () => {
    const s = new Surface(canvas).resize();
    const { w, h } = s;
    s.clear();
    const labels = xLabels.length ? xLabels : series[0].labels;
    const n = labels.length;
    const left = w < 420 ? 38 : 48;
    const right = w - 10;
    const top = 12;
    const bottom = h - (w < 420 ? 30 : 34);

    const max = Math.max(...series.flatMap((se) => se.values));
    const { yOf, max: top2 } = valueAxis(s, max, { left, right, top, bottom }, {
      count: h > 260 ? 5 : 4,
      format: yFormat,
    });

    const xOf = (i) => (n === 1 ? (left + right) / 2 : left + (i / (n - 1)) * (right - left));

    // ¿Se muestra una etiqueta por punto?
    const step = Math.max(1, Math.ceil(n / (w < 420 ? 5 : w < 760 ? 8 : 14)));

    // Etiquetas del eje X
    for (let i = 0; i < n; i++) {
      if (i % step !== 0 && i !== n - 1) continue;
      s.text(labels[i], xOf(i), h - 14, {
        size: 10.5, color: theme.text3, align: i === 0 ? 'left' : i === n - 1 ? 'right' : 'center', mono: opts.monoX,
      });
    }
    if (n > 1) s.line(left, bottom, right, bottom, { color: theme.line });

    // Series
    series.forEach((se, si) => {
      const color = se.color || theme.palette[si % theme.palette.length];
      const pts = se.values.map((v, i) => [xOf(i), yOf(v)]);

      if (showArea && si === 0 && n > 1) {
        const c = s.ctx;
        c.save();
        c.beginPath();
        smoothPath(c, pts);
        c.lineTo(pts[pts.length - 1][0], bottom);
        c.lineTo(pts[0][0], bottom);
        c.closePath();
        const grad = c.createLinearGradient(0, top, 0, bottom);
        grad.addColorStop(0, hexA(color, 0.34));
        grad.addColorStop(1, hexA(color, 0));
        c.fillStyle = grad;
        c.fill();
        c.restore();
      }

      const c = s.ctx;
      c.save();
      c.beginPath();
      smoothPath(c, pts);
      c.strokeStyle = color;
      c.lineWidth = se.dashed ? 1.8 : 2.2;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      if (se.dashed) c.setLineDash([5, 4]);
      c.stroke();
      c.restore();

      // Puntos
      const dotR = n > 28 ? 0 : n > 16 ? 2.2 : 3;
      if (dotR > 0) {
        pts.forEach(([x, y], i) => {
          s.rect(x - dotR, y - dotR, dotR * 2, dotR * 2, { r: dotR, fill: color });
        });
      }

      // Punto resaltado por hover
      if (hover >= 0 && hover < pts.length && si === 0) {
        const [hx, hy] = pts[hover];
        s.line(hx, top, hx, bottom, { color: 'rgba(148,172,214,.28)', lw: 1, dash: [3, 3] });
        s.rect(hx - 5.5, hy - 5.5, 11, 11, { r: 5.5, fill: theme.surface, stroke: color, lw: 2.2 });
      }
    });

  };

  const getHit = (px, py) => {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const left = w < 420 ? 38 : 48;
    const right = w - 10;
    const n = (xLabels.length ? xLabels : series[0].labels).length;
    if (px < left - 12 || px > right + 12) return null;
    const i = n === 1 ? 0 : Math.round(((px - left) / (right - left)) * (n - 1));
    const idx = Math.min(n - 1, Math.max(0, i));
    const rows = series
      .map((se) => `<em>${se.name}:</em> <b>${num(se.values[idx])}</b>`)
      .join('<br>');
    const label = (xLabels.length ? xLabels : series[0].labels)[idx];
    void py;
    return {
      index: idx,
      clickable: Boolean(onClickPoint),
      html: `<strong>${label}</strong>${rows}<br><em>${valueLabel}</em>`,
      onClick: onClickPoint ? () => onClickPoint(idx) : null,
    };
  };

  register(container, draw, getHit);
  wirePointer(canvas, getHit, (idx) => { hover = idx; draw(); });
  draw();
}

/* ================================================================== */
/* 2. Barras verticales                                                */
/* ================================================================== */

export function barChart(container, labels, values, opts = {}) {
  const {
    color = theme.accent,
    gradientTo = theme.accent2,
    yFormat = compactish,
    valueLabel = 'Total',
    onClick = null,
    highlight = null,
    colorFor = null,
    rotateLabels = false,
  } = opts;

  if (!labels.length || !values.some((v) => v > 0)) {
    emptyState(container, 'Sin datos para los filtros seleccionados.');
    return;
  }

  const canvas = prepare(container);
  let hover = -1;
  let bars = [];
  const max = Math.max(...values);

  const draw = () => {
    const s = new Surface(canvas).resize();
    const { w, h } = s;
    s.clear();
    const narrow = w < 480;
    const left = narrow ? 36 : 48;
    const right = w - 8;
    const top = 14;
    const bottom = h - (rotateLabels || labels.length > 8 ? 40 : 30);
    const { yOf } = valueAxis(s, max, { left, right, top, bottom }, { count: h > 250 ? 5 : 4, format: yFormat });

    const band = (right - left) / labels.length;
    const gap = band > 34 ? 8 : band > 20 ? 5 : 3;
    const bw = Math.max(2.5, Math.min(band - gap, 46));
    const chartH = bottom - top;

    bars = labels.map((lab, i) => {
      const x = left + band * i + (band - bw) / 2;
      const v = values[i];
      const bh = Math.max(v > 0 ? 2 : 0, (v / (max || 1)) * chartH);
      const y = bottom - bh;
      return { x, y, w: bw, h: bh, v, i, lab };
    });

    bars.forEach((b) => {
      const active = hover === -1 || hover === b.i;
      const c = s.ctx;
      c.save();
      const grad = c.createLinearGradient(0, b.y, 0, bottom);
      const base = colorFor ? colorFor(b.lab, b.i) : color;
      grad.addColorStop(0, active ? hexA(base, 0.98) : hexA(base, 0.5));
      grad.addColorStop(1, active ? hexA(gradientTo || base, 0.62) : hexA(gradientTo || base, 0.28));
      c.fillStyle = grad;
      c.beginPath();
      roundedPath(c, b.x, b.y, b.w, b.h, Math.min(6, b.w / 2.4));
      c.fill();
      c.restore();
      if (highlight && highlight === b.lab) {
        s.rect(b.x - 2.5, b.y - 2.5, b.w + 5, b.h + 5, { r: 8, stroke: hexA(theme.accent2, .85), lw: 1.6 });
      }
    });

    // Etiquetas X
    const every = Math.max(1, Math.ceil(labels.length / (narrow ? 7 : rotateLabels ? 12 : 16)));
    bars.forEach((b, i) => {
      if (i % every !== 0 && i !== labels.length - 1) return;
      const cx = b.x + b.w / 2;
      if (rotateLabels) {
        const c = s.ctx;
        c.save();
        c.translate(cx, bottom + 8);
        c.rotate(-Math.PI / 4);
        s.text(labels[i], 0, 0, { size: 10, color: theme.text3, align: 'right', max: 18 });
        c.restore();
      } else {
        s.text(labels[i], cx, h - 12, { size: 10.5, color: theme.text3, align: 'center', max: narrow ? 8 : 12 });
      }
    });

    // Etiqueta de valor sobre la barra en hover
    if (hover >= 0 && bars[hover]) {
      const b = bars[hover];
      s.rect(b.x + b.w / 2 - 24, Math.max(top, b.y - 13), 48, 20, { r: 6, fill: theme.surface, stroke: theme.line });
      s.text(num(b.v), b.x + b.w / 2, Math.max(top, b.y - 13) + 10, {
        size: 11, weight: 700, color: theme.text, align: 'center',
      });
    }
  };

  const getHit = (px, py) => {
    void py;
    const found = bars.find((b) => px >= b.x - 3 && px <= b.x + b.w + 3);
    if (!found) return null;
    return {
      index: found.i,
      clickable: Boolean(onClick),
      html: `<strong>${found.lab}</strong><em>${valueLabel}:</em> <b>${num(found.v)}</b>`,
      onClick: onClick ? () => onClick(found.lab, found.i) : null,
    };
  };

  register(container, draw, getHit);
  wirePointer(canvas, getHit, (i) => { hover = i; draw(); });
  draw();
}

/* ================================================================== */
/* 3. Barras horizontales                                              */
/* ================================================================== */

export function hBarChart(container, labels, values, opts = {}) {
  const { valueLabel = 'Total', onClick = null, color = theme.accent } = opts;
  if (!labels.length || !values.some((v) => v > 0)) {
    emptyState(container, 'Sin datos para los filtros seleccionados.');
    return;
  }
  const canvas = prepare(container);
  let hover = -1;
  let rows = [];

  const draw = () => {
    const s = new Surface(canvas).resize();
    const { w, h } = s;
    s.clear();
    const labelW = Math.min(w * 0.44, 190);
    const valW = 56;
    const left = labelW + 8;
    const right = w - valW;
    const top = 8;
    const rowH = (h - top - 6) / labels.length;
    const bh = Math.max(8, Math.min(rowH - 8, 26));
    const max = Math.max(...values);

    rows = labels.map((lab, i) => {
      const y = top + rowH * i + (rowH - bh) / 2;
      const bw = Math.max(2, (values[i] / (max || 1)) * (right - left));
      return { y, w: bw, i, lab, v: values[i] };
    });

    const every = labels.length > 8 ? Math.ceil(labels.length / 8) : 1;
    rows.forEach((r, i) => {
      if (i % every === 0 || i === labels.length - 1) {
        s.text(r.lab, labelW, r.y + bh / 2, {
          size: 11.5, weight: hover === r.i ? 700 : 550, color: hover === r.i ? theme.text : theme.text2,
          align: 'right', max: Math.floor(labelW / 6.4),
        });
      }
      const active = hover === -1 || hover === r.i;
      s.rect(left, r.y, right - left, bh, { r: bh / 2, fill: theme.line.replace(/[\d.]+\)$/, '0.55)') });
      const c = s.ctx;
      c.save();
      const grad = c.createLinearGradient(left, 0, left + r.w, 0);
      grad.addColorStop(0, hexA(color, active ? 0.85 : 0.4));
      grad.addColorStop(1, hexA(theme.accent2, active ? 0.95 : 0.45));
      c.fillStyle = grad;
      c.beginPath();
      roundedPath(c, left, r.y, r.w, bh, bh / 2);
      c.fill();
      c.restore();
      s.text(num(r.v), w - 6, r.y + bh / 2, { size: 11.5, weight: 700, color: theme.text, align: 'right' });
    });
  };

  const getHit = (px, py) => {
    void px;
    const rowH = rows.length ? (canvas.getBoundingClientRect().height - 14) / rows.length : 24;
    const found = rows.find((r) => py >= r.y - 4 && py <= r.y + rowH - 4);
    if (!found) return null;
    return {
      index: found.i,
      clickable: Boolean(onClick),
      html: `<strong>${found.lab}</strong><em>${valueLabel}:</em> <b>${num(found.v)}</b>`,
      onClick: onClick ? () => onClick(found.lab, found.i) : null,
    };
  };

  register(container, draw, getHit);
  wirePointer(canvas, getHit, (i) => { hover = i; draw(); });
  draw();
}

/* ================================================================== */
/* 4. Dona con centro                                                  */
/* ================================================================== */

export function donutChart(container, labels, values, opts = {}) {
  const { centerLabel = 'Total', valueLabel = 'Total' } = opts;
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) {
    emptyState(container, 'Sin datos para los filtros seleccionados.');
    return;
  }
  const canvas = prepare(container);
  let hover = -1;
  let arcs = [];
  const colors = labels.map((_, i) => theme.palette[i % theme.palette.length]);

  const draw = () => {
    const s = new Surface(canvas).resize();
    const { w, h } = s;
    s.clear();
    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.max(30, Math.min(w, h) / 2 - 8);
    const inner = outer * 0.62;
    const c = s.ctx;

    let start = -Math.PI / 2;
    arcs = [];
    values.forEach((v, i) => {
      const ang = (v / total) * Math.PI * 2;
      const end = start + ang;
      const mid = start + ang / 2;
      const active = hover === i;
      const grow = active ? 3.5 : 0;
      c.save();
      c.beginPath();
      c.arc(cx, cy, outer + grow, start + 0.012, end - 0.012);
      c.arc(cx, cy, inner, end - 0.012, start + 0.012, true);
      c.closePath();
      c.fillStyle = colors[i];
      c.globalAlpha = hover === -1 || active ? 1 : 0.42;
      c.fill();
      c.restore();
      arcs.push({ i, start, end, mid, v, label: labels[i] });
      start = end;
    });

    if (hover >= 0 && arcs[hover]) {
      const a = arcs[hover];
      s.text(`${((a.v / total) * 100).toFixed(1)} %`, cx, cy - 9, { size: 17, weight: 750, color: theme.text, align: 'center' });
      s.text(num(a.v), cx, cy + 11, { size: 11.5, weight: 600, color: theme.text3, align: 'center' });
    } else {
      s.text(fmtCompact(total), cx, cy - 8, { size: 18, weight: 750, color: theme.text, align: 'center' });
      s.text(centerLabel, cx, cy + 12, { size: 10.5, weight: 600, color: theme.text3, align: 'center' });
    }
  };

  const getHit = (px, py) => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const outer = Math.max(30, Math.min(rect.width, rect.height) / 2 - 8);
    const inner = outer * 0.62;
    const dx = px - cx;
    const dy = py - cy;
    const r = Math.hypot(dx, dy);
    if (r < inner - 2 || r > outer + 6) return null;
    let ang = Math.atan2(dy, dx);
    if (ang < -Math.PI / 2) ang += Math.PI * 2;
    const a = arcs.find((x) => ang >= x.start && ang < x.end);
    if (!a) return null;
    return {
      index: a.i,
      html: `<strong>${a.label}</strong><em>${valueLabel}:</em> <b>${num(a.v)}</b> (${((a.v / total) * 100).toFixed(1)} %)`,
    };
  };

  register(container, draw, getHit);
  wirePointer(canvas, getHit, (i) => { hover = i; draw(); });
  draw();
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                    */
/* ------------------------------------------------------------------ */

function compactish(v) {
  return fmtCompact(v);
}

/** #rrggbb + alpha -> rgba() */
function hexA(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Fuerza el redibujo de todos los gráficos registrados. */
export function redrawAll() {
  readThemeFromCss();
  for (const rec of registry.values()) rec.draw();
}

/** Limpia un contenedor de gráfico. */
export function clearChart(container) {
  if (!container) return;
  const canvas = container.querySelector('canvas');
  if (canvas) registry.delete(canvas);
  container.replaceChildren();
}
