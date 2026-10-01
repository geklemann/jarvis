'use strict';
// Instalar o Jarvis como aplicativo (celular e computador): item "Instalar o Jarvis" no menu do usuário e um aviso
// discreto na Diretoria no bolso quando aberta pelo navegador do celular. No Android/Chrome/Edge usa o pedido de
// instalação do próprio navegador; no iPhone (Safari não tem esse pedido) mostra o passo a passo do "Adicionar à Tela de Início".
(()=>{
let pedido=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();pedido=e;marcar()});
addEventListener('appinstalled',()=>{pedido=null;try{localStorage.setItem('jarvis_instalado','1')}catch{}marcar();if(typeof toast==='function')toast('Jarvis instalado. Ele fica na tela inicial, como um aplicativo.')});
const instalado=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const ios=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)&&!/crios|fxios|edgios/i.test(navigator.userAgent);
const disponivel=()=>!instalado()&&(!!pedido||ios());
const ic=n=>typeof icon==='function'?icon(n).replace('class="icon"','class="icon" style="width:18px;height:18px"'):'';

async function instalar(){
 if(instalado()){if(typeof toast==='function')toast('O Jarvis já está instalado neste aparelho.');return}
 if(pedido){const p=pedido;pedido=null;p.prompt();try{await p.userChoice}catch{}marcar();return}
 if(ios()){mostrarIos();return}
 if(typeof toast==='function')toast('Use o menu do navegador › "Instalar aplicativo" (ou "Adicionar à tela inicial").')}
function mostrarIos(){const ov=document.getElementById('overlay');if(!ov)return;
 ov.innerHTML=`<div class="modalback" data-inst-fechar><div class="modal" role="dialog" aria-modal="true" aria-labelledby="instTit" style="max-width:420px">
  <h2 id="instTit" style="margin-top:0">Instalar o Jarvis no iPhone</h2>
  <ol style="line-height:1.7;padding-left:20px;margin:8px 0 14px">
   <li>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima, na barra de baixo).</li>
   <li>Role e toque em <b>Adicionar à Tela de Início</b>.</li>
   <li>Confirme em <b>Adicionar</b>. O ícone do Jarvis aparece na tela inicial.</li></ol>
  <p class="caption" style="margin:0 0 14px">Instalado, ele abre em tela cheia e pode mostrar os alertas no celular.</p>
  <div class="row" style="justify-content:flex-end"><button class="primary" data-inst-fechar>Entendi</button></div></div></div>`}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-inst]')){e.preventDefault();instalar();return}
 const f=e.target.closest('[data-inst-fechar]');if(f&&(f.tagName==='BUTTON'||e.target===f)){const ov=document.getElementById('overlay');if(ov)ov.innerHTML=''}
 if(e.target.closest('[data-inst-dispensar]')){try{localStorage.setItem('jarvis_inst_dispensado',String(Date.now()))}catch{}document.querySelector('.inst-aviso')?.remove()}});

// Item no menu do usuário: o menu é montado dentro de erp.js (fechado), então observa quando ele abre e acrescenta o item.
function itemMenu(){const m=document.querySelector('#erpdrop .userhead');if(!m||!disponivel())return;const box=m.parentElement;if(box.querySelector('[data-inst]'))return;
 const ref=box.querySelector('[data-erp-seg]');const html=`<button class="dropitem" data-inst="1">${ic('download')}<span><strong>Instalar o Jarvis</strong><small>Abrir como aplicativo, na tela inicial</small></span></button>`;
 if(ref)ref.insertAdjacentHTML('beforebegin',html);else m.insertAdjacentHTML('afterend',html)}
// O #erpdrop é recriado a cada tela; observa o corpo da página (a checagem é só um querySelector).
function observar(){new MutationObserver(itemMenu).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',observar);else observar();

// Aviso na Diretoria no bolso (celular, pelo navegador), uma vez a cada 15 dias se dispensado.
function marcar(){const v=document.getElementById('view');if(!v)return;document.querySelector('.inst-aviso')?.remove();
 let disp=0;try{disp=Number(localStorage.getItem('jarvis_inst_dispensado'))||0}catch{}
 if(typeof page==='undefined'||page!=='bolso'||!disponivel()||Date.now()-disp<15*864e5)return;
 v.insertAdjacentHTML('afterbegin',`<div class="notice inst-aviso" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px"><span><strong>Instale o Jarvis no celular.</strong> Abre direto na diretoria, em tela cheia, e recebe os alertas.</span><span class="row" style="gap:8px"><button class="small" data-inst-dispensar>Agora não</button><button class="small primary" data-inst>Instalar</button></span></div>`)}
if(typeof render==='function'){const r0=render;render=function(){const r=r0.apply(this,arguments);try{marcar()}catch{}return r}}
window.Instalar={instalar,disponivel,instalado};
})();
