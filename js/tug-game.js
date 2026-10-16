/* =========================================================
 * tug-game.js — 명예의 전당 미니게임 "사탕 뺏기" 2탄: 호박 줄다리기 (실시간 1:1)
 *
 *  - 지금 접속 중인 참가자(출품작 닉네임)에게 [대결 신청] → 상대 화면에 수락/거절 창
 *  - 상대가 수락하면 둘이 같은 채널에 모여 3·2·1 START! → 20초 동안 스페이스바 / [당기기!] 연타
 *  - 줄은 가만히 두면 서서히 가운데로 돌아가고, 끝까지 당기면 즉시 KO
 *  - 시간이 끝나면 줄이 더 가까운 쪽 승리 (정확히 가운데면 무승부)
 *  - 이기면 상대 작품의 사탕 1개를 뺏어 오고, 지면 내 사탕 1개가 상대에게 넘어간다
 *
 * 실시간 구조 (Supabase Realtime — DB 테이블 없이 broadcast · presence 만 사용)
 *  - 로비 채널 'axp-tug-lobby' : 누가 접속 중인지(presence) + 신청/수락/거절/취소 메시지
 *  - 대결 채널 'axp-tug-<id>'  : 신청한 쪽(host)이 줄 위치를 계산해 0.05초마다 알려 주고,
 *                                받은 쪽(guest)은 자기 당기기 횟수를 보낸다. 사탕 이동도 host 가 한 번만 처리
 *  - 서버 연결이 없거나(로컬 데모 모드) 상대가 없을 땐 🤖 봇과 연습하기 (사탕 이동 없음)
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
  const INVITE_MS = 20000; // 신청 후 응답을 기다리는 시간
  const SEND_MS = 50;      // 실시간 메시지 간격
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const between = (a, b) => a + Math.random() * (b - a);
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // phase: lobby → invite(응답 대기) → connect → count → play → settling → done
  let phase = 'lobby';
  let match = null;      // { id, role: 'host' | 'guest' | 'bot', foe: { id, author }, ch, ... }
  let pos = 50;          // 리본 위치 (host·봇 기준): 0 = 내 쪽 끝(KO 승), 100 = 상대 쪽 끝(KO 패)
  let myPulls = 0, foePulls = 0;
  let startAt = 0, lastFrame = 0, lastSend = 0, raf = 0;
  let runId = 0;

  let lobbyCh = null;    // 로비 채널
  let online = new Map(); // 접속 중인 작품 id → 'free' | 'busy'
  let invite = null;     // 나에게 온 신청 { id, from, fromName }
  let inviteTimer = 0;

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
  function status(text) { $('tugStatus').textContent = text || ''; }
  function setPhase(p) {
    phase = p;
    track();
  }
  function inGame() { return ['invite', 'connect', 'count', 'play', 'settling'].includes(phase); }
  function isBusy() {
    return !!invite || inGame() || $('shellDialog').open || $('studioApp').inert;
  }

  /* =========================================================
   * 로비 채널 — 접속 현황 + 신청 주고받기
   * ========================================================= */
  function joinLobby() {
    const c = window.Voting.client && window.Voting.client();
    const m = me();
    if (!c || !m || lobbyCh) return;
    lobbyCh = c.channel('axp-tug-lobby', { config: { presence: { key: m.id } } });
    lobbyCh
      .on('presence', { event: 'sync' }, onPresence)
      .on('broadcast', { event: 'tug' }, ({ payload }) => onLobbyMsg(payload || {}))
      .subscribe((s) => { if (s === 'SUBSCRIBED') track(); });
  }

  function track() {
    const m = me();
    if (lobbyCh && m) lobbyCh.track({ author: m.author, busy: isBusy() }).catch(() => {});
  }

  function onPresence() {
    const state = lobbyCh.presenceState();
    online = new Map(Object.entries(state).map(([id, metas]) => [id, metas.some((x) => !x.busy) ? 'free' : 'busy']));
    if ($('tugDialog').open && phase === 'lobby') renderLobby();
  }

  function sendLobby(payload) {
    if (lobbyCh) lobbyCh.send({ type: 'broadcast', event: 'tug', payload }).catch(() => {});
  }

  function onLobbyMsg(p) {
    const m = me();
    if (!m || p.to !== m.id) return;
    if (p.t === 'invite') {
      if (isBusy()) return sendLobby({ t: 'decline', id: p.id, to: p.from, reason: 'busy' });
      showInvite(p);
    } else if (p.t === 'cancel') {
      if (invite && invite.id === p.id) {
        closeInvite();
        toast(`${p.fromName || '상대'}님이 대결 신청을 취소했어요.`);
      }
    } else if (p.t === 'accept') {
      if (phase === 'invite' && match && match.id === p.id) {
        clearTimeout(match.inviteTimer);
        connect();
      }
    } else if (p.t === 'decline') {
      if (phase === 'invite' && match && match.id === p.id) {
        const name = match.foe.author;
        lobby();
        toast(p.reason === 'busy' ? `${name}님은 지금 다른 게임 중이에요. 잠시 후 다시 신청해보세요!` : `${name}님이 대결을 거절했어요. 😢`);
      }
    }
  }

  /* ---------------- 나에게 온 신청 ---------------- */
  function showInvite(p) {
    invite = p;
    track();
    $('tugInviteName').textContent = p.fromName;
    const end = Date.now() + 15000;
    const tick = () => {
      const left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) return answer(false);
      $('tugInviteLeft').textContent = `(${left}초 안에 응답)`;
    };
    tick();
    clearInterval(inviteTimer);
    inviteTimer = setInterval(tick, 250);
    $('tugInviteDialog').showModal();
  }

  function closeInvite() {
    clearInterval(inviteTimer);
    invite = null;
    if ($('tugInviteDialog').open) $('tugInviteDialog').close();
    track();
  }

  function answer(ok) {
    const p = invite;
    if (!p) return;
    closeInvite();
    if (!ok) return sendLobby({ t: 'decline', id: p.id, to: p.from });
    if (isBusy()) {
      toast('지금은 대결을 시작할 수 없어요.');
      return sendLobby({ t: 'decline', id: p.id, to: p.from, reason: 'busy' });
    }
    sendLobby({ t: 'accept', id: p.id, to: p.from });
    if (!$('tugDialog').open) $('tugDialog').showModal();
    match = { id: p.id, role: 'guest', foe: { id: p.from, author: p.fromName } };
    enterMatch();
    connect();
  }

  /* =========================================================
   * 로비 화면 — 상대 고르기
   * ========================================================= */
  function renderLobby() {
    const live = !!lobbyCh;
    $('tugLobbyNote').textContent = live
      ? '🟢 접속 중인 사람에게만 신청할 수 있어요.'
      : '실시간 대결은 서버에 연결됐을 때만 할 수 있어요. 지금은 봇과 연습만 가능해요.';
    const list = $('tugList');
    list.replaceChildren();
    const rank = (e) => ({ free: 0, busy: 1 }[online.get(e.id)] ?? 2);
    const others = window.Voting.entries().filter((x) => !x.mine).sort((a, b) => rank(a) - rank(b));
    for (const e of others) {
      const state = online.get(e.id) || 'off';
      const row = document.createElement('div');
      row.className = `tug-foe ${state}`;
      const img = document.createElement('img');
      img.src = e.imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      const info = document.createElement('div');
      info.className = 'tug-foe-info';
      const name = document.createElement('b');
      name.textContent = e.author;
      const sub = document.createElement('small');
      sub.textContent = `${{ free: '🟢 접속 중', busy: '🟠 게임 중', off: '⚪ 오프라인' }[state]} · 🍬 ${e.likes}`;
      info.append(name, sub);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'primary';
      btn.textContent = '대결 신청';
      btn.disabled = state !== 'free';
      btn.onclick = () => challenge(e);
      row.append(img, info, btn);
      list.append(row);
    }
  }

  function lobby() {
    leaveMatch();
    setPhase('lobby');
    updateMine();
    renderLobby();
    show('lobby');
  }

  function open() {
    if (!canPlay()) return;
    joinLobby();
    lobby();
    $('tugDialog').showModal();
  }

  /* =========================================================
   * 대결 준비
   * ========================================================= */
  function enterMatch() {
    runId++;
    show('match');
    resetBoard();
    $('tugResult').hidden = true;
    $('tugCount').hidden = true;
    $('tugMeName').textContent = me().author;
    $('tugFoeName').textContent = match.foe.author;
  }

  function waitBox(text, cancel) {
    $('tugWait').hidden = !text;
    $('tugWaitMsg').textContent = text || '';
    $('tugWaitCancel').hidden = !cancel;
  }

  // 내가 신청 (host)
  function challenge(target) {
    if (!canPlay()) return;
    if (!lobbyCh) return toast('실시간 대결은 서버에 연결됐을 때만 할 수 있어요.');
    if (online.get(target.id) !== 'free') return toast(`${target.author}님은 지금 대결할 수 없어요.`);
    match = { id: uid(), role: 'host', foe: { id: target.id, author: target.author } };
    enterMatch();
    setPhase('invite');
    waitBox(`${target.author}님의 수락을 기다리는 중…`, true);
    sendLobby({ t: 'invite', id: match.id, from: me().id, fromName: me().author, to: target.id });
    const m = match;
    m.inviteTimer = setTimeout(() => {
      if (match !== m || phase !== 'invite') return;
      sendLobby({ t: 'cancel', id: m.id, to: m.foe.id, fromName: me().author });
      lobby();
      toast(`${m.foe.author}님이 응답하지 않았어요.`);
    }, INVITE_MS);
  }

  function cancelInvite() {
    if (phase === 'invite' && match) sendLobby({ t: 'cancel', id: match.id, to: match.foe.id, fromName: me().author });
    else if (match && match.ch) sendMatch({ t: 'bye' });
    lobby();
  }

  // 수락 후 둘이 대결 채널에 모인다 → 서로 hello 를 확인하면 host 가 go
  function connect() {
    const c = window.Voting.client();
    const m = match;
    setPhase('connect');
    waitBox('상대와 연결하는 중…', true);
    m.ch = c.channel(`axp-tug-${m.id}`, { config: { broadcast: { self: false } } });
    m.ch.on('broadcast', { event: 'm' }, ({ payload }) => { if (match === m) onMatchMsg(payload || {}); })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') sendMatch({ t: 'hello' });
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') abort('상대와 연결하지 못했어요.');
      });
    m.connectTimer = setTimeout(() => { if (match === m && phase === 'connect') abort('상대와 연결하지 못했어요.'); }, 12000);
  }

  function sendMatch(payload) {
    if (match && match.ch) match.ch.send({ type: 'broadcast', event: 'm', payload }).catch(() => {});
  }

  function leaveMatch() {
    runId++;
    stopLoop();
    if (!match) return;
    clearTimeout(match.inviteTimer);
    clearTimeout(match.connectTimer);
    clearInterval(match.watch);
    clearTimeout(match.sendTimer);
    if (match.ch) window.Voting.client().removeChannel(match.ch);
    match = null;
  }

  // 사탕 이동 없이 대결을 끝낸다 (연결 실패 · 상대가 시작 전에 나감)
  function abort(msg) {
    if (!match) return;
    const foe = match.foe;
    leaveMatch();
    match = { role: 'none', foe };
    setPhase('done');
    waitBox('');
    $('tugCount').hidden = true;
    $('tugPull').disabled = true;
    status('');
    showResult('none', false, msg);
  }

  function onMatchMsg(p) {
    const m = match;
    if (p.t === 'hello') {
      if (!m.peer) {
        m.peer = true;
        sendMatch({ t: 'hello' }); // 먼저 들어와 있던 쪽도 상대를 확인할 수 있게
        if (m.role === 'host') {
          sendMatch({ t: 'go' });
          countdown();
        }
      }
    } else if (p.t === 'go') {
      if (m.role === 'guest' && phase === 'connect') countdown();
    } else if (p.t === 'bye') {
      if (phase === 'connect' || phase === 'count') abort(`${m.foe.author}님이 대결을 취소했어요.`);
    } else if (p.t === 'p') {
      // guest 의 누적 당기기 횟수 (host 만 받음)
      if (m.role === 'host') m.foeTotal = Math.max(m.foeTotal || 0, p.n | 0);
    } else if (p.t === 'ff') {
      if (m.role === 'host' && (phase === 'count' || phase === 'play')) finish({ forfeit: true });
    } else if (p.t === 's') {
      if (m.role === 'guest') onState(p);
    } else if (p.t === 'end') {
      if (m.role === 'guest' && phase !== 'done') onEnd(p);
    }
  }

  async function countdown() {
    const my = runId;
    clearTimeout(match.connectTimer);
    setPhase('count');
    waitBox('');
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

  /* =========================================================
   * 대결
   * ========================================================= */
  function resetBoard() {
    stopLoop();
    pos = 50;
    myPulls = 0;
    foePulls = 0;
    status('');
    waitBox('');
    $('tugPull').disabled = true;
    $('tugArena').classList.remove('ko-win', 'ko-lose');
    for (const el of $('tugArena').querySelectorAll('.tug-pop')) el.remove();
    render(50, DURATION);
  }

  function play() {
    setPhase('play');
    startAt = lastFrame = lastSend = performance.now();
    $('tugPull').disabled = false;
    $('tugPull').focus();
    if (match.role === 'bot') {
      const base = between(5.2, 7.4); // 봇의 평균 당기기 속도 (초당 횟수)
      match.bot = { base, rate: base, acc: 0, nextChange: 0 };
    }
    if (match.role === 'guest') {
      // host 의 소식이 끊기면 상대가 나간 것으로 본다
      match.lastState = Date.now();
      match.watch = setInterval(() => {
        if (Date.now() - match.lastState < 5000) return;
        clearInterval(match.watch);
        if (phase === 'play') hostGone();
        else if (phase === 'settling') abort('결과를 받지 못했어요. 상대와 연결이 끊겼어요.');
      }, 500);
      return; // guest 는 host 가 보내 주는 상태로만 그린다
    }
    match.foeTotal = 0;
    match.applied = 0;
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // host · 봇 모드: 줄 위치를 직접 계산한다
  function frame(now) {
    if (phase !== 'play') return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const elapsed = now - startAt;
    const m = match;

    if (m.role === 'bot') {
      // 봇: 1초 안팎마다 속도가 바뀌고, 마지막 5초엔 조금 더 힘을 낸다
      const b = m.bot;
      if (elapsed >= b.nextChange) {
        b.rate = b.base * between(0.7, 1.3) * (elapsed > DURATION - 5000 ? 1.15 : 1);
        b.nextChange = elapsed + between(700, 1600);
      }
      b.acc += b.rate * dt;
      while (b.acc >= 1) { b.acc -= 1; m.foeTotal++; }
    }
    const fresh = m.foeTotal - m.applied;
    if (fresh > 0) {
      m.applied = m.foeTotal;
      foePulls = m.foeTotal;
      pos += fresh * PULL;
      if (Math.random() < 0.15) pop(m.role === 'bot' ? '끙!' : '영차!', 'foe');
    }

    // 아무도 안 당기면 서서히 가운데로
    pos = clamp(pos + (50 - pos) * DRIFT * dt);

    const left = Math.max(0, DURATION - elapsed);
    render(pos, left);
    if (m.role === 'host' && now - lastSend >= SEND_MS) {
      lastSend = now;
      sendMatch({ t: 's', pos, left, hp: myPulls, gp: m.foeTotal });
    }
    if (pos <= 0 || pos >= 100 || left <= 0) return finish({ ko: left > 0 });
    raf = requestAnimationFrame(frame);
  }

  // guest: host 가 보낸 상태 + 아직 반영 안 된 내 당기기를 미리 그려 반응을 빠르게
  function onState(p) {
    const m = match;
    m.lastState = Date.now();
    m.hostPos = +p.pos;
    m.ack = p.gp | 0;
    m.left = +p.left;
    foePulls = p.hp | 0;
    if (foePulls > (m.seenFoe || 0) && Math.random() < 0.5) pop('영차!', 'foe');
    m.seenFoe = foePulls;
    guestRender();
    if (m.left <= 0 && phase === 'play') {
      setPhase('settling');
      $('tugPull').disabled = true;
      status('결과 확인 중…');
    }
  }
  function guestView() {
    const m = match;
    return clamp(100 - (m.hostPos ?? 50) - Math.max(0, myPulls - (m.ack || 0)) * PULL);
  }
  function guestRender() { render(guestView(), match.left ?? DURATION); }

  function pull() {
    if (phase !== 'play') return;
    myPulls++;
    const pk = $('tugMePk');
    pk.classList.remove('heave');
    void pk.offsetWidth;
    pk.classList.add('heave');
    pop('영차!', 'me');
    if (match.role === 'guest') {
      guestRender();
      // 너무 잦은 전송은 묶어서 보낸다 (누적 횟수라 하나쯤 빠져도 괜찮다)
      if (!match.sendTimer) {
        match.sendTimer = setTimeout(() => {
          if (!match) return;
          match.sendTimer = 0;
          sendMatch({ t: 'p', n: myPulls });
        }, SEND_MS);
      }
    } else {
      pos = clamp(pos - PULL);
    }
  }

  function pop(text, side) {
    const s = document.createElement('span');
    s.className = `tug-pop ${side}`;
    s.textContent = text;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}px`);
    $('tugArena').append(s);
    setTimeout(() => s.remove(), 650);
  }

  // view: 내 화면 기준 리본 위치 (0 = 내 쪽)
  function render(view, left) {
    $('tugRope').style.transform = `translateX(${((view - 50) / 50) * SHIFT}%)`;
    const mine = Math.round(100 - view);
    $('tugGaugeMe').style.width = `${100 - view}%`;
    $('tugGaugeText').textContent = `${mine} : ${100 - mine}`;
    $('tugTimerFill').style.width = `${(left / DURATION) * 100}%`;
    $('tugTimerFill').classList.toggle('hurry', left <= 5000);
    $('tugTimerText').textContent = `${(left / 1000).toFixed(1)}초`;
    $('tugMePk').classList.toggle('winning', view < 45);
    $('tugFoePk').classList.toggle('winning', view > 55);
  }

  /* =========================================================
   * 결과
   * ========================================================= */
  const flip = (r) => ({ win: 'lose', lose: 'win' }[r] || r);

  // host · 봇: 승패를 정하고, host 는 사탕을 옮긴 뒤 guest 에게 알린다
  async function finish({ ko = false, forfeit = false } = {}) {
    runId++; // 카운트다운 중 기권이면 남은 카운트다운을 멈춘다
    stopLoop();
    setPhase('settling');
    $('tugPull').disabled = true;
    $('tugCount').hidden = true;
    const m = match;
    const mine = Math.round(100 - pos);
    let result = mine > 50 ? 'win' : mine < 50 ? 'lose' : 'draw';
    if (forfeit) result = 'win';
    if (m.role === 'host') sendMatch({ t: 's', pos, left: 0, hp: myPulls, gp: m.foeTotal });

    let moved = false, err = '';
    if (m.role === 'host' && result !== 'draw') {
      status('사탕 옮기는 중…');
      try {
        moved = (await window.Voting.candyDuel(m.foe.id, result === 'win')).moved;
      } catch (e) {
        console.error(e);
        err = e.message;
      }
    }
    if (match !== m) return;
    if (m.role === 'host') sendMatch({ t: 'end', res: result, ko, ff: forfeit, moved, err, pos, hp: myPulls, gp: m.foeTotal });
    setPhase('done');
    status('');
    showResult(result, ko, outcomeText(result, moved, err, forfeit ? `${m.foe.author}님이 기권했어요. ` : ''));
  }

  // guest: host 가 알려 준 결과를 내 기준으로 뒤집어 보여 준다
  function onEnd(p) {
    const m = match;
    runId++;
    clearInterval(m.watch);
    m.hostPos = +p.pos;
    m.ack = myPulls;
    foePulls = p.hp | 0;
    myPulls = Math.max(myPulls, p.gp | 0);
    render(clamp(100 - m.hostPos), 0);
    pos = m.hostPos;
    const result = flip(p.res);
    setPhase('done');
    $('tugPull').disabled = true;
    $('tugCount').hidden = true;
    status('');
    showResult(result, !!p.ko, outcomeText(result, !!p.moved, p.err || '', p.ff ? `${m.foe.author}님이 기권했어요. ` : ''));
  }

  // guest: 대결 중 host 소식이 끊김 → 기권승으로 처리하고 내가 사탕을 가져온다
  async function hostGone() {
    const m = match;
    setPhase('settling');
    $('tugPull').disabled = true;
    status('사탕 옮기는 중…');
    let moved = false, err = '';
    try {
      moved = (await window.Voting.candyDuel(m.foe.id, true)).moved;
    } catch (e) {
      console.error(e);
      err = e.message;
    }
    if (match !== m) return;
    pos = m.hostPos ?? 50;
    setPhase('done');
    status('');
    showResult('win', false, outcomeText('win', moved, err, `${m.foe.author}님과 연결이 끊겨 기권승! `));
  }

  function outcomeText(result, moved, err, prefix) {
    const name = match.foe.author;
    if (match.role === 'bot') return prefix + '연습 경기라 사탕은 그대로예요. 실전에서 만나요!';
    if (err) return prefix + '사탕을 옮기는 중 문제가 생겼어요: ' + err;
    if (result === 'draw') return prefix + '사탕은 그대로예요. 한 판 더?';
    if (result === 'win') return prefix + (moved ? `${name}님의 사탕 1개를 뺏어왔어요! 🍬` : `이겼지만… ${name}님에게 뺏어 올 사탕이 없어요.`);
    return prefix + (moved ? `내 사탕 1개가 ${name}님에게 넘어갔어요… 🍬💨` : '다행히 빼앗길 사탕이 없었어요.');
  }

  function showResult(result, ko, outcome) {
    const box = $('tugResult');
    box.classList.toggle('win', result === 'win');
    box.classList.toggle('lose', result === 'lose');
    if (ko) $('tugArena').classList.add(result === 'win' ? 'ko-win' : 'ko-lose');
    $('tugVerdict').textContent = {
      win: ko ? '💥 KO 승리!' : '🎉 승리!',
      lose: ko ? '💀 KO 패배…' : '😱 패배…',
      draw: '🤝 무승부',
      none: '🔌 대결 취소',
    }[result];
    const mine = Math.round(100 - (match && match.role === 'guest' ? clamp(100 - pos) : pos));
    $('tugScore').textContent = result === 'none' ? '' : `줄 위치 나 ${mine} : ${100 - mine} 상대 · 당기기 ${myPulls}회 vs ${foePulls}회`;
    $('tugOutcome').textContent = outcome;
    $('tugAgain').textContent = match && match.role === 'bot' ? '다시 하기' : '다시 신청하기';
    box.hidden = false;
    updateMine();
    if (result === 'win' && match.role !== 'bot') burst('🍬');
    if (match && match.ch) { window.Voting.client().removeChannel(match.ch); match.ch = null; }
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

  /* ---------------- 봇 연습 ---------------- */
  function practice() {
    if (!canPlay()) return;
    match = { id: uid(), role: 'bot', foe: { id: '', author: '🤖 연습 봇' } };
    enterMatch();
    countdown();
  }

  function again() {
    if (!match) return lobby();
    if (match.role === 'bot') return practice();
    const foe = window.Voting.entries().find((e) => e.id === match.foe.id);
    if (!foe) return lobby();
    if (online.get(foe.id) !== 'free') {
      lobby();
      return toast(`${foe.author}님은 지금 대결할 수 없어요.`);
    }
    challenge(foe);
  }

  /* ---------------- 닫기 ---------------- */
  // 대결 중에 닫으면 기권(= 패배) — 질 것 같을 때 빠져나가는 걸 막는다
  function tryClose() {
    if (phase === 'settling') return; // 사탕 옮기는 중엔 잠깐만
    if (phase === 'play' && match.role !== 'bot') {
      if (!confirm('지금 닫으면 기권으로 처리되어 내 사탕 1개를 잃을 수 있어요. 기권할까요?')) return;
      if (match.role === 'guest') {
        sendMatch({ t: 'ff' }); // 사탕은 host 가 옮긴다
        toast('기권했어요.');
      } else {
        // host 기권: 대결에서 먼저 빠져나온 뒤 사탕을 옮기고 guest 에게 결과를 알린다
        const m = match, ch = m.ch, client = window.Voting.client();
        const end = (moved, err) => ch.send({ type: 'broadcast', event: 'm', payload: { t: 'end', res: 'lose', ff: true, moved, err, pos, hp: myPulls, gp: m.foeTotal } })
          .catch(() => {}).finally(() => client.removeChannel(ch));
        m.ch = null;
        leaveMatch();
        setPhase('lobby');
        $('tugDialog').close();
        window.Voting.candyDuel(m.foe.id, false)
          .then((r) => { end(r.moved, ''); toast('기권했어요.' + (r.moved ? ` 내 사탕 1개가 ${m.foe.author}님에게 넘어갔어요.` : '')); })
          .catch((e) => { end(false, e.message); toast('기권했어요.'); });
        return;
      }
    } else if (phase === 'invite' || phase === 'connect' || phase === 'count') {
      cancelInvite();
    }
    leaveMatch();
    setPhase('lobby');
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
    $('tugWaitCancel').onclick = cancelInvite;
    $('tugLobbyBtn').onclick = lobby;
    $('tugAgain').onclick = again;
    $('tugPractice').onclick = practice;
    for (const b of document.querySelectorAll('[data-tug-close]')) b.onclick = tryClose;
    $('tugDialog').addEventListener('cancel', (e) => { e.preventDefault(); tryClose(); });

    $('tugAccept').onclick = () => answer(true);
    $('tugDecline').onclick = () => answer(false);
    $('tugInviteDialog').addEventListener('cancel', (e) => { e.preventDefault(); answer(false); });

    // 스페이스바 연타 — 브라우저 스크롤과 포커스된 버튼 눌림은 막는다 (꾹 누르기는 1번으로만)
    const onSpace = (e) => {
      if (e.code !== 'Space' || !$('tugDialog').open || !inGame()) return;
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) pull();
    };
    document.addEventListener('keydown', onSpace);
    document.addEventListener('keyup', onSpace);

    // 출품을 마치면 바로 로비에 접속해 둔다 → 다른 화면에 있어도 대결 신청을 받을 수 있다
    window.Voting.onUpdate(() => {
      joinLobby();
      if ($('tugDialog').open && phase === 'lobby') { updateMine(); renderLobby(); }
    });
    // 인트로를 지나 입장했으면 '바쁨' 표시를 풀어 준다
    new MutationObserver(track).observe($('studioApp'), { attributes: true, attributeFilter: ['inert'] });
  });

  window.TugGame = { open };
})();
