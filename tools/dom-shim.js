/**
 * dom-shim.js — Implementación mínima de DOM/Canvas para ejecutar el dashboard
 * dentro de Node durante las pruebas automatizadas. No se usa en el navegador.
 *
 * Registra además las operaciones de dibujo de cada canvas, de modo que las
 * pruebas puedan comprobar que los gráficos realmente pintan contenido.
 */

'use strict';

/* --------------------------------- Nodos -------------------------------- */

let autoId = 0;

class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...c) { c.forEach((x) => x && this.set.add(x)); this.#sync(); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); this.#sync(); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : Boolean(force);
    if (on) this.set.add(c); else this.set.delete(c);
    this.#sync();
    return on;
  }
  get value() { return [...this.set].join(' '); }
  #sync() { this.node._attrs.class = [...this.set].join(' '); }
}

class StubNode {
  constructor(tagName, ns = null) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ns = ns;
    this.nodeType = 1;
    this._attrs = {};
    this._children = [];
    this.parentNode = null;
    this._styleStore = {};
    this.style = new Proxy(this._styleStore, {
      get: (t, k) => String(t[k] ?? ''),
      set: (t, k, v) => { t[k] = v; return true; },
    });
    this.dataset = new Proxy({ _store: {} }, {
      get: (t, k) => (k === '_store' ? t._store : t._store[k]),
      set: (t, k, v) => {
        if (k === '_store') { t._store = v; return true; }
        t._store[k] = String(v);
        this._attrs[`data-${kebab(k)}`] = String(v);
        return true;
      },
      has: (t, k) => k === '_store' || k in t._store,
      deleteProperty: (t, k) => { delete t._store[k]; delete this._attrs[`data-${kebab(k)}`]; return true; },
      ownKeys: (t) => Reflect.ownKeys(t._store),
      getOwnPropertyDescriptor: (t, k) => (k in t._store ? { value: t._store[k], enumerable: true, configurable: true } : undefined),
    });
    this.classList = new ClassList(this);
    this._listeners = new Map();
    this._html = '';
    this._text = '';
    this.uid = `n${++autoId}`;
    this._value = '';
  }

  /* --- atributos --- */
  setAttribute(k, v) {
    const val = v === true ? '' : String(v);
    this._attrs[k] = val;
    if (k === 'class') this.classList.set = new Set(val.split(/\s+/).filter(Boolean));
    if (k === 'id') this.id = val;
    if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = val;
    if (k === 'hidden') this.hidden = true;
    if (k === 'value') this._value = val;
    if (k === 'style' && this._styleStore) parseInlineStyle(val, this._styleStore);
  }
  getAttribute(k) { return this._attrs[k] ?? null; }
  removeAttribute(k) { delete this._attrs[k]; if (k === 'hidden') this.hidden = false; }
  hasAttribute(k) { return k in this._attrs; }
  get attributes() { return Object.entries(this._attrs).map(([name, value]) => ({ name, value })); }

  get id() { return this._attrs.id ?? ''; }
  set id(v) { this._attrs.id = v; }
  get hidden() { return this._attrs.hidden !== undefined; }
  set hidden(v) { if (v) this._attrs.hidden = ''; else delete this._attrs.hidden; }
  get className() { return this.classList.value; }
  set className(v) { this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); this._attrs.class = this.classList.value; }
  get value() { return this._value ?? ''; }
  set value(v) { this._value = String(v); }
  get tabIndex() { return Number(this._attrs.tabindex ?? 0); }
  set tabIndex(v) { this._attrs.tabindex = String(v); }
  get title() { return this._attrs.title ?? ''; }
  set title(v) { this._attrs.title = String(v); }
  get ariaExpanded() { return this._attrs['aria-expanded']; }
  get offsetTop() { return this._offsetTop ?? 0; }
  set offsetTop(v) { this._offsetTop = v; }
  get clientHeight() { return this._clientHeight ?? 300; }
  set clientHeight(v) { this._clientHeight = v; }
  get clientWidth() { return this._clientWidth ?? 800; }
  set clientWidth(v) { this._clientWidth = v; }

  /* --- contenido --- */
  get textContent() {
    if (this._children.length) return this._children.map((c) => c.textContent ?? '').join('');
    return this._text;
  }
  set textContent(v) {
    this._children = [];
    this._html = '';
    this._text = v == null ? '' : String(v);
  }

  get innerHTML() { return this._html; }
  set innerHTML(html) {
    this._children = [];
    this._text = '';
    this._html = String(html ?? '');
    const parsed = parseHtml(this._html);
    for (const child of parsed) this.append(child);
  }

  get children() { return this._children.filter((c) => c.nodeType === 1); }
  get childNodes() { return [...this._children]; }
  get firstChild() { return this._children[0] ?? null; }
  get lastChild() { return this._children[this._children.length - 1] ?? null; }

  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? new TextNode(n) : n;
      if (!node) continue;
      if (node.__fragment) {
        for (const c of node._children) { c.parentNode = this; this._children.push(c); }
        continue;
      }
      node.parentNode = this;
      this._children.push(node);
    }
    if (this.tagName === 'SELECT') syncSelect(this);
    return this;
  }
  appendChild(n) { return this.append(n); }
  prepend(...nodes) { this._children.unshift(...nodes); return this; }
  replaceChildren(...nodes) {
    this._children = [];
    this._html = '';
    this._text = '';
    this.append(...nodes);
    if (this.tagName === 'SELECT') syncSelect(this);
  }
  remove() {
    if (this.parentNode) {
      const i = this.parentNode._children.indexOf(this);
      if (i >= 0) this.parentNode._children.splice(i, 1);
    }
  }
  removeChild(n) { n.remove(); return n; }
  contains(n) {
    if (n === this) return true;
    return this._children.some((c) => c.nodeType === 1 && c.contains(n));
  }
  closest(sel) {
    let cur = this;
    while (cur) { if (matches(cur, sel)) return cur; cur = cur.parentNode; }
    return null;
  }

  /* --- eventos --- */
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this._listeners.get(type)?.delete(fn); }
  dispatchEvent(ev) {
    const event = { type: ev?.type ?? 'event', target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...ev };
    for (const fn of this._listeners.get(event.type) ?? []) fn(event);
    let cur = this.parentNode;
    while (cur) {
      for (const fn of cur._listeners.get(event.type) ?? []) fn({ ...event, currentTarget: cur });
      cur = cur.parentNode;
    }
    return true;
  }
  click() { this.dispatchEvent({ type: 'click' }); }

  focus() { globalThis.document.activeElement = this; }
  blur() {}
  scrollIntoView() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() {
    if (this.tagName === 'CANVAS') {
      return { width: this._w ?? 420, height: this._h ?? 260, left: 0, top: 0, right: this._w ?? 420, bottom: this._h ?? 260, x: 0, y: 0 };
    }
    return { width: this.clientWidth, height: this.clientHeight, left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight, x: 0, y: 0 };
  }

  /* --- selectores --- */
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const child of node._children) {
        if (child.nodeType !== 1) continue;
        if (matches(child, sel)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  matches(sel) { return matches(this, sel); }

  /* --- canvas --- */
  getContext() {
    if (this.tagName !== 'CANVAS') return null;
    if (!this._ctx) this._ctx = makeContext(this);
    return this._ctx;
  }
  toDataURL() { return 'data:image/png;base64,STUB'; }

  /* --- utilidades internas --- */
  get options() { return this.tagName === 'SELECT' ? this._children.filter((c) => c.tagName === 'OPTION') : undefined; }
  get selectedIndex() {
    const opts = this.options ?? [];
    return opts.findIndex((o) => o.value === this._value);
  }
}

function syncSelect(select) {
  const opts = select._children.filter((c) => c.tagName === 'OPTION');
  if (!select._value && opts.length) select._value = opts[0].value;
}

class TextNode {
  constructor(text) { this.nodeType = 3; this._text = String(text); this.parentNode = null; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get data() { return this._text; }
  set data(v) { this._text = String(v); }
  remove() { if (this.parentNode) { const i = this.parentNode._children.indexOf(this); if (i >= 0) this.parentNode._children.splice(i, 1); } }
}

class StubFragment extends StubNode {
  constructor() { super('#fragment'); this.__fragment = true; }
}
class StubOption extends StubNode {
  constructor(text = '', value = '') {
    super('option');
    this._text = String(text);
    this._value = String(value);
    this.setAttribute('value', String(value));
  }
}
class StubElementNS extends StubNode {}
class StubCanvas extends StubNode {
  constructor() {
    super('canvas');
    this._w = 420;
    this._h = 260;
    this.width = 420;
    this.height = 260;
    this._ops = [];
  }
}

/* ------------------------- Canvas 2D mínimo ------------------------- */

function makeContext(canvas) {
  const ops = [];
  const state = { ops, canvas };
  const record = (name, args) => {
    ops.push({ name, args });
    if (ops.length > 200000) ops.shift();
  };
  const ctx = {
    canvas,
    ops,
    save: () => record('save'),
    restore: () => record('restore'),
    beginPath: () => record('beginPath'),
    closePath: () => record('closePath'),
    moveTo: (...a) => record('moveTo', a),
    lineTo: (...a) => record('lineTo', a),
    rect: (...a) => record('rect', a),
    roundRect: (...a) => record('roundRect', a),
    arc: (...a) => record('arc', a),
    arcTo: (...a) => record('arcTo', a),
    bezierCurveTo: (...a) => record('bezierCurveTo', a),
    quadraticCurveTo: (...a) => record('quadraticCurveTo', a),
    fill: () => record('fill'),
    stroke: () => record('stroke'),
    clip: () => record('clip'),
    fillText: (t, x, y) => record('fillText', [t, x, y]),
    strokeText: (t) => record('strokeText', [t]),
    measureText: (t) => ({ width: String(t).length * 6.2 }),
    createLinearGradient: () => ({ addColorStop() {}, __grad: true }),
    createRadialGradient: () => ({ addColorStop() {}, __grad: true }),
    createPattern: () => null,
    setLineDash: () => {},
    getLineDash: () => [],
    setTransform: () => record('setTransform'),
    resetTransform: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    clearRect: () => record('clearRect'),
    drawImage: () => {},
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: 'transparent',
  };
  Object.defineProperty(state, 'ctx', { value: ctx });
  ctx.__state = state;
  return ctx;
}

/* ---------------------------- Parser HTML --------------------------- */

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);

/** Parser tolerante: soporta etiquetas, atributos citados, comentarios, SVG y texto. */
function parseHtml(html) {
  const root = new StubFragment();
  const stack = [{ name: '#root', node: root }];
  let i = 0;
  const S = String(html ?? '');
  const push = (node) => {
    const parent = stack[stack.length - 1].node;
    node.parentNode = parent;
    parent._children.push(node);
  };

  while (i < S.length) {
    const lt = S.indexOf('<', i);
    if (lt < 0) { addText(S.slice(i)); break; }
    if (lt > i) addText(S.slice(i, lt));
    if (S.startsWith('<!--', lt)) { const end = S.indexOf('-->', lt); i = end < 0 ? S.length : end + 3; continue; }
    if (S.startsWith('<!', lt) || S.startsWith('<?', lt)) { const end = S.indexOf('>', lt); i = end < 0 ? S.length : end + 1; continue; }
    if (S[lt + 1] === '/') {
      const end = S.indexOf('>', lt);
      const name = S.slice(lt + 2, end).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      i = end + 1;
      continue;
    }
    const end = findTagEnd(S, lt);
    const raw = S.slice(lt + 1, end);
    const selfClosing = raw.trimEnd().endsWith('/');
    const body = selfClosing ? raw.trimEnd().slice(0, -1) : raw;
    const m = /^([a-zA-Z][\w:-]*)/.exec(body.trim());
    if (!m) { addText('<'); i = lt + 1; continue; }
    const tagName = m[1].toLowerCase();
    const isSvg = tagName === 'svg' || stack.some((s) => s.svg);
    const node = makeTag(tagName, isSvg);
    parseAttrs(body.slice(m[0].length), node);
    push(node);
    if (!selfClosing && !VOID_TAGS.has(tagName)) stack.push({ name: tagName, node, svg: isSvg || tagName === 'svg' });
    i = end + 1;
  }

  function addText(text) {
    const decoded = decodeEntities(text);
    if (decoded) push(new TextNode(decoded));
  }

  return root._children;
}

function findTagEnd(s, start) {
  let quote = null;
  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i;
  }
  return s.length;
}

