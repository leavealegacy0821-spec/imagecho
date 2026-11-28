// imagecho の裏側。端末ごとの「苦手・覚えた」「自分のまとまり」「めくった位置」を預かる。
//
//   GET  /state            預かっているものを返す  → { rev, data }(まだ無ければ rev 0)
//   PUT  /state            { baseRev, data } を預ける
//                          baseRev が今の rev と同じときだけ受け付けて rev を1つ上げる
//                          ちがうとき(ほかの端末が先に書いた)は 409 と今のものを返す
//
// 鍵:同期キー(アプリが作る長い乱数)を Authorization: Bearer <キー> で送る。
// 保存場所の名前はキーそのものではなく、キーのハッシュ値にする(キーを保存しない)。

const ORIGINS = [
  'https://leavealegacy0821-spec.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];
const MAX_BYTES = 200 * 1024;

function cors(req) {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(req, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req) },
  });
}

async function slotFor(key) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return 's:' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

    const url = new URL(req.url);
    if (url.pathname === '/') return json(req, 200, { ok: true, app: 'imagecho-sync' });
    if (url.pathname !== '/state') return json(req, 404, { error: 'not found' });

    const auth = req.headers.get('Authorization') || '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!/^[A-Za-z0-9_-]{24,128}$/.test(key)) return json(req, 401, { error: 'bad key' });
    const slot = await slotFor(key);

    const now = (await env.STORE.get(slot, 'json')) || { rev: 0, data: null };

    if (req.method === 'GET') return json(req, 200, now);

    if (req.method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_BYTES) return json(req, 413, { error: 'too large' });
      let body;
      try { body = JSON.parse(text); } catch (e) { return json(req, 400, { error: 'bad json' }); }
      if (!body || typeof body.data !== 'object' || body.data === null) return json(req, 400, { error: 'no data' });
      if (body.baseRev !== now.rev) return json(req, 409, now);
      const next = { rev: now.rev + 1, data: body.data, at: Date.now() };
      await env.STORE.put(slot, JSON.stringify(next));
      return json(req, 200, { rev: next.rev });
    }
    return json(req, 405, { error: 'method' });
  },
};
