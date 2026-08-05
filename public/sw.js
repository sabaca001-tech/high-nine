/**
 * Service Worker。
 *
 * ビルドごとにファイル名のハッシュが変わるため、事前に一覧を焼き込まず
 * 「取得したものを都度キャッシュする」方式にしている。
 * これでビルド構成に依存せずオフラインで動く。
 *
 * パスは**すべて相対**にしてある。GitHub Pages のように
 * `https://例.github.io/リポジトリ名/` というサブパスで配信されても、
 * この SW 自身の場所を基準に解決されるので壊れない。
 */
const CACHE = 'hs-baseball-sim-v3'
/** オフラインでも起動できるよう、最低限これだけは先に入れておく */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png']

/** 配信されている場所（サブパス配信でも正しく解決するために使う） */
const INDEX_URL = new URL('./index.html', self.location.href).href

self.addEventListener('install', (event) => {
  // **待機したまま止まる。** ここで skipWaiting すると、
  // 画面に古い JS が載ったまま新しい SW が配信を始めてしまう。
  // 差し替えるのはページ側が「更新する」を選んだとき（SKIP_WAITING）
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
})

/** ページから「いま切り替えてよい」と言われたら差し替える */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  // 画面遷移はネットワーク優先。オフラインならキャッシュした index.html を返す
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(INDEX_URL, copy))
          return response
        })
        .catch(() => caches.match(INDEX_URL).then((cached) => cached ?? Response.error())),
    )
    return
  }

  // それ以外はキャッシュ優先。裏で更新しておく（stale-while-revalidate）
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached ?? Response.error())

      return cached ?? network
    }),
  )
})
