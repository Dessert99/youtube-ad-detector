import { API_BASE_URL } from '~lib/config'

// content script가 보내는 유일한 메시지: fraud 배지 클릭 시 보고서 탭 오픈 요청 (ADR-012)
type Message = { type: 'OPEN_REPORT'; videoId: string; ruleVersion: string }

// 백그라운드 서비스 워커: 보고서 URL 조립과 새 탭 오픈만 담당 (분석은 content script가 직접 수행)
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'OPEN_REPORT') {
    // /report/{videoId}/{ruleVersion} 세그먼트 URL로 새 탭 오픈 (ADR-006)
    chrome.tabs.create({
      url: `${API_BASE_URL}/report/${message.videoId}/${message.ruleVersion}`,
    })
    sendResponse({ ok: true })
    return false
  }

  return false
})
