// 离线缓存：手机有网时打开过一次，之后没信号也能打开页面。
// 改了 index.html 之后不用改这里：页面每次有网都会取最新的；只有改了这个文件的缓存规则才需要把版本号加 1。
const VERSION = 'hf-shell-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('hf-shell-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 信号很差时网络请求可能一直卡着，等 3 秒没回应就先用手机里存的
function withTimeout(promise, ms) {
  return new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(t); ok(r); }, err => { clearTimeout(t); bad(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname));

  // 页面：先上网拿最新的（顺便更新手机里的），没网或太慢就用存的
  if (isPage) {
    e.respondWith(
      withTimeout(fetch(req), 3000)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 图片、图标：手机里有就直接用，没有再上网拿并存起来
  if (url.origin === location.origin && /\.(png|jpe?g|webp|gif|svg|json)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open('hf-images').then(c => c.put(req, copy));
        }
        return res;
      }))
    );
  }
  // 其他请求（Google 表格后台）不经过缓存，每次都拿最新的
});
