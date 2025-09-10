const CACHE_NAME = 'cocktail-app-v1.0.0';
const STATIC_CACHE = 'cocktail-static-v1.0.0';
const DYNAMIC_CACHE = 'cocktail-dynamic-v1.0.0';

// 需要快取的靜態資源
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

// 安裝 Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker 安裝中...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('快取靜態資源...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return self.skipWaiting(); // 立即啟用新版本
      })
      .catch((error) => {
        console.error('安裝 Service Worker 失敗:', error);
      })
  );
});

// 啟用 Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker 啟用中...');
  
  event.waitUntil(
    Promise.all([
      // 清理舊快取
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('刪除舊快取:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // 立即控制所有客戶端
      self.clients.claim()
    ])
  );
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 忽略 Chrome extension 請求
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // 忽略 data: URL
  if (url.protocol === 'data:') {
    return;
  }

  // 處理 HTML 頁面 - 網路優先，失敗時使用快取
  if (request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 處理靜態資源 - 快取優先
  if (STATIC_ASSETS.some(asset => {
    try {
      return url.href.includes(asset) || url.pathname.endsWith(asset);
    } catch (e) {
      return false;
    }
  })) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 處理圖片資源 - 快取優先
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 處理其他資源 - 網路優先
  event.respondWith(networkFirst(request));
});

// 快取優先策略
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      // 只快取成功的 GET 請求
      if (request.method === 'GET') {
        cache.put(request, networkResponse.clone());
      }
    }
    return networkResponse;
  } catch (error) {
    console.error('快取優先策略失敗:', error);
    
    // 嘗試返回快取的版本
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 如果是圖片請求，返回一個佔位符
    if (request.destination === 'image') {
      return new Response('', {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'image/svg+xml'
        }
      });
    }

    return new Response('離線模式下無法載入此資源', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }
}

// 網路優先策略
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      // 只快取成功的 GET 請求
      if (request.method === 'GET') {
        cache.put(request, networkResponse.clone());
      }
    }
    return networkResponse;
  } catch (error) {
    console.error('網路請求失敗，嘗試使用快取:', error);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }

    // 如果是 HTML 請求且沒有快取，返回主頁面
    if (request.destination === 'document') {
      const mainPage = await caches.match('./');
      if (mainPage) {
        return mainPage;
      }
    }

    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>離線模式</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            padding: 50px 20px;
            min-height: 100vh;
            margin: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          .icon { font-size: 4rem; margin-bottom: 20px; }
          h1 { margin: 20px 0; }
          p { opacity: 0.8; line-height: 1.6; max-width: 400px; }
          .retry-btn {
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            margin-top: 20px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="icon">📡</div>
        <h1>目前處於離線模式</h1>
        <p>無法連接到網路，但您仍可以使用已快取的功能。請檢查網路連線後重試。</p>
        <button class="retry-btn" onclick="window.location.reload()">重新載入</button>
      </body>
      </html>
    `, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }
}

// 清理過期快取
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// 限制快取大小
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    // 刪除最舊的項目
    const deleteCount = keys.length - maxItems;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// 定期清理快取
setInterval(() => {
  limitCacheSize(DYNAMIC_CACHE, 50);
}, 60000); // 每分鐘檢查一次