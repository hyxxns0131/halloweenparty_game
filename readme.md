# 🎃 AX Pumpkin Studio (AX 할로윈 파티 프로젝트)

> **"나만의 잭오랜턴 피규어를 조립하고, 실시간 투표로 파티 베스트 드레서를 뽑아보세요!"**  
> HTML5, CSS3, Vanilla JavaScript 기반의 반응형 웹 애플리케이션 기획 및 아키텍처 명세서입니다.

---

## 📌 1. 프로젝트 개요

* **프로젝트명**: AX Pumpkin Studio (AX 할로윈 파티)
* **목표 인원**: 모임 및 사내 인원 30명 내외
* **주요 목적**:
  * 3D 피규어 스타일(동글동글한 SD 캐릭터 바디)의 잭오랜턴 캐릭터를 파츠별로 조합·커스터마이징
  * 호박 두상, 얼굴 표정, 호박 색상, 패션(상의/하의/신발), 악세서리를 다채롭게 꾸미기
  * 네임플레이트(`images/name.jpg`)에 이름을 새겨 완성 이미지 다운로드
  * 갤러리에 등록 후 참가자 간 실시간 '좋아요' 투표를 통해 랭킹 순위 확인 및 파티 시상

---

## 🎨 2. 캐릭터 디자인 및 파츠 시스템 명세

첨부된 레퍼런스(귀엽고 통통한 미니 피규어 비율)를 기반으로 다층 레이어(Layer Canvas) 방식으로 조립됩니다.

```
[Layer 구조: 뒤에서 앞으로]
1. 배경 (Background) - 할로윈 으스스한 테마
2. 캐릭터 바디 (기본 몸통 & 다리)
3. 하의 (Pants/Skirts) & 신발 (Shoes)
4. 상의 (Tops/Costumes)
5. 호박 머리 베이스 (Pumpkin Head Base) + 꼭지
6. 눈 / 코 / 입 (Carved Face Parts - 안쪽 음영 & 발광 효과)
7. 악세서리 & 소품 (Accessories - 모자, 날개, 망토, 손 소품 등)
8. 네임플레이트 (Nameplate - 'images/name.jpg' + 작성자 이름)
```

### 1) 호박 머리 형태 (Shape 4종)
* **대두형 (Big Head)**: 머리가 몸통보다 훨씬 큰 귀여운 2등신 비율
* **롱 헤드 (Tall & Slim)**: 위아래로 길쭉한 박/호박 형태
* **납작 호박 (Flat & Chubby)**: 양옆으로 퍼지고 납작 눌린 형태
* **찌그러진 호박 (Wonky / Twisted)**: 비대칭이거나 굴곡진 익살스러운 형태

### 2) 호박 본체 컬러 팔레트 (Skin Color)
* **클래식 오렌지 (Classic Pumpkin)**
* **좀비 그린 (Rotten Green)**
* **다크 고스트 퍼플 (Midnight Purple)**
* **스푸키 화이트/아이보리 (Ghost White)**
* **섀도우 블랙 (Shadow Charcoal)**
* *(선택 기능: 컬러 피커(Color Picker) 지원 시 무제한 커스텀 가능)*

### 3) 얼굴 조각 파츠 (Face Carving)
* **눈 (Eyes)**: 클래식 삼각형, 화난 반달 눈, 땡그란 동그라미, 윙크, X자 눈 등
* **코 (Nose)**: 미니 세모, 박쥐 모양, 해골 콧구멍, 역삼각형 등
* **입 (Mouth)**: 지그재그 이빨, 뱀파이어 송곳니, 멍한 O자 입, 꿰맨 자국(Stitch) 등
* **안쪽 발광 효과**: 눈/코/입 파츠 안쪽에 어두운 음영 또는 노란빛 촛불 발광(Glow) On/Off 지원

### 4) 의상 코스튬 시스템 (Fashion Items)
* **상의 (Tops)**: 
  * 프랑켄슈타인 자켓, 줄무늬 죄수복, 뱀파이어 턱시도, 드라큘라 케이프, 기본 티셔츠
* **하의 (Bottoms)**: 
  * 찢어진 청바지, 호박색 멜빵바지, 펑크 스커트, 미라 붕대 팬츠
* **신발 (Shoes)**: 
  * 통통한 스니커즈, 마녀 뾰족 구두, 부츠, 붕대 감은 발

### 5) 악세서리 & 소품 (Accessories & Props)
* **머리/얼굴**: 뾰족 마녀 모자, 미니 박쥐 머리띠, 해골 핀, 호박 꼭지 리본
* **등/날개**: 박쥐 날개, 악마 꼬리, 거미줄 망토
* **손 소품**: 미니 사탕 바구니, 마법 지팡이, 잭오랜턴 미니 램프

### 6) 자유 꾸미기 도구 (차별화 요소)
* 프리셋 외에도 참가자 개성을 살릴 수 있도록 **자유 낙서 브러시(Blood/Slime 등)** 또는 **자유 스티커 핀 기능** 제공

