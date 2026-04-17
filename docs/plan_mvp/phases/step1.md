# step 1 — extension-lean-rewrite

`extension/`을 서버 경유 구조에서 "확장 단독 rule 엔진" 구조로 재배선한다. 자막 추출 content script를 신설하고, `analyze()`를 content script에서 직접 호출해 배지를 렌더한다. background는 `OPEN_REPORT`만 담당하도록 축소한다.

## 읽어야 할 파일

- `docs/plan_mvp/PRD.md`
- `docs/plan_mvp/ADR.md` (특히 ADR-001, ADR-004, ADR-005, ADR-006)
- `docs/plan_mvp/ARCHITECTURE.md`
- `TROUBLESHOOTING.md` (§11 step 순서 규칙)
- `extension/background.ts` (현 상태 — 전면 교체 대상)
- `extension/contents/youtube.ts` (현 상태 — 전면 교체 대상)
- `extension/lib/config.ts` (현 상태 — 축소 대상)
- `extension/package.json` (manifest 블록 일부만 수정 대상)
- `shared/src/index.ts` (step 0 산출물 — `analyze`, `RULES`, `RULE_VERSION` 확인)

## 선행 조건 — `@yad/shared` 동기화

step 0에서 `shared/src/`가 바뀌었다. `file:` 프로토콜은 환경에 따라 symlink 또는 copy로 설치되므로, 작업 시작 시 반드시 `cd extension && npm install`을 한 번 돌려 `@yad/shared`가 최신 상태인지 확정한다 (ADR-008 트레이드오프).

## Scope

`extension/{background.ts, contents/*, lib/*}` 4개 파일 + `extension/package.json`의 **manifest.permissions 배열만** 수정.

### 변경 대상 파일

1. `extension/lib/config.ts` — `ANALYZE_PATH` 상수 제거. `API_BASE_URL`만 유지 (보고서 URL 조립용).
2. `extension/background.ts` — `ANALYZE_VIDEO` 핸들러·`analyzeVideo()` 함수 제거. `OPEN_REPORT`만 남김.
3. `extension/contents/transcript.ts` (신규) — 한국어 자막 추출.
4. `extension/contents/youtube.ts` — `analyze()` 직접 호출로 재배선 + 배지 렌더 수정.
5. `extension/package.json` — `manifest.permissions`에서 `"storage"` 제거. `"tabs"`는 유지 (`chrome.tabs.create`용). (ADR-006 최소 권한.)

### 시그니처·불변식

#### `lib/config.ts`

```ts
export const API_BASE_URL = process.env.PLASMO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
```

`ANALYZE_PATH` 상수는 **삭제**. 다른 곳에서도 import되지 않도록 확인.

#### `background.ts`

```ts
type Message = { type: 'OPEN_REPORT'; reportUrl: string }

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_REPORT') {
    chrome.tabs.create({ url: `${API_BASE_URL}${message.reportUrl}` })
    sendResponse({ ok: true })
  }
  return false
})
```

**불변식**:
- 네트워크 fetch·서버 호출 코드 **금지** (ADR-001).
- `ANALYZE_VIDEO` 메시지 타입·핸들러 **제거**.
- `reportUrl`은 `/`로 시작하는 경로 (예: `/report/{videoId}/{ruleVersion}`) 라고 가정하고 `API_BASE_URL`과 문자열 결합.

#### `contents/transcript.ts` (신규)

```ts
export async function fetchKoreanTranscript(
  videoId: string,
): Promise<TranscriptSegment[] | null>
```

**불변식 (매우 중요)**:

- **isolated world 제약 우회**: content script는 page world의 `window.ytInitialPlayerResponse`에 **직접 접근할 수 없다**. 대신 `document.documentElement.innerHTML`(또는 `document.querySelectorAll('script')`)을 읽어 **inline `<script>` 텍스트 중 `var ytInitialPlayerResponse = {...};` 부분을 정규식으로 추출 → `JSON.parse`**. MAIN world 주입·`chrome.scripting.executeScript`는 금지 (content script만으로 해결).
- **SPA 전환 내구성**: 유튜브는 SPA이므로 `yt-navigate-finish` 이후 `window` 전역이 갱신되지 않을 수 있다. 따라서 `fetchKoreanTranscript`는 호출될 때마다 **매번 HTML을 재파싱**한다. 모듈 스코프에 파싱 결과를 캐시하지 말 것.
- **videoId 검증**: 파싱된 `ytInitialPlayerResponse.videoDetails.videoId`가 인자 `videoId`와 일치하지 않으면 SPA 전환 중 stale 상태로 간주하고 `null` 반환. (재호출은 상위가 결정.)
- **트랙 선택 우선순위 (ADR-005)**:
  1. `captions.playerCaptionsTracklistRenderer.captionTracks` 중 `languageCode`가 `ko`로 시작하고 `kind !== 'asr'`
  2. 없으면 `languageCode`가 `ko`로 시작하고 `kind === 'asr'`
  3. 둘 다 없으면 `null` 반환 (스킵)
- **fetch**: 선택된 트랙의 `baseUrl`에 `&fmt=json3`를 덧붙여 `fetch`. JSON 응답의 `events` 배열을 `TranscriptSegment[]`로 변환 (`start = event.tStartMs/1000`, `end = start + (event.dDurationMs/1000 ?? 0)`, `text = event.segs.map(s=>s.utf8).join('')` trim). 비어 있거나 파싱 실패 시 `null`.
- **Fail-safe (ADR-004)**: 어떤 예외도 상위로 던지지 않고 `console.warn`만 남기고 `null` 반환.

