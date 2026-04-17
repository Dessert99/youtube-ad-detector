## 1. BLOCK #1 — step 2 전체 lint 실패

1. step 2의 AC인 `npm run lint -w @yad/extension`이 확장 전체 lint를 수행하다 실패했다.
2. 실패 지점은 Scope 밖의 background·youtube·config 파일이었고, 이들은 step 1에서 삭제된 타입을 여전히 import 중이었다.
3. 원인은 AC의 검증 범위가 step의 Scope를 초과한 것이다.
4. Scope는 "새 파일 1개 생성, 기존 파일 수정 금지"로 좁았으나 AC는 워크스페이스 전체 lint를 요구했다.
5. 두 범위가 어긋나면 Scope 외의 잔여 결함이 곧바로 AC 실패로 드러난다.
6. 해결은 AC를 "신규 파일 단독 `tsc --noEmit`"으로 축소해 Scope와 일치시킨 것이었다.
7. 교훈은 AC가 검증하는 영역이 Scope가 변경한 영역의 부분집합이어야 한다는 것이다.

## 2. BLOCK #2 — step 3 plasmo build 실패

1. `plasmo build`가 `apps/extension/assets/icon.png`를 찾지 못해 실패했다.
2. step 3의 Scope는 "3개 파일 재배선"이었고 아이콘 부재와 무관했다.
3. 원인은 번들러가 매니페스트 처리 시 아이콘을 강제로 요구한다는 사전 환경 결함이었다.
4. 소스 수정만으로는 이 요건을 우회할 수 없다.
5. 해결은 사용자가 아이콘을 수동 추가한 것이었다.
6. 교훈은 자산 prerequisites 점검이 feature step이 아니라 phase 시작 시점의 인프라 audit에 속한다는 것이다.

## 3. BLOCK #3 — 자동 커밋 설정 오답

1. step 2/3 완료 후 working tree에 변경이 미커밋 상태로 남았다.
2. 원인은 BLOCK 경로에서 자동 커밋 미수행이 설계상 정상 동작이었다는 점이다.
3. 그러나 AI는 `settings.json` hooks만 검사해 "자동 커밋 미설정"이라 잘못 단정했다.
4. 실제 자동 커밋 로직은 `tools/harness/src/orchestrator/loop.ts`의 커스텀 오케스트레이터에 있었다.
5. AI가 프로젝트 고유 도구 디렉터리를 늦게 발견한 것이 오답의 직접 원인이다.
6. 해결은 수동 커밋 후 harness를 재실행해 흐름을 회복한 것이었다.
7. 교훈은 "X가 설정 안 된 듯" 단정 전에 최소 3곳(글로벌 설정, 프로젝트 설정, 프로젝트 도구 디렉터리)을 직접 확인해야 한다는 것이다.

## 4. BLOCK #4 — 공유 상태 파일의 step 간 결합

1. `phases/index.json`에 step N의 completed와 step N+1의 blocked가 한 파일에 섞여 기록됐다.
2. 원인은 한 파일이 여러 step의 라이프사이클을 누적 기록하는 구조다.
3. BLOCK 회복 시 해당 step의 `started_at`·`blocked_at`·`blocked_reason`을 수동으로 제거해 pending 상태로 되돌리는 surgery가 필요했다.
4. 단일 step 단위로 분리 커밋하려는 의도와 누적 기록 구조가 충돌한다.
5. 해결은 step 3의 blocked 필드를 수동 제거하고 step 2 chore 커밋에 포함해 재실행한 것이었다.
6. 교훈은 phase index를 step별 파일(`step{N}.state.json`)로 분할하면 결합이 구조적으로 해소된다는 것이다.

## 5. BLOCK #5 — 구 step 4 React 버전 분열과 대화형 프롬프트

1. `next build`가 실패했고 `next lint`는 대화형 프롬프트를 띄웠다.
2. 실패 원인은 두 가지로 동시에 발생했다.
3. 첫째, `apps/extension/package.json`이 React 18, `apps/web/package.json`이 React 19로 선언돼 워크스페이스가 루트에 React 18을 호이스트했다.
4. Next.js 15가 React 19를 요구하는데 루트에 18이 박혀 런타임 충돌이 발생했다.
5. 둘째, `apps/web/.eslintrc.json`이 없어 `next lint`가 설정 생성 대화형 프롬프트를 띄워 harness 환경에서 hang됐다.
6. 해결은 새 step 4(`monorepo-react-align`)를 삽입해 extension을 React 19로 정렬하고 eslintrc를 생성, 기존 step 4는 step 5로 밀어낸 것이다.
7. 교훈은 공유 의존성 버전 정렬과 비대화형 도구 설정이 feature step 이전의 phase 인프라 audit에서 처리돼야 한다는 것이다.

## 6. BLOCK #6 — 신 step 4의 legacy 컴파일 충돌

