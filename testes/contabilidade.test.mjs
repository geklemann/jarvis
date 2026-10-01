// Contabilidade automática (partidas dobradas): todo lançamento gerado pelo sistema tem débito = crédito,
// a venda vira receita pelo bruto e a tarifa do marketplace vira despesa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema, centavos } from './ambiente.mjs';

const { ev, ctx } = carregarSistema();
ctx.__db = {
  orders: [
    { id: 'o1', platform: 'Shopee', date: '2026-09-10', gross: 100, fee: 20, shipping: 0, items: [{ sku: 'A', qty: 1, price: 100 }], nf: '101' },
    { id: 'o2', platform: 'Mercado Livre', date: '2026-09-12', gross: 250, fee: 40, shipping: 15, items: [{ sku: 'B', qty: 2, price: 125 }], nf: '102' },
  ],
  receipts: [{ id: 'r1', date: '2026-09-20', amount: 80, linkedOrder: 'o1', platform: 'Shopee' }],
  bankTx: [
    { id: 'b1', date: '2026-09-21', amount: 80, descricao: 'SHOPEE REPASSE', conta: 'itau' },
    { id: 'b2', date: '2026-09-22', amount: -500, descricao: 'FORNECEDOR XYZ', conta: 'itau' },
  ],
  payables: [{ id: 'p1', fornecedor: 'Fornecedor XYZ', vencimento: '2026-09-22', valor: 500, status: 'pago', pago_em: '2026-09-22', categoria: 'Compra de mercadorias' }],
  purchases: [],
  bankAccounts: [{ id: 'itau', nome: 'Itaú', saldo_inicial: 1000 }],
};
ev(`Object.assign(db,window.__db)`);
const { L } = ev(`Contab.diario()`);
const somaConta = (prefixo) => L.flatMap((e) => e.l).filter(([c]) => c.startsWith(prefixo)).reduce((a, [, v]) => a + v, 0);

test('o diário tem lançamentos para o mês', () => {
  assert.ok(L.length >= 3, `esperava vendas, pagamento e tributos; veio ${L.length}`);
});

test('todo lançamento fecha: débitos = créditos', () => {
  for (const e of L) {
    const s = e.l.reduce((a, [, v]) => a + v, 0);
    assert.equal(centavos(s), 0, `"${e.hist}" de ${e.d} está desbalanceado em ${s.toFixed(2)}`);
  }
});

test('o diário inteiro fecha: total de débitos = total de créditos', () => {
  const d = L.flatMap((e) => e.l).filter(([, v]) => v > 0).reduce((a, [, v]) => a + v, 0);
  const c = L.flatMap((e) => e.l).filter(([, v]) => v < 0).reduce((a, [, v]) => a - v, 0);
  assert.equal(centavos(d), centavos(c));
});

test('receita bruta de vendas = soma do bruto dos pedidos', () => {
  assert.equal(centavos(-somaConta('4.1')), centavos(350));
});

test('tarifas dos marketplaces viram despesa', () => {
  assert.equal(centavos(somaConta('6.1.01')), centavos(60));
});
