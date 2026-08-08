/** 能力値の表示・評価に関する変換 */

import type { BattingAbilities, PitchingAbilities, Player } from '@/core/types/player'
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

/**
 * 弾道(1〜4)は矢印で表す。打球の上がり方そのものを向きで示す。
 *
 * 星（★★☆☆）にしていた頃は、他の能力と同じ「多いほど良い」に見えたが、
 * 弾道は**高ければ良いという値ではない**（ミートで当てる打者は低いほうが合う）。
 * 向きなら、その打者がどんな打球を打つのかがそのまま読める。
 */
export const TRAJECTORY_ARROWS: Record<number, string> = {
  1: '↘',
  2: '→',
  3: '↗',
  4: '↑',
}

/** 弾道の説明。矢印だけでは伝わらないので添える */
export const TRAJECTORY_LABELS: Record<number, string> = {
  1: 'ゴロ',
  2: 'ライナー',
  3: 'フライ',
  4: 'アーチ',
}

/** 弾道(1〜4) → 矢印 */
export function trajectoryArrow(trajectory: number): string {
  return TRAJECTORY_ARROWS[trajectory] ?? '→'
}

/**
 * 投手としての総合(1〜100)。**野手能力は一切混ぜない。**
 *
 * 打撃の良い投手が「総合の高い投手」に見えてはいけない。
 * マウンドでの働きだけを測る。
 */
export function pitchingRating(p: PitchingAbilities): number {
  // 球速の尺度は types/player.ts に一本化してある。
  // 判定（simulateAtBat）と総合で別々の式を持つと、同じ球速が違う意味になる
  return Math.round(
    velocityScore(p.velocity) * 0.4 + p.control * 0.22 + p.stamina * 0.16 + p.breaking * 0.22,
  )
}

/** 野手としての総合(1〜100) */
export function battingRating(b: BattingAbilities): number {
  return Math.round(
    b.meet * 0.25 +
      b.power * 0.25 +
      b.speed * 0.15 +
      b.arm * 0.1 +
      b.fielding * 0.15 +
      b.catching * 0.1,
  )
}

/**
 * 総合評価(1〜100)。部員一覧の並び替えや、新入生の期待値表示に使う。
 * **投手は投手能力だけ、野手は野手能力だけ**で決まる。
 */
export function overallRating(player: Player): number {
  if (player.isPitcher && player.pitching) return pitchingRating(player.pitching)
  return battingRating(player.batting)
}

