"""
AX Pumpkin Studio — 에셋 빌드 스크립트

images/ 폴더의 원본 이미지를 정리해서
  1) images/parts, images/halloween, images/stickers 에 webp 로 저장하고
  2) js/assets.js 에 data URL 로 묶어 넣습니다.

data URL 로 넣어 두면 index.html 을 더블클릭(file://)해도
캔버스 저장·픽셀 처리(호박 색 바꾸기, 의상 음영)가 막히지 않습니다.

사용법:  python tools/build_assets.py [레퍼런스 HTML 경로]
  - 레퍼런스 HTML 을 넘기면 그 안에 들어 있는 캐릭터/소품/인트로 아트를 꺼내
    images/parts, images/halloween 에 저장합니다. (한 번만 하면 됨)
"""
import base64
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "images"
PARTS = IMG / "parts"
HALLOWEEN = IMG / "halloween"
STICKERS = IMG / "stickers"


def extract_reference(html_path):
    """레퍼런스 HTML 에 base64 로 들어 있는 아트를 파일로 꺼낸다."""
    src = Path(html_path).read_text(encoding="utf-8")
    targets = {
        "base": PARTS / "shapes" / "base.webp",
        "headSheet": PARTS / "shapes" / "head_sheet.webp",
        "squashedHead": PARTS / "shapes" / "squashed.webp",
        "propSheet": PARTS / "props" / "prop_sheet.webp",
        "entranceArt": HALLOWEEN / "entrance.webp",
    }
    for name, out in targets.items():
        m = re.search(re.escape(name) + r"\.src='data:image/(\w+);base64,([^']+)'", src)
        if not m:
            raise SystemExit(f"{name} 를 찾지 못했습니다")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(base64.b64decode(m.group(2)))
        print("extracted", out.relative_to(ROOT))


