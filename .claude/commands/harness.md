---
description: 기능 단위 작업을 위한 Harness 플랜 설계 워크플로우
---

# Harness

이 프로젝트는 Harness 프레임워크로 기능 단위 작업을 수행한다. 아래 워크플로우에 따라 진행하라.

## 워크플로우

### A. 탐색
`docs/plan_<name>/`의 PRD.md / ADR.md / ARCHITECTURE.md(있으면)를 읽고 플랜의 기획·설계 의도를 파악한다. 필요하면 Explore 에이전트를 병렬로 사용한다.

### B. 논의
step 분해·구현을 위해 구체화하거나 결정해야 할 기술/범위 사항이 남아 있으면 사용자에게 제시하고 논의한다. 애매하면 추측하지 말고 무조건 물어본다. 단, PRD/ADR 수준의 기획 재논의가 필요해지면 plan mode로 되돌아가 문서를 먼저 수정한 뒤 이 커맨드를 재호출한다.

### C. Step 설계
사용자가 승인하면 step으로 나눈 초안을 작성해 피드백을 요청한다. 설계 원칙:

1. **Scope 최소화** — 하나의 step은 하나의 모듈/레이어로 한정한다.
2. **자기완결성** — 각 `stepN.md`는 독립된 Claude 세션에서 실행된다. 외부 대화 참조 금지.
3. **사전 준비 강제** — "읽어야 할 파일" 섹션에 관련 문서/이전 산출물 경로를 명시한다.
4. **시그니처 수준 지시** — 함수 인터페이스만 제시하고 내부 구현은 실행 세션 재량에 맡긴다. 단, 설계 의도를 깨면 안 되는 불변식은 반드시 명시한다.
5. **AC는 실행 가능한 커맨드** — `npm run lint -w <ws>`, `npm run build -w <ws>`, `npx tsc --noEmit` 등 구체적으로 쓴다. 이 프로젝트는 프론트엔드 유닛테스트/E2E를 하지 않으므로 `npm run test`류를 AC로 사용하지 않는다 (예외: `tools/harness` 자체의 vitest는 유지).
6. **금지사항은 구체적으로** — "X하지 마라. 이유: Y" 형식으로 쓴다.
7. **네이밍** — step name은 kebab-case.

### D. 파일 생성
사용자 승인 후 아래 경로에만 파일을 만든다.

- `docs/plan_<name>/phases/index.json`
- `docs/plan_<name>/phases/stepN.md` (각 step마다)
- `docs/plans-index.json`의 `plans` 배열에 `{ "dir": "plan_<name>", "status": "pending" }` 항목이 없으면 추가


### E. 실행
설계가 끝난 뒤 사용자가 수동으로 실행한다.

```bash
npm run harness plan_<name>
npm run harness plan_<name> -- --push   # 완료 후 원격 push
```

`execute.ts`가 자동으로 처리하는 것: 브랜치 관리(`feat-<plan>` 생성·체크아웃), 가드레일 주입(CLAUDE.md + 플랜 docs), step 순차 실행, 자가 교정(최대 3회 재시도), AC 재실행 검증(Trust but Verify), 2단계 커밋(feat + chore).

## 주의사항

스텝 실패 복구:
- `error` 상태: `phases/index.json`에서 해당 step의 `status`를 `pending`으로 되돌리고 `error_message`를 비운 뒤 `npm run harness <plan>` 재실행.
- `blocked` 상태: `blocked_reason`을 해결한 뒤 동일 절차.
