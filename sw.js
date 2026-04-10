// 清除舊快取並啟動
self.addEventListener('install', (event) => {
  self.skipWaiting();
  console.log('Service Worker: 已安裝並跳過等待');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: 已啟動並準備接管');
});

// 基本的網路請求處理（確保不會噴錯）
self.addEventListener('fetch', (event) => {
  // 讓請求直接通過，不干擾連線
  event.respondWith(fetch(event.request));
});
