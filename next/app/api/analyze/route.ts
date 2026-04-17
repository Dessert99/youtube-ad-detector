import { NextResponse } from 'next/server'
import type { AnalyzeRequest, AnalyzeResponse } from '@yad/shared'
import { RULE_VERSION } from '@yad/shared'

// 분석 API 엔드포인트: 확장이 videoId를 보내면 rule-based 결과를 돌려주는 MVP 스텁
// TODO: (1) YouTube API로 자막 수집, (2) 실패 시 fallbackTranscript 사용, (3) rule 엔진 실행
export async function POST(req: Request) {
  // 요청 본문을 파싱해 videoId를 확보한다
  const body = (await req.json()) as AnalyzeRequest

  if (!body?.videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
  }

  // 현재는 룰 엔진 미구현 상태 — 빈 findings + 0점으로 응답해 파이프라인만 검증
  const response: AnalyzeResponse = {
    videoId: body.videoId,
    riskScore: 0,
    findings: [],
    reportUrl: `/report/${body.videoId}`,
    ruleVersion: RULE_VERSION,
    transcriptSource: body.fallbackTranscript ? 'dom_fallback' : 'youtube_api',
  }

  return NextResponse.json(response)
}

// CORS preflight 대응: 확장에서 POST 시 브라우저가 먼저 OPTIONS를 보냄
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
