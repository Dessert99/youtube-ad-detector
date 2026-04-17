# step2: shared-rules-seed

## 목표

seed rule set(`v0.1.json`)과 loader를 작성한다. 건강/다이어트 허위·과장 광고 의심 표현 15개 내외를 정규식으로 등록하고, 각 rule에 식약처·공정위 등 실제 법조항 레퍼런스를 붙인다.

## Scope

- **생성**:
  - `shared/src/rules/v0.1.json`
  - `shared/src/rules/index.ts` (`getRuleSet(version)` loader)
  - `shared/tests/rules.spec.ts` (regex 컴파일·중복 ID·law 레퍼런스 비어있지 않음 검증)
  - `shared/vitest.config.ts`
- **수정**:
  - `shared/package.json` — `devDependencies`에 `vitest` 추가, `scripts.test`에 `vitest run`.
  - `shared/src/index.ts` — rules loader·RuleSet 재수출.

## 읽어야 할 파일

- `docs/plan_mvp2/ADR.md` (ADR-014 rule 포맷)
- `docs/plan_mvp2/PRD.md` (포지셔닝·tooltip 문구)
- `shared/src/types.ts`

## 작업 절차

1. **seed rule 리스트 — 아래 테마를 커버하는 15개 내외**
   - 효능·효과 절대표현: `100%\s*안전`, `무조건\s*(빠짐|빠짐없이|효과)`, `100%\s*완치`, `완전\s*제거`, `부작용\s*(없음|제로|0)`.
   - 의학적 효능 시사: `질병(을|이)?\s*(치료|완치|예방)`, `암(을|이)?\s*(치료|예방)`, `당뇨(를|가)?\s*(치료|완치)`, `고혈압(을|이)?\s*(치료|완치)`.
   - 다이어트 과장: `(\d+)\s*kg\s*(감량|다이어트|빠짐)`, `일주일\s*만에\s*[\-−]?\s*\d+\s*kg`, `먹기만\s*해도\s*(살|체중)(이|은)?\s*빠(져|진다)`.
   - 타 제품 비교 우월: `타\s*제품\s*대비\s*[\d]+\s*배`, `세계\s*1위`, `업계\s*1위`.
   - 승인·인증 허위 시사: `식약처\s*(승인|인증|허가)`, `FDA\s*승인`.
   - **각 rule에 법조항 레퍼런스**(제가 조사해 기입):
     - 식약처 `식품등의 표시·광고에 관한 법률` 제8조(부당광고 금지) — 효능효과, 의학적 표현, 허위인증 표기.
     - 공정위 `표시·광고의 공정화에 관한 법률` 제3조(부당표시·광고 금지) — 비교 우월·허위 순위.
     - 식약처 `건강기능식품에 관한 법률` 제18조(허위·과대의 표시·광고 금지).
   - `description` 필드는 한국어 한 문장: 왜 이 표현이 의심 표현인지.
   - `id`는 `{topic}-{nnn}` 패턴(`efficacy-001`, `medical-001`, `diet-001`, `compare-001`, `certify-001` 등).

2. `shared/src/rules/v0.1.json`
   ```json
   {
     "version": "v0.1",
     "rules": [
       {"id": "efficacy-001", "pattern": "100%\\s*안전", "description": "...", "lawRef": "식품등의 표시·광고에 관한 법률 제8조"},
       ...
     ]
   }
   ```
   - 정규식은 **JSON 문자열** → `\\s`, `\\d`처럼 backslash 이중 이스케이프.
   - 15개 내외. 재현 가능성·수동 smoke 기준으로 가혹하지 않게.

3. `shared/src/rules/index.ts`
   ```ts
   import v01 from "./v0.1.json" with { type: "json" };
   import type { RuleSet } from "../types.js";
   const registry: Record<string, RuleSet> = { "v0.1": v01 as RuleSet };
   export function getRuleSet(version: string): RuleSet | null {
     return registry[version] ?? null;
   }
   export const LATEST_RULE_VERSION = "v0.1";
   ```
   - JSON import는 `with { type: "json" }` 구문 사용(ES2025 import attributes; TS 5.3+ 지원).

4. `shared/tests/rules.spec.ts`
   - `v0.1.json`의 모든 rule에 대해: regex compile 성공, `id` 중복 없음, `description`·`lawRef` 비어있지 않음.
   - `getRuleSet("v0.1")` 반환값이 null 아님, `getRuleSet("v99")`은 null.

5. `shared/vitest.config.ts`
   - `test.include: ["tests/**/*.spec.ts"]`
   - `test.environment: "node"`

6. `shared/package.json` 업데이트
   - `devDependencies.vitest`: `^3` 또는 step0 audit에서 확인한 최신.
   - `scripts.test`: `"vitest run"`.

7. `shared/src/index.ts`
   - `export * from "./types.js";`
   - `export { getRuleSet, LATEST_RULE_VERSION } from "./rules/index.js";`
   - `export type { RuleSet } from "./types.js";`

## 불변식

- rule은 **전부 `description`과 `lawRef`를 가진다**(ADR-014, PRD 근거 제시 원칙).
- `lawRef`는 실제 한국 법령 명 + 조항 형식. "추정", "~일 것" 금지.
- rule JSON은 `shared/src/rules/` 아래에만 둔다(loader가 static import하므로 경로 변경 시 수동 등록 필요).

## AC (Acceptance Criteria)

1. `cd shared && npm install` → exit 0.
2. `cd shared && npx tsc --noEmit` → exit 0.
3. `cd shared && npm test` → 모든 테스트 통과. 최소 테스트 수 3개 이상.
4. `node -e 'import("./shared/dist/index.js").then(m => { if (!m.getRuleSet("v0.1")) process.exit(1); })'` **는 본 step에서 실행 금지**(tsc 빌드가 선행되어야 함). 대신 AC3의 테스트가 이 경로를 커버한다.
5. `node -e 'const r = require("./shared/src/rules/v0.1.json"); if (r.rules.length < 10) process.exit(1);'` → exit 0.
6. `grep -c "lawRef" shared/src/rules/v0.1.json` → rule 개수와 동일.

## 금지사항

- analyze.ts·prefilter.ts·payload.ts 선점 금지. 이유: 각각 step3, step4의 deliverable. Scope 초과 시 BLOCK #1.
- 정규식에 캡처 그룹을 **매칭 결과 추출 외 목적**으로 쓰지 말 것. 이유: analyze 단계에서 capture의 의미가 흔들림.
- 법조항에 존재하지 않는 조문 번호 기입 금지. 이유: 사용자 신뢰가 핵심 가치(PRD 포지셔닝).

## 본 step 이후 일시적으로 깨지는 코드

- 없음.

## AC 직접성 체크리스트

1. **의도 직접 측정?** — vitest로 regex compile·필드 무결성 실측. 프록시 아님.
2. **Scope⊇AC?** — 모든 AC 명령이 `shared/` 안에서만 실행.
3. **실패 원인 step 내 해결 가능?** — rule JSON 오타·legal ref 누락 모두 이 step 내 수정 완결.
