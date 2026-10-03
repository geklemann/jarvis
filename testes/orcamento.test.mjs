// Orçamento: base histórica com sazonalidade, DRE orçada (canal, despesas por grupo, pessoal, depreciação), caixa
// projetado com prazos e forecast pelo ritmo de vendas. Cálculo em web/orcmodelo.js (window.OrcModelo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';

const { ev } = carregarSistema();
const om = (expr) => JSON.parse(JSON.stringify(ev(expr)));

test('base: mesmo mês do ano anterior; sem histórico, média dos 3 últimos meses fechados', () => {
  const b = om(`OrcModelo.baseReceita({Shopee:{'2026-07':900,'2026-08':1000,'2026-09':1100,'2026-12':5000}},2027,'2026-09')`);
  assert.equal(b.Shopee['12'], 5000, 'dezembro usa dezembro de 2026');
  assert.equal(b.Shopee['01'], 1000, 'janeiro sem histórico: média de jul–set');
});

const versao = `({premissas:{canais:{Shopee:{crescimento:10,tarifa:20,frete:5,cmv:40,prazo:15}},devolucoes:2,impostos:10,ir:2,encargos:50,prazoFornecedor:30,saldoInicial:1000,aReceber:0},
  base:{Shopee:Object.fromEntries(OrcModelo.MM.map(m=>[m,1000]))},receitas:{Shopee:{'12':3000}},
  despesas:{Aluguel:{grupo:'Despesas administrativas',meses:Object.fromEntries(OrcModelo.MM.map(m=>[m,100]))},'Salários':{grupo:'Pessoal',meses:Object.fromEntries(OrcModelo.MM.map(m=>[m,999]))}},
  pessoal:{pessoas:[{nome:'Ana',salario:200,inicio:'01'},{nome:'Novo',salario:100,inicio:'07'}],reajuste:{mes:'05',pct:10}},
  invest:[{nome:'Empilhadeira',valor:1200,mes:'03',parcelas:3,vida:12}]})`;

test('DRE orçada: canal com tarifa, frete e CMV; pessoal substitui a categoria Pessoal; depreciação do investimento', () => {
  const c = om(`OrcModelo.calcular(${versao})`);
  const jan = c.dre['01'];
  assert.equal(jan.receita, 1100, 'base 1000 + 10%');
  assert.equal(jan.devolucoes, -22);
  assert.equal(jan.impostos, -110);
  assert.equal(jan.cmv, -440);
  assert.equal(jan.comerciais, -275, 'tarifa 20% + frete 5%');
  assert.equal(jan.administrativas, -100);
  assert.equal(jan.trabalhistas, -300, 'Ana 200 × 1,5; a categoria Salários (999) não conta quando há pessoal');
  assert.equal(c.dre['05'].trabalhistas, -330, 'reajuste de 10% a partir de maio');
  assert.equal(c.dre['07'].trabalhistas, -480, 'contratação em julho: (220 + 100) × 1,5');
  assert.equal(c.dre['03'].depreciacao, -100, '1200 em 12 meses');
  assert.equal(c.dre['02'].depreciacao, 0, 'antes da compra');
  assert.equal(c.dre['12'].receita, 3000, 'valor digitado no mês vale sobre a premissa');
  assert.equal(jan['=ll'], 1100 - 22 - 110 - 440 - 275 - 100 - 300 - 22);
  assert.ok(c.ind.equilibrio > 0);
});

test('caixa: repasse com prazo (15 dias = metade no mês seguinte), compras no mês seguinte, investimento em parcelas', () => {
  const k = om(`OrcModelo.caixa(${versao})`);
  // Janeiro: entra metade da venda líquida de tarifa/frete/devolução: (1100 − 275) × 0,98 × 0,5.
  assert.equal(k.meses[0].entradas, Math.round((1100 - 275) * 0.98 * 0.5 * 100) / 100);
  // Janeiro sai só o que é do mês: administrativas 100 + pessoal 300 (CMV, tributos e IR ficam para fevereiro).
  assert.equal(k.meses[0].saidas, 400);
  assert.equal(k.meses[2].saidas > k.meses[1].saidas, true, 'março tem a 1ª parcela do investimento');
});

test('forecast: meses fechados pelo realizado e o resto pelo orçado ajustado ao ritmo de vendas', () => {
  const f = om(`(()=>{const c=OrcModelo.calcular(${versao});const real={'2027-01':{receita:880,cmv:-352},'2027-02':{receita:880,cmv:-352}};return OrcModelo.forecast(c,real,2027,'2027-03',0)})()`);
  assert.equal(f.fechados, 2);
  assert.equal(f.ritmo, 0.8, '1760 vendidos de 2200 orçados');
  assert.equal(f.dre['01'].receita, 880);
  assert.equal(f.dre['04'].receita, 880, 'orçado 1100 × 0,8');
  assert.equal(f.dre['04'].administrativas, -100, 'despesa fixa não acompanha a venda');
});

test('versão nova: movimento entre contas, aplicação e tributo sobre venda não viram despesa', () => {
  const ig = om(`['Aplicação / resgate','Transferência entre contas','ICMS DIFAL / GNRE','PIS e COFINS','Impostos e taxas','Aluguel'].map(c=>OrcModelo.ignorarCategoria(c,c==='Aluguel'?'Despesas administrativas':c.includes('Aplica')||c.includes('Transfer')?'Financeiro':'Impostos'))`);
  assert.deepEqual(ig, [true, true, true, true, false, false]);
  const v = om(`OrcModelo.gerarVersao({ano:2027,ultimoFechado:'2026-09',vendas:{},hist:{},grupos:{'Aplicação / resgate':'Financeiro',Aluguel:'Despesas administrativas'},despesas:{'Aplicação / resgate':{'2026-09':900000},Aluguel:{'2026-07':1000,'2026-08':1000,'2026-09':1000}}})`);
  assert.deepEqual(Object.keys(v.despesas), ['Aluguel']);
  assert.equal(v.despesas.Aluguel.meses['01'], 1045, 'média 1000 + inflação de 4,5%');
});

test('base: mês do ano anterior muito abaixo da média recente é começo de operação (usa a média)', () => {
  const b = om(`OrcModelo.baseReceita({Shopee:{'2026-05':50,'2026-07':1000,'2026-08':1000,'2026-09':1000}},2027,'2026-09')`);
  assert.equal(b.Shopee['05'], 1000);
});
