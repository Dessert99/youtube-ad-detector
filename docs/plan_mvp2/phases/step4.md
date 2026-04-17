# step4: shared-payload

## 목표

`encodePayload` / `decodePayload`를 구현한다. LZ-string 압축 + base64url + Zod 런타임 검증으로 "URL 파손률 0%"를 달성한다.

## Scope

- **생성**:
  - `shared/src/payload.ts`
  - `shared/tests/payload.spec.ts`
- **수정**:
  - `shared/package.json` — `dependencies`에 `lz-string`, `zod` 추가.
  - `shared/src/index.ts` — encode·decode 재수출.

## 읽어야 할 파일

- `docs/plan_mvp2/ADR.md` (ADR-007, ADR-010)
- `docs/plan_mvp2/ARCHITECTURE.md` (보안 섹션 — Zod 가드)
- `shared/src/types.ts`

## 작업 절차

1. `shared/src/payload.ts`
   ```ts
   import LZString from "lz-string";
   import { z } from "zod";
   import type { AnalyzeResult } from "./types.js";

   const MatchSchema = z.object({
     ruleId: z.string().min(1).max(64),
     text: z.string().max(500),
     start_ms: z.number().int().nonnegative(),
     end_ms: z.number().int().nonnegative(),
   });

   const AnalyzeResultSchema = z.object({
     videoId: z.string().regex(/^[A-Za-z0-9_\-]{6,32}$/),
     ruleVersion: z.string().regex(/^v\d+\.\d+(\.\d+)?$/),
     state: z.enum(["safe", "caution", "fraud"]),
     matches: z.array(MatchSchema).max(50),
     truncated: z.number().int().nonnegative(),
     adSignal: z.boolean(),
   });

   export function encodePayload(result: AnalyzeResult): string {
     const json = JSON.stringify(result);
     return LZString.compressToEncodedURIComponent(json);
   }

   export function decodePayload(hash: string): AnalyzeResult {
     const raw = hash.startsWith("#data=") ? hash.slice(6) : hash.startsWith("data=") ? hash.slice(5) : hash;
     const json = LZString.decompressFromEncodedURIComponent(raw);
     if (!json) throw new Error("payload: decompression failed");
     const obj: unknown = JSON.parse(json);
     return AnalyzeResultSchema.parse(obj);      // Zod가 스키마 위반 시 throw
   }
   ```

2. `shared/tests/payload.spec.ts`
   - **Roundtrip**: fixture AnalyzeResult 5종(empty matches, single match, cap-50 matches, korean text, edge truncated>0) → encode → decode → 동등.
   - **URL 안전 길이**: cap-50 + 평균 ruleId 20바이트 + text 100바이트 → encoded 문자열 길이 < 4096 확인.
   - **손상 hash**: 임의 base64 쓰레기 → `decodePayload` throw.
   - **스키마 위반**: `{state: "unknown"}` 강제 주입 → Zod가 throw.
   - **videoId 포맷**: `"!!bad!!"` → throw.

3. `shared/package.json` 업데이트
   - `dependencies`: `{"lz-string": "^1", "zod": "^3"}` (step0 audit에서 실제 최신 major 확인해 반영).

4. `shared/src/index.ts`
   - `export { encodePayload, decodePayload } from "./payload.js";`

## 불변식

- `decodePayload`는 **반드시 Zod 검증을 통과한 객체만 반환**한다. 임의 JSON.parse 결과 직접 반환 금지(XSS·prototype pollution 방지).
- `videoId` 정규식은 YouTube videoId 관례(11자 URL-safe)에 가깝게 유지(ARCHITECTURE 보안 섹션).
- 압축 알고리즘은 `compressToEncodedURIComponent` 사용(URL hash fragment safe).

## AC (Acceptance Criteria)

1. `cd shared && npm install` → exit 0 (lz-string·zod 실제 설치).
2. `cd shared && npx tsc --noEmit` → exit 0.
3. `cd shared && npm test` → 모든 테스트 통과. payload 테스트만 5개 이상.
4. `grep -c "AnalyzeResultSchema.parse" shared/src/payload.ts` → ≥ 1.
5. `grep -E "^\s*type\s*:\s*" shared/package.json | grep module` → match (ESM 유지).

## 금지사항

- `eval`·`Function` 사용 금지. 이유: XSS 방어.
- `decodePayload`에서 Zod 우회 경로 금지. 이유: hash는 외부 입력(공유 링크)이므로 반드시 검증.
- base64 (non-url-safe) 사용 금지. 이유: URL fragment에서 `+`, `/` 파손.

## 본 step 이후 일시적으로 깨지는 코드

- 없음.

## AC 직접성 체크리스트

1. **의도 직접 측정?** — roundtrip·스키마 위반·길이 제한을 실제 test에서 직접 실행.
2. **Scope⊇AC?** — `shared/` 안에서만 AC 실행.
3. **실패 원인 step 내 해결 가능?** — payload 로직·스키마 수정으로 완결. 외부 의존 없음.
