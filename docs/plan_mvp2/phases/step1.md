# step1: shared-types-scaffold

## 목표

`shared/` 워크스페이스의 뼈대(package.json, tsconfig, types.ts)를 만든다. pure TypeScript 경계(React·DOM·chrome 금지)를 확정한다.

## Scope

- **생성**:
  - `shared/package.json`
  - `shared/tsconfig.json`
  - `shared/src/types.ts`
  - `shared/src/index.ts`(현 시점 re-export는 types만)
  - `shared/.gitignore`(`dist/`, `node_modules/`)
- **수정 금지**: `extension/`, `next/`, 루트 파일 일체.

## 읽어야 할 파일

- `docs/plan_mvp2/ARCHITECTURE.md` (데이터 모델 섹션)
- `docs/plan_mvp2/ADR.md` (ADR-005, ADR-014)
- `docs/plan_mvp2/phases/step0-audit.md` (Node/npm 버전)

## 작업 절차

1. `shared/package.json` 작성
   - `name`: `"@yad/shared"`
   - `version`: `"0.1.0"`
   - `private`: `true`
   - `type`: `"module"`
   - `main`: `"dist/index.js"`
   - `types`: `"dist/index.d.ts"`
   - `exports`: `{".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"}, "./rules/*.json": "./src/rules/*.json"}`
   - `scripts`: `build`(`tsc -p .`), `typecheck`(`tsc --noEmit`), `test`(자리만, 다음 step에서 vitest 추가).
   - `dependencies`·`devDependencies` 비워둠(의존성은 후속 step에서 추가).

2. `shared/tsconfig.json`
   - `target`: `"ES2022"`, `module`: `"ESNext"`, `moduleResolution`: `"Bundler"`.
   - `strict`: true, `noUncheckedIndexedAccess`: true, `exactOptionalPropertyTypes`: true.
   - `outDir`: `"dist"`, `rootDir`: `"src"`, `declaration`: true, `declarationMap`: true.
   - `resolveJsonModule`: true.
   - `lib`: `["ES2022"]`(DOM 제외 — shared는 pure TS).

3. `shared/src/types.ts` — ARCHITECTURE.md "데이터 모델" 섹션 그대로 구현
   ```ts
   export type Cue = { text: string; start_ms: number; end_ms: number };
   export type Match = { ruleId: string; text: string; start_ms: number; end_ms: number };
   export type BadgeState = "safe" | "caution" | "fraud";
   export type AnalyzeResult = {
     videoId: string;
     ruleVersion: string;
     state: BadgeState;
     matches: Match[];
     truncated: number;
     adSignal: boolean;
   };
   export type PageMetadata = { title: string; description?: string };
   export type RuleSet = {
     version: string;
     rules: Array<{ id: string; pattern: string; description: string; lawRef: string }>;
   };
   ```
   - 각 타입 선언 위에 한 줄 주석(CLAUDE.md 규정).

4. `shared/src/index.ts`
   - 현재는 `export * from "./types.js";` 한 줄만(ESM `.js` 확장자 필수, moduleResolution=Bundler 조합).

5. `shared/.gitignore` — `dist/`, `node_modules/`.

## 불변식

- `shared/` 내 어떤 파일도 `react`·`react-dom`·`chrome`·`window`·`document`·`fetch`·`node:fs` 등을 import하지 않는다(ADR-005).
- `shared/package.json`에 `peerDependencies` 필드를 두지 않는다(React 의존성 유발 회피).

## AC (Acceptance Criteria)

1. `cd shared && npm install` → exit 0 (의존성 비어 있으므로 즉시 성공).
2. `cd shared && npx tsc --noEmit` → exit 0.
3. `cd shared && npx tsc -p .` → `shared/dist/index.js`, `shared/dist/types.d.ts` 생성.
4. `grep -RE "from ['\"](react|react-dom|chrome|fs)" shared/src | wc -l` → `0`.
5. `test ! -f package.json && echo no-root-package-still-absent` → OK.

## 금지사항

- 루트 `package.json` 생성 금지. 이유: ADR-002/003.
- `shared/src/rules/`, `shared/src/analyze.ts` 등 후속 step의 산출물 선점 금지. 이유: Scope 초과(BLOCK #1 재현).
- `lib`에 `"DOM"` 포함 금지. 이유: shared pure TS 경계 위반 방지.

## 본 step 이후 일시적으로 깨지는 코드

- 없음(본 step은 신규 파일만 생성).

## AC 직접성 체크리스트

1. **의도 직접 측정?** — `tsc --noEmit`과 실제 빌드(`tsc -p .`)로 shared 컴파일 자체를 검증. 프록시 아님.
2. **Scope⊇AC?** — AC가 `shared/` 경계 안만 본다. 루트·extension·next 건드리지 않음.
3. **실패 원인 step 내 해결 가능?** — tsconfig 또는 types.ts 수정으로 완결. legacy 코드 의존 없음.
