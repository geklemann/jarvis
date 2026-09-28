'use strict';
// Assistente de IA (Claude). O modelo pede ferramentas; elas rodam aqui, sobre os dados carregados.
// Vínculos sugeridos pela IA viram propostas que o usuário revisa e confirma — nada financeiro é gravado sozinho.
// Os nomes e parâmetros das ferramentas precisam coincidir com supabase/functions/ai-assistant/prompt.ts.
(()=>{
const MKT=['Mercado Livre','Shopee','Magalu'];
const I=()=>window.Insights;
const byMonth=m=>db.orders.filter(o=>o.date.startsWith(m));
const pick=(v,max=200,def=30)=>Math.max(1,Math.min(max,Number(v)||def));
const orderOut=o=>({pedido:o.id,nf:o.nf||'',plataforma:o.platform,data:o.date,bruto:o.gross,taxa:o.fee,liquido:net(o),recebido:paid(o),saldo:round(net(o)-paid(o)),status:status(o),uf:o.state||o.customer?.state||'',cliente:o.customer?.name||'',anotacao:o.note||undefined});
const monthOf=i=>{const m=i?.mes||month;if(m!=='todos'&&!/^\d{4}-\d{2}$/.test(m))throw Error('Competência deve estar no formato AAAA-MM.');return m};

const tools={
 resumo_competencia(i){const m=monthOf(i),rows=byMonth(m),rs=db.receipts.filter(r=>r.date.startsWith(m)),un=rs.filter(r=>!r.linkedOrder),count=s=>rows.filter(o=>status(o)===s).length;
  return {competencia:m,fechada:!!db.closures[m],total:stats(rows),por_plataforma:MKT.map(p=>({plataforma:p,...stats(rows.filter(o=>o.platform===p))})),pedidos_por_status:{Conciliado:count('Conciliado'),'Divergência':count('Divergência'),'A receber':count('A receber'),'Em trânsito':count('Em trânsito')},liberacoes:{total:rs.length,sem_vinculo:un.length,valor_sem_vinculo:round(un.reduce((a,r)=>a+r.amount,0))},competencias_com_dados:[...new Set(db.orders.map(o=>o.date.slice(0,7)))].sort()}},
 listar_pedidos(i){const m=monthOf(i);let rows=m==='todos'?db.orders:byMonth(m);if(i.plataforma)rows=rows.filter(o=>o.platform===i.plataforma);if(i.status)rows=rows.filter(o=>i.status==='Pendentes'?status(o)!=='Conciliado':status(o)===i.status);if(i.busca){const q=String(i.busca).toLowerCase();rows=rows.filter(o=>`${o.id} ${o.nf} ${o.customer?.name||''}`.toLowerCase().includes(q))}
  return {encontrados:rows.length,pedidos:rows.slice(0,pick(i.limite)).map(orderOut)}},
 listar_liberacoes(i){const m=monthOf(i);let rs=m==='todos'?db.receipts:db.receipts.filter(r=>r.date.startsWith(m));if(i.plataforma)rs=rs.filter(r=>r.platform===i.plataforma);if(i.sem_vinculo)rs=rs.filter(r=>!r.linkedOrder);
  return {encontradas:rs.length,valor_total:round(rs.reduce((a,r)=>a+r.amount,0)),liberacoes:rs.slice(0,pick(i.limite)).map(r=>({liberacao:r.id,pedido_informado:r.orderId||'',pedido_vinculado:r.linkedOrder||'',plataforma:r.platform,conta:r.account,data:r.date,valor:r.amount,descricao:r.description||undefined}))}},
 sugerir_vinculos(i){const m=monthOf(i),rows=byMonth(m).filter(o=>status(o)!=='Conciliado'&&!db.closures[m]);const out=[];for(const o of rows){const cs=candidates(o);if(cs.length)out.push({pedido:o.id,plataforma:o.platform,data:o.date,saldo_aberto:round(net(o)-paid(o)),candidatos:cs.slice(0,3).map(c=>({liberacao:c.r.id,valor:c.r.amount,data:c.r.date,pedido_informado:c.r.orderId||'',pontuacao:c.score,pedido_identico:c.exact,diferenca:c.delta,dias:Math.round(c.days)}))})}
  return {competencia:m,fechada:!!db.closures[m],pedidos_pendentes:rows.length,com_candidatos:out.length,sugestoes:out.slice(0,pick(i.limite,300,80))}},
 propor_vinculos(i){const valid=[],invalid=[],used=new Set();for(const v of i.vinculos||[]){const r=db.receipts.find(x=>x.id===v.liberacao),o=db.orders.find(x=>x.id===v.pedido);const why=!r?'liberação não encontrada':!o?'pedido não encontrado':r.linkedOrder?'liberação já vinculada':used.has(r.id)?'liberação repetida na proposta':db.closures[o.date.slice(0,7)]||db.closures[r.date.slice(0,7)]?'competência fechada':r.platform!==o.platform?'plataformas diferentes':'';if(why)invalid.push({...v,motivo_recusa:why});else{used.add(r.id);valid.push({receipt:r.id,order:o.id,amount:r.amount,reason:v.motivo})}}
  if(valid.length)addProposal(valid);
  return {propostas_exibidas:valid.length,valor_total:round(valid.reduce((a,p)=>a+p.amount,0)),recusadas:invalid,observacao:'O usuário precisa revisar e confirmar na tela; nada foi gravado ainda.'}},
 analisar_divergencias(i){const m=monthOf(i),rows=byMonth(m).filter(o=>status(o)==='Divergência');
  return {competencia:m,quantidade:rows.length,diferenca_total:round(rows.reduce((a,o)=>a+Math.abs(net(o)-paid(o)),0)),pedidos:rows.slice(0,pick(i.limite)).map(o=>({...orderOut(o),diferenca:round(paid(o)-net(o)),diferenca_pct_bruto:o.gross?round((paid(o)-net(o))/o.gross*100):0,origem_taxa:o.feeSource||'',frete_vendedor:o.shipping??undefined,liberacoes:db.receipts.filter(r=>r.linkedOrder===o.id).map(r=>({id:r.id,data:r.date,valor:r.amount}))}))}},
 desempenho_produto(i){const q=normalized(String(i.produto||'')),L=(window.Estoque?.lista?.()||[]).filter(p=>p.nome);const p=L.find(x=>normalized(x.id)===q)||L.find(x=>normalized(x.nome)===q)||L.map(x=>({x,s:q.split(/s+/).filter(w=>w.length>2&&normalized(x.nome).includes(w)).length})).filter(o=>o.s).sort((a,b)=>b.s-a.s)[0]?.x;if(!p)return {erro:'Produto não encontrado. Informe o SKU ou mais palavras do nome.'};const M=window.Margem?.produto?.(p.id);return {sku:p.id,nome:p.nome,estoque:Number(p.saldo)||0,...(M||{erro:'Radar de margem indisponível'})}},
 lucratividade_produtos(i){const R=(window.Margem?.ranking?.()||[]).filter(g=>g.venda>0).sort((a,b)=>i.ordem==='menos'?a.lucro-b.lucro:b.lucro-a.lucro).slice(0,i.limite||10);return {periodo_dias:30,produtos:R.map(g=>({sku:g.sku,nome:g.nome,unidades:g.u,receita:Math.round(g.venda*100)/100,lucro:Math.round(g.lucro*100)/100,margem_pct:Math.round(g.margem*1000)/10}))}},
 ranking_produtos(i){const m=i.mes||month,rows=I().ordersFor(m,i.plataforma||''),rank=I().productRank(rows).sort((a,b)=>i.ordenar==='quantidade'?b.qty-a.qty:b.revenue-a.revenue);
  return {periodo:m,pedidos:rows.length,pedidos_com_itens:rows.filter(o=>o.items?.length).length,produtos:rank.slice(0,pick(i.limite,100,15)).map(p=>({produto:p.title,sku:p.sku,unidades:p.qty,pedidos:p.orders,receita:p.revenue,participacao_pct:round(p.share),canais:p.platforms}))}},
 vendas_por_estado(i){const m=i.mes||month,rows=I().ordersFor(m,i.plataforma||'');return {periodo:m,pedidos:rows.length,estados:I().stateRank(rows).map(s=>({uf:s.uf,pedidos:s.orders,bruto:s.gross,ticket:s.ticket,participacao_pct:round(s.share)}))}},
 clientes(i){let list=I().customers();const total=list.length;if(i.segmento)list=list.filter(c=>c.segment===i.segmento);if(i.busca){const q=String(i.busca).toLowerCase();list=list.filter(c=>`${c.name} ${c.doc} ${c.city} ${c.state}`.toLowerCase().includes(q))}list.sort((a,b)=>i.ordenar==='recencia'?a.recency-b.recency:i.ordenar==='compras'?b.count-a.count:b.total-a.total);
  const seg={};for(const c of I().customers())seg[c.segment]=(seg[c.segment]||0)+1;
  return {clientes_total:total,por_segmento:seg,encontrados:list.length,clientes:list.slice(0,pick(i.limite)).map(c=>({chave:c.key,nome:c.name,cidade:c.city,uf:c.state,segmento:c.segment,estagio:c.crm.stage,etiquetas:c.crm.tags,compras:c.count,total:c.total,ticket:c.ticket,ultima_compra:c.last,dias_sem_comprar:c.recency,canais:c.platforms}))}},
 entradas_saidas(i){const m=monthOf(i),rows=I().ledgerFor(m),sum=a=>round(a.reduce((s,l)=>s+l.amount,0)),grp=(a,k)=>Object.entries(a.reduce((o,l)=>(o[l[k]||'—']=round((o[l[k]||'—']||0)+l.amount),o),{})).map(([nome,valor])=>({nome,valor})).sort((a,b)=>b.valor-a.valor);const ins=rows.filter(l=>l.kind==='entrada'),outs=rows.filter(l=>l.kind==='saida'),rs=db.receipts.filter(r=>r.date.startsWith(m));
  return {competencia:m,entradas:{total:sum(ins),por_status:grp(ins,'status')},saidas:{total:sum(outs),por_status:grp(outs,'status'),por_categoria:grp(outs,'category').slice(0,15)},saldo_previsto:round(sum(ins)-sum(outs)),repasses_marketplaces:round(rs.reduce((a,r)=>a+r.amount,0)),titulos_carregados:rows.length}},
 dre_automatica(i){const m=monthOf(i);if(!window.Contab)throw Error('Contabilidade automática indisponível.');const [y,mm]=m.split('-').map(Number),fim=new Date(y,mm,0).toLocaleDateString('sv-SE'),ini=i.acumulado?m.slice(0,4)+'-01-01':m+'-01';const {s,plano}=Contab.saldos(fim,ini);const mv=c=>{const x=s.get(c);return x?round(x.deb-x.cred):0};
  const rb=-mv('4.1'),ded=mv('4.2'),cmv=mv('5.1'),desp=mv('6'),fin=-mv('4.3')-mv('6.5');const contas=[...s.keys()].filter(c=>/^[456]\./.test(c)&&c.split('.').length===3).map(c=>({conta:c,nome:plano.get(c)?.n||c,valor:round(-mv(c))})).filter(x=>x.valor);
  return {periodo:i.acumulado?'acumulado '+m.slice(0,4):m,receita_bruta:round(rb),deducoes:round(ded),receita_liquida:round(rb-ded),cmv_e_custos:round(cmv),lucro_bruto:round(rb-ded-cmv),despesas_operacionais:round(desp-mv('6.5')-mv('6.8')),resultado_financeiro:round(fin),tributos_sobre_lucro:round(mv('6.8')),resultado:round(rb-ded-cmv-desp+mv('6.5')+fin),contas,observacao:'Visão gerencial automática (partidas dobradas). Tributos sobre vendas por competência quando configurado. A escrituração oficial é do escritório.'}},
 estoque(i){const l=window.Estoque?.lista?.()||[];if(!l.length)throw Error('Abra a tela de Estoque uma vez para carregar os produtos.');const q=String(i.busca||'').toLowerCase();const r=l.filter(p=>!p.ignorar&&(!q||(p.id+' '+p.nome).toLowerCase().includes(q)));
  return {produtos:r.length,valor_total_custo:round(r.reduce((s,p)=>s+Math.max(0,Number(p.saldo)||0)*(Number(p.custo)||0),0)),itens:r.slice(0,pick(i.limite,200,40)).map(p=>({sku:p.id,produto:p.nome,saldo:Number(p.saldo)||0,custo:Number(p.custo)||0,preco:Number(p.preco)||0,fornecedor:p.fornecedor||null,prazo_reposicao:p.prazo_reposicao??null})),observacao:'Situação de ruptura/compra, cobertura e sugestão de compra estão nas telas Posição de estoque e Sugestão de compras.'}},
 pendencias(){const out={};for(const [k,f] of Object.entries({pedidos_a_receber:o=>status(o)==='A receber',divergencias:o=>status(o)==='Divergência'}))out[k]=db.orders.filter(f).length;
  out.liberacoes_sem_pedido=db.receipts.filter(r=>!r.linkedOrder&&r.amount>0).length;out.extrato_a_conciliar=(db.bankTx||[]).filter(t=>t.status==='pendente').length;out.titulos_vencidos=(db.payables||[]).filter(p=>!['pago','cancelado'].includes(p.status)&&p.vencimento<new Date().toLocaleDateString('sv-SE')).length;out.pedidos_sem_nota_30d=db.orders.filter(o=>!o.nf&&o.date>=new Date(Date.now()-30*864e5).toLocaleDateString('sv-SE')).length;return {...out,observacao:'Detalhe por tipo na tela Pendências.'}},
 salvar_anotacao(i){const o=db.orders.find(x=>x.id===i.pedido);if(!o)throw Error('Pedido não encontrado.');if(db.closures[o.date.slice(0,7)])throw Error('Competência fechada: reabra para alterar.');const t=String(i.texto||'').slice(0,2000);o.note=o.note?`${o.note}\n${t}`:t;audit('Anotação salva pelo assistente',`${o.id}: ${t}`);return {ok:true,pedido:o.id}},
};
const toolLabel={desempenho_produto:'Analisando o desempenho do produto',lucratividade_produtos:'Calculando o lucro por produto',resumo_competencia:'Lendo o resumo da competência',listar_pedidos:'Consultando pedidos',listar_liberacoes:'Consultando liberações',sugerir_vinculos:'Procurando correspondências',propor_vinculos:'Preparando propostas de vínculo',analisar_divergencias:'Analisando divergências',ranking_produtos:'Calculando ranking de produtos',vendas_por_estado:'Agrupando vendas por estado',clientes:'Consultando clientes',entradas_saidas:'Lendo entradas e saídas',dre_automatica:'Montando a DRE automática',estoque:'Consultando o estoque',pendencias:'Levantando pendências',salvar_anotacao:'Salvando anotação'};

// ───────── Estado e interface ─────────
let convo=[],view=[],busy=false,open=false,notes=[],lastEnabled=null,aiReady=null;
// Sem ANTHROPIC_API_KEY no servidor, o painel explica que a análise é feita pelo Claude Code.
async function checkAi(){if(aiReady!==null||!window.Cloud?.ws)return;try{const st=await Integrations.callFn('integrations',{action:'status'});aiReady=!!st.ai}catch{aiReady=true}paint()}
const proposals=[];
function addProposal(pairs){proposals.push({pairs,done:false});view.push({type:'proposal',idx:proposals.length-1});paint()}

const root=document.createElement('div');root.id='assistant';document.body.appendChild(root);
const SUGGESTIONS=['Resuma a competência e diga o que precisa da minha atenção','Concilie o que for seguro e me mostre as propostas','Explique as divergências deste mês','Quais produtos e estados mais venderam?','Quais clientes devo reativar e como?','Compare os repasses com as entradas do Bling'];

function md(src){let s=esc(src);const blocks=[];s=s.replace(/```[\w-]*\n?([\s\S]*?)```/g,(_,c)=>{blocks.push(`<pre>${c}</pre>`);return `\u0000${blocks.length-1}\u0000`});
 const lines=s.split('\n'),out=[];let list=null,table=[];
 const inline=t=>t.replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>');
 const flushTable=()=>{if(!table.length)return;const rows=table.filter(r=>!/^\|?\s*:?-{2,}/.test(r)).map(r=>r.replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim())));out.push(`<div class="tablewrap"><table><thead><tr>${rows[0].map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);table=[]};
 const flushList=()=>{if(list){out.push(`<${list.t}>${list.items.map(x=>`<li>${inline(x)}</li>`).join('')}</${list.t}>`);list=null}};
 for(const line of lines){const t=line.trim();
  if(t.startsWith('|')){flushList();table.push(t);continue}flushTable();
  let m;if((m=t.match(/^[-*]\s+(.*)/))||(m=t.match(/^\d+[.)]\s+(.*)/))){const tag=/^\d/.test(t)?'ol':'ul';if(!list||list.t!==tag){flushList();list={t:tag,items:[]}}list.items.push(m[1]);continue}flushList();
  if((m=t.match(/^#{1,4}\s+(.*)/))){out.push(`<h4>${inline(m[1])}</h4>`);continue}
  if(t)out.push(`<p>${inline(t)}</p>`)}
 flushList();flushTable();return out.join('').replace(/\u0000(\d+)\u0000/g,(_,i)=>blocks[i])}

function paint(){
 const enabled=window.Cloud?.enabled&&Cloud.ws&&aiReady!==false;
 if(open)checkAi();
 const loginScreen=window.Cloud?.enabled&&!Cloud.ws;
 root.innerHTML=`<button class="fab ${open||loginScreen?'hidden':''}" data-ai="open" aria-label="Abrir assistente de IA">${icon('spark')}<span>Jarvis</span></button>
 <section class="drawer ${open?'open':''}" aria-label="Assistente de IA" ${open?'':'inert'}><div class="drawerhead"><div class="row"><span class="mark">${icon('spark')}</span><div><strong>Jarvis</strong><br><span class="caption">Concilia, investiga e analisa seus dados</span></div></div><div class="row"><button class="quiet small" data-ai="new" title="Nova conversa" aria-label="Nova conversa">${icon('refresh')}</button><button class="quiet small" data-ai="close" aria-label="Fechar assistente">${icon('close')}</button></div></div>
 <div class="chat" id="aiChat">${aiReady===false?`<div class="notice"><strong>Assistente embutido desativado.</strong> Ele usa a API da Anthropic, que exige créditos próprios e ainda não foi configurada.<br><br>Enquanto isso, a IA de conciliação é o <strong>Claude Code</strong>, que lê esta mesma base na nuvem. Peça lá, por exemplo: <em>“concilie setembro no Jarvis”</em>, <em>“explique as divergências da Shopee”</em> ou <em>“quais clientes devo reativar?”</em>. Os vínculos sugeridos continuam sendo confirmados por você aqui na ferramenta.</div>`:!enabled?`<div class="notice">O assistente usa a IA Claude pela nuvem do Jarvis. ${window.Cloud?.enabled?'Entre na sua conta para usar.':'Ative o modo nuvem (docs/CONFIGURAR.md) para liberar.'}</div>`:view.length?view.map(item).join(''):`<div class="aihello"><h3>Como posso ajudar?</h3><p class="caption">Eu leio pedidos, liberações, produtos, clientes e contas do Bling desta base. Vínculos que eu sugerir só entram depois da sua confirmação.</p><div class="chips">${SUGGESTIONS.map(s=>`<button class="small" data-ai-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`}${busy?`<div class="msg bot"><span class="typing"><i></i><i></i><i></i></span></div>`:''}</div>
 <form class="composer" id="aiForm"><textarea id="aiInput" rows="2" placeholder="${enabled?'Pergunte ou peça uma tarefa…':'Indisponível'}" ${enabled&&!busy?'':'disabled'}></textarea><button class="primary" type="submit" ${enabled&&!busy?'':'disabled'} aria-label="Enviar">${icon('send')}</button></form></section>`;
 const chat=$('#aiChat');if(chat)chat.scrollTop=chat.scrollHeight;
 const input=$('#aiInput');if(input&&open&&!busy)input.focus();
}
function item(v){if(v.type==='user')return `<div class="msg user">${esc(v.text)}</div>`;if(v.type==='bot')return `<div class="msg bot">${md(v.text)}</div>`;if(v.type==='tool')return `<div class="toolchip">${icon('spark')} ${esc(v.text)}</div>`;if(v.type==='error')return `<div class="notice red">${esc(v.text)}</div>`;
 if(v.type==='proposal'){const p=proposals[v.idx];p.done=p.done||p.pairs.every(x=>db.receipts.find(r=>r.id===x.receipt)?.linkedOrder);const total=p.pairs.reduce((a,x)=>a+x.amount,0);return `<div class="proposal"><div><strong>${p.pairs.length} vínculo(s) proposto(s)</strong><br><span class="caption">${money(total)} · ${p.done?'revisado':'aguardando sua confirmação'}</span></div>${p.done?badge('Conciliado'):`<button class="primary small" data-ai-review="${v.idx}">Revisar e confirmar</button>`}</div>`}return ''}

async function send(text){
 if(busy||!text.trim())return;
 const pageName=navItems.find(n=>n[0]===page)?.[2]||page;
 const ctx=`[contexto] tela: ${pageName}; competência selecionada: ${month}; data de hoje: ${new Date().toLocaleDateString('sv-SE')}${notes.length?'; '+notes.join('; '):''}`;notes=[];
 convo.push({role:'user',content:[{type:'text',text:`${ctx}\n\n${text.trim()}`}]});view.push({type:'user',text:text.trim()});busy=true;paint();
 try{
  for(let step=0;step<16;step++){
   const r=await Integrations.callFn('ai-assistant',{messages:convo});
   convo.push({role:'assistant',content:r.content});
   for(const b of r.content)if(b.type==='text'&&b.text.trim())view.push({type:'bot',text:b.text});
   if(r.stop_reason==='refusal'){view.push({type:'error',text:'A IA não pôde responder a este pedido. Reformule a pergunta.'});break}
   if(r.stop_reason==='max_tokens'){view.push({type:'error',text:'Resposta interrompida por tamanho. Peça para continuar ou para ser mais objetivo.'});break}
   if(r.stop_reason!=='tool_use')break;
   const results=[];
   for(const b of r.content){if(b.type!=='tool_use')continue;view.push({type:'tool',text:toolLabel[b.name]||b.name});paint();
    try{if(!tools[b.name])throw Error('Ferramenta desconhecida.');const out=JSON.stringify(tools[b.name](b.input||{}));results.push({type:'tool_result',tool_use_id:b.id,content:out.length>80000?out.slice(0,80000)+'…(truncado: peça um limite menor)':out})}
    catch(e){results.push({type:'tool_result',tool_use_id:b.id,content:e.message||String(e),is_error:true})}}
   convo.push({role:'user',content:results});paint();
  }
 }catch(e){view.push({type:'error',text:e.message||String(e)});if(convo.at(-1)?.role==='user')convo.pop()}
 finally{busy=false;paint()}
}

window.Assistant={tools,sync(){const en=!!(window.Cloud?.enabled&&Cloud.ws);if(en!==lastEnabled){lastEnabled=en;paint()}},open:(text)=>{open=true;paint();if(text)send(text)},onLinksApplied:(sel,r)=>{const p=proposals.find(p=>!p.done&&p.pairs.some(x=>sel.includes(x)));if(p){p.done=true;notes.push(`o usuário confirmou ${r.ok} vínculo(s) propostos${r.skipped.length?` e ${r.skipped.length} foram ignorados`:''}`);paint()}}};

root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.ai==='open'){open=true;paint()}else if(d.ai==='close'){open=false;paint()}else if(d.ai==='new'){if(busy)return;convo=[];view=[];proposals.length=0;notes=[];paint()}
 else if(d.aiSuggest)send(d.aiSuggest);
 else if(d.aiReview){const p=proposals[Number(d.aiReview)];batchModal(p.pairs,'Vínculos propostos pela IA','proposta do assistente')}});
