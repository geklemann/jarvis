// Metas do mês: esperado hoje = meta × fração do mês decorrida; ritmo = realizado ÷ esperado (≥100% no ritmo,
// ≥90% atenção, abaixo disso "abaixo do ritmo"); 3 primeiros dias sem julgamento. A tela (web/metas.js) e o servidor
// (alerta diário e relatório semanal, _shared/metas.ts) precisam dar o mesmo resultado para os mesmos números.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema, centavos } from './ambiente.mjs';
import { avaliar as avaliarServidor, fracaoBR, metasDoMes, projecaoSemana } from '../supabase/functions/_shared/metas.ts';

const { ev, ctx } = carregarSistema();
const tela = (expr) => JSON.parse(JSON.stringify(ev(expr)));
const quase = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

// 11/10/2026 ao meio-dia: 10 dias completos + meio dia, de 31 → 10,5/31.
const FRAC = 10.5 / 31;

test('fração do mês: 11/10 ao meio-dia = 10,5 de 31 dias (tela no horário local, servidor no de Brasília)', () => {
  quase(ev(`Metas.fracao('2026-10',new Date(2026,9,11,12,0))`), FRAC, 'tela');
  quase(fracaoBR('2026-10', new Date('2026-10-11T15:00:00Z')), FRAC, 'servidor (15 h UTC = 12 h em Brasília)');
  assert.equal(ev(`Metas.fracao('2026-09',new Date(2026,9,11,12,0))`), 1, 'mês passado');
  assert.equal(ev(`Metas.fracao('2026-11',new Date(2026,9,11,12,0))`), 0, 'mês futuro');
});

test('vendas: meta R$ 310.000 e R$ 100.000 vendidos em 11/10 → esperado R$ 105.000, 95% do ritmo (atenção)', () => {
  const a = tela(`Metas.avaliar({ind:'vendas',meta:310000,real:100000,frac:${FRAC},dias:31})`);
  assert.equal(centavos(a.esperado), centavos(105000));
  quase(a.ritmo, 100000 / 105000, 'ritmo');
  assert.equal(centavos(a.proj), centavos(295238.0952), 'projeção = 100.000 ÷ (10,5/31)');
  assert.equal(a.status, 'atencao');
});

test('limites do ritmo: 90.000 (86%) abaixo, 105.000 (100%) no ritmo', () => {
  assert.equal(ev(`Metas.avaliar({ind:'vendas',meta:310000,real:90000,frac:${FRAC},dias:31}).status`), 'abaixo');
  assert.equal(ev(`Metas.avaliar({ind:'vendas',meta:310000,real:105000,frac:${FRAC},dias:31}).status`), 'ok');
  assert.equal(ev(`Metas.avaliar({ind:'vendas',meta:310000,real:0,frac:${2 / 31},dias:31}).status`), 'cedo', 'dia 3 de manhã: sem julgamento');
  assert.equal(ev(`Metas.avaliar({ind:'vendas',meta:310000,real:0,frac:0,dias:31}).status`), 'futuro');
  assert.equal(ev(`Metas.avaliar({ind:'recebido',meta:310000,real:300000,frac:1,dias:31}).status`), 'atencao', 'mês fechado em 96,8%');
});

test('margem: compara direto com a meta (até 2 pontos abaixo = atenção)', () => {
  assert.equal(ev(`Metas.avaliar({ind:'margem',meta:18,real:18.2,base:1000}).status`), 'ok');
  assert.equal(ev(`Metas.avaliar({ind:'margem',meta:18,real:16.5,base:1000}).status`), 'atencao');
  assert.equal(ev(`Metas.avaliar({ind:'margem',meta:18,real:15.9,base:1000}).status`), 'abaixo');
  assert.equal(ev(`Metas.avaliar({ind:'margem',meta:18,real:null,base:0}).status`), 'semdados');
});

test('tela e servidor dão o mesmo resultado', () => {
  for (const real of [0, 90000, 100000, 105000, 400000]) {
    const t = tela(`Metas.avaliar({ind:'vendas',meta:310000,real:${real},frac:${FRAC},dias:31})`), s = avaliarServidor({ ind: 'vendas', meta: 310000, real, frac: FRAC, dias: 31 });
    assert.equal(t.status, s.status, `status com ${real}`);
    assert.equal(centavos(t.esperado), centavos(s.esperado), `esperado com ${real}`);
    assert.equal(centavos(t.proj), centavos(s.proj), `projeção com ${real}`);
  }
});

test('com projeção de fechamento (vendas), a situação vem da projeção ÷ meta', () => {
  const t = tela(`Metas.avaliar({ind:'vendas',meta:310000,real:100000,frac:${FRAC},dias:31,proj:300000})`), s = avaliarServidor({ ind: 'vendas', meta: 310000, real: 100000, frac: FRAC, dias: 31, proj: 300000 });
  assert.equal(t.status, 'atencao', '300.000 ÷ 310.000 = 96,8%');
  assert.equal(s.status, t.status);
  assert.equal(centavos(t.proj), centavos(300000));
  assert.equal(tela(`Metas.avaliar({ind:'vendas',meta:310000,real:100000,frac:1,dias:31,proj:300000})`).status, 'abaixo', 'mês fechado ignora projeção: 100.000 é 32%');
});

