'use strict';
// Modo nuvem (Supabase): login, carregamento do workspace e gravação incremental.
// Sem config.js preenchido, o Jarvis continua no modo local (dados neste navegador).
(()=>{
const cfg=window.CONCILIA_CONFIG||{};
const Cloud=window.Cloud={workspaces:[],enabled:!!(cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase),client:null,session:null,ws:null,wsName:'',role:'',state:'idle',error:'',localBackup:null};
document.body.classList.remove('booting');
if(!Cloud.enabled){Cloud.state='local';return}

const sb=Cloud.client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
// Dados que já estavam neste navegador (modo local) podem ser enviados para a nuvem depois do login.
if(db.orders.length||db.receipts.length)Cloud.localBackup=JSON.parse(JSON.stringify(db));

// ───────── Mapeamento entre o formato da tela e as tabelas ─────────
const n=v=>v==null?0:Number(v);
const maps={
 orders:{table:'orders',key:'id',
  toRow:o=>({id:o.id,platform:o.platform,date:o.date,gross:o.gross,fee:o.fee,nf:o.nf||null,due:o.due||null,transit:!!o.transit,note:o.note||'',source:o.source||'Importado',customer:o.customer||null,state:o.state||null,items:o.items||null,shipping:o.shipping??null,fee_source:o.feeSource||null,external:o.external||null}),
  fromRow:r=>({id:r.id,platform:r.platform,date:r.date,gross:n(r.gross),fee:n(r.fee),nf:r.nf||'',due:r.due||'',transit:!!r.transit,note:r.note||'',source:r.source,customer:r.customer||null,state:r.state||'',items:r.items||[],shipping:r.shipping==null?null:n(r.shipping),feeSource:r.fee_source||'',external:r.external||null})},
 receipts:{table:'receipts',key:'id',
  toRow:r=>({id:r.id,order_id:r.orderId||null,platform:r.platform,account:r.account,date:r.date,amount:r.amount,linked_order:r.linkedOrder||null,source:r.source||'Importado',kind:r.kind||'liberacao',description:r.description||null}),
  fromRow:r=>({id:r.id,orderId:r.order_id||'',platform:r.platform,account:r.account,date:r.date,amount:n(r.amount),linkedOrder:r.linked_order||null,source:r.source,kind:r.kind,description:r.description||''})},
 ledger:{table:'ledger',key:'id',
  toRow:l=>({id:l.id,kind:l.kind,due:l.due||null,paid_date:l.paidDate||null,amount:l.amount,status:l.status||null,category:l.category||null,contact:l.contact||null,description:l.description||null,source:l.source||'Importado'}),
  fromRow:r=>({id:r.id,kind:r.kind,due:r.due||'',paidDate:r.paid_date||'',amount:n(r.amount),status:r.status||'',category:r.category||'',contact:r.contact||'',description:r.description||'',source:r.source})},
 imports:{table:'imports',key:'id',
  toRow:i=>({id:i.id,file:i.file,type:i.type,count:i.count,format:i.format||null,time:i.time}),
  fromRow:r=>({id:r.id,file:r.file,type:r.type,count:r.count,format:r.format,time:r.time})},
 accLines:{table:'accounting_lines',key:'id',
  toRow:l=>({id:l.id,month:l.month,kind:l.kind,conta:l.conta,descricao:l.descricao||null,data:l.data||null,historico:l.historico||null,debito:l.debito||0,credito:l.credito||0,saldo_anterior:l.saldoAnterior??null,saldo:l.saldo??null}),
  fromRow:r=>({id:r.id,month:r.month,kind:r.kind,conta:r.conta,descricao:r.descricao||'',data:r.data||null,historico:r.historico||'',debito:n(r.debito),credito:n(r.credito),saldoAnterior:r.saldo_anterior==null?null:n(r.saldo_anterior),saldo:r.saldo==null?null:n(r.saldo)})},
 accDocs:{table:'accounting_docs',key:'id',
  toRow:d=>({id:d.id,month:d.month,tipo:d.tipo,nome:d.nome,path:d.path||null,size:d.size||null,time:d.time}),
  fromRow:r=>({id:r.id,month:r.month,tipo:r.tipo,nome:r.nome,path:r.path,size:r.size,time:r.time})},
 products:{table:'pricing_products',key:'id',
  toRow:p=>({id:p.id,nome:p.nome||null,categoria:p.categoria||null,custo:p.custo||0,embalagem:p.embalagem||0,peso:p.peso??null,precos:p.precos||{},extra:p.extra||{}}),
  fromRow:r=>({id:r.id,nome:r.nome||'',categoria:r.categoria||'',custo:n(r.custo),embalagem:n(r.embalagem),peso:r.peso==null?null:n(r.peso),precos:r.precos||{},extra:r.extra||{}})},
 scenarios:{table:'pricing_scenarios',key:'id',
  toRow:s=>({id:s.id,nome:s.nome,data:s.data,time:s.time}),
  fromRow:r=>({id:r.id,nome:r.nome,data:r.data,time:r.time})},
 payables:{table:'payables',key:'id',
  toRow:t=>({id:t.id,origem:t.origem||'manual',invoice_id:t.invoiceId||null,fornecedor:t.fornecedor||null,fornecedor_doc:t.fornecedorDoc||null,descricao:t.descricao||null,documento:t.documento||null,parcela:t.parcela??null,parcelas:t.parcelas??null,emissao:t.emissao||null,vencimento:t.vencimento,valor:t.valor,juros:t.juros||0,desconto:t.desconto||0,valor_pago:t.valorPago||0,pago_em:t.pagoEm||null,status:t.status||'aberto',categoria:t.categoria||null,centro_custo:t.centroCusto||null,conta:t.conta||null,observacao:t.observacao||null,anexos:t.anexos||null,created_by:t.createdBy||null,aprovacao:t.aprovacao||null,lancado_por:t.lancadoPor||null,aprovado_por:t.aprovadoPor||null,aprovado_em:t.aprovadoEm||null,linha_digitavel:t.linhaDigitavel||null}),
  fromRow:r=>({id:r.id,origem:r.origem,invoiceId:r.invoice_id||null,fornecedor:r.fornecedor||'',fornecedorDoc:r.fornecedor_doc||'',descricao:r.descricao||'',documento:r.documento||'',parcela:r.parcela,parcelas:r.parcelas,emissao:r.emissao||'',vencimento:r.vencimento,valor:n(r.valor),juros:n(r.juros),desconto:n(r.desconto),valorPago:n(r.valor_pago),pagoEm:r.pago_em||null,status:r.status,categoria:r.categoria||'',centroCusto:r.centro_custo||'',conta:r.conta||'',observacao:r.observacao||'',anexos:r.anexos||null,createdBy:r.created_by||'',aprovacao:r.aprovacao||undefined,lancadoPor:r.lancado_por||'',aprovadoPor:r.aprovado_por||'',aprovadoEm:r.aprovado_em||null,linhaDigitavel:r.linha_digitavel||''})},
 bankAccounts:{table:'bank_accounts',key:'id',
  toRow:a=>({id:a.id,nome:a.nome,banco:a.banco||null,agencia:a.agencia||null,conta:a.conta||null,tipo:a.tipo||'corrente',saldo_inicial:a.saldoInicial||0,data_saldo_inicial:a.dataSaldoInicial||null,saldo_extrato:a.saldoExtrato??null,data_saldo_extrato:a.dataSaldoExtrato||null,ativo:a.ativo!==false}),
  fromRow:r=>({id:r.id,nome:r.nome,banco:r.banco||'',agencia:r.agencia||'',conta:r.conta||'',tipo:r.tipo,saldoInicial:n(r.saldo_inicial),dataSaldoInicial:r.data_saldo_inicial||null,saldoExtrato:r.saldo_extrato==null?null:n(r.saldo_extrato),dataSaldoExtrato:r.data_saldo_extrato||null,ativo:r.ativo})},
 bankTx:{table:'bank_transactions',key:'id',
  toRow:t=>({id:t.id,conta_id:t.contaId,data:t.data,descricao:t.descricao||null,documento:t.documento||null,valor:t.valor,fitid:t.fitid||null,origem:t.origem||'ofx',status:t.status||'pendente',vinculo:t.vinculo||null,categoria:t.categoria||null,observacao:t.observacao||null,arquivo:t.arquivo||null}),
  fromRow:r=>({id:r.id,contaId:r.conta_id,data:r.data,descricao:r.descricao||'',documento:r.documento||'',valor:n(r.valor),fitid:r.fitid,origem:r.origem,status:r.status,vinculo:r.vinculo||null,categoria:r.categoria||'',observacao:r.observacao||'',arquivo:r.arquivo||''})},
 cadastros:{table:'cadastros',key:'id',
  toRow:c=>({id:c.id,tipo:c.tipo,dados:c.dados||{},ativo:c.ativo!==false}),
  fromRow:r=>({id:r.id,tipo:r.tipo,dados:r.dados||{},ativo:r.ativo})},
 audit:{table:'audit_log',key:'id',insertOnly:true,
  toRow:a=>({id:a.id,time:a.time,action:a.action,detail:a.detail||'',actor:a.actor||Cloud.session?.user?.email||null}),
  fromRow:r=>({id:r.id,time:r.time,action:r.action,detail:r.detail,actor:r.actor})},
};
const listOf={orders:()=>db.orders,receipts:()=>db.receipts,ledger:()=>db.ledger,imports:()=>db.imports,audit:()=>db.audit,accLines:()=>db.accLines||[],accDocs:()=>db.accDocs||[],products:()=>db.products||[],scenarios:()=>db.scenarios||[],payables:()=>db.payables||[],bankAccounts:()=>db.bankAccounts||[],bankTx:()=>db.bankTx||[],cadastros:()=>db.cadastros||[]};
let snap={};           // último estado gravado: coleção → Map(id → JSON)
let flushTimer=null,flushing=null,dirty=false;

function ensureIds(){for(const i of db.imports)i.id=i.id||uid();for(const a of db.audit)a.id=a.id||uid()}
function snapshot(){ensureIds();snap={};for(const [k,m] of Object.entries(maps))snap[k]=new Map(listOf[k]().map(x=>[x[m.key],JSON.stringify(m.toRow(x))]));
 snap.crm=new Map(Object.entries(db.crm||{}).map(([id,c])=>[id,JSON.stringify(c)]));snap.accMap=new Map(Object.entries(db.accMap||{}).map(([id,c])=>[id,JSON.stringify(c)]));snap.closures=new Map(Object.entries(db.closures||{}).map(([m,c])=>[m,JSON.stringify(c)]));snap.settings=JSON.stringify(settingsOf())}
function settingsOf(){return {theme:db.theme,pricing:db.pricing||null,gerencial:db.gerencial||null}}

async function pageAll(table,cols='*'){let out=[],from=0;for(;;){const {data,error}=await sb.from(table).select(cols).eq('workspace_id',Cloud.ws).range(from,from+999);if(error)throw error;out.push(...data);if(data.length<1000)return out;from+=1000}}

async function load(){
 Cloud.state='loading';
 const [orders,receipts,ledger,imports,audit,crm,closures,settings,accLines,accMap,accDocs,products,scenarios]=await Promise.all(['orders','receipts','ledger','imports','audit_log','crm_contacts','closures','workspace_settings','accounting_lines','account_map','accounting_docs','pricing_products','pricing_scenarios'].map(t=>pageAll(t)));
 const next={orders:orders.map(maps.orders.fromRow),receipts:receipts.map(maps.receipts.fromRow),ledger:ledger.map(maps.ledger.fromRow),
  imports:imports.map(maps.imports.fromRow).sort((a,b)=>b.time.localeCompare(a.time)),audit:audit.map(maps.audit.fromRow).sort((a,b)=>b.time.localeCompare(a.time)),
  crm:Object.fromEntries(crm.map(c=>[c.id,{stage:c.stage,tags:c.tags||[],notes:c.notes||'',interactions:c.interactions||[]}])),
  closures:Object.fromEntries(closures.map(c=>[c.month,c.data])),theme:settings[0]?.data?.theme||db.theme||'dark',schemaVersion:2,
  accLines:accLines.map(maps.accLines.fromRow),accMap:Object.fromEntries(accMap.map(a=>[a.conta,{linha:a.linha,descricao:a.descricao||''}])),accDocs:accDocs.map(maps.accDocs.fromRow),
  products:products.map(maps.products.fromRow),scenarios:scenarios.map(maps.scenarios.fromRow),payables:(await pageAll('payables')).map(maps.payables.fromRow),bankAccounts:(await pageAll('bank_accounts')).map(maps.bankAccounts.fromRow),bankTx:(await pageAll('bank_transactions')).map(maps.bankTx.fromRow),cadastros:(await pageAll('cadastros')).map(maps.cadastros.fromRow),
  // Notas de entrada: só leitura (a origem é o Bling), sem o JSON bruto.
  purchases:(await pageAll('purchase_invoices','id,numero,serie,chave,emissao,fornecedor,fornecedor_doc,valor,cfop,natureza,tipo,situacao,itens,parcelas')).map(r=>({id:r.id,numero:r.numero,serie:r.serie,chave:r.chave,emissao:r.emissao,fornecedor:r.fornecedor,fornecedorDoc:r.fornecedor_doc,valor:n(r.valor),cfop:r.cfop,natureza:r.natureza,tipo:r.tipo,situacao:r.situacao,itens:r.itens||[],parcelas:r.parcelas||[]})),pricing:settings[0]?.data?.pricing||undefined,gerencial:settings[0]?.data?.gerencial||undefined};
 db=next;paymentIndex=null;snapshot();Cloud.state='saved';
 document.body.classList.toggle('light',db.theme==='light');
 const months=[...new Set(db.orders.map(o=>o.date.slice(0,7)))].sort();
 if(months.length&&!months.includes(month))month=months.at(-1);
}
Cloud.reload=async()=>{await flush();await load();render()};
Cloud.switchWs=async id=>{const w=Cloud.workspaces.find(x=>x.id===id);if(!w||id===Cloud.ws)return;await flush();Cloud.ws=w.id;Cloud.wsName=w.name;Cloud.role=w.role;Cloud.paginas=w.paginas||null;try{localStorage.setItem('concilia-ws',id)}catch{}await load();window.Integrations&&(Integrations.state.loaded=false);render();toast('Workspace: '+w.name)};
Cloud.renameWs=async name=>{const {error}=await sb.from('workspaces').update({name}).eq('id',Cloud.ws);if(error)throw error;Cloud.wsName=name;const w=Cloud.workspaces.find(x=>x.id===Cloud.ws);if(w)w.name=name};

async function flush(){
 if(flushing){dirty=true;return flushing}
 clearTimeout(flushTimer);
 flushing=(async()=>{
  try{
   Cloud.state='saving';paintStatus();ensureIds();const ws=Cloud.ws;
   for(const [k,m] of Object.entries(maps)){
    const cur=new Map(listOf[k]().map(x=>[x[m.key],JSON.stringify(m.toRow(x))])),old=snap[k]||new Map();
    const changed=[...cur].filter(([id,j])=>old.get(id)!==j).map(([,j])=>({workspace_id:ws,...JSON.parse(j)}));
    for(let i=0;i<changed.length;i+=500){const q=m.insertOnly?sb.from(m.table).upsert(changed.slice(i,i+500),{onConflict:'workspace_id,id',ignoreDuplicates:true}):sb.from(m.table).upsert(changed.slice(i,i+500),{onConflict:'workspace_id,id'});const {error}=await q;if(error)throw error}
    if(!m.insertOnly){const removed=[...old.keys()].filter(id=>!cur.has(id));for(let i=0;i<removed.length;i+=200){const {error}=await sb.from(m.table).delete().eq('workspace_id',ws).in('id',removed.slice(i,i+200));if(error)throw error}}
    snap[k]=cur;
   }
   const crmNow=new Map(Object.entries(db.crm||{}).map(([id,c])=>[id,JSON.stringify(c)]));
   const crmRows=[...crmNow].filter(([id,j])=>snap.crm.get(id)!==j).map(([id,j])=>{const c=JSON.parse(j);return {workspace_id:ws,id,stage:c.stage||'Novo',tags:c.tags||[],notes:c.notes||'',interactions:c.interactions||[],updated_at:new Date().toISOString()}});
   if(crmRows.length){const {error}=await sb.from('crm_contacts').upsert(crmRows,{onConflict:'workspace_id,id'});if(error)throw error}
   snap.crm=crmNow;
   const amNow=new Map(Object.entries(db.accMap||{}).map(([id,c])=>[id,JSON.stringify(c)]));
   const amRows=[...amNow].filter(([id,j])=>snap.accMap?.get(id)!==j).map(([conta,j])=>{const c=JSON.parse(j);return {workspace_id:ws,conta,linha:c.linha,descricao:c.descricao||null}});
   if(amRows.length){const {error}=await sb.from('account_map').upsert(amRows,{onConflict:'workspace_id,conta'});if(error)throw error}
   snap.accMap=amNow;
   const clNow=new Map(Object.entries(db.closures||{}).map(([m,c])=>[m,JSON.stringify(c)]));
   const clRows=[...clNow].filter(([m,j])=>snap.closures.get(m)!==j).map(([m,j])=>({workspace_id:ws,month:m,data:JSON.parse(j)}));
   if(clRows.length){const {error}=await sb.from('closures').upsert(clRows,{onConflict:'workspace_id,month'});if(error)throw error}
   const clGone=[...snap.closures.keys()].filter(m=>!clNow.has(m));
   if(clGone.length){const {error}=await sb.from('closures').delete().eq('workspace_id',ws).in('month',clGone);if(error)throw error}
   snap.closures=clNow;
   const st=JSON.stringify(settingsOf());
   if(st!==snap.settings){const {error}=await sb.from('workspace_settings').upsert({workspace_id:ws,data:settingsOf()});if(error)throw error;snap.settings=st}
   Cloud.state='saved';Cloud.error='';
  }catch(e){Cloud.state='error';Cloud.error=e.message||String(e);console.error(e);toast('Não foi possível salvar na nuvem: '+Cloud.error)}
  finally{flushing=null;paintStatus();if(dirty){dirty=false;schedule()}}
 })();
 return flushing;
}
function schedule(){if(!Cloud.ws)return;Cloud.state='pending';paintStatus();clearTimeout(flushTimer);flushTimer=setTimeout(flush,700)}
Cloud.flush=flush;

// Em modo nuvem, save() agenda a gravação incremental em vez de usar o localStorage.
save=function(){if(!Cloud.ws)return false;schedule();return true};
window.addEventListener('beforeunload',e=>{if(Cloud.state==='pending'||Cloud.state==='saving'){flush();e.preventDefault();e.returnValue=''}});

function paintStatus(){const el=document.getElementById('cloudStatus');if(!el)return;const t={pending:['Alterações pendentes','warn'],saving:['Salvando…','info'],saved:['Salvo na nuvem','ok'],error:['Erro ao salvar','bad'],loading:['Carregando…','info']}[Cloud.state]||['Nuvem','info'];el.className='badge '+t[1];el.textContent=t[0];el.title=Cloud.error||''}
Cloud.paintStatus=paintStatus;

// ───────── Tela de acesso ─────────
function loginView(msg=''){window.Assistant?.sync();
 $('#app').innerHTML=`<div class="auth"><div class="authcard"><div class="authhead"><img class="authlogo" src="brand/comprastore-logo.png" alt="Compra Store"><div class="authname">Jarvis</div><div class="authslogan">Você vende. O Jarvis cuida do resto.</div></div>
 <h1 style="font-size:24px">Entre na sua operação</h1><p>Seus dados ficam protegidos na nuvem e sincronizam entre computadores. Primeiro acesso? Informe e-mail e senha e clique em <strong>Criar conta</strong>: o administrador recebe o pedido e libera.</p>
 <form id="authForm" autocomplete="on"><div id="authNomeBox" hidden><label for="authNome">Seu nome</label><input id="authNome" autocomplete="name" style="width:100%" placeholder="Nome e sobrenome"></div><label for="authEmail">E-mail</label><input id="authEmail" type="email" required autocomplete="email" style="width:100%">
 <label for="authPass">Senha</label><input id="authPass" type="password" minlength="8" autocomplete="current-password" style="width:100%" placeholder="Mínimo de 8 caracteres">
 <div class="row wrap" style="margin-top:18px"><button class="primary" type="submit" data-auth="login">Entrar</button><button type="submit" data-auth="signup">Criar conta</button><button type="submit" class="quiet small" data-auth="magic">Receber link por e-mail</button></div></form>
 <div id="authMsg" class="caption" style="margin-top:16px;min-height:20px">${esc(msg)}</div></div></div>`;
 let mode='login';
 $('#authForm').addEventListener('click',e=>{const b=e.target.closest('button[data-auth]');if(b){mode=b.dataset.auth;if(mode==='signup')$('#authNomeBox').hidden=false}},true);
 $('#authForm').onsubmit=async e=>{e.preventDefault();const email=$('#authEmail').value.trim(),password=$('#authPass').value,out=$('#authMsg');out.textContent='Aguarde…';
  try{let r;const redirect=location.origin+location.pathname;
   if(mode==='magic')r=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirect}});
   else{if(password.length<8)throw Error('Informe uma senha com pelo menos 8 caracteres.');r=mode==='signup'?await (async()=>{const nome=($('#authNome')?.value||'').trim();if(!nome){$('#authNomeBox').hidden=false;$('#authNome').focus();throw Error('Para criar a conta, informe também o seu nome.')}return sb.auth.signUp({email,password,options:{emailRedirectTo:redirect,data:{nome}}})})():await sb.auth.signInWithPassword({email,password})}
   if(r.error)throw r.error;
   if(mode==='magic')out.textContent='Enviamos um link de acesso para '+email+'.';
   else if(mode==='signup'&&!r.data.session)out.textContent='Conta criada. Confirme pelo link enviado ao seu e-mail e entre: seu pedido de acesso vai para o administrador liberar.';
  }catch(err){out.textContent=({'Invalid login credentials':'E-mail ou senha incorretos.','Signups not allowed for this instance':'Novos cadastros estão fechados. Peça ao dono do workspace para liberar seu acesso.','Signups not allowed for otp':'Novos cadastros estão fechados. Use um e-mail que já tenha conta.'})[err.message]||err.message}};
}

