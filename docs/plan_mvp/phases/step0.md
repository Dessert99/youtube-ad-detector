# step 0 — shared-refactor

`shared/src/`를 확장 단독 rule 엔진 구조로 정비한다. 서버 경유 타입을 제거하고 `analyze()` 순수함수와 시드 룰을 도입한다.

## 읽어야 할 파일

- `docs/plan_mvp/PRD.md`
- `docs/plan_mvp/ADR.md` (특히 ADR-001, ADR-002, ADR-003, ADR-007)
- `docs/plan_mvp/ARCHITECTURE.md`
- `shared/src/types.ts` (현 상태)
- `shared/src/rules.ts` (현 상태)
- `shared/src/index.ts` (현 상태)

## Scope

`shared/src/**` **만** 수정한다. `extension/`, `next/`, `shared/package.json`, 루트 `package.json`은 건드리지 않는다.

### 변경 대상 파일

1. `shared/src/types.ts`
2. `shared/src/rules.ts`
3. `shared/src/analyze.ts` (신규)
4. `shared/src/index.ts`

### 시그니처·불변식

#### `types.ts`

다음 타입을 **삭제**한다: `AnalyzeRequest`, `AnalyzeResponse`, `Report`. (구 서버 경유 구조의 잔재 — ADR-001.)

다음 타입을 **유지**한다: `LawCategory`, `TranscriptSegment`, `Finding`.

다음 타입을 **신규 추가**한다:

```ts
export type Verdict = 'safe' | 'fraud'
export type Zone = 'low' | 'mid' | 'high'

export interface AnalyzeResult {
  verdict: Verdict
  zone: Zone
  riskScore: number       // 0~100
  findings: Finding[]
  ruleVersion: string
}
```

**불변식**:
- `Verdict`는 두 값만 (PRD "2-state 배지").
- `Zone`은 세 값 (ADR-002 3-zone 구조 보존). MVP에서는 mid → fraud로 합산하되 zone 값 자체는 계산 결과 그대로 내보낸다 (post-MVP AI 분기 포인트).

`Finding`의 기존 `riskWeight: number` 필드를 **삭제**한다 (ADR-003 갱신안 — 룰별 가중치 없음). `Finding`은 이제 `segment`, `ruleId`, `category`, `matchedText`, `explanation`만 갖는다.

#### `rules.ts`

```ts
export interface Rule {
  id: string
  category: LawCategory
  keywords: string[]          // 단순 includes 매칭용
  description: string         // 보고서 근거 문구
}

export const RULE_VERSION = '0.1.0-mvp'
export const RULES: Rule[] = [ /* 10~20개 */ ]
```

**불변식**:
- `Rule`에 `riskWeight`·`pattern` 필드 **금지** (ADR-003 갱신안).
- 시드 룰은 **10~20개**, 5개 `LawCategory`에 분산.
- 카테고리 분류는 "법 중대성 점수"가 아니라 "어느 법 조문에 걸리는 표현인가"를 기준으로 정확히 맞춘다. 예: "체지방 제거" 같은 **신체 구성 성분 변화 단정**은 `fair_trade`(단순 과장)가 아니라 `health_functional`(미인증 기능성 표방)로 분류.
- `RULE_VERSION`은 `0.1.0-mvp`로 설정 (ADR-007).

**시드 룰 확정 목록 (13개)**. 아래 표를 그대로 `RULES` 배열로 옮긴다. id·category·keywords·description은 **원문 그대로**. 추가·삭제·문구 변경 금지(추측 금지 원칙).

| id | category | keywords | description |
|---|---|---|---|
| `r-food-01` | `food_labeling` | `["질병 치료", "병을 낫게", "병이 나아"]` | 식품이 질병을 치료·완치시킨다는 단정 표현 (식품 표시·광고법 위반 소지) |
| `r-food-02` | `food_labeling` | `["항암"]` | 식품의 항암 효능 단정 (식품 표시·광고법 위반 소지) |
| `r-food-03` | `food_labeling` | `["당뇨 완치", "고혈압 완치"]` | 성인병 완치 단정 (식품 표시·광고법 위반 소지) |
| `r-food-04` | `food_labeling` | `["면역력 완전 회복"]` | 면역 질환 치료 암시 단정 (식품 표시·광고법 위반 소지) |
| `r-hf-01` | `health_functional` | `["혈당을 낮춰", "혈압을 내려"]` | 미인증 생리활성 기능 단정 (건강기능식품법 위반 소지) |
| `r-hf-02` | `health_functional` | `["기억력 회복"]` | 미인증 인지기능 개선 단정 (건강기능식품법 위반 소지) |
| `r-hf-03` | `health_functional` | `["체지방 제거", "지방 연소"]` | 미인증 체지방 감소 기능 단정 (건강기능식품법 위반 소지) |
| `r-md-01` | `medical_device` | `["의료기기 수준"]` | 의료기기 유사 효능 주장 (의료기기법 위반 소지) |
| `r-ma-01` | `medical_act` | `["의사 추천", "병원에서 사용"]` | 의료인·의료기관 권위 차용 (의료법·광고법 위반 소지) |
| `r-ft-01` | `fair_trade` | `["100% 안전"]` | 절대적 안전 단언 (표시·광고의 공정화법 위반 소지) |
| `r-ft-02` | `fair_trade` | `["효과 보장"]` | 효과를 보장한다는 단언 (표시·광고의 공정화법 위반 소지) |
| `r-ft-03` | `fair_trade` | `["부작용 전혀 없"]` | 부작용이 전혀 없다는 단언 (표시·광고의 공정화법 위반 소지) |
| `r-ft-04` | `fair_trade` | `["과학적으로 입증"]` | 과학적 입증 근거를 명시하지 않은 단언 (표시·광고의 공정화법 위반 소지) |

