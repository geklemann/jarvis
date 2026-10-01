'use strict';
// Estoque pensado para e-commerce: posição com cobertura em dias (pelo ritmo real de vendas de cada canal),
// ruptura, excesso e parado, curva ABC, sugestão de compras por fornecedor e ficha do produto com kardex
// (entradas pelas notas, saídas pelas vendas, ajustes). Saldo e custo vêm do Bling enquanto ele for o
// sistema de estoque; parâmetros de reposição são da equipe e ficam no Jarvis.
(()=>{
Object.assign(paths,{box:paths.box||'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',cart:'M3 4h2l2.4 11h11L21 7H6.2 M9 20h.01 M18 20h.01',
 truck:'M3 6h11v10H3z M14 10h4l3 3v3h-7 M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'});
const st={modo:(()=>{try{return localStorage.getItem('eb_est_modo')||'galeria'}catch{return 'galeria'}})(),lista:[],carregado:false,carregando:false,erro:'',info:null,filtro:'todos',busca:'',abc:'',ordem:'status',pag:0,alvo:45,seguranca:7,prazoPadrao:20};
window.Reiniciar?.registrar(st,['filtro','busca','abc','ordem','pag']); // estado de tela: volta ao original ao clicar no menu
try{Object.assign(st,JSON.parse(localStorage.getItem('eb_estoque_param')||'{}'))}catch{}
const salvarParam=()=>{try{localStorage.setItem('eb_estoque_param',JSON.stringify({alvo:st.alvo,seguranca:st.seguranca,prazoPadrao:st.prazoPadrao}))}catch{}};
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const menosDias=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toLocaleDateString('sv-SE')};
const nf=(v,d=0)=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d});
const dataBR=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'—';

async function carregar(){if(!window.Cloud?.ws||st.carregando)return;st.carregando=true;
 try{const [p,i]=await Promise.all([Cloud.client.from('produtos').select('*').eq('workspace_id',Cloud.ws).limit(5000),Cloud.client.from('integrations').select('settings').eq('workspace_id',Cloud.ws).eq('provider','bling').maybeSingle()]);
  if(p.error)throw p.error;st.lista=p.data||[];st.info=i.data?.settings?.estoque||null;st.erro='';st.carregado=true;cache=null}catch(e){st.erro=e.message||String(e);st.carregado=true}finally{st.carregando=false}
 if(['estoque','estcompras','central','dashboard','painel','sazonal','crmprodutos','separacao','pedcompra','catalogo'].includes(page)&&!document.querySelector('.modalback'))render()}
async function fn(action,body){const r=await Cloud.client.functions.invoke('integrations',{body:{workspace_id:Cloud.ws,action,...body}});if(r.error){let msg=r.error.message;try{msg=(await r.error.context.json()).error||msg}catch{}throw Error(msg)}return r.data}

