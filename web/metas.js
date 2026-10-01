'use strict';
// Metas do mês: vendas, margem de contribuição e recebido, para a empresa toda e por canal, comparados com o ponto em
// que deveriam estar HOJE (meta × fração do mês já decorrida). Projeção = ritmo atual levado até o fim do mês.
// Ficam na tabela metas (nuvem; no modo local, neste navegador). O alerta diário e o relatório semanal usam a mesma
// regra no servidor (supabase/functions/_shared/metas.ts) — as duas são testadas com os mesmos números.
(()=>{
Object.assign(paths,{alvo:'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z M12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z',copy:paths.copy||'M8 8h11v13H8z M5 16V3h11'});
const IND={vendas:{t:'Vendas',u:'R$',d:'faturamento bruto dos pedidos (sem cancelados)'},margem:{t:'Margem de contribuição',u:'%',d:'lucro de contribuição ÷ vendas (pedidos com custo)'},recebido:{t:'Recebido',u:'R$',d:'repasses dos marketplaces que entraram no mês'}};
const ORDEM=['vendas','margem','recebido'];
const mesDe=(d=new Date())=>d.toLocaleDateString('sv-SE').slice(0,7);
const st={lista:null,ws:undefined,carregando:false};
// O mês das metas é a competência escolhida no cabeçalho (a mesma de todas as telas).
const mesTela=()=>typeof month==='string'&&/^\d{4}-\d{2}$/.test(month)?month:mesDe();
const diasDoMes=m=>{const [a,b]=m.split('-').map(Number);return new Date(a,b,0).getDate()};
const somaMes=(m,n)=>{const [a,b]=m.split('-').map(Number),d=new Date(a,b-1+n,1,12);return mesDe(d)};
const nomeMes=m=>{const [a,b]=m.split('-').map(Number);return new Date(a,b-1,1,12).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})};
const pc=v=>v==null?'—':(v*100).toFixed(0)+'%';
const fmt=(ind,v)=>v==null?'—':IND[ind].u==='%'?Number(v).toFixed(1).replace('.',',')+'%':money(v);
const podeEditar=()=>!window.Cloud?.ws||['owner','member','financeiro'].includes(window.Cloud.role);

/** Fração do mês já decorrida em `agora` (mês passado = 1, mês futuro = 0). Conta as horas do dia de hoje. */
function fracao(m,agora=new Date()){const atual=mesDe(agora);if(m<atual)return 1;if(m>atual)return 0;
 return Math.min(1,((agora.getDate()-1)+(agora.getHours()+agora.getMinutes()/60)/24)/diasDoMes(m))}
/** Avalia uma meta. R$: esperado hoje = meta × fração; ritmo = realizado ÷ esperado (≥100% no ritmo, ≥90% atenção).
 *  Margem (%): compara direto (≥ meta no ritmo; até 2 pontos abaixo, atenção). Nos 3 primeiros dias não há julgamento. */
function avaliar({ind,meta,real,frac,dias=30,base=null}){
 if(ind==='margem'){if(!base)return {ind,meta,real:null,status:'semdados'};const r=real;return {ind,meta,real:r,status:r>=meta?'ok':r>=meta-2?'atencao':'abaixo',pct:meta?r/meta:null}}
 const esperado=meta*frac,proj=frac>0?real/frac:null,ritmo=esperado>0?real/esperado:null,pct=meta?real/meta:null;
 const status=frac===0?'futuro':frac*dias<3&&frac<1?'cedo':ritmo>=1?'ok':ritmo>=0.9?'atencao':'abaixo';
 return {ind,meta,real,esperado,proj,ritmo,pct,status}}
const ST={ok:['No ritmo','ok'],atencao:['Atenção','warn'],abaixo:['Abaixo do ritmo','bad'],cedo:['Começo do mês','info'],futuro:['Ainda não começou',''],semdados:['Sem dados','']};
// Mês encerrado: o resultado final, não o ritmo.
const STF={ok:['Meta batida','ok'],atencao:['Quase (90% ou mais)','warn'],abaixo:['Abaixo da meta','bad'],semdados:['Sem dados','']};
const rot=(a,fechado)=>(fechado&&STF[a.status])||ST[a.status];