// Quem criou a conta e ainda não foi liberado pelo administrador.
async function aguardandoView(session){const {data:req}=await sb.from('access_requests').select('status,created_at,decided_at').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(1);const r=req?.[0];const recusado=r?.status==='recusado';
 $('#app').innerHTML=`<div class="auth"><div class="authcard"><div class="brand" style="padding:0;margin-bottom:22px"><span class="mark">${icon('marca')}</span><div>Jarvis<small>CONCILIAÇÃO E RESULTADO</small></div></div>
 <h1 style="font-size:23px">${recusado?'Acesso não liberado':'Aguardando liberação'}</h1><p>${recusado?'O administrador não liberou o acesso para':'Sua conta foi criada e o pedido de acesso foi enviado ao administrador.'} <strong>${esc(session.user.email)}</strong>${recusado?'. Se foi engano, fale com ele.':'. Assim que ele liberar, é só entrar de novo (ou clicar em Verificar).'}</p>
 ${r&&!recusado?`<p class="caption" style="margin-top:10px">Pedido feito em ${new Date(r.created_at).toLocaleString('pt-BR')}.</p>`:''}
 <div class="row wrap" style="margin-top:20px">${recusado?'':'<button class="primary" id="accCheck">Verificar agora</button>'}<button class="quiet" id="accOut">Sair</button></div>
 <div class="notice" style="margin-top:22px"><strong>Não faz parte de uma empresa que já usa o Jarvis?</strong> Crie a sua e faça o diagnóstico gratuito por 7 dias: conecte os marketplaces só para leitura e veja quanto cada venda realmente deixa.
  <form id="novaEmp" class="row wrap" style="gap:8px;margin-top:10px"><label for="novaEmpNome" class="sr-only" style="position:absolute;left:-9999px">Nome da empresa</label><input id="novaEmpNome" required minlength="2" maxlength="120" placeholder="Nome da sua empresa" style="flex:1;min-width:200px"><button class="primary" type="submit">Criar minha empresa</button></form>
  <p class="caption red" id="novaEmpErro" role="alert"></p></div></div></div>`;
 const c=$('#accCheck');if(c)c.onclick=()=>start(session);$('#accOut').onclick=async()=>{await sb.auth.signOut()};
 // Cadastro da própria empresa: vira dono, começa o teste grátis de 7 dias e abre os primeiros passos.
 $('#novaEmp').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button'),nome=$('#novaEmpNome').value.trim();b.disabled=true;$('#novaEmpErro').textContent='';
  try{const {error}=await sb.rpc('criar_empresa',{nome});if(error)throw error;try{sessionStorage.setItem('jarvis_primeiros_passos','1')}catch{}location.hash='#comecar';await start(session)}
  catch(x){$('#novaEmpErro').textContent=x.message||String(x);b.disabled=false}}}

