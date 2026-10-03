'use strict';
// Movimentação de estoque (kardex por item). Junta num extrato só o que mexeu no saldo de cada produto:
// entradas pelas notas de compra e vendas dos marketplaces (que o Bling já baixa sozinho) e os movimentos que
// nascem no Jarvis — venda direta, cancelamento, devolução, inventário, perda, avaria, brinde, uso interno —,
// registrados em estoque_movimentos e enviados ao Bling (na hora e, se falhar, pelo cron a cada 2 min).
// O id do movimento é determinístico (origem:documento:sku): o mesmo documento nunca movimenta duas vezes.
(()=>{
Object.assign(paths,{kardex:'M4 4h16v16H4z M4 9h16 M4 14h16 M9 4v16'});
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const addDias=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toLocaleDateString('sv-SE')};
const dBR=d=>d?new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const nf=(v,d=0)=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:d});
const quem=()=>window.Cloud?.session?.user?.email||'local';
const MOTIVOS={venda_direta:'Venda direta',cancelamento_venda:'Cancelamento de venda',devolucao_venda:'Devolução de cliente',devolucao_compra:'Devolução ao fornecedor',compra_sem_nota:'Compra sem nota',inventario:'Inventário',ajuste:'Ajuste',perda:'Perda',avaria:'Avaria',brinde:'Brinde',uso_interno:'Uso interno',amostra:'Amostra',estorno:'Estorno'};
const MANUAIS={E:['compra_sem_nota','devolucao_venda','ajuste'],S:['perda','avaria','brinde','uso_interno','amostra','devolucao_compra','ajuste']};
const ST={pendente:['a enviar','warn'],enviado:['no Bling','ok'],erro:['erro no envio','bad'],nao_enviar:['só no Jarvis','']};
const st={movs:null,carregando:false,sku:'',dias:90,filtro:'todos'};
window.Reiniciar?.registrar(st,['sku','dias','filtro']); // estado de tela: volta ao original ao clicar no menu
const cfg=()=>({inicio:'',...(db.gerencial?.kardex||{})});
// Documentos anteriores ao início do kardex não geram movimento (evita lançar de novo o que já foi ajustado à mão).
function inicio(){let i=cfg().inicio;if(!i){i=hoje();db.gerencial={...(db.gerencial||{}),kardex:{...cfg(),inicio:i}};save()}return i}
const podeLancar=()=>['owner','member','estoque'].includes(window.Cloud?.role||'owner');
const podeCriar=()=>['owner','member','estoque','vendas','financeiro'].includes(window.Cloud?.role||'owner');

async function fn(action,body){const r=await Cloud.client.functions.invoke('integrations',{body:{workspace_id:Cloud.ws,action,...body}});if(r.error){let msg=r.error.message;try{msg=(await r.error.context.json()).error||msg}catch{}throw Error(msg)}return r.data}
async function carregar(){if(st.carregando||!window.Cloud?.client)return;st.carregando=true;
 try{const {data,error}=await Cloud.client.from('estoque_movimentos').select('*').eq('workspace_id',Cloud.ws).order('created_at',{ascending:false}).limit(3000);if(error)throw error;st.movs=data||[]}
 catch(e){st.movs=st.movs||[];toast('Movimentos de estoque: '+e.message)}finally{st.carregando=false}
 if(!(window.Estoque?.lista?.()||[]).length){try{await window.Estoque?.carregar?.()}catch{}}
 if(page==='movestoque')render()}
const produtos=()=>window.Estoque?.lista?.()||[];
const prod=sku=>produtos().find(p=>p.id===sku);

