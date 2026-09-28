'use strict';
// Contas a pagar: aprovação em duas etapas, lote de pagamento, importação do DDA (boletos em nome da empresa) e
// leitura da linha digitável. Regra de aprovação em gerencial.aprovacao {ativo, acima, outros}: a conta lançada por
// outra pessoa (ou acima do valor) fica "aguardando aprovação" e não pode ser paga até o dono aprovar.
(()=>{
const cfg=()=>({ativo:false,acima:0,outros:true,...(db.gerencial?.aprovacao||{})});
const dono=()=>(window.Cloud?.role||'owner')==='owner';
const quem=()=>window.Cloud?.session?.user?.email||'local';
const P=()=>db.payables||(db.payables=[]);
const saldo=t=>round(Math.max(0,t.valor+(t.juros||0)-(t.desconto||0)-(t.valorPago||0)));
const aberto=t=>!['pago','cancelado'].includes(t.status);
const dBR=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'—';

// ─── Linha digitável / código de barras (FEBRABAN) ───
// Boleto bancário: 47 dígitos (linha) ou 44 (barras); fator de vencimento com a virada de 22/02/2025 (fator volta a 1000).
// Arrecadação (contas de consumo e tributos): 48 dígitos começando por 8; valor nas posições do código de barras.
const BANCOS={'001':'Banco do Brasil','033':'Santander','104':'Caixa','237':'Bradesco','341':'Itaú','260':'Nubank','077':'Inter','336':'C6 Bank','748':'Sicredi','756':'Sicoob','422':'Safra','212':'Banco Original','655':'Votorantim','041':'Banrisul','085':'Ailos','136':'Unicred','290':'PagBank','323':'Mercado Pago','380':'PicPay','403':'Cora','197':'Stone','208':'BTG Pactual'};
function lerBoleto(txt){const d=String(txt||'').replace(/\D/g,'');if(!d)return null;
 if(d[0]==='8'&&(d.length===48||d.length===44)){const b=d.length===48?[0,1,2,3].map(i=>d.slice(i*12,i*12+11)).join(''):d;const ref=b[2];const valor=['6','7'].includes(ref)?Number(b.slice(4,15))/100:null;return {tipo:'arrecadacao',codigo:d,valor,vencimento:null,banco:null,segmento:{1:'Prefeitura',2:'Saneamento',3:'Energia e gás',4:'Telecomunicações',5:'Órgão público',6:'Carnês e similares',7:'Multas de trânsito',9:'Uso exclusivo do banco'}[b[1]]||null}}
 let barras=d;if(d.length===47)barras=d.slice(0,4)+d.slice(32,47)+d.slice(4,9)+d.slice(10,20)+d.slice(21,31);else if(d.length!==44)return null;
 const banco=barras.slice(0,3),fator=Number(barras.slice(5,9)),valor=Number(barras.slice(9,19))/100;let venc=null;
 // Fator de vencimento: base 07/10/1997; ao chegar em 9999 (21/02/2025) recomeçou em 1000 (22/02/2025). Fica a data mais próxima de hoje.
 if(fator>=1000){const c1=Date.UTC(1997,9,7)+fator*864e5,c2=Date.UTC(2025,1,22)+(fator-1000)*864e5,dt=Math.abs(c1-Date.now())<Math.abs(c2-Date.now())?c1:c2;venc=new Date(dt).toISOString().slice(0,10)}
 return {tipo:'bancario',codigo:d,valor:valor||null,vencimento:venc,banco:BANCOS[banco]?`${BANCOS[banco]} (${banco})`:`Banco ${banco}`}}

// ─── Aprovação ───
function marcar(t){const c=cfg();if(!c.ativo){t.aprovacao='aprovado';return t}const precisa=(c.outros&&!dono())||(Number(c.acima)>0&&Number(t.valor)>Number(c.acima));t.aprovacao=precisa?'pendente':'aprovado';if(precisa){t.lancadoPor=quem()}else{t.aprovadoPor=quem();t.aprovadoEm=new Date().toISOString()}return t}
const pendentes=()=>P().filter(t=>aberto(t)&&t.aprovacao==='pendente');
function podePagar(ids){const b=ids.map(id=>P().find(x=>x.id===id)).filter(t=>t?.aprovacao==='pendente');if(b.length){toast(`${b.length} título(s) aguardando aprovação do dono. Aprove antes de pagar.`);return false}return true}
function aprovar(ids,ok,motivo){const ts=ids.map(id=>P().find(x=>x.id===id)).filter(Boolean);for(const t of ts){t.aprovacao=ok?'aprovado':'recusado';t.aprovadoPor=quem();t.aprovadoEm=new Date().toISOString();if(!ok){t.status='cancelado';t.observacao=[t.observacao,`Recusado por ${quem()}${motivo?': '+motivo:''}`].filter(Boolean).join(' · ')}}
 audit(ok?'Pagamento aprovado':'Pagamento recusado',ts.map(t=>`${t.fornecedor||t.descricao} ${money(t.valor)}`).slice(0,8).join(' · ')+(motivo?` · ${motivo}`:''));save();render();toast(ok?`${ts.length} título(s) aprovado(s).`:`${ts.length} título(s) recusado(s).`)}
function telaAprovar(){const l=pendentes().sort((a,b)=>a.vencimento.localeCompare(b.vencimento)),tot=l.reduce((a,t)=>a+saldo(t),0);
 modal('Contas aguardando aprovação',`<p class="caption">${l.length} título(s) · ${money(tot)}. Aprovadas, entram no lote de pagamento; recusadas, são canceladas com o motivo registrado.</p>
 <div class="tablewrap" style="max-height:380px"><table><thead><tr><th><input type="checkbox" class="check" id="apTodos" checked></th><th>Vencimento</th><th>Fornecedor</th><th>Categoria</th><th>Lançado por</th><th class="num">Valor</th></tr></thead><tbody>
 ${l.map(t=>`<tr><td><input type="checkbox" class="check" data-ap="${esc(t.id)}" checked></td><td>${dBR(t.vencimento)}</td><td><strong>${esc(t.fornecedor||t.descricao||'—')}</strong><br><span class="caption">${esc(t.descricao||'')}</span></td><td class="caption">${esc(t.categoria||'')}</td><td class="caption">${esc(t.lancadoPor||t.createdBy||'—')}</td><td class="num">${money(saldo(t))}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nada aguardando aprovação. ✓</td></tr>'}</tbody></table></div>
 ${dono()?`<label for="apMotivo">Motivo (se recusar)</label><input id="apMotivo" placeholder="Ex.: valor divergente do contrato"><div class="modalfoot"><button data-action="close">Fechar</button><button class="quiet" data-pg2="recusar">Recusar selecionados</button><button class="primary" data-pg2="aprovar">${icon('check')} Aprovar selecionados</button></div>`:'<p class="caption">Só o dono aprova.</p><div class="modalfoot"><button data-action="close">Fechar</button></div>'}`);
 const t=$('#apTodos');if(t)t.onchange=()=>$$('[data-ap]').forEach(x=>x.checked=t.checked)}
function telaRegras(){const c=cfg();modal('Regras de aprovação de pagamentos',`<label class="check-l"><input type="checkbox" class="check" id="rgAtivo" ${c.ativo?'checked':''}> Exigir aprovação do dono antes de pagar</label>
 <label class="check-l"><input type="checkbox" class="check" id="rgOutros" ${c.outros?'checked':''}> Sempre que a conta for lançada por outra pessoa</label>
 <label for="rgAcima">E sempre que o valor passar de (R$, 0 = qualquer valor lançado pelo dono passa direto)</label><input id="rgAcima" inputmode="decimal" value="${c.acima?String(c.acima).replace('.',','):''}" placeholder="Ex.: 5.000,00">
 <p class="caption">Contas geradas das notas de entrada do Bling entram aprovadas (a nota fiscal já é o comprovante). Quem aprova e quando fica no log de auditoria.</p>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-pg2="salvarregras">${icon('check')} Salvar</button></div>`)}

// ─── Lote de pagamento ───
const linhaDe=t=>{const m=String(t.observacao||'').match(/(?:Linha digitável|PIX copia e cola):\s*([0-9A-Za-z.\s]{20,})/);return (t.linhaDigitavel||m?.[1]||'').trim()};
function telaLote(ids){const ts=(ids&&ids.length?ids.map(id=>P().find(x=>x.id===id)).filter(Boolean):P().filter(t=>aberto(t)&&t.aprovacao!=='pendente'&&t.vencimento<=new Date(Date.now()+7*864e5).toISOString().slice(0,10))).filter(aberto).sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
 const bloq=ts.filter(t=>t.aprovacao==='pendente'),ok=ts.filter(t=>t.aprovacao!=='pendente'),tot=ok.reduce((a,t)=>a+saldo(t),0);
 modal('Lote de pagamento',`<p class="caption">${ok.length} título(s) · <strong>${money(tot)}</strong>${bloq.length?` · <span class="red">${bloq.length} fora do lote (aguardando aprovação)</span>`:''}. Pague no internet banking copiando cada código; depois marque o lote como pago. (Pagamento direto pelo Jarvis precisa da API de pagamentos do banco — veja Integrações.)</p>
 <div class="tablewrap" style="max-height:400px"><table><thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Código para pagar</th><th class="num">Valor</th></tr></thead><tbody>
 ${ok.map(t=>{const c=linhaDe(t);return `<tr><td>${dBR(t.vencimento)}</td><td><strong>${esc(t.fornecedor||t.descricao||'—')}</strong><br><span class="caption">${esc(t.categoria||'')}</span></td><td>${c?`<code class="cialinha">${esc(c)}</code> <button class="small quiet" data-pg2-copiar="${esc(c)}">Copiar</button>`:'<span class="caption">sem linha digitável (TED/PIX pelo cadastro)</span>'}</td><td class="num">${money(saldo(t))}</td></tr>`}).join('')||'<tr><td colspan="4" class="empty">Nada a pagar nos próximos 7 dias.</td></tr>'}</tbody></table></div>
 <div class="grid two" style="margin-top:10px"><div><label for="ltData">Data do pagamento</label><input id="ltData" type="date" value="${new Date().toLocaleDateString('sv-SE')}"></div><div><label for="ltConta">Conta de saída</label><input id="ltConta" list="ltContas" value="${esc((db.bankAccounts||[])[0]?.nome||'Banco principal')}"><datalist id="ltContas">${(db.bankAccounts||[]).map(a=>`<option value="${esc(a.nome)}">`).join('')}</datalist></div></div>
 <div class="modalfoot"><button data-action="close">Fechar</button><button data-pg2="ltcsv" data-ids="${esc(ok.map(t=>t.id).join(','))}">${icon('download')} Exportar lote</button><button class="primary" data-pg2="ltpago" data-ids="${esc(ok.map(t=>t.id).join(','))}" ${ok.length?'':'disabled'}>${icon('check')} Marcar lote como pago</button></div>`)}

// ─── DDA / boletos em lote ───
const norm=s=>normalized(String(s||''));
function colunas(cab){const f=re=>cab.findIndex(c=>re.test(norm(c)));return {forn:f(/benefici|cedente|favorecido|fornecedor|sacador|nome/),doc:f(/cnpj|cpf|documento/),venc:f(/venc/),valor:f(/valor|vlr|total/),linha:f(/linha|codigo|barras|digitavel/),desc:f(/descri|historico|observ/)}}
const dataBR2ISO=s=>{s=String(s||'').trim();let m=s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);if(m)return `${m[3].length===2?'20'+m[3]:m[3]}-${m[2]}-${m[1]}`;m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:''};
const numBR=s=>{s=String(s??'').replace(/[R$\s]/g,'');if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');return Number(s)||0};
let dda=null;
async function lerArquivo(file){const ext=file.name.split('.').pop().toLowerCase();let rows;
 if(['xlsx','xls','ods'].includes(ext)){const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''})}
 else{const t=await file.text();const sep=[';','\t',','].sort((a,z)=>t.split(z).length-t.split(a).length)[0];rows=t.split(/\r?\n/).filter(Boolean).map(l=>l.split(sep).map(x=>x.replace(/^"|"$/g,'').trim()))}
 const hi=rows.findIndex(r=>r.filter(Boolean).length>=3&&r.some(c=>/venc/i.test(c))&&r.some(c=>/valor/i.test(c)));if(hi<0)throw Error('Não encontrei as colunas de vencimento e valor no arquivo.');
 const c=colunas(rows[hi]),existentes=new Set(P().map(t=>linhaDe(t).replace(/\D/g,'')).filter(Boolean));
 dda=rows.slice(hi+1).map(r=>{const linha=String(r[c.linha]??'').replace(/\D/g,''),b=lerBoleto(linha);const venc=dataBR2ISO(r[c.venc])||b?.vencimento||'',valor=numBR(r[c.valor])||b?.valor||0;
  const forn=String(r[c.forn]??'').trim()||b?.banco||'';const dup=linha&&existentes.has(linha)||P().some(t=>aberto(t)&&Math.abs(t.valor-valor)<.01&&t.vencimento===venc&&norm(t.fornecedor).slice(0,10)===norm(forn).slice(0,10));
  return {forn,doc:String(r[c.doc]??'').trim(),venc,valor,linha,desc:String(r[c.desc]??'').trim(),dup,sel:!dup&&valor>0&&!!venc}}).filter(x=>x.valor>0);
 telaDDA()}
function telaDDA(){const cats=[...new Set([...(db.cadastros||[]).filter(c=>c.tipo==='cat').map(c=>c.dados.nome),...P().map(p=>p.categoria).filter(Boolean)])].sort();
 modal('Importar boletos (DDA)',!dda?`<p>No internet banking, abra <b>DDA / boletos em meu nome</b> e exporte a lista (Excel ou CSV). O Jarvis lê beneficiário, CNPJ, vencimento, valor e linha digitável, marca os que já estão lançados e cria as contas a pagar${cfg().ativo?' (aguardando aprovação quando a regra exigir)':''}.</p>
  <input type="file" id="ddaArq" accept=".csv,.txt,.xlsx,.xls"><p class="caption">Conexão automática com o DDA (sem exportar) depende da API do banco (Itaú: API de Cobrança/DDA ou Open Finance) com contrato e certificado da empresa.</p><div class="modalfoot"><button data-action="close">Fechar</button></div>`
 :`<p class="caption">${dda.length} boleto(s) no arquivo · ${dda.filter(x=>x.dup).length} já lançado(s) · ${dda.filter(x=>x.sel).length} selecionado(s).</p>
  <div class="tablewrap" style="max-height:360px"><table><thead><tr><th></th><th>Vencimento</th><th>Beneficiário</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>
  ${dda.map((x,i)=>`<tr><td><input type="checkbox" class="check" data-dda="${i}" ${x.sel?'checked':''}></td><td>${dBR(x.venc)}</td><td><strong>${esc(x.forn||'—')}</strong><br><span class="caption">${esc(x.doc||'')} ${x.linha?'· '+esc(x.linha.slice(0,12))+'…':''}</span></td><td class="num">${money(x.valor)}</td><td>${x.dup?'<span class="badge">já lançado</span>':'<span class="badge info">novo</span>'}</td></tr>`).join('')}</tbody></table></div>
  <label for="ddaCat">Categoria para os novos</label><input id="ddaCat" list="ddaCats" placeholder="Ex.: Compra de mercadorias"><datalist id="ddaCats">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
  <div class="modalfoot"><button data-pg2="ddavoltar">Outro arquivo</button><button class="primary" data-pg2="ddaimportar">${icon('check')} Criar contas a pagar</button></div>`);
 const a=$('#ddaArq');if(a)a.onchange=async()=>{try{await lerArquivo(a.files[0])}catch(e){toast(e.message)}}}

// ─── Eventos ───
document.addEventListener('click',e=>{const b=e.target.closest('[data-pg2],[data-pg2-copiar]');if(!b)return;const d=b.dataset;
 if(d.pg2Copiar){navigator.clipboard?.writeText(d.pg2Copiar).then(()=>toast('Copiado.'),()=>toast('Não consegui copiar.'));return}
 switch(d.pg2){case 'aprovacoes':telaAprovar();break;case 'regras':telaRegras();break;case 'lote':telaLote([...(window.Financeiro?.selecionados?.()||[])]);break;case 'dda':dda=null;telaDDA();break;case 'ddavoltar':dda=null;telaDDA();break;
  case 'aprovar':case 'recusar':{if(!dono())return toast('Só o dono aprova.');const ids=$$('[data-ap]').filter(x=>x.checked).map(x=>x.dataset.ap);if(!ids.length)return toast('Selecione.');const mot=$('#apMotivo')?.value.trim();if(d.pg2==='recusar'&&!mot)return toast('Informe o motivo da recusa.');closeModal();aprovar(ids,d.pg2==='aprovar',mot);break}
  case 'salvarregras':{if(!dono())return toast('Só o dono altera as regras.');const acima=Number(String($('#rgAcima').value).replace(/\./g,'').replace(',','.'))||0;db.gerencial={...(db.gerencial||{}),aprovacao:{ativo:$('#rgAtivo').checked,outros:$('#rgOutros').checked,acima}};audit('Regras de aprovação de pagamentos',JSON.stringify(db.gerencial.aprovacao));save();closeModal();render();toast('Regras salvas.');break}
  case 'ltcsv':{const ts=d.ids.split(',').map(id=>P().find(x=>x.id===id)).filter(Boolean);const txt=[['vencimento','fornecedor','cnpj_cpf','valor','codigo_pagamento'],...ts.map(t=>[t.vencimento,t.fornecedor||t.descricao,t.fornecedorDoc||'',String(saldo(t)).replace('.',','),linhaDe(t)])].map(l=>l.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+txt],{type:'text/csv'}));a.download=`lote-pagamento-${new Date().toLocaleDateString('sv-SE')}.csv`;a.click();break}
  case 'ltpago':{if(b.dataset.conf!=='1'){b.dataset.conf='1';b.innerHTML=`${icon('check')} Confirmar baixa do lote`;b.classList.add('danger');return}const data=$('#ltData').value,conta=$('#ltConta').value.trim();const ts=d.ids.split(',').map(id=>P().find(x=>x.id===id)).filter(t=>t&&t.aprovacao!=='pendente');
   for(const t of ts){t.valorPago=round((t.valorPago||0)+saldo(t));t.pagoEm=data;t.conta=conta;t.status='pago'}audit('Lote de pagamento baixado',`${ts.length} título(s) · ${money(ts.reduce((a,t)=>a+t.valorPago,0))} · ${conta} · ${dBR(data)}`);save();closeModal();render();toast(`${ts.length} título(s) baixado(s).`);break}
  case 'ddaimportar':{const cat=$('#ddaCat').value.trim(),sel=dda.filter((x,i)=>$(`[data-dda="${i}"]`)?.checked);if(!sel.length)return toast('Selecione ao menos um boleto.');const g=uid();
   sel.forEach((x,i)=>P().push(marcar({id:`DDA-${g}-${i+1}`,origem:'dda',fornecedor:x.forn,fornecedorDoc:x.doc,descricao:x.desc||`Boleto · ${x.forn}`,documento:'',parcela:1,parcelas:1,emissao:new Date().toLocaleDateString('sv-SE'),vencimento:x.venc,valor:round(x.valor),juros:0,desconto:0,valorPago:0,status:'aberto',categoria:cat,linhaDigitavel:x.linha,observacao:x.linha?`Linha digitável: ${x.linha}`:'',createdBy:quem()})));
   audit('Boletos importados do DDA',`${sel.length} título(s) · ${money(sel.reduce((a,x)=>a+x.valor,0))}`);save();dda=null;closeModal();render();toast(`${sel.length} conta(s) criada(s).`);break}}});
document.addEventListener('change',e=>{const c=e.target.closest('[data-dda]');if(c&&dda)dda[+c.dataset.dda].sel=c.checked});
window.Pagamentos={lerBoleto,marcar,podePagar,pendentes,avisos:()=>{const n=pendentes().length;return n&&dono()?[['warn','check',`${n} pagamento(s) aguardando sua aprovação`,money(pendentes().reduce((a,t)=>a+saldo(t),0)),'pagar']]:[]}};
})();
