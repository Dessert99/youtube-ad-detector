import type { LawCategory } from './types'

// rule-based 엔진이 사용하는 룰 1건: 실제 매칭 방식(키워드/정규식/컨텍스트)은 구현 시 확정 (ADR-008)
export interface Rule {
  id: string
  category: LawCategory
  description: string // 사람이 읽을 수 있는 룰 설명 (보고서 근거로 노출)
  riskWeight: number // 0~100
  // 매칭 방식은 구현 단계에서 확정 — 현재는 placeholder
  pattern?: string
  keywords?: string[]
}

// 현재 룰 사전 버전: 보고서 URL 고정 + 룰 변경 추적용
export const RULE_VERSION = '0.0.0-scaffold'

// MVP 룰 사전: 실제 항목은 구현 단계에서 채움. 지금은 구조만 노출
export const RULES: Rule[] = []
