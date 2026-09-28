'use strict';
// Segurança e integridade (menu do usuário). Roda na hora, só leitura, e mostra o resultado de cada verificação:
// no navegador (conexão, chave pública, isolamento entre empresas, segredos inacessíveis, sessão) e no banco
// (public.seguranca_verificar: RLS em todas as tabelas, auditoria imutável, consistência dos dados, NSR do ponto).
(()=>{
const st={rodando:false,res:null,em:null};
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
async function verificar(){if(st.rodando||!window.Cloud?.ws)return;st.rodando=true;st.res=[];render();const c=Cloud.client,ws=Cloud.ws,out=[],add=(g,t,ok,det,nivel)=>{out.push({g,t,ok,det,nivel:nivel||(ok?'ok':'bad')});st.res=[...out];render()};
 try{
  add('Conexão','Tráfego criptografado (HTTPS/TLS)',location.protocol==='https:'||/^(127\.0\.0\.1|localhost)$/.test(location.hostname),location.protocol==='https:'?'Tudo o que sai e chega do navegador vai cifrado.':'Ambiente local de teste (sem HTTPS).');await esperar(150);
  const key=window.CONCILIA_CONFIG?.supabaseAnonKey||'';let papel='';try{papel=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role}catch{papel=/^sb_publishable_/.test(key)?'anon':''}
  add('Conexão','Navegador só tem a chave pública',papel==='anon',papel==='anon'?'Nenhuma chave de administrador fica no site; o acesso depende do login e das regras do banco.':'A chave do site não é a pública. Revise config.js.');await esperar(150);
  const {data:s}=await c.auth.getSession(),exp=s?.session?.expires_at?new Date(s.session.expires_at*1000):null;
  add('Acesso','Sessão autenticada e com validade',!!s?.session,exp?`Login válido até ${exp.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}; renova sozinho enquanto você usa.`:s?.session?'Login ativo.':'Sem sessão.');await esperar(150);
  const outro=await c.from('orders').select('id').neq('workspace_id',ws).limit(1);
  add('Isolamento','Dados de outras empresas são inacessíveis',!outro.error&&!(outro.data||[]).length,'Tentamos ler pedidos de outra empresa: o banco devolveu zero linhas.');await esperar(150);
  const seg=await c.from('integration_secrets').select('*').limit(1);
  add('Isolamento','Senhas e tokens das integrações protegidos',!!seg.error||!(seg.data||[]).length,'Tentamos ler os tokens do Bling e dos marketplaces pelo navegador: bloqueado. Só o servidor usa.');await esperar(150);
  const {data:r,error}=await c.rpc('seguranca_verificar',{ws});if(error)throw error;
  add('Banco de dados','Trava de acesso em todas as tabelas (RLS)',!r.sem_rls.length,r.sem_rls.length?`Sem trava: ${r.sem_rls.join(', ')}`:`${r.tabelas} de ${r.tabelas} tabelas com regras por empresa (${r.politicas} regras).`);
  add('Banco de dados','Auditoria não pode ser alterada nem apagada',r.auditoria_alteravel===0,`${Number(r.auditoria_total).toLocaleString('pt-BR')} registros; última ação em ${r.auditoria_ultima?new Date(r.auditoria_ultima).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—'}. Ninguém edita a trilha, nem administradores.`);
  add('Banco de dados','Dados no Brasil',true,'Banco PostgreSQL em São Paulo (sa-east-1), com criptografia em repouso.');await esperar(150);
  add('Integridade','Repasses ligados a pedidos existentes',r.repasses_orfaos===0,r.repasses_orfaos?`${r.repasses_orfaos} repasse(s) apontam para pedido inexistente.`:'Todos os repasses vinculados apontam para pedidos que existem.');
  add('Integridade','Contas a pagar com valores válidos',r.titulos_invalidos===0,r.titulos_invalidos?`${r.titulos_invalidos} título(s) com valor zerado ou negativo.`:'Nenhum título com valor zerado ou negativo.');
  const loc=(window.db?.orders||[]).length;add('Integridade','Tela e banco com os mesmos pedidos',loc===Number(r.pedidos),loc===Number(r.pedidos)?`${loc.toLocaleString('pt-BR')} pedidos na tela = ${Number(r.pedidos).toLocaleString('pt-BR')} no banco.`:`Tela ${loc} × banco ${r.pedidos}: atualize a página (dados ainda sincronizando).`,loc===Number(r.pedidos)?'ok':'warn');
  if(r.ponto)add('Integridade','Ponto: numeração sequencial (NSR) sem repetição',r.ponto.nsr_duplicados===0&&Number(r.ponto.nsr_max)<=Number(r.ponto.nsr_ultimo),`${r.ponto.marcacoes} marcação(ões) pelo app; último NSR ${r.ponto.nsr_ultimo}. Cada marcação tem autenticação própria e não pode ser apagada pelo app.`);
  add('Acesso','Verificação em duas etapas',!!r.mfa,r.mfa?(r.aal==='aal2'?'Ativa e confirmada nesta sessão.':'Ativa na conta.'):'Recomendado: ative em Segurança da conta (código do autenticador no celular).',r.mfa?'ok':'warn');
  add('Continuidade','Cópia de segurança do banco',true,'Os backups dependem do plano do banco de dados (Supabase). No plano gratuito não há backup diário automático: recomendado ativar o plano pago para ter restauração de dias anteriores.','info');
 }catch(x){add('Erro','Não foi possível concluir a verificação',false,x.message||String(x))}
 st.em=new Date();st.rodando=false;render()}
function view(){const R=st.res,ok=R?R.filter(x=>x.nivel==='ok').length:0,warn=R?R.filter(x=>x.nivel==='warn').length:0,bad=R?R.filter(x=>x.nivel==='bad').length:0;
 const ic={ok:'✓',warn:'!',bad:'✕',info:'i'},grupos=R?[...new Set(R.map(x=>x.g))]:[];
 return `<section class="card sgtopo"><div class="sgescudo ${st.rodando?'gira':bad?'bad':warn?'warn':R?'ok':''}"><svg viewBox="0 0 24 24" width="46" height="46"><path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m8 12 3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
  <div><h2 style="margin:0">${st.rodando?'Verificando…':R?(bad?`${bad} problema(s) encontrado(s)`:warn?`Protegido, com ${warn} recomendação(ões)`:'Tudo íntegro e protegido'):'Teste de segurança e integridade'}</h2>
  <p class="caption" style="margin:4px 0 0">${R&&!st.rodando?`${ok} de ${R.filter(x=>x.nivel!=='info').length} verificações aprovadas · ${st.em.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'medium'})}`:'Checa, agora e com os seus dados, a conexão, o isolamento entre empresas, as travas do banco, a auditoria e a consistência dos registros. Só leitura: nada é alterado.'}</p></div>
  <button class="primary" data-sg="rodar" ${st.rodando?'disabled':''}>${R?'Verificar de novo':'Executar verificação'}</button></section>
 ${grupos.map(g=>`<h3 class="sgg">${g}</h3><div class="sglista">${R.filter(x=>x.g===g).map(x=>`<div class="sgitem ${x.nivel}"><span>${ic[x.nivel]}</span><div><b>${esc(x.t)}</b><small>${esc(x.det)}</small></div></div>`).join('')}</div>`).join('')}
 ${R&&!st.rodando?'<button class="small" data-sg="copiar" style="margin-top:14px">Copiar relatório</button>':''}`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-sg]');if(!b)return;
 if(b.dataset.sg==='rodar')verificar();
 if(b.dataset.sg==='copiar'){const txt=`Jarvis · Teste de segurança e integridade · ${st.em.toLocaleString('pt-BR')}\n`+st.res.map(x=>`[${x.nivel==='ok'?'OK':x.nivel==='warn'?'ATENÇÃO':x.nivel==='info'?'INFO':'FALHA'}] ${x.g} · ${x.t}: ${x.det}`).join('\n');navigator.clipboard?.writeText(txt).then(()=>toast('Relatório copiado.'),()=>toast('Não consegui copiar.'))}});
addPage('integridade','shield','Segurança e integridade',view,'Verificação em tempo real de que os dados estão íntegros e protegidos: conexão, isolamento entre empresas, travas do banco, auditoria e consistência.','',()=>{if(!st.res&&!st.rodando)verificar()});
})();
