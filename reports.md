# plan_mvp 진행 중 발생한 문제 분석 및 설계 피드백 보고서

작성일: 2026-04-17

## 1. 발생한 문제 타임라인

| # | 시점 | 증상 | 즉각 원인 | 해결 방식 |
|---|---|---|---|---|
| 1 | step 2 BLOCK | `npm run lint -w @yad/extension` 실패 (background/youtube/config의 step1 잔여 import) | step 2 Scope("새 파일 1개만 생성, 기존 파일 수정 금지")와 AC("확장 전체 lint 통과")가 모순 | AC 완화 — 신규 파일 단독 tsc만 검증 |
| 2 | step 3 BLOCK | `plasmo build` 실패 — `apps/extension/assets/icon.png` 부재 | step 3 Scope(3개 파일 재배선)와 무관한 사전 환경 결함이 AC 통과를 가로막음 | 사용자가 icon.png 수동 추가 → 빌드 통과 |
| 3 | 자동 커밋 혼란 | step 2/3가 working tree에 미커밋으로 남음 | (i) BLOCK 경로는 자동 커밋 미수행이 정상 동작이었음 (ii) AI가 hooks/settings만 보고 "자동 커밋 미설정"으로 잘못 답변 → 실제는 `tools/harness/src/orchestrator/loop.ts`에 구현됨 | 수동 커밋 + harness 재실행 흐름 회복 |
| 4 | 공유 상태 파일 분리 어려움 | `index.json`, `plans-index.json`에 step N 완료 + step N+1 blocked 상태가 함께 박혀 있음 | 한 파일이 여러 step의 라이프사이클을 누적 기록 → 단일 step 단위로 분리 커밋하려면 수동 surgery 필요 | step 3의 blocked 필드를 pending으로 되돌린 뒤 step 2 chore 커밋에 포함 |
| 5 | (구) step 4 BLOCK | `next build` 실패 + `next lint` 대화형 프롬프트 | 워크스페이스 React 버전 분열(ext: 18 / web: 19, 루트 호이스트=18) + `apps/web/.eslintrc.json` 부재 | 새 step 4(`monorepo-react-align`) 삽입 — 기존 step 4를 step 5로 밀어냄 |
| 6 | (신) step 4 BLOCK | `npm run build -w @yad/web` 실패 — `apps/web/app/api/analyze/route.ts`의 deleted 타입 import | AI(나)가 step 4 AC에 web 전체 빌드를 박았는데, 그 빌드가 step 5에서 삭제 예정인 legacy 파일을 컴파일 시도 | step 4 AC에서 web build 제거, React 버전 직접 검증으로 교체 |
| 7 | (신) step 4 재BLOCK | AC4(`루트 react 버전 == 19.x`) 실패 — 루트가 18.3.1 그대로 | plasmo 0.90.5의 transitive `@plasmohq/consolidate@0.17.0`이 React `^18.2.0`을 strict peer로 요구 → npm이 루트에 18.3.1을 박음. 그러나 **실제 의도("Next.js·plasmo가 사용하는 React가 19")는 이미 충족된 것으로 보였음** — 각 워크스페이스의 nested `node_modules/react`는 19.2.5. AC가 "의도"가 아니라 "의도의 우연한 부산물(루트 호이스트)"을 검증한 게 원인 | AC4를 워크스페이스별 `node_modules/react` 버전 직접 검증으로 교체 ⚠️ **이 수정 자체가 또 다른 프록시 검증이라 BLOCK #8로 이어짐** |
| 8 | step 5 BLOCK | `next build`의 prerender 단계에서 React error #31 — 한 프로세스에 React 18 + 19 공존 | step 4의 "수정된" AC4가 또 프록시였음. "워크스페이스 nested react가 19면 충분"이라고 가정했으나, Node 모듈 resolution은 **루트로 호이스트된 Next.js의 transitive deps**가 `require('react')`를 호출할 때 루트의 18을 로드. 즉 한 프로세스에 18(루트 경유)과 19(앱 경유)가 동시 적재돼 React가 "두 인스턴스 감지" 에러 발생. **BLOCK #7의 패턴 2-6(프록시 검증)이 한 번 더 반복** | 미해결 — 옵션 검토 중 (루트 overrides가 정공법) |

---

## 2. 근본 원인 패턴 (반복되는 6가지 결함)

### 2-1. AC 범위가 Scope를 초과 (4건 중 3건의 BLOCK 원인)
**현상:** step 2(전체 lint), step 3(전체 build), 신 step 4(web 전체 build) — 모두 AC 커맨드가 step의 Scope보다 더 넓은 영역을 검증.
**결과:** Scope 외 사전 결함이나 다른 step의 미완 작업이 AC를 막음.

