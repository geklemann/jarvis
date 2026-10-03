'use strict';
// Orçamento (menu próprio). Versões (Orçamento 2027 V1, V2, Forecast, cenários) na tabela orcamentos; cálculo em
// web/orcmodelo.js. Telas: Visão do orçamento · Premissas e cenários · Receitas por canal · Despesas (com responsável por
// categoria, que preenche a sua parte pela função orc_preencher) · Pessoal · Investimentos · DRE orçada · Caixa projetado ·
// Orçado × realizado (mês do cabeçalho, acumulado e forecast, com justificativa de cada desvio). Fluxo: rascunho → em
// revisão → aprovado (só o dono; a versão aprovada fica travada e passa a ser a oficial do ano) → arquivado.
(()=>{
Object.assign(paths,{target:'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 11a1 1 0 1 0 1 1 M15 9l6-6 M17 3h4v4'});
const M=()=>window.OrcModelo;
const ler=k=>{try{return localStorage.getItem(k)}catch{return null}},gravarLS=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
const st={lista:null,carregando:false,erro:'',vid:ler('eb_orc_v')||'',dre:'orcado',soMinhas:false};
window.Reiniciar?.registrar(st,['dre','soMinhas']); // estado de tela: volta ao original ao clicar no menu
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const r2=v=>Math.round((Number(v)||0)*100)/100,n=v=>Number(v)||0;
const pct=v=>v==null||!isFinite(v)?'—':(v*100).toFixed(1).replace('.',',')+'%';
const num=s=>{const t=String(s??'').trim();if(!t)return null;const v=Number(t.replace(/\s|R\$/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));return isFinite(v)?v:null};
const grande=v=>Math.abs(Number(v)||0)>=1e6?(v<0?'−':'')+'R$ '+(Math.abs(v)/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi':money(v);
const fmt=v=>v?Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2}):'';
const papel=()=>window.Cloud?.role||'owner',dono=()=>papel()==='owner',meuEmail=()=>String(window.Cloud?.session?.user?.email||'').toLowerCase();
const editor=()=>['owner','member','financeiro','contador'].includes(papel());
const aberta=v=>v&&['rascunho','em_revisao'].includes(v.status),podeEditar=v=>aberta(v)&&editor();
const STATUS={rascunho:['','Rascunho'],em_revisao:['warn','Em revisão'],aprovado:['ok','Aprovado'],arquivado:['','Arquivado']};
const TIPO={orcamento:'Orçamento',forecast:'Forecast',cenario:'Cenário'};
const anoPadrao=()=>{const d=new Date();return d.getMonth()>=9?d.getFullYear()+1:d.getFullYear()};

// ─────────── Dados ───────────
async function carregar(){if(st.carregando||!window.Cloud?.ws)return;st.carregando=true;
 try{const {data,error}=await Cloud.client.from('orcamentos').select('*').eq('workspace_id',Cloud.ws).order('ano',{ascending:false}).order('created_at',{ascending:false});if(error)throw error;st.lista=data||[];st.erro=''}
 catch(x){st.erro=x.message||String(x);st.lista=st.lista||[]}finally{st.carregando=false;if(String(page).startsWith('orc'))render()}}
const atual=()=>{const l=st.lista||[];return l.find(v=>v.id===st.vid)||l.find(v=>v.status==='aprovado'&&v.tipo==='orcamento')||l.find(v=>v.status!=='arquivado')||l[0]||null};
let tSalvar=null;
function mexer(v,fn){if(!podeEditar(v)){toast(v?.status==='aprovado'?'Versão aprovada: reabra para alterar.':'Seu perfil não altera o orçamento.');return false}fn(v.dados);clearTimeout(tSalvar);tSalvar=setTimeout(()=>salvar(v),500);return true}
async function salvar(v){const agora=new Date().toISOString();const {error}=await Cloud.client.from('orcamentos').update({dados:v.dados,updated_at:agora}).eq('workspace_id',Cloud.ws).eq('id',v.id);if(error)toast(error.message);else v.updated_at=agora}
function hist(v,acao){v.dados.historico=[...(v.dados.historico||[]),{em:new Date().toISOString(),quem:meuEmail(),acao}].slice(-60)}
async function setStatus(v,status,txt){const u={status,updated_at:new Date().toISOString()};if(status==='aprovado'){u.aprovado_por=meuEmail();u.aprovado_em=u.updated_at}
 hist(v,txt);u.dados=v.dados;const {error}=await Cloud.client.from('orcamentos').update(u).eq('workspace_id',Cloud.ws).eq('id',v.id);if(error)return toast(error.message);
 if(status==='aprovado')for(const o of (st.lista||[]).filter(o=>o.id!==v.id&&o.ano===v.ano&&o.tipo==='orcamento'&&o.status==='aprovado')){await Cloud.client.from('orcamentos').update({status:'arquivado'}).eq('workspace_id',Cloud.ws).eq('id',o.id);o.status='arquivado'}
 Object.assign(v,u);audit('Orçamento: '+txt,`${v.nome} (${v.ano})`);toast(txt+'.');render()}

// Histórico para gerar uma versão: vendas por canal e mês, taxas medidas, despesas por categoria, saldo e a receber.
const mesAnt=(m,k=1)=>M().somaMes(m,-k);
function realCat(m){const r={},add=(c,v)=>{c=c||'Sem categoria';r[c]=(r[c]||0)+v};
 for(const p of db.payables||[]){if(p.status==='cancelado')continue;if(String(p.vencimento).startsWith(m))add(p.categoria,Number(p.valor)||0)}
 for(const t of db.bankTx||[]){if(t.valor>=0||t.status==='ignorado'||t.origem==='espelho'||!String(t.data).startsWith(m))continue;const c=t.vinculo?.categoria||t.categoria;if(!c||/a classificar/i.test(c))continue;add(c,-t.valor)}
 return r}
const grupos=()=>Object.fromEntries((db.cadastros||[]).filter(c=>c.tipo==='cat'&&c.dados?.nome).map(c=>[c.dados.nome,c.dados.grupo||'Despesas administrativas']));
function entradas(ano){const hoje=new Date().toLocaleDateString('sv-SE').slice(0,7),ult=mesAnt(hoje),vendas={},taxa={};
 for(const o of db.orders||[]){const m=String(o.date||'').slice(0,7),c=o.platform;if(!c||!m)continue;(vendas[c]=vendas[c]||{})[m]=(vendas[c][m]||0)+(Number(o.gross)||0);
  if(m>=mesAnt(ult,2)&&m<=ult){const t=taxa[c]||(taxa[c]={v:0,f:0});t.v+=Number(o.gross)||0;t.f+=Number(o.fee)||0}}
 const tend=(()=>{try{return window.Margem?.tendencia?.([mesAnt(ult,2),mesAnt(ult),ult])||[]}catch{return []}})(),pv=tend.reduce((a,x)=>a+n(x.venda),0),med=k=>pv?tend.reduce((a,x)=>a+n(x[k])*n(x.venda),0)/pv:0;
 const despesas={};for(let k=0;k<3;k++){const m=mesAnt(ult,k);for(const [c,v] of Object.entries(realCat(m)))(despesas[c]=despesas[c]||{})[m]=v}
 const saldo=(db.bankAccounts||[]).filter(a=>a.tipo!=='aplicacao'&&a.ativo!==false).reduce((a,c)=>a+n(window.Tesouraria?.saldoConta?.(c)??c.saldoExtrato),0);
 let aReceber=0;try{for(const o of db.orders||[])if(['A receber','Em trânsito'].includes(status(o)))aReceber+=Math.max(0,net(o)-paid(o))}catch{}
 return {ano,ultimoFechado:ult,vendas,despesas,grupos:grupos(),hist:{tarifa:Object.fromEntries(Object.entries(taxa).map(([c,t])=>[c,t.v?t.f/t.v:0])),frete:med('frete'),cmv:med('custo'),impostos:med('tributos'),devolucoes:0.015,saldo,aReceber,prazo:{Shopee:10,'Mercado Livre':12}}}}

// Realizado do mês: DRE (contabilidade do mês; sem ela, a DRE estimada pela operação) e vendas por canal.
const memo=new Map();
function realDRE(m){const k=m+'|'+(db.orders||[]).length+'|'+(db.accLines||[]).length;if(memo.has(k))return memo.get(k);let v={};
 try{const c=window.Gestao?.dreMes?.(m);v=c?.fonte?c.v:(window.Gestao?.dreOperacao?.(m)?.v||{})}catch{v={}}
 const hoje=new Date().toLocaleDateString('sv-SE').slice(0,7);if(m>hoje)v={};memo.set(k,v);return v}
const realCanal=m=>{const r={};for(const o of db.orders||[])if(String(o.date||'').startsWith(m))r[o.platform]=(r[o.platform]||0)+(Number(o.gross)||0);return r};
const fracMes=m=>{const h=new Date(),k=h.toLocaleDateString('sv-SE').slice(0,7);if(m<k)return 1;if(m>k)return 0;return (h.getDate()-0.5)/new Date(h.getFullYear(),h.getMonth()+1,0).getDate()};
function forecastDe(v,calc){const real={};for(const mm of M().MM){const k=v.ano+'-'+mm;real[k]=realDRE(k)}const hoje=new Date().toLocaleDateString('sv-SE').slice(0,7);return M().forecast(calc,real,v.ano,hoje,fracMes(hoje))}

// ─────────── Partes comuns ───────────
function barra(v){const l=st.lista||[];if(!l.length)return '';const [tom,t]=STATUS[v.status]||['',v.status];
 return `<div class="crmbar orcbarra"><select data-orc-v aria-label="Versão do orçamento">${l.map(x=>`<option value="${esc(x.id)}" ${x.id===v.id?'selected':''}>${esc(x.nome)} · ${x.ano}${x.status==='aprovado'?' ✓':''}${x.status==='arquivado'?' (arquivada)':''}</option>`).join('')}</select>
  <span class="badge ${tom}">${t}</span><span class="caption">${TIPO[v.tipo]||v.tipo}${v.aprovado_em&&v.status==='aprovado'?` · aprovado em ${new Date(v.aprovado_em).toLocaleDateString('pt-BR')}`:''}</span><span style="flex:1"></span>
  ${editor()?`<button class="small" data-orc="nova">${icon('plus')} Nova versão</button><button class="small quiet" data-orc="duplicar">Duplicar</button>`:''}
  ${podeEditar(v)&&v.status==='rascunho'?'<button class="small" data-orc="enviar">Enviar para aprovação</button>':''}
  ${dono()&&aberta(v)?'<button class="small primary" data-orc="aprovar">Aprovar</button>':''}
  ${dono()&&v.status==='aprovado'?'<button class="small quiet" data-orc="reabrir">Reabrir</button>':''}
  ${dono()&&v.status!=='arquivado'&&v.status!=='aprovado'?'<button class="small quiet" data-orc="arquivar">Arquivar</button>':''}</div>
  ${v.status==='aprovado'?'<div class="notice">Versão aprovada: é a oficial do ano e está travada. Para mudar, duplique (Forecast ou nova versão) ou peça ao dono para reabrir.</div>':''}`}
function semVersao(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para usar o orçamento.</div>';if(st.lista==null){carregar();return '<div class="empty">Carregando o orçamento…</div>'}
 const a=anoPadrao();return `${st.erro?`<div class="notice warnbox">${esc(st.erro)}</div>`:''}<div class="card" style="max-width:760px"><h2>Comece o orçamento de ${a}</h2><p>O Jarvis monta a primeira versão sozinho a partir do histórico: vendas de cada canal com a sazonalidade, tarifa, frete e custo medidos, e as despesas pela média dos últimos meses corrigida pela inflação. Depois você ajusta as premissas, distribui as categorias para os responsáveis e aprova.</p>
  ${editor()?`<div class="row" style="gap:8px;margin-top:12px"><button class="primary" data-orc="criar" data-ano="${a}">${icon('target')} Criar o orçamento de ${a}</button><button data-orc="nova">Outra opção…</button></div>`:'<p class="caption">Peça a alguém do financeiro para criar a primeira versão.</p>'}</div>`}
const tabelaMeses=(cab,linhas,rod='')=>`<div class="tablewrap"><table class="orcgrade"><thead><tr><th>${cab}</th>${MES.map(m=>`<th class="num">${m}</th>`).join('')}<th class="num">Ano</th></tr></thead><tbody>${linhas}</tbody>${rod}</table></div>`;
function comVersao(fn){return ()=>{if(st.lista==null||!(st.lista||[]).length)return semVersao();const v=atual();if(st.vid!==v.id){st.vid=v.id;gravarLS('eb_orc_v',v.id)}return barra(v)+fn(v)}}
function grafico(series,alt=180){const W=900,H=alt,pl=56,pb=22,max=Math.max(1,...series.flatMap(s=>s.v.map(Math.abs))),bw=(W-pl-10)/12;
 const y=v=>H-pb-(v/max)*(H-pb-10),ticks=[0,.5,1].map(f=>f*max);
 return `<svg viewBox="0 0 ${W} ${H}" class="orcgraf" role="img" aria-label="Gráfico mensal">${ticks.map(t=>`<line x1="${pl}" x2="${W-6}" y1="${y(t)}" y2="${y(t)}" class="orcgrid"/><text x="${pl-6}" y="${y(t)+4}" text-anchor="end" class="orclbl">${(t/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})} mil</text>`).join('')}
  ${series.map((s,i)=>s.tipo==='linha'?`<polyline fill="none" class="${s.cls}" points="${s.v.map((v,k)=>`${pl+bw*k+bw/2},${y(v)}`).join(' ')}"/>`:s.v.map((v,k)=>`<rect x="${pl+bw*k+4+i*((bw-8)/series.filter(x=>x.tipo!=='linha').length)}" y="${y(Math.max(0,v))}" width="${(bw-8)/series.filter(x=>x.tipo!=='linha').length-2}" height="${Math.max(0,H-pb-y(Math.max(0,v)))}" class="${s.cls}" rx="2"/>`).join('')).join('')}
  ${MES.map((m,k)=>`<text x="${pl+bw*k+bw/2}" y="${H-6}" text-anchor="middle" class="orclbl">${m}</text>`).join('')}</svg>`}

