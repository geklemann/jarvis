// Resumo do dia: datas no horário de Brasília e o texto com vendas, comparação, metas e o que vence hoje.
import test from 'node:test';
import assert from 'node:assert/strict';
import { datasResumo, montarResumo } from '../supabase/functions/_shared/resumo_diario.ts';

test('datas: às 7 h de Brasília de quinta, ontem é quarta e compara com as 4 quartas anteriores', () => {
  const d = datasResumo(new Date('2026-10-01T10:00:00Z'));
  assert.equal(d.hoje, '2026-10-01');
  assert.equal(d.ontem, '2026-09-30');
  assert.deepEqual(d.iguais, ['2026-09-23', '2026-09-16', '2026-09-09', '2026-09-02']);
  assert.equal(d.mesIni, '2026-09-01');
});

test('texto do resumo', () => {
  const r = montarResumo({
    ontem: '2026-09-30',
    canais: [{ canal: 'Shopee', n: 90, bruto: 9000, taxa: 2700, media: 7500 }, { canal: 'Mercado Livre', n: 10, bruto: 1000, taxa: 400, media: 1250 }],
    mes: { bruto: 250000, n: 2500 },
    metas: [{ ind: 'vendas', canal: null, meta: 300000, real: 250000, proj: 270000, ritmo: 0.9, status: 'abaixo' }],
    caixa: 12345.6, atrasados: { n: 2, valor: 300 }, vencemHoje: { n: 0, valor: 0 }, urgentes: 1,
  });
  assert.match(r.assunto, /quarta 30\/09/);
  assert.match(r.texto, /Vendas: R\$\s?10\.000,00 em 100 pedidos \(\+14% vs\. média de quarta\) · tarifa 31,0%/);
  assert.match(r.texto, /Mercado Livre: R\$\s?1\.000,00 \(10\) · −20% vs\. média de quarta/);
  assert.match(r.texto, /projeção de R\$\s?270\.000,00 para meta de R\$\s?300\.000,00 \(90%\)/);
  assert.match(r.texto, /2 repasse\(s\) atrasado\(s\)/);
  assert.doesNotMatch(r.texto, /vencem hoje/);
  assert.match(r.html, /Resumo de quarta, 30\/09/);
});
