/**
 * 試合での成績による能力の変動。
 *
 * 練習だけで伸びると、試合は「結果を見るだけ」の場面になってしまう。
 * **打った・抑えた選手はその場で伸び、打てなかった選手は落ちる。**
 * 誰を試合に出すかという判断に育成上の意味を持たせる。
 *
 * **引き金は勝敗ではなく、その選手自身の成績。**
 * 以前は勝った試合に上乗せ（1.2倍）していたが、それだと
 * 4タコでも勝ちチームに居れば伸びるし、好投しても味方が打てなければ損をする。
 * チームの勝敗はその選手の出来ではないので、評価に混ぜない。
 *
 * 練習と違って**回数が少ない**（1年に十数試合）ので、
 * 1試合の振れ幅は練習1回より大きくてよい。
 */

import type { Rng } from '@/core/rng/random'
import type { BattingLine, PitchingLine } from '@/core/types/match'
import type { AbilityChange, GrowableKey, Player } from '@/core/types/player'
import { raiseAbility } from './growth'

/**
 * 打撃の点数。
 * 出塁と長打を評価し、**凡打と三振で差し引く**。
 * 4打数0安打2三振なら -2.1 で、はっきりマイナスになる。
 */
const HIT_POINT = 1
const EXTRA_BASE_POINT = 1
const HOMERUN_POINT = 2
const RBI_POINT = 0.6
const STEAL_POINT = 0.8
const WALK_POINT = 0.3
/** 凡打（打数 − 安打）。三振はさらに重ねて引く */
const OUT_MADE_POINT = -0.35
const STRIKEOUT_POINT = -0.25

/** 投球はアウトと奪三振で評価し、失点・被安打・四球で差し引く */
const OUT_POINT = 0.25
const K_POINT = 0.5
const EARNED_RUN_POINT = -0.8
const HIT_ALLOWED_POINT = -0.15
const WALK_ALLOWED_POINT = -0.2

/** これだけの点数で能力が1動く */
const POINTS_PER_STEP = 3

/**
 * 下がるときは緩やかにする。
 * 1試合の不振で積み上げが崩れると、主力を試合に出すこと自体が怖くなる。
 */
const DECLINE_SCALE = 0.55

/** 1試合で下がる上限。伸びる側より狭くする */
const MAX_DECLINE = 2

/**
 * 大会の試合は同じ内容でも得るものが大きい。
 * 負ければ終わりの一発勝負で、しかも相手が強い。
 * **これは勝敗ではなく舞台の格なので、成績を引き金にする方針と矛盾しない。**
 */
export type MatchStage = 'practice' | 'pref' | 'nationals'

const STAGE_MULTIPLIER: Record<MatchStage, number> = {
  practice: 1,
  pref: 1.5,
  nationals: 2,
}

/** 1試合で伸びる上限。大勝したときに一気に完成させないための蓋 */
const STAGE_MAX_STEPS: Record<MatchStage, number> = {
  practice: 3,
  pref: 4,
  nationals: 5,
}

export type MatchGrowthResult = {
  player: Player
  changes: AbilityChange[]
}

/**
 * 1人ぶんの試合後の変動を求める。
 * 出場していなければ（line が両方 undefined なら）何も起きない。
 */
export function applyMatchGrowth(
  rng: Rng,
  player: Player,
  params: {
    batting?: BattingLine
    pitching?: PitchingLine
    /** 練習試合か、大会か。省略すると練習試合 */
    stage?: MatchStage
  },
): MatchGrowthResult {
  if (!params.batting && !params.pitching) return { player, changes: [] }

  const points = performancePoints(params.batting, params.pitching)
  const stage = params.stage ?? 'practice'

  const steps =
    points >= 0
      ? Math.min(
          STAGE_MAX_STEPS[stage],
          rollSteps(rng, (points * STAGE_MULTIPLIER[stage]) / POINTS_PER_STEP),
        )
      : -Math.min(MAX_DECLINE, rollSteps(rng, (-points * DECLINE_SCALE) / POINTS_PER_STEP))

  if (steps === 0) return { player, changes: [] }

  // 変動する能力は**何をした試合か**に寄せる。投げた選手は投手能力、走ったなら走力
  const keys = keysFor(params.batting, params.pitching)
  const delta = steps > 0 ? 1 : -1

  let current = player
  const changes: AbilityChange[] = []

  for (let i = 0; i < Math.abs(steps); i++) {
    const result = raiseAbility(current, rng.pick(keys), delta)
    current = result.player
    if (result.change) changes.push(result.change)
  }

  return { player: current, changes }
}

/**
 * その選手のこの試合の出来。
 * プラスなら伸び、マイナスなら落ちる。
 */
export function performancePoints(batting?: BattingLine, pitching?: PitchingLine): number {
  let points = 0

  if (batting) {
    const extraBases = batting.doubles + batting.triples
    const outsMade = Math.max(0, batting.atBats - batting.hits)
    points += batting.hits * HIT_POINT
    points += extraBases * EXTRA_BASE_POINT
    points += batting.homeruns * HOMERUN_POINT
    points += batting.rbi * RBI_POINT
    points += batting.steals * STEAL_POINT
    points += batting.walks * WALK_POINT
    points += outsMade * OUT_MADE_POINT
    points += batting.strikeouts * STRIKEOUT_POINT
  }

  if (pitching) {
    points += pitching.outs * OUT_POINT
    points += pitching.strikeouts * K_POINT
    points += pitching.earnedRuns * EARNED_RUN_POINT
    points += pitching.hits * HIT_ALLOWED_POINT
    points += pitching.walks * WALK_ALLOWED_POINT
  }

  return points
}

/**
 * 変動する能力の候補。
 * 内容に関係なく全能力が動くと「試合に出しただけ」の成長になるので、
 * **何をした試合か**に寄せる。
 */
function keysFor(batting?: BattingLine, pitching?: PitchingLine): GrowableKey[] {
  const keys: GrowableKey[] = []

  if (pitching && pitching.outs > 0) {
    keys.push('control', 'stamina', 'sharpness')
  }
  if (batting) {
    keys.push('meet', 'power')
    // 長打を放った選手はパワーが、走った選手は走力が動きやすい
    if (batting.doubles + batting.triples + batting.homeruns > 0) keys.push('power')
    if (batting.steals > 0) keys.push('speed')
  }

  // 出場して守っていれば守備も動く
  keys.push('fielding')
  return keys
}

/** 端数は確率で切り上げる（1.4 なら 40% で 2、60% で 1） */
function rollSteps(rng: Rng, value: number): number {
  const floor = Math.floor(value)
  return floor + (rng.chance(value - floor) ? 1 : 0)
}
