import type { Report } from '@yad/shared'
import { RULE_VERSION } from '@yad/shared'

// SSR 보고서 페이지: videoId를 받아 동일 분석을 재실행해 보고서를 렌더링 (stateless)
// TODO: 실제 분석 함수로 교체 — 현재는 빈 보고서 스텁을 반환해 라우팅만 검증
async function buildReport(videoId: string): Promise<Report> {
  return {
    videoId,
    riskScore: 0,
    findings: [],
    reportUrl: `/report/${videoId}`,
    ruleVersion: RULE_VERSION,
    transcriptSource: 'youtube_api',
    generatedAt: new Date().toISOString(),
  }
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ videoId: string }>
}) {
  // Next.js 15부터 params는 Promise이므로 await로 풀어준다
  const { videoId } = await params
  const report = await buildReport(videoId)

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <h1>분석 보고서</h1>
      <p>
        videoId: <code>{report.videoId}</code>
      </p>
      <p>
        룰 버전: <code>{report.ruleVersion}</code>
      </p>
      <p>위험도 점수: {report.riskScore} / 100</p>
      <p>탐지 건수: {report.findings.length}</p>
      <p style={{ color: '#888', fontSize: 12 }}>생성 시각: {report.generatedAt}</p>
    </main>
  )
}
