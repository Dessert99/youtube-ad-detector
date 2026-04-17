# 아키텍처

## 디렉터리 구조
```
false-advertisement/
├── extension/                  # plasmo 크롬 확장 (@yad/extension)
│   ├── contents/
│   │   ├── youtube.ts          # videoId 감지, SPA 네비 훅, 배지 DOM 렌더
│   │   └── transcript.ts       # ytInitialPlayerResponse → 한국어 자막 추출
│   ├── background.ts           # OPEN_REPORT 메시지 수신 → chrome.tabs.create
│   └── lib/config.ts           # API_BASE_URL 등 런타임 상수
├── next/                       # Next.js 15 보고서 웹 (@yad/next)
│   └── app/report/[videoId]/[ruleVersion]/page.tsx   # MVP 스텁 SSR
├── shared/                     # 순수 TS 모듈 (@yad/shared, file: 프로토콜)
│   └── src/
│       ├── types.ts            # LawCategory, Verdict, TranscriptSegment, Finding, AnalyzeResult
│       ├── rules.ts            # RULES: Rule[] (시드 10~20개), RULE_VERSION (SemVer)
│       ├── analyze.ts          # analyze(segments): AnalyzeResult (순수함수 + 3-zone 라우터)
│       └── index.ts            # re-export
├── docs/                       # PRD·ADR·ARCHITECTURE·phases
└── tools/                      # harness 오케스트레이터
```

## 패턴

### 경계 · 계약 (Boundary & Contract)
- **shared** = 순수 로직. 외부 I/O·DOM·chrome API를 참조하지 않는다. 입력은 `TranscriptSegment[]`, 출력은 `AnalyzeResult`.
- **extension** = I/O 경계. DOM·chrome API·유튜브 전역 객체를 다루고, 판정이 필요할 때 `shared`의 `analyze()`만 호출한다.
- **next** = 보고서 렌더 경계. 라우팅 파라미터(`videoId`·`ruleVersion`)만 수신하고, MVP에서는 저장소·서버 분석 API를 두지 않는다.
- 이 경계 덕에 `analyze()`는 Node/Jest에서 테스트 가능하고, 확장·서버 어디서 호출해도 동일 결과를 낸다.

### 순수함수 + 결정적 판정
`analyze(segments, rules, ruleVersion)`은 동일 입력 + 동일 `RULE_VERSION`이면 동일 출력. 보고서 URL에 `ruleVersion`을 포함함으로써 "판정 재현성"이 URL 수준에서 보장된다.

### 3-zone 라우터
riskScore → `safe` / `fraud` 매핑을 단일 함수로 고립. MVP에서는 Mid→fraud 합산이지만 포스트-MVP에서 Mid만 AI 분기로 빼낼 수 있도록 구간 정보를 `AnalyzeResult`에 함께 내보낸다.

### 2-state 배지 UI
verdict는 두 상태만: `safe` / `fraud`. 배지 DOM은 id `yad-badge`로 고정해 SPA 네비게이션 시 중복 렌더를 방지. `fraud`일 때만 "자세히 보기" 링크 노출.

### Fail-safe 기본값
자막 fetch·파싱·rule 엔진·DOM 접근의 모든 예외는 UI 미표시로 귀결. 어떤 예외도 유튜브 페이지를 방해하지 않는다. try/catch 경계는 content script 진입점에서 넓게 두고, 세부 경로에서는 예외를 상위로 던진다.

### SPA 네비게이션 대응
유튜브는 SPA이므로 페이지 이동 시 content script가 다시 실행되지 않는다. `yt-navigate-finish` 이벤트를 구독하고, `lastAnalyzedVideoId` 가드로 한 영상당 1회만 분석한다.

### 성능 예산
videoId 감지 → 배지 렌더까지 **500ms 이내** (자막 ≤ 1만 자 기준). 자막 fetch 네트워크 시간을 제외한 `analyze()` 자체는 < 50ms 목표. 룰 수가 증가하면 매칭 자료구조(Aho-Corasick 등)를 도입할 수 있으나 MVP는 단순 순회로 충분.

### 룰 버전 전달
`RULE_VERSION`은 `shared/src/rules.ts`의 상수. 확장·웹 둘 다 빌드 타임에 해당 값을 번들. 룰 업데이트는 확장 재배포 + 웹 재배포로만 전달(MVP). 핫스왑 없음.

## 데이터 흐름

### 해피 패스
```
[유튜브 시청 페이지]
 └→ [content/youtube.ts] yt-navigate-finish 구독 → videoId 감지
     └→ [content/transcript.ts] ytInitialPlayerResponse 파싱 → 한국어 트랙 선택 → timedtext fetch
         └→ TranscriptSegment[]
             └→ [shared/analyze.ts] 룰 매칭 → 카테고리별 riskWeight 합산
                 └→ [3-zone 라우터]
                    - 총점 < 20           → verdict=safe
                    - 20 ≤ 총점 < 60 (MVP) → verdict=fraud (Mid→fraud 합산)
                    - 총점 ≥ 60           → verdict=fraud
                 └→ AnalyzeResult { verdict, riskScore, zone, findings, ruleVersion }
                     └→ [content/youtube.ts] 배지 렌더 (id=yad-badge)
                        ├─ safe  : 작은 배지 또는 미표시
                        └─ fraud : 경고 배지 + "자세히 보기"
                                   └→ 클릭 → chrome.runtime.sendMessage(OPEN_REPORT)
                                       └→ [background.ts] chrome.tabs.create(
                                              `${API_BASE_URL}/report/${videoId}/${ruleVersion}`)
                                              └→ [Next.js SSR] 스텁 페이지
                                                 (메타: videoId·ruleVersion / 문구: "상세 보고서는 추후 제공")
```

### 실패 · 스킵 경로
- **자막 트랙 없음** (한국어 트랙 미제공): UI 미표시, 분석 스킵.
- **자막 fetch 실패** (네트워크·403·파싱 오류): console.warn만 남기고 UI 미표시.
- **rule 엔진 예외** (예상 외 입력): UI 미표시, 유튜브 방해 금지.
- **동일 videoId 재진입**: `lastAnalyzedVideoId` 가드로 분석 생략.
- **non-YouTube 페이지**: content script가 주입되지 않음 (manifest host_permissions로 제한).
- **과거 ruleVersion URL 방문**: MVP에서는 의도적 404. 포스트-MVP에서 "지원 종료 버전" 페이지 설계 예정.
