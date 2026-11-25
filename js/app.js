// 単語イメージ帳:画面の本体。
// 画面はハッシュで切り替える。
//   #/                        単語集一覧(ホーム)
//   #/list/<id>               単語一覧
//   #/word/<単語>?list=<id>   単語詳細(単語集から来たとき)
//   #/word/<単語>?q=<検索語>  単語詳細(検索から来たとき)
//   #/search?q=<検索語>       検索

import { initSpeech, speak, stopSpeech } from './speech.js';
import { registerServiceWorker, loadIndex, wordUrl, syncWords } from './offline.js';

const $view = document.getElementById('view');
const $masthead = document.getElementById('masthead');
const $q = document.getElementById('q');
const $qClear = document.getElementById('q-clear');
const $pager = document.getElementById('pager');
const $sync = document.getElementById('sync');
const $toast = document.getElementById('toast');

// ───────── 小さな道具 ─────────

// 要素を作る。文字は必ずテキストとして入れる(データをHTMLとして解釈しない)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) el.append(kid);
  }
  return el;
}

// 例文の中の見出し語(活用形を含む)を <b> で包んで目立たせる
const IRREGULAR = { run: ['ran'], bear: ['bore', 'borne', 'born'], deal: ['dealt'], hold: ['held'], lead: ['led'], mean: ['meant'], meet: ['met'], stand: ['stood'], break: ['broke', 'broken'], leave: ['left'], pay: ['paid'], seek: ['sought'], overcome: ['overcame'], drive: ['drove', 'driven'], forbid: ['forbade', 'forbidden'], forgive: ['forgave', 'forgiven'], prove: ['proven'], strike: ['struck'], undergo: ['underwent', 'undergone'], dwell: ['dwelt'], abide: ['abode'], rid: ['rid'], mistake: ['mistook', 'mistaken'], keep: ['kept'], lend: ['lent'], spend: ['spent'], stick: ['stuck'], withdraw: ['withdrew'], undertake: ['undertook'], bind: ['bound'], cling: ['clung'], strive: ['strove', 'striven'], arise: ['arose', 'arisen'], tear: ['tore', 'torn'], draw: ['drew', 'drawn'], mislead: ['misled'], lie: ['lay', 'lain', 'lying'], lay: ['laid'], rise: ['rose', 'risen', 'rising'], hang: ['hung'], steal: ['stole', 'stolen'], beat: ['beaten'], tell: ['told'], lose: ['lost'], wear: ['wore', 'worn'], forget: ['forgot', 'forgotten'], thrive: ['throve', 'thriven'], spring: ['sprang', 'sprung'], bring: ['brought'], take: ['took', 'taking'], make: ['made', 'making'], get: ['got', 'gotten'], give: ['gave'], become: ['became'], come: ['came'], see: ['saw'], feel: ['felt'], find: ['found'], fall: ['fell', 'fallen'], catch: ['caught'], have: ['had', 'has', 'having'], grow: ['grew'], say: ['said'], speak: ['spoke', 'spoken'], hope: ['hoping'], light: ['lit'], feed: ['fed'], bend: ['bent'], sink: ['sank', 'sunk'], wind: ['wound'], breed: ['bred'], sweep: ['swept'], shrink: ['shrank', 'shrunk'], flee: ['fled'], foresee: ['foresaw', 'foreseen'], withstand: ['withstood'], withhold: ['withheld'], win: ['won'], hide: ['hid'], understand: ['understood'], think: ['thought'], know: ['knew'], teach: ['taught'], learn: ['learnt'], begin: ['began', 'begun'], throw: ['threw', 'thrown'], fling: ['flung'], choose: ['chose', 'chosen'], shine: ['shone'], stride: ['strode', 'stridden'], creep: ['crept'], weep: ['wept'], eat: ['ate'], drink: ['drank', 'drunk'], sleep: ['slept'], wake: ['woke', 'woken'], dream: ['dreamt'], awake: ['awoke'], freeze: ['froze', 'frozen'], swell: ['swollen'], grind: ['ground'] }; // 形が大きく変わる活用形
function markWord(en, word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (w.length < 3) return [en];
  const stem = w.length > 4 ? w.replace(/[ey]$/, '') : w; // observe → observ(observed, observing も拾う)
  const forms = [stem + '[a-z]*', ...(IRREGULAR[w] || [])];
  const re = new RegExp('\\b(' + forms.join('|') + ')\\b', 'gi');
  const out = [];
  let last = 0, m;
  while ((m = re.exec(en))) {
    if (m.index > last) out.push(en.slice(last, m.index));
    out.push(h('b', { class: 'hit' }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < en.length) out.push(en.slice(last));
  return out;
}

const enc = encodeURIComponent;
const fmt = (n) => Number(n).toLocaleString('ja-JP');
const two = (n) => String(n).padStart(2, '0');

// 印や読み上げボタンの絵(すべて黒1色の図形。アプリ内で決めた固定の文字列)
const ICONS = {
  weak: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 15 14H1z" fill="currentColor"/></svg>',
  known: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8.5 6.2 13 14 3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  speaker: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5h3.5L11 4v12l-4.5-3.5H3z" fill="currentColor"/><path d="M13.5 7a4 4 0 0 1 0 6M15.6 4.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};
const MARK_NAMES = { weak: '苦手', known: '覚えた' };

function icon(name, cls) {
  const span = h('span', { class: 'ico' + (cls ? ' ' + cls : '') });
  span.innerHTML = ICONS[name];
  return span;
}

let toastTimer = 0;
function toast(message) {
  $toast.textContent = message;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 2800);
}

// ───────── データ(索引) ─────────

let lists = [];                 // 単語集
let allWords = [];              // 全単語(索引の1行ずつ)
const listById = new Map();     // 単語集の id → 単語集
const listWords = new Map();    // 単語集の id → [{ number, w }](番号順)
const byWord = new Map();       // 小文字の単語 → 索引の1行

function prepare(index) {
  lists = index.lists || [];
  allWords = index.words || [];
  for (const l of lists) {
    listById.set(String(l.id), l);
    listWords.set(String(l.id), []);
  }
  for (const w of allWords) {
    w._lw = String(w.word).toLowerCase();
    w._ja = ((w.ja || '') + '\n' + (w.core || '')).toLowerCase();
    if (!byWord.has(w._lw)) byWord.set(w._lw, w);
    for (const ref of w.lists || []) {
      const arr = listWords.get(String(ref.id));
      if (arr) arr.push({ number: ref.number, w });
    }
  }
  for (const arr of listWords.values()) {
    arr.sort((a, b) => Number(a.number) - Number(b.number));
  }
  // めくる形式の並び。まとまり(語根・語法など)ごとに単語を並べた1本の列。
  // 同じ単語が別のまとまりにもう一度出てくることがある(別の切り口での復習になる)
  groups = [];
  flow = [];
  for (const g of index.groups || []) {
    const words = (g.words || []).map((x) => byWord.get(String(x).toLowerCase())).filter(Boolean);
    if (!words.length) continue;
    const gi = groups.length;
    groups.push({ title: g.title, note: g.note || '', start: flow.length, size: words.length });
    words.forEach((w, k) => flow.push({ w, g: gi, k }));
  }
}

let groups = [];  // めくる形式のまとまり { title, note, start(flow の位置), size }
let flow = [];    // めくる形式の並び [{ w, g(まとまりの番号), k(まとまりの中の何番目) }]
const FLOW_KEY = 'imagecho:flowPos'; // 最後にめくっていた位置

function flowHref(i) {
  return '#/word/' + enc(flow[i].w.word) + '?flow=' + i;
}

// 検索。英単語は部分一致(大文字小文字を無視)、日本語は ja と core の部分一致。
// 並びは「単語がぴったり → 単語の頭が一致 → 単語の途中が一致 → 日本語が一致」
let lastSearch = { q: null, items: [] };
function search(query) {
  const q = String(query).trim().toLowerCase();
  if (!q) return [];
  if (lastSearch.q === q) return lastSearch.items;
  const exact = [], head = [], mid = [], ja = [];
  for (const w of allWords) {
    const i = w._lw.indexOf(q);
    if (i === 0) (w._lw.length === q.length ? exact : head).push(w);
    else if (i > 0) mid.push(w);
    else if (w._ja.includes(q)) ja.push(w);
  }
  const items = exact.concat(head, mid, ja).map((w) => ({ w }));
  lastSearch = { q, items };
  return items;
}

// ───────── マーク(苦手・覚えた) ─────────

const MARKS_KEY = 'imagecho:marks';
let marks = {};
try { marks = JSON.parse(localStorage.getItem(MARKS_KEY)) || {}; } catch (e) { marks = {}; }

function getMark(word) {
  return marks[String(word).toLowerCase()] || null;
}
// kind は 'weak' / 'known' / null(外す)。どちらか一方だけ付く
function setMark(word, kind) {
  const key = String(word).toLowerCase();
  if (kind) marks[key] = kind; else delete marks[key];
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch (e) {
    toast('マークを保存できませんでした');
  }
}

// ───────── 画面の切り替え ─────────

let cur = { id: null, hash: '', from: null }; // 今の画面
let carryFrom = false;        // 前後移動のとき、戻り先を引き継ぐ印
let lastSeen = null;          // 最後に見た単語 { key: 戻り先のハッシュ, word }
let cleanupView = null;       // 画面を離れるときの後片付け
let renderToken = 0;          // 遅れて届いた読み込み結果を捨てるための番号
let navSeq = 0;
const scrollPos = new Map();  // 履歴の番号 → スクロール位置

const normHash = () => (location.hash && location.hash !== '#' ? location.hash : '#/');

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

function parseHash() {
  const raw = normHash().slice(1);
  const qi = raw.indexOf('?');
  const path = qi < 0 ? raw : raw.slice(0, qi);
  const params = new URLSearchParams(qi < 0 ? '' : raw.slice(qi + 1));
  const seg = path.split('/').filter(Boolean).map(safeDecode);
  if (seg[0] === 'list' && seg[1]) return { name: 'list', id: seg[1] };
  if (seg[0] === 'word' && seg[1]) return { name: 'word', word: seg.slice(1).join('/'), params };
  if (seg[0] === 'search') return { name: 'home', q: params.get('q') || '' };
  return { name: 'home', q: '' };
}

function route() {
  // 履歴の1ページごとに番号を振る。すでに番号があれば「戻る・進む」で来たページなので、
  // スクロール位置を元に戻す。番号がなければ新しく開いたページなので一番上から。
  let st = history.state;
  const revisit = !!(st && st.imagecho);
  if (!revisit) {
    st = { imagecho: Date.now() + '-' + (++navSeq), from: carryFrom ? cur.from : (cur.id ? cur.hash : null) };
    history.replaceState(st, '', location.href);
  }
  carryFrom = false;
  cur = { id: st.imagecho, hash: normHash(), from: st.from };

  if (cleanupView) { cleanupView(); cleanupView = null; }
  stopSpeech();
  renderToken += 1;

  const r = parseHash();
  const y = revisit ? (scrollPos.get(cur.id) || 0) : 0;
  if (r.name === 'word') {
    renderWord(r, y);
  } else {
    $pager.hidden = true;
    document.body.classList.remove('has-pager');
    $sync.classList.remove('is-hidden');
    const rows = r.name === 'list' ? renderList(r) : renderHome(r.q);
    window.scrollTo(0, y);
    if (rows) rows.draw(); // 戻した位置の行をすぐ描く
    // 詳細から戻ってきたとき、最後に見ていた単語が画面の外なら見える位置まで動かす
    if (revisit && rows && lastSeen && lastSeen.key === cur.hash) rows.reveal(lastSeen.word);
  }
}

// 「‹ 単語集」などの戻るリンク。直前のページがその行き先なら、ブラウザの「戻る」と同じ動きにする
function backLink(href, label) {
  return h('a', {
    class: 'crumb-back', href,
    onclick: (e) => {
      if (cur.from === href) { e.preventDefault(); history.back(); }
    },
  }, h('span', { class: 'crumb-arrow', 'aria-hidden': 'true' }, '‹'), label);
}

function note(text) {
  return h('p', { class: 'note' }, text);
}

// ───────── 単語の行(数千語でも重くならないよう、見えている分だけ作る) ─────────

const ROW_H = 64; // 1行の高さ(css の .row と同じ値にすること)

// items: [{ w, number? }]、suffix: 詳細へのリンクに付ける「?list=…」など、showRefs: 単語集名と番号を出すか
function mountRows(items, suffix, showRefs) {
  const inner = h('div', { class: 'rows-inner' });
  const box = h('div', { class: 'rows', style: 'height:' + (items.length * ROW_H) + 'px' }, inner);
  let first = -1, last = -1, ticking = false;

  const makeRow = (item) => {
    const w = item.w;
    const mark = getMark(w.word);
    const refs = showRefs
      ? (w.lists || []).map((l) => l.name + ' ' + l.number).join('・')
      : null;
    return h('a', { class: 'row' + (showRefs ? ' row--search' : ''), href: '#/word/' + enc(w.word) + suffix },
      showRefs ? null : h('span', { class: 'row-no' }, String(item.number)),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-line' },
          h('span', { class: 'row-word', lang: 'en' }, w.word),
          refs ? h('span', { class: 'row-ref' }, refs) : null),
        h('span', { class: 'row-core' }, w.core || '')),
      h('span', { class: 'row-mark', title: mark ? MARK_NAMES[mark] : null },
        mark ? [icon(mark), h('span', { class: 'sr' }, MARK_NAMES[mark])] : null));
  };

  const draw = () => {
    ticking = false;
    if (!box.isConnected) return;
    const top = box.getBoundingClientRect().top;
    const a = Math.max(0, Math.floor(-top / ROW_H) - 10);
    const b = Math.min(items.length, Math.ceil((window.innerHeight - top) / ROW_H) + 10);
    if (a === first && b === last) return;
    first = a; last = b;
    inner.style.transform = 'translateY(' + (a * ROW_H) + 'px)';
    inner.replaceChildren(...items.slice(a, b).map(makeRow));
  };
  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(draw); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  return {
    el: box,
    draw,
    destroy() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    },
    // その単語の行が画面の外にあれば、見える位置までスクロールする
    reveal(word) {
      const key = String(word).toLowerCase();
      const i = items.findIndex((it) => it.w._lw === key);
      if (i < 0) return;
      const top = box.getBoundingClientRect().top + window.scrollY + i * ROW_H;
      if (top < window.scrollY || top + ROW_H > window.scrollY + window.innerHeight - 8) {
        window.scrollTo(0, Math.max(0, top - window.innerHeight * 0.3));
        draw();
      }
    },
  };
}

