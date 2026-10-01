// Monitor das telas: abre TODAS as telas registradas, como o dono logado com dados de exemplo e a nuvem simulada
// (toda consulta devolve vazio), duas vezes — antes e depois de carregar os dados — e falha se alguma tela:
//  • der erro ao desenhar ou depois, ao carregar (erro assíncrono);
//  • ficar consultando o banco sem parar (ex.: Log e auditoria repetia a consulta quando a lista vinha vazia).
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarSistema } from './ambiente.mjs';

const assincronos = [];
process.on('unhandledRejection', (e) => assincronos.push(String(e?.message ?? e)));
const { ev, ctx } = carregarSistema();
const hoje = new Date(), d = (n) => { const x = new Date(hoje); x.setDate(x.getDate() - n); return x.toLocaleDateString('sv-SE'); };
ctx.__o = Array.from({ length: 40 }, (_, i) => ({ id: 'P' + i, platform: ['Mercado Livre', 'Shopee', 'Magalu'][i % 3], date: d(i * 2), gross: 100 + i, fee: 20, shipping: 0, items: [{ sku: 'SKU' + (i % 5), title: 'Produto ' + (i % 5), qty: 1, price: 100 + i }], state: 'SP', nf: i % 2 ? '1' + i : '' }));
ctx.__r = Array.from({ length: 20 }, (_, i) => ({ id: 'L' + i, platform: 'Mercado Livre', amount: 80, date: d(i * 3), linkedOrder: null, orderId: '', description: '' }));
ev(`db.orders=window.__o;db.receipts=window.__r;db.products=[{id:'SKU0',custo:40},{id:'SKU1',custo:50}];db.payables=db.payables||[];db.cadastros=db.cadastros||[]`);
// Nuvem simulada: conta as consultas (depois de 200, para de responder, para um laço não travar o teste); qualquer consulta devolve lista vazia (e nada em .maybeSingle/.single).
ev(`(()=>{window.__consultas=0;const q=()=>{window.__consultas++;let um=false;const b=new Proxy({},{get:(t,k)=>k==='then'?(ok,er)=>window.__consultas>200?new Promise(()=>{}):Promise.resolve({data:um?null:[],error:null,count:0}).then(ok,er):k==='maybeSingle'||k==='single'?()=>{um=true;return b}:()=>b});return b};
 window.Cloud=Object.assign(window.Cloud||{},{paintStatus(){},reload:async()=>{},ws:'ws-teste',role:'owner',enabled:true,session:{user:{id:'u',email:'dono@teste',user_metadata:{}}},client:{from:q,rpc:async()=>({data:null,error:null}),functions:{invoke:async()=>({data:{},error:null})},storage:{from:()=>({list:async()=>({data:[]})})},auth:{updateUser:async()=>({data:{}})}}})})()`);
const tick = () => new Promise((r) => setImmediate(r));
// Mais de 200 consultas ao abrir uma tela = laço (consulta → desenho → consulta…).
const LIMITE = 200;

test('todas as telas abrem sem erro e sem consultar o banco sem parar', async () => {
  const ids = JSON.parse(ev(`JSON.stringify(Telas.ids())`));
  assert.ok(ids.length > 60, `telas registradas: ${ids.length}`);
  const falhas = [];
  for (const id of ids) {
    ev(`window.__consultas=0`); const antes = assincronos.length;
    for (const volta of [1, 2]) {
      try { ev(`page=${JSON.stringify(id)}`); const h = ev(`Telas.html(${JSON.stringify(id)})`); if (typeof h !== 'string') throw new Error('a tela não devolveu HTML'); }
      catch (e) { falhas.push(`${id} (${volta}ª vez): ${String(e?.message ?? e).slice(0, 160)}`); break; }
      for (let i = 0; i < 6; i++) await tick();
    }
    const n = ev(`window.__consultas`);
    if (n > LIMITE) falhas.push(`${id}: ${n} consultas ao banco ao abrir (repetindo sem parar)`);
    if (assincronos.length > antes) falhas.push(`${id}: erro ao carregar: ${assincronos.slice(antes).join(' | ').slice(0, 200)}`);
  }
  assert.deepEqual(falhas, [], `telas com problema:\n${falhas.join('\n')}`);
});
