'use strict';
// Planejador de datas comerciais (brinquedos): Dia das Crianças, Black Friday e Natal. Para cada data,
// estima a demanda do período de pico (ritmo atual × fator de pico, ajustável), compara com o saldo e com o
// prazo de reposição e mostra o que falta, quanto custa e a DATA LIMITE para pedir ao fornecedor.
(()=>{
Object.assign(paths,{calendar:paths.calendar||'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4'});
const ano=()=>new Date().getFullYear();
function blackFriday(y){const d=new Date(y,10,30);while(d.getDay()!==5)d.setDate(d.getDate()-1);return d}
const EVENTOS=()=>{const y=ano(),alvo=(d,y2=y)=>{const x=new Date(d);if(x<new Date())x.setFullYear(y2+1);return x};
 return [{id:'criancas',nome:'Dia das Crianças',data:alvo(new Date(y,9,12)),pico:21,fator:2.5,dica:'Pico nas 3 semanas antes; brinquedos de maior valor (elétricos) concentram a receita.'},
  {id:'blackfriday',nome:'Black Friday',data:alvo(blackFriday(y)),pico:10,fator:2.2,dica:'Semana da Black Friday; preço e frete decidem — confira margem no Radar antes de dar desconto.'},
  {id:'natal',nome:'Natal',data:alvo(new Date(y,11,25)),pico:30,fator:2.8,dica:'Dezembro inteiro; o prazo de entrega dos marketplaces fecha por volta de 18/12.'}]};
const cfg=()=>db.gerencial?.sazonal||{};
const ui={ev:'criancas'};
const dBR=d=>d.toLocaleDateString('pt-BR');
const nf=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
function plano(ev){const lista=window.Estoque?.lista?.()||[];if(!lista.length)return null;const h=new Date(),c={...ev,...(cfg()[ev.id]||{})};
 const ini=new Date(c.data);ini.setDate(ini.getDate()-c.pico);const diasAte=Math.max(0,Math.round((ini-h)/864e5));
 // Pico em andamento: conta só os dias que faltam até a data.
 const diasPico=Math.max(0,Math.min(c.pico,Math.round((c.data-h)/864e5))),emAndamento=ini<h;
 const d30=new Date(Date.now()-30*864e5).toLocaleDateString('sv-SE'),vend=new Map();for(const o of db.orders){if(o.date<d30)continue;for(const it of o.items||[]){const s=String(it.sku||'').trim();vend.set(s,(vend.get(s)||0)+(Number(it.qty)||0))}}
 const linhas=lista.filter(p=>!p.ignorar&&vend.get(p.id)).map(p=>{const ritmo=vend.get(p.id)/30,prazo=Number(p.prazo_reposicao)||20,saldo=Math.max(0,Number(p.saldo)||0);
  // Até o pico vende no ritmo normal; no pico, ritmo × fator.
  const antes=ritmo*diasAte,pico=ritmo*c.fator*diasPico,precisa=Math.ceil(antes+pico),falta=Math.max(0,precisa-saldo);
  const limite=new Date(ini);limite.setDate(limite.getDate()-prazo);const cobertura=ritmo?saldo/ritmo:Infinity;
  return {p,ritmo,prazo,saldo,precisa,falta,custo:falta*(Number(p.custo)||0),receita:(antes+pico)*(Number(p.preco)||0),limite,atrasado:falta>0&&limite<h,acabaAntes:cobertura<diasAte}}).sort((a,b)=>(b.atrasado-a.atrasado)||b.custo-a.custo);
 return {c,ini,diasAte,linhas,emAndamento,diasPico}}
function view(){const evs=EVENTOS(),ev=evs.find(e=>e.id===ui.ev)||evs[0],r=plano(ev);
 if(!r){window.Estoque?.carregar?.();return '<div class="empty">Carregando produtos do estoque…</div>'}
 const {c,ini,diasAte,linhas,emAndamento,diasPico}=r,falta=linhas.filter(l=>l.falta>0),atras=falta.filter(l=>l.atrasado),invest=falta.reduce((s,l)=>s+l.custo,0),receita=linhas.reduce((s,l)=>s+l.receita,0);
 const dias=Math.round((c.data-new Date())/864e5);
 return `<div class="evtabs">${evs.map(e=>{const d=Math.round((e.data-new Date())/864e5);return `<button class="card evcard ${ui.ev===e.id?'on':''}" data-sz-ev="${e.id}"><small>${dBR(e.data)}</small><strong>${e.nome}</strong><span class="${d<=30?'gold':''}">faltam ${d} dias</span></button>`}).join('')}</div>
 <div class="notice">${c.dica} Pico considerado: ${c.pico} dias antes da data (a partir de ${dBR(ini)}), vendendo ${String(c.fator).replace('.',',')}× o ritmo dos últimos 30 dias. <label class="caption">Fator <input data-sz="fator" value="${c.fator}" style="width:56px"></label> <label class="caption">Dias de pico <input data-sz="pico" value="${c.pico}" style="width:56px"></label></div>
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Faltam</span><span class="kpiv ${dias<=30?'gold':''}">${dias} dias</span><span class="kpis">${emAndamento?`<span class="gold">pico em andamento · ${diasPico} dias de pico pela frente</span>`:`${diasAte} até começar o pico`}</span></div><div class="card kpi"><span class="kpil">Produtos a reforçar</span><span class="kpiv">${falta.length}</span><span class="kpis">${emAndamento?'reposição urgente — só chega a tempo se o fornecedor entregar antes da data':atras.length?`<span class="red">${atras.length} já passaram da data limite de pedido</span>`:'todos ainda dentro do prazo'}</span></div><div class="card kpi"><span class="kpil">Compra necessária</span><span class="kpiv">${money(invest)}</span><span class="kpis">a custo · giro normal até o pico + o pico</span></div><div class="card kpi"><span class="kpil">Receita potencial até a data</span><span class="kpiv green">${money(receita)}</span><span class="kpis">se não faltar produto</span></div></div>
 <div class="tablebox"><div class="tabletop"><div><h2>Plano de estoque · ${c.nome}</h2><p class="caption">Data limite = início do pico − prazo de reposição do produto. Em vermelho: já passou — negocie entrega urgente ou priorize outro item.</p></div>${falta.length?`<button class="small primary" data-sz-pc="1">${icon('plus')} Criar pedidos de compra</button>`:''}</div><div class="tablewrap"><table><thead><tr><th>Produto</th><th class="num">Ritmo/dia</th><th class="num">Saldo</th><th class="num">Precisa até a data</th><th class="num">Comprar</th><th>Pedir até</th><th class="num">Investimento</th></tr></thead><tbody>
 ${linhas.slice(0,200).map(l=>`<tr><td class="comfoto">${window.Estoque?.foto?.(l.p.id)||''}<strong>${esc(l.p.nome)}</strong><br><span class="caption mono">${esc(l.p.id)}</span>${l.acabaAntes?' <span class="badge bad">acaba antes do pico</span>':''}</td><td class="num">${String(l.ritmo.toFixed(1)).replace('.',',')}</td><td class="num">${nf(l.saldo)}</td><td class="num">${nf(l.precisa)}</td><td class="num">${l.falta?`<strong>${nf(l.falta)}</strong>`:'<span class="green">ok</span>'}</td><td>${l.falta?(emAndamento?'<span class="badge bad">urgente</span>':`<span class="badge ${l.atrasado?'bad':'warn'}">${dBR(l.limite)}</span>`):'—'}</td><td class="num">${l.falta?money(l.custo):'—'}</td></tr>`).join('')}</tbody></table></div></div>`}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-sz-ev],[data-sz-pc]');if(!b)return;if(b.dataset.szEv){ui.ev=b.dataset.szEv;render();return}
 const ev=EVENTOS().find(x=>x.id===ui.ev),r=plano(ev),falta=r.linhas.filter(l=>l.falta>0),por=new Map();for(const l of falta){const f=l.p.fornecedor||'Sem fornecedor definido';(por.get(f)||por.set(f,[]).get(f)).push({sku:l.p.id,nome:l.p.nome,qtd:l.falta,custo:Math.round((Number(l.p.custo)||0)*100)/100,recebido:0})}
 if(!confirm(`Criar ${por.size} pedido(s) de compra em rascunho para o ${ev.nome}?`))return;
 for(const [f,itens] of por){const tmp=document.createElement('button');tmp.dataset.estGerarpc=JSON.stringify(itens);tmp.dataset.forn=f;document.body.appendChild(tmp);tmp.click();tmp.remove();await new Promise(x=>setTimeout(x,400))}});
document.addEventListener('change',e=>{const i=e.target.closest('[data-sz]');if(!i)return;const v=Number(String(i.value).replace(',','.'))||0;db.gerencial={...(db.gerencial||{}),sazonal:{...cfg(),[ui.ev]:{...(cfg()[ui.ev]||{}),[i.dataset.sz]:v}}};save();render()});
addPage('sazonal','calendar','Datas comerciais',view,'Dia das Crianças, Black Friday e Natal: o que comprar, quanto investir e até quando pedir para não faltar produto no pico.','',()=>{});
})();
