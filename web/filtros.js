'use strict';
// Filtro por coluna, como no Excel, em QUALQUER tabela da tela: o Jarvis põe um ▾ no cabeçalho de cada coluna das
// tabelas com 3 linhas ou mais. O painel lista os valores da coluna (já filtrada pelas outras colunas) com a
// quantidade, pesquisa e "selecionar tudo". As linhas que não passam ficam escondidas: o "marcar todas" (selecao.js)
// e a exportação para Excel (exportar.js) levam só o que está à vista, e uma linha marcada que some pelo filtro é
// desmarcada. O filtro vale enquanto a pessoa está na tela (some ao clicar no menu). Tabelas com filtro próprio
// (.gfbtn) ou marcadas com data-sem-filtro ficam de fora. Filtra as linhas desenhadas (telas que mostram só as
// primeiras centenas filtram dentro delas).
(()=>{
if(typeof MutationObserver==='undefined')return;
const estado={f:{}};// chave da tabela → {índice da coluna: Set de valores aceitos}
window.Reiniciar?.registrar(estado,['f']); // estado de tela: volta ao original ao clicar no menu
const VAZIO='(Vazias)';
let aberto=null,busca='',tmp=new Set(),vals=[],vis=[];// aberto: {k, col}
const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const pg=()=>{try{return typeof page!=='undefined'?page:''}catch{return ''}};
const escH=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Texto do cabeçalho sem os botões e caixas que o Jarvis pôs nele.
function rotulo(th){const c=th.cloneNode(true);c.querySelectorAll('.xfbtn,.gfbtn,input,button').forEach(x=>x.remove());return c.textContent.replace(/\s+/g,' ').trim()}
// Valor da célula: a primeira linha de texto (nome do produto, data, valor), como a pessoa lê.
// O texto é lido da estrutura da célula (e não do que está desenhado): linha escondida pelo filtro lê igual à visível.
function linhasTexto(el){let s='';const ir=n=>{if(n.nodeType===3){s+=n.nodeValue;return}if(n.nodeType!==1)return;const tg=n.tagName;if(tg==='BR'){s+='\n';return}if(/^(BUTTON|INPUT|SELECT|SCRIPT|STYLE|SVG)$/i.test(tg))return;const bl=/^(DIV|P|SMALL|LI|UL|H[1-6])$/.test(tg)||n.classList?.contains('caption');if(bl)s+='\n';n.childNodes.forEach(ir);if(bl)s+='\n'};ir(el);return s}
function valor(td){if(!td)return VAZIO;const l=linhasTexto(td).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);return (l[0]||VAZIO).slice(0,100)}
function tabelas(){const v=document.getElementById('view');if(!v)return [];
 return [...v.querySelectorAll('table')].map((t,i)=>{const hr=t.tHead?.rows[0];if(!hr||t.closest('[data-sem-filtro],.gfpainel')||t.matches('[data-sem-filtro]')||hr.querySelector('.gfbtn'))return null;
  const n=hr.cells.length,linhas=[...t.tBodies].flatMap(b=>[...b.rows]).filter(r=>r.cells.length===n);if(n<2||linhas.length<3)return null;
  const cols=[...hr.cells].map((c,j)=>({j,th:c,rot:rotulo(c)})).filter(c=>c.rot&&!(c.th.colSpan>1));
  return {t,i,hr,linhas,cols,k:pg()+'#'+i+'#'+[...hr.cells].map(rotulo).join('|')}}).filter(Boolean)}
const passa=(r,f,menos)=>Object.entries(f).every(([j,set])=>Number(j)===menos||!set||set.has(valor(r.cells[j])));
let aplicando=false;
function aplicar(){if(aplicando)return;aplicando=true;const desmarcar=[];
 try{const vivas=new Set();
  for(const T of tabelas()){vivas.add(T.k);const f=estado.f[T.k]||{},ativos=Object.values(f).some(Boolean);
   // Botões ▾ nos cabeçalhos (idempotente: só mexe quando muda).
   for(const c of T.cols){let b=c.th.querySelector(':scope .xfbtn');const on=!!f[c.j];
    if(!b){b=document.createElement('button');b.type='button';b.className='xfbtn';b.dataset.xfk=T.k;b.dataset.xfc=String(c.j);b.setAttribute('aria-label','Filtrar '+c.rot);c.th.appendChild(b)}
    if(b.dataset.xfk!==T.k)b.dataset.xfk=T.k;const txt=on?'⧩':'▾';if(b.textContent!==txt)b.textContent=txt;b.classList.toggle('on',on);b.title=on?'Filtro ativo':'Filtrar'}
   let vistas=0;for(const r of T.linhas){const ok=!ativos||passa(r,f);
    if(!ok&&r.style.display!=='none'){r.style.display='none';r.dataset.xfOculta='1';const cx=r.cells[0]?.querySelector('input[type=checkbox]');if(cx?.checked&&!cx.disabled)desmarcar.push(cx)}
    else if(ok&&r.dataset.xfOculta){r.style.display='';delete r.dataset.xfOculta}
    if(ok)vistas++}
   // Aviso acima da tabela com o total filtrado.
   // Achado pela chave (a barra de rolagem de cima, rolagem.js, também se põe antes da tabela).
   const alvo=T.t.closest('.tablewrap')||T.t;let av=[...document.querySelectorAll('#view .xfaviso')].find(x=>x.dataset.xfk===T.k)||null;
   if(ativos){const html=`Filtro: <strong>${vistas}</strong> de ${T.linhas.length} linha(s) <button type="button" class="small quiet" data-xf-limpar="${escH(T.k)}">Limpar filtros</button> <button type="button" class="small quiet" data-xf-excel>Exportar o filtrado (Excel)</button>`;
    if(!av){av=document.createElement('div');av.className='xfaviso';av.dataset.xfk=T.k;const ref=alvo.previousElementSibling?.classList?.contains('rolatopo')?alvo.previousElementSibling:alvo;ref.before(av)}if(av.innerHTML!==html)av.innerHTML=html}
   else av?.remove()}
  document.querySelectorAll('#view .xfaviso').forEach(x=>{if(!vivas.has(x.dataset.xfk))x.remove()});
  if(aberto&&!vivas.has(aberto.k))fechar()}
 finally{aplicando=false}
 if(desmarcar.length){const r0=window.render;try{window.render=()=>{};desmarcar.forEach(cx=>cx.click())}finally{window.render=r0}try{window.render()}catch{}}}

// ─────────── Painel do filtro (fica no corpo da página, fixo junto ao botão) ───────────
function achar(){return tabelas().find(T=>T.k===aberto?.k)}
function painel(){document.querySelectorAll('body > .xfpainel').forEach(x=>x.remove());const T=achar();if(!T){aberto=null;return}
 const col=aberto.col,f=estado.f[T.k]||{},cont=new Map();for(const r of T.linhas)if(passa(r,f,col)){const v=valor(r.cells[col]);cont.set(v,(cont.get(v)||0)+1)}
 const ord=v=>{const d=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);if(d)return '0'+d[3]+d[2]+d[1];const n=Number(v.replace(/R\$|%|\s|\./g,'').replace(',','.').replace('−','-'));return isNaN(n)?'1'+norm(v):'0'+String(Math.round((n+1e12)*100)).padStart(20,'0')};
 vals=[...cont.keys()].sort((a,b)=>ord(a).localeCompare(ord(b),'pt-BR',{numeric:true}));const q=norm(busca);vis=vals.filter(v=>!q||norm(v).includes(q)).slice(0,500);
 const set=f[col],marc=v=>q?tmp.has(v):!set||set.has(v);
 const p=document.createElement('div');p.className='gfpainel xfpainel';p.setAttribute('role','dialog');p.setAttribute('aria-label','Filtrar coluna');
 p.innerHTML=`<input type="search" class="gfbusca" data-xf-busca placeholder="Pesquisar" value="${escH(busca)}">
  <label class="gftudo"><input type="checkbox" class="check" data-xf-tudo ${vis.length&&vis.every(marc)?'checked':''}> (Selecionar tudo${q?' o que foi encontrado':''})</label>
  <div class="gflista">${vis.map(v=>`<label><input type="checkbox" class="check" data-xf-val="${escH(v)}" ${marc(v)?'checked':''}> <span>${escH(v)}</span> <small>${cont.get(v)}</small></label>`).join('')||'<p class="caption">Nada encontrado.</p>'}</div>
  <div class="row" style="justify-content:space-between;gap:6px;margin-top:8px">${set?'<button type="button" class="small quiet" data-xf-limparcol>Limpar filtro</button>':'<span></span>'}<button type="button" class="small primary" data-xf-ok>OK</button></div>`;
 document.body.appendChild(p);posicionar();const i=p.querySelector('[data-xf-busca]');if(i){i.focus();const n=i.value.length;i.setSelectionRange(n,n)}}
