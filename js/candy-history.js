(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const dialog = $('candyHistoryDialog');
  let rows = [], filter = 'all', hasMore = false, busy = false;

  function render() {
    $('candyHistoryList').replaceChildren();
    const visible = rows.filter((r) => filter === 'all' || r.direction === filter);
    for (const r of visible) {
      const item = document.createElement('li');
      const gained = r.direction === 'gained';
      const text = document.createElement('span');
      text.textContent = gained ? `${r.other_author}님에게서 사탕 1개를 얻었어요` : `${r.other_author}님에게 사탕 1개를 뺏겼어요`;
      const time = document.createElement('time');
      time.dateTime = r.created_at;
      time.textContent = new Date(r.created_at).toLocaleString('ko-KR');
      item.className = gained ? 'history-gained' : 'history-lost';
      item.append(text, time);
      $('candyHistoryList').append(item);
    }
    $('candyHistoryStatus').textContent = visible.length ? '' : (hasMore ? '불러온 기록에 해당 내역이 없어요. 이전 기록을 더 확인해보세요.' : '아직 해당 사탕 기록이 없어요.');
    $('candyHistoryMore').hidden = !hasMore;
    for (const b of document.querySelectorAll('[data-history]')) b.setAttribute('aria-pressed', String(b.dataset.history === filter));
  }

  async function load(more = false) {
    if (busy) return;
    busy = true;
    $('candyHistoryMore').disabled = $('candyHistoryRefresh').disabled = true;
    $('candyHistoryStatus').textContent = '기록을 불러오는 중…';
    if (!more) { rows = []; $('candyHistoryList').replaceChildren(); $('candyHistoryMore').hidden = true; }
    try {
      const page = await window.Voting.candyHistory(more && rows.length ? rows[rows.length - 1].id : null);
      rows = more ? rows.concat(page) : page;
      hasMore = page.length === 100;
      render();
    } catch (e) {
      $('candyHistoryStatus').textContent = '기록을 불러오지 못했어요. 잠시 후 새로고침해주세요.';
      console.warn('[candy-history]', e);
    } finally {
      busy = false;
      $('candyHistoryMore').disabled = $('candyHistoryRefresh').disabled = false;
    }
  }

  $('candyHistoryBtn').onclick = () => { dialog.showModal(); load(); };
  $('candyHistoryClose').onclick = () => dialog.close();
  $('candyHistoryRefresh').onclick = () => load();
  $('candyHistoryMore').onclick = () => load(true);
  for (const b of document.querySelectorAll('[data-history]')) b.onclick = () => { if (!busy) { filter = b.dataset.history; render(); } };
})();
