'use strict';
// Preços › Vigia de preços: cada anúncio ativo do Mercado Livre que está num produto de catálogo, comparado com o menor
// preço de outro vendedor do MESMO produto, a disputa pela compra (anúncios de catálogo) e a margem que sobraria se você
// igualasse o preço (mesmas tarifas, frete e custo do histórico — Radar de margem). Preço só muda quando a pessoa escolhe
// os anúncios, a regra e a margem mínima, confere a prévia e confirma (servidor: ajustarPrecosML, com auditoria).
// O servidor verifica a cada 3 horas (precos_ml.ts) e avisa quando um concorrente baixa o preço abaixo do seu.
(()=>{
Object.assign(paths,{binoculo:'M5 14a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z M12 14a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z M6 11l2-6h2l1 5 M18 11l-2-6h-2l-1 5'});
const st={lista:null,info:null,ws:undefined,carregando:false,filtro:'atencao',busca:'',verificando:false,sel:new Set(),regra:'igualar',valor:'',min:5,previa:null};
window.Reiniciar?.registrar(st,['filtro','busca','sel']); // estado de tela: volta ao original ao clicar no menu
const SIT={perdendo:['Perdendo a compra','bad'],mais_caro:['Mais caro','bad'],compartilhando:['Dividindo a compra','warn'],ganhando:['Ganhando a compra','ok'],mais_barato:['Mais barato','ok'],listado:['Sem disputa','info'],sozinho:['Sem concorrente','info'],sem_catalogo:['Fora do catálogo','']};
const FIL={atencao:['Pede atenção',x=>['perdendo','mais_caro','compartilhando'].includes(x.situacao)],ok:['Na frente',x=>['ganhando','mais_barato'].includes(x.situacao)],todos:['Com concorrentes',x=>x.concorrentes>0],sem:['Sem comparação',x=>['sozinho','sem_catalogo','listado'].includes(x.situacao)&&!x.concorrentes]};
const p1=v=>v==null?'—':(v*100).toFixed(1).replace('.',',')+'%';
const podeAlterar=()=>['owner','member','financeiro'].includes(window.Cloud?.role);
// Novo preço pela regra escolhida: igualar ao menor concorrente (1 centavo abaixo), preço para ganhar a compra (catálogo),
// ajuste em % (−5 baixa 5%, +3 sobe 3%) ou preço fixo. null = a regra não se aplica a este anúncio.
const REGRAS={igualar:'Igualar ao menor concorrente (R$ 0,01 abaixo)',ganhar:'Preço para ganhar a compra (catálogo)',pct:'Ajustar em % (ex.: −5 ou +3)',fixo:'Preço fixo'};
function novoPreco(x,regra,valor){const v=Number(String(valor??'').replace('−','-').replace(',','.'));let p=null;
 if(regra==='igualar')p=x.menor_preco?Number(x.menor_preco)-0.01:null;
 else if(regra==='ganhar')p=x.preco_para_ganhar?Number(x.preco_para_ganhar):x.menor_preco?Number(x.menor_preco)-0.01:null;
 else if(regra==='pct')p=isFinite(v)&&v!==0&&x.meu_preco?Number(x.meu_preco)*(1+v/100):null;
 else if(regra==='fixo')p=v>0?v:null;
 return p!=null&&p>0?Math.round(p*100)/100:null}
/** Prévia: preço novo e margem resultante de cada anúncio; abaixo da margem mínima fica de fora. */
function previa(itens,regra,valor,min){return itens.map(x=>{const p=novoPreco(x,regra,valor),m=p&&window.Margem?.simular?.(x.sku,p),mh=window.Margem?.simular?.(x.sku,x.meu_preco);
 const motivo=!p?'a regra não se aplica':Math.abs(p-Number(x.meu_preco))<0.005?'preço igual ao atual':m&&m.margem*100<Number(min)?`margem ${p1(m.margem)} abaixo do mínimo de ${String(min).replace('.',',')}%`:null;
 return {x,preco:p,margem:m?.margem??null,lucroU:m?.lucroU??null,margemHoje:mh?.margem??null,semHistorico:!m,bloqueado:!!motivo,motivo}})}
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
 return `<div class="notice">Para cada anúncio seu que está num produto do catálogo do Mercado Livre, o Jarvis compara com o menor preço de outro vendedor do mesmo produto e mostra a margem que sobraria se você igualasse. Para mudar preços, marque os anúncios, escolha a regra e a margem mínima e confira a prévia: nada é alterado sem a sua confirmação. A verificação roda sozinha a cada 3 horas e avisa quando um concorrente baixa o preço (escolha esse aviso em Alertas e relatórios).</div>
 ${i.erro?`<div class="notice warnbox">Última verificação falhou: ${esc(i.erro)}</div>`:''}
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Anúncios com concorrência</span><span class="kpiv">${comC.length}</span><span class="kpis">de ${i.ativos??l0.length} anúncio(s) ativo(s)</span></div>
  <div class="card kpi"><span class="kpil">Pede atenção</span><span class="kpiv ${caros.length?'red':''}">${caros.length}</span><span class="kpis">mais caro ou perdendo a compra</span></div>
  <div class="card kpi"><span class="kpil">Na frente</span><span class="kpiv green">${ganha.length}</span><span class="kpis">ganhando a compra ou mais barato</span></div>
  <div class="card kpi"><span class="kpil">Última verificação</span><span class="kpiv" style="font-size:20px">${dh(i.em)}</span><span class="kpis"><button class="small" data-cc="verificar" ${st.verificando?'disabled':''}>${icon('refresh')} ${st.verificando?'Verificando… (até 2 min)':'Verificar agora'}</button></span></div></div>
 <div class="crmbar"><div class="segtabs">${Object.entries(FIL).map(([k,[t,f]])=>`<button class="${st.filtro===k?'active':''}" data-cc-filtro="${k}">${t} <small>${l0.filter(f).length}</small></button>`).join('')}</div>
  <div class="searchin">${icon('search')}<input type="search" id="ccBusca" placeholder="Anúncio, SKU ou código MLB…" value="${esc(st.busca)}"></div></div>
 ${podeAlterar()?`<div class="crmbar"><strong>${st.sel.size} selecionado(s)</strong><select data-cc-regra aria-label="Regra do novo preço">${Object.entries(REGRAS).map(([k,t])=>`<option value="${k}" ${st.regra===k?'selected':''}>${t}</option>`).join('')}</select>${['pct','fixo'].includes(st.regra)?`<input data-cc-valor class="ufin" inputmode="decimal" value="${esc(st.valor)}" placeholder="${st.regra==='pct'?'−5':'99,90'}" style="width:90px" aria-label="Valor">`:''}<label class="row" style="gap:6px;font-weight:400">Margem mínima <input data-cc-min class="ufin" inputmode="decimal" value="${esc(String(st.min))}" style="width:60px" aria-label="Margem mínima em %"> %</label><button class="primary small" data-cc="previa" ${st.sel.size?'':'disabled'}>${icon('tag')} Ver prévia e alterar preços</button></div>`:''}
 <div class="tablebox"><div class="tablewrap"><table><thead><tr>${podeAlterar()?'<th style="width:28px"></th>':''}<th>Anúncio</th><th>Situação</th><th class="num">Seu preço</th><th class="num">Menor concorrente</th><th class="num">Para ganhar</th><th class="num">Margem: hoje → se igualar</th></tr></thead><tbody>
 ${l.map(x=>{const [t,tom]=SIT[x.situacao]||[x.situacao,''],d=dif(x),m=margens(x);return `<tr>${podeAlterar()?`<td>${x.meu_preco!=null?`<input type="checkbox" class="check" data-cc-sel="${esc(x.item_id)}" ${st.sel.has(x.item_id)?'checked':''} aria-label="Selecionar ${esc(x.item_id)}">`:''}</td>`:''}<td><div class="estprod">${x.foto?`<img src="${esc(x.foto)}" alt="" loading="lazy">`:`<span class="estimg">${icon('tag')}</span>`}<span><strong>${esc(x.titulo||x.item_id)}</strong><br><span class="caption mono">${esc(x.sku||'sem SKU')} · <a href="${esc(x.link||'https://www.mercadolivre.com.br')}" target="_blank" rel="noopener">${esc(x.item_id)}</a>${x.catalogo?' · catálogo':''}</span></span></div></td>
  <td><span class="badge ${tom}">${t}</span><br><span class="caption">${x.concorrentes} concorrente(s)</span>${spark(x.historico)}</td><td class="num">${x.meu_preco!=null?money(x.meu_preco):'—'}</td>
  <td class="num">${x.menor_preco!=null?`${money(x.menor_preco)} <span class="${d>0.004?'red':d<-0.004?'green':'caption'}">${d==null?'':`(${d>0?'você +':'você '}${p1(d)})`}</span>${x.menor_item?`<br><a class="caption" href="https://produto.mercadolivre.com.br/${esc(String(x.menor_item).replace(/^MLB/,'MLB-'))}" target="_blank" rel="noopener">ver oferta</a>`:''}`:'—'}</td>
  <td class="num">${x.preco_para_ganhar?money(x.preco_para_ganhar):'—'}</td>
  <td class="num">${m.hoje?`<strong>${p1(m.hoje.margem)}</strong> → <strong class="${m.igual&&m.igual.lucroU<0?'red':''}">${m.igual?p1(m.igual.margem):'—'}</strong><br><span class="caption">${money(m.hoje.lucroU)}/un.${m.igual?` → ${money(m.igual.lucroU)}/un. a ${money(m.alvo)}`:''}</span>`:'<span class="caption">sem vendas recentes</span>'}</td></tr>`}).join('')||`<tr><td colspan="7" class="empty">${l0.length?'Nenhum anúncio neste filtro.':'Ainda não verificado. Clique em Verificar agora.'}</td></tr>`}
 </tbody></table></div></div>
 <p class="caption">Margem de contribuição por unidade, com as tarifas, o frete e o custo reais das vendas dos últimos ${30} dias deste SKU no Mercado Livre (Radar de margem). "Para ganhar" é o preço que o Mercado Livre indica para ganhar a compra nos anúncios de catálogo.</p>`}
function abrirPrevia(){const itens=(st.lista||[]).filter(x=>st.sel.has(x.item_id)),pv=previa(itens,st.regra,st.valor,st.min),ok=pv.filter(p=>!p.bloqueado);st.previa=pv;
 modal('Prévia dos novos preços',`<p class="caption" style="margin-top:-8px">${esc(REGRAS[st.regra])}${['pct','fixo'].includes(st.regra)?' · '+esc(st.valor):''} · margem mínima ${esc(String(st.min))}%. Margem de contribuição por unidade com as tarifas, o frete e o custo reais do SKU.</p>
 <div class="tablewrap" style="max-height:360px"><table><thead><tr><th>Anúncio</th><th class="num">Hoje</th><th class="num">Novo</th><th class="num">Margem</th><th>Situação</th></tr></thead><tbody>${pv.map(p=>`<tr class="${p.bloqueado?'muted':''}"><td>${esc(p.x.titulo||p.x.item_id)}<br><span class="caption mono">${esc(p.x.item_id)}</span></td><td class="num">${money(p.x.meu_preco)}</td><td class="num"><strong>${p.preco?money(p.preco):'—'}</strong></td><td class="num">${p1(p.margemHoje)} → <span class="${(p.margem??0)<0?'red':''}">${p1(p.margem)}</span></td><td>${p.bloqueado?`<span class="badge bad">Fica de fora</span><br><span class="caption">${esc(p.motivo)}</span>`:p.semHistorico?'<span class="badge warn">Sem histórico de margem</span><br><span class="caption">confira o custo</span>':'<span class="badge ok">Vai alterar</span>'}</td></tr>`).join('')}</tbody></table></div>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-cc="confirmar" ${ok.length?'':'disabled'}>${icon('check')} Alterar ${ok.length} preço(s) no Mercado Livre</button></div>`)}
document.addEventListener('change',ev=>{const x=ev.target;
 if(x.matches?.('[data-cc-sel]')){if(x.checked)st.sel.add(x.dataset.ccSel);else st.sel.delete(x.dataset.ccSel);render();return}
 if(x.matches?.('[data-cc-regra]')){st.regra=x.value;render();return}
 if(x.matches?.('[data-cc-valor]')){st.valor=x.value;return}
 if(x.matches?.('[data-cc-min]')){const v=Number(String(x.value).replace(',','.'));st.min=isFinite(v)?v:0;return}});
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-cc],[data-cc-filtro]');if(!b)return;const d=b.dataset;
 if(d.cc==='previa'){abrirPrevia();return}
 if(d.cc==='confirmar'){const ok=(st.previa||[]).filter(p=>!p.bloqueado);if(!ok.length)return;
  if(b.dataset.conf!=='1'){b.dataset.conf='1';b.innerHTML=`${icon('check')} Confirmar: mudar ${ok.length} preço(s) agora`;b.classList.add('danger');return}
  b.disabled=true;b.textContent='Alterando…';try{const r=await Integrations.callFn('integrations',{action:'precos_ajustar',itens:ok.map(p=>({item_id:p.x.item_id,preco:p.preco}))});
   closeModal();toast(`${r.alterados} preço(s) alterado(s) no Mercado Livre${r.falhas?` · ${r.falhas} falha(s): ${r.itens.filter(i=>!i.ok).slice(0,2).map(i=>i.item_id+' '+i.erro).join('; ')}`:''}.`);st.sel.clear();await carregar()}catch(e){toast(e.message||String(e));b.disabled=false}return}
 if(d.ccFiltro){st.filtro=d.ccFiltro;render();return}
 if(d.cc==='verificar'){st.verificando=true;render();try{const r=await Integrations.callFn('integrations',{action:'precos_vigiar'});toast(`${r.verificados} anúncio(s) verificados · ${r.com_concorrencia} com concorrência · ${r.mais_caros} pedem atenção.`)}catch(e){toast(e.message||String(e))}finally{st.verificando=false}await carregar()}});
function bind(){const i=$('#ccBusca');if(i)i.oninput=e=>{st.busca=e.target.value;const pos=e.target.selectionStart;render();const n=$('#ccBusca');n.focus();n.setSelectionRange(pos,pos)}}
addPage('concorrencia','binoculo','Vigia de preços',view,'Seus anúncios do Mercado Livre contra o menor preço dos concorrentes do mesmo produto — e a margem se igualar.','',bind);
window.Concorrencia={carregar,novoPreco,previa,avisos:()=>{const n=(st.lista||[]).filter(FIL.atencao[1]).length;return n?[['warn','binoculo',`${n} anúncio(s) mais caro(s) que o concorrente`,'Veja a margem se igualar no Vigia de preços','concorrencia']]:[]}};
})();
