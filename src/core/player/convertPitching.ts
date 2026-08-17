/**
 * 野手が投手へ本職転向したときの投球能力。
 *
 * **持たないまま投手にしてはいけない。** `Player` は
 * 「`isPitcher` なら `pitching` が必ずある」という前提で書かれていて、
 * 投球能力が無い投手が登板すると極端に弱い扱いになる（`simulateAtBat`）。
 *
 * 何を投げるかは分からないので**ランダムに決める**。
 * ただし球速だけは肩力から導く。
 * 肩の強い外野手が、マウンドに上がった途端に球が遅いのは不自然で、
 * そもそも「肩が強いから投手に」という判断ができなくなる。
 */

import type { Rng } from '@/core/rng/random'
import type { PitchingAbilities, Player } from '@/core/types/player'
import { VELOCITY_MAX, VELOCITY_MIN } from '@/core/types/player'
import { rollInitialPitches } from './pitchDefs'

/**
 * 肩力から見込める球速。
 *
 * `armFromVelocity`（58 + 球速スコア×0.55）の逆算。
 * 肩力80なら球速スコア40、つまり135km/h あたりが目安になる。
 * **切片は `ARM_BASE` と揃える。** ずれると、肩の強い野手が
 * マウンドに上がった途端にありえない球速になる。
 */
function velocityFromArm(arm: number): number {
  const score = Math.max(0, (arm - 58) / 0.55)
  // velocityScore の刻み（実際に投げる帯では 10点＝5km/h）で戻す
  return 115 + score * 0.5
}

/**
 * 転向したての投手の球速の割引。
 *
 * 投げ方を一から覚えるので、肩の強さがそのまま球速にはならない。
 * ここを1.0にすると、肩力Aの外野手がいきなり147km/hで投げ始める。
 */
const ROOKIE_VELOCITY_PENALTY = 8

/** 転向したての制球・スタミナ・キレの水準 */
const ROOKIE_MIN = 18
const ROOKIE_MAX = 42

/** 野手が投手になったときの投球能力を作る */
export function rollPitchingFor(rng: Rng, player: Player): PitchingAbilities {
  const velocity = clamp(
    Math.round(
      velocityFromArm(player.batting.arm) - ROOKIE_VELOCITY_PENALTY + rng.int(-3, 3),
    ),
    VELOCITY_MIN,
    VELOCITY_MAX,
  )
  const sharpness = rng.int(ROOKIE_MIN, ROOKIE_MAX)

  return {
    velocity,
    control: rng.int(ROOKIE_MIN, ROOKIE_MAX),
    stamina: rng.int(ROOKIE_MIN, ROOKIE_MAX),
    // ノビは投げ込んだ年月で身につくもの。転向したてなら低い
    life: rng.int(ROOKIE_MIN, ROOKIE_MAX),
    sharpness,
    pitches: rollInitialPitches(rng, sharpness),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
