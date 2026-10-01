// Preço da assinatura calculado no servidor: tem de bater com a tabela do kit comercial (30/09/2026).
import test from 'node:test';
import assert from 'node:assert/strict';

const { precoAssinatura } = await import('../supabase/functions/_shared/precos_jarvis.ts');

test('base por faixa de pedidos', () => {
  assert.equal(precoAssinatura({ plano: 'base', faixa: 1000 }).mensal, 297);
  assert.equal(precoAssinatura({ plano: 'base', faixa: 4000 }).mensal, 497);
  assert.equal(precoAssinatura({ plano: 'base', faixa: 10000 }).mensal, 797);
});

test('base com módulos (o exemplo da proposta: Fiscal + Contabilidade, até 10.000 pedidos)', () => {
  const p = precoAssinatura({ plano: 'base', faixa: 10000, modulos: ['fiscal', 'contab'] });
  assert.equal(p.mensal, 797 + 149 + 249);
  assert.equal(p.itens.length, 3);
});

test('folha e ponto: R$ 129 até 10 pessoas, R$ 229 até 25', () => {
  assert.equal(precoAssinatura({ plano: 'base', faixa: 1000, modulos: ['folha'] }).mensal, 297 + 129);
  assert.equal(precoAssinatura({ plano: 'base', faixa: 1000, modulos: ['folha'], folha25: true }).mensal, 297 + 229);
});

test('pacote completo por faixa (≈25% abaixo da soma) e com todos os módulos', () => {
  assert.equal(precoAssinatura({ plano: 'pacote', faixa: 1000 }).mensal, 690);
  const p = precoAssinatura({ plano: 'pacote', faixa: 4000 });
  assert.equal(p.mensal, 849);
  assert.deepEqual([...p.modulos].sort(), ['contab', 'crm', 'fiscal', 'folha']);
  assert.equal(precoAssinatura({ plano: 'pacote', faixa: 10000 }).mensal, 1090);
});

test('anual: paga 10 mensalidades pelos 12 meses', () => {
  const p = precoAssinatura({ plano: 'pacote', faixa: 4000, ciclo: 'anual' });
  assert.equal(p.cobrar, 8490);
  assert.equal(p.ciclo, 'anual');
});

test('escolhas inválidas são recusadas (o preço nunca vem da tela)', () => {
  assert.throws(() => precoAssinatura({ plano: 'base', faixa: 2500 }), /Faixa/);
  assert.throws(() => precoAssinatura({ plano: 'premium', faixa: 1000 }), /plano/);
  assert.throws(() => precoAssinatura({ plano: 'pacote', faixa: 1000, folha25: true }), /até 25/);
  assert.equal(precoAssinatura({ plano: 'base', faixa: 1000, modulos: ['inexistente', 'fiscal', 'fiscal'] }).mensal, 297 + 149);
});