### 2-2. 인프라 사전 점검 누락
**현상:** React 버전 분열, eslint 설정 부재, 아이콘 부재 — 모두 phase 시작 전 점검했어야 할 인프라 조건.
**결과:** feature step이 인프라 결함을 짊어지고 BLOCK.

### 2-3. "다음 step에서 정리될 깨진 코드"의 영향 범위 미식별
**현상:** step 1이 `AnalyzeRequest`/`AnalyzeResponse` 타입을 삭제 → `apps/web/app/api/analyze/route.ts`가 깨진 채로 step 4까지 살아있음. 그 사이 step들의 build 계열 AC가 모두 영향받음.
**결과:** step 1~5 전 구간에서 web 전체 빌드는 절대 통과 불가했는데, AC에는 자유롭게 들어가 있었음.

### 2-4. 공유 상태 파일에 의한 step 간 결합
**현상:** `index.json`, `plans-index.json`이 모든 step의 상태 변화를 누적 기록. 한 step이 BLOCK되면 그 흔적이 다음 단계 작업까지 따라옴.
**결과:** 수동 개입(BLOCK 회복) 시 surgery 필요. 휴먼 에러 위험.

### 2-5. 도구 위치에 대한 잘못된 가정
**현상:** AI가 "자동 커밋 = settings.json hook"이라고 단정, `tools/` 폴더의 커스텀 오케스트레이터를 늦게 발견.
**결과:** 사용자가 "왜 자동 커밋이 안 됐냐"고 묻기까지 잘못된 답변 1회. 신뢰성 손실.

