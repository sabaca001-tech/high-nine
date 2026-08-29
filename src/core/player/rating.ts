/** 能力値の表示・評価に関する変換 */

import type { Lineup } from '@/core/types/lineup'
import type { BattingAbilities, Pitch, PitchingAbilities, Player } from '@/core/types/player'
import { velocityGrade, velocityScore } from '@/core/types/player'
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
 * 球速のランク。**高校生の物差しで付ける。**
 *
 * 物理の尺度（`velocityScore`）をそのままランクにしていた頃は、
 * S（160km/h以上）に構造上ほぼ誰も届かず、
 * 高校生の球速はどれだけ鍛えてもD〜Bの帯に固まっていた。
 *
 *   120km/h → F ／ 130 → D ／ 140 → B ／ 145 → A ／ 150以上 → S
 */
export function velocityRank(velocity: number): Rank {
  return toRank(velocityGrade(velocity))
}

/**
 * プロの物差しでの球速のランク。**OB名鑑で使う。**
 *
 * プロ入りしても球速そのものは落ちない（落ちるのは高校基準の総合のほう）。
 * 変わるのは**比べる相手**で、150km/h は高校生なら一級品でも
 * プロでは普通なので、そこはランクの側で表す。
 *
 *   130km/h → F ／ 140 → D ／ 150 → B ／ 155 → A ／ 160以上 → S
 */
