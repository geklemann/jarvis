'use strict';
// Digitar datas sem a tela "roubar" o campo: o navegador avisa mudança a cada pedaço digitado (ao digitar o "2" do ano,
// 30/09/0002 já é uma data válida) e as telas que se redesenham nessa hora tiravam o foco no meio da digitação.
// Enquanto a pessoa digita num campo de data/mês, os avisos ficam guardados; a data vale ao sair do campo ou no Enter.
// Escolher no calendário (sem teclado) continua valendo na hora.
(()=>{
const DATA='input[type=date],input[type=month],input[type=datetime-local]';
let digitando=null,pendente=null;
document.addEventListener('keydown',e=>{const i=e.target;if(!i.matches?.(DATA))return;
 if(e.key==='Enter'){soltar(i);return}
 if(/^[0-9]$/.test(e.key)||['Backspace','Delete','ArrowUp','ArrowDown'].includes(e.key))digitando=i},true);
// Segura input/change do campo em digitação (o valor fica no campo; a tela só fica sabendo no fim).
for(const tipo of ['input','change'])document.addEventListener(tipo,e=>{const i=e.target;if(!i.matches?.(DATA)||e.jvSolto)return;
 const ano=Number(String(i.value).slice(0,4));
 if(digitando===i||(i.value&&(ano<1900||ano>2100))){e.stopImmediatePropagation();pendente=i}},true);
function soltar(i){if(digitando===i)digitando=null;if(pendente!==i)return;pendente=null;const ano=Number(String(i.value).slice(0,4));
 if(i.value&&(ano<1900||ano>2100))return; // ano incompleto: não aplica
 for(const tipo of ['input','change']){const ev=new Event(tipo,{bubbles:true});ev.jvSolto=true;i.dispatchEvent(ev)}}
document.addEventListener('focusout',e=>{if(e.target.matches?.(DATA))soltar(e.target)},true);
window.Datas={soltar};
})();
