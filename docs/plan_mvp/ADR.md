# ADR: YouTube Ad Detector MVP

## ADR-001: 모노레포 구조
결정: npm workspaces 기반 `apps/extension` + `apps/web` + `packages/shared`
이유: 확장·웹이 공용 타입과 룰 사전을 공유해야 하고, Next.js로 서버와 보고서 웹을 하나로 묶을 수 있으므로 apps 2개 + shared 1개가 최소 구성
트레이드오프: 초기 설정 비용. shared 비대화 위험 → 타입/룰/유틸 외 배치 금지

## ADR-002: 확장 프레임워크
결정: plasmo
이유: 사용자 지정. TS/React/HMR과 Manifest v3를 바로 지원
트레이드오프: 대안(vite-plugin-web-extension 등)보다 커뮤니티가 얇음

## ADR-003: 서버 스택
결정: Next.js 풀스택 (App Router)
이유: MVP에선 보고서 스텁 페이지만 제공하지만, 포스트-MVP에 LLM 중계 API·보고서 렌더 페이지를 같은 배포 단위에 추가할 수 있어 선행 투자 가치가 있음
트레이드오프: 서버리스 환경에서 파일 쓰기 불가 → 보고서 저장 방식은 포스트-MVP에서 결정

## ADR-004: 자막 수집 전략 (재결정)
결정: **확장 단독 수집** — content script가 `ytInitialPlayerResponse.captions`를 파싱해 timedtext URL을 fetch한 뒤 자막을 확장 내부에서 보유
이유: 서버 YouTube Data API `captions.download`는 대부분 영상 소유자 OAuth가 필요해 실사용 불가. 확장은 사용자 세션 맥락에서 player response를 바로 읽을 수 있어 공식 API보다 안정적
트레이드오프: 유튜브가 `ytInitialPlayerResponse` 구조를 바꾸면 일괄 실패. 자막 비활성 영상은 분석 불가(UI 미표시 스킵 정책)
폐기: 이전 "서버 1차 API → 확장 폴백 2차" 2단 구조 폐기

## ADR-005: 분석 결과 캐싱 (폐기)
결정: MVP에선 캐시 불필요
이유: 분석이 확장에서 수행되고 서버는 분석 로직이 없음. 확장 자체의 중복 호출 가드(`lastAnalyzedVideoId`)만으로 충분
후속: 포스트-MVP에 LLM 중계가 들어오면 서버 레이어 캐시 전략을 다시 결정

## ADR-006: 보고서 URL (수정)
결정: `/report/{videoId}/{ruleVersion}` 세그먼트 기반 버전 구분
이유: 룰 사전이 바뀌면 동일 영상의 보고서 내용이 달라짐. URL에 버전을 박아두면 공유 URL이 버전별로 분리됨. path segment는 쿼리보다 캐시 키로 안정적
트레이드오프: 사용자가 URL을 직접 수정하면 존재하지 않는 버전으로 접근 가능 → 404 처리 필요
참고: MVP의 보고서 페이지는 스텁이므로 버전 세그먼트는 메타 노출 용도만. 실제 findings 렌더는 포스트-MVP

## ADR-007: 외부 API 키 (폐기)
결정: MVP에선 외부 API 키 불필요 (YouTube Data API·LLM 모두 미사용)
이유: 자막 수집은 확장 단독, LLM은 포스트-MVP
후속: 포스트-MVP에서 LLM 도입 시 키 저장 위치(`apps/web/.env.local` 등)를 별도 ADR로 결정

## ADR-008: rule-based 탐지 방식 (수정)
결정: **3-zone 가중치 스코어링**
 - **Low (정상)**: 총점 < 20 → `verdict: safe`, 이후 단계 스킵
 - **Mid (애매)**: 20 ≤ 총점 < 60 → **(MVP) fraud로 합산** / (포스트-MVP) 판별 LLM에 위임
 - **High (위법 의심)**: 총점 ≥ 60 → `verdict: fraud`, 즉시 판정
