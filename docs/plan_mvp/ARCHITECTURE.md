# 아키텍처

## 디렉터리 구조
```
root/
├─ apps/
│  ├─ extension/                 # plasmo 크롬 확장
│  │  ├─ contents/               # content script (videoId 감지, 경고 UI)
│  │  ├─ background/             # 서버 호출, 새 탭 open
│  │  └─ popup/                  # 확장 팝업 (옵션/상태)
│  └─ web/                       # Next.js 풀스택 (App Router)
│     ├─ app/
│     │  ├─ api/analyze/         # POST: { videoId } → 분석 결과
│     │  └─ report/[videoId]/    # SSR 보고서 페이지
│     └─ .env.local              # YOUTUBE_API_KEY (서버 전용)
├─ packages/
│  └─ shared/                    # 공용 타입·룰 사전·rule 엔진·유틸
├─ docs/
└─ package.json                  # npm workspaces 루트
```

## 패턴
- 확장 ↔ 서버: 단방향 REST (`POST /api/analyze`)
- 자막 수집 2단 폴백: 서버의 YouTube API → 실패 시 확장의 DOM 파싱 결과 전달
- rule-based 엔진: `packages/shared`에 룰 사전 + 실행기 배치 → 서버가 호출
- 보고서: stateless — 매 요청 재계산, 서버 메모리 캐시만 사용
- 공용 타입(`AnalyzeRequest`, `AnalyzeResponse`, `Report`, `Finding`)은 shared에서 정의 → 확장·웹이 동일 타입을 임포트

## 데이터 흐름
```
[유튜브 시청]
 └→ [확장 content script] videoId 감지
     └→ [확장 background] POST /api/analyze { videoId }
         └→ [Next.js API] YouTube API로 자막 요청
            └→ 자막 없음/실패 시 확장에 DOM 자막 요청 (재시도 페이로드)
             └→ [rule 엔진] 문장 매칭 → 카테고리별 위험도 합산
                 └→ 응답 { riskScore, findings[], reportUrl }
                     └→ [확장] 비간섭 경고 UI + "자세히 보기" 링크
                         └→ 클릭 → 새 탭으로 /report/{videoId}
                             └→ [Next.js SSR] 동일 분석 재실행해 보고서 렌더
```