function showRows(rows) {
  cleanupView = () => rows.destroy();
  rows.draw();
  return rows;
}

// ───────── 画面1:単語集一覧(ホーム)/ 画面4:検索 ─────────

function renderHome(q) {
  $masthead.hidden = false;
  if ($q.value !== q) $q.value = q;
  $qClear.hidden = !q;
  document.title = '単語イメージ帳';

  if (!q.trim()) {
    const total = lists.reduce((sum, l) => sum + Number(l.count || 0), 0);
    // めくって覚える:続きから/まとまりを選んで始める
    let resume = 0;
    try { resume = Number(localStorage.getItem(FLOW_KEY)) || 0; } catch (e) { resume = 0; }
    if (!(resume >= 0 && resume < flow.length)) resume = 0;
    const flowBlock = flow.length
      ? h('section', { class: 'block flow-home' },
        h('h2', { class: 'block-h' }, h('span', null, 'めくって覚える'), h('span', { class: 'block-h-side' }, groups.length + ' まとまり')),
        h('a', { class: 'flow-start', href: flowHref(resume) },
          h('span', { class: 'flow-start-label' }, resume > 0 ? '続きから' : 'はじめから'),
          h('span', { class: 'flow-start-word', lang: 'en' }, flow[resume].w.word),
          h('span', { class: 'flow-start-group' }, groups[flow[resume].g].title)),
        h('ul', { class: 'flow-groups' }, groups.map((g) =>
          h('li', null, h('a', { class: 'flow-g', href: flowHref(g.start) },
            h('span', { class: 'flow-g-title' }, g.title),
            h('span', { class: 'flow-g-note' }, g.note),
            h('span', { class: 'flow-g-size' }, g.size + ' 語'))))))
      : '';
    $view.replaceChildren(
      flowBlock,
      h('section', { class: 'block' },
        h('h2', { class: 'block-h' }, h('span', null, '単語集'), h('span', { class: 'block-h-side' }, lists.length + ' 冊')),
        lists.length
          ? h('ul', { class: 'books' }, lists.map((l) =>
            h('li', null,
              h('a', { class: 'book', href: '#/list/' + enc(l.id) },
                h('span', { class: 'book-name' }, l.name),
                h('span', { class: 'book-dots', 'aria-hidden': 'true' }),
                h('span', { class: 'book-count' }, h('b', null, fmt(l.count)), ' 語')))))
          : note('単語集がまだありません。')),
      lists.length > 1 ? h('p', { class: 'fine' }, 'のべ ' + fmt(total) + ' 語') : '');
    return null;
  }

  const items = search(q);
  const rows = mountRows(items, '?q=' + enc(q.trim()), true);
  $view.replaceChildren(
    h('section', { class: 'block' },
      h('h2', { class: 'block-h' }, h('span', null, '検索結果'), h('span', { class: 'block-h-side' }, fmt(items.length) + ' 語')),
      items.length ? rows.el : note('「' + q.trim() + '」に当てはまる単語はありません。')));
  return showRows(rows);
}

