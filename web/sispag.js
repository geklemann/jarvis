'use strict';
// Arquivos do banco — Itaú SISPAG (CNAB 240). Remessa: boletos pelo segmento J + J-52 (forma 30 no Itaú, 31 em outros
// bancos) e contas de consumo, tributos e GNRE com código de barras pelo segmento O (formas 13 e 91). Retorno: lê as
// ocorrências de cada pagamento e baixa no contas a pagar só o que o banco confirmou (00) e só depois do clique.
// Layout conferido com o manual SISPAG CNAB 240 do Itaú (header de arquivo 080, lotes 030). O primeiro arquivo deve
// ser validado com o gerente/suporte SISPAG antes de ir para produção.
(()=>{
const P=()=>db.payables||(db.payables=[]);
const saldo=t=>round(Math.max(0,t.valor+(t.juros||0)-(t.desconto||0)-(t.valorPago||0)));
const aberto=t=>!['pago','cancelado'].includes(t.status);
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const addDias=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toLocaleDateString('sv-SE')};
const dBR=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const cfg=()=>({conta:'',finalidade:'PAGAMENTOS',remessas:[],retornos:[],...(db.gerencial?.sispag||{})});
const salvarCfg=n=>{db.gerencial={...(db.gerencial||{}),sispag:{...cfg(),...n}};save()};
const fiscal=()=>({cnpj:'',razao:'',...(window.Parametros?.cfg?.()||db.gerencial?.fiscal||{})});
const contasItau=()=>(db.bankAccounts||[]).filter(a=>a.ativo!==false&&a.tipo!=='aplicacao'&&String(a.banco||'').replace(/\D/g,'')==='341');
const contaSel=()=>{const l=contasItau();return l.find(a=>a.id===cfg().conta)||l[0]||null};
const ui={aba:'remessa',ate:addDias(hoje(),7),vencidos:true,sel:new Set(),selIni:false,ret:null,retSel:new Set()};
window.Reiniciar?.registrar(ui,['aba','ate','vencidos','sel','selIni','ret','retSel']); // estado de tela: volta ao original ao clicar no menu

// ─── Campos CNAB ───
const txt=(s,n)=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x20-\x7E]/g,' ').toUpperCase().slice(0,n).padEnd(n,' ');
const num=(v,n)=>String(v??'').replace(/\D/g,'').slice(-n).padStart(n,'0');
const val=(v,n)=>{const s=String(Math.round((Number(v)||0)*100));if(s.length>n)throw new Error('Valor grande demais para o campo');return s.padStart(n,'0')};
const dt=d=>d?d.slice(8,10)+d.slice(5,7)+d.slice(0,4):'00000000';
const br=n=>' '.repeat(n),zr=n=>'0'.repeat(n);
const reg=p=>{const s=p.join('');if(s.length!==240)throw new Error(`Registro com ${s.length} posições (esperado 240)`);return s};
const lerData=s=>/^\d{8}$/.test(s)&&s!=='00000000'?`${s.slice(4,8)}-${s.slice(2,4)}-${s.slice(0,2)}`:null;
const lerValor=s=>/^\d+$/.test(s)?Number(s)/100:0;

// Identificador do título no arquivo ("seu número", 20 posições): o próprio id quando cabe; senão um hash estável.
const fnv=s=>{let h=0xcbf29ce484222325n;for(const c of s){h^=BigInt(c.charCodeAt(0));h=(h*0x100000001b3n)&0xffffffffffffffffn}return h.toString(36).toUpperCase()};
const seuNumero=id=>{const a=String(id).replace(/[^0-9A-Za-z]/g,'').toUpperCase();return a.length&&a.length<=20?a:('JV'+fnv(String(id))).slice(0,20)};

// ─── Código de barras a partir da linha digitável ───
const linhaDe=t=>{const m=String(t.observacao||'').match(/(?:Linha digitável):\s*([0-9.\s]{40,})/);return String(t.linhaDigitavel||m?.[1]||'').replace(/\D/g,'')};
function barras(d){d=String(d||'').replace(/\D/g,'');
 if(d[0]==='8'){if(d.length===48)return [0,1,2,3].map(i=>d.slice(i*12,i*12+11)).join('');return d.length===44?d:null}
 if(d.length===47)return d.slice(0,4)+d.slice(32,47)+d.slice(4,9)+d.slice(10,20)+d.slice(21,31);
 return d.length===44?d:null}
