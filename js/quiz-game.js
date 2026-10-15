/* =========================================================
 * quiz-game.js — 명예의 전당 미니게임 "사탕 뺏기" (넌센스 퀴즈)
 *
 *  - quiz.txt 의 문제 중 하나를 랜덤으로 낸다 (모두 한 번씩 나올 때까지 중복 없음)
 *  - 답은 주관식. 띄어쓰기·문장부호·대소문자는 무시하고 채점
 *  - 정답  → 사탕이 있는 다른 참가자 중 랜덤 1명에게서 사탕 1개를 뺏어 온다
 *  - 오답  → 원래 답을 보여주고, 내 사탕 1개가 랜덤 참가자에게 넘어간다
 *  - 문제를 본 뒤 창을 닫으면 '포기'(= 오답) 처리
 * ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const BAG_KEY = 'axp_quiz_bag';
  const NEXT_KEY = 'axp_quiz_next';
  const COOLDOWN_MS = 15000;

  // 정답 표기와 다르게 적어도 맞게 쳐 줄 답 (문제 번호 → 별칭)
  const EXTRA = {
    4: ['킹콩', 'kingkong'],
    5: ['자두'],
    26: ['coolcat', '쿨캣'],
    38: ['불이야'],
    42: ['soul'],
    50: ['아내머리', '이제그만해'],
    51: ['짱구는못말려', '오징어는말릴수있지만짱구는못말려'],
    52: ['bobbibrown'],
  };

  /* ---------------- 문제 읽기 ---------------- */
  function parse(text) {
    const out = [];
    let cur = null;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      const q = line.match(/^(\d+)\.\s*(.+)$/);
      const a = line.match(/^-\s*정답\s*[:：]\s*(.+)$/);
      if (q) cur = { no: Number(q[1]), q: q[2] };
      else if (a && cur) {
        const full = a[1].trim();
        const m = full.match(/^(.*?)\s*\((.*)\)\s*$/);
        const main = (m ? m[1] : full).trim();
        const note = m ? m[2].trim() : '';
        const answers = [main, ...(EXTRA[cur.no] || [])];
        if (/^또는\s*/.test(note)) answers.push(note.replace(/^또는\s*/, ''));
        out.push({ no: cur.no, q: cur.q, answer: main, note, answers });
        cur = null;
      }
    }
    return out;
  }

  let QUIZ = parse(window.QUIZ_TEXT || '');
  // 웹에 올렸을 때는 quiz.txt 를 직접 읽어 최신 문제를 쓴다 (file:// 에서는 내장본 사용)
  if (/^https?:/.test(location.protocol)) {
    fetch('quiz.txt', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => { const q = parse(t); if (q.length) QUIZ = q; })
      .catch(() => {});
  }

  const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/[\s"'“”‘’!?.,~…·:;\-_/()[\]]/g, '');

  function isCorrect(item, input) {
    const v = norm(input);
    if (!v) return false;
    return item.answers.some((ans) => {
      const a = norm(ans);
      if (!a) return false;
      if (v === a || v.includes(a)) return true;
      return a.includes(v) && v.length >= Math.ceil(a.length * 0.6);
    });
  }

  /* ---------------- 출제 (중복 없는 랜덤) ---------------- */
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { return null; }
    return null;
  }
  function nextQuestion() {
    let bag = [];
    try { bag = JSON.parse(ls(BAG_KEY) || '[]'); } catch (e) { bag = []; }
    bag = bag.filter((no) => QUIZ.some((x) => x.no === no));
    if (!bag.length) {
      bag = QUIZ.map((x) => x.no);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    const no = bag.pop();
    ls(BAG_KEY, JSON.stringify(bag));
    return QUIZ.find((x) => x.no === no);
  }

  /* ---------------- 사탕 이동 ---------------- */
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

  async function stealFromSomeone(myId) {
    const others = shuffle(window.Voting.entries().filter((e) => e.id !== myId && e.likes > 0));
    for (const victim of others) {
      if (await window.Voting.transferCandy(victim.id, myId)) return victim;
    }
    return null;
  }

  async function giveToSomeone(myId) {
    const others = shuffle(window.Voting.entries().filter((e) => e.id !== myId));
    for (const lucky of others) {
      if (await window.Voting.transferCandy(myId, lucky.id)) return lucky;
      // 내 사탕이 0개라 실패한 경우 더 시도할 필요 없음
      const me = window.Voting.entries().find((e) => e.id === myId);
      if (!me || me.likes <= 0) return null;
    }
    return null;
  }

  /* ---------------- 화면 ---------------- */
  let current = null;      // 지금 풀고 있는 문제
  let answered = true;     // 결과까지 끝났는지
  let busy = false;

  function toast(msg) { (window.PumpkinApp && window.PumpkinApp.toast) ? window.PumpkinApp.toast(msg) : alert(msg); }
  function me() {
    const id = window.Voting.myEntry();
    return window.Voting.entries().find((e) => e.id === id) || null;
  }
  function show(step) {
    for (const s of ['quizIntro', 'quizAsk', 'quizResult']) $(s).hidden = s !== step;
  }
  function updateMine() {
    const m = me();
    $('quizMine').textContent = m ? `🍬 ${m.likes}` : '🍬 0';
  }

  function cooldownLeft() {
    return Math.max(0, Number(ls(NEXT_KEY) || 0) - Date.now());
  }
  let cdTimer = 0;
  function renderCooldown() {
    clearInterval(cdTimer);
    const btn = $('quizStart');
    const tick = () => {
      const left = cooldownLeft();
      btn.disabled = left > 0;
      btn.textContent = left > 0 ? `숨 고르는 중… ${Math.ceil(left / 1000)}초` : '🎃 도전하기';
      if (!left) clearInterval(cdTimer);
    };
    tick();
    cdTimer = setInterval(tick, 250);
  }

  function open() {
    if (!QUIZ.length) return toast('퀴즈 문제를 불러오지 못했어요. quiz.txt 를 확인해주세요.');
    const m = me();
    if (!m) return toast('먼저 내 호박을 출품해야 사탕 뺏기에 참여할 수 있어요!');
    if (window.Voting.entries().length < 2) return toast('사탕을 주고받을 다른 참가자가 아직 없어요.');
    $('quizCount').textContent = String(QUIZ.length);
    updateMine();
    show('quizIntro');
    renderCooldown();
    $('quizDialog').showModal();
  }

  function start() {
    if (cooldownLeft() > 0) return;
    current = nextQuestion();
    answered = false;
    $('quizNo').textContent = `Q${current.no}`;
    $('quizQuestion').textContent = current.q;
    $('quizAnswer').value = '';
    updateMine();
    show('quizAsk');
    setTimeout(() => $('quizAnswer').focus(), 50);
  }

  async function grade(giveUp) {
    if (answered || busy || !current) return;
    const input = giveUp ? '' : $('quizAnswer').value;
    if (!giveUp && !input.trim()) { $('quizAnswer').focus(); return toast('정답을 적어주세요!'); }
    busy = true;
    $('quizSubmit').disabled = true;
    const ok = !giveUp && isCorrect(current, input);
    const myId = window.Voting.myEntry();
    let other = null, err = null;
    try {
      other = ok ? await stealFromSomeone(myId) : await giveToSomeone(myId);
    } catch (e) {
      err = e;
      console.error(e);
    }
    answered = true;
    busy = false;
    $('quizSubmit').disabled = false;
    ls(NEXT_KEY, String(Date.now() + COOLDOWN_MS));

    const box = $('quizResult');
    box.classList.toggle('win', ok);
    box.classList.toggle('lose', !ok);
    $('quizVerdict').textContent = ok ? '🎉 정답!' : giveUp ? '🏳️ 포기!' : '😱 땡!';
    $('quizRealAnswer').textContent = current.answer;
    $('quizRealNote').textContent = current.note ? `(${current.note})` : '';
    $('quizYour').textContent = giveUp ? '' : `내 답: ${input.trim()}`;
    let msg;
    if (err) msg = '사탕을 옮기는 중 문제가 생겼어요: ' + err.message;
    else if (ok) msg = other ? `${other.author}님의 사탕 1개를 뺏어왔어요! 🍬` : '정답이지만… 뺏어 올 사탕을 가진 사람이 없어요.';
    else msg = other ? `내 사탕 1개가 ${other.author}님에게 넘어갔어요… 🍬💨` : '다행히 빼앗길 사탕이 없었어요.';
    $('quizOutcome').textContent = msg;
    updateMine();
    show('quizResult');
    renderCooldown();
    if (ok && other) burst('🍬');
    if (!ok && other) burst('💨');
  }

  function burst(ch) {
    const r = $('quizDialog').getBoundingClientRect();
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('span');
      s.className = 'flying-candy';
      s.textContent = i % 3 ? ch : '🍭';
      s.style.left = `${r.left + r.width / 2}px`;
      s.style.top = `${r.top + r.height / 3}px`;
      s.style.setProperty('--dx', `${(Math.random() - 0.5) * 320}px`);
      s.style.setProperty('--dy', `${-80 - Math.random() * 200}px`);
      s.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
      document.body.append(s);
      setTimeout(() => s.remove(), 1200);
    }
  }

  // 문제를 보고 나서 닫으면 포기 처리 (어려운 문제만 골라 넘기는 걸 막기 위해)
  function tryClose() {
    if (!answered && current && !busy) {
      if (!confirm('지금 닫으면 포기로 처리되어 내 사탕 1개를 잃을 수 있어요. 포기할까요?')) return;
      grade(true);
      return;
    }
    $('quizDialog').close();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('quizDialog')) return;
    $('stealBtn').onclick = open;
    $('quizStart').onclick = start;
    $('quizForm').onsubmit = (e) => { e.preventDefault(); grade(false); };
    $('quizGiveUp').onclick = () => tryClose();
    $('quizAgain').onclick = () => { show('quizIntro'); renderCooldown(); };
    for (const b of document.querySelectorAll('[data-quiz-close]')) b.onclick = tryClose;
    $('quizDialog').addEventListener('cancel', (e) => { e.preventDefault(); tryClose(); });
    $('quizDialog').addEventListener('close', () => clearInterval(cdTimer));
  });

  window.CandyQuiz = { parse, isCorrect, count: () => QUIZ.length };
})();
