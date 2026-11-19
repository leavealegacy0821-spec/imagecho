#!/usr/bin/env node
'use strict';
// 索引づくり。data/lists/*.json と data/words/*.json から data/index.json を作る。
// 使い方: node scripts/build-index.js [--data <dataフォルダ>]   (既定は ./data)
//
// 出力の形:
// { "version": "<全データの内容から作った短いハッシュ>",
//   "lists": [ { "id", "name", "count" } ],
//   "words": [ { "word", "core", "ja", "lists": [ { "id", "name", "number" } ] } ] }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJson, listJsonFiles, wordKey, isNonEmptyString, isPlainObject, loadLists } = require('./common');

function parseArgs(argv) {
  const opts = { dataDir: './data' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data') {
      i++;
      if (argv[i] === undefined) throw new Error('--data の後ろにフォルダを指定してください');
      opts.dataDir = argv[i];
    } else {
      throw new Error(`知らない引数です: ${a}`);
    }
  }
  return opts;
}

// 日本語検索用の1本の文字列を作る(core_image.text・例文の label・型の meaning。重複は除く)
function buildJa(data) {
  const parts = [];
  const add = (v) => {
    if (!isNonEmptyString(v)) return;
    const s = v.trim();
    if (!parts.includes(s)) parts.push(s);
  };
  add(data.core_image && data.core_image.text);
  if (Array.isArray(data.examples)) for (const ex of data.examples) add(ex && ex.label);
  if (Array.isArray(data.patterns)) for (const p of data.patterns) add(p && p.meaning);
  return parts.join(' ');
}

function build(dataDirArg) {
  const dataDir = path.resolve(dataDirArg);
  const wordsDir = path.join(dataDir, 'words');
  const warnings = [];

  const { lists, problems } = loadLists(dataDir);
  for (const p of problems) warnings.push(`単語集を読み飛ばしました: ${p}`);

  // version 用のハッシュ。ファイル名順に「名前＋中身」を足していく。
  // 中身は読み込んだJSONを詰め直したものを使う(改行コードや字下げの違いでは値が変わらない)。
  const hash = crypto.createHash('sha256');
  for (const l of lists) {
    hash.update(`lists/${l.file}\n`);
    hash.update(JSON.stringify({ id: l.id, name: l.name, words: l.words }));
    hash.update('\n');
  }

  // 解説ファイルを読む
  const wordData = new Map(); // 照合用キー → 解説
  for (const file of listJsonFiles(wordsDir)) {
    let data;
    try {
      data = readJson(path.join(wordsDir, file));
    } catch (e) {
      warnings.push(`words/${file} はJSONとして読めないので索引に入れません(${e.message})`);
      continue;
    }
    if (!isPlainObject(data) || !isNonEmptyString(data.word)) {
      warnings.push(`words/${file} は word が無いので索引に入れません`);
      continue;
    }
    const key = wordKey(data.word);
    if (wordData.has(key)) {
      warnings.push(`words/${file}: 単語「${data.word}」が重複しているので索引に入れません`);
      continue;
    }
    hash.update(`words/${file}\n`);
    hash.update(JSON.stringify(data));
    hash.update('\n');
    wordData.set(key, data);
  }

  // 単語集ごとに、解説がある単語を数える。解説が無い単語は警告を出して入れない。
  const membership = new Map(); // 照合用キー → [ { id, name, number } ]
  const indexLists = [];
  for (const l of lists) {
    let count = 0;
    for (const w of l.words) {
      const key = wordKey(w.word);
      if (!wordData.has(key)) {
        warnings.push(
          `単語集「${l.name}」の ${w.number} 番「${w.word}」は解説ファイルが無いので索引に入れません`
        );
        continue;
      }
      count++;
      if (!membership.has(key)) membership.set(key, []);
      membership.get(key).push({ id: l.id, name: l.name, number: w.number });
    }
    indexLists.push({ id: l.id, name: l.name, count });
  }

  // 単語は英単語のアルファベット順(小文字にして比べる。毎回同じ順になる)
  const keys = [...wordData.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const indexWords = [];
  for (const key of keys) {
    const data = wordData.get(key);
    const core = data.core_image && isNonEmptyString(data.core_image.text) ? data.core_image.text : '';
    if (core === '') warnings.push(`「${data.word}」は core_image.text がありません(core は空になります)`);
    const inLists = membership.get(key) || [];
    if (inLists.length === 0) {
      warnings.push(`「${data.word}」はどの単語集にも載っていません(単語集の一覧には出ません)`);
    }
    indexWords.push({ word: data.word, core, ja: buildJa(data), lists: inLists });
  }

  // めくる形式の並び(data/groups.json)。解説ファイルの無い単語は外し、どこにも入っていない単語は「そのほか」にまとめる
  const groups = [];
  const groupsFile = path.join(dataDir, 'groups.json');
  if (fs.existsSync(groupsFile)) {
    const raw = fs.readFileSync(groupsFile, 'utf8');
    hash.update('groups.json\n' + raw);
    const have = new Set(indexWords.map((w) => w.word.toLowerCase()));
    const used = new Set();
    for (const g of JSON.parse(raw).groups || []) {
      const words = (g.words || []).map((w) => String(w).toLowerCase()).filter((w) => have.has(w));
      words.forEach((w) => used.add(w));
      if (words.length) groups.push({ title: g.title, note: g.note || '', words });
    }
    const rest = indexWords.map((w) => w.word.toLowerCase()).filter((w) => !used.has(w));
    if (rest.length) groups.push({ title: 'そのほか', note: 'まだまとまりに入れていない語', words: rest });
  }

  const index = {
    version: hash.digest('hex').slice(0, 12),
    lists: indexLists,
    words: indexWords,
    groups,
  };
  return { dataDir, index, warnings };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error('使い方: node scripts/build-index.js [--data <dataフォルダ>]');
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(path.resolve(opts.dataDir))) {
    console.error(`データフォルダがありません: ${path.resolve(opts.dataDir)}`);
    process.exitCode = 2;
    return;
  }
  const { dataDir, index, warnings } = build(opts.dataDir);
  const outFile = path.join(dataDir, 'index.json');
  fs.writeFileSync(outFile, JSON.stringify(index) + '\n', 'utf8');
  for (const w of warnings) console.warn(`警告: ${w}`);
  console.log(
    `索引を作りました: ${outFile}(単語集 ${index.lists.length}冊・単語 ${index.words.length}語・version ${index.version}・警告 ${warnings.length}件)`
  );
}

if (require.main === module) main();

module.exports = { build };