root.addEventListener('submit',e=>{e.preventDefault();const t=$('#aiInput').value;send(t)});
root.addEventListener('keydown',e=>{if(e.target.id==='aiInput'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(e.target.value)}if(e.key==='Escape'&&open&&!$('#overlay').children.length){open=false;paint()}});

// Tela "Investigação assistida": atalhos para o assistente acima das análises por regras.
const aiView0=aiView;aiView=function(){const on=window.Cloud?.enabled;return `<div class="hero"><div><div class="eyebrow">${icon('spark').replace('class="icon"','class="icon" style="vertical-align:middle;width:14px;height:14px"')} IA Claude conectada aos seus dados</div><h2>Peça. A IA investiga, você decide.</h2><p>${on?'O assistente consulta pedidos, liberações, produtos, clientes e contas do Bling, propõe vínculos e explica divergências. Você confirma cada vínculo.':'Ative o modo nuvem para usar o assistente de IA. Abaixo, as análises por regras locais continuam disponíveis.'}</p><div class="chips" style="margin-top:14px">${SUGGESTIONS.slice(0,4).map(s=>`<button class="small" data-ai-go="${esc(s)}" ${on?'':'disabled'}>${esc(s)}</button>`).join('')}</div></div></div>${aiView0()}`};
document.addEventListener('click',e=>{const b=e.target.closest('button[data-ai-go]');if(b)Assistant.open(b.dataset.aiGo)});
paint();
if(page==='ai')render();
})();
