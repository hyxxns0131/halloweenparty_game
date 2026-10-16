/* =========================================================
 * tug-game.js — 명예의 전당 미니게임 "사탕 뺏기" 2탄: 호박 줄다리기
 *
 *  - 출품작 닉네임 목록에서 상대를 골라 [대결 신청]
 *  - 상대 수락 대기(실시간 매칭이 없어 1~3초 뒤 자동 수락하는 봇 모드) → 3·2·1 START!
 *  - 20초 동안 스페이스바 / [당기기!] 연타로 줄을 내 쪽(왼쪽)으로 당긴다
 *  - 상대 호박(봇)은 무작위 속도로 당기고, 줄은 가만히 두면 서서히 가운데로 돌아간다
 *  - 끝까지 당기면 즉시 KO, 시간이 끝나면 줄이 더 가까운 쪽 승리 (정확히 가운데면 무승부)
 *  - 이기면 상대 작품의 사탕 1개를 뺏어 오고, 지면 내 사탕 1개가 상대에게 넘어간다
 *
 *  이 파일은 🎲 사탕 뺏기 버튼의 게임 선택 창(야바위 / 줄다리기)도 맡는다.
 * ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DURATION = 20000;  // 제한 시간 20초
  const PULL = 1.7;        // 한 번 당길 때 줄이 움직이는 양 (0 ~ 100 중)
  const DRIFT = 0.1;       // 가만히 있을 때 가운데로 돌아가는 세기 (초당 비율)
  const SHIFT = 22;        // 줄이 끝까지 갔을 때 화면에서 움직이는 폭 (%)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const between = (a, b) => a + Math.random() * (b - a);

  let phase = 'lobby';   // lobby → wait → count → play → settling → done
  let foe = null;        // 대결 상대 작품
  let pos = 50;          // 리본 위치: 0 = 내 쪽 끝(KO 승), 100 = 상대 쪽 끝(KO 패)
  let myPulls = 0, foePulls = 0;
  let bot = null;        // { base, rate, acc, nextChange }
  let startAt = 0, lastFrame = 0, raf = 0;
  let runId = 0;

  /* ---------------- 공통 ---------------- */
  function toast(msg) { (window.PumpkinApp && window.PumpkinApp.toast) ? window.PumpkinApp.toast(msg) : alert(msg); }
  function me() {
    const id = window.Voting.myEntry();
    return window.Voting.entries().find((e) => e.id === id) || null;
  }
  function canPlay() {
    if (!me()) { toast('먼저 내 호박을 출품해야 사탕 뺏기에 참여할 수 있어요!'); return false; }
    if (window.Voting.entries().length < 2) { toast('사탕을 주고받을 다른 참가자가 아직 없어요.'); return false; }
    return true;
  }
  function updateMine() {
    const m = me();
    $('tugMine').textContent = `🍬 ${m ? m.likes : 0}`;
  }
  function show(step) {
    $('tugLobby').hidden = step !== 'lobby';
    $('tugMatch').hidden = step === 'lobby';
  }

  /* ---------------- 로비: 상대 고르기 ---------------- */
  function renderLobby() {
    const list = $('tugList');
    list.replaceChildren();
    for (const e of window.Voting.entries().filter((x) => !x.mine)) {
      const row = document.createElement('div');
      row.className = 'tug-foe';
      const img = document.createElement('img');
      img.src = e.imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      const info = document.createElement('div');
      info.className = 'tug-foe-info';
      const name = document.createElement('b');
      name.textContent = e.author;
      const sub = document.createElement('small');
      sub.textContent = `${e.title || ''} · 🍬 ${e.likes}`;
      info.append(name, sub);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'primary';
      btn.textContent = '대결 신청';
      btn.onclick = () => challenge(e);
      row.append(img, info, btn);
      list.append(row);
    }
  }

  function lobby() {
    runId++;
    stopLoop();
    phase = 'lobby';
    updateMine();
    renderLobby();
    show('lobby');
  }

  function open() {
    if (!canPlay()) return;
    lobby();
    $('tugDialog').showModal();
  }

  /* ---------------- 신청 → 수락 대기 → 카운트다운 ---------------- */
  async function challenge(target) {
    if (!canPlay()) return;
    const my = ++runId;
    foe = target;
    phase = 'wait';
    show('match');
    resetBoard();
    $('tugMeName').textContent = me().author;
    $('tugFoeName').textContent = foe.author;
    $('tugWaitName').textContent = foe.author;
    $('tugResult').hidden = true;
    $('tugWait').hidden = false;

    await sleep(between(1000, 3000)); // 봇 모드: 1~3초 뒤 자동 수락
    if (my !== runId) return;
    $('tugWait').hidden = true;

    phase = 'count';
    const box = $('tugCount'), num = $('tugCountNum');
    box.hidden = false;
    for (const t of ['3', '2', '1', 'START!']) {
      num.textContent = t;
      num.classList.remove('pop');
      void num.offsetWidth; // 애니메이션 다시 시작
      num.classList.add('pop');
      await sleep(t === 'START!' ? 600 : 900);
      if (my !== runId) return;
    }
    box.hidden = true;
    play();
  }

  /* ---------------- 대결 ---------------- */
  function resetBoard() {
    stopLoop();
    pos = 50;
    myPulls = 0;
    foePulls = 0;
    $('tugPull').disabled = true;
    $('tugArena').classList.remove('ko-win', 'ko-lose');
    for (const el of $('tugArena').querySelectorAll('.tug-pop')) el.remove();
    render(DURATION);
  }

  function play() {
    phase = 'play';
    const base = between(5.2, 7.4); // 상대 호박의 평균 당기기 속도 (초당 횟수)
    bot = { base, rate: base, acc: 0, nextChange: 0 };
    startAt = lastFrame = performance.now();
    $('tugPull').disabled = false;
    $('tugPull').focus();
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame(now) {
    if (phase !== 'play') return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const elapsed = now - startAt;

    // 상대 호박: 1초 안팎마다 속도가 바뀌고, 마지막 5초엔 조금 더 힘을 낸다
    if (elapsed >= bot.nextChange) {
      bot.rate = bot.base * between(0.7, 1.3) * (elapsed > DURATION - 5000 ? 1.15 : 1);
      bot.nextChange = elapsed + between(700, 1600);
    }
    bot.acc += bot.rate * dt;
    while (bot.acc >= 1) {
      bot.acc -= 1;
      foePulls++;
      pos += PULL;
      if (Math.random() < 0.12) pop('끙!', 'foe');
    }

    // 아무도 안 당기면 서서히 가운데로
    pos += (50 - pos) * DRIFT * dt;
    pos = Math.max(0, Math.min(100, pos));

    const left = Math.max(0, DURATION - elapsed);
    render(left);
    if (pos <= 0 || pos >= 100 || left <= 0) return finish(left > 0);
    raf = requestAnimationFrame(frame);
  }

  function pull() {
    if (phase !== 'play') return;
    myPulls++;
    pos = Math.max(0, pos - PULL);
    const pk = $('tugMePk');
    pk.classList.remove('heave');
    void pk.offsetWidth;
    pk.classList.add('heave');
    pop('영차!', 'me');
  }

  function pop(text, side) {
    const s = document.createElement('span');
    s.className = `tug-pop ${side}`;
    s.textContent = text;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}px`);
    $('tugArena').append(s);
    setTimeout(() => s.remove(), 650);
  }

  function render(left) {
    $('tugRope').style.transform = `translateX(${((pos - 50) / 50) * SHIFT}%)`;
    const mine = Math.round(100 - pos);
    $('tugGaugeMe').style.width = `${100 - pos}%`;
    $('tugGaugeText').textContent = `${mine} : ${100 - mine}`;
    $('tugTimerFill').style.width = `${(left / DURATION) * 100}%`;
    $('tugTimerFill').classList.toggle('hurry', left <= 5000);
    $('tugTimerText').textContent = `${(left / 1000).toFixed(1)}초`;
    $('tugMePk').classList.toggle('winning', pos < 45);
    $('tugFoePk').classList.toggle('winning', pos > 55);
  }

  /* ---------------- 결과 ---------------- */
  // ko: 시간 안에 끝까지 당겨져서 끝났는지
  async function finish(ko) {
    stopLoop();
    phase = 'settling';
    $('tugPull').disabled = true;
    const mine = Math.round(100 - pos);
    const result = mine > 50 ? 'win' : mine < 50 ? 'lose' : 'draw';
    if (ko) $('tugArena').classList.add(result === 'win' ? 'ko-win' : 'ko-lose');

    const outcome = await settle(result);
    phase = 'done';

    const box = $('tugResult');
    box.classList.toggle('win', result === 'win');
    box.classList.toggle('lose', result === 'lose');
    $('tugVerdict').textContent = {
      win: ko ? '💥 KO 승리!' : '🎉 승리!',
      lose: ko ? '💀 KO 패배…' : '😱 패배…',
      draw: '🤝 무승부',
    }[result];
    $('tugScore').textContent = `줄 위치 나 ${mine} : ${100 - mine} 상대 · 당기기 ${myPulls}회 vs ${foePulls}회`;
    $('tugOutcome').textContent = outcome;
    box.hidden = false;
    updateMine();
    if (result === 'win') burst('🍬');
  }

  // 사탕 이동 후 결과 문구를 돌려준다
  async function settle(result) {
    if (result === 'draw') return '사탕은 그대로예요. 한 판 더?';
    try {
      const r = await window.Voting.candyDuel(foe.id, result === 'win');
      if (result === 'win') return r.moved ? `${foe.author}님의 사탕 1개를 뺏어왔어요! 🍬` : `이겼지만… ${foe.author}님에게 뺏어 올 사탕이 없어요.`;
      return r.moved ? `내 사탕 1개가 ${foe.author}님에게 넘어갔어요… 🍬💨` : '다행히 빼앗길 사탕이 없었어요.';
    } catch (e) {
      console.error(e);
      return '사탕을 옮기는 중 문제가 생겼어요: ' + e.message;
    }
  }

  function burst(ch) {
    const r = $('tugDialog').getBoundingClientRect();
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

  // 대결 중에 닫으면 포기(= 패배) — 질 것 같을 때 빠져나가는 걸 막는다
  function tryClose() {
    if (phase === 'play') {
      if (!confirm('지금 닫으면 기권으로 처리되어 내 사탕 1개를 잃을 수 있어요. 기권할까요?')) return;
      stopLoop();
      phase = 'settling';
      settle('lose').then((msg) => toast('기권했어요. ' + msg));
    } else if (phase === 'settling') {
      return; // 사탕 옮기는 중엔 잠깐만
    }
    runId++;
    phase = 'lobby';
    $('tugDialog').close();
  }

  /* ---------------- 게임 선택 창 (🎲 사탕 뺏기) ---------------- */
  function openPicker() {
    if (!canPlay()) return;
    $('gamePickDialog').showModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('tugDialog')) return;

    $('stealBtn').onclick = openPicker;
    for (const b of document.querySelectorAll('[data-pick-close]')) b.onclick = () => $('gamePickDialog').close();
    for (const b of document.querySelectorAll('[data-game]')) {
      b.onclick = () => {
        $('gamePickDialog').close();
        if (b.dataset.game === 'shell') window.ShellGame.open();
        else open();
      };
    }

    // pointerdown 이라 모바일 연타에도 click 지연 없이 바로 반응
    $('tugPull').addEventListener('pointerdown', (e) => { e.preventDefault(); pull(); });
    $('tugWaitCancel').onclick = lobby;
    $('tugLobbyBtn').onclick = lobby;
    $('tugAgain').onclick = () => foe && challenge(window.Voting.entries().find((e) => e.id === foe.id) || foe);
    for (const b of document.querySelectorAll('[data-tug-close]')) b.onclick = tryClose;
    $('tugDialog').addEventListener('cancel', (e) => { e.preventDefault(); tryClose(); });
    $('tugDialog').addEventListener('close', () => { runId++; stopLoop(); });

    // 스페이스바 연타 — 브라우저 스크롤과 포커스된 버튼 눌림은 막는다 (꾹 누르기는 1번으로만)
    const onSpace = (e) => {
      if (e.code !== 'Space' || !$('tugDialog').open || !['wait', 'count', 'play', 'settling'].includes(phase)) return;
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) pull();
    };
    document.addEventListener('keydown', onSpace);
    document.addEventListener('keyup', onSpace);
  });

  window.TugGame = { open };
})();
