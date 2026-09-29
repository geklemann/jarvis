'use strict';
// Preços › Formação de preço: a planilha "TABELA PREÇO DE VENDA E-COMMERCE", só que viva (DVV por grupo: Maral, Top Play, Terceiros). Um produto por linha e os
// canais lado a lado (ML Premium, ML Clássico, Magalu, Shopee): preço de tabela editável, margem, preço sugerido
// para a meta e o preço praticado nas vendas. Custo vem do Bling; frete e taxa fixa podem ser por produto (como na
// planilha). Ações em lote: aplicar sugerido, reajustar %, arredondar para ,90. Importa e exporta no layout da
// "TABELA E-COMMERCE" (abas por marca). Regras (comissões, impostos, ads, fixos) ficam em Tabela e Simulador › Regras.
(()=>{
Object.assign(paths,{calc:'M5 3h14v18H5z M8 7h8 M8 11h2 M12 11h2 M16 11h0 M8 15h2 M12 15h2 M8 19h2 M12 19h6'});
const CAN=[['mlp','ML Premium','Mercado Livre'],['mlc','ML Clássico','Mercado Livre Clássico'],['mag','Magalu','Magalu'],['shp','Shopee','Shopee']];
const PADRAO_CANAL={'Mercado Livre':{comissao:16.5,fixa:0,servico:0,frete:0,cupom:0,faixaAte:79,faixaValor:6.75,ativo:true},'Mercado Livre Clássico':{comissao:11.5,fixa:0,servico:0,frete:0,cupom:0,faixaAte:79,faixaValor:6.75,ativo:true},'Magalu':{comissao:14,fixa:5,servico:0,frete:0,cupom:0,faixaAte:0,faixaValor:0,ativo:true},'Shopee':{comissao:14,fixa:4,servico:6,frete:0,cupom:0,faixaAte:0,faixaValor:0,ativo:true}};
const ui={busca:'',filtro:'todos',marca:'',sel:new Set(),aberto:null,meta:null};
// DVV da planilha "TABELA PREÇO DE VENDA E-COMMERCE", por grupo (Maral, Top Play, Terceiros) e canal, em % do preço.
// Preço de tabela = (custo e-commerce + embalagem + frete + taxa fixa) ÷ (1 − DVV do canal). Maral e Top vendem ao
// e-commerce pelo DVV de compra (com IPI e crédito de ICMS); terceiros entram pelo custo de compra + quebra.
const DVV_ROT={pis:'PIS/COFINS',icms:'ICMS',difal:'DIFAL + FCP',irpj:'IRPJ',csll:'CSLL',comissao:'Comissão',margem:'Margem de lucro',adm:'Vendas/Adm'};
const canaisDVV=(icms,difal,margem)=>Object.fromEntries([['Mercado Livre',16.5],['Mercado Livre Clássico',11.5],['Magalu',18],['Shopee',20]].map(([c,com])=>[c,{pis:3.65,icms,difal,irpj:2.2,csll:1.08,comissao:com,margem,adm:1}]));
const GRUPOS_PADRAO={'Maral':{compra:{pis:9.25,icms:12,irpj:2,csll:1.08},ipi:6.5,credito:12,quebra:4,embalagem:3,canais:canaisDVV(2,11.5,3)},
 'Top Play':{compra:{pis:3.65,icms:12,irpj:2.2,csll:1.08},ipi:6.5,credito:12,quebra:4,embalagem:3,canais:canaisDVV(1,13,7)},
 'Terceiros':{compra:null,ipi:0,credito:0,quebra:1,embalagem:3,canais:canaisDVV(1,13,10)}};
const FAIXAS_SHOPEE=[[79.99,4],[99.99,16],[199.99,20],[1e9,26]];
function grupos(){const g=G();if(!g.grupos)g.grupos=JSON.parse(JSON.stringify(GRUPOS_PADRAO));if(!g.faixasShopee)g.faixasShopee=FAIXAS_SHOPEE.map(x=>[...x]);return g.grupos}
const somaPct=o=>Object.values(o||{}).reduce((s,v)=>s+n2(v),0);
const dvvTotal=d=>['pis','icms','difal','irpj','csll','comissao','margem','adm'].reduce((s,k)=>s+n2(d?.[k]),0);
function custoCadeia(gr,custo,quebra){const x=grupos()[gr];if(!x)return n2(custo);const b=n2(custo)*(1+n2(quebra??x.quebra)/100);if(!x.compra)return b;const pv=b/(1-somaPct(x.compra)/100);return pv+pv*n2(x.ipi)/100-pv*n2(x.credito)/100}
const taxaShopee=P=>{for(const [ate,v] of G().faixasShopee||FAIXAS_SHOPEE)if(P<=ate)return n2(v);return 0};
const n2=v=>{if(typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v.trim()))return Number(v);const x=typeof v==='number'?v:Number(String(v??'').replace(/[R$\s]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));return isFinite(x)?x:0};
const pc=v=>(v).toFixed(1).replace('.',',')+'%';
function G(){db.pricing=db.pricing||{impostos:8,ads:3,fixos:5,juros:0,margemAlvo:15,canais:{}};for(const [k,v] of Object.entries(PADRAO_CANAL))if(!db.pricing.canais[k])db.pricing.canais[k]={...v};return db.pricing}
function regra(nome,p){const r={...G().canais[nome]},e=p?.extra||{};if(e.frete?.[nome]!=null)r.frete=n2(e.frete[nome]);if(e.fixa?.[nome]!=null)r.fixa=n2(e.fixa[nome]);
 // Produto de um grupo da planilha: comissão, impostos, Vendas/Adm e margem vêm do DVV do grupo; sem taxa de serviço nem anúncios à parte.
 const gr=e.grupo&&grupos()[e.grupo];if(gr){const d=gr.canais[nome]||{};Object.assign(r,{comissao:n2(d.comissao),impostos:n2(d.pis)+n2(d.icms)+n2(d.difal)+n2(d.irpj)+n2(d.csll),adm:n2(d.adm),margem:n2(d.margem),servico:0,cupom:0,faixaAte:0,faixaValor:0});
  if(nome==='Magalu'&&e.fixa?.[nome]==null)r.fixa=5;
  if(nome==='Shopee'){if(e.frete?.[nome]==null)r.frete=0;if(e.fixa?.[nome]==null){r.fixa=0;r.faixaShopee=true}}
  if(e.frete?.[nome]==null&&nome!=='Shopee')r.frete=0}
 return r}
// Resultado unitário (mesma conta do Simulador): comissão, tarifa fixa (e tarifa extra abaixo da faixa), serviço, frete, cupom, impostos, ads, juros, fixos, custo e embalagem.
function conta(P,c,p){const g=G();P=n2(P);const q={preco:P,comissao:P*n2(c.comissao)/100,fixa:n2(c.fixa)+(n2(c.faixaAte)&&P<n2(c.faixaAte)?n2(c.faixaValor):0)+(c.faixaShopee?taxaShopee(P):0),servico:P*n2(c.servico)/100,frete:n2(c.frete),cupom:P*n2(c.cupom)/100,impostos:P*n2(c.impostos??g.impostos)/100,ads:c.impostos!=null?0:P*n2(g.ads)/100,juros:c.impostos!=null?0:P*n2(g.juros)/100,fixos:P*n2(c.adm??g.fixos)/100,custo:n2(p.custo),embalagem:n2(p.embalagem)};
 q.canal=q.comissao+q.fixa+q.servico+q.frete+q.cupom;q.total=q.canal+q.impostos+q.ads+q.juros+q.fixos+q.custo+q.embalagem;q.lucro=P-q.total;q.margem=P?q.lucro/P*100:0;return q}
function sugerido(meta,c,p){let lo=0,hi=Math.max(10,(n2(p.custo)+n2(p.embalagem)+n2(c.frete)+n2(c.fixa))*20+200);for(let i=0;i<60;i++){const m=(lo+hi)/2;conta(m,c,p).margem<meta?lo=m:hi=m}return Math.ceil(hi*100)/100}
const arred90=v=>v<=0?0:Math.floor(v)+.9<v?Math.floor(v)+1.9:Math.floor(v)+.9;
// Base: produtos do Bling (custo, foto, saldo) + tabela de preços (db.products) + vendas de 30 dias por canal.
function base(){const bl=new Map((window.Estoque?.lista?.()||[]).map(p=>[String(p.id),p])),tab=new Map((db.products||[]).map(p=>[String(p.id),p])),ids=new Set([...tab.keys(),...[...bl.values()].filter(p=>Number(p.custo)>0&&!p.ignorar).map(p=>String(p.id))]);
 const ini=new Date(Date.now()-30*864e5).toLocaleDateString('sv-SE'),vend=new Map();
 for(const o of db.orders){if(o.date<ini)continue;const can=o.platform==='Mercado Livre'?'Mercado Livre':o.platform;for(const i of o.items||[]){const k=String(i.sku||'').trim();if(!k)continue;const x=vend.get(k)||{};const v=x[can]||(x[can]={q:0,r:0});v.q+=n2(i.qty);v.r+=n2(i.qty)*n2(i.price);vend.set(k,x)}}
 return [...ids].map(id=>{const t=tab.get(id),b=bl.get(id);const gr=t?.extra?.grupo,co=t?.extra?.custoOrigem;const p={id,nome:t?.nome||b?.nome||id,custo:gr&&co?custoCadeia(gr,co,t.extra.quebra):(n2(t?.custo)||n2(b?.custo)),custoBling:n2(b?.custo),embalagem:n2(t?.embalagem),precos:t?.precos||{},extra:t?.extra||{},imagem:b?.imagem,saldo:b?.saldo,marca:t?.extra?.grupo||t?.extra?.marca||'',grupo:gr||'',emTabela:!!t};p.vend=vend.get(id)||{};return p})}
function linha(p,meta){return CAN.map(([k,rot,nome])=>{const c=regra(nome,p),preco=n2(p.precos[nome]),v=p.vend[nome==='Mercado Livre Clássico'?'__':nome]||(nome==='Mercado Livre'?p.vend['Mercado Livre']:null),pratic=v?.q?v.r/v.q:0;const r=preco?conta(preco,c,p):null;return {k,rot,nome,c,preco,r,sug:p.custo?sugerido(c.margem??meta,c,p):0,eq:p.custo?sugerido(0,c,p):0,pratic,qv:v?.q||0}})}
function view(){const g=G(),meta=ui.meta??n2(g.margemAlvo),q=normalized(ui.busca);let L=base().map(p=>({p,c:linha(p,meta)}));
 const marcas=[...new Set(L.map(x=>x.p.marca).filter(Boolean))].sort();
 L=L.filter(x=>(!q||normalized(x.p.id+' '+x.p.nome).includes(q))&&(!ui.marca||x.p.marca===ui.marca)&&({todos:true,prejuizo:x.c.some(c=>c.r&&c.r.margem<0),abaixo:x.c.some(c=>c.r&&c.r.margem<(c.c.margem??meta)-0.05),semcusto:!x.p.custo,sempreco:x.c.some(c=>!c.preco)})[ui.filtro]);
 L.sort((a,b)=>Object.values(b.p.vend).reduce((s,v)=>s+v.r,0)-Object.values(a.p.vend).reduce((s,v)=>s+v.r,0));
 const cont=f=>base().map(p=>({p,c:linha(p,meta)})).filter(f).length;
 const cel=(x,c)=>{const mt=c.c.margem??meta,cls=!c.r?'':c.r.margem<0?'bad':c.r.margem<mt-0.05?'warn':'ok';return `<td class="fpcel ${cls}"><input class="fpin" data-fp-preco="${esc(x.p.id)}|${c.nome}" value="${c.preco?c.preco.toFixed(2).replace('.',','):''}" placeholder="${c.sug?c.sug.toFixed(2).replace('.',','):'—'}" inputmode="decimal">
  <div class="fpmeta">${c.r?`<b class="badge ${cls}">${pc(c.r.margem)}</b> <span>${money(c.r.lucro)}</span>`:'<span class="caption">sem preço</span>'}</div>
  <div class="fpsub">${c.sug?`<button class="fplink" data-fp-sug="${esc(x.p.id)}|${c.nome}" title="Aplicar o sugerido para ${pc(c.c.margem??meta)}">sug. ${money(c.sug)}</button>`:''}${c.qv?`<span title="Preço médio vendido em 30 dias">vendido ${money(c.pratic)} · ${c.qv} un.</span>`:''}</div></td>`};
 return `<div class="fpbar"><div class="fpmetabox"><label>Margem alvo</label><input type="range" min="0" max="40" step="1" value="${meta}" data-fp-meta><b>${pc(meta)}</b></div>
  <input type="search" id="fpBusca" placeholder="Produto ou SKU…" value="${esc(ui.busca)}">
  ${marcas.length?`<select data-fp-marca><option value="">Todos os grupos</option>${marcas.map(m=>`<option ${ui.marca===m?'selected':''}>${esc(m)}</option>`).join('')}</select>`:''}
  <button class="small" data-fp="dvv">${icon('sliders')} DVV por grupo</button><button class="small" data-fp="importar">${icon('upload')} Importar planilha</button><button class="small" data-fp="versoes">${icon('refresh')} Versões</button><button class="small" data-fp="exportar">${icon('download')} Exportar tabela</button><button class="small quiet" data-nav="precos">${icon('sliders')} Regras e simulador</button></div>
 <div class="segtabs" style="margin-bottom:12px">${[['todos','Todos'],['prejuizo',`Com prejuízo (${cont(x=>x.c.some(c=>c.r&&c.r.margem<0))})`],['abaixo',`Abaixo da meta (${cont(x=>x.c.some(c=>c.r&&c.r.margem<(c.c.margem??meta)-0.05))})`],['sempreco',`Sem preço em algum canal`],['semcusto',`Sem custo (${cont(x=>!x.p.custo)})`]].map(([k,t])=>`<button class="${ui.filtro===k?'active':''}" data-fp-filtro="${k}">${t}</button>`).join('')}</div>
 ${ui.sel.size?`<div class="fplote"><b>${ui.sel.size} selecionado(s)</b><button class="small primary" data-fp="lote-sug">Aplicar preço sugerido</button><span class="row" style="gap:6px"><input id="fpPct" value="5" style="width:60px" inputmode="decimal">%<button class="small" data-fp="lote-pct">Reajustar</button></span><button class="small" data-fp="lote-90">Arredondar para ,90</button><button class="small quiet" data-fp="lote-limpar">Limpar seleção</button></div>`:''}
 <div class="tablebox"><div class="tablewrap"><table class="fptab"><thead><tr><th style="width:28px"><input type="checkbox" class="check" data-fp-todos ${L.length&&L.every(x=>ui.sel.has(x.p.id))?'checked':''}></th><th>Produto</th><th class="num">Custo</th>${CAN.map(([k,rot,nome])=>{const c=G().canais[nome];return `<th>${rot}<br><span class="caption">${String(c.comissao).replace('.',',')}%${n2(c.fixa)?` + ${money(n2(c.fixa))}`:''}${n2(c.servico)?` + ${String(c.servico).replace('.',',')}% serv.`:''}</span></th>`}).join('')}</tr></thead><tbody>
 ${L.slice(0,300).map(x=>`<tr class="${ui.aberto===x.p.id?'fpopen':''}"><td><input type="checkbox" class="check" data-fp-sel="${esc(x.p.id)}" ${ui.sel.has(x.p.id)?'checked':''}></td>
  <td><div class="fpprod">${x.p.imagem?`<img src="${esc(x.p.imagem)}" alt="">`:'<span class="fpsem"></span>'}<div><button class="fplink fpnome" data-fp-abrir="${esc(x.p.id)}">${esc(x.p.nome)}</button><br><span class="caption mono">${esc(x.p.id)}${x.p.marca?' · '+esc(x.p.marca):''}${x.p.saldo!=null?` · ${n2(x.p.saldo).toLocaleString('pt-BR')} em estoque`:''}</span></div></div></td>
  <td class="num"><input class="fpin fpcusto" data-fp-custo="${esc(x.p.id)}" value="${x.p.custo?x.p.custo.toFixed(2).replace('.',','):''}" placeholder="custo" inputmode="decimal">${x.p.custoBling&&Math.abs(x.p.custoBling-x.p.custo)>.01?`<br><span class="caption">Bling ${money(x.p.custoBling)}</span>`:''}</td>
  ${x.c.map(c=>cel(x,c)).join('')}</tr>${ui.aberto===x.p.id?`<tr class="fpdet"><td></td><td colspan="${3+CAN.length}">${detalhe(x.p,x.c,meta)}</td></tr>`:''}`).join('')||`<tr><td colspan="${3+CAN.length}" class="empty">Nenhum produto neste filtro.</td></tr>`}</tbody></table></div></div>
 <p class="caption">${L.length>300?`Mostrando 300 de ${L.length}. Use a busca. `:''}Produtos de Maral, Top Play e Terceiros seguem o DVV do grupo (botão DVV por grupo): preço = (custo + embalagem + frete + taxa fixa) ÷ (1 − DVV do canal), e a meta é a margem de lucro do DVV. Demais produtos: preço sugerido = menor preço que atinge a margem alvo depois de comissão, tarifas, frete, impostos (${pc(n2(G().impostos))}), anúncios (${pc(n2(G().ads))}), custos fixos (${pc(n2(G().fixos))}), custo e embalagem.</p>`}
function detalhe(p,cs,meta){const lin=[['preco','Preço de venda'],['comissao','Comissão do canal'],['fixa','Tarifa fixa'],['servico','Taxa de serviço'],['frete','Frete pago pelo vendedor'],['cupom','Cupom'],['impostos','Impostos'],['ads','Anúncios'],['juros','Juros'],['fixos','Vendas/Adm (custos fixos)'],['custo','Custo do produto'],['embalagem','Embalagem'],['lucro','Lucro por unidade']];
 const colunas=cs.map(c=>({c,r:conta(c.preco||c.sug,c.c,p)}));
 return `<div class="fpgrid"><div class="tablewrap"><table class="fpwf"><thead><tr><th>Composição (por unidade)</th>${colunas.map(x=>`<th class="num">${x.c.rot}${x.c.preco?'':'<br><span class="caption">(sugerido)</span>'}</th>`).join('')}</tr></thead><tbody>
 ${lin.filter(([k])=>k==='preco'||k==='lucro'||colunas.some(x=>x.r[k])).map(([k,t])=>`<tr class="${k==='lucro'||k==='preco'?'fptot':''}"><td>${t}</td>${colunas.map(x=>`<td class="num ${k==='lucro'&&x.r.lucro<0?'red':''}">${k==='preco'||k==='lucro'?'':'− '}${money(x.r[k])}</td>`).join('')}</tr>`).join('')}
 <tr><td>Margem</td>${colunas.map(x=>`<td class="num"><b class="${x.r.margem<0?'red':x.r.margem<meta?'gold':'green'}">${pc(x.r.margem)}</b></td>`).join('')}</tr><tr><td>Preço de equilíbrio (margem 0)</td>${colunas.map(x=>`<td class="num caption">${money(x.c.eq)}</td>`).join('')}</tr></tbody></table></div>
 <div class="fpedit"><h4>Custos deste produto por canal</h4><p class="caption">Como na planilha: frete e taxa fixa podem variar por produto. Em branco = regra do canal.</p>
 ${[['Mercado Livre','Frete ML (R$)','frete'],['Magalu','Frete Magalu (R$)','frete'],['Magalu','Taxa fixa Magalu (R$)','fixa'],['Shopee','Taxa fixa Shopee (R$)','fixa']].map(([can,t,campo])=>`<label>${t}<input class="fpin" data-fp-extra="${esc(p.id)}|${campo}|${can}" value="${p.extra?.[campo]?.[can]!=null?String(p.extra[campo][can]).replace('.',','):''}" placeholder="${String(G().canais[can][campo]||0).replace('.',',')}" inputmode="decimal"></label>`).join('')}
 <label>Embalagem (R$)<input class="fpin" data-fp-emb="${esc(p.id)}" value="${p.embalagem?String(p.embalagem).replace('.',','):''}" placeholder="0,00" inputmode="decimal"></label></div></div>`}
// Grava na tabela de preços (db.products → pricing_products), criando a linha do produto na primeira alteração.
function prod(id){db.products=db.products||[];let p=db.products.find(x=>String(x.id)===String(id));if(!p){const b=base().find(x=>x.id===id)||{};p={id,nome:b.nome||id,custo:b.custo||0,embalagem:0,precos:{},extra:{}};db.products.push(p)}p.precos=p.precos||{};p.extra=p.extra||{};return p}
function aplicar(ids,fn,txt){let n=0;for(const id of ids){const b=base().find(x=>x.id===id);if(!b)continue;const p=prod(id);for(const [k,rot,nome] of CAN){const v=fn(b,nome,regra(nome,b));if(v>0){p.precos[nome]=Math.round(v*100)/100;n++}}}audit(txt,`${ids.length} produto(s) · ${n} preço(s)`);save();render();toast(`${n} preço(s) atualizado(s).`)}
// Importa a planilha de preço: abas de produtos (MARAL, TOP PLAY, TERCEIROS ou uma aba por marca) e, se houver, as abas
// de DVV (DVV MARAL, DVV TOP PLAY, DVV TERCEIROS), que atualizam os percentuais de cada grupo e as faixas da Shopee.
const GRUPO_DA_ABA=nome=>({'maral':'Maral','top play':'Top Play','terceiros':'Terceiros'})[normalized(nome).trim()]||null;
function lerDVV(wb){let n=0;
 for(const aba of wb.SheetNames){const m=normalized(aba).match(/^dvv (maral|top play|terceiros)$/);if(!m)continue;const gr=GRUPO_DA_ABA(m[1]),G_=grupos()[gr];if(!G_)continue;
  const R=XLSX.utils.sheet_to_json(wb.Sheets[aba],{header:1,raw:true,defval:''});
  const chave=l=>{l=normalized(String(l));return /^pis/.test(l)?'pis':/^difal/.test(l)?'difal':/^icms/.test(l)?'icms':/^irpj/.test(l)?'irpj':/^csll/.test(l)?'csll':/^(comiss|maketeplece|marketplace)/.test(l)?'comissao':/^margem/.test(l)?'margem':/^vendas/.test(l)?'adm':null};
  const bloco=(i,j)=>{const o={};for(let k=i+1;k<Math.min(R.length,i+20);k++){const rot=normalized(String(R[k][j]||''));if(/^total d v v/.test(rot))break;const c=chave(R[k][j]);const v=R[k][j+1];if(c&&v!==''&&isFinite(Number(v)))o[c]=Math.round(Number(v)*10000)/100}return o};
  for(let i=0;i<R.length;i++)for(let j=0;j<R[i].length;j++){const t=normalized(String(R[i][j]||'')).trim();if(!t)continue;
   let canal=null;if(/^mercado livre premium$/.test(t))canal='Mercado Livre';else if(/^mercado livre classico$/.test(t))canal='Mercado Livre Clássico';else if(t==='magalu')canal='Magalu';else if(t==='shopee')canal='Shopee';
   if(canal){const o=bloco(i,j);if(Object.keys(o).length){G_.canais[canal]={...(G_.canais[canal]||{}),...o};n++}continue}
   if(/^dvv venda (maral|top) x/.test(t)){const o=bloco(i,j);delete o.difal;delete o.comissao;delete o.margem;delete o.adm;if(Object.keys(o).length){G_.compra=o;n++}continue}
   if(t==='valor produto'){const fx=[];for(let k=i+1;k<Math.min(R.length,i+10);k++){const ate=Number(R[k][j+1]),tx=Number(R[k][j+2]);if(!isFinite(tx)||R[k][j+2]==='')break;fx.push([isFinite(ate)&&R[k][j+1]!==''?ate:1e9,tx])}if(fx.length){fx[fx.length-1][0]=1e9;G().faixasShopee=fx;n++}}}}
 return n}
// Versões: antes de cada importação a tabela inteira (preços, fretes, taxas, DVV) é guardada; as 5 últimas ficam para restaurar.
const foto=()=>JSON.parse(JSON.stringify({produtos:db.products||[],grupos:G().grupos||null,faixas:G().faixasShopee||null}));
function guardarVersao(motivo,arquivo){const g=G(),f=foto();g.versoes=[{em:new Date().toISOString(),motivo,arquivo:arquivo||null,por:window.Cloud?.session?.user?.email||'local',itens:f.produtos.length,...f},...(g.versoes||[])].slice(0,5)}
async function importar(file){const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});grupos();let n=0,fora=0,abas=[];const importados=new Set();
 guardarVersao('Antes de importar a planilha',file.name);
 const blocosDVV=lerDVV(wb);
 const oculta=nome=>!!(wb.Workbook?.Sheets||[]).find(x=>x.name===nome)?.Hidden;
 for(const nome of wb.SheetNames){if(oculta(nome)||/^dvv /.test(normalized(nome))||/base dados|base_dados/.test(normalized(nome)))continue;
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[nome],{header:1,raw:true,defval:''});const hi=rows.findIndex(r=>r.some(c=>/c[oó]digo/i.test(String(c)))&&r.some(c=>/shopee/i.test(String(c))));if(hi<0)continue;
  const cab=rows[hi].map(c=>normalized(String(c)).trim()),col=re=>cab.findIndex(c=>re.test(c));
  const C={cod:col(/codigo/),desc:col(/descri/),custo:col(/^custo( maral)?$/),quebra:col(/^% quebra$/),quebraCab:col(/^custo \+ .*quebra/),emb:col(/^custo embalagem/),ipi:col(/^ipi/),credito:col(/^credito icms/),
   freteMlp:col(/^frete mercado livre premium/),freteMlc:col(/^frete mercado livre +classico/),freteMl:col(/^frete mercado/),mlp:col(/premium/),mlc:col(/^tabela mercado livre +classico/),taxaMag:col(/taxa magalu/),freteMag:col(/frete magalu/),mag:col(/tabela magalu/),taxaShp:col(/taxa shopee/),shp:col(/tabela shopee/)};
  if(C.mlc<0)C.mlc=col(/classico/);if(C.mlp>=0&&/^frete/.test(cab[C.mlp]))C.mlp=col(/^tabela mercado livre premium/);
  const gr=GRUPO_DA_ABA(nome),G_=gr&&grupos()[gr];
  // IPI e crédito de ICMS da cadeia (linha acima do cabeçalho, como na planilha)
  if(G_&&hi>0){const pct=i=>{const v=Number(rows[hi-1]?.[i]);return i>=0&&isFinite(v)&&v>0&&v<1?Math.round(v*10000)/100:null};const ipi=pct(C.ipi),cr=pct(C.credito);if(ipi!=null)G_.ipi=ipi;if(cr!=null)G_.credito=cr;const qb=pct(C.quebraCab);if(qb!=null)G_.quebra=qb}
  const marca=gr||String(rows[0]?.find(c=>String(c).trim()&&isNaN(Number(c)))||nome).replace(/tabela de pre[cç]o e-?commerce/i,'').trim()||nome;abas.push(marca);
  const lista=window.Estoque?.lista?.()||[];
  for(const r of rows.slice(hi+1)){const cod=String(r[C.cod]??'').trim();if(!cod)continue;
   const id=lista.find(p=>String(p.id).replace(/^CS/i,'').toUpperCase()===cod.replace(/^CS/i,'').toUpperCase())?.id;
   if(!id){fora++;continue}
   const p=prod(id);if(!p.nome||p.nome===id)p.nome=String(r[C.desc]||p.nome);
   if(!importados.has(id)){p.precos={};p.extra={...p.extra,frete:{},fixa:{}};importados.add(id)}p.extra.fonte='planilha';p.extra.arquivo=file.name;
   const set=(canal,i)=>{const v=n2(r[i]);if(i>=0&&v>0)p.precos[canal]=Math.round(v*100)/100};set('Mercado Livre',C.mlp);set('Mercado Livre Clássico',C.mlc);set('Magalu',C.mag);set('Shopee',C.shp);
   const ex=(campo,canal,i)=>{if(i<0||r[i]==='')return;const v=n2(r[i]);p.extra[campo]={...(p.extra[campo]||{}),[canal]:v}};
   ex('frete','Mercado Livre',C.freteMlp>=0?C.freteMlp:C.freteMl);ex('frete','Mercado Livre Clássico',C.freteMlc>=0?C.freteMlc:C.freteMl);ex('frete','Magalu',C.freteMag);ex('fixa','Magalu',C.taxaMag);ex('fixa','Shopee',C.taxaShp);
   if(gr){p.extra.grupo=gr;if(C.custo>=0&&n2(r[C.custo])>0)p.extra.custoOrigem=Math.round(n2(r[C.custo])*10000)/10000;if(C.quebra>=0&&r[C.quebra]!=='')p.extra.quebra=Math.round(n2(r[C.quebra])*10000)/100;else delete p.extra.quebra;if(C.emb>=0)p.embalagem=n2(r[C.emb]);
    if(p.extra.custoOrigem)p.custo=Math.round(custoCadeia(gr,p.extra.custoOrigem,p.extra.quebra)*100)/100}
   p.extra.marca=marca;n++}}
 if(!n&&!blocosDVV){G().versoes=(G().versoes||[]).slice(1);throw Error('Não encontrei o layout da tabela (colunas Código … Tabela Shopee).')}
 const saem=(db.products||[]).filter(p=>p.extra?.fonte==='planilha'&&!importados.has(String(p.id)));if(n&&saem.length)db.products=db.products.filter(p=>!saem.includes(p));
 audit('Tabela de preços importada',`${file.name} · ${n} produto(s) · ${abas.join(', ')}${blocosDVV?` · DVV atualizado (${blocosDVV} bloco(s))`:''}${fora?` · ${fora} código(s) sem produto no Bling`:''}`);save();render();
 toast(`${n} produto(s) importado(s) de ${abas.join(', ')}${blocosDVV?' e DVV dos grupos atualizado':''}.${fora?` ${fora} código(s) da planilha ainda não existem no Bling e ficaram de fora.`:''}`)}
