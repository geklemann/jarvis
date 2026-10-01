'use strict';
// Produtos e anúncios: o cadastro que vai para os marketplaces, feito aqui e entregue pelo Bling às lojas já
// conectadas nele. Mostra cada produto com foto, preço, custo, margem, estoque e o preço em cada canal; edita o
// cadastro (nome, preço, GTIN, NCM, origem, medidas, fotos), o preço por canal e cria/publica anúncios.
(()=>{
const st={vinc:null,carregando:false,erro:'',busca:'',filtro:'todos',pag:0};
window.Reiniciar?.registrar(st,['busca','filtro','pag']); // estado de tela: volta ao original ao clicar no menu
const nf=(v,d=0)=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:d});
const ORIGENS=[[0,'0 · Nacional'],[1,'1 · Importação direta'],[2,'2 · Importado no mercado interno'],[3,'3 · Nacional, conteúdo importado > 40%'],[5,'5 · Nacional, conteúdo importado ≤ 40%'],[8,'8 · Nacional, conteúdo importado > 70%']];
const CORES={'Shopee':'#ee4d2d','MercadoLivre':'#e6b800','Mercado Livre':'#e6b800','Magalu':'#0086ff','MagazineLuiza':'#0086ff','IntegraCommerce':'#0086ff'};
async function fn(action,body={}){const r=await Cloud.client.functions.invoke('integrations',{body:{workspace_id:Cloud.ws,action,...body}});if(r.error){let msg=r.error.message;try{msg=(await r.error.context.json()).error||msg}catch{}throw Error(msg)}return r.data}
const podeEditar=()=>['owner','member','estoque'].includes(window.Cloud?.role||'owner');
async function carregar(){if(st.carregando||!window.Cloud?.ws)return;st.carregando=true;st.erro='';try{st.vinc=await fn('catalogo_vinculos')}catch(e){st.erro=e.message;st.vinc={canais:[],vinculos:[]}}finally{st.carregando=false;if(page==='catalogo'&&!document.querySelector('.modalback'))render()}}
function base(){const lista=(window.Estoque?.lista?.()||[]).filter(p=>p.formato!=='V'),V=st.vinc?.vinculos||[],canais=(st.vinc?.canais||[]).filter(c=>c.ativo);
 const porProd=new Map();for(const v of V){const k=String(v.produto);(porProd.get(k)||porProd.set(k,[]).get(k)).push(v)}
 const linhas=lista.map(p=>{const vs=porProd.get(String(p.bling_id))||[],preco=Number(p.preco)||0,custo=Number(p.custo)||0;const mg=vs.map(v=>Number(v.promocional||v.preco)||0).filter(Boolean).map(pv=>(pv-custo)/pv);return {p,vs,preco,custo,margem:custo&&mg.length?Math.min(...mg):null,faltam:canais.filter(c=>!vs.some(v=>v.loja===c.id)),semFoto:!p.imagem,semNcm:!p.ncm}});
 return {linhas,canais}}
