# 進み具合(PROGRESS)

仕様は `SPEC.md`。このファイルは「どこまで終わったか・次に何をするか」の記録。

## 今の段階

**第1段階：10単語のお試しデータで骨組みを完成させる**(→ 本人の確認待ちで止まる)

お試しの10単語：observe, maintain, consider, suggest, issue, attend, figure, matter, run, account

## タスク一覧

| # | タスク | 担当が触る場所 | 状態 |
|---|--------|----------------|------|
| A | 品質チェックと索引づくりのスクリプト | `scripts/` | 完了(見本データで合格/不合格の判定を確認済み。実データでの確認は D で) |
| B | アプリ本体(画面・検索・発音・マーク・前後移動・PWA) | 直下の `index.html` `css/` `js/` `sw.js` `manifest.webmanifest` `icons/` | 作業中 |
| C | お試し10単語の解説データ | `data/words/` `data/lists/trial.json` | 完了(10語とも validate.js 合格・索引作成済み。語源と発音記号は辞書と未照合) |
| D | 3つを合わせた動作確認(指揮役) | — | 未着手 |
| E | 本人の確認 | — | 未着手 |
| F | 単語帳の写真の読み取り → 確認用一覧 | `input/` `data/lists/` | 写真待ち |
| G | 全単語の解説生成(50語ずつ・並列)＋品質チェック | `data/words/` | E と F の後 |
| H | 公開(GitHub ＋ 静的サイト公開サービス) | — | 本人と相談してから |

## 決めたこと(ファイルの約束)

- `data/lists/<id>.json`：単語集。`{ "id", "name", "words": [ { "number", "word", "examples": [ { "en", "ja" } ] } ] }`
  - `examples` は単語帳に載っている例文(原文のまま)。お試しデータでは空
- `data/words/<単語(小文字)>.json`：解説。形式は SPEC.md 3-4 のとおり
  - 例文の `source` は単語集の `name`(例：`LEAP`)か `original`(自作)
- `data/index.json`：`scripts/build-index.js` が自動で作る索引(手で書かない)
  - `{ "version", "lists": [ { "id", "name", "count" } ], "words": [ { "word", "core", "ja", "lists": [ { "id", "name", "number" } ] } ] }`
  - `ja` は日本語検索用の文字列、`version` はデータが変わったことをアプリに知らせる印
- データを変えたら毎回：`node scripts/validate.js` → `node scripts/build-index.js`

## 途中で止まったときの再開メモ(2026-11-15)

- 利用量の上限が近い(5時間枠の90%)。止まったらここから再開する
- A・C は完了。B(アプリ本体)は作業中だった。直下に `index.html` `js/` `css/` `sw.js` があるかを見て、無ければ・途中ならBをやり直す(指示内容は「タスク一覧」のBの行と SPEC.md)
- 本人が10単語の中身を自分で確認中:`leavealegacy/品質チェック-10単語.html`(仮の確認用ページ。アプリの一部ではない)
- 本人のOKが出るまで全単語の生成(G)は始めない

## 現在の状態(2026-11-15 更新)

- A・B・C 完了。D(合わせた動作確認)も完了:PCのChromeをスマホ幅で自動操作し、一覧・詳細9項目・前後移動・マーク保存・検索(日本語/英語)・オフライン表示がエラー0件で動いた
- 未確認:iPhone実機(読み上げの音・ホーム画面追加)
- **本人から「見た目がイメージと違う」との指摘あり。どう違うかを聞いている途中。答えをもらってから見た目を作り直す**(`css/style.css` が中心。直したら `sw.js` の `APP_VERSION` を上げる)
- 確認用サーバー:`node <scratchpad>/serve.js imagecho 8765` → http://localhost:8765/

## 次にすること(古い記述)

1. A・B・C の完成を待ち、それぞれ確認する
2. D：合わせて動かし、検索・発音・マーク・前後移動・オフラインを確かめる
3. 本人に見てもらう(ここで止まる)

## 2026-11-15 デザイン決定

