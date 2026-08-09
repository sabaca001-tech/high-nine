import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createPlayer } from './createPlayer'
import { overallRating, toRank, trajectoryAngle } from './rating'

describe('toRank', () => {
  it('境界値が正しくランク分けされる', () => {
    expect(toRank(100)).toBe('S')
    expect(toRank(90)).toBe('S')
    expect(toRank(89)).toBe('A')
    expect(toRank(80)).toBe('A')
    expect(toRank(79)).toBe('B')
    expect(toRank(70)).toBe('B')
    expect(toRank(69)).toBe('C')
    expect(toRank(60)).toBe('C')
    expect(toRank(59)).toBe('D')
    expect(toRank(50)).toBe('D')
    expect(toRank(49)).toBe('E')
    expect(toRank(40)).toBe('E')
    expect(toRank(39)).toBe('F')
    expect(toRank(25)).toBe('F')
    expect(toRank(24)).toBe('G')
    expect(toRank(1)).toBe('G')
  })
})

describe('trajectoryAngle', () => {
  it('弾道を打球の角度で表す', () => {
    // **打球が下に飛ぶことは無い。** 1は水平から始める
    expect(trajectoryAngle(1)).toBe(0)
    expect(trajectoryAngle(3)).toBe(45)
    expect(trajectoryAngle(4)).toBe(65)
  })

  it('弾道が上がるほど角度も上がる', () => {
    for (let value = 1; value < 4; value++) {
      expect(trajectoryAngle(value + 1)).toBeGreaterThan(trajectoryAngle(value))
    }
  })

  it('真上には向けない（真上はポップフライで良い打球ではない）', () => {
    expect(trajectoryAngle(4)).toBeLessThan(90)
  })

  it('範囲外でも落ちない', () => {
    expect(trajectoryAngle(0)).toBe(0)
  })
})

describe('overallRating', () => {
  it('野手・投手ともに0〜100に収まる', () => {
    const rng = createRng(2026)
    for (let i = 0; i < 200; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 2 })
      const rating = overallRating(player)
      expect(rating).toBeGreaterThanOrEqual(0)
      expect(rating).toBeLessThanOrEqual(100)
    }
  })

  it('能力が高い選手ほど評価が高い', () => {
    const rng = createRng(7)
    const weak = createPlayer(rng, { id: 'weak', grade: 1, isPitcher: false, talentBonus: -15 })
    const strong = createPlayer(rng, { id: 'strong', grade: 3, isPitcher: false, talentBonus: 30 })
    expect(overallRating(strong)).toBeGreaterThan(overallRating(weak))
  })
})
