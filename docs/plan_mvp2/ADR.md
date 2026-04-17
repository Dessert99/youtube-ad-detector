# ADR: youtube-ad-detector MVP (plan_mvp2)

각 ADR은 **결정 / 이유 / 대안 / 거부 이유 / 트레이드오프** 5필드.

---

## ADR-001: rule 엔진 실행 위치 — 확장 단독

- **결정**: rule 엔진(`shared.analyze()`)은 확장 프로그램 background service worker에서 실행한다. 서버는 호출하지 않는다.
- **이유**: 프라이버시(자막·videoId 외부 전송 금지), 지연 없음, 서버 운영비 0.
- **대안**:
  - (A) 서버 경유: 확장이 자막을 서버로 보내 서버가 분석.
  - (B) 하이브리드: 1차는 확장, 미확정 케이스만 서버.
- **거부 이유**:
  - (A) 프라이버시 원칙 위배, Next.js 서버를 분석 파이프라인으로 확장 → CLAUDE.md "복잡한 서버 로직 불필요" 위배.
  - (B) MVP에 AI 2차 판별이 없어 서버를 둘 이유 없음. post-MVP로 이월.
- **트레이드오프**: rule 업데이트가 확장 재배포(크롬 웹스토어 심사) 사이클에 묶임. 긴급 패치 지연 가능.

---

## ADR-002: 폴더 구조 — `extension/` + `next/` + `shared/`

- **결정**: 루트 직속 3개 디렉터리. `extension/`(plasmo), `next/`(Next.js 16), `shared/`(pure TS 공유).
- **이유**: 의존성 분리 명확, 각각 독립 빌드·배포. TROUBLESHOOTING.md BLOCK #7~#8에서 npm workspaces 루트 호이스트가 React 버전 분열을 일으킨 실패를 구조적으로 회피.
- **대안**:
  - (A) npm workspaces 모노레포(`apps/*`, `packages/*`).
  - (B) `extension/` 내부에 공유 코드를 포함, next는 자체 복제.
- **거부 이유**:
  - (A) BLOCK #8 재현 리스크(루트 호이스트 경로로 React 인스턴스 중복).
  - (B) rule JSON과 타입 정의가 두 곳에서 drift. 배포 순서 오류 시 rule 설명과 결과가 불일치.
- **트레이드오프**: `shared` 갱신 시 extension·next 각각 `npm install` 재실행 필요. 완전 자동 동기화 없음.

---

## ADR-003: shared 참조 프로토콜 — `file:../shared`

- **결정**: extension·next의 `package.json`에서 `"@yad/shared": "file:../shared"`로 참조. workspaces 필드 미사용.
- **이유**: npm 10+는 `file:` 프로토콜을 nested `node_modules`로 설치(호이스트 회피). BLOCK #8의 실제 수정 경로.
- **대안**:
  - (A) npm workspaces.
  - (B) private npm publish.
- **거부 이유**:
  - (A) BLOCK #7/8 반복 위험.
  - (B) MVP에 배포 인프라 오버헤드. 빠른 iteration 저해.
- **트레이드오프**: `shared` 수정 후 install 재실행 필요(watch mode 없음). 개발 중 번거로움.

---

## ADR-004: Next.js 버전 — 16

- **결정**: Next.js 16 채택. CLAUDE.md의 "15" 표기는 post-doc chore로 정정.
- **이유**: 사용자 확정 지시(프롬프트). App Router 기본, React 19.
- **대안**: (A) Next.js 15 — 안정성·기존 레퍼런스.
- **거부 이유**: 사용자가 16 명시. 2026-04-18 시점 16은 릴리즈 성숙 단계로 수용 가능.
- **트레이드오프**: 16의 신규 변경점(Turbopack 기본화 등) 관련 미지 이슈 발생 가능. Vitest 등 도구 호환성 점검 필요.

---

## ADR-005: React 버전 분리 — shared는 pure TS, extension·next 독립

