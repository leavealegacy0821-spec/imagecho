// 単語イメージ帳:画面の本体。
// 画面はハッシュで切り替える。
//   #/                        単語集一覧(ホーム)
//   #/list/<id>               単語一覧
//   #/word/<単語>?list=<id>   単語詳細(単語集から来たとき)
//   #/word/<単語>?q=<検索語>  単語詳細(検索から来たとき)
//   #/search?q=<検索語>       検索
//   #/mine/<id>               自分のまとまり(自分で選んだ単語だけ)
//   #/word/<単語>?mine=<id>   単語詳細(自分のまとまりから来たとき)
//   #/marks/<weak|known>      苦手・覚えたの印を付けた単語のまとめ
//   #/word/<単語>?mark=<種類> 単語詳細(そのまとめから来たとき)

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
const IRREGULAR = { run: ['ran'], bear: ['bore', 'borne', 'born'], deal: ['dealt'], hold: ['held'], lead: ['led'], mean: ['meant'], meet: ['met'], stand: ['stood'], break: ['broke', 'broken'], leave: ['left'], pay: ['paid'], seek: ['sought'], overcome: ['overcame'], drive: ['drove', 'driven'], forbid: ['forbade', 'forbidden'], forgive: ['forgave', 'forgiven'], prove: ['proven'], strike: ['struck'], undergo: ['underwent', 'undergone'], dwell: ['dwelt'], abide: ['abode'], rid: ['rid'], mistake: ['mistook', 'mistaken'], keep: ['kept'], lend: ['lent'], spend: ['spent'], stick: ['stuck'], withdraw: ['withdrew'], undertake: ['undertook'], bind: ['bound'], cling: ['clung'], strive: ['strove', 'striven'], arise: ['arose', 'arisen'], tear: ['tore', 'torn'], draw: ['drew', 'drawn'], mislead: ['misled'], lie: ['lay', 'lain', 'lying'], lay: ['laid'], rise: ['rose', 'risen', 'rising'], hang: ['hung'], steal: ['stole', 'stolen'], beat: ['beaten'], tell: ['told'], lose: ['lost'], wear: ['wore', 'worn'], forget: ['forgot', 'forgotten'], thrive: ['throve', 'thriven'], spring: ['sprang', 'sprung'], bring: ['brought'], take: ['took', 'taking'], make: ['made', 'making'], get: ['got', 'gotten'], give: ['gave'], become: ['became'], come: ['came'], see: ['saw'], feel: ['felt'], find: ['found'], fall: ['fell', 'fallen'], catch: ['caught'], have: ['had', 'has', 'having'], grow: ['grew'], say: ['said'], speak: ['spoke', 'spoken'], hope: ['hoping'], light: ['lit'], feed: ['fed'], bend: ['bent'], sink: ['sank', 'sunk'], wind: ['wound'], breed: ['bred'], sweep: ['swept'], shrink: ['shrank', 'shrunk'], flee: ['fled'], foresee: ['foresaw', 'foreseen'], withstand: ['withstood'], withhold: ['withheld'], dig: ['dug'], win: ['won'], hide: ['hid'], understand: ['understood'], think: ['thought'], know: ['knew'], teach: ['taught'], learn: ['learnt'], begin: ['began', 'begun'], throw: ['threw', 'thrown'], fling: ['flung'], choose: ['chose', 'chosen'], shine: ['shone'], stride: ['strode', 'stridden'], creep: ['crept'], weep: ['wept'], eat: ['ate'], drink: ['drank', 'drunk'], sleep: ['slept'], wake: ['woke', 'woken'], dream: ['dreamt'], awake: ['awoke'], freeze: ['froze', 'frozen'], swell: ['swollen'], grind: ['ground'], build: ['built'], stink: ['stank', 'stunk'], smell: ['smelt'], spin: ['spun'], swing: ['swung'], slide: ['slid'], kneel: ['knelt'], leap: ['leapt'], dive: ['dove'], panic: ['panicked'], mimic: ['mimicked'], shake: ['shook', 'shaken'], swear: ['swore', 'sworn'], overhear: ['overheard'], weave: ['wove', 'woven'], uphold: ['upheld'], forsake: ['forsook', 'forsaken'], forgo: ['forwent', 'forgone'] }; // 形が大きく変わる活用形
function wordForms(w) {
  const stem = w.length > 4 ? w.replace(/[ey]$/, '') : w; // observe → observ(observed, observing も拾う)
  return [stem + '[a-z]*', ...(IRREGULAR[w] || [])];
}
function markWord(en, word) {
  const parts = String(word || '').toLowerCase().split(/\s+/).map((x) => x.replace(/[^a-z]/g, '')).filter(Boolean);
  let forms;
  if (parts.length > 1) { // イディオム:動詞は活用形も、後ろの語(up・off など)はそのまま
    forms = [...wordForms(parts[0]), ...parts.slice(1).filter((x) => !['a', 'an', 'the', 'one', "one's", 'oneself', 'b'].includes(x))];
  } else {
    const w = parts[0] || '';
    if (w.length < 3) return [en];
    forms = wordForms(w);
  }
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
let phrases = [];               // イディオム(空白を含む語)。長いものから

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
  phrases = allWords.filter((w) => w._lw.includes(' ')).sort((a, b) => b._lw.length - a._lw.length);
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

// 印を付けた単語。新しく付けたものから順に(解説のある語だけ)
function markedItems(kind) {
  return Object.keys(marks).filter((k) => marks[k] === kind).reverse()
    .map((k) => byWord.get(k)).filter(Boolean).map((w) => ({ w }));
}

// ───────── 自分のまとまり(自分で選んだ単語だけを集めたもの。端末内に保存) ─────────

const MINE_KEY = 'imagecho:mine';
let mine = [];
try { mine = JSON.parse(localStorage.getItem(MINE_KEY)) || []; } catch (e) { mine = []; }
if (!Array.isArray(mine)) mine = [];

function saveMine() {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(mine));
  } catch (e) {
    toast('まとまりを保存できませんでした');
  }
}
const mineById = (id) => mine.find((g) => g.id === String(id)) || null;
// 解説のある単語だけを、入れた順に
const mineItems = (g) => g.words.map((x) => byWord.get(x)).filter(Boolean).map((w) => ({ w }));

