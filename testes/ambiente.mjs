// Ambiente de teste: carrega os scripts do site (web/*.js, na mesma ordem do index.html) num contexto isolado do Node,
// com navegador simulado (DOM "elástico" que aceita qualquer chamada). Assim os testes usam o código de verdade das
// telas, sem copiar fórmulas. Sem dependências: roda com `node --test`.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// JARVIS_WEB=_site testa a versão compactada que vai ser publicada.
const WEB = path.join(RAIZ, process.env.JARVIS_WEB || 'web');

// Objeto que aceita qualquer leitura, chamada ou atribuição (document, navigator, elementos…).
const elastico = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : elastico),
  apply: () => elastico, construct: () => elastico, set: () => true, has: () => true,
});

export function scriptsDoIndex() {
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([a-z0-9_]+\.js)\?v=[^"]*"/g)].map((m) => m[1]);
}

/** Carrega o site inteiro (ou a lista dada) e devolve { ctx, ev } — ev('expressão') avalia dentro do site. */
export function carregarSistema(arquivos = scriptsDoIndex()) {
  const armazenamento = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const ctx = vm.createContext({
    console, URL, TextEncoder, TextDecoder, structuredClone, queueMicrotask, performance, crypto: globalThis.crypto,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => '' }),
  });
  Object.assign(ctx, {
    window: ctx, self: ctx, globalThis: ctx, document: elastico, navigator: elastico, history: elastico, Notification: elastico,
    localStorage: armazenamento(), sessionStorage: armazenamento(),
    location: { hash: '', search: '', href: 'http://teste/', pathname: '/', protocol: 'http:', origin: 'http://teste' },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    HTMLElement: function () {}, Node: { DOCUMENT_POSITION_FOLLOWING: 4 }, Blob: function () {}, FileReader: function () {}, Image: function () {}, Audio: function () {},
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; },
    ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
  });
  for (const f of arquivos) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx, { filename: f });
  const ev = (codigo) => vm.runInContext(codigo, ctx);
  return { ctx, ev };
}

/** Compara valores em reais (centavos). */
export const centavos = (v) => Math.round(Number(v) * 100);
export { RAIZ, WEB };
