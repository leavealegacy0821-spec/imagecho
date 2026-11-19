'use strict';
// validate.js と build-index.js の両方で使う共通の道具。
// 外部パッケージは使わない(Node.js 標準機能だけ)。

const fs = require('fs');
const path = require('path');

// JSONファイルを読む。先頭のBOM(見えない印)が付いていても読めるようにする。
function readJson(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

// フォルダ内の .json ファイル名を、ファイル名順(毎回同じ順)で返す。フォルダが無ければ空。
function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// 単語の照合用のキー(前後の空白を取り、小文字にする)
function wordKey(word) {
  return String(word).trim().toLowerCase();
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// data/lists/*.json をすべて読む。
// 戻り値: { lists: [ { file, id, name, words } ], problems: [ 日本語の問題文 ] }
// 形式がおかしい単語集は lists に入れず、problems に理由を書く。
function loadLists(dataDir) {
  const dir = path.join(dataDir, 'lists');
  const lists = [];
  const problems = [];
  for (const file of listJsonFiles(dir)) {
    const label = `lists/${file}`;
    let data;
    try {
      data = readJson(path.join(dir, file));
    } catch (e) {
      problems.push(`${label}: JSONとして読めません(${e.message})`);
      continue;
    }
    const errs = [];
    if (!isPlainObject(data)) {
      problems.push(`${label}: 中身がオブジェクトではありません`);
      continue;
    }
    if (!isNonEmptyString(data.id)) errs.push('id がありません');
    if (!isNonEmptyString(data.name)) errs.push('name がありません');
    if (!Array.isArray(data.words)) errs.push('words が配列ではありません');
    if (errs.length === 0) {
      data.words.forEach((w, i) => {
        const at = `words[${i}]`;
        if (!isPlainObject(w)) {
          errs.push(`${at} がオブジェクトではありません`);
          return;
        }
        if (!isNonEmptyString(w.word)) errs.push(`${at}.word がありません`);
        if (!Number.isInteger(w.number) || w.number <= 0) {
          errs.push(`${at}.number が正の整数ではありません`);
        }
        if (!Array.isArray(w.examples)) {
          errs.push(`${at}.examples が配列ではありません`);
        } else {
          w.examples.forEach((ex, j) => {
            if (!isPlainObject(ex) || !isNonEmptyString(ex.en) || !isNonEmptyString(ex.ja)) {
              errs.push(`${at}.examples[${j}] に en / ja がそろっていません`);
            }
          });
        }
      });
      if (lists.some((l) => l.name === data.name)) {
        errs.push(`name「${data.name}」がほかの単語集と重複しています`);
      }
      if (lists.some((l) => l.id === data.id)) {
        errs.push(`id「${data.id}」がほかの単語集と重複しています`);
      }
    }
    if (errs.length > 0) {
      for (const e of errs) problems.push(`${label}: ${e}`);
      continue;
    }
    lists.push({ file, id: data.id, name: data.name, words: data.words });
  }
  return { lists, problems };
}

module.exports = {
  readJson,
  listJsonFiles,
  wordKey,
  isNonEmptyString,
  isPlainObject,
  loadLists,
};