// Janela para conferir e ajustar o DVV de cada grupo (mesmos campos da planilha).
function janelaVersoes(){const vs=G().versoes||[];
 modal('Versões da tabela de preços',`<p class="caption" style="margin-top:-8px">Antes de cada importação, a tabela inteira (preços, fretes, taxas e DVV) é guardada. Restaurar troca a tabela atual pela versão escolhida, e a atual também fica guardada.</p>
 <div class="tablewrap"><table><thead><tr><th>Guardada em</th><th>Motivo</th><th class="num">Produtos</th><th></th></tr></thead><tbody>${vs.map((v,i)=>`<tr><td>${new Date(v.em).toLocaleString('pt-BR')}<br><span class="caption">${esc(String(v.por||'').split('@')[0])}</span></td><td>${esc(v.motivo)}${v.arquivo?`<br><span class="caption">${esc(v.arquivo)}</span>`:''}</td><td class="num">${v.itens}</td><td><button class="small" data-fp-restaurar="${i}">Restaurar</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nenhuma versão guardada ainda.</td></tr>'}</tbody></table></div>
 <div class="modalfoot"><button class="primary" data-action="close">Fechar</button></div>`)}
function restaurar(i){const g=G(),v=(g.versoes||[])[i];if(!v)return;const atual=foto();db.products=JSON.parse(JSON.stringify(v.produtos||[]));if(v.grupos)g.grupos=v.grupos;if(v.faixas)g.faixasShopee=v.faixas;
 g.versoes=[{em:new Date().toISOString(),motivo:'Antes de restaurar a versão de '+new Date(v.em).toLocaleString('pt-BR'),arquivo:null,por:window.Cloud?.session?.user?.email||'local',itens:atual.produtos.length,...atual},...g.versoes.filter((_,k)=>k!==i)].slice(0,5);
 audit('Tabela de preços restaurada',`versão de ${new Date(v.em).toLocaleString('pt-BR')} · ${v.itens} produto(s)`);save();closeModal();render();toast('Versão restaurada.')}
function janelaDVV(){const gs=grupos(),CANS=CAN.map(x=>x[2]),campos=Object.keys(DVV_ROT);
 modal('DVV por grupo',`<p class="caption" style="margin-top:-8px">Percentuais sobre o preço de venda, como nas abas DVV da planilha. Preço de tabela = (custo + embalagem + frete + taxa fixa) ÷ (1 − total do canal). A margem de lucro é a meta usada no preço sugerido.</p>
 ${Object.entries(gs).map(([gr,x])=>`<h3 style="margin:14px 0 6px">${esc(gr)}</h3><div class="tablewrap"><table><thead><tr><th>DVV</th>${CANS.map(c=>`<th class="num">${esc(CAN.find(y=>y[2]===c)[1])}</th>`).join('')}</tr></thead><tbody>
  ${campos.map(k=>`<tr><td>${DVV_ROT[k]}</td>${CANS.map(c=>`<td class="num"><input class="fpin" style="width:64px" data-fp-dvv="${esc(gr)}|${esc(c)}|${k}" value="${String(n2(x.canais[c]?.[k])).replace('.',',')}" inputmode="decimal"></td>`).join('')}</tr>`).join('')}
  <tr class="fptot"><td>Total</td>${CANS.map(c=>`<td class="num"><b>${pc(dvvTotal(x.canais[c]))}</b></td>`).join('')}</tr></tbody></table></div>
  <p class="caption">${x.compra?`Compra de ${esc(gr)}: DVV ${pc(somaPct(x.compra))} · IPI ${pc(n2(x.ipi))} · crédito de ICMS ${pc(n2(x.credito))} · `:''}quebra padrão ${pc(n2(x.quebra))} · embalagem ${money(n2(x.embalagem))}</p>`).join('')}
 <p class="caption">Taxa fixa da Shopee por faixa de preço: ${(G().faixasShopee||FAIXAS_SHOPEE).map(([ate,v])=>`${ate>=1e9?'acima':'até '+money(ate)}: ${money(v)}`).join(' · ')}</p>
 <div class="modalfoot"><button class="quiet" data-fp="dvv-padrao">Voltar ao padrão da planilha</button><button class="primary" data-action="close">Fechar</button></div>`)}
function exportar(){const L=base(),porMarca=new Map();for(const p of L){const m=p.marca||'Produtos';(porMarca.get(m)||porMarca.set(m,[]).get(m)).push(p)}const wb=XLSX.utils.book_new();
 for(const [m,ps] of porMarca){const rows=[[`Tabela de preço e-Commerce ${m}`],['Código','Descrição','Custo','Frete Mercado Livre','Tabela Mercado Livre Premium','Tabela Mercado Livre Clássico','Taxa Magalu','Frete Magalu','Tabela Magalu','Taxa Shopee','Tabela Shopee'],
  ...ps.map(p=>[p.id,p.nome,p.custo,regra('Mercado Livre',p).frete,n2(p.precos['Mercado Livre']),n2(p.precos['Mercado Livre Clássico']),regra('Magalu',p).fixa,regra('Magalu',p).frete,n2(p.precos['Magalu']),regra('Shopee',p).fixa,n2(p.precos['Shopee'])])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),m.slice(0,31))}
 XLSX.writeFile(wb,`TABELA E-COMMERCE_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'.')}.xlsx`)}
document.addEventListener('change',e=>{const x=e.target;const d=x.dataset;
 if(d.fpPreco){const [id,canal]=d.fpPreco.split('|');const p=prod(id),v=n2(x.value);if(v>0)p.precos[canal]=Math.round(v*100)/100;else delete p.precos[canal];audit('Preço ajustado',`${id} · ${canal} · ${v?money(v):'removido'}`);save();render();return}
 if(d.fpCusto){const p=prod(d.fpCusto);p.custo=n2(x.value);save();render();return}
 if(d.fpEmb){const p=prod(d.fpEmb);p.embalagem=n2(x.value);save();render();return}
 if(d.fpDvv){const [gr,canal,k]=d.fpDvv.split('|'),gs=grupos();gs[gr].canais[canal]={...(gs[gr].canais[canal]||{}),[k]:n2(x.value)};audit('DVV ajustado',`${gr} · ${canal} · ${k} = ${x.value}%`);save();janelaDVV();render();return}
 if(d.fpExtra){const [id,campo,canal]=d.fpExtra.split('|'),p=prod(id);p.extra[campo]={...(p.extra[campo]||{})};if(String(x.value).trim()==='')delete p.extra[campo][canal];else p.extra[campo][canal]=n2(x.value);save();render();return}
 if(x.matches('[data-fp-marca]')){ui.marca=x.value;render();return}
 if(x.matches('[data-fp-sel]')){x.checked?ui.sel.add(x.dataset.fpSel):ui.sel.delete(x.dataset.fpSel);render();return}
 if(x.matches('[data-fp-todos]')){const ids=[...document.querySelectorAll('[data-fp-sel]')].map(i=>i.dataset.fpSel);ids.forEach(i=>x.checked?ui.sel.add(i):ui.sel.delete(i));render();return}
 if(x.id==='fpArq'){importar(x.files[0]).catch(er=>toast(er.message))}});
document.addEventListener('input',e=>{const x=e.target;if(x.matches('[data-fp-meta]')){ui.meta=Number(x.value);clearTimeout(ui.t);ui.t=setTimeout(render,120);return}
 if(x.id==='fpBusca'){ui.busca=x.value;const p=x.selectionStart;render();const n=$('#fpBusca');n.focus();n.setSelectionRange(p,p)}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-fp],[data-fp-filtro],[data-fp-sug],[data-fp-abrir],[data-fp-restaurar]');if(!b)return;const d=b.dataset,meta=ui.meta??n2(G().margemAlvo);
 if(d.fpRestaurar!=null){if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar';b.classList.add('danger');return}restaurar(Number(d.fpRestaurar));return}
 if(d.fpFiltro){ui.filtro=d.fpFiltro;render();return}
 if(d.fpAbrir){ui.aberto=ui.aberto===d.fpAbrir?null:d.fpAbrir;render();return}
 if(d.fpSug){const [id,canal]=d.fpSug.split('|');const b0=base().find(x=>x.id===id);const p=prod(id),rg=regra(canal,b0);p.precos[canal]=sugerido(rg.margem??meta,rg,b0);audit('Preço sugerido aplicado',`${id} · ${canal} · ${money(p.precos[canal])}`);save();render();return}
 switch(d.fp){case 'importar':{const i=document.createElement('input');i.type='file';i.accept='.xlsx,.xls';i.id='fpArq';i.style.display='none';document.body.appendChild(i);i.onchange=()=>{importar(i.files[0]).catch(er=>toast(er.message));i.remove()};i.click();break}
  case 'exportar':exportar();break;
  case 'dvv':janelaDVV();break;
  case 'versoes':janelaVersoes();break;
  case 'dvv-padrao':{if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar: voltar ao padrão';b.classList.add('danger');return}const g=G();g.grupos=JSON.parse(JSON.stringify(GRUPOS_PADRAO));g.faixasShopee=FAIXAS_SHOPEE.map(x=>[...x]);audit('DVV restaurado ao padrão da planilha','');save();janelaDVV();render();break}
  case 'lote-sug':aplicar([...ui.sel],(p,nome,c)=>p.custo?sugerido(c.margem??meta,c,p):0,'Preços sugeridos aplicados em lote');break;
  case 'lote-pct':{const f=1+n2($('#fpPct').value)/100;aplicar([...ui.sel],(p,nome)=>n2(p.precos[nome])*f,`Reajuste de ${$('#fpPct').value}% em lote`);break}
  case 'lote-90':aplicar([...ui.sel],(p,nome)=>arred90(n2(p.precos[nome])),'Preços arredondados para ,90');break;
  case 'lote-limpar':ui.sel.clear();render();break}});
window.Formacao={importar,grupos,versoes:()=>G().versoes||[]};
addPage('formacao','calc','Formação de preço',view,'A tabela de preço do e-commerce viva: custo do Bling, frete e taxas por produto, margem e preço sugerido por canal, com ações em lote.','',()=>{});
})();
