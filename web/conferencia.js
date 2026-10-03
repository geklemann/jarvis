'use strict';
// Conferência de expedição por bipagem (o "checkout" de Magazord, Tiny e Bling): bipe a etiqueta ou digite o número
// do pedido, depois bipe cada produto. O Jarvis compara com os itens do pedido, avisa item errado ou a mais com som e
// cor, e só libera "Conferido" quando tudo bate. Fica registrado quem conferiu, quando e em quanto tempo.
(()=>{
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const quem=()=>window.Cloud?.session?.user?.email||'local';
const st={atual:null,hist:null,carregando:false,msg:null};
const prods=()=>window.Estoque?.lista?.()||[];
const porCodigo=c=>{c=String(c).trim();const l=prods();return l.find(p=>p.gtin&&p.gtin===c)||l.find(p=>p.id.toLowerCase()===c.toLowerCase())};
const norm=s=>String(s||'').replace(/[^0-9A-Za-z]/g,'').toUpperCase();
function acharPedido(c){const k=norm(c);if(!k)return null;
 return db.orders.find(o=>norm(o.id)===k)||db.orders.find(o=>norm(o.external?.bling_numero)===k)||db.orders.find(o=>(o.external?.ml_order_ids||[]).some(x=>norm(x)===k)||norm(o.external?.pack_id)===k)||db.orders.find(o=>o.nf&&norm(o.nf)===k)}
let ctx=null;
function bip(ok){try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=ok?880:180;o.type=ok?'sine':'square';g.gain.value=.08;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+(ok?.09:.35))}catch{}}
async function carregarHist(){if(st.carregando||!window.Cloud?.client)return;st.carregando=true;
 try{const {data,error}=await Cloud.client.from('expedicao_conferencias').select('*').eq('workspace_id',Cloud.ws).gte('fim',new Date(Date.now()-7*864e5).toISOString()).order('fim',{ascending:false}).limit(1000);if(error)throw error;st.hist=data||[]}
 catch(e){st.hist=st.hist||[];toast('Conferência: '+e.message)}finally{st.carregando=false}
 if(!prods().length){try{await window.Estoque?.carregar?.()}catch{}}
 if(page==='conferencia')render()}
function abrir(o){const soma={};for(const i of o.items||[]){const s=String(i.sku||'').trim()||i.title;(soma[s]||(soma[s]={sku:s,nome:i.title||s,esperado:0,lido:0})).esperado+=Number(i.qty)||0}
 st.atual={o,itens:Object.values(soma),extras:[],inicio:new Date().toISOString(),ja:(st.hist||[]).find(h=>h.pedido===o.id)};st.msg={ok:true,t:`Pedido ${o.id} · ${o.platform} · ${o.customer?.name||''}`}}
function ler(cod){cod=String(cod||'').trim();if(!cod)return;
 if(!st.atual){const o=acharPedido(cod);if(!o){bip(false);st.msg={ok:false,t:`Pedido não encontrado: ${cod}`};return}abrir(o);bip(true);return}
 const p=porCodigo(cod),sku=p?.id,it=st.atual.itens.find(i=>i.sku===sku||i.sku===cod);
 if(!it){const o=acharPedido(cod);if(o&&o.id!==st.atual.o.id&&!st.atual.itens.some(i=>i.lido)){abrir(o);bip(true);return}
  st.atual.extras.push({cod,sku:sku||null,nome:p?.nome||null});bip(false);st.msg={ok:false,t:`Item que NÃO é deste pedido: ${p?p.nome:cod}`};return}
 if(it.lido>=it.esperado){it.lido++;bip(false);st.msg={ok:false,t:`A mais: ${it.nome} (pedido pede ${it.esperado})`};return}
 it.lido++;bip(true);const falta=st.atual.itens.reduce((a,i)=>a+Math.max(0,i.esperado-i.lido),0);st.msg={ok:true,t:`${it.nome} · ${it.lido}/${it.esperado}${falta?` · faltam ${falta}`:' · pedido completo'}`}}
async function concluir(forcar){const a=st.atual;if(!a)return;const ok=a.itens.every(i=>i.lido===i.esperado)&&!a.extras.length;
 if(!ok&&!forcar)return toast('Ainda há diferença. Confira ou registre como divergente.');
 const row={workspace_id:Cloud.ws,pedido:a.o.id,plataforma:a.o.platform,status:ok?'ok':'divergente',itens:a.itens,extras:a.extras,conferido_por:quem(),inicio:a.inicio,fim:new Date().toISOString(),observacao:ok?null:($('#cfObs')?.value.trim()||null)};
 try{const {error}=await Cloud.client.from('expedicao_conferencias').upsert(row,{onConflict:'workspace_id,pedido'});if(error)throw error;(st.hist||(st.hist=[])).unshift(row);
  st.msg={ok,t:ok?`Pedido ${a.o.id} conferido. Bipe o próximo.`:`Pedido ${a.o.id} registrado com divergência.`};st.atual=null;render();focar()}catch(e){toast(e.message)}}
