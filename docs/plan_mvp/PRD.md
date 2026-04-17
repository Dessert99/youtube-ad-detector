# PRD: YouTube Ad Detector MVP (rule-based)

## 목표
건강식품·다이어트 유튜브 광고성 영상의 자막에서 rule-based로 위법 소지 표현을 탐지해 안전/위법 2-state UI를 표시하고, 위법 판정 시 보고서 페이지 링크(새 탭)를 제공한다.

## 핵심 기능
1. 크롬 확장(plasmo)이 유튜브 시청 페이지에서 videoId 감지 + `ytInitialPlayerResponse`로 자막 추출
2. 확장이 `@yad/shared`의 rule 엔진을 호출해 3-zone 스코어링 수행 → `safe` / `fraud` 판정
3. 시청 방해 없는 위치에 2-state 배지 표시. `fraud`일 때만 "자세히 보기" 링크 노출
4. 링크 클릭 시 새 탭으로 `/report/{videoId}/{ruleVersion}` 이동, MVP에서는 스텁 페이지(메타 정보만) 렌더

## 범위 외 (Out of Scope)
- 제품 진위 판별·의학적 사실 검증
- 합법/불법 최종 판정 (본 시스템은 탐지기 + 근거 제시기)
- 건강식품·다이어트 외 카테고리 탐지
- LLM 기반 판별 (포스트-MVP: 파인튜닝 판별 모델)
- LLM 기반 보고서 본문 생성 (포스트-MVP: GPT 사용 예정, 법조항 RAG 포함)
- 보고서 페이지 실제 렌더 (findings·자막·법조항 나열)
- 보고서 페이지 업로드/저장 방식 (포스트-MVP에서 결정)
- 광고 차단·삭제
- 자막 없는 영상 분석 (UI 미표시 스킵)
- 서버 측 자막 수집·분석 (확장 단독 수행)