// Realizado do mês por canal ('' = empresa toda).
function realizado(m){const r={},R=c=>r[c]||(r[c]={vendas:0,recebido:0,margem:null,baseMargem:0});
 for(const o of db.orders||[]){if(!String(o.date||'').startsWith(m))continue;const g=Number(o.gross)||0;if(g>0&&Number(o.fee)>=g*0.95)continue;R('').vendas+=g;R(o.platform).vendas+=g}
 for(const x of db.receipts||[]){const v=Number(x.amount)||0;if(!String(x.date||'').startsWith(m)||v<=0)continue;R('').recebido+=v;R(x.platform||'Outros').recebido+=v}
 const mg=window.Margem?.mes?.(m)||{};for(const [c,v] of Object.entries(mg))if(v.venda>0){R(c).margem=v.lucro/v.venda*100;R(c).baseMargem=v.venda}
 return r}
function avaliacoes(m=mesTela(),agora=new Date()){const metas=(st.lista||[]).filter(x=>x.mes===m),real=realizado(m),frac=fracao(m,agora),dias=diasDoMes(m);
 return metas.map(x=>{const rr=real[x.canal]||{};return {...avaliar({ind:x.indicador,meta:Number(x.valor),real:x.indicador==='margem'?rr.margem:(rr[x.indicador]||0),frac,dias,base:rr.baseMargem}),canal:x.canal}})
  .sort((a,b)=>ordemCanal(a.canal,b.canal)||ORDEM.indexOf(a.ind)-ORDEM.indexOf(b.ind))}
const ordemCanal=(a,b)=>a===b?0:a===''?-1:b===''?1:a.localeCompare(b);

// ─────────── Dados ───────────
const LOCAL='eb_metas';
async function carregar(){if(st.carregando)return;st.carregando=true;st.ws=window.Cloud?.ws||null;
 try{if(st.ws){const {data,error}=await Cloud.client.from('metas').select('mes,canal,indicador,valor,atualizado_por,updated_at').eq('workspace_id',st.ws).gte('mes',somaMes(mesDe(),-14));if(error)throw error;st.lista=data||[]}
  else{try{st.lista=JSON.parse(localStorage.getItem(LOCAL)||'[]')}catch{st.lista=[]}}}
 catch(e){st.lista=st.lista||[];toast('Metas: '+(e.message||e))}finally{st.carregando=false}
 if(['metas','resumo'].includes(page)&&!document.querySelector('.modalback'))render()}
async function gravar(m,linhas){const quem=window.Cloud?.session?.user?.email||'';
 if(st.ws){const novos=linhas.filter(l=>l.valor!=null),fora=(st.lista||[]).filter(x=>x.mes===m&&!novos.some(n=>n.canal===x.canal&&n.indicador===x.indicador));
  if(novos.length){const {error}=await Cloud.client.from('metas').upsert(novos.map(l=>({workspace_id:st.ws,mes:m,canal:l.canal,indicador:l.indicador,valor:l.valor,atualizado_por:quem,updated_at:new Date().toISOString()})),{onConflict:'workspace_id,mes,canal,indicador'});if(error)throw error}
  for(const x of fora){const {error}=await Cloud.client.from('metas').delete().eq('workspace_id',st.ws).eq('mes',m).eq('canal',x.canal).eq('indicador',x.indicador);if(error)throw error}}
 st.lista=[...(st.lista||[]).filter(x=>x.mes!==m),...linhas.filter(l=>l.valor!=null).map(l=>({mes:m,canal:l.canal,indicador:l.indicador,valor:l.valor,atualizado_por:quem}))];
 if(!st.ws)try{localStorage.setItem(LOCAL,JSON.stringify(st.lista))}catch{}
 audit('Metas do mês definidas',`${nomeMes(m)} · ${linhas.filter(l=>l.valor!=null).length} meta(s)`)}
// Sugestão: média dos 3 meses completos anteriores (+10% em vendas e recebido; margem igual à média).
function sugerir(m){const ms=[1,2,3].map(n=>somaMes(m,-n)),reais=ms.map(realizado),canais=canaisDe(m),out=[];
 for(const c of canais)for(const ind of ORDEM){const vals=reais.map(r=>ind==='margem'?r[c]?.margem:r[c]?.[ind]).filter(v=>v!=null&&v>0);if(!vals.length)continue;
  const med=vals.reduce((a,b)=>a+b,0)/vals.length;out.push({canal:c,indicador:ind,valor:ind==='margem'?Math.round(med*2)/2:Math.round(med*1.1/100)*100})}
 return out}
function canaisDe(m){const desde=somaMes(m,-3),s=new Set(['']);for(const o of db.orders||[])if(String(o.date||'')>=desde)s.add(o.platform);for(const x of st.lista||[])if(x.mes===m)s.add(x.canal);return [...s].filter(c=>c!=null)}

