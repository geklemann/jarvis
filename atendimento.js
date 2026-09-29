'use strict';
// Atendimento pós-venda: reclamações, mediações, devoluções, cancelamentos, perguntas e mensagens dos
// marketplaces numa fila única, priorizada pelo prazo do marketplace. Para cada caso: diagnóstico e
// solução sugerida (regras + IA), mensagem pronta para revisar e enviar, responsável, etapa e notas.
// Nada é enviado ao cliente sem o clique de alguém da equipe.
(()=>{
Object.assign(paths,{headset:'M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v6H5a1 1 0 0 1-1-1z M20 14h-3v6h2a1 1 0 0 0 1-1z M17 20a4 4 0 0 1-4 2h-1',
 send:'M4 12 20 4l-6 16-3-7z M11 13l9-9'});
const st={canal:'',lista:[],carregado:false,carregando:false,erro:'',info:null,filtro:'fila',busca:'',vistos:new Set(),notificar:false};
try{st.notificar=localStorage.getItem('eb_notif_atend')==='1'}catch{}
const dataHora=s=>s?new Date(s).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const TIPOS={reclamacao:['Reclamação','bad'],mediacao:['Mediação','bad'],devolucao:['Devolução','warn'],cancelamento:['Cancelamento','warn'],pergunta:['Pergunta','info'],mensagem:['Mensagem','info']};
const ETAPAS=['novo','em andamento','aguardando cliente','aguardando devolução','resolvido'];
const CANAL={mercadolivre:'Mercado Livre',shopee:'Shopee',magalu:'Magalu','Central do Cliente':'Central do Cliente'};
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
const FILTROS=[['fila','Fila',aberto],['urgentes','Urgentes',a=>aberto(a)&&((horasAte(a.prazo)??99)<24||a.tipo==='mediacao')],['reclamacoes','Reclamações',a=>aberto(a)&&['reclamacao','mediacao','cancelamento'].includes(a.tipo)],['devolucoes','Devoluções',a=>aberto(a)&&(a.tipo==='devolucao'||a.devolucao)],['perguntas','Perguntas',a=>aberto(a)&&a.tipo==='pergunta'],['mensagens','Mensagens',a=>aberto(a)&&a.tipo==='mensagem'],['resolvidos','Resolvidos',a=>!aberto(a)],['melhorias','Melhorias',()=>false]];
function view(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver o atendimento.</div>';if(!st.carregado){carregar();return '<div class="empty">Carregando atendimentos…</div>'}
 const l=st.lista,ab=l.filter(aberto),res30=l.filter(a=>!aberto(a)&&a.fechado_em&&new Date(a.fechado_em)>Date.now()-30*864e5);
 const tempoMedio=(()=>{const t=res30.filter(a=>a.aberto_em).map(a=>(new Date(a.fechado_em)-new Date(a.aberto_em))/3600e3);return t.length?t.reduce((s,x)=>s+x,0)/t.length:null})();
 const kpi=(k,t,v,s,tom)=>`<button class="card kpi kpibtn ${st.filtro===k?'on':''}" data-at-filtro="${k}"><span class="kpil">${t}</span><span class="kpiv ${tom||''}">${v}</span><span class="kpis">${s}</span></button>`;
 const f=FILTROS.find(x=>x[0]===st.filtro)||FILTROS[0],q=normalized(st.busca);
 const lista=l.filter(f[2]).filter(a=>!st.canal||a.canal===st.canal).filter(a=>!q||normalized([a.id,a.pedido,produtoDe(a),a.comprador,a.motivo,(a.mensagens||[]).map(m=>m.texto).join(' ')].join(' ')).includes(q)).sort((a,b)=>st.filtro==='resolvidos'?String(b.fechado_em).localeCompare(String(a.fechado_em)):prioridade(b)-prioridade(a));
 const semPermissao=(st.info?.erros||[]).some(e=>/403|UNAUTHORIZED/i.test(e));
 return `${semPermissao?`<div class="notice warnbox"><strong>Falta liberar o Mercado Livre.</strong> O aplicativo Jarvis ainda não tem permissão para ler reclamações, perguntas e mensagens. No painel de desenvolvedores do Mercado Livre, ative as permissões <strong>Comunicação pré e pós-venda</strong> e <strong>Pós-venda (reclamações e devoluções)</strong> e depois clique em <strong>Reconectar</strong> no Mercado Livre em Integrações.</div>`:''}
 ${st.erro?`<div class="notice warnbox">${esc(st.erro)}</div>`:''}
 <div class="grid kpis4 at-kpis">${kpi('fila','Na fila',ab.length,`${ab.filter(esperandoNos).length} aguardando resposta nossa`)}${kpi('urgentes','Urgentes',l.filter(FILTROS[1][2]).length,'Prazo < 24 h ou mediação',l.filter(FILTROS[1][2]).length?'red':'')}${kpi('perguntas','Perguntas',l.filter(FILTROS[4][2]).length,'Sem resposta')}${kpi('resolvidos','Resolvidos em 30 dias',res30.length,tempoMedio!=null?`Tempo médio ${tempoMedio<48?Math.round(tempoMedio)+' h':Math.round(tempoMedio/24)+' dias'}`:'—','green')}</div>
 <div class="crmbar"><div class="segtabs">${FILTROS.map(([k,t,fx])=>`<button class="${st.filtro===k?'active':''}" data-at-filtro="${k}">${t}${k==='melhorias'?` <small>${padroes().filter(g=>g.n>=2&&!melhorias().some(x=>x.produto===g.produto&&x.caso===g.caso&&x.status!=='feita')).length||''}</small>`:k!=='resolvidos'?` <small>${l.filter(fx).length}</small>`:''}</button>`).join('')}</div>
  <div class="segtabs">${[['','Todos'],...[...new Set(l.map(a=>a.canal))].map(c=>[c,CANAL[c]||c])].map(([k,t])=>`<button class="${st.canal===k?'active':''}" data-at-canal="${esc(k)}">${esc(t)}</button>`).join('')}</div>
  <div class="searchin">${icon('search')}<input type="search" id="atBusca" placeholder="Pedido, produto, cliente, motivo…" value="${esc(st.busca)}"></div>
  <button class="small" data-at="atualizar" ${st.mlConectado?'':'disabled'}>${icon('refresh')} Atualizar agora</button>
  <button class="small quiet" data-at="notif">${icon('bell')} ${st.notificar?'Notificações ligadas':'Ativar notificações'}</button></div>
 <p class="caption" style="margin:-6px 0 14px">Atualiza sozinho a cada 10 minutos${st.info?.fim?` · última leitura ${dataHora(st.info.fim)}`:''}. Ordem da fila: prazo do marketplace, mediações, valor e tempo sem resposta.</p>
 ${st.filtro==='melhorias'?melhoriasView():`<div class="atgrid"><div>${lista.length?`<div class="atlista">${lista.map(linha).join('')}</div>`:`<div class="card empty">${st.filtro==='fila'?'Nenhum atendimento aberto. ✓':'Nada neste filtro.'}</div>`}</div>${lateral()}</div>`}`}
function linha(a){const [tn,tt]=TIPOS[a.tipo]||[a.tipo,''],r=regra(a),u=(a.mensagens||[]).at(-1);
 return `<button class="card atitem ${aberto(a)&&((horasAte(a.prazo)??99)<24||a.tipo==='mediacao')?'urg':''}" data-at-abrir="${esc(a.id)}">
  <div class="athead"><span class="badge ${tt}">${tn}</span><span class="caption">${CANAL[a.canal]||a.canal}${a.pedido?' · pedido '+esc(a.pedido):''}</span><span class="atprazo">${aberto(a)?prazoTxt(a):`<span class="badge ok">resolvido ${dataHora(a.fechado_em)}</span>`}</span></div>
  <strong class="attitulo">${esc(a.produto||pedidoDe(a)?.items?.[0]?.title||r.titulo)}</strong>
  <span class="caption">${esc(a.motivo||r.titulo)}${a.comprador?' · '+esc(a.comprador):''}${a.valor?' · '+money(a.valor):''}</span>
  ${u?`<span class="atmsg"><b>${u.de==='vendedor'?'Nós':'Cliente'}:</b> ${esc(String(u.texto||'').slice(0,160))}</span>`:''}
  ${aberto(a)?`<span class="atsug">${icon('spark')} <span>${esc(a.sugestao?.solucao||r.solucao)}</span></span>`:''}
  <span class="atfoot"><span data-at-pres="${esc(a.id)}"></span>${a.responsavel?`<span class="badge">${esc(a.responsavel)}</span>`:''}<span class="badge">${esc(a.etapa_interna||'novo')}</span>${a.devolucao?.status?`<span class="badge warn">devolução: ${esc(a.devolucao.status)}</span>`:''}</span></button>`}

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
 modal(`${tn} · ${a.produto||pedidoDe(a)?.items?.[0]?.title||a.id}`,`<div class="athead" style="margin-bottom:12px"><span class="badge ${tt}">${tn}</span><span class="caption">${CANAL[a.canal]||a.canal}${a.pedido?' · pedido '+esc(a.pedido):''}${a.valor?' · '+money(a.valor):''}${a.comprador?' · '+esc(a.comprador):''}</span><span class="atprazo">${aberto(a)?prazoTxt(a):'resolvido'}</span></div>
 <div data-at-pres-modal="${esc(a.id)}"></div>
 ${clienteHtml(a)}
 ${a.motivo?`<p><strong>Motivo:</strong> ${esc(a.motivo)}</p>`:''}
 ${(a.acoes||[]).length?`<p class="caption">Ações disponíveis no marketplace: ${a.acoes.map(x=>`${esc(x.acao)}${x.prazo?` (até ${dataHora(x.prazo)})`:''}`).join(' · ')}</p>`:''}
 ${a.devolucao?`<p class="caption">Devolução: ${esc(a.devolucao.status||'—')}${(a.devolucao.envios||[]).map(e=>` · envio ${esc(e.status||'')}${e.rastreio?' '+esc(e.rastreio):''}`).join('')}</p>`:''}
 <div class="atsolucao"><div class="navlabel" style="margin:0 0 6px">${s?'Sugestão da IA':'Solução sugerida'} · ${esc(r.titulo)}</div><p><strong>${esc(s?.solucao||r.solucao)}</strong></p>${s?.diagnostico?`<p class="caption">${esc(s.diagnostico)}</p>`:''}${(s?.passos||[]).length?`<ol class="atpassos">${s.passos.map(p=>`<li>${esc(p)}</li>`).join('')}</ol>`:''}
  <button class="small" data-at-ia="${esc(a.id)}">${icon('spark')} ${s?'Pedir nova sugestão à IA':'Analisar com IA'}</button></div>
 <div class="navlabel" style="margin:16px 0 8px">Conversa</div><div class="atconversa">${(a.mensagens||[]).map(m=>`<div class="atbolha ${m.de==='vendedor'?'nos':''}"><small>${m.de==='vendedor'?'Nós':m.de==='mediator'?'Mediador':'Cliente'} · ${dataHora(m.em)}</small>${esc(m.texto||'')}${m.anexos?` <small>· ${m.anexos} anexo(s)</small>`:''}</div>`).join('')||'<p class="caption">Sem mensagens.</p>'}</div>
 ${aberto(a)?`<div class="navlabel" style="margin:16px 0 8px">Respostas prontas</div><div class="atmodelos">${MODELOS.map(([k,t])=>`<button class="small" data-at-modelo="${k}" data-id="${esc(a.id)}">${t}</button>`).join('')}</div><label for="atTexto">Resposta ao cliente <span class="caption" id="atConta"></span></label><textarea id="atTexto" maxlength="${limite}" rows="4">${esc(s?.mensagem||r.mensagem)}</textarea>
 <div class="row wrap" style="margin-top:8px"><button class="primary" data-at-enviar="${esc(a.id)}" ${a.canal==='mercadolivre'||String(a.id).startsWith('portal-')?'':'disabled'}>${icon('send')} Enviar ao cliente</button>${String(a.id).startsWith('portal-')?(a.dados?.contato?`<span class="caption">Contato deixado: <b>${esc(a.dados.contato)}</b>${/\d{10,}/.test(String(a.dados.contato).replace(/\D/g,''))?` · <a href="https://wa.me/55${String(a.dados.contato).replace(/\D/g,'').replace(/^55/,'')}" target="_blank" rel="noopener">WhatsApp</a>`:''}</span>`:'<span class="caption">O cliente lê a resposta na Central do Cliente.</span>'):`<a class="btnlink" href="${linkML(a)}" target="_blank" rel="noopener">${icon('ext')} Abrir no ${CANAL[a.canal]||'marketplace'}</a>`}</div>
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
 if(d.atEnviar){const texto=$('#atTexto').value.trim();if(!texto){toast('Escreva a resposta.');return}if(!confirm(d.atEnviar.startsWith('portal-')?'Enviar esta resposta ao cliente? Ele lê na Central do Cliente (e pelo contato que deixou).':'Enviar esta resposta ao cliente no Mercado Livre?'))return;b.disabled=true;
  try{const r=await fn('atendimento_responder',{id:d.atEnviar,texto});const a=st.lista.find(x=>x.id===d.atEnviar);if(a){a.mensagens=r.mensagens;if(a.tipo==='pergunta'){a.status='fechado';a.fechado_em=new Date().toISOString()}}
   const campos={etapa_interna:a?.tipo==='pergunta'?'resolvido':'aguardando cliente',responsavel:$('#atResp').value.trim()||a?.responsavel||null};await salvar(d.atEnviar,campos).catch(()=>{});toast('Resposta enviada.');closeModal();render()}
  catch(x){toast(x.message);b.disabled=false}}
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-at-canal],[data-at-criar],[data-at-feita],[data-at-dev],[data-at-buscar]');if(!b)return;const d=b.dataset;
 if(d.atCanal!=null){st.canal=d.atCanal;render();return}
 if(d.atBuscar){st.busca=d.atBuscar;st.filtro='resolvidos'===st.filtro?'fila':st.filtro;render();return}
 if(d.atDev){closeModal();if(page!=='nfdevolucao')navigate('nfdevolucao');setTimeout(()=>window.NfDevolucao?.nova?.(d.atDev),80);return}
 if(d.atCriar){const [p,c]=d.atCriar.split('|');criarMelhoria(p,c);if(document.querySelector('.modalback'))closeModal();st.filtro='melhorias';toast('Ação de melhoria registrada. Acompanhe em Atendimento › Melhorias.');render();return}
 if(d.atFeita){salvarMelhorias(melhorias().map(x=>x.id===d.atFeita?{...x,status:'feita',feita_em:new Date().toISOString()}:x));audit('Melhoria concluída (atendimento)',d.atFeita);render();return}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-at-modelo]');if(!b)return;const a=st.lista.find(x=>x.id===b.dataset.id),m=MODELOS.find(x=>x[0]===b.dataset.atModelo),t=$('#atTexto');if(!a||!m||!t)return;
 t.value=preencher(m[2],a).slice(0,Number(t.maxLength)||2000);t.dispatchEvent(new Event('input'));t.focus();document.querySelectorAll('[data-at-modelo]').forEach(x=>x.classList.toggle('primary',x===b))});
