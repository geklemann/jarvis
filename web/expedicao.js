'use strict';
// Expedição e estoque pelo Bling: lançamento de estoque (entrada, saída, balanço) direto no Bling, com o saldo
// novo lido de volta, e etiquetas de envio dos pedidos (PDF num arquivo só para imprimir em lote, ou ZPL para
// impressora térmica). Quem lança: dono, gestão e estoque. Etiquetas: também o atendimento.
(()=>{
Object.assign(paths,{tag:'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',print:paths.print||'M6 9V3h12v6 M6 18H4v-7h16v7h-2 M6 14h12v7H6z'});
const nf=(v,d=0)=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:d});
async function fn(action,body){const r=await Cloud.client.functions.invoke('integrations',{body:{workspace_id:Cloud.ws,action,...body}});if(r.error){let msg=r.error.message;try{msg=(await r.error.context.json()).error||msg}catch{}throw Error(msg)}return r.data}
const podeLancar=()=>['owner','member','estoque'].includes(window.Cloud?.role||'owner');
const podeEtiqueta=()=>['owner','member','estoque','atendimento'].includes(window.Cloud?.role||'owner');
let depositos=null;
const OPS={E:['Entrada','Soma ao saldo: compra sem nota, devolução que voltou para a prateleira, ajuste para mais.'],S:['Saída','Tira do saldo: avaria, perda, uso interno, brinde, ajuste para menos.'],B:['Balanço','Define o saldo exato do depósito: use depois de contar a prateleira.']};

