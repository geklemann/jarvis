'use strict';
// Central de erros (captura): carrega antes de tudo e registra qualquer falha não tratada no navegador de quem usa o
// sistema — erro de script e promessa rejeitada —, com a tela aberta, o navegador e a versão publicada. Cada erro
// diferente vira uma linha (assinatura = mensagem + arquivo:linha); repetições só somam no contador. Os registros
// vão para o banco (função registrar_erro) assim que houver sessão; a tela fica em Central de erros (centralerros.js).
(()=>{
const fila=[],vistos=new Set(),LIMITE=25;let enviados=0;
const versao=(String(document.currentScript?.src||'').match(/[?&]v=([^&]+)/)||[])[1]||'dev';
/** Mensagem sem números longos (ids, valores) + primeiro arquivo:linha do site na pilha. */
function assinatura(msg,pilha){const m=String(msg||'').replace(/\d{3,}/g,'#').replace(/\s+/g,' ').trim().slice(0,140);
 const f=String(pilha||'').split('\n').map(l=>l.match(/([a-z0-9_.-]+\.js)(?:\?[^:)\s]*)?:(\d+)(?::\d+)?/i)).find(Boolean);
 return m+(f?` @ ${f[1]}:${f[2]}`:'')}
// Ruído que não é defeito do Jarvis: erro de outro domínio sem detalhe, extensões do navegador e o aviso inofensivo do ResizeObserver.
const ignorar=(msg,pilha)=>!msg||/^Script error\.?$/i.test(msg)||/ResizeObserver loop/i.test(msg)||/(chrome|moz|safari)-extension:\/\//.test(String(pilha||''));
function registrar(erro,extra){try{
 const msg=String(erro?.message??erro?.reason?.message??erro??'').slice(0,1000),pilha=String(erro?.stack??erro?.reason?.stack??'').slice(0,4000)+(extra?`\n[contexto] ${extra}`:'');
 if(ignorar(msg,pilha))return;const a=assinatura(msg,pilha);if(vistos.has(a))return;vistos.add(a);
 fila.push({a,msg,pilha,pagina:typeof page!=='undefined'?String(page):'',url:location.href.split('#')[0].slice(0,300),nav:navigator.userAgent})}catch{}}
async function enviar(){const c=window.Cloud;if(!fila.length||!c?.client||!c.session||enviados>=LIMITE)return;
 for(const e of fila.splice(0,5)){if(enviados>=LIMITE)break;enviados++;
  try{await c.client.rpc('registrar_erro',{ws:c.ws||null,p_assinatura:e.a,p_mensagem:e.msg,p_pilha:e.pilha,p_pagina:e.pagina,p_url:e.url,p_navegador:e.nav,p_versao:versao})}catch{}}}
addEventListener('error',ev=>{if(ev.error||ev.message)registrar(ev.error||{message:ev.message,stack:`${ev.filename||''}:${ev.lineno||''}`})});
addEventListener('unhandledrejection',ev=>registrar(ev.reason instanceof Error?ev.reason:{message:typeof ev.reason==='string'?ev.reason:(ev.reason?.message||JSON.stringify(ev.reason)||'Promessa rejeitada')}));
setInterval(enviar,4000);
window.Erros={registrar,assinatura,versao,pendentes:()=>fila.length};
})();
