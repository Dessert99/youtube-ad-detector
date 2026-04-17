import type { ReactNode } from 'react'

// 전역 레이아웃: 보고서·랜딩 페이지 공용 HTML 골격 제공
export const metadata = {
  title: 'YouTube Ad Detector',
  description: '유튜브 허위·과장 광고 의심신호 탐지 보고서',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
