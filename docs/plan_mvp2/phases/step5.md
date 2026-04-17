# step5: extension-scaffold

## 목표

`extension/` plasmo 워크스페이스 뼈대를 만든다. `file:../shared` 참조(ADR-003), 매니페스트 최소 권한(ADR-013), 환경변수 기반 `REPORT_URL` 설정, 프로덕션 빌드 성공까지.

## Scope

- **생성**:
  - `extension/package.json`
  - `extension/tsconfig.json`
  - `extension/.prettierignore`, `extension/.eslintignore`(plasmo scaffold와 충돌 방지, 필요 시만)
  - `extension/src/config.ts` — `REPORT_URL`, `LATEST_RULE_VERSION` 등 빌드 타임 상수.
  - `extension/src/background.ts` — **빈 stub**(`export {}` + console.debug 한 줄). 실제 로직은 step8.
  - `extension/.env.development` — `PLASMO_PUBLIC_REPORT_URL=http://localhost:3000`
  - `extension/.env.production` — 주석 처리된 자리(실제 도메인은 배포 시 기입).
  - `extension/.eslintrc.json` 또는 `eslint.config.mjs`(비대화형, BLOCK #5 회피).
- **수정 금지**: `shared/`, `next/`.

## 읽어야 할 파일

- `docs/plan_mvp2/ADR.md` (ADR-003, ADR-005, ADR-013)
- `docs/plan_mvp2/ARCHITECTURE.md` (디렉터리 구조, 외부 의존 라이브러리)
- `docs/plan_mvp2/phases/step0-audit.md` (**plasmo·React 버전 판정 결과 준수**)
- `TROUBLESHOOTING.md` (BLOCK #2, #5, #7, #8)

## 작업 절차

1. `extension/package.json`
   - `name`: `"@yad/extension"`, `private`: true, `version`: `"0.1.0"`.
   - `scripts`:
     - `"dev": "plasmo dev"`
     - `"build": "plasmo build"`
     - `"package": "plasmo package"`
     - `"typecheck": "tsc --noEmit"`
     - `"lint": "eslint src"`
   - `dependencies`:
     - `"@yad/shared": "file:../shared"`
     - `"plasmo"`: step0-audit에서 확정한 최신 stable.
     - `"react"`, `"react-dom"`: step0-audit이 확정한 버전 그대로. plasmo peer가 `^18`이면 `^18.3.1`, `^19`면 `^19.x`. **추측 금지.**
   - `devDependencies`:
     - `"typescript": "^5.5"`, `"@types/chrome"`, `"@types/react"`, `"@types/react-dom"`, `"eslint"`, `"typescript-eslint"`.
   - **필드 절대 금지**: `workspaces` — ADR-003, BLOCK #8.

2. `extension/tsconfig.json`
   - `extends`: `"plasmo/templates/tsconfig.base"` 또는 plasmo 최신 권장 구성(실측).
   - `compilerOptions.jsx`: `"react-jsx"` (plasmo 표준).
   - `compilerOptions.paths`: `"~*": ["src/*"]`.

3. `extension/src/config.ts`
   ```ts
   // REPORT_URL: 보고서 웹 호스트. env 미설정 시 localhost로 fallback (개발 편의).
   export const REPORT_URL = process.env.PLASMO_PUBLIC_REPORT_URL ?? "http://localhost:3000";
   // LATEST_RULE_VERSION: shared 쪽 semver와 동기. rule 배포 시 동시 갱신.
   export { LATEST_RULE_VERSION } from "@yad/shared";
   ```

4. `extension/src/background.ts` — **stub**
   ```ts
   // background service worker. 실제 메시지 라우팅·analyze 실행은 step8에서 구현.
   export {};
   console.debug("[yad] background stub loaded");
   ```

5. **매니페스트 필드**(plasmo는 `package.json`의 `manifest` 필드로 주입)
   ```jsonc
   "manifest": {
     "host_permissions": ["https://*.youtube.com/*"],
     "permissions": ["storage", "scripting", "webNavigation"]
   }
   ```
   - 추가 권한 금지(ADR-013).

6. `extension/.env.development`
   ```
   PLASMO_PUBLIC_REPORT_URL=http://localhost:3000
   ```

7. `extension/.env.production` — 주석 처리 예시만
   ```
   # 배포 시 실제 도메인으로 채울 것
   # PLASMO_PUBLIC_REPORT_URL=https://yad.example.com
   ```

8. `extension/eslint.config.mjs`(flat config, 비대화형)
   - typescript-eslint recommended + 단순 규칙. BLOCK #5 대화형 프롬프트 회피가 목적이므로 최소 구성.

9. **install + 빌드 실측**
   - `cd extension && npm install` 실행.
   - `npm run build` 실행 → `extension/build/chrome-mv3-prod/` 산출.

## 불변식

- `extension/package.json` 에 `workspaces` 필드 없음 (ADR-003, BLOCK #8).
- `extension/node_modules/react`가 설치되어 있어야 한다(nested install 검증).
- 매니페스트 권한은 PRD·ADR-013 목록과 **정확히** 일치.

## AC (Acceptance Criteria)

1. `cd extension && npm install` → exit 0.
2. `cd extension && npx tsc --noEmit` → exit 0.
3. `cd extension && npm run build` → exit 0, `extension/build/chrome-mv3-prod/manifest.json` 존재.
4. `cat extension/build/chrome-mv3-prod/manifest.json | python3 -c 'import json,sys; m=json.load(sys.stdin); assert m.get("host_permissions")==["https://*.youtube.com/*"], m; assert set(m.get("permissions", []))=={"storage","scripting","webNavigation"}, m'` → exit 0.
5. `test -d extension/node_modules/react && test -d extension/node_modules/@yad/shared && echo OK`
6. `grep -E '"workspaces"' extension/package.json | wc -l` → `0`.
7. `grep -E '"@yad/shared"\s*:\s*"file:\.\./shared"' extension/package.json` → match.
8. `test ! -f package.json` → OK (루트 package.json 없어야 함).

## 금지사항

- 루트 `package.json` 생성 / 부활 금지. 이유: ADR-002/003, BLOCK #8.
- `workspaces` 필드 사용 금지. 이유: BLOCK #8 구조적 원인.
- content script(`main-world.ts`, `badge.ts`) 생성 금지. 이유: step6·7 deliverable.
- `background.ts`에 실제 로직(메시지 라우팅·analyze 호출) 작성 금지. 이유: step8 deliverable.
- React 버전을 step0 audit 결과와 다르게 설정 금지. 이유: BLOCK #7/#8 프록시 검증 재발 방지.
- 대화형 CLI(e.g., `next lint` init 유사 스크립트) 실행 금지. 이유: BLOCK #5.

## 본 step 이후 일시적으로 깨지는 코드

- 없음(background.ts는 stub으로 의도적으로 빈 상태, 컴파일됨).

## AC 직접성 체크리스트

1. **의도 직접 측정?** — `plasmo build` 실제 실행 + 산출 manifest.json 구조 검증. 프록시 금지.
2. **Scope⊇AC?** — `extension/` 안에서만 검증.
3. **실패 원인 step 내 해결 가능?** — 버전·매니페스트·config 모두 이 step 내 수정 완결. legacy 코드 의존 없음.
