/* =========================================================
 * customizer.js — 호박 캐릭터 레이어 합성 & Canvas 렌더링 엔진
 *
 * 1000 x 1000 논리 캔버스 기준.
 * 레이어 (뒤 → 앞)
 *  1. 배경  2. 호박 뒤 요소(날개·꼬리·망토 등)  3. 캐릭터 바디(피부색 적용)
 *  4. 하의·신발  5. 상의  6. 얼굴 파츠·소품·스티커·글자(앞 요소)  7. 직접 그린 그림
 *  + 네임플레이트(images/name1.jpg)는 미리보기 아래 띠 / 저장 이미지 하단에 합성
 * ========================================================= */
(function () {
  'use strict';

  const S = 1000;
  const A = window.ASSETS || {};
  const img = {};
  const sprites = {};

  /* ---------------- 데이터 ---------------- */
  const HEADS = [
    { name: '기본형', eyesY: 406, noseY: 480, mouthY: 555, width: 1, neck: 670 },
    { name: '동그란형', eyesY: 406, noseY: 480, mouthY: 550, width: 1, neck: 668 },
    { name: '길쭉한형', eyesY: 396, noseY: 479, mouthY: 563, width: 0.82, neck: 666 },
    { name: '넓적한형', eyesY: 416, noseY: 478, mouthY: 538, width: 1.12, neck: 680 },
    { name: '찌그러진형', eyesY: 416, noseY: 489, mouthY: 562, width: 1.12, neck: 664 },
    { name: '한입 먹힌형', eyesY: 406, noseY: 480, mouthY: 555, width: 1, neck: 670 },
  ];

  const FACE_LABELS = {
    eyes: ['호박 눈', '동그란 눈', '웃는 눈', '하트 눈', '별 눈', '졸린 눈', '화난 반달 눈', '윙크', 'X자 눈', '클래식 세모'],
    nose: ['세모 코', '동그란 코', '하트 코', '마름모 코', '작은 코', '코 없음', '박쥐 코', '해골 콧구멍', '역삼각형 코'],
    mouth: ['호박 미소', '활짝 웃음', '작은 미소', '깜짝 놀람', '송곳니', '일자 입', '지그재그 이빨', '멍한 O자 입', '꿰맨 자국'],
  };

  const SKINS = [
    { id: 'classic', label: '클래식 오렌지', swatch: '#f0813c' },
    { id: '#8fb04a', label: '좀비 그린', swatch: '#8fb04a' },
    { id: '#6c45a8', label: '다크 고스트 퍼플', swatch: '#6c45a8' },
    { id: '#efe6d3', label: '스푸키 화이트', swatch: '#efe6d3' },
    { id: '#3e3c48', label: '섀도우 블랙', swatch: '#3e3c48' },
  ];

  const BACKGROUNDS = [
    { id: '#241c37', label: '한밤중' },
    { id: '#3a1020', label: '블러드 문', moon: '#ffb4a6' },
    { id: '#11281c', label: '늪지 안개', moon: '#e3ffd6' },
    { id: '#2e1708', label: '호박밭', moon: '#ffd79a' },
    { id: '#0f1830', label: '유령 달빛', moon: '#dfe9ff' },
    { id: '#f0eaf7', label: '라벤더 (밝게)' },
    { id: 'img:bgVillage', label: '으스스한 마을', image: 'bgVillage' },
    { id: 'img:bgForest', label: '유령의 숲', image: 'bgForest' },
  ];

  const OUTFITS = {
    top: [
      { id: 'none', label: '없음' },
      { id: 'tshirt', label: '기본 티셔츠' },
      { id: 'frank', label: '프랑켄슈타인 자켓' },
      { id: 'prisoner', label: '줄무늬 죄수복' },
      { id: 'tuxedo', label: '뱀파이어 턱시도' },
      { id: 'cape', label: '드라큘라 케이프' },
    ],
    bottom: [
      { id: 'none', label: '없음' },
      { id: 'jeans', label: '찢어진 청바지' },
      { id: 'overalls', label: '호박색 멜빵바지' },
      { id: 'skirt', label: '펑크 스커트' },
      { id: 'mummy', label: '미라 붕대 팬츠' },
    ],
    shoes: [
      { id: 'none', label: '없음' },
      { id: 'sneakers', label: '통통한 스니커즈' },
      { id: 'witch', label: '마녀 뾰족 구두' },
      { id: 'boots', label: '부츠' },
      { id: 'bandage', label: '붕대 감은 발' },
    ],
  };

  // 프롭 시트(1254px 기준) 안의 16개 입체 소품 위치
  const PROP_BOUNDS = [[0, 55, 347, 270], [349, 64, 291, 262], [640, 12, 314, 315], [945, 30, 309, 294], [22, 332, 311, 306], [347, 326, 285, 323], [639, 333, 311, 308], [970, 337, 275, 312], [12, 666, 332, 266], [350, 649, 286, 287], [641, 648, 317, 285], [950, 649, 300, 290], [14, 928, 336, 322], [369, 934, 271, 317], [641, 923, 317, 329], [962, 929, 287, 325]];
  // [이름, 인덱스, 기본 x, y, 크기]
  const PROPS = [
    ['박쥐', 0, 730, 280, 190], ['거미', 1, 740, 580, 130], ['거미줄', 2, 280, 330, 240], ['마녀 모자', 3, 500, 210, 260],
    ['해골', 4, 260, 740, 150], ['빗자루', 5, 230, 700, 230], ['유령', 6, 760, 730, 190], ['마법 물약', 7, 250, 750, 170],
    ['포장 사탕', 8, 740, 760, 150], ['단풍잎', 9, 290, 270, 130], ['마법 지팡이', 10, 760, 680, 230], ['마법책', 11, 500, 790, 170],
    ['마녀 솥', 12, 230, 810, 220], ['수정 구슬', 13, 770, 790, 180], ['작은 묘비', 14, 780, 830, 180], ['촛불', 15, 230, 820, 170],
  ];

  // README 의 악세서리 10종 (머리/얼굴 · 등/날개 · 손 소품)
  const ACCESSORIES = [
    { group: '머리 / 얼굴', name: '뾰족 마녀 모자', o: { type: 'prop', index: 3, x: 520, y: 165, w: 340, h: 340 } },
    { group: '머리 / 얼굴', name: '미니 박쥐 머리띠', o: { type: 'acc', kind: 'batband', x: 500, y: 190, w: 560, h: 220 } },
    { group: '머리 / 얼굴', name: '해골 핀', o: { type: 'prop', index: 4, x: 700, y: 255, w: 120, h: 120, rotation: 12 } },
    { group: '머리 / 얼굴', name: '호박 꼭지 리본', o: { type: 'acc', kind: 'ribbon', x: 560, y: 200, w: 170, h: 110 } },
    { group: '머리 / 얼굴', name: '똥 모자', o: { type: 'acc', kind: 'poop', x: 505, y: 140, w: 300, h: 260 } },
    { group: '등 / 날개', name: '박쥐 날개', o: { type: 'acc', kind: 'wings', x: 500, y: 700, w: 800, h: 330, behind: true } },
    { group: '등 / 날개', name: '악마 꼬리', o: { type: 'acc', kind: 'tail', x: 700, y: 820, w: 210, h: 230, behind: true } },
    { group: '등 / 날개', name: '거미줄 망토', o: { type: 'acc', kind: 'webcape', x: 500, y: 805, w: 600, h: 290, behind: true } },
    { group: '손 소품', name: '미니 사탕 바구니', o: { type: 'acc', kind: 'basket', x: 735, y: 845, w: 160, h: 160 } },
    { group: '손 소품', name: '마법 지팡이', o: { type: 'prop', index: 10, x: 255, y: 745, w: 210, h: 210, rotation: -20 } },
    { group: '손 소품', name: '잭오랜턴 미니 램프', o: { type: 'acc', kind: 'lantern', x: 745, y: 855, w: 120, h: 180 } },
  ];

  const EMOJIS = [['🎩', '마술 모자'], ['👑', '왕관'], ['🎀', '리본'], ['🕶️', '선글라스'], ['👓', '안경'], ['🦇', '박쥐'], ['👻', '유령'], ['🕷️', '거미'], ['🍭', '사탕'], ['🍬', '캔디'], ['🌙', '달'], ['⭐', '별'], ['💜', '하트'], ['🩸', '핏방울'], ['⚡', '번개']];

  const BRUSHES = {
    pen: { label: '기본 펜' },
    blood: { label: '피', color: '#9b0a12', hi: 'rgba(255,140,140,0.45)', drip: true },
    slime: { label: '슬라임', color: '#73e026', hi: 'rgba(235,255,190,0.6)', glow: 'rgba(120,255,40,0.85)', drip: true },
    candle: { label: '촛불빛', color: '#ffd54a', glow: 'rgba(255,150,0,0.95)' },
    ghost: { label: '유령', color: '#f6f3ff', glow: 'rgba(170,150,255,0.9)' },
  };


  /* ---------------- 유틸 ---------------- */
  function mk(w = S, h = S) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function hexRgb(hex) {
    const n = parseInt(String(hex).slice(1), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
    const [r, g, b] = hexRgb(hex);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function path(c, pts) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.closePath();
    c.fill();
  }
  function heart(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.4);
    c.bezierCurveTo(x - s, y - s * 0.15, x - s * 0.7, y - s * 0.9, x, y - s * 0.4);
    c.bezierCurveTo(x + s * 0.7, y - s * 0.9, x + s, y - s * 0.15, x, y + s * 0.4);
    c.fill();
  }
  function star(c, x, y, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.46 : r;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    path(c, pts);
  }
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function vol(c, x, y, w, h, base) {
    const g = c.createRadialGradient(x + w * 0.35, y + h * 0.3, 1, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.8);
    g.addColorStop(0, shade(base, 0.3));
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade(base, -0.4));
    return g;
  }
  const BAT = [[0, -0.5], [-0.3, -0.85], [-0.42, -0.45], [-1.0, -0.85], [-1.9, -0.65], [-1.6, 0.05], [-1.25, -0.1], [-1.0, 0.3], [-0.7, 0.1], [-0.38, 0.45], [0, 0.7]];
  function batPath(c, x, y, s) {
    c.beginPath();
    c.moveTo(x + BAT[0][0] * s, y + BAT[0][1] * s);
    for (let i = 1; i < BAT.length; i++) c.lineTo(x + BAT[i][0] * s, y + BAT[i][1] * s);
    for (let i = BAT.length - 2; i >= 1; i--) c.lineTo(x - BAT[i][0] * s, y + BAT[i][1] * s);
    c.closePath();
  }

  /* =========================================================
   * 캐릭터 (얼굴형 · 피부색)
   * ========================================================= */
  function drawRaw(c, shape, x = 50, y = 50, size = 900) {
    if (shape === 4 && img.squashed) return c.drawImage(img.squashed, x, y, size, size);
    if (shape === 5) return (img.bitten || img.base) && c.drawImage(img.bitten || img.base, x, y, size, size);
    if (shape === 0 || !img.headSheet) return img.base && c.drawImage(img.base, x, y, size, size);
    const tile = img.headSheet.naturalWidth / 3, off = [0, -0.055, 0, 0.026][shape] || 0;
    c.drawImage(img.headSheet, (shape - 1) * tile, 0, tile, img.headSheet.naturalHeight, x + off * size, y, size, size);
  }

  // 기본 호박의 오른쪽 위를 '앙' 베어 문 모양 — 잇자국과 노란 속살까지 그린다
  function makeBitten(base) {
    const N = base.naturalWidth, k = N / 1100;
    const c = mk(N, N), g = c.getContext('2d');
    g.drawImage(base, 0, 0, N, N);
    const cx = 930 * k, cy = 300 * k, R = 172 * k;
    const toward = Math.atan2(520 * k - cy, 540 * k - cx);
    const bite = (grow) => {
      g.beginPath();
      g.moveTo(cx + R + grow, cy);
      g.arc(cx, cy, R + grow, 0, Math.PI * 2);
      for (let i = 0; i < 7; i++) {
        const a = toward + (i - 3) * 0.3;
        const tx = cx + Math.cos(a) * R * 0.94, ty = cy + Math.sin(a) * R * 0.94, tr = R * 0.2 + grow;
        g.moveTo(tx + tr, ty);
        g.arc(tx, ty, tr, 0, Math.PI * 2);
      }
    };
    g.globalCompositeOperation = 'source-atop';
    const fg = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R + 34 * k);
    fg.addColorStop(0, '#fff3d2'); fg.addColorStop(0.6, '#ffd88f'); fg.addColorStop(1, '#f39a45');
    g.fillStyle = fg;
    bite(30 * k); g.fill();
    g.fillStyle = '#fff7e2';
    g.strokeStyle = 'rgba(190,120,40,0.7)';
    g.lineWidth = 2 * k;
    for (const d of [-0.75, -0.25, 0.3, 0.8]) {
      const a = toward + d, rr = R * 0.94 + R * 0.2 + 12 * k;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 9 * k, 5 * k, a + Math.PI / 2, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    bite(0); g.fill();
    return c;
  }

  const isStem = (r, g, b) => g > r * 0.82 && g >= b;
  const lumOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  // 얼굴형별 분석: 원본, 평균 밝기, 의상용 음영/하이라이트 맵, 몸통 마스크
  const shapeInfo = {};
  function info(shape) {
    if (shapeInfo[shape]) return shapeInfo[shape];
    const raw = mk();
    const rc = raw.getContext('2d', { willReadFrequently: true });
    drawRaw(rc, shape);
    const data = rc.getImageData(0, 0, S, S);
    const d = data.data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200 && !isStem(d[i], d[i + 1], d[i + 2])) { sum += lumOf(d[i], d[i + 1], d[i + 2]); n++; }
    }
    const lmid = n ? sum / n : 128;
    const neck = HEADS[shape].neck;
    const sd = new ImageData(S, S), hd = new ImageData(S, S), md = new ImageData(S, S);
    for (let p = neck * S; p < S * S; p++) {
      const i = p * 4, a = d[i + 3];
      if (!a) continue;
      const f = lumOf(d[i], d[i + 1], d[i + 2]) / lmid;
      const g = Math.max(0, Math.min(255, 255 * Math.min(1, f * 1.1)));
      sd.data[i] = sd.data[i + 1] = sd.data[i + 2] = g;
      sd.data[i + 3] = 255;
      hd.data[i] = hd.data[i + 1] = hd.data[i + 2] = 255;
      hd.data[i + 3] = Math.max(0, Math.min(255, (f - 1.08) * 700));
      md.data[i + 3] = a;
    }
    const toCanvas = (id) => { const c = mk(); c.getContext('2d').putImageData(id, 0, 0); return c; };
    shapeInfo[shape] = { raw, data, lmid, shade: toCanvas(sd), hl: toCanvas(hd), mask: toCanvas(md) };
    return shapeInfo[shape];
  }

  // 피부색 바꾸기: 원본 밝기(음영)는 그대로 두고 색만 갈아 끼운다. 초록 꼭지는 유지.
  const charCache = new Map();
  function character(shape, skin) {
    const key = shape + '|' + skin;
    if (charCache.has(key)) return charCache.get(key);
    const inf = info(shape);
    let out = inf.raw;
    if (/^#[0-9a-f]{6}$/i.test(skin)) {
      const [tr, tg, tb] = hexRgb(skin);
      const od = new ImageData(new Uint8ClampedArray(inf.data.data), S, S);
      const d = od.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3] || isStem(d[i], d[i + 1], d[i + 2])) continue;
        const f = lumOf(d[i], d[i + 1], d[i + 2]) / inf.lmid;
        if (f <= 1) { d[i] = tr * f; d[i + 1] = tg * f; d[i + 2] = tb * f; }
        else {
          const t = Math.min(1, (f - 1) * 1.5);
          d[i] = tr + (255 - tr) * t; d[i + 1] = tg + (255 - tg) * t; d[i + 2] = tb + (255 - tb) * t;
        }
      }
      out = mk();
      out.getContext('2d').putImageData(od, 0, 0);
    }
    if (charCache.size > 16) charCache.delete(charCache.keys().next().value);
    charCache.set(key, out);
    return out;
  }

  /* =========================================================
   * 의상 — 몸통 실루엣에 맞춰 자르고 3D 음영을 입힌다
   * ========================================================= */
  function band(c, color, y0, y1, armBottom) {
    c.fillStyle = color;
    c.fillRect(340, y0, 320, y1 - y0);
    c.fillRect(200, y0, 600, armBottom - y0);
  }

  function drawTopArt(c, top, neck) {
    const y0 = neck - 2;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (top === 'tshirt') {
      band(c, '#7b4fd6', y0, 838, 752);
      c.fillStyle = '#5d37b0';
      c.fillRect(200, 740, 165, 14);
      c.fillRect(635, 740, 165, 14);
      c.fillRect(340, 826, 320, 12);
      c.font = '900 50px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 9;
      c.strokeStyle = '#3b1f78';
      c.strokeText('BOO!', 500, 772);
      c.fillStyle = '#ffb347';
      c.fillText('BOO!', 500, 772);
    } else if (top === 'frank') {
      band(c, '#4a6b3f', y0, 840, 806);
      c.fillStyle = '#c9c9b5';
      path(c, [[468, y0], [532, y0], [500, 770]]);
      c.fillStyle = '#2f4628';
      for (const s of [-1, 1]) path(c, [[500 + s * 32, y0], [500 + s * 78, 760], [500 + s * 18, 840], [500, 770]]);
      c.fillStyle = '#7a5c38';
      c.beginPath(); rrect(c, 565, 760, 46, 40, 4); c.fill();
      c.setLineDash([6, 6]); c.lineWidth = 3; c.strokeStyle = '#ead9b0'; c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#171717'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(395, 770); c.lineTo(440, 740);
      for (let i = 0; i < 5; i++) { c.moveTo(398 + i * 10, 754 - i * 6.5); c.lineTo(406 + i * 10, 772 - i * 6.5); }
      c.stroke();
      c.fillStyle = '#d8c070';
      for (const y of [790, 815]) { c.beginPath(); c.arc(500, y, 6, 0, 7); c.fill(); }
    } else if (top === 'prisoner') {
      band(c, '#f4f0e6', y0, 840, 792);
      c.fillStyle = '#26232b';
      for (let y = y0 + 14; y < 845; y += 36) c.fillRect(200, y, 600, 18);
      c.fillStyle = '#fffbe6';
      c.beginPath(); rrect(c, 548, 752, 64, 34, 4); c.fill();
      c.lineWidth = 3; c.strokeStyle = '#26232b'; c.stroke();
      c.font = '800 22px ui-monospace, monospace';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#26232b';
      c.fillText('1031', 580, 770);
    } else if (top === 'tuxedo') {
      band(c, '#211d2b', y0, 842, 806);
      c.fillStyle = '#f7f4ee';
      path(c, [[452, y0], [548, y0], [500, 836]]);
      c.strokeStyle = '#4a4458'; c.lineWidth = 10;
      c.beginPath(); c.moveTo(452, y0); c.lineTo(430, 760); c.lineTo(500, 836); c.moveTo(548, y0); c.lineTo(570, 760); c.lineTo(500, 836); c.stroke();
      c.fillStyle = '#c0182b';
      path(c, [[500, 694], [462, 676], [462, 712]]);
      path(c, [[500, 694], [538, 676], [538, 712]]);
      c.beginPath(); c.arc(500, 694, 9, 0, 7); c.fillStyle = '#8a0f1d'; c.fill();
      c.fillStyle = '#111';
      for (const y of [745, 780]) { c.beginPath(); c.arc(500, y, 6, 0, 7); c.fill(); }
      c.fillStyle = '#f7f4ee';
      c.fillRect(200, 786, 160, 20); c.fillRect(640, 786, 160, 20);
      c.fillStyle = '#c0182b'; path(c, [[580, 752], [612, 744], [608, 760]]);
    } else if (top === 'cape') {
      band(c, '#6b1020', y0, 840, 800);
      c.fillStyle = '#f5c542';
      for (const y of [730, 770, 810]) { c.beginPath(); c.arc(500, y, 7, 0, 7); c.fill(); }
      c.fillStyle = '#3c0610';
      c.fillRect(200, 788, 160, 14); c.fillRect(640, 788, 160, 14);
    }
    c.restore();
  }

  function drawBottomArt(c, bottom) {
    c.save();
    if (bottom === 'jeans') {
      c.fillStyle = '#3f63a8';
      c.fillRect(330, 812, 340, 92);
      c.setLineDash([7, 6]); c.lineWidth = 3; c.strokeStyle = 'rgba(255,205,120,0.85)';
      c.beginPath(); c.moveTo(500, 812); c.lineTo(500, 846); c.moveTo(372, 850); c.lineTo(372, 898); c.moveTo(628, 850); c.lineTo(628, 898); c.stroke();
      c.setLineDash([]);
      for (const [x, y] of [[420, 868], [578, 878]]) {
        c.fillStyle = '#e7edf8';
        path(c, [[x - 24, y], [x - 12, y - 10], [x - 2, y + 2], [x + 10, y - 10], [x + 24, y], [x + 12, y + 9], [x, y + 5], [x - 13, y + 11]]);
        c.strokeStyle = 'rgba(80,110,170,0.9)'; c.lineWidth = 2;
        c.beginPath(); for (let i = -1; i <= 1; i++) { c.moveTo(x - 18, y + i * 4); c.lineTo(x + 18, y + i * 4); } c.stroke();
      }
      c.fillStyle = '#7193cf';
      c.fillRect(330, 888, 340, 18);
    } else if (bottom === 'overalls') {
      c.fillStyle = '#d2621f';
      c.fillRect(330, 805, 340, 99);
      c.setLineDash([7, 6]); c.lineWidth = 3; c.strokeStyle = 'rgba(255,236,190,0.9)';
      c.beginPath(); c.moveTo(500, 812); c.lineTo(500, 846); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#a84910';
      c.fillRect(330, 888, 340, 16);
    } else if (bottom === 'skirt') {
      c.fillStyle = '#17121e';
      c.fillRect(330, 830, 340, 74);
      c.fillStyle = '#8e44ad';
      for (let y = 846; y < 905; y += 18) c.fillRect(330, y, 340, 9);
    } else if (bottom === 'mummy') {
      c.fillStyle = '#e9e1c8';
      c.fillRect(330, 812, 340, 92);
      c.strokeStyle = 'rgba(120,100,60,0.6)'; c.lineWidth = 3;
      let i = 0;
      for (let y = 806; y < 912; y += 13, i++) {
        c.beginPath(); c.moveTo(320, y + (i % 2 ? 8 : -4)); c.lineTo(680, y + (i % 2 ? -4 : 8)); c.stroke();
      }
    }
    c.restore();
  }

  function drawShoesArt(c, shoes) {
    c.save();
    if (shoes === 'sneakers') {
      c.fillStyle = '#e2463f'; c.fillRect(330, 893, 340, 40);
      c.fillStyle = '#ffffff'; c.fillRect(330, 913, 340, 20);
      c.strokeStyle = '#fff'; c.lineWidth = 4;
      c.beginPath();
      for (const cx of [418, 582]) for (let k = 0; k < 2; k++) { c.moveTo(cx - 14, 899 + k * 7); c.lineTo(cx + 14, 899 + k * 7); }
      c.stroke();
    } else if (shoes === 'witch') {
      c.fillStyle = '#251f2d'; c.fillRect(330, 890, 340, 44);
      c.fillStyle = '#f5c542';
      for (const cx of [418, 582]) { c.fillRect(cx - 13, 897, 26, 5); c.fillRect(cx - 13, 897, 5, 18); c.fillRect(cx + 8, 897, 5, 18); c.fillRect(cx - 13, 910, 26, 5); }
    } else if (shoes === 'boots') {
      c.fillStyle = '#6b3e1f'; c.fillRect(330, 862, 340, 72);
      c.fillStyle = '#9c6537'; c.fillRect(330, 862, 340, 15);
      c.fillStyle = '#2b1609'; c.fillRect(330, 922, 340, 12);
      c.strokeStyle = '#e9d3a6'; c.lineWidth = 3;
      c.beginPath();
      for (const cx of [418, 582]) for (let y = 884; y < 916; y += 10) { c.moveTo(cx - 9, y); c.lineTo(cx + 9, y + 6); c.moveTo(cx + 9, y); c.lineTo(cx - 9, y + 6); }
      c.stroke();
    } else if (shoes === 'bandage') {
      c.fillStyle = '#ece4cc'; c.fillRect(330, 878, 340, 56);
      c.strokeStyle = 'rgba(120,100,60,0.6)'; c.lineWidth = 3;
      let i = 0;
      for (let y = 876; y < 940; y += 10, i++) { c.beginPath(); c.moveTo(320, y + (i % 2 ? 5 : -2)); c.lineTo(680, y + (i % 2 ? -2 : 5)); c.stroke(); }
    }
    c.restore();
  }

  function drawBib(c) {
    c.save();
    c.fillStyle = '#d2621f';
    c.beginPath(); rrect(c, 425, 712, 150, 120, 12); c.fill();
    c.lineCap = 'round';
    c.strokeStyle = '#d2621f'; c.lineWidth = 30;
    c.beginPath(); c.moveTo(438, 722); c.lineTo(385, 668); c.moveTo(562, 722); c.lineTo(615, 668); c.stroke();
    c.setLineDash([6, 5]); c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,236,190,0.9)';
    c.beginPath(); rrect(c, 458, 742, 84, 50, 6); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#ffd34d';
    for (const x of [445, 555]) { c.beginPath(); c.arc(x, 728, 9, 0, 7); c.fill(); }
    c.restore();
  }

  const costumeCache = new Map();
  function costumeLayer(shape, o) {
    if ((!o.top || o.top === 'none') && (!o.bottom || o.bottom === 'none') && (!o.shoes || o.shoes === 'none')) return null;
    const key = [shape, o.top, o.bottom, o.shoes].join('|');
    if (costumeCache.has(key)) return costumeCache.get(key);
    const inf = info(shape);
    const cloth = mk();
    const c = cloth.getContext('2d');
    drawBottomArt(c, o.bottom);
    drawShoesArt(c, o.shoes);
    drawTopArt(c, o.top, HEADS[shape].neck);
    if (o.bottom === 'overalls') drawBib(c);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(inf.mask, 0, 0);

    // 원본 몸통의 음영을 옷에 곱해 입체감을 살린다
    const sh = mk();
    const s = sh.getContext('2d');
    s.drawImage(inf.shade, 0, 0);
    s.globalCompositeOperation = 'destination-in';
    s.drawImage(cloth, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.drawImage(sh, 0, 0);

    const hl = mk();
    const h = hl.getContext('2d');
    h.drawImage(inf.hl, 0, 0);
    h.globalCompositeOperation = 'destination-in';
    h.drawImage(cloth, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 0.35;
    c.drawImage(hl, 0, 0);
    c.globalAlpha = 1;

    if (costumeCache.size > 24) costumeCache.delete(costumeCache.keys().next().value);
    costumeCache.set(key, cloth);
    return cloth;
  }

  // 실루엣 밖으로 튀어나오는 의상 (몸 뒤)
  function costumeBehind(c, o) {
    if (o.top !== 'cape') return;
    c.save();
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(330, 690); c.lineTo(670, 690);
    c.quadraticCurveTo(760, 800, 790, 950);
    const L = 210, R = 790, n = 7, step = (R - L) / n;
    for (let i = 1; i <= n; i++) { const x = R - step * i; c.lineTo(x + step / 2, 925); c.lineTo(x, 950); }
    c.quadraticCurveTo(240, 800, 330, 690);
    c.closePath();
    const g = c.createLinearGradient(210, 0, 790, 0);
    g.addColorStop(0, '#5e0715'); g.addColorStop(0.5, '#b0162d'); g.addColorStop(1, '#5e0715');
    c.fillStyle = g; c.fill();
    c.lineWidth = 16; c.strokeStyle = '#120c14'; c.stroke();
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(500 + s * 120, 700);
      c.lineTo(500 + s * 290, 610);
      c.lineTo(500 + s * 250, 680);
      c.lineTo(500 + s * 300, 720);
      c.lineTo(500 + s * 170, 730);
      c.closePath();
      c.fillStyle = '#16111b'; c.fill();
      c.lineWidth = 4; c.strokeStyle = '#000'; c.stroke();
      c.beginPath();
      c.moveTo(500 + s * 140, 704); c.lineTo(500 + s * 262, 636); c.lineTo(500 + s * 232, 690); c.lineTo(500 + s * 170, 716); c.closePath();
      c.fillStyle = '#a8132a'; c.fill();
    }
    c.restore();
  }

  // 실루엣 밖으로 튀어나오는 의상 (몸 앞)
  function costumeFront(c, o) {
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (o.bottom === 'skirt') {
      c.beginPath();
      c.moveTo(352, 808); c.lineTo(648, 808); c.lineTo(695, 885);
      for (let i = 1; i <= 10; i++) c.lineTo(695 - i * 39, i % 2 ? 870 : 888);
      c.closePath();
      c.fillStyle = '#b3122a'; c.fill();
      c.save(); c.clip();
      c.strokeStyle = 'rgba(0,0,0,0.42)'; c.lineWidth = 10;
      c.beginPath();
      for (let x = 300; x < 720; x += 34) { c.moveTo(x, 800); c.lineTo(x, 900); }
      for (let y = 824; y < 900; y += 34) { c.moveTo(300, y); c.lineTo(720, y); }
      c.stroke();
      c.strokeStyle = 'rgba(255,214,90,0.65)'; c.lineWidth = 2;
      c.beginPath();
      for (let x = 317; x < 720; x += 34) { c.moveTo(x, 800); c.lineTo(x, 900); }
      c.stroke();
      const sg = c.createLinearGradient(300, 0, 700, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(0.4, 'rgba(255,255,255,0.08)'); sg.addColorStop(1, 'rgba(0,0,0,0.4)');
      c.fillStyle = sg; c.fillRect(300, 800, 420, 100);
      c.restore();
      c.lineWidth = 4; c.strokeStyle = '#3b0710'; c.stroke();
      c.fillStyle = '#1a141f';
      c.beginPath(); rrect(c, 350, 800, 300, 20, 8); c.fill();
      c.setLineDash([8, 5]); c.lineWidth = 5; c.strokeStyle = '#d7dbe4';
      c.beginPath(); c.moveTo(372, 822); c.quadraticCurveTo(500, 872, 628, 822); c.stroke(); c.setLineDash([]);
    }
    if (o.shoes === 'witch') {
      for (const s of [-1, 1]) {
        const x = 500 + s * 125;
        c.beginPath();
        c.moveTo(x - s * 4, 896);
        c.quadraticCurveTo(x + s * 38, 912, x + s * 58, 880);
        c.quadraticCurveTo(x + s * 48, 930, x - s * 6, 932);
        c.closePath();
        c.fillStyle = vol(c, x - 30, 880, 60, 52, '#2b2333'); c.fill();
        c.lineWidth = 3; c.strokeStyle = '#08060b'; c.stroke();
        c.beginPath(); c.arc(x + s * 58, 880, 6, 0, 7); c.fillStyle = '#f5c542'; c.fill();
      }
    }
    if (o.top === 'frank') {
      for (const s of [-1, 1]) {
        const x = 500 + s * 170;
        c.beginPath(); rrect(c, x - 22, 684, 44, 24, 6);
        c.fillStyle = vol(c, x - 22, 684, 44, 24, '#a3acb2'); c.fill();
        c.lineWidth = 3; c.strokeStyle = '#3a4045'; c.stroke();
      }
    }
    c.restore();
  }

  /* =========================================================
   * 얼굴 파츠
   * ========================================================= */
  function face(c, type, s, w, h, color) {
    c.fillStyle = color;
    c.strokeStyle = color;
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (type === 'eyes') {
      for (const sign of [-1, 1]) {
        c.save();
        c.translate(sign * w * 0.32, 0);
        switch (s) {
          case 0:
            c.scale(sign === -1 ? 1 : -1, 1);
            path(c, [[-w * 0.17, -h * 0.5], [w * 0.17, h * 0.02], [w * 0.11, h * 0.4], [-w * 0.12, h * 0.4], [-w * 0.18, h * 0.18]]);
            break;
          case 1:
            c.beginPath(); c.ellipse(0, 0, w * 0.13, h * 0.43, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#fff3d8'; c.beginPath(); c.arc(-w * 0.045, -h * 0.15, 9, 0, Math.PI * 2); c.fill();
            break;
          case 2:
            c.beginPath(); c.moveTo(-w * 0.14, h * 0.13); c.quadraticCurveTo(0, -h * 0.6, w * 0.14, h * 0.13); c.stroke();
            break;
          case 3: heart(c, 0, 0, h * 0.65); break;
          case 4: star(c, 0, 0, h * 0.52); break;
          case 5:
            c.beginPath(); c.moveTo(-w * 0.13, 0); c.lineTo(w * 0.13, 0); c.stroke();
            c.beginPath(); c.arc(0, -h * 0.05, h * 0.33, 0, Math.PI); c.fill();
            break;
          case 6: // 화난 반달 눈: 안쪽이 내려간 반달
            c.beginPath();
            c.moveTo(sign * w * 0.16, -h * 0.42);
            c.lineTo(-sign * w * 0.16, h * 0.02);
            c.quadraticCurveTo(-sign * w * 0.02, h * 0.95, sign * w * 0.16, -h * 0.42);
            c.closePath(); c.fill();
            break;
          case 7: // 윙크: 왼쪽은 감은 눈, 오른쪽은 동그란 눈
            if (sign === -1) {
              c.lineWidth = 13;
              c.beginPath(); c.moveTo(-w * 0.13, -h * 0.05); c.quadraticCurveTo(0, h * 0.35, w * 0.13, -h * 0.05); c.stroke();
              c.beginPath(); c.moveTo(-w * 0.13, -h * 0.05); c.lineTo(-w * 0.17, -h * 0.25); c.stroke();
            } else {
              c.beginPath(); c.ellipse(0, 0, w * 0.12, h * 0.42, 0, 0, Math.PI * 2); c.fill();
              c.fillStyle = '#fff3d8'; c.beginPath(); c.arc(-w * 0.04, -h * 0.15, 9, 0, Math.PI * 2); c.fill();
            }
            break;
          case 8: // X자 눈
            c.lineWidth = 17;
            c.beginPath(); c.moveTo(-w * 0.11, -h * 0.34); c.lineTo(w * 0.11, h * 0.34); c.moveTo(w * 0.11, -h * 0.34); c.lineTo(-w * 0.11, h * 0.34); c.stroke();
            break;
          default: // 클래식 세모
            path(c, [[-w * 0.15, h * 0.36], [w * 0.15, h * 0.36], [sign * w * 0.02, -h * 0.48]]);
        }
        c.restore();
      }
    } else if (type === 'nose') {
      switch (s) {
        case 0: path(c, [[0, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]); break;
        case 1: c.beginPath(); c.ellipse(0, 0, w * 0.4, h * 0.45, 0, 0, Math.PI * 2); c.fill(); break;
        case 2: heart(c, 0, 0, h * 0.8); break;
        case 3: path(c, [[0, -h * 0.6], [w * 0.45, 0], [0, h * 0.6], [-w * 0.45, 0]]); break;
        case 4: c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.fill(); break;
        case 6: batPath(c, 0, 0, w * 0.32); c.fill(); break;
        case 7:
          for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * w * 0.2, 0, w * 0.15, h * 0.42, d * 0.45, 0, Math.PI * 2); c.fill(); }
          break;
        case 8: path(c, [[-w / 2, -h / 2], [w / 2, -h / 2], [0, h / 2]]); break;
        default: break;
      }
    } else if (type === 'mouth') {
      if (s === 0) {
        path(c, [[-w / 2, -h * 0.4], [-w * 0.33, -h * 0.03], [-w * 0.23, -h * 0.22], [-w * 0.1, h * 0.14], [0, -h * 0.05], [w * 0.1, h * 0.14], [w * 0.23, -h * 0.22], [w * 0.33, -h * 0.03], [w / 2, -h * 0.4], [w * 0.36, h * 0.35], [w * 0.23, h * 0.22], [w * 0.1, h * 0.55], [0, h * 0.31], [-w * 0.1, h * 0.55], [-w * 0.23, h * 0.22], [-w * 0.36, h * 0.35]]);
      } else if (s === 1 || s === 4) {
        c.beginPath();
        c.moveTo(-w * 0.45, -h * 0.25);
        c.quadraticCurveTo(0, h * 1.1, w * 0.45, -h * 0.25);
        c.quadraticCurveTo(0, h * 0.1, -w * 0.45, -h * 0.25);
        c.fill();
        if (s === 4) {
          c.fillStyle = '#fff3d8';
          path(c, [[-w * 0.3, -h * 0.09], [-w * 0.19, h * 0.4], [-w * 0.13, h * 0.01]]);
          path(c, [[w * 0.3, -h * 0.09], [w * 0.19, h * 0.4], [w * 0.13, h * 0.01]]);
        }
      } else if (s === 2) {
        c.beginPath(); c.moveTo(-w * 0.3, -h * 0.08); c.quadraticCurveTo(0, h * 0.6, w * 0.3, -h * 0.08); c.stroke();
      } else if (s === 3) {
        c.beginPath(); c.ellipse(0, 0, w * 0.13, h * 0.48, 0, 0, Math.PI * 2); c.fill();
      } else if (s === 6) { // 지그재그 이빨 (위아래 이빨이 맞물린 잭오랜턴 입)
        const pts = [];
        const n = 8;
        const top = (t) => -h * 0.42 + Math.sin(Math.PI * t) * h * 0.18;
        const bot = (t) => -h * 0.42 + Math.sin(Math.PI * t) * h * 0.95;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          pts.push([-w / 2 + w * t, top(t) + (i % 2 && i < n ? h * 0.3 : 0)]);
        }
        for (let i = n - 1; i >= 1; i--) {
          const t = i / n;
          pts.push([-w / 2 + w * t, bot(t) - (i % 2 === 0 && t > 0.15 && t < 0.85 ? h * 0.3 : 0)]);
        }
        path(c, pts);
      } else if (s === 7) {
        c.lineWidth = 16;
        c.beginPath(); c.ellipse(0, h * 0.05, w * 0.12, h * 0.38, 0, 0, Math.PI * 2); c.stroke();
      } else if (s === 8) {
        c.lineWidth = 9;
        c.beginPath(); c.moveTo(-w * 0.4, -h * 0.05); c.quadraticCurveTo(0, h * 0.5, w * 0.4, -h * 0.05); c.stroke();
        c.lineWidth = 7;
        c.beginPath();
        for (let i = 1; i <= 7; i++) {
          const t = i / 8, x = -w * 0.4 + w * 0.8 * t;
          const y = (1 - t) * (1 - t) * -h * 0.05 + 2 * (1 - t) * t * h * 0.5 + t * t * -h * 0.05;
          c.moveTo(x - 6, y - h * 0.22); c.lineTo(x + 6, y + h * 0.22);
        }
        c.stroke();
      } else {
        c.beginPath(); c.moveTo(-w * 0.3, 0); c.lineTo(w * 0.3, 0); c.stroke();
      }
    }
  }

  /* =========================================================
   * 소품 · 악세서리 · 스티커
   * ========================================================= */
  function paintProp(c, index, x, y, w, h) {
    if (!img.propSheet) return;
    const [sx, sy, sw, sh] = PROP_BOUNDS[index], ratio = img.propSheet.naturalWidth / 1254;
    const f = Math.min(w / sw, h / sh), dw = sw * f, dh = sh * f;
    c.drawImage(img.propSheet, sx * ratio, sy * ratio, sw * ratio, sh * ratio, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  // 벡터 악세서리: -50..50 정규 좌표계에 그린 뒤 박스 크기로 늘린다
  function paintAcc(c, kind, w, h) {
    c.save();
    c.scale(w / 100, h / 100);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (kind === 'batband') {
      c.beginPath();
      c.ellipse(0, 26, 46, 60, 0, Math.PI * 1.08, Math.PI * 1.92);
      c.lineWidth = 5; c.strokeStyle = '#1b1420'; c.stroke();
      c.lineWidth = 2; c.strokeStyle = '#8e5cf7'; c.stroke();
      for (const s of [-1, 1]) {
        const bx = s * 22, by = -25;
        c.beginPath(); c.moveTo(s * 18, -18); c.quadraticCurveTo(s * 14, -26, bx, by - 8);
        c.lineWidth = 1.2; c.strokeStyle = '#1b1420'; c.stroke();
        c.save(); c.translate(bx, by - 14); c.scale(1, 1.15);
        batPath(c, 0, 0, 9); c.fillStyle = '#1e1626'; c.fill();
        c.lineWidth = 0.6; c.strokeStyle = '#000'; c.stroke();
        c.fillStyle = '#ffcf4a';
        for (const d of [-1, 1]) { c.beginPath(); c.arc(d * 1.6, -1, 0.9, 0, 7); c.fill(); }
        c.restore();
      }
    } else if (kind === 'ribbon') {
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(s * 40, -46, s * 46, 0);
        c.quadraticCurveTo(s * 40, 46, 0, 0);
        c.fillStyle = vol(c, s > 0 ? 0 : -46, -40, 46, 80, '#ff4f9a'); c.fill();
        c.lineWidth = 2; c.strokeStyle = '#8a1347'; c.stroke();
        c.beginPath(); c.moveTo(s * 4, 6); c.lineTo(s * 20, 46); c.lineTo(s * 30, 38); c.lineTo(s * 10, 2); c.closePath();
        c.fillStyle = '#e83c87'; c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.9)';
        for (const [px, py] of [[24, -12], [33, 8], [15, 14]]) { c.beginPath(); c.arc(s * px, py, 2.6, 0, 7); c.fill(); }
      }
      c.beginPath(); c.arc(0, 0, 9, 0, 7);
      c.fillStyle = vol(c, -9, -9, 18, 18, '#e83c87'); c.fill();
      c.lineWidth = 2; c.strokeStyle = '#8a1347'; c.stroke();
    } else if (kind === 'wings') {
      const pts = [[-12, 0], [-22, -30], [-34, -42], [-48, -36], [-42, -20], [-50, -6], [-40, 0], [-47, 18], [-34, 16], [-27, 34], [-18, 18], [-10, 14]];
      for (const s of [-1, 1]) {
        const P = pts.map(([x, y]) => [x * s, y]);
        c.beginPath();
        P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        const g = c.createLinearGradient(0, 0, s * 50, 0);
        g.addColorStop(0, '#4a2a63'); g.addColorStop(1, '#1b0f27');
        c.fillStyle = g; c.fill();
        c.lineWidth = 1.2; c.strokeStyle = '#0d0614'; c.stroke();
        c.beginPath();
        for (const t of [P[3], P[5], P[7], P[9]]) { c.moveTo(P[0][0], P[0][1]); c.lineTo(t[0], t[1]); }
        c.lineWidth = 0.9; c.strokeStyle = 'rgba(170,120,210,0.55)'; c.stroke();
      }
    } else if (kind === 'tail') {
      c.beginPath();
      c.moveTo(-40, 38);
      c.bezierCurveTo(10, 60, 40, 20, 28, -26);
      c.lineWidth = 9; c.strokeStyle = '#5e0c10'; c.stroke();
      c.lineWidth = 6; c.strokeStyle = '#d0302f'; c.stroke();
      c.beginPath();
      c.moveTo(26, -50); c.quadraticCurveTo(46, -30, 38, -16); c.lineTo(28, -24); c.lineTo(18, -16); c.quadraticCurveTo(8, -30, 26, -50);
      c.closePath();
      c.fillStyle = vol(c, 8, -50, 40, 36, '#d0302f'); c.fill();
      c.lineWidth = 1.6; c.strokeStyle = '#5e0c10'; c.stroke();
    } else if (kind === 'webcape') {
      c.beginPath();
      c.moveTo(-26, -48); c.lineTo(26, -48);
      c.quadraticCurveTo(44, -10, 48, 46);
      for (let i = 1; i <= 8; i++) { const x = 48 - i * 12; c.lineTo(x + 6, 38); c.lineTo(x, 48); }
      c.quadraticCurveTo(-44, -10, -26, -48);
      c.closePath();
      c.fillStyle = 'rgba(36,32,52,0.95)'; c.fill();
      c.lineWidth = 1.6; c.strokeStyle = '#0c0b14'; c.stroke();
      c.save(); c.clip();
      c.strokeStyle = 'rgba(235,235,255,0.6)'; c.lineWidth = 0.6;
      const angs = []; for (let a = 0.1; a <= 0.9; a += 0.1) angs.push(a * Math.PI);
      for (const a of angs) { c.beginPath(); c.moveTo(0, -48); c.lineTo(Math.cos(a) * 120, -48 + Math.sin(a) * 120); c.stroke(); }
      for (const r of [16, 32, 50, 70, 92]) {
        c.beginPath();
        angs.forEach((a, i) => {
          const x = Math.cos(a) * r, y = -48 + Math.sin(a) * r;
          if (!i) c.moveTo(x, y); else { const m = (a + angs[i - 1]) / 2; c.quadraticCurveTo(Math.cos(m) * r * 0.88, -48 + Math.sin(m) * r * 0.88, x, y); }
        });
        c.stroke();
      }
      c.restore();
    } else if (kind === 'basket') {
      for (const [x, y, col] of [[-16, -16, '#ff4f9a'], [2, -22, '#8e5cf7'], [18, -15, '#7cd13a'], [-4, -12, '#ffd34d']]) {
        c.beginPath(); c.arc(x, y, 9, 0, 7); c.fillStyle = vol(c, x - 9, y - 9, 18, 18, col); c.fill();
      }
      c.beginPath(); c.ellipse(0, 12, 40, 34, 0, 0, 7);
      c.fillStyle = vol(c, -40, -22, 80, 68, '#f47b20'); c.fill();
      c.lineWidth = 2; c.strokeStyle = '#7a3a05'; c.stroke();
      c.beginPath(); c.ellipse(0, -14, 31, 7, 0, 0, 7); c.fillStyle = '#3a1a05'; c.fill();
      c.fillStyle = '#2a1206';
      for (const d of [-1, 1]) path(c, [[d * 14 - 7, 10], [d * 14 + 7, 10], [d * 14, -1]]);
      c.beginPath(); c.moveTo(-17, 22); c.quadraticCurveTo(0, 36, 17, 22); c.quadraticCurveTo(0, 28, -17, 22); c.fill();
      c.beginPath(); c.arc(0, -8, 40, Math.PI * 1.12, Math.PI * 1.88);
      c.lineWidth = 4; c.strokeStyle = '#1b1420'; c.stroke();
    } else if (kind === 'poop' || kind === 'poopface') {
      // 돌돌 말린 3단 똥 (+ 얼굴 버전은 스티커용)
      const tiers = [[0, 30, 47, 18], [0, 9, 37, 16], [2, -11, 27, 14]];
      for (const [x, y, rx, ry] of tiers) {
        c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        const g = c.createRadialGradient(x - rx * 0.35, y - ry * 0.55, 1, x, y, rx * 1.1);
        g.addColorStop(0, '#c99560'); g.addColorStop(0.5, '#8d572b'); g.addColorStop(1, '#55301a');
        c.fillStyle = g; c.fill();
        c.lineWidth = 1.2; c.strokeStyle = '#3b1f0c'; c.stroke();
        c.beginPath(); c.ellipse(x - rx * 0.38, y - ry * 0.42, rx * 0.3, ry * 0.2, -0.2, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.32)'; c.fill();
      }
      c.beginPath();
      c.moveTo(-8, -20); c.quadraticCurveTo(-6, -42, 14, -47); c.quadraticCurveTo(6, -37, 10, -20); c.closePath();
      const tg = c.createLinearGradient(-8, -47, 12, -20);
      tg.addColorStop(0, '#c99560'); tg.addColorStop(1, '#6e4020');
      c.fillStyle = tg; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = '#3b1f0c'; c.stroke();
      if (kind === 'poopface') {
        for (const d of [-1, 1]) {
          c.beginPath(); c.ellipse(d * 12, 6, 7, 8.5, 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
          c.beginPath(); c.arc(d * 12 + 1.5, 7.5, 4.2, 0, Math.PI * 2); c.fillStyle = '#1b1012'; c.fill();
          c.beginPath(); c.arc(d * 12 + 3, 5.5, 1.4, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
          c.beginPath(); c.ellipse(d * 26, 24, 6, 3.5, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(255,120,150,0.55)'; c.fill();
        }
        c.beginPath(); c.moveTo(-11, 22); c.quadraticCurveTo(0, 40, 11, 22); c.closePath();
        c.fillStyle = '#5a1420'; c.fill();
        c.beginPath(); c.ellipse(0, 30, 5, 3.5, 0, 0, Math.PI * 2); c.fillStyle = '#ff7a8a'; c.fill();
      }
    } else if (kind === 'lantern') {
      const gl = c.createRadialGradient(0, 8, 2, 0, 8, 55);
      gl.addColorStop(0, 'rgba(255,190,60,0.55)'); gl.addColorStop(1, 'rgba(255,190,60,0)');
      c.fillStyle = gl; c.fillRect(-60, -50, 120, 120);
      c.beginPath(); c.moveTo(0, -48); c.quadraticCurveTo(-14, -48, -12, -32); c.moveTo(0, -48); c.quadraticCurveTo(14, -48, 12, -32);
      c.lineWidth = 3; c.strokeStyle = '#1b1420'; c.stroke();
      c.beginPath(); c.ellipse(0, 10, 30, 28, 0, 0, 7);
      const pg = c.createRadialGradient(-8, 2, 2, 0, 10, 34);
      pg.addColorStop(0, '#ffb35a'); pg.addColorStop(0.6, '#f07c1e'); pg.addColorStop(1, '#a8460a');
      c.fillStyle = pg; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#6b2c05'; c.stroke();
      c.save();
      c.shadowColor = 'rgba(255,200,60,0.95)'; c.shadowBlur = 12;
      c.fillStyle = '#ffe27a';
      for (const d of [-1, 1]) path(c, [[d * 11 - 6, 6], [d * 11 + 6, 6], [d * 11, -4]]);
      path(c, [[-15, 16], [-8, 20], [0, 16], [8, 20], [15, 16], [8, 28], [-8, 28]]);
      c.restore();
      c.fillStyle = '#3d5214';
      c.beginPath(); rrect(c, -4, -24, 8, 8, 2); c.fill();
      c.fillStyle = '#1b1420';
      c.beginPath(); rrect(c, -14, -34, 28, 8, 3); c.fill();
    }
    c.restore();
  }

  function paintSticker(c, o) {
    const im = sprites[o.sprite];
    if (!im) return;
    const f = Math.min(o.w / im.naturalWidth, o.h / im.naturalHeight);
    const dw = im.naturalWidth * f, dh = im.naturalHeight * f;
    c.drawImage(im, -dw / 2, -dh / 2, dw, dh);
  }

  /* ---------------- 오브젝트 그리기 ---------------- */
  const imageCache = new Map();

  function glowFill(c, o) {
    const g = c.createLinearGradient(0, -o.h / 2, 0, o.h / 2);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.45, '#ffc93c');
    g.addColorStop(1, '#ff7f12');
    return g;
  }

  function paintObject(c, o, state, selection, onImage) {
    c.save();
    c.translate(o.x, o.y);
    c.rotate((o.rotation * Math.PI) / 180);
    c.scale(o.scale, o.scale);
    if (['eyes', 'nose', 'mouth'].includes(o.type)) {
      c.save();
      if (state.glow) {
        // 촛불 발광: 바깥 번짐 한 번 + 밝은 안쪽 한 번
        c.shadowColor = 'rgba(255,140,20,0.95)';
        c.shadowBlur = 34;
        face(c, o.type, o.style, o.w, o.h, '#ff9d2a');
        c.shadowBlur = 10;
        c.shadowColor = 'rgba(255,220,120,0.9)';
        face(c, o.type, o.style, o.w, o.h, glowFill(c, o));
      } else {
        c.shadowColor = '#9c4417';
        c.shadowBlur = 5;
        c.shadowOffsetY = 3;
        face(c, o.type, o.style, o.w, o.h, state.faceColor);
      }
      c.restore();
    } else if (o.type === 'prop') {
      paintProp(c, o.index, -o.w / 2, -o.h / 2, o.w, o.h);
    } else if (o.type === 'acc') {
      paintAcc(c, o.kind, o.w, o.h);
    } else if (o.type === 'sprite') {
      paintSticker(c, o);
    } else if (o.type === 'image') {
      let im = imageCache.get(o.src);
      if (!im) {
        im = new Image();
        imageCache.set(o.src, im);
        im.onload = () => onImage && onImage();
        im.src = o.src;
      }
      if (im.complete && im.naturalWidth) c.drawImage(im, -o.w / 2, -o.h / 2, o.w, o.h);
    } else {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = o.color || '#6543c3';
      c.font = `${o.type === 'text' ? '800 ' : ''}${o.size}px ${o.type === 'emoji' ? '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif' : 'system-ui,sans-serif'}`;
      c.fillText(o.text, 0, 0);
    }
    if (selection) {
      c.strokeStyle = '#7851cb';
      c.lineWidth = 2 / o.scale;
      c.setLineDash([8 / o.scale, 6 / o.scale]);
      c.strokeRect(-o.w / 2 - 8, -o.h / 2 - 8, o.w + 16, o.h + 16);
      c.setLineDash([]);
      c.fillStyle = '#fff';
      for (const x of [-o.w / 2 - 8, o.w / 2 + 8]) for (const y of [-o.h / 2 - 8, o.h / 2 + 8]) { c.fillRect(x - 5, y - 5, 10, 10); c.strokeRect(x - 5, y - 5, 10, 10); }
    }
    c.restore();
  }

  /* ---------------- 직접 그리기 (브러시) ---------------- */
  function strokeLine(c, pts) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  }
  function paintStroke(c, st) {
    const br = BRUSHES[st.brush] || BRUSHES.pen;
    const color = br.color || st.color;
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = st.width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (br.glow) { c.shadowColor = br.glow; c.shadowBlur = st.width * 1.4; }
    if (st.points.length === 1) {
      c.beginPath(); c.arc(st.points[0].x, st.points[0].y, st.width / 2, 0, Math.PI * 2); c.fill();
    } else {
      strokeLine(c, st.points); c.stroke();
    }
    for (const [x, y, len] of st.drips || []) {
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + len); c.lineWidth = st.width * 0.5; c.stroke();
      c.beginPath(); c.arc(x, y + len, st.width * 0.4, 0, Math.PI * 2); c.fill();
    }
    if (br.hi && st.points.length > 1) {
      c.shadowBlur = 0;
      c.strokeStyle = br.hi;
      c.lineWidth = Math.max(2, st.width * 0.22);
      c.translate(-st.width * 0.18, -st.width * 0.18);
      strokeLine(c, st.points); c.stroke();
    }
    c.restore();
  }

  /* =========================================================
   * 배경 & 전체 렌더
   * ========================================================= */
  function drawCover(c, im, x, y, w, h) {
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    c.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function bgInfo(id) { return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0]; }
  function isDarkBg(id) {
    if (String(id).startsWith('img:')) return true;
    const [r, g, b] = hexRgb(id);
    return 0.299 * r + 0.587 * g + 0.114 * b < 110;
  }

  function drawBackground(c, state) {
    const bg = bgInfo(state.background);
    if (bg.image && img[bg.image]) {
      drawCover(c, img[bg.image], 0, 0, S, S);
      c.fillStyle = 'rgba(14,8,26,0.22)';
      c.fillRect(0, 0, S, S);
      const v = c.createRadialGradient(500, 520, 260, 500, 520, 760);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = v; c.fillRect(0, 0, S, S);
      return;
    }
    const dark = isDarkBg(bg.id);
    // 가운데가 은은하게 밝은 무대 조명 + 가장자리 비네트
    const g = c.createRadialGradient(500, 560, 60, 500, 520, 760);
    g.addColorStop(0, shade(bg.id, dark ? 0.16 : 0.25));
    g.addColorStop(0.55, bg.id);
    g.addColorStop(1, shade(bg.id, dark ? -0.55 : -0.06));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    c.save();
    c.globalAlpha = dark ? 0.12 : 0.13;
    c.fillStyle = dark ? '#e9dafa' : '#806496';
    for (let x = 30; x < S; x += 40) for (let y = 30; y < S; y += 40) { c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill(); }
    c.restore();
    if (!dark) return;
    // 달 + 박쥐 + 바닥 안개
    const moon = bg.moon || '#fff3d6';
    c.save();
    const mg = c.createRadialGradient(850, 150, 20, 850, 150, 190);
    mg.addColorStop(0, shade(moon, 0) .replace('rgb', 'rgba').replace(')', ',0.35)'));
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = mg; c.fillRect(600, 0, 400, 400);
    c.beginPath(); c.arc(850, 150, 62, 0, Math.PI * 2);
    const mf = c.createRadialGradient(830, 130, 8, 850, 150, 64);
    mf.addColorStop(0, '#ffffff'); mf.addColorStop(1, moon);
    c.globalAlpha = 0.9; c.fillStyle = mf; c.fill();
    c.globalAlpha = 0.18; c.fillStyle = '#6b5a7a';
    for (const [x, y, r] of [[828, 132, 12], [868, 170, 8], [872, 128, 6]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 0.75; c.fillStyle = '#07040c';
    for (const [x, y, sz] of [[110, 120, 22], [180, 80, 13], [760, 270, 16], [930, 300, 11], [70, 230, 10]]) { batPath(c, x, y, sz); c.fill(); }
    c.globalAlpha = 1;
    const fog = c.createLinearGradient(0, 760, 0, 1000);
    fog.addColorStop(0, 'rgba(200,185,230,0)'); fog.addColorStop(1, 'rgba(200,185,230,0.14)');
    c.fillStyle = fog; c.fillRect(0, 760, S, 240);
    c.restore();
  }

  function render(c, state, opts = {}) {
    const sel = opts.selected;
    c.clearRect(0, 0, S, S);
    drawBackground(c, state);
    c.save();
    c.fillStyle = '#46261c';
    c.globalAlpha = isDarkBg(state.background) ? 0.35 : 0.13;
    c.filter = 'blur(13px)';
    c.beginPath(); c.ellipse(500, 946, 230, 22, 0, 0, Math.PI * 2); c.fill();
    c.restore();

    const outfit = state.outfit || {};
    for (const o of state.objects.filter((o) => o.behind)) paintObject(c, o, state, sel === o.id, opts.onImage);
    costumeBehind(c, outfit);
    if (img.base) c.drawImage(character(state.headShape || 0, state.skin), 0, 0);
    const cl = img.base && costumeLayer(state.headShape || 0, outfit);
    if (cl) c.drawImage(cl, 0, 0);
    costumeFront(c, outfit);
    for (const o of state.objects.filter((o) => !o.behind)) paintObject(c, o, state, sel === o.id, opts.onImage);
    for (const st of state.strokes) paintStroke(c, st);
    if (opts.liveStroke) paintStroke(c, opts.liveStroke);
  }

  /* ---------------- 네임플레이트 (name1.jpg 스타일의 입체 명판을 직접 그린다) ---------------- */
  // 미니 잭오랜턴: 3D 호박 캐릭터의 머리 부분에 빛나는 얼굴을 새겨 만든다
  let miniCache = null;
  function miniPumpkin() {
    if (miniCache || !img.base) return miniCache;
    const c = mk(700, 640);
    const g = c.getContext('2d');
    g.drawImage(info(0).raw, -150, -60);
    g.globalCompositeOperation = 'destination-in';
    g.fillRect(0, 0, 700, 600);
    g.globalCompositeOperation = 'source-over';
    const glowState = { glow: true };
    for (const [type, y, w, h] of [['eyes', 406, 370, 128], ['nose', 480, 76, 60], ['mouth', 555, 390, 113]]) {
      paintObject(g, { type, style: 0, x: 350, y: y - 60, w, h, scale: 1, rotation: 0 }, glowState, false);
    }
    miniCache = c;
    return c;
  }

  function lollipop(c, x, y, s, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot || 0);
    c.lineCap = 'round';
    c.strokeStyle = '#f3efe6'; c.lineWidth = s * 0.09;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 0.15, s * 0.75); c.stroke();
    c.beginPath(); c.arc(0, 0, s * 0.42, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.save(); c.clip();
    c.shadowColor = 'transparent';
    c.strokeStyle = '#e8304f'; c.lineWidth = s * 0.11;
    c.beginPath();
    for (let a = 0; a < Math.PI * 7; a += 0.2) { const r = (a / (Math.PI * 7)) * s * 0.45; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.stroke();
    const gl = c.createRadialGradient(-s * 0.15, -s * 0.18, 1, 0, 0, s * 0.45);
    gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(60,0,20,0.35)');
    c.fillStyle = gl; c.fillRect(-s, -s, s * 2, s * 2);
    c.restore();
    c.restore();
  }

  function paintDeco(c, d) {
    c.save();
    c.shadowColor = 'rgba(10,0,20,0.45)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 5;
    if (d.k === 'pumpkin') {
      const m = miniPumpkin();
      if (m) {
        c.translate(d.x, d.y); c.rotate(d.r || 0);
        const w = d.s, h = (d.s * m.height) / m.width;
        c.drawImage(m, -w / 2, -h / 2, w, h);
      }
    } else if (d.k === 'lolly') {
      lollipop(c, d.x, d.y, d.s, d.r);
    } else {
      c.translate(d.x, d.y); c.rotate(d.r || 0);
      paintProp(c, d.i, -d.s / 2, -d.s / 2, d.s, d.s);
    }
    c.restore();
  }

  // 명판(슬랩) 좌표: 1000 x 250 띠 안
  const SLAB = { x: 205, y: 72, w: 590, h: 122, r: 30, depth: 13 };
  const PLATES = [
    {
      label: '보라 호박', top: ['#b58bff', '#8a55e6', '#6a35c4'], side: '#3f1a86', ink: ['#ffffff', '#efe2ff'], stroke: '#3a1475',
      deco: [
        { k: 'prop', i: 8, x: 318, y: 64, s: 70, r: 0.35 }, { k: 'prop', i: 0, x: 610, y: 56, s: 92 }, { k: 'prop', i: 4, x: 690, y: 64, s: 46, r: 0.2 },
        { k: 'pumpkin', x: 222, y: 98, s: 150, r: -0.12 }, { k: 'pumpkin', x: 790, y: 92, s: 128, r: 0.12 },
        { k: 'lolly', x: 226, y: 192, s: 64, r: -0.5 }, { k: 'prop', i: 8, x: 772, y: 202, s: 62, r: -0.6 },
      ],
    },
    {
      label: '블랙 마녀', top: ['#4a4157', '#2b2533', '#1b1720'], side: '#0b090e', rim: '#9a6bff', ink: ['#ffd27a', '#ff9e3d'], stroke: '#1a0f24',
      deco: [
        { k: 'pumpkin', x: 226, y: 104, s: 140, r: -0.1 }, { k: 'prop', i: 8, x: 330, y: 64, s: 60, r: 0.4 },
        { k: 'prop', i: 15, x: 830, y: 150, s: 92 }, { k: 'prop', i: 3, x: 765, y: 70, s: 150, r: 0.18 },
        { k: 'lolly', x: 232, y: 196, s: 56, r: -0.6 }, { k: 'prop', i: 10, x: 735, y: 205, s: 78, r: -0.9 },
      ],
    },
    {
      label: '해골 유령', top: ['#3d3c47', '#26252e', '#17161c'], side: '#09090c', rim: '#d7d2e6', ink: ['#ffffff', '#e2dcf2'], stroke: '#3b1660',
      deco: [
        { k: 'prop', i: 4, x: 228, y: 98, s: 122, r: -0.15 }, { k: 'prop', i: 4, x: 210, y: 192, s: 68, r: 0.3 },
        { k: 'prop', i: 8, x: 340, y: 66, s: 56, r: 0.5 }, { k: 'prop', i: 6, x: 790, y: 92, s: 136, r: 0.1 },
        { k: 'prop', i: 14, x: 812, y: 196, s: 76 }, { k: 'lolly', x: 700, y: 210, s: 48, r: 0.5 },
      ],
    },
    {
      label: '거미 숲', top: ['#77a35a', '#4f7e3a', '#355d26'], side: '#1d3812', ink: ['#fbfff0', '#e3f7c7'], stroke: '#183208',
      deco: [
        { k: 'prop', i: 2, x: 226, y: 96, s: 160, behind: true }, { k: 'prop', i: 2, x: 790, y: 182, s: 120, behind: true },
        { k: 'prop', i: 1, x: 236, y: 92, s: 92, r: -0.2 }, { k: 'prop', i: 9, x: 340, y: 62, s: 62, r: 0.5 },
        { k: 'pumpkin', x: 792, y: 96, s: 120, r: 0.1 }, { k: 'prop', i: 1, x: 260, y: 200, s: 54, r: 0.4 }, { k: 'prop', i: 9, x: 700, y: 206, s: 56, r: -0.4 },
      ],
    },
    {
      label: '마법 연구실', top: ['#ff9b54', '#f2741f', '#cf5410'], side: '#7a2c05', ink: ['#ffffff', '#fff1df'], stroke: '#6b2402',
      deco: [
        { k: 'prop', i: 12, x: 226, y: 140, s: 138 }, { k: 'prop', i: 11, x: 320, y: 64, s: 70, r: -0.2 },
        { k: 'prop', i: 7, x: 795, y: 92, s: 116, r: 0.12 }, { k: 'prop', i: 13, x: 820, y: 194, s: 76 },
        { k: 'prop', i: 10, x: 690, y: 62, s: 78, r: 0.9 }, { k: 'pumpkin', x: 700, y: 208, s: 70, r: -0.15 },
      ],
    },
  ];
  const PLATE_H = 250;

  function slabPath(c, x, y, w, h, r) { c.beginPath(); rrect(c, x, y, w, h, r); }

  function drawPlate(c, state, name, opts = {}) {
    const W = S, H = PLATE_H;
    const p = PLATES[state.plate] || PLATES[0];
    const bg = bgInfo(state.background);
    const { x, y, w, h, r, depth } = SLAB;
    c.save();
    if (bg.image) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1b1129'); g.addColorStop(1, '#0d0816');
      c.fillStyle = g;
    } else {
      c.fillStyle = bg.id;
    }
    c.fillRect(0, 0, W, H);

    for (const d of p.deco.filter((d) => d.behind)) paintDeco(c, d);

    // 바닥 그림자
    c.save();
    c.filter = 'blur(12px)';
    c.fillStyle = 'rgba(20,6,30,0.42)';
    slabPath(c, x + 14, y + depth + 16, w - 28, h - 6, r); c.fill();
    c.restore();
    // 두께(옆면)
    c.fillStyle = p.side;
    slabPath(c, x, y + depth, w, h, r); c.fill();
    // 윗면
    const tg = c.createLinearGradient(0, y, 0, y + h);
    tg.addColorStop(0, p.top[0]); tg.addColorStop(0.45, p.top[1]); tg.addColorStop(1, p.top[2]);
    c.fillStyle = tg;
    slabPath(c, x, y, w, h, r); c.fill();
    c.save();
    slabPath(c, x, y, w, h, r); c.clip();
    // 위쪽 베벨 하이라이트 & 아래쪽 음영
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    slabPath(c, x + 2, y + 3, w - 4, h + 10, r); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    slabPath(c, x + 2, y - 10, w - 4, h + 7, r); c.stroke();
    // 광택
    const gl = c.createLinearGradient(0, y, 0, y + h * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    slabPath(c, x + 18, y + 8, w - 36, h * 0.45, r - 8); c.fill();
    c.restore();
    if (p.rim) {
      c.lineWidth = 3;
      c.strokeStyle = p.rim;
      c.globalAlpha = 0.7;
      slabPath(c, x + 9, y + 9, w - 18, h - 18, r - 9); c.stroke();
      c.globalAlpha = 1;
    }

    // 이름 (입체 글자)
    const has = !!(name || '').trim();
    const text = has ? name.trim() : (opts.placeholder ? '닉네임을 입력해주세요' : 'HAPPY HALLOWEEN');
    const maxW = w - 260;
    let size = has ? 66 : 40;
    const font = (s) => `900 ${s}px 'Black Han Sans', 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif`;
    c.font = font(size);
    while (c.measureText(text).width > maxW && size > 18) { size -= 2; c.font = font(size); }
    const tx = 500, ty = y + h / 2 + 3;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.globalAlpha = has ? 1 : 0.6;
    c.lineWidth = size * 0.22;
    c.strokeStyle = p.stroke;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 8; c.shadowOffsetY = 5;
    c.strokeText(text, tx, ty + size * 0.06);
    c.restore();
    c.strokeText(text, tx, ty);
    const ig = c.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
    ig.addColorStop(0, p.ink[0]); ig.addColorStop(1, p.ink[1]);
    c.fillStyle = ig;
    c.fillText(text, tx, ty);
    c.globalAlpha = 1;

    for (const d of p.deco.filter((d) => !d.behind)) paintDeco(c, d);
    c.restore();
  }

  /* ---------------- 썸네일 ---------------- */
  function headThumb(canvas, shape) {
    const pc = canvas.getContext('2d');
    pc.clearRect(0, 0, canvas.width, canvas.height);
    pc.save();
    pc.beginPath(); pc.rect(0, 0, canvas.width, canvas.height); pc.clip();
    const k = canvas.width / 150;
    pc.scale(k, k);
    drawRaw(pc, shape, -16, -14, 182);
    pc.restore();
  }

  function outfitThumb(canvas, state, part, id) {
    const o = Object.assign({ top: 'none', bottom: 'none', shoes: 'none' }, { [part]: id });
    const shape = state.headShape || 0;
    const pc = canvas.getContext('2d');
    pc.clearRect(0, 0, canvas.width, canvas.height);
    if (!img.base) return;
    // 몸통 부분만 크게 보여준다
    const [sx, sy, sw, sh] = part === 'top' ? [180, 590, 640, 340] : [250, 760, 500, 190];
    const k = Math.min(canvas.width / sw, canvas.height / sh);
    pc.save();
    pc.translate((canvas.width - sw * k) / 2, (canvas.height - sh * k) / 2);
    pc.scale(k, k);
    pc.translate(-sx, -sy);
    pc.beginPath(); pc.rect(sx, sy, sw, sh); pc.clip();
    costumeBehind(pc, o);
    pc.drawImage(character(shape, state.skin), 0, 0);
    const cl = costumeLayer(shape, o);
    if (cl) pc.drawImage(cl, 0, 0);
    costumeFront(pc, o);
    pc.restore();
  }

  const plateThumbCache = {};
  function plateThumb(canvas, i) {
    const pc = canvas.getContext('2d');
    pc.clearRect(0, 0, canvas.width, canvas.height);
    if (!img.base) return;
    if (!plateThumbCache[i]) {
      const t = mk(1000, PLATE_H);
      drawPlate(t.getContext('2d'), { plate: i, background: '#1d1430' }, 'NAME');
      plateThumbCache[i] = t;
    }
    // 띠 가운데(명판 부분)만 잘라 보여준다
    pc.drawImage(plateThumbCache[i], 150, 0, 700, PLATE_H, 0, 0, canvas.width, canvas.height);
  }

  function hitCharacter(state, p) {
    const inf = info(state.headShape || 0);
    const x = Math.max(0, Math.min(S - 1, Math.floor(p.x))), y = Math.max(0, Math.min(S - 1, Math.floor(p.y)));
    return inf.data.data[(y * S + x) * 4 + 3] > 100;
  }

  /* ---------------- 로드 ---------------- */
  function loadImg(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src;
    });
  }

  async function load() {
    await Promise.all(Object.keys(A).map(async (k) => { img[k] = await loadImg(A[k]); }));
    await Promise.all((window.STICKER_ASSETS || []).map(async (s) => { sprites[s.id] = await loadImg(s.src); }));
    if (img.base) img.bitten = makeBitten(img.base);
    if (img.base) for (let s = 0; s < HEADS.length; s++) info(s);
    return !!img.base;
  }

  window.PumpkinRender = {
    S, PLATE_H, HEADS, FACE_LABELS, SKINS, BACKGROUNDS, OUTFITS, PROPS, ACCESSORIES, EMOJIS, BRUSHES, PLATES,
    img, sprites, load, render, drawPlate, face, paintProp, paintAcc, headThumb, outfitThumb, plateThumb, hitCharacter, isDarkBg,
    stickers: () => (window.STICKER_ASSETS || []).filter((s) => sprites[s.id]).map((s) => ({ id: s.id, label: s.label })),
  };
})();
