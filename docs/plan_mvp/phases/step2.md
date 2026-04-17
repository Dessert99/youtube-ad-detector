# step 2 — next-report-nest

`next/app/`의 구 서버 API를 제거하고, 보고서 경로를 `[videoId]` 단일에서 `[videoId]/[ruleVersion]` 중첩으로 이동한다. MVP에서는 메타 정보만 담은 스텁 페이지를 렌더한다.

## 읽어야 할 파일

- `docs/plan_mvp/PRD.md`
- `docs/plan_mvp/ADR.md` (특히 ADR-001, ADR-007)
- `docs/plan_mvp/ARCHITECTURE.md`
- `next/app/api/analyze/route.ts` (현 상태 — 삭제 대상)
- `next/app/report/[videoId]/page.tsx` (현 상태 — 삭제 대상)
- `next/app/page.tsx` (현 상태 — 안내 문구만 유지)
- `next/app/layout.tsx` (현 상태 — 수정 없음)
- `shared/src/index.ts` (step 0 산출물 — `RULE_VERSION` 참조)

## 선행 조건 — `@yad/shared` 동기화

step 0에서 `shared/src/`가 바뀌었다. `file:` 프로토콜의 설치 동작이 환경에 따라 다르므로, 작업 시작 시 반드시 `cd next && npm install`을 한 번 돌려 `@yad/shared`가 최신 상태인지 확정한다.

## Scope

`next/app/**` **만** 수정한다. `next/package.json`, `next/next.config.ts`, `next/tsconfig.json` 등은 건드리지 않는다.

### 변경 대상 파일

1. `next/app/api/analyze/` — 디렉터리 전체 **삭제** (ADR-001, 서버 rule 엔진 제거).
2. `next/app/report/[videoId]/page.tsx` — **삭제**.
3. `next/app/report/[videoId]/[ruleVersion]/page.tsx` — **신규 생성** (스텁 SSR).
4. `next/app/page.tsx` — 안내 문구의 경로 예시를 `/report/{videoId}/{ruleVersion}`로 업데이트.

### 시그니처·불변식

#### `next/app/report/[videoId]/[ruleVersion]/page.tsx` (신규)

```tsx
export default async function ReportPage({
  params,
}: {
  params: Promise<{ videoId: string; ruleVersion: string }>
}) {
  const { videoId, ruleVersion } = await params
  return (
    // 메타: videoId, ruleVersion
    // 본문: "상세 보고서는 추후 제공됩니다" 문구
  )
}
```

**불변식**:
- Next.js 15 규약: `params`는 Promise. 반드시 `await params`로 언팩 (기존 `[videoId]/page.tsx` 패턴 유지).
- **findings·자막·법조항 나열 금지** (ADR-007, "메타 정보만 담은 스텁 페이지"). 렌더 대상은 `videoId`, `ruleVersion`, 안내 문구뿐.
- URL의 `ruleVersion`과 `shared`의 현재 `RULE_VERSION`이 **다르더라도 그대로 렌더**한다 (MVP 결정: 404 로직 없음). 현재 `RULE_VERSION`을 참조할 필요 없음.
- 저장소·데이터베이스·네트워크 호출 **금지** (MVP는 stateless).
- 페이지 메타데이터(`export const metadata`)는 선택. 추가 시 `layout.tsx`의 기본값을 덮어쓰지 않게.

#### `next/app/page.tsx`

기존 안내 문구의 `/report/{videoId}` 예시를 `/report/{videoId}/{ruleVersion}`로만 교체. 그 외 변경 금지.

#### 삭제 작업

- `next/app/api/analyze/route.ts` 및 `next/app/api/analyze/` 디렉터리 — `rm -rf` 수준으로 완전 제거. 디렉터리 남기지 말 것.
- `next/app/api/` 디렉터리가 비면 함께 제거 (빈 디렉터리 유지 금지).
- `next/app/report/[videoId]/page.tsx` 제거. **단**, `[videoId]/[ruleVersion]/page.tsx`가 생성된 **후**에 삭제해 중간 상태에서도 타입·빌드가 깨지지 않도록 한다.

## 금지사항

- `next/package.json`, `next/next.config.ts`, `next/tsconfig.json`, `next/next-env.d.ts` 수정 금지. **이유**: 의존성/설정 변경은 BLOCK #7~#8의 호이스팅·React 19 이슈를 재유발할 수 있다.
- `next/app/layout.tsx` 수정 금지. **이유**: Scope 외. 전역 HTML 골격은 본 플랜의 변경 대상 아님.
- 서버 측 rule 엔진·DB·fetch 호출 추가 금지. **이유**: ADR-001은 확장 단독 실행을 결정했고, 서버 경유 구조 복원은 재논의 대상(ADR 재작성).
- `findings`·자막 본문 렌더 금지. **이유**: ADR-007 "MVP는 메타 정보만 담은 스텁". 상세 렌더는 post-MVP.
- `next/app/report/[videoId]/[ruleVersion]/` 외의 위치에 새 라우트 생성 금지. **이유**: Scope 외.

## 본 step 이후 일시적으로 깨지는 코드

없음. 본 step은 플랜의 마지막 step이며, 완료 시 `shared`·`extension`·`next`가 모두 새 구조로 정합된 상태가 되어야 한다.

## Acceptance Criteria

```bash
cd next && npm install
cd ../next && npm run lint
cd ../next && npm run build
test ! -e next/app/api/analyze
test ! -e next/app/report/\[videoId\]/page.tsx
test -f next/app/report/\[videoId\]/\[ruleVersion\]/page.tsx
grep -Rn "AnalyzeRequest\|AnalyzeResponse\|transcriptSource" next/app && exit 1 || true
cd .. && cd extension && npm run build
```

## AC 직접성 체크리스트

1. **의도 직접 측정?** — `next build`는 "SSR이 실제로 렌더되는가"를 프로덕션 빌드로 측정. 마지막 `extension build`는 "shared 변경 이후 확장도 여전히 번들되는가"를 확인 (플랜 전체 정합성 최종 검증). 프록시 아님.
2. **Scope와 AC 영역 일치?** — AC 대상은 `next/app/**` + 최종 정합성 검증용 extension build. shared tsc는 step 0에서 이미 통과했으므로 재검증 생략.
3. **실패 원인이 이 step에서 해결 가능?** — 라우트 이동·삭제·SSR 에러는 모두 Scope 내부 수정으로 해결 가능. 만약 extension build가 여기서 실패하면 step 1의 결과가 shared 변경과 어긋난 것이며, 해당 원인은 별도 step으로 되돌려 해결 (본 step에서 extension 코드 수정 금지).
