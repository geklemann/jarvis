'use strict';
// Tabelas largas: uma barra de rolagem lateral também EM CIMA da tabela (sincronizada com a de baixo), para não ter
// que descer a página até o fim da tabela para rolar para o lado. Vale para todas as telas.
(()=>{
function ligar(w){if(w.previousElementSibling?.classList.contains('rolatopo'))return w.previousElementSibling;
 const t=document.createElement('div');t.className='rolatopo';t.setAttribute('aria-hidden','true');t.innerHTML='<div></div>';w.before(t);
 let de=null;t.addEventListener('scroll',()=>{if(de==='w'){de=null;return}de='t';w.scrollLeft=t.scrollLeft});
 w.addEventListener('scroll',()=>{if(de==='t'){de=null;return}de='w';t.scrollLeft=w.scrollLeft});return t}
function ajustar(){for(const w of document.querySelectorAll('.tablewrap')){const larga=w.scrollWidth>w.clientWidth+4;let t=w.previousElementSibling?.classList.contains('rolatopo')?w.previousElementSibling:null;
  if(!larga){if(t)t.hidden=true;continue}t=ligar(w);t.hidden=false;t.firstChild.style.width=w.scrollWidth+'px';t.scrollLeft=w.scrollLeft}}
let tm=0;const agendar=()=>{clearTimeout(tm);tm=setTimeout(ajustar,120)};
new MutationObserver(agendar).observe(document.documentElement,{childList:true,subtree:true});addEventListener('resize',agendar);
})();
