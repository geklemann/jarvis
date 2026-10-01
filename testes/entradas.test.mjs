// Notas de entrada pela SEFAZ: o código do fornecedor vira o SKU da loja pelo que foi aprendido comparando a mesma nota
// nas duas fontes; CFOP de saída do fornecedor vira CFOP de entrada; compra × devolução pelo CFOP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aprenderMapa, converter, tipoEntrada } from '../supabase/functions/_shared/entradas.ts';

test('aprende código do fornecedor → SKU comparando a mesma nota (itens na mesma ordem)', () => {
  const m = aprenderMapa('12345678000190', [{ codigo: 'F-10' }, { codigo: 'F-20' }], [{ sku: 'CS1001' }, { sku: 'CS2002' }]);
  assert.deepEqual(m.map((x) => [x.codigo, x.sku]), [['F-10', 'CS1001'], ['F-20', 'CS2002']]);
  assert.deepEqual(aprenderMapa('12345678000190', [{ codigo: 'F-10' }], [{ sku: 'A' }, { sku: 'B' }]), [], 'quantidade de itens diferente: não arrisca');
});

test('nota da SEFAZ vira nota de entrada com o SKU da loja e CFOP de entrada', () => {
  const mapa = new Map([['12345678000190|F-10', 'CS1001']]);
  const r = converter({ chave: '4226', emitente: 'Fornecedor A', emitente_doc: '12.345.678/0001-90', emissao: '2026-09-30T10:00:00-03:00', valor: 300,
    detalhe: { numero: 77, serie: 1, natureza: 'Venda', total: 300, itens: [{ codigo: 'F-10', descricao: 'Bola', cfop: '6102', qtd: 10, valor: 20, total: 200 }, { codigo: 'F-99', descricao: 'Novo', cfop: '6102', qtd: 1, valor: 100, total: 100 }], duplicatas: [{ numero: '001', vencimento: '2026-10-30', valor: 300 }] } }, mapa);
  assert.equal(r.id, 'SEFAZ-NFE-4226');
  assert.equal(r.emissao, '2026-09-30');
  assert.equal(r.cfop, '2102', 'venda interestadual do fornecedor (6102) = compra interestadual (2102)');
  assert.equal(r.tipo, 'compra');
  assert.deepEqual(r.itens.map((i) => [i.sku, i.codigo_fornecedor, i.qtd]), [['CS1001', 'F-10', 10], ['F-99', 'F-99', 1]]);
  assert.equal(r.sem_mapa, 1, 'um item ainda sem tradução');
  assert.deepEqual(r.parcelas, [{ data: '2026-10-30', valor: 300, forma: null, obs: 'Duplicata 001' }]);
  assert.equal(r.source, 'SEFAZ');
});

test('tipo pelo CFOP de entrada', () => {
  assert.equal(tipoEntrada('1102'), 'compra');
  assert.equal(tipoEntrada('2202'), 'devolucao');
  assert.equal(tipoEntrada('1949'), 'outros');
});
