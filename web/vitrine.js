'use strict';
// Tela de entrada viva: os brinquedos mais vendidos, recortados do fundo branco, flutuam soltos em profundidades
// diferentes (os de trás desfocados), desviam do cartão de login, reagem ao mouse e, de tempos em tempos, somem
// num brilho e rematerializam em outro ponto com outro produto. Ao fundo, uma rede de partículas (a "mente" do
// Jarvis) e anéis holográficos girando atrás do cartão. Lê produtos/vitrine.json (bucket público).
// Sem fotos, flutuam brinquedos desenhados em traço de luz. Respeita "reduzir movimento".
(()=>{
const URL_V=(window.CONCILIA_CONFIG?.supabaseUrl||'')+'/storage/v1/object/public/produtos/vitrine.json';
const calmo=matchMedia('(prefers-reduced-motion: reduce)').matches;
let pool=null,buscando=null;
const TOYS={
 carro:'<path d="M8 38h48M12 38v-8l8-10h22l10 10h4v8"/><circle cx="20" cy="40" r="5"/><circle cx="46" cy="40" r="5"/><path d="M24 20v10M38 20l6 10"/>',
 quadri:'<circle cx="16" cy="42" r="8"/><circle cx="48" cy="42" r="8"/><path d="M16 42l10-16h14l8 16M26 26l-4-8h8M40 26l4-6"/>',
 bola:'<circle cx="32" cy="32" r="18"/><path d="M14 32h36M32 14c8 6 8 30 0 36M32 14c-8 6-8 30 0 36"/>',
 urso:'<circle cx="32" cy="36" r="14"/><circle cx="20" cy="20" r="6"/><circle cx="44" cy="20" r="6"/><circle cx="27" cy="33" r="1.5"/><circle cx="37" cy="33" r="1.5"/><path d="M28 41c3 3 5 3 8 0"/>',
 blocos:'<rect x="10" y="30" width="18" height="18" rx="2"/><rect x="30" y="30" width="18" height="18" rx="2"/><rect x="20" y="12" width="18" height="18" rx="2"/>',
 foguete:'<path d="M32 8c10 8 12 20 8 32H24c-4-12-2-24 8-32z"/><circle cx="32" cy="24" r="4"/><path d="M24 40l-8 8h10M40 40l8 8H38M28 46h8"/>',
 pipa:'<path d="M32 8l14 18-14 22-14-22z"/><path d="M32 8v40M18 26h28M32 48c-2 4 2 6 0 10"/>',
 cavalinho:'<path d="M14 50c10 4 26 4 36 0M20 46l4-14h16l4 14M24 32l-4-12 8 4h8l6 6"/><circle cx="38" cy="22" r="1.5"/>'};
const CORES=['#5fe0cc','#ff9a7a','#8fbfff','#f5cf7a','#c3b0ff','#7ef0a8'];

// Recorte: apaga o fundo branco a partir das bordas (preenchimento por inundação), suaviza a borda, corta no
// contorno do produto e mede a cor dominante (vira o brilho em volta dele).
function recortar(src){return new Promise(ok=>{const img=new Image();img.crossOrigin='anonymous';img.decoding='async';
 img.onload=()=>{try{const S=300,k=S/Math.max(img.width,img.height),w=Math.max(1,Math.round(img.width*k)),h=Math.max(1,Math.round(img.height*k));
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,w,h);
  const d=g.getImageData(0,0,w,h),p=d.data,fundo=new Uint8Array(w*h),fila=new Int32Array(w*h);let ini=0,fim=0;
  const claro=i=>{const r=p[i*4],gg=p[i*4+1],b=p[i*4+2],mx=Math.max(r,gg,b),mn=Math.min(r,gg,b);return mx>226&&mx-mn<26};
  const semear=i=>{if(!fundo[i]&&claro(i)){fundo[i]=1;fila[fim++]=i}};
  for(let x=0;x<w;x++){semear(x);semear((h-1)*w+x)}for(let y=0;y<h;y++){semear(y*w);semear(y*w+w-1)}
  while(ini<fim){const i=fila[ini++],x=i%w,y=(i/w)|0;if(x>0)semear(i-1);if(x<w-1)semear(i+1);if(y>0)semear(i-w);if(y<h-1)semear(i+w)}
  let x0=w,y0=h,x1=0,y1=0,n=0,R=0,G=0,B=0,cn=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(fundo[i]){p[i*4+3]=0;continue}n++;
   if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
   const borda=(x>0&&fundo[i-1])||(x<w-1&&fundo[i+1])||(y>0&&fundo[i-w])||(y<h-1&&fundo[i+w]);if(borda)p[i*4+3]=120;
   const r=p[i*4],gg=p[i*4+1],b=p[i*4+2],sat=Math.max(r,gg,b)-Math.min(r,gg,b);if(sat>60){R+=r;G+=gg;B+=b;cn++}}
  if(n<w*h*.04)return ok(null);
  g.putImageData(d,0,0);const cw=x1-x0+1,ch=y1-y0+1,o=document.createElement('canvas');o.width=cw;o.height=ch;o.getContext('2d').drawImage(c,x0,y0,cw,ch,0,0,cw,ch);
  ok({el:o,cor:cn?`rgb(${R/cn|0},${G/cn|0},${B/cn|0})`:'#5fe0cc',ar:cw/ch})}catch{ok(null)}};
 img.onerror=()=>ok(null);img.src=src})}
