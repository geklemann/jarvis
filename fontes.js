'use strict';
// De onde vêm os números: cada fonte de dados do Jarvis, como chega (API, cron, importação), quando foi a última
// atualização (medida nos próprios dados), que telas ela alimenta e o que conferir no mês. Tudo calculado na hora.
(()=>{
const dBR=d=>d?new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const mesLabel=m=>new Date(m+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const dias=d=>d?Math.round((new Date(hoje()+'T12:00:00')-new Date(String(d).slice(0,10)+'T12:00:00'))/864e5):null;
const maxData=(l,k)=>l.reduce((m,x)=>{const v=String(x[k]||'').slice(0,10);return v>m?v:m},'');
const st={integ:null,carregando:false};
async function carregar(){if(st.carregando||!window.Cloud?.client)return;st.carregando=true;
 try{const {data}=await Cloud.client.from('integrations').select('provider,status,last_sync,last_error').eq('workspace_id',Cloud.ws);st.integ=Object.fromEntries((data||[]).map(r=>[r.provider,r]))}catch{st.integ={}}finally{st.carregando=false}
 if(page==='fontes')render()}
function frescor(d,limite){const n=dias(d);if(n==null)return ['sem dados','bad'];return n<=limite?[n===0?'hoje':n===1?'ontem':`há ${n} dias`,'ok']:[`há ${n} dias`,n<=limite*3?'warn':'bad']}
function view(){if(!st.integ){carregar();return '<div class="empty">Carregando…</div>'}
 const I=st.integ,o=db.orders||[],r=db.receipts||[],mes=o.filter(x=>String(x.date).startsWith(month));
 const shp=mes.filter(x=>x.platform==='Shopee'),shpSem=shp.filter(x=>x.feeSource!=='Shopee'),ml=mes.filter(x=>x.platform==='Mercado Livre'),mlSem=ml.filter(x=>x.feeSource!=='Mercado Livre'),mgl=mes.filter(x=>x.platform==='Magalu');
 const rShp=r.filter(x=>x.platform==='Shopee'),rMl=r.filter(x=>x.platform==='Mercado Livre'),tx=db.bankTx||[],pg=db.payables||[],nfe=db.purchases||[];
 const bl=I.bling||{},mlI=I.mercadolivre||{},sync=x=>x?.last_sync?new Date(x.last_sync).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
 const F=[
  ['Pedidos de todos os canais','Bling (API oficial): pedidos de venda do Mercado Livre, Shopee e Magalu, com itens, cliente, UF e nota.',`Automático a cada 2 min; relê os últimos 7 dias de hora em hora. Última leitura: ${sync(bl)}`,frescor(maxData(o,'date'),1),`${mes.length.toLocaleString('pt-BR')} pedidos no mês`,'Vendas, Pedidos, Resultado (DRE), Rentabilidade, Estoque, CRM'],
  ['Taxas e frete do Mercado Livre','API do Mercado Livre (tarifa de venda e frete de cada pedido).',`Automático, junto com os pedidos. Última leitura: ${sync(mlI)}`,frescor(maxData(ml.filter(x=>x.feeSource==='Mercado Livre'),'date'),2),mlSem.length?`${mlSem.length} pedido(s) do mês ainda com taxa estimada`:'todas as taxas do mês são reais','Conciliação, Resultado, Rentabilidade, Margem'],
  ['Repasses do Mercado Livre','Mercado Pago (API): cada liberação de dinheiro, com o pedido de origem.','Automático a cada 10 min.',frescor(maxData(rMl,'date'),2),`${rMl.filter(x=>String(x.date).startsWith(month)).length} repasse(s) no mês`,'Conciliação (a receber x recebido), Fluxo de caixa'],
  ['Taxas e repasses da Shopee','Central do Vendedor › Minha Renda (relatório oficial de renda). A Open API da Shopee ainda não foi liberada para a loja, então a leitura é feita por importação.','Importação manual (o Claude importa pela Central do Vendedor quando pedido).',frescor(maxData(rShp,'date'),3),shpSem.length?`${shpSem.length} pedido(s) do mês ainda com taxa estimada (${Math.round(shpSem.length/Math.max(1,shp.length)*100)}%)`:'todas as taxas do mês são reais','Conciliação, Resultado, Rentabilidade, Margem'],
  ['Magalu','Pedidos pelo Bling. Não há integração direta: tarifas e repasses são estimados pela regra cadastrada.','Pedidos automáticos; taxas estimadas.',frescor(maxData(o.filter(x=>x.platform==='Magalu'),'date'),7),`${mgl.length} pedido(s) no mês`,'Vendas, Resultado'],
  ['Notas de compra e contas a pagar do Bling','Bling: notas de entrada (vira título a pagar no Jarvis) e contas a pagar/receber do Bling.',`Automático com a sincronização. Última leitura: ${sync(bl)}`,frescor(maxData(nfe,'emissao'),5),`${nfe.filter(x=>String(x.emissao).startsWith(month)).length} nota(s) de entrada no mês`,'Contas a pagar, Compras, Estoque (custo), Devoluções'],
  ['Estoque e custo','Bling: saldo por produto, custo e dados fiscais. Movimentos que nascem no Jarvis vão para o Bling.','Automático (a cada hora); movimentos do Jarvis na hora.',['ver Estoque','info'],`${(window.Estoque?.lista?.()||[]).length||'—'} produto(s)`,'Estoque, Movimentação, Rentabilidade (CMV), Sugestão de compras'],
  ['DIFAL por nota','XML de cada NF-e de venda autorizada no Bling (ICMS da UF de destino e FCP).','Automático a cada 2 min.',['ver DIFAL e GNRE','info'],'','DIFAL e GNRE, Obrigações, Contas a pagar'],
  ['Extrato bancário','Arquivo do banco (OFX/CSV) importado em Contas bancárias; retorno do SISPAG em Arquivos do banco.','Importação manual.',frescor(maxData(tx,'data'),3),`${tx.filter(x=>String(x.data).startsWith(month)).length} movimento(s) no mês`,'Contas bancárias, Conciliação bancária, Fluxo de caixa'],
  ['Contas a pagar','Jarvis: notas de entrada do Bling, lançamentos, DDA, folha, GNRE e recorrências.','Na hora em que cada lançamento acontece.',['ao vivo','ok'],`${pg.filter(t=>!['pago','cancelado'].includes(t.status)&&t.vencimento<hoje()).length} vencido(s)`,'Contas a pagar, Fluxo, Resultado'],
 ];
 const confere=[];
 if(shpSem.length)confere.push(['warn',`Shopee: ${shpSem.length} pedido(s) de ${mesLabel(month)} ainda com taxa estimada — importe a Minha Renda para trocar pela taxa real.`]);
 if(mlSem.length>5)confere.push(['warn',`Mercado Livre: ${mlSem.length} pedido(s) sem a tarifa real (normal para vendas das últimas horas).`]);
 if(dias(maxData(tx,'data'))>3)confere.push(['warn',`Extrato bancário: último movimento em ${dBR(maxData(tx,'data'))}. Importe o extrato para a conciliação bancária e o saldo baterem.`]);
 if(bl.last_error)confere.push(['bad',`Bling: ${bl.last_error}`]);if(mlI.last_error)confere.push(['bad',`Mercado Livre: ${mlI.last_error}`]);
 const venc=pg.filter(t=>!['pago','cancelado'].includes(t.status)&&t.vencimento<hoje());if(venc.length)confere.push(['bad',`${venc.length} conta(s) a pagar vencida(s): baixe o que já foi pago ou importe o retorno do banco.`]);
 confere.push(['info','Todo mês, antes de fechar: Conciliação (a receber x recebido por canal), Conciliação bancária (extrato x Jarvis) e a DRE contra o balancete da contabilidade.']);
 return `<div class="notice">Cada número do Jarvis vem de uma destas fontes. <strong>Automático</strong> = chega sozinho (cron no servidor, mesmo com o navegador fechado). <strong>Importação</strong> = depende de um arquivo ou relatório. A coluna "Atualizado" mede a data mais recente que existe nos dados.</div>
 <div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Fonte</th><th>De onde vem</th><th>Como chega</th><th>Atualizado</th><th>No mês</th><th>Alimenta</th></tr></thead><tbody>
 ${F.map(([t,de,como,[fr,tom],mesTxt,usa])=>`<tr><td><strong>${t}</strong></td><td class="caption">${de}</td><td class="caption">${como}</td><td><span class="badge ${tom}">${fr}</span></td><td class="caption">${mesTxt}</td><td class="caption">${usa}</td></tr>`).join('')}</tbody></table></div></div>
 <section class="card" style="margin-top:14px"><h3>O que conferir agora</h3><ul class="checklist">${confere.map(([tom,t])=>`<li><span class="badge ${tom}">${tom==='bad'?'urgente':tom==='warn'?'atenção':'rotina'}</span> ${esc(t)}</li>`).join('')}</ul></section>`}
addPage('fontes','link','De onde vêm os números',view,'Cada fonte de dados do Jarvis: como chega, quando foi atualizada, que telas alimenta e o que conferir.','',()=>{});
})();
