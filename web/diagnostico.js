'use strict';
// Diagnóstico de repasses e margem: o relatório de uma página do "diagnóstico gratuito". Lê os pedidos, repasses e
// custos da empresa conectada e mostra quanto ela lucra por canal e onde há dinheiro parado, cobrado a mais ou perdido.
// Pronto para imprimir ou salvar em PDF (A4 em pé).
(()=>{
Object.assign(paths,{lupa:'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z M21 21l-5-5 M8 11h6 M11 8v6'});
const ui={per:30};
window.Reiniciar?.registrar(ui,['per']); // estado de tela: volta ao original ao clicar no menu
const p1=v=>(v*100).toFixed(1).replace('.',',')+'%';
const R=v=>money(Math.round(v));
function atrasados(){const lim=new Date(Date.now()-3*864e5).toLocaleDateString('sv-SE'),ini=new Date(Date.now()-ui.per*864e5).toLocaleDateString('sv-SE');
 const l=db.orders.filter(o=>o.date>=ini&&o.due&&o.due<lim&&!(o.gross>0&&o.fee>=o.gross*0.95)).map(o=>({o,falta:Math.max(0,net(o)-paid(o))})).filter(x=>x.falta>0.5&&!o_transito(x.o));
 return {n:l.length,valor:l.reduce((s,x)=>s+x.falta,0)}}
const o_transito=o=>!!o.transit;
function view(){const d=window.Margem?.diagnostico?.(ui.per);if(!d)return '<div class="card empty">O Radar de margem ainda não carregou.</div>';
 if(!d.pedidos)return `<div class="card empty">Sem pedidos com custo cadastrado nos últimos ${ui.per} dias. Conecte os marketplaces e importe os custos dos produtos para gerar o diagnóstico.</div>`;
 const at=atrasados(),achado=d.fora.valor+d.menores.valor+d.prejuizo.valor+at.valor,mes=v=>v*30/ui.per;
 const hoje=new Date(),ini=new Date(d.ini+'T12:00');
 const rec=[];
 if(d.prejuizo.n)rec.push(`<b>Reprecificar ${d.prejuizo.n} anúncio(s) no prejuízo.</b> O preço mínimo de cada um está na tabela acima; comece pelos que mais perdem.`);
 if(d.fora.n)rec.push(`<b>Contestar ${d.fora.n} tarifa(s) acima do padrão</b> do canal para o mesmo produto (cerca de ${R(d.fora.valor)}).`);
 if(d.menores.n)rec.push(`<b>Conferir ${d.menores.n} repasse(s) abaixo do previsto</b> no Mercado Pago e abrir reclamação quando não houver devolução ou ajuste.`);
 if(at.n)rec.push(`<b>Cobrar ${at.n} repasse(s) atrasado(s)</b> dos marketplaces (${R(at.valor)} vencidos há mais de 3 dias).`);
 const pior=d.canais.slice().sort((a,b)=>a.m-b.m)[0];if(pior&&d.canais.length>1)rec.push(`<b>Rever frete e preços em ${esc(pior.canal)}</b>, o canal com menor margem (${p1(pior.m)}); frete e outros custos levam ${p1(pior.foP)} da venda.`);
 if(d.abaixo)rec.push(`<b>${d.abaixo} anúncio(s) vendem abaixo da meta de margem</b>: o Radar mostra o preço mínimo por canal.`);
 const card=(t,n,v,s,tom)=>`<div class="dg-card ${tom||''}"><span>${t}</span><b>${v}</b><small>${n}${s?' · '+s:''}</small></div>`;
 return `<div class="dg-barra"><label class="caption" for="dgPer">Período</label><select id="dgPer">${[30,60,90].map(n=>`<option value="${n}" ${ui.per===n?'selected':''}>Últimos ${n} dias</option>`).join('')}</select><button class="primary small" data-dg="imprimir">${icon('print')} Imprimir ou salvar PDF</button><span class="caption">Relatório de uma página para entregar ao cliente no fim do diagnóstico gratuito.</span></div>
 <article class="dg-folha">
  <div class="dg-cab"><div class="dg-marca"><img src="brand/jarvis.svg" alt="" width="40" height="40"><div><b>Jarvis</b><small>Diagnóstico de repasses e margem</small></div></div>
   <div class="dg-quem"><b>${esc(window.Cloud?.wsName||'Empresa')}</b><small>${ini.toLocaleDateString('pt-BR')} a ${hoje.toLocaleDateString('pt-BR')} · ${d.pedidos.toLocaleString('pt-BR')} pedidos analisados</small></div></div>
  <section class="dg-achado"><small>Pontos de atenção encontrados no período</small><b>${R(achado)}</b><span>≈ ${R(mes(achado))} por mês, somando tarifas acima do padrão, repasses abaixo do previsto ou atrasados e anúncios vendidos com prejuízo.</span></section>
  <section class="dg-kpis">${card('Vendas no período',`${d.pedidos.toLocaleString('pt-BR')} pedidos`,R(d.venda))}${card('Margem de contribuição','depois de tarifas, frete, custo e impostos',p1(d.margem),'',d.margem<0.05?'ruim':'bom')}${card('Lucro líquido estimado','depois das despesas da empresa',R(d.liquido),'',d.liquido<0?'ruim':'bom')}${card('Anúncios analisados',`${d.prejuizo.n} no prejuízo`,String(d.anuncios),`${d.abaixo} abaixo da meta`)}</section>
  <section><h3>Resultado por canal</h3><table class="dg-tab"><thead><tr><th>Canal</th><th class="num">Pedidos</th><th class="num">Vendas</th><th class="num">Tarifa real</th><th class="num">Frete e outros</th><th class="num">Margem</th></tr></thead>
   <tbody>${d.canais.map(c=>`<tr><td>${esc(c.canal)}</td><td class="num">${c.n.toLocaleString('pt-BR')}</td><td class="num">${R(c.venda)}</td><td class="num">${p1(c.tarP)}</td><td class="num">${p1(c.foP)}</td><td class="num ${c.m<0?'red':''}"><b>${p1(c.m)}</b></td></tr>`).join('')}</tbody></table>
   <p class="dg-nota">Tarifa real = comissão e taxa fixa do marketplace, já descontado o rebate. Frete e outros = frete cobrado, descontos bancados pela loja e diferenças de repasse.</p></section>
  <section><h3>Onde está o dinheiro</h3><div class="dg-grid">
   ${card('Tarifas acima do padrão',`${d.fora.n} pedido(s)`,R(d.fora.valor),'cobrança acima do normal do canal',d.fora.n?'atencao':'')}
   ${card('Repasses abaixo do previsto',`${d.menores.n} pedido(s)`,R(d.menores.valor),'o marketplace pagou menos que o previsto',d.menores.n?'atencao':'')}
   ${card('Repasses atrasados',`${at.n} pedido(s)`,R(at.valor),'vencidos há mais de 3 dias',at.n?'atencao':'')}
   ${card('Vendas com prejuízo',`${d.prejuizo.n} anúncio(s)`,R(d.prejuizo.valor),'perdidos no período',d.prejuizo.n?'ruim':'')}</div></section>
  ${d.prejuizo.top.length?`<section><h3>Anúncios que mais perdem dinheiro</h3><table class="dg-tab"><thead><tr><th>Anúncio</th><th>Canal</th><th class="num">Unid.</th><th class="num">Preço atual</th><th class="num">Preço mínimo</th><th class="num">Perda</th></tr></thead>
   <tbody>${d.prejuizo.top.map(a=>`<tr><td>${esc(String(a.nome).slice(0,46))}</td><td>${esc(a.canal)}</td><td class="num">${Math.round(a.u)}</td><td class="num">${money(a.preco)}</td><td class="num"><b>${a.min?money(a.min):'—'}</b></td><td class="num red">${R(a.perda)}</td></tr>`).join('')}</tbody></table>
   <p class="dg-nota">Preço mínimo para 10% de margem de contribuição, com a tarifa e o frete reais de cada canal.</p></section>`:''}
  <section><h3>O que fazer primeiro</h3><ol class="dg-rec">${rec.slice(0,5).map(r=>`<li>${r}</li>`).join('')||'<li>Nenhum ponto crítico no período. ✓</li>'}</ol></section>
  <footer class="dg-rod">Diagnóstico feito pelo Jarvis com leitura dos pedidos e repasses das plataformas conectadas${d.semCusto?`; ${d.semCusto} pedido(s) sem custo cadastrado ficaram fora`:''}. Impostos pela alíquota efetiva de ${p1(d.aliq)}. Valores estimados, para conferência com a contabilidade. · jaarvis.com.br</footer>
 </article>`}
function bind(){document.body.classList.add('pg-diag');const s=$('#dgPer');if(s)s.onchange=()=>{ui.per=Number(s.value)||30;render()}}
document.addEventListener('click',e=>{if(e.target.closest('[data-dg="imprimir"]'))window.print()});
setInterval(()=>document.body.classList.toggle('pg-diag',page==='diagnostico'),400);
addPage('diagnostico','lupa','Diagnóstico de margem',view,'Relatório de uma página do diagnóstico gratuito: margem por canal e onde há dinheiro parado, cobrado a mais ou perdido.','',bind);
})();
