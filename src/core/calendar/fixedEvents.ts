/**
 * 日付固定イベント。
 *
 * 特定の月に必ず起きる学校行事。すごろくの乱数とは別に、
 * **毎年決まって来る起伏**を作って1年のリズムを出す。
 * 月が変わった直後に1度だけ適用される。
 */

import type { Rng } from '@/core/rng/random'
import { clamp } from '@/core/player/growth'
import { effectOf } from '@/core/player/personality'
import type { Month } from '@/core/types/game'
import type { Motivation, Player } from '@/core/types/player'

export type FixedEvent = {
  name: string
  /** 効果を適用して、表示する文言を返す */
  apply: (rng: Rng, players: Player[]) => { players: Player[]; text: string }
}

/** やる気を段階的に動かす */
function shiftMotivation(players: Player[], delta: number): Player[] {
  return players.map((player) => ({
    ...player,
    motivation: clamp(player.motivation + delta, -2, 2) as Motivation,
  }))
}

/** 体力を増減させる。性格の消耗しやすさも反映する */
function shiftCondition(players: Player[], delta: number): Player[] {
  return players.map((player) => {
    const scaled = delta < 0 ? delta * effectOf(player.personality).conditionCost : delta
    return { ...player, condition: clamp(player.condition + Math.round(scaled), 0, 100) }
  })
}

function shiftTrust(players: Player[], delta: number): Player[] {
  return players.map((player) => ({
    ...player,
    trust: clamp(player.trust + delta, 0, 100),
  }))
}

/**
 * 固定イベントの効果は控えめにする。
 * プレイヤーが避けようのないイベントなので、
 * 大きなマイナスを置くと理不尽になるだけで判断の余地が生まれない。
 */
export const FIXED_EVENTS: Partial<Record<Month, FixedEvent>> = {
  4: {
    name: '入学式',
    apply: (_rng, players) => ({
      players: shiftMotivation(players, 1),
      text: '入学式。新しい年度が始まり、チームに活気が出た',
    }),
  },
  6: {
    name: '中間試験',
    apply: (_rng, players) => ({
      players: shiftCondition(players, -8),
      text: '中間試験。勉強で練習時間が削られた',
    }),
  },
  8: {
    name: '猛暑',
    apply: (_rng, players) => ({
      players: shiftCondition(players, -10),
      text: '記録的な猛暑。全員が消耗した',
    }),
  },
  9: {
    name: '体育祭',
    apply: (_rng, players) => ({
      players: shiftTrust(players, 6),
      text: '体育祭で活躍した。チームの一体感が高まった',
    }),
  },
  11: {
    name: '期末試験',
    apply: (_rng, players) => ({
      players: shiftCondition(players, -8),
      text: '期末試験。しばらく練習が手につかない',
    }),
  },
  1: {
    name: '初詣',
    apply: (_rng, players) => ({
      players: shiftMotivation(players, 1),
      text: '初詣で必勝祈願。気持ちを新たにした',
    }),
  },
  2: {
    name: '体力測定',
    apply: (rng, players) => {
      // 1人だけ大きく数値が伸びる
      if (players.length === 0) return { players, text: '体力測定を行った' }
      const target = rng.pick(players)
      return {
        players: players.map((player) =>
          player.id === target.id
            ? { ...player, condition: clamp(player.condition + 20, 0, 100) }
            : player,
        ),
        text: `体力測定。${target.name}が好記録を出して自信をつけた`,
      }
    },
  },
}

export function fixedEventFor(month: Month): FixedEvent | undefined {
  return FIXED_EVENTS[month]
}
