/**
 * 誰がどれだけ伸びたか。
 *
 * 練習も試合もその場でメッセージが流れるだけだったので、
 * **後から振り返れなかった**。「今年いちばん伸びたのは誰か」が
 * 分からないと、練習の選び方が良かったのかを判断しようがない。
 *
 * `Player.history`（月ごとの能力の記録）から差を取るだけで、
 * 新しい状態は持たない。判定には一切使わない。
 */

import { overallRating } from './rating'
import type { AbilitySnapshot, GrowableKey, Player } from '@/core/types/player'

/** 1人ぶんの伸び */
export type GrowthEntry = {
  player: Player
  /** 起点の総合 */
  from: number
  /** 現在の総合 */
  to: number
  /** 伸び幅（マイナスもある） */
  delta: number
  /** 能力ごとの伸び。0のものは含まない */
  gains: { key: GrowableKey; delta: number }[]
}

/** どこを起点に比べるか */
export type GrowthRange =
  /** 入学したとき */
  | 'enrollment'
  /** 今年度の初め */
  | 'season'
  /** 直近1ヶ月 */
  | 'month'

export const GROWTH_RANGE_LABELS: Record<GrowthRange, string> = {
  enrollment: '入学から',
  season: '今年度',
  month: '直近1ヶ月',
}

/** 比べたい能力（弾道だけは伸び方が特殊なので外す） */
const KEYS: GrowableKey[] = [
  'meet',
  'power',
  'speed',
  'arm',
  'fielding',
  'catching',
  'velocity',
  'control',
  'stamina',
  'breaking',
]

/** 記録から能力値を1つ取り出す */
function valueOf(snapshot: AbilitySnapshot, key: GrowableKey): number | undefined {
  return (snapshot as unknown as Record<string, number | undefined>)[key]
}

/** いまの能力値 */
function currentOf(player: Player, key: GrowableKey): number | undefined {
  if (key === 'velocity') return player.pitching?.velocity
  if (key === 'control' || key === 'stamina' || key === 'breaking') {
    return player.pitching?.[key]
  }
  return player.batting[key]
}

/**
 * 比べる起点の記録を選ぶ。
 *
 * `history` は月が変わるたびに1件ずつ増える（古い順）。
 * 起点が見つからない場合は、いちばん古い記録を使う。
 */
function baselineOf(player: Player, range: GrowthRange, year: number): AbilitySnapshot | null {
  const history = player.history
  if (history.length === 0) return null

  if (range === 'enrollment') return history[0]

  if (range === 'month') {
    // 末尾が「今月の初め」の記録なので、それを起点にする
    return history[history.length - 1]
  }

  // 今年度の初め。見つからなければ入学時（今年入った選手など）
  return history.find((snapshot) => snapshot.year === year) ?? history[0]
}

/** 1人ぶんの伸びを求める。記録が無ければ null */
export function growthOf(player: Player, range: GrowthRange, year: number): GrowthEntry | null {
  const baseline = baselineOf(player, range, year)
  if (!baseline) return null

  const gains: GrowthEntry['gains'] = []
  for (const key of KEYS) {
    const before = valueOf(baseline, key)
    const after = currentOf(player, key)
    if (before === undefined || after === undefined) continue
    const delta = after - before
    if (delta !== 0) gains.push({ key, delta })
  }

  // 起点の能力から総合を組み直す。これで「総合がいくつ伸びたか」が出せる
  const from = overallRating(rebuild(player, baseline))
  const to = overallRating(player)

  return {
    player,
    from,
    to,
    delta: to - from,
    gains: gains.sort((a, b) => b.delta - a.delta),
  }
}

/**
 * 記録の値で選手を組み直す（総合を計算するためだけの一時的なもの）。
 * 記録に無い項目（弾道など）は今の値をそのまま使う。
 */
function rebuild(player: Player, snapshot: AbilitySnapshot): Player {
  return {
    ...player,
    batting: {
      ...player.batting,
      meet: snapshot.meet,
      power: snapshot.power,
      speed: snapshot.speed,
      arm: snapshot.arm,
      fielding: snapshot.fielding,
      catching: snapshot.catching,
    },
    pitching:
      player.pitching && snapshot.control !== undefined
        ? {
            ...player.pitching,
            velocity: snapshot.velocity ?? player.pitching.velocity,
            control: snapshot.control,
            stamina: snapshot.stamina ?? player.pitching.stamina,
            breaking: snapshot.breaking ?? player.pitching.breaking,
          }
        : player.pitching,
  }
}

/** 部員全員の伸びを、大きい順に並べて返す */
export function growthRanking(
  players: Player[],
  range: GrowthRange,
  year: number,
): GrowthEntry[] {
  return players
    .map((player) => growthOf(player, range, year))
    .filter((entry): entry is GrowthEntry => entry !== null)
    .sort((a, b) => b.delta - a.delta)
}
