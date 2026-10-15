# CLAUDE.md — 라운드 타이머 작업 안내 (코딩 에이전트용)

> Claude Code가 아닌 다른 CLI를 쓰면 이 파일 이름을 `AGENTS.md`로 바꿔도 됩니다.

## 프로젝트 한 줄 요약
주짓수 도장용 라운드·인터벌 타이머. 빌드 없는 순수 HTML/CSS/JS 정적 웹앱(PWA)이고, GitHub Pages로 배포해 "홈 화면에 추가"로 앱처럼 쓴다.

## 지켜야 할 제약
- **빌드 도구·프레임워크·npm 의존성 없음.** 파일을 그대로 서빙하면 동작해야 한다.
- **모든 경로는 상대경로** (`./`, `css/app.css` …). GitHub Pages 프로젝트 사이트는 `/<repo>/` 하위 경로에서 돈다.
- **외부 CDN·외부 요청 금지.** 오프라인(도장 와이파이 불안정)에서도 돼야 한다. 글꼴도 `fonts/`에 자체 호스팅.
- 앱 파일을 바꾸면 **`sw.js`의 `VERSION`을 올린다.** 새 파일을 추가하면 `ASSETS` 배열에도 넣는다.
- 다른 상용 앱의 로고·디자인·소리 파일을 가져오지 않는다. 소리는 `tools/make-sounds.py`로 직접 합성해 `sounds/*.m4a`로 넣는다
  (iPad 무음 모드에서도 들리도록 Web Audio가 아니라 `<audio>`로 재생).

## 파일 구조
```
index.html              마크업 (목록/편집/기록/설정 뷰 컨테이너 + 실행 화면 오버레이 #run)
css/app.css             스타일. 색은 :root CSS 변수, 다크모드 지원, 구간 색은 .run[data-kind=…]
js/app.js               앱 전체 로직 (IIFE 하나)
sw.js                   서비스 워커: 앱 셸 캐시 (stale-while-revalidate)
manifest.webmanifest    PWA 매니페스트 (이름, 아이콘, standalone)
icons/                  192/512/maskable/apple-touch 아이콘
sounds/                 효과음 m4a (tools/make-sounds.py가 생성)
tools/make-sounds.py    효과음 합성 스크립트 (numpy + afconvert)
fonts/                  Big Shoulders Display 800 (숫자용, latin 서브셋) + OFL.txt
```

## js/app.js 구조
- **데이터** — `localStorage["round-timer.v1"]`
  ```
  {
    workouts: [{ id, name, prepare, work, rest, rounds, cycles, cycleRest, cooldown }],  // 시간은 초
    history:  [{ at, name, ms, done }],                                                  // 최근 80개
    settings: { sound, voice, flash, warn, cd, bell, v },   // cd: 카운트다운 소리(CD), bell: 시작·끝 소리(BELL), 기본 rec/real(시작 땡·끝 땡땡땡)·음성 끔
    updatedAt
  }
  ```
  읽을 때 항상 `normalize()`/`normW()`를 거친다. 값 범위는 `LIMITS`. 기본 프리셋은 `PRESETS`.
- **스케줄** — `buildSegments(w)` → `[{ k, d, r, c, t0, t1 }]`
  - `k`: `prepare | work | rest | cycleRest | cooldown`, `d`: 초, `t0/t1`: 시작·끝(ms)
  - 라운드 사이엔 rest, 세트 마지막 라운드 뒤엔 cycleRest(0이면 rest), 전체 마지막 라운드 뒤엔 휴식 없음.
- **타이밍 (중요)** — 경과 시간 = `R.base + (Date.now() - R.runAt)`.
  setInterval로 1씩 빼는 방식으로 바꾸지 말 것. 화면 잠금/백그라운드 후 돌아오면 어긋난다.
  `requestAnimationFrame` 루프(`frame()`)가 매 프레임 현재 구간을 계산하고,
  `R.lastTick`이 1.5초 이상 지났으면(복귀 직후) 밀린 알림을 한꺼번에 울리지 않는다.
- **알림**
  - `beep(kind, segKind, force)` — kind: `tick`(마지막 3초) `warn`(종료 10초 전) `phase`(구간 전환) `finish`
  - `sndName()`이 설정(`cd`, `bell`)으로 `sounds/*.m4a`를 고르고 `<audio>`로 재생. 복싱 벨 녹음은 `tools/cut-bell.py`(Freesound CC0, `sounds/CREDITS.txt`).
  - `speak()` 한국어 음성(speechSynthesis), `flash()` 화면 깜빡임
  - iOS 오디오 잠금 해제를 위해 사용자가 누르는 순간 `audioUnlock()`을 호출한다 (시작/일시정지/건너뛰기 버튼).
- **화면** — `view` 상태(`home | edit | history | settings`)를 `render*()`가 innerHTML로 그린다.
  사용자 입력 문자열은 반드시 `esc()`로 이스케이프. 편집은 바뀔 때마다 자동 저장(`persist()`).
- **실행 화면** — `start(id)` → `#run` 오버레이. `pause/resume/next/prev/seek/finish/closeRun`.
  Wake Lock으로 화면 꺼짐 방지를 시도하고, 실패하면 안내 토스트를 띄운다.
  버튼은 시작/멈춤 하나. 숫자 화면 탭=일시정지, 좌우 스와이프=구간 이동.
  키보드: Space 일시정지, ←/→ 구간 이동, Esc 종료(두 번 누름).

## 로컬 실행
```
python3 -m http.server 8000
# http://localhost:8000  (서비스 워커는 file:// 에서 동작하지 않음)
```

## 할 일 1 — 배포
1. `git init` → 커밋 → GitHub 저장소 생성 후 push (`gh repo create <이름> --public --source . --push`)
2. GitHub Pages 켜기: 저장소 Settings → Pages → Deploy from a branch → `main` / `(root)`
   (CLI로: `gh api -X POST repos/<owner>/<repo>/pages -f "source[branch]=main" -f "source[path]=/"`)
3. `https://<owner>.github.io/<repo>/` 가 열리는지, 콘솔 에러·서비스 워커 등록을 확인

## 할 일 2 — 선택 기능 (요청 받으면)
- **내 소리 파일 넣기**: 설정에서 mp3/wav 업로드 → IndexedDB에 저장 → 구간 시작/종료/10초 전에 각각 지정. `AudioContext.decodeAudioData`로 재생, 기존 합성음은 기본값으로 유지.
- **운동 목록 내보내기/가져오기**: JSON 파일로 저장·불러오기 → 관장님 기기로 프리셋 옮기기.
- **라운드별 다른 시간**: 예) 1라운드 6분, 이후 5분. 데이터 모델에 라운드별 override 배열 추가.

## 검증 체크리스트
- 아이폰·아이패드 Safari에서 홈 화면에 추가 → 아이콘·전체화면·가로/세로 레이아웃
- 비행기 모드에서 앱 실행 (오프라인 캐시)
- 소리 3종 미리 듣기, 마지막 3초·10초 전 알림·구간 전환음, 음성 안내
- 일시정지 → 화면 잠금 → 다시 켰을 때 시간이 맞는지
- 다크모드에서 목록·편집·설정 화면 대비