// Registra movimentos (ignora os que já existem) e manda para o Bling na hora. Devolve o resultado do envio.
async function registrar(lista,{enviar=true}={}){if(!window.Cloud?.client||!lista.length)return {enviados:0,erros:0};
 const rows=lista.filter(m=>m.sku&&Number(m.quantidade)>=0).map(m=>({workspace_id:Cloud.ws,id:m.id,data:m.data||hoje(),sku:String(m.sku).trim(),produto_bling:prod(String(m.sku).trim())?.bling_id||null,operacao:m.operacao,quantidade:Math.abs(Number(m.quantidade)),custo:m.custo??null,motivo:m.motivo,origem:m.origem||'manual',referencia:m.referencia||null,documento:m.documento||null,observacao:m.observacao||null,bling_status:m.bling_status||'pendente',criado_por:quem()}));
 const {error}=await Cloud.client.from('estoque_movimentos').upsert(rows,{onConflict:'workspace_id,id',ignoreDuplicates:true});if(error)throw error;
 let r={enviados:0,erros:0};if(enviar){try{r=await fn('estoque_mov_enviar',{dados:{ids:rows.filter(x=>x.bling_status==='pendente').map(x=>x.id)}})}catch(e){r={enviados:0,erros:rows.length,falha:e.message}}}
 await carregar();window.Estoque?.recalc?.();return r}
const resumo=(r,n)=>r.falha?`${n} movimento(s) registrado(s); o envio ao Bling falhou (${r.falha}) — o Jarvis tenta de novo sozinho.`:`${n} movimento(s) · ${r.enviados||0} no Bling${r.erros?` · ${r.erros} com erro (veja Movimentação de estoque)`:''}`;

// ─── Origens automáticas ───
async function deVendaDireta(v,doc,{enviar=true}={}){if(!v||v.status!=='faturado'||String(v.emissao||hoje())<inicio())return null;
 const itens=(v.itens||[]).filter(i=>i.sku&&Number(i.qtd)>0);if(!itens.length)return null;
 const soma={};for(const i of itens)soma[i.sku]=(soma[i.sku]||0)+Number(i.qtd);
 const r=await registrar(Object.entries(soma).map(([sku,q])=>({id:`vd:${v.id}:${sku}`,sku,operacao:'S',quantidade:q,motivo:'venda_direta',origem:'vendas_diretas',referencia:v.id,documento:doc||`Venda direta nº ${v.numero||''}${v.nfe_ref?' · '+v.nfe_ref:''}`,data:v.emissao||hoje(),bling_status:enviar?'pendente':'nao_enviar'})),{enviar});
 toast('Estoque: '+resumo(r,Object.keys(soma).length));return r}
async function cancelouVendaDireta(v){if(!st.movs)await carregar();const saidas=(st.movs||[]).filter(m=>m.origem==='vendas_diretas'&&m.referencia===v.id&&m.operacao==='S');if(!saidas.length)return null;
 const r=await registrar(saidas.map(m=>({id:`vdc:${v.id}:${m.sku}`,sku:m.sku,operacao:'E',quantidade:m.quantidade,motivo:'cancelamento_venda',origem:'vendas_diretas',referencia:v.id,documento:`Cancelamento da venda nº ${v.numero||''}`})));
 toast('Estoque: '+resumo(r,saidas.length));return r}
// Inventário concluído: a diferença de cada item vira entrada ou saída (não balanço — funciona com mais de um depósito).
async function deInventario(inv,sis){const out=[];for(const [sku,c] of Object.entries(inv.contagens||{})){const d=(Number(c.qtd)||0)-(Number(sis?.[sku])||0);if(Math.abs(d)<0.0005)continue;
  out.push({id:`inv:${inv.id}:${sku}`,sku,operacao:d>0?'E':'S',quantidade:Math.abs(d),motivo:'inventario',origem:'inventarios',referencia:inv.id,documento:`Inventário ${inv.nome}`,observacao:`contado ${c.qtd} · sistema ${Number(sis?.[sku])||0}`})}
 if(!out.length){toast('Inventário sem diferenças: nada a ajustar.');return null}
 const r=await registrar(out);toast('Ajuste do inventário: '+resumo(r,out.length));return r}
