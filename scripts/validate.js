#!/usr/bin/env node
'use strict';
// 品質チェック(SPEC.md 3-3)。
// 使い方: node scripts/validate.js [--data <dataフォルダ>] [--json] [単語 ...]
//   --data  データの場所(既定は ./data)
//   --json  結果を機械で読めるJSONで標準出力に出す
//   単語    指定したらその単語だけ調べる
// 不合格が1つでもあれば終了コード1。

const fs = require('fs');
const path = require('path');
const {
  readJson,
  listJsonFiles,
  wordKey,
  isNonEmptyString,
  isPlainObject,
  loadLists,
} = require('./common');

// ---------- 引数 ----------

function parseArgs(argv) {
  const opts = { dataDir: './data', json: false, words: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data') {
      i++;
      if (argv[i] === undefined) throw new Error('--data の後ろにフォルダを指定してください');
      opts.dataDir = argv[i];
    } else if (a === '--json') {
      opts.json = true;
    } else if (a.startsWith('--')) {
      throw new Error(`知らないオプションです: ${a}`);
    } else {
      opts.words.push(a);
    }
  }
  return opts;
}

// ---------- SVG のチェック ----------

const SVG_MAX_LENGTH = 8000;
const SVG_MIN_SHAPES = 3;
const SHAPE_TAGS = ['line', 'circle', 'path', 'rect', 'ellipse', 'polyline', 'polygon'];
const FORBIDDEN_TAGS = ['script', 'foreignobject', 'image', 'style'];
const ALLOWED_COLORS = ['none', 'black', 'white', '#000', '#000000', '#fff', '#ffffff', 'currentcolor'];
// 色を決める属性。stroke・fill に加え、currentColor の元になる color も同じ基準で見る。
const COLOR_PROPS = ['stroke', 'fill', 'color'];