function newMine() {
  let n = mine.length + 1;
  while (mine.some((g) => g.title === '自分のまとまり ' + n)) n += 1;
  const g = { id: Date.now().toString(36), title: '自分のまとまり ' + n, words: [] };
  mine.push(g);
  saveMine();
  return g;
}
// 文字列から単語を取り出して足す。足せた語・すでに入っていた語・解説の無い語を返す
function addToMine(g, text) {
  const added = [], dup = [], unknown = [];
  // イディオム(空白を含む語)は先に丸ごと拾う
  let rest = ' ' + String(text).toLowerCase().replace(/[,、，・/／\n]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const w of phrases) {
    if (!rest.includes(' ' + w._lw + ' ')) continue;
    rest = rest.split(' ' + w._lw + ' ').join(' ');
    if (g.words.includes(w._lw)) { if (!dup.includes(w._lw)) dup.push(w._lw); continue; }
    g.words.push(w._lw);
    added.push(w._lw);
  }
  for (const raw of rest.split(/[\s,、，・/／]+/)) {
    const key = raw.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
    if (!key) continue;
    if (!byWord.has(key)) { if (!unknown.includes(raw.trim())) unknown.push(raw.trim()); continue; }
    if (g.words.includes(key)) { if (!dup.includes(key)) dup.push(key); continue; }
    g.words.push(key);
    added.push(key);
  }
  if (added.length) saveMine();
  return { added, dup, unknown };
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
  if (seg[0] === 'mine' && seg[1]) return { name: 'mine', id: seg[1] };
  if (seg[0] === 'marks' && MARK_NAMES[seg[1]]) return { name: 'marks', kind: seg[1] };
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
    const rows = r.name === 'list' ? renderList(r) : r.name === 'mine' ? renderMine(r)
      : r.name === 'marks' ? renderMarks(r) : renderHome(r.q);
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
    const mineBlock = h('section', { class: 'block mine-home' },
      h('h2', { class: 'block-h' }, h('span', null, '自分のまとまり'), h('span', { class: 'block-h-side' }, mine.length + ' まとまり')),
      mine.length
        ? h('ul', { class: 'flow-groups' }, mine.map((g) => {
          const items = mineItems(g);
          return h('li', null, h('a', { class: 'flow-g', href: '#/mine/' + enc(g.id) },
            h('span', { class: 'flow-g-title' }, g.title),
            h('span', { class: 'flow-g-note', lang: 'en' }, items.map((it) => it.w.word).join(', ') || 'まだ単語がありません'),
            h('span', { class: 'flow-g-size' }, items.length + ' 語')));
        }))
        : h('p', { class: 'mine-hint' }, '覚えたい単語を自分で選んで、自分だけのまとまりを作れます。'),
      h('p', { class: 'mine-new' }, h('button', {
        type: 'button', class: 'plain-btn',
        onclick: () => { const g = newMine(); location.hash = '#/mine/' + enc(g.id) + '?new=1'; },
      }, '＋ 新しいまとまりを作る')));
    const weakN = markedItems('weak').length, knownN = markedItems('known').length;
    const marksBlock = h('section', { class: 'block marks-home' },
      h('h2', { class: 'block-h' }, h('span', null, '印を付けた単語')),
      h('ul', { class: 'flow-groups' },
        h('li', null, h('a', { class: 'flow-g', href: '#/marks/weak' },
          h('span', { class: 'flow-g-title' }, icon('weak'), ' 苦手'),
          h('span', { class: 'flow-g-note' }, weakN ? '苦手の印を付けた単語をまとめて見る・めくる' : 'まだありません(単語のページの下の「苦手」で付けられます)'),
          h('span', { class: 'flow-g-size' }, weakN + ' 語'))),
        h('li', null, h('a', { class: 'flow-g', href: '#/marks/known' },
          h('span', { class: 'flow-g-title' }, icon('known'), ' 覚えた'),
          h('span', { class: 'flow-g-note' }, knownN ? '覚えたの印を付けた単語' : 'まだありません'),
          h('span', { class: 'flow-g-size' }, knownN + ' 語')))));
    $view.replaceChildren(
      marksBlock,
      mineBlock,
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

// ───────── 画面5:自分のまとまり ─────────

function renderMine(r) {
  $masthead.hidden = true;
  if ($q.value) { $q.value = ''; $qClear.hidden = true; }
  const g = mineById(r.id);
  const crumb = h('nav', { class: 'crumb' }, backLink('#/', '単語集'));
  if (!g) {
    $view.replaceChildren(crumb, note('このまとまりは見つかりません。'));
    return null;
  }
  document.title = g.title + ' — 単語イメージ帳';
  const isNew = new URLSearchParams(normHash().split('?')[1] || '').has('new');
  const items = mineItems(g);
  const missing = g.words.filter((x) => !byWord.has(x));

  // 名前(その場で書き換えられる)
  const title = h('input', {
    class: 'mine-title', type: 'text', value: g.title, maxlength: '40', 'aria-label': 'まとまりの名前',
    enterkeyhint: 'done', autocomplete: 'off',
  });
  const saveTitle = () => {
    const t = title.value.trim();
    if (!t) { title.value = g.title; return; }
    if (t !== g.title) { g.title = t; saveMine(); document.title = t + ' — 単語イメージ帳'; }
  };
  title.addEventListener('change', saveTitle);
  title.addEventListener('blur', saveTitle);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });

  // 単語を足す(いくつでも。スペース・カンマ・改行で区切る)
  const box = h('textarea', {
    class: 'mine-input', rows: '2', placeholder: '単語を入力(例:hide conceal disguise)',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', lang: 'en', 'aria-label': '足す単語',
  });
  const msg = h('p', { class: 'mine-msg', role: 'status' });
  const form = h('form', { class: 'mine-add', autocomplete: 'off' }, box,
    h('button', { type: 'submit', class: 'plain-btn' }, '足す'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const res = addToMine(g, box.value);
    const parts = [];
    if (res.added.length) parts.push(res.added.length + ' 語を足しました');
    if (res.dup.length) parts.push('もう入っている:' + res.dup.join(', '));
    if (res.unknown.length) parts.push('解説がまだ無い語:' + res.unknown.join(', '));
    if (!parts.length) return;
    if (res.added.length) {
      if (cleanupView) { cleanupView(); cleanupView = null; }
      renderMine(r);
      const m = $view.querySelector('.mine-msg');
      if (m) m.textContent = parts.join(' ／ ');
      const b = $view.querySelector('.mine-input');
      if (b && res.unknown.length) b.value = res.unknown.join(' ');
    } else {
      msg.textContent = parts.join(' ／ ');
    }
  });

  // 入力しながら候補を出す(最後に打っている語で検索)
  const sugg = h('ul', { class: 'mine-sugg' });
  box.addEventListener('input', () => {
    const last = box.value.split(/[\s,、，・/／]+/).pop().trim().toLowerCase();
    if (last.length < 2) { sugg.replaceChildren(); return; }
    const hits = search(last).filter((it) => /^[a-z]/.test(last) ? it.w._lw.startsWith(last) : true).slice(0, 6);
    sugg.replaceChildren(...hits.map((it) => h('li', null, h('button', {
      type: 'button', class: 'mine-sugg-btn',
      onclick: () => {
        const parts = box.value.split(/([\s,、，・/／]+)/);
        parts[parts.length - 1] = it.w.word;
        box.value = parts.join('') + ' ';
        sugg.replaceChildren();
        box.focus();
      },
    }, h('span', { lang: 'en' }, it.w.word), h('span', { class: 'mine-sugg-core' }, it.w.core || '')))));
  });

  const list = h('ul', { class: 'mine-rows' }, items.map((it, i) => h('li', { class: 'mine-row' },
    h('a', { class: 'row', href: '#/word/' + enc(it.w.word) + '?mine=' + enc(g.id) },
      h('span', { class: 'row-no' }, String(i + 1)),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-line' }, h('span', { class: 'row-word', lang: 'en' }, it.w.word)),
        h('span', { class: 'row-core' }, it.w.core || ''))),
    h('button', {
      type: 'button', class: 'mine-del', 'aria-label': it.w.word + ' をまとまりから外す',
      onclick: () => {
        g.words = g.words.filter((x) => x !== it.w._lw);
        saveMine();
        const y = window.scrollY;
        renderMine(r);
        window.scrollTo(0, y);
      },
    }, '外す'))));

  $view.replaceChildren(...[crumb,
    h('header', { class: 'list-head mine-head' }, title,
      h('p', { class: 'list-count' }, h('b', null, fmt(items.length)), ' 語')),
    items.length
      ? h('a', { class: 'flow-start', href: '#/word/' + enc(items[0].w.word) + '?mine=' + enc(g.id) },
        h('span', { class: 'flow-start-label' }, 'このまとまりをめくる'),
        h('span', { class: 'flow-start-word', lang: 'en' }, items[0].w.word))
      : null,
    form, sugg, msg,
    items.length ? list : note('まだ単語がありません。上の欄に単語を入れて「足す」を押してください。単語の詳細ページからも足せます。'),
    missing.length ? h('p', { class: 'fine' }, '解説が見つからない語(表示していません):' + missing.join(', ')) : null,
    h('p', { class: 'mine-foot' }, h('button', {
      type: 'button', class: 'plain-btn mine-remove',
      onclick: () => {
        if (!confirm('「' + g.title + '」を消しますか?(単語の解説は消えません)')) return;
        mine = mine.filter((x) => x !== g);
        saveMine();
        location.replace('#/');
      },
    }, 'このまとまりを消す'))].filter(Boolean));
  if (isNew) { title.focus(); title.select(); }
  return null;
}

