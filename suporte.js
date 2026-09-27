'use strict';
// Manual e suporte: o manual completo (com as telas reais, guardado no banco e visível só para quem está logado)
// e os chamados de suporte — qualquer pessoa da equipe abre; o dono do workspace recebe, responde e resolve.
(()=>{
const st={aba:'manual',manualUrl:null,manualErro:'',carregandoManual:false,lista:null,carregando:false,filtro:'abertos',origem:'',sel:null};
const TIPOS={duvida:'Dúvida',erro:'Erro no sistema',sugestao:'Sugestão de melhoria',acesso:'Acesso e permissões',outro:'Outro'};
const URG={baixa:['Baixa',''],normal:['Normal','info'],alta:['Alta','warn'],parado:['Parou o trabalho','bad']};
const SIT={aberto:['Aberto','warn'],andamento:['Em andamento','info'],aguardando:['Aguardando você','info'],resolvido:['Resolvido','ok']};
const dono=()=>(window.Cloud?.role||'owner')==='owner';
const eu=()=>window.Cloud?.session?.user||{};
const dh=t=>t?new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
async function carregarManual(){if(st.carregandoManual||st.manualUrl)return;st.carregandoManual=true;st.manualErro='';
 try{const {data,error}=await Cloud.client.from('documentos').select('parte,conteudo').eq('id','manual').order('parte');if(error)throw error;if(!data?.length)throw Error('O manual ainda não foi publicado.');
  st.manualUrl=URL.createObjectURL(new Blob([data.map(x=>x.conteudo).join('')],{type:'text/html'}))}catch(e){st.manualErro=e.message||String(e)}finally{st.carregandoManual=false;if(page==='suporte')render()}}
async function carregar(){if(st.carregando||!window.Cloud?.ws)return;st.carregando=true;
 try{const {data,error}=await Cloud.client.from('chamados').select('*').eq('workspace_id',Cloud.ws).order('created_at',{ascending:false}).limit(500);if(error)throw error;st.lista=data||[]}catch(e){st.lista=st.lista||[];console.warn('chamados',e)}finally{st.carregando=false;atualizarContador();if(page==='suporte'&&!document.querySelector('.modalback'))render()}}
const pendentesDono=()=>(st.lista||[]).filter(c=>!c.lido_dono&&c.status!=='resolvido');
const respostasNovas=()=>(st.lista||[]).filter(c=>c.criado_por===eu().id&&!c.lido_autor);
function atualizarContador(){const n=dono()?pendentesDono().length:respostasNovas().length;document.querySelectorAll('[data-nav="suporte"] .navcount').forEach(x=>x.remove());if(n)document.querySelectorAll('[data-nav="suporte"]').forEach(b=>b.insertAdjacentHTML('beforeend',`<em class="navcount">${n}</em>`))}

function view(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver o manual e o suporte.</div>';if(!st.lista&&!st.carregando)carregar();
 const abas=[['manual','Manual do sistema'],['abrir','Abrir chamado'],['meus','Meus chamados'],...(dono()?[['todos','Chamados recebidos']]:[])];
 const n=dono()?pendentesDono().length:respostasNovas().length;
 const head=`<div class="crmbar"><div class="segtabs">${abas.map(([k,t])=>`<button class="${st.aba===k?'active':''}" data-sp-aba="${k}">${t}${k===(dono()?'todos':'meus')&&n?` <small>${n}</small>`:''}</button>`).join('')}</div></div>`;
 if(st.aba==='manual'){if(!st.manualUrl&&!st.manualErro)carregarManual();
  return head+(st.manualErro?`<div class="notice warnbox">${esc(st.manualErro)}</div>`:st.manualUrl?`<div class="spmanual"><iframe src="${st.manualUrl}" title="Manual do Jarvis"></iframe></div><p class="caption">Dica: cada tela também tem o botão ? no título, e o Mapa do ERP lista todas as telas.</p>`:'<div class="empty">Carregando o manual…</div>')}
 if(st.aba==='abrir')return head+`<section class="card spform"><h2>Abrir um chamado</h2><p class="caption">Descreva o que aconteceu ou o que você precisa. O chamado vai para ${dono()?'você (dono do sistema)':'o responsável pelo sistema'}, e a resposta aparece em Meus chamados.</p>
  <div class="grid two"><div class="field"><label for="spTipo">Tipo</label><select id="spTipo">${Object.entries(TIPOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join('')}</select></div>
  <div class="field"><label for="spUrg">Urgência</label><select id="spUrg">${Object.entries(URG).map(([k,[t]])=>`<option value="${k}" ${k==='normal'?'selected':''}>${t}</option>`).join('')}</select></div></div>
  <div class="field"><label for="spTitulo">Assunto</label><input id="spTitulo" maxlength="120" placeholder="Ex.: Nota do pedido 123 não aparece"></div>
  <div class="field"><label for="spDesc">O que aconteceu</label><textarea id="spDesc" rows="6" placeholder="O que você fez, o que esperava e o que apareceu. Se for erro, copie a mensagem."></textarea></div>
  <div class="field"><label for="spTela">Tela</label><input id="spTela" value="${esc(st.origem||'')}" placeholder="Em qual tela aconteceu"></div>
  <div id="spMsg" class="caption" style="min-height:20px"></div><div class="row"><button class="primary" data-sp="enviar">${icon('check')} Enviar chamado</button></div></section>`;
 const lista=(st.lista||[]).filter(c=>st.aba==='meus'?c.criado_por===eu().id:true).filter(c=>st.aba==='meus'||st.filtro==='todos'||(st.filtro==='abertos'?c.status!=='resolvido':c.status==='resolvido'));
 return head+(st.aba==='todos'?`<div class="segtabs" style="margin-bottom:12px">${[['abertos','Em aberto'],['resolvidos','Resolvidos'],['todos','Todos']].map(([k,t])=>`<button class="${st.filtro===k?'active':''}" data-sp-filtro="${k}">${t}</button>`).join('')}</div>`:'')+
 `<div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Nº</th><th>Assunto</th>${st.aba==='todos'?'<th>Quem abriu</th>':''}<th>Tipo</th><th>Urgência</th><th>Situação</th><th>Atualizado</th></tr></thead><tbody>
 ${lista.map(c=>{const novo=st.aba==='todos'?!c.lido_dono:!c.lido_autor;return `<tr class="clickrow" data-sp-abrir="${esc(c.id)}"><td class="mono">${c.numero}</td><td style="white-space:normal">${novo?'<span class="badge bad">novo</span> ':''}<strong>${esc(c.titulo)}</strong>${c.tela?`<br><small class="caption">${esc(c.tela)}</small>`:''}</td>${st.aba==='todos'?`<td>${esc(c.nome||c.email||'')}</td>`:''}<td>${TIPOS[c.tipo]||c.tipo}</td><td><span class="badge ${URG[c.urgencia]?.[1]||''}">${URG[c.urgencia]?.[0]||c.urgencia}</span></td><td><span class="badge ${SIT[c.status]?.[1]||''}">${SIT[c.status]?.[0]||c.status}</span></td><td class="caption">${dh(c.updated_at)}</td></tr>`}).join('')||`<tr><td colspan="7" class="empty">${st.carregando?'Carregando…':'Nenhum chamado aqui.'}</td></tr>`}</tbody></table></div></div>`}

function abrir(id){const c=(st.lista||[]).find(x=>x.id===id);if(!c)return;const souDono=dono(),autor=c.criado_por===eu().id;
 // Marca como lido para quem abriu a conversa.
 const marca=souDono&&!c.lido_dono?{lido_dono:true}:autor&&!c.lido_autor?{lido_autor:true}:null;if(marca){Object.assign(c,marca);Cloud.client.from('chamados').update(marca).eq('workspace_id',Cloud.ws).eq('id',c.id).then(()=>atualizarContador())}
 const conversa=[{de:'autor',nome:c.nome||c.email,texto:c.descricao,em:c.created_at},...(c.respostas||[])];
 modal(`Chamado nº ${c.numero} · ${esc(c.titulo)}`,`<div class="row wrap" style="gap:8px;margin-bottom:12px"><span class="badge">${TIPOS[c.tipo]||c.tipo}</span><span class="badge ${URG[c.urgencia]?.[1]||''}">${URG[c.urgencia]?.[0]}</span><span class="badge ${SIT[c.status]?.[1]||''}">${SIT[c.status]?.[0]}</span>${c.tela?`<span class="caption">Tela: ${esc(c.tela)}</span>`:''}</div>
 <div class="atconversa">${conversa.map(m=>`<div class="atbolha ${m.de==='dono'?'nos':''}"><small>${esc(m.nome||'')} · ${dh(m.em)}</small>${esc(m.texto||'').replace(/\n/g,'<br>')}</div>`).join('')}</div>
 ${c.status!=='resolvido'||souDono?`<label for="spResp">${souDono?'Responder':'Complementar'}</label><textarea id="spResp" rows="4"></textarea>
 <div class="row wrap" style="margin-top:8px">${souDono?`<select id="spSit">${Object.entries(SIT).map(([k,[t]])=>`<option value="${k}" ${c.status===k?'selected':''}>${t}</option>`).join('')}</select>`:''}<button class="primary" data-sp="responder" data-id="${esc(c.id)}">${icon('check')} ${souDono?'Enviar resposta':'Enviar'}</button>${!souDono&&c.status!=='resolvido'?`<button data-sp="resolvido" data-id="${esc(c.id)}">Marcar como resolvido</button>`:''}</div>`:''}
 <div id="spMsg2" class="caption" style="min-height:20px;margin-top:8px"></div>`)}

document.addEventListener('click',async e=>{const b=e.target.closest('[data-sp],[data-sp-aba],[data-sp-filtro],[data-sp-abrir]');if(!b)return;const d=b.dataset;
 if(d.spAba){st.aba=d.spAba;if(st.aba!=='manual')carregar();render();return}
 if(d.spFiltro){st.filtro=d.spFiltro;render();return}
 if(d.spAbrir){abrir(d.spAbrir);return}
 if(d.sp==='enviar'){const t=$('#spTitulo').value.trim(),ds=$('#spDesc').value.trim(),m=$('#spMsg');if(!t||!ds){m.innerHTML='<span class="red">Informe o assunto e o que aconteceu.</span>';return}b.disabled=true;m.textContent='Enviando…';
  const u=eu(),row={workspace_id:Cloud.ws,id:uid(),criado_por:u.id,email:u.email,nome:(u.user_metadata?.nome||u.email||'').trim(),tipo:$('#spTipo').value,urgencia:$('#spUrg').value,titulo:t,descricao:ds,tela:$('#spTela').value.trim()||null,lido_dono:dono(),lido_autor:true};
  const {error}=await Cloud.client.from('chamados').insert(row);if(error){m.innerHTML=`<span class="red">${esc(error.message)}</span>`;b.disabled=false;return}
  audit('Chamado de suporte aberto',t);toast('Chamado enviado. A resposta aparece em Meus chamados.');st.lista=null;st.aba='meus';carregar();render();return}
 if(d.sp==='responder'||d.sp==='resolvido'){const c=(st.lista||[]).find(x=>x.id===d.id);if(!c)return;const texto=($('#spResp')?.value||'').trim(),souDono=dono();
  if(d.sp==='responder'&&!texto&&!(souDono&&$('#spSit')?.value!==c.status)){$('#spMsg2').innerHTML='<span class="red">Escreva a mensagem.</span>';return}
  const u=eu(),respostas=[...(c.respostas||[]),...(texto?[{de:souDono?'dono':'autor',nome:(u.user_metadata?.nome||u.email||'').trim(),texto,em:new Date().toISOString()}]:[])];
  const status=d.sp==='resolvido'?'resolvido':souDono?$('#spSit').value:(c.status==='aguardando'?'aberto':c.status);
  const upd={respostas,status,updated_at:new Date().toISOString(),...(souDono?{lido_autor:c.criado_por===u.id}:{lido_dono:false})};
  const {error}=await Cloud.client.from('chamados').update(upd).eq('workspace_id',Cloud.ws).eq('id',c.id);if(error){$('#spMsg2').innerHTML=`<span class="red">${esc(error.message)}</span>`;return}
  Object.assign(c,upd);closeModal();toast(souDono?'Resposta enviada.':'Mensagem enviada.');render();return}});
// Chegada de chamados novos (dono) e de respostas (autor): contador no menu, aviso no sino e notificação do navegador.
let vistos=null;setInterval(async()=>{if(!window.Cloud?.ws||!Cloud.client)return;await carregar();const ids=new Set((dono()?pendentesDono():respostasNovas()).map(c=>c.id));
 if(vistos){const novos=[...ids].filter(x=>!vistos.has(x));if(novos.length){const txt=dono()?`${novos.length} chamado(s) de suporte novo(s)`:'Seu chamado de suporte foi respondido';toast(txt);try{if(Notification?.permission==='granted')new Notification('Jarvis · suporte',{body:txt})}catch{}}}vistos=ids},120000);
setTimeout(()=>{if(window.Cloud?.ws)carregar()},4000);
// Guarda a tela de onde a pessoa veio, para preencher o campo "Tela" do chamado.
const nav0=navigate;navigate=function(p){if(p==='suporte'&&page!=='suporte'){const n=navItems.find(x=>x[0]===page);st.origem=n?n[2]:page}return nav0.apply(this,arguments)};
window.Suporte={avisos:()=>{const n=dono()?pendentesDono().length:respostasNovas().length;return n?[[dono()?'warn':'info','help',dono()?`${n} chamado(s) de suporte para responder`:`${n} chamado(s) com resposta nova`,'Manual e suporte','suporte']]:[]},abrir:aba=>{st.aba=aba||'manual';navigate('suporte')}};
Object.assign(paths,{help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01'});
addPage('suporte','help','Manual e suporte',view,'Manual completo do sistema e chamados de suporte: abra, acompanhe e receba as respostas aqui.','',()=>{});
})();
