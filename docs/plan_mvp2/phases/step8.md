# step8: extension-background-wire

## 목표

background service worker에서 `YAD_ANALYZE` / `YAD_OPEN_REPORT` 메시지를 처리한다. `shared.analyze` 호출 + 최근 5건 `chrome.storage.session` 캐시 + `chrome.tabs.create` 수행. 확장 end-to-end 번들 성공.

## Scope

- **수정**:
  - `extension/src/background.ts` — stub을 완성 구현으로 교체.
- **생성**: 없음(단 extension/src/lib 하위에 storage 헬퍼 1개 추가 가능).

## 읽어야 할 파일

- `docs/plan_mvp2/ADR.md` (ADR-001, ADR-007, ADR-012, ADR-017)
- `docs/plan_mvp2/ARCHITECTURE.md` (데이터 흐름 3~5단계, 패턴)
- `extension/src/contents/badge.ts` — 메시지 계약
- `extension/src/config.ts`

## 작업 절차

1. `extension/src/background.ts`
   ```ts
   import { analyze, detectAdSignal, encodePayload, LATEST_RULE_VERSION } from "@yad/shared";
   import { REPORT_URL } from "~config";

   // 최근 분석 결과 캐시 상한 (seed, ADR-017).
   const CACHE_LIMIT = 5;
   const CACHE_KEY = "yad_recent";

   chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
     if (msg?.type === "YAD_ANALYZE") {
       handleAnalyze(msg).then(sendResponse).catch(() => sendResponse(null));
       return true;        // async 응답
     }
     if (msg?.type === "YAD_OPEN_REPORT") {
       if (typeof msg.url === "string") chrome.tabs.create({ url: msg.url });
       return false;
     }
     return false;
   });

   async function handleAnalyze(msg: any) {
     const { videoId, cues, pageMetadata, ruleVersion } = msg;
     if (!Array.isArray(cues) || typeof videoId !== "string") return null;
     try {
       const adSignal = detectAdSignal(cues, pageMetadata ?? { title: "" });
       const result = analyze(cues, ruleVersion ?? LATEST_RULE_VERSION, adSignal, videoId);
       await pushCache(result);
       return result;
     } catch { return null; }        // ADR-012 silent fail
   }

   async function pushCache(result: unknown) {
     const store = await chrome.storage.session.get(CACHE_KEY);
     const arr: unknown[] = Array.isArray(store[CACHE_KEY]) ? store[CACHE_KEY] : [];
     arr.unshift(result);
     arr.length = Math.min(arr.length, CACHE_LIMIT);
     await chrome.storage.session.set({ [CACHE_KEY]: arr });
   }
   ```
   - `encodePayload`는 여기서 호출 안 함(badge 측이 이미 encoded URL을 만들어 보냄). 단 import는 유지해도 무방.

2. plasmo는 `src/background.ts`를 자동으로 service worker entry로 채택. 추가 manifest 설정 불필요.

3. **unit test 금지** — background는 chrome API 의존. 검증은 plasmo build + 수동 smoke에 맡긴다(ADR-016).

## 불변식

- 모든 async 경로는 **throw를 바깥으로 내보내지 않는다**(ADR-012 silent fail).
- `chrome.tabs.create`는 background에서만 호출(content script 권한 없음).
- 캐시 상한 `CACHE_LIMIT=5` 준수(ADR-017 seed).

## AC (Acceptance Criteria)

1. `cd extension && npx tsc --noEmit` → exit 0.
2. `cd extension && npm run build` → exit 0. `extension/build/chrome-mv3-prod/` 내 service_worker 번들 생성.
3. `cat extension/build/chrome-mv3-prod/manifest.json | python3 -c 'import json,sys; m=json.load(sys.stdin); assert "background" in m and m["background"].get("service_worker"), m'` → exit 0.
4. `grep -E 'chrome\.runtime\.onMessage\.addListener' extension/src/background.ts` → match.
5. `grep -E 'chrome\.storage\.session' extension/src/background.ts` → match.
6. `grep -E 'chrome\.tabs\.create' extension/src/background.ts` → match.
7. `grep -E 'YAD_ANALYZE' extension/src/background.ts` → match.
8. `grep -E 'YAD_OPEN_REPORT' extension/src/background.ts` → match.
9. `grep -E '(throw |console\.error)' extension/src/background.ts | wc -l` → `0` (silent fail).

## 금지사항

- e2e 테스트 스크립트 추가 금지. 이유: ADR-016, 수동 smoke가 MVP 결정.
- `@yad/shared`를 re-implement 금지. 이유: ADR-002·005 경계.
- 외부 HTTP 요청 금지(analyze는 순수 로컬). 이유: ADR-001 프라이버시.
- `chrome.storage.local` 사용 금지. 이유: 캐시는 session-scoped(프라이버시).

## 본 step 이후 일시적으로 깨지는 코드

- next 보고서 앱이 아직 없어 배지 클릭 시 localhost:3000 404. 의도된 상태이며 step9에서 해결.

## AC 직접성 체크리스트

1. **의도 직접 측정?** — plasmo build 산출 manifest의 service_worker 필드 + 실제 코드의 chrome API 사용을 검증.
2. **Scope⊇AC?** — `extension/src/background.ts` + 확장 빌드에 국한.
3. **실패 원인 step 내 해결 가능?** — 메시지 핸들러·캐시 로직 모두 이 step 내 수정 완결.
