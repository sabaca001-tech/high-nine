import { describe, expect, it } from 'vitest'
import type { PitchingAbilities } from '@/core/types/player'
import { breakingScore, straightScore, stuffScore } from './simulateAtBat'

const base: PitchingAbilities = {
  velocity: 140,
  control: 60,
  stamina: 60,
  life: 50,
  sharpness: 50,
  pitches: [],
}

describe('ノビ（life）', () => {
  it('ストレートの威力に効く', () => {
    expect(straightScore({ ...base, life: 90 })).toBeGreaterThan(straightScore(base))
    expect(straightScore({ ...base, life: 10 })).toBeLessThan(straightScore(base))
  })

  it('球速が同じでも球威が変わる', () => {
    expect(stuffScore({ ...base, life: 90 })).toBeGreaterThan(stuffScore({ ...base, life: 10 }))
  })

  it('速い球のほうがノビの効きも大きい（掛け算なので）', () => {
    // 足し算にすると、球の遅い投手がノビだけで速球投手に並んでしまう
    const slowGain =
      straightScore({ ...base, velocity: 125, life: 90 }) -
      straightScore({ ...base, velocity: 125, life: 10 })
    const fastGain =
      straightScore({ ...base, velocity: 155, life: 90 }) -
      straightScore({ ...base, velocity: 155, life: 10 })
    expect(fastGain).toBeGreaterThan(slowGain)
  })
})

describe('キレ（sharpness）', () => {
  it('変化球の効きそのもの', () => {
    // 「変化球（曲がる量）」と2つ持っていたのをやめて1つにした。
    // 曲がる量は持ち球の変化量（`Pitch.level`）が表す
    expect(breakingScore({ ...base, sharpness: 90 })).toBeGreaterThan(breakingScore(base))
    expect(breakingScore({ ...base, sharpness: 90 })).toBe(90)
  })

  it('球威に効く', () => {
    expect(stuffScore({ ...base, sharpness: 90 })).toBeGreaterThan(
      stuffScore({ ...base, sharpness: 10 }),
    )
  })
})

describe('球威の基準', () => {
  it('ノビが50なら、足す前と同じ球速の重みになる', () => {
    // **中央を等倍にしてある。** ここがずれると、ノビを足しただけで
    // 投手全体が強く（弱く）なり、打率も一緒に動いてしまう
    expect(straightScore(base)).toBeCloseTo(50, 6)
  })
})
