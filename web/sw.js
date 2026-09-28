// Service worker mínimo: permite instalar o Jarvis como aplicativo. Não guarda dados nem páginas
// em cache (tudo vem sempre da rede), para nunca mostrar versão antiga nem informação desatualizada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// Alertas no celular: mostra a notificação enviada pelo servidor e abre o Jarvis na tela certa ao tocar.
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'Jarvis', corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Jarvis', { body: d.corpo || '', tag: d.tag || undefined, icon: 'brand/comprastore-logo-240.png', badge: 'brand/comprastore-logo-240.png', data: { url: d.url || '#central' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = new URL(e.notification.data?.url || '#central', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => { for (const w of ws) { if ('focus' in w) { w.navigate(alvo); return w.focus(); } } return self.clients.openWindow(alvo); }));
});