// ─────────── Vendas por SKU (dos pedidos) e compras (das notas de entrada) ───────────
let cache=null;
// Quanto comprar: cobre o prazo de reposição + a cobertura alvo + o estoque de segurança, descontando o saldo e o que
// já foi pedido ao fornecedor e ainda não chegou (senão a sugestão pediria de novo a mercadoria que está a caminho).
const sugestao=({media,prazo,alvo,minimo,saldo,emPedido=0})=>Math.max(0,Math.ceil(media*(prazo+alvo)+minimo-saldo-emPedido));
function base(){const vpc=window.Estoque2?.versao?.()||0;if(cache&&cache.n===db.orders.length&&cache.p===st.lista.length&&cache.pc===vpc)return cache.v;
 const emAberto=window.Estoque2?.emAberto?.()||new Map();
 const d30=menosDias(30),d60=menosDias(60),d90=menosDias(90),d180=menosDias(180),vendas=new Map(),compras=new Map();
 const V=sku=>vendas.get(sku)||(vendas.set(sku,{q30:0,q60:0,q90:0,r90:0,q180:0,ultima:'',canais:{},semanas:new Array(12).fill(0)}),vendas.get(sku));
 const sem0=new Date(hoje()+'T12:00:00');
 for(const o of db.orders){if(o.date<d180)continue;for(const it of o.items||[]){const sku=String(it.sku||'').trim();if(!sku)continue;const v=V(sku),q=Number(it.qty)||0;
  v.q180+=q;if(o.date>=d90){v.q90+=q;v.r90+=q*(Number(it.price)||0)}if(o.date>=d60)v.q60+=q;if(o.date>=d30){v.q30+=q;v.canais[o.platform]=(v.canais[o.platform]||0)+q}if(o.date>v.ultima)v.ultima=o.date;
  const w=Math.floor((sem0-new Date(o.date+'T12:00:00'))/(7*864e5));if(w>=0&&w<12)v.semanas[11-w]+=q}}
 for(const n of db.purchases||[]){if(n.tipo&&n.tipo!=='compra')continue;for(const it of n.itens||[]){const sku=String(it.sku||'').trim();if(!sku)continue;const c=compras.get(sku)||{ultima:'',fornecedor:'',qtd:0,custo:0,n:0};
  c.n++;c.qtd+=Number(it.qtd)||0;if((n.emissao||'')>=c.ultima){c.ultima=n.emissao||'';c.fornecedor=n.fornecedor||'';c.custo=Number(it.valor)||c.custo}compras.set(sku,c)}}
 const custoPreco=new Map((db.products||[]).map(p=>[p.id,p.custo]));
 const linhas=st.lista.filter(p=>!p.ignorar&&p.formato!=='V').map(p=>{const v=vendas.get(p.id)||{q30:0,q60:0,q90:0,r90:0,q180:0,ultima:'',canais:{},semanas:new Array(12).fill(0)},c=compras.get(p.id);
  // Ritmo: média ponderada (últimos 30 dias pesam o dobro) para reagir a tendência sem perder estabilidade.
  const media=(v.q30/30*2+v.q60/60)/3,saldo=Number(p.saldo)||0,custo=Number(p.custo)||Number(custoPreco.get(p.id))||c?.custo||0,cobertura=media>0?saldo/media:(saldo>0?Infinity:0);
  const prazo=p.prazo_reposicao??st.prazoPadrao,minimo=Number(p.minimo)||Math.ceil(media*st.seguranca),ponto=Math.ceil(media*prazo+minimo);
  const emPedido=emAberto.get(p.id)||0,sugerida=sugestao({media,prazo,alvo:st.alvo,minimo,saldo,emPedido});
  let status='ok';if(saldo<=0&&v.q60>0)status='ruptura';else if(media>0&&saldo+emPedido<=ponto)status='comprar';else if(saldo>0&&v.q60===0)status='parado';else if(media>0&&cobertura>st.alvo*3)status='excesso';else if(saldo<=0)status='zerado';
  return {p,sku:p.id,nome:p.nome,saldo,custo,valor:Math.max(0,saldo)*custo,preco:Number(p.preco)||0,media,cobertura,prazo,minimo,ponto,sugerida,emPedido,status,v,c,fornecedor:p.fornecedor||c?.fornecedor||''}});
 // Curva ABC pela receita de 90 dias.
 const tot=linhas.reduce((s,l)=>s+l.v.r90,0);let acc=0;for(const l of [...linhas].sort((a,b)=>b.v.r90-a.v.r90)){acc+=l.v.r90;l.abc=!l.v.r90?'C':acc<=tot*.8?'A':acc<=tot*.95?'B':'C'}
 cache={n:db.orders.length,p:st.lista.length,pc:vpc,v:{linhas,vendas}};return cache.v}
// Sugestão agrupada por fornecedor (um pedido de compra por fornecedor), maior valor primeiro.
const SEM_FORN='Sem fornecedor definido';
function gruposCompra(){const {linhas}=base(),l=linhas.filter(x=>['ruptura','comprar'].includes(x.status)&&x.sugerida>0),por=new Map();
 for(const x of l){const f=x.fornecedor||SEM_FORN;(por.get(f)||por.set(f,[]).get(f)).push(x)}
 return [...por].map(([f,it])=>({f,semForn:f===SEM_FORN,it:it.sort((a,b)=>a.cobertura-b.cobertura),total:it.reduce((s,x)=>s+x.sugerida*x.custo,0),
  itens:it.map(x=>({sku:x.sku,nome:x.nome,qtd:x.sugerida,custo:Math.round(x.custo*100)/100,recebido:0}))})).sort((a,b)=>b.total-a.total)}
