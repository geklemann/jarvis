'use strict';
// Relatórios › Alertas e relatórios: quem recebe os avisos por e-mail e WhatsApp, quais avisos, o relatório semanal
// da diretoria (prévia, planilha e envio) e o registro do que foi enviado. Só o dono cadastra e envia; os demais veem.
// Os canais funcionam depois que as chaves forem gravadas no servidor (RESEND_API_KEY; WHATSAPP_TOKEN e WHATSAPP_PHONE_ID).
(()=>{
const TIPOS=[['nfe','NF-e rejeitada'],['atendimento','Reclamação urgente'],['ruptura','Produto sem estoque'],['venc','Contas que vencem hoje'],['venc_amanha','Contas que vencem amanhã'],['repasse','Repasse atrasado ou abaixo do previsto'],['aprov','Pagamento para aprovar'],['semanal','Relatório semanal da diretoria']];
const nomeTipo=t=>(TIPOS.find(x=>x[0]===t)||[t,t])[1];
const st={carregado:false,carregando:false,destinos:[],envios:[],canais:null,erro:'',rel:null,relCarregando:false};
const dono=()=>window.Cloud?.role==='owner';
const R=v=>typeof money==='function'?money(v):String(v);

async function carregar(forca){if(st.carregando||(!forca&&st.carregado)||!window.Cloud?.ws)return;st.carregando=true;st.erro='';
 try{const c=Cloud.client,ws=Cloud.ws;const [d,e,k]=await Promise.all([c.from('alertas_destinos').select('*').eq('workspace_id',ws).order('created_at'),c.from('alertas_envios').select('*').eq('workspace_id',ws).order('enviado_em',{ascending:false}).limit(30),Integrations.callFn('integrations',{action:'alertas_canais'}).catch(()=>null)]);
  if(d.error)throw d.error;st.destinos=d.data||[];st.envios=e.data||[];st.canais=k;st.carregado=true}
 catch(x){st.erro=x.message||String(x)}finally{st.carregando=false;if(page==='alertasrel')render()}}

function view(){if(!window.Cloud?.ws)return `<div class="notice">Conecte a nuvem para enviar alertas por e-mail e WhatsApp.</div>`;
 if(!st.carregado){carregar();return `<div class="empty">Carregando…</div>`}
 const k=st.canais||{},selo=(ok,n)=>`<span class="badge ${ok?'ok':'warn'}">${n}: ${ok?'conectado':'falta conectar'}</span>`;
 const falta=!k.email||!k.whatsapp;
 return `${st.erro?`<div class="notice warnbox">${esc(st.erro)}</div>`:''}
 <div class="notice"><strong>Os mesmos avisos do celular, também por e-mail e WhatsApp.</strong> Cada pessoa escolhe o que quer receber. O relatório da diretoria chega toda segunda de manhã, com a planilha da semana anexa. <span class="row wrap" style="gap:6px;margin-top:8px">${selo(k.email,'E-mail')}${selo(k.whatsapp,'WhatsApp')}</span>
 ${falta?`<p class="caption" style="margin:8px 0 0">${!k.email?'E-mail: crie a conta no Resend, verifique o domínio jaarvis.com.br e grave a chave RESEND_API_KEY no servidor. ':''}${!k.whatsapp?'WhatsApp: na Meta (WhatsApp Business), aprove um modelo de mensagem e grave WHATSAPP_TOKEN, WHATSAPP_PHONE_ID e WHATSAPP_TEMPLATE. ':''}Até lá os destinos ficam cadastrados e nada é enviado.</p>`:''}</div>
 <div class="grid two" style="align-items:start;margin-top:16px">
  <div class="tablebox"><div class="tabletop"><div><h2>Quem recebe</h2><p class="caption">${st.destinos.length} destino(s)</p></div></div>
   ${st.destinos.length?`<div class="tablewrap"><table><thead><tr><th>Destino</th><th>Avisos</th><th></th></tr></thead><tbody>${st.destinos.map(d=>`<tr><td><strong>${esc(d.nome||d.destino)}</strong><br><span class="caption">${d.canal==='email'?'E-mail':'WhatsApp'} · ${esc(d.destino)}${d.ativo?'':' · pausado'}</span></td>
    <td class="caption">${(d.tipos||[]).map(nomeTipo).map(esc).join(' · ')||'nenhum'}</td>
    <td style="white-space:nowrap">${dono()?`<button class="small" data-ar-teste="${esc(d.id)}">Testar</button> <button class="small" data-ar-pausar="${esc(d.id)}">${d.ativo?'Pausar':'Retomar'}</button> <button class="small quiet" data-ar-remover="${esc(d.id)}" aria-label="Remover ${esc(d.destino)}">Remover</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Ninguém cadastrado ainda.</div>'}
  </div>
  ${dono()?`<form class="formcard" id="arNovo" style="display:grid;gap:10px"><h2 style="margin:0">Novo destino</h2>
   <div class="row wrap" style="gap:10px"><label style="flex:1;min-width:140px">Canal<select name="canal"><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option></select></label>
    <label style="flex:2;min-width:200px">E-mail ou celular com DDD<input name="destino" required placeholder="diretoria@empresa.com.br ou (47) 99999-1234"></label></div>
   <label>Nome (opcional)<input name="nome" placeholder="Ex.: Diretoria"></label>
   <fieldset style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:6px"><legend class="caption" style="padding:0 4px">Avisos</legend>${TIPOS.map(([t,n])=>`<label class="row" style="gap:8px;font-weight:400"><input type="checkbox" name="tipos" value="${t}" checked style="width:auto"> ${n}</label>`).join('')}</fieldset>
   <div class="row" style="justify-content:flex-end"><button class="primary">Cadastrar</button></div></form>`:`<div class="notice">Só o dono do workspace cadastra destinos.</div>`}
 </div>
 <div class="tablebox" style="margin-top:16px"><div class="tabletop"><div><h2>Relatório semanal da diretoria</h2><p class="caption">Semana anterior (segunda a domingo): vendas e tarifas por canal, recebido, repasses a receber e atrasados, contas, caixa, atendimento e ruptura.</p></div>
  <div class="row" style="gap:8px"><button class="small" data-ar-prever>${st.relCarregando?'Montando…':'Ver o relatório'}</button>${st.rel?`<button class="small" data-ar-excel>Baixar Excel</button>`:''}${dono()?`<button class="small primary" data-ar-enviar>Enviar agora</button>`:''}</div></div>
  ${st.rel?`<iframe title="Prévia do relatório semanal" sandbox="" srcdoc="${esc(st.rel.html)}" style="width:100%;height:720px;border:0;border-radius:8px;background:#fff"></iframe>`:'<div class="empty">Clique em "Ver o relatório" para montar a prévia da semana passada.</div>'}
 </div>
 <div class="tablebox" style="margin-top:16px"><div class="tabletop"><h2>Últimos envios</h2></div>
  ${st.envios.length?`<div class="tablewrap"><table><thead><tr><th>Quando</th><th>Destino</th><th>Aviso</th><th>Situação</th></tr></thead><tbody>${st.envios.map(e=>`<tr><td>${new Date(e.enviado_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</td><td>${e.canal==='email'?'E-mail':'WhatsApp'} · ${esc(e.destino)}</td><td>${esc(e.assunto||nomeTipo(e.tipo))}</td><td><span class="badge ${e.status==='enviado'?'ok':e.status==='falhou'?'bad':'warn'}">${e.status==='enviado'?'Enviado':e.status==='falhou'?'Falhou':'Canal não conectado'}</span>${e.erro?`<br><span class="caption">${esc(e.erro)}</span>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhum envio ainda.</div>'}
 </div>`}

async function salvarNovo(f){const fd=new FormData(f),canal=fd.get('canal'),destino=String(fd.get('destino')||'').trim(),tipos=fd.getAll('tipos');
 if(canal==='email'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino))return toast('Informe um e-mail válido.');
 if(canal==='whatsapp'&&destino.replace(/\D/g,'').length<10)return toast('Informe o celular com DDD.');
 const {error}=await Cloud.client.from('alertas_destinos').insert({workspace_id:Cloud.ws,canal,destino:canal==='email'?destino.toLowerCase():destino,nome:String(fd.get('nome')||'').trim()||null,tipos});
 if(error)return toast(/duplicate|unique/i.test(error.message)?'Esse destino já está cadastrado.':error.message);
 toast('Destino cadastrado.');await carregar(true)}

function baixarExcel(){if(!st.rel)return;const b=Uint8Array.from(atob(st.rel.xlsx),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([b],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=st.rel.arquivo||'Jarvis - Resumo da semana.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}

document.addEventListener('submit',async e=>{if(e.target.id!=='arNovo')return;e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await salvarNovo(e.target)}finally{b.disabled=false}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-ar-teste],[data-ar-pausar],[data-ar-remover],[data-ar-prever],[data-ar-excel],[data-ar-enviar]');if(!b)return;e.preventDefault();b.disabled=true;
 try{const d=b.dataset;
  if(d.arTeste){const r=await Integrations.callFn('integrations',{action:'alertas_teste',destino:d.arTeste});toast(r.enviados?'Teste enviado.':r.sem_canal?'Canal ainda não conectado no servidor: o teste ficou registrado, nada foi enviado.':'O teste falhou: veja em Últimos envios.');await carregar(true)}
  else if(d.arPausar){const x=st.destinos.find(y=>y.id===d.arPausar);const {error}=await Cloud.client.from('alertas_destinos').update({ativo:!x.ativo}).eq('id',x.id);if(error)throw error;await carregar(true)}
  else if(d.arRemover){if(b.dataset.confirmar!=='1'){b.dataset.confirmar='1';b.textContent='Confirmar remoção';b.disabled=false;return}
   const {error}=await Cloud.client.from('alertas_destinos').delete().eq('id',d.arRemover);if(error)throw error;toast('Destino removido.');await carregar(true)}
  else if(d.arPrever!==undefined){st.relCarregando=true;render();try{st.rel=await Integrations.callFn('integrations',{action:'relatorio_semanal'})}finally{st.relCarregando=false}render()}
  else if(d.arExcel!==undefined)baixarExcel();
  else if(d.arEnviar!==undefined){const r=await Integrations.callFn('integrations',{action:'relatorio_semanal_enviar'});toast(r.enviados?`Relatório enviado para ${r.enviados} destino(s).`:r.sem_canal?'Canal ainda não conectado: nada foi enviado.':'Ninguém escolheu receber o relatório semanal.');await carregar(true)}}
 catch(x){toast(x.message||String(x))}finally{b.disabled=false}});

addPage('alertasrel','bell','Alertas e relatórios',view,'Avisos por e-mail e WhatsApp e o relatório semanal da diretoria, com a planilha da semana.','',()=>{});
window.AlertasRel={carregar};
})();
