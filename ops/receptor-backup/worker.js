// Receptor de backups do Jarvis: recebe do GitHub Actions os arquivos do backup e grava no balde R2 "jarvis-backups"
// pela ligação interna da Cloudflare (sem chave de API do R2). Só aceita o token RECEPTOR_TOKEN, só grava em
// diario/AAAA-MM-DD/ e mensal/AAAA-MM/, e não tem como apagar nada (o balde ainda tem trava de retenção). A rota
// /estado (token ESTADO_TOKEN, só leitura) diz ao portal Adão & Eva qual foi o último backup.
const CHAVE=/^(?:diario\/\d{4}-\d{2}-\d{2}|mensal\/\d{4}-\d{2})\/[\w.-]{1,120}$/;
const json=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'no-store'}});
async function igual(a,b){const h=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));const [x,y]=await Promise.all([h(a),h(b)]);return x.reduce((n,v,i)=>n|(v^y[i]),0)===0}

export default {async fetch(request,env){
 const url=new URL(request.url),q=url.searchParams,chave=q.get('chave')||'';
 // Só leitura, para a saúde do sistema no portal: o último backup diário (não grava nem baixa nada).
 if(url.pathname==='/estado'&&request.method==='GET'){
  if(!env.ESTADO_TOKEN||!await igual(request.headers.get('authorization')||'','Bearer '+env.ESTADO_TOKEN))return json({erro:'não autorizado'},401);
  const l=await env.BACKUPS.list({prefix:'diario/',limit:1000});
  const enc=l.objects.filter(o=>o.key.endsWith('.tar.gz.enc')).sort((a,b)=>a.key<b.key?1:-1),u=enc[0];
  return json({ultimo:u?{dia:u.key.slice(7,17),arquivo:u.key.split('/').pop(),tamanho:u.size,enviado:u.uploaded}:null,diarios:enc.length});
 }
 if(!env.TOKEN||!await igual(request.headers.get('authorization')||'','Bearer '+env.TOKEN))return json({erro:'não autorizado'},401);
 if(!CHAVE.test(chave))return json({erro:'chave inválida'},400);
 const m=request.method,p=url.pathname;
 try{
  if(p==='/simples'&&m==='PUT'){await env.BACKUPS.put(chave,request.body);return json({ok:true})}
  if(p==='/iniciar'&&m==='POST'){const u=await env.BACKUPS.createMultipartUpload(chave);return json({uploadId:u.uploadId})}
  if(p==='/parte'&&m==='PUT'){const n=Number(q.get('n'))|0;if(n<1||n>1000)return json({erro:'parte inválida'},400);const r=await env.BACKUPS.resumeMultipartUpload(chave,q.get('uploadId')||'').uploadPart(n,request.body);return json({n:r.partNumber,etag:r.etag})}
  if(p==='/concluir'&&m==='POST'){const b=await request.json();await env.BACKUPS.resumeMultipartUpload(chave,String(b.uploadId||'')).complete((b.partes||[]).map(x=>({partNumber:Number(x.n),etag:String(x.etag)})));const h=await env.BACKUPS.head(chave);return json({ok:true,tamanho:h?.size||0})}
  if(p==='/baixar'&&m==='GET'){const o=await env.BACKUPS.get(chave);if(!o)return json({erro:'não encontrado'},404);return new Response(o.body,{headers:{'content-type':'application/octet-stream','content-length':String(o.size)}})}
  return json({erro:'rota'},404);
 }catch(e){return json({erro:String(e?.message||e).slice(0,200)},500)}
}};
