// 発音(読み上げ)。ブラウザの音声合成 Web Speech API を使う。

let voices = [];   // 端末にある声の一覧(遅れて届くことがある)
let current = null; // 読み上げ中のもの(途中で捨てられないよう参照を持っておく)
let currentButton = null;

const supported = typeof window !== 'undefined'
  && 'speechSynthesis' in window
  && typeof window.SpeechSynthesisUtterance === 'function';

function refreshVoices() {
  try { voices = window.speechSynthesis.getVoices() || []; } catch (e) { voices = []; }
}

// 起動時に呼ぶ。声の一覧を先に取りにいく(iPhone では最初は空で、あとから届く)
export function initSpeech() {
  if (!supported) return;
  refreshVoices();
  const synth = window.speechSynthesis;
  if (typeof synth.addEventListener === 'function') {
    synth.addEventListener('voiceschanged', refreshVoices);
  } else {
    synth.onvoiceschanged = refreshVoices;
  }
}

// 英語の声を選ぶ。en-US を優先、なければ en- で始まる声
function pickVoice() {
  if (!voices.length) refreshVoices();
  const norm = (v) => String(v.lang || '').replace('_', '-').toLowerCase();
  const en = voices.filter((v) => norm(v) === 'en' || norm(v).startsWith('en-'));
  if (!en.length) return null;
  // 声の質に差が大きいので点数を付けて一番良いものを選ぶ
  const score = (v) => {
    const name = String(v.name || '');
    let s = 0;
    if (norm(v) === 'en-us') s += 10;
    if (/natural|neural|premium|enhanced|siri/i.test(name)) s += 30; // 自然な声(Edge・iPhone など)
    if (/^google/i.test(name)) s += 20;                              // Chrome の声
    if (/samantha|ava|allison|evan|alex/i.test(name)) s += 15;       // iPhone・Mac の標準的な声
    if (/desktop|zira|david|mark/i.test(name)) s -= 20;              // Windows の古い機械的な声
    if (/compact|eloquence|novelty|whisper|bells|bad news|good news|jester|organ|trinoids|zarvox|cellos|bubbles|boing|albert|fred|junior|kathy|ralph|superstar|wobble/i.test(name)) s -= 40; // iPhone・Mac のおもしろ声・簡易版
    return s;
  };
  return en.slice().sort((a, b) => score(b) - score(a))[0];
}

// 英語の声が1つも無い端末かどうか(日本語の声で英語を読むとカタカナ読みになるので読ませない)
function noEnglishVoice() {
  if (!voices.length) refreshVoices();
  return voices.length > 0 && !pickVoice();
}

function setButton(button, on) {
  if (!button) return;
  button.classList.toggle('is-on', on);
}

// text を英語で読み上げる。必ずボタンを押した処理の中から直接呼ぶこと(iPhone の決まり)。
// 読み上げ中にもう一度呼ばれたら、止めて最初から読み直す。
// notify は小さなお知らせを出す関数。
export function speak(text, button, notify) {
  if (!supported) {
    notify('この端末・ブラウザは読み上げに対応していません');
    return;
  }
  const synth = window.speechSynthesis;
  if (noEnglishVoice()) {
    notify('このブラウザには英語の声がありません(日本語の声では読ませません)');
    return;
  }
  try {
    synth.cancel(); // 読み上げ中・順番待ちを止める
    setButton(currentButton, false);

    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang.replace('_', '-');
    } else {
      u.lang = 'en-US'; // 声の一覧がまだ届いていなくても、言語の指定だけで読ませる
    }
    u.rate = 0.9;

    const finish = () => {
      if (current !== u) return;
      current = null;
      setButton(button, false);
    };
    u.onend = finish;
    u.onerror = (e) => {
      const stopped = e && (e.error === 'interrupted' || e.error === 'canceled');
      if (current === u && !stopped) notify('読み上げできませんでした');
      finish();
    };

    current = u;
    currentButton = button;
    setButton(button, true);
    if (synth.paused) synth.resume();
    synth.speak(u);
  } catch (e) {
    current = null;
    setButton(button, false);
    notify('読み上げできませんでした');
  }
}

// 画面を切り替えるときに読み上げを止める
export function stopSpeech() {
  if (!supported) return;
  try { window.speechSynthesis.cancel(); } catch (e) { /* 何もしない */ }
  setButton(currentButton, false);
  current = null;
  currentButton = null;
}