const focar=()=>setTimeout(()=>$('#cfCod')?.focus(),30);
function view(){if(!st.hist){carregarHist();return '<div class="empty">Carregando…</div>'}
 const h=st.hist,hj=h.filter(x=>String(x.fim).slice(0,10)===hoje()),div=hj.filter(x=>x.status==='divergente'),tempos=hj.map(x=>x.inicio?(new Date(x.fim)-new Date(x.inicio))/1000:null).filter(x=>x>0&&x<3600).sort((a,b)=>a-b),med=tempos.length?tempos[Math.floor(tempos.length/2)]:null;
 const pedHoje=db.orders.filter(o=>o.date===hoje()),conf=new Set(h.map(x=>x.pedido)),falta=pedHoje.filter(o=>!conf.has(o.id)).length,a=st.atual;
 return `<div class="grid kpis4"><div class="card kpi"><span class="kpil">Conferidos hoje</span><span class="kpiv">${hj.length}</span><span class="kpis">${falta} pedido(s) de hoje sem conferência</span></div><div class="card kpi"><span class="kpil">Divergências hoje</span><span class="kpiv ${div.length?'red':''}">${div.length}</span><span class="kpis">item errado, a mais ou faltando</span></div><div class="card kpi"><span class="kpil">Tempo por pedido</span><span class="kpiv">${med?`${Math.floor(med/60)}m${String(Math.round(med%60)).padStart(2,'0')}s`:'—'}</span><span class="kpis">mediana de hoje</span></div><div class="card kpi"><span class="kpil">Últimos 7 dias</span><span class="kpiv">${h.length}</span><span class="kpis">${h.filter(x=>x.status==='divergente').length} com divergência</span></div></div>
 <section class="card scancard"><label for="cfCod">${a?'Bipe cada produto do pedido':'Bipe a etiqueta ou digite o número do pedido'} e tecle Enter</label><div class="row"><input id="cfCod" autocomplete="off" autofocus placeholder="${a?'EAN ou SKU':'Pedido, etiqueta ou NF'}" style="flex:1;font-size:20px;padding:14px">${a?'<button class="small quiet" data-cf="cancelar">Trocar de pedido</button>':''}</div>
 ${st.msg?`<div class="scanlast ${st.msg.ok?'ok':'bad'}">${icon(st.msg.ok?'check':'alert')} ${esc(st.msg.t)}</div>`:''}</section>
 ${a?`<div class="tablebox"><div class="tabletop"><div><h2>Pedido ${esc(a.o.id)}</h2><p class="caption">${esc(a.o.platform)} · ${esc(a.o.customer?.name||'')} · ${new Date(a.o.date+'T12:00').toLocaleDateString('pt-BR')}${a.ja?` · <span class="badge warn">já conferido por ${esc(String(a.ja.conferido_por||'').split('@')[0])}</span>`:''}</p></div><div class="row">${a.itens.every(i=>i.lido===i.esperado)&&!a.extras.length?`<button class="primary" data-cf="ok">${icon('check')} Conferido</button>`:`<input id="cfObs" placeholder="Observação da divergência" style="min-width:220px"><button class="danger small" data-cf="div">Registrar divergência</button>`}</div></div>
  <div class="tablewrap"><table><thead><tr><th>Produto</th><th class="num">Pedido</th><th class="num">Lido</th><th></th></tr></thead><tbody>${a.itens.map(i=>{const p=prods().find(x=>x.id===i.sku);return `<tr><td class="comfoto">${window.Estoque?.foto?.(i.sku)||''}<strong>${esc(i.nome)}</strong><br><span class="caption mono">${esc(i.sku)}${p?.gtin?' · EAN '+esc(p.gtin):' · sem EAN: bipe o SKU'}${p?.localizacao?' · '+esc(p.localizacao):''}</span></td><td class="num">${i.esperado}</td><td class="num"><strong class="${i.lido===i.esperado?'green':i.lido>i.esperado?'red':''}">${i.lido}</strong></td><td>${i.lido===i.esperado?`<span class="badge ok">ok</span>`:i.lido>i.esperado?`<span class="badge bad">a mais</span> <button class="small quiet" data-cf="menos" data-sku="${esc(i.sku)}">Tirei 1</button>`:`<span class="badge warn">falta ${i.esperado-i.lido}</span>`}</td></tr>`}).join('')}
  ${a.extras.map((x,n)=>`<tr><td><span class="red">Não é do pedido:</span> ${esc(x.nome||x.cod)}</td><td class="num">0</td><td class="num red">1</td><td><span class="badge bad">errado</span> <button class="small quiet" data-cf="tirar" data-n="${n}">Tirei da caixa</button></td></tr>`).join('')}</tbody></table></div></div>`
 :`<div class="tablebox"><div class="tabletop"><h2>Últimas conferências</h2></div><div class="tablewrap" style="max-height:420px"><table><thead><tr><th>Quando</th><th>Pedido</th><th>Canal</th><th>Quem</th><th>Situação</th></tr></thead><tbody>${h.slice(0,200).map(x=>`<tr><td>${new Date(x.fim).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td><td class="mono">${esc(x.pedido)}</td><td>${esc(x.plataforma||'')}</td><td>${esc(String(x.conferido_por||'').split('@')[0])}</td><td><span class="badge ${x.status==='ok'?'ok':'bad'}">${x.status==='ok'?'ok':'divergente'}</span>${x.observacao?` <span class="caption">${esc(x.observacao)}</span>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhuma conferência ainda.</td></tr>'}</tbody></table></div></div>`}`}
document.addEventListener('keydown',e=>{if(e.target.id!=='cfCod'||e.key!=='Enter')return;e.preventDefault();const v=e.target.value;e.target.value='';ler(v);render();focar()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-cf]');if(!b)return;const k=b.dataset.cf;if(k==='cancelar'){st.atual=null;st.msg=null;render();focar()}else if(k==='tirar'){st.atual?.extras.splice(Number(b.dataset.n),1);render();focar()}else if(k==='menos'){const i=st.atual?.itens.find(x=>x.sku===b.dataset.sku);if(i&&i.lido>0)i.lido--;render();focar()}else if(k==='ok')concluir(false);else if(k==='div')concluir(true)});
addPage('conferencia','scan','Conferência de envio',view,'Bipe o pedido e cada produto antes de embalar: item errado, a mais ou faltando é barrado na hora.','',()=>focar());
})();
