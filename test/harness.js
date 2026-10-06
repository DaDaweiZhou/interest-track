/*
 * 测试台：在 jsdom 中加载 Interest.html，并把行情接口替换成可控的桩。
 *
 * 桩返回的是字节级真实的响应：除股票名称用 GBK 编码（见 gbk-names.json）外其余字段为 ASCII，
 * 与应用内 new TextDecoder('gbk') 的解码路径保持一致。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'Interest.html');

const GBK_NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'gbk-names.json'), 'utf8'));

// Build a byte-accurate response: every field is ASCII except the name, which is real GBK.
function buildQuoteBuffer(o) {
  const f = new Array(88).fill('');
  f[0] = '1';
  f[1] = '\u0000NAME\u0000';
  f[2] = o.code;
  f[3] = String(o.price);
  f[4] = String(o.prev);
  f[31] = String((o.price - o.prev).toFixed(2));
  f[32] = String(o.chg !== undefined ? o.chg : ((o.price - o.prev) / o.prev * 100).toFixed(2));
  f[64] = String(o.dy !== undefined ? o.dy : 0);
  const joined = f.join('~');
  const [head, tail] = joined.split('\u0000NAME\u0000');
  const nameHex = GBK_NAMES[o.name];
  const nameBytes = nameHex
    ? Buffer.from(nameHex, 'hex')
    : Buffer.from(String(o.name === undefined ? 'TEST' : o.name).replace(/[^\x20-\x7E]/g, '?'), 'latin1');
  return Buffer.concat([
    Buffer.from(`v_${o.prefix || 'sh'}${o.code}="`, 'latin1'),
    Buffer.from(head, 'latin1'),
    nameBytes,
    Buffer.from(tail, 'latin1'),
    Buffer.from('";', 'latin1'),
  ]);
}

function makeResponse(buf) {
  const bytes = Uint8Array.from(buf);
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  });
}

/**
 * @param {object} opts
 *   quotes: { code: quoteObj | quoteObj[] | 'NOTFOUND' }  (array => per-call sequence)
 *   storage: { key: value } pre-seeded localStorage
 */
async function load(opts = {}) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const errors = [];
  const logs = [];
  const calls = [];

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e && e.message)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  vc.on('warn', (...a) => logs.push('console.warn: ' + a.join(' ')));
  vc.on('log', (...a) => logs.push('console.log: ' + a.join(' ')));

  const quoteState = {};
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost:8000/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.TextDecoder = TextDecoder;
      window.TextEncoder = TextEncoder;
      window.confirm = () => true;
      window.URL.createObjectURL = () => 'blob:stub';
      window.URL.revokeObjectURL = () => {};
      const seeded = (opts.storage || {});
      for (const k of Object.keys(seeded)) window.localStorage.setItem(k, seeded[k]);
      window.fetch = (url) => {
        const m = /q=([a-z]+)(\w+)/.exec(String(url));
        const code = m ? m[2] : String(url);
        calls.push(code);
        const entry = (opts.quotes || {})[code];
        if (entry === 'NOTFOUND' || entry === undefined) return makeResponse(Buffer.from(`v_x${code}="";`, 'latin1'));
        if (Array.isArray(entry)) {
          quoteState[code] = (quoteState[code] || 0);
          const q = entry[Math.min(quoteState[code], entry.length - 1)];
          quoteState[code]++;
          return makeResponse(buildQuoteBuffer(q));
        }
        return makeResponse(buildQuoteBuffer(entry));
      };
    },
  });

  const { window } = dom;
  await new Promise((r) => {
    if (window.document.readyState === 'complete') return r();
    window.addEventListener('load', () => r());
    setTimeout(r, 1500);
  });
  await tick(window, 0);

  return { dom, window, document: window.document, errors, logs, calls };
}

function tick(window, ms = 0) {
  return new Promise((r) => window.setTimeout(r, ms));
}

function text(window, sel) {
  const el = window.document.querySelector(sel);
  return el ? el.textContent.trim() : null;
}

function rows(window, sel) {
  return Array.from(window.document.querySelectorAll(sel));
}

function click(window, sel) {
  const el = window.document.querySelector(sel);
  if (!el) throw new Error('no element ' + sel);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function setVal(window, sel, v) {
  const el = window.document.querySelector(sel);
  if (!el) throw new Error('no element ' + sel);
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  return el;
}

function submit(window, sel) {
  const form = window.document.querySelector(sel);
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

module.exports = { load, tick, text, rows, click, setVal, submit, buildQuoteBuffer };
