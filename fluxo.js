'use strict';
// Fluxo de caixa de verdade: REALIZADO mês a mês a partir do extrato bancário já classificado (entradas e
// saídas por grupo e categoria, saldo inicial e final batendo com o banco) e PROJETADO para as próximas
// 12 semanas (repasses a receber dos marketplaces × títulos a pagar), com o saldo semana a semana.
(()=>{
const ui={cenOn:false,cen:{atraso:{},vendas:0,adiar:0,antecipar:false,taxa:2.5},aba:'diario',meses:6,abertos:new Set(),futuras:true,dias:30,passado:14,visao:'semana',sel:null};
const GRUPOS=[
 ['e','Repasses dos marketplaces',t=>t.valor>0&&t.vinculo?.tipo==='transferencia'&&/shopee|maree|mercado pago|wolfach|magalu/.test(normalized((t.vinculo.desc||'')+' '+t.descricao)),t=>/shopee|maree/.test(normalized((t.vinculo.desc||'')+' '+t.descricao))?'Shopee':/magalu/.test(normalized(t.vinculo.desc||''))?'Magalu':'Mercado Livre / Mercado Pago'],
 ['e','Resgates de aplicações',t=>t.valor>0&&t.vinculo?.tipo==='aplicacao',()=>'Resgates'],
 ['e','Aportes e outras entradas',t=>t.valor>0,t=>t.vinculo?.categoria||t.categoria||(t.vinculo?.tipo==='transferencia'?'Transferências recebidas':t.status==='pendente'?'A classificar':'Outras entradas')],
 ['s','Fornecedores (títulos)',t=>t.vinculo?.tipo==='payable',t=>t.vinculo?.desc?.split(' · ')[0]||'Fornecedores'],
 ['s','Tributos sobre vendas',t=>/icms|difal|gnre|pis|cofins/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Pessoal',t=>/salario|pro-labore|pró-labore/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Ocupação e utilidades',t=>/aluguel|agua|água|luz|internet/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Embalagens e insumos',t=>/embalage|material/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Investimentos (imobilizado)',t=>/imobilizado|maquina|máquina|movei|móvei/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Aplicações financeiras',t=>t.vinculo?.tipo==='aplicacao',()=>'Aplicações'],
 ['s','Transferências e saques',t=>t.vinculo?.tipo==='transferencia',t=>t.vinculo?.desc||'Transferências'],
 ['s','Administrativas e outras',t=>true,t=>t.vinculo?.categoria||t.categoria||(t.status==='pendente'?'A classificar':'Outras saídas')]];
const mesBR=m=>new Date(m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
const addMes=(m,n)=>{const d=new Date(m+'-15T12:00:00');d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const k=v=>Math.abs(v)<0.005?'—':money(v);
function realizado(){const contas=(db.bankAccounts||[]).filter(a=>a.tipo!=='aplicacao'&&a.ativo!==false),ids=new Set(contas.map(a=>a.id));
 const meses=[...Array(ui.meses)].map((_,i)=>addMes(month,i-ui.meses+1)),txs=(db.bankTx||[]).filter(t=>ids.has(t.contaId)&&t.status!=='ignorado'&&t.origem!=='espelho');
 const saldoAte=d=>contas.reduce((s,a)=>s+Number(a.saldoInicial||0)+txs.filter(t=>t.contaId===a.id&&t.data>(a.dataSaldoInicial||'0000')&&t.data<=d).reduce((x,t)=>x+t.valor,0),0);
 const cel=new Map();const add=(g,c,m,v)=>{const key=g+'|'+c;const x=cel.get(key)||{};x[m]=(x[m]||0)+v;cel.set(key,x)};
 for(const t of txs){const m=t.data.slice(0,7);if(!meses.includes(m))continue;const lado=t.valor>0?'e':'s';const g=GRUPOS.find(([l,,f])=>l===lado&&f(t));add(g[1],g[3](t)||'Outros',m,t.valor)}
 const soma=(g,m)=>[...cel].filter(([key])=>key.startsWith(g+'|')).reduce((s,[,x])=>s+(x[m]||0),0);
 const fimMes=m=>{const [y,mm]=m.split('-').map(Number);return new Date(y,mm,0).toLocaleDateString('sv-SE')};
 const ini=meses.map(m=>saldoAte(fimMes(addMes(m,-1)))),fim=meses.map(m=>saldoAte(fimMes(m)));
 const linhaG=(lado,g)=>{const cats=[...cel.keys()].filter(key=>key.startsWith(g+'|')).map(key=>key.split('|')[1]);if(!cats.length)return '';const aberto=ui.abertos.has(g);
  return `<tr class="clickrow fxg" data-fx-grupo="${esc(g)}"><td>${aberto?'▾':'▸'} ${esc(g)}</td>${meses.map(m=>`<td class="num ${lado==='s'?'red':'green'}">${k(soma(g,m))}</td>`).join('')}<td class="num"><strong>${k(meses.reduce((s,m)=>s+soma(g,m),0))}</strong></td></tr>
  ${aberto?cats.sort().map(c=>{const x=cel.get(g+'|'+c);return `<tr class="fxc"><td>${esc(c)}</td>${meses.map(m=>`<td class="num caption">${k(x[m]||0)}</td>`).join('')}<td class="num caption">${k(meses.reduce((s,m)=>s+(x[m]||0),0))}</td></tr>`}).join(''):''}`};
 const tot=lado=>meses.map(m=>GRUPOS.filter(g=>g[0]===lado).reduce((s,g)=>s+soma(g[1],m),0));const te=tot('e'),ts=tot('s');
 return `<div class="notice">Movimento real das contas correntes (${contas.map(a=>esc(a.nome)).join(', ')}) pelo extrato classificado. Aplicações e resgates aparecem como saída e entrada — o dinheiro continua da empresa, só muda de conta. Clique num grupo para abrir as categorias.</div>
 <div class="tablebox"><div class="tabletop"><h2>Fluxo de caixa realizado</h2><select data-fx-meses aria-label="Meses">${[3,6,9,12].map(n=>`<option value="${n}" ${ui.meses===n?'selected':''}>Últimos ${n} meses</option>`).join('')}</select></div><div class="tablewrap"><table class="fxtable"><thead><tr><th>Grupo</th>${meses.map(m=>`<th class="num">${mesBR(m)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
 <tr class="ctbgrupo"><td>Saldo inicial</td>${ini.map(v=>`<td class="num">${money(v)}</td>`).join('')}<td></td></tr>
 <tr class="fxsec"><td colspan="${meses.length+2}">Entradas</td></tr>${GRUPOS.filter(g=>g[0]==='e').map(g=>linhaG('e',g[1])).join('')}
 <tr class="ctbgrupo"><td>Total de entradas</td>${te.map(v=>`<td class="num green">${money(v)}</td>`).join('')}<td class="num green">${money(te.reduce((a,b)=>a+b,0))}</td></tr>
 <tr class="fxsec"><td colspan="${meses.length+2}">Saídas</td></tr>${GRUPOS.filter(g=>g[0]==='s').map(g=>linhaG('s',g[1])).join('')}
 <tr class="ctbgrupo"><td>Total de saídas</td>${ts.map(v=>`<td class="num red">${money(v)}</td>`).join('')}<td class="num red">${money(ts.reduce((a,b)=>a+b,0))}</td></tr>
 <tr class="ctbgrupo"><td>Geração de caixa do mês</td>${meses.map((_,i)=>`<td class="num ${te[i]+ts[i]<0?'red':'green'}">${money(te[i]+ts[i])}</td>`).join('')}<td class="num">${money(te.reduce((a,b)=>a+b,0)+ts.reduce((a,b)=>a+b,0))}</td></tr>
 <tr class="ctbgrupo ctbfinal"><td>Saldo final</td>${fim.map(v=>`<td class="num">${money(v)}</td>`).join('')}<td></td></tr></tbody></table></div></div>`}
// Prazo real de repasse de cada canal: mediana (data da liberação − data do pedido) nos últimos 90 dias.
function prazos(){const lim=new Date(Date.now()-90*864e5).toLocaleDateString('sv-SE'),ped=new Map(db.orders.map(o=>[o.id,o])),d=new Map();
 for(const r of db.receipts||[]){if(!r.linkedOrder||!(r.amount>0)||(r.date||'')<lim)continue;const o=ped.get(r.linkedOrder);if(!o)continue;const n=Math.round((new Date(r.date+'T12:00:00')-new Date(o.date+'T12:00:00'))/864e5);if(n<0||n>90)continue;(d.get(o.platform)||d.set(o.platform,[]).get(o.platform)).push(n)}
 const out={};for(const [p,l] of d){l.sort((a,b)=>a-b);out[p]=l[Math.floor(l.length/2)]}return out}
const somaDias=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toLocaleDateString('sv-SE')};
function projetado(){const h=new Date().toLocaleDateString('sv-SE'),semanas=[...Array(12)].map((_,i)=>{const d=new Date(h+'T12:00:00');d.setDate(d.getDate()+i*7);const f=new Date(d);f.setDate(f.getDate()+6);return {ini:d.toLocaleDateString('sv-SE'),fim:f.toLocaleDateString('sv-SE'),en:{},sa:{}}});
 const semDe=d=>{if(d<h)return 0;const i=semanas.findIndex(s=>d>=s.ini&&d<=s.fim);return i};const put=(o,k,v)=>o[k]=(o[k]||0)+v;
 const pz=prazos();
 for(const o of db.orders){const st=status(o);if(!['A receber','Em trânsito'].includes(st))continue;const f=round(net(o)-paid(o));if(f<=0)continue;const d=o.due||(pz[o.platform]!=null?somaDias(o.date,pz[o.platform]):'');if(!d||d<new Date(Date.now()-60*864e5).toLocaleDateString('sv-SE'))continue;const i=semDe(d);if(i<0)continue;put(semanas[i].en,d<h?`${o.platform} (atrasado)`:o.platform,f)}
 // Vendas futuras: líquido médio diário dos últimos 28 dias por canal, recebido após o prazo de repasse do canal.
 if(ui.futuras){const ini28=somaDias(h,-28),med={};for(const o of db.orders)if(o.date>=ini28&&o.date<h)med[o.platform]=(med[o.platform]||0)+net(o)/28;
  for(let i=0;i<84;i++){const dv=somaDias(h,i);for(const [p,v] of Object.entries(med)){const dr=somaDias(dv,pz[p]??15),j=semDe(dr);if(j>0||(j===0&&dr>=h))put(semanas[j].en,`${p} (vendas futuras)`,v)}}
  // Tributos pagos por venda (GNRE/DIFAL): média diária paga nos últimos 28 dias, mantida no horizonte.
  const trib=(db.bankTx||[]).filter(t=>t.data>=ini28&&t.data<h&&t.valor<0&&/icms|difal|gnre/i.test(t.vinculo?.categoria||t.categoria||'')).reduce((x,t)=>x-t.valor,0)/28;
  if(trib>0)for(let i=0;i<84;i++){const j=semDe(somaDias(h,i));if(j>=0)put(semanas[j].sa,'Tributos sobre vendas (estimativa)',trib)}}
 for(const p of db.payables||[]){if(['pago','cancelado'].includes(p.status))continue;const f=round(Math.max(0,p.valor+(p.juros||0)-(p.desconto||0)-(p.valorPago||0)));if(!f)continue;const i=semDe(p.vencimento);if(i<0)continue;put(semanas[i].sa,p.categoria||'Outros',f)}
 const inicial=window.Tesouraria?.saldos().contas.filter(c=>c.tipo!=='aplicacao').reduce((s,c)=>s+c.saldo,0)||0,aplic=window.Tesouraria?.saldos().contas.filter(c=>c.tipo==='aplicacao').reduce((s,c)=>s+c.saldo,0)||0;let saldo=inicial;
 const lin=semanas.map(s=>{const e=Object.values(s.en).reduce((a,b)=>a+b,0),x=Object.values(s.sa).reduce((a,b)=>a+b,0);saldo+=e-x;return {...s,e,x,saldo}});const minimo=lin.reduce((m,s)=>s.saldo<m.saldo?s:m,lin[0]);
 const d2=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
 return `<label class="check-l" style="margin:0 0 12px"><input type="checkbox" class="check" id="fxFut" ${ui.futuras?'checked':''}> Incluir vendas futuras (média dos últimos 28 dias por canal) · prazo de repasse: ${Object.entries(pz).map(([p,n])=>`${esc(p)} ${n} d`).join(', ')||'sem histórico'}</label>
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Saldo em conta corrente</span><span class="kpiv">${money(inicial)}</span><span class="kpis">+ ${money(aplic)} em aplicações</span></div><div class="card kpi"><span class="kpil">Entradas previstas (12 sem.)</span><span class="kpiv green">${money(lin.reduce((s,x)=>s+x.e,0))}</span><span class="kpis">Repasses a receber${ui.futuras?' + vendas futuras':''}</span></div><div class="card kpi"><span class="kpil">Saídas previstas (12 sem.)</span><span class="kpiv red">${money(lin.reduce((s,x)=>s+x.x,0))}</span><span class="kpis">Títulos em aberto${ui.futuras?' + tributos estimados':''}</span></div><div class="card kpi"><span class="kpil">Menor saldo projetado</span><span class="kpiv ${minimo.saldo<0?'red':''}">${money(minimo.saldo)}</span><span class="kpis">semana de ${d2(minimo.ini)}${minimo.saldo<0?' — resgatar aplicação antes':''}</span></div></div>
 <div class="tablebox"><div class="tabletop"><div><h2>Projeção semanal</h2><p class="caption">Atrasados (repasse ou título vencido) entram na primeira semana.</p></div></div><div class="tablewrap"><table><thead><tr><th>Semana</th><th class="num">Entradas</th><th>Principais entradas</th><th class="num">Saídas</th><th>Principais saídas</th><th class="num">Saldo projetado</th></tr></thead><tbody>
 ${lin.map(s=>`<tr><td>${d2(s.ini)} a ${d2(s.fim)}</td><td class="num green">${k(s.e)}</td><td class="caption">${Object.entries(s.en).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,v])=>`${esc(n)} ${money(v)}`).join(' · ')}</td><td class="num red">${k(s.x)}</td><td class="caption">${Object.entries(s.sa).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,v])=>`${esc(n)} ${money(v)}`).join(' · ')}</td><td class="num"><strong class="${s.saldo<0?'red':''}">${money(s.saldo)}</strong></td></tr>`).join('')}</tbody></table></div></div>`}
// ─────────── Fluxo de caixa DIÁRIO ───────────
// Passado: movimento real do extrato (contas correntes), com o saldo de fim de cada dia batendo com o banco.
// Futuro: repasses a receber, títulos a pagar e (opcional) vendas futuras pelo ritmo de 28 dias e tributos estimados.
// Atrasados (repasse ou título vencido) entram no dia de hoje. Três visões: dia a dia (por semana), calendário e gráfico.
const CAT_E={rep:'Repasses de marketplaces',fut:'Vendas futuras (estimativa)',ext:'Entradas do extrato'},CAT_S={tit:'Contas a pagar',trib:'Tributos (estimativa)',ext:'Saídas do extrato'};
// Cenário (opcional): atraso de repasse por canal, vendas futuras ±%, antecipação de recebíveis com taxa e adiamento de pagamentos.
function eventos(h,dias,cen){cen=cen||{};const atraso=p=>Number(cen.atraso?.[p]||0),ev=[],fim=somaDias(h,dias-1),pz=prazos(),add=(d,lado,nome,v,ref,cat,atras)=>{if(d<h){d=h;atras=true}if(d>fim||!(v>0))return;ev.push({d,lado,nome,v,ref,cat,atras:!!atras})};
 for(const o of db.orders){const st=status(o);if(!['A receber','Em trânsito'].includes(st))continue;const f=round(net(o)-paid(o));if(f<=0)continue;const d=o.due||(pz[o.platform]!=null?somaDias(o.date,pz[o.platform]):'');if(!d||d<somaDias(h,-60))continue;
  if(cen.antecipar){add(h,'e',o.platform+' · antecipado',f*(1-(Number(cen.taxa)||0)/100),'Antecipação de recebíveis · taxa '+String(cen.taxa||0).replace('.',',')+'%','rep');continue}
  add(somaDias(d<h?h:d,atraso(o.platform)),'e',o.platform,f,'Pedido '+(o.external?.bling_numero||o.id)+(atraso(o.platform)?` · atrasado ${atraso(o.platform)} d no cenário`:''),'rep')}
 if(ui.futuras){const ini28=somaDias(h,-28),med={};for(const o of db.orders)if(o.date>=ini28&&o.date<h)med[o.platform]=(med[o.platform]||0)+net(o)/28;
  for(let i=0;i<dias;i++){const dv=somaDias(h,i);for(const [p,v] of Object.entries(med)){const dr=somaDias(dv,(pz[p]??15)+atraso(p));if(dr>=h)add(dr,'e',p+' · vendas futuras',v*(1+(Number(cen.vendas)||0)/100),'estimativa pelo ritmo dos últimos 28 dias'+(cen.vendas?` · ${cen.vendas>0?'+':''}${cen.vendas}% no cenário`:''),'fut')}}
  const trib=(db.bankTx||[]).filter(t=>t.data>=ini28&&t.data<h&&t.valor<0&&/icms|difal|gnre/i.test(t.vinculo?.categoria||t.categoria||'')).reduce((x,t)=>x-t.valor,0)/28;
  if(trib>0)for(let i=0;i<dias;i++)add(somaDias(h,i),'s','Tributos sobre vendas',trib,'média diária paga nos últimos 28 dias','trib')}
 for(const p of db.payables||[]){if(['pago','cancelado'].includes(p.status))continue;const f=round(Math.max(0,p.valor+(p.juros||0)-(p.desconto||0)-(p.valorPago||0)));add(cen.adiar?somaDias(p.vencimento<h?h:p.vencimento,Number(cen.adiar)):p.vencimento,'s',p.fornecedor||p.descricao||'Título',f,(p.categoria||'Sem categoria')+(p.vencimento<h?' · vencido em '+new Date(p.vencimento+'T12:00:00').toLocaleDateString('pt-BR'):''),'tit')}
 return ev}
const dBR2=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),semana=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','');
const curto=v=>{const a=Math.abs(v),s=v<0?'−':'';return a>=1e6?s+(a/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi':a>=1e3?s+(a/1e3).toLocaleString('pt-BR',{maximumFractionDigits:a>=1e5?0:1})+' mil':s+Math.round(a).toLocaleString('pt-BR')};
function linhasDiario(cen){const h=new Date().toLocaleDateString('sv-SE'),contas=(db.bankAccounts||[]).filter(a=>a.tipo!=='aplicacao'&&a.ativo!==false),ids=new Set(contas.map(a=>a.id));
 const txs=(db.bankTx||[]).filter(t=>ids.has(t.contaId)&&t.status!=='ignorado'&&t.origem!=='espelho');
 const saldoAte=d=>contas.reduce((s,a)=>s+Number(a.saldoInicial||0)+txs.filter(t=>t.contaId===a.id&&t.data>(a.dataSaldoInicial||'0000')&&t.data<=d).reduce((x,t)=>x+t.valor,0),0);
 const hojeSaldo=window.Tesouraria?.saldos().contas.filter(c=>c.tipo!=='aplicacao').reduce((s,c)=>s+c.saldo,0)??saldoAte(h),aplic=window.Tesouraria?.saldos().contas.filter(c=>c.tipo==='aplicacao').reduce((s,c)=>s+c.saldo,0)||0;
 const L=[];
 for(let i=ui.passado;i>=1;i--){const d=somaDias(h,-i),m=txs.filter(t=>t.data===d),e=m.filter(t=>t.valor>0).reduce((a,t)=>a+t.valor,0),x=-m.filter(t=>t.valor<0).reduce((a,t)=>a+t.valor,0),fim=saldoAte(d);
  L.push({d,real:true,e,x,ini:fim-e+x,saldo:fim,itens:m.map(t=>({lado:t.valor>0?'e':'s',nome:t.vinculo?.desc||t.descricao||'Movimento',v:Math.abs(t.valor),ref:(contas.find(a=>a.id===t.contaId)?.nome||'')+(t.vinculo?.categoria||t.categoria?' · '+(t.vinculo?.categoria||t.categoria):''),cat:t.vinculo?.categoria||t.categoria||(t.valor>0?'Entradas do extrato':'Saídas do extrato')}))})}
 const ev=eventos(h,ui.dias,cen);let saldo=hojeSaldo;
 for(let i=0;i<ui.dias;i++){const d=somaDias(h,i),it=ev.filter(x=>x.d===d),e=it.filter(x=>x.lado==='e').reduce((a,x)=>a+x.v,0),x=it.filter(x=>x.lado==='s').reduce((a,y)=>a+y.v,0),ini=saldo;saldo+=e-x;
  L.push({d,real:false,e,x,ini,saldo,itens:it.map(y=>({...y,cat:y.lado==='e'?CAT_E[y.cat]:y.cat==='tit'?(String(y.ref).split(' · ')[0]||'Contas a pagar'):CAT_S[y.cat]}))})}
 return {h,L,hojeSaldo,aplic}}
function diario(){const ativo=ui.cenOn&&cenAtivo(),{h,L,hojeSaldo,aplic}=linhasDiario(ativo?ui.cen:null),base=ativo?linhasDiario(null).L.filter(l=>!l.real):null;ui._fx={h,L};const fut=L.filter(l=>!l.real),min=fut.reduce((m,l)=>l.saldo<m.saldo?l:m,fut[0]),neg=fut.filter(l=>l.saldo<0),te=fut.reduce((a,l)=>a+l.e,0),ts=fut.reduce((a,l)=>a+l.x,0),fim=fut[fut.length-1];
 if(!ui.sel||!L.some(l=>l.d===ui.sel))ui.sel=h;
 const atraso=fut[0].itens.filter(i=>i.atras),atrasE=atraso.filter(i=>i.lado==='e').reduce((a,i)=>a+i.v,0),atrasS=atraso.filter(i=>i.lado==='s').reduce((a,i)=>a+i.v,0);
 const situ=neg.length?['bad','Caixa negativo',`em ${neg.length} dia(s), a partir de ${dBR2(neg[0].d)}`]:min.saldo<Math.max(5000,ts/ui.dias*7)?['warn','Atenção','menos de uma semana de saídas no pior dia']:['ok','Caixa saudável','nenhum dia negativo no período'];
 const kpi=(t,v,s,cls='')=>`<div class="fxk ${cls}"><span>${t}</span><strong>${v}</strong><small>${s}</small></div>`;
 return `<div class="fxbar"><div class="segtabs">${[[15,'15 dias'],[30,'30 dias'],[60,'60 dias'],[90,'90 dias']].map(([n,t])=>`<button class="${ui.dias===n?'active':''}" data-fx-dias="${n}">${t}</button>`).join('')}</div>
  <div class="segtabs">${[['semana','Dia a dia'],['cal','Calendário']].map(([k,t])=>`<button class="${ui.visao===k?'active':''}" data-fx-visao="${k}">${t}</button>`).join('')}</div>
  <label class="fxtog"><input type="checkbox" id="fxFut" ${ui.futuras?'checked':''}><span></span>Incluir previsões <small>(vendas futuras e tributos)</small></label>
  <button class="small ${ui.cenOn?'primary':''}" data-fx-cen="1">${icon('sliders')} ${ui.cenOn?'Cenário ligado':'Simular cenário'}</button><button class="small quiet" data-fx-csv="1">${icon('download')} Exportar</button></div>
 ${cenPainel(base,L.filter(l=>!l.real))}
 <div class="fxkpis">${kpi('Saldo hoje',money(hojeSaldo),aplic?`+ ${money(aplic)} aplicado`:'contas correntes')}${kpi(`Entradas · ${ui.dias} dias`,money(te),atrasE?`inclui ${money(atrasE)} de repasses atrasados`:'repasses'+(ui.futuras?' e vendas futuras':''),'in')}${kpi(`Saídas · ${ui.dias} dias`,money(ts),atrasS?`inclui ${money(atrasS)} vencidos`:'contas a pagar'+(ui.futuras?' e tributos':''),'out')}${kpi(`Saldo em ${dBR2(fim.d)}`,money(fim.saldo),`${fim.saldo>=hojeSaldo?'+':''}${money(fim.saldo-hojeSaldo)} no período`)}
  <div class="fxk fxsit ${situ[0]}"><span>Menor saldo</span><strong>${money(min.saldo)}</strong><small><b class="badge ${situ[0]}">${situ[1]}</b> ${dBR2(min.d)} · ${situ[2]}</small></div></div>
 <div class="fxgrid"><div class="fxmain">
  <section class="card fxchart"><div class="fxchead"><div><h2>Saldo dia a dia</h2><p class="caption">Linha: saldo no fim do dia (contínua = extrato real; tracejada = projeção). Barras: entradas e saídas. Passe o mouse para ver cada dia; clique para abrir.</p></div><div class="fxleg"><i class="le"></i>Entradas<i class="ls"></i>Saídas<i class="ll"></i>Saldo</div></div><div class="fxsvg" id="fxSvg"></div><div class="fxtip" id="fxTip" hidden></div></section>
  ${ui.visao==='cal'?calendario(L,h):porSemana(L,h)}
 </div><div class="fxside">${painelDia(L.find(l=>l.d===ui.sel),h)}${maiores(fut)}</div></div>`}
const cenAtivo=()=>{const c=ui.cen;return !!(c.antecipar||Number(c.vendas)||Number(c.adiar)||Object.values(c.atraso||{}).some(Number))};
function cenPainel(base,fut){if(!ui.cenOn)return '';const c=ui.cen,canais=[...new Set(db.orders.map(o=>o.platform))].sort(),min=l=>l.reduce((m,x)=>x.saldo<m.saldo?x:m,l[0]),mb=base&&min(base),mc=min(fut),fimB=base?.[base.length-1],fimC=fut[fut.length-1];
 const dif=(a,b)=>{const d=a-b;return `<b class="${d<0?'red':'green'}">${d>0?'+':''}${money(d)}</b>`};
 return `<section class="card fxcen"><div class="fxcenh"><div><h3>E se…?</h3><p class="caption">Mude as premissas e veja o caixa reagir. Nada é gravado: é só simulação.</p></div>${base?`<div class="fxcomp"><span>Menor saldo: <b>${money(mc.saldo)}</b> (sem cenário: ${money(mb.saldo)}) ${dif(mc.saldo,mb.saldo)}</span><span>Saldo no fim: <b>${money(fimC.saldo)}</b> ${dif(fimC.saldo,fimB.saldo)}</span></div>`:'<span class="caption">Ajuste algum item para comparar.</span>'}</div>
 <div class="fxcenc">${canais.map(p=>`<label>Repasse ${esc(p)} atrasa<select data-fx-c="atraso.${esc(p)}">${[0,3,7,15,30].map(n=>`<option value="${n}" ${Number(c.atraso?.[p]||0)===n?'selected':''}>${n?n+' dias':'no prazo'}</option>`).join('')}</select></label>`).join('')}
 <label>Vendas futuras <span class="fxval">${(c.vendas>0?'+':'')+(c.vendas||0)}%</span><input type="range" min="-50" max="50" step="5" value="${c.vendas||0}" data-fx-c="vendas"></label>
 <label>Adiar pagamentos<select data-fx-c="adiar">${[0,7,15,30].map(n=>`<option value="${n}" ${Number(c.adiar||0)===n?'selected':''}>${n?n+' dias':'não adiar'}</option>`).join('')}</select></label>
 <label class="fxcant"><span><input type="checkbox" data-fx-c="antecipar" ${c.antecipar?'checked':''}> Antecipar recebíveis dos marketplaces</span><span>taxa <input type="number" min="0" max="15" step=".1" value="${c.taxa??2.5}" data-fx-c="taxa" style="width:70px">%</span></label></div>
 <div class="row" style="gap:8px;margin-top:10px"><button class="small quiet" data-fx-cenlimpar="1">Limpar cenário</button></div></section>`}
function porSemana(L,h){const grupos=[];for(const l of L){const dt=new Date(l.d+'T12:00:00'),seg=new Date(dt);seg.setDate(dt.getDate()-((dt.getDay()+6)%7));const k=seg.toLocaleDateString('sv-SE');let g=grupos.find(x=>x.k===k);if(!g)grupos.push(g={k,l:[]});g.l.push(l)}
 return `<section class="tablebox fxtab"><div class="tablewrap"><table><thead><tr><th>Dia</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Resultado</th><th class="num">Saldo final</th></tr></thead><tbody>
 ${grupos.map(g=>{const e=g.l.reduce((a,l)=>a+l.e,0),x=g.l.reduce((a,l)=>a+l.x,0),u=g.l[g.l.length-1];return `<tr class="fxsem"><td>Semana de ${dBR2(g.l[0].d)} a ${dBR2(u.d)}${g.l.every(l=>l.real)?' · realizado':g.l.some(l=>l.real)?' · parte realizada':''}</td><td class="num">${e?money(e):'—'}</td><td class="num">${x?money(-x):'—'}</td><td class="num ${e-x<0?'red':'green'}">${money(e-x)}</td><td class="num"><strong class="${u.saldo<0?'red':''}">${money(u.saldo)}</strong></td></tr>
  ${g.l.map(l=>{const fds=[0,6].includes(new Date(l.d+'T12:00:00').getDay()),r=l.e-l.x,ab=ui.sel===l.d;return `<tr class="fxdia ${l.real?'real':''} ${l.d===h?'hoje':''} ${fds?'fds':''} ${l.saldo<0?'neg':''} ${ab?'sel':''}" data-fx-sel="${l.d}"><td><span class="fxdt">${dBR2(l.d)}</span> <span class="caption">${semana(l.d)}${l.d===h?' · hoje':l.real?' · real':''}</span></td><td class="num green">${l.e?money(l.e):'—'}</td><td class="num red">${l.x?money(-l.x):'—'}</td><td class="num ${r<0?'red':r>0?'green':''}">${r?money(r):'—'}</td><td class="num"><strong class="${l.saldo<0?'red':''}">${money(l.saldo)}</strong></td></tr>
  ${ab&&l.itens.length?`<tr class="fxdet"><td colspan="5">${detalhe(l)}</td></tr>`:''}`}).join('')}`}).join('')}</tbody></table></div></section>`}
function agrupar(itens,lado){const g=new Map();for(const i of itens.filter(x=>x.lado===lado)){const k=i.cat||'Outros',x=g.get(k)||{k,v:0,l:[]};x.v+=i.v;x.l.push(i);g.set(k,x)}return [...g.values()].sort((a,b)=>b.v-a.v)}
function detalhe(l){const col=(t,lado,cls)=>{const gs=agrupar(l.itens,lado);return `<div><h4>${t} <span class="${cls}">${money(gs.reduce((a,g)=>a+g.v,0))}</span></h4>${gs.map(g=>`<details ${gs.length<=2?'open':''}><summary><span>${esc(g.k)}</span><b class="${cls}">${money(g.v)}</b></summary>${g.l.sort((a,b)=>b.v-a.v).slice(0,40).map(i=>`<div class="fxit"><span>${esc(i.nome)}${i.atras?' <em class="badge warn">atrasado</em>':''}<br><small>${esc(i.ref||'')}</small></span><b>${money(i.v)}</b></div>`).join('')}${g.l.length>40?`<small class="caption">+ ${g.l.length-40} itens</small>`:''}</details>`).join('')||'<p class="caption">Nada neste dia.</p>'}</div>`};
 return `<div class="fxdetg">${col('Entradas','e','green')}${col('Saídas','s','red')}</div>`}
function painelDia(l,h){if(!l)return '';const gE=agrupar(l.itens,'e'),gS=agrupar(l.itens,'s');
 return `<section class="card fxpd"><div class="fxpdh"><div><small>${l.real?'Realizado (extrato)':l.d===h?'Hoje':'Projeção'}</small><h3>${(t=>t[0].toUpperCase()+t.slice(1))(new Date(l.d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'}))}</h3></div><div class="fxnav"><button class="small quiet" data-fx-mover="-1" aria-label="Dia anterior">‹</button><button class="small quiet" data-fx-mover="1" aria-label="Próximo dia">›</button></div></div>
  <div class="fxwf"><div><span>Saldo inicial</span><b>${money(l.ini)}</b></div><div class="in"><span>+ Entradas</span><b>${money(l.e)}</b></div><div class="out"><span>− Saídas</span><b>${money(l.x)}</b></div><div class="tot ${l.saldo<0?'neg':''}"><span>Saldo final</span><b>${money(l.saldo)}</b></div></div>
  ${[['Entradas',gE,'green'],['Saídas',gS,'red']].map(([t,gs,c])=>gs.length?`<h4>${t}</h4>${gs.slice(0,6).map(g=>`<div class="fxbarra"><span>${esc(g.k)}</span><i><b class="${c}" style="width:${(g.v/gs[0].v*100).toFixed(0)}%"></b></i><em>${curto(g.v)}</em></div>`).join('')}`:'').join('')}
  ${!l.itens.length?'<p class="caption">Sem movimento previsto neste dia.</p>':''}
  ${!l.real&&gS.length?`<button class="small" data-nav="pagar" style="margin-top:10px">${icon('wallet')} Abrir contas a pagar</button>`:''}</section>`}
function maiores(fut){const s=fut.flatMap(l=>l.itens.filter(i=>i.lado==='s'&&i.cat!==CAT_S.trib).map(i=>({...i,d:l.d}))).sort((a,b)=>b.v-a.v).slice(0,6);
 return s.length?`<section class="card fxpd"><h3 style="margin:0 0 8px">Maiores saídas do período</h3>${s.map(i=>`<div class="fxit clickrow" data-fx-sel="${i.d}"><span>${esc(i.nome)}<br><small>${dBR2(i.d)} · ${esc(String(i.ref||'').split(' · ')[0])}</small></span><b class="red">${money(i.v)}</b></div>`).join('')}</section>`:''}
function calendario(L,h){const por=new Map(L.map(l=>[l.d,l])),meses=[...new Set(L.map(l=>l.d.slice(0,7)))],mx=Math.max(1,...L.map(l=>Math.abs(l.saldo)));
 return meses.map(m=>{const [y,mm]=m.split('-').map(Number),pri=new Date(y,mm-1,1),n=new Date(y,mm,0).getDate(),off=(pri.getDay()+6)%7;
  return `<section class="card fxcal"><h2>${pri.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h2><div class="fxcalg">${['seg','ter','qua','qui','sex','sáb','dom'].map(d=>`<b>${d}</b>`).join('')}${'<span></span>'.repeat(off)}
  ${[...Array(n)].map((_,i)=>{const d=`${m}-${String(i+1).padStart(2,'0')}`,l=por.get(d);if(!l)return `<span class="fxc vazio"><i>${i+1}</i></span>`;const t=Math.min(1,Math.abs(l.saldo)/mx);
   return `<button class="fxc ${l.real?'real':''} ${d===h?'hoje':''} ${l.saldo<0?'neg':''} ${ui.sel===d?'sel':''}" style="--t:${t.toFixed(2)}" data-fx-sel="${d}"><i>${i+1}</i><strong>${curto(l.saldo)}</strong>${l.e?`<small class="green">+${curto(l.e)}</small>`:''}${l.x?`<small class="red">−${curto(l.x)}</small>`:''}</button>`}).join('')}</div></section>`}).join('')}
// Gráfico desenhado na largura real do cartão (nítido), com eixo em R$, dica que segue o mouse e clique no dia.
function desenharGrafico(){const box=$('#fxSvg'),fx=ui._fx;if(!box||!fx)return;const L=fx.L,h=fx.h,W=Math.max(320,box.clientWidth),H=W<600?230:300,pl=W<600?46:64,pr=14,pt=16,pb=28,cw=W-pl-pr,ch=H-pt-pb;
 const sal=L.map(l=>l.saldo),vmax=Math.max(...sal,...L.map(l=>l.e),0),vmin=Math.min(0,...sal,...L.map(l=>-l.x));const passo=nice((vmax-vmin)/4),top=Math.ceil(vmax/passo)*passo,bot=Math.floor(vmin/passo)*passo;
 const Y=v=>pt+(top-v)/(top-bot||1)*ch,bw=cw/L.length,X=i=>pl+i*bw+bw/2,y0=Y(0),iH=L.findIndex(l=>l.d===h);
 const ticks=[];for(let v=bot;v<=top+1e-6;v+=passo)ticks.push(v);
 const pts=L.map((l,i)=>[X(i),Y(l.saldo)]),path=a=>a.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join('');
 const real=pts.slice(0,iH+1),proj=pts.slice(Math.max(0,iH));
 const area=path(pts)+`L${pts[pts.length-1][0].toFixed(1)} ${y0.toFixed(1)}L${pts[0][0].toFixed(1)} ${y0.toFixed(1)}Z`;
 const cada=Math.ceil(L.length/(W<600?5:10));
 box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Saldo diário">
  <defs><linearGradient id="fxA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient>
  <clipPath id="fxNeg"><rect x="${pl}" y="${y0}" width="${cw}" height="${Math.max(0,pt+ch-y0)}"/></clipPath></defs>
  ${L.map((l,i)=>[0,6].includes(new Date(l.d+'T12:00:00').getDay())?`<rect x="${pl+i*bw}" y="${pt}" width="${bw}" height="${ch}" class="fxfds"/>`:'').join('')}
  ${iH>0?`<rect x="${pl}" y="${pt}" width="${iH*bw}" height="${ch}" class="fxpass"/>`:''}
  ${ticks.map(v=>`<line x1="${pl}" x2="${W-pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="${Math.abs(v)<1e-6?'fxzero':'fxgl'}"/><text x="${pl-8}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end" class="fxax">${curto(v)}</text>`).join('')}
  ${L.map((l,i)=>{const w=Math.max(2,Math.min(14,bw*.34));return (l.e?`<rect x="${(X(i)-w-1).toFixed(1)}" y="${Y(l.e).toFixed(1)}" width="${w.toFixed(1)}" height="${(y0-Y(l.e)).toFixed(1)}" rx="2" class="fxbe ${l.real?'':'proj'}"/>`:'')+(l.x?`<rect x="${(X(i)+1).toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(-l.x)-y0).toFixed(1)}" rx="2" class="fxbs ${l.real?'':'proj'}"/>`:'')}).join('')}
  <path d="${area}" fill="url(#fxA)"/><path d="${area}" class="fxnegarea" clip-path="url(#fxNeg)"/>
  ${real.length>1?`<path d="${path(real)}" class="fxl"/>`:''}<path d="${path(proj)}" class="fxl proj"/>
  ${iH>=0?`<line x1="${X(iH)}" x2="${X(iH)}" y1="${pt}" y2="${pt+ch}" class="fxhoje"/><text x="${X(iH)+5}" y="${pt+11}" class="fxax fxhl">hoje</text>`:''}
  ${L.map((l,i)=>(i%cada===0&&Math.abs(i-iH)>cada/2)||i===iH?`<text x="${X(i)}" y="${H-8}" text-anchor="middle" class="fxax ${i===iH?'fxhl':''}">${dBR2(l.d)}</text>`:'').join('')}
  <line id="fxCur" class="fxcur" y1="${pt}" y2="${pt+ch}" x1="-10" x2="-10"/><circle id="fxPt" r="5" class="fxpt" cx="-10" cy="-10"/>
  ${L.map((l,i)=>l.d===ui.sel?`<circle cx="${X(i)}" cy="${Y(l.saldo)}" r="6" class="fxselpt"/>`:'').join('')}
  <rect x="${pl}" y="${pt}" width="${cw}" height="${ch}" fill="transparent" id="fxHit" style="cursor:pointer"/></svg>`;
 const hit=$('#fxHit'),tip=$('#fxTip'),cur=$('#fxCur'),pt2=$('#fxPt');const idxDe=e=>{const r=box.querySelector('svg').getBoundingClientRect();return Math.max(0,Math.min(L.length-1,Math.floor((e.clientX-r.left-pl)/bw)))};
 hit.onmousemove=e=>{const i=idxDe(e),l=L[i];cur.setAttribute('x1',X(i));cur.setAttribute('x2',X(i));pt2.setAttribute('cx',X(i));pt2.setAttribute('cy',Y(l.saldo));
  tip.hidden=false;tip.innerHTML=`<b>${new Date(l.d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'})}</b><span class="caption">${l.real?'realizado':'projeção'}</span><div><i class="le"></i>Entradas <b>${money(l.e)}</b></div><div><i class="ls"></i>Saídas <b>${money(l.x)}</b></div><div class="${l.saldo<0?'red':''}"><i class="ll"></i>Saldo <b>${money(l.saldo)}</b></div>`;
  const bx=box.getBoundingClientRect(),x=X(i)+(X(i)>W*.65?-tip.offsetWidth-14:14);tip.style.left=x+'px';tip.style.top=Math.max(4,Y(l.saldo)-40)+'px'};
 hit.onmouseleave=()=>{tip.hidden=true;cur.setAttribute('x1',-10);cur.setAttribute('x2',-10);pt2.setAttribute('cx',-10)};
 hit.onclick=e=>{ui.sel=L[idxDe(e)].d;render()}}
function nice(v){if(!(v>0))return 1;const e=Math.pow(10,Math.floor(Math.log10(v))),f=v/e;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e}
function csvDiario(){const fx=ui._fx;if(!fx)return;const linhas=[['data','tipo','saldo_inicial','entradas','saidas','saldo_final']].concat(fx.L.map(l=>[l.d,l.real?'realizado':'projecao',l.ini.toFixed(2),l.e.toFixed(2),l.x.toFixed(2),l.saldo.toFixed(2)].map(v=>String(v).replace('.',','))));
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+linhas.map(l=>l.join(';')).join('\n')],{type:'text/csv'}));a.download=`fluxo-diario-${fx.h}.csv`;a.click()}
function view(){return `<div class="crmbar"><div class="segtabs">${[['diario','Diário'],['realizado','Realizado (extrato)'],['projetado','Projetado (12 semanas)']].map(([a,t])=>`<button class="${ui.aba===a?'active':''}" data-fx-aba="${a}">${t}</button>`).join('')}</div></div>${ui.aba==='diario'?diario():ui.aba==='realizado'?realizado():projetado()}`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-fx-aba],[data-fx-grupo],[data-fx-dias],[data-fx-visao],[data-fx-sel],[data-fx-mover],[data-fx-csv],[data-fx-cen],[data-fx-cenlimpar]');if(!b)return;const d=b.dataset;if(d.fxDias){ui.dias=Number(d.fxDias);render();return}if(d.fxVisao){ui.visao=d.fxVisao;render();return}if(d.fxSel){ui.sel=ui.sel===d.fxSel&&b.classList.contains('fxdia')?null:d.fxSel;render();return}if(d.fxMover){const L=ui._fx?.L||[],i=L.findIndex(l=>l.d===ui.sel);const n=L[Math.max(0,Math.min(L.length-1,i+Number(d.fxMover)))];if(n){ui.sel=n.d;render()}return}if(d.fxCsv){csvDiario();return}if(d.fxCen){ui.cenOn=!ui.cenOn;render();return}if(d.fxCenlimpar){ui.cen={atraso:{},vendas:0,adiar:0,antecipar:false,taxa:2.5};render();return}if(b.dataset.fxAba){ui.aba=b.dataset.fxAba;render()}if(b.dataset.fxGrupo){const g=b.dataset.fxGrupo;ui.abertos.has(g)?ui.abertos.delete(g):ui.abertos.add(g);render()}});
let fxRes=null;addEventListener('resize',()=>{clearTimeout(fxRes);fxRes=setTimeout(()=>{if(page==='fluxo'&&ui.aba==='diario')desenharGrafico()},150)});
document.addEventListener('change',e=>{const x=e.target.closest('[data-fx-c]');if(!x)return;const k=x.dataset.fxC,v=x.type==='checkbox'?x.checked:x.type==='number'||x.type==='range'?Number(x.value):x.value;if(k.startsWith('atraso.'))ui.cen.atraso={...ui.cen.atraso,[k.slice(7)]:Number(v)};else ui.cen[k]=v;render()});
document.addEventListener('input',e=>{const x=e.target.closest('input[type=range][data-fx-c]');if(x){const s=x.parentElement.querySelector('.fxval');if(s)s.textContent=(x.value>0?'+':'')+x.value+'%'}});
function bind(){if(ui.aba==='diario')desenharGrafico();const f=$('#fxFut');if(f)f.onchange=()=>{ui.futuras=f.checked;render()};const s=$('[data-fx-meses]');if(s)s.onchange=()=>{ui.meses=Number(s.value);render()}}
window.Fluxo={prazos};
addPage('fluxo','cash','Fluxo de caixa',view,'Saldo dia a dia (extrato real + projeção), realizado mês a mês e projeção de 12 semanas: de onde vem e para onde vai o dinheiro.','',bind);
if(navItems.filter(n=>n[0]==='fluxo').length>1)navItems.splice(navItems.map(n=>n[0]).lastIndexOf('fluxo'),1);
})();
