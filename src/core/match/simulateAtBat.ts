/**
 * 1打席ぶんの判定。
 *
 * 表示速度とは完全に無関係な純粋関数。
 * 先に試合を全部シミュレートしてから再生する設計のため、
 * ここに演出やタイミングの都合を持ち込まない（README 3.4）。
 */

import type { Rng } from '@/core/rng/random'
import { effectOf } from '@/core/player/personality'
import type { Motivation, Player } from '@/core/types/player'
import { velocityScore } from '@/core/types/player'
import type { PlayResult } from '@/core/types/match'

export type AtBatContext = {
  batter: Player
  pitcher: Player
  /** 守備側チームの守備力（0〜100の目安） */
  defense: number
  /**
   * 守備側が適性を無視して起用している度合い。0なら全員が本職相応。
   * 守備力の低下とは別に、失策と抜ける当たりを増やす。
   */
  misplacement: number
  /** 塁の状況 [一塁, 二塁, 三塁] */
  bases: [boolean, boolean, boolean]
  outs: number
  inning: number
  /** 攻撃側から見た点差。負けていればマイナス */
  scoreDiff: number
  /** 投手の消耗による能力倍率。1.0が万全 */
  pitcherStaminaFactor: number
}

/** やる気による試合での能力倍率 */
const MOTIVATION_FACTOR: Record<Motivation, number> = {
  [-2]: 0.9,
  [-1]: 0.95,
  0: 1,
  1: 1.05,
  2: 1.1,
}

/** 信頼度による倍率。0.95〜1.05 */
function trustFactor(trust: number): number {
  return 0.95 + (trust / 100) * 0.1
}

/**
 * 球威に占める球速の比重。
 *
 * 0.55にしていた頃は、球速が伸びても打たれ方がほとんど変わらず、
 * **球速を上げる意味が薄かった**。速球はそれだけで打者を差し込む。
 */
const VELOCITY_WEIGHT = 0.7

function has(player: Player, skillId: string): boolean {
  return player.skills.includes(skillId)
}

export function simulateAtBat(rng: Rng, ctx: AtBatContext): PlayResult {
  const { batter, pitcher, defense, bases, outs, inning, scoreDiff } = ctx

  // 得点圏に走者がいるか。特殊能力の発動条件になる
  const risp = bases[1] || bases[2]
  const anyRunner = bases[0] || bases[1] || bases[2]
  const lateAndBehind = inning >= 7 && scoreDiff < 0

  // ── 打者 ──────────────────────────────
  const batterBoost = MOTIVATION_FACTOR[batter.motivation] * trustFactor(batter.trust)
  let contact = batter.batting.meet * batterBoost
  let power = batter.batting.power * batterBoost * (1 + (batter.batting.trajectory - 2) * 0.06)
  const batterPersonality = effectOf(batter.personality)
  let eye = batter.batting.meet * 0.5 + 20 + batterPersonality.eye

  // 性格による勝負強さ
  if (risp || lateAndBehind) {
    contact += batterPersonality.clutch
    power += batterPersonality.clutch
  }

  if (has(batter, 'contact-eye')) eye += 18
  if (has(batter, 'chase-swing')) eye -= 18
  if (has(batter, 'power-hitter')) power += 8
  if (risp && has(batter, 'clutch-hitter')) {
    contact += 12
    power += 12
  }
  if (risp && has(batter, 'cold-bat')) {
    contact -= 12
    power -= 12
  }
  if (lateAndBehind && has(batter, 'walk-off')) {
    contact += 12
    power += 12
  }

  // ── 投手 ──────────────────────────────
  const pitching = pitcher.pitching
  const pitcherBoost =
    MOTIVATION_FACTOR[pitcher.motivation] * trustFactor(pitcher.trust) * ctx.pitcherStaminaFactor

  // 投手能力を持たない選手が登板した場合は極端に弱くする
  let stuff = pitching
    ? (velocityScore(pitching.velocity) * VELOCITY_WEIGHT +
        pitching.breaking * (1 - VELOCITY_WEIGHT)) *
      pitcherBoost
    : 20
  let control = pitching ? pitching.control * pitcherBoost : 20
  let strikeoutBonus = 0
  let groundBias = 0

  if (pitching) {
    if (has(pitcher, 'strikeout-king')) strikeoutBonus += 0.06
    if (has(pitcher, 'ground-ball')) groundBias += 0.15
    if (has(pitcher, 'wild-pitch')) control -= 8
    if (anyRunner) {
      if (has(pitcher, 'pinch-strong')) {
        stuff += 10
        control += 10
      }
      if (has(pitcher, 'ace-heart')) {
        stuff += 8
        control += 8
      }
      if (has(pitcher, 'pinch-weak')) {
        stuff -= 10
        control -= 10
      }
    }
  }

  // ── 四球 ──────────────────────────────
  const walkRate = clamp(0.085 + (eye - control) / 700, 0.02, 0.28)
  if (rng.chance(walkRate)) return 'walk'

  // ── 三振 ──────────────────────────────
  const strikeoutRate = clamp(0.16 + (stuff - contact) / 420 + strikeoutBonus, 0.03, 0.5)
  if (rng.chance(strikeoutRate)) return 'strikeout'

  // ── 打球が飛んだ場合 ──────────────────
  // 適性を無視した起用は、まず失策として返ってくる。
  // 遊撃にG適性を置くと 1.0*5 = 5 → +2.5% で失策がほぼ倍になる
  const errorRate = clamp(
    0.028 - (defense - 50) / 1600 + ctx.misplacement * 0.005,
    0.004,
    0.12,
  )
  if (rng.chance(errorRate)) return 'error'

  // 失策にならなくても、守備範囲の狭さぶんヒットが増える
  const hitRate = clamp(
    0.31 +
      (contact * 0.6 + power * 0.4 - stuff * 0.5 - control * 0.3 - defense * 0.2) / 430 +
      ctx.misplacement * 0.004,
    0.12,
    0.58,
  )

  if (rng.chance(hitRate)) {
    return hitType(rng, batter, power)
  }

  return outType(rng, batter, bases, outs, groundBias)
}

