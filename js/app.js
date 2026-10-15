/* =========================================================
 * app.js — 인트로, 꾸미기 스튜디오(편집기), 화면 전환, 명예의 전당
 * ========================================================= */
(function () {
  'use strict';

  const R = window.PumpkinRender;
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');
  const ctx = canvas.getContext('2d');
  const plateCanvas = $('platePreview');
  const plateCtx = plateCanvas.getContext('2d');
  const DRAFT_KEY = 'axp_studio_draft';

  // 이모지 스티커 — [문자, 이름, 기본 x, y, 크기]
  const EMOJI_STICKERS = [['🎩', '마술 모자', 500, 190, 210], ['👑', '왕관', 500, 220, 210], ['🎀', '리본', 500, 680, 130], ['🕶️', '선글라스', 500, 410, 350], ['👓', '안경', 500, 410, 350], ['🦇', '박쥐', 740, 250, 150], ['👻', '유령', 230, 680, 150], ['🕷️', '거미', 760, 620, 110], ['🍭', '사탕', 240, 750, 150], ['🍬', '캔디', 740, 780, 140], ['🌙', '달', 760, 170, 130], ['⭐', '별', 220, 220, 130], ['💜', '하트', 720, 480, 100], ['🩸', '핏방울', 300, 300, 100], ['⚡', '번개', 220, 460, 100], ['💩', '똥', 760, 860, 140]];
  const SPOTS = [[230, 260], [770, 260], [210, 560], [790, 560], [250, 860], [750, 860], [500, 120], [320, 400], [680, 400]];

  let nextId = 10, tab = 'eyes', selected = null, mode = 'move', drag = null, currentStroke = null, loaded = false, toastTimer, brush = 'pen', spotIndex = 0;

  function initial() {
    return {
      headShape: 0, skin: 'classic', background: '#241c37', faceColor: '#271529', glow: false,
      outfit: { top: 'none', bottom: 'none', shoes: 'none' }, plate: 0,
      objects: [
        { id: 1, type: 'eyes', style: 0, name: '눈', x: 500, y: 406, w: 370, h: 128, scale: 1, rotation: 0 },
        { id: 2, type: 'nose', style: 0, name: '코', x: 500, y: 480, w: 76, h: 60, scale: 1, rotation: 0 },
        { id: 3, type: 'mouth', style: 0, name: '입', x: 500, y: 555, w: 390, h: 113, scale: 1, rotation: 0 },
      ],
      strokes: [],
    };
  }

  let state = initial(), history = [JSON.stringify(state)], future = [];

  /* ---------------- 공통 ---------------- */
  function toast(t) {
    $('toast').textContent = t;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3000);
  }
  window.PumpkinApp = { toast: (t) => toast(t) };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------------- 히스토리 & 자동 보관 ---------------- */
  function commit() {
    const s = JSON.stringify(state);
    if (history.at(-1) !== s) {
      history.push(s);
      if (history.length > 40) history.shift();
      future = [];
    }
    syncHistory();
    saveDraft();
  }
  function syncHistory() {
    $('undo').disabled = history.length < 2;
    $('redo').disabled = !future.length;
  }
  function undo() {
    if (history.length < 2) return;
    future.push(history.pop());
    state = JSON.parse(history.at(-1));
    selected = null;
    refresh();
    saveDraft();
  }
  function redo() {
    if (!future.length) return;
    const s = future.pop();
    history.push(s);
    state = JSON.parse(s);
    selected = null;
    refresh();
    saveDraft();
  }

  let draftTimer = 0;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const data = JSON.stringify({ state, name: $('pumpkinName').value, artist: $('artist').value, includeName: $('includeName').checked });
      try { localStorage.setItem(DRAFT_KEY, data); } catch (e) { /* 용량 초과(큰 업로드 이미지 등)는 무시 */ }
    }, 300);
  }
  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d || !d.state || !Array.isArray(d.state.objects)) return;
      state = Object.assign(initial(), d.state);
      state.outfit = Object.assign({ top: 'none', bottom: 'none', shoes: 'none' }, d.state.outfit);
      if (typeof d.name === 'string') $('pumpkinName').value = d.name;
      if (typeof d.artist === 'string') $('artist').value = d.artist;
      if (typeof d.includeName === 'boolean') $('includeName').checked = d.includeName;
      nextId = Math.max(10, ...state.objects.map((o) => o.id + 1));
      history = [JSON.stringify(state)];
    } catch (e) { /* 손상된 초안은 무시 */ }
  }

  /* ---------------- 렌더 ---------------- */
  function render() {
    if (!loaded) return;
    R.render(ctx, state, { selected: mode === 'move' ? selected : null, liveStroke: currentStroke, onImage: render });
  }
  function renderPlate() {
    plateCanvas.classList.toggle('off', !$('includeName').checked);
    if (!loaded) return;
    R.drawPlate(plateCtx, state, $('artist').value, { placeholder: true });
  }

  /* ---------------- 얼굴형 ---------------- */
  function selectHead(shape) {
    const old = R.HEADS[state.headShape || 0], next = R.HEADS[shape];
    if ((state.headShape || 0) === shape) return;
    for (const o of state.objects) {
      if (['eyes', 'nose', 'mouth'].includes(o.type)) {
        o.x = 500 + ((o.x - 500) * next.width) / old.width;
        o.y += next[o.type + 'Y'] - old[o.type + 'Y'];
        o.w *= next.width / old.width;
      }
    }
    state.headShape = shape;
    selected = null;
    commit();
    refresh();
    toast(next.name + '으로 바꿨어요.');
  }
  function renderHeadOptions() {
    const root = $('headShapes');
    root.replaceChildren();
    R.HEADS.forEach((preset, i) => {
      const b = el('button', 'head-choice' + ((state.headShape || 0) === i ? ' active' : ''));
      b.setAttribute('aria-label', preset.name + ' 호박 얼굴형');
      b.setAttribute('aria-pressed', (state.headShape || 0) === i);
      b.disabled = !loaded;
      const preview = el('canvas');
      preview.width = 150;
      preview.height = 150;
      if (loaded) R.headThumb(preview, i);
      b.append(preview, el('span', null, preset.name));
      b.onclick = () => selectHead(i);
      root.append(b);
    });
  }

  /* ---------------- 꾸미기 상자 ---------------- */
  function sectionHead(root, title, hint) {
    root.append(el('div', 'section-label', title));
    if (hint) root.append(el('p', 'hint', hint));
  }

  function nextSpot() {
    const s = SPOTS[spotIndex++ % SPOTS.length];
    return { x: s[0], y: s[1] };
  }

  function renderOwn(root) {
    root.innerHTML = `<div class="section-label">나만의 아이디어를 더해요</div><p class="hint">그림, 글자, 사진으로 개성을 더해보세요.</p><div class="own-actions"><div class="own-section"><h3>✎ 직접 그리기</h3><p>마우스나 손가락으로 자유롭게 그려요. 피·슬라임·촛불빛 붓도 있어요.</p><button id="startDrawing" class="wide">그리기 시작</button></div><div class="own-section"><h3>T 글자 추가</h3><input id="customText" type="text" maxlength="40" placeholder="BOO! 또는 나만의 메시지"><div class="inline"><input id="textColor" type="color" value="#6543c3" aria-label="글자 색상"><button id="addText" class="tiny">글자 넣기</button></div></div><div class="own-section"><h3>▧ 내 이미지 추가</h3><p>PNG · JPG · WebP, 최대 5MB<br>투명 PNG 소품을 추천해요.</p><button id="uploadButton" class="wide">이미지 불러오기</button></div></div>`;
    $('startDrawing').onclick = () => setMode('draw');
    $('uploadButton').onclick = () => $('upload').click();
    $('addText').onclick = () => {
      const text = $('customText').value.trim();
      if (!text) return toast('넣고 싶은 글자를 입력해주세요.');
      ctx.font = '800 55px system-ui';
      add({ type: 'text', text, name: '글자: ' + text, size: 55, color: $('textColor').value, w: Math.max(60, ctx.measureText(text).width), h: 75, x: 500, y: 770 });
      $('customText').value = '';
    };
  }

  function renderFaceTab(root) {
    sectionHead(root, { eyes: '어떤 눈을 하고 있나요?', nose: '작지만 확실한 포인트', mouth: '표정의 마지막 한 조각' }[tab], '마음에 드는 모양을 골라보세요.');
    const grid = el('div', 'grid');
    root.append(grid);
    R.FACE_LABELS[tab].forEach((name, i) => {
      const active = state.objects.find((o) => o.type === tab)?.style === i;
      const b = el('button', 'shape' + (active ? ' active' : ''));
      b.setAttribute('aria-pressed', active);
      const preview = el('canvas');
      preview.width = 184;
      preview.height = 104;
      const pc = preview.getContext('2d');
      pc.translate(92, 52);
      R.face(pc, tab, i, tab === 'eyes' ? 144 : tab === 'nose' ? 50 : 144, tab === 'eyes' ? 56 : tab === 'nose' ? 40 : 48, '#ffb35c');
      b.append(preview, el('span', null, name));
      b.onclick = () => {
        let o = state.objects.find((o) => o.type === tab);
        if (!o) {
          o = initial().objects.find((o) => o.type === tab);
          o.id = nextId++;
          state.objects.unshift(o);
        }
        o.style = i;
        selected = o.id;
        setMode('move');
        commit();
        refresh();
      };
      grid.append(b);
    });
  }

  function renderOutfitTab(root) {
    sectionHead(root, '오늘의 파티 코스튬', '상의 · 하의 · 신발을 골라 입혀보세요.');
    for (const [part, title] of [['top', '상의'], ['bottom', '하의'], ['shoes', '신발']]) {
      const head = el('div', 'sub-label', title);
      head.append(el('span', null, R.OUTFITS[part].length - 1 + '종'));
      root.append(head);
      const grid = el('div', 'outfit-grid');
      for (const item of R.OUTFITS[part]) {
        const active = (state.outfit[part] || 'none') === item.id;
        const b = el('button', 'outfit' + (active ? ' active' : '') + (item.id === 'none' ? ' none-choice' : ''));
        b.setAttribute('aria-pressed', active);
        b.setAttribute('aria-label', title + ': ' + item.label);
        const pic = el('canvas');
        pic.width = 192;
        pic.height = 120;
        if (loaded) R.outfitThumb(pic, state, part, item.id);
        b.append(pic, el('span', null, item.label));
        b.onclick = () => {
          state.outfit = Object.assign({}, state.outfit, { [part]: item.id });
          commit();
          refresh();
        };
        grid.append(b);
      }
      root.append(grid);
    }
  }

  function renderPropsTab(root) {
    sectionHead(root, '파티 악세서리 · ' + R.ACCESSORIES.length + '종', '머리 · 등 · 손에 어울리는 자리로 추가돼요.');
    let lastGroup = '', grid = null;
    for (const a of R.ACCESSORIES) {
      if (a.group !== lastGroup) {
        lastGroup = a.group;
        root.append(el('div', 'sub-label', a.group));
        grid = el('div', 'grid accessories');
        root.append(grid);
      }
      const b = el('button', 'sticker acc-sticker');
      b.setAttribute('aria-label', a.name + ' 추가');
      b.disabled = !loaded;
      const pic = el('canvas');
      pic.width = 160;
      pic.height = 160;
      const pc = pic.getContext('2d');
      if (a.o.type === 'prop') R.paintProp(pc, a.o.index, 8, 8, 144, 144);
      else {
        const k = 136 / Math.max(a.o.w, a.o.h);
        pc.translate(80, 80);
        R.paintAcc(pc, a.o.kind, a.o.w * k, a.o.h * k);
      }
      b.append(pic, el('small', null, a.name));
      b.onclick = () => add(Object.assign({ name: a.name }, JSON.parse(JSON.stringify(a.o))));
      grid.append(b);
    }
    root.append(el('div', 'sub-label', '입체 할로윈 소품 · 16종'));
    const pg = el('div', 'grid accessories');
    root.append(pg);
    R.PROPS.forEach(([name, index, x, y, size]) => {
      const b = el('button', 'sticker prop-sticker');
      b.setAttribute('aria-label', name + ' 추가');
      b.disabled = !loaded;
      const pic = el('canvas');
      pic.width = 160;
      pic.height = 160;
      R.paintProp(pic.getContext('2d'), index, 0, 0, 160, 160);
      b.append(pic, el('small', null, name));
      b.onclick = () => add({ type: 'prop', index, name, x, y, w: size, h: size });
      pg.append(b);
    });
  }

  function renderStickersTab(root) {
    sectionHead(root, '스티커 핀', '눌러서 붙이고, 원하는 곳으로 옮겨보세요.');
    root.append(el('div', 'sub-label', '이모지'));
    const eg = el('div', 'sticker-grid');
    root.append(eg);
    for (const [emoji, name, x, y, size] of EMOJI_STICKERS) {
      const b = el('button');
      b.title = name;
      b.setAttribute('aria-label', name + ' 추가');
      b.append(el('span', 'emoji', emoji));
      b.onclick = () => add({ type: 'emoji', text: emoji, name, size, x, y, w: size, h: size });
      eg.append(b);
    }
    root.append(el('div', 'sub-label', '입체 스티커'));
    const pg = el('div', 'sticker-grid');
    root.append(pg);
    const poop = el('button');
    poop.title = '귀여운 똥';
    poop.setAttribute('aria-label', '귀여운 똥 추가');
    const pc = el('canvas');
    pc.width = 120;
    pc.height = 120;
    const px = pc.getContext('2d');
    px.translate(60, 60);
    R.paintAcc(px, 'poopface', 104, 104);
    poop.append(pc);
    poop.onclick = () => add(Object.assign({ type: 'acc', kind: 'poopface', name: '귀여운 똥', w: 170, h: 170 }, nextSpot()));
    pg.append(poop);
    const list = R.stickers();
    if (!list.length) return;
    const head = el('div', 'sub-label', '할로윈 일러스트');
    head.append(el('span', null, list.length + '종'));
    root.append(head);
    const sg = el('div', 'sticker-grid');
    root.append(sg);
    for (const s of list) {
      const b = el('button');
      b.title = s.label;
      b.setAttribute('aria-label', s.label + ' 추가');
      const im = el('img');
      im.src = R.sprites[s.id].src;
      im.alt = '';
      im.loading = 'lazy';
      b.append(im);
      b.onclick = () => {
        const sp = R.sprites[s.id];
        const k = 170 / Math.max(sp.naturalWidth, sp.naturalHeight);
        add(Object.assign({ type: 'sprite', sprite: s.id, name: s.label, w: Math.round(sp.naturalWidth * k), h: Math.round(sp.naturalHeight * k) }, nextSpot()));
      };
      sg.append(b);
    }
  }

  function renderLibrary() {
    const root = $('library');
    root.replaceChildren();
    if (tab === 'own') return renderOwn(root);
    if (tab === 'outfit') return renderOutfitTab(root);
    if (tab === 'props') return renderPropsTab(root);
    if (tab === 'stickers') return renderStickersTab(root);
    return renderFaceTab(root);
  }

  function add(o) {
    o.id = nextId++;
    o.scale = o.scale ?? 1;
    o.rotation = o.rotation ?? 0;
    state.objects.push(o);
    selected = o.id;
    setMode('move');
    commit();
    refresh();
  }

  /* ---------------- 선택한 요소 (인스펙터) ---------------- */
  function inspector() {
    const chooser = $('layerSelect');
    chooser.replaceChildren();
    const placeholder = el('option', null, '요소를 선택해주세요');
    placeholder.value = '';
    chooser.append(placeholder);
    [...state.objects].reverse().forEach((item) => {
      const option = el('option', null, item.name + (item.behind ? ' · 호박 뒤' : ''));
      option.value = item.id;
      chooser.append(option);
    });
    chooser.value = selected ?? '';
    chooser.onchange = () => {
      selected = chooser.value ? Number(chooser.value) : null;
      setMode('move');
      inspector();
      render();
    };
    const root = $('inspector'), o = state.objects.find((o) => o.id === selected);
    if (!o) {
      root.innerHTML = '<div class="selection-empty">캔버스에서 얼굴이나 소품을<br>선택하면 조절할 수 있어요.</div>';
      return;
    }
    root.innerHTML = `<p class="selected-name"></p><label class="control-row" for="scale">크기 <output id="scaleValue">${Math.round(o.scale * 100)}%</output></label><input type="range" id="scale" min="20" max="220" value="${o.scale * 100}"><label class="control-row" for="rotation">회전 <output id="rotationValue">${o.rotation}°</output></label><input type="range" id="rotation" min="-180" max="180" value="${o.rotation}"><div class="object-actions"><button id="front">맨앞으로</button><button id="forward">앞으로</button><button id="backward">뒤로</button><button id="back">맨뒤로</button><button id="duplicate">복제</button><button id="delete">삭제</button></div>`;
    root.querySelector('.selected-name').textContent = o.name;
    for (const [id, key, factor] of [['scale', 'scale', 100], ['rotation', 'rotation', 1]]) {
      $(id).oninput = (e) => {
        o[key] = Number(e.target.value) / factor;
        $(id + 'Value').textContent = id === 'scale' ? Math.round(o.scale * 100) + '%' : o.rotation + '°';
        render();
      };
      $(id).onchange = commit;
    }
    $('front').onclick = () => moveLayer(o.id, 'front');
    $('forward').onclick = () => moveLayer(o.id, 'forward');
    $('backward').onclick = () => moveLayer(o.id, 'backward');
    $('back').onclick = () => moveLayer(o.id, 'back');
    $('duplicate').onclick = () => add({ ...o, x: Math.min(920, o.x + 40), y: Math.min(920, o.y + 40) });
    $('delete').onclick = removeSelected;
  }

  // 호박(캐릭터) 자체도 한 장의 레이어로 보고 앞/뒤 순서를 바꾼다
  function moveLayer(id, direction) {
    const pumpkin = { id: 'pumpkin-base' };
    const layers = [...state.objects.filter((o) => o.behind), pumpkin, ...state.objects.filter((o) => !o.behind)];
    const index = layers.findIndex((o) => o.id === id);
    if (index < 0) return;
    const to = direction === 'front' ? layers.length - 1 : direction === 'back' ? 0 : direction === 'forward' ? Math.min(layers.length - 1, index + 1) : Math.max(0, index - 1);
    if (index === to) return;
    const [item] = layers.splice(index, 1);
    layers.splice(to, 0, item);
    const baseAt = layers.indexOf(pumpkin);
    state.objects = layers.filter((o) => o !== pumpkin);
    layers.forEach((o, i) => { if (o !== pumpkin) o.behind = i < baseAt; });
    commit();
    inspector();
    render();
  }

  function removeSelected() {
    if (selected === null) return;
    state.objects = state.objects.filter((o) => o.id !== selected);
    selected = null;
    commit();
    refresh();
  }

  /* ---------------- 나의 호박: 배경 · 피부 · 네임플레이트 ---------------- */
  function backgrounds() {
    const root = $('backgrounds');
    root.replaceChildren();
    for (const bg of R.BACKGROUNDS) {
      const active = state.background === bg.id;
      const b = el('button', 'swatch' + (active ? ' active' : '') + (bg.image ? ' image' : ''));
      if (bg.image) b.style.background = `url(${window.ASSETS[bg.image]})`;
      else b.style.background = bg.id;
      b.title = bg.label;
      b.setAttribute('aria-label', bg.label + ' 배경');
      b.setAttribute('aria-pressed', active);
      b.onclick = () => { state.background = bg.id; commit(); backgrounds(); render(); renderPlate(); };
      root.append(b);
    }
  }

  function skins() {
    const root = $('skins');
    root.replaceChildren();
    const preset = R.SKINS.some((s) => s.id === state.skin);
    for (const sk of R.SKINS) {
      const active = state.skin === sk.id;
      const b = el('button', 'swatch' + (active ? ' active' : ''));
      b.style.background = sk.swatch;
      b.title = sk.label;
      b.setAttribute('aria-label', sk.label + ' 호박');
      b.setAttribute('aria-pressed', active);
      b.onclick = () => setSkin(sk.id);
      root.append(b);
    }
    const custom = el('label', 'swatch custom' + (preset ? '' : ' active'));
    custom.title = '컬러 피커로 직접 고르기';
    if (!preset) custom.style.background = state.skin;
    const input = el('input');
    input.type = 'color';
    input.value = preset ? '#ff9a3c' : state.skin;
    input.setAttribute('aria-label', '호박 색상 직접 고르기');
    input.onchange = () => setSkin(input.value);
    custom.append(input);
    root.append(custom);
  }

  function setSkin(id) {
    state.skin = id;
    commit();
    skins();
    render();
    if (tab === 'outfit') renderLibrary();
  }

  function plates() {
    const root = $('plates');
    root.replaceChildren();
    R.PLATES.forEach((p, i) => {
      const active = state.plate === i;
      const b = el('button', active ? 'active' : '');
      b.title = p.label;
      b.setAttribute('aria-label', p.label + ' 네임플레이트');
      b.setAttribute('aria-pressed', active);
      const cv = el('canvas');
      cv.width = 240;
      cv.height = 80;
      if (loaded) R.plateThumb(cv, i);
      b.append(cv);
      b.onclick = () => {
        state.plate = i;
        commit();
        plates();
        renderPlate();
        if (!$('includeName').checked) { $('includeName').checked = true; renderPlate(); }
      };
      root.append(b);
    });
  }

  function refresh() {
    renderHeadOptions();
    renderLibrary();
    backgrounds();
    skins();
    plates();
    inspector();
    $('faceColor').value = state.faceColor;
    $('glow').checked = !!state.glow;
    syncHistory();
    render();
    renderPlate();
  }

  /* ---------------- 모드 & 포인터 ---------------- */
  function setMode(m) {
    mode = m;
    canvas.classList.toggle('drawing', m === 'draw');
    $('move').classList.toggle('active', m === 'move');
    $('draw').classList.toggle('active', m === 'draw');
    $('brushControls').classList.toggle('visible', m === 'draw');
    $('modeLabel').textContent = m === 'draw' ? '직접 그리기' : '선택 & 이동';
    render();
  }

  function renderBrushChips() {
    const root = $('brushChips');
    root.replaceChildren();
    for (const [id, br] of Object.entries(R.BRUSHES)) {
      const b = el('button', id === brush ? 'active' : '');
      b.type = 'button';
      const dot = el('i');
      dot.style.background = br.color || $('brushColor').value;
      if (br.glow) dot.style.boxShadow = `0 0 8px ${br.glow}`;
      b.append(dot, document.createTextNode(br.label));
      b.setAttribute('aria-pressed', id === brush);
      b.onclick = () => { brush = id; renderBrushChips(); };
      root.append(b);
    }
    $('brushColor').disabled = brush !== 'pen';
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * 1000) / r.width, y: ((e.clientY - r.top) * 1000) / r.height };
  }
  function hit(o, p) {
    const a = (-o.rotation * Math.PI) / 180, dx = p.x - o.x, dy = p.y - o.y;
    const x = (dx * Math.cos(a) - dy * Math.sin(a)) / o.scale, y = (dx * Math.sin(a) + dy * Math.cos(a)) / o.scale;
    return Math.abs(x) < o.w / 2 + 12 && Math.abs(y) < o.h / 2 + 12;
  }

  canvas.onpointerdown = (e) => {
    if (!loaded) return;
    e.preventDefault();
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    if (mode === 'draw') {
      currentStroke = { points: [p], color: $('brushColor').value, width: Number($('brushSize').value), brush };
    } else {
      const covered = state.objects.some((o) => o.behind) ? R.hitCharacter(state, p) : false;
      const o = [...state.objects].reverse().find((o) => hit(o, p) && (!o.behind || !covered));
      selected = o?.id ?? null;
      if (o) drag = { id: o.id, dx: p.x - o.x, dy: p.y - o.y };
      inspector();
    }
    render();
  };
  canvas.onpointermove = (e) => {
    const p = point(e);
    if (currentStroke) {
      currentStroke.points.push(p);
      render();
    } else if (drag) {
      const o = state.objects.find((o) => o.id === drag.id);
      o.x = Math.max(20, Math.min(980, p.x - drag.dx));
      o.y = Math.max(20, Math.min(980, p.y - drag.dy));
      render();
    }
  };
  function endPointer() {
    if (currentStroke) {
      const st = currentStroke;
      if (R.BRUSHES[st.brush]?.drip) {
        st.drips = [];
        const n = Math.min(3, 1 + Math.floor(st.points.length / 10));
        for (let i = 0; i < n; i++) {
          if (Math.random() < 0.35) continue;
          const q = st.points[Math.floor(Math.random() * st.points.length)];
          st.drips.push([q.x, q.y, Math.round(st.width * (1.5 + Math.random() * 3))]);
        }
      }
      st.points = st.points.map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }));
      state.strokes.push(st);
      currentStroke = null;
      commit();
    }
    if (drag) {
      drag = null;
      commit();
    }
    render();
  }
  canvas.onpointerup = endPointer;
  canvas.onpointercancel = endPointer;
  canvas.onlostpointercapture = endPointer;

  /* ---------------- 저장 · 업로드 ---------------- */
  async function save() {
    if (!loaded) return toast('캐릭터가 준비될 때까지 잠시 기다려주세요.');
    try {
      await window.Exporter.downloadPNG(state, {
        includePlate: $('includeName').checked,
        artist: $('artist').value,
        fileName: $('pumpkinName').value.trim() || 'my-pumpkin',
      });
      toast('완성 이미지 저장을 시작했어요!');
    } catch (err) {
      console.error(err);
      toast('이미지를 저장하지 못했어요. Chrome 또는 Edge에서 다시 시도해주세요.');
    }
  }

  $('upload').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return toast('PNG, JPG, WebP 이미지를 선택해주세요.');
    if (f.size > 5 * 1024 * 1024) return toast('5MB 이하의 이미지를 선택해주세요.');
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1000 / im.width, 1000 / im.height, 1), thumb = document.createElement('canvas');
        thumb.width = Math.round(im.width * s);
        thumb.height = Math.round(im.height * s);
        thumb.getContext('2d').drawImage(im, 0, 0, thumb.width, thumb.height);
        const src = thumb.toDataURL('image/png');
        const ratio = Math.min(280 / thumb.width, 280 / thumb.height);
        add({ type: 'image', src, name: f.name, x: 500, y: 750, w: thumb.width * ratio, h: thumb.height * ratio });
        toast('이미지를 추가했어요. 원하는 곳으로 옮겨보세요.');
      };
      im.onerror = () => toast('이 이미지를 열 수 없어요. 다른 파일을 선택해주세요.');
      im.src = r.result;
    };
    r.onerror = () => toast('이미지를 읽지 못했어요.');
    r.readAsDataURL(f);
  };

  /* ---------------- 버튼 연결 ---------------- */
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((t) => { t.classList.toggle('active', t === b); t.setAttribute('aria-selected', t === b); });
    renderLibrary();
  }));

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  $('move').onclick = () => setMode('move');
  $('draw').onclick = () => setMode('draw');
  $('undo').onclick = undo;
  $('redo').onclick = redo;
  $('save').onclick = save;
  $('saveTop').onclick = save;
  $('faceColor').oninput = (e) => { state.faceColor = e.target.value; render(); };
  $('faceColor').onchange = () => { commit(); if (state.glow) toast('촛불 발광을 끄면 고른 얼굴 색상이 보여요.'); };
  $('glow').onchange = (e) => { state.glow = e.target.checked; commit(); render(); };
  $('includeName').onchange = () => { renderPlate(); saveDraft(); };
  $('artist').oninput = () => { renderPlate(); saveDraft(); };
  $('pumpkinName').oninput = saveDraft;
  $('brushColor').oninput = renderBrushChips;
  $('clearInk').onclick = () => {
    if (state.strokes.length) { state.strokes = []; commit(); render(); toast('직접 그린 그림을 지웠어요.'); }
  };
  $('random').onclick = () => {
    for (const type of ['eyes', 'nose', 'mouth']) {
      let o = state.objects.find((o) => o.type === type);
      if (!o) { o = initial().objects.find((o) => o.type === type); o.id = nextId++; state.objects.push(o); }
      o.style = Math.floor(Math.random() * R.FACE_LABELS[type].length);
    }
    const wear = (part) => (Math.random() < 0.15 ? 'none' : pick(R.OUTFITS[part].slice(1)).id);
    state.outfit = { top: wear('top'), bottom: wear('bottom'), shoes: wear('shoes') };
    selected = null;
    commit();
    refresh();
    toast('새로운 코디가 나타났어요!');
  };
  $('reset').onclick = () => {
    if (confirm('모든 꾸미기를 지우고 처음부터 시작할까요?')) {
      state = initial();
      selected = null;
      setMode('move');
      commit();
      refresh();
      toast('새로운 호박으로 시작해요.');
    }
  };

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || document.querySelector('dialog[open]')) return;
    if ($('studioView').hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
    if (e.key === 'Escape') { selected = null; setMode('move'); inspector(); return; }
    const o = state.objects.find((o) => o.id === selected);
    if (o && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowUp') o.y -= d;
      if (e.key === 'ArrowDown') o.y += d;
      if (e.key === 'ArrowLeft') o.x -= d;
      if (e.key === 'ArrowRight') o.x += d;
      o.x = Math.max(20, Math.min(980, o.x));
      o.y = Math.max(20, Math.min(980, o.y));
      commit();
      render();
    }
  });

  /* =========================================================
   * 출품 & 명예의 전당
   * ========================================================= */
  function showView(v) {
    $('studioView').hidden = v !== 'studio';
    $('galleryView').hidden = v !== 'gallery';
    document.querySelectorAll('.view-nav [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => showView(b.dataset.view)));

  let pendingThumb = null;
  $('submit').onclick = () => {
    if (!loaded) return toast('캐릭터가 준비될 때까지 잠시 기다려주세요.');
    const artist = $('artist').value.trim();
    if (!artist) {
      $('artist').focus();
      return toast('만든 사람(닉네임)을 먼저 입력해주세요. 네임플레이트에 새겨져요.');
    }
    try {
      pendingThumb = window.Exporter.thumbnail(state, { artist });
    } catch (err) {
      console.error(err);
      return toast('이미지를 만드는 중 문제가 생겼어요.');
    }
    $('submitPreview').src = pendingThumb;
    const notes = [`${$('pumpkinName').value.trim() || '나의 할로윈 호박'} · ${artist}`];
    if (window.Voting.myEntry()) notes.push('이미 출품한 작품은 새 디자인으로 바뀌어요. (받은 사탕은 그대로)');
    if (window.Voting.mode() === 'local') notes.push('지금은 로컬 데모 모드라 이 브라우저에만 저장돼요.');
    $('submitNote').textContent = notes.join('\n');
    $('submitDialog').showModal();
  };
  $('submitDialog').addEventListener('close', async () => {
    if ($('submitDialog').returnValue !== 'ok' || !pendingThumb) return;
    const btn = $('submit');
    btn.disabled = true;
    try {
      const res = await window.Voting.submit({
        author: $('artist').value.trim(),
        title: $('pumpkinName').value.trim() || '나의 할로윈 호박',
        imageUrl: pendingThumb,
      });
      toast(res.updated ? '출품작을 새 디자인으로 바꿨어요!' : '출품 완료! 명예의 전당에 올라갔어요 🎉');
      showView('gallery');
      highlightCard(res.id);
    } catch (err) {
      console.error(err);
      toast('출품하지 못했어요: ' + err.message);
    } finally {
      btn.disabled = false;
      pendingThumb = null;
    }
  });

  const MEDALS = ['🥇', '🥈', '🥉'];
  let lastList = [];
  const byLikes = (list) => list.slice().sort((a, b) => b.likes - a.likes || a.createdAt - b.createdAt);
  const safeImg = (url) => (/^data:image\/(png|jpe?g|webp);base64,/i.test(url) || /^https:\/\//i.test(url) || /^\/api\/image\?/.test(url) ? url : '');

  /* ---------------- 댓글 ---------------- */
  const NICK_KEY = 'axp_nick';
  const openComments = new Set();
  const commentDrafts = new Map();
  let commentNotice = false;

  function savedNick() {
    try { return localStorage.getItem(NICK_KEY) || $('artist').value.trim(); } catch (e) { return $('artist').value.trim(); }
  }
  function rememberNick(v) {
    try { localStorage.setItem(NICK_KEY, v); } catch (e) { /* noop */ }
  }

  function timeAgo(ms) {
    const sec = Math.max(0, (Date.now() - ms) / 1000);
    if (sec < 60) return '방금';
    if (sec < 3600) return Math.floor(sec / 60) + '분 전';
    if (sec < 86400) return Math.floor(sec / 3600) + '시간 전';
    return Math.floor(sec / 86400) + '일 전';
  }

  function commentSection(entry) {
    const V = window.Voting;
    const list = V.commentsFor(entry.id);
    const open = openComments.has(entry.id);
    const wrap = el('div', 'comments' + (open ? ' open' : ''));

    const toggle = el('button', 'comment-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', open);
    toggle.append(el('span', null, `💬 댓글 ${list.length}`), el('span', 'chev', open ? '접기 ▴' : (list.length ? '보기 ▾' : '쓰기 ▾')));
    toggle.onclick = () => {
      if (open) openComments.delete(entry.id); else openComments.add(entry.id);
      renderGallery(lastList);
      if (!open) {
        const t = document.querySelector(`[data-entry="${CSS.escape(entry.id)}"][data-role="text"]`);
        if (t) t.focus({ preventScroll: true });
      }
    };
    wrap.append(toggle);

    if (!open) {
      const last = list[list.length - 1];
      if (last) {
        const peek = el('p', 'comment-peek');
        peek.append(el('b', null, last.author), document.createTextNode(' ' + last.text));
        wrap.append(peek);
      }
      return wrap;
    }

    const ul = el('ul', 'comment-list');
    if (!list.length) ul.append(el('li', 'comment-empty', '첫 댓글을 남겨보세요 👻'));
    for (const cm of list) {
      const li = el('li');
      const head = el('div', 'comment-head');
      head.append(el('b', null, cm.author), el('time', null, timeAgo(cm.createdAt)));
      if (V.isMyComment(cm.id)) {
        const del = el('button', 'comment-del', '삭제');
        del.type = 'button';
        del.setAttribute('aria-label', '내 댓글 삭제');
        del.onclick = async () => {
          if (!confirm('이 댓글을 지울까요?')) return;
          try { await V.deleteComment(cm.id); } catch (err) { toast(err.message); }
        };
        head.append(del);
      }
      li.append(head, el('p', null, cm.text));
      ul.append(li);
    }
    wrap.append(ul);

    const form = el('form', 'comment-form');
    const nick = el('input', 'comment-nick');
    nick.type = 'text';
    nick.maxLength = V.NAME_MAX;
    nick.placeholder = '닉네임';
    nick.value = savedNick();
    nick.dataset.entry = entry.id;
    nick.dataset.role = 'nick';
    nick.setAttribute('aria-label', '댓글 닉네임');
    const row = el('div', 'comment-row');
    const text = el('input', 'comment-input');
    text.type = 'text';
    text.maxLength = V.COMMENT_MAX;
    text.placeholder = '응원 한마디 남기기';
    text.value = commentDrafts.get(entry.id) || '';
    text.dataset.entry = entry.id;
    text.dataset.role = 'text';
    text.setAttribute('aria-label', `${entry.author}님 작품에 댓글`);
    text.oninput = () => commentDrafts.set(entry.id, text.value);
    const send = el('button', 'comment-send', '등록');
    send.type = 'submit';
    row.append(text, send);
    form.append(nick, row);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const n = nick.value.trim(), t = text.value.trim();
      if (!n) { nick.focus(); return toast('닉네임을 입력해주세요.'); }
      if (!t) { text.focus(); return toast('댓글 내용을 입력해주세요.'); }
      send.disabled = true;
      try {
        rememberNick(n);
        commentDrafts.delete(entry.id);
        text.value = '';
        await V.addComment(entry.id, n, t);
        if (V.mode() === 'local' && !commentNotice) { commentNotice = true; toast('댓글을 남겼어요! (로컬 데모 모드라 이 브라우저에만 보여요)'); }
        const box = document.querySelector(`.card[data-id="${CSS.escape(entry.id)}"] .comment-list`);
        if (box) box.scrollTop = box.scrollHeight;
        const t2 = document.querySelector(`[data-entry="${CSS.escape(entry.id)}"][data-role="text"]`);
        if (t2) t2.focus({ preventScroll: true });
      } catch (err) {
        commentDrafts.set(entry.id, t);
        toast('댓글을 남기지 못했어요: ' + err.message);
      } finally {
        send.disabled = false;
      }
    };
    wrap.append(form);
    return wrap;
  }

  function renderGallery(list, meta = {}) {
    lastList = list;
    // 실시간 갱신으로 다시 그려도 입력 중이던 댓글 칸의 포커스·커서를 지킨다
    const ae = document.activeElement;
    const focus = ae && ae.dataset && ae.dataset.entry ? { entry: ae.dataset.entry, role: ae.dataset.role, pos: ae.selectionStart, value: ae.value } : null;
    const scrolls = new Map([...document.querySelectorAll('.card')].map((c) => [c.dataset.id, c.querySelector('.comment-list')?.scrollTop]));
    const grid = $('galleryGrid');
    grid.replaceChildren();
    $('galleryEmpty').hidden = list.length > 0;
    $('galleryCount').textContent = `${list.length}명 참가` + (window.Voting.mode() === 'local' ? ' (로컬 데모 모드 · 이 브라우저에만 저장)' : '');
    if (meta.error) toast('갤러리 연결에 문제가 있어요: ' + (meta.error.message || meta.error));
    const ranks = {};
    byLikes(list).forEach((e, i) => (ranks[e.id] = i + 1));
    const myVote = window.Voting.myVote(), mine = window.Voting.myEntry();
    for (const entry of list) {
      const rank = ranks[entry.id], medal = entry.likes > 0 && rank <= 3;
      const card = el('article', 'card' + (medal ? ` top rank-${rank}` : '') + (entry.id === mine ? ' mine' : ''));
      card.dataset.id = entry.id;
      const fig = el('div', 'card-img');
      const im = el('img');
      im.loading = 'lazy';
      im.alt = `${entry.author}님의 호박`;
      im.src = safeImg(entry.imageUrl);
      fig.append(im, el('span', 'rank-badge', medal ? MEDALS[rank - 1] : `#${rank}`));
      if (entry.id === mine) fig.append(el('span', 'mine-badge', '내 작품'));
      const body = el('div', 'card-body');
      const text = el('div', 'card-text');
      text.append(el('div', 'card-title', entry.title || '나의 할로윈 호박'), el('div', 'card-author', 'MADE BY ' + entry.author));
      body.append(text, el('div', 'card-likes', `🍬 ${entry.likes}`));
      const voted = myVote === entry.id;
      const btn = el('button', 'candy-btn' + (voted ? ' voted' : ''), voted ? '🍬 던졌어요! (취소)' : '🎃 사탕 던지기');
      btn.type = 'button';
      btn.onclick = () => handleVote(entry, btn);
      card.append(fig, body, btn, commentSection(entry));
      grid.append(card);
    }
    for (const card of grid.children) {
      const box = card.querySelector('.comment-list');
      if (!box) continue;
      const prev = scrolls.get(card.dataset.id);
      box.scrollTop = prev == null ? box.scrollHeight : prev;
    }
    if (focus) {
      const t = grid.querySelector(`[data-entry="${CSS.escape(focus.entry)}"][data-role="${focus.role}"]`);
      if (t) {
        if (focus.role === 'nick') t.value = focus.value;
        t.focus({ preventScroll: true });
        try { t.setSelectionRange(focus.pos, focus.pos); } catch (e) { /* noop */ }
      }
    }
  }

  async function handleVote(entry, btn) {
    const prev = window.Voting.myVote();
    if (prev && prev !== entry.id) {
      const pe = lastList.find((e) => e.id === prev);
      if (pe && !confirm(`이미 '${pe.author}'님에게 사탕을 던졌어요.\n'${entry.author}'님에게 투표를 옮길까요?`)) return;
    }
    btn.disabled = true;
    try {
      const res = await window.Voting.vote(entry.id);
      if (res.action !== 'cancel') throwCandy(btn);
      toast(res.action === 'cancel' ? '투표를 취소했어요.' : `${entry.author}님에게 사탕을 던졌어요! 🍬`);
    } catch (err) {
      console.error(err);
      toast('투표하지 못했어요: ' + err.message);
    } finally {
      btn.disabled = false;
    }
    renderGallery(window.Voting.entries());
  }

  function throwCandy(from) {
    const r = from.getBoundingClientRect();
    const items = ['🍬', '🍭', '🍫', '🎃'];
    for (let i = 0; i < 10; i++) {
      const s = el('span', 'flying-candy', items[i % items.length]);
      s.style.left = `${r.left + r.width / 2}px`;
      s.style.top = `${r.top}px`;
      s.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
      s.style.setProperty('--dy', `${-120 - Math.random() * 160}px`);
      s.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
      document.body.append(s);
      setTimeout(() => s.remove(), 1200);
    }
  }

  function highlightCard(id) {
    setTimeout(() => {
      const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('flash');
      setTimeout(() => card.classList.remove('flash'), 2000);
    }, 300);
  }

  $('awardBtn').onclick = () => {
    const top = byLikes(lastList).slice(0, 3);
    const podium = $('podium');
    podium.replaceChildren();
    if (!top.length) podium.append(el('p', 'hint', '아직 출품작이 없어요!'));
    [1, 0, 2].forEach((i) => {
      const e = top[i];
      if (!e) return;
      const col = el('div', `podium-col p${i + 1}`);
      const im = el('img');
      im.src = safeImg(e.imageUrl);
      im.alt = `${e.author}님의 호박`;
      col.append(el('div', 'podium-medal', MEDALS[i]), im, el('div', 'podium-name', e.author), el('div', 'podium-likes', `🍬 ${e.likes}`), el('div', 'podium-block', String(i + 1)));
      podium.append(col);
    });
    $('awardDialog').showModal();
    const items = ['🎃', '🍬', '🦇', '👻', '⭐', '🍭'];
    for (let i = 0; i < 40; i++) {
      const s = el('span', 'confetti', items[i % items.length]);
      s.style.left = `${Math.random() * 100}vw`;
      s.style.setProperty('--delay', `${Math.random() * 1.2}s`);
      s.style.setProperty('--rot', `${(Math.random() - 0.5) * 900}deg`);
      s.style.setProperty('--dur', `${2.4 + Math.random() * 1.6}s`);
      document.body.append(s);
      setTimeout(() => s.remove(), 5000);
    }
  };

  document.querySelectorAll('[data-sort]').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('active', x === b));
    window.Voting.setSort(b.dataset.sort);
  }));

  /* ---------------- 시작 ---------------- */
  loadDraft();
  renderBrushChips();
  refresh();
  R.load().then((ok) => {
    if (!ok) { $('loading').textContent = '캐릭터를 불러오지 못했어요. js/assets.js 파일이 있는지 확인해주세요.'; return; }
    loaded = true;
    $('loading').classList.add('hidden');
    refresh();
  });
  window.Voting.init().then((m) => {
    if (m === 'supabase') {
      $('syncTag').textContent = '● 실시간 투표 연결됨';
      $('syncTag').classList.add('online');
    } else {
      $('syncTag').title = 'js/supabase-config.js 를 채우면 참가자 전원이 실시간으로 함께 볼 수 있어요.';
    }
    window.Voting.onUpdate(renderGallery);
    window.Voting.onComments((all, meta) => {
      if (meta && meta.error) toast('댓글 연결에 문제가 있어요: ' + (meta.error.message || meta.error));
      renderGallery(lastList);
    });
  });

  /* =========================================================
   * Phase 1: 인트로 — YES 를 누르기 전까지 스튜디오는 잠겨 있다
   * ========================================================= */
  (() => {
    const intro = $('partyIntro'), app = $('studioApp'), enter = $('enterParty');
    const ic = $('introPumpkin').getContext('2d');
    const entranceArt = new Image();
    let artReady = false;
    const glowLayer = document.createElement('canvas');
    glowLayer.width = 1000;
    glowLayer.height = 1000;
    const gc = glowLayer.getContext('2d', { willReadFrequently: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let begun = false, entered = false, frame = 0, start = 0;
    const timers = [];
    const schedule = (fn, ms) => timers.push(setTimeout(fn, ms));
    const INTRO_KEY = 'axp_intro_seen';

    function openStudio(instant) {
      entered = true;
      try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* noop */ }
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
      intro.classList.add('leaving');
      app.removeAttribute('inert');
      app.setAttribute('aria-hidden', 'false');
      document.body.classList.remove('intro-locked');
      if (!instant) {
        const h = app.querySelector('h1');
        h.setAttribute('tabindex', '-1');
        h.focus({ preventScroll: true });
      }
      setTimeout(() => { intro.hidden = true; }, instant || reduced ? 0 : 800);
    }

    // 인트로는 처음 한 번만: YES 를 한 번 누른 브라우저는 새로고침해도 바로 스튜디오로
    // (index.html#studio / #gallery 로 열어도 건너뛴다)
    let seen = false;
    try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { /* noop */ }
    if (seen || location.hash === '#studio' || location.hash === '#gallery') {
      openStudio(true);
      if (location.hash === '#gallery') showView('gallery');
      return;
    }

    function prepareGlow() {
      gc.drawImage(entranceArt, 0, 0, 1000, 1000);
      const pixels = gc.getImageData(0, 0, 1000, 1000), d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const warm = r > g * 0.95 && g > b * 1.16;
        const x = (i / 4) % 1000, y = Math.floor(i / 4 / 1000);
        const faceRegion = x > 270 && x < 720 && y > 390 && y < 695;
        d[i + 3] = warm && faceRegion ? Math.round(Math.max(0, Math.min(1, (lum - 115) / 100)) * 255) : 0;
      }
      gc.putImageData(pixels, 0, 0);
    }
    function candlelight(progress, time) {
      ic.clearRect(0, 0, 1000, 1000);
      const flicker = 1 + Math.sin(time * 1.7) * 0.009 + Math.sin(time * 2.9) * 0.007;
      const light = progress * flicker;
      if (!artReady) return;
      ic.save();
      ic.globalAlpha = 0.65 + progress * 0.35;
      ic.filter = `brightness(${0.015 + light * 0.7})`;
      ic.drawImage(entranceArt, 0, 0, 1000, 1000);
      ic.restore();
      ic.save();
      ic.globalAlpha = Math.min(1, light) * 0.85;
      ic.globalCompositeOperation = 'screen';
      ic.filter = 'blur(18px) brightness(1.2)';
      ic.drawImage(glowLayer, 0, 0);
      ic.filter = 'brightness(1.1)';
      ic.drawImage(glowLayer, 0, 0);
      ic.restore();
    }
    function animate(now) {
      if (entered) return;
      if (!start) start = now;
      const elapsed = (now - start) / 1000;
      const raw = Math.max(0, Math.min(1, (elapsed - 0.65) / 3.15));
      const eased = raw * raw * (3 - 2 * raw);
      candlelight(eased, elapsed);
      if (elapsed < 6.5) frame = requestAnimationFrame(animate);
    }
    function revealQuestion() {
      intro.classList.add('question');
      intro.setAttribute('aria-busy', 'false');
      enter.disabled = false;
    }
    function begin() {
      if (begun) return;
      begun = true;
      if (reduced) { intro.classList.add('scene-out', 'welcome'); revealQuestion(); return; }
      frame = requestAnimationFrame(animate);
      schedule(() => intro.classList.add('lit'), 800);
      schedule(() => intro.classList.add('scene-out'), 4600);
      schedule(() => intro.classList.add('welcome'), 6000);
      schedule(revealQuestion, 7900);
    }
    enter.addEventListener('click', () => {
      if (entered || enter.disabled) return;
      openStudio(false);
    });
    entranceArt.onload = () => { artReady = true; prepareGlow(); begin(); };
    entranceArt.onerror = () => { intro.classList.add('scene-out', 'welcome'); revealQuestion(); };
    entranceArt.src = (window.ASSETS || {}).entrance || '';
    if (reduced) begin();
  })();
})();
