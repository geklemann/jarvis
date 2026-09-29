'use strict';
// Início · "Hoje": a primeira tela do Jarvis. Saudação com o resumo do dia numa frase, barra "pergunte ou peça"
// (responde na hora com os dados da empresa, por texto ou voz, e só chama a IA quando não sabe), orbe de estado,
// linha do mês (vendas por dia e vencimentos), cartões vivos de cada área e os módulos com favoritos.
(()=>{
const E=()=>window.ERP||{};
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const addDias=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toLocaleDateString('sv-SE')};
const dataBR=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const ico=(n,s=18)=>icon(n).replace('class="icon"',`class="icon" style="width:${s}px;height:${s}px"`);
const fmtC=v=>{const a=Math.abs(v),s=v<0?'−':'';if(a>=1e6)return `${s}R$ ${(a/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})} mi`;if(a>=1e4)return `${s}R$ ${(a/1e3).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`;return money(v)};
const ler=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const gravar=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const seguro=(f,alt='')=>{try{return f()}catch(e){console.warn('Hoje:',e);return alt}};
const ui={resposta:'',ouvindo:false};

// ─────────── Números do dia ───────────
function dados(){const h=hoje(),m=h.slice(0,7),dia=+h.slice(8),ant=new Date(+m.slice(0,4),+m.slice(5)-2,15).toLocaleDateString('sv-SE').slice(0,7);
 const porDia=new Map();for(const o of db.orders){const v=porDia.get(o.date)||{v:0,n:0};v.v+=Number(o.gross)||0;v.n++;porDia.set(o.date,v)}
 const soma=(de,ate)=>{let v=0,n=0;for(const [d,x] of porDia)if(d>=de&&d<=ate){v+=x.v;n+=x.n}return {v,n}};
 const vh=porDia.get(h)||{v:0,n:0},vo=porDia.get(addDias(h,-1))||{v:0,n:0},mes=soma(m+'-01',h),mesAnt=soma(ant+'-01',ant+'-'+String(dia).padStart(2,'0'));
 const spark=[...Array(14)].map((_,i)=>(porDia.get(addDias(h,i-13))||{v:0}).v);
 const ab=seguro(()=>E().abertos(),[]),sT=t=>E().saldoT?.(t)??t.valor,somaT=l=>round(l.reduce((a,t)=>a+sT(t),0));
 const venc=ab.filter(t=>t.vencimento<h),vhj=ab.filter(t=>t.vencimento===h),sem=ab.filter(t=>t.vencimento>h&&t.vencimento<=addDias(h,7));
 const pr=seguro(()=>E().projecao(30),{inicial:0,serie:[],contas:[]}),menor=(pr.serie||[]).reduce((a,x)=>x.saldo<a.saldo?x:a,{saldo:pr.inicial,d:h});
 const receberMk=round(db.orders.filter(o=>seguro(()=>['A receber','Em trânsito'].includes(status(o)),false)).reduce((a,o)=>a+Math.max(0,net(o)-paid(o)),0));
 const recVd=(window.VendaDireta?.titulos?.()||[]).filter(r=>['aberto','parcial'].includes(r.status)),receberVd=round(recVd.reduce((a,r)=>a+Number(r.valor)-Number(r.valor_recebido||0),0));
 const avisos=seguro(()=>E().avisos(),[]);
 return {h,m,dia,ant,porDia,vh,vo,mes,mesAnt,spark,ab,venc,vhj,sem,somaT,pr,menor,receberMk,receberVd,recVd,avisos}}

// ─────────── Desempenho por produto (orbe, pergunta escrita) ───────────
// Acha o produto citado na frase (SKU ou palavras do nome) e responde com vendas, lucro, margem por canal, preço mínimo
// e estoque. "Quais produtos dão mais lucro?" responde com o ranking.
const PARADAS=new Set(['como','esta','estao','produto','produtos','item','itens','desempenho','venda','vendas','vendendo','lucro','lucratividade','margem','anuncio','do','da','de','dos','das','o','a','os','as','e','no','na','qual','quanto','que','me','fala','sobre','mostra','ver','performance','rentabilidade','maral','pimpi','compra','store','anda','vai','tem','teve','esse','essa','mes','dias']);
function acharProduto(n){const lista=(window.Estoque?.lista?.()||[]).filter(p=>p.nome);if(!lista.length)return null;const pal=n.split(/[^a-z0-9]+/).filter(w=>w.length>=2);
 const sku=lista.find(p=>pal.includes(normalized(p.id)));if(sku)return sku;const q=new Set(pal.filter(w=>!PARADAS.has(w)));if(!q.size)return null;
 let melhor=null,nota=0;for(const p of lista){const ws=normalized(p.nome).split(/[^a-z0-9]+/).filter(w=>w.length>=2&&!PARADAS.has(w));if(!ws.length)continue;
  const hit=ws.filter(w=>q.has(w)||[...q].some(x=>x.length>=4&&(w.startsWith(x)||x.startsWith(w)))).length,sc=hit/ws.length+hit*.35;if(hit&&sc>nota){nota=sc;melhor=p}}
 return nota>=.6?melhor:null}
function respostaProduto(p){const M=window.Margem?.produto?.(p.id);if(!M)return '<strong>'+esc(p.nome)+'</strong>: abra o Radar de margem para calcular.';
 const pc=v=>(v*100).toFixed(1).replace('.',',')+'%',var_=M.venda_ant?((M.venda/M.venda_ant-1)*100):null,cob=M.unidades?(Number(p.saldo)||0)/(M.unidades/M.periodo):null;
 const tom=M.margem<0?'red':M.margem*100<M.meta?'gold':'green';
 const canais=M.canais.length?'<ul class="hj-list">'+M.canais.map(c=>`<li><span>${esc(c.canal)} · ${c.u} un. a ${money(c.preco)}</span><small class="${c.margem<0?'red':''}">margem ${pc(c.margem)}${c.minimo?` · mín. ${money(c.minimo)}`:''}</small><b>${money(c.lucro)}</b></li>`).join('')+'</ul>':'';
 return `<div class="hj-prod">${p.imagem?`<img src="${esc(p.imagem)}" alt="">`:''}<div><strong>${esc(p.nome)}</strong><br><span class="caption mono">${esc(p.id)}</span></div></div>
 <p><strong>Últimos ${M.periodo} dias: ${M.unidades.toLocaleString('pt-BR')} un. · ${money(M.venda)}</strong> em ${M.pedidos} pedido(s)${var_!=null?` — ${var_>=0?'▲':'▼'} ${Math.abs(var_).toFixed(1).replace('.',',')}% contra os ${M.periodo} dias anteriores`:''}.
 Lucro de contribuição <b class="${tom}">${money(M.lucro)} (${pc(M.margem)})</b>${M.custo?` · custo ${money(M.custo)} por unidade`:''}.</p>${canais}
 <p class="caption">Estoque: <b>${(Number(p.saldo)||0).toLocaleString('pt-BR')} un.</b>${cob!=null?` · cobertura de ${Math.round(cob)} dia(s)`:''}${M.canais.some(c=>c.minimo&&c.preco<c.minimo)?' · <span class="red">há canal vendendo abaixo do preço mínimo</span>':''}.</p>
 <div class="row wrap"><button class="small" data-nav="margem">Radar de margem →</button><button class="small" data-est-ficha="${esc(p.id)}">Ficha do produto →</button><button class="small" data-nav="precos">Formação de preço →</button></div>`}
function rankingLucro(pior){const R=(window.Margem?.ranking?.()||[]).filter(g=>g.venda>0);if(!R.length)return '<strong>Sem vendas com custo no período.</strong>';const l=[...R].sort((a,b)=>pior?a.lucro-b.lucro:b.lucro-a.lucro).slice(0,7);
 return `<strong>${pior?'Produtos que menos lucram (ou dão prejuízo)':'Produtos que mais dão lucro'} · últimos 30 dias</strong><ul class="hj-list">${l.map((g,i)=>`<li><span>${i+1}. ${esc(String(g.nome).slice(0,48))}</span><small class="${g.margem<0?'red':''}">${g.u} un. · margem ${(g.margem*100).toFixed(1).replace('.',',')}%</small><b class="${g.lucro<0?'red':''}">${money(g.lucro)}</b></li>`).join('')}</ul><div class="row wrap"><button class="small" data-nav="margem">Radar de margem →</button></div>`}

// ─────────── Assistente local: responde com os dados, ou encaminha ───────────
function responder(q,soRegra){const n=normalized(q),d=dados(),bt=(nav,t)=>`<button class="small" data-nav="${nav}">${t} →</button>`;
 const R=[
  [/(mais|maior|melhor(es)?) (lucr|rentab|margem)|produtos? (que )?(mais )?(da|dao|dá|dão) (mais )?lucro|ranking de lucr|lucratividade (por|dos) (item|itens|produto)/,()=>rankingLucro(false)],
  [/(menos|menor|pior(es)?) (lucr|rentab|margem)|prejuizo por produto|produtos? (com|dando) prejuizo/,()=>rankingLucro(true)],
  [/./,()=>{const p=/(produto|item|desempenho|performance|lucr|rentab|margem|vend|como (esta|anda|vai))/.test(n)||/\bcs\d/.test(n)?acharProduto(n):null;return p?respostaProduto(p):null}],
  [/vend|fatur|pedido|faturei|vendi/,()=>{const var_=d.mesAnt.v?((d.mes.v/d.mesAnt.v-1)*100):0;return `<strong>Hoje: ${money(d.vh.v)} em ${d.vh.n} pedido(s)</strong> (ontem ${money(d.vo.v)}). No mês, ${money(d.mes.v)} em ${d.mes.n} pedidos — ${var_>=0?'▲':'▼'} ${Math.abs(var_).toFixed(1).replace('.',',')}% contra o mesmo período do mês passado.<div class="row wrap">${bt('dashboard','Visão geral')}${bt('margem','Margem')}</div>`}],
  [/venc|pagar|boleto|conta(s)? a pagar|devo/,()=>`<strong>${d.vhj.length} título(s) vencem hoje (${money(d.somaT(d.vhj))})</strong>${d.venc.length?`, <span class="red">${d.venc.length} vencido(s) somando ${money(d.somaT(d.venc))}</span>`:', nada vencido'}. Nos próximos 7 dias: ${d.sem.length} título(s), ${money(d.somaT(d.sem))}.<ul class="hj-list">${[...d.venc,...d.vhj,...d.sem].slice(0,5).map(t=>`<li><span>${esc(t.fornecedor||t.descricao)}</span><small>${dataBR(t.vencimento)}</small><b>${money(E().saldoT?.(t)??t.valor)}</b></li>`).join('')}</ul><div class="row wrap">${bt('pagar','Contas a pagar')}${bt('fluxo','Fluxo de caixa')}</div>`],
  [/receb|repasse|liberac/,()=>`<strong>A receber: ${money(d.receberMk)} dos marketplaces</strong>${d.receberVd?` e ${money(d.receberVd)} de vendas diretas (${d.recVd.length} parcela(s))`:''}.<div class="row wrap">${bt('reconcile','Conciliação de vendas')}${bt('receber','Contas a receber')}</div>`],
  [/caixa|saldo|banco|dinheiro|sobra/,()=>`<strong>Saldo em bancos: ${money(d.pr.inicial)}</strong> em ${d.pr.contas?.length||0} conta(s). Menor saldo previsto em 30 dias: <b class="${d.menor.saldo<0?'red':''}">${money(d.menor.saldo)}</b> em ${dataBR(d.menor.d)}.<div class="row wrap">${bt('tesouraria','Bancos e saldos')}${bt('fluxo','Fluxo de caixa')}</div>`],
  [/estoque|ruptura|repor|comprar|falta/,()=>{const a=window.Estoque?.avisos?.()||[];return `${a.length?a.map(x=>`<strong>${x[2]}</strong> — ${x[3]}`).join('<br>'):'<strong>Estoque sem rupturas nem compras urgentes.</strong>'}<div class="row wrap">${bt('estoque','Estoque')}${bt('estcompras','Sugestão de compras')}</div>`}],
  [/nota|nf|fiscal|emit|danfe/,()=>{const s=db.orders.filter(o=>!o.nf&&o.date>=addDias(d.h,-14)).length,amb=db.gerencial?.fiscal?.ambiente||'homologacao';return `<strong>${s} pedido(s) dos últimos 14 dias sem nota.</strong> Emissão própria em <b>${amb==='producao'?'produção':'homologação'}</b>.<div class="row wrap">${bt('faturamento','Faturamento')}${bt('parametros','Parametrização fiscal')}</div>`}],
  [/fech|contab|balancete|tribut|imposto|difal|darf|guia/,()=>{const t=window.Contab?.tributos?.(d.m);return `${t?`<strong>Tributos provisionados em ${d.m.slice(5)}/${d.m.slice(0,4)}: ${money(t.icms+t.difal+t.pis+t.cofins+(t.irpj||0)+(t.csll||0))}</strong> (ICMS ${fmtC(t.icms)}, DIFAL ${fmtC(t.difal)}, PIS/COFINS ${fmtC(t.pis+t.cofins)}, IRPJ/CSLL ${fmtC((t.irpj||0)+(t.csll||0))}).`:'<strong>Contabilidade automática pronta para o fechamento.</strong>'}<div class="row wrap">${bt('fechcontab','Fechamento contábil')}${bt('contabauto','Contabilidade')}</div>`}],
  [/margem|lucro|resultado|dre|rentab/,()=>`<strong>Resultado e margem por canal, produto e pedido.</strong><div class="row wrap">${bt('margem','Margem')}${bt('contabauto','DRE automática')}${bt('contabil','DRE do escritório')}</div>`],
  [/atendim|reclama|cliente|devoluc/,()=>`<strong>${window.Atendimento?.abertos?.()||0} atendimento(s) em aberto.</strong><div class="row wrap">${bt('atendimento','Atendimento')}${bt('devolucoes','Devoluções')}${bt('crm','CRM')}</div>`],
  [/lanc|nova despesa|novo titulo|cadastrar conta/,()=>`<strong>Lançar um título a pagar.</strong><div class="row wrap">${bt('lancamento','Novo lançamento')}</div>`],
  [/venda direta|atacado|orcamento/,()=>`<strong>Venda direta com nota e parcelas.</strong><div class="row wrap">${bt('vendadireta','Nova venda direta')}</div>`]];
 for(const [re,f] of R){if(!re.test(n))continue;const x=f();if(x)return x}if(soRegra)return null;
 const res=seguro(()=>E().resultados?.(q),'');
 return `<strong>Não encontrei uma resposta pronta para “${esc(q)}”.</strong>${res?`<div class="hj-res">${res}</div>`:''}<div class="row wrap"><button class="small primary" data-hj="ia" data-q="${esc(q)}">${ico('spark',15)} Perguntar à IA</button></div>`}

// ─────────── Blocos da tela ───────────
function frase(d){const partes=[`${d.vh.n?`${d.vh.n} pedido(s) e ${fmtC(d.vh.v)} em vendas hoje`:'Nenhuma venda registrada hoje ainda'}`,`caixa de ${fmtC(d.pr.inicial)}`];
 if(d.venc.length)partes.push(`${d.venc.length} conta(s) vencida(s)`);else if(d.vhj.length)partes.push(`${d.vhj.length} conta(s) vencem hoje`);else partes.push('nada vencido');
 return partes.join(' · ')+'.'}
function hero(d){const dt=new Date(),pend=d.avisos.length,emp=esc(window.Cloud?.wsName||'Compra Store');
 const chips=[['Como estão as vendas hoje?','sales'],['O que vence esta semana?','calendar'],['Quanto tenho em caixa?','wallet'],['O que falta no estoque?','box'],['Tributos do mês','receipt'],['Novo lançamento','plus']];
 return `<section class="hj-hero"><div class="hj-main">
  <p class="hj-eyebrow">${dt.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · ${emp}</p>
  <h1 class="hj-hello">${esc(seguro(()=>E().saudacao(),'Olá'))}.</h1>
  <p class="hj-brief">${frase(d)}</p>
  <form class="hj-ask" id="hjAsk" autocomplete="off"><button type="button" class="hj-mic" data-hj="voz" aria-label="Falar" aria-pressed="${ui.ouvindo}">${ico('mic',21)}</button>
   <input id="hjQ" placeholder="Pergunte, busque ou peça algo…  ( / )" aria-label="Pergunte ao Jarvis"><button class="hj-send" aria-label="Enviar">${ico('arrow',20)}</button></form>
  <div class="hj-chips">${chips.map(([t,i])=>`<button type="button" data-hj="chip" data-q="${esc(t)}">${ico(i,15)}${t}</button>`).join('')}</div>
  <div class="hj-answer ${ui.resposta?'on':''}" id="hjAns" aria-live="polite">${ui.resposta}</div></div>
 <div class="hj-side"><button class="hj-orb ${pend?'alert':'calm'} ${ui.ouvindo?'listen':''}" data-hj="orb" aria-label="Falar com o Jarvis"><span class="hj-orb-core"></span><span class="hj-orb-ring"></span><b>J</b></button>
  <p class="hj-status">${ui.ouvindo?'Ouvindo… pode falar':pend?`${pend} ponto(s) pedem atenção`:'Tudo em dia'}<br><small>toque no orbe para falar</small></p><div class="row wrap" style="justify-content:center;gap:8px"><button class="small" data-hj="painel">${ico('grid',15)} Modo painel</button><button class="small" data-nav="mapa">${ico('folder',15)} Mapa do ERP</button></div></div></section>`}
function linhaMes(d){const [y,mo]=d.m.split('-').map(Number),n=new Date(y,mo,0).getDate(),vals=[],pag=new Map();
 for(const t of d.ab)if(t.vencimento?.startsWith(d.m)){const x=pag.get(t.vencimento)||{n:0,v:0};x.n++;x.v+=E().saldoT?.(t)??t.valor;pag.set(t.vencimento,x)}
 for(let i=1;i<=n;i++){const k=`${d.m}-${String(i).padStart(2,'0')}`;vals.push({k,i,v:(d.porDia.get(k)||{v:0}).v,q:(d.porDia.get(k)||{n:0}).n,p:pag.get(k)})}
 const max=Math.max(1,...vals.map(x=>x.v)),mes=new Date(y,mo-1,15).toLocaleDateString('pt-BR',{month:'long'});
 return `<section class="hj-line"><div class="hj-linehead"><h2>Linha de ${mes}</h2><span class="caption">barras: vendas do dia · pontos: contas a pagar em aberto · <b>${fmtC(d.mes.v)}</b> até hoje</span></div>
 <div class="hj-days">${vals.map(x=>{const fut=x.k>d.h,hj=x.k===d.h;return `<button class="hj-day ${fut?'fut':''} ${hj?'now':''}" data-nav="${x.p&&!(x.v)?'pagar':'dashboard'}" title="${dataBR(x.k)}${x.v?` · ${money(x.v)} em ${x.q} pedido(s)`:''}${x.p?` · ${x.p.n} conta(s) a pagar: ${money(x.p.v)}`:''}">${x.p?`<i class="hj-due ${x.k<d.h?'late':''}" style="--s:${Math.min(14,6+x.p.n*2)}px"></i>`:''}${x.v&&(x.v===max||hj)?`<em class="hj-vl">${fmtC(x.v).replace('R$ ','')}</em>`:''}<span class="hj-bar" style="height:${x.v?Math.max(4,x.v/max*100):0}%"></span><small>${x.i}</small></button>`}).join('')}</div></section>`}
const spark=(l)=>{const max=Math.max(1,...l),W=120,H=34,pts=l.map((v,i)=>`${(i/(l.length-1)*W).toFixed(1)},${(H-2-v/max*(H-6)).toFixed(1)}`).join(' ');return `<svg class="hj-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="hjg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><polygon points="0,${H} ${pts} ${W},${H}" fill="url(#hjg)"/><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`};
function cartoes(d){const c=(nav,ic,tit,val,sub,extra='',tom='')=>`<button class="hj-card ${tom}" data-nav="${nav}"><span class="hj-cardtop"><span class="hj-ic">${ico(ic,18)}</span>${tit}<em>${ico('arrow',14)}</em></span><strong class="hj-val">${val}</strong><span class="hj-sub">${sub}</span>${extra}</button>`;
 const varM=d.mesAnt.v?((d.mes.v/d.mesAnt.v-1)*100):null,est=window.Estoque?.avisos?.()||[],semNf=db.orders.filter(o=>!o.nf&&o.date>=addDias(d.h,-14)).length,amb=db.gerencial?.fiscal?.ambiente||'homologacao';
 const t=seguro(()=>window.Contab?.tributos?.(d.m),null),prev=d.ant,fechado=db.gerencial?.contabil?.fechados?.[prev],at=window.Atendimento?.abertos?.()||0;
 return `<div class="hj-cards">
 ${c('dashboard','sales','Vendas de hoje',fmtC(d.vh.v),`${d.vh.n} pedido(s) · mês ${fmtC(d.mes.v)}${varM!=null?` <span class="${varM>=0?'green':'red'}">${varM>=0?'▲':'▼'}${Math.abs(varM).toFixed(0)}%</span>`:''}`,spark(d.spark),'hj-accent')}
 ${c('fluxo','wallet','Caixa',fmtC(d.pr.inicial),`menor saldo em 30 dias: <b class="${d.menor.saldo<0?'red':''}">${fmtC(d.menor.saldo)}</b>`)}
 ${c('pagar','calendar','A pagar',fmtC(d.somaT(d.vhj)),d.venc.length?`<span class="red">${d.venc.length} vencido(s) · ${fmtC(d.somaT(d.venc))}</span>`:`hoje · 7 dias: ${fmtC(d.somaT(d.sem))}`,'',d.venc.length?'hj-warn':'')}
 ${c('reconcile','swap','A receber',fmtC(d.receberMk+d.receberVd),`marketplaces ${fmtC(d.receberMk)}${d.receberVd?` · diretas ${fmtC(d.receberVd)}`:''}`)}
 ${c('estoque','box','Estoque',est.length?`${est.length} alerta(s)`:'Em dia',est.length?esc(est[0][2]):'sem rupturas nem compras urgentes','',est.length?'hj-warn':'')}
 ${c('faturamento','receipt','Notas fiscais',semNf?`${semNf} sem nota`:'Em dia',`últimos 14 dias · emissão em ${amb==='producao'?'produção':'homologação'}`,'',semNf?'hj-warn':'')}
 ${c('atendimento','chat','Atendimento',at?`${at} aberto(s)`:'Em dia','mensagens, reclamações e devoluções','',at?'hj-warn':'')}
 ${c('fechcontab','lockbook','Contabilidade',t?fmtC(t.icms+t.difal+t.pis+t.cofins+(t.irpj||0)+(t.csll||0)):'—',`tributos do mês · ${prev.slice(5)}/${prev.slice(0,4)} ${fechado?'<span class="green">fechado</span>':'a fechar'}`)}
 </div>`}
function tarefas(d){return `<section class="hj-todo"><div class="hj-linehead"><h2>Para fazer hoje</h2><span class="badge ${d.avisos.length?'warn':'ok'}">${d.avisos.length?d.avisos.length+' pendência(s)':'Tudo em dia'}</span></div>
 ${d.avisos.length?`<div class="hj-todolist">${d.avisos.slice(0,8).map(([tom,ic,t,s,nav])=>`<button class="hj-task" data-nav="${nav}"><span class="avico ${tom}">${ico(ic,17)}</span><span><strong>${t}</strong><small>${s}</small></span>${ico('arrow',15)}</button>`).join('')}</div>`:'<p class="caption">Nenhuma pendência. Bom trabalho.</p>'}</section>`}
const DESC={ven:'Canais, margem, faturamento, conciliação e pós-venda',est:'Saldo, compras, inventário e separação',fin:'Pagar, receber, bancos e fluxo de caixa',crm:'Clientes, fases, ações e réguas',cad:'Fornecedores, contas, produtos e parâmetros',res:'Contabilidade automática e fechamento',pre:'Formação de preço por canal',rel:'Relatórios financeiros e de vendas'};
function modulos(d){const favs=ler('eb_favmods')||[],M=(E().MODS||[]).filter(m=>m.id!=='ini'&&window.Perfis?.moduloVisivel?.(m.id)!==false);
 const primeira=m=>m.grupos.flatMap(([,l])=>l).find(id=>navItems.some(n=>n[0]===id));
 const stat={ven:()=>`${fmtC(d.mes.v)} no mês`,fin:()=>`${d.ab.length} título(s) em aberto`,est:()=>`${(window.Estoque?.lista?.()||[]).length} produto(s)`,crm:()=>`${(db.crm?.length||Object.keys(db.crm||{}).length||0)} contato(s)`,res:()=>'fechamento pronto para o escritório'};
 const l=[...M].sort((a,b)=>(favs.includes(b.id)?1:0)-(favs.includes(a.id)?1:0));
 return `<section><div class="hj-linehead"><h2>Seus módulos</h2><span class="caption">☆ fixa no começo</span></div><div class="hj-mods">${l.map(m=>`<div class="hj-mod"><button class="hj-fav" data-hj="fav" data-mod="${m.id}" aria-pressed="${favs.includes(m.id)}" aria-label="Favoritar">${favs.includes(m.id)?'★':'☆'}</button>
  <button class="hj-modbody" data-nav="${primeira(m)}"><span class="hj-modart">${ico(m.ic,30)}</span><strong>${m.t}</strong><small>${DESC[m.id]||''}</small><span class="hj-modstat">${seguro(()=>stat[m.id]?.()||'',' ')}</span><span class="hj-go">Acessar ${ico('arrow',14)}</span></button></div>`).join('')}</div></section>`}
function caixa(d){const s=d.pr.serie||[];if(!s.length||!E().graficoCaixa)return '';return `<section class="card"><div class="cardhead"><div><h2>Caixa projetado · próximos 30 dias</h2><p class="caption">Saldo em bancos + repasses previstos dos marketplaces − títulos a pagar. A barra do primeiro dia inclui as contas já vencidas e não pagas.</p></div><div class="legend"><span><i style="background:var(--green)"></i>Entradas</span><span><i style="background:var(--red)"></i>Saídas</span><span><i style="background:var(--accent)"></i>Saldo</span></div></div>${E().graficoCaixa(s)}</section>`}

function view(){const d=dados();return `<div class="hj">${hero(d)}${seguro(()=>window.Rotina?.html?.()||'')}${linhaMes(d)}${cartoes(d)}${seguro(()=>window.Copiloto?.html?.()||'')}<div class="hj-two">${tarefas(d)}${caixa(d)}</div>${modulos(d)}</div>`}
function bind(){seguro(()=>E().bindGrafico?.());const f=$('#hjAsk');if(!f)return;f.onsubmit=e=>{e.preventDefault();perguntar($('#hjQ').value)}}
function perguntar(q){q=String(q||'').trim();if(!q)return;ui.resposta=`<div class="hj-q">${ico('user',14)} ${esc(q)}</div>${responder(q)}`;const a=$('#hjAns');if(a){a.innerHTML=ui.resposta;a.classList.add('on')}const i=$('#hjQ');if(i)i.value=''}

// ─────────── Voz ───────────
let rec=null;
function ouvir(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Este navegador não reconhece voz. Use o Chrome ou o Edge.');$('#hjQ')?.focus();return}
 if(ui.ouvindo){rec?.stop();return}rec=new SR();rec.lang='pt-BR';rec.interimResults=true;rec.maxAlternatives=1;ui.ouvindo=true;estadoVoz();
 rec.onresult=e=>{const t=[...e.results].map(r=>r[0].transcript).join(' ');const i=$('#hjQ');if(i)i.value=t;if(e.results[e.results.length-1].isFinal){perguntar(t)}};
 rec.onend=()=>{ui.ouvindo=false;estadoVoz()};rec.onerror=()=>{ui.ouvindo=false;estadoVoz()};rec.start()}
function estadoVoz(){$('.hj-orb')?.classList.toggle('listen',ui.ouvindo);$('.hj-mic')?.setAttribute('aria-pressed',ui.ouvindo);const s=$('.hj-status');if(s&&ui.ouvindo)s.innerHTML='Ouvindo… pode falar<br><small>toque de novo para parar</small>'}

document.addEventListener('click',e=>{const b=e.target.closest('[data-hj]');if(!b)return;const k=b.dataset.hj;
 if(k==='chip'){const q=b.dataset.q;if(/novo lan/i.test(q)){page='lancamento';render();return}perguntar(q);return}
 if(k==='voz'||k==='orb'){ouvir();return}
 if(k==='painel'){entrarPainel();return}if(k==='sairpainel'){sairPainel();return}
 if(k==='ia'){window.Assistant?.open?.(b.dataset.q);return}
 if(k==='fav'){const f=new Set(ler('eb_favmods')||[]),id=b.dataset.mod;f.has(id)?f.delete(id):f.add(id);gravar('eb_favmods',[...f]);render()}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&page==='central'&&!/input|textarea|select/i.test(document.activeElement?.tagName||'')){e.preventDefault();$('#hjQ')?.focus()}});

