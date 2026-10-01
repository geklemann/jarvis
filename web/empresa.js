'use strict';
// Empresa nova no Jarvis: "Primeiros passos" (lista que se marca sozinha conforme a empresa conecta o Bling e os
// marketplaces, sincroniza, cadastra custos, vê o diagnóstico e convida a equipe), "Plano e assinatura" (escolha do
// plano com o preço na hora e pagamento pelo Asaas) e um aviso discreto dos dias de teste. Empresas "internas"
// (como a Compra Store) não veem teste nem cobrança.
(()=>{
const st={a:null,carregada:false,integ:null,membros:null};
const FAIXAS=[[1000,297,690],[4000,497,849],[10000,797,1090]];
const MOD=[['fiscal','Fiscal','NF-e própria com ICMS, DIFAL e FCP, devoluções, GNRE',149],['contab','Contabilidade online','lançamento automático, balancete, fechamento, DRE e acesso do contador',249],['folha','Folha e ponto','holerite, encargos, férias, ponto pelo celular',129],['crm','CRM e B2B','clientes 360, réguas, venda direta e comissões',99]];
const plano={plano:'pacote',faixa:4000,modulos:['fiscal','contab'],folha25:false,ciclo:'mensal'};
const R=v=>typeof money==='function'?money(v):String(v);
const diasTeste=a=>a?.teste_ate?Math.ceil((new Date(a.teste_ate+'T23:59:59')-new Date())/864e5):null;

async function carregar(forca){if(!window.Cloud?.ws||(!forca&&st.carregada))return;st.carregada=true;
 try{const c=Cloud.client,ws=Cloud.ws;const [a,i]=await Promise.all([c.from('assinaturas').select('*').eq('workspace_id',ws).maybeSingle(),c.from('integrations').select('provider,status').eq('workspace_id',ws)]);
  st.a=a.data||null;st.integ=i.data||[];try{const t=await c.rpc('list_team',{ws});st.membros=(t.data||[]).length}catch{}}catch{}
 if(['comecar','plano','resumo','central'].includes(page))render()}

// ── Preço na tela (o servidor recalcula; é só para a pessoa ver antes de assinar) ──
function preco(){const f=FAIXAS.find(x=>x[0]===plano.faixa)||FAIXAS[1];let mensal,itens=[];
 if(plano.plano==='pacote'){mensal=f[2];itens=[[`Pacote completo, até ${f[0].toLocaleString('pt-BR')} pedidos por mês`,f[2]]]}
 else{itens=[[`Base Vendas e Lucro, até ${f[0].toLocaleString('pt-BR')} pedidos por mês`,f[1]],...MOD.filter(m=>plano.modulos.includes(m[0])).map(m=>[`Módulo ${m[1]}${m[0]==='folha'&&plano.folha25?' (até 25 pessoas)':''}`,m[0]==='folha'&&plano.folha25?229:m[3]])];mensal=itens.reduce((s,i)=>s+i[1],0)}
 return {mensal,itens,cobrar:plano.ciclo==='anual'?mensal*10:mensal}}

// ── Primeiros passos ──
function passos(){const con=p=>(st.integ||[]).some(i=>i.provider===p&&i.status==='conectado'),marcado=k=>{try{return localStorage.getItem('jarvis_passo_'+k)==='1'}catch{return false}};
 const custos=(window.Estoque?.lista?.()||[]).some(p=>Number(p.custo)>0);
 return [
  ['bling','Conectar o Bling','Pedidos, notas e produtos entram sozinhos (só leitura no diagnóstico).','integracoes',con('bling')],
  ['mkt','Conectar os marketplaces','Mercado Livre, Shopee e Magalu: tarifas, repasses e atendimento de cada venda.','integracoes',con('mercadolivre')||con('shopee')||con('magalu')],
  ['sync','Primeira sincronização','Os últimos meses de pedidos chegam em alguns minutos depois das conexões.','dashboard',(db.orders||[]).length>0],
  ['custo','Custos dos produtos','Sem o custo, a margem fica estimada. Importe a planilha ou ajuste item a item.','cadprodutos',custos],
  ['diag','Ver o diagnóstico gratuito','Margem por canal, tarifa cobrada a mais e repasse que não chegou, numa página.','diagnostico',marcado('diag')],
  ['equipe','Convidar a equipe','Cada pessoa com o seu login e só as telas do seu trabalho.','equipe',(st.membros||1)>1],
  ['plano','Escolher o plano','Continue depois do teste: o preço sai na hora pela quantidade de pedidos.','plano',st.a?.status==='ativa'||st.a?.status==='interno'],
 ]}
function viewComecar(){if(!st.carregada)carregar();const l=passos(),feitos=l.filter(p=>p[4]).length,d=diasTeste(st.a);
 return `<div class="notice"><strong>Bem-vindo ao Jarvis.</strong> Siga os passos abaixo: cada um se marca sozinho quando fica pronto. ${st.a?.status==='teste'&&d!=null?`Teste grátis: <b>${Math.max(0,d)} dia(s)</b> restante(s).`:''}</div>
 <div class="tablebox" style="margin-top:16px"><div class="tabletop"><div><h2>Primeiros passos</h2><p class="caption">${feitos} de ${l.length} concluído(s)</p></div></div>
  <div style="display:grid;gap:2px">${l.map(([k,t,s,nav,ok],i)=>`<div class="listline" style="align-items:center"><div class="row" style="gap:12px;align-items:flex-start"><span class="badge ${ok?'ok':'info'}" style="min-width:26px;justify-content:center">${ok?'✓':i+1}</span><div><strong>${t}</strong><br><span class="caption">${s}</span></div></div><button class="small ${ok?'':'primary'}" data-nav="${nav}" data-passo="${k}">${ok?'Ver':'Fazer'}</button></div>`).join('')}</div></div>`}

// ── Plano e assinatura ──
function viewPlano(){if(!st.carregada)carregar();const a=st.a,p=preco(),d=diasTeste(a),dono=window.Cloud?.role==='owner';
 const situ=!a?'':a.status==='interno'?'<span class="badge ok">Uso interno · sem cobrança</span>':a.status==='ativa'?'<span class="badge ok">Assinatura ativa</span>':a.status==='atrasada'?'<span class="badge bad">Pagamento em atraso</span>':a.status==='cancelada'?'<span class="badge bad">Assinatura cancelada</span>':`<span class="badge warn">Teste grátis · ${Math.max(0,d??0)} dia(s)</span>`;
 if(a?.status==='interno')return `<div class="notice">${situ} Esta empresa usa o Jarvis sem cobrança.</div>`;
 return `<div class="notice">${situ} ${a?.plano?`Plano atual: <b>${a.plano==='pacote'?'Pacote completo':'Base'}</b>, até ${Number(a.faixa).toLocaleString('pt-BR')} pedidos, ${R(a.valor_mensal)}/mês.`:'Escolha o plano para continuar depois do teste.'} ${a?.link_pagamento&&a.status!=='ativa'?`<a href="${esc(a.link_pagamento)}" target="_blank" rel="noopener">Abrir a fatura</a>`:''}</div>
 <div class="grid two" style="align-items:start;margin-top:16px">
  <form class="formcard" id="plForm" style="display:grid;gap:12px"><h2 style="margin:0">Monte o plano</h2>
   <div class="segtabs" role="radiogroup" aria-label="Plano"><button type="button" class="${plano.plano==='pacote'?'active':''}" data-pl-plano="pacote">Pacote completo</button><button type="button" class="${plano.plano==='base'?'active':''}" data-pl-plano="base">Base + módulos</button></div>
   <label>Pedidos por mês<select data-pl="faixa">${FAIXAS.map(f=>`<option value="${f[0]}" ${plano.faixa===f[0]?'selected':''}>até ${f[0].toLocaleString('pt-BR')}</option>`).join('')}</select></label>
   ${plano.plano==='base'?`<fieldset style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:6px"><legend class="caption" style="padding:0 4px">Módulos</legend>${MOD.map(m=>`<label class="row" style="gap:8px;font-weight:400"><input type="checkbox" data-pl-mod="${m[0]}" ${plano.modulos.includes(m[0])?'checked':''} style="width:auto"> <span><b>${m[1]}</b> · ${R(m[3])}<br><span class="caption">${m[2]}</span></span></label>`).join('')}
    ${plano.modulos.includes('folha')?`<label class="row" style="gap:8px;font-weight:400"><input type="checkbox" data-pl="folha25" ${plano.folha25?'checked':''} style="width:auto"> Folha e ponto para até 25 pessoas (R$ 229)</label>`:''}</fieldset>`:'<p class="caption" style="margin:0">Base + Fiscal + Contabilidade + Folha e ponto (até 10 pessoas) + CRM, com cerca de 25% de desconto sobre a soma.</p>'}
   <label>Pagamento<select data-pl="ciclo"><option value="mensal" ${plano.ciclo==='mensal'?'selected':''}>Mensal</option><option value="anual" ${plano.ciclo==='anual'?'selected':''}>Anual (paga 10 meses e usa 12)</option></select></label>
   ${dono?`<div class="row wrap" style="gap:10px"><label style="flex:1;min-width:180px">CNPJ de quem paga<input name="cnpj" required inputmode="numeric" placeholder="00.000.000/0000-00"></label><label style="flex:1;min-width:180px">E-mail para a fatura<input name="email" type="email" value="${esc(window.Cloud?.session?.user?.email||'')}"></label></div>
   <button class="primary">Assinar · ${R(p.cobrar)}${plano.ciclo==='anual'?'/ano':'/mês'}</button><p class="caption" style="margin:0">A fatura sai pelo Asaas (boleto, Pix ou cartão). O primeiro vencimento é no fim do teste grátis.</p>`:'<div class="notice">Só o dono da empresa assina o plano.</div>'}
  </form>
  <div class="tablebox"><div class="tabletop"><h2>Resumo</h2></div><div class="tablewrap"><table><tbody>${p.itens.map(([t,v])=>`<tr><td>${esc(t)}</td><td class="num">${R(v)}</td></tr>`).join('')}<tr><td><b>Mensal</b></td><td class="num"><b>${R(p.mensal)}</b></td></tr>${plano.ciclo==='anual'?`<tr><td>Cobrança anual (10 × ${R(p.mensal)})</td><td class="num"><b>${R(p.cobrar)}</b></td></tr>`:''}</tbody></table></div>
   <p class="caption" style="padding:0 16px 14px">Usuários ilimitados. Implantação acompanhada: R$ 990 na base (+ R$ 490 por módulo), grátis no pacote anual. Cancelamento com 30 dias de aviso e exportação completa dos dados.</p></div>
 </div>`}

async function assinar(f){const fd=new FormData(f);const r=await Integrations.callFn('cobranca',{action:'checkout',...plano,cnpj:fd.get('cnpj'),email:fd.get('email')});
 if(r?.error)throw Error(r.error);await carregar(true);if(r.link){window.open(r.link,'_blank','noopener');toast('Fatura aberta numa nova aba.')}else toast('Assinatura criada.')}

document.addEventListener('click',e=>{const b=e.target.closest('[data-pl-plano],[data-passo]');if(!b)return;
 if(b.dataset.plPlano){e.preventDefault();plano.plano=b.dataset.plPlano;render();return}
 if(b.dataset.passo==='diag'){try{localStorage.setItem('jarvis_passo_diag','1')}catch{}}});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset.plMod){plano.modulos=t.checked?[...new Set([...plano.modulos,t.dataset.plMod])]:plano.modulos.filter(m=>m!==t.dataset.plMod);render()}
 else if(t.dataset.pl==='faixa'){plano.faixa=Number(t.value);render()}else if(t.dataset.pl==='ciclo'){plano.ciclo=t.value;render()}else if(t.dataset.pl==='folha25'){plano.folha25=t.checked;render()}});