export function proVelocityRank(velocity: number): Rank {
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
    // **総合は高校生どうしを比べる値**なので、球速も高校生の物差しで見る
    // （物理の尺度で見ると、球速の帯が低いぶん投手だけ総合が沈む）
    velocityGrade(p.velocity) * VELOCITY_SHARE +
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

/**
 * 評価点。**総合（0〜100）の代わりに、一芸を正しく評価するための点数。**
 *
 * 総合は能力の加重平均だったので、
 * **オールCの選手が、ミートとパワーだけSで他がGの選手より上**に出ていた。
 * 平均で測る限りこうなるが、実際の野球は違う。
 * 打てる選手はそれだけで使いどころがあるし、
 * 150km/hを投げる投手は他が並でも一線で通用する。
 * 代表がどれも同じ顔（万能型）で埋まるのも、平均で選んでいたため。
 *
 * **高い能力ほど1点の値打ちを上げる**（`RANK_MULTIPLIER`）。
 * Sの能力は1点あたり2.5点として数えるので、
 * 突き抜けた一芸は平均を大きく押し上げる。
 */
export const RANK_MULTIPLIER: Record<Rank, number> = {
  S: 2.5,
  A: 2,
  B: 1.7,
  C: 1.5,
  D: 1.3,
  E: 1.2,
  F: 1.1,
  G: 1,
}

/** 能力値1つぶんの値打ち。ランクが上がるほど1点が重くなる */
export function abilityPoints(value: number): number {
  return value * RANK_MULTIPLIER[toRank(value)]
}

/**
 * 評価点の刻み。
 * 平凡な高校生（オールD＝50）で325点、
 * 全国区（オールA＝85）で850点あたりになるように置いた。
 */
const POINT_SCALE = 5

/**
 * 弾道1段ぶんの評価点。**いちばん軽い能力（肩力）より軽く**なるように置く。
 * 打撃の重みを上げて肩力を軽くしたぶん、ここも下げてある（10 → 8）。
 */
const TRAJECTORY_POINTS = 8

/** 特殊能力ぶんの評価点（`skillRatingBonus` を点数に換算する） */
const SKILL_POINTS = 5

/**
 * その選手の評価点。**投手は投げる力だけ、野手は打って守る力だけ**で決まる。
 *
 * 重みは総合（`battingRating` / `pitchingRating`）と同じで、
 * 違うのは**能力値をそのまま足さず、ランクの係数を掛けてから足す**ところ。
 */
export function playerPoints(player: Player): number {
  const points = player.isPitcher && player.pitching
    ? pitcherPoints(player.pitching)
    : batterPoints(player.batting)

  return Math.round(points + skillRatingBonus(player) * SKILL_POINTS)
}

/**
 * 野手の評価に占める重み。**上から順に値打ちが大きい。**
 *
 *   パワー ＝ ミート ＞ 守備 ＞ 走力 ＞ 捕球 ＞ 肩力 ＞ 弾道
 *
 * **打撃の価値を段階的に上げてきた**（.24 → .28 → .32）。
 * 打てなければ試合にならないし、守備の穴は守る位置を選べば隠せる。
 * 守備は「守れるかどうか」で起用が決まるぶん走力より重く、
 * 肩は効く場面が限られるので能力の中ではいちばん軽い。
 *
 * **走力はあまり削っていない**（.12 → .11）。
 * 内野安打と、単打を二塁打にする走塁で打撃成績そのものに効くので
 * （`hitRate` と `doubleShare`）、実測の貢献に見合う位置に置いてある。
 */
const BATTER_WEIGHTS = {
  meet: 0.32,
  power: 0.32,
  fielding: 0.13,
  speed: 0.11,
  catching: 0.07,
  arm: 0.05,
}

function batterPoints(b: BattingAbilities): number {
  const weighted =
    abilityPoints(b.meet) * BATTER_WEIGHTS.meet +
    abilityPoints(b.power) * BATTER_WEIGHTS.power +
    abilityPoints(b.fielding) * BATTER_WEIGHTS.fielding +
    abilityPoints(b.speed) * BATTER_WEIGHTS.speed +
    abilityPoints(b.catching) * BATTER_WEIGHTS.catching +
    abilityPoints(b.arm) * BATTER_WEIGHTS.arm

  // 弾道は4段階しかないので、能力値と同じ扱いにはできない。
  // **いちばん軽い能力（肩力）より軽く**なるように点数を置く
  return weighted * POINT_SCALE + (b.trajectory - 1) * TRAJECTORY_POINTS
}

/**
 * 投手の評価に占める重み。**上から順に値打ちが大きい。**
 *
 *   球速 ＞ 制球 ＞ 変化量 ＞ キレ ＞ ノビ ＞ 球種 ＞ スタミナ
 *
 * **「変化量」と「球種」は別のもの。** 変化量は持ち球がどれだけ曲がるか
 * （`Pitch.level`）で、球種は何種類投げられるか。
 * 曲がらない球を6種類持っているより、大きく曲がる球が2つあるほうが強い。
 * スタミナがいちばん軽いのは、継投で補える唯一の項目だから。
 *
 * **球速をさらに重くしてある**（.26 → .32）。
 * 打席の判定は球威（球速7割）で決まるので、球速はそのまま
 * 「打たれにくさ」に直結する。ドラフトの分かれ目（150km/h）でもある。
 */
export const PITCHER_WEIGHTS = {
  velocity: 0.32,
  control: 0.19,
  breakAmount: 0.15,
  sharpness: 0.12,
  life: 0.09,
  variety: 0.07,
  stamina: 0.06,
}

function pitcherPoints(p: PitchingAbilities): number {
  const weighted =
    // 球速は**高校生の物差し**で見る（評価点も高校生どうしを比べる値）
    abilityPoints(velocityGrade(p.velocity)) * PITCHER_WEIGHTS.velocity +
    abilityPoints(p.control) * PITCHER_WEIGHTS.control +
    abilityPoints(breakAmountScore(p.pitches)) * PITCHER_WEIGHTS.breakAmount +
    abilityPoints(p.sharpness) * PITCHER_WEIGHTS.sharpness +
    abilityPoints(p.life) * PITCHER_WEIGHTS.life +
    abilityPoints(varietyScore(p.pitches)) * PITCHER_WEIGHTS.variety +
    abilityPoints(p.stamina) * PITCHER_WEIGHTS.stamina

  return weighted * POINT_SCALE
}

/**
 * 持ち球の変化量を、能力値と同じ 0〜100 に直す。
 * **平均の変化量**で見るので、曲がらない球を増やしても上がらない。
 *
 * 変化量3で54、4で72、5で90、6以上で100。
 * **上の帯まで届かせてある。** 64止まりにしていた頃は、
 * どれだけ良い持ち球でもCの係数しか掛からず、
 * 投手だけ評価点が構造的に低く出て**U18代表が野手30人**になった。
 */
export function breakAmountScore(pitches: Pitch[]): number {
  if (pitches.length === 0) return 0
  const average = pitches.reduce((sum, pitch) => sum + pitch.level, 0) / pitches.length
  return Math.min(100, Math.round(average * BREAK_AMOUNT_SCALE))
}

/** 球種の数を 0〜100 に直す。2球種で52、3球種で78、4球種で100 */
export function varietyScore(pitches: Pitch[]): number {
  return Math.min(100, pitches.length * VARIETY_SCALE)
}

const BREAK_AMOUNT_SCALE = 18
const VARIETY_SCALE = 26

/**
 * 評価点からランクを出す。カードに出す大文字はこれで決める。
 * 境界は「全能力がそのランクちょうどの選手」の点数に合わせてある。
 */
export function pointsRank(points: number): Rank {
  for (const { rank, min } of POINT_THRESHOLDS) {
    if (points >= min) return rank
  }
  return 'G'
}

const POINT_THRESHOLDS: { rank: Rank; min: number }[] = [
  { rank: 'S', min: 1050 }, // 全能力90で1125
  { rank: 'A', min: 800 }, // 全能力85で850
  { rank: 'B', min: 580 }, // 全能力70で595
  { rank: 'C', min: 440 }, // 全能力60で450
  { rank: 'D', min: 320 }, // 全能力50で325
  { rank: 'E', min: 230 }, // 全能力40で240
  { rank: 'F', min: 130 }, // 全能力25で137
  { rank: 'G', min: 0 },
]

/** スタメンの人数。チームの評価点はこの9人ぶんで数える */
export const LINEUP_SIZE = 9

/**
 * チームの評価点。**スタメンの合計。**
 *
 * **平均で出すのをやめた。** 平均は「穴が無いか」を測るものなので、
 * 飛び抜けた選手を抱えた学校が平らな学校に埋もれる。
 * 強豪は平均が高いとは限らず、**点数が高い**。
 * 選手ひとりの評価点（`playerPoints`）と地続きの数字になるので、
 * 「この学校はうちのエース何人ぶんか」がそのまま読める。
 */
export function teamPoints(players: Player[]): number {
  return players.reduce((sum, player) => sum + playerPoints(player), 0)
}

/**
 * 自校のスタメンの評価点。
 *
 * **他校と同じ物差しで出すためのもの。**（他校は `lineupPointsOf`）
 * トーナメント表で自校だけ「互角の基準（強さ0）から見込んだ固定値」を
 * 出していたので、甲子園でベスト8まで来ても **E 2,511 のまま**で、
 * 周りの B 6,000 台と並ぶと自校だけ極端に弱く見えていた。
 */
export function lineupPoints(players: Player[], lineup: Lineup): number {
  const starters = new Set(lineup.slots.map((slot) => slot.playerId))
  return teamPoints(players.filter((player) => starters.has(player.id)))
}

/**
 * 総合（0〜100）しか分からない選手の評価点。
 *
 * 能力の内訳を持たない相手（卒業してプロに行った選手、その大会限りの代表校）は
 * **全能力がその総合の選手**と見なして点数に直す。
 * 画面に出る数字の単位を、在校生と揃えるためのもの。
 */
export function pointsFromRating(rating: number): number {
  return Math.round(abilityPoints(rating) * POINT_SCALE)
}

/**
 * 総合（0〜100）しか分からない相手のチーム評価点。
 * **その総合の選手が9人並んだ**と見なす。
 */
export function teamPointsFromRating(rating: number): number {
  return pointsFromRating(rating) * LINEUP_SIZE
}

/** チームの評価点のランク。1人あたりに直して見る */
export function teamPointsRank(points: number, size = LINEUP_SIZE): Rank {
  return pointsRank(points / Math.max(1, size))
}

/** 「B 5,412」のような表記 */
export function teamPointsLabel(points: number, size = LINEUP_SIZE): string {
  return `${teamPointsRank(points, size)} ${Math.round(points).toLocaleString('ja-JP')}`
}
