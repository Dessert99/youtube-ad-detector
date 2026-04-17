# step3: shared-analyze

## 목표

rule 엔진(`analyze`) + 광고성 prefilter(`detectAdSignal`) + 가중치 적용(`applyAdWeight`)을 작성한다. ADR-011의 3-state 결정 로직을 구현한다.

## Scope

- **생성**:
  - `shared/src/analyze.ts` — `analyze(cues, ruleVersion, adSignal)` + `applyAdWeight`
  - `shared/src/prefilter.ts` — `detectAdSignal(cues, pageMetadata)`
  - `shared/tests/fixtures/*.json` — 최소 3개(health-clean, diet-fraud, mixed-caution)
  - `shared/tests/analyze.spec.ts`
  - `shared/tests/prefilter.spec.ts`
- **수정**:
  - `shared/src/index.ts` — analyze·prefilter 재수출.

## 읽어야 할 파일

- `docs/plan_mvp2/ADR.md` (ADR-009, ADR-010, ADR-011)
- `docs/plan_mvp2/ARCHITECTURE.md` (데이터 흐름 해피/실패 경로)
- `shared/src/types.ts`
- `shared/src/rules/v0.1.json`

## 작업 절차

1. `shared/src/prefilter.ts`
   ```ts
   import type { Cue, PageMetadata } from "./types.js";
   const DISCLAIMER_PATTERNS = [/광고/, /협찬/, /유료\s*광고/, /\bAD\b/i, /sponsored/i, /paid\s*promotion/i];
   export function detectAdSignal(cues: Cue[], meta: PageMetadata): boolean {
     const hay = [meta.title ?? "", meta.description ?? "", cues.map(c => c.text).join(" ")].join(" ");
     return DISCLAIMER_PATTERNS.some(re => re.test(hay));
   }
   ```
   - 모든 공개 함수 위에 한 줄 주석(CLAUDE.md).

2. `shared/src/analyze.ts`
   ```ts
   import type { AnalyzeResult, BadgeState, Cue, Match } from "./types.js";
   import { getRuleSet } from "./rules/index.js";

   const MAX_MATCHES = 50;        // seed, ADR-017
   const MAX_PER_RULE = 5;         // seed, ADR-017

   export function analyze(
     cues: Cue[],
     ruleVersion: string,
     adSignal: boolean,
     videoId: string,
   ): AnalyzeResult {
     const ruleSet = getRuleSet(ruleVersion);
     if (!ruleSet) {
       return { videoId, ruleVersion, state: "caution", matches: [], truncated: 0, adSignal };
     }
     const matches: Match[] = [];
     const perRuleCount = new Map<string, number>();
     let truncated = 0;
     for (const rule of ruleSet.rules) {
       let re: RegExp;
       try { re = new RegExp(rule.pattern, "g"); }
       catch { continue; }            // 정규식 오류 → 해당 rule skip (F5)
       for (const cue of cues) {
         let m: RegExpExecArray | null;
         re.lastIndex = 0;
         while ((m = re.exec(cue.text)) !== null) {
           const count = perRuleCount.get(rule.id) ?? 0;
           if (count >= MAX_PER_RULE) { truncated++; break; }
           if (matches.length >= MAX_MATCHES) { truncated++; break; }
           matches.push({ ruleId: rule.id, text: m[0], start_ms: cue.start_ms, end_ms: cue.end_ms });
           perRuleCount.set(rule.id, count + 1);
           if (!re.global) break;
         }
         if (matches.length >= MAX_MATCHES) break;
       }
     }
     const base: AnalyzeResult = { videoId, ruleVersion, state: "caution", matches, truncated, adSignal };
     return applyAdWeight(base, adSignal);
   }

   export function applyAdWeight(result: AnalyzeResult, adSignal: boolean): AnalyzeResult {
     const hasMatch = result.matches.length > 0;
     let state: BadgeState;
     if (!hasMatch) state = "caution";                        // rule-miss → 항상 caution (ADR-006/011)
     else if (adSignal) state = "fraud";                      // match + 광고성 → fraud
     else state = "caution";                                  // match 있으나 광고성 없음 → caution으로 강등
     return { ...result, state, adSignal };
   }
   ```

3. Fixture 자막 JSON(`shared/tests/fixtures/`)
   - `health-clean.json` — 일반 건강 정보, rule match 0, adSignal false → `caution`(rule-miss).
   - `diet-fraud.json` — 다이어트 과장 표현 여러 개 + "광고" 문구 → `fraud`.
   - `mixed-caution.json` — match ≥ 1이나 광고성 키워드 없음 → `caution`(강등).
   - 각 fixture는 `Cue[]` 배열 + `pageMetadata` + `expected` 섹션(state, min match 수).

4. `shared/tests/analyze.spec.ts`
   - 각 fixture별로: analyze 실행 → expected state 일치, truncated 타당.
   - `cap 50` 테스트: 인위적으로 동일 pattern 100회 생성한 cue를 analyze → `matches.length <= 50` && `truncated > 0`.
   - `MAX_PER_RULE` 테스트: 동일 rule이 cue에 10번 나타나도 matches 내 ruleId count ≤ 5.
   - `ruleVersion` 미존재: `getRuleSet("v99")` 경로 → state=caution, matches=[].

5. `shared/tests/prefilter.spec.ts`
   - 광고 문구 있음 → true.
   - 문구 없음 → false.
   - 대소문자 혼재(`AD`, `ad`) → true.
   - metadata만 광고성 → true.

6. `shared/src/index.ts` 업데이트
   - `export { analyze, applyAdWeight } from "./analyze.js";`
   - `export { detectAdSignal } from "./prefilter.js";`

## 불변식

- `analyze`는 **항상 `AnalyzeResult`를 반환한다**(throw 금지). 정규식 오류 rule은 skip(ADR F5).
- rule-miss는 **항상 `caution`**(ADR-006/011, PRD 포지셔닝 — safe 보증 회피).
- 매치당 `start_ms`/`end_ms` 필수(ADR-009). 없으면 사용자 검증 경로 상실.

## AC (Acceptance Criteria)

1. `cd shared && npx tsc --noEmit` → exit 0.
2. `cd shared && npm test` → 모든 테스트 통과, 테스트 수 8개 이상.
3. `grep -n "throw" shared/src/analyze.ts` → 0줄(analyze는 throw 금지).
4. `grep -c "start_ms" shared/src/types.ts` → ≥ 2.

## 금지사항

- `analyze`에서 외부 `fetch`·DOM·chrome API 호출 금지. 이유: pure TS 경계(ADR-005).
- payload 인코딩 로직 선점 금지(step4). 이유: Scope 초과.
- rule JSON 수정 금지. 이유: step2의 deliverable.

## 본 step 이후 일시적으로 깨지는 코드

- 없음.

## AC 직접성 체크리스트

1. **의도 직접 측정?** — 실제 fixture 자막에 대해 analyze 실행, state 값을 직접 검증. 프록시 아님.
2. **Scope⊇AC?** — `shared/` 안에서만 AC 실행.
3. **실패 원인 step 내 해결 가능?** — 로직 오류·fixture 오류 모두 이 step 내 수정 완결.
