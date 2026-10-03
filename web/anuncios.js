'use strict';
// Vendas › Anúncios pagos: gasto com Mercado Ads, Shopee Ads e outros por produto no mês do cabeçalho, descontado do
// lucro de contribuição de cada produto no canal (Margem.lucroSkuCanal, mesma regra do Radar de margem). O gasto entra
// pela API do Mercado Ads (servidor, quando o aplicativo tiver a permissão de publicidade) ou pela importação do
// relatório do painel de anúncios de cada canal (tabela anuncios_gasto; a mesma linha importada de novo substitui).
(()=>{
Object.assign(paths,{megafone:'M3 10v4h3l6 4V6L6 10H3z M16 8a5 5 0 0 1 0 8 M19 5a9 9 0 0 1 0 14'});
const st={mes:null,lista:null,carregando:false,erro:'',canal:''};
window.Reiniciar?.registrar(st,['canal']); // estado de tela: volta ao original ao clicar no menu
const CANAIS=['Mercado Livre','Shopee','Magalu'];
const mesNome=m=>new Date(m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const fimMes=m=>{const [a,b]=m.split('-').map(Number);return new Date(a,b,0).toLocaleDateString('sv-SE')};
const pct=v=>v==null||!isFinite(v)?'—':(v*100).toFixed(1).replace('.',',')+'%';
async function carregar(){if(st.carregando||!window.Cloud?.ws)return;st.carregando=true;const m=month;
 try{const {data,error}=await Cloud.client.from('anuncios_gasto').select('canal,dia,anuncio,periodo,sku,titulo,custo,cliques,impressoes,vendas_valor,vendas_qtd,origem,updated_at').eq('workspace_id',Cloud.ws).gte('dia',m+'-01').lte('dia',fimMes(m)).limit(20000);
  if(error)throw error;st.lista=data||[];st.mes=m;st.erro=''}
 catch(x){st.erro=x.message||String(x);st.lista=[];st.mes=m}finally{st.carregando=false;if(page==='anuncios')render()}}

// Agrupa o gasto por canal + SKU (ou pelo anúncio, quando o relatório não trouxe o SKU) e cruza com o lucro do produto.
function dados(){const lucro=window.Margem?.lucroSkuCanal?.(month)||new Map(),g=new Map();
 for(const r of st.lista||[]){if(st.canal&&r.canal!==st.canal)continue;const sku=String(r.sku||'').trim(),k=r.canal+'|'+(sku||'#'+r.anuncio);
  const x=g.get(k)||{canal:r.canal,sku,anuncios:new Set(),titulo:r.titulo||'',custo:0,cliques:0,vendasAds:0,temVendasAds:false,origem:new Set()};
  x.anuncios.add(r.anuncio);x.custo+=Number(r.custo)||0;x.cliques+=Number(r.cliques)||0;if(r.vendas_valor!=null){x.vendasAds+=Number(r.vendas_valor)||0;x.temVendasAds=true}x.origem.add(r.origem);if(!x.titulo&&r.titulo)x.titulo=r.titulo;g.set(k,x)}
 const linhas=[...g.values()].map(x=>{const l=x.sku?lucro.get(x.canal+'|'+x.sku):null;const venda=l?.venda||0,antes=l&&!l.semCusto?l.lucro:null;
  return {...x,nome:l?.nome||x.titulo||x.sku||[...x.anuncios][0],venda,antes,depois:antes==null?null:antes-x.custo,tacos:venda?x.custo/venda:null,acos:x.temVendasAds&&x.vendasAds?x.custo/x.vendasAds:null}}).sort((a,b)=>b.custo-a.custo);
 const vendaCanal=new Map();for(const [k,v] of lucro){const c=k.split('|')[0];vendaCanal.set(c,(vendaCanal.get(c)||0)+v.venda)}
 return {linhas,vendaCanal}}

function view(){if(!window.Cloud?.ws)return '<div class="empty">Entre no portal para ver os anúncios pagos.</div>';
 if(st.mes!==month&&!st.carregando){carregar();return '<div class="empty">Carregando…</div>'}
 if(!st.lista)return '<div class="empty">Carregando…</div>';
 const {linhas,vendaCanal}=dados(),gasto=linhas.reduce((s,l)=>s+l.custo,0),venda=st.canal?(vendaCanal.get(st.canal)||0):[...vendaCanal.values()].reduce((s,v)=>s+v,0);
 const comLucro=linhas.filter(l=>l.antes!=null),antes=comLucro.reduce((s,l)=>s+l.antes,0),depois=comLucro.reduce((s,l)=>s+l.depois,0),prejuizo=comLucro.filter(l=>l.depois<0&&l.antes>=0);
 const api=(st.lista||[]).some(r=>r.origem==='api');
 return `${st.erro?`<div class="notice warnbox">${esc(st.erro)}</div>`:''}
 <div class="crmbar"><select data-an="canal" aria-label="Canal"><option value="">Todos os canais</option>${CANAIS.map(c=>`<option ${st.canal===c?'selected':''}>${c}</option>`).join('')}</select>
  ${CANAIS.slice(0,2).map(c=>`<button class="small" data-an-importar="${esc(c)}">${icon('upload')} Importar relatório ${c==='Mercado Livre'?'do Mercado Ads':'da Shopee Ads'}</button>`).join('')}<button class="small quiet" data-an-importar="Magalu">Outro canal</button>
  <span class="caption">Mês do cabeçalho: ${esc(mesNome(month))}</span></div>
 ${!api?`<div class="notice"><strong>Como o gasto entra:</strong> importe o relatório de anúncios do mês (no painel do Mercado Ads ou da Shopee Ads, exporte por anúncio). A leitura automática do Mercado Ads já está pronta e começa sozinha quando o aplicativo do Jarvis no Mercado Livre tiver a permissão de <em>Publicidade</em> no Mercado Livre.</div>`:''}
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Gasto com anúncios</span><span class="kpiv">${money(gasto)}</span><span class="kpis">${venda?pct(gasto/venda)+' das vendas'+(st.canal?' do canal':''):'sem vendas no mês'}</span></div>
  <div class="card kpi"><span class="kpil">Lucro dos produtos anunciados</span><span class="kpiv">${money(antes)}</span><span class="kpis">antes dos anúncios (Radar de margem)</span></div>
  <div class="card kpi"><span class="kpil">Depois dos anúncios</span><span class="kpiv ${depois<0?'red':''}">${money(depois)}</span><span class="kpis">${antes?pct(depois/antes)+' do lucro fica':''}</span></div>
  <div class="card kpi"><span class="kpil">Anúncio levando ao prejuízo</span><span class="kpiv ${prejuizo.length?'red':''}">${prejuizo.length}</span><span class="kpis">produto(s) com lucro que o anúncio zerou</span></div></div>
 <div class="tablebox"><div class="tabletop"><div><h2>Gasto e lucro por produto</h2><p class="caption">TACOS = gasto ÷ toda a venda do produto no canal. ACOS = gasto ÷ venda atribuída ao anúncio pelo canal (quando o relatório traz).</p></div></div><div class="tablewrap"><table><thead><tr><th>Produto</th><th>Canal</th><th class="num">Gasto</th><th class="num">Venda no canal</th><th class="num">TACOS</th><th class="num">ACOS</th><th class="num">Lucro antes</th><th class="num">Lucro depois</th></tr></thead><tbody>
  ${linhas.slice(0,400).map(l=>`<tr ${l.sku?`class="clickrow" data-est-ficha="${esc(l.sku)}"`:''}><td><strong>${esc(l.nome)}</strong><br><span class="caption mono">${esc(l.sku||'sem SKU · anúncio '+[...l.anuncios].join(', '))}</span></td><td>${esc(l.canal)}</td><td class="num">${money(l.custo)}</td><td class="num">${l.venda?money(l.venda):'—'}</td><td class="num">${pct(l.tacos)}</td><td class="num">${pct(l.acos)}</td><td class="num">${l.antes==null?'<span class="caption">'+(l.sku?'sem custo':'—')+'</span>':money(l.antes)}</td><td class="num ${l.depois!=null&&l.depois<0?'red':''}"><strong>${l.depois==null?'—':money(l.depois)}</strong></td></tr>`).join('')||'<tr><td colspan="8" class="empty">Nenhum gasto com anúncios neste mês. Importe o relatório do painel de anúncios.</td></tr>'}</tbody></table></div></div>`}

function importar(canal){TableImport.open({title:`Importar gasto com anúncios · ${canal} · ${mesNome(month)}`,hint:'Uma linha por anúncio (e por dia, se o relatório for diário). Sem a coluna de data, o valor vale para o mês inteiro do cabeçalho. Importar de novo o mesmo anúncio e dia substitui o valor.',
 fields:[{key:'anuncio',label:'Código do anúncio',required:true,aliases:['id do anuncio','codigo do anuncio','anuncio','item id','id do item','mlb','id do produto','item','codigo']},{key:'sku',label:'SKU',aliases:['sku','sku principal','codigo sku','sku do vendedor','referencia']},{key:'titulo',label:'Título',aliases:['titulo','titulo do anuncio','nome do produto','produto','anuncio nome']},
  {key:'custo',label:'Investimento',required:true,aliases:['investimento','gasto','custo','despesas','valor investido','investimento (r$)','despesa']},{key:'data',label:'Data',aliases:['data','dia','date']},{key:'vendas',label:'Receita dos anúncios',aliases:['receita','vendas','receita de anuncios','gmv','vendas por publicidade','receita (r$)']},{key:'qtd',label:'Unidades vendidas',aliases:['unidades vendidas','itens vendidos','vendas (unidades)','pedidos']},{key:'cliques',label:'Cliques',aliases:['cliques','clicks']},{key:'impressoes',label:'Impressões',aliases:['impressoes','visualizacoes','prints']}],
 async onConfirm(rows,meta){const m=month,ini=m+'-01',fim=fimMes(m),quem=Cloud.session?.user?.email||'',agora=new Date().toISOString(),por=new Map();let fora=0;
  for(const r of rows){const an=String(r.anuncio||'').trim(),custo=Math.abs(TableImport.num(r.custo));if(!an||!custo)continue;const d=r.data?TableImport.date(r.data):'';
   if(d&&(d<ini||d>fim)){fora++;continue}const dia=d||ini,k=dia+'|'+an,x=por.get(k)||{workspace_id:Cloud.ws,canal,dia,anuncio:an,periodo:d?'dia':'mes',sku:null,titulo:null,custo:0,cliques:null,impressoes:null,vendas_valor:null,vendas_qtd:null,origem:'importado',atualizado_por:quem,updated_at:agora};
   x.custo=Math.round((x.custo+custo)*100)/100;if(r.sku)x.sku=String(r.sku).trim();if(r.titulo)x.titulo=String(r.titulo).trim().slice(0,200);
   if(r.vendas)x.vendas_valor=Math.round(((x.vendas_valor||0)+Math.abs(TableImport.num(r.vendas)))*100)/100;if(r.qtd)x.vendas_qtd=(x.vendas_qtd||0)+Math.round(Math.abs(TableImport.num(r.qtd)));
   if(r.cliques)x.cliques=(x.cliques||0)+Math.round(Math.abs(TableImport.num(r.cliques)));if(r.impressoes)x.impressoes=(x.impressoes||0)+Math.round(Math.abs(TableImport.num(r.impressoes)));por.set(k,x)}
  const linhas=[...por.values()];if(!linhas.length)return toast(fora?`Nenhuma linha de ${mesNome(m)}: troque o mês no cabeçalho.`:'Nenhuma linha com anúncio e investimento.');
  // SKU que faltou no relatório: pelo Vigia de preços (anúncio do Mercado Livre → SKU) ou quando o código já é um SKU cadastrado.
  const vig=new Map((await Cloud.client.from('precos_concorrencia').select('item_id,sku').eq('workspace_id',Cloud.ws).in('item_id',linhas.map(l=>l.anuncio)).then(r=>r.data||[],()=>[])).map(v=>[v.item_id,v.sku]));
  const skus=new Set([...(window.Estoque?.lista?.()||[]).map(p=>String(p.id)),...(db.products||[]).map(p=>String(p.id))]);
  for(const l of linhas)if(!l.sku)l.sku=vig.get(l.anuncio)||(skus.has(l.anuncio)?l.anuncio:null);
  for(let i=0;i<linhas.length;i+=500){const {error}=await Cloud.client.from('anuncios_gasto').upsert(linhas.slice(i,i+500),{onConflict:'workspace_id,canal,dia,anuncio'});if(error)return toast(error.message)}
  audit('Gasto com anúncios importado',`${canal} · ${mesNome(m)} · ${meta?.file||''}: ${linhas.length} linha(s), ${money(linhas.reduce((s,l)=>s+l.custo,0))}`);
  toast(`${linhas.length} linha(s) importada(s)${fora?`, ${fora} fora de ${mesNome(m)} ignorada(s)`:''}${linhas.some(l=>!l.sku)?`. ${linhas.filter(l=>!l.sku).length} sem SKU: aparecem pelo código do anúncio`:''}.`);st.mes=null;await carregar()}})}

document.addEventListener('click',e=>{const b=e.target.closest('[data-an-importar]');if(b){e.preventDefault();importar(b.dataset.anImportar)}});
document.addEventListener('change',e=>{const s=e.target.closest('[data-an="canal"]');if(s){st.canal=s.value;render()}});
addPage('anuncios','megafone','Anúncios pagos',view,'Gasto com Mercado Ads e Shopee Ads por produto e o lucro que sobra depois dos anúncios.','',()=>{});
window.Anuncios={carregar};
})();
