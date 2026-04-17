# step0: infra-audit

## 목표

feature step 진입 전, 인프라 결함을 전수 점검·해결한다. BLOCK #2 / #5 / #7 / #8의 재발을 구조적으로 차단한다.

## Scope

- **점검**: 디렉터리 구조, 루트 package.json·workspaces 부재, 아이콘 존재, plasmo↔React 호환성 실측.
- **생성**: `docs/plan_mvp2/phases/step0-audit.md`(감사 결과 문서) 한 파일만.
- **수정 금지**: `extension/`, `next/`, `shared/` 실제 코드 파일 생성 금지(본 step은 인프라 점검 전담).

## 읽어야 할 파일

- `docs/plan_mvp2/PRD.md`
- `docs/plan_mvp2/ADR.md` (특히 ADR-002·003·005·013)
- `docs/plan_mvp2/ARCHITECTURE.md` (디렉터리 구조·의존성 방향)
- `TROUBLESHOOTING.md` (BLOCK #2, #5, #7, #8)
- `CLAUDE.md`

## 작업 절차

1. **디렉터리 baseline**
   - 루트에 `package.json`이 **없어야 한다**. 있으면 감사 문서에 flag하고 중단.
   - `extension/`, `next/`, `shared/`, `docs/plan_mvp2/`, `tools/harness/` 존재 확인.
   - `extension/assets/icon.png` 존재·최소 해상도 128×128 이상 확인(사용자가 배치함). 없으면 중단.

2. **plasmo ↔ React 호환성 실측**(BLOCK #7/#8 근본 원인 회피)
   - `npm view plasmo version` → 최신 stable 버전 `P`.
   - `npm view plasmo@$P peerDependencies` 및 `npm view plasmo@$P dependencies` 출력 수집.
   - `npm view @plasmohq/consolidate peerDependencies`(BLOCK #7의 실제 범인) 확인.
   - React peer 요구가 `^18`인지 `^19`인지 판정해 감사 문서에 명시.
   - 판정 결과에 따라 **step5(extension-scaffold)에서 사용할 React 버전을 확정**한다(문서에만 기록).

3. **비대화형 도구 확인**
   - `npm view prettier version`, `npm view eslint version` 확인.
   - `extension/`과 `next/`는 본 step 이후에야 scaffold되므로, 여기서는 "eslintrc·prettierrc를 scaffold step에서 생성"을 감사 문서에 체크 항목으로 남긴다.

4. **Node/npm 버전 확인**
   - `node --version`(≥ 20.10 권장), `npm --version`(≥ 10, `file:` 프로토콜 nested install 요건).
   - 미달이면 감사 문서에 flag.

5. **감사 결과 문서 작성** → `docs/plan_mvp2/phases/step0-audit.md`
   - 섹션: Baseline / Plasmo-React 판정 / Node·npm / 미해결 항목 / step5 준비 체크리스트.

## 불변식

- 루트 `package.json` / `workspaces` 필드 절대 생성 금지 — ADR-002·003, BLOCK #8 재발 방지.
- `extension/`, `next/`, `shared/` 내부에 어떤 소스 파일도 생성하지 않는다(이 step의 deliverable 아님).
- plasmo 버전 조사는 **실측**이어야 한다. "보통 최신은 19를 받는다" 같은 추정 금지.

## AC (Acceptance Criteria)

모두 로컬에서 non-interactive하게 실행 가능해야 한다.

1. `test -f extension/assets/icon.png && echo OK`
2. `test ! -f package.json && echo "no-root-package OK"`
3. `test -f docs/plan_mvp2/phases/step0-audit.md && echo "audit doc OK"`
4. `grep -E "^- plasmo version: " docs/plan_mvp2/phases/step0-audit.md`
5. `grep -E "^- react peer: (\^|>=?)(18|19)" docs/plan_mvp2/phases/step0-audit.md`
6. `grep -E "^- node: v(2[0-9]|[3-9][0-9])" docs/plan_mvp2/phases/step0-audit.md`

## 금지사항

- 루트 `package.json` 생성 금지. 이유: ADR-002/003, BLOCK #8의 구조적 원인.
- extension/next/shared 내부에 파일 생성 금지. 이유: 본 step은 audit 전용. Scope 초과 시 BLOCK #1 재현.
- plasmo/React 호환성을 코드 수정 없이 판정 — 설치·빌드 금지. 이유: 본 step은 실측 조사일 뿐, 설치는 step5의 deliverable.

## 본 step 이후 일시적으로 깨지는 코드

- 없음(본 step은 신규 파일만 생성).

## AC 직접성 체크리스트

1. **의도 직접 측정?** — 감사 문서의 존재·필수 키 존재를 grep으로 직접 본다. 프록시 아님.
2. **Scope⊇AC?** — 변경 영역(audit 문서 1개)과 AC 검증 영역이 일치.
3. **실패 원인 step 내 해결 가능?** — 실측 결과가 나쁘면 그 결과 자체를 감사 문서에 기록하면 완료. plasmo가 React 18만 받는다면 step5가 그 값을 사용하면 됨(본 step은 "판정"이 deliverable).
