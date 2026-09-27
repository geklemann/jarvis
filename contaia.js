'use strict';
// Conta a pagar por foto, print, PDF ou voz: a IA lê o documento (ou a frase falada) e preenche o lançamento.
// Nada é salvo sozinho: a pessoa confere os campos e clica em Salvar. Alertas de golpe de boleto aparecem em destaque.
(()=>{
Object.assign(paths,{mic:'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5 11a7 7 0 0 0 14 0 M12 18v3',camera:'M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'});
const st={estado:'',msg:'',res:null,thumb:'',falando:false,parcial:''};
const TIPOS=['Boleto','Nota fiscal','Nota de serviço','Recibo','Contrato','Fatura','Guia de imposto'];
async function fn(action,body){const r=await Cloud.client.functions.invoke('integrations',{body:{workspace_id:Cloud.ws,action,...body}});if(r.error){let msg=r.error.message;try{msg=(await r.error.context.json()).error||msg}catch{}throw Error(msg)}return r.data}
const b64=buf=>{const u=new Uint8Array(buf);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode(...u.subarray(i,i+0x8000));return btoa(s)};
// Fotos grandes de celular são reduzidas (lado maior 2000 px) antes de enviar: lê igual e envia rápido.
function reduzir(file){return new Promise((ok,nok)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const k=Math.min(1,2000/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);const d=c.toDataURL('image/jpeg',.88);ok({base64:d.split(',')[1],mime:'image/jpeg',thumb:d})};img.onerror=()=>nok(Error('Não consegui abrir a imagem.'));img.src=url})}
async function enviarArquivo(file){if(!file)return;if(file.size>8*1024*1024)return toast('Arquivo grande demais (máximo 8 MB).');
 try{let dados;if(file.type==='application/pdf'){dados={base64:b64(await file.arrayBuffer()),mime:'application/pdf'};st.thumb=''}else if(file.type.startsWith('image/')){const r=await reduzir(file);dados={base64:r.base64,mime:r.mime};st.thumb=r.thumb}else return toast('Envie uma foto, um print ou um PDF.');
  await ler(dados,`Lendo ${file.type==='application/pdf'?'o PDF':'a imagem'}…`)}catch(e){st.estado='erro';st.msg=e.message;render()}}
async function ler(dados,msg){const E=window.ERP;st.estado='lendo';st.msg=msg;st.res=null;render();
 try{const r=await fn('ler_conta',{dados:{...dados,categorias:E.catNomes(),fornecedores:E.fornNomes()}});st.res=r;st.estado='ok';preencher(r);audit('Conta a pagar lida pela IA',`${r.fornecedor||'—'} · ${r.valor!=null?money(r.valor):'sem valor'} · confiança ${r.confianca||'—'}`)}
 catch(e){st.estado='erro';st.msg=e.message}render()}
function preencher(r){const lan=window.ERP.lan,cats=window.ERP.catNomes(),brl=v=>Number(v).toFixed(2).replace('.',',');
 if(r.fornecedor)lan.fornecedor=r.fornecedor;if(r.cnpj_cpf)lan.doc=String(r.cnpj_cpf).replace(/\D/g,'');
 if(r.tipo_documento&&TIPOS.includes(r.tipo_documento))lan.tipoDoc=r.tipo_documento;if(r.numero)lan.numero=String(r.numero);
 if(r.emissao)lan.emissao=r.emissao;if(r.competencia)lan.competencia=r.competencia;if(r.categoria&&cats.includes(r.categoria))lan.categoria=r.categoria;
 const ld=String(r.linha_digitavel||'').trim();if(ld)lan.forma=/^0002/.test(ld)?'PIX':'Boleto';
 const ps=(r.parcelas||[]).filter(p=>p&&p.vencimento&&Number(p.valor)>0);lan.recorrente=false;
 if(ps.length>1){lan.parcelas=ps.length;lan.primeiro=ps[0].vencimento;lan.valor=brl(ps.reduce((a,p)=>a+Number(p.valor),0));lan.grade=ps.map(p=>({venc:p.vencimento,valor:round(Number(p.valor))}))}
 else{lan.parcelas=1;if(r.vencimento)lan.primeiro=r.vencimento;if(r.valor!=null)lan.valor=brl(r.valor);lan.grade=null}
 lan.obs=[r.descricao,ld?`${lan.forma==='PIX'?'PIX copia e cola':'Linha digitável'}: ${ld}`:'',lan.obs&&!/Linha digitável|PIX copia/.test(lan.obs)?lan.obs:''].filter(Boolean).join('\n')}
