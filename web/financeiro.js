'use strict';
// ERP financeiro: Contas a pagar (títulos gerados das notas de entrada do Bling ou lançados à mão) e
// Notas de entrada. O Jarvis é o dono do financeiro; o Bling fica com o fiscal e o estoque.
(()=>{
Object.assign(paths,{
 wallet:'M3 7h15a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z M3 7V6a3 3 0 0 1 3-3h10v4 M17 14h.01',
 calendar:'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
 receipt:'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z M9 8h6 M9 12h6 M9 16h3',
 plus:'M12 5v14 M5 12h14'
});
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const addDias=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toLocaleDateString('sv-SE')};
const addMeses=(d,n)=>{const x=new Date(d+'T12:00:00'),dia=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+n);x.setDate(Math.min(dia,new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));return x.toLocaleDateString('sv-SE')};
const dataBR=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const diasAte=d=>Math.round((new Date(d+'T12:00:00')-new Date(hoje()+'T12:00:00'))/864e5);
const P=()=>db.payables||(db.payables=[]);
const saldo=t=>round(Math.max(0,t.valor+(t.juros||0)-(t.desconto||0)-(t.valorPago||0)));
// Situação vista na tela: vencido é um título em aberto com vencimento no passado.
const situacao=t=>t.status==='cancelado'?'Cancelado':t.status==='pago'?'Pago':t.aprovacao==='pendente'?'A aprovar':t.vencimento<hoje()?'Vencido':t.status==='parcial'?'Parcial':'Em aberto';
const TOM={'Pago':'ok','Cancelado':'','Vencido':'bad','Parcial':'info','Em aberto':'warn','A aprovar':'info'};
const CATEGORIAS=['Compra de mercadorias','Embalagens','Fretes e logística','Marketing e anúncios','Tarifas de marketplace','Aluguel','Água, luz e internet','Pró-labore','Salários e encargos','Impostos e taxas','Serviços de terceiros','Contabilidade','Sistemas e softwares','Tarifas bancárias','Empréstimos e juros','Outras despesas'];
const categorias=()=>{const cad=(db.cadastros||[]).filter(c=>c.tipo==='cat'&&c.ativo!==false).map(c=>c.dados.nome);return [...new Set([...(cad.length?cad:CATEGORIAS),...P().map(t=>t.categoria).filter(Boolean)])]};
const contas=()=>[...new Set(['Banco principal','Caixa',...P().map(t=>t.conta).filter(Boolean)])];
const ui={filtro:'abertos',busca:'',periodo:'mes',sel:new Set(),ctipo:'compra'};
window.Reiniciar?.registrar(ui,['filtro','busca','periodo','sel','ctipo']); // estado de tela: volta ao original ao clicar no menu

// ─────────────── Contas a pagar ───────────────
function kpis(){const h=hoje(),abertos=P().filter(t=>!['pago','cancelado'].includes(t.status));const soma=l=>round(l.reduce((a,t)=>a+saldo(t),0));
 const venc=abertos.filter(t=>t.vencimento<h),hj=abertos.filter(t=>t.vencimento===h),sete=abertos.filter(t=>t.vencimento>h&&t.vencimento<=addDias(h,7)),mes=abertos.filter(t=>t.vencimento.startsWith(month));
 const pagoMes=round(P().filter(t=>(t.pagoEm||'').startsWith(month)).reduce((a,t)=>a+(t.valorPago||0),0));
 return {venc,hj,sete,mes,soma,pagoMes}}
