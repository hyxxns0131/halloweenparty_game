/* =========================================================
 * voting.js — 명예의 전당 데이터 (출품 · 사탕 투표 · 댓글 · 사탕 뺏기)
 *
 * 두 가지 모드
 *  - supabase : js/supabase-config.js 가 채워져 있으면 모든 참가자가 같은 데이터를 실시간으로 공유 ← 파티용
 *  - local    : 설정이 비어 있거나 연결에 실패하면 이 브라우저에만 저장하는 '로컬 데모 모드'
 *
 * 로그인은 없다. 브라우저마다 무작위 UUID(client id)를 한 번 만들어 localStorage 에 보관하고,
 * Supabase 에는 그 해시만 저장된다 (supabase/schema.sql 참고).
 * ========================================================= */
(function () {
  'use strict';

  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const BUCKET = 'pumpkins';
  const COMMENT_MAX = 100;
  const NAME_MAX = 12;

  const LS_CLIENT = 'axp_client';
  const LS_ENTRIES = 'axp_entries';
  const LS_VOTE = 'axp_vote';
  const LS_MINE = 'axp_my_entry';
  const LS_COMMENTS = 'axp_comments';
  const LS_MY_COMMENTS = 'axp_my_comments';

  let mode = 'local';
  let sortBy = 'likes';
  let entries = [];
  let comments = [];
  const subs = new Set();
  const commentSubs = new Set();

  /* ---------------- 공통 ---------------- */
  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) { /* noop */ }
  }
  function readJSON(k) {
    try {
      const v = JSON.parse(lsGet(k) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function sorted() {
    const list = entries.slice();
    if (sortBy === 'likes') list.sort((a, b) => b.likes - a.likes || a.createdAt - b.createdAt);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }
  function notify(error) {
    const list = sorted();
    subs.forEach((fn) => fn(list, { mode, sortBy, error }));
  }
  function notifyComments(error) {
    commentSubs.forEach((fn) => fn(comments, { error }));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('스크립트를 불러오지 못했어요: ' + src));
      document.head.appendChild(s);
    });
  }

  // 브라우저 고유 id (UUID 형식이어야 서버 함수가 받는다)
  function clientId() {
    let id = lsGet(LS_CLIENT);
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
      if (window.crypto && crypto.randomUUID) id = crypto.randomUUID();
      else {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
        id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
      }
      lsSet(LS_CLIENT, id);
    }
    return id;
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  /* =========================================================
   * Supabase 모드
   * ========================================================= */
  const sb = { client: null, hash: '', url: '', myVote: null, timer: 0, poll: 0 };

  function sbError(error) {
    // RPC 안에서 raise 한 메시지를 그대로 보여준다
    const msg = (error && (error.message || error.details)) || '서버에 문제가 생겼어요.';
    return new Error(/fetch|network/i.test(msg) ? '인터넷 연결을 확인해주세요.' : msg);
  }

  async function sbFetch() {
    const c = sb.client;
    const [e, cm, v] = await Promise.all([
      c.from('entries').select('id, owner_hash, author, title, image_path, likes, created_at, updated_at'),
      c.from('comments').select('id, entry_id, owner_hash, author, body, created_at'),
      c.from('votes').select('entry_id').eq('voter_hash', sb.hash).maybeSingle(),
    ]);
    if (e.error) throw sbError(e.error);
    if (cm.error) throw sbError(cm.error);
    const base = `${sb.url}/storage/v1/object/public/${BUCKET}/`;
    entries = (e.data || []).map((r) => ({
      id: r.id,
      author: r.author,
      title: r.title,
      likes: r.likes || 0,
      createdAt: Date.parse(r.created_at) || Date.now(),
      imageUrl: base + r.image_path.split('/').map(encodeURIComponent).join('/'),
      mine: r.owner_hash === sb.hash,
    }));
    comments = (cm.data || []).map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      author: r.author,
      text: r.body,
      createdAt: Date.parse(r.created_at) || Date.now(),
      mine: r.owner_hash === sb.hash,
    }));
    sb.myVote = v.data ? v.data.entry_id : null;
    notify();
    notifyComments();
  }

  // 실시간 이벤트가 몰려도 0.3초에 한 번만 다시 읽는다
  function sbSchedule() {
    clearTimeout(sb.timer);
    sb.timer = setTimeout(() => sbFetch().catch((e) => console.warn('[voting] 새로고침 실패:', e.message)), 300);
  }

  async function sbInit(cfg) {
    await loadScript(SUPABASE_JS);
    sb.url = String(cfg.url).replace(/\/+$/, '');
    sb.client = window.supabase.createClient(sb.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    sb.hash = await sha256Hex(clientId());
    mode = 'supabase';
    await sbFetch();
    sb.client
      .channel('axp-hall')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, sbSchedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, sbSchedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, sbSchedule)
      .subscribe();
    // 실시간 연결이 막힌 환경을 위한 안전장치 (15초마다, 화면을 보고 있을 때만)
    sb.poll = setInterval(() => { if (!document.hidden) sbSchedule(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sbSchedule(); });
  }

  async function rpc(fn, args) {
    const { data, error } = await sb.client.rpc(fn, Object.assign({ p_client: clientId() }, args));
    if (error) throw sbError(error);
    return data;
  }

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const type = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  }

  /* =========================================================
   * 로컬 데모 모드 (이 브라우저에만 저장)
   * ========================================================= */
  function readLocal() {
    return readJSON(LS_ENTRIES);
  }
  function writeLocal(list) {
    if (!lsSet(LS_ENTRIES, JSON.stringify(list))) throw new Error('브라우저 저장 공간이 부족해요.');
  }
  function refreshLocal() {
    const mine = lsGet(LS_MINE);
    entries = readLocal().map((e) => Object.assign({}, e, { mine: e.id === mine }));
    notify();
  }
  function refreshLocalComments() {
    const my = readJSON(LS_MY_COMMENTS);
    comments = readJSON(LS_COMMENTS).map((c) => Object.assign({}, c, { mine: my.includes(c.id) }));
    notifyComments();
  }
  function applyLocalLikes(ops) {
    const list = readLocal();
    for (const [id, d] of ops) {
      const e = list.find((x) => x.id === id);
      if (e) e.likes = Math.max(0, (e.likes || 0) + d);
    }
    writeLocal(list);
    refreshLocal();
  }

  // 로컬 모드의 사탕 뺏기용: 한 작품 → 다른 작품으로 사탕 1개
  async function transferCandy(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;
    const list = readLocal();
    const f = list.find((x) => x.id === fromId), t = list.find((x) => x.id === toId);
    if (!f || !t || (f.likes || 0) <= 0) return false;
    f.likes -= 1;
    t.likes = (t.likes || 0) + 1;
    writeLocal(list);
    const history = readJSON('axp_candy_transfers');
    history.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), from: fromId, to: toId, fromAuthor: f.author, toAuthor: t.author, created_at: new Date().toISOString() });
    lsSet('axp_candy_transfers', JSON.stringify(history));
    refreshLocal();
    return true;
  }

  /* =========================================================
   * 공개 API
   * ========================================================= */
  async function init() {
    const cfg = window.SUPABASE_CONFIG;
    if (cfg && cfg.url && cfg.anonKey) {
      try {
        await sbInit(cfg);
        return mode;
      } catch (e) {
        console.warn('[voting] Supabase 연결 실패 → 로컬 데모 모드로 동작합니다.', e);
        mode = 'local';
      }
    }
    window.addEventListener('storage', (e) => {
      if (e.key === LS_ENTRIES || e.key === LS_MINE) refreshLocal();
      if (e.key === LS_COMMENTS) refreshLocalComments();
    });
    refreshLocal();
    refreshLocalComments();
    return mode;
  }

  // 출품 (1인 1작품 — 다시 출품하면 교체, 받은 사탕은 유지)
  async function submit({ author, title, imageUrl }) {
    if (mode === 'supabase') {
      const path = `${sb.hash}/${Date.now()}.jpg`;
      const up = await sb.client.storage.from(BUCKET).upload(path, dataUrlToBlob(imageUrl), { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw sbError(up.error);
      const r = await rpc('submit_entry', { p_author: author, p_title: title, p_image_path: path });
      await sbFetch();
      return { id: r.id, updated: !!r.updated };
    }
    const mine = lsGet(LS_MINE);
    const list = readLocal();
    const existing = mine && list.find((x) => x.id === mine);
    if (existing) {
      Object.assign(existing, { author, title, imageUrl });
      writeLocal(list);
      refreshLocal();
      return { id: mine, updated: true };
    }
    const id = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    list.push({ id, author, title, imageUrl, likes: 0, createdAt: Date.now() });
    writeLocal(list);
    lsSet(LS_MINE, id);
    refreshLocal();
    return { id, updated: false };
  }

  // 사탕 던지기 — 같은 작품 다시 누르면 취소, 다른 작품이면 옮기기
  async function vote(id) {
    if (mode === 'supabase') {
      const action = await rpc('cast_vote', { p_entry: id });
      await sbFetch();
      return { action };
    }
    const prev = lsGet(LS_VOTE);
    if (prev === id) {
      applyLocalLikes([[id, -1]]);
      lsDel(LS_VOTE);
      return { action: 'cancel' };
    }
    const prevExists = prev && entries.some((e) => e.id === prev);
    applyLocalLikes(prevExists ? [[prev, -1], [id, 1]] : [[id, 1]]);
    lsSet(LS_VOTE, id);
    return { action: prevExists ? 'move' : 'vote' };
  }

  // 사탕 뺏기 결과 (Supabase 모드에서는 대상 고르기·이동·쿨다운을 서버 함수가 한 번에 처리)
  async function candyGame(win) {
    const r = await rpc('candy_game', { p_win: !!win });
    await sbFetch();
    return { moved: !!r.moved, other: r.moved ? { id: r.other_id, author: r.other_author } : null };
  }

  // 1:1 대결(줄다리기) 결과 — 이기면 상대 → 나, 지면 나 → 상대로 사탕 1개
  async function candyDuel(targetId, win) {
    if (mode === 'supabase') {
      const r = await rpc('candy_duel', { p_target: targetId, p_win: !!win });
      await sbFetch();
      return { moved: !!r.moved };
    }
    const myId = (entries.find((e) => e.mine) || {}).id;
    return { moved: win ? await transferCandy(targetId, myId) : await transferCandy(myId, targetId) };
  }

  async function addComment(entryId, author, text) {
    author = String(author || '').trim().slice(0, NAME_MAX);
    text = String(text || '').trim().slice(0, COMMENT_MAX);
    if (!author) throw new Error('닉네임을 입력해주세요.');
    if (!text) throw new Error('댓글 내용을 입력해주세요.');
    if (mode === 'supabase') {
      const id = await rpc('add_comment', { p_entry: entryId, p_author: author, p_body: text });
      await sbFetch();
      return id;
    }
    const id = 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    lsSet(LS_MY_COMMENTS, JSON.stringify([...readJSON(LS_MY_COMMENTS), id].slice(-200)));
    const list = readJSON(LS_COMMENTS);
    list.push({ id, entryId, author, text, createdAt: Date.now() });
    if (!lsSet(LS_COMMENTS, JSON.stringify(list))) throw new Error('브라우저 저장 공간이 부족해요.');
    refreshLocalComments();
    return id;
  }

  async function deleteComment(id) {
    if (mode === 'supabase') {
      await rpc('delete_comment', { p_comment: id });
      await sbFetch();
      return;
    }
    if (!readJSON(LS_MY_COMMENTS).includes(id)) throw new Error('내가 쓴 댓글만 지울 수 있어요.');
    lsSet(LS_COMMENTS, JSON.stringify(readJSON(LS_COMMENTS).filter((c) => c.id !== id)));
    lsSet(LS_MY_COMMENTS, JSON.stringify(readJSON(LS_MY_COMMENTS).filter((x) => x !== id)));
    refreshLocalComments();
  }

  // 내 작품 삭제 (로그인 없이: 이 브라우저의 client id 로 본인 확인)
  async function deleteEntry() {
    if (mode === 'supabase') {
      await rpc('delete_entry', {});
      await sbFetch();
      return;
    }
    const mine = lsGet(LS_MINE);
    if (!mine) throw new Error('삭제할 내 작품이 없어요.');
    writeLocal(readLocal().filter((e) => e.id !== mine));
    lsSet(LS_COMMENTS, JSON.stringify(readJSON(LS_COMMENTS).filter((c) => c.entryId !== mine)));
    try { if (lsGet(LS_VOTE) === mine) localStorage.removeItem(LS_VOTE); localStorage.removeItem(LS_MINE); } catch (e) { /* noop */ }
    refreshLocal();
    refreshLocalComments();
  }

  function setSort(s) {
    if (s === sortBy) return;
    sortBy = s;
    notify();
  }

  window.Voting = {
    init,
    submit,
    vote,
    setSort,
    candyHistory: async (before = null) => {
      if (mode === 'supabase') return (await rpc('my_candy_history', { p_before: before })) || [];
      const mine = lsGet(LS_MINE);
      const rows = readJSON('axp_candy_transfers').filter((r) => r.from === mine || r.to === mine).reverse();
      const offset = before === null ? 0 : rows.findIndex((r) => r.id === before) + 1;
      return rows.slice(offset, offset + 100).map((r) => ({ id: r.id, direction: r.to === mine ? 'gained' : 'lost', other_author: r.to === mine ? r.fromAuthor : r.toAuthor, created_at: r.created_at }));
    },
    candyGame,
    candyDuel,
    transferCandy,
    addComment,
    deleteComment,
    deleteEntry,
    mode: () => mode,
    client: () => (mode === 'supabase' ? sb.client : null), // 실시간 대결(줄다리기)용
    entries: () => sorted(),
    onUpdate: (fn) => { subs.add(fn); fn(sorted(), { mode, sortBy }); },
    onComments: (fn) => { commentSubs.add(fn); fn(comments, {}); },
    myVote: () => (mode === 'supabase' ? sb.myVote : lsGet(LS_VOTE)),
    myEntry: () => ((entries.find((e) => e.mine) || {}).id || null),
    commentsFor: (entryId) => comments.filter((c) => c.entryId === entryId).sort((a, b) => a.createdAt - b.createdAt),
    isMyComment: (id) => !!(comments.find((c) => c.id === id) || {}).mine,
    COMMENT_MAX,
    NAME_MAX,
  };
})();