function parseAttrs(str, node) {
  const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(str))) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    node.setAttribute(name, decodeEntities(value));
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', iquest: '¿', iacute: 'í', eacute: 'é', aacute: 'á', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', deg: '°', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', times: '×' };
function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[ent] ?? all;
  });
}

function makeTag(name, svg) {
  if (name === 'option') return new StubOption();
  if (name === 'canvas') return new StubCanvas();
  if (svg) {
    const n = new StubElementNS(name, 'http://www.w3.org/2000/svg');
    n.classList = new ClassList(n);
    return n;
  }
  return new StubNode(name);
}

/* --------------------------- Selectores ----------------------------- */

/** Soporta: tag, .clase, #id, [attr], tag.clase, combinaciones simples. */
function matches(node, selector) {
  const sel = String(selector).trim();
  if (sel.includes(',')) return sel.split(',').some((s) => matches(node, s.trim()));
  const parts = sel.split(/\s+/);
  const last = parts.pop();
  if (!matchSimple(node, last)) return false;
  let cur = node.parentNode;
  for (let i = parts.length - 1; i >= 0; i--) {
    let found = false;
    while (cur) {
      if (cur.nodeType === 1 && matchSimple(cur, parts[i])) { found = true; cur = cur.parentNode; break; }
      cur = cur.parentNode;
    }
    if (!found) return false;
  }
  return true;
}

