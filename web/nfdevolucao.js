'use strict';
// Fiscal › Notas de devolução. O Jarvis prepara a nota de devolução (cliente devolveu) ou de estorno (venda desfeita
// depois das 24 h de cancelamento) a partir da NF-e de venda original — XML do Bling ou nota do Jarvis —, com os mesmos
// produtos, valores e tributos na proporção devolvida e a nota original referenciada. Natureza, CFOP e CSTs seguem a
// última devolução que a empresa emitiu no Bling. Rascunho não vai à SEFAZ; emitir segue o ambiente da parametrização
// (produção pede confirmação). Autorizada em produção, a volta dos itens entra no kardex e vai para o Bling.
// Reembolsos do Mercado Livre sem nota de devolução viram rascunho sozinhos ao abrir a tela.
(()=>{
const dBR=d=>d?new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const dig=s=>String(s||'').replace(/\D/g,'');
const st={rows:null,cand:[],carregando:false,auto:false,filtro:'abertas'};
const ST={rascunho:['Rascunho','info'],emitida:['Enviada · aguardando SEFAZ','warn'],autorizada:['Autorizada','ok'],erro:['Rejeitada / erro','bad'],descartada:['Descartada','']};
const amb=()=>window.Parametros?.cfg?.().ambiente||'homologacao';
const podeEmitir=()=>['owner','member','financeiro'].includes(window.Cloud?.role||'owner');
const podePreparar=()=>['owner','member','financeiro','atendimento','estoque'].includes(window.Cloud?.role||'owner');
async function fn(action,body){const r=await Cloud.client.functions.invoke('integrations',{body:{workspace_id:Cloud.ws,action,...body}});if(r.error){let msg=r.error.message;try{msg=(await r.error.context.json()).error||msg}catch{}throw Error(msg)}return r.data}

async function carregar(){if(st.carregando||!window.Cloud?.client)return;st.carregando=true;
 try{const {data,error}=await Cloud.client.from('nfe_devolucoes').select('id,pedido,tipo,motivo,itens,total,origem,modelo,status,ambiente,nfe_ref,mensagem,estoque_lancado,criado_por,created_at,payload').eq('workspace_id',Cloud.ws).order('created_at',{ascending:false}).limit(500);if(error)throw error;st.rows=data||[];
  st.cand=await candidatos()}
 catch(e){st.rows=st.rows||[];toast('Notas de devolução: '+e.message)}finally{st.carregando=false}
 if(page==='nfdevolucao'){render();autoPreparar()}}
// Reembolsos do Mercado Livre (repasse com valor reembolsado) cujo pedido não tem nota de devolução no Bling nem rascunho aqui.
async function candidatos(){const {data}=await Cloud.client.from('receipts').select('id,linked_order,order_id,date,details').eq('workspace_id',Cloud.ws).eq('platform','Mercado Livre').not('details->reembolsado','is',null).gte('date',new Date(Date.now()-120*864e5).toISOString().slice(0,10)).limit(1000);
 const ja=new Set((st.rows||[]).filter(r=>r.status!=='descartada').map(r=>r.pedido)),out=[],vistos=new Set();
 for(const r of data||[]){const v=Number(r.details?.reembolsado)||0,ped=r.linked_order||r.order_id;if(!(v>0)||!ped||ja.has(ped)||vistos.has(ped))continue;const o=db.orders.find(x=>x.id===ped);if(!o||!o.nf)continue;
  const doc=dig(o.customer?.doc),dev=(db.purchases||[]).some(n=>n.tipo==='devolucao'&&n.emissao>=o.date&&doc&&dig(n.fornecedorDoc)===doc);if(dev)continue;
  vistos.add(ped);out.push({pedido:ped,o,reembolsado:v,data:r.date})}
 return out}
async function autoPreparar(){if(st.auto||!podePreparar()||!st.cand.length)return;st.auto=true;let ok=0,falhas=[];
 for(const c of st.cand.slice(0,5)){try{await fn('devolucao_preparar',{dados:{pedido:c.pedido,tipo:'devolucao',motivo:`Reembolso de ${money(c.reembolsado)} no Mercado Livre em ${dBR(c.data)}`}});ok++}catch(e){falhas.push(`${c.pedido}: ${e.message}`)}}
 if(ok||falhas.length){toast(`${ok} nota(s) de devolução preparada(s) dos reembolsos do Mercado Livre${falhas.length?` · ${falhas.length} sem preparo (veja a lista)`:''}.`);st.falhas=falhas;st.rows=null;st.carregando=false;await carregar()}}

function view(){if(!st.rows){carregar();return '<div class="empty">Carregando…</div>'}
 const a=amb(),abertas=st.rows.filter(r=>['rascunho','emitida','erro'].includes(r.status)),lista=st.filtro==='abertas'?abertas:st.filtro==='todas'?st.rows:st.rows.filter(r=>r.status===st.filtro);
 setTimeout(()=>{for(const r of st.rows.filter(r=>r.status==='emitida').slice(0,5))consultar(r.id,true)},0);
 return `<div class="notice">O Jarvis monta a nota a partir da NF-e de venda (XML do Bling): mesmos produtos, valores e impostos na proporção devolvida, com a nota original referenciada. Natureza, CFOP e CST seguem a última devolução emitida no Bling. <strong>Ambiente atual: ${a==='producao'?'<span class="red">PRODUÇÃO</span>':'homologação (sem valor fiscal)'}</strong>.</div>
 <div class="crmbar"><div class="segtabs">${[['abertas',`Em aberto (${abertas.length})`],['autorizada','Autorizadas'],['descartada','Descartadas'],['todas','Todas']].map(([k,t])=>`<button class="${st.filtro===k?'active':''}" data-dn-filtro="${k}">${t}</button>`).join('')}</div><div style="flex:1"></div>${podePreparar()?`<button class="primary small" data-dn-nova>${icon('plus')} Preparar nota de devolução</button>`:''}</div>
 ${st.cand.length?`<div class="notice warnbox" style="margin-bottom:12px"><strong>${st.cand.length} reembolso(s) do Mercado Livre sem nota de devolução.</strong> ${st.cand.slice(0,8).map(c=>`<button class="small quiet" data-dn-cand="${esc(c.pedido)}">${esc(c.pedido)} · ${money(c.reembolsado)}</button>`).join(' ')}${st.falhas?.length?`<br><span class="caption">${st.falhas.map(esc).join(' · ')}</span>`:''}</div>`:''}
 <div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Preparada</th><th>Pedido · nota original</th><th>Cliente</th><th>Tipo</th><th>Itens</th><th>Situação</th><th class="num">Valor</th><th></th></tr></thead><tbody>
 ${lista.map(r=>{const [t,tom]=ST[r.status]||[r.status,''],o=r.origem||{};return `<tr><td>${dBR(r.created_at)}<br><span class="caption">${esc(String(r.criado_por||'').split('@')[0])}</span></td><td class="mono">${esc(r.pedido)}<br><span class="caption">NF ${esc(o.numero||'')}/${esc(o.serie||'')} de ${dBR(o.emissao)}</span></td><td>${esc(o.cliente||'—')}<br><span class="caption">${esc(o.uf||'')}</span></td><td>${r.tipo==='estorno'?'Estorno':'Devolução'}</td><td class="caption">${(r.itens||[]).map(i=>`${i.qtd}× ${esc(i.nome)}`).join(' · ')}</td>
  <td><span class="badge ${tom}">${t}</span>${r.ambiente?`<br><span class="caption">${r.ambiente==='producao'?'produção':'homologação'}</span>`:''}${r.mensagem?`<br><span class="caption ${r.status==='erro'?'red':''}">${esc(String(r.mensagem).slice(0,140))}</span>`:''}${r.estoque_lancado?'<br><span class="caption green">estoque devolvido</span>':''}</td><td class="num">${money(r.total)}</td>
  <td><button class="small" data-dn-ver="${esc(r.id)}">Ver</button></td></tr>`}).join('')||'<tr><td colspan="8" class="empty">Nenhuma nota aqui.</td></tr>'}</tbody></table></div></div>`}

function ver(id){const r=st.rows.find(x=>x.id===id);if(!r)return;const p=r.payload||{},o=r.origem||{},m=r.modelo,[t,tom]=ST[r.status]||[r.status,''],a=amb(),edit=['rascunho','erro'].includes(r.status);
 const it=p.items||[],sum=k=>it.reduce((s,i)=>s+(Number(i[k])||0),0);
 modal(`${r.tipo==='estorno'?'Estorno':'Devolução'} · pedido ${esc(r.pedido)}`,`<p><span class="badge ${tom}">${t}</span> <span class="caption">${esc(p.natureza_operacao||'')} · ${p.tipo_documento===0?'nota de entrada':'saída'} · finalidade ${p.finalidade_emissao} · CFOP ${esc([...new Set(it.map(i=>i.cfop))].join(', '))}</span></p>
 <div class="grid two"><div><small class="caption">Nota original</small><br><strong>NF ${esc(o.numero||'')} série ${esc(o.serie||'')}</strong> de ${dBR(o.emissao)} <span class="caption">(${o.fonte==='jarvis'?'emitida pelo Jarvis':'Bling'})</span><br><span class="caption mono" style="word-break:break-all">${esc(o.chave||'')}</span></div><div><small class="caption">Cliente (remetente da devolução)</small><br><strong>${esc(o.cliente||'')}</strong><br><span class="caption">${esc(o.doc||'')} · ${esc(o.uf||'')}</span></div></div>
 <div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Valor</th><th class="num">Base ICMS</th><th class="num">ICMS</th><th class="num">DIFAL</th><th>PIS/COFINS</th></tr></thead><tbody>
 ${it.map(i=>`<tr><td>${esc(i.descricao)}<br><span class="caption mono">${esc(i.codigo_produto)} · NCM ${esc(i.codigo_ncm||'')} · CST ${esc(i.icms_situacao_tributaria||'')}</span></td><td class="num">${i.quantidade_comercial}</td><td class="num">${money((i.valor_bruto||0)+(i.valor_frete||0)-(i.valor_desconto||0))}</td><td class="num">${money(i.icms_base_calculo)}</td><td class="num">${money(i.icms_valor)} <span class="caption">${i.icms_aliquota}%</span></td><td class="num">${i.icms_valor_uf_destino!=null?money((i.icms_valor_uf_destino||0)+(i.fcp_valor_uf_destino||0)):'—'}</td><td class="caption">${esc(i.pis_situacao_tributaria)}/${esc(i.cofins_situacao_tributaria)} · ${money((i.pis_valor||0)+(i.cofins_valor||0))}</td></tr>`).join('')}
 <tr><td><strong>Total</strong></td><td></td><td class="num"><strong>${money(r.total)}</strong></td><td class="num">${money(sum('icms_base_calculo'))}</td><td class="num">${money(sum('icms_valor'))}</td><td class="num">${money(sum('icms_valor_uf_destino')+sum('fcp_valor_uf_destino'))}</td><td></td></tr></tbody></table></div>
 <p class="caption" style="margin-top:8px">${esc(p.informacoes_adicionais_contribuinte||'')}</p>
 <p class="caption">${m?`Regras copiadas da devolução ${esc(m.nota)} emitida no Bling (natureza "${esc(m.natOp||'')}", CFOP ${esc(m.cfop||'')}, PIS/COFINS CST ${esc(m.pis_cst||'')}/${esc(m.cofins_cst||'')}).`:r.tipo==='estorno'?'Estorno: CFOP 1.949/2.949, finalidade normal, com a nota de venda referenciada — confirme o procedimento com a contabilidade antes da primeira emissão em produção.':'Sem devolução no Bling para copiar as regras: CFOP 1.202/2.202 e os mesmos CST da venda. Confira com a contabilidade.'}</p>
 <div class="modalfoot"><button data-action="close">Fechar</button>${edit&&podePreparar()?`<button class="quiet" data-dn-descartar="${esc(r.id)}">Descartar</button>`:''}${r.status==='emitida'?`<button data-dn-consultar="${esc(r.id)}">${icon('refresh')} Consultar SEFAZ</button>`:''}${r.nfe_ref?`<button data-dn-notas>Ver em Notas emitidas</button>`:''}${edit&&podeEmitir()?`<button class="primary ${a==='producao'?'danger':''}" data-dn-emitir="${esc(r.id)}">${icon('nfe')} ${a==='producao'?'Emitir em PRODUÇÃO':'Emitir em homologação'}</button>`:''}</div>`)}

function nova(pedido){if(!podePreparar())return toast('Seu papel não permite preparar notas.');const o=pedido?db.orders.find(x=>x.id===pedido):null;
 const recentes=[...db.orders].filter(x=>x.nf).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,600);
 modal('Preparar nota de devolução',`<p class="caption" style="margin-top:-8px">O Jarvis busca a NF-e de venda do pedido no Bling e monta a nota espelhando os valores e impostos. Nada vai à SEFAZ até você emitir.</p>
 <label for="dnPed">Pedido</label><input id="dnPed" list="dnPeds" value="${esc(pedido||'')}" placeholder="Número do pedido (marketplace)" autocomplete="off"><datalist id="dnPeds">${recentes.map(x=>`<option value="${esc(x.id)}">${esc(x.customer?.name||'')} · NF ${esc(x.nf)} · ${dBR(x.date)}</option>`).join('')}</datalist>
 <div id="dnItens" style="margin-top:10px">${itensHtml(o)}</div>
 <label>Tipo</label><div class="segtabs" id="dnTipo"><button type="button" class="active" data-dn-tipo="devolucao">Devolução — o cliente devolveu</button><button type="button" data-dn-tipo="estorno">Estorno — a mercadoria não saiu</button></div>
 <label for="dnMot">Motivo (vai nas informações da nota)</label><input id="dnMot" maxlength="200" placeholder="Ex.: produto com defeito · arrependimento · pedido cancelado após faturamento">
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-dn-preparar>${icon('check')} Preparar a partir da NF-e original</button></div>`);
 const m=document.querySelector('.modalback');m.dataset.tipo='devolucao';
 m.addEventListener('input',e=>{if(e.target.id==='dnPed'){const x=db.orders.find(y=>y.id===e.target.value.trim());$('#dnItens').innerHTML=itensHtml(x)}});
 m.addEventListener('click',e=>{const b=e.target.closest('[data-dn-tipo]');if(!b)return;m.dataset.tipo=b.dataset.dnTipo;m.querySelectorAll('[data-dn-tipo]').forEach(x=>x.classList.toggle('active',x===b))})}
function itensHtml(o){if(!o)return '<p class="caption">Escolha o pedido para ver os itens.</p>';
 return `<p class="caption">${esc(o.platform)} · ${dBR(o.date)} · ${esc(o.customer?.name||'')} · NF ${esc(o.nf||'—')}</p><table><thead><tr><th>Item</th><th class="num">Vendido</th><th class="num">Devolver</th></tr></thead><tbody>${(o.items||[]).map(i=>`<tr><td>${esc(i.title||i.sku)}<br><span class="caption mono">${esc(i.sku||'')}</span></td><td class="num">${Number(i.qty)||0}</td><td class="num"><input class="ufin" type="number" min="0" max="${Number(i.qty)||0}" value="${Number(i.qty)||0}" data-dn-q="${esc(i.sku||'')}" style="width:70px"></td></tr>`).join('')}</tbody></table>`}
async function preparar(b){const ped=$('#dnPed').value.trim();if(!ped)return toast('Informe o pedido.');const m=document.querySelector('.modalback');
 const soma={};document.querySelectorAll('[data-dn-q]').forEach(i=>{const q=Number(i.value)||0;if(q>0&&i.dataset.dnQ)soma[i.dataset.dnQ]=(soma[i.dataset.dnQ]||0)+q});
 const itens=Object.entries(soma).map(([sku,qtd])=>({sku,qtd}));if(document.querySelectorAll('[data-dn-q]').length&&!itens.length)return toast('Escolha ao menos um item.');
 b.disabled=true;b.textContent='Buscando a nota no Bling…';
 try{const r=await fn('devolucao_preparar',{dados:{pedido:ped,tipo:m.dataset.tipo,motivo:$('#dnMot').value.trim(),itens:itens.length?itens:undefined}});closeModal();toast(`Nota preparada: ${money(r.total)}. Revise e emita.`);st.rows=null;await carregar();ver(r.id)}
 catch(e){b.disabled=false;b.textContent='Tentar de novo';toast(e.message)}}
async function emitir(id,b){const a=amb();if(b.dataset.conf!=='1'){b.dataset.conf='1';b.innerHTML=`${icon('nfe')} Confirmar: enviar à SEFAZ${a==='producao'?' (PRODUÇÃO — com valor fiscal)':''}`;return}
 b.disabled=true;b.textContent='Enviando…';
 try{const r=await fn('devolucao_emitir',{id,producao:a==='producao'});toast(r.status==='erro'?`Não enviada: ${r.mensagem||'erro'}`:'Nota enviada. Consultando a SEFAZ…');closeModal();st.rows=null;await carregar();if(r.status!=='erro')setTimeout(()=>consultar(id),5000)}
 catch(e){b.disabled=false;b.textContent='Tentar de novo';toast(e.message)}}
async function consultar(id,silencioso){try{const r=await fn('devolucao_consultar',{id});const x=st.rows?.find(y=>y.id===id);if(x&&r.status==='autorizado'){x.status='autorizada';if(!silencioso)toast(`Nota ${r.numero||''} autorizada${r.estoque?' · estoque devolvido no Bling':''}.`)}else if(!silencioso)toast(`SEFAZ: ${r.status}${r.mensagem?' · '+r.mensagem:''}`);
  if(r.status!=='processando_autorizacao'){st.rows=null;await carregar()}}catch(e){if(!silencioso)toast(e.message)}}

document.addEventListener('click',async e=>{const b=e.target.closest('[data-dn-filtro],[data-dn-nova],[data-dn-cand],[data-dn-ver],[data-dn-preparar],[data-dn-emitir],[data-dn-consultar],[data-dn-descartar],[data-dn-notas]');if(!b)return;const d=b.dataset;
 if(d.dnFiltro){st.filtro=d.dnFiltro;render();return}
 if(d.dnNova!=null)return nova('');if(d.dnCand)return nova(d.dnCand);if(d.dnVer)return ver(d.dnVer);
 if(d.dnPreparar!=null)return preparar(b);if(d.dnEmitir)return emitir(d.dnEmitir,b);if(d.dnConsultar)return consultar(d.dnConsultar);
 if(d.dnNotas!=null){closeModal();navigate('nfnotas');return}
 if(d.dnDescartar){if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar descarte';b.classList.add('danger');return}
  const {error}=await Cloud.client.from('nfe_devolucoes').update({status:'descartada',updated_at:new Date().toISOString()}).eq('workspace_id',Cloud.ws).eq('id',d.dnDescartar);if(error)return toast(error.message);audit('Rascunho de devolução descartado',d.dnDescartar);closeModal();st.rows=null;carregar()}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-dn-preparar-pedido]');if(b){navigate('nfdevolucao');if(b.dataset.dnPrepararPedido)setTimeout(()=>nova(b.dataset.dnPrepararPedido),50)}});
addPage('nfdevolucao','undo','Notas de devolução',view,'Devolução e estorno preparados da NF-e de venda original: mesmos valores e impostos, nota referenciada, estoque devolvido no Bling ao autorizar.','',()=>{});
window.NfDevolucao={carregar,nova,avisos:()=>{const n=(st.rows||[]).filter(r=>r.status==='rascunho').length+(st.cand||[]).length;return n?[['warn','undo',`${n} nota(s) de devolução para emitir`,'Revise e emita','nfdevolucao']]:[]}};
})();
