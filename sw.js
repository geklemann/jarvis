// Service worker mínimo: permite instalar o Jarvis como aplicativo. Não guarda dados nem páginas
// em cache (tudo vem sempre da rede), para nunca mostrar versão antiga nem informação desatualizada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