function bind(){setTimeout(()=>{try{presConectar();presPintar()}catch{}},0);const i=$('#atBusca');if(i)i.oninput=e=>{st.busca=e.target.value;const pos=e.target.selectionStart;render();const n=$('#atBusca');n.focus();n.setSelectionRange(pos,pos)}}
// ─────────── Melhorar para o cliente ───────────
// Padrões (mesmo produto + mesmo problema) viram sugestões de melhoria; a ação registrada mostra se os casos pararam.
const ACOES={naochegou:'Revisar prazo de postagem e transportadora; avisar o cliente assim que despachar.',defeito:'Acionar o fornecedor e reforçar a conferência de qualidade antes do envio.',faltando:'Reforçar a conferência de expedição (bipagem) e a embalagem das peças pequenas.',diferente:'Conferir a separação e as fotos/variações do anúncio.',arrependimento:'Deixar o anúncio mais claro: medidas, idade indicada e fotos reais.',cancelamento:'Encurtar o tempo entre a venda e o despacho.',outro:'Ler os casos e ajustar o anúncio ou o processo.'};
let idxPed=null,idxN=-1;
function pedidoDe(a){const p=String(a?.pedido||'').trim();if(!p)return null;if(!idxPed||idxN!==db.orders.length){idxPed=new Map();idxN=db.orders.length;for(const o of db.orders){idxPed.set(String(o.id),o);for(const x of o.external?.ml_order_ids||[])idxPed.set(String(x),o);if(o.external?.ml_order_id)idxPed.set(String(o.external.ml_order_id),o);if(o.external?.pack_id)idxPed.set(String(o.external.pack_id),o)}}return idxPed.get(p)||null}
const produtoDe=a=>a.produto||pedidoDe(a)?.items?.[0]?.title||'Produto não informado';
const CASO_ROT=k=>PLAY[k]?.[0]||k;
const melhorias=()=>db.gerencial?.melhorias||[];
function salvarMelhorias(l){db.gerencial={...(db.gerencial||{}),melhorias:l};save()}
const quando=a=>new Date(a.aberto_em||a.created_at||a.updated_at||0).getTime();
function padroes(dias=60){const ini=Date.now()-dias*864e5,m=new Map();
 for(const a of st.lista){if(['pergunta','mensagem'].includes(a.tipo)||quando(a)<ini)continue;const c=caso(a),p=produtoDe(a),k=p+'|'+c;const g=m.get(k)||{produto:p,caso:c,n:0,valor:0,ids:[]};g.n++;g.valor+=Number(a.valor)||0;g.ids.push(a.id);m.set(k,g)}
 return [...m.values()].sort((a,b)=>b.n-a.n||b.valor-a.valor)}