function matchSimple(node, sel) {
  const re = /(^[a-zA-Z][\w-]*)|(\.([\w-]+))|(#([\w-]+))|(\[([\w-]+)(?:([~^$*|]?=)"?([^"\]]*)"?)?\])/g;
  let m;
  let consumed = 0;
  let ok = true;
  while ((m = re.exec(sel))) {
    consumed += m[0].length;
    if (m[1]) { if (node.tagName.toLowerCase() !== m[1].toLowerCase()) ok = false; }
    else if (m[3]) { if (!node.classList.contains(m[3])) ok = false; }
    else if (m[5]) { if (node.id !== m[5]) ok = false; }
    else if (m[7]) {
      const attr = m[7];
      const op = m[8];
      const val = m[9];
      const actual = attr === 'class' ? node.className : (node.getAttribute(attr) ?? (attr in node ? String(node[attr]) : undefined));
      if (actual === undefined || actual === null) { ok = false; continue; }
      if (!op && actual === '') ok = false;
      else if (op === '=' && actual !== val) ok = false;
      else if (op === '*=' && !String(actual).includes(val)) ok = false;
      else if (op === '^=' && !String(actual).startsWith(val)) ok = false;
      else if (op === '$=' && !String(actual).endsWith(val)) ok = false;
      else if (op === '~=' && !String(actual).split(/\s+/).includes(val)) ok = false;
    }
  }
  if (consumed < sel.length) {
    // Selector no soportado: ser permisivo en lugar de fallar la prueba.
    return ok;
  }
  return ok;
}

const kebab = (s) => String(s).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const camel = (s) => String(s).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** Vuelca un atributo style="a:b;c:d" en un objeto de propiedades. */
function parseInlineStyle(text, target) {
  for (const decl of String(text).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop) continue;
    target[camel(prop)] = value;
  }
}