function view(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver o catálogo.</div>';if(!st.vinc&&!st.carregando)carregar();if(!(window.Estoque?.lista?.()||[]).length){window.Estoque?.carregar?.();return '<div class="empty">Carregando os produtos…</div>'}
 const {linhas,canais}=base(),q=normalized(st.busca);
 const F={todos:()=>true,semanuncio:x=>x.faltam.length,semfoto:x=>x.semFoto,semncm:x=>x.semNcm,margem:x=>x.margem!=null&&x.margem<0.3};
 let l=linhas.filter(F[st.filtro]||F.todos).filter(x=>!q||normalized(x.p.nome+' '+x.p.id+' '+(x.p.gtin||'')).includes(q)).sort((a,b)=>b.faltam.length-a.faltam.length||String(a.p.nome).localeCompare(b.p.nome));
 const cont=k=>linhas.filter(F[k]).length,POR=40,pags=Math.max(1,Math.ceil(l.length/POR));st.pag=Math.min(st.pag,pags-1);
 const kp=(k,t,v,s,tom='')=>`<button class="card kpi kpibtn ${st.filtro===k?'on':''}" data-cat-filtro="${k}"><span class="kpil">${t}</span><span class="kpiv ${tom}">${v}</span><span class="kpis">${s}</span></button>`;
 return `<div class="grid kpis4">${kp('todos','Produtos no catálogo',nf(linhas.length),`${canais.length} canal(is) conectado(s) no Bling`)}${kp('semanuncio','Faltando em algum canal',nf(cont('semanuncio')),'produto sem vínculo com todas as lojas',cont('semanuncio')?'gold':'')}${kp('semfoto','Sem foto',nf(cont('semfoto')),'anúncio sem foto vende menos',cont('semfoto')?'red':'')}${kp('semncm','Sem NCM',nf(cont('semncm')),'necessário para a nota fiscal',cont('semncm')?'red':'')}</div>
 ${st.erro?`<div class="notice warnbox"><strong>Não consegui ler os canais no Bling.</strong> ${esc(st.erro)}</div>`:''}
 <div class="catcanais">${canais.map(c=>{const n=linhas.filter(x=>x.vs.some(v=>v.loja===c.id)).length;return `<div class="catcanal" style="--c:${CORES[c.tipo]||'var(--accent)'}"><span class="plogo">${esc(String(c.tipo||'?').slice(0,2).toUpperCase())}</span><div><strong>${esc(c.descricao)}</strong><small>${nf(n)} de ${nf(linhas.length)} produtos vinculados</small><span class="bar"><i style="width:${linhas.length?n/linhas.length*100:0}%;background:var(--c)"></i></span></div></div>`}).join('')||(st.carregando?'<p class="caption">Lendo os canais conectados no Bling…</p>':'')}</div>
 <div class="crmbar"><div class="searchin" style="flex:1;max-width:420px">${icon('search')}<input type="search" id="catBusca" placeholder="Produto, SKU ou GTIN…" value="${esc(st.busca)}"></div>
  <select data-cat="filtro" aria-label="Filtro"><option value="todos">Todos</option><option value="semanuncio" ${st.filtro==='semanuncio'?'selected':''}>Faltando em algum canal</option><option value="semfoto" ${st.filtro==='semfoto'?'selected':''}>Sem foto</option><option value="semncm" ${st.filtro==='semncm'?'selected':''}>Sem NCM</option><option value="margem" ${st.filtro==='margem'?'selected':''}>Canal com margem bruta abaixo de 30%</option></select>
  <button class="small" data-cat="recarregar">${icon('refresh')} Atualizar do Bling</button>${podeEditar()?`<button class="small primary" data-cat="novo">${icon('plus')} Novo produto</button>`:''}</div>
 <p class="caption" style="margin:-6px 0 14px">O cadastro é salvo no Bling, que envia às lojas conectadas nele. Preço por canal = vínculo do produto com a loja no Bling. Margem bruta do canal = (preço no canal − custo) ÷ preço, antes de tarifas e impostos; a margem real, depois de tudo, está no Radar de margem.</p>
 <div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Produto</th><th class="num">Custo</th><th class="num">Menor margem</th><th class="num">Estoque</th>${canais.map(c=>`<th class="num">${esc(c.descricao)}</th>`).join('')}<th></th></tr></thead><tbody>
 ${l.slice(st.pag*POR,st.pag*POR+POR).map(x=>`<tr class="clickrow" data-cat-abrir="${esc(x.p.id)}"><td class="comfoto">${window.Estoque?.foto?.(x.p.id)||''}<strong>${esc(x.p.nome)}</strong><br><span class="caption mono">${esc(x.p.id)}</span>${x.semNcm?' <span class="badge bad">sem NCM</span>':''}</td>
  <td class="num">${x.custo?money(x.custo):'—'}</td><td class="num ${x.margem!=null&&x.margem<0.3?'red':''}">${x.margem==null?'—':nf(x.margem*100,1)+'%'}</td><td class="num">${nf(x.p.saldo)}</td>
  ${canais.map(c=>{const v=x.vs.find(v=>v.loja===c.id);return `<td class="num">${v?(()=>{const pv=Number(v.promocional||v.preco)||0,m=pv&&x.custo?(pv-x.custo)/pv:null;return `${money(pv)}${v.promocional?` <small class="caption"><s>${money(v.preco)}</s></small>`:''}${m!=null?`<br><small class="${m<0.3?'red':'caption'}">margem ${nf(m*100,1)}%</small>`:''}`})():'<span class="badge warn">sem vínculo</span>'}</td>`}).join('')}<td>${icon('arrow')}</td></tr>`).join('')||`<tr><td colspan="${5+canais.length}" class="empty">${st.carregando?'Carregando…':'Nenhum produto neste filtro.'}</td></tr>`}</tbody></table></div>
 ${pags>1?`<div class="tabletop"><span class="caption">${nf(l.length)} produto(s)</span><div class="row"><button class="small" data-cat-pag="-1" ${st.pag?'':'disabled'}>‹</button><span class="caption">página ${st.pag+1} de ${pags}</span><button class="small" data-cat-pag="1" ${st.pag<pags-1?'':'disabled'}>›</button></div></div>`:''}</div>`}

