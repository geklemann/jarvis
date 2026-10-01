'use strict';
// Central de erros (tela): falhas registradas no navegador de quem usa o sistema (erros.js) e nas funções do servidor,
// agrupadas por erro, com quantas vezes aconteceu, quem foi afetado, em que tela e versão. Só o dono vê. Marcar como
// resolvido arquiva o erro; se ele voltar a acontecer, reaparece como novo.
(()=>{
Object.assign(paths,{bug:'M8 9a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0z M12 9v9 M4 11h4 M16 11h4 M5 17l3-2 M19 17l-3-2 M5 5l3 3 M19 5l-3 3'});
const st={lista:null,carregando:false,erro:'',filtro:'abertos',ws:null};
window.Reiniciar?.registrar(st,['filtro']); // estado de tela: volta ao original ao clicar no menu
const dh=d=>d?new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const dono=()=>window.Cloud?.role==='owner';
async function carregar(){if(!window.Cloud?.ws||st.carregando)return;st.carregando=true;st.ws=Cloud.ws;
 try{const {data,error}=await Cloud.client.from('erros_sistema').select('*').eq('workspace_id',Cloud.ws).order('ultimo_em',{ascending:false}).limit(300);if(error)throw error;st.lista=data||[];st.erro=''}
 catch(e){st.erro=e.message||String(e);st.lista=st.lista||[]}finally{st.carregando=false}if(page==='erros'&&!document.querySelector('.modalback'))render()}
function view(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver a central de erros.</div>';
 if(!dono())return '<div class="notice">Só o administrador da empresa vê a central de erros.</div>';
 if(!st.lista||st.ws!==Cloud.ws){carregar();return '<div class="empty">Carregando…</div>'}
 const ab=st.lista.filter(e=>!e.resolvido_em),sem=Date.now()-7*864e5,rec=ab.filter(e=>new Date(e.ultimo_em)>sem),usu=new Set(ab.flatMap(e=>e.usuarios||[]));
 const l=st.filtro==='abertos'?ab:st.lista.filter(e=>e.resolvido_em);
 return `<div class="notice">Toda falha que acontece na tela de alguém da equipe, ou numa função do servidor, chega aqui sozinha: qual erro, em que tela, quantas vezes e com quem. O suporte usa esta lista para corrigir antes de alguém precisar reclamar.</div>
 ${st.erro?`<div class="notice warnbox">${esc(st.erro)}</div>`:''}
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Erros em aberto</span><span class="kpiv ${ab.length?'gold':''}">${ab.length}</span><span class="kpis">${ab.filter(e=>e.origem==='servidor').length} no servidor · ${ab.filter(e=>e.origem!=='servidor').length} no navegador</span></div>
  <div class="card kpi"><span class="kpil">Últimos 7 dias</span><span class="kpiv">${rec.length}</span><span class="kpis">${rec.reduce((s,e)=>s+(e.ocorrencias||0),0)} ocorrência(s) somadas</span></div>
  <div class="card kpi"><span class="kpil">Pessoas afetadas</span><span class="kpiv">${usu.size}</span><span class="kpis">nos erros em aberto</span></div>
  <div class="card kpi"><span class="kpil">Resolvidos</span><span class="kpiv">${st.lista.length-ab.length}</span><span class="kpis">arquivados</span></div></div>
 <div class="crmbar"><div class="segtabs">${[['abertos','Em aberto'],['resolvidos','Resolvidos']].map(([k,t])=>`<button class="${st.filtro===k?'active':''}" data-ce-filtro="${k}">${t}</button>`).join('')}</div><button class="small" data-ce="atualizar">${icon('refresh')} Atualizar</button></div>
 <div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Erro</th><th>Onde</th><th class="num">Vezes</th><th>Quem</th><th>Primeira · última</th><th>Versão</th><th></th></tr></thead><tbody>
 ${l.map(e=>`<tr class="clickrow" data-ce-abrir="${e.id}"><td><strong>${esc(String(e.mensagem).slice(0,140))}</strong><br><span class="caption mono">${esc((e.assinatura.split(' @ ')[1])||'')}</span></td>
  <td><span class="badge ${e.origem==='servidor'?'purple':'info'}">${e.origem==='servidor'?'Servidor':'Navegador'}</span><br><span class="caption">${esc(e.pagina||'—')}</span></td><td class="num"><strong>${e.ocorrencias}</strong></td>
  <td class="caption">${esc((e.usuarios||[]).map(u=>String(u).split('@')[0]).slice(0,3).join(', ')||'—')}${(e.usuarios||[]).length>3?` +${e.usuarios.length-3}`:''}</td><td class="caption">${dh(e.primeiro_em)}<br>${dh(e.ultimo_em)}</td><td class="caption mono">${esc(e.versao||'—')}</td>
  <td>${e.resolvido_em?`<span class="caption">resolvido ${dh(e.resolvido_em)}</span>`:`<button class="small" data-ce-resolver="${e.id}">${icon('check')} Resolvido</button>`}</td></tr>`).join('')||`<tr><td colspan="7" class="empty">${st.filtro==='abertos'?'Nenhum erro em aberto. ✓':'Nada resolvido ainda.'}</td></tr>`}
 </tbody></table></div></div>`}
function detalhe(id){const e=st.lista.find(x=>String(x.id)===String(id));if(!e)return;
 modal('Detalhe do erro',`<p><strong>${esc(e.mensagem)}</strong></p><p class="caption">${e.origem==='servidor'?'Função do servidor':'Navegador'} · tela ${esc(e.pagina||'—')} · ${e.ocorrencias} vez(es) · versão ${esc(e.versao||'—')}</p>
 <div class="grid two"><div><small class="caption">Primeira vez</small><br>${dh(e.primeiro_em)}</div><div><small class="caption">Última vez</small><br>${dh(e.ultimo_em)} · ${esc(e.usuario||'')}</div></div>
 ${e.url?`<p class="caption">Endereço: ${esc(e.url)}</p>`:''}${e.navegador?`<p class="caption">Navegador: ${esc(e.navegador)}</p>`:''}
 <label>Rastro técnico (para o suporte)</label><pre style="max-height:260px;overflow:auto;white-space:pre-wrap;font-size:12px;background:var(--panel2,rgba(127,127,127,.08));padding:10px;border-radius:8px">${esc(e.pilha||'—')}</pre>
 <div class="modalfoot"><button data-action="close">Fechar</button>${e.resolvido_em?'':`<button class="primary" data-ce-resolver="${e.id}">${icon('check')} Marcar como resolvido</button>`}</div>`)}
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-ce],[data-ce-filtro],[data-ce-abrir],[data-ce-resolver]');if(!b)return;const d=b.dataset;
 if(d.ceResolver){ev.stopPropagation();const e=st.lista.find(x=>String(x.id)===d.ceResolver);if(!e)return;
  const {error}=await Cloud.client.from('erros_sistema').update({resolvido_em:new Date().toISOString(),resolvido_por:Cloud.session?.user?.email||''}).eq('id',e.id);if(error)return toast(error.message);
  e.resolvido_em=new Date().toISOString();if(document.querySelector('.modalback'))closeModal();toast('Erro marcado como resolvido. Se acontecer de novo, ele volta para a lista.');render();return}
 if(d.ceFiltro){st.filtro=d.ceFiltro;render();return}if(d.ce==='atualizar'){await carregar();return}if(d.ceAbrir)detalhe(d.ceAbrir)});
addPage('erros','bug','Central de erros',view,'Falhas vistas no navegador da equipe e no servidor, com quantas vezes, quem e onde — para corrigir antes da reclamação.','',()=>{});
window.CentralErros={abertos:()=>(st.lista||[]).filter(e=>!e.resolvido_em).length,carregar};
// Carrega a contagem uma vez por empresa para o aviso no menu do usuário.
let ultimo=null;setInterval(()=>{if(window.Cloud?.ws&&Cloud.ws!==ultimo&&dono()){ultimo=Cloud.ws;carregar()}},5000);
})();
