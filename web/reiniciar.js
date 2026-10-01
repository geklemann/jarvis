'use strict';
// Reiniciar as telas pelo menu: cada tela registra as chaves do seu estado de TELA (aba, filtros, busca, página, item
// aberto) com os valores iniciais. Ao clicar num item do menu lateral, do menu do usuário ou no logo, todas voltam ao
// estado original — a tela clicada abre "do zero". Preferências (modo galeria/lista, parâmetros, data da GNRE) e dados
// carregados não entram na lista e ficam como estão. A competência (mês do cabeçalho) também é mantida.
(()=>{
const telas=[];
const copia=v=>v instanceof Set?new Set(v):v instanceof Map?new Map(v):v&&typeof v==='object'?structuredClone(v):v;
function registrar(obj,chaves){if(!obj||!Array.isArray(chaves))return;telas.push({obj,ini:Object.fromEntries(chaves.map(k=>[k,copia(obj[k])]))})}
function tudo(){for(const {obj,ini} of telas)for(const [k,v] of Object.entries(ini))obj[k]=copia(v);try{document.querySelectorAll('.modalback').length&&closeModal()}catch{}}
// Captura: roda antes da navegação do clique, então a tela já abre no estado original.
document.addEventListener('click',e=>{if(e.target.closest('aside [data-nav],aside [data-mtoggle],aside .brand,#erpdrop [data-nav],.mobilenav [data-nav]'))tudo()},true);
window.Reiniciar={registrar,tudo,quantas:()=>telas.length};
})();
