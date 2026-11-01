const CACHE_NAME = 'md-market-pwa-v3-6-0-20261101';
const SHELL = ['./','./index.html','./style.css?v=1.2','./storage.js?v=2.0.1','./app.js?v=2.0.2','./personal-car.js?v=2.5.0','./personal-car.css?v=2.5.0','./fault-risk.js?v=2.6.0','./fault-risk.css?v=2.6.0','./fault-research.js?v=2.8.0','./fault-research.css?v=2.7.0','./data/fault-research-index.json','./offline-data.js?v=2.0.3','./market-warning.js?v=2.9.0','./market-warning.css?v=2.9.0','./regional-jobs.js?v=3.0.0','./regional-jobs.css?v=3.0.0','./prefecture-jobs.js?v=3.3.0','./prefecture-jobs.css?v=3.3.0','./data/prefecture_jobs.json','./residual-gap.js?v=3.1.0','./residual-gap.css?v=3.1.0','./residual-maturity.js?v=3.2.0','./residual-maturity.css?v=3.2.0','./data/regional_job_ads.json','./uss.js?v=2.0.3','./model-sales.css?v=1.4','./model-sales.js?v=2.0.3','./registered-sales.js?v=2.0.3','./audit.css?v=1.6','./valuation.css?v=1.5','./md-risk.css?v=2.2.0','./valuation.js?v=2.2.0','./md-risk.js?v=2.2.0','./demand-signals.css?v=1.7.1','./demand-signals.js?v=2.0.3','./data/demand_rankings.json','./kei-history.css?v=1.8','./history-trend.js?v=3.4.0','./history-fold.css?v=3.4.0','./kei-history.js?v=3.4.0','./data/kei_annual_history.json','./registered-history.css?v=1.9','./registered-history.js?v=3.4.0','./inventory-observations.css?v=2.1.0','./md-evidence.css?v=2.1.0','./inventory-observations.js?v=2.1.0','./md-evidence.js?v=3.6.0','./model-price-report.css?v=2.3.0','./model-price-report.js?v=2.3.0','./observation-watch.js?v=2.4.0','./observation-watch.css?v=2.4.0','./data/registered_annual_history.json','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(x=>x.startsWith('md-market-pwa-')&&x!==CACHE_NAME).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==self.location.origin) return;
  const cached=()=>caches.match(event.request).then(x=>x||(event.request.mode==='navigate'?caches.match('./index.html'):Response.error()));
  // A known-offline iPhone must not try network fetch before its cached app shell.
  if(self.navigator && self.navigator.onLine===false){event.respondWith(cached());return;}
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok && new URL(event.request.url).pathname.startsWith(new URL(self.registration.scope).pathname)) {
      const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone));
    }
    return response;
  }).catch(cached));
});