// 検索欄:入力しながら結果を出す
$q.addEventListener('input', () => {
  const q = $q.value;
  const target = '#/search?q=' + enc(q);
  if (normHash().startsWith('#/search')) {
    // すでに検索の画面にいるときは履歴を増やさず、その場で書き換える
    history.replaceState(history.state, '', target);
    cur.hash = target;
    if (cleanupView) { cleanupView(); cleanupView = null; }
    renderHome(q);
    window.scrollTo(0, 0);
  } else {
    location.hash = target; // 最初の1文字のときだけ履歴に積む(「戻る」で単語集一覧に戻れる)
  }
});
document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  $q.blur(); // キーボードを閉じる
});
$qClear.addEventListener('click', () => {
  $q.value = '';
  $q.dispatchEvent(new Event('input'));
  $q.focus();
});

// ───────── 画面2:単語一覧 ─────────

function renderList(r) {
  $masthead.hidden = false; // 一覧でも検索欄を上に出しておく(本人の要望)
  if ($q.value) { $q.value = ''; $qClear.hidden = true; }
  const list = listById.get(r.id);
  if (!list) {
    $view.replaceChildren(h('nav', { class: 'crumb' }, backLink('#/', '単語集')), note('この単語集は見つかりません。'));
    return null;
  }
  document.title = list.name + ' — 単語イメージ帳';
  const items = listWords.get(r.id) || [];
  const rows = mountRows(items, '?list=' + enc(list.id), false);
  $view.replaceChildren(
    h('nav', { class: 'crumb' }, backLink('#/', '単語集')),
    h('header', { class: 'list-head' },
      h('h1', { class: 'list-name' }, list.name),
      h('p', { class: 'list-count' }, h('b', null, fmt(items.length)), ' 語')),
    items.length ? rows.el : note('この単語集にはまだ単語がありません。'));
  return showRows(rows);
}

