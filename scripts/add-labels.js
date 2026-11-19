// 線画に短い言葉(ラベル)を足す。お試し10単語用。何度実行しても同じ結果になる
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data', 'words');
// [x, y, 言葉] 座標は viewBox 0 0 240 160
const L = {
  observe: [[118, 38, 'じっと見る'], [188, 28, '対象・ルール']],
  maintain: [[196, 92, '支え続ける'], [40, 42, 'そのまま']],
  consider: [[52, 34, 'じっくり考える'], [178, 76, 'いろいろな点']],
  suggest: [[120, 34, 'こんな案はどう?']],
  issue: [[58, 92, '中'], [196, 24, '外へ出る']],
  attend: [[56, 28, '心も体も'], [188, 17, '向ける先']],
  figure: [[168, 154, '人の姿・図形・数字']],
  matter: [[104, 28, '重い=大事'], [200, 38, '軽い']],
  run: [[188, 46, '止まらず進む'], [192, 130, '流れ続ける']],
  account: [[76, 64, '数える'], [176, 71, '記録する']],
};
for (const [w, labels] of Object.entries(L)) {
  const f = path.join(dir, w + '.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  let s = d.core_image.svg.replace(/<text[^>]*>[^<]*<\/text>/g, '');
  const t = labels.map(([x, y, s]) => `<text x="${x}" y="${y}" font-size="11" text-anchor="middle" fill="black" stroke="none">${s}</text>`).join('');
  d.core_image.svg = s.replace(/<\/svg>\s*$/, t + '</svg>');
  fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
}
console.log('ラベルを付けました:', Object.keys(L).length, '語');