`PlasmoCSConfig`를 export하지 않는다 (이 파일은 라이브러리 모듈이고 주입 대상은 `contents/youtube.ts`만).

#### `contents/youtube.ts`

```ts
import type { PlasmoCSConfig } from 'plasmo'
import { analyze, RULES, RULE_VERSION } from '@yad/shared'
import { fetchKoreanTranscript } from './transcript'

export const config: PlasmoCSConfig = {
  matches: ['https://www.youtube.com/watch*'],
  run_at: 'document_idle',
}
```

**흐름 불변식**:

1. `yt-navigate-finish` 이벤트 + 초기 진입 시 `bootstrap()` 실행.
2. `extractVideoId()` → URL의 `v` 파라미터.
3. `lastAnalyzedVideoId` 가드로 같은 videoId 재진입 스킵.
4. `fetchKoreanTranscript(videoId)` 호출. `null`이면 **UI 미표시로 스킵** (ADR-004, 배지 렌더 호출 안 함).
5. `analyze(segments, RULES, RULE_VERSION)` 호출 → `AnalyzeResult`.
6. `renderBadge(result, videoId)`:
   - `result.verdict === 'safe'` → **배지 미표시**. 기존 `#yad-badge`가 있으면 제거 (PRD "safe는 완전 미표시", 사용자 승인).
   - `result.verdict === 'fraud'` → 배지 DOM(`id="yad-badge"`)을 `position:fixed` 우측 하단에 렌더. 텍스트 예: "⚠ 의심 표현 {findings.length}건 · 자세히 보기". 클릭 시 `chrome.runtime.sendMessage({ type: 'OPEN_REPORT', reportUrl: \`/report/${videoId}/${result.ruleVersion}\` })`.
7. 전체 흐름을 `try/catch`로 감싸 예외는 `console.warn` 후 UI 미표시로 폴백 (ADR-004).

**불변식**:
- `chrome.runtime.sendMessage`는 `OPEN_REPORT` 타입으로만 호출. `ANALYZE_VIDEO` 잔재 금지.
- 배지 DOM id는 `yad-badge`로 고정 (ARCHITECTURE).
- `reportUrl`은 **반드시** `/report/${videoId}/${result.ruleVersion}` 형식 (ADR-007).
- `lastAnalyzedVideoId`는 모듈 스코프 `let` 변수. videoId 변경 시에만 갱신.

#### `extension/package.json` (manifest 블록)

변경 전:
```json
"permissions": ["tabs", "storage"]
```
변경 후:
```json
"permissions": ["tabs"]
```

다른 필드(dependencies, scripts, host_permissions 등)는 **절대 건드리지 않는다**.

## 금지사항

- `extension/popup.tsx` 수정 금지. **이유**: Scope 외. MVP 안내 문구로 충분.
- `extension/assets/` 수정 금지. **이유**: 아이콘 등 릴리스 자산은 본 플랜의 변경 대상 아님.
- `extension/package.json`의 `dependencies`, `scripts`, `host_permissions`, `displayName`, `name`, `version` 등 수정 금지. **이유**: 버전/스크립트 변경은 BLOCK #7~#8에서 검증된 호이스팅·호환성 리스크를 재유발. 본 step에서는 `manifest.permissions` 배열만 건드린다.
- `shared/` 수정 금지. **이유**: step 0에서 완료. 다시 건드리면 의도 충돌.
- `chrome.scripting.executeScript` · MAIN world 주입 사용 금지. **이유**: content script + HTML 파싱으로 이미 해결됨. MAIN world 주입은 `scripting` 권한 추가를 요구해 ADR-006 최소 권한 원칙과 충돌.
- 정규식 기반 키워드 매칭 코드 작성 금지. **이유**: 매칭은 `analyze()`에서만 일어나며 ADR-003에 따라 `includes`만 사용. content script에서 별도 매칭 구현 금지.
- 네트워크 fetch 중 `https://*.youtube.com/*` 이외의 origin 호출 금지. **이유**: host_permissions 범위 밖.

## 본 step 이후 일시적으로 깨지는 코드

- `next/app/api/analyze/route.ts` — 구 서버 API. step 2에서 삭제 예정. 본 step의 AC에 `cd next && npm run build`를 **포함하지 않는다**.
- `next/app/report/[videoId]/page.tsx` — 구 경로. step 2에서 `[videoId]/[ruleVersion]`로 이동. 마찬가지로 next build AC 금지.

## Acceptance Criteria

```bash
cd extension && npm install
cd ../extension && npm run lint
cd ../extension && npm run build
grep -Rn "ANALYZE_VIDEO\|ANALYZE_PATH\|analyzeVideo" extension/background.ts extension/contents extension/lib && exit 1 || true
grep -Rn "\"storage\"" extension/package.json && exit 1 || true
grep -Rn "window\.ytInitialPlayerResponse" extension/contents && exit 1 || true
grep -Rn "chrome\.scripting\.executeScript" extension/contents extension/background.ts && exit 1 || true
```

## AC 직접성 체크리스트

1. **의도 직접 측정?** — `plasmo build`는 "확장이 실제 번들되는가"를 실행으로 측정. `grep` 가드는 "구 구조 잔재가 남지 않았는가"를 문자열 존재로 직접 측정. 프록시 아님.
2. **Scope와 AC 영역 일치?** — AC는 `extension/{background.ts, contents, lib, package.json}`만 검사. shared·next는 검사 대상 아님 (step 2에서 next 빌드 검증).
3. **실패 원인이 이 step에서 해결 가능?** — 타입 에러·빌드 실패·잔재 문자열·권한 축소 모두 Scope 내부 파일 수정으로 해결 가능.
