'use strict';
// CRM que entende brinquedo: cada compra diz a fase da criança (bebê → primeiros passos → pequeno piloto →
// faz de conta → elétricos). A idade avança com o tempo, então sabemos QUANDO a criança entra na próxima
// fase e QUAL brinquedo oferecer. Mais: linha do tempo única do cliente e réguas de relacionamento.
(()=>{
Object.assign(paths,{baby:'M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M7 21v-5l-2-4 4-2h6l4 2-2 4v5 M9 13h6',route:'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6'});
const FASES=[
 {id:1,nome:'Bebê',faixa:[0,12],meio:6,re:/play gym|baby mobile|palhac|pom pom|arca de no/},
 {id:2,nome:'Primeiros passos',faixa:[9,24],meio:16,re:/andador|mesa criativa|centro esportivo|primeiro tablet|labirinto|pet house/},
 {id:3,nome:'Pequeno piloto',faixa:[12,36],meio:26,re:/avespa(?!.*eletric)|jip jip|triciclo avespa(?!.*eletric)|moto.*trail|trail maral|play trike|balance bike/},
 {id:4,nome:'Faz de conta',faixa:[24,60],meio:40,re:/cleaning trolley|cozinha|casita|fire station|police station|barco pirata|ramp racer|beach play/},
 {id:5,nome:'Elétricos',faixa:[36,84],meio:54,re:/eletric|6v|flash wheels|lady star/}];
const faseDe=t=>{const n=normalized(t||'');return FASES.find(f=>f.re.test(n))};
const meses=(a,b)=>(new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/(30.44*864e5);
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const addMeses=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+Math.round(n*30.44));return x.toLocaleDateString('sv-SE')};
const dBR=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const idadeTxt=m=>m<24?`${Math.max(0,Math.round(m))} meses`:`${(m/12).toFixed(1).replace('.',',').replace(',0','')} anos`;
let topPorFase=null;
function tops(){if(topPorFase)return topPorFase;const m=new Map();for(const o of db.orders)for(const it of o.items||[]){const f=faseDe(it.title);if(!f)continue;const nome=(it.title||'').replace(/\s*-\s*(ROSA|AZUL|PINK|VERMELH[AO]|PRET[AO]|BRANC[AO]|COLORID[AO]|MENINA|MENINO|CAIXA.*)$/i,'').trim();const ch=f.id+'|'+normalized(nome).split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');const x=m.get(ch)||{n:nome,q:0};x.q+=Number(it.qty)||0;m.set(ch,x)}
 topPorFase={};for(const [k,x] of m){const f=k.split('|')[0];(topPorFase[f]=topPorFase[f]||[]).push([x.n,x.q])}for(const f in topPorFase)topPorFase[f].sort((a,b)=>b[1]-a[1]);return topPorFase}
// Perfil: a compra mais recente com fase conhecida dá a idade provável na época; somamos o tempo desde então.
function perfil(c){const comprou=[];for(const o of c.pedidos||[])for(const it of o.items||[]){const f=faseDe(it.title);if(f)comprou.push({f,d:o.date,t:it.title})}
 if(!comprou.length)return null;comprou.sort((a,b)=>a.d.localeCompare(b.d));const u=comprou.at(-1),idade=u.f.meio+meses(u.d,hoje());
 const atual=[...FASES].reverse().find(f=>idade>=f.faixa[0])||FASES[0];const prox=FASES.find(f=>f.id>Math.max(u.f.id,atual.id-1)&&f.faixa[0]>u.f.meio-6)||null;
 const jaTem=new Set(comprou.map(x=>normalized(x.t).slice(0,18)));const sug=prox?(tops()[prox.id]||[]).filter(([n])=>!jaTem.has(normalized(n).slice(0,18))).slice(0,3):[];
 // Momento: quando a criança chega perto da idade típica da próxima fase (meio − 6 meses), nunca antes de 3 meses da compra.
 const janela=prox?addMeses(u.d,Math.max(3,prox.meio-6-u.f.meio)):null;return {idade,atual,ultima:u,prox,sug,janela,fases:[...new Set(comprou.map(x=>x.f.nome))]}}
function secao(c){const p=perfil(c),tl=linhaDoTempo(c);
 return `${p?`<div class="fasebox"><div class="fasehead">${icon('baby')}<div><strong>Criança com ~${idadeTxt(p.idade)}</strong><small>fase atual: ${p.atual.nome} · comprou para: ${p.fases.join(', ')}</small></div></div>
  ${p.prox?`<p><strong>Próximo brinquedo:</strong> ${p.sug.map(([n])=>esc(n)).join(' · ')||'—'} <span class="caption">(fase ${p.prox.nome}, ${p.prox.faixa[0]}–${p.prox.faixa[1]} meses)</span></p><p class="caption">Melhor momento para oferecer: <strong>${p.janela<=hoje()?'agora':dBR(p.janela)}</strong></p>`:'<p class="caption">Já está na última fase do catálogo.</p>'}</div>`:''}
 <h3 style="margin:14px 0 6px">Linha do tempo</h3><div class="timeline tl360">${tl.slice(0,40).map(e=>`<div class="event"><strong>${esc(e.t)}</strong><p>${new Date(e.d.length>10?e.d:e.d+'T12:00:00').toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})} · ${e.s}</p></div>`).join('')||'<p class="caption">Sem eventos.</p>'}</div>`}
