// Radar de margem: o custo de plataforma de cada pedido é decomposto em comissão, taxa fixa, rebate, frete e
// outros ajustes. Regra que não pode quebrar: as partes somam exatamente o total cobrado
// (T = venda dos produtos − repasse líquido + frete do vendedor), senão a margem mostrada fica errada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema, centavos } from './ambiente.mjs';

const { ev, ctx } = carregarSistema();
ev(`db.orders=[];db.receipts=[];db.pricing={}`);
const partes = (o, frete = 0) => { ctx.__x = { o, frete }; return ev(`Margem.partes(window.__x)`); };
const soma = (r) => r.com + r.fixa - r.reb + r.frete + r.outros;
const fecha = (r, msg) => assert.equal(centavos(soma(r)), centavos(r.T), `${msg}: partes somam ${soma(r).toFixed(2)}, total ${r.T.toFixed(2)}`);

test('Mercado Livre: comissão separada do frete do Mercado Envios', () => {
  const r = partes({ platform: 'Mercado Livre', gross: 200, fee: 50, shipping: 20, items: [{ qty: 1, price: 200, sku: 'A' }], external: { tarifas_plataforma: 50 } });
  assert.equal(r.T, 50);
  assert.equal(r.com, 30, 'tarifa 50 − frete 20');
  assert.equal(r.frete, 20);
  assert.equal(r.real, true);
  fecha(r, 'ML');
});

test('Mercado Livre: repasse menor que o previsto aparece em "outros" e é sinalizado', () => {
  const r = partes({ platform: 'Mercado Livre', gross: 200, fee: 60, shipping: 20, items: [{ qty: 1, price: 200, sku: 'A' }], external: { tarifas_plataforma: 50 } });
  assert.equal(r.outros, 10);
  assert.equal(r.menor, true);
  fecha(r, 'ML com repasse menor');
});

test('Mercado Livre: repasse acima do previsto vira rebate', () => {
  const r = partes({ platform: 'Mercado Livre', gross: 200, fee: 45, shipping: 20, items: [{ qty: 1, price: 200, sku: 'A' }], external: { tarifas_plataforma: 50 } });
  assert.equal(r.reb, 5);
  fecha(r, 'ML com rebate');
});

test('Shopee com o detalhe da API: comissão, taxa fixa, rebate e descontos', () => {
  const r = partes({
    platform: 'Shopee', gross: 100, fee: 30, items: [{ qty: 1, price: 100 }],
    external: { renda: { commission_fee: 12, service_fee: 6.5, net_commission_fee: 10, net_service_fee: 6.5, pix_discount: 1 } },
  }, 5);
  assert.equal(r.T, 35);
  assert.equal(r.fixa, 6.5, 'taxa fixa limitada à taxa de serviço cobrada');
  assert.equal(r.com, 12);
  assert.equal(r.reb, 2, 'comissão cheia 12 − líquida 10');
  assert.equal(r.real, true);
  fecha(r, 'Shopee API');
});

test('Shopee sem o detalhe da API: as partes estimadas também fecham com o total', () => {
  for (const preco of [49.9, 89.9, 150, 320]) {
    const r = partes({ platform: 'Shopee', gross: preco, fee: preco * 0.25, items: [{ qty: 1, price: preco }] });
    fecha(r, `Shopee estimada (R$ ${preco})`);
  }
});

test('faixas da taxa fixa da Shopee (padrão do sistema)', () => {
  const r79 = partes({ platform: 'Shopee', gross: 79.99, fee: 20, items: [{ qty: 1, price: 79.99 }] });
  const r100 = partes({ platform: 'Shopee', gross: 100, fee: 30, items: [{ qty: 1, price: 100 }] });
  assert.equal(r79.fixa, 4);
  assert.equal(r100.fixa, 20);
});