- 本人が「墨と金」(`css/themes/b.css`)を選んだ。`index.html` で固定読み込みにし、`sw.js` を v3 にして部品一覧に追加済み。仮の切替スクリプトは削除済み
- 残してある仮のもの(公開前に消す):`css/themes/a,c,d,e.css`、`design/`、B以外の `fonts/`、`sw.js` 内の「仮」と書いた分岐
- 未決(本人の返事待ち):語源の「→」を階段状に表示/例文中の見出し語に色を付ける
- 既知の不具合:ホームで単語集が1冊のとき「null」と表示される(`js/app.js` の renderHome)
- 発音は保留(声の選び方は直したが音は未確認。iPhone で聞いてから決める)
- **進め方の変更**:トークン消費が大きいので、サブエージェントの並列はやめる。小さな直しは指揮役が直接やる。返事は短く

## 2026-11-15 追加の直し(指揮役が直接)

- 線画に短い言葉を入れる(本人の要望)。10語は `scripts/add-labels.js` で追加済み。**全単語の生成時は、SVG に `<text font-size="11" text-anchor="middle" fill="black" stroke="none">` の短い日本語ラベルを1〜2個入れるよう指示する**(絵の線と重ねない)
- 例文中の見出し語を金色で強調(`js/app.js` の markWord。不規則変化は IRREGULAR 表に足す。全単語の生成時に表を広げる必要あり)
- ホームの「null」表示を修正。`sw.js` は v4
- 本人の判断:語源の階段表示=保留(説明待ち)、項目をエリアに分ける案=やらない

## 再開するときはここから(2026-11-15 時点)

- 本人が試作品(墨と金・10単語)に「今の感じで進める」とOK。語源の階段表示は入れていない
- **次:本人が単語帳の写真を `input/` に入れる(11/16 の予定)** → 読み取り → 確認用の一覧を本人に見せる → OK後に全単語の生成
- 全単語の生成を始める前に、1回に何語ずつ進めるか(5時間枠に収まる量)を本人と決める
- 確認用サーバーはチャットを閉じると止まる。立て直し方は上の「現在の状態」を参照(serve.js が消えていたら簡単な静的サーバーを作り直す)

## 2026-11-16 方針変更:単語は指揮役が選ぶ・エージェントなしで直接作る