**주의**:
- 매칭은 `segment.text.includes(keyword)` — 공백·조사·대소문자 정규화 없음. 표의 keyword 문자열을 **그대로** 사용할 것 (예: "체지방 제거"를 "체지방제거"로 바꾸지 말 것).
- 같은 룰 내 keywords는 OR 관계 (하나라도 포함되면 해당 룰 hit). 같은 룰이 여러 segment에 매칭되면 `Finding`은 여러 건 생성되지만 `riskScore` 산출 시 `distinctRuleHits`는 1로 카운트.

#### `analyze.ts` (신규)

```ts
export function analyze(
  segments: TranscriptSegment[],
  rules: Rule[],
  ruleVersion: string
): AnalyzeResult
```

**불변식**:
- **순수함수**. DOM·chrome API·네트워크 접근 금지. 입력만 읽고 결과만 반환.
- 매칭 방식: 각 segment의 `text`에 대해 룰의 keywords 중 하나라도 `segment.text.includes(keyword)` 이면 hit. 대소문자·공백 정규화 없음 (ADR-003 "단순 포함만").
- `Finding`은 룰 hit마다 1건 생성 (같은 룰이 여러 segment에 걸리면 여러 Finding). `matchedText`는 실제 매칭된 키워드를 그대로 기록. `explanation`은 `Rule.description`을 그대로 사용.
- **riskScore 산식** (ADR-003 갱신안):
  ```
  distinctRuleHits = findings에서 중복 제거한 ruleId 개수
  riskScore = Math.min(100, distinctRuleHits * 20)
  ```
- **zone/verdict 매핑** (ADR-002):
  - `riskScore < 20` → `zone='low'`, `verdict='safe'`
  - `20 <= riskScore < 60` → `zone='mid'`, `verdict='fraud'` (MVP: mid→fraud 합산)
  - `riskScore >= 60` → `zone='high'`, `verdict='fraud'`
- 반환하는 `ruleVersion`은 인자로 받은 값을 그대로 담는다 (호출자가 `RULE_VERSION` 상수를 주입).

#### `index.ts`

기존 `export * from './types'`, `export * from './rules'`에 더해 `export * from './analyze'`를 추가한다.

## 금지사항

- `extension/`, `next/` 수정 금지. **이유**: Scope는 `shared/src/**` 한정. 다른 레이어는 step 1·2에서 갱신.
- `shared/package.json`의 dependencies·exports 변경 금지. **이유**: exports는 이미 `src/index.ts`를 가리키고 있고, 외부 의존성 추가는 MVP 단순화 원칙(ADR-003) 위반.
- 정규식 매칭 코드 작성 금지. **이유**: ADR-003 갱신안에서 키워드 `includes`만 사용하기로 결정.
- `Rule`에 `riskWeight` 또는 `pattern` 필드 추가 금지. **이유**: ADR-003 갱신안의 구조적 결정.

## 본 step 이후 일시적으로 깨지는 코드

이 step은 `shared/src/types.ts`에서 `AnalyzeRequest`·`AnalyzeResponse`·`Report` 및 `Finding.riskWeight`를 제거한다. 그 결과 다음 파일들이 타입 에러 상태로 남는다 — **step 1 종료 시점까지 정상화되지 않으며 이들을 컴파일하는 AC 명령을 이 step에서 사용 금지**한다 (TROUBLESHOOTING §6·§10):

- `extension/background.ts` — `AnalyzeRequest`/`AnalyzeResponse` import 깨짐
- `extension/contents/youtube.ts` — `AnalyzeResponse` import 깨짐
- `extension/lib/config.ts` — `ANALYZE_PATH` 상수(step 1에서 제거)
- `next/app/api/analyze/route.ts` — 구 타입 import 깨짐 (step 2에서 삭제)
- `next/app/report/[videoId]/page.tsx` — `Report`·`transcriptSource` 깨짐 (step 2에서 이동·교체)

따라서 step 0의 AC에 `cd extension && npm run build` 또는 `cd next && npm run build`를 **포함하지 않는다**.

## Acceptance Criteria

```bash
cd shared && npx tsc --noEmit
cd .. && node --input-type=module -e "import('./shared/src/index.ts').then(m=>{ if(typeof m.analyze!=='function'){console.error('analyze missing');process.exit(1)} if(!Array.isArray(m.RULES)){console.error('RULES not array');process.exit(1)} if(m.RULES.length<10||m.RULES.length>20){console.error('RULES count='+m.RULES.length);process.exit(1)} if(typeof m.RULE_VERSION!=='string'||!m.RULE_VERSION){console.error('RULE_VERSION invalid');process.exit(1)} })"
```

## AC 직접성 체크리스트

1. **의도 직접 측정?** — `tsc --noEmit`은 타입 교체·신규 파일·export의 타입 일관성을 실제 컴파일러로 측정. `analyze`·`RULES`·`RULE_VERSION` 실제 import는 런타임 구조를 직접 측정.
2. **Scope와 AC 영역 일치?** — AC가 검증하는 파일은 `shared/src/**` 뿐. extension·next는 의도적으로 포함하지 않음 (위 "깨지는 코드" 섹션 근거).
3. **실패 원인이 이 step에서 해결 가능?** — 타입 에러·RULES 개수·analyze 함수 부재는 모두 `shared/src/**` 내부 수정으로 해결 가능.
