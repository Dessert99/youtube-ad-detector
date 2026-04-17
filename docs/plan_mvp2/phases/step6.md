# step6: extension-main-world

## 목표

MAIN world content script를 작성한다. `ytInitialPlayerResponse` 추출 + `yt-navigate-finish` 이벤트 구독 + `postMessage` 릴레이만 담당한다.

## Scope

- **생성**:
  - `extension/src/contents/main-world.ts`
- **수정**: 없음. 특히 `background.ts`·`badge.ts` 손대지 말 것.

## 읽어야 할 파일

- `docs/plan_mvp2/ADR.md` (ADR-008, ADR-015)
- `docs/plan_mvp2/ARCHITECTURE.md` (데이터 흐름 1~2단계, 보안 섹션)
- `extension/src/config.ts`

## 작업 절차

1. `extension/src/contents/main-world.ts`
   - plasmo content script 설정:
     ```ts
     import type { PlasmoCSConfig } from "plasmo";
     export const config: PlasmoCSConfig = {
       matches: ["https://www.youtube.com/watch*", "https://www.youtube.com/shorts/*"],
       world: "MAIN",
       run_at: "document_start",
     };
     ```
   - `yt-navigate-finish` 리스너 등록 → 핸들러 실행:
     1. `window.location.href`에서 videoId 파싱(watch: `?v=` 쿼리, shorts: path 마지막 세그먼트).
     2. videoId 없으면 return.
     3. `window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks`에서 한국어 트랙 후보 배열 추출(`languageCode === "ko"` 우선, `kind === undefined` 가 수동 자막, `kind === "asr"` 가 자동).
     4. 없으면 return(F1/F2, silent).
     5. `window.postMessage({ type: "YAD_PLAYER_RESPONSE", videoId, captionTracks, pageMetadata: {title: document.title} }, "*")`.
   - 페이지 최초 로드 시에도 한 번 실행(`yt-navigate-finish`가 이미 지나갔을 가능성). `document.readyState !== "loading"` 이면 즉시 한 번.

2. **MAIN world 제약 준수**
   - chrome API 사용 금지(MAIN world는 chrome 네임스페이스 없음).
   - 쿠키·token 접근 금지. playerResponse 읽기 + postMessage만.
   - postMessage payload에 사용자 식별 정보(쿠키·계정) 포함 금지.

3. **타입 선언**
   - 파일 상단에 `declare global { interface Window { ytInitialPlayerResponse?: {...}; } }` 최소 타입.
   - `captionTracks` 배열 요소 타입: `{ baseUrl: string; languageCode: string; kind?: "asr" }` 정도.

## 불변식

- `world: "MAIN"`은 절대 변경하지 않는다(ADR-008).
- postMessage의 `type`은 `"YAD_*"` 접두사 유지(isolated world의 origin 검증 계약).
- videoId 변경 가드·debounce는 이 step에서 다루지 않는다(step7의 isolated world 책임).

## AC (Acceptance Criteria)

1. `cd extension && npx tsc --noEmit` → exit 0.
2. `cd extension && npm run build` → exit 0.
3. `grep -E 'world:\s*"MAIN"' extension/src/contents/main-world.ts` → match.
4. `grep -E 'run_at:\s*"document_start"' extension/src/contents/main-world.ts` → match.
5. `grep -c 'chrome\.' extension/src/contents/main-world.ts` → `0` (MAIN world는 chrome 네임스페이스 없음).
6. `grep -E 'YAD_PLAYER_RESPONSE' extension/src/contents/main-world.ts` → match.

## 금지사항

- `chrome.*` API 사용 금지. 이유: MAIN world runtime 미제공 + 보안(ADR-008).
- 자막 fetch 직접 수행 금지. 이유: isolated world의 책임(step7), MAIN에서 fetch 시 보안 surface 확장.
- debounce·videoId 캐시 구현 금지. 이유: step7 Scope.
- `document.cookie`, `localStorage` 접근 금지. 이유: 최소 권한·프라이버시(PRD).

## 본 step 이후 일시적으로 깨지는 코드

- isolated world(`badge.ts`)가 아직 없으므로 MAIN이 post하는 메시지는 수신자 없음. 이는 의도된 중간 상태(step7에서 해결). plasmo build에는 영향 없음(수신자 부재는 런타임 no-op).

## AC 직접성 체크리스트

1. **의도 직접 측정?** — plasmo build 통과 + MAIN world 설정 실재 grep. 의도의 일반적 부산물이 아닌 계약 자체를 검증.
2. **Scope⊇AC?** — `extension/src/contents/main-world.ts` 1파일만 변경·검증.
3. **실패 원인 step 내 해결 가능?** — MAIN world TS 오류·plasmo config 오류 모두 이 step 내 수정 가능.
