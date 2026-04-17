# step7: extension-isolated-badge

## 목표

Isolated world content script를 작성한다. MAIN의 메시지 수신 → debounce/videoId 가드 → 자막 fetch/파싱 → background에 analyze 요청 → 3-state 배지 DOM 주입 → 클릭 시 보고서 오픈.

## Scope

- **생성**:
  - `extension/src/contents/badge.ts`
  - `extension/src/lib/captions.ts` — fetch + XML/JSON 파싱 → `Cue[]`
  - `extension/src/lib/badge-dom.ts` — 배지 엘리먼트 생성·주입·제거
- **수정**: 없음.

## 읽어야 할 파일

- `docs/plan_mvp2/ADR.md` (ADR-006, ADR-008, ADR-012, ADR-015)
- `docs/plan_mvp2/ARCHITECTURE.md` (데이터 흐름 2~5단계)
- `docs/plan_mvp2/PRD.md` (3-state 배지 정의, tooltip 문구)
- `extension/src/config.ts`
- `extension/src/contents/main-world.ts`

## 작업 절차

1. `extension/src/lib/captions.ts`
   ```ts
   import type { Cue } from "@yad/shared";
   export async function fetchCaptions(baseUrl: string, signal: AbortSignal): Promise<Cue[]> {
     const url = new URL(baseUrl);
     url.searchParams.set("fmt", "json3");     // YouTube json3 자막 포맷 요청
     const res = await fetch(url.toString(), { signal });
     if (!res.ok) throw new Error(`caption http ${res.status}`);
     const body = await res.json();            // {events: [{tStartMs, dDurationMs, segs:[{utf8}]}, ...]}
     const cues: Cue[] = [];
     for (const ev of body.events ?? []) {
       const text = (ev.segs ?? []).map((s: any) => s.utf8 ?? "").join("").trim();
       if (!text) continue;
       const start = ev.tStartMs ?? 0;
       const end = start + (ev.dDurationMs ?? 0);
       cues.push({ text, start_ms: start, end_ms: end });
     }
     return cues;
   }
   ```
   - json3 실패 시 XML fallback은 MVP에서 생략(ADR-012 silent fail).

2. `extension/src/lib/badge-dom.ts`
   ```ts
   import type { BadgeState } from "@yad/shared";
   const BADGE_ID = "yad-badge";
   const LABELS: Record<BadgeState, string> = { safe: "안전", caution: "미확인", fraud: "의심" };
   const COLORS: Record<BadgeState, string> = { safe: "#2e7d32", caution: "#f9a825", fraud: "#c62828" };
   const TOOLTIP = "탐지기가 자동으로 의심신호를 찾은 결과이며 최종 판단은 아닙니다";

   export function removeBadge(): void {
     document.getElementById(BADGE_ID)?.remove();
   }

   export function renderBadge(state: BadgeState, onClick: () => void): void {
     removeBadge();
     const btn = document.createElement("button");
     btn.id = BADGE_ID;
     btn.type = "button";
     btn.textContent = LABELS[state];
     btn.setAttribute("aria-label", `${LABELS[state]} — ${TOOLTIP}`);
     btn.title = TOOLTIP;
     btn.style.cssText = `position:absolute;z-index:9999;top:8px;right:8px;padding:4px 10px;border-radius:6px;color:#fff;background:${COLORS[state]};font-size:12px;border:none;cursor:pointer;`;
     btn.addEventListener("click", onClick);
     const mount = document.querySelector("#movie_player") ?? document.body;
     (mount as HTMLElement).appendChild(btn);
   }
   ```

3. `extension/src/contents/badge.ts`
   - plasmo config: `matches`는 MAIN과 동일, `world`는 기본(isolated). `run_at: "document_idle"`.
   - `window.addEventListener("message", handler)`:
     - origin 검증: `event.source === window` && `event.data?.type?.startsWith("YAD_")`.
     - `YAD_PLAYER_RESPONSE` 수신 시:
       1. **debounce 500ms** + 직전 videoId와 동일하면 skip(ADR-015).
       2. 한국어 track 선택: 수동(`kind === undefined`) > 자동(`kind === "asr"`).
       3. `AbortController` + setTimeout 2000ms → `fetchCaptions(baseUrl, signal)`.
       4. fetch·parse 실패 → `console.debug`, 배지 미표시(ADR-012).
       5. `chrome.runtime.sendMessage({type: "YAD_ANALYZE", videoId, cues, pageMetadata, ruleVersion: LATEST_RULE_VERSION})`.
       6. `AnalyzeResult` 수신 → `renderBadge(result.state, () => openReport(result))`.
   - `openReport`:
     ```ts
     const encoded = encodePayload(result);
     const url = `${REPORT_URL}/report/${result.videoId}/${result.ruleVersion}#data=${encoded}`;
     chrome.tabs && chrome.runtime.sendMessage({ type: "YAD_OPEN_REPORT", url });  // background가 chrome.tabs.create 실행
     ```
     - content script에서 `chrome.tabs`는 직접 호출 불가 → background 경유(step8에서 처리).

4. debounce 구현은 파일 스코프 변수 + 타이머 ID. react state 금지(content script는 vanilla DOM).

## 불변식

- `event.source === window` 검증 없이 message 처리 금지(ARCHITECTURE 보안).
- 실패 경로 전부 **silent**(ADR-012): `console.debug`만 허용, `alert`·`console.error` 금지.
- 배지 텍스트·색은 ADR-006 스펙 고정("위반입니다" 같은 단정 문구 금지).

## AC (Acceptance Criteria)

1. `cd extension && npx tsc --noEmit` → exit 0.
2. `cd extension && npm run build` → exit 0.
3. `grep -E 'event\.source\s*===\s*window' extension/src/contents/badge.ts` → match.
4. `grep -E '"YAD_[A-Z_]+"' extension/src/contents/badge.ts | wc -l` → ≥ 2.
5. `grep -E 'setTimeout\([^)]*500' extension/src/contents/badge.ts` → match (debounce).
6. `grep -E 'AbortController' extension/src/contents/badge.ts` → match (fetch 타임아웃).
7. `grep -E '(alert\(|console\.error)' extension/src/contents/badge.ts extension/src/lib/captions.ts extension/src/lib/badge-dom.ts | wc -l` → `0` (silent fail).

## 금지사항

- `world: "MAIN"` 사용 금지. 이유: 이 파일은 isolated world(chrome API 사용).
- `chrome.tabs.create` content script 직접 호출 금지(실제로는 권한 없음). 이유: background 경유가 표준, step8에서 처리.
- React·JSX 사용 금지(content script). 이유: 번들 크기·주입 안정성.
- "위반입니다" / "불법입니다" 같은 단정 문구 사용 금지. 이유: PRD 포지셔닝("탐지기").

## 본 step 이후 일시적으로 깨지는 코드

- background가 아직 stub → `chrome.runtime.sendMessage`의 응답이 없어 실제 배지 렌더는 step8 이후에만 작동. 컴파일·번들 빌드에는 영향 없음(런타임에서만 response 미도착).

## AC 직접성 체크리스트

1. **의도 직접 측정?** — plasmo build 성공 + origin 검증·debounce·abort 계약을 grep으로 실제 코드에서 확인. 프록시 아님.
2. **Scope⊇AC?** — `extension/src/contents/badge.ts` + `extension/src/lib/*` 에만 국한.
3. **실패 원인 step 내 해결 가능?** — TS·번들 오류 모두 이 step 내 수정 가능.
