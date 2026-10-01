'use strict';
// Aparência (temas de cor + modo claro/escuro, por usuário) e Log e auditoria (trilha completa gravada
// pelo banco: cada inclusão, alteração e exclusão, com quem fez, quando e o antes/depois).
(()=>{
// ─────────────── Aparência ───────────────
// Visual único: Studio (body.fiori), com 3 variações leves só de tom e cor (classe st-<id>). Escolhas antigas
// (Aurora, vidro, clássico, "fiori") caem no Studio padrão.
const STUDIO=[['studio','Studio','Azul, preciso e sóbrio','#2f5bd9','#15171c','#f6f7f9'],['esmeralda','Esmeralda','Verde profundo, calmo','#0f7a5f','#12201b','#f4f7f6'],
 ['indigo','Índigo','Violeta discreto','#5b45e0','#17152a','#f6f5fa'],['terracota','Terracota','Tom quente, cobre e areia','#b8471b','#231915','#f8f6f3']];
const ler=k=>{try{return localStorage.getItem(k)}catch{return null}};
const valido=t=>STUDIO.some(x=>x[0]===t)?t:'studio';
function temaAtual(){const m=window.Cloud?.session?.user?.user_metadata||{};return valido(m.tema2||ler('eb_tema2'))}
// Modo claro/noite também é do usuário (antes era da empresa e mudava ao entrar). Sem escolha própria, vale o da empresa.
const modoValido=m=>m==='light'||m==='dark'?m:null;
function modoUsuario(){const m=window.Cloud?.session?.user?.user_metadata||{};return modoValido(m.modo)||modoValido(ler('eb_modo'))}
const gravar=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
function aplicarModo(){const m=modoUsuario();if(m&&db.theme!==m)db.theme=m;document.body.classList.toggle('light',db.theme==='light')}
function aplicar(t){t=valido(t);const b=document.body;b.classList.add('fiori');b.classList.remove('vidro');
 for(const c of [...b.classList])if(/^(vd|tema)-/.test(c))b.classList.remove(c);
 for(const [id] of STUDIO)b.classList.toggle('st-'+id,id===t&&id!=='studio');
 document.querySelector('meta[name=theme-color]')?.setAttribute('content',b.classList.contains('light')?'#ffffff':'#13161c')}
aplicarModo();aplicar(ler('eb_tema2'));
// Ao entrar (ou trocar de usuário), aplica as escolhas da conta e guarda neste navegador para a próxima abertura.
let temaSessao=null;setInterval(()=>{const md=window.Cloud?.session?.user?.user_metadata||{};if(md.tema2&&ler('eb_tema2')!==md.tema2)gravar('eb_tema2',md.tema2);if(modoValido(md.modo)&&ler('eb_modo')!==md.modo)gravar('eb_modo',md.modo);
 aplicarModo();const t=temaAtual()+'|'+db.theme;if(t!==temaSessao){temaSessao=t;aplicar(temaAtual())}},500);
async function salvarConta(dados){if(window.Cloud?.session?.user)Cloud.session.user.user_metadata={...(Cloud.session.user.user_metadata||{}),...dados};
 if(window.Cloud?.client&&Cloud.session){const {data}=await Cloud.client.auth.updateUser({data:dados}).catch(()=>({}));if(data?.user)Cloud.session.user=data.user}}
function escolherModo(m){m=modoValido(m)||'dark';db.theme=m;gravar('eb_modo',m);document.body.classList.toggle('light',m==='light');save();aplicar(temaAtual());salvarConta({modo:m})}
async function escolher(t){t=valido(t);try{localStorage.setItem('eb_tema2',t)}catch{}
 const dados={tema2:t};if(window.Cloud?.session?.user)Cloud.session.user.user_metadata={...(Cloud.session.user.user_metadata||{}),...dados};aplicar(t);
 if(window.Cloud?.client&&Cloud.session){const {data}=await Cloud.client.auth.updateUser({data:dados}).catch(()=>({}));if(data?.user)Cloud.session.user=data.user}}
function aparencia(){const t=temaAtual(),claro=db.theme==='light';
 modal('Aparência',`<p class="caption" style="margin-top:-10px">A cor e o modo claro/noite valem para o seu usuário, em qualquer computador — cada pessoa da equipe tem a sua escolha.</p>
 <div class="navlabel" style="margin:6px 0 10px">Cor</div>
 <div class="vdgrid">${STUDIO.map(([id,nome,desc,c1,c2,c3])=>`<button class="vdcard ${t===id?'on':''}" data-tema="${id}" style="--c1:${c1};--c2:${c2};--c3:${c3};--c0:#ffffff"><i></i><strong>${nome}</strong><small>${desc}</small></button>`).join('')}</div>
 <div class="navlabel" style="margin:20px 0 8px">Modo</div><div class="segtabs"><button class="${claro?'':'active'}" data-modo="dark">${icon('moon')} Noite</button><button class="${claro?'active':''}" data-modo="light">${icon('sun')} Claro</button></div>
 <div class="modalfoot"><button class="primary" data-action="close">${icon('check')} Pronto</button></div>`)}
document.addEventListener('click',e=>{if(e.target.closest('[data-erp-tema]')){$('#erpdrop')&&($('#erpdrop').innerHTML='');aparencia();return}
 const b=e.target.closest('[data-tema]');if(b){escolher(b.dataset.tema);$$('.vdcard,.temacard').forEach(x=>x.classList.toggle('on',x===b));return}
 const m=e.target.closest('[data-modo]');if(m){escolherModo(m.dataset.modo);$$('[data-modo]').forEach(x=>x.classList.toggle('active',x===m))}});
window.Aparencia={abrir:aparencia,modoUsuario,alternarModo(){escolherModo(db.theme==='light'?'dark':'light')}};

// ─────────────── Log e auditoria ───────────────
const AREAS={payables:'Contas a pagar',bank_accounts:'Contas bancárias',bank_transactions:'Extrato bancário',cadastros:'Cadastros',closures:'Fechamentos',workspace_settings:'Configurações',crm_contacts:'CRM',workspace_members:'Equipe',access_requests:'Pedidos de acesso',accounting_lines:'Contabilidade (linhas)',account_map:'Plano de contas (mapa)',accounting_docs:'Contabilidade (documentos)',pricing_products:'Preços (produtos)',pricing_scenarios:'Preços (cenários)',atendimentos:'Atendimento',imports:'Importações',orders:'Pedidos',receipts:'Liberações/repasses',ledger:'Vínculos',integrations:'Integrações',purchase_invoices:'Notas de entrada'};
const OPS={inclusao:['Inclusão','ok'],alteracao:['Alteração','info'],exclusao:['Exclusão','bad']};
const CAMPOS={theme:'modo claro/escuro',status:'situação',valor:'valor',valor_pago:'valor pago',vencimento:'vencimento',pago_em:'pago em',categoria:'categoria',centro_custo:'centro de custo',fornecedor:'fornecedor',descricao:'descrição',vinculo:'vínculo',linked_order:'pedido vinculado',observacao:'observação',dados:'dados',etapa_interna:'etapa',responsavel:'responsável',notas:'notas',role:'papel',saldo_inicial:'saldo inicial',data_saldo_inicial:'data do saldo inicial',ativo:'ativo',data:'data'};
const ui={aba:'dados',periodo:'30',area:'',op:'',usuario:'',busca:'',pag:0,linhas:[],total:0,carregando:false,erro:'',chave:''};
window.Reiniciar?.registrar(ui,['aba','periodo','area','op','usuario','busca','pag']); // estado de tela: volta ao original ao clicar no menu
const POR_PAG=100;
const fmtV=v=>v==null?'—':typeof v==='object'?JSON.stringify(v).slice(0,120):String(v).slice(0,120);
// Campos compostos (JSON): mostra só o caminho que mudou (ex.: dados.nome, theme).
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
function difs(a,b,pre=''){if(obj(a)&&obj(b)){const out=[];for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(JSON.stringify(a[k])!==JSON.stringify(b[k]))out.push(...difs(a[k],b[k],pre?pre+'.'+k:k));return out}return [[pre,a,b]]}
const mudancas=r=>Object.entries(r.campos||{}).flatMap(([k,[a,b]])=>difs(a,b,k));
const nomeCampo=k=>k.split('.').map(p=>CAMPOS[p]||p.replace(/_/g,' ')).join(' › ');
function resumo(r){if(r.operacao!=='alteracao'){const c=r.campos||{};return [c.fornecedor,c.descricao,c.nome,c.dados?.nome,c.produto,c.action,c.email,c.valor!=null?money(Number(c.valor)):''].filter(Boolean).slice(0,3).join(' · ')||''}
 const m=mudancas(r);return m.slice(0,4).map(([k,a,b])=>`${nomeCampo(k)}: ${fmtV(a)} → ${fmtV(b)}`).join(' ; ')+(m.length>4?` (+${m.length-4})`:'')}
async function buscar(){if(!window.Cloud?.ws)return;const chave=JSON.stringify([ui.periodo,ui.area,ui.op,ui.usuario,ui.busca,ui.pag,Cloud.ws]);if(chave===ui.chave||ui.carregando)return;ui.carregando=true;ui.chave=chave;
 try{let q=Cloud.client.from('audit_trail').select('*',{count:'exact'}).eq('workspace_id',Cloud.ws).order('em',{ascending:false}).range(ui.pag*POR_PAG,ui.pag*POR_PAG+POR_PAG-1);
  if(ui.periodo!=='tudo')q=q.gte('em',new Date(Date.now()-Number(ui.periodo)*864e5).toISOString());if(ui.area)q=q.eq('tabela',ui.area);if(ui.op)q=q.eq('operacao',ui.op);
  if(ui.usuario==='__sistema')q=q.eq('origem','sistema');else if(ui.usuario)q=q.eq('email',ui.usuario);if(ui.busca.trim())q=q.or(`registro.ilike.%${ui.busca.trim().replace(/[%,()]/g,'')}%,email.ilike.%${ui.busca.trim().replace(/[%,()]/g,'')}%`);
  const {data,error,count}=await q;if(error)throw error;ui.linhas=data||[];ui.total=count||0;ui.erro=''}catch(e){ui.erro=e.message||String(e)}finally{ui.carregando=false}if(page==='auditoria'){const foco=document.activeElement?.id;render();if(foco==='audBusca'){const n=$('#audBusca');n.focus();n.setSelectionRange(n.value.length,n.value.length)}}}
let usuarios=[];async function carregarUsuarios(){if(usuarios.length||!window.Cloud?.ws)return;const {data}=await Cloud.client.from('audit_trail').select('email').eq('workspace_id',Cloud.ws).not('email','is',null).order('em',{ascending:false}).limit(1000);usuarios=[...new Set((data||[]).map(x=>x.email))];if(page==='auditoria')render()}
function view(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver a auditoria.</div>';
 const abas=`<div class="segtabs" style="margin-bottom:14px"><button class="${ui.aba==='dados'?'active':''}" data-aud-aba="dados">Alterações de dados</button><button class="${ui.aba==='eventos'?'active':''}" data-aud-aba="eventos">Eventos do sistema</button></div>`;
 if(ui.aba==='eventos')return abas+eventos();
 buscar();carregarUsuarios();
 const sel=(k,opts,rot)=>`<select data-aud="${k}" aria-label="${rot}">${opts.map(([v,t])=>`<option value="${esc(v)}" ${ui[k]===v?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
 return `${abas}<div class="notice">Gravado pelo próprio banco de dados, sem depender da tela: <strong>ninguém consegue editar ou apagar esta trilha</strong>. Pedidos e liberações que chegam pela sincronização aparecem só quando alguém da equipe os altera.</div>
 <div class="crmbar">${sel('periodo',[['1','Hoje'],['7','7 dias'],['30','30 dias'],['90','90 dias'],['tudo','Tudo']],'Período')}${sel('area',[['','Todas as áreas'],...Object.entries(AREAS).sort((a,b)=>a[1].localeCompare(b[1]))],'Área')}${sel('op',[['','Todas as operações'],['inclusao','Inclusões'],['alteracao','Alterações'],['exclusao','Exclusões']],'Operação')}${sel('usuario',[['','Todos os usuários'],['__sistema','Sistema (rotinas)'],...usuarios.map(u=>[u,u])],'Usuário')}
  <div class="searchin">${icon('search')}<input type="search" id="audBusca" placeholder="Código do registro ou e-mail…" value="${esc(ui.busca)}"></div><button class="small" data-aud-csv="1">${icon('download')} Exportar</button></div>
 ${ui.erro?`<div class="notice warnbox">${esc(ui.erro)}</div>`:''}
 <div class="tablebox"><div class="tabletop"><div><h2>${ui.carregando&&!ui.linhas.length?'Carregando…':`${ui.total.toLocaleString('pt-BR')} registro(s)`}</h2><p class="caption">Clique numa linha para ver o antes e o depois de cada campo.</p></div>
  <div class="row"><button class="small" data-aud-pag="-1" ${ui.pag?'':'disabled'}>‹</button><span class="caption">página ${ui.pag+1} de ${Math.max(1,Math.ceil(ui.total/POR_PAG))}</span><button class="small" data-aud-pag="1" ${(ui.pag+1)*POR_PAG<ui.total?'':'disabled'}>›</button><button class="small" data-aud-atualizar="1">${icon('refresh')} Atualizar</button></div></div>
 <div class="tablewrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Área</th><th>Operação</th><th>Registro</th><th>O que mudou</th></tr></thead><tbody>
 ${ui.linhas.map((r,i)=>{const [o,t]=OPS[r.operacao]||[r.operacao,''];return `<tr class="clickrow" data-aud-ver="${i}"><td>${new Date(r.em).toLocaleString('pt-BR')}</td><td>${esc(r.email||(r.origem==='sistema'?'Sistema':'—'))}</td><td>${esc(AREAS[r.tabela]||r.tabela)}</td><td><span class="badge ${t}">${o}</span></td><td>${esc(String(r.registro||'').slice(0,40))}</td><td class="audres">${esc(resumo(r))}</td></tr>`}).join('')||`<tr><td colspan="6" class="empty">${ui.carregando?'Carregando…':'Nada registrado com esses filtros.'}</td></tr>`}</tbody></table></div></div>`}
function eventos(){const l=(db.audit||[]).filter(a=>!ui.busca||normalized([a.action,a.detail,a.actor].join(' ')).includes(normalized(ui.busca)));
 return `<div class="crmbar"><div class="searchin">${icon('search')}<input type="search" id="audBusca" placeholder="Importações, sincronizações, vínculos, respostas…" value="${esc(ui.busca)}"></div></div>
 <div class="tablebox"><div class="tabletop"><div><h2>${l.length.toLocaleString('pt-BR')} evento(s)</h2><p class="caption">Importações, sincronizações, vínculos automáticos, fechamentos e respostas enviadas a clientes.</p></div></div><div class="tablewrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Evento</th><th>Detalhe</th></tr></thead><tbody>
 ${l.slice(0,500).map(a=>`<tr><td>${new Date(a.time).toLocaleString('pt-BR')}</td><td>${esc(a.actor||'—')}</td><td>${esc(a.action)}</td><td class="audres">${esc(String(a.detail||'').slice(0,220))}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nenhum evento.</td></tr>'}</tbody></table></div></div>`}
function detalhe(r){const [o]=OPS[r.operacao]||[r.operacao];const c=r.campos||{};
 const linhas=r.operacao==='alteracao'?mudancas(r).map(([k,a,b])=>`<tr><td>${esc(nomeCampo(k))}</td><td class="red">${esc(fmtV(a))}</td><td class="green">${esc(fmtV(b))}</td></tr>`).join(''):Object.entries(c).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>`<tr><td>${esc(CAMPOS[k]||k.replace(/_/g,' '))}</td><td colspan="2">${esc(fmtV(v))}</td></tr>`).join('');
 modal(`${o} · ${AREAS[r.tabela]||r.tabela}`,`<p class="caption">${new Date(r.em).toLocaleString('pt-BR')} · ${esc(r.email||(r.origem==='sistema'?'Sistema (rotina automática)':'—'))} · registro ${esc(r.registro||'—')}</p>
 <div class="tablewrap"><table><thead><tr><th>Campo</th><th>${r.operacao==='alteracao'?'Antes':'Valor'}</th><th>${r.operacao==='alteracao'?'Depois':''}</th></tr></thead><tbody>${linhas||'<tr><td colspan="3">—</td></tr>'}</tbody></table></div>
 <div class="modalfoot"><button data-action="close">Fechar</button></div>`)}
function csv(){const cab=['quando','usuario','area','operacao','registro','alteracoes'];const lin=ui.linhas.map(r=>[new Date(r.em).toLocaleString('pt-BR'),r.email||r.origem,AREAS[r.tabela]||r.tabela,r.operacao,r.registro||'',resumo(r)]);
 const txt=[cab,...lin].map(l=>l.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+txt],{type:'text/csv'}));a.download=`auditoria-${new Date().toISOString().slice(0,10)}.csv`;a.click()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-aud-aba],[data-aud-pag],[data-aud-ver],[data-aud-csv],[data-aud-atualizar]');if(!b)return;const d=b.dataset;
 if(d.audAba){ui.aba=d.audAba;ui.busca='';render()}if(d.audPag){ui.pag=Math.max(0,ui.pag+Number(d.audPag));buscar()}if(d.audVer)detalhe(ui.linhas[Number(d.audVer)]);if(d.audCsv)csv();if(d.audAtualizar){ui.chave='';usuarios=[];buscar()}});
let tBusca;function bind(){$$('[data-aud]').forEach(s=>s.onchange=()=>{ui[s.dataset.aud]=s.value;ui.pag=0;buscar()});const i=$('#audBusca');if(i)i.oninput=e=>{ui.busca=e.target.value;ui.pag=0;clearTimeout(tBusca);if(ui.aba==='eventos'){const pos=e.target.selectionStart;render();const n=$('#audBusca');n.focus();n.setSelectionRange(pos,pos)}else tBusca=setTimeout(buscar,400)}}
addPage('auditoria','shield','Log e auditoria',view,'Cada inclusão, alteração e exclusão feita no portal: quem, quando e o antes/depois de cada campo.','',bind);
})();