const STATUS={ruptura:['Ruptura','bad','Sem saldo e vendendo: venda perdida todo dia'],comprar:['Comprar','warn','Abaixo do ponto de pedido'],ok:['Saudável','ok','Cobertura dentro do alvo'],excesso:['Excesso','info','Mais de 3× a cobertura alvo'],parado:['Parado','','Com saldo e sem venda há 60 dias'],zerado:['Zerado','','Sem saldo e sem venda recente']};
const cob=l=>l.cobertura===Infinity?'∞':l.media?`${nf(l.cobertura)} d`:'—';
function spark(s){const m=Math.max(1,...s),W=84,H=22;return `<svg viewBox="0 0 ${W} ${H}" class="spark" aria-hidden="true"><polyline points="${s.map((x,i)=>`${i*(W/(s.length-1))},${H-2-(x/m)*(H-4)}`).join(' ')}"/></svg>`}

// ─────────── Posição de estoque ───────────
function posicaoView(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver o estoque.</div>';if(!st.carregado){carregar();return '<div class="empty">Carregando produtos…</div>'}
 const {linhas}=base(),cont=k=>linhas.filter(l=>l.status===k).length,soma=f=>linhas.reduce((s,l)=>s+f(l),0);
 const valor=soma(l=>l.valor),parado=soma(l=>l.status==='parado'?l.valor:0),perdaDia=soma(l=>l.status==='ruptura'?l.media*l.preco:0);
 const vendidos=linhas.filter(l=>l.media>0&&l.saldo>0),cobMedia=vendidos.length?vendidos.reduce((s,l)=>s+Math.min(l.cobertura,365)*l.valor,0)/Math.max(1,vendidos.reduce((s,l)=>s+l.valor,0)):0;
 const kpi=(k,t,v,s,tom)=>`<button class="card kpi kpibtn ${st.filtro===k?'on':''}" data-est-filtro="${k}"><span class="kpil">${t}</span><span class="kpiv ${tom||''}">${v}</span><span class="kpis">${s}</span></button>`;
 const q=normalized(st.busca);let l=linhas.filter(x=>(st.filtro==='todos'||x.status===st.filtro)&&(!st.abc||x.abc===st.abc)&&(!q||normalized(x.sku+' '+x.nome+' '+x.fornecedor).includes(q)));
 const ORD={status:(a,b)=>Object.keys(STATUS).indexOf(a.status)-Object.keys(STATUS).indexOf(b.status)||b.v.r90-a.v.r90,cobertura:(a,b)=>(a.cobertura===Infinity?1e9:a.cobertura)-(b.cobertura===Infinity?1e9:b.cobertura),valor:(a,b)=>b.valor-a.valor,vendas:(a,b)=>b.v.q30-a.v.q30,nome:(a,b)=>a.nome.localeCompare(b.nome)};l.sort(ORD[st.ordem]||ORD.status);
 const POR=60,pags=Math.max(1,Math.ceil(l.length/POR));st.pag=Math.min(st.pag,pags-1);
 return `<div class="grid kpis4">${kpi('todos','Valor em estoque (custo)',money(valor),`${nf(linhas.filter(x=>x.saldo>0).length)} SKUs com saldo · cobertura média ${nf(cobMedia)} dias`)}${kpi('ruptura','Ruptura',cont('ruptura'),perdaDia?`~${money(perdaDia)}/dia em vendas perdidas`:'Nenhum item vendendo sem saldo',cont('ruptura')?'red':'')}${kpi('comprar','Comprar agora',cont('comprar'),'Abaixo do ponto de pedido',cont('comprar')?'gold':'')}${kpi('parado','Parado (60 dias)',money(parado),`${cont('parado')} SKU(s) sem venda`)}</div>
 <div class="crmbar"><div class="segtabs">${[['todos','Todos'],...Object.entries(STATUS).map(([k,[t]])=>[k,t])].map(([k,t])=>`<button class="${st.filtro===k?'active':''}" data-est-filtro="${k}">${t} <small>${k==='todos'?linhas.length:cont(k)}</small></button>`).join('')}</div>
  <div class="searchin">${icon('search')}<input type="search" id="estBusca" placeholder="SKU, produto ou fornecedor…" value="${esc(st.busca)}"></div>
  <select data-est="abc" aria-label="Curva ABC"><option value="">Curva ABC: todas</option>${['A','B','C'].map(x=>`<option ${st.abc===x?'selected':''}>${x}</option>`).join('')}</select>
  <select data-est="ordem" aria-label="Ordenar">${[['status','Ordenar: prioridade'],['cobertura','Menor cobertura'],['valor','Maior valor parado'],['vendas','Mais vendidos'],['nome','Nome']].map(([k,t])=>`<option value="${k}" ${st.ordem===k?'selected':''}>${t}</option>`).join('')}</select>
  <div class="segtabs estmodo"><button class="${st.modo==='galeria'?'active':''}" data-est-modo="galeria" aria-label="Galeria">${icon('grid')}</button><button class="${st.modo==='lista'?'active':''}" data-est-modo="lista" aria-label="Lista">${icon('menu')}</button></div><button class="small" data-est="sync">${icon('refresh')} Atualizar do Bling</button>${window.Expedicao?.podeLancar()?`<button class="small" data-lc-abrir="">${icon('box')} Lançar estoque</button>`:''}<button class="small quiet" data-est="params">${icon('filter')} Parâmetros</button><button class="small quiet" data-est="csv">${icon('download')} Exportar</button></div>
 <p class="caption" style="margin:-6px 0 14px">Saldo e custo do Bling${st.info?.fim?` · atualizado ${new Date(st.info.fim).toLocaleString('pt-BR')}`:''} (a cada hora). Ritmo de venda = média dos últimos 30 dias com peso dobrado + 60 dias. Cobertura alvo ${st.alvo} dias, segurança ${st.seguranca} dias, prazo de reposição padrão ${st.prazoPadrao} dias.</p>
 ${st.erro?`<div class="notice warnbox">${esc(st.erro)}</div>`:''}
 ${st.modo==='galeria'?`<div class="estgal">${l.slice(st.pag*POR,st.pag*POR+POR).map(x=>{const [t,tom]=STATUS[x.status],cb=x.cobertura===Infinity?100:Math.min(100,x.cobertura/(st.alvo*1.5)*100);return `<button class="estcard ${x.status}" data-est-ficha="${esc(x.sku)}">
  <span class="estfoto">${x.p.imagem?`<img src="${esc(x.p.imagem)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('semfoto');this.remove()">`:icon('box')}<span class="badge ${tom}">${t}</span><em class="estabc abc${x.abc}">${x.abc}</em></span>
  <span class="estinfo"><strong>${esc(x.nome)}</strong><small class="mono">${esc(x.sku)}</small>
  <span class="estnums"><span><b class="${x.saldo<=0?'red':''}">${nf(x.saldo)}</b><small>em estoque</small></span><span><b>${nf(x.v.q30)}</b><small>vendas 30d</small></span><span><b>${cob(x)}</b><small>cobertura</small></span></span>
  <span class="estcob" title="Cobertura ${cob(x)} · alvo ${st.alvo} dias"><i style="width:${cb}%"></i></span>
  <span class="estfoot">${spark(x.v.semanas)}${x.sugerida&&['ruptura','comprar'].includes(x.status)?`<span class="estbuy">comprar ${nf(x.sugerida)}</span>`:`<span class="caption">${money(x.valor)}</span>`}</span></span></button>`}).join('')||'<div class="empty">Nenhum produto neste filtro.</div>'}</div>
 ${pags>1?`<div class="tabletop"><span class="caption">${l.length} produto(s)</span><div class="row"><button class="small" data-est-pag="-1" ${st.pag?'':'disabled'}>‹</button><span class="caption">página ${st.pag+1} de ${pags}</span><button class="small" data-est-pag="1" ${st.pag<pags-1?'':'disabled'}>›</button></div></div>`:''}`:`<div class="tablebox"><div class="tablewrap"><table class="esttable"><thead><tr><th>Produto</th><th>Situação</th><th class="num">Saldo</th><th class="num">Vendas 30d</th><th>12 semanas</th><th class="num">Ritmo/dia</th><th class="num">Cobertura</th><th class="num">Comprar</th><th class="num">Custo</th><th class="num">Valor</th><th>ABC</th></tr></thead><tbody>
 ${l.slice(st.pag*POR,st.pag*POR+POR).map(x=>{const [t,tom]=STATUS[x.status];return `<tr class="clickrow" data-est-ficha="${esc(x.sku)}"><td><div class="estprod">${x.p.imagem?`<img src="${esc(x.p.imagem)}" alt="" loading="lazy">`:`<span class="estimg">${icon('box')}</span>`}<span><strong>${esc(x.nome)}</strong><br><span class="caption mono">${esc(x.sku)}</span></span></div></td><td><span class="badge ${tom}">${t}</span></td><td class="num ${x.saldo<=0?'red':''}">${nf(x.saldo)}</td><td class="num">${nf(x.v.q30)}</td><td>${spark(x.v.semanas)}</td><td class="num">${nf(x.media,1)}</td><td class="num">${cob(x)}</td><td class="num">${x.sugerida&&['ruptura','comprar'].includes(x.status)?`<strong>${nf(x.sugerida)}</strong>`:'—'}</td><td class="num">${x.custo?money(x.custo):'—'}</td><td class="num">${money(x.valor)}</td><td><span class="badge ${x.abc==='A'?'ok':x.abc==='B'?'info':''}">${x.abc}</span></td></tr>`}).join('')||'<tr><td colspan="11" class="empty">Nenhum produto neste filtro.</td></tr>'}</tbody></table></div>
 ${pags>1?`<div class="tabletop"><span class="caption">${l.length} produto(s)</span><div class="row"><button class="small" data-est-pag="-1" ${st.pag?'':'disabled'}>‹</button><span class="caption">página ${st.pag+1} de ${pags}</span><button class="small" data-est-pag="1" ${st.pag<pags-1?'':'disabled'}>›</button></div></div>`:''}</div>`}`}