function posicionar(rolando){const p=document.querySelector('body > .xfpainel'),T=achar(),b=T&&T.hr.cells[aberto.col]?.querySelector('.xfbtn');if(!p||!b)return;const r=b.getBoundingClientRect();
 if(rolando&&(r.bottom<0||r.top>innerHeight)){fechar();return}
 p.style.left=Math.max(8,Math.min(r.right-p.offsetWidth,innerWidth-p.offsetWidth-8))+'px';p.style.top=Math.max(8,Math.min(r.bottom+4,innerHeight-p.offsetHeight-8))+'px'}
function fechar(){aberto=null;busca='';document.querySelectorAll('body > .xfpainel').forEach(x=>x.remove())}
function definir(k,col,set){const f={...(estado.f[k]||{})};if(set)f[col]=set;else delete f[col];if(Object.keys(f).length)estado.f[k]=f;else delete estado.f[k];aplicar()}

document.addEventListener('click',e=>{const t=e.target,b=t.closest?.('.xfbtn');
 if(b){e.preventDefault();e.stopPropagation();const k=b.dataset.xfk,col=Number(b.dataset.xfc);if(aberto&&aberto.k===k&&aberto.col===col){fechar();return}aberto={k,col};busca='';b.scrollIntoView({block:'nearest'});painel();return}
 if(t.closest?.('[data-xf-limpar]')){e.preventDefault();delete estado.f[t.closest('[data-xf-limpar]').dataset.xfLimpar];fechar();aplicar();return}
 if(t.closest?.('[data-xf-excel]')){e.preventDefault();window.Exportar?.excel?.();return}
 const p=t.closest?.('.xfpainel');
 if(p){if(t.closest('[data-xf-ok]')){if(busca.trim())definir(aberto.k,aberto.col,new Set([...tmp].filter(v=>vis.includes(v))));fechar()}
  else if(t.closest('[data-xf-limparcol]')){definir(aberto.k,aberto.col,null);painel()}return}
 if(aberto)fechar()},true);