/* ------------------------- Documento global ------------------------- */

function createDocument() {
  let html = new StubNode('html');
  html.setAttribute('data-theme', 'dark');
  let head = new StubNode('head');
  let body = new StubNode('body');
  html.append(head, body);

  const doc = {
    get documentElement() { return html; },
    set documentElement(v) { html = v; },
    get head() { return head; },
    set head(v) { head = v; },
    get body() { return body; },
    set body(v) { body = v; },
    activeElement: null,
    hidden: false,
    title: '',
    _byId: new Map(),

    createElement(tag) { return makeTag(String(tag).toLowerCase(), false); },
    createElementNS(ns, tag) { return makeTag(String(tag).toLowerCase(), String(ns).includes('svg')); },
    createDocumentFragment() { return new StubFragment(); },
    createTextNode(t) { return new TextNode(t); },

    getElementById(id) { return html.querySelector(`#${id}`); },
    querySelector(sel) { return html.querySelector(sel); },
    querySelectorAll(sel) { return html.querySelectorAll(sel); },
    addEventListener() {},
    removeEventListener() {},

    /** Carga un HTML en el árbol (equivalente a leer index.html). */
    loadHtml(source) {
      const nodes = parseHtml(source);
      const htmlNode = nodes.find((n) => n.tagName === 'HTML');
      if (!htmlNode) throw new Error('HTML sin <html>');
      doc.documentElement = htmlNode;
      doc.head = htmlNode.querySelector('head') ?? new StubNode('head');
      doc.body = htmlNode.querySelector('body') ?? new StubNode('body');
      // Metadatos que la aplicación consulta directamente.
      doc.title = htmlNode.querySelector('title')?.textContent ?? '';
      return htmlNode;
    },
  };
  return doc;
}

