import type { AnalyzeRequest, AnalyzeResponse } from '@yad/shared'
import { ANALYZE_PATH, API_BASE_URL } from '~lib/config'

// content script로부터 받는 메시지 타입: 분석 요청과 보고서 탭 오픈 두 종류
type Message =
  | { type: 'ANALYZE_VIDEO'; videoId: string }
  | { type: 'OPEN_REPORT'; reportUrl: string }

// 백그라운드 서비스 워커: 서버 통신·탭 오픈을 담당해 CORS·권한을 한 곳에서 처리
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'ANALYZE_VIDEO') {
    // fetch를 비동기로 처리하므로 true 반환해 응답 채널을 열어둠
    analyzeVideo(message.videoId).then(sendResponse).catch((e) => {
      sendResponse({ error: e instanceof Error ? e.message : String(e) })
    })
    return true
  }

  if (message.type === 'OPEN_REPORT') {
    // 보고서 URL은 상대 경로이므로 API_BASE_URL과 결합해 절대 경로로 만들어 새 탭 open
    chrome.tabs.create({ url: `${API_BASE_URL}${message.reportUrl}` })
    sendResponse({ ok: true })
    return false
  }

  return false
})

// 서버 /api/analyze로 POST 요청을 보내고 JSON 응답을 그대로 전달
async function analyzeVideo(videoId: string): Promise<AnalyzeResponse> {
  const body: AnalyzeRequest = { videoId }
  const res = await fetch(`${API_BASE_URL}${ANALYZE_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`analyze failed: ${res.status}`)
  }

  return (await res.json()) as AnalyzeResponse
}
