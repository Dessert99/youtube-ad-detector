// 확장·서버·보고서 페이지가 공유하는 분석 요청/응답/보고서 타입 정의

// 법령 카테고리: 탐지된 표현이 어느 법에 걸릴 가능성이 있는지 분류 (MVP는 식품·의료 중심)
export type LawCategory =
  | 'food_labeling' // 식품 등의 표시·광고에 관한 법률
  | 'health_functional' // 건강기능식품법
  | 'medical_device' // 의료기기법
  | 'medical_act' // 의료법 (의료인 추천 등)
  | 'fair_trade' // 표시·광고의 공정화에 관한 법률

// 자막 1개 문장 단위: 룰 매칭은 이 단위로 수행됨
export interface TranscriptSegment {
  start: number // 초 단위 시작 시각
  end: number
  text: string
}

// 룰에 걸린 문장 1건: 보고서에서 '근거'로 노출되는 최소 단위
export interface Finding {
  segment: TranscriptSegment
  ruleId: string
  category: LawCategory
  riskWeight: number // 0~100 사이 위험 가중치
  matchedText: string // 자막 내 실제 매칭된 부분
  explanation: string // 왜 문제 소지가 있는지 한 줄 설명
}

// 확장이 서버로 보내는 분석 요청: videoId가 필수, DOM 자막은 서버 API 실패 시 폴백용
export interface AnalyzeRequest {
  videoId: string
  fallbackTranscript?: TranscriptSegment[]
}

// 서버가 확장에 돌려주는 분석 결과: 위험도 점수와 함께 보고서 URL 제공
export interface AnalyzeResponse {
  videoId: string
  riskScore: number // 0~100, 카테고리별 가중치 합산
  findings: Finding[]
  reportUrl: string // /report/{videoId}
  ruleVersion: string
  transcriptSource: 'youtube_api' | 'dom_fallback'
}

// 보고서 페이지가 SSR 시점에 렌더하는 구조: 응답 전체 + 메타를 재사용
export interface Report extends AnalyzeResponse {
  generatedAt: string // ISO timestamp
}
