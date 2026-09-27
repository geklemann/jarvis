'use strict';
// Fluxo de caixa de verdade: REALIZADO mês a mês a partir do extrato bancário já classificado (entradas e
// saídas por grupo e categoria, saldo inicial e final batendo com o banco) e PROJETADO para as próximas
// 12 semanas (repasses a receber dos marketplaces × títulos a pagar), com o saldo semana a semana.
(()=>{
const ui={aba:'diario',meses:6,abertos:new Set(),futuras:true,dias:30,passado:14};
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
// Futuro: repasses a receber, vendas futuras pelo ritmo dos últimos 28 dias, títulos a pagar e tributos estimados.
// Atrasados (repasse ou título vencido) entram no dia de hoje.
function eventos(h,dias){const ev=[],fim=somaDias(h,dias-1),pz=prazos(),add=(d,lado,nome,v,ref)=>{if(d<h)d=h;if(d>fim||!(v>0))return;ev.push({d,lado,nome,v,ref})};
 for(const o of db.orders){const st=status(o);if(!['A receber','Em trânsito'].includes(st))continue;const f=round(net(o)-paid(o));if(f<=0)continue;const d=o.due||(pz[o.platform]!=null?somaDias(o.date,pz[o.platform]):'');if(!d||d<somaDias(h,-60))continue;add(d,'e',d<h?o.platform+' (atrasado)':o.platform,f,'Pedido '+(o.external?.bling_numero||o.id))}
 if(ui.futuras){const ini28=somaDias(h,-28),med={};for(const o of db.orders)if(o.date>=ini28&&o.date<h)med[o.platform]=(med[o.platform]||0)+net(o)/28;
  for(let i=0;i<dias;i++){const dv=somaDias(h,i);for(const [p,v] of Object.entries(med)){const dr=somaDias(dv,pz[p]??15);if(dr>=h)add(dr,'e',p+' (vendas futuras)',v,'estimativa pelo ritmo de 28 dias')}}
  const trib=(db.bankTx||[]).filter(t=>t.data>=ini28&&t.data<h&&t.valor<0&&/icms|difal|gnre/i.test(t.vinculo?.categoria||t.categoria||'')).reduce((x,t)=>x-t.valor,0)/28;
  if(trib>0)for(let i=0;i<dias;i++)add(somaDias(h,i),'s','Tributos sobre vendas (estimativa)',trib,'média diária paga em 28 dias')}
 for(const p of db.payables||[]){if(['pago','cancelado'].includes(p.status))continue;const f=round(Math.max(0,p.valor+(p.juros||0)-(p.desconto||0)-(p.valorPago||0)));add(p.vencimento,'s',p.fornecedor||p.descricao||p.categoria||'Título',f,(p.categoria||'')+(p.vencimento<h?' · vencido em '+new Date(p.vencimento+'T12:00:00').toLocaleDateString('pt-BR'):''))}
 return ev}
function diario(){const h=new Date().toLocaleDateString('sv-SE'),contas=(db.bankAccounts||[]).filter(a=>a.tipo!=='aplicacao'&&a.ativo!==false),ids=new Set(contas.map(a=>a.id));
 const txs=(db.bankTx||[]).filter(t=>ids.has(t.contaId)&&t.status!=='ignorado'&&t.origem!=='espelho');
 const saldoAte=d=>contas.reduce((s,a)=>s+Number(a.saldoInicial||0)+txs.filter(t=>t.contaId===a.id&&t.data>(a.dataSaldoInicial||'0000')&&t.data<=d).reduce((x,t)=>x+t.valor,0),0);
 const hojeSaldo=window.Tesouraria?.saldos().contas.filter(c=>c.tipo!=='aplicacao').reduce((s,c)=>s+c.saldo,0)??saldoAte(h),aplic=window.Tesouraria?.saldos().contas.filter(c=>c.tipo==='aplicacao').reduce((s,c)=>s+c.saldo,0)||0;
 const linhas=[];
 // Realizado: últimos dias até ontem, pelo extrato.
 for(let i=ui.passado;i>=1;i--){const d=somaDias(h,-i),m=txs.filter(t=>t.data===d),e=m.filter(t=>t.valor>0).reduce((a,t)=>a+t.valor,0),x=-m.filter(t=>t.valor<0).reduce((a,t)=>a+t.valor,0);
  linhas.push({d,real:true,e,x,saldo:saldoAte(d),itens:m.map(t=>({lado:t.valor>0?'e':'s',nome:t.vinculo?.desc||t.descricao||t.categoria||'Movimento',v:Math.abs(t.valor),ref:(contas.find(a=>a.id===t.contaId)?.nome||'')+(t.vinculo?.categoria||t.categoria?' · '+(t.vinculo?.categoria||t.categoria):'')}))})}
 // Projetado: hoje em diante. O saldo de partida é o saldo atual das contas (já com o que entrou hoje).
 const ev=eventos(h,ui.dias);let saldo=hojeSaldo;
 for(let i=0;i<ui.dias;i++){const d=somaDias(h,i),it=ev.filter(x=>x.d===d),e=it.filter(x=>x.lado==='e').reduce((a,x)=>a+x.v,0),x=it.filter(x=>x.lado==='s').reduce((a,y)=>a+y.v,0);saldo+=e-x;linhas.push({d,real:false,e,x,saldo,itens:it})}
 ui._linhas=linhas;const fut=linhas.filter(l=>!l.real),min=fut.reduce((m,l)=>l.saldo<m.saldo?l:m,fut[0]),neg=fut.find(l=>l.saldo<0),te=fut.reduce((a,l)=>a+l.e,0),ts=fut.reduce((a,l)=>a+l.x,0);
 const dBR=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),sem=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','');
 const top=(it,lado)=>{const g={};for(const x of it.filter(y=>y.lado===lado))g[x.nome]=(g[x.nome]||0)+x.v;return Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([n,v])=>esc(n)+' '+money(v)).join(' · ')};
 return `<div class="row wrap" style="gap:12px;margin:0 0 12px"><div class="segtabs">${[[15,'15 dias'],[30,'30 dias'],[60,'60 dias'],[90,'90 dias']].map(([n,t])=>`<button class="${ui.dias===n?'active':''}" data-fx-dias="${n}">${t}</button>`).join('')}</div>
  <label class="check-l" style="margin:0"><input type="checkbox" class="check" id="fxFut" ${ui.futuras?'checked':''}> Incluir vendas futuras e tributos estimados</label></div>
 <div class="grid kpis4 fxdkpis"><div class="card kpi"><span class="kpil">Saldo hoje (contas correntes)</span><span class="kpiv">${money(hojeSaldo)}</span><span class="kpis">+ ${money(aplic)} em aplicações</span></div>
 <div class="card kpi"><span class="kpil">Entra nos próximos ${ui.dias} dias</span><span class="kpiv green">${money(te)}</span><span class="kpis">repasses${ui.futuras?' + vendas futuras':''}</span></div>
 <div class="card kpi"><span class="kpil">Sai nos próximos ${ui.dias} dias</span><span class="kpiv red">${money(ts)}</span><span class="kpis">títulos a pagar${ui.futuras?' + tributos':''}</span></div>
 <div class="card kpi"><span class="kpil">Menor saldo</span><span class="kpiv ${min.saldo<0?'red':''}">${money(min.saldo)}</span><span class="kpis">${neg?`<span class="red">fica negativo em ${dBR(neg.d)}</span>${aplic>0?' — resgate antes':''}`:`em ${dBR(min.d)} · nunca fica negativo`}</span></div></div>
 <div class="card fxdcard"><div class="cardhead"><div><h2>Saldo dia a dia</h2><p class="caption">Barras: entradas (verde) e saídas (vermelho) de cada dia. Linha: saldo no fim do dia. À esquerda de <strong>hoje</strong> é o extrato real; à direita, a projeção. Clique num dia para ver a composição.</p></div></div>${grafico(linhas,h)}</div>
 <div class="tablebox"><div class="tabletop"><div><h2>Fluxo de caixa diário</h2><p class="caption">Atrasados (repasse não recebido ou título vencido) entram em hoje.</p></div></div><div class="tablewrap"><table class="fxdtable"><thead><tr><th>Dia</th><th class="num">Entradas</th><th>Principais entradas</th><th class="num">Saídas</th><th>Principais saídas</th><th class="num">Saldo do dia</th></tr></thead><tbody>
 ${linhas.map((l,i)=>{const fds=[0,6].includes(new Date(l.d+'T12:00:00').getDay());return `<tr class="clickrow ${l.real?'fxdreal':''} ${l.d===h?'fxdhoje':''} ${fds?'fxdfds':''} ${l.saldo<0?'fxdneg':''}" data-fx-dia="${i}"><td><strong>${dBR(l.d)}</strong> <span class="caption">${sem(l.d)}${l.d===h?' · hoje':l.real?' · real':''}</span></td><td class="num green">${k(l.e)}</td><td class="caption">${top(l.itens,'e')}</td><td class="num red">${k(l.x?-l.x:0)}</td><td class="caption">${top(l.itens,'s')}</td><td class="num"><strong class="${l.saldo<0?'red':''}">${money(l.saldo)}</strong></td></tr>`}).join('')}</tbody></table></div></div>`}
