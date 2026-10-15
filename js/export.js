/* =========================================================
 * export.js — 완성 이미지 내보내기
 *   - PNG 다운로드: 2배 해상도(2000px) + 선택 시 하단 네임플레이트
 *   - 갤러리 썸네일: 작은 JPEG(dataURL) — Firestore 문서 1MB 제한 고려
 * ========================================================= */
(function () {
  'use strict';

  const R = () => window.PumpkinRender;

  function compose(state, scale, opts) {
    const S = R().S, PH = R().PLATE_H;
    const out = document.createElement('canvas');
    out.width = Math.round(S * scale);
    out.height = Math.round((S + (opts.includePlate ? PH : 0)) * scale);
    const c = out.getContext('2d');
    c.scale(scale, scale);
    R().render(c, state, {});
    if (opts.includePlate) {
      c.save();
      c.translate(0, S);
      R().drawPlate(c, state, opts.artist, { scale });
      c.restore();
    }
    return out;
  }

  async function downloadPNG(state, opts) {
    const out = compose(state, 2, opts);
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    if (!blob) throw new Error('PNG 생성 실패');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = String(opts.fileName || 'my-pumpkin').replace(/[\\/:*?"<>|]/g, '_') + '.png';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  function thumbnail(state, opts) {
    return compose(state, 0.44, { includePlate: true, artist: opts.artist }).toDataURL('image/jpeg', 0.84);
  }

  window.Exporter = { downloadPNG, thumbnail };
})();
