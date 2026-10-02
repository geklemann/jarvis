// Exportar qualquer tela: botões "Excel" e "PDF" no cabeçalho de todas as páginas.
// Excel: cada tabela visível da tela vira uma aba (.xlsx), com valores em reais, percentuais, números e datas
// convertidos para células numéricas (dá para somar e filtrar). Sem tabela, exporta o texto da tela linha a linha.
// PDF: impressão da tela limpa (sem menu, cabeçalho e botões), em A4 deitado, com título, empresa e data;
// no diálogo de impressão, escolha "Salvar como PDF". Exporta o que está na tela, com os filtros aplicados.
(()=>{
const txt=el=>(el?.innerText||'').replace(/ /g,' ').trim();
function tituloTela(){const h=document.querySelector('.pagehead h1');if(!h)return document.title;const c=h.cloneNode(true);c.querySelectorAll('button').forEach(b=>b.remove());return c.textContent.trim()||'Tela'}
const empresa=()=>window.Cloud?.wsName||'';
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const competencia=()=>{try{const m=/^(\d{4})-(\d{2})$/.exec(typeof month==='string'?month:'');return m?MESES[+m[2]-1]+' de '+m[1]:''}catch{return ''}};
const nomeArq=ext=>['Jarvis',tituloTela(),competencia()].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g,'-')+'.'+ext;

// ── Valores: "R$ 1.234,56", "−R$ 10,00", "12,5%", "3.472", "30/09/2026" viram números e datas de verdade.
const num=s=>Number(s.replace(/\./g,'').replace(',','.'));
function celula(bruto){let s=bruto.replace(/\s+/g,' ').trim().replace(/[−–—]/g,'-');if(!s||s==='-')return null;
 // Formato contábil: "(2.861,40)" é negativo.
 const par=s.match(/^\((.+)\)$/);if(par){const c=celula(par[1]);if(c&&c.t==='n')return {...c,v:-Math.abs(c.v)}}
 let m=s.match(/^(-)?\s?R\$\s?(-)?\s?([\d.]+(?:,\d+)?)$/);if(m){const v=num(m[3])*((m[1]||m[2])?-1:1);return {t:'n',v,z:'"R$" #,##0.00;-"R$" #,##0.00'}}
 m=s.match(/^([+-]?[\d.]*\d(?:,(\d+))?)\s?%$/);if(m){const d=(m[2]||'').length;return {t:'n',v:num(m[1].replace('+',''))/100,z:d?'0.'+'0'.repeat(d)+'%':'0%'}}
 m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m){const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));if(!isNaN(d))return {t:'d',v:d,z:'dd/mm/yyyy'}}
 // Número comum. Continuam texto: zero à esquerda (códigos, CEP) e 6 ou mais dígitos seguidos sem pontuação (NCM, nº do pedido).
 if(/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(s)&&!/^-?0\d/.test(s)&&!/^\d{6,}$/.test(s)&&s.replace(/\D/g,'').length<=15){const v=num(s);return {t:'n',v,z:s.includes(',')?'#,##0.00':'#,##0'}}
 return {t:'s',v:s}}
// Célula com valor e legenda em linhas separadas: tenta o valor da primeira linha.
// data-exp-num="13158": a tela pede que a célula vá como número (ex.: nº da nota sem os zeros à esquerda, para PROCV).
// Cabeçalho: sem os botões de filtro (▾) e as caixas que o Jarvis põe nele.
const textoCelula=td=>{if(td.tagName!=='TH'||!td.querySelector('button,input'))return td.innerText;const c=td.cloneNode(true);c.querySelectorAll('button,input').forEach(x=>x.remove());return c.textContent};
function celulaTd(td){const en=td.dataset?.expNum;if(typeof en==='string'&&en!==''&&isFinite(Number(en)))return {t:'n',v:Number(en),z:'0'};const t=textoCelula(td).replace(/ /g,' ').trim();if(!t)return null;const c=celula(t);if(c&&c.t!=='s')return c;
 const l=t.split('\n').map(x=>x.trim()).filter(Boolean);if(l.length>1){const c1=celula(l[0]);if(c1&&c1.t!=='s')return c1}return {t:'s',v:l.join(' · ')}}

function visivel(el){return !!(el.offsetParent||el.getClientRects().length)}
// Nome da aba: o último título (h2/h3/h4) que aparece antes da tabela na tela; sem título, o nome da tela.
function tituloTabela(t,i,n){const view=document.getElementById('view')||document.body;
 // Só vale título do mesmo bloco da tabela (o cartão de um gráfico vizinho não dá nome à tabela de baixo).
 const B='.tablebox,.card,.relout,section,.caixa,.formcard,.dg-folha,.cap';
 const hs=[...view.querySelectorAll('h2,h3,h4')].filter(h=>visivel(h)&&(h.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING)&&(h.closest(B)||view).contains(t)&&h.closest(B)!==null);
 const h=hs[hs.length-1];return (h&&txt(h).split('\n')[0])||(n===1?tituloTela():'Tabela '+(i+1))}
