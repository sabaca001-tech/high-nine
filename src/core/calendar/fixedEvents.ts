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
    apply: (rng, players) => takeExam(rng, players, '中間試験'),
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
    apply: (rng, players) => takeExam(rng, players, '期末試験'),
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


/**
 * 定期テスト。
 *
 * **学力が意味を持つ唯一の場面。** 全員の体力を削るだけの行事だった頃は、
 * 避けようのないマイナスが年2回来るだけで、判断の余地がまったく無かった。
 *
 * いまは学力（`Player.academics`）で結果が変わる。
 * 赤点を取れば補習に取られて練習がはかどらず、
 * 余裕のある選手は要領よく両立して、かえって集中して練習できる。
 * 効果は**次のテストまで**（`studyEffect`）。
 *
 * 自主学習カードで学力を上げておけば避けられるので、
 * 「いま伸ばすか、後で困らないようにするか」という選択になる。
 */
function takeExam(
  rng: Rng,
  players: Player[],
  name: string,
): { players: Player[]; text: string } {
  const failed: string[] = []
  const excelled: string[] = []

  const next = players.map((player) => {
    const base = { ...player, condition: clamp(player.condition - EXAM_CONDITION, 0, 100) }

    // 学力が低いほど赤点を引きやすい。学力70で0%、20で50%
    if (rng.chance(failChance(player.academics))) {
      failed.push(player.name)
      return { ...base, studyEffect: { rate: EXAM_FAIL_RATE, months: EXAM_EFFECT_MONTHS } }
    }
    // 余裕のある選手は、テスト明けに集中して練習できる
    if (rng.chance(excelChance(player.academics))) {
      excelled.push(player.name)
      return { ...base, studyEffect: { rate: EXAM_EXCEL_RATE, months: EXAM_EFFECT_MONTHS } }
    }
    return base
  })

  const parts: string[] = []
  if (failed.length > 0) parts.push(`${listOf(failed)}が赤点で補習に`)
  if (excelled.length > 0) parts.push(`${listOf(excelled)}は余裕で乗り切った`)

  return {
    players: next,
    text: parts.length > 0 ? `${name}。${parts.join('。')}` : `${name}。全員が無難に乗り切った`,
  }
}

/** 名前を並べる。多いときは人数でまとめる */
function listOf(names: string[]): string {
  if (names.length <= 2) return names.join('と')
  return `${names[0]}ほか${names.length - 1}人`
}

/** 赤点を引く確率。学力70以上なら引かない */
function failChance(academics: number): number {
  return Math.max(0, (EXAM_FAIL_LINE - academics) / EXAM_FAIL_LINE) * EXAM_FAIL_MAX
}

/** 余裕で乗り切る確率。学力55未満なら起きない */
function excelChance(academics: number): number {
  return Math.max(0, (academics - EXAM_EXCEL_LINE) / (100 - EXAM_EXCEL_LINE)) * EXAM_EXCEL_MAX
}

/** テストで削られる体力。学力に関係なく、勉強に時間は取られる */
const EXAM_CONDITION = 6

const EXAM_FAIL_LINE = 70
const EXAM_FAIL_MAX = 0.7
const EXAM_EXCEL_LINE = 55
const EXAM_EXCEL_MAX = 0.5

/** 赤点・好成績のあとの練習効率と、その効き目が続く月数 */
export const EXAM_FAIL_RATE = 0.7
export const EXAM_EXCEL_RATE = 1.2
const EXAM_EFFECT_MONTHS = 2

export function fixedEventFor(month: Month): FixedEvent | undefined {
  return FIXED_EVENTS[month]
}
