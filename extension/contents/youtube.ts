import type { PlasmoCSConfig } from 'plasmo'
import type { AnalyzeResponse } from '@yad/shared'

// 유튜브 시청 페이지에만 주입: 다른 경로에서 불필요한 실행 방지
export const config: PlasmoCSConfig = {
  matches: ['https://www.youtube.com/watch*'],
  run_at: 'document_idle',
}

// URL의 v 쿼리에서 videoId 추출: 유튜브는 SPA 라우팅이라 pushState 이벤트도 같이 감시해야 함
function extractVideoId(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('v')
}

// 최근 분석한 videoId를 저장해 같은 영상 재요청 방지
let lastAnalyzedVideoId: string | null = null

// background에 분석 요청을 보내고 응답을 받아 경고 UI를 그리는 진입 흐름
async function analyze(videoId: string): Promise<void> {
  // 중복 호출 가드
  if (videoId === lastAnalyzedVideoId) return
  lastAnalyzedVideoId = videoId

  // background service worker로 메시지 전달 → 서버 호출 대행
  const response = (await chrome.runtime.sendMessage({
    type: 'ANALYZE_VIDEO',
    videoId,
  })) as AnalyzeResponse | { error: string }

  if ('error' in response) {
    console.warn('[yad] analyze failed:', response.error)
    return
  }

  renderBadge(response)
}

// 시청 방해 없이 우측 하단에 배지만 표시: 클릭 시 보고서 탭 open
function renderBadge(result: AnalyzeResponse): void {
  // 이전 배지 제거 후 재생성 (SPA 전환 대응)
  document.getElementById('yad-badge')?.remove()

  const el = document.createElement('div')
  el.id = 'yad-badge'
  el.textContent = `위험도 ${result.riskScore} · 자세히 보기`
  el.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 9999;
    padding: 8px 12px; background: #111; color: #fff;
    border-radius: 8px; font: 12px system-ui; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,.3);
  `
  // 클릭 시 background에 새 탭 open 요청 (보고서 URL은 서버가 돌려준 값 사용)
  el.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_REPORT', reportUrl: result.reportUrl })
  })
  document.body.appendChild(el)
}

// 초기 진입 + SPA 전환 감지: 유튜브는 URL만 바뀌고 페이지가 다시 로드되지 않음
function bootstrap(): void {
  const id = extractVideoId()
  if (id) void analyze(id)
}

bootstrap()

// 유튜브는 history.pushState로 라우팅하므로 yt-navigate-finish 이벤트를 훅해 videoId 변경 감지
document.addEventListener('yt-navigate-finish', bootstrap)
