# step2: extension-transcript

## 목표
유튜브 시청 페이지에서 한국어 자막(수동/ASR 모두 허용)을 추출해 `TranscriptSegment[]`로 반환하는 독립 모듈을 확장에 추가한다. content script(`youtube.ts`)는 이 스텝에서 건드리지 않는다.

## 읽어야 할 파일
- `docs/plan_mvp/ADR.md` (특히 ADR-004 자막 수집)
- `docs/plan_mvp/ARCHITECTURE.md` (데이터 흐름)
- `apps/extension/contents/youtube.ts` (현재 구조 파악용, **수정 금지**)
- `apps/extension/package.json`, `apps/extension/tsconfig.json`
- `packages/shared/src/types.ts` (`TranscriptSegment` 타입)

## Scope
새 파일 1개만 생성한다: `apps/extension/contents/transcript.ts`.
기존 파일은 읽기만 하고 수정하지 않는다.

## 작업
`apps/extension/contents/transcript.ts`에 다음을 구현하고 export 한다.

1) **`extractPlayerResponse(): unknown | null`**
   - `window.ytInitialPlayerResponse`를 먼저 시도.
   - 없으면 `document.querySelectorAll('script')`를 돌며 텍스트에 `ytInitialPlayerResponse = {` 가 포함된 script를 찾아 JSON 부분만 잘라 `JSON.parse`.
   - 파싱 실패/미존재 시 `null`.

2) **`pickKoreanCaptionTrack(response: unknown): { baseUrl: string } | null`**
   - `response.captions.playerCaptionsTracklistRenderer.captionTracks[]`에 접근(옵셔널 체이닝).
   - `languageCode === 'ko'`인 트랙 중 첫 번째를 선택. `kind === 'asr'`(자동 생성)도 허용한다.
   - 한국어 트랙이 없으면 `null`. 다른 언어로 폴백하지 않는다.

3) **`fetchTranscript(track: { baseUrl: string }): Promise<TranscriptSegment[]>`**
   - `track.baseUrl` 끝에 `&fmt=json3`를 붙여 `fetch`.
   - 응답 JSON의 `events[]`를 순회하며 `{ tStartMs, dDurationMs, segs: [{ utf8 }, ...] }`를 파싱:
     - `start = tStartMs / 1000`
     - `end = (tStartMs + (dDurationMs ?? 0)) / 1000`
     - `text = segs.map(s => s.utf8 ?? '').join('').trim()`
     - `text`가 빈 문자열이면 스킵.
   - 네트워크/파싱 실패 시 예외 대신 빈 배열을 반환해도 되고, throw해도 된다. **다만 호출자가 `null`과 구분할 수 있도록 이 함수는 절대 `null`을 반환하지 않는다.**

4) **`loadKoreanTranscript(): Promise<TranscriptSegment[] | null>`**
   - 위 3개를 조합한 진입점.
   - player response 없음 / 한국어 트랙 없음 → `null`.
   - 자막은 있으나 fetch 결과가 빈 배열이면 `null`을 반환(UI 미표시 정책과 일치).
   - 정상 수집되면 `TranscriptSegment[]`.

## 불변식 (깨면 안 됨)
- **한국어(`languageCode === 'ko'`) 외 트랙은 선택하지 않는다.** 이유: MVP 범위.
- **ASR 트랙(`kind: 'asr'`)은 허용한다.** 이유: 한국어 유튜브 대부분이 수동 자막이 없고, rule 매칭은 ASR 오인식에 어느 정도 강건하다.
- **`TranscriptSegment.start` / `end`는 초 단위(number).** 이유: shared 타입 정의가 초 단위. ms/마이크로초 혼용 시 이후 findings 인용 시점이 어긋난다.
- **자막 URL은 `ytInitialPlayerResponse`에서 얻은 `baseUrl`만 사용한다.** 이유: ADR-004가 `ytInitialPlayerResponse` 단독 경로로 못박았다.

## 금지사항
- **`apps/extension/contents/youtube.ts`를 수정하지 말 것.** 이유: step3의 책임. 이 스텝은 독립 모듈만 만든다. 경계가 섞이면 step3의 변경 범위가 불명확해진다.
- **`chrome.*` API 사용 금지.** 이유: 이 모듈은 페이지 DOM과 fetch만 다룬다. 메시지 송수신·탭 오픈은 step3 책임.
- **YouTube Data API·오픈소스 자막 라이브러리·서버 프록시 등 대안 경로로 우회 금지.** 이유: ADR-004가 "확장 단독 + ytInitialPlayerResponse" 이외의 경로를 폐기했다.
- **타임드텍스트 응답에 fmt 파라미터를 `vtt`/`srv3` 등으로 바꾸지 말 것.** 이유: `json3`는 파싱이 가장 단순하고 본 스텝의 파싱 로직이 이를 전제로 한다.

## AC (실행 가능한 검증 커맨드)
```bash
npx tsc --noEmit apps/extension/contents/transcript.ts --jsx preserve --target es2020 --module esnext --moduleResolution bundler --strict --skipLibCheck
```
신규 파일 단독으로 tsc 에러 0건이면 통과. 이유: 본 step의 Scope가 "새 파일 1개만 생성, 기존 파일 수정 금지"이므로 확장 전체 tsc/lint는 step1 잔여물(background/youtube의 legacy 타입 import, config.ts의 process 전역)에 좌우된다. 이 잔여 정리는 step3(extension-rewire)의 책임이며 그 AC에서 확장 전체 tsc/lint가 통과하는지 검증한다.
