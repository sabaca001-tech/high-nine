/**
 * 試合での活躍による成長。
 *
 * 練習だけで伸びると、試合は「結果を見るだけ」の場面になってしまう。
 * **打った・抑えた選手はその場で伸びる**ようにして、
 * 誰を試合に出すかという判断に育成上の意味を持たせる。
 *
 * 練習と違って**回数が少ない**（1年に十数試合）ので、
 * 1試合の伸びは練習1回より大きくてよい。ただし
 * 「出れば必ず伸びる」にはしない。活躍しなければ0のまま。
 */

import type { Rng } from '@/core/rng/random'
import type { BattingLine, PitchingLine } from '@/core/types/match'
import type { AbilityChange, GrowableKey, Player } from '@/core/types/player'
import { raiseAbility } from './growth'

/**
 * 活躍度から伸びる能力の点数を決めるための係数。
 *
 * 打撃は「安打1本＝1点、長打・打点・盗塁は加点」で数え、
 * その合計を成長量に換算する。
 */
const HIT_POINT = 1
const EXTRA_BASE_POINT = 1
const HOMERUN_POINT = 2
const RBI_POINT = 0.6
const STEAL_POINT = 0.8

/** 投球は「アウトを取った数」と「三振」で数え、失点で差し引く */
const OUT_POINT = 0.25
const STRIKEOUT_POINT = 0.5
const EARNED_RUN_POINT = -0.8

/** これだけの点数で能力が1上がる */
const POINTS_PER_STEP = 3

/** 1試合で伸びる上限。大勝したときに一気に完成させないための蓋 */
const MAX_STEPS = 3

/** 勝った試合はよく身につく */
const WIN_BONUS = 1.2

/**
 * 大会の試合は練習試合より得るものが大きい。
 *
 * 負ければ終わりの一発勝負で、しかも相手が強い。
 * 同じ4安打でも、練習試合と県大会の準決勝では意味が違う。
 * ここを1.0のままにしていたので、**大会が「結果を見るだけ」の場面**になっていた。
 */
export type MatchStage = 'practice' | 'pref' | 'nationals'

const STAGE_MULTIPLIER: Record<MatchStage, number> = {
  practice: 1,
  pref: 1.5,
  nationals: 2,
}

/** 1試合で伸びる上限も大会では緩める */
const STAGE_MAX_STEPS: Record<MatchStage, number> = {
  practice: MAX_STEPS,
  pref: 4,
  nationals: 5,
}

export type MatchGrowthResult = {
  player: Player
  changes: AbilityChange[]
}

/**
 * 1人ぶんの試合後の成長を求める。
 * 出場していなければ（line が両方 undefined なら）何も起きない。
 */
export function applyMatchGrowth(
  rng: Rng,
  player: Player,
  params: {
    batting?: BattingLine
    pitching?: PitchingLine
    won: boolean
    /** 今日のヒーローに選ばれたか */
    mvp: boolean
    /** 練習試合か、大会か。省略すると練習試合 */
    stage?: MatchStage
  },
): MatchGrowthResult {
  const points = performancePoints(params.batting, params.pitching)
  if (points <= 0) return { player, changes: [] }

  const stage = params.stage ?? 'practice'
  const scaled =
    points * (params.won ? WIN_BONUS : 1) * (params.mvp ? 1.3 : 1) * STAGE_MULTIPLIER[stage]
  const steps = Math.min(STAGE_MAX_STEPS[stage], rollSteps(rng, scaled / POINTS_PER_STEP))
  if (steps <= 0) return { player, changes: [] }

  // 活躍した内容に近い能力が伸びる。投げて勝ったなら投手能力
  const keys = keysFor(params.batting, params.pitching)

  let current = player
  const changes: AbilityChange[] = []

  for (let i = 0; i < steps; i++) {
    const key = rng.pick(keys)
    const result = raiseAbility(current, key, 1)
    current = result.player
    if (result.change) changes.push(result.change)
  }

  return { player: current, changes }
}

/** 活躍度の点数。0以下なら成長しない */
function performancePoints(batting?: BattingLine, pitching?: PitchingLine): number {
  let points = 0

  if (batting) {
    const extraBases = batting.doubles + batting.triples
    points += batting.hits * HIT_POINT
    points += extraBases * EXTRA_BASE_POINT
    points += batting.homeruns * HOMERUN_POINT
    points += batting.rbi * RBI_POINT
    points += batting.steals * STEAL_POINT
  }

  if (pitching) {
    points += pitching.outs * OUT_POINT
    points += pitching.strikeouts * STRIKEOUT_POINT
    points += pitching.earnedRuns * EARNED_RUN_POINT
  }

  return points
}

/**
 * 伸びる能力の候補。
 * 内容に関係なく全能力が伸びると「試合に出しただけ」の成長になるので、
 * **何で活躍したか**に寄せる。
 */
function keysFor(batting?: BattingLine, pitching?: PitchingLine): GrowableKey[] {
  const keys: GrowableKey[] = []

  if (pitching && pitching.outs > 0) {
    keys.push('control', 'stamina', 'breaking')
  }
  if (batting) {
    keys.push('meet', 'power')
    // 長打を放った選手はパワーが、走った選手は走力が伸びやすい
    if (batting.doubles + batting.triples + batting.homeruns > 0) keys.push('power')
    if (batting.steals > 0) keys.push('speed')
  }

  // 出場して守っていれば守備も少しは身につく
  keys.push('fielding')
  return keys
}

/** 端数は確率で切り上げる（1.4 なら 40% で 2、60% で 1） */
function rollSteps(rng: Rng, value: number): number {
  const floor = Math.floor(value)
  return floor + (rng.chance(value - floor) ? 1 : 0)
}