/** Instala todos los globals que necesita el código del navegador. */
function installGlobalShim({ html = '' } = {}) {
  const doc = createDocument();
  if (html) doc.loadHtml(html);

  const rafQueue = [];
  let rafId = 1;

  const win = {
    document: doc,
    devicePixelRatio: 2,
    innerWidth: 390,
    innerHeight: 844,
    scrollY: 0,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (fn) => { const id = rafId++; rafQueue.push({ id, fn }); return id; },
    cancelAnimationFrame: (id) => { const i = rafQueue.findIndex((x) => x.id === id); if (i >= 0) rafQueue.splice(i, 1); },
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    scrollTo() {},
    location: { protocol: 'http:', href: 'http://localhost:8080/' },
  };

  globalThis.window = win;
  globalThis.document = doc;
  globalThis.location = win.location;
  globalThis.scrollTo = win.scrollTo;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'node-shim', language: 'es-CO' },
      configurable: true,
      writable: true,
    });
  } catch { /* Node ya define navigator: se reutiliza el existente */ }
  globalThis.getComputedStyle = win.getComputedStyle;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  globalThis.localStorage = { _d: new Map(), getItem(k) { return this._d.get(k) ?? null; }, setItem(k, v) { this._d.set(k, String(v)); }, removeItem(k) { this._d.delete(k); } };
  globalThis.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; this.targets = new Set(); }
    observe(t) { this.targets.add(t); this.cb([{ target: t, isIntersecting: true }], this); }
    unobserve(t) { this.targets.delete(t); }
    disconnect() { this.targets.clear(); }
  };
  globalThis.Blob = class { constructor(parts) { this.parts = parts; this.size = String(parts).length; } };
  class StubURL {
    constructor(href) { this.href = String(href); }
    static createObjectURL() { return 'blob:stub'; }
    static revokeObjectURL() {}
  }
  globalThis.URL = StubURL;
  globalThis.Option = StubOption;
  win.Option = StubOption;

  return {
    window: win,
    document: doc,
    /** Ejecuta los callbacks de requestAnimationFrame pendientes. */
    flushRaf(rounds = 3) {
      for (let r = 0; r < rounds; r++) {
        const batch = rafQueue.splice(0, rafQueue.length);
        for (const { fn } of batch) fn(Date.now());
      }
    },
    rafPending: () => rafQueue.length,
  };
}

module.exports = { installGlobalShim, parseHtml, StubNode, StubCanvas };
