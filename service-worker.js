// Лист: offline-first app shell. Личные финансовые данные не кэшируются и не отправляются.
const CACHE = 'list-finances-shell-v3-20261123';
const PREFIX = 'list-finances-shell-';
const ROOT = new URL('./', self.registration.scope).href;
const HOME = new URL('index.html', ROOT).href;
const OPTIONAL = ['manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];

async function prepareShell() {
  const cache = await caches.open(CACHE);
  // Главный HTML обязателен для установки офлайн-версии.
  const response = await fetch(new Request(HOME, {cache:'reload'}));
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) {
    throw new Error('Не удалось получить index.html для офлайн-режима');
  }
  await cache.put(HOME, response.clone());
  await cache.put(ROOT, response.clone());
  // Ошибка загрузки иконки не должна ломать офлайн-установку.
  await Promise.allSettled(OPTIONAL.map(path => cache.add(new URL(path, ROOT).href)));
}

self.addEventListener('install', event => {
  event.waitUntil(prepareShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(ROOT).pathname)) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const offlineCopy = await cache.match(HOME);
      if (offlineCopy) {
        // Важно: возвращаем файл немедленно, даже если устройство без сети.
        event.waitUntil(fetch(req).then(async response => {
          if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
            await cache.put(HOME, response.clone());
            await cache.put(ROOT, response.clone());
          }
        }).catch(() => {}));
        return offlineCopy;
      }
      try {
        const response = await fetch(req);
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
          await cache.put(HOME, response.clone());
          await cache.put(ROOT, response.clone());
        }
        return response;
      } catch (error) {
        return new Response('Нет доступа к приложению: сначала откройте его с интернетом.', {status:503, headers:{'content-type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {return await fetch(req);} catch(e) {return Response.error();}
  })());
});
