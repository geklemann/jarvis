'use strict';
// Diretoria no bolso: só as informações-chave da empresa, pensadas para o celular — vendas, rentabilidade, caixa,
// clientes (demandas em atendimento) e o que pede atenção. No celular, é a primeira tela depois do login.
(()=>{
Object.assign(paths,{bolso:'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2'});
const cur=v=>{const a=Math.abs(v);return (v<0?'−':'')+(a>=1e6?'R$ '+(a/1e6).toFixed(2).replace('.',',')+' mi':a>=1e4?'R$ '+(a/1e3).toFixed(1).replace('.',',')+' mil':money(a))};
const p1=v=>(v*100).toFixed(1).replace('.',',')+'%';
let pediuAt=false;
function spark(l){const mx=Math.max(1,...l),w=100/(l.length-1||1);return `<svg class="bl-spark" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" points="${l.map((v,i)=>`${(i*w).toFixed(1)},${(28-v/mx*26).toFixed(1)}`).join(' ')}"/></svg>`}
const bloco=(t,ic,corpo,ir)=>`<section class="card bl-card" ${ir?`data-bl-ir="${ir}" role="button" tabindex="0"`:''}><div class="bl-tit">${icon(ic)}<span>${t}</span>${ir?`<small>ver ›</small>`:''}</div>${corpo}</section>`;
const num=(v,l,tom='')=>`<div class="bl-num"><b class="${tom}">${v}</b><small>${l}</small></div>`;
function view(){const d=window.Hoje?.dados?.(),u=window.Cloud?.session?.user,nome=(u?.user_metadata?.nome||u?.email||'').split(/[\s@]/)[0];
 const hora=new Date().getHours(),saud=hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
 if(!d)return `<div class="card empty">Carregando…</div>`;
 const mg=(()=>{try{return window.Margem?.resumo?.()}catch{return null}})(),prej=(()=>{try{return window.Margem?.avisos?.().length?window.Margem.avisos()[0][2]:''}catch{return ''}})();
 const at=window.Atendimento?.resumo?.();if(at&&!at.carregado&&!pediuAt){pediuAt=true;Promise.resolve(window.Atendimento.carregar?.()).then(()=>{if(page==='bolso')render()}).catch(()=>{})}
 const varMes=d.mesAnt.v?d.mes.v/d.mesAnt.v-1:null,ticket=d.vh.n?d.vh.v/d.vh.n:0,vencido=d.somaT(d.venc);
 const canais=[...new Set(db.orders.filter(o=>o.date.startsWith(d.m)).map(o=>o.platform))].map(c=>({c,v:db.orders.filter(o=>o.platform===c&&o.date.startsWith(d.m)).reduce((s,o)=>s+(Number(o.gross)||0),0)})).sort((a,b)=>b.v-a.v).slice(0,4),tot=canais.reduce((s,x)=>s+x.v,0)||1;
 return `<div class="bl">
 <div class="bl-top"><div><h1>${saud}${nome?', '+esc(nome.charAt(0).toUpperCase()+nome.slice(1)):''}</h1><span class="caption">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · atualizado ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></div><button class="small" data-bl-ir="central">Sistema completo ›</button></div>
 ${bloco('Vendas','cart',`<div class="bl-row">${num(cur(d.vh.v),`hoje · ${d.vh.n} pedidos${ticket?' · ticket '+money(ticket):''}`)}${num(cur(d.mes.v),`no mês${varMes!=null?` · <span class="${varMes>=0?'green':'red'}">${varMes>=0?'▲':'▼'} ${Math.abs(varMes*100).toFixed(0)}%</span> vs. mês passado`:''}`)}</div>${spark(d.spark)}<div class="bl-canais">${canais.map(x=>`<span><i style="width:${Math.max(4,x.v/tot*100)}%"></i><em>${esc(x.c)}</em><b>${p1(x.v/tot)}</b></span>`).join('')}</div>`,'dashboard')}
 ${bloco('Rentabilidade · 30 dias','radar',mg?`<div class="bl-row">${num(p1(mg.venda?mg.lucro/mg.venda:0),'margem de contribuição',mg.lucro<0?'red':'green')}${num(cur(mg.lucro),'lucro depois de tarifas, frete, custo e impostos')}</div>${prej?`<p class="bl-alerta red">${esc(prej)}</p>`:'<p class="bl-alerta green">Nenhum anúncio relevante no prejuízo.</p>'}`:'<p class="caption">Sem dados de margem ainda.</p>','margem')}
 ${bloco('Caixa','cash',`<div class="bl-row">${num(cur(d.pr.inicial),'saldo hoje')}${num(cur(d.menor.saldo),`menor saldo em 30 dias${d.menor.d?' · '+new Date(d.menor.d+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):''}`,d.menor.saldo<0?'red':'')}</div><div class="bl-row">${num(cur(vencido),`${d.venc.length} conta(s) vencida(s)`,vencido>0?'red':'')}${num(cur(d.receberMk),'a receber dos marketplaces')}</div>`,'fluxo')}
 ${bloco('Clientes e demandas','headset',at?`<div class="bl-row">${num(at.fila,'na fila de atendimento',at.fila?'':'green')}${num(at.urgentes,'urgentes (prazo < 24 h)',at.urgentes?'red':'green')}</div><div class="bl-row">${num(at.resolvidos7,'resolvidos em 7 dias','green')}${num(at.atendendo,`sendo atendidos agora${at.online?' · '+at.online+' pessoa(s) online':''}`)}</div>`:'<p class="caption">Abrindo o atendimento…</p>','atendimento')}
 ${bloco('Pede atenção','alert',(d.avisos||[]).slice(0,4).map(a=>`<div class="bl-aviso ${a[0]}" ${a[4]?`data-bl-ir="${esc(a[4])}"`:''}><strong>${esc(a[2])}</strong><small>${esc(a[3]||'')}</small></div>`).join('')||'<p class="bl-alerta green">Tudo em dia. ✓</p>')}
 <p class="caption bl-rod">Só o essencial. Toque num quadro para ver o detalhe no sistema.</p></div>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-bl-ir]');if(!b||page!=='bolso')return;e.stopPropagation();navigate(b.dataset.blIr)},true);
let tm=null;function bind(){document.body.classList.add("pg-bolso");clearInterval(tm);tm=setInterval(()=>{if(page!=='bolso'){clearInterval(tm);return}if(!document.querySelector('.modalback'))render()},60000)}
addPage('bolso','bolso','Diretoria no bolso',view,'Só as informações-chave: vendas, rentabilidade, caixa, clientes e o que pede atenção. Feita para o celular.','',bind);
// No celular, a primeira tela depois de entrar é a da diretoria (uma vez por sessão; "Sistema completo" volta ao resto).
setInterval(()=>document.body.classList.toggle('pg-bolso',page==='bolso'),400);
let feito=false;setInterval(()=>{if(feito||!window.Cloud?.session)return;feito=true;try{if(matchMedia('(max-width:700px)').matches&&page==='central'&&!sessionStorage.getItem('eb_bolso')){sessionStorage.setItem('eb_bolso','1');navigate('bolso')}}catch{}},1200);
})();
