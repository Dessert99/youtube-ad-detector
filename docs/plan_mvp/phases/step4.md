# step4: monorepo-react-align

## 목표
워크스페이스 내 React 버전 분열을 해소한다. `apps/extension`을 React 19로 정렬하고(plasmo 0.90.5 동반 업그레이드), `apps/web`에 비대화형 `next lint` 설정을 추가해 step5(`web-report-stub`)의 AC(`npm run lint -w @yad/web`, `npm run build -w @yad/web`)가 통과 가능한 상태로 만든다.

## 배경 (왜 필요한가)
- `apps/web/package.json`은 React 19 + Next.js 15를 선언하지만, `apps/extension/package.json`이 React 18을 선언하여 npm workspaces가 루트 `node_modules/react@18.3.1`을 호이스트한다.
- 그 결과 `next build`가 루트의 React 18을 resolve해 런타임에 **Minified React error #31** 발생, `LayoutProps` 타입(`@types/react@18` vs `@19`)도 충돌.
- `apps/web/.eslintrc.json` 부재로 `next lint`가 대화형 프롬프트를 띄워 harness 환경에서 hang.

## 읽어야 할 파일
- `apps/extension/package.json` (React/plasmo 버전 변경 대상)
- `apps/web/package.json` (React 19/Next 15 선언 확인용, **수정 금지**)
- `package.json` (루트 — workspaces 구성 확인용, **수정 금지**)
- `apps/web/next.config.ts` (eslint 설정 위치 참고)

## Scope
다음 2개 파일만 수정/생성한다. 다른 파일은 건드리지 않는다.
- `apps/extension/package.json` (수정)
- `apps/web/.eslintrc.json` (신규)

`package-lock.json`과 `node_modules/`는 `npm install` 실행 결과로 자동 갱신되며, 이는 Scope 위반이 아니다.

## 작업

### 1) `apps/extension/package.json` — React 19 + plasmo 0.90.5 정렬
- `dependencies.react`: `^18.2.0` → `^19.0.0`
- `dependencies.react-dom`: `^18.2.0` → `^19.0.0`
- `dependencies.plasmo`: `^0.89.4` → `^0.90.5`
- `devDependencies.@types/react`: `^18.2.0` → `^19.0.0`
- `devDependencies.@types/react-dom`: `^18.2.0` → `^19.0.0`
- 다른 필드(name, manifest, scripts 등)는 손대지 않는다.

### 2) `apps/web/.eslintrc.json` 신규 생성
다음 내용으로 파일을 만든다:
```json
{
  "extends": "next/core-web-vitals"
}
```
이유: `next lint`가 설정 파일을 발견하면 대화형 프롬프트 없이 즉시 실행된다.

### 3) `npm install` 실행 (루트에서)
- 루트 디렉터리에서 `npm install`을 실행해 lock 파일과 호이스트된 `node_modules/react`를 19.x로 갱신한다.
- 실행 후 `node_modules/react/package.json`의 `version`이 `19.x`인지 확인.

## 불변식 (깨면 안 됨)
- **`apps/web/package.json`은 수정하지 않는다.** 이유: web은 이미 React 19를 올바르게 선언했고, 문제는 extension 측 misalignment에 있다.
- **루트 `package.json`에 `overrides`를 추가하지 않는다.** 이유: root cause를 가리는 우회책. extension의 실제 버전 정렬이 정공법.
- **plasmo 메이저 업그레이드(0.89 → 0.90)는 React 19 호환을 위해 필수.** 이유: plasmo 0.89는 React 18을 강제하는 peer dep을 가질 수 있음. 0.90.5는 빌드 출력에서 자체 권장된 최신 버전.

## 금지사항
- **`packages/shared`나 `tools/harness` 의존성에 손대지 말 것.** 이유: Scope 외. shared는 React를 import하지 않으므로 영향 없음.
- **`apps/extension`의 `popup.tsx`/`background.ts`/`contents/*`를 수정 금지.** 이유: Scope는 package.json만. React 19로 올린 후 코드 호환성 문제가 생기면 별도 step에서 처리.
- **`apps/web/eslint.config.mjs` 같은 ESLint flat config 형태로 만들지 말 것.** 이유: `eslint-config-next`는 legacy `.eslintrc.json`을 가장 안정적으로 지원하며, Next.js 15도 양식별 호환성 검증을 `.eslintrc.json` 기준으로 권장.
- **`npm install` 외에 `npm dedupe`, `rm -rf node_modules`, lock 파일 수동 편집 등 우회 시도 금지.** 이유: package.json 변경 + npm install 만으로 정렬되어야 함이 정상 경로. 그래도 안 되면 plasmo peer dep 충돌일 가능성이 크므로 blocked로 보고하라.

## AC (실행 가능한 검증 커맨드)
```bash
npm install
npm run build -w @yad/extension
npm run lint -w @yad/web
node -e "const v=require('./apps/web/node_modules/react/package.json').version; if(!v.startsWith('19')) process.exit(1); console.log('apps/web react@'+v)"
node -e "const v=require('./apps/extension/node_modules/react/package.json').version; if(!v.startsWith('19')) process.exit(1); console.log('apps/extension react@'+v)"
```
- `npm install`: 의존성 정렬 성공.
- `npm run build -w @yad/extension`: plasmo 0.90.5 + React 19 환경에서 확장 빌드 성공.
- `npm run lint -w @yad/web`: 대화형 프롬프트 없이 즉시 실행되어 통과(에러 0).
- 마지막 두 줄: **각 워크스페이스 옆에 있는 `react`가 19.x임**을 직접 검증. Node 모듈 resolution은 자기 디렉터리 옆 `node_modules`를 먼저 찾으므로, 이 두 사본이 19.x이면 Next.js와 plasmo가 실제로 사용할 React가 19라는 의미. (루트 `node_modules/react`는 plasmo의 transitive vue transformer 용도로 남아있을 수 있으나 사용처가 없어 무관.)

**왜 `npm run build -w @yad/web`을 AC에서 뺐나**: 본 step의 책임은 React 정렬이지 web 전체 빌드 통과가 아니다. 현재 `apps/web/app/api/analyze/route.ts`가 step1에서 삭제된 타입(`AnalyzeRequest`/`AnalyzeResponse`)을 import하고 있어 빌드가 실패하는데, 이 legacy 파일 제거는 step5(`web-report-stub`)의 첫 번째 task다. 따라서 web build의 최종 검증은 step5 AC가 담당한다.

**왜 루트 `react` 버전 검증이 아닌가**: plasmo 0.90.5의 transitive `@plasmohq/consolidate@0.17.0`이 React `^18.2.0` strict peer를 요구해, npm이 루트에 18.3.1을 박는다. 이는 plasmo vue transformer 전용이며 실제 앱 코드 resolution과 무관. 본 step의 의도("Next.js·plasmo가 사용하는 React가 19")를 직접 검증하려면 워크스페이스별 사본을 봐야 한다.