// タグ1個ぶん(<名前 属性…> / </名前> / <名前 … />)。属性値の中の > は無視する。
const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;
const ATTR_RE = /([^\s=\/"'<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function checkColor(prop, value, where, errors) {
  const v = value.trim().toLowerCase();
  if (!ALLOWED_COLORS.includes(v)) {
    errors.push(`SVG: 色は白黒のみです(${where} の ${prop}="${value.trim()}")`);
  }
}

// SVG文字列を調べ、問題を日本語の文の配列で返す(空なら問題なし)。
function checkSvg(svgRaw) {
  const errors = [];
  const svg = svgRaw.trim();

  if (svgRaw.length > SVG_MAX_LENGTH) {
    errors.push(`SVG: 文字数が多すぎます(${svgRaw.length}文字。上限は${SVG_MAX_LENGTH}文字)`);
  }
  if (!svg.startsWith('<svg')) errors.push('SVG: <svg で始まっていません');
  if (!svg.endsWith('</svg>')) errors.push('SVG: </svg> で終わっていません');
  if (/url\s*\(/i.test(svg)) errors.push('SVG: url( は使えません');

  // 簡単な自前パーサ: 先頭から順にタグを拾い、開き・閉じの対応を積み重ね(スタック)で確かめる
  const stack = [];
  let pos = 0;
  let shapeCount = 0;
  let rootSeen = false;
  let rootHasViewBox = false;
  let broken = false;

  while (pos < svg.length) {
    const lt = svg.indexOf('<', pos);
    const textEnd = lt === -1 ? svg.length : lt;
    // 根の <svg> の外に文字があってはいけない
    if ((stack.length === 0) && svg.slice(pos, textEnd).trim() !== '') {
      errors.push('SVG: <svg>…</svg> の外に余分な文字があります');
    }
    if (lt === -1) break;

    if (svg.startsWith('<!--', lt)) {
      const end = svg.indexOf('-->', lt + 4);
      if (end === -1) {
        errors.push('SVG: コメント(<!--)が閉じられていません');
        broken = true;
        break;
      }
      pos = end + 3;
      continue;
    }

    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(svg);
    if (!m) {
      errors.push(`SVG: タグが壊れています(${lt + 1}文字目あたり: ${svg.slice(lt, lt + 30)})`);
      broken = true;
      break;
    }
    pos = TAG_RE.lastIndex;

    const isClose = m[1] === '/';
    const name = m[2];
    const lower = name.toLowerCase();
    const local = lower.includes(':') ? lower.split(':').pop() : lower;
    let attrText = m[3];
    const selfClose = !isClose && /\/\s*$/.test(attrText);
    if (selfClose) attrText = attrText.replace(/\/\s*$/, '');

    if (isClose) {
      if (attrText.trim() !== '') errors.push(`SVG: 閉じタグ </${name}> に余分な文字があります`);
      if (stack.length === 0) {
        errors.push(`SVG: 開いていないのに閉じています(</${name}>)`);
        broken = true;
        break;
      }
      const top = stack.pop();
      if (top !== name) {
        errors.push(`SVG: タグの開き閉じが対応していません(<${top}> が閉じられる前に </${name}> が来ています)`);
        broken = true;
        break;
      }
      continue;
    }

    // ここから開きタグ(または自己完結タグ)
    if (stack.length === 0) {
      if (rootSeen) {
        errors.push(`SVG: </svg> の後ろに余分な要素があります(<${name}>)`);
      } else {
        rootSeen = true;
        if (name !== 'svg') errors.push(`SVG: いちばん外側が <svg> ではありません(<${name}>)`);
      }
    }
    const isRoot = stack.length === 0 && name === 'svg';

    if (FORBIDDEN_TAGS.includes(local)) errors.push(`SVG: 禁止されている要素です(<${name}>)`);
    if (SHAPE_TAGS.includes(local)) shapeCount++;

    // 属性を調べる
    const leftover = attrText.replace(ATTR_RE, ' ').trim();
    if (leftover !== '') {
      errors.push(`SVG: <${name}> の属性の書き方が壊れています(${leftover.slice(0, 30)})`);
    }
    ATTR_RE.lastIndex = 0;
    let am;
    while ((am = ATTR_RE.exec(attrText)) !== null) {
      const attr = am[1];
      const attrLower = attr.toLowerCase();
      const attrLocal = attrLower.includes(':') ? attrLower.split(':').pop() : attrLower;
      const value = am[2] !== undefined ? am[2] : am[3];
      if (isRoot && attr === 'viewBox' && value.trim() !== '') rootHasViewBox = true;
      if (/^on/.test(attrLocal)) errors.push(`SVG: on○○属性は使えません(<${name}> の ${attr})`);
      if (attrLocal === 'href') errors.push(`SVG: href は使えません(<${name}> の ${attr})`);
      if (COLOR_PROPS.includes(attrLower)) checkColor(attrLower, value, `<${name}>`, errors);
      if (attrLower === 'style') {
        // style属性の中で色を指定している場合も同じ基準で見る
        for (const decl of value.split(';')) {
          const idx = decl.indexOf(':');
          if (idx === -1) continue;
          const prop = decl.slice(0, idx).trim().toLowerCase();
          if (COLOR_PROPS.includes(prop)) {
            checkColor(prop, decl.slice(idx + 1), `<${name}> の style`, errors);
          }
        }
      }
    }

    if (!selfClose) stack.push(name);
  }

  if (!broken && stack.length > 0) {
    errors.push(`SVG: 閉じ忘れのタグがあります(${stack.map((t) => `<${t}>`).join(' ')})`);
  }
  if (!broken && stack.length === 0 && !rootSeen) errors.push('SVG: 要素がありません');
  if (rootSeen && !rootHasViewBox) errors.push('SVG: <svg> に viewBox がありません');
  if (shapeCount < SVG_MIN_SHAPES) {
    errors.push(
      `SVG: 図形の要素が少なすぎます(${shapeCount}個。${SHAPE_TAGS.join(', ')} のどれかが${SVG_MIN_SHAPES}個以上必要)`
    );
  }
  // 同じ文が重なったら1つにまとめる
  return [...new Set(errors)];
}

// ---------- 単語1つぶんのチェック ----------

// 例文にその単語が入っているかをゆるく見るための語幹。
// 末尾の e / y を落として前方一致程度にする(observe→observ で observing も拾える)。
function stemOf(word) {
  const w = word.trim().toLowerCase();
  if (w.length >= 3 && /[ey]$/.test(w)) return w.slice(0, -1);
  return w;
}

// 空でない文字列の配列かどうかを調べ、問題があれば errors に足す。合っていれば true。
function checkStringArray(value, name, errors, min, max) {
  if (!Array.isArray(value)) {
    errors.push(`${name} が配列ではありません(または項目がありません)`);
    return false;
  }
  let ok = true;
  if (value.length < min) {
    errors.push(`${name} は${min}個以上必要です(今は${value.length}個)`);
    ok = false;
  }
  if (max !== undefined && value.length > max) {
    errors.push(`${name} は${max}個までです(今は${value.length}個)`);
    ok = false;
  }
  value.forEach((v, i) => {
    if (!isNonEmptyString(v)) {
      errors.push(`${name}[${i}] が空、または文字列ではありません`);
      ok = false;
    }
  });
  return ok;
}

function checkNonEmptyString(value, name, errors) {
  if (value === undefined) {
    errors.push(`${name} がありません`);
    return false;
  }
  if (typeof value !== 'string') {
    errors.push(`${name} が文字列ではありません`);
    return false;
  }
  if (value.trim() === '') {
    errors.push(`${name} が空です`);
    return false;
  }
  return true;
}

// data: 読み込んだJSON、fileName: ファイル名、lists: 読み込めた単語集
// 戻り値: { word, errors, warnings }
function checkWord(data, fileName, lists) {
  const errors = [];
  const warnings = [];
  const fallbackWord = fileName.replace(/\.json$/i, '');

  if (!isPlainObject(data)) {
    errors.push('中身がオブジェクトではありません');
    return { word: fallbackWord, errors, warnings };
  }

  // --- word とファイル名 ---
  const wordOk = checkNonEmptyString(data.word, 'word', errors);
  const word = wordOk ? data.word : fallbackWord;
  if (wordOk) {
    const expected = `${data.word.toLowerCase()}.json`;
    if (fileName !== expected) {
      errors.push(`ファイル名が word と合いません(ファイル名: ${fileName}、正しくは: ${expected})`);
    }
  }

  // --- pos ---
  const posOk = checkStringArray(data.pos, 'pos', errors, 1);

  // --- ipa ---
  if (checkNonEmptyString(data.ipa, 'ipa', errors)) {
    if (!(data.ipa.length >= 3 && data.ipa.startsWith('/') && data.ipa.endsWith('/'))) {
      errors.push(`ipa は / で始まり / で終わる必要があります(今: ${data.ipa})`);
    }
  }

  // --- core_image ---
  if (!isPlainObject(data.core_image)) {
    errors.push('core_image がありません(またはオブジェクトではありません)');
  } else {
    checkNonEmptyString(data.core_image.text, 'core_image.text', errors);
    if (checkNonEmptyString(data.core_image.svg, 'core_image.svg', errors)) {
      errors.push(...checkSvg(data.core_image.svg));
    }
  }

  // --- etymology ---
  checkNonEmptyString(data.etymology, 'etymology', errors);

  // --- en_definitions ---
  if (!Array.isArray(data.en_definitions)) {
    errors.push('en_definitions が配列ではありません(または項目がありません)');
  } else {
    if (data.en_definitions.length < 1) errors.push('en_definitions は1個以上必要です');
    const definedPos = new Set();
    data.en_definitions.forEach((d, i) => {
      const at = `en_definitions[${i}]`;
      if (!isPlainObject(d)) {
        errors.push(`${at} がオブジェクトではありません`);
        return;
      }
      checkNonEmptyString(d.text, `${at}.text`, errors);
      if (checkNonEmptyString(d.pos, `${at}.pos`, errors)) {
        definedPos.add(d.pos);
        if (posOk && !data.pos.includes(d.pos)) {
          errors.push(`${at}.pos「${d.pos}」が pos(${data.pos.join('・')})に含まれていません`);
        }
      }
    });
    if (posOk) {
      for (const p of data.pos) {
        if (!definedPos.has(p)) errors.push(`品詞「${p}」の英英の定義(en_definitions)がありません`);
      }
    }
  }

  // --- cautions ---
  checkStringArray(data.cautions, 'cautions', errors, 1);

  // --- patterns ---
  if (!Array.isArray(data.patterns)) {
    errors.push('patterns が配列ではありません(または項目がありません)');
  } else {
    if (data.patterns.length < 1) errors.push('patterns は1個以上必要です');
    data.patterns.forEach((p, i) => {
      const at = `patterns[${i}]`;
      if (!isPlainObject(p)) {
        errors.push(`${at} がオブジェクトではありません`);
        return;
      }
      checkNonEmptyString(p.form, `${at}.form`, errors);
      checkNonEmptyString(p.meaning, `${at}.meaning`, errors);
    });
  }

  // --- check_points ---
  checkStringArray(data.check_points, 'check_points', errors, 1, 3);

  // --- exam ---
  if (!isPlainObject(data.exam)) {
    errors.push('exam がありません(またはオブジェクトではありません)');
  } else {
    checkNonEmptyString(data.exam.frequency, 'exam.frequency', errors);
    checkNonEmptyString(data.exam.note, 'exam.note', errors);
  }

  // --- lists(この単語が載っている単語集) ---
  const ownLists = []; // 形式が正しかったものだけ
  if (!Array.isArray(data.lists)) {
    errors.push('lists が配列ではありません(または項目がありません)');
  } else {
    if (data.lists.length < 1) errors.push('lists は1個以上必要です');
    data.lists.forEach((l, i) => {
      const at = `lists[${i}]`;
      if (!isPlainObject(l)) {
        errors.push(`${at} がオブジェクトではありません`);
        return;
      }
      const nameOk = checkNonEmptyString(l.name, `${at}.name`, errors);
      const numOk = Number.isInteger(l.number) && l.number > 0;
      if (!numOk) errors.push(`${at}.number が正の整数ではありません`);
      if (nameOk && numOk) ownLists.push({ name: l.name, number: l.number });
    });
  }
  const ownListNames = new Set(ownLists.map((l) => l.name));

  // --- examples ---
  const validExamples = []; // 形式が正しかったものだけ
  if (!Array.isArray(data.examples)) {
    errors.push('examples が配列ではありません(または項目がありません)');
  } else {
    if (data.examples.length < 5) {
      errors.push(`例文は合計5個以上必要です(今は${data.examples.length}個)`);
    }
    const stem = stemOf(word);
    data.examples.forEach((ex, i) => {
      const at = `examples[${i}]`;
      if (!isPlainObject(ex)) {
        errors.push(`${at} がオブジェクトではありません`);
        return;
      }
      let ok = true;
      for (const key of ['source', 'label', 'en', 'ja']) {
        if (!checkNonEmptyString(ex[key], `${at}.${key}`, errors)) ok = false;
      }
      if (!ok) return;
      validExamples.push(ex);
      if (ex.source !== 'original' && !ownListNames.has(ex.source)) {
        errors.push(
          `${at}.source「${ex.source}」は original でも、この単語の lists にある単語集名でもありません`
        );
      }
      if (!ex.en.toLowerCase().includes(stem)) {
        warnings.push(`${at}: 英文に「${word}」(または活用形)が見当たりません: ${ex.en}`);
      }
    });
  }

  // --- 単語帳との突き合わせ ---
  const key = wordKey(word);
  const listByName = new Map(lists.map((l) => [l.name, l]));

  // (1) words 側の lists に書いてある単語集が実在し、番号が合っているか
  for (const own of ownLists) {
    const list = listByName.get(own.name);
    if (!list) {
      errors.push(`lists の単語集「${own.name}」が data/lists に見つかりません`);
      continue;
    }
    const entries = list.words.filter((w) => wordKey(w.word) === key);
    if (entries.length === 0) {
      errors.push(`単語集「${own.name}」にこの単語は載っていません(lists の書き間違い?)`);
    } else if (!entries.some((e) => e.number === own.number)) {
      errors.push(
        `単語集「${own.name}」の番号が合いません(解説側: ${own.number}、単語集側: ${entries
          .map((e) => e.number)
          .join('・')})`
      );
    }
  }

  // (2) 単語集ごとに、単語帳の例文が1つも欠けず・書き換えられずに入っているか
  for (const list of lists) {
    const entries = list.words.filter((w) => wordKey(w.word) === key);
    if (entries.length === 0) continue;
    if (!ownListNames.has(list.name)) {
      errors.push(`単語集「${list.name}」に載っているのに、lists に「${list.name}」がありません`);
    }
    for (const e of entries) {
      if (!ownLists.some((o) => o.name === list.name && o.number === e.number)) {
        if (ownListNames.has(list.name) && entries.length > 1) {
          errors.push(`単語集「${list.name}」の番号 ${e.number} が lists にありません`);
        }
      }
    }
    const bookExamples = entries.flatMap((e) => e.examples);
    const mine = validExamples.filter((ex) => ex.source === list.name);
    for (const b of bookExamples) {
      const sameEn = mine.filter((ex) => ex.en.trim() === b.en.trim());
      if (sameEn.length === 0) {
        errors.push(`単語帳「${list.name}」の例文が欠けています(または英文が書き換えられています): ${b.en}`);
      } else if (!sameEn.some((ex) => ex.ja === b.ja)) {
        errors.push(
          `単語帳「${list.name}」の例文の和訳が単語帳と違います: ${b.en} / 単語帳: ${b.ja} / 解説側: ${sameEn[0].ja}`
        );
      }
    }
    // 逆向き: 単語帳の例文だと名乗っているのに、単語帳側に無いもの
    for (const ex of mine) {
      if (!bookExamples.some((b) => b.en.trim() === ex.en.trim())) {
        errors.push(`source が「${list.name}」なのに、単語帳側に無い例文です: ${ex.en}`);
      }
    }
  }

  return { word, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// ---------- 全体 ----------

function run(opts) {
  const dataDir = path.resolve(opts.dataDir);
  const wordsDir = path.join(dataDir, 'words');
  const { lists, problems: listProblems } = loadLists(dataDir);
  const results = [];

  const allFiles = listJsonFiles(wordsDir);
  let targets;
  if (opts.words.length > 0) {
    // 単語を個別指定したとき: その単語のファイルだけ
    targets = [...new Set(opts.words.map((w) => `${wordKey(w)}.json`))];
  } else {
    targets = allFiles;
  }

  for (const file of targets) {
    const full = path.join(wordsDir, file);
    const fallbackWord = file.replace(/\.json$/i, '');
    // 大文字小文字を区別しないファイルシステムでも、実際のファイル名で確かめる
    if (!allFiles.includes(file)) {
      const actual = allFiles.find((f) => f.toLowerCase() === file.toLowerCase());
      results.push({
        word: fallbackWord,
        file: actual ? `words/${actual}` : null,
        ok: false,
        errors: [
          actual
            ? `ファイル名は小文字にしてください(今: ${actual}、正しくは: ${file})`
            : `data/words/${file} がありません`,
        ],
        warnings: [],
      });
      continue;
    }
    let data;
    try {
      data = readJson(full);
    } catch (e) {
      results.push({
        word: fallbackWord,
        file: `words/${file}`,
        ok: false,
        errors: [`JSONとして読めません(${e.message})`],
        warnings: [],
      });
      continue;
    }
    const r = checkWord(data, file, lists);
    results.push({
      word: r.word,
      file: `words/${file}`,
      ok: r.errors.length === 0,
      errors: r.errors,
      warnings: r.warnings,
    });
  }

  // 単語集に載っているのに解説ファイルが無い単語(個別指定していないときだけ)
  if (opts.words.length === 0) {
    const have = new Set(allFiles.map((f) => f.toLowerCase()));
    const reported = new Set();
    for (const list of lists) {
      for (const w of list.words) {
        const key = wordKey(w.word);
        if (have.has(`${key}.json`)) continue;
        const where = `単語集「${list.name}」の ${w.number} 番`;
        if (reported.has(key)) {
          results.find((r) => r.file === null && r.word === key).errors.push(
            `${where}にも載っています`
          );
          continue;
        }
        reported.add(key);
        results.push({
          word: key,
          file: null,
          ok: false,
          errors: [`${where}に載っているのに、data/words/${key}.json がありません`],
          warnings: [],
        });
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  return {
    dataDir,
    ok: failed.length === 0 && listProblems.length === 0,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedWords: failed.map((r) => r.word),
    listProblems,
    results,
  };
}

function printHuman(summary) {
  const out = [];
  out.push(`データの場所: ${summary.dataDir}`);
  out.push('');
  if (summary.listProblems.length > 0) {
    out.push('【単語集ファイルの問題】');
    for (const p of summary.listProblems) out.push(`  - ${p}`);
    out.push('');
  }
  for (const r of summary.results) {
    out.push(`${r.ok ? '合格  ' : '不合格'} ${r.word}`);
    for (const e of r.errors) out.push(`    × ${e}`);
    for (const w of r.warnings) out.push(`    ! 警告: ${w}`);
  }
  if (summary.results.length === 0) out.push('調べる単語がありませんでした。');
  out.push('');
  out.push(`合計 ${summary.total}語: 合格 ${summary.passed} / 不合格 ${summary.failed}`);
  if (summary.failed > 0) out.push(`不合格の単語: ${summary.failedWords.join(', ')}`);
  if (summary.listProblems.length > 0) {
    out.push(`単語集ファイルの問題: ${summary.listProblems.length}件(上を見てください)`);
  }
  console.log(out.join('\n'));
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error('使い方: node scripts/validate.js [--data <dataフォルダ>] [--json] [単語 ...]');
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(path.resolve(opts.dataDir))) {
    console.error(`データフォルダがありません: ${path.resolve(opts.dataDir)}`);
    process.exitCode = 2;
    return;
  }
  const summary = run(opts);
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHuman(summary);
  }
  if (!summary.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { checkSvg, checkWord, run };