// Devolução: entrada de volta (cliente) ou saída (fornecedor) — usada pela nota de devolução.
async function deDevolucao({id,itens,cliente=true,documento}){const out=(itens||[]).filter(i=>i.sku&&Number(i.qtd)>0).map(i=>({id:`dev:${id}:${i.sku}`,sku:i.sku,operacao:cliente?'E':'S',quantidade:Number(i.qtd),motivo:cliente?'devolucao_venda':'devolucao_compra',origem:'devolucoes',referencia:id,documento}));
 if(!out.length)return null;const r=await registrar(out);toast('Estoque: '+resumo(r,out.length));return r}
// Vendas diretas faturadas depois do início do kardex que ficaram sem movimento (ex.: o envio caiu no meio).
let conferindo=false;
async function conferirPendencias(){if(conferindo)return;conferindo=true;try{await conferir()}finally{conferindo=false}}
async function conferir(){const vs=window.VendaDireta?.vendas?.()||[];if(!vs.length||!st.movs)return;const ini=inicio(),com=new Set(st.movs.filter(m=>m.origem==='vendas_diretas').map(m=>m.referencia));
 for(const v of vs.filter(v=>v.status==='faturado'&&String(v.emissao||'')>=ini&&!com.has(v.id)))await deVendaDireta(v).catch(e=>toast(e.message))}

// ─── Extrato do item ───
function extrato(sku,desde){const L=[];
 for(const n of db.purchases||[])if(String(n.emissao||'')>=desde&&String(n.situacao||'').toLowerCase()!=='cancelada')for(const it of n.itens||[])if(String(it.sku||'').trim()===sku)L.push({d:n.emissao,t:n.tipo==='devolucao'?'Devolução (nota de entrada)':'Compra (nota de entrada)',doc:`NF ${n.numero||''} · ${n.fornecedor||''}`,q:Number(it.qtd)||0,u:Number(it.valor)||0,fonte:'bling'});
 for(const o of db.orders||[])if(String(o.date||'')>=desde&&!/cancel/i.test(o.note||''))for(const it of o.items||[])if(String(it.sku||'').trim()===sku)L.push({d:o.date,t:`Venda · ${o.platform}`,doc:`Pedido ${o.id}`,q:-(Number(it.qty)||0),u:Number(it.price)||0,fonte:'bling'});
 for(const m of st.movs||[])if(m.sku===sku&&String(m.data)>=desde)L.push({d:m.data,t:MOTIVOS[m.motivo]||m.motivo,doc:m.documento||m.observacao||'',q:m.operacao==='E'?Number(m.quantidade):m.operacao==='S'?-Number(m.quantidade):null,bal:m.operacao==='B'?Number(m.quantidade):null,u:Number(m.custo)||0,fonte:'jarvis',m});
 L.sort((a,b)=>String(b.d).localeCompare(String(a.d))||(b.m?.created_at||'').localeCompare(a.m?.created_at||''));
 // Saldo reconstruído de trás para frente a partir do saldo atual do Bling; o que ainda não chegou ao Bling não entra.
 let s=Number(prod(sku)?.saldo);let ok=Number.isFinite(s);
 for(const x of L){const noBling=x.fonte==='bling'||x.m?.bling_status==='enviado';x.saldo=ok&&noBling?s:null;if(!noBling)continue;if(x.bal!=null){ok=false;continue}if(ok)s-=x.q}
 return L}
