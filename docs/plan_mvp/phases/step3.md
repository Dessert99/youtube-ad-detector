# step3: extension-rewire

## 목표
확장의 content script와 background를 "확장 단독 분석 + 2-state 배지" 모델로 재배선한다. 서버 `/api/analyze` 호출 경로를 완전히 제거하고, `@yad/shared`의 `analyze()`를 로컬에서 호출해 결과에 따라 배지를 렌더한다.

## 읽어야 할 파일
- `docs/plan_mvp/ADR.md` (특히 ADR-010 2-state, ADR-012 확장 분석)
- `docs/plan_mvp/ARCHITECTURE.md` (데이터 흐름)
- `apps/extension/contents/youtube.ts` (재작성 대상)
- `apps/extension/background.ts` (재작성 대상)
- `apps/extension/lib/config.ts` (축소 대상)
- `apps/extension/contents/transcript.ts` (step2 산출물, 이 스텝에서 import)
- `packages/shared/src/index.ts`, `packages/shared/src/analyze.ts`, `packages/shared/src/rules.ts` (step1 산출물, 이 스텝에서 import)
- `packages/shared/src/types.ts` (`AnalyzeResult`, `Verdict`, `TranscriptSegment`)

## Scope
다음 3개 파일만 수정한다. 다른 파일은 건드리지 않는다.
- `apps/extension/contents/youtube.ts`
- `apps/extension/background.ts`
- `apps/extension/lib/config.ts`

## 작업
1) **`apps/extension/lib/config.ts`**
   - `ANALYZE_PATH` 상수를 **삭제**한다(서버 엔드포인트가 없어졌으므로).
   - `API_BASE_URL`은 유지 — 보고서 페이지 베이스로 계속 쓴다.

2) **`apps/extension/contents/youtube.ts`** 재작성
   - import:
     - `@yad/shared`에서 `analyze`, `RULE_VERSION`, 타입 `AnalyzeResult`
     - `./transcript`에서 `loadKoreanTranscript`
   - 기존 구조(SPA 전환 훅, `lastAnalyzedVideoId` 가드, `bootstrap`)는 유지.
   - `analyze(videoId)` 흐름:
     - `loadKoreanTranscript()` → `null`이면 기존 배지를 제거하고 return(UI 미표시).
     - 있으면 `@yad/shared.analyze(segments)` 호출해 `AnalyzeResult` 획득.
     - `renderBadge(result, videoId, RULE_VERSION)` 호출.
   - `renderBadge(result: AnalyzeResult, videoId: string, ruleVersion: string)`:
     - 기존 `#yad-badge` 제거 후 재생성.
     - `result.verdict === 'safe'`: 작은 회색 배지만 표시하거나 아예 DOM을 삽입하지 않아도 된다(ADR-010이 "작은 배지 또는 미표시" 허용). **단, "자세히 보기" 링크는 절대 노출하지 않는다.**
     - `result.verdict === 'fraud'`: 빨간 배경의 배지 + "자세히 보기" 텍스트. 클릭 시 `chrome.runtime.sendMessage({ type: 'OPEN_REPORT', videoId, ruleVersion })`.
   - `fetch`나 `chrome.runtime.sendMessage({ type: 'ANALYZE_VIDEO', ... })` 같은 서버/배경 경유 코드는 제거한다.

3) **`apps/extension/background.ts`** 재작성
   - 메시지 타입을 `OPEN_REPORT`만 남긴다: `{ type: 'OPEN_REPORT'; videoId: string; ruleVersion: string }`.
   - 처리: `chrome.tabs.create({ url: `${API_BASE_URL}/report/${videoId}/${ruleVersion}` })`.
   - `ANALYZE_VIDEO` 핸들러와 관련 `fetch` 코드를 제거한다.
   - `@yad/shared`의 `AnalyzeRequest`/`AnalyzeResponse` import 제거(그 타입은 step1에서 삭제됨).
   - `ANALYZE_PATH` import 제거.

## 불변식 (깨면 안 됨)
- **배지 DOM id는 `yad-badge` 유지.** 이유: SPA 전환 시 중복 제거 로직(`document.getElementById('yad-badge')?.remove()`)이 이 id에 의존한다.
- **`yt-navigate-finish` 이벤트 훅 유지.** 이유: 유튜브는 pushState 기반 SPA라 이 훅 없이는 videoId 변경을 감지할 수 없다.
- **`lastAnalyzedVideoId` 중복 호출 가드 유지.** 이유: ADR-005가 MVP 캐싱 전략으로 이 가드만 남겼다.
- **`safe` 판정엔 "자세히 보기" 링크를 노출하지 않는다.** 이유: ADR-010. 사용자가 safe 영상에 대해 보고서를 보러 오면 MVP 스텁만 뜨므로 가치가 없고, UI 잡음만 늘린다.
- **보고서 URL 조립은 background에서 수행한다.** 이유: `API_BASE_URL`은 `lib/config.ts`에서 background만 import하도록 유지해 파일 간 책임을 분리한다.

## 금지사항
- **`/api/analyze` 호출 코드를 어떤 형태로든 재도입 금지.** 이유: ADR-012가 분석을 확장 단독으로 못박았고, step4에서 해당 API route를 삭제한다. 남아 있으면 빌드는 되더라도 런타임에 404가 나온다.
- **background에 `analyze()` 호출 로직을 옮기지 말 것.** 이유: content script가 transcript를 갖고 있으므로 그 자리에서 호출하는 게 가장 직접적이다. background로 옮기면 message round-trip이 추가되고 책임이 흐려진다.
- **`popup.tsx`를 변경하지 말 것.** 이유: 이 스텝 Scope 외.
- **ADR-010의 배지 스타일(빨간색, 우측 하단 고정)을 "더 눈에 띄게" 혹은 "더 작게" 임의 변경하지 말 것.** 이유: UI 정책은 ADR-010이 결정. 튜닝은 포스트-MVP.

## AC (실행 가능한 검증 커맨드)
```bash
npm run lint -w @yad/extension
npm run build -w @yad/extension
```
- `lint`는 `tsc --noEmit`. AnalyzeRequest/Response/ANALYZE_PATH 등 삭제된 심볼 import가 남아 있으면 실패한다.
- `build`는 `plasmo build`. 번들에 `@yad/shared`의 `analyze`가 포함되어야 하며, 성공해야 한다.
