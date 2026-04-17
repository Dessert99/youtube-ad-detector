// 빌드 타임에 plasmo가 PLASMO_PUBLIC_* 변수를 주입하므로 process.env를 지역 타입으로 선언해 tsc가 통과하도록 함
declare const process: { env: Record<string, string | undefined> }

// 확장이 보고서 페이지를 열 때 붙일 베이스 URL: 개발 시 localhost, 배포 시 빌드타임에 덮어씀 (ADR-006)
export const API_BASE_URL = process.env.PLASMO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
