/** 能力値の表示・評価に関する変換 */

import type { Player } from '@/core/types/player'
import { velocityScore } from '@/core/types/player'

/** F〜S のランク表記 */
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

/**
 * ランクの下限値。上から順に判定する。
 * 数値はバランス調整対象（docs/balance.md 参照）
 */
const RANK_THRESHOLDS: { rank: Rank; min: number }[] = [
  { rank: 'S', min: 90 },
  { rank: 'A', min: 80 },
  { rank: 'B', min: 70 },
  { rank: 'C', min: 60 },
  { rank: 'D', min: 50 },
  { rank: 'E', min: 40 },
  { rank: 'F', min: 25 },
  { rank: 'G', min: 0 },
]

/** 能力値(1〜100) → ランク表記 */
export function toRank(value: number): Rank {
  for (const { rank, min } of RANK_THRESHOLDS) {
    if (value >= min) return rank
  }
  return 'G'
}

/** 弾道(1〜4)は星で表示する */
export function trajectoryStars(trajectory: number): string {
  return '★'.repeat(trajectory) + '☆'.repeat(4 - trajectory)
}

/**
 * 総合評価(1〜100)。部員一覧の並び替えや、新入生の期待値表示に使う。
 * 投手は投手能力、野手は野手能力を重視した加重平均。
 */
export function overallRating(player: Player): number {
  if (player.isPitcher && player.pitching) {
    const p = player.pitching
    // 球速の尺度は types/player.ts に一本化してある。
    // 判定（simulateAtBat）と総合で別々の式を持つと、同じ球速が違う意味になる
    const score =
      velocityScore(p.velocity) * 0.4 + p.control * 0.22 + p.stamina * 0.16 + p.breaking * 0.22
    return Math.round(score)
  }

  const b = player.batting
  const score =
    b.meet * 0.25 +
    b.power * 0.25 +
    b.speed * 0.15 +
    b.arm * 0.1 +
    b.fielding * 0.15 +
    b.catching * 0.1
  return Math.round(score)
}