/**
 * 安打の種類を決める。
 *
 * **本塁打はパワーと弾道で決まる。** 以前は素の値が0.07あり、
 * パワーの低い打者でも安打の7%が本塁打になっていた。
 * 「能力が低いのに柵越えする」という手触りになるので、
 * 素の値を下げてパワーの効きを強くし、非力な打者はほぼ出ないようにした。
 *
 *   パワー30・弾道1 … ほぼ0（下限0.4%）
 *   パワー50・弾道2 … 安打の4%
 *   パワー80・弾道3 … 安打の13%
 *   パワー95・弾道4 … 安打の19%
 */
function hitType(rng: Rng, batter: Player, power: number): PlayResult {
  const homerunShare = clamp(
    0.03 + (power - 45) / 500 + (batter.batting.trajectory - 2) * 0.03,
    0.004,
    0.35,
  )
  const tripleShare = clamp(0.02 + (batter.batting.speed - 50) / 1200, 0.005, 0.06)
  const doubleShare = 0.2

  return rng.weighted<PlayResult>([
    { value: 'homerun', weight: homerunShare },
    { value: 'triple', weight: tripleShare },
    { value: 'double', weight: doubleShare },
    { value: 'single', weight: Math.max(0.01, 1 - homerunShare - tripleShare - doubleShare) },
  ])
}

/** アウトの種類を決める。併殺・犠飛はここで判定する */
function outType(
  rng: Rng,
  batter: Player,
  bases: [boolean, boolean, boolean],
  outs: number,
  groundBias: number,
): PlayResult {
  const groundShare = clamp(
    0.55 - (batter.batting.trajectory - 2) * 0.12 + groundBias,
    0.2,
    0.85,
  )
  const isGrounder = rng.chance(groundShare)

  if (isGrounder) {
    // 一塁に走者がいて2アウト未満なら併殺の可能性
    if (bases[0] && outs < 2) {
      const doublePlayRate = 0.34 + groundBias
      // 足が速い打者は併殺を免れやすい
      const adjusted = clamp(doublePlayRate - (batter.batting.speed - 50) / 500, 0.1, 0.6)
      if (rng.chance(adjusted)) return 'doublePlay'
    }
    return 'groundout'
  }

  // 三塁に走者がいて2アウト未満なら犠牲フライの可能性
  if (bases[2] && outs < 2 && rng.chance(0.45)) return 'sacFly'
  return 'flyout'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
