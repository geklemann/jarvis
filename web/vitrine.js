'use strict';
// Tela de entrada viva: o Jarvis "trabalhando" em volta do cartão de login. Painéis de vidro em 3D com o sistema em
// ação (vendas do dia, canais, conciliação, fluxo de caixa, mapa de pedidos e feed de eventos), fluxos de dados
// correndo das bordas para o centro sobre uma grade em perspectiva e uma borda de luz no cartão.
// Os números são ILUSTRATIVOS (a tela de login é pública: nenhum dado da empresa aparece aqui).
// Tudo vetorial (SVG e canvas na densidade da tela): nítido em qualquer monitor. A animação fica sempre ligada (decisão do dono, 28/09).
(()=>{
const calmo=false; // animação sempre ligada no login (decisão do dono, 28/09), mesmo com "reduzir movimento" no sistema
const rnd=(a,b)=>a+Math.random()*(b-a),escolha=l=>l[Math.floor(Math.random()*l.length)];
const brl=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2});
const int=v=>Math.round(v).toLocaleString('pt-BR');
const ICO={
 check:'<path d="M5 12.5l4.2 4.2L19 7"/>',
 bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
 doc:'<path d="M7 3h7l4 4v14H7z M14 3v4h4 M9.5 12h6 M9.5 16h6"/>',
 tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
 cash:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
 box:'<path d="M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8"/>',
 cam:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
 chat:'<path d="M4 5h16v11H9l-5 4z"/>'};
const svgI=(k,s=16)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</svg>`;

// Mapa do Brasil em ladrilhos (uma casa por estado).
const UFS=[['RR',2,0],['AP',4,0],['AM',1,1],['PA',3,1],['MA',5,1],['CE',6,1],['RN',7,1],['AC',0,2],['RO',1,2],['TO',4,2],['PI',5,2],['PE',6,2],['PB',7,2],
 ['MT',2,3],['DF',3,3],['GO',4,3],['BA',5,3],['SE',6,3],['AL',7,3],['MS',2,4],['MG',4,4],['ES',5,4],['SP',3,5],['RJ',4,5],['PR',3,6],['SC',3,7],['RS',3,8]];
const PESO={SP:30,MG:10,RJ:9,PR:7,SC:6,RS:6,BA:5,GO:4,PE:3,CE:3,DF:3,ES:2};
const sorteiaUF=()=>{const t=UFS.reduce((s,[u])=>s+(PESO[u]||1),0);let r=Math.random()*t;for(const [u] of UFS){r-=PESO[u]||1;if(r<=0)return u}return 'SP'};

const EVENTOS=[
 ()=>['check','Pedido faturado',`#${int(rnd(48000,49999))} · NF-e autorizada`],
 ()=>['cash','Repasse conciliado',brl(rnd(380,4200))],
 ()=>['tag','Etiquetas geradas',`${int(rnd(12,64))} pedidos · PDF único`],
 ()=>['box','Estoque sincronizado',`${int(rnd(90,140))} SKUs atualizados`],
 ()=>['cam','Conta lida por foto','Boleto · vence em '+int(rnd(3,28))+' dias'],
 ()=>['bolt','Contabilidade do dia','Diário e DRE atualizados'],
 ()=>['doc','Guia GNRE baixada',brl(rnd(90,860))+' · DIFAL'],
 ()=>['chat','Cliente respondido','Resposta pronta · 12 s']];