---

## 🎬 3. 화면 흐름 및 UX 시퀀스

### [Phase 1: 인트로 시퀀스 (The Awakening)]
1. **완전한 암전**: 페이지 로드 시 칠흑 같은 어둠 연출 (`#0a0812`)
2. **호박의 눈빛 점등**: 호박 눈/코/입 파츠 뒤에서 주황색 불빛(Glow)이 서서히 밝아짐 (CSS Keyframe 애니메이션)
3. **페이드아웃 및 메시지 등장**: 
   * 호박 불빛이 부드럽게 흩어지며 메시지 출력:  
     `"AX 할로윈 파티에 오신 여러분을 환영합니다"`
4. **CTA 버튼 노출**:  
   * `"입장하시겠습니까?"` (촛불 깜빡임 효과 버튼)
   * 클릭 시 문이 열리듯 어둠이 걷히며 메인 스튜디오로 전환

### [Phase 2: 메인 스튜디오 (Pumpkin Customizer)]
* **좌측/중앙: 실시간 캔버스 (Live Preview)**
  * 사용자가 선택한 파츠가 실시간으로 레이어링되어 반영
  * 하단에 `images/name.jpg` 템플릿 기반 네임플레이트 표시 (사용자 닉네임 실시간 각인)
* **우측/하단: 커스텀 탭 패널 (반응형 탭 메뉴)**
  * `[머리 모양]` ➔ `[피부 색상]` ➔ `[눈/코/입]` ➔ `[의상(상의/하의/신발)]` ➔ `[악세서리]` ➔ `[완성 및 이름]`
* **하단 컨트롤 바**:
  * 📸 **내 호박 다운로드**: 완성된 캐릭터 + 네임플레이트를 고화질 PNG로 저장
  * 🚀 **파티 갤러리에 출품하기**: 이름을 등록하고 전체 참가자 투표장으로 전송

### [Phase 3: 할로윈 명예의 전당 (Voting & Ranking Gallery)]
* 30여 명의 참가자가 등록한 호박 캐릭터가 그리드 카드로 진열
* 각 카드에는 **[작성자 닉네임]**, **[완성된 호박 썸네일]**, **[🎃 사탕 던지기 / 좋아요 버튼]** 표시
* **실시간 정렬 필터**:
  * `🏆 득표순 (랭킹 1위부터 정렬)`
  * `🕒 최신 등록순`
* 1인 1투표 제한 (브라우저 LocalStorage 기반 중복 방지)

---

## ⚙️ 4. 기술 아키텍처 및 30인 투표 구현 가이드

별도의 무거운 백엔드 서버 없이 HTML, CSS, JavaScript만으로 30명 내외의 실시간 투표를 구축하는 가장 권장되는 방식입니다.

```
[클라이언트: GitHub Pages or Vercel (정적 웹 호스팅)]
           │
           ├── 캔버스 그래픽 렌더링 (HTML5 Canvas API)
           ├── 이미지 내보내기 (canvas.toDataURL)
           │
           ▼
[초경량 무료 BaaS: Firebase Firestore]
  ├── 컬렉션: `pumpkins`
  │     ├── id: 자동생성
  │     ├── author: "홍길동"
  │     ├── imageUrl: Base64 또는 이미지 링크
  │     ├── likes: 12 (정수)
  │     └── createdAt: 타임스탬프
```

1. **호스팅**: GitHub Pages 또는 Netlify/Vercel (무료, 링크 하나로 30명 즉시 접속)
2. **데이터베이스 & 투표 동기화**: **Firebase Firestore (무료 플랜)**
   * 파티 참가자가 "출품하기"를 누르면 Firestore 문서 생성
   * 다른 참가자가 "좋아요"를 누르면 `likes` 카운트가 `+1` 증가
   * `orderBy("likes", "desc")` 쿼리를 통해 자동으로 실시간 1위부터 순서대로 재정렬

---

## 📂 5. 프로젝트 디렉토리 구조 제안

```text
AX-Pumpkin-Studio/
├── index.html              # 인트로, 커스터마이징 툴, 갤러리가 통합된 SPA 구조
├── css/
│   ├── style.css           # 전체 할로윈 다크 테마 및 반응형 레이아웃
│   ├── intro.css           # 촛불 점등, 암전 페이드아웃 애니메이션
│   └── studio.css          # 커스터마이징 툴킷 및 캔버스 스타일
├── js/
│   ├── app.js              # 전체 초기화 및 라우팅/화면 전환
│   ├── customizer.js       # 호박 파츠 레이어 합성 및 Canvas 렌더링
│   ├── voting.js           # Firebase 연동 및 좋아요/랭킹 정렬 로직
│   └── export.js           # 이미지 다운로드 (PNG 저장)
├── images/
│   ├── name.jpg            # 네임플레이트 배경 템플릿
│   ├── halloween/          # 할로윈 배경, 거미줄, 박쥐 테마 그래픽
│   └── parts/              # 부위별 스프라이트 파츠
│       ├── shapes/         # 호박 두상 4종
│       ├── eyes/           # 눈 파츠
│       ├── mouths/         # 입 파츠
│       ├── clothes/        # 상의, 하의, 신발
│       └── props/          # 모자, 날개 등 소품
└── README.md               # 본 프로젝트 명세서
```
---

