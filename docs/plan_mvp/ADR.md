# ADR: YouTube Ad Detector MVP

## ADR-001: rule 엔진을 확장에서 단독 실행 (서버 경유 제거)
결정: 자막 추출·rule 매칭·3-zone 라우팅을 모두 크롬 확장(plasmo)에서 수행. Next.js는 보고서 스텁 페이지만 서빙한다.
이유: (1) **프라이버시** — 자막 원문과 판정 결과가 사용자 브라우저를 떠나지 않아 Chrome Web Store 심사·사용자 신뢰에 유리. (2) **비용·지연** — 서버 왕복 제거로 배지 표시 지연 최소화, MVP 동안 서버 인프라 운영·스케일링 필요 없음. 대안(서버 실행)은 룰 핫스왑이 쉬우나 프라이버시 비용이 크고 MVP 가치 대비 과함.
트레이드오프: 룰 업데이트에 확장 재배포가 필요(Chrome Web Store 심사 수 시간~수 일). 포스트-MVP에서 AI 2차 판별·룰 핫스왑이 필요해지면 "애매 구간만 서버 위임" 같은 하이브리드로 경계를 다시 그려야 함.

## ADR-002: 3-zone 가중치 스코어링 (MVP에서는 사실상 2-zone으로 합산)
결정: riskScore를 세 구간으로 나눈다.
- Low: 총점 < 20 → `verdict: safe`
- Mid: 20 ≤ 총점 < 60 → **(MVP)** `fraud`로 합산 / **(포스트-MVP)** AI 2차 판별에 위임
- High: 총점 ≥ 60 → `verdict: fraud`

임계값 `20 / 60`은 이번 배포의 **seed 값**이며 실사용·seed 샘플 피드백으로 조정한다. 구조적으로 3-zone을 유지하는 이유는 포스트-MVP에서 Mid 구간을 AI로 분기하기 위한 확장 포인트를 미리 만들어 두기 위함이다.
이유: MVP에는 2차 판별이 없으므로 Mid를 fraud 쪽으로 내려 false negative를 우선 막는다. 2-zone(safe/fraud 단일 임계값)은 구현이 더 간단하지만 Mid 개념이 없어 포스트-MVP에서 AI 분기를 넣을 때 구조를 갈아엎어야 함.
트레이드오프: MVP 동안 false positive 가능. riskScore 원값은 항상 보존하여 UI·보고서에서 "애매(Mid)"와 "강한 위법(High)"의 질적 차이를 드러낼 여지를 남긴다.

## ADR-003: 최소 시드 룰 10~20개 하드코딩 (단순 매칭 + 룰별 가중치 없음)
결정: 건강식품·다이어트 강한 위법 표현 10~20개를 `shared/src/rules.ts`에 하드코딩. 매칭은 키워드 단순 포함(`String.prototype.includes`)만 사용하고 정규식·컨텍스트 윈도우·부정어 처리는 하지 않는다. 5개 `LawCategory`(food_labeling, health_functional, medical_device, medical_act, fair_trade)에 분산한다. **룰별 `riskWeight` 필드는 두지 않는다.** 각 룰은 `id`, `category`, `keywords`, `description`만 갖는다. `riskScore`는 **고유 매칭 룰 개수 × 20** 으로 산출하고 상한 100으로 클램프한다 (0건=0, 1건=20, 2건=40, 3건+=60+).
이유: MVP 목적은 파이프라인(자막→rule→배지→보고서 링크) 검증. 룰별 가중치 미세 조정은 20~30개 seed 샘플로 튜닝할 수 없고, "단정인데 왜 낮냐" 같은 조정 토론이 반복돼 설계 일관성을 훼손한다. 카테고리별 중대성 반영은 AI 2차 판별(post-MVP)의 영역이다. ADR-002의 임계값 20/60과 맞물려 "단독 매칭=Mid→fraud, 3건 누적=High" 흐름이 자연스럽다.
트레이드오프: food_labeling 1건과 fair_trade 1건이 동일 점수(20). 실제 위법 강도 차이를 반영하지 못함 → false positive 가능. post-MVP AI 분기에서 카테고리 중대성·문맥을 반영해 보완한다.