// Mapa real do Brasil (contornos do IBGE, em mapa-br.js): estados acendem com os pedidos, onda no destino e rota
// de entrega saindo de Santa Catarina (onde a loja está). Sem o arquivo do mapa, cai no ranking só com texto.
const ORIGEM='SC';
function mapaHTML(){return `<div class="jv-mapabox"><div class="jv-globobox"><canvas class="jv-globo" aria-label="Globo terrestre com o Brasil"></canvas><small>Terra: NASA Blue Marble</small></div><div class="jv-top"><ol data-k="top"></ol><div class="jv-sub">último pedido<br><b data-k="uf">SP</b></div></div></div>`}
function painel(cls,titulo,corpo){return `<section class="jv-p ${cls}"><div class="jv-h"><span class="jv-dot"></span>${titulo}</div>${corpo}</section>`}
function montar(auth){if(auth.querySelector('.vitrine'))return;
 const v=document.createElement('div');v.className='vitrine';v.setAttribute('aria-hidden','true');
 v.innerHTML=`<canvas class="jv-fundo"></canvas>
 <div class="jv-lado jv-esq">
  ${painel('jv-kpi','Vendas hoje',`<div class="jv-num" data-k="vendas">R$ 0,00</div><div class="jv-sub"><b data-k="ped">0</b> pedidos · <span class="jv-up" data-k="var">+0%</span> vs. ontem</div><svg class="jv-spark" viewBox="0 0 280 70" preserveAspectRatio="none"><defs><linearGradient id="jvg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><path class="jv-area" fill="url(#jvg1)"/><path class="jv-linha"/><circle class="jv-ponta" r="4"/></svg>`)}
  ${painel('jv-canais','Pedidos por canal',`<div class="jv-barras">${['Marketplaces','Loja própria','Atacado','Social'].map((c,i)=>`<div class="jv-barra"><span>${c}</span><i><b style="--i:${i}"></b></i><em data-k="c${i}">0</em></div>`).join('')}</div>`)}
  ${painel('jv-mapa','Pedidos pelo Brasil',mapaHTML())}
 </div>
 <div class="jv-lado jv-dir">
  ${painel('jv-feed','Jarvis em ação',`<ul class="jv-eventos"></ul>`)}
  ${painel('jv-conc','Conciliação de repasses',`<div class="jv-anelbox"><svg viewBox="0 0 120 120" class="jv-anel"><circle cx="60" cy="60" r="50" class="jv-trilho"/><circle cx="60" cy="60" r="50" class="jv-cheio" pathLength="100"/></svg><div><div class="jv-num jv-pct" data-k="conc">0%</div><div class="jv-sub">conferido ao centavo<br><b data-k="rep">0</b> repasses no mês</div></div></div>`)}
  ${painel('jv-fluxo','Fluxo de caixa · 30 dias',`<svg class="jv-fx" viewBox="0 0 300 110" preserveAspectRatio="none"><defs><linearGradient id="jvg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--jv2)" stop-opacity=".4"/><stop offset="1" stop-color="var(--jv2)" stop-opacity="0"/></linearGradient></defs><g class="jv-grade">${[22,50,78].map(y=>`<line x1="0" x2="300" y1="${y}" y2="${y}"/>`).join('')}</g><path class="jv-farea" fill="url(#jvg2)"/><path class="jv-flinha"/><line class="jv-cursor" y1="0" y2="110"/><circle class="jv-fponto" r="4.5"/></svg><div class="jv-sub">saldo projetado <b data-k="saldo">R$ 0</b></div>`)}
 </div>`;
 auth.prepend(v);setTimeout(()=>v.classList.add('on'),40);
 const $=s=>v.querySelector(s),K=k=>v.querySelector(`[data-k="${k}"]`);
 const cv=$('.jv-fundo'),ctx=cv.getContext('2d');let W=0,H=0,dpr=1,cx=0,cy=0,fluxos=[];
 const claro=document.body.classList.contains('light');
 function medir(){W=innerWidth;H=innerHeight;dpr=Math.min(2.5,devicePixelRatio||1);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
  const r=auth.querySelector('.authcard')?.getBoundingClientRect();cx=r?r.left+r.width/2:W/2;cy=r?r.top+Math.min(r.height/2,H/2):H/2;fluxos=novosFluxos()}

 // ── Fundo: grade em perspectiva + fluxos de dados das bordas até o cartão ──
 function novosFluxos(){const n=W<700?7:14,l=[];for(let i=0;i<n;i++){const lado=i%4,t=Math.random();
  const [x0,y0]=lado===0?[-40,H*t]:lado===1?[W+40,H*t]:lado===2?[W*t,-40]:[W*t,H+40];
  l.push({x0,y0,c1x:x0+(cx-x0)*.35+rnd(-160,160),c1y:y0+(cy-y0)*.2+rnd(-160,160),c2x:cx+rnd(-220,220),c2y:cy+rnd(-160,160),pulsos:[...Array(2)].map(()=>({t:Math.random(),v:rnd(.00008,.00018)}))})}return l}
 const bz=(f,t)=>{const u=1-t;return [u*u*u*f.x0+3*u*u*t*f.c1x+3*u*t*t*f.c2x+t*t*t*cx,u*u*u*f.y0+3*u*u*t*f.c1y+3*u*t*t*f.c2y+t*t*t*cy]};
 let off=0;
 function fundo(dt){ctx.clearRect(0,0,W,H);
  off=(off+dt*.012)%40;const hz=H*.62;ctx.lineWidth=1;
  for(let i=0;i<22;i++){const z=(i*40+off)/880,y=hz+(H-hz)*z*z;ctx.strokeStyle=claro?`rgba(20,90,110,${.10*z})`:`rgba(95,224,204,${.14*z})`;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  for(let i=-18;i<=18;i++){ctx.strokeStyle=claro?'rgba(20,90,110,.06)':'rgba(95,224,204,.07)';ctx.beginPath();ctx.moveTo(W/2+i*18,hz);ctx.lineTo(W/2+i*W/9,H);ctx.stroke()}
  for(const f of fluxos){ctx.strokeStyle=claro?'rgba(20,90,110,.07)':'rgba(120,230,215,.07)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(f.x0,f.y0);ctx.bezierCurveTo(f.c1x,f.c1y,f.c2x,f.c2y,cx,cy);ctx.stroke();
   for(const p of f.pulsos){p.t+=p.v*dt;if(p.t>1){p.t=0;p.v=rnd(.00008,.00018)}
    for(let k=0;k<14;k++){const t=p.t-k*.008;if(t<0)break;const [x,y]=bz(f,t),a=(1-k/14)*(t>.9?(1-t)*10:1);
     ctx.fillStyle=claro?`rgba(15,111,124,${.5*a})`:`rgba(150,245,230,${.75*a})`;ctx.beginPath();ctx.arc(x,y,k?1.4:2.4,0,6.283);ctx.fill()}}}}

 // ── Painéis (números ilustrativos) ──
 const est={vendas:rnd(38000,52000),ped:Math.round(rnd(310,420)),var:rnd(8,19),serie:[...Array(28)].map((_,i)=>30+i*1.6+rnd(-6,6)),canais:[rnd(60,90),rnd(20,40),rnd(10,25),rnd(5,15)],conc:0,alvoConc:rnd(98.2,99.8),rep:Math.round(rnd(1400,2300)),fx:[],fxi:0};
 {let s=rnd(180,240),v=0;for(let i=0;i<60;i++){v=v*.7+rnd(-4,6);s+=v;est.fx.push(s)}}
 const shown={vendas:0,ped:0};
 const curva=pts=>pts.map((p,i)=>{if(!i)return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;const a=pts[i-2]||pts[i-1],b=pts[i-1],c=p,d=pts[i+1]||p;return `C${(b[0]+(c[0]-a[0])/6).toFixed(1)},${(b[1]+(c[1]-a[1])/6).toFixed(1)} ${(c[0]-(d[0]-b[0])/6).toFixed(1)},${(c[1]-(d[1]-b[1])/6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`}).join("");
 function spark(){const s=est.serie,mx=Math.max(...s),mn=Math.min(...s),X=i=>i/(s.length-1)*280,Y=y=>64-(y-mn)/(mx-mn||1)*56;
  const d=curva(s.map((y,i)=>[X(i),Y(y)]));$('.jv-linha').setAttribute('d',d);$('.jv-area').setAttribute('d',d+'L280,70L0,70Z');
  const p=$('.jv-ponta');p.setAttribute('cx',280);p.setAttribute('cy',Y(s[s.length-1]).toFixed(1))}
 function canais(){const t=est.canais.reduce((a,b)=>a+b,0),bs=v.querySelectorAll('.jv-barra b');est.canais.forEach((c,i)=>{bs[i].style.width=Math.min(100,c/t*100*1.5).toFixed(1)+'%';K('c'+i).textContent=int(c/t*est.ped)})}
 function fluxoCaixa(){const s=est.fx.slice(est.fxi,est.fxi+31);if(s.length<31)return null;const mx=Math.max(...s),mn=Math.min(...s),X=i=>i/30*300,Y=y=>100-(y-mn)/(mx-mn||1)*84;
  const d=curva(s.map((y,i)=>[X(i),Y(y)]));$('.jv-flinha').setAttribute('d',d);$('.jv-farea').setAttribute('d',d+'L300,110L0,110Z');return {X,Y,s}}
 let fxGeo=fluxoCaixa();
 const feed=$('.jv-eventos');
 const porUF={};let globo=null,tGl=0;
 function pedidoNoMapa(u){porUF[u]=(porUF[u]||0)+1;globo?.pedido(u);
  const tot=Object.values(porUF).reduce((a,b)=>a+b,0),top=Object.entries(porUF).sort((a,b)=>b[1]-a[1]).slice(0,5),ol=K('top');
  if(ol)ol.innerHTML=top.map(([uf,n])=>`<li><span>${uf}</span><i><b style="width:${(n/top[0][1]*100).toFixed(0)}%"></b></i><em>${Math.round(n/tot*100)}%</em></li>`).join('')}
 // Começa com o mapa já movimentado (distribuição típica), para não abrir vazio.
 for(let i=0;i<60;i++){const u=sorteiaUF();porUF[u]=(porUF[u]||0)+1}
 function evento(){const [ic,t,d]=escolha(EVENTOS)();const li=document.createElement('li');li.innerHTML=`<span class="jv-ic">${svgI(ic)}</span><div><b>${t}</b><small>${d}</small></div><time>agora</time>`;
  feed.prepend(li);setTimeout(()=>li.classList.add('in'),20);[...feed.children].forEach((x,i)=>{if(i>0)x.querySelector('time').textContent=`há ${i*2+1} s`;if(i>3&&!x.classList.contains('out')){x.classList.add('out');setTimeout(()=>x.remove(),600)}});
  // Cada pedido acende um estado no mapa e soma nas vendas.
  if(ic==='check'||Math.random()<.5){const u=sorteiaUF();pedidoNoMapa(u);K('uf').textContent=u;
   est.ped++;est.vendas+=rnd(89,690);est.serie.push(est.serie[est.serie.length-1]+rnd(-3,7));est.serie.shift();est.canais[Math.random()<.7?0:Math.floor(rnd(1,4))]+=rnd(1,4);spark();canais()}}

 let tEv=0,tFx=0,tBr=0,ult=performance.now(),vivo=true,mx=0,my=0,tmx=0,tmy=0,cursor=0;
 addEventListener('pointermove',e=>{tmx=e.clientX/W-.5;tmy=e.clientY/H-.5},{passive:true});
 medir();addEventListener('resize',medir);spark();canais();globo=window.Globo?Globo(v.querySelector('.jv-globo'),{cor:getComputedStyle(document.body).getPropertyValue('--ar').trim().split(/\s+/).join(',')||'95,224,204'}):null;globo?.aquecer(porUF);pedidoNoMapa(sorteiaUF());addEventListener('resize',()=>globo?.medir());
 const lados=[...v.querySelectorAll('.jv-lado')];
 // Celular e telas estreitas: os painéis viram um carrossel em 3D no topo (um em destaque, os vizinhos inclinados),
 // trocando sozinho. Em tela larga, voltam para as duas colunas em volta do cartão.
 const estreita=matchMedia('(max-width:1079px)'),ORDEM=['jv-kpi','jv-feed','jv-mapa','jv-conc','jv-canais','jv-fluxo'];let trilha=null,idx=0,tCar=0;
 function arrumar(){const ps=[...v.querySelectorAll('.jv-p')];
  if(estreita.matches){if(!trilha){trilha=document.createElement('div');trilha.className='jv-trilha';trilha.innerHTML='<div class="jv-trilho-in"></div>';v.appendChild(trilha)}
   const dentro=trilha.firstChild;for(const c of ORDEM){const p=ps.find(x=>x.classList.contains(c));if(p)dentro.appendChild(p)}carrossel()}
  else if(trilha){const [e,d]=lados;for(const c of ['jv-kpi','jv-canais','jv-mapa']){const p=ps.find(x=>x.classList.contains(c));if(p)e.appendChild(p)}for(const c of ['jv-feed','jv-conc','jv-fluxo']){const p=ps.find(x=>x.classList.contains(c));if(p)d.appendChild(p)}trilha.remove();trilha=null}}
 function carrossel(){if(!trilha)return;const dentro=trilha.firstChild,ps=[...dentro.children];if(!ps.length)return;idx=(idx+ps.length)%ps.length;
  const w=ps[0].offsetWidth,gap=14,x=trilha.clientWidth/2-w/2-idx*(w+gap);dentro.style.transform=`translate3d(${x.toFixed(1)}px,0,0)`;
  ps.forEach((p,i)=>{const d=i-idx;p.classList.toggle('jv-ativo',d===0);p.style.setProperty('--d',Math.max(-2,Math.min(2,d)))})}
 estreita.addEventListener?.('change',arrumar);addEventListener('resize',carrossel);arrumar();
 function atualizar(dt){
  mx+=(tmx-mx)*.05;my+=(tmy-my)*.05;lados.forEach((l,i)=>{l.style.setProperty('--px',(mx*(i?-16:16)).toFixed(2)+'px');l.style.setProperty('--py',(my*-12).toFixed(2)+'px')});
  shown.vendas+=(est.vendas-shown.vendas)*.06;shown.ped+=(est.ped-shown.ped)*.08;K('vendas').textContent=brl(shown.vendas);K('ped').textContent=int(shown.ped);K('var').textContent='+'+est.var.toFixed(1).replace('.',',')+'%';
  est.conc+=(est.alvoConc-est.conc)*.025;K('conc').textContent=est.conc.toFixed(1).replace('.',',')+'%';$('.jv-cheio').style.strokeDashoffset=(100-est.conc).toFixed(2);K('rep').textContent=int(est.rep*est.conc/100);
  if(fxGeo){cursor=(cursor+(Number.isFinite(dt)?dt:0)*.00012)%1;if(!Number.isFinite(cursor))cursor=0;const i=cursor*30,a=Math.floor(i),f=i-a,y=fxGeo.s[a]+(fxGeo.s[Math.min(30,a+1)]-fxGeo.s[a])*f,x=fxGeo.X(i);
   const c=$('.jv-cursor');c.setAttribute('x1',x.toFixed(1));c.setAttribute('x2',x.toFixed(1));const p=$('.jv-fponto');p.setAttribute('cx',x.toFixed(1));p.setAttribute('cy',fxGeo.Y(y).toFixed(1));K('saldo').textContent=brl(y*1000).replace(/,\d\d$/,'')}
  tEv+=dt;if(tEv>2300){tEv=0;evento()}
  if(trilha){tCar+=dt;if(tCar>3200){tCar=0;idx++;carrossel()}}
  tFx+=dt;if(tFx>5200){tFx=0;est.fxi=(est.fxi+1)%29;fxGeo=fluxoCaixa()||fxGeo}
  tBr+=dt;if(tBr>900){tBr=0;globo?.esfriar()}
  // Globo a ~30 quadros/s, só quando o painel do mapa está na tela.
  tGl+=dt;if(tGl>32&&globo){tGl=0;const gc=v.querySelector('.jv-globo');if(gc&&gc.offsetParent&&gc.getBoundingClientRect().bottom>0)globo.quadro(performance.now())}}
 function passo(agora){if(!vivo)return;const dt=Math.min(64,agora-ult);ult=agora;
  if(!document.body.contains(v)){vivo=false;removeEventListener('resize',medir);return}
  if(!document.hidden){fundo(dt);atualizar(dt)}
  requestAnimationFrame(passo)}
 if(calmo){fundo(0);for(let i=0;i<4;i++)evento();shown.vendas=est.vendas;shown.ped=est.ped;est.conc=est.alvoConc;atualizar(0);v.querySelectorAll('.jv-eventos li').forEach(l=>l.classList.add('in'));return}
 for(let i=0;i<3;i++)setTimeout(evento,500+i*700);requestAnimationFrame(passo)}
new MutationObserver(()=>{const a=document.querySelector('#app .auth');if(a&&a.querySelector('#authForm'))montar(a)}).observe(document.documentElement,{childList:true,subtree:true});
})();