def to_webp(src, out, max_side=None, quality=82):
    im = Image.open(src)
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    if max_side and max(im.size) > max_side:
        k = max_side / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=quality, method=6)
    print("wrote", out.relative_to(ROOT), im.size, out.stat().st_size // 1024, "KB")


def cut_stickers(sheet_path, prefix, labels=None, skip=None, max_side=260, min_size=500):
    """흰 배경 스티커 시트 → 투명 배경 개별 스프라이트.

    테두리와 이어진 흰 영역을 지우고, 남은 덩어리를 하나씩 잘라낸다.
    (점선 칼선처럼 가늘고 듬성한 덩어리는 채움 비율로 걸러낸다)
    """
    im = Image.open(sheet_path).convert("RGB")
    w, h = im.size
    px = im.load()
    N = w * h

    def lum_sat(x, y):
        r, g, b = px[x, y]
        return (r + g + b) / 3, max(r, g, b) - min(r, g, b)

    bgable = bytearray(N)
    for y in range(h):
        for x in range(w):
            l, s = lum_sat(x, y)
            if l > 205 and s < 30:
                bgable[y * w + x] = 1

    removed = bytearray(N)
    stack = []
    for x in range(w):
        stack += [x, (h - 1) * w + x]
    for y in range(h):
        stack += [y * w, y * w + w - 1]
    while stack:
        i = stack.pop()
        if removed[i] or not bgable[i]:
            continue
        removed[i] = 1
        x = i % w
        if x > 0: stack.append(i - 1)
        if x < w - 1: stack.append(i + 1)
        if i >= w: stack.append(i - w)
        if i < N - w: stack.append(i + w)

    label = [-1] * N
    comps = []
    for i in range(N):
        if removed[i] or label[i] != -1:
            continue
        cid = len(comps)
        label[i] = cid
        stack = [i]
        size = 0
        x0 = y0 = 10 ** 9
        x1 = y1 = -1
        while stack:
            j = stack.pop()
            size += 1
            x, y = j % w, j // w
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
            for n in ((j - 1) if x > 0 else -1, (j + 1) if x < w - 1 else -1, j - w, j + w):
                if 0 <= n < N and not removed[n] and label[n] == -1:
                    label[n] = cid
                    stack.append(n)
        comps.append((size, x0, y0, x1, y1))

    keep = []
    for cid, (size, x0, y0, x1, y1) in enumerate(comps):
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        if size < min_size or size / (bw * bh) < 0.2:
            continue
        if skip and skip(x0, y0, x1, y1):
            continue
        keep.append((cid, x0, y0, x1, y1))

    # 위→아래, 왼→오 순서 (같은 줄은 y 중심이 비슷한 것끼리)
    keep.sort(key=lambda c: ((c[2] + c[4]) // 2 // 80, c[1]))
    results = []
    for n, (cid, x0, y0, x1, y1) in enumerate(keep):
        sw, sh = x1 - x0 + 1, y1 - y0 + 1
        sp = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
        spx = sp.load()
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                i = y * w + x
                if label[i] != cid:
                    continue
                r, g, b = px[x, y]
                a = 255
                # 흰 배경과 맞닿은 밝은 가장자리는 반투명으로 부드럽게
                edge = any(
                    0 <= nx < w and 0 <= ny < h and removed[ny * w + nx]
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                )
                if edge:
                    l = (r + g + b) / 3
                    if l > 150:
                        a = max(0, min(255, int((255 - l) / 105 * 255)))
                spx[x - x0, y - y0] = (r, g, b, a)
        if max(sp.size) > max_side:
            k = max_side / max(sp.size)
            sp = sp.resize((max(1, round(sw * k)), max(1, round(sh * k))), Image.LANCZOS)
        name = f"{prefix}_{n + 1:02d}"
        out = STICKERS / f"{name}.webp"
        out.parent.mkdir(parents=True, exist_ok=True)
        sp.save(out, "WEBP", quality=88, method=6)
        lab = labels[n] if labels and n < len(labels) else f"스티커 {n + 1}"
        results.append({"id": name, "label": lab, "file": out})
    print(f"{sheet_path.name}: {len(results)} stickers")
    return results


def data_url(path):
    mime = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"}[path.suffix]
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def main():
    if len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        extract_reference(sys.argv[1])

    to_webp(IMG / "halloween1.png", HALLOWEEN / "bg_village.webp", max_side=1400)
    to_webp(IMG / "halloween2.png", HALLOWEEN / "bg_forest.webp", max_side=1400)

    for old in STICKERS.glob("*.webp"):
        old.unlink()
    s4 = cut_stickers(
        IMG / "halloween4.jpg", "cut",
        labels=["유령", "호박", "마녀 고양이", "박쥐", "마녀 모자", "사탕", "나무", "유령의 집", "해골", "스켈레톤"],
        skip=lambda x0, y0, x1, y1: x1 < 160 and y1 < 90,   # 'Recorta…' 안내 문구
    )
    s3 = cut_stickers(IMG / "halloween3.jpg", "mini", max_side=160, min_size=300)

    assets = {
        "base": PARTS / "shapes" / "base.webp",
        "headSheet": PARTS / "shapes" / "head_sheet.webp",
        "squashed": PARTS / "shapes" / "squashed.webp",
        "propSheet": PARTS / "props" / "prop_sheet.webp",
        "entrance": HALLOWEEN / "entrance.webp",
        "bgVillage": HALLOWEEN / "bg_village.webp",
        "bgForest": HALLOWEEN / "bg_forest.webp",
    }
    lines = [
        "/* 자동 생성 파일 — tools/build_assets.py 로 다시 만드세요. 직접 수정하지 마세요. */",
        "window.ASSETS = {",
    ]
    for k, p in assets.items():
        lines.append(f"  {k}: '{data_url(p)}',")
    lines.append("};")
    stickers = [{"id": s["id"], "label": s["label"], "src": data_url(s["file"])} for s in s4 + s3]
    lines.append("window.STICKER_ASSETS = " + json.dumps(stickers, ensure_ascii=False) + ";")
    out = ROOT / "js" / "assets.js"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote", out.relative_to(ROOT), out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
