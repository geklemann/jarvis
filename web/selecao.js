'use strict';
// "Marcar todas" em qualquer tabela: se as linhas têm caixa de seleção na primeira coluna e o cabeçalho ainda não
// tem a sua, o Jarvis põe uma no cabeçalho. Ela marca ou desmarca todas as linhas visíveis clicando nas caixas de
// cada linha (assim cada tela atualiza a própria seleção como num clique normal), redesenhando a tela uma vez só.
// Fica marcada quando todas estão, e "pela metade" quando só algumas estão. Vale para telas novas sem código extra.
(()=>{
const linhasDe=t=>[...t.tBodies].flatMap(b=>[...b.rows]).map(tr=>{const c=tr.cells[0],i=c?.querySelector(':scope > input[type=checkbox], :scope > label > input[type=checkbox]');
 return i&&!i.disabled&&c.textContent.trim()===''&&tr.offsetParent!==null?i:null}).filter(Boolean);
function preparar(){const view=document.getElementById('view');if(!view)return;
 view.querySelectorAll('table').forEach((t,ti)=>{const th=t.tHead?.rows[0]?.cells[0];if(!th)return;const ls=linhasDe(t);
  const propria=th.querySelector('input[type=checkbox]:not([data-sel-todas])');if(propria)return;
  let cx=th.querySelector('input[data-sel-todas]');
  if(ls.length<2){cx?.remove();return}
  if(!cx){cx=document.createElement('input');cx.type='checkbox';cx.className='check';cx.dataset.selTodas=String(ti);cx.title='Marcar todas';cx.setAttribute('aria-label','Marcar todas as linhas');th.prepend(cx)}
  const n=ls.filter(i=>i.checked).length;cx.checked=n===ls.length;cx.indeterminate=n>0&&n<ls.length})}
function marcarTodas(ti,quer){const r0=window.render;let mudou=0;
 // Sem redesenho a cada clique: a tela redesenha uma vez no fim.
 try{window.render=()=>{};for(let volta=0;volta<5000;volta++){const t=document.getElementById('view')?.querySelectorAll('table')[ti];if(!t)break;
   const i=linhasDe(t).find(x=>x.checked!==quer);if(!i)break;i.click();mudou++}}
 finally{window.render=r0}
 if(mudou)try{render()}catch{}preparar()}
document.addEventListener('change',e=>{const cx=e.target.closest?.('input[data-sel-todas]');if(!cx)return;e.stopPropagation();marcarTodas(Number(cx.dataset.selTodas),cx.checked)},true);
// Depois de cada desenho da tela e de cada clique numa caixa de linha, atualiza a caixa do cabeçalho.
let pend=false;const agendar=()=>{if(pend)return;pend=true;setTimeout(()=>{pend=false;preparar()},30)};
new MutationObserver(agendar).observe(document.body,{childList:true,subtree:true});
document.addEventListener('change',e=>{if(e.target.matches?.('td input[type=checkbox]'))agendar()});
window.Selecao={preparar,marcarTodas};
})();
