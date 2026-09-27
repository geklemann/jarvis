'use strict';
// Segurança da conta: verificação em duas etapas (app autenticador, TOTP — o banco passa a exigir o código),
// troca de senha e encerramento automático da sessão por inatividade.
(()=>{
Object.assign(paths,{lock:'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4'});
const ler=k=>{try{return localStorage.getItem(k)}catch{return null}};
async function fatores(){const {data}=await Cloud.client.auth.mfa.listFactors();return (data?.all||data?.totp||[])}
async function abrir(){const f=(await fatores().catch(()=>[])).filter(x=>x.factor_type==='totp'||x.factorType==='totp'||x.factor_type==null);const ativo=f.find(x=>x.status==='verified'),min=Number(ler('eb_inatividade')||240);
 modal('Segurança da conta',`<section class="card"><div class="cardhead"><div><h2>${icon('lock')} Verificação em duas etapas</h2><p class="caption">Além da senha, um código de 6 dígitos do app autenticador do seu celular. Com ela ativa, o próprio banco de dados só libera os dados depois do código.</p></div><span class="badge ${ativo?'ok':'warn'}">${ativo?'Ativa':'Desativada'}</span></div>
 ${ativo?`<p class="caption">Autenticador cadastrado em ${new Date(ativo.created_at).toLocaleDateString('pt-BR')}${ativo.friendly_name?' · '+esc(ativo.friendly_name):''}.</p><button class="small quiet" data-seg="remover" data-fid="${esc(ativo.id)}">Desativar verificação em duas etapas</button>`:`<button class="primary small" data-seg="ativar">${icon('lock')} Ativar com app autenticador</button><div id="segQr"></div>`}</section>
 <section class="card" style="margin-top:12px"><h2>Senha</h2><div class="row wrap" style="margin-top:8px"><input id="segSenha" type="password" autocomplete="new-password" placeholder="Nova senha (mínimo 10 caracteres)" style="flex:1"><button class="small" data-seg="senha">Trocar senha</button></div></section>
 <section class="card" style="margin-top:12px"><h2>Sessão</h2><label for="segMin">Encerrar a sessão depois de</label><select id="segMin">${[[30,'30 minutos'],[60,'1 hora'],[240,'4 horas'],[480,'8 horas'],[0,'nunca']].map(([v,t])=>`<option value="${v}" ${min===v?'selected':''}>${t}</option>`).join('')}</select><span class="caption"> sem uso neste navegador.</span></section>
 <div class="modalfoot"><button data-action="close">Fechar</button></div>`);
 $('#segMin').onchange=e=>{try{localStorage.setItem('eb_inatividade',e.target.value)}catch{}toast('Tempo de sessão ajustado.')}}
document.addEventListener('click',async e=>{if(e.target.closest('[data-erp-seg]')){$('#erpdrop')&&($('#erpdrop').innerHTML='');abrir();return}
 const b=e.target.closest('[data-seg]');if(!b)return;const a=b.dataset.seg;
 try{
  if(a==='ativar'){for(const x of (await fatores()).filter(x=>x.status!=='verified'))await Cloud.client.auth.mfa.unenroll({factorId:x.id}).catch(()=>{});
   const {data,error}=await Cloud.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Jarvis',issuer:'Jarvis'});if(error)throw error;
   $('#segQr').innerHTML=`<div class="segqr"><img src="${data.totp.qr_code}" alt="QR Code para o app autenticador" width="180" height="180"><div><p class="caption">1. No app autenticador, toque em <strong>adicionar</strong> e leia o QR Code (ou digite a chave <span class="mono">${esc(data.totp.secret)}</span>).</p><p class="caption">2. Digite o código de 6 dígitos que aparecer:</p><div class="row"><input id="segCod" inputmode="numeric" maxlength="6" style="width:140px;font-size:20px;letter-spacing:4px;text-align:center"><button class="primary small" data-seg="confirmar" data-fid="${esc(data.id)}">Confirmar</button></div></div></div>`;$('#segCod').focus();return}
  if(a==='confirmar'){const code=$('#segCod').value.replace(/\D/g,'');const {error}=await Cloud.client.auth.mfa.challengeAndVerify({factorId:b.dataset.fid,code});if(error)throw Error('Código inválido. Confira a hora do celular e tente o próximo código.');audit('Segurança','verificação em duas etapas ativada');toast('Verificação em duas etapas ativada.');closeModal();return}
  if(a==='remover'){if(!confirm('Desativar a verificação em duas etapas? A conta fica protegida só pela senha.'))return;const {error}=await Cloud.client.auth.mfa.unenroll({factorId:b.dataset.fid});if(error)throw error;audit('Segurança','verificação em duas etapas desativada');toast('Verificação em duas etapas desativada.');closeModal();return}
  if(a==='senha'){const p=$('#segSenha').value;if(p.length<10)throw Error('Use pelo menos 10 caracteres.');const {error}=await Cloud.client.auth.updateUser({password:p});if(error)throw error;$('#segSenha').value='';audit('Segurança','senha alterada');toast('Senha alterada.');return}
 }catch(x){toast(x.message||String(x))}});
// Encerramento por inatividade (padrão 4 horas).
let ultimo=Date.now();for(const ev of ['mousemove','keydown','click','touchstart','scroll'])addEventListener(ev,()=>{ultimo=Date.now()},{passive:true});
setInterval(()=>{const min=Number(ler('eb_inatividade')||240);if(!min||!window.Cloud?.session)return;if(Date.now()-ultimo>min*60000){toast('Sessão encerrada por inatividade.');Cloud.client.auth.signOut()}},60000);
})();
