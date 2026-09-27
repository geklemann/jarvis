'use strict';
// Atendimento pós-venda: reclamações, mediações, devoluções, cancelamentos, perguntas e mensagens dos
// marketplaces numa fila única, priorizada pelo prazo do marketplace. Para cada caso: diagnóstico e
// solução sugerida (regras + IA), mensagem pronta para revisar e enviar, responsável, etapa e notas.
// Nada é enviado ao cliente sem o clique de alguém da equipe.
(()=>{
Object.assign(paths,{headset:'M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v6H5a1 1 0 0 1-1-1z M20 14h-3v6h2a1 1 0 0 0 1-1z M17 20a4 4 0 0 1-4 2h-1',
 send:'M4 12 20 4l-6 16-3-7z M11 13l9-9'});
const st={lista:[],carregado:false,carregando:false,erro:'',info:null,filtro:'fila',busca:'',vistos:new Set(),notificar:false};
try{st.notificar=localStorage.getItem('eb_notif_atend')==='1'}catch{}
const dataHora=s=>s?new Date(s).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const TIPOS={reclamacao:['Reclamação','bad'],mediacao:['Mediação','bad'],devolucao:['Devolução','warn'],cancelamento:['Cancelamento','warn'],pergunta:['Pergunta','info'],mensagem:['Mensagem','info']};
const ETAPAS=['novo','em andamento','aguardando cliente','aguardando devolução','resolvido'];
const CANAL={mercadolivre:'Mercado Livre',shopee:'Shopee',magalu:'Magalu'};
const horasAte=s=>s?(new Date(s)-Date.now())/3600e3:null;
function prazoTxt(a){const h=horasAte(a.prazo);if(h==null)return '';if(h<0)return `<span class="red">vencido há ${Math.ceil(-h)} h</span>`;if(h<24)return `<span class="red">vence em ${Math.max(1,Math.floor(h))} h</span>`;return `<span class="${h<48?'gold':''}">vence em ${Math.floor(h/24)} d</span>`}
const aberto=a=>a.status==='aberto'&&a.etapa_interna!=='resolvido';
const esperandoNos=a=>{const u=(a.mensagens||[]).at(-1);return !u||u.de!=='vendedor'};
// Prioridade: prazo do marketplace, mediação (pesa na reputação), valor e tempo sem resposta.
function prioridade(a){let p=0;const h=horasAte(a.prazo);if(h!=null)p+=h<0?1000:h<24?600:h<48?300:100;if(a.tipo==='mediacao')p+=500;if(a.tipo==='reclamacao')p+=200;if(esperandoNos(a))p+=150;p+=Math.min(100,(a.valor||0)/5);const idade=(Date.now()-new Date(a.atualizado_em||a.aberto_em||Date.now()))/3600e3;p+=Math.min(200,idade*4);return p}

// ─────────── Diagnóstico por regras (instantâneo, sem IA) ───────────
function caso(a){const m=normalized([a.motivo,a.motivo_codigo,(a.mensagens||[]).map(x=>x.texto).join(' ')].join(' '));
 if(a.tipo==='pergunta')return 'pergunta';if(a.tipo==='mensagem')return 'mensagem';if(a.tipo==='cancelamento')return 'cancelamento';
 if(/^pnr|nao (recebi|chegou)|nao foi entregue|atras|extravi/.test(m)||/pnr/.test(normalized(a.motivo_codigo||'')))return 'naochegou';
 if(/falt|incomplet|peca/.test(m))return 'faltando';if(/diferent|errad|outro produto|trocad/.test(m))return 'diferente';
 if(/defeit|quebr|danific|avari|nao funciona|estragad/.test(m))return 'defeito';if(/arrepend|nao gostei|desist|nao quero|nao serv/.test(m))return 'arrependimento';return 'outro'}
const PLAY={
 naochegou:['Produto não chegou','Confira o rastreio. Se consta entregue, informe com gentileza e peça para verificar com vizinhos/portaria; se está atrasado, tranquilize com o novo prazo. Sem rastreio ou extravio: reembolse para não ir à mediação.',a=>`Olá! Sentimos muito pela demora. Já verificamos o envio do seu pedido e estamos acompanhando de perto com a transportadora. Assim que tivermos atualização, avisamos aqui. Se preferir, resolvemos com reembolso. Conte com a gente!`],
 defeito:['Produto com defeito ou avariado',a=>(a.valor||0)<=60?'Valor baixo: o mais rápido é reembolsar sem pedir devolução (a logística reversa custa quase o valor do produto).':'Peça uma foto (se ainda não houver) e ofereça troca ou reembolso. Aceite a devolução pelo Mercado Livre para não virar mediação.',a=>`Olá! Pedimos desculpas pelo problema com o produto. Pode nos enviar uma foto de como ele chegou? Assim resolvemos rapidinho com troca ou reembolso, como preferir.`],
 faltando:['Faltando peça ou item',a=>'Confirme qual peça falta (foto ajuda). Se houver a peça em estoque, envie; senão ofereça reembolso parcial ou troca completa.',a=>`Olá! Sentimos muito que tenha faltado algo no seu pedido. Pode nos dizer qual peça está faltando (uma foto ajuda)? Vamos resolver o quanto antes, com envio da peça ou reembolso.`],
 diferente:['Produto diferente do anunciado',a=>'Peça foto do que chegou. Se foi erro de separação, aceite a devolução e reenvie o correto ou reembolse; confira o anúncio para evitar repetição.',a=>`Olá! Pedimos desculpas pelo engano. Pode nos enviar uma foto do produto que recebeu? Assim confirmamos e já providenciamos a troca pelo item correto ou o reembolso.`],
 arrependimento:['Desistência da compra',a=>(a.valor||0)<=60?'Valor baixo: considere reembolsar sem devolução.':'Aceite a devolução pelo Mercado Livre (o cliente tem direito em 7 dias e a devolução é grátis para ele). Reembolso ao receber o produto.',a=>`Olá! Tudo bem, respeitamos sua decisão. Pode fazer a devolução pelo próprio Mercado Livre e, assim que o produto chegar aqui, o reembolso é liberado. Qualquer dúvida, estamos à disposição.`],
 cancelamento:['Pedido de cancelamento',a=>'Se ainda não foi despachado, aceite o cancelamento. Se já saiu, explique e ofereça a devolução ao receber.',a=>`Olá! Recebemos seu pedido de cancelamento. Se o produto ainda não foi despachado, cancelamos agora; se já estiver a caminho, você pode recusar a entrega ou devolver pelo Mercado Livre e o reembolso é garantido.`],
 pergunta:['Pergunta de comprador',a=>`Responda rápido: perguntas respondidas em até 1 hora vendem mais.${a.dados?.estoque!=null?` Estoque do anúncio: ${a.dados.estoque}.`:''}`,a=>`Olá! Obrigado pelo interesse. `],
 mensagem:['Mensagem pós-venda',a=>'Responda em até 24 horas; mensagens sem resposta pesam na reputação.',a=>`Olá! Obrigado pela mensagem. `],
 outro:['Reclamação',a=>'Leia a conversa, responda em até 24 horas e ofereça a solução mais simples (troca ou reembolso) antes que vire mediação.',a=>`Olá! Sentimos muito pelo ocorrido. Estamos aqui para resolver da forma mais rápida para você. Pode nos contar um pouco mais do que aconteceu?`]};
const regra=a=>{const [t,s,m]=PLAY[caso(a)];return {titulo:t,solucao:typeof s==='function'?s(a):s,mensagem:m(a)}};

// ─────────── Dados ───────────
async function carregar(silencioso){if(!window.Cloud?.ws||st.carregando)return;st.carregando=true;
 try{const [{data,error},integ]=await Promise.all([Cloud.client.from('atendimentos').select('*').eq('workspace_id',Cloud.ws).or(`status.eq.aberto,fechado_em.gte.${new Date(Date.now()-45*864e5).toISOString()}`).order('prazo',{ascending:true,nullsFirst:false}).limit(1000),
   Cloud.client.from('integrations').select('settings,status').eq('workspace_id',Cloud.ws).eq('provider','mercadolivre').maybeSingle()]);
  if(error)throw error;const antes=new Set(st.lista.map(a=>a.id));st.lista=data||[];st.info=integ.data?.settings?.atendimento||null;st.mlConectado=integ.data?.status==='conectado';st.erro='';
  if(st.carregado)avisarNovos(st.lista.filter(a=>aberto(a)&&!antes.has(a.id)));st.carregado=true}
 catch(e){st.erro=e.message||String(e);st.carregado=true}finally{st.carregando=false}
 if(page==='atendimento'){if(!silencioso||!document.querySelector('.modalback'))render()}else atualizarContadores()}
function atualizarContadores(){const n=abertosN();document.querySelectorAll('[data-nav="atendimento"] .navcount').forEach(x=>x.remove());if(n)document.querySelectorAll('[data-nav="atendimento"]').forEach(b=>b.insertAdjacentHTML('beforeend',`<em class="navcount">${n}</em>`))}
function avisarNovos(l){if(!l.length)return;toast(`${l.length} novo(s) atendimento(s): ${l.slice(0,2).map(a=>TIPOS[a.tipo]?.[0]||a.tipo).join(', ')}`);
 if(st.notificar&&'Notification' in window&&Notification.permission==='granted')for(const a of l.slice(0,3)){try{new Notification(`${TIPOS[a.tipo]?.[0]||'Atendimento'} · ${CANAL[a.canal]||a.canal}`,{body:(a.produto||'')+(a.motivo?' — '+a.motivo:''),tag:a.id})}catch{}}}
async function fn(action,body){const r=await Cloud.client.functions.invoke('integrations',{body:{workspace_id:Cloud.ws,action,...body}});if(r.error){let msg=r.error.message;try{msg=(await r.error.context.json()).error||msg}catch{}throw Error(msg)}return r.data}
async function salvar(id,campos){const {error}=await Cloud.client.from('atendimentos').update({...campos,updated_at:new Date().toISOString()}).eq('workspace_id',Cloud.ws).eq('id',id);if(error)throw error;Object.assign(st.lista.find(x=>x.id===id)||{},campos)}
const abertosN=()=>st.lista.filter(aberto).length;
// Avisos para o sino e para a Central do dia.
function avisos(){const ab=st.lista.filter(aberto),urg=ab.filter(a=>{const h=horasAte(a.prazo);return (h!=null&&h<24)||a.tipo==='mediacao'}),perg=ab.filter(a=>a.tipo==='pergunta'),out=[];
 if(urg.length)out.push(['bad','headset',`${urg.length} atendimento(s) urgente(s)`,'Prazo do marketplace em menos de 24 h ou mediação','atendimento']);
 const outros=ab.length-urg.length-perg.length;if(outros>0)out.push(['warn','headset',`${outros} reclamação(ões)/mensagem(ns) abertas`,'Pós-venda','atendimento']);
 if(perg.length)out.push(['info','chat',`${perg.length} pergunta(s) sem resposta`,'Responder rápido aumenta a venda','atendimento']);return out}

// ─────────── Tela ───────────
const FILTROS=[['fila','Fila',aberto],['urgentes','Urgentes',a=>aberto(a)&&((horasAte(a.prazo)??99)<24||a.tipo==='mediacao')],['reclamacoes','Reclamações',a=>aberto(a)&&['reclamacao','mediacao','cancelamento'].includes(a.tipo)],['devolucoes','Devoluções',a=>aberto(a)&&(a.tipo==='devolucao'||a.devolucao)],['perguntas','Perguntas',a=>aberto(a)&&a.tipo==='pergunta'],['mensagens','Mensagens',a=>aberto(a)&&a.tipo==='mensagem'],['resolvidos','Resolvidos',a=>!aberto(a)]];
function view(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver o atendimento.</div>';if(!st.carregado){carregar();return '<div class="empty">Carregando atendimentos…</div>'}
 const l=st.lista,ab=l.filter(aberto),res30=l.filter(a=>!aberto(a)&&a.fechado_em&&new Date(a.fechado_em)>Date.now()-30*864e5);
 const tempoMedio=(()=>{const t=res30.filter(a=>a.aberto_em).map(a=>(new Date(a.fechado_em)-new Date(a.aberto_em))/3600e3);return t.length?t.reduce((s,x)=>s+x,0)/t.length:null})();
 const kpi=(k,t,v,s,tom)=>`<button class="card kpi kpibtn ${st.filtro===k?'on':''}" data-at-filtro="${k}"><span class="kpil">${t}</span><span class="kpiv ${tom||''}">${v}</span><span class="kpis">${s}</span></button>`;
 const f=FILTROS.find(x=>x[0]===st.filtro)||FILTROS[0],q=normalized(st.busca);
 const lista=l.filter(f[2]).filter(a=>!q||normalized([a.id,a.pedido,a.produto,a.comprador,a.motivo,(a.mensagens||[]).map(m=>m.texto).join(' ')].join(' ')).includes(q)).sort((a,b)=>st.filtro==='resolvidos'?String(b.fechado_em).localeCompare(String(a.fechado_em)):prioridade(b)-prioridade(a));
 const semPermissao=(st.info?.erros||[]).some(e=>/403|UNAUTHORIZED/i.test(e));
 return `${semPermissao?`<div class="notice warnbox"><strong>Falta liberar o Mercado Livre.</strong> O aplicativo EcomBalance ainda não tem permissão para ler reclamações, perguntas e mensagens. No painel de desenvolvedores do Mercado Livre, ative as permissões <strong>Comunicação pré e pós-venda</strong> e <strong>Pós-venda (reclamações e devoluções)</strong> e depois clique em <strong>Reconectar</strong> no Mercado Livre em Integrações.</div>`:''}
 ${st.erro?`<div class="notice warnbox">${esc(st.erro)}</div>`:''}
 <div class="grid kpis4 at-kpis">${kpi('fila','Na fila',ab.length,`${ab.filter(esperandoNos).length} aguardando resposta nossa`)}${kpi('urgentes','Urgentes',l.filter(FILTROS[1][2]).length,'Prazo < 24 h ou mediação',l.filter(FILTROS[1][2]).length?'red':'')}${kpi('perguntas','Perguntas',l.filter(FILTROS[4][2]).length,'Sem resposta')}${kpi('resolvidos','Resolvidos em 30 dias',res30.length,tempoMedio!=null?`Tempo médio ${tempoMedio<48?Math.round(tempoMedio)+' h':Math.round(tempoMedio/24)+' dias'}`:'—','green')}</div>
 <div class="crmbar"><div class="segtabs">${FILTROS.map(([k,t,fx])=>`<button class="${st.filtro===k?'active':''}" data-at-filtro="${k}">${t}${k!=='resolvidos'?` <small>${l.filter(fx).length}</small>`:''}</button>`).join('')}</div>
  <div class="searchin">${icon('search')}<input type="search" id="atBusca" placeholder="Pedido, produto, cliente, motivo…" value="${esc(st.busca)}"></div>
  <button class="small" data-at="atualizar" ${st.mlConectado?'':'disabled'}>${icon('refresh')} Atualizar agora</button>
  <button class="small quiet" data-at="notif">${icon('bell')} ${st.notificar?'Notificações ligadas':'Ativar notificações'}</button></div>
 <p class="caption" style="margin:-6px 0 14px">Atualiza sozinho a cada 10 minutos${st.info?.fim?` · última leitura ${dataHora(st.info.fim)}`:''}. Ordem da fila: prazo do marketplace, mediações, valor e tempo sem resposta.</p>
 ${lista.length?`<div class="atlista">${lista.map(linha).join('')}</div>`:`<div class="card empty">${st.filtro==='fila'?'Nenhum atendimento aberto. ✓':'Nada neste filtro.'}</div>`}`}
function linha(a){const [tn,tt]=TIPOS[a.tipo]||[a.tipo,''],r=regra(a),u=(a.mensagens||[]).at(-1);
 return `<button class="card atitem ${aberto(a)&&((horasAte(a.prazo)??99)<24||a.tipo==='mediacao')?'urg':''}" data-at-abrir="${esc(a.id)}">
  <div class="athead"><span class="badge ${tt}">${tn}</span><span class="caption">${CANAL[a.canal]||a.canal}${a.pedido?' · pedido '+esc(a.pedido):''}</span><span class="atprazo">${aberto(a)?prazoTxt(a):`<span class="badge ok">resolvido ${dataHora(a.fechado_em)}</span>`}</span></div>
  <strong class="attitulo">${esc(a.produto||r.titulo)}</strong>
  <span class="caption">${esc(a.motivo||r.titulo)}${a.comprador?' · '+esc(a.comprador):''}${a.valor?' · '+money(a.valor):''}</span>
  ${u?`<span class="atmsg"><b>${u.de==='vendedor'?'Nós':'Cliente'}:</b> ${esc(String(u.texto||'').slice(0,160))}</span>`:''}
  ${aberto(a)?`<span class="atsug">${icon('spark')} <span>${esc(a.sugestao?.solucao||r.solucao)}</span></span>`:''}
  <span class="atfoot">${a.responsavel?`<span class="badge">${esc(a.responsavel)}</span>`:''}<span class="badge">${esc(a.etapa_interna||'novo')}</span>${a.devolucao?.status?`<span class="badge warn">devolução: ${esc(a.devolucao.status)}</span>`:''}</span></button>`}

function linkML(a){return a.tipo==='pergunta'?(a.dados?.link||'https://www.mercadolivre.com.br/perguntas/vendedor'):a.pedido?`https://www.mercadolivre.com.br/vendas/${encodeURIComponent(a.pedido)}/detalhe`:'https://www.mercadolivre.com.br/vendas/omni/lista'}
// Respostas prontas por situação: preenchem nome, pedido e produto; o texto continua editável antes de enviar.
const MODELOS=[
 ['atraso','Atraso na entrega','Olá, {nome}! Sentimos muito pela demora. Já verificamos o pedido {pedido} com a transportadora e ele está a caminho. Vamos acompanhar até a entrega e te avisamos por aqui. Conte com a gente! Equipe Compra Store'],
 ['defeito','Produto com defeito','Olá, {nome}! Lamentamos pelo problema com o {produto}. Para resolver rápido, envie por aqui uma foto ou vídeo do defeito. Assim que recebermos, vemos com você a melhor solução: peça de reposição ou troca. Equipe Compra Store'],
 ['peca','Peça faltando','Olá, {nome}! Algumas peças vêm dentro de outras embalagens ou junto do manual — vale conferir a caixa toda. Se faltar mesmo, nos diga qual peça (pode mandar foto do manual) que providenciamos a reposição. Equipe Compra Store'],
 ['troca','Troca ou devolução','Olá, {nome}! Você pode pedir a troca ou devolução pelo próprio marketplace, seguindo a política dele, e o reembolso é liberado quando o produto chega. Se preferir, podemos tentar resolver antes: é só nos contar o que aconteceu. Equipe Compra Store'],
 ['montagem','Montagem ou uso','Olá, {nome}! O manual de montagem vem na caixa do {produto}. Nos diga em qual etapa travou (se puder, mande uma foto) que te explicamos o passo a passo. Equipe Compra Store'],
 ['nota','Nota fiscal','Olá, {nome}! A nota fiscal do pedido {pedido} fica disponível na área de compras do marketplace. Se precisar, enviamos o arquivo por aqui. Equipe Compra Store'],
 ['bateria','Carrinho elétrico / bateria','Olá, {nome}! Antes do primeiro uso, a bateria do {produto} precisa da carga completa indicada no manual, e o conector interno da bateria deve estar bem encaixado. Se mesmo assim não ligar, mande um vídeo que resolvemos com prioridade. Equipe Compra Store'],
 ['obrigado','Agradecer e pedir avaliação','Olá, {nome}! Que bom que o pedido chegou! Esperamos que a criançada aproveite muito o {produto}. Se puder, deixe sua avaliação — ajuda demais a nossa loja. Obrigado pela confiança! Equipe Compra Store'],
 ['prevenda','Dúvida antes da compra','Olá! Obrigado pelo interesse no {produto}. Qualquer dúvida sobre medidas, idade indicada ou envio, é só perguntar que respondemos rapidinho!']];
function preencher(t,a){const o=db.orders.find(x=>String(x.id)===String(a.pedido)||(x.external?.ml_order_ids||[]).map(String).includes(String(a.pedido))),nome=String(o?.customer?.name||a.comprador||'').split(/\s+/)[0]||'tudo bem';
 const nm=nome.charAt(0).toUpperCase()+nome.slice(1).toLowerCase();return t.replace(/\{nome\}/g,nm).replace(/\{pedido\}/g,a.pedido||'').replace(/\{produto\}/g,a.produto||o?.items?.[0]?.title||'produto')}
function abrir(id){const a=st.lista.find(x=>x.id===id);if(!a)return;const r=regra(a),s=a.sugestao,[tn,tt]=TIPOS[a.tipo]||[a.tipo,''];
 const limite=a.tipo==='mensagem'?350:a.tipo==='pergunta'?2000:2000;const nome=(window.Cloud?.session?.user?.user_metadata?.nome||window.Cloud?.session?.user?.email||'').split(/[\s@]/)[0];
 modal(`${tn} · ${a.produto||a.id}`,`<div class="athead" style="margin-bottom:12px"><span class="badge ${tt}">${tn}</span><span class="caption">${CANAL[a.canal]||a.canal}${a.pedido?' · pedido '+esc(a.pedido):''}${a.valor?' · '+money(a.valor):''}${a.comprador?' · '+esc(a.comprador):''}</span><span class="atprazo">${aberto(a)?prazoTxt(a):'resolvido'}</span></div>
 ${a.motivo?`<p><strong>Motivo:</strong> ${esc(a.motivo)}</p>`:''}
 ${(a.acoes||[]).length?`<p class="caption">Ações disponíveis no marketplace: ${a.acoes.map(x=>`${esc(x.acao)}${x.prazo?` (até ${dataHora(x.prazo)})`:''}`).join(' · ')}</p>`:''}
 ${a.devolucao?`<p class="caption">Devolução: ${esc(a.devolucao.status||'—')}${(a.devolucao.envios||[]).map(e=>` · envio ${esc(e.status||'')}${e.rastreio?' '+esc(e.rastreio):''}`).join('')}</p>`:''}
 <div class="atsolucao"><div class="navlabel" style="margin:0 0 6px">${s?'Sugestão da IA':'Solução sugerida'} · ${esc(r.titulo)}</div><p><strong>${esc(s?.solucao||r.solucao)}</strong></p>${s?.diagnostico?`<p class="caption">${esc(s.diagnostico)}</p>`:''}${(s?.passos||[]).length?`<ol class="atpassos">${s.passos.map(p=>`<li>${esc(p)}</li>`).join('')}</ol>`:''}
  <button class="small" data-at-ia="${esc(a.id)}">${icon('spark')} ${s?'Pedir nova sugestão à IA':'Analisar com IA'}</button></div>
 <div class="navlabel" style="margin:16px 0 8px">Conversa</div><div class="atconversa">${(a.mensagens||[]).map(m=>`<div class="atbolha ${m.de==='vendedor'?'nos':''}"><small>${m.de==='vendedor'?'Nós':m.de==='mediator'?'Mediador':'Cliente'} · ${dataHora(m.em)}</small>${esc(m.texto||'')}${m.anexos?` <small>· ${m.anexos} anexo(s)</small>`:''}</div>`).join('')||'<p class="caption">Sem mensagens.</p>'}</div>
 ${aberto(a)?`<div class="navlabel" style="margin:16px 0 8px">Respostas prontas</div><div class="atmodelos">${MODELOS.map(([k,t])=>`<button class="small" data-at-modelo="${k}" data-id="${esc(a.id)}">${t}</button>`).join('')}</div><label for="atTexto">Resposta ao cliente <span class="caption" id="atConta"></span></label><textarea id="atTexto" maxlength="${limite}" rows="4">${esc(s?.mensagem||r.mensagem)}</textarea>
 <div class="row wrap" style="margin-top:8px"><button class="primary" data-at-enviar="${esc(a.id)}" ${a.canal==='mercadolivre'?'':'disabled'}>${icon('send')} Enviar ao cliente</button><a class="btnlink" href="${linkML(a)}" target="_blank" rel="noopener">${icon('ext')} Abrir no ${CANAL[a.canal]||'marketplace'}</a></div>
 <p class="caption">Reembolso, devolução e cancelamento são feitos no próprio marketplace pelo botão acima (o portal não movimenta dinheiro).</p>`:''}
 <div class="grid three" style="margin-top:14px"><div><label for="atResp">Responsável</label><input id="atResp" value="${esc(a.responsavel||'')}" placeholder="Quem cuida"></div>
  <div><label for="atEtapa">Etapa</label><select id="atEtapa">${ETAPAS.map(e=>`<option ${a.etapa_interna===e?'selected':''}>${e}</option>`).join('')}</select></div>
  <div style="display:flex;align-items:flex-end"><button class="small" data-at-assumir="${esc(nome)}">${icon('users')} Assumir</button></div></div>
 <label for="atNotas">Notas internas</label><textarea id="atNotas" rows="2" placeholder="Combinados, fotos recebidas, código de rastreio da troca…">${esc(a.notas||'')}</textarea>
 <div class="modalfoot"><button data-action="close">Fechar</button><button class="primary" data-at-salvar="${esc(a.id)}">${icon('check')} Salvar</button></div>`);
 const t=$('#atTexto'),c=$('#atConta');if(t&&c){const up=()=>c.textContent=`${t.value.length}/${limite}`;t.oninput=up;up()}}

document.addEventListener('click',async e=>{const b=e.target.closest('[data-at-filtro],[data-at],[data-at-abrir],[data-at-ia],[data-at-enviar],[data-at-salvar],[data-at-assumir]');if(!b)return;const d=b.dataset;
 if(d.atFiltro){st.filtro=d.atFiltro;render();return}
 if(d.atAbrir){abrir(d.atAbrir);return}
 if(d.atAssumir!==undefined){$('#atResp').value=d.atAssumir||'Eu';if($('#atEtapa').value==='novo')$('#atEtapa').value='em andamento';return}
 if(d.at==='notif'){if(!st.notificar&&'Notification' in window&&Notification.permission!=='granted'){const p=await Notification.requestPermission();if(p!=='granted'){toast('O navegador bloqueou as notificações.');return}}st.notificar=!st.notificar;try{localStorage.setItem('eb_notif_atend',st.notificar?'1':'0')}catch{}render();return}
 if(d.at==='atualizar'){b.disabled=true;b.innerHTML=`${icon('refresh')} Lendo o Mercado Livre…`;try{const r=await fn('atendimento_sync',{});toast(r.erros?.length?`Leitura com avisos: ${r.erros[0]}`:`${r.abertas} reclamação(ões) aberta(s), ${r.perguntas} pergunta(s), ${r.mensagens} conversa(s).`)}catch(x){toast(x.message)}await carregar();return}
 if(d.atIa){b.disabled=true;b.innerHTML=`${icon('spark')} Analisando…`;try{const s=await fn('atendimento_ia',{id:d.atIa});const a=st.lista.find(x=>x.id===d.atIa);if(a)a.sugestao=s;abrir(d.atIa)}catch(x){toast(x.message);b.disabled=false;b.innerHTML=`${icon('spark')} Analisar com IA`}return}
 if(d.atSalvar){try{await salvar(d.atSalvar,{responsavel:$('#atResp').value.trim()||null,etapa_interna:$('#atEtapa').value,notas:$('#atNotas').value.trim()||null,...($('#atEtapa').value==='resolvido'?{resolvido_por:window.Cloud?.session?.user?.email||null,resolvido_em:new Date().toISOString()}:{})});closeModal();toast('Atendimento salvo.');render()}catch(x){toast(x.message)}return}
 if(d.atEnviar){const texto=$('#atTexto').value.trim();if(!texto){toast('Escreva a resposta.');return}if(!confirm('Enviar esta resposta ao cliente no Mercado Livre?'))return;b.disabled=true;
  try{const r=await fn('atendimento_responder',{id:d.atEnviar,texto});const a=st.lista.find(x=>x.id===d.atEnviar);if(a){a.mensagens=r.mensagens;if(a.tipo==='pergunta'){a.status='fechado';a.fechado_em=new Date().toISOString()}}
   const campos={etapa_interna:a?.tipo==='pergunta'?'resolvido':'aguardando cliente',responsavel:$('#atResp').value.trim()||a?.responsavel||null};await salvar(d.atEnviar,campos).catch(()=>{});toast('Resposta enviada.');closeModal();render()}
  catch(x){toast(x.message);b.disabled=false}}
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-at-modelo]');if(!b)return;const a=st.lista.find(x=>x.id===b.dataset.id),m=MODELOS.find(x=>x[0]===b.dataset.atModelo),t=$('#atTexto');if(!a||!m||!t)return;
 t.value=preencher(m[2],a).slice(0,Number(t.maxLength)||2000);t.dispatchEvent(new Event('input'));t.focus();document.querySelectorAll('[data-at-modelo]').forEach(x=>x.classList.toggle('primary',x===b))});
function bind(){const i=$('#atBusca');if(i)i.oninput=e=>{st.busca=e.target.value;const pos=e.target.selectionStart;render();const n=$('#atBusca');n.focus();n.setSelectionRange(pos,pos)}}
addPage('atendimento','headset','Atendimento',view,'Reclamações, devoluções, mediações, perguntas e mensagens numa fila só — com a solução sugerida e a resposta pronta.','',bind);
window.Atendimento={avisos,abertos:abertosN,carregar,lista:()=>st.lista};
// Primeira leitura assim que a empresa abre; depois a cada 2 minutos (o servidor lê o marketplace a cada 10).
let ultimoWs=null;setInterval(()=>{if(window.Cloud?.ws&&window.Cloud.ws!==ultimoWs){ultimoWs=Cloud.ws;st.carregado=false;st.lista=[];carregar(true)}},1500);
setInterval(()=>{if(window.Cloud?.ws&&!document.hidden)carregar(true)},120000);
})();