## 🚀 6. 실행 및 설정

### 실행하기
* `index.html` 을 **더블클릭**하면 바로 실행됩니다. (인터넷·서버 불필요 — 이미지가 `js/assets.js` 에 내장되어 있어요)
* `index.html#studio` → 인트로 건너뛰고 스튜디오로, `index.html#gallery` → 바로 명예의 전당 (파티장 스크린 송출용)
* 작업 중인 호박은 브라우저에 자동 보관되어 새로고침해도 이어서 꾸밀 수 있습니다.

### 이미지(에셋)를 바꿨다면
`images/` 의 원본을 수정한 뒤 아래 명령으로 `js/assets.js` 를 다시 만듭니다. (Python + Pillow 필요)
```
python tools/build_assets.py
```
* `images/parts/shapes` 호박 캐릭터 5종 · `images/parts/props` 입체 소품 시트 · `images/halloween` 인트로/배경/네임플레이트 · `images/stickers` 스티커 (halloween3·4.jpg 에서 자동 추출)

### 🎲 사탕 뺏기 (넌센스 퀴즈)
* 명예의 전당의 **🎲 사탕 뺏기** 버튼 → `quiz.txt` 의 문제 중 하나가 랜덤으로 출제 (전부 한 번씩 나올 때까지 중복 없음)
* 주관식 채점: 띄어쓰기·문장부호·대소문자 무시. 정답 → 사탕을 가진 다른 참가자에게서 1개를 랜덤으로 뺏어옴 / 오답(또는 포기) → 정답 공개 + 내 사탕 1개가 랜덤 참가자에게 넘어감
* 출품한 사람만 참여 가능, 한 판 끝나면 15초 쉬었다가 다시 도전
* 문제를 고치려면 `quiz.txt` 를 같은 형식(`번호. 문제` / `- 정답: 답 (설명)`)으로 수정 → 웹에 올린 경우 자동 반영, 파일로 열 때는 `python tools/build_assets.py --quiz-only` 실행

### 30명 실시간 투표 켜기 (Firebase Firestore)
`js/firebase-config.js` 가 비어 있으면 **로컬 데모 모드**(이 브라우저에만 저장)로 동작합니다.

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성 → **Firestore Database** 만들기 (프로덕션 모드)
2. 프로젝트 설정 → 내 앱 → 웹 앱(`</>`) 추가 → 표시되는 `firebaseConfig` 값을 `js/firebase-config.js` 에 붙여넣기
3. Firestore → 규칙 탭에 아래 규칙 게시 (출품·±1 투표·댓글 작성만 허용)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /pumpkins/{id} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['author', 'title', 'imageUrl', 'likes', 'createdAt'])
        && request.resource.data.likes == 0
        && request.resource.data.author is string && request.resource.data.author.size() <= 20
        && request.resource.data.title is string && request.resource.data.title.size() <= 30
        && request.resource.data.imageUrl is string && request.resource.data.imageUrl.size() < 900000;
      allow update: if (
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes'])
          && (request.resource.data.likes - resource.data.likes == 1
              || request.resource.data.likes - resource.data.likes == -1)
        ) || (
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['author', 'title', 'imageUrl', 'updatedAt'])
          && request.resource.data.imageUrl.size() < 900000
        );
      allow delete: if false;
    }
    match /comments/{id} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['entryId', 'author', 'text', 'createdAt'])
        && request.resource.data.entryId is string
        && request.resource.data.author is string && request.resource.data.author.size() > 0 && request.resource.data.author.size() <= 12
        && request.resource.data.text is string && request.resource.data.text.size() > 0 && request.resource.data.text.size() <= 100;
      allow update: if false;
      allow delete: if true;   // 화면에서는 내가 쓴 댓글에만 삭제 버튼이 보여요
    }
  }
}
```

4. GitHub Pages / Vercel / Netlify 에 폴더 전체를 업로드하면 링크 하나로 참가자 모두 접속 가능

> ℹ️ 1인 1투표는 브라우저 localStorage 로 막기 때문에 다른 브라우저·시크릿 창으로는 재투표가 가능합니다. 사내 파티 규모(30명)에서의 '신뢰 기반' 제한입니다.
> 갤러리 썸네일은 약 440×550 JPEG(Base64)로 Firestore 문서에 직접 저장되며, 다운로드 PNG는 2000×2500(네임플레이트 포함) 고화질입니다.