document.addEventListener('submit',async e=>{if(e.target.id!=='plForm')return;e.preventDefault();const b=e.target.querySelector('button.primary');if(b)b.disabled=true;try{await assinar(e.target)}catch(x){toast(x.message||String(x))}finally{if(b)b.disabled=false}});

// Aviso discreto do teste (só em empresa em teste ou com pagamento em atraso), no Resumo da semana e na tela Hoje.
if(typeof render==='function'){const r0=render;render=function(){const r=r0.apply(this,arguments);try{aviso()}catch{}return r}}
function aviso(){if(!st.carregada){carregar();return}const a=st.a,v=document.getElementById('view');if(!v||!a||!['resumo','central'].includes(page))return;
 document.querySelector('.emp-aviso')?.remove();const d=diasTeste(a);
 const msg=a.status==='teste'?`Teste grátis: <b>${Math.max(0,d??0)} dia(s)</b> restante(s).`:a.status==='atrasada'?'<b>Pagamento da assinatura em atraso.</b>':'';if(!msg)return;
 v.insertAdjacentHTML('afterbegin',`<div class="notice emp-aviso" style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-bottom:12px"><span>${msg}</span><span class="row" style="gap:8px"><button class="small" data-nav="comecar">Primeiros passos</button><button class="small primary" data-nav="plano">Ver planos</button></span></div>`)}

