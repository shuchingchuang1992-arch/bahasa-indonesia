self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW active');
});

self.addEventListener('fetch', (event) => {
  // 保持空白即可
});