// Forma de pagamento pelo tipo do código: boleto (J) ou arrecadação (O). Segmento da arrecadação: 2 saneamento,
// 3 energia/gás, 4 telecom e 6 carnês → concessionária (13); 1 prefeituras, 5 órgãos públicos (GNRE, DARF), 7 multas → 91.
function classificar(t){const b=barras(linhaDe(t));if(!b)return null;
 if(b[0]==='8'){const seg=b[1];const forma=['2','3','4','6'].includes(seg)?'13':'91';const valor=['6','7'].includes(b[2])?Number(b.slice(4,15))/100:0;
  return {seg:'O',forma,tipo:'22',barras:b,valorCodigo:valor,rotulo:forma==='13'?'Concessionária':t.origem==='gnre'||/gnre|difal/i.test(t.descricao||t.categoria||'')?'GNRE':'Tributo'}}
 const banco=b.slice(0,3);return {seg:'J',forma:banco==='341'?'30':'31',tipo:'20',barras:b,valorCodigo:Number(b.slice(9,19))/100,rotulo:banco==='341'?'Boleto Itaú':'Boleto outro banco'}}
const util=d=>{const x=new Date(d+'T12:00:00');while([0,6].includes(x.getDay()))x.setDate(x.getDate()+1);return x.toLocaleDateString('sv-SE')};
const dataPagto=t=>util(t.vencimento>hoje()?t.vencimento:hoje());

// ─── Remessa ───
function elegiveis(){return P().filter(t=>aberto(t)&&t.aprovacao!=='pendente'&&saldo(t)>0.004&&(t.vencimento<=ui.ate)&&(ui.vencidos||t.vencimento>=hoje())).map(t=>({t,c:classificar(t)})).sort((a,b)=>a.t.vencimento.localeCompare(b.t.vencimento))}
function enviadoEm(id){for(const r of [...cfg().remessas].reverse())if((r.ids||[]).includes(id))return r;return null}
function gerarRemessa(itens,conta){const f=fiscal(),cnpj=String(f.cnpj||'').replace(/\D/g,'');if(cnpj.length!==14)throw new Error('CNPJ da empresa não cadastrado (Parâmetros fiscais).');
 const ag=num(conta.agencia,5),cc=String(conta.conta||'').replace(/\D/g,''),numConta=num(cc.slice(0,-1),12),dac=cc.slice(-1);if(!cc||cc.length<2)throw new Error('Conta Itaú sem número/DAC (ex.: 97520-5).');
 const nome=f.razao||db.workspace?.name||'COMPRA STORE',agora=new Date(),hms=agora.toTimeString().slice(0,8).replace(/:/g,'');
 const end=f.endereco||{},L=[];
 L.push(reg(['341','0000','0',br(6),'080','2',num(cnpj,14),br(20),ag,' ',numConta,' ',num(dac,1),txt(nome,30),txt('BANCO ITAU SA',30),br(10),'1',dt(hoje()),hms,zr(9),zr(5),br(69)]));
 const grupos=[['J','30'],['J','31'],['O','13'],['O','91']].map(([s,fm])=>itens.filter(x=>x.c.seg===s&&x.c.forma===fm)).filter(g=>g.length);let lote=0,total=0;
 for(const g of grupos){lote++;const L4=String(lote).padStart(4,'0'),{seg,forma,tipo}=g[0].c;let seq=0,soma=0;
  L.push(reg(['341',L4,'1','C',tipo,forma,'030',' ','2',num(cnpj,14),br(20),ag,' ',numConta,' ',num(dac,1),txt(nome,30),txt(cfg().finalidade,30),br(10),txt(end.logradouro,30),num(end.numero,5),txt(end.complemento,15),txt(end.municipio||f.municipio,20),num(end.cep,8),txt(end.uf||f.uf,2),br(8),br(10)]));
  for(const {t,c,data} of g){const pagar=saldo(t);soma+=pagar;const sn=seuNumero(t.id);
   if(seg==='J'){const vt=c.valorCodigo>0?c.valorCodigo:pagar,desc=Math.max(0,round(vt-pagar)),acr=Math.max(0,round(pagar-vt));
    L.push(reg(['341',L4,'3',String(++seq).padStart(5,'0'),'J','000',c.barras,txt(t.fornecedor||t.descricao,30),dt(t.vencimento),val(vt,15),val(desc,15),val(acr,15),dt(data),val(pagar,15),zr(15),txt(sn,20),br(13),br(15),br(10)]));
    const doc=String(t.fornecedorDoc||'').replace(/\D/g,''),tpc=doc.length===11?'1':doc.length===14?'2':'0';
    L.push(reg(['341',L4,'3',String(++seq).padStart(5,'0'),'J','000','52','2',num(cnpj,15),txt(nome,40),tpc,num(doc,15),txt(t.fornecedor||'',40),'0',zr(15),br(40),br(53)]))}
   else L.push(reg(['341',L4,'3',String(++seq).padStart(5,'0'),'O','000',txt(c.barras,48),txt(t.fornecedor||t.descricao,30),dt(t.vencimento),'REA',zr(15),val(pagar,15),dt(data),zr(15),br(3),br(9),br(3),txt(sn,20),br(21),br(15),br(10)]))}
  soma=round(soma);total+=soma;
  L.push(reg(seg==='J'?['341',L4,'5',br(9),num(seq+2,6),val(soma,18),zr(18),br(171),br(10)]:['341',L4,'5',br(9),num(seq+2,6),val(soma,18),zr(15),br(174),br(10)]))}
 L.push(reg(['341','9999','9',br(9),num(lote,6),num(L.length+1,6),br(211)]));
 return {conteudo:L.join('\r\n')+'\r\n',lotes:lote,registros:L.length,total:round(total)}}