// ─────────── Ficha do produto ───────────
let ed=null;
function ficha(sku){const {linhas,canais}=base(),x=linhas.find(y=>y.p.id===sku),p=x?.p||{},novo=!x;const pode=podeEditar();
 ed={sku:p.id||'',blingId:p.bling_id||'',fotos:p.imagem?[p.imagem]:[]};ed.fotosOrig=JSON.stringify(ed.fotos);
 const campo=(k,t,v,extra='')=>`<div class="field"><label for="cf_${k}">${t}</label><input id="cf_${k}" data-cf="${k}" value="${esc(v??'')}" ${pode?'':'disabled'} ${extra}></div>`;
 modal(novo?'Novo produto':esc(p.nome),`<div class="catficha">
  <div class="catfotos" id="catFotos">${fotosHTML()}</div>
  <div class="navlabel">Dados do produto</div>
  <div class="grid three">${campo('nome','Nome',p.nome,'style="grid-column:span 2"')}${campo('codigo','Código (SKU)',p.id,novo?'':'disabled')}${campo('preco','Preço base no Bling (R$)',p.preco)}${campo('gtin','GTIN / EAN',p.gtin)}${campo('marca','Marca','')}</div>
  <div class="navlabel">Fiscal</div>
  <div class="grid three">${campo('ncm','NCM',p.ncm)}${campo('cest','CEST',p.cest)}<div class="field"><label for="cf_origem">Origem</label><select id="cf_origem" data-cf="origem" ${pode?'':'disabled'}><option value="">—</option>${ORIGENS.map(([v,t])=>`<option value="${v}" ${String(p.origem)===String(v)?'selected':''}>${t}</option>`).join('')}</select></div></div>
  <div class="navlabel">Peso e medidas da embalagem</div>
  <div class="grid three">${campo('pesoBruto','Peso bruto (kg)','')}${campo('largura','Largura (cm)','')}${campo('altura','Altura (cm)','')}${campo('profundidade','Comprimento (cm)','')}${campo('volumes','Volumes','')}</div>
  <div class="field"><label for="cf_descricao">Descrição</label><textarea id="cf_descricao" data-cf="descricao" rows="4" ${pode?'':'disabled'} placeholder="Deixe em branco para manter a descrição atual do Bling"></textarea></div>
  <p class="caption">Campos em branco não são alterados no Bling.</p>
  ${!novo&&canais.length?`<div class="navlabel">Preço em cada canal</div><div class="catprecos">${canais.map(c=>{const v=x.vs.find(v=>v.loja===c.id);return `<div class="catpreco"><strong>${esc(c.descricao)}</strong><input data-cp-preco="${c.id}" value="${v?.preco??''}" placeholder="preço" ${pode?'':'disabled'}><input data-cp-promo="${c.id}" value="${v?.promocional||''}" placeholder="promocional" ${pode?'':'disabled'}><input data-cp-cod="${c.id}" value="${esc(v?.codigo||'')}" placeholder="código do anúncio no canal" ${pode?'':'disabled'}>${pode?`<button class="small" data-cp-salvar="${c.id}" data-vinculo="${v?.id||''}">Salvar</button>`:''}</div>`}).join('')}</div>`:''}
  <div id="catMsg" class="caption" style="min-height:20px;margin-top:10px"></div>
  <div class="modalfoot">${!novo&&pode&&canais.length?`<button data-cat="anunciar">${icon('spark')} Novo anúncio</button>`:''}<button data-action="close">Fechar</button>${pode?`<button class="primary" data-cat="salvar">${icon('check')} Salvar no Bling</button>`:''}</div></div>`)}
