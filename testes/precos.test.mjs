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
