import { RULES } from './rules'
import type { AnalyzeResult, Finding, TranscriptSegment, Verdict } from './types'

// 확장 단독 분석 진입점: 자막 세그먼트 배열을 받아 룰 매칭 → 점수 합산 → 3-zone 판정까지 순수함수로 수행 (ADR-012)
export function analyze(segments: TranscriptSegment[]): AnalyzeResult {
  // 모든 세그먼트 × 모든 룰을 전수 매칭하고, 걸린 건을 findings에 누적
  const findings: Finding[] = []

  for (const segment of segments) {
    for (const rule of RULES) {
      // 키워드 룰: 부분 문자열 포함 여부만 본다 (ADR-009: 부정어·컨텍스트 처리 없음)
      if (rule.keywords && rule.keywords.length > 0) {
        for (const keyword of rule.keywords) {
          if (segment.text.includes(keyword)) {
            findings.push({
              segment,
              ruleId: rule.id,
              category: rule.category,
              riskWeight: rule.riskWeight,
              matchedText: keyword,
              explanation: rule.description,
            })
          }
        }
        continue
      }

      // 정규식 룰: i 플래그로 실행하고 실제 매칭 문자열을 matchedText에 담는다
      if (rule.pattern) {
        const result = new RegExp(rule.pattern, 'i').exec(segment.text)
        const matched = result?.[0]
        if (matched !== undefined) {
          findings.push({
            segment,
            ruleId: rule.id,
            category: rule.category,
            riskWeight: rule.riskWeight,
            matchedText: matched,
            explanation: rule.description,
          })
        }
      }
    }
  }

  // 점수 합산: 100 상한으로 clamp (ADR-008의 3-zone 경계 계산용)
  const riskScore = Math.min(
    100,
    findings.reduce((sum, f) => sum + f.riskWeight, 0),
  )

  // 3-zone → 2-state: Low(<20) safe, Mid/High(>=20) 모두 fraud로 합산 (ADR-008 MVP)
  const verdict: Verdict = riskScore < 20 ? 'safe' : 'fraud'

  return { verdict, riskScore, findings }
}
