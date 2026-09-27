'use strict';
// Vitrine animada da tela de login: os produtos mais vendidos da loja sobem devagar em colunas dos dois lados
// do cartão de entrada. Lê produtos/vitrine.json (bucket público, gravado pela sincronização do estoque).
// Sem a vitrine, mostra ilustrações de brinquedos. Respeita "reduzir movimento".
(()=>{
const URL_V=(window.CONCILIA_CONFIG?.supabaseUrl||'')+'/storage/v1/object/public/produtos/vitrine.json';
let cache=null,buscando=null;
function buscar(){if(cache)return Promise.resolve(cache);if(buscando)return buscando;
 buscando=fetch(URL_V,{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(j=>{cache=(j?.produtos||[]).filter(p=>p.img);return cache}).catch(()=>{cache=[];return cache});return buscando}
// Ilustrações de brinquedos (traço simples) para quando não houver fotos.
const TOYS={
 carro:'<path d="M8 38h48M12 38v-8l8-10h22l10 10h4v8"/><circle cx="20" cy="40" r="5"/><circle cx="46" cy="40" r="5"/><path d="M24 20v10M38 20l6 10"/>',
 quadri:'<circle cx="16" cy="42" r="8"/><circle cx="48" cy="42" r="8"/><path d="M16 42l10-16h14l8 16M26 26l-4-8h8M40 26l4-6"/>',
 bola:'<circle cx="32" cy="32" r="18"/><path d="M14 32h36M32 14c8 6 8 30 0 36M32 14c-8 6-8 30 0 36"/>',
 urso:'<circle cx="32" cy="36" r="14"/><circle cx="20" cy="20" r="6"/><circle cx="44" cy="20" r="6"/><circle cx="27" cy="33" r="1.5"/><circle cx="37" cy="33" r="1.5"/><path d="M28 41c3 3 5 3 8 0"/>',
 blocos:'<rect x="10" y="30" width="18" height="18" rx="2"/><rect x="30" y="30" width="18" height="18" rx="2"/><rect x="20" y="12" width="18" height="18" rx="2"/>',
 foguete:'<path d="M32 8c10 8 12 20 8 32H24c-4-12-2-24 8-32z"/><circle cx="32" cy="24" r="4"/><path d="M24 40l-8 8h10M40 40l8 8H38M28 46h8"/>',
 pipa:'<path d="M32 8l14 18-14 22-14-22z"/><path d="M32 8v40M18 26h28M32 48c-2 4 2 6 0 10"/>',
 cavalinho:'<path d="M14 50c10 4 26 4 36 0M20 46l4-14h16l4 14M24 32l-4-12 8 4h8l6 6"/><circle cx="38" cy="22" r="1.5"/>'};
const CORES=['#18a592','#ff7a59','#7cb4ff','#f0c46e','#b7a2ff','#5fe0cc'];
function cartaoProd(p,i){return `<figure class="vt-item" style="--d:${(i%6)*0.7}s"><img src="${String(p.img).replace(/"/g,'')}" alt="" loading="lazy" onerror="this.closest('figure').classList.add('vt-sem')"><figcaption>${String(p.nome||'').replace(/[<>&"]/g,'')}</figcaption></figure>`}
function cartaoToy(k,i){return `<figure class="vt-item vt-toy" style="--c:${CORES[i%CORES.length]}"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${TOYS[k]}</svg></figure>`}
function colunas(itens,n){const cols=[...Array(n)].map(()=>[]);itens.forEach((x,i)=>cols[i%n].push(x));
 // Cada coluna repete os itens para o laço contínuo; velocidades e sentidos diferentes dão profundidade.
 return cols.map((c,i)=>`<div class="vt-col" style="--t:${46+i*9}s;--dir:${i%2?'reverse':'normal'}"><div class="vt-track">${c.join('')}${c.join('')}</div></div>`).join('')}
async function montar(auth){if(auth.querySelector('.vitrine'))return;const v=document.createElement('div');v.className='vitrine';v.setAttribute('aria-hidden','true');auth.prepend(v);
 const prods=await buscar();const itens=prods.length>=6?prods.map(cartaoProd):[...Object.keys(TOYS),...Object.keys(TOYS)].map(cartaoToy);
 v.innerHTML=`<div class="vt-faixa"><div class="vt-faixatrack">${itens.slice(0,12).join('')}${itens.slice(0,12).join('')}</div></div><div class="vt-lado vt-esq">${colunas(itens.slice(0,Math.ceil(itens.length/2)),2)}</div><div class="vt-lado vt-dir">${colunas(itens.slice(Math.ceil(itens.length/2)),2)}</div>`;
 requestAnimationFrame(()=>v.classList.add('on'))}
new MutationObserver(()=>{const a=document.querySelector('#app .auth');if(a&&a.querySelector('#authForm'))montar(a)}).observe(document.documentElement,{childList:true,subtree:true});
})();