// ─────────── Visão do orçamento ───────────
const visao=comVersao(v=>{const c=M().calcular(v.dados),cx=M().caixa(v.dados,c),f=forecastDe(v,c),hoje=new Date().toLocaleDateString('sv-SE').slice(0,7),fech=M().MM.filter(mm=>v.ano+'-'+mm<hoje);
 const ytd=k=>({o:fech.reduce((a,mm)=>a+n(c.dre[mm][k]),0),r:fech.reduce((a,mm)=>a+n(realDRE(v.ano+'-'+mm)[k]),0)});
 const cats=Object.entries(v.dados.despesas||{}),pre=cats.filter(([,x])=>x.status==='preenchido').length,porResp={};for(const [cat,x] of cats)if(x.resp)(porResp[x.resp]=porResp[x.resp]||[]).push([cat,x]);
 const linha=(k,t)=>{const y=ytd(k);return `<tr><td>${t}</td><td class="num">${money(c.ano[k])}</td><td class="num">${fech.length?money(y.r):'—'}</td><td class="num">${fech.length?money(y.o):'—'}</td><td class="num ${y.r-y.o<0?'red':'green'}">${fech.length&&y.o?pct((y.r-y.o)/Math.abs(y.o)):'—'}</td><td class="num"><strong>${money(f.ano[k])}</strong></td><td class="num ${f.ano[k]-c.ano[k]<0?'red':'green'}">${c.ano[k]?pct((f.ano[k]-c.ano[k])/Math.abs(c.ano[k])):'—'}</td></tr>`};
 return `<div class="grid kpis4"><div class="card kpi"><span class="kpil">Receita orçada ${v.ano}</span><span class="kpiv">${grande(c.ano.receita)}</span><span class="kpis">forecast ${grande(f.ano.receita)}${f.fechados?` · ritmo ${pct(f.ritmo)}`:''}</span></div>
  <div class="card kpi"><span class="kpil">Margem de contribuição</span><span class="kpiv">${pct(c.ind.mcPct)}</span><span class="kpis">EBITDA ${pct(c.ind.ebitdaPct)} · lucro ${pct(c.ind.llPct)}</span></div>
  <div class="card kpi"><span class="kpil">Lucro líquido orçado</span><span class="kpiv ${c.ano['=ll']<0?'red':''}">${grande(c.ano['=ll'])}</span><span class="kpis">ponto de equilíbrio: ${c.ind.equilibrio!=null?grande(c.ind.equilibrio)+' de venda no ano':'—'}</span></div>
  <div class="card kpi"><span class="kpil">Menor caixa previsto</span><span class="kpiv ${cx.min<n(v.dados.premissas?.caixaMinimo)?'red':''}">${grande(cx.min)}</span><span class="kpis">em ${MES[M().MM.indexOf(cx.mesMin)]}/${v.ano}${cx.abaixo.length?` · ${cx.abaixo.length} mês(es) abaixo do mínimo`:''}</span></div></div>
 <div class="grid two" style="align-items:start"><section class="tablebox"><div class="tabletop"><div><h2>Receita mês a mês</h2><p class="caption">Barras: orçado e realizado. Linha: forecast (realizado + o que falta, no ritmo do ano).</p></div></div><div style="padding:8px 12px">${grafico([{cls:'orcb-o',v:M().MM.map(mm=>c.dre[mm].receita)},{cls:'orcb-r',v:M().MM.map(mm=>n(realDRE(v.ano+'-'+mm).receita))},{cls:'orcl-f',tipo:'linha',v:M().MM.map(mm=>f.dre[mm].receita)}])}</div></section>
 <section class="tablebox"><div class="tabletop"><div><h2>Preenchimento</h2><p class="caption">${pre} de ${cats.length} categoria(s) de despesa preenchida(s) pelos responsáveis.</p></div><button class="small" data-nav="orcdespesas">Distribuir categorias</button></div>
  <div class="tablewrap"><table><thead><tr><th>Responsável</th><th class="num">Categorias</th><th class="num">Preenchidas</th></tr></thead><tbody>${Object.entries(porResp).map(([r,l])=>`<tr><td>${esc(r)}</td><td class="num">${l.length}</td><td class="num">${l.filter(([,x])=>x.status==='preenchido').length}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Nenhuma categoria com responsável. Em Despesas, escolha quem preenche cada uma.</td></tr>'}</tbody></table></div></section></div>
 <section class="tablebox"><div class="tabletop"><div><h2>Orçado × realizado × forecast</h2><p class="caption">${fech.length?`Realizado e orçado acumulados até ${MES[fech.length-1]}/${v.ano}.`:`O ano de ${v.ano} ainda não começou: o forecast é igual ao orçado.`}</p></div><button class="small" data-nav="orcdre">DRE completa</button></div>
  <div class="tablewrap"><table><thead><tr><th>Linha</th><th class="num">Orçado no ano</th><th class="num">Realizado acumulado</th><th class="num">Orçado acumulado</th><th class="num">Variação</th><th class="num">Forecast do ano</th><th class="num">Forecast × orçado</th></tr></thead><tbody>
  ${linha('receita','Receita bruta')}${linha('=rl','Receita líquida')}${linha('=mb','Margem bruta')}${linha('=ebitda','EBITDA')}${linha('=ll','Lucro líquido')}</tbody></table></div></section>`});

// ─────────── Premissas e cenários ───────────
const premissas=comVersao(v=>{const p=v.dados.premissas||{},ed=podeEditar(v),inp=(path,val,suf='%')=>ed?`<input class="num orcin" data-orc-p="${esc(path)}" value="${esc(fmt(val))}" inputmode="decimal" placeholder="0">`:`${fmt(val)||'0'}`;
 const canais=M().canaisDe(v.dados),lista=(st.lista||[]).filter(x=>x.status!=='arquivado'),comp=lista.map(x=>{const c=M().calcular(x.dados),k=M().caixa(x.dados,c);return {x,c,k}});
 return `<section class="tablebox"><div class="tabletop"><div><h2>Premissas por canal</h2><p class="caption">Crescimento sobre a base histórica (mesmo mês do ano anterior; sem histórico, a média dos últimos 3 meses). Tarifa, frete e CMV em % da venda; prazo de repasse em dias.</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>Canal</th><th class="num">Crescimento %</th><th class="num">Tarifa %</th><th class="num">Frete %</th><th class="num">CMV %</th><th class="num">Prazo de repasse (dias)</th><th class="num">Receita no ano</th></tr></thead><tbody>
  ${canais.map(cn=>{const q=p.canais?.[cn]||{},tot=M().MM.reduce((a,mm)=>a+M().receitaCanal(v.dados,cn,mm),0);return `<tr><td><strong>${esc(cn)}</strong></td><td class="num">${inp(`canais.${cn}.crescimento`,q.crescimento)}</td><td class="num">${inp(`canais.${cn}.tarifa`,q.tarifa)}</td><td class="num">${inp(`canais.${cn}.frete`,q.frete)}</td><td class="num">${inp(`canais.${cn}.cmv`,q.cmv)}</td><td class="num">${inp(`canais.${cn}.prazo`,q.prazo)}</td><td class="num">${money(tot)}</td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Sem canais no histórico.</td></tr>'}</tbody></table></div></section>
 <section class="tablebox"><div class="tabletop"><h2>Premissas gerais</h2></div><div class="orcprem">
  ${[['devolucoes','Devoluções e descontos (% da venda)'],['impostos','Tributos sobre vendas (% da venda)'],['ir','IRPJ e CSLL (% da venda)'],['inflacao','Inflação das despesas (%)'],['encargos','Encargos e provisões sobre salários (%)'],['prazoFornecedor','Prazo de pagamento a fornecedores (dias)'],['saldoInicial','Saldo de caixa no início (R$)'],['aReceber','A receber dos marketplaces no início (R$)'],['caixaMinimo','Caixa mínimo desejado (R$)']].map(([k,t])=>`<label>${t}${inp(k,p[k])}</label>`).join('')}</div></section>
 <section class="tablebox"><div class="tabletop"><div><h2>Comparar versões e cenários</h2><p class="caption">Cada versão é um cenário: duplique e mude as premissas (ex.: pessimista com crescimento menor e tarifa maior).</p></div></div><div class="tablewrap"><table><thead><tr><th>Versão</th><th>Situação</th><th class="num">Receita</th><th class="num">Margem de contribuição</th><th class="num">EBITDA</th><th class="num">Lucro líquido</th><th class="num">Menor caixa</th></tr></thead><tbody>
  ${comp.map(({x,c,k})=>`<tr class="${x.id===v.id?'sel':''}"><td><strong>${esc(x.nome)}</strong> <span class="caption">${x.ano} · ${TIPO[x.tipo]||x.tipo}</span></td><td><span class="badge ${STATUS[x.status]?.[0]||''}">${STATUS[x.status]?.[1]||x.status}</span></td><td class="num">${money(c.ano.receita)}</td><td class="num">${pct(c.ind.mcPct)}</td><td class="num">${money(c.ano['=ebitda'])}</td><td class="num ${c.ano['=ll']<0?'red':''}">${money(c.ano['=ll'])}</td><td class="num ${k.min<0?'red':''}">${money(k.min)}</td></tr>`).join('')}</tbody></table></div></section>
 ${(v.dados.historico||[]).length?`<section class="tablebox"><div class="tabletop"><h2>Histórico da versão</h2></div><div class="tablewrap"><table><tbody>${[...v.dados.historico].reverse().slice(0,15).map(h=>`<tr><td>${new Date(h.em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</td><td>${esc(h.quem||'')}</td><td>${esc(h.acao)}</td></tr>`).join('')}</tbody></table></div></section>`:''}`});

// ─────────── Receitas por canal ───────────
const receitas=comVersao(v=>{const ed=podeEditar(v),canais=M().canaisDe(v.dados),c=M().calcular(v.dados);
 const lin=canais.map(cn=>{const tot=M().MM.reduce((a,mm)=>a+M().receitaCanal(v.dados,cn,mm),0);
  return `<tr><td><strong>${esc(cn)}</strong><br><span class="caption">base histórica ${money(M().MM.reduce((a,mm)=>a+n(v.dados.base?.[cn]?.[mm]),0))}</span></td>${M().MM.map(mm=>{const o=v.dados.receitas?.[cn]?.[mm],calc=r2(n(v.dados.base?.[cn]?.[mm])*(1+n(v.dados.premissas?.canais?.[cn]?.crescimento)/100));
   return `<td class="num">${ed?`<input class="num orcin ${o!=null&&o!==''?'manual':''}" data-orc-rec="${esc(cn)}|${mm}" value="${o!=null&&o!==''?esc(fmt(o)):''}" placeholder="${esc(fmt(Math.round(calc)))}" inputmode="decimal" title="Vazio = premissa (${money(calc)}). Digite para fixar o valor do mês.">`:money(M().receitaCanal(v.dados,cn,mm))}</td>`}).join('')}<td class="num"><strong>${money(tot)}</strong></td></tr>`}).join('');
 const rod=`<tfoot><tr><td><strong>Total</strong></td>${M().MM.map(mm=>`<td class="num"><strong>${money(c.dre[mm].receita)}</strong></td>`).join('')}<td class="num"><strong>${money(c.ano.receita)}</strong></td></tr><tr><td>Margem de contribuição</td>${M().MM.map(mm=>`<td class="num">${money(c.mc[mm])}</td>`).join('')}<td class="num">${money(M().MM.reduce((a,mm)=>a+c.mc[mm],0))}</td></tr></tfoot>`;
 return `<section class="tablebox"><div class="tabletop"><div><h2>Receita bruta por canal e mês</h2><p class="caption">Cada mês vem da premissa (base histórica × crescimento do canal). Digite um valor para fixar o mês (fica destacado); apague para voltar à premissa.</p></div></div>${tabelaMeses('Canal',lin,rod)}</section>`});

// ─────────── Despesas ───────────
const equipe=()=>[...new Set([...(window.Integrations?.state?.team||[]).map(t=>t.email),...(st.lista||[]).flatMap(x=>Object.values(x.dados?.despesas||{}).map(d=>d.resp)).filter(Boolean)])].filter(Boolean).sort();
const despesas=comVersao(v=>{const ed=podeEditar(v),eu=meuEmail(),todas=Object.entries(v.dados.despesas||{}).sort((a,b)=>String(a[1].grupo).localeCompare(String(b[1].grupo))||a[0].localeCompare(b[0]));
 const minhas=todas.filter(([,x])=>String(x.resp||'').toLowerCase()===eu),lista=st.soMinhas?minhas:todas,eq=equipe(),usaPessoal=(v.dados.pessoal?.pessoas||[]).length>0;
 const lin=lista.map(([cat,x])=>{const pode=ed||(aberta(v)&&String(x.resp||'').toLowerCase()===eu),tot=M().MM.reduce((a,mm)=>a+n(x.meses?.[mm]),0),ign=M().linhaDe(x.grupo)==='trabalhistas'&&usaPessoal;
  return `<tr class="${ign?'orcign':''}"><td><strong>${esc(cat)}</strong><br><span class="caption">${esc(x.grupo||'')}${ign?' · substituída pelo plano de Pessoal':''}</span>
   <div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap">${ed?`<select class="orcresp" data-orc-resp="${esc(cat)}" aria-label="Responsável"><option value="">Sem responsável</option>${eq.map(e=>`<option ${x.resp===e?'selected':''}>${esc(e)}</option>`).join('')}</select>`:x.resp?`<span class="caption">${esc(x.resp)}</span>`:''}
   <span class="badge ${x.status==='preenchido'?'ok':''}">${x.status==='preenchido'?'Preenchida':'Pendente'}</span>${pode?`<button class="small quiet" data-orc="espalhar" data-cat="${esc(cat)}" title="Distribuir um valor anual nos 12 meses">Espalhar</button>`:''}${pode&&x.status!=='preenchido'?`<button class="small quiet" data-orc="preenchido" data-cat="${esc(cat)}">Concluir</button>`:''}</div></td>
   ${M().MM.map(mm=>`<td class="num">${pode?`<input class="num orcin" data-orc-desp="${esc(cat)}|${mm}" value="${esc(fmt(x.meses?.[mm]))}" inputmode="decimal" placeholder="0">`:money(n(x.meses?.[mm]))}</td>`).join('')}<td class="num"><strong>${money(tot)}</strong></td></tr>`}).join('');
 const totMes=mm=>lista.reduce((a,[,x])=>a+n(x.meses?.[mm]),0);
 return `<div class="row" style="gap:8px;margin:0 0 10px;flex-wrap:wrap">${ed?`<button class="small" data-orc="addcat">${icon('plus')} Categoria</button>`:''}<label class="row" style="gap:6px;font-weight:400"><input type="checkbox" class="check" data-orc-minhas ${st.soMinhas?'checked':''}> Só as minhas (${minhas.length})</label><span class="caption">Escolha o <b>responsável</b> de cada categoria: ele preenche os 12 meses e clica em Concluir, mesmo sem acesso ao financeiro.</span></div>
 <section class="tablebox"><div class="tabletop"><div><h2>Despesas por categoria e mês</h2><p class="caption">Ponto de partida: média dos 3 últimos meses corrigida pela inflação. O grupo da categoria define a linha da DRE.</p></div></div>${tabelaMeses('Categoria',lin||'<tr><td colspan="14" class="empty">Nenhuma categoria.</td></tr>',`<tfoot><tr><td><strong>Total</strong></td>${M().MM.map(mm=>`<td class="num"><strong>${money(totMes(mm))}</strong></td>`).join('')}<td class="num"><strong>${money(M().MM.reduce((a,mm)=>a+totMes(mm),0))}</strong></td></tr></tfoot>`)}</section>`});

// ─────────── Pessoal ───────────
const pessoal=comVersao(v=>{const ed=podeEditar(v),pe=v.dados.pessoal||{pessoas:[],reajuste:{}},enc=n(v.dados.premissas?.encargos);
 const cel=(i,k,val,tipo)=>ed?(tipo==='mes'?`<select data-orc-pes="${i}|${k}"><option value="">${k==='fim'?'—':'jan'}</option>${M().MM.map((mm,j)=>`<option value="${mm}" ${val===mm?'selected':''}>${MES[j]}</option>`).join('')}</select>`:`<input class="${tipo==='txt'?'':'num '}orcin" data-orc-pes="${i}|${k}" value="${esc(tipo==='txt'?val||'':fmt(val))}" ${tipo==='txt'?'':'inputmode="decimal"'} placeholder="${k==='encargos'?fmt(enc):''}">`):esc(tipo==='mes'?(val?MES[M().MM.indexOf(val)]:'—'):tipo==='txt'?val||'':fmt(val));
 return `<div class="notice">Com pessoas cadastradas aqui, o custo de pessoal da DRE sai deste plano (salário × (1 + encargos), com reajuste e entradas e saídas) e as categorias do grupo <b>Pessoal</b> deixam de contar, para não somar duas vezes.</div>
 <section class="tablebox"><div class="tabletop"><div><h2>Quadro de pessoas</h2><p class="caption">Encargos padrão: ${fmt(enc)}% (premissas). Use o campo da pessoa para PJ, estágio ou exceções.</p></div>${ed?`<button class="small" data-orc="addpes">${icon('plus')} Pessoa ou vaga</button>`:''}</div>
  <div class="tablewrap"><table><thead><tr><th>Nome ou vaga</th><th>Cargo</th><th class="num">Salário (R$)</th><th class="num">Encargos %</th><th>Entra em</th><th>Sai em</th><th class="num">Custo no ano</th><th></th></tr></thead><tbody>
  ${(pe.pessoas||[]).map((p,i)=>{const tot=M().MM.reduce((a,mm)=>a+M().pessoalMes({...v.dados,pessoal:{...pe,pessoas:[p]}},mm),0);return `<tr><td>${cel(i,'nome',p.nome,'txt')}</td><td>${cel(i,'cargo',p.cargo,'txt')}</td><td class="num">${cel(i,'salario',p.salario)}</td><td class="num">${cel(i,'encargos',p.encargos)}</td><td>${cel(i,'inicio',p.inicio,'mes')}</td><td>${cel(i,'fim',p.fim,'mes')}</td><td class="num">${money(tot)}</td><td>${ed?`<button class="small quiet" data-orc="delpes" data-i="${i}" aria-label="Remover">✕</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">Nenhuma pessoa no plano: o pessoal da DRE vem das categorias do grupo Pessoal.</td></tr>'}</tbody></table></div>
  <div class="row" style="gap:10px;padding:10px 14px;flex-wrap:wrap;align-items:center"><span>Reajuste coletivo:</span>${ed?`<select data-orc-reaj="mes"><option value="">sem reajuste</option>${M().MM.map((mm,j)=>`<option value="${mm}" ${pe.reajuste?.mes===mm?'selected':''}>a partir de ${MES[j]}</option>`).join('')}</select><input class="num orcin" style="width:90px" data-orc-reaj="pct" value="${esc(fmt(pe.reajuste?.pct))}" inputmode="decimal" placeholder="%">`:`${pe.reajuste?.mes?`${fmt(pe.reajuste.pct)}% a partir de ${MES[M().MM.indexOf(pe.reajuste.mes)]}`:'sem reajuste'}`}<span class="caption">Quem entra depois do reajuste já vem com o salário informado.</span></div></section>
 <section class="tablebox"><div class="tabletop"><h2>Custo de pessoal mês a mês</h2></div>${tabelaMeses('',`<tr><td>Pessoal (com encargos)</td>${M().MM.map(mm=>`<td class="num">${money(M().pessoalMes(v.dados,mm))}</td>`).join('')}<td class="num"><strong>${money(M().MM.reduce((a,mm)=>a+M().pessoalMes(v.dados,mm),0))}</strong></td></tr>`)}</section>`});

// ─────────── Investimentos ───────────
const invest=comVersao(v=>{const ed=podeEditar(v),l=v.dados.invest||[];
 const cel=(i,k,val,tipo)=>ed?(tipo==='mes'?`<select data-orc-inv="${i}|${k}">${M().MM.map((mm,j)=>`<option value="${mm}" ${(val||'01')===mm?'selected':''}>${MES[j]}</option>`).join('')}</select>`:`<input class="${tipo==='txt'?'':'num '}orcin" data-orc-inv="${i}|${k}" value="${esc(tipo==='txt'?val||'':fmt(val))}" ${tipo==='txt'?'':'inputmode="decimal"'}>`):esc(tipo==='mes'?MES[M().MM.indexOf(val||'01')]:tipo==='txt'?val||'':fmt(val));
 return `<section class="tablebox"><div class="tabletop"><div><h2>Investimentos (CAPEX)</h2><p class="caption">O desembolso entra no caixa nas parcelas; na DRE entra só a depreciação, pela vida útil.</p></div>${ed?`<button class="small" data-orc="addinv">${icon('plus')} Investimento</button>`:''}</div>
  <div class="tablewrap"><table><thead><tr><th>Item</th><th class="num">Valor (R$)</th><th>Mês da compra</th><th class="num">Parcelas</th><th class="num">Vida útil (meses)</th><th class="num">Depreciação no ano</th><th></th></tr></thead><tbody>
  ${l.map((x,i)=>`<tr><td>${cel(i,'nome',x.nome,'txt')}</td><td class="num">${cel(i,'valor',x.valor)}</td><td>${cel(i,'mes',x.mes,'mes')}</td><td class="num">${cel(i,'parcelas',x.parcelas)}</td><td class="num">${cel(i,'vida',x.vida)}</td><td class="num">${money(M().MM.reduce((a,mm)=>a+M().investMes({invest:[x]},mm).depr,0))}</td><td>${ed?`<button class="small quiet" data-orc="delinv" data-i="${i}" aria-label="Remover">✕</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhum investimento previsto.</td></tr>'}</tbody></table></div></section>
 <section class="tablebox"><div class="tabletop"><h2>Mês a mês</h2></div>${tabelaMeses('',`<tr><td>Desembolso (caixa)</td>${M().MM.map(mm=>`<td class="num">${money(M().investMes(v.dados,mm).caixa)}</td>`).join('')}<td class="num"><strong>${money(M().MM.reduce((a,mm)=>a+M().investMes(v.dados,mm).caixa,0))}</strong></td></tr><tr><td>Depreciação (DRE)</td>${M().MM.map(mm=>`<td class="num">${money(M().investMes(v.dados,mm).depr)}</td>`).join('')}<td class="num"><strong>${money(M().MM.reduce((a,mm)=>a+M().investMes(v.dados,mm).depr,0))}</strong></td></tr>`)}</section>`});

// ─────────── DRE orçada ───────────
const dre=comVersao(v=>{const c=M().calcular(v.dados),f=forecastDe(v,c),R=Object.fromEntries(M().MM.map(mm=>[mm,realDRE(v.ano+'-'+mm)]));
 const valor=(k,mm)=>st.dre==='realizado'?(mm?n(R[mm][k]):M().MM.reduce((a,x)=>a+n(R[x][k]),0)):st.dre==='forecast'?(mm?f.dre[mm][k]:f.ano[k]):st.dre==='variacao'?null:(mm?c.dre[mm][k]:c.ano[k]);
 const cel=(k,mm)=>{if(st.dre!=='variacao')return money(valor(k,mm));const o=mm?c.dre[mm][k]:c.ano[k],r=mm?n(R[mm][k]):M().MM.reduce((a,x)=>a+n(R[x][k]),0);if(!r)return '<span class="caption">—</span>';const d=r-o;return `<span class="${d<0?'red':'green'}">${money(d)}</span>`};
 const lin=M().DRE.map(([k,t,tipo])=>`<tr class="${tipo==='total'?'orctot':''}"><td>${tipo==='total'?`<strong>${t}</strong>`:t}</td>${M().MM.map(mm=>`<td class="num">${cel(k,mm)}</td>`).join('')}<td class="num"><strong>${cel(k,null)}</strong></td></tr>`).join('');
 const marg=[['=mb','Margem bruta %'],['=ebitda','Margem EBITDA %'],['=ll','Margem líquida %']].map(([k,t])=>`<tr class="caption"><td>${t}</td>${M().MM.map(mm=>{const base=st.dre==='realizado'?R[mm]:st.dre==='forecast'?f.dre[mm]:c.dre[mm];return `<td class="num">${n(base.receita)?pct(n(base[k])/n(base.receita)):'—'}</td>`}).join('')}<td class="num">${pct((st.dre==='forecast'?f.ano:c.ano)[k]/((st.dre==='forecast'?f.ano:c.ano).receita||1))}</td></tr>`).join('');
 return `<div class="crmbar"><div class="segtabs">${[['orcado','Orçado'],['realizado','Realizado'],['forecast','Forecast'],['variacao','Realizado − orçado']].map(([k,t])=>`<button class="${st.dre===k?'active':''}" data-orc-dre="${k}">${t}</button>`).join('')}</div><span class="caption">Mesma estrutura da DRE gerencial: o realizado vem da contabilidade do mês (ou da operação, se ainda não houver).</span></div>
 <section class="tablebox"><div class="tabletop"><h2>DRE ${st.dre==='orcado'?'orçada':st.dre==='realizado'?'realizada':st.dre==='forecast'?'forecast':'· variação'} ${v.ano}</h2></div>${tabelaMeses('Linha',lin+(st.dre==='variacao'?'':marg))}</section>`});

// ─────────── Caixa projetado ───────────
const caixaView=comVersao(v=>{const c=M().calcular(v.dados),k=M().caixa(v.dados,c),min=n(v.dados.premissas?.caixaMinimo);
 return `<div class="grid kpis4"><div class="card kpi"><span class="kpil">Saldo inicial</span><span class="kpiv">${money(n(v.dados.premissas?.saldoInicial))}</span><span class="kpis">+ ${money(n(v.dados.premissas?.aReceber))} a receber dos canais</span></div>
  <div class="card kpi"><span class="kpil">Saldo no fim do ano</span><span class="kpiv ${k.meses[11].saldo<0?'red':''}">${money(k.meses[11].saldo)}</span><span class="kpis">gerado no ano: ${money(k.meses[11].saldo-n(v.dados.premissas?.saldoInicial))}</span></div>
  <div class="card kpi"><span class="kpil">Menor saldo</span><span class="kpiv ${k.min<min?'red':''}">${money(k.min)}</span><span class="kpis">em ${MES[M().MM.indexOf(k.mesMin)]} · mínimo desejado ${money(min)}</span></div>
  <div class="card kpi"><span class="kpil">Meses abaixo do mínimo</span><span class="kpiv ${k.abaixo.length?'red':''}">${k.abaixo.length}</span><span class="kpis">${k.abaixo.map(mm=>MES[M().MM.indexOf(mm)]).join(', ')||'nenhum'}</span></div></div>
 <section class="tablebox"><div class="tabletop"><div><h2>Saldo mês a mês</h2><p class="caption">Método direto: repasses dos canais com o prazo de cada um, compras no prazo do fornecedor, tributos no mês seguinte, despesas e pessoal no mês e as parcelas dos investimentos.</p></div></div><div style="padding:8px 12px">${grafico([{cls:'orcb-r',v:k.meses.map(x=>x.entradas)},{cls:'orcb-o',v:k.meses.map(x=>x.saidas)},{cls:'orcl-f',tipo:'linha',v:k.meses.map(x=>x.saldo)}],200)}</div>
 ${tabelaMeses('',`<tr><td>Entradas</td>${k.meses.map(x=>`<td class="num">${money(x.entradas)}</td>`).join('')}<td class="num"><strong>${money(k.meses.reduce((a,x)=>a+x.entradas,0))}</strong></td></tr><tr><td>Saídas</td>${k.meses.map(x=>`<td class="num">${money(x.saidas)}</td>`).join('')}<td class="num"><strong>${money(k.meses.reduce((a,x)=>a+x.saidas,0))}</strong></td></tr><tr class="orctot"><td><strong>Saldo no fim do mês</strong></td>${k.meses.map(x=>`<td class="num ${x.saldo<min?'red':''}"><strong>${money(x.saldo)}</strong></td>`).join('')}<td></td></tr>`)}</section>`});

// ─────────── Orçado × realizado ───────────
const realizado=comVersao(v=>{const mm=String(month).slice(5,7),k=v.ano+'-'+mm,c=M().calcular(v.dados),f=forecastDe(v,c),R=realDRE(k),coment=v.dados.comentarios||{};
 const ate=M().MM.slice(0,M().MM.indexOf(mm)+1),acO=l=>ate.reduce((a,x)=>a+n(c.dre[x][l]),0),acR=l=>ate.reduce((a,x)=>a+n(realDRE(v.ano+'-'+x)[l]),0);
 const lin=M().DRE.map(([l,t,tipo])=>{const o=c.dre[mm][l],r=n(R[l]),d=r-o,cm=coment[l+'|'+k]||[];
  return `<tr class="${tipo==='total'?'orctot':''}"><td>${tipo==='total'?`<strong>${t}</strong>`:t}</td><td class="num">${money(o)}</td><td class="num">${R.receita?money(r):'—'}</td><td class="num ${d<0?'red':'green'}">${R.receita?money(d):'—'}</td><td class="num">${R.receita&&o?pct(d/Math.abs(o)):'—'}</td><td class="num">${money(acO(l))}</td><td class="num">${money(acR(l))}</td><td class="num">${money(f.ano[l])}</td>
   <td>${cm.length?`<span class="caption" title="${esc(cm.map(x=>x.texto).join(' · '))}">${esc(cm.at(-1).texto.slice(0,40))}${cm.at(-1).texto.length>40?'…':''}</span> `:''}${editor()?`<button class="small quiet" data-orc="coment" data-l="${l}" data-k="${k}">${cm.length?'+':'Justificar'}</button>`:''}</td></tr>`}).join('');
 const cats=Object.entries(v.dados.despesas||{}),rc=realCat(k),lc=[...new Set([...cats.map(([x])=>x),...Object.keys(rc)])].map(cat=>{const o=n(v.dados.despesas?.[cat]?.meses?.[mm]),r=r2(rc[cat]||0);return {cat,o,r,p:o?r/o:null}}).filter(x=>x.o||x.r).sort((a,b)=>(b.p??-1)-(a.p??-1));
 return `${String(month).slice(0,4)!==String(v.ano)?`<div class="notice">A versão é de ${v.ano}: mostrando ${MES[M().MM.indexOf(mm)]}/${v.ano}. Troque o mês no cabeçalho para ver outro mês.</div>`:''}
 <section class="tablebox"><div class="tabletop"><div><h2>DRE · ${MES[M().MM.indexOf(mm)]}/${v.ano}</h2><p class="caption">Mês do cabeçalho, acumulado até ele e forecast do ano. Desvio relevante? Clique em Justificar e registre o motivo (fica na versão, com quem e quando).</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>Linha</th><th class="num">Orçado</th><th class="num">Realizado</th><th class="num">Diferença</th><th class="num">%</th><th class="num">Orçado acum.</th><th class="num">Realizado acum.</th><th class="num">Forecast ano</th><th>Justificativa</th></tr></thead><tbody>${lin}</tbody></table></div></section>
 <section class="tablebox"><div class="tabletop"><div><h2>Despesas por categoria · ${MES[M().MM.indexOf(mm)]}</h2><p class="caption">Realizado pelo vencimento dos títulos e pelas saídas do extrato sem título.</p></div></div><div class="tablewrap"><table><thead><tr><th>Categoria</th><th class="num">Orçado</th><th class="num">Realizado</th><th style="width:28%">Consumo</th><th class="num">Disponível</th></tr></thead><tbody>
  ${lc.map(x=>{const w=x.p==null?0:Math.min(100,x.p*100),stt=!x.o?'sem':x.p>1?'estourou':x.p>=.85?'atencao':'ok';return `<tr><td><strong>${esc(x.cat)}</strong></td><td class="num">${money(x.o)}</td><td class="num">${money(x.r)}</td><td><div class="orcbar ${stt}"><i style="width:${w}%"></i></div><small class="caption">${x.p==null?'sem orçamento':(x.p*100).toFixed(0)+'%'}</small></td><td class="num ${x.o-x.r<0?'red':''}">${x.o?money(x.o-x.r):'—'}</td></tr>`}).join('')||'<tr><td colspan="5" class="empty">Sem despesas neste mês.</td></tr>'}</tbody></table></div></section>`});

// ─────────── Ações ───────────
const setPath=(o,path,val)=>{const k=path.split('.');let x=o;while(k.length>1){const a=k.shift();x=x[a]=x[a]||{}}x[k[0]]=val};
async function criar(ano,nome,tipo,deId){const id='orc-'+ano+'-'+Date.now().toString(36),base=deId?(st.lista||[]).find(x=>x.id===deId):null;
 const dados=base?JSON.parse(JSON.stringify(base.dados)):M().gerarVersao(entradas(ano));dados.historico=[{em:new Date().toISOString(),quem:meuEmail(),acao:base?`Criada a partir de ${base.nome}`:'Criada a partir do histórico'}];dados.comentarios=base?dados.comentarios||{}:{};
 if(base)for(const x of Object.values(dados.despesas||{}))x.status='pendente';
 const row={workspace_id:Cloud.ws,id,ano,nome,tipo,status:'rascunho',dados,criado_por:meuEmail()};const {error}=await Cloud.client.from('orcamentos').insert(row);if(error)return toast(error.message);
 st.lista=[{...row,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},...(st.lista||[])];st.vid=id;gravarLS('eb_orc_v',id);audit('Orçamento: versão criada',`${nome} (${ano})`);closeModal();toast('Versão criada.');render()}
document.addEventListener('change',async e=>{const x=e.target,v=atual();if(!v)return;
 if(x.matches('[data-orc-v]')){st.vid=x.value;gravarLS('eb_orc_v',x.value);render();return}
 if(x.matches('[data-orc-minhas]')){st.soMinhas=x.checked;render();return}
 if(x.matches('[data-orc-p]')){if(mexer(v,d=>{d.premissas=d.premissas||{};setPath(d.premissas,x.dataset.orcP,num(x.value)??0)}))render();return}
 if(x.matches('[data-orc-rec]')){const [cn,mm]=x.dataset.orcRec.split('|');if(mexer(v,d=>{d.receitas=d.receitas||{};d.receitas[cn]=d.receitas[cn]||{};const val=num(x.value);if(val==null)delete d.receitas[cn][mm];else d.receitas[cn][mm]=val}))render();return}
 if(x.matches('[data-orc-resp]')){if(mexer(v,d=>{d.despesas[x.dataset.orcResp].resp=x.value||null}))render();return}
 if(x.matches('[data-orc-desp]')){const [cat,mm]=x.dataset.orcDesp.split('|'),val=num(x.value)??0;
  if(editor()){if(mexer(v,d=>{d.despesas[cat].meses[mm]=val}))render();return}
  const meses={...(v.dados.despesas[cat].meses||{}),[mm]:val};const {data,error}=await Cloud.client.rpc('orc_preencher',{p_ws:Cloud.ws,p_id:v.id,p_cat:cat,p_meses:meses,p_concluir:false});if(error)return toast(error.message);v.dados.despesas[cat].meses=meses;toast(data);render();return}
 if(x.matches('[data-orc-pes]')){const [i,k]=x.dataset.orcPes.split('|');if(mexer(v,d=>{const p=d.pessoal.pessoas[Number(i)];p[k]=['nome','cargo','inicio','fim'].includes(k)?(x.value||null):num(x.value)}))render();return}
 if(x.matches('[data-orc-reaj]')){if(mexer(v,d=>{d.pessoal.reajuste=d.pessoal.reajuste||{};d.pessoal.reajuste[x.dataset.orcReaj]=x.dataset.orcReaj==='mes'?x.value:num(x.value)??0}))render();return}
 if(x.matches('[data-orc-inv]')){const [i,k]=x.dataset.orcInv.split('|');if(mexer(v,d=>{const it=d.invest[Number(i)];it[k]=['nome','mes'].includes(k)?x.value:num(x.value)}))render();return}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-orc],[data-orc-dre]');if(!b)return;const d=b.dataset,v=atual();
 if(d.orcDre){st.dre=d.orcDre;render();return}
 const k=d.orc;
 if(k==='criar'){b.disabled=true;await criar(Number(d.ano),`Orçamento ${d.ano} V1`,'orcamento',null);return}
 if(k==='nova'||k==='duplicar'){const a=anoPadrao(),dup=k==='duplicar'&&v,vs=(st.lista||[]).filter(x=>x.ano===(dup?v.ano:a)).length;
  modal(dup?'Duplicar versão':'Nova versão',`<form id="orcNovaF" style="display:grid;gap:10px"><label>Ano<select name="ano">${[a-1,a,a+1].map(y=>`<option ${y===(dup?v.ano:a)?'selected':''}>${y}</option>`).join('')}</select></label>
   <label>Nome<input name="nome" required value="${esc(dup?`${v.nome} (cópia)`:`Orçamento ${a} V${vs+1}`)}"></label>
   <label>Tipo<select name="tipo"><option value="orcamento">Orçamento</option><option value="forecast" ${dup?'selected':''}>Forecast (revisão do ano)</option><option value="cenario">Cenário (simulação)</option></select></label>
   <label>Começar a partir de<select name="de"><option value="">Histórico (o Jarvis monta sozinho)</option>${(st.lista||[]).map(x=>`<option value="${esc(x.id)}" ${dup&&x.id===v.id?'selected':''}>Cópia de ${esc(x.nome)} (${x.ano})</option>`).join('')}</select></label>
   <div class="row" style="justify-content:flex-end"><button class="primary" data-orc="salvarnova">Criar versão</button></div></form>`);return}
 if(k==='salvarnova'){e.preventDefault();const f=new FormData(document.getElementById('orcNovaF'));const nome=String(f.get('nome')||'').trim();if(!nome)return toast('Dê um nome à versão.');b.disabled=true;await criar(Number(f.get('ano')),nome,String(f.get('tipo')),String(f.get('de')||'')||null);return}
 if(!v)return;
 if(k==='enviar')return setStatus(v,'em_revisao','Enviada para aprovação');
 if(k==='aprovar'){if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar aprovação';return}return setStatus(v,'aprovado','Aprovada')}
 if(k==='reabrir')return setStatus(v,'rascunho','Reaberta para alteração');
 if(k==='arquivar'){if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar';return}return setStatus(v,'arquivado','Arquivada')}
 if(k==='addcat'){const usadas=new Set(Object.keys(v.dados.despesas||{})),g=grupos(),op=Object.keys(g).filter(c=>!usadas.has(c)).sort();
  modal('Categoria no orçamento',`<form id="orcCatF" style="display:grid;gap:10px"><label>Categoria<input name="cat" list="orcCatL" required placeholder="Ex.: Marketing"><datalist id="orcCatL">${op.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label><label>Grupo (linha da DRE)<select name="grupo">${Object.keys(M().LINHA_GRUPO).filter(x=>x!=='Investimentos').map(x=>`<option>${x}</option>`).join('')}</select></label><label>Valor por mês (R$)<input name="valor" inputmode="decimal" placeholder="0,00"></label><div class="row" style="justify-content:flex-end"><button class="primary" data-orc="salvarcat">Incluir</button></div></form>`);return}
 if(k==='salvarcat'){e.preventDefault();const f=new FormData(document.getElementById('orcCatF')),cat=String(f.get('cat')||'').trim();if(!cat)return toast('Informe a categoria.');const val=num(f.get('valor'))||0,grupo=grupos()[cat]||String(f.get('grupo'));
  if(mexer(v,dd=>{dd.despesas=dd.despesas||{};dd.despesas[cat]={grupo,resp:null,status:'pendente',meses:Object.fromEntries(M().MM.map(mm=>[mm,val]))}})){closeModal();render()}return}
 if(k==='espalhar'){const cat=d.cat,x=v.dados.despesas[cat],tot=M().MM.reduce((a,mm)=>a+n(x.meses?.[mm]),0);
  modal('Espalhar · '+cat,`<form id="orcEspF" style="display:grid;gap:10px"><label>Valor do ano (R$)<input name="valor" inputmode="decimal" value="${esc(fmt(tot))}"></label><label>Como distribuir<select name="modo"><option value="igual">Igual nos 12 meses</option><option value="receita">Na proporção da receita orçada (sazonalidade)</option></select></label><div class="row" style="justify-content:flex-end"><button class="primary" data-orc="salvaresp" data-cat="${esc(cat)}">Aplicar</button></div></form>`);return}
 if(k==='salvaresp'){e.preventDefault();const f=new FormData(document.getElementById('orcEspF')),val=num(f.get('valor'))||0,modo=f.get('modo'),c=M().calcular(v.dados),pesos=M().MM.map(mm=>modo==='receita'?c.dre[mm].receita:1),sp=pesos.reduce((a,x)=>a+x,0)||12;
  const meses=Object.fromEntries(M().MM.map((mm,i)=>[mm,Math.round(val*pesos[i]/sp)]));
  if(editor()){if(mexer(v,dd=>{dd.despesas[d.cat].meses=meses})){closeModal();render()}return}
  const {data,error}=await Cloud.client.rpc('orc_preencher',{p_ws:Cloud.ws,p_id:v.id,p_cat:d.cat,p_meses:meses,p_concluir:false});if(error)return toast(error.message);v.dados.despesas[d.cat].meses=meses;closeModal();toast(data);render();return}
 if(k==='preenchido'){const cat=d.cat;if(editor()){if(mexer(v,dd=>{dd.despesas[cat].status='preenchido'})){hist(v,`Categoria ${cat} concluída`);render()}return}
  const {data,error}=await Cloud.client.rpc('orc_preencher',{p_ws:Cloud.ws,p_id:v.id,p_cat:cat,p_meses:v.dados.despesas[cat].meses||{},p_concluir:true});if(error)return toast(error.message);v.dados.despesas[cat].status='preenchido';toast(data);render();return}
 if(k==='addpes'){if(mexer(v,dd=>{dd.pessoal=dd.pessoal||{pessoas:[],reajuste:{}};dd.pessoal.pessoas.push({nome:'',cargo:'',salario:0,inicio:'01',fim:null})}))render();return}
 if(k==='delpes'){if(mexer(v,dd=>{dd.pessoal.pessoas.splice(Number(d.i),1)}))render();return}
 if(k==='addinv'){if(mexer(v,dd=>{dd.invest=dd.invest||[];dd.invest.push({nome:'',valor:0,mes:'01',parcelas:1,vida:60})}))render();return}
 if(k==='delinv'){if(mexer(v,dd=>{dd.invest.splice(Number(d.i),1)}))render();return}
 if(k==='coment'){const l=d.l,kk=d.k,cm=(v.dados.comentarios||{})[l+'|'+kk]||[],nomeL=M().DRE.find(x=>x[0]===l)?.[1]||l;
  modal('Justificativa · '+nomeL,`${cm.map(x=>`<p class="caption"><b>${esc(x.quem||'')}</b> · ${new Date(x.em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}<br>${esc(x.texto)}</p>`).join('')}<form id="orcComF" style="display:grid;gap:10px"><label>Motivo do desvio e o que será feito<textarea name="t" rows="3" required></textarea></label><div class="row" style="justify-content:flex-end"><button class="primary" data-orc="salvarcoment" data-l="${l}" data-k="${kk}">Registrar</button></div></form>`);return}
 if(k==='salvarcoment'){e.preventDefault();const t=String(new FormData(document.getElementById('orcComF')).get('t')||'').trim();if(!t)return;
  // Justificativa vale mesmo em versão aprovada (não muda números): grava direto, com quem e quando.
  v.dados.comentarios=v.dados.comentarios||{};const ch=d.l+'|'+d.k;v.dados.comentarios[ch]=[...(v.dados.comentarios[ch]||[]),{quem:meuEmail(),em:new Date().toISOString(),texto:t}];await salvar(v);closeModal();toast('Justificativa registrada.');render()}});
document.addEventListener('submit',e=>{if(['orcNovaF','orcCatF','orcEspF','orcComF'].includes(e.target.id))e.preventDefault()});

addPage('orcvisao','target','Visão do orçamento',visao,'O ano orçado em uma tela: receita, margem, lucro, caixa, o realizado até agora e o forecast.','',()=>{});
addPage('orcpremissas','target','Premissas e cenários',premissas,'Versões do orçamento, premissas por canal e gerais, e a comparação dos cenários.','',()=>{});
addPage('orcreceitas','target','Receitas por canal',receitas,'Receita de cada canal mês a mês: base histórica com sazonalidade × crescimento.','',()=>{});
addPage('orcdespesas','target','Despesas',despesas,'Despesas por categoria e mês, com o responsável que preenche cada uma.','',()=>{});
addPage('orcpessoal','target','Pessoal',pessoal,'Quadro de pessoas, salários, encargos, reajuste, contratações e saídas.','',()=>{});
addPage('orcinvest','target','Investimentos',invest,'Compras de equipamentos e melhorias: desembolso no caixa e depreciação na DRE.','',()=>{});
addPage('orcdre','target','DRE orçada',dre,'DRE mês a mês: orçado, realizado, forecast e a diferença.','',()=>{});
addPage('orccaixa','target','Caixa projetado',caixaView,'Entradas, saídas e saldo mês a mês pela versão do orçamento.','',()=>{});
addPage('orcamento','target','Orçado × realizado',realizado,'O mês do cabeçalho contra o orçado, o acumulado do ano, o forecast e a justificativa de cada desvio.','',()=>{});
window.Orcamento={carregar,atual,entradas,avisos:()=>{const v=(st.lista||[]).find(x=>x.status==='aprovado'&&x.tipo==='orcamento'&&String(x.ano)===String(month).slice(0,4));if(!v)return [];const mm=String(month).slice(5,7),rc=realCat(String(month)),est=Object.entries(v.dados.despesas||{}).filter(([c,x])=>n(x.meses?.[mm])&&rc[c]>n(x.meses[mm]));return est.length?[['warn','target',`${est.length} categoria(s) acima do orçado`,est.slice(0,3).map(([c])=>c).join(', '),'orcamento']]:[]}};
})();
