'use strict';
// Vendas › B2B: tabelas de preço (percentual sobre o preço base e preços fixos por SKU, com pedido mínimo), cliente
// ligado a uma tabela e a um representante, comissão por representante (sobre o faturado ou o recebido) lançada no
// contas a pagar, e proposta comercial em PDF. A venda direta usa tudo isso ao adicionar itens e ao faturar.
(()=>{
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const dig=s=>String(s||'').replace(/\D/g,'');
const r2=v=>Math.round((Number(v)||0)*100)/100;
const cfg=()=>({tabelas:[],representantes:[],clientes:{},...(db.gerencial?.b2b||{})});
const salvar=n=>{db.gerencial={...(db.gerencial||{}),b2b:{...cfg(),...n}};save()};
const st={aba:'tabelas',mes:hoje().slice(0,7),tab:null};
window.Reiniciar?.registrar(st,['aba','mes','tab']); // estado de tela: volta ao original ao clicar no menu
const pode=()=>['owner','member','financeiro','atendimento'].includes(window.Cloud?.role||'owner');
const num=v=>Number(String(v??'').replace(/\./g,'').replace(',','.'))||0;

// ─── Regras usadas pela venda direta ───
const clienteCfg=doc=>cfg().clientes[dig(doc)]||{};
const tabela=id=>cfg().tabelas.find(t=>t.id===id)||null;
function precoPara(doc,sku,base,tabId){const t=tabela(tabId||clienteCfg(doc).tabela);if(!t)return r2(base);const fixo=t.precos?.[sku];if(fixo!=null&&fixo!=='')return r2(num(fixo));return r2(Number(base)*(1+(Number(t.pct)||0)/100))}
const representante=id=>cfg().representantes.find(r=>r.id===id)||null;

// ─── Comissões do mês ───
function comissoes(mes){const vs=(window.VendaDireta?.vendas?.()||[]).filter(v=>v.status==='faturado'&&v.representante),rec=window.VendaDireta?.titulos?.()||[],out=new Map();
 for(const r of cfg().representantes){const base=r.base||'faturado',l=[];
  for(const v of vs.filter(x=>x.representante===r.id)){const pct=Number(v.comissao_pct??r.comissao)||0,produtos=Math.max(0,Number(v.total)-Number(v.frete||0));
   if(base==='faturado'){if(String(v.emissao||'').startsWith(mes))l.push({v,base:produtos,pct,valor:r2(produtos*pct/100)})}
   else{const tot=Number(v.total)||1,receb=rec.filter(t=>t.referencia===v.id&&String(t.recebido_em||'').startsWith(mes)).reduce((a,t)=>a+Number(t.valor_recebido||0),0);if(receb>0){const b=r2(produtos*receb/tot);l.push({v,base:b,pct,valor:r2(b*pct/100)})}}}
  out.set(r.id,{r,l,total:r2(l.reduce((a,x)=>a+x.valor,0))})}
 return out}
function lancarComissao(repId,mes){const c=comissoes(mes).get(repId);if(!c||!c.total)return toast('Sem comissão no mês.');const id=`COM-${repId}-${mes}`;
 if((db.payables||[]).some(p=>p.id===id))return toast('A comissão deste mês já está no contas a pagar.');
 const [a,m]=mes.split('-').map(Number),venc=new Date(a,m,Number(c.r.dia)||10).toLocaleDateString('sv-SE');
 (db.payables||(db.payables=[])).push((window.Pagamentos?.marcar||(x=>x))({id,origem:'manual',fornecedor:c.r.nome,fornecedorDoc:dig(c.r.doc)||'',descricao:`Comissão ${mes} · ${c.l.length} venda(s)`,documento:`COM ${mes}`,vencimento:venc,valor:c.total,emissao:hoje(),parcela:1,parcelas:1,juros:0,desconto:0,valorPago:0,status:'aberto',categoria:'Serviços de terceiros',createdBy:window.Cloud?.session?.user?.email||'local'}));
 audit('Comissão lançada no contas a pagar',`${c.r.nome} · ${mes} · ${money(c.total)}`);save();render();toast(`Comissão de ${c.r.nome} lançada: ${money(c.total)}, vence ${new Date(venc+'T12:00').toLocaleDateString('pt-BR')}.`)}

// ─── Proposta comercial (PDF) ───
const carregaLib=(g,src)=>window[g]?Promise.resolve():new Promise((ok,er)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>er(Error('Não foi possível carregar '+g));document.head.appendChild(s)});
async function propostaPdf(v){await carregaLib('jspdf','https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
 const {jsPDF}=window.jspdf,d=new jsPDF({unit:'pt',format:'a4'}),W=595.28,M=40,t=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,''),V=x=>r2(x).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const f=window.Parametros?.cfg?.()||{},c=v.cliente||{},e=c.endereco||{},rep=representante(v.representante),tab=tabela(v.tabela_preco);let y=M;
 d.setFillColor(10,20,32);d.rect(0,0,W,70,'F');d.setTextColor(255,255,255);d.setFont('helvetica','bold');d.setFontSize(18);d.text('Proposta comercial',M,42);d.setFontSize(10);d.setFont('helvetica','normal');d.text(t(`${f.razao||'Compra Store'} · CNPJ ${dig(f.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')}`),W-M,34,{align:'right'});d.text(t(`No ${v.numero||'—'} · ${new Date().toLocaleDateString('pt-BR')}`),W-M,50,{align:'right'});
 d.setTextColor(20,20,20);y=100;d.setFont('helvetica','bold');d.setFontSize(11);d.text('Cliente',M,y);d.setFont('helvetica','normal');d.setFontSize(10);y+=16;
 for(const l of [c.fantasia&&c.fantasia!==c.nome?`${c.nome} (${c.fantasia})`:c.nome,`CNPJ/CPF ${c.doc||''}${c.ie?' · IE '+c.ie:''}`,[e.logradouro,e.numero,e.bairro].filter(Boolean).join(', '),[e.municipio,e.uf,e.cep].filter(Boolean).join(' · '),[c.email,c.telefone].filter(Boolean).join(' · ')].filter(Boolean)){d.text(t(l),M,y);y+=14}
 y+=10;d.setFillColor(238,242,246);d.rect(M,y,W-2*M,20,'F');d.setFont('helvetica','bold');const cx=[M+6,M+300,M+360,M+440];['Produto','Qtd.','Unitario','Total'].forEach((h,i)=>d.text(h,i?cx[i]+(i?50:0):cx[0],y+14,{align:i?'right':'left'}));y+=28;d.setFont('helvetica','normal');
 for(const i of v.itens||[]){if(y>760){d.addPage();y=M}d.text(t(`${i.nome||i.sku}`).slice(0,60),cx[0],y);d.setFontSize(8);d.setTextColor(110,110,110);d.text(t(i.sku),cx[0],y+10);d.setFontSize(10);d.setTextColor(20,20,20);d.text(String(i.qtd),cx[1]+50,y,{align:'right'});d.text(V(i.preco),cx[2]+50,y,{align:'right'});d.text(V(i.qtd*i.preco),cx[3]+50,y,{align:'right'});y+=24}
 const prod=(v.itens||[]).reduce((a,i)=>a+i.qtd*i.preco,0),tot=prod+Number(v.frete||0)-Number(v.desconto||0);y+=4;d.line(M,y,W-M,y);y+=16;
 for(const [k,x] of [['Produtos',prod],['Frete',Number(v.frete||0)],['Desconto',-Number(v.desconto||0)],['Total',tot]]){if(!x&&k!=='Total'&&k!=='Produtos')continue;d.setFont('helvetica',k==='Total'?'bold':'normal');d.text(k,cx[2],y);d.text(`R$ ${V(x)}`,cx[3]+50,y,{align:'right'});y+=16}
 y+=10;d.setFont('helvetica','normal');const cond={avista:'A vista','30':'30 dias','30/60':'30/60 dias','30/60/90':'30/60/90 dias'}[v.condicao]||v.condicao||'';
 for(const l of [`Condicao de pagamento: ${cond}`,(v.parcelas||[]).length?`Parcelas: ${(v.parcelas||[]).map(p=>`${new Date(p.vencimento+'T12:00').toLocaleDateString('pt-BR')} R$ ${V(p.valor)}`).join(' · ')}`:'',tab?.minimo&&prod<Number(tab.minimo)?`Pedido minimo da tabela: R$ ${V(tab.minimo)}`:'',`Validade da proposta: ${Number(cfg().validade)||7} dias. Precos sujeitos a disponibilidade de estoque.`,rep?`Representante: ${rep.nome}${rep.email?' · '+rep.email:''}`:'',v.observacao?`Observacoes: ${v.observacao}`:''].filter(Boolean)){for(const p of d.splitTextToSize(t(l),W-2*M)){d.text(p,M,y);y+=14}}
 d.save(`proposta-${v.numero||v.id}.pdf`)}

// ─── Telas ───
function tabelasView(){const T=cfg().tabelas,a=st.tab&&T.find(x=>x.id===st.tab);
 return `<div class="grid two" style="align-items:start"><section class="tablebox"><div class="tabletop"><h2>Tabelas de preço</h2>${pode()?`<button class="small primary" data-b2="novatab">${icon('plus')} Nova tabela</button>`:''}</div><div class="tablewrap"><table><thead><tr><th>Tabela</th><th class="num">Sobre o preço base</th><th class="num">Preços fixos</th><th class="num">Pedido mínimo</th><th class="num">Clientes</th></tr></thead><tbody>
 ${T.map(x=>`<tr class="clickrow" data-b2-tab="${esc(x.id)}"><td><strong>${esc(x.nome)}</strong></td><td class="num">${Number(x.pct)>0?'+':''}${Number(x.pct)||0}%</td><td class="num">${Object.keys(x.precos||{}).length}</td><td class="num">${x.minimo?money(x.minimo):'—'}</td><td class="num">${Object.values(cfg().clientes).filter(c=>c.tabela===x.id).length}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhuma tabela. Ex.: "Lojista" com −25% sobre o preço base.</td></tr>'}</tbody></table></div></section>
 ${a?`<section class="card"><h3>${esc(a.nome)}</h3><div class="grid three"><div><label>Nome</label><input data-b2-t="nome" value="${esc(a.nome)}"></div><div><label>% sobre o preço base</label><input data-b2-t="pct" value="${esc(a.pct??0)}" placeholder="-25"></div><div><label>Pedido mínimo (R$)</label><input data-b2-t="minimo" value="${esc(a.minimo??'')}"></div></div>
  <p class="caption">Preço base = preço do produto no Bling. Preço fixo por SKU vence o percentual.</p><div class="row"><input id="b2Sku" list="b2Prods" placeholder="SKU" style="flex:1"><datalist id="b2Prods">${(window.Estoque?.lista?.()||[]).slice(0,800).map(p=>`<option value="${esc(p.id)}">${esc(p.nome)} · ${money(p.preco)}</option>`).join('')}</datalist><input id="b2Preco" placeholder="Preço fixo" style="width:120px"><button class="small" data-b2="fixo">Adicionar</button></div>
  <div class="tablewrap" style="max-height:280px;margin-top:8px"><table><tbody>${Object.entries(a.precos||{}).map(([s,p])=>`<tr><td class="mono">${esc(s)}</td><td>${esc((window.Estoque?.lista?.()||[]).find(x=>x.id===s)?.nome||'')}</td><td class="num">${money(num(p))}</td><td><button class="small quiet" data-b2-tirar="${esc(s)}">${icon('x')}</button></td></tr>`).join('')||'<tr><td class="empty">Sem preços fixos.</td></tr>'}</tbody></table></div>
  <div class="modalfoot" style="margin-top:10px"><button class="quiet" data-b2="excluirtab">Excluir tabela</button></div></section>`:'<div class="empty">Escolha uma tabela para editar.</div>'}</div>`}
function repsView(){const R=cfg().representantes;
 return `<div class="tablebox"><div class="tabletop"><h2>Representantes</h2>${pode()?`<button class="small primary" data-b2="novorep">${icon('plus')} Novo representante</button>`:''}</div><div class="tablewrap"><table><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>E-mail</th><th class="num">Comissão %</th><th>Base</th><th class="num">Dia do pagamento</th><th></th></tr></thead><tbody>
 ${R.map(r=>`<tr><td><input data-b2-r="${esc(r.id)}" data-k="nome" value="${esc(r.nome)}"></td><td><input data-b2-r="${esc(r.id)}" data-k="doc" value="${esc(r.doc||'')}" style="width:150px"></td><td><input data-b2-r="${esc(r.id)}" data-k="email" value="${esc(r.email||'')}"></td><td class="num"><input class="ufin" data-b2-r="${esc(r.id)}" data-k="comissao" value="${esc(r.comissao??'')}" style="width:70px"></td><td><select data-b2-r="${esc(r.id)}" data-k="base"><option value="faturado" ${r.base!=='recebido'?'selected':''}>Faturado</option><option value="recebido" ${r.base==='recebido'?'selected':''}>Recebido</option></select></td><td class="num"><input class="ufin" data-b2-r="${esc(r.id)}" data-k="dia" value="${esc(r.dia??10)}" style="width:60px"></td><td><button class="small quiet" data-b2-rrm="${esc(r.id)}">${icon('x')}</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhum representante.</td></tr>'}</tbody></table></div></div>`}
function clientesView(){const C=cfg().clientes,vs=window.VendaDireta?.vendas?.()||[],docs=new Map();for(const v of vs){const d=dig(v.cliente?.doc);if(d&&!docs.has(d))docs.set(d,v.cliente)}for(const d of Object.keys(C))if(!docs.has(d))docs.set(d,{doc:d,nome:C[d].nome||d});
 return `<div class="tablebox"><div class="tabletop"><h2>Clientes B2B</h2><span class="caption">Clientes das vendas diretas. A tabela e o representante entram sozinhos na próxima venda.</span></div><div class="tablewrap"><table><thead><tr><th>Cliente</th><th>CNPJ/CPF</th><th>Tabela</th><th>Representante</th><th class="num">Vendas</th></tr></thead><tbody>
 ${[...docs].map(([d,c])=>`<tr><td><strong>${esc(c.fantasia||c.nome||d)}</strong></td><td class="mono">${esc(d)}</td><td><select data-b2-c="${d}" data-k="tabela"><option value="">Preço base</option>${cfg().tabelas.map(t=>`<option value="${esc(t.id)}" ${C[d]?.tabela===t.id?'selected':''}>${esc(t.nome)}</option>`).join('')}</select></td><td><select data-b2-c="${d}" data-k="representante"><option value="">—</option>${cfg().representantes.map(r=>`<option value="${esc(r.id)}" ${C[d]?.representante===r.id?'selected':''}>${esc(r.nome)}</option>`).join('')}</select></td><td class="num">${vs.filter(v=>dig(v.cliente?.doc)===d&&v.status==='faturado').length}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum cliente de venda direta ainda.</td></tr>'}</tbody></table></div></div>`}
function comissoesView(){const C=[...comissoes(st.mes).values()];
 return `<div class="crmbar"><label>Mês <input type="month" data-b2="mes" value="${st.mes}"></label></div>${C.map(({r,l,total})=>`<div class="tablebox"><div class="tabletop"><div><h2>${esc(r.nome)}</h2><p class="caption">${r.comissao||0}% sobre o ${r.base==='recebido'?'recebido':'faturado'} (sem frete) · ${l.length} venda(s)</p></div><div class="row"><strong>${money(total)}</strong>${total&&pode()?`<button class="small primary" data-b2-lancar="${esc(r.id)}">Lançar no contas a pagar</button>`:''}</div></div>
 ${l.length?`<div class="tablewrap"><table><thead><tr><th>Venda</th><th>Cliente</th><th class="num">Base</th><th class="num">%</th><th class="num">Comissão</th></tr></thead><tbody>${l.map(x=>`<tr><td>nº ${esc(x.v.numero||'')} · ${new Date((x.v.emissao||hoje())+'T12:00').toLocaleDateString('pt-BR')}</td><td>${esc(x.v.cliente?.fantasia||x.v.cliente?.nome||'')}</td><td class="num">${money(x.base)}</td><td class="num">${x.pct}%</td><td class="num">${money(x.valor)}</td></tr>`).join('')}</tbody></table></div>`:''}</div>`).join('')||'<div class="empty">Cadastre representantes e indique-os nas vendas diretas.</div>'}`}
let pediu=false;
function view(){if(!pediu&&!window.VendaDireta?.vendas?.().length){pediu=true;Promise.resolve(window.VendaDireta?.carregar?.()).then(()=>{if(page==='b2b')render()}).catch(()=>{})}
 const A=[['tabelas','Tabelas de preço'],['clientes','Clientes'],['reps','Representantes'],['comissoes','Comissões']];
 return `<div class="segtabs">${A.map(([k,t])=>`<button class="${st.aba===k?'active':''}" data-b2-aba="${k}">${t}</button>`).join('')}</div>${({tabelas:tabelasView,clientes:clientesView,reps:repsView,comissoes:comissoesView}[st.aba]||tabelasView)()}`}
const uid2=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
document.addEventListener('click',e=>{const b=e.target.closest('[data-b2],[data-b2-aba],[data-b2-tab],[data-b2-tirar],[data-b2-rrm],[data-b2-lancar]');if(!b)return;const d=b.dataset,c=cfg();
 if(d.b2Aba){st.aba=d.b2Aba;render();return}if(d.b2Tab){st.tab=d.b2Tab;render();return}
 if(d.b2Lancar)return lancarComissao(d.b2Lancar,st.mes);
 if(d.b2==='novatab'){const t={id:'tab-'+uid2(),nome:'Nova tabela',pct:0,precos:{}};salvar({tabelas:[...c.tabelas,t]});st.tab=t.id;render();return}
 if(d.b2==='excluirtab'){if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar exclusão';b.classList.add('danger');return}salvar({tabelas:c.tabelas.filter(t=>t.id!==st.tab)});st.tab=null;render();return}
 if(d.b2==='fixo'){const s=$('#b2Sku').value.trim(),p=num($('#b2Preco').value);if(!s||!(p>0))return toast('Informe SKU e preço.');salvar({tabelas:c.tabelas.map(t=>t.id===st.tab?{...t,precos:{...(t.precos||{}),[s]:p}}:t)});render();return}
 if(d.b2Tirar){salvar({tabelas:c.tabelas.map(t=>{if(t.id!==st.tab)return t;const p={...(t.precos||{})};delete p[d.b2Tirar];return {...t,precos:p}})});render();return}
 if(d.b2==='novorep'){salvar({representantes:[...c.representantes,{id:'rep-'+uid2(),nome:'Novo representante',comissao:5,base:'faturado',dia:10}]});render();return}
 if(d.b2Rrm){salvar({representantes:c.representantes.filter(r=>r.id!==d.b2Rrm)});render()}});
document.addEventListener('change',e=>{const x=e.target,c=cfg();
 if(x.matches('[data-b2="mes"]')){if(/^\d{4}-\d{2}$/.test(x.value)){st.mes=x.value;render()}return}
 if(x.dataset.b2T){const k=x.dataset.b2T,v=k==='nome'?x.value.trim():num(x.value);salvar({tabelas:c.tabelas.map(t=>t.id===st.tab?{...t,[k]:v}:t)});render();return}
 if(x.dataset.b2R){const k=x.dataset.k,v=['comissao','dia'].includes(k)?num(x.value):x.value.trim();salvar({representantes:c.representantes.map(r=>r.id===x.dataset.b2R?{...r,[k]:v}:r)});return}
 if(x.dataset.b2C){const d=x.dataset.b2C,cl={...c.clientes};cl[d]={...(cl[d]||{}),[x.dataset.k]:x.value};salvar({clientes:cl});audit('B2B: cliente atualizado',`${d} · ${x.dataset.k}=${x.value||'—'}`);toast('Salvo.')}});
addPage('b2b','handshake','Comercial B2B',view,'Venda direta B2B: tabela de preço por cliente, pedido mínimo, representantes, comissões no contas a pagar e proposta em PDF.','',()=>{});
window.B2B={precoPara,clienteCfg,tabela,representante,representantes:()=>cfg().representantes,tabelas:()=>cfg().tabelas,propostaPdf,comissoes};
})();
