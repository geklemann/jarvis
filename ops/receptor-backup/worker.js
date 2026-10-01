// Receptor de backups do Jarvis: recebe do GitHub Actions os arquivos do backup e grava no balde R2 "jarvis-backups"
// pela ligação interna da Cloudflare (sem chave de API do R2). Só aceita o token RECEPTOR_TOKEN, só grava em
// diario/AAAA-MM-DD/ e mensal/AAAA-MM/, e não tem como apagar nada (o balde ainda tem trava de retenção).
const CHAVE=/^(?:diario\/\d{4}-\d{2}-\d{2}|mensal\/\d{4}-\d{2})\/[\w.-]{1,120}$/;
const json=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'no-store'}});
async function igual(a,b){const h=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));const [x,y]=await Promise.all([h(a),h(b)]);return x.reduce((n,v,i)=>n|(v^y[i]),0)===0}

export default {async fetch(request,env){
 const url=new URL(request.url),q=url.searchParams,chave=q.get('chave')||'';
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
