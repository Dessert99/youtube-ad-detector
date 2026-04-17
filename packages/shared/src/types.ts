// 확장 단독 분석 모델의 공용 타입: 자막 세그먼트 → 룰 매칭 → 판정 결과까지의 단일 경로를 정의

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

// 2-state 판정: UI는 safe/fraud 두 상태만 노출 (ADR-010)
export type Verdict = 'safe' | 'fraud'

// analyze()의 최종 산출물: 3-zone 라우팅 후 단일 판정 + 위험도 + 근거 목록
export interface AnalyzeResult {
  verdict: Verdict
  riskScore: number // 0~100
  findings: Finding[]
}