function itemView(){const p=prod(st.sku),desde=addDias(hoje(),-st.dias),L=extrato(st.sku,desde);
 const ent=L.filter(x=>x.q>0).reduce((a,x)=>a+x.q,0),sai=L.filter(x=>x.q<0).reduce((a,x)=>a-x.q,0),pend=L.filter(x=>x.m&&x.m.bling_status!=='enviado');
 return `<div class="row" style="margin-bottom:12px;gap:10px;flex-wrap:wrap"><button class="small" data-kx-voltar>‹ Todos os itens</button>${p?.imagem?`<img src="${esc(p.imagem)}" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover">`:''}<div><h2 style="margin:0">${esc(p?.nome||st.sku)}</h2><span class="caption mono">${esc(st.sku)}${p?.bling_id?' · Bling '+esc(p.bling_id):' · sem vínculo com o Bling'}</span></div><div style="flex:1"></div>${podeLancar()?`<button class="primary small" data-kx-novo="${esc(st.sku)}">${icon('plus')} Novo movimento</button>`:''}</div>
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Saldo no Bling</span><span class="kpiv ${Number(p?.saldo)<=0?'red':''}">${p?nf(p.saldo):'—'}</span><span class="kpis">${p?.custo?'custo '+money(p.custo):''}</span></div><div class="card kpi"><span class="kpil">Entradas</span><span class="kpiv green">+${nf(ent)}</span><span class="kpis">últimos ${st.dias} dias</span></div><div class="card kpi"><span class="kpil">Saídas</span><span class="kpiv">−${nf(sai)}</span><span class="kpis">vendas, perdas, ajustes</span></div><div class="card kpi"><span class="kpil">A enviar ao Bling</span><span class="kpiv ${pend.length?'gold':''}">${pend.length}</span><span class="kpis">${pend.length?'o Jarvis reenvia sozinho':'tudo sincronizado'}</span></div></div>
 <div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Data</th><th>Movimento</th><th>Documento</th><th>Onde</th><th class="num">Entrada</th><th class="num">Saída</th><th class="num">Saldo</th></tr></thead><tbody>
 ${L.slice(0,600).map(x=>{const [tx,tom]=x.m?ST[x.m.bling_status]||[x.m.bling_status,'']:['Bling','info'];
  return `<tr><td>${dBR(x.d)}</td><td>${esc(x.t)}${x.m?.criado_por?`<br><span class="caption">${esc(String(x.m.criado_por).split('@')[0])}</span>`:''}</td><td class="caption">${esc(x.doc)}</td><td><span class="badge ${tom}" ${x.m?.bling_erro?`title="${esc(x.m.bling_erro)}"`:''}>${x.m?'Jarvis · ':''}${esc(tx)}</span>${x.m?.bling_status==='erro'?`<br><span class="caption red">${esc(String(x.m.bling_erro||'').slice(0,80))}</span>`:''}</td>
  <td class="num green">${x.q>0?'+'+nf(x.q,3):x.bal!=null?'= '+nf(x.bal,3):''}</td><td class="num red">${x.q<0?'−'+nf(-x.q,3):''}</td><td class="num">${x.saldo==null?'<span class="caption">—</span>':nf(x.saldo,3)}</td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Sem movimento no período.</td></tr>'}</tbody></table></div></div>
 <p class="caption">Saldo reconstruído a partir do saldo atual do Bling, de trás para frente. Compras e vendas de marketplace são baixadas pelo próprio Bling; os movimentos marcados "Jarvis" nasceram aqui e foram enviados ao Bling.</p>`}

// ─── Visão geral: itens com movimento e movimentos do Jarvis ───
function geralView(){const desde=addDias(hoje(),-st.dias),agg=new Map(),add=(sku,q)=>{if(!sku)return;const a=agg.get(sku)||{e:0,s:0,n:0};q>0?a.e+=q:a.s-=q;a.n++;agg.set(sku,a)};
 for(const n of db.purchases||[])if(String(n.emissao||'')>=desde)for(const it of n.itens||[])add(String(it.sku||'').trim(),Number(it.qtd)||0);
 for(const o of db.orders||[])if(String(o.date||'')>=desde)for(const it of o.items||[])add(String(it.sku||'').trim(),-(Number(it.qty)||0));
 for(const m of st.movs||[])if(String(m.data)>=desde&&m.operacao!=='B')add(m.sku,m.operacao==='E'?Number(m.quantidade):-Number(m.quantidade));
 const busca=normalized(st.busca||''),itens=[...agg.entries()].map(([sku,a])=>({sku,...a,p:prod(sku)})).filter(x=>!busca||normalized(`${x.sku} ${x.p?.nome||''}`).includes(busca)).sort((a,b)=>(b.e+b.s)-(a.e+a.s));
 const movs=(st.movs||[]).filter(m=>st.filtro==='todos'||(st.filtro==='pend'?['pendente','erro'].includes(m.bling_status):m.bling_status===st.filtro)),pend=(st.movs||[]).filter(m=>['pendente','erro'].includes(m.bling_status));
 return `<div class="crmbar" style="flex-wrap:wrap"><input data-kx="busca" placeholder="Buscar produto (SKU ou nome)" value="${esc(st.busca||'')}" list="kxLista" style="flex:1;min-width:240px"><datalist id="kxLista">${produtos().slice(0,3000).map(p=>`<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</datalist>
 <select data-kx="dias">${[30,60,90,180,365].map(d=>`<option value="${d}" ${st.dias===d?'selected':''}>${d} dias</option>`).join('')}</select>${podeLancar()?`<button class="primary small" data-kx-novo="">${icon('plus')} Novo movimento</button>`:''}</div>
 <div class="grid two" style="align-items:start"><section class="tablebox"><div class="tabletop"><h2>Itens com movimento</h2><span class="caption">${itens.length} item(ns) · clique para ver o extrato</span></div><div class="tablewrap" style="max-height:560px"><table><thead><tr><th>Produto</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th></tr></thead><tbody>
 ${itens.slice(0,400).map(x=>`<tr class="clickrow" data-kx-sku="${esc(x.sku)}"><td><strong>${esc(x.p?.nome||x.sku)}</strong><br><span class="caption mono">${esc(x.sku)}</span></td><td class="num green">${x.e?'+'+nf(x.e):''}</td><td class="num">${x.s?'−'+nf(x.s):''}</td><td class="num">${x.p?nf(x.p.saldo):'—'}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nada no período.</td></tr>'}</tbody></table></div></section>
 <section class="tablebox"><div class="tabletop"><h2>Movimentos do Jarvis</h2><div class="row"><select data-kx="filtro"><option value="todos">Todos</option><option value="pend" ${st.filtro==='pend'?'selected':''}>A enviar / erro (${pend.length})</option><option value="enviado" ${st.filtro==='enviado'?'selected':''}>No Bling</option></select>${pend.length&&podeCriar()?`<button class="small" data-kx-enviar>${icon('refresh')} Enviar ao Bling</button>`:''}</div></div>
 <div class="tablewrap" style="max-height:560px"><table><thead><tr><th>Data</th><th>Produto · motivo</th><th class="num">Qtd.</th><th>Bling</th><th></th></tr></thead><tbody>
 ${movs.slice(0,300).map(m=>{const [tx,tom]=ST[m.bling_status]||[m.bling_status,''],ja=(st.movs||[]).some(x=>x.id===`est:${m.id}`);return `<tr><td>${dBR(m.data)}</td><td><a href="#" data-kx-sku="${esc(m.sku)}">${esc(prod(m.sku)?.nome||m.sku)}</a><br><span class="caption">${esc(MOTIVOS[m.motivo]||m.motivo)}${m.documento?' · '+esc(m.documento):''}</span></td><td class="num ${m.operacao==='S'?'red':'green'}">${m.operacao==='E'?'+':m.operacao==='S'?'−':'='}${nf(m.quantidade,3)}</td><td><span class="badge ${tom}" ${m.bling_erro?`title="${esc(m.bling_erro)}"`:''}>${esc(tx)}</span>${m.saldo_apos!=null?`<br><span class="caption">saldo ${nf(m.saldo_apos,3)}</span>`:''}</td>
  <td>${m.bling_status==='erro'&&podeCriar()?`<button class="small quiet" data-kx-reenviar="${esc(m.id)}">Reenviar</button>`:''}${m.bling_status==='enviado'&&m.operacao!=='B'&&m.motivo!=='estorno'&&!ja&&podeLancar()?`<button class="small quiet" data-kx-estornar="${esc(m.id)}">Estornar</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="5" class="empty">Nenhum movimento lançado pelo Jarvis ainda.</td></tr>'}</tbody></table></div></section></div>
 <p class="caption">Geram movimento automático: venda direta faturada (saída), cancelamento de venda (entrada), inventário concluído (entrada ou saída da diferença) e nota de devolução (entrada do cliente ou saída ao fornecedor). Documentos anteriores a ${dBR(inicio())} ficam de fora, para não lançar de novo o que já foi ajustado no Bling.</p>`}
function view(){if(!st.movs){carregar();return '<div class="empty">Carregando movimentos…</div>'}
 setTimeout(()=>conferirPendencias().catch(()=>{}),0);return st.sku?itemView():geralView()}

function novoMovimento(sku){if(!podeLancar())return toast('Seu papel não permite lançar estoque.');const lista=produtos().filter(p=>p.bling_id),p=sku?prod(sku):null;
 modal('Novo movimento de estoque',`<p class="caption" style="margin-top:-8px">Fica no kardex do Jarvis e vai para o Bling na hora.</p>
 ${p?`<p><strong>${esc(p.nome)}</strong> <span class="caption mono">${esc(p.id)}</span> · saldo ${nf(p.saldo)}</p><input type="hidden" id="kxSku" value="${esc(p.id)}">`:`<label for="kxBusca">Produto (SKU)</label><input id="kxBusca" list="kxLista2" autocomplete="off" placeholder="Digite o SKU ou o nome"><datalist id="kxLista2">${lista.map(x=>`<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</datalist><input type="hidden" id="kxSku">`}
 <div class="grid three"><div><label for="kxOp">Operação</label><select id="kxOp"><option value="S">Saída</option><option value="E">Entrada</option></select></div><div><label for="kxMot">Motivo</label><select id="kxMot">${MANUAIS.S.map(m=>`<option value="${m}">${MOTIVOS[m]}</option>`).join('')}</select></div><div><label for="kxQtd">Quantidade</label><input id="kxQtd" type="number" min="0" step="1"></div></div>
 <div class="grid two"><div><label for="kxDoc">Documento (opcional)</label><input id="kxDoc" maxlength="80" placeholder="Ex.: atendimento 123, NF 456"></div><div id="kxCustoBox" style="visibility:hidden"><label for="kxCusto">Custo unitário (entrada)</label><input id="kxCusto" inputmode="decimal"></div></div>
 <label for="kxObs">Observação</label><input id="kxObs" maxlength="160" placeholder="Ex.: 2 unidades quebradas no transporte">
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-kx-salvar>${icon('check')} Registrar e enviar ao Bling</button></div>`);
 const m=document.querySelector('.modalback');
 m.addEventListener('change',e=>{if(e.target.id==='kxOp'){const op=e.target.value;$('#kxMot').innerHTML=MANUAIS[op].map(x=>`<option value="${x}">${MOTIVOS[x]}</option>`).join('');$('#kxCustoBox').style.visibility=op==='E'?'':'hidden'}});
 m.addEventListener('input',e=>{if(e.target.id==='kxBusca'){const v=e.target.value.trim(),x=lista.find(y=>y.id===v)||lista.find(y=>y.nome===v);$('#kxSku').value=x?x.id:''}});
 setTimeout(()=>($('#kxBusca')||$('#kxQtd'))?.focus(),50)}
async function salvarNovo(b){const sku=$('#kxSku').value,op=$('#kxOp').value,q=Number($('#kxQtd').value);if(!sku)return toast('Escolha o produto.');if(!(q>0))return toast('Informe a quantidade.');
 const custo=op==='E'&&$('#kxCusto').value.trim()?Number($('#kxCusto').value.replace(/\./g,'').replace(',','.')):null;
 b.disabled=true;b.textContent='Enviando ao Bling…';
 try{const id=`man:${Date.now().toString(36)}:${sku}`;const r=await registrar([{id,sku,operacao:op,quantidade:q,custo,motivo:$('#kxMot').value,origem:'manual',documento:$('#kxDoc').value.trim()||null,observacao:$('#kxObs').value.trim()||null}]);
  audit('Movimento de estoque',`${sku} · ${op==='E'?'+':'−'}${q} · ${MOTIVOS[$('#kxMot').value]}`);closeModal();toast(resumo(r,1));render()}
 catch(e){b.disabled=false;b.textContent='Tentar de novo';toast(e.message)}}

document.addEventListener('click',async e=>{const b=e.target.closest('[data-kx-sku],[data-kx-voltar],[data-kx-novo],[data-kx-salvar],[data-kx-enviar],[data-kx-reenviar],[data-kx-estornar]');if(!b)return;const d=b.dataset;
 if(d.kxSku!=null){e.preventDefault();if(document.querySelector('.modalback'))closeModal();st.sku=d.kxSku;if(page!=='movestoque')navigate('movestoque');else render();return}
 if(d.kxVoltar!=null){st.sku='';render();return}
 if(d.kxNovo!=null)return novoMovimento(d.kxNovo);
 if(d.kxSalvar!=null)return salvarNovo(b);
 if(d.kxEnviar!=null||d.kxReenviar){b.disabled=true;try{const r=await fn('estoque_mov_enviar',{dados:{ids:d.kxReenviar?[d.kxReenviar]:(st.movs||[]).filter(m=>['pendente','erro'].includes(m.bling_status)).map(m=>m.id)}});toast(`${r.enviados} enviado(s) ao Bling${r.erros?` · ${r.erros} com erro`:''}.`)}catch(x){toast(x.message)}await carregar();return}
 if(d.kxEstornar){const m=(st.movs||[]).find(x=>x.id===d.kxEstornar);if(!m)return;if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar estorno';b.classList.add('danger');return}
  b.disabled=true;try{const r=await registrar([{id:`est:${m.id}`,sku:m.sku,operacao:m.operacao==='E'?'S':'E',quantidade:m.quantidade,custo:m.custo,motivo:'estorno',origem:m.origem,referencia:m.referencia,documento:`Estorno de: ${MOTIVOS[m.motivo]||m.motivo}${m.documento?' · '+m.documento:''}`}]);audit('Estorno de movimento de estoque',`${m.sku} · ${m.quantidade}`);toast(resumo(r,1))}catch(x){b.disabled=false;toast(x.message)}}});
document.addEventListener('change',e=>{const s=e.target.closest('[data-kx]');if(!s)return;const k=s.dataset.kx;
 if(k==='dias'){st.dias=Number(s.value)||90;render()}else if(k==='filtro'){st.filtro=s.value;render()}
 else if(k==='busca'){const v=s.value.trim();if(prod(v)){st.sku=v;st.busca='';render()}}});
document.addEventListener('input',e=>{const s=e.target.closest('[data-kx="busca"]');if(!s)return;st.busca=s.value;const pos=s.selectionStart;render();const n=document.querySelector('[data-kx="busca"]');if(n){n.focus();n.setSelectionRange(pos,pos)}});
addPage('movestoque','kardex','Movimentos de estoque',view,'Extrato de cada produto: compras, vendas, devoluções, inventários e ajustes — com o que o Jarvis já enviou ao Bling.','',()=>{});
window.Kardex={registrar,deVendaDireta,cancelouVendaDireta,deInventario,deDevolucao,carregar,abrir:sku=>{st.sku=sku||'';navigate('movestoque')},movimentos:()=>st.movs||[]};
})();