// Verificação em duas etapas: com autenticador cadastrado, os dados só abrem depois do código (o banco exige aal2).
function pedirCodigo(session){return new Promise(res=>{
 $('#app').innerHTML=`<div class="auth"><div class="authcard"><h2>Verificação em duas etapas</h2><p class="caption">Abra o app autenticador (Google Authenticator, Microsoft Authenticator, 1Password…) e digite o código de 6 dígitos do Jarvis.</p>
  <label for="mfaCod">Código</label><input id="mfaCod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="width:100%;font-size:22px;letter-spacing:6px;text-align:center" autofocus>
  <p class="caption red" id="mfaErro"></p><div class="row" style="margin-top:12px"><button class="primary" id="mfaOk">Entrar</button><button class="quiet" id="mfaSair">Sair</button></div></div></div>`;
 const ir=async()=>{const code=$('#mfaCod').value.replace(/D/g,'');if(code.length!==6){$('#mfaErro').textContent='Digite os 6 dígitos.';return}
  const {data:f}=await sb.auth.mfa.listFactors();const fator=(f?.totp||[]).find(x=>x.status==='verified');if(!fator){res(session);return}
  const {error}=await sb.auth.mfa.challengeAndVerify({factorId:fator.id,code});if(error){$('#mfaErro').textContent='Código inválido ou expirado. Tente o próximo.';$('#mfaCod').value='';return}
  const {data:s2}=await sb.auth.getSession();res(s2.session)};
 $('#mfaOk').onclick=ir;$('#mfaCod').onkeydown=e=>{if(e.key==='Enter')ir()};$('#mfaSair').onclick=()=>sb.auth.signOut();setTimeout(()=>$('#mfaCod')?.focus(),50)})}
