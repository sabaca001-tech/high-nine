/**
 * U18日本代表での「その大会ぶんの結果」。
 *
 * **誰が選ばれるかは `u18Squad.ts` が決める**（全国から30人）。
 * ここは選ばれた自校の選手に何が起きるかだけを扱う。
 *
 * 代表で活躍するとプロが本気で見に来るようになり、
 * 卒業時のドラフト指名の確率が大きく上がる（career.ts の decidePath）。
 */

import type { Rng } from '@/core/rng/random'
import type { Player } from '@/core/types/player'
import { overallRating } from './rating'
import { raiseAbility } from './growth'
import type { AbilityChange, GrowableKey } from '@/core/types/player'

/** 代表での1回の活躍度（0〜100） */
export type U18Cap = {
  year: number
  /** その大会での活躍度。0〜100 */
  performance: number
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
    ? ['control', 'stamina', 'sharpness']
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
