# 아키텍처: youtube-ad-detector MVP (plan_mvp2)

## 디렉터리 구조

```
false-advertisement/
├── extension/                        # 크롬 확장 (plasmo)
│   ├── package.json                  # "@yad/shared": "file:../shared"
│   ├── plasmo 설정·매니페스트
│   └── src/
│       ├── background.ts             # service worker: 메시지 라우팅, 분석 실행
│       ├── contents/
│       │   ├── main-world.ts         # world: "MAIN". playerResponse + yt-navigate-finish 릴레이
│       │   └── badge.ts              # isolated world. 자막 fetch, 배지 DOM 주입
│       └── config.ts                 # REPORT_URL 등 빌드 타임 상수
│
├── next/                             # Next.js 16 보고서 웹 (React 19)
│   ├── package.json                  # "@yad/shared": "file:../shared"
│   ├── next.config.js
│   └── app/
│       └── report/
│           └── [videoId]/
│               └── [ruleVersion]/
│                   ├── page.tsx      # 빈 SSR 쉘 + noindex 메타
│                   └── report.client.tsx  # use client: hash 디코드 + 렌더
│
├── shared/                           # pure TS (no React, no DOM, no chrome API)
│   ├── package.json                  # name: "@yad/shared", main: dist/index.js
│   ├── tsconfig.json
│   └── src/
│       ├── analyze.ts                # rule 엔진. analyze(cues, ruleVersion, adSignal) → AnalyzeResult
│       ├── prefilter.ts              # 광고성 disclaimer 탐지 → adSignal
│       ├── payload.ts                # encodePayload / decodePayload (LZ + base64url + Zod)
│       ├── types.ts                  # Cue, Match, AnalyzeResult, BadgeState
│       └── rules/
│           ├── v0.1.json             # seed rule set
│           └── index.ts              # ruleVersion → rule 로더
│
├── docs/
│   ├── _template/
│   ├── plan_mvp2/                    # 본 문서 세트
│   └── plans-index.json
│
└── tools/harness/                    # 오케스트레이터 (기존)
```

**의존성 방향 (단방향 강제)**
- `shared` ← `extension`, `shared` ← `next`
- `extension` ↔ `next` 상호 참조 금지
- `shared`는 어떤 것도 import하지 않음(외부 lib는 LZ-string, Zod 정도만)

## 경계와 계약

### `shared/` 경계
- **금지**: React, DOM, window, document, chrome API, fetch, Node `fs`.
- **허용**: pure 로직, 동기 함수, 타입 정의, JSON import.
- **공개 API**:
  ```ts
  analyze(cues: Cue[], ruleVersion: string, adSignal: boolean): AnalyzeResult
  applyAdWeight(result: AnalyzeResult, adSignal: boolean): AnalyzeResult  // 내부에서 사용
  detectAdSignal(cues: Cue[], pageMetadata: PageMetadata): boolean
  encodePayload(result: AnalyzeResult): string       // LZ + base64url
  decodePayload(hash: string): AnalyzeResult         // Zod 검증
  getRuleSet(ruleVersion: string): RuleSet | null    // 버전 조회
  ```

### `extension/` 경계
- **허용**: DOM, chrome API, fetch, shared import.
- **책임**: MAIN world 주입, 자막 fetch, 분석 트리거, 배지 UI, 보고서 링크 오픈.
- **React 버전**: plasmo 최신이 수용하는 버전(19 우선, 호환 불가 시 18). `next`와 독립.

### `next/` 경계
- **허용**: Next.js 16 API, React 19, shared import.
- **금지**: 서버 DB, API route(불필요), shared 외부 로직 재구현.
- **책임**: `/report/[videoId]/[ruleVersion]` 경로만. SSR은 빈 쉘 + `noindex` 메타 + 클라이언트 번들 로드. 클라이언트가 hash 디코드·렌더·법 조항 표시.
- **금지 페이지**: `/api/*`, `/admin`, 사용자 계정 관련 일체.

## 데이터 모델

```ts
// shared/src/types.ts
type Cue = { text: string; start_ms: number; end_ms: number }

type Match = {
  ruleId: string
  text: string          // 매칭된 자막 구간 원문
  start_ms: number
  end_ms: number
}

type BadgeState = "safe" | "caution" | "fraud"

type AnalyzeResult = {
  videoId: string
  ruleVersion: string
  state: BadgeState
  matches: Match[]       // cap 50, ruleId당 최대 5
  truncated: number      // cap 초과로 잘린 개수
  adSignal: boolean
}

type RuleSet = {
  version: string
  rules: Array<{
    id: string
    pattern: string      // regex source
    description: string
    lawRef: string       // "식약처 건강기능식품 표시·광고 심의 기준 N조"
  }>
}
```

## 데이터 흐름 (해피 패스)

```
[유튜브 페이지]
    │
    ├─ 1. MAIN world script 주입 (plasmo contents/main-world.ts)
    │      - document.addEventListener('yt-navigate-finish', handler)
    │      - handler: window.ytInitialPlayerResponse 추출
    │      - window.postMessage({type:'YAD_PLAYER_RESPONSE', videoId, captionTracks}, '*')
    │
    ├─ 2. Isolated world script (contents/badge.ts) 수신
    │      - window.addEventListener('message', ...)
    │      - 500ms debounce + videoId 변경 가드
    │      - 한국어 caption baseUrl 선택(수동 > 자동)
    │      - fetch(baseUrl) → XML/JSON 파싱 → Cue[]
    │
    ├─ 3. background service worker로 sendMessage({cues, ruleVersion, pageMetadata})
    │      - shared.detectAdSignal(cues, metadata) → adSignal
    │      - shared.analyze(cues, ruleVersion, adSignal) → AnalyzeResult
    │      - chrome.storage.session에 최근 5건 캐시
    │      - sendResponse(AnalyzeResult)
    │
    ├─ 4. badge.ts가 AnalyzeResult 수신 → 3-state 배지 DOM 주입
    │      - state별 색 + 한국어 라벨 + ARIA label + tooltip
    │      - 유튜브 플레이어 우상단 등 비방해 위치
    │
    └─ 5. 사용자 배지 클릭
           - shared.encodePayload(result) → LZ+base64url
           - url = `${REPORT_URL}/report/${videoId}/${ruleVersion}#data=${encoded}`
           - chrome.tabs.create({url}) → 새 탭