document.addEventListener('change',e=>{const x=e.target;if(!aberto||!x.closest?.('.xfpainel'))return;const f=estado.f[aberto.k]||{},col=aberto.col,q=busca.trim();
 if(x.matches('[data-xf-val]')){const v=x.dataset.xfVal;if(q){x.checked?tmp.add(v):tmp.delete(v)}else{const set=new Set(f[col]??vals);x.checked?set.add(v):set.delete(v);definir(aberto.k,col,vals.every(y=>set.has(y))?null:set)}painel();return}
 if(x.matches('[data-xf-tudo]')){if(q)tmp=x.checked?new Set(vis):new Set();else definir(aberto.k,col,x.checked?null:new Set());painel()}});
document.addEventListener('input',e=>{const x=e.target;if(!x.matches?.('[data-xf-busca]'))return;busca=x.value;const q=norm(busca);tmp=new Set(vals.filter(v=>!q||norm(v).includes(q)));painel()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&aberto)fechar();if(e.key==='Enter'&&e.target.matches?.('[data-xf-busca]')){e.preventDefault();document.querySelector('[data-xf-ok]')?.click()}});
document.addEventListener('scroll',e=>{if(aberto&&!e.target.closest?.('.xfpainel'))posicionar(true)},{passive:true,capture:true});
addEventListener('resize',()=>aberto&&posicionar());
// Depois de cada desenho da tela, põe os botões e reaplica o filtro.
let pend=false;const agendar=()=>{if(pend)return;pend=true;setTimeout(()=>{pend=false;aplicar()},30)};
new MutationObserver(ms=>{if(ms.every(m=>m.target.closest?.('.xfpainel,.xfaviso,.xfbtn')||[...m.addedNodes].every(n=>n.classList?.contains?.('xfbtn')||n.classList?.contains?.('xfaviso')||n.classList?.contains?.('xfpainel'))&&m.removedNodes.length===0))return;agendar()}).observe(document.body,{childList:true,subtree:true});
window.Filtros={aplicar,limpar:()=>{estado.f={};fechar();aplicar()}};
})();
