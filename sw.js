// Service Worker：
// - HTML（导航请求）：网络优先，离线时回退缓存 → 用户总能拿到新版本
// - 带内容 hash 的静态资源：缓存优先（文件名即版本，永不过期）
// 每次重新部署后无需改本文件；若要彻底清缓存，把 CACHE 名称改一下即可
const CACHE = 'banwei-runtime'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./index.html'])))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = e.request.url
  if (e.request.method !== 'GET' || !url.startsWith(self.location.origin)) return

  const isNavigation =
    e.request.mode === 'navigate' || url.endsWith('/index.html') || url.endsWith('/')

  if (isNavigation) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html'))
    )
    return
  }

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
          return res
        })
    )
  )
})
