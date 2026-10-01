// Vigia de preços e margem ao igualar o concorrente, e a assinatura que agrupa erros repetidos na Central de erros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema, centavos } from './ambiente.mjs';
import { baixou, classificar, novoHistorico } from '../supabase/functions/_shared/precos_regras.ts';
import { assinaturaErro } from '../supabase/functions/_shared/erros.ts';

const { ev, ctx } = carregarSistema();

test('situação do anúncio: disputa do catálogo manda; fora dela, compara com o menor concorrente', () => {
  assert.equal(classificar(100, 95), 'mais_caro');
  assert.equal(classificar(95, 100), 'mais_barato');
  assert.equal(classificar(100, 100), 'mais_barato', 'empate conta como na frente');
  assert.equal(classificar(100, null), 'sozinho');
  assert.equal(classificar(100, 95, 'winning'), 'ganhando');
  assert.equal(classificar(100, 95, 'competing'), 'perdendo');
  assert.equal(classificar(100, 95, 'sharing_first_place'), 'compartilhando');
});

test('aviso de preço: só quando o concorrente baixou mais de 0,5% e ficou mais barato que você', () => {
  assert.equal(baixou({ menor_preco: 100 }, 98, 99), true);
  assert.equal(baixou({ menor_preco: 100 }, 99.6, 99), false, 'baixou só 0,4%');
  assert.equal(baixou({ menor_preco: 100 }, 98, 97), false, 'você continua mais barato');
  assert.equal(baixou(undefined, 50, 99), false, 'primeira verificação não avisa');
  assert.equal(baixou({ menor_preco: null }, 50, 99), false);
});

test('histórico: novo ponto quando muda o preço ou passa um dia; guarda 60', () => {
  const t0 = new Date('2026-10-01T10:00:00Z'), h = [{ em: t0.toISOString(), meu: 100, menor: 95 }];
  assert.equal(novoHistorico(h, 100, 95, new Date('2026-10-01T13:00:00Z')), h, 'nada mudou em 3 h');
  assert.equal(novoHistorico(h, 100, 94, new Date('2026-10-01T13:00:00Z')).length, 2, 'concorrente mudou');
  assert.equal(novoHistorico(h, 100, 95, new Date('2026-10-02T07:00:00Z')).length, 2, 'passou mais de 20 h');
  const cheio = Array.from({ length: 60 }, (_, i) => ({ em: new Date(t0.getTime() + i * 864e5).toISOString(), meu: i, menor: i }));
  const n = novoHistorico(cheio, 1, 1, new Date('2026-12-31T00:00:00Z'));
  assert.equal(n.length, 60);
  assert.equal(n.at(-1).meu, 1);
});

// Um pedido do Mercado Livre nos últimos 30 dias: venda 100, tarifa 20, custo 40, tributos 24% (padrão sem balancete).
// Margem hoje = 100 − 20 − 40 − 24 = 16. Igualando a R$ 90: 90 × (1 − 20% − 24%) − 40 = 10,40 (11,6%).
const hoje = new Date(), d = (n) => { const x = new Date(hoje); x.setDate(x.getDate() - n); return x.toLocaleDateString('sv-SE'); };
test('margem se igualar o concorrente: mesma tarifa %, custo e tributos do histórico do SKU', () => {
  ctx.__o = [{ id: 'P1', platform: 'Mercado Livre', date: d(3), gross: 100, fee: 20, items: [{ sku: 'A', qty: 1, price: 100 }] }];
  ev(`db.orders=window.__o;db.receipts=[];db.products=[{id:'A',custo:40}];db.pricing={}`);
  const s = JSON.parse(JSON.stringify(ev(`Margem.simular('A',90)`)));
  assert.equal(centavos(s.atual.lucroU), 1600);
  assert.equal(centavos(s.lucroU), 1040);
  assert.ok(Math.abs(s.margem - 10.4 / 90) < 1e-9);
  assert.equal(ev(`Margem.simular('SEM-VENDA',90)`), null, 'sem histórico não inventa margem');
});

test('margem do mês por canal: só pedidos com custo; cancelado fora', () => {
  ctx.__o = [
    { id: 'P1', platform: 'Mercado Livre', date: '2026-10-03', gross: 100, fee: 20, items: [{ sku: 'A', qty: 1, price: 100 }] },
    { id: 'P2', platform: 'Shopee', date: '2026-10-04', gross: 50, fee: 10, items: [{ sku: 'SEM-CUSTO', qty: 1, price: 50 }] },
    { id: 'P3', platform: 'Mercado Livre', date: '2026-10-05', gross: 80, fee: 80, items: [{ sku: 'A', qty: 1, price: 80 }] },
  ];
  ev(`db.orders=window.__o;db.products=[{id:'A',custo:40}]`);
  const m = JSON.parse(JSON.stringify(ev(`Margem.mes('2026-10')`)));
  assert.equal(m[''].venda, 100);
  assert.equal(centavos(m[''].lucro), 1600);
  assert.equal(m[''].semCusto, 1);
  assert.equal(m['Mercado Livre'].pedidos, 1);
});

