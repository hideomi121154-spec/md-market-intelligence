const CACHE_NAME = 'md-market-pwa-v1-9-20261030';
const SHELL = ['./','./index.html','./style.css?v=1.2','./storage.js?v=1.6','./app.js?v=1.6','./uss.js?v=1.2','./model-sales.css?v=1.4','./model-sales.js?v=1.3','./registered-sales.js?v=1.4','./audit.css?v=1.6','./valuation.css?v=1.5','./valuation.js?v=1.5','./demand-signals.css?v=1.7.1','./demand-signals.js?v=1.7.1','./data/demand_rankings.json','./kei-history.css?v=1.8','./kei-history.js?v=1.8','./data/kei_annual_history.json','./registered-history.css?v=1.9','./registered-history.js?v=1.9','./data/registered_annual_history.json','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(x=>x.startsWith('md-market-pwa-')&&x!==CACHE_NAME).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==self.location.origin) return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok && new URL(event.request.url).pathname.startsWith(new URL(self.registration.scope).pathname)) {
      const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone));
    }
    return response;
  }).catch(()=>caches.match(event.request).then(x=>x||caches.match('./index.html'))));
});