- 本人の指示:単語帳(LEAPの索引写真を受け取った)には頼らず、**指揮役が自分で単語を選んでよい**。サブエージェントは使わず、指揮役が直接ひたすら作る。Fable が使えるのは 11/17 16時ごろまでとのこと
- 単語集は `data/lists/core.json`(名前「重要語」)の1冊。お試し10語もここに入れた。単語帳の例文は無いので例文はすべて自作
- **作り方**:`gen/NNN.js` に短い書き方で10語ずつ書く → `node scripts/make-words.js gen/NNN.js`(単語集への追加も自動)→ `node scripts/validate.js` → `node scripts/build-index.js`。書き方は `scripts/make-words.js` の冒頭と `gen/002.js` を見本に
- 線画は部品 `{ground}` `{man x y}` `{arrow}` `{darrow}` と `lab`(短い言葉)で描く。10語ごとに並べた写真で目で確認(scratchpad の task-b/grid.js。無ければ作り直す)
- 不規則変化の動詞を入れたら `js/app.js` の IRREGULAR 表に足し、`sw.js` の APP_VERSION を上げる
- 選ぶ基準:意味がいくつもあって、核となるイメージで一気に理解できる入試重要語を優先
- **できた語(1838)**:お試し10(observe maintain consider suggest issue attend figure matter run account)/001(oppose offer impress inform material natural invent manage improve medicine)/002(apply charge address order subject bear due term deal present)／003(concern content cover direct face fine follow hold last lead)／004(mean meet miss raise reason respect serve stand work yield)／005(sound count break case cause close command company condition credit)／006(party degree even fail firm free ground interest leave object)／007(mind note pay practice rate rest right sense sentence settle)／008(state still succeed save short long line move want way)／009(appreciate afford assume attribute commit contribute feature identify involve reflect)／010(provide prevent regard remind require expect depend compare replace recognize)／011(affect available determine establish encourage exchange extend express tend treat)／012(admit adopt adapt acquire achieve approach argue arrange associate avoid)／013(conduct consist contain convince deliver demand deny deserve develop devote)／014(engage ensure estimate expose focus force gain generate grant handle)／015(imply indicate insist intend introduce judge lack limit obtain occur)／016(participate perceive perform permit persuade prefer pretend produce promote propose)／017(reach realize receive reduce refer refuse relate release rely remain)／018(represent resist respond reveal satisfy seek share suffer supply support)／019(suppose survive suspect sustain threaten transfer transform urge vary warn)／020(aware capable certain common familiar likely particular similar worth willing)／021(allow differ earn shift nature purpose decline recover consume conclude)／022(emerge enable eliminate enhance evaluate exist explore distinguish display distribute)／023(increase decrease adjust confirm define inspire combine compete complain concentrate)／024(interpret investigate measure neglect operate organize overcome owe pursue publish)／025(accuse attach attempt belong bother claim collapse conflict consult cope)／026(declare deprive derive dismiss doubt employ endure exceed excuse exclude)／027(drive escape delay defend detect disturb expand extract fit fix)／028(forbid forgive gather guarantee hesitate ignore impose include influence inherit)／029(injure interfere interrupt invest justify launch locate mention modify notice)／030(occupy oblige offend omit possess predict preserve proceed prove recommend)／031(protect recall regret reject remove resemble restore retire spread strike)／032(submit substitute surround tolerate trace trust undergo upset weigh wonder)／033(anxious apparent appropriate considerable considerate efficient essential obvious sensitive sensible)／034(accommodate acknowledge anticipate assure blame accompany absorb confuse correspond convey)／035(appeal assign compensate contrast dispose prompt reserve resolve retain spare)／036(abandon attract behave confront convert encounter exhibit prohibit refrain relieve)／037(accustom dedicate postpone resort distract conceive deceive confine contradict inhabit)／038(acquaint adhere appoint conform consent entitle exaggerate inquire resign spoil)／039(assert comprehend constitute dominate dwell embrace emphasize exploit illustrate isolate)／040(incline induce compel inhibit concede accord foster evolve dispense endeavor)／041(suspend infer confer compose deduce reconcile resume subscribe abide persist)／042(rob rid cure clear hinder discourage deter notify mistake keep)／043(prevail provoke cultivate exert contend dispute lend spend cost stick)／044(pose secure bound fair plain odd suit minute board bill)／045(approve assess assist comply render withdraw undertake overlook qualify tempt)／046(attain conceal disclose enforce facilitate compromise exhaust stimulate bind seize)／047(grasp conserve diminish disguise evoke flourish imitate indulge devise abolish)／048(overwhelm entertain exercise cease alter contemplate tackle fulfill boast outweigh)／049(reckon endow cling venture assemble prescribe deliberate abound strive stem)／050(arise undermine coincide ascribe inflict distort surpass integrate accumulate defy)／051(restrict reinforce resent revise sacrifice presume precede prolong pronounce utter)／052(confess disregard embarrass envy flatter refine reform register renew surrender)／053(strain stretch scatter retreat vanish rescue recruit swallow tear quit)／054(abuse arouse clarify comprise deem digest dissolve divert incur obey)／055(draw pass carry mislead intervene transmit allocate reluctant inevitable subtle)／056(lie lay rise found cast hang emit inspect reside commute)／057(conscious ashamed contrary steal borrow match contract means manner beat)／058(tell help book fire apologize explain marry discuss enter lose)／059(appear turn wear touch mark spell otherwise hurt occasion plant)／060(remember forget stop try character chance view late fault convenient)／061(agree afraid sure use need advance field patient hard admire)／062(kind room spot letter own custom fortune sight trouble dare)／063(respectable respectful respective industrial industrious economic economical imaginary imaginative imaginable)／064(praise punish criticize reward sort end rule change relevant sufficient)／065(request strip risk promise literal literary literate successive historic historical)／066(game lot well will accept shed rear thrive spirit temper)／067(abstract moderate manifest peculiar decent grave stock draft vain convention)／068(acute adequate alternative apprehend discipline fancy tender modest deposit faint)／069(substantial subsequent contemporary prominent vulnerable inherent obscure explicit implicit novel)／070(property faculty fare fashion capital harbor keen liable apt eager)／071(race story desert complement compliment lean spring sign check quote)／072(advise congratulate imagine scale post plot function mature objective perspective)／073(furnish equip entrust happen industry current medium trial volume tip)／074(result effect favor expense virtue hand head dawn insure elaborate)／075(superior inferior prior absent relative positive critical bring set put)／076(take make get give become talk rent hire dissuade seat)／077(call come look see feel find seem fall catch scold)／078(have let go grow say speak hear wish hope thank)／079(severe strict steady mere rough humble brief vague scarce alike)／080(cross pick drop hit fond proud curious grateful indifferent ignorant)／081(point part course light watch cut ask decide fill show)／082(consequence circumstance instance tie ban describe answer worry audience price)／083(press quarter feed reverse mount prone remark exempt suppress ruin)／084(restrain distinct vital bend sink shape word sharp entail store)／085(wind row date stake prospect breed stir regulate discard stare)／086(demonstrate dictate split sweep shrink trigger outline scope plead wander)／087(condemn domestic vessel cell craft pupil flee drain speculate steep)／088(consistent constrain endorse linger impair perish retrieve foresee accomplish nurture)／089(challenge originate major discern esteem prejudice withstand withhold fast await)／090(track flat screen excel merit testify embark confide manipulate allege)／091(seal air bar file toll concrete sanction arrest provision lodge)／092(play balance range rank form stuff branch instrument vehicle loose)／093(win possible necessary easy surprise disappoint graduate reply damage fee)／094(advantage benefit harm pain duty taste attention pity habit effort)／095(value standard ordinary evident attitude burden mood sake glance remedy)／096(contact capacity minor train sympathy despise fade dull ambiguous tough)／097(affair authority edge element surface witness token remote immediate cheat)／098(odds principal principle frame amount mass aim virtual potential genuine)／099(sheer drift margin solid prime bias scheme stable initial intimate)／100(stress lift pitch tone level pace radical convict fuel grace)／101(experience discharge commission compound bond peer rush idle extent service)/102(capture cite constant decay drag fold grip span stroke trail)／103(steer spur sway harness anchor boost hollow bare clash tide)／104(hide examine guard listen gaze glimpse survey analyze shelter shield)／105(destroy demolish astonish amaze startle annoy irritate frustrate frighten dread)／106(please delight amuse thrill comfort console soothe shout whisper murmur)／107(soar surge climb ascend descend plunge plummet slump fluctuate peak)／108(understand think believe know learn study teach announce debate negotiate)／109(huge vast enormous immense tremendous massive tiny slight trivial negligible)／110(important significant crucial fundamental primary chief indispensable urgent serious basic)／111(accurate precise exact correct proper error wrong false flaw defect)／112(quick rapid swift sudden abrupt gradual slow hurry hasten instant)／113(frequent occasional rare seldom hardly scarcely usual regular typical normal)／114(idea concept notion theory hypothesis opinion thought assumption evidence proof)／115(job occupation profession career task labor employment chore assignment mission)／116(society community public citizen resident inhabitant population crowd nation tribe)／117(language phrase expression vocabulary dialect accent tongue grammar idiom translate)／118(travel trip journey tour voyage excursion expedition flight migrate transport)／119(danger hazard threat crisis emergency disaster catastrophe accident incident event)／120(wealth income salary wage profit budget debt tax loan fund)／121(health disease illness symptom wound ache fever treatment therapy diagnosis)／122(environment pollution contaminate climate weather resource energy waste species habitat)／123(research experiment discover data method technique technology sample knowledge information)／124(gentle generous polite rude honest sincere frank shy brave cruel)／125(bold timid confident calm nervous arrogant stubborn lazy diligent careful)／126(begin start commence initiate finish complete terminate continue wait stay)／127(throw toss hurl fling push pull thrust shove tug haul)／128(chop slice carve crack snap shatter crush squeeze twist pierce)／129(beautiful pretty lovely handsome attractive elegant charming ugly cute gorgeous)／130(choose select elect opt vote nominate symbolize signify embody denote)／131(shine glow sparkle glitter flash gleam flicker blaze dazzle twinkle)／132(walk stroll stride march stagger crawl creep limp dash sprint)／133(chat gossip chatter mutter mumble stammer yell scream cry weep)／134(hug clasp clutch pat rub scratch tap poke pinch knock)／135(eat drink chew bite sip gulp nibble devour lick feast)／136(sleep asleep nap doze yawn snore dream wake awake relax)／137(wet damp moist humid dry soak drip leak splash flood)／138(straight curved crooked smooth blunt narrow broad wide thick thin)／139(hot warm cool cold chilly mild freeze boil melt heat)／140(noise voice echo roar whistle buzz rattle crash bang hum)／141(era age period decade century moment season generation interval phase)／142(place space area region district zone territory site location neighborhood)／143(number quantity sum total plenty majority minority proportion percentage ratio)／144(link connect join unite merge mix blend separate divide detach)／145(joy sorrow grief anger rage fear anxiety relief shame guilt)／146(ability skill talent gift aptitude competence expertise genius intelligence wisdom)／147(goal target plan project program strategy tactic policy agenda schedule)／148(question problem difficulty puzzle mystery riddle dilemma obstacle barrier setback)／149(reaction response feedback comment criticism complaint advice suggestion recommendation proposal)／150(rigid flexible awkward bitter dense crude)／151(swell summon disrupt conquer tense fragile)／152(collide grind subside deploy prosper compile enroll heal)／153(erode dwindle cherish evade verify deviate immerse obstruct)／200(build construct manufacture create design erect fabricate repair mend renovate)／201(bright brilliant vivid pale dim dark gloomy shadow shade transparent)／202(strange weird bizarre eccentric foreign alien exotic unknown remarkable extraordinary)／203(smell scent odor aroma fragrance stink sniff flavor sweet sour)／204(law justice court crime offense sin criminal victim innocent guilty)／205(government govern politics democracy freedom liberty independence power control dictator)／206(trade commerce market business economy export import consumer customer client)／207(education school class lesson lecture grade exam test quiz scholarship)／208(relationship friendship partner colleague companion acquaintance ancestor sibling spouse enemy)／209(faith belief confidence certainty suspicion reliable trustworthy suspicious skeptical doubtful)／210(origin source root seed birth beginning foundation basis core essence)／211(whole entire partial piece portion fraction section segment fragment component)／212(appearance aspect image impression scene landscape scenery spectacle vision outlook)／213(victory triumph success defeat loss failure competition contest rival champion)／214(happy glad cheerful excited sad unhappy miserable depressed lonely bored)／215(simple straightforward elementary difficult complex complicated demanding challenging advanced sophisticated)／216(rotate spin roll swing bounce slide slip glide tumble float)／217(pour spill flow stream sprinkle pile heap stack grab snatch)／218(border boundary frontier rim brink verge fringe outskirts suburb threshold)／219(laugh smile grin giggle chuckle frown sneer sigh groan sob)／220(nod shrug wave bow wink kneel crouch stoop squat glare)／221(jump leap hop skip jog stumble trudge tiptoe wade dart)／222(fly flutter hover swim dive sail hike trek emigrate immigrate)／223(cook bake roast grill fry toast steam stew simmer peel)／224(hunger hungry starve famine thirst thirsty appetite meal snack diet)／225(dish recipe ingredient cuisine dessert spice nutrition nutrient protein calorie)／226(fresh raw ripe rotten stale organic delicious tasty salty spicy)／227(clever smart wise intelligent shrewd cunning foolish stupid silly naive)／228(rich wealthy affluent prosperous poor needy broke courageous daring coward)／229(tired exhausted weary sleepy fatigue quiet silent peaceful noisy loud)／230(angry furious mad indignant scared frightened terrified scary horror panic)=計1838語
- **次に作る候補**:concern, content, cover, direct, face, fine, follow, hold, last, lead, mean, meet, miss, party, raise, reason, respect, serve, stand, work, yield, sound, count, bill, board, break, case, cause, close, command, company, condition, credit, degree, even, fail, firm, free, game, ground, help, interest, kind, leave, letter, line, long, lot, mind, minute, move, nature, note, object, pay, practice, race, rate, rest, right, room, save, sense, sentence, settle, short, state, still, story, succeed, want, way, well, will

