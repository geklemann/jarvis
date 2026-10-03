'use strict';
// Modelo do orçamento (só cálculo, sem tela), usado pelas telas de Orçamento (web/orcamento.js) e pelos testes.
// Uma versão (Orçamento 2027 V1, V2, Forecast…) guarda premissas e o que a equipe preencheu; daqui saem, mês a mês:
// receita por canal (base histórica com sazonalidade × crescimento), deduções, CMV e tarifa/frete de cada canal,
// despesas por categoria (pelo grupo da categoria vão para a linha da DRE), pessoal (salário × encargos, reajuste,
// contratações e saídas), investimentos (desembolso e depreciação), a DRE orçada, o caixa projetado (método direto,
// com prazo de repasse dos canais e de pagamento aos fornecedores) e o forecast (realizado + orçado ajustado pelo ritmo).
(()=>{
const r2=v=>Math.round((Number(v)||0)*100)/100,n=v=>Number(v)||0;
const MM=['01','02','03','04','05','06','07','08','09','10','11','12'];
const somaMes=(m,k)=>{const [a,b]=m.split('-').map(Number),d=new Date(a,b-1+k,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
// Grupo da categoria (Cadastros › Categorias) → linha da DRE. Investimentos não passam pela DRE (viram depreciação).
const LINHA_GRUPO={'Custo das mercadorias':'cmv','Despesas comerciais':'comerciais','Despesas administrativas':'administrativas','Pessoal':'trabalhistas',
 'Impostos':'outras','Financeiro':'desp_fin','Outras despesas':'outras','Outras receitas':'outras','Receitas operacionais':'outras','Investimentos':null};
const linhaDe=grupo=>grupo in LINHA_GRUPO?LINHA_GRUPO[grupo]:'administrativas';
// Mesma estrutura da DRE gerencial (web/gestao.js): o orçado compara linha a linha com o realizado.
const DRE=[['receita','Receita bruta com vendas','linha'],['devolucoes','(−) Devoluções e descontos','linha'],['impostos','(−) Tributos sobre vendas','linha'],
 ['=rl','Receita líquida','total',['receita','devolucoes','impostos']],['cmv','(−) Custo das mercadorias vendidas','linha'],['=mb','Margem bruta','total',['=rl','cmv']],
 ['comerciais','(−) Despesas comerciais (tarifas, frete, marketing)','linha'],['trabalhistas','(−) Pessoal','linha'],['administrativas','(−) Despesas administrativas','linha'],
 ['outras','(±) Outras receitas e despesas','linha'],['=ebitda','EBITDA','total',['=mb','comerciais','trabalhistas','administrativas','outras']],
 ['depreciacao','(−) Depreciações','linha'],['=ebit','EBIT','total',['=ebitda','depreciacao']],['rec_fin','(+) Receitas financeiras','linha'],['desp_fin','(−) Despesas financeiras','linha'],
 ['=lair','Lucro antes do IRPJ/CSLL','total',['=ebit','rec_fin','desp_fin']],['ir','(−) IRPJ e CSLL','linha'],['=ll','Lucro líquido','total',['=lair','ir']]];
const LINHAS=DRE.filter(x=>x[2]==='linha').map(x=>x[0]);
const vazio=()=>Object.fromEntries(DRE.map(([k])=>[k,0]));
function totais(v){for(const [k,,t,p] of DRE)if(t==='total')v[k]=p.reduce((a,x)=>a+n(v[x]),0);for(const k in v)v[k]=r2(v[k]);return v}

// Base de receita por canal e mês do ano: o mesmo mês do ano anterior (sazonalidade); sem histórico daquele mês, a média
// dos 3 últimos meses fechados. Mês do ano anterior abaixo de 40% da média recente é começo de operação (usa a média).
// vendas: {canal: {'AAAA-MM': venda bruta}}.
function baseReceita(vendas,ano,ultimoFechado){const out={};
 for(const [c,m] of Object.entries(vendas||{})){const ult=[0,1,2].map(k=>n(m[somaMes(ultimoFechado,-k)])).filter(x=>x>0),media=ult.length?ult.reduce((a,x)=>a+x,0)/ult.length:0;
  out[c]=Object.fromEntries(MM.map(mm=>{const ant=n(m[(ano-1)+'-'+mm]);return [mm,r2(ant>=media*0.4&&ant>0?ant:media)]}))}
 return out}

// Premissas iniciais a partir do histórico medido (percentuais em %). hist: {tarifa:{canal:fração}, frete, cmv, impostos,
// devolucoes (frações sobre a venda), prazo:{canal:dias}, saldo, aReceber}.
function premissasPadrao(hist,canais){const h=hist||{};
 return {canais:Object.fromEntries(canais.map(c=>[c,{crescimento:10,tarifa:r2(n(h.tarifa?.[c])*100),frete:r2(n(h.frete)*100),cmv:r2(n(h.cmv)*100),prazo:n(h.prazo?.[c])||12}])),
  devolucoes:r2(n(h.devolucoes)*100),impostos:r2(n(h.impostos)*100),ir:2.28,inflacao:4.5,encargos:68,prazoFornecedor:30,saldoInicial:r2(h.saldo),aReceber:r2(h.aReceber),caixaMinimo:0}}

// Categoria que não é despesa do orçamento: movimento entre contas, aplicação e resgate, empréstimo, investimento e os
// tributos sobre a venda (ICMS, DIFAL/GNRE, PIS/COFINS, Simples), que já entram pela premissa de tributos.
function ignorarCategoria(cat,grupo){const c=String(cat||'');
 return grupo==='Investimentos'||/aplica[cç][aã]o|resgate|transfer[eê]ncia|empr[eé]stimo|financiamento|entre contas/i.test(c)||
  (grupo==='Impostos'&&/icms|difal|gnre|pis|cofins|simples nacional|\bdas\b|\biss\b/i.test(c))}
// Versão nova: base histórica, premissas e despesas pela média dos 3 últimos meses fechados corrigida pela inflação.
// despesas: {categoria: {'AAAA-MM': valor}}; grupos: {categoria: grupo}.
function gerarVersao({ano,hist,vendas,despesas,grupos,ultimoFechado,pessoas}){const base=baseReceita(vendas,ano,ultimoFechado),pr=premissasPadrao(hist,Object.keys(base)),desp={};
 for(const [cat,m] of Object.entries(despesas||{})){const grupo=grupos?.[cat]||'Despesas administrativas';if(ignorarCategoria(cat,grupo)||linhaDe(grupo)==='cmv')continue;
  const ult=[0,1,2].map(k=>n(m[somaMes(ultimoFechado,-k)])),media=ult.reduce((a,x)=>a+x,0)/3*(1+pr.inflacao/100);if(media<=0)continue;
  desp[cat]={grupo,resp:null,status:'pendente',meses:Object.fromEntries(MM.map(mm=>[mm,Math.round(media)]))}}
 return {premissas:pr,base,receitas:{},despesas:desp,pessoal:{pessoas:pessoas||[],reajuste:{mes:'05',pct:5}},invest:[],comentarios:{},historico:[]}}

const receitaCanal=(d,c,mm)=>{const o=d.receitas?.[c]?.[mm];if(o!=null&&o!=='')return n(o);const p=d.premissas?.canais?.[c]||{};return r2(n(d.base?.[c]?.[mm])*(1+n(p.crescimento)/100))};
const canaisDe=d=>[...new Set([...Object.keys(d.base||{}),...Object.keys(d.receitas||{})])];
// Pessoal do mês: salário (com o reajuste a partir do mês escolhido) × (1 + encargos); vale para quem está no período.
function pessoalMes(d,mm){const pr=d.premissas||{},rj=d.pessoal?.reajuste||{};let t=0;
 for(const p of d.pessoal?.pessoas||[]){if((p.inicio||'01')>mm||(p.fim&&p.fim<mm))continue;const sal=n(p.salario)*(rj.mes&&mm>=rj.mes&&(p.inicio||'01')<rj.mes?1+n(rj.pct)/100:1);/* quem entra depois do reajuste já vem com o salário novo */t+=sal*(1+n(p.encargos??pr.encargos)/100)}
 return r2(t)}
// Investimento: desembolso em parcelas a partir do mês e depreciação linear pela vida útil (meses).
function investMes(d,mm){let caixa=0,depr=0;
 for(const i of d.invest||[]){const ini=i.mes||'01',k=MM.indexOf(mm)-MM.indexOf(ini);if(k<0)continue;const parc=Math.max(1,n(i.parcelas)||1),vida=Math.max(1,n(i.vida)||60);
  if(k<parc)caixa+=n(i.valor)/parc;if(k<vida)depr+=n(i.valor)/vida}
 return {caixa:r2(caixa),depr:r2(depr)}}

// DRE orçada mês a mês e no ano, com o detalhe por canal (venda, tarifa+frete, CMV) e a margem de contribuição.
function calcular(d){const pr=d.premissas||{},canais=canaisDe(d),usaPessoal=(d.pessoal?.pessoas||[]).length>0,dre={},canal={},mc={},fixas={};
 for(const mm of MM){const v=vazio();let variaveis=0,cmvVar=0;
  for(const c of canais){const p=pr.canais?.[c]||{},rec=receitaCanal(d,c,mm),tf=rec*(n(p.tarifa)+n(p.frete))/100,cm=rec*n(p.cmv)/100;
   v.receita+=rec;variaveis+=tf;cmvVar+=cm;(canal[c]=canal[c]||{})[mm]={venda:r2(rec),tarifaFrete:r2(tf),cmv:r2(cm),mc:r2(rec*(1-n(pr.devolucoes)/100-n(pr.impostos)/100)-tf-cm)}}
  v.devolucoes=-v.receita*n(pr.devolucoes)/100;v.impostos=-v.receita*n(pr.impostos)/100;v.cmv=-cmvVar;v.comerciais=-variaveis;v.ir=-v.receita*n(pr.ir)/100;
  let fx=0;for(const [cat,x] of Object.entries(d.despesas||{})){const l=linhaDe(x.grupo);if(!l)continue;if(l==='trabalhistas'&&usaPessoal)continue;const val=n(x.meses?.[mm]);v[l]-=val;fx+=val}
  if(usaPessoal){const pm=pessoalMes(d,mm);v.trabalhistas-=pm;fx+=pm}
  v.depreciacao=-investMes(d,mm).depr;totais(v);dre[mm]=v;
  mc[mm]=r2(v['=rl']-cmvVar-variaveis);fixas[mm]=r2(fx)}
 const ano=totais(Object.fromEntries(DRE.map(([k])=>[k,MM.reduce((a,mm)=>a+n(dre[mm][k]),0)])));
 const mcAno=MM.reduce((a,mm)=>a+mc[mm],0),fxAno=MM.reduce((a,mm)=>a+fixas[mm],0);
 return {dre,ano,canal,mc,fixas,ind:{receita:ano.receita,mcPct:ano.receita?mcAno/ano.receita:0,ebitdaPct:ano.receita?ano['=ebitda']/ano.receita:0,llPct:ano.receita?ano['=ll']/ano.receita:0,
  equilibrio:mcAno>0&&ano.receita?r2(fxAno/(mcAno/ano.receita)):null}}}

// Caixa projetado (método direto). Entradas: venda menos tarifa, frete e devoluções, recebida com o prazo de repasse de
// cada canal (o que passa de 30 dias cai no mês seguinte) + o que já está a receber no 1º mês. Saídas: CMV (compras pagas
// no prazo do fornecedor), tributos e IR no mês seguinte, despesas e pessoal no mês, parcelas dos investimentos.
function caixa(d,calc){const pr=d.premissas||{},c=calc||calcular(d),ent=Object.fromEntries(MM.map(m=>[m,0])),sai=Object.fromEntries(MM.map(m=>[m,0]));
 const mover=(obj,mm,v,frac)=>{const i=MM.indexOf(mm);obj[mm]+=v*(1-frac);if(i<11)obj[MM[i+1]]+=v*frac};
 ent['01']+=n(pr.aReceber);
 for(const mm of MM){const v=c.dre[mm];
  for(const [cn,x] of Object.entries(c.canal)){const p=pr.canais?.[cn]||{},liq=(x[mm].venda-x[mm].tarifaFrete)*(1-n(pr.devolucoes)/100);mover(ent,mm,liq,Math.min(1,n(p.prazo)/30))}
  mover(sai,mm,-v.cmv,Math.min(1,n(pr.prazoFornecedor)/30));mover(sai,mm,-(v.impostos+v.ir),1);
  const variaveis=MM.includes(mm)?Object.values(c.canal).reduce((a,x)=>a+x[mm].tarifaFrete,0):0;
  sai[mm]+=-(v.comerciais+v.trabalhistas+v.administrativas+v.outras+v.desp_fin)-variaveis+investMes(d,mm).caixa-n(v.rec_fin)}
 let saldo=n(pr.saldoInicial),min=Infinity,mesMin='01';const meses=MM.map(mm=>{saldo+=ent[mm]-sai[mm];if(saldo<min){min=saldo;mesMin=mm}return {mm,entradas:r2(ent[mm]),saidas:r2(sai[mm]),saldo:r2(saldo)}});
 return {meses,min:r2(min),mesMin,abaixo:meses.filter(x=>x.saldo<n(pr.caixaMinimo)).map(x=>x.mm)}}

// Forecast do ano: meses fechados = realizado; mês corrente = realizado + o que falta do orçado (pela fração do mês);
// meses seguintes = orçado, com as linhas que acompanham a venda ajustadas pelo ritmo de vendas do ano (realizado ÷ orçado).
const SEGUEM_VENDA=['receita','devolucoes','impostos','cmv','comerciais','ir'];
function forecast(calc,real,ano,mesAtual,frac){const dre={},fech=MM.filter(mm=>ano+'-'+mm<mesAtual);
 const ro=fech.reduce((a,mm)=>a+n(calc.dre[mm].receita),0),rr=fech.reduce((a,mm)=>a+n(real[ano+'-'+mm]?.receita),0),ritmo=ro>0&&rr>0?rr/ro:1;
 for(const mm of MM){const k=ano+'-'+mm,o=calc.dre[mm],r=real[k],v=vazio();
  for(const l of LINHAS){if(k<mesAtual)v[l]=n(r?.[l]);else if(k===mesAtual)v[l]=n(r?.[l])+n(o[l])*(1-n(frac))*(SEGUEM_VENDA.includes(l)?ritmo:1);else v[l]=n(o[l])*(SEGUEM_VENDA.includes(l)?ritmo:1)}
  dre[mm]=totais(v)}
 const tot=totais(Object.fromEntries(DRE.map(([k])=>[k,MM.reduce((a,mm)=>a+n(dre[mm][k]),0)])));
 return {dre,ano:tot,ritmo:r2(ritmo*10000)/10000,fechados:fech.length}}

window.OrcModelo={ignorarCategoria,MM,DRE,LINHAS,LINHA_GRUPO,linhaDe,somaMes,baseReceita,premissasPadrao,gerarVersao,receitaCanal,canaisDe,pessoalMes,investMes,calcular,caixa,forecast,totais};
})();