function linhaDoTempo(c){const ev=[];const ids=new Set((c.pedidos||[]).map(o=>String(o.id)));
 for(const o of c.pedidos||[])ev.push({d:o.date,t:`Pedido ${o.platform} · ${money(o.gross)}`,s:esc((o.items||[]).map(i=>`${i.qty}× ${i.title||i.sku}`).join(' · '))});
 for(const a of window.Atendimento?.lista?.()||[])if(ids.has(String(a.pedido))||ids.has(String(a.pack))||(c.apelido&&a.comprador&&normalized(a.comprador)===normalized(c.apelido)))ev.push({d:a.aberto_em||a.atualizado_em||'',t:`${a.tipo==='pergunta'?'Pergunta':'Atendimento'}: ${a.motivo||a.tipo}`,s:`${a.status==='aberto'?'<span class="gold">aberto</span>':'resolvido'}${a.responsavel?' · '+esc(a.responsavel):''}`});
 for(const i of (db.crm?.[c.key]?.interactions)||[])ev.push({d:i.time,t:'Contato',s:esc(i.text)});
 return ev.filter(e=>e.d).sort((a,b)=>String(b.d).localeCompare(String(a.d)))}

// ─────────────── Próximo brinquedo (lista de oportunidades por fase) ───────────────
const ui={janela:'30',fase:'',busca:''};
window.Reiniciar?.registrar(ui,['janela','fase','busca']); // estado de tela: volta ao original ao clicar no menu
function fasesView(){const cl=(window.CRM?.clientes?.()||[]).map(c=>({c,p:perfil(c)})).filter(x=>x.p?.prox),h=hoje(),lim=addMeses(h,Number(ui.janela)/30.44);
 const desde=addMeses(h,-2);const l=cl.filter(x=>(ui.janela==='todos'||(x.p.janela<=lim&&x.p.janela>=desde))&&(!ui.fase||String(x.p.prox.id)===ui.fase)&&(!ui.busca||normalized(x.c.nome+' '+x.c.cidade).includes(normalized(ui.busca)))).sort((a,b)=>a.p.janela.localeCompare(b.p.janela));
 const porFase=FASES.map(f=>[f,cl.filter(x=>x.p.prox.id===f.id&&x.p.janela<=lim&&x.p.janela>=addMeses(h,-2)).length]);
 return `<div class="notice">A idade provável da criança vem do brinquedo comprado (cada linha do catálogo tem uma faixa) mais o tempo desde a compra. Quando ela entra na próxima fase, é a hora de oferecer o próximo brinquedo — pelo chat do pedido no marketplace, cupom de seguidor na Shopee ou WhatsApp/e-mail quando o cliente autorizou.</div>
 <div class="grid kpis4">${porFase.slice(1).map(([f,n])=>`<button class="card kpi kpibtn ${ui.fase===String(f.id)?'on':''}" data-cf-fase="${f.id}"><span class="kpil">Entrando em ${f.nome}</span><span class="kpiv">${n.toLocaleString('pt-BR')}</span><span class="kpis">${f.faixa[0]}–${f.faixa[1]} meses · ${(tops()[f.id]||[]).slice(0,2).map(x=>esc(x[0])).join(', ')}</span></button>`).join('')}</div>
 <div class="crmbar"><select data-cf-janela aria-label="Janela">${[['0','Entraram na fase (últimos 60 dias)'],['30','Até 30 dias'],['60','Até 60 dias'],['90','Até 90 dias'],['todos','Todos']].map(([k,t])=>`<option value="${k}" ${ui.janela===k?'selected':''}>${t}</option>`).join('')}</select><div class="searchin">${icon('search')}<input type="search" id="cfBusca" placeholder="Cliente ou cidade…" value="${esc(ui.busca)}"></div>${ui.fase?`<button class="small" data-cf-fase="">Limpar fase</button>`:''}<span class="caption">${l.length.toLocaleString('pt-BR')} cliente(s)</span></div>
 <div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Cliente</th><th>Criança</th><th>Comprou</th><th>Próximo brinquedo</th><th>Momento</th><th>Contato</th></tr></thead><tbody>
 ${l.slice(0,300).map(({c,p})=>`<tr class="clk" data-crm-ficha="${esc(c.key)}"><td><strong>${esc(c.nome||'—')}</strong><br><span class="caption">${esc(c.cidade||'')} · ${esc(c.uf||'')}</span></td><td>~${idadeTxt(p.idade)}<br><span class="caption">${p.atual.nome}</span></td><td class="caption">${esc(p.ultima.t)}<br>${dBR(p.ultima.d)}</td><td>${p.sug.map(([n])=>esc(n)).join('<br>')||'—'}</td><td><span class="badge ${p.janela<=h?'ok':'info'}">${p.janela<=h?'agora':dBR(p.janela)}</span></td><td><div class="cbtns">${window.CRM?.botoesContato?.(c,true)||''}</div></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Ninguém nesta janela.</td></tr>'}</tbody></table></div></div>`}

// ─────────────── Réguas de relacionamento ───────────────
const REGUAS=[
 {id:'posentrega',t:'Chegou tudo certo?',quando:'3 dias depois da entrega',canal:'Mercado Livre (chat do pedido)',texto:'Olá! O seu {produto} chegou direitinho? Se precisar de qualquer ajuda com a montagem ou uso, é só responder aqui. Boas brincadeiras! Equipe Compra Store',dias:3,filtro:o=>o.platform==='Mercado Livre'},
 {id:'dicas',t:'Dicas de uso e opinião',quando:'10 dias depois da compra',canal:'Mercado Livre (chat do pedido)',texto:'Olá! Esperamos que a criança esteja amando o {produto}. Queremos muito saber sua opinião sobre o brinquedo — conte pra gente aqui mesmo o que achou. Sua resposta ajuda a gente a melhorar!',dias:10,filtro:o=>o.platform==='Mercado Livre'},
 {id:'fase',t:'Próxima fase da criança',quando:'quando a criança entra na próxima fase',canal:'WhatsApp/e-mail (com consentimento) ou cupom de seguidor Shopee',texto:'Oi! A criança já deve estar com {idade} — idade perfeita para o {sugestao}. Separamos uma condição especial para você.',dias:null},
 {id:'reativacao',t:'Reativação',quando:'180 dias sem comprar',canal:'Cupom de loja/seguidor (Shopee) e campanhas (Mercado Livre)',texto:'Faz tempo que você não passa por aqui! Temos novidades para a idade da criança.',dias:180}];
function reguasCfg(){return db.gerencial?.reguas||{}}
function publico(r){const h=hoje(),cl=window.CRM?.clientes?.()||[];
 if(r.id==='fase')return cl.filter(c=>{const p=perfil(c);return p?.prox&&p.janela<=h&&p.janela>=addMeses(h,-1)}).length;
 if(r.id==='reativacao')return cl.filter(c=>c.recencia>=180&&c.recencia<210).length;
 const alvo=addMeses(h,-(r.dias/30.44));return db.orders.filter(o=>r.filtro(o)&&o.date===alvo).length}
const env={lista:null,info:null,carregando:false};
async function carregarEnvios(){if(env.carregando||!window.Cloud?.ws)return;env.carregando=true;try{const [a,b]=await Promise.all([Cloud.client.from('regua_envios').select('*').eq('workspace_id',Cloud.ws).order('enviado_em',{ascending:false}).limit(200),Cloud.client.from('integrations').select('settings').eq('workspace_id',Cloud.ws).eq('provider','mercadolivre').maybeSingle()]);env.lista=a.data||[];env.info=b.data?.settings?.reguas||null}catch{env.lista=[]}finally{env.carregando=false}if(page==='crmreguas')render()}
function enviosView(){if(env.lista==null){carregarEnvios();return '<p class="caption">Carregando envios…</p>'}const i=env.info;
 return `<div class="tablebox" style="margin-top:16px"><div class="tabletop"><div><h2>Últimos envios automáticos</h2><p class="caption">${i?.fim?`Última rodada ${new Date(i.fim).toLocaleString('pt-BR')}${i.erro?` · <span class="red">${esc(i.erro)}</span>`:` · ${i.enviados??0} enviada(s)${i.erros?`, ${i.erros} com erro`:''}`}`:'Ainda não rodou — liga-se sozinho de hora em hora quando alguma régua estiver ligada.'}</p></div></div><div class="tablewrap"><table><thead><tr><th>Quando</th><th>Régua</th><th>Cliente</th><th>Produto</th><th>Situação</th></tr></thead><tbody>
 ${env.lista.map(e=>`<tr><td>${new Date(e.enviado_em).toLocaleString('pt-BR')}</td><td>${esc(REGUAS.find(r=>r.id===e.regua)?.t||e.regua)}</td><td>${esc(e.comprador||'')}</td><td class="caption">${esc(e.produto||'')}</td><td><span class="badge ${e.status==='enviado'?'ok':'bad'}" title="${esc(e.erro||'')}">${esc(e.status)}</span></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum envio ainda.</td></tr>'}</tbody></table></div></div>`}
function reguasView(){const cfg=reguasCfg();
 return `<div class="notice"><strong>Réguas de relacionamento.</strong> Mensagens certas na hora certa, sempre pelo canal permitido. As do chat do Mercado Livre são enviadas pelo servidor assim que a permissão de mensagens do app for liberada (agendado para segunda). Nada pede nota ou avaliação — as regras dos marketplaces proíbem; pedimos opinião e oferecemos ajuda.</div>
 <div class="reguas">${REGUAS.map(r=>{const c=cfg[r.id]||{};const ativo=!!c.ativo;return `<div class="card regua"><div class="cardhead"><div><h2>${r.t}</h2><p class="caption">${r.quando} · ${r.canal}</p></div><label class="switch"><input type="checkbox" data-rg-ativo="${r.id}" ${ativo?'checked':''}><span>${ativo?'Ligada':'Desligada'}</span></label></div>
  <textarea data-rg-texto="${r.id}" rows="3" maxlength="350">${esc(c.texto||r.texto)}</textarea><p class="caption">${(c.texto||r.texto).length}/350 · variáveis: {produto} {idade} {sugestao} · hoje entrariam <strong>${publico(r).toLocaleString('pt-BR')}</strong> cliente(s)</p></div>`}).join('')}</div>${enviosView()}`}
document.addEventListener('change',e=>{const a=e.target.closest('[data-rg-ativo]');if(a){db.gerencial={...(db.gerencial||{}),reguas:{...reguasCfg(),[a.dataset.rgAtivo]:{...(reguasCfg()[a.dataset.rgAtivo]||{}),ativo:a.checked}}};audit('Régua de relacionamento',`${a.dataset.rgAtivo} ${a.checked?'ligada':'desligada'}`);save();render();return}
 const t=e.target.closest('[data-rg-texto]');if(t){db.gerencial={...(db.gerencial||{}),reguas:{...reguasCfg(),[t.dataset.rgTexto]:{...(reguasCfg()[t.dataset.rgTexto]||{}),texto:t.value.trim()}}};save();toast('Texto salvo.')}
 const j=e.target.closest('[data-cf-janela]');if(j){ui.janela=j.value;render()}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-cf-fase]');if(b){ui.fase=b.dataset.cfFase;render()}});
function bind(){const i=$('#cfBusca');if(i)i.oninput=e=>{ui.busca=e.target.value;const pos=e.target.selectionStart;render();const n=$('#cfBusca');n.focus();n.setSelectionRange(pos,pos)}}
addPage('crmfases','baby','Próximo brinquedo',fasesView,'Idade provável da criança pelo que foi comprado: quem entra na próxima fase e qual brinquedo oferecer.','',bind);
addPage('crmreguas','route','Réguas de relacionamento',reguasView,'Pós-entrega, opinião, próxima fase e reativação — mensagens na hora certa, pelo canal permitido.','',bind);
window.CRMx={secao,perfil,FASES};
})();