// ───────── 画面3:単語詳細 ─────────

// 前後移動の並び。単語集から来たらその番号順、検索から来たら検索結果の順
function sequenceFor(params, entry) {
  if (params.has('flow')) {
    return { items: flow, flow: true, hrefFor: flowHref, back: '#/', label: 'めくって覚える' };
  }
  if (params.has('q')) {
    const q = params.get('q');
    return { items: search(q), suffix: '?q=' + enc(q), back: '#/search?q=' + enc(q), label: '検索結果' };
  }
  let id = params.get('list');
  if (!listById.has(String(id)) && entry && entry.lists && entry.lists[0]) id = String(entry.lists[0].id);
  const list = listById.get(String(id));
  if (!list) return { items: [], suffix: '', back: '#/', label: '単語集' };
  return { items: listWords.get(String(id)) || [], suffix: '?list=' + enc(list.id), back: '#/list/' + enc(list.id), label: list.name };
}

// 線画SVGを埋め込める形にする。自分たちで作って検査済みのデータだが、
// 念のためスクリプトなど絵に要らないものは取り除く。
function buildSvg(source, label) {
  if (!source) return null;
  const t = document.createElement('template');
  t.innerHTML = String(source);
  const svg = t.content.querySelector('svg');
  if (!svg) return null;
  svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove());
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  }
  if (svg.hasAttribute('viewBox')) { // 幅いっぱいに伸び縮みさせる
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label || '核となるイメージの線画');
  return svg;
}