// ─────────── Tela ───────────
function barra(a){if(a.ind==='margem'){const w=a.meta?Math.min(100,(a.real||0)/a.meta*100):0;return `<span class="metabar"><i class="${ST[a.status][1]}" style="width:${w.toFixed(0)}%"></i></span>`}
 const top=Math.max(a.meta,a.real,a.proj||0)||1,w=Math.min(100,a.real/top*100),e=Math.min(100,a.esperado/top*100),mm=Math.min(100,a.meta/top*100);
 return `<span class="metabar" title="Realizado ${fmt(a.ind,a.real)} · esperado hoje ${fmt(a.ind,a.esperado)} · meta ${fmt(a.ind,a.meta)}"><i class="${ST[a.status][1]}" style="width:${w.toFixed(1)}%"></i><b style="left:${e.toFixed(1)}%" aria-hidden="true"></b><em style="left:${mm.toFixed(1)}%" aria-hidden="true"></em></span>`}
function linhaInfo(a,fechado){if(a.ind==='margem')return a.status==='semdados'?'sem vendas com custo neste mês':`realizado ${fmt('margem',a.real)} · meta ${fmt('margem',a.meta)}`;
 if(fechado)return `${pc(a.pct)} da meta · ${a.real>=a.meta?'superou em '+fmt(a.ind,a.real-a.meta):'faltaram '+fmt(a.ind,a.meta-a.real)}`;
 return `${pc(a.pct)} da meta · hoje deveria estar em ${fmt(a.ind,a.esperado)}${a.proj!=null&&!['futuro','cedo'].includes(a.status)?` · projeção ${fmt(a.ind,a.proj)}`:''}`}
function view(){if(!st.lista||st.ws!==(window.Cloud?.ws||null)){carregar();return '<div class="empty">Carregando metas…</div>'}
 const av=avaliacoes(),tot=av.filter(a=>a.canal===''),can=av.filter(a=>a.canal!==''),m=mesTela(),frac=fracao(m),fe=frac>=1;
 return `<div class="crmbar"><div class="row"><button class="small" data-meta-mes="-1" aria-label="Mês anterior">‹</button><strong style="min-width:150px;text-align:center;text-transform:capitalize">${esc(nomeMes(m))}</strong><button class="small" data-meta-mes="1" aria-label="Próximo mês">›</button></div>
  <span class="caption">${frac>=1?'mês encerrado':frac===0?'mês ainda não começou':`${(frac*100).toFixed(0)}% do mês decorrido (proporcional aos dias)`}</span>
  ${podeEditar()?`<button class="primary small" data-meta="editar">${icon('alvo')} ${av.length?'Ajustar metas':'Definir metas'}</button>`:''}</div>
 ${!av.length?`<div class="card empty"><p><strong>Nenhuma meta para ${esc(nomeMes(m))}.</strong></p><p class="caption">Defina quanto quer vender, a margem de contribuição e quanto precisa receber — para a empresa toda e para cada canal. O Jarvis mostra todo dia se o mês está no ritmo e avisa quando descolar.</p>${podeEditar()?`<button class="primary" data-meta="editar">${icon('alvo')} Definir metas do mês</button>`:''}</div>`:`
 ${tot.length?`<div class="grid ${tot.length>=3?'three':'two'}">${tot.map(a=>{const [t,tom]=rot(a,fe);return `<div class="card kpi metakpi"><span class="kpil">${IND[a.ind].t} · empresa toda</span><span class="kpiv">${fmt(a.ind,a.real)}</span><span class="kpis">meta ${fmt(a.ind,a.meta)} <span class="badge ${tom}">${t}</span></span>${barra(a)}<span class="caption">${linhaInfo(a,fe)}</span></div>`}).join('')}</div>`:''}
 ${can.length?`<div class="tablebox"><div class="tabletop"><h2>Por canal</h2><span class="caption">${fe?'barra = realizado · traço = meta':'barra = realizado · traço escuro = onde deveria estar hoje · traço claro = meta'}</span></div><div class="tablewrap"><table><thead><tr><th>Canal</th><th>Indicador</th><th class="num">Realizado</th><th class="num">Meta</th><th style="min-width:180px">Andamento</th><th>Situação</th></tr></thead><tbody>
  ${can.map(a=>{const [t,tom]=rot(a,fe);return `<tr><td><strong>${esc(a.canal)}</strong></td><td>${IND[a.ind].t}</td><td class="num">${fmt(a.ind,a.real)}</td><td class="num">${fmt(a.ind,a.meta)}</td><td>${barra(a)}<span class="caption">${linhaInfo(a,fe)}</span></td><td><span class="badge ${tom}">${t}</span></td></tr>`}).join('')}</tbody></table></div></div>`:''}
 <p class="caption">${ORDEM.map(k=>`<strong>${IND[k].t}</strong>: ${IND[k].d}`).join(' · ')}.</p>`}`}
