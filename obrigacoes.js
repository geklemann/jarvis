'use strict';
// Obrigações acessórias e guias do mês: agenda com prazo, o que o Jarvis já tem calculado para cada uma,
// marcação de entregue/pago (quem e quando) e pacote do mês para a contabilidade. A lista e os prazos são uma
// SUGESTÃO para empresa do Lucro Presumido, comércio, em SC — a contabilidade confirma e ajusta aqui mesmo.
(()=>{
const ui={ed:false};
// [id, nome, o que é, periodicidade, regra de prazo, responsável padrão, dados do Jarvis]
// regra: {dia:N,m:meses depois} | {util:N,m} (N-ésimo dia útil) | {ultimoUtil:true,m} | {texto}
const PADRAO=[
 ['icms','ICMS próprio · DARE-SC','Imposto estadual das vendas internas e interestaduais, menos os créditos das compras.','mensal',{dia:10,m:1},'Financeiro (paga) / Escoben (apura)','icms'],
 ['difal','ICMS DIFAL · GNRE por UF','Diferença de alíquota para consumidor final de outro estado (por nota, ou mensal na UF em que houver inscrição).','mensal',{texto:'por nota (GNRE) ou mensal se inscrito na UF'},'Financeiro','difal'],
 ['piscofins','PIS e COFINS · DARF 8109 / 2172','Contribuições cumulativas sobre a receita (Lucro Presumido).','mensal',{dia:25,m:1,antecipa:true},'Financeiro (paga) / Escoben (apura)','piscofins'],
 ['irpjcsll','IRPJ e CSLL · DARF 2089 / 2372','Imposto de renda e contribuição social do trimestre (presunção de 8% e 12%).','trimestral',{ultimoUtil:true,m:1},'Financeiro / Escoben','irpjcsll'],
 ['efdicms','EFD ICMS/IPI (SPED Fiscal)','Escrituração das notas de entrada e saída e da apuração do ICMS.','mensal',{dia:25,m:1},'Escoben','notas'],
 ['efdcontrib','EFD-Contribuições','Escrituração do PIS e da COFINS.','mensal',{util:10,m:2},'Escoben','piscofins'],
 ['dctfweb','DCTFWeb','Declaração dos débitos federais (contribuições e tributos).','mensal',{dia:15,m:1},'Escoben',null],
 ['reinf','EFD-Reinf','Retenções e informações fiscais (serviços tomados, etc.).','mensal',{dia:15,m:1},'Escoben',null],
 ['esocial','eSocial · pró-labore e folha','Informações de pró-labore, folha e encargos.','mensal',{dia:15,m:1},'Escoben',null],
 ['ecd','ECD (SPED Contábil)','Escrituração contábil digital do ano anterior.','anual',{texto:'1º semestre do ano seguinte'},'Escoben','contabil'],
 ['ecf','ECF','Escrituração contábil fiscal (IRPJ/CSLL) do ano anterior.','anual',{texto:'julho do ano seguinte'},'Escoben','contabil']];
const cfg=()=>db.gerencial?.obrigacoes||{};
const salvar=o=>{db.gerencial={...(db.gerencial||{}),obrigacoes:{...cfg(),...o}};save()};
const lista=()=>{const aj=cfg().ajustes||{};return PADRAO.map(([id,n,d,per,r,resp,dado])=>({id,n,d,per,r,resp,dado,...(aj[id]||{})})).filter(x=>!x.oculta)};
// Dia útil: sem fim de semana nem feriado nacional (fixos + Carnaval, Sexta-feira Santa e Corpus Christi).
const pascoa=y=>{const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mes=Math.floor((h+l-7*m+114)/31),dia=(h+l-7*m+114)%31+1;return new Date(y,mes-1,dia)};
const ferCache=new Map();
function feriados(y){if(ferCache.has(y))return ferCache.get(y);const p=pascoa(y),mv=n=>{const x=new Date(p);x.setDate(x.getDate()+n);return x.toLocaleDateString('sv-SE')};
 const s=new Set(['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'].map(x=>`${y}-${x}`));[-48,-47,-2,60].forEach(n=>s.add(mv(n)));ferCache.set(y,s);return s}
const util=d=>![0,6].includes(d.getDay())&&!feriados(d.getFullYear()).has(d.toLocaleDateString('sv-SE'));
function prazo(o,m){const [y,mm]=m.split('-').map(Number);const r=o.r||{};if(r.texto)return {txt:r.texto};
 if(o.per==='trimestral'&&mm%3!==0)return null;if(o.per==='anual')return {txt:r.texto||'anual'};
 let d;if(r.util){d=new Date(y,mm-1+r.m,1);let n=0;while(true){if(util(d)&&++n===r.util)break;d.setDate(d.getDate()+1)}}
 else if(r.ultimoUtil){d=new Date(y,mm+r.m-1+1,0);while(!util(d))d.setDate(d.getDate()-1)}
 else{d=new Date(y,mm-1+r.m,r.dia);if(!util(d)){const passo=r.antecipa?-1:1;while(!util(d))d.setDate(d.getDate()+passo)}}
 return {d:d.toLocaleDateString('sv-SE'),txt:d.toLocaleDateString('pt-BR')}}
function dado(o,m){const t=window.Contab?.tributos?.(m);const f=v=>money(v||0);
 switch(o.dado){case 'icms':return t?`ICMS das vendas ${f(t.icms)}`:'';case 'difal':return t?`DIFAL + FCP ${f(t.difal)} (por UF em Tributos a recolher)`:'';
  case 'piscofins':return t?`PIS ${f(t.pis)} · COFINS ${f(t.cofins)} · receita ${f(t.receita)}`:'';
  case 'irpjcsll':{const [y,mm]=m.split('-').map(Number);const ms=[0,1,2].map(i=>new Date(y,mm-1-i,15).toLocaleDateString('sv-SE').slice(0,7));const ts=ms.map(x=>window.Contab?.tributos?.(x)).filter(Boolean);return ts.length?`Trimestre: IRPJ ${f(ts.reduce((s,x)=>s+(x.irpj||0),0))} · CSLL ${f(ts.reduce((s,x)=>s+(x.csll||0),0))}`:''}
  case 'notas':{const s=db.orders.filter(o2=>o2.date.startsWith(m)).length,e=(db.purchases||[]).filter(n=>(n.emissao||'').startsWith(m)).length;return `${s} pedidos/notas de saída · ${e} notas de entrada no mês`}
  case 'contabil':return 'Diário, balancete e lote no plano do escritório (abas ao lado)';default:return ''}}
function view(m){const l=lista(),ent=cfg().entregas||{},h=new Date().toLocaleDateString('sv-SE');
 const linhas=l.map(o=>({o,p:prazo(o,m),e:ent[m+'|'+o.id]})).filter(x=>x.p);
 const pend=linhas.filter(x=>!x.e&&x.p.d),atras=pend.filter(x=>x.p.d<h);
 return `<div class="notice">Lista e prazos sugeridos para <strong>Lucro Presumido · comércio · SC</strong>. A contabilidade confirma, ajusta prazos e responsáveis em <em>Editar agenda</em>. Os valores vêm da contabilidade automática da competência.</div>
 <div class="tablebox"><div class="tabletop"><div><h2>Obrigações e guias · competência ${m.slice(5)}/${m.slice(0,4)}</h2><p class="caption">${linhas.length} item(ns) · ${pend.length} pendente(s)${atras.length?` · <span class="red">${atras.length} com prazo vencido</span>`:''}</p></div>
  <div class="row"><button class="small" data-ob="pacote">${icon('download')} Pacote do mês (CSV)</button><button class="small quiet" data-ob="editar">${icon('filter')} ${ui.ed?'Fechar edição':'Editar agenda'}</button></div></div>
 <div class="tablewrap"><table><thead><tr><th>Obrigação</th><th>Prazo</th><th>Responsável</th><th>O que o Jarvis já tem</th><th>Situação</th></tr></thead><tbody>
 ${linhas.map(({o,p,e})=>`<tr><td><strong>${esc(o.n)}</strong><br><small class="caption">${esc(o.d)}</small></td><td>${ui.ed?regraEdit(o):`<span class="${!e&&p.d&&p.d<h?'red':''}">${esc(p.txt)}</span>`}</td><td>${ui.ed?`<input data-ob-resp="${o.id}" value="${esc(o.resp)}" style="width:170px">`:esc(o.resp)}</td><td class="caption">${esc(dado(o,m))||'—'}</td>
  <td>${e?`<span class="badge ok">entregue</span><br><small class="caption">${esc(e.por)} · ${new Date(e.em).toLocaleDateString('pt-BR')}</small> <button class="small quiet" data-ob="desfaz" data-id="${o.id}">desfazer</button>`:`<button class="small" data-ob="feito" data-id="${o.id}">${icon('check')} Marcar entregue</button>`}</td></tr>`).join('')}</tbody></table></div>
 ${ui.ed?`<div class="tabletop"><span class="caption">Prazos: dia do mês seguinte, N-ésimo dia útil, último dia útil ou texto livre. Ocultar remove a obrigação da agenda.</span><button class="small primary" data-ob="salvar">${icon('check')} Salvar agenda</button></div>`:''}</div>`}
function regraEdit(o){const r=o.r||{},tipo=r.texto?'texto':r.util?'util':r.ultimoUtil?'ultimo':'dia';
 return `<div class="row wrap" style="gap:6px"><select data-ob-tipo="${o.id}"><option value="dia" ${tipo==='dia'?'selected':''}>dia</option><option value="util" ${tipo==='util'?'selected':''}>º dia útil</option><option value="ultimo" ${tipo==='ultimo'?'selected':''}>último dia útil</option><option value="texto" ${tipo==='texto'?'selected':''}>texto</option></select>
 <input data-ob-n="${o.id}" value="${esc(r.texto||r.util||r.dia||'')}" style="width:90px" placeholder="nº/texto"><input data-ob-m="${o.id}" value="${r.m??1}" style="width:48px" title="meses depois da competência"> <label class="caption" style="margin:0"><input type="checkbox" data-ob-oculta="${o.id}"> ocultar</label></div>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ob]');if(!b)return;const k=b.dataset.ob,m=month,ent={...(cfg().entregas||{})};
 if(k==='editar'){ui.ed=!ui.ed;render();return}
 if(k==='feito'){ent[m+'|'+b.dataset.id]={por:window.Cloud?.session?.user?.email||'—',em:new Date().toISOString()};salvar({entregas:ent});audit('Obrigação entregue',`${b.dataset.id} · ${m}`);render();return}
 if(k==='desfaz'){delete ent[m+'|'+b.dataset.id];salvar({entregas:ent});audit('Obrigação reaberta',`${b.dataset.id} · ${m}`);render();return}
 if(k==='salvar'){const aj={...(cfg().ajustes||{})};for(const o of PADRAO){const id=o[0],t=$(`[data-ob-tipo="${id}"]`);if(!t)continue;const n=$(`[data-ob-n="${id}"]`).value.trim(),mm=Number($(`[data-ob-m="${id}"]`).value)||1;
   const r=t.value==='texto'?{texto:n}:t.value==='util'?{util:Number(n)||1,m:mm}:t.value==='ultimo'?{ultimoUtil:true,m:mm}:{dia:Number(n)||10,m:mm};
   aj[id]={...(aj[id]||{}),r,resp:$(`[data-ob-resp="${id}"]`)?.value||o[5],oculta:$(`[data-ob-oculta="${id}"]`)?.checked||false}}
  salvar({ajustes:aj});audit('Agenda de obrigações ajustada',Object.keys(aj).join(', '));ui.ed=false;toast('Agenda salva.');render();return}
 if(k==='pacote'){const l=lista(),ent2=cfg().entregas||{},lin=[['obrigacao','prazo','responsavel','dados_jarvis','situacao']];
  for(const o of l){const p=prazo(o,m);if(!p)continue;const e2=ent2[m+'|'+o.id];lin.push([o.n,p.txt,o.resp,dado(o,m),e2?`entregue ${e2.por} ${e2.em.slice(0,10)}`:'pendente'])}
  const t=window.Contab?.tributos?.(m);if(t)for(const [n,v] of [['Receita bruta',t.receita],['ICMS próprio',t.icms],['DIFAL + FCP',t.difal],['PIS',t.pis],['COFINS',t.cofins],['IRPJ',t.irpj],['CSLL',t.csll]])lin.push(['Apuração: '+n,'','',String((v||0).toFixed(2)).replace('.',','),'']);
  const csv='﻿'+lin.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(';')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`obrigacoes-${m}.csv`;a.click();audit('Pacote de obrigações exportado',m)}});
window.Obrigacoes={view,lista,prazo};
})();