function fotosHTML(){return `${ed.fotos.map((u,i)=>`<figure class="catfoto"><img src="${esc(u)}" alt=""><button class="small quiet" data-cat-rmfoto="${i}" aria-label="Remover">×</button></figure>`).join('')}${podeEditar()?`<label class="catfoto catadd">${icon('plus')}<span>Foto</span><input type="file" accept="image/jpeg,image/png,image/webp" id="catUp" hidden></label>`:''}`}
const valores=()=>{const d={};document.querySelectorAll('[data-cf]').forEach(i=>{if(!i.disabled||i.dataset.cf==='codigo')d[i.dataset.cf]=i.value.trim()});return d};
const msg=(t,tom='')=>{const m=$('#catMsg');if(m){m.className='caption '+tom;m.innerHTML=t}};

// ─────────── Novo anúncio ───────────
function anuncio(){const {canais}=base(),d=valores();modal('Novo anúncio',`<p class="caption" style="margin-top:-10px">O anúncio é criado como rascunho no Bling. Confira e clique em Publicar para ele ir ao ar no canal.</p>
 <div class="grid two"><div class="field"><label for="an_loja">Canal</label><select id="an_loja">${canais.map(c=>`<option value="${c.id}" data-tipo="${esc(c.tipo)}">${esc(c.descricao)} (${esc(c.tipo)})</option>`).join('')}</select></div>
 <div class="field"><label for="an_preco">Preço (R$)</label><input id="an_preco" value="${esc(d.preco||'')}"></div></div>
 <div class="field"><label for="an_titulo">Título <span class="caption" id="an_cont"></span></label><input id="an_titulo" maxlength="120" value="${esc(d.nome||'')}"></div>
 <div class="grid two"><div class="field"><label for="an_cat">Categoria do canal</label><input id="an_cat" placeholder="Ex.: MLB1234 (Mercado Livre)"></div>
 <div class="field"><label for="an_mod">Tipo de anúncio (Mercado Livre)</label><select id="an_mod"><option value="gold_special">Clássico</option><option value="gold_pro">Premium</option></select></div></div>
 <label class="check-l"><input type="checkbox" id="an_frete" class="check"> Frete grátis</label>
 <div class="field"><label for="an_desc">Descrição</label><textarea id="an_desc" rows="5">${esc(d.descricao||'')}</textarea></div>
 <p class="caption">${ed.fotos.length} foto(s) do produto vão no anúncio.</p><div id="anMsg" class="caption" style="min-height:20px"></div>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" id="anCriar">${icon('check')} Criar rascunho no Bling</button></div>`);
 const t=$('#an_titulo'),c=$('#an_cont'),up=()=>{c.textContent=`${t.value.length} caracteres${t.value.length>60?' · o Mercado Livre aceita até 60':''}`};t.oninput=up;up();
 $('#anCriar').onclick=async()=>{const s=$('#an_loja'),o=s.selectedOptions[0],m=$('#anMsg'),b=$('#anCriar');b.disabled=true;m.textContent='Criando no Bling…';
  try{const r=await fn('catalogo_anuncio',{dados:{produto:ed.blingId,tipo:o.dataset.tipo,loja:s.value,titulo:t.value,preco:$('#an_preco').value,categoria:$('#an_cat').value,modalidade:$('#an_mod').value,freteGratis:$('#an_frete').checked,descricao:$('#an_desc').value,fotos:ed.fotos}});
   m.innerHTML=`<span class="green">Rascunho criado no Bling (anúncio ${esc(r.anuncio)}).</span> <button class="small primary" id="anPub">Publicar agora</button>`;b.hidden=true;
   $('#anPub').onclick=async()=>{m.textContent='Publicando…';try{await fn('catalogo_publicar',{dados:{anuncio:r.anuncio,tipo:o.dataset.tipo,loja:s.value}});m.innerHTML='<span class="green">Publicado. O canal pode levar alguns minutos para mostrar o anúncio.</span>';audit('Anúncio publicado',`${ed.sku} · ${o.textContent}`)}catch(e){m.innerHTML=`<span class="red">${esc(e.message)}</span>`}}}
  catch(e){m.innerHTML=`<span class="red">${esc(e.message)}</span>`;b.disabled=false}}}