test('central de erros: o mesmo erro com ids diferentes vira uma linha só (navegador e servidor)', () => {
  const pilha = "TypeError: x\n    at view (https://jaarvis.com.br/metas.js?v=20261001:12:5)\n    at render (https://jaarvis.com.br/app.js?v=20261001:40:1)";
  assert.equal(ev(`Erros.assinatura("Cannot read properties of undefined (reading 'mes')",${JSON.stringify(pilha)})`), "Cannot read properties of undefined (reading 'mes') @ metas.js:12");
  assert.equal(ev(`Erros.assinatura('Pedido 2000014811757289 não encontrado','')`), ev(`Erros.assinatura('Pedido 2000099999999999 não encontrado','')`));
  assert.equal(assinaturaErro('integrations', 'precos_vigiar', 'Falha 503 no item MLB123456'), 'Falha # no item MLB# @ integrations:precos_vigiar');
});

// Raio-X. Setembro: A 100 (tarifa 20, custo 40) → margem 100−20−40−24 = 16%. Outubro: A 100 (tarifa 25, custo 40) = 11
// e B 100 (tarifa 20, custo 70) = −14 → margem (11 − 14) ÷ 200 = −1,5%. Variação −17,5 p.p.:
// tarifa 20% → 22,5% (−2,5 p.p.), custo 40% → 55% (−15 p.p.), tributos iguais.
test('Raio-X da margem: fatores e produtos somam exatamente a variação', () => {
  ctx.__o = [
    { id: 'S1', platform: 'Mercado Livre', date: '2026-09-10', gross: 100, fee: 20, items: [{ sku: 'A', qty: 1, price: 100 }] },
    { id: 'O1', platform: 'Mercado Livre', date: '2026-10-10', gross: 100, fee: 25, items: [{ sku: 'A', qty: 1, price: 100 }] },
    { id: 'O2', platform: 'Shopee', date: '2026-10-11', gross: 100, fee: 20, items: [{ sku: 'B', qty: 1, price: 100 }] },
  ];
  ev(`db.orders=window.__o;db.products=[{id:'A',custo:40},{id:'B',custo:70}]`);
  const r = JSON.parse(JSON.stringify(ev(`Margem.raiox('2026-09','2026-10')`)));
  assert.equal(centavos(r.margemA * 100), 1600);
  assert.equal(centavos(r.margemB * 100), -150);
  const f = Object.fromEntries(r.fatores.map((x) => [x.id, x.efeito]));
  assert.equal(centavos(f.tarifa * 100), -250);
  assert.equal(centavos(f.custo * 100), -1500);
  assert.equal(centavos(f.tributos * 100), 0);
  const soma = (l) => l.reduce((s, x) => s + x, 0);
  assert.equal(centavos(soma(Object.values(f)) * 100), centavos(r.variacao * 100), 'fatores = variação');
  assert.equal(centavos(soma(r.produtos.itens.map((x) => x.contrib)) * 100), centavos(r.variacao * 100), 'produtos = variação');
  assert.equal(centavos((r.canais.mix + r.canais.marg) * 100), centavos(r.variacao * 100), 'mix + margem = variação');
  // A: 11/200 − 16/100 = −10,5 p.p. (piorou e perdeu peso); B: −14/200 = −7 p.p. (novo, no prejuízo).
  assert.deepEqual(r.produtos.itens.map((x) => [x.k, centavos(x.contrib * 100)]), [['A', -1050], ['B', -700]]);
  const a = r.produtos.itens.find((x) => x.k === 'A');
  assert.match(a.diag, /Tarifa subiu de 20,0% para 25,0%/);
});

// Ajuste de preço: regras e margem mínima. SKU A: venda 100, tarifa 20%, custo 40, tributos 24% (últimos 30 dias).
// A R$ 95: 95 × (1 − 0,20 − 0,24) − 40 = 13,20 (13,9%). A R$ 80: 80 × 0,56 − 40 = 4,80 (6,0%) — abaixo de 10% fica de fora.
test('ajuste de preço: regras e bloqueio abaixo da margem mínima', () => {
  ctx.__o = [{ id: 'P1', platform: 'Mercado Livre', date: d(3), gross: 100, fee: 20, items: [{ sku: 'A', qty: 1, price: 100 }] }];
  ev(`db.orders=window.__o;db.receipts=[];db.products=[{id:'A',custo:40}]`);
  const x = { item_id: 'MLB1', sku: 'A', meu_preco: 100, menor_preco: 95.01, preco_para_ganhar: 94.5 };
  ctx.__x = x;
  assert.equal(ev(`Concorrencia.novoPreco(window.__x,'igualar')`), 95);
  assert.equal(ev(`Concorrencia.novoPreco(window.__x,'ganhar')`), 94.5);
  assert.equal(ev(`Concorrencia.novoPreco(window.__x,'pct','−5')`), 95, 'sinal de menos tipográfico também vale');
  assert.equal(ev(`Concorrencia.novoPreco(window.__x,'pct','+3')`), 103);
  assert.equal(ev(`Concorrencia.novoPreco(window.__x,'fixo','89,90')`), 89.9);
  assert.equal(ev(`Concorrencia.novoPreco({...window.__x,menor_preco:null},'igualar')`), null);
  const [ok] = JSON.parse(JSON.stringify(ev(`Concorrencia.previa([window.__x],'igualar','',10)`)));
  assert.equal(ok.bloqueado, false);
  assert.equal(centavos(ok.lucroU), 1320);
  const [fora] = JSON.parse(JSON.stringify(ev(`Concorrencia.previa([window.__x],'fixo','80',10)`)));
  assert.equal(fora.bloqueado, true);
  assert.match(fora.motivo, /margem 6,0% abaixo do mínimo de 10%/);
});
