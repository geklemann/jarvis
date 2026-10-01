// Sugestões de conciliação: o motor propõe vínculos (nunca grava sozinho) e precisa ser conservador —
// liberação citando o pedido, valor exato, repasse dividido, prazo aprendido; disputa e competência fechada ficam de fora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';

const { ev, ctx } = carregarSistema();
function cenario({ orders, receipts, closures = {} }) {
  ctx.__d = { orders, receipts, closures };
  ev(`db.orders=window.__d.orders;db.receipts=window.__d.receipts;db.closures=window.__d.closures;paymentIndex=null;month='2026-09'`);
  // JSON: traz o resultado do contexto isolado para objetos comuns (comparação estrutural).
  return JSON.parse(JSON.stringify(ev(`Sugestoes.sugerir('2026-09')`).map((s) => ({ pedido: s.o.id, libs: s.rs.map((r) => r.id).sort(), conf: s.conf, dif: s.dif, motivos: s.motivos }))));
}
const P = (id, gross, fee, date = '2026-09-05', extra = {}) => ({ id, platform: 'Mercado Livre', date, gross, fee, ...extra });
const L = (id, amount, date, extra = {}) => ({ id, platform: 'Mercado Livre', amount, date, linkedOrder: null, orderId: '', description: '', ...extra });

test('liberação que informa o pedido e fecha ao centavo: confiança alta', () => {
  const s = cenario({ orders: [P('2000014811757289', 100, 20)], receipts: [L('LIB1', 80, '2026-09-20', { orderId: '2000014811757289' })] });
  assert.deepEqual(s.map((x) => [x.pedido, x.libs, x.conf]), [['2000014811757289', ['LIB1'], 'alta']]);
});

test('número do pedido só na descrição da liberação, com diferença de centavos: confiança média', () => {
  const s = cenario({ orders: [P('2000014811757289', 100, 20)], receipts: [L('LIB1', 79.7, '2026-09-20', { description: 'Liberação de dinheiro venda 2000014811757289' })] });
  assert.equal(s.length, 1);
  assert.equal(s[0].conf, 'média');
  assert.equal(s[0].dif, -0.3);
});

test('repasse dividido em duas liberações do mesmo pedido', () => {
  const s = cenario({
    orders: [P('2000099999999999', 300, 60)],
    receipts: [L('A', 140, '2026-09-20', { orderId: '2000099999999999' }), L('B', 100, '2026-09-25', { orderId: '2000099999999999' })],
  });
  assert.deepEqual(s.map((x) => [x.libs, x.conf]), [[['A', 'B'], 'alta']]);
});

test('valor exato perto da previsão de liberação, sem citar o pedido: confiança média', () => {
  const s = cenario({ orders: [P('2000011111111111', 100, 20, '2026-09-05', { due: '2026-09-21' })], receipts: [L('X', 80, '2026-09-20')] });
  assert.deepEqual(s.map((x) => [x.pedido, x.conf]), [['2000011111111111', 'média']]);
});

test('dois pedidos disputando a mesma liberação só pelo valor: nenhuma sugestão (fica para revisão manual)', () => {
  const s = cenario({
    orders: [P('2000011111111111', 100, 20, '2026-09-05', { due: '2026-09-20' }), P('2000022222222222', 100, 20, '2026-09-05', { due: '2026-09-20' })],
    receipts: [L('X', 80, '2026-09-20')],
  });
  assert.equal(s.length, 0);
});

test('competência fechada não recebe sugestão', () => {
  const s = cenario({
    orders: [P('2000014811757289', 100, 20)],
    receipts: [L('LIB1', 80, '2026-09-20', { orderId: '2000014811757289' })],
    closures: { '2026-09': { fechado: true } },
  });
  assert.equal(s.length, 0);
});

test('liberação já vinculada não é sugerida de novo', () => {
  const s = cenario({ orders: [P('2000014811757289', 100, 20)], receipts: [L('LIB1', 80, '2026-09-20', { orderId: '2000014811757289', linkedOrder: 'outro' })] });
  assert.equal(s.length, 0);
});

test('prazo aprendido com os vínculos confirmados substitui a previsão ausente', () => {
  // Histórico: 4 pedidos pagos 14 dias depois da venda.
  const hist = [1, 2, 3, 4].map((i) => P(`200003000000000${i}`, 50, 10, '2026-08-01'));
  const pagos = [1, 2, 3, 4].map((i) => L(`H${i}`, 40, '2026-08-15', { linkedOrder: `200003000000000${i}` }));
  ctx.__d = { orders: hist, receipts: pagos, closures: {} };
  ev(`db.orders=window.__d.orders;db.receipts=window.__d.receipts;db.closures={};paymentIndex=null`);
  assert.equal(ev(`Sugestoes.aprender().get('Mercado Livre').dias`), 14);
  // Pedido novo sem previsão: liberação de valor exato 14 dias depois vira sugestão média.
  const s = cenario({ orders: [...hist, P('2000044444444444', 100, 20, '2026-09-02')], receipts: [...pagos, L('N', 80, '2026-09-16')] });
  assert.deepEqual(s.map((x) => [x.pedido, x.libs, x.conf]), [['2000044444444444', ['N'], 'média']]);
  assert.match(s[0].motivos.join(' '), /prazo aprendido \(14 dias/);
});

test('o motor não grava nada: só propõe', () => {
  cenario({ orders: [P('2000014811757289', 100, 20)], receipts: [L('LIB1', 80, '2026-09-20', { orderId: '2000014811757289' })] });
  assert.equal(ev(`db.receipts[0].linkedOrder`), null);
});

test('Shopee: pedidos do mesmo dia (mesmo prefixo de data) não se confundem', () => {
  // 260621KNRCMFFD e a liberação SHP-260621KHDUXAD2 compartilham só a data "260621": não é o mesmo pedido.
  const S = (id, gross, fee) => ({ id, platform: 'Shopee', date: '2026-09-05', gross, fee });
  const LS = (id, amount, extra = {}) => ({ id, platform: 'Shopee', amount, date: '2026-09-15', linkedOrder: null, orderId: '', description: '', ...extra });
  const s = cenario({ orders: [S('260621KNRCMFFD', 100, 20)], receipts: [LS('SHP-260621KHDUXAD2', 80.9)] });
  assert.equal(s.length, 0);
  const certo = cenario({ orders: [S('260621KNRCMFFD', 100, 20)], receipts: [LS('SHP-260621KNRCMFFD', 80)] });
  assert.deepEqual(certo.map((x) => [x.pedido, x.conf]), [['260621KNRCMFFD', 'alta']]);
});