// ───────── 画面6:苦手・覚えたのまとめ ─────────

function renderMarks(r) {
  $masthead.hidden = true;
  if ($q.value) { $q.value = ''; $qClear.hidden = true; }
  const name = MARK_NAMES[r.kind];
  document.title = name + 'の単語 — 単語イメージ帳';
  const items = markedItems(r.kind);
  const suffix = '?mark=' + r.kind;
  const rows = mountRows(items, suffix, true);
  $view.replaceChildren(...[
    h('nav', { class: 'crumb' }, backLink('#/', '単語集')),
    h('header', { class: 'list-head' },
      h('h1', { class: 'list-name' }, icon(r.kind), ' ' + name + 'の単語'),
      h('p', { class: 'list-count' }, h('b', null, fmt(items.length)), ' 語')),
    items.length
      ? h('a', { class: 'flow-start', href: '#/word/' + enc(items[0].w.word) + suffix },
        h('span', { class: 'flow-start-label' }, 'まとめてめくる'),
        h('span', { class: 'flow-start-word', lang: 'en' }, items[0].w.word))
      : null,
    items.length ? rows.el : note('まだありません。単語のページの下にある「' + name + '」を押すと、ここに集まります。'),
    items.length ? h('p', { class: 'fine' }, '新しく印を付けた順。印を外すとここから消えます。') : null,
  ].filter(Boolean));
  return showRows(rows);
}

