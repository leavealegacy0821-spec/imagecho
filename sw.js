// サービスワーカー:オフラインでも開けるようにする係。
//
// ★アプリの部品(html / css / js / アイコン / manifest)を書き換えたら、
//   下の APP_VERSION の数字を必ず1つ上げること。
//   上げると新しい部品を取り直し、古い部品のキャッシュは消える。
const APP_VERSION = 'v66';

const APP_CACHE = 'imagecho-app-' + APP_VERSION; // アプリの部品
const INDEX_CACHE = 'imagecho-index';            // data/index.json の控え
const WORDS_PREFIX = 'imagecho-words-';          // 単語ファイル(データの版ごと。画面側 js/offline.js が出し入れする)

// 先にキャッシュしておくアプリの部品(すべて相対パス)
const SHELL = [
  './',
  'css/style.css',
  'css/themes/b.css',
  'fonts/cormorantgaramond-var.woff2',
  'fonts/cormorantgaramond-italic-var.woff2',
  'js/app.js',
  'js/speech.js',
  'js/offline.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

// このアプリが置かれているフォルダ(サブフォルダ公開でも動くように実行時に求める)
const BASE = new URL('./', self.location).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.all(SHELL.map(async (path) => {
      // ブラウザの古い控えを使わず、必ずサーバーから取り直す
      let res = await fetch(new Request(path, { cache: 'reload' }));
      if (!res.ok) throw new Error('部品を取得できません: ' + path);
      // 転送された応答はページ表示に使えないので、中身だけ取り出して作り直す
      if (res.redirected) {
        res = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
      }
      await cache.put(path, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 古い版のアプリ部品だけを消す(単語ファイルと索引の控えは残す)
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith('imagecho-app-') && n !== APP_CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const rel = url.pathname.slice(BASE.length);

  if (rel === 'data/index.json') {
    event.respondWith(indexNetworkFirst(event));
    return;
  }
  if (rel.startsWith('data/words/')) {
    // 画面側が「取り直し」を指定したとき(オフライン用の保存)は手を出さない
    if (req.cache === 'reload' || req.cache === 'no-store') return;
    event.respondWith(wordCacheFirst(req));
    return;
  }
  if (rel.startsWith('data/')) return; // そのほかのデータはそのまま通信
  event.respondWith(shellCacheFirst(req));
});

// アプリの部品:キャッシュ優先
async function shellCacheFirst(req) {
  const cache = await caches.open(APP_CACHE);
  if (req.mode === 'navigate') {
    const page = await cache.match('./');
    if (page) return page;
  }
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  return fetch(req);
}

// 索引:通信優先。だめなら(または4秒待っても返らなければ)控えを使う
async function indexNetworkFirst(event) {
  const req = event.request;
  const cache = await caches.open(INDEX_CACHE);
  const cached = await cache.match(req.url);
  const network = fetch(req).then((res) => {
    if (res.ok) event.waitUntil(cache.put(req.url, res.clone()));
    return res;
  });
  if (!cached) return network;
  network.catch(() => {}); // 待ち切れずに控えを返したあとの失敗は無視
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
  try {
    const res = await Promise.race([network, timeout]);
    if (res && res.ok) return res;
  } catch (e) { /* 通信できない → 控えへ */ }
  return cached;
}

// 単語ファイル:キャッシュ優先
//  1. いちばん新しいデータ版のキャッシュにあればそれを返す
//  2. なければ通信で取る
//  3. 通信できなければ、古いデータ版のキャッシュから探す
async function wordCacheFirst(req) {
  const names = (await caches.keys()).filter((n) => n.startsWith(WORDS_PREFIX)).reverse();
  if (names.length) {
    const hit = await (await caches.open(names[0])).match(req.url);
    if (hit) return hit;
  }
  try {
    return await fetch(req);
  } catch (e) {
    for (const name of names.slice(1)) {
      const old = await (await caches.open(name)).match(req.url);
      if (old) return old;
    }
    throw e;
  }
}
