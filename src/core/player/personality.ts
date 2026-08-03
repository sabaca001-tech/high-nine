/**
 * 性格の効果。
 *
 * それまで表示だけだった性格に、成長と試合の両方で意味を持たせる。
 * 「どの性格が強い」ではなく**得意分野が違う**ように配分している。
 */

import type { Personality } from '@/core/types/player'

export type PersonalityEffect = {
  /** 練習の成長量にかかる倍率 */
  growth: number
  /**
   * 体力不足のペナルティの効き方。
   * 1で通常、0.5ならペナルティが半分、1.3なら1.3倍に増える。
   */
  conditionResilience: number
  /** やる気の影響の強さ。1で通常、0.5なら影響が半分 */
  motivationSensitivity: number
  /** 練習での体力消費の倍率 */
  conditionCost: number
  /** 信頼度の増加量の倍率 */
  trustGain: number
  /** 試合：四球の選びやすさ */
  eye: number
  /** 試合：得点圏・終盤での補正 */
  clutch: number
  /** UIに出す一言 */
  summary: string
}

export const PERSONALITY_EFFECTS: Record<Personality, PersonalityEffect> = {
  ど根性: {
    growth: 1.0,
    // 疲れていても練習をやり切る
    conditionResilience: 0.5,
    motivationSensitivity: 1.0,
    conditionCost: 1.0,
    trustGain: 1.0,
    eye: 0,
    clutch: 5,
    summary: '疲れていても伸びる。土壇場に強い',
  },
  クール: {
    growth: 1.0,
    conditionResilience: 1.0,
    // 調子に左右されにくい
    motivationSensitivity: 0.5,
    conditionCost: 1.0,
    trustGain: 1.0,
    eye: 6,
    clutch: 4,
    summary: 'やる気に左右されにくく、プレッシャーに強い',
  },
  ムードメーカー: {
    growth: 1.0,
    conditionResilience: 1.0,
    motivationSensitivity: 1.0,
    conditionCost: 1.0,
    // 周りを巻き込むので信頼を得やすい
    trustGain: 1.6,
    eye: 0,
    clutch: 0,
    summary: '信頼度が上がりやすい',
  },
  したたか: {
    growth: 1.0,
    conditionResilience: 1.0,
    motivationSensitivity: 1.0,
    conditionCost: 0.85,
    trustGain: 1.0,
    // 粘って四球を選ぶ
    eye: 12,
    clutch: 0,
    summary: '四球を選びやすく、消耗しにくい',
  },
  天才肌: {
    // 伸びは速いが、気分の影響も大きい
    growth: 1.18,
    conditionResilience: 1.0,
    motivationSensitivity: 1.5,
    conditionCost: 1.0,
    trustGain: 0.8,
    eye: 0,
    clutch: 0,
    summary: 'よく伸びるが、やる気に大きく左右される',
  },
  やんちゃ: {
    growth: 1.12,
    conditionResilience: 1.0,
    motivationSensitivity: 1.0,
    // 練習でも全力なので消耗が激しい
    conditionCost: 1.3,
    trustGain: 0.9,
    eye: -4,
    clutch: 2,
    summary: 'よく伸びるが消耗が激しい',
  },
}

export function effectOf(personality: Personality): PersonalityEffect {
  return PERSONALITY_EFFECTS[personality]
}
