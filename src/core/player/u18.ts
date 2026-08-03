/**
 * U18日本代表。
 *
 * 冬前に、**他校の選手と比べて抜けている**選手が召集される。
 * 相対評価なので、弱小校のうちはまず選ばれない。
 * 県内のライバル校の注目選手を上回っていることが条件になる。
 *
 * 代表で活躍するとプロが本気で見に来るようになり、
 * 卒業時のドラフト指名の確率が大きく上がる（career.ts の decidePath）。
 */

import type { Rng } from '@/core/rng/random'
import type { Player } from '@/core/types/player'
import { isAvailable } from '@/core/types/player'
import { overallRating } from './rating'
import { raiseAbility } from './growth'
import type { AbilityChange, GrowableKey } from '@/core/types/player'

/**
 * 代表に選ばれる総合の下限。B ランクの上位相当。
 *
 * 78 にしていたときは6年かけても2人に1人しか届かず、
 * 「そんな仕組みがあることに気づかない」水準だった。
 * 弱小のうちは無縁で、育ってくると常連になる曲線を狙っている。
 *
 * これは**床**でしかない。実際の基準は全国の顔ぶれとの比較で決まる（`u18Bar`）。
 */
export const U18_BASE_RATING = 75

/**
 * 代表の枠。この人数ぶん全国から選ばれるという想定。
 *
 * 以前は「県内でいちばん強い注目選手」と比べていたが、
 * 比較対象が1人だと、その選手が卒業した年だけ急に基準が下がる。
 * さらに参加校の多い県ほど強い選手が居るので、
 * **地区選択の難易度差がそのまま選考の厳しさに乗ってしまっていた**。
 */
export const U18_SQUAD_SIZE = 18

/** 全国の水準をこれだけ上回っている必要がある */
const OVER_RIVAL_MARGIN = 2

/** 一度に召集される人数の上限。1校から何人も選ばれるのは不自然 */
export const U18_MAX_PER_SCHOOL = 2

/** 代表に選ばれるのは上級生だけ */
const U18_MIN_GRADE = 2

/** 代表での1回の活躍度（0〜100） */
export type U18Cap = {
  year: number
  /** その大会での活躍度。0〜100 */
  performance: number
}

/**
 * 選考の基準になる総合。
 *
 * 全国の注目選手を強い順に並べたとき、代表枠のいちばん下にあたる選手を
 * 少し上回っていることを条件にする。**相対評価**なので、
 * 周りが育てば基準も上がる。
 */
export function u18Bar(nationalBarRating: number): number {
  return Math.max(U18_BASE_RATING, nationalBarRating + OVER_RIVAL_MARGIN)
}

/**
 * 召集する選手を選ぶ。
 * 実力順に、条件を満たす選手を上限まで。
 *
 * @param nationalBarRating 全国の注目選手のうち、代表枠のいちばん下の総合
 */
export function selectU18(players: Player[], nationalBarRating: number): Player[] {
  const bar = u18Bar(nationalBarRating)

  return [...players]
    .filter(
      (player) =>
        isAvailable(player) &&
        player.grade >= U18_MIN_GRADE &&
        overallRating(player) >= bar,
    )
    .sort((a, b) => overallRating(b) - overallRating(a))
    .slice(0, U18_MAX_PER_SCHOOL)
}

export type U18Outcome = {
  player: Player
  /** その大会での活躍度 0〜100 */
  performance: number
  changes: AbilityChange[]
}

/**
 * 代表に参加した1人の結果。
 *
 * 世界の強豪と当たるので、活躍できるかは実力次第。
 * 活躍すれば大きく伸び、通用しなければ経験だけが残る。
 */
export function playU18(rng: Rng, player: Player, year: number): U18Outcome {
  const rating = overallRating(player)
  // 総合78で平均45、総合95で平均80くらい。上振れ下振れが大きい
  const performance = clamp(
    Math.round((rating - 60) * 2.2 + rng.int(-22, 22)),
    0,
    100,
  )

  // 活躍度が高いほど大きく伸びる。0〜3段階
  const steps = performance >= 75 ? 3 : performance >= 50 ? 2 : performance >= 25 ? 1 : 0

  const keys: GrowableKey[] = player.pitching
    ? ['control', 'stamina', 'breaking']
    : ['meet', 'power', 'speed', 'fielding']

  let current = player
  const changes: AbilityChange[] = []
  for (let i = 0; i < steps; i++) {
    const result = raiseAbility(current, rng.pick(keys), 1)
    current = result.player
    if (result.change) changes.push(result.change)
  }

  return {
    player: {
      ...current,
      u18: [...current.u18, { year, performance }],
      // 代表に呼ばれること自体が自信になる
      trust: Math.min(100, current.trust + 6),
    },
    performance,
    changes,
  }
}

/**
 * 代表歴によるドラフトの上乗せ。
 * 選ばれただけでも見てもらえるが、活躍したかで大きく変わる。
 */
export function draftBonus(caps: readonly U18Cap[]): number {
  if (caps.length === 0) return 0
  const best = Math.max(...caps.map((cap) => cap.performance))
  return caps.length * 3 + Math.round(best / 6)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
