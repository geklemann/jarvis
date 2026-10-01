// Compras: a sugestão desconta o que já foi pedido e está a caminho (senão compraria de novo), o pedido acha o e-mail
// do fornecedor no cadastro e o e-mail enviado ao fornecedor tem o total e a planilha certos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';
import { montarEmailPedido } from '../supabase/functions/_shared/pedido_compra.ts';

const { ev, ctx } = carregarSistema();

test('quantidade sugerida: 2/dia × (20 + 45 dias) + 14 de segurança − 30 em estoque = 114', () => {
  assert.equal(ev(`Estoque.sugestao({media:2,prazo:20,alvo:45,minimo:14,saldo:30})`), 114);
  assert.equal(ev(`Estoque.sugestao({media:2,prazo:20,alvo:45,minimo:14,saldo:30,emPedido:100})`), 14, '100 unidades já a caminho');
  assert.equal(ev(`Estoque.sugestao({media:2,prazo:20,alvo:45,minimo:14,saldo:30,emPedido:200})`), 0, 'já pedido mais que o necessário');
  assert.equal(ev(`Estoque.sugestao({media:0.3,prazo:10,alvo:20,minimo:0,saldo:0})`), 9, 'arredonda para cima (8,99…)');
});

test('a caminho: só pedidos enviados ou recebidos em parte, e só o que falta chegar', () => {
  ctx.__pcs = [
    { status: 'enviado', itens: [{ sku: 'A', qtd: 50, recebido: 10 }, { sku: 'B', qtd: 5, recebido: 5 }] },
    { status: 'parcial', itens: [{ sku: 'A', qtd: 20, recebido: 0 }] },
    { status: 'rascunho', itens: [{ sku: 'A', qtd: 99 }] },
    { status: 'recebido', itens: [{ sku: 'C', qtd: 7, recebido: 7 }] },
    { status: 'cancelado', itens: [{ sku: 'C', qtd: 7 }] },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify([...ev(`Estoque2.emAberto(window.__pcs)`)])), [['A', 60]]);
});

test('e-mail do fornecedor vem do cadastro: pelo CNPJ ou pelo nome', () => {
  ctx.__cad = [
    { tipo: 'forn', ativo: true, dados: { razao: 'Brinquedos Alegria Ltda', fantasia: 'Alegria Brinquedos', doc: '12.345.678/0001-90', email: 'vendas@alegria.com.br' } },
    { tipo: 'forn', ativo: true, dados: { razao: 'Embalagens Sul SA', email: 'pedidos@embsul.com.br' } },
    { tipo: 'forn', ativo: false, dados: { razao: 'Inativo Ltda', email: 'x@inativo.com' } },
  ];
  ev(`db.cadastros=window.__cad`);
  assert.equal(ev(`Estoque2.emailForn('Qualquer nome','12345678000190')`), 'vendas@alegria.com.br', 'pelo CNPJ');
  assert.equal(ev(`Estoque2.emailForn('ALEGRIA BRINQUEDOS')`), 'vendas@alegria.com.br', 'pelo nome fantasia, sem diferenciar maiúsculas');
  assert.equal(ev(`Estoque2.emailForn('Embalagens Sul')`), 'pedidos@embsul.com.br', 'parte da razão social');
  assert.equal(ev(`Estoque2.emailForn('Inativo Ltda')`), '', 'fornecedor inativo não conta');
  assert.equal(ev(`Estoque2.emailForn('Outro')`), '');
});

test('e-mail do pedido: total, itens sem quantidade fora e planilha com vírgula decimal', () => {
  const e = montarEmailPedido({ numero: 7, fornecedor: 'Alegria Brinquedos', previsto: '2026-10-20', itens: [
    { sku: 'A1', nome: 'Bola', qtd: 10, custo: 12.5 }, { sku: 'B2', nome: 'Pião "turbo"', qtd: 3, custo: 7.333 }, { sku: 'Z', nome: 'Zerado', qtd: 0, custo: 5 },
  ] }, 'Loja Modelo', 'compras@lojamodelo.com.br');
  assert.equal(e.assunto, 'Pedido de compra nº 7 · Loja Modelo');
  assert.equal(e.total, 147, '10 × 12,50 + 3 × 7,333 = 146,999 → 147,00');
  assert.equal(e.itens, 2);
  assert.match(e.texto, /Total: R\$\s147,00 \(2 item\(ns\)\)/);
  assert.match(e.texto, /Entrega desejada: 20\/10\/2026/);
  assert.ok(!e.texto.includes('Zerado'));
  assert.ok(e.html.includes('Pião &quot;turbo&quot;'), 'texto do produto escapado no HTML');
  const csv = Buffer.from(e.anexo.base64, 'base64').toString('utf8');
  assert.ok(csv.startsWith('﻿'), 'BOM para o Excel');
  assert.ok(csv.includes('"A1";"Bola";"10";"12,50";"125,00"'));
  assert.ok(csv.includes('"B2";"Pião ""turbo""";"3";"7,33";"22,00"'));
  assert.ok(csv.includes('"";"Total";"";"";"147,00"'));
  assert.equal(e.anexo.nome, 'pedido-compra-7.csv');
});