function buscar(){if(pool)return Promise.resolve(pool);if(buscando)return buscando;
 buscando=fetch(URL_V,{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(async j=>{const ps=(j?.produtos||[]).filter(p=>p.img).slice(0,18);
  const rs=await Promise.all(ps.map(p=>recortar(p.img).then(r=>r&&{...r,nome:String(p.nome||'')})));pool=rs.filter(Boolean);return pool}).catch(()=>{pool=[];return pool});return buscando}
function brinquedos(){return Object.keys(TOYS).map((k,i)=>{const cor=CORES[i%CORES.length],s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 64 64');s.innerHTML=`<g fill="none" stroke="${cor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${TOYS[k]}</g>`;return {el:s,cor,ar:1,nome:'',toy:true}})}

const rnd=(a,b)=>a+Math.random()*(b-a);
function montar(auth){if(auth.querySelector('.vitrine'))return;
 const v=document.createElement('div');v.className='vitrine';v.setAttribute('aria-hidden','true');
 v.innerHTML=`<canvas class="vt-rede"></canvas><div class="vt-aneis"><svg viewBox="0 0 800 800"><circle class="a1" cx="400" cy="400" r="380"/><circle class="a2" cx="400" cy="400" r="330"/><circle class="a3" cx="400" cy="400" r="290"/><g class="a4"><path d="M400 30a370 370 0 0 1 262 108"/><path d="M400 770a370 370 0 0 1-262-108"/></g></svg></div><div class="vt-palco"></div>`;
 auth.prepend(v);requestAnimationFrame(()=>v.classList.add('on'));
 const cv=v.querySelector('.vt-rede'),ctx=cv.getContext('2d'),palco=v.querySelector('.vt-palco'),aneis=v.querySelector('.vt-aneis');
 let W=0,H=0,dpr=1,card={x:0,y:0,w:0,h:0},mx=0,my=0,tmx=0,tmy=0,vivo=true,ult=performance.now(),tCard=0;
 const cor=getComputedStyle(document.body).getPropertyValue('--accent').trim()||'#5fe0cc',claroTema=document.body.classList.contains('light');
 function medir(){W=innerWidth;H=innerHeight;dpr=Math.min(2,devicePixelRatio||1);cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0);lerCard()}
 function lerCard(){const c=auth.querySelector('.authcard');if(!c)return;const r=c.getBoundingClientRect();card={x:r.left,y:r.top,w:r.width,h:r.height};aneis.style.left=(r.left+r.width/2)+'px';aneis.style.top=(r.top+Math.min(r.height/2,H/2))+'px'}
 medir();addEventListener('resize',medir);
 addEventListener('pointermove',e=>{tmx=(e.clientX/W-.5)*2;tmy=(e.clientY/H-.5)*2},{passive:true});

 // Rede de partículas: pontos que vagam devagar e se ligam quando ficam perto; o mouse atrai de leve.
 const NP=Math.round(Math.min(90,W*H/17000)),pts=[...Array(NP)].map(()=>({x:rnd(0,W),y:rnd(0,H),vx:rnd(-.12,.12),vy:rnd(-.12,.12),r:rnd(.6,1.8)}));
 function rede(dt){ctx.clearRect(0,0,W,H);const mxp=(tmx/2+.5)*W,myp=(tmy/2+.5)*H;
  for(const p of pts){if(!calmo){const dx=mxp-p.x,dy=myp-p.y,dd=dx*dx+dy*dy;if(dd<200*200){p.vx+=dx*2e-6*dt;p.vy+=dy*2e-6*dt}p.vx*=.995;p.vy*=.995;p.x+=p.vx*dt*.06;p.y+=p.vy*dt*.06;
   if(p.x<-20)p.x=W+20;if(p.x>W+20)p.x=-20;if(p.y<-20)p.y=H+20;if(p.y>H+20)p.y=-20;if(Math.abs(p.vx)+Math.abs(p.vy)<.05){p.vx=rnd(-.12,.12);p.vy=rnd(-.12,.12)}}}
  ctx.lineWidth=.7;for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const a=pts[i],b=pts[j],dx=a.x-b.x,dy=a.y-b.y,dd=dx*dx+dy*dy;if(dd<130*130){ctx.strokeStyle=claroTema?`rgba(20,90,110,${(1-Math.sqrt(dd)/130)*.18})`:`rgba(120,230,215,${(1-Math.sqrt(dd)/130)*.16})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
  ctx.fillStyle=claroTema?'rgba(20,90,110,.45)':'rgba(170,245,235,.55)';for(const p of pts){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fill()}
  // Fios de luz do produto mais próximo às partículas vizinhas: o produto "conectado" à rede.
  for(const it of itens){if(it.fase!=='vivo'||it.z<.55)continue;let n=0;for(const p of pts){const dx=p.x-it.cx,dy=p.y-it.cy,dd=dx*dx+dy*dy;if(dd<150*150&&n<3){n++;ctx.strokeStyle=`rgba(150,240,225,${(1-Math.sqrt(dd)/150)*.22*it.alfa})`;ctx.beginPath();ctx.moveTo(it.cx,it.cy);ctx.lineTo(p.x,p.y);ctx.stroke()}}}}

 // Produtos flutuando. Cada um nasce num ponto livre, vaga numa trajetória orgânica (soma de senoides com fases
 // próprias), desvia do cartão e, depois de 14–30 s, se desfaz num brilho para renascer em outro lugar.
 const itens=[];let fonte=[],fila=[];
 const alvoN=()=>W<700?5:W<1100?8:12;
 function proximo(){if(!fila.length)fila=[...fonte].sort(()=>Math.random()-.5);return fila.pop()}
 function livre(tam){for(let t=0;t<40;t++){const x=rnd(tam*.3,W-tam*.3),y=rnd(tam*.3,H-tam*.3);
  const m=40;if(x>card.x-tam/2-m&&x<card.x+card.w+tam/2+m&&y>card.y-tam/2-m&&y<card.y+card.h+tam/2+m)continue;
  if(itens.some(o=>o.fase!=='morto'&&Math.hypot(o.bx-x,o.by-y)<(o.tam+tam)*.55))continue;return [x,y]}return [rnd(0,W),rnd(0,H)]}
 function nascer(){const f=proximo();if(!f)return;const z=Math.random()**.8,base=W<700?100:W<1400?140:165,tam=base*(.5+.75*z);const [x,y]=livre(tam);
  const el=document.createElement('div');el.className='vt-p nasce';const alt=tam/Math.max(f.ar,.6);
  el.style.cssText=`width:${tam}px;height:${alt}px;--cor:${f.cor};--blur:${((1-z)*2.6).toFixed(2)}px;z-index:${Math.round(z*10)}`;
  const midia=f.el.cloneNode(true);if(midia.tagName==='CANVAS')midia.getContext('2d').drawImage(f.el,0,0);el.appendChild(midia);
  if(f.nome){const s=document.createElement('span');s.textContent=f.nome;el.appendChild(s)}
  palco.appendChild(el);
  const it={el,z,tam,alt,bx:x,by:y,cx:x,cy:y,ph:[rnd(0,6.3),rnd(0,6.3),rnd(0,6.3),rnd(0,6.3)],fr:[rnd(.05,.11),rnd(.07,.14),rnd(.04,.09),rnd(.06,.12)],amp:rnd(40,110)*(.6+z*.6),rot:rnd(-14,14),vida:rnd(14e3,30e3),t:0,fase:'vivo',alfa:1,
   deriva:[rnd(-.012,.012),rnd(-.01,.01)],pausa:false};
  el.onpointerenter=()=>{it.pausa=true;el.classList.add('foco')};el.onpointerleave=()=>{it.pausa=false;el.classList.remove('foco')};
  el.addEventListener('animationend',()=>el.classList.remove('nasce'),{once:true});itens.push(it)}
 function morrer(it){it.fase='morto';it.el.classList.add('some');setTimeout(()=>it.el.remove(),1400)}
 function passo(agora){if(!vivo)return;const dt=Math.min(64,agora-ult);ult=agora;
  if(!document.body.contains(v)){vivo=false;removeEventListener('resize',medir);return}
  if(agora-tCard>600){tCard=agora;lerCard()}
  mx+=(tmx-mx)*.04;my+=(tmy-my)*.04;
  if(!document.hidden){rede(dt);
   for(const it of itens){if(it.fase==='morto')continue;if(!it.pausa)it.t+=dt;const s=it.t/1000;
    it.bx+=it.deriva[0]*dt*(.5+it.z);it.by+=it.deriva[1]*dt*(.5+it.z);
    let x=it.bx+Math.sin(s*it.fr[0]+it.ph[0])*it.amp+Math.sin(s*it.fr[1]*1.7+it.ph[1])*it.amp*.35,
        y=it.by+Math.cos(s*it.fr[2]+it.ph[2])*it.amp*.8+Math.sin(s*it.fr[3]*1.3+it.ph[3])*it.amp*.3;
    // Desvia do cartão: empurra a base para fora quando a trajetória invade a área do login.
    const m=30,l=card.x-it.tam/2-m,r=card.x+card.w+it.tam/2+m,tp=card.y-it.alt/2-m,bt=card.y+card.h+it.alt/2+m;
    if(x>l&&x<r&&y>tp&&y<bt){const esc=[x-l,r-x,y-tp,bt-y],k=esc.indexOf(Math.min(...esc)),f=.04*dt;if(k===0)it.bx-=f;else if(k===1)it.bx+=f;else if(k===2)it.by-=f;else it.by+=f}
    // Mantém dentro da tela com uma mola suave.
    if(it.bx<it.tam*.2)it.bx+=.03*dt;if(it.bx>W-it.tam*.2)it.bx-=.03*dt;if(it.by<it.alt*.2)it.by+=.03*dt;if(it.by>H-it.alt*.2)it.by-=.03*dt;
    const px=mx*(it.z-.4)*-38,py=my*(it.z-.4)*-26;it.cx=x+px;it.cy=y+py;
    const rot=it.rot+Math.sin(s*.3+it.ph[1])*7;
    it.el.style.transform=`translate3d(${(it.cx-it.tam/2).toFixed(1)}px,${(it.cy-it.alt/2).toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg)`;
    if(it.t>it.vida&&!it.pausa)morrer(it)}
   // Espaço pessoal: produtos próximos se afastam devagar (ninguém encosta em ninguém).
   for(let i=0;i<itens.length;i++)for(let j=i+1;j<itens.length;j++){const a=itens[i],b=itens[j];if(a.fase!=='vivo'||b.fase!=='vivo')continue;const dx=a.cx-b.cx,dy=a.cy-b.cy,d=Math.hypot(dx,dy)||1,min=(Math.max(a.tam,a.alt)+Math.max(b.tam,b.alt))*.52;if(d<min){const f=(min-d)/min*.22*dt,ux=dx/d,uy=dy/d;a.bx+=ux*f;a.by+=uy*f;b.bx-=ux*f;b.by-=uy*f}}
   for(let i=itens.length-1;i>=0;i--)if(itens[i].fase==='morto'&&!document.body.contains(itens[i].el))itens.splice(i,1);
   const vivos=itens.filter(i=>i.fase==='vivo').length;if(vivos<alvoN()&&Math.random()<.02*dt/16)nascer()}
  requestAnimationFrame(passo)}
 const iniciar=f=>{fonte=f;if(calmo){for(let i=0;i<alvoN();i++)nascer();for(const it of itens){it.el.classList.remove('nasce');it.el.style.transform=`translate3d(${it.bx-it.tam/2}px,${it.by-it.alt/2}px,0) rotate(${it.rot}deg)`}rede(0);return}
  for(let i=0;i<Math.ceil(alvoN()*.6);i++)setTimeout(nascer,i*260);requestAnimationFrame(passo)};
 rede(0);buscar().then(p=>iniciar(p.length>=5?p:brinquedos()))}
new MutationObserver(()=>{const a=document.querySelector('#app .auth');if(a&&a.querySelector('#authForm'))montar(a)}).observe(document.documentElement,{childList:true,subtree:true});
})();
