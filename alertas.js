'use strict';
// Alertas no celular (Web Push): ativa neste aparelho, testa e desativa. O servidor manda: NF-e rejeitada, reclamação
// urgente, ruptura de estoque, contas que vencem hoje e pagamentos para aprovar (este só para o dono).
(()=>{
Object.assign(paths,{bell2:'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10 21h4'});
const b64=s=>{const p='='.repeat((4-s.length%4)%4),r=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(r,c=>c.charCodeAt(0))};
const suporta=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const ios=()=>/iphone|ipad/i.test(navigator.userAgent),instalado=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
async function reg(){return navigator.serviceWorker.getRegistration()||navigator.serviceWorker.register('sw.js')}
async function estado(){if(!suporta())return {ok:false};const r=await reg();const s=await r?.pushManager.getSubscription();return {ok:true,ativo:!!s,perm:Notification.permission,sub:s}}
async function ativar(){const key=window.CONCILIA_CONFIG?.vapidPublicKey;if(!key)throw Error('Chave de alertas não configurada.');
 const p=await Notification.requestPermission();if(p!=='granted')throw Error('Permissão de notificação negada. Libere nas configurações do navegador para este site.');
 const r=await reg();await navigator.serviceWorker.ready;const s=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(key)});const j=s.toJSON();
 const {error}=await Cloud.client.from('push_subs').upsert({endpoint:j.endpoint,workspace_id:Cloud.ws,email:Cloud.session?.user?.email||null,chaves:j.keys,aparelho:navigator.userAgent.slice(0,160)},{onConflict:'endpoint'});if(error)throw error;audit('Alertas no celular ativados',navigator.userAgent.slice(0,80))}
async function desativar(){const {sub}=await estado();if(sub){await Cloud.client.from('push_subs').delete().eq('endpoint',sub.endpoint);await sub.unsubscribe()}}
async function abrir(){const e=await estado().catch(()=>({ok:false}));
 modal('Alertas no celular',`<p>Receba no celular (ou no computador), mesmo com o Jarvis fechado:</p><ul class="alertlist"><li><b>NF-e rejeitada</b> pela SEFAZ</li><li><b>Reclamação ou mediação</b> com prazo nas próximas 24 h</li><li><b>Produto sem estoque</b> (ruptura)</li><li><b>Contas que vencem hoje</b> (um aviso de manhã)</li><li><b>Pagamentos para aprovar</b> (só para o dono)</li></ul>
 ${!e.ok?`<div class="notice warnbox">${ios()&&!instalado()?'No iPhone, primeiro instale o Jarvis: no Safari toque em Compartilhar › <b>Adicionar à Tela de Início</b>, abra pelo ícone e ative aqui.':'Este navegador não recebe notificações. Use Chrome, Edge ou Safari atualizado.'}</div>`:e.ativo?'<div class="notice"><b>Ativo neste aparelho.</b> Os alertas chegam a cada ~15 minutos quando houver novidade.</div>':e.perm==='denied'?'<div class="notice warnbox">As notificações estão bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço) e tente de novo.</div>':''}
 <p class="caption">Ative em cada aparelho que quiser receber. No iPhone é preciso instalar o Jarvis na Tela de Início (iOS 16.4 ou mais novo).</p>
 <div class="modalfoot"><button data-action="close">Fechar</button>${e.ok?(e.ativo?`<button data-al="desativar">Desativar aqui</button><button class="primary" data-al="teste">Enviar alerta de teste</button>`:`<button class="primary" data-al="ativar" ${e.perm==='denied'?'disabled':''}>${icon('bell2')} Ativar neste aparelho</button>`):''}</div>`)}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-al]');if(!b)return;b.disabled=true;
 try{if(b.dataset.al==='abrir'){abrir();return}
  if(b.dataset.al==='ativar'){await ativar();toast('Alertas ativados neste aparelho.');closeModal();abrir();return}
  if(b.dataset.al==='desativar'){await desativar();toast('Alertas desativados neste aparelho.');closeModal();abrir();return}
  if(b.dataset.al==='teste'){const r=await Cloud.client.functions.invoke('integrations',{body:{workspace_id:Cloud.ws,action:'push_teste'}});if(r.error)throw Error(r.error.message);toast(r.data?.enviados?'Alerta de teste enviado. Deve chegar em segundos.':'Nenhum aparelho recebeu. Tente desativar e ativar de novo.')}}
 catch(x){toast(x.message||String(x))}finally{b.disabled=false}});
window.Alertas={abrir};
})();
