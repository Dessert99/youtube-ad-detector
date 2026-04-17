// 유튜브 시청 페이지에서 한국어 자막을 추출해 TranscriptSegment[]로 변환하는 독립 모듈 (ADR-004 단독 경로)
import type { TranscriptSegment } from '@yad/shared'

// ytInitialPlayerResponse 내부 captionTracks 항목 형태: 옵셔널 필드 다수
interface CaptionTrack {
  baseUrl?: string
  languageCode?: string
  kind?: string
}

// player response에서 한국어 트랙 후보를 꺼내기 위해 좁혀둔 부분 형태
interface PlayerResponseShape {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[]
    }
  }
}

// timedtext json3 응답 1 이벤트: 한 자막 라인의 시작/길이/조각들을 묶음
interface Json3Segment {
  utf8?: string
}
interface Json3Event {
  tStartMs?: number
  dDurationMs?: number
  segs?: Json3Segment[]
}

// 1차로 전역 변수, 실패 시 <script> 텍스트에서 ytInitialPlayerResponse 객체를 잘라내 파싱한다
export function extractPlayerResponse(): unknown | null {
  // 페이지 컨텍스트에 이미 노출된 전역을 우선 시도 (가장 빠르고 안정)
  const direct = (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse
  if (direct) return direct

  // 전역이 없으면 인라인 <script>에서 할당식을 찾아 JSON 본문만 잘라내 파싱
  const scripts = document.querySelectorAll('script')
  for (const script of Array.from(scripts)) {
    const text = script.textContent ?? ''
    const idx = text.indexOf('ytInitialPlayerResponse = {')
    if (idx === -1) continue
    const start = text.indexOf('{', idx)
    if (start === -1) continue
    const json = sliceBalancedJson(text, start)
    if (!json) continue
    try {
      return JSON.parse(json)
    } catch {
      // 파싱 실패한 후보는 다음 script로 계속 탐색
      continue
    }
  }
  return null
}

// 문자열·이스케이프를 인지하면서 중괄호 균형이 맞는 첫 객체 본문을 잘라낸다
function sliceBalancedJson(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === undefined) break
    if (escape) {
      // 이전 문자가 백슬래시였으므로 현재 문자는 항상 리터럴로 취급
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      // 문자열 경계를 토글해 내부 중괄호가 깊이에 영향을 주지 않도록 함
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

// captionTracks에서 languageCode === 'ko' 첫 트랙을 고른다 (ASR 허용, 다른 언어 폴백 금지)
export function pickKoreanCaptionTrack(response: unknown): { baseUrl: string } | null {
  const tracks = (response as PlayerResponseShape | null | undefined)?.captions
    ?.playerCaptionsTracklistRenderer?.captionTracks
  if (!Array.isArray(tracks)) return null
  // ko 트랙은 수동/자동(asr) 모두 허용 — ADR-004 운영 정책
  const ko = tracks.find((t) => t?.languageCode === 'ko')
  if (!ko || typeof ko.baseUrl !== 'string' || ko.baseUrl.length === 0) return null
  return { baseUrl: ko.baseUrl }
}

// timedtext baseUrl에 fmt=json3을 붙여 호출하고 events[]를 TranscriptSegment[]로 변환
export async function fetchTranscript(track: { baseUrl: string }): Promise<TranscriptSegment[]> {
  const url = `${track.baseUrl}&fmt=json3`
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    // 네트워크 실패는 빈 배열로 흡수해 호출자가 null과 구분되게 한다
    return []
  }
  if (!res.ok) return []
  let json: { events?: Json3Event[] }
  try {
    json = (await res.json()) as { events?: Json3Event[] }
  } catch {
    return []
  }
  const events = json.events ?? []
  const segments: TranscriptSegment[] = []
  for (const ev of events) {
    if (typeof ev.tStartMs !== 'number' || !Array.isArray(ev.segs)) continue
    // segs의 utf8 조각을 이어붙여 1 라인 텍스트로 만든다
    const text = ev.segs.map((s) => s?.utf8 ?? '').join('').trim()
    if (!text) continue
    const start = ev.tStartMs / 1000
    const end = (ev.tStartMs + (ev.dDurationMs ?? 0)) / 1000
    segments.push({ start, end, text })
  }
  return segments
}

// 위 3단계를 묶은 진입점: 부재/빈 결과를 모두 null로 정규화해 호출자가 단일 분기로 다루게 한다
export async function loadKoreanTranscript(): Promise<TranscriptSegment[] | null> {
  const response = extractPlayerResponse()
  if (!response) return null
  const track = pickKoreanCaptionTrack(response)
  if (!track) return null
  const segments = await fetchTranscript(track)
  // 자막 트랙은 있으나 실제 라인이 비어 있으면 UI 미표시 정책에 맞춰 null로 통일
  if (segments.length === 0) return null
  return segments
}