이유: MVP에선 판별 LLM이 없으므로 Mid를 fraud로 내려 false negative를 피하고, 포스트-MVP에서 LLM으로 Mid를 정교화
트레이드오프: MVP에선 false positive 가능성이 남음. 시드 룰은 보수적으로 시작해 완화

## ADR-009: 룰 사전 형태 (신규)
결정: **최소 시드 룰 10~20개** — 건강식품·다이어트 핵심 위법 키워드/정규식을 `packages/shared/src/rules.ts`에 하드코딩
 - 매칭 방식: 키워드 단순 포함 + 간단한 정규식만 사용, 컨텍스트 윈도우·부정어 처리 없음
 - 5개 `LawCategory`(food_labeling, health_functional, medical_device, medical_act, fair_trade)에 분산
이유: MVP는 파이프라인 검증이 우선. 실자막 샘플 기반 본격 튜닝은 포스트-MVP
트레이드오프: 부정어("치료 아님")를 그대로 맞혀 false positive 가능 → 시드 룰은 강한 위법 표현만 포함

## ADR-010: UI 상태 모델 (신규)
결정: **2-state만 표시** — `safe` / `fraud`
 - safe: 시청 방해 없는 작은 배지(또는 미표시)
 - fraud: 빨간 배지 + 보고서 "자세히 보기" 링크
이유: 사용자가 즉시 판단 내릴 수 있는 단순한 신호가 핵심. 중간 상태 노출은 판단 피로만 증가
트레이드오프: Mid 구간의 뉘앙스가 UI에서 사라짐 → ADR-008 "Mid=fraud로 합산" 정책과 짝으로 동작

## ADR-011: LLM 도입 범위 (신규, 포스트-MVP 플래그)
결정: MVP 제외 / 포스트-MVP 2종 도입 예정
 - **판별 LLM**: 파인튜닝 모델, Mid 구간에서 `{videoLink, transcript}` 입력으로 safe/fraud 재판정
 - **보고서 LLM**: GPT 사용 예정. fraud 확정 시 `{transcript, 관련 법조항(RAG)}` 입력으로 보고서 본문 생성
이유: 파인튜닝 모델 학습·데이터 수집·RAG 구축 일정을 MVP 밖으로 분리해 rule-based 파이프라인을 먼저 검증
후속: 모델·프롬프트·비용·키 저장 위치는 포스트-MVP 착수 시 별도 ADR

## ADR-012: 분석 실행 위치 (신규)
결정: **rule-based 분석은 확장에서 수행** — `@yad/shared`의 `analyze(transcript)` 함수를 확장 번들에 포함해 호출
이유: 자막이 이미 확장에 있고 rule은 결정적이므로 서버 왕복이 불필요. 서버리스 환경에서 비용·레이턴시 모두 유리
트레이드오프: 확장 번들에 rule 사전이 포함돼 사용자가 룰을 들여다볼 수 있음(은폐 불가). 룰 업데이트 시 확장 재배포 필요
후속: 포스트-MVP에 판별 LLM / 보고서 LLM 중계용 서버 엔드포인트(예: `/api/verify`, `/api/report`) 추가

## ADR-013: 보고서 페이지 MVP 스코프 (신규)
결정: **MVP 보고서 페이지는 스텁만** — `/report/{videoId}/{ruleVersion}`이 videoId, ruleVersion과 "상세 보고서는 추후 제공" 안내만 렌더
이유: 보고서 본문은 LLM 생성물이고, 확장이 자체적으로 findings를 갖고 있으나 SSR이 그 재료를 받을 경로가 MVP엔 없음. findings 렌더·자막 인용·법조항 매핑은 포스트-MVP에서 LLM·RAG와 함께 한 번에 설계
트레이드오프: MVP에선 링크 클릭의 실질 가치가 낮음(스텁 안내만 노출). 단, 포스트-MVP에서 동일 URL이 실제 보고서로 교체되므로 사용자 혼란 없음
후속: 보고서 페이지가 findings/자막을 받는 방식(서버 저장 / URL 파라미터 / 확장 내부 tab page / LLM 생성 후 저장)은 포스트-MVP에서 결정