function grafico(l,h){const W=Math.max(640,l.length*22),H=260,pt=26,pb=34,ch=H-pt-pb,maxB=Math.max(1,...l.map(x=>Math.max(x.e,x.x))),sal=l.map(x=>x.saldo),smin=Math.min(0,...sal),smax=Math.max(1,...sal),bw=W/l.length;
 const yS=v=>pt+(smax-v)/(smax-smin||1)*ch,mid=pt+ch/2,yB=v=>v/maxB*(ch/2-4),iH=l.findIndex(x=>x.d===h),iMin=l.reduce((m,x,i)=>!x.real&&(m<0||x.saldo<l[m].saldo)?i:m,-1);
 const curta=v=>Math.abs(v)>=1e6?(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi':Math.abs(v)>=1e3?(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil':Math.round(v).toLocaleString('pt-BR');
 const rot=(i,txt,cls)=>{const x=i*bw+bw/2,y=yS(l[i].saldo);return `<g class="${cls}"><circle cx="${x}" cy="${y}" r="4"/><text x="${Math.min(W-40,Math.max(40,x))}" y="${Math.max(14,y-10)}" text-anchor="middle">${txt}</text></g>`};
 return `<div class="fxdgraf"><svg viewBox="0 0 ${W} ${H}" style="min-width:${W}px" role="img" aria-label="Saldo diário">
 ${smin<0?`<line x1="0" x2="${W}" y1="${yS(0)}" y2="${yS(0)}" class="fxdzero"/>`:''}
 ${iH>=0?`<rect x="0" y="${pt-8}" width="${iH*bw}" height="${ch+8}" class="fxdpassado"/><line x1="${iH*bw}" x2="${iH*bw}" y1="${pt-8}" y2="${H-pb}" class="fxdhojel"/>`:''}
 ${l.map((x,i)=>`<g data-fx-dia="${i}" class="fxdcol"><rect x="${i*bw}" y="${pt}" width="${bw}" height="${ch}" fill="transparent"/>${x.e?`<rect x="${i*bw+bw*.18}" y="${mid-yB(x.e)}" width="${bw*.64}" height="${yB(x.e)}" rx="2" class="fxdent"/>`:''}${x.x?`<rect x="${i*bw+bw*.18}" y="${mid}" width="${bw*.64}" height="${yB(x.x)}" rx="2" class="fxdsai"/>`:''}<title>${new Date(x.d+'T12:00:00').toLocaleDateString('pt-BR')}: entra ${money(x.e)} · sai ${money(x.x)} · saldo ${money(x.saldo)}</title></g>`).join('')}
 <polyline points="${l.map((x,i)=>`${i*bw+bw/2},${yS(x.saldo)}`).join(' ')}" class="fxdlinha"/>
 ${iH>=0?rot(iH,'hoje '+curta(l[iH].saldo),'fxdmarca'):''}${iMin>=0&&iMin!==iH&&iMin!==l.length-1?rot(iMin,'mín. '+curta(l[iMin].saldo),'fxdmarca '+(l[iMin].saldo<0?'neg':'')):''}${rot(l.length-1,curta(l[l.length-1].saldo),'fxdmarca')}
 ${l.map((x,i)=>i%Math.ceil(l.length/15)===0?`<text x="${i*bw+bw/2}" y="${H-12}" text-anchor="middle" class="fxdlbl">${new Date(x.d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>`:'').join('')}</svg></div>`}
function compDia(i){const l=ui._linhas?.[+i];if(!l)return;const lista=lado=>l.itens.filter(x=>x.lado===lado).sort((a,b)=>b.v-a.v);
 const tab=(t,lado,cls)=>{const it=lista(lado);return `<h3 style="margin:14px 0 6px">${t} <span class="${cls}">${money(it.reduce((a,x)=>a+x.v,0))}</span></h3>${it.length?`<div class="tablewrap" style="max-height:240px"><table><tbody>${it.slice(0,200).map(x=>`<tr><td>${esc(x.nome)}<br><span class="caption">${esc(x.ref||'')}</span></td><td class="num ${cls}">${money(x.v)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="caption">Nada neste dia.</p>'}`};
 modal(new Date(l.d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'}),`<p><span class="badge ${l.real?'ok':'info'}">${l.real?'Realizado (extrato)':'Projetado'}</span> Saldo no fim do dia: <strong class="${l.saldo<0?'red':''}">${money(l.saldo)}</strong></p>${tab('Entradas','e','green')}${tab('Saídas','s','red')}<div class="modalfoot"><button class="primary" data-action="close">Fechar</button></div>`)}
function view(){return `<div class="crmbar"><div class="segtabs">${[['diario','Diário'],['realizado','Realizado (extrato)'],['projetado','Projetado (12 semanas)']].map(([a,t])=>`<button class="${ui.aba===a?'active':''}" data-fx-aba="${a}">${t}</button>`).join('')}</div></div>${ui.aba==='diario'?diario():ui.aba==='realizado'?realizado():projetado()}`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-fx-aba],[data-fx-grupo],[data-fx-dias],[data-fx-dia]');if(!b)return;if(b.dataset.fxDias){ui.dias=Number(b.dataset.fxDias);render();return}if(b.dataset.fxDia!==undefined){compDia(b.dataset.fxDia);return}if(b.dataset.fxAba){ui.aba=b.dataset.fxAba;render()}if(b.dataset.fxGrupo){const g=b.dataset.fxGrupo;ui.abertos.has(g)?ui.abertos.delete(g):ui.abertos.add(g);render()}});
function bind(){const f=$('#fxFut');if(f)f.onchange=()=>{ui.futuras=f.checked;render()};const s=$('[data-fx-meses]');if(s)s.onchange=()=>{ui.meses=Number(s.value);render()}}
window.Fluxo={prazos};
addPage('fluxo','cash','Fluxo de caixa',view,'Saldo dia a dia (extrato real + projeção), realizado mês a mês e projeção de 12 semanas: de onde vem e para onde vai o dinheiro.','',bind);
if(navItems.filter(n=>n[0]==='fluxo').length>1)navItems.splice(navItems.map(n=>n[0]).lastIndexOf('fluxo'),1);
})();
