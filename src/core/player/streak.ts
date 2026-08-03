/**
 * 急成長とスランプ。
 *
 * 高校生は突然伸びたり、逆に急に崩れたりする。
 * 練習の積み上げだけでは単調なので、月ごとに偶発的な変動を入れる。
 *
 * 起きる確率は性格・学年・やる気で変わり、
 * 「天才肌の1年生は化けることも崩れることもある」といった差が出る。
 */

import type { Rng } from '@/core/rng/random'
import { effectOf } from './personality'
import { getAbility, raiseAbility } from './growth'
import type { AbilityChange, GrowableKey, Player } from '@/core/types/player'
import { ABILITY_LABELS, isAvailable } from '@/core/types/player'

/**
 * 月ごとの基本発生率。
 *
 * 上下をほぼ釣り合わせている。急成長だけが多いと
 * 「練習しなくても勝手に伸びる」ことになり、練習の意味が薄れるため。
 * 狙いは平均を押し上げることではなく、**選手ごとの振れ幅を出すこと**。
 */
const BREAKOUT_RATE = 0.05
const SLUMP_RATE = 0.05

/** 変動する能力の数 */
const BREAKOUT_KEYS = { min: 2, max: 3 }
const SLUMP_KEYS = { min: 2, max: 3 }

/** 変動幅。急成長のほうがやや大きい（伸びる方向に少しだけ寄せる） */
const BREAKOUT_AMOUNT = { min: 5, max: 13 }
const SLUMP_AMOUNT = { min: 4, max: 11 }

export type StreakEvent = {
  playerId: string
  playerName: string
  kind: 'breakout' | 'slump'
  changes: AbilityChange[]
  text: string
}

export type StreakOutcome = {
  players: Player[]
  events: StreakEvent[]
}

/**
 * 月替わりで、各選手に急成長・スランプが起きるか判定する。
 * 離脱中の選手には起きない。
 */
export function applyStreaks(rng: Rng, players: Player[]): StreakOutcome {
  const events: StreakEvent[] = []

  const updated = players.map((player) => {
    if (!isAvailable(player)) return player

    const effect = effectOf(player.personality)
    // 天才肌のように「やる気に振り回される」性格ほど変動しやすい
    const volatility = effect.motivationSensitivity

    // 下級生ほど伸びしろがあり、やる気が高いほど化けやすい
    const gradeFactor = player.grade === 1 ? 1.4 : player.grade === 2 ? 1.1 : 0.8
    const moodFactor = 1 + player.motivation * 0.15

    const breakoutRate = BREAKOUT_RATE * volatility * gradeFactor * moodFactor
    const slumpRate = SLUMP_RATE * volatility * (2 - moodFactor)

    if (rng.chance(breakoutRate)) {
      return applyChange(rng, player, 'breakout', events)
    }
    if (rng.chance(slumpRate)) {
      return applyChange(rng, player, 'slump', events)
    }
    return player
  })

  return { players: updated, events }
}

function applyChange(
  rng: Rng,
  player: Player,
  kind: 'breakout' | 'slump',
  events: StreakEvent[],
): Player {
  const isBreakout = kind === 'breakout'
  const count = isBreakout
    ? rng.int(BREAKOUT_KEYS.min, BREAKOUT_KEYS.max)
    : rng.int(SLUMP_KEYS.min, SLUMP_KEYS.max)

  const keys = rng.shuffle(growableKeysOf(player)).slice(0, count)
  const changes: AbilityChange[] = []
  let current = player

  for (const key of keys) {
    const amount = isBreakout
      ? Math.max(1, Math.round(rng.int(BREAKOUT_AMOUNT.min, BREAKOUT_AMOUNT.max) * ceilingFactor(current, key)))
      : -rng.int(SLUMP_AMOUNT.min, SLUMP_AMOUNT.max)

    const result = raiseAbility(current, key, amount)
    current = result.player
    if (result.change) changes.push(result.change)
  }

  if (changes.length === 0) return player

  const labels = changes.map((change) => ABILITY_LABELS[change.key]).join('・')
  events.push({
    playerId: player.id,
    playerName: player.name,
    kind,
    changes,
    text: isBreakout
      ? `${player.name}が急成長！ ${labels}が大きく伸びた`
      : `${player.name}がスランプに。${labels}が下がった`,
  })

  return current
}

/**
 * 高い能力ほど急成長の伸びを抑える。
 * これが無いと、完成した選手が+13を繰り返して天井知らずになる。
 * 落ちる方（スランプ）には掛けない — 崩れるのはどの水準でも起きるため。
 */
function ceilingFactor(player: Player, key: GrowableKey): number {
  const current = getAbility(player, key) ?? 50
  if (current >= 90) return 0.25
  if (current >= 80) return 0.5
  if (current >= 70) return 0.75
  return 1
}

/** その選手が持っている能力のキー */
function growableKeysOf(player: Player): GrowableKey[] {
  const batting: GrowableKey[] = ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']
  const pitching: GrowableKey[] = ['control', 'stamina', 'breaking']
  return player.isPitcher ? [...batting, ...pitching] : batting
}