// 読み上げボタン
function sayButton(text, label, cls) {
  const btn = h('button', { type: 'button', class: 'say ' + cls, 'aria-label': label + 'を読み上げる' },
    icon('speaker'), cls === 'say--word' ? h('span', null, '発音') : null);
  btn.addEventListener('click', () => speak(text, btn, toast)); // 押した処理の中で直接読み上げる
  return btn;
}

// 番号つきの小見出しと、その中身
function sec(no, title, ...body) {
  return h('section', { class: 'sec' },
    h('h2', { class: 'sec-h' }, h('span', { class: 'sec-no' }, two(no)), title),
    body);
}
const dash = () => h('p', { class: 'body' }, '—');

function markBadge(word) {
  const mark = getMark(word);
  return mark ? [icon(mark), MARK_NAMES[mark]] : [];
}

function renderPager(seq, index, word) {
  const link = (dir, item) => {
    const isPrev = dir === 'prev';
    const head = h('span', { class: 'pg-dir' }, isPrev ? '‹ 前の単語' : '次の単語 ›');
    if (!item) {
      return h('span', { class: 'pg pg--' + dir + ' is-off', 'aria-disabled': 'true' }, head,
        h('span', { class: 'pg-word' }, isPrev ? '(最初)' : '(最後)'));
    }
    const href = seq.hrefFor ? seq.hrefFor(index + (isPrev ? -1 : 1)) : '#/word/' + enc(item.w.word) + seq.suffix;
    return h('a', {
      class: 'pg pg--' + dir, href, rel: dir,
      onclick: (e) => {
        // 前後移動は履歴を増やさない(「戻る」1回で一覧に戻れる)
        e.preventDefault();
        carryFrom = true;
        slideDir = dir;
        location.replace(href);
      },
    }, head, h('span', { class: 'pg-word', lang: 'en' }, item.w.word));
  };
  const markButton = (kind) => {
    const btn = h('button', { type: 'button', class: 'pg-mark', 'data-mark': kind, 'aria-pressed': String(getMark(word) === kind) },
      icon(kind), h('span', null, MARK_NAMES[kind]));
    btn.addEventListener('click', () => {
      setMark(word, getMark(word) === kind ? null : kind);
      for (const b of $pager.querySelectorAll('.pg-mark')) {
        b.setAttribute('aria-pressed', String(getMark(word) === b.dataset.mark));
      }
      const badge = document.getElementById('mark-badge');
      if (badge) badge.replaceChildren(...markBadge(word));
    });
    return btn;
  };
  $pager.replaceChildren(h('div', { class: 'pager-in' },
    link('prev', index > 0 ? seq.items[index - 1] : null),
    markButton('weak'),
    markButton('known'),
    link('next', index >= 0 && index < seq.items.length - 1 ? seq.items[index + 1] : null)));
  $pager.hidden = false;
  document.body.classList.add('has-pager');
}

