# step9: next-report

## 목표

Next.js 16 `next/` 앱을 초기화하고 `/report/[videoId]/[ruleVersion]` 페이지를 구현한다. SSR 빈 쉘 + noindex 메타 + 클라이언트 hash 디코드 + 매치 리스트 + 타임스탬프 점프 링크. `next build` prerender 통과(BLOCK #8 교훈).

## Scope

- **생성**:
  - `next/package.json`
  - `next/tsconfig.json`
  - `next/next.config.ts`
  - `next/app/layout.tsx`
  - `next/app/page.tsx` — 루트 placeholder(noindex).
  - `next/app/report/[videoId]/[ruleVersion]/page.tsx` — SSR 빈 쉘.
  - `next/app/report/[videoId]/[ruleVersion]/report.client.tsx` — "use client", hash 디코드 + 렌더.
  - `next/app/robots.ts` — 전역 noindex(옵션).
  - `next/.env.example`
- **수정 금지**: `shared/`, `extension/`.

## 읽어야 할 파일

- `docs/plan_mvp2/ADR.md` (ADR-004, ADR-007, ADR-010, ADR-014)
- `docs/plan_mvp2/ARCHITECTURE.md` (next 경계, 데이터 흐름 6단계)
- `docs/plan_mvp2/PRD.md` (보고서 섹션)
- `docs/plan_mvp2/phases/step0-audit.md` (Node 버전, 비대화형 설정)
- `TROUBLESHOOTING.md` (BLOCK #5, #8)

## 작업 절차

1. `next/package.json`
   - `name`: `"@yad/next"`, `private`: true, `type`: `"module"`.
   - `scripts`:
     - `"dev": "next dev"`
     - `"build": "next build"`
     - `"start": "next start"`
     - `"typecheck": "tsc --noEmit"`
     - `"lint": "next lint --no-interactive"` **또는** 비대화형 eslint 직접 호출(BLOCK #5: `next lint`가 설정 생성 프롬프트로 hang).
   - `dependencies`:
     - `"next": "^16"`(step0 audit이 확정한 최신 16.x).
     - `"react": "^19"`, `"react-dom": "^19"`.
     - `"@yad/shared": "file:../shared"`.
   - `devDependencies`: `"typescript": "^5.5"`, `"@types/react"`, `"@types/react-dom"`, `"@types/node"`, `"eslint"`, `"eslint-config-next"`.
   - **금지 필드**: `workspaces`.

2. `next/tsconfig.json` — Next 16 App Router 표준 템플릿(`moduleResolution: "bundler"`, `jsx: "preserve"`, `strict: true`, `paths.@yad/*`는 필요 없음 — shared는 npm 패키지로 참조).

3. `next/next.config.ts`
   ```ts
   import type { NextConfig } from "next";
   // 보고서는 CSR 중심. 로봇 인덱싱 전면 차단.
   const config: NextConfig = { reactStrictMode: true };
   export default config;
   ```

4. `next/app/layout.tsx`
   ```tsx
   import type { Metadata } from "next";
   export const metadata: Metadata = { robots: { index: false, follow: false } };
   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (<html lang="ko"><body>{children}</body></html>);
   }
   ```

5. `next/app/page.tsx`
   ```tsx
   export default function Home() {
     return <main style={{padding: 24}}>youtube-ad-detector 보고서. 확장의 배지를 클릭하면 이 도메인의 <code>/report/[videoId]/[ruleVersion]</code>로 이동합니다.</main>;
   }
   ```

6. `next/app/report/[videoId]/[ruleVersion]/page.tsx` — SSR 빈 쉘
   ```tsx
   import type { Metadata } from "next";
   import Report from "./report.client";
   export const metadata: Metadata = { robots: { index: false, follow: false } };
   // hash fragment 기반 CSR이라 SSR은 shell만. params는 path로 전달돼 link 복원에 사용 가능.
   export default async function Page({ params }: { params: Promise<{ videoId: string; ruleVersion: string }> }) {
     const { videoId, ruleVersion } = await params;    // Next 16: params는 Promise
     return <Report videoId={videoId} ruleVersion={ruleVersion} />;
   }
   ```

7. `next/app/report/[videoId]/[ruleVersion]/report.client.tsx`
   ```tsx
   "use client";
   import { useEffect, useState } from "react";
   import { decodePayload, getRuleSet, type AnalyzeResult } from "@yad/shared";

   type ViewState =
     | { kind: "loading" }
     | { kind: "ok"; result: AnalyzeResult }
     | { kind: "corrupt" }
     | { kind: "version-skew"; version: string };

   export default function Report({ videoId, ruleVersion }: { videoId: string; ruleVersion: string }) {
     const [view, setView] = useState<ViewState>({ kind: "loading" });
     useEffect(() => {
       try {
         const hash = window.location.hash;                // #data=...
         const result = decodePayload(hash);
         if (!getRuleSet(result.ruleVersion)) { setView({ kind: "version-skew", version: result.ruleVersion }); return; }
         if (result.videoId !== videoId || result.ruleVersion !== ruleVersion) { setView({ kind: "corrupt" }); return; }
         setView({ kind: "ok", result });
       } catch { setView({ kind: "corrupt" }); }
     }, [videoId, ruleVersion]);
     if (view.kind === "loading") return <main>로딩 중…</main>;
     if (view.kind === "corrupt") return <main>데이터가 손상되었거나 링크가 유효하지 않습니다.</main>;
     if (view.kind === "version-skew") return <main>rule {view.version} 버전 동기화 중입니다. 잠시 후 다시 열어주세요.</main>;
     const { result } = view;
     const ruleSet = getRuleSet(result.ruleVersion)!;
     const ruleMap = new Map(ruleSet.rules.map(r => [r.id, r]));
     return (
       <main style={{padding: 24, fontFamily: "system-ui"}}>
         <h1>분석 보고서</h1>
         <p>상태: <b>{result.state}</b> · 매치 {result.matches.length}건{result.truncated ? ` (+${result.truncated} truncated)` : ""}</p>
         <ul>
           {result.matches.map((m, i) => {
             const rule = ruleMap.get(m.ruleId);
             const sec = Math.floor(m.start_ms / 1000);
             const jump = `https://www.youtube.com/watch?v=${result.videoId}&t=${sec}s`;
             return (
               <li key={i} style={{marginBottom: 12}}>
                 <div>"{m.text}" <a href={jump} target="_blank" rel="noreferrer">[{sec}s]</a></div>
                 <div style={{fontSize: 12, color: "#555"}}>{rule?.description ?? m.ruleId} · {rule?.lawRef ?? ""}</div>
               </li>
             );
           })}
         </ul>
         <footer style={{marginTop: 24, fontSize: 12, color: "#888"}}>본 보고서는 자동 탐지 결과이며 최종 판단은 시청자의 몫입니다.</footer>
       </main>
     );
   }
   ```

8. ESLint 비대화형 설정(BLOCK #5)
   - `next/eslint.config.mjs`(flat) 또는 `next/.eslintrc.json` 수동 작성. `next lint` 처음 실행 시 대화형 프롬프트가 뜨지 않도록 **반드시 사전 생성**.

9. **install + build 실측**
   - `cd next && npm install`
   - `cd next && npm run build` — **prerender까지 성공해야 한다**(BLOCK #8: 이 단계에서 React 인스턴스 분열이 드러남).

## 불변식

- `workspaces` 필드 부활 금지(ADR-003).
- 보고서 페이지의 실제 데이터는 **hash fragment**를 통해서만 수신(ADR-007). `?data=` 쿼리 사용 금지.
- `<meta robots>` noindex 유지(PRD).
- `decodePayload`는 shared에서 가져오고 여기서 재구현하지 않는다.

## AC (Acceptance Criteria)

1. `cd next && npm install` → exit 0.
2. `cd next && npx tsc --noEmit` → exit 0.
3. `cd next && npm run build` → exit 0, **prerender 성공**(BLOCK #8 회귀 방지).
4. `test -d next/node_modules/react && test -d next/node_modules/@yad/shared && echo OK`.
5. `grep -E '"workspaces"' next/package.json | wc -l` → `0`.
6. `grep -E '"@yad/shared"\s*:\s*"file:\.\./shared"' next/package.json` → match.
7. `grep -E 'index:\s*false' next/app/layout.tsx next/app/report/*/*/page.tsx` → ≥ 1 match.
8. `grep -E 'window\.location\.hash' next/app/report/*/*/report.client.tsx` → match.
9. `grep -E '"use client"' next/app/report/*/*/report.client.tsx` → match.
10. `test ! -f package.json` → OK (루트 package.json 여전히 없어야 함).

## 금지사항

- `/api/*` 라우트 생성 금지. 이유: ARCHITECTURE next 경계, ADR-001·007.
- SSR에서 hash fragment 접근 시도 금지(서버에는 도달하지 않음). 이유: 원천적으로 불가능한 동작.
- 보고서 payload를 query string으로 받는 변형 금지. 이유: ADR-007 프라이버시.
- `workspaces` 필드 사용 금지. 이유: BLOCK #8.
- `next lint`를 **AC가 아닌 명령으로 최초 실행** 금지(대화형 프롬프트 위험). 이유: BLOCK #5. 사전에 eslint config를 직접 작성.

## 본 step 이후 일시적으로 깨지는 코드

- 없음(플랜 마지막 step).

## AC 직접성 체크리스트

1. **의도 직접 측정?** — `next build`를 prerender까지 실행(BLOCK #8 교훈: build 자체가 React 호환성의 실제 검증). 프록시 아님.
2. **Scope⊇AC?** — `next/` 안에서만 검증. `shared/`·`extension/` 미접촉.
3. **실패 원인 step 내 해결 가능?** — 버전·설정·컴포넌트 모두 이 step 내 수정. shared·extension 의존은 이미 완료된 상태이므로 frozen broken 없음.