// ─── Retorno ───
const OCORR={'00':'Pagamento efetuado','AE':'Data de pagamento alterada','AG':'Número do lote inválido','AH':'Sequencial do registro inválido','AI':'Demonstrativo de pagamento não contratado','AJ':'Tipo de movimento inválido','AL':'Banco do favorecido inválido','AM':'Agência do favorecido inválida','AN':'Conta do favorecido inválida','AO':'Nome do favorecido inválido','AP':'Data de pagamento inválida','AQ':'Mais de 999.999 registros','AR':'Valor inválido','BC':'Nosso número inválido','BD':'Pagamento agendado','BE':'Agendado com forma alterada para OP','BI':'CNPJ/CPF do favorecido (J-52) inválido','BL':'Valor da parcela inválido','CD':'CNPJ/CPF divergente do cadastrado','CE':'Pagamento cancelado','CF':'Valor do documento inválido','CG':'Valor do abatimento inválido','CH':'Valor do desconto inválido','CI':'CNPJ/CPF/inscrição estadual inválido','CJ':'Valor da multa inválido','CK':'Tipo de inscrição inválido','CN':'Conta não cadastrada','CP':'Confirmação de OP cumprida','CQ':'Soma das faturas difere do pagamento','CS':'Vencimento da fatura inválido','DV':'DOC/TED devolvido pelo banco favorecido','EM':'Confirmação de OP emitida','EX':'OP não sacada pelo favorecido','FC':'Pago via financiamento Compror','FD':'Pago via financiamento Descompror','HA':'Erro no lote','HM':'Erro no header do arquivo','IB':'Valor do documento inválido','IC':'Valor do abatimento inválido','ID':'Valor do desconto inválido','IE':'Valor da mora inválido','IF':'Valor da multa inválido','IG':'Valor da dedução inválido','IH':'Valor do acréscimo inválido','II':'Vencimento inválido','IJ':'Competência/período inválido','IK':'Tributo não liquidável via SISPAG ou não conveniado','IL':'Código de pagamento/receita inválido','IM':'Tipo x forma não compatível','IN':'Banco/agência não cadastrados','IO':'DAC/valor/competência inválido','IP':'DAC do código de barras inválido','IQ':'Dívida ativa ou etiqueta inválida','IR':'Pagamento alterado','IS':'Concessionária não conveniada com o Itaú','IT':'Valor do tributo inválido','IU':'Receita bruta acumulada inválida','IV':'Documento de origem inválido','IX':'Código do produto inválido','LA':'Data de pagamento do lote alterada','LC':'Lote cancelado','NA':'Cancelado por falta de autorização','NB':'Identificação do tributo inválida','NC':'Exercício inválido','NE':'UF inválida','NF':'Município inválido','NH':'Opção/parcela inválida','NI':'Tributo já pago ou vencido','NR':'Operação não realizada','RJ':'Registro rejeitado','SS':'Cancelado por saldo insuficiente/limite diário','TA':'Lote não aceito (totais com diferença)','TI':'Titularidade inválida'};
const FORMAS={'01':'Crédito em conta Itaú','03':'DOC','05':'Poupança Itaú','06':'Conta Itaú mesma titularidade','13':'Concessionárias','16':'DARF','17':'GPS','18':'DARF Simples','19':'Tributos municipais','22':'GARE SP','25':'IPVA','30':'Boletos Itaú','31':'Boletos outros bancos','35':'FGTS','41':'TED outro titular','43':'TED mesmo titular','45':'PIX transferência','47':'PIX QR Code','91':'GNRE e tributos'};
const codigos=s=>(String(s||'').trim().match(/.{1,2}/g)||[]).filter(c=>c.trim());
const situacaoRet=cs=>cs.includes('00')?'pago':cs.some(c=>['BD','BE','AE','LA','IR'].includes(c))&&!cs.some(c=>!['BD','BE','AE','LA','IR'].includes(c))?'agendado':cs.includes('CE')?'cancelado':cs.length?'rejeitado':'sem ocorrência';
function lerRetorno(conteudo){const linhas=conteudo.split(/\r?\n/).map(l=>l.replace(/\r$/,'')).filter(l=>l.length>=240);
 if(!linhas.length)throw new Error('Arquivo sem registros de 240 posições. É mesmo o retorno CNAB 240 do SISPAG?');
 const h=linhas[0];if(h[7]!=='0')throw new Error('A primeira linha não é um header de arquivo.');
 if(h.slice(0,3)!=='341')throw new Error(`Arquivo do banco ${h.slice(0,3)}; este leitor é do Itaú (341).`);
 const out={banco:'341',tipo:h[142]==='2'?'retorno':h[142]==='1'?'remessa':'?',gerado:lerData(h.slice(143,151)),cnpj:h.slice(18,32),agencia:h.slice(52,57),conta:h.slice(58,70).replace(/^0+/,'')+'-'+h[71],itens:[],lotes:[]};
 let lote=null;
 for(const l of linhas){const tr=l[7];
  if(tr==='1'){lote={n:l.slice(3,7),forma:l.slice(11,13),ocorr:codigos(l.slice(230,240))};out.lotes.push(lote);continue}
  if(tr!=='3')continue;const s=l[13];let it=null;
  if(s==='J'){if(l.slice(17,19)==='52'&&!l.slice(187,240).trim()&&!/\d/.test(l.slice(215,230)))continue;
   it={seg:'J',codigo:l.slice(17,61),nome:l.slice(61,91).trim(),venc:lerData(l.slice(91,99)),valorDoc:lerValor(l.slice(99,114)),data:lerData(l.slice(144,152)),valor:lerValor(l.slice(152,167)),seu:l.slice(182,202).trim(),nosso:l.slice(215,230).trim(),ocorr:codigos(l.slice(230,240))}}
  else if(s==='O')it={seg:'O',codigo:l.slice(17,65).trim(),nome:l.slice(65,95).trim(),venc:lerData(l.slice(95,103)),valorDoc:lerValor(l.slice(121,136)),data:lerData(l.slice(136,144)),valor:lerValor(l.slice(144,159))||lerValor(l.slice(121,136)),seu:l.slice(174,194).trim(),nosso:l.slice(215,230).trim(),ocorr:codigos(l.slice(230,240))};
  else if(s==='A')it={seg:'A',codigo:'',nome:l.slice(43,73).trim(),venc:lerData(l.slice(93,101)),valorDoc:lerValor(l.slice(119,134)),data:lerData(l.slice(154,162))||lerData(l.slice(93,101)),valor:lerValor(l.slice(162,177))||lerValor(l.slice(119,134)),seu:l.slice(73,93).trim(),nosso:l.slice(134,149).trim(),ocorr:codigos(l.slice(230,240))};
  if(!it)continue;it.lote=lote?.n;it.forma=lote?.forma;if(!it.ocorr.length&&lote?.ocorr.length)it.ocorr=lote.ocorr;
  it.situacao=situacaoRet(it.ocorr);out.itens.push(it)}
 conciliar(out);return out}