// ───────── めくる操作(指で左右に払う) ─────────

let slideDir = ''; // 次の画面をどちらから滑り込ませるか('next' / 'prev')

function goSeq(seq, index, dir) {
  const j = index + (dir === 'next' ? 1 : -1);
  if (index < 0 || j < 0 || j >= seq.items.length) return false;
  const href = seq.hrefFor ? seq.hrefFor(j) : '#/word/' + enc(seq.items[j].w.word) + seq.suffix;
  slideDir = dir;
  carryFrom = true;
  location.replace(href); // 前後移動は履歴を増やさない
  return true;
}

function attachSwipe(seq, index) {
  let x0 = 0, y0 = 0, t0 = 0, active = false;
  const onStart = (e) => {
    if (e.touches.length !== 1) { active = false; return; }
    // 例文の横スクロールなどの上では反応させない
    if (e.target.closest('button, a, input, .no-swipe')) { active = false; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); active = true;
  };
  const onEnd = (e) => {
    if (!active) return;
    active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    // 横にはっきり払ったときだけ(縦スクロールとまちがえない)
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - t0 > 700) return;
    goSeq(seq, index, dx < 0 ? 'next' : 'prev');
  };
  // PC ではキーボードの左右でもめくれる
  const onKey = (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') goSeq(seq, index, 'next');
    else if (e.key === 'ArrowLeft') goSeq(seq, index, 'prev');
  };
  $view.addEventListener('touchstart', onStart, { passive: true });
  $view.addEventListener('touchend', onEnd, { passive: true });
  window.addEventListener('keydown', onKey);
  return () => {
    $view.removeEventListener('touchstart', onStart);
    $view.removeEventListener('touchend', onEnd);
    window.removeEventListener('keydown', onKey);
  };
}

