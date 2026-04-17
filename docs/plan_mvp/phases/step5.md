# step4: web-report-stub

## 목표
`apps/web`을 "MVP 스텁 보고서 페이지 + 서버 분석 API 제거" 상태로 맞춘다. 보고서 라우트를 `/report/[videoId]/[ruleVersion]/`으로 변경하고, `ruleVersion`이 현재 `RULE_VERSION`과 다르면 404로 처리한다.

## 읽어야 할 파일
- `docs/plan_mvp/ADR.md` (특히 ADR-006 URL 버전, ADR-012 확장 분석, ADR-013 보고서 스텁)
- `docs/plan_mvp/ARCHITECTURE.md`
- `apps/web/app/report/[videoId]/page.tsx` (이동·재작성 대상)
- `apps/web/app/api/analyze/route.ts` (삭제 대상)
- `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`
- `packages/shared/src/rules.ts` (`RULE_VERSION` 값)
- `packages/shared/src/index.ts` (`RULE_VERSION` re-export 확인)

## Scope
`apps/web/app/` 이하만. 다른 워크스페이스는 건드리지 않는다.

## 작업
1) **`apps/web/app/api/analyze/` 디렉터리 전체 삭제**
   - `route.ts` 파일과 디렉터리 자체를 제거한다.
   - 상위 `apps/web/app/api/` 디렉터리가 빈다면 그대로 두어도 된다(포스트-MVP에서 `/api/verify`, `/api/report`가 들어올 자리).

2) **`apps/web/app/report/[videoId]/page.tsx` → `apps/web/app/report/[videoId]/[ruleVersion]/page.tsx`로 이동**
   - 기존 `[videoId]/page.tsx`는 **삭제**(동일 dynamic 세그먼트 위치에 파일·하위 dynamic 세그먼트 디렉터리를 동시에 두면 충돌 가능성이 있고, ADR-006은 경로를 `[videoId]/[ruleVersion]`로 고정했다).
   - 새 파일 내용:
     - import: `notFound` from `next/navigation`, `RULE_VERSION` from `@yad/shared`
     - 기존의 `buildReport` / `Report` 사용 코드는 **모두 제거**. MVP 스텁은 분석 재실행을 하지 않는다(ADR-013).
     - 시그니처:
       ```ts
       export default async function ReportPage({
         params,
       }: {
         params: Promise<{ videoId: string; ruleVersion: string }>
       })
       ```
     - `const { videoId, ruleVersion } = await params`
     - `if (ruleVersion !== RULE_VERSION) notFound()`
     - 렌더: `<main>` 안에 videoId, ruleVersion, "상세 보고서는 추후 제공됩니다." 문구만. 스타일은 기존 page.tsx와 비슷한 수준(간단한 inline style)으로 유지.

## 불변식 (깨면 안 됨)
- **보고서 페이지는 findings·자막·법조항을 렌더하지 않는다.** 이유: ADR-013 — MVP 스텁 범위. 이 경계가 흔들리면 LLM·RAG 설계 없이 반쪽짜리 실렌더가 들어간다.
- **`ruleVersion` 불일치는 `notFound()`(404).** 이유: ADR-006 트레이드오프 — URL 조작으로 존재하지 않는 버전에 접근한 경우 404.
- **경로는 `/report/[videoId]/[ruleVersion]/`만 존재한다.** 이유: ADR-006.

## 금지사항
- **`/api/analyze` 또는 `/api/verify`·`/api/report` 같은 새 서버 엔드포인트를 추가 금지.** 이유: ADR-012는 MVP에서 서버 분석 엔드포인트를 모두 제거했다. 포스트-MVP 범위.
- **`buildReport()` 같은 분석 로직을 서버로 다시 도입 금지.** 이유: ADR-012 — 분석은 확장 단독.
- **`[videoId]/page.tsx`와 `[videoId]/[ruleVersion]/page.tsx`를 동시에 두지 말 것.** 이유: Next.js App Router에서 동일 위치에 파일과 하위 동적 세그먼트 디렉터리가 공존하면 라우팅이 혼란스럽고, ADR-006이 버전 포함 경로 하나만 허용했다.
- **`@yad/shared`의 삭제된 타입(`Report`, `AnalyzeResponse` 등)을 import 금지.** 이유: step1에서 제거됨. 남으면 빌드 실패.

## AC (실행 가능한 검증 커맨드)
```bash
npm run lint -w @yad/web
npm run build -w @yad/web
```
- `lint`(next lint) 통과.
- `build`(next build)가 성공해야 하며, `/report/[videoId]/[ruleVersion]` 라우트가 빌드 산출물에 포함되어야 한다.