// Casa cada pagamento com o título: seu número → código de barras → valor + vencimento (+ nome parecido).
function conciliar(r){const usados=new Set(),mapaSn=new Map(P().map(t=>[seuNumero(t.id),t]));
 const nomeOk=(a,b)=>{const n=s=>normalized(String(s||'')).replace(/[^a-z0-9 ]/g,'').split(' ').filter(w=>w.length>2);const A=n(a),B=new Set(n(b));return !A.length||A.some(w=>B.has(w))};
 for(const it of r.itens){let t=it.seu&&mapaSn.get(it.seu.toUpperCase()),como='seu número';
  if(!t&&it.codigo){const b=barras(it.codigo);if(b){t=P().find(x=>!usados.has(x.id)&&barras(linhaDe(x))===b);como='código de barras'}}
  if(!t){const c=P().filter(x=>!usados.has(x.id)&&aberto(x)&&Math.abs(saldo(x)-it.valor)<0.01&&(!it.venc||x.vencimento===it.venc)&&nomeOk(it.nome,x.fornecedor||x.descricao));if(c.length===1){t=c[0];como='valor e vencimento'}}
  if(t){usados.add(t.id);it.tid=t.id;it.como=como}
  it.baixavel=!!(t&&it.situacao==='pago'&&aberto(t)&&it.valor>0&&it.data)}}