// ─────────── Lançamento de estoque ───────────
function lancar(sku){if(!podeLancar())return toast('Seu papel não permite lançar estoque.');
 const lista=(window.Estoque?.lista?.()||[]).filter(p=>p.bling_id),p=sku?lista.find(x=>x.id===sku):null;
 modal('Lançar estoque',`<p class="caption" style="margin-top:-10px">O lançamento vai direto para o Bling (o estoque oficial). O saldo novo volta para cá em seguida.</p>
 ${p?`<div class="lcprod">${p.imagem?`<img src="${esc(p.imagem)}" alt="">`:''}<div><strong>${esc(p.nome)}</strong><br><span class="caption mono">${esc(p.id)}</span></div><div class="lcsaldo"><small>Saldo atual</small><strong>${nf(p.saldo)}</strong></div></div><input type="hidden" id="lcSku" value="${esc(p.id)}">`
  :`<label for="lcBusca">Produto (SKU ou nome)</label><input id="lcBusca" list="lcLista" placeholder="Digite para buscar…" autocomplete="off"><datalist id="lcLista">${lista.map(x=>`<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</datalist><input type="hidden" id="lcSku">`}
 <label>Operação</label><div class="segtabs lcops">${Object.entries(OPS).map(([k,[t]])=>`<button type="button" class="${k==='E'?'active':''}" data-lc-op="${k}">${t}</button>`).join('')}</div><p class="caption" id="lcOpDesc">${OPS.E[1]}</p>
 <div class="grid three"><div><label for="lcQtd" id="lcQtdL">Quantidade</label><input id="lcQtd" type="number" min="0" step="1" inputmode="numeric"></div><div id="lcCustoBox"><label for="lcCusto">Custo unitário (opcional)</label><input id="lcCusto" inputmode="decimal" placeholder="${p?.custo?String(p.custo).replace('.',','):'0,00'}"></div><div><label for="lcDep">Depósito</label><select id="lcDep"><option value="">Carregando…</option></select></div></div>
 <label for="lcObs">Motivo / observação</label><input id="lcObs" maxlength="200" placeholder="Ex.: 3 unidades avariadas no transporte">
 <div class="lcprev" id="lcPrev"></div>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-lc-ok="1">${icon('check')} Lançar no Bling</button></div>`);
 const m=document.querySelector('.modalback');m.dataset.op='E';
 const prev=()=>{const s=$('#lcSku').value,x=lista.find(y=>y.id===s),q=Number($('#lcQtd').value)||0,op=m.dataset.op;if(!x){$('#lcPrev').innerHTML='';return}
  const novo=op==='E'?Number(x.saldo||0)+q:op==='S'?Number(x.saldo||0)-q:q;$('#lcPrev').innerHTML=`Saldo <strong>${nf(x.saldo)}</strong> → <strong class="${novo<0?'red':'green'}">${nf(novo)}</strong>${op==='B'?' <span class="caption">(no depósito escolhido)</span>':''}${novo<0?' <span class="red">· ficaria negativo</span>':''}`};
 m.addEventListener('input',e=>{if(e.target.id==='lcBusca'){const v=e.target.value.trim(),x=lista.find(y=>y.id===v)||lista.find(y=>y.nome===v);$('#lcSku').value=x?x.id:''}prev()});
 m.addEventListener('click',e=>{const b=e.target.closest('[data-lc-op]');if(!b)return;m.dataset.op=b.dataset.lcOp;m.querySelectorAll('[data-lc-op]').forEach(x=>x.classList.toggle('active',x===b));$('#lcOpDesc').textContent=OPS[m.dataset.op][1];$('#lcQtdL').textContent=m.dataset.op==='B'?'Saldo contado':'Quantidade';$('#lcCustoBox').style.visibility=m.dataset.op==='E'?'':'hidden';prev()});
 (depositos?Promise.resolve(depositos):fn('estoque_depositos',{}).then(d=>depositos=d)).then(ds=>{const s=$('#lcDep');if(!s)return;s.innerHTML=ds.map(d=>`<option value="${d.id}" ${d.padrao?'selected':''}>${esc(d.descricao)}${d.padrao?' (padrão)':''}</option>`).join('')||'<option value="">Depósito padrão</option>'}).catch(x=>{const s=$('#lcDep');if(s)s.innerHTML='<option value="">Depósito padrão</option>';toast('Depósitos: '+x.message)});
 setTimeout(()=>($('#lcBusca')||$('#lcQtd'))?.focus(),50)}
async function confirmar(b){const m=document.querySelector('.modalback'),sku=$('#lcSku').value,lista=window.Estoque?.lista?.()||[],x=lista.find(y=>y.id===sku),op=m.dataset.op,q=$('#lcQtd').value;
 if(!x)return toast('Escolha o produto.');if(q===''||(op!=='B'&&!(Number(q)>0)))return toast('Informe a quantidade.');
 const ok=m.querySelector('[data-lc-ok]');if(ok.dataset.conf!=='1'){ok.dataset.conf='1';ok.innerHTML=`${icon('check')} Confirmar ${OPS[op][0].toLowerCase()} de ${nf(q)} un.`;ok.classList.add('danger');return}
 b.disabled=true;b.textContent='Lançando no Bling…';
 try{const r=await fn('estoque_lancar',{dados:{produto:x.bling_id,sku:x.id,operacao:op,quantidade:q,custo:op==='E'?$('#lcCusto').value.trim():'',deposito:$('#lcDep').value,observacao:$('#lcObs').value.trim()}});
  if(r.saldo!=null)x.saldo=r.saldo;audit(`Estoque lançado no Bling (${OPS[op][0].toLowerCase()})`,`${x.id} · ${q} un.${r.saldo!=null?' · saldo '+r.saldo:''}`);
  closeModal();toast(`${OPS[op][0]} lançada no Bling.${r.saldo!=null?` Saldo agora: ${nf(r.saldo)}.`:''}`);window.Estoque?.recalc?.();render()}
 catch(e){b.disabled=false;b.textContent='Tentar de novo';ok.dataset.conf='';toast(e.message)}}

// ─────────── Etiquetas de envio ───────────
const sel=new Set();
function pedidosDia(data,canal){return db.orders.filter(o=>o.date===data&&(!canal||o.platform===canal))}
function blocoEtiquetas(data,canal){if(!podeEtiqueta())return '';const l=pedidosDia(data,canal).sort((a,b)=>String(a.external?.bling_numero||a.id).localeCompare(String(b.external?.bling_numero||b.id),undefined,{numeric:true}));
 const comB=l.filter(o=>o.external?.bling_id);for(const id of [...sel])if(!comB.some(o=>String(o.external.bling_id)===id))sel.delete(id);
 return `<div class="tablebox"><div class="tabletop"><div><h2>Etiquetas de envio</h2><p class="caption">As etiquetas vêm do Bling (Mercado Envios, Shopee Xpress, Correios…). Marque os pedidos e gere um PDF único para imprimir de uma vez.</p></div>
 <div class="row wrap"><select id="etFmt" aria-label="Formato"><option value="PDF">PDF (impressora comum ou térmica)</option><option value="ZPL">ZPL (Zebra / Elgin / Argox)</option></select><button class="small" data-et="todos">${sel.size&&sel.size===comB.length?'Desmarcar todos':'Marcar todos'}</button><button class="small primary" data-et="gerar" ${sel.size?'':'disabled'}>${icon('tag')} Gerar ${sel.size||''} etiqueta(s)</button></div></div>
 <div class="tablewrap"><table><thead><tr><th style="width:36px"></th><th>Pedido</th><th>Canal</th><th>Cliente</th><th>Itens</th><th class="num">Valor</th></tr></thead><tbody>
 ${l.map(o=>{const bid=o.external?.bling_id?String(o.external.bling_id):'';return `<tr class="${bid?'clickrow':''}" ${bid?`data-et-sel="${esc(bid)}"`:''}><td>${bid?`<input type="checkbox" class="check" ${sel.has(bid)?'checked':''} tabindex="-1" aria-label="Selecionar">`:''}</td><td><strong>${esc(o.external?.bling_numero||o.id)}</strong>${bid?'':'<br><span class="caption">sem vínculo com o Bling</span>'}</td><td>${esc(o.platform)}</td><td>${esc(o.customer?.name||'—')}</td><td class="caption">${(o.items||[]).map(i=>`${nf(i.qty)}× ${esc(i.sku||i.title)}`).join(', ')}</td><td class="num">${money(o.gross)}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Nenhum pedido nesta data.</td></tr>'}</tbody></table></div></div>`}
async function gerar(b){const fmt=$('#etFmt')?.value||'PDF',ids=[...sel];b.disabled=true;b.innerHTML=`${icon('tag')} Buscando ${ids.length} etiqueta(s) no Bling…`;
 try{const r=await fn('etiquetas',{dados:{ids,formato:fmt}});const falhas=r.resultado.filter(x=>!x.ok),num=id=>{const o=db.orders.find(o=>String(o.external?.bling_id)===String(id));return o?.external?.bling_numero||o?.id||id};
  if(r.arquivo){const bin=Uint8Array.from(atob(r.arquivo),c=>c.charCodeAt(0)),blob=new Blob([bin],{type:fmt==='PDF'?'application/pdf':'text/plain'}),url=URL.createObjectURL(blob);
   if(fmt==='PDF'){const w=window.open(url,'_blank');if(!w)baixar(url,`etiquetas-${hojeISO()}.pdf`)}else baixar(url,`etiquetas-${hojeISO()}.zpl`);audit('Etiquetas de envio geradas',`${r.geradas} em ${fmt}`)}
  if(falhas.length)modal('Etiquetas',`<p>${r.geradas?`<strong>${r.geradas}</strong> etiqueta(s) gerada(s). `:''}${falhas.length} pedido(s) sem etiqueta:</p><div class="tablewrap"><table><thead><tr><th>Pedido</th><th>Motivo</th></tr></thead><tbody>${falhas.map(f=>`<tr><td><strong>${esc(num(f.id))}</strong></td><td class="caption">${esc(f.motivo||'')}</td></tr>`).join('')}</tbody></table></div><p class="caption">Etiqueta só existe depois que o pedido tem a logística definida no Bling (frete do marketplace emitido). Pedidos Full/Flex podem não ter etiqueta pelo Bling.</p><div class="modalfoot"><button class="primary" data-action="close">Entendi</button></div>`);
  else toast(`${r.geradas} etiqueta(s) prontas.`)}
 catch(e){toast(e.message)}b.disabled=false;render()}
const hojeISO=()=>new Date().toLocaleDateString('sv-SE');
function baixar(url,nome){const a=document.createElement('a');a.href=url;a.download=nome;document.body.appendChild(a);a.click();a.remove()}

document.addEventListener('click',e=>{const b=e.target.closest('[data-lc-abrir],[data-lc-ok],[data-et],[data-et-sel]');if(!b)return;const d=b.dataset;
 if(d.lcAbrir!==undefined){closeModal?.();lancar(d.lcAbrir);return}
 if(d.lcOk){confirmar(b);return}
 if(d.etSel){e.preventDefault();sel.has(d.etSel)?sel.delete(d.etSel):sel.add(d.etSel);render();return}
 if(d.et==='todos'){const box=b.closest('.tablebox'),ids=[...box.querySelectorAll('[data-et-sel]')].map(x=>x.dataset.etSel);if(sel.size===ids.length)sel.clear();else ids.forEach(i=>sel.add(i));render();return}
 if(d.et==='gerar'){gerar(b);return}});
window.Expedicao={lancar,blocoEtiquetas,podeLancar};
})();
