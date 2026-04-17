// 루트 페이지: 보고서는 /report/{videoId} 경로에서 조회한다는 안내만 제공
export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>YouTube Ad Detector</h1>
      <p>
        보고서는 <code>/report/&#123;videoId&#125;</code> 경로에서 조회할 수 있습니다.
      </p>
    </main>
  )
}