// Ícones que a tela usa e ainda não existem.
Object.assign(paths,{mic:'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5 11a7 7 0 0 0 14 0 M12 18v3',arrow:'M5 12h14 M13 6l6 6-6 6',sales:'M3 3v18h18 M7 15l4-4 3 3 5-6',
 chat:'M4 5h16v11H8l-4 4z',user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0'});
for(const [k,v] of Object.entries({wallet:'M3 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 7l12-4v4 M16 13h2',box:'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',receipt:'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',swap:'M7 7h13l-4-4 M17 17H4l4 4',calendar:'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',spark:'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'}))if(!paths[k])paths[k]=v;

// ─────────── Modo painel: tela cheia para TV, atualiza sozinho ───────────
function painelView(){const d=dados(),mesTxt=new Date().toLocaleDateString('pt-BR',{month:'long'}),tk=d.vh.n?d.vh.v/d.vh.n:0;
 const ult=[...db.orders].filter(o=>o.date>=addDias(d.h,-2)).sort((a,b)=>b.date.localeCompare(a.date)||String(b.external?.bling_numero||b.id).localeCompare(String(a.external?.bling_numero||a.id),undefined,{numeric:true})).slice(0,9);
 const COR={'Mercado Livre':'#e6b800','Shopee':'#ee4d2d','Magalu':'#0086ff'},sig=p=>p==='Mercado Livre'?'ML':p.slice(0,2).toUpperCase();
 // Quantidades: itens (unidades) por dia, por canal e por produto.
 const un=o=>(o.items||[]).reduce((s,i)=>s+(Number(i.qty)||0),0),dHoje=db.orders.filter(o=>o.date===d.h),dMes=db.orders.filter(o=>o.date.startsWith(d.m));
 const itensHoje=dHoje.reduce((s,o)=>s+un(o),0),itensMes=dMes.reduce((s,o)=>s+un(o),0);
 const dias14=[...Array(14)].map((_,i)=>{const k=addDias(d.h,i-13),x=d.porDia.get(k)||{v:0,n:0};return {k,v:x.v,n:x.n}}),mx=Math.max(1,...dias14.map(x=>x.v));
 // Madrugada / início do dia sem vendas: canais e mais vendidos mostram ontem, com o rótulo avisando.
 const usaOntem=!dHoje.length,dRef=usaOntem?db.orders.filter(o=>o.date===addDias(d.h,-1)):dHoje,qdo=usaOntem?'ontem':'hoje';
 const canais=[...new Set(dRef.map(o=>o.platform))].map(c=>{const l=dRef.filter(o=>o.platform===c);return {c,n:l.length,u:l.reduce((s,o)=>s+un(o),0),v:l.reduce((s,o)=>s+(Number(o.gross)||0),0)}}).sort((a,b)=>b.v-a.v),mxc=Math.max(1,...canais.map(x=>x.v));
 const pm=new Map();for(const o of dRef)for(const it of o.items||[]){const k=String(it.sku||it.title).trim(),x=pm.get(k)||{t:it.title||k,q:0,v:0};x.q+=Number(it.qty)||0;x.v+=(Number(it.qty)||0)*(Number(it.price)||0);pm.set(k,x)}
 const topP=[...pm].sort((a,b)=>b[1].q-a[1].q||b[1].v-a[1].v).slice(0,6);
 const kp=(t,v,s)=>`<div class="pn-kpi"><small>${t}</small><b>${v}</b><em>${s}</em></div>`;
 return `<div class="pn"><div class="pn-top"><img src="brand/comprastore-logo-240.png" alt="" style="height:56px"><div><h1>${esc(window.Cloud?.wsName||'Compra Store')}</h1><span class="caption">Jarvis ao vivo · atualiza a cada minuto</span></div><button class="pn-voltar" data-hj="sairpainel" title="Voltar ao menu inicial (Esc)">${ico('arrow',16)} Voltar ao início</button><div class="pn-clock"><b id="pnHora">${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</b><small>${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</small></div></div>
 <div class="pn-kpis">${kp('Vendas de hoje',fmtC(d.vh.v),`<b>${d.vh.n}</b> pedidos · <b>${itensHoje}</b> itens · ticket ${money(tk)}`)}${kp(`Vendas de ${mesTxt}`,fmtC(d.mes.v),`<b>${d.mes.n.toLocaleString('pt-BR')}</b> pedidos · <b>${itensMes.toLocaleString('pt-BR')}</b> itens${d.mesAnt.v?` · ${d.mes.v>=d.mesAnt.v?'▲':'▼'} ${Math.abs((d.mes.v/d.mesAnt.v-1)*100).toFixed(0)}%`:''}`)}${kp('Caixa',fmtC(d.pr.inicial),`menor em 30 dias ${fmtC(d.menor.saldo)}`)}${kp('Atenção',String(d.avisos.length),d.avisos[0]?.[2]||'tudo em dia')}</div>
 <div class="pn-canais">${usaOntem&&canais.length?`<p class="caption pn-ontem">Ainda sem vendas hoje · canais e mais vendidos de ontem</p>`:''}${canais.map(x=>`<div class="pn-canal"><span class="plogo" style="background:${COR[x.c]||'#667'}">${sig(x.c)}</span><div><strong>${esc(x.c)}</strong><span class="pn-cbar"><i style="width:${x.v/mxc*100}%;background:${COR[x.c]||'var(--accent)'}"></i></span><small><b>${fmtC(x.v)}</b> · ${x.n} pedidos · ${x.u} itens</small></div></div>`).join('')||'<p class="caption">Nenhuma venda hoje nem ontem.</p>'}</div>
 <div class="pn-mid3"><section class="card"><div class="cardhead"><h2>Últimos 14 dias</h2><span class="caption">${fmtC(dias14.reduce((s,x)=>s+x.v,0))} · ${dias14.reduce((s,x)=>s+x.n,0).toLocaleString('pt-BR')} pedidos</span></div>
  <div class="pn-bars">${dias14.map(x=>`<span class="${x.k===d.h?'now':''}" style="height:${Math.max(2,x.v/mx*100)}%" title="${x.k} · ${money(x.v)} · ${x.n} pedidos"><b>${x.v>=1000?(x.v/1000).toFixed(1).replace('.',',')+' mil':Math.round(x.v)}</b><em>${x.n}</em><small>${x.k.slice(8)}/${x.k.slice(5,7)}</small></span>`).join('')}</div><p class="caption" style="margin-top:26px">Valor no topo de cada barra · número de pedidos dentro da barra.</p></section>
 <section class="card"><div class="cardhead"><h2>Mais vendidos ${qdo}</h2><span class="caption">unidades</span></div><div class="pn-tops">${topP.map(([k,x],i)=>`<div class="pn-prod"><span class="pn-rank">${i+1}</span>${window.Estoque?.foto?.(k)||''}<span><strong>${esc(x.t)}</strong><small>${fmtC(x.v)}</small></span><b>${x.q}<small>un.</small></b></div>`).join('')||'<p class="caption">Sem itens vendidos ${qdo}.</p>'}</div></section>
 <section class="card"><div class="cardhead"><h2>Pedidos recentes</h2><span class="badge ok">ao vivo</span></div><div class="pn-feed">${ult.slice(0,7).map((o,i)=>`<div class="pn-order" style="animation-delay:${i*.06}s"><span class="plogo" style="background:${COR[o.platform]||'#667'}">${sig(o.platform)}</span><span><strong>${esc(o.items?.[0]?.title||'Pedido '+o.id)}</strong><small>${un(o)} item(ns) · ${esc(o.customer?.city||'')}${o.state?'/'+esc(o.state):''} · ${new Date(o.date+'T12:00:00').toLocaleDateString('pt-BR')}</small></span><b>${money(o.gross)}</b></div>`).join('')||'<p class="caption">Sem pedidos nos últimos dias.</p>'}</div></section></div>
 <button class="small pn-exit" data-hj="sairpainel">${ico('arrow',14)} Sair do painel (Esc)</button></div>`}
let pnTimer=null;
function painelBind(){clearInterval(pnTimer);let n=0;pnTimer=setInterval(()=>{if(page!=='painel'){clearInterval(pnTimer);return}const h=$('#pnHora');if(h)h.textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});if(++n%60===0)render()},1000)}
function entrarPainel(){try{closeModal()}catch{}try{history.replaceState(null,'',location.pathname+location.search+'#painel')}catch{}navigate('painel');try{document.documentElement.requestFullscreen?.()}catch{}}
function sairPainel(){try{if(document.fullscreenElement)document.exitFullscreen()}catch{}try{history.replaceState(null,'',location.pathname+location.search+'#central')}catch{}navigate('central')}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&page==='painel')sairPainel()});
let pnCheio=false;document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement){pnCheio=true;return}if(pnCheio&&page==='painel'){pnCheio=false;sairPainel()}pnCheio=false});
addPage('painel','grid','Modo painel',painelView,'Painel ao vivo para TV.','',painelBind);
// Fica na lista de páginas (o roteador exige), mas fora do menu: só abre pelo botão, pelo Ctrl K ou pelo chip.

// Registra a tela no lugar da Central do dia.
addPage('central','home','Hoje',view,'Seu dia no Jarvis: o que entrou, o que sai e o que precisa de você.','',bind);
{const ids=navItems.map(n=>n[0]);const ult=ids.lastIndexOf('central');if(ids.indexOf('central')!==ult)navItems.splice(ult,1);const n=navItems.find(x=>x[0]==='central');if(n)n[2]='Hoje'}
const shell0=shell;shell=function(){const r=shell0.apply(this,arguments);document.body.classList.toggle('pg-home',page==='central');document.body.classList.toggle('painel',page==='painel');return r};
window.Hoje={dados:()=>seguro(()=>dados(),null),perguntar,responder,regra:q=>String(q||'').trim().length>3?seguro(()=>responder(q,true),null):null};
})();
