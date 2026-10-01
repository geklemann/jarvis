'use strict';
// Preços › Vigia de preços: cada anúncio ativo do Mercado Livre que está num produto de catálogo, comparado com o menor
// preço de outro vendedor do MESMO produto, a disputa pela compra (anúncios de catálogo) e a margem que sobraria se você
// igualasse o preço (mesmas tarifas, frete e custo do histórico — Radar de margem). Só leitura: o Jarvis não muda preços.
// O servidor verifica a cada 3 horas (precos_ml.ts) e avisa quando um concorrente baixa o preço abaixo do seu.
(()=>{
Object.assign(paths,{binoculo:'M5 14a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z M12 14a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z M6 11l2-6h2l1 5 M18 11l-2-6h-2l-1 5'});
const st={lista:null,info:null,ws:undefined,carregando:false,filtro:'atencao',busca:'',verificando:false};
window.Reiniciar?.registrar(st,['filtro','busca']); // estado de tela: volta ao original ao clicar no menu
const SIT={perdendo:['Perdendo a compra','bad'],mais_caro:['Mais caro','bad'],compartilhando:['Dividindo a compra','warn'],ganhando:['Ganhando a compra','ok'],mais_barato:['Mais barato','ok'],listado:['Sem disputa','info'],sozinho:['Sem concorrente','info'],sem_catalogo:['Fora do catálogo','']};
const FIL={atencao:['Pede atenção',x=>['perdendo','mais_caro','compartilhando'].includes(x.situacao)],ok:['Na frente',x=>['ganhando','mais_barato'].includes(x.situacao)],todos:['Com concorrentes',x=>x.concorrentes>0],sem:['Sem comparação',x=>['sozinho','sem_catalogo','listado'].includes(x.situacao)&&!x.concorrentes]};
const p1=v=>v==null?'—':(v*100).toFixed(1).replace('.',',')+'%';
const dh=d=>d?new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
async function carregar(){if(!window.Cloud?.ws||st.carregando)return;st.carregando=true;st.ws=Cloud.ws;
 try{const [a,b]=await Promise.all([Cloud.client.from('precos_concorrencia').select('*').eq('workspace_id',Cloud.ws).limit(2000),Cloud.client.from('integrations').select('status,settings').eq('workspace_id',Cloud.ws).eq('provider','mercadolivre').maybeSingle()]);
  if(a.error)throw a.error;st.lista=a.data||[];st.info={conectado:['conectado','erro'].includes(b.data?.status),...(b.data?.settings?.precos||{})}}
 catch(e){st.lista=st.lista||[];st.info={erro:e.message||String(e)}}finally{st.carregando=false}if(page==='concorrencia'&&!document.querySelector('.modalback'))render()}
// Diferença do seu preço para o menor concorrente (positivo = você está mais caro).
const dif=x=>x.menor_preco&&x.meu_preco?x.meu_preco/x.menor_preco-1:null;
function spark(h){const pts=(h||[]).filter(p=>p.meu!=null||p.menor!=null);if(pts.length<2)return '';const vs=pts.flatMap(p=>[p.meu,p.menor]).filter(v=>v!=null),mn=Math.min(...vs),mx=Math.max(...vs),W=90,H=24,y=v=>H-2-(mx>mn?(v-mn)/(mx-mn):0.5)*(H-4),x=i=>i*(W/(pts.length-1));
 const linha=k=>pts.map((p,i)=>p[k]==null?'':`${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).filter(Boolean).join(' ');
 return `<svg viewBox="0 0 ${W} ${H}" class="spark" style="display:block;margin-top:4px" aria-label="Últimos dias: linha cheia = seu preço, tracejada = menor concorrente"><polyline points="${linha('meu')}"/><polyline points="${linha('menor')}" style="stroke-dasharray:3 2;opacity:.6"/></svg>`}
function margens(x){const M=window.Margem;if(!M?.simular||!x.sku)return {hoje:null,igual:null};const h=M.simular(x.sku,x.meu_preco),alvo=x.preco_para_ganhar||x.menor_preco;return {hoje:h,igual:alvo&&alvo<x.meu_preco?M.simular(x.sku,alvo):null,alvo}}
function view(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver o vigia de preços.</div>';
 if(!st.lista||st.ws!==Cloud.ws){carregar();return '<div class="empty">Carregando…</div>'}
 const i=st.info||{},l0=st.lista,q=normalized(st.busca),l=l0.filter(FIL[st.filtro][1]).filter(x=>!q||normalized(`${x.titulo} ${x.sku||''} ${x.item_id}`).includes(q)).sort((a,b)=>(dif(b)??-9)-(dif(a)??-9));
 const caros=l0.filter(FIL.atencao[1]),ganha=l0.filter(FIL.ok[1]),comC=l0.filter(x=>x.concorrentes>0);
 if(!i.conectado&&!l0.length)return '<div class="notice">Conecte o Mercado Livre em Integrações para o Jarvis vigiar os preços dos seus anúncios.</div>';
 return `<div class="notice">Para cada anúncio seu que está num produto do catálogo do Mercado Livre, o Jarvis compara com o menor preço de outro vendedor do mesmo produto e mostra a margem que sobraria se você igualasse. É só leitura: nenhum preço é alterado. A verificação roda sozinha a cada 3 horas e avisa quando um concorrente baixa o preço (escolha esse aviso em Alertas e relatórios).</div>
 ${i.erro?`<div class="notice warnbox">Última verificação falhou: ${esc(i.erro)}</div>`:''}
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Anúncios com concorrência</span><span class="kpiv">${comC.length}</span><span class="kpis">de ${i.ativos??l0.length} anúncio(s) ativo(s)</span></div>
  <div class="card kpi"><span class="kpil">Pede atenção</span><span class="kpiv ${caros.length?'red':''}">${caros.length}</span><span class="kpis">mais caro ou perdendo a compra</span></div>
  <div class="card kpi"><span class="kpil">Na frente</span><span class="kpiv green">${ganha.length}</span><span class="kpis">ganhando a compra ou mais barato</span></div>
  <div class="card kpi"><span class="kpil">Última verificação</span><span class="kpiv" style="font-size:20px">${dh(i.em)}</span><span class="kpis"><button class="small" data-cc="verificar" ${st.verificando?'disabled':''}>${icon('refresh')} ${st.verificando?'Verificando… (até 2 min)':'Verificar agora'}</button></span></div></div>
 <div class="crmbar"><div class="segtabs">${Object.entries(FIL).map(([k,[t,f]])=>`<button class="${st.filtro===k?'active':''}" data-cc-filtro="${k}">${t} <small>${l0.filter(f).length}</small></button>`).join('')}</div>
  <div class="searchin">${icon('search')}<input type="search" id="ccBusca" placeholder="Anúncio, SKU ou código MLB…" value="${esc(st.busca)}"></div></div>
 <div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Anúncio</th><th>Situação</th><th class="num">Seu preço</th><th class="num">Menor concorrente</th><th class="num">Para ganhar</th><th class="num">Margem: hoje → se igualar</th></tr></thead><tbody>
 ${l.map(x=>{const [t,tom]=SIT[x.situacao]||[x.situacao,''],d=dif(x),m=margens(x);return `<tr><td><div class="estprod">${x.foto?`<img src="${esc(x.foto)}" alt="" loading="lazy">`:`<span class="estimg">${icon('tag')}</span>`}<span><strong>${esc(x.titulo||x.item_id)}</strong><br><span class="caption mono">${esc(x.sku||'sem SKU')} · <a href="${esc(x.link||'https://www.mercadolivre.com.br')}" target="_blank" rel="noopener">${esc(x.item_id)}</a>${x.catalogo?' · catálogo':''}</span></span></div></td>
  <td><span class="badge ${tom}">${t}</span><br><span class="caption">${x.concorrentes} concorrente(s)</span>${spark(x.historico)}</td><td class="num">${x.meu_preco!=null?money(x.meu_preco):'—'}</td>
  <td class="num">${x.menor_preco!=null?`${money(x.menor_preco)} <span class="${d>0.004?'red':d<-0.004?'green':'caption'}">${d==null?'':`(${d>0?'você +':'você '}${p1(d)})`}</span>${x.menor_item?`<br><a class="caption" href="https://produto.mercadolivre.com.br/${esc(String(x.menor_item).replace(/^MLB/,'MLB-'))}" target="_blank" rel="noopener">ver oferta</a>`:''}`:'—'}</td>
  <td class="num">${x.preco_para_ganhar?money(x.preco_para_ganhar):'—'}</td>
  <td class="num">${m.hoje?`<strong>${p1(m.hoje.margem)}</strong> → <strong class="${m.igual&&m.igual.lucroU<0?'red':''}">${m.igual?p1(m.igual.margem):'—'}</strong><br><span class="caption">${money(m.hoje.lucroU)}/un.${m.igual?` → ${money(m.igual.lucroU)}/un. a ${money(m.alvo)}`:''}</span>`:'<span class="caption">sem vendas recentes</span>'}</td></tr>`}).join('')||`<tr><td colspan="6" class="empty">${l0.length?'Nenhum anúncio neste filtro.':'Ainda não verificado. Clique em Verificar agora.'}</td></tr>`}
 </tbody></table></div></div>
 <p class="caption">Margem de contribuição por unidade, com as tarifas, o frete e o custo reais das vendas dos últimos ${30} dias deste SKU no Mercado Livre (Radar de margem). "Para ganhar" é o preço que o Mercado Livre indica para ganhar a compra nos anúncios de catálogo.</p>`}
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-cc],[data-cc-filtro]');if(!b)return;const d=b.dataset;
 if(d.ccFiltro){st.filtro=d.ccFiltro;render();return}
 if(d.cc==='verificar'){st.verificando=true;render();try{const r=await Integrations.callFn('integrations',{action:'precos_vigiar'});toast(`${r.verificados} anúncio(s) verificados · ${r.com_concorrencia} com concorrência · ${r.mais_caros} pedem atenção.`)}catch(e){toast(e.message||String(e))}finally{st.verificando=false}await carregar()}});
function bind(){const i=$('#ccBusca');if(i)i.oninput=e=>{st.busca=e.target.value;const pos=e.target.selectionStart;render();const n=$('#ccBusca');n.focus();n.setSelectionRange(pos,pos)}}
addPage('concorrencia','binoculo','Vigia de preços',view,'Seus anúncios do Mercado Livre contra o menor preço dos concorrentes do mesmo produto — e a margem se igualar.','',bind);
window.Concorrencia={carregar,avisos:()=>{const n=(st.lista||[]).filter(FIL.atencao[1]).length;return n?[['warn','binoculo',`${n} anúncio(s) mais caro(s) que o concorrente`,'Veja a margem se igualar no Vigia de preços','concorrencia']]:[]}};
})();
