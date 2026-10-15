/* =========================================================
 * voting.js — Firebase Firestore 연동 & 좋아요(사탕) / 랭킹 정렬
 *
 * - FIREBASE_CONFIG 가 채워져 있으면 Firestore `pumpkins` 컬렉션을 실시간 구독
 * - 비어 있거나 연결에 실패하면 localStorage 기반 '로컬 데모 모드'
 * - 1인 1투표: 브라우저 localStorage 에 내가 투표한 작품 id 를 기억
 * - 출품작별 댓글: Firestore `comments` 컬렉션 (entryId 로 작품과 연결)
 * ========================================================= */
(function () {
  'use strict';

  const SDK_VERSION = '10.12.2';
  const COLLECTION = 'pumpkins';
  const LS_ENTRIES = 'axp_entries';
  const LS_VOTE = 'axp_vote';
  const LS_MINE = 'axp_my_entry';
  const COMMENTS = 'comments';
  const LS_COMMENTS = 'axp_comments';
  const LS_MY_COMMENTS = 'axp_my_comments';
  const COMMENT_MAX = 100;
  const NAME_MAX = 12;

  let mode = 'local';
  let db = null;
  let unsub = null;
  let sortBy = 'likes';
  let entries = [];
  const subs = new Set();
  let comments = [];
  let commentUnsub = null;
  const commentSubs = new Set();

  /* ---------------- localStorage 헬퍼 ---------------- */
  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) { /* noop */ }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('스크립트 로드 실패: ' + src));
      document.head.appendChild(s);
    });
  }

  /* ---------------- 정렬 & 알림 ---------------- */
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

  /* ---------------- 구독 ---------------- */
  function subscribe() {
    if (mode === 'firebase') {
      if (unsub) unsub();
      const col = db.collection(COLLECTION);
      const q = sortBy === 'likes' ? col.orderBy('likes', 'desc') : col.orderBy('createdAt', 'desc');
      unsub = q.onSnapshot(
        (snap) => {
          entries = snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: 'estimate' });
            return {
              id: d.id,
              author: String(x.author || '익명'),
              title: String(x.title || ''),
              imageUrl: String(x.imageUrl || ''),
              likes: Number(x.likes) || 0,
              createdAt: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now(),
            };
          });
          notify();
        },
        (err) => {
          console.error('[voting] 실시간 구독 오류', err);
          notify(err);
        }
      );
    } else {
      refreshLocal();
    }
  }

  function readLocal() {
    try {
      const arr = JSON.parse(lsGet(LS_ENTRIES) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocal(list) {
    if (!lsSet(LS_ENTRIES, JSON.stringify(list))) {
      throw new Error('브라우저 저장 공간이 부족해요. 오래된 출품작을 정리하거나 Firebase 모드를 사용해 주세요.');
    }
  }

  function refreshLocal() {
    entries = readLocal();
    notify();
  }

  async function init() {
    const cfg = window.FIREBASE_CONFIG;
    if (cfg && cfg.apiKey && cfg.projectId) {
      try {
        const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
        await loadScript(`${base}/firebase-app-compat.js`);
        await loadScript(`${base}/firebase-firestore-compat.js`);
        if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
        db = window.firebase.firestore();
        mode = 'firebase';
      } catch (e) {
        console.warn('[voting] Firebase 초기화 실패 → 로컬 데모 모드로 동작합니다.', e);
        mode = 'local';
      }
    }
    if (mode === 'local') {
      // 같은 PC 의 다른 탭에서 바뀐 내용도 반영
      window.addEventListener('storage', (e) => {
        if (e.key === LS_ENTRIES) refreshLocal();
        if (e.key === LS_COMMENTS) refreshLocalComments();
      });
    }
    subscribe();
    subscribeComments();
    return mode;
  }

  /* ---------------- 출품 ---------------- */
  async function submit({ author, title, imageUrl }) {
    const mine = lsGet(LS_MINE);
    if (mode === 'firebase') {
      const fv = window.firebase.firestore.FieldValue;
      const col = db.collection(COLLECTION);
      if (mine) {
        try {
          await col.doc(mine).update({ author, title, imageUrl, updatedAt: fv.serverTimestamp() });
          return { id: mine, updated: true };
        } catch (e) {
          // 기존 문서가 없으면 새로 만든다
        }
      }
      const ref = await col.add({ author, title, imageUrl, likes: 0, createdAt: fv.serverTimestamp() });
      lsSet(LS_MINE, ref.id);
      return { id: ref.id, updated: false };
    }

    const list = readLocal();
    const existing = mine && list.find((x) => x.id === mine);
    if (existing) {
      existing.author = author;
      existing.title = title;
      existing.imageUrl = imageUrl;
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

  /* ---------------- 투표 (사탕 던지기) ---------------- */
  async function applyLikes(ops) {
    if (mode === 'firebase') {
      // 사탕 뺏기로 개수가 바뀌었을 수 있으니 트랜잭션으로 읽고 0 아래로는 내리지 않는다
      const col = db.collection(COLLECTION);
      await db.runTransaction(async (tx) => {
        const docs = await Promise.all(ops.map(([id]) => tx.get(col.doc(id))));
        ops.forEach(([id, d], i) => {
          if (!docs[i].exists) return;
          const cur = Number(docs[i].data().likes) || 0;
          if (cur + d < 0) return;
          tx.update(col.doc(id), { likes: cur + d });
        });
      });
      return;
    }
    const list = readLocal();
    for (const [id, d] of ops) {
      const e = list.find((x) => x.id === id);
      if (e) e.likes = Math.max(0, (e.likes || 0) + d);
    }
    writeLocal(list);
    refreshLocal();
  }

  /* ---------------- 사탕 뺏기: 한 작품 → 다른 작품으로 사탕 1개 이동 ---------------- */
  // 보내는 쪽 사탕이 0개면 false (동시에 여러 명이 뺏어도 음수가 되지 않도록 트랜잭션 처리)
  async function transferCandy(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;
    if (mode === 'firebase') {
      const col = db.collection(COLLECTION);
      return db.runTransaction(async (tx) => {
        const [f, t] = await Promise.all([tx.get(col.doc(fromId)), tx.get(col.doc(toId))]);
        if (!f.exists || !t.exists) return false;
        const fl = Number(f.data().likes) || 0, tl = Number(t.data().likes) || 0;
        if (fl <= 0) return false;
        tx.update(col.doc(fromId), { likes: fl - 1 });
        tx.update(col.doc(toId), { likes: tl + 1 });
        return true;
      });
    }
    const list = readLocal();
    const f = list.find((x) => x.id === fromId), t = list.find((x) => x.id === toId);
    if (!f || !t || (f.likes || 0) <= 0) return false;
    f.likes -= 1;
    t.likes = (t.likes || 0) + 1;
    writeLocal(list);
    refreshLocal();
    return true;
  }

  // 같은 작품을 다시 누르면 취소, 다른 작품을 누르면 투표를 옮긴다
  async function vote(id) {
    const prev = lsGet(LS_VOTE);
    if (prev === id) {
      await applyLikes([[id, -1]]);
      lsDel(LS_VOTE);
      return { action: 'cancel' };
    }
    const prevExists = prev && entries.some((e) => e.id === prev);
    await applyLikes(prevExists ? [[prev, -1], [id, 1]] : [[id, 1]]);
    lsSet(LS_VOTE, id);
    return { action: prevExists ? 'move' : 'vote' };
  }

  /* ---------------- 댓글 ---------------- */
  function readJSON(k) {
    try {
      const v = JSON.parse(lsGet(k) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function notifyComments(error) {
    commentSubs.forEach((fn) => fn(comments, { error }));
  }

  function refreshLocalComments() {
    comments = readJSON(LS_COMMENTS);
    notifyComments();
  }

  function subscribeComments() {
    if (mode !== 'firebase') return refreshLocalComments();
    if (commentUnsub) commentUnsub();
    commentUnsub = db.collection(COMMENTS).orderBy('createdAt', 'asc').onSnapshot(
      (snap) => {
        comments = snap.docs.map((d) => {
          const x = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            entryId: String(x.entryId || ''),
            author: String(x.author || '익명'),
            text: String(x.text || ''),
            createdAt: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now(),
          };
        });
        notifyComments();
      },
      (err) => {
        console.error('[voting] 댓글 구독 오류', err);
        notifyComments(err);
      }
    );
  }

  function myCommentIds() {
    return readJSON(LS_MY_COMMENTS);
  }

  async function addComment(entryId, author, text) {
    author = String(author || '').trim().slice(0, NAME_MAX);
    text = String(text || '').trim().slice(0, COMMENT_MAX);
    if (!author) throw new Error('닉네임을 입력해주세요.');
    if (!text) throw new Error('댓글 내용을 입력해주세요.');
    // 화면이 다시 그려지기 전에 '내 댓글'로 먼저 기록해 둔다 (삭제 버튼이 바로 보이도록)
    const remember = (id) => lsSet(LS_MY_COMMENTS, JSON.stringify([...myCommentIds(), id].slice(-200)));
    let id;
    if (mode === 'firebase') {
      const fv = window.firebase.firestore.FieldValue;
      const ref = db.collection(COMMENTS).doc();
      id = ref.id;
      remember(id);
      await ref.set({ entryId, author, text, createdAt: fv.serverTimestamp() });
    } else {
      const list = readJSON(LS_COMMENTS);
      id = 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      list.push({ id, entryId, author, text, createdAt: Date.now() });
      remember(id);
      if (!lsSet(LS_COMMENTS, JSON.stringify(list))) throw new Error('브라우저 저장 공간이 부족해요.');
      refreshLocalComments();
    }
    return id;
  }

  // 내가 쓴 댓글만 지울 수 있다 (이 브라우저에서 쓴 댓글 기준)
  async function deleteComment(id) {
    if (!myCommentIds().includes(id)) throw new Error('내가 쓴 댓글만 지울 수 있어요.');
    if (mode === 'firebase') {
      await db.collection(COMMENTS).doc(id).delete();
    } else {
      lsSet(LS_COMMENTS, JSON.stringify(readJSON(LS_COMMENTS).filter((c) => c.id !== id)));
      refreshLocalComments();
    }
    lsSet(LS_MY_COMMENTS, JSON.stringify(myCommentIds().filter((x) => x !== id)));
  }

  function setSort(s) {
    if (s === sortBy) return;
    sortBy = s;
    subscribe();
  }

  window.Voting = {
    init,
    submit,
    vote,
    setSort,
    onUpdate: (fn) => { subs.add(fn); fn(sorted(), { mode, sortBy }); },
    myVote: () => lsGet(LS_VOTE),
    myEntry: () => lsGet(LS_MINE),
    mode: () => mode,
    entries: () => sorted(),
    transferCandy,
    addComment,
    deleteComment,
    commentsFor: (entryId) => comments.filter((c) => c.entryId === entryId).sort((a, b) => a.createdAt - b.createdAt),
    isMyComment: (id) => myCommentIds().includes(id),
    onComments: (fn) => { commentSubs.add(fn); fn(comments, {}); },
    COMMENT_MAX,
    NAME_MAX,
  };
})();
