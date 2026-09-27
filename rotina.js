'use strict';
// Rotina do dia por papel (dono, financeiro, contador, atendimento, estoque): o que fazer ao entrar, com checagem
// automática do que já está resolvido e "marcar como feito" para o que depende de ação fora do sistema.
// Tour de boas-vindas na primeira visita (e sob demanda).
(()=>{
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const addDias=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toLocaleDateString('sv-SE')};
const ler=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??d}catch{return d}};
const gravar=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const ico=(n,s=18)=>icon(n).replace('class="icon"',`class="icon" style="width:${s}px;height:${s}px"`);
const papel=()=>window.Cloud?.role||'owner';
const NOMES={owner:'Dono',member:'Gestão',financeiro:'Financeiro',contador:'Contabilidade',atendimento:'Atendimento',estoque:'Estoque'};
const seguro=(f,d)=>{try{return f()}catch{return d}};
// [id, papéis, título, por que, tela, checagem → {ok, info}]
const PASSOS=[
 ['atend',['owner','member','atendimento'],'Responder os atendimentos','Cliente respondido rápido evita reclamação e mediação.','atendimento',()=>{const n=window.Atendimento?.abertos?.()||0;return {ok:!n,info:n?`${n} em aberto`:'nenhum em aberto'}}],
 ['notas',['owner','member','atendimento','estoque'],'Faturar pedidos sem nota','Pedido sem nota não pode ser postado.','faturamento',()=>{const n=db.orders.filter(o=>!o.nf&&o.date>=addDias(hoje(),-14)&&o.date<hoje()).length;return {ok:!n,info:n?`${n} pedido(s) sem nota`:'todos com nota'}}],
 ['separar',['owner','member','estoque'],'Separar os pedidos do dia','Lista por localização, pronta para imprimir.','separacao',null],
 ['ruptura',['owner','member','estoque'],'Repor produtos em falta','Produto sem saldo e vendendo é venda perdida todo dia.','estcompras',()=>{const a=(window.Estoque?.avisos?.()||[]).filter(x=>/ruptura/i.test(x[2]));return {ok:!a.length,info:a.length?a[0][2]:'sem rupturas'}}],
 ['pagar',['owner','member','financeiro'],'Pagar as contas de hoje','Evita juros e protesto.','pagar',()=>{const h=hoje(),ab=seguro(()=>ERP.abertos(),[]),v=ab.filter(t=>t.vencimento<=h);return {ok:!v.length,info:v.length?`${v.length} título(s) até hoje`:'nada vencendo'}}],
 ['extrato',['owner','member','financeiro'],'Conciliar o extrato bancário','Cada movimento do banco ligado ao que ele é — base do caixa e da contabilidade.','concbanco',()=>{const n=(db.bankTx||[]).filter(t=>t.status==='pendente').length;return {ok:!n,info:n?`${n} movimento(s) a conciliar`:'tudo conciliado'}}],
 ['repasses',['owner','member','financeiro'],'Cobrar repasses atrasados','Venda que o marketplace ainda não pagou.','pending',()=>{const h=hoje(),n=db.orders.filter(o=>o.due&&o.due<h&&seguro(()=>status(o),'')==='A receber').length;return {ok:!n,info:n?`${n} repasse(s) atrasado(s)`:'em dia'}}],
 ['contab',['owner','contador'],'Fechar a contabilidade do mês anterior','Checklist, tributos e lote para o escritório.','fechcontab',()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);const m=d.toLocaleDateString('sv-SE').slice(0,7),f=db.gerencial?.contabil?.fechados?.[m];return {ok:!!f,info:f?'fechado':`${m.slice(5)}/${m.slice(0,4)} a fechar`}}],
 ['fiscal',['contador'],'Revisar a parametrização fiscal','Regras de ICMS, DIFAL, PIS/COFINS e natureza das notas.','parametros',null],
 ['vendas',['owner','member'],'Olhar as vendas e a margem','Canais, projeção do mês e produtos com prejuízo.','dashboard',null]];
