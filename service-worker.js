// List 2.0: offline-first app shell. No personal finance entries are cached here.
const CACHE='list-finances-shell-v4-20261123';
const PREFIX='list-finances-shell-';
const ROOT=self.registration.scope;
const HOME=new URL('index.html',ROOT).href;
const OPTIONAL=['manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
async function prepareShell(){
 const cache=await caches.open(CACHE);
 const response=await fetch(new Request(HOME,{cache:'reload'}));
 if(!response.ok||!(response.headers.get('content-type')||'').includes('text/html'))throw Error('HTML cache failed');
 await cache.put(HOME,response.clone()); await cache.put(ROOT,response.clone());
 await Promise.allSettled(OPTIONAL.map(path=>cache.add(new URL(path,ROOT).href)));
}
self.addEventListener('install',event=>event.waitUntil(prepareShell().then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin||!url.pathname.startsWith(new URL(ROOT).pathname))return;
 if(req.mode==='navigate'){
   event.respondWith((async()=>{
     const cache=await caches.open(CACHE),offline=await cache.match(HOME);
     if(offline){
       event.waitUntil(fetch(req).then(async res=>{
         if(res.ok&&(res.headers.get('content-type')||'').includes('text/html')){
           await cache.put(HOME,res.clone());await cache.put(ROOT,res.clone());
         }
       }).catch(()=>{}));
       return offline;
     }
     try{
       const res=await fetch(req);
       if(res.ok&&(res.headers.get('content-type')||'').includes('text/html')){
         await cache.put(HOME,res.clone());await cache.put(ROOT,res.clone());
       }
       return res;
     }catch{
       return new Response('Сначала откройте приложение с интернетом.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
     }
   })());return;
 }
 event.respondWith((async()=>{const cached=await caches.match(req);if(cached)return cached;try{return await fetch(req)}catch{return Response.error()}})());
});