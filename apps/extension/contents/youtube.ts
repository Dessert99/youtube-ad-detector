import type { PlasmoCSConfig } from 'plasmo'
import { analyze, RULE_VERSION, type AnalyzeResult } from '@yad/shared'
import { loadKoreanTranscript } from './transcript'

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

// 최근 분석한 videoId를 저장해 같은 영상 재요청 방지 (ADR-005 MVP 캐싱 가드)
let lastAnalyzedVideoId: string | null = null

// 한국어 자막 로드 → shared.analyze() → 배지 렌더까지 이어지는 확장 단독 분석 흐름 (ADR-012)
async function analyzeVideo(videoId: string): Promise<void> {
  // 중복 호출 가드: 같은 영상에 대해 파이프라인을 재실행하지 않는다
  if (videoId === lastAnalyzedVideoId) return
  lastAnalyzedVideoId = videoId

  // 자막이 없거나 빈 경우 null → 기존 배지만 걷어내고 UI 미표시 정책에 따라 종료
  const segments = await loadKoreanTranscript()
  if (!segments) {
    document.getElementById('yad-badge')?.remove()
    return
  }

  // rule 엔진은 순수함수 — 서버 왕복 없이 현재 페이지 문맥에서 바로 판정
  const result = analyze(segments)
  renderBadge(result, videoId, RULE_VERSION)
}

// 2-state 배지 렌더: safe는 정보성, fraud만 빨간 배지 + "자세히 보기" (ADR-010)
function renderBadge(result: AnalyzeResult, videoId: string, ruleVersion: string): void {
  // 이전 배지 제거 후 재생성 (SPA 전환 대응, id='yad-badge' 유지)
  document.getElementById('yad-badge')?.remove()

  const el = document.createElement('div')
  el.id = 'yad-badge'

  if (result.verdict === 'safe') {
    // safe 배지는 시청 방해 없이 작은 회색 뱃지만 — "자세히 보기" 링크 절대 미노출 (ADR-010)
    el.textContent = `안전 · ${result.riskScore}`
    el.style.cssText = `
      position: fixed; right: 16px; bottom: 16px; z-index: 9999;
      padding: 6px 10px; background: #444; color: #ddd;
      border-radius: 6px; font: 11px system-ui; opacity: .7;
      box-shadow: 0 2px 6px rgba(0,0,0,.2);
    `
    document.body.appendChild(el)
    return
  }

  // fraud: 빨간 배지에 "자세히 보기" 표기 → 클릭 시 background에 보고서 탭 오픈 요청
  el.textContent = `위험 ${result.riskScore} · 자세히 보기`
  el.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 9999;
    padding: 8px 12px; background: #d32f2f; color: #fff;
    border-radius: 8px; font: 12px system-ui; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,.3);
  `
  // 보고서 URL 조립은 background 책임 — content script는 의도만 전달한다
  el.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_REPORT', videoId, ruleVersion })
  })
  document.body.appendChild(el)
}

// 초기 진입 + SPA 전환 감지: 유튜브는 URL만 바뀌고 페이지가 다시 로드되지 않음
function bootstrap(): void {
  const id = extractVideoId()
  if (id) void analyzeVideo(id)
}

bootstrap()

// 유튜브는 history.pushState로 라우팅하므로 yt-navigate-finish 이벤트를 훅해 videoId 변경 감지
document.addEventListener('yt-navigate-finish', bootstrap)