const RX_NF=/^(nf|n[\u00ba\u00b0o.]*\s*(da\s+)?(nota|nf)|nota( fiscal)?|n[u\u00fa]mero)\b/i,RX_NUM_NF=/^(?:NF\s*)?0*(\d{1,9})$/i;
function folhaDeTabela(XLSX,t){const ws={},merges=[];let r=0,cmax=0;const ocup={};
 for(const tr of t.rows){if(!visivel(tr))continue;let c=0;
  for(const td of tr.cells){if(!visivel(td)&&td.innerText.trim()==='')continue;while(ocup[r+','+c])c++;
   const cs=td.colSpan||1,rs=td.rowSpan||1,v=celulaTd(td);
   if(v){const ref=XLSX.utils.encode_cell({r,c});ws[ref]=v.t==='d'?{t:'d',v:v.v,z:v.z}:v;if(td.tagName==='TH')ws[ref].s={font:{bold:true}}}
   if(cs>1||rs>1){merges.push({s:{r,c},e:{r:r+rs-1,c:c+cs-1}});for(let a=0;a<rs;a++)for(let b=0;b<cs;b++)if(a||b)ocup[(r+a)+','+(c+b)]=1}
   c+=cs;cmax=Math.max(cmax,c)}
  r++}
 // Coluna de número de nota ("NF", "Nota", "Número"): "NF 015158" ou "015158" vira o número 15158 (dá para usar PROCV).
 for(let c=0;c<cmax;c++){const h=ws[XLSX.utils.encode_cell({r:0,c})];if(!h||h.t!=='s'||!RX_NF.test(String(h.v).trim()))continue;
  for(let rr=1;rr<r;rr++){const ref=XLSX.utils.encode_cell({r:rr,c}),x=ws[ref];const m=x&&x.t==='s'?RX_NUM_NF.exec(String(x.v).trim()):null;if(m)ws[ref]={t:'n',v:Number(m[1]),z:'0'}}}
 if(!r)return null;ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:r-1,c:Math.max(0,cmax-1)}});if(merges.length)ws['!merges']=merges;
 // Largura das colunas pelo maior texto.
 const larg=[];for(const k in ws){if(k[0]==='!')continue;const {c}=XLSX.utils.decode_cell(k),v=ws[k],n=String(v.t==='n'?v.v.toFixed(2):v.t==='d'?'00/00/0000':v.v).length;larg[c]=Math.min(60,Math.max(larg[c]||8,n+2))}
 ws['!cols']=larg.map(w=>({wch:w||10}));return ws}
function nomeAba(nome,usados){let n=nome.replace(/[\[\]:*?\/\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,31)||'Tabela';let k=2,b=n;while(usados.has(n.toLowerCase())){const suf=' ('+k++ +')';n=b.slice(0,31-suf.length)+suf}usados.add(n.toLowerCase());return n}

function excel(){const XLSX=window.XLSX;if(!XLSX){aviso('A biblioteca do Excel não carregou. Recarregue a página e tente de novo.');return}
 const view=document.getElementById('view')||document.querySelector('.content')||document.body;
 const wb=XLSX.utils.book_new(),usados=new Set();wb.Props={Title:tituloTela(),Author:'Jarvis',Company:empresa(),CreatedDate:new Date()};
 const tabs=[...view.querySelectorAll('table')].filter(t=>visivel(t)&&t.rows.length>1&&!t.closest('[aria-hidden="true"],.mgtip-pop'));
 // Aba "Resumo": cartões, totais e textos da tela que estão fora das tabelas, uma informação por linha.
 const escondidas=tabs.map(t=>{const d=t.style.display;t.style.display='none';return [t,d]});
 const linhas=view.innerText.split('\n').map(l=>l.replace(/ /g,' ').trim()).filter(Boolean);escondidas.forEach(([t,d])=>t.style.display=d);
 if(linhas.length){// Rótulo na coluna A e valor na B ("Líquido | R$ 398.969,58"); texto solto fica só na A.
  const ws={},rows=[];let ult=null;
  for(const l of linhas){const c=celula(l);if(c&&c.t!=='s'){if(ult&&!ult.v)ult.v=c;else rows.push(ult={a:'',v:c})}else rows.push(ult={a:l,v:null})}
  ws.A1={t:'s',v:tituloTela()+(competencia()?' · '+competencia():'')};
  rows.forEach((x,i)=>{if(x.a)ws[XLSX.utils.encode_cell({r:i+1,c:0})]={t:'s',v:x.a};if(x.v)ws[XLSX.utils.encode_cell({r:i+1,c:1})]=x.v});
  ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:1}});ws['!cols']=[{wch:70},{wch:18}];
  XLSX.utils.book_append_sheet(wb,ws,nomeAba('Resumo',usados))}
 tabs.forEach((t,i)=>{const ws=folhaDeTabela(XLSX,t);if(ws)XLSX.utils.book_append_sheet(wb,ws,nomeAba(tituloTabela(t,i,tabs.length),usados))});
 if(!wb.SheetNames.length){aviso('Nada para exportar nesta tela.');return}
 XLSX.writeFile(wb,nomeArq('xlsx'),{compression:true});aviso(`Excel gerado: ${wb.SheetNames.length} aba(s).`)}

