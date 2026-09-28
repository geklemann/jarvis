'use strict';
// Orçado × realizado por categoria de despesa, mês a mês. O orçamento fica em gerencial.orcamento[AAAA-MM][categoria].
// Realizado: competência = títulos a pagar pelo vencimento + saídas do extrato sem título; caixa = pagamentos e
// saídas do extrato pela data. Categoria acima de 100% vira alerta no sino e na tela Hoje.
(()=>{
Object.assign(paths,{target:'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 11a1 1 0 1 0 1 1 M15 9l6-6 M17 3h4v4'});
const ui={regime:'competencia'};
const mesAnt=(m,n=1)=>{const d=new Date(m+'-15T12:00:00');d.setMonth(d.getMonth()-n);return d.toISOString().slice(0,7)};
const nomeMes=m=>new Date(m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const pode=()=>['owner','member','financeiro','contador'].includes(window.Cloud?.role||'owner');
const ORC=()=>db.gerencial?.orcamento||{};
const ignorar=t=>['transferencia','aplicacao','payable','recebivel'].includes(t.vinculo?.tipo);
function realizado(m,regime){const r={};const add=(c,v)=>{c=c||'Sem categoria';r[c]=(r[c]||0)+v};
 for(const p of db.payables||[]){if(p.status==='cancelado')continue;if(regime==='caixa'){if(String(p.pagoEm||'').startsWith(m))add(p.categoria,Number(p.valorPago)||0)}else if(String(p.vencimento).startsWith(m))add(p.categoria,Number(p.valor)||0)}
 for(const t of db.bankTx||[]){if(t.valor>=0||t.status==='ignorado'||t.origem==='espelho'||ignorar(t)||!String(t.data).startsWith(m))continue;const c=t.vinculo?.categoria||t.categoria;if(!c||/a classificar/i.test(c))continue;add(c,-t.valor)}
 return r}
function linhas(m){const orc=ORC()[m]||{},real=realizado(m,ui.regime),cats=[...new Set([...Object.keys(orc),...Object.keys(real)])];
 return cats.map(c=>{const o=Number(orc[c])||0,r=round(real[c]||0),pct=o?r/o:null;return {c,o,r,pct,dif:o-r,st:!o?(r?'sem':'zero'):pct>1?'estourou':pct>=.85?'atencao':'ok'}}).sort((a,b)=>(b.pct??-1)-(a.pct??-1)||b.r-a.r)}
const ST={estourou:['bad','Estourou'],atencao:['warn','Atenção'],ok:['ok','No limite'],sem:['','Sem orçamento'],zero:['','—']};
function view(){const m=month,L=linhas(m),to=L.reduce((a,x)=>a+x.o,0),tr=L.reduce((a,x)=>a+x.r,0),est=L.filter(x=>x.st==='estourou'),at=L.filter(x=>x.st==='atencao'),ed=pode();
 const hoje=new Date(),dm=m===hoje.toISOString().slice(0,7)?hoje.getDate()/new Date(hoje.getFullYear(),hoje.getMonth()+1,0).getDate():null;
 return `<div class="crmbar"><div class="segtabs">${[['competencia','Competência (vencimento)'],['caixa','Caixa (pagamento)']].map(([k,t])=>`<button class="${ui.regime===k?'active':''}" data-orc-reg="${k}">${t}</button>`).join('')}</div>
  ${ed?`<button class="small" data-orc="copiar">Copiar de ${nomeMes(mesAnt(m))}</button><button class="small" data-orc="media">Sugerir pela média de 3 meses</button><button class="small quiet" data-orc="nova">${icon('plus')} Categoria</button>`:''}</div>
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Orçado em ${nomeMes(m)}</span><span class="kpiv">${money(to)}</span><span class="kpis">${L.filter(x=>x.o).length} categoria(s) com orçamento</span></div>
  <div class="card kpi"><span class="kpil">Realizado</span><span class="kpiv ${to&&tr>to?'red':''}">${money(tr)}</span><span class="kpis">${to?`${(tr/to*100).toFixed(0)}% do orçado`:'defina o orçamento'}${dm!=null?` · ${(dm*100).toFixed(0)}% do mês passou`:''}</span></div>
  <div class="card kpi"><span class="kpil">Saldo do orçamento</span><span class="kpiv ${to-tr<0?'red':'green'}">${money(to-tr)}</span><span class="kpis">${to-tr<0?'acima do planejado':'ainda disponível'}</span></div>
  <div class="card kpi"><span class="kpil">Categorias em alerta</span><span class="kpiv ${est.length?'red':at.length?'gold':''}">${est.length+at.length}</span><span class="kpis">${est.length} estourada(s) · ${at.length} acima de 85%</span></div></div>
 <div class="tablebox"><div class="tabletop"><div><h2>Orçado × realizado · ${nomeMes(m)}</h2><p class="caption">Digite o orçado de cada categoria (salva sozinho). A barra mostra o consumo; a marca fina indica quanto do mês já passou.</p></div></div>
 <div class="tablewrap"><table class="orctab"><thead><tr><th>Categoria</th><th class="num">Orçado</th><th class="num">Realizado</th><th style="width:30%">Consumo</th><th class="num">Disponível</th><th>Situação</th></tr></thead><tbody>
 ${L.map(x=>{const [tom,t]=ST[x.st],w=x.pct==null?0:Math.min(100,x.pct*100);return `<tr><td><strong>${esc(x.c)}</strong></td>
  <td class="num">${ed?`<input class="num orcin" data-orc-cat="${esc(x.c)}" value="${x.o?String(x.o).replace('.',','):''}" placeholder="0,00" inputmode="decimal">`:money(x.o)}</td><td class="num">${money(x.r)}</td>
  <td><div class="orcbar ${x.st}"><i style="width:${w}%"></i>${dm!=null?`<u style="left:${dm*100}%"></u>`:''}</div><small class="caption">${x.pct==null?'—':(x.pct*100).toFixed(0)+'%'}</small></td>
  <td class="num ${x.dif<0?'red':''}">${x.o?money(x.dif):'—'}</td><td><span class="badge ${tom}">${t}</span></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Sem despesas nem orçamento neste mês. Use "Sugerir pela média de 3 meses" para começar.</td></tr>'}</tbody>
 <tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${money(to)}</strong></td><td class="num"><strong>${money(tr)}</strong></td><td></td><td class="num"><strong class="${to-tr<0?'red':''}">${money(to-tr)}</strong></td><td></td></tr></tfoot></table></div></div>`}
function gravar(m,obj,txt){db.gerencial={...(db.gerencial||{}),orcamento:{...ORC(),[m]:obj}};audit(txt,nomeMes(m));save()}
document.addEventListener('change',e=>{const i=e.target.closest('[data-orc-cat]');if(!i)return;const m=month,o={...(ORC()[m]||{})},v=Number(String(i.value).replace(/\./g,'').replace(',','.'))||0;if(v)o[i.dataset.orcCat]=round(v);else delete o[i.dataset.orcCat];gravar(m,o,'Orçamento ajustado');render();toast('Orçamento salvo.')});
document.addEventListener('click',e=>{const b=e.target.closest('[data-orc-reg],[data-orc]');if(!b)return;const d=b.dataset,m=month;
 if(d.orcReg){ui.regime=d.orcReg;render();return}
 if(d.orc==='copiar'){const a=ORC()[mesAnt(m)];if(!a||!Object.keys(a).length)return toast('O mês anterior não tem orçamento.');gravar(m,{...a},'Orçamento copiado do mês anterior');render();return}
 if(d.orc==='media'){const soma={};for(let k=1;k<=3;k++){const r=realizado(mesAnt(m,k),ui.regime);for(const [c,v] of Object.entries(r))soma[c]=(soma[c]||0)+v}const o={...(ORC()[m]||{})};for(const [c,v] of Object.entries(soma))if(!o[c])o[c]=Math.ceil(v/3/50)*50;gravar(m,o,'Orçamento sugerido pela média de 3 meses');render();toast('Orçamento sugerido. Ajuste o que precisar.');return}
 if(d.orc==='nova'){modal('Nova categoria no orçamento',`<label for="orcNova">Categoria</label><input id="orcNova" list="orcCats" placeholder="Ex.: Marketing e anúncios"><datalist id="orcCats">${[...new Set([...(db.cadastros||[]).filter(c=>c.tipo==='cat').map(c=>c.dados.nome),...(db.payables||[]).map(p=>p.categoria).filter(Boolean)])].map(c=>`<option value="${esc(c)}">`).join('')}</datalist><label for="orcVal">Orçado no mês</label><input id="orcVal" inputmode="decimal" placeholder="0,00"><div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-orc="salvarnova">Adicionar</button></div>`);return}
 if(d.orc==='salvarnova'){const c=$('#orcNova').value.trim(),v=Number($('#orcVal').value.replace(/\./g,'').replace(',','.'))||0;if(!c||!v)return toast('Informe categoria e valor.');gravar(m,{...(ORC()[m]||{}),[c]:round(v)},'Categoria incluída no orçamento');closeModal();render()}});
addPage('orcamento','target','Orçado × realizado',view,'Orçamento de despesas por categoria e mês, com consumo em tempo real e alerta quando uma categoria estoura.','',()=>{});
window.Orcamento={avisos:()=>{const m=new Date().toISOString().slice(0,7);if(!ORC()[m])return [];const old=ui.regime;ui.regime='competencia';const l=linhas(m).filter(x=>x.st==='estourou');ui.regime=old;return l.length?[['bad','target',`${l.length} categoria(s) acima do orçamento`,l.slice(0,3).map(x=>`${x.c} ${(x.pct*100).toFixed(0)}%`).join(' · '),'orcamento']]:[]}};
})();