// Item "Plano e assinatura" no menu do usuário (o menu é montado dentro de erp.js; empresas internas não veem).
new MutationObserver(()=>{const m=document.querySelector('#erpdrop .userhead');if(!m||!st.a||st.a.status==='interno')return;const box=m.parentElement;if(box.querySelector('[data-nav="plano"]'))return;
 const ref=box.querySelector('[data-erp-seg]'),html=`<button class="dropitem" data-nav="plano">${typeof icon==='function'?icon('tag').replace('class="icon"','class="icon" style="width:18px;height:18px"'):''}<span><strong>Plano e assinatura</strong><small>${st.a.status==='teste'?`Teste grátis · ${Math.max(0,diasTeste(st.a)??0)} dia(s)`:'Plano, fatura e pagamento'}</small></span></button>`;
 if(ref)ref.insertAdjacentHTML('beforebegin',html);else m.insertAdjacentHTML('afterend',html)}).observe(document.documentElement,{childList:true,subtree:true});
addPage('comecar','check','Primeiros passos',viewComecar,'O que fazer para o Jarvis mostrar a margem real da sua operação.','',()=>{});
addPage('plano','tag','Plano e assinatura',viewPlano,'Escolha o plano pela quantidade de pedidos e assine com boleto, Pix ou cartão.','',()=>{});
window.Empresa={carregar,preco};
})();