// 単語詳細の「自分のまとまりに入れる」パネル
function minePanel(word) {
  const key = String(word).toLowerCase();
  const wrap = h('div', { class: 'mine-pick' });
  const draw = (open) => {
    const inCount = mine.filter((g) => g.words.includes(key)).length;
    const toggle = h('button', {
      type: 'button', class: 'mine-pick-btn', 'aria-expanded': String(open),
      onclick: () => draw(!open),
    }, inCount ? '自分のまとまり(' + inCount + ')' : '＋ 自分のまとまりに入れる');
    const body = open ? h('ul', { class: 'mine-pick-list' },
      mine.map((g) => {
        const on = g.words.includes(key);
        return h('li', null, h('button', {
          type: 'button', class: 'mine-pick-g', 'aria-pressed': String(on),
          onclick: () => {
            if (on) g.words = g.words.filter((x) => x !== key); else g.words.push(key);
            saveMine();
            draw(true);
          },
        }, h('span', { class: 'mine-pick-check', 'aria-hidden': 'true' }, on ? '✓' : ''), g.title));
      }),
      h('li', null, h('button', {
        type: 'button', class: 'mine-pick-g mine-pick-g--new',
        onclick: () => { const g = newMine(); g.words.push(key); saveMine(); draw(true); toast('「' + g.title + '」を作って入れました'); },
      }, '＋ 新しいまとまりを作って入れる'))) : null;
    wrap.replaceChildren(...[toggle, body].filter(Boolean));
  };
  draw(false);
  return wrap;
}