function darBaixa(ids){const r=ui.ret;if(!r)return;const conta=contaSel(),nomeConta=conta?.nome||'Itaú';const feitos=[];
 for(const it of r.itens.filter(i=>ids.includes(i.tid)&&i.baixavel)){const t=P().find(x=>x.id===it.tid);if(!t||!aberto(t))continue;
  const s=saldo(t),dif=round(it.valor-s);if(dif>0)t.juros=round((t.juros||0)+dif);else if(dif<0&&Math.abs(dif)<=Math.max(1,s*0.5))t.desconto=round((t.desconto||0)-dif);
  t.valorPago=round((t.valorPago||0)+it.valor);t.pagoEm=it.data;t.conta=nomeConta;t.status=saldo(t)<0.01?'pago':'parcial';it.baixado=true;it.baixavel=false;feitos.push([t,it])}
 if(!feitos.length)return toast('Nada para baixar.');
 const tot=round(feitos.reduce((a,[,i])=>a+i.valor,0));
 audit('Baixa pelo retorno do banco (SISPAG)',feitos.slice(0,8).map(([t,i])=>`${t.fornecedor||t.descricao} ${money(i.valor)} em ${dBR(i.data)}`).join(' · ')+(feitos.length>8?` · +${feitos.length-8}`:'')+` · ${nomeConta} · arquivo ${r.arquivo}`);
 const c=cfg();salvarCfg({retornos:[...c.retornos,{em:new Date().toISOString(),arquivo:r.arquivo,itens:r.itens.length,baixados:feitos.length,total:tot}].slice(-60)});
 ui.retSel.clear();render();toast(`${feitos.length} título(s) baixado(s) · ${money(tot)}`)}

// ─── Telas ───
function cabecalho(){const l=contasItau(),c=contaSel(),f=fiscal();
 const avisos=[];if(!l.length)avisos.push('Cadastre a conta do Itaú (banco 341) em Contas bancárias.');if(String(f.cnpj||'').replace(/\D/g,'').length!==14)avisos.push('Informe o CNPJ da empresa em Parâmetros fiscais.');
 return `<div class="toolbar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:12px"><div><label for="spConta">Conta de débito</label><select id="spConta" data-sp-cfg="conta">${l.map(a=>`<option value="${esc(a.id)}" ${a.id===c?.id?'selected':''}>${esc(a.nome)} · ag ${esc(a.agencia||'—')} · cc ${esc(a.conta||'—')}</option>`).join('')||'<option>Nenhuma conta Itaú</option>'}</select></div>
 <div style="flex:1;min-width:220px"><label for="spFin">Finalidade do lote (aparece no extrato)</label><input id="spFin" data-sp-cfg="finalidade" maxlength="30" value="${esc(cfg().finalidade)}"></div></div>
 ${avisos.length?`<div class="notice warn" style="margin-bottom:12px">${avisos.map(esc).join('<br>')}</div>`:''}`}
