# Harness Bootstrap 실패 회고

`docs/plan_mvp2/` 플랜과 `phases/step0.md`~`step9.md`까지 전부 작성한 뒤 `npm run harness plan_mvp2`를 실행하려 했으나, harness 자체가 실행 가능한 상태가 아니었다. 플랜 작성과 도구 부트스트랩이 분리돼 진행된 결과, 실행 직전에 세 겹의 미결 상태가 동시에 드러났다.

## 1. 증상

1. `npm run harness plan_mvp2`가 어디서도 동작하지 않았다.
2. 루트에서 실행하면 "no package.json" 계열 에러, `tools/harness/`에서 실행해도 "Missing script: harness"로 실패했다.
3. 스크립트를 추가해도 `tsx: command not found` 또는 모듈 해석 실패가 이어졌다.

## 2. 원인 #1 — 루트 package.json 부재

1. 저장소 루트에 `package.json`이 없다.
2. 사용자는 `npm run harness`를 "루트에서 실행되는 최상위 명령"으로 가정했다.
3. 그러나 이 저장소는 TROUBLESHOOTING.md BLOCK #8 회고에서 의도적으로 npm workspaces 구조를 해제했고, 그 결과 루트는 빈 디렉터리이며 루트에서 `npm run *`는 구조적으로 동작할 수 없다.
4. 명령의 기대 실행 위치(루트)와 실제 실행 가능 위치(`tools/harness/`)가 어긋난 상태였다.

## 3. 원인 #2 — harness 스크립트 미정의

1. `tools/harness/package.json`의 scripts에 `harness` 엔트리가 없었다. 존재한 것은 `build`·`test`·`test:watch`·`lint`뿐이었다.
2. 반면 `src/execute.ts`는 CLI 엔트리로 완성돼 있었고 내부적으로 `npm run harness <plan-dir-name>` 사용을 usage 메시지로 명시하고 있었다.
3. 즉 구현체는 있으나 npm이 그것을 부를 이름 매핑이 끊어져 있었다.
4. 해결은 `"harness": "tsx src/execute.ts"` 한 줄 추가였다.

## 4. 원인 #3 — 의존성 미설치

1. `tools/harness/node_modules/`에 `@types`만 있고 `tsx`·`vitest`·`eslint` 등 devDependencies가 설치돼 있지 않았다.
2. `tsx`가 없으면 스크립트를 추가해도 실행 자체가 불가능하다.
3. devDependencies 선언은 있었으나 `npm install`이 한 번도 수행되지 않은 상태였다.
4. 해결은 `tools/harness/`에서 `npm install` 실행이었다 (153 패키지 설치).

## 5. 세 원인의 관계

1. 세 문제는 독립이 아니라 같은 뿌리에서 파생됐다.
2. 공통 뿌리는 "플랜 작성"과 "도구 부트스트랩"이 같은 선행 조건으로 묶이지 않은 것이다.
3. 플랜은 `docs/plan_mvp2/phases/`를 완성하면 끝나는 문서 작업이고, 도구 부트스트랩은 `tools/harness/`가 실행 가능 상태인지를 보장하는 인프라 작업이다.
4. 두 작업이 같은 phase 체크리스트를 공유하지 않아 플랜 완성만으로 실행 준비가 됐다고 오인됐다.
5. 실행 버튼을 누르는 순간에야 세 겹이 동시에 노출됐고, 하나씩 해결하며 진행했다.

## 6. 근본 원인 패턴

1. **부트스트랩 상태의 불가시성**: 도구가 "존재하는지"(파일 존재)와 "실행 가능한지"(스크립트 매핑 + 의존성 설치)는 별개다. `ls tools/harness/`만으로는 후자를 확인할 수 없다.
2. **TROUBLESHOOTING.md BLOCK #3의 교훈 확장 필요**: 기존 교훈은 "도구 위치를 3곳 확인"이었으나, 위치 확인을 통과해도 실행 가능성은 보장되지 않는다. 실행 가능성은 별도 검증 축이다.
3. **phase step 0의 범위 공백**: 현 step 0은 워크스페이스 공유 의존성·비대화형 도구 설정·자산 prerequisites만 점검한다. harness 자체의 부트스트랩은 점검 대상이 아니었고, 이 때문에 phase 외부에서 조용히 실패했다.
4. **설계 문서와 도구 상태의 동기화 부재**: plan·ADR·ARCHITECTURE가 harness 실행을 전제로 쓰였지만, 그 전제(스크립트 매핑·의존성 설치·실행 위치)가 어디에도 명시돼 있지 않았다.

## 7. 재발 방지

1. **`tools/harness/README.md` 작성**: 실행 위치(`cd tools/harness`), 최초 1회 `npm install`, 실행 명령(`npm run harness <plan>` [`--push`]), 종료 코드 의미를 명시한다.
2. **phase step 0에 harness sanity check 추가**: "루트에서가 아니라 `tools/harness/`에서 실행"·"`npm run harness`가 usage 메시지를 출력"·"`node_modules/.bin/tsx` 존재" 3항목을 step 0의 AC에 포함한다.
3. **preflight 스크립트화**: `tools/harness/src/execute.ts`의 첫 동작으로 `node_modules/.bin/tsx` 존재 여부를 확인하고 부재 시 "run `npm install` in tools/harness"를 명시적으로 출력한다.
4. **CLAUDE.md에 부트스트랩 경로 명시**: "개발 명령어" 섹션이 비어 있는데, 최소한 harness 실행 명령은 해당 섹션에 적는다.
5. **plan 문서에 실행 전제 블록 추가**: 각 `docs/plan_*/PRD.md` 또는 `ARCHITECTURE.md`에 "실행 전제: tools/harness 부트스트랩 완료" 한 줄을 의무화한다.

## 8. 이번 해결 로그

1. `tools/harness/package.json`의 scripts에 `"harness": "tsx src/execute.ts"` 추가.
2. `tools/harness/`에서 `npm install` 실행(153 패키지 설치, 0 vulnerabilities).
3. `npm run harness` 인자 없이 실행 → "usage: npm run harness <plan-dir-name> [--push]" 정상 출력 확인.
4. 실제 실행 명령은 `cd tools/harness && npm run harness plan_mvp2` (execute.ts가 파일 위치 기준으로 repoRoot을 해석하므로 cwd는 결과에 영향 없음).
