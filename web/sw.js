// Service worker: permite instalar o Jarvis como aplicativo e acelera a abertura.
// Guarda no aparelho só os arquivos do site que têm versão no endereço (scripts e estilos "?v=…"): eles nunca mudam,
// porque cada publicação carimba uma versão nova e o navegador busca o arquivo novo. A página, os dados e tudo o que
// vem de outro servidor (banco, integrações) continuam vindo sempre da rede — nada de informação desatualizada.
const CACHE = 'jarvis-estatico-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('jarvis-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || !u.searchParams.has('v')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE), salvo = await c.match(e.request);
    if (salvo) return salvo;
    const r = await fetch(e.request);
    if (r.ok) {
      await c.put(e.request, r.clone());
      // Remove as versões antigas do mesmo arquivo, para o cache não crescer a cada publicação.
      for (const k of await c.keys()) { const x = new URL(k.url); if (x.pathname === u.pathname && x.search !== u.search) await c.delete(k); }
    }
    return r;
  })());
});

// Alertas no celular: mostra a notificação enviada pelo servidor e abre o Jarvis na tela certa ao tocar.
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'Jarvis', corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Jarvis', { body: d.corpo || '', tag: d.tag || undefined, icon: 'brand/jarvis-192.png', badge: 'brand/jarvis-192.png', data: { url: d.url || '#central' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = new URL(e.notification.data?.url || '#central', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => { for (const w of ws) { if ('focus' in w) { w.navigate(alvo); return w.focus(); } } return self.clients.openWindow(alvo); }));
});
