// 확장이 호출할 서버 베이스 URL: 개발 시 localhost, 배포 시 빌드타임에 덮어씀
export const API_BASE_URL = process.env.PLASMO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'

// 분석 API 경로: 서버의 /api/analyze와 1:1 매칭
export const ANALYZE_PATH = '/api/analyze'