function falar(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return toast('Este navegador não tem ditado por voz. Use o Chrome ou o microfone do teclado do celular na caixa de texto.');
 if(st.falando&&st.rec){st.rec.stop();return}
 const rec=new SR();rec.lang='pt-BR';rec.interimResults=true;rec.continuous=false;st.rec=rec;st.falando=true;st.parcial='';let final='';render();
 rec.onresult=e=>{let t='';for(const x of e.results){t+=x[0].transcript;if(x.isFinal)final=t}st.parcial=t;const el=$('#ciTexto');if(el)el.value=t};
 rec.onerror=e=>{st.falando=false;toast(e.error==='not-allowed'?'Libere o microfone para o site no cadeado da barra de endereço.':'Não entendi. Tente de novo.');render()};
 rec.onend=()=>{st.falando=false;const t=(final||st.parcial).trim();if(t){st.thumb='';ler({texto:t},`Entendendo: “${t}”`)}else render()};
 rec.start()}
function card(){const r=st.res,conf={alta:['ok','Leitura com confiança alta'],media:['warn','Confira os campos'],baixa:['bad','Leitura incerta — confira tudo']}[r?.confianca]||['info',''];
 return `<div class="formcard ciacard" id="ciDrop"><div class="ciatop"><div class="ciaicon">${icon('spark')}</div><div><h3>Lançar por foto, print ou voz</h3><p class="caption">Fotografe o boleto, arraste o PDF, cole um print (Ctrl+V) ou fale: <em>“conta de luz, 480 reais, vence dia 10”</em>. A IA preenche; você confere e salva.</p></div></div>
 <div class="ciaacoes"><button class="small primary" data-ci="arquivo">${icon('camera')} Foto ou arquivo</button><input type="file" id="ciArq" accept="image/*,application/pdf" hidden>
 <button class="small ${st.falando?'danger':''}" data-ci="falar">${icon('mic')} ${st.falando?'Ouvindo… toque para parar':'Falar a conta'}</button>
 <input id="ciTexto" placeholder="ou escreva: aluguel 3.500 vence dia 5" value="${esc(st.falando?st.parcial:'')}"><button class="small" data-ci="texto">Preencher</button></div>
 ${st.estado==='lendo'?`<div class="ciastatus"><span class="spin"></span> ${esc(st.msg)}</div>`:''}
 ${st.estado==='erro'?`<div class="notice bad">${esc(st.msg)}</div>`:''}
 ${st.estado==='ok'&&r?`<div class="ciares">${st.thumb?`<img src="${st.thumb}" alt="Documento lido">`:''}<div><p><span class="badge ${conf[0]}">${conf[1]}</span> Campos preenchidos abaixo: <strong>${esc(r.fornecedor||'—')}</strong> · ${r.valor!=null?money(r.valor):'sem valor'}${r.vencimento?` · vence ${new Date(r.vencimento+'T12:00:00').toLocaleDateString('pt-BR')}`:''}${(r.parcelas||[]).length>1?` · ${r.parcelas.length} parcelas`:''}</p>
  ${(r.alertas||[]).length?`<ul class="ciaalertas">${r.alertas.map(a=>`<li>${esc(a)}</li>`).join('')}</ul>`:''}
  ${r.linha_digitavel?`<div class="row wrap" style="gap:8px"><code class="cialinha">${esc(r.linha_digitavel)}</code><button class="small quiet" data-ci-copiar="${esc(r.linha_digitavel)}">Copiar</button></div>`:''}
  ${r.vencimento&&r.vencimento<new Date().toLocaleDateString('sv-SE')?'<p class="red caption">Documento já vencido: confira juros e multa antes de pagar.</p>':''}</div></div>`:''}</div>`}
document.addEventListener('change',e=>{if(e.target.id==='ciArq'){enviarArquivo(e.target.files[0]);e.target.value=''}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-ci],[data-ci-copiar]');if(!b)return;
 if(b.dataset.ci==='arquivo')$('#ciArq').click();
 if(b.dataset.ci==='falar')falar();
 if(b.dataset.ci==='texto'){const t=$('#ciTexto').value.trim();if(!t)return toast('Escreva ou fale a conta.');st.thumb='';ler({texto:t},'Entendendo a conta…')}
 if(b.dataset.ciCopiar){navigator.clipboard?.writeText(b.dataset.ciCopiar).then(()=>toast('Copiado.'),()=>toast('Não consegui copiar.'))}});
document.addEventListener('keydown',e=>{if(e.target.id==='ciTexto'&&e.key==='Enter'){e.preventDefault();document.querySelector('[data-ci="texto"]')?.click()}});
document.addEventListener('paste',e=>{if(page!=='lancamento')return;const f=[...(e.clipboardData?.files||[])].find(x=>x.type.startsWith('image/')||x.type==='application/pdf');if(f){e.preventDefault();enviarArquivo(f)}});
document.addEventListener('dragover',e=>{const d=e.target.closest?.('#ciDrop');if(d){e.preventDefault();d.classList.add('arrastando')}});
document.addEventListener('dragleave',e=>{e.target.closest?.('#ciDrop')?.classList.remove('arrastando')});
document.addEventListener('drop',e=>{const d=e.target.closest?.('#ciDrop');if(!d)return;e.preventDefault();d.classList.remove('arrastando');enviarArquivo(e.dataTransfer.files[0])});
window.ContaIA={card,limpar:()=>{st.estado='';st.res=null;st.thumb=''}};
})();
