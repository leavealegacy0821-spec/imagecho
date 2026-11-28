// 端末間の同期:「苦手・覚えた」「自分のまとまり」「めくった位置」を Cloudflare の裏側(worker/)に預け、
// ほかの端末と同じ中身にする。
//
// しくみ
//   - 同期キー:端末で作る長い乱数。同じキーを入れた端末どうしが同じ中身を共有する
//   - rev:預け先の版の番号。最後に合わせた rev を覚えておき、
//       ・預け先の rev が進んでいて、この端末で変更していない → 預け先の中身に置きかえる
//       ・この端末でも変更している → 両方を合わせて(この端末の変更を優先)預け直す
//   - 通信できないときは「未送信」として覚えておき、次に開いたとき・つながったときに送る

// Cloudflare に公開した裏側の住所(worker/ を公開したあとに入れる。空なら同期は動かない)
export const SYNC_URL = '';

const KEY_KEY = 'imagecho:syncKey';
const REV_KEY = 'imagecho:syncRev';
const DIRTY_KEY = 'imagecho:syncDirty';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 何もしない */ } },
};

let hooks = null;     // { getState, applyState, onStatus }
let pushTimer = 0;
let busy = false;
let again = false;
let status = { state: 'off', at: 0, message: '' };

function setStatus(state, message) {
  status = { state, at: Date.now(), message: message || '' };
  if (hooks && hooks.onStatus) hooks.onStatus(status);
}
export const getStatus = () => status;
export const enabled = () => !!SYNC_URL;

function makeKey() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getKey() {
  let k = ls.get(KEY_KEY);
  if (!k) { k = makeKey(); ls.set(KEY_KEY, k); }
  return k;
}

// ほかの端末のキーに切り替える(その端末の中身を取り込み、この端末の変更も合わせる)
export async function useKey(k) {
  k = String(k || '').trim();
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(k)) return false;
  ls.set(KEY_KEY, k);
  ls.set(REV_KEY, '0');
  ls.set(DIRTY_KEY, '1');
  await syncNow();
  return true;
}

async function call(method, body) {
  const res = await fetch(SYNC_URL.replace(/\/$/, '') + '/state', {
    method,
    headers: { 'Authorization': 'Bearer ' + getKey(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// 2つの中身を合わせる。b(この端末)を優先し、a(預け先)にしか無いものを足す
function merge(a, b) {
  if (!a) return b;
  const marks = { ...(a.marks || {}), ...(b.marks || {}) };
  const ids = new Set((b.mine || []).map((g) => g.id));
  const mine = (b.mine || []).map((g) => {
    const other = (a.mine || []).find((x) => x.id === g.id);
    if (!other) return g;
    const words = g.words.concat(other.words.filter((w) => !g.words.includes(w)));
    return { ...g, words };
  }).concat((a.mine || []).filter((g) => !ids.has(g.id)));
  return { marks, mine, flowPos: b.flowPos ?? a.flowPos ?? 0 };
}

export async function syncNow() {
  if (!SYNC_URL || !hooks) return;
  if (busy) { again = true; return; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus('offline'); return; }
  busy = true;
  setStatus('syncing');
  try {
    for (let tries = 0; tries < 4; tries += 1) {
      const got = await call('GET');
      if (got.status !== 200) throw new Error('取得 ' + got.status);
      const remote = got.data;
      const myRev = Number(ls.get(REV_KEY)) || 0;
      const dirty = ls.get(DIRTY_KEY) === '1';

      if (!dirty) {
        if (remote.rev > myRev && remote.data) hooks.applyState(remote.data);
        ls.set(REV_KEY, String(remote.rev));
        break;
      }
      const mustMerge = remote.rev > myRev && remote.data;
      const data = mustMerge ? merge(remote.data, hooks.getState()) : hooks.getState();
      if (mustMerge) hooks.applyState(data);
      const put = await call('PUT', { baseRev: remote.rev, data });
      if (put.status === 200) {
        ls.set(REV_KEY, String(put.data.rev));
        ls.set(DIRTY_KEY, '0');
        break;
      }
      if (put.status !== 409) throw new Error('送信 ' + put.status);
      // 409:ほかの端末が先に書いた。もう一度取り直して合わせる
    }
    setStatus('ok');
  } catch (e) {
    setStatus('error', String(e && e.message || e));
  } finally {
    busy = false;
    if (again) { again = false; syncNow(); }
  }
}

// この端末で何か変えたときに呼ぶ(少し待ってからまとめて送る)
// めくった位置のように何度も変わるものは delay を長くして、送る回数をおさえる
export function changed(delay = 1500) {
  ls.set(DIRTY_KEY, '1');
  if (!SYNC_URL) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, delay);
}

export function initCloud(h) {
  hooks = h;
  if (!SYNC_URL) return;
  getKey();
  syncNow();
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
}
