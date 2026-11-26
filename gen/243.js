// 下書き 243(使い分けを作る語:水・空・天体 ocean / sea / lake / pond / river / sky / sun / moon / star / planet)
module.exports = [
{ w:'planet', pos:['名詞'], ipa:'/ˈplænɪt/', core:'恒星のまわりを回る、さまよう星(惑星)',
  svg:'<circle cx="60" cy="80" r="20"/><ellipse cx="120" cy="80" rx="100" ry="36" stroke-dasharray="4 4"/><circle cx="200" cy="64" r="10"/><ellipse cx="200" cy="64" rx="18" ry="4"/>',
  lab:[[120,140,'まわる']],
  ety:'ギリシャ語 planētēs(さまよう者:星座の間を動き回って見える星) → 惑星 → (the planet)地球',
  def:[['名詞','a large round object in space that moves around a star; (the planet) the earth.']],
  cau:['star=恒星(自分で光る)/planet=惑星(恒星のまわりを回る)','the planet=(環境の文脈で)地球','planetary=惑星の'],
  pat:[['the planet','地球'],['save the planet','地球を救う'],['a planet like Earth','地球に似た惑星']],
  ex:[['惑星','Mars is called the red planet.','火星は赤い惑星と呼ばれる。'],
      ['地球','We must protect the planet for future generations.','未来の世代のために地球を守らなければならない。'],
      ['回る','The planets move around the sun.','惑星は太陽のまわりを回る。'],
      ['生命','Is there life on other planets?','ほかの惑星に生命はあるのだろうか。'],
      ['8つ','There are eight planets in our solar system.','太陽系には8つの惑星がある。'],
      ['発見','Scientists found a planet similar to Earth.','科学者たちは地球に似た惑星を発見した。']],
  chk:['star と planet のちがいを言えるか'],
  exam:['頻出','the planet(=地球)が長文で出る。'] }
];
