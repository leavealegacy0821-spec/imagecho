// 下書き 264(使い分け:服 clothes / dress / shirt / jacket / coat / uniform / hat / shoe / sock / pocket)
module.exports = [
{ w:'uniform', pos:['名詞','形容詞'], ipa:'/ˈjuːnɪfɔːrm/', core:'みんな同じ形の服(制服)・ばらつきのない',
  svg:'{ground}{man 60 52}{man 120 52}{man 180 52}<rect x="48" y="66" width="24" height="30"/><rect x="108" y="66" width="24" height="30"/><rect x="168" y="66" width="24" height="30"/>',
  lab:[[120,20,'おなじ']],
  ety:'ラテン語 uni-(1つ) + forma(形) → 1つの形 → (形容詞)一様な・均一の → (名詞)同じ形の服=制服',
  def:[['名詞','a special set of clothes worn by all members of a group.'],['形容詞','the same in all parts or at all times.']],
  cau:['school uniform=学校の制服','in uniform=制服を着て','(形容詞)uniform=一様な・ばらつきのない(a uniform size)','uni-=1つ(unite・unique・universe)'],
  pat:[['school uniform','制服'],['in uniform','制服を着て'],['uniform A','一様なA']],
  ex:[['制服','We wear uniforms at our school.','私たちの学校は制服だ。'],
      ['制服姿','A man in uniform came to the door.','制服姿の男性が玄関に来た。'],
      ['一様','The boxes are uniform in size.','箱は大きさがそろっている。'],
      ['同じ形','"Uni" means one, so "uniform" means one form.','uni は1つという意味なので、uniform は「1つの形」だ。'],
      ['警官','Police officers wear blue uniforms.','警官は青い制服を着る。'],
      ['均一','The temperature was uniform throughout the room.','部屋の温度はどこも均一だった。']],
  chk:['uniform(形容詞)の意味を言えるか'],
  exam:['標準','形容詞の uniform が長文で出る。'] }
];