### 2-6. **프록시 검증** — AC가 "진짜 의도"가 아닌 "의도의 우연한 부산물"을 본다 (BLOCK #7, #8 모두)
**현상 (BLOCK #7):** step 4 AC4가 의도("Next.js·plasmo가 호환 React를 resolve")가 아닌, 그 의도의 일반적 부산물("루트 호이스트가 19.x")을 검증. 가짜 BLOCK으로 잡힘.
**현상 (BLOCK #8, 더 심각):** BLOCK #7을 "수정"하면서 또 다른 프록시("워크스페이스 nested react가 19면 충분")로 갈아탔다. 그러나 이것도 직접 검증이 아니라 가정. 실제 prerender 시 루트 호이스트된 Next 의존성들이 루트의 18을 로드해 한 프로세스에 React 2개 공존 → 진짜 빌드 실패.
**결과:** 동일 패턴이 두 번 반복. 두 번째는 더 위험 — "통과 표시"가 났지만 실제로는 깨진 상태.
**일반화:** "X가 Y를 만족시키는가"를 검증하려면 **Y를 직접 측정**해야 한다. "보통 Y면 Z가 따라오니 Z를 보자"는 모든 우회는 외부 변수(호이스팅·번들러·런타임 로딩 순서)로 깨진다. **유일한 신뢰 가능한 검증은 실제 사용 시나리오를 그대로 실행하는 것** — React 호환성이라면 `next build` 자체가 그 검증.
**교훈:** legacy 코드가 build 명령을 막는다면(BLOCK #6 상황), 정답은 "build 대신 프록시"가 아니라 "build를 막는 legacy 코드를 step 순서로 먼저 제거"하는 것이었다. AC를 우회하면 안 되고 step 순서로 풀어야 한다.

---

## 3. 설계 단계 피드백 (다음 phase 설계 시 적용)

### 3-1. **AC 작성 원칙: "Scope가 건드린 것만 검증한다"**
- ❌ Scope = "새 파일 1개", AC = `npm run lint -w @workspace` (전체 lint)
- ✅ Scope = "새 파일 1개", AC = 그 파일에 대한 `tsc --noEmit <file>` 단독 검증
- ❌ Scope = "3개 소스 파일 수정", AC = 빌드 시스템 전체(`plasmo build` 포함) 빌드
- ✅ Scope = "3개 소스 파일 수정", AC = `tsc --noEmit -p <workspace>` (타입 체크만, 빌드 산출물·아이콘·번들러 부수 요건 배제)
- **빌드 명령(`next build`, `plasmo build` 등)은 step의 deliverable이 "빌드 산출물 자체"일 때만 AC에 포함**한다. 단순히 "Scope가 컴파일 가능한지" 확인이라면 type-check로 충분.

### 3-2. **Phase 시작 전 인프라 점검 step (step 0) 도입**
모든 phase의 첫 step은 **인프라 baseline 검증**을 수행:
- 워크스페이스 간 공유 의존성 버전 정렬 확인 (React/TS 등)
- 각 빌드/린트 도구의 비대화형 실행 가능성 확인 (`.eslintrc.json` 같은 설정 파일 존재)
- 자산 prerequisites (아이콘, 환경 변수 템플릿 등) 확인
- **결함 발견 시 본 step에서 정리** — 후속 feature step에 짐을 떠넘기지 않음

### 3-3. **"frozen broken" 파일 명시**
어떤 step이 의도적으로 깨진 코드를 남겨둔다면(예: step 1이 타입을 지우면서 사용처를 그대로 둠), plan 문서에 다음을 명시:
```
## 본 step 이후 일시적으로 깨지는 코드
- apps/web/app/api/analyze/route.ts: AnalyzeRequest/AnalyzeResponse import 깨짐. step 5에서 디렉터리 통째 삭제로 해소.
```
이 목록의 파일을 컴파일하는 모든 AC 커맨드는 그 step에 사용 금지.

### 3-4. **Step 순서: cleanup → infrastructure → feature**
- 삭제/이동 step은 **앞쪽**에 배치 (legacy 코드는 빠르게 제거)
- 인프라 정렬은 그 다음
- feature 추가는 마지막
- 이유: "X가 깨끗해진 후 Y를 검증할 수 있다"는 의존이 step 진행 방향과 같아짐

### 3-5. **공유 상태 파일 누적 기록의 회복 절차 표준화**
plan 문서에 "step BLOCK 시 회복 체크리스트"를 박아두기:
1. 해당 step의 working tree 변경이 다음 step과 분리 가능한가?
2. `index.json`/`plans-index.json`에서 해당 step의 라이프사이클 필드(`started_at`/`blocked_at`/`blocked_reason`)를 제거하면 pending 상태로 안전히 되돌릴 수 있는가?
3. AC 수정인지 / Scope 확장인지 / 새 step 삽입인지 결정 트리 적용

→ 가능하면 **harness가 BLOCK 회복 시 phase index를 자동으로 pending으로 되돌리는 옵션**을 갖도록 개선 검토.

### 3-6. **AI에게 줄 가이드: "도구 가정 금지, 프로젝트 고유 인프라부터 확인"**
- "자동 커밋", "linting", "deployment" 같은 키워드를 만나면 표준 도구 위치(`settings.json`, `package.json`, CI 설정)뿐 아니라 **프로젝트의 `tools/`, `scripts/`, 커스텀 오케스트레이터**까지 점검 후 답변.
- "X가 설정 안 되어 있다"고 단정하기 전, 최소 3곳을 점검 (글로벌 설정 / 프로젝트 설정 / 프로젝트 도구 디렉터리).

---

## 4. 즉시 적용 가능한 개선 액션

| 우선순위 | 액션 | 위치 |
|---|---|---|
| 높음 | 다음 phase 시작 시 step 0 (infra-baseline) 추가 | `docs/plan_<phase>/phases/step0.md` 템플릿화 |
| 높음 | 모든 step.md에 "본 step 이후 일시적으로 깨지는 코드" 섹션 추가(해당 시) | 기존 `step{N}.md` 보강 |
| 중간 | AC 작성 가이드를 plan 가이드라인 문서로 분리 | `docs/plan_mvp/AC-guidelines.md` 신규 |
| 중간 | harness에 `--reset-blocked-step <N>` 같은 회복 보조 커맨드 추가 | `tools/harness/src/execute.ts` 확장 |
| 낮음 | `CLAUDE.md`에 "도구 위치 점검 의무 3곳" 룰 추가 | `CLAUDE.md` |

---

## 5. 메타 회고: AI의 책임 분담

본 문서의 BLOCK 8건 중:
- **AI 설계 결함 (AC 범위 초과)**: #1, #6 (각 step의 AC를 내가 너무 넓게 잡음)
- **AI 설계 결함 (프록시 검증)**: #7, #8 (실제 의도 대신 우연한 부산물을 검증; #8은 #7 수정도 또 프록시였다는 더 심각한 사례)
- **사전 환경 미점검**: #2, #5 (phase 시작 전 인프라 audit 누락 — AI가 plan 단계에서 발견했어야 함)
- **AI 답변 오류**: #3 (도구 위치 가정으로 잘못된 답변)
- **공유 상태 설계 한계**: #4 (harness 구조 자체의 트레이드오프 — AI 단독 책임은 아님)

→ **다음 phase 설계 시 가장 먼저 적용할 것: 3-1 (AC 범위) + 3-2 (step 0 인프라 audit) + 2-6 (프록시 금지).** 이 세 가지가 8건 중 6건을 사전에 막아주었음. 특히 #8은 BLOCK이 발생한 후에도 같은 함정에 두 번째로 빠진 사례 — **"AC 우회는 step 순서 재설계로 풀어야 한다"**는 원칙을 어겼다.

---

## 6. ✅ 다음부터 추가로 설정해야 할 것 — TODO 리스트

> 이 리스트만 보고도 다음 phase를 안전하게 시작할 수 있도록 정리. 위에서 아래로 우선순위.

### 🔴 반드시 해야 할 것 (Phase 시작 전)

- [ ] **`step0.md` 템플릿 만들기** — 모든 phase의 첫 step은 인프라 audit. 다음을 포함:
  - 워크스페이스 간 공유 의존성(React/TS/Node/번들러) 버전이 정렬됐는가
  - 각 워크스페이스의 lint/build 도구가 **비대화형**으로 실행되는가 (eslintrc 같은 설정 파일 존재)
  - 자산 prerequisites(아이콘·env 파일·인증서 등) 누락 없는가
  - 발견된 결함은 step0 안에서 모두 해결 (다음 step에 떠넘기지 않기)

- [ ] **`AC-guidelines.md` 작성** (`docs/plan_<phase>/`) — AC 작성 시 지켜야 할 규칙:
  1. **Scope-매칭**: AC가 검증하는 영역 ⊆ Scope가 변경한 영역
  2. **직접 검증 금지(=프록시 금지)**: "보통 X면 Y가 따라온다"는 우회 검증 금지. 실제 사용 시나리오를 그대로 실행
  3. **build 명령은 deliverable이 build 산출물일 때만 사용**. 단순 컴파일 가능성은 type-check로
  4. AC가 막힐 때 우회(완화) 대신 **step 순서를 재설계**해 막힘 자체를 제거할 수 있는지 먼저 검토

- [ ] **각 step.md에 "본 step 이후 일시적으로 깨지는 코드" 섹션 의무화** — 의도적으로 깨진 채 남겨둘 파일을 명시. 그 파일을 컴파일하는 모든 후속 step의 AC 명령은 사용 금지.

### 🟡 해두면 좋은 것 (다음 phase 진행 전)

- [ ] **harness에 `--reset-blocked-step <N>` 옵션 추가** (`tools/harness/src/execute.ts`) — BLOCK 회복 시 phase index의 해당 step 라이프사이클 필드를 자동으로 pending으로 되돌림. 수동 surgery 제거.

- [ ] **harness에 `--dry-run-ac <N>` 옵션 추가** — Claude 호출 없이 step N의 AC 명령만 현재 working tree 상태로 실행. AC 작성 직후 사전 검증용.

- [ ] **`CLAUDE.md`에 도구 위치 점검 룰 추가**:
  > "X가 설정 안 되어 있다"고 단정하기 전 최소 3곳 점검 — 글로벌 설정 / 프로젝트 설정 / 프로젝트 도구 디렉터리(`tools/`, `scripts/`).

### 🟢 여유 있을 때 (구조 개선)

- [ ] **phase index 분할** — `index.json` 한 파일이 모든 step의 라이프사이클을 누적 기록하는 구조 대신, step별로 `step{N}.state.json`을 두면 step 간 결합 해소. 현재는 BLOCK 회복 시 surgery 필요.

- [ ] **plan 작성 시 step 의존성 그래프 명시** — "step Y의 AC는 step X의 cleanup을 전제로 한다" 같은 의존을 plan 문서 상단에 명시. 잘못된 순서 검출 가능.

- [ ] **step.md에 "AC 직접성 체크리스트" 박스 추가** — 작성자가 자가 점검할 3개 질문:
  1. 이 AC는 step의 의도를 직접 측정하는가, 아니면 우연한 부산물을 측정하는가?
  2. AC가 검증하는 코드 영역이 step Scope를 넘지 않는가?
  3. 실패 시 원인이 본 step 안에서 해결 가능한가?

### 🚨 다시는 하지 말아야 할 안티 패턴

- ❌ AC가 막힌다고 검증을 우회/완화하기 — **순서 재설계**로 풀어라
- ❌ "보통 X면 Y가 만족된다"는 프록시 검증 — **Y를 직접 측정**하라
- ❌ Scope보다 넓은 build/lint 명령을 AC에 넣기 — **scope-matched 명령**만
- ❌ "X가 어디 설정 안 된 듯" 단정 — **3곳 이상 직접 확인** 후 답변
- ❌ 인프라 결함을 feature step이 떠안기 — **step 0에서 해결**
