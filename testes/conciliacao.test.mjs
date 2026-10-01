// Regras de conciliação que não podem quebrar (AGENTS.md, regra 2):
// líquido esperado = bruto − taxa; Conciliado quando o vinculado bate com o líquido (± R$ 0,01),
// Divergência quando há repasse vinculado que não bate, A receber sem repasse, Em trânsito quando marcado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';

const { ev, ctx } = carregarSistema();
function cenario(orders, receipts) {
  ctx.__o = orders; ctx.__r = receipts;
  ev(`db.orders=window.__o;db.receipts=window.__r;paymentIndex=null;month='2026-09'`);
}
const pedido = (id, gross, fee, extra = {}) => ({ id, platform: 'Shopee', date: '2026-09-10', gross, fee, ...extra });
const repasse = (id, amount, linkedOrder) => ({ id, date: '2026-09-20', amount, linkedOrder, platform: 'Shopee' });

test('líquido esperado é bruto menos taxa, arredondado em centavos', () => {
  cenario([pedido('A', 100, 18.37)], []);
  assert.equal(ev(`net(db.orders[0])`), 81.63);
});

test('status: Conciliado, Divergência, A receber e Em trânsito', () => {
  cenario(
    [pedido('C', 100, 20), pedido('D', 100, 20), pedido('R', 50, 5), pedido('T', 80, 8, { transit: true })],
    [repasse('1', 80, 'C'), repasse('2', 79.5, 'D')],
  );
  assert.equal(ev(`status(db.orders[0])`), 'Conciliado');
  assert.equal(ev(`status(db.orders[1])`), 'Divergência');
  assert.equal(ev(`status(db.orders[2])`), 'A receber');
  assert.equal(ev(`status(db.orders[3])`), 'Em trânsito');
});

test('tolerância de 1 centavo: diferença menor que R$ 0,01 concilia, R$ 0,02 não', () => {
  cenario([pedido('X', 100, 20), pedido('Y', 100, 20)], [repasse('1', 80.004, 'X'), repasse('2', 79.98, 'Y')]);
  assert.equal(ev(`status(db.orders[0])`), 'Conciliado');
  assert.equal(ev(`status(db.orders[1])`), 'Divergência');
});

test('vários repasses do mesmo pedido somam (repasse parcelado)', () => {
  cenario([pedido('P', 200, 40)], [repasse('1', 100, 'P'), repasse('2', 60, 'P')]);
  assert.equal(ev(`paid(db.orders[0])`), 160);
  assert.equal(ev(`status(db.orders[0])`), 'Conciliado');
});

test('repasse sem pedido vinculado não conta para nenhum pedido', () => {
  cenario([pedido('S', 100, 10)], [repasse('1', 90, null)]);
  assert.equal(ev(`paid(db.orders[0])`), 0);
  assert.equal(ev(`status(db.orders[0])`), 'A receber');
});

test('totais do mês: bruto, taxas, líquido, recebido e em aberto', () => {
  cenario(
    [pedido('A', 100, 20), pedido('B', 50, 5), pedido('C', 30, 3, { date: '2026-08-31' })],
    [repasse('1', 80, 'A'), repasse('2', 20, 'B')],
  );
  const s = ev(`stats()`);
  assert.equal(s.gross, 150, 'só pedidos da competência de setembro');
  assert.equal(s.fees, 25);
  assert.equal(s.net, 125);
  assert.equal(s.received, 100);
  assert.equal(s.reconciled, 80);
  assert.equal(s.open, 25, 'B ainda tem R$ 25 a receber');
});