1. `npm run build -w @yad/web`이 `apps/web/app/api/analyze/route.ts`에서 실패했다.
2. 이 legacy 파일은 step 1에서 삭제된 `AnalyzeRequest`/`AnalyzeResponse` 타입을 여전히 import 중이었다.
3. 파일 제거는 step 5에서야 예정돼 있었다.
4. 원인은 step 4 AC에 web 전체 build를 넣어 삭제 예정 코드까지 컴파일 경로에 포함된 것이다.
5. step 1부터 step 5까지 이 파일을 컴파일하는 어떤 AC도 통과할 수 없는 상태였다.
6. 해결은 step 4 AC에서 web build를 제거하고 React 버전 직접 검증으로 교체한 것이다.
7. 교훈은 "frozen broken" 파일이 있다면 step.md에 명시하고, 그 파일을 컴파일하는 AC 명령은 해당 step에서 사용 금지해야 한다는 것이다.

## 7. BLOCK #7 — 프록시 검증 1차 (루트 호이스트 오판)

1. step 4의 AC4 `루트 node_modules/react 버전 == 19.x`가 실패하고 루트에는 18.3.1이 박혔다.
2. 원인은 plasmo 0.90.5의 transitive `@plasmohq/consolidate@0.17.0`이 React `^18.2.0`을 strict peer로 요구해 npm이 루트에 18.3.1을 올린 것이다.
3. 각 워크스페이스의 nested `node_modules/react`는 이미 19.2.5로 설치돼 있었다.
4. 즉 실제 의도인 "Next.js·plasmo가 사용하는 React가 19"는 이미 충족된 상태였다.
5. 문제는 AC가 의도가 아니라 의도의 우연한 부산물("루트 호이스트가 19.x")을 검증하고 있었다는 점이다.
6. 일반적으로 단일 React일 때 루트가 그 버전으로 호이스트되지만, peer 요구가 갈릴 땐 그 관계가 깨진다.
7. 해결 시도는 AC를 워크스페이스별 nested react 19 검증으로 교체한 것이다.
8. 함정은 이 교체도 여전히 프록시였다는 점이며 BLOCK #8로 이어졌다.

## 8. BLOCK #8 — 프록시 검증 2차 (같은 함정 반복)

1. step 5의 `next build` prerender 단계에서 React error #31이 발생했다.
2. 에러 메시지는 한 프로세스 내에 React 인스턴스가 둘 이상 감지됐다는 의미다.
3. 원인은 Node 모듈 resolution이 서로 다른 경로로 두 React를 같은 프로세스에 로드한 것이다.

```
// next 애플리케이션 코드
require('react')
// → next/node_modules/react 에서 해결 (v19)

// next의 transitive 의존성 중 일부 (루트로 호이스트된)
require('react')
// → walk up → 루트 node_modules/react 에서 해결 (v18)
```

4. 한 프로세스에 v18과 v19가 동시 적재되자 React가 "두 인스턴스 감지" 에러를 던졌다.
5. BLOCK #7의 "수정된" AC는 "nested react가 19면 충분"이라고 가정했으나, 이는 실제 사용 시나리오가 아닌 또 하나의 프록시였다.
6. 같은 패턴(프록시 검증)이 한 번 더 반복됐고, 두 번째는 "통과 표시"가 난 뒤 실제 빌드가 깨지는 형태라 더 위험했다.
7. 해결 방향은 workspaces 자체를 해제해 루트 호이스트 경로를 구조적으로 제거하는 것이다.
8. 실제 해결은 본 저장소에서 `apps/*`·`packages/*`를 루트 직계(`extension/`·`next/`·`shared/`)로 승격하고 루트 `package.json`의 `"workspaces"` 필드를 제거, shared를 `"@yad/shared": "file:../shared"` 프로토콜로 참조하도록 전환한 것이다.
9. 검증은 리팩터 후 `cd next && npm run build`가 prerender까지 성공하는 것, 그리고 루트에서 `require.resolve('react')`가 MODULE_NOT_FOUND로 실패하는 것(의도된 상태)이다.
10. 교훈은 의도를 검증하려면 의도의 실제 발현 경로를 실행해야 한다는 것이다.
11. React 호환성이라면 `next build` 자체가 그 검증이며, 프록시 지표(버전 문자열 비교)로 대체할 수 없다.

## 9. 반복되는 근본 원인 패턴