function remessaView(){const L=elegiveis();if(!ui.selIni){L.filter(x=>x.c&&!enviadoEm(x.t.id)).forEach(x=>ui.sel.add(x.t.id));ui.selIni=true}
 const ok=L.filter(x=>x.c),sem=L.filter(x=>!x.c),sel=ok.filter(x=>ui.sel.has(x.t.id)),tot=round(sel.reduce((a,x)=>a+saldo(x.t),0));
 const semDoc=sel.filter(x=>x.c.seg==='J'&&![11,14].includes(String(x.t.fornecedorDoc||'').replace(/\D/g,'').length)).length;
 return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:10px"><div><label for="spAte">Vencimento até</label><input id="spAte" type="date" data-sp="ate" value="${ui.ate}"></div><label class="check-l" style="margin-bottom:8px"><input type="checkbox" class="check" data-sp="vencidos" ${ui.vencidos?'checked':''}> Incluir vencidos</label>
 <div style="flex:1"></div><button class="primary" data-sp-acao="gerar" ${sel.length?'':'disabled'}>${icon('download')} Gerar remessa · ${sel.length} título(s) · ${money(tot)}</button></div>
 ${semDoc?`<div class="notice warn" style="margin-bottom:10px">${semDoc} boleto(s) sem CNPJ/CPF do fornecedor: o registro J-52 vai sem o documento do beneficiário e o Itaú pode rejeitar (ocorrência BI). Complete no título.</div>`:''}
 <div class="tablebox" style="overflow-x:auto"><table><thead><tr><th style="width:28px"><input type="checkbox" class="check" data-sp-todos ${sel.length&&sel.length===ok.length?'checked':''} aria-label="Selecionar todos"></th><th>Vencimento</th><th>Pagar em</th><th>Fornecedor</th><th>Tipo</th><th>Situação</th><th class="num">Valor</th></tr></thead><tbody>
 ${ok.map(({t,c})=>{const e=enviadoEm(t.id);return `<tr><td><input type="checkbox" class="check" data-sp-sel="${esc(t.id)}" ${ui.sel.has(t.id)?'checked':''}></td><td>${dBR(t.vencimento)}${t.vencimento<hoje()?' <span class="badge bad">vencido</span>':''}</td><td>${dBR(dataPagto(t))}</td><td><strong>${esc(t.fornecedor||t.descricao||'—')}</strong><br><span class="caption">${esc(t.categoria||'')}${t.documento?' · '+esc(t.documento):''}</span></td><td><span class="badge">${esc(c.rotulo)}</span><br><span class="caption">segmento ${c.seg} · forma ${c.forma}</span></td><td>${e?`<span class="badge info">em remessa de ${dBR(e.em.slice(0,10))}</span>`:'<span class="caption">—</span>'}</td><td class="num">${money(saldo(t))}</td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Nenhum título com código de barras nesse período.</td></tr>'}</tbody></table></div>
 ${sem.length?`<details style="margin-top:12px"><summary>${sem.length} título(s) sem código de barras no período (${money(sem.reduce((a,x)=>a+saldo(x.t),0))}) — pague por PIX/TED ou informe a linha digitável</summary><ul class="caption">${sem.slice(0,40).map(({t})=>`<li>${dBR(t.vencimento)} · ${esc(t.fornecedor||t.descricao||'—')} · ${money(saldo(t))}</li>`).join('')}</ul></details>`:''}
 <p class="caption" style="margin-top:12px">Como usar: gere o arquivo, envie no Itaú (Internet Banking Empresas › SISPAG › Transmissão de arquivos) e autorize os pagamentos lá. Depois que o banco processar, baixe o arquivo de retorno e importe na aba <strong>Retorno</strong> para dar baixa. Datas em fim de semana vão para o dia útil seguinte; feriados o banco ajusta (ocorrência AE).</p>`}
function retornoView(){const r=ui.ret;
 const topo=`<div class="dropzone" style="padding:18px;border:1px dashed var(--line,#8884);border-radius:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">${icon('upload')}<div style="flex:1;min-width:200px"><strong>Arquivo de retorno do SISPAG</strong><br><span class="caption">O .RET que o Itaú devolve depois de processar a remessa. Nada é baixado antes da sua confirmação.</span></div><button class="primary" data-sp-acao="escolher">${icon('file')} Escolher arquivo</button><input type="file" data-sp-arq hidden></div>`;
 if(!r)return topo+(cfg().retornos.length?'':'<div class="empty">Nenhum retorno importado ainda.</div>');
 const cont=s=>r.itens.filter(i=>i.situacao===s).length,bx=r.itens.filter(i=>i.baixavel),sel=bx.filter(i=>ui.retSel.has(i.tid)),tot=round(sel.reduce((a,i)=>a+i.valor,0));
 return topo+`<div class="notice" style="margin-bottom:10px"><strong>${esc(r.arquivo)}</strong> · ${r.tipo==='retorno'?'retorno':'<span class="red">isto parece uma remessa, não um retorno</span>'} gerado em ${dBR(r.gerado)} · ag ${esc(r.agencia.replace(/^0+/,''))} cc ${esc(r.conta)} · ${r.itens.length} pagamento(s): ${cont('pago')} pago(s), ${cont('agendado')} agendado(s), ${cont('rejeitado')} rejeitado(s)${cont('cancelado')?`, ${cont('cancelado')} cancelado(s)`:''}.</div>
 <div style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:10px"><button data-sp-acao="limpar">Fechar arquivo</button><button class="primary" data-sp-acao="baixar" ${sel.length?'':'disabled'}>${icon('check')} Dar baixa em ${sel.length} título(s) · ${money(tot)}</button></div>
 <div class="tablebox" style="overflow-x:auto"><table><thead><tr><th style="width:28px"></th><th>Pago em</th><th>Favorecido no arquivo</th><th>Título no Jarvis</th><th>Ocorrência</th><th class="num">Valor</th></tr></thead><tbody>
 ${r.itens.map(i=>{const t=i.tid&&P().find(x=>x.id===i.tid);const tom={pago:'ok',agendado:'info',rejeitado:'bad',cancelado:'warn'}[i.situacao]||'';
  return `<tr><td>${i.baixavel?`<input type="checkbox" class="check" data-sp-rsel="${esc(i.tid)}" ${ui.retSel.has(i.tid)?'checked':''}>`:''}</td><td>${i.data?dBR(i.data):'—'}<br><span class="caption">${esc(FORMAS[i.forma]||('forma '+i.forma))}</span></td><td>${esc(i.nome||'—')}<br><span class="caption">venc. ${dBR(i.venc)}${i.nosso?' · autenticação '+esc(i.nosso):''}</span></td>
  <td>${t?`<strong>${esc(t.fornecedor||t.descricao||'—')}</strong><br><span class="caption">${dBR(t.vencimento)} · ${money(t.valor)} · por ${esc(i.como)} · ${i.baixado?'<span class="green">baixado agora</span>':aberto(t)?'em aberto':'já estava '+esc(t.status)}</span>`:'<span class="caption red">não encontrado no contas a pagar</span>'}</td>
  <td><span class="badge ${tom}">${esc(i.situacao)}</span><br><span class="caption">${i.ocorr.map(c=>`${esc(c)} ${esc(OCORR[c]||'')}`).join(' · ')||'—'}</span></td><td class="num">${money(i.valor)}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Arquivo sem pagamentos.</td></tr>'}</tbody></table></div>`}
function historicoView(){const c=cfg(),rm=[...c.remessas].reverse(),rt=[...c.retornos].reverse();
 return `<div class="grid two"><section class="card"><h3>Remessas geradas</h3>${rm.length?`<table><thead><tr><th>Quando</th><th>Arquivo</th><th class="num">Títulos</th><th class="num">Total</th></tr></thead><tbody>${rm.map(r=>`<tr><td>${new Date(r.em).toLocaleString('pt-BR')}</td><td>${esc(r.arquivo)}</td><td class="num">${(r.ids||[]).length}</td><td class="num">${money(r.total)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhuma remessa.</div>'}</section>
 <section class="card"><h3>Retornos importados</h3>${rt.length?`<table><thead><tr><th>Quando</th><th>Arquivo</th><th class="num">Baixados</th><th class="num">Total</th></tr></thead><tbody>${rt.map(r=>`<tr><td>${new Date(r.em).toLocaleString('pt-BR')}</td><td>${esc(r.arquivo)}</td><td class="num">${r.baixados}/${r.itens}</td><td class="num">${money(r.total)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhum retorno.</div>'}</section></div>`}
function view(){const A=[['remessa','Remessa (pagar)'],['retorno','Retorno (baixar)'],['historico','Histórico']];
 return cabecalho()+`<div class="segtabs">${A.map(([id,t])=>`<button class="${ui.aba===id?'active':''}" data-sp-aba="${id}">${t}</button>`).join('')}</div>`+({remessa:remessaView,retorno:retornoView,historico:historicoView}[ui.aba]||remessaView)()}

function confirmarRemessa(){const L=elegiveis().filter(x=>x.c&&ui.sel.has(x.t.id)),c=contaSel();if(!c)return toast('Cadastre a conta do Itaú primeiro.');
 const tot=round(L.reduce((a,x)=>a+saldo(x.t),0)),porForma={};for(const x of L){const k=x.c.rotulo;porForma[k]=(porForma[k]||0)+1}
 modal('Gerar remessa SISPAG',`<p>${L.length} pagamento(s) · <strong>${money(tot)}</strong> · débito em ${esc(c.nome)}.</p><p class="caption">${Object.entries(porForma).map(([k,n])=>`${n} ${esc(k)}`).join(' · ')}</p>
 <div class="grid two"><div><label for="spModo">Data de pagamento</label><select id="spModo"><option value="venc">No vencimento de cada título (dia útil)</option><option value="unica">Uma data para todos</option></select></div><div><label for="spData">Data única</label><input id="spData" type="date" value="${util(hoje())}"></div></div>
 <p class="caption" style="margin-top:10px">O arquivo só agenda os pagamentos depois de transmitido e autorizado no Itaú. Nenhum título é baixado agora; a baixa vem com o retorno.</p>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-sp-acao="baixarrem">${icon('download')} Baixar arquivo .REM</button></div>`)}
function emitirRemessa(){const L=elegiveis().filter(x=>x.c&&ui.sel.has(x.t.id)),c=contaSel(),modo=$('#spModo')?.value,unica=$('#spData')?.value;
 if(modo==='unica'&&(!unica||unica<hoje()))return toast('A data única precisa ser hoje ou depois.');
 const itens=L.map(x=>({...x,data:modo==='unica'?util(unica):dataPagto(x.t)}));
 let r;try{r=gerarRemessa(itens,c)}catch(e){return toast(e.message)}
 const agora=new Date(),nome=`SISPAG_${agora.toLocaleDateString('sv-SE').replace(/-/g,'')}_${agora.toTimeString().slice(0,5).replace(':','')}.REM`;
 download(nome,r.conteudo,'text/plain;charset=us-ascii');
 const cf=cfg();salvarCfg({remessas:[...cf.remessas,{em:agora.toISOString(),arquivo:nome,ids:itens.map(x=>x.t.id),total:r.total}].slice(-60)});
 audit('Remessa SISPAG gerada',`${nome} · ${itens.length} pagamento(s) · ${money(r.total)} · ${r.lotes} lote(s)`);closeModal();render();toast(`Remessa gerada: ${itens.length} pagamento(s) em ${r.lotes} lote(s).`)}

document.addEventListener('click',e=>{const b=e.target.closest('[data-sp-aba],[data-sp-acao]');if(!b)return;const d=b.dataset;
 if(d.spAba){ui.aba=d.spAba;render();return}
 if(d.spAcao==='gerar')return confirmarRemessa();if(d.spAcao==='baixarrem')return emitirRemessa();
 if(d.spAcao==='escolher'){$('[data-sp-arq]')?.click();return}
 if(d.spAcao==='limpar'){ui.ret=null;ui.retSel.clear();render();return}
 if(d.spAcao==='baixar'){const ids=[...ui.retSel];const r=ui.ret,sel=r.itens.filter(i=>i.baixavel&&ids.includes(i.tid)),tot=round(sel.reduce((a,i)=>a+i.valor,0));
  modal('Confirmar baixa',`<p>Baixar <strong>${sel.length}</strong> título(s), total <strong>${money(tot)}</strong>, com a data e o valor que o Itaú informou no retorno?</p><p class="caption">Diferenças entre o valor pago e o saldo do título entram como juros (pago a mais) ou desconto (pago a menos). Fica registrado na auditoria.</p><div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-sp-acao="baixarok">${icon('check')} Confirmar baixa</button></div>`);return}
 if(d.spAcao==='baixarok'){closeModal();darBaixa([...ui.retSel]);return}});
document.addEventListener('change',async e=>{const x=e.target;
 if(x.matches('[data-sp-sel]')){x.checked?ui.sel.add(x.dataset.spSel):ui.sel.delete(x.dataset.spSel);render();return}
 if(x.matches('[data-sp-todos]')){const ok=elegiveis().filter(y=>y.c);if(x.checked)ok.forEach(y=>ui.sel.add(y.t.id));else ui.sel.clear();render();return}
 if(x.matches('[data-sp-rsel]')){x.checked?ui.retSel.add(x.dataset.spRsel):ui.retSel.delete(x.dataset.spRsel);render();return}
 if(x.matches('[data-sp="ate"]')){if(x.value){ui.ate=x.value;render()}return}
 if(x.matches('[data-sp="vencidos"]')){ui.vencidos=x.checked;render();return}
 if(x.matches('[data-sp-cfg]')){salvarCfg({[x.dataset.spCfg]:x.value});render();return}
 if(x.matches('[data-sp-arq]')){const f=x.files?.[0];if(!f)return;try{const buf=await f.arrayBuffer(),conteudo=new TextDecoder('latin1').decode(buf);const r=lerRetorno(conteudo);r.arquivo=f.name;ui.ret=r;ui.retSel=new Set(r.itens.filter(i=>i.baixavel).map(i=>i.tid));ui.aba='retorno';render();toast(`${r.itens.length} pagamento(s) lidos · ${r.itens.filter(i=>i.baixavel).length} prontos para baixa.`)}catch(err){toast(err.message)}}});
addPage('sispag','bank','Arquivos do banco',view,'Remessa e retorno do Itaú SISPAG: gere o arquivo com os boletos, contas e GNREs a pagar e importe o retorno para baixar o que o banco pagou.','',()=>{});
window.Sispag={gerarRemessa,lerRetorno,barras,seuNumero,classificar};
})();
