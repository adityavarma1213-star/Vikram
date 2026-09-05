/*
==========================================================
VIKRAM Investor Operating System
File : sw.js (Service Worker)
==========================================================
*/
const CACHE_NAME='vikram-cache-v3';
const CORE_FILES=['./index.html','./about.html','./accumulation.html','./css/style.css','./css/accumulation.css','./accumulation/config.js','./accumulation/engine.js','./accumulation/api.js','./js/companyDatabase.js','./js/technicalData.js','./js/financialData.js','./js/engine.js','./js/scoreEngine.js','./js/gauge.js','./js/valuationEngine.js','./js/riskEngine.js','./js/institutionEngine.js','./js/fundamentalEngine.js','./js/newsEngine.js','./js/frameworkEngine.js','./js/ui.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_FILES)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n!==CACHE_NAME).map(n=>caches.delete(n)))));self.clients.claim()});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.pathname.includes('/api/'))return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).catch(()=>new Response('Offline - this content is not cached yet.',{status:503}))));});