async function renderWord(r, y) {
  const token = renderToken;
  const key = r.word.toLowerCase();
  const entry = byWord.get(key);
  const seq = sequenceFor(r.params, entry);
  let index;
  if (seq.flow) {
    index = Number(r.params.get('flow'));
    if (!(index >= 0 && index < flow.length && flow[index].w._lw === key)) index = flow.findIndex((it) => it.w._lw === key);
    if (index >= 0) { try { localStorage.setItem(FLOW_KEY, String(index)); } catch (e) { /* 何もしない */ } }
  } else {
    index = seq.items.findIndex((it) => it.w._lw === key);
  }
  lastSeen = { key: seq.back, word: key };

  $masthead.hidden = true;
  $sync.classList.add('is-hidden');
  const fg = seq.flow && index >= 0 ? groups[flow[index].g] : null;
  const crumb = h('nav', { class: 'crumb' },
    backLink(seq.back, seq.label),
    index >= 0 ? h('span', { class: 'crumb-pos' }, fmt(index + 1) + ' / ' + fmt(seq.items.length)) : null);
  // めくる形式では、いまどのまとまりの何語目かを出す(脈絡がわかるように)
  const groupBar = fg
    ? h('p', { class: 'flow-group' },
      h('span', { class: 'flow-group-title' }, fg.title),
      h('span', { class: 'flow-group-note' }, fg.note),
      h('span', { class: 'flow-group-pos' }, (flow[index].k + 1) + ' / ' + fg.size))
    : null;
  renderPager(seq, index, key);
  // 指で左右に払って前後の単語へ(一覧に戻らずに次々めくれる)
  cleanupView = attachSwipe(seq, index);

  // すぐ届かないときだけ「読み込み中」を出す(保存済みなら一瞬で届く)
  const waiting = setTimeout(() => {
    if (token === renderToken) { $view.replaceChildren(crumb, note('読み込み中')); window.scrollTo(0, 0); }
  }, 250);

  let d;
  try {
    const res = await fetch(wordUrl(key));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    d = await res.json();
  } catch (e) {
    clearTimeout(waiting);
    if (token !== renderToken) return;
    $view.replaceChildren(crumb,
      h('p', { class: 'hw hw--plain', lang: 'en' }, entry ? entry.word : r.word),
      note(navigator.onLine === false
        ? 'この単語の解説はまだこの端末に保存されていません。通信できる場所で開いてください。'
        : 'この単語の解説を読み込めませんでした。'));
    window.scrollTo(0, 0);
    return;
  }
  clearTimeout(waiting);
  if (token !== renderToken) return;

  document.title = d.word + ' — 単語イメージ帳';
  const core = d.core_image || {};
  const refs = (entry && entry.lists && entry.lists.length ? entry.lists : (d.lists || []));
  const examples = d.examples || [];
  const defs = d.en_definitions || [];
  const cautions = d.cautions || [];
  const patterns = d.patterns || [];
  const checks = d.check_points || [];
  const exam = d.exam || {};
  const svg = buildSvg(core.svg, core.text);

  const slide = slideDir; slideDir = '';
  $view.replaceChildren(crumb, groupBar, h('article', { class: 'entry' + (slide ? ' slide-' + slide : '') },
    // 01 見出し
    h('header', { class: 'head' },
      h('p', { class: 'sec-h' }, h('span', { class: 'sec-no' }, '01'), '見出し'),
      h('div', { class: 'head-row' },
        h('h1', { class: 'hw', lang: 'en' }, d.word),
        sayButton(d.word, '単語', 'say--word')),
      h('p', { class: 'head-meta' },
        h('span', { class: 'pos' }, (d.pos || []).join('・')),
        h('span', { class: 'ipa', lang: 'en' }, d.ipa || '')),
      h('p', { class: 'head-refs' },
        h('span', null, refs.map((l) => l.name + ' ' + l.number).join('・')),
        h('span', { class: 'mark-badge', id: 'mark-badge' }, markBadge(key)))),

    // 02 核となるイメージ(線画＋一言を大きく)
    sec(2, '核となるイメージ',
      svg ? h('div', { class: 'fig' }, svg) : null,
      h('p', { class: 'core-text' }, core.text || '')),

    sec(3, '語源', h('p', { class: 'body pre' }, d.etymology || '—')),

    sec(4, '英英の定義', defs.length
      ? h('ul', { class: 'defs' }, defs.map((x) => h('li', null,
        h('span', { class: 'def-pos' }, x.pos || ''),
        h('span', { class: 'def-text', lang: 'en' }, x.text || ''))))
      : dash()),

    sec(5, '注意点', cautions.length
      ? h('ol', { class: 'points' }, cautions.map((x, i) => h('li', null,
        h('span', { class: 'point-no' }, String(i + 1)), h('span', { class: 'pre' }, x))))
      : dash()),

    sec(6, 'よくある型', patterns.length
      ? h('dl', { class: 'patterns' }, patterns.map((x) => h('div', null,
        h('dt', { lang: 'en' }, x.form || ''), h('dd', null, x.meaning || ''))))
      : dash()),

    // 07 例文(データの順のまま。単語帳の例文は黒い札、自作は白い札)
    sec(7, '例文', examples.length
      ? h('ol', { class: 'examples' }, examples.map((x, i) => {
        const own = x.source === 'original';
        return h('li', { class: 'ex' },
          h('div', { class: 'ex-body' },
            h('p', { class: 'ex-top' },
              h('span', { class: 'ex-no' }, String(i + 1)),
              h('span', { class: 'tag ' + (own ? 'tag--own' : 'tag--book') }, own ? '自作' : String(x.source || '単語帳')),
              h('span', { class: 'ex-label' }, x.label || '')),
            h('p', { class: 'ex-en', lang: 'en' }, markWord(x.en || '', d.word)),
            h('p', { class: 'ex-ja' }, x.ja || '')),
          sayButton(x.en || '', '例文' + (i + 1), 'say--ex'));
      }))
      : dash()),

    sec(8, '確認ポイント', checks.length
      ? h('ol', { class: 'points points--q' }, checks.map((x, i) => h('li', null,
        h('span', { class: 'point-no' }, 'Q' + (i + 1)), h('span', { class: 'pre' }, x))))
      : dash()),

    // 09 入試での出題度(ページの一番下)
    sec(9, '入試での出題度',
      h('p', { class: 'exam-freq' }, exam.frequency || '—'),
      h('p', { class: 'body pre' }, exam.note || ''))));

  window.scrollTo(0, y);
}

