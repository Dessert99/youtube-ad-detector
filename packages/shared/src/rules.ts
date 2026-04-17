import type { LawCategory } from './types'

// rule-based 엔진이 사용하는 룰 1건: 키워드 또는 간단 정규식만 사용 (ADR-009)
export interface Rule {
  id: string
  category: LawCategory
  description: string // 사람이 읽을 수 있는 룰 설명 (보고서 근거로 노출)
  riskWeight: number // 20~60 권장. 단일 룰로 High(>=60)에 들어가지 않도록 분산
  // 두 매칭 방식 중 정확히 하나만 제공: keywords(부분 포함) 또는 pattern(RegExp 문자열, i 플래그)
  pattern?: string
  keywords?: string[]
}

// 현재 룰 사전 버전: seed 룰 초안 투입에 맞춰 0.1.0으로 bump
export const RULE_VERSION = '0.1.0'

// MVP seed 룰: 건강식품·다이어트 광고에서 자주 등장하는 위법 소지 강한 표현만 수록
export const RULES: Rule[] = [
  // food_labeling: 식품이 질병을 치료한다고 단정하는 표현은 표시광고법 위반 소지가 크다
  {
    id: 'fl-cure-all',
    category: 'food_labeling',
    description: '식품이 모든 병을 낫게 한다는 만병통치형 표현',
    riskWeight: 45,
    keywords: ['만병통치', '모든 병에 효과', '모든 질병에 효과'],
  },
  {
    id: 'fl-complete-cure',
    category: 'food_labeling',
    description: '식품이 질병을 완치시킨다고 단정',
    riskWeight: 45,
    keywords: ['100% 완치', '100% 완치 보장', '완벽하게 완치'],
  },
  {
    id: 'fl-no-side-effects',
    category: 'food_labeling',
    description: '일반 식품에 대해 부작용이 전혀 없다고 단정하는 과장 표현',
    riskWeight: 25,
    keywords: ['부작용 전혀 없', '부작용이 없습니다', '무부작용'],
  },

  // health_functional: 건강기능식품이 특정 질병을 치료·예방한다는 표현은 금지
  {
    id: 'hf-diabetes-cure',
    category: 'health_functional',
    description: '당뇨를 치료·완치한다는 의약품적 효능 표방',
    riskWeight: 50,
    keywords: ['당뇨병 치료', '당뇨 완치', '당뇨병이 낫'],
  },
  {
    id: 'hf-cancer-prevent',
    category: 'health_functional',
    description: '암을 예방·치료한다고 단정하는 표현',
    riskWeight: 50,
    keywords: ['암 예방 확실', '암을 치료', '암 완치'],
  },
  {
    id: 'hf-blood-pressure',
    category: 'health_functional',
    description: '고혈압을 떨어뜨리거나 완치한다는 의약품적 효능 표방',
    riskWeight: 35,
    keywords: ['고혈압 완치', '혈압을 낮춰드립니다', '고혈압이 사라'],
  },

  // medical_device: 의료기기가 아닌 제품을 의료기기로 오인시키는 표현
  {
    id: 'md-mri-grade',
    category: 'medical_device',
    description: '일반 제품을 의료 영상장비 수준으로 오인시키는 표현',
    riskWeight: 40,
    keywords: ['MRI급', 'CT급 정밀', '초음파 진단급'],
  },
  {
    id: 'md-medical-grade',
    category: 'medical_device',
    description: '일반 제품에 의료기기 수준의 진단·치료 기능을 표방',
    riskWeight: 35,
    keywords: ['의료기기 수준', '병원용 의료기기', '의료급 치료기'],
  },

  // medical_act: 의료인·의료기관의 명의를 빌려 신뢰를 만드는 표현은 의료법 위반 소지
  {
    id: 'ma-doctor-recommend',
    category: 'medical_act',
    description: '의사가 직접 추천·처방했다고 주장해 의학적 권위를 차용',
    riskWeight: 35,
    keywords: ['의사가 추천', '의사가 처방', '전문의가 추천'],
  },
  {
    id: 'ma-hospital-endorse',
    category: 'medical_act',
    description: '병원이 공식 인정·사용한다고 주장해 의료기관 권위를 차용',
    riskWeight: 30,
    keywords: ['병원에서 인정', '대학병원에서 사용', '병원 공식 추천'],
  },

  // fair_trade: 객관적 근거 없는 최상급·유일성 표현은 표시광고법(표시광고 공정화) 위반 소지
  {
    id: 'ft-industry-first',
    category: 'fair_trade',
    description: '객관적 근거 없이 업계 1위·유일을 단정',
    riskWeight: 25,
    keywords: ['업계 1위 유일', '국내 유일', '업계에서 유일한'],
  },
  {
    id: 'ft-world-best',
    category: 'fair_trade',
    description: '검증 없는 세계 최고·세계 1위 표현',
    riskWeight: 25,
    keywords: ['세계 최고', '세계 1위', '세계에서 가장 뛰어난'],
  },
  {
    id: 'ft-absolute-superlative',
    category: 'fair_trade',
    description: '"가장", "최고" 등 절대적 최상급을 근거 없이 단정',
    riskWeight: 20,
    pattern: '(가장|최고의)\\s?(효과|효능|성능)',
  },
]