## ADR-004: Fail-safe 우선 — 에러 시 UI 미표시, 유튜브 방해 금지
결정: 자막 fetch 실패·JSON 파싱 실패·rule 엔진 예외·DOM 접근 실패 등 모든 예외 경로는 배지를 표시하지 않는 것으로 폴백한다. content script는 try/catch로 모든 외부 호출을 감싸고, 예외는 console.warn만 남기고 삼킨다.
이유: 유튜브는 SPA이고 DOM·전역 객체가 언제든 바뀔 수 있다. 사용자 입장에서 "광고 탐지기 때문에 유튜브가 깨졌다"는 경험은 즉시 언인스톨 사유다. 잘못된 판정 표시보다 판정 생략이 훨씬 안전하다.
트레이드오프: 에러 원인 가시성이 낮아 디버깅이 어려움. 포스트-MVP에서 옵트인 진단 로그 또는 에러 리포팅 메커니즘이 필요.

## ADR-005: 한국어 자막 트랙 우선순위 — 원본 ko > ko-*, 자동 생성은 fallback
결정: `ytInitialPlayerResponse.captions`에서 `languageCode`가 `ko`로 시작하는 트랙 중 `kind !== 'asr'`(비자동 생성)을 최우선 선택. 없으면 `kind === 'asr'`인 자동 생성 한국어 트랙을 fallback. 한국어 트랙이 없으면 스킵(UI 미표시).
이유: 자동 생성 자막은 오탈자·구두점 누락이 많아 키워드 매칭 정확도를 떨어뜨림. 대안(모든 언어 탐지)은 룰이 한국어 전용이므로 의미 없음.
트레이드오프: 한국어 업로더가 자막을 달지 않고 자동 생성도 꺼둔 영상은 분석 불가. MVP 범위상 허용.

## ADR-006: Manifest V3, 호스트 권한은 `*.youtube.com`에 한정
결정: plasmo 기본 설정을 Manifest V3로 사용. `host_permissions`는 `https://*.youtube.com/*`만 선언. `tabs` 권한은 `chrome.tabs.create`를 위해 필요 시 추가.
이유: Chrome Web Store의 MV3 강제 전환 방침. 최소 권한은 심사·사용자 신뢰에 유리. 대안(`<all_urls>`)은 MVP에 불필요하고 심사·사용자 경고에 불리.
트레이드오프: 포스트-MVP에서 다른 영상 플랫폼(쇼츠 외 도메인·임베드)으로 확장 시 manifest 수정·재배포 필요.

## ADR-007: 보고서 URL에 `ruleVersion` 포함, MVP는 스텁 페이지만 렌더
결정: 보고서 URL은 `/report/{videoId}/{ruleVersion}` 형식. MVP에서는 `videoId`·`ruleVersion` 메타와 "상세 보고서는 추후 제공" 문구만 SSR로 렌더. `ruleVersion`은 SemVer로 관리하고 `shared/src/rules.ts`에서 export한다.
이유: 같은 영상도 룰 버전이 바뀌면 판정이 달라진다. URL에 버전을 박아 "판정의 재현성·공유가능성"을 1일차부터 보장. 대안(쿼리 파라미터)은 공유·캐시 관점에서 동등하지만 라우팅 명시성이 떨어짐.
트레이드오프: 과거 ruleVersion URL은 포스트-MVP에서 의도적 404 또는 "지원 종료된 버전" 안내가 필요. 사용자가 공유한 오래된 링크가 깨질 수 있음.

## ADR-008: 모노레포 도구 없이 `file:` 프로토콜로 `shared` 공유
결정: 루트에 npm workspaces·turborepo·pnpm workspace를 쓰지 않는다. `extension/`, `next/`는 각자 `node_modules`를 가지며 `shared/`를 `"@yad/shared": "file:../shared"`로 import.
이유: "복잡한 서버 로직 없음" 전제라 모노레포 도구의 러닝·설정 비용이 이득보다 큼. 각 앱이 독립 설치·빌드되어 CI·배포가 단순.
트레이드오프: `shared` 변경 시 각 앱에서 `npm install` 재실행 필요. 공통 devDependency 중복 존재. 팀 규모가 커지면 모노레포 도구 도입을 재검토해야 함.