function pdf(){const view=document.getElementById('view');if(!view)return window.print();
 document.querySelectorAll('.exp-cab').forEach(e=>e.remove());
 const cab=document.createElement('div');cab.className='exp-cab';
 cab.innerHTML=`<b>Jarvis · ${esc2(tituloTela())}</b><span>${esc2([empresa(),competencia(),'emitido em '+new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})].filter(Boolean).join(' · '))}</span>`;
 view.parentNode.insertBefore(cab,view);document.body.classList.add('exp-imprimindo');
 const fim=()=>{document.body.classList.remove('exp-imprimindo');cab.remove();removeEventListener('afterprint',fim)};addEventListener('afterprint',fim);
 setTimeout(()=>window.print(),60)}
const esc2=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function aviso(m){if(typeof toast==='function')toast(m);else{const t=document.getElementById('toast');if(t){t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}}}

// Botões no cabeçalho de cada tela (o cabeçalho é refeito a cada navegação).
function botoes(){const a=document.querySelector('.pagehead .pageactions');if(!a||a.querySelector('.exp-btns'))return;
 a.insertAdjacentHTML('afterbegin',`<div class="exp-btns" role="group" aria-label="Exportar esta tela"><button class="small" data-exp="xlsx" title="Baixar as tabelas desta tela em Excel">Excel</button><button class="small" data-exp="pdf" title="Imprimir ou salvar esta tela em PDF">PDF</button></div>`)}
if(typeof shell==='function'){const s0=shell;shell=function(){const r=s0.apply(this,arguments);try{botoes()}catch(e){}return r}}
window.Exportar={celula,celulaTd,excel,pdf};
document.addEventListener('click',e=>{const b=e.target.closest('[data-exp]');if(!b)return;e.preventDefault();try{b.dataset.exp==='pdf'?pdf():excel()}catch(err){console.error(err);aviso('Não foi possível exportar: '+(err.message||err))}});

// Estilos dos botões e da impressão (qualquer tela).
const css=`.exp-btns{display:flex;gap:6px}.exp-btns button{display:inline-flex;align-items:center;gap:6px}
.exp-cab{display:none}
@media print{
 @page{size:A4 landscape;margin:10mm}
 body:not(.pg-diag){background:#fff!important;color:#111!important}
 body:not(.pg-diag) .side,body:not(.pg-diag) main>header,body:not(.pg-diag) .pagehead,body:not(.pg-diag) .footer,body:not(.pg-diag) .fab,body:not(.pg-diag) #toast,body:not(.pg-diag) #erpdrop,body:not(.pg-diag) .mgtip-pop,body:not(.pg-diag) .rolatopo,body:not(.pg-diag) .guiabtn{display:none!important}
 body:not(.pg-diag) .erp{display:block!important}body:not(.pg-diag) main,body:not(.pg-diag) .content{margin:0!important;padding:0!important;max-width:none!important;width:auto!important;overflow:visible!important}
 body:not(.pg-diag) .tablewrap,body:not(.pg-diag) .tablebox{overflow:visible!important;max-height:none!important;box-shadow:none!important}
 body:not(.pg-diag) table{font-size:10px!important}body:not(.pg-diag) th,body:not(.pg-diag) td{padding:3px 6px!important}
 body:not(.pg-diag) tr,body:not(.pg-diag) .card,body:not(.pg-diag) .kpi{break-inside:avoid}
 /* A impressão geral do sistema esconde todo botão e todo .hero; na exportação, volta o conteúdo feito de botões
    (barras de gráfico, cartões clicáveis) e somem só os controles. */
 body.exp-imprimindo #view button,body.exp-imprimindo #view .hero{display:revert!important}
 body.exp-imprimindo #view :is(button.small,button.primary,button.quiet,.iconbtn,.guiabtn,.segtabs,.toolbar,.crmbar,.filters,.searchin,.rowacts,.fab,[data-exp]),
 body.exp-imprimindo #view input[type=checkbox],body.exp-imprimindo #view input[type=search]{display:none!important}
 body.exp-imprimindo .exp-cab{display:flex!important;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:1px solid #ccc;padding:0 0 6px;margin:0 0 12px;font:12px Inter,"Segoe UI",sans-serif;color:#111}
 body.exp-imprimindo .exp-cab span{color:#555}}`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
})();