## 2026-11-16 夜:自動で作り続ける設定

- このチャットに、約15分おきに「次の10語を作る」指示が自動で入る予約を入れた(ジョブ b3470c2b)。チャットを閉じると消える。11/17 16:00 を過ぎたら自分で止める
- 線画の中の文字は本人の感想(主張が強い)を受けて小さく灰色にした(`css/themes/b.css` 末尾)

## 2026-11-17 夜:めくる形式と検索

- 本人の使い方:(1) 単語を検索する (2) すき間時間に1語ずつインプットする。一覧をタップして戻る操作はめんどう、脈絡なく出るのもつらい、とのこと
- 単語一覧の上にも検索欄を常に表示(`css/themes/b.css` の #masthead sticky)
- **めくって覚える**:ホームから開始。1語ずつ指で左右に払ってめくる(PC は ← →)。並びは `data/groups.json` のまとまり(語根・語法・多義語など30)順。同じ語が別のまとまりに再登場することがある。build-index.js が index.json の groups に入れる。まとまりに無い語は「そのほか」に自動で入る
- 最後にめくった位置は localStorage `imagecho:flowPos`。ホームに「続きから」
- 単語の自動作成は予約ジョブで続行中(新しい語は groups.json にも足す)

## 2026-11-23 アプリ化(公開の準備)

- 本人が公開先に **Cloudflare Pages** を選んだ(リポジトリは非公開のまま)。アカウント作成と GitHub 連携は本人が行う
- 公開前の片付け:デザイン見比べ用の仮のもの(`css/themes/a,c,d,e.css`、`design/`、使わないフォント、`sw.js` の仮の分岐)を削除。`sw.js` は v44
- `scripts/pages-build.sh`:アプリに要るファイルだけを `public/` に集める(gen/ scripts/ *.md は出さない。検索よけの `_headers` 付き)。Cloudflare の設定は「ビルドコマンド `sh scripts/pages-build.sh`/出力ディレクトリ `public`/フレームワークなし」
- public/ をスマホ幅で開いて確認:表示・オフライン表示ともエラー0件
- 方針変更:本人が「リポジトリは秘密でなくてよい」と判断 → **GitHub Pages** で公開する(Cloudflare はやめ)。`.github/workflows/pages.yml` が main への push ごとに `scripts/pages-build.sh` で public/ を作って公開する。本人がリポジトリを Public にし、Settings → Pages の Source を「GitHub Actions」にする

## 2026-11-24 公開した

- リポジトリを Public にし、Pages(GitHub Actions)を有効化。**公開URL:https://leavealegacy0821-spec.github.io/imagecho/**
- 980語が公開側に出ていることを確認(index.json 980語・各ページ 200)。main に push すると自動で反映
- 1回目のデプロイは「artifact が見つからない」で失敗、再実行で成功(一時的なものと判断)。また落ちたら Actions で再実行
- 未確認:iPhone 実機でのホーム画面追加・オフライン・読み上げ

## 2026-11-25:めくる順を「使い分け」中心に組み替え
- 本人の希望(似た意味の語をコアイメージで使い分けたい。語源での分類はしっくりこない)により、`data/groups.json` を作り直した
- 先頭に「使い分け:〜」のまとまり132個(見る・言う・得る・禁止する・費用 など)。note に「語=コアイメージ」を並べ、めくるときに上に出る
- 語根(語源)のまとまりと「考える・変える」などの大きなテーマのまとまりは削除。語法・まぎらわしい形容詞は残し、多義語は使い分けに入らなかった語だけ残した
- 今後の語選びは、使い分けのまとまりを埋める語を優先(AGENTS.md に追記)

## 2026-11-25:自動作業と番号がぶつかったので整理
- 対話の作業(作業用ブランチ)で 104〜149 を作っている間に、2時間ごとの自動作業が main に 104〜107 を作っていた(番号と12語が重複)
- main を取りこみ、自動作業の分は 150〜153 に付け替え。重なった12語(mild bold dash crush plunge surge leak soak thrust shelter soar detach)は対話の作業の版を残し、残り28語を取りこんだ
- 今後の番号は AGENTS.md の分担に従う(自動作業 154〜199/対話 200〜)