// Pedidos de outubro: ML 1.000 + 200 (cancelado, mas a Visão geral conta) e Shopee 500; o de setembro fica fora do mês.
const PEDIDOS = [
  { id: '1', platform: 'Mercado Livre', date: '2026-10-02', gross: 1000, fee: 150, items: [] },
  { id: '2', platform: 'Shopee', date: '2026-10-05', gross: 500, fee: 80, items: [] },
  { id: '3', platform: 'Mercado Livre', date: '2026-10-06', gross: 200, fee: 200, items: [] },
  { id: '4', platform: 'Shopee', date: '2026-09-30', gross: 999, fee: 100, items: [] },
];
const LIBERACOES = [{ platform: 'Mercado Livre', date: '2026-10-08', amount: 800 }, { platform: 'Mercado Livre', date: '2026-10-09', amount: -50 }];

test('realizado do mês na tela: vendas iguais às da Visão geral e recebido só com entradas', () => {
  ctx.__d = { o: PEDIDOS, r: LIBERACOES };
  ev(`db.orders=window.__d.o;db.receipts=window.__d.r;db.products=[]`);
  const r = tela(`Metas.realizado('2026-10')`);
  assert.equal(r[''].vendas, 1700);
  assert.equal(r['Mercado Livre'].vendas, 1200);
  assert.equal(r['Shopee'].vendas, 500);
  assert.equal(r[''].recebido, 800);
});

// 01/10/2026 é quinta. Últimos 14 dias antes de 11/10 (domingo): sex 500, seg 250, ter 100 e qua 499,50 por dia
// (cada pedido ÷ 2 semanas). Faltam 3 de cada dia da semana (12 a 31/10): 3 × (250 + 100 + 499,50 + 500) = 4.048,50.
test('projeção de fechamento: tela (Visão geral) e servidor dão 1.700 + 4.048,50 = 5.748,50', () => {
  const t = tela(`VendasProjecao('2026-10','2026-10-11')`), s = projecaoSemana('2026-10', '2026-10-11', PEDIDOS.map((o) => ({ data: o.date, bruto: o.gross, plataforma: o.platform })));
  assert.equal(centavos(t.proj), centavos(5748.5));
  assert.equal(centavos(s.proj), centavos(5748.5));
  assert.equal(centavos(t.porCanal.Shopee), centavos(s.porCanal.Shopee), 'Shopee: 500 + 3 × (250 + 499,50) = 2.748,50');
  assert.equal(centavos(s.porCanal.Shopee), centavos(2748.5));
  assert.equal(centavos(s.porCanal['Mercado Livre']), centavos(3000));
});

test('servidor: mesmas vendas e recebido a partir do banco (v_pedidos e receipts)', async () => {
  const tabelas = {
    metas: [{ workspace_id: 'ws', mes: '2026-10', canal: '', indicador: 'vendas', valor: 4650 }, { workspace_id: 'ws', mes: '2026-10', canal: 'Mercado Livre', indicador: 'recebido', valor: 3100 }],
    v_pedidos: PEDIDOS.map((o) => ({ plataforma: o.platform, data: o.date, bruto: o.gross, taxa: o.fee })),
    receipts: LIBERACOES.filter((x) => x.amount > 0),
  };
  const from = (t) => { let l = [...(tabelas[t] ?? [])]; const q = {
    select: () => q, eq: (k, v) => { if (k !== 'workspace_id') l = l.filter((r) => r[k] === v); return q; }, in: (k, v) => { l = l.filter((r) => v.includes(r[k])); return q; },
    gte: (k, v) => { l = l.filter((r) => r[k] >= v); return q; }, lte: (k, v) => { l = l.filter((r) => r[k] <= v); return q; }, gt: (k, v) => { l = l.filter((r) => r[k] > v); return q; },
    range: () => Promise.resolve({ data: l, error: null }), then: (ok) => ok({ data: l, error: null }) }; return q; };
  const r = await metasDoMes({ from }, 'ws', new Date('2026-10-11T15:00:00Z'));
  const v = r.lista.find((a) => a.ind === 'vendas'), rec = r.lista.find((a) => a.ind === 'recebido');
  assert.equal(v.real, 1700, 'vendas do mês (setembro fora)');
  assert.equal(centavos(v.esperado), centavos(4650 * FRAC), 'esperado = 4.650 × 10,5/31 = 1.575');
  assert.equal(centavos(v.proj), centavos(5748.5), 'projeção por dia da semana');
  assert.equal(v.status, 'ok', '5.748,50 ÷ 4.650 = 124%');
  assert.equal(rec.real, 800);
  assert.equal(rec.status, 'abaixo', '800 ÷ 1.050 = 76%');
});

// Margem: 16% em julho e agosto, −14% em setembro (venda 100, tarifa 50, custo 40, tributos 24) → média 6%.
test('sugestão pelo histórico conta mês com margem negativa', () => {
  ctx.__o = [['2026-07-10', 20], ['2026-08-10', 20], ['2026-09-10', 50]].map(([date, fee], i) => ({ id: 'S' + i, platform: 'Mercado Livre', date, gross: 100, fee, items: [{ sku: 'A', qty: 1, price: 100 }] }));
  ev(`db.orders=window.__o;db.receipts=[];db.products=[{id:'A',custo:40}]`);
  const s = tela(`Metas.sugerir('2026-10')`), mg = s.find((x) => x.canal === '' && x.indicador === 'margem');
  assert.equal(mg.valor, 6, '(16 + 16 − 14) ÷ 3');
  assert.equal(s.find((x) => x.canal === '' && x.indicador === 'vendas').valor, 100, '100 × 1,10 = 110 → centena mais próxima');
});