// ───────── オフライン用の保存の進み具合 ─────────

let syncTimer = 0;
function reportSync(done, total, state) {
  clearTimeout(syncTimer);
  $sync.hidden = false;
  if (state === 'run') {
    $sync.textContent = 'オフライン用に保存中 ' + fmt(done) + '/' + fmt(total);
  } else if (state === 'done') {
    $sync.textContent = 'オフライン用の保存が終わりました ' + fmt(done) + '/' + fmt(total);
    syncTimer = setTimeout(() => { $sync.hidden = true; }, 5000);
  } else {
    $sync.textContent = 'オフライン用の保存は途中です ' + fmt(done) + '/' + fmt(total) + '(次に開いたとき続きから)';
  }
}

// ───────── 起動 ─────────

async function start() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  initSpeech();
  registerServiceWorker();

  let index;
  try {
    index = await loadIndex();
  } catch (e) {
    $view.replaceChildren(
      note('単語のデータを読み込めませんでした。通信できる場所で開き直してください。'),
      h('p', null, h('button', { type: 'button', class: 'plain-btn', onclick: () => location.reload() }, '読み込み直す')));
    return;
  }
  prepare(index);

  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', () => {
    if (cur.id) scrollPos.set(cur.id, window.scrollY);
  }, { passive: true });
  route();

  // 全単語をオフライン用に保存(データの版が変わったときと、まだ終わっていないときだけ動く)
  syncWords(index, reportSync);
  window.addEventListener('online', () => syncWords(index, reportSync));
}

start();