- **결정**: `shared`는 React·DOM·chrome API 의존 일체 금지(pure TS). `extension`은 plasmo 최신 버전이 수용하는 React(현재 plasmo가 React 19 peer 지원하면 19, 안 하면 18 유지 가능). `next`는 Next.js 16이 요구하는 React 19. 둘은 **독립된 `node_modules/react`** 경로를 가진다.
- **이유**: BLOCK #8 근본 원인은 단일 프로세스에 React 인스턴스가 둘 로드된 것. workspaces 해제 + shared pure TS로 구조적 방지.
- **대안**:
  - (A) 전체 React 19로 강제 정렬.
  - (B) shared에 React 컴포넌트 포함.
- **거부 이유**:
  - (A) plasmo 0.90.5가 React 18 strict peer를 요구한 전례(BLOCK #8). plasmo 최신이 19를 받아들인다는 보장이 2026-04-18 시점 사전 확정 불가 → harness 1차 step에서 실측 필요.
  - (B) React 호이스트 충돌 재발 경로.
- **트레이드오프**: shared에서 UI 컴포넌트 재사용 불가. 확장 UI와 보고서 UI가 각자 독립 구현.

---

## ADR-006: 배지 상태 — 3-state 한국어 라벨

- **결정**: `safe` / `caution` / `fraud` 세 상태. UI 한국어 라벨 "안전" / "미확인" / "의심". tooltip으로 "탐지기이며 최종 판정 아님" 고지.
- **이유**: rule-miss(분석 성공, 매치 0)를 `safe`로 표시하면 "완전 안전"의 오해 발생. `caution`(미확인)으로 중립 유지. post-MVP AI 2차 판별 붙을 때 `caution` → `safe`/`fraud`로 자연 확장.
- **대안**:
  - (A) 2-state: safe / fraud.
  - (B) 1-state: fraud만 표시.
- **거부 이유**:
  - (A) 사용자 오해(탐지기가 안전 보증하는 것처럼 인식) 리스크.
  - (B) 탐지·분석 동작 자체가 비가시적 → 사용자 신뢰 형성 어려움.
- **트레이드오프**: 3-state UX 학습 비용. tooltip·보고서로 보완 필요.

---

## ADR-007: 보고서 URL 방식 — hash fragment + CSR

- **결정**: 분석 결과를 `REPORT_URL#data=<LZ+base64url>` hash fragment로 전달. Next.js 16은 빈 쉘을 SSR하고 `use client` 컴포넌트가 `window.location.hash`를 디코드하여 렌더.
- **이유**: hash fragment는 브라우저가 서버에 전송하지 않는다 → Next.js access log에 분석 결과가 기록되지 않음 → "외부 서버 전송 X" 프라이버시 원칙 일관성. SSR 포기 비용은 MVP 수준에서 무시 가능.
- **대안**:
  - (A) URL query `?data=...` + SSR.
  - (B) 서버 POST로 결과 저장 후 reportId로 조회.
- **거부 이유**:
  - (A) access log·리퍼러에 노출. 호스팅 사업자별 로그 비활성화가 불완전·의존적.
  - (B) 서버 상태 발생 → "복잡한 서버 로직 불필요"(CLAUDE.md) 위배, DB/세션 관리 오버헤드, privacy 저하.
- **트레이드오프**: 보고서 SEO/OG 프리뷰 불가(데이터가 hash에만 존재). 링크를 SNS에 공유하면 서버는 그 내용을 모름.

---

## ADR-008: 자막 추출 경로 — MAIN world + playerResponse

- **결정**: Plasmo content script에 `world: "MAIN"` 설정으로 `window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks[].baseUrl` 추출 → isolated world로 postMessage → baseUrl fetch → Cue[] 파싱.
- **이유**: 유튜브는 공개 자막 API 엔드포인트를 보장하지 않음. videoId만으로 `/api/timedtext`를 때려도 빈 응답이 잦음. playerResponse의 signed baseUrl이 사실상 표준 경로.
- **대안**:
  - (A) DOM scraping (`.ytp-caption-segment`).
  - (B) `/api/timedtext?v={id}&lang=ko` 직출.
- **거부 이유**:
  - (A) 사용자가 자막을 켜야 하고, 라이브로 읽음 → 영상 전체 자막 확보 불가, 분석 지연.
  - (B) 빈 응답·404 빈도 높음. 문서화되지 않은 엔드포인트.
- **트레이드오프**: MAIN world 주입은 페이지 스크립트와 같은 컨텍스트 → 보안 민감. 최소 권한(playerResponse 읽기 + postMessage 릴레이)으로 제한.

---

## ADR-009: 매칭 위치 저장 — start_ms/end_ms 포함

- **결정**: 각 `Match`에 `{text, ruleId, start_ms, end_ms}` 저장. 보고서에서 타임스탬프 클릭 → `youtube.com/watch?v={id}&t={s}s`로 점프.
- **이유**: PRD 포지셔닝(근거 제시기) 핵심 가치. 타임스탬프 없으면 사용자가 매칭 표현을 영상에서 직접 검증할 방법이 없음 → 시스템의 존재 이유가 흔들림.
- **대안**: (A) ruleId·text만 저장.
- **거부 이유**: payload 크기는 작아지지만 검증 경로 상실. 사용자 신뢰 구축 실패.
- **트레이드오프**: payload 크기 증가(각 Match당 16~20 bytes). cap 50 + LZ 압축으로 흡수 가능.

---

## ADR-010: URL payload 제한 — LZ-string + base64url + cap 50 + ruleId dedup

- **결정**: `encodePayload()`는 AnalyzeResult를 JSON → LZ-string compressToEncodedURIComponent(base64url 안전). matches는 최대 **50개** cap, 동일 `ruleId`는 최대 **5회**까지(초과 시 신뢰도 상위 유지). cap 초과분은 `truncated: N` 카운터.
- **이유**: 브라우저별 URL 길이 한계(Chrome ~2MB, 안전 기준 ~8KB) 내에서 작동. 1시간+ 영상도 지원. ruleId dedup은 "같은 키워드 반복"으로 cap 소진을 방지.
- **대안**:
  - (A) 미압축 + cap 20.
  - (B) 서버 저장으로 전환.
- **거부 이유**:
  - (A) 장시간 영상에 부족, cap 소진 가속.
  - (B) ADR-007 근거로 서버 저장 회피.
- **트레이드오프**: LZ-string 의존(~5KB). 디코드 시 런타임 스키마 검증(Zod) 추가 필요.

---

## ADR-011: 광고성 prefilter — disclaimer 키워드 가중치

- **결정**: 본문/자막에 "광고·협찬·유료·AD·sponsored" disclaimer 키워드 존재 시 adSignal=true. rule match 결과에 가중치 적용: adSignal=true + match ≥ 1 → `fraud`. adSignal=false + match ≥ 1 → `caution`으로 강등. match = 0 → 항상 `caution`(rule-miss).
- **이유**: 전 영상 스캔은 일반 건강 정보 영상에서도 "100% 안전" 같은 문구 오탐 가능. 광고성 신호 없는 매치는 사용자에게 과도한 경고.
- **대안**:
  - (A) 순수 rule match만 사용.
  - (B) hard prefilter — disclaimer 없으면 아예 스캔 안 함.
- **거부 이유**:
  - (A) false-positive 폭증. 신뢰도 저하.
  - (B) under-detection. 은밀한 광고 영상 놓침.
- **트레이드오프**: "광고" 단어가 본문에 우연히 존재할 경우 adSignal 오탐 가능. seed 키워드 튜닝 필요.

---

## ADR-012: 자막 없음/실패 처리 — silent fail

- **결정**: 자막 트랙 없음 / fetch 타임아웃(2s) / parse 예외 / analyze throw / MAIN world 응답 대기 타임아웃(1s) 모두 배지를 표시하지 않는다. `console.debug`에만 로그.
- **이유**: 본 확장의 1차 원칙은 시청 경험 저해 금지. 에러 배지는 사용자에게 무의미한 경고.
- **대안**: (A) "분석 실패" 배지 노출, (B) 재시도 루프.
- **거부 이유**:
  - (A) 사용자 피로.
  - (B) 네트워크 리소스 낭비, 서비스 워커 수명 초과 가능.
- **트레이드오프**: 분석 실패를 사용자가 모름. 디버깅은 개발자 도구로만 가능.

---

## ADR-013: 권한 범위 — 최소

- **결정**: Manifest V3.
  - `host_permissions`: `https://*.youtube.com/*`
  - `permissions`: `storage`(session 캐시), `scripting`(MAIN world 주입), `webNavigation`(URL 변경 감지 보조)
  - `content_scripts` 매처: `https://www.youtube.com/watch*`, `https://www.youtube.com/shorts/*`
- **이유**: 크롬 웹스토어 심사에서 권한 범위는 거절 사유 상위. 최소화.
- **대안**: (A) `<all_urls>`, (B) `activeTab`만.
- **거부 이유**:
  - (A) 과도, 심사 리스크.
  - (B) `yt-navigate-finish` 이벤트 구독이 activeTab 클릭 없이 발동해야 함 → host_permissions 필수.
- **트레이드오프**: googlevideo.com 등 caption baseUrl이 타 도메인일 가능성은 2026-04-18 현재 미확인. 실측 시 필요하면 권한 추가(ADR 추가).

---

## ADR-014: rule 포맷 — JSON + semver ruleVersion

- **결정**: `shared/src/rules/v0.1.json` 구조:
  ```json
  {
    "version": "v0.1",
    "rules": [
      {"id": "health-001", "pattern": "100%\\s*안전", "description": "...", "lawRef": "식약처 고시 ..."}
    ]
  }
  ```
  extension·next 모두 이 파일을 import. 버전은 semver.
- **이유**: JSON은 런타임 로드·직렬화 용이. 정규식은 string으로 보관 후 `new RegExp(pattern)`.
- **대안**: (A) YAML, (B) TypeScript 하드코드, (C) 외부 설정 서버.
- **거부 이유**:
  - (A) 파서 추가, 이득 없음.
  - (B) 런타임 교체 불가, next가 쉽게 import 못함.
  - (C) 서버 의존성 도입, privacy 이슈.
- **트레이드오프**: 정규식 escape 이슈(이중 backslash). seed 규칙 수 10~20개 수준에서는 감당 가능.

---

## ADR-015: SPA 감지 — yt-navigate-finish + debounce

- **결정**: MAIN world content script가 `document.addEventListener('yt-navigate-finish', handler)`. 500ms debounce + videoId 변경 가드(동일 videoId 재발화 무시).
- **이유**: 유튜브 자체 네비게이션 완료 이벤트가 가장 정확. `onHistoryStateUpdated`는 pre-roll 광고 전환 등 노이즈 발생.
- **대안**: (A) `chrome.webNavigation.onHistoryStateUpdated`, (B) MutationObserver, (C) setInterval polling.
- **거부 이유**:
  - (A) 노이즈, 중복 분석.
  - (B) 성능·복잡도.
  - (C) 안티패턴.
- **트레이드오프**: `yt-navigate-finish`는 유튜브 내부 API이며 이름·동작 변경 시 확장이 파손. MAIN world 접근성 영향.

---

## ADR-016: 테스트 전략 — Vitest unit + 수동 checklist

- **결정**: MVP 자동화 테스트는 `shared/src/analyze.ts` Vitest unit만. fixture 자막(JSON) + 기대 match 세트. extension/next은 수동 smoke checklist(PRD 명시).
- **이유**: MVP 1차 배포 속도 우선. Playwright e2e는 유튜브 페이지 UI가 자주 바뀌어 테스트 유지비가 가치를 초과.
- **대안**: (A) Playwright e2e 포함, (B) Cypress.
- **거부 이유**: (A)(B) 유지비·CI 복잡도.
- **트레이드오프**: UI 회귀 자동 감지 불가. 수동 checklist 의존.

---

## ADR-017: 매직 넘버 seed 명시

- **결정**: 다음 값은 모두 **seed**. 1차 배포 후 실측 기반 보정.
  - **100ms**: 자막 파싱 + analyze p95 성능 예산
  - **2s**: 자막 baseUrl fetch 타임아웃
  - **500ms**: SPA navigation debounce
  - **1s**: MAIN world 응답 대기 타임아웃
  - **50**: URL payload matches cap
  - **5**: 동일 ruleId 최대 매치 수
  - **5건**: `chrome.storage.session` 최근 분석 캐시 수
- **이유**: 실측 전 추정치. 문서화 없이 하드코드하면 시니어 리뷰에서 "근거 없음" 지적 반복.
- **대안**: 측정 완료 후 확정 값 고정.
- **거부 이유**: 측정 데이터 없음(MVP 1차 배포 전).
- **트레이드오프**: 향후 실측에서 큰 조정이 있을 수 있음. seed 표시로 "확정 아님" 고지.