function lateral(){const ini=Date.now()-30*864e5,rec=st.lista.filter(a=>!['pergunta','mensagem'].includes(a.tipo)&&quando(a)>=ini),mot=new Map(),prod=new Map();
 for(const a of rec){const c=caso(a);mot.set(c,(mot.get(c)||0)+1);const p=produtoDe(a);prod.set(p,(prod.get(p)||0)+1)}
 const top=(m,n)=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,n),max=Math.max(1,...mot.values());
 const prazos=st.lista.filter(a=>aberto(a)&&a.prazo).sort((a,b)=>String(a.prazo).localeCompare(String(b.prazo))).slice(0,5);
 const sug=padroes().filter(g=>g.n>=2&&!melhorias().some(x=>x.produto===g.produto&&x.caso===g.caso&&x.status!=='feita')).length;
 return `<div class="atlado"><div data-at-equipe></div><section class="card"><h3>Motivos em 30 dias</h3>${top(mot,6).map(([c,n])=>`<div class="atbar"><span>${esc(CASO_ROT(c))}</span><i style="width:${Math.round(n/max*100)}%"></i><b>${n}</b></div>`).join('')||'<p class="caption">Sem casos no período.</p>'}</section>
 <section class="card"><h3>Produtos com mais chamados</h3>${top(prod,5).map(([p,n])=>`<button class="atlinha" data-at-buscar="${esc(p)}"><span>${esc(String(p).slice(0,48))}</span><b>${n}</b></button>`).join('')||'<p class="caption">—</p>'}</section>
 <section class="card"><h3>Próximos prazos</h3>${prazos.map(a=>`<button class="atlinha" data-at-abrir="${esc(a.id)}"><span>${esc(String(produtoDe(a)!=='Produto não informado'?produtoDe(a):a.motivo||a.id).slice(0,40))}</span><b>${prazoTxt(a)}</b></button>`).join('')||'<p class="caption">Nenhum prazo em aberto.</p>'}</section>
 ${sug?`<section class="card atdica"><strong>${sug} padrão(ões) se repetindo</strong><p class="caption">O mesmo produto com o mesmo problema. Veja a aba Melhorias para agir na causa.</p><button class="small primary" data-at-filtro="melhorias">Ver melhorias</button></section>`:''}</div>`}
