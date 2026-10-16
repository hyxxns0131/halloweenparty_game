/* =========================================================
 * shell-game.js — 명예의 전당 미니게임 "사탕 뺏기" (야바위)
 *
 *  - 컵 10개 중 하나에 사탕을 넣어 보여준 뒤, 아주 빠르게 섞는다
 *  - 이용자가 컵 하나를 고른다
 *  - 맞히면 → 사탕을 가진 다른 참가자 중 랜덤 1명에게서 사탕 1개를 뺏어 온다
 *  - 틀리면 → 내 사탕 1개가 랜덤 참가자에게 넘어가고, 사탕이 있던 컵을 보여준다
 *  - 섞기 시작한 뒤 창을 닫으면 '포기'(= 틀림) 처리
 * ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CUPS = 10;
  const COLS = 5;
  const NEXT_KEY = 'axp_shell_next';
  const COOLDOWN_MS = 15000; // 서버 쿨다운(12초)보다 살짝 길게
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (n) => Math.floor(Math.random() * n);

  let phase = 'idle';   // idle → show → shuffle → pick → settling → done
  let slots = [];       // slots[컵 번호] = 놓인 자리
  let prize = -1;       // 사탕이 든 컵 번호 (화면에는 섞는 동안 표시하지 않는다)
  let cups = [];
  let runId = 0;

  /* ---------------- 공통 ---------------- */
  function toast(msg) { (window.PumpkinApp && window.PumpkinApp.toast) ? window.PumpkinApp.toast(msg) : alert(msg); }
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { /* noop */ }
    return null;
  }
  function me() {
    const id = window.Voting.myEntry();
    return window.Voting.entries().find((e) => e.id === id) || null;
  }
  function updateMine() {
    const m = me();
    $('shellMine').textContent = `🍬 ${m ? m.likes : 0}`;
  }
  function show(step) {
    $('shellIntro').hidden = step !== 'intro';
    $('shellPlay').hidden = step !== 'play';
  }
  function status(text, cls) {
    const s = $('shellStatus');
    s.textContent = text;
    s.className = 'shell-status' + (cls ? ' ' + cls : '');
  }

  /* ---------------- 컵 그리기 ---------------- */
  function cupSvg(i) {
    return `<svg viewBox="0 0 100 112" aria-hidden="true">
      <defs><linearGradient id="cupg${i}" x1="0" x2="1">
        <stop offset="0" stop-color="#6e2406"/><stop offset=".42" stop-color="#ff9a3c"/><stop offset=".6" stop-color="#f07a22"/><stop offset="1" stop-color="#7a2a08"/>
      </linearGradient></defs>
      <ellipse cx="50" cy="104" rx="44" ry="7" fill="rgba(0,0,0,.35)"/>
      <path d="M24 10 H76 L92 98 Q50 110 8 98 Z" fill="url(#cupg${i})" stroke="#3a1204" stroke-width="3" stroke-linejoin="round"/>
      <path d="M19 38 H81 M14 66 H86" stroke="#7d4bd6" stroke-width="7" stroke-linecap="round" opacity=".9"/>
      <path d="M19 38 H81 M14 66 H86" stroke="#c9a5ff" stroke-width="2" stroke-linecap="round" opacity=".6"/>
      <ellipse cx="50" cy="10" rx="26" ry="6" fill="#ffb469" stroke="#3a1204" stroke-width="3"/>
      <rect x="31" y="18" width="7" height="72" rx="3.5" fill="#fff" opacity=".2"/>
    </svg>`;
  }

  function slotPos(s) {
    const col = s % COLS, row = Math.floor(s / COLS);
    return { x: ((col + 0.5) / COLS) * 100, y: row ? 74 : 30 };
  }

  function place(i, ms) {
    const p = slotPos(slots[i]);
    const el = cups[i];
    el.style.transitionDuration = `${ms || 0}ms`;
    el.style.left = `${p.x}%`;
    el.style.top = `${p.y}%`;
  }

  function build() {
    const stage = $('shellStage');
    stage.replaceChildren();
    stage.classList.remove('pickable');
    cups = [];
    slots = [];
    for (let i = 0; i < CUPS; i++) {
      const wrap = document.createElement('button');
      wrap.type = 'button';
      wrap.className = 'cup';
      wrap.disabled = true;
      wrap.setAttribute('aria-label', '컵'); // 번호를 붙이면 섞여도 쉽게 따라갈 수 있어 모든 컵을 똑같이 둔다
      wrap.innerHTML = `<span class="cup-shell">${cupSvg(i)}</span>`;
      wrap.onclick = () => pick(i);
      stage.append(wrap);
      cups.push(wrap);
      slots.push(i);
      place(i, 0);
    }
  }

  function putCandy(i) {
    const c = document.createElement('span');
    c.className = 'cup-candy';
    c.textContent = '🍬';
    cups[i].prepend(c);
  }
  function clearCandy() {
    for (const el of cups) el.querySelector('.cup-candy')?.remove();
  }
  function lift(i, on) { cups[i].classList.toggle('lifted', on); }

  /* ---------------- 진행 ---------------- */
  function cooldownLeft() { return Math.max(0, Number(ls(NEXT_KEY) || 0) - Date.now()); }
  let cdTimer = 0;
  function renderCooldown() {
    clearInterval(cdTimer);
    const buttons = [$('shellStart'), $('shellAgain')];
    const tick = () => {
      const left = cooldownLeft();
      for (const b of buttons) {
        b.disabled = left > 0;
        b.textContent = left > 0 ? `숨 고르는 중… ${Math.ceil(left / 1000)}초` : b.dataset.label;
      }
      if (!left) clearInterval(cdTimer);
    };
    tick();
    cdTimer = setInterval(tick, 250);
  }

  function open() {
    const m = me();
    if (!m) return toast('먼저 내 호박을 출품해야 사탕 뺏기에 참여할 수 있어요!');
    if (window.Voting.entries().length < 2) return toast('사탕을 주고받을 다른 참가자가 아직 없어요.');
    phase = 'idle';
    updateMine();
    show('intro');
    renderCooldown();
    $('shellDialog').showModal();
  }

  async function start() {
    if (cooldownLeft() > 0 || (phase !== 'idle' && phase !== 'done')) return;
    if (!me()) return toast('먼저 내 호박을 출품해야 사탕 뺏기에 참여할 수 있어요!');
    const my = ++runId;
    show('play');
    $('shellResult').hidden = true;
    build();
    prize = rand(CUPS);
    updateMine();

    // 1) 사탕 위치 보여주기
    phase = 'show';
    status('사탕이 어디 들어가는지 잘 보세요! 👀');
    await sleep(350);
    putCandy(prize);
    lift(prize, true);
    await sleep(1100);
    lift(prize, false);
    await sleep(380);
    if (my !== runId) return;
    clearCandy();

    // 2) 아주 빠르게 섞기 — 점점 빨라지고, 중간부터는 여러 쌍이 동시에 움직인다
    phase = 'shuffle';
    status('섞는 중… 눈 떼지 마세요! 🌀', 'busy');
    $('shellStage').classList.add('shuffling');
    const rounds = 34;
    for (let k = 0; k < rounds; k++) {
      if (my !== runId) return;
      const ms = Math.max(85, 260 - k * 9);
      const pairs = k < 6 ? 1 : 1 + rand(3);
      const used = new Set();
      for (let p = 0; p < pairs; p++) {
        let a, b, guard = 0;
        do { a = rand(CUPS); b = rand(CUPS); guard++; } while ((a === b || used.has(a) || used.has(b)) && guard < 50);
        if (a === b || used.has(a) || used.has(b)) continue;
        used.add(a); used.add(b);
        [slots[a], slots[b]] = [slots[b], slots[a]];
        cups[a].classList.add('moving');
        cups[b].classList.add('moving');
        place(a, ms);
        place(b, ms);
      }
      await sleep(ms + 15);
      for (const el of cups) el.classList.remove('moving');
    }
    $('shellStage').classList.remove('shuffling');

    // 3) 고르기
    phase = 'pick';
    status('사탕이 든 컵을 골라주세요! 🍬', 'pick');
    $('shellStage').classList.add('pickable');
    for (const el of cups) el.disabled = false;
  }

  async function pick(i) {
    if (phase !== 'pick') return;
    phase = 'settling';
    $('shellStage').classList.remove('pickable');
    for (const el of cups) el.disabled = true;
    cups[i].classList.add('chosen');
    const win = i === prize;
    putCandy(prize);
    lift(i, true);
    if (!win) {
      await sleep(550);
      cups[prize].classList.add('answer');
      lift(prize, true);
    }
    await settle(win, false);
  }

  /* ---------------- 사탕 이동 ---------------- */
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

  async function stealFromSomeone(myId) {
    for (const victim of shuffle(window.Voting.entries().filter((e) => e.id !== myId && e.likes > 0))) {
      if (await window.Voting.transferCandy(victim.id, myId)) return victim;
    }
    return null;
  }
  async function giveToSomeone(myId) {
    for (const lucky of shuffle(window.Voting.entries().filter((e) => e.id !== myId))) {
      if (await window.Voting.transferCandy(myId, lucky.id)) return lucky;
      const m = window.Voting.entries().find((e) => e.id === myId);
      if (!m || m.likes <= 0) return null;
    }
    return null;
  }

  async function settle(win, gaveUp) {
    let other = null, err = null;
    try {
      if (window.Voting.mode() === 'supabase') {
        const r = await window.Voting.candyGame(win);
        other = r.moved ? r.other : null;
      } else {
        const myId = window.Voting.myEntry();
        other = win ? await stealFromSomeone(myId) : await giveToSomeone(myId);
      }
    } catch (e) {
      err = e;
      console.error(e);
    }
    phase = 'done';
    ls(NEXT_KEY, String(Date.now() + COOLDOWN_MS));
    if (gaveUp) return;

    const box = $('shellResult');
    box.classList.toggle('win', win);
    box.classList.toggle('lose', !win);
    $('shellVerdict').textContent = win ? '🎉 정답! 사탕 발견!' : '😱 꽝!';
    let msg;
    if (err) msg = '사탕을 옮기는 중 문제가 생겼어요: ' + err.message;
    else if (win) msg = other ? `${other.author}님의 사탕 1개를 뺏어왔어요! 🍬` : '맞혔지만… 뺏어 올 사탕을 가진 사람이 없어요.';
    else msg = other ? `내 사탕 1개가 ${other.author}님에게 넘어갔어요… 🍬💨` : '다행히 빼앗길 사탕이 없었어요.';
    $('shellOutcome').textContent = msg;
    status(win ? '대단해요! 눈이 정말 빠르네요 👏' : '사탕은 표시된 컵에 있었어요!', win ? 'win' : 'lose');
    box.hidden = false;
    updateMine();
    renderCooldown();
    if (other) burst(win ? '🍬' : '💨');
  }

  function burst(ch) {
    const r = $('shellDialog').getBoundingClientRect();
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

  // 섞기 시작한 뒤 닫으면 포기(= 틀림) — 불리할 때 빠져나가는 걸 막는다
  function tryClose() {
    if (['show', 'shuffle', 'pick'].includes(phase)) {
      if (!confirm('지금 닫으면 포기로 처리되어 내 사탕 1개를 잃을 수 있어요. 포기할까요?')) return;
      runId++;
      phase = 'settling';
      settle(false, true).then(() => toast('포기했어요. 내 사탕 1개가 다른 사람에게 넘어갔을 수 있어요.'));
    }
    $('shellDialog').close();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('shellDialog')) return;
    for (const b of [$('shellStart'), $('shellAgain')]) b.dataset.label = b.textContent;
    $('shellStart').onclick = start;
    $('shellAgain').onclick = start;
    for (const b of document.querySelectorAll('[data-shell-close]')) b.onclick = tryClose;
    $('shellDialog').addEventListener('cancel', (e) => { e.preventDefault(); tryClose(); });
    $('shellDialog').addEventListener('close', () => clearInterval(cdTimer));
  });

  window.ShellGame = { open };
})();
