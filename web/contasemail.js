'use strict';
// Contas a pagar › Boletos por e-mail: o endereço da empresa (boletos-<token>@…), quem pode enviar e o que chegou.
// O boleto (anexo PDF ou linha digitável no corpo) vira título em ABERTO aguardando aprovação (contas-email no servidor).
(()=>{
const st={info:null,carregando:false};
const dh=d=>d?new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
async function carregar(){st.carregando=true;try{st.info=await Integrations.callFn('integrations',{action:'contas_email_info'})}catch(e){st.info={erro:e.message||String(e)}}finally{st.carregando=false}}
async function gravar(mud){const {error}=await Cloud.client.from('caixas_email').update(mud).eq('workspace_id',Cloud.ws);if(error)throw error;Object.assign(st.info.caixa,mud)}
function corpo(){const i=st.info;if(!i)return '<div class="empty">Carregando…</div>';if(i.erro)return `<div class="notice warnbox">${esc(i.erro)}</div>`;const cx=i.caixa||{};
 return `<p class="caption" style="margin-top:-8px">Encaminhe (ou peça ao fornecedor para enviar) o e-mail com o boleto em PDF. O Jarvis lê a linha digitável — banco, valor e vencimento — e cria a conta <strong>aguardando aprovação</strong>. Nada é pago sem o seu clique.</p>
 ${i.configurado&&i.endereco?`<div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><strong style="font-size:16px">${esc(i.endereco)}</strong><button class="small" data-cx-copiar="${esc(i.endereco)}">${icon('copy')} Copiar</button>${cx.ativo?'<span class="badge ok">Recebendo</span>':'<span class="badge">Desligado</span>'}</div>`:`<div class="notice">A caixa de boletos está pronta no Jarvis; falta ligar o recebimento no Resend (domínio de recebimento, webhook e chave de leitura). ${i.endereco?`Endereço reservado: <strong>${esc(i.endereco)}</strong>.`:''}</div>`}
 <div class="navlabel" style="margin:14px 0 6px">Quem pode enviar</div>
 <label class="check-l"><input type="checkbox" class="check" data-cx-qualquer ${cx.qualquer_remetente?'checked':''}> Aceitar de qualquer remetente (ex.: fornecedores mandando direto)</label>
 <div class="row" style="gap:6px;flex-wrap:wrap;margin:6px 0">${(cx.remetentes||[]).map(r=>`<span class="badge info">${esc(r)} <button class="small quiet" data-cx-tirar="${esc(r)}" aria-label="Tirar ${esc(r)}">${icon('x')}</button></span>`).join('')||'<span class="caption">Ninguém na lista.</span>'}</div>
 <div class="row" style="gap:6px"><input id="cxNovo" type="email" placeholder="e-mail que encaminha boletos" style="flex:1"><button class="small" data-cx-add>${icon('plus')} Autorizar</button></div>
 <label class="check-l" style="margin-top:8px"><input type="checkbox" class="check" data-cx-ativo ${cx.ativo?'checked':''}> Caixa ligada</label>
 <div class="navlabel" style="margin:14px 0 6px">Últimos e-mails recebidos</div>
 <div class="tablewrap" style="max-height:240px"><table><thead><tr><th>Quando</th><th>De · assunto</th><th>Resultado</th></tr></thead><tbody>${(i.log||[]).map(l=>`<tr><td class="caption">${dh(l.recebido_em)}</td><td>${esc(l.de||'')}<br><span class="caption">${esc(l.assunto||'')}</span></td><td class="caption">${l.criados?`<span class="badge ok">${l.criados} conta(s) criada(s)</span> `:''}${(l.resultado||[]).map(r=>esc(r.titulo?`${money(r.valor)} · venc. ${r.vencimento?r.vencimento.split('-').reverse().join('/'):'?'} · ${r.fornecedor||''}`:r.motivo||'')).join('<br>')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Nenhum e-mail recebido ainda.</td></tr>'}</tbody></table></div>
 <div class="modalfoot"><button data-action="close">Fechar</button></div>`}
async function abrir(){modal('Boletos por e-mail',corpo());await carregar();if(document.querySelector('.modalback'))modal('Boletos por e-mail',corpo())}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-ce-abrir-caixa],[data-cx-copiar],[data-cx-add],[data-cx-tirar]');if(!b)return;
 if(b.dataset.ceAbrirCaixa!=null){abrir();return}
 if(b.dataset.cxCopiar){try{await navigator.clipboard.writeText(b.dataset.cxCopiar);toast('Endereço copiado.')}catch{toast(b.dataset.cxCopiar)}return}
 try{const cx=st.info?.caixa;if(!cx)return;
  if(b.dataset.cxAdd!=null){const v=String($('#cxNovo')?.value||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return toast('Informe um e-mail válido.');await gravar({remetentes:[...new Set([...(cx.remetentes||[]),v])]});audit('Boletos por e-mail: remetente autorizado',v)}
  else if(b.dataset.cxTirar){await gravar({remetentes:(cx.remetentes||[]).filter(r=>r!==b.dataset.cxTirar)});audit('Boletos por e-mail: remetente removido',b.dataset.cxTirar)}
  modal('Boletos por e-mail',corpo())}catch(x){toast(x.message||String(x))}});
document.addEventListener('change',async e=>{const x=e.target;if(!x.matches?.('[data-cx-qualquer],[data-cx-ativo]')||!st.info?.caixa)return;
 try{const mud=x.matches('[data-cx-qualquer]')?{qualquer_remetente:x.checked}:{ativo:x.checked};await gravar(mud);audit('Boletos por e-mail',JSON.stringify(mud));toast('Salvo.')}catch(er){toast(er.message||String(er));x.checked=!x.checked}});
window.ContasEmail={abrir};
})();