async function start(session){
 Cloud.session=session;
 if(!session){Cloud.ws=null;loginView();return}
 try{const {data:aal}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();if(aal?.nextLevel==='aal2'&&aal.currentLevel!=='aal2'){session=await pedirCodigo(session);Cloud.session=session}}catch{}
 try{
  $('#app').innerHTML='<div class="auth"><div class="authcard"><p>Carregando seus dados…</p></div></div>';
  const {data:ws,error}=await sb.rpc('ensure_workspace');if(error)throw error;
  // Quem foi adicionado a uma equipe abre o workspace da equipe; a escolha fica lembrada neste navegador.
  const {data:mems,error:me}=await sb.from('workspace_members').select('workspace_id,role,paginas,created_at,workspaces(name)').eq('user_id',session.user.id).order('created_at');if(me)throw me;
  if(!(mems||[]).length){await aguardandoView(session);return}
  Cloud.workspaces=(mems||[]).map(m=>({id:m.workspace_id,role:m.role,paginas:m.paginas||null,name:m.workspaces?.name||'Minha operação'}));
  let pref=null;try{pref=localStorage.getItem('concilia-ws')}catch{}
  const chosen=Cloud.workspaces.find(w=>w.id===pref)||Cloud.workspaces.find(w=>w.role==='member')||Cloud.workspaces.find(w=>w.id===ws)||{id:ws,role:'owner',name:'Minha operação'};
  Cloud.ws=chosen.id;Cloud.wsName=chosen.name;Cloud.role=chosen.role;Cloud.paginas=chosen.paginas||null;
  await load();
  const h=location.hash.slice(1).split('?')[0];if(h)page=decodeURIComponent(h);
  render();
  if(Cloud.localBackup&&!db.orders.length&&!db.receipts.length)offerMigration();
 }catch(e){console.error(e);loginView('Não foi possível abrir o workspace: '+(e.message||e)+'. Verifique se as migrações do banco foram aplicadas.')}
}

