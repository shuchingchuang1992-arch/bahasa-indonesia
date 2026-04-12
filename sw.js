// ══════════════════════════════════════════════════════════════
// sw.js — Belajar UKBI Madya Service Worker
//
// 策略：Cache First（離線優先）
//   - 第一次載入：從網路抓取並快取所有資源
//   - 之後每次：直接從快取回應，背景同步檢查更新
//   - 更新偵測：版本號變更時清除舊快取，通知主頁面
//
// LocalStorage 說明：
//   Service Worker 本身無法直接存取 LocalStorage（安全限制），
//   所有學習進度（ukbi_*）都由主頁面的 JS 直接讀寫 LocalStorage。
//   SW 僅負責網路資源快取，不干預進度資料。
//   透過 postMessage 機制，SW 可在更新時通知頁面顯示提示。
// ══════════════════════════════════════════════════════════════

// ── 版本控制 ──
// 每次更新 index.html 後，遞增此版本號即可觸發快取刷新
const CACHE_VERSION = 'belajar-v1.0.0';

// ── 需要快取的資源清單 ──
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  // Google Fonts（若使用者曾連線則會快取，離線時從此讀取）
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
];

// 字型檔案快取（動態快取，不在 precache 清單）
const FONT_CACHE = 'belajar-fonts-v1';

// ── 安裝事件：預快取核心資源 ──
self.addEventListener('install', event => {
  console.log('[SW] 安裝中，版本：', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        console.log('[SW] 預快取核心資源');
        // 逐一快取，單一失敗不影響其他資源
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] 快取失敗（可忽略）:', url, err.message)
            )
          )
        );
      })
      .then(() => {
        console.log('[SW] 安裝完成，立即啟用');
        // 跳過等待，立即接管頁面
        return self.skipWaiting();
      })
  );
});

// ── 啟用事件：清除舊版快取 ──
self.addEventListener('activate', event => {
  console.log('[SW] 啟用，清除舊快取');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        const deleteOld = cacheNames
          .filter(name =>
            name !== CACHE_VERSION &&
            name !== FONT_CACHE &&
            name.startsWith('belajar-')
          )
          .map(name => {
            console.log('[SW] 刪除舊快取:', name);
            return caches.delete(name);
          });
        return Promise.all(deleteOld);
      })
      .then(() => {
        console.log('[SW] 已接管所有客戶端');
        // 通知所有已開啟的頁面：SW 已更新
        return self.clients.claim();
      })
      .then(() => notifyClients({ type: 'SW_ACTIVATED', version: CACHE_VERSION }))
  );
});

// ── Fetch 事件：攔截所有網路請求 ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 只處理 GET 請求
  if (request.method !== 'GET') return;

  // Chrome 擴充功能請求不處理
  if (url.protocol === 'chrome-extension:') return;

  // ── 字型資源：Cache First，快取命中直接回應 ──
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(handleFontRequest(request));
    return;
  }

  // ── 同源資源（index.html、manifest.json 等）：Stale-While-Revalidate ──
  if (url.origin === self.location.origin) {
    event.respondWith(handleAppRequest(request));
    return;
  }

  // ── 其他外部資源：Network First，失敗則回傳快取 ──
  event.respondWith(handleNetworkFirst(request));
});

// ── 策略 1：Stale-While-Revalidate（App 核心資源）──
// 立即從快取回應，背景同步從網路更新快取
async function handleAppRequest(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  // 背景更新（不等待）
  const networkFetch = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // 有快取 → 立即回應；無快取 → 等待網路
  if (cached) {
    return cached;
  }
  return networkFetch || new Response('離線中，資源不可用', { status: 503 });
}

// ── 策略 2：Cache First（字型資源）──
async function handleFontRequest(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('字型載入失敗（離線中）', { status: 503 });
  }
}

// ── 策略 3：Network First（其他外部資源）──
async function handleNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    return cached || new Response('離線中，無快取可用', { status: 503 });
  }
}

// ── postMessage：通知主頁面 ──
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage(message));
}

// ── Message 事件：接收主頁面指令 ──
self.addEventListener('message', event => {
  const { data } = event;
  if (!data) return;

  switch (data.type) {
    // 主頁面要求 SW 跳過等待立即啟用
    case 'SKIP_WAITING':
      console.log('[SW] 收到 SKIP_WAITING 指令');
      self.skipWaiting();
      break;

    // 主頁面要求清除全部快取（用於「從頭開始」功能）
    case 'CLEAR_CACHE':
      caches.keys().then(names =>
        Promise.all(names.filter(n => n.startsWith('belajar-')).map(n => caches.delete(n)))
      ).then(() => {
        console.log('[SW] 快取已清除');
        event.source.postMessage({ type: 'CACHE_CLEARED' });
      });
      break;

    // 主頁面詢問目前快取版本
    case 'GET_VERSION':
      event.source.postMessage({ type: 'VERSION', version: CACHE_VERSION });
      break;

    default:
      console.log('[SW] 收到未知訊息:', data.type);
  }
});

// ── 背景同步（如瀏覽器支援）──
// 可用於未來擴充：在恢復網路時同步學習統計到遠端伺服器
self.addEventListener('sync', event => {
  if (event.tag === 'sync-progress') {
    console.log('[SW] 背景同步觸發：sync-progress');
    // 目前為純前端 LocalStorage 版本，無需同步到伺服器
    // 未來若需雲端儲存，在此加入 fetch() 邏輯
    event.waitUntil(Promise.resolve());
  }
});
