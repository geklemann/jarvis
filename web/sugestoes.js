'use strict';
// Conciliação com sugestão inteligente e aprovação em lote (Vendas › Conciliação de vendas).
// O motor propõe vínculos que a busca exata não pega e explica o motivo de cada um; NADA é vinculado sem o clique
// do usuário (AGENTS.md, regra 1). Sinais usados, todos de dados que já estão no sistema:
//  • número do pedido informado na liberação ou presente na descrição dela;
//  • valor igual ao saldo do pedido, ou com diferença de centavos (arredondamento do marketplace);
//  • repasse dividido: 2 ou 3 liberações do mesmo pedido que somam o saldo;
//  • data perto da previsão de liberação — e, sem previsão, do prazo que o próprio sistema aprendeu com os vínculos
//    já confirmados (mediana de dias entre a venda e o repasse, por canal).
// Cada liberação só entra numa sugestão; quando dois pedidos disputam a mesma liberação só pelo valor, a sugestão
// é descartada (ambígua) e fica para a revisão manual.
(()=>{
const R2=v=>Math.round(v*100)/100,dias=(a,b)=>Math.abs(new Date(a+'T12:00')-new Date(b+'T12:00'))/864e5;
// Identificador comparável: letras e números, sem pontuação (a Shopee mistura letras e dígitos; o ML é só número).
const ident=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const tokens=s=>String(s||'').toUpperCase().split(/[^A-Z0-9]+/).filter(t=>t.length>=8);
const fechado=d=>!!db.closures?.[String(d).slice(0,7)];

// Prazo típico (dias da venda ao repasse) por canal, aprendido com os vínculos já confirmados.
function aprender(){const por=new Map(),ped=new Map(db.orders.map(o=>[o.id,o]));
 for(const r of db.receipts){if(!r.linkedOrder||!(r.amount>0))continue;const o=ped.get(r.linkedOrder);if(!o)continue;
  const d=(new Date(r.date+'T12:00')-new Date(o.date+'T12:00'))/864e5;if(d<0||d>120)continue;(por.get(o.platform)||por.set(o.platform,[]).get(o.platform)).push(d)}
 const med=l=>{const s=[...l].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};
 return new Map([...por].filter(([,l])=>l.length>=3).map(([p,l])=>[p,{dias:Math.round(med(l)),n:l.length}]))}

// O pedido é citado quando o identificador inteiro aparece: no pedido informado ou como palavra da descrição ou do código da liberação.
function cita(o,r){const id=ident(o.id);if(id.length<8)return false;return ident(r.orderId)===id||tokens(r.description).includes(id)||tokens(r.id).includes(id)}
function previsao(o,prazos){if(o.due&&/^\d{4}-\d{2}-\d{2}/.test(o.due))return {d:o.due.slice(0,10),fonte:'previsão do marketplace'};
 const p=prazos.get(o.platform);if(!p)return null;const d=new Date(o.date+'T12:00');d.setDate(d.getDate()+p.dias);return {d:d.toISOString().slice(0,10),fonte:`prazo aprendido (${p.dias} dias, ${p.n} vínculos)`}}

/** Sugestões para os pedidos em aberto (opcionalmente só de uma competência). Devolve [{o, rs, saldo, soma, dif, conf, motivos}]. */
function sugerir(mes){
 const prazos=aprender();
 const livres=db.receipts.filter(r=>!r.linkedOrder&&r.amount>0&&!fechado(r.date));
 const pedidos=db.orders.filter(o=>(!mes||o.date.startsWith(mes))&&!fechado(o.date)).map(o=>({o,saldo:R2(net(o)-paid(o))})).filter(x=>x.saldo>0.01);
 // Índices (o mês pode ter milhares de pedidos e liberações): por número citado e por valor, separados por canal.
 const porNum=new Map(),porValor=new Map();
 for(const r of livres){const nums=new Set([ident(r.orderId),...tokens(r.description),...tokens(r.id)].filter(x=>x.length>=8));
  for(const k of nums)(porNum.get(k)||porNum.set(k,[]).get(k)).push(r);(porValor.get(r.platform)||porValor.set(r.platform,[]).get(r.platform)).push(r)}
 for(const l of porValor.values())l.sort((a,b)=>a.amount-b.amount);
 const naFaixa=(l,min,max)=>{let lo=0,hi=l.length;while(lo<hi){const m=(lo+hi)>>1;if(l[m].amount<min)lo=m+1;else hi=m}const out=[];for(let i=lo;i<l.length&&l[i].amount<=max;i++)out.push(l[i]);return out};
 const cand=[];
 for(const {o,saldo} of pedidos){const prev=previsao(o,prazos),tol=Math.max(1,saldo*0.01),id=ident(o.id);
  const citam=id.length>=8?(porNum.get(id)||[]).filter(r=>r.platform===o.platform):[];
  const mesmos=[...new Set([...citam,...naFaixa(porValor.get(o.platform)||[],saldo-tol,saldo+tol)])];
  // 1) uma liberação
  for(const r of mesmos){const dif=R2(r.amount-saldo),ad=Math.abs(dif),ci=cita(o,r),perto=prev?dias(r.date,prev.d):null;
   if(r.date<o.date&&!ci)continue;
   let pts=0;const mot=[];
   if(ci){pts+=60;mot.push(r.orderId&&ident(r.orderId)===ident(o.id)?'liberação informa este pedido':'número do pedido na descrição da liberação')}
   if(ad<0.01){pts+=30;mot.push('valor igual ao saldo')}else if(ad<=Math.max(1,saldo*0.01)){pts+=18;mot.push(`diferença de ${money(ad)} (arredondamento)`)}else if(!ci)continue;else mot.push(`diferença de ${money(ad)} — a liberação é deste pedido; a diferença fica como divergência para conferir`);
   if(perto!=null){if(perto<=3){pts+=10;mot.push(`data a ${Math.round(perto)} dia(s) da ${prev.fonte}`)}else if(perto<=10)pts+=5;else if(!ci&&perto>31)continue}
   cand.push({o,rs:[r],saldo,soma:r.amount,dif,pts,ci,motivos:mot})}
  // 2) repasse dividido: 2 ou 3 liberações que citam o pedido e somam o saldo
  const doPedido=mesmos.filter(r=>cita(o,r));
  if(doPedido.length>=2&&doPedido.length<=8){const k=doPedido.length;
   for(let a=0;a<k;a++)for(let b=a+1;b<k;b++){const par=[doPedido[a],doPedido[b]];const s=R2(par[0].amount+par[1].amount);if(Math.abs(s-saldo)<0.01)cand.push({o,rs:par,saldo,soma:s,dif:0,pts:95,ci:true,motivos:['repasse dividido em 2 liberações deste pedido','soma igual ao saldo']});
    for(let c=b+1;c<k;c++){const tri=[...par,doPedido[c]];const s3=R2(tri.reduce((x,r)=>x+r.amount,0));if(Math.abs(s3-saldo)<0.01)cand.push({o,rs:tri,saldo,soma:s3,dif:0,pts:93,ci:true,motivos:['repasse dividido em 3 liberações deste pedido','soma igual ao saldo']})}}}}
 // Confiança: alta = cita o pedido e fecha ao centavo (ou soma dividida); média = cita com diferença pequena, ou valor exato perto da previsão sem disputa.
 cand.sort((x,y)=>y.pts-x.pts);
 const disputa=new Map();for(const c of cand)if(!c.ci)for(const r of c.rs)disputa.set(r.id,(disputa.get(r.id)||0)+1);
 const usadas=new Set(),pedidosOk=new Set(),out=[];
 for(const c of cand){if(pedidosOk.has(c.o.id)||c.rs.some(r=>usadas.has(r.id)))continue;
  if(!c.ci&&c.rs.some(r=>disputa.get(r.id)>1))continue; // ambígua: dois pedidos disputam a liberação só pelo valor
  const conf=c.ci&&Math.abs(c.dif)<0.01?'alta':c.pts>=40?'média':null;if(!conf)continue;
  c.rs.forEach(r=>usadas.add(r.id));pedidosOk.add(c.o.id);out.push({...c,conf})}
 return out}

// ── Tela: lista com seleção e aprovação em lote ──
let ultimas=[];
function tela(){ultimas=sugerir(month);const alta=ultimas.filter(s=>s.conf==='alta').length;
 const linha=(s,i)=>`<tr><td><input type="checkbox" data-sug-i="${i}" ${s.conf==='alta'?'checked':''} aria-label="Aprovar a sugestão do pedido ${esc(s.o.id)}"></td>
  <td><strong>${esc(s.o.id)}</strong><br><span class="caption">${esc(s.o.platform)} · ${esc(s.o.date)}</span></td>
  <td>${s.rs.map(r=>`${esc(r.id)} <span class="caption">· ${esc(r.date)}</span>`).join('<br>')}</td>
  <td class="num">${money(s.saldo)}</td><td class="num">${money(s.soma)}</td><td class="num ${Math.abs(s.dif)>=0.01?'red':''}">${Math.abs(s.dif)>=0.01?money(s.dif):'—'}</td>
  <td><span class="badge ${s.conf==='alta'?'ok':'warn'}">${s.conf==='alta'?'Alta':'Média'}</span></td><td class="caption">${esc(s.motivos.join(' · '))}</td></tr>`;
 const botoes=`<div class="row wrap" style="gap:8px;justify-content:flex-end;margin:10px 0"><button class="small" data-sug-marcar="alta">Marcar só alta</button><button class="small" data-sug-marcar="todas">Marcar todas</button><button class="small" data-sug-marcar="nenhuma">Desmarcar</button><button class="primary small" data-sug-aprovar>${icon('check')} Aprovar selecionadas</button></div>`;
 modal('Sugestões de conciliação',`<div class="notice"><strong>${ultimas.length} sugestão(ões)</strong> para ${esc(mesNome(month))}, ${alta} de alta confiança (já marcadas). Confira o motivo de cada uma; nada é vinculado até você aprovar. Diferença de valor continua aparecendo como divergência no pedido.</div>
  ${ultimas.length?`${botoes}<div class="tablewrap"><table><thead><tr><th></th><th>Pedido</th><th>Liberação</th><th class="num">Saldo do pedido</th><th class="num">Liberação</th><th class="num">Diferença</th><th>Confiança</th><th>Motivo</th></tr></thead><tbody>${ultimas.map(linha).join('')}</tbody></table></div>${botoes}`
  :'<div class="empty">Nenhuma sugestão nova. Os vínculos exatos já entram pela conciliação automática; o restante continua na revisão pedido a pedido.</div>'}`);
 const m=document.querySelector('#overlay .modal');if(m){m.style.maxWidth='min(1180px,96vw)';m.style.width='min(1180px,96vw)'}}
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const mesNome=m=>{const x=/^(\d{4})-(\d{2})$/.exec(m||'');return x?`${MESES[+x[2]-1]} de ${x[1]}`:String(m||'')};

function aprovar(){const sel=[...document.querySelectorAll('[data-sug-i]:checked')].map(c=>ultimas[Number(c.dataset.sugI)]).filter(Boolean);if(!sel.length)return toast('Marque ao menos uma sugestão.');
 let ok=0,pulou=0;
 for(const s of sel){const o=db.orders.find(x=>x.id===s.o.id),rs=s.rs.map(r=>db.receipts.find(x=>x.id===r.id));
  if(!o||rs.some(r=>!r||r.linkedOrder||fechado(r.date))||fechado(o.date)){pulou++;continue}
  for(const r of rs){r.linkedOrder=o.id;db.audit.unshift({id:uid(),time:new Date().toISOString(),action:'Vínculo confirmado (sugestão aprovada em lote)',detail:`${r.id} → ${o.id} · ${money(r.amount)} · ${s.conf} · ${s.motivos.join('; ')}`})}ok++}
 paymentIndex=null;save();closeModal();render();toast(`${ok} vínculo(s) confirmado(s)${pulou?` · ${pulou} pulado(s): liberação já vinculada ou competência fechada`:''}.`)}

document.addEventListener('click',e=>{const b=e.target.closest('[data-sug-abrir],[data-sug-aprovar],[data-sug-marcar]');if(!b)return;e.preventDefault();
 if(b.dataset.sugAbrir!==undefined)return tela();if(b.dataset.sugAprovar!==undefined)return aprovar();
 const m=b.dataset.sugMarcar;document.querySelectorAll('[data-sug-i]').forEach(c=>{const s=ultimas[Number(c.dataset.sugI)];c.checked=m==='todas'||(m==='alta'&&s?.conf==='alta')})});

// Botão na Conciliação de vendas, ao lado de "Buscar correspondências".
// A contagem do botão só é refeita quando mudam o mês, os pedidos ou os vínculos (a tela é redesenhada a cada clique).
let memo={k:'',n:0};
function contar(){let vinc=0;for(const r of db.receipts)if(r.linkedOrder)vinc++;const k=[month,db.orders.length,db.receipts.length,vinc,Object.keys(db.closures||{}).length].join('|');
 if(memo.k!==k){let n=0;try{n=sugerir(month).length}catch{}memo={k,n}}return memo.n}
if(typeof central==='function'){const c0=central;central=function(){const h=c0.apply(this,arguments);const n=contar();
 return h.replace(/(<div class="tabletop"><h2>Pedidos da competência<\/h2>)/,`$1<button class="small primary" data-sug-abrir>${icon('spark')} Sugestões para aprovar${n?` (${n})`:''}</button>`)}}
window.Sugestoes={sugerir,aprender,tela};
})();