// ───────── 画面3:単語詳細 ─────────

const markTrail = {}; // 印のまとめをめくっているときの直前の並び
// 前後移動の並び。単語集から来たらその番号順、検索から来たら検索結果の順
function sequenceFor(params, entry) {
  if (params.has('flow')) {
    return { items: flow, flow: true, hrefFor: flowHref, back: '#/', label: 'めくって覚える' };
  }
  if (params.has('mine')) {
    const g = mineById(params.get('mine'));
    if (g) return { items: mineItems(g), suffix: '?mine=' + enc(g.id), back: '#/mine/' + enc(g.id), label: g.title };
  }
  if (MARK_NAMES[params.get('mark')]) {
    const kind = params.get('mark');
    let items = markedItems(kind);
    // めくっている途中で印を外した語も、その場では並びに残す(前後移動が途切れないように)
    if (entry && !items.some((it) => it.w === entry) && markTrail[kind]) items = markTrail[kind];
    markTrail[kind] = items;
    return { items, suffix: '?mark=' + kind, back: '#/marks/' + kind, label: MARK_NAMES[kind] + 'の単語' };
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
  $view.replaceChildren(...[crumb, groupBar].filter(Boolean), h('article', { class: 'entry' + (slide ? ' slide-' + slide : '') },
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
        h('span', { class: 'mark-badge', id: 'mark-badge' }, markBadge(key))),
      minePanel(d.word)),

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