function melhoriasView(){const P=padroes(),M=melhorias(),abertas=M.filter(x=>x.status!=='feita'),feitas=M.filter(x=>x.status==='feita');
 const depois=x=>st.lista.filter(a=>produtoDe(a)===x.produto&&caso(a)===x.caso&&quando(a)>new Date(x.criado_em).getTime()).length;
 const sug=P.filter(g=>g.n>=2&&!M.some(x=>x.produto===g.produto&&x.caso===g.caso&&x.status!=='feita'));
 return `<div class="notice">Cada reclamação repetida é uma chance de melhorar para o próximo cliente. O Jarvis agrupa os casos dos últimos 60 dias por produto e problema e sugere a ação. Registre, conclua e acompanhe se os casos pararam.</div>
 <div class="stack"><section class="tablebox"><div class="tabletop"><h2>Padrões se repetindo</h2><span class="caption">2 ou mais casos em 60 dias</span></div><div class="tablewrap"><table><thead><tr><th>Produto</th><th>Problema</th><th class="num">Casos</th><th>Ação sugerida</th><th></th></tr></thead><tbody>
 ${sug.map(g=>`<tr><td><strong>${esc(g.produto)}</strong></td><td>${esc(CASO_ROT(g.caso))}</td><td class="num">${g.n}</td><td class="caption" style="white-space:normal;min-width:260px">${esc(ACOES[g.caso]||ACOES.outro)}</td><td><button class="small primary" data-at-criar="${esc(g.produto)}|${esc(g.caso)}">Criar ação</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum padrão se repetindo. ✓</td></tr>'}</tbody></table></div></section>
 <section class="tablebox"><div class="tabletop"><h2>Ações de melhoria</h2><span class="caption">${abertas.length} em andamento · ${feitas.length} concluída(s)</span></div><div class="tablewrap"><table><thead><tr><th>Ação</th><th>Situação</th><th class="num">Casos depois</th><th></th></tr></thead><tbody>
 ${[...abertas,...feitas].map(x=>`<tr><td><strong>${esc(x.produto)}</strong> · ${esc(CASO_ROT(x.caso))}<br><span class="caption">${esc(x.acao)}</span><br><span class="caption">${esc(String(x.por||'').split('@')[0])} · ${new Date(x.criado_em).toLocaleDateString('pt-BR')}</span></td><td><span class="badge ${x.status==='feita'?'ok':'warn'}">${x.status==='feita'?'concluída '+new Date(x.feita_em).toLocaleDateString('pt-BR'):'em andamento'}</span></td><td class="num ${depois(x)?'red':'green'}">${depois(x)}</td><td>${x.status==='feita'?'':`<button class="small" data-at-feita="${esc(x.id)}">Concluir</button>`}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nenhuma ação registrada ainda.</td></tr>'}</tbody></table></div></section></div>`}
function criarMelhoria(produto,c,acao){const l=[...melhorias(),{id:'mel-'+Date.now().toString(36),produto,caso:c,acao:acao||ACOES[c]||ACOES.outro,status:'aberta',criado_em:new Date().toISOString(),por:window.Cloud?.session?.user?.email||'local'}];salvarMelhorias(l);audit('Melhoria registrada (atendimento)',`${produto} · ${CASO_ROT(c)}`)}
// Cliente e pedido dentro do caso: itens, valor, nota, compras anteriores e outros chamados.
function clienteHtml(a){const o=pedidoDe(a);
 const nome=o?.customer?.name||a.comprador||'',doc=String(o?.customer?.doc||'').replace(/\D/g,'');
 const compras=doc?db.orders.filter(x=>String(x.customer?.doc||'').replace(/\D/g,'')===doc):nome?db.orders.filter(x=>x.customer?.name===nome):[];
 const outros=st.lista.filter(x=>x.id!==a.id&&((nome&&x.comprador===nome)||(a.pedido&&x.pedido===a.pedido)));
 return `<div class="atcliente"><div><div class="navlabel" style="margin:0 0 6px">Pedido</div>${o?`<p><strong>${esc(o.id)}</strong> · ${esc(o.platform)} · ${new Date(o.date+'T12:00').toLocaleDateString('pt-BR')}${o.nf?` · NF ${esc(o.nf)}`:''}</p><ul class="caption" style="margin:0;padding-left:18px">${(o.items||[]).map(i=>`<li>${Number(i.qty)||1}× ${esc(i.title||i.sku)} · ${money((Number(i.qty)||1)*(Number(i.price)||0))}</li>`).join('')}</ul><p class="caption">Total ${money(o.gross)}${o.state?` · ${esc(o.state)}`:''}</p>`:'<p class="caption">Pedido não encontrado no Jarvis.</p>'}</div>
 <div><div class="navlabel" style="margin:0 0 6px">Cliente</div><p><strong>${esc(nome||'—')}</strong></p><p class="caption">${compras.length} compra(s) · ${money(compras.reduce((s,x)=>s+(Number(x.gross)||0),0))}${compras.length>1?' · cliente recorrente':''}<br>${outros.length?`${outros.length} outro(s) chamado(s)`:'primeiro chamado'}</p></div></div>
 <div class="row wrap" style="gap:8px;margin:8px 0 4px">${o&&window.NfDevolucao?`<button class="small" data-at-dev="${esc(o.id)}">${icon('undo')} Preparar nota de devolução</button>`:''}<button class="small" data-at-criar="${esc(produtoDe(a))}|${esc(caso(a))}">${icon('spark')} Registrar melhoria</button></div>`}

// ─────────── Quem está atendendo agora (presença em tempo real) ───────────
// Cada pessoa com a tela aberta avisa, pelo canal em tempo real do Supabase, qual caso está vendo e se está escrevendo.
// Nada é gravado no banco: some quando a pessoa fecha o caso ou a tela. Aparece discreto na fila e dentro do caso.
const pres={ch:null,ws:null,eu:'',meu:{caso:null,escrevendo:false},casos:new Map(),online:[]};
const euMesmo=()=>{const u=window.Cloud?.session?.user;return {email:u?.email||'',nome:(u?.user_metadata?.nome||u?.email||'').split(/[\s@]/)[0]}};
const hm=d=>new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
function presConectar(){const c=window.Cloud;if(!c?.client?.channel||!c.ws||!c.session?.user)return;if(pres.ch&&pres.ws===c.ws)return;
 try{if(pres.ch)c.client.removeChannel(pres.ch)}catch{}const eu=euMesmo();pres.eu=eu.email;pres.ws=c.ws;
 const ch=c.client.channel(`atendimento-presenca-${c.ws}`,{config:{presence:{key:eu.email||'anon'}}});pres.ch=ch;
 ch.on('presence',{event:'sync'},()=>{const est=ch.presenceState(),m=new Map(),on=[];
  for(const [k,l] of Object.entries(est)){const p=(l||[]).at(-1);if(!p)continue;on.push(p);if(p.caso&&k!==pres.eu){(m.get(p.caso)||m.set(p.caso,[]).get(p.caso)).push(p)}}
  pres.casos=m;pres.online=on;presPintar()}).subscribe(s=>{if(s==='SUBSCRIBED')presEnviar()})}
function presEnviar(){if(!pres.ch)return;const eu=euMesmo();try{pres.ch.track({nome:eu.nome,email:eu.email,caso:pres.meu.caso,desde:pres.meu.desde||null,escrevendo:!!pres.meu.escrevendo,em:new Date().toISOString()})}catch{}}
function presCaso(id){if(pres.meu.caso===id)return;pres.meu={caso:id,desde:id?new Date().toISOString():null,escrevendo:false};presEnviar()}
let escT=0;function presEscrevendo(){if(!pres.meu.caso)return;if(!pres.meu.escrevendo){pres.meu.escrevendo=true;presEnviar()}clearTimeout(escT);escT=setTimeout(()=>{pres.meu.escrevendo=false;presEnviar()},6000)}
const quemTxt=l=>l.map(p=>`${esc(p.nome||'alguém')}${p.escrevendo?' está escrevendo…':' está vendo'}`).join(' · ');
function presPintar(){for(const el of document.querySelectorAll('[data-at-pres]')){const l=pres.casos.get(el.dataset.atPres)||[];el.innerHTML=l.length?`<span class="atpres ${l.some(p=>p.escrevendo)?'escr':''}" title="Em atendimento agora (desde ${hm(l[0].desde||l[0].em)})"><i></i>${quemTxt(l)}</span>`:''}
 const m=document.querySelector('[data-at-pres-modal]');if(m){const l=pres.casos.get(m.dataset.atPresModal)||[];m.innerHTML=l.length?`<div class="atpresbox"><i></i><span><strong>${quemTxt(l)}</strong> neste caso agora (desde ${hm(l[0].desde||l[0].em)}). Combine antes de responder para o cliente não receber duas respostas.</span></div>`:''}
 const eq=document.querySelector('[data-at-equipe]');if(eq){const outros=pres.online.filter(p=>p.email!==pres.eu);eq.innerHTML=outros.length?`<section class="card"><h3>Equipe agora</h3>${outros.map(p=>{const a=p.caso&&st.lista.find(x=>x.id===p.caso);return `<div class="atlinha" style="cursor:default"><span><i class="atdot ${p.caso?'on':''}"></i>${esc(p.nome||'alguém')}</span><small class="caption">${a?(p.escrevendo?'escrevendo · ':'')+esc(String(produtoDe(a)).slice(0,26)):'na fila'}</small></div>`}).join('')}</section>`:''}}
// Caso aberto = modal com a marca data-at-pres-modal; fechou o modal, a pessoa sai do caso.
setInterval(()=>{if(page==='atendimento')presConectar();const m=document.querySelector('[data-at-pres-modal]');presCaso(m?m.dataset.atPresModal:null)},1500);
document.addEventListener('input',e=>{if(e.target?.id==='atTexto')presEscrevendo()});

addPage('atendimento','headset','Atendimento',view,'Reclamações, devoluções, mediações, perguntas e mensagens numa fila só — com a solução sugerida e a resposta pronta.','',bind);
window.Atendimento={avisos,abertos:abertosN,carregar,lista:()=>st.lista,resumo:()=>{const ab=st.lista.filter(aberto),urg=ab.filter(x=>{const h=horasAte(x.prazo);return (h!=null&&h<24)||x.tipo==='mediacao'}),d7=Date.now()-7*864e5,res=st.lista.filter(x=>!aberto(x)&&new Date(x.fechado_em||0).getTime()>=d7);return {carregado:st.carregado,fila:ab.length,urgentes:urg.length,resolvidos7:res.length,atendendo:pres.casos.size,online:pres.online.length,ultimo:ab.sort((x,y)=>String(x.prazo||'9').localeCompare(String(y.prazo||'9')))[0]||null}}};
// Primeira leitura assim que a empresa abre; depois a cada 2 minutos (o servidor lê o marketplace a cada 10).
let ultimoWs=null;setInterval(()=>{if(window.Cloud?.ws&&window.Cloud.ws!==ultimoWs){ultimoWs=Cloud.ws;st.carregado=false;st.lista=[];carregar(true)}},1500);
setInterval(()=>{if(window.Cloud?.ws&&!document.hidden)carregar(true)},120000);
})();
