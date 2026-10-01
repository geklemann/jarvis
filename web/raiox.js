'use strict';
// Vendas › Raio-X da margem: por que a margem de contribuição mudou de um mês para outro. A variação é dividida
// exatamente entre tarifa, frete, custo e tributos; depois por canal e por produto (efeito mix × efeito margem), com
// o que mudou em cada produto e o que fazer. Cálculo em Margem.raiox (web/margem.js), mesma regra do Radar de margem.
(()=>{
Object.assign(paths,{raiox:'M4 19h16 M6 16V9 M10 16V5 M14 16v-4 M18 16V8'});
const st={base:''};
window.Reiniciar?.registrar(st,['base']); // estado de tela: volta ao original ao clicar no menu
const mesAnt=m=>{const [a,b]=m.split('-').map(Number);return new Date(a,b-2,1,12).toLocaleDateString('sv-SE').slice(0,7)};
const nomeMes=m=>{const [a,b]=m.split('-').map(Number);return new Date(a,b-1,1,12).toLocaleDateString('pt-BR',{month:'short',year:'numeric'}).replace('.','')};
const pct=v=>v==null?'—':(v*100).toFixed(1).replace('.',',')+'%';
const pp=v=>v==null?'—':`${v>0?'+':v<0?'−':''}${Math.abs(v*100).toFixed(2).replace('.',',')} p.p.`;
const tom=v=>v>0.00005?'green':v<-0.00005?'red':'';
function barra(v,max){const w=max?Math.min(100,Math.abs(v)/max*100):0;return `<span class="rxbar ${v<0?'neg':'pos'}"><i style="width:${w.toFixed(1)}%"></i></span>`}
function view(){if(!window.Margem?.raiox)return '<div class="empty">Carregando…</div>';
 const mB=typeof month==='string'?month:new Date().toLocaleDateString('sv-SE').slice(0,7),meses=[...new Set((db.orders||[]).map(o=>String(o.date||'').slice(0,7)))].filter(m=>m&&m<mB).sort().reverse();
 const mA=st.base&&meses.includes(st.base)?st.base:(meses.includes(mesAnt(mB))?mesAnt(mB):meses[0]);
 if(!mA)return '<div class="empty">Precisa de pelo menos dois meses de vendas para comparar.</div>';
 const r=Margem.raiox(mA,mB),max=Math.max(0.001,...r.fatores.map(f=>Math.abs(f.efeito)),Math.abs(r.canais.mix),Math.abs(r.canais.marg));
 const ult=[...meses.slice(0,5).reverse(),mB],tend=Margem.tendencia(ult);
 const piores=r.produtos.itens.filter(x=>x.contrib<-0.00005).slice(0,15),melhores=[...r.produtos.itens].reverse().filter(x=>x.contrib>0.00005).slice(0,5);
 return `<div class="crmbar"><span>Comparando <strong>${esc(nomeMes(mB))}</strong> (competência do cabeçalho) com</span><select data-rx="base" aria-label="Mês de comparação">${meses.slice(0,18).map(m=>`<option value="${m}" ${m===mA?'selected':''}>${esc(nomeMes(m))}</option>`).join('')}</select>
  <span class="caption">Margem de contribuição = vendas − tarifa − frete pago pela loja − custo dos produtos − tributos (pedidos com custo cadastrado).</span></div>
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Margem ${esc(nomeMes(mA))}</span><span class="kpiv">${pct(r.margemA)}</span><span class="kpis">${money(r.a.lucro)} em ${money(r.a.venda)}</span></div>
  <div class="card kpi"><span class="kpil">Margem ${esc(nomeMes(mB))}</span><span class="kpiv ${tom(r.variacao)}">${pct(r.margemB)}</span><span class="kpis">${money(r.b.lucro)} em ${money(r.b.venda)}</span></div>
  <div class="card kpi"><span class="kpil">Variação</span><span class="kpiv ${tom(r.variacao)}">${pp(r.variacao)}</span><span class="kpis">${r.variacao!=null?`${money(r.b.venda*(r.variacao||0))} a ${r.variacao<0?'menos':'mais'} no mês, no volume atual`:''}</span></div>
  <div class="card kpi"><span class="kpil">Fora da conta</span><span class="kpiv">${r.semCusto.b}</span><span class="kpis">pedido(s) sem custo cadastrado em ${esc(nomeMes(mB))}</span></div></div>
 <div class="grid two" style="align-items:start">
 <section class="tablebox"><div class="tabletop"><h2>De onde veio a variação</h2><span class="caption">em pontos percentuais da margem</span></div><div class="tablewrap"><table><thead><tr><th>Fator</th><th class="num">${esc(nomeMes(mA))}</th><th class="num">${esc(nomeMes(mB))}</th><th class="num">Efeito na margem</th><th style="min-width:120px"></th></tr></thead><tbody>
  ${r.fatores.map(f=>`<tr><td>${f.t}</td><td class="num">${pct(f.a)}</td><td class="num">${pct(f.b)}</td><td class="num ${tom(f.efeito)}"><strong>${pp(f.efeito)}</strong></td><td>${barra(f.efeito,max)}</td></tr>`).join('')}
  <tr><td><strong>Total</strong></td><td class="num">${pct(r.margemA)}</td><td class="num">${pct(r.margemB)}</td><td class="num ${tom(r.variacao)}"><strong>${pp(r.variacao)}</strong></td><td></td></tr></tbody></table></div>
  <p class="caption" style="padding:0 14px 12px">Cada linha mostra o peso do fator nas vendas. Tarifa subindo de 20% para 22% tira 2 pontos da margem.</p></section>
 <section class="tablebox"><div class="tabletop"><h2>Por canal</h2><span class="caption">mix: vender mais no canal de margem menor · margem: o canal ficou pior</span></div><div class="tablewrap"><table><thead><tr><th>Canal</th><th class="num">Peso nas vendas</th><th class="num">Margem</th><th class="num">Efeito</th></tr></thead><tbody>
  ${r.canais.itens.map(x=>`<tr><td><strong>${esc(x.k)}</strong></td><td class="num">${pct(x.wA)} → ${pct(x.wB)}</td><td class="num">${pct(x.ma)} → <span class="${tom((x.mb??0)-(x.ma??0))}">${pct(x.mb)}</span></td><td class="num ${tom(x.contrib)}">${pp(x.contrib)}</td></tr>`).join('')}
  <tr><td colspan="3">Efeito mix (troca de peso entre canais)</td><td class="num ${tom(r.canais.mix)}">${pp(r.canais.mix)}</td></tr><tr><td colspan="3">Efeito margem (cada canal em si)</td><td class="num ${tom(r.canais.marg)}">${pp(r.canais.marg)}</td></tr></tbody></table></div></section></div>
 <section class="tablebox"><div class="tabletop"><div><h2>Produtos que mais puxaram a margem para baixo</h2><p class="caption">Contribuição de cada produto para a variação (a soma de todos os produtos dá a variação total) e o que mudou nele, por unidade.</p></div><div class="row" style="gap:6px;flex-wrap:wrap"><button class="small" data-nav="margem">${icon('radar')} Preço mínimo (Radar)</button><button class="small" data-nav="concorrencia">${icon('tag')} Ajustar preços no Mercado Livre</button><button class="small" data-nav="catalogo">${icon('tag')} Preço por canal (Shopee, Magalu)</button></div></div><div class="tablewrap"><table><thead><tr><th>Produto</th><th class="num">Vendas ${esc(nomeMes(mB))}</th><th class="num">Margem</th><th class="num">Mix</th><th class="num">Margem do item</th><th class="num">Contribuição</th><th>O que mudou · o que fazer</th></tr></thead><tbody>
  ${piores.map(x=>`<tr><td><strong>${esc(x.b?.nome||x.a?.nome||x.k)}</strong><br><span class="caption mono">${esc(x.k)}</span></td><td class="num">${money(x.b?.venda||0)}<br><span class="caption">${Math.round(x.b?.u||0)} un.</span></td><td class="num">${pct(x.ma)} → <span class="${(x.mb??0)<0?'red':''}">${pct(x.mb)}</span></td><td class="num ${tom(x.eMix)}">${pp(x.eMix)}</td><td class="num ${tom(x.eMarg)}">${pp(x.eMarg)}</td><td class="num red"><strong>${pp(x.contrib)}</strong></td><td class="caption">${esc(x.diag)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhum produto piorou a margem. ✓</td></tr>'}</tbody></table></div></section>
 ${melhores.length?`<section class="tablebox"><div class="tabletop"><h2>Os que mais ajudaram</h2></div><div class="tablewrap"><table><thead><tr><th>Produto</th><th class="num">Vendas</th><th class="num">Margem</th><th class="num">Contribuição</th><th>O que mudou</th></tr></thead><tbody>${melhores.map(x=>`<tr><td><strong>${esc(x.b?.nome||x.a?.nome||x.k)}</strong></td><td class="num">${money(x.b?.venda||0)}</td><td class="num">${pct(x.ma)} → ${pct(x.mb)}</td><td class="num green">${pp(x.contrib)}</td><td class="caption">${esc(x.diag)}</td></tr>`).join('')}</tbody></table></div></section>`:''}
 <section class="tablebox"><div class="tabletop"><h2>Últimos meses</h2><span class="caption">peso de cada fator nas vendas</span></div><div class="tablewrap"><table><thead><tr><th>Mês</th><th class="num">Vendas (com custo)</th><th class="num">Tarifa</th><th class="num">Frete</th><th class="num">Custo</th><th class="num">Tributos</th><th class="num">Margem</th></tr></thead><tbody>
  ${tend.map(t=>`<tr><td>${esc(nomeMes(t.mes))}</td><td class="num">${money(t.venda)}</td><td class="num">${pct(t.tarifa)}</td><td class="num">${pct(t.frete)}</td><td class="num">${pct(t.custo)}</td><td class="num">${pct(t.tributos)}</td><td class="num"><strong>${pct(t.margem)}</strong></td></tr>`).join('')}</tbody></table></div></section>`}
document.addEventListener('change',e=>{const s=e.target.closest('[data-rx="base"]');if(s){st.base=s.value;render()}});
addPage('raiox','raiox','Raio-X da margem',view,'Por que a margem mudou de um mês para o outro: tarifa, frete, custo, tributos, canais e produtos — e o que fazer.','',()=>{});
})();
