# PRD: youtube-ad-detector MVP (plan_mvp2)

## 목표

유튜브 건강식품·다이어트 광고성 영상에서 위법 가능성이 있는 표현을 **rule-based로 자동 탐지**하여, 시청자에게 **근거와 함께 의심신호 배지**를 노출하는 크롬 확장 1차 배포.

## 포지셔닝 (매우 중요)

본 시스템은 합법/불법을 자동으로 최종 판정하는 기계가 **아니다**.
**탐지기(Detector) + 근거 제시기(Evidence Presenter) + 선별기(Screener)** 이며, 최종 판단은 사용자 몫이다.
배지·보고서 UI의 모든 카피는 이 포지셔닝을 벗어나지 않는다("위반입니다" 금지, "의심 표현이 발견되었습니다" OK).

## 사용자 정의

- **주 사용자**: 유튜브에서 건강·다이어트 콘텐츠를 소비하는 일반 시청자.
- **가정**: 법률·의학 비전문가. 허위·과장 광고에 대한 판단 근거를 스스로 얻고 싶어함.
- **비사용자**: 광고주, 유튜버, 법무팀, 규제 당국 (MVP 범위 외).

## 핵심 기능 (MVP 1차 배포)

1. **영상 감지 → 자막 추출 → rule 엔진 → 3-state 배지**
   - `yt-navigate-finish` 이벤트 구독으로 영상 로드 감지.
   - MAIN world content script가 `ytInitialPlayerResponse`에서 caption track URL 추출.
   - isolated world가 자막 fetch → Cue[] 파싱 → `shared.analyze()` 실행.
   - 결과 상태별로 배지 DOM 주입: 안전 / 미확인 / 의심 (색 + 텍스트 + ARIA).

2. **배지 클릭 → 새 탭 보고서**
   - 분석 결과를 LZ-string 압축 + base64url 인코딩 후 `REPORT_URL#data=...` 형태로 `chrome.tabs.create`.
   - hash fragment 채택으로 분석 결과가 서버 access log에 기록되지 않음(privacy).

3. **보고서 페이지 (Next.js 16, 클라이언트 렌더)**
   - 경로: `/report/[videoId]/[ruleVersion]`. SSR은 빈 쉘만. `use client` 컴포넌트가 `window.location.hash`를 디코드하여 렌더.
   - 내용: rule match 목록(문장·ruleId·법 조항 근거) + 자막 타임스탬프 점프 링크(`youtube.com/watch?v={id}&t={s}s`).
   - `<meta name="robots" content="noindex">` 고정.

## 3-state 배지 정의

| 상태 | 한국어 라벨 | 의미 | 조건 |
|---|---|---|---|
| `safe` | 안전 | 분석 완료, 위반 의심 표현 없음 | 자막 분석 성공 + rule match 0건 + adSignal |
| `caution` | 미확인 | 분석했지만 추가 검토 권장 | rule match 0건이나 광고성 신호 혼재, 또는 rule match가 있으나 adSignal 없음으로 강등 |
| `fraud` | 의심 | 위반 의심 표현 발견 | rule match ≥ 1건 + adSignal 있음 |
| (미표시) | — | 분석 불가 | 자막 없음, fetch 실패, parse 예외, analyze throw |

배지는 tooltip으로 "탐지기가 자동으로 의심신호를 찾은 결과이며 최종 판단은 아닙니다" 문구 고정 노출.

## 성공 지표 (seed, 측정 가능)

- **기능성**: 자막 있는 한국어 영상 분석 p95 < **100ms**(seed, 실측 후 조정).
- **신뢰성**: rule match 발생 시 배지 노출률 100% (fail-safe 경로 제외).
- **URL 견고성**: 보고서 링크 파손률(브라우저 URL 길이 초과로 인한 404) 0% — cap 50 + LZ 압축으로 달성.
- **수동 리뷰 가능**: 보고서에 자막 타임스탬프 점프 링크 필수 노출.

## 비기능 요구사항

- **프라이버시**: 자막·videoId·분석 결과를 외부 서버로 전송하지 않는다. 보고서 링크는 hash fragment로 서버에 데이터가 도달하지 않게 한다.
- **성능**: 분석 p95 < 100ms(seed), 자막 fetch 타임아웃 2s, MAIN world 응답 대기 1s.
- **Fail-safe**: 모든 예외(자막 없음, fetch 실패, parse 오류, analyze throw)는 silent. 배지를 표시하지 않는다. 시청 경험 저해 금지.
- **최소 권한**: Manifest V3 — `host_permissions`는 `https://*.youtube.com/*`만. 그 외 `storage`, `scripting`, `webNavigation`.
- **접근성**: 배지 색+텍스트 조합(색약 대응), ARIA label, 키보드 포커스 가능.
- **노인덱싱**: 보고서 페이지 `noindex`. 사용자 분석 결과가 검색엔진에 노출되지 않도록.
- **i18n**: MVP는 한국어 전용. 자막 우선순위 ko(수동) > ko(자동생성). 비-한국어 자막만 있는 영상은 분석 스킵.

## 범위 외 (Out of Scope)

- AI 2차 판별(LLM·파인튜닝) — post-MVP.
- 보고서 본문을 LLM이 작성하는 기능 — post-MVP.
- 광고 차단/삭제 — 본 시스템은 탐지·표시만.
- 제품 진위·의학적 사실 검증 — 범위 외.
- 재생 타이밍 동기화 경고 — 영상 로드 1회 분석만.
- 다국어 자막 지원.
- e2e 자동화 테스트(Playwright 등) — 유지비 > 가치, 수동 smoke로 대체.
- 서버 분석 API / DB / 사용자 계정.

## 테스트 전략

- **자동화**: `shared/src/analyze.ts`에 대한 Vitest unit test. fixture 자막(`shared/tests/fixtures/*.json`) + 기대 match 세트로 회귀 방지.
- **수동 smoke checklist** (1차 배포 전):
  1. 자막 있는 한국어 건강 영상 → 배지 정상 노출
  2. 자막 없는 영상 → 배지 미표시
  3. 자막 있으나 rule miss → 안전/미확인 노출
  4. rule hit 영상 → 의심 배지 + 보고서 링크 작동
  5. 보고서에서 타임스탬프 클릭 → 해당 초로 유튜브 점프
  6. 동일 URL 내 재생 중(`yt-navigate-finish` 미발생) → 재분석 미발생 (debounce + videoId 가드)
  7. 장시간(1시간+) 영상 → 분석 시간 100ms 이내, cap 50 초과 시 `truncated` 표시

## 운영·배포

- 크롬 웹스토어 심사 → 배포. rule 업데이트는 확장 재배포로만 가능(MVP).
- Next.js 16 보고서 웹은 별도 호스팅(Vercel 등). 확장이 참조하는 `REPORT_URL`은 빌드 타임 환경변수.
- rule 버전 변경 시 **extension·next 동시 배포 필수**(비동시 배포 시 next가 해당 ruleVersion 파일 없으면 "버전 동기화 중" 안내 렌더).