// ─────────── Sugestão de compras ───────────
function comprasView(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal.</div>';if(!st.carregado){carregar();return '<div class="empty">Carregando produtos…</div>'}
 const E2=window.Estoque2;if(E2&&!E2.pronto())E2.carregar();
 const grupos=gruposCompra(),l=grupos.flatMap(g=>g.it),comForn=grupos.filter(g=>!g.semForn),emPed=base().linhas.filter(x=>x.emPedido>0);
 return `<div class="notice">Quantidade sugerida = ritmo de venda × (prazo de reposição + ${st.alvo} dias de cobertura) + estoque de segurança − saldo atual − o que já foi pedido e está a caminho. O fornecedor vem do cadastro do produto ou da última nota de entrada. Ajuste prazo e mínimo de cada produto na ficha.</div>
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Itens para comprar</span><span class="kpiv">${l.length}</span><span class="kpis">${l.filter(x=>x.status==='ruptura').length} já em ruptura</span></div><div class="card kpi"><span class="kpil">Investimento sugerido</span><span class="kpiv">${money(grupos.reduce((s,g)=>s+g.total,0))}</span><span class="kpis">A custo de compra</span></div><div class="card kpi"><span class="kpil">A caminho</span><span class="kpiv">${emPed.length}</span><span class="kpis">produto(s) em pedidos enviados · já descontados</span></div><div class="card kpi"><span class="kpil">Cobertura alvo</span><span class="kpiv">${st.alvo} d</span><span class="kpis"><button class="small quiet" data-est="params">Alterar</button></span></div></div>
 ${comForn.length?`<div class="crmbar"><button class="primary" data-est-gerartodos="1">${icon('cart')} Gerar os pedidos de compra de ${comForn.length} fornecedor(es) · ${money(comForn.reduce((s,g)=>s+g.total,0))}</button><span class="caption">Cria um rascunho por fornecedor (ou atualiza o rascunho que já existe). Você confere e envia cada um por e-mail em Pedidos de compra.${grupos.some(g=>g.semForn)?' Itens sem fornecedor ficam de fora: defina o fornecedor na ficha do produto.':''}</span></div>`:''}
 ${grupos.map((g,gi)=>{const ra=E2?.rascunhoDe?.(g.f);return `<div class="tablebox" style="margin-bottom:16px"><div class="tabletop"><div><h2>${esc(g.f)}</h2><p class="caption">${g.it.length} item(ns) · ${money(g.total)}${ra?` · rascunho nº ${ra.numero} já aberto <button class="small quiet" data-pc-abrir="${esc(ra.id)}">Abrir</button>`:''}</p></div><div class="row">${g.semForn?'':`<button class="small primary" data-est-gerarpc="${esc(JSON.stringify(g.itens))}" data-forn="${esc(g.f)}">${icon(ra?'refresh':'plus')} ${ra?`Atualizar rascunho nº ${ra.numero}`:'Criar pedido de compra'}</button>`}<button class="small" data-est-pedido="${gi}">${icon('download')} Planilha</button></div></div><div class="tablewrap"><table><thead><tr><th>Produto</th><th>Situação</th><th class="num">Saldo</th><th class="num">Em pedido</th><th class="num">Ritmo/dia</th><th class="num">Cobertura</th><th class="num">Prazo</th><th class="num">Comprar</th><th class="num">Custo</th><th class="num">Total</th><th>Última compra</th></tr></thead><tbody>
  ${g.it.map(x=>{const [t,tom]=STATUS[x.status];return `<tr class="clickrow" data-est-ficha="${esc(x.sku)}"><td class="comfoto">${window.Estoque?.foto?.(x.sku)||''}<strong>${esc(x.nome)}</strong><br><span class="caption mono">${esc(x.sku)}</span></td><td><span class="badge ${tom}">${t}</span></td><td class="num">${nf(x.saldo)}</td><td class="num">${x.emPedido?nf(x.emPedido):'—'}</td><td class="num">${nf(x.media,1)}</td><td class="num">${cob(x)}</td><td class="num">${x.prazo} d</td><td class="num"><strong>${nf(x.sugerida)}</strong></td><td class="num">${money(x.custo)}</td><td class="num">${money(x.sugerida*x.custo)}</td><td>${x.c?.ultima?dataBR(x.c.ultima):'—'}</td></tr>`}).join('')}</tbody></table></div></div>`}).join('')||'<div class="card empty">Nada para comprar agora. ✓</div>'}`}

