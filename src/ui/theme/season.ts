/** 月から季節を求める。見た目のためだけの変換なのでゲームルールには影響しない */

import type { Month } from '@/core/types/game'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export function seasonOf(month: Month): Season {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

/** 季節の舞い散るもの（春=桜、冬=雪、それ以外=なし） */
export function particleOf(season: Season): 'petal' | 'snow' | null {
  if (season === 'spring') return 'petal'
  if (season === 'winter') return 'snow'
  return null
}
