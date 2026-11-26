// 下書き 255(使い分け:頻度の副詞 / 時の前置詞 always / usually / often / sometimes / rarely / again / before / after / since / until)
module.exports = [
{ w:'rarely', pos:['副詞'], ipa:'/ˈrerli/', core:'めったに〜しない(ほとんど0)',
  svg:'<line x1="20" y1="80" x2="220" y2="80"/><circle cx="40" cy="80" r="8"/><circle cx="80" cy="80" r="8"/><circle cx="120" cy="80" r="8"/><circle cx="120" cy="80" r="4"/><circle cx="160" cy="80" r="8"/><circle cx="200" cy="80" r="8"/>',
  lab:[[120,40,'めったに…ない']],
  ety:'rare(まれな:ラテン語 rarus=まばらな) + -ly → まれに・めったに〜ない',
  def:[['副詞','not often; almost never.']],
  cau:['rarely=seldom=めったに〜ない(否定の意味をもつ:not はいらない)','Rarely do I ...=(倒置)めったに〜しない','hardly / scarcely=ほとんど〜ない(程度)','rare=まれな・(肉が)生焼けの'],
  pat:[['rarely','めったに〜ない'],['Rarely do S V','(倒置)めったに〜しない'],['rare','まれな']],
  ex:[['めったに','My father rarely gets angry.','父はめったに怒らない。'],
      ['倒置','Rarely do we see such snow in Tokyo.','東京でこんな雪はめったに見ない。'],
      ['まれな','It is rare to see a rainbow at night.','夜に虹を見るのはまれだ。'],
      ['seldom','He seldom eats breakfast.','彼はめったに朝食を食べない。'],
      ['not 不要','She rarely watches TV.','彼女はめったにテレビを見ない(not はつけない)。'],
      ['珍しい','This is a rare bird.','これは珍しい鳥だ。']],
  chk:['rarely に not をつけないことがわかるか'],
  exam:['頻出','rarely / seldom、倒置が出る。'] }
];