// ─────────── Ficha do produto ───────────
function ficha(sku){const {linhas}=base(),x=linhas.find(l=>l.sku===sku);if(!x)return;const p=x.p,[t,tom,desc]=STATUS[x.status];
 const mov=[];for(const n of db.purchases||[])for(const it of n.itens||[])if(String(it.sku||'').trim()===sku)mov.push({d:n.emissao,tipo:n.tipo==='devolucao'?'Devolução (nota)':'Entrada (nota)',q:Number(it.qtd)||0,ref:`NF ${n.numero||''} · ${n.fornecedor||''}`,v:Number(it.valor)||0});
 for(const o of db.orders)for(const it of o.items||[])if(String(it.sku||'').trim()===sku&&o.date>=menosDias(120))mov.push({d:o.date,tipo:`Venda · ${o.platform}`,q:-(Number(it.qty)||0),ref:`Pedido ${o.id}`,v:Number(it.price)||0});
 mov.sort((a,b)=>String(b.d).localeCompare(String(a.d)));const margem=x.preco&&x.custo?(x.preco-x.custo)/x.preco:null;
 modal(`${x.nome}`,`<div class="estficha">${p.imagem?`<img src="${esc(p.imagem)}" alt="">`:''}<div><p class="caption mono">${esc(sku)}${p.bling_id?` · Bling ${esc(p.bling_id)}`:''}</p><p><span class="badge ${tom}">${t}</span> <span class="caption">${desc}</span></p>
  <div class="grid three minis"><div><small>Saldo</small><strong class="${x.saldo<=0?'red':''}">${nf(x.saldo)}</strong><small>ponto de pedido ${nf(x.ponto)}</small></div><div><small>Ritmo</small><strong>${nf(x.media,1)}/dia</strong><small>${nf(x.v.q30)} em 30 d · ${nf(x.v.q90)} em 90 d</small></div><div><small>Cobertura</small><strong>${cob(x)}</strong><small>${x.v.ultima?'última venda '+dataBR(x.v.ultima):'sem venda recente'}</small></div></div>
  <div class="grid three minis"><div><small>Custo</small><strong>${x.custo?money(x.custo):'—'}</strong><small>valor em estoque ${money(x.valor)}</small></div><div><small>Preço base (Bling)</small><strong>${x.preco?money(x.preco):'—'}</strong><small>${x.preco&&Math.abs(x.preco-x.custo)<0.01?'igual ao custo · o preço de venda é o de cada canal (Produtos e anúncios)':margem!=null?`margem bruta ${nf(margem*100,1)}%`:''}</small></div><div><small>Canais (30 d)</small><strong>${Object.entries(x.v.canais).map(([c,q])=>`${esc(c)} ${nf(q)}`).join(' · ')||'—'}</strong><small>curva ${x.abc}</small></div></div></div></div>
 <div class="navlabel" style="margin:16px 0 8px">Reposição (definido pela equipe)</div>
 <div class="grid three"><div><label for="efMin">Estoque de segurança</label><input id="efMin" type="number" min="0" value="${p.minimo??''}" placeholder="auto: ${nf(Math.ceil(x.media*st.seguranca))}"></div><div><label for="efPrazo">Prazo de reposição (dias)</label><input id="efPrazo" type="number" min="0" value="${p.prazo_reposicao??''}" placeholder="padrão: ${st.prazoPadrao}"></div><div><label for="efForn">Fornecedor</label><input id="efForn" value="${esc(p.fornecedor||'')}" placeholder="${esc(x.c?.fornecedor||'')}"></div></div>
 <div class="grid three"><div><label for="efLoc">Localização</label><input id="efLoc" value="${esc(p.localizacao||'')}" placeholder="Ex.: Rua B, prateleira 3"></div><div style="grid-column:span 2"><label for="efObs">Observação</label><input id="efObs" value="${esc(p.observacao||'')}"></div></div>
 <label class="check-l"><input type="checkbox" class="check" id="efIgn" ${p.ignorar?'checked':''}> Ignorar no estoque (produto descontinuado, brinde, kit virtual)</label>
 <div class="navlabel" style="margin:16px 0 8px">Movimentações (entradas por nota e vendas dos últimos 120 dias)</div>
 <div class="tablewrap" style="max-height:260px"><table><thead><tr><th>Data</th><th>Movimento</th><th>Referência</th><th class="num">Qtd.</th><th class="num">Unitário</th></tr></thead><tbody>${mov.slice(0,300).map(m=>`<tr><td>${dataBR(m.d)}</td><td>${esc(m.tipo)}</td><td class="caption">${esc(m.ref)}</td><td class="num ${m.q<0?'red':'green'}">${m.q>0?'+':''}${nf(m.q)}</td><td class="num">${money(m.v)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Sem movimentos.</td></tr>'}</tbody></table></div>
 <div class="modalfoot"><button data-action="close">Fechar</button>${window.Kardex?`<button data-kx-sku="${esc(sku)}">${icon('kardex')} Movimentação completa</button>`:''}${p.bling_id&&window.Expedicao?.podeLancar()?`<button data-lc-abrir="${esc(sku)}">${icon('box')} Lançar estoque</button>`:''}<button class="primary" data-est-salvar="${esc(sku)}">${icon('check')} Salvar</button></div>`)}
function parametros(){modal('Parâmetros de reposição',`<p class="caption" style="margin-top:-10px">Valem para todos os produtos que não têm valor próprio na ficha. Ficam salvos neste navegador.</p>
 <div class="grid three"><div><label for="epAlvo">Cobertura alvo (dias)</label><input id="epAlvo" type="number" min="7" value="${st.alvo}"></div><div><label for="epSeg">Segurança (dias de venda)</label><input id="epSeg" type="number" min="0" value="${st.seguranca}"></div><div><label for="epPrazo">Prazo de reposição padrão</label><input id="epPrazo" type="number" min="0" value="${st.prazoPadrao}"></div></div>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-est="salvar-params">${icon('check')} Aplicar</button></div>`)}
function csv(nome,cab,linhas){const txt=[cab,...linhas].map(l=>l.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+txt],{type:'text/csv'}));a.download=nome;a.click()}

document.addEventListener('click',async e=>{const b=e.target.closest('[data-est],[data-est-modo],[data-est-filtro],[data-est-ficha],[data-est-salvar],[data-est-pag],[data-est-pedido]');if(!b)return;const d=b.dataset;
 if(d.estModo){st.modo=d.estModo;try{localStorage.setItem('eb_est_modo',st.modo)}catch{}render();return}
 if(d.estFiltro){st.filtro=d.estFiltro;st.pag=0;if(page!=='estoque')navigate('estoque');else render();return}
 if(d.estFicha){ficha(d.estFicha);return}
 if(d.estPag){st.pag+=Number(d.estPag);render();return}
 if(d.estPedido!==undefined){const g=gruposCompra()[Number(d.estPedido)];if(!g)return;
  csv(`pedido-${normalized(g.f).replace(/[^a-z0-9]+/g,'-').slice(0,40)}-${hoje()}.csv`,['SKU','Produto','Quantidade','Custo unitário','Total'],g.it.map(x=>[x.sku,x.nome,x.sugerida,x.custo.toFixed(2).replace('.',','),(x.sugerida*x.custo).toFixed(2).replace('.',',')]));return}
 if(d.estSalvar){const num=v=>v===''?null:Number(v);const campos={minimo:num($('#efMin').value),prazo_reposicao:num($('#efPrazo').value),fornecedor:$('#efForn').value.trim()||null,localizacao:$('#efLoc').value.trim()||null,observacao:$('#efObs').value.trim()||null,ignorar:$('#efIgn').checked,updated_at:new Date().toISOString()};
  const {error}=await Cloud.client.from('produtos').update(campos).eq('workspace_id',Cloud.ws).eq('id',d.estSalvar);if(error){toast(error.message);return}Object.assign(st.lista.find(p=>p.id===d.estSalvar)||{},campos);cache=null;closeModal();toast('Produto atualizado.');render();return}
 switch(d.est){
  case 'sync':b.disabled=true;b.innerHTML=`${icon('refresh')} Lendo o Bling…`;try{const r=await fn('estoque_sync',{});toast(`${r.produtos} produto(s) atualizados do Bling.`)}catch(x){toast(x.message)}st.carregado=false;await carregar();break;
  case 'params':parametros();break;
  case 'salvar-params':st.alvo=Math.max(7,Number($('#epAlvo').value)||45);st.seguranca=Math.max(0,Number($('#epSeg').value)||0);st.prazoPadrao=Math.max(0,Number($('#epPrazo').value)||0);salvarParam();cache=null;closeModal();render();break;
  case 'csv':{const {linhas}=base();csv(`estoque-${hoje()}.csv`,['SKU','Produto','Situação','Saldo','Vendas 30d','Ritmo/dia','Cobertura (dias)','Comprar','Custo','Valor','ABC','Fornecedor'],linhas.map(x=>[x.sku,x.nome,STATUS[x.status][0],x.saldo,x.v.q30,x.media.toFixed(2).replace('.',','),x.cobertura===Infinity?'':Math.round(x.cobertura),x.sugerida,x.custo.toFixed(2).replace('.',','),x.valor.toFixed(2).replace('.',','),x.abc,x.fornecedor]));break}}
});
document.addEventListener('change',e=>{const s=e.target.closest('[data-est]');if(s&&s.tagName==='SELECT'){st[s.dataset.est]=s.value;st.pag=0;render()}});
function bind(){const i=$('#estBusca');if(i)i.oninput=e=>{st.busca=e.target.value;st.pag=0;const pos=e.target.selectionStart;render();const n=$('#estBusca');n.focus();n.setSelectionRange(pos,pos)}}
addPage('estoque','box','Posição de estoque',posicaoView,'Saldo, ritmo de venda, cobertura em dias, ruptura, excesso e parado — produto a produto.','',bind);
addPage('estcompras','cart','Sugestão de compras',comprasView,'O que comprar, quanto e de quem — calculado pelo ritmo de venda e pelo prazo de reposição.','',bind);
// Avisos: ruptura no sino e na Central do dia.
let fotoMap=null,fotoN=-1;
function foto(sku){if(fotoN!==st.lista.length){fotoMap=new Map(st.lista.map(p=>[String(p.id).trim(),p.imagem]));fotoN=st.lista.length}const u=fotoMap.get(String(sku||'').trim());
 return `<span class="pfoto">${u?`<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">`:''}</span>`}
window.Estoque={foto,carregar,sugestao,gruposCompra,lista:()=>st.lista,recalc:()=>{cache=null},avisos:()=>{if(!st.carregado)return [];const {linhas}=base(),r=linhas.filter(l=>l.status==='ruptura'),c=linhas.filter(l=>l.status==='comprar');const out=[];
 if(r.length)out.push(['bad','box',`${r.length} produto(s) em ruptura`,'Vendendo sem saldo — reponha','estoque']);if(c.length)out.push(['warn','cart',`${c.length} produto(s) para comprar`,'Abaixo do ponto de pedido','estcompras']);return out}};
let ultimoWs=null;setInterval(()=>{if(window.Cloud?.ws&&Cloud.ws!==ultimoWs&&db.orders?.length){ultimoWs=Cloud.ws;st.carregado=false;carregar()}},2000);
})();