function offerMigration(){const b=Cloud.localBackup;modal('Levar dados deste navegador para a nuvem',`<div class="notice">Encontramos ${b.orders.length} pedidos e ${b.receipts.length} liberações salvos apenas neste navegador. Deseja copiá-los para o seu workspace na nuvem?</div><div class="modalfoot"><button data-action="close">Agora não</button><button class="primary" data-cloud="migrate">${icon('upload')} Copiar para a nuvem</button></div>`)}

document.addEventListener('click',async e=>{const b=e.target.closest('button[data-cloud]');if(!b)return;
 const a=b.dataset.cloud;
 if(a==='migrate'){const src=Cloud.localBackup;db.orders=src.orders;db.receipts=src.receipts;db.imports=src.imports||[];db.closures=src.closures||{};db.ledger=src.ledger||[];db.crm=src.crm||{};db.audit=[...(src.audit||[]),...db.audit];Cloud.localBackup=null;audit('Dados locais enviados à nuvem',`${src.orders.length} pedidos e ${src.receipts.length} liberações copiados deste navegador.`);closeModal();render();await flush();toast('Dados copiados para a nuvem.')}
 if(a==='logout'){await flush();await sb.auth.signOut();db=seed();snap={};render()}
 if(a==='reload'){b.disabled=true;await Cloud.reload();toast('Dados atualizados.')}
});

const renderSignedIn=render;
render=function(){if(!Cloud.ws){loginView();return}renderSignedIn()};

let started=false;
sb.auth.onAuthStateChange((event,session)=>{
 if(event==='INITIAL_SESSION'){started=true;start(session);return}
 if(event==='SIGNED_IN'&&(!Cloud.session||Cloud.session.user.id!==session.user.id)){start(session);return}
 if(event==='SIGNED_OUT'){start(null);return}
 if(session)Cloud.session=session;
});
setTimeout(()=>{if(!started)sb.auth.getSession().then(({data})=>start(data.session))},3000);
// Enquanto não há login, a tela do app não deve aparecer com dados locais.
loginView('Verificando sessão…');
})();
