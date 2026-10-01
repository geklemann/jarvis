// Mudança de tarifa por canal: semana recente × 28 dias anteriores, impacto no mês e reajuste que devolve o líquido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { janelas, mudancasTarifa } from '../supabase/functions/_shared/tarifas.ts';

const dias = (ini, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(ini + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10));
function pedidos(canal, datas, porDia, tarifa, sku = 'CS1') {
  return datas.flatMap((d) => Array.from({ length: porDia }, () => ({ platform: canal, date: d, gross: 100, fee: 100 * tarifa, items: [{ sku, title: 'Bola', qty: 1, price: 100 }] })));
}

test('janelas: 7 dias fechados contra os 28 anteriores', () => {
  assert.deepEqual(janelas('2026-10-01'), { recIni: '2026-09-24', recFim: '2026-09-30', baseIni: '2026-08-27', baseFim: '2026-09-23' });
});

test('tarifa da Shopee subiu de 26% para 30%: avisa, com impacto e reajuste', () => {
  const j = janelas('2026-10-01');
  const p = [...pedidos('Shopee', dias(j.baseIni, 28), 10, 0.26), ...pedidos('Shopee', dias(j.recIni, 7), 10, 0.30), ...pedidos('Mercado Livre', dias(j.baseIni, 35), 5, 0.20)];
  const r = mudancasTarifa(p, '2026-10-01');
  assert.equal(r.length, 1, 'só a Shopee mudou');
  const s = r[0];
  assert.equal(s.canal, 'Shopee');
  assert.ok(Math.abs(s.delta - 0.04) < 1e-9);
  assert.ok(Math.abs(s.impactoMes - (-0.04 * 7000 * 30 / 7)) < 1e-6, 'perde 4% de 7 mil por semana, levado ao mês');
  assert.ok(Math.abs(s.reajuste - (0.74 / 0.70 - 1)) < 1e-9, 'preço +5,7% devolve o mesmo líquido');
  assert.equal(s.produtos[0].sku, 'CS1');
});

test('variação pequena ou pouco volume não avisa', () => {
  const j = janelas('2026-10-01');
  assert.equal(mudancasTarifa([...pedidos('Shopee', dias(j.baseIni, 28), 10, 0.26), ...pedidos('Shopee', dias(j.recIni, 7), 10, 0.27)], '2026-10-01').length, 0, '1 ponto: abaixo do limiar');
  assert.equal(mudancasTarifa([...pedidos('Magalu', dias(j.baseIni, 28), 1, 0.15), ...pedidos('Magalu', dias(j.recIni, 2), 1, 0.30)], '2026-10-01').length, 0, 'poucos pedidos na semana');
});