const chaveDia=()=>'eb_rotina_'+hoje();
function passos(){const p=papel(),feitos=ler(chaveDia(),{});return PASSOS.filter(x=>x[1].includes(p)).map(([id,,t,por,nav,chk])=>{const c=chk?seguro(chk,{ok:false,info:''}):{ok:!!feitos[id],info:feitos[id]?'feito hoje':'marque quando concluir'};return {id,t,por,nav,ok:c.ok||!!feitos[id],info:c.info,manual:!chk}})}
function html(){const l=passos();if(!l.length)return '';const ok=l.filter(x=>x.ok).length,pct=Math.round(ok/l.length*100),R=26,C=2*Math.PI*R;
 return `<section class="rt" id="rotina"><div class="rt-head"><svg viewBox="0 0 64 64" class="rt-ring"><circle cx="32" cy="32" r="${R}" class="rt-tr"/><circle cx="32" cy="32" r="${R}" class="rt-val" stroke-dasharray="${C*pct/100} ${C}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle">${ok}/${l.length}</text></svg>
  <div><h2>Sua rotina de hoje</h2><p class="caption">Perfil ${NOMES[papel()]||papel()} · ${ok===l.length?'tudo feito — excelente!':'siga na ordem; o que já está resolvido se marca sozinho'}</p></div><button class="small quiet" data-rt="tour">${ico('spark',15)} Tour</button></div>
 <div class="rt-list">${l.map((x,i)=>`<div class="rt-step ${x.ok?'ok':''}"><span class="rt-n">${x.ok?ico('check',15):i+1}</span><button class="rt-body" data-nav="${x.nav}"><strong>${x.t}</strong><small>${x.por}</small><em>${esc(x.info||'')}</em></button>${x.manual?`<button class="small quiet" data-rt="feito" data-id="${x.id}">${x.ok?'desfazer':'feito'}</button>`:`<button class="small" data-nav="${x.nav}">${x.ok?'ver':'fazer'} →</button>`}</div>`).join('')}</div></section>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-rt]');if(!b)return;if(b.dataset.rt==='tour'){tour(0);return}
 if(b.dataset.rt==='feito'){const f=ler(chaveDia(),{});f[b.dataset.id]=!f[b.dataset.id];gravar(chaveDia(),f);render()}});

// ─────────── Tour ───────────
const TOUR=[['.hj-ask','Pergunte qualquer coisa','Escreva ou fale (microfone) perguntas como “o que vence esta semana?” ou “quanto vendi hoje?”. A resposta vem na hora, com o botão para a tela certa.'],
 ['#rotina','Sua rotina de hoje','O que fazer ao entrar, conforme o seu perfil. Itens resolvidos se marcam sozinhos.'],
 ['.hj-cards','Cartões vivos','Cada área num cartão: vendas, caixa, contas, estoque, notas, atendimento e contabilidade. Clique para abrir.'],
 ['.erp .side','Menu por área','Vendas, Estoque, Financeiro, CRM, Cadastros, Resultado… Em cada tela, o botão ? explica para que ela serve.'],
 ['.searchbox','Busca e comandos (Ctrl K)','Ache pedido, nota, fornecedor ou tela — e faça perguntas também.'],
 ['.newbtn','Novo','Lançar conta, venda direta, pedido de compra e outros atalhos.'],
 ['[data-nav="mapa"]','Mapa do ERP','Todas as telas e para que serve cada uma, com busca por intenção.']];
// A tela pode ser redesenhada durante o tour (dados chegando): a posição é sempre recalculada pelo elemento atual.
let tourI=-1;
function fechar(){tourI=-1;document.querySelectorAll('.tour-spot,.tour-tip').forEach(x=>x.remove());gravar('eb_tour1',true)}
function posicionar(){if(tourI<0)return;const s=document.querySelector('.tour-spot'),tip=document.querySelector('.tour-tip'),el=document.querySelector(TOUR[tourI][0]);if(!s||!tip||!el)return;
 const r=el.getBoundingClientRect(),pad=8;Object.assign(s.style,{left:r.left-pad+'px',top:r.top-pad+'px',width:r.width+pad*2+'px',height:r.height+pad*2+'px'});
 const tw=Math.min(340,innerWidth-24),below=r.bottom+tip.offsetHeight+24<innerHeight;
 Object.assign(tip.style,{width:tw+'px',left:Math.max(12,Math.min(innerWidth-tw-12,r.left))+'px',top:(below?r.bottom+16:Math.max(12,r.top-tip.offsetHeight-16))+'px'})}
function tour(i){document.querySelectorAll('.tour-spot,.tour-tip').forEach(x=>x.remove());if(i>=TOUR.length){fechar();return}
 const [sel,t,txt]=TOUR[i],el=document.querySelector(sel);if(!el||!el.getBoundingClientRect().width){tour(i+1);return}tourI=i;
 el.scrollIntoView({block:'center'});const s=document.createElement('div');s.className='tour-spot';
 const tip=document.createElement('div');tip.className='tour-tip';tip.innerHTML=`<small>${i+1} de ${TOUR.length}</small><strong>${t}</strong><p>${txt}</p><div class="row"><button class="small quiet" data-tour="fim">Pular</button><button class="small primary" data-tour="prox">${i+1<TOUR.length?'Próximo →':'Começar'}</button></div>`;
 document.body.append(s,tip);posicionar();
 tip.onclick=ev=>{const a=ev.target.closest('[data-tour]');if(!a)return;if(a.dataset.tour==='fim')fechar();else tour(i+1)}}
setInterval(posicionar,300);addEventListener('scroll',posicionar,{passive:true});
// Primeira visita à tela Hoje: abre o tour sozinho.
setInterval(()=>{if(!/notour/.test(location.search)&&page==='central'&&document.querySelector('.hj-ask')&&!ler('eb_tour1',false)&&!document.querySelector('.tour-tip,.modalback')){gravar('eb_tour1',true);tour(0)}},3000);
addEventListener('resize',posicionar);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tourI>=0)fechar()});
window.Rotina={html,passos,tour};
})();