function agenda(){const h=hoje(),dias=[...Array(14)].map((_,i)=>addDias(h,i)),abertos=P().filter(t=>!['pago','cancelado'].includes(t.status));
 const tot=dias.map(d=>round(abertos.filter(t=>t.vencimento===d).reduce((a,t)=>a+saldo(t),0))),max=Math.max(1,...tot),atras=round(abertos.filter(t=>t.vencimento<h).reduce((a,t)=>a+saldo(t),0));
 return `<div class="card agenda"><div class="cardhead"><div><h2>Próximos 14 dias</h2><p class="caption">Quanto sai do caixa em cada dia${atras?` · <span class="red">${money(atras)} já vencidos</span>`:''}</p></div>${icon('calendar')}</div>
 <div class="agbars">${dias.map((d,i)=>{const dt=new Date(d+'T12:00:00'),fds=[0,6].includes(dt.getDay());return `<button class="agday ${i===0?'hoje':''} ${fds?'fds':''}" data-pg-dia="${d}" title="${dataBR(d)}: ${money(tot[i])}"><span class="agval">${tot[i]?(tot[i]>=1000?(tot[i]/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'k':Math.round(tot[i])):''}</span><i style="height:${tot[i]?Math.max(6,tot[i]/max*100):2}%"></i><span class="agdia">${i===0?'Hoje':dt.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</span><span class="agnum">${dt.getDate()}</span></button>`}).join('')}</div></div>`}
function lista(){const h=hoje(),q=normalized(ui.busca);let l=P();
 if(ui.dia)l=l.filter(t=>t.vencimento===ui.dia&&!['pago','cancelado'].includes(t.status));
 else{if(ui.periodo==='mes')l=l.filter(t=>t.vencimento.startsWith(month)||(ui.filtro==='vencidos'&&t.vencimento<h)||(ui.filtro==='pagos'&&(t.pagoEm||'').startsWith(month)));
  l=l.filter(t=>({abertos:!['pago','cancelado'].includes(t.status),vencidos:!['pago','cancelado'].includes(t.status)&&t.vencimento<h,pagos:t.status==='pago'||t.valorPago>0,cancelados:t.status==='cancelado',todos:true})[ui.filtro])}
 if(q)l=l.filter(t=>normalized([t.fornecedor,t.descricao,t.documento,t.categoria,t.fornecedorDoc].join(' ')).includes(q));
 return l.sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||String(a.fornecedor).localeCompare(String(b.fornecedor)))}
function pagarView(){const k=kpis(),l=lista(),tot=round(l.reduce((a,t)=>a+(ui.filtro==='pagos'?t.valorPago||0:saldo(t)),0)),sel=l.filter(t=>ui.sel.has(t.id));
 const card=(lb,v,cap,tone,f)=>`<button class="card metric kpibtn ${ui.filtro===f&&!ui.dia?'on':''}" data-pg-filtro="${f}"><div class="label">${lb}</div><div class="value ${tone}">${money(v)}</div><small>${cap}</small></button>`;
 const tabs=[['abertos','Em aberto'],['vencidos','Vencidos'],['pagos','Pagos'],['cancelados','Cancelados'],['todos','Todos']];
 return `<div class="grid metrics">${card('Vencidos',k.soma(k.venc),`${k.venc.length} título(s) em atraso`,k.venc.length?'red':'green','vencidos')}${card('Vence hoje',k.soma(k.hj),`${k.hj.length} título(s)`,k.hj.length?'gold':'','abertos')}${card('Próximos 7 dias',k.soma(k.sete),`${k.sete.length} título(s)`,'','abertos')}${card('Pago em '+monthName(),k.pagoMes,`A pagar no mês: ${money(k.soma(k.mes))}`,'green','pagos')}</div>
 ${agenda()}
 <div class="tablebox"><div class="tabletop"><div class="row wrap">${ui.dia?`<span class="badge info">Vencimento em ${dataBR(ui.dia)}</span><button class="small quiet" data-pg="limpar-dia">Ver todos</button>`:`<div class="segtabs">${tabs.map(([f,t])=>`<button class="${ui.filtro===f?'on':''}" data-pg-filtro="${f}">${t}</button>`).join('')}</div><select id="pgPeriodo" aria-label="Período"><option value="mes" ${ui.periodo==='mes'?'selected':''}>${monthName()}</option><option value="tudo" ${ui.periodo==='tudo'?'selected':''}>Todos os meses</option></select>`}</div>
 <div class="row wrap"><input type="search" id="pgBusca" placeholder="Fornecedor, NF, categoria…" value="${esc(ui.busca)}">${sel.length?`<button class="primary small" data-pg="baixar-lote">${icon('check')} Baixar ${sel.length} selecionado(s)</button>`:''}${(()=>{const n=window.Pagamentos?.pendentes().length||0;return n?`<button class="small primary" data-pg2="aprovacoes">${icon('check')} A aprovar (${n})</button>`:''})()}<button class="small" data-pg2="lote">${icon('wallet')} Lote de pagamento</button><button class="small" data-pg2="dda">${icon('upload')} Importar DDA</button><button class="small quiet" data-pg2="regras" title="Regras de aprovação">${icon('sliders')}</button><button class="small" data-pg="exportar">${icon('download')} Exportar</button><button class="small" data-pg="novo">${icon('spark')} Lançar por foto ou voz</button><button class="primary small" data-pg="novo">${icon('plus')} Novo lançamento</button></div></div>
 <div class="tablewrap"><table class="pgtable"><thead><tr><th style="width:28px"><input type="checkbox" class="check" id="pgTodos" aria-label="Selecionar todos"></th><th>Vencimento</th><th>Fornecedor</th><th>Documento</th><th>Categoria</th><th class="num">Valor</th><th class="num">${ui.filtro==='pagos'?'Pago':'Saldo'}</th><th>Situação</th><th></th></tr></thead><tbody>
 ${l.slice(0,500).map(t=>{const s=situacao(t),d=diasAte(t.vencimento),aberto=!['Pago','Cancelado'].includes(s);return `<tr class="${ui.sel.has(t.id)?'sel':''}"><td>${aberto?`<input type="checkbox" class="check" data-pg-sel="${esc(t.id)}" ${ui.sel.has(t.id)?'checked':''} aria-label="Selecionar">`:''}</td>
  <td>${dataBR(t.vencimento)}<br><span class="caption ${aberto&&d<0?'red':aberto&&d<=3?'gold':''}">${aberto?(d<0?`${-d} dia(s) em atraso`:d===0?'hoje':`em ${d} dia(s)`):s==='Pago'?'pago '+dataBR(t.pagoEm):''}</span></td>
  <td>${esc(t.fornecedor||'—')}<br><span class="caption">${esc(t.fornecedorDoc||'')}</span></td>
  <td>${esc(t.descricao||t.documento||'—')}${t.parcelas>1?`<br><span class="caption">parcela ${t.parcela}/${t.parcelas}</span>`:''}${t.origem==='nfe'?' <span class="badge info" title="Gerado da nota de entrada do Bling">NF-e</span>':''}</td>
  <td class="caption">${esc(t.categoria||'—')}</td><td class="num">${money(t.valor)}</td><td class="num">${money(ui.filtro==='pagos'?t.valorPago||0:saldo(t))}</td><td><span class="badge ${TOM[s]}">${s}</span></td>
  <td><div class="row" style="gap:6px;justify-content:flex-end">${aberto?`<button class="small primary" data-pg-pagar="${esc(t.id)}">Pagar</button>`:''}<button class="small quiet" data-pg-edit="${esc(t.id)}" aria-label="Detalhes">${icon('arrow')}</button></div></td></tr>`}).join('')||`<tr><td colspan="9" class="empty">${P().length?'Nenhum título neste filtro.':'Nenhum título ainda. As notas de entrada do Bling geram os títulos automaticamente; despesas sem nota entram por <strong>Novo lançamento</strong>.'}</td></tr>`}</tbody>
 ${l.length?`<tfoot><tr><td></td><td colspan="5"><strong>${l.length} título(s)</strong>${l.length>500?' (mostrando 500)':''}</td><td class="num"><strong>${money(tot)}</strong></td><td colspan="2"></td></tr></tfoot>`:''}</table></div></div>`}
const monthName=()=>new Date(month+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

function formTitulo(t){const c=categorias(),novo=!t;t=t||{vencimento:hoje(),emissao:hoje(),valor:'',parcela:1,parcelas:1};
 return `<div class="grid two" style="gap:0 16px"><div><label for="ftForn">Fornecedor</label><input id="ftForn" value="${esc(t.fornecedor||'')}" list="ftFornList" style="width:100%"><datalist id="ftFornList">${[...new Set(P().map(x=>x.fornecedor).filter(Boolean))].slice(0,300).map(f=>`<option value="${esc(f)}">`).join('')}</datalist></div>
 <div><label for="ftDoc">CNPJ/CPF</label><input id="ftDoc" value="${esc(t.fornecedorDoc||'')}" style="width:100%"></div>
 <div><label for="ftDesc">Descrição</label><input id="ftDesc" value="${esc(t.descricao||'')}" placeholder="Ex.: Aluguel galpão" style="width:100%"></div>
 <div><label for="ftNum">Documento (NF, boleto, contrato)</label><input id="ftNum" value="${esc(t.documento||'')}" style="width:100%"></div>
 <div><label for="ftCat">Categoria</label><input id="ftCat" value="${esc(t.categoria||'')}" list="ftCatList" style="width:100%"><datalist id="ftCatList">${c.map(x=>`<option value="${esc(x)}">`).join('')}</datalist></div>
 <div><label for="ftCC">Centro de custo</label><input id="ftCC" value="${esc(t.centroCusto||'')}" placeholder="Ex.: Mercado Livre, Loja, Administrativo" style="width:100%"></div>
 <div><label for="ftValor">${novo?'Valor total':'Valor'}</label><input id="ftValor" inputmode="decimal" value="${t.valor!==''?String(t.valor).replace('.',','):''}" style="width:100%"></div>
 <div><label for="ftVenc">${novo?'1º vencimento':'Vencimento'}</label><input id="ftVenc" type="date" value="${t.vencimento}" style="width:100%"></div>
 ${novo?`<div><label for="ftParc">Parcelas</label><input id="ftParc" type="number" min="1" max="120" value="1" style="width:100%"></div><div><label for="ftRec">Repetição</label><select id="ftRec" style="width:100%"><option value="parcelado">Dividir o valor nas parcelas (mensal)</option><option value="recorrente">Repetir o mesmo valor todo mês (recorrente)</option></select></div>`:''}</div>
 <label for="ftObs">Observação</label><textarea id="ftObs" style="min-height:60px">${esc(t.observacao||'')}</textarea>`}
function lerForm(){const v=TableImport.num($('#ftValor').value);return {fornecedor:$('#ftForn').value.trim(),fornecedorDoc:$('#ftDoc').value.trim(),descricao:$('#ftDesc').value.trim(),documento:$('#ftNum').value.trim(),categoria:$('#ftCat').value.trim(),centroCusto:$('#ftCC').value.trim(),valor:round(v),vencimento:$('#ftVenc').value,observacao:$('#ftObs').value.trim()}}
function novo(){modal('Novo lançamento a pagar',`<p class="caption">Despesas sem nota de entrada (aluguel, pró-labore, impostos, serviços…). Compras com NF-e chegam sozinhas do Bling.</p>${formTitulo()}<div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-pg="salvar-novo">${icon('check')} Lançar</button></div>`)}
function salvarNovo(){const f=lerForm(),n=Math.max(1,Math.min(120,parseInt($('#ftParc').value)||1)),rec=$('#ftRec').value==='recorrente';
 if(!f.fornecedor&&!f.descricao)return toast('Informe o fornecedor ou a descrição.');if(!(f.valor>0))return toast('Informe o valor.');if(!f.vencimento)return toast('Informe o vencimento.');
 const grupo=uid(),base=rec?f.valor:round(f.valor/n);let resto=round(f.valor-base*n);
 for(let i=0;i<n;i++){const v=rec?f.valor:round(base+(i===n-1?resto:0));P().push((window.Pagamentos?.marcar||(x=>x))({id:`MAN-${grupo}-${i+1}`,origem:rec?'recorrente':'manual',...f,valor:v,vencimento:addMeses(f.vencimento,i),emissao:hoje(),parcela:i+1,parcelas:n,juros:0,desconto:0,valorPago:0,status:'aberto',createdBy:Cloud?.session?.user?.email||'local'}))}
 audit('Título a pagar lançado',`${f.fornecedor||f.descricao} · ${n>1?n+'× ':''}${money(rec?f.valor:base)} · 1º venc. ${dataBR(f.vencimento)}`);closeModal();month=f.vencimento.slice(0,7);render();toast(n>1?`${n} títulos lançados.`:'Título lançado.')}
function editar(id){const t=P().find(x=>x.id===id);if(!t)return;const nota=t.invoiceId?(db.purchases||[]).find(n=>n.id===t.invoiceId):null;
 modal(`${esc(t.fornecedor||t.descricao||'Título')}`,`<div class="row wrap" style="margin-bottom:10px"><span class="badge ${TOM[situacao(t)]}">${situacao(t)}</span>${t.origem==='nfe'?'<span class="badge info">Gerado da NF-e de entrada</span>':t.origem==='recorrente'?'<span class="badge">Recorrente</span>':''}${t.valorPago?`<span class="badge ok">Pago ${money(t.valorPago)}${t.pagoEm?' em '+dataBR(t.pagoEm):''}${t.conta?' · '+esc(t.conta):''}</span>`:''}</div>
 ${nota?`<div class="notice">NF ${esc(nota.numero||'')}${nota.serie?'/'+esc(nota.serie):''} de ${dataBR(nota.emissao)} · ${money(nota.valor)} · ${(nota.itens||[]).length} item(ns) · CFOP ${esc(nota.cfop||'—')}${nota.chave?`<br><span class="caption">Chave ${esc(nota.chave)}</span>`:''}</div>`:''}
 ${formTitulo(t)}<div class="modalfoot" style="justify-content:space-between"><div class="row">${t.status!=='cancelado'&&!t.valorPago?`<button class="quiet" data-pg-cancelar="${esc(t.id)}">Cancelar título</button>`:''}${t.valorPago?`<button class="quiet" data-pg-estornar="${esc(t.id)}">Estornar pagamento</button>`:''}</div><div class="row"><button data-action="close">Fechar</button><button class="primary" data-pg-salvar="${esc(t.id)}">Salvar</button></div></div>`)}
function pagar(ids){if(window.Pagamentos&&!Pagamentos.podePagar(ids))return;const ts=ids.map(id=>P().find(x=>x.id===id)).filter(Boolean);if(!ts.length)return;const um=ts.length===1?ts[0]:null,total=round(ts.reduce((a,t)=>a+saldo(t),0));
 modal(um?'Registrar pagamento':`Baixar ${ts.length} títulos`,`<div class="notice">${um?`${esc(um.fornecedor||um.descricao)} · vence ${dataBR(um.vencimento)} · saldo <strong>${money(saldo(um))}</strong>`:`Total dos saldos: <strong>${money(total)}</strong>. Cada título é baixado pelo saldo integral.`}</div>
 <div class="grid two" style="gap:0 16px"><div><label for="pgData">Data do pagamento</label><input id="pgData" type="date" value="${hoje()}" style="width:100%"></div><div><label for="pgConta">Conta de saída</label><input id="pgConta" list="pgContas" value="${esc(contas()[0])}" style="width:100%"><datalist id="pgContas">${contas().map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
 ${um?`<div><label for="pgValor">Valor pago</label><input id="pgValor" inputmode="decimal" value="${String(saldo(um)).replace('.',',')}" style="width:100%"></div><div class="row" style="gap:10px"><div style="flex:1"><label for="pgJuros">Juros/multa</label><input id="pgJuros" inputmode="decimal" value="0" style="width:100%"></div><div style="flex:1"><label for="pgDesc">Desconto</label><input id="pgDesc" inputmode="decimal" value="0" style="width:100%"></div></div>`:''}</div>
 <p class="caption" style="margin-top:10px">Pagamento menor que o saldo deixa o título como <strong>parcial</strong>. Quando os extratos forem importados, a Tesouraria confere cada baixa com o banco.</p>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-pg-confirmar="${esc(ids.join(','))}">${icon('check')} Confirmar pagamento</button></div>`)}
function confirmarPagamento(ids){const data=$('#pgData').value,conta=$('#pgConta').value.trim();if(!data)return toast('Informe a data do pagamento.');
 const ts=ids.map(id=>P().find(x=>x.id===id)).filter(Boolean);
 for(const t of ts){if(ts.length===1){t.juros=round((t.juros||0)+TableImport.num($('#pgJuros').value));t.desconto=round((t.desconto||0)+TableImport.num($('#pgDesc').value));const v=round(TableImport.num($('#pgValor').value));if(!(v>0))return toast('Informe o valor pago.');t.valorPago=round((t.valorPago||0)+v)}else t.valorPago=round((t.valorPago||0)+saldo(t));
  t.pagoEm=data;t.conta=conta;t.status=saldo(t)<0.01?'pago':'parcial'}
 audit(ts.length>1?'Títulos baixados em lote':'Pagamento registrado',ts.map(t=>`${t.fornecedor||t.descricao} ${money(t.valorPago)}`).slice(0,8).join(' · ')+(ts.length>8?` · +${ts.length-8}`:'')+` · ${dataBR(data)} · ${conta}`);
 ui.sel.clear();closeModal();render();toast(ts.length>1?`${ts.length} títulos baixados.`:'Pagamento registrado.')}

// ─────────────── Notas de entrada ───────────────
function comprasView(){const ns=(db.purchases||[]).filter(n=>(n.emissao||'').startsWith(month)),por=k=>ns.filter(n=>n.tipo===k),soma=l=>round(l.reduce((a,n)=>a+n.valor,0));const l=ns.filter(n=>ui.ctipo==='todas'||n.tipo===ui.ctipo).sort((a,b)=>String(b.emissao).localeCompare(String(a.emissao)));
 const titulosDe=id=>P().filter(t=>t.invoiceId===id);const forn={};for(const n of por('compra'))forn[n.fornecedor||'—']=(forn[n.fornecedor||'—']||0)+n.valor;const top=Object.entries(forn).sort((a,b)=>b[1]-a[1]).slice(0,6),maxF=Math.max(1,...top.map(x=>x[1]));
 return `<div class="grid metrics"><div class="card metric"><div class="label">Compras no mês</div><div class="value">${money(soma(por('compra')))}</div><small>${por('compra').length} nota(s) de fornecedores</small></div><div class="card metric"><div class="label">Devoluções de clientes</div><div class="value">${money(soma(por('devolucao')))}</div><small>${por('devolucao').length} nota(s) · não geram contas a pagar</small></div><div class="card metric"><div class="label">Outras entradas</div><div class="value">${money(soma(por('outros')))}</div><small>Remessas, bonificações, transferências</small></div><div class="card metric"><div class="label">Títulos gerados</div><div class="value">${P().filter(t=>t.origem==='nfe'&&(t.emissao||'').startsWith(month)).length}</div><small>Das duplicatas das notas de compra</small></div></div>
 <div class="grid charts"><div class="tablebox"><div class="tabletop"><div class="segtabs">${[['compra','Compras'],['devolucao','Devoluções'],['outros','Outras'],['todas','Todas']].map(([k,t])=>`<button class="${ui.ctipo===k?'on':''}" data-pg-ctipo="${k}">${t}</button>`).join('')}</div><span class="caption">Lidas do Bling (fiscal). O financeiro é do Jarvis.</span></div>
 <div class="tablewrap"><table><thead><tr><th>Emissão</th><th>NF</th><th>Fornecedor / emitente</th><th>CFOP</th><th class="num">Valor</th><th>Títulos</th><th>Situação</th></tr></thead><tbody>${l.slice(0,400).map(n=>{const ts=titulosDe(n.id),pago=ts.length&&ts.every(t=>t.status==='pago');return `<tr class="clk" data-pg-nota="${esc(n.id)}"><td>${dataBR(n.emissao)}</td><td>${esc(n.numero||'—')}${n.serie?'/'+esc(n.serie):''}</td><td>${esc(n.fornecedor||'—')}<br><span class="caption">${esc(n.fornecedorDoc||'')}</span></td><td class="caption">${esc(n.cfop||'—')}</td><td class="num">${money(n.valor)}</td><td>${n.tipo!=='compra'?'<span class="caption">—</span>':ts.length?`<span class="badge ${pago?'ok':'warn'}">${ts.length} ${pago?'pago(s)':'a pagar'}</span>`:'<span class="badge">—</span>'}</td><td class="caption">${esc(n.situacao||'')}</td></tr>`}).join('')||`<tr><td colspan="7" class="empty">${(db.purchases||[]).length?'Nenhuma nota neste filtro em '+monthName()+'.':'As notas de entrada estão sendo buscadas no Bling. Elas aparecem aqui em alguns minutos.'}</td></tr>`}</tbody></table></div></div>
 <div class="card"><div class="cardhead"><h2>Maiores fornecedores do mês</h2>${icon('receipt')}</div>${top.length?top.map(([f,v])=>`<div class="progressrow"><div class="row"><span>${esc(f)}</span><span>${money(v)}</span></div><div class="bar"><i style="width:${v/maxF*100}%;background:var(--accent)"></i></div></div>`).join(''):'<p class="caption">Sem compras no mês.</p>'}</div></div>`}
function nota(id){const n=(db.purchases||[]).find(x=>x.id===id);if(!n)return;const ts=P().filter(t=>t.invoiceId===id);
 modal(`NF ${esc(n.numero||'')}${n.serie?'/'+esc(n.serie):''} · ${esc(n.fornecedor||'')}`,`<div class="row wrap" style="margin-bottom:10px"><span class="badge ${n.tipo==='compra'?'info':n.tipo==='devolucao'?'warn':''}">${{compra:'Compra',devolucao:'Devolução de venda',outros:'Outra entrada'}[n.tipo]}</span><span class="badge">CFOP ${esc(n.cfop||'—')}</span><span class="badge">${esc(n.situacao||'')}</span><span class="badge">Emissão ${dataBR(n.emissao)}</span></div>
 ${n.chave?`<p class="caption">Chave de acesso: ${esc(n.chave)}</p>`:''}
 <div class="tablewrap" style="max-height:260px;margin-top:10px"><table><thead><tr><th>Item</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead><tbody>${(n.itens||[]).map(i=>`<tr><td>${esc(i.descricao||'')}<br><span class="caption">${esc(i.sku||'')}${i.ncm?' · NCM '+esc(i.ncm):''}</span></td><td class="num">${(i.qtd||0).toLocaleString('pt-BR')}</td><td class="num">${money(i.valor||0)}</td><td class="num">${money(i.total||0)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3"><strong>Total da nota</strong></td><td class="num"><strong>${money(n.valor)}</strong></td></tr></tfoot></table></div>
 <h3 style="margin:16px 0 6px">Títulos a pagar</h3>${ts.length?ts.map(t=>`<div class="listline"><span>Parcela ${t.parcela}/${t.parcelas} · vence ${dataBR(t.vencimento)}</span><span class="row"><strong>${money(t.valor)}</strong><span class="badge ${TOM[situacao(t)]}">${situacao(t)}</span><button class="small quiet" data-pg-edit="${esc(t.id)}">Abrir</button></span></div>`).join(''):`<p class="caption">${n.tipo==='compra'?'Nenhum título gerado (nota cancelada ou sem valor).':'Esta entrada não gera contas a pagar.'}</p>`}
 <div class="modalfoot"><button data-action="close">Fechar</button></div>`)}

addPage('pagar','wallet','Contas a pagar',pagarView,'Títulos das notas de entrada e lançamentos: o que vence, o que atrasou e o que já foi pago.','',bind);
addPage('compras','receipt','Notas de entrada',comprasView,'Compras, devoluções e outras entradas lidas do Bling — as compras viram contas a pagar.','',bind);

function bind(){const b=$('#pgBusca');if(b)b.oninput=e=>{ui.busca=e.target.value;const pos=e.target.selectionStart;render();const n=$('#pgBusca');n.focus();n.setSelectionRange(pos,pos)};
 const p=$('#pgPeriodo');if(p)p.onchange=e=>{ui.periodo=e.target.value;render()};
 const all=$('#pgTodos');if(all)all.onchange=e=>{for(const t of lista().filter(t=>!['pago','cancelado'].includes(t.status)))e.target.checked?ui.sel.add(t.id):ui.sel.delete(t.id);render()};
 $$('[data-pg-sel]').forEach(x=>x.onchange=()=>{x.checked?ui.sel.add(x.dataset.pgSel):ui.sel.delete(x.dataset.pgSel);render()})}

document.addEventListener('click',e=>{const tr=e.target.closest('tr[data-pg-nota]');if(tr&&!e.target.closest('button')){nota(tr.dataset.pgNota);return}
 const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.pgFiltro){ui.filtro=d.pgFiltro;ui.dia=null;render();return}
 if(d.pgDia){ui.dia=ui.dia===d.pgDia?null:d.pgDia;render();return}
 if(d.pgCtipo){ui.ctipo=d.pgCtipo;render();return}
 if(d.pgPagar){pagar([d.pgPagar]);return}
 if(d.pgEdit){closeModal();editar(d.pgEdit);return}
 if(d.pgNota){nota(d.pgNota);return}
 if(d.pgConfirmar){confirmarPagamento(d.pgConfirmar.split(','));return}
 if(d.pgSalvar){const t=P().find(x=>x.id===d.pgSalvar),f=lerForm();if(!(f.valor>0))return toast('Informe o valor.');Object.assign(t,f);t.status=t.status==='cancelado'?'cancelado':saldo(t)<0.01&&t.valorPago?'pago':t.valorPago?'parcial':'aberto';audit('Título a pagar editado',`${t.fornecedor||t.descricao} · ${money(t.valor)} · venc. ${dataBR(t.vencimento)}`);closeModal();render();toast('Título atualizado.');return}
 if(d.pgCancelar){const t=P().find(x=>x.id===d.pgCancelar);if(!confirm('Cancelar este título? Ele deixa de aparecer como a pagar.'))return;t.status='cancelado';audit('Título a pagar cancelado',`${t.fornecedor||t.descricao} · ${money(t.valor)}`);closeModal();render();return}
 if(d.pgEstornar){const t=P().find(x=>x.id===d.pgEstornar);if(!confirm('Estornar o pagamento registrado deste título?'))return;audit('Pagamento estornado',`${t.fornecedor||t.descricao} · ${money(t.valorPago)}`);t.valorPago=0;t.pagoEm=null;t.juros=0;t.desconto=0;t.status='aberto';closeModal();render();return}
 switch(d.pg){case'novo':navigate('lancamento');break;case'salvar-novo':salvarNovo();break;case'limpar-dia':ui.dia=null;render();break;
  case'baixar-lote':pagar([...ui.sel]);break;
  case'exportar':download(`Jarvis_contas_a_pagar_${month}.csv`,csv([['vencimento','fornecedor','documento','descricao','parcela','categoria','centro_custo','valor','juros','desconto','pago','pago_em','conta','situacao','origem'],...lista().map(t=>[t.vencimento,t.fornecedor||'',t.fornecedorDoc||'',t.descricao||'',t.parcelas>1?`${t.parcela}/${t.parcelas}`:'',t.categoria||'',t.centroCusto||'',t.valor,t.juros||0,t.desconto||0,t.valorPago||0,t.pagoEm||'',t.conta||'',situacao(t),t.origem])]));break}
});
window.Financeiro={saldo,situacao,selecionados:()=>[...ui.sel]};
})();
