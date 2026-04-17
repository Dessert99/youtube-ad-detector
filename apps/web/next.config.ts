import type { NextConfig } from 'next'

// 모노레포 내부 shared 패키지를 Next.js가 직접 트랜스파일하도록 지정
const config: NextConfig = {
  transpilePackages: ['@yad/shared'],
  // 크롬 확장에서 /api/analyze 호출을 허용하기 위한 CORS 헤더 (MVP: 모든 origin 허용)
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ]
  },
}

export default config
