# step1: shared-analyze

## 목표
`packages/shared`를 "확장 단독 분석" 모델로 재정렬한다. 서버 경유 타입을 제거하고, seed 룰 사전·`analyze()` 함수·3-zone 라우터를 추가한다.

## 읽어야 할 파일
- `docs/plan_mvp/PRD.md`
- `docs/plan_mvp/ADR.md` (특히 ADR-008 3-zone, ADR-009 seed 룰, ADR-012 확장 단독 분석)
- `docs/plan_mvp/ARCHITECTURE.md`
- `packages/shared/src/types.ts` (제거·축소 대상)
- `packages/shared/src/rules.ts` (seed 룰 채움 대상)
- `packages/shared/src/index.ts` (재노출)
- `packages/shared/tsconfig.json`, `packages/shared/package.json`

## Scope
`packages/shared/src/` 디렉토리만. 다른 워크스페이스는 건드리지 않는다.

## 작업
1) **`types.ts` 재정의**
   - 유지: `LawCategory`, `TranscriptSegment`, `Finding`
   - 제거: `AnalyzeRequest`, `AnalyzeResponse`, `Report`
   - 추가:
     ```ts
     export type Verdict = 'safe' | 'fraud'
     export interface AnalyzeResult {
       verdict: Verdict
       riskScore: number // 0~100
       findings: Finding[]
     }
     ```

2) **`rules.ts` seed 룰 채움**
   - `RULE_VERSION`을 `'0.1.0'`으로 bump.
   - `RULES: Rule[]`에 최소 10개, 최대 20개 항목을 넣는다.
   - 5개 `LawCategory`(food_labeling / health_functional / medical_device / medical_act / fair_trade)에 **각 카테고리당 최소 2개씩** 분산.
   - 각 룰은 `keywords`(문자열 배열) 또는 `pattern`(정규식 문자열) 중 하나만 제공. 둘 다 비우지 말 것.
   - `description`은 "왜 문제 소지가 있는지" 한 줄.
   - `riskWeight`는 20~60 범위에서 설정(High(≥60) 진입은 보통 2건 이상의 축적으로 만든다).
   - 예시(참고용, 그대로 복사 금지):
     - food_labeling: "100% 완치", "모든 병에 효과"
     - health_functional: "당뇨병 치료", "암 예방 확실"
     - medical_device: "MRI급 정밀 측정" (의료기기 아닌 제품)
     - medical_act: "의사가 추천", "병원에서 인정"
     - fair_trade: "업계 1위 유일", "세계 최고"

3) **`analyze.ts` 신설** (새 파일)
   - 시그니처:
     ```ts
     export function analyze(segments: TranscriptSegment[]): AnalyzeResult
     ```
   - 내부 동작:
     - 각 `segment`의 `text`에 대해 `RULES`를 순회하며 매칭(keywords: `text.includes(kw)`, pattern: `new RegExp(pattern, 'i').test(text)`).
     - 매칭될 때마다 `Finding`을 생성: `matchedText`는 실제 매칭 문자열, `explanation`은 `rule.description`을 그대로 사용해도 됨.
     - `riskScore = Math.min(100, sum(findings.riskWeight))`.
     - 3-zone: `riskScore < 20 → verdict: 'safe'`, 그 외 `verdict: 'fraud'`.
   - 순수함수로 구현한다(I/O·`Date`·`Math.random` 금지).

4) **`index.ts` 재노출**
   - `analyze.ts`를 `export *` 또는 개별 re-export로 공개.

## 불변식 (깨면 안 됨)
- 3-zone 경계 숫자 `20` / `60`은 변경 금지. 이유: ADR-008에 명시된 범위. MVP는 20 이상을 모두 fraud로 합산한다.
- `LawCategory` 5종은 추가·삭제·이름 변경 금지. 이유: ADR-009가 이 5종에 seed 룰을 분산하기로 결정.
- `analyze()`는 결정적·순수함수. 이유: ADR-012 — 확장에서 매 재생 시 같은 입력에 같은 결과가 나와야 중복 호출 가드가 의미를 갖는다.

## 금지사항
- **부정어 처리, 컨텍스트 윈도우, 토큰화 구현 금지.** 이유: ADR-009가 MVP에선 "키워드 + 간단 정규식"으로 제한했다. 이 경계가 흔들리면 MVP 범위를 벗어나 테스트·튜닝 비용이 폭증한다.
- **LLM·외부 API 호출 금지.** 이유: ADR-011이 LLM을 MVP에서 명시적으로 제외했다.
- **`AnalyzeRequest`/`AnalyzeResponse`/`Report` 타입을 `// removed` 주석으로 남기거나 deprecated 채로 유지 금지.** 이유: 확장은 서버로 분석 요청을 보내지 않는다(ADR-012). 사용처가 전혀 없는데 남겨두면 이후 스텝이 오해한다.
- **`rules.ts`의 `Rule` 인터페이스에 `context`, `negation`, `window` 같은 필드 추가 금지.** 이유: 위 "부정어 처리 금지"와 동일 근거.

## AC (실행 가능한 검증 커맨드)
```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
npm run lint -w @yad/shared
```
둘 다 에러 없이 통과해야 한다.