function editar(sug){const m=mesTela(),canais=canaisDe(m),val=(c,i)=>{const s=sug?.find(x=>x.canal===c&&x.indicador===i);if(s)return s.valor;const x=(st.lista||[]).find(x=>x.mes===m&&x.canal===c&&x.indicador===i);return x?Number(x.valor):''};
 modal(`Metas de ${nomeMes(m)}`,`<p class="caption" style="margin-top:-8px">Deixe em branco o que não quiser acompanhar. Vendas e recebido em reais; margem de contribuição em %.</p>
 <div class="tablewrap"><table><thead><tr><th>Canal</th>${ORDEM.map(i=>`<th class="num">${IND[i].t} (${IND[i].u})</th>`).join('')}</tr></thead><tbody>
 ${canais.map(c=>`<tr><td><strong>${c?esc(c):'Empresa toda'}</strong></td>${ORDEM.map(i=>`<td class="num"><input class="ufin" inputmode="decimal" data-meta-c="${esc(c)}" data-meta-i="${i}" value="${val(c,i)===''?'':String(val(c,i)).replace('.',',')}" style="width:120px" aria-label="${esc((c||'Empresa toda')+' · '+IND[i].t)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button data-meta="copiar">${icon('copy')} Copiar do mês anterior</button><button data-meta="sugerir">${icon('spark')} Sugerir pelo histórico (+10%)</button><button class="primary" data-meta="salvar">${icon('check')} Salvar metas</button></div>`)}
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-meta],[data-meta-mes]');if(!b)return;const d=b.dataset;
 if(d.metaMes){month=somaMes(mesTela(),Number(d.metaMes));render();return}
 if(d.meta==='editar'){editar();return}
 if(d.meta==='sugerir'){const s=sugerir(mesTela());if(!s.length)return toast('Sem histórico suficiente nos 3 meses anteriores.');closeModal();editar(s);toast('Sugestão preenchida. Revise e salve.');return}
 if(d.meta==='copiar'){const ant=somaMes(mesTela(),-1),s=(st.lista||[]).filter(x=>x.mes===ant).map(x=>({canal:x.canal,indicador:x.indicador,valor:Number(x.valor)}));if(!s.length)return toast('O mês anterior não tem metas.');closeModal();editar(s);toast('Metas do mês anterior copiadas. Revise e salve.');return}
 if(d.meta==='salvar'){const linhas=[...document.querySelectorAll('[data-meta-c]')].map(i=>{const t=String(i.value).trim().replace(/\./g,'').replace(',','.');const v=t===''?null:Number(t);return {canal:i.dataset.metaC,indicador:i.dataset.metaI,valor:v!=null&&isFinite(v)&&v>=0?Math.round(v*100)/100:null}});
  b.disabled=true;try{await gravar(mesTela(),linhas);closeModal();toast('Metas salvas.');render()}catch(e){toast(e.message||String(e))}finally{b.disabled=false}}});
addPage('metas','alvo','Metas do mês',view,'Vendas, margem e recebido do mês contra a meta — e onde deveriam estar hoje.','',()=>{});
// Resumo e avisos: usados no Resumo da semana e nas pendências.
function resumo(){if(!st.lista){if(!st.carregando&&(window.Cloud?.ws||!window.Cloud?.enabled))carregar();return []}return avaliacoes(mesDe()).filter(a=>a.canal==='')}
window.Metas={fracao,avaliar,avaliacoes,realizado,sugerir,resumo,carregar,
 avisos:()=>resumo().filter(a=>a.status==='abaixo').map(a=>['warn','alvo',`${IND[a.ind].t} abaixo da meta do mês`,a.ind==='margem'?`${fmt('margem',a.real)} contra meta de ${fmt('margem',a.meta)}`:`${pc(a.ritmo)} do esperado até hoje · projeção ${fmt(a.ind,a.proj)}`,'metas'])};
let ultimo;setInterval(()=>{const w=window.Cloud?.ws||null;if(w&&w!==ultimo){ultimo=w;st.lista=null;carregar()}},3000);
})();
