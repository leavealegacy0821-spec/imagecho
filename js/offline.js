// オフライン対応の画面側の係。
//  - サービスワーカー(sw.js)の登録
//  - 索引(data/index.json)の読み込みと控え
//  - 全単語ファイルをオフライン用に保存(データの版が変わったら入れ替え)

const INDEX_CACHE = 'imagecho-index';     // sw.js と同じ名前にすること
const WORDS_PREFIX = 'imagecho-words-';   // sw.js と同じ名前にすること
const SYNCED_KEY = 'imagecho:syncedVersion'; // 全単語を保存し終えたデータの版
const PARALLEL = 6;                       // 同時に取りにいく数

const hasCaches = typeof caches !== 'undefined';

function lsGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても動かす */ }
}

// 新しい版を出したのに、ホーム画面のアプリが古い画面のままになるのを防ぐ。
//  - 開いたとき・アプリに戻ってきたときに、新しい sw.js がないか確かめる
//  - 新しい版が働き始めたら、画面を1回だけ読み直して新しい画面にする
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller; // 初めて開いたときは読み直さない
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    const check = () => reg.update().catch(() => {});
    check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }).catch(() => { /* 登録できなくても通信があれば使える */ });
}

// 単語ファイルの場所(ファイル名は単語を小文字にしたもの)
export function wordUrl(word) {
  return new URL('data/words/' + encodeURIComponent(String(word).toLowerCase()) + '.json', location.href).href;
}

// 索引を読む。サービスワーカーがまだ働いていない初回でも次からオフラインで開けるよう、
// 画面側でも控えを取っておく。
export async function loadIndex() {
  const url = new URL('data/index.json', location.href).href;
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (hasCaches) {
      const copy = res.clone();
      caches.open(INDEX_CACHE).then((c) => c.put(url, copy)).catch(() => {});
    }
  } catch (e) {
    // 通信できない → 控えがあれば使う
    res = hasCaches ? await (await caches.open(INDEX_CACHE)).match(url) : null;
    if (!res) throw e;
  }
  return res.json();
}

let running = false;

// 全単語ファイルをオフライン用に保存する。
// データの版ごとに入れ物(キャッシュ)を分け、まだ入っていない分だけを取りにいくので、
// 途中で止まっても次回は続きからになる。全部そろったら古い版の入れ物を消す。
// report(done, total, state) … state は 'run'(保存中) / 'done'(完了) / 'paused'(途中で中断)
export async function syncWords(index, report) {
  if (!hasCaches || running) return;
  const version = String(index.version);
  if (lsGet(SYNCED_KEY) === version) return; // この版は保存済み
  running = true;
  try {
    const cacheName = WORDS_PREFIX + version;
    const cache = await caches.open(cacheName);
    const have = new Set((await cache.keys()).map((r) => r.url));
    const all = [...new Set(index.words.map((w) => wordUrl(w.word)))];
    const todo = all.filter((u) => !have.has(u));
    const total = all.length;
    let done = total - todo.length;
    let failStreak = 0; // 続けて失敗した数(通信が切れたと見なす目安)
    let stop = false;
    report(done, total, 'run');

    const worker = async () => {
      while (todo.length && !stop) {
        const url = todo.shift();
        try {
          // cache:'reload' … ブラウザの古い控えを使わず取り直す(sw.js もこの指定は素通しする)
          const res = await fetch(url, { cache: 'reload' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          await cache.put(url, res);
          done += 1;
          failStreak = 0;
          report(done, total, 'run');
        } catch (e) {
          failStreak += 1;
          if (failStreak >= PARALLEL) stop = true;
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    if (done >= total) {
      lsSet(SYNCED_KEY, version);
      // 古いデータ版の単語ファイルを捨てる(入れ替え)
      const names = await caches.keys();
      await Promise.all(names
        .filter((n) => n.startsWith(WORDS_PREFIX) && n !== cacheName)
        .map((n) => caches.delete(n)));
      report(done, total, 'done');
    } else {
      report(done, total, 'paused');
    }
  } catch (e) {
    /* 保存できない端末でも、通信があれば普通に使える */
  } finally {
    running = false;
  }
}