document.addEventListener('click',async e=>{const b=e.target.closest('[data-cat],[data-cat-filtro],[data-cat-abrir],[data-cat-pag],[data-cp-salvar],[data-cat-rmfoto]');if(!b)return;const d=b.dataset;
 if(d.catFiltro){st.filtro=d.catFiltro;st.pag=0;render();return}
 if(d.catAbrir){ficha(d.catAbrir);return}
 if(d.catPag){st.pag+=Number(d.catPag);render();return}
 if(d.catRmfoto!=null){ed.fotos.splice(Number(d.catRmfoto),1);$('#catFotos').innerHTML=fotosHTML();return}
 if(d.cpSalvar){const loja=d.cpSalvar;b.disabled=true;msg('Salvando o preço no Bling…');
  try{const r=await fn('catalogo_preco_loja',{dados:{produto:ed.blingId,loja,vinculo:d.vinculo||null,preco:$(`[data-cp-preco="${loja}"]`).value.replace(',','.'),promocional:$(`[data-cp-promo="${loja}"]`).value.replace(',','.'),codigo:$(`[data-cp-cod="${loja}"]`).value}});b.dataset.vinculo=r.vinculo||d.vinculo;msg('Preço do canal salvo no Bling.','green');st.vinc=null}catch(x){msg(esc(x.message),'red')}finally{b.disabled=false}return}
 switch(d.cat){
  case 'recarregar':st.vinc=null;carregar();render();return;
  case 'novo':ficha(null);return;
  case 'anunciar':if(!ed.blingId){msg('Salve o produto no Bling antes de anunciar.','red');return}anuncio();return;
  case 'salvar':{const v=valores();if(!ed.blingId&&(!v.nome||!v.codigo)){msg('Informe nome e código (SKU).','red');return}b.disabled=true;msg('Salvando no Bling…');
   try{const r=await fn('catalogo_salvar',{dados:{...v,preco:v.preco?.replace(',','.'),blingId:ed.blingId,sku:ed.sku||v.codigo,fotos:JSON.stringify(ed.fotos)!==ed.fotosOrig||!ed.blingId?ed.fotos:undefined}});ed.fotosOrig=JSON.stringify(ed.fotos);ed.blingId=r.blingId;msg(r.criado?`Produto criado no Bling (id ${esc(r.blingId)}).`:'Alterações salvas no Bling.','green');audit(r.criado?'Produto criado no Bling':'Produto alterado no Bling',ed.sku||v.codigo);window.Estoque?.carregar?.()}
   catch(x){msg(esc(x.message),'red')}finally{b.disabled=false}return}}});
document.addEventListener('change',async e=>{if(e.target.matches('[data-cat="filtro"]')){st.filtro=e.target.value;st.pag=0;render();return}
 if(e.target.id!=='catUp')return;const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024){msg('A foto passa de 5 MB.','red');return}msg('Enviando a foto…');
 const b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)});
 try{const r=await fn('catalogo_foto',{dados:{base64:b64,nome:f.name}});ed.fotos.push(r.url);$('#catFotos').innerHTML=fotosHTML();msg('Foto enviada. Clique em Salvar no Bling para gravar no produto.','green')}catch(x){msg(esc(x.message),'red')}});
function bind(){const i=$('#catBusca');if(i)i.oninput=ev=>{st.busca=ev.target.value;st.pag=0;const p=ev.target.selectionStart;render();const n=$('#catBusca');n.focus();n.setSelectionRange(p,p)}}
window.Catalogo={carregar,_st:st};
addPage('catalogo','tag','Produtos e anúncios',view,'Cadastro dos produtos que vão para os marketplaces, preço em cada canal e anúncios — salvos no Bling, que entrega às lojas conectadas.','',bind);
})();
