// 短い書き方の下書き(gen/*.js)から、data/words/<単語>.json を作る。
// 使い方: node scripts/make-words.js gen/001.js [gen/002.js ...]
//
// 下書きの形(1語ぶん):
// イディオムは w に空白を入れて書く(例 w:'put off')。data/words/put off.json になり、単語集「イディオム」に入る。
// { w:'observe', pos:['動詞'], ipa:'/əbˈzɜːrv/', core:'じっと目を向けて、そのまま守る',
//   svg:'{ground}{man 60 52}<line …/>',          // 線画の中身だけ。下の「部品」が使える
//   lab:[[118,38,'じっと見る']],                   // 線画に入れる短い言葉 [x, y, 言葉]
//   ety:'ob(…) + serve(…) → …',
//   def:[['動詞','to watch …']], cau:['…'], pat:[['observe that ~','…']],
//   tex:['観察する'],                              // 単語帳の例文に付ける役割ラベル(単語帳の順)
//   ex:[['(規則を)守る','英文','和訳']],            // 自作の例文
//   chk:['…'], exam:['頻出','…'] }
// 単語帳の例文そのもの(英文・和訳)は data/lists/*.json から一字一句そのまま入れる(書き写さない)。
//
// 線画の部品(座標は viewBox 0 0 240 160):
//   {ground}             地面の線(y=140)
//   {man x y}            立っている棒人間の頭・胴・脚(頭の中心が x,y。y=52 で足が地面に着く)。腕は自分で描く
//   {arrow x1 y1 x2 y2}  矢印   {darrow x1 y1 x2 y2}  点線の矢印
const fs = require('fs');
const path = require('path');
const { loadLists } = (() => { try { return require('./common.js'); } catch (e) { return {}; } })();

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');

// 単語集を読む(common.js の形に頼らず自前で読む)
function readLists() {
  const dir = path.join(dataDir, 'lists');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

const r1 = (n) => Math.round(n * 10) / 10;

// 矢印の頭を計算して描く
function arrow(x1, y1, x2, y2, dashed) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 8, s = 0.5;
  const p = (t) => `${r1(x2 - L * Math.cos(a + t))},${r1(y2 - L * Math.sin(a + t))}`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${dashed ? ' stroke-dasharray="5 5"' : ''}/>`
    + `<polyline points="${p(s)} ${x2},${y2} ${p(-s)}"/>`;
}

// 部品を展開する
function expand(inner) {
  return inner.replace(/\{(\w+)([^}]*)\}/g, (all, name, rest) => {
    const n = rest.trim().split(/\s+/).filter(Boolean).map(Number);
    if (name === 'ground') return '<line x1="15" y1="140" x2="225" y2="140"/>';
    if (name === 'man') {
      const [x, y] = n;
      return `<circle cx="${x}" cy="${y}" r="10"/><line x1="${x}" y1="${y + 10}" x2="${x}" y2="${y + 54}"/>`
        + `<line x1="${x}" y1="${y + 54}" x2="${x - 10}" y2="${y + 88}"/><line x1="${x}" y1="${y + 54}" x2="${x + 10}" y2="${y + 88}"/>`;
    }
    if (name === 'arrow') return arrow(n[0], n[1], n[2], n[3], false);
    if (name === 'darrow') return arrow(n[0], n[1], n[2], n[3], true);
    throw new Error('知らない部品: ' + all);
  });
}

function buildSvg(inner, labels) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const texts = (labels || []).map(([x, y, s]) =>
    `<text x="${x}" y="${y}" font-size="11" text-anchor="middle" fill="black" stroke="none">${esc(s)}</text>`).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><rect width="240" height="160" fill="white"/>'
    + '<g fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'
    + expand(inner) + '</g>' + texts + '</svg>';
}

const lists = readLists();
let made = 0;
const changed = new Set(); // 語を足した単語集
for (const file of process.argv.slice(2)) {
  const drafts = require(path.resolve(file));
  for (const d of drafts) {
    const key = d.w.toLowerCase();
    // この単語が載っている単語集と、単語帳の例文を集める
    const inLists = [];
    const bookExamples = [];
    for (const l of lists) {
      for (const e of l.words) {
        if (String(e.word).toLowerCase() !== key) continue;
        inLists.push({ name: l.name, number: e.number });
        for (const x of e.examples || []) bookExamples.push({ source: l.name, en: x.en, ja: x.ja });
      }
    }
    if (!inLists.length) { // まだどの単語集にも無い単語は「重要語」の末尾に足す(イディオム=空白を含む語は「イディオム」へ)
      const core = lists.find((l) => l.id === (key.includes(' ') ? 'idiom' : 'core'));
      const number = core.words.reduce((m, e) => Math.max(m, e.number), 0) + 1;
      core.words.push({ number, word: d.w, examples: [] });
      inLists.push({ name: core.name, number });
      changed.add(core);
    }
    const tex = d.tex || [];
    const out = {
      word: d.w,
      pos: d.pos,
      ipa: d.ipa,
      core_image: { text: d.core, svg: buildSvg(d.svg, d.lab) },
      etymology: d.ety,
      en_definitions: d.def.map(([pos, text]) => ({ pos, text })),
      cautions: d.cau,
      patterns: d.pat.map(([form, meaning]) => ({ form, meaning })),
      examples: [
        ...bookExamples.map((x, i) => ({ source: x.source, label: tex[i] || tex[tex.length - 1] || '単語帳の例文', en: x.en, ja: x.ja })),
        ...d.ex.map(([label, en, ja]) => ({ source: 'original', label, en, ja })),
      ],
      check_points: d.chk,
      exam: { frequency: d.exam[0], note: d.exam[1] },
      lists: inLists,
    };
    fs.writeFileSync(path.join(dataDir, 'words', key + '.json'), JSON.stringify(out, null, 2) + '\n');
    made++;
  }
}
for (const l of changed) {
  fs.writeFileSync(path.join(dataDir, 'lists', l.id + '.json'), JSON.stringify(l, null, 2) + '\n');
}
console.log('作りました:', made, '語');