[Next.js 보고서]
    └─ 6. SSR 빈 쉘 + noindex 메타 + 클라이언트 번들
           - report.client.tsx: window.location.hash.slice(6) → decodePayload
           - Zod 런타임 가드 통과 시 렌더
           - 매치별 타임스탬프 → `https://www.youtube.com/watch?v=${id}&t=${sec}s` 링크
           - rule 정의(shared/rules/${ruleVersion}.json)에서 description·lawRef 병합 표시
```

## 데이터 흐름 (실패 경로, 모두 silent)

| # | 지점 | 조건 | 동작 |
|---|---|---|---|
| F1 | MAIN world 주입 | playerResponse 없음(1s 타임아웃) | 배지 미표시, console.debug |
| F2 | Caption track | ko(manual/auto) 없음 | 배지 미표시 |
| F3 | Caption fetch | 네트워크 오류·2s 타임아웃 | 배지 미표시 |
| F4 | Parse | XML/JSON 예외 | 배지 미표시 |
| F5 | analyze | throw(정규식 오류 등) | 배지 미표시, 해당 rule skip 후 재시도 없음 |
| F6 | 보고서 디코드 | Zod 검증 실패(손상된 hash) | "데이터 손상" 안내 |
| F7 | ruleVersion 불일치 | shared에 해당 ruleVersion 파일 없음 | "버전 동기화 중" 안내 |

## 패턴

- **Manifest V3 service worker**: persistent X, 이벤트 드리븐. 30s idle 후 종료되나 rule JSON 재파싱은 수 ms.
- **MAIN/isolated 이원 content script**: playerResponse 접근은 MAIN, DOM 조작·chrome API는 isolated. `window.postMessage` bridge.
- **sendMessage / sendResponse**: content script ↔ background. Promise 기반.
- **chrome.storage.session**: 최근 분석 결과 캐시(디버그용, 프라이버시 보장).
- **CSR over hash fragment**: 프라이버시 우선. SSR은 빈 쉘만.

## 성능 예산 (seed, ADR-017)

| 지표 | seed | 의미 |
|---|---|---|
| 분석 p95 | < 100ms | 자막 파싱 + analyze |
| MAIN world 응답 | < 1s | playerResponse 캡처까지 |
| Caption fetch | < 2s | baseUrl → Cue[] |
| 압축 payload | < 4KB | LZ 후 URL 안전 길이 |
| matches cap | 50 | URL 파손 방지 |
| ruleId당 | 최대 5 | dedup, cap 소진 방지 |
| SPA debounce | 500ms | 중복 분석 방지 |
| 캐시 | 최근 5건 | chrome.storage.session |

## 버전 관리 및 배포

- `ruleVersion`은 `shared/src/rules/v*.json` 파일명으로 고정. semver.
- **동시 배포 절차** (rule 갱신 시):
  1. `shared/src/rules/vX.Y.json` 추가
  2. `extension/` → `npm install` (file:../shared 재해석)
  3. `next/` → `npm install`
  4. extension 빌드 + 크롬 웹스토어 제출
  5. next 배포(Vercel 등)
  6. **extension 심사 완료 시점과 next 배포가 맞물려야** 신구 버전이 동시 서비스 가능
- **비동시 배포 fallback**: next가 해당 ruleVersion 파일이 없으면 "버전 동기화 중입니다" 페이지 렌더(F7).

## 보안

- **MAIN world 스크립트 최소화**: playerResponse 읽기 + postMessage 릴레이만. 사용자 쿠키·토큰 접근 금지.
- **postMessage origin 검증**: isolated world는 `event.source === window && event.data.type === 'YAD_*'`만 수용.
- **Zod 런타임 가드**: `decodePayload`는 반드시 Zod 스키마 검증 통과해야 렌더. prototype pollution·XSS 방지.
- **Content Security Policy**: next 보고서 페이지는 `default-src 'self'`. 외부 스크립트·이미지 금지.
- **권한 설명**: 크롬 웹스토어 제출 시 "유튜브 자막 분석을 위해 youtube.com 접근 필요"로 명시.

## 외부 의존 라이브러리 (MVP)

- `shared`: `lz-string`, `zod`
- `extension`: plasmo, `@yad/shared` (+ plasmo 전제 React)
- `next`: Next.js 16, React 19, `@yad/shared`

## 확장 지점 (post-MVP 힌트, 구현 안 함)

- AI 2차 판별: `shared/src/analyze.ts`가 rule-miss 케이스를 반환 시 background가 서버 API 호출 가능(추후 추가). `caution` → `safe`/`fraud`로 결정 가능.
- 보고서 LLM 작성: next 보고서 페이지에 서버 컴포넌트(혹은 클라이언트 fetch)로 rule match 요약 생성. hash fragment 원칙을 유지하려면 클라이언트 fetch.
- rule 동적 로딩: 현재 bundled. 서버에서 fetch하는 방식으로 전환 가능하나 프라이버시·무결성 트레이드오프 발생.
