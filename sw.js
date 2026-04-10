const CACHE_NAME = 'indo-v1';
const assets = ['/', '/index.html', '/style.css', '/script.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
localStorage.setItem('indo_progress', 'Lesson 5');
let lastLesson = localStorage.getItem('indo_progress');
