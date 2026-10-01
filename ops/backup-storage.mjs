// Copia todos os arquivos do Storage do Supabase para uma pasta local (usado pelo backup.yml).
// Uso: SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node ops/backup-storage.mjs <pasta-destino>
// Lista cada balde (inclusive subpastas), baixa arquivo por arquivo e confere a quantidade no fim.
import fs from 'node:fs';import path from 'node:path';

const URL_BASE=process.env.SUPABASE_URL,CHAVE=process.env.SUPABASE_SERVICE_KEY,DEST=process.argv[2];
if(!URL_BASE||!CHAVE||!DEST){console.error('faltam SUPABASE_URL, SUPABASE_SERVICE_KEY ou a pasta');process.exit(2)}
const H={authorization:'Bearer '+CHAVE,apikey:CHAVE};
async function api(caminho,corpo){
 for(let t=0;;t++){
  const r=await fetch(URL_BASE+'/storage/v1/'+caminho,corpo?{method:'POST',headers:{...H,'content-type':'application/json'},body:JSON.stringify(corpo)}:{headers:H});
  if(r.ok)return r;if(t>=3)throw new Error(`${caminho}: HTTP ${r.status}`);await new Promise(o=>setTimeout(o,1000*(t+1)));
 }
}
async function listar(balde,prefixo=''){
 const saida=[];
 for(let offset=0;;offset+=1000){
  const itens=await (await api('object/list/'+balde,{prefix:prefixo,limit:1000,offset,sortBy:{column:'name',order:'asc'}})).json();
  for(const i of itens){const p=prefixo?prefixo+'/'+i.name:i.name;if(i.id===null)saida.push(...await listar(balde,p));else saida.push(p)}
  if(itens.length<1000)break;
 }
 return saida;
}
const baldes=await (await api('bucket')).json();
let total=0;
for(const b of baldes){
 const arquivos=await listar(b.id);
 for(const a of arquivos){
  const r=await api('object/authenticated/'+b.id+'/'+a.split('/').map(encodeURIComponent).join('/'));
  const alvo=path.join(DEST,b.id,...a.split('/'));fs.mkdirSync(path.dirname(alvo),{recursive:true});
  fs.writeFileSync(alvo,Buffer.from(await r.arrayBuffer()));total++;
 }
 console.log(`Balde ${b.id}: ${arquivos.length} arquivo(s)`);
}
console.log(`Total: ${total} arquivo(s) do Storage copiados.`);
fs.writeFileSync(path.join(DEST,'..','arquivos.json'),JSON.stringify({baldes:baldes.map(b=>b.id),total},null,1));
