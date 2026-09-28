'use strict';
// Globo 3D do login: a Terra real (NASA Blue Marble, domínio público) aplicada ponto a ponto numa esfera com luz do
// sol e atmosfera, centrada no Brasil e balançando devagar. Por cima: contornos dos estados (IBGE) que acendem com os
// pedidos, feixes de luz subindo no destino e rotas em arco saindo da loja. Tudo no canvas, na densidade da tela.
// Uso: const g = Globo(canvas); g.pedido('SP'); g.quadro(agora); g.medir().
(()=>{
const RAD=Math.PI/180,LAT0=-14*RAD,S0=Math.sin(LAT0),C0=Math.cos(LAT0),LON_BASE=-52;
let tex=null,TW=0,TH=0,carregando=null;
function textura(){if(tex)return Promise.resolve();if(carregando)return carregando;
 carregando=new Promise(ok=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=TW=im.width;c.height=TH=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);tex=g.getImageData(0,0,TW,TH).data;ok()};im.onerror=()=>ok();im.src='brand/terra-nasa.jpg'});return carregando}
window.Globo=function(cv,opts={}){const ctx=cv.getContext('2d');const origem=opts.origem||'SC',cor=opts.cor||'95,224,204';
 let N=0,cx=0,cy=0,R=0,dpr=1,img=null,pix=null,row=null,lonRel=null,luz=null,borda=null,lon0=LON_BASE,pronto=false;
 const calor={},eventos=[];
 function medir(){const w=Math.round(cv.clientWidth||cv.parentElement?.clientWidth||200);if(!w)return;dpr=Math.min(2,devicePixelRatio||1);N=Math.round(w*dpr);cv.width=N;cv.height=N;
  R=N*.5;cx=N*.5;cy=N*.5;img=ctx.createImageData(N,N);
  const idx=[],rw=[],lr=[],lz=[],bd=[];const L=[-.45,.38,.81],Ln=Math.hypot(...L);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const nx=(x+.5-cx)/R,ny=(cy-y-.5)/R,d=nx*nx+ny*ny;if(d>=1)continue;const nz=Math.sqrt(1-d);
   const wy=ny*C0+nz*S0,wz=-ny*S0+nz*C0,lat=Math.asin(Math.max(-1,Math.min(1,wy)));idx.push((y*N+x)*4);rw.push(Math.min(TH-1,Math.max(0,Math.floor((90-lat/RAD)/180*TH))));lr.push(Math.atan2(nx,wz)/RAD);
   const dl=(nx*L[0]+ny*L[1]+nz*L[2])/Ln;lz.push(.22+.95*Math.max(0,dl)**.85);bd.push((1-nz)**3)}
  pix=Int32Array.from(idx);row=Int32Array.from(rw);lonRel=Float32Array.from(lr);luz=Float32Array.from(lz);borda=Float32Array.from(bd);pronto=!!tex}
 const proj=(lon,lat,alt=1)=>{const rel=(lon-lon0)*RAD,la=lat*RAD,cl=Math.cos(la),X=cl*Math.sin(rel),Y=Math.sin(la),Z=cl*Math.cos(rel);const ny=Y*C0-Z*S0,nz=Y*S0+Z*C0;return [cx+X*R*alt,cy-ny*R*alt,nz]};
 const vet=(lon,lat)=>{const la=lat*RAD,lo=lon*RAD;return [Math.cos(la)*Math.cos(lo),Math.sin(la),Math.cos(la)*Math.sin(lo)]};
 const geo=(v)=>[Math.atan2(v[2],v[0])/RAD,Math.asin(Math.max(-1,Math.min(1,v[1])))/RAD];
 function superficie(){const d=img.data,T=tex;for(let k=0;k<pix.length;k++){let lon=lonRel[k]+lon0;lon=((lon+180)%360+360)%360;const u=Math.min(TW-1,(lon/360*TW)|0),t=(row[k]*TW+u)*4,s=luz[k],b=borda[k],o=pix[k];
  // Cor do satélite × luz do sol; atmosfera azulada nas bordas.
  d[o]=Math.min(255,T[t]*s*1.08+b*70);d[o+1]=Math.min(255,T[t+1]*s*1.08+b*140);d[o+2]=Math.min(255,T[t+2]*s*1.12+b*255);d[o+3]=255}
  ctx.putImageData(img,0,0)}
 function atmosfera(){ctx.save();ctx.globalCompositeOperation='destination-over';const g=ctx.createRadialGradient(cx,cy,R*.97,cx,cy,R*1.12);g.addColorStop(0,'rgba(120,190,255,.55)');g.addColorStop(.35,'rgba(90,160,255,.18)');g.addColorStop(1,'rgba(60,120,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R*1.12,0,6.2832);ctx.fill();ctx.restore()}
 function estados(){const G=window.MapaBRGeo;if(!G)return;ctx.lineJoin='round';
  for(const [uf,polys] of Object.entries(G)){const h=calor[uf]||0;ctx.beginPath();let vis=false;
   for(const p of polys){for(let i=0;i<p.length;i+=2){const [x,y,z]=proj(p[i],p[i+1]);if(z>0)vis=true;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath()}
   if(!vis)continue;if(h>.3){ctx.fillStyle=`rgba(${cor},${(h*.42).toFixed(3)})`;ctx.fill()}
   ctx.strokeStyle=h>.3?`rgba(${cor},${(.55+h*.4).toFixed(3)})`:'rgba(255,255,255,.34)';ctx.lineWidth=(h>.3?1.3:.8)*dpr;ctx.stroke()}}
 function efeitos(agora){const C=window.MapaBRGeoCentro||{},o=C[origem];
  if(o){const [x,y,z]=proj(o[0],o[1]);if(z>0){const p=(agora/900)%1;ctx.fillStyle='#f5cf7a';ctx.shadowColor='#f5cf7a';ctx.shadowBlur=10*dpr;ctx.beginPath();ctx.arc(x,y,3.2*dpr,0,6.2832);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=`rgba(245,207,122,${1-p})`;ctx.lineWidth=1.4*dpr;ctx.beginPath();ctx.arc(x,y,(3+p*9)*dpr,0,6.2832);ctx.stroke()}}
  for(let i=eventos.length-1;i>=0;i--){const e=eventos[i],t=(agora-e.t0)/1800;if(t>=1){eventos.splice(i,1);continue}const c=C[e.uf];if(!c)continue;
   // Rota em arco (grande círculo) da loja até o destino, desenhada aos poucos e com brilho.
   if(o&&e.uf!==origem){const a=vet(o[0],o[1]),b=vet(c[0],c[1]),om=Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))),so=Math.sin(om)||1,fim=Math.min(1,t*1.7),n=28;
    ctx.beginPath();for(let k=0;k<=n;k++){const s=k/n*fim,wa=Math.sin((1-s)*om)/so,wb=Math.sin(s*om)/so,v=[a[0]*wa+b[0]*wb,a[1]*wa+b[1]*wb,a[2]*wa+b[2]*wb],[lo,la]=geo(v),[x,y]=proj(lo,la,1+.1*Math.sin(Math.PI*s));k?ctx.lineTo(x,y):ctx.moveTo(x,y)}
    ctx.strokeStyle=`rgba(245,207,122,${(t<.7?1:(1-t)/.3).toFixed(2)})`;ctx.lineWidth=1.8*dpr;ctx.shadowColor='#f5cf7a';ctx.shadowBlur=8*dpr;ctx.stroke();ctx.shadowBlur=0}
   // Feixe de luz subindo no estado do pedido + onda na superfície.
   const [x0,y0,z0]=proj(c[0],c[1]);if(z0<=0)continue;const sobe=Math.min(1,t*2.2),[x1,y1]=proj(c[0],c[1],1+.2*sobe),al=t<.6?1:(1-t)/.4;
   const g=ctx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,`rgba(${cor},${al})`);g.addColorStop(1,`rgba(${cor},0)`);ctx.strokeStyle=g;ctx.lineWidth=3*dpr;ctx.lineCap='round';ctx.shadowColor=`rgb(${cor})`;ctx.shadowBlur=12*dpr;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();ctx.shadowBlur=0;
   ctx.strokeStyle=`rgba(${cor},${(1-t).toFixed(2)})`;ctx.lineWidth=1.6*dpr;ctx.beginPath();ctx.ellipse(x0,y0,(2+t*16)*dpr,(1+t*8)*dpr,0,0,6.2832);ctx.stroke()}}
 function quadro(agora){if(!N)medir();if(!N||!tex)return;if(!pronto)medir();
  lon0=LON_BASE+9*Math.sin(agora*.00009)+3*Math.sin(agora*.00023);
  ctx.clearRect(0,0,N,N);superficie();atmosfera();estados();efeitos(agora)}
 textura().then(()=>{medir();quadro(performance.now())});
 return {medir,quadro,pedido(uf){calor[uf]=Math.min(1,(calor[uf]||0)+.35);eventos.push({uf,t0:performance.now()});if(eventos.length>6)eventos.shift()},
  aquecer(m){const mx=Math.max(1,...Object.values(m));for(const [u,n] of Object.entries(m))calor[u]=(n/mx)*.8},esfriar(){for(const u in calor)calor[u]=Math.max(0,calor[u]-.03)}}};
})();
