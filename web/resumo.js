'use strict';
// Resumo da semana para a diretoria: vendas da última semana fechada (seg–dom) contra a anterior, por canal, margem
// de contribuição, caixa (hoje, menor saldo em 30 dias) e pendências. Pronto para copiar, mandar no WhatsApp ou por
// e-mail. (Envio automático toda segunda precisa do provedor de e-mail / WhatsApp Business — ver Integrações.)
(()=>{
Object.assign(paths,{doc2:'M6 3h9l3 3v15H6z M9 9h6 M9 13h6 M9 17h4'});
const iso=d=>d.toLocaleDateString('sv-SE');
function semanas(){const h=new Date();h.setHours(12);const seg=new Date(h);seg.setDate(h.getDate()-((h.getDay()+6)%7)-7);const dom=new Date(seg);dom.setDate(seg.getDate()+6);const s2=new Date(seg);s2.setDate(seg.getDate()-7);const d2=new Date(dom);d2.setDate(dom.getDate()-7);return {ini:iso(seg),fim:iso(dom),ini2:iso(s2),fim2:iso(d2)}}
const dBR=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
const pct=(a,b)=>b?((a/b-1)*100):null;const fp=v=>v==null?'—':`${v>=0?'+':''}${v.toFixed(1).replace('.',',')}%`;
function dados(){const w=semanas(),em=(o,a,b)=>o.date>=a&&o.date<=b,s1=db.orders.filter(o=>em(o,w.ini,w.fim)),s0=db.orders.filter(o=>em(o,w.ini2,w.fim2)),soma=l=>l.reduce((a,o)=>a+(o.gross||0),0);
 const canais=[...new Set(s1.map(o=>o.platform))].map(c=>({c,v:soma(s1.filter(o=>o.platform===c)),n:s1.filter(o=>o.platform===c).length,v0:soma(s0.filter(o=>o.platform===c))})).sort((a,b)=>b.v-a.v);
 const itens=new Map();for(const o of s1)for(const i of o.items||[]){const k=i.title||i.sku;const x=itens.get(k)||{k,q:0,v:0};x.q+=Number(i.qty)||0;x.v+=(Number(i.qty)||0)*(Number(i.price)||0);itens.set(k,x)}
 const mg=window.Margem?.resumo?.(),cx=(()=>{try{return window.Fluxo?.resumoCaixa?.(30)}catch{return null}})();
 const hoje=iso(new Date()),ab=(db.payables||[]).filter(t=>!['pago','cancelado'].includes(t.status)),venc=ab.filter(t=>t.vencimento<hoje),saldoT=t=>Math.max(0,t.valor+(t.juros||0)-(t.desconto||0)-(t.valorPago||0));
 const pend=[];const add=(t,s)=>pend.push([t,s]);
 if(venc.length)add(`${venc.length} conta(s) vencida(s)`,money(venc.reduce((a,t)=>a+saldoT(t),0)));
 for(const g of [window.Metas,window.Pagamentos,window.Faturamento,window.Estoque,window.Atendimento,window.Orcamento,window.Margem,window.NfRecebidas])for(const a of g?.avisos?.()||[])add(a[2],a[3]||'');
 const metas=(()=>{try{return window.Metas?.resumo?.()||[]}catch{return []}})();
 return {metas,w,v1:soma(s1),v0:soma(s0),n1:s1.length,n0:s0.length,canais,top:[...itens.values()].sort((a,b)=>b.v-a.v).slice(0,5),mg,cx,pend}}
function texto(d){const L=[`*Resumo da semana · ${dBR(d.w.ini)} a ${dBR(d.w.fim)}*`,'',`*Vendas:* ${money(d.v1)} em ${d.n1} pedidos (${fp(pct(d.v1,d.v0))} vs. semana anterior)`,`Ticket médio: ${money(d.n1?d.v1/d.n1:0)}`];
 for(const c of d.canais)L.push(`• ${c.c}: ${money(c.v)} · ${c.n} ped. (${fp(pct(c.v,c.v0))})`);
 if(d.top.length){L.push('','*Mais vendidos:*');d.top.forEach((t,i)=>L.push(`${i+1}. ${t.k} — ${t.q} un. · ${money(t.v)}`))}
 if(d.mg&&d.mg.venda)L.push('',`*Margem de contribuição (30 dias):* ${(d.mg.lucro/d.mg.venda*100).toFixed(1).replace('.',',')}% · ${money(d.mg.lucro)}`,`Pedidos com prejuízo: ${d.mg.prejuizo} (${money(d.mg.perda)})`);
 if(d.cx)L.push('',`*Caixa:* ${money(d.cx.hoje)} hoje${d.cx.aplic?` + ${money(d.cx.aplic)} aplicado`:''}`,`Menor saldo em 30 dias: ${money(d.cx.min)} em ${dBR(d.cx.dataMin)}${d.cx.negativos?` ⚠️ ${d.cx.negativos} dia(s) negativo(s)`:''}`);
 if(d.metas?.length){const NM={vendas:'Vendas',margem:'Margem',recebido:'Recebido'},ST={ok:'no ritmo ✅',atencao:'atenção ⚠️',abaixo:'abaixo do ritmo 🔻',cedo:'começo do mês',futuro:'',semdados:'sem dados'};L.push('','*Metas do mês:*');for(const a of d.metas)L.push(a.ind==='margem'?`• ${NM[a.ind]}: ${a.real==null?'—':a.real.toFixed(1).replace('.',',')+'%'} (meta ${Number(a.meta).toFixed(1).replace('.',',')}%) · ${ST[a.status]}`:`• ${NM[a.ind]}: ${money(a.real)} de ${money(a.meta)} (${Math.round((a.pct||0)*100)}%) · ${ST[a.status]}${a.proj!=null&&!['futuro','cedo'].includes(a.status)?` · projeção ${money(a.proj)}`:''}`)}
 L.push('',`*Pendências:*`);if(d.pend.length)d.pend.slice(0,10).forEach(p=>L.push(`• ${p[0]}${p[1]?' — '+p[1]:''}`));else L.push('• Nada pendente ✓');
 L.push('','_Gerado pelo Jarvis_');return L.join('\n')}
function view(){const d=dados(),t=texto(d),v=pct(d.v1,d.v0),mx=Math.max(1,...d.canais.map(c=>c.v));
 return `<div class="crmbar"><button class="primary small" data-rs="copiar">${icon('doc2')} Copiar resumo</button><a class="btnlink small" href="https://wa.me/?text=${encodeURIComponent(t)}" target="_blank" rel="noopener">Enviar no WhatsApp</a><a class="btnlink small" href="mailto:?subject=${encodeURIComponent('Resumo da semana · '+dBR(d.w.ini)+' a '+dBR(d.w.fim))}&body=${encodeURIComponent(t.replace(/\*/g,'').replace(/_/g,''))}">Enviar por e-mail</a><span class="caption">Semana de ${dBR(d.w.ini)} a ${dBR(d.w.fim)}</span></div>
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Vendas da semana</span><span class="kpiv">${money(d.v1)}</span><span class="kpis"><b class="${v<0?'red':'green'}">${fp(v)}</b> vs. anterior · ${d.n1} pedidos</span></div>
  <div class="card kpi"><span class="kpil">Margem de contribuição · 30 d</span><span class="kpiv">${d.mg?.venda?(d.mg.lucro/d.mg.venda*100).toFixed(1).replace('.',',')+'%':'—'}</span><span class="kpis">${d.mg?`${money(d.mg.lucro)} · ${d.mg.prejuizo} pedido(s) com prejuízo`:''}</span></div>
  <div class="card kpi"><span class="kpil">Caixa hoje</span><span class="kpiv">${d.cx?money(d.cx.hoje):'—'}</span><span class="kpis">${d.cx?`menor em 30 d: ${money(d.cx.min)} (${dBR(d.cx.dataMin)})`:''}</span></div>
  <div class="card kpi"><span class="kpil">Pendências</span><span class="kpiv ${d.pend.length?'gold':''}">${d.pend.length}</span><span class="kpis">vencidos, aprovações, notas, estoque</span></div></div>
 <div class="grid two"><section class="card"><h3>Vendas por canal</h3>${d.canais.map(c=>`<div class="fxbarra"><span>${esc(c.c)}</span><i><b class="green" style="width:${(c.v/mx*100).toFixed(0)}%"></b></i><em>${money(c.v)}</em></div><p class="caption" style="margin:-2px 0 8px">${c.n} pedidos · ${fp(pct(c.v,c.v0))} vs. anterior</p>`).join('')||'<p class="caption">Sem vendas na semana.</p>'}
  <h3 style="margin-top:14px">Mais vendidos</h3>${d.top.map((x,i)=>`<div class="listline"><span>${i+1}. ${esc(x.k)}</span><strong>${x.q} un. · ${money(x.v)}</strong></div>`).join('')}</section>
 <section class="card">${d.metas?.length?`<h3>Metas do mês</h3>${d.metas.map(a=>{const NM={vendas:'Vendas',margem:'Margem de contribuição',recebido:'Recebido'},T={ok:['No ritmo','ok'],atencao:['Atenção','warn'],abaixo:['Abaixo do ritmo','bad'],cedo:['Começo do mês','info'],futuro:['—',''],semdados:['Sem dados','']}[a.status];return `<div class="listline"><span>${NM[a.ind]}</span><span>${a.ind==='margem'?(a.real==null?'—':a.real.toFixed(1).replace('.',',')+'%'):Math.round((a.pct||0)*100)+'% da meta'} <span class="badge ${T[1]}">${T[0]}</span></span></div>`}).join('')}<p class="caption" style="margin:4px 0 14px"><a href="#metas" data-nav="metas">Ver metas por canal</a></p>`:''}<h3>Pendências</h3>${d.pend.map(p=>`<div class="listline"><span>${esc(p[0])}</span><span class="caption">${esc(p[1])}</span></div>`).join('')||'<p class="caption">Nada pendente. ✓</p>'}
  <h3 style="margin-top:14px">Texto pronto</h3><pre class="rstexto">${esc(t)}</pre></section></div>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-rs]');if(!b)return;const t=texto(dados());navigator.clipboard?.writeText(t).then(()=>toast('Resumo copiado. Cole no WhatsApp ou no e-mail.'),()=>toast('Não consegui copiar.'))});
addPage('resumo','doc2','Resumo da semana',view,'Vendas, margem, caixa e pendências da última semana, prontos para mandar à diretoria.','',()=>{});
window.Resumo={avisos:()=>new Date().getDay()===1?[['info','doc2','Resumo da semana pronto','Mande para a diretoria em um clique','resumo']]:[]};
})();
