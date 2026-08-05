/**
 * 1試合の結果で学校の評判がどれだけ動くか。
 *
 * 以前は勝てば +1、負ければ -1 の固定だった。
 * これだと**誰と戦ったかが評判に関係しない**ので、
 * 弱い相手を選んで勝ち続けるのがいちばん効率の良い立ち回りになる。
 *
 * 相手にも自校と同じ物差しの評価を持たせて、**力の差で振れ幅を変える**。
 * 格上を倒せば一気に名前が売れ、格下に負ければ一気に評判を落とす。
 */

import type { Player } from '@/core/types/player'
import type { Lineup } from '@/core/types/lineup'
import { overallRating } from '@/core/player/rating'

/**
 * 相手チームの平均総合。
 *
 * 相手は `createOpponent` が各学年5人ずつ、`GRADE_BASE`（36/44/50）に
 * `opponentStrength` を足して作る。その平均が (36+44+50)/3 ＝ 43 なので、
 * **43 + 強さ** が相手の総合評価になる。
 * ここが `createPlayer` の `GRADE_BASE` と食い違うと格付けがずれる。
 */
export const OPPONENT_BASE_RATING = 43

export function opponentRating(opponentStrength: number): number {
  return OPPONENT_BASE_RATING + opponentStrength
}

/** 自校の評価。実際に試合に出るスタメンで測る（控えの厚さは勝敗に効かない） */
export function teamRating(players: Player[], lineup: Lineup): number {
  const byId = new Map(players.map((player) => [player.id, player]))
  const starters = lineup.slots
    .map((slot) => byId.get(slot.playerId))
    .filter((player): player is Player => player !== undefined)

  if (starters.length === 0) return OPPONENT_BASE_RATING

  const total = starters.reduce((sum, player) => sum + overallRating(player), 0)
  return total / starters.length
}

/** 力の差がここまで開くと、それ以上は同じ扱いにする */
const GAP_CAP = 30

/**
 * 互角の相手に勝ったときの振れ幅。
 * ここを大きくすると、誰と当たっても勝てば評判が伸びる（＝相手を選ぶ意味が薄れる）。
 */
const WIN_BASE = 1

/**
 * 互角の相手に負けたときの振れ幅。
 *
 * **勝ちの半分にしてある。** 1.0にしていたら、
 * 年に十数試合ある練習試合と大会で負けが込むたびに削られ、
 * 長期プレイで評判が一桁まで落ちて回らなくなった（実測で60年後に7）。
 * 互角の相手に負けるのは普通のことで、評判を失うほどではない。
 */
const LOSS_BASE = 0.4

/** 格上を倒したときの上乗せ（1差あたり） */
const UPSET_RATE = 0.2

/** 格下に負けたときの上乗せ（1差あたり）。勝ちより重くする */
const COLLAPSE_RATE = 0.25

/** 格上に負けたときの割引（1差あたり）。強豪に挑んだこと自体は責められない */
const EXCUSE_RATE = 0.05

/** 負けたときの最小の下げ幅。0にすると「負けても損しない」試合が生まれる */
const MIN_LOSS = 0.2

export type MatchReputationInput = {
  outcome: 'win' | 'lose' | 'draw'
  /** 自校のスタメンの平均総合 */
  ourRating: number
  /** 相手の強さ（0が互角） */
  opponentStrength: number
}

/**
 * 評判の増減を返す。プラスなら上がり、マイナスなら下がる。
 *
 * ここで返すのは素の値。`applyReputation` が
 * 「上に行くほど上がりにくく、下に行くほど下がりにくい」を掛ける。
 */
export function matchReputationDelta(input: MatchReputationInput): number {
  if (input.outcome === 'draw') return 0

  // プラスなら相手が格上
  const gap = clamp(opponentRating(input.opponentStrength) - input.ourRating, -GAP_CAP, GAP_CAP)

  if (input.outcome === 'win') {
    return round1(WIN_BASE + Math.max(0, gap) * UPSET_RATE)
  }

  const loss = LOSS_BASE + Math.max(0, -gap) * COLLAPSE_RATE - Math.max(0, gap) * EXCUSE_RATE
  return -round1(Math.max(MIN_LOSS, loss))
}

/**
 * 表示用の格付け。試合前の確認画面で「格上」と分かるようにする。
 * 判定には使わない。
 */
export function matchupLabel(ourRating: number, opponentStrength: number): string {
  const gap = opponentRating(opponentStrength) - ourRating
  if (gap >= 12) return '格上'
  if (gap >= 4) return 'やや格上'
  if (gap <= -12) return '格下'
  if (gap <= -4) return 'やや格下'
  return '互角'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
