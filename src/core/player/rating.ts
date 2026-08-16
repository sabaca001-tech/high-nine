/** 能力値の表示・評価に関する変換 */

import type { BattingAbilities, Pitch, PitchingAbilities, Player } from '@/core/types/player'
import { velocityScore } from '@/core/types/player'
import { arsenalScore } from './pitchDefs'
import { findSkill } from '@/core/skill/skillDefs'
import type { SkillRank } from '@/core/types/skill'

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

/**
 * 「B(70)」のようなランク付きの表記。
 *
 * **プラス・マイナスでは読めない。** 他校の強さを「+15」と出していた頃は、
 * 自分のチームと比べてどうなのかが分からなかった。
 * 選手の総合と同じ物差し（ランクと数値）で出せば、そのまま比べられる。
 */
export function ratingLabel(rating: number): string {
  const value = Math.round(rating)
  return `${toRank(value)}(${value})`
}

/** 能力値(1〜100) → ランク表記 */
export function toRank(value: number): Rank {
  for (const { rank, min } of RANK_THRESHOLDS) {
    if (value >= min) return rank
  }
  return 'G'
}

/**
 * 球速のランク。
 *
 * **他の能力と同じ物差しで色を付けるための関数。**
 * 球速だけ km/h の実数値なので、そのままではランクの色が付けられなかった。
 * `velocityScore` の対応表がランクの境界に合わせてあるので、
 * ここは素直に通すだけでよい（130でF、140でD、160でS）。
 */
export function velocityRank(velocity: number): Rank {
  return toRank(velocityScore(velocity))
}

/**
 * 弾道(1〜4)を**打球の角度**で表す（水平からの度数）。
 *
 * 星（★★☆☆）にしていた頃は、他の能力と同じ「多いほど良い」に見えたが、
 * 弾道は**高ければ良いという値ではない**（ミートで当てる打者は低いほうが合う）。
 * 角度なら、その打者がどんな打球を打つのかがそのまま読める。
 *
 * **既製の矢印文字（→↗↑）では足りない。** 4段階に対して
 * 使える向きが45度刻みしか無く、弾道2と3が同じ字面になるか、
 * 弾道1が「下向き」という誤った意味になっていた。
 * 打球が下に飛ぶことは無いので、**1は水平**。
 * 上限も真上ではなく65度に留める（真上はポップフライで、良い打球ではない）。
 */
export const TRAJECTORY_ANGLES: Record<number, number> = {
  1: 0,
  2: 22,
  3: 45,
  4: 65,
}

/** 弾道の説明。角度だけでは伝わらないので添える */
export const TRAJECTORY_LABELS: Record<number, string> = {
  1: 'ゴロ',
  2: 'ライナー',
  3: 'フライ',
  4: 'アーチ',
}

/** 弾道(1〜4) → 打球の角度（度）。範囲外は水平として扱う */
export function trajectoryAngle(trajectory: number): number {
  return TRAJECTORY_ANGLES[trajectory] ?? 0
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
  const base =
    velocityScore(p.velocity) * VELOCITY_SHARE +
    p.control * 0.24 +
    p.stamina * 0.16 +
    p.sharpness * 0.20 +
    p.life * 0.10

  return clampRating(base + arsenalRatingBonus(p.pitches))
}

/**
 * 持ち球ぶんの上乗せ。
 *
 * **持ち球が総合にまったく効いていなかった。** 3球種を変化量5まで磨いた投手と、
 * スライダー1本の投手が同じ総合で並び、球種を覚えても数字がどこも動かない。
 * ただし主役は能力値なので、特殊能力（`skillRatingBonus`）と同じく上乗せは小さく取る。
 */
export function arsenalRatingBonus(pitches: Pitch[]): number {
  return Math.min(ARSENAL_BONUS_MAX, arsenalScore(pitches) * ARSENAL_BONUS_RATE)
}

/** 持ち球の充実ぶり1点あたりの上乗せ */
const ARSENAL_BONUS_RATE = 0.6

/** 持ち球ぶんの上乗せの上限。球種を集めただけで総合が跳ね上がらないようにする */
const ARSENAL_BONUS_MAX = 5

/**
 * 総合に占める球速の比重。
 *
 * **0.4 では投手だけ総合が沈んだ。** 球速の尺度をランクに合わせ直したので、
 * 実際に高校生が投げる帯（135〜148km/h）は40〜66にしか広がらない。
 * 変化球やスタミナが70〜90まで届くのに対して球速だけ低い帯にいるため、
 * 比重が大きいほど投手の総合が野手より一律に低く出る
 * （実測で投手50・野手60）。総合はベンチ入りやドラフトで
 * **野手と横並びに比べる値**なので、ここが偏ってはいけない。
 *
 * 「球速の重みを上げる」のは総合ではなく**試合の判定**のほう
 * （`simulateAtBat` の `VELOCITY_WEIGHT` と `VELOCITY_STRIKEOUT_RATE`）。
 */
const VELOCITY_SHARE = 0.3

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
 *
 * **特殊能力も少しだけ効く。** 能力値だけで並べていた頃は、
 * 金特を持った選手と持たない選手が同じ総合で並び、
 * 特訓や合宿で掴んだものが一覧のどこにも出てこなかった。
 * ただし主役はあくまで能力値なので、上乗せは小さく取る（最大でも+6）。
 */
export function overallRating(player: Player): number {
  const base =
    player.isPitcher && player.pitching
      ? pitchingRating(player.pitching)
      : battingRating(player.batting)

  return clampRating(base + skillRatingBonus(player))
}

/** 特殊能力ぶんの上乗せ。金特が重く、赤特はマイナス */
export function skillRatingBonus(player: Player): number {
  let bonus = 0
  for (const id of player.skills) {
    const skill = findSkill(id)
    if (!skill) continue
    bonus += SKILL_RATING_BONUS[skill.rank]
  }
  return Math.max(-SKILL_BONUS_MAX, Math.min(SKILL_BONUS_MAX, bonus))
}

const SKILL_RATING_BONUS: Record<SkillRank, number> = {
  gold: 3,
  blue: 1.5,
  red: -2,
}

/** 上乗せの上限。特殊能力を集めただけで総合が跳ね上がらないようにする */
const SKILL_BONUS_MAX = 6

function clampRating(value: number): number {
  return Math.min(100, Math.max(1, Math.round(value)))
}

