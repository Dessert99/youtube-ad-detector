# 아키텍처

## 디렉터리 구조
```
root/
├─ apps/
│  ├─ extension/                 # plasmo 크롬 확장
│  │  ├─ contents/               # content script (videoId 감지, 자막 추출, rule 분석 호출, 배지 UI)
│  │  ├─ background/             # 새 탭 open
│  │  └─ popup/                  # 확장 팝업 (옵션/상태)
│  └─ web/                       # Next.js 풀스택 (App Router)
│     └─ app/
│        └─ report/[videoId]/[ruleVersion]/   # SSR 보고서 스텁 페이지
├─ packages/
│  └─ shared/                    # 공용 타입·룰 사전·rule 엔진·3-zone 라우터·유틸
├─ docs/
└─ package.json                  # npm workspaces 루트
```

## 패턴
- 분석 실행: **확장 단독** — content script가 `@yad/shared`의 `analyze(transcript)`를 직접 호출
- 자막 수집: 확장의 `ytInitialPlayerResponse` 파싱 + timedtext fetch 단독 경로
- 확장 ↔ 서버: MVP에선 직접 통신 없음. 확장 background는 `chrome.tabs.create`로 보고서 URL만 새 탭 오픈
- rule-based 엔진: `packages/shared`에 룰 사전 + 실행기 + 3-zone 라우터 배치 → 확장이 임포트
- 공용 타입(`AnalyzeResult`, `Verdict`, `Finding`, `TranscriptSegment`)은 shared에서 정의
- 보고서 페이지: MVP는 스텁(SSR), 포스트-MVP에 LLM 기반 실렌더로 교체

## 데이터 흐름
```
[유튜브 시청]
 └→ [content script] videoId 감지 + ytInitialPlayerResponse 파싱 → timedtext fetch
     ├→ 자막 없음 → 스킵 (UI 미표시)
     └→ 자막 있음 → @yad/shared의 analyze(transcript) 호출
         └→ [rule 엔진] 문장 매칭 → 카테고리별 riskWeight 합산
             └→ [3-zone 라우터]
                - 총점 < 20           → verdict=safe
                - 20 ≤ 총점 < 60 (MVP) → verdict=fraud (Mid→fraud 합산)
                - 총점 ≥ 60           → verdict=fraud
             └→ { verdict, riskScore, findings }
                 └→ [확장] 2-state 배지 렌더
                    ├─ safe:  작은 배지(or 미표시), 끝
                    └─ fraud: 빨간 배지 + "자세히 보기"
                        └→ 클릭 → [background] chrome.tabs.create(
                                  `${API_BASE_URL}/report/${videoId}/${ruleVersion}`)
                                  └→ [Next.js SSR] 스텁 페이지
                                     (videoId · ruleVersion 메타 + "상세 보고서는 추후 제공")
```

## 포스트-MVP 예정 구조 (참고)
- `apps/web/app/api/verify/route.ts` — Mid 구간 판별 LLM(파인튜닝) 중계
- `apps/web/app/api/report/route.ts` — fraud 확정 시 보고서 LLM(GPT) + 법조항 RAG로 보고서 생성
- `apps/web/app/report/[videoId]/[ruleVersion]/page.tsx` — LLM 생성 보고서 실렌더
- 보고서 저장/업로드 방식, 캐시 전략, API 키 관리는 해당 단계에서 결정
