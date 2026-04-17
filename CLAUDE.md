# youtube-ad-detector

- 유튜브 허위 광고 탐지 프로그램


## 기술 스택

- **Frontend**: plasmo, Next.js
- **Backend**: Next.js
- **공통**: TypeScript 5


## 디렉토리 구조
- `extension/`  크롬 확장 (plasmo)
- `next/`       보고서 웹 + 포스트-MVP 서버 (Next.js 15)
- `shared/`     룰·타입·analyze 순수함수 (ESM, file: 프로토콜로 각 앱이 import)
- `docs/`       PRD·ADR·ARCHITECTURE·plan들
- `tools/`      harness 오케스트레이터

npm workspaces는 사용하지 않는다. 각 앱은 자체 `node_modules`를 가진다.


## 개발 명령어
- 확장 개발: `cd extension && npm run dev`
- 확장 빌드: `cd extension && npm run build`
- 확장 lint: `cd extension && npm run lint`
- next 개발: `cd next && npm run dev`
- next 빌드: `cd next && npm run build`
- next lint: `cd next && npm run lint`
- shared 타입체크: `cd shared && npx tsc --noEmit`
- harness 실행: `npm run harness <plan-dir-name>`
- 포맷: `npm run format`



## 개발 프로세스
- 커밋 메시지: conventional commits (feat: , fix: )
- CRITICAL: 모든 로직에 어떤 흐름으로 흘러가는지 한 줄로 주석 설명을 첨부한다.



## 절대 하지 말아야 할 것들
- 애매한 부분이 생기면 추측하지 말고 무조건 물어봐라.
- 작업 중간에 임의로 다른 방향으로 바꾸지 마라.