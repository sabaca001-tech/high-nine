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

import type { MatchStage } from '@/core/player/matchGrowth'
import type { Player } from '@/core/types/player'
import { rosterTalentOf } from '@/core/rival/rivalRoster'
import type { Lineup } from '@/core/types/lineup'
import { overallRating } from '@/core/player/rating'

/**
 * 学校の戦力が0（互角）のときの、**スタメン9人の平均総合**。
 *
 * 比べる相手は自校の `teamRating`（スタメン9人の平均）なので、
 * こちらもスタメンで測らないと格付けがずれる。
 *
 * 以前は「部員全体の平均（43）＋ 戦力」で見ていた。
 * 実際の名簿は `rivalRoster` が戦力の55%を素質に足して作るので、
 * **強い学校ほど過大評価**になっていた
 * （戦力35の学校を総合78と見ていたが、実際のスタメン平均は68）。
 */
export const OPPONENT_BASE_RATING = 46.5

/**
 * 相手チームのスタメンの平均総合。
 *
 * **戦力に比例させない。** 学校の力が選手の素質に変わるところで
 * 上ほど詰まる（`rosterTalentOf`）ので、比例で見ると強豪を過大評価する。
 * 素質1ぶんがスタメン平均1に相当する（578校の実測で確かめた）。
 *
 * | 戦力 | 0 | 10 | 20 | 30 | 55 |
 * |---|---|---|---|---|---|
 * | 実測 | 46.5 | 52.4 | 57.7 | 62.8 | 70.2 |
 * | この式 | 46.5 | 52.0 | 57.5 | 63.0 | 70.0 |
 */
export function opponentRating(opponentStrength: number): number {
  return OPPONENT_BASE_RATING + rosterTalentOf(opponentStrength)
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
 * 一度1.0にしたら、年に十数試合ある練習試合で負けが込むたびに削られ、
 * 長期プレイで評判が一桁まで落ちて回らなくなった（実測で60年後に7）。
 * そこで0.4まで下げていたが、今度は**一度上がった評判が落ちなくなった**。
 *
 * 問題は「負けが重い」ことではなく、**どの負けも同じ重さ**だったこと。
 * いまは舞台で重みを変える（`STAGE_WEIGHT`）ので、
 * 練習試合の1敗は 0.9 × 0.4 ＝ 0.36 と以前のまま、
 * 大会の1敗はその3倍効く。
 */
const LOSS_BASE = 0.9

/** 格上を倒したときの上乗せ（1差あたり） */
const UPSET_RATE = 0.2

/**
 * 格下に負けたときの上乗せ（1差あたり）。勝ちより重くする。
 *
 * **0.25は重すぎた。** 強くなるほど相手との差が開くので、
 * 1敗の代償が -5 を超える一方、勝ちはずっと +1 のまま。
 * 結果として**強くなるほど評判が上がりにくくなる**という逆転が起きていて、
 * B（強豪校・64）を保つのに格下相手で9割の勝率が要った。
 */
const COLLAPSE_RATE = 0.15

/**
 * 1敗で失う上限。
 *
 * 差がどれだけ開いても、1試合落としただけで学校の評価が
 * ひっくり返るようなことにはしない。
 */
const MAX_LOSS = 4

/**
 * 舞台ごとの重み。**練習試合は増えも減りもわずか。**
 *
 * どの試合も同じ重さだった頃は、評判の増減が
 * 「年に十数回ある練習試合」の積み重ねでほとんど決まっていた。
 * 学校の評判は**大会でどこまで勝ったか**で決まるものなので、
 * 練習試合はそのための調整という位置づけにする。
 */
const STAGE_WEIGHT: Record<MatchStage, number> = {
  practice: 0.4,
  pref: 1.2,
  nationals: 1.5,
}

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
  /** どの舞台の試合か。省略すると練習試合 */
  stage?: MatchStage
}

/**
 * 評判の増減を返す。プラスなら上がり、マイナスなら下がる。
 *
 * ここで返すのは素の値。`applyReputation` が
 * 「上に行くほど上がりにくく、下に行くほど下がりにくい」を掛ける。
 */
export function matchReputationDelta(input: MatchReputationInput): number {
  if (input.outcome === 'draw') return 0

  const weight = STAGE_WEIGHT[input.stage ?? 'practice']
  // プラスなら相手が格上
  const gap = clamp(opponentRating(input.opponentStrength) - input.ourRating, -GAP_CAP, GAP_CAP)

  if (input.outcome === 'win') {
    // 格上を倒せば大きい。格下に勝っても、勝ち続けること自体は評価する
    return round1((WIN_BASE + Math.max(0, gap) * UPSET_RATE) * weight)
  }

  const loss = LOSS_BASE + Math.max(0, -gap) * COLLAPSE_RATE - Math.max(0, gap) * EXCUSE_RATE
  return -round1(Math.min(MAX_LOSS, Math.max(MIN_LOSS, loss)) * weight)
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