1. AC 범위가 Scope를 초과한 사례가 3건(#1, #2, #6)이다.
2. 인프라 audit 누락이 2건(#2, #5)이다.
3. "frozen broken" 영향 범위 미식별이 1건(#6)이다.
4. 공유 상태 파일의 step 간 결합이 1건(#4)이다.
5. 도구 위치 가정이 1건(#3)이다.
6. 프록시 검증이 2건 연속(#7, #8) 발생해 가장 위험한 패턴으로 분류된다.
7. 프록시 검증은 "X가 Y를 만족시키는가"를 Y 자체가 아닌 Y의 일반적 부산물로 측정하므로 외부 변수(호이스팅, 번들러, 런타임 로딩 순서)에 의해 쉽게 깨진다.
8. 유일하게 신뢰 가능한 검증은 실제 사용 시나리오를 그대로 실행하는 것이다.
9. legacy 코드가 build를 막는다면 "build 대신 프록시"가 아니라 "build를 막는 legacy를 step 순서로 먼저 제거"해야 한다.
10. AC 우회는 증상 덮기이고, step 순서 재설계가 정공법이다.

## 10. AC 설계 규칙

1. AC가 검증하는 영역은 Scope가 변경한 영역의 부분집합이어야 한다.
2. build 명령은 step의 deliverable이 "빌드 산출물 자체"일 때만 AC에 포함한다.
3. 단순 컴파일 가능성 확인이라면 `tsc --noEmit`으로 충분하다.
4. AC는 의도를 직접 측정해야 하며, 의도의 일반적 부산물(버전 문자열, 호이스트 위치 등)을 관찰하는 프록시를 금지한다.
5. AC가 막힐 때 완화·우회 대신 "step 순서를 바꿔 막힘 자체를 제거할 수 있는가"를 먼저 검토한다.
6. 각 step.md에 "AC 직접성 체크리스트" 3문항을 포함한다.
7. 그 3문항은 의도의 직접 측정 여부, Scope와 AC 영역 일치 여부, 실패 원인의 해당 step 내 해결 가능성이다.

## 11. Phase·Step 구조 규칙

1. 모든 phase의 첫 step은 인프라 baseline 검증(step 0 — infra audit)이다.
2. step 0은 워크스페이스 간 공유 의존성 버전 정렬, 비대화형 도구 설정 존재, 자산 prerequisites 누락 여부를 점검한다.
3. 발견된 결함은 step 0 안에서 모두 해결하고 feature step에 떠넘기지 않는다.
4. step 순서는 cleanup → infrastructure → feature 방향을 따른다.
5. 삭제·이동 step을 앞쪽에 배치해 legacy 제거가 feature 검증을 가로막지 않게 한다.
6. 의도적으로 깨진 채 남겨두는 파일은 step.md의 "본 step 이후 일시적으로 깨지는 코드" 섹션에 명시한다.
7. 해당 목록의 파일을 컴파일하는 AC 명령은 명시된 step 동안 사용 금지한다.
8. BLOCK 회복은 변경 분리 가능성, pending 복원 가능성, AC 수정/Scope 확장/새 step 삽입의 선택을 결정 트리로 판단한다.

## 12. 도구 진단 규칙

1. "X가 설정 안 된 듯"이라 단정하기 전에 최소 3곳을 직접 확인한다.
2. 3곳은 글로벌 설정, 프로젝트 설정, 프로젝트 도구 디렉터리(`tools/`, `scripts/` 등)다.
3. 프로젝트 고유 오케스트레이터를 표준 도구(hooks, CI) 미존재로 단정하지 않는다.
4. 답변 전 세 곳의 탐색 결과를 내부적으로 기록해 프록시 판단(파일명 추측, 경로 추측)을 배제한다.

## 13. 안티패턴

1. AC가 막힌다고 검증을 우회·완화한다.
2. "보통 X면 Y가 만족된다"는 프록시 검증을 쓴다.
3. Scope보다 넓은 build/lint 명령을 AC에 넣는다.
4. 3곳 이상 확인 없이 "X 설정 안 된 듯"이라 단정한다.
5. 인프라 결함을 feature step이 떠안는다.
6. workspaces 호이스트로 버전 충돌이 발생했을 때 `overrides`나 peer 핀고정 같은 우회책으로 덮는다(구조 자체를 바꾸는 것이 정공법).

## 14. 보류 중인 개선 액션

1. `docs/_template/step0.md` 템플릿을 작성한다.
2. `docs/plan_<phase>/AC-guidelines.md`를 분리해 AC 작성 가이드를 문서화한다.
3. 각 `step{N}.md`에 "본 step 이후 일시적으로 깨지는 코드" 섹션을 의무화한다.
4. `tools/harness/src/execute.ts`에 `--reset-blocked-step <N>` 옵션을 추가해 수동 surgery를 제거한다.
5. 같은 파일에 `--dry-run-ac <N>` 옵션을 추가해 Claude 호출 없이 AC만 실행 가능하게 한다.
6. `CLAUDE.md`에 "도구 위치 3곳 점검" 룰을 추가한다.
7. phase index를 `step{N}.state.json`으로 분할해 step 간 결합을 해소한다.
8. plan 문서에 step 의존성 그래프를 명시한다.
9. step.md에 "AC 직접성 체크리스트" 3문항 박스를 추가한다.
