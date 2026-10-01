// Ativa (ou renova) o backup do Jarvis sem que nenhum segredo apareça na tela:
//  - RECEPTOR_TOKEN: aleatório, gravado no receptor (Cloudflare) e no GitHub;
//  - SUPABASE_SERVICE_KEY_BACKUP: lida do Supabase CLI (já logado nesta máquina) e gravada no GitHub;
//  - BACKUP_PASSPHRASE: aleatória, gravada no GitHub e numa cópia em Documents\Backups para você guardar no
//    gerenciador de senhas (sem ela ninguém abre os backups). Só é criada se ainda não existir (--nova-frase troca).
// Uso: node ops/ativar-backup.mjs [--nova-frase]
import {spawnSync} from 'node:child_process';import crypto from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';

const REPO='geklemann/jarvis',REF='olxapwaxmzqclitlylzv',CONTA='e544d389f8e7fd2f3fca6dfccaf96067';
const SUPABASE=path.join(os.homedir(),'.tools','supabase.exe');
const WRANGLER=path.join(os.homedir(),'Documents','AdaoEva','VELLUM','node_modules','wrangler','bin','wrangler.js');
const FRASE_ARQ=path.join(os.homedir(),'Documents','Backups','jarvis-backup-FRASE.txt');
const rodar=(cmd,args,input,env={})=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',env:{...process.env,...env},stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});if(r.status!==0)throw new Error(`${path.basename(cmd)} ${args[0]} falhou: ${(r.stderr||'').split('\n').filter(l=>!/[A-Za-z0-9_-]{30,}/.test(l)).slice(-3).join(' ')}`);return r.stdout};
const segredoGitHub=(nome,valor)=>{rodar('gh',['secret','set',nome,'--repo',REPO],valor);console.log('  ✓ GitHub:',nome)};

console.log('Ativando o backup do Jarvis (nenhum valor é exibido)…');
// 1) Token do receptor: o mesmo valor no worker e no GitHub.
const token=crypto.randomBytes(32).toString('hex');
rodar(process.execPath,[WRANGLER,'secret','put','TOKEN','--name','jarvis-backup'],token,{CLOUDFLARE_ACCOUNT_ID:CONTA});console.log('  ✓ Cloudflare: TOKEN do receptor');
segredoGitHub('RECEPTOR_TOKEN',token);
// 2) Chave de serviço do Supabase (para baixar os arquivos do Storage).
const chaves=JSON.parse(rodar(SUPABASE,['projects','api-keys','--project-ref',REF,'-o','json']));
const servico=(chaves.find(k=>k.name==='service_role')||chaves.find(k=>k.type==='secret'))?.api_key;
if(!servico)throw new Error('Não achei a chave de serviço do projeto no Supabase CLI.');
segredoGitHub('SUPABASE_SERVICE_KEY_BACKUP',servico);
// 3) Frase do backup (cópia local para o gerenciador de senhas).
if(!fs.existsSync(FRASE_ARQ)||process.argv.includes('--nova-frase')){
 const frase=crypto.randomBytes(24).toString('base64url');
 segredoGitHub('BACKUP_PASSPHRASE',frase);
 fs.mkdirSync(path.dirname(FRASE_ARQ),{recursive:true});
 fs.writeFileSync(FRASE_ARQ,`FRASE DO BACKUP DO JARVIS (criada em ${new Date().toLocaleString('pt-BR')})\r\n\r\n${frase}\r\n\r\nGuarde no seu gerenciador de senhas e depois apague este arquivo.\r\nSem ela, ninguém (nem você) abre os backups do balde jarvis-backups.\r\nPara abrir um backup: sh ops/restaurar-backup.sh <arquivo .tar.gz.enc> (no repositório do Jarvis).\r\n`);
 console.log('  ✓ Frase do backup: cópia em',FRASE_ARQ);
}else console.log('  · Frase do backup: mantida (a cópia já existe em',FRASE_ARQ+')');
// 4) Variáveis (não são segredo).
rodar('gh',['variable','set','BACKUP_RECEPTOR_URL','--body','https://jarvis-backup.adaoeva.workers.dev','--repo',REPO]);
rodar('gh',['variable','set','SUPABASE_POOLER_HOST','--body','aws-0-sa-east-1.pooler.supabase.com','--repo',REPO]);
console.log('  ✓ GitHub: variáveis BACKUP_RECEPTOR_URL e SUPABASE_POOLER_HOST');
console.log('Pronto.');
