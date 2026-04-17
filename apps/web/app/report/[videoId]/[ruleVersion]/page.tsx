import { notFound } from 'next/navigation'
import { RULE_VERSION } from '@yad/shared'

// SSR 보고서 스텁 페이지: videoId·ruleVersion을 URL에서 받아 메타만 렌더 (ADR-013)
export default async function ReportPage({
  params,
}: {
  params: Promise<{ videoId: string; ruleVersion: string }>
}) {
  // Next.js 15부터 params는 Promise이므로 await로 풀어준다
  const { videoId, ruleVersion } = await params

  // URL 직접 수정으로 다른 룰 버전에 접근한 경우 404 (ADR-006 트레이드오프)
  if (ruleVersion !== RULE_VERSION) notFound()

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <h1>분석 보고서</h1>
      <p>
        videoId: <code>{videoId}</code>
      </p>
      <p>
        룰 버전: <code>{ruleVersion}</code>
      </p>
      <p style={{ color: '#888' }}>상세 보고서는 추후 제공됩니다.</p>
    </main>
  )
}
