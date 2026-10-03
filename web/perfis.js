'use strict';
// Perfis de acesso: o banco já bloqueia leitura/gravação por área (RLS); aqui o menu mostra só o que cada
// perfil usa, e a troca de perfil de quem já está na equipe (só o administrador).
// Permissões por tela: o administrador pode liberar, pessoa a pessoa, cada menu e submenu (workspace_members.paginas).
(()=>{
window.PERFIS=[['member','Equipe completa'],['owner','Administrador'],['financeiro','Financeiro'],['contador','Contabilidade (escritório)'],['atendimento','Atendimento e CRM'],['estoque','Estoque e expedição']];
const MODULOS={owner:null,member:null,
 financeiro:['ini','atd','ven','est','fin','crm','cad','res','pre','rel'],
 contador:['ini','fin','cad','res','rel'],
 atendimento:['ini','atd','ven','crm','est'],
 estoque:['ini','atd','est','ven']};
// Áreas de dados que cada módulo lê (para avisar quando uma tela liberada fica fora do que o perfil pode ver no banco).
const AREA={ini:null,atd:'vendas',ven:'vendas',est:'estoque',fin:'financeiro',fis:'contabil',cx:null,crm:'vendas',cad:'config',res:'contabil',pre:'precos',pes:'financeiro',rel:'financeiro',ger:null};
const LE={owner:null,member:null,financeiro:['financeiro','contabil','vendas','precos','config','estoque'],contador:['contabil','config','financeiro','vendas','precos','estoque'],atendimento:['vendas','estoque','precos','config'],estoque:['estoque','vendas','precos','config']};
const SEMPRE=['suporte','mapa','central','bolso','resumo'];// ajuda fica sempre disponível
const INICIO={contador:'parametros',atendimento:'atendimento',estoque:'estoque'};
const papel=()=>window.Cloud?.role||'owner';
const lista=()=>papel()==='owner'?null:(Array.isArray(window.Cloud?.paginas)?window.Cloud.paginas:null);
const menu=()=>window.ERP_MENU||{MODS:[],GERAL:[]};
function moduloDe(id){return menu().MODS.find(m=>m.grupos.some(([,l])=>l.includes(id)))?.id||(menu().GERAL.includes(id)?'ger':null)}
function paginaVisivel(id){if(SEMPRE.includes(id))return true;const l=lista();if(l)return l.includes(id);return true}
function moduloVisivel(mid){const l=lista();if(l){const m=menu().MODS.find(x=>x.id===mid);return !!m&&m.grupos.some(([,ids])=>ids.some(i=>l.includes(i)))}const p=MODULOS[papel()];return !p||p.includes(mid)}
function inicio(){const l=lista();if(l){const pref=INICIO[papel()]||'resumo';return l.includes(pref)?pref:(l.find(i=>moduloDe(i))||'suporte')}return INICIO[papel()]||'resumo'}
// Telas que o perfil vê por padrão (sem lista personalizada).
function padrao(role){const p=MODULOS[role];return menu().MODS.filter(m=>!p||p.includes(m.id)).flatMap(m=>m.grupos.flatMap(([,l])=>l)).concat(role==='owner'?menu().GERAL:menu().GERAL.filter(g=>!['equipe','auditoria','integracoes'].includes(g)))}
window.Perfis={moduloVisivel,paginaVisivel,inicio,padrao,nome:()=>window.PERFIS.find(p=>p[0]===papel())?.[1]||papel()};

// ─────────── Janela de permissões (Equipe e acessos › Telas) ───────────
const titulo=id=>(typeof navItems!=='undefined'&&navItems.find(n=>n[0]===id)?.[2])||id;
let edit=null;
async function abrirPermissoes(uid,email,role){let atual=null;try{const {data}=await Cloud.client.rpc('list_paginas',{ws:Cloud.ws});atual=(data||[]).find(r=>r.user_id===uid)?.paginas||null}catch{}
 edit={uid,email,role,sel:new Set(atual||padrao(role)),personalizado:!!atual};desenhar()}
function desenhar(){if(!edit)return;const {MODS,GERAL}=menu(),le=LE[edit.role],fora=mid=>{const a=AREA[mid];return !!(le&&a&&!le.includes(a))};
 const grupoHtml=(mid,t,ids)=>{ids=ids.filter(i=>typeof navItems==='undefined'||navItems.some(n=>n[0]===i));if(!ids.length)return '';const n=ids.filter(i=>edit.sel.has(i)).length;
  return `<div class="pm-grupo"><label class="pm-sub"><input type="checkbox" class="check" data-pm-grupo="${esc(ids.join(','))}" ${n===ids.length?'checked':''} ${n&&n<ids.length?'data-meio="1"':''}> ${esc(t)}</label><div class="pm-telas">${ids.map(i=>`<label class="pm-tela ${edit.sel.has(i)?'on':''}"><input type="checkbox" class="check" data-pm-tela="${esc(i)}" ${edit.sel.has(i)?'checked':''}> ${esc(titulo(i))}</label>`).join('')}</div></div>`};
 const modHtml=m=>{const ids=m.grupos.flatMap(([,l])=>l).filter(i=>typeof navItems==='undefined'||navItems.some(n=>n[0]===i));if(!ids.length)return '';const n=ids.filter(i=>edit.sel.has(i)).length;
  return `<section class="pm-mod ${n?'tem':''}"><div class="pm-head"><label><input type="checkbox" class="check" data-pm-grupo="${esc(ids.join(','))}" ${n===ids.length?'checked':''} ${n&&n<ids.length?'data-meio="1"':''}> <strong>${esc(m.t)}</strong></label><span class="caption">${n}/${ids.length}${fora(m.id)&&n?' · <span class="gold" title="O perfil desta pessoa não lê estes dados no banco: a tela abre, mas pode ficar vazia. Troque o perfil se ela precisar dos dados.">fora do perfil</span>':''}</span></div>${m.grupos.map(([t,l])=>grupoHtml(m.id,t,l)).join('')}</section>`};
 const total=edit.sel.size;
 modal(`Telas liberadas · ${esc(edit.email)}`,`<p class="caption">Marque os menus e submenus que ${esc(edit.email.split('@')[0])} pode ver. Perfil: <strong>${esc(window.PERFIS.find(p=>p[0]===edit.role)?.[1]||edit.role)}</strong> — ele continua definindo quais dados o banco libera; aqui você escolhe as telas. ${edit.personalizado?'<span class="badge info">personalizado</span>':'<span class="badge">padrão do perfil</span>'}</p>
 <div class="row wrap" style="gap:8px;margin:10px 0 14px"><input type="search" id="pmBusca" placeholder="Buscar tela…" style="min-width:220px;flex:1"><button class="small" data-pm="tudo">Marcar tudo</button><button class="small" data-pm="nada">Desmarcar tudo</button><button class="small quiet" data-pm="padrao">Voltar ao padrão do perfil</button></div>
 <div class="pm-arvore">${MODS.map(modHtml).join('')}${modHtml({id:'ger',t:'Menu do usuário (conta, integrações, auditoria…)',grupos:[['Geral',GERAL]]})}</div>
 <div class="modalfoot"><span class="caption" style="margin-right:auto">${total} tela(s) marcada(s) · Ajuda e manual ficam sempre disponíveis.</span><button class="quiet" data-pm="cancelar">Cancelar</button><button class="primary" data-pm="salvar">Salvar permissões</button></div>`);
 document.querySelectorAll('[data-meio]').forEach(c=>c.indeterminate=true);
 const b=document.getElementById('pmBusca');if(b){b.value=edit.busca||'';b.oninput=()=>{edit.busca=b.value;filtrar()};filtrar();if(edit.busca){b.focus()}}}
function filtrar(){const q=normalized(edit.busca||'');document.querySelectorAll('.pm-tela').forEach(l=>{l.hidden=!!q&&!normalized(l.textContent).includes(q)});document.querySelectorAll('.pm-grupo').forEach(g=>{g.hidden=!!q&&![...g.querySelectorAll('.pm-tela')].some(l=>!l.hidden)});document.querySelectorAll('.pm-mod').forEach(m=>{m.hidden=!!q&&![...m.querySelectorAll('.pm-grupo')].some(g=>!g.hidden)})}
document.addEventListener('change',e=>{if(!edit)return;const t=e.target;
 if(t.dataset.pmTela){t.checked?edit.sel.add(t.dataset.pmTela):edit.sel.delete(t.dataset.pmTela);edit.personalizado=true;desenhar();return}
 if(t.dataset.pmGrupo){for(const i of t.dataset.pmGrupo.split(','))t.checked?edit.sel.add(i):edit.sel.delete(i);edit.personalizado=true;desenhar()}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-pm],[data-acc-telas]');if(!b)return;
 if(b.dataset.accTelas){abrirPermissoes(b.dataset.accTelas,b.dataset.email||'',b.dataset.role||'member');return}
 const k=b.dataset.pm,{MODS,GERAL}=menu();
 if(k==='tudo'){MODS.forEach(m=>m.grupos.forEach(([,l])=>l.forEach(i=>edit.sel.add(i))));GERAL.forEach(i=>edit.sel.add(i));edit.personalizado=true;desenhar();return}
 if(k==='nada'){edit.sel.clear();edit.personalizado=true;desenhar();return}
 if(k==='padrao'){edit.sel=new Set(padrao(edit.role));edit.personalizado=false;desenhar();return}
 if(k==='cancelar'){edit=null;closeModal();return}
 if(k==='salvar'){if(edit.personalizado&&!edit.sel.size){toast('Marque ao menos uma tela.');return}b.disabled=true;
  const {data,error}=await Cloud.client.rpc('set_paginas',{ws:Cloud.ws,uid:edit.uid,paginas:edit.personalizado?[...edit.sel]:null});
  b.disabled=false;if(error){toast(error.message);return}toast(data);edit=null;closeModal();window.EquipeTelas?.recarregar();render()}});
document.addEventListener('change',async e=>{const s=e.target.closest('[data-acc-perfil]');if(!s)return;const uid=s.dataset.accPerfil;
 if(!confirm(`Trocar o perfil para "${s.selectedOptions[0].textContent}"?`)){render();return}
 const {data,error}=await Cloud.client.rpc('set_role',{ws:Cloud.ws,uid,papel:s.value});toast(error?error.message:data);render()});
})();
