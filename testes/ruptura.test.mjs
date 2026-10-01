// Ruptura prevista: zera antes de uma compra feita hoje chegar; o que já está em pedido conta como saldo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emAberto, rupturasPrevistas } from '../supabase/functions/_shared/ruptura.ts';

test('itens em aberto: só pedidos enviados ou parciais, descontando o recebido', () => {
  const m = emAberto([{ status: 'enviado', itens: [{ sku: 'A', qtd: 10, recebido: 4 }] }, { status: 'rascunho', itens: [{ sku: 'A', qtd: 50 }] }, { status: 'parcial', itens: [{ sku: 'B', qtd: 5, recebido: 5 }] }]);
  assert.deepEqual([...m], [['A', 6]]);
});

test('avisa quem zera antes do prazo do fornecedor, em ordem de urgência', () => {
  const vendas = new Map([['A', { q30: 60, q60: 120, preco: 50 }], ['B', { q30: 30, q60: 60, preco: 20 }], ['C', { q30: 0, q60: 0 }]]);
  const prods = [
    { id: 'A', nome: 'Bola', saldo: 20, prazo_reposicao: 15 }, // 2/dia → 10 dias < 15: avisa
    { id: 'B', nome: 'Pião', saldo: 40, prazo_reposicao: 15 }, // 1/dia → 40 dias: tranquilo
    { id: 'C', nome: 'Parado', saldo: 5 },
    { id: 'D', nome: 'Sem saldo', saldo: 0 },
  ];
  const r = rupturasPrevistas(prods, vendas, new Map(), '2026-10-01');
  assert.deepEqual(r.map((x) => x.sku), ['A']);
  assert.equal(r[0].dias, 10);
  assert.equal(r[0].zeraEm, '2026-10-11');
  assert.equal(r[0].perdaDia, 100);
  assert.equal(rupturasPrevistas(prods, vendas, new Map([['A', 20]]), '2026-10-01').length, 0, 'com 20 em pedido, cobre 20 dias');
  assert.equal(rupturasPrevistas([{ id: 'A', nome: 'Bola', saldo: 20 }], vendas, new Map(), '2026-10-01', 8).length, 0, 'prazo padrão de 8 dias');
});
